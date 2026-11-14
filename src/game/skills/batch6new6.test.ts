import { describe, expect, it } from 'vitest';
import { drawnFor, makeHarness, mkCard, mkPlayer } from './testHarness';
import { dispatchAfterDamage, dispatchCardUsed, dispatchTurnEnd, dispatchTurnStart } from './dispatch';
import { skillsOf } from './registry';
import { Suit } from '../../../types';
import type { Card, Player } from '../../../types';
import type { CardUsedEvent, DamageEvent } from './registry';
import './batch6new6';

/**
 * 董贵人「凌芳 / 归罪」的行为测试。
 *
 * 断言的是**规则**：什么方向的牌、什么花色、有没有造成伤害、标记怎么累加。
 * 每个技能都配反例——只测正例等于没测边界。
 *
 * 本组另外 3 条（☆ 受责 / 张楚 集众 / 光噬）缺引擎原语未实装，本文件不含它们的断言
 * （它们仍在 skillCoverage.test.ts 的 LEGACY_INLINE 里，理由见 batch6new6.ts 的文件头）。
 *
 * 注意：两条技能都是锁定技、且条件互有重叠（归罪 = 凌芳 + 未受伤），
 * 所以一张**未造成伤害**的黑色牌会各给 1 个「绞」。测试把这一点写成了显式断言，
 * 不让它藏在日志里（数据层同时声明了两个版本，见交付报告的上报项）。
 */

const card = (o: Partial<Card> = {}) => mkCard(o);
const black = (o: Partial<Card> = {}) => mkCard({ suit: Suit.SPADE, ...o });
const red = (o: Partial<Card> = {}) => mkCard({ suit: Suit.HEART, ...o });

const used = (source: Player, targets: Player[], c: Card): CardUsedEvent =>
  ({ source, card: c, targets, usedCount: 1 });
const hurt = (victim: Player, source: Player, c: Card): DamageEvent =>
  ({ victim, source, amount: 1, nature: 'normal', card: c });

const withTag = (logs: string[], tag: string) => logs.filter(l => l.includes('【' + tag + '】'));

const board = () => {
  const dg = mkPlayer({ id: 0, name: '董贵人' });
  const a = mkPlayer({ id: 1, name: '甲' });
  const b = mkPlayer({ id: 2, name: '乙' });
  return { dg, a, b, players: [dg, a, b] };
};

describe('董贵人「凌芳」', () => {
  it('正例：其他角色对董贵人使用黑色牌并造成伤害，董贵人获得 1 个「绞」', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);
    const slash = black({ name: '杀' as Card['name'] });

    // 生产时序：伤害在结算中派发，afterCardUsed 在 finally 里
    await dispatchAfterDamage(deps, hurt(dg, a, slash));
    await dispatchCardUsed(deps, used(a, [dg], slash));

    const ling = withTag(fx.logs, '凌芳');
    expect(ling).toHaveLength(1);
    expect(ling[0]).toContain('甲 对 董贵人 使用黑色牌【杀】');
    expect(ling[0]).toContain('（当前 1 个）');
    // 这张牌真的造成了伤害 → 归罪不触发（两个版本的边界就藏在这里）
    expect(withTag(fx.logs, '归罪')).toEqual([]);
    expect(fx.banners).toContain('董贵人:凌芳');
  });

  it('正例：董贵人对其他角色使用黑色牌（反方向）同样给标记', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);
    const duel = black({ name: '决斗' as Card['name'] });

    await dispatchCardUsed(deps, used(dg, [a], duel));

    const ling = withTag(fx.logs, '凌芳');
    expect(ling).toHaveLength(1);
    expect(ling[0]).toContain('董贵人 对 甲 使用黑色牌【决斗】');
    expect(ling[0]).toContain('（当前 1 个）');
  });

  it('正例：梅花也是黑色牌，且标记跨张累加', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);

    await dispatchCardUsed(deps, used(a, [dg], black({ suit: Suit.CLUB, name: '杀' as Card['name'] })));
    await dispatchCardUsed(deps, used(a, [dg], black({ name: '杀' as Card['name'] })));

    const ling = withTag(fx.logs, '凌芳');
    // 每张未造成伤害的黑色牌都同时过凌芳与归罪（各 1 个），所以计数是 1 → 3
    expect(ling[0].endsWith('（当前 1 个）')).toBe(true);
    expect(ling[1].endsWith('（当前 3 个）')).toBe(true);
  });

  it('反例：红色牌不给标记', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);

    await dispatchCardUsed(deps, used(a, [dg], red({ name: '杀' as Card['name'] })));

    expect(withTag(fx.logs, '凌芳')).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('反例：黑色牌但与董贵人无关（甲对乙）不触发', async () => {
    const { a, b, players } = board();
    const { deps, fx } = makeHarness(players);

    await dispatchCardUsed(deps, used(a, [b], black({ name: '杀' as Card['name'] })));

    expect(withTag(fx.logs, '凌芳')).toEqual([]);
    expect(withTag(fx.logs, '归罪')).toEqual([]);
  });

  it('反例：董贵人自己使用黑色牌但只指定自己，不算「对其他角色使用」', async () => {
    const { dg, players } = board();
    const { deps, fx } = makeHarness(players);

    await dispatchCardUsed(deps, used(dg, [dg], black({ name: '无中生有' as Card['name'] })));

    expect(withTag(fx.logs, '凌芳')).toEqual([]);
  });

  it('反例：锁定技——一次提问都不发', async () => {
    const { dg, a, players } = board();
    let asked = 0;
    const { deps } = makeHarness(players, {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchCardUsed(deps, used(a, [dg], black({ name: '杀' as Card['name'] })));

    expect(asked).toBe(0);
  });
});

