import { beforeEach, describe, expect, it } from 'vitest';
import { __clearRegistry, registerSkill } from './registry';
import {
  __clearSkillMemory, dispatchPlayPhaseBegin, dispatchPlayPhaseEnd, dispatchRoundStart, dispatchTurnStart,
} from './dispatch';
import { makeHarness, mkPlayer } from './testHarness';
import { CardName } from '../../../types';

/**
 * 第六批 ctx 能力的单测：视为使用牌 / 技能授予 / 轮数 / 两个出牌阶段钩子。
 *
 * 引擎级验证在 abilityIntegration.test.ts（真实 createCombatEngine 跑伤害与响应链）。
 * 这里测的是 **deps ↔ ctx 的映射语义**，因为最容易写错的就是「默认作用于谁」：
 * 漏了 asPlayerId 的透传，日彗就会变成技能拥有者替所有「信众」出牌；
 * 漏了 toPlayerId 的默认值，妆戎会把「神威」授给自己以外的空气。
 */

const twoPlayers = () => [mkPlayer({ id: 0, name: '甲' }), mkPlayer({ id: 1, name: '乙' })];

beforeEach(() => { __clearRegistry(); __clearSkillMemory(); });

describe('ctx.useCardAs', () => {
  it('默认由技能拥有者使用，并把目标与选项原样传下去', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    registerSkill({
      hero: '甲', skill: '试牌',
      hooks: { onTurnStart: async (ctx) => { await ctx.useCardAs(CardName.SHA, [1], { reason: '测试' }); } },
    });
    await dispatchTurnStart(deps, players[0]);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].playerId).toBe(0);
    expect(fx.usedCards[0].targetIds).toEqual([1]);
    expect(fx.usedCards[0].opts?.reason).toBe('测试');
  });

  it('asPlayerId 指定他人时使用者是他人（日彗令「信众」各自出牌）', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    registerSkill({
      hero: '甲', skill: '试牌',
      hooks: { onTurnStart: async (ctx) => { await ctx.useCardAs(CardName.SHA, [0], { asPlayerId: 1 }); } },
    });
    await dispatchTurnStart(deps, players[0]);
    expect(fx.usedCards[0].playerId).toBe(1);
  });
});

describe('ctx.roundCount', () => {
  it('来自引擎，可供「每轮首次」类技能去重', async () => {
    const players = twoPlayers();
    const { deps } = makeHarness(players, { roundCount: 3 });
    let seen = -1;
    registerSkill({ hero: '甲', skill: '试轮', hooks: { onTurnStart: (ctx) => { seen = ctx.roundCount; } } });
    await dispatchTurnStart(deps, players[0]);
    expect(seen).toBe(3);
  });
});

describe('ctx 的技能授予', () => {
  it('grantSkill 默认授予自己，并记下来源技能名', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    registerSkill({
      hero: '甲', skill: '试授',
      hooks: { onTurnStart: (ctx) => { ctx.grantSkill('☆ 神威'); } },
    });
    await dispatchTurnStart(deps, players[0]);
    expect(fx.granted).toEqual([{ playerId: 0, skill: '☆ 神威', sourceSkill: '试授', durationTurns: undefined }]);
  });

  it('grantSkill 可指定他人与持续回合', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    registerSkill({
      hero: '甲', skill: '试授',
      hooks: { onTurnStart: (ctx) => { ctx.grantSkill('狩星', 1, 2); } },
    });
    await dispatchTurnStart(deps, players[0]);
    expect(fx.granted[0]).toEqual({ playerId: 1, skill: '狩星', sourceSkill: '试授', durationTurns: 2 });
  });

  it('重复授予返回 false（不重复记战报），hasGrantedSkill 默认查自己', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    const results: boolean[] = [];
    let mine = false;
    let others = true;
    registerSkill({
      hero: '甲', skill: '试授',
      hooks: {
        onTurnStart: (ctx) => {
          results.push(ctx.grantSkill('狩星'));
          results.push(ctx.grantSkill('狩星'));
          results.push(ctx.grantSkill('狩星', 1));
          mine = ctx.hasGrantedSkill('狩星');
          others = ctx.hasGrantedSkill('狩星', 1);
        },
      },
    });
    await dispatchTurnStart(deps, players[0]);
    expect(results).toEqual([true, false, true]);
    expect(fx.granted).toHaveLength(2);
    expect(mine).toBe(true);
    expect(others).toBe(true);
  });

  it('revokeSkill 默认收回自己的，可指定他人，reason 省略时用技能名', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    let stillHas = true;
    registerSkill({
      hero: '甲', skill: '试授',
      hooks: {
        onTurnStart: (ctx) => {
          ctx.grantSkill('狩星');
          ctx.revokeSkill('狩星');
          stillHas = ctx.hasGrantedSkill('狩星');
        },
      },
    });
    await dispatchTurnStart(deps, players[0]);
    expect(fx.revoked).toEqual([{ playerId: 0, skill: '狩星', reason: '试授' }]);
    expect(stillHas).toBe(false);
  });
});

describe('出牌阶段钩子', () => {
  it('onPlayPhaseBegin / onPlayPhaseEnd 只对回合角色派发，且各一次', async () => {
    const players = twoPlayers();
    const { deps, fx } = makeHarness(players);
    const hits: string[] = [];
    registerSkill({
      hero: '甲', skill: '试阶',
      hooks: {
        onPlayPhaseBegin: (ctx) => { hits.push('begin:' + ctx.self.id); },
        onPlayPhaseEnd: (ctx) => { hits.push('end:' + ctx.self.id); },
      },
    });
    await dispatchPlayPhaseBegin(deps, 1);
    await dispatchPlayPhaseEnd(deps, 1);
    expect(hits).toEqual([]);
    await dispatchPlayPhaseBegin(deps, 0);
    await dispatchPlayPhaseEnd(deps, 0);
    expect(hits).toEqual(['begin:0', 'end:0']);
    expect(fx.logs).toHaveLength(0);
  });

  it('onRoundStart 收到轮数，且他人回合也会触发（技能拥有者不必是回合角色）', async () => {
    const players = twoPlayers();
    const { deps } = makeHarness(players);
    const seen: number[] = [];
    registerSkill({ hero: '乙', skill: '试轮起', hooks: { onRoundStart: (_ctx, round) => { seen.push(round); } } });
    await dispatchRoundStart(deps, 2);
    await dispatchRoundStart(deps, 3);
    expect(seen).toEqual([2, 3]);
  });
});
