import React from 'react';
import type { Card, EquipmentSlot, Player } from '../../types';
import { canHuguan, tianzeCanStrike, cilvDrawCount, fangduEffect, yuanditriggers } from './skills-batch6';
import { dispatchAfterDamage, dispatchAfterDealDamage, dispatchCardUsed, dispatchDamageBefore, dispatchDying, dispatchTargets } from './skills/dispatch';
import type { DispatchDeps } from './skills/dispatch';
import { CardName, CardType, GamePhase, Identity, Suit } from '../../types';
import { setDeck, setDiscardPile } from './gameStore';
import { rankValue, shuffle } from './utils';
import type { LogEntry } from '../../types';
import type { SkillChoiceRequest, SkillChoiceResult } from '../components/game/SkillChoiceModal';

/**
 * 对局战斗引擎：App.tsx 里 6 个互相递归的结算函数，函数体逐字搬出。
 *
 * 为什么是工厂函数：resolveCardEffect / takeDamage / askForPeaches / triggerReaction
 * 构成一个强连通分量（互相递归），且共用 App 的 93 个闭包（ref、状态 setter、
 * 其他技能结算函数）。若改成每个函数收一份 ctx，这 93 个依赖要在 6 个
 * 签名里重复六遍、调用点全改；一次注入产出一个互相可见的函数表则函数体一行不必动。
 *
 * 依赖经 CombatDeps 显式声明（原来靠词法作用域隐式捕获），因此漏传会在编译期报错，
 * 而不是运行期 undefined。调用语义与搬出前完全一致。
 */

export interface CombatDeps {
  DECISION_SECONDS: 20;
  MAX_WUXIE_DEPTH: 6;
  addDelayedTrick: (playerId: number, card: Card) => void;
  addLog: (text: string, type?: LogEntry["type"]) => void;
  aiDifficultyRef: React.RefObject<"easy" | "normal" | "hard">;
  canReach: (from: Player, to: Player) => boolean;
  canUseWusheng: (p: Player) => boolean;
  cangHuiUsedRef: React.RefObject<boolean>;
  chainWaveRef: React.RefObject<Set<number> | null>;
  deckRef: React.RefObject<Card[]>;
  delay: (ms: number) => Promise<void>;
  discardCards: (playerId: number, cardsToDiscardIn: Card[]) => void;
  discardPileRef: React.RefObject<Card[]>;
  drawCards: (playerId: number, count: number) => Card[];
  dyingResolver: React.RefObject<((result: boolean) => void) | null>;
  dyingTickRef: React.RefObject<number | null>;
  dyingTimeoutRef: React.RefObject<NodeJS.Timeout | null>;
  fengpoBoostRef: React.RefObject<Record<string, number>>;
  fengpoUsedRef: React.RefObject<boolean>;
  firstUsedCardRef: React.RefObject<Set<string>>;
  /** 第六批：当前回合角色 id（芳妒要求「回合外」） */
  turnOwnerIdRef: React.RefObject<number>;
  /** 第六批：芳妒「本回合首次」去重 */
  fangduUsedRef: React.RefObject<Set<string>>;
  /** 唐姬「抗歌」救援每轮限一次去重 */
  kanggeRescueRef: React.RefObject<Set<number>>;
  /** 第六批：聆乐「本轮首次」去重 */
  lingleUsedRef: React.RefObject<Set<string>>;
  fumianTargetUsedRef: React.RefObject<boolean>;
  fxFly: boolean;
  gainThreeTypes: (ownerId: number) => void;
  getDistance: (fromId: number, toId: number) => number;
  getPlayer: (id: number) => Player | undefined;
  getTargetLegalityVeto: (source: Player, target: Player, card: Card) => string | null;
  getTargetProtection: (target: Player, cardName: CardName) => string | null;
  grantXushenToRescuer: (victimId: number, rescuerId: number) => void;
  guohuanghouLevelRef: React.RefObject<Record<number, number>>;
  handleDeath: (victimId: number, killerId?: number) => Promise<void>;
  hasGrantedSkill: (p: Player, skillName: string) => boolean;
  hasWeimu: (p: Player) => boolean;
  hasZhangMark: (p: Player, mark: string) => boolean;
  humanReactionResolver: React.RefObject<((result: { played: boolean; isWuxie: boolean; }) => void) | null>;
  identityGuessRef: React.RefObject<Record<number, Identity>>;
  isAiTakeover: boolean;
  isAiTakeoverRef: React.RefObject<boolean>;
  isAlly: (a: Player, b: Player) => boolean;
  isEnemy: (a: Player, b: Player) => boolean;
  lastShuanghuaiTargetRef: React.RefObject<number | null>;
  leaveActionPhase: () => void;
  lingrenBoostRef: React.RefObject<Record<string, { targetId: number; bonus: number; }>>;
  lingrenUsedRef: React.RefObject<boolean>;
  lockXiaohuiCards: (ownerId: number, receiverId: number, cards: Card[]) => void;
  mumuNoSlashRef: React.RefObject<number | null>;
  mutateHand: (id: number, fn: (hand: Card[]) => Card[]) => void;
  onEquipLost: (playerId: number, equipName: CardName) => void;
  performJudgment: (playerId: number, reason: string) => Promise<Card | null>;
  phaseLiveRef: React.RefObject<GamePhase>;
  playCard: (playerId: number, card: Card) => void;
  playSound: (key: string, gender?: "male" | "female") => void;
  players: Player[];
  playersRef: React.RefObject<Player[]>;
  reactionTickRef: React.RefObject<number | null>;
  recentlySavedRef: React.RefObject<Record<number, number>>;
  recoverHp: (playerId: number, amount: number) => number;
  requestSkillChoice: (req: SkillChoiceRequest, allowPrompt?: boolean) => Promise<SkillChoiceResult | null>;
  setDamageAnimTarget: (value: React.SetStateAction<number | null>) => void;
  setDyingLeft: (value: React.SetStateAction<number | null>) => void;
  setDyingState: (value: React.SetStateAction<{ victimId: number; isActive: boolean; rescuerId?: number; hasTao?: boolean; hasJiu?: boolean; hasJijiu?: boolean; resolve: (result: boolean) => void; } | null>) => void;
  setGuohuanghouLevel: (value: React.SetStateAction<number>) => void;
  setHealAnimTarget: (value: React.SetStateAction<number | null>) => void;
  setHealNumber: (value: React.SetStateAction<{ targetId: number; amount: number; id: string; } | null>) => void;
  setIsProcessing: (value: React.SetStateAction<number>) => void;
  setPendingReaction: (value: React.SetStateAction<{ sourceId: number; targetId: number; cardName: CardName; originalCard: Card; canUseLongdan?: boolean; skillCardName?: CardName; canUseWuxie?: boolean; } | null>) => void;
  setReactionLeft: (value: React.SetStateAction<number | null>) => void;
  setWuguSelection: (value: React.SetStateAction<{ cards: Card[]; playerName: string; onSelect: (card: Card | null) => void; } | null>) => void;
  sheyiUsedRef: React.RefObject<boolean>;
  shouldAiSavePlayer: (rescuer: Player, victim: Player) => boolean;
  shouxiDeclaredRef: React.RefObject<Set<string>>;
  showSkillBanner: (hero: string, skill: string) => void;
  shuanghuaiUsedRef: React.RefObject<boolean>;
  skillsOn: (id: number) => boolean;
  slashUsageRef: React.RefObject<Record<number, number>>;
  spawnCardFlight: (card: Card, fromId: number, toId: number) => void;
  timeoutIdRef: React.RefObject<number | null>;
  triggerBeige: (victimId: number, sourceId: number, damageCard?: Card) => Promise<void>;
  triggerLieren: (victimId: number, sourceId: number, damageCard?: Card) => Promise<void>;
  triggerShuyong: (ownerId: number, preferredVictimId?: number) => Promise<void>;
  triggerWanwei: (ownerId: number, names: string[]) => void;
  triggerXiaoji: (playerId: number, card: Card) => void;
  tryZhenlie: (target: Player, source: Player, card: Card) => Promise<boolean>;
  turnCountRef: React.RefObject<number>;
  turnIndex: number;
  turnUsedOnOthersRef: React.RefObject<Record<number, boolean>>;
  updatePlayer: (id: number, updates: Partial<Player>) => void;
  updatePlayerWith: (id: number, fn: (p: Player) => Partial<Player>) => void;
  xiaohuiLocked: (playerId: number, cardId: string) => boolean;
  yuejianCountRef: React.RefObject<number>;
  /** 向玩家提问（技能注册表用；AI/托管返回 null） */
  requestChoice: (req: import('./skills/dispatch').SkillChoiceReq) => Promise<import('./skills/dispatch').SkillChoiceRes>;
  yuejianPendingRef: React.RefObject<Map<string, number>>;
  zhixiRef: React.RefObject<{ id: number; limit: number; used: number; trickUsed: boolean; } | null>;
  zhuquePrefRef: React.RefObject<Record<number, "normal" | "fire">>;
}

export interface CombatEngine {
  resolveCardEffect: (source: Player, targets: Player[], card: Card) => Promise<void>;
  resolveWuxieChain: (sourceId: number, triggerCard: Card) => Promise<boolean>;
  triggerReaction: (responderId: number, sourceId: number, neededCard: CardName, triggerCard: Card, isSecondReaction?: boolean) => Promise<boolean>;
  askForPeaches: (victimId: number) => Promise<boolean>;
  takeDamage: (victimId: number, sourceId: number, amount: number, damageCard?: Card, nature?: 'fire' | 'thunder') => Promise<void>;
  triggerZhennan: (source: Player, finalTargets: Player[], card: Card) => Promise<void>;
}

