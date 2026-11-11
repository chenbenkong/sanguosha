import { describe, expect, it } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../../types';
import type { Card, Player } from '../../types';
import { canUseFanghun, meiyanGainOnDamage, canUseFuhan, fuhanMaxHp } from './zhaoxiangRules';

/** 赵襄「芳魂 / 扶汉」规则。 */

const card = (o: Partial<Card> = {}): Card => ({
  id: 'c1', name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE, rank: '7', value: 7,
  description: '', imageColor: '', ...o,
});

const P = (name = '赵襄'): Player => ({
  id: 0, isHuman: false,
  hero: { id: 'h', name, kingdom: '蜀', maxHp: 3, avatarUrl: '', description: '', skillName: '芳魂 / 扶汉', skillDesc: '', gender: 'female' },
  hp: 3, maxHp: 3, hand: [], identity: Identity.ZHONGCHEN, isDead: false, isRevealed: true, isSelected: false,
} as Player);

const ON = { marks: 1, skillsOn: true };

describe('赵襄「芳魂」', () => {
  it('有梅影时可以把【闪】当【杀】', () => {
    expect(canUseFanghun(P(), card({ name: CardName.SHAN }), CardName.SHA, ON)).toBe(true);
  });

  it('有梅影时可以把【杀】当【闪】', () => {
    expect(canUseFanghun(P(), card({ name: CardName.SHA }), CardName.SHAN, ON)).toBe(true);
  });

  it('没有梅影时不能发动', () => {
    expect(canUseFanghun(P(), card({ name: CardName.SHAN }), CardName.SHA, { marks: 0, skillsOn: true })).toBe(false);
  });

  it('技能被封印时不能发动', () => {
    expect(canUseFanghun(P(), card({ name: CardName.SHAN }), CardName.SHA, { marks: 1, skillsOn: false })).toBe(false);
  });

  it('非赵襄不能发动', () => {
    expect(canUseFanghun(P('关羽'), card({ name: CardName.SHAN }), CardName.SHA, ON)).toBe(false);
  });

  it('【桃】不能转化', () => {
    expect(canUseFanghun(P(), card({ name: CardName.TAO }), CardName.SHA, ON)).toBe(false);
  });

  it('【闪】不能转成【桃】', () => {
    expect(canUseFanghun(P(), card({ name: CardName.SHAN }), CardName.TAO, ON)).toBe(false);
  });
});

describe('「梅影」获得', () => {
  it('【杀】造成伤害后获得 1 枚', () => {
    expect(meiyanGainOnDamage(P(), true, true)).toBe(1);
  });
  it('非【杀】伤害不获得', () => {
    expect(meiyanGainOnDamage(P(), false, true)).toBe(0);
  });
  it('技能被封印时不获得', () => {
    expect(meiyanGainOnDamage(P(), true, false)).toBe(0);
  });
  it('非赵襄不获得', () => {
    expect(meiyanGainOnDamage(P('张飞'), true, true)).toBe(0);
  });
});

describe('赵襄「扶汉」', () => {
  it('有梅影时可发动', () => {
    expect(canUseFuhan(P(), ON, 5)).toBe(true);
  });
  it('没有梅影不可发动', () => {
    expect(canUseFuhan(P(), { marks: 0, skillsOn: true }, 5)).toBe(false);
  });
  it('体力上限等于梅影数', () => {
    expect(fuhanMaxHp(3, 5)).toBe(3);
  });
  it('体力上限不超过游戏人数', () => {
    expect(fuhanMaxHp(9, 5)).toBe(5);
  });
  it('体力上限至少为 1', () => {
    expect(fuhanMaxHp(0, 5)).toBe(1);
  });
});