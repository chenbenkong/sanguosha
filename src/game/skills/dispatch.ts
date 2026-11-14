import type {
  SkillContext, DamageEvent, CardUsedEvent, JudgeEvent,
  DrawPhaseEvent, DrawPhaseResult, DiscardPhaseEvent, DiscardPhaseResult, CardLostEvent,
  DeathEvent, DyingEvent, DyingResult,
} from './registry';
import { skillHook, mergeDrawPhase } from './registry';
import { mergeJudgeBefore, mergeDamageBefore } from './engineAbilities.ts';
import type { JudgeBeforeEvent, DamageBeforeEvent, JudgeBeforeResult, DamageBeforeResult } from './engineAbilities.ts';
import type { Card, Player } from '../../../types';

/**
 * 注册表分发器：引擎在每个时机调用一次，遍历所有已注册技能。
 *
 * 这是把 202 处 hero.name === 'X' 内联分支替换掉的接入点。
 * 引擎侧不再关心具体是哪个武将，只负责构造事件、调用 dispatch*。
 */

/** 技能向玩家提问的请求形状（与引擎 SkillChoiceModal 对齐） */
export type SkillChoiceReq = {
  title: string;
  hint?: string;
  mode: 'choose' | 'multi' | 'card' | 'target';
  choices?: Array<{ id: string; label: string; desc?: string }>;
  targets?: Array<{ id: number; name: string; sub?: string }>;
  min?: number;
  max?: number;
  cancelLabel?: string;
};

/** 技能提问的返回值 */
export type SkillChoiceRes = { kind: string; id?: string; ids?: Array<string | number> } | null;

export interface DispatchDeps {
  players: Player[];
  turnOwner: Player | undefined;
  draw: (playerId: number, count: number) => Card[];
  discard: (playerId: number, cards: Card[]) => void;
  heal: (playerId: number, amount: number) => number;
  damage: (victimId: number, sourceId: number, amount: number, card?: Card) => Promise<void>;
  gainCard: (fromId: number, toId: number, card: Card) => void;
  log: (text: string) => void;
  banner: (hero: string, skill: string) => void;
  delay: (ms: number) => Promise<void>;
  skillsOn: (playerId: number) => boolean;
  /**
   * 牌堆顶预览 / 移出 / 改体力上限（可选能力）。
   *
   * 做成可选而不是必填：这三个能力需要引擎把 deckRef 与 updatePlayer 暴露出来，
   * 而引擎的调用点很多，一次性全接会牵动 combat.ts 的每一个 dispatch 调用。
   * 提供它们的调用点（App.tsx 的 buildSkillDeps、combat.ts 的濒死/伤害路径）
   * 逐一补齐即可；未提供时技能会看到 undefined，应自行降级或提前返回。
   */
  peekDeck?: (count: number) => Card[];
  deckTo?: (count: number, destination: 'discard' | 'hand', toId?: number) => Card[];
  changeMaxHp?: (playerId: number, delta: number) => void;
  /**
   * 一张牌的目标确定后、结算前的拦截（可选能力）。
   * 未提供时 onTargetsChosen 不会被派发。
   */
  applyTargets?: (source: Player, card: Card, targets: Player[]) => Promise<Player[]>;
  /** 向玩家提问；AI/托管返回 null（由引擎既有 SkillChoiceModal 实现） */
  requestChoice: (req: {
    title: string;
    hint?: string;
    mode: 'choose' | 'multi' | 'card' | 'target';
    choices?: Array<{ id: string; label: string; desc?: string }>;
    targets?: Array<{ id: number; name: string; sub?: string }>;
    min?: number;
    max?: number;
    cancelLabel?: string;
  }) => Promise<{ kind: string; id?: string; ids?: Array<string | number> } | null>;
}

/** 每个技能一份的跨回合存储（key = hero + skill） */
const MEMORY = new Map<string, Record<string, unknown>>();
/** 同一武将的所有技能共享一份存储（用于跨技能状态） */
const HERO_MEMORY = new Map<string, Record<string, unknown>>();
const heroMemOf = (hero: string): Record<string, unknown> => {
  let m = HERO_MEMORY.get(hero);
  if (!m) { m = {}; HERO_MEMORY.set(hero, m); }
  return m;
};

const memOf = (hero: string, skill: string): Record<string, unknown> => {
  const k = `${hero}::${skill}`;
  let m = MEMORY.get(k);
  if (!m) { m = {}; MEMORY.set(k, m); }
  return m;
};

/**
 * 递归深度保护。
 *
 * 技能可以调用 ctx.damage / ctx.draw 等，而这些动作又会在引擎里触发新的分发
 * （伤害→afterDamage→技能→伤害…）。正常对局里这类连锁只有几层，但一旦某个技能
 * 编写有误（或规则边界没卡住），就会退化成无限递归：
 * 表现为「页面卡死 + 战报疯狂刷屏」——正是玩家反馈的「自动快速死循环」。
 *
 * 这里做两件事：
 *  1. 超过 MAX_DEPTH 直接停止继续分发（宁可少结算一次，也不能锁死页面）
 *  2. 同一个「时机 + 触发者」在一轮里只分发一次，切断自激环
 */
