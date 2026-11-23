import { describe, expect, it, beforeEach } from 'vitest';

/**
 * Node 测试环境没有 localStorage，装一个最小 stub（与 tests/save.test.ts 同款）。
 * save.ts 只用到 getItem / setItem / removeItem，这个 stub 足以覆盖全部路径。
 */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
  get length() { return store.size; },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
};
import {
  SAVE_KEY, SAVE_VERSION, validateSave, serializeSave, saveFileName,
  importSave, readSave, writeSave, clearSave, isSaveFinished,
} from '../src/game/save';
import { Identity } from '../types';

/**
 * 存档导入/导出守卫。
 *
 * 原存档只在 localStorage —— APK 的 WebView 数据一清就没了、换机带不走，
 * 对单机游戏是硬伤。现在支持导出 JSON 备份 / 从 JSON 恢复。
 *
 * 重点：导入与「继续上一局」必须走**完全相同**的校验（validateSave），
 * 否则两份逻辑漂移，导入一个畸形存档能把游戏搞崩。
 */

const mkSave = (over: Record<string, unknown> = {}) => ({
  v: SAVE_VERSION,
  ts: Date.parse('2026-11-20T10:30:00Z'),
  playerCount: 5 as const,
  players: [
    { id: 0, name: '我', isHuman: true, isDead: false, identity: Identity.ZHUGONG },
    { id: 1, name: '甲', isHuman: false, isDead: false, identity: Identity.FANZEI },
    { id: 2, name: '乙', isHuman: false, isDead: false, identity: Identity.FANZEI },
    { id: 3, name: '丙', isHuman: false, isDead: false, identity: Identity.FANZEI },
    { id: 4, name: '丁', isHuman: false, isDead: false, identity: Identity.NEIJIAN },
  ],
  deck: [{ id: 'c1', name: '杀' }],
  discardPile: [],
  turnIndex: 0,
  logs: [],
  ...over,
});

describe('存档导入/导出', () => {
  beforeEach(() => {
    store.clear();
  });

  it('序列化后能被校验还原，内容无损', () => {
    const s = mkSave();
    const restored = validateSave(serializeSave(s as never));
    expect(restored).not.toBe(null);
    expect(restored!.turnIndex).toBe(0);
    expect(restored!.players).toHaveLength(5);
    expect(restored!.deck).toHaveLength(1);
  });

  it('导出文件名带日期时间，且多次导出不重名', () => {
    const a = saveFileName(mkSave() as never);
    const b = saveFileName(mkSave({ ts: Date.parse('2026-11-21T11:45:00Z') }) as never);
    expect(a).toMatch(/^sanguosha-save-\d{8}-\d{4}\.json$/);
    expect(a).not.toBe(b);
  });

  it('畸形 / 版本不符 / 缺字段的存档一律拒绝', () => {
    expect(validateSave(null)).toBe(null);
    expect(validateSave('这不是 JSON')).toBe(null);
    expect(validateSave(JSON.stringify(mkSave({ v: 999 })))).toBe(null);
    expect(validateSave(JSON.stringify(mkSave({ players: [] })))).toBe(null);
    // 4 人局（人数不足 5）必须拒绝，哪怕其它字段都合法 ——
    // 这条专打「去掉人数校验」的变异：只靠「缺 isHuman」那条兜底会漏掉它
    expect(validateSave(JSON.stringify(mkSave({ players: mkSave().players.slice(0, 4) })))).toBe(null);
    expect(validateSave(JSON.stringify(mkSave({ deck: null })))).toBe(null);
    expect(validateSave(JSON.stringify(mkSave({ turnIndex: -1 })))).toBe(null);
    expect(validateSave(JSON.stringify(mkSave({ turnIndex: 99 })))).toBe(null);
  });

  it('导入成功后写入存档槽，readSave 能读到', () => {
    const s = mkSave();
    expect(importSave(serializeSave(s as never))).toBe('ok');
    const loaded = readSave();
    expect(loaded).not.toBe(null);
    expect(loaded!.players[0].isHuman).toBe(true);
  });

  it('导入会覆盖旧存档', () => {
    writeSave(mkSave({ turnIndex: 0 }) as never);
    importSave(serializeSave(mkSave({ turnIndex: 2 }) as never));
    expect(readSave()!.turnIndex).toBe(2);
  });

  it('已结束的对局不能被导入（否则会进入无人可控的自走棋）', () => {
    // 保留 5 人（校验要求），只把人类设为阵亡 → isSaveFinished 判定为已结束
    const finished = mkSave({
      players: [
        { id: 0, name: '我', isHuman: true, isDead: true, identity: Identity.ZHUGONG },
        { id: 1, name: '甲', isHuman: false, isDead: false, identity: Identity.FANZEI },
        { id: 2, name: '乙', isHuman: false, isDead: false, identity: Identity.FANZEI },
        { id: 3, name: '丙', isHuman: false, isDead: false, identity: Identity.FANZEI },
        { id: 4, name: '丁', isHuman: false, isDead: false, identity: Identity.NEIJIAN },
      ],
    });
    expect(isSaveFinished(finished as never)).toBe(true);
    expect(importSave(serializeSave(finished as never))).toBe('finished');
    expect(localStorage.getItem(SAVE_KEY)).toBe(null);
  });

  it('无效文件不改变现有存档', () => {
    writeSave(mkSave({ turnIndex: 1 }) as never);
    expect(importSave('坏文件')).toBe('invalid');
    expect(readSave()!.turnIndex).toBe(1);
  });

  it('原生桥不存在时写档正常（网页版 / e2e 不受影响）', () => {
    delete (globalThis as { SGSNativeSave?: unknown }).SGSNativeSave;
    expect(writeSave(mkSave() as never)).toBe(true);
    expect(readSave()).not.toBe(null);
  });

  it('原生桥存在时同步备份，且备份内容与 localStorage 一致', () => {
    const calls: string[] = [];
    (globalThis as { SGSNativeSave?: unknown }).SGSNativeSave = {
      backupSave: (json: string) => calls.push(json),
    };
    const s = mkSave({ turnIndex: 3 });
    expect(writeSave(s as never)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]).turnIndex).toBe(3);
    expect(calls[0]).toBe(localStorage.getItem(SAVE_KEY));
    delete (globalThis as { SGSNativeSave?: unknown }).SGSNativeSave;
  });

  it('clearSave 后读不到存档', () => {
    writeSave(mkSave() as never);
    expect(readSave()).not.toBe(null);
    clearSave();
    expect(readSave()).toBe(null);
  });
});
