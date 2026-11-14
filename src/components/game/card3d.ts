/**
 * 3D 卡牌引擎（图鉴站 SGKCard3D）的按需加载与能力探测。
 *
 * 引擎本体是 public/vendor/card3d.js（510,839 字节 / 约 499 KiB 的 WebGL 渲染器，
 * 含 three.js 与镭射着色器），来自 chenbenkong/sanguosha-cards 的 vendor/card3d.js。
 *
 * 三条刻意的设计：
 *
 *  1. **用 <script> 按需注入，不进打包产物**。它有 511 KB 且只在打开卡牌
 *     查看器时才需要，塞进 bundle 会让每个首屏用户都付这份钱。
 *  2. **单例 Promise**。同一时刻可能有两个查看器（详情弹层 + 放大灯箱），
 *     但脚本只该注入一次；并发调用共享同一个 loading Promise。
 *  3. **失败一律降级，绝不抛错**。WebGL2 不可用、脚本 404、超时、create()
 *     抛异常——任一情况都返回 null，由调用方回退到静态卡图。卡牌是装饰，
 *     不能因为它而让整页白屏。
 *
 * 关于 headless：本机实测默认参数的 headless Chrome 也能拿到 WebGL2
 * （SwiftShader 软渲染），但 CI runner 不保证，所以降级路径必须真的能用，
 * e2e 也只断言「要么出画布、要么回退成功」，不断言必须有 WebGL。
 */

/** 引擎实例暴露的方法（对 bundle 实测枚举得到，非猜测） */
export interface Card3DInstance {
  setMount(el: HTMLElement | null): void;
  setCard(img: HTMLImageElement, meta: Card3DMeta | ''): void;
  setTheme(theme: string): void;
  setFoil(on: boolean): void;
  setHover(): void;
  clearHover(): void;
  dragStart(): void;
  /** 传本次指针相对上一次的位移（px），不是绝对坐标 */
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  flip(): void;
  reset(): void;
  dispose(): void;
  resize(): void;
}

/** 卡背显示的元信息 */
export interface Card3DMeta {
  name: string;
  faction?: string;
  no?: string;
}

export interface Card3DCreateOptions {
  /** 挂载点；null 表示先建实例、稍后 setMount */
  mount?: HTMLElement | null;
  theme?: string;
  /** 画布是否吃指针事件 */
  interactive?: boolean;
  /** 允许一路转到背面 */
  freeSpin?: boolean;
  /** 装裱内边（相对卡面的放大比例，引擎默认 1.14） */
  fit?: number;
  /** 贴图最长边上限（超过则等比缩小；0 = 不限制） */
  maxTexWidth?: number;
  /** 入场动画（尊重 prefers-reduced-motion） */
  entrance?: boolean;
  canvasClass?: string;
  onReady?: () => void;
  onInteract?: () => void;
}

interface Card3DEngine {
  create(options: Card3DCreateOptions): Card3DInstance;
}

declare global {
  interface Window {
    SGKCard3D?: Card3DEngine;
  }
}

/** 脚本地址跟随构建 base（生产是 './'，开发是 '/'），不硬编码绝对路径 */
const SCRIPT_URL = `${import.meta.env.BASE_URL}vendor/card3d.js`;

/** 引擎就绪前的加载 Promise；失败后置为 null 以便下次重试 */
let pending: Promise<Card3DEngine | null> | null = null;

/** 加载超时。511 KB 在慢网下也要给够时间，但不能无限等 */
const LOAD_TIMEOUT_MS = 20000;

/**
 * WebGL2 是否可用。
 *
 * 先探测再注入脚本：没有 WebGL2 时连 511 KB 都不必下载。注意用完要主动
 * 释放探测用的上下文——浏览器对同时存在的 WebGL 上下文数量有上限
 * （通常 16 个），探测时泄漏一个就少一个。
 */
export const webgl2Available = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
};

const injectScript = (): Promise<Card3DEngine | null> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    if (window.SGKCard3D) {
      resolve(window.SGKCard3D);
      return;
    }

    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;

    let settled = false;
    const finish = (value: Card3DEngine | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    el.onload = () => finish(window.SGKCard3D ?? null);
    // 404 / 网络错误：静默降级，不往控制台抛（e2e 会把 console.error 当失败）
    el.onerror = () => finish(null);
    document.head.appendChild(el);
  });

/** 加载引擎；失败返回 null（调用方回退静态卡图） */
export const loadCard3D = (): Promise<Card3DEngine | null> => {
  if (!pending) {
    pending = injectScript().then((engine) => {
      // 拿不到引擎就把缓存清掉，下次还有机会重试（例如网络恢复）
      if (!engine) pending = null;
      return engine;
    });
  }
  return pending;
};

/** 仅供测试：重置单例缓存 */
export const __resetCard3DForTest = (): void => {
  pending = null;
};
