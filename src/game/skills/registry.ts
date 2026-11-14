import type { Card, Player } from '../../../types.ts';
import type { JudgeBeforeEvent, JudgeBeforeResult, DamageBeforeEvent, DamageBeforeResult } from './engineAbilities.ts';
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
  /**
   * 牌堆顶的牌（只读预览，不改变牌堆）。
   *
   * 供「观看牌堆顶 X 张」类技能（慧淑 / 灵慧 / 追姬 / 隅泣）。返回的牌是副本，
   * 技能据此做展示与决策；真正取牌请用 draw（取牌堆顶）或 deckMove。
   */
  peekDeck: (count: number) => Card[];
  /**
   * 把牌堆顶的牌移到指定去处（「置于武将牌上」「置入弃牌堆」）。
   *
   * destination 目前支持 'discard'（弃牌堆）与 'hand'（手牌）。
   * 需要「放在武将牌上」这类自定义区域时，把它记进 ctx.memory 并从牌堆移出即可。
   */
  deckTo: (count: number, destination: 'discard' | 'hand', toId?: number) => Card[];
  /**
   * 修改体力上限（困励 / 殇决 / 妆戎）。
   *
   * delta 可正可负；引擎会把 hp 夹在 [0, maxHp] 内（除非 allowZero 且 hp 已是 0）。
   * 这是此前唯一无法通过 ctx 表达的「角色卡面改动」。
   */
  changeMaxHp: (playerId: number, delta: number) => void;
  /**
   * 按条件从牌堆里找牌（追德：杀/闪/桃/酒各一张）。
   *
   * 与 deckTo 的区别：deckTo 只能从**顶部**取 count 张，
   * 而「四张不同牌名」要求按牌名精确取。返回找到的牌（已从牌堆移除）；
   * 牌堆里凑不齐时返回能凑到的部分，调用方按实际数量结算。
   */
  takeFromDeck: (pred: (c: Card) => boolean, count: number) => Card[];
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
  /** 判定牌翻出后、生效前：可替换判定牌或改写花色（刚烈/洛神/红颜/鬼才） */
  judgeBefore?: (ctx: SkillContext, ev: JudgeBeforeEvent) => JudgeBeforeResult | null | void | Promise<JudgeBeforeResult | null | void>;
  /** 伤害结算前：可改数值、防止、转移（绝情/骄矜/竭缘/天香/藤甲） */
  damageBefore?: (ctx: SkillContext, ev: DamageBeforeEvent) => DamageBeforeResult | null | void | Promise<DamageBeforeResult | null | void>;
  /** 不占手牌上限的牌数 */
  exemptHandCards?: (ctx: SkillContext, declaredSuit: Suit | null) => number;
  /** 摸牌阶段开始：可改写摸牌数，或声明本次改用其它方式获得牌（突袭 / 裸衣） */
  drawPhaseBegin?: (ctx: SkillContext, ev: DrawPhaseEvent) => DrawPhaseResult | null | void | Promise<DrawPhaseResult | null | void>;
  /** 弃牌阶段：返回 skip 表示跳过整个弃牌阶段（克己） */
  discardPhaseSkip?: (ctx: SkillContext, ev: DiscardPhaseEvent) => DiscardPhaseResult | null | void;
  /**
   * 一张牌的目标确定后、**结算前**（邀弈 / 劳燕 / 长姬）。
   *
   * 这是与 afterCardUsed 互补的时机：afterCardUsed 在 finally 里、伤害已结算，
   * 那时再改目标只是「日志好看、规则错误」。需要拦截或改写目标的技能只能用这里。
   *
   * 返回 { targets } 表示改写目标列表；返回 null/undefined 表示不干预。
   * 多个技能同时改写时按注册顺序串行，后一个看到的是前一个改过的列表。
   */
  onTargetsChosen?: (
    ctx: SkillContext,
    ev: CardTargetsEvent,
  ) => CardTargetsResult | null | void | Promise<CardTargetsResult | null | void>;
  /** 角色不因使用/打出而失去牌后：弃置 / 被获得 / 移出装备区（枭姬 / 连营） */
  afterCardLost?: (ctx: SkillContext, ev: CardLostEvent) => Promise<void> | void;
  /**
   * 角色**获得**牌后（俐影 / 承宠 的第二段）。
   *
   * 与 afterCardLost 严格互补：那个是「失去牌者」视角，这个是被给牌的一方。
   * 两者都挂在 mutateHand / gainCard 上，但只有接收方能收到 afterCardGain。
   */
  afterCardGain?: (ctx: SkillContext, ev: CardGainEvent) => Promise<void> | void;
  /**
   * 有角色阵亡后（追德 / 善身）。
   *
   * 传的是**阵亡者**：技能拥有者自己的阵亡要用 self === ev.dead 判断。
   * 与 afterDamage 分开是因为「死亡」不是伤害的子事件——
   * 体力流失、技能致死、粮尽都可能导致阵亡，挂 damage 会漏。
   */
  afterDeath?: (ctx: SkillContext, ev: DeathEvent) => Promise<void> | void;
  /**
   * 有角色进入濒死状态、尚未结算求桃前（御心 / 困励 / 殇决）。
   *
   * 返回 heal 表示技能立即把体力拉回（引擎据此跳过求桃），
   * 返回 null/undefined 表示不干预。注意这是**唯一**能救回濒死者的时机，
   * 之后的 afterDamage 已经在求桃流程之后了。
   */
  onDying?: (ctx: SkillContext, ev: DyingEvent) => DyingResult | null | void | Promise<DyingResult | null | void>;
}

