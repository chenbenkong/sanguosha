import React from 'react';
import { Hero } from '../../../types';
import { BackgroundCarousel } from '../BackgroundCarousel';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from '../../config/backgrounds';
import { IconSpeaker, IconMotion, IconDice, IconArrowLeft, ThemeIcon } from '../Icons';
import { KINGDOM_CLASS } from '../../game/constants';

export type HeroKingdomFilter = '全部' | '魏' | '蜀' | '吴' | '群';
const KINGDOMS: HeroKingdomFilter[] = ['全部', '魏', '蜀', '吴', '群'];

/** 选将页：势力筛选 / 搜索 / 分页网格 / 底部确认条 */
export const HeroSelectScreen: React.FC<{
  theme: 'dark' | 'light';
  motionOn: boolean;
  fxLabel: string;
  fxTag: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleMotion: () => void;
  onCycleFx: () => void;
  onToggleTheme: () => void;
  onBack: () => void;
  heroTotal: number;
  heroKingdom: HeroKingdomFilter;
  kingdomCounts: Record<string, number>;
  onKingdomChange: (k: HeroKingdomFilter) => void;
  heroQuery: string;
  onQueryChange: (v: string) => void;
  pageClamped: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  filteredCount: number;
  pagedHeroes: Hero[];
  allHeroes: Hero[];
  selectedHero: Hero | null;
  onPickHero: (h: Hero) => void;
  onOpenDetail: (h: Hero) => void;
  onOpenPortrait: (h: Hero) => void;
  onStart: (h: Hero) => void;
}> = ({
  theme, motionOn, fxLabel, fxTag, isMuted, onToggleMute, onToggleMotion, onCycleFx, onToggleTheme,
  onBack, heroTotal, heroKingdom, kingdomCounts, onKingdomChange, heroQuery, onQueryChange,
  pageClamped, pageCount, onPageChange, filteredCount, pagedHeroes, allHeroes, selectedHero,
  onPickHero, onOpenDetail, onOpenPortrait, onStart,
}) => (
  <div className={`h-screen flex flex-col relative ${theme === 'light' ? 'parchment-bg' : ''}`}>
    {theme === 'light' && (
      <BackgroundCarousel images={BACKGROUND_IMAGES} interval={CAROUSEL_CONFIG.interval} />
    )}

    {theme === 'dark' ? (
      <>
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1410] via-[#2d2418] to-[#1a1410]"></div>
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            mixBlendMode: 'overlay'
          }}
        ></div>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20,20 Q40,5 60,20 T100,20 M20,50 Q40,35 60,50 T100,50 M20,80 Q40,65 60,80 T100,80' stroke='%23d4af37' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="absolute inset-4 border-2 border-[#8b7355]/30 rounded-lg pointer-events-none"></div>
        <div className="absolute inset-6 border border-[#8b7355]/20 rounded-lg pointer-events-none"></div>
        <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-[#d4af37]/50 rounded-tl-lg pointer-events-none"></div>
        <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-[#d4af37]/50 rounded-tr-lg pointer-events-none"></div>
        <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-[#d4af37]/50 rounded-bl-lg pointer-events-none"></div>
        <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-[#d4af37]/50 rounded-br-lg pointer-events-none"></div>
      </>
    ) : (
      <>
        <div className="absolute inset-4 border-2 border-[#c4a77d]/30 rounded-lg pointer-events-none z-10"></div>
        <div className="absolute inset-6 border border-[#c4a77d]/20 rounded-lg pointer-events-none z-10"></div>
        <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-[#c4a77d]/40 rounded-tl-lg pointer-events-none z-10"></div>
        <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-[#c4a77d]/40 rounded-tr-lg pointer-events-none z-10"></div>
        <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-[#c4a77d]/40 rounded-bl-lg pointer-events-none z-10"></div>
        <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-[#c4a77d]/40 rounded-br-lg pointer-events-none z-10"></div>
      </>
    )}

    <div className="flex-none relative z-20 px-4 pt-3">
      <div className="relative flex items-center justify-center py-2">
        <button onClick={onBack} className="ui-text-btn absolute left-0" aria-label="返回首页">
          <IconArrowLeft />
          <span>返回</span>
        </button>

        <div className="text-center px-2 min-w-0 pr-[6.5rem] sm:pr-2 md:max-w-none">
          <h2 className={`font-ancient text-lg sm:text-3xl md:text-5xl whitespace-nowrap ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]'}`}>选择您的武将</h2>
          <div className={`mt-1.5 text-[10px] tracking-[0.3em] md:tracking-[0.42em] pl-[0.3em] whitespace-nowrap hidden sm:block ${theme === 'dark' ? 'text-[#8f7c5e]' : 'text-[#9b8a6c]'}`}>
            CHOOSE YOUR GENERAL · {heroTotal} 名
          </div>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button onClick={onToggleMute} className="ui-icon-btn" title={isMuted ? '开启音乐' : '静音'} aria-label={isMuted ? '开启音乐' : '静音'}>
            <IconSpeaker muted={isMuted} />
          </button>
          <button onClick={onToggleMotion} className="ui-icon-btn" title={motionOn ? '关闭动效' : '开启动效'} aria-label={motionOn ? '关闭动效' : '开启动效'}>
            <IconMotion off={!motionOn} />
          </button>
          <button onClick={onCycleFx} className="ui-icon-btn flex-col !gap-0.5" title={`${fxLabel}（点击切换）`} aria-label={`特效强度：${fxLabel}，点击切换`}>
            <span className="text-[12px] leading-none font-bold">特效</span>
            <span className="text-[10px] leading-none opacity-75">{fxTag}</span>
          </button>
          <button onClick={onToggleTheme} className="ui-icon-btn" title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'} aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}>
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </div>
    </div>

    <div className="flex-none relative z-20 px-4 pt-1.5">
      <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5" role="tablist" aria-label="按势力筛选武将">
          {KINGDOMS.map(k => (
            <button
              key={k}
              role="tab"
              aria-selected={heroKingdom === k}
              onClick={() => onKingdomChange(k)}
              className={`shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-md text-sm font-bold border transition-colors ${
                heroKingdom === k
                  ? (theme === 'dark' ? 'bg-[#c8a45c] text-[#1a1410] border-[#f0d894]' : 'bg-[#6b4a1a] text-[#f7e9c8] border-[#a8842c]')
                  : (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50 hover:border-[#c8a45c]' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60 hover:border-[#a8842c]')
              }`}
            >
              {k}<span className="ml-1 text-[10px] opacity-75">{kingdomCounts[k] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 sm:ml-auto">
          <input
            value={heroQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索姓名 / 技能"
            aria-label="搜索武将姓名或技能"
            className={`w-full min-h-[44px] pl-3 pr-11 rounded-md text-sm border outline-none ${
              theme === 'dark'
                ? 'bg-[#1a1410]/85 text-[#e8cf94] border-[#8b7355]/60 placeholder:text-[#7d6f5a] focus:border-[#c8a45c]'
                : 'bg-[#f7f0e2]/90 text-[#4a3a22] border-[#c4a77d]/70 placeholder:text-[#9b8a6c] focus:border-[#a8842c]'
            }`}
          />
          {heroQuery && (
            <button
              onClick={() => onQueryChange('')}
              aria-label="清空搜索"
              className={`absolute right-0.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-lg ${theme === 'dark' ? 'text-[#c8bda8]' : 'text-[#6b4a1a]'}`}
            >
              ✕
            </button>
          )}
        </div>

        <div className={`flex-none text-[11px] text-center sm:text-right ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
          {filteredCount} / {heroTotal} 名{pageCount > 1 ? ` · 第 ${pageClamped + 1}/${pageCount} 页` : ''}
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto px-4 pb-8 relative z-10 scrollbar-thin">
      {filteredCount === 0 ? (
        <div className={`py-16 text-center text-sm ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
          没有匹配的武将，试试清空搜索或切换势力
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 min-[1200px]:grid-cols-8 gap-3 w-full max-w-[1440px] mx-auto pt-2">
          {pagedHeroes.map(hero => (
            <button
              key={hero.id}
              onClick={() => onPickHero(hero)}
              className={`hero-pick hero-card group text-left kingdom-frame ${KINGDOM_CLASS[hero.kingdom] ?? ''}`}
              aria-pressed={selectedHero?.id === hero.id}
              aria-label={`选择 ${hero.name}`}
              title={`${hero.name}（${hero.kingdom} · ${hero.maxHp} 体力）【${hero.skillName}】${hero.skillDesc}${hero.lordSkillName ? ` 主公技【${hero.lordSkillName}】${hero.lordSkillDesc}` : ''}`}
            >
              <img
                src={hero.avatarUrl}
                alt={hero.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="hero-pick-shade" />

              <span className="hero-kingdom absolute top-2 left-2">{hero.kingdom}</span>

              <span className="hero-hp absolute top-2 right-2" title={`体力上限 ${hero.maxHp}`}>
                <span className="hero-hp-pips">
                  {Array.from({ length: hero.maxHp }).map((_, i) => (
                    <i key={i} className="hero-hp-pip" />
                  ))}
                </span>
              </span>

              {selectedHero?.id === hero.id && (
                <span className="absolute right-2 top-10 w-6 h-6 rounded-full bg-[#d4af37] text-[#241a0e] flex items-center justify-center text-xs font-bold shadow-lg">
                  ✓
                </span>
              )}

              <div className="hero-pick-foot absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-8">
                <div className="hero-pick-title truncate">{hero.description}</div>
                <div className="font-ancient hero-pick-name leading-tight text-[#f4e4bf] drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                  {hero.name}
                </div>
                <div className="hero-pick-skill">
                  <span className="truncate">【{hero.skillName}】</span>
                  {hero.pending && <span className="hero-lord-chip">实装中</span>}
                  {hero.lordSkillName && <span className="hero-lord-chip">主公技</span>}
                </div>
                <div className="hero-pick-desc line-clamp-3">{hero.skillDesc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 pb-4 pt-1">
          <button
            onClick={() => onPageChange(Math.max(0, pageClamped - 1))}
            disabled={pageClamped === 0}
            className={`min-h-[44px] min-w-[64px] px-3 rounded-md text-sm border disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60'}`}
            aria-label="上一页"
          >
            上一页
          </button>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => onPageChange(i)}
              aria-current={pageClamped === i ? 'page' : undefined}
              className={`min-h-[44px] min-w-[44px] rounded-md text-sm font-bold border ${
                pageClamped === i
                  ? (theme === 'dark' ? 'bg-[#c8a45c] text-[#1a1410] border-[#f0d894]' : 'bg-[#6b4a1a] text-[#f7e9c8] border-[#a8842c]')
                  : (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60')
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => onPageChange(Math.min(pageCount - 1, pageClamped + 1))}
            disabled={pageClamped >= pageCount - 1}
            className={`min-h-[44px] min-w-[64px] px-3 rounded-md text-sm border disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60'}`}
            aria-label="下一页"
          >
            下一页
          </button>
        </div>
      )}
    </div>

    <div className="pick-detail flex-none z-30 px-4 py-2.5">
      <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="flex items-center gap-3 min-w-0 w-full md:flex-1">
          {selectedHero ? (
            <>
              <button
                onClick={() => onOpenPortrait(selectedHero)}
                className="flex-none rounded-md overflow-hidden border border-[#c8a45c]/60 hover:border-[#f0d894] transition-colors"
                aria-label={`查看 ${selectedHero.name} 立绘大图`}
                title="查看立绘大图"
              >
                <img
                  src={selectedHero.avatarUrl}
                  alt={selectedHero.name}
                  loading="eager"
                  decoding="async"
                  className="block w-12 h-[72px] object-cover object-top"
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h3 className={`font-ancient text-2xl ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]'}`}>{selectedHero.name}</h3>
                  <span className={`text-[11px] tracking-wider ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
                    {selectedHero.kingdom} · {selectedHero.maxHp} 体力 · 【{selectedHero.skillName}】
                  </span>
                  <button
                    onClick={() => onOpenPortrait(selectedHero)}
                    className={`ml-auto flex-none text-[11px] px-2 py-0.5 rounded border ${theme === 'dark' ? 'border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15' : 'border-[#a8842c]/50 text-[#6b4a1a] hover:bg-[#c8a45c]/15'}`}
                  >
                    查看立绘
                  </button>
                  <button
                    onClick={() => onOpenDetail(selectedHero)}
                    className={`flex-none text-[11px] px-2 py-0.5 rounded border ${theme === 'dark' ? 'border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15' : 'border-[#a8842c]/50 text-[#6b4a1a] hover:bg-[#c8a45c]/15'}`}
                    aria-label={`查看 ${selectedHero.name} 武将详情`}
                  >
                    武将详情
                  </button>
                </div>
                <p className={`mt-0.5 text-xs leading-relaxed truncate ${theme === 'dark' ? 'text-[#c8bda8]' : 'text-[#5a4c38]'}`}>
                  {selectedHero.skillDesc}
                  {selectedHero.lordSkillName && <span className={`ml-2 ${theme === 'dark' ? 'text-[#d9b46a]' : 'text-[#8b6914]'}`}>主公技【{selectedHero.lordSkillName}】{selectedHero.lordSkillDesc}</span>}
                </p>
              </div>
            </>
          ) : (
            <div className={`flex-1 text-center text-xs md:text-sm ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
              滚动浏览 {heroTotal} 名武将 · 点选查看技能，确认后出战
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-none w-full md:w-auto">
          <button
            onClick={() => {
              const pool = allHeroes.filter(h => h.id !== selectedHero?.id && !h.pending);
              const pick = pool[Math.floor(Math.random() * pool.length)];
              if (pick) onStart(pick);
            }}
            className="btn-ink flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-ancient text-base tracking-wider"
            title="从已实装武将中随机挑选一名立即出战"
          >
            <IconDice />
            天命随机
          </button>
          <button
            onClick={() => selectedHero && onStart(selectedHero)}
            disabled={!selectedHero || selectedHero.pending}
            className="btn-gold flex-1 md:flex-none px-7 py-2.5 rounded-lg font-ancient text-lg tracking-[0.18em]"
          >
            {selectedHero?.pending ? '技能实装中' : '确认出战'}
          </button>
        </div>
      </div>
    </div>
  </div>
);
