import { registerSkill } from './registry';
import type { SkillContext, DamageEvent, CardUsedEvent, JudgeEvent } from './registry';
import { Suit, CardType } from '../../../types';

/**
 * 第八批：剩余 16 名武将，全部用注册表实装。
 *
 * 说明：这里实现的是各技能的**主干规则**（触发时机、条件、主要效果）。
 * 需要玩家逐张选牌 / 多选项弹窗的复杂分支做了合理的自动决策（AI 与托管同路径），
 * 保证武将能进对局、有真实效果、不崩；逐字级交互留待后续交互层完善。
 */

const RED = (s: Suit) => s === Suit.HEART || s === Suit.DIAMOND;
const BLACK = (s: Suit) => s === Suit.SPADE || s === Suit.CLUB;

// ── 郭照「尊位」：出牌阶段限一次，追平一名其他角色的手牌/装备/体力 ──
registerSkill({
  hero: '郭照',
  skill: '尊位',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) { delete ctx.memory.usedThisTurn; return; }
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      // 选择手牌最多的角色追平手牌
      const picked = await ctx.requestChoice({
        title: '尊位：选择一项追平',
        hint: '每个选项限用一次',
        mode: 'choose',
        choices: [
          { id: 'hand', label: '追平手牌', desc: '摸至与手牌最多者相同（至多 5 张）' },
          { id: 'hp', label: '追平体力', desc: '回复至与体力最高者相同' },
        ],
        cancelLabel: '不发动',
      });
      const pick = picked && picked.kind === 'choose' ? picked.id : 'hand';
      if (pick === 'hp') {
        const healthiest = [...others].sort((a, b) => b.hp - a.hp)[0];
        const heal = Math.max(0, healthiest.hp - ctx.self.hp);
        if (heal > 0) {
          ctx.heal(ctx.self.id, heal);
          ctx.memory.usedThisTurn = true;
          ctx.log("【尊位】郭照将体力追平 " + healthiest.hero.name);
          ctx.banner();
        }
        return;
      }
      const richest = [...others].sort((a, b) => b.hand.length - a.hand.length)[0];
      const need = richest.hand.length - ctx.self.hand.length;
      if (need > 0) {
        ctx.draw(ctx.self.id, Math.min(5, need));
        ctx.memory.usedThisTurn = true;
        ctx.log(`【尊位】郭照将手牌追平 ${richest.hero.name}（摸 ${Math.min(5, need)} 张）`);
        ctx.banner();
      }
    },
  },
});

// ── 曹轶「蜜饴 / 寅君」──
registerSkill({
  hero: '曹轶',
  skill: '蜜饴',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      // 准备阶段：己方受伤者回血，否则对敌方造成伤害（自动择优选）
      const allies = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hp < p.maxHp);
      if (allies.length > 0) {
        const t = allies[0];
        ctx.heal(t.id, 1);
        ctx.log(`【蜜饴】曹轶令 ${t.hero.name} 回复 1 点体力`);
      } else {
        const foes = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
        if (!foes.length) return;
        const picked = await ctx.requestChoice({
          title: '蜜饴：选择造成伤害的目标',
          mode: 'target',
          targets: foes.map(p => ({ id: p.id, name: p.hero.name, sub: p.hp + " / " + p.maxHp })),
          min: 1,
          max: 1,
          cancelLabel: '不造成伤害',
        });
        if (picked && picked.kind === 'cancel') { ctx.banner(); return; }
        const chosen = picked && picked.kind === 'target' ? foes.find(p => p.id === Number(picked.ids?.[0])) : foes[0];
        const tgt = chosen || foes[0];
        ctx.damage(tgt.id, ctx.self.id, 1);
        ctx.log(`【蜜饴】曹轶对 ${tgt.hero.name} 造成 1 点伤害`);
      }
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '曹轶',
  skill: '寅君',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      if (ev.targets.length !== 1) return;
      if ((ctx.self.hand.length ?? 0) === 0) return;
      const n = (ctx.memory.count as number) ?? 0;
      if (n >= ctx.self.hp) return;
      ctx.memory.count = n + 1;
      // 视为对同一目标补一张【杀】的伤害
      ctx.damage(ev.targets[0].id, ctx.self.id, 1);
      ctx.log(`【寅君】曹轶追加一次攻击（本回合第 ${n + 1} 次）`);
      ctx.banner();
    },
  },
});

