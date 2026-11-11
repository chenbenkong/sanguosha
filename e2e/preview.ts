import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

/**
 * e2e 预览服务管理。
 *
 * 为什么需要它：早期各 e2e 文件各自硬编码端口（7300/7301/7452），
 * 一旦该端口被别的工作区残留的 vite preview 占着，vite 会静默换口，
 * 测试就连到**别人的构建产物**上——红绿都不代表本仓库。
 *
 * 这里的做法：
 *  1. 默认向系统要一个空闲端口（E2E_PORT 可覆盖）
 *  2. 若端口上已有服务，校验它服务的入口 chunk 是否等于本地 dist 的
 *     不一致直接报错，绝不静默对着别人的产物跑
 */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 向系统要一个当前空闲的端口（绑定 0 取实际端口后立刻释放） */
export const pickFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('无法分配空闲端口'))));
    });
  });

/** 构建产物里的入口文件名（形如 index-XXXXXXXX.js），用来确认「这个端口是我起的」 */
export const readLocalEntryAsset = (): string | null => {
  const indexHtml = path.resolve(process.cwd(), 'dist', 'index.html');
  if (!fs.existsSync(indexHtml)) return null;
  const html = fs.readFileSync(indexHtml, 'utf8');
  const m = html.match(/(?:assets\/js\/)?(index-[A-Za-z0-9_-]{6,}\.js)/);
  return m ? m[1] : null;
};

/** 该端口上现在是否真有一个 http 服务在应答 */
export const isPortServing = async (base: string): Promise<boolean> => {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};

export interface PreviewHandle {
  base: string;
  /** 需要显式停止时调用（beforeAll 里起的才需要） */
  stop: () => void;
}

/**
 * 起一个指向本地 dist 的预览服务。
 * @param opts.dev 为 true 时用 vite dev（探针需要 import.meta.env.DEV）
 */
export const startPreview = async (opts: { dev?: boolean } = {}): Promise<PreviewHandle> => {
  const localAsset = readLocalEntryAsset();
  if (!opts.dev && !localAsset) {
    throw new Error('缺少 dist 构建产物，请先执行 npx vite build --base=./');
  }

  let port = Number(process.env.E2E_PORT) || 0;
  if (!port) port = await pickFreePort();
  const base = `http://127.0.0.1:${port}/`;

  if (await isPortServing(base)) {
    if (opts.dev) return { base, stop: () => {} };
    const html = await (await fetch(base)).text();
    const served = (html.match(/(?:assets\/js\/)?(index-[A-Za-z0-9_-]{6,}\.js)/) || [])[1];
    if (served !== localAsset) {
      throw new Error(
        `端口 ${port} 已被其它构建产物占用（${served ?? '未知'}，本地 ${localAsset}）。` +
        '可结束残留的 vite preview，或不设 E2E_PORT 让测试自选空闲端口。',
      );
    }
    return { base, stop: () => {} };
  }

  const args = opts.dev
    ? ['vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort']
    : ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1'];
  const server: ChildProcess = spawn('npx', args, {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
  });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isPortServing(base)) {
      return {
        base,
        stop: () => { try { server.kill(); } catch { /* already dead */ } },
      };
    }
    await sleep(700);
  }
  try { server.kill(); } catch { /* ignore */ }
  throw new Error('预览服务在 60 秒内未就绪');
};