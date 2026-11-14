import { registerSkill } from './registry';
import type { SkillContext, CardUsedEvent, DamageEvent } from './registry';
import { Suit } from '../../../types';
import type { Player } from '../../../types';

/**
 * 第六批女将 · 第 6 组：董贵人（凌芳 / 归罪 / ☆ 受责）+ 张楚（集众 / 光噬）。
 *
 * 已实装 4 条，全部只用现有引擎原语：
 *   凌芳   afterCardUsed（combat.ts:1543 已接线）
 *   归罪   afterCardUsed + afterDamage（combat.ts:2752）判定「未因此受伤」
 *   集众   onTurnEnd（自己回合末＝出牌阶段终界）+ onTurnStart 复位 + 跨角色标记
 *   光噬   onTurnStart（自己回合开始＝准备阶段），读**别人**身上的「信众」
 *
 * 未实装 1 条（不写降级版本，已 hand_back）：
 *   ☆ 受责  结束阶段移去 1 个「绞」→ 随机获得弃牌堆中的一张黑色牌 → 失去 1 点体力。
 *           前两件原语都有，第三件没有：ctx 的牌堆原语只有 peekDeck / deckTo /
 *           changeMaxHp / takeFromDeck（dispatch.ts:151-154），四个都只作用于 deckRef；
 *           弃牌堆是 combat.ts:36 的 CombatDeps.discardPileRef，技能侧没有任何读出口。
 *           「从弃牌堆获得一张黑色牌」是本技能的收益所在，无从结算。
 *           需要补：ctx 增加弃牌堆原语（如 takeFromDiscard(pred, count)），并在
 *           combat.ts:256/1543/2752 的 deps 字面量里接上 discardPileRef。
 *
 * 时序（生产）：伤害在 resolveCardEffect 的 try 里结算、afterCardUsed 在 finally 里，
 * 所以 afterCardUsed 一定看得到本张牌造成的伤害——归罪靠这一点判「未因此受伤」，
 * 不需要引擎加工。
 *
 * 两个已知的取舍，都是**记录**而不是伪装：
 *  1. 「此牌生效」没有可观测的标记。afterCardUsed 在 finally 里派发，无论牌是被
 *     闪避/无懈抵消还是真的结算了都会派发（combat.ts:1538-1559）。registry 的
 *     CardUsedEvent 也只有 source/card/targets/usedCount 四个字段。因此这里把
 *     「结算结束」读作「生效」——与 heroDetail.ts:427「凌芳：黑色牌结算结束后（此牌生效时）」
 *     的括号注一致，但「被无懈抵消的牌」也会给标记，引擎侧无法区分。
 *  2. 董贵人的 skillName 同时声明了「归罪」与「凌芳」（constants.ts:1436），
 *     两者是同一技能的两个版本，条件互有重叠（归罪 = 凌芳 + 未受伤）。
 *     引擎按 skillName 全部注册，所以**一张未造成伤害的黑色牌会各给 1 个「绞」**
 *     （共 2 个）。要改成「二选一」属于数据层（constants.ts）的决定，不在本文件里
 *     私自定义——见交付报告里的上报项。
 *
 * 跨角色标记只有一处写入口，就是「集众」的 ctx.addMark('信众', 1, 目标id)：
 * 标记写在**对方**的 heroMemory 里（dispatch.ts:133-137 的 memFor），因此「光噬」查的
 * 是同一份状态——技能自己记 ctx.memory 的话，「所有其他角色是否都有信众」根本查不到。
 *
 * 「失去 1 点体力」不是伤害：引擎没有技能侧的体力流失原语（ctx.heal 只收正数，
 * ctx.damage 是受伤语义、会触发防具/属性/铁索）。这里按既有约定直改快照字段
 * （batch6new8.ts:189-193「知否」选项 3、combat.ts:2645「霜怀」的 updatePlayer(hp-1)
 * 同一做法）：体力降到 0 时不会由此单独触发求桃——引擎只在伤害路径里查 hp<=0，
 * 与它自己处理「失去体力」的方式一致，不是本技能引入的偏差。
 */

/** 黑色牌（♠/♣）：与 batch6new.ts:7 的口径一致 */
const isBlack = (s: Suit): boolean => s === Suit.SPADE || s === Suit.CLUB;

/** 董贵人的标记名 */
const JIAO = '绞';

const namesOf = (ps: Player[]): string => ps.map(p => p.hero.name).join('、');

/**
 * 「其他角色对你 / 你对其他角色使用黑色牌」——两个方向都要成立。
 *
 * 返回本次结算里**可能因此牌受伤的人**（归罪判「未因此受伤」要按这个集合查）：
 *  · 自己使用 → 目标里的其他角色
 *  · 他人使用且自己在目标里 → 自己
 * 两方向都不满足（比如甲对乙使用）→ null，技能不触发。
 */
