import { registerSkill } from './registry';
import type { SkillContext, CardLostEvent, DrawPhaseEvent, DrawPhaseResult } from './registry';
import { CardType } from '../../../types';
import type { Card } from '../../../types';

/**
 * 第六批女将 · 第 11 组：**引擎能力补齐后**回填的技能。
 *
 * 已实装 1 条：
 *   全惠解「慧淑」  drawPhaseBegin（replaced 语义，见下）+ afterCardLost + takeFromDiscard
 *
 * 未实装 2 条。两条都不是「ctx 缺原语」，而是**原语在派发点没接线**，
 * 所以照原文写出来的只会是「注册了但永远静默」的假实现，按约定整条退回：
 *
 *   董贵人「☆ 受责」
 *     App.tsx:4083 的 dispatchTurnEnd 是**手写 deps 字面量**，只给了
 *     draw/discard/heal/damage/gainCard/log/banner/delay/skillsOn/requestChoice，
 *     没传 takeFromDiscard 与 loseHp。而「结束阶段」在产品代码里只从这一处派发
 *     （dispatchTurnEnd 在 src/ 与 App.tsx 中唯一的非测试调用点）。于是 dispatch.ts:161-162 会把这两个能力
 *     替换成空桩：ctx.takeFromDiscard 恒返回 []、ctx.loseHp 是空 async——
 *     技能取不到牌、也失去不了体力，正是 combat.ts:238-245 记录的
 *     「有实现但永不触发」。修法是一行：把该字面量换成
 *     { ...buildSkillDeps(), turnOwner: endingPlayer }（改 App.tsx，在本文件边界外）。
 *     （对照：慧淑用到的两个派发点 App.tsx:3178 / 894 都走 buildSkillDeps()，
 *       所以它的 takeFromDiscard 是真的——见本文件的测试。）
 *
 *   全惠解「离宫」
 *     缺「失去技能 / 获得技能」入口（batch6new7.ts:112-130 已逐条写明）；
 *     且准备阶段派发点 App.tsx:2666 同样是手写字面量、没传 changeMaxHp，
 *     「加 1 点体力上限」也落不了地。三个子句里两个是主效果，整条退回。
 *
 * ── 慧淑：为什么用 drawPhaseBegin 的 replaced ──
 *
 * 原文（constants.ts:1161）：摸牌阶段结束时，你可以摸 2 张牌，然后随机弃置 1 张手牌。
 * 若如此做，当你本回合弃置牌的总数第一次大于 2 时，你从弃牌堆中随机获得一张锦囊牌。
 *
 * SkillHooks（registry.ts:148-211）里与摸牌阶段有关的只有 drawPhaseBonus（只能加数量）
 * 与 drawPhaseBegin，而后者在**摸牌之前**派发（App.tsx:3178 派发、3183 才 drawCards）。
 * 直接借它加数会变成「先随机弃 1 张、再摸 2 张」——弃置的牌池不含刚摸到的牌，
 * 这是可观察的结算差异，不是标注问题。
 *
 * 这里改用 drawPhaseBegin 的 replaced 语义（registry.ts:226-228「技能已自行完成效果，
 * 引擎跳过摸牌」；突袭 migrated_phase.ts:41 同一用法）把摸牌阶段整段接过来：
 *   ctx.draw(ev.count)  —— 摸牌阶段本身。ev.count 已含 drawPhaseBonus / 福绵的累加
 *                          （App.tsx:3135-3167），不是写死的 2。
 *   ctx.draw(慧淑的 X 张)
 *   随机弃置 1 张（弃置池 = 摸牌后的手牌）
 * 顺序与原文逐字一致，且返回 { replaced: true } 让引擎不再摸第二次。
 *
 * 「慧淑」的两个数字（下标 0 = 摸 X 张、下标 1 = 总数大于 Y）读的是易数写的那份
 * 武将共享存储 heroMemory.huishu（batch6new2.ts:42-54 的 sharedNums、:89 读同一 key，
 * 初始 [2,2]；batch6new2.ts:79 写明了下标含义）。写死 2 会让易数变成空转，
 * 所以这里必须读它——顺带也是离宫「有数字达到 5」将来唯一的判据来源。
 *
 * ── 三处取舍，记录而不是伪装 ──
 *
 * 1. 「随机获得弃牌堆中的一张 X 牌」：takeFromDiscard（App.tsx:948-959）按 pred
 *    从堆内**存储顺序**取第一张，技能侧既没有「先看再取」也没有「随机取」的口子
 *    （peekDiscard 不存在）。所以「随机」由「发起者不能挑」承担，但抽中的其实是最早
 *    入堆的那张，不是均匀随机。要严格随机需要给 ctx 加一个随机取的原语。
 * 2. 「本回合弃置牌的总数」只累加 cause === 'discard' 的失去牌事件（使用/打出、
 *    被获得、移出装备区都不算），且只在自己的回合内累加；触发点放在 afterCardLost
 *    ——这是唯一能观测到「弃置」的地方（App.tsx:2331 弃置统一上报）。
 * 3. 「若如此做」= 必须真的发动过慧淑（摸 X 张 + 弃 1 张）才谈得上后面的收益，
 *    用 memory.active 记；复位点是 onTurnStart——它对**任意角色**的回合开始都会派发，
 *    是「新回合」的唯一可靠信号（与俐影 / 集众同一做法，不能拿 turnOwner 当 key）。
 *
 * 「你本回合弃置牌的总数第一次大于 Y」的判定：每来一次弃置事件就累计，
 * 累计值第一次跨过 Y 的那一次结算收益；此后本回合不再结算（memory.fired）。
 * 跨过阈值时若弃牌堆里没有锦囊牌，收益落空但**不再补结算**（阈值关口只过一次），
 * 战报如实写明。
 */