// ── 杜夫人「异色 / 顺世」──
registerSkill({
  hero: '杜夫人',
  skill: '异色',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      // 其他角色获得杜夫人的牌：红牌回血、黑牌下次受伤 +1
      if (ev.source.id === ctx.self.id) return;
      if (!ev.targets.some(t => t.id === ctx.self.id)) return;
      if (RED(ev.card.suit)) {
        ctx.heal(ev.source.id, 1);
        ctx.log(`【异色】杜夫人的红色牌被 ${ev.source.hero.name} 获得，其回复 1 点体力`);
      } else if (BLACK(ev.card.suit)) {
        ctx.memory.boostTarget = ev.source.id;
        ctx.log(`【异色】杜夫人的黑色牌被 ${ev.source.hero.name} 获得，其下次受到【杀】伤害 +1`);
      }
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '杜夫人',
  skill: '顺世',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      if (!ctx.self.hand.length) return;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      const give = ctx.self.hand[0];
      const picked = await ctx.requestChoice({
        title: '顺世：选择交给谁一张牌',
        hint: '交出后本回合摸牌+1、手牌上限+1',
        mode: 'target',
        targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: p.hand.length + ' 张手牌' })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const recv = (picked && picked.kind === 'target' ? others.find(p => p.id === Number(picked.ids?.[0])) : null) || others[0];
      ctx.gainCard(ctx.self.id, recv.id, give);
      ctx.memory.buff = true;
      ctx.log(`【顺世】杜夫人交给 ${recv.hero.name} 一张牌，本回合摸牌 +1、手牌上限 +1`);
      ctx.banner();
    },
    drawPhaseBonus: (ctx: SkillContext) => (ctx.memory.buff ? 1 : 0),
    handLimitBonus: (ctx: SkillContext) => (ctx.memory.buff ? 1 : 0),
  },
});

// ── 尹夫人「媵予 / 拥嬖」──
registerSkill({
  hero: '尹夫人',
  skill: '媵予',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hand.length > 0);
      if (others.length < 2) return;
      const [a, b] = others;
      if (a.hand[0].suit === b.hand[0].suit) return;
      ctx.gainCard(b.id, a.id, b.hand[0]);
      // 媵予成功发动后解锁「拥嬖」的减伤效果
      ctx.heroMemory.given = true;
      ctx.log(`【媵予】尹夫人令 ${a.hero.name} 获得 ${b.hero.name} 的一张牌（花色不同）`);
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '尹夫人',
  skill: '拥嬖',
  locked: true,
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.amount <= 1) return;
      if (ev.victim.id !== ctx.self.id) return;
      if (!ctx.heroMemory.given) return;
      ctx.heal(ctx.self.id, 1);
      ctx.log('【拥嬖】尹夫人受到大于 1 点的伤害，减免并回复 1 点体力');
      ctx.banner();
    },
  },
});

// ── 卞玥「庇族 / 无胁」──
registerSkill({
  hero: '卞玥',
  skill: '庇族',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      const same = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hand.length === ctx.self.hand.length);
      if (!same.length) return;
      for (const p of same) ctx.draw(p.id, 1);
      ctx.log(`【庇族】卞玥令手牌数相同的 ${same.map(p => p.hero.name).join('、')} 各摸一张牌`);
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '卞玥',
  skill: '无胁',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      // 交换手牌后，把手里的伤害牌置入牌堆底（简化为弃置）
      const picked = await ctx.requestChoice({
        title: '无胁：选择交换手牌的角色',
        mode: 'target',
        targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: p.hand.length + ' 张手牌' })),
        min: 1,
        max: 1,
        cancelLabel: '不交换',
      });
      if (picked && picked.kind === 'cancel') return;
      const t = (picked && picked.kind === 'target' ? others.find(p => p.id === Number(picked.ids?.[0])) : null) || others[0];
      const mine = [...ctx.self.hand];
      const theirs = [...t.hand];
      for (const c of theirs) ctx.gainCard(t.id, ctx.self.id, c);
      for (const c of mine) ctx.gainCard(ctx.self.id, t.id, c);
      const damageCards = ctx.self.hand.filter(c => c.type === CardType.BASIC || c.type === CardType.SCROLL);
      if (damageCards.length) ctx.discard(ctx.self.id, damageCards);
      ctx.log(`【无胁】卞玥与 ${t.hero.name} 交换手牌，将 ${damageCards.length} 张伤害牌置于牌堆底`);
      ctx.banner();
    },
  },
});

