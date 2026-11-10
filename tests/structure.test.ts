import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * 静态结构体检（只断言、不修改代码）。
 * 目的：为「App.tsx 是否需要拆分」提供可复现的数字，而不是主观判断。
 */

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'tests']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const readText = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '');

/** 去掉字符串/注释后计数，避免把注释里的 useEffect 算进去 */
function stripNoise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '""');
}

const countOf = (src: string, re: RegExp) => (src.match(re) ?? []).length;

const tsxFiles = walk(ROOT).filter(f => f.endsWith('.tsx'));
const tsxRel = tsxFiles.map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
const tsxLines = new Map(tsxRel.map(rel => [rel, readText(rel).split('\n').length]));

const APP = 'App.tsx';
const appRaw = readText(APP);
const app = stripNoise(appRaw);
const appLineCount = appRaw.split('\n').length;

/** 按「调用点」计数（useState< 与 useState( 都算一次） */
const hooks = {
  useState: countOf(app, /useState\s*[<(]/g),
  useEffect: countOf(app, /useEffect\s*\(/g),
  useCallback: countOf(app, /useCallback\s*\(/g),
  useMemo: countOf(app, /useMemo\s*\(/g),
  useRef: countOf(app, /useRef\s*[<(]/g),
};

/** 定时器调用点：同时覆盖裸调用与 window.setTimeout / window.setInterval 写法 */
const timers = {
  setTimeout: countOf(app, /setTimeout\s*\(/g),
  setInterval: countOf(app, /setInterval\s*\(/g),
  clearTimeout: countOf(app, /clearTimeout\s*\(/g),
  clearInterval: countOf(app, /clearInterval\s*\(/g),
};

describe('App.tsx 规模与 Hook 密度', () => {
  test('App.tsx 行数（只报告，不做上限强制）', () => {
    expect(appLineCount).toBeGreaterThan(1000);
  });

  test('useState / useEffect / useCallback 数量均 > 0（只断言存在，不强制风格）', () => {
    expect(hooks.useState).toBeGreaterThan(0);
    expect(hooks.useEffect).toBeGreaterThan(0);
    expect(hooks.useCallback).toBeGreaterThan(0);
  });

  test('Hook 数量落在合理区间（数值变化说明结构被改动）', () => {
    // 实测：useState 106 / useEffect 33 / useCallback 18 / useMemo 2 / useRef 111
    expect(hooks.useEffect).toBeGreaterThanOrEqual(25);
    expect(hooks.useEffect).toBeLessThanOrEqual(45);
    expect(hooks.useCallback).toBeGreaterThanOrEqual(10);
    expect(hooks.useState).toBeGreaterThanOrEqual(80);
    expect(hooks.useRef).toBeGreaterThanOrEqual(80);
  });
});

describe('.tsx 文件行数体检', () => {
  test('统计到全部 .tsx 文件', () => {
    expect(tsxFiles.length).toBeGreaterThan(0);
  });

  test('列出所有行数 > 1500 的 .tsx 文件', () => {
    const over = tsxRel
      .filter(rel => (tsxLines.get(rel) ?? 0) > 1500)
      .sort((a, b) => (tsxLines.get(b) ?? 0) - (tsxLines.get(a) ?? 0));
    // 报告：当前仅 App.tsx 超限，体量远大于其余文件
    expect(over).toEqual(['App.tsx']);
    expect(appLineCount).toBeGreaterThan(1500);
  });

  test('除 App.tsx 外没有其他 .tsx 超过 1500 行', () => {
    const others = tsxRel.filter(rel => rel !== APP && (tsxLines.get(rel) ?? 0) > 1500);
    expect(others).toEqual([]);
  });

  test('第二大的 .tsx 文件远小于 App.tsx（拆分收益的量级依据）', () => {
    const sorted = [...tsxRel].sort((a, b) => (tsxLines.get(b) ?? 0) - (tsxLines.get(a) ?? 0));
    const second = tsxLines.get(sorted[1]) ?? 0;
    expect(second).toBeLessThan(appLineCount / 5);
  });
});

describe('定时器与 effect 清理体检（只报告）', () => {
  test('setTimeout / setInterval 调用点统计为真实数字（架构重构后实测 89 / 6）', () => {
    expect(timers.setTimeout).toBe(90);
    expect(timers.setInterval).toBe(6);
    expect(timers.clearTimeout).toBe(12);
    expect(timers.clearInterval).toBe(7);
  });

  test('清理函数数量少于创建点数量（清理缺口，仅记录，不在此强制）', () => {
    const created = timers.setTimeout + timers.setInterval;
    const cleared = timers.clearTimeout + timers.clearInterval;
    expect(cleared).toBeLessThan(created);
    expect(cleared).toBeGreaterThan(0);
  });

  test('useEffect 内部 return () => 的清理函数数量 > 0', () => {
    expect(countOf(app, /return\s*\(\)\s*=>/g)).toBeGreaterThan(0);
  });
});

describe('源码未引入测试专用改动（回归护栏）', () => {
  test('App.tsx 头部没有 vitest / test-only 导入', () => {
    expect(/from\s+['"]vitest['"]/.test(appRaw)).toBe(false);
    expect(/from\s+['"]node:test['"]/.test(appRaw)).toBe(false);
  });

  test('src/game 下被测纯函数文件不含 vitest 导入', () => {
    for (const rel of ['src/game/rules.ts', 'src/game/utils.ts', 'src/game/save.ts', 'src/game/heroDetail.ts']) {
      expect(readText(rel).includes("from 'vitest'"), rel).toBe(false);
    }
  });
});
