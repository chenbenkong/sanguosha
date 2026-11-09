import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * 测试基建配置（仅命令行驱动）。
 *
 * 两套测试并存，互不越界：
 *   - `npm test`        → node --test 跑 src/game/rules.test.ts（原生 node:test API）
 *   - `npx vitest run`  → 跑 tests/** 与 src/** 下的全部用例（含 rules.test.ts，经别名层）
 *
 * src/game/rules.test.ts 用的是 node:test 的 test/assert。为让同一份文件也被 vitest 收集，
 * 把 node:test / node:assert(strict) 别名到 tests/shims/node-test.ts 适配层——被测源码零改动。
 * `npm test` 走真实 node:test，不经过这里。
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^node:test$/, replacement: path.resolve(__dirname, 'tests/shims/node-test.ts') },
      { find: /^node:assert\/strict$/, replacement: path.resolve(__dirname, 'tests/shims/node-test.ts') },
      { find: /^node:assert$/, replacement: path.resolve(__dirname, 'tests/shims/node-test.ts') },
      { find: '@', replacement: path.resolve(__dirname, '.') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});