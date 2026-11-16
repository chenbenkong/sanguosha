import type { Player } from '../../../types';

/**
 * 技能提问该不该弹给人类玩家。
 *
 * 背景（玩家报的真缺陷）：「为什么其他 AI 玩家的技能，需要我来确认？」
 *
 * 技能注册表里的 `ctx.requestChoice` 会带上 `askerId`（技能拥有者）。判断分两种情况：
 *   · 拥有者是**人类** → 该由人类决定，弹窗；
 *   · 拥有者是 **AI** → 由 AI 自己决定，**绝不弹窗**（返回 null，技能走自动分支）；
 *   · `askerId` 缺省（非技能注册表来源的内联技能，它们各自已判过 isHuman）→ 沿用旧行为。
 *
 * 托管（isAiTakeover）时人类也交给 AI，一律不弹。
 */
export const shouldPromptSkillChoice = (
  askerId: number | undefined,
  players: readonly Player[],
  isAiTakeover: boolean,
): boolean => {
  if (isAiTakeover) return false;
  if (askerId == null) return true;
  const asker = players.find(p => p.id === askerId);
  // 找不到拥有者（数据异常）时保守放行：宁可多问一次，也不要让技能卡死。
  return asker ? asker.isHuman : true;
};
