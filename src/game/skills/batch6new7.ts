import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';

/**
 * 第六批女将 · 第 7 组（分配 6 个，都是**牌堆 / 判定类**）。
 *
 * 实装 1 个：
 *   柏灵筠「黠策」  第 2 项（当你造成伤害后，你可以弃置一张牌，回复 1 点体力）
 *                   —— afterDealDamage + ctx.discard/ctx.heal，两者在伤害站点
 *                   （combat.ts:2769 的 deps）都已接线，是**不降级**的完整子项。
 *                   「每回合每项各限一次」用 onTurnStart 复位（与「铿锵」「俐影」同一做法）。
 *                   第 1 项（令一名其他角色本回合所有非锁定技失效）缺引擎能力，见下方说明。
 *
 * 未实装 5 个（逐条写明缺什么 API；它们继续留在 skillCoverage.test.ts 的 LEGACY_INLINE 里）：
 *   全惠解「慧淑」  缺「摸牌阶段结束」时机 + 弃牌堆访问
 *   全惠解「离宫」  缺「失去技能 / 获得技能」入口（且 changeMaxHp 在准备阶段未接线）
 *   柏灵筠「灵慧」  缺「使用一张牌」入口 + 牌堆顶可见性（onTurnEnd 站点未接线）
 *   曹金玉「隅泣」  peekDeck / takeFromDeck 在 afterDamage 站点未接线（逻辑本身可写）
 *   赵嫣  「锦绘」  缺「使用一张牌」入口 + 目标数元数据
 *
 * 取舍说明：注册表条目是「这一局里真的会发动」的承诺。一个 ctx 能力缺席时会**静默不触发**
 * 的技能（dispatch.ts:139-142 给缺席的可选能力配了退化成空数组的桩），比留在 LEGACY_INLINE
 * 里更糟——那正是 skillCoverage.test.ts 存在的理由。所以本组只注册能力齐备的那一个，
 * 其余退回并把缺口精确到 file:line，而不是先用近似实现占住条目。
 */

