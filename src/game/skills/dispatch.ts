import type {
  SkillContext, DamageEvent, CardUsedEvent, JudgeEvent,
  DrawPhaseEvent, DrawPhaseResult, DiscardPhaseEvent, DiscardPhaseResult, CardLostEvent,
  DeathEvent, DyingEvent, DyingResult, CardTargetsEvent, CardGainEvent, UseCardAsOptions, PlayPhaseEvent,
  DyingResolvedEvent, HealEvent,
} from './registry';
import { skillHook, mergeDrawPhase } from './registry';
import { mergeJudgeBefore, mergeDamageBefore } from './engineAbilities.ts';
import type { JudgeBeforeEvent, DamageBeforeEvent, JudgeBeforeResult, DamageBeforeResult } from './engineAbilities.ts';
import type { Card, CardName, Player } from '../../../types';

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
  /** 按条件从牌堆里找牌（追德：杀/闪/桃/酒各一张）。返回找到的牌并从牌堆移除。 */
  takeFromDeck?: (pred: (c: Card) => boolean, count: number) => Card[];
  takeFromDiscard?: (pred: (c: Card) => boolean, count: number) => Card[];
  loseHp?: (playerId: number, amount: number) => Promise<void>;
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
  /**
   * 「视为使用一张牌」。playerId 是**使用者**（通常是技能拥有者，
   * 日彗是「信众」持有者）。引擎侧走完整的 resolveCardEffect：
   * 无懈 / 响应 / 防具 / 伤害全都在里面。
   */
  useCardAs: (
    playerId: number,
    card: Card | CardName,
    targetIds: number[],
    opts?: UseCardAsOptions,
  ) => Promise<boolean>;
  /** 授予 / 收回 / 查询技能。playerId 是**被授予者**，sourceSkill 只用于战报。 */
  grantSkill: (playerId: number, skillName: string, sourceSkill: string, durationTurns?: number) => boolean;
  revokeSkill: (playerId: number, skillName: string, reason: string) => boolean;
  hasGrantedSkill: (playerId: number, skillName: string) => boolean;
  /** 当前轮数（从 1 开始）；「每轮首次」类技能用它去重 */
  roundCount: number;
  /** 座位距离 / 攻击范围判定（按角色 id） */
  distance: (fromId: number, toId: number) => number;
  canReach: (fromId: number, toId: number) => boolean;
  /** 弃牌堆的只读快照（尾部是最近弃置的牌） */
  peekDiscard: () => Card[];
  /** 攻击范围修正 / 翻面 / 复原武将牌 / 累计洗牌次数 */
  changeAttackRange: (playerId: number, delta: number) => void;
  flip: (playerId: number, flipped: boolean) => void;
  restoreGeneral: (playerId: number) => void;
  deckShuffleCount: number;
  readArea: (playerId: number, zone: 'hand' | 'equip' | 'judge') => Card[];
  discardFromArea: (playerId: number, cards: Card[]) => number;
  deckCount: number;
  attackRange: (playerId: number) => number;
  setChained: (playerId: number, chained: boolean) => void;
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
/**
 * 取某个角色的 heroMemory：不传 id 时是技能拥有者本人，传了就取对方。
 *
 * 跨角色标记（张楚「集众」给他人贴「信众」）必须写**对方**的 heroMemory，
 * 否则「谁身上有几个标记」在引擎里无从查询——「光噬」正需要查别人。
 */
const memFor = (
  players: Player[],
  hero: string,
  ofPlayerId: number | undefined,
): Record<string, unknown> => {
  if (ofPlayerId === undefined) return heroMemOf(hero);
  const target = players.find(p => p.id === ofPlayerId);
  return target ? heroMemOf(target.hero.name) : {};
};

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
  takeFromDeck: deps.takeFromDeck ?? (() => []),
  takeFromDiscard: deps.takeFromDiscard ?? (() => []),
  loseHp: deps.loseHp ?? (async () => {}),
  // 通用标记：落在 heroMemOf(hero) 里（与 ctx.heroMemory 是同一份对象），
  // 不碰 Player 结构，因此既不影响既有的四套 Player.*Marks 字段，也不用改存档格式。
  // 用 'marks:' 前缀隔离，避免与技能自己的 heroMemory 键冲突。
  addMark: (name: string, count = 1, toPlayerId?: number) => {
    const m = memFor(deps.players, hero, toPlayerId);
    const key = 'marks:' + name;
    m[key] = Number(m[key] ?? 0) + count;
  },
  removeMark: (name: string, count = 1, fromPlayerId?: number) => {
    const m = memFor(deps.players, hero, fromPlayerId);
    const key = 'marks:' + name;
    const cur = Number(m[key] ?? 0);
    const next = Math.max(0, cur - count);
    m[key] = next;
    return cur - next;
  },
  markCount: (name: string, ofPlayerId?: number) => Number(memFor(deps.players, hero, ofPlayerId)['marks:' + name] ?? 0),
  marks: (ofPlayerId?: number) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(memFor(deps.players, hero, ofPlayerId))) {
      if (k.startsWith('marks:')) out[k.slice(6)] = Number(v);
    }
    return out;
  },
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
  // 下面四项在 deps 层都要求显式给 playerId（技能可能作用于别人：
  // 日彗令「信众」持有者各自使用牌、连枝令他人获得「受责」），
  // 到 ctx 层再默认成技能拥有者本人，技能作者少写一个参数。
  useCardAs: (card, targetIds, opts) =>
    deps.useCardAs(opts?.asPlayerId ?? self.id, card, targetIds, opts),
  grantSkill: (skillName, toPlayerId, durationTurns) =>
    deps.grantSkill(toPlayerId ?? self.id, skillName, skill, durationTurns),
  revokeSkill: (skillName, ofPlayerId, reason) =>
    deps.revokeSkill(ofPlayerId ?? self.id, skillName, reason ?? skill),
  hasGrantedSkill: (skillName, ofPlayerId) =>
    deps.hasGrantedSkill(ofPlayerId ?? self.id, skillName),
  roundCount: deps.roundCount,
  distance: deps.distance,
  canReach: deps.canReach,
  peekDiscard: deps.peekDiscard,
  changeAttackRange: deps.changeAttackRange,
  flip: deps.flip,
  restoreGeneral: deps.restoreGeneral,
  deckShuffleCount: deps.deckShuffleCount,
  readArea: deps.readArea,
  discardFromArea: deps.discardFromArea,
  deckCount: deps.deckCount,
  attackRange: deps.attackRange,
  setChained: deps.setChained,
});

