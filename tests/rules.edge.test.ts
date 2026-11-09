import { describe, expect, test } from 'vitest';
import { CardName, CardType, Identity, Suit } from '../types';
import {
  computeDiscardExcess,
  countExemptHandCards,
  evaluateWinnerSide,
  handLimitOf,
  nextAliveTurnIndex,
  seatDistance,
  suddenDeathDamage,
  suddenDeathFromTurn,
  targetProtection,
} from '../src/game/rules';
import { card, hero, player, seats } from './helpers';

const basic = (suit: Suit = Suit.HEART) => card({ type: CardType.BASIC, suit });
const scroll = (suit: Suit = Suit.HEART) => card({ type: CardType.SCROLL, suit });

describe('handLimitOf 边界', () => {
  test('普通武将按当前体力，不按体力上限', () => {
    expect(handLimitOf(player({ hero: hero({ name: '曹操', maxHp: 4 }), hp: 1, maxHp: 4 }))).toBe(1);
  });

  test('胡金定按体力上限（怀子），当前体力为 0 时仍按上限', () => {
    expect(handLimitOf(player({ hero: hero({ name: '胡金定' }), hp: 0, maxHp: 4 }))).toBe(4);
  });

  test('其他武将即便体力上限被主公加成也只取当前体力', () => {
    expect(handLimitOf(player({ hero: hero({ name: '刘备' }), hp: 3, maxHp: 5 }))).toBe(3);
  });
});

describe('countExemptHandCards 边界', () => {
  test('空手牌时所有武将豁免数为 0', () => {
    for (const name of ['诸葛果', '董白', '曹操']) {
      expect(countExemptHandCards(player({ hero: hero({ name }), hand: [] }))).toBe(0);
    }
  });

  test('诸葛果：全为基本牌时豁免 0，全为非基本牌时全额豁免', () => {
    const allBasic = [basic(), basic(), basic()];
    expect(countExemptHandCards(player({ hero: hero({ name: '诸葛果' }), hand: allBasic }))).toBe(0);
    const allNonBasic = [scroll(), card({ type: CardType.EQUIPMENT })];
    expect(countExemptHandCards(player({ hero: hero({ name: '诸葛果' }), hand: allNonBasic }))).toBe(2);
  });

  test('董白：只数黑桃与梅花，红桃方块不豁免', () => {
    const hand = [basic(Suit.SPADE), basic(Suit.CLUB), basic(Suit.HEART), basic(Suit.DIAMOND)];
    expect(countExemptHandCards(player({ hero: hero({ name: '董白' }), hand }))).toBe(2);
  });

  test('董白：锦囊与装备只要花色为黑同样豁免（按花色而非牌型）', () => {
    const hand = [scroll(Suit.SPADE), card({ type: CardType.EQUIPMENT, suit: Suit.CLUB })];
    expect(countExemptHandCards(player({ hero: hero({ name: '董白' }), hand }))).toBe(2);
  });

  test('武将名不匹配时不发生豁免', () => {
    expect(countExemptHandCards(player({ hero: hero({ name: '诸葛' }), hand: [scroll(), scroll()] }))).toBe(0);
  });
});

describe('computeDiscardExcess 边界', () => {
  test('手牌数恰好等于上限时弃 0 张', () => {
    const hand = Array.from({ length: 4 }, () => basic());
    expect(computeDiscardExcess(player({ hero: hero({ name: '曹操' }), hp: 4, hand }))).toBe(0);
  });

  test('永不返回负数（体力高于手牌数时）', () => {
    expect(computeDiscardExcess(player({ hero: hero({ name: '曹操' }), hp: 4, hand: [] }))).toBe(0);
  });

  test('handLimitDelta 为负（忠鉴 -1）时多弃 1 张', () => {
    const hand = Array.from({ length: 4 }, () => basic());
    expect(computeDiscardExcess(player({ hero: hero({ name: '曹操' }), hp: 4, hand, handLimitDelta: -1 }))).toBe(1);
  });

  test('handLimitDelta 缺省视作 0', () => {
    const hand = Array.from({ length: 5 }, () => basic());
    const p = player({ hero: hero({ name: '曹操' }), hp: 4, hand });
    delete (p as { handLimitDelta?: number }).handLimitDelta;
    expect(computeDiscardExcess(p)).toBe(1);
  });

  test('董白黑牌豁免可把弃牌数压到 0', () => {
    const hand = [basic(Suit.SPADE), basic(Suit.CLUB), basic(Suit.SPADE), basic(Suit.SPADE), basic(Suit.CLUB)];
    expect(computeDiscardExcess(player({ hero: hero({ name: '董白' }), hp: 4, hand }))).toBe(0);
  });
});

