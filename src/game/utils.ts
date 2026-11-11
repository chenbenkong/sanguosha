import { CardName, CardType } from '../../types.ts';
import type { Card } from '../../types.ts';
import FULL_CARD_LIST from './fullCardNames.json' with { type: 'json' };

/** 有官方完整卡面的武将名（由 scripts/fetch-cards.mjs 生成，勿手改） */
const FULL_CARD_NAMES = new Set<string>(FULL_CARD_LIST as string[]);

/** Fisher-Yates 洗牌（不改动入参） */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }
  return shuffled;
}

/** 竖幅立绘的 2x 资源路径（与 1x 同目录下的 2x/） */
export const heroPortrait2x = (url: string): string =>
  url.includes('/heroes/') ? url.replace('/heroes/', '/heroes/2x/') : url;

/**
 * 官方完整卡面的资源路径。
 *
 * 卡面自带势力色、勾玉与技能文本，是「原版观感」的唯一来源；
 * 但有 2 名武将（马云禄、蔡贞姬）在图鉴库中没有对应卡面，
 * 因此 fullCardNames 是白名单：不在名单里的一律回落到立绘，
 * 避免出现 404 的破图。
 */
export const heroFullCard = (hero: { name: string; avatarUrl: string }): string | null =>
  FULL_CARD_NAMES.has(hero.name) ? `images/fullcards/${hero.avatarUrl.split('/').pop()}` : null;

/** 完整卡面的 2x 路径（大图查看用） */
export const heroFullCard2x = (hero: { name: string; avatarUrl: string }): string | null => {
  const base = heroFullCard(hero);
  return base ? base.replace('/fullcards/', '/fullcards/2x/') : null;
};

/** 拼点用点数大小 */
export const rankValue = (rank: string): number => {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10) || 0;
};

/** 五谷丰登取牌优先级（数值越小越优先） */
export const wuguKeepPriority = (c: Card): number => {
  switch (c.name) {
    case CardName.TAO: return 0;
    case CardName.WUZHONG: return 1;
    case CardName.SHAN: return 2;
    case CardName.SHA: return 3;
    case CardName.JIU: return 4;
    default: return c.type === CardType.EQUIPMENT ? 6 : 5;
  }
};
