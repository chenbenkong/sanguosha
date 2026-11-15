import { registerSkill } from './registry';
import type { SkillContext, PlayPhaseEvent } from './registry';
import { CardName, CardType } from '../../../types';
import type { Card } from '../../../types';

/**
 * 第六批女将 · 第 26 组：吕玲绮「帼武」。
 *
 * 原文（constants.ts）：
 *   帼武  出牌阶段开始时，你可以展示所有手牌，若包含的类别数不小于：
 *         1，你从弃牌堆中获得一张【杀】；
 *         2，你本阶段使用牌无距离限制；
 *         3，你本阶段使用【杀】或普通锦囊牌可以多指定至多两个目标。
 *
 * 本轮补的两个原语：
 *   · setPhaseNoDistance —— 落到 Player.phaseNoDistance，由 App.tsx 的 canReach
 *     单点消费（人类选目标 / AI 选目标 / 虚拟牌都走这一个函数，所以不必逐处打补丁）。
 *   · setExtraTargets —— 落到 Player.extraTargetCount，由 combat.ts 在 targets
 *     最终确定前追加，口径与「蚕食」「福绵」「方天画戟」一致（自动选取攻击范围内
 *     敌方，不额外弹窗）。
 *
 * 三档是**累加**的（原文「不小于」）：手牌含 3 类时三档全给。
 * 「本阶段」的边界由 onPlayPhaseEnd 清除标志来保证 —— 该钩子对「死在出牌阶段中途」
 * 也有补派发路径（App.tsx 的 playPhaseOpenRef 三处出口），所以不会残留到下回合。
 */

const CATEGORY_ORDER = [CardType.BASIC, CardType.SCROLL, CardType.EQUIPMENT];

registerSkill({
  hero: '吕玲绮',
  skill: '帼武',
  hooks: {
    onPlayPhaseBegin: async (ctx, ev: PlayPhaseEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const hand = ctx.self.hand;
      if (hand.length === 0) return;

      const cats = new Set(hand.map(c => c.type));
      const n = cats.size;
      ctx.memory.usedThisTurn = true;
      ctx.banner();
      ctx.log(`【帼武】${ctx.self.hero.name} 展示所有手牌（${n} 个类别）：${hand.map(c => `【${c.name}】`).join('')}`);

      // ① 类别数 ≥ 1：从弃牌堆获得一张【杀】
      if (n >= 1) {
        const got = ctx.takeFromDiscard(c => c.name === CardName.SHA, 1);
        if (got.length > 0) {
          ctx.gainCard(0, ctx.self.id, got[0]);
          ctx.log('【帼武】从弃牌堆获得一张【杀】');
        } else {
          ctx.log('【帼武】弃牌堆没有【杀】，此档无效果');
        }
      }

      // ② 类别数 ≥ 2：本阶段使用牌无距离限制
      if (n >= 2) {
        ctx.setPhaseNoDistance(ctx.self.id, true);
        ctx.log('【帼武】本阶段使用牌无距离限制');
      }

      // ③ 类别数 ≥ 3：本阶段【杀】/普通锦囊可额外指定至多两个目标
      if (n >= 3) {
        ctx.setExtraTargets(ctx.self.id, 2);
        ctx.log('【帼武】本阶段使用【杀】或普通锦囊牌可以多指定至多两个目标');
      }
    },

    onPlayPhaseEnd: (ctx, ev: PlayPhaseEvent) => {
      if (ev.owner.id !== ctx.self.id) return;
      ctx.memory.usedThisTurn = false;
      // 两个阶段态必须在这里收回，否则会漏到下一回合（甚至别的角色）
      ctx.setPhaseNoDistance(ctx.self.id, false);
      ctx.setExtraTargets(ctx.self.id, 0);
    },
  },
});

/** 供测试引用：类别判定顺序（基本/锦囊/装备） */
export const GUOWU_CATEGORIES = CATEGORY_ORDER;
