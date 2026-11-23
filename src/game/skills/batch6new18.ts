import { registerSkill } from './registry';
import type { SkillContext, CardUsedEvent } from './registry';
import { CardName, CardType, Suit } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 18 组：宣公主「齐眉」、芮姬「铃音」、张楚「日彗」、马伶俐「花火」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   齐眉   出牌阶段限一次，你可以与一名其他角色各摸两张牌并与其同时展示两张手牌。
 *          若展示牌中包含的花色数为：1，你依次使用这些牌；2，你与其复原武将牌；
 *          3，你与其重铸这些牌；4，你与其各摸一张牌。
 *   铃音   出牌阶段开始时，你可以获得至多X张“妄”（X为游戏轮数）。若剩余的“妄”颜色均相同，
 *          你本回合：对其他角色造成的伤害+1、可以将武器牌或防具牌当【决斗】使用。
 *   日彗   每回合限一次，当你对其他角色使用仅指定唯一目标的黑色基本牌或普通锦囊牌
 *          结算结束后，若其没有“信众”标记，则你可以令所有拥有“信众”标记的角色依次
 *          视为对其使用此牌，否则你可以获得其区域内的一张牌。
 *   花火   出牌阶段限一次，你可以将一张红色手牌当无次数限制的火【杀】使用。
 *          若目标角色有“硝引”牌，你可以改为指定所有拥有“硝引”牌的角色为目标。
 *
 * 已知缺口（写在文件头，不在代码里含糊）：
 * · 「妄」区在 batch6new4.ts，本轮已从 per-skill memory 改成 heroMemory（铃音要读同一份）。
 * · 铃音「可以将武器牌或防具牌当【决斗】使用」**仍未实装**。
 *   原语其实已经有了（readArea / discardFromArea / useCardAs 都在），
 *   真正缺的是「转化牌」这条通路本身：装备牌当【决斗】要进的是人类的出牌
 *   交互（ActionBar 的转化候选）与 convertRules.ts 的判定表，不是技能钩子。
 *   上一轮我把这条记成「缺按区域弃牌原语」是判错了——补完原语后它依然不通，
 *   因为不通的地方在 UI/转化层。留作待办，不在这里硬凑一个只在 AI 侧生效的版本。
 * · 日彗「获得其区域内的一张牌」覆盖 手牌 / 装备区 / 判定区：
 *   先用 ctx.readArea 读出牌及其所在区域，再用 ctx.gainCard(..., zone) 纯移除并转移。
 * · 花火「改为指定所有拥有『硝引』牌的角色」**已补**：硝引（batch6new22）落地后，
 *   其牌区写在同武将共享的 heroMemory.niaoyin，花火直接读它筛出持有者。
 *   「无次数限制」那一半本轮已补：useCardAs 新增 ignoreSlashLimit，由 combat.ts 的
 *   【杀】分支消费 —— 语义是「这一次不递增计数」，不是「把用掉的一次还回来」。
 * · 齐眉分支 1「你依次使用这些牌」：用 ctx.useCardAs 逐张结算，目标走技能提问；
 *   「依次」的牌与牌之间的顺序按展示顺序。
 */

const XINZHONG = '信众';
const YAN = '妄';

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

