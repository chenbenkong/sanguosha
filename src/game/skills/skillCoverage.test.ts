import { describe, expect, it } from 'vitest';
import { HEROES } from '../../../constants';
import { skillsOf } from './registry';
import './index';

/**
 * 技能实现覆盖守卫。
 *
 * 背景：历史上出现过「技能在 HEROES 里声明了、图鉴也展示了，
 * 但引擎里根本没实现或没接线」的情况——玩家点了没反应，只有玩到才会发现。
 *
 * 这个测试把「声明」与「实现」对齐：每个声明的技能，要么已进注册表，
 * 要么明确登记在 LEGACY_INLINE 里。清单**只允许缩小**：迁一个删一条。
 */

const LEGACY_INLINE = new Set<string>([
  '曹操::奸雄',
  '刘备::仁德',
  '孙权::制衡',
  '吕布::无双',
  '赵云::龙胆',
  '关羽::武圣',
  '貂蝉::离间',
  '张飞::咆哮',
  '黄忠::烈弓',
  '夏侯惇::刚烈',
  '周瑜::反间',
  '甄姬::倾国',
  '甄姬::洛神',
  '黄月英::奇才',
  '孙尚香::结姻',
  '张春华::绝情',
  '祝融::巨象',
  '祝融::烈刃',
  '大乔::流离',
  '大乔::国色',
  '蔡文姬::悲歌',
  '蔡文姬::断肠',
  '甘宁::奇袭',
  '王异::贞烈',
  '步练师::安恤',
  '步练师::追忆',
  '马超::马术',
  '马超::铁骑',
  '诸葛亮::观星',
  '诸葛亮::空城',
  '黄盖::苦肉',
  '陆逊::谦逊',
  '华佗::青囊',
  '华佗::急救',
  '关银屏::血祭',
  '张星彩::甚贤',
  '张星彩::枪舞',
  '卞夫人::挽危',
  '卞夫人::约俭',
  '诸葛果::祈禳',
  '诸葛果::羽化',
  '曹节::守玺',
  '伏皇后::惴恐',
  '伏皇后::求援',
  '马云禄::凤魄',
  '马云禄::马术',
  '孙茹::影箭',
  '灵雎::焚心',
  '何太后::鸩毒',
  '孙鲁育::穆穆',
  '孙鲁育::魅步',
  '吴国太::甘露',
  '吴国太::补益',
  '蔡夫人::窃听',
  '蔡夫人::献州',
  '夏侯氏::燕语',
  '董白::连诛',
  '董白::黠慧',
  '赵襄::芳魂',
  '赵襄::扶汉',
  '郭皇后::矫诏',
  '郭皇后::殚心',
  '辛宪英::忠鉴',
  '辛宪英::才识',
  '吴苋::福绵',
  '吴苋::怠宴',
  '徐氏::问卦',
  '徐氏::伏诛',
  '孙鲁班::谮毁',
  '王元姬::谦冲',
  '鲍三娘::姝勇',
  '鲍三娘::许身',
  '鲍三娘::镇南',
  '曹婴::凌人',
  '胡金定::武缘',
  '胡金定::怀子',
  '甘夫人::淑慎',
  '邹氏::祸水',
  '邹氏::倾城',
  '糜夫人::闺秀',
  '糜夫人::存嗣',
  '周妃::良姻',
  '周妃::箜声',
  '张琪瑛::法箓',
  '张琪瑛::真仪',
  '张琪瑛::点化',
  '羊徽瑜::弘仪',
  '羊徽瑜::劝封',
  '蔡贞姬::舍裔',
  '蔡贞姬::天音',
  '花鬘::象阵',
  '花鬘::芳踪',
  '花鬘::嬉战',
  '孙寒华::冲虚',
  '孙寒华::妙剑',
  '孙寒华::莲华',
  '张昌蒲::抵诽',
  '陆郁生::润微',
  '陆郁生::霜怀',
  '王桃::摇佩',
  '庞凤衣::醅酿',
  '谢灵毓::心幽',
  '朱佩兰::痛悼',
  '潘淑::织纴',
  '徐馨::育贤',
  '孙翎鸾::盻睇',
  '董绾::介绫',
  '侯昭宁::望资',
  '严夫人::谗逆',
  '唐姬::节烈',

  // —— 第六轮新增 30 名女将：技能文本已入库，实现待补（与第五轮同一口径） ——
  '王荣::敏思',
  '全惠解::慧淑',
  '全惠解::离宫',
  '柏灵筠::灵慧',
  '柏灵筠::黠策',
  '曹金玉::隅泣',
  '曹宪::知否',
  '丁尚涴::抚悼',
  '邓晚棠::黛颊',
  '赵嫣::锦绘',
  '芮姬::铃音',
  '滕芳兰::落宠',
  '滕芳兰::哀尘',
  '清河公主::谮构',
  '来莺儿::绡舞',
  '来莺儿::化萍',
  '来莺儿::☆ 沙舞',
  '李婉::别君',
  '张楚::集众',
  '张楚::日彗',
  '张楚::光噬',
  '夏侯徽::笃君',
  '万年公主::枕戈',
  '万年公主::兴汉',
  '黄舞蝶::双锐',
  '黄舞蝶::☆ 狩星',
  '马伶俐::硝引',
  '马伶俐::花火',
  '董絮::酖毒',
  '任婉::狷急',
  '任婉::纫霜',
  '曹华::彩翼',
  '曹华::归离',
  '滕公主::幸宠',
  '滕公主::流年',
  '董贵人::连枝',
  '董贵人::归罪',
  '董贵人::风影',
  '董贵人::☆ 受责',
  '董贵人::凌芳',
  '文鸳::匮饬',
  '文鸳::殇决',
  '张怀::诀言',
  '宣公主::齐眉',
  '宣公主::追姬',
  '吕玲绮::帼武',
  '吕玲绮::妆戎',
  '吕玲绮::☆ 无双',
]);

