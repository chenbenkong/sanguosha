import type { Card, Player } from '../../../types';
import { Suit } from '../../../types';

/**
 * 张琪瑛「法箓」的纯判定部分（从 App.tsx 的 hasZhangMark / grantZhangMarks 搬出）。
 *
 * 原 grantZhangMarks 把「判定该拿哪些标记」和「updatePlayer + addLog + 弹技能条」
 * 混在一起；这里只保留判定，执行仍留在 App（涉及 setState 与音效）。
 */

/** 花色 → 法箓标记 */
export const MARK_BY_SUIT: Record<Suit, string> = {
  [Suit.SPADE]: '紫微',
  [Suit.CLUB]: '后土',
  [Suit.HEART]: '玉清',
  [Suit.DIAMOND]: '勾陈',
};

/** 角色是否已持有某枚法箓标记 */
export const hasZhangMark = (p: Player, mark: string): boolean => (p.zhangMarks ?? []).includes(mark);

/**
 * 「法箓」是否可发动：张琪瑛本人 且 技能未被封印/移除 且 存活。
 * skillsEnabled 由调用方注入（App 侧 skillsOn(owner.id)）。
 */
export const canGrantZhangMarks = (owner: Player | null | undefined, skillsEnabled: boolean): boolean =>
  !!owner && !owner.isDead && owner.hero.name === '张琪瑛' && skillsEnabled;

/**
 * 计算这批弃牌会新增哪些标记（不重复、按传入顺序）。
 * 返回的 gained 为空数组即表示“无需发日志、无需更新状态”。
 */
export const zhangMarksFromCards = (
  owned: readonly string[],
  cards: readonly Card[],
): { marks: string[]; gained: string[] } => {
  const marks = [...owned];
  const gained: string[] = [];
  for (const c of cards) {
    const mark = MARK_BY_SUIT[c.suit];
    if (!mark) continue;
    if (!marks.includes(mark)) { marks.push(mark); gained.push(mark); }
  }
  return { marks, gained };
};
