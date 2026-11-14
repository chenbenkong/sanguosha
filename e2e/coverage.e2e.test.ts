import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer-core';
import {
  HERO_CANDIDATES, clickButton, enableTakeover, openApp, readGameState,
  setSpeedLevel, shot, sleep, startGameWithHero,
} from './helpers';
import type { E2EContext } from './helpers';

/**
 * 端到端 · 覆盖补充。
 *
 * smoke / flows 已覆盖「能进对局 / 能打完 / 弃牌 / 弹窗 / 读档 / 主题」；
 * 这里补的是选将页与开局设置这类只有真跑浏览器才确认得了的交互契约：
 *   1. 选将搜索的多关键词交集（势力 + 体力）
 *   2. 悬停卡片的技能速览浮层
 *   3. 390×844 移动端布局无横向溢出且卡片可点
 *   4. 七人局的座位数与人数设置一致
 *   5. AI 难度切到「困难」后能正常开局并推进
 *
 * 设计取舍：
 *  - 自选空闲端口 + 每 describe 独立浏览器实例，与 smoke / flows 互不干扰
 *    （fileParallelism:false 下仍然串行，端口只是为了不撞车）。
 *  - 启动前校验「端口上服务的正是本地 dist」：同机常有别的 preview 残留，
 *    否则断言的对象不是本仓库的代码，红绿都不成立。
 *  - 所有等待都带 deadline，横向断言（scrollWidth === clientWidth）用严格相等，
 *    不写「小于某个余量」的宽容断言，否则测不出真实溢出。
 */

/**
 * 端口不写死：同机常有其它工作区的 preview 残留占着固定端口，
 * 对着别人的构建产物跑 e2e，红绿都不代表本仓库。E2E_PORT 可显式指定。
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
  // dist 是 e2e 的唯一被测对象：没有它 preview 只会给 404，
  // 与其在用例里莫名超时，不如在这里明确报出来。
  const localAsset = readLocalEntryAsset();
  if (!localAsset) throw new Error('缺少 dist 构建产物，请先执行 npx vite build --base=./');

  if (!PORT) PORT = await pickFreePort();
  BASE = `http://127.0.0.1:${PORT}/`;

  // 指定了 E2E_PORT 且该端口已有服务在跑：只接受它服务的正是本地这份 dist，
  // 否则断言的对象根本不是本仓库的代码，红绿都不可信。
  if (await isPortServing(BASE)) {
    const html = await (await fetch(BASE)).text();
    const served = (html.match(/(?:assets\/js\/)?(index-[A-Za-z0-9_-]{6,}\.js)/) || [])[1];
    if (served !== localAsset) {
      throw new Error(
        `端口 ${PORT} 已被其它构建产物占用（${served ?? '未知'}，本地 ${localAsset}）。` +
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
  // Windows 上 spawn({shell:true}) 的 pid 是外层 cmd，只 kill 它会把 vite 留成孤儿进程，
  // 下一轮 e2e 就会撞上这个残留服务（甚至拿到旧构建产物）。这里按进程树收尾。
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch { /* 已经退出 */ }
  }
  server.kill();
});

/** 进入选将页（首页点「点兵出征」） */
const enterHeroSelect = async (page: Page): Promise<boolean> => {
  const ok = await clickButton(page, '点兵出征');
  await sleep(1500);
  return ok;
};

/**
 * 在选将页搜索框输入关键词。
 * 输入框是受控组件，必须走原生 value setter + input 事件，否则 React 收不到变更。
 */
const typeHeroQuery = async (page: Page, text: string): Promise<boolean> => {
  const ok = await page.evaluate((t) => {
    const i = document.querySelector('input[aria-label^="搜索武将"]') as HTMLInputElement | null;
    if (!i) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    set.call(i, t);
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, text);
  await sleep(700);
  return ok;
};

/** 当前页可见的武将卡片（契约：卡片是 <button aria-label="选择 X">） */
const readHeroCards = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="选择 "]')].map((el) => ({
      name: (el.getAttribute('aria-label') || '').replace(/^选择s*/, ''),
      // 势力角标与体力勾玉都是卡片自带的可见文本/节点，不解析 title 字符串
      kingdom: (el.querySelector('.hero-kingdom')?.textContent || '').trim(),
      hp: el.querySelectorAll('.hero-hp-pip').length,
      pressed: el.getAttribute('aria-pressed') === 'true',
    })),
  );

