import React from 'react';
import { Player, Identity } from '../types';

interface AvatarProps {
  player: Player;
  isActive: boolean;
  isTargetable: boolean; // Can be selected as a target
  isSelected: boolean; // Is currently selected as target
  onClick?: () => void;
  damageAnim?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({ player, isActive, isTargetable, isSelected, onClick, damageAnim }) => {
  // HP Orbs
  const renderHp = () => {
    const orbs = [];
    for (let i = 0; i < player.maxHp; i++) {
      const isFull = i < player.hp;
      let colorClass = 'bg-stone-800 border-stone-600'; // Empty
      if (isFull) {
        if (player.hp === 1) colorClass = 'bg-red-600 border-red-800 shadow-[0_0_8px_rgba(220,38,38,0.8)] animate-pulse';
        else if (player.hp <= 2) colorClass = 'bg-yellow-600 border-yellow-800';
        else colorClass = 'bg-green-700 border-green-900';
      }
      orbs.push(
        <div key={i} className={`w-3 h-3 md:w-4 md:h-4 rounded-full border-2 ${colorClass} transition-all duration-300`} />
      );
    }
    return orbs;
  };

  const kingdomColors = {
    '魏': 'bg-blue-900 border-blue-700',
    '蜀': 'bg-red-900 border-red-700',
    '吴': 'bg-green-900 border-green-700',
    '群': 'bg-stone-600 border-stone-500',
  };

  const identityLabels = {
    [Identity.ZHUGONG]: { char: '主', bg: 'bg-yellow-600' },
    [Identity.ZHONGCHEN]: { char: '忠', bg: 'bg-orange-600' },
    [Identity.FANZEI]: { char: '反', bg: 'bg-green-700' },
    [Identity.NEIJIAN]: { char: '内', bg: 'bg-indigo-700' },
  };

  const showIdentity = player.isRevealed || player.isHuman || player.identity === Identity.ZHUGONG;
  const ident = identityLabels[player.identity];

  return (
    <div 
      onClick={isTargetable ? onClick : undefined}
      className={`
        relative flex flex-col items-center p-1.5 md:p-2 rounded border transition-all duration-300
        ${player.isDead ? 'grayscale opacity-60 bg-stone-900' : 'bg-black/60 backdrop-blur-sm'}
        ${isActive ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-105 z-10' : 'border-stone-700'}
        ${isTargetable ? 'cursor-pointer hover:border-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse' : ''}
        ${isSelected ? 'ring-4 ring-red-600 scale-110 shadow-xl' : ''}
        ${damageAnim ? 'animate-bounce brightness-150 bg-red-900/50' : ''}
      `}
      style={{ width: '120px' }}
    >
      {/* Kingdom & Avatar */}
      <div className="relative w-16 h-16 md:w-20 md:h-20 mb-1">
         <div className={`w-full h-full rounded border-2 overflow-hidden ${isActive ? 'border-yellow-500' : 'border-stone-600'}`}>
            <img src={player.hero.avatarUrl} alt={player.hero.name} className="w-full h-full object-cover" />
            {player.isDead && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 font-ancient text-4xl text-red-700 font-bold border-4 border-red-900 select-none">
                阵亡
              </div>
            )}
         </div>
         {/* Kingdom Badge */}
         <div className={`absolute -top-1 -left-1 w-6 h-6 flex items-center justify-center rounded-full text-white text-xs border ${kingdomColors[player.hero.kingdom]}`}>
           {player.hero.kingdom}
         </div>
         {/* Identity Badge */}
         <div className={`absolute -bottom-1 -right-1 w-7 h-7 flex items-center justify-center rounded border text-white font-bold shadow-md ${showIdentity ? ident.bg : 'bg-stone-700'}`}>
            {showIdentity ? ident.char : '?'}
         </div>
      </div>

      {/* Info */}
      <div className="w-full text-center">
        <h3 className="font-ancient text-lg text-stone-200 truncate leading-none mb-1">{player.hero.name}</h3>
        <div className="flex justify-center gap-0.5 flex-wrap mb-1 px-1">
          {renderHp()}
        </div>
        <div className="text-[10px] text-stone-400 bg-stone-900/80 rounded px-2 border border-stone-800 inline-block">
          手牌 {player.hand.length}
        </div>
      </div>
    </div>
  );
};

export default Avatar;