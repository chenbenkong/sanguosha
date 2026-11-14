import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer, drawnFor } from './testHarness';
import { dispatchDeath, dispatchDying } from './dispatch';
import { registerSkill } from './registry';

/**
 * 新增的两个引擎钩子：afterDeath / onDying。
 *
 * 这两个钩子此前**不存在**，导致 4 个技能无法实装（追德要「死亡时」、
 * 御心/困励/殇决要「濒死时」）。这里守的是钩子本身能被派发到，
 * 以及「不该触发时不触发」的边界。
 */

describe('afterDeath 钩子', () => {
  it('角色阵亡后能派发到已注册的技能', () => {
    const got: string[] = [];
    registerSkill({
      hero: '测试阵亡将',
      skill: '测试阵亡技',
      hooks: {
        afterDeath: (ctx, ev) => {
          got.push(`${ctx.self.hero.name}:${ev.dead.hero.name}`);
        },
      },
    });
    const owner = mkPlayer({ id: 0, name: '测试阵亡将' });
    const dead = mkPlayer({ id: 1, name: '死者' });
    const { deps } = makeHarness([owner, dead]);
    return dispatchDeath(deps, { dead, killer: undefined }).then(() => {
      expect(got).toContain('测试阵亡将:死者');
    });
  });

  it('同一次死亡只派发一次（withGuard 去重，防呼叫链重入时重复结算）', async () => {
    let n = 0;
    registerSkill({
      hero: '计数将',
      skill: '计数技',
      hooks: { afterDeath: () => { n += 1; } },
    });
    const owner = mkPlayer({ id: 0, name: '计数将' });
    const dead = mkPlayer({ id: 1, name: '死者2' });
    const { deps } = makeHarness([owner, dead]);
    await dispatchDeath(deps, { dead, killer: undefined });
    expect(n).toBe(1);
  });
});

describe('onDying 钩子', () => {
  it('技能返回 hp 时引擎采用该结果（用于御心/困励救人）', async () => {
    registerSkill({
      hero: '测试濒死将',
      skill: '测试濒死技',
      hooks: {
        onDying: (_ctx, ev) => (ev.victim.hp <= 0 ? { hp: 2, note: '救回' } : null),
      },
    });
    const owner = mkPlayer({ id: 0, name: '测试濒死将' });
    const victim = mkPlayer({ id: 1, name: '濒死者', hp: 0 });
    const { deps } = makeHarness([owner, victim]);
    const r = await dispatchDying(deps, { victim, source: undefined, needHp: 1 });
    expect(r).not.toBe(null);
    expect(r!.hp).toBe(2);
  });

  it('没有技能干预时返回 null，由引擎走正常求桃流程', async () => {
    const owner = mkPlayer({ id: 0, name: '无关将' });
    const victim = mkPlayer({ id: 1, name: '濒死者2', hp: 0 });
    const { deps } = makeHarness([owner, victim]);
    const r = await dispatchDying(deps, { victim, source: undefined, needHp: 1 });
    expect(r).toBe(null);
  });

  it('多个技能都想救时取第一个给出结果的（不叠加，避免一死救两次）', async () => {
    registerSkill({ hero: '甲将', skill: '甲技', hooks: { onDying: () => ({ hp: 1 }) } });
    registerSkill({ hero: '乙将', skill: '乙技', hooks: { onDying: () => ({ hp: 3 }) } });
    const a = mkPlayer({ id: 0, name: '甲将' });
    const b = mkPlayer({ id: 1, name: '乙将' });
    const victim = mkPlayer({ id: 2, name: '濒死者3', hp: 0 });
    const { deps } = makeHarness([a, b, victim]);
    const r = await dispatchDying(deps, { victim, source: undefined, needHp: 1 });
    expect(r!.hp).toBe(1);
  });
});
