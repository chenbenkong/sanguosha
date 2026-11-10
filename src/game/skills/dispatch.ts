import type {
  SkillContext, DamageEvent, CardUsedEvent, JudgeEvent,
} from './registry';
import { skillHook } from './registry';
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
const memOf = (hero: string, skill: string): Record<string, unknown> => {
  const k = `${hero}::${skill}`;
  let m = MEMORY.get(k);
  if (!m) { m = {}; MEMORY.set(k, m); }
  return m;
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
  banner: () => deps.banner(hero, skill),
  delay: deps.delay,
  memory: memOf(hero, skill),
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
  for (const { def, fn } of skillHook('afterCardUsed')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
};

/** 受到伤害后 */
export const dispatchAfterDamage = async (deps: DispatchDeps, ev: DamageEvent): Promise<void> => {
  for (const { def, fn } of skillHook('afterDamage')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
};

/** 造成伤害后 */
export const dispatchAfterDealDamage = async (deps: DispatchDeps, ev: DamageEvent): Promise<void> => {
  for (const { def, fn } of skillHook('afterDealDamage')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), ev);
    }
  }
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

/** 测试用：清空技能内存 */
export const __clearSkillMemory = (): void => { MEMORY.clear(); };
