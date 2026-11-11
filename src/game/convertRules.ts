import { CardName, CardType, Suit } from '../../types.ts';
import type { Card, Player } from '../../types.ts';

/**
 * 转化牌规则（把一张手牌当作另一张牌使用）。
 *
 * 背景：龙胆、武圣、倾国这类技能原本散落在 App.tsx 的多个出牌分支里，
 * 每处各写一遍「这张牌能不能当 X 用」，既重复又没法测。
 * 这里把判定集中成纯函数：输入（角色、手牌、目标牌名），输出能否转化。
 *
 * 注意：只判定「能否转化」，不处理结算、不读 React state。
 */

/** 转化来源：用于日志与横幅展示 */
export type ConvertSource = '龙胆' | '武圣' | '倾国' | '奇袭' | '国色' | null;

const isRed = (c: Card): boolean => c.suit === Suit.HEART || c.suit === Suit.DIAMOND;
const isBlack = (c: Card): boolean => c.suit === Suit.SPADE || c.suit === Suit.CLUB;

/**
 * 能否把 card 当作 target 使用，返回所用的技能名（null 表示不能）。
 *
 * 规则（与官方一致）：
 *   龙胆：赵云可将【杀】当【闪】、【闪】当【杀】
 *   武圣：关羽（或许身授予者）可将红色牌当【杀】
 *   倾国：甄姬可将黑色手牌当【闪】
 *   奇袭：甘宁可将黑色牌当【过河拆桥】
 *   国色：大乔可将方块牌当【乐不思蜀】
 *
 * @param granted 该角色被临时授予的技能（如鲍三娘「许身」给的「武圣」）
 */
export function convertSourceFor(
  p: Player,
  card: Card,
  target: CardName,
  granted: string[] = [],
): ConvertSource {
  const hero = p.hero.name;
  const has = (skill: string) => hero === (skill === '武圣' ? '关羽' : '') || granted.includes(skill);

  // 龙胆：赵云（赵襄「芳魂」也可借用，故一并放行）
  if (hero === '赵云' || hero === '赵襄' || granted.includes('龙胆')) {
    if (target === CardName.SHAN && card.name === CardName.SHA) return '龙胆';
    if (target === CardName.SHA && card.name === CardName.SHAN) return '龙胆';
  }

  // 武圣：红色牌当【杀】
  if (has('武圣') && target === CardName.SHA && isRed(card)) return '武圣';

  // 倾国：黑色手牌当【闪】
  if (hero === '甄姬' && target === CardName.SHAN && isBlack(card)) return '倾国';

  // 奇袭：甘宁黑色牌当【过河拆桥】
  if (hero === '甘宁' && target === CardName.GUOHE && isBlack(card)) return '奇袭';

  // 国色：大乔方块牌当【乐不思蜀】
  if (hero === '大乔' && target === CardName.LESI && card.suit === Suit.DIAMOND) return '国色';

  return null;
}

/** 该角色是否存在任意可用的转化技能（用于 UI 提示是否显示技能按钮） */
export function hasAnyConversion(p: Player, granted: string[] = []): boolean {
  const hero = p.hero.name;
  if (hero === '赵云' || hero === '赵襄' || granted.includes('龙胆')) return true;
  if (hero === '关羽' || granted.includes('武圣')) return true;
  if (hero === '甄姬' || hero === '甘宁' || hero === '大乔') return true;
  return false;
}

/** 丈八蛇矛：两张手牌当【杀】。返回是否满足条件（两张牌且都不是装备） */
export function canUseZhangba(cards: Card[]): boolean {
  return cards.length === 2 && cards.every(c => c.type !== CardType.EQUIPMENT);
}