import { describe, expect, it } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../../types';
import type { Card, Player } from '../../types';
import {
  handLimitOf, countExemptHandCards, computeDiscardExcess,
  targetProtection, seatDistance, nextAliveTurnIndex,
} from './rules';

/**
 * 老武将的规则测试（迁移前先锁行为）。
 *
 * 这些武将的实现在 App.tsx / combat.ts 里仍是内联硬编码，无法直接测。
 * 但其中一部分**判定逻辑**已经被抽到 rules.ts，可以从这里先锁住，
 * 后续迁移时以这些测试为准绳，确保行为不变。
 */

const mkCard = (o: Partial<Card> = {}): Card => ({
  id: 'c1', name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE, rank: '7', value: 7,
  description: '', imageColor: '', ...o,
});

const P = (name: string, o: Partial<Player> = {}): Player => ({
  id: 0, isHuman: false,
  hero: { id: 'h', name, kingdom: '魏', maxHp: 4, avatarUrl: '', description: '', skillName: '', skillDesc: '', gender: 'male' },
  hp: 4, maxHp: 4, hand: [], identity: Identity.ZHONGCHEN, isDead: false, isRevealed: true, isSelected: false,
  ...o,
} as Player);

describe('手牌上限 handLimitOf', () => {
  it('一般武将按当前体力', () => {
    expect(handLimitOf(P('张飞', { hp: 2, maxHp: 4 }))).toBe(2);
  });

  it('胡金定「怀子」按体力上限计算（受伤不降上限）', () => {
    expect(handLimitOf(P('胡金定', { hp: 1, maxHp: 3 }))).toBe(3);
  });
});

describe('手牌豁免 countExemptHandCards', () => {
  it('普通武将无豁免', () => {
    expect(countExemptHandCards(P('张飞', { hand: [mkCard()] }))).toBe(0);
  });

  it('诸葛果「羽化」：非基本牌不计入上限', () => {
    const p = P('诸葛果', { hand: [
      mkCard({ type: CardType.BASIC }),
      mkCard({ type: CardType.SCROLL }),
      mkCard({ type: CardType.EQUIPMENT }),
    ] });
    expect(countExemptHandCards(p)).toBe(2);
  });

  it('董白「黠慧」：黑色牌不计入上限', () => {
    const p = P('董白', { hand: [
      mkCard({ suit: Suit.SPADE }),
      mkCard({ suit: Suit.CLUB }),
      mkCard({ suit: Suit.HEART }),
    ] });
    expect(countExemptHandCards(p)).toBe(2);
  });

  it('王悦「护关」：被声明花色不计入上限', () => {
    const p = P('王悦', { hand: [
      mkCard({ suit: Suit.HEART }),
      mkCard({ suit: Suit.HEART }),
      mkCard({ suit: Suit.SPADE }),
    ], huguanSuit: Suit.HEART });
    expect(countExemptHandCards(p)).toBe(2);
  });

  it('王悦未声明花色时无豁免', () => {
    const p = P('王悦', { hand: [mkCard({ suit: Suit.HEART })] });
    expect(countExemptHandCards(p)).toBe(0);
  });
});

describe('弃牌张数 computeDiscardExcess', () => {
  it('手牌不超上限时不用弃', () => {
    const p = P('张飞', { hp: 4, hand: [mkCard(), mkCard()] });
    expect(computeDiscardExcess(p)).toBe(0);
  });

  it('超出多少弃多少', () => {
    const p = P('张飞', { hp: 2, hand: [mkCard(), mkCard(), mkCard(), mkCard()] });
    expect(computeDiscardExcess(p)).toBe(2);
  });

  it('豁免抵消超出部分', () => {
    const p = P('董白', {
      hp: 2,
      hand: [mkCard({ suit: Suit.SPADE }), mkCard({ suit: Suit.CLUB }), mkCard()],
    });
    // 3 张手牌，上限 2，黑色豁免 2 → 3-2-2 = -1 → 0
    expect(computeDiscardExcess(p)).toBe(0);
  });

  it('handLimitDelta 参与计算（辛宪英忠鉴 / 才识）', () => {
    const p = P('张飞', { hp: 1, hand: [mkCard(), mkCard()], handLimitDelta: 1 });
    // 2 - 1 - 1 = 0
    expect(computeDiscardExcess(p)).toBe(0);
  });
});

describe('目标保护 targetProtection', () => {
  it('诸葛亮空手时不能被【杀】指定', () => {
    expect(targetProtection(P('诸葛亮', { hand: [] }), CardName.SHA)).toBe('空城');
  });

  it('诸葛亮空手时不能被【决斗】指定', () => {
    expect(targetProtection(P('诸葛亮', { hand: [] }), CardName.JUEDOU)).toBe('空城');
  });

  it('诸葛亮有手牌时不触发空城', () => {
    expect(targetProtection(P('诸葛亮', { hand: [mkCard()] }), CardName.SHA)).toBe(null);
  });

  it('空城不阻挡其他牌（如【过河拆桥】）', () => {
    expect(targetProtection(P('诸葛亮', { hand: [] }), CardName.GUOHE)).toBe(null);
  });

  it('陆逊不能被【顺手牵羊】指定', () => {
    expect(targetProtection(P('陆逊'), CardName.SHUNSHOU)).toBe('谦逊');
  });

  it('陆逊不能被【乐不思蜀】指定', () => {
    expect(targetProtection(P('陆逊'), CardName.LESI)).toBe('谦逊');
  });

  it('谦逊不阻挡【杀】', () => {
    expect(targetProtection(P('陆逊'), CardName.SHA)).toBe(null);
  });

  it('普通武将不受这两种保护', () => {
    expect(targetProtection(P('张飞', { hand: [] }), CardName.SHA)).toBe(null);
    expect(targetProtection(P('张飞'), CardName.SHUNSHOU)).toBe(null);
  });
});

describe('座位距离 seatDistance', () => {
  const players = ['甲', '乙', '丙', '丁', '戊'].map((n, i) => P(n, { id: i }));

  it('环形取短边', () => {
    expect(seatDistance(players, 0, 1)).toBe(1);
    expect(seatDistance(players, 0, 4)).toBe(1); // 环形相邻
  });

  it('马超「马术」距离 -1', () => {
    const withMachao = ['马超', '乙', '丙', '丁', '戊'].map((n, i) => P(n, { id: i }));
    expect(seatDistance(withMachao, 0, 2)).toBe(1); // 2 - 1
  });

  it('马云禄也有马术', () => {
    const withMa = ['马云禄', '乙', '丙', '丁', '戊'].map((n, i) => P(n, { id: i }));
    expect(seatDistance(withMa, 0, 2)).toBe(1);
  });
});

describe('下一位存活角色 nextAliveTurnIndex', () => {
  it('跳过已阵亡的角色', () => {
    const ps = [
      P('甲', { id: 0 }),
      P('乙', { id: 1, isDead: true }),
      P('丙', { id: 2 }),
    ];
    expect(nextAliveTurnIndex(ps, 0)).toBe(2);
  });

  it('环形回到起点', () => {
    const ps = [P('甲', { id: 0 }), P('乙', { id: 1 }) ];
    expect(nextAliveTurnIndex(ps, 1)).toBe(0);
  });

  it('全员阵亡时不死循环（有上限保护）', () => {
    const ps = [P('甲', { id: 0, isDead: true }), P('乙', { id: 1, isDead: true })];
    expect(() => nextAliveTurnIndex(ps, 0)).not.toThrow();
  });
});