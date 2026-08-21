import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // 构建优化
      build: {
        // 代码分割
        rollupOptions: {
          output: {
            manualChunks: {
              // 将第三方库单独打包
              'vendor': ['react', 'react-dom'],
            },
            // 优化 chunk 文件名
            chunkFileNames: 'assets/js/[name]-[hash].js',
            entryFileNames: 'assets/js/[name]-[hash].js',
            assetFileNames: (assetInfo) => {
              const info = assetInfo.name.split('.');
              const ext = info[info.length - 1];
              if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name)) {
                return 'assets/images/[name]-[hash][extname]';
              }
              if (/\.css$/i.test(assetInfo.name)) {
                return 'assets/css/[name]-[hash][extname]';
              }
              return 'assets/[name]-[hash][extname]';
            },
          },
        },
        // 压缩选项
        minify: 'esbuild',
        terserOptions: {
          compress: {
            drop_console: true, // 移除 console.log
            drop_debugger: true, // 移除 debugger
          },
        },
        // 资源内联阈值
        assetsInlineLimit: 4096, // 4KB 以下的资源内联
        // CSS 优化
        cssCodeSplit: true,
        // 源码映射
        sourcemap: false,
      },
      // 优化依赖预构建
      optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: [],
      },
      // 性能优化
      esbuild: {
        target: 'es2020',
        legalComments: 'none',
      },
    };
});