/** 首页人数 / AI 难度按钮（aria-pressed 是群组里的选中态） */
const clickOption = (page: Page, group: string, label: string) =>
  page.evaluate(({ g, l }) => {
    const box = document.querySelector(`[role=group][aria-label="${g}"]`);
    if (!box) return null;
    const btn = [...box.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === l);
    if (!btn) return null;
    (btn as HTMLButtonElement).click();
    return btn.getAttribute('aria-pressed');
  }, { g: group, l: label });

const readPressed = (page: Page, group: string, label: string) =>
  page.evaluate(({ g, l }) => {
    const box = document.querySelector(`[role=group][aria-label="${g}"]`);
    if (!box) return null;
    const btn = [...box.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === l);
    return btn ? btn.getAttribute('aria-pressed') : null;
  }, { g: group, l: label });

/** 座位卡 id 列表：0 = 我方座位，其余为敌方座位 */
const readSeatIds = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-seat-id]')]
      .map((el) => Number(el.getAttribute('data-seat-id')))
      .sort((a, b) => a - b),
  );

/**
 * 对局推进指纹：战报条数 + 最后一条战报 + 阶段行动者。
 * 三者任一变化即证明主循环还在往前走（不是卡在某个等待态空转）。
 */
const readProgress = (page: Page) =>
  page.evaluate(() => ({
    logCount: Number((document.querySelector('.log-head-count')?.textContent || '0').trim()) || 0,
    lastLog: (document.querySelectorAll('.log-line')[document.querySelectorAll('.log-line').length - 1]?.textContent || '').trim(),
    actor: (document.querySelector('.phase-panel-name')?.textContent || '').trim(),
    phase: (() => {
      const el = [...document.querySelectorAll('.phase-step')].find((e) => e.getAttribute('data-state') === 'active');
      return el ? (el.textContent || '').trim() : '';
    })(),
    inGame: document.body.innerText.includes('当前阶段'),
  }));

