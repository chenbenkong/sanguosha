import type { Card, Player } from '../../../types.ts';
import type { CardName, Suit } from '../../../types.ts';

/**
 * 引擎能力扩展：判定前与伤害前。
 *
 * 背景：注册表原有 9 个钩子全是「事后通知」——afterJudge / afterDamage 只能读到
 * 已经发生的结果。而三国杀里有一大类技能必须在**结算前**介入：
 *   · 刚烈 / 洛神 / 八卦阵：改判定结果（judgeBefore）
 *   · 绝情 / 骄矜 / 竭缘 / 藤甲：改伤害数值、防止、转移（damageBefore）
 *   · 天香：把伤害转移给另一名角色
 *
 * 这里定义这两个钩子的输入输出契约，由引擎在对应位置调用，
 * 技能只需返回修正值，不直接操作引擎状态——这样保持纯函数可测。
 */

/** 判定前事件：技能可修改最终判定牌 */
export interface JudgeBeforeEvent {
  /** 判定者 */
  owner: Player;
  /** 判定原因（如「乐不思蜀」「洛神」） */
  reason: string;
  /** 引擎已翻出的判定牌（技能可替换） */
  card: Card;
}

/** 判定前返回值：不返回表示不干预 */
export interface JudgeBeforeResult {
  /** 替换判定牌（如诸葛亮改判、司马懿鬼才） */
  replaceWith?: Card;
  /** 该牌花色视为另一种（如小乔红颜：黑桃视为红桃） */
  treatSuitAs?: Suit;
}

/** 伤害前事件：技能可在结算前修正数值或转移 */
export interface DamageBeforeEvent {
  /** 受伤者 */
  victim: Player;
  /** 伤害来源（可能为引擎自身，如闪电） */
  source: Player | undefined;
  /** 原始伤害值 */
  amount: number;
  /** 伤害属性 */
  nature: 'normal' | 'fire' | 'thunder';
  /** 造成伤害的牌 */
  card: Card | undefined;
}

/** 伤害前返回值：引擎按字段应用修正 */
export interface DamageBeforeResult {
  /** 修正后的伤害值（0 表示完全防止） */
  amount?: number;
  /** 完全防止此次伤害 */
  prevent?: boolean;
  /** 把伤害转移给另一名角色（如小乔天香） */
  transferTo?: number;
  /**
   * 改写此次伤害的属性（马伶俐「硝引」②：把非火焰伤害改为火焰）。
   *
   * 原先 DamageBeforeResult 只能改数值 / 防止 / 转移，没有属性这一维，
   * 「将此伤害改为火焰伤害」在技能侧根本写不出来；铁索传导、藤甲这些
   * 依赖 nature 的分支也就全部走不到。
   */
  nature?: 'normal' | 'fire' | 'thunder';
  /** 附加日志说明，便于战报追溯 */
  note?: string;
}

/** 判定前钩子：可返回修正；多个技能时按注册顺序依次应用 */
export type JudgeBeforeHook = (
  ctx: { self: Player; players: Player[]; log: (t: string) => void; banner: () => void; memory: Record<string, unknown> },
  ev: JudgeBeforeEvent,
) => JudgeBeforeResult | null | void | Promise<JudgeBeforeResult | null | void>;

/** 伤害前钩子 */
export type DamageBeforeHook = (
  ctx: { self: Player; players: Player[]; log: (t: string) => void; banner: () => void; memory: Record<string, unknown> },
  ev: DamageBeforeEvent,
) => DamageBeforeResult | null | void | Promise<DamageBeforeResult | null | void>;

/**
 * 把多个技能的伤害修正合并成一次结算。
 * 规则：prevent 一旦为 true 即终止；amount 取最后一次显式设置；transferTo 取第一个。
 */
export function mergeDamageBefore(results: Array<DamageBeforeResult | null | void>): DamageBeforeResult {
  const out: DamageBeforeResult = {};
  for (const r of results) {
    if (!r) continue;
    if (r.prevent) { out.prevent = true; break; }
    if (typeof r.amount === 'number') out.amount = r.amount;
    if (r.nature) out.nature = r.nature;
    if (r.transferTo != null && out.transferTo == null) out.transferTo = r.transferTo;
    if (r.note) out.note = out.note ? out.note + '；' + r.note : r.note;
  }
  return out;
}

/** 判定修正合并：replaceWith 取最后一个（后注册覆盖），treatSuitAs 取第一个 */
export function mergeJudgeBefore(results: Array<JudgeBeforeResult | null | void>): JudgeBeforeResult {
  const out: JudgeBeforeResult = {};
  for (const r of results) {
    if (!r) continue;
    if (r.replaceWith) out.replaceWith = r.replaceWith;
    if (r.treatSuitAs && out.treatSuitAs == null) out.treatSuitAs = r.treatSuitAs;
  }
  return out;
}