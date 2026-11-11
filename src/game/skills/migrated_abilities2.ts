import { registerSkill } from './registry';
import type { SkillContext } from './registry';
import { CardName, Suit } from '../../../types';
import type { Card } from '../../../types';
import { EQUIP_META } from '../../../constants';

/**
 * 用新引擎能力 damageBefore 迁移的技能，批次 2。
 *
 * 本批 4 个，都是「伤害数值确定后、扣血前」介入的技能：
 *   孙鲁班「骄矜」/ 灵雎「竭缘」（受伤侧）/ 胡金定「仁释」/ 小乔「天香」。
 *
 * 跳过 4 个，理由见函数末尾注释：刚烈 / 洛神 / 铁骑 / 悲歌。
 *
 * ── 为什么把引擎的 dispatchDamageBefore 从「防具结算前」移到「防具结算后」──
 * 旧内联分支的顺序是：【藤甲】+1 / 【白银狮子】封顶 → 竭缘 -1 → 骄矜 -1 → 仁释 防止。
 * 分发点若留在防具之前，骄矜/竭缘就会先减 1 再被封顶：2 点伤害在【白银狮子】下
 * 旧为 0 点、新为 1 点 —— 那是改规则。移到防具之后，这三个技能与旧实现逐字一致；
 * 代价是【释衅】（火焰免疫）改为在【藤甲】之后判定，仍为 0 点伤害，只多一行 +1 日志。
 *
 * ── 仍存的三处差异（都不改伤害结果，属分发器固有契约，如实记录）──
 *  1. 天香（转移）在分发点生效，早于旧实现里的 弘仪 / 舍裔 / 寒冰剑。
 *     单场同时出现这些技能时，转移会先于它们的减伤/防止发生。
 *  2. 竭缘「造成伤害时 +1」那一半仍留在 combat.ts：它作用于**他人**受到的伤害，
 *     且必须早于【白银狮子】封顶，放进本钩子会变成封顶后 +1（改规则）。
 *  3. 弃牌统一走 ctx.discard（进弃牌堆）。旧竭缘只删手牌、牌凭空消失；旧骄矜
 *     手写 setDiscardPile。现在两者都进弃牌堆，骄矜与旧实现等价，竭缘属修正。
 */

// ── 孙鲁班「骄矜」：受到男性角色造成的伤害时，可弃置一张装备牌令此伤害 -1 ──
// 旧实现位置：src/game/combat.ts takeDamage（【白银狮子】结算后）。
registerSkill({
  hero: '孙鲁班',
  skill: '骄矜',
  hooks: {
    damageBefore: (ctx: SkillContext, ev) => {
      if (ev.victim.id !== ctx.self.id) return null;
      if (!ev.source || ev.source.id === ctx.self.id) return null;
      if (ev.amount <= 0) return null;
      if (ev.source.hero.gender !== 'male') return null;
      const eq = ctx.self.equipment ?? {};
      const cost = Object.values(eq).filter((c): c is Card => !!c)[0];
      if (!cost) return null;
      // 旧实现：本次伤害不致命（打完不低于 1 点）或本身不小于 2 点时才发动
      if (!(ctx.self.hp - ev.amount <= 1 || ev.amount >= 2)) return null;
      const slot = EQUIP_META[cost.name]?.slot;
      if (slot) {
        const next = { ...eq };
        delete next[slot];
        // 直接改快照字段（batch6 起的既有约定）：随后的 ctx.discard 会触发一次
        // players 写入，把这次装备区改动一并提交。
        ctx.self.equipment = next;
      }
      ctx.discard(ctx.self.id, [cost]);
      ctx.log(`【骄矜】${ctx.self.hero.name}弃置【${cost.name}】，此伤害 -1`);
      ctx.banner();
      return { amount: Math.max(0, ev.amount - 1) };
    },
  },
});

// ── 灵雎「竭缘」（受伤侧）：受到伤害时，若来源体力不低于你，可弃一张红色手牌令此伤害 -1 ──
// 旧实现位置：src/game/combat.ts takeDamage（【白银狮子】结算后）。
// 「造成伤害时 +1」那一半仍在原处内联，理由见文件头差异 2。
registerSkill({
  hero: '灵雎',
  skill: '竭缘',
  hooks: {
    damageBefore: (ctx: SkillContext, ev) => {
      if (ev.victim.id !== ctx.self.id) return null;
      if (!ev.source || ev.source.id === ctx.self.id) return null;
      if (ev.amount <= 0) return null;
      if (ev.source.hp < ctx.self.hp) return null;
      const isRed = (c: Card) => c.suit === Suit.HEART || c.suit === Suit.DIAMOND;
      // 旧实现：优先弃非【桃】的红色手牌；体力不大于 2 时才允许弃【桃】
      const red = ctx.self.hand.find(c => isRed(c) && c.name !== CardName.TAO)
        ?? (ctx.self.hp <= 2 ? ctx.self.hand.find(isRed) : undefined);
      if (!red) return null;
      ctx.discard(ctx.self.id, [red]);
      ctx.log(`【竭缘】${ctx.self.hero.name}弃置红色【${red.name}】，此伤害 -1`);
      ctx.banner();
      return { amount: Math.max(0, ev.amount - 1) };
    },
  },
});

