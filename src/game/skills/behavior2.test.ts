import { describe, expect, it } from 'vitest';
import { Suit } from '../../../types';
import { mkCard, mkPlayer, makeHarness, drawnFor, damageFrom } from './testHarness';
import { dispatchTurnEnd, dispatchTurnStart, dispatchAfterDamage, dispatchJudge, dispatchCardUsed } from './dispatch';
import './index';

/**
 * 第二批技能行为测试：覆盖 batch7 / batch8 中尚未断言的武将。
 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('郭照「尊位」', () => {
  it('默认（AI/托管）追平手牌', async () => {
    const gz = P('郭照', 0, { hand: [] });
    const rich = P('甲', 1, { hand: [mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([gz, rich]);
    await dispatchTurnEnd(deps, gz);
    expect(drawnFor(fx, 0)).toBe(3);
  });

  it('追平手牌最多摸 5 张', async () => {
    const gz = P('郭照', 0, { hand: [] });
    const rich = P('甲', 1, { hand: Array.from({ length: 9 }, () => mkCard()) });
    const { deps, fx } = makeHarness([gz, rich]);
    await dispatchTurnEnd(deps, gz);
    expect(drawnFor(fx, 0)).toBe(5);
  });

  it('玩家选择「追平体力」时回复而非摸牌', async () => {
    const gz = P('郭照', 0, { hp: 1, hand: [] });
    const rich = P('甲', 1, { hp: 4, hand: [mkCard()] });
    const { deps, fx } = makeHarness([gz, rich], {
      requestChoice: async () => ({ kind: 'choose', id: 'hp' }),
    });
    await dispatchTurnEnd(deps, gz);
    expect(fx.healed.some(h => h.playerId === 0)).toBe(true);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('曹轶「蜜饴」', () => {
  it('有受伤友军时治疗', async () => {
    const cy = P('曹轶', 0);
    const hurt = P('友', 1, { hp: 1, maxHp: 4 });
    const { deps, fx } = makeHarness([cy, hurt]);
    await dispatchTurnStart(deps, cy);
    expect(fx.healed.some(h => h.playerId === 1)).toBe(true);
  });

  it('无人受伤时对他人造成 1 点伤害', async () => {
    const cy = P('曹轶', 0);
    const foe = P('敌', 1, { hp: 4, maxHp: 4 });
    const { deps, fx } = makeHarness([cy, foe]);
    await dispatchTurnStart(deps, cy);
    expect(damageFrom(fx, 0)).toBe(1);
  });
});

describe('卞玥「庇族」', () => {
  it('手牌数相同的角色各摸一张', async () => {
    const by = P('卞玥', 0, { hand: [mkCard()] });
    const same = P('甲', 1, { hand: [mkCard()] });
    const diff = P('乙', 2, { hand: [mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([by, same, diff]);
    await dispatchTurnStart(deps, by);
    expect(drawnFor(fx, 1)).toBe(1);
    expect(drawnFor(fx, 2)).toBe(0);
  });
});

describe('莫琼树「绛脂」', () => {
  it('判定红色摸三张', async () => {
    const mq = P('莫琼树', 0);
    const { deps, fx } = makeHarness([mq, P('甲', 1)]);
    await dispatchJudge(deps, { owner: mq, card: mkCard({ suit: Suit.HEART }), reason: 'x' });
    expect(drawnFor(fx, 0)).toBe(3);
  });

  it('判定黑色弃置他人两张', async () => {
    const mq = P('莫琼树', 0);
    const foe = P('甲', 1, { hand: [mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([mq, foe]);
    await dispatchJudge(deps, { owner: mq, card: mkCard({ suit: Suit.SPADE }), reason: 'x' });
    expect(fx.discarded.some(d => d.playerId === 1 && d.count === 2)).toBe(true);
  });
});

describe('徐馨「愍善」', () => {
  it('受到伤害后摸两张', async () => {
    const xx = P('徐馨', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([xx, foe]);
    await dispatchAfterDamage(deps, {
      victim: xx, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('不是自己受伤不触发', async () => {
    const xx = P('徐馨', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([xx, foe]);
    await dispatchAfterDamage(deps, {
      victim: foe, source: xx, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('张嫙「同礼」', () => {
  it('手牌花色数不足 2 时不触发', async () => {
    const zx = P('张嫙', 0, { hand: [mkCard({ suit: Suit.SPADE }), mkCard({ suit: Suit.SPADE })] });
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([zx, foe]);
    await dispatchCardUsed(deps, {
      source: zx, card: mkCard(), targets: [foe], usedCount: 1,
    });
    expect(damageFrom(fx, 0)).toBe(0);
  });

  it('手牌花色数 >= 2 时追加伤害', async () => {
    const zx = P('张嫙', 0, { hand: [mkCard({ suit: Suit.SPADE }), mkCard({ suit: Suit.HEART })] });
    const foe = P('甲', 1, { hp: 5, maxHp: 5 });
    const { deps, fx } = makeHarness([zx, foe]);
    await dispatchCardUsed(deps, {
      source: zx, card: mkCard(), targets: [foe], usedCount: 1,
    });
    expect(damageFrom(fx, 0)).toBeGreaterThan(0);
  });
});

describe('王笙「追懿」', () => {
  it('自己使用牌后摸一张', async () => {
    const ws2 = P('王笙', 0);
    const { deps, fx } = makeHarness([ws2, P('甲', 1)]);
    await dispatchCardUsed(deps, { source: ws2, card: mkCard(), targets: [], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(1);
  });

  it('他人使用牌不触发', async () => {
    const ws2 = P('王笙', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([ws2, foe]);
    await dispatchCardUsed(deps, { source: foe, card: mkCard(), targets: [], usedCount: 1 });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('潘淑「燕尔」', () => {
  it('他人用尽手牌时双方各摸两张', async () => {
    const ps = P('潘淑', 1);
    const foe = P('甲', 0, { hand: [] });
    const { deps, fx } = makeHarness([foe, ps]);
    await dispatchCardUsed(deps, { source: foe, card: mkCard(), targets: [], usedCount: 1 });
    expect(drawnFor(fx, 1)).toBe(2);
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('他人还有手牌时不触发', async () => {
    const ps = P('潘淑', 1);
    const foe = P('甲', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([foe, ps]);
    await dispatchCardUsed(deps, { source: foe, card: mkCard(), targets: [], usedCount: 1 });
    expect(drawnFor(fx, 1)).toBe(0);
  });
});

describe('董绾「生妒」', () => {
  it('回合结束时给他人挂标记', async () => {
    const dw = P('董绾', 0);
    const other = P('甲', 1);
    const { deps } = makeHarness([dw, other]);
    await dispatchTurnEnd(deps, other);
    expect(other.shengduMarks).toBe(1);
  });

  it('不会给自己挂标记', async () => {
    const dw = P('董绾', 0);
    const { deps } = makeHarness([dw, P('甲', 1)]);
    await dispatchTurnEnd(deps, dw);
    expect(dw.shengduMarks).toBeUndefined();
  });
});

describe('张宁「天则」边界', () => {
  it('他人第二张黑牌不再触发反击', async () => {
    const zn = P('张宁', 1, { hand: [mkCard({ suit: Suit.CLUB })] });
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, zn]);
    await dispatchCardUsed(deps, {
      source: other, card: mkCard({ suit: Suit.SPADE }), targets: [zn], usedCount: 2,
    });
    expect(damageFrom(fx, 1)).toBe(0);
  });
});

describe('尹夫人「媵予」', () => {
  it('两名其他角色花色不同时发生转移', async () => {
    const yf = P('尹夫人', 0);
    const a = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const b = P('乙', 2, { hand: [mkCard({ suit: Suit.SPADE })] });
    const { deps, fx } = makeHarness([yf, a, b]);
    await dispatchTurnStart(deps, yf);
    expect(fx.logs.some(l => l.includes('媵予'))).toBe(true);
  });

  it('花色相同则不发动', async () => {
    const yf = P('尹夫人', 0);
    const a = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const b = P('乙', 2, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([yf, a, b]);
    await dispatchTurnStart(deps, yf);
    expect(fx.logs.some(l => l.includes('媵予'))).toBe(false);
  });
});
