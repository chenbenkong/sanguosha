import { describe, expect, test } from 'vitest';
import { CardName, CardType, Suit } from '../types';
import { INITIAL_DECK } from '../constants';

const countBy = <T extends string>(items: T[]) =>
  items.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});

const byName = countBy(INITIAL_DECK.map(c => c.name));
const byType = countBy(INITIAL_DECK.map(c => c.type));

describe('INITIAL_DECK 总体结构', () => {
  test('总张数为 161', () => {
    expect(INITIAL_DECK).toHaveLength(161);
  });

  test('id 唯一且形如 card-<n>', () => {
    expect(new Set(INITIAL_DECK.map(c => c.id)).size).toBe(INITIAL_DECK.length);
    for (const c of INITIAL_DECK) expect(c.id).toMatch(/^card-\d+$/);
  });

  test('每张牌都有非空描述与配色（CARD_META / EQUIP_META 无遗漏）', () => {
    for (const c of INITIAL_DECK) {
      expect(c.description, c.name).toBeTruthy();
      expect(c.imageColor, c.name).toBeTruthy();
    }
  });

  test('CardName 里的每一种牌都进入了牌堆（无漏入池）', () => {
    const missing = Object.values(CardName).filter(n => !(n in byName));
    expect(missing).toEqual([]);
  });

  test('花色与点数都是合法值', () => {
    const suits = new Set(Object.values(Suit));
    const validRank = /^(A|[2-9]|10|J|Q|K)$/;
    for (const c of INITIAL_DECK) {
      expect(suits.has(c.suit), `${c.name} suit`).toBe(true);
      expect(c.rank, `${c.name} rank`).toMatch(validRank);
    }
  });
});

describe('按牌型的张数分布', () => {
  test('基本牌 85 / 锦囊牌 52 / 装备牌 24', () => {
    expect(byType[CardType.BASIC]).toBe(85);
    expect(byType[CardType.SCROLL]).toBe(52);
    expect(byType[CardType.EQUIPMENT]).toBe(24);
  });

  test('三类之和等于总张数（没有第四类）', () => {
    expect(byType[CardType.BASIC] + byType[CardType.SCROLL] + byType[CardType.EQUIPMENT]).toBe(161);
    expect(Object.keys(byType)).toHaveLength(3);
  });

  test('【代码与注释不一致】constants.ts:975 写「159 张（装备 22）」，实际 161 张（装备 24）', () => {
    // 以代码为准。差异来源：constants.ts:962-963 已把古锭刀 ♠A、朱雀羽扇 ♦A 入池，
    // 但 :835 与 :975 的注释没同步更新（:835 还说这两张「尚未入池」）。
    const commentTotal = 159;
    const commentEquip = 22;
    expect(INITIAL_DECK).toHaveLength(161);
    expect(byType[CardType.EQUIPMENT]).toBe(24);
    // 差额正好是后补的两张武器
    expect(INITIAL_DECK.length - commentTotal).toBe(2);
    expect(byType[CardType.EQUIPMENT] - commentEquip).toBe(2);
  });
});

describe('基本牌明细', () => {
  test('杀 44 = 普通 30 + 火杀 5 + 雷杀 9', () => {
    const sha = INITIAL_DECK.filter(c => c.name === CardName.SHA);
    expect(sha).toHaveLength(44);
    expect(sha.filter(c => c.attribute === 'fire')).toHaveLength(5);
    expect(sha.filter(c => c.attribute === 'thunder')).toHaveLength(9);
    expect(sha.filter(c => !c.attribute)).toHaveLength(30);
  });

  test('属性杀都是基本牌且牌名仍是杀', () => {
    for (const c of INITIAL_DECK.filter(x => x.attribute)) {
      expect(c.name).toBe(CardName.SHA);
      expect(c.type).toBe(CardType.BASIC);
    }
  });

  test('闪 24（标准 15 + 军争 9）；桃 12（标准 8 + 军争 4）；酒 5', () => {
    expect(byName[CardName.SHAN]).toBe(24);
    expect(byName[CardName.TAO]).toBe(12);
    expect(byName[CardName.JIU]).toBe(5);
  });

  test('基本牌小计 = 杀 44 + 闪 24 + 桃 12 + 酒 5 = 85', () => {
    expect(byName[CardName.SHA] + byName[CardName.SHAN] + byName[CardName.TAO] + byName[CardName.JIU]).toBe(85);
  });

  test('【代码与注释不一致】constants.ts:890 写「杀 30」，实际杀 44（含火杀 5 + 雷杀 9）', () => {
    const commentSha = 30;
    const actualSha = byName[CardName.SHA];
    expect(actualSha).toBe(44);
    const elementSha = INITIAL_DECK.filter(c => c.name === CardName.SHA && c.attribute).length;
    expect(elementSha).toBe(14);
    // 注释只统计了普通杀，没算属性杀
    expect(actualSha - commentSha).toBe(elementSha);
  });

  test('【代码与注释不一致】constants.ts:889 写「基本牌（71）」，实际 85（71 + 14 属性杀）', () => {
    const commentBasic = 71;
    expect(byType[CardType.BASIC]).toBe(85);
    expect(byType[CardType.BASIC] - commentBasic).toBe(14);
  });
});

