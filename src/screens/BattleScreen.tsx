import React from 'react';
import type { Card, Player } from '../../types';
import { ActionBar } from '../components/game/ActionBar';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from '../config/backgrounds';
import { BackgroundCarousel } from '../components/BackgroundCarousel';
import CardComponent, { CardArtFilters } from '../../components/CardComponent';
import { CenterDecks } from '../components/game/CenterDecks';
import { DiscardPileViewer } from '../components/game/DiscardPileViewer';
import { DyingModal } from '../components/game/DyingModal';
import { EnemySeats } from '../components/game/EnemySeats';
import { GameApiProvider } from '../game/GameApiContext';
import { GameTopBar, UiDisplayMenu } from '../components/game/GameTopBar';
import { HandTray } from '../components/game/HandTray';
import { HeroDetailModal } from '../components/HeroDetailModal';
import { IconArrowLeft } from '../components/Icons';
import { LogPanel, MobilePhaseChip, ObjectiveStrip, PhasePanel, TurnRail, TurnStrip } from '../components/game/GameHud';
import { OwnSeatPanel } from '../components/game/OwnSeatPanel';
import { PlayerInspectModal } from '../components/game/PlayerInspectModal';
import { PortraitLightbox } from '../components/PortraitLightbox';
import { ReactionModal } from '../components/game/ReactionModal';
import RulesDialog from '../components/RulesDialog';
import { BattleIntro } from '../components/game/BattleIntro';
import { SkillChoiceModal } from '../components/game/SkillChoiceModal';
import { SkillInfoModal } from '../components/game/SkillInfoModal';
import TutorialOverlay from '../components/TutorialOverlay';
import { WuguModal } from '../components/game/WuguModal';
import { FX_LABEL, FX_TAG } from '../game/fx';
import type { FxLevel } from '../game/fx';
import type { GameApi } from '../game/gameApi';
import type { SkillChoiceResult } from '../components/game/SkillChoiceModal';
import type { UiRegion, BgmPref } from '../components/game/GameTopBar';

/**
 * 对局界面外壳（从 App.tsx 的最后一个 return 原样搬出，JSX 逐字保留）。
 *
 * 契约：DOM 结构、class 名、aria-label，以及 data-region / data-density / data-size-tier /
 * data-motion / data-fx / data-seat-stagger 全部与搬出前一致，视觉零变化。
 *
 * 性能：纯渲染组件。所有函数与对象由 App 传引用（App 侧 useMemo/useCallback 兜住），
 * 组件内不新建内联对象，因此不给下层带来额外重渲染。
 */
