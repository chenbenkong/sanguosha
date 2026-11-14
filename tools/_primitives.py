import io

EDITS = []
def rep(path, old, new):
    EDITS.append((path, old, new))

REG = 'src/game/skills/registry.ts'
DIS = 'src/game/skills/dispatch.ts'
COM = 'src/game/combat.ts'
APP = 'App.tsx'

# ═══════════ registry.ts ═══════════
rep(REG, `/** 技能可用的上下文：引擎注入，技能作者只读/通过它施加效果 */
export interface SkillContext {`,
`/**
 * 「视为使用一张牌」的可选项。
 *
 * 为什么这必须是引擎原语，而不是用 ctx.damage 近似：一张牌的完整结算包含
 * 无懈可击、【闪】/【杀】响应、防具与距离、结算前修正。用伤害近似会跳过
 * 【闪】与八卦阵/仁王盾 —— 那是规则错误，不是「实现不完整」。
 */
export interface UseCardAsOptions {
  /** 由谁使用；默认技能拥有者本人。日彗要令每个「信众」持有者各自使用此牌，用它指定他人。 */
  asPlayerId?: number;
  /** 属性（马伶俐「花火」的火【杀】） */
  attribute?: 'fire' | 'thunder';
  /** 无距离限制 */
  ignoreDistance?: boolean;
  /** 此牌不可被响应（黄舞蝶「双锐」） */
  noResponse?: boolean;
  /** 此牌造成的伤害 +N（黄舞蝶「双锐」） */
  damageBonus?: number;
  /** 战报与牌面描述 */
  reason?: string;
}

/** 技能可用的上下文：引擎注入，技能作者只读/通过它施加效果 */
export interface SkillContext {`)

rep(REG, `  /** 列出本人所有标记（UI / 日志用） */
  marks: (ofPlayerId?: number) => Record<string, number>;
}`,
`  /** 列出本人所有标记（UI / 日志用） */
  marks: (ofPlayerId?: number) => Record<string, number>;
  /**
   * 「视为使用一张牌」的通用入口（灵慧 / 锦绘 / 花火 / 双锐 / ☆ 狩星 / 纫霜 /
   * 酖毒 / 日彗 / 风影 / 枕戈 / 狷急②）。
   *
   * card 传 Card 时按这张牌的牌名与花色点数结算（风影把一张手牌当黑色锦囊、
   * 日彗把原牌再对其他人使用一遍）；传 CardName 时引擎合成一张虚拟牌。
   * 牌**不会**从任何人手里被移走 —— 需要真正弃掉或交出的牌，
   * 由技能自己先用 ctx.discard / ctx.gainCard 处理。
   *
   * 返回 false 表示使用者已阵亡，或给定的目标全部已阵亡（此时没有发生任何结算）。
   */
  useCardAs: (
    card: Card | CardName,
    targetIds: number[],
    opts?: UseCardAsOptions,
  ) => Promise<boolean>;
  /**
   * 授予技能（妆戎 → ☆ 神威/☆ 无双、双锐 → ☆ 狩星、殇决 → ☆ 困励、化萍）。
   * durationTurns 省略表示永久；返回 false 表示对方已阵亡或已拥有该技能。
   */
  grantSkill: (skillName: string, toPlayerId?: number, durationTurns?: number) => boolean;
  /** 收回技能（离宫失去慧淑/易数、伏械「失去一个其他技能」）。 */
  revokeSkill: (skillName: string, ofPlayerId?: number, reason?: string) => boolean;
  hasGrantedSkill: (skillName: string, ofPlayerId?: number) => boolean;
  /**
   * 当前轮数，从 1 开始。
   *
   * 「每轮首次」类技能（幸宠 / 纫霜 / 落宠 / 归离）用它去重。
   * 不能用 onTurnStart 顶替 —— 那是「每回合」，一轮里有几个回合就会多发动几次。
   */
  roundCount: number;
}`)

