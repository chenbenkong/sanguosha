import { describe, expect, test, vi } from 'vitest';
import { CardName, CardType, Suit } from '../types';
import { heroPortrait2x, rankValue, shuffle, wuguKeepPriority } from '../src/game/utils';
import { card } from './helpers';

describe('shuffle', () => {
  test('不修改入参（返回新数组）', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    const out = shuffle(input);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
  });

  test('元素多重集保持不变（不丢不重）', () => {
    const input = Array.from({ length: 200 }, (_, i) => i);
    const out = shuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  test('空数组与单元素数组安全', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['a'])).toEqual(['a']);
  });

  test('对象数组保持引用不变（浅拷贝语义）', () => {
    const a = card({ name: CardName.SHA });
    const b = card({ name: CardName.SHAN });
    const out = shuffle([a, b]);
    expect(new Set(out)).toEqual(new Set([a, b]));
    expect(out[0]).toBe(out[0]);
    expect([a, b]).toContain(out[0]);
  });

  test('Math.random 被钉死后结果可复现', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(shuffle([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
      expect(shuffle([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
    } finally {
      spy.mockRestore();
    }
  });

  test('不同随机种子会产生不同排列（至少一次不同）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(shuffle([1, 2, 3, 4, 5]).join(','));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('rankValue', () => {
  test('J/Q/K/A 映射为 11/12/13/1', () => {
    expect(rankValue('A')).toBe(1);
    expect(rankValue('J')).toBe(11);
    expect(rankValue('Q')).toBe(12);
    expect(rankValue('K')).toBe(13);
  });

  test('数字点数按数值解析（含 10 这种两位）', () => {
    for (let n = 2; n <= 10; n++) expect(rankValue(String(n))).toBe(n);
  });

  test('非法或空字符串返回 0', () => {
    expect(rankValue('')).toBe(0);
    expect(rankValue('X')).toBe(0);
    expect(rankValue('0')).toBe(0);
  });

  test('大小写敏感：小写 j 不识别为 11', () => {
    expect(rankValue('j')).toBe(0);
    expect(rankValue('a')).toBe(0);
  });

  test('拼点大小排序符合预期：A < 2 < … < K', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const values = ranks.map(rankValue);
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe('wuguKeepPriority', () => {
  test('核心牌优先级：桃 0 < 无中 1 < 闪 2 < 杀 3 < 酒 4', () => {
    expect(wuguKeepPriority(card({ name: CardName.TAO }))).toBe(0);
    expect(wuguKeepPriority(card({ name: CardName.WUZHONG }))).toBe(1);
    expect(wuguKeepPriority(card({ name: CardName.SHAN }))).toBe(2);
    expect(wuguKeepPriority(card({ name: CardName.SHA }))).toBe(3);
    expect(wuguKeepPriority(card({ name: CardName.JIU }))).toBe(4);
  });

  test('装备牌优先级 6，高于普通锦囊 5（数值越小越优先）', () => {
    expect(wuguKeepPriority(card({ name: CardName.QINGGANG, type: CardType.EQUIPMENT }))).toBe(6);
    expect(wuguKeepPriority(card({ name: CardName.NANMAN, type: CardType.SCROLL }))).toBe(5);
  });

  test('未列出的基本牌走 default：非装备视为 5', () => {
    expect(wuguKeepPriority(card({ name: CardName.WANJIAN, type: CardType.BASIC }))).toBe(5);
  });

  test('桃的类型误标为装备时仍按牌名返回 0（牌名优先于类型）', () => {
    expect(wuguKeepPriority(card({ name: CardName.TAO, type: CardType.EQUIPMENT }))).toBe(0);
  });

  test('全部 41 种牌名都能返回有限数值', () => {
    for (const name of Object.values(CardName)) {
      const p = wuguKeepPriority(card({ name, type: CardType.SCROLL }));
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('heroPortrait2x', () => {
  test('英雄立绘路径替换为 2x 目录', () => {
    expect(heroPortrait2x('images/heroes/曹操.webp')).toBe('images/heroes/2x/曹操.webp');
  });

  test('不包含 /heroes/ 的路径原样返回', () => {
    expect(heroPortrait2x('images/other/曹操.webp')).toBe('images/other/曹操.webp');
    expect(heroPortrait2x('')).toBe('');
  });

  test('已经是 2x 的路径会再次替换（不做幂等保护）', () => {
    expect(heroPortrait2x('images/heroes/2x/曹操.webp')).toBe('images/heroes/2x/2x/曹操.webp');
  });
});
