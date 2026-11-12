import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer-core';
import { openApp, shot, sleep } from './helpers';
import type { E2EContext } from './helpers';

/**
 * 端到端 · 3D 卡牌查看器。
 *
 * 只断言**不依赖 WebGL 是否可用**的契约：
 * 宿主根元素的 data-c3d-state 最终必须离开 loading，落到 ready（有 canvas）
 * 或 fallback（有 .c3d-fallback 的 img）之一。
 *
 * 为什么不写「必须有画布」：本机 headless Chrome 走 SwiftShader 能拿到 WebGL2，
 * 但 CI runner 不保证（这也是加载层把「拿不到上下文」设计成静默降级的原因）。
 * 断言「必须有画布」在无 WebGL 的机器上必红，红的是环境而不是代码；
 * 反过来断言「一定回退」在有 WebGL 的机器上又是假的。所以两条分支各自查各自的证据，
 * 共同的那一条是「不许停在 loading」。
 *
 * 与 smoke / flows / coverage 一致：自选空闲端口、独立浏览器实例、
 * 只对着本仓库的 dist 断言（端口被别的构建产物占用时直接报错，不产出假红绿）。
 */

let PORT = Number(process.env.E2E_PORT) || 0;
let BASE = '';

/** 向系统要一个当前空闲的端口（绑定 0 取实际端口后立刻释放） */
const pickFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('无法分配空闲端口'))));
    });
  });

let server: ChildProcess | null = null;

/** 构建产物里的入口文件名（形如 index-XXXXXXXX.js），用来确认「这个端口是我起的」 */
const readLocalEntryAsset = (): string | null => {
  const indexHtml = path.resolve(process.cwd(), 'dist', 'index.html');
  if (!fs.existsSync(indexHtml)) return null;
  const html = fs.readFileSync(indexHtml, 'utf8');
  const m = html.match(/(?:assets\/js\/)?(index-[A-Za-z0-9_-]{6,}\.js)/);
  return m ? m[1] : null;
};

/** 该端口上现在是否真有一个 http 服务在应答 */
const isPortServing = async (base: string): Promise<boolean> => {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};

beforeAll(async () => {
  const localAsset = readLocalEntryAsset();
  if (!localAsset) throw new Error('缺少 dist 构建产物，请先执行 npx vite build --base=./');

  if (!PORT) PORT = await pickFreePort();
  BASE = 'http://127.0.0.1:' + PORT + '/';

  if (await isPortServing(BASE)) {
    const html = await (await fetch(BASE)).text();
    const served = (html.match(/(?:assets\/js\/)?(index-[A-Za-z0-9_-]{6,}\.js)/) || [])[1];
    if (served !== localAsset) {
      throw new Error(
        '端口 ' + PORT + ' 已被其它构建产物占用（' + (served ?? '未知') + '，本地 ' + localAsset + '）。' +
        '可结束残留的 vite preview，或不设 E2E_PORT 让测试自选空闲端口。',
      );
    }
    return;
  }

  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if (await isPortServing(BASE)) return;
    await sleep(700);
  }
  throw new Error('预览服务在 40 秒内未就绪');
}, 60000);

afterAll(() => {
  if (!server || !server.pid) return;
  // Windows 上 spawn({shell:true}) 的 pid 是外层 cmd，只 kill 它会留下孤儿 vite
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch { /* 已经退出 */ }
  }
  server.kill();
});

/** 进入选将页（首页点「点兵出征」） */
const enterHeroSelect = async (page: Page): Promise<boolean> => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '点兵出征');
    if (!b) return false;
    (b as HTMLButtonElement).click();
    return true;
  });
  await sleep(1500);
  return ok;
};

/** 把选将页切到「卡面」显示（seed 没生效时的兜底） */
const switchToCardArt = async (page: Page): Promise<boolean> => {
  const ok = await page.evaluate(() => {
    const box = document.querySelector('[role=group][aria-label="切换卡面显示方式"]');
    if (!box) return false;
    const btn = [...box.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '卡面');
    if (!btn) return false;
    (btn as HTMLButtonElement).click();
    return true;
  });
  await sleep(700);
  return ok;
};

/**
 * 挑一个有官方**全卡面**的武将：卡面模式下卡片的 <img> 指向 images/fullcards/，
 * 白名单外的武将恒回落立绘（heroFullCard 返回 null），拿它去开 3D 就测不到卡面那条路径。
 */
