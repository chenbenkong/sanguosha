import { beforeEach, describe, expect, it } from 'vitest';
import { registerSkill } from './registry';
import {
  __clearSkillMemory, dispatchDamageBefore, dispatchPlayPhaseBegin, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, Suit } from '../../../types';
import './batch6new19';

/**
 * batch6new19 的行为测试：流年 / 离宫 / 彩翼 / 别君。
 *
 * 这四条都读本地状态（洗牌计数、慧淑数字、转换技状态、本回合以此法获得的牌），
 * 所以测试必须先把状态**走真实路径**造出来，再验结果。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

describe('滕公主「流年」', () => {
  it('正例：本回合牌堆第一次洗牌 → 减体力上限、回复至上限、手牌上限 +10', async () => {
    const tg = P(0, '滕公主', { maxHp: 4, hp: 2 });
    const { deps } = makeHarness([tg]);
    const maxHpCalls: Array<[number, number]> = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    deps.deckShuffleCount = 1;
    await dispatchTurnEnd(deps, tg);
    expect(maxHpCalls).toEqual([[0, -1]]);
    const { dispatchHandLimitBonus } = await import('./dispatch');
    expect(dispatchHandLimitBonus(deps, 0)).toBe(10);
  });

  it('正例：第二次洗牌 → 此后免疫【杀】伤害', async () => {
    const tg = P(0, '滕公主', { maxHp: 4, hp: 4 });
    const { deps } = makeHarness([tg]);
    deps.changeMaxHp = () => {};
    deps.deckShuffleCount = 1;
    await dispatchTurnEnd(deps, tg);
    deps.deckShuffleCount = 2;
    await dispatchTurnEnd(deps, tg);
    const res = await dispatchDamageBefore(deps, {
      victim: tg, source: P(1, '甲'), amount: 1, nature: 'normal', card: mkCard({ name: CardName.SHA }),
    });
    expect(res).toMatchObject({ prevent: true });
  });

  it('反例：本回合没有洗牌 —— 什么都不发生', async () => {
    const tg = P(0, '滕公主', { maxHp: 4, hp: 2 });
    const { deps } = makeHarness([tg]);
    const maxHpCalls: unknown[] = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    deps.deckShuffleCount = 0;
    await dispatchTurnEnd(deps, tg);
    expect(maxHpCalls).toEqual([]);
  });

  it('反例：免疫【杀】之后仍会吃锦囊伤害', async () => {
    const tg = P(0, '滕公主', { maxHp: 4, hp: 4 });
    const { deps } = makeHarness([tg]);
    deps.changeMaxHp = () => {};
    deps.deckShuffleCount = 2;
    await dispatchTurnEnd(deps, tg);
    const res = await dispatchDamageBefore(deps, {
      victim: tg, source: P(1, '甲'), amount: 1, nature: 'normal', card: mkCard({ name: CardName.JUEDOU }),
    });
    expect(res).not.toMatchObject({ prevent: true });
  });
});

describe('全惠解「离宫」', () => {
  const seedHuishu = async (deps: Parameters<typeof dispatchTurnStart>[0], qhj: ReturnType<typeof mkPlayer>, nums: number[]) => {
    let n = 0;
    n += 1;
    registerSkill({
      hero: qhj.hero.name, skill: '__seedhuishu_' + n,
      hooks: { onTurnStart: (ctx) => { ctx.heroMemory.huishu = nums; } },
    });
    await dispatchTurnStart(deps, qhj);
  };

  it('反例：「慧淑」数字没到 5 —— 不觉醒', async () => {
    const qhj = P(0, '全惠解');
    const { deps, fx } = makeHarness([qhj]);
    await seedHuishu(deps, qhj, [4, 4]);
    const maxHpCalls: unknown[] = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    await dispatchTurnStart(deps, qhj);
    expect(maxHpCalls).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('正例：数字到 5 → 加体力上限、回复 1 点、写下「失去慧淑/易数」开关', async () => {
    const qhj = P(0, '全惠解');
    const { deps, fx } = makeHarness([qhj]);
    await seedHuishu(deps, qhj, [5, 1]);
    const maxHpCalls: unknown[] = [];
    deps.changeMaxHp = (pid, d) => { maxHpCalls.push([pid, d]); };
    await dispatchTurnStart(deps, qhj);
    expect(maxHpCalls).toEqual([[0, 1]]);
    expect(fx.healed).toEqual([{ playerId: 0, amount: 1 }]);
    expect(fx.banners).toContain('全惠解:离宫');
  });

  it('反例：觉醒技只发动一次', async () => {
    const qhj = P(0, '全惠解');
    const { deps } = makeHarness([qhj]);
    await seedHuishu(deps, qhj, [5, 1]);
    let calls = 0;
    deps.changeMaxHp = () => { calls += 1; };
    await dispatchTurnStart(deps, qhj);
    await dispatchTurnStart(deps, qhj);
    expect(calls).toBe(1);
  });
});

describe('曹华「彩翼」', () => {
  it('正例：阳状态令一名角色摸 X 张（X=剩余项数 4），然后切换到阴', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ch, a]);
    await dispatchTurnEnd(deps, ch);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 4 }]);
    expect(fx.logs.some(l => l.includes('状态切换为阴'))).toBe(true);
  });

  it('正例：阴状态改为造成伤害，且剩余项数递减', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ch, a]);
    // 第一次（阳）：AI 选「摸牌」→ 移除 draw
    await dispatchTurnEnd(deps, ch);
    // 第二次（阴）：阴阳各自记一份「已移除选项」，所以阴状态的剩余项数仍是 4；
    // 第二次用完切回阳
    await dispatchTurnEnd(deps, ch);
    expect(fx.logs.some(l => l.includes('（阴，剩余 4 项）'))).toBe(true);
    expect(fx.logs.filter(l => l.includes('状态切换')).map(l => l.includes('切换为阳')).length).toBeGreaterThan(0);
  });

  it('反例：不是自己的结束阶段 —— 不发动', async () => {
    const ch = P(0, '曹华');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ch, a]);
    await dispatchTurnEnd(deps, a);
    expect(fx.banners).toEqual([]);
  });
});

describe('李婉「别君」', () => {
  it('正例：其他角色的出牌阶段，其交给李婉一张手牌', async () => {
    const lw = P(0, '李婉');
    const a = P(1, '甲');
    a.hand = [mkCard({ name: CardName.TAO }), mkCard(), mkCard()];
    const { deps, fx } = makeHarness([lw, a]);
    await dispatchTurnStart(deps, a);
    await dispatchPlayPhaseBegin(deps, a);
    expect(fx.logs.some(l => l.includes('别君') && l.includes('交给'))).toBe(true);
  });

  it('反例：自己的出牌阶段 —— 不触发', async () => {
    const lw = P(0, '李婉');
    const { deps, fx } = makeHarness([lw]);
    await dispatchTurnStart(deps, lw);
    await dispatchPlayPhaseBegin(deps, lw);
    expect(fx.logs.some(l => l.includes('别君'))).toBe(false);
  });

  it('正例：手牌里没有本回合以此法获得的牌时，翻面防止伤害', async () => {
    const lw = P(0, '李婉');
    const a = P(1, '甲');
    const { deps } = makeHarness([lw, a]);
    const flipped: Array<[number, boolean]> = [];
    deps.flip = (pid, on) => { flipped.push([pid, on]); };
    await dispatchTurnStart(deps, lw);
    const res = await dispatchDamageBefore(deps, {
      victim: lw, source: a, amount: 2, nature: 'normal', card: undefined,
    });
    expect(res).toMatchObject({ prevent: true });
    expect(flipped).toEqual([[0, true]]);
  });

  it('反例：每回合限一次 —— 第二次不再防止', async () => {
    const lw = P(0, '李婉');
    const a = P(1, '甲');
    const { deps } = makeHarness([lw, a]);
    deps.flip = () => {};
    await dispatchTurnStart(deps, lw);
    const ev = { victim: lw, source: a, amount: 2, nature: 'normal' as const, card: undefined };
    await dispatchDamageBefore(deps, ev);
    const second = await dispatchDamageBefore(deps, ev);
    expect(second).not.toMatchObject({ prevent: true });
  });
});