describe('nextAliveTurnIndex 边界', () => {
  test('空数组返回 0', () => {
    expect(nextAliveTurnIndex([], 0)).toBe(0);
    expect(nextAliveTurnIndex([], 7)).toBe(0);
  });

  test('单人局永远返回自己', () => {
    expect(nextAliveTurnIndex(seats(1), 0)).toBe(0);
  });

  test('全员阵亡且默认 maxSkips=10 时停在确定位置（不会死循环）', () => {
    const allDead = seats(5, () => ({ isDead: true }));
    expect(nextAliveTurnIndex(allDead, 0)).toBe(1);
    expect(nextAliveTurnIndex(allDead, 3)).toBe(4);
  });

  test('maxSkips 限制跳跃次数：跳过 2 人后停下', () => {
    const ps = seats(5, id => ({ isDead: id !== 0 && id !== 3 }));
    // 从 0 出发：1 阵亡、2 阵亡，第 3 次检查遇到 3 存活
    expect(nextAliveTurnIndex(ps, 0)).toBe(3);
    expect(nextAliveTurnIndex(ps, 0, 2)).toBe(3);
    expect(nextAliveTurnIndex(ps, 0, 1)).toBe(2);
  });

  test('7 人局绕圈回到 0', () => {
    expect(nextAliveTurnIndex(seats(7), 6)).toBe(0);
  });

  test('id 与下标不一致时会提前中断并返回下标', () => {
    const weird = [player({ id: 5 }), player({ id: 6 })];
    expect(nextAliveTurnIndex(weird, 0)).toBe(1);
  });
});

describe('seatDistance 边界', () => {
  test('空座位表返回 1', () => {
    expect(seatDistance([], 0, 0)).toBe(1);
  });

  test('5 人局环形短边：0→3 与 0→2 均为 2，0→4 为 1', () => {
    const ps = seats(5);
    expect(seatDistance(ps, 0, 1)).toBe(1);
    expect(seatDistance(ps, 0, 2)).toBe(2);
    expect(seatDistance(ps, 0, 3)).toBe(2);
    expect(seatDistance(ps, 0, 4)).toBe(1);
  });

  test('7 人局环形短边：0→4 走短边为 3', () => {
    const ps = seats(7);
    expect(seatDistance(ps, 0, 4)).toBe(3);
    expect(seatDistance(ps, 0, 6)).toBe(1);
  });

  test('马术对马超与马云禄都生效', () => {
    const maChao = [player({ id: 0, hero: hero({ name: '马超' }) }), ...seats(3).slice(1)];
    expect(seatDistance(maChao, 0, 2)).toBe(1);
    const maYunlu = [player({ id: 0, hero: hero({ name: '马云禄' }) }), ...seats(3).slice(1)];
    expect(seatDistance(maYunlu, 0, 2)).toBe(1);
  });

  test('非马术武将不减距离', () => {
    const ps = seats(5);
    expect(seatDistance(ps, 0, 2)).toBe(2);
  });

  test('进攻马（horseMinus）与马术可叠加，但夹到最低 1', () => {
    const ps = [
      player({ id: 0, hero: hero({ name: '马超' }), equipment: { horseMinus: card({ type: CardType.EQUIPMENT }) } }),
      ...seats(3).slice(1),
    ];
    expect(seatDistance(ps, 0, 2)).toBe(1);
  });

  test('目标防御马 horsePlus 令距离 +1', () => {
    const ps = [
      player({ id: 0 }),
      player({ id: 1 }),
      player({ id: 2, equipment: { horsePlus: card({ type: CardType.EQUIPMENT }) } }),
    ];
    expect(seatDistance(ps, 0, 2)).toBe(2);
  });

  test('防御马与马术互相抵消（5 人局基础距离 2）', () => {
    const ps = [
      player({ id: 0, hero: hero({ name: '马超' }) }),
      player({ id: 1 }),
      player({ id: 2, equipment: { horsePlus: card({ type: CardType.EQUIPMENT }) } }),
      player({ id: 3 }),
      player({ id: 4 }),
    ];
    // min(2, 3) = 2 → 马术 -1 → 1 → 防御马 +1 → 2
    expect(seatDistance(ps, 0, 2)).toBe(2);
    expect(seatDistance(seats(5), 0, 2)).toBe(2);
  });

  test('距离计算是对称的（除装备/技能修正方向不同外，基础环形距离相同）', () => {
    const ps = seats(5);
    for (const [a, b] of [[0, 1], [0, 2], [1, 4], [2, 4]]) {
      expect(seatDistance(ps, a, b)).toBe(seatDistance(ps, b, a));
    }
  });
});

