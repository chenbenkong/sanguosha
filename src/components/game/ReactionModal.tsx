import React from 'react';
import { Player, Card, CardName, Suit } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/** 手动的【杀】/【闪】/【无懈】响应弹窗 */
export const ReactionModal: React.FC<{
  me: Player;
  responder: Player;
  sourceName: string;
  neededCard: CardName;
  originalCardName: string;
  left: number | null;
  seconds: number;
  canWusheng: boolean;
  onPick: (card: Card) => void;
  onSkip: () => void;
}> = ({ me, responder, sourceName, neededCard, originalCardName, left, seconds, canWusheng, onPick, onSkip }) => {
  const canUseSkill = me.hero.name === '赵云'
    || (me.hero.name === '赵襄' && (me.meiyanMarks ?? 0) > 0);
  const skillCardName = neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN;
  const isWushengCard = (c: Card) => canWusheng && neededCard === CardName.SHA
    && (c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
  const canQingguo = me.hero.name === '甄姬' && neededCard === CardName.SHAN;
  const isQingguoCard = (c: Card) => canQingguo && (c.suit === Suit.SPADE || c.suit === Suit.CLUB);

  const usableCards = responder.hand.filter(c =>
    c.name === neededCard
    || (canUseSkill && c.name === skillCardName)
    || isWushengCard(c)
    || isQingguoCard(c)
    || (neededCard === CardName.WUXIE && c.name === CardName.WUXIE));

  return (
    <div className="absolute inset-0 z-40 modal-mask flex items-center justify-center p-4">
      <div className="modal-frame modal-frame-danger w-full max-w-xl p-6 text-center">
        <h3 className="modal-title text-3xl font-ancient mb-1">杀机已至</h3>
        <div className="modal-divider mb-3" />
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className={`text-xl font-bold tabular-nums ${(left ?? 0) <= 5 ? 'text-[#e0705f] animate-pulse' : 'text-[var(--gold-strong)]'}`}>
            {left ?? seconds}
          </span>
          <span className="modal-text-dim text-xs">秒内请选择，超时自动放弃</span>
        </div>
        <p className="modal-text mb-2 text-base leading-relaxed">
          <span className="font-bold text-[#f0dcae]">{sourceName}</span> 对你使用了
          <span className="font-bold text-[#e8a99f] mx-1">【{originalCardName}】</span>
        </p>
        <p className="modal-text-dim text-sm mb-5">
          需要打出【{neededCard}】来抵消
        </p>
        <div className="mb-6 flex justify-center gap-2 flex-wrap">
          {usableCards.length > 0 ? (
            usableCards.map(c => (
              <div key={c.id} className="transform hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => onPick(c)}>
                <CardComponent card={c} small />
              </div>
            ))
          ) : (
            <p className="modal-text-dim italic">手中无【{neededCard}】可挡...</p>
          )}
        </div>
        <div className="flex justify-center gap-4">
          <button
            onClick={onSkip}
            className="btn-ink px-6 py-2 rounded-lg font-ancient text-lg"
          >
            放弃/掉血
          </button>
        </div>
      </div>
    </div>
  );
};