const findFullCardHero = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('button[aria-label^="选择 "]')) {
      const img = el.querySelector('img');
      const src = img ? img.getAttribute('src') || '' : '';
      if (src.includes('fullcards')) {
        return (el.getAttribute('aria-label') || '').replace('选择 ', '');
      }
    }
    return null;
  });

/** 选中武将（卡片本身点击 = 选中，契约与 coverage 用例一致） */
const pickHero = (page: Page, name: string): Promise<boolean> =>
  page.evaluate((n) => {
    const el = [...document.querySelectorAll('button[aria-label^="选择 "]')]
      .find((b) => (b.getAttribute('aria-label') || '') === '选择 ' + n);
    if (!el) return false;
    (el as HTMLButtonElement).click();
    return true;
  }, name);

/** 打开武将详情（卡片右下角的详情按钮） */
const openDetail = (page: Page, name: string): Promise<boolean> =>
  page.evaluate((n) => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => (x.getAttribute('aria-label') || '') === '查看 ' + n + ' 详情');
    if (!b) return false;
    (b as HTMLButtonElement).click();
    return true;
  }, name);

/** 从详情点「放大查看」进灯箱（详情与灯箱是两处独立的宿主） */
const openLightbox = async (page: Page): Promise<boolean> => {
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => (x.getAttribute('aria-label') || '').startsWith('放大查看'));
    if (!b) return false;
    (b as HTMLButtonElement).click();
    return true;
  });
  await sleep(800);
  return ok;
};

interface C3DHost {
  state: string;
  rectW: number;
  rectH: number;
  canvas: { rectW: number; rectH: number; attrW: number } | null;
  fallbackImg: { src: string; rectW: number; rectH: number } | null;
}

/** 读出当前页面上每个 3D 宿主的可见证据（状态 + 画布 / 降级图） */
const readC3DHosts = (page: Page): Promise<C3DHost[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-c3d-state]')].map((el) => {
      const r = el.getBoundingClientRect();
      const canvas = el.querySelector('canvas') as HTMLCanvasElement | null;
      const img = el.querySelector('img.c3d-fallback') as HTMLImageElement | null;
      const cr = canvas ? canvas.getBoundingClientRect() : null;
      const ir = img ? img.getBoundingClientRect() : null;
      return {
        state: el.getAttribute('data-c3d-state') || '',
        rectW: r.width,
        rectH: r.height,
        canvas: canvas && cr ? { rectW: cr.width, rectH: cr.height, attrW: canvas.width } : null,
        fallbackImg: img && ir ? { src: img.getAttribute('src') || '', rectW: ir.width, rectH: ir.height } : null,
      };
    }),
  );

/** 等到所有宿主都离开 loading（宿主要等 <img> 解码 + 引擎 create，慢网下不是瞬时） */
const waitForC3DSettled = async (page: Page, timeoutMs = 40000): Promise<C3DHost[]> => {
  const deadline = Date.now() + timeoutMs;
  let hosts: C3DHost[] = [];
  while (Date.now() < deadline) {
    hosts = await readC3DHosts(page);
    if (hosts.length > 0 && !hosts.some((h) => h.state === 'loading')) return hosts;
    await sleep(500);
  }
  return hosts;
};

