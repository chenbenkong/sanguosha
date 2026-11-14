import { beforeEach, describe, expect, it } from 'vitest';
import { registerSkill } from './registry';
import {
  __clearSkillMemory, dispatchDying, dispatchTargets, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import type { Card } from '../../../types';
import './batch6new14';

/**
 * batch6new14 的行为测试：☆ 受责 / 灵慧 / ☆ 沙舞。
 *
 * 三条都用「真实注册的技能 + 真实 dispatcher」跑，断言规则结果
 * （标记有没有真的从 heroMemory 移走、牌有没有进手、伤害有没有落地、摸了几张）。
 *
 * 注意两件事：
 * 1. **不能**在 beforeEach 里调 __clearRegistry()：本文件的技能是模块导入时注册的，
 *    清空注册表会把被测技能一起清掉（之前版本就是这么全红的）。
 * 2. 标记（绞 / 沙）存在 heroMemory 里，**不是** deps 上的函数 —— 覆盖 deps.markCount
 *    不会影响 ctx.markCount。所以这里用一个「只负责贴标记」的辅助技能来播种，
 *    再看 ctx 真实读写的结果。
 */

beforeEach(() => { __clearSkillMemory(); });

const P = (id: number, name: string) => mkPlayer({ id, name });
const black = (o: Partial<Card> = {}) => mkCard({ suit: Suit.SPADE, name: CardName.SHA, ...o });
const red = (o: Partial<Card> = {}) => mkCard({ suit: Suit.HEART, name: CardName.TAO, ...o });

/** 辅助：给某个武将的技能贴 n 个标记（走真实的 ctx.addMark） */
let seedSeq = 0;
const seedMarks = async (
  deps: Parameters<typeof dispatchTurnStart>[0], owner: ReturnType<typeof mkPlayer>,
  mark: string, n: number,
) => {
  seedSeq += 1;
  registerSkill({
    hero: owner.hero.name,
    skill: '__seed_' + seedSeq,
    hooks: {
      // 一次性：注册表不能注销，所以用 memory 做闸门，避免后续 dispatchTurnStart 重复加标记
      onTurnStart: (ctx) => {
        if (ctx.memory.done) return;
        ctx.memory.done = true;
        ctx.addMark(mark, n);
      },
    },
  });
  await dispatchTurnStart(deps, owner);
};

describe('董贵人「☆ 受责」', () => {
  it('正例：移去 1 个「绞」、从弃牌堆随机获得一张黑色牌、失去 1 点体力', async () => {
    const dg = P(0, '董贵人');
    const other = P(1, '甲');
    const { deps, fx } = makeHarness([dg, other]);
    const pile = [red(), black(), black()];
    const gained: Card[] = [];
    const lostHp: Array<{ pid: number; n: number }> = [];
    deps.peekDiscard = () => [...pile];
    deps.takeFromDiscard = (pred, count) => {
      const out: Card[] = [];
      for (let i = 0; i < pile.length && out.length < count; i += 1) {
        if (pred(pile[i])) out.push(pile.splice(i, 1)[0]);
      }
      return out;
    };
    deps.gainCard = (_from, _to, c) => { gained.push(c); };
    deps.loseHp = async (pid, n) => { lostHp.push({ pid, n }); };

    await seedMarks(deps, dg, '绞', 3);
    await dispatchTurnEnd(deps, dg);

    // 移去 1 个：日志里的「剩余 2」证明 heroMemory 里的 3 个真的变成了 2 个
    expect(fx.logs.some(l => l.includes('移去 1 个「绞」标记（剩余 2）'))).toBe(true);
    expect(gained).toHaveLength(1);
    expect(['♠', '♣']).toContain(gained[0].suit);
    expect(lostHp).toEqual([{ pid: 0, n: 1 }]);
    expect(fx.banners).toContain('董贵人:☆ 受责');
  });

  it('反例：不是自己的结束阶段，什么都不发生', async () => {
    const dg = P(0, '董贵人');
    const other = P(1, '甲');
    const { deps, fx } = makeHarness([dg, other]);
    deps.peekDiscard = () => [black()];
    const lostHp: number[] = [];
    deps.loseHp = async (pid) => { lostHp.push(pid); };
    await dispatchTurnEnd(deps, other);
    expect(lostHp).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('反例：弃牌堆没有黑色牌 —— 锁定技照付 1 点体力', async () => {
    const dg = P(0, '董贵人');
    const { deps } = makeHarness([dg]);
    deps.peekDiscard = () => [red()];
    const lostHp: number[] = [];
    deps.gainCard = () => { throw new Error('不该获得牌'); };
    deps.loseHp = async (pid, n) => { lostHp.push(pid * 10 + n); };
    await dispatchTurnEnd(deps, dg);
    expect(lostHp).toEqual([1]); // pid 0 * 10 + 1
  });
});

describe('柏灵筠「灵慧」', () => {
  const deckDeps = (deps: ReturnType<typeof makeHarness>['deps'], deck: Card[]) => {
    const gained: Card[] = [];
    deps.peekDeck = (n) => deck.slice(-n).reverse();
    deps.takeFromDeck = (pred, count) => {
      const out: Card[] = [];
      for (let i = deck.length - 1; i >= 0 && out.length < count; i -= 1) {
        if (pred(deck[i])) out.push(deck.splice(i, 1)[0]);
      }
      return out;
    };
    deps.gainCard = (_f, _t, c) => { gained.push(c); };
    return gained;
  };

  it('正例：自己的结束阶段看 3 张，随机获得其余牌中的一张', async () => {
    const bl = P(0, '柏灵筠');
    const { deps } = makeHarness([bl]);
    const deck = [mkCard({ name: CardName.SHAN }), mkCard({ name: CardName.WUXIE }), mkCard({ name: CardName.TAO })];
    const gained = deckDeps(deps, deck);
    // AI（isHuman=false）只会用【杀】，这 3 张都不是，所以只走「随机获得一张」
    await dispatchTurnEnd(deps, bl);
    expect(gained).toHaveLength(1);
    expect(deck).toHaveLength(2);
    expect([CardName.SHAN, CardName.WUXIE, CardName.TAO]).toContain(gained[0].name);
  });

  it('正例：本回合有角色进入濒死 —— 别人的结束阶段也会触发', async () => {
    const bl = P(0, '柏灵筠');
    const other = P(1, '甲');
    const { deps, fx } = makeHarness([bl, other]);
    const gained = deckDeps(deps, [mkCard({ name: CardName.SHAN }), mkCard({ name: CardName.TAO })]);
    await dispatchTurnStart(deps, other);
    await dispatchDying(deps, { victim: other, source: undefined, needHp: 1 });
    await dispatchTurnEnd(deps, other);
    expect(gained).toHaveLength(1);
    expect(fx.banners).toContain('柏灵筠:灵慧');
  });

  it('反例：别人的结束阶段、本回合没人濒死 —— 不触发', async () => {
    const bl = P(0, '柏灵筠');
    const other = P(1, '甲');
    const { deps, fx } = makeHarness([bl, other]);
    deps.peekDeck = () => [mkCard({ name: CardName.TAO })];
    deps.gainCard = () => { throw new Error('不该获得牌'); };
    await dispatchTurnStart(deps, other);
    await dispatchTurnEnd(deps, other);
    expect(fx.banners).toEqual([]);
  });

  it('反例：牌堆空 —— 不发动', async () => {
    const bl = P(0, '柏灵筠');
    const { deps, fx } = makeHarness([bl]);
    deps.peekDeck = () => [];
    await dispatchTurnEnd(deps, bl);
    expect(fx.banners).toEqual([]);
  });
});

describe('来莺儿「☆ 沙舞」', () => {
  const sha = () => mkCard({ name: CardName.SHA, type: CardType.BASIC });

  it('正例：移去「沙」标记 → 造成 1 点伤害并摸两张牌', async () => {
    const ly = P(0, '来莺儿');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([ly, foe]);
    await seedMarks(deps, ly, '沙', 2);
    await dispatchTargets(deps, { source: ly, card: sha(), targets: [foe] });
    expect(fx.damaged).toEqual([{ victimId: 1, sourceId: 0, amount: 1 }]);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 2 }]);
    // 用掉 1 个标记后还剩 1 个（再发动一次仍可走标记分支）
    await dispatchTargets(deps, { source: ly, card: sha(), targets: [foe] });
    expect(fx.damaged).toHaveLength(2);
  });

  it('正例：没有「沙」标记但手牌够 → 弃两张手牌，造成 1 点伤害、不摸牌', async () => {
    const ly = P(0, '来莺儿');
    ly.hand = [mkCard(), mkCard(), mkCard()];
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([ly, foe]);
    await dispatchTargets(deps, { source: ly, card: sha(), targets: [foe] });
    expect(fx.damaged).toEqual([{ victimId: 1, sourceId: 0, amount: 1 }]);
    expect(fx.drawn).toEqual([]);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 2 }]);
  });

  it('反例：用的不是【杀】—— 不触发', async () => {
    const ly = P(0, '来莺儿');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([ly, foe]);
    await seedMarks(deps, ly, '沙', 2);
    await dispatchTargets(deps, { source: ly, card: mkCard({ name: CardName.JUEDOU, type: CardType.SCROLL }), targets: [foe] });
    expect(fx.damaged).toEqual([]);
    expect(fx.drawn).toEqual([]);
  });

  it('反例：标记与手牌都不够 —— 不触发', async () => {
    const ly = P(0, '来莺儿');
    ly.hand = [mkCard()];
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([ly, foe]);
    await dispatchTargets(deps, { source: ly, card: sha(), targets: [foe] });
    expect(fx.damaged).toEqual([]);
  });

  it('反例：是别人使用的【杀】—— 不触发', async () => {
    const ly = P(0, '来莺儿');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([ly, foe]);
    await seedMarks(deps, ly, '沙', 2);
    await dispatchTargets(deps, { source: foe, card: sha(), targets: [ly] });
    expect(fx.damaged).toEqual([]);
  });
});
