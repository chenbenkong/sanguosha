import React, { useCallback, useEffect, useRef } from 'react';
import { Hero } from '../../types';
import { heroFullCard2x, heroPortrait2x } from '../game/utils';
import { Card3DViewer } from './Card3DViewer';
import { useCardArtMode } from './game/useCardArtMode';
import { CardArtToggle } from './game/FullCardImage';

interface PortraitLightboxProps {
  hero: Hero | null;
  onClose: () => void;
}

/**
 * 拖完松手那次 click 的吞掉窗口（ms）。
 *
 * 指针在卡片上按下、拖着走到遮罩上松手时，浏览器把 click 派发到「按下点与松手点
 * 最近的共同祖先」——也就是遮罩层本身。这条路径根本不经过卡片（Card3DViewer 的
 * 捕获拦截挂在自己身上），所以「拖完不要关灯箱」必须在遮罩这一层再守一道。
 * 一次拖动结束后紧接着的 click 是拖动的余波，不当成「点背景关闭」。
 */
const DRAG_CLOSE_GUARD_MS = 400;

/**
 * 大图查看：竖幅原图（2x），点击遮罩 / 关闭按钮 / Esc 均可关闭。
 * 手机上限制在视口内，不裁成方形，也不拉伸。
 *
 * 有官方完整卡面的武将换成 3D 卡牌查看器：图鉴同款 WebGL 引擎，可拖拽旋转、
 * 翻转、上镭射。卡面是 2:3 竖幅，所以外框按 2:3 取「视口能放下的最大尺寸」——
 * 引擎按挂载点尺寸自建画布，容器没尺寸就没画面，容器过大则会把灯箱顶出视口，
 * 所以宽高都用 vw/vh 的 min() 直接算死（两者恒成 2:3）。
 *
 * 没有全卡面的武将（马云禄、蔡贞姬）保持原样：静态 2x 立绘，不留空容器。
 * 说明行在两种模式下都保留——卡面把势力色印成色块，体力/技能名反而更难读出，
 * 这行文字是补充而不是重复，所以留在下方（文档流里，不叠在图上）。
 */
export const PortraitLightbox: React.FC<PortraitLightboxProps> = ({ hero, onClose }) => {
  /**
   * 画面模式跟随全局偏好（与选将页、详情弹层同一个 localStorage 键）。
   *
   * 刻意**不是**无条件上 3D：立绘模式下点「放大查看」的人想看的是立绘，
   * 给他一张卡面等于替换了他要的东西。切换器一并保留，两种都能到，
   * 3D 卡面只在卡面模式下出现。
   */
  const { mode, setMode } = useCardArtMode();

  /** 最近一次拖动结束的时刻，用来吞掉随之而来的那次 click */
  const dragEndAt = useRef(0);
  const handleDragEnd = useCallback(() => { dragEndAt.current = performance.now(); }, []);
  const handleBackdropClick = useCallback(() => {
    if (performance.now() - dragEndAt.current < DRAG_CLOSE_GUARD_MS) return;
    onClose();
  }, [onClose]);

  /**
   * 最新的 onClose。
   *
   * 调用方每次渲染都会传进来一个新的 onClose（内联箭头），若把它放进下面 effect
   * 的依赖里，监听器就会在每次渲染时被摘掉再挂回；而 App 的全局 Esc 处理器会在
   * 同一次派发里触发渲染，正好把「摘掉、还没挂回」那一刻的 Esc 吃掉——表现就是
   * Esc 时灵时不灵。这里用 ref 取最新值，effect 只在换武将时重订阅。
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!hero) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hero]);

  if (!hero) return null;

  const fullCard = heroFullCard2x(hero);
  /** 「卡面模式 + 确有全卡面」看卡面，其余（含无卡面的马云禄/蔡贞姬）看立绘。
   *  两种图都进 3D 查看器：立绘以前是静态 <img>，与详情弹窗的 3D 立绘不一致；
   *  WebGL2 不可用时查看器内部自动降级为静态图，行为不劣于旧版。 */
  const cardArt = mode === 'card' && fullCard !== null;
  const artSrc = cardArt ? (fullCard as string) : heroPortrait2x(hero.avatarUrl);
  const label = cardArt ? `${hero.name} 卡面` : `${hero.name} 立绘`;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/88 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* 2:3 定尺寸宿主：88vw 与 84vh 谁先卡住就用谁，两者互为 2:3，
            所以这个框既不会溢出视口，也不会给引擎一个零尺寸挂载点 */}
        <div className="w-[min(88vw,56vh)] h-[min(84vh,132vw)]">
          <Card3DViewer
            src={artSrc}
            meta={{ name: hero.name, faction: hero.kingdom }}
            alt={label}
            controls
            onDragEnd={handleDragEnd}
          />
        </div>
        {/* 说明行 */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[#e8cf94]">
          <span className="font-ancient text-xl">{hero.name}</span>
          <span className="text-xs opacity-75">
            {hero.kingdom} · {hero.maxHp} 体力 ·【{hero.skillName}】
          </span>
        </div>
        {/* 切换器只在确有全卡面时出现：否则「卡面」按下去没有可显示的东西 */}
        {fullCard !== null && (
          <div className="mt-2">
            <CardArtToggle mode={mode} onChange={setMode} />
          </div>
        )}
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
