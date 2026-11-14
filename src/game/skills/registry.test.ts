import { describe, expect, it, beforeEach } from 'vitest';
import { registerSkill, skillsOf, skillHook, registeredHeroCount, __clearRegistry } from './registry';
import { dispatchTurnEnd, dispatchAfterDamage, dispatchJudge, __clearSkillMemory } from './dispatch';
import type { DispatchDeps } from './dispatch';
import { noopDeps } from './testHarness';
import { CardName, CardType, Identity, Suit } from '../../../types';
import type { Card, Player } from '../../../types';

const card = (o: Partial<Card> = {}): Card => ({
  id: 'c1', name: CardName.SHA, type: CardType.BASIC, suit: Suit.SPADE, rank: '7', value: 7,
  description: '', imageColor: '', ...o,
});

const mkPlayerNamed = (heroName: string, o: Partial<Player> = {}): Player => ({
  id: 0, isHuman: false,
  hero: { id: 'x', name: heroName, kingdom: '魏', maxHp: 3, avatarUrl: '', description: '', skillName: '', skillDesc: '', gender: 'female' },
  hp: 3, maxHp: 3, hand: [], identity: Identity.ZHONGCHEN, isDead: false, isRevealed: true, isSelected: false,
  ...o,
});

const mkPlayer = (o: Partial<Player> = {}): Player => mkPlayerNamed('测试武将', o);

const mkDeps = (players: Player[], over: Partial<DispatchDeps> = {}): DispatchDeps =>
  ({ ...noopDeps(players), ...over });

beforeEach(() => { __clearRegistry(); __clearSkillMemory(); });

describe('注册表：注册与查找', () => {
  it('注册后能按武将名查到', () => {
    registerSkill({ hero: '甲', skill: '技A', hooks: {} });
    expect(skillsOf('甲').length).toBe(1);
    expect(skillsOf('甲')[0].skill).toBe('技A');
  });
  it('同一武将多个技能都会保留', () => {
    registerSkill({ hero: '甲', skill: '技A', hooks: {} });
    registerSkill({ hero: '甲', skill: '技B', hooks: {} });
    expect(skillsOf('甲').length).toBe(2);
    expect(registeredHeroCount()).toBe(1);
  });
  it('未注册的武将返回空数组', () => {
    expect(skillsOf('不存在')).toEqual([]);
  });
  it('skillHook 只返回实现了该钩子的技能', () => {
    registerSkill({ hero: '甲', skill: '有回合结束', hooks: { onTurnEnd: () => {} } });
    registerSkill({ hero: '乙', skill: '没有', hooks: {} });
    const hooks = skillHook('onTurnEnd');
    expect(hooks.length).toBe(1);
    expect(hooks[0].def.hero).toBe('甲');
  });
});

describe('分发器：按时机调用', () => {
  it('回合结束会调用已注册的 onTurnEnd', async () => {
    const calls: string[] = [];
    registerSkill({
      hero: '甲', skill: '技',
      hooks: { onTurnEnd: (_ctx, ending) => { calls.push('end:' + ending.id); } },
    });
    const p0 = mkPlayerNamed('甲', { id: 0 });
    const p1 = mkPlayerNamed('乙', { id: 1 });
    await dispatchTurnEnd(mkDeps([p0, p1]), p1);
    expect(calls).toEqual(['end:1']);
  });

  it('死亡角色的技能不再触发', async () => {
    let hit = 0;
    registerSkill({
      hero: '甲', skill: '技',
      hooks: { onTurnEnd: () => { hit++; } },
    });
    const dead = mkPlayerNamed('甲', { id: 0, isDead: true });
    await dispatchTurnEnd(mkDeps([dead, mkPlayer({ id: 1 })]), mkPlayer({ id: 1 }));
    expect(hit).toBe(0);
  });

  it('技能被封印（skillsOn 为 false）时不触发', async () => {
    let hit = 0;
    registerSkill({
      hero: '甲', skill: '技',
      hooks: { onTurnEnd: () => { hit++; } },
    });
    const p = mkPlayerNamed('甲', { id: 0 });
    await dispatchTurnEnd(mkDeps([p], { skillsOn: () => false }), p);
    expect(hit).toBe(0);
  });

  it('记忆按「武将+技能」隔离，互不串味', async () => {
    const seen: Array<string | undefined> = [];
    registerSkill({
      hero: '甲', skill: '技能一',
      hooks: { onTurnEnd: ctx => { seen.push(ctx.memory.tag as string | undefined); ctx.memory.tag = 'A'; } },
    });
    registerSkill({
      hero: '乙', skill: '技能二',
      hooks: { onTurnEnd: ctx => { seen.push(ctx.memory.tag as string | undefined); ctx.memory.tag = 'B'; } },
    });
    const pa = mkPlayer({ id: 0, hero: { ...mkPlayer().hero, name: '甲' } });
    const pb = mkPlayer({ id: 1, hero: { ...mkPlayer().hero, name: '乙' } });
    const deps = mkDeps([pa, pb]);
    await dispatchTurnEnd(deps, pa);
    await dispatchTurnEnd(deps, pa);
    // 第一次两个都是 undefined；第二次甲=A 乙=B
    expect(seen).toEqual([undefined, undefined, 'A', 'B']);
  });

  it('伤害事件带上 victim/source/nature', async () => {
    let got: { victim: number; source?: number; nature: string } | null = null;
    registerSkill({
      hero: '甲', skill: '技',
      hooks: { afterDamage: (_ctx, ev) => { got = { victim: ev.victim.id, source: ev.source?.id, nature: ev.nature }; } },
    });
    const p0 = mkPlayerNamed('甲', { id: 0 });
    const p1 = mkPlayer({ id: 1 });
    await dispatchAfterDamage(mkDeps([p0, p1]), {
      victim: p1, source: p0, amount: 1, nature: 'fire', card: card(),
    });
    expect(got).toEqual({ victim: 1, source: 0, nature: 'fire' });
  });

  it('判定事件带上判定的角色与牌', async () => {
    let reason = '';
    registerSkill({
      hero: '甲', skill: '技',
      hooks: { afterJudge: (_ctx, ev) => { reason = ev.reason; } },
    });
    const p0 = mkPlayerNamed('甲', { id: 0 });
    await dispatchJudge(mkDeps([p0]), { owner: p0, card: card(), reason: '乐不思蜀' });
    expect(reason).toBe('乐不思蜀');
  });
});
