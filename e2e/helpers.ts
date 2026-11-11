import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 端到端测试辅助。
 *
 * 为什么不用 puppeteer 完整包：那会下载一份 Chromium（约 150MB），CI 上没必要。
 * 这里用 puppeteer-core + 系统 Chrome，浏览器路径可通过 E2E_CHROME 覆盖。
 */

export const CHROME_PATH =
  process.env.E2E_CHROME ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome');

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface E2EContext {
  browser: Browser;
  page: Page;
  errors: string[];
  close: () => Promise<void>;
}

export interface OpenAppOptions {
  /** 载入前写入的 localStorage（如 sgs-speed / sgs-theme），用于免去 UI 上多步点选 */
  seed?: Record<string, string>;
}

export const openApp = async (baseUrl: string, opts: OpenAppOptions = {}): Promise<E2EContext> => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('pageerror: ' + msg.slice(0, 160));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  if (opts.seed) {
    // 必须在导航之前注册，否则模块初始化时已经读过 localStorage
    await page.evaluateOnNewDocument((kv) => {
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    }, opts.seed);
  }
  await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(1200);
  return { browser, page, errors, close: async () => { await browser.close(); } };
};

export const clickButton = (page: Page, txt: string) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === t);
    if (el) { (el as HTMLButtonElement).click(); return true; }
    return false;
  }, txt);

export const startGameWithHero = async (page: Page, heroName: string): Promise<boolean> => {
  await clickButton(page, '点兵出征');
  await sleep(1200);
  await page.evaluate((h) => {
    const i = document.querySelector('input');
    if (!i) return;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    set.call(i, h);
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }, heroName);
  await sleep(1500);
  const picked = await page.evaluate((h) => {
    const el = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === '选择 ' + h,
    );
    if (el) { (el as HTMLButtonElement).click(); return true; }
    return false;
  }, heroName);
  if (!picked) return false;
  await sleep(900);
  const pos = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '确认出战');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!pos) return false;
  await page.mouse.click(pos.x, pos.y);
  await sleep(3800);
  return true;
};

export const readGameState = (page: Page) =>
  page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      myTurn: txt.includes('我的回合'),
      phase: (txt.match(/当前阶段\s*·\s*(\S+)/) || [])[1] || null,
      hasEndTurn: [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === '结束回合'),
      hasIntro: !!document.querySelector('.battle-intro'),
    };
  });

export const waitForSkillDialog = async (
  page: Page,
  timeoutMs = 20000,
): Promise<{ label: string; text: string } | null> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const d = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role=dialog]')].find(
        (x) => ((x.getAttribute('aria-label') || '')).endsWith('选择'),
      );
      return el
        ? { label: el.getAttribute('aria-label') || '', text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 160) }
        : null;
    });
    if (d) return d;
    await sleep(600);
  }
  return null;
};

/**
 * 点掉当前弹窗的“取消”按钮。
 *
 * 取消按钮的文案是按技能定制的（cancelLabel），例如蜜饴是「改为造成伤害」、
 * 约俭是「交给系统自动弃牌」，所以先按已知文案匹配。
 *
 * 匹配不上时退回“弹窗里最后一个非确认按钮”。注意不能取第一个：target / card
 * 模式下弹窗主体全是目标按钮和牌按钮，取第一个等于选了目标，弹窗不会关闭
 * （实测「改为造成伤害」被漏掉时就会这样）。取消键渲染在主体之后、
 * 确认键之前，因此“最后一个非确认按钮”才是它。
 */
export const dismissDialog = (page: Page) =>
  page.evaluate(() => {
    const texts = ['不发动', '取消', '不弃置', '不交换', '不造成伤害', '放弃', '关闭'];
    const btns = [...document.querySelectorAll('button')];
    for (const t of texts) {
      const b = btns.find((x) => (x.textContent || '').trim() === t);
      if (b) { (b as HTMLButtonElement).click(); return t; }
    }
    const dialog = [...document.querySelectorAll('[role=dialog]')].find((x) =>
      ((x.getAttribute('aria-label') || '')).endsWith('选择'),
    );
    if (!dialog) return null;
    const confirmTexts = ['确认选择', '确认目标', '确认猜测'];
    const cancel = [...dialog.querySelectorAll('button')]
      .filter((x) => !confirmTexts.includes((x.textContent || '').trim()))
      .pop();
    if (!cancel) return null;
    (cancel as HTMLButtonElement).click();
    return (cancel.textContent || '').trim();
  });

