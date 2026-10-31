import React from 'react';
import { Card, Suit, CardType } from '../types';

interface CardProps {
  card: Card;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  selected?: boolean;
  isHidden?: boolean;
  small?: boolean;
  canUseSkill?: boolean;
  skillName?: string;
}

// 卡牌主题：每个牌名一套专属配色（面底渐变 / 主色 / 墨字色）
const CARD_THEMES: Record<string, { face: string; accent: string; ink: string }> = {
  '杀': { face: 'from-[#f5efe2] via-[#efe6d3] to-[#e3d5ba]', accent: '#2b2b2b', ink: '#1c1c1c' },
  '闪': { face: 'from-[#eef4f8] via-[#e2ecf3] to-[#d3e2ec]', accent: '#33628c', ink: '#274b66' },
  '桃': { face: 'from-[#fdeef0] via-[#fadfe3] to-[#f3ccd4]', accent: '#b04a58', ink: '#8f3a46' },
  '酒': { face: 'from-[#faf3e0] via-[#f3e8cc] to-[#e8d8b0]', accent: '#9a6b1f', ink: '#7a5417' },
  '决斗': { face: 'from-[#f1ecf8] via-[#e7dff2] to-[#d8cbea]', accent: '#5b3d8f', ink: '#4a2f78' },
  '无中生有': { face: 'from-[#faf5e4] via-[#f4ecd2] to-[#ead9ac]', accent: '#a8842c', ink: '#8a6b20' },
  '南蛮入侵': { face: 'from-[#fbf0e2] via-[#f6e4cd] to-[#ecd2ae]', accent: '#a05c22', ink: '#834a1a' },
  '万箭齐发': { face: 'from-[#edeff9] via-[#e0e3f2] to-[#cdd2e6]', accent: '#3d4f96', ink: '#32407a' },
  '无懈可击': { face: 'from-[#eaf6f7] via-[#dceef0] to-[#c8e2e5]', accent: '#2e7d84', ink: '#226268' },
  '顺手牵羊': { face: 'from-[#edf7ee] via-[#dff0e1] to-[#c9e3cc]', accent: '#3e7d47', ink: '#2f6337' },
  '过河拆桥': { face: 'from-[#f9ecea] via-[#f3dad7] to-[#e6c2be]', accent: '#9c3a30', ink: '#7f2e26' },
  '乐不思蜀': { face: 'from-[#fbeef6] via-[#f6deeb] to-[#ecc4dc]', accent: '#a2497a', ink: '#863a64' },
  '火攻': { face: 'from-[#fdf0e4] via-[#fae2cc] to-[#f1cfa8]', accent: '#b35a1e', ink: '#934717' },
  '铁索连环': { face: 'from-[#f2f2f0] via-[#e8e8e4] to-[#d8d8d2]', accent: '#55584f', ink: '#44463f' },
  '兵粮寸断': { face: 'from-[#f0f2f4] via-[#e2e6ea] to-[#cfd6dc]', accent: '#4a5a68', ink: '#3b4854' },
  '五谷丰登': { face: 'from-[#fbf6e3] via-[#f6eecb] to-[#ece0a8]', accent: '#9a7d1e', ink: '#7d6517' },
  '桃园结义': { face: 'from-[#fceef0] via-[#f8dee2] to-[#f0c8ce]', accent: '#ad4450', ink: '#8e3742' },
  '借刀杀人': { face: 'from-[#eef1f5] via-[#e2e8ef] to-[#d0dae4]', accent: '#41607e', ink: '#344d66' },
  '闪电': { face: 'from-[#f2edf9] via-[#e9e1f4] to-[#d9cdea]', accent: '#6441a0', ink: '#523384' },
};

const TYPE_STAMPS: Record<CardType, { label: string; color: string; border: string }> = {
  [CardType.BASIC]: { label: '基', color: '#8a4a2a', border: '#8a4a2a' },
  [CardType.SCROLL]: { label: '锦', color: '#9c3423', border: '#9c3423' },
  [CardType.EQUIPMENT]: { label: '装', color: '#2f6e52', border: '#2f6e52' },
};

