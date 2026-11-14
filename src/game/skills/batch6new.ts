import { registerSkill } from './registry';
import type { SkillContext, DamageEvent, CardUsedEvent, CardLostEvent } from './registry';
import { seatDistance } from '../rules.ts';
import { CardName, CardType, Suit } from '../../../types.ts';
import type { Card, Player } from '../../../types.ts';

/** 黑色牌（♠/♣）：董絮「清冷」、邓晚棠「承宠」用 */
const isBlack = (s: Suit): boolean => s === Suit.SPADE || s === Suit.CLUB;
/** 红色牌（♥/♦）：邓晚棠「承宠」用 */
const isRed = (s: Suit): boolean => s === Suit.HEART || s === Suit.DIAMOND;

/**
 * 引擎只有 **4** 个装备栏（weapon / armor / horsePlus / horseMinus），
 * 不是 5 个，也没有「宝物」栏——按 5 栏算会把「空置装备栏数」多算一格。
 */
const EQUIP_SLOTS = ['weapon', 'armor', 'horseMinus', 'horsePlus'] as const;

/** 装备区里的实际牌（0~4 张），按栏位顺序 */
const equipCards = (p: Player): Card[] =>
  EQUIP_SLOTS.map(s => (p.equipment ?? {})[s]).filter((c): c is Card => !!c);

