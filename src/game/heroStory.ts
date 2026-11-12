import type { Hero } from '../../types';
import HERO_STORY_JSON from './heroStory.json' with { type: 'json' };

/**
 * 武将官方传记文本（由 tools/fetch-hero-story.py 抓取，勿手改）。
 *
 * JSON 先收宽成 Record<string, string> 再查：字面量类型下的索引访问会触发
 * TS7053（元素隐式为 any），且键集合随数据更新而变，不该被类型固化
 * ——与 utils.ts 里 fullCardNames 白名单同一写法。
 */
const HERO_STORY = HERO_STORY_JSON as Record<string, string>;

/**
 * 取该武将的官方传记。
 *
 * 没有传记时返回 **null**（不是空串、也不是占位文案）：调用方据此决定
 * 整段不渲染——蔡贞姬这类图鉴缺传的武将不该出现一个只有标题的空区块。
 */
export const getHeroStory = (hero: Hero): string | null => {
  const text = HERO_STORY[hero.name];
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
};
