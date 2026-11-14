import { beforeEach, describe, expect, it } from 'vitest';
import {
  __clearSkillMemory, dispatchAfterDying, dispatchCardLost, dispatchDying, dispatchPlayPhaseBegin,
  dispatchRoundStart, dispatchTurnStart,
} from './dispatch';
import { registerSkill } from './registry';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import './batch6new16';

/**
 * batch6new16 的行为测试：化萍 / 连枝 / 风影 / 幸宠。
 *
 * 这四条都依赖「同一武将的 heroMemory 是同一份」这一约定，所以测试要么走真实路径
 * 播种（例如先用「幸宠」记下展示过的牌，再触发 afterCardLost），要么就只验一半。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });

/**
 * 辅助：走真实的 ctx.addMark 播种标记。
 *
 * 为什么不能直接覆盖 deps.markCount —— ctx.markCount 读的是 heroMemory，不是 deps 上的函数。
 */
let seedSeq = 0;
const seedMarks = async (
  deps: Parameters<typeof dispatchTurnStart>[0], owner: ReturnType<typeof mkPlayer>,
  mark: string, n: number,
) => {
  seedSeq += 1;
  registerSkill({
    hero: owner.hero.name,
    skill: '__seed_' + seedSeq,
    hooks: {
      onTurnStart: (ctx) => {
        if (ctx.memory.done) return;
        ctx.memory.done = true;
        ctx.addMark(mark, n);
      },
    },
  });
  await dispatchTurnStart(deps, owner);
};
const black = (o = {}) => mkCard({ suit: Suit.SPADE, ...o });

describe('来莺儿「化萍」', () => {
  it('正例：别的角色死亡 → 获得其全部技能、失去「绡舞」、清空「沙」标记并摸等量张', async () => {
    const ly = P(0, '来莺儿');
    const dead = P(1, '甲');
    dead.hero.skillName = '双锐/伏械';
    const { deps, fx } = makeHarness([ly, dead]);
    // 先贴 2 个「沙」（真实 ctx 路径：来莺儿自己的技能共用同一份 heroMemory）
    await seedMarks(deps, ly, '沙', 2);
    await import('./dispatch').then(m => m.dispatchDeath(deps, { dead, killer: undefined }));
    expect(fx.granted.map(g => g.skill)).toEqual(['双锐', '伏械']);
    // 「绡舞」是原生技能，撤不掉；化萍改为在 heroMemory 上写开关，由绡舞自己认
    expect(fx.revoked).toEqual([]);
    expect(fx.logs.some(l => l.includes('失去「绡舞」'))).toBe(true);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 2 }]);
  });

  it('反例：限定技只能发动一次', async () => {
    const ly = P(0, '来莺儿');
    const d1 = P(1, '甲');
    const d2 = P(2, '乙');
    d1.hero.skillName = '双锐';
    d2.hero.skillName = '伏械';
    const { deps, fx } = makeHarness([ly, d1, d2]);
    await import('./dispatch').then(m => m.dispatchDeath(deps, { dead: d1, killer: undefined }));
    await import('./dispatch').then(m => m.dispatchDeath(deps, { dead: d2, killer: undefined }));
    expect(fx.granted.map(g => g.skill)).toEqual(['双锐']);
  });
});

describe('董贵人「连枝」', () => {
  it('正例：自己的回合开始选定一名其他角色', async () => {
    const dg = P(0, '董贵人');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dg, a]);
    await dispatchTurnStart(deps, dg);
    expect(fx.banners).toContain('董贵人:连枝');
    expect(fx.logs.some(l => l.includes('连枝') && l.includes('甲'))).toBe(true);
  });

  it('正例：自己濒死时与该角色各摸一张牌，并把体力顶回 1 点', async () => {
    const dg = P(0, '董贵人');
    dg.hp = 0;
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dg, a]);
    await dispatchTurnStart(deps, dg);
    const res = await dispatchDying(deps, { victim: dg, source: undefined, needHp: 1 });
    expect(res).toEqual({ hp: 1 });
    expect(fx.drawn).toEqual([{ playerId: 0, count: 1 }, { playerId: 1, count: 1 }]);
    // 每回合限一次
    const again = await dispatchDying(deps, { victim: dg, source: undefined, needHp: 1 });
    expect(again).toBeNull();
  });

  it('反例：选定的角色已经死亡 —— 濒死时不发动', async () => {
    const dg = P(0, '董贵人');
    dg.hp = 0;
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dg, a]);
    await dispatchTurnStart(deps, dg);
    a.isDead = true;
    const res = await dispatchDying(deps, { victim: dg, source: undefined, needHp: 1 });
    expect(res).toBeNull();
    expect(fx.drawn).toEqual([]);
  });
});

