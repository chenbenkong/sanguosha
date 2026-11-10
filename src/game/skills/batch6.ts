import { registerSkill } from './registry';
import type { SkillContext, DamageEvent, CardUsedEvent, JudgeEvent } from './registry';
import {
  canHuguan, tianzeDraws, tianzeCanStrike, fangduEffect, jiexingTriggers,
  shengduDrawCount, cilvDrawCount, nifuAdjust, yuanditriggers,
} from '../skills-batch6';
import { Suit } from '../../../types';
import type { Player } from '../../../types';

/**
 * 第六批女将技能注册。
 *
 * 每个武将一段，钩子只写自己需要的时机。引擎统一遍历 REGISTRY 调用，
 * 不再需要 hero.name === 'X' 的内联分支。
 *
 * 迁移策略：这里是「已实装」的 8 位，用它们验证框架；
 * 其余武将按同样形状逐个搬过来。
 */

// ── 王悦 / 王桃「护关」────────────────────────────────
const huguanHooks = {
  afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
    if (ev.source.id !== ctx.self.id) return;
    if (ev.usedCount !== 1) return;
    if (!canHuguan(ev.card)) return;
    const counts: Record<string, number> = {};
    ctx.self.hand.forEach(c => { counts[c.suit] = (counts[c.suit] || 0) + 1; });
    const best = (Object.keys(counts) as Suit[]).sort((a, b) => counts[b] - counts[a])[0];
    if (!best) return;
    ctx.self.huguanSuit = best;
    ctx.log(`【护关】${ctx.self.hero.name} 声明花色 ${best}，本回合该花色不计入手牌上限`);
    ctx.banner();
  },
  exemptHandCards: (ctx: SkillContext, declaredSuit: Suit | null) => {
    if (!declaredSuit) return 0;
    return ctx.self.hand.filter(c => c.suit === declaredSuit).length;
  },
};
registerSkill({ hero: '王悦', skill: '护关', hooks: huguanHooks });
registerSkill({ hero: '王桃', skill: '护关', hooks: huguanHooks });

// ── 张宁「天则」────────────────────────────────────────
registerSkill({
  hero: '张宁',
  skill: '天则',
  hooks: {
    afterJudge: (ctx: SkillContext, ev: JudgeEvent) => {
      if (!tianzeDraws(ev.card, ev.owner, ctx.self)) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【天则】${ev.owner.hero.name} 判定为黑色（${ev.card.suit}），张宁摸一张牌`);
      ctx.banner();
    },
    afterCardUsed: async (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.usedCount !== 1) return;
      if (!tianzeCanStrike(ev.card, ev.usedCount, ev.source.id, ctx.self)) return;
      const black = ctx.self.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
      if (!black) return;
      ctx.discard(ctx.self.id, [black]);
      ctx.log(`【天则】张宁弃置黑色【${black.name}】，对 ${ev.source.hero.name} 造成 1 点伤害`);
      ctx.banner();
      await ctx.delay(400);
      await ctx.damage(ev.source.id, ctx.self.id, 1, black);
    },
  },
});

// ── 袁姬「节行」+「芳妒」────────────────────────────────
registerSkill({
  hero: '袁姬',
  skill: '节行',
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (!jiexingTriggers(ctx.self, ctx.self.hp + ev.amount, ctx.self.hp)) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log('【节行】袁姬体力值变化，摸一张牌');
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '袁姬',
  skill: '芳妒',
  locked: true,
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (!ev.source || ev.source.id === ctx.self.id) return;
      if (ctx.turnOwner?.id === ctx.self.id) return; // 回合外才触发
      const key = `fangdu-${ctx.self.id}`;
      if (ctx.memory[key]) return;
      ctx.memory[key] = true;
      if (fangduEffect(ev.nature) === 'heal') {
        ctx.heal(ctx.self.id, 1);
        ctx.log('【芳妒】袁姬于回合外首次受到普通伤害，回复 1 点体力');
      } else {
        const src = ev.source;
        if (src.hand.length > 0) {
          const got = src.hand[Math.floor(Math.random() * src.hand.length)];
          ctx.gainCard(src.id, ctx.self.id, got);
          ctx.log(`【芳妒】袁姬受到属性伤害，获得 ${src.hero.name} 的【${got.name}】`);
        }
      }
      ctx.banner();
    },
  },
});

// ── 董绾「生妒」────────────────────────────────────────
registerSkill({
  hero: '董绾',
  skill: '生妒',
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending: Player) => {
      if (ending.id === ctx.self.id) return;
      if ((ending.shengduMarks ?? 0) > 0) return;
      ending.shengduMarks = 1;
      ctx.log(`【生妒】董绾令 ${ending.hero.name} 获得 1 个「生妒」标记`);
      ctx.banner();
    },
  },
});

// ── 朱佩兰「辞虑」────────────────────────────────────────
registerSkill({
  hero: '朱佩兰',
  skill: '辞虑',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id === ctx.self.id) return;
      if (!ev.targets.some(t => t.id === ctx.self.id)) return;
      const remaining = 3 - (ctx.self.cilvUsed ?? 0);
      if (remaining <= 0) return;
      ctx.draw(ctx.self.id, cilvDrawCount(remaining));
      ctx.self.cilvUsed = (ctx.self.cilvUsed ?? 0) + 1;
      ctx.log(`【辞虑】朱佩兰摸 ${remaining} 张牌（剩余选项 ${remaining - 1}）`);
      ctx.banner();
    },
  },
});

// ── 严夫人「匿伏」────────────────────────────────────────
registerSkill({
  hero: '严夫人',
  skill: '匿伏',
  locked: true,
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      const diff = nifuAdjust(ending.hand.length);
      if (diff > 0) {
        ctx.draw(ending.id, diff);
        ctx.log(`【匿伏】${ending.hero.name} 手牌不足三张，摸 ${diff} 张`);
      } else if (diff < 0) {
        const toDiscard = [...ending.hand].slice(0, -diff);
        ctx.discard(ending.id, toDiscard);
        ctx.log(`【匿伏】${ending.hero.name} 手牌超过三张，弃置 ${toDiscard.length} 张`);
      } else {
        return;
      }
      ctx.banner();
    },
  },
});

// ── 孙翎鸾「聆乐」────────────────────────────────────────
registerSkill({
  hero: '孙翎鸾',
  skill: '聆乐',
  locked: true,
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (!ev.source || ev.source.id === ctx.self.id) return;
      const key = `lingle-${ev.source.id}`;
      if (ctx.memory[key]) return;
      ctx.memory[key] = true;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【聆乐】孙翎鸾在 ${ev.source.hero.name} 造成本轮首次伤害后摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 谢灵毓「元嫡」────────────────────────────────────────
registerSkill({
  hero: '谢灵毓',
  skill: '元嫡',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id === ctx.self.id) return;
      const targetsOthers = ev.targets.some(t => t.id !== ev.source.id);
      if (!yuanditriggers(targetsOthers, ev.usedCount)) return;
      ctx.draw(ctx.self.id, 1);
      ctx.draw(ev.source.id, 1);
      ctx.log(`【元嫡】${ev.source.hero.name} 的首张牌未指定他人，谢灵毓与其各摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 唐姬「抗歌」────────────────────────────────────────
registerSkill({
  hero: '唐姬',
  skill: '抗歌',
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.self.kanggeTargetId != null) return;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      const chosen = [...others].sort((a, b) => b.hp - a.hp)[0];
      ctx.self.kanggeTargetId = chosen.id;
      ctx.log(`【抗歌】唐姬选择 ${chosen.hero.name} 作为守护对象`);
      ctx.banner();
    },
  },
});
