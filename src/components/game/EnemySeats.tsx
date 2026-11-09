import React from 'react';
import { Player, Identity, CardName } from '../../../types';
import { KINGDOM_CLASS } from '../../game/constants';

/** 敌方座位环：布局、选中目标、伤害/治疗动画、装备与判定区角标 */
export const EnemySeats: React.FC<{
  enemies: Player[];
  me: Player;
  layoutDensity: string;
  sizeTier: string;
  viewportW: number;
  turnIndex: number;
  isSelectingTarget: boolean;
  slashLikeActive: boolean;
  isLijianMode: boolean;
  isJieyinMode: boolean;
  isJijiangMode: boolean;
  isRendeMode: boolean;
  isJiedaoMode: boolean;
  rendeSelectedCardIds: string[];
  lijianSelectedTargets: number[];
  tiesuoSelectedTargets: number[];
  selectedCardIds: string[];
  rendeSelectedTarget: number | null;
  jiedaoWeaponTarget: number | null;
  jiedaoVictimTarget: number | null;
  damageAnimTarget: number | null;
  healAnimTarget: number | null;
  skillGlowId: number | null;
  aiThinkingId: number | null;
  damageNumber: { targetId: number; amount: number } | null;
  healNumber: { targetId: number; amount: number } | null;
  dyingVictimId: number | null;
  dyingActive: boolean;
  fxLevel: string;
  isProcessing: number;
  hasPendingReaction: boolean;
  getDistance: (from: number, to: number) => number;
  getAttackRange: (p: Player) => number;
  onSeatClick: (id: number) => void;
  onInspect: (id: number) => void;
}> = ({
  enemies, me, layoutDensity, sizeTier, viewportW, turnIndex, isSelectingTarget, slashLikeActive,
  isLijianMode, isJieyinMode, isJijiangMode, isRendeMode, isJiedaoMode, rendeSelectedCardIds,
  lijianSelectedTargets, tiesuoSelectedTargets, selectedCardIds, rendeSelectedTarget, jiedaoWeaponTarget,
  jiedaoVictimTarget, damageAnimTarget, healAnimTarget, skillGlowId, aiThinkingId, damageNumber,
  healNumber, dyingVictimId, dyingActive, fxLevel, isProcessing, hasPendingReaction, getDistance, getAttackRange,
  onSeatClick, onInspect,
}) => (
  <div data-region="seats" data-many={enemies.length >= 5 ? 'true' : 'false'} className={`relative w-full flex items-start justify-center gap-1 overflow-x-auto pt-[44px] pb-1 px-1 scrollbar-hide md:pt-0 md:pb-0 md:px-0 md:absolute md:top-0 md:left-0 md:right-0 md:h-[68vh] md:block md:overflow-visible`}>
    {enemies.map((p, index) => {
      const totalEnemies = enemies.length;
      const baseW = layoutDensity === 'roomy' ? (sizeTier === 'xl' ? 208 : 196)
        : layoutDensity === 'normal' ? 164
        : layoutDensity === 'compact' ? 156
        : layoutDensity === 'tight' ? 144 : 136;
      const seatW = baseW;
      const inner = Math.max(320, viewportW - 32);
      const wantedPitch = Math.round((seatW + 12) * 1.17);
      const fitPitch = totalEnemies > 1 ? Math.floor((inner - seatW) / (totalEnemies - 1)) : 0;
      const seatPitch = totalEnemies > 1 ? Math.min(wantedPitch, Math.max(1, fitPitch)) : 0;
      const seatShift = totalEnemies >= 6 && index % 2 === 1 ? 26 : 0;
      const side = 'top';
      const offset = index - (totalEnemies - 1) / 2;
      const leftPercent = `calc(50% + ${Math.round(offset * seatPitch)}px)`;
      const outOfRange = !p.isDead && isSelectingTarget && slashLikeActive && getDistance(me.id, p.id) > getAttackRange(me);
      const selectableTarget = !p.isDead && (isSelectingTarget || isLijianMode || isJieyinMode || isJijiangMode
        || (isRendeMode && rendeSelectedCardIds.length > 0) || isJiedaoMode);

      return (
        <div
          key={p.id}
          className="ring-seat"
          data-side={side}
          data-seat-id={p.id}
          style={{
            '--seat-left': leftPercent,
            '--seat-shift': `${seatShift}px`,
          } as React.CSSProperties}
        >
          {turnIndex === p.id && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-[#9e2b25] text-[#f7e7cf] text-[11px] px-3 py-0.5 rounded-full font-bold shadow-[0_2px_10px_rgba(158,43,37,0.5)] border border-[#c86b62]/70 whitespace-nowrap tracking-widest">
                回合中
              </div>
            </div>
          )}

          {turnIndex === p.id && dyingVictimId !== p.id && (
            <span className="turn-glow" aria-hidden="true" />
          )}

          <div
            role="button"
            tabIndex={0}
            aria-label={p.isDead ? `${p.hero.name}（已阵亡）` : `查看 ${p.hero.name} 的武将详情`}
            onClick={() => {
              const selecting = isSelectingTarget || isLijianMode || isJieyinMode || isJijiangMode
                || (isRendeMode && rendeSelectedCardIds.length > 0) || (isJiedaoMode && !p.isDead);
              if (selecting) {
                onSeatClick(p.id);
              } else if (!dyingActive && !hasPendingReaction && !isProcessing) {
                onInspect(p.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              const selecting = isSelectingTarget || isLijianMode || isJieyinMode || isJijiangMode
                || (isRendeMode && rendeSelectedCardIds.length > 0) || (isJiedaoMode && !p.isDead);
              if (selecting) {
                onSeatClick(p.id);
              } else if (!dyingActive && !hasPendingReaction && !isProcessing) {
                onInspect(p.id);
              }
            }}
            title={p.isDead ? `${p.hero.name}（已阵亡）` : `点击查看 ${p.hero.name} 的武将详情`}
            className={`
              seat-card relative rounded-xl border-2 kingdom-frame hero-card ${KINGDOM_CLASS[p.hero.kingdom] ?? ''}
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8cf94]
              ${damageAnimTarget === p.id || healAnimTarget === p.id
                ? ''
                : 'transition-[transform,box-shadow,border-color] duration-300'
              }
              ${p.isDead
                ? 'bg-[#15110e]/95 border-[#4a3f33] opacity-55'
                : 'bg-[#1c1611]/95 border-[#8b7355]/45'
              }
              ${p.isDead ? 'is-dead' : ''}
              ${p.identity === Identity.ZHUGONG ? 'is-lord-card' : ''}
              ${dyingVictimId === p.id ? 'is-dying' : ''}
              ${turnIndex === p.id && dyingVictimId !== p.id ? 'is-current-turn' : ''}
              ${turnIndex === p.id
                ? (fxLevel === 'pure'
                  ? 'border-[#e8cf94]/70'
                  : 'border-[#c8a45c] shadow-[0_0_22px_rgba(200,164,92,0.30)] scale-105')
                : ''
              }
              ${(isSelectingTarget || isLijianMode || (isRendeMode && rendeSelectedCardIds.length > 0) || isJiedaoMode) && !p.isDead
                ? 'cursor-pointer hover:border-[#c86b62] hover:shadow-[0_0_18px_rgba(158,43,37,0.4)]'
                : ''
              }
              ${isLijianMode && lijianSelectedTargets.includes(p.id) ? 'ring-4 ring-red-500 scale-110' : ''}
              ${selectedCardIds.length > 0 && (() => {
                const card = me.hand.find(c => c.id === selectedCardIds[0]);
                return card?.name === CardName.TIESUO && tiesuoSelectedTargets.includes(p.id);
              })() ? 'ring-4 ring-amber-500 scale-110' : ''}
              ${isRendeMode && rendeSelectedTarget === p.id ? 'ring-4 ring-green-500 scale-110' : ''}
              ${isJieyinMode && !p.isDead && p.hero.gender === 'male' && p.hp < p.maxHp
                ? 'ring-2 ring-emerald-500 cursor-pointer'
                : ''
              }
              ${isJiedaoMode && (jiedaoWeaponTarget === p.id || jiedaoVictimTarget === p.id)
                ? jiedaoWeaponTarget === p.id
                  ? 'ring-4 ring-blue-500 scale-110'
                  : 'ring-4 ring-red-500 scale-110'
                : ''
              }
              ${damageAnimTarget === p.id && fxLevel !== 'pure' && fxLevel !== 'classic' ? 'animate-damage-shake' : ''}
              ${healAnimTarget === p.id ? 'animate-heal-pulse' : ''}
              ${outOfRange ? 'opacity-40 saturate-[0.6]' : ''}
              ${selectableTarget && !outOfRange ? 'target-candidate' : ''}
            `}>
            {selectableTarget && !outOfRange && (
              <span className="target-chip absolute -top-3 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap">
                选择目标
              </span>
            )}
            <span
              className="absolute top-0 left-2 right-2 h-[2px] rounded-full opacity-80"
              style={{ background: 'var(--k-main)' }}
            />

            {damageNumber && damageNumber.targetId === p.id && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <div className="text-4xl font-bold text-red-500 animate-damage-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                  -{damageNumber.amount}
                </div>
              </div>
            )}

            {healNumber && healNumber.targetId === p.id && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <div className="text-4xl font-bold text-green-500 animate-heal-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                  +{healNumber.amount}
                </div>
              </div>
            )}

            <div className={`seat-art ${
              healAnimTarget === p.id ? 'animate-heal-glow' :
              damageAnimTarget === p.id ? 'animate-damage-glow' : ''
            } ${skillGlowId === p.id ? 'skill-glow' : ''} ${aiThinkingId === p.id ? 'ai-thinking' : ''}`}>
              <img
                src={p.hero.avatarUrl}
                alt={p.hero.name}
                loading="lazy"
                decoding="async"
                className="seat-art-img"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#241b14"/><text x="128" y="158" font-size="96" fill="#c8a45c" text-anchor="middle" font-family="serif">${p.hero.name}</text></svg>`)}`;
                }}
              />
              <div className="seat-scrim" />

              {p.isDead && (
                <div className="seat-dead">
                  <span>阵亡</span>
                </div>
              )}

              <div className="seat-topline">
                <span className="seat-kingdom">{p.hero.kingdom}</span>
                {(p.isRevealed || p.isHuman || p.identity === Identity.ZHUGONG || p.isDead) && (
                  <span className={`seat-identity ${
                    p.identity === Identity.ZHUGONG ? 'is-lord' :
                    p.identity === Identity.ZHONGCHEN ? 'is-loyal' :
                    p.identity === Identity.FANZEI ? 'is-rebel' :
                    'is-spy'
                  }`}>
                    {p.identity === Identity.ZHUGONG ? '主' :
                      p.identity === Identity.ZHONGCHEN ? '忠' :
                      p.identity === Identity.FANZEI ? '反' : '内'
                    }
                  </span>
                )}
              </div>

              <div className="seat-name-rail">
                <span className="seat-name">{p.hero.name}</span>
                <span className="seat-skill">【{p.hero.skillName}】</span>
              </div>

              <div className="seat-hp-corner" title={`体力 ${p.hp}/${p.maxHp}`}>
                <div className="seat-pips">
                  {Array.from({ length: p.maxHp }).map((_, i) => (
                    <span key={i} className={`seat-pip ${i < p.hp ? (p.hp === 1 ? 'is-low' : 'is-on') : ''}`} />
                  ))}
                </div>
              </div>
            </div>

            <div className="seat-info">
              <div className="seat-meta-row">
                <span className="seat-hand-count">手牌 <b className="tabular-nums">{p.hand.length}</b></span>
                <span className="seat-distance">距 {getDistance(me.id, p.id)}</span>
                {p.isDead && <span className="seat-dead-tag">阵亡</span>}
              </div>

              <div className="seat-equip">
                {[
                  { key: 'weapon', label: '武', item: p.equipment?.weapon, tip: '武器' },
                  { key: 'armor', label: '防', item: p.equipment?.armor, tip: '防具' },
                  { key: 'horsePlus', label: '+1', item: p.equipment?.horsePlus, tip: '+1 马（防御马）' },
                  { key: 'horseMinus', label: '−1', item: p.equipment?.horseMinus, tip: '-1 马（进攻马）' },
                ].map(slot => (
                  <span
                    key={slot.key}
                    title={`${slot.tip}：${slot.item ? slot.item.name : '空'}`}
                    aria-label={`${slot.tip}：${slot.item ? slot.item.name : '空'}`}
                    className={`seat-equip-slot ${slot.item ? 'is-on' : ''}`}
                  >
                    {slot.label}
                    {slot.item && <i className="seat-equip-dot" />}
                  </span>
                ))}
              </div>

              {(p.isChained || p.isLeBuSiShu || p.isBingLiangCunDuan || p.isShandian) && (
                <div className="seat-judge" title="判定区">
                  {p.isChained && <span className="is-chain" title="铁索连环">链</span>}
                  {p.isLeBuSiShu && <span className="is-le" title="乐不思蜀">乐</span>}
                  {p.isBingLiangCunDuan && <span className="is-bing" title="兵粮寸断">兵</span>}
                  {p.isShandian && <span className="is-dian" title="闪电悬顶">电</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);
