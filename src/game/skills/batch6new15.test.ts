import { beforeEach, describe, expect, it } from 'vitest';
import {
  __clearSkillMemory, dispatchAfterDealDamage, dispatchPlayPhaseBegin, dispatchTurnEnd, dispatchTurnStart,
} from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName } from '../../../types';
import type { DamageEvent } from './registry';
import './batch6new15';

/**
 * batch6new15 的行为测试：双锐 / ☆ 狩星 / 枕戈 / 兴汉。
 *
 * 断言的是「技能向引擎申请了什么」：useCardAs 的 opts（damageBonus / noResponse /
 * asPlayerId）、grantSkill 的技名、draw 的张数、changeAttackRange 的 delta。
 * useCardAs 的真实结算（【闪】/ 无懈 / 防具）在 abilityIntegration.test.ts 里验过。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

describe('黄舞蝶「双锐」', () => {
  it('正例（在攻击范围内）：伤害+1，并获得「☆ 铩雪」', async () => {
    const hd = P(0, '黄舞蝶');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = (a, b) => a === 0 && b === 1;
    await dispatchTurnStart(deps, hd);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].card).toBe(CardName.SHA);
    expect(fx.usedCards[0].targetIds).toEqual([1]);
    expect(fx.usedCards[0].opts?.damageBonus).toBe(1);
    expect(fx.usedCards[0].opts?.noResponse).toBeUndefined();
    expect(fx.granted.map(g => g.skill)).toEqual(['☆ 铩雪']);
    expect(fx.banners).toContain('黄舞蝶:双锐');
  });

  it('正例（在攻击范围外）：不可被响应，并获得「☆ 狩星」', async () => {
    const hd = P(0, '黄舞蝶');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => false;
    await dispatchTurnStart(deps, hd);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].opts?.noResponse).toBe(true);
    expect(fx.usedCards[0].opts?.damageBonus).toBeUndefined();
    expect(fx.granted.map(g => g.skill)).toEqual(['☆ 狩星']);
  });

  it('正例：本回合结束把授予的技能收回', async () => {
    const hd = P(0, '黄舞蝶');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => false;
    await dispatchTurnStart(deps, hd);
    expect(fx.granted).toHaveLength(1);
    await dispatchTurnEnd(deps, hd);
    // 范围外那一支只授予了「☆ 狩星」；收回一个没有的技能是空操作，不该记进 revoked
    expect(fx.revoked.map(r => r.skill)).toEqual(['☆ 狩星']);
  });

  it('反例：别人的准备阶段不触发', async () => {
    const hd = P(0, '黄舞蝶');
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => true;
    await dispatchTurnStart(deps, foe);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：没有其他角色时不触发', async () => {
    const hd = P(0, '黄舞蝶');
    const { deps, fx } = makeHarness([hd]);
    await dispatchTurnStart(deps, hd);
    expect(fx.usedCards).toEqual([]);
  });
});

describe('黄舞蝶「☆ 狩星」', () => {
  const setGranted = (deps: ReturnType<typeof makeHarness>['deps'], on: boolean) => {
    deps.hasGrantedSkill = (_p, n) => on && n === '☆ 狩星';
  };

  it('正例：把 X 张牌当【杀】对攻击范围外的角色使用（X = 距离）', async () => {
    const hd = P(0, '黄舞蝶');
    hd.hand = [mkCard(), mkCard(), mkCard(), mkCard(), mkCard()];
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => false;
    deps.distance = () => 3;
    setGranted(deps, true);
    await dispatchPlayPhaseBegin(deps, hd);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].card).toBe(CardName.SHA);
    expect(fx.usedCards[0].targetIds).toEqual([1]);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 3 }]);
  });

  it('反例：没有「双锐」授予 —— 技能不存在', async () => {
    const hd = P(0, '黄舞蝶');
    hd.hand = [mkCard(), mkCard(), mkCard()];
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => false;
    deps.distance = () => 2;
    setGranted(deps, false);
    await dispatchPlayPhaseBegin(deps, hd);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：目标都在攻击范围内 —— 无合法目标', async () => {
    const hd = P(0, '黄舞蝶');
    hd.hand = [mkCard(), mkCard(), mkCard()];
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => true;
    setGranted(deps, true);
    await dispatchPlayPhaseBegin(deps, hd);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：手牌不足 X 张 —— 不发动（且不弃牌）', async () => {
    const hd = P(0, '黄舞蝶');
    hd.hand = [mkCard(), mkCard()];
    const foe = P(1, '甲');
    const { deps, fx } = makeHarness([hd, foe]);
    deps.canReach = () => false;
    deps.distance = () => 4;
    setGranted(deps, true);
    await dispatchPlayPhaseBegin(deps, hd);
    expect(fx.usedCards).toEqual([]);
    expect(fx.discarded).toEqual([]);
  });
});

describe('万年公主「枕戈」', () => {
  it('正例：攻击范围+1；所有人都在范围内时令其视为使用一张【杀】', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    const rangeCalls: Array<[number, number]> = [];
    deps.changeAttackRange = (pid, delta) => { rangeCalls.push([pid, delta]); };
    deps.canReach = () => true;          // 所有人都在范围内
    deps.attackRange = () => 3;
    await dispatchTurnStart(deps, wn);
    // AI 选体力最低者；三人同体力，按座位序取 0（自己）
    expect(rangeCalls).toEqual([[0, 1]]);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].card).toBe(CardName.SHA);
    expect(fx.usedCards[0].opts?.asPlayerId).toBe(0);
  });

  it('正例：不是所有人都在范围内 —— 只加攻击范围、不令人使用【杀】', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    deps.changeAttackRange = () => {};
    deps.canReach = (_f, t) => t === 1;   // 乙 不在范围内
    deps.attackRange = () => 2;
    await dispatchTurnStart(deps, wn);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：别人的准备阶段不触发', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([wn, a]);
    const calls: unknown[] = [];
    deps.changeAttackRange = (pid, d) => { calls.push([pid, d]); };
    await dispatchTurnStart(deps, a);
    expect(calls).toEqual([]);
    expect(fx.usedCards).toEqual([]);
  });
});

describe('万年公主「兴汉」', () => {
  /** 用「枕戈」把 kzPicked 播种好（两个技能共享 heroMemory，这是唯一的真实路径） */
  const seedPicked = async (deps: ReturnType<typeof makeHarness>['deps'], wn: ReturnType<typeof mkPlayer>) => {
    deps.changeAttackRange = () => {};
    deps.canReach = () => false;   // 不在范围内 → 枕戈 只加范围、不出杀
    await dispatchTurnStart(deps, wn);
  };

  const dmg = (source: ReturnType<typeof mkPlayer>, victim: ReturnType<typeof mkPlayer>, name = CardName.SHA): DamageEvent => ({
    victim, source, amount: 1, nature: 'normal',
    card: name === CardName.SHA ? mkCard({ name: CardName.SHA }) : mkCard({ name }),
  });

  it('正例：被「枕戈」选过的角色用本回合第一张【杀】造成伤害后摸牌', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    await seedPicked(deps, wn);
    deps.attackRange = () => 3;
    // 万年公主手牌不是全场唯一最多 → 摸 X 张（X = 攻击范围）
    wn.hand = [mkCard()];
    a.hand = [mkCard(), mkCard()];
    await dispatchAfterDealDamage(deps, dmg(wn, b));
    expect(fx.drawn).toEqual([{ playerId: 0, count: 3 }]);
  });

  it('正例：手牌数是全场唯一最多时改为摸一张', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    await seedPicked(deps, wn);
    deps.attackRange = () => 5;
    wn.hand = [mkCard(), mkCard(), mkCard()];
    a.hand = [mkCard()];
    b.hand = [];
    await dispatchAfterDealDamage(deps, dmg(wn, b));
    expect(fx.drawn).toEqual([{ playerId: 0, count: 1 }]);
  });

  it('反例：同一角色本回合第二张【杀】—— 只算第一张', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    await seedPicked(deps, wn);
    deps.attackRange = () => 3;
    await dispatchAfterDealDamage(deps, dmg(wn, b));
    await dispatchAfterDealDamage(deps, dmg(wn, b));
    expect(fx.drawn).toHaveLength(1);
  });

  it('反例：不是被「枕戈」选过的角色 —— 不摸牌', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    await seedPicked(deps, wn);
    // 枕戈 选的是自己（座位序 0）；这里让 甲 造成伤害
    await dispatchAfterDealDamage(deps, dmg(a, b));
    expect(fx.drawn).toEqual([]);
  });

  it('反例：伤害不是【杀】造成的 —— 不摸牌', async () => {
    const wn = P(0, '万年公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([wn, a, b]);
    await seedPicked(deps, wn);
    await dispatchAfterDealDamage(deps, dmg(wn, b, CardName.JUEDOU));
    expect(fx.drawn).toEqual([]);
  });
});
