import { beforeEach, describe, expect, it } from 'vitest';
import { __clearSkillMemory, dispatchDiscardPhaseSkip, dispatchRoundStart } from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, Suit } from '../../../types';
import type { Card } from '../../../types';
import './batch6new21';

/**
 * batch6new21 的行为测试：落宠 / 哀尘。
 *
 * 落宠要「弃置区域内的牌」，区域 = 手牌 + 装备区 + 判定区；测试里用 deps 的
 * readArea / discardFromArea 给出真实语义的替身，断言「选哪一块、弃了几张、
 * 上限数有没有减」。哀尘验「牌堆 > 40 跳过弃牌阶段」。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

/** 把一个玩家的三个区域装成可读可弃的替身 */
const installArea = (deps: ReturnType<typeof makeHarness>['deps'], players: ReturnType<typeof mkPlayer>[]) => {
  const zones = new Map<number, { hand: Card[]; equip: Card[]; judge: Card[] }>();
  for (const p of players) {
    zones.set(p.id, {
      hand: [...p.hand],
      equip: p.equipment ? (Object.values(p.equipment).filter(Boolean) as Card[]) : [],
      judge: [...(p.judgeZone ?? [])],
    });
  }
  deps.readArea = (pid, zone) => {
    const z = zones.get(pid);
    if (!z) return [];
    return zone === 'hand' ? [...z.hand] : zone === 'equip' ? [...z.equip] : [...z.judge];
  };
  const discarded: Array<{ pid: number; ids: string[] }> = [];
  deps.discardFromArea = (pid, cards) => {
    const z = zones.get(pid);
    if (!z) return 0;
    let n = 0;
    for (const zone of ['hand', 'equip', 'judge'] as const) {
      const ids = new Set(cards.map(c => c.id));
      const kept = z[zone].filter(c => !ids.has(c.id));
      n += z[zone].length - kept.length;
      z[zone] = kept;
    }
    if (n > 0) discarded.push({ pid, ids: cards.map(c => c.id) });
    return n;
  };
  return { zones, discarded };
};

describe('滕芳兰「落宠」', () => {
  it('正例：一轮弃 4 张；单名角色被弃满 3 张则上限数降为 3', async () => {
    const tfl = P(0, '滕芳兰');
    const a = P(1, '甲');
    a.hand = [mkCard({ name: CardName.TAO }), mkCard({ name: CardName.SHA })];
    const { deps, fx } = makeHarness([tfl, a]);
    const { discarded } = installArea(deps, [tfl, a]);
    await dispatchRoundStart(deps, 1);
    // AI 从区域牌最多的「甲」取走全部（2 张），然后没有可选目标 → 结束
    expect(discarded).toEqual([{ pid: 1, ids: discarded[0].ids }]);
    expect(discarded[0].ids).toHaveLength(2);
    expect(fx.banners).toContain('滕芳兰:落宠');
    // 只有 2 张，没到 3 → 上限不变
    expect(fx.logs.some(l => l.includes('上限数降为'))).toBe(false);
  });

  it('正例：单名角色被弃置 3 张以上 → 上限数降为 3', async () => {
    const tfl = P(0, '滕芳兰');
    const a = P(1, '甲');
    a.hand = [mkCard(), mkCard(), mkCard()];
    const { deps, fx } = makeHarness([tfl, a]);
    installArea(deps, [tfl, a]);
    await dispatchRoundStart(deps, 1);
    expect(fx.logs.some(l => l.includes('上限数降为 3'))).toBe(true);
  });

  it('正例：装备区与判定区也会被弃置', async () => {
    const tfl = P(0, '滕芳兰');
    const a = P(1, '甲');
    a.equipment = { weapon: mkCard({ name: CardName.QINGGANG }) };
    a.judgeZone = [mkCard({ name: CardName.LESI })];
    const { deps } = makeHarness([tfl, a]);
    const { discarded } = installArea(deps, [tfl, a]);
    await dispatchRoundStart(deps, 1);
    expect(discarded[0].ids).toHaveLength(2);
  });

  it('反例：全场三个区域都没有牌 —— 不发动', async () => {
    const tfl = P(0, '滕芳兰');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([tfl, a]);
    installArea(deps, [tfl, a]);
    await dispatchRoundStart(deps, 1);
    expect(fx.logs).toEqual([]);
  });

  it('正例：牌堆大于 80 且第一次弃的是自己的牌 → 摸两张（哀尘第一句）', async () => {
    const tfl = P(0, '滕芳兰');
    tfl.hand = [mkCard()];
    const { deps, fx } = makeHarness([tfl]);
    installArea(deps, [tfl]);
    deps.deckCount = 81;
    await dispatchRoundStart(deps, 1);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 2 }]);
  });
});

describe('滕芳兰「哀尘」', () => {
  it('正例：牌堆大于 40 → 跳过弃牌阶段', () => {
    const tfl = P(0, '滕芳兰');
    const { deps } = makeHarness([tfl]);
    deps.deckCount = 41;
    expect(dispatchDiscardPhaseSkip(deps, tfl.id, { count: 5 } as never)).toMatchObject({ skip: true });
  });

  it('反例：牌堆 40 或以下 —— 不跳过', () => {
    const tfl = P(0, '滕芳兰');
    const { deps } = makeHarness([tfl]);
    deps.deckCount = 40;
    expect(dispatchDiscardPhaseSkip(deps, tfl.id, { count: 5 } as never)).toEqual({ skip: false });
  });
});