const MAX_DEPTH = 8;
let depth = 0;
const inFlight = new Set<string>();

const withGuard = async <T>(
  key: string,
  fn: () => Promise<T>,
  fallback?: T,
): Promise<T | undefined> => {
  if (depth >= MAX_DEPTH) return fallback;
  if (inFlight.has(key)) return fallback;
  inFlight.add(key);
  depth += 1;
  try {
    return await fn();
  } finally {
    depth -= 1;
    inFlight.delete(key);
  }
};

/** 对某个武将构造上下文 */
const ctxFor = (deps: DispatchDeps, self: Player, hero: string, skill: string): SkillContext => ({
  self,
  players: deps.players,
  turnOwner: deps.turnOwner,
  draw: deps.draw,
  discard: deps.discard,
  heal: deps.heal,
  damage: deps.damage,
  gainCard: deps.gainCard,
  log: deps.log,
  // 可选能力：未提供时给一个「明确失败」的桩，而不是 undefined，
  // 这样技能里 `ctx.peekDeck(...)` 不会抛 TypeError，而是得到空数组并自行跳过。
  peekDeck: deps.peekDeck ?? (() => []),
  deckTo: deps.deckTo ?? (() => []),
  changeMaxHp: deps.changeMaxHp ?? (() => {}),
  banner: () => deps.banner(hero, skill),
  delay: deps.delay,
  memory: memOf(hero, skill),
  heroMemory: heroMemOf(hero),
  requestChoice: (req) => deps.requestChoice({
    ...req,
    // 弹窗需要知道是哪个技能在问
    title: req.title,
    hint: req.hint ?? `${hero} 的「${skill}」`,
  }),
});

/** 找出场上的技能拥有者（跳过已死亡 / 技能被封印的） */
const ownersOf = (deps: DispatchDeps, hero: string): Player[] =>
  deps.players.filter(p => !p.isDead && p.hero.name === hero && deps.skillsOn(p.id));

/** 回合结束 */
export const dispatchTurnEnd = async (deps: DispatchDeps, ending: Player): Promise<void> => {
  for (const { def, fn } of skillHook('onTurnEnd')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ending);
    }
  }
};

/** 回合开始 */
export const dispatchTurnStart = async (deps: DispatchDeps, owner: Player): Promise<void> => {
  for (const { def, fn } of skillHook('onTurnStart')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), owner);
    }
  }
};

/** 判定牌生效后 */
export const dispatchJudge = async (deps: DispatchDeps, ev: JudgeEvent): Promise<void> => {
  for (const { def, fn } of skillHook('afterJudge')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
};

/** 一张牌结算完成后 */
export const dispatchCardUsed = async (deps: DispatchDeps, ev: CardUsedEvent): Promise<void> => {
  await withGuard(`card-${ev.source.id}-${ev.card.id}`, async () => {
  for (const { def, fn } of skillHook('afterCardUsed')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
  });
};

/** 受到伤害后 */
export const dispatchAfterDamage = async (deps: DispatchDeps, ev: DamageEvent): Promise<void> => {
  await withGuard(`dmg-${ev.victim.id}-${ev.source?.id ?? -1}`, async () => {
  for (const { def, fn } of skillHook('afterDamage')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
  });
};

/** 造成伤害后 */
export const dispatchAfterDealDamage = async (deps: DispatchDeps, ev: DamageEvent): Promise<void> => {
  await withGuard(`deal-${ev.source?.id ?? -1}-${ev.victim.id}`, async () => {
  for (const { def, fn } of skillHook('afterDealDamage')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
  });
};

/** 摸牌阶段额外摸牌数（只统计摸牌者本人的技能） */
export const dispatchDrawBonus = (deps: DispatchDeps, drawerId: number): number => {
  let total = 0;
  for (const { def, fn } of skillHook('drawPhaseBonus')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== drawerId) continue;
      total += fn(ctxFor(deps, self, def.hero, def.skill));
    }
  }
  return total;
};

/** 手牌上限增量（累加）：杜夫人「顺世」等 */
export const dispatchHandLimitBonus = (deps: DispatchDeps, ownerId: number): number => {
  let total = 0;
  for (const { def, fn } of skillHook('handLimitBonus')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== ownerId) continue;
      total += fn(ctxFor(deps, self, def.hero, def.skill));
    }
  }
  return total;
};