/** 找出场上的技能拥有者（跳过已死亡 / 技能被封印的） */
/**
 * 找某武将的所有者。
 *
 * `includeDead` 默认为 false：绝大多数时机（回合、摸牌、伤害）都只该由活着的
 * 角色触发。但 afterDeath 必须为 true —— 「当你死亡时」的技能（追德）
 * 在那里要能找到**已经 isDead 的自己**，否则钩子永远派发不到本人。
 * 这一点我最初漏了：加了 afterDeath 却仍走默认过滤，实测死者注册的
 * afterDeath 一次都没跑。
 */
const ownersOf = (deps: DispatchDeps, hero: string, includeDead = false): Player[] =>
  deps.players.filter(
    p => (includeDead || !p.isDead) && p.hero.name === hero && deps.skillsOn(p.id),
  );

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

/** 新一轮开始时（座位号回绕）。round 从 1 开始 */
export const dispatchRoundStart = async (deps: DispatchDeps, round: number): Promise<void> => {
  for (const { def, fn } of skillHook('onRoundStart')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), round);
    }
  }
};

/** 出牌阶段开始。owner 是这个阶段的回合角色，对全场技能拥有者派发（见 PlayPhaseEvent） */
export const dispatchPlayPhaseBegin = async (deps: DispatchDeps, owner: Player): Promise<void> => {
  const ev: PlayPhaseEvent = { owner };
  for (const { def, fn } of skillHook('onPlayPhaseBegin')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
};

/** 出牌阶段结束（出口见 App.tsx 的 playPhaseOpenRef） */
export const dispatchPlayPhaseEnd = async (deps: DispatchDeps, owner: Player): Promise<void> => {
  const ev: PlayPhaseEvent = { owner };
  for (const { def, fn } of skillHook('onPlayPhaseEnd')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
};

/** 有角色回复体力之后 */
export const dispatchAfterHeal = async (deps: DispatchDeps, ev: HealEvent): Promise<void> => {
  await withGuard('heal-' + ev.player.id + '-' + ev.player.hp, async () => {
    for (const { def, fn } of skillHook('afterHeal')) {
      for (const self of ownersOf(deps, def.hero)) {
        await fn(ctxFor(deps, self, def.hero, def.skill), ev);
      }
    }
  });
};

/** 脱离濒死（被救回）之后 */
export const dispatchAfterDying = async (deps: DispatchDeps, ev: DyingResolvedEvent): Promise<void> => {
  await withGuard(`dyingres-\${ev.victim.id}-\${ev.victim.hp}`, async () => {
    for (const { def, fn } of skillHook('afterDying')) {
      for (const self of ownersOf(deps, def.hero)) {
        await fn(ctxFor(deps, self, def.hero, def.skill), ev);
      }
    }
  });
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
      // includeDead：必须能派发到「已经阵亡的本人」（追德）
      for (const self of ownersOf(deps, def.hero, true)) {
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

/**
 * 一张牌的目标确定后、结算前的拦截（邀弈 / 劳燕 / 长姬）。
 *
 * 与 dispatchCardUsed 互补：后者在 finally 里、伤害已结算，那时改目标只是
 * 「日志好看、规则错误」。需要拦截或改写目标的技能只能用这里。
 *
 * 按注册顺序**串行**执行，后一个技能看到的是前一个改过的列表——
 * 这样「邀弈把目标改成我」之后，「劳燕」能基于新列表继续判断。
 */
export const dispatchTargets = async (
  deps: DispatchDeps,
  ev: CardTargetsEvent,
): Promise<CardTargetsEvent> => {
  let current = ev;
  await withGuard(`targets-${ev.source.id}-${ev.card.id}`, async () => {
    for (const { def, fn } of skillHook('onTargetsChosen')) {
      for (const self of ownersOf(deps, def.hero)) {
        const r = await fn(ctxFor(deps, self, def.hero, def.skill), current);
        if (r && Array.isArray(r.targets)) {
          current = { ...current, targets: r.targets };
          if (r.note) deps.log(r.note);
        }
      }
    }
  });
  return current;
};

/** 角色获得牌后（俐影 / 承宠 第二段） */
export const dispatchCardGain = async (deps: DispatchDeps, ev: CardGainEvent): Promise<void> => {
  // key 带上牌数：同一次批量获得只触发一遍，避免逐张派发时重复结算
  await withGuard(`gain-${ev.owner.id}-${ev.cards.map(c => c.id).join(',')}`, async () => {
    for (const { def, fn } of skillHook('afterCardGain')) {
      for (const self of ownersOf(deps, def.hero)) {
        await fn(ctxFor(deps, self, def.hero, def.skill), ev);
      }
    }
  });
};
