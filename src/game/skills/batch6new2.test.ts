import { describe, expect, it } from 'vitest';
import { makeHarness, mkCard, mkPlayer, drawnFor } from './testHarness';
import { dispatchCardLost, dispatchCardUsed, dispatchTurnEnd, dispatchTurnStart } from './dispatch';
import { CardName, CardType } from '../../../types';
import type { Card, Player } from '../../../types';
import '../skills/index';

/**
 * 第六批女将 · 第 2 组：已实装的 4 个技能（易数 / 伏械 / 娴静 / 联对）。
 *
 * 断言的是**规则**而不是「跑不跑得动」：谁摸牌、摸几张、数字怎么变、触没触发。
 * 每个技能都配「不该触发」的反例——只测正例等于没测边界。
 *
 * 数字状态存在 heroMemory 里（同武将共享，供「慧淑」/「隅泣」读取），
 * 但它不可从测试直接读，所以用战报里的「before → after」文本断言，
 * 这同时校验了日志与状态是同一份计算。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);

/** 一张武器牌（EQUIP_META 里 slot === 'weapon'） */
const weaponCard = () => card({ name: CardName.QINGGANG, type: CardType.EQUIPMENT });

/** afterCardLost 事件（技能只读 player / cards / cause） */
const lost = (
  player: Player,
  cards: Card[],
  cause: 'discard' | 'gain' | 'equip' | 'other' = 'discard',
) => ({ player, cards, cause, handAfter: player.hand.length, fromEquip: false });

const hasLog = (logs: string[], s: string) => logs.some(l => l.includes(s));

