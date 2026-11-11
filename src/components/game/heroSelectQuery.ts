import { Hero } from '../../../types';

/**
 * 选将页的搜索/筛选内核（纯函数，无 React、无 DOM）。
 *
 * 为什么要在这里再算一遍：势力/体力/技能类型的匹配是选将页的 UI 语义，
 * 而 App.tsx 里的 `filteredHeroes` 只做「姓名/技能名包含」，本层不依赖它改写。
 * 组件拿到的 allHeroes 是全量武将，因此这里从全量重算，保证「魏 3」这类
 * 组合条件与分页结果自洽。
 */

/** 每页卡片数：与 App.tsx 的分页步长保持一致（24 = 2/3/4/6/8 列都能整除） */
export const HERO_PAGE_SIZE = 24;

/** 技能类型标签：取自 skillDesc / lordSkillDesc 里官方书写的类型前缀词 */
export const SKILL_TAGS = ['锁定技', '限定技', '觉醒技', '主公技', '使命技', '转换技'] as const;
export type SkillTag = (typeof SKILL_TAGS)[number];

/** 体力关键词：3 / 3血 / 3点 / 3体力 都认 */
const HP_TOKEN = /^(\d{1,2})\s*(?:点)?(?:体力|血|勾玉)?$/;

/** 全角空格归一，统一小写，便于 includes 比较 */
export const normalizeQuery = (raw: string): string => raw.replace(/\u3000/g, ' ').trim().toLowerCase();

/** 空格分隔多关键词（全角空格同样切分） */
export const parseHeroQuery = (raw: string): string[] => normalizeQuery(raw).split(/\s+/).filter(Boolean);

/** 该武将身上出现的技能类型（多个技能时可能不止一个） */
export const heroSkillTags = (h: Hero): SkillTag[] => {
  const text = `${h.skillDesc}${h.lordSkillDesc ?? ''}`;
  return SKILL_TAGS.filter(tag => text.includes(tag));
};

/**
 * 单个关键词是否命中。
 * 优先级：体力数字 > 势力（精确） > 技能类型 > 文本模糊匹配。
 */
export const heroMatchesToken = (h: Hero, token: string): boolean => {
  if (!token) return true;

  const hp = HP_TOKEN.exec(token);
  if (hp) return h.maxHp === Number(hp[1]);

  if (h.kingdom === token) return true;
  if (heroSkillTags(h).some(tag => tag.toLowerCase().includes(token))) return true;

  const haystack = [h.name, h.skillName, h.description, h.lordSkillName ?? '', h.skillDesc, h.lordSkillDesc ?? ''];
  return haystack.some(field => field.toLowerCase().includes(token));
};

/** 多关键词取交集：全部命中才算命中 */
export const heroMatchesTokens = (h: Hero, tokens: string[]): boolean =>
  tokens.every(token => heroMatchesToken(h, token));

/** 关键词为空时原样返回（保持原行为） */
export const filterHeroes = (heroes: Hero[], tokens: string[]): Hero[] =>
  tokens.length === 0 ? heroes : heroes.filter(h => heroMatchesTokens(h, tokens));
