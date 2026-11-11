import { CardName, CardType, Identity, Suit } from '../../types.ts';
import type { Card, Player } from '../../types.ts';
import { rankValue } from './utils.ts';
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

/** 不计入手牌上限的牌数：诸葛果「羽化」非基本牌；董白「黠慧」黑色牌；王悦/王桃「护关」被声明花色 */
export function countExemptHandCards(p: Player): number {
  if (p.hero.name === '诸葛果') return p.hand.filter(c => c.type !== CardType.BASIC).length;
  if (p.hero.name === '董白') return p.hand.filter(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB).length;
  // 王悦 / 王桃「护关」：本回合被声明的花色不计入手牌上限
  if (p.hero.name === '王悦' || p.hero.name === '王桃') {
    const suit = p.huguanSuit;
    if (suit) return p.hand.filter(c => c.suit === suit).length;
  }
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
 * 座位距离：环形取短边，再算马术与 ±1 坐骑。
 * 不含「惴恐」「魅步」这类强制视为 1 的临时效果，由调用方在这之后覆盖。
 */
export function seatDistance(players: Player[], fromId: number, toId: number): number {
  const n = players.length;
  if (!n) return 1;
  const raw = Math.abs(fromId - toId);
  let d = Math.min(raw, n - raw);
  const from = players.find(p => p.id === fromId);
  const to = players.find(p => p.id === toId);
  if (from?.hero.name === '马超' || from?.hero.name === '马云禄') d -= 1; // 马术
  if (from?.equipment?.horseMinus) d -= 1;
  if (to?.equipment?.horsePlus) d += 1;
  return Math.max(1, d);
}

/** 目标保护：诸葛亮「空城」（无手牌时不能被【杀】【决斗】指定）、陆逊「谦逊」（不能被【顺手】【乐】指定） */
export function targetProtection(target: Player, cardName: CardName): string | null {
  if (target.hero.name === '诸葛亮' && target.hand.length === 0
    && (cardName === CardName.SHA || cardName === CardName.JUEDOU)) {
    return '空城';
  }
  if (target.hero.name === '陆逊'
    && (cardName === CardName.SHUNSHOU || cardName === CardName.LESI)) {
    return '谦逊';
  }
  return null;
}

/**
 * 长局兜底「粮尽」：按人数给出触发回合数。
 * 5 人局 54 个回合（约 11 轮）、7 人局 66 个回合（约 9.4 轮），远高于正常结算时长，
 * 只用于防止 AI 互相回血导致永不结束。
 */
export function suddenDeathFromTurn(playerCount: number): number {
  return 24 + 6 * Math.max(0, playerCount);
}

/** 第 turnCount 个回合结束时，每名存活角色失去的体力值 */
export function suddenDeathDamage(turnCount: number, playerCount: number): number {
  return turnCount > suddenDeathFromTurn(playerCount) ? 1 : 0;
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

/**
 * 本回合是否还能使用这张【杀】。
 *
 * 从 App.tsx 的 canPlaySlash 提出：原实现直接读三个 ref（mumuNoSlashRef /
 * slashUsageRef / qiangwuPointRef），闭包化后不可测。这里改成显式参数，
 * 判定顺序与短路语义保持不变：
 *   穆穆禁杀 > 诸葛连弩 > 张飞咆哮 > 王元姬谦冲 > 已用次数 > 张星彩枪舞点数
 */
export interface SlashGateInput {
  /** 孙鲁育「穆穆」：本回合被禁止使用【杀】 */
  mumuBlocked: boolean;
  /** 本回合已使用的【杀】数量 */
  usedThisTurn: number;
  /** 张星彩「枪舞」的判定点数；null 表示本回合未发动 */
  qiangwuPoint: number | null;
}

export function canPlaySlashByRules(p: Player, card: Card | undefined, g: SlashGateInput): boolean {
  if (g.mumuBlocked) return false;
  if (p.equipment?.weapon?.name === CardName.ZHUGE) return true;
  if (p.hero.name === '张飞') return true;
  if (p.hero.name === '王元姬' && p.qianchongType === 'basic') return true;
  if (g.usedThisTurn < 1) return true;
  if (card && p.hero.name === '张星彩' && g.qiangwuPoint !== null
    && rankValue(card.rank) > g.qiangwuPoint) return true;
  return false;
}
