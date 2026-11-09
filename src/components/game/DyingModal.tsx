import React from 'react';
import { Player, CardName, Suit } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/** 濒死求桃：显示受害者、当前被询问者与其可用的救牌 */
export const DyingModal: React.FC<{
  me: Player;
  victim?: Player;
  rescuer?: Player;
  rescuerId: number | null;
  hasTao: boolean;
  hasJiu: boolean;
  hasJijiu?: boolean;
  left: number | null;
  seconds: number;
  onUse: () => void;
  onSkip: () => void;
}> = ({ me, victim, rescuer, rescuerId, hasTao, hasJiu, hasJijiu, left, seconds, onUse, onSkip }) => {
  const isMe = rescuerId === me.id;
  const canSaveCard = (name: string, suit: Suit) =>
    name === CardName.TAO || name === CardName.JIU
    || (!!hasJijiu && (suit === Suit.HEART || suit === Suit.DIAMOND));
  const hasAnySave = me.hand.some(c => canSaveCard(c.name, c.suit));

  return (
    <div className="absolute inset-0 z-[200] modal-mask flex items-center justify-center p-4">
      <div className="modal-frame modal-frame-danger w-full max-w-lg p-6 text-center">
        <h3 className="modal-title text-3xl font-ancient mb-1">💀 濒死求桃</h3>
        <div className="modal-divider mb-3" />
        {isMe && (
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className={`text-xl font-bold tabular-nums ${(left ?? 0) <= 5 ? 'text-[#e0705f] animate-pulse' : 'text-[#e8cf94]'}`}>
              {left ?? seconds}
            </span>
            <span className="modal-text-dim text-xs">秒内请选择，超时自动放弃</span>
          </div>
        )}
        <div className="modal-text-dim text-xs mb-4">
          目标: {victim?.hero.name} | 当前体力: {victim?.hp}/{victim?.maxHp}
        </div>

        <div className={`mb-4 p-3 rounded-lg border transition-all duration-300 ${
          isMe ? 'bg-[#1b3024]/45 border-[#6a9a80]/60 animate-pulse' : 'bg-black/25 border-[#8b7355]/30'
        }`}>
          <p className="modal-text-dim text-sm">当前询问</p>
          <p className={`text-xl font-bold ${isMe ? 'text-[#9fd4b4]' : 'text-[#d4af37]'}`}>
            {isMe ? '🔥 轮到你了！' : rescuer?.hero.name}
          </p>
          {isMe && (
            <p className="text-[#a8d4bb] text-sm mt-1">
              {hasTao && hasJiu
                ? '请选择是否使用【桃】或【酒】救援'
                : hasTao
                  ? '请选择是否使用【桃】救援'
                  : hasJiu
                    ? '请选择是否使用【酒】救援'
                    : '请选择是否使用红色牌发动「急救」'}
            </p>
          )}
        </div>

        <p className="modal-text mb-6 text-base leading-relaxed">
          <span className="font-bold text-[#e8a99f]">{victim?.hero.name}</span> 处于濒死状态，需要【桃】或【酒】来救命！
        </p>

        {isMe ? (
          <>
            <div className="mb-6 flex justify-center gap-2 flex-wrap">
              {me.hand.map(card => {
                const ok = canSaveCard(card.name, card.suit);
                const cardType = card.name === CardName.TAO ? '桃' : card.name === CardName.JIU ? '酒' : '急救';
                return (
                  <div
                    key={card.id}
                    className={`transform transition-all duration-200 relative
                      ${ok ? 'scale-110 hover:scale-125 shadow-yellow-500/50 cursor-pointer' : 'opacity-30 grayscale pointer-events-none'}
                    `}
                    onClick={() => { if (ok) onUse(); }}
                  >
                    <CardComponent card={card} small />
                    {ok && (
                      <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] px-1 rounded border border-white animate-pulse">
                        点击使用{cardType}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-6">
              <button
                onClick={onUse}
                disabled={!hasAnySave}
                className={`px-8 py-3 rounded-lg font-ancient text-xl ${hasAnySave ? 'btn-gold' : 'btn-ink opacity-45'}`}
              >
                {hasTao ? '使用桃' : hasJiu ? '使用酒' : '使用急救'}
              </button>
              <button
                onClick={onSkip}
                className="px-8 py-3 rounded-lg font-ancient text-xl bg-[#5e1a15] text-[#f0c8c2] border border-[#c86b62]/70 hover:bg-[#7a221b] hover:text-[#ffe4de] hover:scale-105 transition-all"
              >
                不救
              </button>
            </div>
          </>
        ) : (
          <div className="p-4 bg-black/25 rounded-lg border border-[#8b7355]/25">
            <p className="modal-text-dim">等待 <span className="text-[#d4af37] font-bold">{rescuer?.hero.name}</span> 决策中...</p>
            <div className="mt-3 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4af37]"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
