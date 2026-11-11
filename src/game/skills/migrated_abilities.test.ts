
import { describe, expect, it } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../../../types';
import type { Card, Player } from '../../../types';
import { mkCard, mkPlayer, makeHarness } from './testHarness';
import { dispatchJudgeBefore, dispatchDamageBefore } from './dispatch';
import './index';

/** 用新引擎能力迁移的技能：释衅（damageBefore）与 红颜（judgeBefore）。 */

const P = (name: string, id = 0, over: Partial<Player> = {}) => mkPlayer({ name, id, ...over });

describe('孙茹「释衅」', () => {
  it('火焰伤害被完全阻止', async () => {
    const me = P('孙茹');
    const { deps } = makeHarness([me, P('甲', 1)]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: P('甲', 1), amount: 2, nature: 'fire', card: mkCard(),
    });
    expect(r.prevent).toBe(true);
  });

  it('普通伤害不受影响', async () => {
    const me = P('孙茹');
    const { deps } = makeHarness([me, P('甲', 1)]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: P('甲', 1), amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r.prevent).toBeUndefined();
  });

  it('雷电伤害不受影响（只免疫火焰）', async () => {
    const me = P('孙茹');
    const { deps } = makeHarness([me, P('甲', 1)]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: P('甲', 1), amount: 2, nature: 'thunder', card: mkCard(),
    });
    expect(r.prevent).toBeUndefined();
  });
});

describe('小乔「红颜」', () => {
  // 回归：App.tsx 曾在 dispatchJudgeBefore 之前就把方块改写成红桃，
  // 导致钩子的守卫条件永远不成立、技能变成死代码。
  // 这条测试直接断言钩子对「未被改写的方块判定牌」生效。
  it('方块判定牌被改写为红桃', async () => {
    const me = P('小乔');
    const { deps, fx } = makeHarness([me]);
    const r = await dispatchJudgeBefore(deps, {
      owner: me, reason: '乐不思蜀', card: mkCard({ suit: Suit.DIAMOND }),
    });
    expect(r.treatSuitAs).toBe(Suit.HEART);
    // 钩子必须真的执行并写日志（App 侧不得提前改写花色遮蔽它）
    expect(fx.logs.some(l => l.includes('红颜'))).toBe(true);
  });

  it('非方块判定牌不改写', async () => {
    const me = P('小乔');
    const { deps } = makeHarness([me]);
    const r = await dispatchJudgeBefore(deps, {
      owner: me, reason: '乐不思蜀', card: mkCard({ suit: Suit.SPADE }),
    });
    expect(r.treatSuitAs).toBeUndefined();
  });

  it('他人判定不触发红颜', async () => {
    const me = P('小乔');
    const other = P('甲', 1);
    const { deps } = makeHarness([me, other]);
    const r = await dispatchJudgeBefore(deps, {
      owner: other, reason: 'x', card: mkCard({ suit: Suit.DIAMOND }),
    });
    expect(r.treatSuitAs).toBeUndefined();
  });
});
