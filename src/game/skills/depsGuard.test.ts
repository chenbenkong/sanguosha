import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 依赖工厂守卫 —— 防止「技能注册了却永不发动」这一类缺陷复发。
 *
 * 背景（真实发生过的两次缺陷，都只有玩到才会发现）：
 *
 * 1. `combat.ts` 里同一个 deps 字面量被复制了 6 份，给 SkillContext 新增
 *    `peekDeck` / `deckTo` / `changeMaxHp` / `takeFromDeck` 时只改了其中一处，
 *    其余 5 处（伤害、濒死这些热路径）静默退化成空桩。
 * 2. `App.tsx` 的 `dispatchTurnStart` / `dispatchTurnEnd` / `dispatchDrawBonus` /
 *    `dispatchJudgeBefore` 四处也是手写字面量，缺 `takeFromDeck`：
 *    邓晚棠「黛颊」的结束阶段分支照付代价（弃黑牌、回 1 体力）却一张牌也拿不到。
 *
 * 根因不是某一次漏改，而是 deps 的能力字段在类型上是**可选**的：漏传能编译通过，
 * 运行时才退化成空桩。类型层收紧会牵动几十个测试的 deps 构造，因此这里用
 * 源码级守卫钉死三条不变式：
 *
 *   A. 分发调用点不得手写 deps 字面量（必须走 buildSkillDeps() / skillDeps()）。
 *   B. 每个 DispatchDeps 字段都必须被两个 deps 工厂提供。
 *   C. 每个 SkillContext 能力都必须被 ctxFor 暴露。
 *
 * 三条都从源码派生清单，因此加字段时守卫自动生效，不需要手工维护列表。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const readSrc = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** 从 decl 起，取第一个 `{` 开始配平的一段源码 */
const balancedBody = (src: string, decl: string): string => {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('找不到：' + decl);
  const b = src.indexOf('{', i);
  if (b < 0) throw new Error('找不到函数体：' + decl);
  let depth = 0;
  for (let k = b; k < src.length; k += 1) {
    const ch = src[k];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(b, k + 1);
    }
  }
  throw new Error('括号不配平：' + decl);
};

/** 取一个 interface 的字段名 */
const interfaceFields = (src: string, name: string): string[] => {
  const body = balancedBody(src, 'interface ' + name + ' {');
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
};

/** SkillContext 里形态为函数的能力（引擎动作），排除数据字段 */
const contextCapabilities = (src: string): string[] => {
  const body = balancedBody(src, 'export interface SkillContext {');
  return [...body.matchAll(/^\s{2}(\w+):\s*\(/gm)].map((m) => m[1]);
};

const APP = () => readSrc('App.tsx');
const COMBAT = () => readSrc('src/game/combat.ts');
const DISPATCH = () => readSrc('src/game/skills/dispatch.ts');
const REGISTRY = () => readSrc('src/game/skills/registry.ts');

/** 两个 deps 工厂：名字 + 取体内文本 */
const factories = (): Array<[string, string]> => [
  ['App.tsx buildSkillDeps', balancedBody(APP(), 'const buildSkillDeps = ')],
  ['combat.ts skillDeps', balancedBody(COMBAT(), 'const skillDeps = ')],
];

describe('技能分发依赖守卫', () => {
  it('分发调用点不得手写 deps 字面量（必须走 buildSkillDeps() / skillDeps()）', () => {
    const bad: string[] = [];
    for (const [name, src] of [['App.tsx', APP()], ['src/game/combat.ts', COMBAT()]] as const) {
      // `dispatchXxx({` 后面不是展开运算符 —— 说明是手写的对象字面量
      const re = /dispatch[A-Z]\w*\(\s*\{(?!\s*\.\.\.)/g;
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(name + ':' + line + ' ' + m[0].replace(/\s+/g, ' '));
      }
    }
    expect(bad).toEqual([]);
  });

  it('不得存在以 players 开头的手写 deps 字面量', () => {
    const bad: string[] = [];
    for (const [name, src] of [['App.tsx', APP()], ['src/game/combat.ts', COMBAT()]] as const) {
      // 工厂自身写成 `= () => ({`，这个模式不会命中
      const re = /=\s*\{\s*players:\s*playersRef\.current,/g;
      for (const m of src.matchAll(re)) {
        bad.push(name + ':' + src.slice(0, m.index).split('\n').length);
      }
    }
    expect(bad).toEqual([]);
  });

  it('每个 DispatchDeps 字段都被两个 deps 工厂提供', () => {
    const fields = interfaceFields(DISPATCH(), 'DispatchDeps');
    expect(fields.length).toBeGreaterThan(10);
    const missing: string[] = [];
    for (const [name, body] of factories()) {
      for (const f of fields) {
        if (!new RegExp('\\b' + f + '\\s*:').test(body)) missing.push(name + ' 缺 ' + f);
      }
    }
    expect(missing).toEqual([]);
  });

  it('每个 SkillContext 能力都被 ctxFor 暴露', () => {
    const caps = contextCapabilities(REGISTRY());
    expect(caps.length).toBeGreaterThan(10);
    const ctxBody = balancedBody(DISPATCH(), 'const ctxFor = ');
    const missing = caps.filter((c) => !new RegExp('\\b' + c + '\\s*[:,]').test(ctxBody));
    expect(missing).toEqual([]);
  });
});
