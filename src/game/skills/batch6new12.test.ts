import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer } from './testHarness';
import type { DispatchDeps, SkillChoiceReq } from './dispatch';
import { dispatchAfterDamage, dispatchTurnStart } from './dispatch';
import { CardName } from '../../../types';
import type { Card, Player } from '../../../types';
import './batch6new12';
// 「娴静」与「隅泣」改的是同一组数字（heroMemory.yuqi），这里用它验证形状一致
import './batch6new2';

/**
 * 第六批女将 · 第 12 组：本轮引擎补齐后回填的技能。
 *
 * 只测**已实装**的「隅泣」；灵慧 / 锦绘 / 双锐 三条未实装（缺「使用一张牌」等入口，
 * 见 batch6new12.ts 的说明），不给它们写「假装生效」的断言。
 *
 * 断言的是规则：什么时候触发、看了几张、谁拿到了什么、剩下的去哪、次数怎么算。
 * 每个技能都配反例——只测正例等于没测边界。
 */

/** 三个人的牌局：0 = 曹金玉，1 / 2 是其他角色 */
const table = () => ({
  cjy: mkPlayer({ id: 0, name: '曹金玉' }),
  a: mkPlayer({ id: 1, name: '甲' }),
  b: mkPlayer({ id: 2, name: '乙' }),
});

const mkDeck = (names: CardName[]): Card[] => names.map(n => mkCard({ name: n }));

/**
 * 装一副可控牌堆：peekDeck / takeFromDeck 都按 App.tsx 的实现
 * （数组尾部是牌堆顶，takeFromDeck 从堆顶开始扫）。记录每次观看的张数。
 */
const withDeck = (deps: DispatchDeps, deck: Card[]) => {
  const peeks: number[] = [];
  deps.peekDeck = (count) => {
    peeks.push(count);
    return [...deck].slice(-count).reverse();
  };
  deps.takeFromDeck = (pred, count) => {
    const taken: Card[] = [];
    const rest: Card[] = [];
    for (let i = deck.length - 1; i >= 0; i--) {
      const c = deck[i];
      if (taken.length < count && pred(c)) taken.push(c);
      else rest.unshift(c);
    }
    if (taken.length === 0) return [];
    deck.length = 0;
    deck.push(...rest);
    return taken;
  };
  return { peeks };
};

/** 记录交出的牌与去向：gainCard 在夹具里是空实现 */
const trackGain = (deps: DispatchDeps) => {
  const given: Array<{ from: number; to: number; name: string }> = [];
  deps.gainCard = (from, to, c) => { given.push({ from, to, name: String(c.name) }); };
  return given;
};

const hurt = (deps: DispatchDeps, victim: Player, source: Player) =>
  dispatchAfterDamage(deps, { victim, source, amount: 1, nature: 'normal', card: undefined });

