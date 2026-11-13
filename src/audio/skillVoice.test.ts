import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import LINES from './skillVoiceLines.json' with { type: 'json' };
import { hasOfficialSkillVoice, skillVoiceLines } from './voice';

/**
 * 官方原声技能台词的契约。
 *
 * 与阵亡语音同一套思路：`playOfficialSkillVoice` 按武将名与技能名直接拼路径，
 * 而本项目是单页应用——缺文件时 vite preview 与 GitHub Pages 会回退到
 * index.html 并返回 **200 + text/html**，`<audio>` 静默播放失败
 * （error.code=4），页面不报错、只是没声音。这是最难发现的一类回归，
 * 所以下面每一条都在守「表、文件、命名」三者不会各自漂移。
 *
 * 3D 那批测试的教训同样适用：不要在浏览器里断言依赖环境的东西。
 * 这些是纯文件系统契约，确定性地跑在任何机器上。
 */
const AUDIO_DIR = join(process.cwd(), 'public', 'audio', 'skill-voice');
const TABLE = LINES as Record<string, Record<string, string[]>>;

const pairs: Array<[string, string, string[]]> = [];
for (const [hero, skills] of Object.entries(TABLE)) {
  for (const [skill, lines] of Object.entries(skills)) pairs.push([hero, skill, lines]);
}
/** 表格登记的全部音频相对路径 */
const expected = pairs.flatMap(([hero, skill, lines]) =>
  lines.map((_t, i) => ({ path: join(hero, `${skill}${i + 1}.mp3`), hero, skill })));

const isMp3 = (buf: Buffer): boolean => {
  if (buf.length < 1024) return false;
  if (buf.subarray(0, 3).toString() === 'ID3') return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
};

describe('官方原声技能台词', () => {
  it('台词表规模合理（防生成脚本静默产出空表）', () => {
    expect(Object.keys(TABLE).length).toBeGreaterThan(90);
    expect(pairs.length).toBeGreaterThan(150);
  });

  it('表里每一条都有对应文件（防静默 404）', () => {
    const missing = expected.filter((e) => !existsSync(join(AUDIO_DIR, e.path)));
    expect(missing.map((m) => m.path)).toEqual([]);
  });

  it('目录里没有表外的孤儿文件（防改名后残留）', () => {
    // withFileTypes：同层还放着「素材说明.md」，直接 readdirSync 再当目录遍历
    // 会 ENOTDIR 炸掉（这个错当时真的发生了，孤儿检查先于文档存在）。
    // 只把武将目录下的 .mp3 纳入比对口径。
    const onDisk: string[] = [];
    for (const entry of readdirSync(AUDIO_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const f of readdirSync(join(AUDIO_DIR, entry.name))) {
        if (f.endsWith('.mp3')) onDisk.push(join(entry.name, f));
      }
    }
    const table = new Set(expected.map((e) => e.path));
    expect(onDisk.filter((f) => !table.has(f))).toEqual([]);
  });

  it('每个文件都是真 MP3，不是 SPA 回退的 HTML', () => {
    const bad: string[] = [];
    for (const e of expected) {
      const buf = readFileSync(join(AUDIO_DIR, e.path));
      const html = buf.subarray(0, 15).toString('utf8').toLowerCase().includes('<!doctype');
      if (html || !isMp3(buf)) bad.push(e.path);
    }
    expect(bad).toEqual([]);
  });

  it('每条技能至少一句非空台词', () => {
    const bad: string[] = [];
    for (const [hero, skill, lines] of pairs) {
      if (lines.length === 0 || lines.some((t) => typeof t !== 'string' || t.trim().length < 2)) {
        bad.push(hero + '/' + skill);
      }
    }
    expect(bad).toEqual([]);
  });

  it('技能名里不含路径分隔符（否则拼出的音频路径会跑出武将目录）', () => {
    const bad = pairs.filter(([, skill]) => skill.includes('/') || skill.includes('\\'));
    expect(bad.map(([h, s]) => h + '/' + s)).toEqual([]);
  });
});

describe('试听按钮的可见性契约', () => {
  /*
   * 详情页的「试听」按钮只在确有官方原声时渲染，靠 hasOfficialSkillVoice 判定。
   * 它一旦与数据脱钩就会出现两种坏结果：要么按钮点了没声音（hasOfficialSkillVoice
   * 说 true 但文件不在），要么该有的武将看不到按钮（说 false 而文件明明在）。
   */
  it('有官方原声的武将会被判为可试听', () => {
    expect(hasOfficialSkillVoice('曹操', '奸雄')).toBe(true);
  });

  it('图鉴没有的武将（蔡贞姬）与不存在的技能一律为 false，不产生死按钮', () => {
    expect(hasOfficialSkillVoice('蔡贞姬', '舍裔')).toBe(false);
    expect(hasOfficialSkillVoice('曹操', '这个技能不存在')).toBe(false);
    expect(hasOfficialSkillVoice('查无此人', '奸雄')).toBe(false);
  });

  it('可试听的技能一定有非空台词可显示', () => {
    expect(skillVoiceLines('曹操', '奸雄').length).toBeGreaterThan(0);
    expect(skillVoiceLines('蔡贞姬', '舍裔')).toEqual([]);
  });

  it('data-has-voice 的口径与按钮一致：为 true 的每一条都能查到台词', () => {
    // 反向校验：遍历数据里所有武将，凡 hasOfficialSkillVoice 为真者，
    // skillVoiceLines 必须非空——两者读同一份表，不该出现分歧
    const bad: string[] = [];
    for (const hero of Object.keys(TABLE)) {
      for (const skill of Object.keys(TABLE[hero])) {
        if (hasOfficialSkillVoice(hero, skill) && skillVoiceLines(hero, skill).length === 0) {
          bad.push(hero + '/' + skill);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
