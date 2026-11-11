import { describe, expect, it } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../../types';
import type { Card, Player } from '../../types';
import { convertSourceFor, hasAnyConversion, canUseZhangba } from './convertRules';

/** 转化牌规则：龙胆 / 武圣 / 倾国 / 奇袭 / 国色 / 丈八蛇矛。 */

const card = (o: Partial<Card> = {}): Card => ({
  id: 'c1', name: CardName.SHA, type: CardType.BASIC, suit: Suit.HEART, rank: '7', value: 7,
  description: '', imageColor: '', ...o,
});

const P = (name: string, o: Partial<Player> = {}): Player => ({
  id: 0, isHuman: false,
  hero: { id: 'h', name, kingdom: '魏', maxHp: 4, avatarUrl: '', description: '', skillName: '', skillDesc: '', gender: 'male' },
  hp: 4, maxHp: 4, hand: [], identity: Identity.ZHONGCHEN, isDead: false, isRevealed: true, isSelected: false,
  ...o,
} as Player);

describe('赵云「龙胆」', () => {
  it('【杀】可当【闪】', () => {
    expect(convertSourceFor(P('赵云'), card({ name: CardName.SHA }), CardName.SHAN)).toBe('龙胆');
  });
  it('【闪】可当【杀】', () => {
    expect(convertSourceFor(P('赵云'), card({ name: CardName.SHAN }), CardName.SHA)).toBe('龙胆');
  });
  it('【桃】不能当【杀】', () => {
    expect(convertSourceFor(P('赵云'), card({ name: CardName.TAO }), CardName.SHA)).toBe(null);
  });
  it('非赵云没有龙胆', () => {
    expect(convertSourceFor(P('张飞'), card({ name: CardName.SHA }), CardName.SHAN)).toBe(null);
  });
  it('赵襄「芳魂」也可借用龙胆', () => {
    expect(convertSourceFor(P('赵襄'), card({ name: CardName.SHAN }), CardName.SHA)).toBe('龙胆');
  });
});

describe('关羽「武圣」', () => {
  it('红色牌可当【杀】', () => {
    expect(convertSourceFor(P('关羽'), card({ suit: Suit.HEART }), CardName.SHA)).toBe('武圣');
    expect(convertSourceFor(P('关羽'), card({ suit: Suit.DIAMOND }), CardName.SHA)).toBe('武圣');
  });
  it('黑色牌不能当【杀】', () => {
    expect(convertSourceFor(P('关羽'), card({ suit: Suit.SPADE }), CardName.SHA)).toBe(null);
  });
  it('被授予武圣的角色也能用', () => {
    expect(convertSourceFor(P('普通武将'), card({ suit: Suit.HEART }), CardName.SHA, ['武圣'])).toBe('武圣');
  });
  it('武圣只能转【杀】，不能转【闪】', () => {
    expect(convertSourceFor(P('关羽'), card({ suit: Suit.HEART }), CardName.SHAN)).toBe(null);
  });
});

describe('甄姬「倾国」', () => {
  it('黑色手牌可当【闪】', () => {
    expect(convertSourceFor(P('甄姬'), card({ suit: Suit.SPADE }), CardName.SHAN)).toBe('倾国');
    expect(convertSourceFor(P('甄姬'), card({ suit: Suit.CLUB }), CardName.SHAN)).toBe('倾国');
  });
  it('红色牌不能当【闪】', () => {
    expect(convertSourceFor(P('甄姬'), card({ suit: Suit.HEART }), CardName.SHAN)).toBe(null);
  });
});

describe('甘宁「奇袭」 / 大乔「国色」', () => {
  it('甘宁黑色牌当【过河拆桥】', () => {
    expect(convertSourceFor(P('甘宁'), card({ suit: Suit.SPADE }), CardName.GUOHE)).toBe('奇袭');
    expect(convertSourceFor(P('甘宁'), card({ suit: Suit.HEART }), CardName.GUOHE)).toBe(null);
  });
  it('大乔方块牌当【乐不思蜀】', () => {
    expect(convertSourceFor(P('大乔'), card({ suit: Suit.DIAMOND }), CardName.LESI)).toBe('国色');
    expect(convertSourceFor(P('大乔'), card({ suit: Suit.HEART }), CardName.LESI)).toBe(null);
  });
});

describe('hasAnyConversion', () => {
  it('有转化技能的角色返回 true', () => {
    expect(hasAnyConversion(P('赵云'))).toBe(true);
    expect(hasAnyConversion(P('关羽'))).toBe(true);
    expect(hasAnyConversion(P('甄姬'))).toBe(true);
  });
  it('没有转化技能的角色返回 false', () => {
    expect(hasAnyConversion(P('张飞'))).toBe(false);
  });
  it('被授予武圣后返回 true', () => {
    expect(hasAnyConversion(P('普通武将'), ['武圣'])).toBe(true);
  });
});

describe('丈八蛇矛', () => {
  it('两张非装备牌满足条件', () => {
    expect(canUseZhangba([card(), card()])).toBe(true);
  });
  it('一张牌不满足', () => {
    expect(canUseZhangba([card()])).toBe(false);
  });
  it('三张牌不满足', () => {
    expect(canUseZhangba([card(), card(), card()])).toBe(false);
  });
  it('含装备牌不满足', () => {
    expect(canUseZhangba([card(), card({ type: CardType.EQUIPMENT })])).toBe(false);
  });
});