import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';
import { seatDistance } from '../rules.ts';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 12 组：**引擎能力本轮补齐后**回填的技能。
 *
 * 本轮新接通的能力（git log：takeFromDiscard / loseHp / skillDeps 统一）：
 *   · ctx.takeFromDiscard —— 从弃牌堆取牌（与牌堆是两份状态）
 *   · ctx.loseHp —— 体力流失语义（不派发伤害事件，到 0 走濒死）
 *   · peekDeck / deckTo / takeFromDeck / changeMaxHp —— 6 处调用点统一走 combat.ts 的
 *     skillDeps()，不再有「App 侧接了、伤害/濒死路径上是空桩」的漂移
 *   · 跨角色标记 addMark(name, count, toPlayerId) / markCount(name, ofPlayerId)
 *   · 18 个钩子（含 afterDeath / onDying / onTargetsChosen / afterCardGain）
 *
 * 已实装 1 条：
 *   曹金玉「隅泣」  afterDamage + peekDeck + takeFromDeck + gainCard
 *                   + heroMemory.yuqi（与「娴静」「善身」同一份数组）
 *                   + 距离用 rules.ts 的 seatDistance
 *
 * 未实装 3 条（**不写降级版本**）。它们缺的是同一件事：**ctx 没有「使用一张牌」的
 * 入口**——SkillContext（registry.ts:17-116）只有 draw / discard / heal / damage /
 * gainCard / 牌堆原语 / 标记；引擎里能真正用牌的两条通路（CombatDeps.playCard 与
 * CombatEngine.resolveCardEffect）都只存在于 combat.ts 内部，没有暴露给技能。
 * 硬写只能跳过目标合法性、响应（【闪】/【无懈】）与次数结算，属于明确的降级，
 * 所以整条退回（与「花火」同一缺口，batch6new5.ts:17）：
 *
 *   柏灵筠「灵慧」  原文（constants.ts:1173）：「一名角色的结束阶段，若该角色为你或
 *                   本回合有角色进入过濒死状态，你可以观看牌堆顶的三张牌，然后你可以
 *                   使用其中一张并随机获得其余牌的其中一张。」
 *                   — 牌堆顶可见性本轮已解决（onTurnEnd 派发点 App.tsx:4062 走的就是
 *                   App.tsx:931 的 buildSkillDeps，peekDeck/deckTo 一直都在），
 *                   但「使用其中一张」是收益主体，没有入口。
 *                   需要补：ctx 的用牌入口（含目标合法性 / 响应 / 无懈 / 次数 / 距离），
 *                   并在 App.tsx 的 buildSkillDeps 里接上。
 *
 *   赵嫣「锦绘」    原文（constants.ts:1245）：「出牌阶段限一次，你可以随机亮出牌堆中
 *                   三张牌名不同且目标数默认或可选择为 1 的非伤害牌，将这些牌置于你的
 *                   武将牌上直到此技能发动结束。你选择一名其他角色，其使用其中一张，
 *                   然后你可以使用其余两张牌中的任意张……」
 *                   — 「三张牌名不同」本轮可实现了（takeFromDeck(pred, count) 能按
 *                   牌名精确取，不必摸三张碰运气），但仍缺两件：a) 用牌入口（同上，
 *                   且这里要**指定目标**）；b) 牌面元数据——Card（types.ts）没有
 *                   「目标数」也没有「是否伤害牌」，这两件事是 combat.ts 按牌名分支
 *                   决定的，技能侧读不到。
 *                   需要补：a) 用牌入口（含指定目标）；b) 可查的牌定义表（目标数 /
 *                   是否伤害牌）。
 *
 *   黄舞蝶「双锐」  原文（constants.ts:1353）：「准备阶段，你可以视为对一名其他角色
 *                   使用一张无距离限制的【杀】。若其在你攻击范围外/攻击范围内，此
 *                   【杀】不可被响应/造成的伤害+1，你本回合获得技能"狩星"/"铩雪"。」
 *                   — 三件缺口：a)「视为使用一张【杀】」需要虚拟牌的用牌入口；
 *                   b)「获得技能」需要技能授予 / 失去入口（同吕玲绮「妆戎」的退回
 *                   理由，batch6new7.ts:120-129）；c)「不可被响应 / 伤害+1」需要能改写
 *                   这次用牌的结算参数。单是缺 a 就已经无法忠实结算（会跳过【闪】响应
 *                   与仁王盾 / 藤甲等防具），故整条退回。
 *                   需要补：a) 用牌入口（虚拟牌 + 无距离限制标记 + 响应开关 + 增伤）；
 *                   b) 技能授予 / 失去入口。
 *                   注：仓库里有一条**近似**先例（batch8.ts:551 王笙「遭谮」
 *                   「视为对一名角色使用【杀】（简化为直接 1 点伤害）」）。本文件按
 *                   「不降级」的要求不采用；是否接受近似属于数据层的决定。
 */

