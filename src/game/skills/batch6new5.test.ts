import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchCardGain, dispatchDeath, dispatchTargets } from './dispatch';
import { skillsOf } from './registry';
import type { Card, Player } from '../../../types';
import './batch6new5';

/**
 * 第六批女将 · 第 5 组：引擎能力补齐后回填的 4 个技能。
 *
 * 断言的是**规则**：什么时候触发、改了什么、代价付了几张、凑不齐时怎么办。
 * 每个技能都配反例——只测正例等于没测边界。
 *
 * 「花火」不在本批（仍缺「使用一张牌」的入口），它的守卫留在
 * batch6new4.test.ts 里。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);

/**
 * 装上一副真牌堆：takeFromDeck 按 App.tsx 的实现（数组尾部是顶、从头到尾扫）。
 * 记录每次调用，便于断言「按牌名精确取」而不是「摸四张」。
 */
const withDeck = (
  deps: ReturnType<typeof makeHarness>['deps'],
  deck: Card[],
) => {
  const calls: Array<{ count: number; taken: string[] }> = [];
  deps.takeFromDeck = (pred, count) => {
    const taken: Card[] = [];
    const rest: Card[] = [];
    for (let i = deck.length - 1; i >= 0; i--) {
      const c = deck[i];
      if (taken.length < count && pred(c)) taken.push(c);
      else rest.unshift(c);
    }
    calls.push({ count, taken: taken.map(c => String(c.name)) });
    if (taken.length === 0) return [];
    deck.length = 0;
    deck.push(...rest);
    return taken;
  };
  return { calls, deck };
};

/** 记录交出的牌：gainCard 在夹具里是空实现，这里替换成可见的记账 */
const trackGain = (deps: ReturnType<typeof makeHarness>['deps']) => {
  const given: Array<{ from: number; to: number; name: string }> = [];
  deps.gainCard = (from: number, to: number, c: Card) => {
    given.push({ from, to, name: String(c.name) });
  };
  return given;
};

describe('王荣「追德」', () => {
  const setup = () => {
    const wr = mkPlayer({ id: 0, name: '王荣', isDead: true });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    b.hand = [card(), card()];            // 乙手牌更多 → 自动分支应选甲
    return { wr, a, b };
  };

  it('正例：自己死亡时，按牌名精确取杀/闪/桃/酒各一张交给一名其他角色', async () => {
    const { wr, a, b } = setup();
    const { deps, fx } = makeHarness([wr, a, b]);
    const deck = [
      card({ name: '闪' as Card['name'] }),
      card({ name: '杀' as Card['name'] }),
      card({ name: '桃' as Card['name'] }),
      card({ name: '酒' as Card['name'] }),
      card(),                              // 多出来的【杀】不该被取走
    ];
    const { calls } = withDeck(deps, deck);
    const given = trackGain(deps);

    await dispatchDeath(deps, { dead: wr, killer: undefined });

    // 四种牌名各问一次牌堆，每次至多 1 张 —— 这是「精确取」的证据
    expect(calls.map(c => c.count)).toEqual([1, 1, 1, 1]);
    expect(calls.map(c => c.taken[0])).toEqual(['杀', '闪', '桃', '酒']);
    // 四张都交给同一个人（自动分支：手牌最少的甲）
    expect(given).toHaveLength(4);
    expect(new Set(given.map(g => g.to))).toEqual(new Set([a.id]));
    expect(given.map(g => g.from)).toEqual([wr.id, wr.id, wr.id, wr.id]);
    expect(fx.logs.some(l => l.includes('追德') && l.includes('4 张'))).toBe(true);
    expect(fx.banners.some(x => x.includes('追德'))).toBe(true);
  });

  it('反例：其他角色死亡不发动（原文是「当你死亡时」）', async () => {
    const { wr, a, b } = setup();
    wr.isDead = false;
    a.isDead = true;
    const { deps, fx } = makeHarness([wr, a, b]);
    const { calls } = withDeck(deps, [card({ name: '杀' as Card['name'] })]);
    const given = trackGain(deps);

    await dispatchDeath(deps, { dead: a, killer: undefined });

    expect(calls).toEqual([]);
    expect(given).toEqual([]);
    expect(fx.logs.some(l => l.includes('追德'))).toBe(false);
  });

  it('反例：牌堆凑不齐时按实际可得数量给，并在战报里写明「只取到 N 种」', async () => {
    const { wr, a, b } = setup();
    const { deps, fx } = makeHarness([wr, a, b]);
    // 牌堆里只有【杀】和【桃】
    withDeck(deps, [card({ name: '杀' as Card['name'] }), card({ name: '桃' as Card['name'] })]);
    const given = trackGain(deps);

    await dispatchDeath(deps, { dead: wr, killer: undefined });

    expect(given).toHaveLength(2);
    expect(fx.logs.some(l => l.includes('只取到 2 种'))).toBe(true);
  });

  it('反例：一张都取不到时不发动（没有「获得牌」这一结果）', async () => {
    const { wr, a, b } = setup();
    const { deps, fx } = makeHarness([wr, a, b]);
    withDeck(deps, []);                    // 空牌堆
    const given = trackGain(deps);

    await dispatchDeath(deps, { dead: wr, killer: undefined });

    expect(given).toEqual([]);
    expect(fx.logs.some(l => l.includes('追德'))).toBe(false);
  });

  it('反例：场上没有其他存活角色时不发动', async () => {
    const wr = mkPlayer({ id: 0, name: '王荣', isDead: true });
    const dead = mkPlayer({ id: 1, name: '甲', isDead: true });
    const { deps, fx } = makeHarness([wr, dead]);
    const { calls } = withDeck(deps, [card({ name: '杀' as Card['name'] })]);

    await dispatchDeath(deps, { dead: wr, killer: undefined });

    expect(calls).toEqual([]);
    expect(fx.logs.some(l => l.includes('追德'))).toBe(false);
  });
});

