import { registerSkill } from './registry';
import type { SkillContext, CardLostEvent, CardUsedEvent } from './registry';
import { EQUIP_META } from '../../../constants';
import type { Card, Player } from '../../../types';

/**
 * 第六批女将 · 第 2 组（分配 8 个，能忠实落地的 4 个）。
 *
 * 本批只使用 registry.ts 里**已存在**的钩子，未引入任何引擎改动。
 *
 * 已实装：
 *   全惠解「易数」  afterCardLost + heroMemory（「慧淑」数字）
 *   黄舞蝶「伏械」  onTurnEnd + requestChoice + 装备区改写
 *   曹金玉「娴静」  onTurnStart + heroMemory（「隅泣」数字）
 *   李婉  「联对」  afterCardUsed + memory（上一次使用者）
 *
 * 未实装（引擎能力缺失，硬写只会降级语义 —— 它们继续留在
 * skillCoverage.test.ts 的 LEGACY_INLINE 清单里）：
 *   张怀  「劳燕」  需要「一张牌指定目标后」的**结算前**拦截口。
 *                   SkillHooks 没有这个钩子（registry.ts 的 16 个钩子里最接近的是
 *                   afterCardUsed，而它在 combat.ts:1515 的 finally 里、伤害已经
 *                   结算之后才派发），因此「令此牌对其他角色无效」无法生效。
 *                   用 damageBefore 按 AOE 牌名近似是伪实现：方天画戟多目标【杀】、
 *                   借刀等都不在牌名表里，会错杀或漏杀。
 *   马伶俐「花火」  SkillContext 只有 draw / discard / heal / damage / gainCard，
 *                   没有「使用一张牌」的入口（dispatch.ts ctxFor），虚拟牌构造不可用。
 *                   近似成「弃红牌直接造成 1 点火焰伤害」会跳过【闪】响应、仁王盾 /
 *                   仁王 / 藤甲 等一整套用牌流程，属于明确的降级，故不写。
 *   芮姬  「俐影」  触发时机是「获得牌后」，SkillHooks 没有获得牌的钩子；
 *                   afterCardLost 是**失去牌者**的钩子，芮姬获得牌时她自己收不到信号。
 *   芮姬  「妄缘」  需要「随机将牌堆一张牌置于武将牌上」：ctx 没有牌堆访问
 *                   （draw 是唯一入口，且只把牌放进手牌），也没有牌→武将牌区域的搬运口。
 */

/**
 * 取（并在首次调用时初始化）某武将共享存储里的一组数字。
 *
 * 用 heroMemory 而不是 memory：这几个数字属于**同武将的另一个技能**
 * （易数改「慧淑」、娴静改「隅泣」），必须让将来的「慧淑」/「隅泣」
 * 读到同一份状态。memory 是按「武将::技能」隔离的（dispatch.ts memOf）。
 */
const sharedNums = (
  mem: Record<string, unknown>,
  key: string,
  init: number[],
): number[] => {
  const cur = mem[key];
  if (Array.isArray(cur) && cur.length === init.length && cur.every(n => typeof n === 'number')) {
    return cur as number[];
  }
  const fresh = [...init];
  mem[key] = fresh;
  return fresh;
};

/** 令「最小的一个数字」+1，上限 cap；无处可加时返回 -1 */
const bumpSmallest = (nums: number[], cap: number): number => {
  let idx = -1;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] >= cap) continue;
    if (idx < 0 || nums[i] < nums[idx]) idx = i;
  }
  if (idx < 0) return -1;
  nums[idx] += 1;
  return idx;
};

