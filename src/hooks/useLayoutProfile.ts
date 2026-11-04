import React, { useEffect, useState } from 'react';

export type LayoutDensity = 'ultra' | 'tight' | 'compact' | 'normal' | 'roomy';
export type SizeTier = 'md' | 'lg' | 'xl';

export interface LayoutProfile {
  viewport: { w: number; h: number };
  /** 仅矮手机（<720 高）启用的整页缩放兜底，正常手机保持 1，避免缩小触控热区 */
  uiScale: number;
  scaleStyle: React.CSSProperties | undefined;
  /** 按可视高度分档：ultra <660 / tight <760 / compact <860 / normal <960 / roomy ≥960 */
  layoutDensity: LayoutDensity;
  /** 宽屏分档：高分屏/大显示器上放大核心区，避免 1600+ 视口「字小如蚁」 */
  sizeTier: SizeTier;
}

/**
 * 视口分档
 * 统一按 CSS 像素计算（高分屏的系统缩放 / 浏览器 zoom 已经体现在 innerWidth/innerHeight 里），
 * 因此 3200×2000@200% 会被当作 1600×1000 处理，不需要额外区分物理分辨率。
 */
export const useLayoutProfile = (): LayoutProfile => {
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 0 : window.innerWidth,
    h: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // 手机端仅在「很矮」视口（<660）做整页缩放兜底；≥660 的常规手机（含 375×667）
  // 不再缩放——缩放会把座位卡与字号一起压小，违背「手机端同步放大」的硬指标
  const uiScale = viewport.w > 0 && viewport.w < 768 && viewport.h > 0 && viewport.h < 660
    ? Math.max(0.68, Math.min(1, viewport.h / 840))
    : 1;

  const scaleStyle: React.CSSProperties | undefined = uiScale < 1 ? {
    // fixed 让缩放后的元素脱离文档流，避免 body 被撑高后出现「越滚越空」的空白区
    position: 'fixed',
    top: 0,
    left: 0,
    width: `${Math.round(viewport.w / uiScale)}px`,
    height: `${Math.round(viewport.h / uiScale)}px`,
    transform: `scale(${uiScale})`,
    transformOrigin: 'top left',
  } : undefined;

  const layoutDensity: LayoutDensity =
    viewport.h > 0 && viewport.h < 660 ? 'ultra'
      : viewport.h < 760 ? 'tight'
        : viewport.h < 860 ? 'compact'
          : viewport.h < 960 ? 'normal'
            : 'roomy';

  const sizeTier: SizeTier = viewport.w >= 1800 ? 'xl' : viewport.w >= 1440 ? 'lg' : 'md';

  return { viewport, uiScale, scaleStyle, layoutDensity, sizeTier };
};
