import React from 'react';
import { Player, Identity } from '../../../types';
import { EQUIP_META } from '../../../constants';

const SLOTS = [
  ['weapon', '武器'],
  ['armor', '防具'],
  ['horsePlus', '防御马'],
  ['horseMinus', '进攻马'],
] as const;

/** 点击座位头像弹出的角色小面板：基本信息 + 技能 + 装备明细 + 判定区 */
export const PlayerInspectModal: React.FC<{
  player: Player;
  onClose: () => void;
  onZoom: (p: Player) => void;
  onOpenDetail: (p: Player) => void;
}> = ({ player: p, onClose, onZoom, onOpenDetail }) => {
  const knownIdentity = p.isHuman || p.isRevealed || p.identity === Identity.ZHUGONG;
  return (
    <div className="absolute inset-0 z-[100] modal-mask flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-shell max-w-xl w-[92%] max-h-[85vh] overflow-y-auto p-6 scrollbar-thin" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-5">
          <h3 className="modal-title text-3xl font-ancient mb-2">武将详情</h3>
          <div className="w-24 modal-divider mx-auto"></div>
        </div>
        <div className="flex items-center gap-4 mb-5 p-4 bg-black/30 rounded-lg border border-[#8b7355]/30">
          <div className="flex-none flex flex-col items-center gap-1.5">
            <img
              src={p.hero.avatarUrl}
              alt={p.hero.name}
              loading="eager"
              decoding="async"
              className={`w-20 h-[120px] rounded-lg border-2 object-cover ${p.isDead ? 'grayscale border-stone-600 opacity-70' : 'border-[#d4af37]/50'}`}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#241b14"/><text x="128" y="158" font-size="96" fill="#c8a45c" text-anchor="middle" font-family="serif">${p.hero.name}</text></svg>`)}`;
              }}
            />
            <button
              onClick={() => onZoom(p)}
              className="text-[11px] px-2 py-0.5 rounded border border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15"
            >
              查看立绘
            </button>
            <button
              onClick={() => onOpenDetail(p)}
              className="text-[11px] px-2 py-0.5 rounded border border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15"
              aria-label={`查看 ${p.hero.name} 武将详情`}
            >
              武将详情
            </button>
          </div>
          <div className="flex-1">
            <h4 className="text-2xl font-bold text-[#d4af37] font-ancient flex items-center gap-2">
              {p.hero.name}
              {p.isDead && <span className="text-[#c86b62] text-sm border border-[#9e2b25] px-1.5 py-0.5 rounded">阵亡</span>}
            </h4>
            {/* 对局内小卡浮层不显示称号（epithet）：称号只在选将页/完整详情面板出现 */}
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                p.hero.kingdom === '魏' ? 'bg-blue-900/60 text-blue-200' :
                p.hero.kingdom === '蜀' ? 'bg-red-900/60 text-red-200' :
                p.hero.kingdom === '吴' ? 'bg-green-900/60 text-green-200' :
                'bg-stone-700/60 text-stone-200'
              }`}>{p.hero.kingdom}</span>
              <span className="text-stone-400">{p.hero.gender === 'male' ? '男' : '女'}</span>
              <span className={p.hp <= 1 ? 'text-[#e8a99f]' : 'text-red-400'}>♥ {p.hp}/{p.maxHp}</span>
              <span className="text-stone-400">手牌 {p.hand.length}</span>
              <span className="text-[#c8a45c]">身份 {knownIdentity ? p.identity : '未知'}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-[#8b4513]/30 to-transparent p-4 rounded-lg border-l-4 border-[#d4af37] mb-4">
          <h5 className="text-xl font-bold text-[#d4af37] mb-2 font-ancient">【{p.hero.skillName}】</h5>
          <p className="text-stone-300 leading-relaxed text-sm">{p.hero.skillDesc}</p>
          {p.hero.lordSkillName && (
            <div className="mt-3 pt-3 border-t border-[#8b7355]/30">
              <div className="text-base font-bold text-[#e8cf94] mb-1 font-ancient">主公技【{p.hero.lordSkillName}】</div>
              <p className="text-stone-300 leading-relaxed text-sm">{p.hero.lordSkillDesc}</p>
            </div>
          )}
        </div>

        <div className="bg-black/20 p-4 rounded-lg border border-[#8b7355]/20 text-sm space-y-2.5">
          <div>
            <div className="text-stone-500 mb-1.5">装备区</div>
            {SLOTS.map(([slot, label]) => {
              const c = p.equipment?.[slot];
              return c ? (
                <div key={slot} className="mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#c8a45c]/15 border border-[#c8a45c]/30 text-[#e8cf94]">{label}</span>
                    <span className="text-[#f0dcae] font-bold text-[13px]">【{c.name}】</span>
                    <span className="text-stone-500 text-[11px]">{c.suit}{c.rank}</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed mt-0.5">{EQUIP_META[c.name]?.desc ?? c.description}</p>
                </div>
              ) : (
                <div key={slot} className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 border border-[#8b7355]/30 text-stone-500">{label}</span>
                  <span className="text-stone-600 text-[11px]">— 空</span>
                </div>
              );
            })}
          </div>
          {(p.judgeZone?.length ?? 0) > 0 && (
            <div>
              <div className="text-stone-500 mb-1">判定区（按放置先后逐张判定）</div>
              {(p.judgeZone ?? []).map(c => (
                <div key={c.id} className="text-[12px] leading-relaxed">
                  <span className="text-[#f0dcae]">【{c.name}】</span>
                  <span className="text-stone-500 text-[11px] ml-1">{c.suit}{c.rank}</span>
                </div>
              ))}
            </div>
          )}
          {(p.placedCards?.length ?? 0) > 0 && (
            <div className="flex gap-2"><span className="text-stone-500 w-16 shrink-0">武将牌上</span>
              <span className="text-stone-300">{p.placedCards!.map(c => `【${c.name}】`).join('')}</span>
            </div>
          )}
          {(p.isChained || p.isLeBuSiShu || p.isBingLiangCunDuan || p.isShandian) && (
            <div className="flex gap-2"><span className="text-stone-500 w-16 shrink-0">状态</span>
              <span className="text-[#e8cf94]">
                {[
                  p.isChained ? '铁索横置' : '',
                  p.isLeBuSiShu ? '乐不思蜀' : '',
                  p.isBingLiangCunDuan ? '兵粮寸断' : '',
                  p.isShandian ? '闪电' : '',
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <button onClick={onClose} className="px-10 py-2.5 btn-gold font-ancient text-xl rounded-lg">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
