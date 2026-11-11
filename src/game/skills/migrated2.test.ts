import { describe, expect, it } from 'vitest';
import { mkCard, mkPlayer, makeHarness, drawnFor } from './testHarness';
import { dispatchTurnEnd } from './dispatch';
import './index';

/** 迁移批次 2 的行为测试：搬到注册表后规则与原内联分支一致。 */

describe('张春华「伤逝」', () => {
  it('回合结束时手牌少于已损失体力，补至该值', async () => {
    const zch = mkPlayer({ name: '张春华', id: 0, hp: 1, maxHp: 3, hand: [] });
    const { deps, fx } = makeHarness([zch, mkPlayer({ name: '甲', id: 1 })]);
    await dispatchTurnEnd(deps, zch);
    // 已损失 2 点体力，手牌 0 张 → 摸 2 张
    expect(drawnFor(fx, 0)).toBe(2);
    expect(fx.logs.some(l => l.includes('伤逝'))).toBe(true);
  });

  it('手牌已不少于已损失体力时不发动', async () => {
    const zch = mkPlayer({ name: '张春华', id: 0, hp: 1, maxHp: 3, hand: [mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([zch, mkPlayer({ name: '甲', id: 1 })]);
    await dispatchTurnEnd(deps, zch);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.logs.some(l => l.includes('伤逝'))).toBe(false);
  });

  it('不是自己的回合结束不发动', async () => {
    const zch = mkPlayer({ name: '张春华', id: 0, hp: 1, maxHp: 3, hand: [] });
    const other = mkPlayer({ name: '甲', id: 1 });
    const { deps, fx } = makeHarness([zch, other]);
    await dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('貂蝉「闭月」', () => {
  it('回合结束时摸一张牌', async () => {
    const dc = mkPlayer({ name: '貂蝉', id: 0 });
    const { deps, fx } = makeHarness([dc, mkPlayer({ name: '甲', id: 1 })]);
    await dispatchTurnEnd(deps, dc);
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.banners).toContain('貂蝉:闭月');
  });

  it('其他角色回合结束不发动', async () => {
    const dc = mkPlayer({ name: '貂蝉', id: 0 });
    const other = mkPlayer({ name: '甲', id: 1 });
    const { deps, fx } = makeHarness([dc, other]);
    await dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.banners).not.toContain('貂蝉:闭月');
  });
});

describe('曹婴「伏间」', () => {
  it('全场均有手牌时，观看一名其他角色最少手牌数张', async () => {
    const cy = mkPlayer({ name: '曹婴', id: 0, hand: [mkCard(), mkCard(), mkCard()] });
    const other = mkPlayer({ name: '甲', id: 1, hand: [mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([cy, other]);
    await dispatchTurnEnd(deps, cy);
    // X = 全场最少手牌数 = 2
    expect(fx.logs.some(l => l.includes('【伏间】') && l.includes('2 张手牌'))).toBe(true);
    expect(fx.banners).toContain('曹婴:伏间');
  });

  it('场上有角色没有手牌时不发动', async () => {
    const cy = mkPlayer({ name: '曹婴', id: 0, hand: [mkCard()] });
    const other = mkPlayer({ name: '甲', id: 1, hand: [] });
    const { deps, fx } = makeHarness([cy, other]);
    await dispatchTurnEnd(deps, cy);
    expect(fx.logs.some(l => l.includes('【伏间】'))).toBe(false);
  });

  it('只有曹婴自己存活时不发动（没有可观看的其他角色）', async () => {
    const cy = mkPlayer({ name: '曹婴', id: 0, hand: [mkCard()] });
    const { deps, fx } = makeHarness([cy]);
    await dispatchTurnEnd(deps, cy);
    expect(fx.logs.some(l => l.includes('【伏间】'))).toBe(false);
  });
});