// ── 胡金定「仁释」（锁定技）：已受伤时受到【杀】的伤害，防止并获得此【杀】，体力上限 -1 ──
// 旧实现位置：src/game/combat.ts takeDamage（【白银狮子】结算后）。
registerSkill({
  hero: '胡金定',
  skill: '仁释',
  locked: true,
  hooks: {
    damageBefore: (ctx: SkillContext, ev) => {
      if (ev.victim.id !== ctx.self.id) return null;
      if (!ev.source || ev.source.id === ctx.self.id) return null;
      if (ev.card?.name !== CardName.SHA) return null;
      if (ctx.self.hp >= ctx.self.maxHp) return null;
      const newMax = Math.max(1, ctx.self.maxHp - 1);
      // 直接改快照字段：随后的 ctx.gainCard 写入会把体力上限与体力一并提交
      ctx.self.maxHp = newMax;
      ctx.self.hp = Math.min(ctx.self.hp, newMax);
      ctx.gainCard(ctx.self.id, ctx.self.id, ev.card);
      ctx.log(`【仁释】${ctx.self.hero.name}防止此【杀】造成的伤害并获得【${ev.card.name}】，体力上限 -1（${newMax}）`);
      ctx.banner();
      return { prevent: true, note: `【仁释】${ctx.self.hero.name}防止此【杀】的伤害并获得之` };
    },
  },
});

// ── 小乔「天香」：受到伤害时弃一张红桃手牌，将伤害转移给伤害来源 ──
// 旧实现位置：src/game/combat.ts takeDamage（【白银狮子】结算后、铁索传导前）。
registerSkill({
  hero: '小乔',
  skill: '天香',
  hooks: {
    damageBefore: async (ctx: SkillContext, ev) => {
      if (ev.victim.id !== ctx.self.id) return null;
      if (!ev.source || ev.source.id === ctx.self.id) return null;
      const heartCard = ctx.self.hand.find(c => c.suit === Suit.HEART);
      if (!heartCard) return null;
      ctx.discard(ctx.self.id, [heartCard]);
      ctx.log(`${ctx.self.hero.name} 发动「天香」，弃置【${heartCard.name}】将伤害转移给 ${ev.source.hero.name}`);
      ctx.banner();
      await ctx.delay(400);
      // 旧实现：来源已阵亡时既不再转移、也不再承受伤害（等价于防止）
      if (ev.source.isDead) return { prevent: true };
      return { transferTo: ev.source.id };
    },
  },
});

// ── 本批跳过、留在 LEGACY_INLINE 的 4 个（无法用现有 11 个钩子行为等价表达）──
//
// 夏侯惇「刚烈」（combat.ts 伤害后）：需要**主动发起判定**（performJudgment）。
//   judgeBefore 只在引擎已翻出判定牌后生效，不能替技能发起一次判定；
//   SkillContext 也没有判定能力。硬迁只能改成「读牌堆顶再 discard」，会伪造判定演出
//   并绕过 张琪瑛「紫微」/ 司马懿「鬼才」的改判链，属改规则。
//
// 甄姬「洛神」（App.tsx 回合开始，最多 3 次循环）：同上，需要 3 次主动判定，
//   且依赖 performJudgment 的牌堆耗尽洗切逻辑（deckRef/discardPileRef）。
//
// 马超「铁骑」（combat.ts 杀指定目标后）：需要主动判定，且判定结果要**回写**
//   给引擎的「此【杀】不能闪避」流程并直接结算伤害。damageBefore 拿不到
//   「目标无法出闪」这个能力，也没有判定能力。
//
// 蔡文姬「悲歌」（App.tsx triggerBeige，由 combat.ts 调用）：需要主动判定 + 读判定花色。
//   它挂在 afterDamage 上但必须先弃一张牌再判定，现有钩子能给弃牌与摸牌，
//   给不了判定；用「读牌堆顶 + 弃牌」伪造会让 悲歌 与后续所有判定串位（同一张牌被算两次），
//   属改规则。