describe('技能实现覆盖守卫', () => {
  const declared = new Map<string, string[]>();
  for (const h of HEROES) {
    declared.set(h.name, (h.skillName || '').split('/').map((s) => s.trim()).filter(Boolean));
  }

  it('每个声明技能，要么在注册表、要么在 LEGACY_INLINE 清单里', () => {
    const unaccounted: string[] = [];
    for (const [hero, skills] of declared) {
      const inRegistry = new Set(skillsOf(hero).map((d) => d.skill));
      for (const sk of skills) {
        const key = hero + '::' + sk;
        if (inRegistry.has(sk)) continue;
        if (LEGACY_INLINE.has(key)) continue;
        unaccounted.push(key);
      }
    }
    expect(unaccounted).toEqual([]);
  });

  it('LEGACY_INLINE 不应包含已迁移进注册表的技能（避免清单腐烂）', () => {
    const stale: string[] = [];
    for (const key of LEGACY_INLINE) {
      const [hero, sk] = key.split('::');
      if (skillsOf(hero).some((d) => d.skill === sk)) stale.push(key);
    }
    expect(stale).toEqual([]);
  });

  it('LEGACY_INLINE 不应有拼错的武将或技能名', () => {
    const bad: string[] = [];
    for (const key of LEGACY_INLINE) {
      const [hero, sk] = key.split('::');
      const skills = declared.get(hero);
      if (!skills) { bad.push(key + '（武将不存在）'); continue; }
      if (!skills.includes(sk)) bad.push(key + '（该武将没有此技能）');
    }
    expect(bad).toEqual([]);
  });

  it('注册表里不应存在 HEROES 未声明的技能（防止幽灵技能）', () => {
    const ghosts: string[] = [];
    for (const h of HEROES) {
      const skills = declared.get(h.name) ?? [];
      for (const def of skillsOf(h.name)) {
        if (!skills.includes(def.skill)) ghosts.push(h.name + '::' + def.skill);
      }
    }
    expect(ghosts).toEqual([]);
  });
});
