import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 横屏手机选将页的密度守卫。
 *
 * 用户反馈：「首页选武将，一张武将图片就占了半个屏幕，这体验很差」。
 * 根因：选将网格按**宽度**分列（桌面 8 列 / lg 6 列），而 924px 的横屏手机落在
 * lg:(1024) 之下 → 4 列；卡片是 aspect-ratio 2/3，宽度由列宽决定 →
 * 单卡 214×321，占屏高 75%，一屏只看得到 4 名武将。
 *
 * 修法：横屏下给网格「固定行高 + auto-fill 自动填列」，卡片高度锁在可用高度内。
 * 这条守卫钉住源码层的三个不变式（真实像素指标由 mobile-check.cjs 量测）：
 *   A. 横屏作用域必须存在，且行高有下限（防止 clamp 写成无下限而把卡压成马赛克）；
 *   B. 网格必须用 auto-fill（按宽度自动决定列数），不能写死列数；
 *   C. 铭条里名字优先（势力标签在 74px 卡上会把名字挤没）。
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const css = read('src/styles/theme.css');
const sel = read('src/components/game/HeroSelectScreen.tsx');

describe('横屏手机选将页密度', () => {
  it('A. 横屏作用域存在，且行高有可读性下限', () => {
    expect(css).toContain('[data-orient="landscape-phone"] .hero-grid');
    // 行高表达式必须带下限：实测无下限时 780×360 算出 43px，卡变成一小块马赛克
    const m = css.match(/\[data-orient="landscape-phone"\] \.hero-grid \{[\s\S]*?grid-auto-rows:\s*([^;]+);/);
    expect(m, '横屏网格必须显式设置 grid-auto-rows').toBeTruthy();
    expect(m![1], '行高必须有下限（clamp 的 min 值）').toMatch(/clamp\(/);
  });

  it('B. 列数由 auto-fill 自动决定，不写死', () => {
    const m = css.match(/\[data-orient="landscape-phone"\] \.hero-grid \{[\s\S]*?grid-template-columns:\s*([^;]+);/);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/auto-fill/);
    expect(m![1]).not.toMatch(/grid-cols-\d/);
  });

  it('C. 铭条里名字优先：势力标签在小卡上要让位', () => {
    expect(css).toMatch(/hero-grid \.hero-pick-strip \.hero-kingdom\s*\{[\s\S]*?display:\s*none/);
    // 名字必须单行 + 省略号，不允许换行把 78px 的卡撑破。
    // 注意取**最后一条**匹配：同一选择器在文件里有两条规则（早的一条只改字号，
    // 后一条才是横屏下的 nowrap/ellipsis），只取第一条会误判。
    // 必须命中**横屏作用域内**的那条：文件里同名选择器有多处（桌面/竖屏/横屏），
    // 宽松匹配会拿到别的作用域的规则，从而「守卫通过但功能没生效」——
    // 这个坑真踩过：CSS 里那几条其实被我后一次替换覆盖掉了，测试却一直绿。
    const scoped = css.match(/\[data-orient="landscape-phone"\] \.hero-grid \.hero-pick-strip \.hero-pick-name\s*\{([\s\S]*?)\}/);
    expect(scoped, '横屏铭条规则必须存在').toBeTruthy();
    const body = scoped![1];
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('D. 选将页根节点挂上 data-orient，横屏样式才生效', () => {
    expect(sel).toContain('data-orient={orient}');
    expect(sel).toContain('hero-grid');
  });
});
