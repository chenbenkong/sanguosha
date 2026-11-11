import { describe, expect, it } from 'vitest';
import { CardType } from '../../../types';
import type { Card } from '../../../types';
import { mkCard, mkPlayer, makeHarness, drawnFor } from './testHarness';
import { dispatchDrawPhaseBegin, dispatchDiscardPhaseSkip, dispatchCardLost, dispatchDamageBefore, dispatchTurnStart } from './dispatch';
import './index';
import { CardName } from '../../../types';

/** 摸牌/弃牌阶段迁移的行为测试：搬家前后规则必须一致。 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

const hand = (n: number): Card[] => Array.from({ length: n }, () => mkCard());

describe('张辽「突袭」', () => {
  it('有其他角色有手牌时：改为各获得一张，且本次不摸牌', async () => {
    const me = P('张辽', 0, { hand: hand(2) });
    const a = P('甲', 1, { hand: hand(3) });
    const b = P('乙', 2, { hand: hand(2) });
    const c = P('丙', 3, { hand: [] });
    const { deps, fx } = makeHarness([me, a, b, c]);
    const gained: Array<{ from: number; to: number; id: string }> = [];
    deps.gainCard = (from, to, card) => { gained.push({ from, to, id: card.id }); };

    const r = await dispatchDrawPhaseBegin(deps, 0, { count: 2 });
    expect(r.replaced).toBe(true);
    expect(r.count).toBe(0);
    // 手牌最多的两名（甲 3 张、乙 2 张）各被拿走一张，丙没有手牌不参与
    expect(gained.map(g => g.from).sort()).toEqual([1, 2]);
    expect(gained.every(g => g.to === 0)).toBe(true);
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('其他角色都没有手牌时不发动，摸牌数不变', async () => {
    const me = P('张辽', 0, { hand: hand(2) });
    const a = P('甲', 1);
    const { deps, fx } = makeHarness([me, a]);
    const gained: string[] = [];
    deps.gainCard = (_from, _to, card) => { gained.push(card.id); };

    const r = await dispatchDrawPhaseBegin(deps, 0, { count: 2 });
    expect(r.replaced).toBeFalsy();
    expect(r.count).toBeUndefined();
    expect(gained).toEqual([]);
    expect(fx.logs.some(l => l.includes('突袭'))).toBe(false);
  });
});

describe('许褚「裸衣」', () => {
  it('手中有【杀】时少摸一张，本回合【杀】伤害+1', async () => {
    const me = P('许褚', 0, { hand: [mkCard({ name: CardName.SHA })] });
    const foe = P('甲', 1);
    const { deps } = makeHarness([me, foe]);

    const r = await dispatchDrawPhaseBegin(deps, 0, { count: 2 });
    expect(r.count).toBe(1);
    expect(r.replaced).toBeFalsy();

    const before = await dispatchDamageBefore(deps, {
      victim: foe, source: me, amount: 1, nature: 'normal', card: mkCard({ name: CardName.SHA }),
    });
    expect(before.amount).toBe(2);
  });

  it('手牌没有【杀】/【决斗】时不发动，伤害也不加成', async () => {
    const me = P('许褚', 0, { hand: [mkCard({ name: CardName.TAO, type: CardType.BASIC })] });
    const foe = P('甲', 1);
    const { deps } = makeHarness([me, foe]);

    const r = await dispatchDrawPhaseBegin(deps, 0, { count: 2 });
    expect(r.count).toBeUndefined();
    expect(r.replaced).toBeFalsy();

    const before = await dispatchDamageBefore(deps, {
      victim: foe, source: me, amount: 1, nature: 'normal', card: mkCard({ name: CardName.SHA }),
    });
    expect(before.amount).toBeUndefined();
  });

  it('加持只作用于【杀】/【决斗】：普通锦囊伤害不加成，下一回合开始后失效', async () => {
    const me = P('许褚', 0, { hand: [mkCard({ name: CardName.JUEDOU, type: CardType.SCROLL })] });
    const foe = P('甲', 1);
    const { deps } = makeHarness([me, foe]);
    await dispatchDrawPhaseBegin(deps, 0, { count: 2 });

    const scroll = await dispatchDamageBefore(deps, {
      victim: foe, source: me, amount: 1, nature: 'normal', card: mkCard({ name: CardName.GUOHE }),
    });
    expect(scroll.amount).toBeUndefined();

    // 回合结束（下一回合开始）后加成失效
    await dispatchTurnStart(deps, foe);
    const after = await dispatchDamageBefore(deps, {
      victim: foe, source: me, amount: 1, nature: 'normal', card: mkCard({ name: CardName.SHA }),
    });
    expect(after.amount).toBeUndefined();
  });
});

describe('吕蒙「克己」', () => {
  it('本回合未使用【杀】：跳过弃牌阶段', () => {
    const me = P('吕蒙', 0, { hand: hand(5) });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    const r = dispatchDiscardPhaseSkip(deps, 0, { slashesUsed: 0, excess: 2 });
    expect(r.skip).toBe(true);
    expect(fx.banners.length).toBe(1);
  });

  it('本回合使用过【杀】：不能跳过弃牌阶段', () => {
    const me = P('吕蒙', 0, { hand: hand(5) });
    const { deps } = makeHarness([me, P('甲', 1)]);
    expect(dispatchDiscardPhaseSkip(deps, 0, { slashesUsed: 1, excess: 2 }).skip).toBe(false);
  });

  it('其他武将即使未出【杀】也不跳过（判定只对技能拥有者生效）', () => {
    const me = P('甲', 0, { hand: hand(5) });
    const { deps } = makeHarness([me, P('吕蒙', 1)]);
    expect(dispatchDiscardPhaseSkip(deps, 0, { slashesUsed: 0, excess: 2 }).skip).toBe(false);
  });
});

describe('孙尚香「枭姬」', () => {
  it('失去装备区的牌时摸两张', async () => {
    const me = P('孙尚香', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardLost(deps, {
      player: me, cards: [mkCard({ type: CardType.EQUIPMENT })], cause: 'equip', handAfter: 0, fromEquip: true,
    });
    expect(drawnFor(fx, 0)).toBe(2);
  });

  it('失去的是手牌而非装备时不触发', async () => {
    const me = P('孙尚香', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardLost(deps, {
      player: me, cards: [mkCard()], cause: 'discard', handAfter: 0, fromEquip: false,
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('其他角色失去装备时不触发', async () => {
    const me = P('孙尚香', 0);
    const foe = P('甲', 1);
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchCardLost(deps, {
      player: foe, cards: [mkCard({ type: CardType.EQUIPMENT })], cause: 'equip', handAfter: 0, fromEquip: true,
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});

describe('陆逊「连营」', () => {
  it('失去最后一张手牌时摸一张', async () => {
    const me = P('陆逊', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardLost(deps, {
      player: me, cards: [me.hand[0]], cause: 'discard', handAfter: 0, fromEquip: false,
    });
    expect(drawnFor(fx, 0)).toBe(1);
  });

  it('失去牌后仍有手牌时不触发', async () => {
    const me = P('陆逊', 0, { hand: hand(3) });
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardLost(deps, {
      player: me, cards: [me.hand[0]], cause: 'discard', handAfter: 2, fromEquip: false,
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('失去的是装备区的牌时不触发（装备不占手牌）', async () => {
    const me = P('陆逊', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)]);
    await dispatchCardLost(deps, {
      player: me, cards: [mkCard({ type: CardType.EQUIPMENT })], cause: 'equip', handAfter: 0, fromEquip: true,
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });

  it('其他角色失去最后一张手牌时不触发', async () => {
    const me = P('陆逊', 0, { hand: [mkCard()] });
    const foe = P('甲', 1, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, foe]);
    await dispatchCardLost(deps, {
      player: foe, cards: [foe.hand[0]], cause: 'gain', handAfter: 0, fromEquip: false,
    });
    expect(drawnFor(fx, 0)).toBe(0);
  });
});
