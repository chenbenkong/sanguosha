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

export const openApp = async (baseUrl: string): Promise<E2EContext> => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
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

export const dismissDialog = (page: Page) =>
  page.evaluate(() => {
    const texts = ['不发动', '取消', '不弃置', '不交换', '不造成伤害', '放弃', '关闭'];
    const btns = [...document.querySelectorAll('button')];
    for (const t of texts) {
      const b = btns.find((x) => (x.textContent || '').trim() === t);
      if (b) { (b as HTMLButtonElement).click(); return t; }
    }
    return null;
  });

export const shot = async (page: Page, name: string): Promise<string> => {
  const dir = path.resolve(__dirname, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name + '.png');
  await page.screenshot({ path: p as `${string}.png` });
  return p;
};