export const shot = async (page: Page, name: string): Promise<string> => {
  const dir = path.resolve(__dirname, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name + '.png');
  await page.screenshot({ path: p as `${string}.png` });
  return p;
};

// ---------------------------------------------------------------------------
// 下列辅助供 e2e/flows.e2e.test.ts 使用：覆盖「打完一局 / 弃牌 / 技能弹窗 /
// 读档 / 主题」这些玩家真实会走、但单测覆盖不到的路径。
// ---------------------------------------------------------------------------

/** 候补武将：选将池随查询词变化，逐个尝试直到某一局成功开局 */
export const HERO_CANDIDATES = ['曹轶', '孙鲁班', '孙尚香', '大乔', '花鬘', '甘宁', '赵云'];

/** 把游戏速度切到目标档（顶部按钮循环 1→2→3→1），返回切换后读到的档位 */
export const setSpeedLevel = async (page: Page, level: 1 | 2 | 3): Promise<number> => {
  for (let i = 0; i < 4; i++) {
    const cur = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label^="切换游戏速度"]');
      const m = (b?.getAttribute('aria-label') || '').match(/(\d)\s*倍/);
      return m ? Number(m[1]) : null;
    });
    if (cur === level) return cur;
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label^="切换游戏速度"]');
      if (b) { (b as HTMLButtonElement).click(); return true; }
      return false;
    });
    if (!clicked) return cur ?? -1;
    await sleep(320);
  }
  return (await page.evaluate(() => {
    const b = document.querySelector('button[aria-label^="切换游戏速度"]');
    const m = (b?.getAttribute('aria-label') || '').match(/(\d)\s*倍/);
    return m ? Number(m[1]) : -1;
  }));
};

/** 开启托管（由 AI 代打），返回 aria-pressed 是否已为 true */
export const enableTakeover = async (page: Page): Promise<boolean> => {
  const pressed = await page.evaluate(() => {
    const b = document.querySelector('button[data-tour=takeover]');
    if (!b) return null;
    if (b.getAttribute('aria-pressed') !== 'true') { (b as HTMLButtonElement).click(); }
    return b.getAttribute('aria-pressed');
  });
  await sleep(600);
  const now = await page.evaluate(
    () => document.querySelector('button[data-tour=takeover]')?.getAttribute('aria-pressed') ?? null,
  );
  return pressed !== null && now === 'true';
};

/** 结算界面是否已出现 */
export const isGameOver = (page: Page) =>
  page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      over: txt.includes('再来一局') && txt.includes('获胜方'),
      winner: (txt.match(/获胜方：\s*(\S+)/) || [])[1] || null,
    };
  });

/** 弃牌阶段提示：需弃置 N 张 / 已选 M 张 */
export const readDiscardPrompt = (page: Page) =>
  page.evaluate(() => {
    const txt = document.body.innerText;
    const excess = (txt.match(/需弃置\s*(\d+)\s*张/) || [])[1];
    const picked = (txt.match(/已选\s*(\d+)\s*张/) || [])[1];
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === '弃 牌',
    ) as HTMLButtonElement | undefined;
    return {
      excess: excess === undefined ? null : Number(excess),
      picked: picked === undefined ? null : Number(picked),
      hasDiscardButton: !!btn,
      discardEnabled: !!btn && !btn.disabled,
    };
  });

/** 当前处于高亮的阶段名（回合/判定/摸牌/出牌/弃牌/结束），非对局界面返回 null */
export const readActivePhase = (page: Page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('.phase-step')].find(
      (e) => e.getAttribute('data-state') === 'active',
    );
    return el ? (el.textContent || '').trim() : null;
  });

/** 当前阶段的行动者名（阶段面板上的 .phase-panel-name；非对局界面返回 null） */
export const readActivePlayer = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.phase-panel-name');
    return el ? (el.textContent || '').trim() : null;
  });

/** 主题状态：<html> 的 class 与 color-scheme */
export const readTheme = (page: Page) =>
  page.evaluate(() => ({
    cls: document.documentElement.className,
    light: document.documentElement.classList.contains('theme-light'),
    colorScheme: document.documentElement.style.colorScheme,
    stored: localStorage.getItem('sgs-theme'),
  }));

/** 点主题按钮；aria-label 随主题变化（白天/黑夜） */
export const clickThemeToggle = async (page: Page): Promise<boolean> => {
  const ok = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label^="切换到"]');
    if (b) { (b as HTMLButtonElement).click(); return true; }
    return false;
  });
  await sleep(450);
  return ok;
};