rep(REG, `  onDying?: (ctx: SkillContext, ev: DyingEvent) => DyingResult | null | void | Promise<DyingResult | null | void>;
}`,
`  onDying?: (ctx: SkillContext, ev: DyingEvent) => DyingResult | null | void | Promise<DyingResult | null | void>;
  /**
   * 新一轮开始时（座位号回绕；落宠 / 幸宠 / 归离 / 哀尘）。
   * 「每轮首次」用 ctx.roundCount 去重。
   */
  onRoundStart?: (ctx: SkillContext, round: number) => Promise<void> | void;
  /** 出牌阶段开始时（帼武 / 铃音 / ☆ 狩星 / 狷急②）。被【乐不思蜀】跳过时不派发。 */
  onPlayPhaseBegin?: (ctx: SkillContext) => Promise<void> | void;
  /** 出牌阶段结束时（酖毒）。每回合至多派发一次。 */
  onPlayPhaseEnd?: (ctx: SkillContext) => Promise<void> | void;
}`)

# ═══════════ dispatch.ts ═══════════
rep(DIS, `  DeathEvent, DyingEvent, DyingResult, CardTargetsEvent, CardGainEvent,
} from './registry';`,
`  DeathEvent, DyingEvent, DyingResult, CardTargetsEvent, CardGainEvent, UseCardAsOptions,
} from './registry';`)

rep(DIS, `import type { Card, Player } from '../../../types';`,
`import type { Card, CardName, Player } from '../../../types';`)

rep(DIS, `  cancelLabel?: string;
  }) => Promise<{ kind: string; id?: string; ids?: Array<string | number> } | null>;
}`,
`  cancelLabel?: string;
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
}`)

rep(DIS, `    hint: req.hint ?? \`\${hero} 的「\${skill}」\`,
  }),
});`,
`    hint: req.hint ?? \`\${hero} 的「\${skill}」\`,
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
});`)

rep(DIS, `/** 回合开始 */
export const dispatchTurnStart = async (deps: DispatchDeps, owner: Player): Promise<void> => {
  for (const { def, fn } of skillHook('onTurnStart')) {
    for (const self of ownersOf(deps, def.hero)) {
      await fn(ctxFor(deps, self, def.hero, def.skill), owner);
    }
  }
};`,
`/** 回合开始 */
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

/** 出牌阶段开始（只对该阶段的回合角色派发） */
export const dispatchPlayPhaseBegin = async (deps: DispatchDeps, ownerId: number): Promise<void> => {
  for (const { def, fn } of skillHook('onPlayPhaseBegin')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== ownerId) continue;
      await fn(ctxFor(deps, self, def.hero, def.skill));
    }
  }
};

/** 出牌阶段结束（含被【乐不思蜀】跳过之外的所有出口，见 App.tsx 的 playPhaseOpenRef） */
export const dispatchPlayPhaseEnd = async (deps: DispatchDeps, ownerId: number): Promise<void> => {
  for (const { def, fn } of skillHook('onPlayPhaseEnd')) {
    for (const self of ownersOf(deps, def.hero)) {
      if (self.id !== ownerId) continue;
      await fn(ctxFor(deps, self, def.hero, def.skill));
    }
  }
};`)

# ═══════════ combat.ts ═══════════
rep(COM, `import type { DispatchDeps } from './skills/dispatch';`,
`import type { DispatchDeps } from './skills/dispatch';
import type { UseCardAsOptions } from './skills/registry';`)

rep(COM, `  hasGrantedSkill: (p: Player, skillName: string) => boolean;`,
`  hasGrantedSkill: (p: Player, skillName: string) => boolean;
  /** 授予技能（ctx.grantSkill 的引擎侧实现；App 侧负责写回 grantedSkills） */
  grantSkillById: (id: number, skillName: string, sourceSkill: string, durationTurns?: number) => boolean;
  /** 收回技能（ctx.revokeSkill 的引擎侧实现） */
  revokeSkillById: (id: number, skillName: string, reason: string) => boolean;
  /** 当前轮数（从 1 开始）；「每轮首次」类技能用它去重 */
  roundCountRef: React.RefObject<number>;`)

