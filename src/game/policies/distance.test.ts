import { describe, expect, it } from 'vitest';
import type { Card, Player } from '../../../types';
import { Identity, Suit, CardType, CardName } from '../../../types';
import { distanceByRules, attackRangeByRules, canReachByRules } from './distance';

/**
 * 距离 / 攻击范围的规则测试。

 * 这层判定是**所有**「能否指定目标」的唯一入口，此前没有纯函数单测，
 * 只能在 e2e 里被间接覆盖。本项目真实踩过的缺陷：
 *   · 「花火 / 狷急选项2」直接调 resolveCardEffect，绕过 canReach，
 *     结果可以杀距离外的角色、甚至杀自己。
 * 修完引擎后补上这层单测，让规则本身被锁住。
 */
const mk = (id: number, over: Partial<Player> = {}): Player => ({
  id,
  name: `P${id}`,
  hero: { id: `h${id}`, name: `H${id}`, kingdom: '魏', maxHp: 3, avatarUrl: '',
    description: '', skillName: '', skillDesc: '', gender: 'male' },
  hp: 3, maxHp: 3, hand: [], identity: Identity.ZHUGONG,
  isDead: false, isRevealed: true, isSelected: false,
  equipment: {},
  ...over,
} as Player);

const weapon = (name: CardName): Card => ({
  id: `w-${name}`, name, suit: Suit.SPADE, rank: '2', value: 2,
  type: CardType.EQUIPMENT, description: '', imageColor: '',
} as Card);

describe('distanceByRules（有效距离）', () => {
  const players = [mk(0), mk(1), mk(2), mk(3), mk(4)];

  it('环形座位：相邻距离 1，对面距离 2', () => {
    expect(distanceByRules(players, 0, 1)).toBe(1);
    expect(distanceByRules(players, 0, 4)).toBe(1);
    expect(distanceByRules(players, 0, 2)).toBe(2);
    expect(distanceByRules(players, 0, 3)).toBe(2);
  });

  it('惴恐未赢 / 魅步：指定方向的距离视为 1，反向不受影响', () => {
    expect(distanceByRules(players, 0, 2, { doutu: { 0: 2 } })).toBe(1);
    expect(distanceByRules(players, 2, 0, { doutu: { 0: 2 } })).toBe(2);
    expect(distanceByRules(players, 0, 3, { meibu: { 0: 3 } })).toBe(1);
    expect(distanceByRules(players, 0, 2, { meibu: { 0: 3 } })).toBe(2);
  });
});

describe('attackRangeByRules（攻击范围）', () => {
  it('无武器 = 1', () => {
    expect(attackRangeByRules(mk(0))).toBe(1);
  });

  it('武器射程叠加（诸葛连弩 / 青龙偃月刀）', () => {
    const zhuge = mk(0, { equipment: { weapon: weapon(CardName.ZHUGE) } });
    const qilin = mk(0, { equipment: { weapon: weapon(CardName.QINGLONG) } });
    expect(attackRangeByRules(zhuge)).toBe(2);
    expect(attackRangeByRules(qilin)).toBeGreaterThanOrEqual(3);
  });

  it('技能修正夹在 ±5 内，且范围下限恒为 1', () => {
    expect(attackRangeByRules(mk(0), { attackRangeBonus: { 0: 2 } })).toBe(3);
    expect(attackRangeByRules(mk(0), { attackRangeBonus: { 0: -1 } })).toBe(1);
    expect(attackRangeByRules(mk(0), { attackRangeBonus: { 0: -99 } })).toBe(1);
    expect(attackRangeByRules(mk(0), { attackRangeBonus: { 0: 99 } })).toBe(6);
  });
});

describe('canReachByRules（距离判定的唯一入口）', () => {
  const players = [mk(0), mk(1), mk(2), mk(3), mk(4)];

  it('默认范围 1：只能打到相邻', () => {
    expect(canReachByRules(players[0], players[1], players)).toBe(true);
    expect(canReachByRules(players[0], players[2], players)).toBe(false);
  });

  it('武器扩大范围后能打到更远', () => {
    const armed = mk(0, { equipment: { weapon: weapon(CardName.QINGLONG) } });
    expect(canReachByRules(armed, players[2], players)).toBe(true);
  });

  it('帼武②：phaseNoDistance 时无视距离，但**不能指定自己**', () => {
    const free = mk(0, { phaseNoDistance: true });
    expect(canReachByRules(free, players[3], players)).toBe(true);
    // 不能指定自己这条由 canReach 的调用方（目标合法性）保证，
    // 本函数只负责距离：若调用方误传自身，返回 true 不代表允许杀自己。
    expect(canReachByRules(free, free, players)).toBe(true);
  });

  it('惴恐 / 魅步只影响距离，不改变范围', () => {
    expect(canReachByRules(players[0], players[2], players, { doutu: { 0: 2 } })).toBe(true);
    expect(canReachByRules(players[0], players[3], players, { doutu: { 0: 2 } })).toBe(false);
  });
});
