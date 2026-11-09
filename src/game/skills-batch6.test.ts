import { describe, expect, it } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../../types';
import type { Card, Player } from '../../types';
import {
  canHuguan, countHuguanExempt, tianzeDraws, tianzeCanStrike, fangduEffect,
  jiexingTriggers, canJieling, shengduDrawCount, kanggeDrawCount, yitongTriggers,
  herongResult, nifuAdjust, cilvDrawCount, yuanditriggers,
} from './skills-batch6';

const card = (over: Partial<Card> = {}): Card => ({
  id: 'c1', name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE, rank: '7', value: 7,
  description: '', imageColor: '', ...over,
});

const player = (over: Partial<Player> = {}): Player => ({
  id: 0, isHuman: false,
  hero: { id: 'x', name: '王悦', kingdom: '蜀', maxHp: 3, avatarUrl: '', description: '', skillName: '', skillDesc: '', gender: 'female' },
  hp: 3, maxHp: 3, hand: [], identity: Identity.ZHONGCHEN, isDead: false, isRevealed: true, isSelected: false,
  ...over,
});

describe('护关：红色首牌可声明花色', () => {
  it('红桃与方块为红色', () => {
    expect(canHuguan(card({ suit: Suit.HEART }))).toBe(true);
    expect(canHuguan(card({ suit: Suit.DIAMOND }))).toBe(true);
  });
  it('黑桃与梅花不是红色', () => {
    expect(canHuguan(card({ suit: Suit.SPADE }))).toBe(false);
    expect(canHuguan(card({ suit: Suit.CLUB }))).toBe(false);
  });
  it('未声明花色时豁免为 0', () => {
    expect(countHuguanExempt(player({ hand: [card()] }), null)).toBe(0);
  });
  it('只统计被声明花色的手牌', () => {
    const p = player({ hand: [card({ suit: Suit.HEART }), card({ suit: Suit.SPADE }), card({ suit: Suit.HEART })] });
    expect(countHuguanExempt(p, Suit.HEART)).toBe(2);
    expect(countHuguanExempt(p, Suit.SPADE)).toBe(1);
  });
  it('非王悦/王桃不享受豁免', () => {
    const p = player({ hand: [card({ suit: Suit.HEART })] });
    p.hero = { ...p.hero, name: '张飞' };
    expect(countHuguanExempt(p, Suit.HEART)).toBe(0);
  });
});

describe('天则：黑色判定与黑色首牌', () => {
  const zn = player({ id: 1, hero: { id: 'zhangning', name: '张宁', kingdom: '群', maxHp: 3, avatarUrl: '', description: '', skillName: '天则', skillDesc: '', gender: 'female' } });
  it('他人黑色判定 → 摸牌', () => {
    expect(tianzeDraws(card({ suit: Suit.SPADE }), player({ id: 0 }), zn)).toBe(true);
    expect(tianzeDraws(card({ suit: Suit.CLUB }), player({ id: 0 }), zn)).toBe(true);
  });
  it('红色判定不触发', () => {
    expect(tianzeDraws(card({ suit: Suit.HEART }), player({ id: 0 }), zn)).toBe(false);
  });
  it('自己的判定不触发', () => {
    expect(tianzeDraws(card({ suit: Suit.SPADE }), zn, zn)).toBe(false);
  });
  it('张宁不在场不触发', () => {
    expect(tianzeDraws(card({ suit: Suit.SPADE }), player({ id: 0 }), undefined)).toBe(false);
  });
  it('黑色首牌 + 张宁有黑牌 → 可反击', () => {
    const znWithCard = { ...zn, hand: [card({ suit: Suit.SPADE })] };
    expect(tianzeCanStrike(card({ suit: Suit.SPADE }), 1, 0, znWithCard)).toBe(true);
  });
  it('不是首牌则不能反击', () => {
    const znWithCard = { ...zn, hand: [card({ suit: Suit.SPADE })] };
    expect(tianzeCanStrike(card({ suit: Suit.SPADE }), 2, 0, znWithCard)).toBe(false);
  });
  it('张宁无黑牌则不能反击', () => {
    expect(tianzeCanStrike(card({ suit: Suit.SPADE }), 1, 0, zn)).toBe(false);
  });
  it('红色牌不触发反击', () => {
    const znWithCard = { ...zn, hand: [card({ suit: Suit.SPADE })] };
    expect(tianzeCanStrike(card({ suit: Suit.HEART }), 1, 0, znWithCard)).toBe(false);
  });
});

