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

const CardComponent: React.FC<CardProps> = ({ card, onClick, disabled, selected, isHidden, small, canUseSkill = false, skillName = '' }) => {
  if (isHidden) {
    return (
      <div 
        className={`
          relative rounded-lg border-2 border-stone-600 bg-gradient-to-br from-stone-700 to-stone-900
          card-shadow flex items-center justify-center overflow-hidden
          ${small ? 'w-12 h-18' : 'w-20 h-28 md:w-24 md:h-36'}
          transition-transform duration-200
        `}
      >
        {/* 牌背纹理 */}
        <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]"></div>
        {/* 牌背装饰边框 */}
        <div className="absolute inset-2 border border-stone-500/50 rounded"></div>
        {/* 牌背中心图案 */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="text-stone-500 font-ancient text-2xl font-bold">三国杀</div>
          <div className="text-stone-600 text-xs mt-1">SANGUOSHA</div>
        </div>
      </div>
    );
  }

  const isRed = card.suit === Suit.HEART || card.suit === Suit.DIAMOND;
  const suitColor = isRed ? 'text-red-600' : 'text-stone-900';
  
  // 根据卡牌类型设置背景色
  const getCardBgColor = () => {
    switch (card.type) {
      case CardType.BASIC:
        return card.name === '杀' ? 'from-stone-100 to-stone-200' :
               card.name === '闪' ? 'from-blue-50 to-blue-100' :
               'from-rose-50 to-rose-100'; // 桃
      case CardType.SCROLL:
        return 'from-amber-50 to-amber-100';
      case CardType.EQUIPMENT:
        return 'from-emerald-50 to-emerald-100';
      default:
        return 'from-stone-50 to-stone-100';
    }
  };

  // 根据卡牌名称获取颜色
  const getCardNameColor = () => {
    switch (card.name) {
      case '杀': return 'text-stone-900';
      case '闪': return 'text-blue-800';
      case '桃': return 'text-rose-600';
      case '无中生有': return 'text-amber-700';
      case '决斗': return 'text-purple-800';
      case '南蛮入侵': return 'text-orange-800';
      case '万箭齐发': return 'text-indigo-800';
      case '无懈可击': return 'text-cyan-700';
      case '顺手牵羊': return 'text-emerald-700';
      case '过河拆桥': return 'text-red-700';
      case '乐不思蜀': return 'text-pink-700';
      default: return 'text-stone-900';
    }
  };

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
        relative flex flex-col items-center
        rounded-lg overflow-hidden transition-all duration-200
        bg-gradient-to-br ${getCardBgColor()}
        ${small ? 'w-16 h-24' : 'w-24 h-36 md:w-28 md:h-44'}
        mx-1 mb-2
        ${selected ? 'ring-4 ring-yellow-500 -translate-y-6 z-30 shadow-2xl' : `hover:-translate-y-3 card-shadow border-2 ${isRed ? 'border-red-300' : 'border-stone-300'}`}
        ${disabled ? 'opacity-60 grayscale-[0.8]' : 'cursor-pointer'}
        ${canUseSkill && !disabled ? 'ring-2 ring-blue-500 animate-pulse' : ''}
      `}
    >
      {/* 卡牌边框装饰 */}
      <div className="absolute inset-1 border border-stone-400/50 rounded pointer-events-none"></div>
      
      {/* 左上角 - 点数和花色 */}
      <div className="absolute top-1.5 left-1.5 flex flex-col items-center leading-none z-10">
        <span className={`text-xl font-bold font-serif ${suitColor}`}>{card.rank.replace(/\d+$/, '')}</span>
        <span className={`text-lg ${suitColor} mt-0.5`}>{card.suit}</span>
      </div>

      {/* 右上角 - 类型标识 */}
      <div className="absolute top-1.5 right-1.5 z-10">
        <div className={`
          text-[8px] px-1 py-0.5 rounded border font-bold
          ${card.type === CardType.BASIC ? 'bg-stone-200 border-stone-400 text-stone-700' :
            card.type === CardType.SCROLL ? 'bg-amber-200 border-amber-400 text-amber-800' :
            'bg-emerald-200 border-emerald-400 text-emerald-800'}
        `}>
          {card.type === CardType.BASIC ? '基' : card.type === CardType.SCROLL ? '锦' : '装'}
        </div>
      </div>

      {/* 中央 - 卡牌名称大字 */}
      <div className="flex-1 flex items-center justify-center z-0 w-full px-2">
        <div className={`
          font-ancient font-bold select-none text-center leading-tight
          ${small ? 'text-3xl' : 'text-4xl md:text-5xl'}
          ${getCardNameColor()}
        `}>
          {card.name.length <= 2 ? card.name : (
            <>
              <span>{card.name[0]}</span>
              <span className="block text-2xl md:text-3xl">{card.name.slice(1)}</span>
            </>
          )}
        </div>
      </div>

      {/* 底部 - 卡牌名称和描述 */}
      <div className="z-10 w-full px-2 pb-2">
        <div className="border-t border-stone-400/60 pt-1">
          <div className={`
            font-ancient text-center leading-none tracking-wide
            ${small ? 'text-sm' : 'text-base md:text-lg'}
            ${getCardNameColor()}
          `}>
            {card.name}
          </div>
          {canUseSkill && !disabled && (
            <div className="text-[8px] text-blue-600 font-bold text-center mt-0.5 animate-pulse">
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