/**
 * 「隅泣」的两个数字，存在 heroMemory.yuqi 里（同武将共享）：
 *   [0] 每回合可发动次数，[1] 观看牌堆顶的张数；初始 [2, 3]，单项上限 5。
 *
 * 形状与初始值必须与「娴静」（batch6new2.ts:217 的 sharedNums）、「善身」
 * （batch6new3.ts:20-32 的 yuqiNums）**完全一致**——三个技能改的是同一组数字，
 * 各写一份必然漂移（一边写对象、一边写数组，后发动的那个把状态读废）。
 */
const YUQI_INIT = [2, 3];
const YUQI_CAP = 5;

const yuqiNums = (mem: Record<string, unknown>): number[] => {
  const cur = mem.yuqi;
  if (Array.isArray(cur) && cur.length === YUQI_INIT.length
      && cur.every((n) => typeof n === 'number')) {
    return cur as number[];
  }
  const fresh = [...YUQI_INIT];
  mem.yuqi = fresh;
  return fresh;
};

/**
 * 「你计算与其的距离不大于 0」的阈值（原文 constants.ts:1185）。
 *
 * rules.ts:59 的 seatDistance 把**不同角色之间**的最短距离夹在 1（它的注释与
 * legacyRules 测试都写明「最低距离 1」，与官方「角色间距离最小为 1」一致），
 * 所以这个条件只可能由**受伤者就是曹金玉自己**满足——自己到自己的距离是 0，
 * 而且是唯一天然为 0 的一对。若不特判，seatDistance(self, self) 同样返回 1，
 * 技能会注册了却永远静默不发动（正是 skillCoverage 要防的情况）。
 *
 * 待确认项（已上报）：原文的触发句是「当一名角色受到伤害后」，若这句与「不大于 0」
 * 结合时本意是「不大于 1」（相邻角色，也是「交给该角色」更自然的读法），
 * 把本常量改成 1 即可，文件其余部分不用动。
 */
const YUQI_MAX_DIST = 0;

/** 到自己的距离是 0；到别人用 rules.ts 的 seatDistance（App 的 getDistance 的真值） */
const distTo = (ctx: SkillContext, victim: Player): number =>
  victim.id === ctx.self.id ? 0 : seatDistance(ctx.players, ctx.self.id, victim.id);

