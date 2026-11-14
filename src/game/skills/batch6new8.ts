import { registerSkill } from './registry';
import type {
  SkillContext, CardUsedEvent, DamageEvent, DeathEvent, CardTargetsEvent,
} from './registry';
import { Suit } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 8 组：5 个技能。
 *
 * 全部只使用**已有**的钩子与原语，没有引入任何引擎改动。逐条交代实装边界，
 * 凡是引擎表达不了的子句一律在注释里点名，不做「看起来像」的降级实现：
 *
 *   王荣「敏思」  出牌阶段限一次 → onTurnEnd 近似（引擎无出牌阶段钩子）
 *   曹宪「知否」  完整（「翼」= Player.placedCards，与 batch6new.ts「灵犀」同一区域）
 *   丁尚涴「抚悼」条款 1 完整；条款 2 的「决裂」标记与「伤害 +1」实现，
 *                  「本回合不能再使用牌」无 API
 *   邓晚棠「黛颊」① 的「受到伤害后」分支完整，「出牌阶段」分支用 onTurnEnd 近似；
 *                 ② 完整
 *   夏侯徽「笃君」选搭档与「每回合首次伤害后摸 2 张并交给一名角色」完整；
 *                 「你不能响应其使用的牌」无 API
 *
 * 共用约定（与 batch6new / batch6new5 一致）：
 *  · 「武将牌上」= Player.placedCards，技能侧直接改快照字段（技能拿不到 mutateHand）
 *  · 「每回合首次 / 限一次」的复位点是 onTurnStart（不能用 turnOwner.id 当 key）
 *  · AI / 托管（requestChoice 返回 null）走确定性的自动分支
 */

/** 黑色牌（♠/♣） */
const isBlack = (s: Suit): boolean => s === Suit.SPADE || s === Suit.CLUB;
/** 红色牌（♥/♦） */
const isRed = (s: Suit): boolean => s === Suit.HEART || s === Suit.DIAMOND;

/** 其他存活角色 */
const otherAlive = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => p.id !== ctx.self.id && !p.isDead);

/** 全部存活角色（「一名角色」不排除自己） */
const allAlive = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => !p.isDead);

/** 记忆里的 id → 场上角色（阵亡者也返回，调用方自己判 isDead） */
const findById = (ctx: SkillContext, raw: unknown): Player | undefined =>
  typeof raw === 'number' ? ctx.players.find(p => p.id === raw) : undefined;

/**
 * 「游戏开始时选择一名其他角色」的共用体（抚悼 / 笃君）。
 *
 * 引擎没有「游戏开始」钩子，用**第一次回合开始**近似——这是「游戏开始时」
 * 唯一可用的等价边界（与「灵犀」用 onTurnStart/onTurnEnd 近似「出牌阶段」同一口径）。
 * 选定后写进 memory，之后每次 onTurnStart 只做「每回合首次」的复位，不再重复询问。
 *
 * 原文是强制选择（「你选择一名其他角色」），没有「不发动」：人类关掉弹窗时
 * 按自动分支取座位最靠前的其他存活角色，绝不留下「未选定」状态。
 *
 * 已知边界：memory 是模块级、跨局保留的（引擎只在测试里清），同一页面开第二局
 * 且座位/武将完全相同时会沿用上一局的搭档。这一限制与 batch7「异瞳」相同，
 * 单独为它加「新局检测」需要引擎提供局号，本组不引入。
 */
async function choosePartnerOnce(
  ctx: SkillContext,
  title: string,
  hint: string,
): Promise<Player | undefined> {
  const prev = findById(ctx, ctx.memory.partnerId);
  if (prev) return prev;
  const others = otherAlive(ctx);
  if (!others.length) return undefined;
  const picked = await ctx.requestChoice({
    title,
    hint,
    mode: 'target',
    targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: p.hand.length + ' 张手牌' })),
    min: 1,
    max: 1,
  });
  const chosen = (picked && picked.kind === 'target'
    ? others.find(p => p.id === Number(picked.ids?.[0]))
    : undefined) ?? others[0];
  ctx.memory.partnerId = chosen.id;
  return chosen;
}

