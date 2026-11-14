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

/**
 * 第六批 30 名女将（77 个技能）的触发时机。
 *
 * 描述里只有「怎么用」，没有「什么时候能用」——而详情页原先的兜底文案正是
 * 「按技能描述」，等于把这一格空着。锁死它，避免以后新增武将又悄悄退回兜底。
 */
describe('技能触发时机（第六批 30 名女将）', () => {
  /**
   * 第六批 30 名女将的**名单**，按名字取。
   *
   * 以前这里是 HEROES.filter(h => h.pending)，把「批次身份」和「pending 开关」
   * 混为一谈了：pending 的含义是「技能尚未实装、不可开局」，是会随实装进度消失的
   * 生命周期状态，不是这批人的标识。技能装完就该解除 pending，于是这个 filter
   * 从 30 人掉到 2 人，下面三条断言全部空转 —— 看着是绿，其实什么都没测。
   */
  const BATCH6_NAMES = [
    '王荣', '全惠解', '柏灵筠', '曹金玉', '曹宪', '丁尚涴', '魏娆', '邓晚棠', '赵嫣', '芮姬',
    '滕芳兰', '清河公主', '来莺儿', '李婉', '张楚', '夏侯徽', '万年公主', '黄舞蝶', '马伶俐', '陆文漪',
    '董絮', '任婉', '曹华', '滕公主', '董贵人', '文鸳', '张怀', '宣公主', '吕玲绮', '卢弈',
  ];
  const batchHeroes = () => BATCH6_NAMES.map(n => HEROES.find(h => h.name === n))
    .filter((h): h is NonNullable<typeof h> => !!h);

  it('这 30 名武将的每个技能都有具体时机，不是兜底文案', () => {
    // 名单必须真的取满 30 人：取少了这三条会一起空转（曾经的缺陷）
    expect(batchHeroes()).toHaveLength(30);
    const bad: string[] = [];
    for (const hero of batchHeroes()) {
      for (const s of getHeroDetail(hero).skills) {
        if (!s.timing || s.timing === '按技能描述') bad.push(hero.name + '/' + s.name);
      }
    }
    expect(bad).toEqual([]);
  });

  it('技能总数与表规模一致：30 名 × 技能数 = 77 条', () => {
    const heroes = batchHeroes();
    expect(heroes).toHaveLength(30);
    const total = heroes.reduce((n, h) => n + getHeroDetail(h).skills.length, 0);
    expect(total).toBe(77);
  });

  it('类型不能全是主动技：锁定/限定/觉醒技必须如实呈现', () => {
    const all = batchHeroes().flatMap(h => getHeroDetail(h).skills);
    const typed = all.filter(s => s.tags.some(t => t === '锁定技' || t === '限定技' || t === '觉醒技'));
    const kinds = new Set(typed.flatMap(s => s.tags));
    // 描述明确写了类型的 20 个技能，一个都不能漏
    expect(typed.length).toBeGreaterThanOrEqual(20);
    expect(kinds).toContain('锁定技');
    expect(kinds).toContain('限定技');
    expect(kinds).toContain('觉醒技');
    // 也不能一律都是主动技
    expect(all.every(s => s.tags.every(t => t === '主动技'))).toBe(false);
  });

  it('描述里写了类型词的技能，标签必须跟着描述走（不例外）', () => {
    const kinds: SkillTag[] = ['主公技', '锁定技', '限定技', '觉醒技'];
    const bad: string[] = [];
    for (const hero of batchHeroes()) {
      for (const s of getHeroDetail(hero).skills) {
        const head = (s.desc || '').trimStart().slice(0, 8);
        const declared = kinds.find(k => head.startsWith(k));
        if (declared && !s.tags.includes(declared)) bad.push(hero.name + '/' + s.name + ':' + s.tags.join(','));
      }
    }
    expect(bad).toEqual([]);
  });
});
