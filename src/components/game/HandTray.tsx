import React from 'react';
import { Card, CardName, GamePhase, LogEntry, Player, Suit } from '../../../types';
import CardComponent from '../../../components/CardComponent';

/** 手牌区：扇形排列 / 选中态 / 反应模式可用性 / 新摸牌飞入 / 左下角标 */
export const HandTray: React.FC<{
  theme: 'dark' | 'light';
  compactHand: boolean;
  uiHiddenLog: boolean;
  lastLog?: LogEntry;
  me: Player;
  deckLength: number;
  discardLength: number;
  onShowDiscard: () => void;
  disabled: boolean;
  phase: GamePhase;
  isMyTurn: boolean;
  isAiTakeover: boolean;
  isZhihengMode: boolean;
  isLijianMode: boolean;
  isRendeMode: boolean;
  isZhangbaMode: boolean;
  lijianSelectedCardId: string | null;
  selectedCardIds: string[];
  rendeSelectedCardIds: string[];
  activeSelectedId: string | null;
  pendingReaction: { cardName: CardName } | null;
  canWusheng: boolean;
  drawPulse: { count: number; id: number } | null;
  layoutDensity: string;
  isMobileHand: boolean;
  handLarge: boolean;
  onCardClick: (card: Card) => void;
}> = ({
  theme, compactHand, uiHiddenLog, lastLog, me, deckLength, discardLength, onShowDiscard, disabled,
  phase, isMyTurn, isAiTakeover, isZhihengMode, isLijianMode, isRendeMode, isZhangbaMode,
  lijianSelectedCardId, selectedCardIds, rendeSelectedCardIds, activeSelectedId, pendingReaction, canWusheng,
  drawPulse, layoutDensity, isMobileHand, handLarge, onCardClick,
}) => (
  <div data-region="hand" className={`w-full overflow-x-auto overflow-y-visible px-2 sm:px-4 pb-1 scrollbar-hide flex relative ${compactHand ? 'pt-3' : 'pt-4 sm:pt-5'}`} style={{ zIndex: 10, minHeight: 'var(--hand-min)' }}>
    <div className="absolute inset-x-4 bottom-0 h-32 rounded-t-2xl pointer-events-none bg-gradient-to-t from-[color-mix(in_srgb,var(--surface-0)_85%,transparent)] to-transparent"></div>
    <div className="hand-tray" aria-hidden="true" />
    <div className={`mobile-log ${uiHiddenLog ? 'hidden' : 'md:hidden'}`}>
      {lastLog && <div key={lastLog.id} className="mobile-log-line">{lastLog.text}</div>}
    </div>

    <div className="absolute left-3 bottom-3 hidden md:flex items-center gap-3 z-20">
      <div className="flex items-center gap-1.5 pointer-events-none">
        <span className="hand-count-label text-[var(--fs-11)] tracking-[0.28em]">手牌</span>
        <span className="hand-count-value font-ancient text-[var(--fs-20)] leading-none">{me.hand.length}</span>
      </div>
      <button
        onClick={onShowDiscard}
        disabled={disabled}
        className="pointer-events-auto hand-chip inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border text-[var(--fs-11)] leading-none transition-colors hover:text-[var(--gold-strong)]"
        aria-label={`查看弃牌堆，共 ${discardLength} 张`}
        title="查看弃牌堆"
      >
        <span className="opacity-70">弃牌堆</span>
        <b className="font-bold tabular-nums">{discardLength}</b>
      </button>
    </div>

    <div className="absolute right-3 bottom-3 hidden md:flex items-center gap-2 z-20">
      <div
        className="hand-chip inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border text-[var(--fs-11)] leading-none"
        title="牌堆剩余张数"
      >
        <span className="opacity-70">牌堆</span>
        <b className="font-bold tabular-nums">{deckLength}</b>
      </div>
    </div>

    <div className="flex -space-x-2 sm:space-x-1 md:space-x-2 items-end px-4 pb-2 relative mx-auto shrink-0 w-max">
      {me.hand.map((card, index) => {
        const isSelected = (phase === GamePhase.DISCARD || isZhihengMode || (isLijianMode && lijianSelectedCardId === card.id) || isRendeMode)
          ? selectedCardIds.includes(card.id) || (isLijianMode && lijianSelectedCardId === card.id) || (isRendeMode && rendeSelectedCardIds.includes(card.id))
          : activeSelectedId === card.id;
        let isPlayable = isMyTurn && !isAiTakeover;
        if (phase === GamePhase.DISCARD && !isAiTakeover) isPlayable = true;
        else if (phase !== GamePhase.ACTION && phase !== GamePhase.DISCARD) isPlayable = false;

        if (pendingReaction && !isAiTakeover) {
          const neededCard = pendingReaction.cardName;
          const canUseSkill = me.hero.name === '赵云'
            || (me.hero.name === '赵襄' && (me.meiyanMarks ?? 0) > 0);
          const skillCardName = neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN;
          const isWushengCard = canWusheng && neededCard === CardName.SHA
            && (card.suit === Suit.HEART || card.suit === Suit.DIAMOND);
          const isQingguoCard = me.hero.name === '甄姬' && neededCard === CardName.SHAN
            && (card.suit === Suit.SPADE || card.suit === Suit.CLUB);

          isPlayable = card.name === neededCard
            || (canUseSkill && card.name === skillCardName)
            || isWushengCard
            || isQingguoCard
            || (neededCard === CardName.WUXIE && card.name === CardName.WUXIE);
        }

        const lockOthers = (phase === GamePhase.ACTION && !isAiTakeover && !isZhihengMode && !isRendeMode && !isZhangbaMode && selectedCardIds.length > 0);
        const isZhaoyun = me.hero.name === '赵云';
        const canUseLongdan = isZhaoyun && ([CardName.SHA, CardName.SHAN].includes(card.name) && isPlayable);

        const handCount = me.hand.length;
        const offset = index - (handCount - 1) / 2;
        const fanRot = Math.max(-24, Math.min(24, offset * 3.2));
        const fanY = Math.abs(offset) * Math.abs(offset) * 1.6 - (layoutDensity === 'ultra' ? 6 : 0);

        const drawStartIndex = drawPulse ? me.hand.length - drawPulse.count : me.hand.length;
        const isNewDrawn = index >= drawStartIndex;

        return (
          <div
            key={card.id}
            className={`
              fan-card origin-bottom relative shrink-0
              ${isSelected ? 'is-selected' : ''}
              ${lockOthers && !isSelected ? 'pointer-events-none' : ''}
            `}
            style={{
              '--fan-rot': `${fanRot}deg`,
              '--fan-y': `${fanY}px`,
            } as React.CSSProperties}
          >
            <div
              className={isNewDrawn ? 'draw-in' : undefined}
              style={isNewDrawn ? { animationDelay: `${(index - drawStartIndex) * 70}ms` } : undefined}
            >
              <CardComponent
                card={card}
                selected={isSelected}
                disabled={!isPlayable || (lockOthers && !isSelected)}
                onClick={onCardClick}
                canUseSkill={canUseLongdan}
                skillName="龙胆"
                small={isMobileHand}
                large={handLarge}
              />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
