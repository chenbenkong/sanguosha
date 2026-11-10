import { describe, expect, it } from 'vitest';
import { CardName, CardType, Suit } from '../../../types';
import { mkCard, mkPlayer, makeHarness, drawnFor, damageFrom } from './testHarness';
import { dispatchTurnEnd, dispatchTurnStart, dispatchAfterDamage, dispatchJudge, dispatchCardUsed } from './dispatch';
import './index';

/**
 * 技能行为测试：断言「规则对不对」，而不只是「跑不跑得动」。
 *
 * 覆盖 src/game/skills/ 下已注册的全部武将技能。每个用例构造一副可控牌局，
 * 触发对应时机，然后断言产生的副作用（摸牌数 / 伤害 / 回血 / 弃牌 / 日志）。
 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('王悦 / 王桃「护关」', () => {
  it('红色首牌触发，声明花色并写入日志', async () => {
    const me = P('王悦', 0, { hand: [mkCard({ suit: Suit.HEART }), mkCard({ suit: Suit.HEART })] });
    const foe = P('敌人', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchCardUsed(deps, {
      source: me, card: mkCard({ suit: Suit.HEART }), targets: [foe], usedCount: 1,
    });
    expect(fx.logs.some(l => l.includes('护关'))).toBe(true);
    expect(me.huguanSuit).toBe(Suit.HEART);
  });

  it('黑色首牌不触发', async () => {
    const me = P('王悦', 0, { hand: [mkCard({ suit: Suit.SPADE })] });
    const foe = P('敌人', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchCardUsed(deps, {
      source: me, card: mkCard({ suit: Suit.SPADE }), targets: [foe], usedCount: 1,
    });
    expect(fx.logs.some(l => l.includes('护关'))).toBe(false);
  });

  it('不是本回合第一张牌则不触发', async () => {
    const me = P('王桃', 0, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([me, P('敌人', 1)]);
    await dispatchCardUsed(deps, {
      source: me, card: mkCard({ suit: Suit.HEART }), targets: [], usedCount: 2,
    });
    expect(fx.logs.some(l => l.includes('护关'))).toBe(false);
  });
});

describe('张宁「天则」', () => {
  it('他人黑色判定后张宁摸一张', async () => {
    const zn = P('张宁', 1, { hand: [mkCard({ suit: Suit.SPADE })] });
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, zn]);
    await dispatchJudge(deps, { owner: other, card: mkCard({ suit: Suit.SPADE }), reason: '乐不思蜀' });
    expect(drawnFor(fx, 1)).toBe(1);
  });

  it('红色判定不触发', async () => {
    const zn = P('张宁', 1);
    const { deps, fx } = makeHarness([P('甲', 0), zn]);
    await dispatchJudge(deps, { owner: P('甲', 0), card: mkCard({ suit: Suit.HEART }), reason: 'x' });
    expect(drawnFor(fx, 1)).toBe(0);
  });

  it('张宁自己判定不触发', async () => {
    const zn = P('张宁', 0);
    const { deps, fx } = makeHarness([zn]);
    await dispatchJudge(deps, { owner: zn, card: mkCard({ suit: Suit.SPADE }), reason: 'x' });
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('他人首张黑牌结算后，张宁弃黑牌造成 1 点伤害', async () => {
    const zn = P('张宁', 1, { hand: [mkCard({ suit: Suit.CLUB })] });
    const other = P('甲', 0);
    const { deps, fx } = makeHarness([other, zn]);
    await dispatchCardUsed(deps, {
      source: other, card: mkCard({ suit: Suit.SPADE }), targets: [zn], usedCount: 1,
    });
    expect(damageFrom(fx, 1)).toBe(1);
  });

  it('张宁没有黑牌时无法反击', async () => {
    const zn = P('张宁', 1, { hand: [mkCard({ suit: Suit.HEART })] });
    const { deps, fx } = makeHarness([P('甲', 0), zn]);
    await dispatchCardUsed(deps, {
      source: P('甲', 0), card: mkCard({ suit: Suit.SPADE }), targets: [zn], usedCount: 1,
    });
    expect(damageFrom(fx, 1)).toBe(0);
  });
});

describe('袁姬「芳妒」/「节行」', () => {
  it('回合外首次普通伤害回复 1 点', async () => {
    const me = P('袁姬', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, me]);
    deps.turnOwner = foe;
    await dispatchAfterDamage(deps, {
      victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(fx.healed.some(h => h.playerId === 1 && h.amount === 1)).toBe(true);
  });

  it('属性伤害改为夺取来源一张手牌（这里断言不回复）', async () => {
    const me = P('袁姬', 1);
    const foe = P('甲', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([foe, me]);
    deps.turnOwner = foe;
    await dispatchAfterDamage(deps, {
      victim: me, source: foe, amount: 1, nature: 'fire', card: mkCard(),
    });
    expect(fx.healed.length).toBe(0);
  });

  it('回合内受伤不触发芳妒', async () => {
    const me = P('袁姬', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, me]);
    deps.turnOwner = me;
    await dispatchAfterDamage(deps, {
      victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(fx.healed.length).toBe(0);
  });
});

describe('朱佩兰「辞虑」', () => {
  it('成为普通锦囊目标后摸牌，且次数递减至 3 次后停止', async () => {
    const zp = P('朱佩兰', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, zp]);
    const scroll = mkCard({ type: CardType.SCROLL });
    for (let i = 0; i < 5; i++) {
      await dispatchCardUsed(deps, { source: foe, card: scroll, targets: [zp], usedCount: i + 1 });
    }
    // 剩余选项 3/2/1 各触发一次，共 6 张，之后不再触发
    expect(drawnFor(fx, 1)).toBe(6);
  });

  it('成为基本牌目标不触发', async () => {
    const zp = P('朱佩兰', 1);
    const { deps, fx } = makeHarness([P('甲', 0), zp]);
    await dispatchCardUsed(deps, {
      source: P('甲', 0), card: mkCard({ type: CardType.BASIC }), targets: [zp], usedCount: 1,
    });
    expect(drawnFor(fx, 1)).toBe(0);
  });
});

describe('严夫人「匿伏」', () => {
  it('手牌不足三张时摸到三张', async () => {
    const me = P('严夫人', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnEnd(deps, me);
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('手牌超过三张时弃到三张', async () => {
    const me = P('严夫人', 0, { hand: [mkCard(), mkCard(), mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnEnd(deps, me);
    expect(fx.discarded.some(d => d.playerId === 0 && d.count === 2)).toBe(true);
  });

  it('正好三张时不动', async () => {
    const me = P('严夫人', 0, { hand: [mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchTurnEnd(deps, me);
    expect(fx.drawn.length + fx.discarded.length).toBe(0);
  });
});

describe('孙翎鸾「聆乐」', () => {
  it('他人造成本轮首次伤害后摸一张', async () => {
    const sl = P('孙翎鸾', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, sl]);
    await dispatchAfterDamage(deps, {
      victim: sl, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(drawnFor(fx, 1)).toBe(1);
  });

  it('同一角色本轮第二次伤害不再触发', async () => {
    const sl = P('孙翎鸾', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, sl]);
    const ev = { victim: sl, source: foe, amount: 1, nature: 'normal' as const, card: mkCard() };
    await dispatchAfterDamage(deps, ev);
    await dispatchAfterDamage(deps, ev);
    expect(drawnFor(fx, 1)).toBe(1);
  });

  it('自己造成伤害不触发', async () => {
    const sl = P('孙翎鸾', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([sl, foe]);
    await dispatchAfterDamage(deps, {
      victim: foe, source: sl, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('谢灵毓「元嫡」', () => {
  it('他人首张牌未指定他人时双方各摸一张', async () => {
    const xl = P('谢灵毓', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, xl]);
    await dispatchCardUsed(deps, {
      source: foe, card: mkCard(), targets: [], usedCount: 1,
    });
    expect(drawnFor(fx, 1)).toBe(1);
    expect(drawnFor(fx, 0)).toBe(1);
  });

  it('首张牌指定了他人则不触发', async () => {
    const xl = P('谢灵毓', 1);
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, xl]);
    await dispatchCardUsed(deps, {
      source: foe, card: mkCard(), targets: [xl], usedCount: 1,
    });
    expect(drawnFor(fx, 1)).toBe(0);
  });
});

describe('唐姬「抗歌」', () => {
  it('首个回合结束选定守护对象', async () => {
    const tj = P('唐姬', 0);
    const ally = P('友', 1, { hp: 2 });
    const foe = P('敌', 2, { hp: 1 });
    const { deps } = makeHarness([tj, ally, foe]);
    await dispatchTurnEnd(deps, tj);
    expect(tj.kanggeTargetId).toBe(1);
  });
});

describe('薛灵芸「霞泪」', () => {
  it('红色牌使用后摸牌，每回合最多 3 次', async () => {
    const x = P('薛灵芸', 0);
    const { deps, fx } = makeHarness([x, P('甲', 1)]);
    for (let i = 0; i < 6; i++) {
      await dispatchCardUsed(deps, {
        source: x, card: mkCard({ suit: Suit.HEART }), targets: [], usedCount: i + 1,
      });
    }
    expect(drawnFor(fx, 0)).toBe(3);
  });

  it('黑色牌不触发霞泪', async () => {
    const x = P('薛灵芸', 0);
    const { deps, fx } = makeHarness([x, P('甲', 1)]);
    await dispatchCardUsed(deps, {
      source: x, card: mkCard({ suit: Suit.SPADE }), targets: [], usedCount: 1,
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('李娴「斥怠」', () => {
  it('目标手牌少于体力时回复并摸牌', async () => {
    const lx = P('李娴', 0);
    const target = P('甲', 1, { hp: 3, hand: [] });
    const { deps, fx } = makeHarness([lx, target]);
    await dispatchTurnStart(deps, target);
    expect(fx.healed.some(h => h.playerId === 1)).toBe(true);
  });

  it('每轮最多三次', async () => {
    const lx = P('李娴', 0);
    const target = P('甲', 1, { hp: 3, hand: [] });
    const { deps, fx } = makeHarness([lx, target]);
    for (let i = 0; i < 6; i++) await dispatchTurnStart(deps, target);
    expect(fx.healed.filter(h => h.playerId === 1).length).toBe(3);
  });
});

describe('杨婉「追还」', () => {
  it('目标体力不低于杨婉时受到 2 点伤害', async () => {
    const yw = P('杨婉', 0, { hp: 2 });
    const target = P('甲', 1, { hp: 4 });
    const { deps, fx } = makeHarness([yw, target]);
    await dispatchTurnEnd(deps, yw);
    expect(damageFrom(fx, 0)).toBe(2);
  });
});

describe('张瑾云「蕙质」', () => {
  it('摸至全场最多手牌（上限 5）', async () => {
    const zj = P('张瑾云', 0, { hand: [] });
    const rich = P('甲', 1, { hand: [mkCard(), mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([zj, rich]);
    await dispatchTurnStart(deps, zj);
    expect(drawnFor(fx, 0)).toBe(3);
  });

  it('摸牌数不超过 5', async () => {
    const zj = P('张瑾云', 0, { hand: [] });
    const rich = P('甲', 1, { hand: Array.from({ length: 9 }, () => mkCard()) });
    const { deps, fx } = makeHarness([zj, rich]);
    await dispatchTurnStart(deps, zj);
    expect(drawnFor(fx, 0)).toBe(5);
  });
});

describe('曹媛「妩艳」', () => {
  it('在场有男性且有手牌时自己摸两张', async () => {
    const cy = P('曹媛', 0);
    const male = mkPlayer({ name: '甲', id: 1, hero: { id: 'm', name: '甲', kingdom: '魏', maxHp: 4, avatarUrl: '', description: '', skillName: '', skillDesc: '', gender: 'male' }, hand: [mkCard()] });
    const { deps, fx } = makeHarness([cy, male]);
    await dispatchTurnStart(deps, cy);
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('没有男性角色时不触发', async () => {
    const cy = P('曹媛', 0);
    const { deps, fx } = makeHarness([cy, P('甲', 1)]);
    await dispatchTurnStart(deps, cy);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('技能对死亡角色失效', () => {
  it('已阵亡的武将不再触发任何技能', async () => {
    const dead = P('严夫人', 0, { isDead: true, hand: [] });
    const { deps, fx } = makeHarness([dead, P('甲', 1)]);
    await dispatchTurnEnd(deps, dead);
    expect(fx.drawn.length).toBe(0);
  });
});

describe('技能被封印时失效', () => {
  it('skillsOn 返回 false 时技能不触发', async () => {
    const me = P('严夫人', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)], { skillsOn: () => false });
    await dispatchTurnEnd(deps, me);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});
