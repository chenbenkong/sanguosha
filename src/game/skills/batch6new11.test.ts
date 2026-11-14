import { describe, expect, it } from 'vitest';
import { drawnFor, makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchCardLost, dispatchDrawPhaseBegin, dispatchTurnStart } from './dispatch';
import { registerSkill, skillsOf } from './registry';
import type { CardLostEvent, SkillContext } from './registry';
import { CardType } from '../../../types';
import type { Card, Player } from '../../../types';
import { HEROES } from '../../../constants';
import './batch6new11';
// 「慧淑」的数字由「易数」改：本组要验的正是这份共享契约（batch6new2.ts:42-54 / :89），
// 所以这里把真实实现一起载入，而不是测试里自造一个替身去写 heroMemory。
import './batch6new2';

/**
 * 第六批女将 · 第 11 组（引擎能力补齐后的回填）的行为测试。
 *
 * 本文件只覆盖**已实装**的「慧淑」。同组的董贵人「☆ 受责」与全惠解「离宫」
 * 缺的不是 ctx 原语而是**派发点没有接线**（App.tsx:4083 的 dispatchTurnEnd 是手写
 * deps 字面量，没传 takeFromDiscard / loseHp；App.tsx:2666 同型），照原文写出来
 * 只会注册一个永远静默的假技能，因此整条未实装——理由与证据见 batch6new11.ts 的头注。
 *
 * 断言的是**规则**：什么时候触发、摸了谁的牌、弃置几张、阈值怎么算、
 * 第一次之后还结算不结算、弃牌堆里没有锦囊牌时怎么办。每个技能都配反例。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);
const trick = (o: Partial<Card> = {}) => mkCard({ type: CardType.SCROLL, name: '无中生有' as Card['name'], ...o });
const equip = (o: Partial<Card> = {}) => mkCard({ type: CardType.EQUIPMENT, name: '赤兔' as Card['name'], ...o });
const quan = () => mkPlayer({ id: 0, name: '全惠解' });

const lost = (p: Player, cards: Card[]): CardLostEvent =>
  ({ player: p, cards, cause: 'discard', handAfter: 0, fromEquip: false });

type Deps = ReturnType<typeof makeHarness>['deps'];

/** 摸牌夹具：draw 既回传牌、也真的进手牌（引擎 drawCards 的行为，App.tsx:1499-1555） */
const withDraw = (deps: Deps, deck: Card[]) => {
  const bookkeeping = deps.draw;        // 夹具的记账实现：把摸牌写进 fx.drawn
  deps.draw = (pid, count) => {
    bookkeeping(pid, count);            // 记账仍走夹具，避免出现两套口径
    const taken = deck.splice(0, count);
    const p = deps.players.find(x => x.id === pid);
    if (p) p.hand = [...p.hand, ...taken];
    return taken;
  };
  return deck;
};

/** 弃置夹具：记录弃了哪几张、是不是从手牌里出的，并从手牌移除 */
const withDiscard = (deps: Deps) => {
  const out: Array<{ playerId: number; names: string[]; fromHand: number }> = [];
  deps.discard = (pid, cards) => {
    const p = deps.players.find(x => x.id === pid);
    const owned = p ? cards.filter(c => p.hand.some(x => x.id === c.id)).length : 0;
    out.push({ playerId: pid, names: cards.map(c => String(c.name)), fromHand: owned });
    if (p) p.hand = p.hand.filter(c => !cards.some(x => x.id === c.id));
  };
  return out;
};

/**
 * 弃牌堆夹具：takeFromDiscard 按 App.tsx:948-959 的真实实现——
 * 从存储顺序扫描、按 pred 取至多 count 张，取到 0 张时不动弃牌堆。
 * 记录每次调用的 count 与取走了哪张（「按条件取」而不是「取第一张」的证据）。
 */
const withDiscardPile = (deps: Deps, pile: Card[]) => {
  const calls: Array<{ count: number; taken: string[] }> = [];
  deps.takeFromDiscard = (pred, count) => {
    const taken: Card[] = [];
    const rest: Card[] = [];
    for (const c of pile) {
      if (taken.length < count && pred(c)) taken.push(c);
      else rest.push(c);
    }
    calls.push({ count, taken: taken.map(c => String(c.name)) });
    if (!taken.length) return [];
    pile.length = 0;
    pile.push(...rest);
    return taken;
  };
  return { calls, pile };
};

/** 记录「获得牌」：gainCard 在夹具里是空实现 */
const trackGain = (deps: Deps) => {
  const given: Array<{ from: number; to: number; name: string }> = [];
  deps.gainCard = (from, to, c) => { given.push({ from, to, name: String(c.name) }); };
  return given;
};

