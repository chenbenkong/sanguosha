/**
 * node:test / node:assert(strict) 的最小适配层。
 *
 * 目的：src/game/rules.test.ts 是原生 node:test 写法（由 `npm test` 运行）。
 * 为了让同一份文件也能被 vitest 收集，vitest.config.ts 把
 *   node:test            -> 本文件
 *   node:assert(/strict) -> 本文件
 * 都别名到这一个模块。只在 vitest 运行时生效，被测源码与 package.json 均未改动。
 *
 * `npm test` 走的是真实 node:test / node:assert，不经过这里。
 */
import { expect, test as vitestTest } from 'vitest';

export const test = vitestTest;
export const it = vitestTest;

class AssertionError extends Error {}

function fail(message?: string, operator?: string): never {
  throw new AssertionError(message ?? `assertion failed${operator ? ` [${operator}]` : ''}`);
}

function equal(actual: unknown, expected: unknown, message?: string) {
  if (!Object.is(actual, expected)) {
    fail(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, 'equal');
  }
}

function notEqual(actual: unknown, expected: unknown, message?: string) {
  if (Object.is(actual, expected)) fail(message ?? `expected not ${JSON.stringify(expected)}`, 'notEqual');
}

function ok(value: unknown, message?: string): asserts value {
  if (!value) fail(message ?? `expected truthy, got ${JSON.stringify(value)}`, 'ok');
}

function notOk(value: unknown, message?: string) {
  if (value) fail(message ?? `expected falsy, got ${JSON.stringify(value)}`, 'notOk');
}

function deepStrictEqual(actual: unknown, expected: unknown, message?: string) {
  try {
    expect(actual).toEqual(expected);
  } catch {
    fail(message ?? 'deepStrictEqual failed', 'deepStrictEqual');
  }
}

function notDeepStrictEqual(actual: unknown, expected: unknown, message?: string) {
  try {
    expect(actual).not.toEqual(expected);
  } catch {
    fail(message ?? 'notDeepStrictEqual failed', 'notDeepStrictEqual');
  }
}

function throws(fn: () => unknown, message?: string) {
  try {
    fn();
  } catch {
    return;
  }
  fail(message ?? 'expected function to throw', 'throws');
}

const assertApi = {
  equal,
  notEqual,
  ok,
  notOk,
  deepStrictEqual,
  notDeepStrictEqual,
  throws,
  fail,
  strictEqual: equal,
  notStrictEqual: notEqual,
};

export { equal, notEqual, ok, notOk, deepStrictEqual, notDeepStrictEqual, throws, fail };
export const strictEqual = equal;
export const notStrictEqual = notEqual;
export const strict = assertApi;
export default assertApi;
