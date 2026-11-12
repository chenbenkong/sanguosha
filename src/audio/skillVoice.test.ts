import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import LINES from './skillVoiceLines.json' with { type: 'json' };

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
    const onDisk: string[] = [];
    for (const hero of readdirSync(AUDIO_DIR)) {
      for (const f of readdirSync(join(AUDIO_DIR, hero))) onDisk.push(join(hero, f));
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
