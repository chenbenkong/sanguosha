import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Hero } from '../../../types';
import { KINGDOM_CLASS } from '../../game/constants';
import { HeroSkillPreview } from './HeroSkillPreview';

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
  onPick: (h: Hero) => void;
}> = ({ hero, selected, theme, onPick }) => {
  const [preview, setPreview] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const longPressRef = useRef<number | null>(null);
  /** 长按已触发时吞掉随后的 click，避免「想看技能」变成「直接选中」 */
  const suppressClickRef = useRef(false);

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
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') close(); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
        className={`hero-pick hero-card group w-full text-left kingdom-frame ${KINGDOM_CLASS[hero.kingdom] ?? ''}`}
        aria-pressed={selected}
        aria-label={`选择 ${hero.name}`}
        aria-describedby={preview ? `hero-skill-${hero.id}` : undefined}
        title={`${hero.name}（${hero.kingdom} · ${hero.maxHp} 体力）【${hero.skillName}】${hero.skillDesc}${hero.lordSkillName ? ` 主公技【${hero.lordSkillName}】${hero.lordSkillDesc}` : ''}`}
      >
        <img
          src={hero.avatarUrl}
          alt={hero.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="hero-pick-shade" />

        <span className="hero-kingdom absolute top-2 left-2">{hero.kingdom}</span>

        <span className="hero-hp absolute top-2 right-2" title={`体力上限 ${hero.maxHp}`}>
          <span className="hero-hp-pips">
            {Array.from({ length: hero.maxHp }).map((_, i) => (
              <i key={i} className="hero-hp-pip" />
            ))}
          </span>
        </span>

        {selected && (
          <span className="absolute right-2 top-10 w-6 h-6 rounded-full bg-[#d4af37] text-[#241a0e] flex items-center justify-center text-xs font-bold shadow-lg">
            ✓
          </span>
        )}

        <div className="hero-pick-foot absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-8">
          <div className="hero-pick-title truncate">{hero.description}</div>
          <div className="font-ancient hero-pick-name leading-tight text-[#f4e4bf] drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
            {hero.name}
          </div>
          <div className="hero-pick-skill">
            <span className="truncate">【{hero.skillName}】</span>
            {hero.pending && <span className="hero-lord-chip">实装中</span>}
            {hero.lordSkillName && <span className="hero-lord-chip">主公技</span>}
          </div>
          <div className="hero-pick-desc line-clamp-3">{hero.skillDesc}</div>
        </div>
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
