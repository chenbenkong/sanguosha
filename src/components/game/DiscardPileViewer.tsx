import React from 'react';
import { Card } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/** 弃牌堆查看器 */
export const DiscardPileViewer: React.FC<{ cards: Card[]; onClose: () => void }> = ({ cards, onClose }) => (
  <div className="absolute inset-0 z-[90] modal-mask flex items-center justify-center p-4" onClick={onClose}>
    <div className="modal-shell max-w-3xl w-[92%] max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#8b7355]/35">
        <h3 className="modal-title text-xl font-ancient">弃牌堆 <span className="text-sm opacity-60 tracking-normal normal-case">{cards.length} 张</span></h3>
        <button
          onClick={onClose}
          className="btn-ink w-8 h-8 rounded-full flex items-center justify-center text-sm"
          aria-label="关闭弃牌堆"
        >✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {cards.length === 0 ? (
          <p className="modal-text-dim text-center py-10">弃牌堆空空如也</p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {[...cards].reverse().map(card => (
              <div key={card.id} title={card.description}>
                <CardComponent card={card} small disabled />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);
