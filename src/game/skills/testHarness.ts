import { CardName, CardType, Identity, Suit } from '../../../types';
import type { Card, Player } from '../../../types';
import type { DispatchDeps } from './dispatch';
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
}

export const emptyEffects = (): Effects => ({
  drawn: [], discarded: [], healed: [], damaged: [], logs: [], banners: [],
});

export interface HarnessOptions {
  /** 每个玩家的技能是否生效（默认全部 true） */
  skillsOn?: (id: number) => boolean;
  /** 玩家回答技能提问；默认 null（等同 AI/托管，走自动分支） */
  requestChoice?: DispatchDeps['requestChoice'];
}

export interface Harness {
  deps: DispatchDeps;
  fx: Effects;
}

/** 构造一套可控的牌局依赖；所有副作用都记在 fx 里 */
export const makeHarness = (players: Player[], opts: HarnessOptions = {}): Harness => {
  __clearSkillMemory();
  const fx = emptyEffects();
  const deps: DispatchDeps = {
    players,
    turnOwner: players[0],
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
    gainCard: () => {},
    log: (t) => { fx.logs.push(t); },
    banner: (h, s) => { fx.banners.push(h + ':' + s); },
    delay: async () => {},
    skillsOn: opts.skillsOn ?? (() => true),
    requestChoice: opts.requestChoice ?? (async () => null),
  };
  return { deps, fx };
};

/** 便捷：断言某玩家被摸了 count 张 */
export const drawnFor = (fx: Effects, playerId: number): number =>
  fx.drawn.filter(d => d.playerId === playerId).reduce((a, d) => a + d.count, 0);

/** 便捷：断言某玩家造成的总伤害 */
export const damageFrom = (fx: Effects, sourceId: number): number =>
  fx.damaged.filter(d => d.sourceId === sourceId).reduce((a, d) => a + d.amount, 0);