// ── 王荣「敏思」────────────────────────────────────────
// 出牌阶段限一次，你可以弃置任意张点数之和为 13 的牌，然后摸两倍数量的牌。
//
// 时机：引擎没有「出牌阶段」钩子（SkillHooks 18 个里最接近的是 drawPhaseBegin /
// onTurnEnd），这里用**自己回合结束时**近似，与「灵犀」的近似口径一致。
// 代价与收益都照原文精确执行：点数和必须**恰好** 13，弃 N 张就摸 2N 张。
//
// 原文括号里的两句附带效果**未实现**，且在本近似下也没有生效窗口：
//  · 「黑色牌使用时无距离限制」——引擎没有「按牌限制距离」的原语（距离在
//    combat.ts 里按武器/马计算，技能侧无入口），且此时出牌阶段已经结束；
//  · 「红色牌不计入手牌上限」——需要「这张牌来自本技能」的逐牌标记（引擎没有），
//    而本回合的弃牌阶段在本钩子**之前**已经结算，摸到的牌这一回合也不再参与
//    手牌上限判断，所以这一句在此时机下无从生效。
//
// 「弃置任意张」：requestChoice(mode:'multi')，人类选完由技能校验点数和；
// 校验不过（包括一张没选）只写战报、不弃不摸。AI / 托管（返回 null）取
// 点数和为 13 的**最大子集**（弃得越多净收益越大：弃 N 摸 2N）。
const MINSI_SUM = 13;

/** 点数和恰为 13 的子集中张数最多的一个（AI / 托管分支）；凑不出返回 null */
function pickMinsiCards(hand: Card[]): Card[] | null {
  // best[s] = 点数和为 s 的最优子集；从高到低更新，天然保证每张牌只用一次
  const best: Array<Card[] | null> = new Array(MINSI_SUM + 1).fill(null);
  best[0] = [];
  for (const c of hand) {
    const v = c.value;
    if (!Number.isInteger(v) || v <= 0 || v > MINSI_SUM) continue;
    for (let s = MINSI_SUM; s >= v; s--) {
      const prev = best[s - v];
      if (!prev) continue;
      const cur = best[s];
      if (!cur || prev.length + 1 > cur.length) best[s] = [...prev, c];
    }
  }
  const found = best[MINSI_SUM];
  return found && found.length ? found : null;
}

registerSkill({
  hero: '王荣',
  skill: '敏思',
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.usedThisTurn;
    },
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;      // 只有自己的出牌阶段
      if (ctx.memory.usedThisTurn) return;        // 限一次
      if (!ctx.self.hand.length) return;
      const picked = await ctx.requestChoice({
        title: '敏思：弃置任意张点数之和为 13 的牌',
        hint: '点数和须恰好为 13；弃 N 张后摸 2N 张',
        mode: 'multi',
        choices: ctx.self.hand.map(c => ({
          id: c.id, label: `【${c.name}】${c.suit}${c.rank}`, desc: `点数 ${c.value}`,
        })),
        min: 1,
        max: ctx.self.hand.length,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      let chosen: Card[];
      if (picked && picked.kind === 'multi') {
        const ids = (picked.ids ?? []).map(String);
        chosen = ctx.self.hand.filter(c => ids.includes(c.id));
        const sum = chosen.reduce((a, c) => a + c.value, 0);
        if (sum !== MINSI_SUM) {
          ctx.log(`【敏思】所选 ${chosen.length} 张牌点数之和为 ${sum}，不是 13，本次不发动`);
          return;
        }
      } else {
        const auto = pickMinsiCards(ctx.self.hand);   // AI / 托管
        if (!auto) return;                            // 手牌凑不出 13 = 付不起代价
        chosen = auto;
      }
      if (!chosen.length) return;
      ctx.memory.usedThisTurn = true;
      const n = chosen.length;
      ctx.discard(ctx.self.id, chosen);
      ctx.draw(ctx.self.id, n * 2);
      ctx.log(`【敏思】${ctx.self.hero.name} 弃置 ${n} 张点数之和为 13 的牌，摸 ${n * 2} 张`);
      ctx.banner();
    },
  },
});

