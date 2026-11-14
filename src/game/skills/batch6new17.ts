import { registerSkill } from './registry';
import type { SkillContext, PlayPhaseEvent, DyingEvent } from './registry';
import { CardName } from '../../../types';
import type { Player } from '../../../types';

/**
 * 第六批女将 · 第 17 组：吕玲绮「妆戎」「☆ 神威」「☆ 无双」、文鸳「殇决」、任婉「纫霜」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   妆戎      觉醒技，一名角色的回合结束时，若你的手牌数或体力值为1，你减1点体力上限，
 *             将体力值回复至体力上限并将手牌摸至体力上限，然后你获得技能“神威”和“无双”。
 *   ☆ 神威   锁定技，①摸牌阶段，你多摸两张牌；②你的手牌上限+2。
 *   ☆ 无双   锁定技，①当你使用【杀】指定一名角色为目标后，其需使用两张【闪】才能抵消；
 *             ②当你使用【决斗】指定其他角色为目标后，或成为其他角色使用【决斗】的目标后，
 *             其每次响应需打出两张【杀】。
 *   殇决      觉醒技，当你进入濒死状态时，你将体力回复至1点，加1点体力上限并获得技能“困励”，
 *             将“铿锵”描述中的“每回合限一次”改为“每回合每个选项各限一次”。
 *   纫霜      锁定技，你每轮首次进入濒死时，回复体力值至1点并增加1点体力上限（至多增加3点）。
 *             你脱离濒死状态时，复原你的武将牌并视为使用一张普通锦囊牌。
 *
 * 两处「注册表按武将派发」带来的门闸：
 *   · 「☆ 神威」「☆ 无双」在 HEROES 里是吕玲绮的声明技能，但只有「妆戎」觉醒后才该生效。
 *     引擎侧（combat.ts 的 isLubuWushuang）已经改成 hasGrantedSkill，所以「☆ 无双」
 *     只要在注册表里有一条声明即可；「☆ 神威」的两个钩子必须自己查 hasGrantedSkill。
 *   · 「铿锵」的限次改动写在 heroMemory 上，由「铿锵」（batch6new.ts）读取 ——
 *     原生技能撤不掉，只能用开关。
 */

const SHENWEI = '☆ 神威';
const WUSHUANG = '☆ 无双';
const KUNLI = '☆ 困励';

const aliveOthers = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);