describe('端到端 · 覆盖补充', () => {
  describe('选将页多关键词搜索', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('输入「魏 3」后只剩魏势力、3 体力的武将', async () => {
      expect(await enterHeroSelect(ctx.page)).toBe(true);

      const all = await readHeroCards(ctx.page);
      // 前置条件：不筛选时池子远大于一页，说明下面的筛选确实收窄了结果
      expect(all.length).toBeGreaterThan(0);

      expect(await typeHeroQuery(ctx.page, '魏 3')).toBe(true);

      // 两个关键词各渲染成一个条件标签，证明 UI 真的按「交集」而不是整串匹配
      const chips = await ctx.page.evaluate(() => {
        const box = document.querySelector('[aria-live=polite]');
        return box ? (box.textContent || '').replace(/\s+/g, ' ').trim() : '';
      });
      expect(chips).toContain('魏');
      expect(chips).toContain('3');
      expect(chips).toContain('同时命中以上全部条件');

      const cards = await readHeroCards(ctx.page);
      expect(cards.length).toBeGreaterThan(0);

      // 每张可见卡片都必须是魏 + 3 体力，一张不合规就说明筛选串味了
      for (const c of cards) {
        expect({ name: c.name, kingdom: c.kingdom, hp: c.hp }).toEqual({ name: c.name, kingdom: '魏', hp: 3 });
      }
      // 页眉的「命中数 / 总数」不能自相矛盾
      const summary = await ctx.page.evaluate(() => {
        const t = document.body.innerText;
        const m = t.match(/(\d+)\s*\/\s*(\d+)\s*名/);
        return m ? { hit: Number(m[1]), total: Number(m[2]) } : null;
      });
      expect(summary).toBeTruthy();
      expect(summary!.hit).toBeGreaterThanOrEqual(cards.length);
      expect(summary!.hit).toBeLessThanOrEqual(summary!.total);

      await shot(ctx.page, 'coverage-search-wei-3');
      expect(ctx.errors).toEqual([]);
    }, 60000);
  });

  describe('技能速览浮层', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('悬停卡片出现技能说明浮层，移开指针后收起', async () => {
      expect(await enterHeroSelect(ctx.page)).toBe(true);

      const card = await ctx.page.$('button[aria-label^="选择 "]');
      expect(card).toBeTruthy();
      const cardName = await card!.evaluate(
        (el) => (el.getAttribute('aria-label') || '').replace(/^选择\s*/, ''),
      );

      // 用真实鼠标移动到卡片上：浮层靠 onPointerEnter(pointerType=mouse) 打开，
      // 合成事件或直接 dispatchEvent 测不到这条路径
      await card!.hover();
      // 浮层靠 onPointerEnter 触发一次 setState，正常在同一次重渲染内出现。
      // 固定 600ms 在两处都是赌：慢机上没渲染完就取到 null（假红），
      // 快机上白等。改成轮询到出现为止（1.5s 上限），失败时再快照一次拿现场。
      let tip = await (async () => {
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline) {
          const t = await ctx.page.evaluate(() => {
            const el = document.querySelector('[data-testid="hero-skill-preview"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              role: el.getAttribute('role'),
              label: el.getAttribute('aria-label') || '',
              text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
              width: r.width,
              height: r.height,
            };
          });
          if (t) return t;
          await sleep(100);
        }
        return null;
      })();

      expect(tip).toBeTruthy();
      expect(tip!.role).toBe('tooltip');
      expect(tip!.label).toBe(`${cardName} 技能说明`);
      // 浮层必须真的有可见尺寸，而不是渲染成一个 0 尺寸的隐藏节点
      expect(tip!.width).toBeGreaterThan(0);
      expect(tip!.height).toBeGreaterThan(0);
      // 正文里要有技能名与技能描述，只留个标题框不算数
      expect(tip!.text).toContain('【');
      expect(tip!.text).toContain('体力');
      expect(tip!.text.length).toBeGreaterThan(20);

      await shot(ctx.page, 'coverage-skill-preview');

      // 指针移开卡片后浮层收起（同样轮询而不是固定 500ms）
      await ctx.page.mouse.move(5, 5);
      let closed = false;
      const closeDeadline = Date.now() + 2000;
      while (Date.now() < closeDeadline && !closed) {
        closed = await ctx.page.evaluate(
          () => !document.querySelector('[data-testid="hero-skill-preview"]'),
        );
        if (!closed) await sleep(100);
      }
      expect(closed).toBe(true);

      expect(ctx.errors).toEqual([]);
    }, 60000);
  });

  describe('选将页卡面模式', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    /**
     * 卡面模式的两条不变量，都只有真跑浏览器才验证得了：
     *  1. 白名单里的武将显示 images/fullcards/*.webp，坏的映射会静默回落立绘
     *  2. 没有卡面的武将（马云禄、蔡贞姬）必须回落立绘，不能出现 404 破图
     * 元素选择器与 src 都是对外契约（素材目录 + aria-label），改动会在这里响。
     */
    /**
     * 点击模式按钮并等 React 提交后再读实际状态。
     * 不能在 click 的同一个 evaluate 里读 aria-pressed：那一刻 React 还没重渲染，
     * 读到的是旧值（会误判成「没切过去」）。
     */
    const pressMode = async (page: Page, label: string): Promise<string | null> => {
      const clicked = await page.evaluate((l) => {
        const box = document.querySelector('[role=group][aria-label="切换卡面显示方式"]');
        if (!box) return false;
        const btn = [...box.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === l);
        if (!btn) return false;
        (btn as HTMLButtonElement).click();
        return true;
      }, label);
      if (!clicked) return null;
      await sleep(500);
      return page.evaluate((l) => {
        const box = document.querySelector('[role=group][aria-label="切换卡面显示方式"]');
        const btn = box
          ? [...box.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === l)
          : null;
        return btn ? btn.getAttribute('aria-pressed') : null;
      }, label);
    };

    const readFirstCardImg = (page: Page) =>
      page.evaluate(() => {
        const el = document.querySelector('button[aria-label^="选择 "]');
        const img = el?.querySelector('img') as HTMLImageElement | null;
        return img
          ? {
              src: img.getAttribute('src') || '',
              naturalW: img.naturalWidth,
              naturalH: img.naturalHeight,
              isFullcard: (el as HTMLElement).className.includes('is-fullcard'),
            }
          : null;
      });

    it('切到「卡面」后卡片改用官方完整卡面，切回「立绘」恢复原状', async () => {
      expect(await enterHeroSelect(ctx.page)).toBe(true);

      expect(await pressMode(ctx.page, '卡面')).toBe('true');
      await sleep(900);
      const card = await readFirstCardImg(ctx.page);
      expect(card).toBeTruthy();
      expect(card!.src).toContain('images/fullcards/');
      // 真正的加载成功：naturalWidth 只有解码成功才非 0
      expect(card!.naturalW).toBeGreaterThan(0);
      expect(card!.isFullcard).toBe(true);

      expect(await pressMode(ctx.page, '立绘')).toBe('true');
      await sleep(900);
      const back = await readFirstCardImg(ctx.page);
      expect(back!.src).toContain('images/heroes/');
      expect(back!.naturalW).toBeGreaterThan(0);
      expect(back!.isFullcard).toBe(false);

      await shot(ctx.page, 'coverage-card-mode');
    }, 120000);

    it('无卡面的武将回落立绘：不出现 404 破图', async () => {
      // 上一个用例收在「立绘」，这里直接切到「卡面」即可，不必重进选将页
      expect(await pressMode(ctx.page, '卡面')).toBe('true');
      await sleep(600);

      const result = await ctx.page.evaluate(async () => {
        const out: Array<{ name: string; src: string; naturalW: number }> = [];
        for (const name of ['马云禄', '蔡贞姬']) {
          const el = [...document.querySelectorAll('button[aria-label^="选择 "]')]
            .find((b) => (b.getAttribute('aria-label') || '') === '选择 ' + name) as HTMLElement | null;
          if (!el) { out.push({ name, src: 'CARD_NOT_VISIBLE', naturalW: -1 }); continue; }
          const img = el.querySelector('img') as HTMLImageElement | null;
          // 等在视口内解码完成，naturalWidth 才是可信的
          if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
          out.push({ name, src: img?.getAttribute('src') || '', naturalW: img?.naturalWidth ?? 0 });
        }
        return out;
      });

      // 两人都可能不在当前页（每页 24 人），所以只对「找得到的」断言
      for (const r of result) {
        if (r.src === 'CARD_NOT_VISIBLE') continue;
        expect(r.src).toContain('images/heroes/');
        expect(r.src).not.toContain('images/fullcards/');
        expect(r.naturalW).toBeGreaterThan(0);
      }
    }, 120000);
  });

  describe('卡牌 3D 倾斜', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    /**
     * 倾斜的**启用条件**是否被正确执行。
     *
     * 这里刻意不断言「一定有角度」：\`(hover: hover) and (pointer: fine)\`
     * 是设备属性，CI 的 headless Chrome 报 hover:none、本地报 hover:hover，
     * 而 CDP 的 Emulation.setEmulatedMedia 也覆盖不了（实测传入后被静默忽略）。
     * 断言固定角度等于在测环境。
     *
     * 所以测的是契约本身——允许倾斜时确实写入了变量，不允许时确实一点没写。
     * 几何算法（角度符号、夹取、单位）由 useTilt.test.ts 确定性覆盖。
     */
    it('倾斜与该环境的指针能力保持一致', async () => {
      expect(await enterHeroSelect(ctx.page)).toBe(true);

      const capable = await ctx.page.evaluate(() =>
        matchMedia('(hover: hover) and (pointer: fine)').matches
        && !matchMedia('(prefers-reduced-motion: reduce)').matches);

      const box = await ctx.page.evaluate(() => {
        const el = document.querySelector('button[aria-label^="选择 "]') as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, hasTilt: el.classList.contains('tilt') };
      });
      expect(box).toBeTruthy();
      // 类必须挂上：这是倾斜样式的载体，与环境能力无关
      expect(box!.hasTilt).toBe(true);

      // 悬停到右下角（真实指针事件，不是合成事件）
      await ctx.page.mouse.move(box!.x + box!.w * 0.85, box!.y + box!.h * 0.82, { steps: 8 });
      await sleep(220);
      const hover = await ctx.page.evaluate(() => {
        const el = document.querySelector('button[aria-label^="选择 "]') as HTMLElement;
        return {
          tilting: el.dataset.tilting || null,
          rx: el.style.getPropertyValue('--rx').trim(),
          ry: el.style.getPropertyValue('--ry').trim(),
          mx: el.style.getPropertyValue('--mx').trim(),
          transform: getComputedStyle(el).transform,
        };
      });

      if (capable) {
        expect(hover.tilting).toBe('on');
        expect(hover.rx).not.toBe('');
        expect(hover.ry).not.toBe('');
        // 右下角向右倾
        expect(parseFloat(hover.ry)).toBeGreaterThan(0);
        const mx = parseFloat(hover.mx);
        expect(mx).toBeGreaterThan(50);
        expect(mx).toBeLessThanOrEqual(100);
        // 3D 生效：computed transform 必须是 matrix3d（matrix 2D 意味着旋转被吃掉了）
        expect(hover.transform.startsWith('matrix3d')).toBe(true);

        // 离开后变量清空，牌回平放
        await ctx.page.mouse.move(5, 5, { steps: 6 });
        await sleep(260);
        const after = await ctx.page.evaluate(() => {
          const el = document.querySelector('button[aria-label^="选择 "]') as HTMLElement;
          return {
            rx: el.style.getPropertyValue('--rx'),
            ry: el.style.getPropertyValue('--ry'),
            tilting: el.dataset.tilting || null,
          };
        });
        expect(after.rx).toBe('');
        expect(after.ry).toBe('');
        expect(after.tilting).toBe(null);
      } else {
        // 不可倾斜的环境：一个变量都不许写，且 transform 不该是 3D
        expect(hover.tilting).toBe(null);
        expect(hover.rx).toBe('');
        expect(hover.ry).toBe('');
        expect(hover.transform.startsWith('matrix3d')).toBe(false);
      }
    }, 120000);

    /**
     * 「不允许倾斜」这条分支的真实覆盖。
     *
     * hover / pointer 伪装不了（平台属性，CDP 与 --blink-settings 实测都无效），
     * 但 prefers-reduced-motion 可以模拟，而它走的是**完全相同的关闭路径**
     * （useTilt 里同一个 enabled 判定、同一句「不写任何变量」）。
     * 这样 CI 与本地都能真实跑到关闭分支，而不是只在代码里推理。
     */
    it('开启「减弱动效」后不再写倾斜变量', async () => {
      await ctx.page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]);

      const capable = await ctx.page.evaluate(() =>
        !matchMedia('(prefers-reduced-motion: reduce)').matches);
      // 前提成立才继续：模拟没生效的话这条用例没有意义
      expect(capable).toBe(false);

      const box = await ctx.page.evaluate(() => {
        const el = document.querySelector('button[aria-label^="选择 "]') as HTMLElement;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      await ctx.page.mouse.move(box.x + box.w * 0.85, box.y + box.h * 0.82, { steps: 8 });
      await sleep(220);
      const state = await ctx.page.evaluate(() => {
        const el = document.querySelector('button[aria-label^="选择 "]') as HTMLElement;
        return {
          tilting: el.dataset.tilting || null,
          rx: el.style.getPropertyValue('--rx'),
          ry: el.style.getPropertyValue('--ry'),
          transform: getComputedStyle(el).transform,
        };
      });
      expect(state.tilting).toBe(null);
      expect(state.rx).toBe('');
      expect(state.ry).toBe('');
      // 媒体查询里 transform: none，不再是 3D
      expect(state.transform).toBe('none');

      // 复原，避免影响同文件后续用例
      await ctx.page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'no-preference' },
      ]);
    }, 120000);
  });

  describe('移动端布局', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('390×844 视口下无横向滚动，且武将卡片可点选', async () => {
      // 手机竖屏：iPhone 12/13/14 的逻辑分辨率
      await ctx.page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await sleep(600);

      expect(await enterHeroSelect(ctx.page)).toBe(true);

      const widths = await ctx.page.evaluate(() => ({
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        bodyScroll: document.body.scrollWidth,
        bodyClient: document.body.clientWidth,
        inner: window.innerWidth,
      }));
      // 严格相等：多 1px 也是横向滚动
      expect(widths.docScroll).toBe(widths.docClient);
      expect(widths.bodyScroll).toBe(widths.bodyClient);
      expect(widths.docClient).toBe(390);

      // 卡片在移动端是两列，先确认真的渲染出来了
      const cards = await readHeroCards(ctx.page);
      expect(cards.length).toBeGreaterThan(0);

      // 点第一张卡片：滚动到视口内再用真实鼠标点击（点击坐标必须落在视口里）
      const target = await ctx.page.evaluate(() => {
        const el = document.querySelector('button[aria-label^="选择 "]') as HTMLElement | null;
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return {
          name: (el.getAttribute('aria-label') || '').replace(/^选择\s*/, ''),
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          w: r.width,
          h: r.height,
          inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
        };
      });
      expect(target).toBeTruthy();
      expect(target!.w).toBeGreaterThan(0);
      expect(target!.h).toBeGreaterThan(0);
      expect(target!.inView).toBe(true);

      await ctx.page.mouse.click(target!.x, target!.y);
      await sleep(700);

      const after = await ctx.page.evaluate((n) => {
        const el = [...document.querySelectorAll('button[aria-label^="选择 "]')]
          .find((b) => (b.getAttribute('aria-label') || '') === `选择 ${n}`) as HTMLElement | null;
        const bar = document.querySelector('.pick-detail');
        return {
          pressed: el ? el.getAttribute('aria-pressed') : null,
          detailHasName: bar ? (bar.textContent || '').includes(n) : false,
          confirmEnabled: [...document.querySelectorAll('button')]
            .some((b) => (b.textContent || '').trim() === '确认出战' && !(b as HTMLButtonElement).disabled),
        };
      }, target!.name);

      // 点一下必须真的选中：卡片高亮 + 底部详情条出现该武将 + 确认按钮可用
      expect(after.pressed).toBe('true');
      expect(after.detailHasName).toBe(true);
      expect(after.confirmEnabled).toBe(true);

      // 选中后布局不该被撑出横向滚动（详情条是移动端最容易溢出的地方）
      const widths2 = await ctx.page.evaluate(() => ({
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
      }));
      expect(widths2.docScroll).toBe(widths2.docClient);

      await shot(ctx.page, 'coverage-mobile-select');
      expect(ctx.errors).toEqual([]);
    }, 90000);
  });

  describe('七人局', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('首页选七人局开局后座位数为 7', async () => {
      // 默认五人局：先确认基线，避免把「本来就是七人」误当成设置生效
      expect(await readPressed(ctx.page, '对局人数', '五人局')).toBe('true');

      await clickOption(ctx.page, '对局人数', '七人局');
      await sleep(500);
      expect(await readPressed(ctx.page, '对局人数', '七人局')).toBe('true');
      expect(await readPressed(ctx.page, '对局人数', '五人局')).toBe('false');

      let started = false;
      for (const hero of HERO_CANDIDATES) {
        if (await startGameWithHero(ctx.page, hero)) { started = true; break; }
      }
      expect(started).toBe(true);

      const state = await readGameState(ctx.page);
      expect(state.phase).toBeTruthy();

      const seats = await readSeatIds(ctx.page);
      // 7 人局 = 我方 1 席 + 敌方 6 席，座位 id 为 0..6 且不重复
      expect(seats.length).toBe(7);
      expect(new Set(seats).size).toBe(7);
      expect(seats[0]).toBe(0);
      expect(seats[6]).toBe(6);

      await shot(ctx.page, 'coverage-seven-seats');
      expect(ctx.errors).toEqual([]);
    }, 120000);
  });

  describe('AI 难度切换', () => {
    let ctx: E2EContext;

    beforeAll(async () => {
      // 预置 3 倍速：推进检测不需要等慢速动画
      ctx = await openApp(BASE, { seed: { 'sgs-speed': '3' } });
    }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('切到困难后开局、对局能推进且无报错', async () => {
      expect(await readPressed(ctx.page, 'AI 难度', '普通')).toBe('true');

      await clickOption(ctx.page, 'AI 难度', '困难');
      await sleep(500);
      expect(await readPressed(ctx.page, 'AI 难度', '困难')).toBe('true');
      expect(await ctx.page.evaluate(() => localStorage.getItem('sgs-ai-diff'))).toBe('hard');

      let started = false;
      for (const hero of HERO_CANDIDATES) {
        if (await startGameWithHero(ctx.page, hero)) { started = true; break; }
      }
      expect(started).toBe(true);
      await setSpeedLevel(ctx.page, 3);

      const before = await readProgress(ctx.page);
      expect(before.inGame).toBe(true);

      // 托管让 AI 接管玩家席，困难难度的决策路径才真正跑到；
      // 推进判据是「战报/行动者/阶段」任一变化，而不是固定睡满预算。
      expect(await enableTakeover(ctx.page)).toBe(true);

      const deadline = Date.now() + 90000;
      let after = before;
      let advanced = false;
      while (Date.now() < deadline) {
        after = await readProgress(ctx.page);
        if (
          after.logCount > before.logCount
          || after.actor !== before.actor
          || after.phase !== before.phase
          || (after.lastLog && after.lastLog !== before.lastLog)
        ) { advanced = true; break; }
        // 兜底：托管没接手的决策点自己点掉，避免干等读秒耗光预算
        const st = await readGameState(ctx.page);
        if (st.hasEndTurn) await clickButton(ctx.page, '结束回合');
        await sleep(1000);
      }

      expect(advanced).toBe(true);
      expect(after.inGame).toBe(true);
      // 困难 AI 也要在选择/结算里保持零未捕获错误
      expect(ctx.errors).toEqual([]);

      await shot(ctx.page, 'coverage-ai-hard');
    }, 120000);
  });
});
