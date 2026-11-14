import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer, drawnFor } from './testHarness';
import { dispatchTurnEnd, dispatchCardUsed } from './dispatch';
import { skillHook } from './registry';
import '../skills/index';

/**
 * 第六批女将 · 第一批实装的 4 个技能。
 *
 * 断言的是**规则**而不是「跑不跑得动」：摸几张、给谁摸、触没触发。
 * 每个技能都配了「不该触发」的反例——只测正例等于没测边界。
 */

const card = (o = {}) => mkCard(o);

describe('卢弈「手谈」', () => {
  it('手牌为全场最少时摸一张', () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲', hand: [card(), card(), card()] });
    const { deps, fx } = makeHarness([lu, other]);
    dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.logs.some(l => l.includes('手谈'))).toBe(true);
  });

  it('手牌不是最少时不触发', () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card(), card(), card()] });
    const other = mkPlayer({ id: 1, name: '甲', hand: [card()] });
    const { deps, fx } = makeHarness([lu, other]);
    dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('并列最少也算（规则原文是「全场最少」，非「唯一最少」）', () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲', hand: [card()] });
    const { deps, fx } = makeHarness([lu, other]);
    dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(1);
  });

  it('已阵亡的玩家不参与「全场最少」的比较', () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card(), card()] });
    const dead = mkPlayer({ id: 1, name: '亡', hand: [], isDead: true });
    const live = mkPlayer({ id: 2, name: '甲', hand: [card(), card(), card()] });
    const { deps, fx } = makeHarness([lu, dead, live]);
    dispatchTurnEnd(deps, live);
    expect(drawnFor(fx, 0)).toBe(1);
  });
});

describe('吕玲绮「神威」', () => {
  it('摸牌阶段多摸两张', () => {
    const lv = mkPlayer({ id: 0, name: '吕玲绮' });
    const { deps } = makeHarness([lv]);
    // drawPhaseBonus 由引擎加总，这里直接验证钩子返回值
    const fns = skillHook('drawPhaseBonus');
    const total = fns.reduce((a, f) => a + (f.def.hero === '吕玲绮' ? f.fn({} as never) : 0), 0);
    expect(total).toBe(2);
    void deps;
  });

  it('手牌上限 +2', () => {
    const fns = skillHook('handLimitBonus');
    const total = fns.reduce((a, f) => a + (f.def.hero === '吕玲绮' ? f.fn({} as never) : 0), 0);
    expect(total).toBe(2);
  });
});

describe('赵嫣「轻幔」', () => {
  it('摸到「该角色空置装备栏数」张（4 栏全空 → 摸至 4）', () => {
    const zhao = mkPlayer({ id: 0, name: '赵嫣', hand: [card()] });
    const ending = mkPlayer({ id: 1, name: '甲', equipment: {} });
    const { deps, fx } = makeHarness([zhao, ending]);
    dispatchTurnEnd(deps, ending);
    // 引擎只有 4 个装备栏（weapon/armor/horsePlus/horseMinus），全空 → 摸至 4；当前 1 张 → 摸 3
    expect(drawnFor(fx, 0)).toBe(3);
  });

  it('手牌已多于空栏数时不弃牌、也不摸', () => {
    const zhao = mkPlayer({ id: 0, name: '赵嫣', hand: [card(), card(), card()] });
    const ending = mkPlayer({
      id: 1, name: '甲',
      equipment: { weapon: card(), armor: card(), horseMinus: card(), horsePlus: card() },
    });
    const { deps, fx } = makeHarness([zhao, ending]);
    dispatchTurnEnd(deps, ending);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.discarded).toHaveLength(0);
  });
});

describe('陆文漪「怯言」', () => {
  it('成为目标且对方手牌更多时摸一张', () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card()] });
    const src = mkPlayer({ id: 1, name: '甲', hand: [card(), card(), card()] });
    const { deps, fx } = makeHarness([lu, src]);
    dispatchCardUsed(deps, { source: src, card: card(), targets: [lu], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.logs.some(l => l.includes('怯言'))).toBe(true);
  });

  it('自己不是目标时不触发', () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card()] });
    const src = mkPlayer({ id: 1, name: '甲', hand: [card(), card(), card()] });
    const other = mkPlayer({ id: 2, name: '乙' });
    const { deps, fx } = makeHarness([lu, src, other]);
    dispatchCardUsed(deps, { source: src, card: card(), targets: [other], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('对方手牌不多于自己时不触发', () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card(), card(), card()] });
    const src = mkPlayer({ id: 1, name: '甲', hand: [card()] });
    const { deps, fx } = makeHarness([lu, src]);
    dispatchCardUsed(deps, { source: src, card: card(), targets: [lu], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});
