import React from 'react';
import { Player, Identity } from '../../../types';
import { KINGDOM_CLASS } from '../../game/constants';
import { EQUIP_META } from '../../../constants';

/** 主视角座位卡（与敌方座位同一套卡面） */
export const OwnSeatPanel: React.FC<{
  me: Player;
  isMyTurn: boolean;
  dyingActive: boolean;
  dyingVictimId: number | null;
  hasPendingReaction: boolean;
  fxLevel: string;
  damageAnimTarget: number | null;
  healAnimTarget: number | null;
  damageNumber: { targetId: number; amount: number } | null;
  healNumber: { targetId: number; amount: number } | null;
  skillGlowId: number | null;
  aiThinkingId: number | null;
  attackRange: number;
  onInspect: (id: number) => void;
}> = ({
  me, isMyTurn, dyingActive, dyingVictimId, hasPendingReaction, fxLevel, damageAnimTarget, healAnimTarget,
  damageNumber, healNumber, skillGlowId, aiThinkingId, attackRange, onInspect,
}) => {
  const isDying = dyingActive && dyingVictimId === me.id;
  return (
    <div
      data-seat-id={0}
      className={`
        own-seat seat-card relative rounded-xl border-2 kingdom-frame hero-card ${KINGDOM_CLASS[me.hero.kingdom] ?? ''}
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--line-strong)]
        ${damageAnimTarget === 0 || healAnimTarget === 0
          ? ''
          : 'transition-[transform,box-shadow,border-color] duration-300'
        }
        ${me.isDead ? 'is-dead opacity-55' : ''}
        ${me.identity === Identity.ZHUGONG ? 'is-lord-card' : ''}
        ${isDying ? 'is-dying' : ''}
        ${isMyTurn && !isDying ? 'is-current-turn' : ''}
        ${isMyTurn ? 'is-my-turn' : ''}
        ${damageAnimTarget === 0 && fxLevel !== 'pure' && fxLevel !== 'classic' ? 'animate-damage-shake' : ''}
        ${healAnimTarget === 0 ? 'animate-heal-pulse' : ''}
      `}
    >
      {isMyTurn && !isDying && <span className="turn-glow" aria-hidden="true" />}
      <span
        className="absolute top-0 left-2 right-2 h-[2px] rounded-full opacity-80"
        style={{ background: 'var(--k-main)' }}
      />

      {damageNumber && damageNumber.targetId === 0 && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="text-4xl font-bold text-[var(--danger)] animate-damage-float" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
            -{damageNumber.amount}
          </div>
        </div>
      )}

      {healNumber && healNumber.targetId === 0 && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="text-4xl font-bold text-[var(--ok)] animate-heal-float" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
            +{healNumber.amount}
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={`查看 ${me.hero.name} 的武将详情`}
        onClick={() => { if (!dyingActive && !hasPendingReaction) onInspect(me.id); }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (!dyingActive && !hasPendingReaction) onInspect(me.id);
        }}
        title={`点击查看 ${me.hero.name} 的武将详情`}
        className={`seat-art cursor-pointer ${
          healAnimTarget === 0 ? 'animate-heal-glow' :
          damageAnimTarget === 0 ? 'animate-damage-glow' : ''
        } ${skillGlowId === 0 ? 'skill-glow' : ''} ${aiThinkingId === 0 ? 'ai-thinking' : ''}`}
      >
        <img
          src={me.hero.avatarUrl}
          alt={me.hero.name}
          loading="eager"
          decoding="async"
          className="seat-art-img"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#241b14"/><text x="128" y="158" font-size="96" fill="#c8a45c" text-anchor="middle" font-family="serif">${me.hero.name}</text></svg>`)}`;
          }}
        />
        <div className="seat-scrim" />

        {me.isDead && (
          <div className="seat-dead">
            <span>阵亡</span>
          </div>
        )}

        <div className="seat-topline">
          <span className="seat-kingdom">{me.hero.kingdom}</span>
          <span data-tour="identity" className={`seat-identity ${
            me.identity === Identity.ZHUGONG ? 'is-lord' :
            me.identity === Identity.ZHONGCHEN ? 'is-loyal' :
            me.identity === Identity.FANZEI ? 'is-rebel' :
            'is-spy'
          }`}>
            {me.identity === Identity.ZHUGONG ? '主' :
              me.identity === Identity.ZHONGCHEN ? '忠' :
              me.identity === Identity.FANZEI ? '反' : '内'
            }
          </span>
        </div>

        {isMyTurn && (
          <div data-tour="turn" className="own-turn-chip">我的回合</div>
        )}
      </div>

      <div className="seat-info">
        <div className="seat-name-rail">
          <span className="seat-name">{me.hero.name}</span>
          <span className="seat-skill">【{me.hero.skillName}】</span>
        </div>

        <div className="seat-meta-row">
          <span className="seat-hp-corner" title={`体力 ${me.hp}/${me.maxHp}`}>
            <span className="seat-pips">
              {Array.from({ length: me.maxHp }).map((_, i) => (
                <span key={i} className={`seat-pip ${i < me.hp ? (me.hp === 1 ? 'is-low' : 'is-on') : ''}`} />
              ))}
            </span>
          </span>
          <span className="seat-hand-count">手牌 <b className="tabular-nums">{me.hand.length}</b></span>
          <span className="seat-distance">范围 {attackRange}</span>
          {me.isDead && <span className="seat-dead-tag">阵亡</span>}
        </div>

        <div data-tour="equipment" className="seat-equip">
          {[
            { key: 'weapon', label: '武', item: me.equipment?.weapon, tip: '武器' },
            { key: 'armor', label: '防', item: me.equipment?.armor, tip: '防具' },
            { key: 'horsePlus', label: '+1', item: me.equipment?.horsePlus, tip: '+1 马（防御马）' },
            { key: 'horseMinus', label: '−1', item: me.equipment?.horseMinus, tip: '-1 马（进攻马）' },
          ].map(slot => (
            <span
              key={slot.key}
              title={`${slot.tip}：${slot.item
                ? `${slot.item.name}${slot.key === 'weapon' ? `（范围 ${EQUIP_META[slot.item.name]?.range ?? 1}）` : ''}${EQUIP_META[slot.item.name]?.desc ? ` · ${EQUIP_META[slot.item.name]?.desc}` : ''}`
                : '空'}`}
              aria-label={`${slot.tip}：${slot.item ? slot.item.name : '空'}`}
              className={`seat-equip-slot ${slot.item ? 'is-on' : ''}`}
            >
              {slot.label}
              {slot.item && <i className="seat-equip-dot" />}
            </span>
          ))}
        </div>

        {(me.isChained || me.isLeBuSiShu || me.isBingLiangCunDuan || me.isShandian) && (
          <div className="seat-judge" title="判定区">
            {me.isChained && <span className="is-chain" title="铁索连环">链</span>}
            {me.isLeBuSiShu && <span className="is-le" title="乐不思蜀">乐</span>}
            {me.isBingLiangCunDuan && <span className="is-bing" title="兵粮寸断">兵</span>}
            {me.isShandian && <span className="is-dian" title="闪电悬顶">电</span>}
          </div>
        )}
      </div>
    </div>
  );
};
