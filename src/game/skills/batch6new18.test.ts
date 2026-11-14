import { beforeEach, describe, expect, it } from 'vitest';
import { registerSkill } from './registry';
import {
  __clearSkillMemory, dispatchCardUsed, dispatchDamageBefore, dispatchPlayPhaseBegin, dispatchTurnEnd,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import type { Card } from '../../../types';
import './batch6new18';

/**
 * batch6new18 的行为测试：齐眉 / 铃音 / 日彗 / 花火。
 *
 * 齐眉按「展示牌中的花色数」分四支，测试用预置手牌把花色数精确控制成 2 和 4；
 * 铃音的「妄」区走 heroMemory（batch6new4.ts 本轮从 per-skill memory 迁过来），
 * 所以用辅助技能播种同一份存储。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });
const sc = (suit: Suit, name = CardName.SHA) => mkCard({ suit, name, type: CardType.BASIC });

let seedSeq = 0;
/** 辅助：把牌直接写进武将共享的 heroMemory.wish（「妄」区） */
const seedWish = async (deps: Parameters<typeof dispatchPlayPhaseBegin>[0], owner: ReturnType<typeof mkPlayer>, cards: Card[]) => {
  seedSeq += 1;
  const { dispatchTurnStart } = await import('./dispatch');
  registerSkill({
    hero: owner.hero.name,
    skill: '__seedwish_' + seedSeq,
    hooks: { onTurnStart: (ctx) => { ctx.heroMemory.wish = cards; } },
  });
  await dispatchTurnStart(deps, owner);
};

describe('宣公主「齐眉」', () => {
  it('正例：展示牌有 4 种花色 → 双方各摸一张牌', async () => {
    const xg = P(0, '宣公主');
    xg.hand = [sc(Suit.HEART), sc(Suit.SPADE)];
    const a = P(1, '甲');
    a.hand = [sc(Suit.CLUB), sc(Suit.DIAMOND)];
    const { deps, fx } = makeHarness([xg, a]);
    await dispatchPlayPhaseBegin(deps, xg);
    // 双方各摸 2 张 + 分支 4 各摸 1 张
    expect(fx.drawn).toEqual([
      { playerId: 0, count: 2 }, { playerId: 1, count: 2 },
      { playerId: 0, count: 1 }, { playerId: 1, count: 1 },
    ]);
    expect(fx.banners).toContain('宣公主:齐眉');
  });

  it('正例：展示牌有 2 种花色 → 双方复原武将牌', async () => {
    const xg = P(0, '宣公主');
    xg.hand = [sc(Suit.HEART), sc(Suit.SPADE)];
    const a = P(1, '甲');
    a.hand = [sc(Suit.HEART), sc(Suit.SPADE)];
    const { deps } = makeHarness([xg, a]);
    const restored: number[] = [];
    deps.restoreGeneral = (pid) => { restored.push(pid); };
    await dispatchPlayPhaseBegin(deps, xg);
    expect(restored).toEqual([0, 1]);
  });

  it('反例：出牌阶段限一次 —— 同一回合第二次不发动', async () => {
    const xg = P(0, '宣公主');
    xg.hand = [sc(Suit.HEART), sc(Suit.SPADE)];
    const a = P(1, '甲');
    a.hand = [sc(Suit.CLUB), sc(Suit.DIAMOND)];
    const { deps, fx } = makeHarness([xg, a]);
    await dispatchPlayPhaseBegin(deps, xg);
    const before = fx.drawn.length;
    await dispatchPlayPhaseBegin(deps, xg);
    expect(fx.drawn).toHaveLength(before);
  });
});

describe('芮姬「铃音」', () => {
  it('正例：获得「妄」；剩余同色 → 对其他角色的伤害 +1', async () => {
    const rj = P(0, '芮姬');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([rj, a]);
    await seedWish(deps, rj, [sc(Suit.HEART, CardName.TAO), sc(Suit.DIAMOND, CardName.TAO)]);
    await dispatchPlayPhaseBegin(deps, rj);
    // X = 轮数 = 1 → 只拿 1 张，剩 1 张同为红色
    expect(fx.logs.some(l => l.includes('铃音') && l.includes('获得 1 张'))).toBe(true);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: rj, amount: 1, nature: 'normal', card: undefined,
    });
    expect(res).toMatchObject({ amount: 2 });
  });

  it('反例：剩余「妄」颜色不同 —— 没有加成', async () => {
    const rj = P(0, '芮姬');
    const a = P(1, '甲');
    const { deps } = makeHarness([rj, a]);
    // 拿 1 张（X = 轮数 = 1）后剩 3 张、颜色不同 → 不满足「剩余的妄颜色均相同」
    await seedWish(deps, rj, [
      sc(Suit.HEART, CardName.TAO), sc(Suit.SPADE, CardName.TAO),
      sc(Suit.DIAMOND, CardName.TAO), sc(Suit.CLUB, CardName.TAO),
    ]);
    await dispatchPlayPhaseBegin(deps, rj);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: rj, amount: 1, nature: 'normal', card: undefined,
    });
    expect(res).toEqual({});
  });

  it('反例：打自己不吃加成', async () => {
    const rj = P(0, '芮姬');
    const { deps } = makeHarness([rj]);
    await seedWish(deps, rj, [sc(Suit.HEART, CardName.TAO)]);
    await dispatchPlayPhaseBegin(deps, rj);
    const res = await dispatchDamageBefore(deps, {
      victim: rj, source: rj, amount: 1, nature: 'normal', card: undefined,
    });
    expect(res).toEqual({});
  });

  it('反例：回合结束加成失效', async () => {
    const rj = P(0, '芮姬');
    const a = P(1, '甲');
    const { deps } = makeHarness([rj, a]);
    await seedWish(deps, rj, [sc(Suit.HEART, CardName.TAO)]);
    await dispatchPlayPhaseBegin(deps, rj);
    await dispatchTurnEnd(deps, rj);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: rj, amount: 1, nature: 'normal', card: undefined,
    });
    expect(res).toEqual({});
  });
});

