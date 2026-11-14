import { registerSkill } from './registry';
import type { SkillContext, CardLostEvent } from './registry';
import { CardName, CardType } from '../../../types';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 16 组：来莺儿「化萍」、董贵人「连枝」「风影」、滕公主「幸宠」。
 *
 * 原文（cardsrepo/data/lore.json）：
 *   化萍    限定技，当一名角色死亡时，若该角色不为你，你可以获得该角色当前所有武将技能
 *           并失去技能“绡舞”、移去所有“沙”标记并摸等量张牌，否则你可以令一名其他角色
 *           获得技能“沙舞”并将所有“沙”标记交给其。
 *   连枝    游戏开始时，你选择一名其他角色：1.每回合限一次，当你进入濒死状态时，若该角色
 *           未死亡，你回复1点体力并与其各摸一张牌；2.当该角色死亡后，你可以与一名其他角色
 *           均获得技能“受责”并令其获得X个“绞”标记（X为你的“绞”标记数且至少为1）。
 *   风影    每回合限一次，你可以将一张点数不大于“绞”标记数的手牌当任意一种本回合开始时
 *           弃牌堆中有的黑色基本牌或黑色普通锦囊牌使用（以此法使用的牌无距离与次数限制）。
 *   幸宠    每轮开始时，你可以选择一个不大于X的非负整数（X为你的体力上限，至多为5），
 *           摸此数量张牌，然后你可以展示至多Y张手牌（Y为X减你选择的数，当你本轮失去一张
 *           以此法展示过的牌后，你摸两张牌）。
 *
 * 跨技能共享状态（同一武将的 heroMemory 是同一份）：
 *   · 「沙」标记 —— 与「绡舞」「☆ 沙舞」同一份（ctx 的 marks 按武将名存）
 *   · 「绞」标记 —— 与「归罪」「凌芳」「☆ 受责」同一份
 *   · 连枝的「游戏开始时」（memory.started）与「每回合限一次」（memory.dyingUsed）
 */

const SHA_MARK = '沙';
const JIAO = '绞';
/** 「受责」在 HEROES 里的注册名（董贵人）：带「☆ 」前缀 */
const SHOUZE = '☆ 受责';
/** 「沙舞」在 HEROES 里的注册名（来莺儿）：带「☆ 」前缀 */
const SHAWU = '☆ 沙舞';

const aliveOthers = (ctx: SkillContext, excludeId?: number): Player[] =>
  ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.id !== excludeId);

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

// ── 来莺儿「化萍」 ────────────────────────────────────
registerSkill({
  hero: '来莺儿',
  skill: '化萍',
  hooks: {
    afterDeath: async (ctx, ev) => {
      if (ctx.memory.used) return;
      if (ev.dead.id === ctx.self.id) {
        // 自己死了：把「☆ 沙舞」和所有「沙」标记交给一名其他角色
        const targetId = await pickOne(ctx, aliveOthers(ctx), '化萍：令一名其他角色获得「☆ 沙舞」');
        if (targetId === undefined) return;
        const t = ctx.players.find(p => p.id === targetId);
        if (!t) return;
        ctx.memory.used = true;
        ctx.banner();
        ctx.grantSkill(SHAWU, targetId);
        const marks = ctx.markCount(SHA_MARK);
        if (marks > 0) {
          ctx.removeMark(SHA_MARK, marks);
          ctx.addMark(SHA_MARK, marks, targetId);
        }
        ctx.log(`【化萍】${ctx.self.hero.name} 令 ${t.hero.name} 获得「☆ 沙舞」并接过 ${marks} 个「沙」标记`);
        return;
      }
      // 别人死了：接过他的全部武将技能，自己失去「绡舞」、清空「沙」标记并摸等量张
      ctx.memory.used = true;
      ctx.banner();
      const marks = ctx.markCount(SHA_MARK);
      const skills = ev.dead.hero.skillName.split('/').map(s => s.trim()).filter(Boolean);
      const gained: string[] = [];
      for (const name of skills) {
        if (ctx.grantSkill(name)) gained.push(name);
      }
      // 注册表按武将派发，「绡舞」是来莺儿的原生技能，revokeSkill 撤不掉它；
      // 所以改由 heroMemory 写开关，「绡舞」的 onTurnEnd 认这个开关（batch6new10.ts）。
      ctx.heroMemory.noXiaowu = true;
      if (marks > 0) {
        ctx.removeMark(SHA_MARK, marks);
        ctx.draw(ctx.self.id, marks);
      }
      ctx.log(`【化萍】${ctx.self.hero.name} 获得 ${ev.dead.hero.name} 的技能 ${gained.map(s => `「${s}」`).join('') || '（无可获得）'}，失去「绡舞」并摸 ${marks} 张`);
    },
  },
});