const victimsOf = (ctx: SkillContext, ev: CardUsedEvent): Player[] | null => {
  if (ev.source.id === ctx.self.id) {
    const others = ev.targets.filter(t => t.id !== ctx.self.id);
    return others.length ? others : null;
  }
  return ev.targets.some(t => t.id === ctx.self.id) ? [ctx.self] : null;
};

// ── 董贵人「凌芳」（锁定技）────────────────────────────
// 当其他角色对你 / 你对其他角色使用黑色牌结算结束后，若此牌生效，你获得 1 个「绞」标记。
registerSkill({
  hero: '董贵人',
  skill: '凌芳',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (!isBlack(ev.card.suit)) return;
      const victims = victimsOf(ctx, ev);
      if (!victims) return;
      ctx.addMark(JIAO, 1);
      ctx.log('【凌芳】' + ev.source.hero.name + ' 对 ' + namesOf(victims) + ' 使用黑色牌【'
        + ev.card.name + '】，' + ctx.self.hero.name + ' 获得 1 个「' + JIAO + '」标记（当前 '
        + ctx.markCount(JIAO) + ' 个）');
      ctx.banner();
    },
  },
});

// ── 董贵人「归罪」（锁定技）────────────────────────────
// 当其他角色对你 / 你对其他角色使用黑色牌结算结束后，若此牌生效**且**你 / 目标角色
// 没有因此受到伤害，你获得 1 个「绞」标记。
//
// 「未因此受伤」用 afterDamage 记账、在 afterCardUsed 时查：伤害事件带 damageCard
// （combat.ts:2750），按「牌 id + 受伤者 id」记一条，所以只认**这张牌**造成的伤害，
// 别的牌打出的伤害不影响判定。
const hurtKey = (cardId: string, victimId: number): string => 'hurt:' + cardId + ':' + victimId;

registerSkill({
  hero: '董贵人',
  skill: '归罪',
  locked: true,
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (!ev.card) return;
      ctx.memory[hurtKey(ev.card.id, ev.victim.id)] = true;
    },
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (!isBlack(ev.card.suit)) return;
      const victims = victimsOf(ctx, ev);
      if (!victims) return;
      if (victims.some(v => ctx.memory[hurtKey(ev.card.id, v.id)])) return;
      ctx.addMark(JIAO, 1);
      ctx.log('【归罪】' + ev.source.hero.name + ' 对 ' + namesOf(victims) + ' 使用黑色牌【'
        + ev.card.name + '】且未造成伤害，' + ctx.self.hero.name + ' 获得 1 个「' + JIAO
        + '」标记（当前 ' + ctx.markCount(JIAO) + ' 个）');
      ctx.banner();
    },
  },
});
// ── 张楚「集众」────────────────────────────────────────
// 出牌阶段限一次，你可以令一名其他角色摸两张牌并选择一项：
// 1.获得「信众」标记；2.弃置三张手牌（不足则全弃）。
//
// 「出牌阶段」没有钩子（registry.ts:130-195 的 18 个钩子里没有它），主动技统一挂阶段
// 边界 + requestChoice —— 与「才韵」「复学」「讽言」「绡舞」同一形状
// （batch6new.ts:129-159 / 231-255 / 591-629、batch6new10.ts:48-51）。这里挂**自己**的
// onTurnEnd（出牌阶段的终界），问的就是「出牌阶段是否发动」；「限一次」的复位点是
// onTurnStart（对任意角色的回合开始都分发，不能拿 turnOwner.id 当 key）。
//
// 「信众」贴给**别人**：ctx.addMark 的第 3 个参数是玩家 id（registry.ts:96 声明、
// dispatch.ts:158-162 的 memFor 写到对方的 heroMemory）。这参数不是可选项——
// 技能自己记 ctx.memory 的话，将来「光噬」查「所有其他角色是否都有信众」时
// 只能查到自己的笔记本，查不到别人身上。
//
// 选项本应由**目标角色**选择：引擎的 requestChoice 服务的是人类玩家本人
// （registry.ts:33-36），所以按 batch6new10.ts:98-111 的形状判 p.isHuman ——
// 人类目标弹窗，AI / 托管走写死的默认项。默认取「① 获得信众标记」：原文把它列为
// 第一项，且与「光噬」同向；原文没规定 AI 策略，写死让对局可复现。
// 「弃置三张手牌」弃哪三张由目标决定；AI / 托管按手牌顺序取前三张
// （与 batch8.ts:503「追还」的「随机弃置」同口径）。
const XINZHONG = '信众';

/** 其他存活角色（死亡角色不摸牌，也不该被贴标记） */
const otherAlive = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);

