import { describe, expect, it } from 'vitest';
import { Suit } from '../../../types';
import { mkCard, mkPlayer, makeHarness, drawnFor, damageFrom } from './testHarness';
import {
  dispatchTurnEnd, dispatchTurnStart, dispatchAfterDamage,
  dispatchAfterDealDamage, dispatchCardUsed, dispatchJudge,
} from './dispatch';
import './index';

/** 第三批技能行为测试：补齐剩余技能的规则断言。 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('庞凤衣「异瞳」', () => {
  it('首次使用牌时选定花色，不摸牌', async () => {
    const me = P('庞凤衣', 0, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardUsed(deps, { source: me, card: mkCard({ suit: Suit.HEART }), targets: [], usedCount: 1 });
    expect(fx.logs.some(l => l.includes('异瞳'))).toBe(true);
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('再次命中指定花色时获得牌', async () => {
    const me = P('庞凤衣', 0, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardUsed(deps, { source: me, card: mkCard({ suit: Suit.HEART }), targets: [], usedCount: 1 });
    await dispatchCardUsed(deps, { source: me, card: mkCard({ suit: Suit.HEART }), targets: [], usedCount: 2 });
    expect(drawnFor(fx, 0)).toBeGreaterThan(0);
  });
});

describe('侯昭宁「和戎」', () => {
  it('默认（AI）与目标交换手牌', async () => {
    const me = P('侯昭宁', 0, { hand: [mkCard({ suit: Suit.HEART })] });
    const other = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([me, other]);
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('和戎'))).toBe(true);
  });

  it('玩家取消时不发动', async () => {
    const me = P('侯昭宁', 0, { hand: [mkCard()] });
    const other = P('甲', 1, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, other], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('和戎'))).toBe(false);
  });
});

describe('曹轶「寅君」', () => {
  it('单体牌结算后追加伤害', async () => {
    const me = P('曹轶', 0, { hp: 4, hand: [mkCard()] });
    const foe = P('甲', 1, { hp: 5, maxHp: 5 });
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchCardUsed(deps, { source: me, card: mkCard(), targets: [foe], usedCount: 1 });
    expect(damageFrom(fx, 0)).toBe(1);
  });

  it('多目标牌不触发', async () => {
    const me = P('曹轶', 0, { hp: 4 });
    const { deps, fx } = makeHarness([me, P('甲', 1), P('乙', 2)]);
    await dispatchCardUsed(deps, { source: me, card: mkCard(), targets: [P('甲', 1), P('乙', 2)], usedCount: 1 });
    expect(damageFrom(fx, 0)).toBe(0);
  });
});

describe('杜夫人「异色」', () => {
  it('红色牌被他人获取时令其回复', async () => {
    const me = P('杜夫人', 1);
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, me]);
    await dispatchCardUsed(deps, { source: other, card: mkCard({ suit: Suit.HEART }), targets: [me], usedCount: 1 });
    expect(fx.healed.some(h => h.playerId === 0)).toBe(true);
  });

  it('自己使用牌不触发', async () => {
    const me = P('杜夫人', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardUsed(deps, { source: me, card: mkCard({ suit: Suit.HEART }), targets: [me], usedCount: 1 });
    expect(fx.healed.length).toBe(0);
  });
});

describe('杜夫人「顺世」', () => {
  it('回合开始交出一张牌', async () => {
    const me = P('杜夫人', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('顺世'))).toBe(true);
  });
});

describe('尹夫人「媵予」与「拥嬖」', () => {
  it('媵予：两名其他角色花色不同时转移手牌', async () => {
    const me = P('尹夫人', 0);
    const a = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const b = P('乙', 2, { hand: [mkCard({ suit: Suit.SPADE })] });
    const { deps, fx } = makeHarness([me, a, b]);
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('媵予'))).toBe(true);
  });

  it('拥嬖：媵予成功发动后，受到大于 1 点伤害时回复 1 点', async () => {
    const me = P('尹夫人', 0);
    const a = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const b = P('乙', 2, { hand: [mkCard({ suit: Suit.SPADE })] });
    const { deps, fx } = makeHarness([me, a, b]);
    await dispatchTurnStart(deps, me);
    const before = fx.healed.filter(h => h.playerId === 0).length;
    await dispatchAfterDamage(deps, { victim: me, source: a, amount: 2, nature: 'normal', card: mkCard() });
    expect(fx.healed.filter(h => h.playerId === 0).length).toBe(before + 1);
  });

  it('拥嬖：伤害不超过 1 点不回复', async () => {
    const me = P('尹夫人', 0);
    const a = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const b = P('乙', 2, { hand: [mkCard({ suit: Suit.SPADE })] });
    const { deps, fx } = makeHarness([me, a, b]);
    await dispatchTurnStart(deps, me);
    const before = fx.healed.filter(h => h.playerId === 0).length;
    await dispatchAfterDamage(deps, { victim: me, source: a, amount: 1, nature: 'normal', card: mkCard() });
    expect(fx.healed.filter(h => h.playerId === 0).length).toBe(before);
  });
});

describe('卞玥「无胁」', () => {
  it('回合结束交换手牌', async () => {
    const me = P('卞玥', 0, { hand: [mkCard()] });
    const other = P('甲', 1, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, other]);
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('无胁'))).toBe(true);
  });
});

describe('薛灵芸「暗织」', () => {
  it('自己判定红色时摸两张', async () => {
    const me = P('薛灵芸', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchJudge(deps, { owner: me, card: mkCard({ suit: Suit.HEART }), reason: 'x' });
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('他人判定不触发', async () => {
    const me = P('薛灵芸', 0);
    const other = P('甲', 1);
    const { deps, fx } = makeHarness([me, other]);
    await dispatchJudge(deps, { owner: other, card: mkCard({ suit: Suit.HEART }), reason: 'x' });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('莫琼树「宛蝉」', () => {
  it('回合开始令他人摸一张', async () => {
    const me = P('莫琼树', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(drawnFor(fx, 1)).toBe(1);
  });
});

describe('夏侯令女「浮萍」与「炜烈」', () => {
  it('浮萍：回合开始记录一种牌名', async () => {
    const me = P('夏侯令女', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('浮萍'))).toBe(true);
  });

  it('炜烈：有受伤友军时弃牌治疗', async () => {
    const me = P('夏侯令女', 0, { hand: [mkCard()] });
    const hurt = P('友', 1, { hp: 1, maxHp: 4 });
    const { deps, fx } = makeHarness([me, hurt]);
    await dispatchTurnStart(deps, me);
    expect(fx.healed.some(h => h.playerId === 1)).toBe(true);
  });

  it('炜烈：无人受伤时不发动', async () => {
    const me = P('夏侯令女', 0, { hand: [mkCard()] });
    const full = P('友', 1, { hp: 4, maxHp: 4 });
    const { deps, fx } = makeHarness([me, full]);
    await dispatchTurnStart(deps, me);
    expect(fx.healed.length).toBe(0);
  });
});

describe('柳婒「经音」与「迟行」', () => {
  it('经音：他人回合外使用【杀】后可获得', async () => {
    const me = P('柳婒', 1);
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, me]);
    deps.turnOwner = P('丙', 2);
    await dispatchCardUsed(deps, { source: other, card: mkCard(), targets: [], usedCount: 1 });
    expect(fx.logs.some(l => l.includes('经音'))).toBe(true);
  });

  it('迟行：无记录时不摸牌', async () => {
    const me = P('柳婒', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('李娴「缢节」', () => {
  it('他人获得她的牌后回复 1 点，每回合最多两次', async () => {
    const me = P('李娴', 1);
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, me]);
    for (let i = 0; i < 5; i++) {
      await dispatchCardUsed(deps, { source: other, card: mkCard(), targets: [me], usedCount: i + 1 });
    }
    expect(fx.healed.filter(h => h.playerId === 1).length).toBe(2);
  });
});

describe('杨婉「诱言」', () => {
  it('回合结束触发诱言', async () => {
    const me = P('杨婉', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('诱言'))).toBe(true);
  });
});

describe('张瑾云「继椒」', () => {
  it('回合结束触发继椒', async () => {
    const me = P('张瑾云', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('继椒'))).toBe(true);
  });
});

describe('王笙「遭谮」', () => {
  it('他人回合结束时造成 1 点伤害', async () => {
    const me = P('王笙', 1, { hand: [mkCard()] });
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, me]);
    await dispatchTurnEnd(deps, other);
    expect(damageFrom(fx, 1)).toBe(1);
  });

  it('自己回合结束不触发', async () => {
    const me = P('王笙', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnEnd(deps, me);
    expect(damageFrom(fx, 0)).toBe(0);
  });
});

describe('张嫙「奢葬」', () => {
  it('濒死时摸四张', async () => {
    const me = P('张嫙', 0, { hp: 0 });
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchAfterDamage(deps, { victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(4);
  });

  it('未濒死不触发', async () => {
    const me = P('张嫙', 0, { hp: 3 });
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchAfterDamage(deps, { victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('曹媛「占欲」', () => {
  it('回合开始夺取他人同花色手牌', async () => {
    const me = P('曹媛', 0, { hand: [mkCard({ suit: Suit.HEART })] });
    const other = P('甲', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([me, other]);
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('占欲'))).toBe(true);
  });
});

describe('董翓「狡黠」与「狐魅」', () => {
  it('狡黠：回合开始手牌视为【杀】', async () => {
    const me = P('董翓', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('狡黠'))).toBe(true);
  });

  it('狐魅：造成伤害后令目标摸一张', async () => {
    const me = P('董翓', 0);
    const foe = P('甲', 1, { hp: 2, maxHp: 4 });
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchAfterDealDamage(deps, { victim: foe, source: me, amount: 2, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 1)).toBe(1);
  });

  it('狐魅：他人造成的伤害不触发', async () => {
    const me = P('董翓', 0);
    const foe = P('甲', 1, { hp: 2 });
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchAfterDealDamage(deps, { victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard() });
    expect(drawnFor(fx, 1)).toBe(0);
  });
});
