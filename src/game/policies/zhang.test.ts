import { describe, expect, it } from 'vitest';
import { CardName, Suit } from '../../../types';
import { MARK_BY_SUIT, canGrantZhangMarks, hasZhangMark, zhangMarksFromCards } from './zhang';
import { mkCard, mkHero, mkPlayer } from '../ai/testFixtures';

const 张 = (over: Parameters<typeof mkPlayer>[0] extends infer T ? Partial<T> : never = {}) =>
  mkPlayer({ id: 0, hero: mkHero('张琪瑛'), ...(over as object) });

describe('hasZhangMark', () => {
  it('持有指定标记 → true', () => {
    expect(hasZhangMark(mkPlayer({ id: 0, zhangMarks: ['紫微', '后土'] }), '紫微')).toBe(true);
  });

  it('不持有 → false', () => {
    expect(hasZhangMark(mkPlayer({ id: 0, zhangMarks: ['紫微'] }), '勾陈')).toBe(false);
  });

  it('zhangMarks 未定义 → false（?? 兜底）', () => {
    expect(hasZhangMark(mkPlayer({ id: 0 }), '紫微')).toBe(false);
  });
});

describe('canGrantZhangMarks：法箓可发动条件', () => {
  it('张琪瑛存活且技能生效 → true', () => {
    expect(canGrantZhangMarks(张(), true)).toBe(true);
  });

  it('技能被封印/武将移除（skillsEnabled=false）→ false', () => {
    expect(canGrantZhangMarks(张(), false)).toBe(false);
  });

  it('非张琪瑛 → false', () => {
    expect(canGrantZhangMarks(mkPlayer({ id: 0, hero: mkHero('孙权') }), true)).toBe(false);
  });

  it('张琪瑛已阵亡 → false', () => {
    expect(canGrantZhangMarks(张({ isDead: true }), true)).toBe(false);
  });

  it('owner 为 null/undefined → false（防御调用方取不到人）', () => {
    expect(canGrantZhangMarks(null, true)).toBe(false);
    expect(canGrantZhangMarks(undefined, true)).toBe(false);
  });
});

describe('zhangMarksFromCards：花色 → 标记', () => {
  it('四种花色各得一枚对应标记', () => {
    const { marks, gained } = zhangMarksFromCards([], [
      mkCard(CardName.SHA, Suit.SPADE, 'a'),
      mkCard(CardName.SHA, Suit.CLUB, 'b'),
      mkCard(CardName.SHA, Suit.HEART, 'c'),
      mkCard(CardName.SHA, Suit.DIAMOND, 'd'),
    ]);
    expect(gained).toEqual(['紫微', '后土', '玉清', '勾陈']);
    expect(marks).toHaveLength(4);
  });

  it('同花色多张只记一枚（不重复）', () => {
    const { gained } = zhangMarksFromCards([], [
      mkCard(CardName.SHA, Suit.SPADE, 'a'),
      mkCard(CardName.SHAN, Suit.SPADE, 'b'),
    ]);
    expect(gained).toEqual(['紫微']);
  });

  it('已持有的标记不再重复获得', () => {
    const { gained, marks } = zhangMarksFromCards(['紫微'], [mkCard(CardName.SHA, Suit.SPADE, 'a')]);
    expect(gained).toEqual([]);
    expect(marks).toEqual(['紫微']);
  });

  it('空牌列表 → gained 为空（调用方据此跳过日志与状态更新）', () => {
    const { gained } = zhangMarksFromCards([], []);
    expect(gained).toEqual([]);
  });

  it('保留原有标记顺序，新标记追加在后', () => {
    const { marks } = zhangMarksFromCards(['勾陈'], [mkCard(CardName.SHA, Suit.HEART, 'a')]);
    expect(marks).toEqual(['勾陈', '玉清']);
  });

  it('不修改传入的 owned 数组', () => {
    const owned = ['紫微'];
    zhangMarksFromCards(owned, [mkCard(CardName.SHA, Suit.HEART, 'a')]);
    expect(owned).toEqual(['紫微']);
  });

  it('MARK_BY_SUIT 覆盖全部四种花色', () => {
    expect(Object.keys(MARK_BY_SUIT).sort()).toEqual([Suit.SPADE, Suit.CLUB, Suit.HEART, Suit.DIAMOND].sort());
  });
});