describe('曹金玉「隅泣」', () => {
  it('正例：自己受伤（距离 0）时观看牌堆顶 3 张，交给受伤角色 1 张、自己获得 1 张，其余留在堆顶', async () => {
    const { cjy, a, b } = table();
    const { deps, fx } = makeHarness([cjy, a, b]);
    // 尾部是顶 → 自上而下：杀 / 闪 / 桃
    const deck = mkDeck([CardName.TAO, CardName.SHAN, CardName.SHA]);
    const { peeks } = withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, cjy, a);

    expect(peeks).toEqual([3]);                                            // 观看张数 = yuqi[1]
    expect(given.map(g => g.name)).toEqual([CardName.SHA, CardName.SHAN]);  // 堆顶交出，下一张自留
    expect(given.every(g => g.to === cjy.id)).toBe(true);                   // 「交给该角色」＝受伤者
    expect(deck.map(c => c.name)).toEqual([CardName.TAO]);                  // 其余的放回牌堆顶
    expect(fx.logs.some(l => l.includes('【隅泣】'))).toBe(true);
    expect(fx.banners.length).toBe(1);
  });

  it('反例：受伤的是别人（距离 1）时不发动', async () => {
    const { cjy, a, b } = table();
    const { deps, fx } = makeHarness([cjy, a, b]);
    const deck = mkDeck([CardName.TAO, CardName.SHAN, CardName.SHA]);
    const { peeks } = withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, a, cjy);

    expect(peeks).toEqual([]);      // 连通都没触发
    expect(given).toEqual([]);
    expect(fx.logs).toEqual([]);
    expect(deck.length).toBe(3);
  });

  it('反例：每回合限两次（yuqi[0]）——第三次伤害不再发动', async () => {
    const { cjy, a, b } = table();
    const { deps, fx } = makeHarness([cjy, a, b]);
    const deck = mkDeck([CardName.TAO, CardName.SHAN, CardName.SHA, CardName.JIU, CardName.TAO]);
    const { peeks } = withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, cjy, a);
    await hurt(deps, cjy, a);
    await hurt(deps, cjy, a);

    expect(peeks).toEqual([3, 3]);   // 第三次连观看都没有
    expect(given.length).toBe(4);    // 两次发动 × 2 张
    expect(fx.logs.filter(l => l.includes('【隅泣】')).length).toBe(2);
  });

  it('正例：回合开始复位次数；「娴静」把 yuqi[0] 顶到 3 后本回合能发动第三次', async () => {
    const { cjy, a, b } = table();
    const { deps, fx } = makeHarness([cjy, a, b]);
    const deck = mkDeck([
      CardName.TAO, CardName.SHAN, CardName.SHA, CardName.JIU,
      CardName.TAO, CardName.SHAN, CardName.SHA, CardName.JIU,
    ]);
    const { peeks } = withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, cjy, a);
    await hurt(deps, cjy, a);
    await hurt(deps, cjy, a);
    expect(given.length).toBe(4);

    // 新回合：隅泣复位（本文件）＋ 娴静把最小项 +1（batch6new2）→ yuqi [2,3] → [3,3]
    await dispatchTurnStart(deps, cjy);
    await hurt(deps, cjy, a);

    expect(peeks).toEqual([3, 3, 3]);
    expect(given.length).toBe(6);
    expect(fx.logs.filter(l => l.includes('【隅泣】')).length).toBe(3);
  });

  it('正例：玩家指定交出的牌与自留的牌；「其余牌」的候选里没有已交出的那张', async () => {
    const { cjy, a, b } = table();
    const tao = mkCard({ name: CardName.TAO });
    const shan = mkCard({ name: CardName.SHAN });
    const sha = mkCard({ name: CardName.SHA });
    const deck = [tao, shan, sha];
    const reqs: SkillChoiceReq[] = [];
    const { deps } = makeHarness([cjy, a, b], {
      requestChoice: async (req) => {
        reqs.push(req);
        return reqs.length === 1
          ? { kind: 'multi', ids: [shan.id] }   // 把【闪】交给受伤角色
          : { kind: 'multi', ids: [tao.id] };   // 自己获得【桃】
      },
    });
    withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, cjy, a);

    expect(reqs.length).toBe(2);
    expect(reqs[0].choices!.map(c => c.id)).toEqual([sha.id, shan.id, tao.id]);  // 牌堆顶自上而下
    expect(reqs[1].choices!.map(c => c.id)).toEqual([sha.id, tao.id]);           // 不含已交出的【闪】
    expect(given.map(g => g.name)).toEqual([CardName.SHAN, CardName.TAO]);
    expect(deck.map(c => c.name)).toEqual([CardName.SHA]);
  });

  it('正例：「至多 1 张」可以交出 0 张——此时仍能获得 1 张', async () => {
    const { cjy, a, b } = table();
    const tao = mkCard({ name: CardName.TAO });
    const shan = mkCard({ name: CardName.SHAN });
    const sha = mkCard({ name: CardName.SHA });
    const deck = [tao, shan, sha];
    const reqs: SkillChoiceReq[] = [];
    const { deps } = makeHarness([cjy, a, b], {
      requestChoice: async (req) => {
        reqs.push(req);
        return reqs.length === 1
          ? { kind: 'multi', ids: [] }          // 一张都不交
          : { kind: 'multi', ids: [sha.id] };   // 自己获得堆顶那张
      },
    });
    withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, cjy, a);

    expect(reqs[1].choices!.map(c => c.id)).toEqual([sha.id, shan.id, tao.id]);  // 没交出 → 三张都在
    expect(given.map(g => g.name)).toEqual([CardName.SHA]);
    expect(deck.map(c => c.name)).toEqual([CardName.TAO, CardName.SHAN]);
  });

  it('反例：玩家选择「不发动」→ 什么都不发生，且不占用本回合次数', async () => {
    const { cjy, a, b } = table();
    const deck = mkDeck([CardName.TAO, CardName.SHAN, CardName.SHA]);
    const reqs: SkillChoiceReq[] = [];
    const { deps, fx } = makeHarness([cjy, a, b], {
      requestChoice: async (req) => {
        reqs.push(req);
        return reqs.length === 1 ? { kind: 'cancel' } : null;   // 先放弃，之后走自动分支
      },
    });
    withDeck(deps, deck);
    const given = trackGain(deps);

    await hurt(deps, cjy, a);
    expect(given).toEqual([]);
    expect(deck.length).toBe(3);
    expect(fx.logs).toEqual([]);
    expect(fx.banners).toEqual([]);

    // 放弃没有消耗次数：第二次伤害照常发动
    await hurt(deps, cjy, a);
    expect(given.length).toBe(2);
    expect(fx.logs.filter(l => l.includes('【隅泣】')).length).toBe(1);
  });

  it('反例：牌堆为空时无可观看，不发动也不提问', async () => {
    const { cjy, a, b } = table();
    const { deps, fx } = makeHarness([cjy, a, b]);
    const deck: Card[] = [];
    const { peeks } = withDeck(deps, deck);
    const reqs: SkillChoiceReq[] = [];
    deps.requestChoice = async (req) => { reqs.push(req); return null; };
    const given = trackGain(deps);

    await hurt(deps, cjy, a);

    expect(peeks).toEqual([3]);   // 试过观看，拿到 0 张即返回
    expect(reqs.length).toBe(0);
    expect(given).toEqual([]);
    expect(fx.logs).toEqual([]);
  });
});
