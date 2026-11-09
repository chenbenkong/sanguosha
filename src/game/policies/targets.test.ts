import { describe, expect, it } from 'vitest';
import { nearestOtherPlayer, pickWeakest } from './targets';
import { mkPlayer } from '../ai/testFixtures';

const mk = (id: number, over: { isDead?: boolean; hp?: number } = {}) =>
  mkPlayer({ id, isDead: over.isDead ?? false, hp: over.hp ?? 4 });

describe('nearestOtherPlayer：相邻存活角色', () => {
  it('返回下一名存活角色（按座位顺序）', () => {
    const players = [mk(0), mk(1), mk(2)];
    expect(nearestOtherPlayer(players, 0)?.id).toBe(1);
  });

  it('末尾座位回绕到首位', () => {
    const players = [mk(0), mk(1), mk(2)];
    expect(nearestOtherPlayer(players, 2)?.id).toBe(0);
  });

  it('跳过阵亡角色', () => {
    const players = [mk(0), mk(1, { isDead: true }), mk(2)];
    expect(nearestOtherPlayer(players, 0)?.id).toBe(2);
  });

  it('只有自己一名存活 → null', () => {
    const players = [mk(0), mk(1, { isDead: true })];
    expect(nearestOtherPlayer(players, 0)).toBeNull();
  });

  it('传入不存在的 id → null', () => {
    expect(nearestOtherPlayer([mk(0), mk(1)], 99)).toBeNull();
  });

  it('空数组 → null', () => {
    expect(nearestOtherPlayer([], 0)).toBeNull();
  });

  it('自己已阵亡（不在存活表里）→ null', () => {
    const players = [mk(0, { isDead: true }), mk(1)];
    expect(nearestOtherPlayer(players, 0)).toBeNull();
  });
});

describe('pickWeakest：体力最低者', () => {
  it('返回体力最低的角色', () => {
    const pool = [mk(0, { hp: 4 }), mk(1, { hp: 1 }), mk(2, { hp: 3 })];
    expect(pickWeakest(pool)?.id).toBe(1);
  });

  it('体力相同返回池中靠前者（稳定，不改原顺序）', () => {
    const pool = [mk(0, { hp: 2 }), mk(1, { hp: 2 })];
    expect(pickWeakest(pool)?.id).toBe(0);
  });

  it('空池 → null', () => {
    expect(pickWeakest([])).toBeNull();
  });

  it('不修改传入数组（浅拷贝后排序）', () => {
    const pool = [mk(0, { hp: 4 }), mk(1, { hp: 1 })];
    const snapshot = pool.map(p => p.id);
    pickWeakest(pool);
    expect(pool.map(p => p.id)).toEqual(snapshot);
  });

  it('单元素池返回该元素', () => {
    expect(pickWeakest([mk(7, { hp: 3 })])?.id).toBe(7);
  });
});
