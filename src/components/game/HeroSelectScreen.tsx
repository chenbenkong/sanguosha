import React, { useEffect, useMemo, useState } from 'react';
import { Hero } from '../../../types';
import { BackgroundCarousel } from '../BackgroundCarousel';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from '../../config/backgrounds';
import { IconSpeaker, IconMotion, IconDice, IconArrowLeft, ThemeIcon } from '../Icons';
import { HeroCard } from './HeroCard';
import { HERO_PAGE_SIZE, filterHeroes, parseHeroQuery } from './heroSelectQuery';
import { useRecentHeroes } from './useRecentHeroes';
import { useCardArtMode } from './useCardArtMode';

export type HeroKingdomFilter = '全部' | '魏' | '蜀' | '吴' | '群';
const KINGDOMS: HeroKingdomFilter[] = ['全部', '魏', '蜀', '吴', '群'];

/**
 * 选将页：势力筛选 / 搜索 / 分页网格 / 底部确认条。
 *
 * 筛选与分页在本组件内从 allHeroes 重算：搜索要支持「魏 3」「锁定技」这类
 * 势力/体力/技能类型组合，这层语义属于选将页 UI，而 App.tsx 的过滤只做
 * 姓名/技能名包含。allHeroes 是全量武将，所以这里能独立得出自洽的结果。
 */
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
  onPageChange, allHeroes, selectedHero, onPickHero, onOpenDetail, onOpenPortrait, onStart,
}) => {
  const { ids: recentIds, push: pushRecent } = useRecentHeroes();
  const { mode: artMode, setMode: setArtMode } = useCardArtMode();
  /** 「最近」是选将页自己的筛选项，不占用 App 的 heroKingdom 联合类型 */
  const [recentOnly, setRecentOnly] = useState(false);
  const [page, setPage] = useState(0);

  const tokens = useMemo(() => parseHeroQuery(heroQuery), [heroQuery]);

  /** 最近使用按「最近在前」排列，其余沿用全量顺序 */
  const recentHeroes = useMemo(
    () => recentIds.map(id => allHeroes.find(h => h.id === id)).filter((h): h is Hero => Boolean(h)),
    [recentIds, allHeroes],
  );

  const filteredHeroes = useMemo(() => {
    const scoped = recentOnly ? recentHeroes : allHeroes;
    const byKingdom = scoped.filter(h => heroKingdom === '全部' || h.kingdom === heroKingdom);
    return filterHeroes(byKingdom, tokens);
  }, [recentOnly, recentHeroes, allHeroes, heroKingdom, tokens]);

  const pageCount = Math.max(1, Math.ceil(filteredHeroes.length / HERO_PAGE_SIZE));
  const pageClamped = Math.min(page, pageCount - 1);
  const pagedHeroes = filteredHeroes.slice(pageClamped * HERO_PAGE_SIZE, (pageClamped + 1) * HERO_PAGE_SIZE);

  /** 条件变化回到第一页：否则「最近」只剩 5 人时仍停在旧页码会看到空白 */
  useEffect(() => { setPage(0); }, [recentOnly, heroKingdom, heroQuery]);
  useEffect(() => {
    if (page !== pageClamped) setPage(pageClamped);
  }, [page, pageClamped]);

  const changePage = (p: number) => {
    setPage(p);
    onPageChange(p);
  };

  const pickHero = (h: Hero) => {
    pushRecent(h.id);
    onPickHero(h);
  };

  const tabClass = (active: boolean) =>
    [
      'shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-md text-sm font-bold border transition-colors',
      active
        ? (theme === 'dark' ? 'bg-[#c8a45c] text-[#1a1410] border-[#f0d894]' : 'bg-[#6b4a1a] text-[#f7e9c8] border-[#a8842c]')
        : (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50 hover:border-[#c8a45c]' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60 hover:border-[#a8842c]'),
    ].join(' ');

  const shellCls = theme === 'light' ? 'parchment-bg' : '';
  const mutedCls = theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]';

  /** 墨底肌理：噪点 + 金线水波，与改动前逐字一致 */
  const NOISE_SVG = 'url("data:image/svg+xml,%3Csvg width=\'400\' height=\'400\' viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")';
  const WAVE_SVG = 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20,20 Q40,5 60,20 T100,20 M20,50 Q40,35 60,50 T100,50 M20,80 Q40,65 60,80 T100,80\' stroke=\'%23d4af37\' stroke-width=\'0.5\' fill=\'none\' opacity=\'0.3\'/%3E%3C/svg%3E")';

  return (
    <div className={'h-screen flex flex-col relative ' + shellCls}>      {theme === 'light' && (
        <BackgroundCarousel images={BACKGROUND_IMAGES} interval={CAROUSEL_CONFIG.interval} />
      )}

      {theme === 'dark' ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1410] via-[#2d2418] to-[#1a1410]"></div>
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: NOISE_SVG,
              mixBlendMode: 'overlay'
            }}
          ></div>
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: WAVE_SVG }}></div>
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
            <h2 className={'font-ancient text-lg sm:text-3xl md:text-5xl whitespace-nowrap ' + (theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]')}>选择您的武将</h2>
            <div className={'mt-1.5 text-[10px] tracking-[0.3em] md:tracking-[0.42em] pl-[0.3em] whitespace-nowrap hidden sm:block ' + mutedCls}>
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
            <button onClick={onCycleFx} className="ui-icon-btn flex-col !gap-0.5" title={fxLabel + '（点击切换）'} aria-label={'特效强度：' + fxLabel + '，点击切换'}>
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
            <button
              role="tab"
              aria-selected={recentOnly}
              onClick={() => { setRecentOnly(true); onKingdomChange('全部'); }}
              className={tabClass(recentOnly)}
              title={'最近选择的 ' + recentIds.length + ' 名武将'}
            >
              最近<span className="ml-1 text-[10px] opacity-75">{recentIds.length}</span>
            </button>
            {KINGDOMS.map(k => (
              <button
                key={k}
                role="tab"
                aria-selected={!recentOnly && heroKingdom === k}
                onClick={() => { setRecentOnly(false); onKingdomChange(k); }}
                className={tabClass(!recentOnly && heroKingdom === k)}
              >
                {k}<span className="ml-1 text-[10px] opacity-75">{kingdomCounts[k] ?? 0}</span>
              </button>
            ))}
          </div>

          {/* 画面模式：立绘看得清脸，卡面看得全信息。两者取舍真实存在，
              所以给切换而不是替用户决定；默认立绘（脸大更好扫视）。 */}
          <div
            className="flex items-center gap-1 shrink-0 sm:ml-2"
            role="group"
            aria-label="切换卡面显示方式"
          >
            {([['portrait', '立绘'], ['card', '卡面']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setArtMode(m)}
                aria-pressed={artMode === m}
                className={tabClass(artMode === m) + ' min-w-0 px-2.5'}
                title={m === 'card' ? '显示官方完整卡面（含技能文本）' : '显示武将立绘（裁切半身）'}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64 sm:ml-auto">
            <input
              value={heroQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="搜索姓名 / 势力 / 体力 / 技能"
              aria-label="搜索武将：姓名、势力、体力、技能类型，空格分隔多个关键词"
              className={'w-full min-h-[44px] pl-3 pr-11 rounded-md text-sm border outline-none ' + (theme === 'dark'
                ? 'bg-[#1a1410]/85 text-[#e8cf94] border-[#8b7355]/60 placeholder:text-[#7d6f5a] focus:border-[#c8a45c]'
                : 'bg-[#f7f0e2]/90 text-[#4a3a22] border-[#c4a77d]/70 placeholder:text-[#9b8a6c] focus:border-[#a8842c]')}
            />
            {heroQuery && (
              <button
                onClick={() => onQueryChange('')}
                aria-label="清空搜索"
                className={'absolute right-0.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-lg ' + (theme === 'dark' ? 'text-[#c8bda8]' : 'text-[#6b4a1a]')}
              >
                ✕
              </button>
            )}
          </div>

          <div className={'flex-none text-[11px] text-center sm:text-right ' + mutedCls}>
            {filteredHeroes.length} / {heroTotal} 名{pageCount > 1 ? ' · 第 ' + (pageClamped + 1) + '/' + pageCount + ' 页' : ''}
          </div>
        </div>

        {tokens.length > 1 && (
          <div className="max-w-[1440px] mx-auto mt-1 flex flex-wrap items-center gap-1.5" aria-live="polite">
            {tokens.map(t => (
              <span key={t} className={'px-1.5 py-0.5 rounded text-[10px] tracking-wider border ' + (theme === 'dark' ? 'border-[#8b7355]/50 text-[#c8bda8] bg-[#1a1410]/70' : 'border-[#c4a77d]/60 text-[#6b4a1a] bg-[#f3ead8]/80')}>
                {t}
              </span>
            ))}
            <span className={'text-[10px] ' + mutedCls}>同时命中以上全部条件</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 relative z-10 scrollbar-thin">
        {filteredHeroes.length === 0 ? (
          <div className={'py-16 text-center text-sm ' + mutedCls}>
            {recentOnly && recentIds.length === 0
              ? '还没有选过武将，出战一次后这里会记住最近 5 名'
              : '没有匹配的武将，试试清空搜索或切换势力'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 min-[1200px]:grid-cols-8 gap-3 w-full max-w-[1440px] mx-auto pt-2">
            {pagedHeroes.map(hero => (
              <HeroCard
                key={hero.id}
                hero={hero}
                theme={theme}
                artMode={artMode}
                selected={selectedHero?.id === hero.id}
                onPick={pickHero}
              />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-center flex-wrap gap-2 pb-4 pt-1">
            <button
              onClick={() => changePage(Math.max(0, pageClamped - 1))}
              disabled={pageClamped === 0}
              className={'min-h-[44px] min-w-[64px] px-3 rounded-md text-sm border disabled:opacity-40 disabled:cursor-not-allowed ' + (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60')}
              aria-label="上一页"
            >
              上一页
            </button>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => changePage(i)}
                aria-current={pageClamped === i ? 'page' : undefined}
                className={'min-h-[44px] min-w-[44px] rounded-md text-sm font-bold border ' + (pageClamped === i
                  ? (theme === 'dark' ? 'bg-[#c8a45c] text-[#1a1410] border-[#f0d894]' : 'bg-[#6b4a1a] text-[#f7e9c8] border-[#a8842c]')
                  : (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60'))}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => changePage(Math.min(pageCount - 1, pageClamped + 1))}
              disabled={pageClamped >= pageCount - 1}
              className={'min-h-[44px] min-w-[64px] px-3 rounded-md text-sm border disabled:opacity-40 disabled:cursor-not-allowed ' + (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60')}
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
                  aria-label={'查看 ' + selectedHero.name + ' 立绘大图'}
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
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className={'font-ancient text-2xl ' + (theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]')}>{selectedHero.name}</h3>
                    <span className={'text-[11px] tracking-wider ' + mutedCls}>
                      {selectedHero.kingdom} · {selectedHero.maxHp} 体力 · 【{selectedHero.skillName}】
                    </span>
                    <button
                      onClick={() => onOpenPortrait(selectedHero)}
                      className={'ml-auto flex-none text-[11px] px-2 py-0.5 rounded border ' + (theme === 'dark' ? 'border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15' : 'border-[#a8842c]/50 text-[#6b4a1a] hover:bg-[#c8a45c]/15')}
                    >
                      查看立绘
                    </button>
                    <button
                      onClick={() => onOpenDetail(selectedHero)}
                      className={'flex-none text-[11px] px-2 py-0.5 rounded border ' + (theme === 'dark' ? 'border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15' : 'border-[#a8842c]/50 text-[#6b4a1a] hover:bg-[#c8a45c]/15')}
                      aria-label={'查看 ' + selectedHero.name + ' 武将详情'}
                    >
                      武将详情
                    </button>
                  </div>
                  <p className={'mt-0.5 text-xs leading-relaxed truncate ' + (theme === 'dark' ? 'text-[#c8bda8]' : 'text-[#5a4c38]')}>
                    {selectedHero.skillDesc}
                    {selectedHero.lordSkillName && <span className={'ml-2 ' + (theme === 'dark' ? 'text-[#d9b46a]' : 'text-[#8b6914]')}>主公技【{selectedHero.lordSkillName}】{selectedHero.lordSkillDesc}</span>}
                  </p>
                </div>
              </>
            ) : (
              <div className={'flex-1 text-center text-xs md:text-sm ' + mutedCls}>
                滚动浏览 {heroTotal} 名武将 · 悬停看技能，点选后确认出战
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
};
