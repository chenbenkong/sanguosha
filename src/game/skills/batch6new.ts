import { registerSkill } from './registry';
import type { SkillContext } from './registry';

/**
 * 第六批 30 名女将 —— 第一批技能实装（4 个）。
 *
 * 挑选标准：**纯被动、单钩子、不需要新增状态机**。这批技能的行为完全由
 * 现有钩子就能表达，因此不引入任何引擎改动——风险最低、可验证性最高。
 * 其余 73 个技能（含主动技、觉醒技、需要「成为目标」时机的）留给后续批次，
 * 它们需要扩展钩子或写交互流程，不该和这批混在一起。
 *
 * 每个技能都在 skillCoverage.test.ts 的 LEGACY_INLINE 里有登记；
 * 实装一个就从清单里删一条（该清单只允许缩小）。
 */

// ── 卢弈「手谈」────────────────────────────────────────
// 锁定技，当你的手牌数为全场最少时，你摸一张牌。
//
// 时机选「回合结束时」：这是手牌数最稳定的观察点。若放在摸牌阶段，
// 会因为「刚摸完牌就不再是最少」而几乎永不触发；放在弃牌阶段后同理。
registerSkill({
  hero: '卢弈',
  skill: '手谈',
  locked: true,
  hooks: {
    onTurnEnd: (ctx: SkillContext) => {
      const alive = ctx.players.filter(p => !p.isDead);
      if (alive.length < 2) return;
      const mine = ctx.self.hand.length;
      // 严格最少：并列最少也算（规则原文是「为全场最少」，不是「唯一最少」）
      const min = Math.min(...alive.map(p => p.hand.length));
      if (mine > min) return;
      // 自己不能是唯一玩家时才摸（已在上面排除 <2 人）
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【手谈】${ctx.self.hero.name} 手牌为全场最少（${mine} 张），摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 吕玲绮「神威」 ────────────────────────────────────
// 锁定技，①摸牌阶段，你多摸两张牌；②你的手牌上限+2。
// 两条都是纯数值增量，各用一个钩子表达。
registerSkill({
  hero: '吕玲绮',
  // 注册名必须与 HEROES.skillName 逐字一致（含 `☆ ` 前缀），
  // 否则 registry 按名匹配不到，技能永远不触发——skillCoverage 的
  // 「幽灵技能」守卫会把这个错误揪出来。
  skill: '☆ 神威',
  locked: true,
  hooks: {
    drawPhaseBonus: () => 2,
    handLimitBonus: () => 2,
  },
});

// ── 赵嫣「轻幔」 ──────────────────────────────────────
// 锁定技，一名角色的回合结束时，你将手牌数摸至 X 张（X 为该角色的空置装备栏数）。
//
// 注意 X 是「空置装备栏数」（0~4），不是手牌数——所以手牌多于 X 时不弃牌，
// 只是不摸。这也是原技能容易读错的地方。
const EQUIP_SLOTS = ['weapon', 'armor', 'horseMinus', 'horsePlus'] as const;
registerSkill({
  hero: '赵嫣',
  skill: '轻幔',
  locked: true,
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending) => {
      const eq = (ending.equipment ?? {}) as Record<string, unknown>;
      const empty = EQUIP_SLOTS.filter(s => !eq[s]).length;
      const need = empty - ctx.self.hand.length;
      if (need <= 0) return;
      ctx.draw(ctx.self.id, need);
      ctx.log(`【轻幔】${ending.hero.name} 回合结束，其空置装备栏 ${empty} 个，赵嫣摸 ${need} 张牌`);
      ctx.banner();
    },
  },
});

// ── 陆文漪「怯言」 ────────────────────────────────────
// 锁定技，当你成为其他角色使用牌的目标时，若其手牌数大于你，你摸一张牌。
//
// 引擎的 afterCardUsed 事件带 source 与 targets，可在其间判定「我是否是目标」。
registerSkill({
  hero: '陆文漪',
  skill: '怯言',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev) => {
      if (ev.source.id === ctx.self.id) return;
      // CardUsedEvent.targets 是引擎给的 Player[]（registry.ts:67），直接用
      if (!ev.targets.some(t => t.id === ctx.self.id)) return;
      if (ev.source.hand.length <= ctx.self.hand.length) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【怯言】${ev.source.hero.name} 手牌 ${ev.source.hand.length} 张多于陆文漪，陆文漪摸一张牌`);
      ctx.banner();
    },
  },
});
