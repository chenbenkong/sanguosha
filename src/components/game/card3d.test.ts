import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetCard3DForTest, loadCard3D, webgl2Available } from './card3d';

/**
 * 3D 卡牌引擎加载层的契约测试。
 *
 * 为什么自己在 node 环境里搭一个最小 DOM，而不是引 jsdom：这个模块真正碰到的
 * 浏览器面只有三处——document.createElement、document.head.appendChild、
 * window.SGKCard3D。jsdom 会带进来一整套 DOM 与它自己的脚本加载语义，
 * 反而让「到底注入了几个 <script>」这种断言说不清；这里的替身只实现这三处，
 * 「注入几次」就是往数组里 push 几次。
 *
 * 每个用例前先 __resetCard3DForTest()：模块里的 pending 是模块级单例，
 * 不清就会把上一条用例的缓存带进下一条（这本身就是被测契约的一部分）。
 */

/** 被测代码真正用到的 script 元素成员（其余成员它从不碰） */
interface FakeScript {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

interface FakeDom {
  win: { SGKCard3D?: unknown };
  /** createElement('script') 造出来的每个元素 */
  created: FakeScript[];
  /** 真正被 appendChild 进 head 的元素（= 真被注入的脚本） */
  appended: FakeScript[];
}

/**
 * 装一个最小 document / window。
 *
 * gl 传对象 = 画布能拿到 webgl2 上下文；不传 = getContext('webgl2') 返回 null。
 * engine 传对象 = window.SGKCard3D 已就绪（脚本早已注入过的那种页面）。
 */
const installFakeDom = (opts: { engine?: unknown; gl?: unknown } = {}): FakeDom => {
  const created: FakeScript[] = [];
  const appended: FakeScript[] = [];
  const win: { SGKCard3D?: unknown } = {};
  if (opts.engine !== undefined) win.SGKCard3D = opts.engine;

  const gl = opts.gl ?? null;
  vi.stubGlobal('document', {
    createElement: (tag: string): unknown => {
      if (tag === 'canvas') {
        return { getContext: (type: string) => (type === 'webgl2' ? gl : null) };
      }
      if (tag === 'script') {
        const el: FakeScript = { src: '', async: false, onload: null, onerror: null };
        created.push(el);
        return el;
      }
      // 加载层只该造 canvas 与 script；造别的说明实现跑偏了，直接红
      throw new Error(`被测代码不该创建 <${tag}>`);
    },
    head: { appendChild: (el: FakeScript): void => { appended.push(el); } },
  });
  vi.stubGlobal('window', win);
  return { win, created, appended };
};

/** 触发第 index 个已注入脚本的生命周期回调（0 基） */
const settle = (dom: FakeDom, index: number, how: 'load' | 'error'): void => {
  const el = dom.appended[index];
  if (!el) throw new Error(`第 ${index + 1} 个 <script> 从未被注入`);
  if (how === 'load') el.onload?.();
  else el.onerror?.();
};

/** 模块内部未导出的引擎类型：从 loadCard3D 的返回签名里取 */
type LoadedEngine = NonNullable<Awaited<ReturnType<typeof loadCard3D>>>;

const fakeEngine = (): LoadedEngine => ({ create: () => ({}) }) as unknown as LoadedEngine;

beforeEach(() => { __resetCard3DForTest(); });

afterEach(() => {
  __resetCard3DForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('webgl2Available', () => {
  it('拿不到 webgl2 上下文时返回 false，也不去注入 510KB 的引擎脚本', () => {
    const dom = installFakeDom({ gl: null });

    expect(webgl2Available()).toBe(false);
    // 探测只用 canvas：没能力时连 <script> 都不该造出来
    expect(dom.created).toEqual([]);
    expect(dom.appended).toEqual([]);
  });

  it('拿到 webgl2 上下文时返回 true，并主动释放探测用的上下文', () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));
    installFakeDom({ gl: { getExtension } });

    expect(webgl2Available()).toBe(true);
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    // 浏览器同时存在的 WebGL 上下文有上限（通常 16 个），探测泄漏一个就少一个
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('有 webgl2 但没有 WEBGL_lose_context 扩展时仍然算可用', () => {
    installFakeDom({ gl: { getExtension: () => null } });

    expect(webgl2Available()).toBe(true);
  });

  it('没有 document（SSR / 非浏览器环境）时返回 false 而不是抛错', () => {
    expect(webgl2Available()).toBe(false);
  });
});

describe('loadCard3D', () => {
  it('没有 document 时返回 null，且不注入任何脚本', async () => {
    await expect(loadCard3D()).resolves.toBe(null);
  });

  it('window.SGKCard3D 已存在时直接复用，不再注入 <script>', async () => {
    const engine = fakeEngine();
    const dom = installFakeDom({ engine });

    await expect(loadCard3D()).resolves.toBe(engine);
    expect(dom.created).toEqual([]);
    expect(dom.appended).toEqual([]);

    // 反复调用也始终是同一个引擎对象，不会重新走一遍注入
    await expect(loadCard3D()).resolves.toBe(engine);
    expect(dom.created).toEqual([]);
  });

  it('连续两次 loadCard3D() 只注入一个 <script>，并发调用共享同一个 Promise', async () => {
    const dom = installFakeDom();
    const engine = fakeEngine();

    const first = loadCard3D();
    const second = loadCard3D();

    // 单例契约：不是「恰好注入一次」，而是两次调用拿到同一个 Promise
    expect(second).toBe(first);
    expect(dom.created).toHaveLength(1);
    expect(dom.appended).toHaveLength(1);

    // 脚本就位后两个调用方都拿到同一个引擎
    dom.win.SGKCard3D = engine;
    settle(dom, 0, 'load');
    await expect(first).resolves.toBe(engine);
    await expect(second).resolves.toBe(engine);
  });

  it('注入的脚本指向 base 下的 vendor/card3d.js，并带 async', async () => {
    const dom = installFakeDom();

    void loadCard3D();

    expect(dom.appended).toHaveLength(1);
    expect(dom.appended[0].src).toMatch(/\/vendor\/card3d\.js$/);
    expect(dom.appended[0].async).toBe(true);
  });

  it('成功加载后再调用命中缓存，不再注入第二个 <script>', async () => {
    const dom = installFakeDom();
    const engine = fakeEngine();

    const first = loadCard3D();
    dom.win.SGKCard3D = engine;
    settle(dom, 0, 'load');
    await expect(first).resolves.toBe(engine);

    await expect(loadCard3D()).resolves.toBe(engine);
    expect(dom.created).toHaveLength(1);
  });

  it('脚本 onerror（404 / 网络错误）时返回 null，不抛错', async () => {
    const dom = installFakeDom();

    const p = loadCard3D();
    settle(dom, 0, 'error');

    await expect(p).resolves.toBe(null);
    expect(dom.created).toHaveLength(1);
  });

  it('脚本 onload 了但引擎没挂到 window 上，同样降级为 null', async () => {
    const dom = installFakeDom();

    const p = loadCard3D();
    settle(dom, 0, 'load');

    await expect(p).resolves.toBe(null);
  });

  it('失败之后缓存已清：再次调用会重新注入（网络恢复后还能起来）', async () => {
    const dom = installFakeDom();
    const engine = fakeEngine();

    const failed = loadCard3D();
    settle(dom, 0, 'error');
    await expect(failed).resolves.toBe(null);
    expect(dom.created).toHaveLength(1);

    // 第二次是全新的尝试，而不是复用上一次失败的结果
    const retry = loadCard3D();
    expect(dom.created).toHaveLength(2);
    expect(retry).not.toBe(failed);

    dom.win.SGKCard3D = engine;
    settle(dom, 1, 'load');
    await expect(retry).resolves.toBe(engine);
  });

  it('20 秒超时仍未就绪时返回 null，并清掉缓存以便重试', async () => {
    vi.useFakeTimers();
    const dom = installFakeDom();

    const p = loadCard3D();
    await vi.advanceTimersByTimeAsync(20000);

    await expect(p).resolves.toBe(null);

    // 超时也走「失败即清缓存」：下一次调用重新注入
    void loadCard3D();
    expect(dom.created).toHaveLength(2);
  });
});
