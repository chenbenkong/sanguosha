import React from 'react';
import { Card } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/** 五谷丰登：点击选中 + 确认 */
export const WuguModal: React.FC<{
  playerName: string;
  cards: Card[];
  selected: Card | null;
  left: number | null;
  seconds: number;
  onSelect: (c: Card) => void;
  onConfirm: () => void;
}> = ({ playerName, cards, selected, left, seconds, onSelect, onConfirm }) => (
  <div className="absolute inset-0 z-[150] modal-mask flex items-center justify-center p-4">
    <div className="modal-frame max-w-5xl w-[95%] p-8">
      <div className="text-center mb-6">
        <h3 className="modal-title text-3xl font-ancient mb-3">五谷丰登</h3>
        <p className="modal-text text-lg">{playerName}，请选择一张牌</p>
        <p className={`mt-1 text-sm ${(left ?? 0) <= 5 ? 'text-[#e0705f] animate-pulse' : 'text-[var(--gold-strong)]'}`}>
          <span className="text-lg font-bold tabular-nums">{left ?? seconds}</span> 秒内请选择，超时自动选取
        </p>
        <div className="w-40 modal-divider mx-auto mt-3"></div>
      </div>

      <div className="flex justify-center gap-5 mb-6 flex-wrap px-4">
        {cards.map((card, index) => {
          const isSelected = selected?.id === card.id;
          return (
            <div
              key={card.id}
              onClick={() => onSelect(card)}
              className={`group relative cursor-pointer transition-all duration-300 ${
                isSelected ? 'scale-110 -translate-y-4 z-10' : 'hover:scale-105 hover:-translate-y-2'
              }`}
              style={{ animation: `fade-in-up 0.4s ease-out ${index * 80}ms both` }}
            >
              <div className={`absolute inset-0 rounded-lg transition-all duration-300 ${
                isSelected
                  ? 'bg-[#d4af37]/40 shadow-[0_0_40px_rgba(212,175,55,0.8)] scale-110'
                  : 'bg-[#d4af37]/0 group-hover:bg-[#d4af37]/20 group-hover:shadow-[0_0_30px_rgba(212,175,55,0.6)]'
              }`}></div>

              {isSelected && (
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#d4af37] text-[#1a1410] flex items-center justify-center text-lg font-bold z-20 shadow-lg animate-bounce">
                  ✓
                </div>
              )}

              <div className="relative">
                <CardComponent card={card} />
              </div>

              <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                isSelected
                  ? 'bg-[#d4af37] text-[#1a1410] border-[#d4af37] scale-110'
                  : 'bg-[#d4af37]/20 text-[var(--gold)] border-[#d4af37]/40 opacity-0 group-hover:opacity-100'
              }`}>
                {index + 1}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={onConfirm}
          disabled={!selected}
          className={`px-10 py-3 rounded-full font-bold text-xl font-ancient tracking-widest transition-all duration-300 ${
            selected ? 'btn-gold' : 'btn-ink opacity-55'
          }`}
        >
          {selected ? '确认选择' : '请先选择一张牌'}
        </button>
      </div>
    </div>
  </div>
);