describe('targetProtection 边界', () => {
  test('诸葛亮有手牌时不被空城保护', () => {
    const p = player({ hero: hero({ name: '诸葛亮' }), hand: [basic()] });
    expect(targetProtection(p, CardName.SHA)).toBeNull();
    expect(targetProtection(p, CardName.JUEDOU)).toBeNull();
  });

  test('诸葛亮空手只挡杀与决斗，不挡其他牌', () => {
    const p = player({ hero: hero({ name: '诸葛亮' }), hand: [] });
    for (const name of [CardName.SHA, CardName.JUEDOU]) {
      expect(targetProtection(p, name)).toBe('空城');
    }
    for (const name of [CardName.SHAN, CardName.SHUNSHOU, CardName.GUOHE, CardName.LESI, CardName.WANJIAN]) {
      expect(targetProtection(p, name)).toBeNull();
    }
  });

  test('陆逊谦逊只挡顺手牵羊与乐不思蜀', () => {
    const p = player({ hero: hero({ name: '陆逊' }) });
    expect(targetProtection(p, CardName.SHUNSHOU)).toBe('谦逊');
    expect(targetProtection(p, CardName.LESI)).toBe('谦逊');
    for (const name of [CardName.GUOHE, CardName.SHA, CardName.JUEDOU, CardName.HUOGONG]) {
      expect(targetProtection(p, name)).toBeNull();
    }
  });

  test('陆逊的谦逊与手牌数无关', () => {
    const withHand = player({ hero: hero({ name: '陆逊' }), hand: [basic(), basic()] });
    expect(targetProtection(withHand, CardName.LESI)).toBe('谦逊');
  });

  test('其他武将任何牌都不受保护', () => {
    for (const name of ['曹操', '刘备', '孙权', '董白']) {
      const p = player({ hero: hero({ name }), hand: [] });
      expect(targetProtection(p, CardName.SHA)).toBeNull();
      expect(targetProtection(p, CardName.LESI)).toBeNull();
    }
  });
});

describe('suddenDeath 边界', () => {
  test('0 人局的阈值是 24，负数人数按 0 处理', () => {
    expect(suddenDeathFromTurn(0)).toBe(24);
    expect(suddenDeathFromTurn(-5)).toBe(24);
  });

  test('阈值随人数线性增长（每人 +6）', () => {
    for (const n of [1, 2, 5, 7, 10]) {
      expect(suddenDeathFromTurn(n)).toBe(24 + 6 * n);
      expect(suddenDeathFromTurn(n + 1) - suddenDeathFromTurn(n)).toBe(6);
    }
  });

  test('严格大于阈值才扣体力（临界点不扣）', () => {
    expect(suddenDeathDamage(54, 5)).toBe(0);
    expect(suddenDeathDamage(55, 5)).toBe(1);
    expect(suddenDeathDamage(1000, 5)).toBe(1);
  });

  test('第 0 回合与阈值附近都不扣体力', () => {
    expect(suddenDeathDamage(0, 0)).toBe(0);
    expect(suddenDeathDamage(24, 0)).toBe(0);
    expect(suddenDeathDamage(25, 0)).toBe(1);
  });
});

