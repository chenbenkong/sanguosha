import { describe, expect, it } from 'vitest';
import { drawnFor, makeHarness, mkPlayer } from './testHarness';
import { dispatchTurnEnd, dispatchTurnStart } from './dispatch';
import { skillsOf } from './registry';
import './batch6new10';

/**
 * 来莺儿「绡舞」的行为测试。
 *
 * 断言的是**规则**：链条从哪开始、到哪结束、谁摸牌、多数派怎么判、平局怎么办、
 * 「限一次」在哪里复位。正例与反例成对出现——只测正例等于没测边界。
 *
 * 本组另外 5 个技能（彩翼 / 归离 / 幸宠 / 流年 / 化萍）因缺引擎原语未实装，
 * 本文件不含它们的任何断言（它们仍在 skillCoverage.test.ts 的 LEGACY_INLINE 里）。
 */

/**
 * 脚本化弹窗：按问题形状分辨三处提问。
 *   方向选择  mode 'choose'，选项 id 为 next / prev
 *   终止角色  mode 'target'
 *   角色选择  mode 'choose'，选项里含 you / self
 * 没在参数里指定的那一处一律答「取消」，用来测取消路径。
 */
const scripted = (o: {
  dir?: 'next' | 'prev' | 'cancel';
  stop?: number | 'last' | 'cancel';
  mine?: boolean;
}) => async (req: any) => {
  const ids = (req.choices ?? []).map((c: { id: string }) => c.id);
  if (req.mode === 'choose' && ids.includes('you')) {
    return { kind: 'choose', id: o.mine ? 'you' : 'self' };
  }
  if (req.mode === 'choose') {
    if (!o.dir || o.dir === 'cancel') return { kind: 'cancel' };
    return { kind: 'choose', id: o.dir };
  }
  if (req.mode === 'target') {
    if (o.stop === undefined || o.stop === 'cancel') return { kind: 'cancel' };
    const ts: Array<{ id: number }> = req.targets ?? [];
    return { kind: 'target', ids: [o.stop === 'last' ? ts[ts.length - 1]?.id : o.stop] };
  }
  return null;
};

/** 来莺儿(0) / 甲(1) / 乙(2) / 丙(3)：座位顺序 = id 顺序 */
const board = (human: number[] = []) => {
  const ly = mkPlayer({ id: 0, name: '来莺儿' });
  const a = mkPlayer({ id: 1, name: '甲', isHuman: human.includes(1) });
  const b = mkPlayer({ id: 2, name: '乙', isHuman: human.includes(2) });
  const c = mkPlayer({ id: 3, name: '丙', isHuman: human.includes(3) });
  return { ly, a, b, c, players: [ly, a, b, c] };
};

