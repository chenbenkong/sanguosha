import { describe, expect, it } from 'vitest';
import { CardType, Suit } from '../../../types';
import { mkCard, mkPlayer, makeHarness, drawnFor } from './testHarness';
import { dispatchAfterDamage, dispatchAfterDealDamage, dispatchCardUsed, dispatchJudge } from './dispatch';
import './index';

/** 迁移批次 1 的行为测试：确保搬到注册表后规则与原来一致。 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('黄月英「集智」', () => {
  it('使用锦囊牌摸一张', async () => {
    const me = P('黄月英', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardUsed(deps, { source: me, card: mkCard({ type: CardType.SCROLL }), targets: [], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(1);
  });

  it('使用基本牌不触发', async () => {
    const me = P('黄月英', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardUsed(deps, { source: me, card: mkCard({ type: CardType.BASIC }), targets: [], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('关银屏「虎啸」', () => {
  it('造成伤害后摸一张', async () => {
    const me = P('关银屏', 0);
    const foe = P('甲', 1, { hp: 4, maxHp: 4 });
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchAfterDealDamage(deps, { victim: foe, source: me, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(1);
  });

  it('造成伤害给已阵亡目标时仍按来源判定', async () => {
    const me = P('关银屏', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    // 自己打自己不应触发
    await dispatchAfterDealDamage(deps, { victim: me, source: me, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('郭嘉「遗计」', () => {
  it('受到伤害后摸两张', async () => {
    const gj = P('郭嘉', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([gj, foe]);
    await dispatchAfterDamage(deps, { victim: gj, source: foe, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('不是自己受伤不触发', async () => {
    const gj = P('郭嘉', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([gj, foe]);
    await dispatchAfterDamage(deps, { victim: foe, source: gj, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('司马懿「反馈」', () => {
  it('受到伤害后获得来源一张手牌', async () => {
    const sm = P('司马懿', 0);
    const foe = P('甲', 1, { hand: [mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([sm, foe]);
    await dispatchAfterDamage(deps, { victim: sm, source: foe, amount: 1, nature: 'normal', card: mkCard() });
    expect(fx.logs.some(l => l.includes('反馈'))).toBe(true);
  });

  it('来源没有手牌时不触发', async () => {
    const sm = P('司马懿', 0);
    const foe = P('甲', 1, { hand: [] });
    const { deps, fx } = makeHarness([sm, foe]);
    await dispatchAfterDamage(deps, { victim: sm, source: foe, amount: 1, nature: 'normal', card: mkCard() });
    expect(fx.logs.some(l => l.includes('反馈'))).toBe(false);
  });
});

describe('郭嘉「天妒」', () => {
  it('自己的判定牌生效后获得', async () => {
    const gj = P('郭嘉', 0);
    const { deps, fx } = makeHarness([gj, P('甲', 1)]);
    await dispatchJudge(deps, { owner: gj, card: mkCard({ suit: Suit.HEART }), reason: '乐不思蜀' });
    expect(fx.logs.some(l => l.includes('天妒'))).toBe(true);
  });

  it('他人判定不触发', async () => {
    const gj = P('郭嘉', 0);
    const other = P('甲', 1);
    const { deps, fx } = makeHarness([gj, other]);
    await dispatchJudge(deps, { owner: other, card: mkCard(), reason: 'x' });
    expect(fx.logs.some(l => l.includes('天妒'))).toBe(false);
  });
});

describe('周瑜「英姿」', () => {
  it('摸牌阶段额外摸一张', async () => {
    const zy = P('周瑜', 0);
    const other = P('甲', 1);
    const { deps } = makeHarness([zy, other]);
    const { dispatchDrawBonus } = await import('./dispatch');
    expect(dispatchDrawBonus(deps, 0)).toBe(1);
  });

  it('只加成自己，不影响他人摸牌', async () => {
    const zy = P('周瑜', 0);
    const other = P('甲', 1);
    const { deps } = makeHarness([zy, other]);
    const { dispatchDrawBonus } = await import('./dispatch');
    expect(dispatchDrawBonus(deps, 1)).toBe(0);
  });
});