import { describe, expect, it } from 'vitest';
import { shouldPromptSkillChoice } from './skillPromptPolicy';
import { dispatchTurnEnd } from './dispatch';
import { mkPlayer, makeHarness, mkCard } from './testHarness';
import './batch6new6';   // 注册技能（张楚「集众」）

/**
 * 玩家报的缺陷：「为什么其他 AI 玩家的技能，需要我来确认？」
 *
 * 根因：技能注册表的 ctx.requestChoice 原样透传给 deps.requestChoice，
 * 而 App 那层只判了「是否托管」，完全不知道「是谁在问」——
 * 于是 AI 武将一发动需要选择的技能，弹窗就盖到人类玩家脸上。
 *
 * 修法：ctxFor 给每个请求注入 askerId（技能拥有者），弹窗层用 shouldPromptSkillChoice
 * 判断：拥有者是 AI 就不弹（返回 null，技能走自己的自动分支）。
 */

const P = (over: Parameters<typeof mkPlayer>[0]) => mkPlayer(over);

describe('shouldPromptSkillChoice（技能提问该不该弹给人类）', () => {
  const human = P({ id: 0, name: '我', isHuman: true });
  const ai = P({ id: 1, name: 'AI', isHuman: false });
  const players = [human, ai];

  it('AI 武将的技能 → 不弹（这是本次修复的核心）', () => {
    expect(shouldPromptSkillChoice(ai.id, players, false)).toBe(false);
  });

  it('人类武将的技能 → 弹', () => {
    expect(shouldPromptSkillChoice(human.id, players, false)).toBe(true);
  });

  it('托管时即使是人类也不弹（交给 AI）', () => {
    expect(shouldPromptSkillChoice(human.id, players, true)).toBe(false);
  });

  it('askerId 缺省（非技能注册表来源的内联技能）→ 沿用旧行为放行', () => {
    expect(shouldPromptSkillChoice(undefined, players, false)).toBe(true);
  });

  it('拥有者不在场（数据异常）→ 保守放行，不让技能卡死', () => {
    expect(shouldPromptSkillChoice(99, players, false)).toBe(true);
  });
});

describe('ctx.requestChoice 注入 askerId', () => {
  // 张楚「集众」：回合结束时要求选择一名其他角色（需要场上还有其他角色）
  const board = (zcIsHuman: boolean) => {
    const zc = P({ id: 0, name: '张楚', isHuman: zcIsHuman });
    const a = P({ id: 1, name: '甲' });
    const b = P({ id: 2, name: '乙' });
    a.hand = [mkCard(), mkCard()];
    return [zc, a, b];
  };

  const capture = () => {
    const seen: Array<number | undefined> = [];
    return {
      seen,
      fn: async (req: { askerId?: number }) => { seen.push(req.askerId); return { kind: 'cancel' as const }; },
    };
  };

  it('人类拥有者提问时，req 带上 askerId = 本人 id', async () => {
    const players = board(true);
    const cap = capture();
    const { deps } = makeHarness(players, { requestChoice: cap.fn });
    await dispatchTurnEnd(deps, players[0]);
    expect(cap.seen.length).toBeGreaterThan(0);
    expect(cap.seen.every(id => id === players[0].id)).toBe(true);
  });

  it('AI 拥有者提问时同样带上 askerId（由弹窗层拒弹，而不是在 ctx 层硬拦）', async () => {
    // 关键：askerId 必须照常注入。若在 ctx 层直接 return null，
    // 测试的脚本化替身也会被拦掉（harness 的 requestChoice 不是弹窗，是测试驱动），
    // 而那些测试正是在验证技能逻辑本身。
    const players = board(false);
    const cap = capture();
    const { deps } = makeHarness(players, { requestChoice: cap.fn });
    await dispatchTurnEnd(deps, players[0]);
    expect(cap.seen.length).toBeGreaterThan(0);
    expect(cap.seen.every(id => id === players[0].id)).toBe(true);
  });
});