// ── 宣公主「齐眉」 ────────────────────────────────────
registerSkill({
  hero: '宣公主',
  skill: '齐眉',
  hooks: {
    onTurnEnd: (ctx) => { ctx.memory.usedThisTurn = false; },
    onPlayPhaseBegin: async (ctx, ev) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const targetId = await pickOne(ctx, aliveOthers(ctx), '齐眉：与一名其他角色各摸两张牌并展示两张手牌');
      if (targetId === undefined) return;
      const other = ctx.players.find(p => p.id === targetId);
      if (!other) return;
      ctx.memory.usedThisTurn = true;
      ctx.banner();
      ctx.draw(ctx.self.id, 2);
      ctx.draw(targetId, 2);
      // 「与其同时展示两张手牌」：两人各展示两张
      const mine = ctx.self.hand.slice(0, 2);
      const theirs = other.hand.slice(0, 2);
      if (mine.length === 0 && theirs.length === 0) return;
      ctx.log(`【齐眉】${ctx.self.hero.name} 展示 ${mine.map(c => `【${c.name}】${c.suit}`).join('') || '（无）'}，${other.hero.name} 展示 ${theirs.map(c => `【${c.name}】${c.suit}`).join('') || '（无）'}`);
      const suits = new Set([...mine, ...theirs].map(c => c.suit));
      const n = suits.size;
      ctx.log(`【齐眉】展示牌中花色数为 ${n}`);
      if (n === 1) {
        // 分支 1：你依次使用这些牌（只使用你自己的那两张）
        for (const card of mine) {
          const needsTarget = card.name === CardName.SHA || card.name === CardName.JUEDOU
            || card.name === CardName.GUOHE || card.name === CardName.SHUNSHOU;
          let targets: number[] = [];
          if (needsTarget) {
            const tid = await pickOne(ctx, aliveOthers(ctx), `齐眉：使用【${card.name}】的目标`);
            if (tid === undefined) continue;
            targets = [tid];
          }
          ctx.discard(ctx.self.id, [card]);
          await ctx.useCardAs(card, targets, { ignoreDistance: true, reason: '齐眉' });
        }
      } else if (n === 2) {
        ctx.restoreGeneral(ctx.self.id);
        ctx.restoreGeneral(targetId);
        ctx.log(`【齐眉】${ctx.self.hero.name} 与 ${other.hero.name} 复原武将牌`);
      } else if (n === 3) {
        // 分支 3：重铸这些牌（弃置后各摸一张）
        if (mine.length > 0) { ctx.discard(ctx.self.id, mine); ctx.draw(ctx.self.id, mine.length); }
        if (theirs.length > 0) { ctx.discard(targetId, theirs); ctx.draw(targetId, theirs.length); }
        ctx.log('【齐眉】双方重铸展示的牌');
      } else {
        ctx.draw(ctx.self.id, 1);
        ctx.draw(targetId, 1);
        ctx.log('【齐眉】双方各摸一张牌');
      }
    },
  },
});

// ── 芮姬「铃音」 ──────────────────────────────────────
registerSkill({
  hero: '芮姬',
  skill: '铃音',
  hooks: {
    onTurnEnd: (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      ctx.heroMemory.lingyin = false;
    },
    onPlayPhaseBegin: async (ctx, ev) => {
      if (ev.owner.id !== ctx.self.id) return;
      const wish = (ctx.heroMemory.wish as Card[] | undefined) ?? [];
      const x = Math.min(ctx.roundCount, wish.length);
      if (x > 0) {
        // 「获得至多X张妄」：人类自己挑，AI 全拿
        let take = wish.slice(0, x);
        if (ctx.self.isHuman) {
          const r = await ctx.requestChoice({
            title: `铃音：获得至多 ${x} 张「妄」`,
            mode: 'multi',
            choices: wish.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
            min: 0, max: x, cancelLabel: '不获得',
          });
          const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
          take = ids.map(id => wish.find(c => c.id === id)).filter((c): c is Card => !!c);
        }
        if (take.length > 0) {
          ctx.heroMemory.wish = wish.filter(c => !take.some(t => t.id === c.id));
          for (const c of take) ctx.gainCard(ctx.self.id, ctx.self.id, c);
          ctx.banner();
          ctx.log(`【铃音】${ctx.self.hero.name} 获得 ${take.length} 张「妄」`);
        }
      }
      // 「若剩余的『妄』颜色均相同」——空区视为同色（原文没有「至少一张」）
      const rest = (ctx.heroMemory.wish as Card[] | undefined) ?? [];
      const colors = new Set(rest.map(c => (c.suit === Suit.HEART || c.suit === Suit.DIAMOND ? 'red' : 'black')));
      if (colors.size > 1) {
        ctx.heroMemory.lingyin = false;
        return;
      }
      ctx.heroMemory.lingyin = true;
      ctx.log(`【铃音】剩余「${YAN}」同色，本回合对其他角色造成的伤害+1（武器/防具当【决斗】需区域弃牌原语，未实装）`);
    },
    damageBefore: (ctx, ev) => {
      if (!ctx.heroMemory.lingyin) return null;
      if (ev.source?.id !== ctx.self.id) return null;
      if (ev.victim.id === ctx.self.id) return null;
      if (ev.amount <= 0) return null;
      return { amount: ev.amount + 1, note: '【铃音】伤害 +1' };
    },
  },
});

