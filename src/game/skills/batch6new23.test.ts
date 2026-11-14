import { beforeEach, describe, expect, it } from 'vitest';
import {
  __clearSkillMemory, dispatchAfterHeal, dispatchCardUsed, dispatchHandLimitBonus,
  dispatchPlayPhaseEnd, dispatchPlayPhaseBegin, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import './batch6new23';

/**
 * batch6new23 的行为测试：酖毒 / 谮构。
 *
 * 这两条都吃 afterHeal。「窗口内回血」用一个会触发 afterHeal 的 useCardAs 替身来模拟 ——
 * 引擎里一次牌的结算真的可能回血（桃/桃园结义），所以这不是造假的时序。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

describe('董絮「酖毒」', () => {
  it('正例：出牌阶段结束展示的牌，下个回合开始时依次视为使用（无距离限制）', async () => {
    const dx = P(0, '董絮');
    dx.hand = [mkCard({ name: CardName.SHA, type: CardType.BASIC }), mkCard({ name: CardName.TAO, type: CardType.BASIC })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dx, a]);
    await dispatchPlayPhaseEnd(deps, dx);
    expect(fx.logs.some(l => l.includes('酖毒') && l.includes('展示'))).toBe(true);
    await dispatchTurnStart(deps, dx);
    // 两张牌都被「视为使用」，且都是无距离限制
    expect(fx.usedCards).toHaveLength(2);
    expect(fx.usedCards.every(u => u.opts?.ignoreDistance === true)).toBe(true);
    expect(fx.usedCards[0].opts?.reason).toBe('酖毒');
  });

  it('正例：使用这些牌期间有人回血 → 摸一张牌且手牌上限 +1', async () => {
    const dx = P(0, '董絮');
    dx.hand = [mkCard({ name: CardName.TAO, type: CardType.BASIC })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dx, a]);
    // 让「使用这张牌」的过程里发生一次回血（模拟桃/桃园结义的结算）
    const realUse = deps.useCardAs;
    deps.useCardAs = async (pid, card, targets, opts) => {
      await dispatchAfterHeal(deps, { player: a, amount: 1 });
      return realUse(pid, card, targets, opts);
    };
    await dispatchPlayPhaseEnd(deps, dx);
    await dispatchTurnStart(deps, dx);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 1 }]);
    // 「因此摸到的牌不计本回合手牌上限」
    expect(dispatchHandLimitBonus(deps, 0)).toBe(1);
  });

  it('反例：窗口之外回血 —— 不摸牌', async () => {
    const dx = P(0, '董絮');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dx, a]);
    await dispatchTurnStart(deps, dx);
    await dispatchAfterHeal(deps, { player: a, amount: 1 });
    expect(fx.drawn).toEqual([]);
    expect(dispatchHandLimitBonus(deps, 0)).toBe(0);
  });

  it('反例：手牌里没有基本牌/普通锦囊 —— 不发动', async () => {
    const dx = P(0, '董絮');
    dx.hand = [mkCard({ name: CardName.QINGGANG, type: CardType.EQUIPMENT })];
    const { deps, fx } = makeHarness([dx]);
    await dispatchPlayPhaseEnd(deps, dx);
    expect(fx.banners).toEqual([]);
  });

  it('反例：不是自己的出牌阶段结束 —— 不发动', async () => {
    const dx = P(0, '董絮');
    dx.hand = [mkCard({ name: CardName.TAO, type: CardType.BASIC })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dx, a]);
    await dispatchPlayPhaseEnd(deps, a);
    expect(fx.banners).toEqual([]);
  });
});

describe('清河公主「谮构」', () => {
  it('正例：把牌交给其他角色并摸等量张，标记为「谮构」牌', async () => {
    const qh = P(0, '清河公主', { maxHp: 3 });
    qh.hand = [mkCard({ name: CardName.TAO }), mkCard({ name: CardName.SHA })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([qh, a]);
    await dispatchPlayPhaseBegin(deps, qh);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 2 }]);
    expect(fx.logs.some(l => l.includes('谮构') && l.includes('交给'))).toBe(true);
  });

  it('正例：目标使用牌后展示手牌并失去等于「谮构」牌数的体力', async () => {
    const qh = P(0, '清河公主', { maxHp: 3 });
    qh.hand = [mkCard({ name: CardName.TAO }), mkCard({ name: CardName.SHA })];
    const a = P(1, '甲');
    const { deps } = makeHarness([qh, a]);
    const lost: Array<{ pid: number; n: number }> = [];
    deps.loseHp = async (pid, n) => { lost.push({ pid, n }); };
    await dispatchPlayPhaseBegin(deps, qh);
    // 两张牌都在「甲」手上（gainCard 在夹具里挪牌），所以 X = 2
    a.hand = [...qh.hand];
    await dispatchCardUsed(deps, { source: a, card: mkCard({ name: CardName.TAO }), targets: [qh], usedCount: 1 });
    expect(lost).toEqual([{ pid: 1, n: 2 }]);
  });

  it('反例：目标回血但手里已没有「谮构」牌 —— 不失去体力', async () => {
    const qh = P(0, '清河公主', { maxHp: 3 });
    qh.hand = [mkCard({ name: CardName.TAO })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([qh, a]);
    const lost: unknown[] = [];
    deps.loseHp = async (pid, n) => { lost.push([pid, n]); };
    await dispatchPlayPhaseBegin(deps, qh);
    a.hand = [];   // 牌已经不在手里了
    await dispatchAfterHeal(deps, { player: a, amount: 1 });
    expect(lost).toEqual([]);
    expect(fx.logs.some(l => l.includes('没有「谮构」牌'))).toBe(true);
  });

  it('反例：出牌阶段限一次', async () => {
    const qh = P(0, '清河公主', { maxHp: 3 });
    qh.hand = [mkCard({ name: CardName.TAO }), mkCard({ name: CardName.SHA })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([qh, a]);
    await dispatchPlayPhaseBegin(deps, qh);
    await dispatchPlayPhaseBegin(deps, qh);
    expect(fx.logs.filter(l => l.includes('交给')).length).toBe(1);
  });

  it('反例：没有其他角色 —— 不发动', async () => {
    const qh = P(0, '清河公主', { maxHp: 3 });
    qh.hand = [mkCard({ name: CardName.TAO })];
    const { deps, fx } = makeHarness([qh]);
    await dispatchPlayPhaseBegin(deps, qh);
    expect(fx.banners).toEqual([]);
  });
});
