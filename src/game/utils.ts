import { Card, CardName, CardType } from '../../types';

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