// ── 柏灵筠「黠策」──────────────────────────────────────
// 原文（constants.ts:1173）：每回合每项各限一次：1.当你受到伤害后，你可以令一名其他角色
// 本回合所有非锁定技失效；2.当你造成伤害后，你可以弃置一张牌，回复 1 点体力。
//
// 第 1 项**缺引擎能力**，故不写：
//   「令其他角色本回合所有非锁定技失效」需要一个「按角色禁用技能」的写入点。引擎里只有
//   只读的 skillsOn(playerId)（App.tsx:1141，由 skillSealRef / generalRemoved 决定），
//   SkillContext（registry.ts:17-99）没有任何与之对应的写入口；邹氏「倾城」的技能封印
//   （App.tsx:1140 → src/game/ai/skillGate.ts）是**整角色**封印、且同样不对技能开放；
//   源码里也没有「非锁定技」这个粒度（全仓只有技能原文出现过这个词，代码零命中）。
//   用 heroMemory 记一个标记是假失效，
//   会让玩家以为技能被封住了，所以不做。
//
// 第 2 项是本文件实装的部分：代价（弃一张手牌）与收益（回复 1 点体力）都是真原语，
// 触发时机 afterDealDamage 在战斗结算内（combat.ts:2769）。
//
// 「每回合每项各限一次」的语义：复位点是 onTurnStart（对**任意角色**的回合开始都会分发，
// dispatch.ts:204-210），不能拿 turnOwner.id 当 key——同一角色下一轮再开局时 key 相同、
// 标记永不清除（「铿锵」踩过这个坑）。只实装了一项，所以只需要一个标记；第 1 项将来落地时
// 要另加一个标记，不能共用。
//
// 两个分支的差别写在代码里：人类玩家显式选择时按原文结算（体力已满时引擎会把回复夹到
// maxHp，等于白弃一张——那是玩家自己的选择）；AI / 托管（requestChoice 返回 null）在
// 体力已满时直接不发动，不替 AI 白扔一张牌。
// 「不发动」不消耗本回合的「一次」：限次记的是**发动**次数，掠过触发不算发动
// （与「俐影」同一口径：只有真的结算了才置位）。
registerSkill({
  hero: '柏灵筠',
  skill: '黠策',
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.usedDealDamage;
    },
    afterDealDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      // 只处理「自己造成的伤害」；原文没有「其他角色」的限定，因此不排除自伤
      if (ev.source?.id !== ctx.self.id) return;
      if (ev.amount <= 0) return;
      if (ctx.memory.usedDealDamage) return;
      // 付不起代价（空手牌）时不发动：没有「弃置一张牌」这一动作
      if (!ctx.self.hand.length) return;
      const picked = await ctx.requestChoice({
        title: '黠策：弃置一张牌，回复 1 点体力',
        hint: '你对 ' + ev.victim.hero.name + ' 造成了 ' + ev.amount + ' 点伤害',
        mode: 'multi',
        choices: ctx.self.hand.map(c => ({ id: c.id, label: '【' + c.name + '】' + c.suit, desc: '弃置此牌，回复 1 点体力' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      // AI / 托管：体力已满时回复无收益，不白弃一张牌
      if (!picked && ctx.self.hp >= ctx.self.maxHp) return;
      const chosenId = picked && picked.kind === 'multi' ? String(picked.ids?.[0] ?? '') : '';
      // AI / 托管：弃第一张手牌（与「复学」同一口径）
      const cost = ctx.self.hand.find(c => c.id === chosenId) ?? ctx.self.hand[0];
      if (!cost) return;
      ctx.memory.usedDealDamage = true;
      ctx.discard(ctx.self.id, [cost]);
      const healed = ctx.heal(ctx.self.id, 1);
      ctx.log('【黠策】' + ctx.self.hero.name + ' 弃置【' + cost.name + '】，回复 ' + healed
        + ' 点体力（本回合「造成伤害后」这一项已用）');
      ctx.banner();
    },
  },
});

// ── 全惠解「慧淑」——未实装 ──────────────────────────────
// 原文（constants.ts:1161）：摸牌阶段结束时，你可以摸 2 张牌，然后随机弃置 1 张手牌。
// 若如此做，当你本回合弃置牌的总数第一次大于 2 时，你从弃牌堆中随机获得一张锦囊牌。
// （「慧淑」的两个数字就是这里的「摸 2 张」与「总数大于 2」：heroMemory.huishu，
//   初始 [2, 2]，「易数」已在改它——batch6new2.ts:89。）
//
// 两个缺口，各自都足以让技能不能忠实落地：
//   a) **没有「摸牌阶段结束时」这个时机**。SkillHooks（registry.ts:130-195）里与摸牌阶段
//      有关的只有 drawPhaseBonus（只返回额外摸牌数）与 drawPhaseBegin，而 drawPhaseBegin
//      在**摸牌之前**派发（App.tsx:3157 派发、3162 才 drawCards）。改用它等于把「摸 2 张后
//      再随机弃 1 张」变成「随机弃 1 张后再摸 2 张」——弃置的牌池不含刚摸到的牌，是
//      可观察的结算差异，不是时机标注问题。
//   b) **技能拿不到弃牌堆**。ctx 的牌堆原语只有 peekDeck / deckTo / takeFromDeck
//      （registry.ts:61-83、App.tsx:931-968），三个都只作用于 deckRef；弃牌堆是
//      discardPileRef（combat.ts:36 的 CombatDeps 字段），没有任何 ctx 出口。
//      因此「从弃牌堆中随机获得一张锦囊牌」无法结算，而这是本技能的收益所在。
// 需要补：a) 摸牌阶段结束的钩子（或在 drawPhaseBegin 之外给一个摸牌后时机）；
//         b) ctx 增加弃牌堆访问（如 peekDiscard(n) / takeFromDiscard(pred, n)）。

// ── 全惠解「离宫」（觉醒技）——未实装 ──────────────────────
// 原文（constants.ts:1161）：觉醒技，准备阶段，若「慧淑」有数字达到 5，你加 1 点体力上限
// 并回复 1 点体力，失去技能「慧淑」和「易数」，然后随机抽取四个吴国女性武将，
// 且可以获得其中两个技能。
//
//   a) **没有「失去技能」入口**。技能是否生效由 App 的 skillsOn 决定（App.tsx:1141，
//      输入是 skillSealRef / generalRemoved 两个 ref，ctx 不可写）。App 里确实有
//      grantSkill / revokeSkill（App.tsx:1219 / 1240），但它们只操作 Player.grantedSkills
//      ——「额外授予的技能」，既没暴露给 SkillContext，也无法撤掉本职技能。
//      只往 heroMemory 写一个「已失去」标记是假失去（技能照常触发），不写。
//   b) **没有「随机抽取武将并令其获得其中两个技能」**：需要武将牌池 + 上述授予入口，
//      两者技能侧都不可达。
//   c) 剩下的「加 1 点体力上限」也只有近似：ctx.changeMaxHp 存在（registry.ts:75），
//      但准备阶段派发点 App.tsx:2645 是**手写 deps**、没传 changeMaxHp，
//      于是 ctx.changeMaxHp 退化成空实现（dispatch.ts:141）。直接改 ctx.self.maxHp
//      依赖「之后有一次 updatePlayer 把它提交」，在 onTurnStart 时机没有这个保证。
// 需要补：a) ctx 增加「失去/获得技能」入口（含按名字撤本职技能 + 授予抽取到的技能）；
//         b) App.tsx:2645 的 dispatchTurnStart deps 补 changeMaxHp。
// 这一条的三个子句里有两个是技能的主效果，所以整条退回。

// ── 柏灵筠「灵慧」——未实装 ──────────────────────────────
// 原文（constants.ts:1173）：一名角色的结束阶段，若该角色为你或本回合有角色进入过濒死状态，
// 你可以观看牌堆顶的三张牌，然后你可以使用其中一张并随机获得其余牌的其中一张。
//
//   a) **没有「使用一张牌」入口**。SkillContext 只有 draw / discard / heal / damage /
//      gainCard（registry.ts:25-29）。要「使用其中一张」必须能构造并走完一次完整的用牌
//      流程（目标合法性、次数、响应、无懈），引擎侧没有这个原语——「花火」当初正是因为
//      同一缺口被退回（batch6new2.ts:25-28）。
//   b) **结束阶段看不到牌堆顶**。时机 onTurnEnd 存在（本技能用它），但派发点
//      App.tsx:4062 同样是手写 deps、没传 peekDeck/deckTo，于是 ctx.peekDeck 退化成
//      返回空数组（dispatch.ts:139），技能会静默不触发。
// 需要补：a) ctx 增加「使用一张牌」入口；b) App.tsx:4062 的 dispatchTurnEnd deps 补
//         peekDeck / deckTo（App.tsx:931-947 的 buildSkillDeps 已有现成实现，直接搬即可）。

// ── 曹金玉「隅泣」——未实装 ──────────────────────────────
// 原文（constants.ts:1185）：每回合限两次，当一名角色受到伤害后，若你计算与其的距离不大于 0，
// 你可以观看牌堆顶的 3 张牌，将其中至多 1 张牌交给该角色，获得其中至多 1 张牌，
// 然后剩余的牌放回牌堆顶。
//
// **逻辑本身可写**（这也是本组唯一「只差接线」的一条）：
//   · afterDamage（registry.ts:138）就是「一名角色受到伤害后」；
//   · 距离用 rules.ts:59 的 seatDistance（ctx.players + 双方 id），与 App 的 getDistance
//     同一份真值（batch6new.ts:177「☆ 铩雪」同一用法）；
//   · 牌堆顶三张 = peekDeck(n)；交给受伤者 = gainCard；自己获得 = gainCard；
//     「剩余放回牌堆顶」天然成立（peekDeck 只读，只把选中的牌用 takeFromDeck 取走）；
//   · 「每回合限两次」与「观看 3 张」这两个数字就是 heroMemory.yuqi
//     （数组：[每回合次数, 观看张数]，初始 [2,3]，单项上限 5）——与「娴静」
//     （batch6new2.ts:217）、「善身」（batch6new3.ts:20-32）改的是**同一份**状态，
//     所以必须读 heroMemory.yuqi 的数组形状，不能另立一份。
//
// **阻塞点在接线，不在这个文件**：受伤伤害的派发点 combat.ts:2752 是手写 deps，
// 只传了 draw / discard / heal / damage / gainCard / log / banner / delay / skillsOn /
// requestChoice；peekDeck / deckTo / takeFromDeck 一个都没传 → ctx.peekDeck 退化成
// ()=>[]（dispatch.ts:139），技能在真实对局里永远静默不发动。
// 需要的改动（1 处，不在本文件 Boundary 内）：combat.ts:2752 的 deps 补三项，
// combat.ts 已持有 deckRef（CombatDeps.deckRef，第 33 行），实现可直接照
// App.tsx:931-968 的 buildSkillDeps：
//   peekDeck: (n) => [...deckRef.current].slice(-n).reverse(),
//   deckTo:  (n, dest, toId) => { … 同 App … },
//   takeFromDeck: (pred, n) => { … 同 App … },
// 接线完成后本技能按上面的形状注册即可（不需要新原语）。

// ── 赵嫣「锦绘」——未实装 ────────────────────────────────
// 原文（constants.ts:1245）：出牌阶段限一次，你可以随机亮出牌堆中三张牌名不同且目标数默认
// 或可选择为 1 的非伤害牌，将这些牌置于你的武将牌上直到此技能发动结束。你选择一名其他角色，
// 其使用其中一张，然后你可以使用其余两张牌中的任意张……。
//
//   a) **没有「使用一张牌」入口**（同「灵慧」a、batch6new2.ts:25-28）：本技能的核心就是
//      「其使用其中一张 / 你使用其余两张」，没有用牌原语时整条技能只剩「把三张牌放到
//      武将牌上」（placedCards，曹宪「灵犀」已在用），那只是把牌从牌堆挪了个地方，
//      效果全都不发生——属于明确的降级。
//   b) **没有「出牌阶段」时机**，仓库既有做法是挂阶段边界（「才韵」「复学」「拾芳」「讽言」），
//      但那不能弥补 a。
//   c) **没有牌面元数据**：筛选条件是「牌名不同且目标数默认或可选择为 1 的非伤害牌」。
//      Card（types.ts）只有 name / type / suit / rank / value 等字段，没有「目标数」
//      也没有「是否伤害牌」；目标数与伤害与否是在战斗结算里按牌名分支决定的
//      （combat.ts），技能侧读不到这张表。
// 需要补：a) 用牌原语；b) 出牌阶段钩子；c) 一张可查的牌定义表（目标数 / 伤害属性）。