/**
 * 摸牌阶段事件：引擎给出基础摸牌数（已含 drawPhaseBonus 的累加）。
 */
export interface DrawPhaseEvent {
  count: number;
}

/**
 * 摸牌阶段返回值：技能可改写摸牌数，也可声明本次不摸牌（改为其它获得方式）。
 */
export interface DrawPhaseResult {
  /** 改写后的摸牌数 */
  count?: number;
  /** 本次不以摸牌结算（技能已自行完成效果），引擎跳过摸牌 */
  replaced?: boolean;
  /** 战报说明 */
  note?: string;
}

/** 一张牌的目标已确定、尚未结算 */
export interface CardTargetsEvent {
  /** 使用者 */
  source: Player;
  /** 正在结算的牌 */
  card: Card;
  /** 当前目标（可能被前面的技能改过） */
  targets: Player[];
}

/** onTargetsChosen 的返回值：改写后的目标列表 */
export interface CardTargetsResult {
  targets: Player[];
  /** 战报说明 */
  note?: string;
}

/** 角色获得牌的事件 */
export interface CardGainEvent {
  /** 获得牌的人 */
  owner: Player;
  /** 获得的牌 */
  cards: Card[];
  /** 牌从谁那里来（从牌堆/弃牌堆获得时为 undefined） */
  from: Player | undefined;
}

/** 角色阵亡事件 */
export interface DeathEvent {
  /** 阵亡者 */
  dead: Player;
  /** 击杀者（体力流失等情况为 undefined） */
  killer: Player | undefined;
}

/** 进入濒死事件：引擎在结算求桃之前派发 */
export interface DyingEvent {
  /** 濒死者 */
  victim: Player;
  /** 造成这次伤害的来源（体力流失为 undefined） */
  source: Player | undefined;
  /** 需要回复到多少点体力才算脱离濒死（通常是 1） */
  needHp: number;
}

/** onDying 的返回值：技能已把体力拉回，引擎据此跳过求桃 */
export interface DyingResult {
  /** 回复后的体力值；引擎会把它写到 victim 上 */
  hp: number;
  /** 战报说明 */
  note?: string;
}

/** 弃牌阶段事件 */
export interface DiscardPhaseEvent {
  /** 本回合已使用的【杀】数 */
  slashesUsed: number;
  /** 按手牌上限本应弃置的张数 */
  excess: number;
}

/** 弃牌阶段返回值：skip 为 true 表示跳过整个弃牌阶段 */
export interface DiscardPhaseResult {
  skip: boolean;
  /** 战报说明 */
  note?: string;
}

/**
 * 失去牌事件：牌**不因使用或打出**而离开该角色的手牌或装备区。
 * 覆盖弃置、被其他角色获得、装备被顶替/拆走等所有途径。
 */
export interface CardLostEvent {
  /** 失去牌的角色 */
  player: Player;
  /** 失去的牌 */
  cards: Card[];
  /** 失去途径；'other' 为上面三类之外的途径（如技能直接改写手牌） */
  cause: 'discard' | 'gain' | 'equip' | 'other';
  /** 失去之后该角色剩余的手牌数 */
  handAfter: number;
  /** 本批失去的牌是否来自装备区（装备区的牌不占手牌，handAfter 在此期间不变） */
  fromEquip: boolean;
}

/** 摸牌阶段修正合并：replaced 一旦为 true 即终止；count 取最后一次显式设置 */
export function mergeDrawPhase(results: Array<DrawPhaseResult | null | void>): DrawPhaseResult {
  const out: DrawPhaseResult = {};
  for (const r of results) {
    if (!r) continue;
    if (typeof r.count === 'number') out.count = r.count;
    if (r.replaced) { out.replaced = true; break; }
    if (r.note) out.note = out.note ? out.note + '；' + r.note : r.note;
  }
  return out;
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
