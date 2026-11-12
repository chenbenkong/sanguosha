import { useCallback, useEffect, useRef } from 'react';

/**
 * 卡牌 3D 倾斜 + 光斑跟随。
 *
 * 参照 chenbenkong/sanguosha-cards 图鉴站的做法：指针位置换算成
 * `--mx / --my`（光斑坐标）与 `--rx / --ry`（旋转角），只写 CSS 变量，
 * 不触发 React 重渲染——选将页一屏最多 24 张卡，用 state 存角度会让每次
 * 指针移动都重渲染整页。
 *
 * 三处刻意如此：
 *  1. 只在精确指针上启用（hover:hover + pointer:fine）。触屏没有「悬停」，
 *     手指按上去触发一次倾斜再弹回，只会让人以为卡了。
 *  2. 尊重 prefers-reduced-motion：系统开了减弱动效就完全不挂手势。
 *  3. 时间戳节流 16ms（约 60fps）而不是 rAF。rAF 在标签页切回时会补帧轰炸，
 *     节流更稳。
 *
 * 光斑与旋转一起给：纯旋转在暗色木纹背景上几乎看不出来，加一道跟着指针走的
 * 柔光才有「牌面是实体」的错觉。
 */
export interface TiltHandlers {
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
}

/** 最大倾斜角（度）。再大透视失真明显，卡面文字会糊。 */
const MAX_TILT = 9;
/** 悬停时抬起的高度（px），给「拿起来的牌」一点层次 */
const LIFT = 4;
/** 两次写入的最小间隔（ms），≈60fps */
const THROTTLE_MS = 16;

const mediaOk = (q: string): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

/** 清掉倾斜变量，让 CSS 过渡把牌放回平放状态 */
const reset = (el: HTMLElement): void => {
  el.style.removeProperty('--rx');
  el.style.removeProperty('--ry');
  el.style.removeProperty('--lift');
  delete el.dataset.tilting;
};

/**
 * @param disabled 临时关闭（例如卡牌正在播放受击动画，倾斜会与动画的
 *                 transform 抢同一个属性）
 */
export const useTilt = (disabled = false): TiltHandlers => {
  const enabledRef = useRef(false);
  const lastAtRef = useRef(0);

  useEffect(() => {
    enabledRef.current = !disabled
      && mediaOk('(hover: hover) and (pointer: fine)')
      && !mediaOk('(prefers-reduced-motion: reduce)');
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current) return;
    const el = e.currentTarget;
    const now = performance.now();
    if (now - lastAtRef.current < THROTTLE_MS) return;
    lastAtRef.current = now;

    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 归一化到 0..1：左上角 (0,0)，右下角 (1,1)
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));

    // 指针在右半边时绕 Y 轴正转，牌面朝右下倾 —— 与「手拿着牌」的直觉一致
    const ry = (px - 0.5) * 2 * MAX_TILT;
    const rx = (0.5 - py) * 2 * MAX_TILT;

    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    el.style.setProperty('--lift', -LIFT + 'px');
    el.dataset.tilting = 'on';
  }, []);

  const onPointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current) return;
    reset(e.currentTarget);
  }, []);

  const onPointerCancel = onPointerLeave;

  return { onPointerMove, onPointerLeave, onPointerCancel };
};