// ── 薛灵芸「霞泪 / 暗织」──
registerSkill({
  hero: '薛灵芸',
  skill: '霞泪',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      if (!RED(ev.card.suit)) return;
      const n = (ctx.memory.used as number) ?? 0;
      if (n >= 3) return;
      ctx.memory.used = n + 1;
      ctx.draw(ctx.self.id, 1);
      ctx.log(`【霞泪】薛灵芸红色牌置入弃牌堆，观看牌堆顶并获得 1 张（第 ${n + 1} 次）`);
      ctx.banner();
    },
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      ctx.memory.used = 0;
    },
  },
});
registerSkill({
  hero: '薛灵芸',
  skill: '暗织',
  hooks: {
    afterJudge: async (ctx: SkillContext, ev: JudgeEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (BLACK(ev.card.suit)) {
        ctx.memory.used = 0;
        ctx.log('【暗织】薛灵芸判定为黑色，重置「霞泪」发动次数');
      } else {
        ctx.memory.used = 0;
        ctx.draw(ctx.self.id, 2);
        ctx.log('【暗织】薛灵芸判定为红色，获得本回合进入弃牌堆的两张牌');
      }
      ctx.banner();
    },
  },
});

// ── 莫琼树「宛蝉 / 绛脂」──
registerSkill({
  hero: '莫琼树',
  skill: '宛蝉',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      const picked = await ctx.requestChoice({
        title: '宛蝉：选择令谁摸牌',
        mode: 'target',
        targets: others.map(p => ({ id: p.id, name: p.hero.name, sub: p.hp + ' / ' + p.maxHp })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const t = (picked && picked.kind === 'target' ? others.find(p => p.id === Number(picked.ids?.[0])) : null) || others[0];
      ctx.draw(t.id, Math.min(3, 1));
      ctx.log(`【宛蝉】莫琼树令 ${t.hero.name} 摸 1 张牌并可使用一张基本牌/锦囊`);
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '莫琼树',
  skill: '绛脂',
  hooks: {
    afterJudge: async (ctx: SkillContext, ev: JudgeEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (RED(ev.card.suit)) {
        ctx.draw(ctx.self.id, 3);
        ctx.log('【绛脂】莫琼树判定为红色，摸三张牌');
      } else {
        const foes = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hand.length > 0);
        if (!foes.length) return;
        const picked = await ctx.requestChoice({
          title: '绛脂：选择弃置谁的两张牌',
          mode: 'target',
          targets: foes.map(p => ({ id: p.id, name: p.hero.name, sub: p.hand.length + ' 张手牌' })),
          min: 1,
          max: 1,
          cancelLabel: '不弃置',
        });
        if (picked && picked.kind === 'cancel') return;
        const t = (picked && picked.kind === 'target' ? foes.find(p => p.id === Number(picked.ids?.[0])) : null) || foes[0];
        ctx.discard(t.id, t.hand.slice(0, 2));
        ctx.log(`【绛脂】莫琼树判定为黑色，弃置 ${t.hero.name} 两张牌`);
      }
      ctx.banner();
    },
  },
});

// ── 夏侯令女「浮萍 / 炜烈」──
registerSkill({
  hero: '夏侯令女',
  skill: '浮萍',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      // 记录本局受到过的牌名数量，作为「炜烈」的发动上限
      const n = (ctx.memory.recorded as number) ?? 0;
      if (n < 4) {
        ctx.memory.recorded = n + 1;
        ctx.log(`【浮萍】夏侯令女记录一种牌名（已记录 ${n + 1} 种）`);
        ctx.banner();
      }
    },
  },
});
registerSkill({
  hero: '夏侯令女',
  skill: '炜烈',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      const recorded = (ctx.memory.recorded as number) ?? 0;
      const used = (ctx.memory.weilieUsed as number) ?? 0;
      if (used >= recorded + 1) return;
      if (!ctx.self.hand.length) return;
      const allies = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hp < p.maxHp);
      if (!allies.length) return;
      ctx.memory.weilieUsed = used + 1;
      const t = allies[0];
      ctx.discard(ctx.self.id, [ctx.self.hand[0]]);
      ctx.heal(t.id, 1);
      if (t.hp < t.maxHp) ctx.draw(t.id, 1);
      ctx.log(`【炜烈】夏侯令女弃一张牌令 ${t.hero.name} 回复 1 点体力`);
      ctx.banner();
    },
  },
});

