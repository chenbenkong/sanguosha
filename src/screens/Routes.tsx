import React from 'react';
import type { Hero, LogEntry, Player } from '../../types';
import { HEROES } from '../../constants';
import { StartScreen } from '../components/game/StartScreen';
import { HeroSelectScreen } from '../components/game/HeroSelectScreen';
import { HeroDetailModal } from '../components/HeroDetailModal';
import { PortraitLightbox } from '../components/PortraitLightbox';
import GameOverScreen from '../components/GameOverScreen';
import { FX_LABEL, FX_TAG } from '../game/fx';
import type { FxLevel } from '../game/fx';
import type { WinnerSide } from '../game/constants';
import type { GameSave } from '../game/save';

/**
 * 首页 / 选将 / 结算 三个路由分支的包装组件。
 *
 * 这些分支原来直接写在 App.tsx 的 if 里，问题是它们共享一大票
 * theme / fx / 统计 / 回调，遮蔽了 App 真正的「状态与路由」职责。
 * 抽出来后 App.tsx 只判断 screen 属于哪一屏并传参，DOM 结构与组件树未变
 * （每个包装组件都只渲染原来那一棵子树，没有额外包裹层）。
 *
 * 说明：三个组件都不新增 hook，也不缓存 props——它们的父组件(App)每次渲染
 * 传入的都是同一批状态值或 useCallback 稳定引用，渲染次数与拆分前一致。
 */

/** 首页 */
export interface StartRouteProps {
  theme: 'dark' | 'light';
  layoutDensity: string;
  sizeTier: string;
  motionOn: boolean;
  fxLevel: FxLevel;
  scaleStyle: React.CSSProperties;
  playerCount: 5 | 7;
  onPlayerCount: (n: 5 | 7) => void;
  aiDifficulty: 'easy' | 'normal' | 'hard';
  onAiDifficulty: (d: 'easy' | 'normal' | 'hard') => void;
  savedGame: GameSave | null;
  onResume: () => void;
  onEnterSelect: () => void;
  onTutorial: () => void;
  onShowRules: () => void;
  onCloseRules: () => void;
  showRules: boolean;
  stats: { games: number; wins: number; losses: number };
  homeNotice: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleMotion: () => void;
  onCycleFx: () => void;
  onToggleTheme: () => void;
}

export const StartRoute: React.FC<StartRouteProps> = (p) => (
  <StartScreen
    theme={p.theme}
    layoutDensity={p.layoutDensity as never}
    sizeTier={p.sizeTier as never}
    motionOn={p.motionOn}
    fxLevel={p.fxLevel}
    fxLabel={FX_LABEL[p.fxLevel]}
    fxTag={FX_TAG[p.fxLevel]}
    scaleStyle={p.scaleStyle}
    playerCount={p.playerCount}
    onPlayerCount={p.onPlayerCount}
    aiDifficulty={p.aiDifficulty}
    onAiDifficulty={p.onAiDifficulty}
    savedGame={p.savedGame as never}
    onResume={p.onResume}
    onEnterSelect={p.onEnterSelect}
    onTutorial={p.onTutorial}
    onShowRules={p.onShowRules}
    onCloseRules={p.onCloseRules}
    showRules={p.showRules}
    stats={p.stats as never}
    homeNotice={p.homeNotice}
    isMuted={p.isMuted}
    onToggleMute={p.onToggleMute}
    onToggleMotion={p.onToggleMotion}
    onCycleFx={p.onCycleFx}
    onToggleTheme={p.onToggleTheme}
  />
);

/** 选将（含武将详情弹窗与立绘灯箱） */
export interface SelectRouteProps {
  theme: 'dark' | 'light';
  motionOn: boolean;
  fxLevel: FxLevel;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleMotion: () => void;
  onCycleFx: () => void;
  onToggleTheme: () => void;
  onBack: () => void;
  heroKingdom: string;
  kingdomCounts: Record<string, number>;
  onKingdomChange: (k: import('../components/game/HeroSelectScreen').HeroKingdomFilter) => void;
  heroQuery: string;
  onQueryChange: (v: string) => void;
  pageClamped: number;
  pageCount: number;
  onPageChange: (n: number) => void;
  filteredCount: number;
  pagedHeroes: Hero[];
  selectedHero: Hero | null;
  onPickHero: (h: Hero) => void;
  onOpenDetail: (h: Hero) => void;
  onOpenPortrait: (h: Hero) => void;
  onStart: (hero: Hero, opts?: { playerCount?: 5 | 7; tutorial?: boolean }) => void;
  detailHero: Hero | null;
  onCloseDetail: () => void;
  onSelectDetail: (h: Hero) => void;
  onStartWithHero: (h: Hero) => void;
  portraitHero: Hero | null;
  onClosePortrait: () => void;
}

export const SelectRoute: React.FC<SelectRouteProps> = (p) => (
  <>
    <HeroSelectScreen
      theme={p.theme}
      motionOn={p.motionOn}
      fxLabel={FX_LABEL[p.fxLevel]}
      fxTag={FX_TAG[p.fxLevel]}
      isMuted={p.isMuted}
      onToggleMute={p.onToggleMute}
      onToggleMotion={p.onToggleMotion}
      onCycleFx={p.onCycleFx}
      onToggleTheme={p.onToggleTheme}
      onBack={p.onBack}
      heroTotal={HEROES.length}
      heroKingdom={p.heroKingdom as never}
      kingdomCounts={p.kingdomCounts as never}
      onKingdomChange={p.onKingdomChange as never}
      heroQuery={p.heroQuery}
      onQueryChange={p.onQueryChange}
      pageClamped={p.pageClamped}
      pageCount={p.pageCount}
      onPageChange={p.onPageChange as never}
      filteredCount={p.filteredCount}
      pagedHeroes={p.pagedHeroes}
      allHeroes={HEROES}
      selectedHero={p.selectedHero}
      onPickHero={p.onPickHero}
      onOpenDetail={p.onOpenDetail}
      onOpenPortrait={p.onOpenPortrait}
      onStart={p.onStart as () => void}
    />
    <HeroDetailModal
      hero={p.detailHero}
      onClose={p.onCloseDetail}
      onSelect={p.onSelectDetail}
      onStart={p.onStartWithHero}
      onZoom={p.onOpenPortrait}
    />
    <PortraitLightbox hero={p.portraitHero} onClose={p.onClosePortrait} />
  </>
);

/** 结算 */
export interface GameOverRouteProps {
  players: Player[];
  winnerSide: WinnerSide | null;
  deckCount: number;
  discardCount: number;
  logs: LogEntry[];
  stats: { games: number; wins: number; losses: number };
  durationMs: number;
  theme: 'dark' | 'light';
  isMuted: boolean;
  toggleMute: () => void;
  motionOn: boolean;
  fxLevel: FxLevel;
  onRestart: () => void;
  onHome: () => void;
}

export const GameOverRoute: React.FC<GameOverRouteProps> = (p) => (
  <GameOverScreen
    players={p.players}
    winnerSide={p.winnerSide as never}
    deckCount={p.deckCount}
    discardCount={p.discardCount}
    logs={p.logs}
    stats={p.stats as never}
    durationMs={p.durationMs}
    theme={p.theme}
    isMuted={p.isMuted}
    toggleMute={p.toggleMute}
    motionOn={p.motionOn}
    fxLevel={p.fxLevel as never}
    onRestart={p.onRestart}
    onHome={p.onHome}
  />
);
