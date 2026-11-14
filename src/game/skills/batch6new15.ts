import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';
import { CardName } from '../../../types';
import type { Player } from '../../../types';

/**
 * 第六批女将 · 第 15 组：黄舞蝶「双锐」「☆ 狩星」、万年公主「枕戈」「兴汉」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   双锐    准备阶段，你可以视为对一名其他角色使用一张无距离限制的【杀】。
 *           若其在你攻击范围外/攻击范围内，此【杀】不可被响应/造成的伤害+1，
 *           你本回合获得技能“狩星”/“铩雪”。
 *   ☆ 狩星  出牌阶段，你可以选择一名你攻击范围外的其他角色，将X张牌当一张
 *           不计入次数的【杀】对其使用（X为你计算与其的距离）。
 *   枕戈    准备阶段，你可以令一名角色的攻击范围+1（每名角色至多+5）。
 *           若所有除其以外的角色都在其攻击范围内，你可以令其视为对你选择的
 *           另一名角色使用一张【杀】。
 *   兴汉    锁定技，当被“枕戈”选择过的角色使用本回合的第一张【杀】造成伤害后，
 *           你摸一张牌（若你的手牌数不是全场唯一最多的，改为摸X张牌，
 *           X为其攻击范围且至多为5）。
 *
 * 已知取舍（写在这里而不是埋在代码里）：
 * · 「不计入次数」（☆ 狩星）：引擎的【杀】次数记在 App.tsx 的 slashUsageRef 里，
 *   ctx 没有对应入口，所以这一次【杀】仍会占用正常次数。这是**规则差异**，
 *   不是实现省略 —— 需要给 ctx 补一个「本次用牌不计入次数」的标记才能真正对齐。
 * · 「本回合获得技能」：注册表是按**武将名**派发的，所以唯一的门闸是技能自己在
 *   入口处查 ctx.hasGrantedSkill（「☆ 狩星」已按此实现）。同组的「☆ 铩雪」
 *   （batch6new.ts）是更早写的、没有这个门闸 —— 因为黄舞蝶目前 pending 不可选、
 *   四个技能对玩家都不可达，所以现状无害；她转为可选之前必须补上同样的门闸。
 */

/** 「枕戈」选过的角色（万年公主的两个技能共用 heroMemory） */
const KZ_PICKED = 'kzPicked';
/** 兴汉用：本回合已经结算过【杀】的「枕戈」角色 */
const XH_DONE = 'xhDone';

const aliveOthers = (ctx: SkillContext, excludeId?: number): Player[] =>
  ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.id !== excludeId);

