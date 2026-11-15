import { beforeEach, describe, expect, it } from 'vitest';
import { __clearSkillMemory, dispatchPlayPhaseBegin, dispatchPlayPhaseEnd } from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import type { Card } from '../../../types';
import './batch6new26';

/**
 * batch6new26 的行为测试：帼武。
 *
 * 三档按「类别数不小于」累加，所以用 1/2/3 类手牌各测一档。
 * 夹具里 setPhaseNoDistance / setExtraTargets 会真的写到 Player 上，
 * 于是「阶段结束必须收回」这条能被断言到 —— 漏收回是整局级污染。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });
const basic = (o: Partial<Card> = {}) => mkCard({ name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE, ...o });
const trick = (o: Partial<Card> = {}) => mkCard({ name: CardName.TAO, type: CardType.SCROLL, suit: Suit.HEART, ...o });
const equip = (o: Partial<Card> = {}) => mkCard({ name: CardName.QINGGANG, type: CardType.EQUIPMENT, suit: Suit.SPADE, ...o });

describe('吕玲绮「帼武」', () => {
  it('正例：1 类手牌 —— 只拿弃牌堆的一张【杀】', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic(), basic()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    const pile: Card[] = [basic({ name: CardName.SHA })];
    deps.peekDiscard = () => [...pile];
    deps.takeFromDiscard = (pred, count) => {
      const out: Card[] = [];
      for (let i = pile.length - 1; i >= 0 && out.length < count; i--) {
        if (pred(pile[i])) out.push(pile.splice(i, 1)[0]);
      }
      return out;
    };
    await dispatchPlayPhaseBegin(deps, ll);
    expect(fx.logs.some(l => l.includes('从弃牌堆获得一张【杀】'))).toBe(true);
    expect(fx.noDistance).toEqual([]);
    expect(fx.extraTargets).toEqual([]);
  });

  it('正例：2 类手牌 —— 加「本阶段无距离限制」', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic(), trick()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    await dispatchPlayPhaseBegin(deps, ll);
    expect(fx.noDistance).toEqual([{ playerId: 0, on: true }]);
    expect(ll.phaseNoDistance).toBe(true);
    expect(fx.extraTargets).toEqual([]);
  });

  it('正例：3 类手牌 —— 三档全给（额外目标数 2）', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic(), trick(), equip()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    await dispatchPlayPhaseBegin(deps, ll);
    expect(fx.noDistance).toEqual([{ playerId: 0, on: true }]);
    expect(fx.extraTargets).toEqual([{ playerId: 0, count: 2 }]);
    expect(ll.extraTargetCount).toBe(2);
  });

  it('正例：阶段结束收回两个标志（不污染下一回合）', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic(), trick(), equip()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    await dispatchPlayPhaseBegin(deps, ll);
    await dispatchPlayPhaseEnd(deps, ll);
    expect(fx.noDistance).toEqual([{ playerId: 0, on: true }, { playerId: 0, on: false }]);
    expect(fx.extraTargets).toEqual([{ playerId: 0, count: 2 }, { playerId: 0, count: 0 }]);
    expect(ll.phaseNoDistance).toBe(false);
    expect(ll.extraTargetCount).toBe(0);
  });

  it('反例：空手牌不发动', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    await dispatchPlayPhaseBegin(deps, ll);
    expect(fx.banners).toEqual([]);
  });

  it('反例：不是自己的出牌阶段不发动', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic(), trick(), equip()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    await dispatchPlayPhaseBegin(deps, a);
    expect(fx.banners).toEqual([]);
    expect(fx.noDistance).toEqual([]);
  });

  it('反例：每阶段限一次（第二次不再展示）', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic(), trick()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    await dispatchPlayPhaseBegin(deps, ll);
    await dispatchPlayPhaseBegin(deps, ll);
    expect(fx.logs.filter(l => l.includes('展示所有手牌'))).toHaveLength(1);
  });

  it('反例：弃牌堆没有【杀】时如实报告，不假装获得', async () => {
    const ll = P(0, '吕玲绮');
    ll.hand = [basic()];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([ll, a]);
    deps.peekDiscard = () => [trick()];
    deps.takeFromDiscard = () => [];
    await dispatchPlayPhaseBegin(deps, ll);
    expect(fx.logs.some(l => l.includes('弃牌堆没有【杀】'))).toBe(true);
    expect(fx.logs.some(l => l.includes('从弃牌堆获得'))).toBe(false);
  });
});
