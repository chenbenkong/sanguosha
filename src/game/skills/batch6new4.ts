import { registerSkill } from './registry';
import type { SkillContext, CardLostEvent } from './registry';
import type { Card } from '../../../types';

/**
 * 第六批女将 · 第 4 组：用刚补齐的牌堆原语实装的那一个。
 *
 * 本组按任务书分了 6 个技能，**实际只有 1 个能用现有能力忠实落地**：
 *
 *   已实装：
 *     芮姬「妄缘」  afterCardLost + deckTo + ctx.memory
 *
 *   hand_back（条目保留在 skillCoverage.test.ts 的 LEGACY_INLINE）：
 *     卢弈「邀弈」  onTargetsChosen 只有**类型声明**，没有派发器：
 *                   dispatch.ts 里没有 skillHook('onTargetsChosen')，
 *                   DispatchDeps.applyTargets 也从未被 App.tsx / combat.ts
 *                   提供或调用（全仓 grep 只命中它的声明本身）。
 *                   注册进来就是「有实现但永不触发」的死代码 ——
 *                   正是 hookCoverage / wiring 两个守卫要防的那类缺陷。
 *                   需要：dispatchTargets(deps, ev) + combat.ts 用牌流程里的调用点。
 *     张怀「劳燕」  同一钩子、同一缺口，同上。
 *     王荣「追德」  两处缺口（都实测过，见下）：
 *                   ① dispatch.ts 的 ownersOf 过滤 !p.isDead，
 *                      「当你死亡时」的 afterDeath **永远派发不到死者本人**
 *                      （探针实测：阵亡者注册的 afterDeath 一次都没跑）。
 *                   ② deckTo 只能取牌堆**顶**的 count 张、peekDeck 只读，
 *                      「杀/闪/桃/酒各一张」无法精确取到，只能盲取顶部牌。
 *                   需要：ownersOf 对 afterDeath 放开 isDead；
 *                   以及 takeFromDeck(pred, count) 这类按牌名取牌的原语。
 *     马伶俐「花火」  SkillContext 没有「使用一张牌」的入口（无 useCardAs）。
 *     芮姬「俐影」  没有「获得牌后」钩子（afterCardLost 是失去牌者视角）。
 */

/** 「妄」区上限 = 游戏人数（按原文「总数至多为游戏人数」） */
const wishCap = (ctx: SkillContext): number => ctx.players.length;

/** 读出（并在首次调用时初始化）「妄」区 */
const wishOf = (ctx: SkillContext): Card[] => {
  // 「妄」是**武将牌上**的牌，属于这个武将而不是某一个技能 ——
  // 用 heroMemory 而不是 memory：芮姬的「铃音」要读同一份「妄」，
  // 写在 memory 里的话它只能读到一份空数组（欣缘记的、铃音看不见）。
  const cur = ctx.heroMemory.wish;
  if (Array.isArray(cur)) return cur as Card[];
  const fresh: Card[] = [];
  ctx.heroMemory.wish = fresh;
  return fresh;
};

// ── 芮姬「妄缘」──────────────────────────────────────────
// 当你于回合外失去牌后，你可以随机将牌堆中一张牌置于你的武将牌上，称为「妄」
// （限非装备牌、不会与已有「妄」同名，总数至多为游戏人数）。
//
// 钩子用 afterCardLost：dispatch.ts 已经把它限定成「失去牌者本人」的钩子
// （self.id === ev.player.id），所以「自己失去牌」不必再判一次身份。
//
// 牌从哪里来：唯一能「把牌堆里的牌移出牌堆」的原语是 deckTo。
// 用 deckTo(1, 'discard') 而不是 'hand'，原因是**可组合性**：
// deckTo('hand') 走 mutationHand → setPlayers，会把 playersRef 里的角色对象换成
// 新的一个；此后技能再改 ctx.self（旧对象）就再也提交不回去，
// 结果就是「牌凭空进了手牌、而『妄』没记上」——比不做还糟。
// deckTo('discard') 只改牌堆与弃牌堆两处真实状态，不存在这个悬空写入。
//
// 「置于武将牌上」目前落在 ctx.heroMemory.wish 里（任务书给的口径）：
// Player.placedCards 确实是这条区域的既有字段（周妃「箜声」/曹宪「灵犀」在用），
// 但技能侧没有「牌堆→自定义区域」的直达原语，把牌从手牌挪进 placedCards
// 需要先 deckTo('hand')，正好撞上上面那个悬空写入问题。
// 代价写清楚：这张牌此刻**物理上在弃牌堆里**，只在 memory 里被记为「妄」。
// 因此它可能被洗回牌堆再被摸到，与「妄」记录重复计数。
// 「铃音」（能把「妄」拿走）尚未实装，等 takeFromDeck + 一个真正的
// 「移到武将牌上」原语补齐后，这里应改为写 placedCards。
//
// 两处如实裁剪：
//  1. 「你可以」不弹窗、自动发动 —— 与「娴静」「易数」同一口径：
//     置「妄」对玩家是纯收益，每次失去牌都弹一次窗只会打断节奏。
//  2. 「随机」用牌堆顶代替：牌堆对技能只有「顶」这一端可见（peekDeck/deckTo），
//     顶部牌对玩家未知，等价于随机；不额外洗牌，避免为一个随机数改动全局牌序。
//  3. 「限非装备牌 / 不与已有妄同名」做不到：要看第 j 张就得把上面 j 张一起取走
//     （那会把它们流放进弃牌堆）。两条过滤条件留空，等 takeFromDeck(pred, count)。
registerSkill({
  hero: '芮姬',
  skill: '妄缘',
  hooks: {
    afterCardLost: (ctx: SkillContext, ev: CardLostEvent) => {
      void ev;
      // 回合外：自己回合内失去牌不触发（原文「于回合外失去牌后」）
      if (ctx.turnOwner?.id === ctx.self.id) return;
      const wish = wishOf(ctx);
      // 已达上限（游戏人数）时不再置牌
      if (wish.length >= wishCap(ctx)) return;
      // 从牌堆顶取一张：牌堆为空时 deckTo 返回空数组，自然不发动
      const taken = ctx.deckTo(1, 'discard');
      if (!taken.length) return;
      wish.push(taken[0]);
      ctx.heroMemory.wish = wish;
      ctx.log(
        '【妄缘】' + ctx.self.hero.name + ' 于回合外失去牌，将牌堆一张牌置于武将牌上，称为「妄」（共 '
        + wish.length + ' 张）',
      );
      ctx.banner();
    },
  },
});