describe('全惠解「易数」', () => {
  it('回合外失去牌：「慧淑」最小数字 +2、最大数字 -1', async () => {
    const quan = mkPlayer({ id: 0, name: '全惠解', hand: [card(), card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([quan, other]);
    deps.turnOwner = other; // 回合外
    await dispatchCardLost(deps, lost(quan, [card()]));
    // 初始 [2,2]：最小 +2 → [4,2]，再取最大 -1 → [3,2]
    expect(hasLog(fx.logs, '数字 2/2 → 3/2')).toBe(true);
    expect(fx.banners.some(b => b.includes('易数'))).toBe(true);
  });

  it('连续失去牌会继续按 +2/-1 演化', async () => {
    const quan = mkPlayer({ id: 0, name: '全惠解', hand: [card(), card(), card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([quan, other]);
    deps.turnOwner = other; // 回合外
    await dispatchCardLost(deps, lost(quan, [card()]));
    await dispatchCardLost(deps, lost(quan, [card()]));
    // [3,2] → 最小(2)+2 → [3,4]，最大(3)-1 → [2,4]
    expect(hasLog(fx.logs, '数字 3/2 → 2/4')).toBe(true);
  });

  it('反例：自己的回合内失去牌不触发（出牌阶段外无法精确判定，只取安全子集）', async () => {
    const quan = mkPlayer({ id: 0, name: '全惠解', hand: [card(), card()] });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([quan, other]);
    deps.turnOwner = quan;
    await dispatchCardLost(deps, lost(quan, [card()]));
    expect(fx.logs).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('反例：别人失去牌不触发', async () => {
    const quan = mkPlayer({ id: 0, name: '全惠解', hand: [card()] });
    const other = mkPlayer({ id: 1, name: '甲', hand: [card()] });
    const { deps, fx } = makeHarness([quan, other]);
    await dispatchCardLost(deps, lost(other, [card()]));
    expect(fx.logs).toEqual([]);
  });
});

describe('黄舞蝶「伏械」', () => {
  it('弃置手牌中的武器牌，令一名其他角色弃两张牌', async () => {
    const huang = mkPlayer({ id: 0, name: '黄舞蝶', hand: [weaponCard(), card()] });
    const foe = mkPlayer({ id: 1, name: '甲', hand: [card(), card(), card()] });
    const { deps, fx } = makeHarness([huang, foe]);
    await dispatchTurnEnd(deps, huang);
    // 代价：自己弃 1 张；目标：弃 2 张
    expect(fx.discarded).toContainEqual({ playerId: 0, count: 1 });
    expect(fx.discarded).toContainEqual({ playerId: 1, count: 2 });
    expect(hasLog(fx.logs, '伏械')).toBe(true);
  });

  it('装备区的武器牌也能作为代价，并从装备区消失', async () => {
    const huang = mkPlayer({ id: 0, name: '黄舞蝶', hand: [], equipment: { weapon: weaponCard() } });
    const foe = mkPlayer({ id: 1, name: '甲', hand: [card(), card()] });
    const { deps, fx } = makeHarness([huang, foe]);
    const calls: string[] = [];
    deps.requestChoice = async (req) => {
      calls.push(req.title);
      // 第一次问代价，选装备区那张；第二次问目标，选甲
      if (req.title.includes('弃置一张武器牌')) {
        return { kind: 'choose', id: req.choices![req.choices!.length - 1].id };
      }
      return null;
    };
    await dispatchTurnEnd(deps, huang);
    expect(deps.players[0].equipment?.weapon).toBeUndefined();
    expect(fx.discarded).toContainEqual({ playerId: 1, count: 2 });
  });

  it('反例：没有武器牌时不触发', async () => {
    const huang = mkPlayer({ id: 0, name: '黄舞蝶', hand: [card()] });
    const foe = mkPlayer({ id: 1, name: '甲', hand: [card(), card()] });
    const { deps, fx } = makeHarness([huang, foe]);
    await dispatchTurnEnd(deps, huang);
    expect(fx.discarded).toEqual([]);
    expect(fx.logs).toEqual([]);
  });

  it('反例：别人回合结束不触发', async () => {
    const huang = mkPlayer({ id: 0, name: '黄舞蝶', hand: [weaponCard()] });
    const other = mkPlayer({ id: 1, name: '甲', hand: [card()] });
    const { deps, fx } = makeHarness([huang, other]);
    await dispatchTurnEnd(deps, other);
    expect(fx.discarded).toEqual([]);
  });

  it('反例：目标手牌不足两张时按实际张数弃置，不谎报', async () => {
    const huang = mkPlayer({ id: 0, name: '黄舞蝶', hand: [weaponCard()] });
    const foe = mkPlayer({ id: 1, name: '甲', hand: [card()] });
    const { deps, fx } = makeHarness([huang, foe]);
    await dispatchTurnEnd(deps, huang);
    expect(fx.discarded).toContainEqual({ playerId: 1, count: 1 });
  });
});

describe('曹金玉「娴静」', () => {
  it('准备阶段令「隅泣」数字 +1；未受伤再 +1', async () => {
    const cao = mkPlayer({ id: 0, name: '曹金玉', hp: 3, maxHp: 3 });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([cao, other]);
    await dispatchTurnStart(deps, cao);
    // 初始 [2,3] → 最小(2)+1 → [3,3] → 未受伤再 +1 → [4,3]
    expect(hasLog(fx.logs, '数字 2/3 → 4/3')).toBe(true);
    expect(fx.banners.some(b => b.includes('娴静'))).toBe(true);
  });

  it('已受伤时只 +1', async () => {
    const cao = mkPlayer({ id: 0, name: '曹金玉', hp: 2, maxHp: 3 });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([cao, other]);
    await dispatchTurnStart(deps, cao);
    expect(hasLog(fx.logs, '数字 2/3 → 3/3')).toBe(true);
    expect(hasLog(fx.logs, '已受伤')).toBe(true);
  });

  it('反例：不是自己的回合开始时不触发', async () => {
    const cao = mkPlayer({ id: 0, name: '曹金玉' });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([cao, other]);
    await dispatchTurnStart(deps, other);
    expect(fx.logs).toEqual([]);
  });

  it('反例：单项已达 5 时不再增加', async () => {
    const cao = mkPlayer({ id: 0, name: '曹金玉', hp: 3, maxHp: 3 });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([cao, other]);
    // 连开两个自己的回合，把数字推到上限
    for (let i = 0; i < 3; i++) await dispatchTurnStart(deps, cao);
    // [2,3] → [4,3] → [4,5] → [5,5]，第三次再问已无 ≤5 的空位
    const last = fx.logs[fx.logs.length - 1];
    expect(last).toContain('5/5');
    // 封顶后不再有新的娴静战报
    const count = fx.logs.filter(l => l.includes('娴静')).length;
    await dispatchTurnStart(deps, cao);
    expect(fx.logs.filter(l => l.includes('娴静')).length).toBe(count);
  });
});

describe('李婉「联对」', () => {
  const used = (source: Player, targets: Player[], c: Card, n = 1) =>
    ({ source, card: c, targets, usedCount: n });

  it('不是同一个人连续使用牌，且其中一名是李婉：令上一名使用者摸两张', async () => {
    const li = mkPlayer({ id: 0, name: '李婉' });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([li, other]);
    await dispatchCardUsed(deps, used(other, [li], card()));
    // 第一次只记录，无效果
    expect(fx.logs).toEqual([]);
    await dispatchCardUsed(deps, used(li, [other], card()));
    expect(drawnFor(fx, 1)).toBe(2);
    expect(hasLog(fx.logs, '联对')).toBe(true);
  });

  it('上一次使用牌的是李婉（当前使用者是别人）同样触发', async () => {
    const li = mkPlayer({ id: 0, name: '李婉' });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([li, other]);
    await dispatchCardUsed(deps, used(li, [other], card()));
    await dispatchCardUsed(deps, used(other, [li], card()));
    expect(drawnFor(fx, 0)).toBe(2);
    expect(hasLog(fx.logs, '自动分支')).toBe(true);
  });

  it('反例：两名使用者都不是李婉时不触发', async () => {
    const li = mkPlayer({ id: 0, name: '李婉' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    const { deps, fx } = makeHarness([li, a, b]);
    await dispatchCardUsed(deps, used(a, [b], card()));
    await dispatchCardUsed(deps, used(b, [a], card()));
    expect(fx.drawn).toEqual([]);
    expect(fx.logs).toEqual([]);
  });

  it('反例：同一角色连续使用牌（不是「上一次使用牌的角色」之外的人）', async () => {
    const li = mkPlayer({ id: 0, name: '李婉' });
    const other = mkPlayer({ id: 1, name: '甲' });
    const { deps, fx } = makeHarness([li, other]);
    await dispatchCardUsed(deps, used(li, [other], card()));
    await dispatchCardUsed(deps, used(li, [other], card()));
    expect(fx.drawn).toEqual([]);
  });
});
