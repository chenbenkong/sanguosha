import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadCard3D, webgl2Available,
  type Card3DInstance, type Card3DMeta,
} from './game/card3d';

/**
 * 可拖拽旋转的 3D 卡牌（图鉴同款 WebGL 引擎）。
 *
 * 交互参照图鉴站：
 *  - **按住拖动才转**，指针掠过不动——后者会让人误以为卡自己乱晃；
 *  - 起手有 5px 死区，避免「想点击却转了一下」；
 *  - 拖动挂在 window 上而不是卡片上：横向转一整圈时指针会扫出卡片范围，
 *    挂在自己身上会中途断掉；
 *  - 拖完之后短暂吞掉 click，否则松手会顺手触发外层的「放大查看」。
 *
 * 三种状态，全部对调用方可见（data-c3d-state）：loading / ready / fallback。
 * WebGL2 不可用、脚本加载失败、create() 抛异常，一律走 fallback——渲染一张
 * 普通 <img>，与改动前完全一致。卡牌是装饰，不能因为它让功能不可用。
 */

/** 拖拽起手死区（px）：小于这个位移视为点按，卡片纹丝不动 */
const DRAG_THRESHOLD = 5;
/** 拖完多久内吞掉 click（ms） */
const CLICK_SUPPRESS_MS = 400;
/** 起手那几像素的补偿上限，防止内核慢时卡片瞬移 */
const CATCHUP_CLAMP = 70;

export interface Card3DViewerProps {
  /** 卡面图（建议用 2x） */
  src: string;
  /** 卡背显示的元信息 */
  meta: Card3DMeta;
  /** 备用 alt */
  alt?: string;
  theme?: 'dark' | 'light';
  className?: string;
  /** 是否显示「翻转 / 复位 / 镭射」控制条 */
  controls?: boolean;
  /** 拖动结束后触发（调用方用于吞掉随后的 click） */
  onDragEnd?: () => void;
}

export const Card3DViewer: React.FC<Card3DViewerProps> = ({
  src, meta, alt, theme = 'dark', className, controls = true, onDragEnd,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<Card3DInstance | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [foil, setFoil] = useState(true);
  const [flipped, setFlipped] = useState(false);

  // 拖拽状态放在 ref 里：pointermove 每帧都跑，用 state 会重渲染整棵子树
  const dragRef = useRef<{
    x: number; y: number; sx: number; sy: number; moved: number; on: boolean;
  } | null>(null);
  const suppressClickUntil = useRef(0);

  /** 建实例并把贴图喂进去 */
  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    if (!webgl2Available()) {
      setState('fallback');
      return;
    }

    void loadCard3D().then((engine) => {
      if (disposed) return;
      if (!engine) {
        setState('fallback');
        return;
      }

      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (disposed) return;
        try {
          const inst = engine.create({
            mount,
            theme,
            // 画布不吃指针：拖动由外层容器接，这样能统一走 window 的 move
            interactive: false,
            freeSpin: true,
            maxTexWidth: 1024,
            canvasClass: 'c3d-canvas',
            onInteract: () => { suppressClickUntil.current = performance.now() + CLICK_SUPPRESS_MS; },
          });
          inst.setCard(img, meta);
          instRef.current = inst;
          setState('ready');
        } catch {
          setState('fallback');
        }
      };
      img.onerror = () => { if (!disposed) setState('fallback'); };
      img.src = src;
    });

    return () => {
      disposed = true;
      try { instRef.current?.dispose(); } catch { /* dispose 失败不该影响卸载 */ }
      instRef.current = null;
    };
    // meta 是对象字面量，逐字段比较而不是比引用，否则每次渲染都会重建实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, meta.name, meta.faction, meta.no, theme]);

  // 容器尺寸变化时通知引擎重算视口
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || state !== 'ready') return;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      try { instRef.current?.resize(); } catch { /* 忽略 */ }
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, [state]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || state !== 'ready') return;
    dragRef.current = {
      x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, on: false,
    };
  }, [state]);

  // 拖动挂 window：指针移出卡片范围也不能断
  useEffect(() => {
    if (state !== 'ready') return;

    const onMove = (e: PointerEvent): void => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);

      const inst = instRef.current;
      if (!inst) return;

      if (!d.on) {
        // 还在点按范围内：卡片纹丝不动
        if (d.moved < DRAG_THRESHOLD) return;
        d.on = true;
        inst.dragStart();
        // 起手那几像素补回去，卡片跟上手指当前位置
        const jx = Math.max(-CATCHUP_CLAMP, Math.min(CATCHUP_CLAMP, d.x - d.sx));
        const jy = Math.max(-CATCHUP_CLAMP, Math.min(CATCHUP_CLAMP, d.y - d.sy));
        if (jx || jy) inst.dragMove(jx, jy);
      }
      inst.dragMove(dx, dy);
    };

    const onUp = (): void => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !d.on) return;
      try { instRef.current?.dragEnd(); } catch { /* 忽略 */ }
      suppressClickUntil.current = performance.now() + CLICK_SUPPRESS_MS;
      onDragEnd?.();
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [state, onDragEnd]);

  /** 拖完紧接着的 click 要吞掉，否则松手会触发外层的放大/关闭 */
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (performance.now() < suppressClickUntil.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  const doFlip = useCallback(() => {
    try {
      instRef.current?.flip();
      setFlipped((f) => !f);
    } catch { /* 忽略 */ }
  }, []);

  const doReset = useCallback(() => {
    try {
      instRef.current?.reset();
      setFlipped(false);
    } catch { /* 忽略 */ }
  }, []);

  const doFoil = useCallback(() => {
    setFoil((on) => {
      try { instRef.current?.setFoil(!on); } catch { /* 忽略 */ }
      return !on;
    });
  }, []);

  return (
    <div
      className={`c3d-host ${className ?? ''}`}
      data-c3d-state={state}
      onPointerDown={onPointerDown}
      onClickCapture={handleClickCapture}
      style={{ touchAction: 'none' }}
    >
      {/* 引擎把 canvas 挂进这个 div；fallback 时它留空，由下面的 img 顶上 */}
      <div ref={mountRef} className="c3d-mount" />

      {state === 'fallback' && (
        <img src={src} alt={alt ?? meta.name} className="c3d-fallback" draggable={false} />
      )}

      {controls && state === 'ready' && (
        <div className="c3d-bar">
          <button type="button" onClick={doFlip} aria-pressed={flipped}
            aria-label={flipped ? '翻回正面' : '翻到背面'} title="翻转">
            ⟲
          </button>
          <button type="button" onClick={doReset} aria-label="复位卡牌" title="复位">⟳</button>
          <button type="button" onClick={doFoil} aria-pressed={foil}
            aria-label={foil ? '关闭镭射' : '开启镭射'} title="镭射">
            ✦
          </button>
        </div>
      )}
    </div>
  );
};
