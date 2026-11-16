import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 内置字体守卫。
 *
 * 背景（实测踩过）：仓库里那三份 woff2 此前**从未被任何 @font-face 引用**——
 * index.html 里 preload 了，CSS 里却一条 @font-face 都没有，等于装饰品。
 * 后果是设备没装「Ma Shan Zheng」时（Android WebView 基本没装），标题字静默掉成默认字形；
 * 而那三份子集本身又只有拉丁字形，中文一个都没有（实测所有汉字宽度都等于回退字体）。
 *
 * 现在字体改为按游戏用字裁剪的子集并真正 @font-face 引入，这条守卫钉住三件事：
 *   A. CSS 里必须有 @font-face，且引用本地字体文件；
 *   B. 字体 URL 必须是**相对路径**（绝对路径 /fonts/… 在 APK 的 file:// 下会解析成 file:///fonts/… 而失效）；
 *   C. 字体文件必须真的存在且非空。
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const css = read('src/styles/theme.css');

describe('内置字体（离线可用）', () => {
  const FONT_FILES = [
    'public/fonts/MaShanZheng-sub.woff2',
    'public/fonts/NotoSerifSC-400-sub.woff2',
    'public/fonts/NotoSerifSC-700-sub.woff2',
  ];

  it('A. CSS 里有 @font-face 声明，且引用了这三份字体', () => {
    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'Ma Shan Zheng'");
    expect(css).toContain("font-family: 'Noto Serif SC'");
  });

  it('B. 字体 URL 用相对路径（绝对路径在 file:// 下失效）', () => {
    const urls = [...css.matchAll(/url\((['"]?)([^)'"]+\.woff2)\1\)/g)].map((m) => m[2]);
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) {
      expect(u.startsWith('/'), '字体 URL 必须是相对路径（实际: ' + u + '）').toBe(false);
      expect(u.startsWith('../../fonts/'), '字体 URL 应指向站点根的 fonts/（实际: ' + u + '）').toBe(true);
    }
  });

  it('C. 字体文件存在且非空', () => {
    for (const f of FONT_FILES) {
      const buf = readFileSync(f);
      expect(buf.length, f + ' 不能为空').toBeGreaterThan(1000);
      // woff2 魔数
      expect(buf.slice(0, 4).toString('ascii'), f + ' 不是 woff2').toBe('wOF2');
    }
  });

  it('D. 字体子集含中文字形（不是只有拉丁的装饰品）', () => {
    // 用浏览器验过的等价判据：文件里必须含 CJK 区段的 cmap。
    // 这里用体积做粗判：完整中文子集必然远大于纯拉丁子集（后者 ~6KB）。
    for (const f of FONT_FILES) {
      const size = readFileSync(f).length;
      expect(size, f + ' 太小，怀疑只有拉丁字形').toBeGreaterThan(100_000);
    }
  });

  it('E. 许可文件随字体一起入库（Ma Shan Zheng 是 OFL 开源字体）', () => {
    expect(read('public/fonts/OFL.txt')).toContain('SIL OPEN FONT LICENSE');
  });
});
