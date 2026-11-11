import { describe, expect, it } from 'vitest';
import { mkCard, mkPlayer, makeHarness, drawnFor } from './testHarness';
import { dispatchTurnEnd, dispatchTurnStart } from './dispatch';
import './index';

/** 迁移批次 2 的行为测试：搬到注册表后规则必须与旧内联分支一致。 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('王异「秘计」', () => {
  it('回合开始时已受伤，摸等同于已损失体力的牌', async () => {
    const me = P('王异', 0, { hp: 1, maxHp: 3 });
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchTurnStart(deps, me);
    expect(drawnFor(fx, 0)).toBe(2);
    expect(fx.logs.some(l => l.includes('秘计'))).toBe(true);
    expect(fx.banners).toContain('王异:秘计');
  });

  it('未受伤时不摸牌', async () => {
    const me = P('王异', 0, { hp: 3, maxHp: 3 });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.logs.some(l => l.includes('秘计'))).toBe(false);
  });

  it('不是自己的回合不触发', async () => {
    const me = P('王异', 0, { hp: 1, maxHp: 3 });
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchTurnStart(deps, foe);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('甘夫人「神智」', () => {
  it('准备阶段弃光手牌（不少于体力值）后回复 1 点体力', async () => {
    const me = P('甘夫人', 0, { hp: 2, maxHp: 3, hand: [mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 2 }]);
    expect(fx.healed).toEqual([{ playerId: 0, amount: 1 }]);
    expect(fx.logs.some(l => l.includes('神智'))).toBe(true);
  });

  it('手牌数少于体力值时不发动', async () => {
    const me = P('甘夫人', 0, { hp: 2, maxHp: 3, hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
  });

  it('未受伤时不弃牌（回应无收益）', async () => {
    const me = P('甘夫人', 0, { hp: 3, maxHp: 3, hand: [mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(fx.discarded).toEqual([]);
  });
});

describe('曹节「惠民」', () => {
  it('结束阶段按缺牌角色数摸牌并分发', async () => {
    const me = P('曹节', 0, { hp: 3, maxHp: 3, hand: [mkCard(), mkCard(), mkCard()] });
    const needy = P('甲', 1, { hp: 3, maxHp: 3, hand: [] });
    const { deps, fx } = makeHarness([me, needy]);
    await dispatchTurnEnd(deps, me);
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.logs.some(l => l.includes('惠民'))).toBe(true);
    expect(fx.banners).toContain('曹节:惠民');
  });

  it('摸到的牌也要参与分发，且同一张牌不会发给两个人', async () => {
    // harness 的 draw 只记账不返回牌：这里验证分发不会因为「摸到空数组」而漏发
    // 曹节自己手牌不少于体力，才不算「缺牌角色」（与旧实现一致：X 含所有缺牌者）
    const me = P('曹节', 0, { hp: 3, maxHp: 3, hand: [mkCard(), mkCard(), mkCard()] });
    const a = P('甲', 1, { hp: 3, maxHp: 3, hand: [] });
    const b = P('乙', 2, { hp: 3, maxHp: 3, hand: [] });
    const { deps, fx } = makeHarness([me, a, b]);
    await dispatchTurnEnd(deps, me);
    // 两名缺牌角色 → 摸两张，两人才够各得一张
    expect(drawnFor(fx, 0)).toBe(2);
    expect(fx.logs.filter(l => l.includes('交给')).length).toBe(2);
  });

  it('没有缺牌角色时不摸牌', async () => {
    const me = P('曹节', 0, { hp: 2, maxHp: 2, hand: [mkCard(), mkCard()] });
    const full = P('甲', 1, { hp: 1, maxHp: 3, hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, full]);
    await dispatchTurnEnd(deps, me);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.logs.some(l => l.includes('惠民'))).toBe(false);
  });

  it('不是自己的结束阶段不触发', async () => {
    const me = P('曹节', 0, { hp: 3, maxHp: 3, hand: [mkCard()] });
    const ender = P('甲', 1, { hand: [] });
    const { deps, fx } = makeHarness([me, ender]);
    await dispatchTurnEnd(deps, ender);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('夏侯氏「樵拾」', () => {
  it('其他角色结束阶段手牌数与夏侯氏相同时，双方各摸一张', async () => {
    const xhs = P('夏侯氏', 1, { hand: [mkCard()] });
    const ender = P('甲', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([ender, xhs]);
    await dispatchTurnEnd(deps, ender);
    expect(drawnFor(fx, 0)).toBe(1);
    expect(drawnFor(fx, 1)).toBe(1);
    expect(fx.logs.some(l => l.includes('樵拾'))).toBe(true);
  });

  it('手牌数不相同时不触发', async () => {
    const xhs = P('夏侯氏', 1, { hand: [mkCard()] });
    const ender = P('甲', 0, { hand: [mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([ender, xhs]);
    await dispatchTurnEnd(deps, ender);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(drawnFor(fx, 1)).toBe(0);
  });

  it('夏侯氏自己的结束阶段不触发', async () => {
    const xhs = P('夏侯氏', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([xhs, P('甲', 1)]);
    await dispatchTurnEnd(deps, xhs);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});