export const createCombatEngine = (deps: CombatDeps): CombatEngine => {
  const {
    DECISION_SECONDS,
    MAX_WUXIE_DEPTH,
    addDelayedTrick,
    addLog,
    aiDifficultyRef,
    canReach,
    canUseWusheng,
    cangHuiUsedRef,
    chainWaveRef,
    deckRef,
    delay,
    discardCards,
    discardPileRef,
    drawCards,
    dyingResolver,
    dyingTickRef,
    dyingTimeoutRef,
    fengpoBoostRef,
    fengpoUsedRef,
    firstUsedCardRef,
    turnOwnerIdRef,
    fangduUsedRef,
    lingleUsedRef,
    kanggeRescueRef,
    fumianTargetUsedRef,
    fxFly,
    gainThreeTypes,
    getDistance,
    getPlayer,
    getTargetLegalityVeto,
    getTargetProtection,
    grantXushenToRescuer,
    guohuanghouLevelRef,
    handleDeath,
    hasGrantedSkill,
    hasWeimu,
    hasZhangMark,
    humanReactionResolver,
    identityGuessRef,
    isAiTakeover,
    isAiTakeoverRef,
    isAlly,
    isEnemy,
    lastShuanghuaiTargetRef,
    leaveActionPhase,
    lingrenBoostRef,
    lingrenUsedRef,
    lockXiaohuiCards,
    mumuNoSlashRef,
    mutateHand,
    onEquipLost,
    performJudgment,
    phaseLiveRef,
    playCard,
    playSound,
    players,
    playersRef,
    reactionTickRef,
    recentlySavedRef,
    recoverHp,
    requestSkillChoice,
    setDamageAnimTarget,
    setDyingLeft,
    setDyingState,
    setGuohuanghouLevel,
    setHealAnimTarget,
    setHealNumber,
    setIsProcessing,
    setPendingReaction,
    setReactionLeft,
    setWuguSelection,
    sheyiUsedRef,
    shouldAiSavePlayer,
    shouxiDeclaredRef,
    showSkillBanner,
    shuanghuaiUsedRef,
    skillsOn,
    slashUsageRef,
    spawnCardFlight,
    timeoutIdRef,
    triggerBeige,
    triggerLieren,
    triggerShuyong,
    triggerWanwei,
    triggerXiaoji,
    tryZhenlie,
    turnCountRef,
    turnIndex,
    turnUsedOnOthersRef,
    updatePlayer,
    updatePlayerWith,
    xiaohuiLocked,
    yuejianCountRef,
    yuejianPendingRef,
    zhixiRef,
    zhuquePrefRef,
  } = deps;

/**
 * 技能派发用的依赖。**所有时机共用这一份**，不要在调用点各写一个字面量。
 *
 * 为什么必须统一：这个对象在 combat.ts 里原本被复制了 6 份（伤害后/造成伤害后/
 * 濒死/改目标等）。我加 peekDeck / deckTo / takeFromDeck / changeMaxHp 时只补了
 * App.tsx 的 buildSkillDeps，6 份副本全都没跟上——于是那些能力在伤害、濒死等
 * 路径上退化成空桩，依赖它们的技能（隅泣、慧淑、灵慧…）注册了却永远静默不发动。
 * 这正是 skillCoverage 想防的「有实现但永不触发」。抽成一处后就不会再漂移。
 */
const skillDeps = (): DispatchDeps => ({
  players: playersRef.current,
  turnOwner: playersRef.current.find(x => x.id === turnOwnerIdRef.current),
  draw: (pid: number, n: number) => drawCards(pid, n),
  discard: (pid: number, cards: Card[]) => discardCards(pid, cards),
  heal: (pid: number, n: number) => recoverHp(pid, n),
  damage: async (vid: number, sid: number, amt: number, cd?: Card) => { await takeDamage(vid, sid, amt, cd); },
  gainCard: (fromId: number, toId: number, cd: Card) => {
    mutateHand(fromId, h => h.filter(c => c.id !== cd.id));
    mutateHand(toId, h => [...h, cd]);
  },
  log: (t: string) => addLog(t, 'skill'),
  banner: (h: string, sk: string) => showSkillBanner(h, sk),
  delay: (ms: number) => delay(ms),
  skillsOn: (pid: number) => skillsOn(pid),
  requestChoice: deps.requestChoice,
  // 牌堆顶在数组尾部（与 drawCards 的取牌顺序一致）
  peekDeck: (count: number) => [...deckRef.current].slice(-count).reverse(),
  deckTo: (count: number, destination: 'discard' | 'hand', toId?: number) => {
    const n = Math.min(count, deckRef.current.length);
    if (n <= 0) return [];
    const taken = deckRef.current.slice(-n).reverse();
    const rest = deckRef.current.slice(0, -n);
    deckRef.current = rest;
    setDeck(rest);
    if (destination === 'discard') {
      const nd = [...discardPileRef.current, ...taken];
      discardPileRef.current = nd;
      setDiscardPile(nd);
    } else if (toId !== undefined) {
      mutateHand(toId, h => [...h, ...taken]);
    }
    return taken;
  },
  takeFromDeck: (pred: (c: Card) => boolean, count: number) => {
    const taken: Card[] = [];
    const rest: Card[] = [];
    // 从牌堆顶开始找，保持与可见顺序一致
    for (let i = deckRef.current.length - 1; i >= 0; i--) {
      const c = deckRef.current[i];
      if (taken.length < count && pred(c)) taken.push(c);
      else rest.unshift(c);
    }
    if (taken.length === 0) return [];
    deckRef.current = rest;
    setDeck(rest);
    return taken;
  },
  takeFromDiscard: (pred: (c: Card) => boolean, count: number) => {
    const taken: Card[] = [];
    const rest: Card[] = [];
    // 弃牌堆的顺序是「后进的在上」，与牌堆无效；这里按存储顺序扫描即可
    for (const c of discardPileRef.current) {
      if (taken.length < count && pred(c)) taken.push(c);
      else rest.push(c);
    }
    if (taken.length === 0) return [];
    discardPileRef.current = rest;
    setDiscardPile(rest);
    return taken;
  },
  loseHp: async (pid: number, amount: number) => {
    const p = getPlayer(pid);
    if (!p || p.isDead) return;
    const next = Math.max(0, p.hp - amount);
    updatePlayer(pid, { hp: next });
    addLog(`${p.hero.name} 失去 ${amount} 点体力`, 'warning');
    // 流失到 0 同样要进濒死：与受到伤害的差别只在「不派发伤害事件」，
    // 濒死求桃这一步是一样的。
    if (next <= 0) {
      await askForPeaches(pid);
    }
  },
  changeMaxHp: (pid: number, delta: number) => {
    const p = playersRef.current.find(x => x.id === pid);
    if (!p) return;
    const nextMax = Math.max(0, p.maxHp + delta);
    updatePlayer(pid, { maxHp: nextMax, hp: Math.min(nextMax, Math.max(0, p.hp)) });
  },
});
  // ── resolveCardEffect（App.tsx 原 L6301-7526）──
  const resolveCardEffect = async (source: Player, targets: Player[], card: Card) => {
  // 董白「黠慧」：他人获得的黑色牌在体力减少前不能使用
  if (xiaohuiLocked(source.id, card.id)) {
    addLog(`【黠慧】${source.hero.name} 不能使用获得的黑色牌【${card.name}】（体力未减少）`, 'warning');
    return;
  }
  if (fxFly && targets.length > 0) spawnCardFlight(card, source.id, targets[0].id);
  setIsProcessing(p => p + 1);
  // 孙鲁育「魅步」止息：统计本回合已使用的牌数（打出响应不经过此处，不受限制）
  if (zhixiRef.current?.id === source.id) zhixiRef.current.used += 1;
  try {
    // 技能注册表：目标确定后、任何效果结算之前的拦截（邀弈 / 劳燕 / 长姬）。
    //
    // 放在 try 的最前面，因为这是唯一「还能改变结算对象」的时机：
    // 之后的 afterCardUsed 在 finally 里、伤害已落地，那时改目标只会让日志
    // 与实际伤害不一致。改写后的列表覆盖外层 targets 变量，后续所有分支
    // （包括伤害与响应）都基于新目标。
    {
      const applied = await dispatchTargets({
        ...skillDeps(),
      }, { source, card, targets });
      if (applied.targets !== targets) {
        targets = applied.targets;
      }
    }
    // 通用「勇决」（存嗣授予）：同势力角色本回合使用的第一张牌为【杀】时，结算后获得之
    {
      const key = `${source.id}-${turnCountRef.current}`;
      if (!firstUsedCardRef.current.has(key)) {
        firstUsedCardRef.current.add(key);
        // 谢灵毓「元嫡」：其他角色于其出牌阶段使用第一张牌，若未指定除其以外的目标，
        // 谢灵毓可令双方各摸一张（AI 与托管自动选择此收益项）
        {
          const xl = playersRef.current.find(x => !x.isDead && x.hero.name === '谢灵毓' && skillsOn(x.id));
          if (xl && xl.id !== source.id) {
            const targetsOthers = targets.some(t => t.id !== source.id);
            if (yuanditriggers(targetsOthers, 1)) {
              drawCards(xl.id, 1);
              drawCards(source.id, 1);
              addLog(`【元嫡】${source.hero.name} 的首张牌未指定他人，谢灵毓与其各摸一张牌`, 'skill');
              showSkillBanner('谢灵毓', '元嫡');
              await delay(300);
            }
          }
        }

        // 王悦 / 王桃「护关」：出牌阶段使用的第一张牌为红色时，可声明一个花色
        // 令该花色本回合不计入其手牌上限（AI 与托管自动选当前手牌最多的花色）
        if ((source.hero.name === '王悦' || source.hero.name === '王桃') && skillsOn(source.id) && canHuguan(card)) {
          const counts: Record<string, number> = {};
          source.hand.forEach(c => { counts[c.suit] = (counts[c.suit] || 0) + 1; });
          const best = (Object.keys(counts) as Suit[]).sort((a, b) => counts[b] - counts[a])[0];
          if (best) {
            updatePlayer(source.id, { huguanSuit: best });
            addLog(`【护关】${source.hero.name} 声明花色 ${best}，本回合该花色不计入手牌上限`, 'skill');
            showSkillBanner(source.hero.name, '护关');
            await delay(300);
          }
        }
        // 张宁「天则」②：其他角色出牌阶段使用的第一张黑色手牌结算后，
        // 张宁可弃置一张黑色牌对其造成 1 点伤害
        {
          const zn = playersRef.current.find(x => !x.isDead && x.hero.name === '张宁' && skillsOn(x.id));
          if (zn && tianzeCanStrike(card, 1, source.id, zn)) {
            const blackCard = zn.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
            if (blackCard) {
              mutateHand(zn.id, h => h.filter(c => c.id !== blackCard.id));
              setDiscardPile(prev => {
                const next = [...prev, blackCard];
                discardPileRef.current = next;
                return next;
              });
              addLog(`【天则】张宁弃置黑色【${blackCard.name}】，对 ${source.hero.name} 造成 1 点伤害`, 'skill');
              showSkillBanner('张宁', '天则');
              await delay(400);
              await takeDamage(source.id, zn.id, 1, blackCard);
            }
          }
        }
        if (card.name === CardName.SHA) {
          const enabler = playersRef.current.find(p => hasGrantedSkill(p, '勇决')
            && p.hero.kingdom === source.hero.kingdom && p.id !== source.id);
          if (enabler) {
            mutateHand(source.id, h => (h.some(c => c.id === card.id) ? h : [...h, card]));
            addLog(`【勇决】${source.hero.name} 本回合使用的第一张牌为【杀】，结算后获得之（「勇决」持有者 ${enabler.hero.name}）`, 'skill');
            showSkillBanner(source.hero.name, '勇决');
          }
        }
      }
    }

    // 通用目标合法性钩子：被技能禁止的目标在结算入口统一剔除（含转化牌、额外目标）
    const vetoedTargets = targets.filter(t => getTargetLegalityVeto(source, t, card));
    if (vetoedTargets.length) {
      targets = targets.filter(t => !vetoedTargets.includes(t));
      addLog(`【${getTargetLegalityVeto(source, vetoedTargets[0], card) || '目标限制'}】${vetoedTargets.map(t => t.hero.name).join('、')} 不能成为 ${source.hero.name} 的【${card.name}】目标`, 'skill');
      if (!targets.length) return;
    }

    // 卞夫人「约俭」：其他角色对你使用的牌，等它置入弃牌堆时才展示手牌并判定（每回合限两次）
    // 此处只登记候选并询问是否发动；真正的获得在 playCard（置弃牌堆那一刻）里执行
    {
      const bf = playersRef.current.find(p => !p.isDead && p.hero.name === '卞夫人' && skillsOn(p.id));
      // 基本牌 / 锦囊使用后进入弃牌堆；装备牌进入装备区，不触发
      const willDiscard = card.type === CardType.BASIC || card.type === CardType.SCROLL;
      const inHand = source.hand.some(c => c.id === card.id); // 仅处理真实手牌（排除虚拟牌）
      if (bf && bf.id !== source.id && targets.some(t => t.id === bf.id)
          && yuejianCountRef.current < 2 && willDiscard && inHand) {
        if (bf.isHuman && !isAiTakeover) {
          const pick = await requestSkillChoice({
            skill: '约俭',
            owner: '卞夫人',
            title: `其他角色的【${card.name}】将置入弃牌堆，是否展示手牌发动「约俭」？`,
            mode: 'choose',
            choices: [{ id: 'yes', label: '发动约俭（展示手牌）' }],
            cancelLabel: '不发动',
          }, true);
          if (pick && pick.kind === 'choose' && pick.id === 'yes') {
            yuejianPendingRef.current.set(card.id, bf.id);
          } else {
            addLog('【约俭】卞夫人选择不发动', 'info');
          }
        } else {
          yuejianPendingRef.current.set(card.id, bf.id);
        }
      }
    }

    // 朱佩兰「辞虑」：成为普通锦囊牌的目标后，可摸（剩余选项数）张牌
    // 选项随发动次数递减：3 → 2 → 1 → 0，全部用尽后不再触发
    {
      const zp = playersRef.current.find(x => !x.isDead && x.hero.name === '朱佩兰' && skillsOn(x.id));
      if (zp && zp.id !== source.id && card.type === CardType.SCROLL && targets.some(t => t.id === zp.id)) {
        const remaining = 3 - (zp.cilvUsed ?? 0);
        if (remaining > 0) {
          drawCards(zp.id, cilvDrawCount(remaining));
          updatePlayer(zp.id, { cilvUsed: (zp.cilvUsed ?? 0) + 1 });
          addLog(`【辞虑】朱佩兰成为【${card.name}】的目标，摸 ${remaining} 张牌（剩余选项 ${remaining - 1}）`, 'skill');
          showSkillBanner('朱佩兰', '辞虑');
          await delay(300);
        }
      }
    }

    // 卑弥呼「蚕食」：觉醒后，单体基本牌/普通锦囊可额外指定带“傀”的敌人
    const canShiOffense = source.hero.name === '卑弥呼' && source.baiJiaAwakened
      && targets.length === 1 && targets[0].id !== source.id
      && (card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG);
    if (canShiOffense) {
      const extras = playersRef.current.filter(p => !p.isDead && p.hasKui && p.id !== source.id
        && p.id !== targets[0].id && !isAlly(source, p));
      if (extras.length) {
        targets = [...targets, ...extras];
        extras.forEach(p => updatePlayer(p.id, { hasKui: false }));
        addLog(`【蚕食】卑弥呼令 ${extras.map(p => p.hero.name).join('、')} 成为额外目标（失去“傀”）`, 'skill');
        showSkillBanner('卑弥呼', '蚕食');
      }
    }

    // 吴苋「福绵」：选项 2 令红色基本牌或红色普通锦囊额外指定敌方目标（每回合限一次）
    if (source.hero.name === '吴苋' && skillsOn(source.id) && source.fumianChoice === 2
        && !fumianTargetUsedRef.current
        && targets.length === 1 && targets[0].id !== source.id
        && (card.suit === Suit.HEART || card.suit === Suit.DIAMOND)
        && (card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG
            || card.name === CardName.SHUNSHOU || card.name === CardName.GUOHE || card.name === CardName.JIEDAO)) {
      const extraTargets = playersRef.current.filter(p => !p.isDead && p.id !== source.id
        && p.id !== targets[0].id && isEnemy(source, p));
      if (extraTargets.length) {
        const add = extraTargets.slice(0, Math.max(1, source.fumianValue2 ?? 1));
        targets = [...targets, ...add];
        fumianTargetUsedRef.current = true;
        addLog(`【福绵】吴苋令【${card.name}】额外指定 ${add.map(p => p.hero.name).join('、')} 为目标`, 'skill');
        showSkillBanner('吴苋', '福绵');
      }
    }

    // 孙鲁班「谮毁」：出牌阶段限一次，使用【杀】或黑色普通锦囊仅指定唯一目标时，
    // 令能成为此牌目标的另一名角色选择：①交给你一张牌，然后代替你成为此牌的使用者；②也成为此牌的目标
    if (source.hero.name === '孙鲁班' && skillsOn(source.id) && !cangHuiUsedRef.current
        && targets.length === 1 && targets[0].id !== source.id
        && (card.name === CardName.SHA
            || (card.type === CardType.SCROLL && (card.suit === Suit.SPADE || card.suit === Suit.CLUB)))) {
      const extra = playersRef.current.filter(p => !p.isDead && p.id !== source.id && p.id !== targets[0].id);
      if (extra.length) {
        const aiBest = [...extra].sort((a, b) => b.hand.length - a.hand.length)[0];
        // 第一步：孙鲁班（人类）指定拉入哪名角色；AI / 托管自动取手牌最多者；人类点「不发动」则放弃
        const pick = await requestSkillChoice({
          skill: '谮毁',
          owner: '孙鲁班',
          title: `【${card.name}】仅指定 ${targets[0].hero.name} 为目标，是否发动「谮毁」？`,
          hint: '被选中的角色会自行选择「交一张牌并代替你成为使用者」或「也成为此牌的目标」',
          mode: 'target',
          targets: extra.map(p => ({ id: p.id, name: p.hero.name, sub: `手牌 ${p.hand.length}` })),
          min: 0,
          max: 1,
          cancelLabel: '不发动',
        }, source.isHuman);
        const chosen = (!pick || pick.kind === 'timeout')
          ? aiBest
          : (pick.kind === 'target' && pick.ids.length ? (extra.find(p => p.id === pick.ids[0]) ?? null) : null);
        if (chosen) {
          cangHuiUsedRef.current = true;
          showSkillBanner('孙鲁班', '谮毁');
          // 第二步：由被指定的角色选择分支（人类弹窗；AI / 托管按近似收益自动）
          const canPay = chosen.hand.length > 0;
          let branch: 'substitute' | 'target' = 'target';
          if (canPay) {
            const pick2 = await requestSkillChoice({
              skill: '谮毁',
              owner: chosen.hero.name,
              title: `${source.hero.name} 发动「谮毁」，请选择：`,
              hint: `【${card.name}】的使用者仍是 ${source.hero.name}，还是由你代替？`,
              mode: 'choose',
              choices: [
                { id: 'substitute', label: '交一张牌，代替其成为使用者', desc: `交给 ${source.hero.name} 一张手牌，此牌改由你使用` },
                { id: 'target', label: '也成为此牌的目标', desc: `此牌仍由 ${source.hero.name} 使用，目标增加你` },
              ],
              cancelLabel: '也成为此牌的目标',
            }, chosen.isHuman && !isAiTakeoverRef.current);
            if (pick2 && pick2.kind === 'choose') branch = pick2.id === 'substitute' ? 'substitute' : 'target';
            else if (!pick2) branch = chosen.hand.length <= 1 ? 'substitute' : 'target';
          }
          if (branch === 'substitute' && canPay) {
            const cost = chosen.hand[Math.floor(Math.random() * chosen.hand.length)];
            mutateHand(chosen.id, h => h.filter(c => c.id !== cost.id));
            mutateHand(source.id, h => [...h, cost]);
            mutateHand(source.id, h => h.filter(c => c.id !== card.id));
            addLog(`【谮毁】${chosen.hero.name} 将【${cost.name}】交给 ${source.hero.name}，代替其成为【${card.name}】的使用者（孙鲁班退出此牌结算，伤害来源改为 ${chosen.hero.name}）`, 'skill');
            source = chosen;
          } else {
            targets = [...targets, chosen];
            addLog(`【谮毁】${chosen.hero.name} 选择成为【${card.name}】的目标（使用者仍为孙鲁班）`, 'skill');
          }
        } else {
          addLog('【谮毁】孙鲁班放弃发动', 'info');
        }
      }
    }

    // 王元姬「帷幕」：装备区全黑时，不能成为黑色锦囊牌的目标
    if (card.type === CardType.SCROLL && (card.suit === Suit.SPADE || card.suit === Suit.CLUB)) {
      const weimuTarget = targets.find(t => hasWeimu(t) && t.id !== source.id);
      if (weimuTarget) {
        const rest = targets.filter(t => t.id !== weimuTarget.id);
        if (rest.length === 0) {
          playCard(source.id, card);
          addLog(`【帷幕】${weimuTarget.hero.name} 不能成为黑色锦囊牌的目标，【${card.name}】对其无效`, 'skill');
          showSkillBanner(weimuTarget.hero.name, '帷幕');
          await delay(300);
          return;
        }
        targets = rest;
        addLog(`【帷幕】${weimuTarget.hero.name} 不能成为黑色锦囊牌的目标，已从【${card.name}】的目标中移除`, 'skill');
        showSkillBanner(weimuTarget.hero.name, '帷幕');
      }
    }

    // 蔡夫人「窃听」记录：本回合是否用牌指定过其他角色（含蚕食追加目标）
    if (source.id >= 0 && targets.some(t => t.id !== source.id)) {
      turnUsedOnOthersRef.current[source.id] = true;
    }

    // 卑弥呼「蚕食」防御：敌方以单体基本牌/普通锦囊指定卑弥呼时，可取消并移除其“傀”
    const harmful = card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG
      || card.name === CardName.SHUNSHOU || card.name === CardName.GUOHE
      || card.name === CardName.LESI || card.name === CardName.BINGLIANG;
    if (targets.length === 1 && targets[0].hero.name === '卑弥呼' && targets[0].baiJiaAwakened
        && source.id !== targets[0].id && source.hasKui && harmful && !isAlly(source, targets[0])) {
      updatePlayer(source.id, { hasKui: false });
      playCard(source.id, card);
      addLog(`【蚕食】卑弥呼取消 ${source.hero.name} 的【${card.name}】，其失去“傀”标记`, 'skill');
      showSkillBanner('卑弥呼', '蚕食');
      await delay(350);
      return;
    }

    // 曹婴「凌人」：出牌阶段限一次，使用【杀】或伤害类锦囊指定目标后，公开猜测其手牌类别，
    // 再亮出目标手牌核对（不读取真实手牌来“猜”）。猜中至少 1 项此伤害 +1；2 项摸两张牌；3 项获得「奸雄」「行殇」
    const lingrenCards: CardName[] = [CardName.SHA, CardName.JUEDOU, CardName.HUOGONG, CardName.NANMAN, CardName.WANJIAN];
    if (source.hero.name === '曹婴' && skillsOn(source.id) && !lingrenUsedRef.current
        && targets.length > 0 && lingrenCards.includes(card.name)) {
      const tgt = targets.find(t => t.id !== source.id && !t.isDead);
      if (tgt) {
        lingrenUsedRef.current = true;
        // 猜测阶段：玩家/托管由玩家选，AI 按公开信息（手牌数）推测，均不看手牌明细
        let guessIds: string[] = [];
        const guessChoices = [
          { id: '基本牌', label: '基本牌' },
          { id: '锦囊牌', label: '锦囊牌' },
          { id: '装备牌', label: '装备牌' },
        ];
        const pick = await requestSkillChoice({
          skill: '凌人',
          owner: source.hero.name,
          title: `猜测 ${tgt.hero.name} 的手牌类别（可多选）`,
          hint: '猜测后公开目标手牌并核对，猜错不会获得效果',
          mode: 'multi',
          choices: guessChoices,
          min: 1,
          max: 3,
          cancelLabel: '不猜测',
        });
        if (pick && pick.kind === 'multi') {
          guessIds = pick.ids;
        } else if (pick && pick.kind === 'cancel') {
          lingrenUsedRef.current = false; // 不猜测：本轮不发动，牌照常结算
          guessIds = [];
        } else {
          // AI / 托管：公开信息推断（手牌越厚越可能含装备）
          guessIds = ['基本牌', '锦囊牌'];
          if (tgt.hand.length >= 4) guessIds.push('装备牌');
        }
        if (guessIds.length > 0) {
        // 核对阶段：亮出目标手牌类别
        const actual: string[] = [];
        for (const c of tgt.hand) {
          const cat = c.type === CardType.BASIC ? '基本牌' : (c.type === CardType.SCROLL ? '锦囊牌' : (c.type === CardType.EQUIPMENT ? '装备牌' : ''));
          if (cat && !actual.includes(cat)) actual.push(cat);
        }
        const correct = guessIds.filter(g => actual.includes(g)).length;
        const wrong = guessIds.filter(g => !actual.includes(g));
        const missed = actual.filter(a => !guessIds.includes(a));
        addLog(`【凌人】曹婴猜测 ${tgt.hero.name} 的手牌：${guessIds.join('、')}`, 'skill');
        showSkillBanner('曹婴', '凌人');
        await delay(250);
        addLog(`【凌人】${tgt.hero.name} 亮出手牌：${actual.join('、') || '无'}`, 'chat');
        if (wrong.length) addLog(`【凌人】猜错：${wrong.join('、')}（其手中并无此类牌）`, 'warning');
        if (missed.length) addLog(`【凌人】漏猜：${missed.join('、')}`, 'info');
        addLog(`【凌人】猜中 ${correct} 项`, 'skill');
        lingrenBoostRef.current[card.id] = { targetId: tgt.id, bonus: correct > 0 ? 1 : 0 };
        await delay(350);
        if (correct >= 2) {
          drawCards(source.id, 2);
          addLog('【凌人】猜对至少两项，曹婴摸两张牌', 'skill');
        }
        if (correct >= 3) {
          updatePlayer(source.id, { hasJianxiong: true, hasXingshang: true });
          addLog('【凌人】猜中三项，曹婴获得「奸雄」「行殇」直到下回合开始', 'skill');
        }
        }
      }
    }

    // 鲍三娘「姝勇」：使用【杀】时，获得一名其他角色区域内的一张牌，然后其摸一张牌
    if (source.hero.name === '鲍三娘' && card.name === CardName.SHA && skillsOn(source.id)) {
      await triggerShuyong(source.id, targets.find(t => t.id !== source.id)?.id);
    }

    // 鲍三娘「镇南」：非【杀】的多目标牌在此结算；多目标【杀】在 slashTargets 确定后结算
    if (targets.length > 1 && card.name !== CardName.SHA) {
      await triggerZhennan(source, targets, card);
    }

    // Log construction
    const targetNames = targets.map(t => t.hero.name).join('、');
    if (targets.length === 1 && targets[0].id === source.id) {
        addLog(`${source.hero.name} 对自己使用了【${card.name}】`, 'info');
    } else if (targets.length > 0) {
        addLog(`${source.hero.name} 对 ${targetNames} 使用了【${card.name}】`, 'chat');
    } else {
        addLog(`${source.hero.name} 使用了【${card.name}】`, 'chat');
    }

    // 黄月英「集智」已迁移到 src/game/skills/migrated1.ts（afterCardUsed）

    // SHA（基本牌，不可被无懈可击响应）
    if (card.name === CardName.SHA) {
      playCard(source.id, card);
      slashUsageRef.current[source.id] = (slashUsageRef.current[source.id] ?? 0) + 1;

      // 朱雀羽扇：你可以将一张普通【杀】当火【杀】使用。
      // 人类：本回合首张普通【杀】弹窗询问，选择记住本回合；AI：目标有藤甲才转火。
      let slashCard = card;
      if (source.equipment?.weapon?.name === CardName.ZHUQUE && !card.attribute) {
        let pref = zhuquePrefRef.current[source.id];
        if (!pref) {
          // AI：只有目标穿【藤甲】（火杀击穿免疫且火伤+1）、且目标不是免疫火焰伤害的孙茹时才转火
          const hasTengjia = targets.some(t => getPlayer(t.id)?.equipment?.armor?.name === CardName.TENGJIA);
          const fireWasted = targets.every(t => {
            const p = getPlayer(t.id);
            return p && p.hero.name === '孙茹' && skillsOn(p.id);
          });
          let chosen: 'fire' | 'normal' = hasTengjia && !fireWasted ? 'fire' : 'normal';
          if (source.isHuman && !isAiTakeover) {
            const r = await requestSkillChoice({
              skill: '朱雀羽扇',
              owner: source.hero.name,
              title: '是否将这张普通【杀】以火【杀】使用？',
              hint: '火【杀】可击穿【藤甲】的锁定技并使火焰伤害+1；选择会被记住本回合，后续普通【杀】不再询问',
              mode: 'choose',
              choices: [
                { id: 'fire', label: '以火【杀】使用' },
                { id: 'normal', label: '以普通【杀】使用' },
              ],
              cancelLabel: '以普通【杀】使用',
            });
            chosen = r && r.kind === 'choose' && r.id === 'fire' ? 'fire' : 'normal';
          }
          pref = chosen;
          zhuquePrefRef.current[source.id] = chosen;
          addLog(`【朱雀羽扇】${source.hero.name} 本回合偏好：${chosen === 'fire' ? '火【杀】' : '普通【杀】'}（后续普通【杀】按此偏好自动处理）`, 'skill');
        }
        if (pref === 'fire') {
          slashCard = { ...card, attribute: 'fire' as const };
          addLog(`【朱雀羽扇】${source.hero.name} 将普通【杀】转化为火【杀】使用`, 'skill');
          showSkillBanner(source.hero.name, '朱雀羽扇');
          await delay(300);
        }
      }

      // 方天画戟：打出最后一张手牌【杀】时，可额外指定最多 2 名范围内的角色
      let slashTargets = targets;
      const isFangtian = source.equipment?.weapon?.name === CardName.FANGTIAN;
      if (isFangtian && source.hand.length === 1 && source.hand[0].id === card.id) {
        const extras = playersRef.current
          .filter(p => !p.isDead && p.id !== source.id && p.id !== targets[0].id && canReach(source, p))
          .slice(0, 2);
        if (extras.length > 0) {
          slashTargets = [targets[0], ...extras];
          addLog(`【方天画戟】发动！【杀】额外指向 ${extras.map(p => p.hero.name).join('、')}`, 'skill');
          showSkillBanner(source.hero.name, '方天画戟');
        }
      }

      // 鲍三娘「镇南」：多目标【杀】的目标数在方天画戟/福绵追加后确定
      await triggerZhennan(source, slashTargets, card);

      // 马云禄「凤魄」：回合内第一张【杀】仅指定唯一目标后，
      // 可令自己摸 X 张牌或此【杀】伤害 +X（X 为目标方块手牌数）。
      if (source.hero.name === '马云禄' && !fengpoUsedRef.current && slashTargets.length === 1) {
        fengpoUsedRef.current = true;
        const t0 = getPlayer(slashTargets[0].id);
        const x = t0 ? t0.hand.filter(c => c.suit === Suit.DIAMOND).length : 0;
        if (t0 && x > 0) {
          if (t0.hp <= x + 1) {
            fengpoBoostRef.current[card.id] = x;
            addLog(`${source.hero.name} 发动「凤魄」，${t0.hero.name} 有 ${x} 张方块手牌，此【杀】伤害 +${x}`, 'skill');
          } else {
            drawCards(source.id, x);
            addLog(`${source.hero.name} 发动「凤魄」，${t0.hero.name} 有 ${x} 张方块手牌，${source.hero.name} 摸 ${x} 张牌`, 'skill');
          }
          showSkillBanner(source.hero.name, '凤魄');
          await delay(400);
        }
      }

      for (const target of slashTargets) {
        if (target.isDead) continue;

        // 大乔「流离」：弃置一张手牌，将【杀】转移给她攻击范围内的另一名角色
        let effectiveTarget = target;
        if (target.hero.name === '大乔' && target.hand.length > 0) {
          const candidates = playersRef.current.filter(p =>
            !p.isDead && p.id !== source.id && p.id !== target.id && canReach(target, p)
          );
          if (candidates.length > 0) {
            const cost = target.hand[Math.floor(Math.random() * target.hand.length)];
            discardCards(target.id, [cost]);
            effectiveTarget = candidates[Math.floor(Math.random() * candidates.length)];
            addLog(`${target.hero.name} 发动「流离」，弃置【${cost.name}】将【杀】转移给 ${effectiveTarget.hero.name}`, 'skill');
            showSkillBanner(target.hero.name, '流离');
            await delay(500);
          }
        }

        // 曹节「守玺」：成为【杀】的目标后，声明一种未以此法声明过的基本牌或锦囊牌牌名，
        // 除非使用者弃置一张该牌名的牌并获得曹节一张牌，否则此【杀】无效。
        if (effectiveTarget.hero.name === '曹节' && source.id !== effectiveTarget.id) {
          const declarable = ([
            CardName.SHA, CardName.SHAN, CardName.TAO, CardName.JIU,
            CardName.WUXIE, CardName.GUOHE, CardName.SHUNSHOU, CardName.JUEDOU,
            CardName.NANMAN, CardName.WANJIAN, CardName.WUZHONG,
          ] as CardName[]).filter(n => !shouxiDeclaredRef.current.has(n));
          let declared: CardName | null = null;
          if (declarable.length > 0) {
            if (effectiveTarget.isHuman && !isAiTakeover) {
              const r = await requestSkillChoice({
                skill: '守玺',
                owner: '曹节',
                title: '选择要声明的牌名（每种牌名本局限一次）',
                hint: '若使用者弃置一张该牌名的牌并获得你一张牌，此【杀】继续；否则此【杀】对你无效',
                mode: 'choose',
                choices: declarable.map(n => ({ id: n, label: `【${n}】` })),
                cancelLabel: '放弃守玺',
              });
              if (r && r.kind === 'choose') declared = r.id as CardName;
            } else {
              // AI：优先声明对手最可能拿不出、且价值高的牌名
              const prio: CardName[] = [CardName.TAO, CardName.WUXIE, CardName.WANJIAN, CardName.SHAN, CardName.SHA];
              declared = prio.find(n => declarable.includes(n)) ?? declarable[0];
            }
          }
          if (declared && !shouxiDeclaredRef.current.has(declared)) {
            shouxiDeclaredRef.current.add(declared);
            const payer = getPlayer(source.id);
            const payCard = payer?.hand.find(c => c.name === declared);
            const gainable = effectiveTarget.hand.length > 0;
            // 官方无「手牌数」门槛：只要能弃置声明的牌且曹节有牌可被获得，即可支付
            const pay = !!payCard && gainable;
            if (pay && payCard && payer) {
              discardCards(payer.id, [payCard]);
              const gained = effectiveTarget.hand[Math.floor(Math.random() * effectiveTarget.hand.length)];
              mutateHand(effectiveTarget.id, h => h.filter(c => c.id !== gained.id));
              mutateHand(payer.id, h => [...h, gained]);
              addLog(`${effectiveTarget.hero.name} 发动「守玺」声明【${declared}】，${payer.hero.name} 弃置【${payCard.name}】并获得一张牌，此【杀】继续`, 'skill');
              showSkillBanner(effectiveTarget.hero.name, '守玺');
              await delay(450);
            } else {
              addLog(`${effectiveTarget.hero.name} 发动「守玺」声明【${declared}】，${source.hero.name} 未支付（手牌中无【${declared}】或无可获得之牌），此【杀】无效`, 'skill');
              showSkillBanner(effectiveTarget.hero.name, '守玺');
              await delay(450);
              continue;
            }
          }
        }

        // 伏皇后「求援」（原版）：成为【杀】的目标时，可令另一名其他角色交给你一张【闪】，
        // 否则该角色也成为此【杀】的目标。AI 会优先挑「敌对且没有闪」的人：要么交闪，要么替她挨刀。
        if (effectiveTarget.hero.name === '伏皇后' && source.id !== effectiveTarget.id) {
          const candidates = playersRef.current.filter(p =>
            !p.isDead && p.id !== source.id && p.id !== effectiveTarget.id
            && !slashTargets.some(t => t.id === p.id)
          );
          if (candidates.length > 0) {
            const helper = candidates.slice().sort((a, b) => {
              const enemyDiff = (isAlly(effectiveTarget, a) ? 1 : 0) - (isAlly(effectiveTarget, b) ? 1 : 0);
              if (enemyDiff !== 0) return enemyDiff;
              const shanDiff = (a.hand.some(c => c.name === CardName.SHAN) ? 1 : 0)
                - (b.hand.some(c => c.name === CardName.SHAN) ? 1 : 0);
              if (shanDiff !== 0) return shanDiff;
              return a.hand.length - b.hand.length;
            })[0];
            const shan = helper.hand.find(c => c.name === CardName.SHAN);
            const willing = !!shan && (isAlly(effectiveTarget, helper) || helper.hp >= 2);
            addLog(`${effectiveTarget.hero.name} 发动「求援」，指定 ${helper.hero.name}`, 'skill');
            showSkillBanner(effectiveTarget.hero.name, '求援');
            await delay(450);
            if (willing && shan) {
              mutateHand(helper.id, h => h.filter(c => c.id !== shan.id));
              mutateHand(effectiveTarget.id, h => [...h, shan]);
              addLog(`${helper.hero.name} 交出【闪】响应「求援」，不再成为此【杀】的目标`, 'skill');
            } else {
              slashTargets.push(helper);
              addLog(`${helper.hero.name} 未交出【闪】，也成为此【杀】的目标`, 'skill');
            }
            await delay(450);
          }
        }

        // 孙寒华「莲华」：成为其他角色【杀】的目标时按等级结算（摸牌 / 黑桃取消 / 弃牌否则取消）
        if (effectiveTarget.hero.name === '孙寒华' && source.id !== effectiveTarget.id && skillsOn(effectiveTarget.id)) {
          const lv = effectiveTarget.lianHuaLevel ?? 1;
          drawCards(effectiveTarget.id, 1);
          addLog(`孙寒华成为 ${source.hero.name} 的【杀】目标，发动「莲华」（${lv} 级）摸一张牌`, 'skill');
          showSkillBanner('孙寒华', '莲华');
          await delay(350);
          if (lv >= 2) {
            const jc = await performJudgment(effectiveTarget.id, '莲华');
            if (jc && jc.suit === Suit.SPADE) {
              addLog('【莲华】判定为黑桃，此【杀】被取消', 'skill');
              await delay(400);
              continue;
            }
          }
          if (lv >= 3) {
            const sp = getPlayer(source.id);
            const willing = !!sp && sp.hand.length > 0
              && (effectiveTarget.hp <= 2 || sp.hand.length >= 2);
            if (willing && sp) {
              const cost = [...sp.hand].sort((a, b) => a.value - b.value)[0];
              discardCards(sp.id, [cost]);
              addLog(`【莲华】${sp.hero.name} 弃置【${cost.name}】，此【杀】继续`, 'skill');
              await delay(350);
            } else {
              addLog(`【莲华】${source.hero.name} 未弃置牌，此【杀】被取消`, 'skill');
              await delay(350);
              continue;
            }
          }
        }

        // 王异「贞烈」：失去1点体力，弃伤害来源一张手牌，令此【杀】无效
        if (await tryZhenlie(effectiveTarget, source, card)) {
          continue;
        }

        // 空城：没有手牌的诸葛亮不能成为【杀】的目标
        const slashProtection = getTargetProtection(effectiveTarget, CardName.SHA);
        if (slashProtection) {
          addLog(`${effectiveTarget.hero.name} 发动「${slashProtection}」，【杀】无效`, 'skill');
          await delay(400);
          continue;
        }

        // 防具判定：仁王盾免疫黑色【杀】；青釭剑无视防具
        const armor = effectiveTarget.equipment?.armor?.name;
        const ignoreArmor = source.equipment?.weapon?.name === CardName.QINGGANG;
        const isBlackSlash = card.suit === Suit.SPADE || card.suit === Suit.CLUB;
        if (!ignoreArmor && armor === CardName.RENWANG && isBlackSlash) {
          addLog(`${effectiveTarget.hero.name} 的【仁王盾】挡住了黑色【杀】，伤害无效`, 'success');
          await delay(500);
          continue;
        }
        // 藤甲：普通【杀】无效（火杀/雷杀不受影响）
        if (!ignoreArmor && armor === CardName.TENGJIA && !slashCard.attribute) {
          addLog(`${effectiveTarget.hero.name} 的【藤甲】挡住了普通【杀】，伤害无效`, 'success');
          await delay(500);
          continue;
        }

        // 雌雄双股剑：指定异性目标后，令其弃一张手牌，或令你摸一张牌
        if (source.equipment?.weapon?.name === CardName.CIXIONG
            && source.hero.gender !== effectiveTarget.hero.gender) {
          const t = getPlayer(effectiveTarget.id);
          if (t && t.hand.length > 0) {
            const cost = t.hand[Math.floor(Math.random() * t.hand.length)];
            discardCards(t.id, [cost]);
            addLog(`【雌雄双股剑】发动，${t.hero.name} 弃置了【${cost.name}】`, 'skill');
          } else {
            drawCards(source.id, 1);
            addLog(`【雌雄双股剑】发动，${source.hero.name} 摸一张牌`, 'skill');
          }
          await delay(400);
        }

        // 马超「铁骑」：判定为红色则目标不能使用【闪】
        if (source.hero.name === '马超') {
          const jc = await performJudgment(source.id, '铁骑');
          if (jc && (jc.suit === Suit.HEART || jc.suit === Suit.DIAMOND)) {
            addLog(`${source.hero.name} 发动「铁骑」，判定为红色，${effectiveTarget.hero.name} 无法闪避！`, 'skill');
            showSkillBanner(source.hero.name, '铁骑');
            await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
            continue;
          }
          addLog(`「铁骑」判定为黑色，${effectiveTarget.hero.name} 仍可出【闪】`, 'info');
        }

        // 黄忠「烈弓」：目标手牌不少于自己体力时，此【杀】不可被闪避
        const isLieGong = source.hero.name === '黄忠' && effectiveTarget.hand.length >= source.hp;
        if (isLieGong) {
          addLog(`${source.hero.name} 发动「烈弓」，${effectiveTarget.hero.name} 无法闪避！`, 'skill');
          showSkillBanner(source.hero.name, '烈弓');
          await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
          continue;
        }

        const hpBefore = getPlayer(effectiveTarget.id)?.hp ?? 0;
        const handLenBefore = getPlayer(effectiveTarget.id)?.hand.length ?? 0;
        // 用转换后的牌结算（火【杀】造成火焰伤害）
        await triggerReaction(effectiveTarget.id, source.id, CardName.SHAN, slashCard);
        // 等本次响应（打出【闪】）的手牌移除落到 playersRef，避免读到出闪前的旧手牌
        for (let k = 0; k < 10; k++) {
          if ((getPlayer(effectiveTarget.id)?.hand.length ?? 0) < handLenBefore) break;
          await delay(50);
        }
        let hpAfter = getPlayer(effectiveTarget.id)?.hp ?? 0;

        // 【刺杀】：被【闪】抵消后，目标须弃置一张手牌，否则此【刺杀】依然造成伤害
        if (slashCard.cisha && hpAfter === hpBefore && !getPlayer(effectiveTarget.id)?.isDead) {
          const t = getPlayer(effectiveTarget.id);
          if (t && t.hand.length > 0) {
            let payCard: Card | undefined;
            if (t.isHuman && !isAiTakeover) {
              const pr = await requestSkillChoice({
                skill: '刺杀',
                owner: t.hero.name,
                title: '「刺杀」：使用【闪】后须弃置一张手牌，否则仍受到伤害',
                mode: 'card',
                cards: t.hand,
                min: 1,
                max: 1,
                cancelLabel: '不弃牌（承受伤害）',
              }, true);
              if (pr && pr.kind === 'card' && pr.ids.length === 1) {
                payCard = t.hand.find(c => c.id === pr.ids[0]);
              }
            } else {
              payCard = [...t.hand].sort((a, b) => a.value - b.value)[0];
            }
            if (payCard) {
              discardCards(t.id, [payCard]);
              addLog(`【刺杀】${t.hero.name} 使用【闪】后弃置【${payCard.name}】，抵消此【刺杀】`, 'skill');
            } else {
              addLog(`【刺杀】${t.hero.name} 未弃置手牌，此【刺杀】依然造成伤害`, 'warning');
              await takeDamage(t.id, source.id, 1, slashCard);
            }
          } else if (t) {
            addLog(`【刺杀】${t.hero.name} 已无手牌可弃，此【刺杀】依然造成伤害`, 'warning');
            await takeDamage(t.id, source.id, 1, slashCard);
          }
          hpAfter = getPlayer(effectiveTarget.id)?.hp ?? hpAfter;
        }

        // 贯石斧：被【闪】抵消时，可弃两张牌令此【杀】依然造成伤害
        const isGuanshi = source.equipment?.weapon?.name === CardName.GUANSHI;
        if (isGuanshi && hpAfter === hpBefore && !getPlayer(effectiveTarget.id)?.isDead
            && source.hand.length >= 2 && (effectiveTarget.hp <= 1 || source.hand.length >= 4)) {
          const cost = source.hand.slice(0, 2);
          discardCards(source.id, cost);
          addLog(`【贯石斧】发动！${source.hero.name} 弃置两张牌，令此【杀】依然造成伤害`, 'skill');
          showSkillBanner(source.hero.name, '贯石斧');
          await delay(400);
          const t = getPlayer(effectiveTarget.id);
          if (t && !t.isDead) await takeDamage(t.id, source.id, 1, slashCard);
          await delay(300);
          continue;
        }

        // 青龙偃月刀：若【杀】被闪避且手中还有【杀】，追加一击
        const isQinglong = source.equipment?.weapon?.name === CardName.QINGLONG;
        if (isQinglong && hpAfter === hpBefore && !getPlayer(effectiveTarget.id)?.isDead) {
          const extraSha = playersRef.current.find(p => p.id === source.id)?.hand.find(c => c.name === CardName.SHA);
          if (extraSha) {
            addLog(`【青龙偃月刀】发动，追加一击！`, 'skill');
            showSkillBanner(source.hero.name, '青龙偃月刀');
            await delay(500);
            await resolveCardEffect(source, [effectiveTarget], extraSha);
            continue;
          }
        }
        await delay(300);
      }
    }
    // JUEDOU
    else if (card.name === CardName.JUEDOU) {
       const target = targets[0];
       if (await tryZhenlie(target, source, card)) {
         playCard(source.id, card);
         return;
       }
       const protect = getTargetProtection(target, CardName.JUEDOU);
       if (protect) {
         addLog(`${target.hero.name} 发动「${protect}」，【决斗】无效`, 'skill');
         return;
       }
       // 马云禄「凤魄」：回合内第一张【杀】或【决斗】仅指定唯一目标后，
       // 可令自己摸 X 张牌或此牌伤害 +X（X 为目标方块手牌数）
       if (source.hero.name === '马云禄' && !fengpoUsedRef.current) {
         fengpoUsedRef.current = true;
         const x = target.hand.filter(c => c.suit === Suit.DIAMOND).length;
         if (x > 0) {
           if (target.hp <= x + 1) {
             fengpoBoostRef.current[card.id] = x;
             addLog(`${source.hero.name} 发动「凤魄」，${target.hero.name} 有 ${x} 张方块手牌，此【决斗】伤害 +${x}`, 'skill');
           } else {
             drawCards(source.id, x);
             addLog(`${source.hero.name} 发动「凤魄」，${target.hero.name} 有 ${x} 张方块手牌，${source.hero.name} 摸 ${x} 张牌`, 'skill');
           }
           showSkillBanner(source.hero.name, '凤魄');
           await delay(400);
         }
       }
      playCard(source.id, card);
       addLog(`${source.hero.name} 找 ${target.hero.name} 决斗！`, 'danger');
       // 无懈可击询问链（全座次 + 可被反无懈）
       const isWuxieUsed = await resolveWuxieChain(source.id, card);
       if (!isWuxieUsed) {
         // 如果没有使用无懈可击，再询问是否使用杀
         await triggerReaction(target.id, source.id, CardName.SHA, card);
       }
    }
    // NANMAN
    else if (card.name === CardName.NANMAN) {
      playCard(source.id, card);
      addLog('南蛮入侵！全场需打出【杀】', 'danger');
      const nanmanHpBefore = new Map(targets.map(t => [t.id, t.hp] as [number, number]));
      for (const t of targets) {
        // 花鬘「象阵」：南蛮入侵对其无效
        if (t.hero.name === '花鬘' && skillsOn(t.id)) {
          addLog(`${t.hero.name} 发动「象阵」，「南蛮入侵」对其无效`, 'skill');
          showSkillBanner('花鬘', '象阵');
          await delay(400);
          continue;
        }
        // 祝融「巨象」：南蛮入侵对其无效，并摸一张牌
        if (t.hero.name === '祝融') {
          addLog(`${t.hero.name} 发动「巨象」，「南蛮入侵」对其无效`, 'skill');
          showSkillBanner(t.hero.name, '巨象');
          drawCards(t.id, 1);
          await delay(400);
          continue;
        }
        // 藤甲：南蛮入侵对其无效
        if (t.equipment?.armor?.name === CardName.TENGJIA) {
          addLog(`${t.hero.name} 的【藤甲】使【南蛮入侵】无效`, 'success');
          await delay(400);
          continue;
        }
        if (await tryZhenlie(t, source, card)) continue;
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (!isWuxieUsed) {
          // 如果没有使用无懈可击，再询问是否使用杀
          await triggerReaction(t.id, source.id, CardName.SHA, card);
        }
        await delay(500);
      }
      // 花鬘「象阵」：结算结束后若此牌造成过伤害，花鬘与伤害来源各摸一张牌
      const xiangzhenOwner = playersRef.current.find(p => !p.isDead && p.hero.name === '花鬘' && skillsOn(p.id));
      if (xiangzhenOwner) {
        const hurt = targets.some(t => {
          const now = getPlayer(t.id);
          return !!now && now.hp < (nanmanHpBefore.get(t.id) ?? now.hp);
        });
        if (hurt) {
          drawCards(xiangzhenOwner.id, 1);
          if (xiangzhenOwner.id !== source.id) drawCards(source.id, 1);
          addLog(`【象阵】南蛮入侵造成过伤害，${xiangzhenOwner.hero.name}${xiangzhenOwner.id !== source.id ? ` 与 ${source.hero.name}` : ''}各摸一张牌`, 'skill');
          showSkillBanner('花鬘', '象阵');
        }
      }
    }
    // TAO
    else if (card.name === CardName.TAO) {
      const target = targets[0];
      // 检查目标体力是否已满
      if (target.hp >= target.maxHp) {
        // 体力已满，不消耗桃，显示提示
        addLog(`${target.hero.name} 体力已满，无需吃桃`, 'warning');
        // 不消耗桃，直接返回
        return;
      }
      // 体力未满，正常使用桃
      playCard(source.id, card);
      // 孙权「救援」：其他吴势力角色对主公使用【桃】时额外回复1点
      let healPoints = 1;
      if (target.hero.name === '孙权' && target.identity === Identity.ZHUGONG
          && source.id !== target.id && source.hero.kingdom === '吴') {
        healPoints = 2;
        addLog(`${target.hero.name} 的「救援」发动，额外回复1点体力`, 'skill');
        showSkillBanner(target.hero.name, '救援');
      }
      // 更新目标体力，确保体力正确
      const newHp = Math.min(target.hp + healPoints, target.maxHp);
      const healAmount = newHp - target.hp;

      // 触发治疗动画
      setHealAnimTarget(target.id);
      setHealNumber({ targetId: target.id, amount: healAmount, id: Date.now().toString() });
      setTimeout(() => setHealAnimTarget(null), 600);
      setTimeout(() => setHealNumber(null), 1000);

      recoverHp(target.id, healPoints);
      // 身份推理：给主公回血者视为忠臣
      if (target.identity === Identity.ZHUGONG && source.id !== target.id) {
        identityGuessRef.current[source.id] = Identity.ZHONGCHEN;
      }
      // 显示谁使用桃救援了谁，以及救援后的体力
      if (source.id === target.id) {
        addLog(`${source.hero.name} 使用了【桃】自救，当前体力: ${newHp}/${target.maxHp}`, 'success');
      } else {
        addLog(`${source.hero.name} 使用了【桃】救援 ${target.hero.name}，${target.hero.name} 当前体力: ${newHp}/${target.maxHp}`, 'success');
      }
    }
    // WUZHONG
    else if (card.name === CardName.WUZHONG) {
      playCard(source.id, card);
      drawCards(source.id, 2);
      addLog(`${source.hero.name} 摸了两张牌`, 'success');
    }
    // 万箭齐发
    else if (card.name === CardName.WANJIAN) {
      playCard(source.id, card);
      addLog('万箭齐发！全场需打出【闪】', 'danger');
      for (const t of targets) {
        // 藤甲：万箭齐发对其无效
        if (t.equipment?.armor?.name === CardName.TENGJIA) {
          addLog(`${t.hero.name} 的【藤甲】使【万箭齐发】无效`, 'success');
          await delay(400);
          continue;
        }
        if (await tryZhenlie(t, source, card)) continue;
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (!isWuxieUsed) {
          // 如果没有使用无懈可击，再询问是否使用闪
          await triggerReaction(t.id, source.id, CardName.SHAN, card);
        }
        await delay(500);
      }
    }
    // 顺手牵羊
    else if (card.name === CardName.SHUNSHOU) {
      const target = targets[0];
      const protect = getTargetProtection(target, CardName.SHUNSHOU);
      if (protect) {
        addLog(`${target.hero.name} 发动「${protect}」，不能被【顺手牵羊】指定`, 'skill');
        return;
      }
      if (await tryZhenlie(target, source, card)) {
        playCard(source.id, card);
        return;
      }
      const targetHasEquip = !!(target.equipment?.weapon || target.equipment?.armor || target.equipment?.horsePlus || target.equipment?.horseMinus);
      if (target.hand.length > 0 || targetHasEquip) {
        playCard(source.id, card);
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (!isWuxieUsed) {
          // 优先偷装备（有则 40% 概率），否则偷手牌
          const equipCards = [target.equipment?.weapon, target.equipment?.armor, target.equipment?.horsePlus, target.equipment?.horseMinus].filter(Boolean) as Card[];
          const stealEquip = equipCards.length > 0 && (target.hand.length === 0 || Math.random() < 0.4);

          if (stealEquip) {
            const stolenEquip = equipCards[Math.floor(Math.random() * equipCards.length)];
            updatePlayerWith(target.id, p => {
              const nextEquip = { ...(p.equipment ?? {}) };
              (Object.keys(nextEquip) as Array<keyof typeof nextEquip>).forEach(k => {
                if (nextEquip[k]?.id === stolenEquip.id) delete nextEquip[k];
              });
              return { equipment: nextEquip };
            });
            mutateHand(source.id, hand => [...hand, stolenEquip]);
            lockXiaohuiCards(target.id, source.id, [stolenEquip]);
            onEquipLost(target.id, stolenEquip.name);
            triggerXiaoji(target.id, stolenEquip);
            addLog(`${source.hero.name} 顺手牵走了 ${target.hero.name} 的装备【${stolenEquip.name}】`, 'chat');
            triggerWanwei(target.id, [stolenEquip.name]);
          } else if (target.hand.length > 0) {
            const randomIndex = Math.floor(Math.random() * target.hand.length);
            const stolenCard = target.hand[randomIndex];

            // 从目标手牌中移除、加入自己手牌（基于最新 state，避免旧闭包导致卡牌复活）
            mutateHand(target.id, hand => hand.filter(c => c.id !== stolenCard.id));
            mutateHand(source.id, hand => [...hand, stolenCard]);
            lockXiaohuiCards(target.id, source.id, [stolenCard]);

            addLog(`${source.hero.name} 从 ${target.hero.name} 那里偷到了【${stolenCard.name}】`, 'chat');
            triggerWanwei(target.id, [stolenCard.name]);
          } else {
            addLog(`${target.hero.name} 没有牌可偷`, 'info');
          }
        } else {
          addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
        }
      } else {
        addLog(`${target.hero.name} 没有手牌可偷，【${card.name}】不消耗！`, 'warning');
      }
    }
    // 乐不思蜀
    else if (card.name === CardName.LESI) {
      const target = targets[0];
      const protect = getTargetProtection(target, CardName.LESI);
      if (protect) {
        addLog(`${target.hero.name} 发动「${protect}」，不能被【乐不思蜀】指定`, 'skill');
        return;
      }
      playCard(source.id, card);
      addLog(`${source.hero.name} 对 ${target.hero.name} 使用了乐不思蜀`, 'info');
      // 无懈可击询问链（全座次 + 可被反无懈）
      const isWuxieUsed = await resolveWuxieChain(source.id, card);
      if (isWuxieUsed) {
        addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
        return;
      }
      // 放入判定区：判定阶段按进入先后逐张结算
      addDelayedTrick(target.id, card);
      addLog(`${target.hero.name} 中了【乐不思蜀】，判定区第 ${(getPlayer(target.id)?.judgeZone?.length ?? 1)} 张，下回合判定非红桃将跳过出牌阶段`, 'warning');
    }
    // 过河拆桥
    else if (card.name === CardName.GUOHE) {
      const target = targets[0];
      if (await tryZhenlie(target, source, card)) {
        playCard(source.id, card);
        return;
      }
      const equipCards = [target.equipment?.weapon, target.equipment?.armor, target.equipment?.horsePlus, target.equipment?.horseMinus].filter(Boolean) as Card[];
      if (target.hand.length > 0 || equipCards.length > 0) {
        playCard(source.id, card);
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (!isWuxieUsed) {
          // 有装备且（无手牌 或 35% 概率）则拆装备
          const shouldEquip = equipCards.length > 0 && (target.hand.length === 0 || Math.random() < 0.35);
          if (shouldEquip) {
            const brokenEquip = equipCards[Math.floor(Math.random() * equipCards.length)];
            updatePlayerWith(target.id, p => {
              const nextEquip = { ...(p.equipment ?? {}) };
              (Object.keys(nextEquip) as Array<keyof typeof nextEquip>).forEach(k => {
                if (nextEquip[k]?.id === brokenEquip.id) delete nextEquip[k];
              });
              return { equipment: nextEquip };
            });
            setDiscardPile(prev => {
              const newPile = [...prev, brokenEquip];
              discardPileRef.current = newPile;
              return newPile;
            });
            onEquipLost(target.id, brokenEquip.name);
            triggerXiaoji(target.id, brokenEquip);
            addLog(`${source.hero.name} 拆掉了 ${target.hero.name} 的装备【${brokenEquip.name}】`, 'chat');
            triggerWanwei(target.id, [brokenEquip.name]);
          } else {
            // 从目标手牌中弃置（基于最新 state），进入弃牌堆
            const randomIndex = Math.floor(Math.random() * target.hand.length);
            const brokenCard = target.hand[randomIndex];

            mutateHand(target.id, hand => hand.filter(c => c.id !== brokenCard.id));
            setDiscardPile(prev => {
              const newPile = [...prev, brokenCard];
              discardPileRef.current = newPile;
              return newPile;
            });

            addLog(`${source.hero.name} 弃置了 ${target.hero.name} 的【${brokenCard.name}】`, 'chat');
            triggerWanwei(target.id, [brokenCard.name]);
          }
        } else {
          addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
        }
      } else {
        addLog(`${target.hero.name} 没有牌可弃置，【${card.name}】不消耗！`, 'warning');
      }
    }
    // 无懈可击（只能在自己或队友成为锦囊牌目标时响应使用，主动使用无效且不消耗）
    else if (card.name === CardName.WUXIE) {
      addLog('【无懈可击】只能在你或队友被锦囊牌指定时打出响应，已取消使用', 'warning');
    }
    // 火攻
    else if (card.name === CardName.HUOGONG) {
      const target = targets[0];
      if (await tryZhenlie(target, source, card)) {
        playCard(source.id, card);
        return;
      }
      // 先将火攻放入弃牌堆
      playCard(source.id, card);
      if (target.hand.length === 0) {
        addLog(`${target.hero.name} 没有手牌，【火攻】无效！`, 'warning');
        return;
      }
      // 无懈可击询问链（全座次 + 可被反无懈）
      const isWuxieUsed = await resolveWuxieChain(source.id, card);
      if (isWuxieUsed) {
        addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
        return;
      }
      // 目标展示一张手牌
      const shownCard = target.hand[Math.floor(Math.random() * target.hand.length)];
      addLog(`${target.hero.name} 展示了手牌【${shownCard.name}】(${shownCard.suit})`, 'info');
      // 检查源玩家是否有同花色手牌（必须读当前手牌：source 是出牌前快照，已包含刚打出的【火攻】）
      // 且排除刚打出的这张【火攻】本身：它已在弃牌堆，不能再被选作弃置的同花色牌
      const liveSrc = getPlayer(source.id) ?? source;
      const sameSuitCard = liveSrc.hand.find(c => c.suit === shownCard.suit && c.id !== card.id);
      if (sameSuitCard) {
        // 弃置同花色手牌并造成伤害（用函数式移除，不能整手牌写回出牌前快照，否则会复制回已打出的牌）
        mutateHand(source.id, h => h.filter(c => c.id !== sameSuitCard.id));
        setDiscardPile(prev => [...prev, sameSuitCard]);
        addLog(`${source.hero.name} 弃置了【${sameSuitCard.name}】(${sameSuitCard.suit})，对 ${target.hero.name} 造成1点火焰伤害！`, 'danger');
        // 属性伤害统一由 takeDamage 处理（含藤甲加伤与铁索传导）
        await takeDamage(target.id, source.id, 1, card, 'fire');
      } else {
        addLog(`${source.hero.name} 没有${shownCard.suit}花色的手牌，【火攻】失败！`, 'warning');
      }
    }
    // 铁索连环
    else if (card.name === CardName.TIESUO) {
      playCard(source.id, card);
      addLog(`${source.hero.name} 使用了【铁索连环】`, 'info');
      // 标记目标为横置状态
      for (const target of targets) {
        // 王异「贞烈」：铁索连环属非延时锦囊，可令其对自己无效
        if (await tryZhenlie(target, source, card)) continue;
        // 切换横置状态
        const newChainedState = !target.isChained;
        updatePlayer(target.id, { isChained: newChainedState });
        addLog(`${target.hero.name} ${newChainedState ? '被横置' : '重置'}`, 'info');
      }
    }
    // 酒
    else if (card.name === CardName.JIU) {
      playCard(source.id, card);
      const target = targets[0];
      // 濒死状态使用：回复1点体力（目标必须是濒死者）
      if (target && target.hp <= 0) {
        const newHp = Math.min(target.hp + 1, target.maxHp);
        setHealAnimTarget(target.id);
        setHealNumber({ targetId: target.id, amount: 1, id: Date.now().toString() });
        setTimeout(() => setHealAnimTarget(null), 600);
        setTimeout(() => setHealNumber(null), 1000);
        recoverHp(target.id, 1);
        if (source.id === target.id) {
          addLog(`${source.hero.name} 使用【酒】自救，当前体力: ${newHp}/${target.maxHp}`, 'success');
        } else {
          addLog(`${source.hero.name} 使用【酒】救援 ${target.hero.name}，${target.hero.name} 当前体力: ${newHp}/${target.maxHp}`, 'success');
        }
      } else {
        // 出牌阶段使用：下一张杀伤害+1
        // 简化实现：标记玩家状态，下次使用杀时伤害+1
        addLog(`${source.hero.name} 喝酒壮胆，本回合下一张【杀】伤害+1！`, 'success');
        // 使用全局状态或ref来标记
        if (!window.jiuBoost) window.jiuBoost = {};
        window.jiuBoost[source.id] = true;
      }
    }
    // 兵粮寸断
    else if (card.name === CardName.BINGLIANG) {
      playCard(source.id, card);
      const target = targets[0];
      addLog(`${source.hero.name} 对 ${target.hero.name} 使用了【兵粮寸断】`, 'info');
      // 无懈可击询问链（全座次 + 可被反无懈）
      const isWuxieUsed = await resolveWuxieChain(source.id, card);
      if (isWuxieUsed) {
        addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
        return;
      }
      // 放入判定区：判定阶段按进入先后逐张结算
      addDelayedTrick(target.id, card);
      addLog(`${target.hero.name} 中了【兵粮寸断】，判定区第 ${(getPlayer(target.id)?.judgeZone?.length ?? 1)} 张，下回合判定非梅花将跳过摸牌阶段`, 'warning');
    }
    // 五谷丰登
    else if (card.name === CardName.WUGU) {
      playCard(source.id, card);
      addLog(`${source.hero.name} 使用了【五谷丰登】`, 'info');
      
      // 获取所有存活角色
      const alivePlayers = players.filter(p => !p.isDead);
      const cardCount = alivePlayers.length;

      // 从牌堆顶亮出等同于存活角色数量的牌（基于 deckRef，必要时洗切弃牌堆）
      let currentDeck = [...deckRef.current];
      if (currentDeck.length < cardCount && discardPileRef.current.length > 0) {
        currentDeck = shuffle([...discardPileRef.current, ...currentDeck]);
        setDiscardPile([]);
        discardPileRef.current = [];
        addLog('牌堆已洗切', 'info');
      }
      const drawCount = Math.min(cardCount, currentDeck.length);
      let revealedCards: Card[] = currentDeck.splice(currentDeck.length - drawCount, drawCount);
      setDeck(currentDeck);
      deckRef.current = currentDeck;

      await delay(500);
      addLog(`亮出了 ${revealedCards.length} 张牌: ${revealedCards.map(c => c.name).join('、')}`, 'info');
      
      // 按照行动顺序（从当前角色开始）依次选择牌
      const playerCount = players.length;
      const sortedPlayers = [...alivePlayers].sort((a, b) => {
        const offsetA = (a.id - source.id + playerCount) % playerCount;
        const offsetB = (b.id - source.id + playerCount) % playerCount;
        return offsetA - offsetB;
      });
      
      for (const player of sortedPlayers) {
        if (revealedCards.length === 0) break;
        // 王异「贞烈」：五谷丰登属非延时锦囊，可令其对自己无效（不参与选牌）
        if (await tryZhenlie(player, source, card)) continue;
        
        if (player.isHuman && !isAiTakeover) {
          // 人类玩家选择（30 秒未选自动代选，避免单一响应等待无限挂起）
          const selectedCard = await new Promise<Card | null>(resolve => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const finish = (card: Card | null) => {
              if (settled) return;
              settled = true;
              if (timer) clearTimeout(timer);
              setWuguSelection(null);
              resolve(card);
            };
            timer = setTimeout(() => {
              if (settled) return;
              const auto = revealedCards[Math.floor(Math.random() * revealedCards.length)] ?? null;
              addLog(`${player.hero.name} 选择超时，自动选取${auto ? `【${auto.name}】` : '无牌'}`, 'warning');
              finish(auto);
            }, 30000);
            setWuguSelection({
              cards: revealedCards,
              playerName: player.hero.name,
              onSelect: (card: Card | null) => finish(card)
            });
          });
          
          if (selectedCard) {
            revealedCards = revealedCards.filter(c => c.id !== selectedCard.id);
            mutateHand(player.id, hand => [...hand, selectedCard]);
            addLog(`${player.hero.name} 选择了【${selectedCard.name}】`, 'success');
          }
        } else {
          // AI 随机选择
          const randomIndex = Math.floor(Math.random() * revealedCards.length);
          const selectedCard = revealedCards[randomIndex];
          revealedCards = revealedCards.filter(c => c.id !== selectedCard.id);
          mutateHand(player.id, hand => [...hand, selectedCard]);
          addLog(`${player.hero.name} 选择了【${selectedCard.name}】`, 'success');
          await delay(800);
        }
      }
      
      // 剩余的牌进入弃牌堆
      if (revealedCards.length > 0) {
        setDiscardPile(prev => [...prev, ...revealedCards]);
        addLog(`${revealedCards.length} 张牌进入弃牌堆`, 'info');
      }
      
      setWuguSelection(null);
    }
    // 桃园结义
    else if (card.name === CardName.TAOYUAN) {
      playCard(source.id, card);
      addLog(`${source.hero.name} 使用了【桃园结义】`, 'info');
      
      // 获取所有存活角色
      const alivePlayers = players.filter(p => !p.isDead);
      
      // 所有存活角色依次回复1点体力
      for (const player of alivePlayers) {
        // 王异「贞烈」：桃园结义属非延时锦囊，可令其对自己无效（不回复）
        if (await tryZhenlie(player, source, card)) continue;
        if (player.hp < player.maxHp) {
          const newHp = Math.min(player.hp + 1, player.maxHp);
          const healAmount = newHp - player.hp;
          
          // 触发治疗动画
          setHealAnimTarget(player.id);
          setHealNumber({ targetId: player.id, amount: healAmount, id: Date.now().toString() + Math.random() });
          setTimeout(() => setHealAnimTarget(null), 600);
          setTimeout(() => setHealNumber(null), 1000);
          
          recoverHp(player.id, 1);
          addLog(`${player.hero.name} 回复了 ${healAmount} 点体力，当前体力: ${newHp}/${player.maxHp}`, 'success');
          await delay(500);
        } else {
          addLog(`${player.hero.name} 体力已满，无需回复`, 'info');
        }
      }
    }
    // 借刀杀人
    else if (card.name === CardName.JIEDAO) {
      const target = targets[0];
      const victim = targets[1];
      if (await tryZhenlie(target, source, card)) {
        playCard(source.id, card);
        return;
      }
      playCard(source.id, card);
      addLog(`${source.hero.name} 对 ${target.hero.name} 使用了【借刀杀人】，令其攻击 ${victim.hero.name}`, 'info');
      
      // 无懈可击询问链（全座次 + 可被反无懈）
      const isWuxieUsed = await resolveWuxieChain(source.id, card);
      if (isWuxieUsed) {
        addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
        return;
      }
      
      // 目标有【杀】则必须使用；受害者可打出【闪】抵消
      if (target.hand.some(c => c.name === CardName.SHA)) {
        // 使用杀攻击目标
        const shaCard = target.hand.find(c => c.name === CardName.SHA)!;
        playCard(target.id, shaCard);
        addLog(`${target.hero.name} 被【借刀杀人】所迫，对 ${victim.hero.name} 使用了【杀】`, 'info');

        // 受害者通过响应流程打出【闪】（人类玩家会收到响应弹窗）
        await triggerReaction(victim.id, target.id, CardName.SHAN, card);
      } else {
        // 无【杀】：将武器牌交给使用者（响应流程是异步的，必须读实时装备区，不能用目标快照）
        const weapon = getPlayer(target.id)?.equipment?.weapon;
        if (weapon) {
          updatePlayerWith(target.id, p => {
            const nextEquip = { ...(p.equipment ?? {}) };
            delete nextEquip.weapon;
            return { equipment: nextEquip };
          });
          mutateHand(source.id, hand => [...hand, weapon]);
          triggerXiaoji(target.id, weapon);
          addLog(`${target.hero.name} 无法使用【杀】，将【${weapon.name}】交给了 ${source.hero.name}`, 'info');
        } else {
          addLog(`${target.hero.name} 没有【杀】也没有武器，【借刀杀人】无效果`, 'info');
        }
      }
    }
    // 闪电（延时锦囊）：挂置于自己判定区，下回合开始时判定
    else if (card.name === CardName.SHANDIAN) {
      playCard(source.id, card);
      addLog(`${source.hero.name} 使用了【闪电】，将其放置于自己的判定区`, 'warning');

      // 无懈可击询问链（全座次 + 可被反无懈）
      const isWuxieUsed = await resolveWuxieChain(source.id, card);
      if (isWuxieUsed) {
        addLog(`【无懈可击】生效，【闪电】被抵消`, 'success');
      } else {
        addDelayedTrick(source.id, card);
        addLog(`⚡【闪电】置于 ${source.hero.name} 的判定区第 ${(getPlayer(source.id)?.judgeZone?.length ?? 1)} 张，下回合判定阶段结算`, 'warning');
      }
    }
  } finally {
    setIsProcessing(p => Math.max(0, p - 1));
    // 技能注册表：一张牌结算完成后的时机（afterCardUsed）
    try {
      const usedCount = [...firstUsedCardRef.current].filter(k => k.startsWith(`${source.id}-`)).length;
      await dispatchCardUsed({
        ...skillDeps(),
      }, { source, card, targets, usedCount });
    } catch (e) {
      addLog('技能结算异常：' + String(e), 'warning');
    }
    // 孙鲁育「魅步」止息：使用锦囊牌后，若使用者正处于自己的出牌阶段，立即结束出牌阶段
    const zx = zhixiRef.current;
    if (zx && zx.id === source.id && card.type === CardType.SCROLL) {
      zx.trickUsed = true;
      const humanOwner = playersRef.current.find(p => p.id === source.id && p.isHuman);
      if (humanOwner && !isAiTakeover && phaseLiveRef.current === GamePhase.ACTION) {
        addLog(`【止息】${source.hero.name} 使用锦囊牌后结束出牌阶段`, 'skill');
        leaveActionPhase();
      }
    }
  }
}

  // ── resolveWuxieChain（App.tsx 原 L7991-8038）──
  const resolveWuxieChain = async (sourceId: number, triggerCard: Card): Promise<boolean> => {
  const total = playersRef.current.length;
  if (total === 0) return false;
  const asked = new Set<number>();
  let anchor = sourceId;
  let nullified = false;
  let depth = 0;
  while (depth < MAX_WUXIE_DEPTH) {
    // 收集本层合法角色：从锚点（锦囊使用者 / 上一张无懈的使用者）起的座次顺序
    const order: number[] = [];
    for (let k = 0; k < total; k++) {
      const id = (anchor + k) % total;
      const p = playersRef.current.find(x => x.id === id);
      if (!p || p.isDead || asked.has(id)) continue;
      if (!p.hand.some(c => c.name === CardName.WUXIE)) continue;
      order.push(id);
    }
    if (order.length === 0) break;
    const orderNames = order.map(id => playersRef.current.find(p => p.id === id)?.hero.name ?? `#${id}`);
    addLog(`【无懈可击】第 ${depth + 1} 层询问（座次）：${orderNames.join(' → ')}`, 'info');

    let user = -1;
    for (const id of order) {
      asked.add(id);
      const used = await triggerReaction(id, depth === 0 ? sourceId : anchor, CardName.WUXIE, triggerCard);
      if (used) { user = id; break; }
    }
    if (user < 0) break;

    depth++;
    nullified = !nullified;
    const name = playersRef.current.find(p => p.id === user)?.hero.name ?? `#${user}`;
    addLog(
      depth === 1
        ? `无懈可击链（第 1 层）：${name} 以【无懈可击】抵消了【${triggerCard.name}】`
        : `无懈可击链（第 ${depth} 层）：${name} 以【无懈可击】反制上一张【无懈可击】`,
      'skill'
    );
    anchor = user;
  }
  if (depth > 0) {
    addLog(
      `无懈可击链结束：共 ${depth} 层，【${triggerCard.name}】${nullified ? '最终被抵消' : '最终生效'}`,
      nullified ? 'success' : 'warning'
    );
  }
  return nullified;
}

  // ── triggerReaction（App.tsx 原 L7577-7980）──
  const triggerReaction = async (responderId: number, sourceId: number, neededCard: CardName, triggerCard: Card, isSecondReaction: boolean = false) => {
  setIsProcessing(p => p + 1);
  try {
    const responder = getPlayer(responderId)!;
    const source = getPlayer(sourceId)!;
    
    // Check if responder is dead, skip reaction if dead
    if (responder.isDead) {
      return false;
    }
    
    // 检查是否为无懈可击判定
    const isWuxieCheck = neededCard === CardName.WUXIE;
    
    // 检查是否为吕布的无双技能
    // 官方「无双」：仅【杀】需两张【闪】、仅【决斗】需两张【杀】；【南蛮入侵】【万箭齐发】不双牌
    const isLubuWushuang = source.hero.name === '吕布';
    const needTwoCards = isLubuWushuang && !isSecondReaction
      && ((triggerCard.name === CardName.SHA && neededCard === CardName.SHAN)
        || (triggerCard.name === CardName.JUEDOU && neededCard === CardName.SHA));
    const wushuangCardName = neededCard === CardName.SHAN ? '闪' : '杀';

    // 八卦阵：需要【闪】时自动判定，红色视为打出【闪】（青釭剑无视防具）
    if (
      neededCard === CardName.SHAN &&
      !isSecondReaction &&
      responder.equipment?.armor?.name === CardName.BAGUA &&
      source.equipment?.weapon?.name !== CardName.QINGGANG
    ) {
      const judgment = await performJudgment(responderId, '八卦阵');
      if (judgment && (judgment.suit === Suit.HEART || judgment.suit === Suit.DIAMOND)) {
        addLog(`${responder.hero.name} 的【八卦阵】判定为红色，视为打出了【闪】！`, 'success');
        await delay(400);
        return false;
      }
      addLog(`${responder.hero.name} 的【八卦阵】判定失败，仍需自行出【闪】`, 'warning');
      await delay(300);
    }

    // 主公技：曹操「护驾」/ 刘备「激将」
    const lordSkillName =
      responder.identity === Identity.ZHUGONG && responder.hero.name === '曹操' && neededCard === CardName.SHAN ? '护驾'
      : responder.identity === Identity.ZHUGONG && responder.hero.name === '刘备' && neededCard === CardName.SHA ? '激将'
      : null;
    if (lordSkillName && !responder.hand.some(c => c.name === neededCard)) {
      const kingdom = responder.hero.kingdom;
      const helper = playersRef.current.find(p =>
        !p.isDead && p.id !== responder.id && p.hero.kingdom === kingdom
        && p.hand.some(c => c.name === neededCard)
      );
      if (helper) {
        const helpCard = helper.hand.find(c => c.name === neededCard)!;
        playCard(helper.id, helpCard);
        addLog(`${responder.hero.name} 发动「${lordSkillName}」，${helper.hero.name} 打出了【${neededCard}】（视为 ${responder.hero.name} 打出）`, 'skill');
        showSkillBanner(responder.hero.name, lordSkillName);
        await delay(500);
        return false;
      }
    }

    // HUMAN REACTION
    if (responder.isHuman && !isAiTakeover) {
      const hasCard = responder.hand.some(c => c.name === neededCard);
      const canUseSkill = responder.hero.name === '赵云'
        || (responder.hero.name === '赵襄' && (responder.meiyanMarks ?? 0) > 0);
      const skillCardName = canUseSkill ? (neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN) : null;
      const hasSkillCard = canUseSkill && responder.hand.some(c => c.name === skillCardName);
      const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
      
      // 如果是无懈可击判定，且玩家手中没有无懈可击，直接返回false，不显示弹窗
      if (isWuxieCheck && !hasWuxie) {
        addLog(`${responder.hero.name} 没有【无懈可击】，无法免疫效果！`, 'info');
        return false;
      }
      
      // 构建更详细的提示信息
      let prompt = `受到 ${source.hero.name} 的【${triggerCard.name}】威胁！`;
      // 吕布无双技能提示
      if (needTwoCards) {
        prompt += `【无双】需要两张【${wushuangCardName}】！`;
      }
      let options: string[] = [];
      
      // 关羽的「武圣」技能：红色牌可以当杀使用
      const isGuanyu = canUseWusheng(responder);
      const hasRedCard = responder.hand.some(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
      
      if (isWuxieCheck) {
        // 无懈可击判定
        if (hasWuxie) options.push(`使用【无懈可击】免疫效果`);
        options.push('不使用无懈可击');
      } else {
        // 普通判定
        if (hasCard) options.push(`出【${neededCard}】`);
        if (hasSkillCard && canUseSkill) {
          const skillDesc = neededCard === CardName.SHAN 
            ? `使用【杀】（「龙胆」技能）` 
            : `使用【闪】（「龙胆」技能）`;
          options.push(skillDesc);
        }
        // 关羽的「武圣」技能：红色牌可以当杀使用
        if (isGuanyu && neededCard === CardName.SHA && hasRedCard) {
          options.push(`使用红色牌当【杀】（「武圣」技能）`);
        }
        if (hasWuxie) options.push(`使用【无懈可击】免疫效果`);
        options.push('承受伤害');
      }
      
      prompt += `请选择：${options.join(' / ')}`;
      
      addLog(prompt, 'warning');
      
      // Set State for UI to show prompt
      setPendingReaction({ 
        sourceId, 
        targetId: responderId, 
        cardName: neededCard, 
        originalCard: triggerCard,
        canUseLongdan: canUseSkill,
        skillCardName: skillCardName ?? undefined,
        canUseWuxie: hasWuxie
      });
      
      // Wait for user input via Promise with timeout（与出牌阶段一致的读秒）
      setReactionLeft(DECISION_SECONDS);
      const result = await new Promise<{ played: boolean, isWuxie: boolean }>((resolve) => {
         humanReactionResolver.current = resolve;

         const tickId = window.setInterval(() => {
           setReactionLeft(v => (v === null ? null : Math.max(0, v - 1)));
         }, 1000);
         reactionTickRef.current = tickId;

         const timeoutId = window.setTimeout(() => {
            if (humanReactionResolver.current) {
              addLog('时间到！自动放弃防御', 'danger');
              humanReactionResolver.current({ played: false, isWuxie: false });
            }
          }, DECISION_SECONDS * 1000);

         timeoutIdRef.current = timeoutId;
      });

      // Cleanup
      clearTimeout(timeoutIdRef.current ?? undefined); // Clear timeout to prevent memory leak
      timeoutIdRef.current = null;
      if (reactionTickRef.current) {
        window.clearInterval(reactionTickRef.current);
        reactionTickRef.current = null;
      }
      setReactionLeft(null);
      setPendingReaction(null);
      humanReactionResolver.current = null;

      if (result.played) {
         if (result.isWuxie) {
           addLog(`你使用了【无懈可击】，免疫了【${triggerCard.name}】的效果！`, 'success');
           
           return true;
         } else {
           if (isWuxieCheck) {
             addLog(`你选择不使用【无懈可击】`, 'info');
             return false;
           } else {
             addLog(`你打出了【${neededCard}】，防御成功！`, 'success');
             
             
             // 吕布无双技能：需要第二张牌
             if (needTwoCards) {
               addLog(`【无双】还需要一张【${wushuangCardName}】！`, 'warning');
               await delay(500);
               const secondResult = await triggerReaction(responderId, sourceId, neededCard, triggerCard, true);
               // 如果第二张牌没有打出，仍然受到伤害
               if (!secondResult) {
                 addLog(`没有打出第二张【${wushuangCardName}】，防御失败！`, 'danger');
                 await takeDamage(responderId, sourceId, 1, triggerCard);
                 // 防御失败，决斗结束，不再继续
                 return false;
               }
               // 防御成功，如果是决斗则继续
               if (triggerCard.name === CardName.JUEDOU) {
                  await delay(800);
                  await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
               }
               return false;
             }
             
             if (triggerCard.name === CardName.JUEDOU) {
                await delay(800);
                await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
             }
             return false;
           }
         }
      } else {
         if (isWuxieCheck) {
           // 无懈可击判定超时，不使用无懈可击
           addLog(`你选择不使用【无懈可击】`, 'info');
           return false;
         } else {
           // 普通判定超时，承受伤害
           addLog(`你放弃了防御。`, 'danger');
           await takeDamage(responderId, sourceId, 1, triggerCard);
           return false;
         }
      }
    } 
    // AI (or Human Auto) REACTION
    else {
      await delay(1000); 
      let hasCard = responder.hand.some(c => c.name === neededCard);
      let cardToPlay = responder.hand.find(c => c.name === neededCard);
      // 董白「黠慧」：体力未减少时，获得的黑色牌不能打出
      if (cardToPlay && xiaohuiLocked(responder.id, cardToPlay.id)) {
        addLog(`【黠慧】${responder.hero.name} 不能打出获得的黑色牌【${cardToPlay.name}】（体力未减少）`, 'warning');
        showSkillBanner('董白', '黠慧');
        if (neededCard === CardName.WUXIE) return false;
        cardToPlay = undefined;
        await delay(300);
        await takeDamage(responderId, sourceId, 1, triggerCard);
        return false;
      }
      let isUsingSkill = false;
      
      // 检查是否为无懈可击判定
      const isWuxieCheck = neededCard === CardName.WUXIE;
      
      // 无懈可击决策：简单随机、普通必用、困难只留给高价值锦囊
      if (isWuxieCheck) {
        const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
        const difficulty = aiDifficultyRef.current;
        const highValue = [CardName.JUEDOU, CardName.NANMAN, CardName.WANJIAN,
          CardName.LESI, CardName.BINGLIANG, CardName.HUOGONG].includes(triggerCard.name);
        const shouldWuxie = !hasWuxie ? false
          : difficulty === 'easy' ? Math.random() < 0.5
          : difficulty === 'hard'
            ? (highValue || responder.identity === Identity.ZHUGONG || responder.hp <= 1 || Math.random() < 0.45)
            : true;
        if (hasWuxie && shouldWuxie) {
          const wuxieCard = responder.hand.find(c => c.name === CardName.WUXIE)!;
          playCard(responder.id, wuxieCard);
          addLog(`${responder.hero.name} 使用了【无懈可击】`, 'info');
          return true;
        } else if (hasWuxie) {
          addLog(`${responder.hero.name} 保留了【无懈可击】`, 'info');
          return false;
        } else {
          return false;
        }
      }

      // 「穆穆」：本回合不能打出【杀】
      if (neededCard === CardName.SHA && mumuNoSlashRef.current === responder.id) {
        addLog(`${responder.hero.name} 因「穆穆」本回合不能打出【杀】`, 'skill');
        showSkillBanner(responder.hero.name, '穆穆');
        return false;
      }
      
      // 简单 AI 有概率反应慢半拍，不出【闪】
      if (neededCard === CardName.SHAN && aiDifficultyRef.current === 'easy'
          && responder.hp > 1 && Math.random() < 0.22) {
        addLog(`${responder.hero.name} 反应慢了半拍，没有打出【闪】`, 'info');
        await delay(300);
        await takeDamage(responderId, sourceId, 1, triggerCard);
        return false;
      }
      
      // 检查赵云「龙胆」/ 赵襄「芳魂」的杀闪互转技能
      if (!hasCard && (responder.hero.name === '赵云'
          || (responder.hero.name === '赵襄' && (responder.meiyanMarks ?? 0) > 0))) {
        // 尝试使用技能：如果需要闪，使用杀；如果需要杀，使用闪
        if (neededCard === CardName.SHAN) {
          cardToPlay = responder.hand.find(c => c.name === CardName.SHA);
        } else if (neededCard === CardName.SHA) {
          cardToPlay = responder.hand.find(c => c.name === CardName.SHAN);
        }
        
        if (cardToPlay) {
          hasCard = true;
          isUsingSkill = true;
        }
      }
      
      // 检查关羽的武圣技能：红色牌可以当杀使用
      if (!hasCard && canUseWusheng(responder) && neededCard === CardName.SHA) {
        // 尝试使用红色牌（红桃或方块）当杀
        cardToPlay = responder.hand.find(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
        
        if (cardToPlay) {
          hasCard = true;
          isUsingSkill = true;
        }
      }

      // 甄姬「倾国」：黑色手牌可当【闪】
      let isQingguoAI = false;
      if (!hasCard && responder.hero.name === '甄姬' && neededCard === CardName.SHAN) {
        cardToPlay = responder.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
        if (cardToPlay) {
          hasCard = true;
          isUsingSkill = true;
          isQingguoAI = true;
        }
      }
      
      if (hasCard && cardToPlay) {
        playCard(responder.id, cardToPlay);
        
        if (isQingguoAI) {
          addLog(`${responder.hero.name} 使用技能「倾国」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
          showSkillBanner(responder.hero.name, '倾国');
        } else if (isUsingSkill) {
          // 区分赵云的龙胆、赵襄的芳魂与「武圣」
          if (canUseWusheng(responder)) {
            addLog(`${responder.hero.name} 使用技能「武圣」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(responder.hero.name, '武圣');
          } else if (responder.hero.name === '赵襄') {
            updatePlayer(responder.id, { meiyanMarks: Math.max(0, (responder.meiyanMarks ?? 0) - 1) });
            addLog(`【芳魂】赵襄移去 1 个「梅影」，发动「龙胆」将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner('赵襄', '芳魂');
          } else {
            addLog(`${responder.hero.name} 使用技能「龙胆」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(responder.hero.name, '龙胆');
          }
        } else {
          addLog(`${responder.hero.name} 打出了【${neededCard}】`, 'info');
        }

        // 鲍三娘「姝勇」：打出【杀】同样触发（决斗/南蛮/借刀等响应）
        if (neededCard === CardName.SHA) await triggerShuyong(responder.id, sourceId);
        
        
        
        // 吕布无双技能：需要第二张牌
        if (needTwoCards) {
          await delay(500);
          // 检查是否还有第二张牌
          let hasSecondCard = responder.hand.some(c => c.name === neededCard);
          let secondCardToPlay = responder.hand.find(c => c.name === neededCard);
          let isUsingSecondSkill = false;
          
          // 检查赵云的技能
          if (!hasSecondCard && responder.hero.name === '赵云') {
            if (neededCard === CardName.SHAN) {
              secondCardToPlay = responder.hand.find(c => c.name === CardName.SHA);
            } else if (neededCard === CardName.SHA) {
              secondCardToPlay = responder.hand.find(c => c.name === CardName.SHAN);
            }
            if (secondCardToPlay) {
              hasSecondCard = true;
              isUsingSecondSkill = true;
            }
          }
          
          // 检查「武圣」技能（第二张牌）
          if (!hasSecondCard && canUseWusheng(responder) && neededCard === CardName.SHA) {
            secondCardToPlay = responder.hand.find(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
            if (secondCardToPlay) {
              hasSecondCard = true;
              isUsingSecondSkill = true;
            }
          }
          
          if (hasSecondCard && secondCardToPlay) {
            playCard(responder.id, secondCardToPlay);
            if (isUsingSecondSkill) {
              // 区分赵云的龙胆和「武圣」
              if (canUseWusheng(responder)) {
                addLog(`${responder.hero.name} 使用技能「武圣」，将【${secondCardToPlay.name}】当【${neededCard}】使用`, 'skill');
              } else {
                addLog(`${responder.hero.name} 使用技能「龙胆」，将【${secondCardToPlay.name}】当【${neededCard}】使用`, 'skill');
              }
            } else {
              addLog(`${responder.hero.name} 打出了第二张【${neededCard}】`, 'info');
            }
            addLog(`【无双】防御成功！`, 'success');
            // 防御成功，如果是决斗则继续
            if (triggerCard.name === CardName.JUEDOU) {
              await delay(800);
              await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
            }
          } else {
            addLog(`【无双】没有打出第二张【${wushuangCardName}】，防御失败！`, 'danger');
            await takeDamage(responderId, sourceId, 1, triggerCard);
            // 防御失败，决斗结束，不再继续
          }
          return false;
        }

        if (triggerCard.name === CardName.JUEDOU) {
          await delay(800);
          await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
        }
        return false;
      } else {
        // AI 没有所需的牌：直接承受伤害（无懈可击不能代替闪/杀）
        await takeDamage(responderId, sourceId, 1, triggerCard);
        return false;
      }
    }
  } finally {
    setIsProcessing(p => Math.max(0, p - 1));
  }
}

  // ── askForPeaches（App.tsx 原 L8056-8310）──
  const askForPeaches = async (victimId: number): Promise<boolean> => {
  const victim = getPlayer(victimId)!;
  const savedAt = recentlySavedRef.current[victimId];
  if (victim.hp > 0 || (savedAt && Date.now() - savedAt < 3000)) {
    setDyingState(null);
    return true;
  }

  setIsProcessing(p => p + 1);

  addLog(`☠️ ${victim.hero.name} 进入濒死状态，开始求桃！`, 'danger');

  try {
    // 技能注册表：进入濒死、求桃之前的时机（御心 / 困励 / 殇决）。
    // 放在既有内联技能之前：这些是「救人」类技能，越早给机会越符合规则
    // （一旦有人出了桃，后面再救就是重复消耗）。
    {
      const cur = getPlayer(victimId);
      if (cur) {
        const saved = await dispatchDying({
          ...skillDeps(),
        }, { victim: cur, source: undefined, needHp: 1 });
        if (saved) {
          updatePlayer(victimId, { hp: saved.hp });
          addLog(saved.note ?? `${cur.hero.name} 因技能回复至 ${saved.hp} 点体力`, 'skill');
          if (saved.hp > 0) {
            recentlySavedRef.current[victimId] = Date.now();
            await delay(300);
            setDyingState(null);
            return true;
          }
        }
      }
    }
    // 张琪瑛「真仪·后土」：自身濒死时，弃置“后土”并将一张手牌当【桃】使用
    const zqyVictim = getPlayer(victimId);
    if (zqyVictim && zqyVictim.hero.name === '张琪瑛' && skillsOn(victimId)
        && hasZhangMark(zqyVictim, '后土') && zqyVictim.hand.length > 0) {
      const card = zqyVictim.hand.find(c => c.name !== CardName.TAO) ?? zqyVictim.hand[0];
      updatePlayer(victimId, { zhangMarks: (zqyVictim.zhangMarks ?? []).filter(m => m !== '后土') });
      mutateHand(victimId, h => h.filter(c => c.id !== card.id));
      const newDiscard = [...discardPileRef.current, card];
      discardPileRef.current = newDiscard;
      setDiscardPile(newDiscard);
      addLog(`【真仪·后土】张琪瑛弃置“后土”标记，将【${card.name}】当【桃】使用`, 'skill');
      showSkillBanner('张琪瑛', '真仪');
      const gained = recoverHp(victimId, 1);
      if (gained > 0) {
        addLog(`${getPlayer(victimId)?.hero.name ?? '张琪瑛'} 因「真仪·后土」回复 1 点体力`, 'success');
      }
      await delay(350);
      if ((getPlayer(victimId)?.hp ?? 0) > 0) {
        recentlySavedRef.current[victimId] = Date.now();
        setDyingState(null);
        return true;
      }
    }

    // 吴国太「补益」：一名角色进入濒死时，可展示其一张非基本手牌，弃置后回复1点体力
    const buyiOwner = playersRef.current.find(p => !p.isDead && p.hero.name === '吴国太' && skillsOn(p.id));
    if (buyiOwner) {
      const curVictim = getPlayer(victimId);
      const nonBasic = curVictim?.hand.find(c => c.type !== CardType.BASIC);
      if (curVictim && curVictim.hp <= 0 && nonBasic) {
        discardCards(victimId, [nonBasic]);
        addLog(`吴国太发动「补益」，展示并弃置 ${curVictim.hero.name} 的【${nonBasic.name}】`, 'skill');
        showSkillBanner('吴国太', '补益');
        const gained = recoverHp(victimId, 1);
        if (gained > 0) {
          addLog(`${curVictim.hero.name} 因「补益」回复 1 点体力（${getPlayer(victimId)?.hp}/${curVictim.maxHp}）`, 'success');
        }
        await delay(300);
        if ((getPlayer(victimId)?.hp ?? 0) > 0) {
          recentlySavedRef.current[victimId] = Date.now();
          setDyingState(null);
          return true;
        }
      }
    }

    // 原版三国杀规则：按顺序从濒死者开始询问是否出桃
    // 顺序：濒死者 -> 下家 -> 下下家... -> 上家
    const allPlayers = playersRef.current.filter(p => !p.isDead);
    const playerCount = playersRef.current.length;
    // 只记 id：每轮都用 getPlayer 取最新手牌，避免用快照里的旧桃反复“救援”
    const order = allPlayers
      .sort((a, b) => ((a.id - victimId + playerCount) % playerCount) - ((b.id - victimId + playerCount) % playerCount))
      .map(p => p.id);

    // 循环询问，直到有人出桃或者所有人都放弃（最多 12 轮兜底，防止状态异常时死循环）
    let rounds = 0;
    let lastSaviorId: number | null = null;
    while ((getPlayer(victimId)?.hp ?? 1) <= 0) {
      if (++rounds > 12) {
        addLog(`求桃轮次异常（${rounds}），按无人救援处理`, 'warning');
        return false;
      }
      let someoneSaved = false;

      for (const pid of order) {
        const player = getPlayer(pid);
        if (!player || player.isDead) continue;
        const currentVictim = getPlayer(victimId)!;
        if (currentVictim.hp > 0) {
          setDyingState(null);
          return true;
        }

        const hasTao = player.hand.some(c => c.name === CardName.TAO);
        const hasJiu = player.hand.some(c => c.name === CardName.JIU);
        // 华佗「急救」：回合外可将红色牌当【桃】
        const hasRed = player.hero.name === '华佗' && player.id !== turnIndex
          && player.hand.some(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
        const hasJijiu = hasRed && !hasTao && !hasJiu;
        const canSave = hasTao || hasJiu || hasRed;

        // 所有有桃或酒的角色（包括濒死角色自己）都可以选择是否使用
        if (canSave) {
          const saveCardName = hasTao ? '桃' : hasJiu ? '酒' : '红色牌（急救）';
          addLog(`👉 询问 ${player.hero.name} 是否使用【${saveCardName}】救援 ${victim.hero.name}`, 'info');

          // 如果是人类玩家，显示弹窗询问
          if (player.isHuman && !isAiTakeover) {
            // 等待玩家决策
            const result = await new Promise<boolean>((resolve) => {
              dyingResolver.current = resolve;

              // 设置弹窗状态，传入真正的resolve函数
              setDyingState({
                victimId,
                isActive: true,
                rescuerId: player.id,
                hasTao,
                hasJiu,
                hasJijiu,
                resolve: (result: boolean) => {
                  resolve(result);
                }
              });

              // 与出牌阶段一致的 20 秒读秒
              setDyingLeft(DECISION_SECONDS);
              const tickId = window.setInterval(() => {
                setDyingLeft(v => (v === null ? null : Math.max(0, v - 1)));
              }, 1000);
              dyingTickRef.current = tickId;

              const timeoutId = setTimeout(() => {
                if (dyingResolver.current) {
                  addLog(`${player.hero.name} 超时未响应，放弃救援`, 'warning');
                  dyingResolver.current(false);
                }
              }, DECISION_SECONDS * 1000);

              dyingTimeoutRef.current = timeoutId;
            });

            // 清理
            clearTimeout(dyingTimeoutRef.current ?? undefined);
            dyingTimeoutRef.current = null;
            if (dyingTickRef.current) {
              window.clearInterval(dyingTickRef.current);
              dyingTickRef.current = null;
            }
            setDyingLeft(null);
            dyingResolver.current = null;
            setDyingState(null);

            if (result) {
              // 玩家选择救援，优先使用桃，其次酒，华佗可用红色牌急救
              const saveCard = player.hand.find(c => c.name === CardName.TAO)
                || player.hand.find(c => c.name === CardName.JIU)
                || player.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
              if (saveCard) {
                const actualCard: Card = saveCard.name === CardName.TAO || saveCard.name === CardName.JIU
                  ? saveCard
                  : { ...saveCard, name: CardName.TAO, type: CardType.BASIC, description: '急救：红色牌当【桃】使用。' };
                await resolveCardEffect(player, [currentVictim], actualCard);
                someoneSaved = true;
                lastSaviorId = player.id;

                const updatedVictim = getPlayer(victimId)!;
                if (updatedVictim.hp > 0) {
                  grantXushenToRescuer(victimId, player.id);
                  recentlySavedRef.current[victimId] = Date.now();
                  addLog(`✅ ${updatedVictim.hero.name} 被救活，脱离了濒死状态！`, 'success');
                  return true;
                }
                // 还需要更多桃/酒，继续询问
                break;
              }
            } else {
              // 玩家选择不救援
              addLog(`${player.hero.name} 选择不使用【桃】或【酒】救援`, 'info');
            }
          } else {
            // AI玩家：显示弹窗让AI"思考"，给玩家看到AI在决策
            // 先显示弹窗
            setDyingState({
              victimId,
              isActive: true,
              rescuerId: player.id,
              hasTao,
              hasJiu,
              hasJijiu,
              resolve: () => {} // AI不需要点击，所以用空函数
            });

            // AI决策
            const shouldSave = shouldAiSavePlayer(player, victim);

            if (shouldSave) {
              await delay(1500); // 给玩家看到AI在思考
              setDyingState(null);
              // AI优先使用桃，其次酒，华佗可用红色牌急救
              const saveCard = player.hand.find(c => c.name === CardName.TAO)
                || player.hand.find(c => c.name === CardName.JIU)
                || player.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
              if (!saveCard) {
                addLog(`⚠️ ${player.hero.name} 想救援但没有【桃】或【酒】了`, 'warning');
                continue; // 继续询问下一个玩家
              }
              const actualCard: Card = saveCard.name === CardName.TAO || saveCard.name === CardName.JIU
                ? saveCard
                : { ...saveCard, name: CardName.TAO, type: CardType.BASIC, description: '急救：红色牌当【桃】使用。' };
              addLog(`🍑 ${player.hero.name} 决定使用【${actualCard.name}】救援 ${victim.hero.name}`, 'success');
              await resolveCardEffect(player, [currentVictim], actualCard);
              someoneSaved = true;
              lastSaviorId = player.id;

              const updatedVictim = getPlayer(victimId)!;
              if (updatedVictim.hp > 0) {
                grantXushenToRescuer(victimId, player.id);
                recentlySavedRef.current[victimId] = Date.now();
                addLog(`✅ ${updatedVictim.hero.name} 被救活，脱离了濒死状态！`, 'success');
                return true;
              }
              // 还需要更多桃/酒，继续询问
              break;
            } else {
              await delay(1000);
              setDyingState(null);
              addLog(`${player.hero.name} 选择不出【桃】或【酒】`, 'info');
            }
          }
        } else {
          addLog(`${player.hero.name} 没有【桃】或【酒】，无法救援`, 'info');
        }
      }

      // 如果一轮询问下来没人出桃，则死亡
      if (!someoneSaved) {
        addLog(`❌ ${victim.hero.name} 无人救援，死亡！`, 'danger');
        setDyingState(null);
        return false;
      }
      // 有人出桃但体力仍未回正：让出一次宏任务，等体力更新提交后再继续询问
      await delay(150);
    }

    // 体力更新可能在下一次提交后才可见：以最终体力为准判定是否脱离濒死
    setDyingState(null);
    const finalHp = getPlayer(victimId)?.hp ?? 0;
    if (finalHp > 0) {
      if (lastSaviorId !== null) grantXushenToRescuer(victimId, lastSaviorId);
      recentlySavedRef.current[victimId] = Date.now();
      addLog(`✅ ${getPlayer(victimId)?.hero.name ?? victim.hero.name} 被救活，脱离了濒死状态！`, 'success');
      return true;
    }
    return false;
  } finally {
    setDyingState(null);
    setDyingLeft(null);
    setIsProcessing(p => Math.max(0, p - 1));
  }
}

  // ── takeDamage（App.tsx 原 L8544-9158）──
  const takeDamage = async (victimId: number, sourceId: number, amount: number, damageCard?: Card, nature?: 'fire' | 'thunder') => {
  setIsProcessing(p => p + 1);
  // 铁索连环传导波次：同一波内每名角色只吃一次传导伤害。
  // 不能只靠 updatePlayer 重置 isChained —— React 尚未提交时 getPlayer 仍会读到旧值，
  // 递归传导会出现 A→B→A 的无限循环（3 倍速下曾导致页面卡死、内存暴涨）。
  let ownsChainWave = false;
  try {
    // 伤害属性：显式传入优先，其次看伤害牌（火杀 / 雷杀）
    const dmgNature: 'normal' | 'fire' | 'thunder' = nature ?? damageCard?.attribute ?? 'normal';
    const natureLabel = dmgNature === 'fire' ? '火焰' : dmgNature === 'thunder' ? '雷电' : '';
    const source = getPlayer(sourceId);

    // 孙茹「释衅」已迁移到 src/game/skills/migrated_abilities.ts（damageBefore）
    // 青釭剑：使用【杀】时无视目标防具
    const ignoreArmor = damageCard?.name === CardName.SHA
      && source?.equipment?.weapon?.name === CardName.QINGGANG;

    // 检查是否有"酒"的伤害加成（仅对杀有效）
    let finalAmount = amount;
    if (damageCard?.name === CardName.SHA && window.jiuBoost?.[sourceId]) {
      finalAmount = amount + 1;
      addLog(`【酒】效果触发！伤害+1`, 'danger');
      // 清除酒的效果
      window.jiuBoost[sourceId] = false;
    }

    // 许褚「裸衣」已迁移到 src/game/skills/migrated_phase.ts（damageBefore）

    // 古锭刀（锁定技）：你的【杀】造成伤害时，若目标没有手牌，伤害+1
    if (damageCard?.name === CardName.SHA && sourceId !== victimId
        && source?.equipment?.weapon?.name === CardName.GUDING) {
      const victimNow = getPlayer(victimId);
      if (victimNow && victimNow.hand.length === 0) {
        finalAmount += 1;
        addLog(`【古锭刀】目标${victimNow.hero.name}没有手牌，此伤害+1`, 'danger');
        showSkillBanner(source.hero.name, '古锭刀');
      }
    }

    // 马云禄「凤魄」：首张【杀】的伤害加成（按牌 id 一次性结算）
    if (damageCard && fengpoBoostRef.current[damageCard.id]) {
      const bonus = fengpoBoostRef.current[damageCard.id];
      delete fengpoBoostRef.current[damageCard.id];
      finalAmount += bonus;
      addLog(`【凤魄】伤害 +${bonus}`, 'danger');
    }

    // 曹婴「凌人」：猜对的伤害加成（仅对应被猜测的目标）
    const lingrenBoost = damageCard ? lingrenBoostRef.current[damageCard.id] : undefined;
    if (lingrenBoost && lingrenBoost.targetId === victimId) {
      delete lingrenBoostRef.current[damageCard!.id];
      finalAmount += lingrenBoost.bonus;
      if (lingrenBoost.bonus > 0) addLog('【凌人】猜测成功，此伤害 +1', 'danger');
    }

    // 灵雎「竭缘」：对其他角色造成伤害时，若其体力值不小于你，可弃一张黑色手牌令此伤害+1
    const lingjuSrc = getPlayer(sourceId);
    if (lingjuSrc && lingjuSrc.hero.name === '灵雎' && sourceId !== victimId && skillsOn(sourceId)) {
      const v = getPlayer(victimId);
      if (v && v.hp >= lingjuSrc.hp) {
        const black = lingjuSrc.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
        if (black) {
          mutateHand(sourceId, h => h.filter(c => c.id !== black.id));
          finalAmount += 1;
          addLog(`【竭缘】灵雎弃置黑色【${black.name}】，此伤害 +1`, 'danger');
          showSkillBanner('灵雎', '竭缘');
        }
      }
    }

    // 张琪瑛「真仪·玉清」：造成伤害时弃置标记判定，黑色则伤害+1
    const zqySrc = getPlayer(sourceId);
    if (zqySrc && zqySrc.hero.name === '张琪瑛' && sourceId !== victimId
        && skillsOn(sourceId) && hasZhangMark(zqySrc, '玉清')) {
      updatePlayer(sourceId, { zhangMarks: (zqySrc.zhangMarks ?? []).filter(m => m !== '玉清') });
      addLog('【真仪·玉清】张琪瑛弃置“玉清”标记进行判定', 'skill');
      showSkillBanner('张琪瑛', '真仪');
      const jc = await performJudgment(sourceId, '真仪');
      if (jc && (jc.suit === Suit.SPADE || jc.suit === Suit.CLUB)) {
        finalAmount += 1;
        addLog('【真仪·玉清】判定为黑色，此伤害 +1', 'danger');
      }
      await delay(300);
    }

    // 张春华「绝情」：造成的伤害改为失去体力（不触发防具/伤害后技能）
    if (source?.hero.name === '张春华' && sourceId !== victimId && finalAmount > 0) {
      const target = getPlayer(victimId)!;
      const lostHp = Math.max(0, target.hp - finalAmount);
      setDamageAnimTarget(victimId);
      setTimeout(() => setDamageAnimTarget(null), 500);
      updatePlayer(victimId, { hp: lostHp });
      addLog(`${target.hero.name} 因「绝情」失去 ${finalAmount} 点体力！当前体力: ${lostHp}/${target.maxHp}`, 'danger');
      showSkillBanner(source.hero.name, '绝情');
      await delay(500);
      if (lostHp <= 0) {
        const saved = await askForPeaches(victimId);
        if (!saved) await handleDeath(victimId, sourceId);
      }
      return;
    }

    // 防具：藤甲受火焰伤害+1；白银狮子把大于1的伤害压到1
    let victim = getPlayer(victimId)!;
    const armor = victim.equipment?.armor?.name;
    if (!ignoreArmor && armor === CardName.TENGJIA && dmgNature === 'fire') {
      finalAmount += 1;
      addLog(`${victim.hero.name} 的【藤甲】遇火，火焰伤害+1`, 'danger');
    }
    if (!ignoreArmor && armor === CardName.BAIYIN && finalAmount > 1) {
      finalAmount = 1;
      addLog(`${victim.hero.name} 的【白银狮子】将伤害减为 1 点`, 'skill');
    }

    // 技能注册表：伤害结算前（骄矜/竭缘/仁释/天香 等可改数值、防止、转移）
    // 分发点必须在【藤甲】/【白银狮子】之后：旧内联分支就是这个顺序，提前会改规则。
    {
      const victimPre = getPlayer(victimId);
      const srcPre = sourceId >= 0 ? getPlayer(sourceId) : undefined;
      if (victimPre) {
        const pre = await dispatchDamageBefore({
          ...skillDeps(),
        }, {
          victim: victimPre,
          source: srcPre,
          amount: finalAmount,
          nature: (dmgNature === 'fire' || dmgNature === 'thunder' ? dmgNature : 'normal') as 'normal' | 'fire' | 'thunder',
          card: damageCard,
        });
        if (pre.note) addLog(pre.note, 'skill');
        // 本块位于 takeDamage 的 try 内，返回时 finally 会释放处理锁，
        // 与其余提前返回（如「绝情」）一致——这里**不能**再手动减一次，
        // 否则嵌套结算（外层已持有一次锁）会被提前释放，AI 主循环重复推进同一阶段。
        let earlyReturn = false;
        if (pre.prevent) {
          addLog(`${victimPre.hero.name} 的伤害被技能阻止`, 'skill');
          earlyReturn = true;
        } else if (typeof pre.amount === 'number' && pre.amount <= 0) {
          earlyReturn = true;
        } else if (typeof pre.amount === 'number') {
          finalAmount = pre.amount;
        }
        if (!earlyReturn && pre.transferTo != null) {
          const tgt = getPlayer(pre.transferTo);
          if (tgt && !tgt.isDead && tgt.id !== victimId) {
            addLog(`伤害转移给 ${tgt.hero.name}`, 'skill');
            await takeDamage(tgt.id, sourceId, finalAmount, damageCard, dmgNature === 'normal' ? undefined : dmgNature);
            earlyReturn = true;
          }
        }
        // 该块位于 takeDamage 的 try 内，finally 已负责释放一次处理锁；
        // 这里再减一次会造成「双释放」，让嵌套结算提前解锁、主循环重复推进同一阶段。
        // 与同函数其它提前返回（如「绝情」分支）保持一致：只 return，不减锁。
        if (earlyReturn) return;
      }
    }

    // 羊徽瑜「弘仪」：被指定角色造成伤害时判定，红色受伤角色摸一张，黑色此伤害-1
    const hyOwner = playersRef.current.find(p => !p.isDead && p.hero.name === '羊徽瑜' && skillsOn(p.id));
    if (hyOwner && hyOwner.hongyiTargetId === sourceId && sourceId !== victimId && finalAmount > 0) {
      const hongyiJudge = await performJudgment(hyOwner.id, '弘仪');
      if (hongyiJudge) {
        if (hongyiJudge.suit === Suit.HEART || hongyiJudge.suit === Suit.DIAMOND) {
          drawCards(victimId, 1);
          addLog(`【弘仪】判定为红色，${getPlayer(victimId)?.hero.name} 摸一张牌`, 'skill');
        } else {
          finalAmount = Math.max(0, finalAmount - 1);
          addLog(`【弘仪】判定为黑色，此伤害 -1`, 'skill');
        }
        showSkillBanner('羊徽瑜', '弘仪');
        await delay(300);
        if (finalAmount === 0) return;
      }
    }

    // 蔡贞姬「舍裔」：其他角色受到伤害时，若其体力小于蔡贞姬，可交给其X张牌防止此伤害（每轮一次）
    const czy = playersRef.current.find(p => !p.isDead && p.hero.name === '蔡贞姬' && skillsOn(p.id));
    if (czy && czy.id !== victimId && finalAmount > 0 && !sheyiUsedRef.current && czy.hp > 0) {
      const v = getPlayer(victimId);
      const equipEntries: { card: Card; slot: EquipmentSlot }[] = [];
      const eq = { ...(czy.equipment ?? {}) };
      (Object.keys(eq) as EquipmentSlot[]).forEach(slot => {
        const c = eq[slot];
        if (c) equipEntries.push({ card: c, slot });
      });
      const handAvail = czy.hand;
      const allAvail: Card[] = [...handAvail, ...equipEntries.map(e => e.card)];
      if (v && v.hp < czy.hp && v.hp - finalAmount <= 1 && allAvail.length >= czy.hp) {
        const aiPick = handAvail.slice(0, czy.hp);
        // 人类玩家：从手牌与装备中自选至少 X 张交给受害者；AI / 托管：仍取自手牌前 X 张
        const pick = await requestSkillChoice({
          skill: '舍裔',
          owner: '蔡贞姬',
          title: `是否发动「舍裔」？将至少 ${czy.hp} 张牌交给 ${v.hero.name}，防止即将受到的 ${finalAmount} 点伤害`,
          hint: `可选牌 ${allAvail.length} 张（手牌 ${handAvail.length} / 装备 ${equipEntries.length}），至少交 ${czy.hp} 张`,
          mode: 'card',
          cards: allAvail,
          min: czy.hp,
          max: allAvail.length,
          cancelLabel: '不发动',
        }, czy.isHuman);
        const give = (!pick || pick.kind === 'timeout')
          ? aiPick
          : (pick.kind === 'card' ? allAvail.filter(c => pick.ids.includes(c.id)) : []);
        if (give.length === 0) return;
        sheyiUsedRef.current = true;
        const handGive = give.filter(c => handAvail.some(h => h.id === c.id));
        const equipGive = equipEntries.filter(e => give.some(c => c.id === e.card.id));
        mutateHand(czy.id, h => h.filter(c => !handGive.some(g => g.id === c.id)));
        if (equipGive.length > 0) {
          // 玩家选牌期间有 await，按槽位在实时装备区删除，避免覆盖期间的其他装备变动
          updatePlayerWith(czy.id, p => {
            const nextEq = { ...(p.equipment ?? {}) };
            for (const e of equipGive) delete nextEq[e.slot];
            return { equipment: nextEq };
          });
        }
        mutateHand(victimId, h => [...h, ...give]);
        addLog(`【舍裔】蔡贞姬将 ${give.length} 张牌交给 ${v.hero.name}（手牌 ${handGive.length} / 装备 ${equipGive.length}），防止此伤害${pick && pick.kind === 'card' ? '（玩家选择）' : '（自动）'}`, 'skill');
        showSkillBanner('蔡贞姬', '舍裔');
        await delay(300);
        return;
      }
    }

    // 寒冰剑：造成伤害时，可防止伤害并改为弃置目标两张牌
    if (damageCard?.name === CardName.SHA && source?.equipment?.weapon?.name === CardName.HANBING) {
      const v = getPlayer(victimId);
      // 仅在目标手牌不少于两张、且此伤害不致命时改为弃牌，避免误放过斩杀
      if (v && v.hand.length >= 2 && v.hp > finalAmount) {
        const cost = v.hand.slice(0, 2);
        discardCards(v.id, cost);
        addLog(`【寒冰剑】发动：防止伤害，改为弃置 ${v.hero.name} 的 ${cost.length} 张牌`, 'skill');
        await delay(300);
        return;
      }
    }

    // 小乔「天香」已迁移到 src/game/skills/migrated_abilities2.ts（damageBefore transferTo）

    // 铁索连环：属性伤害传导（同一波次内每个角色只传导一次，避免状态未提交时递归打回自己）
    let chainOthers: Player[] = [];
    if (dmgNature !== 'normal' && victim.isChained) {
      const wave = chainWaveRef.current ?? new Set<number>();
      if (!chainWaveRef.current) {
        chainWaveRef.current = wave;
        ownsChainWave = true;
      }
      wave.add(victimId);
      const chained = playersRef.current.filter(p => p.isChained && !p.isDead && !wave.has(p.id));
      if (chained.length > 0) {
        addLog(`🔗【铁索连环】传导！${natureLabel}伤害波及 ${chained.map(p => p.hero.name).join('、')}`, 'danger');
        chained.forEach(cp => {
          wave.add(cp.id);
          updatePlayer(cp.id, { isChained: false });
        });
        chainOthers = chained;
      }
    }

    setDamageAnimTarget(victimId);
    playSound('damage');
    setTimeout(() => setDamageAnimTarget(null), 500);

    victim = getPlayer(victimId)!;
    const newHp = victim.hp - finalAmount;

    // 立即更新玩家体力
    updatePlayer(victimId, { hp: newHp });
    addLog(`${victim.hero.name} 受到 ${finalAmount} 点${natureLabel}伤害！当前体力: ${newHp}/${victim.maxHp}`, 'danger');

    // 赵襄「芳魂」：使用【杀】造成伤害后，获得一个「梅影」标记
    if (sourceId !== victimId && damageCard?.name === CardName.SHA) {
      const zx = getPlayer(sourceId);
      if (zx && zx.hero.name === '赵襄' && skillsOn(sourceId)) {
        updatePlayer(sourceId, { meiyanMarks: (zx.meiyanMarks ?? 0) + 1 });
        addLog(`【芳魂】赵襄获得「梅影」标记（${(zx.meiyanMarks ?? 0) + 1} 枚）`, 'skill');
        showSkillBanner('赵襄', '芳魂');
      }
    }

    // 卑弥呼「骨疽」已迁移到 src/game/skills/migrated3.ts（afterDamage）

    // 陆郁生「霜怀」：距离 1 以内的其他角色受到伤害后，令其从弃牌堆获得一张【桃】；
    // 与上次目标相同则双方摸一张，不同则陆郁生失去 1 点体力
    if (!shuanghuaiUsedRef.current) {
      const lys = playersRef.current.find(p => !p.isDead && p.id !== victimId
        && p.hero.name === '陆郁生' && skillsOn(p.id) && getDistance(p.id, victimId) <= 1);
      const tao = discardPileRef.current.find(c => c.name === CardName.TAO);
      if (lys && tao) {
        shuanghuaiUsedRef.current = true;
        setDiscardPile(prev => {
          const next = prev.filter(c => c.id !== tao.id);
          discardPileRef.current = next;
          return next;
        });
        mutateHand(victimId, h => [...h, tao]);
        addLog(`【霜怀】陆郁生令 ${victim.hero.name} 从弃牌堆获得【桃】`, 'skill');
        showSkillBanner('陆郁生', '霜怀');
        await delay(300);
        if (lastShuanghuaiTargetRef.current === victimId) {
          drawCards(lys.id, 1);
          drawCards(victimId, 1);
          addLog('【霜怀】目标与上次相同，陆郁生与其各摸一张牌', 'skill');
        } else {
          lastShuanghuaiTargetRef.current = victimId;
          updatePlayer(lys.id, { hp: lys.hp - 1 });
          addLog(`【霜怀】目标与上次不同，陆郁生失去 1 点体力（${lys.hp - 1}/${lys.maxHp}）`, 'skill');
        }
        await delay(250);
      }
    }

    // 张琪瑛「真仪·勾陈」：受到属性伤害后，获得三种类型牌各一张
    const zqyVictim = getPlayer(victimId);
    if (zqyVictim && zqyVictim.hero.name === '张琪瑛' && skillsOn(victimId)
        && dmgNature !== 'normal' && hasZhangMark(zqyVictim, '勾陈')) {
      updatePlayer(victimId, { zhangMarks: (zqyVictim.zhangMarks ?? []).filter(m => m !== '勾陈') });
      addLog('【真仪·勾陈】张琪瑛受到属性伤害，弃置“勾陈”标记', 'skill');
      gainThreeTypes(victimId);
      await delay(400);
    }

    // 张昌蒲「抵诽」：受到伤害后摸或弃一张并展示手牌，若无伤害牌花色则回复1点体力
    const zcpVictim = getPlayer(victimId);
    if (zcpVictim && !zcpVictim.isDead && zcpVictim.hero.name === '张昌蒲' && skillsOn(victimId) && damageCard) {
      const aiDraw = zcpVictim.hand.length < zcpVictim.hp || zcpVictim.hand.length === 0;
      const suitDist = ['♥', '♦', '♠', '♣'].map(s => `${s}${zcpVictim.hand.filter(c => c.suit === s).length}`).join('  ');
      // 人类玩家：先看手牌花色分布，再决定发动方式 / 不发动；AI / 托管：沿用原自动策略
      const pick = await requestSkillChoice({
        skill: '抵诽',
        owner: '张昌蒲',
        title: `是否发动「抵诽」？伤害牌为 ${damageCard.suit}${damageCard.rank}【${damageCard.name}】`,
        hint: `你的手牌花色：${suitDist}；发动后展示手牌，若没有 ${damageCard.suit} 花色则回复 1 点体力`,
        mode: 'choose',
        choices: [
          { id: 'draw', label: '发动：摸一张牌' },
          ...(zcpVictim.hand.length > 0 ? [{ id: 'discard', label: '发动：弃置一张牌', desc: '自动弃点数最小的一张' }] : []),
          { id: 'skip', label: '不发动' },
        ],
        cancelLabel: '不发动',
      }, zcpVictim.isHuman);
      const act = (!pick || pick.kind === 'timeout')
        ? (aiDraw ? 'draw' : 'discard')
        : (pick.kind === 'choose' ? pick.id : 'skip');
      if (act === 'skip') {
        addLog('【抵诽】张昌蒲放弃发动', 'info');
      } else {
        let playerDecided = pick?.kind === 'choose';
        if (act === 'draw') {
          drawCards(victimId, 1);
        } else {
          let chosenCard: Card | undefined;
          const handNow = getPlayer(victimId)?.hand ?? [];
          if (zcpVictim.isHuman && !isAiTakeover) {
            const cardPick = await requestSkillChoice({
              skill: '抵诽',
              owner: '张昌蒲',
              title: '「抵诽」：选择弃置一张手牌',
              mode: 'card',
              cards: handNow,
              min: 1,
              max: 1,
              cancelLabel: '自动弃置点数最小的一张',
            }, true);
            if (cardPick && cardPick.kind === 'card' && cardPick.ids.length === 1) {
              chosenCard = handNow.find(c => c.id === cardPick.ids[0]);
            }
            playerDecided = !!chosenCard;
          }
          const low = chosenCard ?? [...zcpVictim.hand].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
          discardCards(victimId, [low]);
        }
        await delay(0);
        const handForLog = getPlayer(victimId)?.hand ?? [];
        const shown = handForLog.map(c => `【${c.name}】`).join('');
        addLog(`【抵诽】张昌蒲${act === 'draw' ? '摸一张牌' : '弃置一张牌'}，展示手牌：${shown || '（无）'}${playerDecided ? '（玩家选择）' : '（自动）'}`, 'skill');
        showSkillBanner('张昌蒲', '抵诽');
        const zcpAfter = getPlayer(victimId);
        if (zcpAfter && !zcpAfter.isDead && !handForLog.some(c => c.suit === damageCard.suit)) {
          recoverHp(victimId, 1);
          addLog(`【抵诽】张昌蒲手牌均无${damageCard.suit}花色，回复1点体力`, 'skill');
        }
      }
      await delay(300);
    }

    // 郭皇后「殚心」：受到伤害后，摸一张牌或升级「矫诏」（最多升级两次）
    if (victim.hero.name === '郭皇后' && skillsOn(victimId)) {
      const curLevel = guohuanghouLevelRef.current[victimId] ?? 1;
      if (curLevel < 3) {
        guohuanghouLevelRef.current[victimId] = curLevel + 1;
        if (victimId === 0) setGuohuanghouLevel(curLevel + 1);
        addLog(`郭皇后发动「殚心」，「矫诏」提升至 Lv${curLevel + 1}`, 'skill');
      } else {
        drawCards(victimId, 1);
        addLog('郭皇后发动「殚心」，摸一张牌', 'skill');
      }
      showSkillBanner('郭皇后', '殚心');
    }

    // 技能注册表：受伤后 / 造成伤害后（新技能只需注册 afterDamage / afterDealDamage）
    {
      const victimNow = getPlayer(victimId);
      const srcNow = sourceId >= 0 ? getPlayer(sourceId) : undefined;
      if (victimNow) {
        const ev = {
          victim: victimNow,
          source: srcNow,
          amount: finalAmount,
          nature: (dmgNature === 'fire' || dmgNature === 'thunder' ? dmgNature : 'normal') as 'normal' | 'fire' | 'thunder',
          card: damageCard,
        };
        await dispatchAfterDamage({
          ...skillDeps(),
        }, ev);
        await dispatchAfterDealDamage({
          ...skillDeps(),
        }, ev);
      }
    }
    // 关银屏「虎啸」已迁移到 src/game/skills/migrated1.ts（afterDealDamage）

    // 唐姬「抗歌」②：守护对象进入濒死时，唐姬可令其将体力回复至 1 点（每轮限一次）
    {
      const victimNow = getPlayer(victimId);
      if (victimNow && victimNow.hp <= 0) {
        const tj = playersRef.current.find(x => !x.isDead && x.hero.name === '唐姬'
          && skillsOn(x.id) && x.kanggeTargetId === victimId && x.id !== victimId);
        if (tj && !kanggeRescueRef.current.has(tj.id)) {
          kanggeRescueRef.current.add(tj.id);
          updatePlayer(victimId, { hp: 1 });
          addLog(`【抗歌】唐姬守护 ${victimNow.hero.name}，令其将体力回复至 1 点`, 'skill');
          showSkillBanner('唐姬', '抗歌');
          await delay(400);
        }
      }
    }

    // 袁姬「芳妒」（锁定技）：回合外本回合第一次受到伤害后，
    // 普通伤害回复 1 点体力；属性伤害随机获得伤害来源一张手牌
    {
      const yj = getPlayer(victimId);
      if (yj && yj.hero.name === '袁姬' && skillsOn(victimId) && sourceId >= 0 && sourceId !== victimId
          && turnOwnerIdRef.current !== victimId) {
        const key = `fangdu-${victimId}-${turnCountRef.current}`;
        if (!fangduUsedRef.current.has(key)) {
          fangduUsedRef.current.add(key);
          if (fangduEffect(dmgNature) === 'heal') {
            recoverHp(victimId, 1);
            addLog(`【芳妒】袁姬于回合外首次受到普通伤害，回复 1 点体力`, 'skill');
          } else {
            const attacker = getPlayer(sourceId);
            if (attacker && attacker.hand.length > 0) {
              const got = attacker.hand[Math.floor(Math.random() * attacker.hand.length)];
              mutateHand(sourceId, h => h.filter(c => c.id !== got.id));
              mutateHand(victimId, h => [...h, got]);
              addLog(`【芳妒】袁姬受到属性伤害，获得 ${attacker.hero.name} 的【${got.name}】`, 'skill');
            } else {
              addLog('【芳妒】袁姬受到属性伤害，但伤害来源没有手牌', 'info');
            }
          }
          showSkillBanner('袁姬', '芳妒');
        }
      }
    }

    // 孙翎鸾「聆乐」（锁定技）：一名角色造成其本轮的第一次伤害后，孙翎鸾摸一张
    {
      const sl = playersRef.current.find(x => !x.isDead && x.hero.name === '孙翎鸾' && skillsOn(x.id));
      if (sl && sourceId >= 0 && sl.id !== sourceId) {
        const key = `lingle-${sourceId}-${turnCountRef.current}`;
        if (!lingleUsedRef.current.has(key)) {
          lingleUsedRef.current.add(key);
          drawCards(sl.id, 1);
          addLog(`【聆乐】孙翎鸾在 ${source?.hero.name ?? '某角色'} 造成本轮首次伤害后摸一张牌`, 'skill');
          showSkillBanner('孙翎鸾', '聆乐');
        }
      }
    }

    // 郭嘉「遗计」/ 司马懿「反馈」已迁移到 src/game/skills/migrated1.ts（afterDamage）

    // 蔡文姬「悲歌」/ 祝融「烈刃」：伤害后触发
    await triggerBeige(victimId, sourceId, damageCard);
    if ((getPlayer(victimId)?.hp ?? 0) > 0) {
      await triggerLieren(victimId, sourceId, damageCard);
    }

    // 麒麟弓：造成伤害后，可弃置目标一匹坐骑
    if (damageCard?.name === CardName.SHA && source?.equipment?.weapon?.name === CardName.QILIN) {
      const v = getPlayer(victimId);
      const slot = v?.equipment?.horsePlus ? 'horsePlus' as const : v?.equipment?.horseMinus ? 'horseMinus' as const : null;
      if (v && slot) {
        const horse = v.equipment![slot]!;
        updatePlayerWith(victimId, p => {
          const nextEquip = { ...(p.equipment ?? {}) };
          delete nextEquip[slot];
          return { equipment: nextEquip };
        });
        setDiscardPile(prev => {
          const next = [...prev, horse];
          discardPileRef.current = next;
          return next;
        });
        triggerXiaoji(victimId, horse);
        addLog(`${source.hero.name} 的【麒麟弓】射落了 ${v.hero.name} 的【${horse.name}】`, 'skill');
      }
    }

    // 身份推理：攻击主公者视为反贼；击杀已亮明反贼者视为忠臣
    if (sourceId !== victimId) {
      if (victim.identity === Identity.ZHUGONG) {
        identityGuessRef.current[sourceId] = Identity.FANZEI;
      } else if (victim.isRevealed && victim.identity === Identity.FANZEI) {
        const srcRole = getPlayer(sourceId)?.identity;
        if (srcRole !== Identity.FANZEI) identityGuessRef.current[sourceId] = Identity.ZHONGCHEN;
      }
    }

    // 曹操的「奸雄」技能：受到伤害后，你可以获得造成伤害的牌（曹婴「凌人」可临时获得）
    if ((victim.hero.name === '曹操' || victim.hasJianxiong) && damageCard) {
      const me = getPlayer(victimId);
      const alreadyHas = !!me?.hand.some(c => c.id === damageCard.id);
      // 同一张牌不能在「手牌 + 弃牌堆」同时存在，否则洗回牌堆后会出现重复卡（React 也会报重复 key）
      setDiscardPile(prev => {
        const next = prev.filter(c => c.id !== damageCard.id);
        discardPileRef.current = next;
        return next;
      });
      if (me && !alreadyHas) {
        mutateHand(victimId, hand => [...hand, damageCard]);
        addLog(`${victim.hero.name} 使用技能「奸雄」，获得了【${damageCard.name}】！`, 'skill');
        showSkillBanner(victim.hero.name, '奸雄');
      } else {
        addLog(`${victim.hero.name} 的「奸雄」发动，但【${damageCard.name}】已在其手牌中`, 'info');
      }
    }

    // 羊徽瑜「劝封」：处于濒死状态时，可加2点体力上限并回复4点体力（限定技）
    const hyDying = getPlayer(victimId);
    if (hyDying && hyDying.hero.name === '羊徽瑜' && skillsOn(victimId) && !hyDying.quanfengUsed && newHp <= 0) {
      // 人类玩家：决定是否发动限定技；AI / 托管：照旧直接发动
      const pick = await requestSkillChoice({
        skill: '劝封',
        owner: '羊徽瑜',
        title: '你处于濒死状态，是否发动限定技「劝封」自救？',
        hint: '体力上限 +2 并回复 4 点体力；不发动则继续求桃，可能阵亡',
        mode: 'choose',
        choices: [{ id: 'yes', label: '发动' }, { id: 'no', label: '不发动' }],
        cancelLabel: '不发动',
      }, hyDying.isHuman);
      const go = (!pick || pick.kind === 'timeout') ? true : (pick.kind === 'choose' ? pick.id === 'yes' : false);
      if (go) {
        const newMax = hyDying.maxHp + 2;
        const healed = Math.min(newMax, Math.max(0, hyDying.hp) + 4);
        updatePlayer(victimId, { maxHp: newMax, hp: healed, quanfengUsed: true });
        addLog(`【劝封】羊徽瑜加2点体力上限并回复4点体力（${healed}/${newMax}）${pick && pick.kind === 'choose' ? '（玩家选择）' : '（自动）'}`, 'skill');
        showSkillBanner('羊徽瑜', '劝封');
        await delay(400);
      } else {
        addLog('【劝封】羊徽瑜放弃发动，继续濒死结算', 'info');
      }
    }

    // 当体力值小于等于0时，进入濒死状态
    if ((getPlayer(victimId)?.hp ?? 0) <= 0) {
      addLog(`${victim.hero.name} 进入濒死状态，需要求桃！`, 'danger');
      // 进入濒死状态，开始求桃
      const isSaved = await askForPeaches(victimId);
      if (!isSaved) {
        addLog(`${victim.hero.name} 未能得到救援，死亡！`, 'danger');
        await handleDeath(victimId, sourceId);
      }
    }

    // 夏侯惇「刚烈」：受到伤害后判定，非红桃则伤害来源失去 1 点体力
    const survivor = getPlayer(victimId);
    if (victim.hero.name === '夏侯惇' && sourceId !== victimId && survivor && !survivor.isDead) {
      const jc = await performJudgment(victimId, '刚烈');
      if (jc && jc.suit !== Suit.HEART) {
        const attacker = getPlayer(sourceId);
        if (attacker && !attacker.isDead) {
          const attackerHp = attacker.hp - 1;
          updatePlayer(sourceId, { hp: attackerHp });
          addLog(`${victim.hero.name} 发动「刚烈」，${attacker.hero.name} 失去 1 点体力（${attackerHp}/${attacker.maxHp}）`, 'skill');
          showSkillBanner(victim.hero.name, '刚烈');
          if (attackerHp <= 0) {
            const saved = await askForPeaches(sourceId);
            if (!saved) await handleDeath(sourceId, victimId);
          }
        }
      } else {
        addLog(`「刚烈」判定为红桃，未能反伤`, 'info');
      }
    }

    // 铁索连环传导：结算完当前目标后，依次传导给其他横置角色
    for (const cp of chainOthers) {
      if (getPlayer(cp.id)?.isDead) continue;
      // 每次传导让出一次宏任务，确保此前的 hp / isChained 更新已提交
      await delay(250);
      await takeDamage(cp.id, sourceId, amount, damageCard, dmgNature === 'normal' ? undefined : dmgNature);
    }
  } finally {
    if (ownsChainWave) chainWaveRef.current = null;
    setIsProcessing(p => Math.max(0, p - 1));
  }
}

  // ── triggerZhennan（App.tsx 原 L8403-8416）──
  const triggerZhennan = async (source: Player, finalTargets: Player[], card: Card) => {
  if (finalTargets.length <= 1) return;
  const bao = finalTargets.find(t => t.hero.name === '鲍三娘' && t.id !== source.id && skillsOn(t.id) && !t.isDead);
  const srcNow = getPlayer(source.id);
  if (!bao || !srcNow || srcNow.isDead) return;
  if (finalTargets.length <= srcNow.hp) return;
  if (bao.hand.length === 0) return;
  const cost = [...bao.hand].sort((a, b) => a.value - b.value)[0];
  discardCards(bao.id, [cost]);
  addLog(`【镇南】鲍三娘弃置【${cost.name}】，对 ${srcNow.hero.name} 造成 1 点伤害（目标 ${finalTargets.length} > 体力 ${srcNow.hp}）`, 'skill');
  showSkillBanner('鲍三娘', '镇南');
  await delay(300);
  await takeDamage(srcNow.id, bao.id, 1, card);
}

  return {
    resolveCardEffect,
    resolveWuxieChain,
    triggerReaction,
    askForPeaches,
    takeDamage,
    triggerZhennan,
  };
};