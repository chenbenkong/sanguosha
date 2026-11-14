import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Hero } from '../../../types';
import { KINGDOM_CLASS } from '../../game/constants';
import { heroFullCard } from '../../game/utils';
import { HeroSkillPreview } from './HeroSkillPreview';
import { useTilt } from './useTilt';
import type { CardArtMode } from './useCardArtMode';

/** 长按多少毫秒算「查看技能」而不是「选将」 */
const LONG_PRESS_MS = 420;

/**
 * 选将卡片。
 *
 * 结构：外层 div 只做定位锚点，卡片本身仍是 <button aria-label={`选择 ${name}`}>——
 * 端到端测试按这个 aria-label 找卡片，契约不能变。技能速览用 fixed 定位渲染成
 * 同级的浮层，因此不受卡片 overflow:hidden 与滚动容器的裁切。
 */
export const HeroCard: React.FC<{
  hero: Hero;
  selected: boolean;
  theme: 'dark' | 'light';
  /** 画面模式：立绘裁切 或 官方完整卡面 */
  artMode: CardArtMode;
  onPick: (h: Hero) => void;
  /** 打开武将详情（卡片右上角的「详情」按钮） */
  onOpenDetail: (h: Hero) => void;
}> = ({ hero, selected, theme, artMode, onPick, onOpenDetail }) => {
  /** 卡面上的势力、勾玉、技能文本都是印刷体，再叠一层自家 UI 就是重复信息 */
  const fullCard = artMode === 'card' ? heroFullCard(hero) : null;
  const cardMode = Boolean(fullCard);
  const [preview, setPreview] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const longPressRef = useRef<number | null>(null);
  /** 长按已触发时吞掉随后的 click，避免「想看技能」变成「直接选中」 */
  const suppressClickRef = useRef(false);
  /** 3D 倾斜：只写 CSS 变量，不触发重渲染。触屏/减弱动效由 hook 与 .tilt 媒体查询双重关断 */
  const tilt = useTilt();

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const open = useCallback(() => setPreview(true), []);
  const close = useCallback(() => setPreview(false), []);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onPick(hero);
  }, [hero, onPick]);

  const handleTouchStart = useCallback(() => {
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null;
      suppressClickRef.current = true;
      setPreview(true);
    }, LONG_PRESS_MS);
  }, [clearLongPress]);

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        onClick={handleClick}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') open(); }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') close();
          tilt.onPointerLeave(e);
        }}
        onPointerMove={tilt.onPointerMove}
        onPointerCancel={tilt.onPointerCancel}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
        className={`hero-pick hero-card group tilt w-full text-left kingdom-frame ${KINGDOM_CLASS[hero.kingdom] ?? ''}${cardMode ? ' is-fullcard' : ' flex flex-col'}`}
        aria-pressed={selected}
        aria-label={`选择 ${hero.name}`}
        aria-describedby={preview ? `hero-skill-${hero.id}` : undefined}
        title={`${hero.name}（${hero.kingdom} · ${hero.maxHp} 体力）【${hero.skillName}】${hero.skillDesc}${hero.lordSkillName ? ` 主公技【${hero.lordSkillName}】${hero.lordSkillDesc}` : ''}`}
      >
        {cardMode ? (
          <>
            <img
              src={fullCard ?? hero.avatarUrl}
              alt={hero.name}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.04]"
            />
            {selected && (
              <span className="absolute right-2 top-10 w-6 h-6 rounded-full bg-[#d4af37] text-[#241a0e] flex items-center justify-center text-xs font-bold shadow-lg">
                ✓
              </span>
            )}
            {/* 卡面模式下技能文本、势力、勾玉都印在牌面上，只补一条武将名——
                卡面原名的竖排书法在缩略尺寸下难认，横排名字负责扫视识别。
                （势力角标与勾玉在立绘模式已移入铭条，卡面模式本就不渲染它们。） */}
            <div className="hero-pick-namebar absolute inset-x-0 bottom-0 pl-2 pr-[42px] pb-1.5 pt-6">
              <span className="font-ancient hero-pick-name leading-tight text-[#f4e4bf] drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                {hero.name}
              </span>
              {hero.pending && <span className="hero-lord-chip">实装中</span>}
              {hero.lordSkillName && <span className="hero-lord-chip">主公技</span>}
            </div>
          </>
        ) : (
          <>
            {/* 立绘模式：图面上不再叠任何文字。势力角标 / 名字 / 勾玉移到下方
                与卡片一体的铭条里（文档流，不是绝对定位浮层）；技能文本交给
                悬停速览（HeroSkillPreview）与详情弹窗，卡面上从不缺地方读名字。 */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
              <img
                src={hero.avatarUrl}
                alt={hero.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="hero-pick-shade" />
              {selected && (
                <span className="absolute left-2 top-2 w-6 h-6 rounded-full bg-[#d4af37] text-[#241a0e] flex items-center justify-center text-xs font-bold shadow-lg">
                  ✓
                </span>
              )}
            </div>
            <div className="hero-pick-strip">
              <span className="hero-kingdom">{hero.kingdom}</span>
              <span className="font-ancient hero-pick-name truncate leading-none">{hero.name}</span>
              {hero.pending && <span className="hero-lord-chip">实装中</span>}
              {hero.lordSkillName && <span className="hero-lord-chip">主公技</span>}
              <span className="hero-hp ml-auto" title={`体力上限 ${hero.maxHp}`}>
                <span className="hero-hp-pips" style={{ gap: 1, flexWrap: 'nowrap' }}>
                  {Array.from({ length: hero.maxHp }).map((_, i) => (
                    <i key={i} className="hero-hp-pip" style={{ width: 6, height: 10 }} />
                  ))}
                </span>
              </span>
            </div>
          </>
        )}
      </button>

      {/* 「详情」入口。放在卡片 button 的兄弟节点：button 内不能再嵌 button，
          而 e2e 用 button[aria-label^="选择 "] 找卡片并点击选中，卡片本身必须
          保持「点击=选中」不变。右上角，44×44 命中区；勾玉已左移让位。 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail(hero);
        }}
        aria-label={`查看 ${hero.name} 详情`}
        title={`查看 ${hero.name} 详情`}
        className={
          'absolute right-2 z-20 flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full border border-[#c8a45c]/70 bg-[#0a0806]/82 text-[#f4e4bf] backdrop-blur-[2px] transition-colors hover:border-[#f0d894] hover:bg-[#c8a45c]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d894] '
          + (cardMode ? 'bottom-2' : 'top-2')
        }
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {/* 移动端没有 hover：卡片右下角的「技能」入口展开速览。
          它是卡片 button 的兄弟节点（button 内不能再嵌 button），
          脚注在移动端预留出与它等高的下内边距，避免压住技能描述文字。 */}
      <button
        type="button"
        onClick={() => (preview ? close() : open())}
        aria-label={`查看 ${hero.name} 技能说明`}
        aria-expanded={preview}
        className="hero-skill-toggle md:hidden"
      >
        技能
      </button>

      {preview && (
        <HeroSkillPreview
          hero={hero}
          theme={theme}
          anchor={anchorRef.current}
          onClose={close}
        />
      )}
    </div>
  );
};
