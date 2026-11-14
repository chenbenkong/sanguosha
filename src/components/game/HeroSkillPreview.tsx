import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Hero } from '../../../types';
import { getHeroDetail } from '../../game/heroDetail';
import { heroSkillTags } from './heroSelectQuery';

const PANEL_W = 340;
const GAP = 10;

interface Box { left: number; top: number; width: number; maxHeight: number }

/**
 * 技能速览浮层。
 *
 * 用 createPortal 挂到 body + position: fixed：
 *  - 卡片本身 overflow: hidden，卡内绝对定位的浮层一定会被裁掉；
 *  - 卡片网格所在的滚动容器是 z-10 的层叠上下文，浮层若留在树里，
 *    无论 z-index 多高都压不过底部详情条（z-30）。
 * 因此只有 portal 到 body 才能既不被裁切、也不被遮挡。
 * 桌面：贴着卡片左右侧浮出；移动端（<768px）：贴底抽屉，整宽可读。
 */
export const HeroSkillPreview: React.FC<{
  hero: Hero;
  theme: 'dark' | 'light';
  anchor: HTMLElement | null;
  onClose: () => void;
}> = ({ hero, theme, anchor, onClose }) => {
  const [box, setBox] = useState<Box | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (vw < 768) {
        setBox({ left: 12, top: 0, width: vw - 24, maxHeight: Math.min(vh * 0.6, 420) });
        return;
      }

      const width = Math.min(PANEL_W, vw - 24);
      const right = r.right + GAP;
      const left = right + width <= vw - 8 ? right : Math.max(8, r.left - GAP - width);
      const top = Math.min(Math.max(8, r.top), Math.max(8, vh - 260));
      setBox({ left, top, width, maxHeight: Math.min(vh - top - 16, 420) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (panelRef.current && t && panelRef.current.contains(t)) return;
      if (anchor && t && anchor.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose]);

  if (!box) return null;

  const tags = heroSkillTags(hero);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return createPortal(
    <div
      ref={panelRef}
      id={`hero-skill-${hero.id}`}
      role="tooltip"
      aria-label={`${hero.name} 技能说明`}
      data-testid="hero-skill-preview"
      className={`hero-skill-preview animate-fade-in ${isMobile ? 'is-sheet' : ''}`}
      style={
        isMobile
          ? { left: box.left, width: box.width, maxHeight: box.maxHeight }
          : { left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight }
      }
    >
      <div className="hero-skill-preview__head">
        <span className="hero-skill-preview__name">{hero.name}</span>
        <span className="hero-skill-preview__meta">{hero.kingdom} · {hero.maxHp} 体力</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭技能说明"
          className="hero-skill-preview__close"
        >
          ✕
        </button>
      </div>

      {tags.length > 0 && (
        <div className="hero-skill-preview__tags">
          {tags.map(t => <span key={t} className="hero-skill-preview__tag">{t}</span>)}
        </div>
      )}

      {/* 逐技能成块：以前是「【A / B】+ 整段描述」挤在一起，多个技能的规则
          文本首尾相连，读不出边界。getHeroDetail 按「技能名：」切开，
          每个技能单独一块、名与正文分行。 */}
      <div className="hero-skill-preview__body">
        {getHeroDetail(hero).skills.map(s => (
          <div key={s.name} className={'hero-skill-preview__skill' + (s.isLord ? ' is-lord' : '')}>
            <span className="hero-skill-preview__skill-name">
              {s.isLord ? '主公技' : ''}【{s.name}】
            </span>
            <span className="hero-skill-preview__skill-desc">{s.desc}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};