describe('卢弈「邀弈」', () => {
  const setup = () => {
    const ly = mkPlayer({ id: 0, name: '卢弈' });
    ly.hand = [card({ name: '闪' as Card['name'] })];
    const foe = mkPlayer({ id: 1, name: '甲' });
    const third = mkPlayer({ id: 2, name: '乙' });
    return { ly, foe, third };
  };

  it('正例：弃一张牌，令【杀】的目标改为自己', async () => {
    const { ly, foe, third } = setup();
    const { deps, fx } = makeHarness([ly, foe, third]);
    const slash = card({ name: '杀' as Card['name'] });

    const r = await dispatchTargets(deps, { source: foe, card: slash, targets: [third] });

    expect(r.targets.map(t => t.id)).toEqual([ly.id]);
    // 代价：真的弃了一张（自己手里那唯一一张）
    expect(fx.discarded).toEqual([{ playerId: ly.id, count: 1 }]);
    expect(fx.logs.some(l => l.includes('邀弈'))).toBe(true);
  });

  it('反例：不是【杀】时不发动', async () => {
    const { ly, foe, third } = setup();
    const { deps, fx } = makeHarness([ly, foe, third]);
    const trick = card({ name: '决斗' as Card['name'] });   // 伤害类锦囊，但不是杀

    const r = await dispatchTargets(deps, { source: foe, card: trick, targets: [third] });

    expect(r.targets.map(t => t.id)).toEqual([third.id]);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：自己已是目标时不重复改写', async () => {
    const { ly, foe, third } = setup();
    const { deps, fx } = makeHarness([ly, foe, third]);
    const slash = card({ name: '杀' as Card['name'] });

    const r = await dispatchTargets(deps, { source: foe, card: slash, targets: [ly, third] });

    expect(r.targets.map(t => t.id)).toEqual([ly.id, third.id]);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：手牌为空（付不起代价）时不发动', async () => {
    const ly = mkPlayer({ id: 0, name: '卢弈' });          // 空手牌
    const foe = mkPlayer({ id: 1, name: '甲' });
    const third = mkPlayer({ id: 2, name: '乙' });
    const { deps, fx } = makeHarness([ly, foe, third]);

    const r = await dispatchTargets(deps, {
      source: foe, card: card({ name: '杀' as Card['name'] }), targets: [third],
    });

    expect(r.targets.map(t => t.id)).toEqual([third.id]);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：自己使用【杀】时不发动（不能把目标改成自己）', async () => {
    const { ly, foe, third } = setup();
    const { deps } = makeHarness([ly, foe, third]);

    const r = await dispatchTargets(deps, {
      source: ly, card: card({ name: '杀' as Card['name'] }), targets: [foe, third],
    });

    expect(r.targets.map(t => t.id)).toEqual([foe.id, third.id]);
  });
});

