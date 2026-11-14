import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CardName, CardType, GamePhase } from '../../../types';
import type { Card, Player } from '../../../types';
import { mkCard, mkPlayer, noopDeps } from './testHarness';
import { createCombatEngine } from '../combat';
import type { CombatDeps, CombatEngine } from '../combat';
import { dispatchJudgeBefore } from './dispatch';
import type { JudgeBeforeResult } from './engineAbilities';
import { registerSkill } from './registry';
import { patchGame } from '../gameStore';
// 真实技能注册表：本文件测的是「引擎有没有真的把钩子接上」，
// 因此用产品里注册的释衅 / 红颜，而不是测试里自造的替身。
import './index';

/**
 * 结算前钩子的**引擎接线**测试。
 *
 * engineAbilities.test.ts 只证明「合并规则」和「dispatcher 会被调用」——它直接调
 * dispatcher，绕过了引擎。于是「引擎是否在正确的时机调用、返回值是否真的生效、
 * 提前返回是否把处理锁放回去」这三件事没有任何用例覆盖。
 *
 * 上一批扩展正是因为 damageBefore 的提前 return 跳过了 finally 里的减锁，
 * 让 isProcessing 停在 1 上，整局卡死。所以这里用真实的 createCombatEngine 跑
 * takeDamage，并把 setIsProcessing 换成一个会计数的实现。
 */

// ── 浏览器环境补丁 ──
// takeDamage 会读 window.jiuBoost（【酒】加成），Node 环境下没有 window。
// 只补它用到的那几个全局，不加任何依赖。
const w = globalThis as unknown as { window?: Record<string, unknown> };
w.window = {
  ...(w.window ?? {}),
  jiuBoost: {} as Record<number, boolean>,
  setInterval: globalThis.setInterval,
  setTimeout: globalThis.setTimeout,
  clearInterval: globalThis.clearInterval,
  clearTimeout: globalThis.clearTimeout,
};

// ── 一局可控的牌局：真实引擎 + 真实 CombatDeps 契约 ──

interface Trial {
  engine: CombatEngine;
  /** 当前体力 */
  hp: (id: number) => number;
  /** isProcessing 的当前值（引擎靠它挡住结算期间的其他操作） */
  lock: () => number;
  logs: string[];
  players: () => Player[];
}

type Roster = Array<{ name: string; id: number; hp?: number }>;

/** 让钩子在结算途中读到当前对局的锁计数（buildTrial 时重绑） */
const probeLock: { trial: Trial } = { trial: null as unknown as Trial };

