import { describe, expect, it } from 'vitest';
import { makeHarness, mkPlayer } from './testHarness';
import { dispatchDrawPhaseBegin, dispatchPlayPhaseBegin } from './dispatch';
import { skillsOf } from './registry';
import './batch6new13';

/**
 * 任婉「狷急」选项 1 的行为测试。
 *
 * 断言的是**规则**：谁触发、改成了几张、什么时候不发动、有没有自己偷偷摸牌。
 * 正例与反例成对——只测正例等于没测边界。
 *
 * 选项 2 的断言在本文件末尾（它此前长期零覆盖，因此「视为使用【杀】会打到自己」
 * 这个缺陷一直没被拦住 —— 见那几条负例）。
 *
 * 注：本组当年退回的 纫霜 / 归离 / 幸宠 / 流年 四条，后来引擎原语补齐后已在
 * batch6new17 / 25 / 16 / 19 正式实装，各自的测试在那几个文件里。
 * 这里原先有一条「四条一律未注册」的守卫，但它只 import 了本文件，
 * skillsOf() 看不见别的批次 → 那条断言恒为真、什么都没测，已删除。
 */

/** 任婉(0) + 甲(1)；任婉是否人类 / 体力上限可配 */
const board = (o: { human?: boolean; maxHp?: number } = {}) => {
  const rw = mkPlayer({
    id: 0,
    name: '任婉',
    isHuman: o.human ?? true,
    maxHp: o.maxHp ?? 3,
    hp: o.maxHp ?? 3,
  });
  const a = mkPlayer({ id: 1, name: '甲' });
  return { rw, a, players: [rw, a] };
};

/** 记录每次提问载荷的脚本化应答 */
const script = (res: unknown) => {
  const seen: Array<Record<string, unknown>> = [];
  const fn = async (req: any) => { seen.push(req); return res as any; };
  return { seen, fn };
};

/** 摸牌阶段开始（drawerId 默认为任婉） */
const begin = (
  deps: Parameters<typeof dispatchDrawPhaseBegin>[0],
  count = 2,
  drawerId = 0,
) => dispatchDrawPhaseBegin(deps, drawerId, { count });

describe('任婉「狷急」选项 1：摸牌阶段开始时，摸体力上限张牌', () => {
  it('正例：人类玩家选「执行」→ 摸牌数改为体力上限（3），且技能自己不摸牌', async () => {
    const { rw, players } = board();
    const { seen, fn } = script({ kind: 'choose', id: 'yes' });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps);

    expect(r.count).toBe(rw.maxHp);            // 3：整段替换基础 2 张
    expect(r.replaced).toBeUndefined();        // 不是「不摸牌」，是改写张数
    // 摸牌由引擎在收到 count 之后自己做（App.tsx:3183），技能不得自己摸
    expect(fx.drawn).toEqual([]);
    expect(fx.logs).toEqual(['【狷急】任婉 执行选项 1，摸体力上限张牌（3 张，基础 2 张）']);
    expect(fx.banners).toEqual(['任婉:狷急']);

    // 只呈现选项 1 一个入口，不虚构选项 2/3
    expect(seen).toHaveLength(1);
    expect(seen[0].mode).toBe('choose');
    expect(seen[0].choices).toEqual([{ id: 'yes', label: '执行选项 1：摸 3 张牌（体力上限）' }]);
    expect(seen[0].cancelLabel).toBe('不发动');
    expect(seen[0].hint).toBe('体力上限 3 张，基础摸牌 2 张');
  });

  it('正例：AI / 托管（返回 null）且体力上限高于基础摸牌数 → 自动执行选项 1', async () => {
    const { rw, players } = board({ human: false });
    const { deps, fx } = makeHarness(players);       // 默认 requestChoice 返回 null

    const r = await begin(deps);

    expect(r.count).toBe(rw.maxHp);
    expect(fx.logs.some(l => l.includes('【狷急】任婉 执行选项 1'))).toBe(true);
  });

  it('正例：体力上限被 changeMaxHp 改过之后，按改后的当前值取，且不夹「至多 5」', async () => {
    const { rw, players } = board({ maxHp: 6 });
    const { deps } = makeHarness(players);

    const r = await begin(deps);

    // 原文「至多 5」是「幸宠」的 X 上限，狷急的 X 没有上限
    expect(r.count).toBe(6);
    expect(rw.maxHp).toBe(6);
  });

  it('反例：玩家选「不发动」→ 不干预，引擎按基础摸牌数结算', async () => {
    const { players } = board();
    const { seen, fn } = script({ kind: 'cancel' });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps, 2);

    expect(r).toEqual({});                       // mergeDrawPhase 没有收到任何改写
    expect(seen).toHaveLength(1);                // 问过，但玩家放弃了
    expect(fx.logs).toEqual([]);
    expect(fx.banners).toEqual([]);
  });

  it('反例：读秒超时（kind: timeout）按「不发动」处理', async () => {
    const { players } = board();
    const { fn } = script({ kind: 'timeout' });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps);

    expect(r).toEqual({});
    expect(fx.logs).toEqual([]);
  });

  it('反例：AI / 托管且体力上限不高于基础摸牌数（无收益）→ 不发动，一次都不问', async () => {
    // 体力上限 3 对基础摸牌 3：发动只会少摸，AI 不执行也不提问
    const { players } = board({ human: false });
    const { seen, fn } = script({ kind: 'choose', id: 'yes' });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps, 3);

    expect(r).toEqual({});
    expect(seen).toEqual([]);
    expect(fx.logs).toEqual([]);
  });

  it('正例：人类玩家在「无收益」（体力上限 = 基础摸牌数）时仍可自行选择执行', async () => {
    const { players } = board();
    const { seen, fn } = script({ kind: 'choose', id: 'yes' });
    const { deps } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps, 3);

    expect(seen).toHaveLength(1);
    expect(r.count).toBe(3);                     // 玩家自己选的，照写
  });

  it('反例：不是任婉的摸牌阶段（别人摸牌）→ 完全不派发', async () => {
    const { a, players } = board();
    const { seen, fn } = script({ kind: 'choose', id: 'yes' });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps, 2, a.id);

    expect(r).toEqual({});
    expect(seen).toEqual([]);
    expect(fx.logs).toEqual([]);
  });

  it('反例：技能被封印（skillsOn 为假）时不派发', async () => {
    const { players } = board();
    const { seen, fn } = script({ kind: 'choose', id: 'yes' });
    const { deps } = makeHarness(players, { requestChoice: fn, skillsOn: () => false });

    const r = await begin(deps);

    expect(r).toEqual({});
    expect(seen).toEqual([]);
  });

  it('反例：任婉已阵亡时不派发', async () => {
    const { rw, players } = board();
    rw.isDead = true;
    const { seen, fn } = script({ kind: 'choose', id: 'yes' });
    const { deps } = makeHarness(players, { requestChoice: fn });

    const r = await begin(deps);

    expect(r).toEqual({});
    expect(seen).toEqual([]);
  });
});

