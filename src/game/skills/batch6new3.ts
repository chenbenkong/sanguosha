import { registerSkill } from './registry';
import type { SkillContext, DeathEvent, DyingEvent } from './registry';

/**
 * 第六批女将 · 第三组：**依赖 afterDeath / onDying 两个新钩子**的技能。
 *
 *   afterDeath  —— 有角色阵亡后派发，ev.dead 是阵亡者（自己的阵亡用 self.id === ev.dead.id 判断）
 *   onDying     —— 进入濒死、求桃之前派发，返回 { hp } 表示把体力拉回（引擎据此跳过求桃）
 *
 * 王荣「追德」**没有**在这里实装，原因见文件末尾的说明。
 */

/**
 * 「隅泣」的两个数字，存在 heroMemory.yuqi 里（同武将共享）。
 *
 * 形状与初始值必须与「娴静」（batch6new2.ts）**完全一致**——两个技能改的是同一组数字，
 * 各写一份必然漂移（一边写对象、一边写数组，后发动的那个把状态读废）。
 * 初始 [2, 3] 对应「每回合限两次」与「观看牌堆顶的 3 张牌」。
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

/** 令最小的一个数字 +2（单项不超过 5）；无处可加时返回 -1，否则返回该下标 */
const raiseBy = (nums: number[], amount: number): number => {
  let idx = -1;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] >= YUQI_CAP) continue;
    if (idx < 0 || nums[i] < nums[idx]) idx = i;
  }
  if (idx < 0) return -1;
  nums[idx] = Math.min(YUQI_CAP, nums[idx] + amount);
  return idx;
};

// ── 曹金玉「善身」──────────────────────────────────────
// 当其他角色死亡时，你可以令「隅泣」中的一个数字 +2（单项不能超过 5），
// 然后若你没有对该角色造成过伤害，你回复 1 点体力。
//
// 第二段的效果以 constants.ts:1185 的技能原文为准（「你回复1点体力」），
// 不是摸牌——原文是玩家在游戏里读到的那一份。
//
// 「隅泣」本批未实装，所以两个数字只存进 heroMemory 供其实现后读取：
// 善身 +2 / 娴静 +1 改的是同一份状态，因此用 heroMemory（同武将共享）而不是 memory。
registerSkill({
  hero: '曹金玉',
  skill: '善身',
  hooks: {
    // 「对该角色造成过伤害」需要跨时机记账：死亡事件本身不带伤害史。
    afterDealDamage: (ctx: SkillContext, ev) => {
      if (ev.source?.id !== ctx.self.id) return;
      const ids = (ctx.memory.damagedIds as number[] | undefined) ?? [];
      if (!ids.includes(ev.victim.id)) ctx.memory.damagedIds = [...ids, ev.victim.id];
    },
    afterDeath: async (ctx: SkillContext, ev: DeathEvent) => {
      // 只处理「其他角色」的死亡
      if (ev.dead.id === ctx.self.id) return;
      const nums = yuqiNums(ctx.heroMemory);
      const before = nums.join('/');
      // 两个数字都到顶：+2 无从施加，技能不发动
      if (raiseBy(nums, 2) < 0) return;
      // 与「娴静」一致：选哪个数字 +2 自动取最小者、不弹窗
      // （两个数字对玩家都是纯收益，且「隅泣」尚未实装，提问只会打断节奏）。
      ctx.log('【善身】' + ctx.self.hero.name + ' 令「隅泣」数字 ' + before + ' → ' + nums.join('/'));
      ctx.banner();
      await ctx.delay(300);
      const damagedByMe = ((ctx.memory.damagedIds as number[] | undefined) ?? []).includes(ev.dead.id);
      if (damagedByMe) {
        ctx.log('【善身】' + ctx.self.hero.name + ' 曾对 ' + ev.dead.hero.name + ' 造成过伤害，不回复体力');
        return;
      }
      ctx.heal(ctx.self.id, 1);
      ctx.log('【善身】' + ctx.self.hero.name + ' 未对 ' + ev.dead.hero.name + ' 造成过伤害，回复 1 点体力');
    },
  },
});

