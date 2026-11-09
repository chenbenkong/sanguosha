import type { Player } from '../../../types';
import { Identity } from '../../../types';
import { pickWeakest } from '../policies/targets';

/**
 * AI 选目标（从 App.tsx 的 pickAITarget 搬出）。
 *
 * 与 React 无关；原实现读 playersRef / aiDifficultyRef / guessIdentity 三个闭包，
 * 这里收进显式的 `ctx` 参数，App 侧组装一次调用即可。
 * 决策树、分支顺序、Math.random 的调用次数与原实现完全一致——
 * 保证同一随机序列下逐局结果不变（含 easy 难度 30% 乱选）。
 */

export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface PickAITargetContext {
  /** 全部角色（含阵亡，内部自行过滤） */
  players: readonly Player[];
  /** 难度（原为 aiDifficultyRef.current） */
  difficulty: AiDifficulty;
  /** 身份推测（原为 guessIdentity） */
  guessIdentity: (p: Player) => Identity | undefined;
}

/** 威胁评分：残血、手牌多、装备多、主公、已亮明、高威胁武将依次加分 */
export const threatScore = (p: Player): number => {
  const equipCount = p.equipment
    ? [p.equipment.weapon, p.equipment.armor, p.equipment.horsePlus, p.equipment.horseMinus].filter(Boolean).length
    : 0;
  const heroThreat = ['黄月英', '周瑜', '甄姬', '孙权', '诸葛亮', '华佗', '蔡文姬'].includes(p.hero.name) ? 2 : 0;
  return (p.maxHp - p.hp) * 3 + p.hand.length + equipCount * 2
    + (p.identity === Identity.ZHUGONG ? 4 : 0) + (p.isRevealed ? 2 : 0) + heroThreat;
};

/**
 * 按自身阵营选择最有价值的目标：反贼集火主公，忠臣/主公先打反贼，内奸先清反贼并留主公。
 *
 * 注意：easy 难度的乱选分支每次最多消耗一次 Math.random()，
 * 调用顺序与数量与原实现逐行一致（先 easyRandom，再 hardPick，再 pickWeakest）。
 */
export const pickAITarget = (ai: Player, ctx: PickAITargetContext): Player | null => {
  const others = ctx.players.filter(p => !p.isDead && p.id !== ai.id);
  if (others.length === 0) return null;
  const lord = others.find(p => p.identity === Identity.ZHUGONG);
  const rebels = others.filter(p => ctx.guessIdentity(p) === Identity.FANZEI);
  const difficulty = ctx.difficulty;

  const hardPick = (pool: Player[]): Player | null => pool.length
    ? [...pool].sort((a, b) => threatScore(b) - threatScore(a))[0]
    : null;
  const easyRandom = (pool: Player[]): Player | null => (difficulty === 'easy' && pool.length && Math.random() < 0.3)
    ? pool[Math.floor(Math.random() * pool.length)]
    : null;

  if (ai.identity === Identity.FANZEI) {
    // 反贼：优先集火主公（主公身份始终公开）
    if (lord && lord.id !== ai.id) return lord;
    const pool = others.filter(p => ctx.guessIdentity(p) !== Identity.FANZEI);
    return easyRandom(pool)
      ?? (difficulty === 'hard' ? hardPick(pool) : null)
      ?? pickWeakest(pool)
      ?? pickWeakest(others);
  }

  if (ai.identity === Identity.ZHONGCHEN || ai.identity === Identity.ZHUGONG) {
    const pool = rebels.length
      ? rebels
      : others.filter(p => ctx.guessIdentity(p) !== Identity.ZHONGCHEN && ctx.guessIdentity(p) !== Identity.ZHUGONG);
    return easyRandom(pool)
      ?? (difficulty === 'hard' ? hardPick(pool) : null)
      ?? pickWeakest(pool)
      ?? pickWeakest(others.filter(p => ctx.guessIdentity(p) !== Identity.ZHUGONG));
  }

  // 内奸：先帮主公清反贼，最后才动主公
  if (rebels.length) return easyRandom(rebels) ?? (difficulty === 'hard' ? hardPick(rebels) : null) ?? pickWeakest(rebels);
  const nonLord = others.filter(p => p.identity !== Identity.ZHUGONG);
  return (difficulty === 'hard' ? hardPick(nonLord) : null)
    ?? pickWeakest(nonLord)
    ?? (lord && others.length === 1 ? lord : null);
};