// ── 全惠解「易数」────────────────────────────────────
// 当你于出牌阶段外失去牌后，「慧淑」中最小的一个数字 +2 且最大的一个数字 -1。
//
// 「出牌阶段外」无法精确判定：SkillContext（registry.ts）没有阶段字段，
// 引擎只在阶段边界派发 onTurnStart / onTurnEnd（dispatch.ts），中间没有钩子。
// 这里取**安全子集**——只在「不是自己的回合」时触发：它一定是出牌阶段外，
// 绝不会误触发；代价是自己回合的判定/摸牌/弃牌阶段失去牌时少触发几次。
// 取超集（一律触发）会把手牌当出牌阶段弃牌的情况也算进去，那是错结算，更糟。
//
// 「慧淑」本身未实装（仍在 LEGACY_INLINE），所以这里只是把数字状态放在
// 共享存储里并写战报；等「慧淑」落地即可直接读 heroMemory.huishu。
// 初始值 [2, 2] 对应慧淑的两个数字：摸 2 张、本回合弃置总数大于 2。
registerSkill({
  hero: '全惠解',
  skill: '易数',
  locked: true,
  hooks: {
    afterCardLost: (ctx: SkillContext, ev: CardLostEvent) => {
      // 损失牌者必须是自己（dispatchCardLost 已按 player.id 过滤，这里再守一道）
      if (ev.player.id !== ctx.self.id) return;
      if (ctx.turnOwner && ctx.turnOwner.id === ctx.self.id) return;
      const nums = sharedNums(ctx.heroMemory, 'huishu', [2, 2]);
      const before = nums.join('/');
      // 最小与最大都取自**同一份快照**：这是「+2 且 -1」的字面读法，
      // 也保证了「这次触发总是补最小、削最大」。
      // 若改成「先 +2 再把新的最大值 -1」，一次 +2 可能立刻把自己变成最大值
      // 又被削回去，这次触发就白费了（例如 [3,2] 会净变成 [3,3]）。
      let minI = 0;
      let maxI = 0;
      for (let i = 0; i < nums.length; i++) {
        if (nums[i] < nums[minI]) minI = i;
        if (nums[i] > nums[maxI]) maxI = i;
      }
      nums[minI] += 2;
      // 全部相等时两半落在同一个数字上，净效果 +1。
      nums[maxI] -= 1;
      ctx.log(
        `【易数】全惠解于回合外失去 ${ev.cards.length} 张牌，「慧淑」数字 ${before} → ${nums.join('/')}`,
      );
      ctx.banner();
    },
  },
});

