import type { Player } from '../../../types';
import { Identity } from '../../../types';

/**
 * AI 是否救援濒死者（从 App.tsx 的 shouldAiSavePlayer 搬出）。
 *
 * 原实现读 aiDifficultyRef.current 与 playersRef.current 两个闭包，
 * 这里改成显式参数；困难难度内奸分支需要「场上是否还有存活反贼」，由调用方传入。
 *
 * Math.random 的调用次数与顺序与原实现逐行一致：
 * 每个分支最多消费一次随机数，且只有走到随机分支才消费。
 */

export type RescueDifficulty = 'easy' | 'normal' | 'hard';

export interface RescueContext {
  /** 难度（原为 aiDifficultyRef.current） */
  difficulty: RescueDifficulty;
  /** 场上是否还有存活反贼（原为 playersRef.current.some(...)） */
  rebelsAlive: boolean;
}

export const shouldAiSavePlayer = (
  rescuer: Player,
  victim: Player,
  ctx: RescueContext,
): boolean => {
  const ri = rescuer.identity;
  const vi = victim.identity;
  const difficulty = ctx.difficulty;

  if (difficulty === 'easy') {
    if (rescuer.id === victim.id) return Math.random() < 0.7;
    if (vi === Identity.ZHUGONG) return Math.random() < 0.5;
    return Math.random() < 0.35;
  }

  if (difficulty === 'hard') {
    if (rescuer.id === victim.id) return true;
    if (ri === Identity.ZHONGCHEN) return vi === Identity.ZHUGONG || vi === Identity.ZHONGCHEN;
    if (ri === Identity.ZHUGONG) return vi === Identity.ZHONGCHEN;
    if (ri === Identity.FANZEI) return vi === Identity.FANZEI;
    if (ri === Identity.NEIJIAN) {
      // 内奸：反贼未清时保主公，残局保自己
      return (vi === Identity.ZHUGONG && ctx.rebelsAlive) || vi === Identity.NEIJIAN;
    }
    return false;
  }

  if (ri === Identity.FANZEI) {
    // 反贼：救反贼，不救主公，其他看情况
    if (vi === Identity.ZHUGONG) return false;
    if (vi === Identity.FANZEI) return true;
    return Math.random() < 0.3;
  } else if (ri === Identity.ZHONGCHEN) {
    // 忠臣：救主公，其他看情况
    if (vi === Identity.ZHUGONG) return true;
    return Math.random() < 0.4;
  } else if (ri === Identity.ZHUGONG) {
    // 主公：救忠臣，其他看情况
    if (vi === Identity.ZHONGCHEN) return Math.random() < 0.8;
    return Math.random() < 0.3;
  } else if (ri === Identity.NEIJIAN) {
    // 内奸：看情况
    return Math.random() < 0.5;
  }
  return Math.random() < 0.3;
};