describe('董贵人「归罪」', () => {
  it('正例：黑色牌未造成伤害时给「绞」（此牌同时也过凌芳，故共 2 个）', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);
    const guohe = black({ name: '过河拆桥' as Card['name'] });

    await dispatchCardUsed(deps, used(a, [dg], guohe));

    const zui = withTag(fx.logs, '归罪');
    expect(zui).toHaveLength(1);
    expect(zui[0]).toContain('甲 对 董贵人 使用黑色牌【过河拆桥】且未造成伤害');
    // 凌芳先注册、先给 1 个，归罪再给第 2 个
    expect(zui[0]).toContain('（当前 2 个）');
    expect(withTag(fx.logs, '凌芳')[0]).toContain('（当前 1 个）');
    expect(fx.banners).toContain('董贵人:归罪');
  });

  it('反例：这张黑牌造成了伤害 → 不给标记', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);
    const slash = black({ name: '杀' as Card['name'] });

    await dispatchAfterDamage(deps, hurt(dg, a, slash));
    await dispatchCardUsed(deps, used(a, [dg], slash));

    expect(withTag(fx.logs, '归罪')).toEqual([]);
    // 凌芳不看伤害，仍然给 1 个
    expect(withTag(fx.logs, '凌芳')).toHaveLength(1);
  });

  it('反例：董贵人对其他角色使用黑牌并造成伤害 → 不给标记（反方向同判）', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);
    const slash = black({ name: '杀' as Card['name'] });

    await dispatchAfterDamage(deps, hurt(a, dg, slash));
    await dispatchCardUsed(deps, used(dg, [a], slash));

    expect(withTag(fx.logs, '归罪')).toEqual([]);
  });

  it('正例：伤害是别的牌造成的，不影响本张牌的判定', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);
    const guohe = black({ name: '过河拆桥' as Card['name'] });
    const other = black({ name: '杀' as Card['name'] });

    await dispatchAfterDamage(deps, hurt(dg, a, other));       // 另一张牌造成的伤害
    await dispatchCardUsed(deps, used(a, [dg], guohe));

    expect(withTag(fx.logs, '归罪')).toHaveLength(1);
  });

  it('反例：多目标黑牌里有一名目标受伤，就不给标记', async () => {
    const { dg, a, b, players } = board();
    const { deps, fx } = makeHarness(players);
    const arrows = black({ name: '万箭齐发' as Card['name'] });

    await dispatchAfterDamage(deps, hurt(b, dg, arrows));      // 乙受伤，甲没受伤
    await dispatchCardUsed(deps, used(dg, [a, b], arrows));

    expect(withTag(fx.logs, '归罪')).toEqual([]);
  });

  it('反例：红色牌不给标记', async () => {
    const { dg, a, players } = board();
    const { deps, fx } = makeHarness(players);

    await dispatchCardUsed(deps, used(a, [dg], red({ name: '桃' as Card['name'] })));

    expect(withTag(fx.logs, '归罪')).toEqual([]);
  });

  it('反例：无伤害以外的无关黑色牌（甲对乙）不触发', async () => {
    const { a, b, players } = board();
    const { deps, fx } = makeHarness(players);

    await dispatchCardUsed(deps, used(a, [b], black({ name: '过河拆桥' as Card['name'] })));

    expect(withTag(fx.logs, '归罪')).toEqual([]);
  });

  it('反例：锁定技——一次提问都不发', async () => {
    const { dg, a, players } = board();
    let asked = 0;
    const { deps } = makeHarness(players, {
      requestChoice: async () => { asked += 1; return null; },
    });

    await dispatchCardUsed(deps, used(a, [dg], black({ name: '过河拆桥' as Card['name'] })));

    expect(asked).toBe(0);
  });
});

