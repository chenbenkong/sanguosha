import type { Player } from '../../../types';

/**
 * 目标选取的通用小工具（从 App.tsx 的 nearestOtherPlayer / pickWeakest 搬出）。
 */

/** 相邻存活角色（按座位顺序）：“距离最近”的近似：优先下家，跳过已阵亡 */
export const nearestOtherPlayer = (players: Player[], id: number): Player | null => {
  const live = players.filter(p => !p.isDead);
  const idx = live.findIndex(p => p.id === id);
  if (idx < 0 || live.length <= 1) return null;
  return live[(idx + 1) % live.length];
};

/**
 * 体力最低者。稳定排序取第一个，因此同体力时返回池中靠前者（与原实现一致）。
 * 空池返回 null。
 */
export const pickWeakest = (pool: Player[]): Player | null =>
  (pool.length ? [...pool].sort((a, b) => a.hp - b.hp)[0] : null);
