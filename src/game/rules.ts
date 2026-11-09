import { CardType, Identity, Suit } from '../../types.ts';
import type { Player } from '../../types.ts';
import type { WinnerSide } from './constants.ts';

/**
 * 回合与胜负判定的纯函数。
 *
 * 这里只放「输入确定 → 输出确定」的规则计算，不读 React state、不写日志、不碰计时器，
 * 便于用 node:test 直接覆盖。App 里的回合主循环只负责调用它们并按结果推进。
 *
 * 注：导入路径带 .ts 后缀，是为了让 `node --experimental-transform-types --test` 能原生加载。
 */

/** 手牌上限：胡金定「怀子」按体力上限计算，其余按当前体力 */
export function handLimitOf(p: Player): number {
  return p.hero.name === '胡金定' ? p.maxHp : p.hp;
}

/** 不计入手牌上限的牌数：诸葛果「羽化」非基本牌；董白「黠慧」黑色牌 */
export function countExemptHandCards(p: Player): number {
  if (p.hero.name === '诸葛果') return p.hand.filter(c => c.type !== CardType.BASIC).length;
  if (p.hero.name === '董白') return p.hand.filter(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB).length;
  return 0;
}

/** 弃牌阶段需要弃置的张数（0 表示不用弃） */
export function computeDiscardExcess(p: Player): number {
  const exempt = countExemptHandCards(p);
  return Math.max(0, p.hand.length - handLimitOf(p) - exempt - (p.handLimitDelta ?? 0));
}

/**
 * 下一位存活角色的座位号。
 * 与主循环一致：从下一位开始找，最多跳 10 次；找不到存活者时返回最后一个检查到的位置。
 */
export function nextAliveTurnIndex(players: Player[], currentIndex: number, maxSkips = 10): number {
  if (players.length === 0) return 0;
  let next = (currentIndex + 1) % players.length;
  let safety = 0;
  while (safety < maxSkips) {
    const nextPlayer = players.find(p => p.id === next);
    if (!nextPlayer || !nextPlayer.isDead) break;
    next = (next + 1) % players.length;
    safety++;
  }
  return next;
}

/**
 * 身份局胜负判定：
 * - 主公存活：反贼与内奸全部阵亡 → 主忠胜
 * - 主公阵亡：还有存活反贼 → 反贼胜；只剩内奸一人 → 内奸胜；
 *   内奸之外还有他人存活 → 反贼胜；反贼与内奸都已死 → 主忠胜
 * 无结果返回 null。
 */
export function evaluateWinnerSide(players: Player[]): WinnerSide | null {
  const lord = players.find(p => p.identity === Identity.ZHUGONG);
  if (!lord) return null;

  if (lord.isDead) {
    const aliveRebels = players.filter(p => p.identity === Identity.FANZEI && !p.isDead);
    const aliveSpy = players.find(p => p.identity === Identity.NEIJIAN && !p.isDead);
    if (aliveRebels.length > 0) return 'rebel';
    if (aliveSpy) {
      const otherAlive = players.filter(p => !p.isDead && p.id !== aliveSpy.id);
      return otherAlive.length === 0 ? 'spy' : 'rebel';
    }
    return 'lord';
  }

  const rebels = players.filter(p => p.identity === Identity.FANZEI && !p.isDead);
  const spy = players.find(p => p.identity === Identity.NEIJIAN);
  if (rebels.length === 0 && (!spy || spy.isDead)) return 'lord';
  return null;
}
