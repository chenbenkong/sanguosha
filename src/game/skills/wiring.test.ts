import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 引擎接线守卫测试。
 *
 * 背景：技能注册表定义了 7 个时机，但一度有 2 个（dispatchTurnStart、
 * dispatchCardUsed）从未在引擎里被调用，导致 22 个技能写了却永不触发。
 * 行为测试抓不到它——那些用例直接调用 dispatcher，绕过了引擎。
 *
 * 这个测试从源码层面断言：dispatch.ts 导出的每一个分发函数，
 * 都必须在 App.tsx 或 combat.ts 里至少有一条**真实调用**（注释与 import 行不算）。
 */

// __dirname = <repo>/src/game/skills -> 上三级即仓库根
const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** 去掉行注释与 import 语句，避免把「说明文字」当成接线 */
const strip = (src: string): string =>
  src
    .split('\n')
    .map(line => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .filter(line => !line.trimStart().startsWith('import '))
    .join('\n');

describe('引擎接线守卫', () => {
  const dispatchSrc = read('src/game/skills/dispatch.ts');
  const engineSrc = strip(read('App.tsx')) + '\n' + strip(read('src/game/combat.ts'));

  const exported = [...dispatchSrc.matchAll(/^export const (dispatch\w+)\b/gm)].map(m => m[1]);

  it('dispatch.ts 至少导出了 7 个分发函数', () => {
    expect(exported.length).toBeGreaterThanOrEqual(7);
  });

  it('每一个分发函数都在引擎里被真实调用（防止「写了但没接」）', () => {
    const notWired = exported.filter(name => {
      const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
      return (engineSrc.match(re) ?? []).length === 0;
    });
    expect(notWired).toEqual([]);
  });

  it('技能注册入口被引擎导入（否则注册表是空的）', () => {
    const app = read('App.tsx');
    expect(/import '\.\/src\/game\/skills'/.test(app)).toBe(true);
  });

  it('每个 batch 文件都被 skills/index.ts 导入', () => {
    const index = read('src/game/skills/index.ts');
    const dir = path.join(ROOT, 'src/game/skills');
    const batches = fs.readdirSync(dir).filter(f => /^batch\d+\.ts$/.test(f));
    expect(batches.length).toBeGreaterThan(0);
    const missing = batches.filter(b => !index.includes(b.replace(/\.ts$/, '')));
    expect(missing).toEqual([]);
  });
});
