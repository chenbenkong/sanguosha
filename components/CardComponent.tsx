import React from 'react';
import { Card, Suit, CardType } from '../types';

interface CardProps {
  card: Card;
  /** 回调携带 card 本体，便于父级用稳定引用（配合 memo 跳过无效重渲染） */
  onClick?: (card: Card, e?: React.MouseEvent) => void;
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
  // —— 装备牌 ——
  '青釭剑': { face: 'from-[#eef1f6] via-[#e3e8f1] to-[#cfd7e4]', accent: '#3c5a80', ink: '#2f4766' },
  '青龙偃月刀': { face: 'from-[#eef7f0] via-[#e0efe4] to-[#c8dfd0]', accent: '#2f6e52', ink: '#255741' },
  '方天画戟': { face: 'from-[#f6efe2] via-[#ece0cc] to-[#dcc9a8]', accent: '#8a6a2a', ink: '#70541f' },
  '诸葛连弩': { face: 'from-[#f2ece6] via-[#e7ddd2] to-[#d6c7b6]', accent: '#7a5230', ink: '#634126' },
  '八卦阵': { face: 'from-[#f1f5f2] via-[#e3ebe6] to-[#cfdad3]', accent: '#3f6b58', ink: '#325545' },
  '仁王盾': { face: 'from-[#f4f1ed] via-[#e9e4dd] to-[#d9d1c6]', accent: '#5b5148', ink: '#4a413a' },
  '赤兔': { face: 'from-[#fbeeee] via-[#f4dcdc] to-[#e7c3c3]', accent: '#9a3a34', ink: '#7e2e29' },
  '大宛': { face: 'from-[#f3eefb] via-[#e8e0f4] to-[#d6c9e8]', accent: '#5b3d8f', ink: '#4a2f78' },
  '的卢': { face: 'from-[#eef2fb] via-[#e0e7f6] to-[#cbd6ea]', accent: '#3c5a90', ink: '#2f476f' },
  '绝影': { face: 'from-[#f0f1f3] via-[#e4e6ea] to-[#ced2d8]', accent: '#4a4f58', ink: '#3c4048' },
};

// 卡面插画（取自开源三国杀项目 noname 的官方风格卡图）
const CARD_ART: Record<string, string> = {
  '杀': 'images/cards/sha.png',
  '闪': 'images/cards/shan.png',
  '桃': 'images/cards/tao.png',
  '酒': 'images/cards/jiu.png',
  '决斗': 'images/cards/juedou.png',
  '无中生有': 'images/cards/wuzhong.png',
  '南蛮入侵': 'images/cards/nanman.png',
  '万箭齐发': 'images/cards/wanjian.png',
  '无懈可击': 'images/cards/wuxie.png',
  '顺手牵羊': 'images/cards/shunshou.png',
  '过河拆桥': 'images/cards/guohe.png',
  '乐不思蜀': 'images/cards/lebu.png',
  '火攻': 'images/cards/huogong.png',
  '铁索连环': 'images/cards/tiesuo.png',
  '兵粮寸断': 'images/cards/bingliang.png',
  '五谷丰登': 'images/cards/wugu.png',
  '桃园结义': 'images/cards/taoyuan.png',
  '借刀杀人': 'images/cards/jiedao.png',
  '闪电': 'images/cards/shandian.png',
  '青釭剑': 'images/cards/qinggang.png',
  '青龙偃月刀': 'images/cards/qinglong.png',
  '方天画戟': 'images/cards/fangtian.png',
  '诸葛连弩': 'images/cards/zhuge.png',
  '八卦阵': 'images/cards/bagua.png',
  '仁王盾': 'images/cards/renwang.png',
  '赤兔': 'images/cards/chitu.png',
  '大宛': 'images/cards/dawan.png',
  '的卢': 'images/cards/dilu.png',
  '绝影': 'images/cards/jueying.png',
};

const CARD_BACK = 'images/cards/card-back.jpg';

const TYPE_STAMPS: Record<CardType, { label: string; color: string; border: string }> = {
  [CardType.BASIC]: { label: '基', color: '#8a4a2a', border: '#8a4a2a' },
  [CardType.SCROLL]: { label: '锦', color: '#9c3423', border: '#9c3423' },
  [CardType.EQUIPMENT]: { label: '装', color: '#2f6e52', border: '#2f6e52' },
};