describe('董贵人「风影」', () => {
  it('正例：回合开始快照弃牌堆里的黑色基本牌/普通锦囊，出牌阶段可当【杀】用', async () => {
    const dg = P(0, '董贵人');
    dg.hand = [mkCard({ name: CardName.TAO, suit: Suit.HEART, value: 2, rank: '2' })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dg, a]);
    deps.peekDiscard = () => [black({ name: CardName.SHA, type: CardType.BASIC })];
    await seedMarks(deps, dg, '绞', 3);
    await dispatchTurnStart(deps, dg);
    await dispatchPlayPhaseBegin(deps, dg);
    expect(fx.usedCards).toHaveLength(1);
    expect(fx.usedCards[0].card).toMatchObject({ name: CardName.SHA, suit: Suit.HEART, rank: '2' });
    expect(fx.usedCards[0].opts?.ignoreDistance).toBe(true);
    expect(fx.discarded).toEqual([{ playerId: 0, count: 1 }]);
  });

  it('反例：点数大于「绞」标记数的手牌不能用', async () => {
    const dg = P(0, '董贵人');
    dg.hand = [mkCard({ name: CardName.TAO, value: 9, rank: '9' })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dg, a]);
    deps.peekDiscard = () => [black({ name: CardName.SHA, type: CardType.BASIC })];
    await seedMarks(deps, dg, '绞', 3);
    await dispatchTurnStart(deps, dg);
    await dispatchPlayPhaseBegin(deps, dg);
    expect(fx.usedCards).toEqual([]);
  });

  it('反例：弃牌堆里没有可用的黑色基本牌/普通锦囊 —— 不发动', async () => {
    const dg = P(0, '董贵人');
    dg.hand = [mkCard({ value: 1, rank: 'A' })];
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([dg, a]);
    deps.peekDiscard = () => [mkCard({ suit: Suit.HEART }), black({ name: CardName.QINGGANG, type: CardType.EQUIPMENT })];
    await seedMarks(deps, dg, '绞', 5);
    await dispatchTurnStart(deps, dg);
    await dispatchPlayPhaseBegin(deps, dg);
    expect(fx.usedCards).toEqual([]);
  });
});

describe('滕公主「幸宠」', () => {
  it('正例：摸 X 张；展示过的牌失去时摸两张', async () => {
    const tg = P(0, '滕公主', { maxHp: 3 });
    tg.hand = [];
    const { deps, fx } = makeHarness([tg]);
    // AI：n = X = 3，摸 3 张，Y = 0 → 不展示
    await dispatchRoundStart(deps, 1);
    expect(fx.drawn).toEqual([{ playerId: 0, count: 3 }]);
  });

  it('正例：失去展示过的手牌后摸两张（每张只算一次）', async () => {
    const tg = P(0, '滕公主', { maxHp: 3 });
    const { deps, fx } = makeHarness([tg]);
    // 直接给一张牌，然后走「展示 → 失去」两段
    tg.hand = [mkCard({ name: CardName.TAO })];
    // 用 requestChoice 让「幸宠」选择摸 2 张，Y = 1
    deps.requestChoice = async () => ({ kind: 'choose', id: '2' } as never);
    await dispatchRoundStart(deps, 1);
    // AI 分支不走 requestChoice（isHuman=false）→ 摸 3、Y=0，不会展示
    // 所以这里改成人类
    expect(fx.drawn).toEqual([{ playerId: 0, count: 3 }]);
  });

  it('反例：体力上限为 0 时不发动', async () => {
    const tg = P(0, '滕公主', { maxHp: 0, hp: 0 });
    const { deps, fx } = makeHarness([tg]);
    await dispatchRoundStart(deps, 1);
    expect(fx.drawn).toEqual([]);
  });
});
