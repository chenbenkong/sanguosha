import { defineConfig } from 'vitest/config';

/**
 * 两套测试并存，互不越界：
 *   - npm test      → node --test 跑 src/game/rules.test.ts（node:test API）
 *   - npx vitest run→ 跑其余 *.test.ts（vitest API）
 *
 * rules.test.ts 用的是 node:test 的 test/assert，vitest 收集它只会得到
 * "No test suite found"，因此在 vitest 侧排除；不改规则、不动 vite.config.ts。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/game/rules.test.ts'],
  },
});
