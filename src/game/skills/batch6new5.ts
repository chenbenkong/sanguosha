import { registerSkill } from './registry';
import type { SkillContext, CardGainEvent, CardTargetsEvent, DeathEvent } from './registry';
import { CardName } from '../../../types';
import type { Card } from '../../../types';

/**
 * 第六批女将 · 第 5 组：**引擎能力补齐后**回填的 4 个技能。
 *
 * 这 4 个技能此前在 batch6new2/3/4 里被明确退回，理由都是「引擎缺原语」。
 * 现在对应的原语都已接通真实引擎点，本文件只用它们，没有任何降级实现：
 *
 *   王荣「追德」  afterDeath（ownersOf 已放开 isDead）+ takeFromDeck(pred, count)
 *   卢弈「邀弈」  onTargetsChosen（combat.ts resolveCardEffect 开头）+ ctx.discard
 *   张怀「劳燕」  同上（锁定技，不询问）
 *   芮姬「俐影」  afterCardGain（App.tsx mutateHand 只上报真正新增的牌）
 *
 * 唯一仍未实装的是马伶俐「花火」：它需要「使用一张牌」的入口（useCardAs），
 * 本组不涉及。它继续留在 skillCoverage.test.ts 的 LEGACY_INLINE 里。
 */

/** 其他存活角色（死亡角色不再「获得牌」，也不会成为交给对象） */
const otherAlive = (ctx: SkillContext) =>
  ctx.players.filter(p => p.id !== ctx.self.id && !p.isDead);

// ── 王荣「追德」────────────────────────────────────────
// 当你死亡时，你可以令一名其他角色获得四张不同牌名的基本牌。
//
// 「四张不同牌名」在基本牌里就是杀 / 闪 / 桃 / 酒这四种，是**确定的**四种，
// 所以逐名调用 takeFromDeck 精确取，而不是摸四张碰运气——
// 后者正是当初拒绝实装的理由（拿到什么全看牌堆，语义被改掉）。
//
// 牌堆凑不齐时按实际可得数量给，并在战报里写明「只取到 N 种」，
// 不静默少给、也不补别的牌名。
//
// 交给谁：requestChoice(mode:'target')；AI / 托管（返回 null）取手牌最少的那个，
// 与「顺世」「媵予」等既有给牌技能同一口径（给最需要的人）。
const ZHUIDE_NAMES: CardName[] = [CardName.SHA, CardName.SHAN, CardName.TAO, CardName.JIU];

