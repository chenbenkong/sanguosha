import { registerSkill } from './registry';
import type { SkillContext, PlayPhaseEvent, CardUsedEvent, DamageEvent, HealEvent } from './registry';
import { CardType } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 23 组：董絮「酖毒」、清河公主「谮构」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   酖毒  出牌阶段结束时，你可以展示至多五张基本牌或普通锦囊牌，然后你的下个回合开始时
 *         视为依次使用这些牌（无距离限制）。你使用这些牌期间有角色回复体力或受到伤害后，
 *         你摸一张牌（因此摸到的牌不计本回合手牌上限）。
 *   谮构  出牌阶段限一次，你可以将至多体力上限张牌交给一名其他角色并摸等量张牌
 *         （交给其的牌标记为“谮构”牌），然后该角色下一次体力值增加或使用牌后，
 *         其展示所有手牌并失去X点体力（X为其手牌中的“谮构”牌数）且移除这些“谮构”牌的标记。
 *
 * 本轮补的原语：afterHeal —— 派发点在 App.tsx 的 recoverHp（全仓唯一的回血出口，
 * combat.ts 的 8 个调用点注入的也是它），所以桃 / 酒 / 急救 / 技能回血全能覆盖。
 * 顺带把「武缘」里直接写 updatePlayer({hp}) 的回血也改成走 recoverHp，
 * 否则那一次回血对这两个技能是隐形的。
 */

const aliveOthers = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);