const pickOne = async (
  ctx: SkillContext, candidates: Player[], title: string, hint?: string,
): Promise<number | undefined> => {
  if (candidates.length === 0) return undefined;
  if (!ctx.self.isHuman) return [...candidates].sort((a, b) => a.hp - b.hp || a.id - b.id)[0].id;
  const r = await ctx.requestChoice({
    title, hint, mode: 'target',
    targets: candidates.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}` })),
    min: 1, max: 1, cancelLabel: '不发动',
  });
  const id = r && r.kind === 'target' ? r.ids?.[0] : undefined;
  return typeof id === 'number' ? id : undefined;
};

// ── 吕玲绮「妆戎」 ────────────────────────────────────
registerSkill({
  hero: '吕玲绮',
  skill: '妆戎',
  hooks: {
    onTurnEnd: (ctx) => {
      if (ctx.memory.awakened) return;
      // 「一名角色的回合结束时」：any turn end, 条件只看自己的手牌数 / 体力值
      if (ctx.self.hand.length !== 1 && ctx.self.hp !== 1) return;
      ctx.memory.awakened = true;
      const newMax = Math.max(1, ctx.self.maxHp - 1);
      ctx.banner();
      ctx.changeMaxHp(ctx.self.id, -1);
      if (ctx.self.hp < newMax) ctx.heal(ctx.self.id, newMax - ctx.self.hp);
      const need = newMax - ctx.self.hand.length;
      if (need > 0) ctx.draw(ctx.self.id, need);
      ctx.grantSkill(SHENWEI);
      ctx.grantSkill(WUSHUANG);
      ctx.log(`【妆戎】${ctx.self.hero.name} 觉醒：体力上限 ${newMax}，体力与手牌补至 ${newMax}，获得「☆ 神威」「☆ 无双」`);
    },
  },
});

// ── 吕玲绮「☆ 神威」 ──────────────────────────────────
// 注册在 batch6new.ts（更早的批次已经装好），本轮只给它补上了「妆戎授予之后才生效」
// 的门闸 —— 这里不再重复 registerSkill，否则两个实现会叠成 +4。

// ── 吕玲绮「☆ 无双」 ──────────────────────────────────
registerSkill({
  hero: '吕玲绮',
  skill: WUSHUANG,
  locked: true,
  // 效果完全由引擎消费：combat.ts 的 triggerReaction 里
  // isLubuWushuang = 吕布本人的「无双」 || hasGrantedSkill(无双 | ☆ 无双)，
  // 命中后【杀】要两张【闪】、【决斗】要两张【杀】。本文件只负责「声明」这个技能存在，
  // 否则 skillCoverage / hookCoverage 会认为 HEROES 里声明了却没有实现。
  hooks: {},
});

// ── 文鸳「殇决」 ──────────────────────────────────────
registerSkill({
  hero: '文鸳',
  skill: '殇决',
  hooks: {
    onDying: (ctx, ev: DyingEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (ctx.memory.awakened) return;
      ctx.memory.awakened = true;
      ctx.banner();
      ctx.changeMaxHp(ctx.self.id, 1);
      ctx.grantSkill(KUNLI);
      // 「将铿锵描述中的每回合限一次改为每回合每个选项各限一次」：
      // 原生技能撤不掉也改不了描述，所以把开关写到共享 heroMemory，由铿锵自己认
      ctx.heroMemory.kqPerOption = true;
      ctx.log(`【殇决】${ctx.self.hero.name} 觉醒：体力回复至 1 点，体力上限+1，获得「☆ 困励」，「铿锵」改为每回合每个选项各限一次`);
      return { hp: 1 };
    },
  },
});

// ── 任婉「纫霜」 ──────────────────────────────────────
/** 可以「视为使用」的普通锦囊（单目标的那两个需要选目标） */
const SCROLLS_NO_TARGET = [CardName.WUZHONG, CardName.TAOYUAN];
const SCROLLS_WITH_TARGET = [CardName.JUEDOU, CardName.GUOHE, CardName.SHUNSHOU];

registerSkill({
  hero: '任婉',
  skill: '纫霜',
  locked: true,
  hooks: {
    onDying: (ctx, ev: DyingEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      // 每轮首次
      if (ctx.memory.lastRound === ctx.roundCount) return;
      ctx.memory.lastRound = ctx.roundCount;
      const added = (ctx.memory.added as number | undefined) ?? 0;
      ctx.banner();
      if (added < 3) {
        ctx.memory.added = added + 1;
        ctx.changeMaxHp(ctx.self.id, 1);
        ctx.log(`【纫霜】${ctx.self.hero.name} 本轮首次进入濒死：体力回复至 1 点，体力上限+1（已加 ${added + 1} 次）`);
      } else {
        ctx.log(`【纫霜】${ctx.self.hero.name} 本轮首次进入濒死：体力回复至 1 点（体力上限已加满 3 次）`);
      }
      return { hp: 1 };
    },
    afterDying: async (ctx) => {
      ctx.restoreGeneral(ctx.self.id);
      const all = [...SCROLLS_NO_TARGET, ...SCROLLS_WITH_TARGET];
      let name: CardName = CardName.WUZHONG;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '纫霜：视为使用一张普通锦囊牌',
          mode: 'choose',
          choices: all.map(n => ({ id: n, label: `【${n}】` })),
          min: 1, max: 1, cancelLabel: '不发动',
        });
        const picked = r && (r.kind === 'choose' || r.kind === 'card') ? String(r.id ?? r.ids?.[0]) : '';
        if (!picked) return;
        name = picked as CardName;
      }
      if (!ctx.restoreGeneral) return;
      const needsTarget = SCROLLS_WITH_TARGET.includes(name);
      let targets: number[] = [];
      if (needsTarget) {
        const others = aliveOthers(ctx);
        const tid = await pickOne(ctx, others, `纫霜：使用【${name}】的目标`);
        if (tid === undefined) return;
        targets = [tid];
      }
      ctx.log(`【纫霜】${ctx.self.hero.name} 复原武将牌并视为使用一张【${name}】`);
      await ctx.useCardAs(name, targets, { ignoreDistance: true, reason: '纫霜' });
    },
  },
});
