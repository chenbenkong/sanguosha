// 一次性「dist 可运行性」检查：不引入浏览器依赖，只用 fetch。
// 自己拉起 `vite preview`，轮询端口，逐一 fetch index.html / JS / CSS，最后强制收掉子进程。
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.argv[2] ?? 4301);
const BASE = `http://127.0.0.1:${PORT}/`;
const isWin = process.platform === 'win32';

const child = spawn(
  isWin ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], shell: isWin },
);
let serverLog = '';
child.stdout.on('data', d => (serverLog += d));
child.stderr.on('data', d => (serverLog += d));

function shutdown() {
  if (child.killed || child.exitCode !== null) return;
  if (isWin) {
    // 杀掉整个进程树，避免 npx.cmd -> vite 的子进程残留
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });

async function waitUp(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return Date.now() - started;
    } catch { /* 还没起来 */ }
    await delay(500);
  }
  throw new Error(`vite preview 未在 ${timeoutMs}ms 内就绪\n--- log ---\n${serverLog}`);
}

async function get(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type'), bytes: buf.length, text: buf.toString('utf8') };
}

let failed = 0;
try {
  const upMs = await waitUp();
  console.log('SERVER_UP_MS', upMs);

  const index = await get(BASE);
  console.log('INDEX', JSON.stringify({ status: index.status, type: index.type, bytes: index.bytes }));
  if (index.status !== 200 || index.bytes === 0) failed++;

  const refs = [...index.text.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m => m[1]);
  console.log('REFS', JSON.stringify(refs));

  for (const ref of refs) {
    const r = await get(new URL(ref, BASE).href);
    const ok = r.status === 200 && r.bytes > 0;
    if (!ok) failed++;
    console.log('ASSET', JSON.stringify({ ref, status: r.status, type: r.type, bytes: r.bytes, ok }));
  }

  const mainJs = refs.find(r => /\/index-[^/]*\.js$/.test(r));
  if (!mainJs) {
    console.log('MAIN_JS', 'not found');
    failed++;
  } else {
    const r = await get(new URL(mainJs, BASE).href);
    const hasMarker = r.text.includes('sgs-');
    if (!hasMarker) failed++;
    console.log('MAIN_JS', JSON.stringify({ ref: mainJs, bytes: r.bytes, hasAppMarker: hasMarker }));
  }

  const css = refs.find(r => r.endsWith('.css'));
  if (css) {
    const r = await get(new URL(css, BASE).href);
    console.log('CSS_BYTES', r.bytes);
  }
} catch (e) {
  console.log('ERROR', e.message);
  failed++;
} finally {
  shutdown();
}

console.log('RESULT', failed === 0 ? 'ALL_200' : `FAILURES=${failed}`);
// 给 taskkill 一点时间落地再退出
await delay(500);
process.exit(failed === 0 ? 0 : 1);
