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
  /**
   * 横屏手机（宽 > 高 且 高度很小，≈320–520）。
   *
   * 为什么要单独分这一类：三段式对局布局本身是横屏友好的，但**太高**——
   * 844×390 实测内容需要 570px 高，而视口只有 390，多出来的直接溢出屏幕外
   * （手牌整条看不见，等于打不了牌）。旧逻辑只在 w<768 时才缩放，横屏手机
   * w=844 恰好落空，于是吃到的是「桌面尺寸的布局塞进 390px」。
   */
  landscapePhone: boolean;
  /** 供 CSS 选用的方向档位 */
  orient: 'landscape-phone' | 'portrait-phone' | 'desktop';
  /** 竖屏手机（窄且不算高）。横屏专属策略下，这一类会被引导层拦下来。 */
  portraitPhone: boolean;
  /**
   * 触屏设备。用来把「请横屏」限制在真手机上：
   * 桌面浏览器把窗口拉窄也符合「窄且不高」，但它不该被拦在外面。
   */
  isTouch: boolean;
  /**
   * 屏幕方向锁的状态：
   *   · 'locked'      已成功锁定横屏（Android Chrome 全屏 / 我们的原生外壳）
   *   · 'unavailable' 该环境不支持（iOS Safari、普通标签页）
   *   · 'unknown'     还没试出结果
   */
  orientationLockState: 'unknown' | 'locked' | 'unavailable';
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

  // 横屏手机：宽 > 高，且高度很小。竖向空间是这里唯一稀缺的资源。
  const landscapePhone = viewport.w > viewport.h && viewport.h > 0 && viewport.h < 520;
  // 旧的「窄且矮」缩放条件。注意它与「竖屏手机」**不是**一回事：
  // 竖屏手机天生就高（390×844、375×667），加高度上限会把真机排除掉。
  const narrowShortPhone = viewport.w > 0 && viewport.w < 768 && viewport.h > 0 && viewport.h < 660;
  // 竖屏手机 = 窄 且 高 ≥ 宽。磕过两次的坑记在这里：
  //   ① 只判尺寸（w<768 且 h<660）会把 640×360 这种「又小又宽」的横屏视口也判成竖屏手机，
  //      于是它被引导层拦掉（mobile-check 的 small-land 就栽在这）；
  //   ② 沿用「h<660」还会漏掉真机竖屏：390×844 的 h=844 ≥ 660，判定直接落空。
  // 所以判据只看朝向 + 窄，把「桌面窗口拉窄」排除掉是 isTouch 的职责、不在这里。
  const portraitPhone = viewport.w > 0 && viewport.h > 0
    && viewport.h >= viewport.w && viewport.w < 768;

  // 横屏手机按**高度**缩放：目标逻辑高度 LANDSCAPE_TARGET_H，
  // 配套的横屏紧凑样式（见 theme.css 里 [data-orient="landscape-phone"]）负责把
  // 内容真实高度压到这个目标以内，缩放在此只是把剩余差额补平。
  // 下限 0.6 是经验的可用性底线：再小字号就低于可读阈值了。
  // ★ 横屏手机不再做整页缩放（uiScale 恒为 1）。
  //
  // 之前用 transform: scale(h/520) 把桌面布局等比塞进矮屏，实测两个问题：
  //   ① 缩放盒（宽 = w/scale、高 = h/scale）与视口对不齐，底部区域被切；
  //   ② 缩放后的字号/热区一起变小，手机上本来就该用更大的热区。
  // 现在改成「视口就是真实布局空间」，由 theme.css 的
  // [data-orient="landscape-phone"] 规则真正重排各分区的高度预算。
  const uiScale = narrowShortPhone
    ? Math.max(0.68, Math.min(1, viewport.h / 840))
    : 1;

  /**
   * 尝试把屏幕**锁定**为横屏（Android Chrome / 部分 WebView 支持）。
   *
   * 为什么需要：网页无法像原生那样用 manifest 锁方向。若用户把手机竖着拿，
   * 对局界面（横屏布局）就完全没法用。
   *
   * 限制与降级（都实测过）：
   *   · Screen Orientation Lock API 只在**全屏**（fullscreen）时可用，
   *     浏览器标签页里调用会抛 SecurityError —— 所以失败就静默忽略，
   *     退回到「竖屏时显示『请横屏使用』引导层」。
   *   · iOS Safari 不支持这个 API，锁不了 —— 同样走引导层。
   */
  const [orientationLockState, setOrientationLockState] = useState<'unknown' | 'locked' | 'unavailable'>('unknown');
  useEffect(() => {
    const anyScreen = window.screen as (Screen & {
      orientation?: { lock?: (o: string) => Promise<void> };
    }) | undefined;
    const lock = anyScreen?.orientation?.lock;
    if (typeof lock !== 'function') {
      setOrientationLockState('unavailable');
      return;
    }
    // 必须在用户手势里调用才不被拦，但首次加载时拿不到手势 ——
    // 于是先试一次，失败就标记不可用；后续用户点「进入横屏」按钮时再补一次。
    let cancelled = false;
    void lock.call(anyScreen!.orientation, 'landscape')
      .then(() => { if (!cancelled) setOrientationLockState('locked'); })
      .catch(() => { if (!cancelled) setOrientationLockState('unavailable'); });
    return () => { cancelled = true; };
  }, []);


  // 触屏判定：粗指针或存在多点触控（两者任一即可，覆盖 iOS/Android 浏览器）
  const isTouch = typeof window !== 'undefined' && (
    (window.matchMedia?.('(pointer: coarse)').matches ?? false)
    || (navigator.maxTouchPoints ?? 0) > 0
  );

  const orient: LayoutProfile['orient'] = landscapePhone
    ? 'landscape-phone'
    : portraitPhone ? 'portrait-phone' : 'desktop';

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

  return {
    viewport, uiScale, scaleStyle, layoutDensity, sizeTier, landscapePhone, orient,
    portraitPhone, isTouch, orientationLockState,
  };
};
