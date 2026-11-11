import { describe, expect, it } from 'vitest';
import { CardName, CardType, Suit } from '../../../types';
import type { Card, Player } from '../../../types';
import { mkCard, mkPlayer, makeHarness } from './testHarness';
import { dispatchJudgeBefore, dispatchDamageBefore } from './dispatch';
import { registerSkill, __clearRegistry } from './registry';
import { mergeDamageBefore, mergeJudgeBefore } from './engineAbilities';
import { __clearSkillMemory } from './dispatch';

/**
 * 引擎能力扩展测试：judgeBefore / damageBefore。
 *
 * 这两个钩子是「结算前介入」——原有 9 个钩子都是事后通知，
 * 无法表达刚烈改判、绝情改伤害、天香转移这类技能。
 */

const P = (name: string, id = 0, over: Partial<Player> = {}) => mkPlayer({ name, id, ...over });

describe('mergeDamageBefore 合并规则', () => {
  it('多个技能的数值修正取最后一次设置', () => {
    expect(mergeDamageBefore([{ amount: 2 }, { amount: 0 }, { amount: 1 }]).amount).toBe(1);
  });

  it('prevent 一旦出现即短路', () => {
    const r = mergeDamageBefore([{ amount: 5 }, { prevent: true }, { amount: 9 }]);
    expect(r.prevent).toBe(true);
    expect(r.amount).toBe(5); // 短路后不再接受后续 amount
  });

  it('transferTo 取第一个', () => {
    expect(mergeDamageBefore([{ transferTo: 2 }, { transferTo: 3 }]).transferTo).toBe(2);
  });

  it('空输入返回空对象', () => {
    expect(mergeDamageBefore([])).toEqual({});
  });

  it('note 会拼接', () => {
    expect(mergeDamageBefore([{ note: 'A' }, { note: 'B' }]).note).toBe('A；B');
  });
});

describe('mergeJudgeBefore 合并规则', () => {
  it('replaceWith 取最后一个（后注册覆盖）', () => {
    const a = mkCard({ name: CardName.SHA });
    const b = mkCard({ name: CardName.SHAN });
    expect(mergeJudgeBefore([{ replaceWith: a }, { replaceWith: b }]).replaceWith).toBe(b);
  });

  it('treatSuitAs 取第一个', () => {
    expect(mergeJudgeBefore([{ treatSuitAs: Suit.HEART }, { treatSuitAs: Suit.DIAMOND }]).treatSuitAs).toBe(Suit.HEART);
  });
});

describe('dispatchJudgeBefore 分发', () => {
  it('注册的 judgeBefore 能被调用并改写花色', async () => {
    __clearRegistry(); __clearSkillMemory();
    registerSkill({
      hero: '小乔', skill: '红颜',
      hooks: { judgeBefore: (_ctx, ev) => (ev.card.suit === Suit.DIAMOND ? { treatSuitAs: Suit.HEART } : null) },
    });
    const me = P('小乔');
    const { deps } = makeHarness([me]);
    const r = await dispatchJudgeBefore(deps, { owner: me, reason: 'x', card: mkCard({ suit: Suit.DIAMOND }) });
    expect(r.treatSuitAs).toBe(Suit.HEART);
  });

  it('没有技能干预时返回空对象', async () => {
    __clearRegistry(); __clearSkillMemory();
    const me = P('张飞');
    const { deps } = makeHarness([me]);
    const r = await dispatchJudgeBefore(deps, { owner: me, reason: 'x', card: mkCard() });
    expect(r).toEqual({});
  });
});

describe('dispatchDamageBefore 分发', () => {
  it('注册的 damageBefore 能降低伤害', async () => {
    __clearRegistry(); __clearSkillMemory();
    registerSkill({
      hero: '孙鲁班', skill: '骄矜',
      hooks: { damageBefore: (_ctx, ev) => (ev.amount > 1 ? { amount: ev.amount - 1, note: '骄矜减伤' } : null) },
    });
    const me = P('孙鲁班', 0);
    const foe = P('甲', 1);
    const { deps } = makeHarness([me, foe]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: foe, amount: 2, nature: 'normal', card: mkCard(),
    });
    expect(r.amount).toBe(1);
    expect(r.note).toContain('骄矜');
  });

  it('可以完全防止伤害', async () => {
    __clearRegistry(); __clearSkillMemory();
    registerSkill({
      hero: '孙茹', skill: '释衅',
      hooks: { damageBefore: (_ctx, ev) => (ev.nature === 'fire' ? { prevent: true } : null) },
    });
    const me = P('孙茹', 0);
    const { deps } = makeHarness([me, P('甲', 1)]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: P('甲', 1), amount: 3, nature: 'fire', card: mkCard(),
    });
    expect(r.prevent).toBe(true);
  });

  it('普通伤害不触发火焰免疫', async () => {
    __clearRegistry(); __clearSkillMemory();
    registerSkill({
      hero: '孙茹', skill: '释衅',
      hooks: { damageBefore: (_ctx, ev) => (ev.nature === 'fire' ? { prevent: true } : null) },
    });
    const me = P('孙茹', 0);
    const { deps } = makeHarness([me, P('甲', 1)]);
    const r = await dispatchDamageBefore(deps, {
      victim: me, source: P('甲', 1), amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(r.prevent).toBeUndefined();
  });

  it('已阵亡角色的技能不参与', async () => {
    __clearRegistry(); __clearSkillMemory();
    registerSkill({
      hero: '孙茹', skill: '释衅',
      hooks: { damageBefore: () => ({ prevent: true }) },
    });
    const dead = P('孙茹', 0, { isDead: true });
    const { deps } = makeHarness([dead, P('甲', 1)]);
    const r = await dispatchDamageBefore(deps, {
      victim: dead, source: P('甲', 1), amount: 1, nature: 'normal', card: mkCard(),
    });
    expect(r.prevent).toBeUndefined();
  });
});