/** 「慧淑」数字在武将共享存储里的 key（与易数读写的是同一份） */
const NUMS_KEY = 'huishu';
/** 下标 0 = 摸牌数、下标 1 = 弃置总数阈值（batch6new2.ts:79 的约定） */
const INIT_NUMS = [2, 2];

/**
 * 取（并在首次调用时初始化）「慧淑」的数字。
 *
 * 与 batch6new2.ts:42-54 的 sharedNums 是同一份契约：同一个 key、同一个默认值、
 * 返回的是**存储里的那个数组本身**（易数就地改它，这里读到的必须是同一份）。
 * 那边没有导出，所以这里只重写这三行，不做加法运算。
 */
const huishuNums = (ctx: SkillContext): number[] => {
  const cur = ctx.heroMemory[NUMS_KEY];
  if (Array.isArray(cur) && cur.length === INIT_NUMS.length
    && cur.every(n => typeof n === 'number')) return cur as number[];
  const fresh = [...INIT_NUMS];
  ctx.heroMemory[NUMS_KEY] = fresh;
  return fresh;
};

/** 锦囊牌。原文说「一张锦囊牌」而非「普通锦囊牌」，所以延时锦囊（乐/兵/闪电）也算 */
const isTrick = (c: Card): boolean => c.type === CardType.SCROLL;

/** 按 id 去重（手牌快照 + 本次摸到的牌可能重叠） */
const dedupe = (cards: Card[]): Card[] => {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
};

/** 随机弃置：均匀选一张（原文就是「随机弃置」，不询问玩家） */
const randomOf = (cards: Card[]): Card => cards[Math.min(cards.length - 1, Math.floor(Math.random() * cards.length))];

