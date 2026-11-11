import { describe, expect, it } from 'vitest';
import { mkCard, mkPlayer, makeHarness, damageFrom } from './testHarness';
import { dispatchTurnEnd, dispatchTurnStart } from './dispatch';
import type { SkillChoiceReq } from './dispatch';
import './index';

/**
 * 技能交互测试：验证玩家通过请求弹窗做出的选择确实改变了技能效果，
 * 以及取消时技能不产生副作用（AI / 托管返回 null 时走自动分支）。
 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

/** 记录收到的请求，并按预设回答 */
const recorder = (reply: (req: SkillChoiceReq) => { kind: string; id?: string; ids?: Array<string | number> } | null) => {
  const seen: SkillChoiceReq[] = [];
  return {
    seen,
    fn: async (req: SkillChoiceReq) => { seen.push(req); return reply(req); },
  };
};

describe('曹轶「蜜饴」交互', () => {
  it('玩家选定的目标决定伤害落点', async () => {
    const me = P('曹轶', 0, { hp: 4 });
    const A = P('甲', 1, { hp: 4, maxHp: 4 });
    const B = P('乙', 2, { hp: 4, maxHp: 4 });
    const rec = recorder(() => ({ kind: 'target', ids: [2] }));
    const { deps, fx } = makeHarness([me, A, B], { requestChoice: rec.fn });
    await dispatchTurnStart(deps, me);
    expect(rec.seen.length).toBe(1);
    expect(rec.seen[0].mode).toBe('target');
    expect(fx.damaged.some(d => d.victimId === 2)).toBe(true);
    expect(fx.damaged.some(d => d.victimId === 1)).toBe(false);
  });

  it('玩家取消时不造成伤害', async () => {
    const me = P('曹轶', 0, { hp: 4 });
    const A = P('甲', 1, { hp: 4, maxHp: 4 });
    const { deps, fx } = makeHarness([me, A], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnStart(deps, me);
    expect(damageFrom(fx, 0)).toBe(0);
  });

  it('AI / 托管（返回 null）回落到第一个目标', async () => {
    const me = P('曹轶', 0, { hp: 4 });
    const A = P('甲', 1, { hp: 4, maxHp: 4 });
    const B = P('乙', 2, { hp: 4, maxHp: 4 });
    const { deps, fx } = makeHarness([me, A, B], { requestChoice: async () => null });
    await dispatchTurnStart(deps, me);
    expect(damageFrom(fx, 0)).toBe(1);
  });

  it('有受伤友军时优先治疗（弹治疗选择而非伤害选择）', async () => {
    const me = P('曹轶', 0);
    const hurt = P('友', 1, { hp: 1, maxHp: 4 });
    const rec = recorder(() => ({ kind: 'cancel' }));
    const { deps, fx } = makeHarness([me, hurt], { requestChoice: rec.fn });
    await dispatchTurnStart(deps, me);
    // 现在治疗也会询问玩家，但问的是「回复体力」而不是「造成伤害」
    expect(rec.seen.length).toBeGreaterThan(0);
    expect(rec.seen[0].title).toContain('回复体力');
    expect(fx.healed.some(h => h.playerId === 1)).toBe(true);
  });
});

describe('王笙「遭谮」交互', () => {
  it('玩家选定的目标决定伤害落点', async () => {
    const me = P('王笙', 1, { hand: [mkCard()] });
    const A = P('甲', 0, { hp: 4, maxHp: 4 });
    const B = P('乙', 2, { hp: 4, maxHp: 4 });
    const rec = recorder(() => ({ kind: 'target', ids: [2] }));
    const { deps, fx } = makeHarness([A, me, B], { requestChoice: rec.fn });
    await dispatchTurnEnd(deps, A);
    expect(fx.damaged.some(d => d.victimId === 2)).toBe(true);
  });

  it('玩家取消时不造成伤害', async () => {
    const me = P('王笙', 1, { hand: [mkCard()] });
    const A = P('甲', 0, { hp: 4, maxHp: 4 });
    const { deps, fx } = makeHarness([A, me], { requestChoice: async () => ({ kind: 'cancel' }) });
    await dispatchTurnEnd(deps, A);
    expect(damageFrom(fx, 1)).toBe(0);
  });
});

describe('郭照「尊位」交互', () => {
  it('选择「追平体力」时只回血不摸牌', async () => {
    const gz = P('郭照', 0, { hp: 1, hand: [] });
    const rich = P('甲', 1, { hp: 4, hand: [mkCard(), mkCard(), mkCard()] });
    const rec = recorder(() => ({ kind: 'choose', id: 'hp' }));
    const { deps, fx } = makeHarness([gz, rich], { requestChoice: rec.fn });
    await dispatchTurnEnd(deps, gz);
    expect(rec.seen.length).toBe(1);
    expect(rec.seen[0].choices?.length).toBe(2);
    expect(fx.healed.some(h => h.playerId === 0)).toBe(true);
  });

  it('选择「追平手牌」时摸牌', async () => {
    const gz = P('郭照', 0, { hp: 1, hand: [] });
    const rich = P('甲', 1, { hp: 4, hand: [mkCard(), mkCard()] });
    const { deps, fx } = makeHarness([gz, rich], {
      requestChoice: async () => ({ kind: 'choose', id: 'hand' }),
    });
    await dispatchTurnEnd(deps, gz);
    expect(fx.drawn.some(d => d.playerId === 0)).toBe(true);
  });
});
