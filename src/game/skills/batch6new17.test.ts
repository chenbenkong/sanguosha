import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  __clearSkillMemory, dispatchAfterDying, dispatchDrawBonus, dispatchDying, dispatchHandLimitBonus, dispatchTurnEnd,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName } from '../../../types';
import './batch6new';      // 「☆ 神威」注册在这里（更早的批次）
import './batch6new17';

/**
 * batch6new17 的行为测试：妆戎 / ☆ 神威 / ☆ 无双 / 殇决 / 纫霜。
 *
 * 两条「觉醒后才该有」的技能（☆ 神威、☆ 无双）都做了门闸验证：
 * 没授予时 drawPhaseBonus = 0；combat.ts 里 isLubuWushuang 认 hasGrantedSkill。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

interface Deps { [k: string]: unknown }

describe('吕玲绮「妆戎」', () => {
  it('正例：回合结束时手牌为 1 → 减体力上限、补满体力与手牌、授予「☆ 神威」「☆ 无双」', async () => {
    const llq = P(0, '吕玲绮', { maxHp: 4, hp: 4 });
    llq.hand = [mkCard()];
    const { deps, fx } = makeHarness([llq]);
    const maxHpCalls: Array<[number, number]> = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    await dispatchTurnEnd(deps, llq);
    expect(maxHpCalls).toEqual([[0, -1]]);
    expect(fx.granted.map(g => g.skill)).toEqual(['☆ 神威', '☆ 无双']);
    // 体力 4 已经高于新上限 3，不回血（「回复至体力上限」不是「回复 1 点」）
    expect(fx.healed).toEqual([]);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 2 }]);     // 手牌 1 → 补到 3
    expect(fx.banners).toContain('吕玲绮:妆戎');
  });

  it('反例：手牌数与体力值都不是 1 —— 不觉醒', async () => {
    const llq = P(0, '吕玲绮', { maxHp: 4, hp: 4 });
    llq.hand = [mkCard(), mkCard()];
    const { deps, fx } = makeHarness([llq]);
    await dispatchTurnEnd(deps, llq);
    expect(fx.granted).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('反例：觉醒技只能发动一次', async () => {
    const llq = P(0, '吕玲绮', { maxHp: 4, hp: 1 });
    const { deps, fx } = makeHarness([llq]);
    deps.changeMaxHp = () => {};
    await dispatchTurnEnd(deps, llq);
    await dispatchTurnEnd(deps, llq);
    expect(fx.granted).toHaveLength(2);
  });
});

describe('吕玲绮「☆ 神威」', () => {
  it('正例：授予后摸牌阶段多摸 2 张、手牌上限 +2', async () => {
    const llq = P(0, '吕玲绮');
    const { deps } = makeHarness([llq]);
    deps.hasGrantedSkill = (_p, n) => n === '☆ 神威';
    expect(dispatchDrawBonus(deps, 0)).toBe(2);
    expect(dispatchHandLimitBonus(deps, 0)).toBe(2);
  });

  it('反例：没有授予（妆戎未觉醒）—— 两个加成都为 0', async () => {
    const llq = P(0, '吕玲绮');
    const { deps } = makeHarness([llq]);
    deps.hasGrantedSkill = () => false;
    expect(dispatchDrawBonus(deps, 0)).toBe(0);
    expect(dispatchHandLimitBonus(deps, 0)).toBe(0);
  });
});

describe('吕玲绮「☆ 无双」', () => {
  it('正例：效果由引擎消费 —— triggerReaction 认「授予的无双」', () => {
    // 这个技能没有自己的钩子，效果全在 combat.ts 的响应链里（【杀】要两张【闪】、
    // 【决斗】要两张【杀】），所以只做源码级断言：一旦有人把它改回写死的
    // hero.name === '吕布'，妆戎把「☆ 无双」授出去又会变成一个不生效的空壳。
    const src = readFileSync('src/game/combat.ts', 'utf8');
    expect(src).toContain("hasGrantedSkill(source, '☆ 无双')");
    expect(src).toContain("hasGrantedSkill(source, '无双')");
  });
});

describe('文鸳「殇决」', () => {
  it('正例：濒死时体力回到 1 点、体力上限+1、获得「☆ 困励」并改写「铿锵」限次', async () => {
    const wy = P(0, '文鸳');
    wy.hp = 0;
    const { deps, fx } = makeHarness([wy]);
    const maxHpCalls: Array<[number, number]> = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    const res = await dispatchDying(deps, { victim: wy, source: undefined, needHp: 1 });
    expect(res).toEqual({ hp: 1 });
    expect(maxHpCalls).toEqual([[0, 1]]);
    expect(fx.granted.map(g => g.skill)).toEqual(['☆ 困励']);
  });

  it('反例：别人进入濒死 —— 不发动', async () => {
    const wy = P(0, '文鸳');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([wy, a]);
    const res = await dispatchDying(deps, { victim: a, source: undefined, needHp: 1 });
    expect(res).toBeNull();
    expect(fx.granted).toEqual([]);
  });
});

describe('任婉「纫霜」', () => {
  it('正例：每轮首次进入濒死 → 体力回到 1 点并加 1 点体力上限；脱濒时复原武将牌并视为使用一张锦囊', async () => {
    const rw = P(0, '任婉');
    rw.hp = 0;
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([rw, a]);
    const maxHpCalls: Array<[number, number]> = [];
    const restored: number[] = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    deps.restoreGeneral = (pid) => { restored.push(pid); };
    const res = await dispatchDying(deps, { victim: rw, source: undefined, needHp: 1 });
    expect(res).toEqual({ hp: 1 });
    expect(maxHpCalls).toEqual([[0, 1]]);
    await dispatchAfterDying(deps, { victim: rw });
    expect(restored).toEqual([0]);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].card).toBe(CardName.WUZHONG);
  });

  it('反例：同一轮第二次进入濒死 —— 不再加体力上限', async () => {
    const rw = P(0, '任婉');
    rw.hp = 0;
    const { deps } = makeHarness([rw]);
    const maxHpCalls: Array<[number, number]> = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    await dispatchDying(deps, { victim: rw, source: undefined, needHp: 1 });
    const second = await dispatchDying(deps, { victim: rw, source: undefined, needHp: 1 });
    expect(second).toBeNull();
    expect(maxHpCalls).toEqual([[0, 1]]);
  });
});