// ── 曹宪「知否」────────────────────────────────────────
// 当你使用牌结算结束后，若你本回合未选择过此技能的所有选项，你可以移去至少 X 张
// 「翼」（X 为你本回合发动此技能的次数），选择一名角色并选择本回合未选择过的一项，
// 令其执行之：1. 将一张牌置入「翼」；2. 弃置两张牌；3. 失去 1 点体力。
//
// 「翼」= Player.placedCards（batch6new.ts「灵犀」写入的同一区域）：本文件补上
// 「移去 / 置入」的另一半，两侧共用同一字段，不需要任何新的引擎能力。
//
// X 的读法：取**含本次**的本回合发动次数（第 1/2/3 次 → 移去 1/2/3 张）。理由：
// 「移去至少 X 张」若不含本次，第一次发动 X=0 就是零代价，与「至少 X 张」的措辞
// 相悖；含本次读法下 X 恒 ≥1，「移去翼」才是一个真代价，也与「灵犀」每回合最多
// 置入 2 × 体力上限张、知否每回合最多发动 3 次（三个选项各一次）相吻合。
//
// 移去的「翼」去处：原文未写，按惯例进弃牌堆。技能侧唯一能写弃牌堆的原语是
// ctx.discard（App.tsx 的 discardCards 按 id 从手牌移除、再把传入的牌整批入堆），
// 所以先直接改 placedCards 摘掉它们，再用 ctx.discard 把它们送进弃牌堆——对不在
// 手牌的牌，它只入堆、不会动到手牌。副作用是给曹宪自己派发一次 afterCardLost
// （曹宪的另一个技能「灵犀」不听这个钩子，故无影响）。
//
// 选项 3「失去 1 点体力」：引擎**没有**技能侧的「体力流失」原语（ctx.heal 只接受
// 正数；引擎自己也是 updatePlayer(hp-1)，见 combat.ts:2645「霜怀」），这里按既有
// 约定直改快照字段（与「灵犀」改手牌、migrated3.ts:63 改体力同一做法）。后果是
// 体力降到 0 时不会由此单独触发求桃——引擎只在伤害路径里查 hp<=0，与它自己处理
// 「失去体力」的方式一致，不是本技能引入的偏差。
//
// 「令其执行」：目标是人类时由他自选自己的牌；其他角色的牌由技能随机取——与
// 「讽言」令他人交牌同一口径（引擎的 requestSkillChoice 只弹给人类玩家，替别人
// 答题会弹错人）。选项是否可执行不影响「本回合已选过」的记账：原文是「选择一项
// 令其执行」，没有可弃的牌这一项同样算被选择过。
const ZHIFOU_OPTIONS = [
  { id: '1', label: '将一张牌置入「翼」', desc: '从该角色的手牌置入曹宪的「翼」' },
  { id: '2', label: '弃置两张牌', desc: '手牌不足则全弃' },
  { id: '3', label: '失去 1 点体力' },
];

/** 「知否」的三项效果 */
async function runZhifouOption(ctx: SkillContext, target: Player, opt: string): Promise<void> {
  if (opt === '1') {
    if (!target.hand.length) {
      ctx.log(`【知否】${target.hero.name} 没有手牌，无法置入「翼」`);
      return;
    }
    let card: Card | undefined;
    if (target.isHuman) {
      const pick = await ctx.requestChoice({
        title: '知否：选择一张手牌置入「翼」',
        hint: '置入曹宪的武将牌上',
        mode: 'multi',
        choices: target.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}`, desc: '置入「翼」' })),
        min: 1,
        max: 1,
        cancelLabel: '不置入',
      });
      if (pick && pick.kind === 'cancel') return;
      const ids = (pick?.ids ?? []).map(String);
      card = target.hand.find(c => ids.includes(c.id));
    }
    card = card ?? target.hand[Math.floor(Math.random() * target.hand.length)];
    target.hand = target.hand.filter(c => c.id !== card.id);
    ctx.self.placedCards = [...(ctx.self.placedCards ?? []), card];
    ctx.log(`【知否】${target.hero.name} 的【${card.name}】被置于曹宪的武将牌上，成为「翼」`);
    return;
  }
  if (opt === '2') {
    if (!target.hand.length) {
      ctx.log(`【知否】${target.hero.name} 没有手牌可弃`);
      return;
    }
    const take = Math.min(2, target.hand.length);
    let cards: Card[] = [];
    if (target.isHuman) {
      const pick = await ctx.requestChoice({
        title: `知否：弃置 ${take} 张牌`,
        hint: '手牌不足则全弃',
        mode: 'multi',
        choices: target.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}`, desc: '弃置' })),
        min: 1,
        max: take,
        cancelLabel: '不弃置',
      });
      if (pick && pick.kind === 'cancel') return;
      const ids = (pick?.ids ?? []).map(String);
      cards = target.hand.filter(c => ids.includes(c.id)).slice(0, take);
    }
    if (!cards.length) cards = target.hand.slice(0, take);   // AI / 托管：取最前面的 take 张
    ctx.discard(target.id, cards);
    ctx.log(`【知否】${target.hero.name} 弃置 ${cards.length} 张牌`);
    return;
  }
  target.hp -= 1;   // opt === '3'：失去 1 点体力（不是伤害）
  ctx.log(`【知否】${target.hero.name} 失去 1 点体力（${target.hp}/${target.maxHp}）`);
}