describe('张楚「集众」', () => {
  /** 张楚(0) 甲(1) 乙(2)；甲的手牌可配 */
  const board = (hand = 3, human: number[] = []) => {
    const zc = mkPlayer({ id: 0, name: '张楚' });
    const a = mkPlayer({ id: 1, name: '甲', isHuman: human.includes(1) });
    const b = mkPlayer({ id: 2, name: '乙', isHuman: human.includes(2) });
    a.hand = Array.from({ length: hand }, () => card());
    return { zc, a, b, players: [zc, a, b] };
  };

  /** 脚本化弹窗：目标选择 / 目标的两选项 / 弃哪几张；并记录每次提问的载荷 */
  const seen: Array<Record<string, unknown>> = [];
  const scripted = (o: { target?: number | 'cancel'; option?: 'mark' | 'discard' | 'cancel' }) =>
    async (req: any) => {
      seen.push(req);
      if (req.mode === 'target') {
        if (!o.target || o.target === 'cancel') return { kind: 'cancel' };
        return { kind: 'target', ids: [o.target] };
      }
      if (req.mode === 'choose') {
        if (o.option === 'cancel') return { kind: 'cancel' };
        return { kind: 'choose', id: o.option ?? 'mark' };
      }
      return null;                       // 「弃哪三张」：走按顺序弃置的兜底
    };

  it('正例：令一名其他角色摸两张牌，其（AI 托管）获得「信众」标记', async () => {
    const { zc, a, players } = board();
    const { deps, fx } = makeHarness(players, { requestChoice: scripted({ target: 1 }) });

    await dispatchTurnEnd(deps, zc);

    expect(drawnFor(fx, a.id)).toBe(2);
    expect(drawnFor(fx, zc.id)).toBe(0);
    expect(fx.logs.some(l => l.includes('【集众】张楚 令 甲 摸两张牌并获得 1 个「信众」标记（甲 当前 1 个）')))
      .toBe(true);
    expect(fx.banners).toContain('张楚:集众');
  });

  it('正例：标记贴在**别人**身上——下一次发动的目标列表里读得到（跨角色读取）', async () => {
    const { zc, a, b, players } = board();
    seen.length = 0;
    let call = 0;
    const { deps, fx } = makeHarness(players, {
      requestChoice: async (req: any) => {
        seen.push(req);
        if (req.mode !== 'target') return null;
        call += 1;
        // 第一轮由玩家指定甲；第二轮返回 null → 走 AI / 托管分支
        return call === 1 ? { kind: 'target', ids: [a.id] } : null;
      },
    });

    await dispatchTurnEnd(deps, zc);                  // 甲 获得「信众」

    // 新回合再发动一次，这次看目标列表：甲的 sub 里应该已经记着「信众 1」
    await dispatchTurnStart(deps, b);
    await dispatchTurnEnd(deps, zc);

    const targetReqs = seen.filter((r: any) => r.mode === 'target');
    expect(targetReqs).toHaveLength(2);
    const subs = (targetReqs[1] as any).targets as Array<{ id: number; sub: string }>;
    expect(subs.find(t => t.id === a.id)?.sub).toContain('信众 1');
    expect(subs.find(t => t.id === b.id)?.sub).toContain('信众 0');
    // 第二轮的自动分支：优先还没有「信众」的角色（乙）
    expect(drawnFor(fx, b.id)).toBe(2);
    expect(fx.logs.some(l => l.includes('令 乙 摸两张牌并获得 1 个「信众」标记'))).toBe(true);
  });

  it('正例：人类目标选②，弃置三张手牌（不足则全弃）', async () => {
    const { zc, a, players } = board(5, [1]);
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ target: 1, option: 'discard' }),
    });

    await dispatchTurnEnd(deps, zc);

    expect(fx.discarded).toEqual([{ playerId: a.id, count: 3 }]);
    expect(fx.logs.some(l => l.includes('令 甲 摸两张牌并弃置 3 张手牌'))).toBe(true);
    expect(fx.logs.some(l => l.includes('获得 1 个「信众」标记'))).toBe(false);
    expect(drawnFor(fx, a.id)).toBe(2);                // 摸牌在选项之前，两条路都摸
  });

  it('正例：手牌不足三张时全弃', async () => {
    const { zc, a, players } = board(2, [1]);
    const { deps, fx } = makeHarness(players, {
      requestChoice: scripted({ target: 1, option: 'discard' }),
    });

    await dispatchTurnEnd(deps, zc);

    expect(fx.discarded).toEqual([{ playerId: a.id, count: 2 }]);
  });

  it('反例：不是自己的回合结束时不发动（一次都不问）', async () => {
    const { a, players } = board();
    let asked = 0;
    const { deps, fx } = makeHarness(players, {
      requestChoice: async (req) => { asked += 1; return scripted({ target: 1 })(req); },
    });

    await dispatchTurnEnd(deps, a);

    expect(asked).toBe(0);
    expect(fx.drawn).toEqual([]);
    expect(fx.logs.some(l => l.includes('集众'))).toBe(false);
  });

  it('反例：出牌阶段限一次——同一回合内第二次回合结束不再发动', async () => {
    const { zc, a, players } = board();
    const { deps, fx } = makeHarness(players, { requestChoice: scripted({ target: 1 }) });

    await dispatchTurnEnd(deps, zc);
    await dispatchTurnEnd(deps, zc);                  // 同一回合（没有回合开始）

    expect(drawnFor(fx, a.id)).toBe(2);                // 只有第一次的摸两张
  });

  it('反例：新回合开始后复位，可以再次发动', async () => {
    const { zc, a, b, players } = board();
    const { deps, fx } = makeHarness(players, { requestChoice: scripted({ target: 1 }) });

    await dispatchTurnEnd(deps, zc);
    expect(drawnFor(fx, a.id)).toBe(2);

    await dispatchTurnStart(deps, b);                  // 任意角色的新回合 → 复位
    await dispatchTurnEnd(deps, zc);
    expect(drawnFor(fx, a.id)).toBe(4);
  });

  it('反例：玩家选「不发动」时不摸牌、不贴标记', async () => {
    const { zc, players } = board();
    const { deps, fx } = makeHarness(players, { requestChoice: scripted({ target: 'cancel' }) });

    await dispatchTurnEnd(deps, zc);

    expect(fx.drawn).toEqual([]);
    expect(fx.discarded).toEqual([]);
    expect(fx.logs.some(l => l.includes('集众'))).toBe(false);
  });

  it('反例：场上没有其他存活角色时不发动', async () => {
    const zc = mkPlayer({ id: 0, name: '张楚' });
    const dead = mkPlayer({ id: 1, name: '甲', isDead: true });
    let asked = 0;
    const { deps, fx } = makeHarness([zc, dead], {
      requestChoice: async (req) => { asked += 1; return scripted({ target: 1 })(req); },
    });

    await dispatchTurnEnd(deps, zc);

    expect(asked).toBe(0);
    expect(fx.drawn).toEqual([]);
    expect(fx.logs.some(l => l.includes('集众'))).toBe(false);
  });
});

