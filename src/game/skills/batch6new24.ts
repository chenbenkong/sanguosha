import { registerSkill } from './registry';
import type { SkillContext, PlayPhaseEvent } from './registry';
import { CardName } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 24 组：赵嫣「锦绘」。
 *
 * 原文（constants.ts:1245 的 skillDesc —— **lore.json 里这一条是被截断的**，
 * 以 constants.ts 为准）：
 *   出牌阶段限一次，你可以随机亮出牌堆中三张牌名不同且目标数默认或可选择为1的
 *   非伤害牌，将这些牌置于你的武将牌上直到此技能发动结束。你选择一名其他角色，
 *   其使用其中一张，然后你可以使用其余两张牌中的任意张
 *   （因此使用的牌无距离与次数限制；除非默认目标为自己，否则需指定对方为目标）。
 *
 * 「目标数默认或可选择为 1 的非伤害牌」= 下面这张白名单。它不是猜的：
 *   · 伤害牌（杀 / 决斗 / 火攻 / 南蛮 / 万箭 / 借刀）一律排除；
 *   · 目标数为「所有角色」的（桃园 / 五谷）排除；
 *   · 无懈可击是响应牌，出牌阶段用不出去，排除；
 *   · 装备牌目标数为 0，排除。
 * 牌面元数据（目标数 / 是否伤害牌）引擎没有公开表，所以这里用白名单表达；
 * 新增卡牌若符合条件需要同步加进来（这是数据决定，不是实现取舍）。
 *
 * 一处已知缺口：「次数限制」这一半（「无距离与次数限制」）无法表达 ——
 * 【杀】次数记在 App.tsx 的 slashUsageRef 里，ctx 没有入口。与黄舞蝶「☆ 狩星」
 * 同一个缺口。
 */

/** 默认目标为自己，使用时不需要另外指定目标 */
const SELF_TARGET = new Set<string>([CardName.TAO, CardName.JIU, CardName.WUZHONG, CardName.SHANDIAN]);
/** 需要指定另一名角色为目标 */
const NEEDS_TARGET = new Set<string>([
  CardName.GUOHE, CardName.SHUNSHOU, CardName.LESI, CardName.BINGLIANG, CardName.TIESUO,
]);
/** 目标数默认或可选择为 1 的非伤害牌（锦绘的全部候选） */
const CANDIDATES = new Set<string>([...SELF_TARGET, ...NEEDS_TARGET]);

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

/** 让某个角色「使用」放在武将牌上的那张牌（它不在任何人手里，所以不涉及手牌移动） */
const useFromHero = async (ctx: SkillContext, card: Card, userId: number): Promise<void> => {
  let targets: number[] = [];
  if (NEEDS_TARGET.has(card.name)) {
    const pool = ctx.players.filter(p => !p.isDead && p.id !== userId);
    const tid = await pickOne(ctx, pool, `锦绘：${card.name} 的目标`);
    if (tid === undefined) return;
    targets = [tid];
  }
  ctx.log(`【锦绘】${ctx.players.find(p => p.id === userId)?.hero.name ?? '?'} 使用【${card.name}】`);
  await ctx.useCardAs(card, targets, {
    asPlayerId: userId,
    ignoreDistance: true,
    reason: '锦绘',
  });
};

registerSkill({
  hero: '赵嫣',
  skill: '锦绘',
  hooks: {
    onTurnEnd: (ctx) => { ctx.memory.usedThisTurn = false; },
    onPlayPhaseBegin: async (ctx, ev: PlayPhaseEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const others = aliveOthers(ctx);
      if (others.length === 0) return;

      // 「随机亮出牌堆中三张牌名不同…的牌」：先在牌堆里按名字去重地筛，再随机取三张。
      // 这里必须能把牌堆看全（官方也是从整个牌堆里随机亮），所以用 peekDeck 的大窗口，
      // 但只会把抽中的三张写进战报 —— 不泄露其余牌序。
      const deck = ctx.peekDeck(999);
      if (deck.length === 0) return;
      const byName = new Map<string, Card[]>();
      for (const c of deck) {
        if (!CANDIDATES.has(c.name)) continue;
        const arr = byName.get(c.name) ?? [];
        arr.push(c);
        byName.set(c.name, arr);
      }
      if (byName.size === 0) return;
      const names = [...byName.keys()].sort(() => Math.random() - 0.5).slice(0, 3);
      if (names.length === 0) return;
      const onHero: Card[] = [];
      for (const n of names) {
        const pool = byName.get(n)!;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const taken = ctx.takeFromDeck(c => c.id === pick.id, 1);
        if (taken.length > 0) onHero.push(taken[0]);
      }
      if (onHero.length === 0) return;

      ctx.memory.usedThisTurn = true;
      ctx.banner();
      ctx.log(`【锦绘】${ctx.self.hero.name} 亮出牌堆中的 ${onHero.map(c => `【${c.name}】`).join('')}，置于武将牌上`);

      // 「你选择一名其他角色，其使用其中一张」
      const userId = await pickOne(ctx, others, '锦绘：选择一名其他角色，其使用其中一张牌');
      if (userId === undefined) return;
      const user = ctx.players.find(p => p.id === userId);
      if (!user) return;
      let forThem: Card;
      if (ctx.self.isHuman && onHero.length > 1) {
        const r = await ctx.requestChoice({
          title: `锦绘：让 ${user.hero.name} 使用其中哪一张`,
          mode: 'choose',
          choices: onHero.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 1, max: 1,
        });
        const cid = r && (r.kind === 'choose' || r.kind === 'card') ? (r.id ?? r.ids?.[0]) : undefined;
        forThem = onHero.find(c => c.id === cid) ?? onHero[0];
      } else {
        forThem = onHero[0];
      }
      await useFromHero(ctx, forThem, userId);

      // 「然后你可以使用其余两张牌中的任意张」
      const rest = onHero.filter(c => c.id !== forThem.id);
      if (rest.length === 0) return;
      let mine = rest;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '锦绘：使用其余牌中的任意张',
          mode: 'multi',
          choices: rest.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 0, max: rest.length, cancelLabel: '都不使用',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        mine = ids.map(id => rest.find(c => c.id === id)).filter((c): c is Card => !!c);
      }
      for (const card of mine) {
        await useFromHero(ctx, card, ctx.self.id);
      }
    },
  },
});
