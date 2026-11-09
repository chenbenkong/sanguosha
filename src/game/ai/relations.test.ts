import { describe, expect, it } from 'vitest';
import { Identity } from '../../../types';
import { isAlly, isEnemy } from './relations';
import { mkPlayer } from './testFixtures';

const P = (identity: Identity, id = 0) => mkPlayer({ id, identity });

describe('isAlly：同阵营判定', () => {
  it('主公 ↔ 忠臣 互为同盟', () => {
    expect(isAlly(P(Identity.ZHUGONG), P(Identity.ZHONGCHEN, 1))).toBe(true);
    expect(isAlly(P(Identity.ZHONGCHEN), P(Identity.ZHUGONG, 1))).toBe(true);
    expect(isAlly(P(Identity.ZHONGCHEN), P(Identity.ZHONGCHEN, 1))).toBe(true);
  });

  it('反贼之间互为同盟', () => {
    expect(isAlly(P(Identity.FANZEI), P(Identity.FANZEI, 1))).toBe(true);
  });

  it('主忠与反贼不互为同盟', () => {
    expect(isAlly(P(Identity.ZHUGONG), P(Identity.FANZEI, 1))).toBe(false);
    expect(isAlly(P(Identity.FANZEI), P(Identity.ZHONGCHEN, 1))).toBe(false);
  });

  it('内奸对任何人（含自己）都不构成同盟', () => {
    expect(isAlly(P(Identity.NEIJIAN), P(Identity.NEIJIAN, 1))).toBe(false);
    expect(isAlly(P(Identity.NEIJIAN), P(Identity.ZHUGONG, 1))).toBe(false);
    expect(isAlly(P(Identity.ZHUGONG), P(Identity.NEIJIAN, 1))).toBe(false);
    expect(isAlly(P(Identity.FANZEI), P(Identity.NEIJIAN, 1))).toBe(false);
  });
});

describe('isEnemy：敌对判定', () => {
  it('主忠视反贼与内奸为敌', () => {
    expect(isEnemy(P(Identity.ZHUGONG), P(Identity.FANZEI, 1))).toBe(true);
    expect(isEnemy(P(Identity.ZHONGCHEN), P(Identity.NEIJIAN, 1))).toBe(true);
  });

  it('主忠之间不敌对', () => {
    expect(isEnemy(P(Identity.ZHUGONG), P(Identity.ZHONGCHEN, 1))).toBe(false);
  });

  it('反贼视主忠为敌，对反贼与内奸不敌对', () => {
    expect(isEnemy(P(Identity.FANZEI), P(Identity.ZHUGONG, 1))).toBe(true);
    expect(isEnemy(P(Identity.FANZEI), P(Identity.ZHONGCHEN, 1))).toBe(true);
    expect(isEnemy(P(Identity.FANZEI), P(Identity.FANZEI, 1))).toBe(false);
    expect(isEnemy(P(Identity.FANZEI), P(Identity.NEIJIAN, 1))).toBe(false);
  });

  it('内奸视所有非内奸为敌，对同为内奸不敌对', () => {
    expect(isEnemy(P(Identity.NEIJIAN), P(Identity.ZHUGONG, 1))).toBe(true);
    expect(isEnemy(P(Identity.NEIJIAN), P(Identity.FANZEI, 1))).toBe(true);
    expect(isEnemy(P(Identity.NEIJIAN), P(Identity.NEIJIAN, 1))).toBe(false);
  });

  it('敌对关系不对称（内奸被主忠视为敌，但主忠不被内奸……同样视为敌）', () => {
    // 主忠→反贼 敌对；反贼→主忠 也敌对：确认两个方向都覆盖
    expect(isEnemy(P(Identity.ZHUGONG), P(Identity.FANZEI, 1))).toBe(true);
    expect(isEnemy(P(Identity.FANZEI), P(Identity.ZHUGONG, 1))).toBe(true);
  });
});