rep(COM, `export interface CombatEngine {
  resolveCardEffect: (source: Player, targets: Player[], card: Card) => Promise<void>;`,
`export interface CombatEngine {
  resolveCardEffect: (source: Player, targets: Player[], card: Card) => Promise<void>;
  /**
   * 「视为使用一张牌」：走完整结算（无懈 / 响应 / 防具 / 伤害）。
   * 技能侧的入口是 ctx.useCardAs。
   */
  useCardAs: (
    playerId: number,
    card: Card | CardName,
    targetIds: number[],
    opts?: UseCardAsOptions,
  ) => Promise<boolean>;`)

rep(COM, `    hasGrantedSkill,
    hasWeimu,`,
`    hasGrantedSkill,
    grantSkillById,
    revokeSkillById,
    roundCountRef,
    hasWeimu,`)

USE = `/**
 * 虚拟牌的牌面修正（「不可被响应」/「伤害 +N」）。
 *
 * 按**牌 id** 挂载：这两项是「这一张牌」的属性，不是使用者的属性 ——
 * 双锐的【杀】不可被响应，同一角色下一张普通的【杀】不受影响。
 * 用牌 id 做键的既有先例是马云禄「凤魄」的 fengpoBoostRef。
 */
const cardMods = new Map<string, { noResponse?: boolean; damageBonus?: number }>();

/** 虚拟牌的自增序号：同一毫秒内连发两张同名虚拟牌时也要能区分 */
let virtualCardSeq = 0;

/**
 * 「视为使用一张牌」。
 *
 * 走完整的 resolveCardEffect：无懈可击、【闪】/【杀】响应、防具与距离、
 * 结算前修正（含 onTargetsChosen 的目标合法性否决）全都在里面。
 * 这就是它必须是引擎原语的原因：用 ctx.damage 近似会跳过【闪】与八卦阵/仁王盾。
 */
const useCardAs = async (
  playerId: number,
  cardIn: Card | CardName,
  targetIds: number[],
  opts: UseCardAsOptions = {},
): Promise<boolean> => {
  const actor = getPlayer(playerId);
  if (!actor || actor.isDead) return false;
  const targets = targetIds
    .map(id => getPlayer(id))
    .filter((x): x is Player => !!x && !x.isDead);
  // 目标全都不在场时不能退化成「对自己使用」—— 那会把「对他人使用【杀】」变成自杀
  if (targetIds.length > 0 && targets.length === 0) return false;

  let card: Card;
  if (typeof cardIn === 'string') {
    virtualCardSeq += 1;
    const isBasic = cardIn === CardName.SHA || cardIn === CardName.SHAN
      || cardIn === CardName.TAO || cardIn === CardName.JIU;
    card = {
      id: 'virtual-' + cardIn + '-' + playerId + '-' + virtualCardSeq,
      name: cardIn,
      type: isBasic ? CardType.BASIC : CardType.SCROLL,
      suit: Suit.SPADE,
      rank: 'K',
      value: 13,
      attribute: opts.attribute,
      description: opts.reason || ('视为使用【' + cardIn + '】'),
      imageColor: 'from-slate-700 to-slate-900',
    };
  } else {
    // 传牌时沿用牌名 / 花色 / 点数，但换一个 id 结算：原牌可能还在某人手里
    // （日彗要把同一张牌再对其他人使用一遍），沿用原 id 会让按牌 id 去重的
    // 结算链（dispatchCardUsed / dispatchCardGain 的 withGuard）误判成重复。
    virtualCardSeq += 1;
    card = {
      ...cardIn,
      id: cardIn.id + '#virtual-' + virtualCardSeq,
      attribute: opts.attribute ?? cardIn.attribute,
      description: opts.reason || ('视为使用【' + cardIn.name + '】'),
    };
  }

  if (opts.noResponse || opts.damageBonus) {
    cardMods.set(card.id, { noResponse: opts.noResponse, damageBonus: opts.damageBonus });
  }
  addLog(
    '【虚拟牌】' + actor.hero.name + ' 视为使用'
    + (opts.ignoreDistance ? '无距离限制的' : '') + '【' + card.name + '】'
    + (targets.length ? ' → ' + targets.map(t => t.hero.name).join('、') : '')
    + (opts.reason ? '（' + opts.reason + '）' : ''),
    'skill',
  );
  try {
    await resolveCardEffect(actor, targets.length ? targets : [actor], card);
  } finally {
    cardMods.delete(card.id);
  }
  return true;
};

`;

