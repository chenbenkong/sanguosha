import { registerSkill } from './registry';
import type { SkillContext } from './registry';
import { Suit } from '../../../types';

/**
 * 用新引擎能力（judgeBefore / damageBefore）迁移的技能。
 *
 * 这些技能此前无法迁移，因为在旧注册表里只能「事后通知」，
 * 而它们必须**在结算前介入**。
 */

// ── 孙茹「释衅」：锁定技，不受火焰伤害 ──
registerSkill({
  hero: '孙茹',
  skill: '释衅',
  locked: true,
  hooks: {
    damageBefore: (ctx: SkillContext, ev) => {
      if (ev.victim.id !== ctx.self.id) return null;
      if (ev.nature !== 'fire') return null;
      ctx.log(`【释衅】${ctx.self.hero.name} 不受火焰伤害`);
      ctx.banner();
      return { prevent: true, note: `【释衅】${ctx.self.hero.name} 免疫火焰伤害` };
    },
  },
});

// ── 小乔「红颜」：锁定技，方块牌视为红桃 ──
registerSkill({
  hero: '小乔',
  skill: '红颜',
  locked: true,
  hooks: {
    judgeBefore: (ctx: SkillContext, ev) => {
      if (ev.owner.id !== ctx.self.id) return null;
      if (ev.card.suit !== Suit.DIAMOND) return null;
      ctx.log(`【红颜】${ctx.self.hero.name} 的方块判定牌视为红桃`);
      ctx.banner();
      return { treatSuitAs: Suit.HEART };
    },
  },
});