// ── 张楚「日彗」 ──────────────────────────────────────
/**
 * 「获得其区域内的一张牌」：区域 = 手牌 + 装备区 + 判定区。
 * readArea 返回的牌**不告诉所在区域**，所以按三个区域分别查，
 * 命中哪个就把 zone 传给 gainCard —— 传错 zone 会「凭空复制一张牌」或漏移除。
 * 人机共用同一实现，避免 AI 与人走两套规则。
 */
const stealFromAnyArea = (
  ctx: SkillContext,
  targetId: number,
  toId: number,
): boolean => {
  for (const zone of ['hand', 'equip', 'judge'] as const) {
    const cards = ctx.readArea(targetId, zone);
    if (!cards.length) continue;
    const card = cards[Math.floor(Math.random() * cards.length)];
    ctx.gainCard(targetId, toId, card, zone);
    return true;
  }
  return false;
};
const isBlack = (c: Card): boolean => c.suit === '♠' || c.suit === '♣';

registerSkill({
  hero: '张楚',
  skill: '日彗',
  hooks: {
    onTurnStart: (ctx) => { ctx.memory.usedThisTurn = false; },
    afterCardUsed: async (ctx, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const card = ev.card;
      if (!isBlack(card)) return;
      if (card.type !== CardType.BASIC && card.type !== CardType.SCROLL) return;
      if (ev.targets.length !== 1) return;
      const target = ev.targets[0];
      if (target.id === ctx.self.id || target.isDead) return;

      const hasXinzhong = ctx.markCount(XINZHONG, target.id) > 0;
      /** 「所有拥有『信众』的角色依次视为对其使用此牌」——人机共用这一段 */
      const useByBelievers = async () => {
        const believers = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && ctx.markCount(XINZHONG, p.id) > 0);
        for (const p of believers) {
          ctx.log(`【日彗】${p.hero.name} 视为对 ${target.hero.name} 使用【${card.name}】`);
          await ctx.useCardAs(card, [target.id], { asPlayerId: p.id, reason: '日彗' });
        }
      };
      if (!ctx.self.isHuman) {
        // AI：有「信众」就改为拿一张牌，没有就走「信众接力」
        if (hasXinzhong) {
          ctx.memory.usedThisTurn = true;
          ctx.banner();
          if (!stealFromAnyArea(ctx, target.id, ctx.self.id)) return;
          ctx.log(`【日彗】${ctx.self.hero.name} 获得 ${target.hero.name} 区域内的一张牌`);
          return;
        }
        ctx.memory.usedThisTurn = true;
        ctx.banner();
        await useByBelievers();
        return;
      }
      // 人类：先确认要不要发动
      const r = await ctx.requestChoice({
        title: `日彗：对 ${target.hero.name} 的【${card.name}】结算结束`,
        hint: hasXinzhong
          ? '其已有「信众」标记：获得其区域内的一张牌'
          : '其没有「信众」标记：所有拥有「信众」的角色依次视为对其使用此牌',
        mode: 'choose',
        choices: [{ id: 'yes', label: '发动' }],
        min: 1, max: 1, cancelLabel: '不发动',
      });
      if (!r || r.kind === 'cancel' || r.kind === 'timeout') return;
      ctx.memory.usedThisTurn = true;
      ctx.banner();
      if (hasXinzhong) {
        // 与 AI 分支共用同一套跨区域获得：手牌 / 装备区 / 判定区
        if (!stealFromAnyArea(ctx, target.id, ctx.self.id)) {
          ctx.log('【日彗】对方区域内没有牌可拿');
          return;
        }
        ctx.log(`【日彗】${ctx.self.hero.name} 获得 ${target.hero.name} 区域内的一张牌`);
        return;
      }
      await useByBelievers();
    },
  },
});