const CardComponent: React.FC<CardProps> = ({ card, onClick, disabled, selected, isHidden, small, canUseSkill = false, skillName = '' }) => {
  // ===== 牌背：黑漆描金 =====
  if (isHidden) {
    return (
      <div
        className={`
          relative rounded-lg overflow-hidden card-shadow flex items-center justify-center
          bg-gradient-to-br from-[#2b2320] via-[#221b18] to-[#161110]
          border-2 border-[#8b7355]/60
          ${small ? 'w-12 h-18' : 'w-20 h-28 md:w-24 md:h-36'}
          transition-transform duration-200
        `}
      >
        {/* 云纹底纹 */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 20 Q14 12 20 20 T32 20' stroke='%23d4af37' stroke-width='0.8' fill='none'/%3E%3C/svg%3E")`
        }}></div>
        {/* 双层描金内框 */}
        <div className="absolute inset-1.5 border border-[#d4af37]/50 rounded"></div>
        <div className="absolute inset-3 border border-[#d4af37]/25 rounded-sm"></div>
        {/* 中心印章 */}
        <div className="relative z-10 w-10 h-10 md:w-12 md:h-12 rounded-md rotate-[-4deg] flex items-center justify-center
          bg-gradient-to-br from-[#9e2b25] to-[#7a1f1a] border border-[#d4af37]/60 shadow-lg">
          <span className="font-ancient text-[#f3d9a4] text-xl md:text-2xl leading-none">殺</span>
        </div>
        {/* 底部小字 */}
        <div className="absolute bottom-1.5 inset-x-0 text-center text-[8px] tracking-[0.3em] text-[#d4af37]/50">
          SANGUOSHA
        </div>
      </div>
    );
  }

  const isRed = card.suit === Suit.HEART || card.suit === Suit.DIAMOND;
  const suitColor = isRed ? '#b03030' : '#26221e';
  const theme = CARD_THEMES[card.name] || { face: 'from-[#f5efe2] to-[#e3d5ba]', accent: '#2b2b2b', ink: '#1c1c1c' };
  const stamp = TYPE_STAMPS[card.type] || TYPE_STAMPS[CardType.BASIC];
  const bigName = card.name.length <= 2;

  return (
    <button
      onClick={(e) => {
        if (!disabled && onClick) {
          e.stopPropagation();
          onClick(e);
        }
      }}
      disabled={disabled}
      className={`
        group relative flex flex-col items-center text-left
        rounded-lg overflow-hidden transition-all duration-200
        bg-gradient-to-br ${theme.face}
        ${small ? 'w-16 h-24' : 'w-24 h-36 md:w-28 md:h-44'}
        mx-1 mb-2
        ${selected
          ? 'ring-4 ring-yellow-500 -translate-y-6 z-30 shadow-[0_10px_30px_rgba(0,0,0,0.55),0_0_20px_rgba(234,179,8,0.45)]'
          : `hover:-translate-y-3 card-shadow border ${isRed ? 'border-[#c98a7a]' : 'border-[#9a8a6a]'}`}
        ${disabled ? 'opacity-60 grayscale-[0.8]' : 'cursor-pointer'}
        ${canUseSkill && !disabled ? 'ring-2 ring-blue-500 animate-pulse' : ''}
      `}
    >
      {/* 外层描金细框 */}
      <div className="absolute inset-1 rounded-md border border-[#8a6f3c]/40 pointer-events-none"></div>
      {/* 内层细框 + 四角花 */}
      <div className="absolute inset-1.5 rounded-[5px] border border-[#8a6f3c]/25 pointer-events-none">
        <div className="absolute -top-px -left-px w-2.5 h-2.5 border-t border-l border-[#8a6f3c]/60"></div>
        <div className="absolute -top-px -right-px w-2.5 h-2.5 border-t border-r border-[#8a6f3c]/60"></div>
        <div className="absolute -bottom-px -left-px w-2.5 h-2.5 border-b border-l border-[#8a6f3c]/60"></div>
        <div className="absolute -bottom-px -right-px w-2.5 h-2.5 border-b border-r border-[#8a6f3c]/60"></div>
      </div>
      {/* 纸张光泽 */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent pointer-events-none"></div>

      {/* 左上角：点数 + 花色 竖排铭牌 */}
      <div className="absolute top-2 left-2 flex flex-col items-center leading-none z-10">
        <span className="font-serif font-bold text-lg md:text-xl tracking-tight" style={{ color: suitColor }}>
          {card.rank.replace(/\d+$/, '')}
        </span>
        <span className="text-base md:text-lg mt-0.5" style={{ color: suitColor }}>{card.suit}</span>
      </div>

      {/* 右上角：类型朱印 */}
      <div className="absolute top-2 right-2 z-10">
        <div
          className="w-5 h-5 md:w-6 md:h-6 rounded-[4px] rotate-6 flex items-center justify-center font-bold text-[10px] md:text-xs shadow-sm"
          style={{
            color: '#f6e8d8',
            backgroundColor: stamp.color,
            border: `1px solid ${stamp.border}`,
            boxShadow: 'inset 0 0 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.25)',
          }}
        >
          {stamp.label}
        </div>
      </div>

      {/* 中央：大字墨书 */}
      <div className="flex-1 flex items-center justify-center z-0 w-full px-2">
        <div
          className="font-ancient font-bold select-none text-center leading-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]"
          style={{ color: theme.ink }}
        >
          {bigName ? (
            <span className={small ? 'text-4xl' : 'text-5xl md:text-6xl'}>{card.name}</span>
          ) : (
            <span className="flex flex-col items-center">
              <span className={small ? 'text-3xl' : 'text-4xl md:text-5xl'}>{card.name[0]}</span>
              <span className={small ? 'text-xl' : 'text-2xl md:text-3xl'}>{card.name.slice(1)}</span>
            </span>
          )}
        </div>
      </div>

      {/* 底部：名称铭牌 */}
      <div className="z-10 w-full px-2 pb-2">
        <div className="border-t pt-1" style={{ borderColor: `${theme.accent}44` }}>
          <div
            className="font-ancient text-center leading-none tracking-[0.2em]"
            style={{ color: theme.ink, fontSize: small ? '13px' : '16px' }}
          >
            {card.name}
          </div>
          {canUseSkill && !disabled && (
            <div className="text-[8px] text-blue-700 font-bold text-center mt-0.5 animate-pulse">
              {skillName || '技能可用'}
            </div>
          )}
        </div>
      </div>

      {/* 技能指示器 */}
      {canUseSkill && !disabled && (
        <div className="absolute -top-2 -right-2 z-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white">
          技
        </div>
      )}

      {/* 选中状态光效 */}
      {selected && (
        <div className="absolute inset-0 bg-yellow-400/10 pointer-events-none"></div>
      )}
    </button>
  );
};

export default CardComponent;
