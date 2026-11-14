import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import type { Effects } from './testHarness';
import type { DispatchDeps } from './dispatch';
import {
  dispatchAfterDamage, dispatchAfterDealDamage, dispatchCardUsed, dispatchDamageBefore,
  dispatchDeath, dispatchTargets, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { skillsOf } from './registry';
import { Suit } from '../../../types';
import type { Card } from '../../../types';
import './batch6new8';

/**
 * 第六批女将 · 第 8 组：5 个技能。
 *
 * 断言的是**规则**：什么时候触发、代价付了几张、选过哪一项、凑不齐时怎么办。
 * 每个技能都配反例——只测正例等于没测边界。
 *
 * 实现边界（时机近似 / 引擎缺原语）见 batch6new8.ts 的文件头与各技能注释；
 * 这里只测**已实装**的部分，不给未实装子句写「假装生效」的断言。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);

/** 装一副可控的牌堆：takeFromDeck 按牌堆顶（数组尾部）顺序取，与 App.tsx 同实现 */
const withDeck = (deps: DispatchDeps, deck: Card[]): Card[] => {
  deps.takeFromDeck = (pred, count) => {
    const taken: Card[] = [];
    const rest: Card[] = [];
    for (let i = deck.length - 1; i >= 0; i--) {
      const c = deck[i];
      if (taken.length < count && pred(c)) taken.push(c);
      else rest.unshift(c);
    }
    if (taken.length === 0) return [];
    deck.length = 0;
    deck.push(...rest);
    return taken;
  };
  return deck;
};

/** 记录交给别人的牌：gainCard 在夹具里是空实现 */
const trackGain = (deps: DispatchDeps) => {
  const given: Array<{ from: number; to: number; name: string }> = [];
  deps.gainCard = (from, to, c) => { given.push({ from, to, name: String(c.name) }); };
  return given;
};

/**
 * 让 ctx.draw 真的返回牌：夹具默认返回空数组，而「摸两张然后交给一名角色」
 * 需要拿到那两张牌才能断言交牌，所以这里替换成可见的实现。
 */
const withDraw = (deps: DispatchDeps, fx: Effects) => {
  let seq = 0;
  deps.draw = (playerId, count) => {
    fx.drawn.push({ playerId, count });
    const out: Card[] = [];
    for (let i = 0; i < count; i++) {
      seq += 1;
      out.push(mkCard({ name: ('摸' + seq) as Card['name'] }));
    }
    return out;
  };
};

describe('王荣「敏思」', () => {
  const setup = () => {
    const wr = mkPlayer({ id: 0, name: '王荣' });
    const foe = mkPlayer({ id: 1, name: '甲' });
    return { wr, foe };
  };

  it('正例：人类选中的牌点数之和为 13 → 弃 N 张摸 2N 张', async () => {
    const { wr, foe } = setup();
    const c6 = card({ value: 6, rank: '6' });
    const c7 = card({ value: 7, rank: '7' });
    const c3 = card({ value: 3, rank: '3' });
    wr.hand = [c6, c7, c3];
    const { deps, fx } = makeHarness([wr, foe], {
      requestChoice: async (req) => (req.mode === 'multi'
        ? { kind: 'multi', ids: [c6.id, c7.id] } : null),
    });

    await dispatchTurnEnd(deps, wr);

    expect(fx.discarded).toEqual([{ playerId: wr.id, count: 2 }]);
    expect(fx.drawn).toEqual([{ playerId: wr.id, count: 4 }]);
    expect(fx.logs.some(l => l.includes('敏思'))).toBe(true);
    expect(fx.banners.some(b => b.includes('敏思'))).toBe(true);
  });

  it('正例：AI / 托管自动取点数和为 13 的最大子集（弃 4 张摸 8 张）', async () => {
    const { wr, foe } = setup();
    wr.hand = [1, 2, 3, 7].map(v => card({ value: v, rank: String(v) }));
    const { deps, fx } = makeHarness([wr, foe]);

    await dispatchTurnEnd(deps, wr);

    expect(fx.discarded).toEqual([{ playerId: wr.id, count: 4 }]);
    expect(fx.drawn).toEqual([{ playerId: wr.id, count: 8 }]);
  });

  it('反例：所选牌点数之和不是 13 → 不弃不摸', async () => {
    const { wr, foe } = setup();
    const c6 = card({ value: 6, rank: '6' });
    wr.hand = [c6, card({ value: 7, rank: '7' })];
    const { deps, fx } = makeHarness([wr, foe], {
      requestChoice: async () => ({ kind: 'multi', ids: [c6.id] }),   // 只有 6 点
    });

    await dispatchTurnEnd(deps, wr);

    expect(fx.discarded).toEqual([]);
    expect(fx.drawn).toEqual([]);
    expect(fx.logs.some(l => l.includes('不是 13'))).toBe(true);
  });

  it('反例：不是自己的回合结束 → 连问都不问', async () => {
    const { wr, foe } = setup();
    wr.hand = [card({ value: 6, rank: '6' })];
    let asked = 0;
    const { deps, fx } = makeHarness([wr, foe], {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchTurnEnd(deps, foe);

    expect(asked).toBe(0);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：手牌凑不出 13（付不起代价）→ 不发动', async () => {
    const { wr, foe } = setup();
    wr.hand = [card({ value: 1, rank: '1' }), card({ value: 2, rank: '2' })];
    let asked = 0;
    const { deps, fx } = makeHarness([wr, foe], {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchTurnEnd(deps, wr);

    expect(asked).toBe(1);
    expect(fx.discarded).toEqual([]);
    expect(fx.drawn).toEqual([]);
  });

  it('反例：限一次——同回合第二次不再发动；新回合开始后复位', async () => {
    const { wr, foe } = setup();
    const c6 = card({ value: 6, rank: '6' });
    const c7 = card({ value: 7, rank: '7' });
    wr.hand = [c6, c7];
    const { deps, fx } = makeHarness([wr, foe], {
      requestChoice: async () => ({ kind: 'multi', ids: [c6.id, c7.id] }),
    });

    await dispatchTurnEnd(deps, wr);
    await dispatchTurnEnd(deps, wr);          // 同一回合的第二次
    expect(fx.drawn).toHaveLength(1);

    await dispatchTurnStart(deps, foe);       // 新回合（任意角色的回合开始）
    await dispatchTurnEnd(deps, wr);
    expect(fx.drawn).toHaveLength(2);
  });
});

describe('曹宪「知否」', () => {
  const setup = () => {
    const kx = mkPlayer({ id: 0, name: '曹宪' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    a.hand = [card(), card()];
    return { kx, a, b };
  };

  const used = (src: ReturnType<typeof mkPlayer>, targets: ReturnType<typeof mkPlayer>[]) =>
    ({ source: src, card: card(), targets, usedCount: 1 });

  it('正例：移去 1 张「翼」，令目标弃置两张牌', async () => {
    const { kx, a, b } = setup();
    const w1 = card();
    const w2 = card();
    kx.placedCards = [w1, w2];
    const { deps, fx } = makeHarness([kx, a, b], {
      requestChoice: async (req) => {
        if (req.mode === 'multi') return { kind: 'multi', ids: [w1.id] };
        if (req.mode === 'target') return { kind: 'target', ids: [a.id] };
        if (req.mode === 'choose') return { kind: 'choose', id: '2' };
        return null;
      },
    });

    await dispatchCardUsed(deps, used(kx, [a]));

    // 代价：移走一张「翼」（并从武将牌上摘掉），且它按弃牌进堆
    expect((kx.placedCards ?? []).map(c => c.id)).toEqual([w2.id]);
    // 效果：甲弃置两张
    expect(fx.discarded).toEqual([{ playerId: kx.id, count: 1 }, { playerId: a.id, count: 2 }]);
    expect(fx.logs.some(l => l.includes('知否'))).toBe(true);
    expect(fx.banners.some(x => x.includes('知否'))).toBe(true);
  });

  it('正例：X 含本次——第二次发动要移去 2 张；选项 1 置入「翼」、选项 3 失去 1 点体力', async () => {
    const { kx, a, b } = setup();
    kx.placedCards = [card(), card(), card()];
    let round = 0;
    const { deps, fx } = makeHarness([kx, a, b], {
      requestChoice: async (req) => {
        if (req.mode === 'multi') {
          // 移去 req.min 张（min 就是本回合第几次发动）
          return { kind: 'multi', ids: (req.choices ?? []).slice(0, req.min ?? 1).map(c => c.id) };
        }
        if (req.mode === 'target') { round += 1; return { kind: 'target', ids: [round === 1 ? a.id : b.id] }; }
        if (req.mode === 'choose') return { kind: 'choose', id: round === 1 ? '1' : '3' };
        return null;
      },
    });

    const aHandBefore = a.hand.length;
    await dispatchCardUsed(deps, used(kx, [a]));
    // 选项 1：甲的一张手牌进了曹宪的武将牌
    expect(a.hand.length).toBe(aHandBefore - 1);
    expect((kx.placedCards ?? []).length).toBe(3 - 1 + 1);

    await dispatchCardUsed(deps, used(kx, [b]));
    // 选项 3：乙失去 1 点体力
    expect(b.hp).toBe(2);
    expect(fx.logs.some(l => l.includes('失去 1 点体力'))).toBe(true);
    expect((kx.placedCards ?? []).length).toBe(1);
  });

  it('反例：不是自己使用牌 → 不发动', async () => {
    const { kx, a, b } = setup();
    kx.placedCards = [card(), card()];
    let asked = 0;
    const { deps, fx } = makeHarness([kx, a, b], {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchCardUsed(deps, used(a, [b]));

    expect(asked).toBe(0);
    expect((kx.placedCards ?? []).length).toBe(2);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：没有「翼」（付不起代价）→ 不询问', async () => {
    const { kx, a, b } = setup();
    let asked = 0;
    const { deps, fx } = makeHarness([kx, a, b], { requestChoice: async () => { asked += 1; return null; } });

    await dispatchCardUsed(deps, used(kx, [a]));

    expect(asked).toBe(0);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：移去的张数不足 X → 不发动', async () => {
    const { kx, a, b } = setup();
    kx.placedCards = [card(), card()];
    let targetAsks = 0;
    const { deps, fx } = makeHarness([kx, a, b], {
      requestChoice: async (req) => {
        if (req.mode === 'multi') return { kind: 'multi', ids: [] };   // 一张都没选
        if (req.mode === 'target') { targetAsks += 1; return null; }
        return null;
      },
    });

    await dispatchCardUsed(deps, used(kx, [a]));

    expect(targetAsks).toBe(0);
    expect((kx.placedCards ?? []).length).toBe(2);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：三个选项都选过 → 不再询问', async () => {
    const { kx, a, b } = setup();
    b.hand = [card()];
    kx.placedCards = [card(), card(), card(), card(), card(), card(), card(), card(), card(), card()];
    let asked = 0;
    const { deps } = makeHarness([kx, a, b], {
      requestChoice: async (req) => {
        asked += 1;
        if (req.mode === 'multi') return { kind: 'multi', ids: (req.choices ?? []).slice(0, req.min ?? 1).map(c => c.id) };
        if (req.mode === 'target') return { kind: 'target', ids: [b.id] };
        if (req.mode === 'choose') return { kind: 'choose', id: String(req.choices?.[0]?.id ?? '1') };
        return null;
      },
    });

    await dispatchCardUsed(deps, used(kx, [b]));   // 选项 1 / 2 / 3 各一次
    await dispatchCardUsed(deps, used(kx, [b]));
    await dispatchCardUsed(deps, used(kx, [b]));
    expect(asked).toBe(9);

    await dispatchCardUsed(deps, used(kx, [b]));   // 第四次：三个选项都用过了
    expect(asked).toBe(9);
  });
});

describe('丁尚涴「抚悼」', () => {
  const setup = () => {
    const dsw = mkPlayer({ id: 0, name: '丁尚涴' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    return { dsw, a, b };
  };

  /** 「游戏开始时」选定甲为对象：唯一一次提问就是 mode:'target' */
  const withPartner = (dsw: ReturnType<typeof mkPlayer>, a: ReturnType<typeof mkPlayer>, b: ReturnType<typeof mkPlayer>) =>
    makeHarness([dsw, a, b], {
      requestChoice: async (req) => (req.mode === 'target' ? { kind: 'target', ids: [a.id] } : null),
    });

  it('正例：你指定其为目标 → 各摸两张牌', async () => {
    const { dsw, a, b } = setup();
    const { deps, fx } = withPartner(dsw, a, b);

    await dispatchTurnStart(deps, dsw);            // 「游戏开始时」选定甲
    expect(fx.logs.some(l => l.includes('抚悼') && l.includes('甲'))).toBe(true);

    await dispatchCardUsed(deps, { source: dsw, card: card(), targets: [a], usedCount: 1 });

    expect(fx.drawn).toEqual([{ playerId: dsw.id, count: 2 }, { playerId: a.id, count: 2 }]);
    expect(fx.banners.some(x => x.includes('抚悼'))).toBe(true);
  });

  it('正例：其指定你为目标 → 各摸两张牌；同一回合第二次不再触发', async () => {
    const { dsw, a, b } = setup();
    const { deps, fx } = withPartner(dsw, a, b);
    await dispatchTurnStart(deps, dsw);

    await dispatchCardUsed(deps, { source: a, card: card(), targets: [dsw], usedCount: 1 });
    expect(fx.drawn).toEqual([{ playerId: dsw.id, count: 2 }, { playerId: a.id, count: 2 }]);

    await dispatchCardUsed(deps, { source: dsw, card: card(), targets: [a], usedCount: 2 });
    expect(fx.drawn).toHaveLength(2);              // 每回合第一次：没有再摸
  });

  it('反例：新回合开始后复位，可再次触发', async () => {
    const { dsw, a, b } = setup();
    const { deps, fx } = withPartner(dsw, a, b);

    await dispatchTurnStart(deps, dsw);
    await dispatchCardUsed(deps, { source: dsw, card: card(), targets: [a], usedCount: 1 });
    expect(fx.drawn).toHaveLength(2);

    await dispatchTurnStart(deps, b);              // 新回合（任意角色的回合开始）
    await dispatchCardUsed(deps, { source: dsw, card: card(), targets: [a], usedCount: 1 });
    expect(fx.drawn).toHaveLength(4);
  });

  it('反例：指定的是别人（不是「另一方」）→ 不触发', async () => {
    const { dsw, a, b } = setup();
    const { deps, fx } = withPartner(dsw, a, b);
    await dispatchTurnStart(deps, dsw);

    await dispatchCardUsed(deps, { source: dsw, card: card(), targets: [b], usedCount: 1 });

    expect(fx.drawn).toEqual([]);
  });

  it('反例：对象已阵亡 → 不触发', async () => {
    const { dsw, a, b } = setup();
    const { deps, fx } = withPartner(dsw, a, b);
    await dispatchTurnStart(deps, dsw);            // 先选定甲，再让甲阵亡
    a.isDead = true;

    await dispatchCardUsed(deps, { source: dsw, card: card(), targets: [a], usedCount: 1 });

    expect(fx.drawn).toEqual([]);
  });

  it('正例：你或其阵亡 → 凶手获得「决裂」，其受到的伤害 +1', async () => {
    const { dsw, a, b } = setup();
    const { deps, fx } = withPartner(dsw, a, b);
    await dispatchTurnStart(deps, dsw);

    await dispatchDeath(deps, { dead: a, killer: b });     // 甲阵亡，乙是凶手
    expect(fx.logs.some(l => l.includes('决裂'))).toBe(true);

    const hit = await dispatchDamageBefore(deps, {
      victim: b, source: dsw, amount: 1, nature: 'normal', card: card(),
    });
    expect(hit.amount).toBe(2);
    expect(hit.note).toContain('决裂');
  });

  it('反例：没有「决裂」标记的角色受伤数值不变', async () => {
    const { dsw, a, b } = setup();
    const { deps } = withPartner(dsw, a, b);
    await dispatchTurnStart(deps, dsw);
    await dispatchDeath(deps, { dead: a, killer: b });

    const plain = await dispatchDamageBefore(deps, {
      victim: dsw, source: b, amount: 1, nature: 'normal', card: card(),
    });

    expect(plain.amount).toBeUndefined();
  });
});

describe('邓晚棠「黛颊」', () => {
  const setup = () => {
    const dwt = mkPlayer({ id: 0, name: '邓晚棠' });
    const a = mkPlayer({ id: 1, name: '甲' });
    return { dwt, a };
  };

  it('正例①：受到伤害后弃所有黑色手牌、回复 1 点体力，等量红色牌置于武将牌上', async () => {
    const { dwt, a } = setup();
    const black1 = card({ suit: Suit.SPADE });
    const black2 = card({ suit: Suit.CLUB });
    const redInHand = card({ suit: Suit.HEART });
    dwt.hand = [black1, black2, redInHand];
    const { deps, fx } = makeHarness([dwt, a]);       // 默认提问返回 null → 自动发动
    withDeck(deps, [card({ suit: Suit.HEART }), card({ suit: Suit.DIAMOND }), card({ suit: Suit.SPADE })]);

    await dispatchAfterDamage(deps, { victim: dwt, source: a, amount: 1, nature: 'normal', card: card() });

    expect(fx.discarded).toEqual([{ playerId: dwt.id, count: 2 }]);    // 只弃黑牌
    expect(fx.healed).toEqual([{ playerId: dwt.id, amount: 1 }]);
    expect((dwt.placedCards ?? []).length).toBe(2);                    // 等量张红色牌
    expect((dwt.placedCards ?? []).every(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND)).toBe(true);
    expect(fx.logs.some(l => l.includes('黛颊'))).toBe(true);
  });

  it('正例①：自己回合结束时（出牌阶段的近似时机）同样可发动', async () => {
    const { dwt, a } = setup();
    dwt.hand = [card({ suit: Suit.SPADE })];
    const { deps, fx } = makeHarness([dwt, a]);
    withDeck(deps, [card({ suit: Suit.DIAMOND })]);

    await dispatchTurnEnd(deps, dwt);

    expect(fx.discarded).toEqual([{ playerId: dwt.id, count: 1 }]);
    expect(fx.healed).toEqual([{ playerId: dwt.id, amount: 1 }]);
    expect((dwt.placedCards ?? []).length).toBe(1);
    expect(fx.logs.some(l => l.includes('出牌阶段'))).toBe(true);
  });

  it('反例①：没有黑色手牌（不成代价）→ 连问都不问', async () => {
    const { dwt, a } = setup();
    dwt.hand = [card({ suit: Suit.HEART })];
    let asked = 0;
    const { deps, fx } = makeHarness([dwt, a], {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchAfterDamage(deps, { victim: dwt, source: a, amount: 1, nature: 'normal', card: card() });

    expect(asked).toBe(0);
    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
    expect(dwt.placedCards ?? []).toEqual([]);
  });

  it('反例①：不是自己受到伤害 / 不是自己的回合结束 → 不发动', async () => {
    const { dwt, a } = setup();
    dwt.hand = [card({ suit: Suit.SPADE })];
    const { deps, fx } = makeHarness([dwt, a]);

    await dispatchAfterDamage(deps, { victim: a, source: dwt, amount: 1, nature: 'normal', card: card() });
    await dispatchTurnEnd(deps, a);

    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
  });

  it('正例②：其他角色指定你为目标 → 其交你一张牌，你交给其一张「黛」', async () => {
    const { dwt, a } = setup();
    const dai1 = card({ name: '桃' as Card['name'] });
    const dai2 = card({ name: '闪' as Card['name'] });
    dwt.placedCards = [dai1, dai2];
    a.hand = [card({ name: '酒' as Card['name'] })];
    const { deps } = makeHarness([dwt, a], {
      requestChoice: async (req) => (req.mode === 'choose' ? { kind: 'choose', id: 'yes' } : null),
    });
    const given = trackGain(deps);

    const r = await dispatchTargets(deps, {
      source: a, card: card({ name: '杀' as Card['name'] }), targets: [dwt],
    });

    expect(given).toEqual([
      { from: a.id, to: dwt.id, name: '酒' },        // 其须交给你 1 张牌
      { from: dwt.id, to: a.id, name: '桃' },        // 你交给其 1 张「黛」
    ]);
    // 选择获得所有「黛」：剩下那张进手牌，武将牌清空
    expect(dwt.placedCards ?? []).toEqual([]);
    expect(dwt.hand.map(c => c.id)).toEqual([dai2.id]);
    expect(r.targets.map(t => t.id)).toEqual([dwt.id]);   // 不改写目标
  });

  it('反例②：没有「黛」→ 不发动', async () => {
    const { dwt, a } = setup();
    a.hand = [card()];
    let asked = 0;
    const { deps } = makeHarness([dwt, a], { requestChoice: async () => { asked += 1; return null; } });
    const given = trackGain(deps);

    await dispatchTargets(deps, { source: a, card: card(), targets: [dwt] });

    expect(given).toEqual([]);
    expect(asked).toBe(0);
  });

  it('反例②：每回合首次——同一个使用者第二次指定你不再触发', async () => {
    const { dwt, a } = setup();
    dwt.placedCards = [card(), card(), card()];
    a.hand = [card(), card()];
    const { deps } = makeHarness([dwt, a], { requestChoice: async () => null });
    const given = trackGain(deps);

    await dispatchTargets(deps, { source: a, card: card({ name: '杀' as Card['name'] }), targets: [dwt] });
    expect(given).toHaveLength(2);

    await dispatchTargets(deps, { source: a, card: card({ name: '决斗' as Card['name'] }), targets: [dwt] });
    expect(given).toHaveLength(2);          // 第二次没加
  });

  it('反例②：自己使用牌指定自己 → 不发动', async () => {
    const { dwt, a } = setup();
    dwt.placedCards = [card()];
    const { deps } = makeHarness([dwt, a]);
    const given = trackGain(deps);

    await dispatchTargets(deps, { source: dwt, card: card({ name: '桃' as Card['name'] }), targets: [dwt] });

    expect(given).toEqual([]);
  });
});

describe('夏侯徽「笃君」', () => {
  const setup = () => {
    const xhh = mkPlayer({ id: 0, name: '夏侯徽' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    return { xhh, a, b };
  };

  /** 第一次提问选搭档（甲），之后的提问是「交给谁」（乙） */
  const withDujun = (
    xhh: ReturnType<typeof mkPlayer>,
    a: ReturnType<typeof mkPlayer>,
    b: ReturnType<typeof mkPlayer>,
  ) => {
    let targetCalls = 0;
    const h = makeHarness([xhh, a, b], {
      requestChoice: async (req) => {
        if (req.mode !== 'target') return null;
        targetCalls += 1;
        return { kind: 'target', ids: [targetCalls === 1 ? a.id : b.id] };
      },
    });
    withDraw(h.deps, h.fx);
    return { ...h, targetCalls: () => targetCalls };
  };

  it('正例：受到伤害后摸 2 张，然后把这些牌交给一名角色', async () => {
    const { xhh, a, b } = setup();
    const { deps, fx, targetCalls } = withDujun(xhh, a, b);

    await dispatchTurnStart(deps, xhh);            // 「游戏开始时」选定甲
    expect(fx.logs.some(l => l.includes('笃君') && l.includes('甲'))).toBe(true);

    await dispatchAfterDamage(deps, { victim: xhh, source: a, amount: 1, nature: 'normal', card: card() });

    expect(fx.drawn).toEqual([{ playerId: xhh.id, count: 2 }]);
    expect(targetCalls()).toBe(2);                 // 选搭档 + 选交给谁
    expect(fx.banners.some(x => x.includes('笃君'))).toBe(true);
  });

  it('正例：造成伤害后同样发动；同一次伤害事件两个钩子只结算一遍', async () => {
    const { xhh, a, b } = setup();
    const { deps, fx } = withDujun(xhh, a, b);
    await dispatchTurnStart(deps, xhh);

    const ev = { victim: b, source: xhh, amount: 1, nature: 'normal' as const, card: card() };
    await dispatchAfterDamage(deps, ev);           // 引擎对同一次伤害两个钩子各派发一次
    await dispatchAfterDealDamage(deps, ev);

    expect(fx.drawn).toEqual([{ playerId: xhh.id, count: 2 }]);
  });

  it('反例：与你、与其都无关的伤害 → 不发动', async () => {
    const xhh = mkPlayer({ id: 0, name: '夏侯徽' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    const c = mkPlayer({ id: 3, name: '丙' });
    let targetCalls = 0;
    const { deps, fx } = makeHarness([xhh, a, b, c], {
      requestChoice: async (req) => {
        if (req.mode !== 'target') return null;
        targetCalls += 1;
        return { kind: 'target', ids: [a.id] };      // 搭档 = 甲
      },
    });
    withDraw(deps, fx);
    await dispatchTurnStart(deps, xhh);

    // 乙打丙：当事方既不是夏侯徽也不是她的搭档甲
    await dispatchAfterDealDamage(deps, { victim: c, source: b, amount: 1, nature: 'normal', card: card() });

    expect(fx.drawn).toEqual([]);
    expect(targetCalls).toBe(1);                   // 只有「游戏开始时」那次提问
  });

  it('反例：每回合首次——第二次伤害不再发动；新回合开始后复位', async () => {
    const { xhh, a, b } = setup();
    const { deps, fx } = withDujun(xhh, a, b);
    await dispatchTurnStart(deps, xhh);

    await dispatchAfterDamage(deps, { victim: xhh, source: a, amount: 1, nature: 'normal', card: card() });
    await dispatchAfterDamage(deps, { victim: xhh, source: a, amount: 1, nature: 'normal', card: card() });
    expect(fx.drawn).toHaveLength(1);

    await dispatchTurnStart(deps, b);              // 新回合
    await dispatchAfterDamage(deps, { victim: xhh, source: a, amount: 1, nature: 'normal', card: card() });
    expect(fx.drawn).toHaveLength(2);
  });

  it('反例：场上没有其他存活角色 → 不选搭档也不发动', async () => {
    const xhh = mkPlayer({ id: 0, name: '夏侯徽' });
    const dead = mkPlayer({ id: 1, name: '甲', isDead: true });
    const { deps, fx } = makeHarness([xhh, dead]);

    await dispatchTurnStart(deps, xhh);
    await dispatchAfterDamage(deps, { victim: xhh, source: undefined, amount: 1, nature: 'normal', card: card() });

    expect(fx.drawn).toEqual([]);
    expect(fx.logs.some(l => l.includes('笃君'))).toBe(false);
  });
});

describe('这 5 个技能都已进注册表，注册名与 HEROES 逐字一致', () => {
  it('敏思 / 知否 / 抚悼 / 黛颊 / 笃君', () => {
    expect(skillsOf('王荣').map(d => d.skill)).toContain('敏思');
    expect(skillsOf('曹宪').map(d => d.skill)).toContain('知否');
    expect(skillsOf('丁尚涴').map(d => d.skill)).toContain('抚悼');
    expect(skillsOf('邓晚棠').map(d => d.skill)).toContain('黛颊');
    expect(skillsOf('夏侯徽').map(d => d.skill)).toContain('笃君');
  });
});
