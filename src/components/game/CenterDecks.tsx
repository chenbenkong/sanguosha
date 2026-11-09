import React from 'react';
import { Card } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/** 中央牌堆 / 弃牌堆 */
export const CenterDecks: React.FC<{
  theme: 'dark' | 'light';
  deckLength: number;
  discardPile: Card[];
  deckFx: { kind: 'tap' | 'shuffle'; id: number } | null;
  onShowDiscard: () => void;
}> = ({ theme, deckLength, discardPile, deckFx, onShowDiscard }) => (
  <div data-region="center-decks" className="relative flex items-center gap-12 max-md:gap-6 z-[1]">
    <div className="relative group cursor-pointer" onClick={onShowDiscard} title="点击查看弃牌堆">
      <div className={`text-sm text-center mb-2 font-ancient tracking-wider transition-colors ${theme === 'dark' ? 'text-stone-400 group-hover:text-yellow-500' : 'text-[#5c5854] group-hover:text-[#8b6914]'}`}>弃牌堆</div>
      {discardPile.length > 0 ? (
        <div className="relative">
          {discardPile.length > 1 && (
            <>
              <div className="absolute top-[7px] left-[7px] w-full h-full rounded-lg bg-[#191410] border border-[#5a4a38]/40 rotate-2" />
              <div className="absolute top-[3px] left-[3px] w-full h-full rounded-lg bg-[#221b16] border border-[#6a5642]/45 -rotate-1" />
            </>
          )}
          <div className="relative transition-transform duration-200 group-hover:scale-105">
            <div key={discardPile[discardPile.length - 1].id} className="discard-arrive">
              <CardComponent card={discardPile[discardPile.length - 1]} disabled />
            </div>
          </div>
          <div
            key={`dc-${discardPile.length}`}
            className="discard-count absolute -bottom-3 -right-3 bg-gradient-to-br from-stone-600 to-stone-800 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center border-2 border-stone-500 shadow-lg"
          >
            {discardPile.length}
          </div>
          <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-400 text-xs font-bold bg-black/70 px-2 py-1 rounded">查看</span>
          </div>
        </div>
      ) : (
        <div className={`w-24 h-36 rounded-lg flex items-center justify-center border border-dashed ${theme === 'dark' ? 'border-[#6a5642]/60 text-[#7d6d56] bg-black/30' : 'border-[#c4a77d]/60 text-[#a09585] bg-[#f5f0eb]/40'}`}>
          <span className="font-ancient text-sm tracking-[0.2em] opacity-70">空</span>
        </div>
      )}
    </div>

    <div className="relative">
      <div className={`text-sm text-center mb-2 font-ancient tracking-wider ${theme === 'dark' ? 'text-stone-400' : 'text-[#5c5854]'}`}>牌堆</div>
      <div
        key={deckFx ? `${deckFx.kind}-${deckFx.id}` : 'deck'}
        className={`relative ${deckFx?.kind === 'tap' ? 'deck-tap' : ''} ${deckFx?.kind === 'shuffle' ? 'deck-shuffle' : ''}`}
      >
        {Array.from({ length: deckLength > 80 ? 3 : deckLength > 40 ? 2 : deckLength > 8 ? 1 : 0 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-24 h-36 rounded-lg"
            style={{
              top: `${(i + 1) * 3}px`,
              left: `${(i + 1) * 2}px`,
              background: i % 2 === 0 ? '#221b16' : '#191410',
              border: '1px solid rgba(106, 86, 66, 0.45)',
              transform: `rotate(${i % 2 === 0 ? 1.4 : -0.9}deg)`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            }}
          />
        ))}

        <div
          className="w-24 h-36 rounded-lg relative overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.55)] border-2 border-[#8b7355]/70"
          style={{ background: 'linear-gradient(155deg, #2b2320 0%, #221b18 55%, #151110 100%)' }}
        >
          <div className="absolute inset-0 opacity-25" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 20 Q14 12 20 20 T32 20' stroke='%23c8a45c' stroke-width='0.8' fill='none'/%3E%3C/svg%3E")`,
            backgroundSize: '40px 40px'
          }}></div>

          <div className="absolute inset-1.5 border border-[#c8a45c]/45 rounded"></div>
          <div className="absolute inset-3 border border-[#c8a45c]/20 rounded-sm"></div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-12 h-12 rounded-md flex items-center justify-center -rotate-3 border border-[#c8a45c]/60 shadow-lg"
              style={{ background: 'linear-gradient(145deg, #9e2b25, #7a1f1a)' }}
            >
              <span className="font-ancient text-[#f3d9a4] text-2xl leading-none">殺</span>
            </div>
          </div>

          <div className="absolute bottom-2 inset-x-0 text-center text-[8px] tracking-[0.28em] text-[#c8a45c]/45">
            三国杀
          </div>
        </div>

        <div className={`absolute -bottom-3 -right-3 w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-lg transition-colors font-bold text-sm ${
          deckLength < 10
            ? 'bg-[#9e2b25] border-red-400/70 text-[#f7e7cf] ring-2 ring-red-500/30 animate-pulse'
            : 'bg-[#c8a45c] border-[#e0c07a]/80 text-[#2a1f14]'
        }`}>
          {deckLength}
        </div>
      </div>

      {deckFx?.kind === 'shuffle' && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap font-ancient text-[11px] tracking-[0.18em] text-[#f2dca5] bg-black/75 border border-[#c8a45c]/40 px-2 py-0.5 rounded deck-fade">
          洗切中…
        </div>
      )}
    </div>
  </div>
);
