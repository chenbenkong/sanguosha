import { afterEach, describe, expect, it, vi } from 'vitest';
import { Identity } from '../../../types';
import { pickAITarget, threatScore } from './targeting';
import type { AiDifficulty, PickAITargetContext } from './targeting';
import { mkEquip, mkHero, mkPlayer } from './testFixtures';
import { CardName, Suit } from '../../../types';

const P = (id: number, identity: Identity, over: Record<string, unknown> = {}) =>
  mkPlayer({ id, identity, ...(over as object) });

const ctx = (players: ReturnType<typeof P>[], over: Partial<PickAITargetContext> = {}): PickAITargetContext => ({
  players,
  difficulty: 'normal' as AiDifficulty,
  guessIdentity: (p) => p.identity,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('pickAITarget：反贼', () => {
  it('主公在场时无条件集火主公（normal）', () => {
    const lord = P(1, Identity.ZHUGONG);
    const ally = P(2, Identity.FANZEI);
    const ai = P(0, Identity.FANZEI);
    expect(pickAITarget(ai, ctx([ai, lord, ally]))?.id).toBe(lord.id);
  });

  it('主公已阵亡时按体力选最弱（normal，不触发乱选）', () => {
    const weak = P(2, Identity.ZHONGCHEN, { hp: 1 });
    const strong = P(3, Identity.ZHONGCHEN, { hp: 4 });
    const ai = P(0, Identity.FANZEI);
    expect(pickAITarget(ai, ctx([ai, weak, strong, P(1, Identity.ZHUGONG, { isDead: true })]))?.id).toBe(weak.id);
  });

  it('hard 难度按威胁分排序选最高威胁', () => {
    const tanky = P(2, Identity.ZHONGCHEN, { hp: 4, hand: [] });
    const hurt = P(3, Identity.ZHONGCHEN, { hp: 1, hand: [] });
    const ai = P(0, Identity.FANZEI);
    // 残血 3 分 > 满血 0 分
    expect(pickAITarget(ai, ctx([ai, tanky, hurt], { difficulty: 'hard' }))?.id).toBe(hurt.id);
  });

  it('easy 难度掷骰成功时随机挑池内目标', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.3 命中乱选分支
    const a = P(2, Identity.ZHONGCHEN);
    const b = P(3, Identity.ZHONGCHEN);
    const ai = P(0, Identity.FANZEI);
    const picked = pickAITarget(ai, ctx([ai, a, b], { difficulty: 'easy' }));
    expect([a.id, b.id]).toContain(picked?.id);
  });

  it('easy 难度掷骰失败时退化为最弱目标', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // >= 0.3 不命中乱选
    const weak = P(3, Identity.ZHONGCHEN, { hp: 1 });
    const strong = P(2, Identity.ZHONGCHEN, { hp: 4 });
    const ai = P(0, Identity.FANZEI);
    expect(pickAITarget(ai, ctx([ai, strong, weak], { difficulty: 'easy' }))?.id).toBe(weak.id);
  });
});

describe('pickAITarget：主公 / 忠臣', () => {
  it('有已知反贼时优先打反贼而非主公', () => {
    const rebel = P(2, Identity.FANZEI);
    const lordSelf = P(0, Identity.ZHUGONG);
    const other = P(3, Identity.ZHONGCHEN);
    expect(pickAITarget(lordSelf, ctx([lordSelf, rebel, other]))?.id).toBe(rebel.id);
  });

  it('忠臣同样优先打反贼', () => {
    const rebel = P(2, Identity.FANZEI);
    const ai = P(0, Identity.ZHONGCHEN);
    const lord = P(1, Identity.ZHUGONG);
    expect(pickAITarget(ai, ctx([ai, lord, rebel]))?.id).toBe(rebel.id);
  });

  it('无已知反贼时排除主公与忠臣，打其他人', () => {
    const stranger = P(3, Identity.NEIJIAN);
    const ai = P(0, Identity.ZHONGCHEN);
    const lord = P(1, Identity.ZHUGONG);
    expect(pickAITarget(ai, ctx([ai, lord, stranger]))?.id).toBe(stranger.id);
  });

  it('全场只剩主公与忠臣时返回 null（不打自己人）', () => {
    const ai = P(0, Identity.ZHONGCHEN);
    const lord = P(1, Identity.ZHUGONG);
    expect(pickAITarget(ai, ctx([ai, lord]))).toBeNull();
  });
});

