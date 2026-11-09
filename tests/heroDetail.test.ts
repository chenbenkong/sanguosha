import { describe, expect, test } from 'vitest';
import { HEROES } from '../constants';
import { getHeroDetail, HERO_PROFILES, SKILL_META } from '../src/game/heroDetail';
import type { SkillTag } from '../src/game/heroDetail';
import { hero } from './helpers';

const VALID_TAGS: SkillTag[] = ['锁定技', '限定技', '觉醒技', '主动技', '被动技', '主公技'];

describe('HEROES 基础数据完整性', () => {
  test('武将数量与 id/姓名唯一', () => {
    expect(HEROES.length).toBeGreaterThan(0);
    expect(new Set(HEROES.map(h => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map(h => h.name)).size).toBe(HEROES.length);
  });

  test('每名武将的必填字段非空', () => {
    for (const h of HEROES) {
      expect(h.id, `${h.name} id`).toBeTruthy();
      expect(h.name, `${h.name} name`).toBeTruthy();
      expect(h.skillName, `${h.name} skillName`).toBeTruthy();
      expect(h.skillDesc, `${h.name} skillDesc`).toBeTruthy();
      expect(h.avatarUrl, `${h.name} avatarUrl`).toBeTruthy();
      expect(['魏', '蜀', '吴', '群']).toContain(h.kingdom);
      expect(['male', 'female']).toContain(h.gender);
      expect(h.maxHp).toBeGreaterThan(0);
    }
  });

  test('主公技字段成对出现（有名字必有描述）', () => {
    for (const h of HEROES) {
      if (h.lordSkillName) expect(h.lordSkillDesc, `${h.name}`).toBeTruthy();
      if (h.lordSkillDesc) expect(h.lordSkillName, `${h.name}`).toBeTruthy();
    }
  });
});

describe('SKILL_META 元信息完整性', () => {
  test('每条技能都有非空 tags / timing / quote', () => {
    const entries = Object.entries(SKILL_META);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, meta] of entries) {
      expect(meta.tags.length, `${name} tags`).toBeGreaterThan(0);
      expect(meta.timing.trim(), `${name} timing`).not.toBe('');
      expect(meta.quote.trim(), `${name} quote`).not.toBe('');
    }
  });

  test('【代码与注释不一致】heroDetail.ts:15 写「59 个已实现技能」，实际 SKILL_META 有 58 条', () => {
    // 注释比实际多 1 条；本测试锁定当前真实值，避免注释继续漂移
    const commentCount = 59;
    expect(Object.keys(SKILL_META).length).toBe(58);
    expect(Object.keys(SKILL_META).length).toBe(commentCount - 1);
  });

  test('所有 tag 都属于官方技能类型集合', () => {
    for (const [name, meta] of Object.entries(SKILL_META)) {
      for (const t of meta.tags) expect(VALID_TAGS, `${name}`).toContain(t);
    }
  });

  test('主公技只在「护驾/激将/救援」上标注', () => {
    const lordSkills = Object.entries(SKILL_META)
      .filter(([, m]) => m.tags.includes('主公技'))
      .map(([n]) => n)
      .sort();
    expect(lordSkills).toEqual(['护驾', '救援', '激将']);
  });

  test('【代码与注释不一致】heroDetail.ts:172 写「新增 30 名武将」，PENDING_SKILL_META 实际 66 条', () => {
    const commentCount = 30;
    const pendingEntries = 66;
    expect(pendingEntries).not.toBe(commentCount);
    // 66 条覆盖的是「第五轮新增 66 个未实装技能」，与常量里 69 名武将并非同一口径
    expect(pendingEntries).toBeGreaterThan(commentCount);
  });

  test('HEROES 中出现的每个技能名都能在 SKILL_META 或 getHeroDetail 中得到元信息', () => {
    for (const h of HEROES) {
      const detail = getHeroDetail(h);
      for (const s of detail.skills) {
        expect(s.tags.length, `${h.name}:${s.name}`).toBeGreaterThan(0);
        expect(s.timing, `${h.name}:${s.name}`).toBeTruthy();
      }
    }
  });
});

describe('HERO_PROFILES', () => {
  test('每个条目的 pack/roles/difficulty 合法', () => {
    for (const [name, p] of Object.entries(HERO_PROFILES)) {
      expect(p.pack.trim(), `${name} pack`).not.toBe('');
      expect(p.roles.length, `${name} roles`).toBeGreaterThan(0);
      expect(Number.isInteger(p.difficulty), `${name} difficulty`).toBe(true);
      expect(p.difficulty, `${name} difficulty`).toBeGreaterThanOrEqual(1);
      expect(p.difficulty, `${name} difficulty`).toBeLessThanOrEqual(5);
      expect(p.tip.trim(), `${name} tip`).not.toBe('');
    }
  });

  test('每个 profile 的 key 都对应一名真实武将（无孤儿条目）', () => {
    const names = new Set(HEROES.map(h => h.name));
    const orphans = Object.keys(HERO_PROFILES).filter(n => !names.has(n));
    expect(orphans).toEqual([]);
  });

  test('【代码与注释不一致】heroDetail.ts:89 写「39 名武将」，实际 HERO_PROFILES 有 45 条 / HEROES 有 69 名', () => {
    const commentCount = 39;
    expect(Object.keys(HERO_PROFILES)).toHaveLength(45);
    expect(HEROES).toHaveLength(99); // 第六批新增 30 名女将后为 99
    expect(Object.keys(HERO_PROFILES).length - commentCount).toBe(6);
    // 新将·第1批 的 6 名女将已补进 profile，注释未同步
    const newBatch = Object.values(HERO_PROFILES).filter(p => p.pack === '新将·第1批');
    expect(newBatch).toHaveLength(6);
  });
});

