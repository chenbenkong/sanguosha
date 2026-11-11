import { CardName, Suit } from '../../types.ts';
import type { Card, Player } from '../../types.ts';

/**
 * 赵襄「芳魂」判定（纯函数）。
 *
 * 官方：当你使用【杀】造成伤害后获得 1 个「梅影」；你可以移去 1 个「梅影」
 * 发动「龙胆」——把【闪】当【杀】使用（或把【杀】当【闪】）。
 *
 * 原实现散落在 App.tsx 的 4 处出牌分支里，各自写一遍「是不是赵襄、有没有梅影、
 * 这张牌能不能转」，条件略有出入（有的地方漏判梅影数）。集中成纯函数后
 * 只有一个事实来源，并有单测钉住。
 */

export interface MeiyanState {
  /** 当前持有的「梅影」标记数 */
  marks: number;
  /** 技能是否生效（未被封印 / 武将未移除） */
  skillsOn: boolean;
}

/** 是否能移去一枚「梅影」发动龙胆（把 card 当 target 用） */
export function canUseFanghun(
  p: Player,
  card: Card,
  target: CardName,
  state: MeiyanState,
): boolean {
  if (p.hero.name !== '赵襄') return false;
  if (!state.skillsOn) return false;
  if (state.marks <= 0) return false;
  // 龙胆的两种转化
  if (target === CardName.SHA && card.name === CardName.SHAN) return true;
  if (target === CardName.SHAN && card.name === CardName.SHA) return true;
  return false;
}

/** 使用【杀】造成伤害后应获得几枚「梅影」（每次伤害 +1） */
export function meiyanGainOnDamage(p: Player, isShaDamage: boolean, skillsOn: boolean): number {
  if (p.hero.name !== '赵襄') return 0;
  if (!skillsOn) return 0;
  return isShaDamage ? 1 : 0;
}

/**
 * 赵襄「扶汉」：限定技，回合开始时移去全部梅影，从未登场的蜀势力武将中替补。
 * @returns 新的体力上限；null 表示不能发动
 */
export function canUseFuhan(p: Player, state: MeiyanState, playerCount: number): boolean {
  if (p.hero.name !== '赵襄') return false;
  if (!state.skillsOn) return false;
  if (state.marks <= 0) return false;
  return true;
}

/** 扶汉后的体力上限：等于移去的梅影数，且不超过游戏人数 */
export function fuhanMaxHp(marks: number, playerCount: number): number {
  return Math.max(1, Math.min(marks, playerCount));
}