rep(COM, `const skillDeps = (): DispatchDeps => ({`,
USE + `const skillDeps = (): DispatchDeps => ({`)

rep(COM, `    updatePlayer(pid, { maxHp: nextMax, hp: Math.min(nextMax, Math.max(0, p.hp)) });
  },
});`,
`    updatePlayer(pid, { maxHp: nextMax, hp: Math.min(nextMax, Math.max(0, p.hp)) });
  },
  // ── 第六批能力：视为使用牌 / 技能授予 / 轮数 ──
  roundCount: roundCountRef.current,
  useCardAs: (pid: number, cardIn: Card | CardName, targetIds: number[], opts?: UseCardAsOptions) =>
    useCardAs(pid, cardIn, targetIds, opts),
  grantSkill: (pid: number, skillName: string, sourceSkill: string, durationTurns?: number) =>
    deps.grantSkillById(pid, skillName, sourceSkill, durationTurns),
  revokeSkill: (pid: number, skillName: string, reason: string) =>
    deps.revokeSkillById(pid, skillName, reason),
  hasGrantedSkill: (pid: number, skillName: string) => {
    const p = playersRef.current.find(x => x.id === pid);
    return !!p && deps.hasGrantedSkill(p, skillName);
  },
});`)

rep(COM, `          await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
          continue;
        }

        const hpBefore = getPlayer(effectiveTarget.id)?.hp ?? 0;`,
`          await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
          continue;
        }

        // 虚拟牌的「不可被响应」（黄舞蝶「双锐」：目标在攻击范围外时此【杀】不可被响应）
        if (cardMods.get(slashCard.id)?.noResponse) {
          addLog('【' + slashCard.name + '】不可被响应：' + effectiveTarget.hero.name + ' 无法出【闪】', 'skill');
          await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
          continue;
        }

        const hpBefore = getPlayer(effectiveTarget.id)?.hp ?? 0;`)

rep(COM, `      finalAmount += bonus;
      addLog(\`【凤魄】伤害 +\${bonus}\`, 'danger');
    }`,
`      finalAmount += bonus;
      addLog(\`【凤魄】伤害 +\${bonus}\`, 'danger');
    }

    // 虚拟牌的「伤害 +N」（双锐：目标在攻击范围内时伤害 +1）。
    // 与「凤魄」同样按牌 id 一次性结算，避免多目标牌重复加成。
    if (damageCard) {
      const vmod = cardMods.get(damageCard.id);
      if (vmod?.damageBonus) {
        const bonus = vmod.damageBonus;
        vmod.damageBonus = undefined;
        finalAmount += bonus;
        addLog('虚拟牌伤害 +' + bonus, 'danger');
      }
    }`)

rep(COM, `    askForPeaches,
    takeDamage,
    triggerZhennan,
  };`,
`    askForPeaches,
    takeDamage,
    triggerZhennan,
    useCardAs,
  };`)