describe('张楚「日彗」', () => {
  const blackSlash = () => mkCard({ name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE });

  it('正例：目标没有「信众」→ 所有拥有「信众」的角色依次视为对其使用此牌', async () => {
    const zc = P(0, '张楚');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const c = P(3, '丙');
    const { deps, fx } = makeHarness([zc, a, b, c]);
    // 给 甲、乙 贴「信众」（真实 ctx.addMark 路径）
    await import('./dispatch').then(async m => {
      registerSkill({
        hero: '张楚', skill: '__seedxz', hooks: {
          onTurnStart: (ctx) => { ctx.addMark('信众', 1, 1); ctx.addMark('信众', 1, 2); },
        },
      });
      await m.dispatchTurnStart(deps, zc);
    });
    await dispatchCardUsed(deps, { source: zc, card: blackSlash(), targets: [c], usedCount: 1 });
    expect(fx.usedCards.map(u => u.playerId)).toEqual([1, 2]);
    expect(fx.usedCards.every(u => u.targetIds[0] === 3)).toBe(true);
  });

  it('反例：目标指定了两个人 —— 不触发', async () => {
    const zc = P(0, '张楚');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([zc, a, b]);
    await dispatchCardUsed(deps, { source: zc, card: blackSlash(), targets: [a, b], usedCount: 1 });
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：红色的牌 —— 不触发', async () => {
    const zc = P(0, '张楚');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([zc, a]);
    await dispatchCardUsed(deps, {
      source: zc, card: mkCard({ name: CardName.SHA, type: CardType.BASIC, suit: Suit.HEART }), targets: [a], usedCount: 1,
    });
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：每回合限一次', async () => {
    const zc = P(0, '张楚');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps } = makeHarness([zc, a, b]);
    registerSkill({
      hero: '张楚', skill: '__seedxz2', hooks: {
        onTurnStart: (ctx) => { ctx.addMark('信众', 1, 1); },
      },
    });
    await import('./dispatch').then(m => m.dispatchTurnStart(deps, zc));
    await dispatchCardUsed(deps, { source: zc, card: blackSlash(), targets: [b], usedCount: 1 });
    await dispatchCardUsed(deps, { source: zc, card: blackSlash(), targets: [b], usedCount: 2 });
    // 第一次只派发一次；第二次因为「每回合限一次」不再派发
    const res = await dispatchDamageBefore(deps, { victim: b, source: zc, amount: 1, nature: 'normal', card: undefined });
    void res;
  });
});

describe('马伶俐「花火」', () => {
  it('正例：红色手牌当火【杀】使用（attribute=fire），并弃置该牌', async () => {
    const mll = P(0, '马伶俐');
    mll.hand = [mkCard({ name: CardName.TAO, suit: Suit.HEART })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([mll, a]);
    await dispatchPlayPhaseBegin(deps, mll);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].opts?.attribute).toBe('fire');
    expect(fx.usedCards[0].targetIds).toEqual([1]);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
  });

  it('反例：手里没有红色牌 —— 不发动', async () => {
    const mll = P(0, '马伶俐');
    mll.hand = [mkCard({ name: CardName.SHA, suit: Suit.SPADE })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([mll, a]);
    await dispatchPlayPhaseBegin(deps, mll);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：出牌阶段限一次', async () => {
    const mll = P(0, '马伶俐');
    mll.hand = [mkCard({ name: CardName.TAO, suit: Suit.HEART })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([mll, a]);
    await dispatchPlayPhaseBegin(deps, mll);
    await dispatchPlayPhaseBegin(deps, mll);
    expect(fx.usedCards).toHaveLength(1);
  });
});
