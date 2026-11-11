import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';
import type { Player } from '../../../types';
import { isEnemy } from '../ai/relations';

/**
 * 迁移批次 3：chunk3 清单里「时机与判定完全能被现有钩子表达」的技能。
 *
 * 筛选标准与 batch 2 相同（三条全部满足才搬）：
 *  1. 触发时机与旧内联分支一致，且不需要注册表暂时没有的能力
 *     （判定牌、牌堆/弃牌堆、装备区、伤害增减与防止、出牌阶段控制、牌的转换）；
 *  2. 副作用只用 ctx.draw / ctx.discard / ctx.heal / ctx.gainCard；
 *  3. 不需要 App.tsx 里的 ref（限一次计数、等级、牌堆引用）。
 * 不满足的条目留在 LEGACY_INLINE，理由见迁移报告。
 *
 * 本批 6 个：卑弥呼「骨疽」「拜假」「纵傀」、王元姬「尚俭」、张昌蒲「严教」、何太后「戚乱」。
 *
 * 与旧实现的三点已知差异（都不改规则，属分发器固有契约，如实记录）：
 *  1. skillsOn 门禁：注册表统一由 ownersOf 过滤，因此旧「严教」回合开始结算里
 *     缺失的 skillsOn 判断现在统一生效（邹氏「倾城」暗置封印同样封得住它）。
 *  2. 同阶段内的结算顺序：注册表的钩子在一次 dispatch 里连续执行，早于仍写在
 *     App.tsx 里的同阶段内联分支。游戏规则不变，只有同一阶段内两张牌/两次摸牌的
 *     先后可能互换；文件内注册顺序按旧代码顺序排列以尽量保持原序。
 *  3. 字段写入方式：沿用 batch6 的先例直接写 ctx.self / ctx.players 里的字段
 *     （旧代码走 updatePlayer/updateState）。字段值因此是等价的，只是 UI 的下一次
 *     重渲染由后续状态写入触发，而非本次立即触发。
 */

// ── 卑弥呼「骨疽」：拥有“傀”的角色受到伤害后，卑弥呼摸一张并获得一枚“疽” ──
// 旧实现位置：src/game/combat.ts takeDamage（伤害结算后）。
registerSkill({
  hero: '卑弥呼',
  skill: '骨疽',
  locked: true,
  hooks: {
    afterDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      if (!ev.victim.hasKui) return;
      // 觉醒后「骨疽」替换为「蚕食」
      if (ctx.self.baiJiaAwakened) return;
      ctx.draw(ctx.self.id, 1);
      ctx.self.juMarks = (ctx.self.juMarks ?? 0) + 1;
      ctx.log(`【骨疽】${ev.victim.hero.name} 受到伤害，卑弥呼摸一张牌并获得“疽”（${ctx.self.juMarks} 枚）`);
      ctx.banner();
      await ctx.delay(250);
    },
  },
});

// ── 卑弥呼「拜假」：准备阶段“疽”不少于 7 枚时觉醒 ──
// 注册顺序必须早于「纵傀」：觉醒会让其他角色都获得“傀”，随后「纵傀」因此无目标可选，
// 与旧实现「觉醒 → 挑傀」的先后一致。
registerSkill({
  hero: '卑弥呼',
  skill: '拜假',
  locked: true,
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner: Player) => {
      if (owner.id !== ctx.self.id) return;
      if (ctx.self.baiJiaAwakened) return;
      if ((ctx.self.juMarks ?? 0) < 7) return;
      ctx.self.baiJiaAwakened = true;
      ctx.self.maxHp += 1;
      ctx.self.hp = Math.min(ctx.self.hp + 1, ctx.self.maxHp);
      for (const o of ctx.players) {
        if (o.id !== ctx.self.id && !o.isDead && !o.hasKui) o.hasKui = true;
      }
      ctx.log('【拜假】卑弥呼觉醒：体力上限+1、回复1点体力，所有其他角色获得“傀”，失去「骨疽」获得「蚕食」');
      ctx.banner();
      await ctx.delay(700);
    },
  },
});