describe('来莺儿「绡舞」', () => {
  it('正例：令你摸牌的角色较多时，每个这样选的角色都令来莺儿摸一张，并获得 1 个「沙」标记', async () => {
    const { ly, a, b, c, players } = board([1]);   // 甲是人类 → 由弹窗决定
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: a.id, mine: true }),
    });

    await dispatchTurnEnd(deps, ly);

    // 链条只有甲一人，且她选了「令来莺儿摸一张牌」
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.damaged).toEqual([]);
    expect(fx.logs.some(l => l.includes('获得 1 个「沙」标记（当前 1 个）'))).toBe(true);
    expect(fx.logs.some(l => l.includes('1 名角色参与') && l.includes('令其摸牌 1 / 自己摸牌 0')))
      .toBe(true);
    expect(fx.banners.some(x => x.includes('绡舞'))).toBe(true);
    void b; void c;
  });

  it('正例：「沙」标记跨回合累加，新回合开始后复位「限一次」', async () => {
    const { ly, a, b, players } = board([1]);
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: a.id, mine: true }),
    });

    await dispatchTurnEnd(deps, ly);
    expect(drawnFor(fx, 0)).toBe(1);

    await dispatchTurnStart(deps, b);               // 任意角色的新回合 → 复位
    await dispatchTurnEnd(deps, ly);

    expect(drawnFor(fx, 0)).toBe(2);
    expect(fx.logs.some(l => l.includes('（当前 2 个）'))).toBe(true);
  });

  it('正例：选择自己摸牌的角色较多时，对他们各造成 1 点伤害（AI / 托管默认自己摸牌）', async () => {
    const { ly, a, b, players } = board();          // 全 AI
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: b.id }),   // 链条 = 甲、乙
    });

    await dispatchTurnEnd(deps, ly);

    expect(fx.damaged).toEqual([
      { victimId: a.id, sourceId: ly.id, amount: 1 },
      { victimId: b.id, sourceId: ly.id, amount: 1 },
    ]);
    expect(drawnFor(fx, 1)).toBe(1);
    expect(drawnFor(fx, 2)).toBe(1);
    expect(drawnFor(fx, 0)).toBe(0);                // 没人选「令你摸牌」
    expect(fx.logs.some(l => l.includes('各造成 1 点伤害'))).toBe(true);
  });

  it('正例：上家方向从 id 更小一侧的相邻角色开始，终止角色限定在该方向', async () => {
    const { ly, c, players } = board();
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'prev', stop: c.id }),   // 上家 = 丙(3)
    });

    await dispatchTurnEnd(deps, ly);

    expect(fx.damaged).toEqual([{ victimId: c.id, sourceId: ly.id, amount: 1 }]);
    expect(drawnFor(fx, 3)).toBe(1);
    expect(drawnFor(fx, 1)).toBe(0);                // 甲不在链条里
  });

  it('正例：终止角色取方向上最远一名时全员参与', async () => {
    const { ly, players } = board();
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: 'last' }),
    });

    await dispatchTurnEnd(deps, ly);

    expect(fx.damaged.map(d => d.victimId)).toEqual([1, 2, 3]);
    expect(fx.logs.some(l => l.includes('3 名角色参与'))).toBe(true);
  });

  it('反例：不是自己的回合结束时不发动', async () => {
    const { ly, a, players } = board([1]);
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: a.id, mine: true }),
    });

    await dispatchTurnEnd(deps, a);                 // 甲的回合结束

    expect(fx.drawn).toEqual([]);
    expect(fx.damaged).toEqual([]);
    expect(fx.logs.some(l => l.includes('绡舞'))).toBe(false);
    void ly;
  });

  it('反例：出牌阶段限一次——同一回合内第二次回合结束不再发动', async () => {
    const { ly, b, players } = board();
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: b.id }),
    });

    await dispatchTurnEnd(deps, ly);
    await dispatchTurnEnd(deps, ly);                // 同一回合（没有回合开始）

    expect(fx.damaged).toHaveLength(2);             // 只有第一次的两人
  });

  it('反例：新回合开始后复位，可以再次发动', async () => {
    const { ly, a, b, players } = board();
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: b.id }),
    });

    await dispatchTurnEnd(deps, ly);
    expect(fx.damaged).toHaveLength(2);

    await dispatchTurnStart(deps, a);                // 新回合（任意角色）
    await dispatchTurnEnd(deps, ly);
    expect(fx.damaged).toHaveLength(4);
  });

  it('反例：玩家取消方向选择时不结算（一次提问都不再问）', async () => {
    const { ly, players } = board([1]);
    let asked = 0;
    const { deps, fx } = makeHarness(players, {
      requestChoice: async (req) => { asked += 1; return scripted({ dir: 'cancel' })(req); },
    });

    await dispatchTurnEnd(deps, ly);

    expect(asked).toBe(1);                          // 只问了方向
    expect(fx.drawn).toEqual([]);
    expect(fx.damaged).toEqual([]);
    expect(fx.logs.some(l => l.includes('绡舞'))).toBe(false);
  });

  it('反例：玩家取消终止角色选择时不结算', async () => {
    const { ly, players } = board([1]);
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: 'cancel' }),
    });

    await dispatchTurnEnd(deps, ly);

    expect(fx.drawn).toEqual([]);
    expect(fx.damaged).toEqual([]);
    expect(fx.logs.some(l => l.includes('绡舞'))).toBe(false);
  });

  it('反例：两侧人数相同（没有「较多」）时既不得标记也不造成伤害', async () => {
    const { ly, a, b, players } = board([1]);       // 甲人类选「令你摸牌」，乙 AI 默认「自己摸牌」
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ dir: 'next', stop: b.id, mine: true }),
    });

    await dispatchTurnEnd(deps, ly);

    expect(fx.damaged).toEqual([]);
    expect(fx.logs.some(l => l.includes('获得 1 个「沙」标记'))).toBe(false);
    expect(fx.logs.some(l => l.includes('相同'))).toBe(true);
    // 两张牌照摸：一张给来莺儿（甲的选择），一张给乙（自己的选择）
    expect(drawnFor(fx, 0)).toBe(1);
    expect(drawnFor(fx, 2)).toBe(1);
    void a;
  });

  it('反例：场上只有自己存活时不发动', async () => {
    const ly = mkPlayer({ id: 0, name: '来莺儿' });
    let asked = 0;
    const { deps, fx } = makeHarness([ly], {
      requestChoice: async (req) => { asked += 1; return scripted({ dir: 'next', stop: 'last' })(req); },
    });

    await dispatchTurnEnd(deps, ly);

    expect(asked).toBe(0);
    expect(fx.drawn).toEqual([]);
    expect(fx.logs.some(l => l.includes('绡舞'))).toBe(false);
  });
});

describe('注册名与 HEROES 逐字一致', () => {
  it('来莺儿「绡舞」', () => {
    expect(skillsOf('来莺儿').map(d => d.skill)).toContain('绡舞');
  });
});