registerSkill({
  hero: '曹宪',
  skill: '知否',
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      ctx.memory.usedCount = 0;
      ctx.memory.chosenOptions = [];
    },
    afterCardUsed: async (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;                    // 「当你使用牌」
      const usedCount = Number(ctx.memory.usedCount ?? 0);
      const chosenOptions = (ctx.memory.chosenOptions as string[] | undefined) ?? [];
      if (chosenOptions.length >= ZHIFOU_OPTIONS.length) return;    // 所有选项都选过了
      const x = usedCount + 1;                                      // 含本次
      const wings = ctx.self.placedCards ?? [];
      if (wings.length < x) return;                                 // 「翼」不够，付不起代价

      // ① 移去至少 X 张「翼」
      const pickedWing = await ctx.requestChoice({
        title: `知否：移去至少 ${x} 张「翼」`,
        hint: `X = 本回合发动次数（含本次）；当前「翼」${wings.length} 张`,
        mode: 'multi',
        choices: wings.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}`, desc: '移去（进弃牌堆）' })),
        min: x,
        max: wings.length,
        cancelLabel: '不发动',
      });
      if (pickedWing && pickedWing.kind === 'cancel') return;
      let removed: Card[];
      if (pickedWing && pickedWing.kind === 'multi') {
        const ids = (pickedWing.ids ?? []).map(String);
        removed = wings.filter(c => ids.includes(c.id));
        if (removed.length < x) return;                             // 代价没付足，本次不发动
      } else {
        removed = wings.slice(0, x);                                // AI / 托管：移去最先置入的 X 张
      }

      // ② 选择一名角色（原文是「一名角色」，不排除自己）
      const pool = allAlive(ctx);
      if (!pool.length) return;
      const pickedTgt = await ctx.requestChoice({
        title: '知否：选择执行选项的角色',
        hint: '该角色执行你选择的选项',
        mode: 'target',
        targets: pool.map(p => ({
          id: p.id, name: p.hero.name, sub: `体力 ${p.hp}/${p.maxHp} · 手牌 ${p.hand.length}`,
        })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (pickedTgt && pickedTgt.kind === 'cancel') return;
      const target = (pickedTgt && pickedTgt.kind === 'target'
        ? pool.find(p => p.id === Number(pickedTgt.ids?.[0]))
        : undefined)
        ?? [...otherAlive(ctx)].sort((a, b) => b.hand.length - a.hand.length)[0]
        ?? ctx.self;

      // ③ 选择本回合未选择过的一项
      const avail = ZHIFOU_OPTIONS.filter(o => !chosenOptions.includes(o.id));
      // AI / 托管：目标有牌时按 1 → 2 → 3 取第一项，没牌时取一定可执行的 3
      const autoOpt = (target.hand.length ? avail[0] : avail.find(o => o.id === '3')) ?? avail[0];
      const pickedOpt = await ctx.requestChoice({
        title: '知否：选择一项令其执行',
        hint: `目标：${target.hero.name}`,
        mode: 'choose',
        choices: avail.map(o => ({ id: o.id, label: o.label, desc: o.desc })),
        cancelLabel: '不发动',
      });
      if (pickedOpt && pickedOpt.kind === 'cancel') return;
      const opt = pickedOpt && pickedOpt.kind === 'choose'
        && avail.some(o => o.id === String(pickedOpt.id))
        ? String(pickedOpt.id)
        : autoOpt.id;

      // 代价与效果一起落地：上面任何一步取消都不会消耗「翼」
      ctx.memory.usedCount = x;
      ctx.memory.chosenOptions = [...chosenOptions, opt];
      if (removed.length) {
        const gone = new Set(removed.map(c => c.id));
        ctx.self.placedCards = wings.filter(c => !gone.has(c.id));
        ctx.discard(ctx.self.id, removed);
      }
      const label = ZHIFOU_OPTIONS.find(o => o.id === opt)?.label ?? '';
      ctx.log(`【知否】${ctx.self.hero.name} 移去 ${removed.length} 张「翼」，令 ${target.hero.name} 执行：${label}`);
      ctx.banner();
      await runZhifouOption(ctx, target, opt);
    },
  },
});

// ── 丁尚涴「抚悼」────────────────────────────────────────
// 游戏开始时，你选择一名其他角色：
// 1. 当你或其每回合第一次使用牌指定另一方为目标后，各摸两张牌；
// 2. 当你或该角色死亡后，杀死你或其的角色获得「决裂」标记（「决裂」角色：
//    1. 受到你或「抚悼」角色造成的伤害 +1；2. 使用黑色牌指定你为目标后本回合
//    不能再使用牌）。
//
// 条款 1 **完整**：afterCardUsed 的 targets 就是「指定为目标」的真值，方向双向
// （你 → 其 / 其 → 你）；「每回合第一次」用 onTurnStart 复位（与「俐影」同一约定，
// 不用 turnOwner.id 当 key）。
//
// 条款 2 的实现边界：
//  · 「获得决裂标记」记进 ctx.memory.decree。标记挂在**别的角色**身上，而 ctx.addMark
//    的 scope 明确限定为「本人」，Player 上也没有自由标记字段（types.ts 里每个标记
//    都是某个武将的专用字段，且不在本批可改范围）。因为「决裂」的效果只有丁尚涴
//    自己的技能需要读取，放在她自己的记忆里是自洽的，不依赖新 API 也不碰存档格式。
//  · 效果 1（受到你或「抚悼」角色造成的伤害 +1）用 damageBefore 实现。
//  · 效果 2（使用黑色牌指定你为目标后本回合不能再使用牌）**未实现**：引擎没有
//    「本回合不能再使用牌」的闸门——出牌入口在 App.tsx / combat.ts 的使用流程里，
//    技能侧没有拦截点（同类机制「魅步止息」是 combat.ts 内联分支）。写一段永不生效
//    的代码比不写更糟，所以明确不做；需要的新 API：一个「使用牌前」钩子
//    （useCardBefore）或 ctx 上的「禁止某角色本回合使用牌」原语。
//  · 丁尚涴阵亡后引擎不再向死亡角色派发技能（ownersOf 默认跳过 isDead），所以
//    「你死亡后」得到的那枚标记，其效果 1 之后不会再由她本人兑现。这是引擎既有的
//    「技能随角色存活」绑定，不是本技能的选择。
registerSkill({
  hero: '丁尚涴',
  skill: '抚悼',
  hooks: {
    onTurnStart: async (ctx: SkillContext) => {
      delete ctx.memory.firstPaired;                 // 每回合第一次
      if (findById(ctx, ctx.memory.partnerId)) return;   // 「游戏开始时」已选定
      const chosen = await choosePartnerOnce(
        ctx,
        '抚悼：选择一名其他角色',
        '此后你与其每回合第一次互相指定为目标时，各摸两张牌',
      );
      if (!chosen) return;
      ctx.log(`【抚悼】${ctx.self.hero.name} 选择 ${chosen.hero.name} 为「抚悼」对象`);
      ctx.banner();
    },
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      const partner = findById(ctx, ctx.memory.partnerId);
      if (!partner || partner.isDead) return;
      const towardPartner = ev.source.id === ctx.self.id
        && ev.targets.some(t => t.id === partner.id);
      const towardSelf = ev.source.id === partner.id
        && ev.targets.some(t => t.id === ctx.self.id);
      if (!towardPartner && !towardSelf) return;
      if (ctx.memory.firstPaired) return;            // 每回合第一次
      ctx.memory.firstPaired = true;
      ctx.draw(ctx.self.id, 2);
      ctx.draw(partner.id, 2);
      ctx.log(`【抚悼】${ctx.self.hero.name} 与 ${partner.hero.name} 互相指定为目标，各摸两张牌`);
      ctx.banner();
    },
    afterDeath: (ctx: SkillContext, ev: DeathEvent) => {
      const partner = findById(ctx, ctx.memory.partnerId);
      const mine = ev.dead.id === ctx.self.id || (!!partner && ev.dead.id === partner.id);
      if (!mine) return;
      const killer = ev.killer;
      if (!killer) return;                           // 无来源阵亡没有「杀死…的角色」
      const decree = (ctx.memory.decree as number[] | undefined) ?? [];
      if (decree.includes(killer.id)) return;
      ctx.memory.decree = [...decree, killer.id];
      ctx.log(`【抚悼】${ev.dead.hero.name} 阵亡，${killer.hero.name} 获得「决裂」标记`);
      ctx.banner();
    },
    damageBefore: (ctx: SkillContext, ev) => {
      const decree = (ctx.memory.decree as number[] | undefined) ?? [];
      if (!decree.includes(ev.victim.id)) return null;
      if (ev.amount <= 0) return null;
      const partner = findById(ctx, ctx.memory.partnerId);
      const fromPair = ev.source?.id === ctx.self.id
        || (!!partner && ev.source?.id === partner.id);
      if (!fromPair) return null;
      ctx.log(`【抚悼】「决裂」：${ev.victim.hero.name} 受到的伤害 +1`);
      return { amount: ev.amount + 1, note: '【抚悼】决裂：伤害 +1' };
    },
  },
});

// ── 邓晚棠「黛颊」────────────────────────────────────────
// ① 出牌阶段或你受到伤害后，你可弃置所有黑色手牌并回复 1 点体力，然后随机从牌堆或
//    弃牌堆中将等量张红色牌置于武将牌上，称为「黛」；
// ② 其他角色每回合首次使用牌指定你为目标时，若你有「黛」，其须交给你 1 张牌，然后
//    你交给其 1 张「黛」且可选择是否获得所有「黛」。
//
// ① 「受到伤害后」用 afterDamage 完整实现；「出牌阶段」同样没有钩子（与「敏思」
//    同因），用**自己回合结束时**近似，与「灵犀」的近似口径一致。落实不到原语的两点：
//    · 「随机从牌堆**或弃牌堆**」：技能侧没有「从弃牌堆取指定牌」的原语（弃牌堆的
//      写入口只有 ctx.discard），只有 takeFromDeck 能按条件从**牌堆**取牌。所以只从
//      牌堆取，牌堆里红色牌不足时按实际可得数量结算（战报写明张数）。
//    · 「随机」：takeFromDeck 按堆顶顺序取，不是随机。数量与结果状态一致，只是取到
//      的是哪几张红牌不同。
//    · 代价守卫：原文「弃置所有黑色手牌」在 0 张黑牌时也成立，那会变成「零代价回复
//      1 点体力」，而该技能没有每回合限一次——所以这里要求至少 1 张黑色手牌才询问。
//
// ② 挂在 onTargetsChosen（combat.ts 里「目标已定、效果未结算」的唯一时机，与
//    「邀弈 / 劳燕」同一位置）：返回 null 不改写目标，只在结算前完成交换。
//    · 「其须交给你 1 张牌」是强制的：从对方手牌随机取一张（与「讽言」同一口径）。
//    · 「你交给其 1 张黛」用 ctx.gainCard：它按 id 从手牌移除再交给对方，对不在手牌的
//      「黛」只会把牌交出去，所以武将牌上那张要自己摘掉（直改 placedCards）。
//    · 「可选择是否获得所有黛」由 requestChoice 询问，AI / 托管（null）不取——留在
//      武将牌上才能继续支撑 ② 的触发条件。
/** 「黛颊」① 的共用体：弃所有黑色手牌 → 回复 1 点体力 → 等量张红色牌置于武将牌上 */
async function daiJiOnce(ctx: SkillContext, when: string): Promise<void> {
  const blacks = ctx.self.hand.filter(c => isBlack(c.suit));
  if (!blacks.length) return;                 // 见上：0 张黑牌不成代价，不询问
  const n = blacks.length;
  const picked = await ctx.requestChoice({
    title: '黛颊：弃置所有黑色手牌并回复 1 点体力',
    hint: `将获得等量张红色牌置于武将牌上，称为「黛」（${n} 张）`,
    mode: 'choose',
    choices: [{ id: 'yes', label: `发动（弃置 ${n} 张黑色手牌）` }, { id: 'no', label: '不发动' }],
    cancelLabel: '不发动',
  });
  if (picked && (picked.kind === 'cancel' || picked.id !== 'yes')) return;
  ctx.discard(ctx.self.id, blacks);
  ctx.heal(ctx.self.id, 1);
  const reds = ctx.takeFromDeck(c => isRed(c.suit), n);
  if (reds.length) ctx.self.placedCards = [...(ctx.self.placedCards ?? []), ...reds];
  ctx.log(`【黛颊】${ctx.self.hero.name} 弃置 ${n} 张黑色手牌，回复 1 点体力，将 ${reds.length} 张红色牌置于武将牌上称为「黛」（${when}）`);
  ctx.banner();
}

registerSkill({
  hero: '邓晚棠',
  skill: '黛颊',
  hooks: {
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.usedSources;            // 每回合首次（按使用者分别记）
    },
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      await daiJiOnce(ctx, '出牌阶段');
    },
    afterDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      await daiJiOnce(ctx, '受到伤害后');
    },
    onTargetsChosen: async (ctx: SkillContext, ev: CardTargetsEvent) => {
      if (ev.source.id === ctx.self.id) return null;                    // 「其他角色」
      if (!ev.targets.some(t => t.id === ctx.self.id)) return null;     // 指定你为目标
      const dai = ctx.self.placedCards ?? [];
      if (!dai.length) return null;                                     // 若你有「黛」
      const used = (ctx.memory.usedSources as number[] | undefined) ?? [];
      if (used.includes(ev.source.id)) return null;                     // 每回合首次
      ctx.memory.usedSources = [...used, ev.source.id];

      const from = ev.source;
      if (from.hand.length) {
        const give = from.hand[Math.floor(Math.random() * from.hand.length)];
        ctx.gainCard(from.id, ctx.self.id, give);
        ctx.log(`【黛颊】${from.hero.name} 交给邓晚棠一张手牌【${give.name}】`);
      } else {
        ctx.log(`【黛颊】${from.hero.name} 没有手牌，未交出牌`);
      }
      const out = dai[0];
      const rest = dai.slice(1);
      ctx.self.placedCards = rest;
      ctx.gainCard(ctx.self.id, from.id, out);
      ctx.log(`【黛颊】邓晚棠将 1 张「黛」交给 ${from.hero.name}（剩余 ${rest.length} 张）`);
      ctx.banner();
      if (rest.length) {
        const pick = await ctx.requestChoice({
          title: `黛颊：是否获得所有「黛」？（剩余 ${rest.length} 张）`,
          hint: '获得后你没有「黛」，② 将不再触发',
          mode: 'choose',
          choices: [{ id: 'yes', label: '获得所有「黛」' }, { id: 'no', label: '留在武将牌上' }],
          cancelLabel: '留在武将牌上',
        });
        if (pick && pick.kind === 'choose' && pick.id === 'yes') {
          ctx.self.placedCards = [];
          ctx.self.hand = [...ctx.self.hand, ...rest];
          ctx.log(`【黛颊】邓晚棠获得所有「黛」（${rest.length} 张）`);
        }
      }
      return null;
    },
  },
});

// ── 夏侯徽「笃君」────────────────────────────────────────
// 游戏开始时，你选择一名其他角色，你不能响应其使用的牌。你与其每回合首次造成或
// 受到伤害后，你可摸 2 张牌，然后将这些牌交给一名角色。
//
// 选搭档：与「抚悼」共用 choosePartnerOnce（第一次回合开始近似「游戏开始时」）。
//
// 「你不能响应其使用的牌」**未实现**：引擎没有「响应」的拦截点。响应流程（求闪、
// 无懈可击链、出【杀】的应答）全在 combat.ts 的内联分支里，SkillHooks 里没有任何
// 「响应前」钩子，onTargetsChosen 只能改写目标、不能禁止或强制某个响应者出牌。
// 需要的新 API：一个「响应前」钩子（respondBefore），或 ctx 上「禁止某角色对某来源
// 作出响应」的原语。不写看似生效的假实现。
//
// 「你与其每回合首次造成或受到伤害后」：afterDamage（受到）与 afterDealDamage（造成）
// 两个钩子都挂，结算收在同一个 grantDujun 里。同一次伤害事件引擎会把两个钩子**各派发
// 一次**（combat.ts:2752 / 2769），所以用 memory 里同一个「本回合已触发」标记去重：
// 先派发的 afterDamage 抢到标记，后派发的 afterDealDamage 直接返回。
// 「首次」读作**你与其共同的**每回合第一次——原文是单次触发（「你可摸 2 张牌」），
// 不是两边各一次。复位点同样是 onTurnStart。
//
// 「然后将这些牌交给一名角色」：ctx.draw 返回的就是刚摸到的牌，逐张 gainCard 交出去。
// 目标由 requestChoice 选，原文「一名角色」不排除自己，故候选含自己（选自己＝留下）；
// AI / 托管按既有给牌口径给「手牌最少的一名其他角色」（与「俐影」「追德」同一口径）。
/** 「笃君」的共用结算：你与其每回合首次造成或受到伤害后，摸 2 张并交给一名角色 */
async function grantDujun(ctx: SkillContext, ev: DamageEvent): Promise<void> {
  const partner = findById(ctx, ctx.memory.partnerId);
  if (!partner || partner.isDead) return;
  const involved = ev.victim.id === ctx.self.id || ev.victim.id === partner.id
    || ev.source?.id === ctx.self.id || ev.source?.id === partner.id;
  if (!involved) return;
  if (ctx.memory.firstDamage) return;                  // 每回合首次
  const pool = allAlive(ctx);
  if (!pool.length) return;
  const picked = await ctx.requestChoice({
    title: '笃君：摸 2 张牌并交给一名角色',
    hint: '每回合首次造成或受到伤害后发动',
    mode: 'target',
    targets: pool.map(p => ({
      id: p.id, name: p.hero.name, sub: `体力 ${p.hp}/${p.maxHp} · 手牌 ${p.hand.length}`,
    })),
    min: 1,
    max: 1,
    cancelLabel: '不发动',
  });
  if (picked && picked.kind === 'cancel') return;
  const others = pool.filter(p => p.id !== ctx.self.id);
  const auto = [...others].sort((a, b) => a.hand.length - b.hand.length)[0];
  const target = (picked && picked.kind === 'target'
    ? pool.find(p => p.id === Number(picked.ids?.[0]))
    : undefined) ?? auto ?? ctx.self;
  ctx.memory.firstDamage = true;
  const got = ctx.draw(ctx.self.id, 2);
  for (const c of got) ctx.gainCard(ctx.self.id, target.id, c);
  ctx.log(`【笃君】${ctx.self.hero.name} 摸 2 张牌并交给 ${target.hero.name}${got.length ? '' : '（牌堆已空，无牌可交）'}`);
  ctx.banner();
}

registerSkill({
  hero: '夏侯徽',
  skill: '笃君',
  hooks: {
    onTurnStart: async (ctx: SkillContext) => {
      delete ctx.memory.firstDamage;                    // 每回合首次
      if (findById(ctx, ctx.memory.partnerId)) return;  // 「游戏开始时」已选定
      const chosen = await choosePartnerOnce(
        ctx,
        '笃君：选择一名其他角色',
        '你与其每回合首次造成或受到伤害后，你可摸 2 张牌并交给一名角色',
      );
      if (!chosen) return;
      ctx.log(`【笃君】${ctx.self.hero.name} 选择 ${chosen.hero.name} 为「笃君」对象`);
      ctx.banner();
    },
    afterDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      await grantDujun(ctx, ev);
    },
    afterDealDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      await grantDujun(ctx, ev);
    },
  },
});
