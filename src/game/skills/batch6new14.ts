import { registerSkill } from './registry';
import type { SkillContext, CardTargetsEvent, CardTargetsResult } from './registry';
import { CardName, CardType } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 14 组：**本轮补齐「视为使用一张牌」等原语之后**回填的技能。
 *
 * 本轮新接通的能力（见 git log：useCardAs / grantSkill / roundCount / 出牌阶段时机）：
 *   · ctx.useCardAs —— 视为使用一张牌，走完整 resolveCardEffect
 *     （无懈 / 【闪】响应 / 防具 / onTargetsChosen 的目标否决都在里面）
 *   · ctx.grantSkill / revokeSkill / hasGrantedSkill —— 技能授予与收回
 *   · ctx.roundCount + onRoundStart —— 「每轮」而不是「每回合」
 *   · onPlayPhaseBegin / onPlayPhaseEnd —— 出牌阶段的开始与结束
 *   · distance / canReach / attackRange / peekDiscard / changeAttackRange
 *     / flip / restoreGeneral / setChained / deckShuffleCount / afterDying
 *
 * 本文件实装 3 条：
 *   董贵人「☆ 受责」   onTurnEnd + peekDiscard + takeFromDiscard + gainCard + loseHp
 *   柏灵筠「灵慧」     onDying 记标记 + onTurnEnd + peekDeck + takeFromDeck + useCardAs
 *   来莺儿「☆ 沙舞」   onTargetsChosen + damage + draw（「沙」标记与「绡舞」同一份）
 */

/** 「绞」标记：与 batch6new6.ts 的 JIAO、董贵人「归罪」「凌风」读写同一份 heroMemory */
const JIAO = '绞';
/** 「沙」标记：与 batch6new10.ts 的 SHA_MARK（来莺儿「绡舞」）读写同一份 heroMemory */
const SHA_MARK = '沙';

const isBlack = (c: Card): boolean => c.suit === '♠' || c.suit === '♣';

/** 「闪」「无懈可击」不能主动使用，不能作为「可以使用其中一张」的候选 */
const NOT_PROACTIVE = new Set<string>([CardName.SHAN, CardName.WUXIE]);

// ────────────────────────────────────────────────────────────
// 董贵人「☆ 受责」
// 锁定技，结束阶段，你移去1个「绞」标记，随机获得弃牌堆中的一张黑色牌，失去1点体力。
// ────────────────────────────────────────────────────────────
/**
 * 为什么是锁定技却不写成「有绞才发动」：原文没有「若…则」，移不去标记也照样
 * 失去体力 —— 这正是锁定技的代价（与「凌芳」赚标记形成一进一出）。
 */
registerSkill({
  hero: '董贵人',
  skill: '☆ 受责',
  hooks: {
    onTurnEnd: async (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.self.isDead) return;
      ctx.banner();
      const removed = ctx.removeMark(JIAO, 1);
      if (removed > 0) {
        ctx.log(`【☆ 受责】${ctx.self.hero.name} 移去 1 个「绞」标记（剩余 ${ctx.markCount(JIAO)}）`);
      } else {
        ctx.log(`【☆ 受责】${ctx.self.hero.name} 没有「绞」标记可移去`);
      }
      // 「随机获得」：takeFromDiscard 是按存储顺序取的，不随机；
      // 所以先用 peekDiscard 看全量、自己随机挑一张，再按 id 精确取走。
      const blacks = ctx.peekDiscard().filter(isBlack);
      if (blacks.length > 0) {
        const pick = blacks[Math.floor(Math.random() * blacks.length)];
        const got = ctx.takeFromDiscard(c => c.id === pick.id, 1);
        if (got.length > 0) {
          ctx.gainCard(ctx.self.id, ctx.self.id, got[0]);
          ctx.log(`【☆ 受责】${ctx.self.hero.name} 从弃牌堆随机获得【${got[0].name}】`);
        }
      } else {
        ctx.log('【☆ 受责】弃牌堆里没有黑色牌');
      }
      await ctx.loseHp(ctx.self.id, 1);
    },
  },
});

