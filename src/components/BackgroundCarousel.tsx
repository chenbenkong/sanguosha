import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface BackgroundCarouselProps {
  images: string[];
  interval?: number;
  className?: string;
}

// 生成水波纹
const generateRipples = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 60 + 40,
    delay: Math.random() * 3,
    duration: Math.random() * 2 + 3,
  }));
};

export const BackgroundCarousel: React.FC<BackgroundCarouselProps> = ({
  images,
  interval = 6000,
  className = ''
}) => {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const ripples = useMemo(() => generateRipples(8), [currentIndex]);

  const transitionToNext = useCallback(() => {
    if (isTransitioning || images.length <= 1) return;
    
    setIsTransitioning(true);
    setPrevIndex(currentIndex);
    const nextIndex = (currentIndex + 1) % images.length;
    setCurrentIndex(nextIndex);
    
    setTimeout(() => {
      setPrevIndex(null);
      setIsTransitioning(false);
    }, 3000);
  }, [currentIndex, images.length, isTransitioning]);

  useEffect(() => {
    if (images.length <= 1) return;
    
    const timer = setInterval(() => {
      transitionToNext();
    }, interval);
    
    return () => clearInterval(timer);
  }, [interval, images.length, transitionToNext]);

  // 黑夜模式
  if (theme === 'dark') {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a1510] to-[#0d0d0d]" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-radial from-amber-900/30 via-transparent to-transparent blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-red-900/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-yellow-900/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>
    );
  }

  // 白天模式 - 无图片时显示纯色背景
  if (images.length === 0) {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#f0ebe5]" />
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* 上一张图片 - 水波淡出 */}
      {prevIndex !== null && (
        <div 
          className="absolute inset-0 animate-water-fade-out"
          style={{
            backgroundImage: `url(${images[prevIndex]})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      
      {/* 当前图片 - 水波淡入 */}
      <div 
        className={`absolute inset-0 ${isTransitioning ? 'animate-water-fade-in' : ''}`}
        style={{
          backgroundImage: `url(${images[currentIndex]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* 水波光效层 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.1) 0%, transparent 40%),
            radial-gradient(ellipse at 70% 80%, rgba(255,255,255,0.08) 0%, transparent 35%),
            radial-gradient(ellipse at 50% 50%, rgba(200,180,160,0.05) 0%, transparent 50%)
          `,
          mixBlendMode: 'soft-light',
        }}
      />
      
      {/* 水波纹动画 - 过渡时 */}
      {isTransitioning && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {ripples.map((ripple) => (
            <div
              key={`ripple-${ripple.id}`}
              className="absolute rounded-full animate-water-ripple"
              style={{
                left: `${ripple.x}%`,
                top: `${ripple.y}%`,
                width: `${ripple.size}px`,
                height: `${ripple.size}px`,
                border: '1px solid rgba(180,160,140,0.1)',
                animationDelay: `${ripple.delay}s`,
                animationDuration: `${ripple.duration}s`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>
      )}
      
      {/* 闪烁光点 */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <div
            key={`sparkle-${i}`}
            className="absolute w-1 h-1 rounded-full animate-sparkle"
            style={{
              left: `${20 + Math.random() * 60}%`,
              top: `${20 + Math.random() * 60}%`,
              background: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(200,180,160,0.3) 50%, transparent 100%)',
              boxShadow: '0 0 3px rgba(255,255,255,0.4)',
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
      
      {/* 强颗粒效果 - 多层叠加 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay',
          opacity: 0.35,
        }}
      />
      
      {/* 额外颗粒层 - 更细腻 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grainFilter'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grainFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'soft-light',
          opacity: 0.25,
        }}
      />
      
      {/* 胶片颗粒效果 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='filmGrain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23filmGrain)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'multiply',
          opacity: 0.15,
        }}
      />
      
      {/* 轻微遮罩 - 只在边缘 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            linear-gradient(180deg, rgba(250,248,245,0.2) 0%, transparent 10%, transparent 90%, rgba(250,248,245,0.2) 100%)
          `,
        }}
      />
    </div>
  );
};

export default BackgroundCarousel;
