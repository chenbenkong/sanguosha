import React, { useEffect } from 'react';
import { Hero } from '../../types';
import { heroFullCard2x, heroPortrait2x } from '../game/utils';
import { useCardArtMode } from './game/useCardArtMode';
import { CardArtToggle, FullCardImage } from './game/FullCardImage';

interface PortraitLightboxProps {
  hero: Hero | null;
  onClose: () => void;
}

/**
 * 大图查看：竖幅原图（2x），点击遮罩 / 关闭按钮 / Esc 均可关闭。
 * 手机上限制在视口内，不裁成方形，也不拉伸。
 *
 * 卡面模式下换成官方完整卡面（含技能文本，同为 2:3），尺寸上限不变；
 * 说明行在两种模式下都保留——卡面把势力色印成色块，体力/技能名反而更难读出，
 * 这行文字是补充而不是重复，所以留在图片下方（文档流里，不叠在图上）。
 */
export const PortraitLightbox: React.FC<PortraitLightboxProps> = ({ hero, onClose }) => {
  const { mode, setMode } = useCardArtMode();

  useEffect(() => {
    if (!hero) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hero, onClose]);

  if (!hero) return null;

  /** 白名单外的武将（马云禄、蔡贞姬）没有官方卡面，恒回落立绘，切换器也不显示 */
  const fullCard = heroFullCard2x(hero);
  const cardMode = mode === 'card' && fullCard !== null;
  const label = cardMode ? `${hero.name} 卡面` : `${hero.name} 立绘`;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/88 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {cardMode && fullCard ? (
          <FullCardImage
            src={fullCard}
            alt={label}
            className="w-auto h-auto max-h-[86vh] max-w-[92vw] rounded-lg border border-[#c8a45c]/60 bg-[#0d0a07] shadow-[0_18px_60px_rgba(0,0,0,0.75)]"
          />
        ) : (
          <img
            src={heroPortrait2x(hero.avatarUrl)}
            alt={label}
            aria-label={label}
            draggable={false}
            className="block h-auto w-auto max-h-[86vh] max-w-[92vw] rounded-lg border border-[#c8a45c]/60 shadow-[0_18px_60px_rgba(0,0,0,0.75)] object-contain"
          />
        )}
        {/* 说明行 + 就地切换：切换放在同一行，卡面大图不会因此被挤小 */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[#e8cf94]">
          <span className="font-ancient text-xl">{hero.name}</span>
          <span className="text-xs opacity-75">
            {hero.kingdom} · {hero.maxHp} 体力 ·【{hero.skillName}】
          </span>
          {fullCard && <CardArtToggle mode={mode} onChange={setMode} className="ml-1" />}
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
