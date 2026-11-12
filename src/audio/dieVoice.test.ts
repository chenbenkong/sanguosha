import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import LINES from './dieVoiceLines.json' with { type: 'json' };

/**
 * 官方原声阵亡台词的契约。
 *
 * playOfficialDeathVoice 是按「武将中文名」直接拼路径的，所以三个前提必须
 * 同时成立，任何一个塌了都会变成静默 404（播放失败被 catch 吞掉，页面不报错，
 * 只是没声音——这是最难发现的一类回归）：
 *   1. 台词表里的每个键，public/audio/die-voice/<名>.mp3 真的存在
 *   2. 这些武将的名字都能在 HEROES 里找到（否则表里有、游戏里没有人用）
 *   3. 文件名与 images/heroes 的命名同源，没有拼写漂移
 */
const AUDIO_DIR = join(process.cwd(), 'public', 'audio', 'die-voice');
const names = Object.keys(LINES as Record<string, string>);

describe('官方原声阵亡台词', () => {
  it('台词表非空且规模合理', () => {
    expect(names.length).toBeGreaterThan(85);
  });

  it('每一条台词都有对应的音频文件（防静默 404）', () => {
    const missing = names.filter((n) => !existsSync(join(AUDIO_DIR, n + '.mp3')));
    expect(missing).toEqual([]);
  });

  it('目录里没有台词表之外的孤儿文件（防改名后残留）', () => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const files = readdirSync(AUDIO_DIR)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => f.slice(0, -4));
    const orphans = files.filter((f) => !names.includes(f));
    expect(orphans).toEqual([]);
  });

  it('每个音频都是合法的 MP3（ID3 或帧同步头）', () => {
    // 拿到的是 HTML 错误页时，前几字节不是 ID3 也不是 0xFF 帧同步
    const bad: string[] = [];
    for (const n of names) {
      const buf = readFileSync(join(AUDIO_DIR, n + '.mp3'));
      const id3 = buf.subarray(0, 3).toString() === 'ID3';
      const sync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
      if (!isID3orFrame(id3, sync) || buf.length < 1024) bad.push(n);
    }
    expect(bad).toEqual([]);
  });

  it('音频不是 HTML：SPA 回退会把缺失文件变成 200（防「静默没声音」）', () => {
    // vite preview / GitHub Pages 对未知路径都回退到 index.html，状态码是 200，
    // 内容却是 HTML。此时 <audio> 会静默播放失败——页面不报错、只是没声音。
    // 所以必须校验「内容确实是 MP3」，只查文件存在不够。
    const htmlLike: string[] = [];
    for (const n of names) {
      const buf = readFileSync(join(AUDIO_DIR, n + '.mp3'));
      if (buf.subarray(0, 15).toString('utf8').toLowerCase().includes('<!doctype')) {
        htmlLike.push(n);
      }
    }
    expect(htmlLike).toEqual([]);
  });

  it('台词文本不是占位符', () => {
    for (const n of names) {
      const line = (LINES as Record<string, string>)[n];
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(3);
    }
  });
});

/** 拆出来只为让上面的条件读起来是一句话 */
const isID3orFrame = (id3: boolean, sync: boolean) => id3 || sync;
