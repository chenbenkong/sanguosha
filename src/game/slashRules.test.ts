import { describe, expect, it } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../../types';
import type { Card, Player } from '../../types';
import { canPlaySlashByRules } from './rules';

/** 【杀】次数限制规则：咆哮 / 连弩 / 谦冲 / 枪舞 / 穆穆。 */

const card = (o: Partial<Card> = {}): Card => ({
  id: 'c1', name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE, rank: '7', value: 7,
  description: '', imageColor: '', ...o,
});

const P = (o: Partial<Player> = {}): Player => ({
  id: 0, isHuman: false,
  hero: { id: 'h', name: '普通武将', kingdom: '魏', maxHp: 4, avatarUrl: '', description: '', skillName: '', skillDesc: '', gender: 'male' },
  hp: 4, maxHp: 4, hand: [], identity: Identity.ZHONGCHEN, isDead: false, isRevealed: true, isSelected: false,
  ...o,
} as Player);

const G = (o: Partial<{ mumuBlocked: boolean; usedThisTurn: number; qiangwuPoint: number | null }> = {}) => ({
  mumuBlocked: false, usedThisTurn: 0, qiangwuPoint: null, ...o,
});

describe('canPlaySlashByRules', () => {
  it('未使用过【杀】时普通人可以出', () => {
    expect(canPlaySlashByRules(P(), card(), G())).toBe(true);
  });

  it('已使用过一次后普通人不能再出', () => {
    expect(canPlaySlashByRules(P(), card(), G({ usedThisTurn: 1 }))).toBe(false);
  });

  it('张飞「咆哮」无次数限制', () => {
    const p = P(); p.hero = { ...p.hero, name: '张飞' };
    expect(canPlaySlashByRules(p, card(), G({ usedThisTurn: 5 }))).toBe(true);
  });

  it('装备诸葛连弩时无次数限制', () => {
    const p = P({ equipment: { weapon: { id: 'w', name: CardName.ZHUGE, type: CardType.EQUIPMENT, suit: Suit.CLUB, rank: 'A', value: 1, description: '', imageColor: '' } } });
    expect(canPlaySlashByRules(p, card(), G({ usedThisTurn: 3 }))).toBe(true);
  });

  it('王元姬「谦冲」选基本牌时无次数限制', () => {
    const p = P({ qianchongType: 'basic' });
    p.hero = { ...p.hero, name: '王元姬' };
    expect(canPlaySlashByRules(p, card(), G({ usedThisTurn: 2 }))).toBe(true);
  });

  it('王元姬未选基本牌时受次数限制', () => {
    const p = P({ qianchongType: 'trick' });
    p.hero = { ...p.hero, name: '王元姬' };
    expect(canPlaySlashByRules(p, card(), G({ usedThisTurn: 1 }))).toBe(false);
  });

  it('张星彩「枪舞」点数大于判定结果时不计数', () => {
    const p = P(); p.hero = { ...p.hero, name: '张星彩' };
    expect(canPlaySlashByRules(p, card({ rank: 'K', value: 13 }), G({ usedThisTurn: 1, qiangwuPoint: 5 }))).toBe(true);
  });

  it('张星彩点数小于等于判定结果时仍受限', () => {
    const p = P(); p.hero = { ...p.hero, name: '张星彩' };
    expect(canPlaySlashByRules(p, card({ rank: '3', value: 3 }), G({ usedThisTurn: 1, qiangwuPoint: 5 }))).toBe(false);
  });

  it('枪舞未发动时不受特殊放行', () => {
    const p = P(); p.hero = { ...p.hero, name: '张星彩' };
    expect(canPlaySlashByRules(p, card({ rank: 'K' }), G({ usedThisTurn: 1, qiangwuPoint: null }))).toBe(false);
  });

  it('孙鲁育「穆穆」禁杀优先级最高（连张飞也不行）', () => {
    const p = P(); p.hero = { ...p.hero, name: '张飞' };
    expect(canPlaySlashByRules(p, card(), G({ mumuBlocked: true }))).toBe(false);
  });

  it('未传 card 时枪舞分支不生效', () => {
    const p = P(); p.hero = { ...p.hero, name: '张星彩' };
    expect(canPlaySlashByRules(p, undefined, G({ usedThisTurn: 1, qiangwuPoint: 5 }))).toBe(false);
  });
});