# ═══════════ App.tsx ═══════════
rep(APP, `import { dispatchTurnEnd, dispatchTurnStart, dispatchJudge, dispatchDrawBonus, dispatchHandLimitBonus, dispatchExemptHandCards, dispatchJudgeBefore, dispatchDrawPhaseBegin, dispatchDiscardPhaseSkip, dispatchCardLost, dispatchDeath, dispatchCardGain } from './src/game/skills/dispatch';`,
`import { dispatchTurnEnd, dispatchTurnStart, dispatchJudge, dispatchDrawBonus, dispatchHandLimitBonus, dispatchExemptHandCards, dispatchJudgeBefore, dispatchDrawPhaseBegin, dispatchDiscardPhaseSkip, dispatchCardLost, dispatchDeath, dispatchCardGain, dispatchRoundStart, dispatchPlayPhaseBegin, dispatchPlayPhaseEnd } from './src/game/skills/dispatch';
import type { DispatchDeps } from './src/game/skills/dispatch';`)

rep(APP, `  const turnCountRef = useRef<number>(0); // 全局回合计数（用于暗置解封）`,
`  const turnCountRef = useRef<number>(0); // 全局回合计数（用于暗置解封）
  // 轮数（座位号回绕时 +1，从 1 开始）。「每轮首次」类技能（幸宠 / 纫霜 / 落宠）用它去重
  const roundCountRef = useRef<number>(1);
  // 出牌阶段是否已经开始（值是该阶段的回合角色 id）。
  // 出牌阶段的出口有多条（自然结束 / 托管 / 中途阵亡），用「进入下一个阶段」这一处
  // 统一派发 onPlayPhaseEnd，比在每个出口各写一遍可靠。
  const playPhaseOpenRef = useRef<number | null>(null);`)

rep(APP, `  const buildSkillDeps = () => ({`,
`  // 显式标注返回类型：漏掉任何一个 DispatchDeps 字段都会在这里编译期报错，
  // 而不是等运行时退化成空桩（邓晚棠「黛颊」就是这样坏了半个赛季的）。
  const buildSkillDeps = (): DispatchDeps => ({`)

rep(APP, `    }, !isAiTakeoverRef.current),
  });

  const excessCards = (p: Player) => {`,
`    }, !isAiTakeoverRef.current),
    // ── 第六批能力：视为使用牌 / 技能授予 / 轮数 ──
    useCardAs: async (pid, cardIn, targetIds, opts) => {
      if (!combatEngine) return false;
      return combatEngine.useCardAs(pid, cardIn, targetIds, opts);
    },
    grantSkill: (pid, skillName, sourceSkill, durationTurns) =>
      grantSkill(pid, skillName, sourceSkill, durationTurns),
    revokeSkill: (pid, skillName, reason) => revokeSkill(pid, skillName, reason),
    hasGrantedSkill: (pid, skillName) => {
      const p = playersRef.current.find(x => x.id === pid);
      return !!p && hasGrantedSkill(p, skillName);
    },
    roundCount: roundCountRef.current,
  });

  const excessCards = (p: Player) => {`)

rep(APP, `      hasGrantedSkill,
      hasWeimu,`,
`      hasGrantedSkill,
      grantSkillById: grantSkill,
      revokeSkillById: (id: number, skillName: string, reason: string) => revokeSkill(id, skillName, reason),
      roundCountRef,
      hasWeimu,`)

rep(APP, `    triggerZhennan: (source, finalTargets, card) => getCombatEngine().triggerZhennan(source, finalTargets, card),
  };`,
`    triggerZhennan: (source, finalTargets, card) => getCombatEngine().triggerZhennan(source, finalTargets, card),
    useCardAs: (playerId, card, targetIds, opts) => getCombatEngine().useCardAs(playerId, card, targetIds, opts),
  };`)