// ── 曹金玉「隅泣」──────────────────────────────────────
// 每回合限两次，当一名角色受到伤害后，若你计算与其的距离不大于 0，
// 你可以观看牌堆顶的 3 张牌，将其中至多 1 张牌交给该角色，获得其中至多 1 张牌，
// 然后剩余的牌放回牌堆顶。
//
// 逐句落地：
//   · 「每回合限两次」= heroMemory.yuqi[0]（可被「娴静」「善身」提升），
//     用自己的 memory.usedThisTurn 记账，复位点是 onTurnStart（任意角色的回合开始
//     都分发，是「新回合」的唯一可靠信号，与「俐影」同一做法；不能用 turnOwner.id
//     当 key）。
//   · 「观看牌堆顶的 3 张」= heroMemory.yuqi[1]；peekDeck 返回的只是副本，
//     现场不改变牌堆。
//   · 「剩余的牌放回牌堆顶」天然成立：只用 takeFromDeck 按 id 精确取走选中的牌，
//     牌堆里剩下的仍是原来那几张，且相对顺序不变（takeFromDeck 从堆顶开始扫，
//     把未选中的按原序放回）。
//   · 「交给该角色」= gainCard(self → 受伤者)；「获得」= gainCard(self → self)。
//     同一张牌不可能既交出又获得：第二问的候选里已经剔除了第一问选中的牌。
//   · 「你可以」：人类玩家由 requestChoice 决定（cancel = 不发动）；
//     AI / 托管（返回 null）走自动分支——把牌堆顶那张交给受伤角色、自己拿下一张。
//     无策略时取确定值，与「集众」「俐影」的自动分支同口径（对局可复现）。
registerSkill({
  hero: '曹金玉',
  skill: '隅泣',
  hooks: {
    onTurnStart: (ctx: SkillContext) => { delete ctx.memory.usedThisTurn; },
    afterDamage: async (ctx: SkillContext, ev: DamageEvent) => {
      const nums = yuqiNums(ctx.heroMemory);
      const limit = nums[0];
      const viewCount = nums[1];
      const used = Number(ctx.memory.usedThisTurn ?? 0);
      if (used >= limit) return;
      if (distTo(ctx, ev.victim) > YUQI_MAX_DIST) return;

      const peeked = ctx.peekDeck(viewCount);
      // 牌堆为空（或未接线）：没有可观看的牌，技能不发动，也不占用本回合次数
      if (!peeked.length) return;
      const shown = peeked.map(c => '【' + c.name + '】' + c.suit).join('、');
      const given: Card[] = [];

      // 第一段：将其中至多 1 张交给受伤角色（min 0 = 可以不给）
      const giveRes = await ctx.requestChoice({
        title: '隅泣：观看牌堆顶 ' + peeked.length + ' 张，将其中至多 1 张交给 ' + ev.victim.hero.name,
        hint: '牌堆顶（自上而下）：' + shown,
        mode: 'multi',
        choices: peeked.map(c => ({
          id: c.id, label: '【' + c.name + '】' + c.suit, desc: '交给 ' + ev.victim.hero.name,
        })),
        min: 0,
        max: 1,
        cancelLabel: '不发动',
      });
      if (giveRes && giveRes.kind === 'cancel') return;
      const giveCard = giveRes && giveRes.kind === 'multi'
        ? peeked.find(c => (giveRes.ids ?? []).map(String).includes(c.id))
        : (giveRes ? undefined : peeked[0]);
      if (giveCard) {
        const got = ctx.takeFromDeck(c => c.id === giveCard.id, 1);
        if (got.length) {
          given.push(got[0]);
          ctx.gainCard(ctx.self.id, ev.victim.id, got[0]);
        }
      }

      // 第二段：获得其余牌中的至多 1 张（候选里没有已交出的那张）
      const rest = peeked.filter(c => !given.some(g => g.id === c.id));
      let kept: Card | undefined;
      if (rest.length) {
        const gainRes = await ctx.requestChoice({
          title: '隅泣：获得其余牌中的至多 1 张',
          hint: '其余：' + rest.map(c => '【' + c.name + '】' + c.suit).join('、'),
          mode: 'multi',
          choices: rest.map(c => ({ id: c.id, label: '【' + c.name + '】' + c.suit, desc: '自己获得' })),
          min: 0,
          max: 1,
          cancelLabel: '不获得',
        });
        // null = AI / 托管：牌堆顶那张；cancel = 玩家主动放弃获得
        kept = !gainRes ? rest[0]
          : gainRes.kind === 'multi'
            ? rest.find(c => (gainRes.ids ?? []).map(String).includes(c.id))
            : undefined;
        if (kept) {
          const got = ctx.takeFromDeck(c => c.id === kept!.id, 1);
          if (got.length) ctx.gainCard(ctx.self.id, ctx.self.id, got[0]);
        }
      }

      ctx.memory.usedThisTurn = used + 1;
      ctx.log('【隅泣】' + ev.victim.hero.name + ' 受到伤害，' + ctx.self.hero.name
        + ' 观看牌堆顶 ' + peeked.length + ' 张（' + shown + '）：交给 ' + ev.victim.hero.name
        + ' ' + (given.length ? '【' + given[0].name + '】' : '0 张')
        + '，自己获得 ' + (kept ? '【' + kept.name + '】' : '0 张')
        + '，其余放回牌堆顶（本回合第 ' + (used + 1) + '/' + limit + ' 次）');
      ctx.banner();
    },
  },
});