// ── 马伶俐「花火」 ────────────────────────────────────
registerSkill({
  hero: '马伶俐',
  skill: '花火',
  hooks: {
    onTurnEnd: (ctx) => { ctx.memory.usedThisTurn = false; },
    onPlayPhaseBegin: async (ctx, ev) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const reds = ctx.self.hand.filter(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
      if (reds.length === 0) return;
      // 花火是「无**次数**限制」，不是「无距离限制」—— 它仍是一张普通【杀】的范围。
      // 引擎的 resolveCardEffect 不校验主目标距离（按本仓约定由技能自己筛，
      // 枕戈 / 双锐 都是这么做的），所以这里必须过 canReach。
      const others = aliveOthers(ctx).filter(p => ctx.canReach(ctx.self.id, p.id));
      if (others.length === 0) return;
      let card: Card | undefined;
      let targetId: number | undefined;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '花火：将一张红色手牌当火【杀】使用',
          mode: 'choose',
          choices: reds.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 1, max: 1, cancelLabel: '不发动',
        });
        const cid = r && (r.kind === 'choose' || r.kind === 'card') ? (r.id ?? r.ids?.[0]) : undefined;
        card = reds.find(c => c.id === cid);
        if (!card) return;
        targetId = await pickOne(ctx, others, `花火：火【杀】的目标`);
      } else {
        card = reds[0];
        targetId = [...others].sort((a, b) => a.hp - b.hp || a.id - b.id)[0].id;
      }
      if (!card || targetId === undefined) return;

      // 「若目标角色有『硝引』牌，你可以改为指定所有拥有『硝引』牌的角色为目标」
      // —— 硝引牌区由同武将的「硝引」（batch6new22）写在 ctx.heroMemory.niaoyin，
      //    形状是 Record<pid, Card[]>；heroMemory 按武将名共享，所以这里读得到。
      const niaoyinZone = (ctx.heroMemory.niaoyin as Record<string, Card[]> | undefined) ?? {};
      // 改为全体时同样只含能打到的人：【杀】的多目标也必须逐个是合法目标
      const holders = ctx.players.filter(
        q => !q.isDead && q.id !== ctx.self.id && ctx.canReach(ctx.self.id, q.id)
          && (niaoyinZone[String(q.id)]?.length ?? 0) > 0,
      );
      let targetIds = [targetId];
      if (holders.some(q => q.id === targetId)) {
        let redirect = true;
        if (ctx.self.isHuman) {
          const rr = await ctx.requestChoice({
            title: '花火：目标有「硝引」牌，是否改为指定所有拥有「硝引」牌的角色',
            hint: holders.map(q => q.hero.name).join('、'),
            mode: 'choose',
            choices: [{ id: 'yes', label: '改为全体' }, { id: 'no', label: '仍只指定原目标' }],
            min: 1, max: 1, cancelLabel: '仍只指定原目标',
          });
          redirect = !!rr && rr.kind === 'choose' && rr.id === 'yes';
        }
        if (redirect) targetIds = holders.map(q => q.id);
      }

      ctx.memory.usedThisTurn = true;
      ctx.banner();
      ctx.discard(ctx.self.id, [card]);
      ctx.log(`【花火】${ctx.self.hero.name} 将 ${card.suit}${card.rank} 当火【杀】对 ${targetIds.length} 名角色使用`);
      await ctx.useCardAs(card, targetIds, { attribute: 'fire', ignoreDistance: false, ignoreSlashLimit: true, reason: '花火' });
    },
  },
});
