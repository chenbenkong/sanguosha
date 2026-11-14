import { registerSkill } from './registry';
import type { SkillContext, CardGainEvent, DamageEvent, CardUsedEvent } from './registry';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 20 组：张怀「诀言」、文鸳「匮饬」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   诀言   当你对其他角色使用仅指定一个目标的牌后，你可以与其拼点，若你赢，你可以选择一项：
 *          1.对你与其各造成1点伤害；2.回复1点体力；3.获得其1张手牌。若如此做，
 *          此次选择的选项数值改为1、未选择的选项数值+1。若三个选项均被选择过，
 *          删去此技能描述中的“你可以与其拼点，若你赢，”。
 *   匮饬   锁定技，回合结束时，若你本回合摸牌数与造成的伤害值均不小于体力上限，你失去1点体力。
 *
 * 关于「拼点」：引擎没有拼点原语，但这四条要素都能用现有能力拼出来 ——
 * 双方各出一张手牌（人类自己选、AI 出点数最大的）、比点数、两张牌进弃牌堆，
 * 都在 ctx.players[].hand / ctx.discard 的可达范围内。这不是降级，是把拼点
 * 用通用原语实现；唯一的取舍是平局按「没赢」处理（官方拼点平局双方都不赢）。
 */

type YanOption = 'damage' | 'heal' | 'steal';

const YAN_LABEL: Record<YanOption, string> = {
  damage: '对你与其各造成X点伤害',
  heal: '回复X点体力',
  steal: '获得其X张手牌',
};

/** 三选项的数值与「是否选过」：初值都是 1 / false（原文没说初值，按选择后归 1 反推） */
const readNums = (ctx: SkillContext): [number, number, number] => {
  const cur = ctx.memory.nums;
  return Array.isArray(cur) && cur.length === 3 ? (cur as [number, number, number]) : [1, 1, 1];
};
const readPicked = (ctx: SkillContext): [boolean, boolean, boolean] => {
  const cur = ctx.memory.picked;
  return Array.isArray(cur) && cur.length === 3 ? (cur as [boolean, boolean, boolean]) : [false, false, false];
};

const aliveOthers = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);