rep(APP, `          // 通用：他人回合开始的技能 / 虚拟牌钩子
          await runTurnStartHooks(currentPlayer);`,
`          // 通用：他人回合开始的技能 / 虚拟牌钩子
          await runTurnStartHooks(currentPlayer);
          {
            // 轮次信号：座位号回绕即新的一轮（与下方「卑弥呼·纵傀」用的是同一判据）。
            // 放在 onTurnStart 之前 —— 「每轮开始」在语义上早于「回合开始」。
            const isNewRound = roundLastTurnRef.current !== null && currentPlayer.id < roundLastTurnRef.current;
            if (isNewRound) roundCountRef.current += 1;
            await dispatchRoundStart({ ...buildSkillDeps(), turnOwner: currentPlayer }, roundCountRef.current);
            // 上一回合若死在出牌阶段中途，onPlayPhaseEnd 还没派发过，这里补一次
            if (playPhaseOpenRef.current !== null) {
              const strayOwner = playPhaseOpenRef.current;
              playPhaseOpenRef.current = null;
              await dispatchPlayPhaseEnd(buildSkillDeps(), strayOwner);
            }
          }`)

rep(APP, `          addLog(\`\${currentPlayer.hero.name} 受【乐不思蜀】影响，跳过出牌阶段！\`, 'warning');
          await delay(600);
          setPhase(GamePhase.DISCARD);
          return;
        }`,
`          addLog(\`\${currentPlayer.hero.name} 受【乐不思蜀】影响，跳过出牌阶段！\`, 'warning');
          await delay(600);
          setPhase(GamePhase.DISCARD);
          return;
        }
        // 出牌阶段开始（帼武 / 铃音 / ☆ 狩星 / 狷急②）。主循环对「同一回合 + 阶段」
        // 有 turnStepRef 去重，所以这里每回合只跑一次；真正被跳过的情形在上面提前
        // return 了，不会误报「开始」。
        if (playPhaseOpenRef.current === null) {
          playPhaseOpenRef.current = currentPlayer.id;
          await dispatchPlayPhaseBegin(buildSkillDeps(), currentPlayer.id);
        }`)

rep(APP, `      else if (currentPhase === GamePhase.DISCARD) {
        // 更新ref中的最新状态
        playersRef.current = players;`,
`      else if (currentPhase === GamePhase.DISCARD) {
        // 出牌阶段结束（酖毒）
        if (playPhaseOpenRef.current !== null) {
          const playOwner = playPhaseOpenRef.current;
          playPhaseOpenRef.current = null;
          await dispatchPlayPhaseEnd(buildSkillDeps(), playOwner);
        }
        // 更新ref中的最新状态
        playersRef.current = players;`)

rep(APP, `      else if (currentPhase === GamePhase.END) {
        dbgMark('end:enter');`,
`      else if (currentPhase === GamePhase.END) {
        // 出牌阶段结束（从出牌阶段直接跳到结束阶段的情形：阵亡 / 借刀等）
        if (playPhaseOpenRef.current !== null) {
          const playOwner = playPhaseOpenRef.current;
          playPhaseOpenRef.current = null;
          await dispatchPlayPhaseEnd(buildSkillDeps(), playOwner);
        }
        dbgMark('end:enter');`)

# ── 两阶段提交：全部锚点命中才写盘 ──
cache = {}
for path, old, new in EDITS:
    if path not in cache:
        cache[path] = io.open(path, 'r', encoding='utf-8', newline='').read()
    s = cache[path]
    crlf = '\r\n' in s
    t = s.replace('\r\n', '\n')
    n = t.count(old)
    if n != 1:
        raise SystemExit('BAD ANCHOR in ' + path + ' count=' + str(n) + ' :: ' + repr(old[:80]))
    t2 = t.replace(old, new)
    cache[path] = (t2.replace('\n', '\r\n') if crlf else t2)
    print('OK  ' + path + '  ' + old.strip().split(chr(10))[0][:64])

for path, content in cache.items():
    io.open(path, 'w', encoding='utf-8', newline='').write(content)
print('WROTE', list(cache.keys()))
