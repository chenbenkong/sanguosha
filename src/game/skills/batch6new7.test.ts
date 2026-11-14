import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchAfterDealDamage, dispatchTurnStart } from './dispatch';
import { skillsOf } from './registry';
import type { Card, Player } from '../../../types';
import './batch6new7';

/**
 * 第六批女将 · 第 7 组：牌堆 / 判定类 6 个技能里**唯一能力齐备**的一个。
 *
 * 断言的是规则：什么时候触发、弃了几张、回复给谁、本回合的「一次」怎么消耗与复位，
 * 以及 AI 分支与人类分支的差别。反例覆盖「不触发」的每一条守卫。
 *
 * 其余 5 个（慧淑 / 离宫 / 灵慧 / 隅泣 / 锦绘）未实装，缺口写在 batch6new7.ts 的注释里，
 * 它们继续留在 skillCoverage.test.ts 的 LEGACY_INLINE 中。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);

/** 一次「造成伤害后」事件：默认柏灵筠打甲 1 点 */
const dmgEvent = (victim: Player, source: Player, amount = 1) =>
  ({ victim, source, amount, nature: 'normal' as const, card: undefined });

describe('柏灵筠「黠策」第 2 项：造成伤害后弃一张牌、回复 1 点体力', () => {
  const setup = () => {
    // 已受伤（2/3），否则 AI 分支不会发动
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 2, maxHp: 3 });
    bly.hand = [card({ name: '闪' as Card['name'] }), card({ name: '桃' as Card['name'] })];
    const foe = mkPlayer({ id: 1, name: '甲', hp: 3, maxHp: 3 });
    const other = mkPlayer({ id: 2, name: '乙' });
    return { bly, foe, other };
  };

  it('正例：造成伤害后弃置一张手牌，并回复自己 1 点体力', async () => {
    const { bly, foe } = setup();
    const { deps, fx } = makeHarness([bly, foe]);

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));

    // 代价：只弃 1 张，且是柏灵筠自己的手牌
    expect(fx.discarded).toEqual([{ playerId: bly.id, count: 1 }]);
    // 收益：回复自己 1 点（不是给受伤者加血）
    expect(fx.healed).toEqual([{ playerId: bly.id, amount: 1 }]);
    expect(fx.logs.some(l => l.includes('黠策'))).toBe(true);
    expect(fx.banners).toContain('柏灵筠:黠策');
  });

  it('反例：其他角色造成伤害不触发（原文是「当你造成伤害后」）', async () => {
    const { bly, foe, other } = setup();
    const { deps, fx } = makeHarness([bly, foe, other]);

    await dispatchAfterDealDamage(deps, dmgEvent(other, foe));

    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
    expect(fx.logs.some(l => l.includes('黠策'))).toBe(false);
  });

  it('反例：伤害点为 0（没造成伤害）不触发', async () => {
    const { bly, foe } = setup();
    const { deps, fx } = makeHarness([bly, foe]);

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly, 0));

    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
  });

  it('反例：每回合每项各限一次——同一回合第二次造成伤害不再发动', async () => {
    const { bly, foe, other } = setup();
    const { deps, fx } = makeHarness([bly, foe, other]);

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));
    await dispatchAfterDealDamage(deps, dmgEvent(other, bly));

    expect(fx.discarded).toHaveLength(1);
    expect(fx.healed).toHaveLength(1);
  });

  it('反例：新回合开始后复位，可再次发动', async () => {
    const { bly, foe, other } = setup();
    const { deps, fx } = makeHarness([bly, foe, other]);

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));
    expect(fx.discarded).toHaveLength(1);

    await dispatchTurnStart(deps, other);   // 新回合（任意角色的回合开始）
    await dispatchAfterDealDamage(deps, dmgEvent(other, bly));
    expect(fx.discarded).toHaveLength(2);
    expect(fx.healed).toHaveLength(2);
  });

  it('反例：手牌为空（付不起「弃置一张牌」的代价）不发动', async () => {
    const { bly, foe } = setup();
    bly.hand = [];
    const { deps, fx } = makeHarness([bly, foe]);

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));

    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
    expect(fx.logs.some(l => l.includes('黠策'))).toBe(false);
  });

  it('反例：AI / 托管（返回 null）在体力已满时不白弃一张牌', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 3, maxHp: 3 });
    bly.hand = [card()];
    const foe = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([bly, foe]);   // 默认 requestChoice → null（AI）

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));

    expect(fx.discarded).toEqual([]);
    expect(fx.healed).toEqual([]);
  });

  it('反例：人类玩家显式发动时按原文结算（体力已满也照样弃牌并请求回复 1 点）', async () => {
    const bly = mkPlayer({ id: 0, name: '柏灵筠', hp: 3, maxHp: 3 });
    const two = card();
    bly.hand = [two];
    const foe = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([bly, foe], {
      requestChoice: async () => ({ kind: 'multi', ids: [two.id] }),
    });

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));

    expect(fx.discarded).toEqual([{ playerId: bly.id, count: 1 }]);
    expect(fx.healed).toEqual([{ playerId: bly.id, amount: 1 }]);
  });

  it('反例：玩家点「不发动」不消耗本回合的「一次」——下一次造成伤害仍可发动', async () => {
    const { bly, foe, other } = setup();
    let call = 0;
    const { deps, fx } = makeHarness([bly, foe, other], {
      // 第一次回答「不发动」，之后走 AI 自动分支
      requestChoice: async () => {
        call += 1;
        return call === 1 ? { kind: 'cancel' } : null;
      },
    });

    await dispatchAfterDealDamage(deps, dmgEvent(foe, bly));
    expect(fx.discarded).toEqual([]);       // 掠过触发，什么都没发生

    await dispatchAfterDealDamage(deps, dmgEvent(other, bly));
    expect(fx.discarded).toHaveLength(1);   // 仍然发动了
    expect(fx.healed).toHaveLength(1);
  });
});

describe('这 1 个技能已进注册表，注册名与 HEROES 逐字一致', () => {
  it('黠策（HEROES: 「灵慧 / 黠策 / 御心」，无 ☆ 前缀）', () => {
    expect(skillsOf('柏灵筠').map(d => d.skill)).toContain('黠策');
  });
});