// ────────────────────────────────────────────────────────────
// 柏灵筠「灵慧」
// 一名角色的结束阶段，若该角色为你或本回合有角色进入过濒死状态，
// 你可以观看牌堆顶的三张牌，然后你可以使用其中一张并随机获得其余牌的其中一张。
// ────────────────────────────────────────────────────────────
/**
 * 实现要点（三条都是「不降级」的关键）：
 *
 * 1. 「观看」不改牌堆：peekDeck 只读，弃掉的牌用 takeFromDeck 按 **id** 精确取走，
 *    没被取走的那张留在原位 —— 不需要「把牌放回牌堆顶」这种原语。
 * 2. 「使用其中一张」走 ctx.useCardAs，所以【闪】响应、无懈、防具全都照常结算。
 * 3. 「随机获得其余牌的其中一张」= 从剩下的牌里随机挑一张，同样按 id 精确取走。
 */
registerSkill({
  hero: '柏灵筠',
  skill: '灵慧',
  hooks: {
    onTurnStart: (ctx) => { ctx.memory.dyingThisTurn = false; },
    onDying: (ctx) => { ctx.memory.dyingThisTurn = true; },
    onTurnEnd: async (ctx, ending) => {
      if (ending.id !== ctx.self.id && !ctx.memory.dyingThisTurn) return;
      if (ctx.self.isDead) return;
      const top = ctx.peekDeck(3);
      if (top.length === 0) return;

      ctx.banner();
      ctx.log(`【灵慧】${ctx.self.hero.name} 观看牌堆顶 ${top.length} 张：${top.map(c => `【${c.name}】`).join('')}`);
      await ctx.delay(300);

      const remaining = [...top];
      const usable = top.filter(c => !NOT_PROACTIVE.has(c.name));
      if (usable.length > 0) {
        const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
        let chosen: Card | undefined;
        let targetId: number | undefined;
        if (ctx.self.isHuman) {
          const pick = await ctx.requestChoice({
            title: '灵慧：观看牌堆顶的牌，可以使用其中一张',
            hint: '不选则只获得其余牌中的一张',
            mode: 'choose',
            choices: usable.map(c => ({
              id: c.id,
              label: `【${c.name}】${c.suit}${c.rank}`,
              desc: c.type === CardType.BASIC ? '基本牌' : '锦囊牌',
            })),
            min: 1,
            max: 1,
            cancelLabel: '不使用',
          });
          const id = pick && (pick.kind === 'choose' || pick.kind === 'card')
            ? (pick.id ?? pick.ids?.[0])
            : undefined;
          chosen = usable.find(c => c.id === id);
          if (chosen && others.length > 0) {
            const tr = await ctx.requestChoice({
              title: `灵慧：使用【${chosen.name}】的目标`,
              mode: 'target',
              targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}` })),
              min: 1,
              max: 1,
              cancelLabel: '不使用',
            });
            const tid = tr && tr.kind === 'target' ? tr.ids?.[0] : undefined;
            targetId = typeof tid === 'number' ? tid : undefined;
            if (targetId === undefined) chosen = undefined;
          } else if (chosen) {
            chosen = undefined;
          }
        } else {
          // AI：只在摸到【杀】且有别的活人时用出去，其余情况放弃（「可以」）
          const sha = usable.find(c => c.name === CardName.SHA);
          const victim = [...others].sort((a, b) => a.hp - b.hp)[0];
          if (sha && victim) { chosen = sha; targetId = victim.id; }
        }
        if (chosen && targetId !== undefined) {
          const taken = ctx.takeFromDeck(c => c.id === chosen!.id, 1);
          if (taken.length > 0) {
            const i = remaining.findIndex(c => c.id === taken[0].id);
            if (i >= 0) remaining.splice(i, 1);
            ctx.log(`【灵慧】${ctx.self.hero.name} 使用其中的【${taken[0].name}】`);
            await ctx.useCardAs(taken[0], [targetId], { reason: '灵慧' });
          }
        }
      }

      if (remaining.length > 0) {
        const picked = remaining[Math.floor(Math.random() * remaining.length)];
        const got = ctx.takeFromDeck(c => c.id === picked.id, 1);
        if (got.length > 0) {
          ctx.gainCard(ctx.self.id, ctx.self.id, got[0]);
          ctx.log(`【灵慧】${ctx.self.hero.name} 随机获得其余牌中的【${got[0].name}】`);
        }
      }
    },
  },
});

// ────────────────────────────────────────────────────────────
// 来莺儿「☆ 沙舞」
// 当你使用【杀】指定一名角色为目标后，你可以弃置两张手牌或移去1个「沙」标记，
// 对其造成1点伤害。若你移去了「沙」标记，你摸两张牌。
// ────────────────────────────────────────────────────────────
/**
 * 时机说明：onTargetsChosen 是「目标已确定、结算之前」——正好是原文的
 * 「指定一名角色为目标后」。伤害在这里落地后，这张【杀】仍会照常结算
 * （目标还要出【闪】），与官方时序一致。
 */
registerSkill({
  hero: '来莺儿',
  skill: '☆ 沙舞',
  hooks: {
    onTargetsChosen: async (ctx, ev: CardTargetsEvent): Promise<CardTargetsResult | null> => {
      if (ev.source.id !== ctx.self.id) return null;
      if (ev.card.name !== CardName.SHA) return null;
      const victim = ev.targets.find(t => !t.isDead && t.id !== ctx.self.id);
      if (!victim) return null;
      if (ctx.self.isDead) return null;

      const marks = ctx.markCount(SHA_MARK);
      const canDiscard = ctx.self.hand.length >= 2;
      if (marks <= 0 && !canDiscard) return null;

      // 人类自己选；AI 优先用「沙」标记（因为能摸两张，性价比更高）
      let mode: 'mark' | 'cards' | 'skip' = 'skip';
      if (ctx.self.isHuman) {
        const choices = [];
        if (marks > 0) choices.push({ id: 'mark', label: `移去 1 个「沙」标记（现有 ${marks}）`, desc: '造成 1 点伤害，然后摸两张牌' });
        if (canDiscard) choices.push({ id: 'cards', label: '弃置两张手牌', desc: '造成 1 点伤害' });
        const r = await ctx.requestChoice({
          title: `☆ 沙舞：对 ${victim.hero.name} 造成 1 点伤害？`,
          mode: 'choose',
          choices,
          min: 1,
          max: 1,
          cancelLabel: '不发动',
        });
        const pickId = r && r.kind === 'choose' ? String(r.id) : '';
        if (pickId === 'mark') mode = 'mark';
        else if (pickId === 'cards') mode = 'cards';
      } else if (marks > 0) {
        mode = 'mark';
      } else if (canDiscard) {
        mode = 'cards';
      }
      if (mode === 'skip') return null;

      ctx.banner();
      if (mode === 'mark') {
        ctx.removeMark(SHA_MARK, 1);
        ctx.log(`【☆ 沙舞】${ctx.self.hero.name} 移去 1 个「沙」标记，对 ${victim.hero.name} 造成 1 点伤害`);
      } else {
        const cost = ctx.self.hand.slice(0, 2);
        ctx.discard(ctx.self.id, cost);
        ctx.log(`【☆ 沙舞】${ctx.self.hero.name} 弃置 ${cost.map(c => `【${c.name}】`).join('')}，对 ${victim.hero.name} 造成 1 点伤害`);
      }
      await ctx.damage(victim.id, ctx.self.id, 1);
      if (mode === 'mark') ctx.draw(ctx.self.id, 2);
      return null;
    },
  },
});