describe('端到端 · 3D 卡牌', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    // 预置卡面模式：下面挑的武将必须走官方全卡面那条路径
    ctx = await openApp(BASE, { seed: { 'sgs-card-art-mode': 'card' } });
  }, 60000);
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('详情 / 灯箱的 3D 宿主最终离开 loading：ready 出画布、fallback 出降级图，且全程无 pageerror', async () => {
    expect(await enterHeroSelect(ctx.page)).toBe(true);

    let hero = await findFullCardHero(ctx.page);
    if (!hero) {
      expect(await switchToCardArt(ctx.page)).toBe(true);
      hero = await findFullCardHero(ctx.page);
    }
    // 前置条件：池子里得真有带官方全卡面的武将，否则下面测的不是卡面路径
    expect(hero).toBeTruthy();

    expect(await pickHero(ctx.page, hero!)).toBe(true);
    await sleep(500);
    expect(await openDetail(ctx.page, hero!)).toBe(true);
    await sleep(1200);
    expect(await openLightbox(ctx.page)).toBe(true);

    const hosts = await waitForC3DSettled(ctx.page);
    // 宿主必须真的挂出来（detail/lightbox 里各有一处，至少一处）
    expect(hosts.length).toBeGreaterThan(0);
    // 共同契约：不许有任何一个停在 loading
    expect(hosts.filter((h) => h.state === 'loading')).toEqual([]);

    const visible = hosts.filter((h) => h.rectW > 0 && h.rectH > 0);
    expect(visible.length).toBeGreaterThan(0);

    for (const h of visible) {
      if (h.state === 'ready') {
        // 说有画布就得真有画布，而且是真占地方的画布（0 宽 = 渲染失败但状态先进了 ready）
        expect(h.canvas).not.toBe(null);
        expect(h.canvas!.rectW).toBeGreaterThan(0);
        expect(h.canvas!.rectH).toBeGreaterThan(0);
        expect(h.canvas!.attrW).toBeGreaterThan(0);
        expect(h.fallbackImg).toBe(null);
      } else {
        expect(h.state).toBe('fallback');
        // 降级不是空白：必须有一张真的卡图顶上
        expect(h.fallbackImg).not.toBe(null);
        expect(h.fallbackImg!.src).not.toBe('');
        expect(h.canvas).toBe(null);
      }
    }

    await shot(ctx.page, 'c3d-lightbox-' + hosts[0].state);
    expect(ctx.errors).toEqual([]);
  }, 90000);
});

describe('端到端 · 3D 卡牌（引擎脚本拉不起来时）', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await openApp(BASE, { seed: { 'sgs-card-art-mode': 'card' } });
  }, 60000);
  afterAll(async () => { if (ctx) await ctx.close(); });

  /**
   * 降级路径的唯一确定性造法：把 vendor/card3d.js 掐掉。
   *
   * 依赖 headless 环境「没有 WebGL2」来测降级是靠不住的——本机 headless 就有
   * SwiftShader 软渲染的 WebGL2，CI 上可能没有。掐掉脚本则两种环境下都是
   * 「onerror → loadCard3D 返回 null → 组件进 fallback」，跑的一定是降级分支。
   */
  it('vendor/card3d.js 拉不到时出静态卡面（.c3d-fallback），不停在 loading 也不出 pageerror', async () => {
    await ctx.page.setRequestInterception(true);
    ctx.page.on('request', (req) => {
      if (req.url().includes('vendor/card3d.js')) void req.abort();
      else void req.continue();
    });

    expect(await enterHeroSelect(ctx.page)).toBe(true);

    let hero = await findFullCardHero(ctx.page);
    if (!hero) {
      expect(await switchToCardArt(ctx.page)).toBe(true);
      hero = await findFullCardHero(ctx.page);
    }
    expect(hero).toBeTruthy();

    expect(await pickHero(ctx.page, hero!)).toBe(true);
    await sleep(500);
    expect(await openDetail(ctx.page, hero!)).toBe(true);
    await sleep(1200);
    expect(await openLightbox(ctx.page)).toBe(true);

    const hosts = await waitForC3DSettled(ctx.page, 30000);
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.filter((h) => h.state === 'loading')).toEqual([]);

    // 降级图要真的顶上：<img> 有 src 还不够，加载完了才有非零尺寸
    await sleep(1500);
    const painted = (await readC3DHosts(ctx.page)).filter((h) => h.rectW > 0 && h.rectH > 0);
    expect(painted.length).toBeGreaterThan(0);
    for (const h of painted) {
      expect(h.state).toBe('fallback');
      expect(h.canvas).toBe(null);
      expect(h.fallbackImg).not.toBe(null);
      expect(h.fallbackImg!.src).not.toBe('');
      expect(h.fallbackImg!.rectW).toBeGreaterThan(0);
      expect(h.fallbackImg!.rectH).toBeGreaterThan(0);
    }

    // 脚本是本次刻意掐断的，只许留下这一条网络报错；
    // 组件与加载层自己不许有未捕获异常（pageerror 一条都不行）。
    expect(ctx.errors.filter((e) => e.startsWith('pageerror: '))).toEqual([]);
    expect(ctx.errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([]);

    await shot(ctx.page, 'c3d-lightbox-fallback');
  }, 90000);
});
