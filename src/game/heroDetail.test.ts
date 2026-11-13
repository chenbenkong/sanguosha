import { describe, expect, it } from 'vitest';
import { getHeroDetail } from './heroDetail';
import type { SkillTag } from './heroDetail';
import { HEROES } from '../../constants';
import type { Hero } from '../../types';

/**
 * 详情面板的技能标签。
 *
 * 存在的理由：手写元信息表没收录的技能原本一律显示「主动技」，而锁定技被说成
 * 主动技是**事实错误**——玩家会以为可以选择不发动。实测 7 个缺元信息的技能里
 * 有 1 个（诸葛果「羽化」）描述明确写着锁定技，就是从这条契约漏出去的。
 */
const heroNamed = (name: string): Hero => {
  const h = HEROES.find(x => x.name === name);
  if (!h) throw new Error('测试用武将不存在: ' + name);
  return h;
};

describe('技能标签', () => {
  it('描述里声明了类型的技能，标签要跟着描述走（诸葛果「羽化」是锁定技）', () => {
    const { skills } = getHeroDetail(heroNamed('诸葛果'));
    const yuhua = skills.find(s => s.name === '羽化');
    expect(yuhua).toBeTruthy();
    // 该武将的描述原文就是「羽化：锁定技，非基本牌不计入手牌上限…」
    expect(yuhua!.tags).toContain('锁定技');
    expect(yuhua!.tags).not.toContain('主动技');
  });

  it('描述没声明类型的技能仍回落「主动技」，不会凭空多出标签', () => {
    const { skills } = getHeroDetail(heroNamed('关银屏'));
    const xueji = skills.find(s => s.name === '血祭');
    expect(xueji).toBeTruthy();
    expect(xueji!.tags).toEqual(['主动技']);
  });

  it('手写元信息优先于描述推导（人工校正过的不能被覆盖）', () => {
    // 曹操「奸雄」在手写表里是「被动技」，描述「奸雄：受到伤害后…」不含类型词
    const { skills } = getHeroDetail(heroNamed('曹操'));
    const jianxiong = skills.find(s => s.name === '奸雄');
    expect(jianxiong!.tags).toEqual(['被动技']);
  });

  it('全武将扫一遍：凡描述以类型词开头的技能，标签必须包含该类型', () => {
    const kinds: SkillTag[] = ['主公技', '锁定技', '限定技', '觉醒技'];
    const bad: string[] = [];
    for (const hero of HEROES) {
      const { skills } = getHeroDetail(hero);
      for (const s of skills) {
        const head = (s.desc || '').trimStart().slice(0, 8);
        const declared = kinds.find(k => head.startsWith(k));
        if (declared && !s.tags.includes(declared)) {
          bad.push(hero.name + '/' + s.name + ' 描述称' + declared + ' 标签为' + s.tags.join(','));
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('每个技能至少有 1 个标签，不会渲染出空标签行', () => {
    const bad: string[] = [];
    for (const hero of HEROES) {
      for (const s of getHeroDetail(hero).skills) {
        if (!s.tags || s.tags.length === 0) bad.push(hero.name + '/' + s.name);
      }
    }
    expect(bad).toEqual([]);
  });
});
