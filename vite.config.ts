import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
          manualChunks: {
            'vendor': ['react', 'react-dom'],
          },
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
