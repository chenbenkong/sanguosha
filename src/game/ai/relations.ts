import type { Player } from '../../../types';
import { Identity } from '../../../types';

/**
 * 阵营关系判定（从 App.tsx 内联实现原样搬出，行为完全一致）。
 *
 * 返回布尔而不是 Terry 式的三方关系：调用点全部是 if (isAlly(...)) 的二值判断，
 * 纯函数化后可直接单测，不必构造 React 环境。
 */

/** 同阵营：主忠互认，反贼互认，内奸谁也不认（含自己人） */
export const isAlly = (a: Player, b: Player): boolean => {
  const ta: Identity = a.identity;
  const tb: Identity = b.identity;
  if (ta === Identity.ZHUGONG || ta === Identity.ZHONGCHEN) return tb === Identity.ZHUGONG || tb === Identity.ZHONGCHEN;
  if (ta === Identity.FANZEI) return tb === Identity.FANZEI;
  return false;
};

/** 敌对：主忠视反贼与内奸为敌，反贼视主忠为敌，内奸视所有非内奸为敌 */
export const isEnemy = (a: Player, b: Player): boolean => {
  const ta: Identity = a.identity;
  const tb: Identity = b.identity;
  if (ta === Identity.ZHUGONG || ta === Identity.ZHONGCHEN) return tb === Identity.FANZEI || tb === Identity.NEIJIAN;
  if (ta === Identity.FANZEI) return tb === Identity.ZHUGONG || tb === Identity.ZHONGCHEN;
  if (ta === Identity.NEIJIAN) return tb !== Identity.NEIJIAN;
  return false;
};