describe('evaluateWinnerSide 边界', () => {
  test('空座位表（0 人存活/无主公）返回 null', () => {
    expect(evaluateWinnerSide([])).toBeNull();
  });

  test('没有主公身份时返回 null', () => {
    expect(evaluateWinnerSide([player({ id: 0, identity: Identity.ZHONGCHEN })])).toBeNull();
    expect(evaluateWinnerSide([player({ id: 0, identity: Identity.FANZEI }), player({ id: 1, identity: Identity.FANZEI })])).toBeNull();
  });

  test('主公存活 + 反贼存活 → null', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG }),
      player({ id: 1, identity: Identity.FANZEI }),
    ];
    expect(evaluateWinnerSide(ps)).toBeNull();
  });

  test('主公存活 + 内奸存活（反贼已清）→ null', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG }),
      player({ id: 1, identity: Identity.FANZEI, isDead: true }),
      player({ id: 2, identity: Identity.NEIJIAN }),
    ];
    expect(evaluateWinnerSide(ps)).toBeNull();
  });

  test('主公存活 + 反贼内奸全灭（只剩忠臣）→ 主忠胜', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG }),
      player({ id: 1, identity: Identity.FANZEI, isDead: true }),
      player({ id: 2, identity: Identity.NEIJIAN, isDead: true }),
      player({ id: 3, identity: Identity.ZHONGCHEN }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('lord');
  });

  test('主公存活 + 全灭（主公自己也是唯一活人）→ 主忠胜', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG }),
      player({ id: 1, identity: Identity.FANZEI, isDead: true }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('lord');
  });

  test('主公阵亡 + 反贼存活 → 反贼胜（哪怕只剩忠臣）', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
      player({ id: 1, identity: Identity.FANZEI }),
      player({ id: 2, identity: Identity.ZHONGCHEN }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('rebel');
  });

  test('主公阵亡 + 内奸独活 → 内奸胜', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
      player({ id: 1, identity: Identity.FANZEI, isDead: true }),
      player({ id: 2, identity: Identity.ZHONGCHEN, isDead: true }),
      player({ id: 3, identity: Identity.NEIJIAN }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('spy');
  });

  test('主公阵亡 + 内奸与忠臣都活 → 反贼胜（内奸未独活）', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
      player({ id: 1, identity: Identity.NEIJIAN }),
      player({ id: 2, identity: Identity.ZHONGCHEN }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('rebel');
  });

  test('主公阵亡 + 内奸与反贼都活 → 反贼胜（优先判反贼）', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
      player({ id: 1, identity: Identity.NEIJIAN }),
      player({ id: 2, identity: Identity.FANZEI }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('rebel');
  });

  test('主公阵亡 + 反贼内奸全灭 → 主忠胜', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
      player({ id: 1, identity: Identity.FANZEI, isDead: true }),
      player({ id: 2, identity: Identity.NEIJIAN, isDead: true }),
      player({ id: 3, identity: Identity.ZHONGCHEN }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('lord');
  });

  test('全员阵亡 → 主忠胜（不死锁）', () => {
    const ps = seats(5, id => ({ isDead: true, identity: id === 0 ? Identity.ZHUGONG : Identity.FANZEI }));
    expect(evaluateWinnerSide(ps)).toBe('lord');
  });

  test('只取第一个主公身份，多余主公不参与判定', () => {
    const ps = [
      player({ id: 0, identity: Identity.ZHUGONG }),
      player({ id: 1, identity: Identity.ZHUGONG }),
      player({ id: 2, identity: Identity.FANZEI, isDead: true }),
    ];
    expect(evaluateWinnerSide(ps)).toBe('lord');
  });
});
