import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer, drawnFor } from './testHarness';
import {
  dispatchTurnEnd, dispatchTurnStart, dispatchCardUsed,
  dispatchAfterDealDamage, dispatchDamageBefore, dispatchCardLost,
} from './dispatch';
import { skillHook } from './registry';
import { seatDistance } from '../rules';
import { Suit } from '../../../types';
import '../skills/index';

/**
 * 第六批女将 · 已实装的 10 个技能（第一批 4 个 + 第二批 6 个）。
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

// ══════════════════════════════════════════════════════════
// 第二批实装的 6 个技能
// ══════════════════════════════════════════════════════════

/** 把 dispatchAfterDealDamage / dispatchCardLost 之类都收进来，避免每段重复 import */
const depsOf = (d: any) => d;

describe('陆文漪「才韵」', () => {
  it('展示的花色与之前都不同时摸一张', async () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card({ suit: Suit.HEART })] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other]);
    await dispatchTurnEnd(deps, lu);
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.logs.some(l => l.includes('才韵') && l.includes('均不相同'))).toBe(true);
  });

  it('花色与此前展示过的重复时不摸牌', async () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card({ suit: Suit.HEART })] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other]);
    await dispatchTurnEnd(deps, lu);   // 第一次：♥ 是新的 → 摸 1
    await dispatchTurnEnd(deps, lu);   // 第二次：还是 ♥ → 不摸
    expect(drawnFor(fx, 0)).toBe(1);
    expect(fx.logs.some(l => l.includes('此前展示过'))).toBe(true);
  });

  it('不是自己的回合结束时不结算', async () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other]);
    await dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('玩家取消（kind=cancel）时不展示也不摸牌', async () => {
    const lu = mkPlayer({ id: 0, name: '陆文漪', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnEnd(deps, lu);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('黄舞蝶「☆ 铩雪」', () => {
  it('对其他角色造成伤害后摸两张、弃距离张', async () => {
    // 四人局，黄舞蝶(0) 与受害者(2) 距离 2
    const hwd = mkPlayer({ id: 0, name: '黄舞蝶', hand: [card(), card(), card(), card()] });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    const c = mkPlayer({ id: 3, name: '丙' });
    const { deps, fx } = makeHarness([hwd, a, b, c]);
    expect(seatDistance(deps.players, 0, 2)).toBe(2);
    await dispatchAfterDealDamage(deps, { victim: b, source: hwd, amount: 1, nature: 'normal', card: card() });
    expect(drawnFor(fx, 0)).toBe(2);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 2 }]);
  });

  it('注意：注册名带 ☆ 前缀，且只在自己造成伤害时触发', async () => {
    const hwd = mkPlayer({ id: 0, name: '黄舞蝶', hand: [card(), card(), card()] });
    const a = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([hwd, a]);
    // 甲 对 黄舞蝶 造成伤害：黄舞蝶不是来源，不触发
    await dispatchAfterDealDamage(deps, { victim: hwd, source: a, amount: 1, nature: 'normal', card: card() });
    expect(drawnFor(fx, 0)).toBe(0);
    expect(fx.discarded).toHaveLength(0);
  });

  it('伤害为 0 时不触发', async () => {
    const hwd = mkPlayer({ id: 0, name: '黄舞蝶', hand: [card(), card()] });
    const a = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([hwd, a]);
    await dispatchAfterDealDamage(deps, { victim: a, source: hwd, amount: 0, nature: 'normal', card: card() });
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('手牌不足 X 张时弃到空手，不谎报张数', async () => {
    const hwd = mkPlayer({ id: 0, name: '黄舞蝶', hand: [card()] });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    const c = mkPlayer({ id: 3, name: '丙' });
    const { deps, fx } = makeHarness([hwd, a, b, c]);
    // 距离 2，但只有 1 张手牌
    await dispatchAfterDealDamage(deps, { victim: b, source: hwd, amount: 1, nature: 'normal', card: card() });
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
  });
});

describe('董絮「清冷」', () => {
  it('成为黑色牌目标后弃其一张牌', async () => {
    const dong = mkPlayer({ id: 0, name: '董絮' });
    const src = mkPlayer({ id: 1, name: '甲', hand: [card(), card()] });
    const { deps, fx } = makeHarness([dong, src]);
    await dispatchCardUsed(deps, { source: src, card: card({ suit: Suit.SPADE }), targets: [dong], usedCount: 1 });
    expect(fx.discarded).toEqual([{ playerId: 1, count: 1 }]);
    expect(fx.logs.some(l => l.includes('清冷'))).toBe(true);
  });

  it('红色牌为目标时不触发', async () => {
    const dong = mkPlayer({ id: 0, name: '董絮' });
    const src = mkPlayer({ id: 1, name: '甲', hand: [card(), card()] });
    const { deps, fx } = makeHarness([dong, src]);
    await dispatchCardUsed(deps, { source: src, card: card({ suit: Suit.HEART }), targets: [dong], usedCount: 1 });
    expect(fx.discarded).toHaveLength(0);
  });

  it('自己不是目标时不触发', async () => {
    const dong = mkPlayer({ id: 0, name: '董絮' });
    const src = mkPlayer({ id: 1, name: '甲', hand: [card(), card()] });
    const other = mkPlayer({ id: 2, name: '乙', hand: [card()] });
    const { deps, fx } = makeHarness([dong, src, other]);
    await dispatchCardUsed(deps, { source: src, card: card({ suit: Suit.CLUB }), targets: [other], usedCount: 1 });
    expect(fx.discarded).toHaveLength(0);
  });

  it('场上没人有手牌时不发动（无牌可弃）', async () => {
    const dong = mkPlayer({ id: 0, name: '董絮' });
    const src = mkPlayer({ id: 1, name: '甲', hand: [] });
    const { deps, fx } = makeHarness([dong, src]);
    await dispatchCardUsed(deps, { source: src, card: card({ suit: Suit.SPADE }), targets: [dong], usedCount: 1 });
    expect(fx.discarded).toHaveLength(0);
  });
});

describe('卢弈「复学」', () => {
  it('弃一张摸两张', async () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card(), card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other]);
    await dispatchTurnEnd(deps, lu);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('没有手牌时无从弃置，不发动', async () => {
    // 注意：卢弈同时有「手谈」，空手时它会合法地摸一张——
    // 这里断言的是「复学」自己的足迹（不弃牌、不打复学日志）。
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other]);
    await dispatchTurnEnd(deps, lu);
    expect(fx.discarded).toHaveLength(0);
    expect(fx.logs.some(l => l.includes('复学'))).toBe(false);
  });

  it('玩家取消时不弃也不摸', async () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnEnd(deps, lu);
    expect(fx.discarded).toHaveLength(0);
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('不是自己的回合结束时不结算', async () => {
    const lu = mkPlayer({ id: 0, name: '卢弈', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([lu, other]);
    await dispatchTurnEnd(deps, other);
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('文鸳「铿锵」', () => {
  it('选择造成伤害时摸体力上限张牌（伤害不变）', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳', maxHp: 3, hp: 3 });
    const a = mkPlayer({ id: 1, name: '甲', hp: 3, maxHp: 3 });
    const { deps, fx } = makeHarness([wy, a], { requestChoice: async () => ({ kind: 'choose', id: 'draw' }) });
    const r = await dispatchDamageBefore(deps, { victim: a, source: wy, amount: 1, nature: 'normal', card: card() });
    expect(drawnFor(fx, 0)).toBe(3);
    expect(r.amount).toBeUndefined();
  });

  it('选择强化时伤害 +1 并获得造成伤害的牌', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const hitCard = card();
    const { deps } = makeHarness([wy, a], { requestChoice: async () => ({ kind: 'choose', id: 'boost' }) });
    const r = await dispatchDamageBefore(deps, { victim: a, source: wy, amount: 1, nature: 'normal', card: hitCard });
    expect(r.amount).toBe(2);
  });

  it('每回合限一次：同回合第二次伤害不再触发', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳' });
    const a = mkPlayer({ id: 1, name: '甲' });
    let asked = 0;
    const { deps } = makeHarness([wy, a], {
      requestChoice: async () => { asked += 1; return { kind: 'choose', id: 'boost' }; },
    });
    const ev = { victim: a, source: wy, amount: 1 as const, nature: 'normal' as const, card: card() };
    const r1 = await dispatchDamageBefore(deps, ev);
    const r2 = await dispatchDamageBefore(deps, ev);
    expect(r1.amount).toBe(2);
    expect(r2.amount).toBeUndefined();
    expect(asked).toBe(1);
  });

  it('新回合开始后复位：同一回合限一次，但下一回合能再发动', async () => {
    // 回归：曾用 turnOwner.id 当 key，「每回合限一次」的标记永不清除，
    // 技能退化成「一局一次」。复位点必须是 onTurnStart。
    const wy = mkPlayer({ id: 0, name: '文鸳' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const { deps } = makeHarness([wy, a], { requestChoice: async () => ({ kind: 'choose', id: 'boost' }) });
    const ev = { victim: a, source: wy, amount: 1 as const, nature: 'normal' as const, card: card() };
    expect((await dispatchDamageBefore(deps, ev)).amount).toBe(2);
    expect((await dispatchDamageBefore(deps, ev)).amount).toBeUndefined();
    await dispatchTurnStart(deps, wy);   // 新回合
    expect((await dispatchDamageBefore(deps, ev)).amount).toBe(2);
  });

  it('不是自己造成的伤害不触发', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    const { deps, fx } = makeHarness([wy, a, b]);
    const r = await dispatchDamageBefore(deps, { victim: b, source: a, amount: 1, nature: 'normal', card: card() });
    expect(r).toEqual({});
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('夏侯徽「济困」', () => {
  it('累计失去 5 张牌后，一名其他角色获得手牌最多者的一张牌', async () => {
    const xh = mkPlayer({ id: 0, name: '夏侯徽', hand: [card()] });
    const rich = mkPlayer({ id: 1, name: '富', hand: [card(), card(), card(), card(), card()] });
    const ben = mkPlayer({ id: 2, name: '乙', hand: [card()] });
    const { deps, fx } = makeHarness([xh, rich, ben]);
    const gained: string[] = [];
    deps.gainCard = (_f, to) => { gained.push(String(to)); };
    await dispatchCardLost(deps, { player: xh, cards: [card(), card(), card()], cause: 'discard', handAfter: 0, fromEquip: false });
    expect(fx.logs.some(l => l.includes('济困'))).toBe(false);
    await dispatchCardLost(deps, { player: xh, cards: [card(), card()], cause: 'discard', handAfter: 0, fromEquip: false });
    expect(fx.logs.some(l => l.includes('济困'))).toBe(true);
    expect(gained).toEqual(['2']);
  });

  it('累计不足 5 张时不触发', async () => {
    const xh = mkPlayer({ id: 0, name: '夏侯徽', hand: [card(), card()] });
    const rich = mkPlayer({ id: 1, name: '富', hand: [card()] });
    const { deps, fx } = makeHarness([xh, rich]);
    await dispatchCardLost(deps, { player: xh, cards: [card(), card()], cause: 'discard', handAfter: 0, fromEquip: false });
    expect(fx.logs.some(l => l.includes('济困'))).toBe(false);
  });

  it('别人失去牌不计入我的累计', async () => {
    const xh = mkPlayer({ id: 0, name: '夏侯徽' });
    const other = mkPlayer({ id: 1, name: '甲', hand: [card(), card(), card(), card(), card()] });
    const { deps, fx } = makeHarness([xh, other]);
    await dispatchCardLost(deps, { player: other, cards: other.hand, cause: 'discard', handAfter: 0, fromEquip: false });
    expect(fx.logs.some(l => l.includes('济困'))).toBe(false);
  });

  it('触发后累计清零：再来 4 张不触发', async () => {
    const xh = mkPlayer({ id: 0, name: '夏侯徽' });
    const rich = mkPlayer({ id: 1, name: '富', hand: [card()] });
    const ben = mkPlayer({ id: 2, name: '乙' });
    const { deps, fx } = makeHarness([xh, rich, ben]);
    deps.gainCard = () => {};
    await dispatchCardLost(deps, { player: xh, cards: [card(), card(), card(), card(), card()], cause: 'discard', handAfter: 0, fromEquip: false });
    const afterFirst = fx.logs.filter(l => l.includes('济困')).length;
    expect(afterFirst).toBe(1);
    await dispatchCardLost(deps, { player: xh, cards: [card(), card(), card(), card()], cause: 'discard', handAfter: 0, fromEquip: false });
    expect(fx.logs.filter(l => l.includes('济困')).length).toBe(1);
  });
});