/** 记录体力流失（引擎实现见 App.tsx:960-968：扣体力，不派发伤害事件） */
const trackLoseHp = (deps: Deps) => {
  const hits: Array<{ pid: number; amount: number }> = [];
  deps.loseHp = async (pid, amount) => {
    hits.push({ pid, amount });
    const p = deps.players.find(x => x.id === pid);
    if (p) p.hp = Math.max(0, p.hp - amount);
  };
  return hits;
};

/**
 * 只在测试里注册的探针技能：唯一用途是证明 ctx.loseHp 会把 deps 的实现透传下来。
 * 本组实装的「慧淑」不用 loseHp（「☆ 受责」用它但未实装），所以没有别的观测点。
 * 与 registry.test.ts:20-30 用替身技能验证分发器是同一手法。
 */
registerSkill({
  hero: '探针武将',
  skill: '探针',
  hooks: {
    onTurnStart: async (ctx: SkillContext) => { await ctx.loseHp(ctx.self.id, 1); },
  },
});

describe('引擎原语可达性（本组的前提）', () => {
  it('ctx.takeFromDiscard 透传 deps 的实现，不是 dispatch.ts:161 的空桩', async () => {
    const q = quan();
    const { deps } = makeHarness([q]);
    let called = 0;
    deps.takeFromDiscard = () => { called += 1; return []; };
    withDraw(deps, [card(), card()]);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });          // 发动慧淑（AI 分支）
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));  // 本回合弃置 3 > 2

    expect(called).toBe(1);
  });

  it('ctx.loseHp 同样透传（步进 1 点体力，不派发伤害事件）', async () => {
    const probe = mkPlayer({ id: 0, name: '探针武将' });
    const { deps, fx } = makeHarness([probe]);
    const hits = trackLoseHp(deps);

    await dispatchTurnStart(deps, probe);

    expect(hits).toEqual([{ pid: probe.id, amount: 1 }]);
    expect(probe.hp).toBe(2);
    expect(fx.damaged).toEqual([]);        // 体力流失 ≠ 受到伤害
  });
});

