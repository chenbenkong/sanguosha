import { beforeEach, describe, expect, it } from 'vitest';
import {
  __clearSkillMemory, dispatchAfterDealDamage, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkPlayer } from './testHarness';
import { readFileSync } from 'node:fs';
import './batch6new25';

/**
 * batch6new25 的行为测试：归离。
 *
 * 引擎侧（额外回合的消费与清空）是 App.tsx 主循环的源码级行为，单测覆盖不了，
 * 由源码断言兜底（见文件末）；这里测技能申请的时机与去重。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

describe('曹华「归离」', () => {
  it('正例：首回合绑定 → 约定角色回合结束未造成伤害 → 申请额外回合', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ch, a]);
    await dispatchTurnStart(deps, ch);
    expect(fx.logs.some(l => l.includes('归离') && l.includes('归离之约'))).toBe(true);
    await dispatchTurnEnd(deps, a);
    expect(fx.extraTurns).toEqual([0]);
  });

  it('正例：约定角色本回合造成过伤害 → 不申请', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([ch, a, b]);
    await dispatchTurnStart(deps, ch);
    deps.turnOwner = a;   // 甲的回合里
    await dispatchAfterDealDamage(deps, { victim: b, source: a, amount: 1, nature: 'normal', card: undefined });
    await dispatchTurnEnd(deps, a);
    expect(fx.extraTurns).toEqual([]);
  });

  it('正例：约定角色在**别人的回合**里造成伤害 —— 不算「本回合」，仍然触发', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([ch, a, b]);
    await dispatchTurnStart(deps, ch);
    deps.turnOwner = b;   // 乙的回合里，甲打了回去
    await dispatchAfterDealDamage(deps, { victim: b, source: a, amount: 1, nature: 'normal', card: undefined });
    await dispatchTurnEnd(deps, a);
    expect(fx.extraTurns).toEqual([0]);
  });

  it('正例：每轮的第一个回合才触发 —— 同一轮第二次不触发', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ch, a]);
    await dispatchTurnStart(deps, ch);
    await dispatchTurnEnd(deps, a);
    await dispatchTurnEnd(deps, a);
    expect(fx.extraTurns).toEqual([0]);   // 只申请一次
  });

  it('正例：下一轮可以再次触发', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ch, a], { roundCount: 1 });
    await dispatchTurnStart(deps, ch);
    await dispatchTurnEnd(deps, a);
    deps.roundCount = 2;
    await dispatchTurnEnd(deps, a);
    expect(fx.extraTurns).toEqual([0, 0]);
  });

  it('反例：绑定只发生一次（第二个自己的回合不重选）', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([ch, a, b]);
    await dispatchTurnStart(deps, ch);
    await dispatchTurnStart(deps, ch);
    expect(fx.logs.filter(l => l.includes('归离之约'))).toHaveLength(1);
  });

  it('反例：不是约定角色的回合结束 → 不申请', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([ch, a, b]);
    await dispatchTurnStart(deps, ch);
    await dispatchTurnEnd(deps, b);
    expect(fx.extraTurns).toEqual([]);
  });
});


/**
 * 引擎侧守卫：额外回合的**消费**发生在 App.tsx 主循环，单测跑不到 React 循环，
 * 所以这里钉源码结构。漏了清空会导致每个后续回合都多一回合；
 * 漏了存活检查会让死人行动。
 */
describe('额外回合消费点（App.tsx 源码级）', () => {
  it('主循环在计算下一位时消费 extraTurnRef，读后即清，且只认存活角色', () => {
    const app = readFileSync('App.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(app).toContain('const extraId = extraTurnRef.current;');
    expect(app).toContain('extraTurnRef.current = null;');
    expect(app).toContain('p.id === extraId && !p.isDead');
    // 消费点在 setCheckpoint / setTurnIndex(nextIndex) 之前 —— 额外回合会被存档带走
    const iConsume = app.indexOf('extraTurnRef.current = null;');
    const iCkpt = app.indexOf('setCheckpoint({ turnIndex: nextIndex', iConsume);
    expect(iCkpt).toBeGreaterThan(iConsume);
    // buildSkillDeps 真的把它接到 ref 上
    expect(app).toContain('requestExtraTurn: (pid) => {');
  });
});
