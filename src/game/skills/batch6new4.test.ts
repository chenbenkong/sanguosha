import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchCardLost } from './dispatch';
import { skillsOf } from './registry';
import type { CardLostEvent } from './registry';
import type { Card, Player } from '../../../types';
import '../skills/index';

/**
 * 第六批女将 · 第 4 组：本批唯一用新原语实装的那个（芮姬「妄缘」）。
 *
 * 断言的是**规则**而不是「跑不跑得动」：什么时候发动、从牌堆取几张、
 * 取到哪去、上限在哪。每个技能都配反例——只测正例等于没测边界。
 *
 * 另外把 5 个 hand_back 的技能固化成断言：它们**不该**出现在注册表里。
 * 这条守卫不是形式主义：onTargetsChosen 没有派发器、afterDeath 派发不到
 * 死者本人，一旦有人「顺手」注册进来，技能就是永不触发的死代码，
 * 而这里会立刻红。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);

/** afterCardLost 事件（技能只读 player / cards / cause） */
const lost = (player: Player, cards: Card[] = [card()]): CardLostEvent => ({
  player,
  cards,
  cause: 'discard',
  handAfter: player.hand.length,
  fromEquip: false,
});

/**
 * 给牌局装上牌堆：deckTo 模拟「数组尾部是顶」（与 App.tsx 的实现同一口径）。
 * 返回的 deck 会真的被消耗，因此可以断言「取了几张」。
 */
const withDeck = (deps: ReturnType<typeof makeHarness>['deps'], deck: Card[]) => {
  const moved: Array<{ count: number; destination: string }> = [];
  deps.peekDeck = (count: number) => [...deck].slice(-count).reverse();
  deps.deckTo = (count, destination) => {
    const n = Math.min(count, deck.length);
    if (n <= 0) return [];
    const taken = deck.slice(-n).reverse();
    deck.length = deck.length - n;
    moved.push({ count: n, destination });
    return taken;
  };
  return { moved, deck };
};

describe('芮姬「妄缘」', () => {
  it('回合外失去牌：从牌堆顶取一张置为「妄」，并打进战报', () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const foe = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([rj, foe]);
    deps.turnOwner = foe;                       // 回合外
    const top = card({ name: '桃' as Card['name'] });
    const { moved, deck } = withDeck(deps, [card(), top, card()]);

    dispatchCardLost(deps, lost(rj));

    // 从牌堆取 1 张，去处是弃牌堆（不是手牌：见 batch6new4.ts 的组合性说明）
    expect(moved).toEqual([{ count: 1, destination: 'discard' }]);
    expect(deck).toHaveLength(2);
    expect(fx.logs.some(l => l.includes('妄缘') && l.includes('「妄」'))).toBe(true);
    expect(fx.banners.some(b => b.includes('妄缘'))).toBe(true);
  });

  it('自己回合内失去牌不发动（原文是「于回合外失去牌后」）', () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const { deps, fx } = makeHarness([rj, mkPlayer({ id: 1, name: '甲' })]);
    deps.turnOwner = rj;                        // 自己回合内
    const { moved, deck } = withDeck(deps, [card(), card()]);

    dispatchCardLost(deps, lost(rj));

    expect(moved).toEqual([]);
    expect(deck).toHaveLength(2);               // 牌堆没被动过
    expect(fx.logs.some(l => l.includes('妄缘'))).toBe(false);
  });

  it('牌堆为空时不发动、不记日志（deckTo 返回空数组）', () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const foe = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([rj, foe]);
    deps.turnOwner = foe;
    const { moved } = withDeck(deps, []);       // 空牌堆

    dispatchCardLost(deps, lost(rj));

    expect(moved).toEqual([]);
    expect(fx.logs.some(l => l.includes('妄缘'))).toBe(false);
  });

  it('「妄」总数至多为游戏人数：到顶后不再置牌', () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const foe = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([rj, foe]);   // 2 人局 → 上限 2
    deps.turnOwner = foe;
    const { moved, deck } = withDeck(deps, [card(), card(), card(), card()]);

    // 前两次：正常置「妄」，日志里的计数递增到 2
    dispatchCardLost(deps, lost(rj));
    dispatchCardLost(deps, lost(rj));
    expect(moved).toHaveLength(2);
    expect(fx.logs.some(l => l.includes('共 2 张'))).toBe(true);

    // 第三次：已达上限，不再从牌堆取牌
    const before = fx.logs.length;
    dispatchCardLost(deps, lost(rj));
    expect(moved).toHaveLength(2);
    expect(deck).toHaveLength(2);
    expect(fx.logs.slice(before).some(l => l.includes('妄缘'))).toBe(false);
  });

  it('其他角色失去牌不触发（afterCardLost 只派发给失去牌者本人）', () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const foe = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([rj, foe]);
    deps.turnOwner = foe;
    const { moved } = withDeck(deps, [card(), card()]);

    dispatchCardLost(deps, lost(foe));           // 失去牌的是甲，不是芮姬

    expect(moved).toEqual([]);
    expect(fx.logs.some(l => l.includes('妄缘'))).toBe(false);
  });
});

describe('本批技能在能力补齐后的注册状态', () => {
  /*
   * 这组断言原本全是反向的——「因为缺 X 能力，所以不注册」。
   * 后来逐项补齐了能力（见 registry.ts 的钩子与 ctx 能力）：
   *   onTargetsChosen 派发器 + combat.ts 接入 → 邀弈 / 劳燕
   *   afterDeath 的 includeDead + takeFromDeck  → 追德
   *   afterCardGain 钩子                       → 俐影
   * 于是它们翻转成正向。
   *
   * 花火**已翻转为正向**：ctx.useCardAs 落地之后它就能忠实实装了（batch6new18.ts）。
   * 这条是真实的能力缺口记录，删掉就等于假装它能用。
   */
  it('卢弈「邀弈」/ 张怀「劳燕」：onTargetsChosen 已接通，故已注册', () => {
    expect(skillsOf('卢弈').map(d => d.skill)).toContain('邀弈');
    expect(skillsOf('张怀').map(d => d.skill)).toContain('劳燕');
  });

  it('王荣「追德」：afterDeath 能派发到死者 + takeFromDeck 可精确取牌，故已注册', () => {
    expect(skillsOf('王荣').map(d => d.skill)).toContain('追德');
  });

  it('芮姬「俐影」：afterCardGain 钩子已加入，故已注册', () => {
    expect(skillsOf('芮姬').map(d => d.skill)).toContain('俐影');
  });

  it('马伶俐「花火」：ctx.useCardAs 落地后已注册（batch6new18.ts）', () => {
    expect(skillsOf('马伶俐').map(d => d.skill)).toContain('花火');
  });
});
