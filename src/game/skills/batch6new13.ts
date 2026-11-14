import { registerSkill } from './registry';
import type { SkillContext, DrawPhaseEvent, DrawPhaseResult, PlayPhaseEvent } from './registry';
import { CardName } from '../../../types';

/**
 * 第六批女将 · 第 13 组：任婉（狷急 / 纫霜）+ 曹华（归离）+ 滕公主（幸宠 / 流年）。
 *
 * 本组 5 个技能里**只有任婉「狷急」的选项 1** 能用现有引擎原语实装，本文件只装它。
 * 其余 4 条技能与狷急的选项 2/3 都缺引擎原语（明细见下），一律 hand_back，
 * 不写任何降级版本：它们的键仍留在 skillCoverage.test.ts 的 LEGACY_INLINE 里，
 * 只删掉 `任婉::狷急` 一条。
 *
 * ── 已实装：任婉「狷急」选项 1 ────────────────────────────────
 * 原文（constants.ts:1401 的任婉 skillDesc）：
 *   狷急：你的以下阶段的开始时，可以执行对应选项：
 *     1.摸牌阶段开始时，摸体力上限张牌；
 *     2.出牌阶段开始时，失去 1 点体力，然后视为对一名角色使用【杀】；
 *     3.弃牌阶段开始时，调整手牌至手牌上限，然后弃置一名角色区域内至多 2 张牌。
 *
 * 选项 1 落在 drawPhaseBegin（registry.ts:171）：
 *   · 该钩子只对**摸牌者本人**派发（dispatch.ts:344-357 里 `self.id !== drawerId` 直接跳过），
 *     所以它就是原文的「你的摸牌阶段开始时」，不需要额外判定回合角色。
 *   · 返回的 count 是「改写后的摸牌数」：App.tsx:3183 在 replaced 为假时用
 *     `drawPhase.count ?? drawCount` 作为**整个摸牌阶段**的摸牌数（drawCount 见
 *     App.tsx:3135/3179：基础 2 张 + 已注册的 drawPhaseBonus）。因此
 *     `count = self.maxHp` = 原文的「摸体力上限张牌」（把基础 2 张整段换成体力上限张），
 *     而不是「在 2 张之外再摸体力上限张」。
 *     取的是 self.maxHp 的当前值——changeMaxHp 改过体力上限之后按改后的算。
 *     原文的「至多 5」是「幸宠」X 的上限，狷急的 X 没有上限，这里也不夹。
 *   · 边界（记录，不静默）：ev.count 已含本角色所有 drawPhaseBonus 的累加
 *     （registry.ts:215-219），而这里用体力上限**整段覆盖**它。任婉自身没有
 *     drawPhaseBonus 技能（英姿/福绵分别是周瑜的内联与吴苋的注册加成，不在任婉身上），
 *     所以现状下二者的和就等于基础 2 张；将来若给任婉授予 drawPhaseBonus 类技能，
 *     需要改成「ev.count - 基础摸牌数 + 体力上限」，届时以那时的引擎口径为准。
 *
 * 「可以执行」= 由玩家决定是否执行：
 *   · 人类（requestChoice 有应答）：mode 'choose'，唯一选项为选项 1，cancelLabel 为
 *     「不发动」。本轮只实装选项 1，所以弹窗只呈现这一个选项，**不虚构** 2/3 的入口。
 *   · AI / 托管（requestChoice 返回 null）：体力上限 > 基础摸牌数（即确实有收益）就执行，
 *     否则不发动、也不提问。原文没有规定 AI 策略，写死让对局可复现。
 *   · 取消 / 读秒超时（kind 为 cancel 或 timeout）一律按「不发动」，与 App.tsx:1374 等
 *     既有调用点对 timeout 的口径一致。
 *
 * ── 未实装 1：狷急 选项 2（出牌阶段开始时，失去 1 点体力，然后视为对一名角色使用【杀】）
 * 缺两件原语：
 *   a) 「出牌阶段开始」没有钩子。SkillHooks（registry.ts:147-212）的 18 个钩子里，
 *      阶段边界只有 onTurnStart / onTurnEnd 与 drawPhaseBegin / discardPhaseSkip；
 *      出牌阶段开始时既没有独立钩子，也无法从别的时机区分（用 onTurnStart 近似
 *      不叫「出牌阶段开始」——判定阶段跳过出牌阶段时二者根本不同，故不做）。
 *   b) 「视为使用一张牌」没有入口。SkillContext 能改变牌局的动作只有 draw / discard /
 *      heal / damage / gainCard / peekDeck / deckTo / takeFromDeck / takeFromDiscard /
 *      changeMaxHp / loseHp，没有任何「使用某张牌」的入口；combat.ts 的
 *      resolveCardEffect 与 App.tsx 的 useCard 流程都没有向技能开放。
 *      注意「失去 1 点体力」本身已有原语（ctx.loseHp，registry.ts:90、combat.ts:308），
 *      卡住的只有「视为使用【杀】」这一半。
 * 需要补：SkillContext 增加「视为使用一张牌」的入口（以及出牌阶段开始的钩子）。
 *
 * ── 未实装 2：狷急 选项 3（调整手牌至手牌上限，然后弃置一名角色区域内至多 2 张牌）
 * 缺「区域弃牌」与「当前手牌上限」两个读出口：
 *   · ctx.discard 走 App.tsx:2286 的 discardCards，实现里只从**手牌**过滤
 *     （`p.hand.filter(...)`，App.tsx:2307），装备区 / 判定区的牌弃不掉，
 *     所以「弃置一名角色区域内至多 2 张牌」表达不出来（区域内 = 手牌 + 装备区 + 判定区）。
 *   · 「调整手牌至手牌上限」需要读**当前**手牌上限：它由基础值 + handLimitBonus
 *     钩子（registry.ts:163）+ Player 上的 handLimitDelta 等多处合成，
 *     SkillContext 里没有读取口，技能自己算必然与引擎漂移。
 * 需要补：ctx 增加按区域弃牌（手牌/装备区/判定区）与「当前手牌上限」的读取。
 *
 * ── 未实装 3：滕公主「幸宠」（原文 constants.ts:1425 前半）──────
 *   幸宠：每轮开始时，你可以选择一个不大于 X 的非负整数（X 为你的体力上限，至多为 5），
 *         摸此数量张牌，然后你可以展示至多 Y 张手牌（Y 为 X 减你选择的数，
 *         当你本轮失去一张以此法展示过的牌后，你摸两张牌）。
 * 触发时机是「每轮开始时」——与下面 3 条是同一个缺口：SkillContext（registry.ts:17-116）
 * 没有轮次字段，18 个钩子（registry.ts:147-212）里也没有轮开始 / 轮结束。
 * 「当你本轮失去一张以此法展示过的牌后」同样以**轮**为界（用 onTurnStart 复位会变成
 * 「每回合」，是语义降级，故不做）。
 * 其余部分**不是**阻塞，列在这里是为了不把缺口说得比实际大：
 *   · 「摸 k 张牌」= ctx.draw；「展示至多 Y 张手牌」有既有约定——「才韵」
 *     （batch6new.ts:137-155）就是 requestChoice 选牌 + ctx.memory 记账 + 战报，
 *     引擎没有独立的「展示」原语，也不需要；
 *   · 「失去一张以此法展示过的牌」= afterCardLost（registry.ts:188-195）按牌 id
 *     比对 ctx.memory 里的展示记录。
 * 需要补：轮次信号（与纫霜 / 归离 / 流年 同一条）。
 *
 * ── 未实装 4：任婉「纫霜」（原文 constants.ts:1401）────────────
 *   纫霜：锁定技，你每轮首次进入濒死时，回复体力值至 1 点并增加 1 点体力上限
 *         （至多增加 3 点）。你脱离濒死状态时，复原你的武将牌并视为使用一张普通锦囊牌。
 * 「每轮首次」是硬阻塞：SkillHooks 与 SkillContext 都**没有轮次信号**——
 * SkillContext（registry.ts:17-116）没有 round / turnCount 字段，18 个钩子里也没有
 * 轮开始 / 轮结束；引擎侧的轮次只存在于 App.tsx:373/2981/2993 的 roundLastTurnRef
 * （inline 给卑弥呼「纵傀」用）与 App.tsx:471/2651 的 turnCountRef（**回合**计数），
 * 两者都没有接进 DispatchDeps（dispatch.ts:33-76）。用 onTurnStart 复位会变成
 * 「每回合首次」，是语义降级，故不做。
 * 另外两件也没有：「脱离濒死状态时」没有钩子（onDying 是**求桃前**，registry.ts:204-211，
 * 之后没有任何时机）；「复原你的武将牌」（解翻面 / 解横置）与「视为使用一张普通锦囊牌」
 * 在 SkillContext 里都没有原语。唯一的可用点是第一段的效果本身（onDying 返回 { hp: 1 }
 * 可令引擎跳过求桃、ctx.changeMaxHp 可加上限），但触发条件缺失，装上就是错的。
 * 需要补：轮次信号（如 ctx.roundCount + 轮开始钩子）、脱离濒死钩子、
 * 「复原武将牌」与「视为使用一张牌」的原语。
 *
 * ── 未实装 5：曹华「归离」（原文 constants.ts:1413）────────────
 *   归离：你的第一个回合开始时，你选择一名其他角色。该角色每轮的第一个回合的结束阶段，
 *         若其本回合未造成过伤害，其令你于此回合结束后执行一个额外的回合。
 * 缺「额外的回合」：引擎的回合推进只看 rules.ts 的 nextAliveTurnIndex（按存活者
 * 环形推进），没有任何「插入一个额外回合」的机制；唯一形似的「额外的出牌阶段」是
 * App.tsx:3011-3018/6601-6610 里 inline 给「当先」写的（dangxianExtraPhaseRef），
 * 既没有向注册表开放，也不是「额外的回合」。此外「该角色每轮的第一个回合」同样需要
 * 轮次信号（同上一条）。
 * 需要补：额外的回合机制（可被技能请求「某角色于此回合结束后执行一个额外的回合」）
 * 与轮次信号。
 *
 * ── 未实装 6：滕公主「流年」（原文 constants.ts:1425）────────────
 *   流年：锁定技，一名角色的回合结束时，若本回合牌堆进行过：第一次洗牌，你减 1 点体力上限，
 *         将体力值回复至体力上限，然后你的手牌上限 +10；第二次洗牌，你减 1 点体力上限，
 *         将体力值回复至体力上限，然后防止你本局游戏受到的【杀】造成的伤害。
 * 缺「洗牌信号」：洗牌只发生在两处，且都不通知技能——App.tsx:1506-1511（drawCards 里
 * 牌堆摸空后 `shuffle(currentDiscard)` + `addLog('牌堆已洗切')`）与
 * combat.ts:1448-1454（五谷丰登亮牌前洗切）。没有 wsDispatch、没有任何钩子参数能读到
 * 「本回合洗过几次牌」。本技能的触发条件就是「本回合牌堆进行过第 N 次洗牌」，
 * 拿不到这个信号就无从触发（其余部分其实都有原语：changeMaxHp + ctx.heal 可实现
 * 「减上限并回复至上限」，handLimitBonus 可实现「手牌上限 +10」，
 * damageBefore 可实现「防止【杀】伤害」——但触发时机缺失，装上就是永动机）。
 * 需要补：洗牌事件（向技能派发「本回合第 N 次洗牌」的计数）。
 */