// ── 董贵人「连枝」 ────────────────────────────────────
registerSkill({
  hero: '董贵人',
  skill: '连枝',
  hooks: {
    onTurnStart: async (ctx, owner) => {
      if (owner.id !== ctx.self.id) return;
      ctx.memory.dyingUsed = false;   // 「每回合限一次」按自己的回合重置
      if (ctx.memory.started) return;
      const targetId = await pickOne(ctx, aliveOthers(ctx), '连枝：选择一名其他角色');
      if (targetId === undefined) return;
      ctx.memory.started = true;
      ctx.memory.linkId = targetId;
      const t = ctx.players.find(p => p.id === targetId);
      ctx.banner();
      ctx.log(`【连枝】${ctx.self.hero.name} 选择了 ${t?.hero.name ?? '?'}`);
    },
    onDying: (ctx, ev) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (!ctx.memory.started || ctx.memory.dyingUsed) return;
      const linkId = ctx.memory.linkId as number | undefined;
      if (linkId === undefined) return;
      const link = ctx.players.find(p => p.id === linkId);
      if (!link || link.isDead) return;
      ctx.memory.dyingUsed = true;
      ctx.banner();
      // 「你回复1点体力」= 在求桃之前把体力顶到 hp+1；引擎看到 >0 就不再要【桃】
      ctx.draw(ctx.self.id, 1);
      ctx.draw(linkId, 1);
      ctx.log(`【连枝】${ctx.self.hero.name} 与 ${link.hero.name} 各摸一张牌，回复 1 点体力`);
      return { hp: ev.victim.hp + 1 };
    },
    afterDeath: async (ctx, ev) => {
      const linkId = ctx.memory.linkId as number | undefined;
      if (linkId === undefined || ev.dead.id !== linkId) return;
      ctx.memory.linkId = undefined;
      const targetId = await pickOne(ctx, aliveOthers(ctx, ev.dead.id), '连枝：与一名其他角色均获得「☆ 受责」');
      if (targetId === undefined) return;
      const t = ctx.players.find(p => p.id === targetId);
      if (!t) return;
      ctx.banner();
      ctx.grantSkill(SHOUZE, ctx.self.id);
      ctx.grantSkill(SHOUZE, targetId);
      const marks = Math.max(1, ctx.markCount(JIAO));
      ctx.addMark(JIAO, marks, targetId);
      ctx.log(`【连枝】${ctx.self.hero.name} 与 ${t.hero.name} 均获得「☆ 受责」，${t.hero.name} 获得 ${marks} 个「绞」标记`);
    },
  },
});

// ── 董贵人「风影」 ────────────────────────────────────
const isBlack = (c: Card): boolean => c.suit === '♠' || c.suit === '♣';

