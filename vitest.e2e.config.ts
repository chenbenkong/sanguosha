import { defineConfig } from 'vitest/config';

/**
 * 端到端测试专用配置。
 *
 * 与 vitest.config.ts 分开，是因为 e2e 需要：
 *  - 排除 src/** 的单测
 *  - 更长的超时（要起预览服务 + 跑真实浏览器）
 *  - 串行执行（多个浏览器实例会抢端口、抢内存）
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 90000,
    hookTimeout: 60000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
