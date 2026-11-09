import React, { useEffect } from 'react';
import { Hero, Player, Identity } from '../../types';
import { EQUIP_META } from '../../constants';
import { getHeroDetail, SkillTag } from '../game/heroDetail';
import { heroPortrait2x } from '../game/utils';

interface HeroDetailModalProps {
  hero: Hero | null;
  /** 对局内打开时传入实时角色状态（体力/手牌/装备/判定区/标记等），选将页为 null */
  player?: Player | null;
  /** 该角色当前是否处于技能封印（由对局侧的 isSkillSealed 计算） */
  sealed?: boolean;
  onClose: () => void;
  /** 选中该武将（留在选将页） */
  onSelect?: (hero: Hero) => void;
  /** 直接出战 */
  onStart?: (hero: Hero) => void;
  /** 打开 2x 立绘大图 */
  onZoom?: (hero: Hero) => void;
}

const SLOT_LABEL: Record<string, string> = { weapon: '武器', armor: '防具', horsePlus: '防御马', horseMinus: '进攻马' };
const SLOT_ORDER = ['weapon', 'armor', 'horsePlus', 'horseMinus'] as const;
const JUDGE_DESC: Record<string, string> = {
  '乐不思蜀': '判定：非红桃则跳过出牌阶段',
  '兵粮寸断': '判定：非梅花则跳过摸牌阶段',
  '闪电': '判定：黑桃 2~9 受到 3 点雷电伤害，否则传递给下一名角色',
};

const TAG_STYLE: Record<SkillTag, string> = {
  锁定技: 'bg-[#3a2f14] text-[#f0d894] border-[#c8a45c]/60',
  限定技: 'bg-[#3a1530] text-[#f0b8dc] border-[#b07aa0]/60',
  觉醒技: 'bg-[#241a3a] text-[#c8b8f0] border-[#8f7ad0]/60',
  主动技: 'bg-[#14301f] text-[#b8e8c8] border-[#6a9a7a]/60',
  被动技: 'bg-[#14283a] text-[#b8d8f0] border-[#6a8aa0]/60',
  主公技: 'bg-[#3a1a14] text-[#f0c8b8] border-[#c86b62]/60',
};

const Star: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={on ? 'text-[#e8cf94]' : 'text-[#5a4a38]'} aria-hidden="true">★</span>
);

/**
 * 武将详情面板：大图立绘 + 势力/体力/包标签 + 技能（类型/规则/触发时机/台词）
 * + 定位与难度 + 实战提示 + 出战/选择/关闭。
 * 桌面居中大弹窗，手机全屏抽屉，正文可滚动、按钮固定可见。
 */