// ── 卑弥呼「纵傀」：回合开始时，令一名没有“傀”的其他角色获得“傀”（优先敌人）──
// 旧实现里同一段还有「每轮开始时令体力最少者得傀」的分支，因依赖 App 的
// roundLastTurnRef（轮次检测），本轮只迁移自己回合开始这一半。
registerSkill({
  hero: '卑弥呼',
  skill: '纵傀',
  locked: true,
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner: Player) => {
      if (owner.id !== ctx.self.id) return;
      const cand = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && !p.hasKui);
      if (!cand.length) return;
      const pick = [...cand].sort((a, b) =>
        (isEnemy(ctx.self, b) ? 1 : 0) - (isEnemy(ctx.self, a) ? 1 : 0))[0];
      pick.hasKui = true;
      ctx.log(`【纵傀】卑弥呼令 ${pick.hero.name} 获得“傀”标记`);
      ctx.banner();
      await ctx.delay(400);
    },
  },
});

// ── 王元姬「尚俭」：任一角色的结束阶段，本回合失去的牌数不大于体力值则摸等量牌 ──
// 旧实现：只在 0 < lost <= hp 时清零并摸牌（lost > hp 时不清零，继续累计）。
registerSkill({
  hero: '王元姬',
  skill: '尚俭',
  locked: true,
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      // 旧代码在**每个**回合开始时无条件清零（不只是自己的回合）
      ctx.self.lostCardsThisTurn = 0;
    },
    onTurnEnd: async (ctx: SkillContext) => {
      const lost = ctx.self.lostCardsThisTurn ?? 0;
      if (lost <= 0) return;
      if (lost > ctx.self.hp) return;
      ctx.self.lostCardsThisTurn = 0;
      ctx.draw(ctx.self.id, lost);
      ctx.log(`【尚俭】王元姬本回合失去 ${lost} 张牌（不大于体力 ${ctx.self.hp}），摸 ${lost} 张牌`);
      ctx.banner();
      await ctx.delay(400);
    },
  },
});

// ── 张昌蒲「严教」：回合开始时，摸回上回合交出牌数（旧实现每个回合开始都结算）──
// 出牌阶段的发动部分由技能按钮 / AI 分支驱动，属交互逻辑，留在 App.tsx。
registerSkill({
  hero: '张昌蒲',
  skill: '严教',
  hooks: {
    onTurnStart: async (ctx: SkillContext) => {
      const n = ctx.self.yanjiaoCount ?? 0;
      if (n <= 0) return;
      ctx.self.yanjiaoCount = 0;
      ctx.draw(ctx.self.id, n);
      ctx.log(`【严教】张昌蒲下回合开始，摸 ${n} 张牌`);
      ctx.banner();
      await ctx.delay(300);
    },
  },
});

// ── 何太后「戚乱」：击杀数每回合清零；任一角色的结束阶段按 3×击杀数摸牌 ──
// 旧实现用 App 的 hetaishouKillsRef，本次改记在 Player.killsThisTurn 上以便技能读取。
registerSkill({
  hero: '何太后',
  skill: '戚乱',
  locked: true,
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      // 旧代码在**每个**回合开始时无条件清零（不只是自己的回合）
      ctx.self.killsThisTurn = 0;
    },
    onTurnEnd: async (ctx: SkillContext) => {
      const kills = ctx.self.killsThisTurn ?? 0;
      if (kills <= 0) return;
      const drawN = kills * 3;
      ctx.log(`何太后发动「戚乱」，本回合击杀 ${kills} 人，摸 ${drawN} 张牌`);
      ctx.banner();
      ctx.draw(ctx.self.id, drawN);
      await ctx.delay(400);
    },
  },
});
