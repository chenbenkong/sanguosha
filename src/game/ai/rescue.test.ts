import { afterEach, describe, expect, it, vi } from 'vitest';
import { Identity } from '../../../types';
import { shouldAiSavePlayer } from './rescue';
import type { RescueContext, RescueDifficulty } from './rescue';
import { mkPlayer } from './testFixtures';

const P = (id: number, identity: Identity) => mkPlayer({ id, identity });
const ctx = (difficulty: RescueDifficulty, rebelsAlive = false): RescueContext => ({ difficulty, rebelsAlive });

afterEach(() => vi.restoreAllMocks());

describe('shouldAiSavePlayer：easy 难度（全随机）', () => {
  it('救自己：随机阈值 0.7', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.69);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(0, Identity.FANZEI), ctx('easy'))).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.71);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(0, Identity.FANZEI), ctx('easy'))).toBe(false);
  });

  it('救主公：随机阈值 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.49);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHUGONG), ctx('easy'))).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.51);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHUGONG), ctx('easy'))).toBe(false);
  });

  it('救其他人：随机阈值 0.35', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.34);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.ZHONGCHEN), ctx('easy'))).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.36);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.ZHONGCHEN), ctx('easy'))).toBe(false);
  });

  it('easy 难度忽略阵营（反贼也可能救主公）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHUGONG), ctx('easy'))).toBe(true);
  });
});

describe('shouldAiSavePlayer：hard 难度（确定性）', () => {
  it('救自己总是 true，且不消耗随机数', () => {
    const rnd = vi.spyOn(Math, 'random');
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(0, Identity.FANZEI), ctx('hard'))).toBe(true);
    expect(rnd).not.toHaveBeenCalled();
  });

  it('忠臣救主公/忠臣，不救反贼', () => {
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.ZHUGONG), ctx('hard'))).toBe(true);
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.ZHONGCHEN), ctx('hard'))).toBe(true);
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.FANZEI), ctx('hard'))).toBe(false);
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.NEIJIAN), ctx('hard'))).toBe(false);
  });

  it('主公只救忠臣', () => {
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.ZHONGCHEN), ctx('hard'))).toBe(true);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.FANZEI), ctx('hard'))).toBe(false);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.NEIJIAN), ctx('hard'))).toBe(false);
  });

  it('反贼只救反贼', () => {
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.FANZEI), ctx('hard'))).toBe(true);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHUGONG), ctx('hard'))).toBe(false);
  });

  it('内奸：反贼未清时保主公', () => {
    expect(shouldAiSavePlayer(P(0, Identity.NEIJIAN), P(1, Identity.ZHUGONG), ctx('hard', true))).toBe(true);
  });

  it('内奸：反贼已清空时不再保主公（残局留主公给自己）', () => {
    expect(shouldAiSavePlayer(P(0, Identity.NEIJIAN), P(1, Identity.ZHUGONG), ctx('hard', false))).toBe(false);
  });

  it('内奸救内奸', () => {
    expect(shouldAiSavePlayer(P(0, Identity.NEIJIAN), P(1, Identity.NEIJIAN), ctx('hard', false))).toBe(true);
  });
});

describe('shouldAiSavePlayer：normal 难度（阵营 + 概率）', () => {
  it('反贼不救主公（确定性 false）', () => {
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHUGONG), ctx('normal'))).toBe(false);
  });

  it('反贼救反贼（确定性 true）', () => {
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.FANZEI), ctx('normal'))).toBe(true);
  });

  it('反贼救其他人：随机阈值 0.3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.29);
    expect(shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHONGCHEN), ctx('normal'))).toBe(true);
  });

  it('忠臣救主公（确定性 true）', () => {
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.ZHUGONG), ctx('normal'))).toBe(true);
  });

  it('忠臣救其他人：随机阈值 0.4', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.39);
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.FANZEI), ctx('normal'))).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.41);
    expect(shouldAiSavePlayer(P(0, Identity.ZHONGCHEN), P(1, Identity.FANZEI), ctx('normal'))).toBe(false);
  });

  it('主公救忠臣：随机阈值 0.8（比救其他人更高）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.79);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.ZHONGCHEN), ctx('normal'))).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.81);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.ZHONGCHEN), ctx('normal'))).toBe(false);
  });

  it('主公救反贼：随机阈值 0.3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.29);
    expect(shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.FANZEI), ctx('normal'))).toBe(true);
  });

  it('内奸救任何人：随机阈值 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.49);
    expect(shouldAiSavePlayer(P(0, Identity.NEIJIAN), P(1, Identity.ZHUGONG), ctx('normal'))).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.51);
    expect(shouldAiSavePlayer(P(0, Identity.NEIJIAN), P(1, Identity.ZHUGONG), ctx('normal'))).toBe(false);
  });
});

describe('shouldAiSavePlayer：随机数消耗次数与原实现一致', () => {
  it('normal 确定性分支不消耗随机数', () => {
    const rnd = vi.spyOn(Math, 'random');
    shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHUGONG), ctx('normal'));
    shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.FANZEI), ctx('normal'));
    expect(rnd).not.toHaveBeenCalled();
  });

  it('每一档随机分支只消费一次随机数（保持全局随机序列对齐）', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    shouldAiSavePlayer(P(0, Identity.FANZEI), P(1, Identity.ZHONGCHEN), ctx('normal'));
    expect(rnd).toHaveBeenCalledTimes(1);
    shouldAiSavePlayer(P(0, Identity.ZHUGONG), P(1, Identity.FANZEI), ctx('normal'));
    expect(rnd).toHaveBeenCalledTimes(2);
  });
});
