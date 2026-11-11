import { describe, expect, it } from 'vitest';
import { mkCard, mkPlayer, makeHarness, drawnFor } from './testHarness';
import { dispatchAfterDamage, dispatchTurnEnd, dispatchTurnStart } from './dispatch';
import './index';

/** 迁移批次 3 的行为测试：搬到注册表后规则必须与旧内联分支一致。 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('卑弥呼「骨疽」', () => {
  it('拥有“傀”的角色受到伤害后，卑弥呼摸一张并获得一枚“疽”', async () => {
    const bmh = P('卑弥呼', 0);
    const marked = P('甲', 1, { hasKui: true });
    const { deps, fx } = makeHarness([bmh, marked]);
    await dispatchAfterDamage(deps, { victim: marked, source: bmh, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(1);
    expect(bmh.juMarks).toBe(1);
    expect(fx.logs.some(l => l.includes('骨疽'))).toBe(true);
    expect(fx.banners).toContain('卑弥呼:骨疽');
  });

  it('受伤角色没有“傀”时不触发', async () => {
    const bmh = P('卑弥呼', 0);
    const plain = P('甲', 1);
    const { deps, fx } = makeHarness([bmh, plain]);
    await dispatchAfterDamage(deps, { victim: plain, source: bmh, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(0);
    expect(bmh.juMarks).toBeUndefined();
    expect(fx.logs.some(l => l.includes('骨疽'))).toBe(false);
  });

  it('「拜假」觉醒后不再按「骨疽」结算', async () => {
    const bmh = P('卑弥呼', 0, { baiJiaAwakened: true });
    const marked = P('甲', 1, { hasKui: true });
    const { deps, fx } = makeHarness([bmh, marked]);
    await dispatchAfterDamage(deps, { victim: marked, source: bmh, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('卑弥呼「拜假」', () => {
  it('“疽”满 7 枚时觉醒：体力上限 +1、回 1 点，其他角色获得“傀”', async () => {
    const bmh = P('卑弥呼', 0, { hp: 2, maxHp: 3, juMarks: 7 });
    const a = P('甲', 1);
    const b = P('乙', 2);
    const { deps, fx } = makeHarness([bmh, a, b]);
    await dispatchTurnStart(deps, bmh);
    expect(bmh.baiJiaAwakened).toBe(true);
    expect(bmh.maxHp).toBe(4);
    expect(bmh.hp).toBe(3);
    expect(a.hasKui).toBe(true);
    expect(b.hasKui).toBe(true);
    expect(fx.banners).toContain('卑弥呼:拜假');
  });

  it('“疽”不足 7 枚时不发动', async () => {
    const bmh = P('卑弥呼', 0, { hp: 2, maxHp: 3, juMarks: 6 });
    const a = P('甲', 1);
    const { deps, fx } = makeHarness([bmh, a]);
    await dispatchTurnStart(deps, bmh);
    expect(bmh.baiJiaAwakened).toBeUndefined();
    expect(bmh.maxHp).toBe(3);
    expect(bmh.hp).toBe(2);
    expect(fx.logs.some(l => l.includes('拜假'))).toBe(false);
    // 「纵傀」照常发动，只给一名角色上标记（不是「拜假」的全体上标）
    expect(a.hasKui).toBe(true);
  });
});

describe('卑弥呼「纵傀」', () => {
  it('回合开始时令一名无“傀”的其他角色获得“傀”', async () => {
    const bmh = P('卑弥呼', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([bmh, foe]);
    await dispatchTurnStart(deps, bmh);
    expect(foe.hasKui).toBe(true);
    expect(fx.banners).toContain('卑弥呼:纵傀');
  });

  it('不是自己的回合不发动', async () => {
    const bmh = P('卑弥呼', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([bmh, foe]);
    await dispatchTurnStart(deps, foe);
    expect(foe.hasKui).toBeUndefined();
    expect(fx.logs.some(l => l.includes('纵傀'))).toBe(false);
  });

  it('场上已无未标记者时不触发', async () => {
    const bmh = P('卑弥呼', 0);
    const foe = P('甲', 1, { hasKui: true });
    const { deps, fx } = makeHarness([bmh, foe]);
    await dispatchTurnStart(deps, bmh);
    expect(fx.banners).not.toContain('卑弥呼:纵傀');
  });
});

describe('王元姬「尚俭」', () => {
  it('结束阶段失去的牌数不大于体力值时摸等量牌并清零', async () => {
    const wj = P('王元姬', 0, { hp: 3, maxHp: 3, lostCardsThisTurn: 2 });
    const { deps, fx } = makeHarness([wj, P('甲', 1)]);
    await dispatchTurnEnd(deps, P('甲', 1));
    expect(drawnFor(fx, 0)).toBe(2);
    expect(wj.lostCardsThisTurn).toBe(0);
    expect(fx.banners).toContain('王元姬:尚俭');
  });

  it('失去的牌数超过体力值时不摸牌也不清零', async () => {
    const wj = P('王元姬', 0, { hp: 3, maxHp: 3, lostCardsThisTurn: 4 });
    const { deps, fx } = makeHarness([wj, P('甲', 1)]);
    await dispatchTurnEnd(deps, P('甲', 1));
    expect(drawnFor(fx, 0)).toBe(0);
    expect(wj.lostCardsThisTurn).toBe(4);
  });

  it('本回合没有失去牌时不触发', async () => {
    const wj = P('王元姬', 0, { hp: 3, maxHp: 3, lostCardsThisTurn: 0 });
    const { deps, fx } = makeHarness([wj, P('甲', 1)]);
    await dispatchTurnEnd(deps, P('甲', 1));
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.logs.some(l => l.includes('尚俭'))).toBe(false);
  });

  it('回合开始清零失去牌数（不只是自己的回合）', async () => {
    const wj = P('王元姬', 0, { lostCardsThisTurn: 5 });
    const other = P('甲', 1);
    const { deps } = makeHarness([wj, other]);
    await dispatchTurnStart(deps, other);
    expect(wj.lostCardsThisTurn).toBe(0);
  });
});

describe('张昌蒲「严教」', () => {
  it('回合开始时摸回上回合交出的牌数并清零', async () => {
    const zcp = P('张昌蒲', 0, { yanjiaoCount: 3 });
    const other = P('甲', 1);
    const { deps, fx } = makeHarness([zcp, other]);
    await dispatchTurnStart(deps, other);
    expect(drawnFor(fx, 0)).toBe(3);
    expect(zcp.yanjiaoCount).toBe(0);
    expect(fx.banners).toContain('张昌蒲:严教');
  });

  it('上回合未发动时不摸牌', async () => {
    const zcp = P('张昌蒲', 0);
    const other = P('甲', 1);
    const { deps, fx } = makeHarness([zcp, other]);
    await dispatchTurnStart(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.logs.some(l => l.includes('严教'))).toBe(false);
  });
});

describe('何太后「戚乱」', () => {
  it('击杀数每回合开始清零', async () => {
    const hetai = P('何太后', 0, { killsThisTurn: 2 });
    const other = P('甲', 1);
    const { deps } = makeHarness([hetai, other]);
    await dispatchTurnStart(deps, other);
    expect(hetai.killsThisTurn).toBe(0);
  });

  it('结束阶段按 3×击杀数摸牌', async () => {
    const hetai = P('何太后', 0, { killsThisTurn: 2 });
    const other = P('甲', 1);
    const { deps, fx } = makeHarness([hetai, other]);
    // 清零钩子会先把计数写成 0，这里直接验证结算逻辑需绕过它：手工再置一次
    hetai.killsThisTurn = 2;
    await dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(6);
    expect(fx.banners).toContain('何太后:戚乱');
  });

  it('本回合没有击杀时不摸牌', async () => {
    const hetai = P('何太后', 0);
    const other = P('甲', 1);
    const { deps, fx } = makeHarness([hetai, other]);
    hetai.killsThisTurn = 0;
    await dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.logs.some(l => l.includes('戚乱'))).toBe(false);
  });
});
