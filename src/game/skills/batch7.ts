import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';
import { Suit } from '../../../types';

/**
 * 第七批：用注册表实装的新武将。
 *
 * 每个技能只需实现自己关心的钩子；引擎在对应时机统一调用。
 * 新增武将时，这个文件里加一段、index.ts 加一行 import 即可。
 */

// ── 庞凤衣「异瞳」──────────────────────────────────────
// 锁定技：游戏开始时选择一种花色；该花色的牌每回合第一次因使用置入弃牌堆后，
// 随机获得其他每种花色的牌各一张。
registerSkill({
  hero: '庞凤衣',
  skill: '异瞳',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev) => {
      // 场上没有庞凤衣则跳过（由 dispatcher 保证 ctx.self 就是庞凤衣）
      if (ev.source.id !== ctx.self.id) return;
      // 首次使用时选定花色（按手牌最多的花色）
      if (!ctx.memory.suit) {
        const counts: Record<string, number> = {};
        ctx.self.hand.forEach(c => { counts[c.suit] = (counts[c.suit] || 0) + 1; });
        const best = (Object.keys(counts) as Suit[]).sort((a, b) => counts[b] - counts[a])[0];
        if (!best) return;
        ctx.memory.suit = best;
        ctx.log(`【异瞳】庞凤衣选择花色 ${best}`);
        ctx.banner();
        return;
      }
      const chosen = ctx.memory.suit as Suit;
      if (ev.card.suit !== chosen) return;
      // 每回合第一次
      const turnKey = `turn-${ctx.turnOwner?.id ?? -1}`;
      if (ctx.memory[turnKey]) return;
      ctx.memory[turnKey] = true;
      // 获得其他每种花色各一张（从牌堆摸最多三种，按花色过滤的简化实现）
      const gained = ctx.draw(ctx.self.id, 3);
      ctx.log(`【异瞳】${chosen} 花色首次置入弃牌堆，庞凤衣获得其他花色各一张（摸了 ${gained.length} 张）`);
      ctx.banner();
    },
  },
});

// ── 侯昭宁「和戎」──────────────────────────────────────
// 出牌阶段限一次：展示一名其他角色一张手牌，与你的一张交换。
// 类型相同 → 防止下次伤害 + 双方各得一张装备；不同 → 弃其两张并造成 1 点伤害。
registerSkill({
  hero: '侯昭宁',
  skill: '和戎',
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending) => {
      // 在自己的回合结束时结算本回合是否发动过（简化：AI 自动发动最有价值的分支）
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) { delete ctx.memory.usedThisTurn; return; }
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hand.length > 0);
      if (!others.length || ctx.self.hand.length === 0) return;
      const target = others[0];
      const theirs = target.hand[0];
      const mine = ctx.self.hand[0];
      const sameType = theirs.type === mine.type;
      ctx.gainCard(ctx.self.id, target.id, mine);
      ctx.gainCard(target.id, ctx.self.id, theirs);
      ctx.memory.usedThisTurn = true;
      if (sameType) {
        ctx.memory.shield = true;
        ctx.log(`【和戎】侯昭宁与 ${target.hero.name} 交换同类型手牌，获得一次伤害减免`);
      } else {
        ctx.damage(target.id, ctx.self.id, 1);
        ctx.log(`【和戎】侯昭宁与 ${target.hero.name} 交换不同类型手牌，对其造成 1 点伤害`);
      }
      ctx.banner();
    },
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (!ctx.memory.shield) return;
      delete ctx.memory.shield;
      ctx.heal(ctx.self.id, 1);
      ctx.log('【和戎】侯昭宁以和戎之势减免了本次伤害');
      ctx.banner();
    },
  },
});

// ── 徐馨「愍善」─────────────────────────────────────────
// 受到 1 点伤害后，可令一名角色随机获得两张牌堆中的牌。
registerSkill({
  hero: '徐馨',
  skill: '愍善',
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (ev.amount < 1) return;
      // 优先给自己（简化：AI 视角总是补充自己）
      const gained = ctx.draw(ctx.self.id, 2);
      ctx.log(`【愍善】徐馨受到伤害，获得 ${gained.length} 张牌堆中的牌`);
      ctx.banner();
    },
  },
});

// ── 潘淑「燕尔」─────────────────────────────────────────
// 每回合限一次：其他角色出牌阶段失去最后的手牌时，双方各摸两张。
registerSkill({
  hero: '潘淑',
  skill: '燕尔',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev) => {
      if (ev.source.id === ctx.self.id) return;
      if (ev.source.hand.length !== 0) return;
      const key = `turn-${ctx.turnOwner?.id ?? -1}`;
      if (ctx.memory[key]) return;
      ctx.memory[key] = true;
      ctx.draw(ctx.self.id, 2);
      ctx.draw(ev.source.id, 2);
      ctx.log(`【燕尔】${ev.source.hero.name} 用尽手牌，潘淑与其各摸两张牌`);
      ctx.banner();
    },
  },
});
