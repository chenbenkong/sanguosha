import { describe, expect, it } from 'vitest';
import { officialSkillQuotes } from './skillQuotes.ts';
import { getHeroDetail } from './heroDetail.ts';
import SKILL_VOICE_LINES from '../audio/skillVoiceLines.json' with { type: 'json' };
import { HEROES } from '../../constants';
import type { Hero } from '../../types';

/**
 * 官方技能台词原文的契约。
 *
 * 为什么值得单独立一组断言：这份表原本只喂音频（按「序号」拼文件名），
 * 现在多了一个纯文本消费方（详情页台词卡）。键名是中文武将名 + 中文技能名，
 * 任何一层拼错都不会抛异常——详情页只会静默少一段台词，正是最难发现的一类回归。
 * 所以下面守的三件事：表结构没漂移、两级查询真的按武将区分、手写表不再压过官方原文。
 */
const TABLE = SKILL_VOICE_LINES as Record<string, Record<string, string[]>>;
const ENTRIES = Object.entries(TABLE).flatMap(([hero, skills]) =>
  Object.entries(skills).map(([skill, lines]) => ({ hero, skill, lines })));

/** 取详情只看武将数据，其余字段与结果无关，用真实武将顶上（技能名来自 constants.ts） */
const heroOf = (name: string): Hero => HEROES.find((h) => h.name === name) as Hero;

describe('官方技能台词原文', () => {
  it('数据规模合理（武将 > 90、技能 > 150）', () => {
    expect(Object.keys(TABLE).length).toBeGreaterThan(90);
    expect(ENTRIES.length).toBeGreaterThan(150);
  });

  it('表里每个技能名都能查到至少 1 句（防表结构漂移）', () => {
    const bad = ENTRIES.filter((e) => officialSkillQuotes(e.hero, e.skill).length === 0);
    expect(bad.map((e) => e.hero + '/' + e.skill)).toEqual([]);
  });

  it('已知样例：曹操「奸雄」返回官方原文（不是当初手写的那句）', () => {
    const quotes = officialSkillQuotes('曹操', '奸雄');
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes).toEqual(TABLE['曹操']['奸雄']);
    // 官方库里的「奸雄」是「挟天子以令不臣。」这类台词，
    // 与 SKILL_META 手写的「宁教我负天下人…」并不是同一句（手写是早期的近似）。
    expect(quotes.join('')).not.toBe('宁教我负天下人，休教天下人负我！');
  });

  it('同一个技能名在不同武将手里取到不同台词（所以只能两级查）', () => {
    const wangYue = officialSkillQuotes('王悦', '护关');
    const wangTao = officialSkillQuotes('王桃', '护关');
    expect(wangYue.length).toBeGreaterThan(0);
    expect(wangTao.length).toBeGreaterThan(0);
    expect(wangYue).not.toEqual(wangTao);
  });

  it('未知武将 / 未知技能返回空数组而不是 undefined', () => {
    for (const [hero, skill] of [['查无此人', '奸雄'], ['曹操', '查无此技'], ['', '']] as const) {
      const got = officialSkillQuotes(hero, skill);
      expect(Array.isArray(got), hero + '/' + skill).toBe(true);
      expect(got, hero + '/' + skill).toEqual([]);
    }
  });

  it('getHeroDetail：官方原文压过手写，官方没收录时才回落到手写', () => {
    // 奸雄：手写表里也有这一条，但页面必须显示官方原文
    const jianxiong = getHeroDetail(heroOf('曹操')).skills.find((s) => s.name === '奸雄')!;
    expect(jianxiong.quotes).toEqual(TABLE['曹操']['奸雄']);
    expect(jianxiong.quotes).not.toContain('宁教我负天下人，休教天下人负我！');
    // 淑慎：手写表里没有，由官方原文补上
    const shushen = getHeroDetail(heroOf('甘夫人')).skills.find((s) => s.name === '淑慎')!;
    expect(shushen.quotes.length).toBeGreaterThan(0);
  });

  it('两头都没有的技能给空数组，UI 整块不渲染（不塌陷成空台词区）', () => {
    // 蔡贞姬不在官方表里（表里没有这名武将，也没有「舍裔」「天音」），手写表同样没有
    expect(officialSkillQuotes('蔡贞姬', '舍裔')).toEqual([]);
    const sheyi = getHeroDetail(heroOf('蔡贞姬')).skills.find((s) => s.name === '舍裔')!;
    expect(sheyi.quotes).toEqual([]);
  });
});