export interface BattleScreenProps {
  battleIntro: { id: number; names: string[]; meIndex: number } | null;
  onIntroDone: () => void;
  DECISION_SECONDS: 20;
  SKILL_CHOICE_SECONDS: 30;
  activeSelectedId: any;
  advice: any;
  aiThinkingId: any;
  bgmPref: any;
  canUseWusheng: (p: Player) => boolean;
  chooseBgmPref: (v: BgmPref) => void;
  compactHand: boolean;
  cycleFx: () => void;
  damageAnimTarget: any;
  damageNumber: any;
  decisionLeft: any;
  deck: any;
  deckFx: any;
  detailHero: any;
  detailPlayerId: any;
  discardPile: any;
  dispatchCardClick: (card: Card, e?: React.MouseEvent) => void;
  drawPulse: any;
  dyingLeft: any;
  dyingState: any;
  enemies: Player[];
  exitToHome: (notice?: string) => void;
  finishTutorial: () => void;
  flightFx: any;
  fxDying: boolean;
  fxFlourish: boolean;
  fxJudge: boolean;
  fxLevel: any;
  fxSkill: boolean;
  gameApi: GameApi;
  getAttackRange: (p: Player) => number;
  getDistance: (fromId: number, toId: number) => number;
  getPlayer: (id: number) => Player | undefined;
  handLarge: boolean;
  handleCardClick: (card: Card, e?: React.MouseEvent) => void;
  handleManualSkipReaction: () => void;
  handleTargetClick: (targetId: number) => Promise<void>;
  healAnimTarget: any;
  healNumber: any;
  inspectPlayerId: any;
  isAiTakeover: any;
  isJiedaoMode: any;
  isJieyinMode: any;
  isJijiangMode: any;
  isLijianMode: any;
  isMobileHand: boolean;
  isMuted: any;
  isMyTurn: boolean;
  isProcessing: any;
  isRendeMode: any;
  isSelectingTarget: any;
  isSkillSealed: (id: number) => boolean;
  isZhangbaMode: any;
  isZhihengMode: any;
  jiedaoVictimTarget: any;
  jiedaoWeaponTarget: any;
  judgmentVisual: any;
  layoutDensity: any;
  lijianSelectedCardId: any;
  lijianSelectedTargets: any;
  logCollapsed: any;
  logs: any;
  me: Player;
  motionOn: any;
  orderCollapsed: any;
  pendingReaction: any;
  phase: any;
  phaseBanner: any;
  players: any;
  portraitHero: any;
  reactionLeft: any;
  rendeSelectedCardIds: any;
  rendeSelectedTarget: any;
  resolveSkillChoice: (r: SkillChoiceResult) => void;
  scaleStyle: any;
  selectedCardIds: any;
  setAdvice: any;
  setDetailHero: any;
  setDetailPlayerId: any;
  setInspectPlayerId: any;
  setIsAiTakeover: any;
  setLogCollapsed: any;
  setOrderCollapsedPersist: (v: boolean) => void;
  setPortraitHero: any;
  setShowDiscardViewer: any;
  setShowExitConfirm: any;
  setShowRules: any;
  setShowSkillModal: any;
  setShowUiMenu: any;
  setSkillBanner: any;
  setSpeedLevel: any;
  setWuguSelectedCard: any;
  setWuguSelection: any;
  showDiscardViewer: any;
  showExitConfirm: any;
  showRules: any;
  showSkillModal: any;
  showUiMenu: any;
  sizeTier: any;
  skillBanner: any;
  skillBannerTimerRef: React.RefObject<NodeJS.Timeout | null>;
  skillChoice: any;
  skillChoiceLeft: any;
  skillChoiceSel: any;
  skillChoiceValid: boolean;
  skillGlowId: any;
  skipTutorial: () => void;
  slashLikeActive: boolean;
  speedLevel: any;
  startTutorial: () => void;
  submitSkillChoice: () => void;
  theme: any;
  tiesuoSelectedTargets: any;
  toggleMotion: () => void;
  toggleMute: () => void;
  toggleSkillChoiceItem: (key: string, single: boolean) => void;
  toggleTheme: any;
  toggleUiRegion: (key: UiRegion) => void;
  turnIndex: any;
  turnPass: any;
  tutorialActive: any;
  uiHidden: any;
  viewport: any;
  visualCard: any;
  wuguLeft: any;
  wuguSelectedCard: any;
  wuguSelection: any;
}