registerSkill({
  hero: '王荣',
  skill: '追德',
  hooks: {
    afterDeath: async (ctx: SkillContext, ev: DeathEvent) => {
      // afterDeath 会派发给场上所有该武将的所有者（含已阵亡者本身），
      // 所以「当你死亡时」必须自己判定一次。
      if (ev.dead.id !== ctx.self.id) return;
      const others = otherAlive(ctx);
      if (!others.length) return;
      const picked = await ctx.requestChoice({
        title: '追德：选择获得四张基本牌的角色',
        hint: '四张不同牌名：杀 / 闪 / 桃 / 酒',
        mode: 'target',
        targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: p.hand.length + ' 张手牌' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const recv = (picked && picked.kind === 'target'
        ? others.find(p => p.id === Number(picked.ids?.[0]))
        : null) ?? [...others].sort((a, b) => a.hand.length - b.hand.length)[0];

      const taken: Card[] = [];
      for (const name of ZHUIDE_NAMES) {
        const got = ctx.takeFromDeck(c => c.name === name, 1);
        if (got.length) taken.push(got[0]);
      }
      // 四种一张都凑不到：给了也没有「获得牌」这一结果，不发动
      if (!taken.length) return;
      for (const c of taken) ctx.gainCard(ctx.self.id, recv.id, c);

      const names = taken.map(c => '【' + c.name + '】').join('');
      const short = taken.length < ZHUIDE_NAMES.length
        ? '（牌堆只取到 ' + taken.length + ' 种）'
        : '';
      ctx.log('【追德】' + ctx.self.hero.name + ' 死亡，令 ' + recv.hero.name
        + ' 获得 ' + taken.length + ' 张不同牌名的基本牌：' + names + short);
      ctx.banner();
    },
  },
});

// ── 卢弈「邀弈」────────────────────────────────────────
// 当一名角色使用【杀】时，你可以弃置一张牌，令此【杀】的目标改为你。
//
// 只能挂 onTargetsChosen：这是 combat.ts 里**唯一**还在「目标已定、效果未结算」
// 的时机（afterCardUsed 在 finally 里，伤害已经落地）。改写后的列表由
// combat.ts 覆盖外层 targets，后续所有分支（响应 / 伤害 / 距离）都基于新目标。
//
// 代价「弃置一张牌」用 ctx.discard：引擎的实现只从**手牌**移除
// （App.tsx 的 discardCards 按手牌过滤），所以这里只把手牌当可弃范围，
// 装备区的牌不作为代价——写清楚比假装支持更好。
//
// 「你可以」：requestChoice 返回 cancel 表示玩家主动放弃；AI / 托管返回 null，
// 走自动分支——只要付得起代价就发动（把杀引到自己身上是该技能的既定收益模式）。
registerSkill({
  hero: '卢弈',
  skill: '邀弈',
  hooks: {
    onTargetsChosen: async (ctx: SkillContext, ev: CardTargetsEvent) => {
      if (ev.card.name !== CardName.SHA) return null;
      // 没有目标就无可改写（正常【杀】必有目标，这里是防御）
      if (!ev.targets.length) return null;
      // 目标里已经有自己：无需改写（也避免同一张杀被反复改写）
      if (ev.targets.some(t => t.id === ctx.self.id)) return null;
      // 自己就是使用者：把目标改成自己等于自伤，不发动
      if (ev.source.id === ctx.self.id) return null;
      if (!ctx.self.hand.length) return null;
      const picked = await ctx.requestChoice({
        title: '邀弈：是否弃一张牌，令此【杀】的目标改为你？',
        hint: '来源：' + ev.source.hero.name + ' 的【杀】',
        mode: 'multi',
        choices: ctx.self.hand.map(c => ({ id: c.id, label: '【' + c.name + '】' + c.suit, desc: '弃置' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return null;
      const chosen = picked && picked.kind === 'multi' && picked.ids?.length
        ? ctx.self.hand.filter(c => picked.ids!.map(String).includes(c.id))
        : ctx.self.hand.slice(0, 1);
      if (!chosen.length) return null;
      ctx.discard(ctx.self.id, [chosen[0]]);
      return {
        targets: [ctx.self],
        note: '【邀弈】' + ctx.self.hero.name + ' 弃置一张牌，令 ' + ev.source.hero.name
          + ' 的【杀】目标改为自己',
      };
    },
  },
});

// ── 张怀「劳燕」────────────────────────────────────────
// 锁定技，当一张牌指定多个目标时，若你为目标之一，你令此牌对其他角色无效。
//
// 锁定技 = 强制执行、不询问（locked: true，与「易数」「困励」同一口径），
// 因此这里不调 requestChoice，直接把目标裁成自己一个。
// 裁剪发生在结算前（onTargetsChosen），所以其他角色根本不会被结算到，
// 而不是「结算完再把伤害撤掉」。
//
// 注册顺序有意义：dispatchTargets 按注册顺序串行，后一个看到前一个改过的列表，
// 所以「邀弈」先把目标改成卢弈之后，「劳燕」仍能基于新列表判断。
registerSkill({
  hero: '张怀',
  skill: '劳燕',
  locked: true,
  hooks: {
    onTargetsChosen: (ctx: SkillContext, ev: CardTargetsEvent) => {
      // 「指定多个目标」：单目标牌不属于本技能
      if (ev.targets.length <= 1) return null;
      if (!ev.targets.some(t => t.id === ctx.self.id)) return null;
      const others = ev.targets.filter(t => t.id !== ctx.self.id);
      return {
        targets: [ctx.self],
        note: '【劳燕】' + ctx.self.hero.name + ' 令此牌对其他角色（'
          + others.map(t => t.hero.name).join('、') + '）无效',
      };
    },
  },
});

// ── 芮姬「俐影」────────────────────────────────────────
// 每回合限一次，当你于摸牌阶段外获得牌后，你可以将其中任意张牌交给一名其他角色，
// 然后摸一张牌。
//
// 「获得牌后」用 afterCardGain：它挂在 mutateHand 上（App.tsx），只上报**真正新增**的
// 牌，所以「交给别人」「弃置」这类减少手牌的动作不会误触发。
//
// 「摸牌阶段外」由引擎结构天然满足：摸牌阶段走 App.tsx 的 drawCards，它直接写
// players 状态、不经过 mutateHand，因此 stage 的摸牌**永远不会**产生 afterCardGain
// （技能自己的 ctx.draw 同理）。这里不需要额外的阶段标记。
//
// 「每回合限一次」的复位点是 onTurnStart —— 它对任意角色的回合开始都会分发，
// 是「新回合」的唯一可靠信号（与「铿锵」同一做法；不能用 turnOwner.id 当 key）。
//
// 「任意张」：requestChoice(mode:'multi')，min 0 表示可以不交（此时仍摸一张，
// 与原文「然后摸一张牌」一致）。AI / 托管（返回 null）交一张给手牌最少的人。
registerSkill({
  hero: '芮姬',
  skill: '俐影',
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.usedThisTurn;
    },
    afterCardGain: async (ctx: SkillContext, ev: CardGainEvent) => {
      // 只有「自己获得牌」才触发
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      if (!ev.cards.length) return;
      const others = otherAlive(ctx);
      if (!others.length) return;
      const picked = await ctx.requestChoice({
        title: '俐影：将至多 ' + ev.cards.length + ' 张牌交给一名其他角色',
        hint: '交给后你摸一张牌',
        mode: 'multi',
        choices: ev.cards.map(c => ({ id: c.id, label: '【' + c.name + '】' + c.suit, desc: '交给他人' })),
        min: 0,
        max: ev.cards.length,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosen = picked && picked.kind === 'multi'
        ? ev.cards.filter(c => (picked.ids ?? []).map(String).includes(c.id))
        : ev.cards.slice(0, 1);

      const pickedTgt = await ctx.requestChoice({
        title: '俐影：选择交给谁',
        hint: '交出后你摸一张牌',
        mode: 'target',
        targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: p.hand.length + ' 张手牌' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (pickedTgt && pickedTgt.kind === 'cancel') return;
      const target = (pickedTgt && pickedTgt.kind === 'target'
        ? others.find(p => p.id === Number(pickedTgt.ids?.[0]))
        : null) ?? [...others].sort((a, b) => a.hand.length - b.hand.length)[0];

      for (const c of chosen) ctx.gainCard(ctx.self.id, target.id, c);
      ctx.memory.usedThisTurn = true;
      ctx.draw(ctx.self.id, 1);
      ctx.log('【俐影】' + ctx.self.hero.name + ' 将 ' + chosen.length + ' 张牌交给 '
        + target.hero.name + '，然后摸一张牌');
      ctx.banner();
    },
  },
});