describe('张怀「劳燕」', () => {
  const setup = () => {
    const zh = mkPlayer({ id: 0, name: '张怀' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    return { zh, a, b };
  };

  it('正例：多目标牌指定自己时，目标被裁成自己一个', async () => {
    const { zh, a, b } = setup();
    const { deps, fx } = makeHarness([zh, a, b]);

    const r = await dispatchTargets(deps, {
      source: a, card: card({ name: '万箭齐发' as Card['name'] }), targets: [zh, b],
    });

    expect(r.targets.map(t => t.id)).toEqual([zh.id]);
    expect(fx.logs.some(l => l.includes('劳燕'))).toBe(true);
  });

  it('反例：自己是唯一目标时不发动（原文是「指定多个目标」）', async () => {
    const { zh, a, b } = setup();
    const { deps, fx } = makeHarness([zh, a, b]);

    const r = await dispatchTargets(deps, {
      source: a, card: card({ name: '杀' as Card['name'] }), targets: [zh],
    });

    expect(r.targets.map(t => t.id)).toEqual([zh.id]);
    expect(fx.logs.some(l => l.includes('劳燕'))).toBe(false);
  });

  it('反例：自己不在目标里时不干预', async () => {
    const { zh, a, b } = setup();
    const { deps, fx } = makeHarness([zh, a, b]);

    const r = await dispatchTargets(deps, {
      source: a, card: card({ name: '万箭齐发' as Card['name'] }), targets: [b, a],
    });

    expect(r.targets.map(t => t.id)).toEqual([b.id, a.id]);
    expect(fx.logs.some(l => l.includes('劳燕'))).toBe(false);
  });

  it('锁定技：不询问玩家，requestChoice 一次都不调', async () => {
    const { zh, a, b } = setup();
    let asked = 0;
    const { deps } = makeHarness([zh, a, b], {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchTargets(deps, {
      source: a, card: card({ name: '万箭齐发' as Card['name'] }), targets: [zh, b],
    });

    expect(asked).toBe(0);
  });
});

describe('芮姬「俐影」', () => {
  const setup = () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    b.hand = [card(), card(), card()];    // 乙手牌最多 → 自动分支给甲
    return { rj, a, b };
  };

  const gainEvent = (owner: Player, cards: Card[], from?: Player) =>
    ({ owner, cards, from });

  it('正例：获得牌后交给一名其他角色，然后摸一张', async () => {
    const { rj, a, b } = setup();
    const { deps, fx } = makeHarness([rj, a, b]);
    const given = trackGain(deps);
    const got = card({ name: '桃' as Card['name'] });

    await dispatchCardGain(deps, gainEvent(rj, [got]));

    expect(given).toEqual([{ from: rj.id, to: a.id, name: '桃' }]);
    expect(fx.drawn).toEqual([{ playerId: rj.id, count: 1 }]);
    expect(fx.logs.some(l => l.includes('俐影'))).toBe(true);
  });

  it('反例：其他角色获得牌不触发', async () => {
    const { rj, a, b } = setup();
    const { deps, fx } = makeHarness([rj, a, b]);
    const given = trackGain(deps);

    await dispatchCardGain(deps, gainEvent(a, [card()], b));

    expect(given).toEqual([]);
    expect(fx.drawn).toEqual([]);
  });

  it('反例：每回合限一次——同一回合第二次获得牌不再发动', async () => {
    const { rj, a, b } = setup();
    const { deps, fx } = makeHarness([rj, a, b]);
    const given = trackGain(deps);

    await dispatchCardGain(deps, gainEvent(rj, [card()]));
    expect(given).toHaveLength(1);

    await dispatchCardGain(deps, gainEvent(rj, [card()]));
    expect(given).toHaveLength(1);          // 第二次没加
    expect(fx.drawn).toHaveLength(1);       // 也只摸了一次
  });

  it('反例：新回合开始后复位，可再次发动', async () => {
    const { rj, a, b } = setup();
    const { deps } = makeHarness([rj, a, b]);
    const given = trackGain(deps);
    const { dispatchTurnStart } = await import('./dispatch');

    await dispatchCardGain(deps, gainEvent(rj, [card()]));
    expect(given).toHaveLength(1);

    await dispatchTurnStart(deps, b);        // 新回合（任意角色的回合开始）
    await dispatchCardGain(deps, gainEvent(rj, [card()]));
    expect(given).toHaveLength(2);
  });

  it('反例：场上没有其他存活角色时不发动', async () => {
    const rj = mkPlayer({ id: 0, name: '芮姬' });
    const dead = mkPlayer({ id: 1, name: '甲', isDead: true });
    const { deps, fx } = makeHarness([rj, dead]);
    const given = trackGain(deps);

    await dispatchCardGain(deps, gainEvent(rj, [card()]));

    expect(given).toEqual([]);
    expect(fx.drawn).toEqual([]);
  });
});

describe('这 4 个技能都已进注册表，注册名与 HEROES 逐字一致', () => {
  it('追德 / 邀弈 / 劳燕 / 俐影', () => {
    expect(skillsOf('王荣').map(d => d.skill)).toContain('追德');
    expect(skillsOf('卢弈').map(d => d.skill)).toContain('邀弈');
    expect(skillsOf('张怀').map(d => d.skill)).toContain('劳燕');
    expect(skillsOf('芮姬').map(d => d.skill)).toContain('俐影');
  });
});
