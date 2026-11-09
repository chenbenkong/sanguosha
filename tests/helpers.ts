import { Card, CardType, Hero, Identity, Player, Suit } from '../types';

let seq = 0;

/** 构造一张最小可用卡牌 */
export function card(over: Partial<Card> = {}): Card {
  return {
    id: `t-${seq++}`,
    name: over.name ?? ('杀' as Card['name']),
    type: over.type ?? CardType.BASIC,
    suit: over.suit ?? Suit.HEART,
    rank: over.rank ?? '7',
    value: over.value ?? 0,
    description: over.description ?? '',
    imageColor: over.imageColor ?? '',
    ...over,
  };
}

export function hero(over: Partial<Hero> = {}): Hero {
  return {
    id: over.id ?? 'test-hero',
    name: over.name ?? '曹操',
    kingdom: over.kingdom ?? '魏',
    maxHp: over.maxHp ?? 4,
    avatarUrl: over.avatarUrl ?? '',
    description: over.description ?? '',
    skillName: over.skillName ?? '奸雄',
    skillDesc: over.skillDesc ?? '奸雄：受到伤害后摸一张牌。',
    gender: over.gender ?? 'male',
    ...over,
  };
}

/** 构造一名最小可用角色；id 默认沿用入参，便于座位/距离类用例 */
export function player(over: Partial<Player> = {}): Player {
  const h = over.hero ?? hero();
  return {
    id: over.id ?? 0,
    isHuman: over.isHuman ?? false,
    hero: h,
    hp: over.hp ?? h.maxHp,
    maxHp: over.maxHp ?? h.maxHp,
    hand: over.hand ?? [],
    identity: over.identity ?? Identity.ZHONGCHEN,
    isDead: over.isDead ?? false,
    isRevealed: over.isRevealed ?? false,
    isSelected: over.isSelected ?? false,
    ...over,
  };
}

/** 按 id 生成一组角色 */
export function seats(count: number, over: (id: number) => Partial<Player> = () => ({})): Player[] {
  return Array.from({ length: count }, (_, id) => player({ id, ...over(id) }));
}