describe('pickAITarget：内奸', () => {
  it('有反贼时先打反贼', () => {
    const rebel = P(2, Identity.FANZEI);
    const ai = P(0, Identity.NEIJIAN);
    const lord = P(1, Identity.ZHUGONG);
    expect(pickAITarget(ai, ctx([ai, lord, rebel]))?.id).toBe(rebel.id);
  });

  it('无反贼时打非主公目标，留主公最后', () => {
    const loyal = P(2, Identity.ZHONGCHEN);
    const ai = P(0, Identity.NEIJIAN);
    const lord = P(1, Identity.ZHUGONG);
    expect(pickAITarget(ai, ctx([ai, lord, loyal]))?.id).toBe(loyal.id);
  });

  it('只剩主公一人时回头打主公', () => {
    const ai = P(0, Identity.NEIJIAN);
    const lord = P(1, Identity.ZHUGONG);
    expect(pickAITarget(ai, ctx([ai, lord]))?.id).toBe(lord.id);
  });
});

describe('pickAITarget：边界', () => {
  it('没有其他存活角色 → null', () => {
    const ai = P(0, Identity.FANZEI);
    expect(pickAITarget(ai, ctx([ai]))).toBeNull();
  });

  it('所有其他人已阵亡 → null', () => {
    const ai = P(0, Identity.FANZEI);
    const dead = P(1, Identity.ZHUGONG, { isDead: true });
    expect(pickAITarget(ai, ctx([ai, dead]))).toBeNull();
  });

  it('绝不把自己选为目标', () => {
    const ai = P(0, Identity.NEIJIAN, { hp: 1 });
    const other = P(1, Identity.ZHONGCHEN, { hp: 4 });
    expect(pickAITarget(ai, ctx([ai, other]))?.id).not.toBe(ai.id);
  });

  it('难度不影响“反贼集火主公”的硬规则', () => {
    const lord = P(1, Identity.ZHUGONG);
    const ai = P(0, Identity.FANZEI);
    for (const difficulty of ['easy', 'normal', 'hard'] as AiDifficulty[]) {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      expect(pickAITarget(ai, ctx([ai, lord], { difficulty }))?.id).toBe(lord.id);
    }
  });

  it('猜测身份参与决策（未亮明的反贼会被主忠优先锁定）', () => {
    const hidden = P(2, Identity.ZHONGCHEN); // 面板身份是忠臣，但被推理为反贼
    const ai = P(0, Identity.ZHUGONG);
    const bystander = P(3, Identity.NEIJIAN);
    const c = ctx([ai, hidden, bystander], {
      guessIdentity: (p) => (p.id === hidden.id ? Identity.FANZEI : p.identity),
    });
    expect(pickAITarget(ai, c)?.id).toBe(hidden.id);
  });
});

describe('threatScore：威胁评分', () => {
  const base = (over: Record<string, unknown> = {}) => P(1, Identity.ZHONGCHEN, { hp: 4, maxHp: 4, hand: [], ...over });

  it('满血空手无装备的基础分为 0', () => {
    expect(threatScore(base())).toBe(0);
  });

  it('每掉 1 点体力 +3', () => {
    expect(threatScore(base({ hp: 3 }))).toBe(3);
    expect(threatScore(base({ hp: 1 }))).toBe(9);
  });

  it('每张手牌 +1', () => {
    const c = mkCard();
    expect(threatScore(base({ hand: [c, c, c] }))).toBe(3);
  });

  it('每件装备 +2', () => {
    const p = base({ equipment: { weapon: mkEquip(Suit.SPADE), armor: mkEquip(Suit.CLUB, CardName.BAGUA) } });
    expect(threatScore(p)).toBe(4);
  });

  it('主公身份 +4', () => {
    expect(threatScore(P(1, Identity.ZHUGONG, { hp: 4, maxHp: 4, hand: [] }))).toBe(4);
  });

  it('已亮明身份 +2', () => {
    expect(threatScore(base({ isRevealed: true }))).toBe(2);
  });

  it('高威胁武将 +2', () => {
    expect(threatScore(base({ hero: mkHero('诸葛亮') }))).toBe(2);
    expect(threatScore(base({ hero: mkHero('路人甲') }))).toBe(0);
  });

  it('多项叠加相加', () => {
    const p = P(1, Identity.ZHUGONG, {
      hp: 2, maxHp: 4, hand: [mkCard(), mkCard()], isRevealed: true, hero: mkHero('周瑜'),
    });
    // 残血 2*3=6 + 手牌 2 + 主公 4 + 亮明 2 + 高威胁 2 = 16
    expect(threatScore(p)).toBe(16);
  });
});

function mkCard() {
  return mkPlayer({ id: 0 }).hand[0] ?? ({
    id: 'x', name: CardName.SHA, type: '基本牌', suit: Suit.SPADE, rank: 'A', value: 1, description: '', imageColor: '',
  } as never);
}
