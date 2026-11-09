/**
 * 技能门控（从 App.tsx 的 isSkillSealed / skillsOn 内联实现搬出）。
 *
 * 原实现读两个 ref（skillSealRef、turnCountRef）与 playersRef，闭包化后不可测；
 * 这里把读取动作收进显式参数，App 侧只负责把 ref.current 传进来。
 * 判定顺序与短路语义（先封印、再武将移除）保持逐字一致。
 */

/** 邹氏「倾城」封印：until 为生效截止回合号（不含），undefined 表示未封印 */
export type SkillSealMap = Record<number, number | undefined>;

/**
 * 角色技能是否被封（被暗置的角色在解封回合前技能不发动）。
 * @param until 该角色封印截止回合；缺省/undefined 视为未封印
 * @param turnCount 当前回合计数
 */
export const isSkillSealed = (until: number | undefined, turnCount: number): boolean =>
  !!until && until > turnCount;

export interface SkillGateSources {
  /** 角色封印截止回合（App 侧为 skillSealRef.current[id]） */
  sealUntil: (id: number) => number | undefined;
  /** 当前回合计数（App 侧为 turnCountRef.current） */
  turnCount: () => number;
  /** 该角色是否已被移除武将（App 侧为 playersRef.current.find(...)?.generalRemoved） */
  generalRemoved: (id: number) => boolean | undefined;
}

/**
 * 技能是否可发动：未被封印 且 武将未被移除。
 * 与原实现一样先判封印（短路），保证封印中的角色不做 playersRef 查找。
 */
export const skillsOn = (id: number, src: SkillGateSources): boolean =>
  !isSkillSealed(src.sealUntil(id), src.turnCount())
  && !src.generalRemoved(id);
