import { registerSkill } from './registry';
import type { SkillContext, DeathEvent } from './registry';
import { EQUIP_META } from '../../../constants';
import { CardType } from '../../../types';
import type { Card, EquipmentSlot, Player } from '../../../types';

/**
 * 第六批女将 · 第 27 组：宣公主「追姬」—— 77 条里的最后一条。
 *
 * 原文（constants.ts）：
 *   追姬  当你死亡时，你可以令一名其他角色随机使用牌堆或弃牌堆中其未装备类别的
 *         装备牌直到无法使用（当其失去以此法使用的装备牌后，废除其对应的装备栏）。
 *
 * 本轮补的原语：
 *   · Player.sealedSlots —— 被废除的装备栏。读取侧**一行都不用改**：废除的栏本来就是
 *     空的，57 处 equipment?.xxx 读它自然读到 undefined；只有「往里放」这条路径要拦，
 *     入口是 equipCard（人类/AI 上装）与 equipCardToZone（追姬直接置入）两处。
 *   · SkillContext.equipCardToZone —— 把一张不在手牌里的装备牌直接放进某角色的装备区。
 *     实现只在 App.tsx 一处，combat.ts 经 CombatDeps 注入（沿用 depsGuard 那条纪律：
 *     历史上同一个 deps 字面量被复制 6 份，改一处漏五处，静默退化成空桩）。
 *   · 失去装备 → 废除栏位：挂在 triggerXiaoji 上。它是两个引擎唯一的「失去装备区的牌」
 *     上报口（combat.ts 的顺走 / 拆掉 / 顶替 / 破甲都调它），所以只守这一处就覆盖全部
 *     失去途径 —— 这正是当初「回血散在 33 处」那个判断的反面案例：先量清楚再动手。
 *
 * 「未装备类别」按四个栏位（武器 / 防具 / -1马 / +1马）逐栏处理：该栏已有装备就跳过，
 * 该栏已废除也跳过；牌从牌堆与弃牌堆里随机取，取不到就跳过。「直到无法使用」= 四栏
 * 都填不动时自然结束。
 */

const SLOT_ORDER: EquipmentSlot[] = ['weapon', 'armor', 'horseMinus', 'horsePlus'];
const SLOT_CN: Record<EquipmentSlot, string> = {
  weapon: '武器', armor: '防具', horseMinus: '－1 马', horsePlus: '＋1 马',
};

const slotOf = (c: Card): EquipmentSlot | undefined => EQUIP_META[c.name]?.slot;

registerSkill({
  hero: '宣公主',
  skill: '追姬',
  hooks: {
    afterDeath: async (ctx, ev: DeathEvent) => {
      // afterDeath 的 ownersOf 带 includeDead=true，所以死者本人能被派发到这里
      if (ev.dead.id !== ctx.self.id) return;
      const candidates = ctx.players.filter(p => !p.isDead && p.id !== ctx.self.id);
      if (candidates.length === 0) return;

      let target: Player | undefined;
      if (ctx.self.isHuman) {
        const r = await ctx.requestChoice({
          title: '追姬：令一名其他角色随机使用装备牌',
          hint: '其未装备类别的装备牌会被使用；失去这些牌后对应装备栏废除',
          mode: 'target',
          targets: candidates.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}` })),
          min: 1, max: 1, cancelLabel: '不发动',
        });
        const id = r && r.kind === 'target' ? r.ids?.[0] : undefined;
        target = candidates.find(p => p.id === id);
      } else {
        // AI：挑装备栏最空的（收益最大），其次体力高的（活得更久，废除的代价更值）
        target = [...candidates].sort((a, b) => {
          const filled = (p: Player) => SLOT_ORDER.filter(s => !!p.equipment?.[s]).length;
          return filled(a) - filled(b) || b.hp - a.hp || a.id - b.id;
        })[0];
      }
      if (!target) return;

      ctx.banner();
      ctx.log(`【追姬】${ctx.self.hero.name} 阵亡，令 ${target.hero.name} 随机使用装备牌`);

      // 牌堆 + 弃牌堆里所有能用的装备牌（按当前快照；每装一张就重新取一次快照，
      // 因为装进去的牌已经离开两个堆了）
      let placed = 0;
      for (const slot of SLOT_ORDER) {
        const live = ctx.players.find(p => p.id === target!.id);
        if (!live || live.isDead) break;
        if (live.equipment?.[slot]) continue;              // 该类别已装备
        if (live.sealedSlots?.includes(slot)) continue;    // 该栏已废除（上一轮追姬留下的）

        const pool = [
          ...ctx.peekDeck(999).filter(c => c.type === CardType.EQUIPMENT && slotOf(c) === slot),
          ...ctx.peekDiscard().filter(c => c.type === CardType.EQUIPMENT && slotOf(c) === slot),
        ];
        if (pool.length === 0) continue;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        // 先从堆里取走，再置入装备区（顺序反了会出现「牌在两个地方」）
        let taken = ctx.takeFromDeck(c => c.id === chosen.id, 1);
        if (taken.length === 0) taken = ctx.takeFromDiscard(c => c.id === chosen.id, 1);
        if (taken.length === 0) continue;
        if (ctx.equipCardToZone(target.id, taken[0])) {
          placed += 1;
          ctx.log(`【追姬】${target.hero.name} 使用【${taken[0].name}】（${SLOT_CN[slot]}栏）`);
        }
      }
      if (placed === 0) ctx.log('【追姬】没有可使用的装备牌，此技能无效果');
      else ctx.log(`【追姬】共置入 ${placed} 张装备牌；其失去这些牌后对应装备栏将被废除`);
    },
  },
});