const CardComponent: React.FC<CardProps> = ({ card, onClick, disabled, selected, isHidden, small, canUseSkill = false, skillName = '' }) => {
  // ===== 牌背：真实牌背图 =====
  if (isHidden) {
    return (
      <div
        className={`
          relative rounded-lg overflow-hidden card-shadow
          border-2 border-[#8b7355]/70
          ${small ? 'w-12 h-18' : 'w-20 h-28 md:w-24 md:h-36'}
          transition-transform duration-200
        `}
      >
        <img
          src={CARD_BACK}
          alt="牌背"
          loading="lazy"
          draggable={false}
          className="w-full h-full object-cover select-none"
        />
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
      </div>
    );
  }

  const isRed = card.suit === Suit.HEART || card.suit === Suit.DIAMOND;
  const suitColor = isRed ? '#b03030' : '#26221e';
  const theme = CARD_THEMES[card.name] || { face: 'from-[#f5efe2] to-[#e3d5ba]', accent: '#2b2b2b', ink: '#1c1c1c' };
  const stamp = TYPE_STAMPS[card.type] || TYPE_STAMPS[CardType.BASIC];
  const bigName = card.name.length <= 2;
  const art = CARD_ART[card.name];

  return (
    <button
      onClick={(e) => {
        if (!disabled && onClick) {
          e.stopPropagation();
          onClick(card, e);
        }
      }}
      disabled={disabled}
      title={`${card.name}（${card.suit} ${card.rank.replace(/\d+$/, '')}）：${card.description}`}
      className={`
        group relative flex flex-col items-center text-left
        rounded-lg overflow-hidden transition-all duration-200
        bg-gradient-to-br ${theme.face}
        ${small ? 'w-16 h-24' : 'w-[76px] h-[114px] sm:w-24 sm:h-36 md:w-28 md:h-44'}
        mx-1 mb-2
        ${selected
          ? 'ring-4 ring-yellow-500 z-30 shadow-[0_10px_30px_rgba(0,0,0,0.55),0_0_20px_rgba(234,179,8,0.45)]'
          : `card-shadow border ${isRed ? 'border-[#c98a7a]' : 'border-[#9a8a6a]'}`}
        ${disabled ? 'opacity-60 grayscale-[0.8]' : 'cursor-pointer'}
        ${canUseSkill && !disabled ? 'ring-2 ring-blue-500 animate-pulse' : ''}
      `}
    >
      {/* 插画区 */}
      {art && (
        <div className={`relative w-full ${small ? 'h-[54%]' : 'h-[56%]'} overflow-hidden shrink-0`}>
          <img
            src={art}
            alt={card.name}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover select-none transition-transform duration-300 group-hover:scale-[1.06]"
          />
          {/* 上缘压暗，保证左上角点数可读 */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent pointer-events-none" />
          {/* 下缘融入牌面 */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(255,250,240,0) 0%, rgba(255,250,240,0.30) 70%, rgba(255,250,240,0.62) 100%)' }}
          />
        </div>
      )}

      {/* 外层描金细框 */}
      <div className="absolute inset-1 rounded-md border border-[#8a6f3c]/40 pointer-events-none z-10"></div>
      <div className="absolute inset-1.5 rounded-[5px] border border-[#8a6f3c]/25 pointer-events-none z-10">
        <div className="absolute -top-px -left-px w-2.5 h-2.5 border-t border-l border-[#8a6f3c]/60"></div>
        <div className="absolute -top-px -right-px w-2.5 h-2.5 border-t border-r border-[#8a6f3c]/60"></div>
        <div className="absolute -bottom-px -left-px w-2.5 h-2.5 border-b border-l border-[#8a6f3c]/60"></div>
        <div className="absolute -bottom-px -right-px w-2.5 h-2.5 border-b border-r border-[#8a6f3c]/60"></div>
      </div>
      {/* 纸张光泽 */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent pointer-events-none"></div>

      {/* 左上角：点数 + 花色 */}
      <div className="absolute top-1.5 left-1.5 flex flex-col items-center leading-none z-20">
        <span
          className={`font-serif font-bold ${small ? 'text-sm' : 'text-lg md:text-xl'} tracking-tight`}
          style={{ color: suitColor, textShadow: art ? '0 1px 2px rgba(255,255,255,0.85)' : undefined }}
        >
          {card.rank.replace(/\d+$/, '')}
        </span>
        <span
          className={`${small ? 'text-xs' : 'text-sm md:text-base'} mt-0.5`}
          style={{ color: suitColor, textShadow: art ? '0 1px 2px rgba(255,255,255,0.85)' : undefined }}
        >
          {card.suit}
        </span>
      </div>

      {/* 右上角：类型朱印 */}
      <div className="absolute top-1.5 right-1.5 z-20">
        <div
          className={`${small ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 md:w-6 md:h-6 text-[10px] md:text-xs'} rounded-[4px] rotate-6 flex items-center justify-center font-bold shadow-sm`}
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

      {/* 文字区：花色水印 + 牌名 */}
      <div className="relative flex-1 flex flex-col items-center justify-center w-full px-1 pb-1 z-10">
        <span
          className="absolute font-serif select-none pointer-events-none"
          style={{ color: suitColor, opacity: 0.08, fontSize: small ? 44 : 62, lineHeight: 1 }}
        >
          {card.suit}
        </span>
        <div
          className="relative font-ancient font-bold select-none text-center leading-tight"
          style={{ color: theme.ink, textShadow: '0 1px 0 rgba(255,255,255,0.55)' }}
        >
          {bigName ? (
            <span className={small ? 'text-2xl' : 'text-2xl sm:text-3xl md:text-4xl'}>{card.name}</span>
          ) : (
            <span className="flex flex-col items-center leading-none">
              <span className={small ? 'text-xl' : 'text-xl sm:text-2xl md:text-3xl'}>{card.name[0]}</span>
              <span className={small ? 'text-base' : 'text-base sm:text-lg md:text-xl'}>{card.name.slice(1)}</span>
            </span>
          )}
        </div>
        <div className="relative flex items-center gap-1 mt-0.5">
          <span className="font-serif leading-none" style={{ color: suitColor, fontSize: small ? 9 : 11 }}>{card.suit}</span>
          <span className="leading-none" style={{ color: suitColor, fontSize: small ? 8 : 10 }}>{card.rank.replace(/\d+$/, '')}</span>
        </div>
        {canUseSkill && !disabled && (
          <div className="text-[8px] text-blue-700 font-bold text-center mt-0.5 animate-pulse">
            {skillName || '技能可用'}
          </div>
        )}
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

export default React.memo(CardComponent);
