import { registerSkill } from './registry';
import type { SkillContext, DamageEvent, CardUsedEvent, JudgeEvent } from './registry';
import { CardType } from '../../../types';

/**
 * 迁移批次 1：从 App.tsx / combat.ts 的内联分支搬到注册表。
 *
 * 迁移原则：逐个搬运，函数体逻辑等价；每搬一个就有一个行为测试兜底。
 * 这些技能都属于「触发后产生一个简单副作用」，不依赖复杂的交互状态，
 * 因此适合作为第一批验证迁移模式。
 */

// ── 黄月英「集智」：使用锦囊牌时摸一张 ──
registerSkill({
  hero: '黄月英',
  skill: '集智',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      if (ev.card.type !== CardType.SCROLL) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【集智】${ctx.self.hero.name} 使用锦囊牌，摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 关银屏「虎啸」：造成伤害后摸一张（锁定技，无次数限制）──
registerSkill({
  hero: '关银屏',
  skill: '虎啸',
  locked: true,
  hooks: {
    afterDealDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.source?.id !== ctx.self.id) return;
      if (ev.victim.id === ctx.self.id) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【虎啸】${ctx.self.hero.name} 造成伤害，摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 郭嘉「遗计」：受到伤害后摸两张 ──
registerSkill({
  hero: '郭嘉',
  skill: '遗计',
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      ctx.draw(ctx.self.id, 2);
      ctx.log(`【遗计】${ctx.self.hero.name} 受到伤害，摸两张牌`);
      ctx.banner();
    },
  },
});

// ── 司马懿「反馈」：受到伤害后获得伤害来源一张手牌 ──
registerSkill({
  hero: '司马懿',
  skill: '反馈',
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      const src = ev.source;
      if (!src || src.id === ctx.self.id) return;
      if (src.hand.length === 0) return;
      const got = src.hand[Math.floor(Math.random() * src.hand.length)];
      ctx.gainCard(src.id, ctx.self.id, got);
      ctx.log(`【反馈】${ctx.self.hero.name} 获得 ${src.hero.name} 的【${got.name}】`);
      ctx.banner();
    },
  },
});

// ── 郭嘉「天妒」：判定牌生效后获得之 ──
registerSkill({
  hero: '郭嘉',
  skill: '天妒',
  hooks: {
    afterJudge: (ctx: SkillContext, ev: JudgeEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      ctx.gainCard(ev.owner.id, ctx.self.id, ev.card);
      ctx.log(`【天妒】${ctx.self.hero.name} 获得判定牌【${ev.card.name}】`);
      ctx.banner();
    },
  },
});

// ── 周瑜「英姿」：摸牌阶段额外摸一张 ──
registerSkill({
  hero: '周瑜',
  skill: '英姿',
  hooks: {
    drawPhaseBonus: (ctx: SkillContext) => {
      ctx.log(`【英姿】${ctx.self.hero.name} 摸牌阶段额外摸一张牌`);
      return 1;
    },
  },
});