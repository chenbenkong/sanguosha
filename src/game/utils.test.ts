import { describe, expect, it } from 'vitest';
import { heroFullCard, heroFullCard2x, heroPortrait2x } from './utils.ts';
import names from './fullCardNames.json' with { type: 'json' };

/**
 * 卡面路径的契约。
 *
 * 这些断言存在的原因是：卡面是**按名字白名单**映射到静态资源的，
 * 名字拼错或漏生成时页面不会报错，只会静默显示立绘或破图——
 * 那是最难在测试里发现的一类回归。
 */
const hero = (name: string) => ({ name, avatarUrl: `images/heroes/${name}.webp` });

describe('官方卡面路径', () => {
  it('白名单里的武将会解析到卡面 1x/2x 路径', () => {
    expect(heroFullCard(hero('曹操'))).toBe('images/fullcards/曹操.webp');
    expect(heroFullCard2x(hero('曹操'))).toBe('images/fullcards/2x/曹操.webp');
  });

  it('无卡面武将返回 null，由调用方回落立绘', () => {
    expect(heroFullCard(hero('马云禄'))).toBeNull();
    expect(heroFullCard2x(hero('马云禄'))).toBeNull();
    expect(heroFullCard(hero('蔡贞姬'))).toBeNull();
  });

  it('白名单非空且不含已知缺卡的两人', () => {
    expect(names.length).toBeGreaterThan(90);
    expect(names).not.toContain('马云禄');
    expect(names).not.toContain('蔡贞姬');
  });

  it('立绘 2x 仍按原规则替换目录', () => {
    expect(heroPortrait2x('images/heroes/曹操.webp')).toBe('images/heroes/2x/曹操.webp');
    expect(heroPortrait2x('images/cards/bagua.webp')).toBe('images/cards/bagua.webp');
  });

  it('白名单里每个武将名都能在一处 heroic 资源上找到对应文件', () => {
    // 名字与文件名一一对应是这个映射成立的前提
    for (const n of names) {
      expect(heroFullCard(hero(n))).toBe(`images/fullcards/${n}.webp`);
    }
  });
});
