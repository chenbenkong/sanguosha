import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 钩子分发完整性守卫。
 *
 * 背景：SkillHooks 接口里声明了 handLimitBonus / exemptHandCards 两个钩子，
 * 也有技能实现了它们（杜夫人「顺世」的手牌上限 +1、王悦「护关」的花色豁免），
 * 但 dispatch.ts 里根本没有对应的分发器 —— 技能写了却永远不会被调用。
 *
 * 这和之前 dispatchTurnStart / dispatchCardUsed 未接线是同一类缺陷：
 * 声明与实现脱节。这里从源码层面强制：
 *   SkillHooks 里声明的每一个钩子，dispatch.ts 必须至少分发一次。
 */

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('钩子分发完整性守卫', () => {
  const registrySrc = read('src/game/skills/registry.ts');
  const dispatchSrc = read('src/game/skills/dispatch.ts');

  /** 从 SkillHooks 接口里抓出所有钩子名 */
  const declaredHooks = (() => {
    const start = registrySrc.indexOf('export interface SkillHooks {');
    const end = registrySrc.indexOf('}', start);
    const block = registrySrc.slice(start, end);
    return [...block.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  })();

  it('SkillHooks 至少声明了 7 个钩子', () => {
    expect(declaredHooks.length).toBeGreaterThanOrEqual(7);
  });

  it('每个声明的钩子都在 dispatch.ts 里有分发器（防止「有实现但永不调用」）', () => {
    const notDispatched = declaredHooks.filter(
      (h) => !dispatchSrc.includes("skillHook('" + h + "')"),
    );
    expect(notDispatched).toEqual([]);
  });

  it('每个分发器都被引擎调用（与 wiring.test.ts 互补：那边查函数，这边查钩子）', () => {
    const engine = read('App.tsx') + '\n' + read('src/game/combat.ts');
    const dispatchers = [...dispatchSrc.matchAll(/^export const (dispatch\w+)/gm)].map((m) => m[1]);
    const notWired = dispatchers.filter((d) => {
      const re = new RegExp('\\b' + d + '\\s*\\(', 'g');
      return (engine.match(re) ?? []).length === 0;
    });
    expect(notWired).toEqual([]);
  });
});