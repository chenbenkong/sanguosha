import { describe, expect, it } from 'vitest';
import { getHeroStory } from './heroStory.ts';
import STORY_JSON from './heroStory.json' with { type: 'json' };
import type { Hero } from '../../types';

/**
 * 传记数据与取值的契约。
 *
 * 这些断言存在的原因：heroStory.json 是抓取产物、键名是中文武将名，
 * 名字对不上时页面不会报错、只会静默少一段（或错配到别人的传记），
 * 而「缺传记」必须以 null 表达，否则 UI 会渲染出只有标题的空区块。
 */

/** 取传记只看名字，其余字段与结果无关，用最小对象顶上 */
const heroOf = (name: string): Hero => ({ name } as Hero);

describe('武将传记', () => {
  it('数据条数超过 90，且每条都是非空文本', () => {
    const entries = Object.entries(STORY_JSON);
    expect(entries.length).toBeGreaterThan(90);
    for (const [name, text] of entries) {
      expect(name.trim().length, name).toBeGreaterThan(0);
      expect(typeof text, name).toBe('string');
      expect((text as string).trim().length, name).toBeGreaterThan(0);
    }
  });

  it('随机抽 3 条：getHeroStory 返回非空、长度合理', () => {
    const names = Object.keys(STORY_JSON);
    for (let i = 0; i < 3; i++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const story = getHeroStory(heroOf(name));
      expect(story, name).not.toBeNull();
      const len = (story ?? '').length;
      expect(len, name).toBeGreaterThanOrEqual(40);
      expect(len, name).toBeLessThanOrEqual(800);
    }
  });

  it('无传记的武将返回 null 而不是空串（蔡贞姬）', () => {
    expect(STORY_JSON).not.toHaveProperty('蔡贞姬');
    expect(getHeroStory(heroOf('蔡贞姬'))).toBeNull();
    expect(getHeroStory(heroOf('查无此人'))).toBeNull();
  });
});