describe('全惠解「慧淑」', () => {
  it('正例：发动时自己接管摸牌阶段——摸 2+2 张、随机弃 1 张手牌，并返回 replaced', async () => {
    const q = quan();
    const { deps, fx } = makeHarness([q]);          // requestChoice 默认 null = AI / 托管
    withDraw(deps, [card(), card(), card(), card()]);
    const dropped = withDiscard(deps);

    const r = await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });

    // replaced：引擎据此跳过自己那次 drawCards（App.tsx:3182），否则会重复摸
    expect(r.replaced).toBe(true);
    expect(r.count).toBe(0);
    // 摸牌阶段 2 张（ev.count，已含 drawPhaseBonus 的累加）+ 慧淑 2 张
    expect(drawnFor(fx, q.id)).toBe(4);
    // 随机弃置 1 张，且弃的是**摸牌后**的手牌（弃前手牌为空）
    expect(dropped).toHaveLength(1);
    expect(dropped[0].playerId).toBe(q.id);
    expect(dropped[0].fromHand).toBe(1);
    expect(q.hand).toHaveLength(3);                  // 4 摸 − 1 弃
    expect(fx.logs.some(l => l.includes('【慧淑】') && l.includes('摸 4 张牌（摸牌阶段 2 + 慧淑 2）')))
      .toBe(true);
    expect(fx.banners).toContain('全惠解:慧淑');
  });

  it('正例：本回合弃置总数第一次大于阈值时，从弃牌堆获得一张锦囊牌（只取锦囊）', async () => {
    const q = quan();
    const { deps, fx } = makeHarness([q]);
    withDraw(deps, [card(), card()]);
    const gain = trackGain(deps);
    const { calls, pile } = withDiscardPile(deps, [
      card({ name: '杀' as Card['name'] }),
      trick({ name: '无中生有' as Card['name'] }),
      equip(),
    ]);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });           // 发动（弃置总数为 1 的那张由引擎上报，夹具不派发）
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));  // 本回合弃置 3 > 2

    expect(calls).toHaveLength(1);
    expect(calls[0].count).toBe(1);
    // 按 pred 取到的是锦囊，而不是弃牌堆里的第一张：证明过滤真的生效
    expect(calls[0].taken).toEqual(['无中生有']);
    expect(pile.map(c => String(c.name))).toEqual(['杀', '赤兔']);     // 其余留在弃牌堆
    expect(gain).toEqual([{ from: q.id, to: q.id, name: '无中生有' }]);
    expect(fx.logs.some(l => l.includes('第一次大于 2（3）') && l.includes('获得【无中生有】')))
      .toBe(true);
    expect(fx.banners).toContain('全惠解:慧淑');
  });

  it('反例：玩家选「不发动」→ 不接管摸牌阶段，也没有后面的收益（「若如此做」）', async () => {
    const q = quan();
    const { deps, fx } = makeHarness([q], { requestChoice: async () => ({ kind: 'choose', id: 'no' }) });
    withDraw(deps, [card(), card()]);
    const { calls } = withDiscardPile(deps, [trick()]);
    const gain = trackGain(deps);

    const r = await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });
    expect(r.replaced).toBeFalsy();                 // 交回引擎正常摸牌
    expect(drawnFor(fx, q.id)).toBe(0);
    expect(fx.discarded).toEqual([]);

    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    expect(calls).toEqual([]);
    expect(gain).toEqual([]);
  });

  it('反例：弃置总数没超过阈值时不获得，跨过阈值的那一次才结算', async () => {
    const q = quan();
    const { deps } = makeHarness([q]);
    withDraw(deps, [card(), card()]);
    const { calls } = withDiscardPile(deps, [trick()]);
    const gain = trackGain(deps);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });
    await dispatchCardLost(deps, lost(q, [card(), card()]));          // 2 张：不大于 2
    expect(calls).toEqual([]);
    expect(gain).toEqual([]);

    await dispatchCardLost(deps, lost(q, [card()]));                  // 累计 3：第一次大于 2
    expect(calls).toHaveLength(1);
    expect(gain).toHaveLength(1);
  });

  it('反例：「第一次」只结算一次——之后本回合再弃置也不再获得', async () => {
    const q = quan();
    const { deps } = makeHarness([q]);
    withDraw(deps, [card(), card()]);
    const { calls } = withDiscardPile(deps, [trick(), trick()]);
    const gain = trackGain(deps);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));   // 累计 6

    expect(calls).toHaveLength(1);
    expect(gain).toHaveLength(1);
  });

  it('反例：弃牌堆里没有锦囊牌时不获得，且不再补结算', async () => {
    const q = quan();
    const { deps, fx } = makeHarness([q]);
    withDraw(deps, [card(), card()]);
    const { calls } = withDiscardPile(deps, [card({ name: '杀' as Card['name'] }), equip()]);
    const gain = trackGain(deps);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));

    expect(calls).toHaveLength(1);                                     // 关口只过一次
    expect(gain).toEqual([]);
    expect(fx.logs.some(l => l.includes('弃牌堆里没有锦囊牌'))).toBe(true);
    expect(fx.logs.some(l => l.includes('获得【'))).toBe(false);
  });

  it('反例：不是自己的回合时弃置不计入「本回合」', async () => {
    const q = quan();
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps } = makeHarness([q, other]);
    withDraw(deps, [card(), card()]);
    const { calls } = withDiscardPile(deps, [trick(), trick()]);
    const gain = trackGain(deps);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });            // 自己的摸牌阶段：发动

    deps.turnOwner = other;                                            // 变成别人的回合
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    expect(calls).toEqual([]);
    expect(gain).toEqual([]);

    deps.turnOwner = q;                                                // 对照：自己的回合
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    expect(calls).toHaveLength(1);
    expect(gain).toHaveLength(1);
  });

  it('正例：摸牌数与阈值读的是易数改的那份「慧淑」数字（不是写死的 2）', async () => {
    const q = quan();
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([q, other]);
    withDraw(deps, [card(), card(), card(), card(), card()]);

    deps.turnOwner = other;                                            // 回合外
    await dispatchCardLost(deps, lost(q, [card()]));                   // 易数：2/2 → 3/2
    expect(fx.logs.some(l => l.includes('【易数】') && l.includes('数字 2/2 → 3/2'))).toBe(true);

    deps.turnOwner = q;
    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });

    // 摸牌阶段 2 + 慧淑 nums[0]=3（若写死 2 这里会是 4）
    expect(drawnFor(fx, q.id)).toBe(5);
    expect(fx.logs.some(l => l.includes('摸 5 张牌（摸牌阶段 2 + 慧淑 3）'))).toBe(true);
  });

  it('反例：新回合复位——回合开始后要重新发动才会再触发', async () => {
    const q = quan();
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps } = makeHarness([q, other]);
    withDraw(deps, [card(), card(), card(), card(), card(), card(), card(), card()]);
    const { calls } = withDiscardPile(deps, [trick(), trick()]);
    const gain = trackGain(deps);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    expect(calls).toHaveLength(1);

    await dispatchTurnStart(deps, other);                              // 新回合（任意角色的回合开始）

    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));   // 没有重新发动 → 不结算
    expect(calls).toHaveLength(1);

    await dispatchDrawPhaseBegin(deps, q.id, { count: 2 });            // 重新发动
    await dispatchCardLost(deps, lost(q, [card(), card(), card()]));
    expect(calls).toHaveLength(2);
    expect(gain).toHaveLength(2);
  });
});

describe('注册名与 HEROES 逐字一致', () => {
  it('全惠解：慧淑', () => {
    const declared = (HEROES.find(h => h.name === '全惠解')?.skillName ?? '')
      .split('/').map(s => s.trim());
    expect(declared).toContain('慧淑');
    expect(skillsOf('全惠解').map(d => d.skill)).toContain('慧淑');
  });
});
