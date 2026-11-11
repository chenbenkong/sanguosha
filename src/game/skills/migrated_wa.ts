import { registerSkill } from './registry';
import type { SkillContext } from './registry';
import type { Player } from '../../../types';

/**
 * 迁移批次 2：把 chunk1 清单里「时机与判定完全能被现有钩子表达」的技能搬到注册表。
 *
 * 筛选标准（三条全部满足才搬）：
 *  1. 触发时机与旧内联分支一致，且不需要注册表暂时没有的能力
 *     （替换伤害 / 令牌无效 / 改装备区 / 看牌堆顶 / 改攻击距离 / 濒死救援）；
 *  2. 副作用只用 ctx.draw / ctx.discard / ctx.heal / ctx.gainCard；
 *  3. 不需要 App.tsx 里的 ref 状态（限一次计数、本回合标记、等级等）。
 * 不满足的技能留在 LEGACY_INLINE，理由见迁移报告。
 *
 * 本批 4 个：夏侯氏「樵拾」、王异「秘计」、甘夫人「神智」、曹节「惠民」。
 *
 * 与旧实现的三点已知差异（技能自身规则不变，但属分发器固有契约，如实记录）：
 *  1. skillsOn 门禁：注册表统一由 ownersOf 过滤，因此旧「秘计」「惠民」里
 *     漏写的 skillsOn 判断现在统一生效（邹氏「倾城」暗置封印同样封得住它们）。
 *  2. 同阶段内的结算顺序：注册表的同类钩子在一次 dispatch 里连续执行，
 *     位置固定在阶段入口，早于仍写在 App.tsx 里的同阶段内联分支。
 *     按判定依据逐条核对，只有依赖**他人手牌数**的技能受此影响：
 *       · 秘计：只看自己的 hp/maxHp，与手牌无关 —— 顺序不敏感；
 *       · 神智：门槛是「自己手牌数 ≥ 体力值」，而回合开始阶段里的
 *         「周妃·良姻」会给这类角色补牌，顺序改变后会改变门槛是否成立；
 *       · 樵拾：比的是结束者与夏侯氏的手牌数，二者都不会被
 *         同阶段其它分支改动（燕语只在夏侯氏自己的回合触发，与樵拾互斥）
 *         —— 顺序不敏感；
 *       · 惠民：X = 全场「手牌数 < 体力值」的人数，会被同阶段的
 *         「蔡夫人·窃听」摸牌改变 —— 顺序敏感。
 *     即：神智、惠民 的**触发阈值**在极窄场合会与旧实现不同（技能自身规则未改）。
 *     本批内彼此的先后关系已按旧代码对齐（樵拾 注册在 惠民 之前）。
 *  3. ctx.self 是分发时的快照：惠民分发时要连刚摸到的牌一起发，
 *     旧实现靠每轮重读 playersRef，这里改为 ctx.draw 的返回值显式记账。
 */

// ── 夏侯氏「樵拾」：其他角色的结束阶段，若其手牌数等于夏侯氏，令其摸一张，然后夏侯氏摸一张 ──
// 注册顺序有意排在「惠民」之前：见文件头第 2 点。
registerSkill({
  hero: '夏侯氏',
  skill: '樵拾',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id === ctx.self.id) return;
      if (ending.isDead) return;
      if (ending.hand.length !== ctx.self.hand.length) return;
      ctx.log(`【樵拾】${ending.hero.name} 与夏侯氏手牌数同为 ${ending.hand.length}，令其摸一张牌，夏侯氏摸一张牌`);
      ctx.banner();
      ctx.draw(ending.id, 1);
      ctx.draw(ctx.self.id, 1);
      await ctx.delay(300);
    },
  },
});

// ── 王异「秘计」：回合开始时若已受伤，摸等同于已损失体力的牌 ──
registerSkill({
  hero: '王异',
  skill: '秘计',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner: Player) => {
      if (owner.id !== ctx.self.id) return;
      const lostHp = ctx.self.maxHp - ctx.self.hp;
      if (lostHp <= 0) return;
      ctx.log(`${ctx.self.hero.name} 发动「秘计」，已损失 ${lostHp} 点体力，摸 ${lostHp} 张牌`);
      ctx.banner();
      ctx.draw(ctx.self.id, lostHp);
      await ctx.delay(600);
    },
  },
});

// ── 甘夫人「神智」：准备阶段弃置所有手牌，弃置数不小于体力值则回复 1 点 ──
registerSkill({
  hero: '甘夫人',
  skill: '神智',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner: Player) => {
      if (owner.id !== ctx.self.id) return;
      // 旧实现三条件：手牌数 ≥ 体力值、已受伤（未受伤时回复无收益，故不发动）、有手牌
      if (ctx.self.hand.length < ctx.self.hp) return;
      if (ctx.self.hp >= ctx.self.maxHp) return;
      if (ctx.self.hand.length === 0) return;
      const discarded = [...ctx.self.hand];
      ctx.discard(ctx.self.id, discarded);
      ctx.log(`甘夫人发动「神智」，弃置 ${discarded.length} 张手牌`);
      ctx.banner();
      await ctx.delay(400);
      const healed = ctx.heal(ctx.self.id, 1);
      if (healed > 0) ctx.log(`甘夫人回复 1 点体力（${ctx.self.hp + healed}/${ctx.self.maxHp}）`);
      await ctx.delay(400);
    },
  },
});

// ── 曹节「惠民」：结束阶段摸 X 张（X 为手牌数小于体力值的角色数），再依次交给这些角色各一张 ──
registerSkill({
  hero: '曹节',
  skill: '惠民',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      const needy = ctx.players.filter(p => !p.isDead && p.hand.length < p.hp);
      const x = needy.length;
      if (x === 0) return;
      ctx.log(`${ctx.self.hero.name} 发动「惠民」，摸 ${x} 张牌并分给 ${needy.map(p => p.hero.name).join('、')}`);
      ctx.banner();
      const drawn = ctx.draw(ctx.self.id, x);
      await ctx.delay(300);
      // 旧实现每轮重读 playersRef（含刚摸到的牌）；ctx.self 是分发时的快照，
      // 这里自己记账，既包含新摸的牌，也不会把同一张牌交给多个角色。
      const hand = [...ctx.self.hand, ...drawn];
      for (const r of [...needy].sort((a, b) => a.hand.length - b.hand.length)) {
        if (hand.length === 0 || r.isDead) break;
        const gift = hand.splice(Math.floor(Math.random() * hand.length), 1)[0];
        ctx.gainCard(ctx.self.id, r.id, gift);
        ctx.log(`${ctx.self.hero.name} 将【${gift.name}】交给 ${r.hero.name}`);
        await ctx.delay(250);
      }
    },
  },
});