registerSkill({
  hero: '董贵人',
  skill: '风影',
  hooks: {
    onTurnStart: (ctx) => {
      // 「本回合开始时弃牌堆中有的黑色基本牌 / 普通锦囊牌」——回合开始时快照一次
      const usable = ctx.peekDiscard()
        .filter(c => isBlack(c) && (c.type === CardType.BASIC || c.type === CardType.SCROLL))
        .map(c => c.name);
      ctx.memory.usable = Array.from(new Set(usable));
    },
    onPlayPhaseBegin: async (ctx, ev) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const usable = (ctx.memory.usable as string[] | undefined) ?? [];
      if (usable.length === 0) return;
      const marks = ctx.markCount(JIAO);
      if (marks <= 0) return;
      const candidates = ctx.self.hand.filter(c => (c.value ?? 0) <= marks);
      if (candidates.length === 0) return;

      let chosen: Card | undefined;
      let asName: string | undefined;
      let targetId: number | undefined;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: `风影：把一张点数不大于 ${marks} 的手牌当黑色基本牌/普通锦囊使用`,
          mode: 'choose',
          choices: candidates.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 1, max: 1, cancelLabel: '不发动',
        });
        const cid = r && (r.kind === 'choose' || r.kind === 'card') ? (r.id ?? r.ids?.[0]) : undefined;
        chosen = candidates.find(c => c.id === cid);
        if (chosen) {
          const nr = await ctx.requestChoice({
            title: '风影：当作哪一种牌使用',
            mode: 'choose',
            choices: usable.map(n => ({ id: n, label: `【${n}】` })),
            min: 1, max: 1, cancelLabel: '不发动',
          });
          asName = nr && (nr.kind === 'choose' || nr.kind === 'card') ? String(nr.id ?? nr.ids?.[0]) : undefined;
          if (!asName) return;
          const others = aliveOthers(ctx);
          const tr = await pickOne(ctx, others, `风影：使用【${asName}】的目标`, '无距离与次数限制');
          targetId = tr;
        }
      } else {
        // AI：优先换成【杀】打体力最低的敌人；没有【杀】就不发动
        asName = usable.find(n => n === CardName.SHA);
        if (asName) {
          chosen = [...candidates].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
          targetId = aliveOthers(ctx).sort((a, b) => a.hp - b.hp || a.id - b.id)[0]?.id;
        }
      }
      if (!chosen || !asName || targetId === undefined) return;
      ctx.memory.usedThisTurn = true;
      ctx.banner();
      const virtual: Card = { ...chosen, name: asName as CardName };
      ctx.discard(ctx.self.id, [chosen]);
      ctx.log(`【风影】${ctx.self.hero.name} 将【${chosen.name}】${chosen.suit}${chosen.rank} 当【${asName}】使用`);
      await ctx.useCardAs(virtual, [targetId], { ignoreDistance: true, reason: '风影' });
    },
    onTurnEnd: (ctx, ending) => {
      if (ending.id !== ctx.self.id) return;
      ctx.memory.usedThisTurn = false;
    },
  },
});

// ── 滕公主「幸宠」 ────────────────────────────────────
registerSkill({
  hero: '滕公主',
  skill: '幸宠',
  hooks: {
    onRoundStart: async (ctx) => {
      const x = Math.min(5, Math.max(0, ctx.self.maxHp));
      if (x <= 0) return;
      let n = x;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: `幸宠：选择一个不大于 ${x} 的数，摸等量张牌`,
          hint: '剩余的 ' + (x - n) + ' 张可以展示，本轮失去展示过的牌时摸两张',
          mode: 'choose',
          choices: Array.from({ length: x + 1 }, (_, i) => ({ id: String(i), label: `摸 ${i} 张` })),
          min: 1, max: 1, cancelLabel: '不发动',
        });
        const raw = r && (r.kind === 'choose' || r.kind === 'card') ? String(r.id ?? r.ids?.[0]) : '';
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > x) return;
        n = parsed;
      }
      ctx.banner();
      if (n > 0) ctx.draw(ctx.self.id, n);
      ctx.log(`【幸宠】${ctx.self.hero.name} 选择 ${n}，摸 ${n} 张牌`);
      const y = x - n;
      if (y <= 0 || ctx.self.hand.length === 0) { ctx.memory.revealed = []; return; }
      // 「展示至多Y张手牌」：人类自己挑，AI 展示前 Y 张
      let picked = ctx.self.hand.slice(0, y);
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: `幸宠：展示至多 ${y} 张手牌`,
          hint: '本轮失去以此法展示过的牌后，摸两张牌',
          mode: 'multi',
          choices: ctx.self.hand.map(c => ({ id: c.id, label: `【${c.name}】${c.suit}${c.rank}` })),
          min: 0, max: Math.min(y, ctx.self.hand.length), cancelLabel: '不展示',
        });
        const ids = r && r.kind === 'multi' ? (r.ids ?? []) : [];
        picked = ids.map(id => ctx.self.hand.find(c => c.id === id)).filter((c): c is Card => !!c);
      }
      ctx.memory.revealed = picked.map(c => c.id);
      if (picked.length > 0) {
        ctx.log(`【幸宠】${ctx.self.hero.name} 展示 ${picked.map(c => `【${c.name}】`).join('')}`);
      }
    },
    afterCardLost: (ctx, ev: CardLostEvent) => {
      if (ev.player.id !== ctx.self.id) return;
      const revealed = (ctx.memory.revealed as string[] | undefined) ?? [];
      if (revealed.length === 0) return;
      const lost = ev.cards.filter(c => revealed.includes(c.id));
      if (lost.length === 0) return;
      ctx.memory.revealed = revealed.filter(id => !lost.some(c => c.id === id));
      ctx.log(`【幸宠】${ctx.self.hero.name} 失去了展示过的 ${lost.map(c => `【${c.name}】`).join('')}，摸两张牌`);
      ctx.draw(ctx.self.id, 2);
    },
  },
});