describe('任婉「狷急」选项 2：出牌阶段开始时，失去 1 点体力并视为使用【杀】', () => {
  it('正例（人类）：选一名范围内角色 → 失去 1 点体力并视为对其使用【杀】', async () => {
    const { rw, players } = board({ human: true });
    // 选项 2 的人类分支只问一次：直接选目标（cancelLabel 即「不发动」）
    const { fn } = script({ kind: 'target', ids: [1] });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });
    deps.canReach = () => true;
    await dispatchPlayPhaseBegin(deps, rw);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].targetIds).toEqual([1]);   // 甲，不是自己
    expect(fx.logs.some(l => l.includes('执行选项 2'))).toBe(true);
  });

  it('反例（人类）：目标选择点「不发动」→ 不失去体力也不出杀', async () => {
    const { rw, players } = board({ human: true });
    const { fn } = script({ kind: 'cancel' });
    const { deps, fx } = makeHarness(players, { requestChoice: fn });
    deps.canReach = () => true;
    await dispatchPlayPhaseBegin(deps, rw);
    expect(fx.usedCards).toEqual([]);
    expect(fx.logs.some(l => l.includes('执行选项 2'))).toBe(false);
  });

  it('反例：【杀】不能指定自己 —— 只剩任婉一人时不发动', async () => {
    const rw = mkPlayer({ id: 0, name: '任婉', isHuman: false, maxHp: 3, hp: 3 });
    const { deps, fx } = makeHarness([rw]);
    deps.canReach = () => true;
    await dispatchPlayPhaseBegin(deps, rw);
    expect(fx.usedCards).toEqual([]);
    expect(fx.logs.some(l => l.includes('执行选项 2'))).toBe(false);
  });

  it('反例：AI 不得因为「刚失去 1 点体力后自己体力最低」而打自己', async () => {
    // 回归用例：旧实现 others 只过 !isDead，AI 分支按体力最低排序，
    // 任婉 1 体力而甲 3 体力时，loseHp 之后最低的反而是任婉自己。
    const rw = mkPlayer({ id: 0, name: '任婉', isHuman: false, maxHp: 3, hp: 1 });
    const a = mkPlayer({ id: 1, name: '甲', hp: 3 });
    const { deps, fx } = makeHarness([rw, a]);
    deps.canReach = () => true;
    await dispatchPlayPhaseBegin(deps, rw);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].targetIds).toEqual([1]);   // 必须是甲
  });

  it('反例：目标都在攻击范围外 —— 不发动（选项 2 不免距离）', async () => {
    const { players } = board({ human: false });
    const { deps, fx } = makeHarness(players);
    deps.canReach = () => false;
    await dispatchPlayPhaseBegin(deps, players[0]);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：不是任婉的出牌阶段 —— 不派发', async () => {
    const { a, players } = board();
    const { deps, fx } = makeHarness(players);
    deps.canReach = () => true;
    await dispatchPlayPhaseBegin(deps, a);
    expect(fx.usedCards).toEqual([]);
  });
});

describe('注册名与 HEROES 逐字一致，且不装降级版', () => {
  it('任婉：狷急已进注册表', () => {
    expect(skillsOf('任婉').map(d => d.skill)).toContain('狷急');
  });

  it('狷急是主动技（非锁定技），不被标记为 locked', () => {
    const def = skillsOf('任婉').find(d => d.skill === '狷急');
    expect(def?.locked).toBeFalsy();
  });

});
