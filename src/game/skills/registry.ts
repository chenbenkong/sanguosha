import type { Card, Player } from '../../../types.ts';
import type { CardName, Suit } from '../../../types.ts';

/**
 * 技能注册表 —— 让「新增一个武将技能」只写一个新文件。
 *
 * 背景：在注册表之前，每个技能都要在 App.tsx（7729 行）与 combat.ts（2799 行）
 * 里各 grep 一次找时机，再手改 CombatDeps 接口、解构区、App 组装三处。
 * 202 处 hero.name === 'X' 的内联分支让并行开发必然冲突。
 *
 * 现在：技能作者只实现下面的钩子，在 src/game/skills/index.ts 里注册一次即可。
 * 引擎在对应时机统一调用，不再需要知道具体武将名字。
 */

/** 技能可用的上下文：引擎注入，技能作者只读/通过它施加效果 */
export interface SkillContext {
  /** 触发者（技能拥有者） */
  self: Player;
  /** 当前所有角色（只读快照） */
  players: Player[];
  /** 当前回合角色 */
  turnOwner: Player | undefined;
  /** 引擎动作 */
  draw: (playerId: number, count: number) => Card[];
  discard: (playerId: number, cards: Card[]) => void;
  heal: (playerId: number, amount: number) => number;
  damage: (victimId: number, sourceId: number, amount: number, card?: Card) => Promise<void>;
  gainCard: (fromId: number, toId: number, card: Card) => void;
  log: (text: string) => void;
  banner: () => void;
  delay: (ms: number) => Promise<void>;
  /**
   * 向玩家提问（选择目标 / 选牌 / 选项）。
   * AI 与托管场景返回 null，技能应据此走自动决策分支。
   * 复用引擎既有的 SkillChoiceModal（含读秒与超时兜底）。
   */
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
   * 同一武将的**共享**存储：该武将的所有技能读写同一份。
   * 用于跨技能状态（如尹夫人「媵予」发动后解锁「拥嬖」的减伤）。
   */
  heroMemory: Record<string, unknown>;
  /** 每个技能一份的持久存储（跨回合保留） */
  memory: Record<string, unknown>;
}

/** 一次伤害事件的描述 */
export interface DamageEvent {
  victim: Player;
  source: Player | undefined;
  amount: number;
  nature: 'normal' | 'fire' | 'thunder';
  card: Card | undefined;
}

/** 一次出牌事件 */
export interface CardUsedEvent {
  source: Player;
  card: Card;
  targets: Player[];
  /** 该角色本回合使用的第几张牌（从 1 开始） */
  usedCount: number;
}

/** 一次判定事件 */
export interface JudgeEvent {
  owner: Player;
  card: Card;
  reason: string;
}

/**
 * 技能的钩子集合。全部可选——只实现你需要的时机。
 * 返回值：true 表示技能已生效（引擎会打日志/播特效），false 表示未触发。
 */
export interface SkillHooks {
  /** 回合开始时（自己或任意角色的回合） */
  onTurnStart?: (ctx: SkillContext, owner: Player) => Promise<void> | void;
  /** 回合结束时 */
  onTurnEnd?: (ctx: SkillContext, ending: Player) => Promise<void> | void;
  /** 摸牌阶段：返回额外的摸牌数 */
  drawPhaseBonus?: (ctx: SkillContext) => number;
  /** 受到伤害后 */
  afterDamage?: (ctx: SkillContext, ev: DamageEvent) => Promise<void> | void;
  /** 造成伤害后 */
  afterDealDamage?: (ctx: SkillContext, ev: DamageEvent) => Promise<void> | void;
  /** 任意角色使用一张牌后（用于「首张牌」「成为目标」类） */
  afterCardUsed?: (ctx: SkillContext, ev: CardUsedEvent) => Promise<void> | void;
  /** 判定牌生效后 */
  afterJudge?: (ctx: SkillContext, ev: JudgeEvent) => Promise<void> | void;
  /** 弃牌阶段前的互斥修正：返回手牌上限的增量 */
  handLimitBonus?: (ctx: SkillContext) => number;
  /** 不占手牌上限的牌数 */
  exemptHandCards?: (ctx: SkillContext, declaredSuit: Suit | null) => number;
}

/** 一个武将技能的完整定义 */
export interface SkillDef {
  /** 武将名（与 HEROES 中的 name 一致） */
  hero: string;
  /** 技能名（用于日志与横幅） */
  skill: string;
  /** 是否为锁定技（自动发动，不询问玩家） */
  locked?: boolean;
  hooks: SkillHooks;
}

/** 注册表本体 */
const REGISTRY = new Map<string, SkillDef[]>();

/** 注册一个技能（在 src/game/skills/index.ts 里调用） */
export function registerSkill(def: SkillDef): void {
  const list = REGISTRY.get(def.hero) ?? [];
  list.push(def);
  REGISTRY.set(def.hero, list);
}

/** 取某武将的全部技能定义 */
export function skillsOf(heroName: string): SkillDef[] {
  return REGISTRY.get(heroName) ?? [];
}

/** 取实现了某个钩子的所有 (技能, 钩子) 对 */
export function skillHook<K extends keyof SkillHooks>(
  hook: K,
): Array<{ def: SkillDef; fn: NonNullable<SkillHooks[K]> }> {
  const out: Array<{ def: SkillDef; fn: NonNullable<SkillHooks[K]> }> = [];
  for (const list of REGISTRY.values()) {
    for (const def of list) {
      const fn = def.hooks[hook];
      if (fn) out.push({ def, fn: fn as NonNullable<SkillHooks[K]> });
    }
  }
  return out;
}

/** 已注册的武将数量（测试用） */
export function registeredHeroCount(): number {
  return REGISTRY.size;
}

/** 清空注册表（仅测试用） */
export function __clearRegistry(): void {
  REGISTRY.clear();
}