const pickOne = async (
  ctx: SkillContext, candidates: Player[], title: string, hint?: string,
): Promise<number | undefined> => {
  if (candidates.length === 0) return undefined;
  if (!ctx.self.isHuman) return [...candidates].sort((a, b) => a.hp - b.hp || a.id - b.id)[0].id;
  const r = await ctx.requestChoice({
    title, hint, mode: 'target',
    targets: candidates.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}` })),
    min: 1, max: 1, cancelLabel: '不发动',
  });
  const id = r && r.kind === 'target' ? r.ids?.[0] : undefined;
  return typeof id === 'number' ? id : undefined;
};

// ── 董絮「酖毒」 ──────────────────────────────────────
registerSkill({
  hero: '董絮',
  skill: '酖毒',
  hooks: {
    onPlayPhaseEnd: async (ctx, ev: PlayPhaseEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      const pool = ctx.self.hand.filter(c => c.type === CardType.BASIC || c.type === CardType.SCROLL);
      if (pool.length === 0) return;
      let picked = pool.slice(0, 5);
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '酖毒：展示至多 5 张基本牌或普通锦囊牌',
          hint: '下个回合开始时视为依次使用这些牌（无距离限制）',
          mode: 'multi',
          choices: pool.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 0, max: Math.min(5, pool.length), cancelLabel: '不发动',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        picked = ids.map(id => pool.find(c => c.id === id)).filter((c): c is Card => !!c);
      }
      if (picked.length === 0) return;
      ctx.memory.pending = picked.map(c => c.id);
      ctx.banner();
      ctx.log(`【酖毒】${ctx.self.hero.name} 展示 ${picked.map(c => `【${c.name}】`).join('')}，下个回合开始时依次使用`);
    },

    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      const pending = (ctx.memory.pending as string[] | undefined) ?? [];
      ctx.memory.pending = [];
      ctx.memory.extraLimit = 0;
      if (pending.length === 0) return;
      ctx.memory.watching = true;
      ctx.log(`【酖毒】${ctx.self.hero.name} 开始依次使用上回合展示的 ${pending.length} 张牌`);
      const others = aliveOthers(ctx);
      for (const id of pending) {
        const cur = ctx.players.find(p => p.id === ctx.self.id);
        const card = cur?.hand.find(c => c.id === id);
        if (!card) continue;   // 展示之后被弃置/失去了，就不再使用
        let targets: number[] = [];
        const needsTarget = card.name === '杀' || card.name === '决斗' || card.name === '过河拆桥'
          || card.name === '顺手牵羊' || card.name === '火攻';
        if (needsTarget) {
          const tid = await pickOne(ctx, others, `酖毒：使用【${card.name}】的目标`);
          if (tid === undefined) continue;
          targets = [tid];
        }
        ctx.log(`【酖毒】视为使用【${card.name}】`);
        await ctx.useCardAs(card, targets, { ignoreDistance: true, reason: '酖毒' });
      }
      ctx.memory.watching = false;
    },

    // 「你使用这些牌期间有角色回复体力或受到伤害后，你摸一张牌」
    afterHeal: (ctx, ev: HealEvent) => {
      if (!ctx.memory.watching) return;
      ctx.memory.extraLimit = ((ctx.memory.extraLimit as number | undefined) ?? 0) + 1;
      ctx.log(`【酖毒】${ev.player.hero.name} 回复 ${ev.amount} 点体力，${ctx.self.hero.name} 摸一张牌（不计本回合手牌上限）`);
      ctx.draw(ctx.self.id, 1);
    },
    afterDamage: (ctx, ev: DamageEvent) => {
      if (!ctx.memory.watching) return;
      ctx.memory.extraLimit = ((ctx.memory.extraLimit as number | undefined) ?? 0) + 1;
      ctx.log(`【酖毒】${ev.victim.hero.name} 受到伤害，${ctx.self.hero.name} 摸一张牌（不计本回合手牌上限）`);
      ctx.draw(ctx.self.id, 1);
    },
    handLimitBonus: (ctx) => (ctx.memory.extraLimit as number | undefined) ?? 0,
    onTurnEnd: (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      ctx.memory.watching = false;
      ctx.memory.extraLimit = 0;
    },
  },
});

// ── 清河公主「谮构」 ──────────────────────────────────
interface ZangouMark { ownerId: number; cardId: string }

const marksOf = (ctx: SkillContext): ZangouMark[] => {
  const cur = ctx.heroMemory.zangou;
  return Array.isArray(cur) ? (cur as ZangouMark[]) : [];
};

/** 结算：「其展示所有手牌并失去X点体力且移除这些标记」 */
const settle = (ctx: SkillContext, ownerId: number, why: string) => {
  const marks = marksOf(ctx, );
  const mine = marks.filter(m => m.ownerId === ownerId);
  if (mine.length === 0) return;
  const owner = ctx.players.find(p => p.id === ownerId);
  if (!owner) return;
  // 只留别人的标记（同一时刻只该有一个目标，这里按 ownerId 清）
  ctx.heroMemory.zangou = marks.filter(m => m.ownerId !== ownerId);
  if (owner.isDead) return;
  const inHand = mine.filter(m => owner.hand.some(c => c.id === m.cardId));
  ctx.banner();
  ctx.log(`【谮构】${owner.hero.name} 展示所有手牌（${why}）：${owner.hand.map(c => `【${c.name}】`).join('')}`);
  if (inHand.length === 0) {
    ctx.log('【谮构】其手牌中没有「谮构」牌，不失去体力');
    return;
  }
  ctx.log(`【谮构】手中有 ${inHand.length} 张「谮构」牌，失去 ${inHand.length} 点体力`);
  void ctx.loseHp(ownerId, inHand.length);
};

registerSkill({
  hero: '清河公主',
  skill: '谮构',
  hooks: {
    onTurnEnd: (ctx) => { ctx.memory.usedThisTurn = false; },
    onPlayPhaseBegin: async (ctx, ev: PlayPhaseEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      if (ctx.self.hand.length === 0) return;
      const targetId = await pickOne(ctx, aliveOthers(ctx), '谮构：把牌交给一名其他角色');
      if (targetId === undefined) return;
      const target = ctx.players.find(p => p.id === targetId);
      if (!target) return;
      const max = Math.min(ctx.self.maxHp, ctx.self.hand.length);
      if (max <= 0) return;
      let picks = ctx.self.hand.slice(0, max);
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: `谮构：选择至多 ${max} 张牌交给 ${target.hero.name}`,
          hint: '交给其的牌标记为「谮构」牌，之后其体力值增加或使用牌后会展示手牌并失去等量体力',
          mode: 'multi',
          choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 0, max, cancelLabel: '不发动',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        picks = ids.map(id => ctx.self.hand.find(c => c.id === id)).filter((c): c is Card => !!c);
      }
      if (picks.length === 0) return;
      ctx.memory.usedThisTurn = true;
      ctx.banner();
      for (const c of picks) ctx.gainCard(ctx.self.id, targetId, c);
      const marks = marksOf(ctx).filter(m => m.ownerId !== targetId);
      ctx.heroMemory.zangou = [...marks, ...picks.map(c => ({ ownerId: targetId, cardId: c.id }))];
      ctx.draw(ctx.self.id, picks.length);
      ctx.log(`【谮构】${ctx.self.hero.name} 将 ${picks.map(c => `【${c.name}】`).join('')} 交给 ${target.hero.name}（标记为「谮构」牌），摸 ${picks.length} 张`);
    },
    afterHeal: (ctx, ev: HealEvent) => settle(ctx, ev.player.id, '体力值增加'),
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => settle(ctx, ev.source.id, `使用了【${ev.card.name}】`),
  },
});