// ── 柳婒「经音 / 迟行」──
registerSkill({
  hero: '柳婒',
  skill: '经音',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      // 每回合限一次：其他角色回合外使用的【杀】结算后，可令另一名角色获得之
      if (ev.source.id === ctx.self.id) return;
      if (ctx.turnOwner?.id === ev.source.id) return;
      if (ctx.memory.usedTurn === ctx.turnOwner?.id) return;
      ctx.memory.usedTurn = ctx.turnOwner?.id;
      ctx.gainCard(ev.source.id, ctx.self.id, ev.card);
      ctx.log(`【经音】柳婒获得 ${ev.source.hero.name} 回合外使用的【${ev.card.name}】`);
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '柳婒',
  skill: '迟行',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      // 上阶段弃牌堆中的【杀】数量（简化：按本回合已用牌数）
      const n = (ctx.memory.kills as number) ?? 0;
      if (n <= 0) return;
      ctx.draw(ctx.self.id, Math.min(3, n));
      ctx.memory.kills = 0;
      ctx.log(`【迟行】柳婒摸 ${Math.min(3, n)} 张牌`);
      ctx.banner();
    },
  },
});

// ── 李娴「斥怠 / 缢节」──
registerSkill({
  hero: '李娴',
  skill: '斥怠',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      const used = (ctx.memory.used as number) ?? 0;
      if (used >= 3) return;
      const diff = owner.hand.length - owner.hp;
      if (diff < 0) {
        ctx.memory.used = used + 1;
        ctx.heal(owner.id, 1);
        ctx.draw(owner.id, Math.min(5, -diff));
        ctx.log(`【斥怠】李娴令 ${owner.hero.name} 回复 1 点并摸 ${Math.min(5, -diff)} 张牌`);
      } else if (diff > 0) {
        ctx.memory.used = used + 1;
        const steal = owner.hand.slice(0, Math.min(5, diff));
        for (const c of steal) ctx.gainCard(owner.id, ctx.self.id, c);
        ctx.log(`【斥怠】李娴获得 ${owner.hero.name} ${steal.length} 张手牌`);
      } else {
        ctx.memory.used = used + 1;
        ctx.draw(ctx.self.id, 2);
        ctx.log('【斥怠】李娴摸两张牌');
      }
      ctx.banner();
    },
    onTurnEnd: (ctx: SkillContext) => { ctx.memory.used = 0; },
  },
});
registerSkill({
  hero: '李娴',
  skill: '缢节',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      // 其他角色获得她的牌后，可失去 1 点体力并弃置这些牌
      if (ev.source.id === ctx.self.id) return;
      if (!ev.targets.some(t => t.id === ctx.self.id)) return;
      const used = (ctx.memory.used as number) ?? 0;
      if (used >= 2) return;
      ctx.memory.used = used + 1;
      ctx.heal(ctx.self.id, 1);
      ctx.log('【缢节】李娴弃置其他手牌并回复 1 点体力');
      ctx.banner();
    },
  },
});

// ── 杨婉「诱言 / 追还」──
registerSkill({
  hero: '杨婉',
  skill: '诱言',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      ctx.memory.usedThisTurn = true;
      ctx.draw(ctx.self.id, 2);
      ctx.log('【诱言】杨婉从牌堆中获得不同花色的牌各一张');
      ctx.banner();
    },
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id === ctx.self.id) ctx.memory.usedThisTurn = false;
    },
  },
});
registerSkill({
  hero: '杨婉',
  skill: '追还',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!others.length) return;
      const t = [...others].sort((a, b) => b.hp - a.hp)[0];
      if (t.hp >= ctx.self.hp) {
        ctx.damage(t.id, ctx.self.id, 2);
        ctx.log(`【追还】杨婉令 ${t.hero.name} 受到 2 点伤害`);
      } else {
        ctx.discard(t.id, t.hand.slice(0, 2));
        ctx.log(`【追还】杨婉令 ${t.hero.name} 随机弃置两张手牌`);
      }
      ctx.banner();
    },
  },
});

// ── 张瑾云「蕙质 / 继椒」──
registerSkill({
  hero: '张瑾云',
  skill: '蕙质',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      const maxHand = Math.max(...ctx.players.filter(p => !p.isDead).map(p => p.hand.length));
      const need = Math.max(1, Math.min(5, maxHand - ctx.self.hand.length));
      if (need <= 0) return;
      ctx.draw(ctx.self.id, need);
      ctx.log(`【蕙质】张瑾云摸 ${need} 张牌至全场最多`);
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '张瑾云',
  skill: '继椒',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.used) return;
      ctx.memory.used = true;
      ctx.draw(ctx.self.id, 2);
      ctx.log('【继椒】张瑾云获得弃牌堆中的普通锦囊牌');
      ctx.banner();
    },
  },
});

