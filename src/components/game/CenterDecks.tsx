import React from 'react';
import { Card } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/**
 * 中央牌堆 / 弃牌堆：绒面牌桌上的一个整体，弃牌堆有堆叠厚度，牌堆有层次与投影。
 *
 * memo：实测 30 秒对局 313 次父级渲染里，本组件 props 只有 deckLength / discardPile /
 * deckFx 真正变过 28~81 次，其余是父级重渲染带来的无效渲染（其中 309 次的唯一差异
 * 是内联的 onShowDiscard，已在 BattleScreen 侧改成稳定引用）。
 */
export const CenterDecks = React.memo(function CenterDecks({ deckLength, discardPile, deckFx, onShowDiscard }: {
  theme: 'dark' | 'light';
  deckLength: number;
  discardPile: Card[];
  deckFx: { kind: 'tap' | 'shuffle'; id: number } | null;
  onShowDiscard: () => void;
}) {
  const deckLayers = deckLength > 80 ? 3 : deckLength > 40 ? 2 : deckLength > 8 ? 1 : 0;
  return (
    <div data-region="center-decks" className="relative flex items-center gap-12 max-md:gap-6 z-[1]">
      <div className="relative group cursor-pointer" onClick={onShowDiscard} title="点击查看弃牌堆">
        <div className="deck-caption text-[var(--fs-13)] text-center mb-2 font-ancient tracking-wider transition-colors group-hover:text-[var(--gold)]">
          弃牌堆
        </div>
        {discardPile.length > 0 ? (
          <div className="relative">
            {discardPile.length > 1 && (
              <>
                <div className="deck-stack-layer absolute top-[7px] left-[7px] w-full h-full rounded-lg border rotate-2" />
                <div className="deck-stack-layer absolute top-[3px] left-[3px] w-full h-full rounded-lg border -rotate-1" />
              </>
            )}
            <div className="relative transition-transform duration-200 group-hover:scale-105">
              <div key={discardPile[discardPile.length - 1].id} className="discard-arrive">
                <CardComponent card={discardPile[discardPile.length - 1]} disabled />
              </div>
            </div>
            <div
              key={`dc-${discardPile.length}`}
              className="discard-count discard-badge absolute -bottom-3 -right-3 text-[var(--fs-13)] font-bold w-8 h-8 rounded-full flex items-center justify-center border-2"
            >
              {discardPile.length}
            </div>
            <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center pointer-events-none">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--gold-strong)] text-[var(--fs-12)] font-bold bg-[rgba(var(--shadow-rgb)/0.7)] px-2 py-1 rounded">查看</span>
            </div>
          </div>
        ) : (
          <div className="deck-empty w-24 h-36 rounded-lg flex items-center justify-center border border-dashed">
            <span className="font-ancient text-[var(--fs-13)] tracking-[0.2em] opacity-70">空</span>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="deck-caption text-[var(--fs-13)] text-center mb-2 font-ancient tracking-wider">牌堆</div>
        <div
          key={deckFx ? `${deckFx.kind}-${deckFx.id}` : 'deck'}
          className={`relative ${deckFx?.kind === 'tap' ? 'deck-tap' : ''} ${deckFx?.kind === 'shuffle' ? 'deck-shuffle' : ''}`}
        >
          {Array.from({ length: deckLayers }).map((_, i) => (
            <div
              key={i}
              className="deck-stack-layer absolute w-24 h-36 rounded-lg border"
              style={{
                top: `${(i + 1) * 3}px`,
                left: `${(i + 1) * 2}px`,
                transform: `rotate(${i % 2 === 0 ? 1.4 : -0.9}deg)`,
              }}
            />
          ))}

          <div className="deck-face w-24 h-36 rounded-lg relative overflow-hidden border-2">
            <div className="absolute inset-0 opacity-25" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 20 Q14 12 20 20 T32 20' stroke='%23c8a45c' stroke-width='0.8' fill='none'/%3E%3C/svg%3E")`,
              backgroundSize: '40px 40px'
            }}></div>

            <div className="absolute inset-1.5 border border-[rgba(var(--gold-rgb)/0.45)] rounded"></div>
            <div className="absolute inset-3 border border-[rgba(var(--gold-rgb)/0.2)] rounded-sm"></div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-12 h-12 rounded-md flex items-center justify-center -rotate-3 border border-[rgba(var(--gold-rgb)/0.6)]"
                style={{ background: 'linear-gradient(145deg, var(--cinnabar), color-mix(in srgb, var(--cinnabar) 78%, #000))', boxShadow: 'var(--shadow-1)' }}
              >
                <span className="font-ancient text-[var(--on-cinnabar)] text-2xl leading-none">殺</span>
              </div>
            </div>

            <div className="absolute bottom-2 inset-x-0 text-center text-[8px] tracking-[0.28em] text-[rgba(var(--gold-rgb)/0.45)]">
              三国杀
            </div>
          </div>

          <div className={`deck-badge absolute -bottom-3 -right-3 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors font-bold text-[var(--fs-13)] ${deckLength < 10 ? 'is-low animate-pulse' : ''}`}>
            {deckLength}
          </div>
        </div>

        {deckFx?.kind === 'shuffle' && (
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap font-ancient text-[var(--fs-11)] tracking-[0.18em] deck-fade px-2 py-0.5 rounded border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-2)_82%,transparent)] text-[var(--gold-strong)]">
            洗切中…
          </div>
        )}
      </div>
    </div>
  );
});