describe('张楚「光噬」', () => {
  const board = () => {
    const zc = mkPlayer({ id: 0, name: '张楚' });
    const a = mkPlayer({ id: 1, name: '甲' });
    const b = mkPlayer({ id: 2, name: '乙' });
    return { zc, a, b, players: [zc, a, b] };
  };

  /**
   * 把「信众」贴到 n 个其他角色身上——走的是「集众」这个唯一的跨角色写入口
   * （张楚回合末发动一次贴一个人；中间派发一次回合开始给「集众」复位）。
   * 默认 requestChoice 返回 null → 集众走 AI 分支：优先还没「信众」的角色。
   */
  const markOthers = async (deps: Parameters<typeof dispatchTurnEnd>[0], zc: Player, a: Player, n = 2) => {
    for (let i = 0; i < n; i++) {
      await dispatchTurnEnd(deps, zc);
      await dispatchTurnStart(deps, a);
    }
  };

  it('正例：所有其他角色都有「信众」时，失去 1 点体力并摸两张牌', async () => {
    const { zc, a, b, players } = board();
    const { deps, fx } = makeHarness(players);
    await markOthers(deps, zc, a, 2);                 // 甲、乙 各得 1 个「信众」

    await dispatchTurnStart(deps, zc);                // 张楚的准备阶段

    expect(zc.hp).toBe(2);                            // 3 → 2：失去 1 点体力
    expect(drawnFor(fx, zc.id)).toBe(2);
    expect(fx.logs.some(l => l.includes('【光噬】') && l.includes('均拥有「信众」标记')
      && l.includes('失去 1 点体力（2/3）'))).toBe(true);
    expect(fx.banners).toContain('张楚:光噬');
    void b;
  });

  it('反例：有一名其他角色没有「信众」时不发动', async () => {
    const { zc, a, players } = board();
    const { deps, fx } = makeHarness(players);
    await markOthers(deps, zc, a, 1);                 // 只有甲有「信众」

    await dispatchTurnStart(deps, zc);

    expect(zc.hp).toBe(3);
    expect(drawnFor(fx, zc.id)).toBe(0);
    expect(fx.logs.some(l => l.includes('光噬'))).toBe(false);
  });

  it('反例：不是自己的回合开始时不发动（别人的准备阶段）', async () => {
    const { zc, a, b, players } = board();
    const { deps, fx } = makeHarness(players);
    await markOthers(deps, zc, a, 2);

    await dispatchTurnStart(deps, a);                 // 甲的准备阶段
    await dispatchTurnStart(deps, b);                 // 乙的准备阶段

    expect(zc.hp).toBe(3);
    expect(fx.logs.some(l => l.includes('光噬'))).toBe(false);

    await dispatchTurnStart(deps, zc);                // 对照：自己的准备阶段就发动
    expect(zc.hp).toBe(2);
  });

  it('反例：场上没有其他存活角色时不发动', async () => {
    const zc = mkPlayer({ id: 0, name: '张楚' });
    const dead = mkPlayer({ id: 1, name: '甲', isDead: true });
    const { deps, fx } = makeHarness([zc, dead]);

    await dispatchTurnStart(deps, zc);

    expect(zc.hp).toBe(3);
    expect(fx.drawn).toEqual([]);
    expect(fx.logs.some(l => l.includes('光噬'))).toBe(false);
  });

  it('反例：锁定技——准备阶段一次提问都不发', async () => {
    const { zc, a, players } = board();
    let asked = 0;
    const { deps } = makeHarness(players, {
      requestChoice: async () => { asked += 1; return null; },
    });
    await markOthers(deps, zc, a, 2);

    const before = asked;                             // 集众 的提问不计在内
    await dispatchTurnStart(deps, zc);

    expect(asked - before).toBe(0);
    expect(zc.hp).toBe(2);
  });
});

describe('注册名与 HEROES 逐字一致', () => {
  it('董贵人：凌芳 / 归罪；张楚：集众 / 光噬', () => {
    const dg = skillsOf('董贵人').map(d => d.skill);
    expect(dg).toContain('凌芳');
    expect(dg).toContain('归罪');
    const zc = skillsOf('张楚').map(d => d.skill);
    expect(zc).toContain('集众');
    expect(zc).toContain('光噬');
  });
});
