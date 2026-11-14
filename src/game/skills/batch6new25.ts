import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';
import type { Player } from '../../../types';

/**
 * 第六批女将 · 第 25 组：曹华「归离」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   归离  你的第一个回合开始时，你选择一名其他角色。该角色每轮的第一个回合的结束阶段，
 *         若其本回合未造成过伤害，其令你于此回合结束后执行一个额外的回合。
 *
 * 本轮补的原语：SkillContext.requestExtraTurn —— 标志由 App.tsx 主循环在
 * 「计算下一位」处消费一次并清空（与翻面跳过同级），不再需要任何 UI 补丁。
 *
 * 判定口径（写在明处）：
 *   · 「每轮的第一个回合」用 ctx.roundCount 去重 —— 归离自己造出的额外回合，
 *     其结束阶段不会再次触发（同一轮内只可能触发一次，这正是「第一个回合」的含义）。
 *   · 「未造成过伤害」= 本回合内该角色作为伤害来源的 afterDealDamage 从未派发。
 *     计时基准是 ctx.turnOwner：别的角色回合里该角色打出的伤害（如被【决斗】
 *     打回去）**不算**，与原文明示的「其本回合」一致。
 *   · 伤害来源含流失体力的话不算（流失体力不走 takeDamage，本就不派发）。
 */

const boundOf = (ctx: SkillContext): number | undefined => {
  const b = ctx.heroMemory.guiliBound;
  return typeof b === 'number' ? b : undefined;
};

const pickOther = async (ctx: SkillContext): Promise<number | undefined> => {
  const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
  if (others.length === 0) return undefined;
  if (!ctx.self.isHuman) {
    // AI：优先绑体力最高的（让对方「不敢动手」的价值最大）
    return [...others].sort((a, b) => b.hp - a.hp || a.id - b.id)[0].id;
  }
  const r = await ctx.requestChoice({
    title: '归离：选择一名其他角色',
    hint: '其每轮的第一个回合结束时，若未造成过伤害，你执行一个额外回合',
    mode: 'target',
    targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}` })),
    min: 1, max: 1,
  });
  const id = r && r.kind === 'target' ? r.ids?.[0] : undefined;
  return typeof id === 'number' ? id : undefined;
};

registerSkill({
  hero: '曹华',
  skill: '归离',
  hooks: {
    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      if (boundOf(ctx) !== undefined) return;   // 「第一个回合开始时」选定，之后不再换
      const boundId = await pickOther(ctx);
      if (boundId === undefined) return;
      ctx.heroMemory.guiliBound = boundId;
      ctx.banner();
      const bound = ctx.players.find(p => p.id === boundId);
      ctx.log(`【归离】${ctx.self.hero.name} 与 ${bound?.hero.name ?? '?'} 立下归离之约（其每轮首回合未造成伤害，你获额外回合）`);
    },

    afterDealDamage: (ctx, ev: DamageEvent) => {
      const boundId = boundOf(ctx);
      if (boundId === undefined) return;
      // 只记「该角色**自己的回合**里造成的伤害」
      if (ctx.turnOwner?.id !== boundId) return;
      if (ev.source?.id !== boundId) return;
      ctx.memory.dmgDealt = true;
    },

    onTurnEnd: (ctx, ending: Player) => {
      const boundId = boundOf(ctx);
      if (boundId === undefined || ending.id !== boundId) return;
      const round = ctx.roundCount;
      if (ctx.memory.grantedRound === round) return;          // 每轮至多触发一次
      if (ctx.memory.dmgDealt) { ctx.memory.dmgDealt = false; return; }
      ctx.memory.dmgDealt = false;
      ctx.memory.grantedRound = round;
      ctx.banner();
      ctx.log(`【归离】${ending.hero.name} 本回合未造成过伤害，${ctx.self.hero.name} 即将执行一个额外的回合`);
      ctx.requestExtraTurn(ctx.self.id);
    },
  },
});