/**
 * 第六批 30 名女将 —— 已实装 10 个。
 *
 * 第一批 4 个是**纯被动**技能，各用 1~2 个钩子（手谈 / ☆ 神威 / 轻幔 / 怯言）。
 * 第二批 6 个用到了跨回合 memory、damageBefore 与 afterCardLost：
 *   才韵 / ☆ 铩雪 / 清冷 / 复学 / 铿锵 / 济困。
 * 全部只用现有钩子，未引入任何引擎改动。
 * 需要「死亡时」「按牌名从牌堆取牌」的技能仍留给后续批次——
 * 那些能力引擎确实没有，硬写只会降级语义。
 *
 * 实装前每个技能都登记在 skillCoverage.test.ts 的 LEGACY_INLINE 里，
 * 实装后即从清单删掉（该清单只允许缩小）——当前这 10 条都已不在清单内。
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

// ── 陆文漪「才韵」─────────────────────────────────────
// 出牌阶段限一次，你可以展示一张牌，若其与此前展示的牌花色均不相同，你摸一张牌。
//
// 引擎没有「出牌阶段」钩子，主动技统一挂在某个阶段边界上、用 requestChoice 询问
// （batch7「和戎」、batch8「尊位」都是这个形状）。这里选「自己回合结束时」结算。
// 「限一次」由 onTurnEnd 每个自己回合只分发一次自然满足，无需额外标记。
// 「此前展示的牌」放在 ctx.memory.shownSuits —— 跨回合保留，正是规则语义。
// 选牌用 mode:'multi' 而不是 'card'：SkillChoiceReq 没有 cards 字段，
// 走 'card' 会给人类玩家弹出空面板（App.tsx:930 只透传 choices/targets）。
registerSkill({
  hero: '陆文漪',
  skill: '才韵',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.self.hand.length === 0) return;
      const picked = await ctx.requestChoice({
        title: '才韵：展示一张牌',
        hint: '若与此前展示过的牌花色均不相同，你摸一张牌',
        mode: 'multi',
        choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}`, desc: '展示此牌' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosenId = picked && picked.kind === 'multi' ? String(picked.ids?.[0] ?? '') : '';
      const shown = ctx.self.hand.find(c => c.id === chosenId) ?? ctx.self.hand[0];
      const seen = (ctx.memory.shownSuits as Suit[] | undefined) ?? [];
      if (seen.includes(shown.suit)) {
        ctx.log(`【才韵】陆文漪展示【${shown.name}】(${shown.suit})，该花色此前展示过，不摸牌`);
        return;
      }
      ctx.memory.shownSuits = [...seen, shown.suit];
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【才韵】陆文漪展示【${shown.name}】(${shown.suit})，与此前展示过的花色均不相同，摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 黄舞蝶「☆ 铩雪」──────────────────────────────────
// 当你对其他角色造成伤害后，你可以摸两张牌，然后弃置 X 张牌（X 为你计算与其的距离）。
//
// 距离直接用 rules.ts 的 seatDistance：App 的 getDistance 就是它加两条临时覆盖
// （App.tsx:1544-1551），所以距离语义是引擎真值，不是「索引差近似」。
// 弃置范围限于手牌：ctx.discard 只处理手牌（App.tsx:915 → discardCards），
// 手牌不足 X 张时弃到空手为止——不谎报张数。
registerSkill({
  hero: '黄舞蝶',
  // 注册名必须与 HEROES.skillName 逐字一致（含 `☆ ` 前缀），否则永不触发。
  skill: '☆ 铩雪',
  hooks: {
    afterDealDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.source?.id !== ctx.self.id) return;
      if (ev.victim.id === ctx.self.id) return;
      if (ev.amount <= 0) return;
      const dist = seatDistance(ctx.players, ctx.self.id, ev.victim.id);
      ctx.draw(ctx.self.id, 2);
      const drop = Math.min(dist, ctx.self.hand.length);
      const discarded = drop > 0 ? ctx.self.hand.slice(0, drop) : [];
      if (discarded.length) ctx.discard(ctx.self.id, discarded);
      ctx.log(`【铩雪】黄舞蝶对 ${ev.victim.hero.name} 造成 ${ev.amount} 点伤害，摸两张牌后弃置 ${discarded.length} 张（与其距离 ${dist}）`);
      ctx.banner();
    },
  },
});

// ── 董絮「清冷」─────────────────────────────────────
// 当你成为黑色非转化牌的目标后，你可以弃置一名角色的一张牌。
// （后半段「若此弃牌为装备牌，该黑色牌对你无效」需要「牌对某人无效」的拦截口，
//  引擎只有 damageBefore 能防止伤害、没有让一张牌整体无效的钩子，故未实现；
//  这里只实装可以忠实表达的弃牌子句。）
//
// 「非转化」同样无法判定：转化牌没有稳定标记（朱雀羽扇转化的火【杀】在
// combat.ts:629 与原件是同一个 Card），所以只判黑色，转化牌会一并算入。
registerSkill({
  hero: '董絮',
  skill: '清冷',
  hooks: {
    afterCardUsed: async (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id === ctx.self.id) return;
      if (!ev.targets.some(t => t.id === ctx.self.id)) return;
      if (!isBlack(ev.card.suit)) return;
      const victims = ctx.players.filter(p => !p.isDead && p.hand.length > 0);
      if (!victims.length) return;
      const picked = await ctx.requestChoice({
        title: '清冷：弃置一名角色的一张牌',
        mode: 'target',
        targets: victims.map(p => ({ id: p.id, name: p.hero.name, sub: `${p.hand.length} 张手牌` })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosenId = picked && picked.kind === 'target' ? Number(picked.ids?.[0]) : NaN;
      // AI / 托管：优先弃伤害来源的牌，否则弃手牌最多者
      const target = victims.find(p => p.id === chosenId)
        ?? victims.find(p => p.id === ev.source.id)
        ?? [...victims].sort((a, b) => b.hand.length - a.hand.length)[0];
      const card = target.hand[0];
      ctx.discard(target.id, [card]);
      ctx.log(`【清冷】董絮成为黑色【${ev.card.name}】的目标，弃置 ${target.hero.name} 的一张牌`);
      ctx.banner();
    },
  },
});

// ── 卢弈「复学」──────────────────────────────────────
// 出牌阶段限一次，你可以弃置一张牌，然后摸两张牌。
// 与「才韵」同一个形状：阶段边界 + requestChoice，AI/托管自动弃第一张手牌。
registerSkill({
  hero: '卢弈',
  skill: '复学',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.self.hand.length === 0) return;
      const picked = await ctx.requestChoice({
        title: '复学：弃置一张牌，然后摸两张牌',
        mode: 'multi',
        choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}` })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosenId = picked && picked.kind === 'multi' ? String(picked.ids?.[0] ?? '') : '';
      const chosen = ctx.self.hand.find(c => c.id === chosenId) ?? ctx.self.hand[0];
      ctx.discard(ctx.self.id, [chosen]);
      ctx.draw(ctx.self.id, 2);
      ctx.log(`【复学】卢弈弃置【${chosen.name}】，摸两张牌`);
      ctx.banner();
    },
  },
});

// ── 文鸳「铿锵」──────────────────────────────────────
// 每回合限一次，当你造成伤害时，你可以选择一项：
//   1. 摸 X 张牌（X 为你的体力上限）；
//   2. 令此伤害 +1 并获得造成伤害的牌。
//
// 必须在 damageBefore 里介入：选项 2 要在结算前改数值。
// 「每回合限一次」的复位点是 onTurnStart —— 它对**任意角色**的回合开始都会分发
// （dispatch.ts:144-150），正是「新回合」的唯一可靠信号。
// 不能像 batch7 异瞳那样用 turnOwner.id 当 key：同一角色下一轮再开局时 key 相同，
// 标记永不清除，技能会变成一局只触发一次。
// 觉醒后「每选项各限一次」的加强形态依赖「殇决」，本批未实装，故只做基础形态。
registerSkill({
  hero: '文鸳',
  skill: '铿锵',
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.usedThisTurn;
      delete ctx.memory.usedDraw;
      delete ctx.memory.usedBoost;
    },
    damageBefore: async (ctx: SkillContext, ev) => {
      if (ev.source?.id !== ctx.self.id) return null;
      if (ev.victim.id === ctx.self.id) return null;
      if (ev.amount <= 0) return null;
      // 「殇决」觉醒后，限次从「每回合限一次」变成「每回合每个选项各限一次」；
      // 开关写在武将共享的 heroMemory 上（batch6new17.ts），原生技能撤不掉、只能自己认。
      const perOption = !!ctx.heroMemory.kqPerOption;
      if (!perOption && ctx.memory.usedThisTurn) return null;
      if (perOption && ctx.memory.usedDraw && ctx.memory.usedBoost) return null;
      const allChoices = [
        { id: 'draw', label: `摸 ${ctx.self.maxHp} 张牌`, desc: '伤害不变' },
        { id: 'boost', label: '此伤害 +1 并获得造成伤害的牌', desc: '对高威胁目标更划算' },
      ];
      const open = allChoices.filter(c =>
        !perOption || !(c.id === 'draw' ? ctx.memory.usedDraw : ctx.memory.usedBoost));
      const picked = await ctx.requestChoice({
        title: '铿锵：造成伤害时选择一项',
        mode: 'choose',
        choices: open,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return null;
      // AI / 托管：对方体力 <= 1 时补刀，否则补牌（已用过的选项自动跳过）
      const wanted = picked && picked.kind === 'choose'
        ? picked.id
        : (ev.victim.hp <= 1 ? 'boost' : 'draw');
      const pick = open.some(c => c.id === wanted) ? wanted : open[0]?.id;
      if (!pick) return null;
      ctx.memory.usedThisTurn = true;
      if (perOption) {
        if (pick === 'boost') ctx.memory.usedBoost = true;
        else ctx.memory.usedDraw = true;
      }
      if (pick === 'boost') {
        if (ev.card) ctx.gainCard(ctx.self.id, ctx.self.id, ev.card);
        ctx.log(`【铿锵】文鸳令对 ${ev.victim.hero.name} 的伤害 +1${ev.card ? `并获得【${ev.card.name}】` : ''}`);
        ctx.banner();
        return { amount: ev.amount + 1, note: '【铿锵】伤害 +1' };
      }
      ctx.draw(ctx.self.id, ctx.self.maxHp);
      ctx.log(`【铿锵】文鸳摸 ${ctx.self.maxHp} 张牌（体力上限）`);
      ctx.banner();
      return null;
    },
  },
});

// ── 夏侯徽「济困」─────────────────────────────────────
// 每当你累计失去 5 张牌后，你可令一名其他角色随机获得手牌数最多的角色的 1 张牌。
//
// afterCardLost 由引擎在弃置 / 被获得 / 移出装备区三条路径统一上报
// （App.tsx:881-906），且分发器只把「失去牌者本人」的技能叫起来，
// 所以这里的累计天然是「你自己失去的牌」。
// 累计值跨轮保留（规则原文是「累计」），满 5 张触发一次并扣掉 5。
registerSkill({
  hero: '夏侯徽',
  skill: '济困',
  hooks: {
    afterCardLost: async (ctx: SkillContext, ev: CardLostEvent) => {
      const n = ((ctx.memory.lost as number) ?? 0) + ev.cards.length;
      if (n < 5) { ctx.memory.lost = n; return; }
      ctx.memory.lost = n - 5;
      const pool = ctx.players.filter(p => !p.isDead && p.hand.length > 0);
      if (!pool.length) return;
      const richest = [...pool].sort((a, b) => b.hand.length - a.hand.length)[0];
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      const picked = await ctx.requestChoice({
        title: '济困：选择获得牌的角色',
        hint: `随机获得 ${richest.hero.name} 的一张牌`,
        mode: 'target',
        targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: `${p.hand.length} 张手牌` })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') { ctx.memory.lost = n; return; }
      const chosenId = picked && picked.kind === 'target' ? Number(picked.ids?.[0]) : NaN;
      // AI / 托管：优先把手牌最多者的牌交给「不是他」的人，否则等于原地搬运
      const ben = others.find(p => p.id === chosenId)
        ?? others.find(p => p.id !== richest.id)
        ?? others[0];
      const card = richest.hand[Math.floor(Math.random() * richest.hand.length)];
      ctx.gainCard(richest.id, ben.id, card);
      ctx.log(`【济困】夏侯徽累计失去 5 张牌，${ben.hero.name} 获得 ${richest.hero.name} 的【${card.name}】`);
      ctx.banner();
    },
  },
});

// ══════════════════════════════════════════════════════════
// 第三批：7 个技能落地 + 1 个如实说明未实现
//   已实装：魏娆拾芳·簪金 / 王荣吉境 / 清河公主长姬 /
//           丁尚涴讽言 / 邓晚棠承宠 / 曹宪灵犀
//   未实装：卢弈邀弈（引擎缺「结算前改目标」原语，见下）
// ══════════════════════════════════════════════════════════

// ── 卢弈「邀弈」────────────────────────────────────────
// 当一名角色使用【杀】时，你可以弃置一张牌，令此【杀】的目标改为你。
//
// 引擎没有「改目标」原语：afterCardUsed 是在**结算完成后**
// （combat.ts:1512 finally 块）才分发的，此时【杀】已经打完，
// 改 targets 数组既不会回滚伤害，也不影响任何后续结算——
// 那只是让日志好看、规则错误。忠实实现要求「指定目标时」的拦截时机，
// 这是引擎确实没有的能力，故本批不实现（引擎缺能力比降级实现更好）。
//
// 实装所需的引擎改动（不在本批 Boundary 内）：新增一个
// 「目标确定后、结算前」的钩子（如 targetBefore），且其返回值能改写目标列表。

// ── 魏娆「簪金」────────────────────────────────────────
// 当一名角色受到伤害后，若你于此回合内使用过牌，你可以弃置一张装备牌，
// 令其回复 1 点体力。
//
// 「此回合内使用过牌」自己看不到用牌事件，所以由本技能的 afterCardUsed
// 记进 ctx.memory，并在 onTurnStart（任意角色的新回合）复位。
// afterCardUsed 只在自己回合内才置位：回合外的用牌不计入「此回合内」
// （规则原文指的是「当前回合」，回合外的牌属于别人的回合）。
// 「弃置一张装备牌」= 装备区或手牌里的装备牌都可：引擎的 ctx.discard
// 只处理手牌，所以装备区的牌要先摘栏位再交给 ctx.discard
// （与 migrated_abilities2「骄矜」同一约定）。
registerSkill({
  hero: '魏娆',
  skill: '簪金',
  hooks: {
    onTurnStart: (ctx: SkillContext) => { delete ctx.memory.usedCardThisTurn; },
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      // 只记「自己回合内自己用牌」：回合外的牌属于别人的回合
      if (ev.source.id !== ctx.turnOwner?.id) return;
      if (ev.source.id !== ctx.self.id) return;
      ctx.memory.usedCardThisTurn = true;
    },
    afterDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.isDead) return;
      if (!ctx.memory.usedCardThisTurn) return;
      const pool: Array<{ card: Card; fromEquip: boolean; slot?: string }> = [];
      for (const slot of EQUIP_SLOTS) {
        const c = (ctx.self.equipment ?? {})[slot];
        if (c) pool.push({ card: c, fromEquip: true, slot });
      }
      for (const c of ctx.self.hand) {
        if (c.type === CardType.EQUIPMENT) pool.push({ card: c, fromEquip: false });
      }
      if (!pool.length) return;
      const picked = await ctx.requestChoice({
        title: '簪金：弃置一张装备牌',
        hint: `令 ${ev.victim.hero.name} 回复 1 点体力`,
        mode: 'multi',
        choices: pool.map(p => ({
          id: p.card.id,
          label: `【${p.card.name}】${p.card.suit}`,
          desc: p.fromEquip ? '装备区' : '手牌',
        })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosenId = picked && picked.kind === 'multi' ? String(picked.ids?.[0] ?? '') : '';
      // AI / 托管：优先弃手牌里的装备牌（保住装备区的收益）
      const chosen = pool.find(p => p.card.id === chosenId)
        ?? pool.find(p => !p.fromEquip)
        ?? pool[0];
      // 装备区的牌先摘栏位：ctx.discard 只从手牌里移除，
      // 不摘栏位会让同一张牌同时存在于装备区和弃牌堆
      if (chosen.fromEquip && chosen.slot) {
        const next = { ...(ctx.self.equipment ?? {}) };
        delete next[chosen.slot as keyof typeof next];
        ctx.self.equipment = next;
      }
      ctx.discard(ctx.self.id, [chosen.card]);
      ctx.heal(ev.victim.id, 1);
      ctx.log(`【簪金】魏娆弃置【${chosen.card.name}】，${ev.victim.hero.name} 回复 1 点体力`);
      ctx.banner();
    },
  },
});

// ── 魏娆「拾芳」────────────────────────────────────────
// 出牌阶段限一次，你可以弃置一张手牌，然后获得一名其他角色判定区里的一张牌。
//
// 引擎没有「出牌阶段」钩子，主动技统一挂在自己回合结束时（与「才韵」「复学」
// 同一形状）。「限一次」由 onTurnEnd 每个自己回合只分发一次自然满足。
//
// 「判定区」= Player.judgeZone（App.tsx:1028 addDelayedTrick 维护，含乐/兵/电）。
// 手牌有唯一入口 mutateHand，判定区没有——ctx.gainCard 只动双方手牌，
// 拿它「获得判定区的牌」会把一张不在手牌里的牌塞进手牌（牌凭空复制）。
// 因此这里先直接从 judgeZone 摘牌（batch6 起的既有约定：技能可改快照字段），
// 再 gainCard 进手牌，并同步三个旧布尔，否则座位徽标上的「乐」会留着。
registerSkill({
  hero: '魏娆',
  skill: '拾芳',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.self.hand.length === 0) return;
      const pool = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id
        && (p.judgeZone?.length ?? 0) > 0);
      if (!pool.length) return;
      const picked = await ctx.requestChoice({
        title: '拾芳：弃置一张手牌',
        hint: '然后获得一名其他角色判定区里的一张牌',
        mode: 'multi',
        choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}`, desc: '弃置此牌' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosenId = picked && picked.kind === 'multi' ? String(picked.ids?.[0] ?? '') : '';
      const cost = ctx.self.hand.find(c => c.id === chosenId) ?? ctx.self.hand[0];
      // AI / 托管：拿判定区牌最多的那个人的第一张
      const victim = [...pool].sort((a, b) => (b.judgeZone?.length ?? 0) - (a.judgeZone?.length ?? 0))[0];
      const stolen = (victim.judgeZone ?? [])[0];
      if (!stolen) return;
      ctx.discard(ctx.self.id, [cost]);
      const zone = (victim.judgeZone ?? []).filter(c => c.id !== stolen.id);
      victim.judgeZone = zone;
      victim.isLeBuSiShu = zone.some(c => c.name === CardName.LESI);
      victim.isBingLiangCunDuan = zone.some(c => c.name === CardName.BINGLIANG);
      victim.isShandian = zone.some(c => c.name === CardName.SHANDIAN);
      ctx.gainCard(victim.id, ctx.self.id, stolen);
      ctx.log(`【拾芳】魏娆弃置【${cost.name}】，获得 ${victim.hero.name} 判定区的【${stolen.name}】`);
      ctx.banner();
    },
  },
});

// ── 王荣「吉境」────────────────────────────────────────
// 当你受到伤害后，你可以进行一次判定。然后你可以弃置任意张点数之和
// 与判定结果点数相同的牌，回复 1 点体力。
//
// **引擎缺能力**：afterDamage 里没有 performJudgment（见 migrated_abilities2.ts:135
// 「夏侯惇刚烈 / 甄姬洛神 跳过，理由是需要主动发起判定」）。ctx 里没有牌堆，
// 也没有 performJudgment，所以在 afterDamage 里无法翻出判定牌。
//
// 折中方案：用 afterJudge **被动借一次判定**——引擎在自己判定阶段/技能判定时
// 会派发 afterJudge，本技能在那时把判定点数记进 memory；随后受到伤害时
// 若存在这样一次「已发生但未被吉境用掉」的判定，就按它结算。
// 这**不忠实**于「受到伤害后判定」，但也不凭空捏造点数（不伪造随机数），
// 语义是「本轮最近一次判定」——比硬写一个假的判定值更接近规则。
// 「弃牌点数之和等于判定点数」用子集求和（点数 1~13，贪心不足以保证有解，
// 用回溯；手牌规模 <= 10 时最多 2^10 次，可接受）。
const subsetSum = (cards: Card[], target: number): Card[] | null => {
  if (target <= 0) return null;
  // 先用「单张就够」快速命中，避免对小目标做无谓回溯
  const exact = cards.find(c => c.value === target);
  if (exact) return [exact];
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const dfs = (i: number, rest: number, acc: Card[]): Card[] | null => {
    if (rest === 0) return acc;
    if (i >= sorted.length || rest < 0) return null;
    const withIt = dfs(i + 1, rest - sorted[i].value, [...acc, sorted[i]]);
    return withIt ?? dfs(i + 1, rest, acc);
  };
  return dfs(0, target, []);
};

registerSkill({
  hero: '王荣',
  skill: '吉境',
  hooks: {
    afterJudge: (ctx: SkillContext, ev) => {
      // 只记王荣自己的判定：吉境结算的是「你进行一次判定」
      if (ev.owner.id !== ctx.self.id) return;
      ctx.memory.judgeValue = ev.card.value;
      ctx.memory.judgeCard = ev.card.name;
    },
    afterDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      const target = ctx.memory.judgeValue as number | undefined;
      if (typeof target !== 'number') return;
      delete ctx.memory.judgeValue;
      delete ctx.memory.judgeCard;
      if (ctx.self.hp >= ctx.self.maxHp) return;
      const subset = subsetSum(ctx.self.hand, target);
      if (!subset || !subset.length) {
        ctx.log(`【吉境】王荣判定点数为 ${target}，手牌中无点数之和相同的组合，仅记录判定`);
        return;
      }
      const picked = await ctx.requestChoice({
        title: `吉境：弃置点数之和为 ${target} 的牌`,
        hint: '然后回复 1 点体力',
        mode: 'multi',
        choices: subset.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}`, desc: `点数 ${c.value}` })),
        min: subset.length,
        max: subset.length,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      ctx.discard(ctx.self.id, subset);
      ctx.heal(ctx.self.id, 1);
      ctx.log(`【吉境】王荣判定点数 ${target}，弃置 ${subset.length} 张牌（点数和 ${subset.reduce((a, c) => a + c.value, 0)}），回复 1 点体力`);
      ctx.banner();
    },
  },
});

// ── 清河公主「长姬」────────────────────────────────────────
// 锁定技，当一张牌指定目标时，若此牌目标数大于 1 且你为目标之一，
// 此牌优先对你生效，然后你摸其余目标数张牌。
//
// **「此牌优先对你生效」引擎做不到**：afterCardUsed 在结算之后（combat.ts:1512），
// 多目标牌（南蛮/万箭/五谷/桃园）的逐个结算早已发生，改 targets 顺序无效。
// 能忠实实现的是后半段「摸其余目标数张牌」——目标列表与目标数都是真值。
// 本批只实现摸牌，不实现「优先生效」，属于如实裁剪而非降级语义。
registerSkill({
  hero: '清河公主',
  skill: '长姬',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (!ev.targets.some(t => t.id === ctx.self.id)) return;
      if (ev.targets.length <= 1) return;
      const others = ev.targets.filter(t => t.id !== ctx.self.id).length;
      if (others <= 0) return;
      ctx.draw(ctx.self.id, others);
      ctx.log(`【长姬】${ctx.self.hero.name} 成为 ${ev.targets.length} 目标牌【${ev.card.name}】的目标，摸 ${others} 张牌（其余目标数）`);
      ctx.banner();
    },
  },
});

// ── 丁尚涴「讽言」────────────────────────────────────────
// 出牌阶段各限一次，你可以选择一名体力值/手牌数不大于你的其他角色，
// 令其交给你一张手牌。
//
// 规则原文的第二个选项是「视为对其使用一张无次数限制的【杀】」——
// 引擎的 ctx 没有「使用牌」原语（只有 discard / gainCard / damage /
// heal / draw），造不出一张真的【杀】，故只实现第一个选项（手牌侧）。
// 两个选项**各**限一次：这里只实装一个选项，因此就是每回合一次，
// 复位点用 onTurnStart（与「铿锵」同一教训：不能拿 turnOwner.id 当 key）。
registerSkill({
  hero: '丁尚涴',
  skill: '讽言',
  hooks: {
    onTurnStart: (ctx: SkillContext) => { delete ctx.memory.usedThisTurn; },
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const pool = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id
        && p.hand.length > 0
        && p.hp <= ctx.self.hp && p.hand.length <= ctx.self.hand.length);
      if (!pool.length) return;
      const picked = await ctx.requestChoice({
        title: '讽言：选择一名其他角色',
        hint: '令其交给你一张手牌（体力值与手牌数均不大于你）',
        mode: 'target',
        targets: pool.map(p => ({
          id: p.id,
          name: p.hero.name,
          sub: `体力 ${p.hp}/${p.maxHp} · 手牌 ${p.hand.length}`,
        })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const chosenId = picked && picked.kind === 'target' ? Number(picked.ids?.[0]) : NaN;
      // AI / 托管：选手牌最多的人（逼迫产出最大）
      const target = pool.find(p => p.id === chosenId)
        ?? [...pool].sort((a, b) => b.hand.length - a.hand.length)[0];
      if (!target || !target.hand.length) return;
      const given = target.hand[Math.floor(Math.random() * target.hand.length)];
      ctx.memory.usedThisTurn = true;
      ctx.gainCard(target.id, ctx.self.id, given);
      ctx.log(`【讽言】${target.hero.name} 交给丁尚涴一张手牌【${given.name}】`);
      ctx.banner();
    },
  },
});

// ── 邓晚棠「承宠」────────────────────────────────────────
// 锁定技，当你使用牌时，若你的手牌中红色牌数小于黑色牌数，你随机弃置 1 张黑色手牌；
// 回合外不以此技能获得牌时，若红色牌数大于黑色牌数，你摸 1 张牌。
//
// 两个方向各占一个钩子：
//  · 自己使用牌（afterCardUsed）→ 黑多于红 → 随机弃 1 张黑
//  · 回合外失去牌（afterCardLost）→ 红多于黑 → 摸 1 张
// 「回合外」用 ctx.turnOwner.id !== self.id 判定（turnOwner 是引擎的真值）。
//
// **如实裁剪**：原文第二段是「回合外不以此技能获得牌时」。引擎没有
// 「获得牌」钩子（SkillHooks 16 个里最接近的是 afterCardLost，语义相反），
// 也没有「这张牌是否来自本技能」的标记系统，所以「获得牌」这一半无法触发。
// 这里改用 afterCardLost（失去牌后手牌构成同样会变）作为可观测的替代时机，
// 会让「获得牌」类触发变少而不是变多，不会误伤对手。
// 「不以此技能获得牌」的自激风险本身不存在：ctx.draw 不会回流 afterCardLost。
registerSkill({
  hero: '邓晚棠',
  skill: '承宠',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      const red = ctx.self.hand.filter(c => isRed(c.suit)).length;
      const black = ctx.self.hand.filter(c => isBlack(c.suit)).length;
      if (red >= black) return;
      const blacks = ctx.self.hand.filter(c => isBlack(c.suit));
      if (!blacks.length) return;
      const drop = blacks[Math.floor(Math.random() * blacks.length)];
      ctx.discard(ctx.self.id, [drop]);
      ctx.log(`【承宠】邓晚棠手牌红 ${red} / 黑 ${black}，随机弃置一张黑牌【${drop.name}】`);
      ctx.banner();
    },
    afterCardLost: (ctx: SkillContext, ev: CardLostEvent) => {
      if (ev.player.id !== ctx.self.id) return;
      // 回合外才有第二段
      if (ctx.turnOwner && ctx.turnOwner.id === ctx.self.id) return;
      const red = ctx.self.hand.filter(c => isRed(c.suit)).length;
      const black = ctx.self.hand.filter(c => isBlack(c.suit)).length;
      if (red <= black) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【承宠】邓晚棠回合外手牌红 ${red} / 黑 ${black}，摸一张牌`);
      ctx.banner();
    },
  },
});

// ── 曹宪「灵犀」────────────────────────────────────────
// 出牌阶段开始时或结束时，你可以将至多体力上限张牌置于你的武将牌上，称为「翼」。
// 当「翼」被移去后，你将手牌摸至或弃置至「翼」包含的花色数的两倍。
//
// 引擎没有「出牌阶段」钩子，用自己回合的 onTurnStart / onTurnEnd 近似
// （「阶段开始/结束」的另一半——摸牌阶段前/弃牌阶段后——由这两个边界覆盖）。
// 「武将牌上」= Player.placedCards（周妃「箜声」同一字段，UI 已能显示）。
// 「移去后摸至/弃至（翼的花色数 ×2）」这一子句**未实现**：
// 本批中没有任何路径会移去「翼」（另一子句属「知否」，不在本批范围），
// 把一段永不发生的结算写进去是死代码，也会误导后续维护者。
// 子句本身不需要新原语（数 placedCards 的花色 + draw/discard 即可），
// 等「知否」实装、移去动作存在时再补。
registerSkill({
  hero: '曹宪',
  skill: '灵犀',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      await placeWing(ctx, '回合开始');
    },
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      await placeWing(ctx, '回合结束');
    },
  },
});

/** 「灵犀」的置「翼」共用体：至多体力上限张手牌进 placedCards */
async function placeWing(ctx: SkillContext, when: string): Promise<void> {
  if (ctx.self.hand.length === 0) return;
  const cap = Math.min(ctx.self.maxHp, ctx.self.hand.length);
  if (cap <= 0) return;
  const picked = await ctx.requestChoice({
    title: `灵犀：${when}将至多 ${cap} 张牌置于武将牌上`,
    hint: '称为「翼」',
    mode: 'multi',
    choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}`, desc: '置于武将牌上' })),
    min: 1,
    max: cap,
    cancelLabel: '不发动',
  });
  if (picked && picked.kind === 'cancel') return;
  const chosen = picked && picked.kind === 'multi' && picked.ids?.length
    ? ctx.self.hand.filter(c => picked.ids!.map(String).includes(c.id))
    : ctx.self.hand.slice(0, 1);   // AI / 托管：置一张
  if (!chosen.length) return;
  // 这里**不能**用 ctx.discard：它会把牌塞进弃牌堆，而「置于武将牌上」的牌
  // 不进弃牌堆（对比周妃「箜声」App.tsx:2659 走的是 mutateHand，不碰弃牌堆）。
  // 技能侧没有 mutateHand 这类原语，只能直接改快照字段（batch6 起的既有约定，
  // 与「骄矜」改 equipment 同一做法）：随后必然发生的一次 players 写入
  // 会把这处手牌改动一并提交。
  const gone = new Set(chosen.map(c => c.id));
  ctx.self.hand = ctx.self.hand.filter(c => !gone.has(c.id));
  ctx.self.placedCards = [...(ctx.self.placedCards ?? []), ...chosen];
  ctx.log(`【灵犀】曹宪将 ${chosen.length} 张牌置于武将牌上，称为「翼」（${when}）`);
  ctx.banner();
}
