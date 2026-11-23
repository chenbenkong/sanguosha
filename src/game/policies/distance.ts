import type { Player } from '../../../types';
import { seatDistance } from '../rules';
import { EQUIP_META } from '../../../constants';

/**
 * 距离 / 攻击范围判定的**纯函数层**。

 * 为什么要有这一层：App.tsx 里原本内联着「座位距离 + 惴恐/魅步的视为 1」，
 * 以及「攻击范围 + 枕戈修正」，而 canReach（所有距离判定的唯一入口）是它们
 * 的组合。这几个规则没有单测覆盖 —— 本项目中「花火 / 狷急选项2 越距离指定目标」
 * 的缺陷就出在这条链上（技能直接 resolveCardEffect 绕过了 canReach）。
 * 抽成纯函数后：规则可单测、App.tsx 不再持有这些计算细节、
 * 技能作者调用 canReachByRules 时拿到的是**已实现过单测**的判定。
 */

export interface DistanceModifiers {
  /** 伏皇后「惴恐」没赢：该角色与她的距离本回合视为 1（fromId → toId） */
  doutu?: Record<number, number>;
  /** 孙鲁育「魅步」：该角色与孙鲁育的距离本回合视为 1（fromId → toId） */
  meibu?: Record<number, number>;
  /** 各角色的攻击范围临时修正（「枕戈」），引擎会夹到 ±5 且下限 1 */
  attackRangeBonus?: Record<number, number>;
}

const clampRangeBonus = (n: number): number => Math.max(-5, Math.min(5, n));

/**
 * 玩家之间的有效距离。座位距离来自 rules.ts 的 seatDistance，
 * 再叠加「视为 1」的临时效果（惴恐 / 魅步）。
 */
export function distanceByRules(players: Player[], fromId: number, toId: number, mods: DistanceModifiers = {}): number {
  const d = seatDistance(players, fromId, toId);
  if (mods.doutu?.[fromId] === toId) return 1;
  if (mods.meibu?.[fromId] === toId) return 1;
  return d;
}

/**
 * 攻击范围 = 1 + 武器射程 + 技能修正。
 * 修正夹在 ±5 内且**最终下限恒为 1**（即使修正为 -5 也不会变成 0 或负数）。
 */
export function attackRangeByRules(p: Player, mods: DistanceModifiers = {}): number {
  const weapon = p.equipment?.weapon;
  const bonus = weapon ? (EQUIP_META[weapon.name]?.range ?? 1) : 0;
  const skill = clampRangeBonus(mods.attackRangeBonus?.[p.id] ?? 0);
  return Math.max(1, 1 + bonus + skill);
}

/**
 * from 能否在不考虑目标额外限制的前提下打到 to。
 *
 * **唯一的距离判定入口**：人类选目标、AI 选目标、虚拟牌都走这里。
 * 技能若绕过本函数直接调 resolveCardEffect，就会出现「距离外指定目标」的规则缺陷。
 *
 * `phaseNoDistance` 是「本阶段使用牌无距离限制」的临时旗标（吕玲绮「帼武」②）。
 */
export function canReachByRules(
  from: Player,
  to: Player,
  players: Player[],
  mods: DistanceModifiers = {},
): boolean {
  if (from.phaseNoDistance) return true;
  return distanceByRules(players, from.id, to.id, mods) <= attackRangeByRules(from, mods);
}
