import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CardType, Identity, Suit } from '../types';
import type { Card, Player } from '../types';
import type { GameSave } from '../src/game/save';
import { SAVE_KEY, SAVE_VERSION } from '../src/game/save';
import { card, player } from './helpers';

/**
 * 最小 localStorage 实现（不引入 jsdom）：
 * save.ts 只用到 getItem / setItem / removeItem，用这个 stub 注入即可覆盖全部路径。
 */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  readonly length: number;
  key(index: number): string | null;
}

function createLocalStorageStub(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => void map.clear(),
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
}

/** 安装到 globalThis.localStorage，并返回同一个 stub */
function installLocalStorage(): StorageLike {
  const stub = createLocalStorageStub();
  (globalThis as { localStorage?: StorageLike }).localStorage = stub;
  return stub;
}

// save.ts 在模块作用域持有 saveRejected 状态，每次用 vi.resetModules 拿干净实例
async function loadSaveModule() {
  vi.resetModules();
  return import('../src/game/save');
}

function mkSave(over: Partial<GameSave> = {}): GameSave {
  const players: Player[] = [
    player({ id: 0, isHuman: true, identity: Identity.ZHUGONG }),
    player({ id: 1, identity: Identity.ZHONGCHEN }),
    player({ id: 2, identity: Identity.FANZEI }),
    player({ id: 3, identity: Identity.NEIJIAN }),
    player({ id: 4, identity: Identity.ZHONGCHEN }),
  ];
  return {
    v: SAVE_VERSION,
    ts: 1_700_000_000_000,
    playerCount: 5,
    players,
    deck: [card()],
    discardPile: [],
    turnIndex: 0,
    logs: [],
    ...over,
  };
}

let storage: StorageLike;

beforeEach(() => {
  storage = installLocalStorage();
});

describe('存档常量', () => {
  test('SAVE_KEY 与 SAVE_VERSION 是稳定契约（改动会让老存档失效）', async () => {
    const m = await loadSaveModule();
    expect(m.SAVE_KEY).toBe('sgs-save-v1');
    expect(m.SAVE_VERSION).toBe(1);
  });
});

describe('writeSave', () => {
  test('成功写入返回 true，且 key 与 JSON 结构正确', async () => {
    const { writeSave } = await loadSaveModule();
    const s = mkSave();
    expect(writeSave(s)).toBe(true);
    const raw = storage.getItem(SAVE_KEY);
    expect(raw).toBeTypeOf('string');
    expect(JSON.parse(raw as string)).toEqual(s);
  });

  test('写入的是可被 JSON 往返的纯数据（无 undefined 字段丢失以外的变化）', async () => {
    const { writeSave } = await loadSaveModule();
    const s = mkSave();
    writeSave(s);
    const parsed = JSON.parse(storage.getItem(SAVE_KEY) as string) as GameSave;
    expect(parsed.v).toBe(SAVE_VERSION);
    expect(parsed.ts).toBe(s.ts);
    expect(parsed.playerCount).toBe(5);
    expect(parsed.players).toHaveLength(5);
    expect(parsed.turnIndex).toBe(0);
    expect(Array.isArray(parsed.deck)).toBe(true);
    expect(Array.isArray(parsed.discardPile)).toBe(true);
    expect(Array.isArray(parsed.logs)).toBe(true);
  });

  test('localStorage 抛错（配额）时返回 false 而不抛异常', async () => {
    const { writeSave } = await loadSaveModule();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(writeSave(mkSave())).toBe(false);
  });

  test('覆盖写：后写的内容替换先写的内容', async () => {
    const { writeSave } = await loadSaveModule();
    writeSave(mkSave({ turnIndex: 1 }));
    writeSave(mkSave({ turnIndex: 2 }));
    expect((JSON.parse(storage.getItem(SAVE_KEY) as string) as GameSave).turnIndex).toBe(2);
  });
});