const buildTrial = (roster: Roster): Trial => {
  let players: Player[] = roster.map(r =>
    mkPlayer({ name: r.name, id: r.id, hp: r.hp ?? 10, maxHp: r.hp ?? 10 }));
  patchGame({
    players,
    deck: [],
    discardPile: [],
    turnIndex: 0,
    phase: GamePhase.ACTION,
    winnerSide: null,
  });

  const player = (id: number) => players.find(p => p.id === id);
  const commit = (next: Player[]) => { players = next; patchGame({ players: next }); };
  const updatePlayer: CombatDeps['updatePlayer'] = (id, updates) => {
    commit(players.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };
  const updatePlayerWith: CombatDeps['updatePlayerWith'] = (id, fn) => {
    const cur = player(id);
    if (cur) updatePlayer(id, fn(cur));
  };
  const mutateHand: CombatDeps['mutateHand'] = (id, fn) => {
    commit(players.map(p => (p.id === id ? { ...p, hand: fn(p.hand) } : p)));
  };

  const logs: string[] = [];
  const lock = { value: 0 };
  const ref = <T,>(initial: T) => ({ current: initial });
  const noop = () => {};
  const asyncNoop = async () => {};

  const deps: CombatDeps = {
    DECISION_SECONDS: 20,
    MAX_WUXIE_DEPTH: 6,
    addDelayedTrick: noop,
    addLog: (text) => { logs.push(text); },
    aiDifficultyRef: ref('normal'),
    canReach: () => true,
    canUseWusheng: () => false,
    grantSkillById: () => false,
    revokeSkillById: () => false,
    roundCountRef: ref(1),
    cangHuiUsedRef: ref(false),
    chainWaveRef: ref(null),
    deckRef: ref([]),
    delay: asyncNoop,
    discardCards: noop,
    discardPileRef: ref([]),
    drawCards: () => [],
    dyingResolver: ref(null),
    dyingTickRef: ref(null),
    dyingTimeoutRef: ref(null),
    fengpoBoostRef: ref({}),
    fengpoUsedRef: ref(false),
    firstUsedCardRef: ref(new Set<string>()),
    turnOwnerIdRef: ref(0),
    fangduUsedRef: ref(new Set<string>()),
    kanggeRescueRef: ref(new Set<number>()),
    lingleUsedRef: ref(new Set<string>()),
    fumianTargetUsedRef: ref(false),
    fxFly: false,
    gainThreeTypes: noop,
    getDistance: () => 1,
    getPlayer: player,
    getTargetLegalityVeto: () => null,
    getTargetProtection: () => null,
    grantXushenToRescuer: noop,
    guohuanghouLevelRef: ref({}),
    handleDeath: asyncNoop,
    hasGrantedSkill: () => false,
    hasWeimu: () => false,
    hasZhangMark: () => false,
    humanReactionResolver: ref(null),
    identityGuessRef: ref({}),
    isAiTakeover: true,
    isAiTakeoverRef: ref(true),
    isAlly: () => false,
    isEnemy: () => true,
    lastShuanghuaiTargetRef: ref(null),
    leaveActionPhase: noop,
    lingrenBoostRef: ref({}),
    lingrenUsedRef: ref(false),
    lockXiaohuiCards: noop,
    mumuNoSlashRef: ref(null),
    mutateHand,
    onEquipLost: noop,
    // 判定在引擎里由 App 的 performJudgment 提供；本文件的判定用例直接走 dispatcher
    performJudgment: async () => null,
    phaseLiveRef: ref(GamePhase.ACTION),
    playCard: noop,
    playSound: noop,
    get players() { return players; },
    playersRef: ref(players),
    reactionTickRef: ref(null),
    recentlySavedRef: ref({}),
    recoverHp: (id, amount) => {
      const cur = player(id);
      if (!cur) return 0;
      updatePlayer(id, { hp: Math.min(cur.maxHp, cur.hp + amount) });
      return amount;
    },
    requestSkillChoice: async () => null,
    setDamageAnimTarget: noop,
    setDyingLeft: noop,
    setDyingState: noop,
    setGuohuanghouLevel: noop,
    setHealAnimTarget: noop,
    setHealNumber: noop,
    setIsProcessing: (value) => {
      lock.value = typeof value === 'function' ? value(lock.value) : value;
    },
    setPendingReaction: noop,
    setReactionLeft: noop,
    setWuguSelection: noop,
    sheyiUsedRef: ref(false),
    shouldAiSavePlayer: () => false,
    shouxiDeclaredRef: ref(new Set<string>()),
    showSkillBanner: noop,
    shuanghuaiUsedRef: ref(false),
    skillsOn: () => true,
    slashUsageRef: ref({}),
    spawnCardFlight: noop,
    timeoutIdRef: ref(null),
    triggerBeige: asyncNoop,
    triggerLieren: asyncNoop,
    triggerShuyong: asyncNoop,
    triggerWanwei: noop,
    triggerXiaoji: noop,
    tryZhenlie: async () => false,
    turnCountRef: ref(1),
    turnIndex: 0,
    turnUsedOnOthersRef: ref({}),
    updatePlayer,
    updatePlayerWith,
    xiaohuiLocked: () => false,
    yuejianCountRef: ref(0),
    requestChoice: async () => null,
    yuejianPendingRef: ref(new Map()),
    zhixiRef: ref(null),
    zhuquePrefRef: ref({}),
  };

  // players 是 getter，解构后是快照；引擎内部只用到 playersRef，这里无影响
  const trial: Trial = {
    engine: createCombatEngine(deps),
    hp: (id) => player(id)?.hp ?? -1,
    lock: () => lock.value,
    logs,
    players: () => players,
  };
  probeLock.trial = trial;
  return trial;
};

/** 一次性爆发的伤害：不传【杀】，避免【酒】/裸衣等加成参与计算 */
const plainDamage = (engine: CombatEngine, victimId: number, sourceId: number, amount: number, nature?: 'fire' | 'thunder') =>
  engine.takeDamage(victimId, sourceId, amount, undefined, nature);

describe('damageBefore 在引擎里生效', () => {
  it('返回 prevent 时 takeDamage 不再扣血（真实技能孙茹「释衅」）', async () => {
    const t = buildTrial([{ name: '孙茹', id: 0 }, { name: '甲', id: 1 }]);
    expect(t.hp(0)).toBe(10);

    await plainDamage(t.engine, 0, 1, 1, 'fire');

    expect(t.hp(0)).toBe(10);
    expect(t.logs.some(l => l.includes('释衅'))).toBe(true);
    expect(t.logs.some(l => l.includes('受到 1 点火焰伤害'))).toBe(false);
  });

  it('返回 amount 时实际扣血量等于该值，且钩子拿到的原始伤害是引擎算好的值', async () => {
    const seen: Array<{ victimId: number; amount: number; nature: string }> = [];
    registerSkill({
      hero: '测试减伤',
      skill: '固定为2',
      hooks: {
        damageBefore: (_ctx, ev) => {
          seen.push({ victimId: ev.victim.id, amount: ev.amount, nature: ev.nature });
          return ev.victim.id === 0 ? { amount: 2 } : null;
        },
      },
    });
    const t = buildTrial([{ name: '测试减伤', id: 0 }, { name: '甲', id: 1 }]);

    await plainDamage(t.engine, 0, 1, 5);

    expect(t.hp(0)).toBe(8); // 10 - 2
    expect(seen).toEqual([{ victimId: 0, amount: 5, nature: 'normal' }]);
    expect(t.logs.some(l => l.includes('受到 2 点伤害'))).toBe(true);
  });

  it('返回 transferTo 时伤害转到目标身上、原目标不扣血', async () => {
    registerSkill({
      hero: '测试转移',
      skill: '转给下家',
      hooks: {
        damageBefore: (_ctx, ev) => (ev.victim.id === 0 ? { transferTo: 1 } : null),
      },
    });
    const t = buildTrial([{ name: '测试转移', id: 0 }, { name: '甲', id: 1 }]);

    await plainDamage(t.engine, 0, 2, 3);

    expect(t.hp(0)).toBe(10); // 原目标分文未损
    expect(t.hp(1)).toBe(7);  // 伤害完整落到转移目标身上
    expect(t.logs.some(l => l.includes('伤害转移给 甲'))).toBe(true);
  });

  it('三条提前返回路径都不泄漏处理锁（isProcessing 回到 0）', async () => {
    // 锁在结算期间确实被举起过：否则下面的 lock()===0 只证明「从没加过锁」，是无意义断言。
    // 派遣器只对「场上拥有该技能的武将」分发，所以探针要挂在下面三个武将自己的名下。
    const locksInFlight: number[] = [];
    for (const hero of ['测试锁A', '测试锁B', '测试锁C']) {
      registerSkill({
        hero,
        skill: '读锁',
        hooks: {
          damageBefore: (_ctx, ev) => {
            if (ev.victim.id === 0) locksInFlight.push(probeLock.trial.lock());
            return null;
          },
        },
      });
    }

    registerSkill({
      hero: '测试锁A',
      skill: '防止',
      hooks: { damageBefore: (_ctx, ev) => (ev.victim.id === 0 ? { prevent: true } : null) },
    });
    registerSkill({
      hero: '测试锁B',
      skill: '归零',
      hooks: { damageBefore: (_ctx, ev) => (ev.victim.id === 0 ? { amount: 0 } : null) },
    });
    registerSkill({
      hero: '测试锁C',
      skill: '转移',
      hooks: { damageBefore: (_ctx, ev) => (ev.victim.id === 0 ? { transferTo: 1 } : null) },
    });

    // 1) prevent 提前返回
    const a = buildTrial([{ name: '测试锁A', id: 0 }, { name: '甲', id: 1 }]);
    await plainDamage(a.engine, 0, 1, 2);
    expect(a.hp(0)).toBe(10);
    expect(a.lock()).toBe(0);

    // 2) amount <= 0 提前返回
    const b = buildTrial([{ name: '测试锁B', id: 0 }, { name: '甲', id: 1 }]);
    await plainDamage(b.engine, 0, 1, 2);
    expect(b.hp(0)).toBe(10);
    expect(b.lock()).toBe(0);

    // 3) transferTo 提前返回（内含一次递归 takeDamage，两次加锁都要归还）
    const c = buildTrial([{ name: '测试锁C', id: 0 }, { name: '甲', id: 1 }]);
    await plainDamage(c.engine, 0, 1, 2);
    expect(c.hp(0)).toBe(10);
    expect(c.hp(1)).toBe(8);
    expect(c.lock()).toBe(0);

    // 钩子被调用时锁恰好是 1：证明「加锁 → 钩子 → 减锁」这条链路真的走过，
    // 上面三处 lock()===0 不是「从来没加过锁」的同义反复
    expect(locksInFlight).toEqual([1, 1, 1]);
  });
});

/**
 * 判定牌的落地方式。App.tsx 的 performJudgment 在拿到 dispatchJudgeBefore 的返回值后
 * 只做两件事：replaceWith 覆盖判定牌、treatSuitAs 改写花色。
 *
 * performJudgment 定义在 App 组件内部（依赖 40+ 个闭包），无法在单测里直接取得；
 * 这里按它的两步逐字重放，并由下面「App.tsx 仍在使用这两个字段」的守卫用例
 * 保证重放没有与产品代码脱节。
 */
const applyJudgeBefore = async (
  deps: Parameters<typeof dispatchJudgeBefore>[0],
  owner: Player,
  reason: string,
  card: Card,
): Promise<Card> => {
  const pre: JudgeBeforeResult = await dispatchJudgeBefore(deps, { owner, reason, card });
  let finalCard = card;
  if (pre.replaceWith) finalCard = pre.replaceWith;
  if (pre.treatSuitAs) finalCard = { ...finalCard, suit: pre.treatSuitAs };
  return finalCard;
};

describe('judgeBefore 在引擎里生效', () => {
  /** 与引擎一致的最小 DispatchDeps：players 用当前对局、log 收集起来 */
  const depsFor = (t: Trial, log: string[]) => ({
    ...noopDeps(t.players()),
    log: (text: string) => { log.push(text); },
  });

  it('返回 replaceWith 时最终判定牌被替换', async () => {
    const replacement = mkCard({ name: CardName.SHAN });
    registerSkill({
      hero: '测试改判',
      skill: '换一张',
      hooks: { judgeBefore: (_ctx, ev) => (ev.reason === '测试' ? { replaceWith: replacement } : null) },
    });
    const t = buildTrial([{ name: '测试改判', id: 0 }]);
    const log: string[] = [];
    const judged = await applyJudgeBefore(
      depsFor(t, log), t.players()[0], '测试', mkCard({ name: CardName.SHA }),
    );

    expect(judged.name).toBe(CardName.SHAN);
    expect(judged.id).toBe(replacement.id);
  });

  it('返回 treatSuitAs 时花色被改写（真实技能小乔「红颜」）', async () => {
    const t = buildTrial([{ name: '小乔', id: 0 }]);
    const log: string[] = [];
    const diamond = mkCard({ name: CardName.SHA, suit: '♦' as Card['suit'] });

    const judged = await applyJudgeBefore(depsFor(t, log), t.players()[0], '乐不思蜀', diamond);

    expect(judged.suit).toBe('♥');
    expect(judged.name).toBe(diamond.name); // 只有花色被改，牌本身不动
    expect(log.some(l => l.includes('红颜'))).toBe(true);
  });

  it('App.tsx 的 performJudgment 仍在应用这两个返回值（防止单测与产品脱节）', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../../App.tsx'), 'utf8');
    expect(/finalCard = pre\.replaceWith/.test(app)).toBe(true);
    expect(/finalCard = \{ \.\.\.finalCard, suit: pre\.treatSuitAs \}/.test(app)).toBe(true);
  });
});

