import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface BackgroundCarouselProps {
  images: string[];
  interval?: number;
  className?: string;
}

/**
 * 背景层（性能优化版）
 * - 已移除三层全屏 feTurbulence 噪点滤镜与大面积 blur 光斑：它们是移动端掉帧的主因
 * - 只保留纯 CSS 渐变 + 单层静态云纹，合成开销接近零
 * - 图片切换改为 1.1s 叠化，不再使用 3s 水波 keyframe + 闪烁光点
 * - 组件整体 memo 化，App 高频重渲染时不再重建
 */
const BackgroundCarouselBase: React.FC<BackgroundCarouselProps> = ({
  images,
  interval = 12000,
  className = ''
}) => {
  const { theme } = useTheme();
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const lastRef = useRef(0);

  const advance = useCallback(() => {
    setCurrent(c => (c + 1) % Math.max(images.length, 1));
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(advance, interval);
    return () => clearInterval(timer);
  }, [advance, images.length, interval]);

  // 记录上一张，1.1s 后移除叠化层
  useEffect(() => {
    if (lastRef.current === current) return;
    const old = lastRef.current;
    lastRef.current = current;
    setPrev(old);
    const t = setTimeout(() => setPrev(null), 1100);
    return () => clearTimeout(t);
  }, [current]);

  if (theme === 'dark') {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`}>
        {/* 底层渐变：墨黑 → 暖褐 → 墨黑 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#14100d] via-[#241b14] to-[#0e0b09]" />
        {/* 静态云纹（无滤镜，单层） */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 40 Q30 22 50 40 T90 40 M10 80 Q30 62 50 80 T90 80' stroke='%23c8a45c' stroke-width='0.6' fill='none' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px'
          }}
        />
        {/* 中央柔光（静态，不参与动画） */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 55% at 50% 42%, rgba(200,164,92,0.10) 0%, transparent 70%)'
          }}
        />
        {/* 暗角：突出中心牌桌 */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 85% 75% at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)'
          }}
        />
      </div>
    );
  }

  // 白天模式：无图片时使用宣纸底色
  if (images.length === 0) {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-[#faf8f5] via-[#f4efe7] to-[#efe8dd]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 40 Q30 22 50 40 T90 40 M10 80 Q30 62 50 80 T90 80' stroke='%23a8842c' stroke-width='0.6' fill='none' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px'
          }}
        />
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* 上一张（保持在下层，由新图层覆盖完成叠化） */}
      {prev !== null && (
        <img
          src={images[prev]}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          decoding="async"
        />
      )}
      {/* 当前一张 */}
      <img
        key={current}
        src={images[current]}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover animate-bg-crossfade"
        decoding="async"
        loading={current === 0 ? 'eager' : 'lazy'}
      />
      {/* 宣纸蒙版：白天模式把背景图压成淡墨氤氲的水印，
          使「浅底 + 深字」的浅色主题配色真正成立（此前误压深色纱幕，深字读不出来） */}
      <div className="absolute inset-0 bg-[#f7f2e8]/80" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 68% at 50% 45%, rgba(255,253,248,0.62) 0%, rgba(214,199,172,0.28) 62%, rgba(150,128,96,0.34) 100%)'
        }}
      />
      {/* 纸纹：极淡的纤维噪点，增加宣纸质感（静态，无滤镜开销） */}
      <div
        className="absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'p\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23p)\' opacity=\'0.10\'/%3E%3C/svg%3E")',
          backgroundSize: '200px 200px'
        }}
      />
    </div>
  );
};

export const BackgroundCarousel = memo(BackgroundCarouselBase);
export default BackgroundCarousel;
