import { describe, expect, it } from 'vitest';
import { Suit } from '../../../types';
import { mkCard, mkPlayer, makeHarness } from './testHarness';
import { dispatchTurnStart, dispatchTurnEnd, dispatchJudge } from './dispatch';
import type { SkillChoiceReq } from './dispatch';
import './index';

/** 第二批交互测试：顺世 / 无胁 / 宛蝉 / 绛脂 的玩家选择。 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

const recorder = (reply: (req: SkillChoiceReq) => { kind: string; id?: string; ids?: Array<string | number> } | null) => {
  const seen: SkillChoiceReq[] = [];
  return {
    seen,
    fn: async (req: SkillChoiceReq) => { seen.push(req); return reply(req); },
  };
};

describe('杜夫人「顺世」交互', () => {
  it('玩家选定的对象收到牌', async () => {
    const me = P('杜夫人', 0, { hand: [mkCard()] });
    const A = P('甲', 1);
    const B = P('乙', 2);
    const rec = recorder(() => ({ kind: 'target', ids: [2] }));
    const { deps, fx } = makeHarness([me, A, B], { requestChoice: rec.fn });
    await dispatchTurnStart(deps, me);
    expect(rec.seen.length).toBe(1);
    expect(rec.seen[0].mode).toBe('target');
    expect(fx.logs.some(l => l.includes('乙'))).toBe(true);
  });

  it('玩家取消时不发动', async () => {
    const me = P('杜夫人', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('顺世'))).toBe(false);
  });

  it('AI（返回 null）回落第一个目标', async () => {
    const me = P('杜夫人', 0, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, P('甲', 1)], { requestChoice: async () => null });
    await dispatchTurnStart(deps, me);
    expect(fx.logs.some(l => l.includes('顺世'))).toBe(true);
  });
});

describe('卞玥「无胁」交互', () => {
  it('玩家取消时不交换手牌', async () => {
    const me = P('卞玥', 0, { hand: [mkCard()] });
    const other = P('甲', 1, { hand: [mkCard()] });
    const { deps, fx } = makeHarness([me, other], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('无胁'))).toBe(false);
  });

  it('玩家选定对象后正常交换', async () => {
    const me = P('卞玥', 0, { hand: [mkCard()] });
    const A = P('甲', 1, { hand: [mkCard()] });
    const B = P('乙', 2, { hand: [mkCard()] });
    const rec = recorder(() => ({ kind: 'target', ids: [2] }));
    const { deps, fx } = makeHarness([me, A, B], { requestChoice: rec.fn });
    await dispatchTurnEnd(deps, me);
    expect(fx.logs.some(l => l.includes('无胁'))).toBe(true);
  });
});

describe('莫琼树「宛蝉」交互', () => {
  it('玩家选定令谁摸牌', async () => {
    const me = P('莫琼树', 0);
    const A = P('甲', 1);
    const B = P('乙', 2);
    const rec = recorder(() => ({ kind: 'target', ids: [2] }));
    const { deps, fx } = makeHarness([me, A, B], { requestChoice: rec.fn });
    await dispatchTurnStart(deps, me);
    expect(rec.seen.length).toBe(1);
    expect(fx.drawn.some(d => d.playerId === 2)).toBe(true);
    expect(fx.drawn.some(d => d.playerId === 1)).toBe(false);
  });

  it('玩家取消时无人摸牌', async () => {
    const me = P('莫琼树', 0);
    const { deps, fx } = makeHarness([me, P('甲', 1)], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnStart(deps, me);
    expect(fx.drawn.length).toBe(0);
  });
});

describe('莫琼树「绛脂」交互', () => {
  it('判定黑色时玩家选定弃谁两张', async () => {
    const me = P('莫琼树', 0);
    const A = P('甲', 1, { hand: [mkCard(), mkCard(), mkCard()] });
    const B = P('乙', 2, { hand: [mkCard(), mkCard()] });
    const rec = recorder(() => ({ kind: 'target', ids: [2] }));
    const { deps, fx } = makeHarness([me, A, B], { requestChoice: rec.fn });
    await dispatchJudge(deps, { owner: me, card: mkCard({ suit: Suit.SPADE }), reason: 'x' });
    expect(fx.discarded.some(d => d.playerId === 2)).toBe(true);
    expect(fx.discarded.some(d => d.playerId === 1)).toBe(false);
  });

  it('判定红色时摸三张且不询问', async () => {
    const me = P('莫琼树', 0);
    const rec = recorder(() => ({ kind: 'cancel' }));
    const { deps, fx } = makeHarness([me, P('甲', 1)], { requestChoice: rec.fn });
    await dispatchJudge(deps, { owner: me, card: mkCard({ suit: Suit.HEART }), reason: 'x' });
    expect(rec.seen.length).toBe(0);
    expect(fx.drawn.some(d => d.playerId === 0 && d.count === 3)).toBe(true);
  });
});
