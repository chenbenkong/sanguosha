import { CardName, CardType, Identity, Suit } from '../../../types';
import type { Card, Player } from '../../../types';
import type { DispatchDeps } from './dispatch';
import type { UseCardAsOptions } from './registry';
import { __clearSkillMemory } from './dispatch';

/**
 * 技能行为测试的夹具。
 *
 * 目标：在不启动 React 的前提下，构造一副可控的牌局，记录技能产生的所有副作用
 * （摸牌 / 弃牌 / 回血 / 伤害 / 日志），从而断言「规则对不对」而不只是「跑不跑得动」。
 */

let seq = 0;
export const mkCard = (o: Partial<Card> = {}): Card => {
  seq += 1;
  return {
    id: 'c' + seq,
    name: CardName.SHA,
    type: CardType.BASIC,
    suit: Suit.SPADE,
    rank: '7',
    value: 7,
    description: '',
    imageColor: '',
    ...o,
  };
};

export const mkPlayer = (over: Partial<Player> & { name?: string } = {}): Player => {
  const { name, ...rest } = over;
  return {
    id: 0,
    isHuman: false,
    hero: {
      id: 'h',
      name: name ?? '测试武将',
      kingdom: '魏',
      maxHp: 3,
      avatarUrl: '',
      description: '',
      skillName: '',
      skillDesc: '',
      gender: 'female',
    },
    hp: 3,
    maxHp: 3,
    hand: [],
    identity: Identity.ZHONGCHEN,
    isDead: false,
    isRevealed: true,
    isSelected: false,
    ...rest,
  } as Player;
};

/** 记录一次技能产生的全部副作用 */
export interface Effects {
  drawn: Array<{ playerId: number; count: number }>;
  discarded: Array<{ playerId: number; count: number }>;
  healed: Array<{ playerId: number; amount: number }>;
  damaged: Array<{ victimId: number; sourceId: number; amount: number }>;
  logs: string[];
  banners: string[];
  /** ctx.useCardAs 的调用记录。真实结算发生在引擎里，单测只断言「技能申请了什么」 */
  usedCards: Array<{ playerId: number; card: Card | CardName; targetIds: number[]; opts: UseCardAsOptions | undefined }>;
  /** ctx.grantSkill / ctx.revokeSkill 的调用记录 */
  granted: Array<{ playerId: number; skill: string; sourceSkill: string; durationTurns?: number }>;
  revoked: Array<{ playerId: number; skill: string; reason: string }>;
}

export const emptyEffects = (): Effects => ({
  drawn: [], discarded: [], healed: [], damaged: [], logs: [], banners: [],
  usedCards: [], granted: [], revoked: [],
});

/**
 * 只提供「无害空实现」的 deps，供不需要副作用记录的单测铺底。
 *
 * 新能力（useCardAs / grantSkill / roundCount…）只需要在这里补一次：
 * DispatchDeps 的能力字段是**必填**的，所以任何新增能力都会让所有手写 deps 的
 * 用例在编译期报错，而不是运行时静默退化成空桩。
 */
export const noopDeps = (players: Player[]): DispatchDeps => ({
  players,
  turnOwner: players[0],
  draw: () => [],
  discard: () => {},
  heal: () => 0,
  damage: async () => {},
  gainCard: () => {},
  log: () => {},
  banner: () => {},
  delay: async () => {},
  skillsOn: () => true,
  requestChoice: async () => null,
  useCardAs: async () => false,
  grantSkill: () => false,
  revokeSkill: () => false,
  hasGrantedSkill: () => false,
  roundCount: 1,
});

/** 夹具里 grantSkill / hasGrantedSkill 的真实（进程内）语义 */
const grantedByPlayer = new Map<number, Set<string>>();
export const __clearGrantedSkills = (): void => grantedByPlayer.clear();

export interface HarnessOptions {
  /** 每个玩家的技能是否生效（默认全部 true） */
  skillsOn?: (id: number) => boolean;
  /** 玩家回答技能提问；默认 null（等同 AI/托管，走自动分支） */
  requestChoice?: DispatchDeps['requestChoice'];
  /** ctx.roundCount 的取值（「每轮首次」类技能用它去重） */
  roundCount?: number;
}

export interface Harness {
  deps: DispatchDeps;
  fx: Effects;
}

/** 构造一套可控的牌局依赖；所有副作用都记在 fx 里 */
export const makeHarness = (players: Player[], opts: HarnessOptions = {}): Harness => {
  __clearSkillMemory();
  const fx = emptyEffects();
  grantedByPlayer.clear();
  const deps: DispatchDeps = {
    ...noopDeps(players),
    skillsOn: opts.skillsOn ?? (() => true),
    requestChoice: opts.requestChoice ?? (async () => null),
    roundCount: opts.roundCount ?? 1,
    draw: (playerId, count) => {
      fx.drawn.push({ playerId, count });
      return [];
    },
    discard: (playerId, cards) => {
      fx.discarded.push({ playerId, count: cards.length });
    },
    heal: (playerId, amount) => {
      fx.healed.push({ playerId, amount });
      return amount;
    },
    damage: async (victimId, sourceId, amount) => {
      fx.damaged.push({ victimId, sourceId, amount });
    },
    log: (t) => { fx.logs.push(t); },
    banner: (h, s) => { fx.banners.push(h + ':' + s); },
    // 单测里没有真实结算链：记录调用并返回 true。技能给的牌面修正
    // （不可被响应 / 伤害 +N）由用例直接断言 opts；需要真实结算的用例
    // 可以自行覆盖 deps.useCardAs。
    useCardAs: async (playerId, card, targetIds, o) => {
      fx.usedCards.push({ playerId, card, targetIds, opts: o });
      return true;
    },
    grantSkill: (playerId, skillName, sourceSkill, durationTurns) => {
      const set = grantedByPlayer.get(playerId) ?? new Set<string>();
      if (set.has(skillName)) return false;
      set.add(skillName);
      grantedByPlayer.set(playerId, set);
      fx.granted.push({ playerId, skill: skillName, sourceSkill, durationTurns });
      return true;
    },
    revokeSkill: (playerId, skillName, reason) => {
      const set = grantedByPlayer.get(playerId);
      if (!set || !set.has(skillName)) return false;
      set.delete(skillName);
      fx.revoked.push({ playerId, skill: skillName, reason });
      return true;
    },
    hasGrantedSkill: (playerId, skillName) => grantedByPlayer.get(playerId)?.has(skillName) ?? false,
  };
  return { deps, fx };
};

/** 便捷：断言某玩家被摸了 count 张 */
export const drawnFor = (fx: Effects, playerId: number): number =>
  fx.drawn.filter(d => d.playerId === playerId).reduce((a, d) => a + d.count, 0);

/** 便捷：断言某玩家造成的总伤害 */
export const damageFrom = (fx: Effects, sourceId: number): number =>
  fx.damaged.filter(d => d.sourceId === sourceId).reduce((a, d) => a + d.amount, 0);