/** 让玩家/ AI 做单目标选择；返回 undefined 表示放弃 */
const pickTarget = async (
  ctx: SkillContext, candidates: Player[], title: string, hint?: string,
): Promise<number | undefined> => {
  if (candidates.length === 0) return undefined;
  if (!ctx.self.isHuman) {
    // AI：打体力最低的那个，平手按座位序
    return [...candidates].sort((a, b) => a.hp - b.hp || a.id - b.id)[0].id;
  }
  const r = await ctx.requestChoice({
    title,
    hint,
    mode: 'target',
    targets: candidates.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}` })),
    min: 1,
    max: 1,
    cancelLabel: '不发动',
  });
  const id = r && r.kind === 'target' ? r.ids?.[0] : undefined;
  return typeof id === 'number' ? id : undefined;
};

// ── 黄舞蝶「双锐」 ────────────────────────────────────
registerSkill({
  hero: '黄舞蝶',
  skill: '双锐',
  hooks: {
    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      const others = aliveOthers(ctx);
      if (others.length === 0) return;
      const targetId = await pickTarget(
        ctx, others, '双锐：视为对一名其他角色使用无距离限制的【杀】',
        '在你攻击范围外：此【杀】不可被响应；在范围内：伤害+1',
      );
      if (targetId === undefined) return;
      const target = ctx.players.find(p => p.id === targetId);
      if (!target) return;
      const inRange = ctx.canReach(ctx.self.id, targetId);
      ctx.banner();
      if (inRange) {
        ctx.log(`【双锐】${ctx.self.hero.name} 视为对 ${target.hero.name} 使用【杀】（在攻击范围内：伤害+1）`);
        await ctx.useCardAs(CardName.SHA, [targetId], {
          ignoreDistance: true, damageBonus: 1, reason: '双锐',
        });
        // 「本回合获得技能"铩雪"」（范围内那一支）
        if (ctx.grantSkill('☆ 铩雪')) {
          ctx.memory.grantedThisTurn = true;
          ctx.log('【双锐】黄舞蝶 本回合获得技能「☆ 铩雪」');
        }
      } else {
        ctx.log(`【双锐】${ctx.self.hero.name} 视为对 ${target.hero.name} 使用【杀】（在攻击范围外：不可被响应）`);
        await ctx.useCardAs(CardName.SHA, [targetId], {
          ignoreDistance: true, noResponse: true, reason: '双锐',
        });
        // 「本回合获得技能"狩星"」（范围外那一支）
        if (ctx.grantSkill('☆ 狩星')) {
          ctx.memory.grantedThisTurn = true;
          ctx.log('【双锐】黄舞蝶 本回合获得技能「☆ 狩星」');
        }
      }
    },
    onTurnEnd: (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (!ctx.memory.grantedThisTurn) return;
      ctx.memory.grantedThisTurn = false;
      ctx.revokeSkill('☆ 狩星', ctx.self.id, '本回合结束');
      ctx.revokeSkill('☆ 铩雪', ctx.self.id, '本回合结束');
    },
  },
});

// ── 黄舞蝶「☆ 狩星」 ──────────────────────────────────
registerSkill({
  hero: '黄舞蝶',
  skill: '☆ 狩星',
  hooks: {
    onPlayPhaseBegin: async (ctx, ev) => {
      if (ev.owner.id !== ctx.self.id) return;
      // 门闸：这个技能只有「双锐」授予之后才该存在（注册表按武将派发，不按授予派发）
      if (!ctx.hasGrantedSkill('☆ 狩星')) return;
      const outOfRange = aliveOthers(ctx).filter(p => !ctx.canReach(ctx.self.id, p.id));
      if (outOfRange.length === 0) return;
      const targetId = await pickTarget(
        ctx, outOfRange, '☆ 狩星：将X张牌当不计入次数的【杀】对其使用',
        'X = 你与其的距离；只在你攻击范围外的角色中选',
      );
      if (targetId === undefined) return;
      const x = Math.max(1, ctx.distance(ctx.self.id, targetId));
      if (ctx.self.hand.length < x) {
        ctx.log(`【☆ 狩星】${ctx.self.hero.name} 手牌不足 ${x} 张，无法发动`);
        return;
      }
      const target = ctx.players.find(p => p.id === targetId);
      if (!target) return;
      // 用哪 X 张：人类自己挑，AI 直接取前 X 张
      let cost = ctx.self.hand.slice(0, x);
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: `☆ 狩星：选择 ${x} 张牌当【杀】对 ${target.hero.name} 使用`,
          mode: 'multi',
          choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: x,
          max: x,
          cancelLabel: '不发动',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        const picked = ids.map(id => ctx.self.hand.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
        if (picked.length !== x) return;
        cost = picked;
      }
      ctx.banner();
      ctx.discard(ctx.self.id, cost);
      ctx.log(`【☆ 狩星】${ctx.self.hero.name} 将 ${cost.map(c => `【${c.name}】`).join('')} 当【杀】对 ${target.hero.name} 使用（距离 ${x}）`);
      await ctx.useCardAs(CardName.SHA, [targetId], { ignoreDistance: true, reason: '☆ 狩星' });
    },
  },
});

// ── 万年公主「枕戈」 ──────────────────────────────────
registerSkill({
  hero: '万年公主',
  skill: '枕戈',
  hooks: {
    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      const candidates = ctx.players.filter(p => !p.isDead);
      const boosted = await pickTarget(
        ctx, candidates, '枕戈：令一名角色的攻击范围+1（每人至多+5）',
        '若所有除其以外的角色都在其攻击范围内，还可以令其视为对另一名角色使用一张【杀】',
      );
      if (boosted === undefined) return;
      const boostedPlayer = ctx.players.find(p => p.id === boosted);
      if (!boostedPlayer) return;
      ctx.banner();
      ctx.changeAttackRange(boosted, 1);
      ctx.log(`【枕戈】${ctx.self.hero.name} 令 ${boostedPlayer.hero.name} 的攻击范围+1（当前 ${ctx.attackRange(boosted)}）`);
      // 记下来给「兴汉」用
      const picked = (ctx.heroMemory[KZ_PICKED] as number[] | undefined) ?? [];
      if (!picked.includes(boosted)) picked.push(boosted);
      ctx.heroMemory[KZ_PICKED] = picked;

      // 「若所有除其以外的角色都在其攻击范围内」——逐个用引擎的攻击范围判定
      const others = ctx.players.filter(p => !p.isDead && p.id !== boosted);
      const allInRange = others.every(p => ctx.canReach(boosted, p.id));
      if (!allInRange || others.length === 0) return;
      const slashTarget = await pickTarget(
        ctx, others, `枕戈：令 ${boostedPlayer.hero.name} 视为对一名角色使用一张【杀】`,
      );
      if (slashTarget === undefined) return;
      const victim = ctx.players.find(p => p.id === slashTarget);
      if (!victim) return;
      ctx.log(`【枕戈】${boostedPlayer.hero.name} 视为对 ${victim.hero.name} 使用一张【杀】`);
      await ctx.useCardAs(CardName.SHA, [slashTarget], { asPlayerId: boosted, reason: '枕戈' });
    },
  },
});

// ── 万年公主「兴汉」 ──────────────────────────────────
registerSkill({
  hero: '万年公主',
  skill: '兴汉',
  locked: true,
  hooks: {
    // 每回合清一次「已经被兴汉算过的角色」，等价于「本回合的第一张【杀】」
    onTurnStart: (ctx) => { ctx.heroMemory[XH_DONE] = []; },
    afterDealDamage: (ctx, ev: DamageEvent) => {
      const src = ev.source;
      if (!src) return;
      if (ev.card?.name !== CardName.SHA) return;
      const picked = (ctx.heroMemory[KZ_PICKED] as number[] | undefined) ?? [];
      if (!picked.includes(src.id)) return;
      const done = (ctx.heroMemory[XH_DONE] as number[] | undefined) ?? [];
      if (done.includes(src.id)) return;
      done.push(src.id);
      ctx.heroMemory[XH_DONE] = done;
      // 「若你的手牌数不是全场唯一最多的，改为摸X张牌」
      const myHand = ctx.self.hand.length;
      const othersHands = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id).map(p => p.hand.length);
      const strictlyMost = othersHands.every(n => myHand > n);
      const amount = strictlyMost ? 1 : Math.min(5, Math.max(1, ctx.attackRange(src.id)));
      ctx.banner();
      ctx.log(`【兴汉】${ctx.self.hero.name} 因 ${src.hero.name} 使用本回合第一张【杀】造成伤害，摸 ${amount} 张`);
      ctx.draw(ctx.self.id, amount);
    },
  },
});