registerSkill({
  hero: '全惠解',
  skill: '慧淑',
  hooks: {
    // 新回合（任意角色）→ 计数与「本回合是否发动过」一起复位
    onTurnStart: (ctx: SkillContext) => {
      delete ctx.memory.active;
      delete ctx.memory.fired;
      ctx.memory.disposed = 0;
    },

    drawPhaseBegin: async (ctx: SkillContext, ev: DrawPhaseEvent): Promise<DrawPhaseResult | null> => {
      const nums = huishuNums(ctx);
      const extra = Math.max(0, nums[0]);
      const threshold = nums[1];

      const picked = await ctx.requestChoice({
        title: '慧淑：是否摸 ' + extra + ' 张牌，然后随机弃置 1 张手牌？',
        hint: '若如此做，本回合你弃置牌的总数第一次大于 ' + threshold
          + ' 时，从弃牌堆随机获得一张锦囊牌',
        mode: 'choose',
        choices: [
          { id: 'yes', label: '发动（摸 ' + extra + ' 张后随机弃 1 张）' },
          { id: 'no', label: '不发动' },
        ],
        cancelLabel: '不发动',
      });
      // 「你可以」：玩家放弃 / 超时取消 → 不接管摸牌阶段，交回引擎正常摸牌
      if (picked && picked.kind === 'cancel') return null;
      if (picked && picked.kind === 'choose' && picked.id === 'no') return null;

      // replaced 已经吃掉引擎的那次 drawCards（App.tsx:3182），所以摸牌阶段本身
      // 必须由这里补上，否则整回合少摸 ev.count 张。
      const base = ctx.draw(ctx.self.id, ev.count);
      const extraCards = ctx.draw(ctx.self.id, extra);
      ctx.memory.active = true;

      // 弃置池 = 摸牌后的手牌。ctx.self 是派发时抓的快照，而 drawCards 会换新对象
      // （App.tsx:1518-1530），所以用「快照 + 本次摸到的牌」拼出真实手牌。
      const pool = dedupe([...ctx.self.hand, ...base, ...extraCards]);
      if (pool.length) {
        const drop = randomOf(pool);
        ctx.discard(ctx.self.id, [drop]);
        ctx.log('【慧淑】' + ctx.self.hero.name + ' 摸 ' + (base.length + extraCards.length)
          + ' 张牌（摸牌阶段 ' + base.length + ' + 慧淑 ' + extraCards.length
          + '），随机弃置【' + drop.name + '】');
      } else {
        // 牌堆见底又无手牌：摸到空手，没有可弃置的牌。如实写进战报，不假装弃了。
        ctx.log('【慧淑】' + ctx.self.hero.name + ' 摸 ' + (base.length + extraCards.length)
          + ' 张牌，但手牌为空，无可弃置的牌');
      }
      ctx.banner();
      return { replaced: true, count: 0 };
    },

    afterCardLost: async (ctx: SkillContext, ev: CardLostEvent) => {
      // dispatchCardLost 已按「失去牌者」过滤（dispatch.ts:376-385），这里再守一道
      if (ev.player.id !== ctx.self.id) return;
      // 「弃置牌」：使用 / 打出、被获得、移出装备区都不算
      if (ev.cause !== 'discard') return;
      // 「本回合」：只有自己的回合里的弃置才计入
      if (!ctx.turnOwner || ctx.turnOwner.id !== ctx.self.id) return;

      const disposed = Number(ctx.memory.disposed ?? 0) + ev.cards.length;
      ctx.memory.disposed = disposed;
      // 「若如此做」：没发动过慧淑就没有后面的收益
      if (!ctx.memory.active || ctx.memory.fired) return;

      const threshold = huishuNums(ctx)[1];
      if (!(disposed > threshold)) return;
      // 「第一次」大于阈值：关口只过一次，之后本回合不再结算
      ctx.memory.fired = true;

      const got = ctx.takeFromDiscard(isTrick, 1);
      if (!got.length) {
        ctx.log('【慧淑】本回合弃置牌的总数第一次大于 ' + threshold + '（' + disposed
          + '），但弃牌堆里没有锦囊牌，本次不获得');
        return;
      }
      ctx.gainCard(ctx.self.id, ctx.self.id, got[0]);
      ctx.log('【慧淑】本回合弃置牌的总数第一次大于 ' + threshold + '（' + disposed
        + '），' + ctx.self.hero.name + ' 从弃牌堆获得【' + got[0].name + '】');
      ctx.banner();
    },
  },
});
