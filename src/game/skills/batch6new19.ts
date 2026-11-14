import { registerSkill } from './registry';
import type { SkillContext } from './registry';
import { CardName } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 19 组：滕公主「流年」、全惠解「离宫」、曹华「彩翼」、李婉「别君」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   流年   锁定技，一名角色的回合结束时，若本回合牌堆进行过：第一次洗牌，你减1点体力上限，
 *          将体力值回复至体力上限，然后你的手牌上限+10；第二次洗牌，你减1点体力上限，
 *          将体力值回复至体力上限，然后防止你本局游戏受到的【杀】造成的伤害。
 *   离宫   觉醒技，准备阶段，若“慧淑”有数字达到5，你加1点体力上限并回复1点体力，
 *          失去技能“慧淑”和“易数”，然后随机抽取四个吴国女性武将，且可以获得其中两个技能。
 *   彩翼   转换技，结束阶段，你可以令一名角色选择一项并移除该选项（X为当前状态剩余选项数）：
 *          阳：1.回复X点体力；2.摸X张牌；3.复原武将牌；4.随机执行该状态一个已移除的选项；
 *          阴：1.受到X点伤害；2.弃置X张牌；3.翻面并横置；4.随机执行该状态一个已移除的选项。
 *   别君   ①其他角色的出牌阶段限一次，其可以交给你一张手牌；②每回合限一次，当你受到伤害时，
 *          若你手牌中没有本回合以此法获得的牌，你可以翻面，防止此伤害。
 *
 * 两处「原生技能撤不掉」的处理（与化萍/殇决同一手法）：
 *   · 离宫要「失去技能慧淑和易数」—— 只能写 heroMemory.huisuGone，由那两个技能自己认。
 *   · 别君不需要撤销，但「以此法获得的牌」只能按牌 id 记在 heroMemory 里。
 */

const HUISU_GONE = 'huisuGone';

const alivePlayers = (ctx: SkillContext): Player[] => ctx.players.filter(p => !p.isDead);
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

// ── 滕公主「流年」 ────────────────────────────────────
registerSkill({
  hero: '滕公主',
  skill: '流年',
  locked: true,
  hooks: {
    onTurnEnd: (ctx) => {
      // 「本回合牌堆进行过第 N 次洗牌」= 这回合结束时累计洗切次数正好是 N
      const n = ctx.deckShuffleCount;
      if (n === 1 && !ctx.memory.done1) {
        ctx.memory.done1 = true;
        ctx.banner();
        const newMax = Math.max(1, ctx.self.maxHp - 1);
        ctx.changeMaxHp(ctx.self.id, -1);
        if (ctx.self.hp < newMax) ctx.heal(ctx.self.id, newMax - ctx.self.hp);
        ctx.memory.limitBonus = 10;
        ctx.log(`【流年】${ctx.self.hero.name} 本回合牌堆第一次洗牌：体力上限 ${newMax}，手牌上限 +10`);
      } else if (n === 2 && !ctx.memory.done2) {
        ctx.memory.done2 = true;
        ctx.banner();
        const newMax = Math.max(1, ctx.self.maxHp - 1);
        ctx.changeMaxHp(ctx.self.id, -1);
        if (ctx.self.hp < newMax) ctx.heal(ctx.self.id, newMax - ctx.self.hp);
        ctx.memory.noSlashDamage = true;
        ctx.log(`【流年】${ctx.self.hero.name} 本回合牌堆第二次洗牌：体力上限 ${newMax}，此后本局免疫【杀】造成的伤害`);
      }
    },
    handLimitBonus: (ctx) => (ctx.memory.limitBonus as number | undefined) ?? 0,
    damageBefore: (ctx, ev) => {
      if (!ctx.memory.noSlashDamage) return null;
      if (ev.victim.id !== ctx.self.id) return null;
      if (ev.card?.name !== CardName.SHA) return null;
      return { prevent: true, note: '【流年】本局免疫【杀】造成的伤害' };
    },
  },
});