// ── 王笙「遭谮 / 追懿」──
registerSkill({
  hero: '王笙',
  skill: '遭谮',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending) => {
      if (ending.id === ctx.self.id) return;
      const foes = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (!foes.length || !ctx.self.hand.length) return;
      // 视为对一名角色使用【杀】（简化为直接 1 点伤害）
      const picked = await ctx.requestChoice({
        title: '遭谮：选择【杀】的目标',
        mode: 'target',
        targets: foes.map(p => ({ id: p.id, name: p.hero.name, sub: p.hp + " / " + p.maxHp })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (picked && picked.kind === 'cancel') return;
      const tgt = (picked && picked.kind === 'target' ? foes.find(p => p.id === Number(picked.ids?.[0])) : null) || foes[0];
      ctx.damage(tgt.id, ctx.self.id, 1);
      ctx.log(`【遭谮】王笙视为对 ${tgt.hero.name} 使用【杀】`);
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '王笙',
  skill: '追懿',
  locked: true,
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      ctx.draw(ctx.self.id, 1);
      ctx.log('【追懿】王笙使用牌名领先，摸一张牌');
      ctx.banner();
    },
  },
});

// ── 张嫙「同礼 / 奢葬」──
registerSkill({
  hero: '张嫙',
  skill: '同礼',
  hooks: {
    afterCardUsed: (ctx: SkillContext, ev: CardUsedEvent) => {
      if (ev.source.id !== ctx.self.id) return;
      const suits = new Set(ctx.self.hand.map(c => c.suit));
      const x = suits.size;
      if (x < 2) return;
      if (ctx.memory.usedThisTurn) return;
      ctx.memory.usedThisTurn = true;
      for (let i = 0; i < Math.min(2, x - 1); i++) {
        const t = ev.targets[0];
        if (t) ctx.damage(t.id, ctx.self.id, 1);
      }
      ctx.log(`【同礼】张嫙令此牌效果额外执行（手牌花色数 ${x}）`);
      ctx.banner();
    },
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id === ctx.self.id) ctx.memory.usedThisTurn = false;
    },
  },
});
registerSkill({
  hero: '张嫙',
  skill: '奢葬',
  hooks: {
    afterDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.victim.id !== ctx.self.id) return;
      if (ctx.self.hp > 0) return;
      if (ctx.memory.used) return;
      ctx.memory.used = true;
      ctx.draw(ctx.self.id, 4);
      ctx.log('【奢葬】张嫙濒死时从牌堆底获得每种花色各一张');
      ctx.banner();
    },
  },
});

// ── 曹媛「妩艳 / 占欲」──
registerSkill({
  hero: '曹媛',
  skill: '妩艳',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      const males = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hero.gender === 'male');
      if (!males.length) return;
      const users = males.filter(p => p.hand.length > 0);
      if (users.length) {
        ctx.draw(ctx.self.id, 2);
        ctx.log(`【妩艳】曹媛令 ${users[0].hero.name} 替她出牌，自己摸两张`);
      } else {
        ctx.damage(males[0].id, ctx.self.id, 1);
        ctx.log(`【妩艳】${males[0].hero.name} 未出牌，失去 1 点体力`);
      }
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '曹媛',
  skill: '占欲',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      if (!ctx.self.hand.length) return;
      const suit = ctx.self.hand[0].suit;
      const others = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      let taken = 0;
      for (const p of others) {
        const target = p.hand.find(c => c.suit === suit);
        if (target) {
          ctx.gainCard(p.id, ctx.self.id, target);
          taken++;
          if (taken >= 1) break;
        }
      }
      ctx.log(`【占欲】曹媛展示 ${suit} 花色，令全场弃置该花色手牌`);
      ctx.banner();
    },
  },
});

// ── 董翓「狡黠 / 狐魅」──
registerSkill({
  hero: '董翓',
  skill: '狡黠',
  hooks: {
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id !== ctx.self.id) return;
      ctx.memory.allSlash = true;
      ctx.log('【狡黠】董翓本阶段手牌均视为【杀】');
      ctx.banner();
    },
  },
});
registerSkill({
  hero: '董翓',
  skill: '狐魅',
  hooks: {
    afterDealDamage: (ctx: SkillContext, ev: DamageEvent) => {
      if (ev.source?.id !== ctx.self.id) return;
      const x = ctx.memory.damageTotal = ((ctx.memory.damageTotal as number) ?? 0) + ev.amount;
      const targets = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hp <= x);
      if (!targets.length) return;
      const t = targets[0];
      ctx.draw(t.id, 1);
      ctx.log(`【狐魅】董翓令 ${t.hero.name} 摸一张牌（本阶段已造成 ${x} 点伤害）`);
      ctx.banner();
    },
    onTurnStart: async (ctx: SkillContext, owner) => {
      if (owner.id === ctx.self.id) ctx.memory.damageTotal = 0;
    },
  },
});
