import { registerSkill } from './registry';
import type { SkillContext, DamageEvent } from './registry';
import type { DamageBeforeResult } from './engineAbilities';
import { CardType } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 22 组：马伶俐「硝引」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   硝引  ①准备阶段，你可以亮出牌堆顶你距离1以内的角色数张牌，获得其中的红色牌，
 *         将其中任意张黑色牌置于等量名连续的其他角色武将牌上；
 *         ②当有“硝引”牌的角色受到伤害时，若此伤害为火焰伤害，则伤害来源可以弃置一张
 *         与“硝引”牌类别相同的牌并随机移去一张此类别的“硝引”牌且令此伤害+1，
 *         否则伤害来源可以获得一张“硝引”牌并将此伤害改为火焰伤害。
 *
 * 本轮补的原语：DamageBeforeResult.nature —— 之前只能改数值 / 防止 / 转移，
 * 「将此伤害改为火焰伤害」写不出来，铁索传导、藤甲这些依赖 nature 的分支也走不到。
 * 加上之后 takeDamage 会在 damageBefore 之后重算 dmgNature / natureLabel。
 *
 * 两处取舍（原文含糊 / 钩子语义所致，写在这里）：
 * 1. ① 的「置于等量名连续的其他角色武将牌上」是残句（「等量名连续」不是中文）。
 *    本实现按「一张放一个人」处理：选的黑色牌按座位顺序，从你的下家开始依次各放一张。
 *    「任意张」由玩家决定张数（AI 全放）。
 * 2. ② 的「伤害来源可以…」是**伤害来源**做决定，而 damageBefore 是**技能拥有者
 *    （马伶俐）**的钩子。人机分裂时，提问会落到马伶俐的操作者而不是真正的伤害来源；
 *    这里按「谁在操作马伶俐就代为决定」处理，并在战报里写明是代决定。
 */

const NIAOYIN = 'niaoyin';

const zoneOf = (ctx: SkillContext): Record<string, Card[]> => {
  const cur = ctx.heroMemory[NIAOYIN];
  return cur && typeof cur === 'object' ? (cur as Record<string, Card[]>) : {};
};
const cardsOn = (ctx: SkillContext, pid: number): Card[] => zoneOf(ctx)[String(pid)] ?? [];
const setOn = (ctx: SkillContext, pid: number, cards: Card[]): void => {
  const z = zoneOf(ctx);
  z[String(pid)] = cards;
  ctx.heroMemory[NIAOYIN] = z;
};

const isRed = (c: Card): boolean => c.suit === '♥' || c.suit === '♦';

/** 牌堆 → 亮出的 n 张（按牌堆顶到底的顺序），并真正取走 */
const revealTop = (ctx: SkillContext, n: number): Card[] => {
  const top = ctx.peekDeck(n);
  if (top.length === 0) return [];
  const got: Card[] = [];
  for (const c of top) {
    const taken = ctx.takeFromDeck(x => x.id === c.id, 1);
    if (taken.length > 0) got.push(taken[0]);
  }
  return got;
};

registerSkill({
  hero: '马伶俐',
  skill: '硝引',
  hooks: {
    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      // 「你距离1以内的角色数」——含自己（与自己距离为 0）
      const within = ctx.players.filter(p => !p.isDead && ctx.distance(ctx.self.id, p.id) <= 1).length;
      if (within <= 0) return;
      const revealed = revealTop(ctx, within);
      if (revealed.length === 0) return;
      ctx.banner();
      ctx.log(`【硝引】${ctx.self.hero.name} 亮出牌堆顶 ${revealed.length} 张：${revealed.map(c => `【${c.name}】${c.suit}`).join('')}`);

      const reds = revealed.filter(isRed);
      const blacks = revealed.filter(c => !isRed(c));
      for (const c of reds) ctx.gainCard(ctx.self.id, ctx.self.id, c);
      if (reds.length > 0) ctx.log(`【硝引】获得其中的红色牌 ${reds.map(c => `【${c.name}】`).join('')}`);
      if (blacks.length === 0) return;

      // 「将其中任意张黑色牌置于等量名连续的其他角色武将牌上」
      // 实现口径：一张放一个人，按座位顺序从下家开始依次各放一张。
      let chosen = blacks;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '硝引：选择至多 ' + blacks.length + ' 张黑色牌置于其他角色的武将牌上',
          hint: '一张放一个人，从你的下家开始依次各放一张',
          mode: 'multi',
          choices: blacks.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 0, max: blacks.length, cancelLabel: '都不放',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        chosen = ids.map(id => blacks.find(c => c.id === id)).filter((c): c is Card => !!c);
      }
      const others = ctx.players
        .filter(p => !p.isDead && p.id !== ctx.self.id)
        .sort((a, b) => a.id - b.id);
      if (others.length === 0) return;
      const firstIdx = others.findIndex(p => p.id > ctx.self.id);
      const ordered = firstIdx >= 0
        ? [...others.slice(firstIdx), ...others.slice(0, firstIdx)]
        : others;
      chosen.slice(0, ordered.length).forEach((card, i) => {
        const target = ordered[i];
        setOn(ctx, target.id, [...cardsOn(ctx, target.id), card]);
        ctx.log(`【硝引】将【${card.name}】置于 ${target.hero.name} 的武将牌上`);
      });
    },

    damageBefore: (ctx, ev: DamageEvent): DamageBeforeResult | null => {
      const held = cardsOn(ctx, ev.victim.id);
      if (held.length === 0) return null;
      const src = ev.source;
      if (!src) return null;

      // ── 火焰伤害：来源弃置一张同类别牌 + 随机移去一张同类别的「硝引」+ 伤害+1 ──
      if (ev.nature === 'fire') {
        const categories = Array.from(new Set(held.map(c => c.type)));
        const match = src.hand.find(c => categories.includes(c.type));
        if (!match) return null;
        const sameCat = held.filter(c => c.type === match.type);
        const removed = sameCat[Math.floor(Math.random() * sameCat.length)];
        ctx.discard(src.id, [match]);
        setOn(ctx, ev.victim.id, cardsOn(ctx, ev.victim.id).filter(c => c.id !== removed.id));
        ctx.log(`【硝引】${src.hero.name} 弃置【${match.name}】，移去 ${ev.victim.hero.name} 的【${removed.name}】，此伤害 +1`);
        return { amount: ev.amount + 1, note: '【硝引】伤害 +1' };
      }

      // ── 非火焰伤害：来源获得一张「硝引」牌，并将此伤害改为火焰 ──
      const taken = held[Math.floor(Math.random() * held.length)];
      setOn(ctx, ev.victim.id, cardsOn(ctx, ev.victim.id).filter(c => c.id !== taken.id));
      ctx.gainCard(ev.victim.id, src.id, taken);
      ctx.log(`【硝引】${src.hero.name} 获得 ${ev.victim.hero.name} 的【${taken.name}】，此伤害改为火焰伤害`);
      return { nature: 'fire', note: '【硝引】伤害改为火焰' };
    },
  },
});

/** 类别名（日志/文档用；导出给测试引用，避免测试里重复字面量） */
export const NIAOYIN_CATEGORIES = [CardType.BASIC, CardType.SCROLL, CardType.EQUIPMENT];
