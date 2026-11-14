import { registerSkill } from './registry';
import type { SkillContext } from './registry';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 21 组：滕芳兰「落宠」「哀尘」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   落宠   每轮开始时，你可以重复此流程：弃置一名角色区域内的任意张牌
 *          （至多以此法弃置四张牌）。若你此次共计弃置了一名角色区域内的至少三张牌，
 *          此技能弃置牌的上限数-1。
 *   哀尘   锁定技，若牌堆中的牌数：大于80，当你每次发动“落宠”第一次弃置自己区域内的牌后，
 *          你摸两张牌；大于40，你跳过弃牌阶段；小于40，当你成为♠️牌的目标后，你不能响应此牌。
 *
 * 本轮补的原语（见 git log）：ctx.readArea(playerId, 'hand' | 'equip' | 'judge')、
 * ctx.discardFromArea(playerId, cards)、ctx.deckCount。
 * 「区域」是这三块的和，原先 ctx.discard 只动 hand —— 落宠有一半的牌是拿不到的。
 *
 * 缺口（写在文件头）：哀尘第三句「你不能响应此牌」需要一个「本张牌的受害者不能响应」
 * 的原语（现在的 noResponse 是**使用者**视角，只能让响应链整体跳过），没有它就不能忠实实现。
 * 哀尘第一句的触发点在落宠的流程里，所以那一句写在落宠里（效果一样，位置不同）。
 */

const LUOCHONG_CAP = 'luochongCap';

const alivePlayers = (ctx: SkillContext): Player[] => ctx.players.filter(p => !p.isDead);

/** 某角色三个区域加起来的牌 */
const areaOf = (ctx: SkillContext, pid: number): Card[] => [
  ...ctx.readArea(pid, 'hand'),
  ...ctx.readArea(pid, 'equip'),
  ...ctx.readArea(pid, 'judge'),
];

const cardsOf = (p: Player): number =>
  p.hand.length + (p.equipment ? Object.values(p.equipment).filter(Boolean).length : 0) + (p.judgeZone?.length ?? 0);

// ── 滕芳兰「落宠」 ────────────────────────────────────
registerSkill({
  hero: '滕芳兰',
  skill: '落宠',
  hooks: {
    onRoundStart: async (ctx) => {
      const cap = (ctx.heroMemory[LUOCHONG_CAP] as number | undefined) ?? 4;
      if (cap <= 0) return;
      let budget = cap;
      let total = 0;
      const perPlayer: Record<number, number> = {};
      let first = true;
      ctx.banner();

      while (budget > 0) {
        const candidates = alivePlayers(ctx).filter(p => cardsOf(p) > 0);
        if (candidates.length === 0) break;

        let targetId: number | undefined;
        if (ctx.self.isHuman) {
          const tr = await ctx.requestChoice({
            title: `落宠：弃置一名角色区域内的牌（本轮还剩 ${budget} 张）`,
            mode: 'target',
            targets: candidates
              .sort((a, b) => cardsOf(b) - cardsOf(a))
              .map(p => ({ id: p.id, name: p.hero.name, sub: `区域共 ${cardsOf(p)} 张` })),
            min: 1, max: 1,
            cancelLabel: first ? '不发动' : '结束流程',
          });
          if (!tr || tr.kind === 'cancel' || tr.kind === 'timeout') break;
          const cand = tr.kind === 'target' ? tr.ids?.[0] : undefined;
          targetId = typeof cand === 'number' ? cand : undefined;
        } else {
          // AI：挑区域牌最多的那个
          targetId = [...candidates].sort((a, b) => cardsOf(b) - cardsOf(a) || a.id - b.id)[0].id;
        }
        if (targetId === undefined) break;

        const pool = areaOf(ctx, targetId);
        if (pool.length === 0) break;
        let picks: Card[];
        if (ctx.self.isHuman) {
          const r = await ctx.requestChoice({
            title: `落宠：选择至多 ${Math.min(budget, pool.length)} 张`,
            mode: 'multi',
            choices: pool.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
            min: 0, max: Math.min(budget, pool.length),
            cancelLabel: '结束流程',
          });
          const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
          picks = ids.map(id => pool.find(c => c.id === id)).filter((c): c is Card => !!c);
          if (picks.length === 0) break;
        } else {
          picks = pool.slice(0, Math.min(budget, pool.length));
        }

        const n = ctx.discardFromArea(targetId, picks);
        if (n === 0) break;
        total += n;
        budget -= n;
        perPlayer[targetId] = (perPlayer[targetId] ?? 0) + n;
        const t = ctx.players.find(p => p.id === targetId);
        ctx.log(`【落宠】${ctx.self.hero.name} 弃置 ${t?.hero.name ?? '?'} 区域内的 ${n} 张牌（本轮累计 ${total}）`);

        // 「哀尘」第一句：牌堆大于 80 时，本次发动第一次弃置自己区域内的牌后摸两张
        if (first && ctx.deckCount > 80 && targetId === ctx.self.id) {
          ctx.log('【哀尘】牌堆大于 80，第一次弃置自己区域内的牌后摸两张');
          ctx.draw(ctx.self.id, 2);
        }
        first = false;
      }

      if (total === 0) return;
      // 「若你此次共计弃置了一名角色区域内的至少三张牌，此技能弃置牌的上限数-1」
      const hit = Object.values(perPlayer).some(v => v >= 3);
      if (hit) {
        const next = Math.max(1, cap - 1);
        ctx.heroMemory[LUOCHONG_CAP] = next;
        ctx.log(`【落宠】单名角色被弃置至少 3 张，本轮之后的上限数降为 ${next}`);
      }
    },
  },
});

// ── 滕芳兰「哀尘」 ────────────────────────────────────
registerSkill({
  hero: '滕芳兰',
  skill: '哀尘',
  locked: true,
  hooks: {
    // 第二句：牌堆大于 40 → 跳过弃牌阶段
    discardPhaseSkip: (ctx) => (ctx.deckCount > 40 ? { skip: true, reason: '【哀尘】牌堆大于 40，跳过弃牌阶段' } : null),
    // 第一句在「落宠」的流程里（触发点在那里）；
    // 第三句「你不能响应此牌」缺「受害者不能响应」原语，见文件头。
  },
});
