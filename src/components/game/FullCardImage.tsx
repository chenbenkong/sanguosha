import React from 'react';
import type { CardArtMode } from './useCardArtMode';

/**
 * 卡面呈现的两个共用件。
 *
 * 卡面是 2:3 竖幅、下半部分印着技能文本，一旦 object-cover 就会被裁掉，
 * 所以「卡面一律 object-contain」这条不变量收在 FullCardImage 里，
 * 详情弹层（HeroDetailModal）与卡面开关共用这一份实现。
 *
 * 注意灯箱（PortraitLightbox）已不再走这里：它现在把 3D 卡牌交给
 * Card3DViewer，静态立绘那条分支直接渲染 img。这条不变量由那两处各自保证。
 */

/** 官方完整卡面（2x）。深色衬底用于图片加载中与 letterbox 区域，不出现白块。 */
export const FullCardImage: React.FC<{
  src: string;
  alt: string;
  loading?: 'lazy' | 'eager';
  className?: string;
}> = ({ src, alt, loading = 'lazy', className }) => (
  <img
    src={src}
    alt={alt}
    aria-label={alt}
    loading={loading}
    draggable={false}
    decoding="async"
    className={`block w-full h-full object-contain select-none ${className ?? ''}`}
  />
);

/**
 * 立绘 / 卡面 分段切换。
 *
 * 立绘脸大、好扫视；卡面信息全（势力、勾玉、技能文本）。取舍真实存在，
 * 所以大图和详情页都就地给切换，而不是逼用户退回选将页再改偏好。
 * 只有存在官方卡面的武将才渲染这个控件，否则点了没反应反而像坏掉。
 */
export const CardArtToggle: React.FC<{
  mode: CardArtMode;
  onChange: (mode: CardArtMode) => void;
  className?: string;
}> = ({ mode, onChange, className }) => (
  <div
    className={`inline-flex items-center gap-0.5 rounded-md border border-[#c8a45c]/40 bg-[#1a1410]/85 p-0.5 ${className ?? ''}`}
    role="group"
    aria-label="切换画面模式"
  >
    {([['portrait', '立绘'], ['card', '卡面']] as const).map(([m, label]) => (
      <button
        key={m}
        type="button"
        onClick={() => onChange(m)}
        aria-pressed={mode === m}
        title={m === 'card' ? '显示官方完整卡面（含技能文本）' : '显示武将立绘（裁切半身）'}
        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
          mode === m ? 'bg-[#c8a45c] text-[#1a1410]' : 'text-[#d9c49a] hover:text-[#f0d894]'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);
