import { beforeEach, describe, expect, it } from 'vitest';
import { registerSkill } from './registry';
import { __clearSkillMemory, dispatchDamageBefore, dispatchTurnStart } from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import type { Card } from '../../../types';
import { mergeDamageBefore } from './engineAbilities';
import { readFileSync } from 'node:fs';
import './batch6new22';

/**
 * batch6new22 的行为测试：硝引。
 *
 * ②靠 damageBefore 的 nature 字段：非火焰伤害要返回 { nature: 'fire' }，
 * 火焰伤害走「弃同类别牌 + 移去硝引 + 伤害+1」。
 * ①的「置于武将牌上」用 heroMemory.niaoyin 存，所以测试要从真实回合开始播种。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

/** 给某角色贴 n 张「硝引」牌（走真实 heroMemory 路径：先跑 ①） */
const seedNiaoyin = async (
  deps: ReturnType<typeof makeHarness>['deps'],
  players: ReturnType<typeof mkPlayer>[],
  mll: ReturnType<typeof mkPlayer>,
  cards: Card[],
) => {
  // ① 会按「距离 1 以内的人数」亮牌，这里把距离与牌堆都做成可控的
  deps.distance = () => 0;
  deps.peekDeck = (n) => cards.slice(-n);
  deps.takeFromDeck = (pred, count) => {
    const out: Card[] = [];
    for (let i = cards.length - 1; i >= 0 && out.length < count; i -= 1) {
      if (pred(cards[i])) out.push(cards.splice(i, 1)[0]);
    }
    return out;
  };
  void players;
  await dispatchTurnStart(deps, mll);
};

const black = (o: Partial<Card> = {}) => mkCard({ suit: Suit.SPADE, ...o });

describe('马伶俐「硝引」', () => {
  it('正例 ①：亮牌 → 红色进手，黑色置于下家的武将牌上', async () => {
    const mll = P(0, '马伶俐');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([mll, a]);
    const stack = [mkCard({ suit: Suit.HEART, name: CardName.TAO }), black({ name: CardName.SHA })];
    await seedNiaoyin(deps, [mll, a], mll, stack);
    // 红色被获得、黑色放到「甲」的武将牌上
    expect(fx.logs.some(l => l.includes('获得其中的红色牌'))).toBe(true);
    expect(fx.logs.some(l => l.includes('置于 甲 的武将牌上'))).toBe(true);
    expect(fx.banners).toContain('马伶俐:硝引');
  });

  it('正例 ②：有「硝引」的角色受到非火焰伤害 → 改为火焰伤害', async () => {
    const mll = P(0, '马伶俐');
    const a = P(1, '甲');
    const src = P(2, '乙');
    const { deps, fx } = makeHarness([mll, a, src]);
    const stack = [black({ name: CardName.SHA, type: CardType.BASIC })];
    await seedNiaoyin(deps, [mll, a, src], mll, stack);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: src, amount: 1, nature: 'normal', card: undefined,
    });
    expect(res).toMatchObject({ nature: 'fire' });
    // 伤害来源获得那张「硝引」牌
    expect(fx.logs.some(l => l.includes('获得') && l.includes('此伤害改为火焰伤害'))).toBe(true);
  });

  it('正例 ②：有「硝引」的角色受到火焰伤害 → 来源弃同类别牌，伤害+1', async () => {
    const mll = P(0, '马伶俐');
    const a = P(1, '甲');
    const src = P(2, '乙');
    src.hand = [mkCard({ name: CardName.SHA, type: CardType.BASIC })];
    const { deps } = makeHarness([mll, a, src]);
    const stack = [black({ name: CardName.SHAN, type: CardType.BASIC })];
    await seedNiaoyin(deps, [mll, a, src], mll, stack);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: src, amount: 1, nature: 'fire', card: undefined,
    });
    expect(res).toMatchObject({ amount: 2 });
  });

  it('反例 ②：目标身上没有「硝引」牌 —— 不干预', async () => {
    const mll = P(0, '马伶俐');
    const a = P(1, '甲');
    const src = P(2, '乙');
    const { deps } = makeHarness([mll, a, src]);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: src, amount: 1, nature: 'normal', card: undefined,
    });
    expect(res).toEqual({});
  });

  it('反例 ②：火焰伤害但没有同类别的手牌可弃 —— 不发动', async () => {
    const mll = P(0, '马伶俐');
    const a = P(1, '甲');
    const src = P(2, '乙');
    src.hand = [];
    const { deps } = makeHarness([mll, a, src]);
    const stack = [black({ name: CardName.SHAN, type: CardType.BASIC })];
    await seedNiaoyin(deps, [mll, a, src], mll, stack);
    const res = await dispatchDamageBefore(deps, {
      victim: a, source: src, amount: 1, nature: 'fire', card: undefined,
    });
    expect(res).toEqual({});
  });
});

describe('DamageBeforeResult.nature（引擎侧）', () => {
  it('多项修正合并时 nature 会被保留', () => {
    expect(mergeDamageBefore([{ amount: 3 }, { nature: 'fire' }, null, { note: 'x' }]))
      .toEqual({ amount: 3, nature: 'fire', note: 'x' });
  });

  it('takeDamage 真的消费了合并结果里的 nature（源码级断言）', () => {
    // 这条守卫的价值：nature 字段加进类型后，如果 takeDamage 忘了重算 dmgNature，
    // 技能会「返回了正确的 nature，但伤害属性没变」，单测看不出来。
    const src = readFileSync('src/game/combat.ts', 'utf8');
    expect(src).toContain('let dmgNature:');
    expect(src).toContain('dmgNature = pre.nature;');
    expect(src).toContain("natureLabel = dmgNature === 'fire'");
  });
});
