import { CardName, CardType, Identity, Suit } from '../../../types';
import type { Card, Hero, Player } from '../../../types';

/**
 * 纯逻辑单测的最小夹具。只提供测试需要的字段，其余用类型断言的默认值兜住，
 * 避免每加一个 Player 字段就要改所有用例。
 */

export const mkHero = (name: string, id = name): Hero => ({
  id,
  name,
  kingdom: '群',
  maxHp: 4,
  avatarUrl: '',
  description: '',
  skillName: '',
  skillDesc: '',
  gender: 'male',
});

export const mkCard = (name: CardName, suit: Suit = Suit.SPADE, id = 'c' + Math.random()): Card => ({
  id,
  name,
  type: CardType.BASIC,
  suit,
  rank: 'A',
  value: 1,
  description: '',
  imageColor: '',
});

export const mkPlayer = (over: Partial<Player> & { id: number }): Player => ({
  isHuman: false,
  hero: mkHero('测试武将' + over.id),
  hp: 4,
  maxHp: 4,
  hand: [],
  identity: Identity.ZHONGCHEN,
  isDead: false,
  isRevealed: false,
  isSelected: false,
  ...over,
});

export const mkEquip = (suit: Suit, name = CardName.QINGGANG, id = 'eq' + Math.random()) => {
  const c = mkCard(name, suit, id);
  return { ...c, type: CardType.EQUIPMENT };
};
