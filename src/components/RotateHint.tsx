import React from 'react';

/**
 * 竖屏引导层：手机竖屏时提示旋转到横屏。
 *
 * 为什么是硬拦截而不是「提示但仍可用」：对局界面按横屏设计（手牌铺在下方、对手在上方一排、
 * 战况与出牌顺序贴在两侧）。竖屏手机宽度只有 390 左右，座位排、右侧信息条、手牌三者在
 * 横向空间上互相挤压，进到界面里也没法正常出牌。与其让玩家进去再发现不可玩，
 * 不如在进入前就说清楚。
 *
 * 只在触屏设备上拦：桌面浏览器窗口拉窄时不该被挡在外面（见 useLayoutProfile.isTouch）。
 *
 * 样式用 Tailwind 内联而不是写进 theme.css：横屏紧凑样式由另一个改动负责，
 * 两边同时改同一个 CSS 文件会互相覆盖。
 */
export const RotateHint: React.FC<{ onLockLandscape?: () => void; canLock?: boolean }> = ({
  onLockLandscape,
  canLock,
}) => {
  // 「强制横屏」按钮：Screen Orientation Lock API 必须在**用户手势**里调用才生效，
  // 所以首屏自动锁一次多半会被拒，必须给一个可点的入口。
  // 支持它的浏览器（Android Chrome）锁上后屏幕会自己转；不支持的（iOS Safari）
  // 按钮不显示，只保留「请手动旋转」的提示。
  return (
    <div
      data-rotate-hint="1"
      role="alertdialog"
      aria-label="请将设备旋转到横屏"
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-[#120e0a] px-8 text-center"
    >
      {/* 手机图标：竖屏时画成竖的，配一个旋转箭头，比纯文字更直接 */}
      <div className="relative h-20 w-12 rounded-[10px] border-2 border-[#c8a45c] bg-[#1c1610]">
        <span className="absolute left-1/2 top-1.5 h-1 w-4 -translate-x-1/2 rounded-full bg-[#c8a45c]/60" />
        <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#c8a45c]/60" />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="absolute -right-9 top-1/2 h-7 w-7 -translate-y-1/2 text-[#e8cf94]">
          <path d="M4 9a8 8 0 0 1 13-5.2M20 15a8 8 0 0 1-13 5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M15 3.2 17.4 4 16.6 6.4M9 20.8 6.6 20l.8-2.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="font-ancient text-2xl text-[#f0dcae]">请横屏使用</div>
      <p className="max-w-xs text-sm leading-relaxed text-[#a99a80]">
        本作是横屏布局：手牌在屏幕下方、对手在上方一排。请把手机转成横屏继续。
      </p>
      {canLock && onLockLandscape && (
        <button
          type="button"
          onClick={onLockLandscape}
          className="mt-1 px-6 py-2.5 rounded-lg bg-[#b8352c] text-[#f6e3c8] font-ancient text-lg tracking-[0.18em] border border-[#e0705f]/60 active:scale-[0.98] transition-transform"
        >
          强制横屏
        </button>
      )}
    </div>
  );
};
