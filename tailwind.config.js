/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './types.ts',
    './constants.ts',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        ancient: ['"Ma Shan Zheng"', 'cursive'],
        serif: ['"Noto Serif SC"', 'serif'],
      },
      borderWidth: {
        3: '3px',
      },
      spacing: {
        18: '4.5rem',
      },
      maxWidth: {
        30: '7.5rem',
      },
      backgroundImage: {
        // 修复：CDN 版缺失的径向渐变工具类
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      boxShadow: {
        card: '2px 4px 12px rgba(0, 0, 0, 0.7)',
        'ink-glow': '0 0 24px rgba(212, 175, 55, 0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-scale': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'fade-in-scale': 'fade-in-scale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