// ── 柏灵筠「御心」（限定技）───────────────────────────
// 当其他角色/你进入濒死状态时，你可以令其将体力值回复至与你相同/1 点。
//
// 挂 onDying 而不是 afterDamage：这是引擎里**唯一**能赶在求桃之前救人的时机
// （afterDamage 在求桃流程之后，那时人已经死了）。返回 { hp } 引擎会写到濒死者身上。
// 「限定技」用 memory.used 记住是否已发动——memory 按 (武将, 技能) 隔离，
// 复活/重开一局也不会被别的技能读到。
registerSkill({
  hero: '柏灵筠',
  skill: '御心',
  hooks: {
    onDying: async (ctx: SkillContext, ev: DyingEvent) => {
      if (ctx.memory.used) return null;
      // 其他角色回复至与柏灵筠相同；自己濒死则回复至 1 点
      const selfDying = ev.victim.id === ctx.self.id;
      const target = selfDying ? 1 : ctx.self.hp;
      // 「与你相同」为 0（自己也倒着）时救不回来，不能白白消耗限定技
      if (target <= 0) return null;
      // 已经是该体力值（或更高）：这不是「回复」，不发动
      if (target <= ev.victim.hp) return null;
      const picked = await ctx.requestChoice({
        title: '御心：是否令 ' + ev.victim.hero.name + ' 回复至 ' + target + ' 点体力？',
        hint: '限定技，整局只能发动一次',
        mode: 'choose',
        choices: [
          { id: 'yes', label: '发动（回复至 ' + target + '）' },
          { id: 'no', label: '不发动' },
        ],
        cancelLabel: '不发动',
      });
      // 人类玩家点了「不发动」/ 关掉弹窗；AI 与托管返回 null，走自动分支直接发动
      if (picked && (picked.kind === 'cancel' || picked.id !== 'yes')) return null;
      ctx.memory.used = true;
      ctx.log('【御心】' + ctx.self.hero.name + ' 令 ' + ev.victim.hero.name + ' 将体力值回复至 ' + target + ' 点（限定技已使用）');
      ctx.banner();
      await ctx.delay(400);
      return { hp: target, note: '【御心】' + ev.victim.hero.name + ' 回复至 ' + target + ' 点体力' };
    },
  },
});

// ── 文鸳「☆ 困励」（觉醒技）───────────────────────────
// 当你进入濒死状态时，你将体力回复至 2 点、加 1 点体力上限并失去技能「匮饬」。
//
// 觉醒技是强制的（不是「你可以」），故 locked: true。
// 加体力上限：SkillContext 没有 updatePlayer，但 ctx.self 就是 playersRef.current
// 里的**同一个对象**，引擎在本钩子返回后会 updatePlayer(victimId, { hp }) 提交
// （combat.ts:2042），那次浅拷贝会把这里的 maxHp 一并写回——与「拜假」
// （migrated3.ts:62）、「仁释」（migrated_abilities2.ts:100 的注释）走的是同一条已生效的路径。
registerSkill({
  hero: '文鸳',
  skill: '☆ 困励',
  locked: true,
  hooks: {
    onDying: (ctx: SkillContext, ev: DyingEvent) => {
      // 只在自己濒死时
      if (ev.victim.id !== ctx.self.id) return null;
      if (ctx.memory.awakened) return null;
      if (ev.victim.hp >= 2) return null;
      ctx.memory.awakened = true;
      ctx.self.maxHp += 1;
      // 失去「匮饬」：引擎目前没有「按技能名禁用单个技能」的能力（skillsOn 只到角色粒度），
      // 「匮饬」本身也尚未实装。这里把状态记进共享存储，等它实装时按此标记失效，
      // 而不是假装已经失去。
      ctx.heroMemory.quFushiLost = true;
      ctx.log('【☆ 困励】' + ctx.self.hero.name + ' 觉醒：体力回复至 2 点，体力上限 +1（' + ctx.self.maxHp + '），失去「匮饬」');
      ctx.banner();
      return { hp: 2, note: '【☆ 困励】' + ctx.self.hero.name + ' 觉醒，体力回复至 2 点' };
    },
  },
});

// ── 王荣「追德」——未实装，仍在 skillCoverage.test.ts 的 LEGACY_INLINE 里 ──
// 原文：当你死亡时，你可以令一名其他角色获得四张不同牌名的基本牌。
// 「四张不同牌名」= 杀 / 闪 / 桃 / 酒 各一张（基本牌只有这四种），是**确定的**四种牌。
//
// 阻塞点是引擎能力，不是这个文件：SkillContext 只提供
//   draw(playerId, count)   —— 从牌堆顶摸若干张，无法指定牌名
//   gainCard(from, to, cd)  —— 只能转移一张已存在的牌
//   discard(playerId, cards)
// 牌堆本体（App.tsx 的 deckRef）没有暴露给技能，也没有「按牌名从牌堆/弃牌堆取牌」
// 的接口，更没办法把摸错的牌退回牌堆。
// 因此只能降级成「摸四张」，而那会改变技能语义（原技能给的是确定的四种基本牌，
// 摸四张拿到什么全看牌堆），故不实装、不注册。
//
// 补上任意一项引擎能力后即可实装：
//   a) SkillContext 增加 takeFromDeck(name: CardName, count: number): Card[]
//   b) 或增加 searchDeck(pred: (c: Card) => boolean, count: number): Card[]（含弃牌堆重洗）