// ── 全惠解「离宫」 ────────────────────────────────────
registerSkill({
  hero: '全惠解',
  skill: '离宫',
  hooks: {
    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      if (ctx.memory.awakened) return;
      const nums = (ctx.heroMemory.huishu as number[] | undefined) ?? [];
      if (!nums.some(v => v >= 5)) return;
      ctx.memory.awakened = true;
      ctx.banner();
      ctx.changeMaxHp(ctx.self.id, 1);
      ctx.heal(ctx.self.id, 1);
      // 「失去技能慧淑和易数」：原生技能撤不掉，写开关给它们自己认
      ctx.heroMemory[HUISU_GONE] = true;
      ctx.log(`【离宫】${ctx.self.hero.name} 觉醒：体力上限+1，回复 1 点体力，失去「慧淑」「易数」`);

      // 「随机抽取四个吴国女性武将」——从 HEROES 里筛（延后 require，避免顶层循环依赖）
      const { HEROES } = await import('../../../constants');
      const pool = HEROES.filter(h => (
        h.kingdom === '吴' && h.gender === 'female' && !h.pending && h.name !== ctx.self.hero.name
      ));
      if (pool.length === 0) return;
      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
      const skills = shuffled.flatMap(h => h.skillName.split('/').map(s => s.trim()).filter(Boolean));
      ctx.log(`【离宫】随机抽取：${shuffled.map(h => h.name).join('、')}`);
      let picks = skills.slice(0, 2);
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '离宫：从抽到的武将技能里获得其中两个',
          mode: 'multi',
          choices: skills.map(s => ({ id: s, label: s })),
          min: 0, max: 2, cancelLabel: '不获得',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        picks = ids.map(String);
      }
      const got: string[] = [];
      for (const s of picks) {
        if (ctx.grantSkill(s)) got.push(s);
      }
      if (got.length > 0) ctx.log(`【离宫】获得技能 ${got.map(s => `「${s}」`).join('')}`);
    },
  },
});

// ── 曹华「彩翼」 ──────────────────────────────────────
type CaiyiOption = 'heal' | 'draw' | 'restore' | 'random' | 'damage' | 'discard' | 'flip';

interface CaiyiChoice { id: CaiyiOption; label: string }

const YANG: CaiyiChoice[] = [
  { id: 'heal', label: '回复X点体力' },
  { id: 'draw', label: '摸X张牌' },
  { id: 'restore', label: '复原武将牌' },
  { id: 'random', label: '随机执行该状态一个已移除的选项' },
];
const YIN: CaiyiChoice[] = [
  { id: 'damage', label: '受到X点伤害' },
  { id: 'discard', label: '弃置X张牌' },
  { id: 'flip', label: '翻面并横置' },
  { id: 'random', label: '随机执行该状态一个已移除的选项' },
];

const execCaiyi = async (ctx: SkillContext, targetId: number, opt: CaiyiOption, x: number) => {
  const target = ctx.players.find(p => p.id === targetId);
  if (!target) return;
  switch (opt) {
    case 'heal':
      ctx.heal(targetId, x);
      break;
    case 'draw':
      ctx.draw(targetId, x);
      break;
    case 'restore':
      ctx.restoreGeneral(targetId);
      break;
    case 'damage':
      await ctx.damage(targetId, ctx.self.id, x);   // 没有伤害来源时按「技能拥有者造成」结算
      break;
    case 'discard': {
      const cards = target.hand.slice(0, x);
      if (cards.length > 0) ctx.discard(targetId, cards);
      break;
    }
    case 'flip':
      ctx.flip(targetId, true);
      ctx.setChained(targetId, true);
      break;
    case 'random':
      // 「随机执行该状态一个已移除的选项」：由调用方决定具体是哪一个
      break;
  }
};

