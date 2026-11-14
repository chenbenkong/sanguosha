import { registerSkill } from './registry';
import type { SkillContext, DamageEvent, CardUsedEvent, CardLostEvent } from './registry';
import { seatDistance } from '../rules.ts';
import { Suit } from '../../../types.ts';

/** 黑色牌（♠/♣）：董絮「清冷」用 */
const isBlack = (s: Suit): boolean => s === Suit.SPADE || s === Suit.CLUB;

/**
 * 第六批 30 名女将 —— 已实装 10 个。
 *
 * 第一批 4 个是**纯被动、单钩子**技能（手谈 / ☆ 神威 / 轻幔 / 怯言）。
 * 第二批 6 个用到了跨回合 memory、damageBefore 与 afterCardLost：
 *   才韵 / ☆ 铩雪 / 清冷 / 复学 / 铿锵 / 济困。
 * 全部只用现有钩子，未引入任何引擎改动。
 * 需要「死亡时」「成为目标时」「按牌名从牌堆取牌」的技能仍留给后续批次——
 * 那些能力引擎确实没有，硬写只会降级语义。
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
    onTurnStart: (ctx: SkillContext) => { delete ctx.memory.usedThisTurn; },
    damageBefore: async (ctx: SkillContext, ev) => {
      if (ev.source?.id !== ctx.self.id) return null;
      if (ev.victim.id === ctx.self.id) return null;
      if (ev.amount <= 0) return null;
      if (ctx.memory.usedThisTurn) return null;
      const picked = await ctx.requestChoice({
        title: '铿锵：造成伤害时选择一项',
        mode: 'choose',
        choices: [
          { id: 'draw', label: `摸 ${ctx.self.maxHp} 张牌`, desc: '伤害不变' },
          { id: 'boost', label: '此伤害 +1 并获得造成伤害的牌', desc: '对高威胁目标更划算' },
        ],
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return null;
      // AI / 托管：对方体力 <= 1 时补刀，否则补牌
      const pick = picked && picked.kind === 'choose'
        ? picked.id
        : (ev.victim.hp <= 1 ? 'boost' : 'draw');
      ctx.memory.usedThisTurn = true;
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