export const HeroDetailModal: React.FC<HeroDetailModalProps> = ({ hero, player, sealed, onClose, onSelect, onStart, onZoom }) => {
  useEffect(() => {
    if (!hero) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hero, onClose]);

  if (!hero) return null;
  const { profile, skills } = getHeroDetail(hero);
  // 对局实时状态（仅当传入 player 时渲染）
  const judgeZone = player?.judgeZone ?? [];
  const equipCount = player ? SLOT_ORDER.filter(s => player.equipment?.[s]).length : 0;
  const identityKnown = !!player && (player.isHuman || player.isRevealed || player.identity === Identity.ZHUGONG);
  const marks = player ? [
    player.meiyanMarks ? `梅影 ×${player.meiyanMarks}` : '',
    player.miaoJianLevel ? `妙剑 Lv.${player.miaoJianLevel}` : '',
    player.lianHuaLevel ? `莲华 Lv.${player.lianHuaLevel}` : '',
    player.juMarks ? `疽 ×${player.juMarks}` : '',
    player.hasKui ? '傀' : '',
    ...(player.zhangMarks ?? []).map(m => `法箓·${m}`),
  ].filter(Boolean) : [];
  const grantedSkills = player?.grantedSkills ?? [];
  const placedCards = player?.placedCards ?? [];

  return (
    <div
      className="fixed inset-0 z-[120] modal-mask flex items-stretch md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${hero.name} 武将详情`}
    >
      <div
        className="modal-shell w-full md:max-w-4xl lg:max-w-5xl h-full md:h-auto md:max-h-[88vh] rounded-none md:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：名字 + 势力 / 体力 / 包标签 */}
        <div className="flex-none px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-[#c8a45c]/25">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="modal-title font-ancient text-3xl md:text-4xl leading-none">{hero.name}</h2>
                <span className="px-1.5 py-0.5 rounded-[3px] text-[11px] font-bold border border-[#c8a45c]/50 bg-[#14100c]/80 text-[#e8cf94]">
                  {hero.kingdom}
                </span>
                <span className="px-1.5 py-0.5 rounded-[3px] text-[11px] font-bold border border-[#8b7355]/50 bg-[#241b14] text-[#d9c49a]">
                  {profile.pack}
                </span>
                <span className="px-1.5 py-0.5 rounded-[3px] text-[11px] font-bold border border-[#9e2b25]/60 bg-[#2a1512] text-[#f0b8b0]">
                  体力上限 {hero.maxHp}
                </span>
                {hero.pending && (
                  <span className="px-1.5 py-0.5 rounded-[3px] text-[11px] font-bold border border-[#c8a45c]/60 bg-[#3a2f14] text-[#f0d894]">
                    技能实装中
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs md:text-sm modal-text-dim tracking-wide">
                {hero.description} · 性别{hero.gender === 'female' ? '女' : '男'} · 定位 {profile.roles.join(' / ')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-none w-10 h-10 rounded-full bg-[#1a1410] border border-[#c8a45c]/60 text-[#e8cf94] text-lg leading-none flex items-center justify-center"
              aria-label="关闭武将详情"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 正文：桌面左右分栏，手机上下滚动 */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 md:px-6 py-4">
          {/* 对局实时状态：体力 / 手牌 / 装备明细 / 判定区 / 标记 */}
          {player && (
            <div className="mb-4 rounded-lg border border-[#c8a45c]/35 bg-[#1a1410]/80 p-3 md:p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-[3px] h-3.5 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
                <span className="text-xs font-bold tracking-[0.18em] text-[#d9c49a]">当前状态</span>
                <span className={`text-sm font-bold ${player.hp <= 1 ? 'text-[#e8a99f]' : 'text-[#e8cf94]'}`}>♥ {player.hp}/{player.maxHp}</span>
                <span className="text-[11px] md:text-xs text-[#a99a80]">手牌 {player.hand.length} · 装备 {equipCount} · 判定 {judgeZone.length}</span>
                <span className="text-[11px] md:text-xs text-[#a99a80]">身份 {identityKnown ? player.identity : '未知'}</span>
                {player.isDead && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] border border-[#9e2b25]/70 bg-[#2a1512] text-[#f0b8b0]">阵亡</span>
                )}
                {sealed && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] border border-[#8b7355]/60 bg-[#241b14] text-[#d9c49a]">技能封印</span>
                )}
                {player.generalRevealed === false && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] border border-[#8f7ad0]/60 bg-[#241a3a] text-[#c8b8f0]">武将暗置</span>
                )}
                {player.isChained && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] border border-[#6a8aa0]/60 bg-[#14283a] text-[#b8d8f0]">铁索横置</span>
                )}
              </div>

              <div className="mt-2.5 space-y-1.5">
                {SLOT_ORDER.map(slot => {
                  const c = player.equipment?.[slot];
                  return (
                    <div key={slot} className="flex items-start gap-2">
                      <span className="flex-none w-14 text-center text-[10px] md:text-[11px] px-1 py-0.5 rounded bg-[#c8a45c]/10 border border-[#c8a45c]/30 text-[#e8cf94]">
                        {SLOT_LABEL[slot]}
                      </span>
                      {c ? (
                        <div className="min-w-0">
                          <div className="text-[12px] md:text-[13px] leading-tight">
                            <span className="text-[#f0dcae] font-bold">【{c.name}】</span>
                            <span className="text-[#a99a80] text-[11px] ml-1">{c.suit}{c.rank}</span>
                          </div>
                          <div className="text-[11px] leading-relaxed text-[#a99a80]">{EQUIP_META[c.name]?.desc ?? c.description}</div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#6a5642] leading-5">— 空</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {judgeZone.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-[#8b7355]/25">
                  <div className="text-[11px] text-[#9a8b74] mb-1">判定区（按放置先后逐张判定）</div>
                  {judgeZone.map(c => (
                    <div key={c.id} className="text-[12px] leading-relaxed">
                      <span className="text-[#f0dcae]">【{c.name}】</span>
                      <span className="text-[11px] text-[#a99a80] ml-1">{c.suit}{c.rank} · {JUDGE_DESC[c.name] ?? '延时锦囊'}</span>
                    </div>
                  ))}
                </div>
              )}

              {(marks.length > 0 || grantedSkills.length > 0 || placedCards.length > 0) && (
                <div className="mt-2.5 pt-2 border-t border-[#8b7355]/25 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  {marks.length > 0 && <span className="text-[#e8cf94]">标记：{marks.join('、')}</span>}
                  {placedCards.length > 0 && <span className="text-[#c8bda8]">置于武将牌上：{placedCards.map(c => `【${c.name}】`).join('')}</span>}
                  {grantedSkills.length > 0 && <span className="text-[#b8d8f0]">临时技能：{grantedSkills.join('、')}</span>}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            {/* 2:3 立绘 + 放大 */}
            <div className="flex-none w-full md:w-[300px] lg:w-[340px]">
              <button
                onClick={() => onZoom?.(hero)}
                className="relative block w-full rounded-lg overflow-hidden border border-[#c8a45c]/50 hover:border-[#f0d894] transition-colors group"
                aria-label={`放大查看 ${hero.name} 立绘`}
                title="点击放大 2x 立绘"
              >
                <img
                  src={heroPortrait2x(hero.avatarUrl)}
                  alt={`${hero.name} 立绘`}
                  loading="eager"
                  decoding="async"
                  className="block w-full aspect-[2/3] object-cover object-top"
                />
                <span className="absolute right-2 bottom-2 text-[11px] px-2 py-1 rounded bg-black/70 text-[#e8cf94] border border-[#c8a45c]/40 opacity-90 group-hover:opacity-100">
                  放大查看
                </span>
              </button>

              {/* 定位 / 难度 */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {profile.roles.map(r => (
                    <span key={r} className="px-2 py-0.5 rounded-[4px] text-[11px] font-bold bg-[#2a2118] border border-[#c8a45c]/35 text-[#e8cf94]">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1" title={`难度 ${profile.difficulty} / 5`} aria-label={`难度 ${profile.difficulty} / 5`}>
                  <span className="text-[10px] modal-text-dim mr-0.5">难度</span>
                  {[1, 2, 3, 4, 5].map(i => <Star key={i} on={i <= profile.difficulty} />)}
                </div>
              </div>
            </div>

            {/* 技能列表 */}
            <div className="min-w-0 flex-1 flex flex-col gap-3">
              {skills.map((s, idx) => (
                <div key={`${s.name}-${idx}`} className="rounded-lg border border-[#8b7355]/35 bg-[#1a1410]/70 p-3 md:p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-ancient text-xl md:text-2xl text-[#f0dcae]">{s.name}</span>
                    {s.tags.map(t => (
                      <span key={t} className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold border ${TAG_STYLE[t]}`}>{t}</span>
                    ))}
                    {s.isLord && (
                      <span className="text-[10px] text-[#c8bda8]/70">（仅主公身份生效）</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] md:text-sm leading-relaxed modal-text">{s.desc}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs">
                    <span className="text-[#9a8b74]">触发时机</span>
                    <span className="text-[#e8cf94]">{s.timing}</span>
                  </div>
                  {s.quote && (
                    <p className="mt-1.5 text-[11px] md:text-xs italic text-[#a99a80]">“{s.quote}”</p>
                  )}
                </div>
              ))}

              {/* 实战提示 */}
              <div className="rounded-lg border border-[#c8a45c]/30 bg-[#241b12]/80 p-3 md:p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-[3px] h-3.5 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
                  <span className="text-xs font-bold tracking-[0.18em] text-[#d9c49a]">实战提示</span>
                </div>
                <p className="text-[12px] md:text-sm leading-relaxed modal-text">{profile.tip}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作：手机上固定可见 */}
        <div className="flex-none px-4 md:px-6 py-3 border-t border-[#c8a45c]/25 bg-[#100c08]/85 flex items-center gap-2 md:gap-3">
          <button onClick={onClose} className="btn-ink px-4 md:px-5 py-2.5 rounded-lg text-sm md:text-base flex-1 md:flex-none">
            关闭
          </button>
          {onSelect && (
            <button
              onClick={() => onSelect(hero)}
              className="btn-ink px-4 md:px-5 py-2.5 rounded-lg text-sm md:text-base flex-1 md:flex-none"
            >
              选择此将
            </button>
          )}
          {onStart && (
            <button
              onClick={() => onStart(hero)}
              disabled={hero.pending}
              className="btn-gold px-5 md:px-8 py-2.5 rounded-lg text-sm md:text-base font-bold tracking-wider flex-1 md:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {hero.pending ? '技能实装中' : '出战'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