/**
 * ctx.useCardAs（视为使用一张牌）的引擎级验证。
 *
 * 这是第六批最关键的原语：灵慧 / 锦绘 / 花火 / 双锐 / ☆ 狩星 / 纫霜 / 酖毒 /
 * 日彗 / 风影 / 枕戈 全靠它。它必须走**完整**结算，所以这里用真实引擎断言
 * 伤害真的落地、【闪】真的被响应、noResponse / damageBonus 真的改变结果 ——
 * 而不是只断言「调用了 dispatcher」。
 */
describe('useCardAs 在真实引擎里结算', () => {
  const giveShan = (trial: Trial, id: number) => {
    // 直接改对象：引擎用 getPlayer 从同一个 players 数组里找，能读到
    trial.players().find(p => p.id === id)!.hand.push(
      mkCard({ name: CardName.SHAN, type: CardType.BASIC }),
    );
  };

  it('对他人使用虚拟【杀】走完整结算，造成 1 点伤害', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 4 }]);
    const ok = await t.engine.useCardAs(0, CardName.SHA, [1]);
    expect(ok).toBe(true);
    expect(t.hp(1)).toBe(3);
  });

  it('目标手上有【闪】时会被响应，伤害不落地（证明确实走了响应链）', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 4 }]);
    giveShan(t, 1);
    await t.engine.useCardAs(0, CardName.SHA, [1]);
    expect(t.hp(1)).toBe(4);
  });

  it('noResponse：同一局面下【闪】无法响应，伤害照常落地', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 4 }]);
    giveShan(t, 1);
    await t.engine.useCardAs(0, CardName.SHA, [1], { noResponse: true, reason: '测试·双锐' });
    expect(t.hp(1)).toBe(3);
    expect(t.logs.some(l => l.includes('不可被响应'))).toBe(true);
  });

  it('damageBonus：伤害 +1 真的加到这次结算上', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 5 }]);
    await t.engine.useCardAs(0, CardName.SHA, [1], { damageBonus: 1 });
    expect(t.hp(1)).toBe(3);
  });

  it('damageBonus 只作用于这一张牌（同一使用者下一张普通【杀】仍是 1 点）', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 6 }]);
    await t.engine.useCardAs(0, CardName.SHA, [1], { damageBonus: 1 });
    expect(t.hp(1)).toBe(4);
    await t.engine.useCardAs(0, CardName.SHA, [1]);
    expect(t.hp(1)).toBe(3);
  });

  it('传一张真实的牌时沿用其牌名与花色，用新 id 结算（日彗 / 风影）', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 4 }]);
    const real = mkCard({ name: CardName.SHA, suit: '♥' as Card['suit'] });
    const idBefore = real.id;
    const suitBefore = real.suit;
    await t.engine.useCardAs(0, real, [1]);
    expect(t.hp(1)).toBe(3);
    // 引擎不搬动、也不改写技能传进来的那张牌：它按同一牌名/花色结算一份副本
    expect(real.id).toBe(idBefore);
    expect(real.suit).toBe(suitBefore);
    expect(t.logs.some(l => l.includes('【杀】'))).toBe(true);
  });

  it('使用者已阵亡 / 目标全部已阵亡时返回 false 且不结算', async () => {
    const t = buildTrial([{ name: '甲', id: 0 }, { name: '乙', id: 1, hp: 4 }]);
    t.players()[0].isDead = true;
    expect(await t.engine.useCardAs(0, CardName.SHA, [1])).toBe(false);
    t.players()[0].isDead = false;
    t.players()[1].isDead = true;
    expect(await t.engine.useCardAs(0, CardName.SHA, [1])).toBe(false);
    expect(t.hp(1)).toBe(4);
  });
});