describe('锦囊牌明细', () => {
  const expected: Array<[CardName, number]> = [
    [CardName.WUZHONG, 8],
    [CardName.WUXIE, 7],
    [CardName.TIESUO, 6],
    [CardName.SHUNSHOU, 5],
    [CardName.GUOHE, 4],
    [CardName.JUEDOU, 3],
    [CardName.NANMAN, 3],
    [CardName.LESI, 3],
    [CardName.HUOGONG, 3],
    [CardName.JIEDAO, 2],
    [CardName.SHANDIAN, 2],
    [CardName.WUGU, 2],
    [CardName.BINGLIANG, 2],
    [CardName.WANJIAN, 1],
    [CardName.TAOYUAN, 1],
  ];

  test.each(expected)('%s 有 %i 张', (name, n) => {
    expect(byName[name]).toBe(n);
  });

  test('15 种锦囊小计为 52', () => {
    const sum = expected.reduce((a, [, n]) => a + n, 0);
    expect(sum).toBe(52);
    expect(byType[CardType.SCROLL]).toBe(52);
  });

  test('锦囊牌不含属性与刺杀标记', () => {
    for (const c of INITIAL_DECK.filter(x => x.type === CardType.SCROLL)) {
      expect(c.attribute).toBeUndefined();
      expect(c.cisha).toBeUndefined();
    }
  });
});

describe('装备牌明细', () => {
  const expected: Array<[CardName, number]> = [
    [CardName.ZHUGE, 2],
    [CardName.BAGUA, 2],
    [CardName.TENGJIA, 2],
    [CardName.QINGGANG, 1],
    [CardName.QINGLONG, 1],
    [CardName.FANGTIAN, 1],
    [CardName.ZHANGBA, 1],
    [CardName.GUANSHI, 1],
    [CardName.CIXIONG, 1],
    [CardName.HANBING, 1],
    [CardName.QILIN, 1],
    [CardName.GUDING, 1],
    [CardName.ZHUQUE, 1],
    [CardName.RENWANG, 1],
    [CardName.BAIYIN, 1],
    [CardName.CHITU, 1],
    [CardName.DAWAN, 1],
    [CardName.ZIXING, 1],
    [CardName.DILU, 1],
    [CardName.JUEYING, 1],
    [CardName.ZHUAHUANG, 1],
  ];

  test.each(expected)('%s 有 %i 张', (name, n) => {
    expect(byName[name]).toBe(n);
  });

  test('21 种装备小计为 24', () => {
    const sum = expected.reduce((a, [, n]) => a + n, 0);
    expect(sum).toBe(24);
    expect(byType[CardType.EQUIPMENT]).toBe(24);
  });

  test('古锭刀与朱雀羽扇确实已入池（注释说「尚未入池」已过期）', () => {
    expect(byName[CardName.GUDING]).toBe(1);
    expect(byName[CardName.ZHUQUE]).toBe(1);
  });

  test('装备牌的花色与点数符合注释（古锭刀 ♠A、朱雀羽扇 ♦A）', () => {
    const guding = INITIAL_DECK.find(c => c.name === CardName.GUDING)!;
    const zhuque = INITIAL_DECK.find(c => c.name === CardName.ZHUQUE)!;
    expect(guding.suit).toBe(Suit.SPADE);
    expect(guding.rank).toBe('A');
    expect(zhuque.suit).toBe(Suit.DIAMOND);
    expect(zhuque.rank).toBe('A');
  });
});

describe('花色分布', () => {
  test('♥43 / ♣40 / ♠39 / ♦39，合计 161', () => {
    const bySuit = countBy(INITIAL_DECK.map(c => c.suit));
    expect(bySuit[Suit.HEART]).toBe(43);
    expect(bySuit[Suit.CLUB]).toBe(40);
    expect(bySuit[Suit.SPADE]).toBe(39);
    expect(bySuit[Suit.DIAMOND]).toBe(39);
    expect(bySuit[Suit.HEART] + bySuit[Suit.CLUB] + bySuit[Suit.SPADE] + bySuit[Suit.DIAMOND]).toBe(161);
  });

  test('四种花色都不为空（不出现整门花色缺失）', () => {
    for (const s of Object.values(Suit)) {
      expect(INITIAL_DECK.filter(c => c.suit === s).length, s).toBeGreaterThan(0);
    }
  });
});

describe('洗牌性质', () => {
  test('111 张带花色点数的牌在牌堆里不是按花色聚簇排序的（已被 shuffle）', () => {
    // 顺序检查：若完全没有洗牌，前 N 张会是同一花色
    const firstThirty = INITIAL_DECK.slice(0, 30).map(c => c.suit);
    expect(new Set(firstThirty).size).toBeGreaterThan(1);
  });

  test('牌堆顺序不等于按 id 递增的原始生成顺序（确认为洗切后的结果）', () => {
    const ids = INITIAL_DECK.map(c => Number(c.id.replace('card-', '')));
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).not.toEqual(sorted);
  });
});
