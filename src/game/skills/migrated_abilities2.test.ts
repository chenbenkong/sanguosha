import { describe, expect, it } from 'vitest';
import { CardName, CardType, Suit } from '../../../types';
import { mkCard, mkPlayer, makeHarness } from './testHarness';
import { dispatchDamageBefore } from './dispatch';
import './index';

/**
 * 迁移批次 2（judgeBefore / damageBefore）的行为测试。
 *
 * 每技能正反两条：正向断言钩子的修正值，反向断言「不满足条件时完全不干预」
 * （返回空对象、且没有产生弃牌/日志/横幅）。
 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

const male = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  P(name, id, {
    ...over,
    hero: { ...mkPlayer({ name }).hero, gender: 'male' },
  });

describe('孙鲁班「骄矜」', () => {
  it('受到男性角色的 2 点伤害时弃装备并令伤害 -1', async () => {
    const weapon = mkCard({ name: CardName.QINGGANG, type: CardType.EQUIPMENT });
    const me = P('孙鲁班', 0, { hp: 3, maxHp: 3, equipment: { weapon } });
    const foe = male('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r.amount).toBe(1);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
    expect(me.equipment?.weapon).toBeUndefined();
    expect(fx.logs.some((l) => l.includes('骄矜'))).toBe(true);
    expect(fx.banners).toContain('孙鲁班:骄矜');
  });

  it('伤害来源是女性角色时不发动', async () => {
    const weapon = mkCard({ name: CardName.QINGGANG, type: CardType.EQUIPMENT });
    const me = P('孙鲁班', 0, { hp: 3, maxHp: 3, equipment: { weapon } });
    const foe = P('甲', 1); // mkPlayer 默认 gender: 'female'
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 3, nature: 'normal', card: mkCard(),
    });
    expect(r).toEqual({});
    expect(fx.discarded).toEqual([]);
    expect(me.equipment?.weapon).toBe(weapon);
  });
});

describe('灵雎「竭缘」（受伤侧）', () => {
  it('来源体力不低于自己时弃红色手牌令伤害 -1', async () => {
    const red = mkCard({ name: CardName.SHAN, suit: Suit.HEART });
    const me = P('灵雎', 0, { hp: 2, maxHp: 3, hand: [red] });
    const foe = P('甲', 1, { hp: 3, maxHp: 3 });
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r.amount).toBe(1);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
    expect(fx.banners).toContain('灵雎:竭缘');
  });

  it('来源体力低于自己时不发动', async () => {
    const red = mkCard({ name: CardName.SHAN, suit: Suit.HEART });
    const me = P('灵雎', 0, { hp: 3, maxHp: 3, hand: [red] });
    const foe = P('甲', 1, { hp: 2, maxHp: 3 });
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r).toEqual({});
    expect(fx.discarded).toEqual([]);
  });

  it('体力大于 2 时不弃【桃】', async () => {
    const tao = mkCard({ name: CardName.TAO, suit: Suit.DIAMOND });
    const me = P('灵雎', 0, { hp: 3, maxHp: 3, hand: [tao] });
    const foe = P('甲', 1, { hp: 3, maxHp: 3 });
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(r).toEqual({});
    expect(fx.discarded).toEqual([]);
  });
});

describe('胡金定「仁释」', () => {
  it('已受伤时受到【杀】伤害：防止并获得此【杀】，体力上限 -1', async () => {
    const sha = mkCard({ name: CardName.SHA });
    const me = P('胡金定', 0, { hp: 2, maxHp: 4 });
    const foe = male('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 1, nature: 'normal', card: sha,
    });
    expect(r.prevent).toBe(true);
    expect(me.maxHp).toBe(3);
    expect(fx.banners).toContain('胡金定:仁释');
  });

  it('未受伤时不发动', async () => {
    const sha = mkCard({ name: CardName.SHA });
    const me = P('胡金定', 0, { hp: 4, maxHp: 4 });
    const foe = male('甲', 1);
    const { deps } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 1, nature: 'normal', card: sha,
    });
    expect(r).toEqual({});
    expect(me.maxHp).toBe(4);
  });

  it('不是【杀】造成的伤害不发动', async () => {
    const me = P('胡金定', 0, { hp: 2, maxHp: 4 });
    const foe = male('甲', 1);
    const { deps } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 1, nature: 'fire', card: mkCard({ name: CardName.HUOGONG }),
    });
    expect(r).toEqual({});
  });
});

describe('小乔「天香」', () => {
  it('弃一张红桃手牌，把伤害转移给伤害来源', async () => {
    const heart = mkCard({ name: CardName.SHAN, suit: Suit.HEART });
    const me = P('小乔', 0, { hp: 3, maxHp: 3, hand: [heart] });
    const foe = male('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r.transferTo).toBe(1);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
    expect(fx.banners).toContain('小乔:天香');
  });

  it('没有红桃手牌时不发动', async () => {
    const spade = mkCard({ name: CardName.SHAN, suit: Suit.SPADE });
    const me = P('小乔', 0, { hp: 3, maxHp: 3, hand: [spade] });
    const foe = male('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r).toEqual({});
    expect(fx.discarded).toEqual([]);
  });

  it('伤害来源已阵亡时改为防止伤害（旧实现同样不再转移）', async () => {
    const heart = mkCard({ name: CardName.SHAN, suit: Suit.HEART });
    const me = P('小乔', 0, { hp: 3, maxHp: 3, hand: [heart] });
    const foe = male('甲', 1, { isDead: true });
    const { deps } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(r.prevent).toBe(true);
    expect(r.transferTo).toBeUndefined();
  });
});

describe('本批未迁移的 4 个技能不应误进注册表', () => {
  it('刚烈 / 洛神 / 铁骑 / 悲歌 仍不在注册表', async () => {
    const { skillsOf } = await import('./registry');
    expect(skillsOf('夏侯惇').some((d) => d.skill === '刚烈')).toBe(false);
    expect(skillsOf('甄姬').some((d) => d.skill === '洛神')).toBe(false);
    expect(skillsOf('马超').some((d) => d.skill === '铁骑')).toBe(false);
    expect(skillsOf('蔡文姬').some((d) => d.skill === '悲歌')).toBe(false);
  });
});
