import { describe, expect, it } from 'vitest';
import { mkCard, mkPlayer, makeHarness } from './testHarness';
import { dispatchAfterDamage, dispatchAfterDealDamage, dispatchCardUsed, dispatchTurnStart } from './dispatch';
import './index';

/**
 * 递归防护测试。
 *
 * 风险：技能在 afterDamage 里调用 ctx.damage() → 引擎 takeDamage 又会派发
 * afterDamage → 同一技能再次 ctx.damage()，形成无限递归（表现为页面卡死/疯狂刷屏）。
 *
 * 这里构造能自激的场景，断言调用次数有上界。
 */

const P = (name: string, id: number, over: Parameters<typeof mkPlayer>[0] = {}) =>
  mkPlayer({ name, id, ...over });

describe('技能自激防护', () => {
  it('芳妒/聆乐一类「受到伤害后」技能不会无限互相触发', async () => {
    // 让 damage 真的回调 afterDamage，模拟引擎行为
    let calls = 0;
    const LIMIT = 50;

    const yj = P('袁姬', 0, { hp: 20, maxHp: 20 });
    const sl = P('孙翎鸾', 1);
    const foe = P('甲', 2, { hp: 20, maxHp: 20 });
    const players = [yj, sl, foe];

    const { deps } = makeHarness(players);

    // 覆盖 damage：模拟 takeDamage 结算后派发 afterDamage / afterDealDamage
    deps.damage = async (victimId, sourceId, amount) => {
      calls += 1;
      if (calls > LIMIT) throw new Error('检测到无限递归：伤害派发超过 ' + LIMIT + ' 次');
      await dispatchAfterDamage(deps, {
        victim: players.find(p => p.id === victimId)!,
        source: players.find(p => p.id === sourceId),
        amount,
        nature: 'normal',
        card: mkCard(),
      });
    };

    // 一次外部伤害引发的连锁
    await dispatchAfterDamage(deps, {
      victim: yj, source: foe, amount: 1, nature: 'normal', card: mkCard(),
    });

    expect(calls).toBeLessThan(LIMIT);
  });

  it('狐魅（造成伤害后令目标摸牌）不会被自己的伤害反复触发', async () => {
    const dh = P('董翓', 0, { hp: 30, maxHp: 30 });
    const foe = P('甲', 1, { hp: 30, maxHp: 30 });
    const players = [dh, foe];
    const { deps, fx } = makeHarness(players);

    let damageCalls = 0;
    deps.damage = async (victimId, sourceId, amount) => {
      damageCalls += 1;
      if (damageCalls > 30) throw new Error('狐魅递归：' + damageCalls);
      const ev = {
        victim: players.find(p => p.id === victimId)!,
        source: players.find(p => p.id === sourceId),
        amount,
        nature: 'normal' as const,
        card: mkCard(),
      };
      await dispatchAfterDamage(deps, ev);
      await dispatchAfterDealDamage(deps, ev);
    };

    await dispatchAfterDealDamage(deps, {
      victim: foe, source: dh, amount: 1, nature: 'normal', card: mkCard(),
    });

    // 狐魅只会让目标摸牌，不应再产生伤害
    expect(damageCalls).toBeLessThan(30);
    expect(fx.drawn.length).toBeLessThan(30);
  });

  it('同一次伤害不会让「受到伤害后」技能重复结算多次', async () => {
    const yj = P('袁姬', 1, { hp: 5, maxHp: 5 });
    const foe = P('甲', 0);
    const { deps, fx } = makeHarness([foe, yj]);
    deps.turnOwner = foe;

    const ev = { victim: yj, source: foe, amount: 1, nature: 'normal' as const, card: mkCard() };
    await dispatchAfterDamage(deps, ev);
    await dispatchAfterDamage(deps, ev);
    await dispatchAfterDamage(deps, ev);

    // 芳妒「每回合首次」应只回一次血
    const heals = fx.healed.filter(h => h.playerId === 1).length;
    expect(heals).toBeLessThanOrEqual(1);
  });
});
