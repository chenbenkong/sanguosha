import { beforeEach, describe, expect, it } from 'vitest';
import { __clearSkillMemory, dispatchDeath } from './dispatch';
import { __clearGrantedSkills, makeHarness, mkCard, mkPlayer } from './testHarness';
import { CardName, CardType, Suit } from '../../../types';
import type { Card } from '../../../types';
import { readFileSync } from 'node:fs';
import './batch6new27';

/**
 * batch6new27 的行为测试：追姬。
 *
 * 重点是「废除装备栏」这条闭环：装进去 → 失去 → 该栏不能再放。
 * 装备栏废除的读取侧不改动任何 equipment?.xxx 判断（废除的栏本来就是空的），
 * 所以这里断言的是「再放不进去」和「栏位仍为空」两件事。
 */

beforeEach(() => { __clearSkillMemory(); __clearGrantedSkills(); });

const P = (id: number, name: string, o = {}) => mkPlayer({ id, name, ...o });
const equip = (name: CardName, o: Partial<Card> = {}) =>
  mkCard({ name, type: CardType.EQUIPMENT, suit: Suit.SPADE, ...o });

const installPiles = (
  deps: ReturnType<typeof makeHarness>['deps'],
  deck: Card[],
  discard: Card[],
) => {
  deps.peekDeck = (n) => deck.slice(-n);
  deps.peekDiscard = () => [...discard];
  deps.takeFromDeck = (pred, count) => {
    const out: Card[] = [];
    for (let i = deck.length - 1; i >= 0 && out.length < count; i--) {
      if (pred(deck[i])) out.push(deck.splice(i, 1)[0]);
    }
    return out;
  };
  deps.takeFromDiscard = (pred, count) => {
    const out: Card[] = [];
    for (let i = discard.length - 1; i >= 0 && out.length < count; i--) {
      if (pred(discard[i])) out.push(discard.splice(i, 1)[0]);
    }
    return out;
  };
};

describe('宣公主「追姬」', () => {
  it('正例：死亡时把四个栏位都装上（牌堆+弃牌堆混合取牌）', async () => {
    const xuan = P(0, '宣公主');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([xuan, a]);
    installPiles(deps,
      [equip(CardName.QINGGANG), equip(CardName.RENWANG)],
      [equip(CardName.CHITU), equip(CardName.DILU)]);
    xuan.isDead = true;
    await dispatchDeath(deps, { dead: xuan, killer: a });
    expect(fx.equipped).toHaveLength(4);
    expect(a.equipment?.weapon?.name).toBe(CardName.QINGGANG);
    expect(a.equipment?.armor?.name).toBe(CardName.RENWANG);
    expect(a.equipment?.horseMinus?.name).toBe(CardName.CHITU);
    expect(a.equipment?.horsePlus?.name).toBe(CardName.DILU);
  });

  it('正例：已装备的类别跳过（只补空栏）', async () => {
    const xuan = P(0, '宣公主');
    const a = P(1, '甲');
    a.equipment = { weapon: equip(CardName.ZHANGBA) };
    const { deps, fx } = makeHarness([xuan, a]);
    installPiles(deps, [equip(CardName.QINGGANG), equip(CardName.RENWANG)], []);
    xuan.isDead = true;
    await dispatchDeath(deps, { dead: xuan, killer: a });
    // 只有防具栏被补上，武器栏保持原样
    expect(fx.equipped).toHaveLength(1);
    expect(fx.equipped[0].card.name).toBe(CardName.RENWANG);
    expect(a.equipment?.weapon?.name).toBe(CardName.ZHANGBA);
  });

  it('正例：已废除的栏位放不进装备（equipCardToZone 拒绝）', () => {
    const a = P(1, '甲');
    a.sealedSlots = ['weapon'];
    const { deps } = makeHarness([a]);
    expect(deps.equipCardToZone(a.id, equip(CardName.QINGGANG))).toBe(false);
    expect(a.equipment?.weapon).toBeUndefined();
    // 没废除的栏位照常能放
    expect(deps.equipCardToZone(a.id, equip(CardName.RENWANG))).toBe(true);
  });

  it('正例：追姬装进去的牌会被登记进 zhuijiCardIds（失去时据此废除栏位）', async () => {
    const xuan = P(0, '宣公主');
    const a = P(1, '甲');
    const { deps } = makeHarness([xuan, a]);
    installPiles(deps, [equip(CardName.QINGGANG)], []);
    xuan.isDead = true;
    await dispatchDeath(deps, { dead: xuan, killer: a });
    const placed = a.equipment?.weapon!;
    expect(a.zhuijiCardIds).toContain(placed.id);
  });

  it('引擎侧：失去装备的上报口真的把栏位废除（源码级，同 healPath 的路数）', () => {
    // 废除栏位的逻辑挂在 App.tsx 的 triggerXiaoji（两个引擎唯一的「失去装备区的牌」
    // 上报口），跑不了组件级单测。这里钉源码结构：漏了 zhuijiCardIds 判定或漏了
    // sealedSlots 写入，都会让「废除装备栏」静默失效，而技能侧单测看不出来。
    const app = readFileSync('App.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(app).toContain('if (p?.zhuijiCardIds?.includes(card.id))');
    expect(app).toContain('p.sealedSlots = [...(p.sealedSlots ?? []), slot]');
    // equipCard（人类/AI 上装主路径）也要认废除栏，否则废除只是「追姬自己不放」而别人照放
    expect(app).toContain('if (player.sealedSlots?.includes(slot))');
  });

  it('反例：堆里没有装备牌 —— 如实报告无效果', async () => {
    const xuan = P(0, '宣公主');
    const a = P(1, '甲');
    const { deps, fx } = makeHarness([xuan, a]);
    installPiles(deps, [mkCard({ name: CardName.SHA, type: CardType.BASIC })], []);
    xuan.isDead = true;
    await dispatchDeath(deps, { dead: xuan, killer: a });
    expect(fx.equipped).toEqual([]);
    expect(fx.logs.some(l => l.includes('没有可使用的装备牌'))).toBe(true);
  });

  it('反例：不是宣公主自己死亡 —— 不发动', async () => {
    const xuan = P(0, '宣公主');
    const a = P(1, '甲');
    const b = P(2, '乙');
    const { deps, fx } = makeHarness([xuan, a, b]);
    installPiles(deps, [equip(CardName.QINGGANG)], []);
    a.isDead = true;
    await dispatchDeath(deps, { dead: a, killer: b });
    expect(fx.equipped).toEqual([]);
  });

  it('反例：没有存活的其他角色 —— 不发动', async () => {
    const xuan = P(0, '宣公主');
    const a = P(1, '甲');
    a.isDead = true;
    const { deps, fx } = makeHarness([xuan, a]);
    installPiles(deps, [equip(CardName.QINGGANG)], []);
    xuan.isDead = true;
    await dispatchDeath(deps, { dead: xuan, killer: a });
    expect(fx.banners).toEqual([]);
  });
});
