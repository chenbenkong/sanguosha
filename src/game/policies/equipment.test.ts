import { describe, expect, it } from 'vitest';
import { CardName, Suit } from '../../../types';
import { allEquipBlack, allEquipRed, equipList, hasWeimu } from './equipment';
import { mkEquip, mkHero, mkPlayer } from '../ai/testFixtures';

describe('equipList：装备区四槽位摊平', () => {
  it('无 equipment 字段 → 空数组', () => {
    expect(equipList(mkPlayer({ id: 0 }))).toEqual([]);
  });

  it('空装备区 → 空数组', () => {
    expect(equipList(mkPlayer({ id: 0, equipment: {} }))).toEqual([]);
  });

  it('按 武器/防具/+1马/-1马 顺序返回，跳空槽', () => {
    const weapon = mkEquip(Suit.SPADE, CardName.QINGGANG, 'w');
    const horsePlus = mkEquip(Suit.HEART, CardName.CHITU, 'hp');
    const list = equipList(mkPlayer({ id: 0, equipment: { weapon, horsePlus } }));
    expect(list.map(c => c.id)).toEqual(['w', 'hp']);
  });

  it('四个槽位都有牌时全部返回', () => {
    const list = equipList(mkPlayer({
      id: 0,
      equipment: {
        weapon: mkEquip(Suit.SPADE, CardName.QINGGANG, 'w'),
        armor: mkEquip(Suit.CLUB, CardName.BAGUA, 'a'),
        horsePlus: mkEquip(Suit.HEART, CardName.CHITU, 'hp'),
        horseMinus: mkEquip(Suit.DIAMOND, CardName.DAWAN, 'hm'),
      },
    }));
    expect(list).toHaveLength(4);
  });
});

describe('allEquipBlack / allEquipRed：谦冲派生条件', () => {
  it('空装备区两个判定都为 false（空真陷阱）', () => {
    const p = mkPlayer({ id: 0, equipment: {} });
    expect(allEquipBlack(p)).toBe(false);
    expect(allEquipRed(p)).toBe(false);
  });

  it('全黑（黑桃+梅花）→ allEquipBlack 为真、allEquipRed 为假', () => {
    const p = mkPlayer({
      id: 0,
      equipment: { weapon: mkEquip(Suit.SPADE, CardName.QINGGANG, 'w'), armor: mkEquip(Suit.CLUB, CardName.BAGUA, 'a') },
    });
    expect(allEquipBlack(p)).toBe(true);
    expect(allEquipRed(p)).toBe(false);
  });

  it('全红（红桃+方块）→ allEquipRed 为真、allEquipBlack 为假', () => {
    const p = mkPlayer({
      id: 0,
      equipment: { weapon: mkEquip(Suit.HEART, CardName.QINGGANG, 'w'), armor: mkEquip(Suit.DIAMOND, CardName.BAGUA, 'a') },
    });
    expect(allEquipRed(p)).toBe(true);
    expect(allEquipBlack(p)).toBe(false);
  });

  it('黑白混色 → 两个判定都为假', () => {
    const p = mkPlayer({
      id: 0,
      equipment: { weapon: mkEquip(Suit.SPADE, CardName.QINGGANG, 'w'), armor: mkEquip(Suit.HEART, CardName.BAGUA, 'a') },
    });
    expect(allEquipBlack(p)).toBe(false);
    expect(allEquipRed(p)).toBe(false);
  });

  it('单张黑牌也算全黑（长度 > 0 即可）', () => {
    const p = mkPlayer({ id: 0, equipment: { horseMinus: mkEquip(Suit.CLUB, CardName.DILU, 'h') } });
    expect(allEquipBlack(p)).toBe(true);
  });
});

describe('hasWeimu：帷幕生效条件', () => {
  const blackEquip = { weapon: mkEquip(Suit.SPADE, CardName.QINGGANG, 'w') };

  it('王元姬 + 技能生效 + 全黑 → 帷幕生效', () => {
    const p = mkPlayer({ id: 0, hero: mkHero('王元姬'), equipment: blackEquip });
    expect(hasWeimu(p, true)).toBe(true);
  });

  it('技能被封印/武将移除（skillsEnabled=false）→ 不生效', () => {
    const p = mkPlayer({ id: 0, hero: mkHero('王元姬'), equipment: blackEquip });
    expect(hasWeimu(p, false)).toBe(false);
  });

  it('非王元姬即使全黑也不生效', () => {
    const p = mkPlayer({ id: 0, hero: mkHero('孙权'), equipment: blackEquip });
    expect(hasWeimu(p, true)).toBe(false);
  });

  it('王元姬但装备区非全黑 → 不生效', () => {
    const p = mkPlayer({
      id: 0,
      hero: mkHero('王元姬'),
      equipment: { weapon: mkEquip(Suit.SPADE, CardName.QINGGANG, 'w'), armor: mkEquip(Suit.HEART, CardName.BAGUA, 'a') },
    });
    expect(hasWeimu(p, true)).toBe(false);
  });

  it('王元姬但空装备区 → 不生效', () => {
    const p = mkPlayer({ id: 0, hero: mkHero('王元姬'), equipment: {} });
    expect(hasWeimu(p, true)).toBe(false);
  });
});
