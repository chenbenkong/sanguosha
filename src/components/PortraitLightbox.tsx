import React, { useEffect } from 'react';
import { Hero } from '../../types';
import { heroPortrait2x } from '../game/utils';

interface PortraitLightboxProps {
  hero: Hero | null;
  onClose: () => void;
}

/**
 * 立绘查看：竖幅原图大图（2x），点击遮罩 / 关闭按钮 / Esc 均可关闭。
 * 手机上限制在视口内，不裁成方形，也不拉伸。
 */
export const PortraitLightbox: React.FC<PortraitLightboxProps> = ({ hero, onClose }) => {
  useEffect(() => {
    if (!hero) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hero, onClose]);

  if (!hero) return null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/88 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${hero.name} 立绘`}
    >
      <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img
          src={heroPortrait2x(hero.avatarUrl)}
          alt={`${hero.name} 立绘`}
          draggable={false}
          className="block h-auto w-auto max-h-[86vh] max-w-[92vw] rounded-lg border border-[#c8a45c]/60 shadow-[0_18px_60px_rgba(0,0,0,0.75)] object-contain"
        />
        <div className="mt-2 flex items-center gap-2 text-[#e8cf94]">
          <span className="font-ancient text-xl">{hero.name}</span>
          <span className="text-xs opacity-75">
            {hero.kingdom} · {hero.maxHp} 体力 ·【{hero.skillName}】
          </span>
        </div>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[#1a1410] border border-[#c8a45c]/70 text-[#e8cf94] text-lg leading-none flex items-center justify-center shadow-lg"
          aria-label="关闭立绘"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