describe('readSave', () => {
  test('没有存档时返回 null', async () => {
    const { readSave } = await loadSaveModule();
    expect(readSave()).toBeNull();
  });

  test('写后能原样读回（结构等价）', async () => {
    const { readSave, writeSave } = await loadSaveModule();
    const s = mkSave({ turnIndex: 3 });
    writeSave(s);
    expect(readSave()).toEqual(s);
  });

  test('版本号不匹配返回 null（v2 的存档不会被 v1 读取）', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...mkSave(), v: 2 }));
    expect(readSave()).toBeNull();
  });

  test('版本号缺失返回 null', async () => {
    const { readSave } = await loadSaveModule();
    const s = mkSave() as Partial<GameSave>;
    delete s.v;
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(readSave()).toBeNull();
  });

  test('非法 JSON 返回 null 而不抛异常', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, '{not json');
    expect(readSave()).toBeNull();
  });

  test('players 少于 5 人返回 null', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify(mkSave({ players: [player({ id: 0, isHuman: true })] })));
    expect(readSave()).toBeNull();
  });

  test('players 不是数组返回 null', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...mkSave(), players: 'nope' }));
    expect(readSave()).toBeNull();
  });

  test('没有人类玩家返回 null', async () => {
    const { readSave } = await loadSaveModule();
    const players = mkSave().players.map(p => ({ ...p, isHuman: false }));
    storage.setItem(SAVE_KEY, JSON.stringify(mkSave({ players })));
    expect(readSave()).toBeNull();
  });

  test('deck 不是数组返回 null', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...mkSave(), deck: {} }));
    expect(readSave()).toBeNull();
  });

  test('turnIndex 越界（>= players.length）返回 null', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify(mkSave({ turnIndex: 5 })));
    expect(readSave()).toBeNull();
  });

  test('turnIndex 为负返回 null', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify(mkSave({ turnIndex: -1 })));
    expect(readSave()).toBeNull();
  });

  test('turnIndex 非数字返回 null', async () => {
    const { readSave } = await loadSaveModule();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...mkSave(), turnIndex: '1' }));
    expect(readSave()).toBeNull();
  });

  test('已结束的对局（人类阵亡）返回 null 并清掉存档', async () => {
    const { readSave } = await loadSaveModule();
    const s = mkSave();
    s.players[0] = { ...s.players[0], isDead: true };
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(readSave()).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  test('已结束的对局（人类存活但主公阵亡）同样被清除', async () => {
    const { readSave } = await loadSaveModule();
    // 人类是忠臣、主公是另一名角色：人类还活着，但主公已死 → 局已结束
    const s = mkSave();
    s.players[0] = { ...s.players[0], identity: Identity.ZHONGCHEN, isDead: false };
    s.players[2] = { ...s.players[2], identity: Identity.ZHUGONG, isDead: true };
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(readSave()).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('clearSave', () => {
  test('清除后 readSave 返回 null', async () => {
    const { clearSave, readSave, writeSave } = await loadSaveModule();
    writeSave(mkSave());
    expect(readSave()).not.toBeNull();
    clearSave();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(readSave()).toBeNull();
  });

  test('存档不存在时清除不抛异常', async () => {
    const { clearSave } = await loadSaveModule();
    expect(() => clearSave()).not.toThrow();
  });

  test('localStorage.removeItem 抛错时被吞掉', async () => {
    const { clearSave } = await loadSaveModule();
    storage.removeItem = () => {
      throw new Error('denied');
    };
    expect(() => clearSave()).not.toThrow();
  });
});

describe('isSaveFinished', () => {
  test('人类存活 + 主公存活 + 反贼存活 → 未结束', async () => {
    const { isSaveFinished } = await loadSaveModule();
    expect(isSaveFinished(mkSave())).toBe(false);
  });

  test('人类阵亡 → 已结束', async () => {
    const { isSaveFinished } = await loadSaveModule();
    const s = mkSave();
    s.players[0] = { ...s.players[0], isDead: true };
    expect(isSaveFinished(s)).toBe(true);
  });

  test('没有人类玩家 → 已结束', async () => {
    const { isSaveFinished } = await loadSaveModule();
    const s = mkSave({ players: mkSave().players.map(p => ({ ...p, isHuman: false })) });
    expect(isSaveFinished(s)).toBe(true);
  });

  test('没有主公 → 已结束', async () => {
    const { isSaveFinished } = await loadSaveModule();
    const s = mkSave({ players: mkSave().players.map(p => ({ ...p, identity: Identity.ZHONGCHEN })) });
    expect(isSaveFinished(s)).toBe(true);
  });

  test('反贼清空且内奸阵亡 → 已结束；内奸仍存活 → 未结束', async () => {
    const { isSaveFinished } = await loadSaveModule();
    const base = mkSave();
    const noRebels = base.players.map(p => (p.identity === Identity.FANZEI ? { ...p, isDead: true } : p));
    expect(isSaveFinished({ ...base, players: noRebels })).toBe(false);

    const noSpy = noRebels.map(p => (p.identity === Identity.NEIJIAN ? { ...p, isDead: true } : p));
    expect(isSaveFinished({ ...base, players: noSpy })).toBe(true);
  });

  test('没有内奸身份且反贼清空 → 已结束', async () => {
    const { isSaveFinished } = await loadSaveModule();
    const base = mkSave();
    const players = base.players
      .filter(p => p.identity !== Identity.NEIJIAN)
      .map(p => (p.identity === Identity.FANZEI ? { ...p, isDead: true } : p));
    expect(isSaveFinished({ ...base, players })).toBe(true);
  });
});

describe('consumeSaveRejected', () => {
  test('初始为 false', async () => {
    const { consumeSaveRejected } = await loadSaveModule();
    expect(consumeSaveRejected()).toBe(false);
  });

  test('读到已结束的存档后置为 true，且只消费一次', async () => {
    const { consumeSaveRejected, readSave } = await loadSaveModule();
    const s = mkSave();
    s.players[0] = { ...s.players[0], isDead: true };
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    readSave();
    expect(consumeSaveRejected()).toBe(true);
    expect(consumeSaveRejected()).toBe(false);
  });
});

describe('存档往返保持卡牌字段', () => {
  test('牌名/花色/点数/属性在 JSON 往返后不变', async () => {
    const { readSave, writeSave } = await loadSaveModule();
    const fireSha: Card = card({ type: CardType.BASIC, suit: Suit.HEART, rank: '4', attribute: 'fire' });
    const s = mkSave();
    s.players[1] = { ...s.players[1], hand: [fireSha] };
    s.deck = [card({ suit: Suit.SPADE, rank: 'A' })];
    writeSave(s);
    const back = readSave();
    expect(back).not.toBeNull();
    expect(back?.players[1].hand[0]).toEqual(fireSha);
    expect(back?.deck[0]).toEqual(s.deck[0]);
  });

  test('stub 的 length/key 行为符合 localStorage 语义（自检）', () => {
    const s = createLocalStorageStub();
    s.setItem('a', '1');
    s.setItem('b', '2');
    expect(s.length).toBe(2);
    expect(s.key(0)).toBe('a');
    expect(s.key(99)).toBeNull();
    s.clear();
    expect(s.length).toBe(0);
  });
});