/** 不计入手牌上限的牌数：王悦/王桃「护关」的花色豁免等 */
export const dispatchExemptHandCards = (
  deps: DispatchDeps,
  ownerId: number,
  declaredSuit: import('../../../types').Suit | null,
): number => {
  let total = 0;
  for (const { def, fn } of skillHook('exemptHandCards')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== ownerId) continue;
      total += fn(ctxFor(deps, self, def.hero, def.skill), declaredSuit);
    }
  }
  return total;
};


/** 判定前：收集所有技能的修正并合并。引擎用返回值替换判定牌 / 改写花色 */
export const dispatchJudgeBefore = async (
  deps: DispatchDeps,
  ev: JudgeBeforeEvent,
): Promise<JudgeBeforeResult> => await withGuard(`jb-${ev.owner.id}-${ev.reason}`, async () => {
  const results: Array<JudgeBeforeResult | null | void> = [];
  for (const { def, fn } of skillHook('judgeBefore')) {
    for (const self of ownersOf(deps, def.hero)) {
      results.push(await fn(ctxFor(deps, self, def.hero, def.skill), ev));
    }
  }
  return mergeJudgeBefore(results);
}) || {};

/** 伤害前：收集所有技能的修正并合并。引擎用返回值调整数值 / 防止 / 转移 */
export const dispatchDamageBefore = async (
  deps: DispatchDeps,
  ev: DamageBeforeEvent,
): Promise<DamageBeforeResult> => await withGuard(`db-${ev.victim.id}-${ev.source?.id ?? -1}`, async () => {
  const results: Array<DamageBeforeResult | null | void> = [];
  for (const { def, fn } of skillHook('damageBefore')) {
    for (const self of ownersOf(deps, def.hero)) {
      results.push(await fn(ctxFor(deps, self, def.hero, def.skill), ev));
    }
  }
  return mergeDamageBefore(results);
}) || {};

/** 摸牌阶段开始：收集所有技能的修正并合并（突袭改获得 / 裸衣少摸一张） */
export const dispatchDrawPhaseBegin = async (
  deps: DispatchDeps,
  drawerId: number,
  ev: DrawPhaseEvent,
): Promise<DrawPhaseResult> => await withGuard(`dpb-${drawerId}`, async () => {
  const results: Array<DrawPhaseResult | null | void> = [];
  for (const { def, fn } of skillHook('drawPhaseBegin')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== drawerId) continue;
      results.push(await fn(ctxFor(deps, self, def.hero, def.skill), ev));
    }
  }
  return mergeDrawPhase(results);
}) || {};

/** 弃牌阶段：任意一个技能返回 skip 即跳过整个弃牌阶段（克己） */
export const dispatchDiscardPhaseSkip = (
  deps: DispatchDeps,
  ownerId: number,
  ev: DiscardPhaseEvent,
): DiscardPhaseResult => {
  for (const { def, fn } of skillHook('discardPhaseSkip')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== ownerId) continue;
      const r = fn(ctxFor(deps, self, def.hero, def.skill), ev);
      if (r && r.skip) return r;
    }
  }
  return { skip: false };
};

/** 不因使用/打出而失去牌后（弃置 / 被获得 / 移出装备区） */
export const dispatchCardLost = async (deps: DispatchDeps, ev: CardLostEvent): Promise<void> => {
  await withGuard(`lost-${ev.player.id}-${ev.cards.map(c => c.id).join(',')}`, async () => {
    for (const { def, fn } of skillHook('afterCardLost')) {
      for (const self of ownersOf(deps, def.hero)) {
        if (self.id !== ev.player.id) continue;
        await fn(ctxFor(deps, self, def.hero, def.skill), ev);
      }
    }
  });
};

/** 测试用：清空技能内存 */
export const __clearSkillMemory = (): void => { MEMORY.clear(); HERO_MEMORY.clear(); };

/** 有角色阵亡后（追德 / 善身） */
export const dispatchDeath = async (deps: DispatchDeps, ev: DeathEvent): Promise<void> => {
  // 用阵亡者 id 做 key：同一次死亡只该触发一遍，避免呼叫链重入时重复结算
  await withGuard(`death-${ev.dead.id}`, async () => {
    for (const { def, fn } of skillHook('afterDeath')) {
      for (const self of ownersOf(deps, def.hero)) {
        await fn(ctxFor(deps, self, def.hero, def.skill), ev);
      }
    }
  });
};

/**
 * 有角色进入濒死、求桃之前（御心 / 困励 / 殇决）。
 *
 * 返回第一个给出结果的技能（多个技能都想救时，先注册的优先），
 * 都不干预则返回 null 由引擎走正常求桃流程。
 */
export const dispatchDying = async (
  deps: DispatchDeps,
  ev: DyingEvent,
): Promise<DyingResult | null> => {
  for (const { def, fn } of skillHook('onDying')) {
    for (const self of ownersOf(deps, def.hero)) {
      const r = await fn(ctxFor(deps, self, def.hero, def.skill), ev);
      if (r && typeof r.hp === 'number') return r;
    }
  }
  return null;
};