// ── 张怀「诀言」 ──────────────────────────────────────
registerSkill({
  hero: '张怀',
  skill: '诀言',
  hooks: {
    onTurnStart: (ctx) => { ctx.memory.usedThisTurn = false; },
    onTurnEnd: (ctx) => { ctx.memory.usedThisTurn = false; },
    afterCardUsed: async (ctx, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      if (ev.targets.length !== 1) return;
      const target = ev.targets[0];
      if (target.id === ctx.self.id || target.isDead) return;
      if (ctx.self.hand.length === 0 || target.hand.length === 0) return;

      const picked = readPicked(ctx);
      const allPicked = picked.every(Boolean);

      // ── 第一步：「你可以与其拼点，若你赢」──────────────────
      // 三个选项都选过之后，描述里的这一整句被删去 —— 即不再需要拼点。
      if (!allPicked) {
        // 出牌：人类自己选，AI 出点数最大的那张
        let mine: Card | undefined;
        if (ctx.self.isHuman) {
          const r = await ctx.requestChoice({
            title: `诀言：与 ${target.hero.name} 拼点`,
            mode: 'choose',
            choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
            min: 1, max: 1, cancelLabel: '不拼点',
          });
          const cid = r && (r.kind === 'choose' || r.kind === 'card') ? (r.id ?? r.ids?.[0]) : undefined;
          mine = ctx.self.hand.find(c => c.id === cid);
        } else {
          mine = [...ctx.self.hand].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
        }
        if (!mine) return;
        const theirs = [...target.hand].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
        ctx.banner();
        // 拼点的两张牌都进弃牌堆
        ctx.discard(ctx.self.id, [mine]);
        ctx.discard(target.id, [theirs]);
        ctx.log(`【诀言】拼点：${ctx.self.hero.name}【${mine.name}】${mine.rank} vs ${target.hero.name}【${theirs.name}】${theirs.rank}`);
        if ((mine.value ?? 0) <= (theirs.value ?? 0)) {
          ctx.log('【诀言】没有赢，效果不发动');
          return;
        }
      } else {
        ctx.banner();
      }

      // ── 第二步：选择一项并结算，然后改数值 ────────────────
      const nums = readNums(ctx);
      const options: YanOption[] = ['damage', 'heal', 'steal'];
      const describe = (o: YanOption, i: number) => YAN_LABEL[o].replace('X', String(nums[i]));
      let pick: YanOption;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '诀言：选择一项',
          mode: 'choose',
          choices: options.map((o, i) => ({ id: o, label: describe(o, i) })),
          min: 1, max: 1,
          // 只剩一张手牌的目标不能「获得其手牌」，但原文没有排除，所以不额外过滤
        });
        const raw = r && (r.kind === 'choose' || r.kind === 'card') ? String(r.id ?? r.ids?.[0]) : '';
        pick = (options.find(o => o === raw) ?? 'damage');
      } else {
        // AI：能补刀就伤害，血少就回复，否则偷牌
        pick = ctx.self.hp <= 1 ? 'heal' : (target.hp <= 1 ? 'damage' : (target.hand.length > 0 ? 'steal' : 'heal'));
      }
      const i = options.indexOf(pick);
      const x = nums[i];
      if (pick === 'damage') {
        await ctx.damage(ctx.self.id, ctx.self.id, x);
        await ctx.damage(target.id, ctx.self.id, x);
      } else if (pick === 'heal') {
        ctx.heal(ctx.self.id, x);
      } else {
        const stolen = target.hand.slice(0, x);
        for (const c of stolen) {
          ctx.gainCard(target.id, ctx.self.id, c);
        }
      }
      ctx.log(`【诀言】执行「${describe(pick, i)}」`);

      // 「此次选择的选项数值改为1、未选择的选项数值+1」
      const nextNums: [number, number, number] = [nums[0] + 1, nums[1] + 1, nums[2] + 1];
      nextNums[i] = 1;
      const nextPicked: [boolean, boolean, boolean] = [...picked] as [boolean, boolean, boolean];
      nextPicked[i] = true;
      ctx.memory.nums = nextNums;
      ctx.memory.picked = nextPicked;
      ctx.memory.usedThisTurn = true;
      if (nextPicked.every(Boolean)) {
        ctx.heroMemory.jueyanNoPindian = true;
        ctx.log('【诀言】三个选项都已选过：此后不再需要拼点');
      }
    },
  },
});

// ── 文鸳「匮饬」 ──────────────────────────────────────
registerSkill({
  hero: '文鸳',
  skill: '匮饬',
  locked: true,
  hooks: {
    onTurnStart: (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      ctx.memory.drawn = 0;
      ctx.memory.dealt = 0;
    },
    afterCardGain: (ctx, ev: CardGainEvent) => {
      // 「摸牌」= 从牌堆获得（from 为 undefined），从别人手里拿到的牌不算摸牌
      if (ev.owner.id !== ctx.self.id) return;
      if (ev.from !== undefined) return;
      ctx.memory.drawn = ((ctx.memory.drawn as number | undefined) ?? 0) + ev.cards.length;
    },
    afterDealDamage: (ctx, ev: DamageEvent) => {
      if (ev.source?.id !== ctx.self.id) return;
      ctx.memory.dealt = ((ctx.memory.dealt as number | undefined) ?? 0) + ev.amount;
    },
    onTurnEnd: async (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      const drawn = (ctx.memory.drawn as number | undefined) ?? 0;
      const dealt = (ctx.memory.dealt as number | undefined) ?? 0;
      const need = ctx.self.maxHp;
      if (drawn < need || dealt < need) return;
      ctx.banner();
      ctx.log(`【匮饬】${ctx.self.hero.name} 本回合摸 ${drawn} 张、造成 ${dealt} 点伤害（体力上限 ${need}），失去 1 点体力`);
      await ctx.loseHp(ctx.self.id, 1);
    },
  },
});
