import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchDeath, dispatchTargets } from './dispatch';
import { registerSkill } from './registry';

/**
 * 「死后仍要派发」与「结算前改目标」两组契约。
 *
 * 第一组守的是我自己的一个真 bug：afterDeath 最初走 ownersOf 默认过滤
 * （`!p.isDead`），于是「当你死亡时」的技能**永远派发不到已经阵亡的本人**。
 * 实测死者注册的 afterDeath 一次都没跑。修法是把 ownersOf 的第三参打开。
 */

describe('afterDeath 必须能派发到已阵亡的本人', () => {
  it('死者自己注册的 afterDeath 会被调用', async () => {
    let fired = 0;
    registerSkill({
      hero: '自亡将',
      skill: '自亡技',
      hooks: {
        afterDeath: (ctx, ev) => {
          if (ctx.self.id === ev.dead.id) fired += 1;
        },
      },
    });
    const owner = mkPlayer({ id: 0, name: '自亡将', isDead: true });
    const alive = mkPlayer({ id: 1, name: '生还者' });
    const { deps } = makeHarness([owner, alive]);
    await dispatchDeath(deps, { dead: owner, killer: undefined });
    expect(fired).toBe(1);
  });

  it('普通时机仍然不派发给已阵亡者（只有 afterDeath 放开）', async () => {
    let fired = 0;
    registerSkill({ hero: '亡者将', skill: '亡者技', hooks: { onTurnEnd: () => { fired += 1; } } });
    const dead = mkPlayer({ id: 0, name: '亡者将', isDead: true });
    const alive = mkPlayer({ id: 1, name: '生者' });
    const { deps } = makeHarness([dead, alive]);
    const { dispatchTurnEnd } = await import('./dispatch');
    await dispatchTurnEnd(deps, alive);
    expect(fired).toBe(0);
  });
});

describe('onTargetsChosen 结算前改目标', () => {
  it('技能返回新目标列表时会被采用', async () => {
    registerSkill({
      hero: '改目标将',
      skill: '改目标技',
      hooks: {
        onTargetsChosen: (_ctx, ev) =>
          ev.card.name === '杀' ? { targets: [ev.source], note: '目标改为自己' } : null,
      },
    });
    const owner = mkPlayer({ id: 0, name: '改目标将' });
    const target = mkPlayer({ id: 1, name: '受害者' });
    const { deps } = makeHarness([owner, target]);
    const card = mkCard({ name: '杀' as never });
    const r = await dispatchTargets(deps, { source: target, card, targets: [owner] });
    expect(r.targets.map(t => t.id)).toEqual([target.id]);
  });

  it('技能返回 null 时目标不变', async () => {
    const owner = mkPlayer({ id: 0, name: '无关将2' });
    const target = mkPlayer({ id: 1, name: '受害者2' });
    const { deps } = makeHarness([owner, target]);
    const card = mkCard();
    const r = await dispatchTargets(deps, { source: owner, card, targets: [target] });
    expect(r.targets.map(t => t.id)).toEqual([target.id]);
  });

  it('多个技能改写时按注册顺序串行，后者看到前者改过的列表', async () => {
    const seen: number[][] = [];
    registerSkill({
      hero: '甲改',
      skill: '甲改技',
      hooks: { onTargetsChosen: (_c, ev) => { seen.push(ev.targets.map(t => t.id)); return { targets: [ev.targets[0]] }; } },
    });
    registerSkill({
      hero: '乙改',
      skill: '乙改技',
      hooks: { onTargetsChosen: (_c, ev) => { seen.push(ev.targets.map(t => t.id)); return null; } },
    });
    const a = mkPlayer({ id: 0, name: '甲改' });
    const b = mkPlayer({ id: 1, name: '乙改' });
    const t1 = mkPlayer({ id: 2, name: '目标A' });
    const t2 = mkPlayer({ id: 3, name: '目标B' });
    const { deps } = makeHarness([a, b, t1, t2]);
    await dispatchTargets(deps, { source: a, card: mkCard(), targets: [t1, t2] });
    // 甲看到原始两个目标；乙看到甲裁剪后的一个
    expect(seen[0]).toEqual([2, 3]);
    expect(seen[1]).toEqual([2]);
  });
});