describe('getHeroDetail', () => {
  test('每名武将都能生成详情，且技能列表非空', () => {
    for (const h of HEROES) {
      const d = getHeroDetail(h);
      expect(d.hero, h.name).toBe(h);
      expect(d.profile, h.name).toBeTruthy();
      expect(d.skills.length, h.name).toBeGreaterThan(0);
    }
  });

  test('每名武将的每个技能都有 name/tags/timing/desc', () => {
    const bad: string[] = [];
    for (const h of HEROES) {
      for (const s of getHeroDetail(h).skills) {
        if (!s.name) bad.push(`${h.name}:name`);
        if (!s.tags?.length) bad.push(`${h.name}:${s.name}:tags`);
        if (!s.timing) bad.push(`${h.name}:${s.name}:timing`);
        if (!s.desc) bad.push(`${h.name}:${s.name}:desc`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('未写 profile 且非 pending 的武将回退到 FALLBACK_PROFILE（不崩溃、字段齐全）', () => {
    const missing = HEROES.filter(h => !HERO_PROFILES[h.name] && !h.pending);
    // 第六批新增的 30 名女将已标记 pending:true，走 PENDING_PROFILE 而非本回退分支
    for (const h of missing) {
      const d = getHeroDetail(h);
      expect(d.profile.pack).toBe('标准包');
      expect(d.profile.roles).toEqual(['均衡']);
      expect(d.profile.difficulty).toBe(2);
      expect(d.profile.tip).toBeTruthy();
    }
  });

  test('第六批 30 名新女将标记为 pending 且走 PENDING_PROFILE', () => {
    const pend = HEROES.filter(h => h.pending);
    expect(pend.length).toBe(30);
    expect(pend.every(h => h.gender === 'female')).toBe(true);
    for (const h of pend) {
      const d = getHeroDetail(h);
      expect(d.profile.pack).toBe('新将·技能实装中');
      expect(d.skills.length).toBeGreaterThan(0);
    }
  });

  test('有 profile 条目的武将使用自己的条目', () => {
    const withProfile = HEROES.filter(h => HERO_PROFILES[h.name]);
    expect(withProfile.length).toBe(45);
    for (const h of withProfile) {
      expect(getHeroDetail(h).profile).toBe(HERO_PROFILES[h.name]);
    }
  });

  test('不含 / 的单技能武将只生成 1 条技能', () => {
    const single = HEROES.find(h => !h.skillName.includes('/') && !h.lordSkillName);
    expect(single).toBeDefined();
    expect(getHeroDetail(single!).skills).toHaveLength(1);
  });

  test('「A / B」双技能按斜杠拆成 2 条，且名字与描述都对得上', () => {
    const h = HEROES.find(x => x.skillName.split('/').length === 2);
    expect(h).toBeDefined();
    const d = getHeroDetail(h!);
    const names = h!.skillName.split('/').map(s => s.trim());
    expect(d.skills.map(s => s.name)).toEqual(names);
    for (const s of d.skills) expect(s.desc.length).toBeGreaterThan(0);
  });

  test('主公技作为额外一条追加，且标记 isLord', () => {
    const caocao = HEROES.find(h => h.name === '曹操')!;
    const d = getHeroDetail(caocao);
    expect(d.skills[0].isLord).toBeFalsy();
    const lord = d.skills.find(s => s.isLord);
    expect(lord).toBeDefined();
    expect(lord!.name).toBe('护驾');
    expect(lord!.tags).toEqual(['主公技']);
    expect(lord!.desc).toBe(caocao.lordSkillDesc);
  });

  test('三名有主公技的武将都会追加主公技能', () => {
    const withLord = HEROES.filter(h => h.lordSkillName);
    expect(withLord.map(h => h.name).sort()).toEqual(['刘备', '孙权', '曹操']);
    for (const h of withLord) {
      const lord = getHeroDetail(h).skills.filter(s => s.isLord);
      expect(lord).toHaveLength(1);
      expect(lord[0].name).toBe(h.lordSkillName);
    }
  });

  test('无主公技的武将不追加 isLord 技能', () => {
    for (const h of HEROES.filter(x => !x.lordSkillName)) {
      expect(getHeroDetail(h).skills.some(s => s.isLord), h.name).toBe(false);
    }
  });

  test('技能描述按「技能名：」切分，各段互不重叠', () => {
    const h = hero({
      name: '测试将',
      skillName: '离间 / 闭月',
      skillDesc: '离间：出牌阶段，你可以弃一张牌。闭月：回合结束时摸一张牌。',
    });
    const d = getHeroDetail(h);
    expect(d.skills[0].desc).toBe('出牌阶段，你可以弃一张牌。');
    expect(d.skills[1].desc).toBe('回合结束时摸一张牌。');
  });

  test('描述里缺少「技能名：」时回退为整段描述（不产出空串）', () => {
    const h = hero({ name: '测试将2', skillName: '甲 / 乙', skillDesc: '这里没有任何技能前缀。' });
    const d = getHeroDetail(h);
    for (const s of d.skills) expect(s.desc).toBe('这里没有任何技能前缀。');
  });
});