registerSkill({
  hero: '曹华',
  skill: '彩翼',
  hooks: {
    onTurnEnd: async (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      const targetId = await pickOne(ctx, alivePlayers(ctx), '彩翼：令一名角色选择一项');
      if (targetId === undefined) return;
      const target = ctx.players.find(p => p.id === targetId);
      if (!target) return;
      const isYang = ctx.memory.yang !== false;   // 初始为阳
      const removedKey = isYang ? 'yangRemoved' : 'yinRemoved';
      const removed = (ctx.memory[removedKey] as CaiyiOption[] | undefined) ?? [];
      const all = isYang ? YANG : YIN;
      const remaining = all.filter(o => !removed.includes(o.id));
      if (remaining.length === 0) return;
      const x = remaining.length;   // 「X为当前状态剩余选项数」
      ctx.banner();
      ctx.log(`【彩翼】${ctx.self.hero.name} 令 ${target.hero.name} 选择（${isYang ? '阳' : '阴'}，剩余 ${x} 项）`);

      let pick: CaiyiOption;
      if (target.isHuman) {
        const r = await ctx.requestChoice({
          title: `彩翼：选择一项（X = ${x}）`,
          mode: 'choose',
          choices: remaining.map(o => ({ id: o.id, label: o.label.replace('X', String(x)) })),
          min: 1, max: 1,
        });
        const raw = r && (r.kind === 'choose' || r.kind === 'card') ? String(r.id ?? r.ids?.[0]) : '';
        pick = (remaining.find(o => o.id === raw)?.id) ?? remaining[0].id;
      } else {
        // AI：阳优先摸牌 / 回复，阴优先弃牌（不主动翻面横置自己人）
        const prefer: CaiyiOption[] = isYang ? ['draw', 'heal', 'restore', 'random'] : ['discard', 'damage', 'flip', 'random'];
        pick = prefer.find(p => remaining.some(o => o.id === p)) ?? remaining[0].id;
      }

      if (pick === 'random') {
        if (removed.length === 0) {
          // 没有已移除项可执行：按「随机执行」的字面兜底为同状态的第一项
          pick = remaining[0].id;
        } else {
          pick = removed[Math.floor(Math.random() * removed.length)];
        }
      }
      await execCaiyi(ctx, targetId, pick, x);
      // 「并移除该选项」：移除的是玩家选择的那一项（random 选出来的按同状态已移除项处理，不重复移除）
      const chosenLabel = all.find(o => o.id === pick)?.label ?? pick;
      if (!removed.includes(pick)) ctx.memory[removedKey] = [...removed, pick];
      ctx.memory.yang = !isYang;   // 转换技：发动后切换阴阳
      ctx.log(`【彩翼】执行「${chosenLabel.replace('X', String(x))}」，状态切换为${isYang ? '阴' : '阳'}`);
    },
  },
});

// ── 李婉「别君」 ──────────────────────────────────────
registerSkill({
  hero: '李婉',
  skill: '别君',
  hooks: {
    onTurnStart: (ctx) => {
      ctx.memory.usedThisTurn = false;
      ctx.heroMemory.biejunGiven = [];
    },
    onPlayPhaseBegin: async (ctx, ev) => {
      // ①「其他角色的出牌阶段限一次」：钩子对全场派发，这里要的是别人的阶段
      if (ev.owner.id === ctx.self.id) return;
      if (ev.owner.isDead) return;
      if (ctx.memory.givenThisTurn) return;
      const giver = ctx.players.find(p => p.id === ev.owner.id);
      if (!giver || giver.hand.length === 0) return;
      if (giver.isHuman) {
        const r = await ctx.requestChoice({
          title: `别君：是否交给 ${ctx.self.hero.name} 一张手牌？`,
          mode: 'choose',
          choices: giver.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 1, max: 1, cancelLabel: '不交给',
        });
        const cid = r && (r.kind === 'choose' || r.kind === 'card') ? (r.id ?? r.ids?.[0]) : undefined;
        const card = giver.hand.find(c => c.id === cid);
        if (!card) return;
        ctx.memory.givenThisTurn = true;
        ctx.gainCard(giver.id, ctx.self.id, card);
        const given = (ctx.heroMemory.biejunGiven as string[] | undefined) ?? [];
        ctx.heroMemory.biejunGiven = [...given, card.id];
        ctx.log(`【别君】${giver.hero.name} 交给 ${ctx.self.hero.name}【${card.name}】`);
        return;
      }
      // AI：手牌多于 2 张就交一张最没用的
      if (giver.hand.length <= 2) return;
      const card: Card = giver.hand[giver.hand.length - 1];
      ctx.memory.givenThisTurn = true;
      ctx.gainCard(giver.id, ctx.self.id, card);
      const given = (ctx.heroMemory.biejunGiven as string[] | undefined) ?? [];
      ctx.heroMemory.biejunGiven = [...given, card.id];
      ctx.log(`【别君】${giver.hero.name} 交给 ${ctx.self.hero.name}【${card.name}】`);
    },
    onTurnEnd: (ctx) => { ctx.memory.givenThisTurn = false; },
    damageBefore: (ctx, ev) => {
      if (ev.victim.id !== ctx.self.id) return null;
      if (ctx.memory.usedThisTurn) return null;
      // 「若你手牌中没有本回合以此法获得的牌」
      const given = (ctx.heroMemory.biejunGiven as string[] | undefined) ?? [];
      const hasGiven = ctx.self.hand.some(c => given.includes(c.id));
      if (hasGiven) return null;
      ctx.memory.usedThisTurn = true;
      ctx.flip(ctx.self.id, true);
      ctx.log(`【别君】${ctx.self.hero.name} 翻面，防止此伤害`);
      return { prevent: true, note: '【别君】翻面防止伤害' };
    },
  },
});
