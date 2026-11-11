import { registerSkill } from './registry';
import type { SkillContext, DrawPhaseEvent, DrawPhaseResult, DiscardPhaseEvent, DiscardPhaseResult, CardLostEvent } from './registry';
import { CardName } from '../../../types';

/**
 * 迁移批次：摸牌 / 弃牌阶段类技能。
 *
 * 这批技能此前分别内联在 App.tsx 的摸牌阶段、弃牌阶段与 mutateHand 里，
 * 靠 hero.name === 'X' 分支切换。它们之前无法迁移，因为注册表只有「事后通知」
 * 与 drawPhaseBonus（只能加数），无法表达「不摸牌改获得」「少摸一张」
 * 「跳过整个弃牌阶段」「失去牌时触发」四类语义。
 *
 * 为此新增三个钩子：
 *   · drawPhaseBegin   —— 摸牌阶段开始，可改写摸牌数 / 声明本次不摸牌
 *   · discardPhaseSkip —— 弃牌阶段前，可跳过整个阶段
 *   · afterCardLost    —— 不因使用/打出而失去牌后（弃置 / 被获得 / 移出装备区）
 */

// ── 张辽「突袭」：摸牌阶段可改为获得至多两名其他角色各一张手牌 ──
registerSkill({
  hero: '张辽',
  skill: '突袭',
  hooks: {
    drawPhaseBegin: (ctx: SkillContext): DrawPhaseResult | null => {
      const candidates = ctx.players
        .filter(p => !p.isDead && p.id !== ctx.self.id && p.hand.length > 0)
        .sort((a, b) => b.hand.length - a.hand.length)
        .slice(0, 2);
      if (candidates.length === 0) return null;
      ctx.log(`【突袭】${ctx.self.hero.name} 改为获得其他角色的手牌`);
      ctx.banner();
      for (const target of candidates) {
        const live = ctx.players.find(p => p.id === target.id);
        if (!live || live.hand.length === 0) continue;
        const stolen = live.hand[Math.floor(Math.random() * live.hand.length)];
        ctx.gainCard(live.id, ctx.self.id, stolen);
        ctx.log(`【突袭】${ctx.self.hero.name} 获得 ${live.hero.name} 的一张手牌`);
      }
      // 本次摸牌被整段替换：标记 replaced 而不是把摸牌数改成 0，
      // 否则「不摸牌」与「少摸一张」在下游无法区分
      return { replaced: true, count: 0 };
    },
  },
});

// ── 许褚「裸衣」：摸牌阶段少摸一张，本回合【杀】/【决斗】伤害 +1 ──
registerSkill({
  hero: '许褚',
  skill: '裸衣',
  hooks: {
    drawPhaseBegin: (ctx: SkillContext, ev: DrawPhaseEvent): DrawPhaseResult | null => {
      const hasAttack = ctx.self.hand.some(
        c => c.name === CardName.SHA || c.name === CardName.JUEDOU,
      );
      if (!hasAttack) return null;
      ctx.memory.luoyiActive = true;
      ctx.log(`【裸衣】${ctx.self.hero.name} 少摸一张牌，本回合【杀】/【决斗】伤害+1`);
      ctx.banner();
      return { count: Math.max(0, ev.count - 1) };
    },
    // 「本回合」的边界：任意角色的回合开始时，上一回合的加成一律失效
    // （与迁移前 luoyiPlayerRef 在回合开始被清空的时机一致）
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.luoyiActive;
    },
    // 本回合【杀】/【决斗】伤害 +1（解锁逻辑与其余减伤技共用同一入口）
    damageBefore: (ctx: SkillContext, ev) => {
      if (!ctx.memory.luoyiActive) return null;
      if (ev.source?.id !== ctx.self.id) return null;
      if (ev.card?.name !== CardName.SHA && ev.card?.name !== CardName.JUEDOU) return null;
      return { amount: ev.amount + 1, note: `【裸衣】${ctx.self.hero.name} 的伤害+1` };
    },
  },
});

// ── 吕蒙「克己」：出牌阶段未使用【杀】则跳过弃牌阶段 ──
registerSkill({
  hero: '吕蒙',
  skill: '克己',
  hooks: {
    discardPhaseSkip: (ctx: SkillContext, ev: DiscardPhaseEvent): DiscardPhaseResult | null => {
      if (ev.slashesUsed > 0) return null;
      ctx.banner();
      return { skip: true, note: `【克己】${ctx.self.hero.name} 本回合未使用【杀】，跳过弃牌阶段` };
    },
  },
});

// ── 孙尚香「枭姬」：失去装备区的牌时摸两张 ──
registerSkill({
  hero: '孙尚香',
  skill: '枭姬',
  hooks: {
    afterCardLost: (ctx: SkillContext, ev: CardLostEvent) => {
      if (ev.player.id !== ctx.self.id) return;
      if (!ev.fromEquip) return;
      ctx.draw(ctx.self.id, 2);
      ctx.log(`【枭姬】${ctx.self.hero.name} 失去装备区的牌，摸两张牌`);
      ctx.banner();
    },
  },
});

// ── 陆逊「连营」：失去最后一张手牌时摸一张 ──
registerSkill({
  hero: '陆逊',
  skill: '连营',
  hooks: {
    afterCardLost: (ctx: SkillContext, ev: CardLostEvent) => {
      if (ev.player.id !== ctx.self.id) return;
      // 只有「手牌」清零才算：装备区的牌不占手牌，失去它不该触发连营
      if (ev.fromEquip) return;
      if (ev.handAfter !== 0) return;
      if (ev.cards.length === 0) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【连营】${ctx.self.hero.name} 失去最后一张手牌，摸一张牌`);
      ctx.banner();
    },
  },
});
