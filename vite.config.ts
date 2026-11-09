import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 把模块 id 归到固定 chunk 名。返回 undefined 表示交给 Rollup 默认分配（入口自身）。
// 注意：被多个 chunk 引用的根级叶子模块（types.ts / constants.ts / src/config）必须显式归入
// shared，否则它们会落进入口 chunk，形成 “其它 chunk -> 入口 chunk” 的循环依赖。
function chunkNameOf(id: string): string | undefined {
  const p = id.replace(/\\/g, '/');
  if (p.includes('/node_modules/')) {
    if (/\/node_modules\/(react|react-dom|scheduler)\//.test(p)) return 'react-vendor';
    return 'vendor';
  }
  // 根级叶子模块：无 import，被几乎所有 chunk 依赖
  if (/\/(types|constants)\.ts$/.test(p)) return 'shared';
  if (p.includes('/src/config/')) return 'shared';
  if (p.includes('/src/audio/')) return 'audio';
  if (p.includes('/src/game/')) return 'game-core';
  if (p.includes('/src/components/game/')) return 'ui-game';
  if (p.includes('/src/components/')) return 'ui-core';
  if (p.includes('/src/contexts/') || p.includes('/src/hooks/')) return 'ui-core';
  if (/\/components\//.test(p)) return 'ui-core';
  return undefined;
}

export default defineConfig(({ command }) => {
  const isProd = command === 'build';
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: chunkNameOf,
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || '';
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(name)) {
              return 'assets/images/[name]-[hash][extname]';
            }
            if (/\.css$/i.test(name)) {
              return 'assets/css/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
      // 压缩选项：minify 为 esbuild，console 剔除由下方 esbuild.drop 生效
      // （原 terserOptions 在 esbuild 压缩下是无效配置，从未生效）
      minify: 'esbuild',
      assetsInlineLimit: 4096,
      cssCodeSplit: true,
      sourcemap: false,
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
    esbuild: {
      target: 'es2020',
      legalComments: 'none',
      // 仅生产构建剔除 console 与 debugger，保留开发期调试能力
      drop: isProd ? ['console', 'debugger'] : [],
    },
  };
});