export const BattleScreen: React.FC<BattleScreenProps> = (props) => {
  // 实测：CenterDecks / HandTray 的 onShowDiscard 原来是内联箭头函数，每次父级渲染都换新引用，
  // 导致下层 memo 永远失效（30 秒对局里 CenterDecks 313 次渲染中 309 次仅因此重渲染）。
  // setShowDiscardViewer 是 useState setter，引用天然稳定，这里只是把它包成稳定回调。
  //
  // GameTopBar / EnemySeats 的 onClick 回调和 enemies 数组同理：App 每次渲染都会新建，
  // 使下层 memo 永远命中不了。这里用「最新引用」模式把它们稳定下来——回调被调用时
  // 读的一定是本次渲染最新的一份，行为与原来逐字一致，只是引用不再变化。
  // 用 effect 而不是在渲染期赋值：渲染期赋值在并发渲染下可能把「未提交的那次 props」
  // 写进 ref，effect 在提交后执行，永远不会读到被丢弃的渲染。
  const latest = React.useRef(props);
  React.useEffect(() => { latest.current = props; });

  const setShowDiscardViewer = props.setShowDiscardViewer;
  const handleShowDiscard = React.useCallback(() => setShowDiscardViewer(true), [setShowDiscardViewer]);
  const handleShowRules = React.useCallback(() => latest.current.setShowRules(true), []);
  const handleCycleSpeed = React.useCallback(() => {
    const p = latest.current;
    p.setSpeedLevel(p.speedLevel === 1 ? 2 : p.speedLevel === 2 ? 3 : 1);
  }, []);
  const handleToggleTheme = React.useCallback(() => latest.current.toggleTheme(), []);
  const handleToggleMute = React.useCallback(() => latest.current.toggleMute(), []);
  const handleToggleMotion = React.useCallback(() => latest.current.toggleMotion(), []);
  const handleCycleFx = React.useCallback(() => latest.current.cycleFx(), []);
  const handleToggleUiMenu = React.useCallback(() => latest.current.setShowUiMenu((v: boolean) => !v), []);
  const handleSeatClick = React.useCallback((id: number) => { void latest.current.handleTargetClick(id); }, []);
  const handleOrderCollapsedChange = React.useCallback((v: boolean) => latest.current.setOrderCollapsedPersist(v), []);

  // enemies 是 App 里 players.filter(...) 的结果，每次渲染都是新数组。玩家对象在引擎里
  // 是不可变更新（combat.ts 无就地写字段），因此按下标比较元素引用即可判断是否需要换新数组。
  const enemiesRef = React.useRef(props.enemies);
  if (enemiesRef.current.length !== props.enemies.length
    || props.enemies.some((p, i) => p !== enemiesRef.current[i])) {
    enemiesRef.current = props.enemies;
  }
  const stableEnemies = enemiesRef.current;

  return (
<GameApiProvider value={props.gameApi}>
    <div
      data-density={props.layoutDensity}
      data-size-tier={props.sizeTier}
      data-motion={props.motionOn ? 'on' : 'off'}
      data-fx={props.fxLevel}
      data-seat-stagger={props.enemies.length >= 6 ? 'true' : 'false'}
      className={`h-screen w-full flex flex-col overflow-hidden relative ${props.theme === 'light' ? 'parchment-bg' : 'bg-[#1c1c1c]'}`}
      style={props.scaleStyle}
    >
      {/* 卡面锐化滤镜：全局只挂一份，供所有 CardComponent 引用 */}
      <CardArtFilters />

      {/* 背景轮播 - 白天模式显示 - 放在最底层 */}
      {props.theme === 'light' && (
        <div className="absolute inset-0" style={{ zIndex: -10 }}>
          <BackgroundCarousel 
            images={BACKGROUND_IMAGES}
            interval={CAROUSEL_CONFIG.interval}
          />
        </div>
      )}
      
      {/* Game Background Effects - 纯渐变实现，移除全屏噪点滤镜与 blur 光晕以保证帧率 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: -5,
          background: props.theme === 'dark'
            ? 'repeating-linear-gradient(42deg, rgba(255,236,190,0.014) 0 1px, rgba(0,0,0,0) 1px 4px), linear-gradient(180deg, #14100d 0%, #241b14 48%, #0c0906 100%)'
            : 'repeating-linear-gradient(42deg, rgba(120,95,55,0.035) 0 1px, rgba(0,0,0,0) 1px 5px), linear-gradient(180deg, #faf8f5 0%, #f2ece2 48%, #ece5d9 100%)'
        }}
      />
      {/* 中央牌桌柔光（静态 radial-gradient，零滤镜开销） */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: -5,
          background: props.theme === 'dark'
            ? 'radial-gradient(ellipse 62% 48% at 50% 46%, rgba(200,164,92,0.14) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 62% 48% at 50% 46%, rgba(196,167,125,0.20) 0%, transparent 70%)'
        }}
      />
      {/* 暗角（仅黑夜模式） */}
      {props.theme === 'dark' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: -5,
            background: 'radial-gradient(ellipse 92% 82% at 50% 50%, transparent 42%, rgba(0,0,0,0.55) 100%)'
          }}
        />
      )}

      {/* 牌桌描金边框：单层细线 + 四角加亮，替代原双层粗框 */}
      <div
        className={`absolute inset-2 rounded-lg border pointer-events-none ${props.theme === 'dark' ? 'border-[#8b7355]/30' : 'border-[#c4a77d]/25'}`}
        style={{ zIndex: 5 }}
      />
      <div className={`absolute top-2 left-2 w-16 h-16 border-l-2 border-t-2 rounded-tl-lg pointer-events-none ${props.theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      <div className={`absolute top-2 right-2 w-16 h-16 border-r-2 border-t-2 rounded-tr-lg pointer-events-none ${props.theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      <div className={`absolute bottom-2 left-2 w-16 h-16 border-l-2 border-b-2 rounded-bl-lg pointer-events-none ${props.theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      <div className={`absolute bottom-2 right-2 w-16 h-16 border-r-2 border-b-2 rounded-br-lg pointer-events-none ${props.theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      
      {/* 原版三国杀风格装饰线 */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent pointer-events-none z-10"></div>
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent pointer-events-none z-10"></div>
      
      {/* 命中 / 治疗全屏闪光：用 id 作为 key 保证每次伤害都能重新触发动画 */}
      {props.phaseBanner && props.fxLevel !== 'classic' && (
        <div key={`phase-${props.phaseBanner.id}`} className="phase-banner" aria-live="polite">
          <span className="phase-banner-text">{props.phaseBanner.text}</span>
          <span className="phase-banner-sub">{props.phaseBanner.sub}</span>
        </div>
      )}
      {props.damageNumber && (
        <div key={`hit-${props.damageNumber.id}`} className="absolute inset-0 z-[70] pointer-events-none animate-hit-flash" />
      )}
      {props.healNumber && (
        <div key={`heal-${props.healNumber.id}`} className="absolute inset-0 z-[70] pointer-events-none animate-heal-flash" />
      )}

      {/* Visual Effect Overlay - 优化版卡牌动画（判定/濒死期间让位，避免叠影与遮挡抉择弹窗） */}
      {props.visualCard && !props.judgmentVisual && !props.dyingState?.isActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden" style={{ contain: 'layout style paint' }}>
          {/* 出牌聚光：中心微亮 / 四周压暗，视线聚焦到牌面（仅完整档） */}
          {props.fxFlourish && <div className="absolute inset-0 card-spotlight"></div>}

          {/* 卡牌飞入动画容器 */}
          <div className="relative animate-card-fly-in" style={{ willChange: 'transform' }}>
            {/* 金色冲击环：牌落桌时向外扩散一次（仅完整档） */}
            {props.fxFlourish && <div className="card-burst" />}
            {/* 卡牌光晕 - 简化 */}
            {props.fxFlourish && <div className="absolute -inset-6 bg-yellow-400/20 blur-xl rounded-full"></div>}

            {/* 卡牌主体 */}
            <div className="relative scale-110 md:scale-125 animate-card-bounce">
              <div className="card-settle">
                <CardComponent card={props.visualCard.card} />
              </div>

              {/* 卡牌名称标签 */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="card-plate px-5 py-1.5 rounded-lg font-ancient text-lg">
                  {props.visualCard.playerName} {props.visualCard.verb ?? '打出'}
                </div>
              </div>
            </div>

            {/* 粒子效果 - 仅完整档，最多 4 个，随卡面一起销毁 */}
            {props.fxFlourish && (
              <>
                <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-particle-1"></div>
                <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-400 rounded-full animate-particle-2"></div>
                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-orange-400 rounded-full animate-particle-3"></div>
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-particle-4"></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 判定演出：判定牌翻面 + 朱印「判」 */}
      {props.judgmentVisual && props.fxJudge && (
        <div key={props.judgmentVisual.id} className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="absolute inset-0 judge-backdrop" />
          <div className="relative flex items-center gap-5 md:gap-9">
            <div className="judge-seal font-ancient">判</div>
            <div className={`relative judge-flip ${['♥', '♦'].includes(String(props.judgmentVisual.card.suit)) ? 'judge-red' : 'judge-black'} ${props.fxFlourish ? 'judge-flourish' : ''}`}>
              <div className="judge-halo" />
              <div className="scale-105 md:scale-125">
                <CardComponent card={props.judgmentVisual.card} />
              </div>
              <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap card-plate px-4 py-1 rounded-md font-ancient text-base">
                {props.judgmentVisual.playerName} · {props.judgmentVisual.reason} 判定
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 回合过场：墨金横带「X 回合结束 → 轮到 Y」，让换手不再突兀 */}
      {props.turnPass && (
        <div key={props.turnPass.id} className="absolute inset-0 z-[55] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="turn-pass-band" style={{ animationDuration: `${Math.round(1000 / props.speedLevel)}ms` }}>
            <span className="turn-pass-from font-ancient">{props.turnPass.from} · 回合结束</span>
            <span className="turn-pass-arrow" />
            <span className="turn-pass-to font-ancient">轮到 {props.turnPass.to}</span>
          </div>
        </div>
      )}

      {/* 出牌飞行（仅「完整」档）：牌沿二次曲线从出牌者飞向目标 */}
      {props.flightFx && (
        <div className="absolute inset-0 z-[54] pointer-events-none overflow-hidden" style={{ contain: 'layout style paint' }}>
          <div
            key={props.flightFx.id}
            className="fx-flight-card"
            style={{
              '--x0': `${props.flightFx.x0}px`, '--y0': `${props.flightFx.y0}px`,
              '--x1': `${props.flightFx.x1}px`, '--y1': `${props.flightFx.y1}px`,
            } as React.CSSProperties}
          >
            <span className="fx-flight-name font-ancient">{props.flightFx.card.name}</span>
          </div>
        </div>
      )}

      {/* 濒死：只在屏幕四边做低透明度红色呼吸，不整屏压红（纯净档起启用） */}
      {props.fxDying && props.dyingState?.isActive && <div className="fx-dying-edge" aria-hidden="true" />}

      {/* 技能发动特写：立绘从右侧切入 + 技能名大字（纯 CSS，≤1.2s，点击可跳过） */}
      {props.skillBanner && props.fxSkill && (() => {
        const caster = props.players.find((p: Player) => p.hero.name === props.skillBanner.hero)?.hero;
        return (
          <div key={props.skillBanner.id} className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none skill-cast-layer">
            <div
              className={`skill-cast text-center ${props.fxFlourish ? 'has-sweep' : ''}`}
              onClick={() => {
                if (props.skillBannerTimerRef.current) clearTimeout(props.skillBannerTimerRef.current);
                props.setSkillBanner(null);
              }}
              role="presentation"
            >
              {caster && (
                <div className="skill-cast-portrait">
                  <span className="skill-cast-ring" />
                  <img src={caster.avatarUrl} alt={caster.name} draggable={false} />
                </div>
              )}
              <div className="skill-banner-skill font-ancient">{props.skillBanner.skill}</div>
              <div className="skill-banner-hero font-ancient">{props.skillBanner.hero} · 发动技能</div>
            </div>
          </div>
        );
      })()}

      {/* 弃牌堆查看器 */}
      {props.showDiscardViewer && (
        <DiscardPileViewer cards={props.discardPile} onClose={() => props.setShowDiscardViewer(false)} />
      )}

      {/* 通用技能选择弹窗（人类角色可选；AI / 托管不出现） */}
      {props.skillChoice && !props.isAiTakeover && (
        <SkillChoiceModal
          request={props.skillChoice}
          selected={props.skillChoiceSel}
          left={props.skillChoiceLeft}
          seconds={props.SKILL_CHOICE_SECONDS}
          valid={props.skillChoiceValid}
          onToggle={props.toggleSkillChoiceItem}
          onChoose={(id) => props.resolveSkillChoice({ kind: 'choose', id })}
          onSubmit={props.submitSkillChoice}
          onCancel={() => props.resolveSkillChoice({ kind: 'cancel' })}
        />
      )}

      {/* Manual Reaction Modal */}
      {props.pendingReaction && !props.isAiTakeover && (
        <ReactionModal
          me={props.me}
          responder={props.players.find((p: Player) => p.id === props.pendingReaction.targetId) || props.me}
          sourceName={props.getPlayer(props.pendingReaction.sourceId)?.hero.name ?? ''}
          neededCard={props.pendingReaction.cardName}
          originalCardName={props.pendingReaction.originalCard.name}
          left={props.reactionLeft}
          seconds={props.DECISION_SECONDS}
          canWusheng={props.canUseWusheng(props.me)}
          onPick={props.handleCardClick}
          onSkip={props.handleManualSkipReaction}
        />
      )}

      {/* 武将详情：点击任意头像打开（人物介绍 + 技能说明） */}
      {props.inspectPlayerId !== null && (() => {
        const p = props.getPlayer(props.inspectPlayerId);
        if (!p) return null;
        return (
          <PlayerInspectModal
            player={p}
            onClose={() => props.setInspectPlayerId(null)}
            onZoom={(target) => { props.setInspectPlayerId(null); props.setPortraitHero(target.hero); }}
            onOpenDetail={(target) => { props.setInspectPlayerId(null); props.setDetailPlayerId(target.id); props.setDetailHero(target.hero); }}
          />
        );
      })()}

      {/* 立绘大图查看（竖幅原图，可关闭） */}
      <PortraitLightbox hero={props.portraitHero} onClose={() => props.setPortraitHero(null)} />

      {/* 武将详情（对局内点击座位 → 武将详情） */}
      <HeroDetailModal
        hero={props.detailHero}
        player={props.detailPlayerId != null ? (props.players.find((x: Player) => x.id === props.detailPlayerId) ?? null) : null}
        sealed={props.detailPlayerId != null ? props.isSkillSealed(props.detailPlayerId) : false}
        onClose={() => { props.setDetailHero(null); props.setDetailPlayerId(null); }}
        onZoom={(h) => props.setPortraitHero(h)}
      />

      {/* Skill Info Modal - 技能说明弹窗 */}
      {props.showSkillModal && (
        <SkillInfoModal me={props.me} canWusheng={props.canUseWusheng(props.me)} onClose={() => props.setShowSkillModal(false)} />
      )}

      {/* Dying State Modal - Ask for Peaches - 最高优先级 */}
      {props.dyingState && props.dyingState.isActive && (
        <DyingModal
          me={props.me}
          victim={props.getPlayer(props.dyingState.victimId)}
          rescuer={props.dyingState.rescuerId != null ? props.getPlayer(props.dyingState.rescuerId) : undefined}
          rescuerId={props.dyingState.rescuerId ?? null}
          hasTao={props.dyingState.hasTao ?? false}
          hasJiu={props.dyingState.hasJiu ?? false}
          hasJijiu={props.dyingState.hasJijiu}
          left={props.dyingLeft}
          seconds={props.DECISION_SECONDS}
          onUse={() => props.dyingState.resolve(true)}
          onSkip={() => props.dyingState.resolve(false)}
        />
      )}

      {/* 五谷丰登选择弹窗 - 点击选中+确认按钮 */}
      {props.wuguSelection && (
        <WuguModal
          playerName={props.wuguSelection.playerName}
          cards={props.wuguSelection.cards}
          selected={props.wuguSelectedCard}
          left={props.wuguLeft}
          seconds={props.DECISION_SECONDS}
          onSelect={props.setWuguSelectedCard}
          onConfirm={() => {
            if (!props.wuguSelectedCard) return;
            props.setWuguSelection(null);
            props.wuguSelection.onSelect(props.wuguSelectedCard);
            props.setWuguSelectedCard(null);
          }}
        />
      )}

      {/* 常驻托管开关：z-index 高于所有弹窗，响应求闪 / 五谷丰登等弹窗期间也能直接点 */}
      <div className="absolute top-2 left-2 z-[230] flex items-center gap-2">
        <button
          data-tour="takeover"
          onClick={() => props.setIsAiTakeover(!props.isAiTakeover)}
          title={props.isAiTakeover ? '关闭托管，亲自操作' : '开启托管，由 AI 代打（弹窗期间点击也会立即接管）'}
          aria-pressed={props.isAiTakeover}
          className={`ui-icon-btn gap-2 px-3 ${props.isAiTakeover ? '!bg-[#5d1b16] !border-[#c86b62] !text-[#f7e7cf]' : ''}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${props.isAiTakeover ? 'bg-[#f2a79c]' : 'bg-[#c8a45c]/70'}`} />
          <span className="text-xs font-bold tracking-[0.16em]">{props.isAiTakeover ? '托管中' : '托管'}</span>
        </button>
        <button
          onClick={() => props.setShowExitConfirm(true)}
          title="退出本局（会清除本局存档）"
          aria-label="退出对局"
          className="ui-icon-btn gap-1.5 px-2 md:px-3"
        >
          <IconArrowLeft />
          <span className="hidden md:inline text-xs font-bold tracking-[0.16em]">退出</span>
        </button>
      </div>

      {/* 左上身份目标条：对齐官方参考图左上角的「主×1 忠×1 反×2 内×1」与目标提示 */}
      <ObjectiveStrip players={props.players} me={props.me} hidden={props.uiHidden.objective} />

      {/* 手机端紧凑阶段指示：放在顶部控制区中间的空档，避免压住牌桌与战报 */}
      <MobilePhaseChip theme={props.theme} phase={props.phase} decisionLeft={props.decisionLeft} decisionSeconds={props.DECISION_SECONDS} hidden={props.uiHidden.phase} />

      {/* 界面显隐菜单：固定定位挂在根层，避免被牌桌/出牌顺序条的层叠上下文遮挡 */}
      {props.showUiMenu && (
        <UiDisplayMenu
          theme={props.theme}
          uiHidden={props.uiHidden}
          speedLevel={props.speedLevel}
          bgmPref={props.bgmPref}
          onToggleRegion={props.toggleUiRegion}
          onSetSpeed={props.setSpeedLevel}
          onChooseBgm={props.chooseBgmPref}
          onClose={() => props.setShowUiMenu(false)}
        />
      )}

      {/* 顶部工具栏：桌面端不占竖向高度，座位环绝对定位覆盖牌桌舞台 */}
      <div className="flex-none md:h-0 z-10 relative md:static">
        {/* 顶部装饰条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-700/50 to-transparent"></div>

        {/* 右上角控制组：帮助 / 速度 / 主题 / 静音 / 动效 / 特效，以及始终可见的「界面」显隐入口 */}
        <GameTopBar
          theme={props.theme}
          controlsHidden={props.uiHidden.controls}
          anyRegionHidden={props.uiHidden.controls || props.uiHidden.objective || props.uiHidden.phase || props.uiHidden.log || props.uiHidden.order}
          isMuted={props.isMuted}
          motionOn={props.motionOn}
          speedLevel={props.speedLevel}
          fxLabel={FX_LABEL[props.fxLevel as FxLevel]}
          fxTag={FX_TAG[props.fxLevel as FxLevel]}
          uiMenuOpen={props.showUiMenu}
          onShowRules={handleShowRules}
          onCycleSpeed={handleCycleSpeed}
          onToggleTheme={handleToggleTheme}
          onToggleMute={handleToggleMute}
          onToggleMotion={handleToggleMotion}
          onCycleFx={handleCycleFx}
          onToggleUiMenu={handleToggleUiMenu}
        />

        {/* 环形座位：桌面端绝对定位环绕牌桌；手机端为顶部横向压缩小卡 */}
        <EnemySeats
          enemies={stableEnemies}
          me={props.me}
          layoutDensity={props.layoutDensity}
          sizeTier={props.sizeTier}
          viewportW={props.viewport.w}
          turnIndex={props.turnIndex}
          isSelectingTarget={props.isSelectingTarget}
          slashLikeActive={props.slashLikeActive}
          isLijianMode={props.isLijianMode}
          isJieyinMode={props.isJieyinMode}
          isJijiangMode={props.isJijiangMode}
          isRendeMode={props.isRendeMode}
          isJiedaoMode={props.isJiedaoMode}
          rendeSelectedCardIds={props.rendeSelectedCardIds}
          lijianSelectedTargets={props.lijianSelectedTargets}
          tiesuoSelectedTargets={props.tiesuoSelectedTargets}
          selectedCardIds={props.selectedCardIds}
          rendeSelectedTarget={props.rendeSelectedTarget}
          jiedaoWeaponTarget={props.jiedaoWeaponTarget}
          jiedaoVictimTarget={props.jiedaoVictimTarget}
          damageAnimTarget={props.damageAnimTarget}
          healAnimTarget={props.healAnimTarget}
          skillGlowId={props.skillGlowId}
          aiThinkingId={props.aiThinkingId}
          damageNumber={props.damageNumber}
          healNumber={props.healNumber}
          dyingVictimId={props.dyingState?.isActive ? props.dyingState.victimId : null}
          dyingActive={!!(props.dyingState && props.dyingState.isActive)}
          fxLevel={props.fxLevel}
          isProcessing={props.isProcessing}
          hasPendingReaction={!!props.pendingReaction}
          getDistance={props.getDistance}
          getAttackRange={props.getAttackRange}
          onSeatClick={handleSeatClick}
          onInspect={props.setInspectPlayerId}
        />
      </div>

      {/* Middle: Field - 原版三国杀风格 */}
      <div data-region="field" className="flex-1 relative flex items-center justify-center w-full">
        
        {/* Logs - 战况记录：可折叠侧栏（桌面端） */}
        <LogPanel logs={props.logs} collapsed={props.logCollapsed} hidden={props.uiHidden.log} onCollapsedChange={props.setLogCollapsed} />

        {/* Phase Indicator - 五阶段进度轨（底部居中，紧邻手牌条上方） */}
        <PhasePanel
          theme={props.theme}
          phase={props.phase}
          playerName={props.getPlayer(props.turnIndex)?.hero.name ?? ''}
          decisionLeft={props.decisionLeft}
          decisionSeconds={props.DECISION_SECONDS}
          hidden={props.uiHidden.phase}
        />

        {/* 中央牌桌：静态椭圆绒面，给牌堆与结算一个视觉落点 */}
        <div data-region="felt" className="table-felt z-0" aria-hidden="true" />
        {/* 桌面水印：极淡的「殺」字，补足中央留白但不抢牌堆 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0" aria-hidden="true">
          <span className={`font-ancient select-none leading-none text-[110px] md:text-[150px] ${props.theme === 'dark' ? 'text-[#c8a45c]/[0.045]' : 'text-[#8b6914]/[0.07]'}`}>殺</span>
        </div>

        {/* Center Decks - 牌堆和弃牌堆 - 原版三国杀风格 */}
        {/* 出牌顺序：右侧竖向顺序条（桌面）；手机端折叠为一条横排 */}
        <TurnRail players={props.players} turnIndex={props.turnIndex} collapsed={props.orderCollapsed} hidden={props.uiHidden.order} onCollapsedChange={handleOrderCollapsedChange} />
        <TurnStrip players={props.players} turnIndex={props.turnIndex} collapsed={props.orderCollapsed} hidden={props.uiHidden.order} onCollapsedChange={handleOrderCollapsedChange} />

        <CenterDecks
          theme={props.theme}
          deckLength={props.deck.length}
          discardPile={props.discardPile}
          deckFx={props.deckFx}
          onShowDiscard={handleShowDiscard}
        />

        {/* Advice Modal */}
        {props.advice && (
          <div className="absolute right-4 top-10 w-72 modal-frame p-4 z-30">
             <div className="flex items-center gap-2 mb-3 border-b border-[#8b7355]/35 pb-2">
                <span className="w-[3px] h-6 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
                <div className="modal-title font-ancient text-2xl">孔明锦囊</div>
             </div>
             <p className="text-sm modal-text leading-relaxed italic tracking-wide">"{props.advice}"</p>
             <button onClick={() => props.setAdvice(null)} className="btn-ink mt-4 w-full text-sm py-2 rounded-lg">收起</button>
          </div>
        )}
      </div>

      {/* Bottom: Player Controls & Hand - 原版三国杀风格 */}
      <div data-region="bottom" className={`bottom-bar flex-none z-20 pb-2 pt-3 relative ${props.theme === 'dark' ? 'bg-gradient-to-t from-[#050505] via-[#0f0f0f] to-transparent' : 'bg-gradient-to-t from-[#f5f0eb]/60 via-transparent to-transparent'}`}>
        {/* 底部装饰线 */}
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${props.theme === 'dark' ? 'via-yellow-700/30' : 'via-[#c4a77d]/30'} to-transparent`}></div>
        
        {/* 玩家信息栏：自己固定牌桌下首（左侧），操作区靠右下 */}
        <div data-region="player-info" className="player-info-row flex flex-col md:flex-row md:justify-between md:items-start gap-1 md:gap-6 px-2 md:px-4 mb-1 md:mb-2">
          {/* 主视角座位：与敌方座位卡同一套卡面（势力框 + 全幅立绘 + 左竖姓名 + 右上勾玉 + 底部信息层） */}
          <OwnSeatPanel
            me={props.me}
            isMyTurn={props.isMyTurn}
            dyingActive={!!(props.dyingState && props.dyingState.isActive)}
            dyingVictimId={props.dyingState?.isActive ? props.dyingState.victimId : null}
            hasPendingReaction={!!props.pendingReaction}
            fxLevel={props.fxLevel}
            damageAnimTarget={props.damageAnimTarget}
            healAnimTarget={props.healAnimTarget}
            damageNumber={props.damageNumber}
            healNumber={props.healNumber}
            skillGlowId={props.skillGlowId}
            aiThinkingId={props.aiThinkingId}
            attackRange={props.getAttackRange(props.me)}
            onInspect={props.setInspectPlayerId}
          />

        {/* Control Buttons - 操作按钮：托管已统一放在左上角，避免重复入口 */}
        <ActionBar />
        </div>

        <HandTray
          theme={props.theme}
          compactHand={props.compactHand}
          uiHiddenLog={props.uiHidden.log}
          lastLog={props.logs[props.logs.length - 1]}
          me={props.me}
          deckLength={props.deck.length}
          discardLength={props.discardPile.length}
          onShowDiscard={handleShowDiscard}
          disabled={!!props.dyingState || props.isProcessing > 0}
          phase={props.phase}
          isMyTurn={props.isMyTurn}
          isAiTakeover={props.isAiTakeover}
          isZhihengMode={props.isZhihengMode}
          isLijianMode={props.isLijianMode}
          isRendeMode={props.isRendeMode}
          isZhangbaMode={props.isZhangbaMode}
          lijianSelectedCardId={props.lijianSelectedCardId}
          selectedCardIds={props.selectedCardIds}
          rendeSelectedCardIds={props.rendeSelectedCardIds}
          activeSelectedId={props.activeSelectedId}
          pendingReaction={props.pendingReaction}
          canWusheng={props.canUseWusheng(props.me)}
          drawPulse={props.drawPulse}
          layoutDensity={props.layoutDensity}
          isMobileHand={props.isMobileHand}
          handLarge={props.handLarge}
          onCardClick={props.dispatchCardClick}
        />
      </div>

      {/* 对局中玩法说明 / 新手教学入口（右上角 ?） */}
      {props.showRules && <RulesDialog onClose={() => props.setShowRules(false)} onStartTutorial={props.startTutorial} />}

      {/* 新手引导：高亮真实控件，不改变对局状态 */}
      {/* 开局入场仪式：亮出本局武将，淡出后交还主循环 */}
      {props.battleIntro && (
        <BattleIntro
          key={props.battleIntro.id}
          id={props.battleIntro.id}
          names={props.battleIntro.names}
          meIndex={props.battleIntro.meIndex}
          onDone={props.onIntroDone}
        />
      )}

      {props.tutorialActive && (
        <TutorialOverlay onFinish={props.finishTutorial} onSkip={props.skipTutorial} />
      )}

      {/* 退出对局确认：明确告知会清档，避免误触后无法恢复 */}
      {props.showExitConfirm && (
        <div className="absolute inset-0 z-[260] modal-mask flex items-center justify-center p-4" onClick={() => props.setShowExitConfirm(false)}>
          <div className="modal-shell rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title font-ancient text-2xl mb-2">退出本局？</h3>
            <p className="modal-text-dim text-sm mb-5">退出会清除本局存档，当前进度无法恢复。</p>
            <div className="flex flex-wrap justify-end gap-3">
              <button onClick={() => props.setShowExitConfirm(false)} className="btn-ink px-5 py-2.5 rounded-lg">继续对局</button>
              <button onClick={() => props.exitToHome()} className="btn-gold px-5 py-2.5 rounded-lg">退出并回首页</button>
            </div>
          </div>
        </div>
      )}
   </div>
    </GameApiProvider>
  );
};
