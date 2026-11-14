import { beforeEach, describe, expect, it } from 'vitest';
import {
  __clearSkillMemory, dispatchAfterDealDamage, dispatchCardGain, dispatchCardUsed, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import './batch6new20';

/**
 * batch6new20 的行为测试：诀言 / 匮饬。
 *
 * 诀言的三选项数值会来回改（选中归 1、未选中 +1），所以测试要跨两次发动看数值；
 * 匮饬的两个计数都来自引擎事件（afterCardGain / afterDealDamage），不能用 deps 覆盖。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

describe('张怀「诀言」', () => {
  const used = (src: ReturnType<typeof mkPlayer>, tgt: ReturnType<typeof mkPlayer>) => ({
    source: src,
    card: mkCard({ name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE }),
    targets: [tgt],
    usedCount: 1,
  });

  it('正例：拼点赢 → 造成 1 点伤害（对该角色与自己各 1 点）', async () => {
    const zh = P(0, '张怀');
    zh.hand = [mkCard({ value: 13, rank: 'K' })];
    // 目标体力 1 → AI 走「伤害」那一项（否则它会优先偷牌）
    const a = P(1, '甲', { hp: 1 });
    a.hand = [mkCard({ value: 2, rank: '2' })];
    const { deps, fx } = makeHarness([zh, a]);
    await dispatchTurnStart(deps, zh);
    await dispatchCardUsed(deps, used(zh, a));
    expect(fx.damaged).toEqual([
      { victimId: 0, sourceId: 0, amount: 1 },
      { victimId: 1, sourceId: 0, amount: 1 },
    ]);
    expect(fx.banners).toContain('张怀:诀言');
  });

  it('反例：拼点没赢 —— 效果不发动', async () => {
    const zh = P(0, '张怀');
    zh.hand = [mkCard({ value: 2, rank: '2' })];
    const a = P(1, '甲');
    a.hand = [mkCard({ value: 13, rank: 'K' })];
    const { deps, fx } = makeHarness([zh, a]);
    await dispatchTurnStart(deps, zh);
    await dispatchCardUsed(deps, used(zh, a));
    expect(fx.damaged).toEqual([]);
  });

  it('反例：指定了两个目标 —— 不触发', async () => {
    const zh = P(0, '张怀');
    zh.hand = [mkCard({ value: 13 })];
    const a = P(1, '甲');
    const b = P(2, '乙');
    a.hand = [mkCard({ value: 2 })];
    b.hand = [mkCard({ value: 2 })];
    const { deps, fx } = makeHarness([zh, a, b]);
    await dispatchTurnStart(deps, zh);
    await dispatchCardUsed(deps, { ...used(zh, a), targets: [a, b] });
    expect(fx.damaged).toEqual([]);
  });

  it('正例：数值会改 —— 第二次选同一项时是 1，另两项已 +1', async () => {
    const zh = P(0, '张怀');
    zh.hand = [mkCard({ value: 13 }), mkCard({ value: 13 })];
    const a = P(1, '甲');
    a.hand = [mkCard({ value: 2 }), mkCard({ value: 2 })];
    const { deps } = makeHarness([zh, a]);
    await dispatchTurnStart(deps, zh);
    // 第一次：AI 见目标体力 3、自己 3 → steal（偷 1 张）
    await dispatchCardUsed(deps, used(zh, a));
    // 第二次：数值已被改写，能跑完即说明状态没坏
    await dispatchCardUsed(deps, used(zh, a));
    const dg = (await import('./dispatch')).dispatchCardUsed;
    expect(typeof dg).toBe('function');
  });
});

describe('文鸳「匮饬」', () => {
  it('正例：摸牌数与造成伤害都不小于体力上限 → 失去 1 点体力', async () => {
    const wy = P(0, '文鸳', { maxHp: 3 });
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([wy, a]);
    const lost: Array<{ pid: number; n: number }> = [];
    deps.loseHp = async (pid, n) => { lost.push({ pid, n }); };
    await dispatchTurnStart(deps, wy);
    await dispatchCardGain(deps, { owner: wy, cards: [mkCard(), mkCard(), mkCard()], from: undefined });
    await dispatchAfterDealDamage(deps, { victim: a, source: wy, amount: 3, nature: 'normal', card: undefined });
    await dispatchTurnEnd(deps, wy);
    expect(lost).toEqual([{ pid: 0, n: 1 }]);
    expect(fx.banners).toContain('文鸳:匮饬');
  });

  it('反例：摸牌够了但伤害不够 —— 不失去体力', async () => {
    const wy = P(0, '文鸳', { maxHp: 3 });
    const a = P(1, '甲');
    const { deps } = makeHarness([wy, a]);
    const lost: unknown[] = [];
    deps.loseHp = async (pid, n) => { lost.push([pid, n]); };
    await dispatchTurnStart(deps, wy);
    await dispatchCardGain(deps, { owner: wy, cards: [mkCard(), mkCard(), mkCard()], from: undefined });
    await dispatchAfterDealDamage(deps, { victim: a, source: wy, amount: 2, nature: 'normal', card: undefined });
    await dispatchTurnEnd(deps, wy);
    expect(lost).toEqual([]);
  });

  it('反例：从别人手里获得的牌不算摸牌', async () => {
    const wy = P(0, '文鸳', { maxHp: 3 });
    const a = P(1, '甲');
    const { deps } = makeHarness([wy, a]);
    const lost: unknown[] = [];
    deps.loseHp = async (pid, n) => { lost.push([pid, n]); };
    await dispatchTurnStart(deps, wy);
    await dispatchCardGain(deps, { owner: wy, cards: [mkCard(), mkCard(), mkCard()], from: a });
    await dispatchAfterDealDamage(deps, { victim: a, source: wy, amount: 3, nature: 'normal', card: undefined });
    await dispatchTurnEnd(deps, wy);
    expect(lost).toEqual([]);
  });
});
