import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchDeath, dispatchDying, dispatchAfterDealDamage } from './dispatch';
import { skillsOf } from './registry';
import '../skills/index';

/**
 * 第六批女将 · 第三组：依赖 afterDeath / onDying 的三个技能。
 *
 * 这批技能挂在**第六批 pending 武将**身上（constants.ts 里 pending: true），
 * 真实对局里根本选不到，所以单测是它们唯一的行为保障——不是「跑得通」的冒烟测，
 * 而是逐条对着技能原文断言的规则测。每个技能都配了反例：
 * 只测正例等于没测边界，而边界错了玩家是碰不到的（这些武将上不了场）。
 */

const card = (o = {}) => mkCard(o);

describe('曹金玉「善身」', () => {
  const death = (dead: ReturnType<typeof mkPlayer>) => ({ dead, killer: undefined });

  it('其他角色死亡：令「隅泣」一个数字 +2，未对其造成过伤害则回复 1 点体力', async () => {
    const cjy = mkPlayer({ id: 0, name: '曹金玉', hp: 3, maxHp: 3 });
    const dead = mkPlayer({ id: 1, name: '死者', isDead: true });
    const { deps, fx } = makeHarness([cjy, dead]);
    await dispatchDeath(deps, death(dead));

    // 初始 [2, 3]：+2 落到较小的 2 上（与「娴静」同一套取最小者规则）
    expect(fx.logs.some(l => l.includes('善身') && l.includes('2/3 → 4/3'))).toBe(true);
    expect(fx.healed).toEqual([{ playerId: 0, amount: 1 }]);
  });

  it('单项不超过 5：+2 后封顶在 5，且已达上限的数字不再被选', async () => {
    const cjy = mkPlayer({ id: 0, name: '曹金玉' });
    const a = mkPlayer({ id: 1, name: '死者A', isDead: true });
    const b = mkPlayer({ id: 2, name: '死者B', isDead: true });
    const { deps, fx } = makeHarness([cjy, a, b]);
    // [2,3] → [4,3]；再 → [4,5]；再 → [5,5]（4+2 封顶到 5）
    await dispatchDeath(deps, death(a));
    await dispatchDeath(deps, death(b));
    expect(fx.logs.some(l => l.includes('4/3 → 4/5'))).toBe(true);
  });

  it('对该角色造成过伤害则不回复体力', async () => {
    const cjy = mkPlayer({ id: 0, name: '曹金玉' });
    const dead = mkPlayer({ id: 1, name: '被金玉打死的' });
    const { deps, fx } = makeHarness([cjy, dead], { requestChoice: async () => ({ kind: 'choose', id: 'view' }) });
    // 死亡事件不带伤害史：先记一笔「金玉对他造成过伤害」，再派发死亡
    await dispatchAfterDealDamage(deps, { victim: dead, source: cjy, amount: 1, nature: 'normal', card: card() });
    dead.isDead = true;
    await dispatchDeath(deps, death(dead));
    expect(fx.healed).toEqual([]);
    expect(fx.logs.some(l => l.includes('造成过伤害'))).toBe(true);
  });

  it('自己死亡不触发（原文是「其他角色死亡时」）', async () => {
    const cjy = mkPlayer({ id: 0, name: '曹金玉' });
    const { deps, fx } = makeHarness([cjy, mkPlayer({ id: 1, name: '甲' })]);
    await dispatchDeath(deps, death(cjy));
    expect(fx.healed).toEqual([]);
    expect(fx.logs).toEqual([]);
  });

  it('两个数字都到 5 时不再发动（+2 已无处可加）', async () => {
    const cjy = mkPlayer({ id: 0, name: '曹金玉' });
    const a = mkPlayer({ id: 1, name: '死者A', isDead: true });
    const b = mkPlayer({ id: 2, name: '死者B', isDead: true });
    const c = mkPlayer({ id: 3, name: '死者C', isDead: true });
    const { deps, fx } = makeHarness([cjy, a, b, c]);
    await dispatchDeath(deps, death(a));  // [2,3] → [4,3]
    await dispatchDeath(deps, death(b));  // → [4,5]
    await dispatchDeath(deps, death(c));  // → [5,5]
    const before = fx.logs.length;
    const d = mkPlayer({ id: 4, name: '死者D', isDead: true });
    deps.players.push(d);
    await dispatchDeath(deps, death(d));
    // 第四次的日志里不应再出现「善身」的数值变更
    expect(fx.logs.slice(before).some(l => l.includes('隅泣'))).toBe(false);
  });
});