describe('芳妒 / 节行', () => {
  it('普通伤害回血，属性伤害夺牌', () => {
    expect(fangduEffect('normal')).toBe('heal');
    expect(fangduEffect('fire')).toBe('steal');
    expect(fangduEffect('thunder')).toBe('steal');
  });
  it('节行仅在袁姬体力变化时触发', () => {
    const y = player({ hp: 2 });
    y.hero = { ...y.hero, name: '袁姬' };
    expect(jiexingTriggers(y, 3, 2)).toBe(true);
    expect(jiexingTriggers(y, 2, 2)).toBe(false);
  });
  it('非袁姬不触发节行', () => {
    const p = player({ hp: 2 });
    p.hero = { ...p.hero, name: '张飞' };
    expect(jiexingTriggers(p, 3, 2)).toBe(false);
  });
});

describe('介绫 / 生妒', () => {
  it('两张不同花色可用', () => {
    expect(canJieling(card({ suit: Suit.HEART }), card({ suit: Suit.SPADE }), {})).toBe(true);
  });
  it('同花色不可用', () => {
    expect(canJieling(card({ suit: Suit.HEART }), card({ suit: Suit.HEART }), {})).toBe(false);
  });
  it('该花色本阶段用过则不可用', () => {
    expect(canJieling(card({ suit: Suit.HEART }), card({ suit: Suit.SPADE }), { [Suit.HEART]: true })).toBe(false);
  });
  it('生妒摸牌数为标记数乘摸牌数', () => {
    expect(shengduDrawCount(2, 3)).toBe(6);
    expect(shengduDrawCount(0, 3)).toBe(0);
    expect(shengduDrawCount(-1, 3)).toBe(0);
  });
});

describe('抗歌 / 异瞳 / 和戎 / 匿伏 / 辞虑 / 元嫡', () => {
  it('抗歌每回合至多摸三张', () => {
    expect(kanggeDrawCount(2, 0)).toBe(2);
    expect(kanggeDrawCount(5, 0)).toBe(3);
    expect(kanggeDrawCount(3, 2)).toBe(1);
    expect(kanggeDrawCount(3, 3)).toBe(0);
    expect(kanggeDrawCount(3, 5)).toBe(0);
  });
  it('异瞳只在本轮第一次命中指定花色时触发', () => {
    expect(yitongTriggers(card({ suit: Suit.HEART }), Suit.HEART, false)).toBe(true);
    expect(yitongTriggers(card({ suit: Suit.HEART }), Suit.HEART, true)).toBe(false);
    expect(yitongTriggers(card({ suit: Suit.SPADE }), Suit.HEART, false)).toBe(false);
    expect(yitongTriggers(card({ suit: Suit.HEART }), null, false)).toBe(false);
  });
  it('和戎按牌类型比较', () => {
    expect(herongResult(card({ type: CardType.BASIC }), card({ type: CardType.BASIC }))).toBe('same');
    expect(herongResult(card({ type: CardType.BASIC }), card({ type: CardType.SCROLL }))).toBe('different');
  });
  it('匿伏把手牌调整为三张', () => {
    expect(nifuAdjust(0)).toBe(3);
    expect(nifuAdjust(5)).toBe(-2);
    expect(nifuAdjust(3)).toBe(0);
  });
  it('辞虑摸剩余选项数', () => {
    expect(cilvDrawCount(3)).toBe(3);
    expect(cilvDrawCount(0)).toBe(0);
    expect(cilvDrawCount(-1)).toBe(0);
  });
  it('元嫡要求是出牌阶段第一张且未指定他人', () => {
    expect(yuanditriggers(false, 1)).toBe(true);
    expect(yuanditriggers(true, 1)).toBe(false);
    expect(yuanditriggers(false, 2)).toBe(false);
  });
});
