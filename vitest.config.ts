import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * 测试基建配置（仅命令行驱动，不改 package.json）。
 *
 * src/game/rules.test.ts 是原生 node:test 写法（npm test 用它）。
 * 为让它同时被 vitest 收集，把 node:test / node:assert(strict) 都别名到
 * tests/shims/node-test.ts 这个轻量适配层——被测源码零改动。
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
  },
});