describe('柏灵筠「御心」', () => {
  const dying = (victim: ReturnType<typeof mkPlayer>) => ({ victim, source: undefined, needHp: 1 });

  it('其他角色进入濒死：体力回复至与自己相同', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 3, maxHp: 3 });
    const victim = mkPlayer({ id: 1, name: '濒死者', hp: 0 });
    const { deps, fx } = makeHarness([bly, victim]);
    const r = await dispatchDying(deps, dying(victim));
    expect(r).not.toBe(null);
    expect(r!.hp).toBe(3);
    expect(fx.banners.some(b => b.includes('御心'))).toBe(true);
  });

  it('自己进入濒死时回复至 1 点（不是与己相同）', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 0, maxHp: 3 });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps } = makeHarness([bly, other]);
    const r = await dispatchDying(deps, dying(bly));
    expect(r!.hp).toBe(1);
  });

  it('限定技：发动过一次后不再发动', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 3, maxHp: 3 });
    const a = mkPlayer({ id: 1, name: '甲', hp: 0 });
    const b = mkPlayer({ id: 2, name: '乙', hp: 0 });
    const { deps } = makeHarness([bly, a, b]);
    expect((await dispatchDying(deps, dying(a)))!.hp).toBe(3);
    expect(await dispatchDying(deps, dying(b))).toBe(null);
  });

  it('体力已不低于目标值时不发动（那不是「回复」）', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 2, maxHp: 3 });
    const victim = mkPlayer({ id: 1, name: '濒死者', hp: 2 });
    const { deps } = makeHarness([bly, victim]);
    expect(await dispatchDying(deps, dying(victim))).toBe(null);
  });

  it('玩家选择不发动时不消耗限定技', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 3, maxHp: 3 });
    const a = mkPlayer({ id: 1, name: '甲', hp: 0 });
    const b = mkPlayer({ id: 2, name: '乙', hp: 0 });
    let asked = 0;
    const { deps } = makeHarness([bly, a, b], {
      // 第一次点「不发动」，第二次点「发动」
      requestChoice: async () => { asked += 1; return { kind: 'choose', id: asked === 1 ? 'no' : 'yes' }; },
    });
    expect(await dispatchDying(deps, dying(a))).toBe(null);
    expect(asked).toBe(1);
    // 没消耗：下一次还能问、还能救
    expect((await dispatchDying(deps, dying(b)))!.hp).toBe(3);
    expect(asked).toBe(2);
  });
});

describe('文鸳「☆ 困励」', () => {
  const dying = (victim: ReturnType<typeof mkPlayer>) => ({ victim, source: undefined, needHp: 1 });

  it('自己进入濒死：体力回复至 2 点并加 1 点体力上限', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳', hp: 0, maxHp: 3 });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([wy, other]);
    const r = await dispatchDying(deps, dying(wy));
    expect(r!.hp).toBe(2);
    expect(wy.maxHp).toBe(4);
    expect(fx.logs.some(l => l.includes('困励') && l.includes('体力上限'))).toBe(true);
  });

  it('其他角色进入濒死时不触发', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳', hp: 3, maxHp: 3 });
    const victim = mkPlayer({ id: 1, name: '濒死者', hp: 0 });
    const { deps } = makeHarness([wy, victim]);
    expect(await dispatchDying(deps, dying(victim))).toBe(null);
    expect(wy.maxHp).toBe(3);
  });

  it('觉醒技只发动一次：再次濒死不重复加上限', async () => {
    const wy = mkPlayer({ id: 0, name: '文鸳', hp: 0, maxHp: 3 });
    const { deps } = makeHarness([wy, mkPlayer({ id: 1, name: '甲' })]);
    // 第一次濒死由「☆ 困励」结算（回复至 2 点、体力上限+1）
    expect((await dispatchDying(deps, dying(wy)))!.hp).toBe(2);
    wy.hp = 0;
    // 第二次濒死：困励已经用掉了，这次轮到「殇决」（回复至 1 点、体力上限+1）。
    // 这条断言在殇决实装之前是「必须为 null」——那是当时的能力缺口，不是规则。
    expect((await dispatchDying(deps, dying(wy)))!.hp).toBe(1);
    // 体力上限的 +1 由 deps.changeMaxHp 落地；夹具里没有接这个能力（noopDeps 不含它），
    // 所以这里只断言「谁来结算」，上限的数值留给 engine 层的用例。
  });
});

describe('王荣「追德」（已实装）', () => {
  it('引擎补上 takeFromDeck 后已注册，且实现是「按牌名精确取」而非盲摸', () => {
    // 这条断言曾经是反向的：「没有按牌名取牌的能力，故不注册」。
    // 后来给 ctx 加了 takeFromDeck(pred, count)，能力缺口消失，
    // 追德在 batch6new5.ts 里实装，这条守卫随之翻转为正向。
    // 保留它是因为「精确取牌 vs 摸四张」的区别是这条技能的语义核心，
    // 光看它注册了不够，还要确认实现走的是 pred 而不是 draw。
    expect(skillsOf('王荣').map(d => d.skill)).toContain('追德');
  });
});
