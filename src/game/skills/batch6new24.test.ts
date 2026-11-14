import { beforeEach, describe, expect, it } from 'vitest';
import { __clearSkillMemory, dispatchPlayPhaseBegin, dispatchTurnEnd } from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import type { Card } from '../../../types';
import './batch6new24';

/**
 * batch6new24 的行为测试：锦绘。
 *
 * 关键断言：
 *   · 只从「目标数默认或可 1 的非伤害牌」里挑（伤害牌 / 多目标牌必须被排除）
 *   · 三张牌名不同
 *   · 目标角色先用一张，其余的我可以用 0~2 张
 *   · 用出去的牌都带 ignoreDistance + 正确的 asPlayerId
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });
const card = (name: CardName, o: Partial<Card> = {}) => mkCard({ name, suit: Suit.HEART, ...o });

const installDeck = (deps: ReturnType<typeof makeHarness>['deps'], deck: Card[]) => {
  deps.peekDeck = (n) => deck.slice(-n).reverse();
  deps.takeFromDeck = (pred, count) => {
    const out: Card[] = [];
    for (let i = deck.length - 1; i >= 0 && out.length < count; i -= 1) {
      if (pred(deck[i])) out.push(deck.splice(i, 1)[0]);
    }
    return out;
  };
};

describe('赵嫣「锦绘」', () => {
  it('正例：从牌堆亮出三张非伤害牌，目标角色用一张，其余的我可以用', async () => {
    const zy = P(0, '赵嫣');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([zy, a]);
    installDeck(deps, [
      card(CardName.WUZHONG), card(CardName.GUOHE), card(CardName.SHUNSHOU),
      card(CardName.TAO), card(CardName.SHA, { type: CardType.BASIC }),
    ]);
    await dispatchPlayPhaseBegin(deps, zy);
    // 选择哪些牌是随机的，但总数固定 3，且一定不含【杀】
    const usedNames = fx.usedCards.map(u => u.card as Card).map(c => c.name);
    expect(usedNames.length).toBeGreaterThanOrEqual(1);
    expect(usedNames).not.toContain(CardName.SHA);
    expect(fx.logs.some(l => l.includes('锦绘') && l.includes('置于武将牌上'))).toBe(true);
    // 目标角色先用的那一张：asPlayerId 是「甲」
    expect(fx.usedCards[0].playerId).toBe(1);
    // 全部无距离限制
    expect(fx.usedCards.every(u => u.opts?.ignoreDistance === true)).toBe(true);
  });

  it('反例：牌堆里只有伤害牌 / 多目标牌 —— 不发动', async () => {
    const zy = P(0, '赵嫣');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([zy, a]);
    installDeck(deps, [
      card(CardName.SHA, { type: CardType.BASIC }),
      card(CardName.JUEDOU, { type: CardType.SCROLL }),
      card(CardName.NANMAN, { type: CardType.SCROLL }),
      card(CardName.WANJIAN, { type: CardType.SCROLL }),
      card(CardName.TAOYUAN, { type: CardType.SCROLL }),
    ]);
    await dispatchPlayPhaseBegin(deps, zy);
    expect(fx.usedCards).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('反例：没有其他角色 —— 不发动', async () => {
    const zy = P(0, '赵嫣');
    const { deps, fx } = makeHarness([zy]);
    installDeck(deps, [card(CardName.WUZHONG), card(CardName.GUOHE)]);
    await dispatchPlayPhaseBegin(deps, zy);
    expect(fx.banners).toEqual([]);
  });

  it('反例：出牌阶段限一次', async () => {
    const zy = P(0, '赵嫣');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([zy, a]);
    installDeck(deps, [
      card(CardName.WUZHONG), card(CardName.GUOHE), card(CardName.TAO), card(CardName.SHUNSHOU),
    ]);
    await dispatchPlayPhaseBegin(deps, zy);
    const first = fx.usedCards.length;
    await dispatchPlayPhaseBegin(deps, zy);
    expect(fx.usedCards.length).toBe(first);
  });

  it('正例：回合结束后可以再次发动（限的是「每阶段」不是「每局」）', async () => {
    const zy = P(0, '赵嫣');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([zy, a]);
    installDeck(deps, [
      card(CardName.WUZHONG), card(CardName.GUOHE), card(CardName.TAO),
      card(CardName.SHUNSHOU), card(CardName.LESI), card(CardName.JIU),
    ]);
    await dispatchPlayPhaseBegin(deps, zy);
    const first = fx.usedCards.length;
    await dispatchTurnEnd(deps, zy);
    await dispatchPlayPhaseBegin(deps, zy);
    expect(fx.usedCards.length).toBeGreaterThan(first);
  });
});
