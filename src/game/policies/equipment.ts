import type { Card, Player } from '../../../types';
import { Suit } from '../../../types';

/**
 * 装备区花色派生（从 App.tsx 的 equipList / allEquipBlack / allEquipRed 搬出）。
 *
 * 王元姬「谦冲」：装备区【全黑】得「帷幕」，【全红】得「明哲」。
 * 空装备区两个判定都为 false——这是原实现的 `cs.length > 0 &&` 语义，别改成 every 的空真。
 */

/** 装备区四槽位的牌（按 武器/防具/+1马/-1马 顺序，空槽跳过） */
export const equipList = (p: Player): Card[] => {
  const e = p.equipment;
  if (!e) return [];
  return [e.weapon, e.armor, e.horsePlus, e.horseMinus].filter((c): c is Card => !!c);
};

/** 装备区非空且全部为黑色（黑桃/梅花） */
export const allEquipBlack = (p: Player): boolean => {
  const cs = equipList(p);
  return cs.length > 0 && cs.every(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
};

/** 装备区非空且全部为红色（红桃/方块） */
export const allEquipRed = (p: Player): boolean => {
  const cs = equipList(p);
  return cs.length > 0 && cs.every(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
};

/**
 * 「帷幕」是否生效：王元姬本人 且 技能未被封印/移除 且 装备区全黑。
 * skillsOn 由调用方注入（App 侧传 skillsOn(p.id)），保持本模块零状态。
 */
export const hasWeimu = (p: Player, skillsEnabled: boolean): boolean =>
  p.hero.name === '王元姬' && skillsEnabled && allEquipBlack(p);