// ── 黄舞蝶「伏械」────────────────────────────────────
// 出牌阶段，你可以弃置一张武器牌或失去一个其他技能，令一名其他角色弃置两张牌。
//
// 两处放宽，都在这里写明：
//  1. 「出牌阶段」没有钩子可用（同「才韵」「复学」的既有做法：挂在自己回合的
//     阶段边界上）。这里选 onTurnEnd —— 出牌阶段的结束点，此时手里的武器牌
//     还没进弃牌阶段，是代价最自然的观察点。
//  2. 「或失去一个其他技能」无法实现：引擎没有「失去某个技能」的 API
//     （技能是否生效由 App 的 skillsOn 决定，ctx 不可写），所以只做弃武器牌分支。
//
// 武器牌既可能在手牌，也可能挂在装备区：两处都收。装备区的牌不占手牌，
// 按「骄矜」（migrated_abilities2.ts）的既有约定直接改写 ctx.self.equipment
// 快照字段，随后由 ctx.discard 的 players 写入一并提交。
registerSkill({
  hero: '黄舞蝶',
  skill: '伏械',
  hooks: {
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      const inHand = ctx.self.hand.filter(c => EQUIP_META[c.name]?.slot === 'weapon');
      const equipped = ctx.self.equipment?.weapon;
      if (!inHand.length && !equipped) return;
      const foes = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id && p.hand.length > 0);
      if (!foes.length) return;

      const costOptions = [
        ...inHand.map(c => ({
          id: 'hand:' + c.id,
          label: `手牌【${c.name}】`,
          desc: '弃置这张武器牌作为代价',
        })),
        ...(equipped
          ? [{
              id: 'equip:' + equipped.id,
              label: `装备区【${equipped.name}】`,
              desc: '弃置装备区的武器牌作为代价',
            }]
          : []),
      ];
      const costPick = await ctx.requestChoice({
        title: '伏械：弃置一张武器牌',
        hint: '令一名其他角色弃置两张牌',
        mode: 'choose',
        choices: costOptions,
        cancelLabel: '不发动',
      });
      if (costPick && costPick.kind === 'cancel') return;
      // AI / 托管：优先弃手牌里的武器，保留已装备的武器
      const costKey = costPick && costPick.kind === 'choose'
        ? String(costPick.id ?? '')
        : costOptions[0].id;
      const fromEquip = costKey.startsWith('equip:');
      const costCard = fromEquip
        ? (equipped && costKey === 'equip:' + equipped.id ? equipped : undefined)
        : inHand.find(c => costKey === 'hand:' + c.id);
      if (!costCard) return;

      const tgtPick = await ctx.requestChoice({
        title: '伏械：选择弃牌的角色',
        hint: '该角色弃置两张牌',
        mode: 'target',
        targets: foes.map(p => ({ id: p.id, name: p.hero.name, sub: `${p.hand.length} 张手牌` })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (tgtPick && tgtPick.kind === 'cancel') return;
      const chosenId = tgtPick && tgtPick.kind === 'target' ? Number(tgtPick.ids?.[0]) : NaN;
      const victim = foes.find(p => p.id === chosenId)
        ?? [...foes].sort((a, b) => b.hand.length - a.hand.length)[0];

      if (fromEquip) {
        const next = { ...(ctx.self.equipment ?? {}) };
        delete next.weapon;
        ctx.self.equipment = next;
      }
      ctx.discard(ctx.self.id, [costCard]);

      // 手牌不足两张时弃到空手为止，不谎报张数
      const drop = Math.min(2, victim.hand.length);
      const taken = victim.hand.slice(0, drop);
      ctx.discard(victim.id, taken);
      ctx.log(
        `【伏械】黄舞蝶弃置${fromEquip ? '装备区的' : '手牌'}【${costCard.name}】，令 ${victim.hero.name} 弃置 ${taken.length} 张牌`,
      );
      ctx.banner();
    },
  },
});

// ── 曹金玉「娴静」────────────────────────────────────
// 准备阶段，你可以令「隅泣」中的一个数字 +1（单项不能超过 5），然后若你未受伤，
// 你再令「隅泣」中的一个数字 +1。
//
// 准备阶段 = 自己回合开始，onTurnStart 的第一个参数正是回合角色（dispatch.ts）。
// 「隅泣」同样未实装，数字存在 heroMemory.yuqi 里；初始 [2, 3] 对应
// 「每回合限两次」与「观看牌堆顶的 3 张牌」。
// 选哪个数字 +1 由这里自动取最小值（不弹窗）：两个数字对玩家都是纯收益，
// 且「隅泣」未实装时提问只会打断出牌节奏。
registerSkill({
  hero: '曹金玉',
  skill: '娴静',
  hooks: {
    onTurnStart: (ctx: SkillContext, owner: Player) => {
      if (owner.id !== ctx.self.id) return;
      const nums = sharedNums(ctx.heroMemory, 'yuqi', [2, 3]);
      const before = nums.join('/');
      if (bumpSmallest(nums, 5) < 0) return;
      // 「未受伤」= 体力已满
      const unhurt = ctx.self.hp >= ctx.self.maxHp;
      const second = unhurt && bumpSmallest(nums, 5) >= 0;
      const why = second ? '（未受伤，再 +1）' : unhurt ? '（未受伤，但已达上限）' : '（已受伤，只 +1）';
      ctx.log(`【娴静】曹金玉令「隅泣」数字 ${before} → ${nums.join('/')}${why}`);
      ctx.banner();
    },
  },
});

// ── 李婉「联对」────────────────────────────────────
// 当一名角色使用牌结算结束后，若其不为上一次使用牌的角色，且这两名角色的
// 其中一名为你，使用牌的角色可以令上一次使用牌的角色摸两张牌。
//
// afterCardUsed 正是在「一张牌结算完成后」派发（combat.ts:1515 的 finally 块）。
// 「上一次使用牌的角色」放 ctx.memory.lastUserId —— 跨回合保留，正是规则语义。
//
// 放宽一处：决策者是**使用牌的角色**。若那正是李婉，就正常提问；若上一次
// 使用牌的是李婉（当前使用者是别人），引擎没有「向非技能拥有者提问」的通道
// （requestChoice 弹的是技能拥有者的面板），这里按引擎既有的 AI/托管自动分支
// 直接采用（视为同意），并在战报里写明。
registerSkill({
  hero: '李婉',
  skill: '联对',
  hooks: {
    afterCardUsed: async (ctx: SkillContext, ev: CardUsedEvent) => {
      const prevId = ctx.memory.lastUserId as number | undefined;
      ctx.memory.lastUserId = ev.source.id;
      if (prevId === undefined || prevId === ev.source.id) return;
      const prev = ctx.players.find(p => p.id === prevId);
      if (!prev || prev.isDead) return;
      const involvesMe = ev.source.id === ctx.self.id || prevId === ctx.self.id;
      if (!involvesMe) return;

      let auto = false;
      if (ev.source.id === ctx.self.id) {
        const picked = await ctx.requestChoice({
          title: '联对：令上一名使用者摸两张牌？',
          hint: `上一次使用牌的是 ${prev.hero.name}`,
          mode: 'choose',
          choices: [
            { id: 'yes', label: `令 ${prev.hero.name} 摸两张牌` },
            { id: 'no', label: '不发动' },
          ],
          cancelLabel: '不发动',
        });
        if (picked && picked.kind === 'cancel') return;
        if (picked && picked.kind === 'choose' && picked.id === 'no') return;
      } else {
        auto = true;
      }
      ctx.draw(prev.id, 2);
      ctx.log(
        `【联对】${ev.source.hero.name} 使用【${ev.card.name}】结算后，令上一次使用牌的 ${prev.hero.name} 摸两张牌${auto ? '（非李婉决策，按自动分支采用）' : ''}`,
      );
      ctx.banner();
    },
  },
});