registerSkill({
  hero: '张楚',
  skill: '集众',
  hooks: {
    onTurnStart: (ctx: SkillContext) => { delete ctx.memory.usedThisTurn; },
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const others = otherAlive(ctx);
      if (!others.length) return;

      const picked = await ctx.requestChoice({
        title: '集众：选择令谁摸两张牌',
        hint: '其摸两张牌，然后选择获得「信众」标记或弃置三张手牌',
        mode: 'target',
        targets: others.map(p => ({
          id: p.id,
          name: p.hero.name,
          sub: p.hand.length + ' 张手牌 · 信众 ' + ctx.markCount(XINZHONG, p.id),
        })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      // AI / 托管：优先还没有「信众」的角色（推动「光噬」的方向），并列时取座次靠前者
      const unmarked = others.filter(p => ctx.markCount(XINZHONG, p.id) <= 0);
      const tgt = (picked && picked.kind === 'target'
        ? others.find(p => p.id === Number(picked.ids?.[0]))
        : null) ?? (unmarked.length ? unmarked : others)[0];

      ctx.draw(tgt.id, 2);

      let takeMark = true;
      if (tgt.isHuman) {
        const r = await ctx.requestChoice({
          title: '集众：' + tgt.hero.name + ' 选择一项',
          hint: '1.获得「信众」标记；2.弃置三张手牌（不足则全弃）',
          mode: 'choose',
          choices: [
            { id: 'mark', label: '获得「信众」标记' },
            { id: 'discard', label: '弃置三张手牌（不足则全弃）' },
          ],
          cancelLabel: '获得「信众」标记',
        });
        takeMark = !(r && r.kind === 'choose' && r.id === 'discard');
      }

      if (takeMark) {
        ctx.addMark(XINZHONG, 1, tgt.id);
        ctx.log('【集众】' + ctx.self.hero.name + ' 令 ' + tgt.hero.name + ' 摸两张牌并获得 1 个「'
          + XINZHONG + '」标记（' + tgt.hero.name + ' 当前 ' + ctx.markCount(XINZHONG, tgt.id) + ' 个）');
      } else {
        const n = Math.min(3, tgt.hand.length);
        let cards = tgt.hand.slice(0, n);
        if (tgt.isHuman && n > 1) {
          const pick = await ctx.requestChoice({
            title: '集众：' + tgt.hero.name + ' 弃置 ' + n + ' 张手牌',
            hint: '不足三张则全弃',
            mode: 'multi',
            choices: tgt.hand.map(c => ({ id: c.id, label: '【' + c.name + '】' + c.suit })),
            min: n,
            max: n,
            cancelLabel: '按手牌顺序弃置',
          });
          if (pick && pick.kind === 'multi' && pick.ids?.length) {
            cards = tgt.hand.filter(c => pick.ids!.map(String).includes(c.id));
          }
        }
        if (cards.length) ctx.discard(tgt.id, cards);
        ctx.log('【集众】' + ctx.self.hero.name + ' 令 ' + tgt.hero.name + ' 摸两张牌并弃置 '
          + cards.length + ' 张手牌（不足三张则全弃）');
      }
      ctx.memory.usedThisTurn = true;
      ctx.banner();
    },
  },
});
// ── 张楚「光噬」（锁定技）──────────────────────────────
// 准备阶段，若所有其他角色均拥有「信众」标记，你失去 1 点体力，摸两张牌。
//
// 准备阶段 = 自己回合的开始点，所以挂在 onTurnStart 上、用自己的 id 过滤；
// 「所有其他角色均拥有」逐个查 ctx.markCount('信众', 对方id)（跨角色读取），
// 少一个就不发动——这也是「集众」必须把标记贴到别人身上的原因。
registerSkill({
  hero: '张楚',
  skill: '光噬',
  locked: true,
  hooks: {
    onTurnStart: (ctx: SkillContext, owner: Player) => {
      if (owner.id !== ctx.self.id) return;
      const others = otherAlive(ctx);
      // 没有其他角色时「所有其他角色均拥有」是空真，但那既无意义也无对局，按不发动处理
      if (!others.length) return;
      if (!others.every(p => ctx.markCount(XINZHONG, p.id) > 0)) return;
      ctx.self.hp -= 1;                       // 失去 1 点体力（不是伤害）
      ctx.draw(ctx.self.id, 2);
      ctx.log('【光噬】其他角色（' + namesOf(others) + '）均拥有「' + XINZHONG + '」标记，'
        + ctx.self.hero.name + ' 失去 1 点体力（' + ctx.self.hp + '/' + ctx.self.maxHp
        + '）并摸两张牌');
      ctx.banner();
    },
  },
});