registerSkill({
  hero: '任婉',
  skill: '狷急',
  hooks: {
    drawPhaseBegin: async (
      ctx: SkillContext,
      ev: DrawPhaseEvent,
    ): Promise<DrawPhaseResult | null> => {
      const x = ctx.self.maxHp;
      // AI / 托管：没有收益（体力上限不高于基础摸牌数）就不发动，也不浪费一次提问
      if (!ctx.self.isHuman && x <= ev.count) return null;

      const picked = await ctx.requestChoice({
        title: '狷急：是否执行选项 1（摸体力上限张牌）？',
        hint: '体力上限 ' + x + ' 张，基础摸牌 ' + ev.count + ' 张',
        mode: 'choose',
        choices: [{ id: 'yes', label: '执行选项 1：摸 ' + x + ' 张牌（体力上限）' }],
        cancelLabel: '不发动',
      });
      // 不发动 / 取消 / 读秒超时：不干预，引擎按基础摸牌数结算。
      // （null = AI 或托管，走到这里已保证 x > ev.count，按执行处理）
      if (picked && (picked.kind === 'cancel' || picked.kind === 'timeout')) return null;

      ctx.log('【狷急】' + ctx.self.hero.name + ' 执行选项 1，摸体力上限张牌（'
        + x + ' 张，基础 ' + ev.count + ' 张）');
      ctx.banner();
      return { count: x };
    },

    /**
     * 选项 2（出牌阶段开始时）：失去 1 点体力，然后视为对一名角色使用【杀】。
     *
     * 选项 3（弃牌阶段开始时调整手牌并弃置一名角色区域内至多 2 张牌）**仍未实装**：
     * 「区域」包含装备区 / 判定区，而 ctx 只有手牌的弃置入口（discard 只动 hand）。
     * 缺的是「按区域读 / 按区域弃」两个原语 —— 不写降级版本，否则会变成「只弃手牌」。
     */
    onPlayPhaseBegin: async (ctx: SkillContext, ev: PlayPhaseEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      const others = ctx.players.filter(p => !p.isDead);
      if (others.length === 0) return;
      let targetId: number | undefined;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '狷急：是否执行选项 2（失去 1 点体力，视为对一名角色使用【杀】）',
          mode: 'target',
          targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: '体力 ' + p.hp })),
          min: 1,
          max: 1,
          cancelLabel: '不发动',
        });
        const picked = r && r.kind === 'target' ? r.ids?.[0] : undefined;
        targetId = typeof picked === 'number' ? picked : undefined;
      } else {
        // AI：打体力最低的那个
        targetId = [...others].sort((a, b) => a.hp - b.hp || a.id - b.id)[0].id;
      }
      if (targetId === undefined) return;
      ctx.banner();
      ctx.log('【狷急】' + ctx.self.hero.name + ' 执行选项 2：失去 1 点体力，视为使用【杀】');
      await ctx.loseHp(ctx.self.id, 1);
      await ctx.useCardAs(CardName.SHA, [targetId], { reason: '狷急' });
    },
  },
});
