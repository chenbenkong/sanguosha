import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Hero, Player, Card, GamePhase, CardName, LogEntry, Identity, Suit, CardType, Equipment, EquipmentSlot } from './types';
import { HEROES, INITIAL_DECK, EQUIP_META } from './constants';
import { playSfx, SFX_FOR_NAME } from './src/audio/sfx';
import { playCardVoice, playSkillVoice, playDeathVoice, playEnterVoice, hasCardVoice } from './src/audio/voice';
import CardComponent, { CardArtFilters } from './components/CardComponent';
import TutorialOverlay from './src/components/TutorialOverlay';
import { PortraitLightbox } from './src/components/PortraitLightbox';
import { HeroDetailModal } from './src/components/HeroDetailModal';
import RulesDialog from './src/components/RulesDialog';
import { GameSave, SAVE_VERSION, readSave, writeSave, clearSave, consumeSaveRejected, isSaveFinished } from './src/game/save';
import { shuffle, rankValue, wuguKeepPriority } from './src/game/utils';
import { useGameState, setPlayers, setDeck, setDiscardPile, setTurnIndex, setPhase, setWinnerSide } from './src/game/gameStore';
import { countExemptHandCards, computeDiscardExcess, evaluateWinnerSide, nextAliveTurnIndex, seatDistance, suddenDeathDamage, targetProtection } from './src/game/rules';
import { jiexingTriggers, countHuguanExempt, tianzeDraws, shengduDrawCount, nifuAdjust } from './src/game/skills-batch6';
import { isAlly as isAllyImpl, isEnemy as isEnemyImpl } from './src/game/ai/relations';
import { isSkillSealed as isSkillSealedImpl, skillsOn as skillsOnImpl } from './src/game/ai/skillGate';
import { pickAITarget as pickAITargetImpl } from './src/game/ai/targeting';
import { shouldAiSavePlayer as shouldAiSavePlayerImpl } from './src/game/ai/rescue';
import { allEquipBlack, allEquipRed, equipList, hasWeimu as hasWeimuImpl } from './src/game/policies/equipment';
import { nearestOtherPlayer as nearestOtherPlayerImpl, pickWeakest as pickWeakestImpl } from './src/game/policies/targets';
import { canGrantZhangMarks, hasZhangMark as hasZhangMarkImpl, zhangMarksFromCards } from './src/game/policies/zhang';
import { BattleScreen } from './src/screens/BattleScreen';
import { GameOverRoute, SelectRoute, StartRoute } from './src/screens/Routes';
import { FX_LABEL, FX_ORDER, FX_TAG } from './src/game/fx';
import type { FxLevel } from './src/game/fx';
import { createCombatEngine } from './src/game/combat';
import './src/game/skills';
import { dispatchTurnEnd } from './src/game/skills/dispatch';
import type { CombatDeps, CombatEngine } from './src/game/combat';
import { GameApiProvider } from './src/game/GameApiContext';
import type { GameApi } from './src/game/gameApi';
import { LogPanel, PhasePanel, TurnRail, TurnStrip, ObjectiveStrip, MobilePhaseChip } from './src/components/game/GameHud';
import { PlayerInspectModal } from './src/components/game/PlayerInspectModal';
import { SkillInfoModal } from './src/components/game/SkillInfoModal';
import { DyingModal } from './src/components/game/DyingModal';
import { WuguModal } from './src/components/game/WuguModal';
import { DiscardPileViewer } from './src/components/game/DiscardPileViewer';
import { SkillChoiceModal, SkillChoiceRequest, SkillChoiceResult } from './src/components/game/SkillChoiceModal';
import { ReactionModal } from './src/components/game/ReactionModal';
import { StartScreen } from './src/components/game/StartScreen';
import { HeroSelectScreen } from './src/components/game/HeroSelectScreen';
import { CenterDecks } from './src/components/game/CenterDecks';
import { HandTray } from './src/components/game/HandTray';
import { EnemySeats } from './src/components/game/EnemySeats';
import { OwnSeatPanel } from './src/components/game/OwnSeatPanel';
import { ActionBar } from './src/components/game/ActionBar';
import { GameTopBar, UiDisplayMenu, UiRegion, BgmPref } from './src/components/game/GameTopBar';
import { IconSpeaker, IconSun, IconMoon, IconBolt, IconBook, IconDice, IconMotion, IconArrowLeft, ThemeIcon, IconEye } from './src/components/Icons';
import { useLayoutProfile } from './src/hooks/useLayoutProfile';
import GameOverScreen from './src/components/GameOverScreen';
import { useTheme } from './src/contexts/ThemeContext';
import { WINNER_LABEL, WinnerSide, APP_VERSION, KINGDOM_CLASS } from './src/game/constants';
import { BackgroundCarousel } from './src/components/BackgroundCarousel';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from './src/config/backgrounds';

// 分段背景音乐：首页 / 对局 / 决战
// 优先用 Opus（体积约为 MP3 的一半），浏览器不支持时回退 MP3
const OPUS_OK = (() => {
  try {
    return !!new Audio().canPlayType('audio/ogg; codecs="opus"');
  } catch {
    return false;
  }
})();
const BGM_TRACKS: Record<'start' | 'battle' | 'climax', string> = {
  start: OPUS_OK ? 'audio/bgm/home.ogg' : 'audio/bgm/home.mp3',
  battle: OPUS_OK ? 'audio/bgm/battle.ogg' : 'audio/bgm/battle.mp3',
  climax: OPUS_OK ? 'audio/bgm/climax.ogg' : 'audio/bgm/climax.mp3',
};

// 界面图标已拆分到 src/components/Icons.tsx

// 全局类型声明
declare global {
  interface Window {
    jiuBoost?: Record<number, boolean>;
    bingliangMark?: Record<number, boolean>;
  }
}


// 特效档位表已搬到 src/game/fx.ts（首页/选将/对局三处共用同一份数据）

// scaleStyle 在 1:1 视口下为 undefined（见 useLayoutProfile）；模块级空对象保证
// 传给 StartScreen 的 style 引用稳定，既不新增每次渲染的对象，也不改变渲染结果。
const EMPTY_STYLE: React.CSSProperties = {};

// 对局界面可收起/隐藏的固定显示项：类型与文案统一维护在 GameTopBar 中
// 对局 BGM 偏好同样由 GameTopBar 提供类型与文案

// 战报行 / 战绩侧栏 / 阶段轨 / 出牌顺序 / 身份目标条已拆到 src/components/game/GameHud.tsx

// 仅本地开发构建：定向测试探针开关。
// 直接读 import.meta.env.DEV：vite 在生产构建时把它替换为字面量 false，
// esbuild 随之把 if (DEV_BUILD) 分支与 dbgMark 的调用点整体消去（tree-shake 的前提是常量可折叠，
// 之前经 unknown 断言绕了一圈，rollup 无法证明它是常量，只能留到运行期判断）。
const DEV_BUILD: boolean = import.meta.env.DEV;

const App: React.FC = () => {
  // --- Theme ---
  const { theme, toggleTheme } = useTheme();
  
  // --- App State ---
  const [screen, setScreen] = useState<'start' | 'select' | 'game' | 'gameover'>('start');
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);
  const [playerCount, setPlayerCount] = useState<5 | 7>(5); // 游戏人数选择
  
  // 视口分档（CSS 像素）：高分屏换算、密度档、宽屏档统一在 useLayoutProfile 里维护
  const { viewport, uiScale, scaleStyle, layoutDensity, sizeTier } = useLayoutProfile();


  // --- Game State ---
  // 对局核心状态统一收敛在 src/game/gameStore.ts（单一写入口），这里只订阅快照
  const { deck, discardPile, players, turnIndex, phase, winnerSide } = useGameState();
  const deckRef = useRef<Card[]>([]); // 用于获取最新的牌堆状态
  const discardPileRef = useRef<Card[]>([]); // 用于获取最新的弃牌堆状态

  // 牌堆动作提示：摸牌时牌堆「弹一下」，洗切时整堆抖动
  const [deckFx, setDeckFx] = useState<{ kind: 'tap' | 'shuffle', id: number } | null>(null);
  const prevDeckLenRef = useRef<number>(0);
  const deckFxInitRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevDeckLenRef.current;
    const cur = deck.length;
    prevDeckLenRef.current = cur;
    // 开局发牌不算「洗切」：第一次「由空变满」只记录长度
    if (!deckFxInitRef.current) {
      if (cur > 0) deckFxInitRef.current = true;
      return;
    }
    if (prev === 0 && cur > 0) {
      // 弃牌堆洗回牌堆
      setDeckFx({ kind: 'shuffle', id: Date.now() });
      const t = setTimeout(() => setDeckFx(null), 950);
      return () => clearTimeout(t);
    }
    if (cur < prev) {
      setDeckFx({ kind: 'tap', id: Date.now() });
      const t = setTimeout(() => setDeckFx(null), 420);
      return () => clearTimeout(t);
    }
  }, [deck.length]);
  
  // 同步 refs
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);
  
  useEffect(() => {
    discardPileRef.current = discardPile;
  }, [discardPile]);
  
  const [isProcessing, setIsProcessing] = useState(0); // 全局状态锁计数，防止结算期间进行其他操作
  const isGameOverRef = useRef<boolean>(false); // 游戏结束标志，防止重复触发
  const gameStartedAtRef = useRef<number>(0); // 本局开始时间，用于结算页「用时」
  // 长局兜底：「粮尽」提示是否已播报（回合数复用下方全局 turnCountRef）
  const famineAnnouncedRef = useRef<boolean>(false);

  // --- 人类决策读秒 ---
  // 出牌 / 弃牌阶段超时未操作：已选牌则自动出牌，未选牌则自动跳过
  const DECISION_SECONDS = 20;
  // 无懈可击链式结算深度上限：引擎内同值，App 侧保留以便本地引用一致
  const MAX_WUXIE_DEPTH = 6;
  const [decisionLeft, setDecisionLeft] = useState<number | null>(null);
  const [reactionLeft, setReactionLeft] = useState<number | null>(null);
  const [wuguLeft, setWuguLeft] = useState<number | null>(null);
  const [dyingLeft, setDyingLeft] = useState<number | null>(null);
  const onDecisionTimeoutRef = useRef<() => void>(() => {});
  const reactionTickRef = useRef<number | null>(null);
  
  // Feature State
  const [isAiTakeover, setIsAiTakeover] = useState<boolean>(false);
  // 看门狗复位信号：卡死恢复时自增，触发主循环重新推进当前阶段
  const [loopNudge, setLoopNudge] = useState<number>(0);

  // 仅本地开发：阶段推进轨迹（用于定位长局卡死，生产构建为 no-op 且被裁剪）
  const dbgMark = (where: string) => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __sgTrace?: Array<{ where: string; t: number }> };
    w.__sgTrace = [...(w.__sgTrace || []), { where, t: Date.now() }].slice(-40);
  };

  // 游戏速度控制（1x/2x/3x，持久化到 localStorage）
  const [speedLevel, setSpeedLevel] = useState<1 | 2 | 3>(() => {
    const saved = Number(localStorage.getItem('sgs-speed'));
    return saved === 2 || saved === 3 ? (saved as 2 | 3) : 1;
  });
  const speedRef = useRef<number>(speedLevel);
  useEffect(() => {
    speedRef.current = speedLevel;
    localStorage.setItem('sgs-speed', String(speedLevel));
  }, [speedLevel]);

  // AI 难度：简单 / 普通 / 困难（持久化；只影响 AI，不影响玩家）
  type AiDifficulty = 'easy' | 'normal' | 'hard';
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>(() => {
    const saved = localStorage.getItem('sgs-ai-diff');
    return saved === 'easy' || saved === 'hard' ? saved : 'normal';
  });
  const aiDifficultyRef = useRef<AiDifficulty>(aiDifficulty);
  useEffect(() => {
    aiDifficultyRef.current = aiDifficulty;
    localStorage.setItem('sgs-ai-diff', aiDifficulty);
  }, [aiDifficulty]);

  // --- UI/Interaction State ---
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // --- 对局存档 ---
  // savedGame：首页「继续上一局」用的存档摘要
  // checkpoint：回合切换时置位，effect 里用当前渲染状态落盘（避免 ref 滞后）
  const [savedGame, setSavedGame] = useState<GameSave | null>(() => readSave());
  const [checkpoint, setCheckpoint] = useState<{ turnIndex: number, id: number } | null>(null);
  useEffect(() => {
    if (!checkpoint) return;
    // 已结束/已退出：绝不能再写存档，否则首页会重新出现「继续上一局」
    if (isGameOverRef.current) return;
    const snap: GameSave = {
      v: SAVE_VERSION,
      ts: Date.now(),
      playerCount: (players.length === 7 ? 7 : 5),
      players,
      deck,
      discardPile,
      turnIndex: checkpoint.turnIndex,
      logs,
    };
    if (writeSave(snap)) setSavedGame(snap);
    // 只在下一位回合开始时落盘一次，不随每次状态变化重写
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoint]);

  // 阶段切换横幅：短促 0.8s，pointer-events-none，不阻塞任何操作
  const [phaseBanner, setPhaseBanner] = useState<{ text: string; sub: string; id: string } | null>(null);
  const phaseBannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (screen !== 'game' || winnerSide) return;
    const label =
      phase === GamePhase.START ? '回合开始' :
      phase === GamePhase.JUDGE ? '判定阶段' :
      phase === GamePhase.DRAW ? '摸牌阶段' :
      phase === GamePhase.ACTION ? '出牌阶段' :
      phase === GamePhase.DISCARD ? '弃牌阶段' :
      phase === GamePhase.END ? '结束阶段' : '';
    if (!label) return;
    const p = players.find(x => x.id === turnIndex);
    if (!p) return;
    if (phaseBannerTimerRef.current) clearTimeout(phaseBannerTimerRef.current);
    setPhaseBanner({ text: label, sub: p.hero.name + (p.isHuman ? '（你）' : ''), id: Date.now().toString(36) });
    phaseBannerTimerRef.current = setTimeout(() => setPhaseBanner(null), 760);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnIndex, screen, winnerSide]);

  // 选将页：势力筛选 / 姓名搜索 / 分页。状态在切页与刷新后保留
  type HeroKingdomFilter = '全部' | '魏' | '蜀' | '吴' | '群';
  const HERO_PAGE_SIZE = 24;
  const [heroKingdom, setHeroKingdom] = useState<HeroKingdomFilter>(() => {
    const v = localStorage.getItem('sgs-hero-kingdom');
    return v === '魏' || v === '蜀' || v === '吴' || v === '群' ? v : '全部';
  });
  const [heroQuery, setHeroQuery] = useState<string>(() => localStorage.getItem('sgs-hero-query') || '');
  const [heroPage, setHeroPage] = useState<number>(() => Math.max(0, Number(localStorage.getItem('sgs-hero-page')) || 0));
  useEffect(() => {
    try { localStorage.setItem('sgs-hero-kingdom', heroKingdom); } catch { /* ignore */ }
  }, [heroKingdom]);
  useEffect(() => {
    try { localStorage.setItem('sgs-hero-query', heroQuery); } catch { /* ignore */ }
  }, [heroQuery]);
  useEffect(() => {
    try { localStorage.setItem('sgs-hero-page', String(heroPage)); } catch { /* ignore */ }
  }, [heroPage]);

  const kingdomCounts = useMemo(() => {
    const c: Record<string, number> = { 全部: HEROES.length, 魏: 0, 蜀: 0, 吴: 0, 群: 0 };
    for (const h of HEROES) c[h.kingdom] = (c[h.kingdom] || 0) + 1;
    return c;
  }, []);

  const filteredHeroes = useMemo(() => {
    const q = heroQuery.trim().toLowerCase();
    return HEROES.filter(h => {
      if (heroKingdom !== '全部' && h.kingdom !== heroKingdom) return false;
      if (!q) return true;
      return h.name.toLowerCase().includes(q) || h.skillName.toLowerCase().includes(q) || h.description.toLowerCase().includes(q);
    });
  }, [heroKingdom, heroQuery]);

  const heroPageCount = Math.max(1, Math.ceil(filteredHeroes.length / HERO_PAGE_SIZE));
  const heroPageClamped = Math.min(heroPage, heroPageCount - 1);
  const pagedHeroes = filteredHeroes.slice(heroPageClamped * HERO_PAGE_SIZE, (heroPageClamped + 1) * HERO_PAGE_SIZE);

  useEffect(() => {
    if (heroPage !== heroPageClamped) setHeroPage(heroPageClamped);
  }, [heroPage, heroPageClamped]);


  // Selection: Now supports multiple IDs for discard phase
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  // Strong single-selection source of truth for ACTION phase visuals
  const [activeSelectedId, setActiveSelectedId] = useState<string | null>(null);
  
  const [isSelectingTarget, setIsSelectingTarget] = useState<boolean>(false);
  const [pendingReaction, setPendingReaction] = useState<{ 
    sourceId: number, 
    targetId: number, 
    cardName: CardName, 
    originalCard: Card,
    canUseLongdan?: boolean,
    skillCardName?: CardName,
    canUseWuxie?: boolean
  } | null>(null);

  // Promise resolver for human reaction (pausing the game flow)
  const humanReactionResolver = useRef<((result: { played: boolean, isWuxie: boolean }) => void) | null>(null);
  const timeoutIdRef = useRef<number | null>(null);

  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  
  // Skill Mode
  const [isZhihengMode, setIsZhihengMode] = useState<boolean>(false); // 孙权制衡模式
  const [hasUsedZhiheng, setHasUsedZhiheng] = useState<boolean>(false); // 孙权是否已使用过制衡技能
  
  // 貂蝉离间技能状态
  const [isLijianMode, setIsLijianMode] = useState<boolean>(false); // 离间模式
  const [hasUsedLijian, setHasUsedLijian] = useState<boolean>(false); // 是否已使用离间
  const [lijianSelectedCardId, setLijianSelectedCardId] = useState<string | null>(null); // 离间技能选中的卡牌
  const [lijianSelectedTargets, setLijianSelectedTargets] = useState<number[]>([]); // 离间技能选中的目标（最多2个男性）
  const lijianLogRef = useRef<{ targetId: number; timestamp: number } | null>(null); // 防止离间日志重复

  // 刘备仁德技能状态
  const [isRendeMode, setIsRendeMode] = useState<boolean>(false); // 仁德模式
  const [rendeSelectedCardIds, setRendeSelectedCardIds] = useState<string[]>([]); // 仁德选中的卡牌
  const [rendeSelectedTarget, setRendeSelectedTarget] = useState<number | null>(null); // 仁德选中的目标

  // 铁索连环多目标选择状态
  const [tiesuoSelectedTargets, setTiesuoSelectedTargets] = useState<number[]>([]); // 铁索连环选中的目标（1-2个）
  const tiesuoLogRef = useRef<{ targetId: number; timestamp: number } | null>(null); // 防止铁索连环日志重复

  // 借刀杀人目标选择状态
  const [isJiedaoMode, setIsJiedaoMode] = useState<boolean>(false); // 借刀杀人模式
  const [jiedaoWeaponTarget, setJiedaoWeaponTarget] = useState<number | null>(null); // 有武器的目标
  const [jiedaoVictimTarget, setJiedaoVictimTarget] = useState<number | null>(null); // 被攻击的目标

  // 出牌阶段【杀】的使用次数（有诸葛连弩则不限）
  const slashUsageRef = useRef<Record<number, number>>({});
  // 张星彩「枪舞」：出牌阶段限一次的判定结果（点数），以及本回合是否已发动
  const qiangwuUsedRef = useRef<boolean>(false);
  // 刘备「仁德」：本回合累计给出的牌数与是否已触发回血
  const rendeGivenRef = useRef<number>(0);
  const rendeHealedRef = useRef<boolean>(false);
  const qiangwuPointRef = useRef<number | null>(null);
  const [qiangwuPoint, setQiangwuPoint] = useState<number | null>(null);
  const [hasUsedQiangwu, setHasUsedQiangwu] = useState<boolean>(false);
  // 孙寒华「妙剑」：出牌阶段限一次（人类按钮 / AI 自动共用一个 ref）
  const [hasUsedMiaoJian, setHasUsedMiaoJian] = useState<boolean>(false);
  // 孙寒华「冲虚」：出牌阶段限一次（人类按钮 / AI 自动共用一个 ref）
  const [hasUsedChongxu, setHasUsedChongxu] = useState<boolean>(false);
  // 卞夫人「挽危」：每回合限一次
  const wanweiUsedRef = useRef<boolean>(false);
  // 本轮补齐的第二技能状态
  const xuejiUsedRef = useRef<boolean>(false); // 关银屏「血祭」出牌阶段限一次
  const [hasUsedXueji, setHasUsedXueji] = useState<boolean>(false);
  const fengpoUsedRef = useRef<boolean>(false); // 马云禄「凤魄」回合内首张【杀】
  const roundLastTurnRef = useRef<number | null>(null); // 卑弥呼「纵傀」轮次检测
  const fengpoBoostRef = useRef<Record<string, number>>({}); // 凤魄伤害加成（按牌 id）
  const shouxiDeclaredRef = useRef<Set<string>>(new Set()); // 曹节「守玺」已声明牌名（每种限一次）
  const chongxuUsedRef = useRef<boolean>(false); // 孙寒华「冲虚」出牌阶段限一次
  const miaoJianUsedRef = useRef<boolean>(false); // 孙寒华「妙剑」出牌阶段限一次
  const lingrenUsedRef = useRef<boolean>(false); // 曹婴「凌人」出牌阶段限一次
  const lingrenBoostRef = useRef<Record<string, { targetId: number; bonus: number }>>({}); // 凌人伤害加成（按牌 id）
  const runweiUsedRef = useRef<boolean>(false); // 陆郁生「润微」出牌阶段限一次
  const runweiGiftRef = useRef<Array<{ targetId: number; ids: string[] }>>([]); // 润微本阶段给出的牌（可能有多次）
  // 润微：失去 X 张牌后可在本阶段再次发动，且不能指定本回合获得过牌的角色
  const runweiExtraRef = useRef<{ turn: number; lossX: number; lost: number } | null>(null);
  const runweiSecondUsedRef = useRef<boolean>(false);
  const runweiSecondFireRef = useRef<((blocked: number[]) => Promise<number>) | null>(null); // 满足失去 X 张后由弃牌/用牌事件直接触发第二次发动
  const runweiBlockedRef = useRef<{ turn: number; ids: number[] }>({ turn: -1, ids: [] });
  const shuanghuaiUsedRef = useRef<boolean>(false); // 陆郁生「霜怀」每回合限一次
  const lastShuanghuaiTargetRef = useRef<number | null>(null); // 霜怀上一次的目标
  const yanyuCountRef = useRef<number>(0); // 夏侯氏「燕语」本阶段重铸【杀】数
  const turnUsedOnOthersRef = useRef<Record<number, boolean>>({}); // 蔡夫人「窃听」：本回合是否用牌指定过其他角色
  const lianzhuUsedRef = useRef<boolean>(false); // 董白「连诛」本回合已发动
  const wuyuanUsedRef = useRef<boolean>(false); // 胡金定「武缘」本回合已发动
  const sheyiUsedRef = useRef<boolean>(false); // 蔡贞姬「舍裔」本轮已发动
  const yanjiaoUsedRef = useRef<boolean>(false); // 张昌蒲「严教」本回合已发动
  const usedTypesRef = useRef<Set<CardType>>(new Set()); // 蔡贞姬「天音」本回合使用过的牌类型
  const hongyiUsedRef = useRef<boolean>(false); // 羊徽瑜「弘仪」本回合已发动
  const firstUsedCardRef = useRef<Set<string>>(new Set()); // 通用：每名角色每回合的第一张牌
  const turnOwnerIdRef = useRef<number>(-1); // 当前回合角色（供明置锁定等机制使用）
  // 第六批新增武将的「本回合/本轮首次」去重集合
  const fangduUsedRef = useRef<Set<string>>(new Set()); // 袁姬「芳妒」
  const lingleUsedRef = useRef<Set<string>>(new Set()); // 孙翎鸾「聆乐」
  const kanggeRescueRef = useRef<Set<number>>(new Set()); // 唐姬「抗歌」救援每轮限一次
  const fangzongDisabledTurnRef = useRef<number>(-1); // 花鬘「芳踪」失效的回合
  const fumianTargetUsedRef = useRef<boolean>(false); // 吴苋「福绵」本回合额外目标已用
  const cangHuiUsedRef = useRef<boolean>(false); // 孙鲁班「谮毁」本回合已发动
  const shenxianTurnRef = useRef<number>(-1); // 张星彩「甚贤」本回合是否已发动
  // 伏皇后「惴恐」赢：该角色本回合使用牌不能选择除自己外的角色为目标
  const doutuSelfOnlyRef = useRef<number | null>(null);
  // 朱雀羽扇：本回合转换偏好（首张普通【杀】询问后记忆，避免每张都问）
  const zhuquePrefRef = useRef<Record<number, 'fire' | 'normal'>>({});
  // 判定阶段结算结果：兵粮寸断跳过摸牌、乐不思蜀跳过出牌（进入判定阶段前清零）
  const judgeSkipRef = useRef<{ draw: boolean; action: boolean }>({ draw: false, action: false });
  const doutuDistanceRef = useRef<Record<number, number>>({}); // 「惴恐」没赢：到伏皇后距离视为 1
  const yuejianCountRef = useRef<number>(0); // 卞夫人「约俭」本回合已发动次数（上限 2）
  // 卞夫人「约俭」：待置入弃牌堆的牌（牌 id → 卞夫人 id），真正进弃牌堆时才展示手牌判定
  const yuejianPendingRef = useRef<Map<string, number>>(new Map());
  // 孙鲁育「穆穆」：获得防具后，本回合该角色不能使用或打出【杀】
  const mumuNoSlashRef = useRef<number | null>(null);
  // 孙鲁育「魅步」：止息（至多使用 X 张牌，使用锦囊后结束出牌阶段）与本回合与孙鲁育距离视为 1
  const zhixiRef = useRef<{ id: number; limit: number; used: number; trickUsed: boolean } | null>(null);
  const meibuDistanceRef = useRef<Record<number, number>>({}); // 受影响角色 id → 孙鲁育 id（距离视为 1）
  // 鲍三娘「许身」：因许身进入濒死时记录下来，脱离濒死后可把「武圣」「当先」授予救援者
  const xushenDyingRef = useRef<{ id: number } | null>(null);
  // 许身授予的技能持续到救援者下回合结束：记录授予时的回合序号
  const xushenGrantTurnsRef = useRef<Record<number, number>>({});
  // 当先：本回合是否已执行过额外（回合开始时）的出牌阶段
  const dangxianExtraPhaseRef = useRef<{ turn: number; active: boolean } | null>(null);

  // 孙尚香「结姻」技能状态
  const [isJieyinMode, setIsJieyinMode] = useState<boolean>(false);
  const [jieyinTarget, setJieyinTarget] = useState<number | null>(null);
  const [hasUsedJieyin, setHasUsedJieyin] = useState<boolean>(false);
  // 张昌蒲「严教」：出牌阶段限一次，人类通过技能按钮发起（选花色 + 选目标）
  const [hasUsedYanjiao, setHasUsedYanjiao] = useState<boolean>(false);
  // 刘备「激将」：主动使用【杀】时令其他蜀势力角色打出一张【杀】
  const [isJijiangMode, setIsJijiangMode] = useState<boolean>(false);

  // 甘宁「奇袭」技能状态：将黑色牌当【过河拆桥】使用
  const [isQixiMode, setIsQixiMode] = useState<boolean>(false);

  // 丈八蛇矛：两张手牌当【杀】
  const [isZhangbaMode, setIsZhangbaMode] = useState<boolean>(false);
  const [zhangbaPending, setZhangbaPending] = useState<Card[] | null>(null);

  // 周瑜「反间」：出牌阶段限一次，指定一名角色
  const [isFanjianMode, setIsFanjianMode] = useState<boolean>(false);
  const [hasUsedFanjian, setHasUsedFanjian] = useState<boolean>(false);
  // 大乔「国色」：方块牌当【乐不思蜀】
  const [isGuoseMode, setIsGuoseMode] = useState<boolean>(false);
  // 华佗「青囊」：弃一张手牌，令一名角色回复1点体力
  const [isQingnangMode, setIsQingnangMode] = useState<boolean>(false);
  const [qingnangCardId, setQingnangCardId] = useState<string | null>(null);
  const [hasUsedQingnang, setHasUsedQingnang] = useState<boolean>(false);
  // 步练师「安恤」：出牌阶段限一次，选择两名手牌数不同的角色
  const [isAnxuMode, setIsAnxuMode] = useState<boolean>(false);
  const [hasUsedAnxu, setHasUsedAnxu] = useState<boolean>(false);
  const [anxuTargets, setAnxuTargets] = useState<number[]>([]);
  // 许褚「裸衣」：本回合【杀】/【决斗】伤害+1
  const luoyiPlayerRef = useRef<number | null>(null);

  // ── 第 1 批女将技能状态（孙茹/何太后/吴国太/甘夫人/邹氏/郭皇后）──
  // 吴国太「甘露」：出牌阶段限一次，交换两名角色装备区
  const [isGanluMode, setIsGanluMode] = useState<boolean>(false);
  const [ganluTargets, setGanluTargets] = useState<number[]>([]);
  const [hasUsedGanlu, setHasUsedGanlu] = useState<boolean>(false);
  const ganluUsedRef = useRef<boolean>(false);
  // 邹氏「倾城」：弃置黑色牌，暗置一名角色的武将牌
  const [isQingchengMode, setIsQingchengMode] = useState<boolean>(false);
  const [hasUsedQingcheng, setHasUsedQingcheng] = useState<boolean>(false);
  const qingchengUsedRef = useRef<boolean>(false);
  const zoushiRevealedRef = useRef<Set<number>>(new Set()); // 「祸水」已明置
  const skillSealRef = useRef<Record<number, number>>({}); // 被「倾城」暗置：解封回合计数
  const turnCountRef = useRef<number>(0); // 全局回合计数（用于暗置解封）
  // 郭皇后「矫诏」/「殚心」
  const [hasUsedJiaozhao, setHasUsedJiaozhao] = useState<boolean>(false);
  const [guohuanghouLevel, setGuohuanghouLevel] = useState<number>(1);
  const guohuanghouLevelRef = useRef<Record<number, number>>({});
  const jiaozhaoUsedRef = useRef<boolean>(false);
  // 矫诏：声明后保留展示牌，本回合由玩家决定何时当声明牌使用（不可指定自己）
  const [jiaozhaoPending, setJiaozhaoPending] = useState<{ ownerId: number; cardId: string; declared: CardName; level: number } | null>(null);
  const jiaozhaoPendingRef = useRef<{ ownerId: number; cardId: string; declared: CardName; level: number } | null>(null);
  // 何太后「戚乱」：本回合内何太后击杀数
  const hetaishouKillsRef = useRef<number>(0);

  // 被「倾城」暗置时，人类玩家的技能按钮整体禁用（视觉由 theme.css 的 body[data-human-sealed] 控制）
  useEffect(() => {
    const human = playersRef.current.find(p => p.isHuman);
    document.body.dataset.humanSealed = human && isSkillSealed(human.id) ? 'true' : 'false';
    return () => { document.body.dataset.humanSealed = 'false'; };
  }, [players]);

  // 仅本地开发：向定向测试脚本暴露当前回合与阶段（生产构建中整段移除）
  useEffect(() => {
    if (!DEV_BUILD) return;
    (window as unknown as { __devTurn?: { turn: number; phase: string } }).__devTurn = { turn: turnIndex, phase };
  }, [turnIndex, phase]);

  // 战绩统计（localStorage 持久化）
  const [stats, setStats] = useState<{ games: number; wins: number; losses: number }>(() => {
    try {
      const raw = localStorage.getItem('sgs-stats');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.games === 'number') return parsed;
      }
    } catch { /* ignore */ }
    return { games: 0, wins: 0, losses: 0 };
  });

  // Dying State
  const [dyingState, setDyingState] = useState<{
    victimId: number;
    isActive: boolean;
    rescuerId?: number;
    hasTao?: boolean;
    hasJiu?: boolean;
    hasJijiu?: boolean;
    resolve: (result: boolean) => void;
  } | null>(null);

  // Dying resolver for async/await
  const dyingResolver = useRef<((result: boolean) => void) | null>(null);
  const dyingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dyingTickRef = useRef<number | null>(null);
  // 刚被救活的角色短时间内不再重复询问，避免回合结算重入时弹出第二个濒死框
  const recentlySavedRef = useRef<Record<number, number>>({});

  // Skill Info Modal State
  const [showSkillModal, setShowSkillModal] = useState<boolean>(false);
  // 点击头像查看任意角色的武将详情
  const [inspectPlayerId, setInspectPlayerId] = useState<number | null>(null);
  // 立绘大图（竖幅原图）查看
  const [portraitHero, setPortraitHero] = useState<Hero | null>(null);
  // 武将详情面板（选将页 / 对局内）
  const [detailHero, setDetailHero] = useState<Hero | null>(null);
  // 对局内打开详情时记录角色 id，用于展示实时状态（选将页为 null）
  const [detailPlayerId, setDetailPlayerId] = useState<number | null>(null);
  // 对局战报折叠（桌面）
  const [logCollapsed, setLogCollapsed] = useState<boolean>(true);
  // 出牌顺序条折叠（桌面竖条 / 手机顶部横条共用同一偏好，默认展开）
  const [orderCollapsed, setOrderCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sgs-order-collapsed') === '1'; } catch { return false; }
  });
  const setOrderCollapsedPersist = (v: boolean) => {
    setOrderCollapsed(v);
    try { localStorage.setItem('sgs-order-collapsed', v ? '1' : '0'); } catch { /* ignore */ }
  };
  // 界面显隐：设置栏 / 身份目标 / 阶段指示 / 战报 / 出牌顺序，逐项开关并持久化
  const [uiHidden, setUiHidden] = useState<Record<UiRegion, boolean>>(() => {
    const empty: Record<UiRegion, boolean> = { controls: false, objective: false, phase: false, log: false, order: false };
    try {
      const raw = localStorage.getItem('sgs-ui-hidden-v1');
      if (!raw) return empty;
      return { ...empty, ...(JSON.parse(raw) as Partial<Record<UiRegion, boolean>>) };
    } catch { return empty; }
  });
  const toggleUiRegion = (key: UiRegion) => setUiHidden(prev => {
    const next = { ...prev, [key]: !prev[key] };
    try { localStorage.setItem('sgs-ui-hidden-v1', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [showUiMenu, setShowUiMenu] = useState<boolean>(false);
  // 对局音乐偏好：默认「随人数」保持原有战场/决战分段；可改为始终首页曲或始终战场曲
  const [bgmPref, setBgmPref] = useState<BgmPref>(() => {
    try {
      const v = localStorage.getItem('sgs-bgm-pref');
      return v === 'home' || v === 'battle' ? v : 'auto';
    } catch { return 'auto'; }
  });
  const chooseBgmPref = (v: BgmPref) => {
    setBgmPref(v);
    try { localStorage.setItem('sgs-bgm-pref', v); } catch { /* ignore */ }
  };

  // 玩法说明弹窗（首页）
  const [showRules, setShowRules] = useState<boolean>(false);
  // 对局中退出确认 / 首页提示（如：上一局已结束）
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  // 防止结算页「再来一局」被连点开两局
  const startGuardRef = useRef<number>(0);

  // --- 新手引导 ---
  // 引导期间冻结主循环与读秒，只高亮真实控件，不改变任何对局数据
  const [tutorialActive, setTutorialActive] = useState<boolean>(false);
  const tutorialHeroRef = useRef<Hero | null>(null);

  // 首页提示自动消失，避免长期占位
  useEffect(() => {
    if (!homeNotice) return;
    const t = setTimeout(() => setHomeNotice(null), 5000);
    return () => clearTimeout(t);
  }, [homeNotice]);

  // 启动时如果发现存档已结束（被 readSave 拒绝），明确提示而不是静默消失
  useEffect(() => {
    if (consumeSaveRejected()) setHomeNotice('上一局已结束，请重新开始一局');
  }, []);

  // 五谷丰登选择状态
  const [wuguSelection, setWuguSelection] = useState<{
    cards: Card[];
    playerName: string;
    onSelect: (card: Card | null) => void;
  } | null>(null);
  const [wuguSelectedCard, setWuguSelectedCard] = useState<Card | null>(null); // 五谷丰登选中的卡牌

  // Visual Effects
  const [damageAnimTarget, setDamageAnimTarget] = useState<number | null>(null);
  const [damageNumber, setDamageNumber] = useState<{ targetId: number, amount: number, id: string } | null>(null);
  const [healAnimTarget, setHealAnimTarget] = useState<number | null>(null);
  const [healNumber, setHealNumber] = useState<{ targetId: number, amount: number, id: string } | null>(null);
  const [visualCard, setVisualCard] = useState<{ card: Card, playerName: string, verb?: string } | null>(null);
  // 出牌飞行（仅「完整」档）：牌从出牌者座位飞向目标座位
  const [flightFx, setFlightFx] = useState<{ card: Card, id: number, x0: number, y0: number, x1: number, y1: number } | null>(null);
  const flightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 判定演出：判定牌翻面 + 判定原因（区别于普通出牌）
  const [judgmentVisual, setJudgmentVisual] = useState<{ card: Card, playerName: string, reason: string, id: number } | null>(null);
  const judgmentTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 摸牌提示：让新摸的牌从牌堆方向飞入手牌
  const [drawPulse, setDrawPulse] = useState<{ count: number, id: number } | null>(null);
  const drawPulseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 技能发动横幅（全屏金色大字，短暂展示）
  const [skillBanner, setSkillBanner] = useState<{ hero: string, skill: string, id: string } | null>(null);
  const skillBannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 技能发动时对应武将头像高亮
  const [skillGlowId, setSkillGlowId] = useState<number | null>(null);
  const skillGlowTimerRef = useRef<NodeJS.Timeout | null>(null);
  // AI 思考中：头像暖光呼吸，避免 AI 秒出牌
  const [aiThinkingId, setAiThinkingId] = useState<number | null>(null);
  // 回合过场：上一位回合结束 → 轮到下一位（换手节奏）
  const [turnPass, setTurnPass] = useState<{ from: string, to: string, id: number } | null>(null);

  // 弃牌堆查看器
  const [showDiscardViewer, setShowDiscardViewer] = useState<boolean>(false);

  // Audio：静音与动效开关都持久化，刷新后保持一致
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try { return localStorage.getItem('sgs-muted') === '1'; } catch { return false; }
  });
  const isMutedRef = useRef<boolean>(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try { return localStorage.getItem('sgs-motion') !== '0'; } catch { return true; }
  });
  const toggleMotion = () => {
    const next = !motionOn;
    setMotionOn(next);
    try { localStorage.setItem('sgs-motion', next ? '1' : '0'); } catch { /* ignore */ }
  };
  // 特效强度：默认「纯净」；经典档等同于全无装饰
  const [fxLevel, setFxLevel] = useState<FxLevel>(() => {
    try {
      const v = localStorage.getItem('sgs-fx');
      return v === 'classic' || v === 'pure' || v === 'subtle' || v === 'full' ? v : 'pure';
    } catch { return 'pure'; }
  });
  const cycleFx = () => {
    const i = FX_ORDER.indexOf(fxLevel);
    const next = FX_ORDER[(i + 1) % FX_ORDER.length];
    setFxLevel(next);
    try { localStorage.setItem('sgs-fx', next); } catch { /* ignore */ }
  };
  // 各效果按档位放开（纯净 = 翻牌 + 濒死；克制 + 技能特写；完整再加出牌飞行与扫光/粒子）
  const fxJudge = fxLevel !== 'classic';
  const fxDying = fxLevel !== 'classic';
  const fxSkill = fxLevel === 'subtle' || fxLevel === 'full';
  const fxFly = fxLevel === 'full';
  const fxFlourish = fxLevel === 'full';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmModeRef = useRef<'start' | 'battle' | 'climax'>('start');
  const audioReadyRef = useRef<boolean>(false);
  // 保存最新的players状态，避免闭包问题
  const playersRef = useRef<Player[]>([]);
  // 回合状态机去重：同一「回合+阶段」只推进一次，避免 isProcessing 抖动导致 AI 重复行动
  const turnStepRef = useRef<string>('');
  // 并发结算保护：同一「回合+阶段」同时只允许一条 runTurn 链。
  // 之前 isAiTakeover 切换会让主循环以新 key 再起一条链，两条 cpuAI 并发收尾时后写的那条
  // 会把阶段从「结束阶段」写回「弃牌阶段」，而弃牌阶段已被去重跳过 → 对局永久停摆。
  const activeStepRef = useRef<{ turn: number; phase: GamePhase; token: number } | null>(null);
  const stageTokenRef = useRef<number>(0);
  // 异步链闭包里的 phase/turnIndex 可能滞后，兜底推进时取实时值
  const phaseLiveRef = useRef<GamePhase>(phase);
  const turnLiveRef = useRef<number>(turnIndex);
  // 推进心跳：addLog / 阶段开始时刷新，供卡死看门狗判断
  const progressAtRef = useRef<number>(Date.now());
  const stallKeyRef = useRef<string>('');
  const stallCountRef = useRef<number>(0);
  // AI 回合节奏：1 倍速下额外放慢，2/3 倍速保持原速
  const aiTurnActiveRef = useRef<boolean>(false);
  // 铁索连环当前传导波次已结算的角色 id（见 takeDamage 注释）
  const chainWaveRef = useRef<Set<number> | null>(null);

  // --- Helpers ---
  // delay 受全局速度倍率控制：2x/3x 下 AI 结算节奏等比加快
  const delay = useCallback((ms: number) => new Promise<void>(resolve => setTimeout(
    resolve,
    (ms / speedRef.current) * (aiTurnActiveRef.current && speedRef.current === 1 ? 1.45 : 1),
  )), []);

  // AI 思考停顿：头像暖光呼吸 + 随机逗留后再生效，避免 AI 瞬发决策
  const aiThink = useCallback(async (playerId: number, ms?: number) => {
    setAiThinkingId(playerId);
    await delay(ms ?? 300 + Math.random() * 500);
    setAiThinkingId(null);
  }, [delay]);

  // 优化：限制日志数量，避免内存泄漏和性能问题
  const logsRef = useRef<LogEntry[]>([]);
  useEffect(() => { logsRef.current = logs; }, [logs]);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
    progressAtRef.current = Date.now();
    // 日志属非紧急 UI：标记为 transition，AI 连续出牌刷日志时不再阻塞卡牌/动画的高优先级渲染
    React.startTransition(() => {
      setLogs(prev => {
        const newLog = { id: Date.now().toString() + Math.random(), text, type };
        // 只保留最近 100 条日志
        const newLogs = [...prev, newLog];
        if (newLogs.length > 100) {
          return newLogs.slice(-100);
        }
        return newLogs;
      });
    });
  }, []);

  // 音效：优先播放角色/卡牌台词，缺失时回退到本地合成音效
  const playSound = (key: string, gender: 'male' | 'female' = 'male') => {
    if (isMutedRef.current) return;
    if (hasCardVoice(key) && playCardVoice(key, gender)) return;
    const kind = SFX_FOR_NAME[key];
    if (kind) playSfx(kind);
  };

  // --- 分段背景音乐：首页 / 对局 / 决战 ---
  // 关键点：只保留一个 audio 元素；切曲时旧曲「淡出 → 断开 src」以中止下载，
  // 静音时完全不创建音频，避免为听不到的声音白下 1~2MB
  const releaseAudio = (el: HTMLAudioElement | null) => {
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load(); // 中止剩余下载，释放网络与解码资源
    } catch { /* ignore */ }
  };

  const playBgm = useCallback((mode: 'start' | 'battle' | 'climax') => {
    if (isMutedRef.current) return;
    if (bgmModeRef.current === mode && audioRef.current) return;
    bgmModeRef.current = mode;
    const prev = audioRef.current;
    const next = new Audio();
    next.preload = 'metadata'; // 先只取头部，播放时按需缓冲
    next.src = BGM_TRACKS[mode];
    next.loop = true;
    next.volume = 0;
    next.play().catch(() => { /* 等待用户交互 */ });
    // 首次交互后淡入，避免音乐「啪」地一下切入
    let fv = 0;
    const fadeIn = setInterval(() => {
      fv += 0.025;
      if (fv >= 0.3) {
        next.volume = 0.3;
        clearInterval(fadeIn);
      } else {
        next.volume = fv;
      }
    }, 90);
    audioRef.current = next;
    if (prev) {
      let v = prev.volume;
      const timer = setInterval(() => {
        v -= 0.05;
        if (v <= 0) {
          clearInterval(timer);
          releaseAudio(prev);
        } else {
          prev.volume = v;
        }
      }, 60);
    }
  }, []);

  // 首次用户交互：解锁自动播放策略、淡入当前 BGM，并为所有按钮补一层轻点击音
  useEffect(() => {
    const onFirst = (e: Event) => {
      if (!audioReadyRef.current) {
        audioReadyRef.current = true;
        playBgm(bgmModeRef.current);
      }
      const el = e.target as HTMLElement | null;
      if (el && el.closest('button, [role="button"]') && !isMutedRef.current) playSfx('button');
    };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener('pointerdown', onFirst, opts);
    window.addEventListener('keydown', onFirst, opts);
    return () => {
      window.removeEventListener('pointerdown', onFirst, opts);
      window.removeEventListener('keydown', onFirst, opts);
    };
  }, [playBgm]);

  // 从ref中获取最新的玩家信息
  const getPlayer = (id: number) => playersRef.current.find(p => p.id === id);

  // ── 通用「技能选择」弹窗 ──
  // 人类角色触发时弹窗可选；AI 角色 / 托管状态直接返回 null，调用方走原有自动最优路径。
  const SKILL_CHOICE_SECONDS = 30;
  const [skillChoice, setSkillChoice] = useState<SkillChoiceRequest | null>(null);
  const [skillChoiceSel, setSkillChoiceSel] = useState<string[]>([]);
  const [skillChoiceLeft, setSkillChoiceLeft] = useState<number | null>(null);
  const skillChoiceResolver = useRef<((r: SkillChoiceResult) => void) | null>(null);
  const isAiTakeoverRef = useRef<boolean>(false);
  useEffect(() => { isAiTakeoverRef.current = isAiTakeover; }, [isAiTakeover]);

  const resolveSkillChoice = useCallback((r: SkillChoiceResult) => {
    const resolve = skillChoiceResolver.current;
    skillChoiceResolver.current = null;
    setSkillChoice(null);
    setSkillChoiceSel([]);
    setSkillChoiceLeft(null);
    resolve?.(r);
  }, []);

  const requestSkillChoice = useCallback((req: SkillChoiceRequest, allowPrompt = true): Promise<SkillChoiceResult | null> => {
    if (!allowPrompt || isAiTakeoverRef.current) return Promise.resolve(null);
    return new Promise<SkillChoiceResult>(resolve => {
      skillChoiceResolver.current = resolve;
      setSkillChoiceSel([]);
      setSkillChoiceLeft(SKILL_CHOICE_SECONDS);
      setSkillChoice(req);
    });
  }, []);

  // 读秒与超时兜底：30 秒无操作即按 AI 最优继续，并写战报
  useEffect(() => {
    if (!skillChoice) return;
    const tick = window.setInterval(() => setSkillChoiceLeft(v => (v === null ? null : Math.max(0, v - 1))), 1000);
    const timeout = window.setTimeout(() => {
      addLog(`【${skillChoice.skill}】${skillChoice.owner} 未在 ${SKILL_CHOICE_SECONDS} 秒内选择，自动按 AI 最优继续`, 'warning');
      resolveSkillChoice({ kind: 'timeout' });
    }, SKILL_CHOICE_SECONDS * 1000);
    return () => { window.clearInterval(tick); window.clearTimeout(timeout); };
  }, [skillChoice, resolveSkillChoice, addLog]);

  useEffect(() => {
    if (!skillChoice) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') resolveSkillChoice({ kind: 'cancel' }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skillChoice, resolveSkillChoice]);

  const toggleSkillChoiceItem = (key: string, single: boolean) => {
    setSkillChoiceSel(prev => {
      if (single) return prev.includes(key) ? [] : [key];
      if (prev.includes(key)) return prev.filter(x => x !== key);
      const max = skillChoice?.max ?? 99;
      return prev.length >= max ? [...prev.slice(1), key] : [...prev, key];
    });
  };

  const skillChoiceValid = (() => {
    const min = skillChoice?.min ?? 1;
    const max = skillChoice?.max ?? 99;
    return skillChoiceSel.length >= min && skillChoiceSel.length <= max;
  })();

  const submitSkillChoice = () => {
    if (!skillChoice || !skillChoiceValid) return;
    if (skillChoice.mode === 'card') resolveSkillChoice({ kind: 'card', ids: skillChoiceSel });
    else if (skillChoice.mode === 'multi') resolveSkillChoice({ kind: 'multi', ids: skillChoiceSel });
    else if (skillChoice.mode === 'target') resolveSkillChoice({ kind: 'target', ids: skillChoiceSel.map(Number) });
  };

  // 诸葛果「羽化」：非基本牌不计入手牌上限；董白「黠慧」：黑色牌不计入手牌上限
  // 手牌上限/弃牌数的规则计算统一在 src/game/rules.ts，这里只保留 DEV 探针上报
  const excessCards = (p: Player) => {
    const nb = countExemptHandCards(p);
    if (nb > 0 && DEV_BUILD) {
      const w = window as unknown as { __r4yuhua?: Record<string, unknown> };
      w.__r4yuhua = { ...(w.__r4yuhua || {}), hero: p.hero.name, hand: p.hand.length, hp: p.hp, nonBasic: nb, sample: p.hand.map(c => c.type) };
    }
    return computeDiscardExcess(p);
  };
  // 供 mutateHand 的延时回调使用，避免在 drawCards 声明前引用它
  const drawCardsRef = useRef<((playerId: number, count: number) => Card[]) | null>(null);

  // 以最新 state 为准的手牌修改器，避免闭包旧 hand 导致的“卡牌复活”bug
  const mutateHand = useCallback((id: number, fn: (hand: Card[]) => Card[]) => {
    setPlayers(prev => {
      const target = prev.find(p => p.id === id);
      const rawHand = target ? fn(target.hand) : [];
      // 防御性去重：同一张牌（同 id）不应在一手牌里出现两次，否则会重复渲染/重复出牌
      const seen = new Set<string>();
      const nextHand = rawHand.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));
      const lostLast = !!target && target.hero.name === '陆逊' && !target.isDead
        && target.hand.length > 0 && nextHand.length === 0;
      const updated = prev.map(p => p.id === id ? { ...p, hand: nextHand } : p);
      playersRef.current = updated;
      // 陆逊「连营」：失去最后一张手牌时补一张
      if (lostLast) {
        setTimeout(() => {
          const live = playersRef.current.find(p => p.id === id);
          if (!live || live.isDead || live.hand.length > 0) return;
          addLog(`${live.hero.name} 发动「连营」，摸一张牌`, 'skill');
          showSkillBanner(live.hero.name, '连营');
          drawCardsRef.current?.(id, 1);
        }, 0);
      }
      return updated;
    });
  }, []);

  const updatePlayer = (id: number, updates: Partial<Player>) => {
    // 董白「黠慧」：体力值减少后，解除对获得的黑色牌的使用/打出/弃置限制
    if (updates.hp != null) {
      const before = playersRef.current.find(p => p.id === id);
      // 袁姬「节行」：体力值变化后摸一张（此牌不计入本回合手牌上限）
      if (before && jiexingTriggers(before, before.hp, updates.hp)) {
        addLog(`【节行】袁姬体力值变化，摸一张牌`, 'skill');
        showSkillBanner('袁姬', '节行');
        updatePlayerWith(id, p => ({ hand: [...p.hand, ...drawCardsRef.current!(id, 1)] }));
      }
      if (before && updates.hp < before.hp && xiaohuiLockRef.current[id]?.length) {
        delete xiaohuiLockRef.current[id];
        addLog(`【黠慧】${before.hero.name} 体力值减少，被禁用的黑色牌恢复使用`, 'info');
      }
    }
    setPlayers(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      // 更新ref中的最新状态
      playersRef.current = updated;
      return updated;
    });
  };

  // 函数式更新：修改依赖当前字段的内容（如装备区增删）时，直接在 prev 上算，避免读旧快照写回覆盖并发改动
  const updatePlayerWith = (id: number, fn: (p: Player) => Partial<Player>) => {
    setPlayers(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...fn(p) } : p);
      playersRef.current = updated;
      return updated;
    });
  };

  // 延时锦囊进入判定区：按进入先后顺序追加，并同步旧的状态布尔（座位徽标与既有技能仍读这些布尔）
  // 必须基于 setPlayers 的 prev 计算：判定阶段同帧内可能连续挂/判多张，读 playersRef 快照再整体写回会互相覆盖
  const addDelayedTrick = (playerId: number, card: Card) => {
    setPlayers(prev => {
      const target = prev.find(x => x.id === playerId);
      if (!target) return prev;
      const zone = [...(target.judgeZone ?? []).filter(c => c.id !== card.id), card];
      const updated = prev.map(x => x.id === playerId ? {
        ...x,
        judgeZone: zone,
        isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
        isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
        isShandian: zone.some(c => c.name === CardName.SHANDIAN),
      } : x);
      playersRef.current = updated;
      return updated;
    });
    // 延时锦囊实际停留在判定区：从弃牌堆移出，避免同一张牌同时存在于两处
    if (discardPileRef.current.some(c => c.id === card.id)) {
      const newDiscard = discardPileRef.current.filter(c => c.id !== card.id);
      discardPileRef.current = newDiscard;
      setDiscardPile(newDiscard);
    }
  };

  // 判定完成：从判定区移除该牌并置入弃牌堆，同步旧布尔
  const removeDelayedTrick = (playerId: number, card: Card) => {
    setPlayers(prev => {
      const target = prev.find(x => x.id === playerId);
      if (!target) return prev;
      const zone = (target.judgeZone ?? []).filter(c => c.id !== card.id);
      const updated = prev.map(x => x.id === playerId ? {
        ...x,
        judgeZone: zone,
        isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
        isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
        isShandian: zone.some(c => c.name === CardName.SHANDIAN),
      } : x);
      playersRef.current = updated;
      return updated;
    });
    const newDiscard = [...discardPileRef.current.filter(c => c.id !== card.id), card];
    discardPileRef.current = newDiscard;
    setDiscardPile(newDiscard);
  };

  // 阵营关系判定见 src/game/ai/relations.ts（纯函数，已单测覆盖）
  const isAlly = (a: Player, b: Player) => isAllyImpl(a, b);
  const isEnemy = (a: Player, b: Player) => isEnemyImpl(a, b);

  // 邹氏「倾城」：被暗置的角色在解封回合前，其技能不发动（主动技入口与事件触发技均需门控）
  // 判定逻辑见 src/game/ai/skillGate.ts；这里只把三个 ref 的读取动作传下去
  const isSkillSealed = (id: number) => isSkillSealedImpl(skillSealRef.current[id], turnCountRef.current);
  const skillsOn = (id: number) => skillsOnImpl(id, {
    sealUntil: (pid) => skillSealRef.current[pid],
    turnCount: () => turnCountRef.current,
    generalRemoved: (pid) => playersRef.current.find(p => p.id === pid)?.generalRemoved,
  });

  // 董白「黠慧」：其他角色获得董白的黑色牌后，在其体力值减少前不能使用、打出、弃置这些牌
  const xiaohuiLockRef = useRef<Record<number, string[]>>({}); // 角色 id → 被锁定的牌 id
  const xiaohuiLocked = (playerId: number, cardId: string) => (xiaohuiLockRef.current[playerId] ?? []).includes(cardId);
  const lockXiaohuiCards = (ownerId: number, receiverId: number, cards: Card[]) => {
    const owner = playersRef.current.find(p => p.id === ownerId);
    if (!owner || owner.isDead || owner.hero.name !== '董白' || !skillsOn(ownerId)) return;
    const black = cards.filter(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
    if (!black.length) return;
    xiaohuiLockRef.current[receiverId] = [...(xiaohuiLockRef.current[receiverId] ?? []), ...black.map(c => c.id)];
    const who = playersRef.current.find(p => p.id === receiverId)?.hero.name ?? '';
    addLog(`【黠慧】${who} 获得的黑色牌【${black.map(c => c.name).join('、')}】在其体力减少前不能使用、打出、弃置`, 'skill');
    showSkillBanner('董白', '黠慧');
  };

  // ══ 通用机制：武将牌明置 / 暗置 / 移除，以及临时技能授予 ══
  // 供「闺秀 / 存嗣」等技能复用：状态可查询、事件进战报、技能授予可到期回归
  // 明置 / 移除后的武将技响应分发点（后续同类技能在此追加分支）
  const onGeneralCardRevealed = (id: number) => {
    const p = getPlayer(id);
    if (!p || p.isDead) return;
    // 糜夫人「闺秀」：明置此武将牌时，摸两张牌
    if (p.hero.name === '糜夫人' && skillsOn(id)) {
      drawCards(id, 2);
      addLog(`【闺秀】${p.hero.name} 明置武将牌，摸两张牌`, 'skill');
      showSkillBanner('糜夫人', '闺秀');
    }
  };

  const onGeneralCardRemoved = (id: number) => {
    const p = getPlayer(id);
    if (!p || p.isDead) return;
    // 糜夫人「闺秀」：移除此武将牌时，回复1点体力
    if (p.hero.name === '糜夫人' && recoverHp(id, 1) > 0) {
      addLog(`【闺秀】${p.hero.name} 移除武将牌，回复1点体力`, 'skill');
      showSkillBanner('糜夫人', '闺秀');
    }
  };

  const setGeneralRevealed = (id: number, revealed: boolean, reason: string, silent = false) => {
    const p = getPlayer(id);
    if (!p || p.isDead || p.generalRemoved) return false;
    if (revealed) {
      if (p.generalRevealed) return false;
      // 邹氏「祸水」：其回合内其他角色不能明置武将牌
      const zoushi = playersRef.current.find(x => !x.isDead && x.hero.name === '邹氏' && zoushiRevealedRef.current.has(x.id));
      if (zoushi && zoushi.id !== id && turnOwnerIdRef.current === zoushi.id) {
        if (!silent) addLog(`【明置】${p.hero.name} 受邹氏「祸水」影响，本回合不能明置武将牌`, 'info');
        return false;
      }
    }
    updatePlayer(id, { generalRevealed: revealed });
    if (!silent) addLog(`【${revealed ? '明置' : '暗置'}】${p.hero.name} 的武将牌已${revealed ? '明置' : '暗置'}（${reason}）`, 'info');
    if (revealed) onGeneralCardRevealed(id);
    return true;
  };

  const removeGeneralCard = (id: number, reason: string) => {
    const p = getPlayer(id);
    if (!p || p.isDead || p.generalRemoved) return false;
    updatePlayer(id, { generalRemoved: true, generalRevealed: false });
    addLog(`【移除武将牌】${p.hero.name} 将武将牌移出游戏（${reason}）`, 'info');
    onGeneralCardRemoved(id);
    return true;
  };

  const hasGrantedSkill = (p: Player, skillName: string) =>
    !p.isDead && (p.grantedSkills ?? []).includes(skillName) && skillsOn(p.id);

  // 关羽「武圣」/ 许身授予的「武圣」：红色牌可当【杀】
  const canUseWusheng = (p: Player) => p.hero.name === '关羽' || hasGrantedSkill(p, '武圣');

  const grantSkill = (id: number, skillName: string, sourceSkill: string, durationTurns?: number) => {
    const p = getPlayer(id);
    if (!p || p.isDead) return false;
    if ((p.grantedSkills ?? []).includes(skillName)) return false;
    const until = durationTurns ? { ...(p.grantedSkillUntil ?? {}), [skillName]: turnCountRef.current + durationTurns } : (p.grantedSkillUntil ?? {});
    // 按玩家自身旧值追加，并同步写回 playersRef：
    // 连续两次授予（如许身同批授予「武圣」「当先」）时，第二次必须能看到第一次的结果，
    // 否则第二次会用陈旧快照覆盖第一次，导致先授予的技能丢失。
    const applyGrant = (x: Player): Player => x.id === id
      ? { ...x, grantedSkills: [...(x.grantedSkills ?? []), skillName], grantedSkillUntil: until }
      : x;
    playersRef.current = playersRef.current.map(applyGrant);
    setPlayers(prev => {
      const updated = prev.map(applyGrant);
      playersRef.current = updated;
      return updated;
    });
    addLog(`【${sourceSkill}】${p.hero.name} 获得技能「${skillName}」${durationTurns ? `（持续 ${durationTurns} 回合）` : ''}`, 'skill');
    return true;
  };

  const revokeSkill = (id: number, skillName: string, reason: string) => {
    const p = getPlayer(id);
    if (!p || !(p.grantedSkills ?? []).includes(skillName)) return false;
    // 同 grantSkill：按 prev 逐个剔除并同步写回 playersRef，
    // 避免同一批连续撤销（如许身到期同时撤「武圣」「当先」）互相覆盖。
    const applyRevoke = (x: Player): Player => {
      if (x.id !== id) return x;
      const until = { ...(x.grantedSkillUntil ?? {}) };
      delete until[skillName];
      return { ...x, grantedSkills: (x.grantedSkills ?? []).filter(s => s !== skillName), grantedSkillUntil: until };
    };
    playersRef.current = playersRef.current.map(applyRevoke);
    setPlayers(prev => {
      const updated = prev.map(applyRevoke);
      playersRef.current = updated;
      return updated;
    });
    addLog(`【技能回归】${p.hero.name} 失去技能「${skillName}」（${reason}）`, 'info');
    return true;
  };

  const expireGrantedSkills = () => {
    for (const p of playersRef.current) {
      const until = p.grantedSkillUntil;
      if (!until) continue;
      const expired = Object.keys(until).filter(k => turnCountRef.current >= until[k]);
      expired.forEach(k => revokeSkill(p.id, k, '持续时间结束'));
    }
  };

  // ══ 通用机制：目标合法性双向钩子 ══
  // 技能可注册规则，对「己方使用伤害牌」与「对方伤害牌指向己方」两个方向同时过滤；
  // 人类点击校验、AI 选目标、结算入口三处共用同一判定
  type TargetLegalityRule = (source: Player, target: Player, card: Card) => string | null;
  const targetLegalityRulesRef = useRef<TargetLegalityRule[]>([]);
  const getTargetLegalityVeto = (source: Player, target: Player, card: Card): string | null => {
    for (const rule of targetLegalityRulesRef.current) {
      const reason = rule(source, target, card);
      if (reason) return reason;
    }
    return null;
  };

  // ══ 通用机制：他人回合开始时的虚拟牌入口 ══
  // 技能可注册钩子，在指定角色回合开始时插入一张虚拟牌并按正常时序结算
  type TurnStartHook = (owner: Player) => Promise<void>;
  const turnStartHookRef = useRef<TurnStartHook | null>(null);
  const runTurnStartHooks = async (owner: Player) => {
    if (turnStartHookRef.current) await turnStartHookRef.current(owner);
  };
  const castVirtualCard = async (
    actorId: number, cardName: CardName, targetIds: number[],
    opts: { attribute?: 'fire' | 'thunder'; ignoreDistance?: boolean; reason?: string } = {},
  ) => {
    const actor = getPlayer(actorId);
    if (!actor || actor.isDead) return false;
    const targets = targetIds.map(id => getPlayer(id)).filter((x): x is Player => !!x && !x.isDead);
    const card: Card = {
      id: `virtual-${cardName}-${actorId}-${Date.now()}`,
      name: cardName,
      type: cardName === CardName.SHA || cardName === CardName.JIU ? CardType.BASIC : CardType.SCROLL,
      suit: Suit.SPADE,
      rank: 'K',
      value: 13,
      attribute: opts.attribute,
      description: opts.reason || `视为使用【${cardName}】`,
      imageColor: 'from-slate-700 to-slate-900',
    };
    addLog(`【虚拟牌】${actor.hero.name} 视为使用${opts.ignoreDistance ? '无距离限制的' : ''}【${cardName}】${targets.length ? ` → ${targets.map(t => t.hero.name).join('、')}` : ''}`, 'info');
    await combat.resolveCardEffect(actor, targets.length ? targets : [actor], card);
    return true;
  };

  // ── 花鬘「象阵 / 芳踪 / 嬉战」──
  // 「芳踪」双向目标限制：每帧刷新规则闭包，确保读到最新状态
  targetLegalityRulesRef.current = [(src, tgt, card) => {
    if (src.id === tgt.id) return null;
    const isDamage = card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG
      || card.name === CardName.NANMAN || card.name === CardName.WANJIAN;
    if (!isDamage) return null;
    const active = (p: Player) => p.hero.name === '花鬘' && !p.isDead && skillsOn(p.id)
      && fangzongDisabledTurnRef.current !== turnCountRef.current;
    if (active(src) && canReach(src, tgt)) return '芳踪';
    const hm = playersRef.current.find(p => p.id === tgt.id);
    if (hm && active(hm) && src.id !== hm.id && canReach(src, hm)) return '芳踪';
    return null;
  }, (src, tgt) => {
    // 伏皇后「惴恐」获胜：该角色本回合使用牌不能选择除自己以外的角色为目标
    if (src.id === tgt.id) return null;
    if (doutuSelfOnlyRef.current === src.id) return '惴恐';
    return null;
  }];
  // 「嬉战」：其他角色回合开始时，弃一张牌令本回合「芳踪」失效，按花色结算；无牌则流失1点体力
  turnStartHookRef.current = async (owner: Player) => {
    const hm = playersRef.current.find(p => !p.isDead && p.hero.name === '花鬘' && skillsOn(p.id));
    if (!hm || hm.id === owner.id) return;
    const hmNow = getPlayer(hm.id);
    const ownerNow = getPlayer(owner.id);
    if (!hmNow || !ownerNow) return;
    if (hmNow.hand.length > 0) {
      const aiLow = [...hmNow.hand].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
      // 人类玩家：自选弃哪张牌（花色决定效果）；AI / 托管：仍弃点数最小者
      const pick = await requestSkillChoice({
        skill: '嬉战',
        owner: '花鬘',
        title: `${ownerNow.hero.name} 的回合开始，是否弃一张牌令本回合「芳踪」失效？`,
        hint: '花色决定效果：♠ 令其视为使用【酒】 / ♥ 视为【无中生有】 / ♣ 视为【铁索连环】 / ♦ 视为火【杀】',
        mode: 'card',
        cards: hmNow.hand,
        min: 1,
        max: 1,
        cancelLabel: '交给系统自动弃牌',
      }, hmNow.isHuman);
      const low = (!pick || pick.kind === 'timeout' || pick.kind === 'cancel')
        ? aiLow
        : ((pick.kind === 'card' ? hmNow.hand.find(c => c.id === pick.ids[0]) : null) ?? aiLow);
      discardCards(hmNow.id, [low]);
      fangzongDisabledTurnRef.current = turnCountRef.current;
      addLog(`【嬉战】花鬘 弃置【${low.name}】（${low.suit}），本回合「芳踪」失效${pick && pick.kind === 'card' ? '（玩家选择）' : '（自动）'}`, 'skill');
      showSkillBanner('花鬘', '嬉战');
      await delay(250);
      if (low.suit === Suit.SPADE) {
        if (!window.jiuBoost) window.jiuBoost = {};
        window.jiuBoost[ownerNow.id] = true;
        addLog(`【嬉战】黑桃：${ownerNow.hero.name} 视为使用【酒】`, 'skill');
      } else if (low.suit === Suit.HEART) {
        drawCards(hmNow.id, 2);
        addLog('【嬉战】红桃：花鬘 视为使用【无中生有】，摸两张牌', 'skill');
      } else if (low.suit === Suit.CLUB) {
        updatePlayer(hmNow.id, { isChained: true });
        updatePlayer(ownerNow.id, { isChained: true });
        addLog(`【嬉战】梅花：花鬘 视为对 ${ownerNow.hero.name} 使用【铁索连环】，两人横置`, 'skill');
      } else {
        await castVirtualCard(hmNow.id, CardName.SHA, [ownerNow.id], { attribute: 'fire', ignoreDistance: true, reason: '嬉战·方块' });
      }
    } else {
      addLog('【嬉战】花鬘 没有牌可弃，流失1点体力', 'skill');
      await combat.takeDamage(hmNow.id, hmNow.id, 1);
    }
  };

  // ── 王元姬「谦冲 / 帷幕 / 明哲」──
  // 装备区牌列表；「谦冲」按全黑/全红派生“帷幕 / 明哲”
  // equipList / allEquipBlack / allEquipRed 见 src/game/policies/equipment.ts
  // 「帷幕」：王元姬且技能生效且装备区全黑
  const hasWeimu = (p: Player) => hasWeimuImpl(p, skillsOn(p.id));

  // 相邻存活角色见 src/game/policies/targets.ts
  const nearestOtherPlayer = (id: number) => nearestOtherPlayerImpl(playersRef.current, id);

  // --- 身份推理 ---
  // AI 依据公开信息（阵亡亮明、攻击主公、救援主公）推测他人身份
  const identityGuessRef = useRef<Record<number, Identity>>({});
  const guessIdentity = (p: Player): Identity | undefined => (p.isRevealed ? p.identity : identityGuessRef.current[p.id]);
  const pickWeakest = (pool: Player[]) => pickWeakestImpl(pool);

  // 按自身阵营选择最有价值的目标：反贼集火主公，忠臣/主公先打反贼，内奸先清反贼并留主公
  // 决策树见 src/game/ai/targeting.ts（纯函数，已单测覆盖）
  const pickAITarget = (ai: Player): Player | null => pickAITargetImpl(ai, {
    players: playersRef.current,
    difficulty: aiDifficultyRef.current,
    guessIdentity,
  });

  // ── 张琪瑛「法箓 / 真仪 / 点化」──
  // 判定见 src/game/policies/zhang.ts；执行（setState/日志/技能条）仍在本组件
  const hasZhangMark = (p: Player, mark: string) => hasZhangMarkImpl(p, mark);

  // 「法箓」：牌因弃置进入弃牌堆后，按花色获得标记
  const grantZhangMarks = (owner: Player, cards: Card[]) => {
    if (!canGrantZhangMarks(owner, skillsOn(owner.id))) return;
    const { marks, gained } = zhangMarksFromCards(owner.zhangMarks ?? [], cards);
    if (!gained.length) return;
    updatePlayer(owner.id, { zhangMarks: marks });
    addLog(`【法箓】张琪瑛因弃牌获得标记：${gained.join('、')}（当前 ${marks.length} 枚）`, 'skill');
    showSkillBanner('张琪瑛', '法箓');
  };

  // 「点化」：观看牌堆顶 X 张（X=标记数），按最优顺序放回
  const doDianhua = (owner: Player) => {
    if (!owner || owner.isDead || owner.hero.name !== '张琪瑛' || !skillsOn(owner.id)) return;
    const x = Math.min((owner.zhangMarks ?? []).length, 5);
    if (x <= 0) return;
    const top = deckRef.current.slice(-x).reverse();
    if (!top.length) return;
    const score = (c: Card) => {
      switch (c.name) {
        case CardName.TAO: return 10;
        case CardName.WUZHONG: return 9;
        case CardName.SHAN: return 8;
        case CardName.SHA: return 7;
        case CardName.WUXIE: return 6;
        case CardName.JIU: return 5;
        default: return c.type === CardType.EQUIPMENT ? 4 : 3;
      }
    };
    const rest = deckRef.current.slice(0, -x);
    // 牌堆从尾部摸牌：分数高的放末尾，先摸到
    const next = [...rest, ...[...top].sort((a, b) => score(a) - score(b))];
    deckRef.current = next;
    setDeck(next);
    addLog(`【点化】张琪瑛观看牌堆顶 ${x} 张：${top.map(c => `${c.name}${c.rank}`).join('、')}，并按最优顺序放回`, 'skill');
    showSkillBanner('张琪瑛', '点化');
  };

  // 「真仪·勾陈」：受到属性伤害后，从牌堆/弃牌堆获得三种类型牌各一张
  const gainThreeTypes = (ownerId: number) => {
    const owner = getPlayer(ownerId);
    if (!owner || owner.isDead) return;
    const picked: Card[] = [];
    for (const type of [CardType.BASIC, CardType.SCROLL, CardType.EQUIPMENT]) {
      const d = [...deckRef.current];
      let idx = -1;
      for (let i = d.length - 1; i >= 0; i--) { if (d[i].type === type) { idx = i; break; } }
      if (idx >= 0) {
        const [card] = d.splice(idx, 1);
        deckRef.current = d;
        picked.push(card);
      } else {
        const dsp = [...discardPileRef.current];
        let di = -1;
        for (let i = dsp.length - 1; i >= 0; i--) { if (dsp[i].type === type) { di = i; break; } }
        if (di >= 0) {
          const [card] = dsp.splice(di, 1);
          discardPileRef.current = dsp;
          picked.push(card);
        }
      }
    }
    if (!picked.length) return;
    setDeck([...deckRef.current]);
    setDiscardPile([...discardPileRef.current]);
    mutateHand(ownerId, h => [...h, ...picked]);
    addLog(`【真仪·勾陈】张琪瑛获得 ${picked.map(c => `【${c.name}】`).join('')}`, 'skill');
    showSkillBanner('张琪瑛', '真仪');
  };

  // --- 摸牌 ---
  const drawCards = useCallback((playerId: number, count: number) => {
    // 使用 ref 获取最新的 deck 和 discardPile 状态
    let currentDeck = [...deckRef.current];
    let currentDiscard = [...discardPileRef.current];
    const drawn: Card[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDeck.length === 0) {
        if (currentDiscard.length === 0) break;
        currentDeck = shuffle(currentDiscard);
        currentDiscard = [];
        addLog('牌堆已洗切', 'info');
      }
      drawn.push(currentDeck.pop()!);
    }

    setDeck(currentDeck);
    setDiscardPile(currentDiscard);

    setPlayers(prev => {
      const updated = prev.map(p => {
        if (p.id === playerId) {
          // 防御性去重：牌堆若因历史存档/异常路径出现同 id 卡牌，不让它进入手牌两次
          const seen = new Set(p.hand.map(c => c.id));
          const fresh = drawn.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));
          return { ...p, hand: [...p.hand, ...fresh] };
        }
        return p;
      });
      playersRef.current = updated;
      return updated;
    });

    // 董绾「生妒」：带标记的角色摸牌后，董绾摸「标记数 × 其摸牌数」张，然后移去标记
    // （董绾自己摸牌不触发；用 setTimeout 延迟，避免在 drawCards 内递归调用自身）
    if (drawn.length > 0) {
      const dw = playersRef.current.find(x => !x.isDead && x.hero.name === '董绾' && skillsOn(x.id));
      const marked = playersRef.current.find(x => x.id === playerId && (x.shengduMarks ?? 0) > 0);
      if (dw && marked && dw.id !== playerId) {
        const extra = shengduDrawCount(marked.shengduMarks ?? 0, drawn.length);
        updatePlayer(playerId, { shengduMarks: 0 });
        if (extra > 0) {
          addLog(`【生妒】${marked.hero.name} 摸 ${drawn.length} 张牌，董绾摸 ${extra} 张`, 'skill');
          showSkillBanner('董绾', '生妒');
          setTimeout(() => { drawCardsRef.current?.(dw.id, extra); }, 0);
        }
      }
    }

    // 玩家自己摸牌时，让新牌从牌堆方向飞入手牌
    if (playerId === 0 && drawn.length > 0) {
      if (drawPulseTimerRef.current) clearTimeout(drawPulseTimerRef.current);
      setDrawPulse({ count: drawn.length, id: Date.now() });
      drawPulseTimerRef.current = setTimeout(() => setDrawPulse(null), 1100);
    }

    return drawn;
  }, []);
  drawCardsRef.current = drawCards;

  // 孙尚香「枭姬」：失去装备区的牌时摸两张
  const triggerXiaoji = useCallback((playerId: number) => {
    const p = getPlayer(playerId);
    if (!p || p.isDead || p.hero.name !== '孙尚香') return;
    drawCards(playerId, 2);
    addLog(`${p.hero.name} 发动「枭姬」，失去装备后摸了两张牌`, 'skill');
  }, [drawCards]);

  // 甘夫人「淑慎」：甘夫人回复体力后，可令一名友方角色摸等量牌
  const recoverHp = (playerId: number, amount: number) => {
    const p = getPlayer(playerId);
    if (!p || p.isDead || amount <= 0) return 0;
    const gained = Math.min(p.maxHp, p.hp + amount) - p.hp;
    if (gained <= 0) return 0;
    // 按 prev 的当前体力累加回复量，而不是用读到的旧 hp 写绝对值：
    // 同一批连续回复（如濒死连吃两颗桃）时，第二次不能覆盖第一次。
    const applyHeal = (x: Player): Player => x.id === playerId && !x.isDead
      ? { ...x, hp: Math.min(x.maxHp, x.hp + gained) }
      : x;
    playersRef.current = playersRef.current.map(applyHeal);
    setPlayers(prev => {
      const updated = prev.map(applyHeal);
      playersRef.current = updated;
      return updated;
    });
    const healed = getPlayer(playerId);
    if (healed && healed.hero.name === '甘夫人' && skillsOn(healed.id)) {
      // 官方：每回复 1 点体力，可令一名「其他角色」（不限友方）摸一张牌
      const othersBase = playersRef.current.filter(a => !a.isDead && a.id !== playerId);
      if (othersBase.length > 0) {
        if (healed.isHuman && !isAiTakeover) {
          // 人类：逐点弹窗自选目标；recoverHp 为同步函数，这里异步补结算，不阻塞主流程
          void (async () => {
            for (let i = 0; i < gained; i++) {
              const cur = getPlayer(playerId);
              if (!cur || cur.isDead) return;
              const pool = playersRef.current.filter(a => !a.isDead && a.id !== playerId);
              if (!pool.length) return;
              const pick = await requestSkillChoice({
                skill: '淑慎',
                owner: '甘夫人',
                title: `「淑慎」：选择令一名其他角色摸一张牌（${i + 1}/${gained}）`,
                mode: 'choose',
                choices: pool.map(a => ({ id: String(a.id), label: a.hero.name, desc: `${a.hp}/${a.maxHp} 手牌${a.hand.length}` })),
                cancelLabel: '放弃本次',
              }, true);
              if (!pick || pick.kind !== 'choose') return;
              const tid = Number(pick.id);
              drawCards(tid, 1);
              addLog(`甘夫人发动「淑慎」，令 ${getPlayer(tid)?.hero.name ?? '角色'} 摸一张牌`, 'skill');
              showSkillBanner('甘夫人', '淑慎');
              await delay(250);
            }
          })();
        } else {
          const pick = othersBase.slice().sort((a, b) => a.hand.length - b.hand.length)[0];
          drawCards(pick.id, gained);
          addLog(`甘夫人发动「淑慎」，令 ${pick.hero.name} 摸 ${gained} 张牌`, 'skill');
          showSkillBanner('甘夫人', '淑慎');
        }
      }
    }
    return gained;
  };

  // --- 距离与攻击范围 ---
  // 座位距离：环形相邻为 1；-1 马减少自己到他人的距离，+1 马增加他人到自己的距离
  // 基础计算在 src/game/rules.ts（seatDistance），这里只叠加临时的「视为 1」效果
  const getDistance = useCallback((fromId: number, toId: number) => {
    const d = seatDistance(playersRef.current, fromId, toId);
    // 伏皇后「惴恐」没赢：该角色与她本回合的距离视为 1
    if (doutuDistanceRef.current[fromId] === toId) return 1;
    // 孙鲁育「魅步」：弃置的牌不为【杀】或黑色锦囊牌时，该角色本回合与孙鲁育的距离视为 1
    if (meibuDistanceRef.current[fromId] === toId) return 1;
    return d;
  }, []);

  // 目标保护：诸葛亮「空城」、陆逊「谦逊」
  const getTargetProtection = (target: Player, cardName: CardName): string | null =>
    targetProtection(target, cardName);

  // 攻击范围 = 1 + 武器范围
  const getAttackRange = useCallback((p: Player) => {
    const weapon = p.equipment?.weapon;
    const bonus = weapon ? (EQUIP_META[weapon.name]?.range ?? 1) : 0;
    return 1 + bonus;
  }, []);

  const canReach = useCallback((from: Player, to: Player) => getDistance(from.id, to.id) <= getAttackRange(from), [getDistance, getAttackRange]);

  // 本回合是否还能使用这张【杀】（张飞「咆哮」、诸葛连弩不限；
  // 张星彩「枪舞」：点数大于判定结果的【杀】不计入次数）
  const canPlaySlash = useCallback((p: Player, card?: Card) => {
    // 孙鲁育「穆穆」：获得防具牌后本回合不能使用【杀】
    if (mumuNoSlashRef.current === p.id) return false;
    if (p.equipment?.weapon?.name === CardName.ZHUGE) return true;
    if (p.hero.name === '张飞') return true;
    // 王元姬「谦冲」：本回合选择基本牌则【杀】无次数限制
    if (p.hero.name === '王元姬' && p.qianchongType === 'basic') return true;
    const used = slashUsageRef.current[p.id] ?? 0;
    if (used < 1) return true;
    if (card && p.hero.name === '张星彩' && qiangwuPointRef.current !== null
      && rankValue(card.rank) > qiangwuPointRef.current) return true;
    return false;
  }, []);

  // 失去装备后的结算：白银狮子离场回复 1 点体力
  const onEquipLost = useCallback((playerId: number, equipName: CardName) => {
    if (equipName !== CardName.BAIYIN) return;
    const p = getPlayer(playerId);
    if (!p || p.isDead) return;
    if (p.hp < p.maxHp) {
      recoverHp(playerId, 1);
      addLog(`【白银狮子】离场，${p.hero.name} 回复 1 点体力（${p.hp + 1}/${p.maxHp}）`, 'success');
    }
  }, [getPlayer, updatePlayer]);

  // 装备牌上装：同槽位旧装备进入弃牌堆
  // 出牌展示：卡面翻入 + 语音/音效；装备牌也复用它，避免装备时无声无动画
  const showCardVisual = (card: Card, playerName: string, duration: number = 1200, gender: 'male' | 'female' = 'male', verb: string = '打出') => {
    setVisualCard({ card, playerName, verb });
    playSound(card.name, gender);
    setTimeout(() => setVisualCard(null), duration / speedRef.current);
  };

  const equipCard = useCallback((playerId: number, card: Card) => {
    const meta = EQUIP_META[card.name];
    if (!meta) return false;
    const player = getPlayer(playerId);
    if (!player) return false;
    // 董白「黠慧」：体力未减少时，获得的黑色牌不能使用（装备牌同样受限）
    if (xiaohuiLocked(playerId, card.id)) {
      addLog(`【黠慧】${player.hero.name} 获得的黑色牌【${card.name}】在体力减少前不能使用`, 'warning');
      return false;
    }
    // 孙鲁育「魅步」止息：使用装备牌同样计入"至多使用 X 张牌"
    const zx = zhixiRef.current;
    if (zx && zx.id === playerId && zx.used >= zx.limit) {
      addLog(`【止息】${player.hero.name} 本回合至多使用 ${zx.limit} 张牌，不能使用【${card.name}】`, 'warning');
      return false;
    }
    const slot = meta.slot;
    const prev = getPlayer(playerId)?.equipment?.[slot];

    mutateHand(playerId, hand => hand.filter(c => c.id !== card.id));
    updatePlayerWith(playerId, p => ({ equipment: { ...(p.equipment ?? {}), [slot]: card } }));
    if (prev) {
      setDiscardPile(pile => {
        const next = [...pile, prev];
        discardPileRef.current = next;
        return next;
      });
      addLog(`${player.hero.name} 弃置了旧装备【${prev.name}】`, 'info');
      onEquipLost(playerId, prev.name);
      triggerXiaoji(playerId);
    }
    // 与普通出牌一致：卡面翻入动画 + 语音；没有装备台词时用统一「装备」音效兜底
    showCardVisual(card, player.hero.name, 1200, player.hero.gender, '装备');
    if (!hasCardVoice(card.name) && !isMutedRef.current) playSfx('clash');
    addLog(`${player.hero.name} 装备了【${card.name}】${meta.range ? `（攻击范围 ${meta.range}）` : ''}`, 'success');

    // 诸葛果「祈禳」（原版）：装备牌置入装备区后，从牌堆获得一张锦囊牌；没有则摸一张
    if (player.hero.name === '诸葛果') {
      const nextDeck = [...deckRef.current];
      const trickIdx = nextDeck.findIndex(c => c.type === CardType.SCROLL);
      if (trickIdx >= 0) {
        const trick = nextDeck.splice(trickIdx, 1)[0];
        setDeck(nextDeck);
        deckRef.current = nextDeck;
        mutateHand(playerId, h => [...h, trick]);
        addLog(`${player.hero.name} 发动「祈禳」，从牌堆获得锦囊牌【${trick.name}】`, 'skill');
      } else {
        addLog(`${player.hero.name} 发动「祈禳」，牌堆无锦囊牌，改为摸一张牌`, 'skill');
        drawCardsRef.current?.(playerId, 1);
      }
      showSkillBanner(player.hero.name, '祈禳');
    }
    if (zhixiRef.current?.id === playerId) zhixiRef.current.used += 1;
    return true;
  }, [getPlayer, mutateHand, updatePlayer, triggerXiaoji, onEquipLost]);

  // --- Initialization ---

  const initAudio = () => {
    // 只负责「解锁」自动播放限制；要不要加载音乐交给 playBgm（静音时不加载）
    audioReadyRef.current = true;
    playBgm(bgmModeRef.current);
  };

  // 随界面 / 存活人数切换 BGM（需在首次用户交互后才能切换，避免自动播放被拦截）
  useEffect(() => {
    if (!audioReadyRef.current) return;
    if (screen === 'start' || screen === 'select') {
      playBgm('start');
    } else if (screen === 'game') {
      const alive = players.filter(p => !p.isDead).length;
      // 首页曲原本只在首页播放；新增偏好后可带进对局（默认仍按原设计分段）
      const autoMode: 'battle' | 'climax' = alive <= 2 ? 'climax' : 'battle';
      playBgm(bgmPref === 'home' ? 'start' : bgmPref === 'battle' ? 'battle' : autoMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, players, bgmPref]);

  // 切换静音状态
  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    isMutedRef.current = newMuted; // 立即同步，playBgm 需要立刻读到
    try { localStorage.setItem('sgs-muted', newMuted ? '1' : '0'); } catch { /* ignore */ }
    if (newMuted) {
      // 静音即断开音频：不要让 BGM 在后台继续下载
      releaseAudio(audioRef.current);
      audioRef.current = null;
    } else {
      audioReadyRef.current = true;
      playBgm(bgmModeRef.current);
    }
  };

  const startGame = (hero: Hero, opts?: { playerCount?: 5 | 7; tutorial?: boolean }) => {
    // 技能实装中的武将：只开放图鉴，不进入对局
    if (hero.pending) return;
    const totalPlayers: 5 | 7 = opts?.playerCount ?? playerCount;
    initAudio();
    isGameOverRef.current = false; // 重置结束标志，支持"再来一局"
    turnStepRef.current = '';
    aiTurnActiveRef.current = false;
    chainWaveRef.current = null;
    // 开新局前结束所有挂起的旧交互，避免上一局的 Promise/弹窗残留到新局
    if (humanReactionResolver.current) {
      humanReactionResolver.current({ played: false, isWuxie: false });
      humanReactionResolver.current = null;
    }
    if (dyingResolver.current) {
      dyingResolver.current(false);
      dyingResolver.current = null;
    }
    setPendingReaction(null);
    setDyingState(null);
    setWuguSelection(null);
    setWuguSelectedCard(null);
    setSelectedCardIds([]);
    setWinnerSide(null);
    setAdvice(null);
    setSkillBanner(null);
    const shuffledDeck = [...INITIAL_DECK]; 
    
    // 根据人数分配身份
    let identities: Identity[];
    if (totalPlayers === 5) {
      // 5人局: 1主公, 1忠臣, 2反贼, 1内奸
      identities = [Identity.ZHUGONG, Identity.ZHONGCHEN, Identity.FANZEI, Identity.FANZEI, Identity.NEIJIAN];
    } else {
      // 7人局: 1主公, 2忠臣, 3反贼, 1内奸
      identities = [Identity.ZHUGONG, Identity.ZHONGCHEN, Identity.ZHONGCHEN, Identity.FANZEI, Identity.FANZEI, Identity.FANZEI, Identity.NEIJIAN];
    }
    
    // Shuffle identities
    for (let i = identities.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [identities[i], identities[j]] = [identities[j], identities[i]];
    }

    // 新手引导固定人类主公：保证开局就是「我的回合」，且文案与实际身份一致
    if (opts?.tutorial) {
      const lordIdx = identities.indexOf(Identity.ZHUGONG);
      if (lordIdx > 0) {
        [identities[0], identities[lordIdx]] = [identities[lordIdx], identities[0]];
      }
    }

    // Heroes
    const otherHeroes = HEROES.filter(h => h.id !== hero.id && !h.pending).sort(() => Math.random() - 0.5);
    // 仅本地开发：?ai=关银屏,诸葛果,... 指定 AI 武将，用于逐个验证新技能。
    // 生产构建里 import.meta.env.DEV 为 false，这段会被移除，不影响线上。
    const debugDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
    const debugNames = debugDev
      ? (new URLSearchParams(window.location.search).get('ai') || '').split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const forcedHeroes = debugNames
      .map(n => otherHeroes.find(h => h.name === n))
      .filter((h): h is Hero => !!h);
    const heroQueue = [...forcedHeroes, ...otherHeroes.filter(h => !forcedHeroes.some(f => f.id === h.id))];
    const newPlayers: Player[] = [];

    for (let i = 0; i < totalPlayers; i++) {
      const isHuman = i === 0;
      const assignedHero = isHuman ? hero : heroQueue[i - 1];
      const identity = identities[i];
      const maxHp = identity === Identity.ZHUGONG ? assignedHero.maxHp + 1 : assignedHero.maxHp;

      newPlayers.push({
        id: i,
        isHuman,
        hero: assignedHero,
        hp: maxHp,
        maxHp: maxHp,
        hand: [],
        identity,
        isDead: false,
        isRevealed: identity === Identity.ZHUGONG, // Lord revealed immediately
        isSelected: false // For target selection
      });
    }

    // Deal 4 cards
    newPlayers.forEach(p => {
      p.hand = shuffledDeck.splice(0, 4);
      // 张琪瑛「法箓」：游戏开始时获得四种标记
      if (p.hero.name === '张琪瑛') p.zhangMarks = ['紫微', '后土', '玉清', '勾陈'];
      // 卑弥呼：初始化傀/疽/觉醒状态
      if (p.hero.name === '卑弥呼') { p.hasKui = false; p.juMarks = 0; p.baiJiaAwakened = false; }
      // 孙寒华：妙剑/莲华初始 1 级
      if (p.hero.name === '孙寒华') { p.miaoJianLevel = 1; p.lianHuaLevel = 1; }
      // 鲍三娘：许身限定技状态
      if (p.hero.name === '鲍三娘') { p.xushenUsed = false; }
    });

    setDeck(shuffledDeck);
    // 重置牌堆动画基线，避免开局满堆被当成「洗切」
    prevDeckLenRef.current = shuffledDeck.length;
    deckFxInitRef.current = true;
    setDeckFx(null);
    setPlayers(newPlayers);
    playersRef.current = newPlayers;
    setDiscardPile([]);
    setIsAiTakeover(false);
    // 清空跨局技能状态（否则第二局起守玺等「每种牌名限一次」会被旧局记录吞掉）
    famineAnnouncedRef.current = false;
    shouxiDeclaredRef.current = new Set();
    fengpoBoostRef.current = {};
    doutuSelfOnlyRef.current = null;
    zhuquePrefRef.current = {};
    doutuDistanceRef.current = {};
    xuejiUsedRef.current = false;
    setHasUsedXueji(false);
    fengpoUsedRef.current = false;
    roundLastTurnRef.current = null;
    shenxianTurnRef.current = -1;
    chongxuUsedRef.current = false;
    miaoJianUsedRef.current = false;
    lingrenUsedRef.current = false;
    lingrenBoostRef.current = {};
    runweiUsedRef.current = false;
    runweiGiftRef.current = [];
    runweiExtraRef.current = null;
    runweiSecondUsedRef.current = false;
    runweiSecondFireRef.current = null;
    runweiBlockedRef.current = { turn: -1, ids: [] };
    shuanghuaiUsedRef.current = false;
    lastShuanghuaiTargetRef.current = null;
    yanyuCountRef.current = 0;
    
    // Lord starts
    const lordIndex = newPlayers.findIndex(p => p.identity === Identity.ZHUGONG);
    setTurnIndex(lordIndex);
    
    const initLogs: LogEntry[] = [{ id: 'init', text: `${totalPlayers}人军争模式启动！主公已现身，请各方势力准备。`, type: 'info' }];
    setLogs(initLogs);
    setPhase(GamePhase.START);
    setScreen('game');
    gameStartedAtRef.current = Date.now();
    // 出战台词：人类武将登场时播一句（TTS 合成或真实素材，均在本地）
    if (!isMutedRef.current) {
      setTimeout(() => { playEnterVoice(hero.id); }, 450);
    }

    // 仅本地开发：定向测试探针，与 ?ai= 同一个调试入口；生产构建中整段被移除。
    // __devState 读取当前对局信息；__devPatch 按 id 覆盖体力/手牌/装备，用于构造技能触发场景。
    if (debugDev) {
      const devWin = window as unknown as {
        __devState?: () => Array<{ id: number; name: string; hp: number; maxHp: number; identity: string; isHuman: boolean; hand: string[]; equip: string[]; sealed: boolean; judge: string[]; miaoJianLevel?: number; lianHuaLevel?: number }>;
        __devPatch?: (spec: Array<{ id: number; hp?: number; maxHp?: number; hand?: string[]; equip?: string[]; marks?: number; miaoJianLevel?: number; lianHuaLevel?: number }>) => void;
        __devDamage?: (victimId: number, sourceId: number, amount: number, nature?: 'fire' | 'thunder', cardName?: string) => void;
        __devKill?: (victimId: number, killerId?: number) => void;
        __devIdentity?: (spec: Array<{ id: number; identity: string }>) => void;
        __devTrick?: (spec: Array<{ id: number; cards: string[] }>) => void;
        __devDeckTop?: (names: string[]) => void;
        __devDeckOnly?: (names: string[]) => void;
        __devUseCard?: (sourceId: number, targetId: number, names: string[]) => Promise<void>;
        __devLogs?: () => string[];
        __devDiscard?: () => Array<{ id: string; name: string; suit: string }>;
      };
      devWin.__devLogs = () => logsRef.current.map(l => l.text);
      devWin.__devDiscard = () => discardPileRef.current.map(c => ({ id: c.id, name: c.name, suit: c.suit }));
      devWin.__devState = () => playersRef.current.map(p => ({
        id: p.id,
        name: p.hero.name,
        hp: p.hp,
        maxHp: p.maxHp,
        identity: p.identity,
        isHuman: p.isHuman,
        hand: p.hand.map(c => c.name),
        equip: Object.values(p.equipment ?? {}).filter((c): c is Card => !!c).map(c => c.name),
        sealed: isSkillSealed(p.id),
        judge: (p.judgeZone ?? []).map(c => c.name),
        miaoJianLevel: p.miaoJianLevel,
        lianHuaLevel: p.lianHuaLevel,
      }));
      devWin.__devPatch = (spec) => {
        const pool = [...deckRef.current];
        const mkCard = (nm: string, owner: Player, i: number): Card => {
          let name = nm as CardName;
          let suit: Suit = Suit.HEART;
          let attribute: 'fire' | 'thunder' | undefined;
          if (nm.startsWith('火')) { name = nm.slice(1) as CardName; attribute = 'fire'; }
          else if (nm.startsWith('黑')) { name = nm.slice(1) as CardName; suit = Suit.SPADE; }
          else if (nm.startsWith('♦')) { name = nm.slice(1) as CardName; suit = Suit.DIAMOND; }
          else if (nm.startsWith('♣')) { name = nm.slice(1) as CardName; suit = Suit.CLUB; }
          const idx = pool.findIndex(c => c.name === name);
          if (idx >= 0) {
            const found = pool.splice(idx, 1)[0];
            return { ...found, suit, attribute: attribute ?? found.attribute };
          }
          const base = owner.hand[0] ?? pool[0];
          const isEquip = !!EQUIP_META[name];
          return { ...base, id: `dev-${owner.id}-${i}-${Date.now()}`, name, type: isEquip ? CardType.EQUIPMENT : base.type, suit, attribute, description: `开发态构造：${nm}` };
        };
        const next = playersRef.current.map(p => {
          const s = spec.find(x => x.id === p.id);
          if (!s) return p;
          const patch: Partial<Player> = {};
          if (typeof s.hp === 'number') patch.hp = s.hp;
          if (typeof s.maxHp === 'number') patch.maxHp = s.maxHp;
          if (typeof s.marks === 'number') patch.meiyanMarks = s.marks;
          if (typeof s.miaoJianLevel === 'number') patch.miaoJianLevel = s.miaoJianLevel;
          if (typeof s.lianHuaLevel === 'number') patch.lianHuaLevel = s.lianHuaLevel;
          if (s.hand) patch.hand = s.hand.map((nm, i) => mkCard(nm, p, i));
          if (s.equip) {
            const eq: Equipment = {};
            s.equip.forEach((nm, i) => {
              const card = mkCard(nm, p, 100 + i);
              const meta = EQUIP_META[card.name];
              if (meta) eq[meta.slot] = card;
            });
            patch.equipment = eq;
          }
          return { ...p, ...patch };
        });
        playersRef.current = next;
        deckRef.current = pool;
        setDeck(pool);
        setPlayers(next);
      };
      // 仅测试用：把指定牌名压到牌堆顶（names[0] 先被翻开），用于给「集灵」构造确定分数
      devWin.__devDeckTop = (names) => {
        const pool = [...deckRef.current];
        const made = [...names].reverse().map((nm, i): Card => {
          let name = nm as CardName;
          let suit: Suit = Suit.HEART;
          if (nm.startsWith('黑')) { name = nm.slice(1) as CardName; suit = Suit.SPADE; }
          else if (nm.startsWith('♦')) { name = nm.slice(1) as CardName; suit = Suit.DIAMOND; }
          const idx = pool.findIndex(c => c.name === name);
          if (idx >= 0) {
            const found = pool.splice(idx, 1)[0];
            return { ...found, suit };
          }
          const base = pool[0] ?? playersRef.current[0]?.hand[0];
          return { ...(base as Card), id: `devtop-${i}-${Date.now()}`, name, suit, description: `开发态构造：${nm}` };
        });
        pool.push(...made);
        deckRef.current = pool;
        setDeck(pool);
      };
      // 仅测试用：用指定牌名重建整个牌堆（names[0] 在牌堆底），用于构造「伏诛」触发条件
      devWin.__devDeckOnly = (names) => {
        const pool = [...deckRef.current];
        const base = (playersRef.current[0]?.hand[0] ?? pool[0]) as Card;
        const made = names.map((nm, i): Card => {
          let name = nm as CardName;
          let suit: Suit = Suit.HEART;
          if (nm.startsWith('黑')) { name = nm.slice(1) as CardName; suit = Suit.SPADE; }
          else if (nm.startsWith('♦')) { name = nm.slice(1) as CardName; suit = Suit.DIAMOND; }
          const tpl = pool.find(c => c.name === name) ?? base;
          const type = (name === CardName.SHA || name === CardName.SHAN || name === CardName.TAO || name === CardName.JIU)
            ? CardType.BASIC
            : (EQUIP_META[name] ? CardType.EQUIPMENT : CardType.SCROLL);
          return { ...tpl, id: `devdeck-${i}-${Date.now()}`, name, suit, type, description: `开发态构造：${nm}` };
        });
        deckRef.current = made;
        setDeck(made);
      };
      devWin.__devDamage = (victimId, sourceId, amount, nature, cardName) => {
        let card: Card | undefined;
        if (cardName) {
          const base = playersRef.current.find(p => p.id === victimId)?.hand[0];
          card = {
            ...(base ?? { id: '', name: cardName as CardName, type: CardType.SCROLL, suit: Suit.SPADE, rank: '2', value: 0, description: '', imageColor: '' }),
            id: `devdmg-${Date.now()}`,
            name: cardName as CardName,
            suit: Suit.SPADE,
            rank: '2',
            value: 0,
            description: '开发态构造伤害牌',
          } as Card;
        }
        void combat.takeDamage(victimId, sourceId, amount, card, nature);
      };
      devWin.__devKill = (victimId, killerId) => {
        void handleDeath(victimId, killerId);
      };
      devWin.__devIdentity = (spec) => {
        const next = playersRef.current.map(p => {
          const s = spec.find(x => x.id === p.id);
          return s ? { ...p, identity: s.identity as Identity, isRevealed: true } : p;
        });
        playersRef.current = next;
        setPlayers(next);
      };
      devWin.__devTrick = (spec) => {
        const pool = [...deckRef.current];
        const next = playersRef.current.map(p => ({ ...p }));
        spec.forEach(s => {
          const idx = next.findIndex(x => x.id === s.id);
          if (idx < 0) return;
          const p = next[idx];
          const cards: Card[] = s.cards.map((nm, i) => {
            const di = pool.findIndex(c => c.name === (nm as CardName));
            if (di >= 0) return pool.splice(di, 1)[0];
            return {
              ...(p.hand[0] ?? { id: '', name: nm as CardName, type: CardType.SCROLL, suit: Suit.SPADE, rank: '2', value: 2, description: '', imageColor: '' }),
              id: `devt-${s.id}-${i}-${Date.now()}`,
              name: nm as CardName,
              description: '开发态构造延时锦囊',
            } as Card;
          });
          const zone = [...(p.judgeZone ?? []), ...cards];
          next[idx] = {
            ...p,
            judgeZone: zone,
            isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
            isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
            isShandian: zone.some(c => c.name === CardName.SHANDIAN),
          };
        });
        playersRef.current = next;
        setPlayers(next);
        deckRef.current = pool;
        setDeck(pool);
      };
      // 仅测试用：让来源角色对目标使用一张已在手牌中的指定牌（走真实 resolveCardEffect 流程）
      devWin.__devUseCard = async (sourceId, targetId, names) => {
        const src = getPlayer(sourceId);
        const tgt = getPlayer(targetId);
        if (!src || !tgt || !names.length) return;
        const card = src.hand.find(c => c.name === (names[0] as CardName));
        if (!card) {
          addLog(`【开发态】${src.hero.name} 手牌中没有【${names[0]}】`, 'warning');
          return;
        }
        await combat.resolveCardEffect(src, [tgt], card);
      };
    }

    // 开局即落一次存档：中途刷新也能从本回合开头恢复
    const snap: GameSave = {
      v: SAVE_VERSION,
      ts: Date.now(),
      playerCount: totalPlayers,
      players: newPlayers,
      deck: shuffledDeck,
      discardPile: [],
      turnIndex: lordIndex,
      logs: initLogs,
    };
    // 引导局不落盘：避免「看一遍教学」污染首页的「继续上一局」
    if (!opts?.tutorial && writeSave(snap)) setSavedGame(snap);
  };

  // 继续上一局：从存档的「回合开始」重放，先清掉所有挂起的交互与演出状态
  const resumeGame = () => {
    if (!savedGame) return;
    const s = savedGame;
    // 防御：即使入口条件意外放行，也拒绝恢复已结束的局（人类阵亡/主公阵亡/胜负已定）
    if (isSaveFinished(s)) {
      clearSave();
      setSavedGame(null);
      setHomeNotice('上一局已结束，请重新开始一局');
      return;
    }
    initAudio();
    gameStartedAtRef.current = Date.now();
    isGameOverRef.current = false;
    turnStepRef.current = '';
    aiTurnActiveRef.current = false;

    // 1. 结束可能挂起的人类决策，避免恢复后卡在旧 Promise 上
    if (humanReactionResolver.current) {
      humanReactionResolver.current({ played: false, isWuxie: false });
      humanReactionResolver.current = null;
    }
    if (dyingResolver.current) {
      dyingResolver.current(false);
      dyingResolver.current = null;
    }
    setPendingReaction(null);
    setDyingState(null);
    setWuguSelection(null);
    setWuguSelectedCard(null);
    setDecisionLeft(null);
    setReactionLeft(null);
    setWuguLeft(null);
    setDyingLeft(null);

    // 2. 清空选择 / 技能模式
    setSelectedCardIds([]);
    setActiveSelectedId(null);
    setIsSelectingTarget(false);
    setHasUsedZhiheng(false);
    setIsZhihengMode(false);
    setHasUsedLijian(false);
    setIsLijianMode(false);
    setLijianSelectedCardId(null);
    setLijianSelectedTargets([]);

    setIsRendeMode(false);
    setRendeSelectedCardIds([]);
    setRendeSelectedTarget(null);
    setIsJieyinMode(false);
    setJieyinTarget(null);
    setHasUsedJieyin(false);
    setHasUsedYanjiao(false);
    setIsQixiMode(false);
    setIsZhangbaMode(false);
    setZhangbaPending(null);
    setIsFanjianMode(false);
    setHasUsedFanjian(false);
    setIsGuoseMode(false);
    setIsQingnangMode(false);
    setQingnangCardId(null);
    setHasUsedQingnang(false);
    setIsAnxuMode(false);
    setHasUsedAnxu(false);
    setAnxuTargets([]);
    luoyiPlayerRef.current = null;
    // 第 1 批女将：新局重置
    setIsGanluMode(false);
    setGanluTargets([]);
    setHasUsedGanlu(false);
    ganluUsedRef.current = false;
    setIsQingchengMode(false);
    setHasUsedQingcheng(false);
    qingchengUsedRef.current = false;
    setHasUsedJiaozhao(false);
    jiaozhaoUsedRef.current = false;
    jiaozhaoPendingRef.current = null;
    setJiaozhaoPending(null);
    setGuohuanghouLevel(1);
    guohuanghouLevelRef.current = {};
    zoushiRevealedRef.current = new Set();
    skillSealRef.current = {};
    turnCountRef.current = 0;
    famineAnnouncedRef.current = false;
    hetaishouKillsRef.current = 0;
    setIsJiedaoMode(false);
    setJiedaoWeaponTarget(null);
    setJiedaoVictimTarget(null);
    setTiesuoSelectedTargets([]);

    // 3. 清掉残留演出
    setVisualCard(null);
    setJudgmentVisual(null);
    setDrawPulse(null);
    setAiThinkingId(null);
    setSkillBanner(null);
    setSkillGlowId(null);
    setTurnPass(null);
    setAdvice(null);
    setShowSkillModal(false);

    // 4. 还原牌桌
    setPlayers(s.players);
    playersRef.current = s.players;
    setDeck(s.deck);
    deckRef.current = s.deck;
    setDiscardPile(s.discardPile);
    discardPileRef.current = s.discardPile;
    // 恢复不算「摸牌/洗切」，重置牌堆动画基线
    prevDeckLenRef.current = s.deck.length;
    deckFxInitRef.current = true;
    setDeckFx(null);
    setTurnIndex(s.turnIndex);
    setLogs(s.logs);
    setPlayerCount(s.playerCount);
    setIsAiTakeover(false);
    setPhase(GamePhase.START);
    setScreen('game');
  };

  // --- 新手引导 ---
  // 引导不是「假界面」：直接开一局真实对局，由浮层高亮真实控件；主循环与读秒在此期间冻结
  // 仅由玩家主动点击入口（首页「新手教学」/ 玩法说明里的「新手教学」/ 对局中「?」）启动，不做任何自动弹窗

  const startTutorial = () => {
    const hero = HEROES.find(h => h.name === '刘备') || HEROES[0];
    tutorialHeroRef.current = hero;
    setShowRules(false);
    setTutorialActive(true);
    startGame(hero, { playerCount: 5, tutorial: true });
  };

  // 看完：重开一局干净对局，避免引导期间的任何状态残留
  const finishTutorial = () => {
    setTutorialActive(false);
    startGame(tutorialHeroRef.current || HEROES[0], { playerCount: 5 });
  };

  // 跳过：退出引导局并回到首页（不留存档）
  const skipTutorial = () => {
    setTutorialActive(false);
    exitToHome('已跳过新手引导，可随时在首页重新打开');
  };

  // --- Core Game Functions ---

  const discardCards = (playerId: number, cardsToDiscardIn: Card[]) => {
    const cardsToDiscard = cardsToDiscardIn.filter(c => {
      // 董白「黠慧」：他人获得的黑色牌在体力减少前不能弃置
      if (xiaohuiLocked(playerId, c.id)) {
        const owner = getPlayer(playerId);
        addLog(`【黠慧】${owner?.hero.name ?? ''} 不能弃置获得的黑色牌【${c.name}】（体力未减少）`, 'warning');
        return false;
      }
      return true;
    });
    if (!cardsToDiscard.length) return;
    // 创建要移除的卡牌ID集合，确保只移除指定的卡牌
    const cardIdsToRemove = new Set(cardsToDiscard.map(card => card.id));
    const before = getPlayer(playerId);
    const lostAllHand = !!before && before.hand.length > 0
      && before.hand.every(c => cardIdsToRemove.has(c.id));
    
    setPlayers(prev => {
      const updatedPlayers = prev.map(p => {
        if (p.id === playerId) {
          // 只移除ID在集合中的卡牌，而不是通过引用比较
          const remaining = p.hand.filter(card => !cardIdsToRemove.has(card.id));
          return { ...p, hand: remaining };
        }
        return p;
      });
      // 更新ref中的最新状态，确保桃已经被消耗
      playersRef.current = updatedPlayers;
      return updatedPlayers;
    });
    
    setDiscardPile(prev => {
      const newDiscardPile = [...prev, ...cardsToDiscard];
      discardPileRef.current = newDiscardPile; // 同步更新 ref
      return newDiscardPile;
    });

    // 张琪瑛「法箓」：因弃置移至弃牌堆后按花色获得标记
    if (before) grantZhangMarks(before, cardsToDiscard);

    // 陆逊「连营」：失去最后一张手牌后摸一张
    if (lostAllHand && before && !before.isDead && before.hero.name === '陆逊') {
      addLog(`${before.hero.name} 发动「连营」，摸一张牌`, 'skill');
      showSkillBanner(before.hero.name, '连营');
      drawCards(playerId, 1);
    }

    // 张星彩「甚贤」：回合外其他角色因弃置失去牌且其中有基本牌时，摸一张（每回合限一次）
    const xingcai = playersRef.current.find(p => !p.isDead && p.hero.name === '张星彩');
    if (xingcai && xingcai.id !== playerId && turnIndex !== xingcai.id
        && shenxianTurnRef.current !== turnIndex
        && cardsToDiscard.some(c => c.type === CardType.BASIC)) {
      shenxianTurnRef.current = turnIndex;
      addLog(`${xingcai.hero.name} 发动「甚贤」，摸一张牌`, 'skill');
      showSkillBanner(xingcai.hero.name, '甚贤');
      drawCardsRef.current?.(xingcai.id, 1);
    }

    // 王元姬「尚俭 / 明哲」：记录本回合失去的牌；回合外因弃置失去红色牌且装备区全红时摸一张
    const wj = playersRef.current.find(p => !p.isDead && p.hero.name === '王元姬');
    if (wj && wj.id === playerId && cardsToDiscard.length > 0) {
      updatePlayer(playerId, { lostCardsThisTurn: (wj.lostCardsThisTurn ?? 0) + cardsToDiscard.length });
      if (turnIndex !== wj.id && skillsOn(wj.id) && allEquipRed(wj)
          && cardsToDiscard.some(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND)) {
        addLog(`【明哲】王元姬于回合外因弃置失去红色牌，摸一张牌`, 'skill');
        showSkillBanner(wj.hero.name, '明哲');
        drawCardsRef.current?.(wj.id, 1);
      }
    }

    // 陆郁生「润微」：本阶段失去 X 张牌后，可再次发动（X 为其上次发动令目标获得的牌数）
    if (before && before.hero.name === '陆郁生' && skillsOn(before.id)
        && phaseLiveRef.current === GamePhase.ACTION && turnLiveRef.current === before.id) {
      const extra = runweiExtraRef.current;
      if (extra && extra.turn === turnCountRef.current && !runweiSecondUsedRef.current && extra.lossX > 0) {
        extra.lost += cardsToDiscard.length;
        if (extra.lost >= extra.lossX && runweiSecondFireRef.current) {
          const fire = runweiSecondFireRef.current;
          runweiSecondUsedRef.current = true;
          runweiExtraRef.current = null;
          addLog(`【润微】陆郁生本阶段已失去 ${extra.lost} 张牌（达到上次发动时获得的 ${extra.lossX} 张），可再次发动「润微」，且不能指定本回合获得过牌的角色`, 'skill');
          void fire(runweiBlockedRef.current.ids);
        }
      }
    }
  };

  // --- Game Loop ---

  const checkGameOver = useCallback(() => {
    // 游戏结束检查已移到 handleDeath 中集中处理
    return false;
  }, [players]);

  // 亮明所有玩家身份（游戏结束时使用）- 使用同步方式
  const revealAllIdentities = () => {
    setPlayers(prev => prev.map(p => ({ ...p, isRevealed: true })));
    playersRef.current = playersRef.current.map(p => ({ ...p, isRevealed: true }));
    addLog('游戏结束，所有玩家身份已亮明', 'info');
  };

  // 游戏结束处理（带身份亮明延迟）
  const handleGameOver = (side: WinnerSide) => {
    if (isGameOverRef.current) return; // 防止重复触发
    isGameOverRef.current = true;
    // 对局已分胜负，清掉存档，避免首页继续一个已经结束的局
    clearSave();
    setSavedGame(null);
    setWinnerSide(side);
    // 记录战绩
    const myIdentity = playersRef.current.find(p => p.isHuman)?.identity;
    const isVictory = myIdentity !== undefined && (
      (side === 'rebel' && myIdentity === Identity.FANZEI) ||
      (side === 'lord' && (myIdentity === Identity.ZHUGONG || myIdentity === Identity.ZHONGCHEN)) ||
      (side === 'spy' && myIdentity === Identity.NEIJIAN)
    );
    if (!isMuted) playSfx(isVictory ? 'victory' : 'defeat');
    setStats(prev => {
      const next = {
        games: prev.games + 1,
        wins: prev.wins + (isVictory ? 1 : 0),
        losses: prev.losses + (isVictory ? 0 : 1),
      };
      try { localStorage.setItem('sgs-stats', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    // 先亮明所有身份
    revealAllIdentities();
    // 延迟3秒后切换到结束画面，确保状态已更新
    setTimeout(() => {
      setScreen('gameover');
      // 这里不再重置 isGameOverRef：结算期间仍可能有异步死亡结算，
      // 重置会导致同一次对局重复结算/重复记战绩；只有 startGame 才允许开新局
    }, 3000);
  };

  const handleDeath = async (victimId: number, killerId?: number) => {
    const victim = getPlayer(victimId)!;
    // 优先播放武将阵亡台词，缺失时回退合成音
    if (!isMuted) {
      if (!playDeathVoice(victim.hero.id)) playSound('death');
    }
    addLog(`${victim.hero.name} 阵亡！身份是：【${victim.identity}】`, 'danger');

    // 曹婴「行殇」（凌人猜中三项临时获得）：其他角色死亡时，获得其所有手牌
    const xingshangOwner = playersRef.current.find(p => !p.isDead && p.id !== victimId && p.hasXingshang);
    if (xingshangOwner && victim.hand.length > 0) {
      const cards = victim.hand;
      mutateHand(xingshangOwner.id, h => [...h, ...cards]);
      addLog(`【行殇】${xingshangOwner.hero.name} 获得 ${victim.hero.name} 的所有手牌（${cards.length} 张）`, 'skill');
      showSkillBanner(xingshangOwner.hero.name, '行殇');
    }
    
    // 先更新状态
    updatePlayer(victimId, { isDead: true, isRevealed: true, hand: [] }); 

    // 判定区的延时锦囊随角色阵亡置入弃牌堆
    if (victim.judgeZone && victim.judgeZone.length > 0) {
      const nd = [...discardPileRef.current, ...victim.judgeZone];
      discardPileRef.current = nd;
      setDiscardPile(nd);
      updatePlayer(victimId, { judgeZone: [], isLeBuSiShu: false, isBingLiangCunDuan: false, isShandian: false });
    }

    // 清理可能阻塞流程的状态
    setDyingState(null);
    if (pendingReaction) setPendingReaction(null);
    if (humanReactionResolver.current) {
      humanReactionResolver.current({ played: false, isWuxie: false });
      humanReactionResolver.current = null;
    }

    // 羊徽瑜「劝封」：其他角色死亡后，可失去「弘仪」并获得其所有技能（替换武将牌），体力上限+1、回复1
    const quanfengOwner = playersRef.current.find(p => !p.isDead && p.id !== victimId && p.hero.name === '羊徽瑜' && skillsOn(p.id) && !p.quanfengUsed);
    if (quanfengOwner) {
      // 人类玩家：决定是否发动；AI / 托管：照旧直接发动
      const pick = await requestSkillChoice({
        skill: '劝封',
        owner: '羊徽瑜',
        title: `${victim.hero.name} 已阵亡，是否发动「劝封」？`,
        hint: '失去「弘仪」，获得其全部技能（替换武将牌），体力上限 +1 并回复 1 点体力',
        mode: 'choose',
        choices: [{ id: 'yes', label: '发动' }, { id: 'no', label: '不发动' }],
        cancelLabel: '不发动',
      }, quanfengOwner.isHuman);
      const go = (!pick || pick.kind === 'timeout') ? true : (pick.kind === 'choose' ? pick.id === 'yes' : false);
      if (go) {
        const newMax = quanfengOwner.maxHp + 1;
        const healed = Math.min(newMax, quanfengOwner.hp + 1);
        updatePlayer(quanfengOwner.id, {
          hero: victim.hero,
          maxHp: newMax,
          hp: healed,
          quanfengUsed: true,
          hongyiTargetId: null,
        });
        addLog(`【劝封】羊徽瑜失去「弘仪」，获得 ${victim.hero.name} 的全部技能，体力上限+1并回复1点体力（${healed}/${newMax}）${pick && pick.kind === 'choose' ? '（玩家选择）' : '（自动）'}`, 'skill');
        showSkillBanner('羊徽瑜', '劝封');
      } else {
        addLog('【劝封】羊徽瑜放弃发动', 'info');
      }
    }

    if (killerId !== undefined && killerId !== victimId) {
      const killer = getPlayer(killerId)!;
      // 灵雎「焚心」：限定技，杀死一名角色后，若自己不为主公，可与其交换身份牌（不限死者是否主公）
      if (killer.hero.name === '灵雎' && skillsOn(killerId) && !killer.fenxinUsed
          && killer.identity !== Identity.ZHUGONG) {
        const killerOldIdentity = killer.identity;
        updatePlayer(killerId, { fenxinUsed: true, identity: victim.identity });
        updatePlayer(victimId, { identity: killerOldIdentity });
        addLog(`【焚心】灵雎与 ${victim.hero.name} 交换身份牌，灵雎成为【${victim.identity}】，${victim.hero.name} 变为【${killerOldIdentity}】`, 'skill');
        showSkillBanner('灵雎', '焚心');
      }
      // 何太后「戚乱」：记录本回合击杀数（结束阶段按 3×击杀数摸牌）
      if (killer.hero.name === '何太后') hetaishouKillsRef.current += 1;
      // 蔡文姬「断肠」：击杀者失去所有手牌
      if (victim.hero.name === '蔡文姬' && killer.hand.length > 0) {
        addLog(`${victim.hero.name} 的「断肠」发动，${killer.hero.name} 失去所有手牌！`, 'skill');
        discardCards(killerId, killer.hand);
      }
      if (victim.identity === Identity.FANZEI) {
        addLog(`${killer.hero.name} 诛杀反贼，领赏（摸3张牌）。`, 'success');
        drawCards(killerId, 3);
      }
      if (killer.identity === Identity.ZHUGONG && victim.identity === Identity.ZHONGCHEN) {
        addLog(`主公误杀忠臣，弃置所有牌！`, 'danger');
        discardCards(killerId, killer.hand); 
      }
    }

    // 步练师「追忆」：死亡时可令一名其他角色摸三张牌（自动选择己方体力最低的同伴）
    if (victim.hero.name === '步练师') {
      const others = playersRef.current.filter(p => !p.isDead && p.id !== victimId);
      const allies = others.filter(p => isAlly(victim, p));
      const chosen = pickWeakest(allies.length ? allies : others);
      if (chosen) {
        addLog(`${victim.hero.name} 发动「追忆」，令 ${chosen.hero.name} 摸三张牌`, 'skill');
        showSkillBanner(victim.hero.name, '追忆');
        drawCards(chosen.id, 3);
      }
    }
    
    // 使用 setTimeout 确保状态已更新后再检查游戏结束
    // 延迟检查游戏结束，让玩家先看到阵亡信息和身份
    setTimeout(() => {
      if (isGameOverRef.current) return; // 防止重复触发
      // 胜负条件在 src/game/rules.ts 中集中实现，便于单测覆盖
      const side = evaluateWinnerSide(playersRef.current);
      if (side) handleGameOver(side);
    }, 100);
  };

  // Main Loop Effect
  useEffect(() => {
    if (screen !== 'game') return;
    // 结算/退出后立即停止推进：避免结算 3 秒内继续开新回合、写存档、开下一局
    if (isGameOverRef.current) return;
    // 新手引导期间冻结对局：只高亮界面，不让 AI/阶段推进偷偷改变状态
    if (tutorialActive) return;
    if (checkGameOver()) return;
    if (isProcessing) return; // 如果正在处理异步效果，暂停游戏主循环推进

    // 同一「回合 + 阶段」只推进一次：isProcessing 从 1 回到 0 时不再重复触发
    const stepKey = `${screen}-${turnIndex}-${phase}-${isAiTakeover ? 'auto' : 'human'}`;
    if (turnStepRef.current === stepKey) return;
    // 同一「回合+阶段」已有结算链在跑：禁止并发启动第二条
    // （并发链会各写一次阶段，后写的那条把阶段写回上一阶段，而该阶段已被去重跳过 → 永久停摆）
    const activeStep = activeStepRef.current;
    if (activeStep && activeStep.turn === turnIndex && activeStep.phase === phase) return;
    turnStepRef.current = stepKey;
    const stageToken = ++stageTokenRef.current;
    activeStepRef.current = { turn: turnIndex, phase, token: stageToken };
    progressAtRef.current = Date.now();
    dbgMark('loop:' + stepKey);

    // 更新ref中的最新状态
    playersRef.current = players;

    const currentPlayer = getPlayer(turnIndex);
    if (!currentPlayer || currentPlayer.isDead) {
      setTurnIndex((turnIndex + 1) % players.length);
      return;
    }

    const runTurn = async () => {
      // 立即获取最新的phase和players状态，避免闭包问题
      const currentPhase = phase;
      const currentPlayer = getPlayer(turnIndex);
      if (!currentPlayer) return;
      
      // START PHASE
      if (currentPhase === GamePhase.START) {
        // 新一轮回合：清空判定阶段对摸牌/出牌阶段的跳过标记
        judgeSkipRef.current = { draw: false, action: false };
        setPendingReaction(null);
        setAdvice(null);
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        setHasUsedZhiheng(false); // 重置制衡技能使用状态
 
        setHasUsedLijian(false); // 重置貂蝉离间技能使用状态
        slashUsageRef.current[currentPlayer.id] = 0; // 重置本回合【杀】使用次数
    qiangwuUsedRef.current = false; // 重置「枪舞」
    qiangwuPointRef.current = null;
    setQiangwuPoint(null);
    setHasUsedQiangwu(false);
    setHasUsedMiaoJian(false); // 重置「妙剑」人类按钮状态
    setHasUsedChongxu(false); // 重置「冲虚」人类按钮状态
    wanweiUsedRef.current = false; // 重置「挽危」
        xuejiUsedRef.current = false; // 重置「血祭」
        setHasUsedXueji(false);
        fengpoUsedRef.current = false; // 重置「凤魄」
        fengpoBoostRef.current = {};
        shenxianTurnRef.current = -1; // 重置「甚贤」
        doutuSelfOnlyRef.current = null; // 重置「惴恐」
        delete doutuDistanceRef.current[currentPlayer.id];
        zhuquePrefRef.current = {}; // 重置「朱雀羽扇」本回合偏好
        setIsJiedaoMode(false); // 重置借刀杀人模式
        setJiedaoWeaponTarget(null); // 重置借刀目标
        setJiedaoVictimTarget(null); // 重置被攻击目标
        // 重置刘备仁德技能状态
        setIsRendeMode(false);
        setRendeSelectedCardIds([]);
        setRendeSelectedTarget(null);
        rendeGivenRef.current = 0;
        rendeHealedRef.current = false;
        // 重置孙尚香结姻
        setIsJieyinMode(false);
        setJieyinTarget(null);
        setHasUsedJieyin(false);
        // 重置张昌蒲严教
        setHasUsedYanjiao(false);
        // 重置甘宁奇袭
        setIsQixiMode(false);
        // 重置本轮新增技能状态
        setHasUsedFanjian(false);
        setIsFanjianMode(false);
        setIsGuoseMode(false);
        setHasUsedQingnang(false);
        setIsQingnangMode(false);
        setQingnangCardId(null);
        setHasUsedAnxu(false);
        setIsAnxuMode(false);
        setAnxuTargets([]);
        luoyiPlayerRef.current = null;
        // 第 1 批女将：回合开始重置（限一次/暗置计数）
        turnCountRef.current += 1;
        turnOwnerIdRef.current = currentPlayer.id;
        firstUsedCardRef.current = new Set();
        expireGrantedSkills();
        // 通用：暗置封印到期 → 武将牌明置（可触发「闺秀」等明置技）
        Object.keys(skillSealRef.current).forEach(key => {
          const id = Number(key);
          if (turnCountRef.current >= skillSealRef.current[id]) {
            delete skillSealRef.current[id];
            setGeneralRevealed(id, true, '暗置解除');
          }
        });
        // 通用：他人回合开始的技能 / 虚拟牌钩子
        await runTurnStartHooks(currentPlayer);
        hetaishouKillsRef.current = 0; // 「戚乱」本回合击杀数
        ganluUsedRef.current = false;
        setHasUsedGanlu(false);
        setIsGanluMode(false);
        setGanluTargets([]);
        qingchengUsedRef.current = false;
        setHasUsedQingcheng(false);
        setIsQingchengMode(false);
        wuyuanUsedRef.current = false; // 重置「武缘」
        // 王元姬「尚俭」：每回合开始清零“本回合失去的牌”
        {
          const wj = playersRef.current.find(p => !p.isDead && p.hero.name === '王元姬');
          if (wj) updatePlayer(wj.id, { lostCardsThisTurn: 0, qianchongType: null });
        }
        usedTypesRef.current = new Set(); // 蔡贞姬「天音」：每回合重置用牌类型记录
        if (currentPlayer.hero.name === '蔡贞姬') sheyiUsedRef.current = false;
        if (currentPlayer.hero.name === '张昌蒲') yanjiaoUsedRef.current = false;
        if (currentPlayer.hero.name === '羊徽瑜') {
          hongyiUsedRef.current = false;
          updatePlayer(currentPlayer.id, { hongyiTargetId: null }); // 弘仪持续至羊徽瑜的下个回合开始
        }

        // 张昌蒲「严教」：上回合交出牌数，在下回合开始时摸回
        {
          const zcp = playersRef.current.find(p => !p.isDead && p.hero.name === '张昌蒲');
          if (zcp && (zcp.yanjiaoCount ?? 0) > 0) {
            const n = zcp.yanjiaoCount!;
            updatePlayer(zcp.id, { yanjiaoCount: 0 });
            drawCards(zcp.id, n);
            addLog(`【严教】张昌蒲下回合开始，摸 ${n} 张牌`, 'skill');
            showSkillBanner('张昌蒲', '严教');
            await delay(300);
          }
        }

        // 周妃「箜声」：准备阶段将至多两张牌置于武将牌上；「良姻」令手牌多于她的一名角色摸一张
        if (currentPlayer.hero.name === '周妃' && skillsOn(currentPlayer.id)) {
          const p = getPlayer(currentPlayer.id);
          if (p && p.hand.length > 0) {
            const keepValue = (c: Card) => (c.name === CardName.SHA ? 2 : c.type === CardType.BASIC ? 1 : 3);
            const aiPick = [...p.hand].sort((a, b) => keepValue(a) - keepValue(b)).slice(0, 2);
            // 人类玩家：从手牌里自选任意张（规则为“任意张牌”）；AI / 托管：仍取低价值的两张
            const pick = await requestSkillChoice({
              skill: '箜声',
              owner: '周妃',
              title: '准备阶段：可将任意张手牌置于武将牌上，结束阶段再收回或使用',
              hint: `当前手牌 ${p.hand.length} 张，最多可置上 ${p.hand.length} 张`,
              mode: 'card',
              cards: p.hand,
              min: 1,
              max: p.hand.length,
              cancelLabel: '不发动',
            }, currentPlayer.isHuman);
            const picked = (!pick || pick.kind === 'timeout')
              ? aiPick
              : (pick.kind === 'card' ? p.hand.filter(c => pick.ids.includes(c.id)) : []);
            if (picked.length > 0) {
              mutateHand(p.id, h => h.filter(c => !picked.some(x => x.id === c.id)));
              updatePlayerWith(p.id, cur => ({ placedCards: [...(cur.placedCards ?? []), ...picked] }));
              addLog(`【箜声】周妃将 ${picked.length} 张牌置于武将牌上${pick && pick.kind === 'card' ? '（玩家选择）' : '（自动）'}`, 'skill');
              showSkillBanner('周妃', '箜声');
              const myHandAfter = p.hand.length - picked.length;
              const richer = playersRef.current.filter(o => !o.isDead && o.id !== p.id && o.hand.length > myHandAfter);
              if (richer.length > 0) {
                const t = richer.sort((a, b) => b.hand.length - a.hand.length)[0];
                drawCards(t.id, 1);
                addLog(`【良姻】周妃令手牌多于自己的 ${t.hero.name} 摸一张牌`, 'skill');
                showSkillBanner('周妃', '良姻');
              }
              await delay(300);
            }
          }
        }
        jiaozhaoUsedRef.current = false;
        setHasUsedJiaozhao(false);
        jiaozhaoPendingRef.current = null;
        setJiaozhaoPending(null);
        // 「本回合」类禁【杀】效果在新回合开始时清零
        mumuNoSlashRef.current = null;
        zhixiRef.current = null;
        meibuDistanceRef.current = {};
        addLog(`>>> ${currentPlayer.hero.name} (${currentPlayer.isHuman ? '你' : 'AI'}) 回合开始 <<<`, 'info');

        // 伏皇后「惴恐」：其他角色的回合开始时，若她已受伤，可与其拼点。
        // 赢：该角色本回合使用牌不能选择除自己以外的角色为目标；没赢：距离视为 1。
        const fu = playersRef.current.find(p => !p.isDead && p.hero.name === '伏皇后');
        if (fu && fu.id !== currentPlayer.id && fu.hp < fu.maxHp
            && fu.hand.length > 0 && currentPlayer.hand.length > 0) {
          const fuCard = [...fu.hand].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
          const tp = getPlayer(currentPlayer.id)!;
          const tCard = [...tp.hand].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
          discardCards(fu.id, [fuCard]);
          discardCards(tp.id, [tCard]);
          addLog(`伏皇后发动「惴恐」，与 ${tp.hero.name} 拼点：${fuCard.name}${fuCard.rank} vs ${tCard.name}${tCard.rank}`, 'skill');
          showSkillBanner('伏皇后', '惴恐');
          if (rankValue(fuCard.rank) > rankValue(tCard.rank)) {
            doutuSelfOnlyRef.current = tp.id;
            addLog(`「惴恐」获胜，${tp.hero.name} 本回合使用牌不能选择除自己以外的角色为目标`, 'danger');
          } else {
            doutuDistanceRef.current[tp.id] = fu.id;
            addLog(`「惴恐」未获胜，${tp.hero.name} 本回合与伏皇后的距离视为 1`, 'info');
          }
          await delay(700);
        }

        // 甄姬「洛神」：回合开始时判定，黑色则获得该判定牌并可继续（最多 3 次）
        if (currentPlayer.hero.name === '甄姬') {
          for (let i = 0; i < 3; i++) {
            const jc = await performJudgment(currentPlayer.id, '洛神');
            if (!jc) break;
            if (jc.suit !== Suit.SPADE && jc.suit !== Suit.CLUB) {
              addLog(`「洛神」判定为红色，结束`, 'info');
              break;
            }
            mutateHand(currentPlayer.id, hand => [...hand, jc]);
            addLog(`${currentPlayer.hero.name} 发动「洛神」，获得【${jc.name}】`, 'skill');
            showSkillBanner(currentPlayer.hero.name, '洛神');
            await delay(400);
          }
        }

        // 王异「秘计」：回合开始时若已受伤，摸等同于已损失体力的牌
        if (currentPlayer.hero.name === '王异') {
          const lostHp = currentPlayer.maxHp - currentPlayer.hp;
          if (lostHp > 0) {
            addLog(`${currentPlayer.hero.name} 发动「秘计」，已损失 ${lostHp} 点体力，摸 ${lostHp} 张牌`, 'skill');
            showSkillBanner(currentPlayer.hero.name, '秘计');
            drawCards(currentPlayer.id, lostHp);
            await delay(600);
          }
        }

        // 诸葛亮「观星」：观看牌堆顶3张，把最好的两张留在顶，其余置底
        if (currentPlayer.hero.name === '诸葛亮') {
          const top = deckRef.current.slice(-3).reverse();
          if (top.length > 0) {
            const score = (c: Card) => {
              switch (c.name) {
                case CardName.TAO: return 10;
                case CardName.WUZHONG: return 9;
                case CardName.SHAN: return 8;
                case CardName.SHA: return 7;
                case CardName.WUXIE: return 6;
                case CardName.JIU: return 5;
                default: return c.type === CardType.EQUIPMENT ? 4 : 3;
              }
            };
            const sorted = [...top].sort((a, b) => score(b) - score(a));
            const keep = sorted.slice(0, 2);
            const bottom = sorted.slice(2);
            const rest = deckRef.current.slice(0, -top.length);
            // 牌堆从尾部摸牌：最好的牌放在最后，先被摸到
            const newDeck = [...bottom, ...rest, ...keep.reverse()];
            setDeck(newDeck);
            deckRef.current = newDeck;
            addLog(`${currentPlayer.hero.name} 发动「观星」，观看牌堆顶 ${top.length} 张并调整了顺序`, 'skill');
            showSkillBanner(currentPlayer.hero.name, '观星');
            await delay(500);
          }
        }

        // 闪电判定已移入独立的「判定阶段」，在判定区按放置先后统一结算

        // 孙寒华：回合开始时重置出牌阶段限一次的「冲虚 / 妙剑」
        if (currentPlayer.hero.name === '孙寒华') {
          chongxuUsedRef.current = false;
          miaoJianUsedRef.current = false;
        }

        // 陆郁生：每回合重置「霜怀」；自己的回合重置「润微」
        shuanghuaiUsedRef.current = false;
        if (currentPlayer.hero.name === '陆郁生') runweiUsedRef.current = false;
        runweiExtraRef.current = null;
        runweiSecondUsedRef.current = false;
        runweiSecondFireRef.current = null;

        // 夏侯氏：回合开始时重置「燕语」重铸计数
        if (currentPlayer.hero.name === '夏侯氏') yanyuCountRef.current = 0;

        // 蔡夫人「窃听」：记录本回合是否用牌指定过其他角色
        turnUsedOnOthersRef.current[currentPlayer.id] = false;

        // 董白「连诛」：回合开始时重置限一次
        if (currentPlayer.hero.name === '董白') lianzhuUsedRef.current = false;

        // 辛宪英：回合开始时重置「忠鉴」次数与「才识」用牌限制
        if (currentPlayer.hero.name === '辛宪英') {
          updatePlayer(currentPlayer.id, { zhongjianCount: 0, zhongjianLimit: 1, caiShiMode: null });
        }

        // 孙鲁班「谮毁」：回合开始时重置限一次
        if (currentPlayer.hero.name === '孙鲁班') cangHuiUsedRef.current = false;
        // 卞夫人「约俭」：每回合限两次，随回合重置
        yuejianCountRef.current = 0;

        // 吴苋「福绵」：准备阶段选择一项；与上回合选择不同则该项数值 +1
        if (currentPlayer.hero.name === '吴苋' && skillsOn(currentPlayer.id)) {
          const red = (c: Card) => c.suit === Suit.HEART || c.suit === Suit.DIAMOND;
          const hasRedUse = currentPlayer.hand.some(c => red(c)
            && (c.name === CardName.SHA || c.type === CardType.SCROLL));
          const pick: 1 | 2 = hasRedUse ? 2 : 1;
          const prevChoice = currentPlayer.fumianChoice;
          let v1 = currentPlayer.fumianValue1 ?? 1;
          let v2 = currentPlayer.fumianValue2 ?? 1;
          if (prevChoice && pick !== prevChoice) {
            if (pick === 1) v1 = Math.min(4, v1 + 1);
            else v2 = Math.min(3, v2 + 1);
          }
          updatePlayer(currentPlayer.id, { fumianChoice: pick, fumianValue1: v1, fumianValue2: v2 });
          fumianTargetUsedRef.current = false;
          addLog(pick === 1
            ? `【福绵】吴苋选择摸牌阶段多摸 ${v1} 张牌`
            : `【福绵】吴苋选择本回合红色基本牌或红色普通锦囊可额外指定 ${v2} 个目标（限一次）`, 'skill');
          showSkillBanner('吴苋', '福绵');
          await delay(300);
        }

        // 赵襄「扶汉」：限定技，回合开始时可移去全部「梅影」，从未登场的蜀势力武将中五选一替换
        if (currentPlayer.hero.name === '赵襄' && skillsOn(currentPlayer.id)
            && !currentPlayer.fuhanUsed && (currentPlayer.meiyanMarks ?? 0) > 0) {
          const inPlay = new Set(playersRef.current.map(p => p.hero.name));
          const pool = HEROES.filter(h => h.kingdom === '蜀' && !h.pending && h.name !== '赵襄' && !inPlay.has(h.name));
          const candidates = shuffle(pool).slice(0, 5);
          if (candidates.length > 0) {
            let chosen: Hero | undefined;
            if (currentPlayer.isHuman && !isAiTakeover) {
              const pick = await requestSkillChoice({
                skill: '扶汉',
                owner: currentPlayer.hero.name,
                title: '移去全部「梅影」，从五名未登场的蜀势力武将中选择一名替换',
                mode: 'choose',
                choices: candidates.map((h, i) => ({ id: String(i), label: h.name, desc: `体力上限 ${h.maxHp}` })),
                cancelLabel: '不发动扶汉',
              }, true);
              if (pick && pick.kind === 'choose') chosen = candidates[Number(pick.id)];
            } else {
              chosen = candidates[Math.floor(Math.random() * candidates.length)];
            }
            if (chosen) {
              const me = getPlayer(currentPlayer.id);
              const marks = me?.meiyanMarks ?? 0;
              if (me && marks > 0) {
                // 体力上限 = 本局移去梅影数（至多游戏人数）；若为体力最低者回复 1 点
                const newMax = Math.max(1, Math.min(marks, playersRef.current.length));
                const aliveHp = playersRef.current.filter(p => !p.isDead).map(p => p.hp);
                const isLowest = me.hp <= Math.min(...aliveHp);
                updatePlayer(currentPlayer.id, {
                  hero: chosen,
                  fuhanUsed: true,
                  meiyanMarks: 0,
                  maxHp: newMax,
                  hp: Math.min(me.hp + (isLowest ? 1 : 0), newMax),
                });
                addLog(`【扶汉】赵襄移去 ${marks} 枚「梅影」并替换为蜀势力武将 ${chosen.name}，体力上限改为 ${newMax}${isLowest ? '，因体力最低回复 1 点' : ''}`, 'skill');
                showSkillBanner('赵襄', '扶汉');
                await delay(400);
              }
            }
          }
        }

        // 曹婴：回合开始时重置「凌人」，并结束上一次「奸雄/行殇」
        if (currentPlayer.hero.name === '曹婴') {
          lingrenUsedRef.current = false;
          if (currentPlayer.hasJianxiong || currentPlayer.hasXingshang) {
            updatePlayer(currentPlayer.id, { hasJianxiong: false, hasXingshang: false });
            addLog('曹婴的「奸雄/行殇」效果结束', 'skill');
          }
        }

        // 甘夫人「神智」：准备阶段弃置所有手牌，弃置数不小于体力值则回复1点
        if (currentPlayer.hero.name === '甘夫人' && skillsOn(currentPlayer.id)
            && currentPlayer.hand.length >= currentPlayer.hp && currentPlayer.hp < currentPlayer.maxHp
            && currentPlayer.hand.length > 0) {
          const discarded = [...currentPlayer.hand];
          discardCards(currentPlayer.id, discarded);
          addLog(`甘夫人发动「神智」，弃置 ${discarded.length} 张手牌`, 'skill');
          showSkillBanner('甘夫人', '神智');
          await delay(400);
          const healed = recoverHp(currentPlayer.id, 1);
          if (healed > 0) addLog(`甘夫人回复 1 点体力（${getPlayer(currentPlayer.id)?.hp}/${currentPlayer.maxHp}）`, 'success');
          await delay(400);
        }

        // 孙茹「影箭」：准备阶段，视为使用一张无距离限制的【杀】
        if (currentPlayer.hero.name === '孙茹' && skillsOn(currentPlayer.id)) {
          const foes = playersRef.current.filter(p => !p.isDead && p.id !== currentPlayer.id && isEnemy(currentPlayer, p));
          if (foes.length > 0) {
            const foe = [...foes].sort((a, b) => a.hp - b.hp)[0];
            addLog(`孙茹发动「影箭」，视为对 ${foe.hero.name} 使用一张无距离限制的【杀】`, 'skill');
            showSkillBanner('孙茹', '影箭');
            await delay(500);
            const virtualSlash: Card = {
              id: `yingjian-${currentPlayer.id}-${Date.now()}`,
              name: CardName.SHA,
              type: CardType.BASIC,
              suit: Suit.SPADE,
              rank: 'K',
              value: 13,
              description: '影箭：视为使用一张无距离限制的【杀】',
              imageColor: 'from-slate-700 to-slate-900',
            };
            const me = getPlayer(currentPlayer.id);
            const foeNow = getPlayer(foe.id);
            if (me && foeNow) await combat.resolveCardEffect(me, [foeNow], virtualSlash);
          }
        }

        // 张琪瑛「点化」：准备阶段观看牌堆顶
        if (currentPlayer.hero.name === '张琪瑛') {
          doDianhua(currentPlayer);
          await delay(500);
        }

        // 卑弥呼「拜假」觉醒 + 「纵傀」回合开始
        if (currentPlayer.hero.name === '卑弥呼' && skillsOn(currentPlayer.id)) {
          const ju = currentPlayer.juMarks ?? 0;
          if (ju >= 7 && !currentPlayer.baiJiaAwakened) {
            const np = getPlayer(currentPlayer.id);
            if (np) {
              updatePlayer(currentPlayer.id, {
                baiJiaAwakened: true,
                maxHp: np.maxHp + 1,
                hp: Math.min(np.hp + 1, np.maxHp + 1),
              });
              playersRef.current.forEach(o => {
                if (o.id !== currentPlayer.id && !o.isDead && !o.hasKui) updatePlayer(o.id, { hasKui: true });
              });
              addLog(`【拜假】卑弥呼觉醒：体力上限+1、回复1点体力，所有其他角色获得“傀”，失去「骨疽」获得「蚕食」`, 'skill');
              showSkillBanner('卑弥呼', '拜假');
              await delay(700);
            }
          }
          // 纵傀：优先给敌人
          const cand = playersRef.current.filter(p => !p.isDead && p.id !== currentPlayer.id && !p.hasKui);
          if (cand.length) {
            const pick = [...cand].sort((a, b) =>
              (isEnemy(currentPlayer, b) ? 1 : 0) - (isEnemy(currentPlayer, a) ? 1 : 0))[0];
            updatePlayer(pick.id, { hasKui: true });
            addLog(`【纵傀】卑弥呼令 ${pick.hero.name} 获得“傀”标记`, 'skill');
            showSkillBanner('卑弥呼', '纵傀');
            await delay(400);
          }
        }

        // 每轮游戏开始时：卑弥呼令体力最少且无傀的其他角色获得傀
        if (roundLastTurnRef.current !== null && currentPlayer.id < roundLastTurnRef.current) {
          const bmh = playersRef.current.find(p => !p.isDead && p.hero.name === '卑弥呼' && skillsOn(p.id));
          if (bmh) {
            const cand = playersRef.current.filter(p => !p.isDead && p.id !== bmh.id && !p.hasKui);
            if (cand.length) {
              const pick = [...cand].sort((a, b) => a.hp - b.hp)[0];
              updatePlayer(pick.id, { hasKui: true });
              addLog(`【纵傀·轮次】卑弥呼令体力最少的 ${pick.hero.name} 获得“傀”标记`, 'skill');
              showSkillBanner('卑弥呼', '纵傀');
            }
          }
        }
        roundLastTurnRef.current = currentPlayer.id;

        // 安全防线：体力<=0的角色需要先进行濒死求桃
        const latestCurrent = getPlayer(turnIndex);
        if (latestCurrent && latestCurrent.hp <= 0 && !latestCurrent.isDead) {
          addLog(`${latestCurrent.hero.name} 体力为 ${latestCurrent.hp}，进入濒死状态！`, 'danger');
          // 进入濒死求桃流程
          const isSaved = await combat.askForPeaches(latestCurrent.id);
          if (!isSaved) {
            addLog(`${latestCurrent.hero.name} 未能得到救援，死亡！`, 'danger');
            await handleDeath(latestCurrent.id);
            setPhase(GamePhase.END);
          } else {
            // 救活后继续本回合，进入判定阶段（延时锦囊仍需逐张结算）
            setPhase(GamePhase.JUDGE);
          }
          return;
        }
        // 当先（许身授予）：回合开始时执行一个额外的出牌阶段
        {
          const dxOwner = getPlayer(turnIndex);
          const already = dangxianExtraPhaseRef.current;
          if (dxOwner && hasGrantedSkill(dxOwner, '当先') && (!already || already.turn !== turnCountRef.current)) {
            dangxianExtraPhaseRef.current = { turn: turnCountRef.current, active: true };
            addLog(`【当先】${dxOwner.hero.name} 执行一个额外的出牌阶段`, 'skill');
            showSkillBanner(dxOwner.hero.name, '当先');
            await delay(300);
            setPhase(GamePhase.ACTION);
            return;
          }
        }
        await delay(800);
        setPhase(GamePhase.JUDGE);
      }

      // JUDGE PHASE：判定阶段——判定区内的延时锦囊按进入先后逐张结算
      else if (currentPhase === GamePhase.JUDGE) {
        const judgeOwner = getPlayer(turnIndex);
        if (!judgeOwner) return;
        const zone = [...(judgeOwner.judgeZone ?? [])];
        if (zone.length === 0) {
          setPhase(GamePhase.DRAW);
          return;
        }
        addLog(`【判定阶段】${judgeOwner.hero.name} 的判定区共 ${zone.length} 张延时锦囊，按放置先后逐张判定`, 'info');
        await delay(500);
        for (let i = 0; i < zone.length; i++) {
          const trick = zone[i];
          const cur = getPlayer(turnIndex);
          if (!cur) break;
          const inZone = (cur.judgeZone ?? []).some(c => c.id === trick.id);
          if (!inZone) continue;
          addLog(`【判定阶段】第 ${i + 1}/${zone.length} 张：${trick.name}（${trick.suit}${trick.rank}）`, 'info');
          if (cur.isDead) {
            removeDelayedTrick(turnIndex, trick);
            addLog(`【判定阶段】${cur.hero.name} 已阵亡，【${trick.name}】直接置入弃牌堆`, 'info');
            continue;
          }
          if (trick.name === CardName.LESI) {
            const jc = await performJudgment(turnIndex, '乐不思蜀');
            removeDelayedTrick(turnIndex, trick);
            if (jc && jc.suit === Suit.HEART) {
              addLog(`判定为红桃，【乐不思蜀】解除，${cur.hero.name} 可正常出牌`, 'success');
            } else {
              judgeSkipRef.current.action = true;
              addLog(`判定为${jc ? jc.suit : '无'}，【乐不思蜀】生效，${cur.hero.name} 将跳过出牌阶段`, 'warning');
            }
          } else if (trick.name === CardName.BINGLIANG) {
            const jc = await performJudgment(turnIndex, '兵粮寸断');
            removeDelayedTrick(turnIndex, trick);
            if (jc && jc.suit === Suit.CLUB) {
              addLog(`判定为梅花，【兵粮寸断】解除，${cur.hero.name} 可正常摸牌`, 'success');
            } else {
              judgeSkipRef.current.draw = true;
              addLog(`判定为${jc ? jc.suit : '无'}，【兵粮寸断】生效，${cur.hero.name} 将跳过摸牌阶段`, 'warning');
            }
          } else if (trick.name === CardName.SHANDIAN) {
            // 闪电：判定牌为黑桃2-9时受到3点雷电伤害，否则传递给下一名存活角色
            const jc = await performJudgment(turnIndex, '闪电');
            removeDelayedTrick(turnIndex, trick);
            const rankNum = jc ? (parseInt(jc.rank.replace(/\D/g, ''), 10) || 0) : 0;
            if (jc && jc.suit === Suit.SPADE && rankNum >= 2 && rankNum <= 9) {
              addLog(`⚡【闪电】命中！${cur.hero.name} 受到3点雷电伤害！`, 'danger');
              await combat.takeDamage(cur.id, cur.id, 3, {
                ...jc, name: CardName.SHANDIAN,
              } as Card, 'thunder');
            } else {
              let nextIdx = (cur.id + 1) % players.length;
              let safety = 0;
              while (safety < players.length) {
                const np = getPlayer(nextIdx);
                if (np && !np.isDead) break;
                nextIdx = (nextIdx + 1) % players.length;
                safety++;
              }
              if (safety < players.length && nextIdx !== cur.id) {
                addDelayedTrick(nextIdx, trick);
                addLog(`【闪电】未命中，传递给 ${getPlayer(nextIdx)?.hero.name}`, 'info');
              } else {
                addLog(`【闪电】未命中，无人可传递，进入弃牌堆`, 'info');
              }
            }
          }
          await delay(600);
        }
        // 判定区清空后进入摸牌阶段；兵粮寸断的跳过由 DRAW 读取 judgeSkipRef
        const after = getPlayer(turnIndex);
        if (after && after.isDead) {
          setPhase(GamePhase.END);
        } else {
          setPhase(GamePhase.DRAW);
        }
      }
      
      // DRAW PHASE
      else if (currentPhase === GamePhase.DRAW) {
        // 判定阶段判定为非梅花：兵粮寸断生效，整个摸牌阶段跳过
        if (judgeSkipRef.current.draw) {
          judgeSkipRef.current.draw = false;
          addLog(`${currentPlayer.hero.name} 受【兵粮寸断】影响，跳过摸牌阶段！`, 'warning');
          await delay(600);
          setPhase(GamePhase.ACTION);
          return;
        }
        // 辛宪英「才识」：摸牌阶段选择手牌上限+1（本回合不能对其他角色用牌）或回复1点体力（本回合不能对自己用牌）
        if (currentPlayer.hero.name === '辛宪英' && skillsOn(currentPlayer.id)) {
          if (currentPlayer.hp < currentPlayer.maxHp && currentPlayer.hp <= 2) {
            updatePlayer(currentPlayer.id, { caiShiMode: 'limitSelf' });
            recoverHp(currentPlayer.id, 1);
            addLog('辛宪英发动「才识」，选择回复 1 点体力（本回合不能对自己使用牌）', 'skill');
          } else {
            const nextDelta = (currentPlayer.handLimitDelta ?? 0) + 1;
            updatePlayer(currentPlayer.id, { caiShiMode: 'limitOther', handLimitDelta: nextDelta });
            addLog(`辛宪英发动「才识」，手牌上限 +1（累计 +${nextDelta}，本回合不能对其他角色使用牌）`, 'skill');
          }
          showSkillBanner('辛宪英', '才识');
          await delay(350);
        }
        // 周瑜「英姿」：摸牌阶段额外摸一张
        const fumianExtra = currentPlayer.hero.name === '吴苋' && currentPlayer.fumianChoice === 1 && skillsOn(currentPlayer.id)
          ? (currentPlayer.fumianValue1 ?? 1) : 0;
        const drawCount = (currentPlayer.hero.name === '周瑜' ? 3 : 2) + fumianExtra;
        if (fumianExtra > 0) {
          addLog(`【福绵】吴苋摸牌阶段额外摸 ${fumianExtra} 张牌`, 'skill');
          showSkillBanner('吴苋', '福绵');
        }
        if (currentPlayer.hero.name === '周瑜') {
          addLog(`${currentPlayer.hero.name} 发动「英姿」，额外摸一张牌`, 'skill');
          showSkillBanner(currentPlayer.hero.name, '英姿');
        }
        // 兵粮寸断已在判定阶段结算，这里只按结果决定是否摸牌
        if (currentPlayer.hero.name === '张辽') {
          // 张辽「突袭」：不摸牌，改为获得至多两名其他角色的各一张手牌
          const candidates = playersRef.current
            .filter(p => !p.isDead && p.id !== currentPlayer.id && p.hand.length > 0)
            .sort((a, b) => b.hand.length - a.hand.length)
            .slice(0, 2);
          if (candidates.length > 0) {
            addLog(`${currentPlayer.hero.name} 发动「突袭」，改为获得其他角色的手牌`, 'skill');
            showSkillBanner(currentPlayer.hero.name, '突袭');
            for (const c of candidates) {
              const p = getPlayer(c.id);
              if (!p || p.hand.length === 0) continue;
              const stolen = p.hand[Math.floor(Math.random() * p.hand.length)];
              mutateHand(c.id, hand => hand.filter(x => x.id !== stolen.id));
              mutateHand(currentPlayer.id, hand => [...hand, stolen]);
              addLog(`${currentPlayer.hero.name} 获得 ${p.hero.name} 的一张手牌`, 'info');
              await delay(300);
            }
          } else {
            drawCards(currentPlayer.id, drawCount);
          }
        } else {
          let actualDraw = drawCount;
          // 许褚「裸衣」：手中有杀/决斗时少摸一张，本回合伤害+1（官方无体力下限，体力 1 也可发动）
          if (currentPlayer.hero.name === '许褚'
              && currentPlayer.hand.some(c => c.name === CardName.SHA || c.name === CardName.JUEDOU)) {
            actualDraw = Math.max(0, actualDraw - 1);
            luoyiPlayerRef.current = currentPlayer.id;
            addLog(`${currentPlayer.hero.name} 发动「裸衣」，少摸一张牌，本回合【杀】/【决斗】伤害+1`, 'skill');
            showSkillBanner(currentPlayer.hero.name, '裸衣');
          }
          drawCards(currentPlayer.id, actualDraw);
        }
        await delay(800);
        setPhase(GamePhase.ACTION);
      }

      // ACTION PHASE
      else if (currentPhase === GamePhase.ACTION) {
        // 判定阶段判定为非红桃：乐不思蜀生效，整个出牌阶段跳过
        if (judgeSkipRef.current.action) {
          judgeSkipRef.current.action = false;
          addLog(`${currentPlayer.hero.name} 受【乐不思蜀】影响，跳过出牌阶段！`, 'warning');
          await delay(600);
          setPhase(GamePhase.DISCARD);
          return;
        }
        // 王元姬「谦冲」：出牌阶段开始时，若装备区不全黑/不全红，选一种牌型本回合无次数与距离限制
        if (currentPlayer.hero.name === '王元姬' && skillsOn(currentPlayer.id)) {
          const p = getPlayer(currentPlayer.id)!;
          const allBlack = allEquipBlack(p);
          const allRed = allEquipRed(p);
          if (!allBlack && !allRed) {
            const counts = { basic: 0, trick: 0, equip: 0 };
            p.hand.forEach(c => {
              if (c.type === CardType.BASIC) counts.basic += 1;
              else if (c.type === CardType.SCROLL) counts.trick += 1;
              else counts.equip += 1;
            });
            const type = (Object.keys(counts) as Array<'basic' | 'trick' | 'equip'>)
              .sort((a, b) => counts[b] - counts[a])[0];
            updatePlayer(p.id, { qianchongType: type });
            const label = type === 'basic' ? '基本牌' : type === 'trick' ? '锦囊牌' : '装备牌';
            addLog(`【谦冲】王元姬选择「${label}」，本回合使用此类牌无次数与距离限制`, 'skill');
            showSkillBanner('王元姬', '谦冲');
            await delay(300);
          }
        }

        // 糜夫人「存嗣」：出牌阶段，移除此武将牌并令一名角色获得「勇决」，其摸两张牌
        if (currentPlayer.hero.name === '糜夫人' && skillsOn(currentPlayer.id)) {
          const p = getPlayer(currentPlayer.id);
          if (p && !p.generalRemoved) {
            const others = playersRef.current.filter(o => !o.isDead && o.id !== p.id);
            if (others.length > 0) {
              const target = others.slice().sort((a, b) => (isAlly(p, a) ? 0 : 1) - (isAlly(p, b) ? 0 : 1))[0];
              if (removeGeneralCard(p.id, '存嗣')) {
                grantSkill(target.id, '勇决', '存嗣');
                drawCards(target.id, 2);
                addLog(`【存嗣】${p.hero.name} 移除此武将牌，${target.hero.name} 获得技能「勇决」并摸两张牌`, 'skill');
                showSkillBanner('糜夫人', '存嗣');
                await delay(500);
              }
            }
          }
        }

        // 羊徽瑜「弘仪」：出牌阶段限一次，指定一名其他角色，直至你的下回合开始
        if (currentPlayer.hero.name === '羊徽瑜' && skillsOn(currentPlayer.id) && !hongyiUsedRef.current) {
          const p = getPlayer(currentPlayer.id)!;
          const others = playersRef.current.filter(o => !o.isDead && o.id !== p.id);
          if (others.length > 0) {
            const target = others.sort((a, b) => (isEnemy(p, a) ? 0 : 1) - (isEnemy(p, b) ? 0 : 1))[0];
            hongyiUsedRef.current = true;
            updatePlayer(p.id, { hongyiTargetId: target.id });
            addLog(`【弘仪】羊徽瑜指定 ${target.hero.name}，直至下回合开始其造成伤害时进行判定`, 'skill');
            showSkillBanner('羊徽瑜', '弘仪');
            await delay(300);
          }
        }

        // 张昌蒲「严教」：出牌阶段限一次，可将手牌中某花色的所有牌交给一名其他角色，然后对其造成1点伤害；
        // 下回合开始时摸回等量牌。人类由技能按钮发起（自选花色与目标），这里只处理 AI / 托管。
        if (currentPlayer.hero.name === '张昌蒲' && skillsOn(currentPlayer.id) && !yanjiaoUsedRef.current
            && !(currentPlayer.isHuman && !isAiTakeover)) {
          const p = getPlayer(currentPlayer.id);
          if (p && p.hand.length > 0) {
            const suits = [Suit.SPADE, Suit.HEART, Suit.CLUB, Suit.DIAMOND];
            const best = suits.map(s => ({ s, n: p.hand.filter(c => c.suit === s).length }))
              .sort((a, b) => b.n - a.n)[0];
            // 官方目标为「一名其他角色」：AI 优先打敌方，无敌方时也可给任意其他角色
            const others = playersRef.current.filter(o => !o.isDead && o.id !== p.id);
            if (best.n > 0 && others.length > 0) {
              const enemyList = others.filter(o => isEnemy(p, o));
              const target = (enemyList.length ? enemyList : others).sort((a, b) => a.hp - b.hp)[0];
              await doYanjiao(p.id, target.id, best.s);
              await delay(300);
            }
          }
        }

        // 胡金定「武缘」：出牌阶段限一次，交给其他角色一张【杀】，自己回复1点；红色其额外回复1，属性杀其额外摸一张
        if (currentPlayer.hero.name === '胡金定' && skillsOn(currentPlayer.id) && !wuyuanUsedRef.current) {
          const p = getPlayer(currentPlayer.id);
          const slash = p?.hand.find(c => c.name === CardName.SHA);
          const others = playersRef.current.filter(o => !o.isDead && o.id !== currentPlayer.id);
          if (p && slash && others.length > 0) {
            const target = others.slice().sort((a, b) => (isAlly(p, a) ? 0 : 1) - (isAlly(p, b) ? 0 : 1))[0];
            wuyuanUsedRef.current = true;
            mutateHand(p.id, h => h.filter(c => c.id !== slash.id));
            mutateHand(target.id, h => [...h, slash]);
            const red = slash.suit === Suit.HEART || slash.suit === Suit.DIAMOND;
            const elemental = !!slash.attribute;
            const healed = Math.min(p.maxHp, p.hp + 1);
            updatePlayer(p.id, { hp: healed });
            if (red) updatePlayer(target.id, { hp: Math.min(target.maxHp, target.hp + 1) });
            drawCards(target.id, 1 + (elemental ? 1 : 0));
            addLog(`【武缘】胡金定将【${slash.name}】交给 ${target.hero.name}，自己回复1点体力（${healed}/${p.maxHp}）${red ? '，其额外回复1点体力' : ''}${elemental ? '，其额外摸一张牌' : ''}`, 'skill');
            showSkillBanner('胡金定', '武缘');
            await delay(500);
          }
        }

        // 孙寒华「冲虚」：出牌阶段限一次，集灵获得真实分数（至多5分），再用分数升级妙剑/莲华或摸牌（人类由按钮自选）
        if (currentPlayer.hero.name === '孙寒华' && skillsOn(currentPlayer.id) && !chongxuUsedRef.current
            && !(currentPlayer.isHuman && !isAiTakeover)) {
          chongxuUsedRef.current = true;
          const p = getPlayer(currentPlayer.id);
          if (p) {
            let left = await performJiling(p.id);
            let mj = p.miaoJianLevel ?? 1;
            let lh = p.lianHuaLevel ?? 1;
            // 升级妙剑需 3 分 / 升级莲华需 3 分 / 摸一张牌需 2 分（可重复）
            while (true) {
              if (left >= 3 && mj < 3) {
                left -= 3; mj += 1;
                updatePlayer(p.id, { miaoJianLevel: mj });
                addLog(`孙寒华将 3 分用于升级「妙剑」：${mj - 1} → ${mj} 级（剩余 ${left} 分）`, 'skill');
              } else if (left >= 3 && lh < 3) {
                left -= 3; lh += 1;
                updatePlayer(p.id, { lianHuaLevel: lh });
                addLog(`孙寒华将 3 分用于升级「莲华」：${lh - 1} → ${lh} 级（剩余 ${left} 分）`, 'skill');
              } else if (left >= 2) {
                left -= 2;
                drawCards(p.id, 1);
                addLog(`孙寒华将 2 分用于摸一张牌（剩余 ${left} 分）`, 'skill');
              } else {
                break;
              }
              await delay(400);
            }
          }
        }

        // 孙寒华「妙剑」：出牌阶段限一次，按等级将牌当【无中生有】或【刺杀】使用（人类由按钮自选）
        if (currentPlayer.hero.name === '孙寒华' && skillsOn(currentPlayer.id) && !miaoJianUsedRef.current
            && !(currentPlayer.isHuman && !isAiTakeover)) {
          miaoJianUsedRef.current = true;
          const p = getPlayer(currentPlayer.id);
          if (p) {
            const lv = p.miaoJianLevel ?? 1;
            // 1 级：仅【杀】可当【刺杀】、仅锦囊牌可当【无中生有】；2 级起：任意基本/非基本牌
            const trick = lv === 1
              ? p.hand.find(c => c.type === CardType.SCROLL)
              : (lv >= 2 ? p.hand.find(c => c.type !== CardType.BASIC) : undefined);
            const slashCard = lv >= 2
              ? p.hand.find(c => c.type === CardType.BASIC)
              : p.hand.find(c => c.name === CardName.SHA);
            if (lv >= 3 || trick) {
              if (lv >= 3) {
                addLog('孙寒华发动「妙剑」，视为使用一张【无中生有】', 'skill');
              } else if (trick) {
                mutateHand(p.id, h => h.filter(c => c.id !== trick.id));
                addLog(`孙寒华发动「妙剑」，将【${trick.name}】当【无中生有】使用`, 'skill');
              }
              showSkillBanner('孙寒华', '妙剑');
              await delay(400);
              drawCards(p.id, 2);
            } else if (slashCard) {
              const foes = playersRef.current.filter(o => !o.isDead && o.id !== p.id && isEnemy(p, o) && canReach(p, o));
              if (foes.length) {
                const foe = [...foes].sort((a, b) => a.hp - b.hp)[0];
                mutateHand(p.id, h => h.filter(c => c.id !== slashCard.id));
                addLog(`孙寒华发动「妙剑」，将【${slashCard.name}】当【刺杀】对 ${foe.hero.name} 使用`, 'skill');
                showSkillBanner('孙寒华', '妙剑');
                await delay(400);
                const meNow = getPlayer(p.id);
                const foeNow = getPlayer(foe.id);
                if (meNow && foeNow) {
                  const virtualSlash: Card = {
                    id: `miaojian-${p.id}-${Date.now()}`,
                    name: CardName.SHA,
                    type: CardType.BASIC,
                    suit: Suit.SPADE,
                    rank: 'K',
                    value: 13,
                    description: '妙剑：视为使用一张【刺杀】',
                    imageColor: 'from-slate-700 to-slate-900',
                    cisha: true,
                  };
                  await combat.resolveCardEffect(meNow, [foeNow], virtualSlash);
                }
              }
            }
          }
        }

        // 鲍三娘「许身」：限定技，出牌阶段失去等同存活男性角色数的体力；
        // 若因此进入濒死，脱离濒死后救援者可获得「武圣」「当先」
        if (currentPlayer.hero.name === '鲍三娘' && skillsOn(currentPlayer.id) && !currentPlayer.xushenUsed) {
          const males = playersRef.current.filter(o => !o.isDead && o.id !== currentPlayer.id && o.hero.gender === 'male').length;
          // 防自杀保护：只有「友方且持有【桃】/【酒】」才算真正可救（敌方/内奸即便有桃也不会救）
          const willingSavior = playersRef.current.some(p => !p.isDead && p.id !== currentPlayer.id
            && isAlly(currentPlayer, p)
            && (p.hand.some(c => c.name === CardName.TAO) || p.hand.some(c => c.name === CardName.JIU)));
          const lethal = currentPlayer.hp === males;
          if (DEV_BUILD && males > 0 && lethal && !willingSavior) {
            addLog(`【许身】防自杀保护：体力 ${currentPlayer.hp} 将因失去 ${males} 点体力进入濒死，且无友方可救，自动不发动`, 'info');
          }
          if (males > 0 && (currentPlayer.hp >= males + 1 || (lethal && willingSavior))) {
            let go = true;
            if (currentPlayer.isHuman && !isAiTakeover) {
              const pick = await requestSkillChoice({
                skill: '许身', owner: '鲍三娘',
                title: `是否发动「许身」失去 ${males} 点体力？${lethal ? '（将进入濒死，由友方救援）' : ''}`,
                mode: 'choose',
                choices: [{ id: 'yes', label: `发动许身（失去 ${males} 点体力${lethal ? '，进入濒死' : ''}）` }],
                cancelLabel: '不发动',
              }, true);
              go = !!(pick && pick.kind === 'choose' && pick.id === 'yes');
              if (!go) addLog('【许身】鲍三娘选择不发动', 'info');
            }
            if (go) {
              const nextHp = currentPlayer.hp - males;
              updatePlayer(currentPlayer.id, { xushenUsed: true, hp: nextHp });
              addLog(`【许身】鲍三娘失去 ${males} 点体力（存活男性角色数），当前体力 ${Math.max(0, nextHp)}/${currentPlayer.maxHp}`, 'skill');
              showSkillBanner('鲍三娘', '许身');
              if (nextHp <= 0) {
                xushenDyingRef.current = { id: currentPlayer.id };
                addLog(`【许身】鲍三娘因此进入濒死状态`, 'danger');
                // 让体力变更先提交，避免 askForPeaches 读到旧体力而静默跳过濒死流程
                // （delay 受速度倍率压缩，3x 下 200ms 仅 ~67ms，这里改为轮询 ref 直到体力真正落库）
                for (let wait = 0; wait < 12 && (getPlayer(currentPlayer.id)?.hp ?? 0) > 0; wait++) {
                  await delay(150);
                }
                const saved = await combat.askForPeaches(currentPlayer.id);
                if (!saved) {
                  addLog(`鲍三娘 未能得到救援，死亡！`, 'danger');
                  await handleDeath(currentPlayer.id);
                  setPhase(GamePhase.END);
                  return;
                }
              }
              await delay(400);
            }
          }
        }

        // 陆郁生「润微」：出牌阶段限一次，展示牌堆顶至多五张，令一名角色获得其中一种颜色的所有牌
        if (currentPlayer.hero.name === '陆郁生' && skillsOn(currentPlayer.id)) {
          const doRunwei = async (excludeIds: number[]): Promise<number> => {
            const top = deckRef.current.slice(0, 5);
            if (top.length === 0) return 0;
            const red = top.filter(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
            const black = top.filter(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
            const picked = red.length >= black.length ? red : black;
            if (picked.length === 0) return 0;
            const allies = playersRef.current
              .filter(p => !p.isDead && p.id !== currentPlayer.id && isAlly(currentPlayer, p) && !excludeIds.includes(p.id))
              .sort((a, b) => a.hand.length - b.hand.length);
            let target = allies[0];
            if (!target) {
              if (excludeIds.includes(currentPlayer.id)) return 0;
              target = currentPlayer;
            }
            const rest = top.filter(c => !picked.some(pc => pc.id === c.id));
            setDeck(prev => prev.slice(top.length));
            deckRef.current = deckRef.current.slice(top.length);
            if (rest.length > 0) {
              setDiscardPile(prev => {
                const next = [...prev, ...rest];
                discardPileRef.current = next;
                return next;
              });
            }
            mutateHand(target.id, h => [...h, ...picked]);
            runweiGiftRef.current.push({ targetId: target.id, ids: picked.map(c => c.id) });
            if (runweiBlockedRef.current.turn !== turnCountRef.current) {
              runweiBlockedRef.current = { turn: turnCountRef.current, ids: [] };
            }
            runweiBlockedRef.current.ids.push(target.id);
            addLog(`【润微】陆郁生展示牌堆顶 ${top.length} 张，令 ${target.hero.name} 获得${red.length >= black.length ? '红' : '黑'}色牌 ${picked.map(c => `【${c.name}】`).join('、')}`, 'skill');
            showSkillBanner('陆郁生', '润微');
            await delay(450);
            return picked.length;
          };

          if (!runweiUsedRef.current) {
            runweiUsedRef.current = true;
            const gained = await doRunwei([]);
            if (gained > 0) {
              runweiExtraRef.current = { turn: turnCountRef.current, lossX: gained, lost: 0 };
              runweiSecondFireRef.current = async (blocked: number[]) => await doRunwei(blocked);
            }
          }

          // 失去 X 张牌后的再次发动：由 discardCards 事件钩子（用牌/弃置）累加 lost，
          // 达到 lossX 时直接调用 runweiSecondFireRef（本阶段限一次，且排除已获得过牌的角色）
        }

        // 赵襄「芳魂」：移去 1 个「梅影」，发动「龙胆」将【闪】当【杀】使用，结算后摸一张牌
        if (currentPlayer.hero.name === '赵襄' && skillsOn(currentPlayer.id)
            && (!currentPlayer.isHuman || isAiTakeover)) {
          let guard = 0;
          while (guard < 2) {
            const me = getPlayer(currentPlayer.id);
            if (!me || (me.meiyanMarks ?? 0) <= 0) break;
            if (me.hand.some(c => c.name === CardName.SHA)) break;
            const shan = me.hand.find(c => c.name === CardName.SHAN);
            if (!shan) break;
            const foe = playersRef.current
              .filter(p => !p.isDead && p.id !== me.id && isEnemy(me, p)
                && getDistance(me.id, p.id) <= getAttackRange(me))
              .sort((a, b) => a.hp - b.hp)[0];
            if (!foe) break;
            mutateHand(me.id, h => h.filter(c => c.id !== shan.id));
            updatePlayer(me.id, { meiyanMarks: (me.meiyanMarks ?? 0) - 1 });
            addLog(`【芳魂】赵襄移去 1 个「梅影」，发动「龙胆」将【闪】当【杀】对 ${foe.hero.name} 使用`, 'skill');
            showSkillBanner('赵襄', '芳魂');
            const virtualSlash: Card = {
              ...shan,
              id: `zhaoxiang-dragon-${shan.id}-${Date.now()}`,
              name: CardName.SHA,
              type: CardType.BASIC,
              description: '闪当杀',
            };
            await combat.resolveCardEffect(me, [foe], virtualSlash);
            drawCards(me.id, 1);
            addLog('【芳魂】龙胆结算后赵襄摸一张牌', 'skill');
            guard++;
            await delay(250);
          }
        }

        // 辛宪英「忠鉴」：出牌阶段限一次（点数相同改为限两次），展示比拼颜色/点数
        if (currentPlayer.hero.name === '辛宪英' && skillsOn(currentPlayer.id)) {
          let guard = 0;
          while (guard < 2) {
            const me = getPlayer(currentPlayer.id);
            if (!me || (me.zhongjianCount ?? 0) >= (me.zhongjianLimit ?? 1)) break;
            const target = playersRef.current
              .filter(p => !p.isDead && p.id !== me.id && isEnemy(me, p) && p.hand.length > p.hp)
              .sort((a, b) => (b.hand.length - b.hp) - (a.hand.length - a.hp))[0];
            if (!target) break;
            const x = target.hand.length - target.hp;
            const shown = [...target.hand].sort((a, b) => a.value - b.value).slice(0, x);
            const isRed = (c: Card) => c.suit === Suit.HEART || c.suit === Suit.DIAMOND;
            // 展示自己一张牌：优先能与对方同点数/同颜色的牌，其次低价值牌
            const own = [...me.hand].sort((a, b) => {
              const score = (c: Card) =>
                (shown.some(s => s.rank === c.rank) ? 4 : 0) + (shown.some(s => isRed(s) === isRed(c)) ? 2 : 0);
              return score(b) - score(a) || a.value - b.value;
            })[0];
            if (!own) break;
            const colorSame = shown.some(c => isRed(c) === isRed(own));
            const rankSame = shown.some(c => c.rank === own.rank);
            updatePlayer(me.id, {
              zhongjianCount: (me.zhongjianCount ?? 0) + 1,
              zhongjianLimit: rankSame ? 2 : (me.zhongjianLimit ?? 1),
            });
            addLog(`【忠鉴】辛宪英展示【${own.name}】(${own.suit}${own.rank})，${target.hero.name} 展示 ${shown.map(c => `【${c.name}】(${c.suit}${c.rank})`).join('、')}`, 'skill');
            showSkillBanner('辛宪英', '忠鉴');
            if (rankSame) addLog('【忠鉴】双方展示牌点数相同，本回合「忠鉴」改为限两次', 'skill');
            if (colorSame) {
              // 颜色相同：摸一张牌 或 弃置其一张展示牌（人类弹窗选择；AI 按溢出程度判断）
              let chooseDiscard = false;
              if (currentPlayer.isHuman) {
                const pick = await requestSkillChoice({
                  skill: '忠鉴',
                  owner: '辛宪英',
                  title: `【忠鉴】双方展示牌颜色相同，请选择：摸一张牌，或弃置 ${target.hero.name} 的一张展示牌`,
                  hint: '颜色相同触发：可摸一张牌，也可弃置其一张牌',
                  mode: 'choose',
                  choices: [
                    { id: 'draw', label: '摸一张牌', desc: '辛宪英摸一张牌' },
                    { id: 'discard', label: '弃置其一张牌', desc: `弃置 ${target.hero.name} 一张展示牌` },
                  ],
                  cancelLabel: '摸一张牌',
                }, true);
                chooseDiscard = !!pick && pick.kind === 'choose' && pick.id === 'discard';
                if (pick && pick.kind === 'timeout') {
                  chooseDiscard = (target.hand.length - target.hp) >= 2;
                }
              } else {
                // AI：目标手牌溢出 2 张及以上时弃置，否则摸牌
                chooseDiscard = (target.hand.length - target.hp) >= 2;
              }
              if (chooseDiscard) {
                const victimCard = [...shown].sort((a, b) => b.value - a.value)[0];
                discardCards(target.id, [victimCard]);
                addLog(`【忠鉴】辛宪英选择弃置 ${target.hero.name} 的【${victimCard.name}】`, 'info');
              } else {
                drawCards(me.id, 1);
                addLog('【忠鉴】辛宪英选择摸一张牌', 'success');
              }
            }
            if (!colorSame && !rankSame) {
              const prevDelta = me.handLimitDelta ?? 0;
              updatePlayer(me.id, { handLimitDelta: prevDelta - 1 });
              addLog(`【忠鉴】双方展示牌颜色与点数都不同，辛宪英手牌上限 -1（累计 ${prevDelta} → ${prevDelta - 1}）`, 'danger');
            }
            await delay(350);
            guard++;
          }
        }

        // 董白「连诛」：出牌阶段限一次，展示并交给一名其他角色一张牌；若为黑色，其选择让董白摸两张或自己弃两张
        if (currentPlayer.hero.name === '董白' && skillsOn(currentPlayer.id) && !lianzhuUsedRef.current) {
          const me = getPlayer(currentPlayer.id);
          if (me && me.hand.length >= 2) {
            const card = [...me.hand].sort((a, b) => a.value - b.value)[0];
            const rival = playersRef.current
              .filter(p => !p.isDead && p.id !== me.id && isEnemy(me, p))
              .sort((a, b) => b.hand.length - a.hand.length)[0];
            const target = rival ?? playersRef.current.find(p => !p.isDead && p.id !== me.id);
            if (target) {
              lianzhuUsedRef.current = true;
              mutateHand(me.id, h => h.filter(c => c.id !== card.id));
              mutateHand(target.id, h => [...h, card]);
              lockXiaohuiCards(me.id, target.id, [card]);
              addLog(`【连诛】董白展示并交给 ${target.hero.name} 【${card.name}】`, 'skill');
              showSkillBanner('董白', '连诛');
              await delay(400);
              const black = card.suit === Suit.SPADE || card.suit === Suit.CLUB;
              if (black) {
                const targetNow = getPlayer(target.id);
                if (targetNow && isEnemy(targetNow, me) && targetNow.hand.length >= 2) {
                  discardCards(targetNow.id, targetNow.hand.slice(0, 2));
                  addLog(`【连诛】${targetNow.hero.name} 选择弃置两张牌`, 'skill');
                } else {
                  drawCards(me.id, 2);
                  addLog('【连诛】董白摸两张牌', 'skill');
                }
                await delay(300);
              }
            }
          }
        }

        // 孙鲁育「魅步」：其他角色出牌阶段开始时，若孙鲁育在其攻击范围内，可弃一张牌令其本回合获得「止息」
        {
          const luyu = playersRef.current.find(p => !p.isDead && p.id !== currentPlayer.id
            && p.hero.name === '孙鲁育' && skillsOn(p.id));
          if (luyu && luyu.hand.length >= 2 && isEnemy(luyu, currentPlayer)
              && getDistance(currentPlayer.id, luyu.id) <= getAttackRange(currentPlayer)) {
            // AI：优先弃【杀】或黑色锦囊，避免把「距离为1」的副作用送给对方；无则弃非关键牌
            const prefer = luyu.hand.find(c => c.name === CardName.SHA
                || (c.type === CardType.SCROLL && (c.suit === Suit.SPADE || c.suit === Suit.CLUB)))
              ?? luyu.hand.find(c => c.name !== CardName.TAO && c.name !== CardName.SHAN);
            if (prefer) {
              discardCards(luyu.id, [prefer]);
              // 「止息」：至多使用 X 张牌（X 为体力值），使用锦囊牌后结束出牌阶段
              zhixiRef.current = { id: currentPlayer.id, limit: Math.max(1, currentPlayer.hp), used: 0, trickUsed: false };
              addLog(`【魅步】孙鲁育弃置【${prefer.name}】，令 ${currentPlayer.hero.name} 本回合获得「止息」（至多使用 ${currentPlayer.hp} 张牌，使用锦囊后结束出牌阶段）`, 'skill');
              showSkillBanner('孙鲁育', '魅步');
              if (!(prefer.name === CardName.SHA
                  || (prefer.type === CardType.SCROLL && (prefer.suit === Suit.SPADE || prefer.suit === Suit.CLUB)))) {
                meibuDistanceRef.current[currentPlayer.id] = luyu.id;
                addLog(`【魅步】弃置的牌不是【杀】或黑色锦囊牌，本回合 ${currentPlayer.hero.name} 与孙鲁育的距离为 1`, 'info');
              }
              await delay(300);
            }
          }
        }

        // 孙鲁育「穆穆」：出牌阶段开始时，弃置场上一张装备牌，或获得场上一张防具牌（后者本回合不能使用【杀】）
        if (currentPlayer.hero.name === '孙鲁育' && skillsOn(currentPlayer.id)) {
          const rivals = playersRef.current.filter(p => !p.isDead && p.id !== currentPlayer.id && isEnemy(currentPlayer, p));
          const rivalEquips: { ownerId: number; owner: string; card: Card }[] = [];
          for (const r of rivals) {
            for (const c of Object.values(r.equipment ?? {})) {
              if (c) rivalEquips.push({ ownerId: r.id, owner: r.hero.name, card: c as Card });
            }
          }
          if (rivalEquips.length > 0) {
            // AI 取舍：优先拆敌方武器/防具，收益高于自己拿防具后不能出【杀】的代价
            const pick = rivalEquips.find(e => EQUIP_META[e.card.name]?.slot === 'armor')
              ?? rivalEquips.find(e => EQUIP_META[e.card.name]?.slot === 'weapon')
              ?? rivalEquips[0];
            const slot = EQUIP_META[pick.card.name]?.slot;
            const owner = getPlayer(pick.ownerId);
            if (slot && owner) {
              updatePlayerWith(owner.id, p => {
                const nextEquip = { ...(p.equipment ?? {}) };
                delete nextEquip[slot];
                return { equipment: nextEquip };
              });
              addLog(`孙鲁育发动「穆穆」，弃置 ${pick.owner} 的【${pick.card.name}】`, 'skill');
              showSkillBanner('孙鲁育', '穆穆');
              await delay(300);
            }
          } else if (!getPlayer(currentPlayer.id)?.equipment?.armor) {
            const armorOwner = playersRef.current.find(p => !p.isDead && p.id !== currentPlayer.id
              && (p.equipment?.armor as Card | undefined) && isAlly(currentPlayer, p));
            if (armorOwner?.equipment?.armor) {
              const armor = armorOwner.equipment.armor;
              updatePlayerWith(armorOwner.id, p => {
                const nextEquip = { ...(p.equipment ?? {}) };
                delete nextEquip.armor;
                return { equipment: nextEquip };
              });
              updatePlayerWith(currentPlayer.id, p => ({
                equipment: { ...(p.equipment ?? {}), armor },
              }));
              addLog(`孙鲁育发动「穆穆」，获得 ${armorOwner.hero.name} 的【${armor.name}】，本回合不能使用或打出【杀】`, 'skill');
              showSkillBanner('孙鲁育', '穆穆');
              // 禁【杀】实际生效：本回合该角色不能使用或打出【杀】
              mumuNoSlashRef.current = currentPlayer.id;
              await delay(300);
            }
          }
        }

        // 蔡夫人「献州」：限定技，出牌阶段将装备区所有牌交给一名其他角色，
        // 然后其选择：令蔡夫人回复 X 点体力，或对其攻击范围内至多 X 名角色各造成 1 点伤害
        if (currentPlayer.hero.name === '蔡夫人' && skillsOn(currentPlayer.id) && !currentPlayer.xianzhouUsed) {
          const equips = Object.values(currentPlayer.equipment ?? {}).filter((c): c is Card => !!c);
          const wantUse = equips.length > 0 && (currentPlayer.hp < currentPlayer.maxHp || equips.length >= 2);
          if (wantUse) {
            const ally = playersRef.current
              .filter(p => !p.isDead && p.id !== currentPlayer.id && isAlly(currentPlayer, p))
              .sort((a, b) => a.hp - b.hp)[0];
            const receiver = ally ?? playersRef.current.find(p => !p.isDead && p.id !== currentPlayer.id);
            if (receiver) {
              updatePlayer(currentPlayer.id, { equipment: {}, xianzhouUsed: true });
              mutateHand(receiver.id, h => [...h, ...equips]);
              const x = equips.length;
              addLog(`【献州】蔡夫人将装备区的 ${x} 张牌交给 ${receiver.hero.name}（${equips.map(c => `【${c.name}】`).join('、')}）`, 'skill');
              showSkillBanner('蔡夫人', '献州');
              await delay(400);
              // 受牌者 AI 选择：盟友且蔡夫人已受伤则回复；否则对攻击范围内的敌人造成伤害
              const caifurenNow = getPlayer(currentPlayer.id);
              const receiverNow = getPlayer(receiver.id);
              if (caifurenNow && receiverNow && isAlly(receiverNow, caifurenNow)
                  && caifurenNow.hp < caifurenNow.maxHp) {
                const heal = Math.min(x, caifurenNow.maxHp - caifurenNow.hp);
                recoverHp(caifurenNow.id, heal);
                addLog(`【献州】${receiverNow.hero.name} 令蔡夫人回复 ${heal} 点体力`, 'skill');
              } else if (receiverNow) {
                const victims = playersRef.current
                  .filter(p => !p.isDead && p.id !== receiverNow.id && isEnemy(receiverNow, p)
                    && getDistance(receiverNow.id, p.id) <= getAttackRange(receiverNow))
                  .sort((a, b) => a.hp - b.hp)
                  .slice(0, x);
                for (const t of victims) {
                  addLog(`【献州】${receiverNow.hero.name} 对 ${t.hero.name} 造成 1 点伤害`, 'skill');
                  await combat.takeDamage(t.id, receiverNow.id, 1);
                  await delay(250);
                }
              }
              await delay(300);
            }
          }
        }

        // 夏侯氏「燕语」（出牌阶段部分）：重铸【杀】（弃一张【杀】后摸一张牌），每阶段至多两张
        if (currentPlayer.hero.name === '夏侯氏' && skillsOn(currentPlayer.id)) {
          let guard = 0;
          while (yanyuCountRef.current < 2 && guard < 2) {
            const me = getPlayer(currentPlayer.id);
            if (!me) break;
            const shas = me.hand.filter(c => c.name === CardName.SHA);
            // AI 取舍：通常留一张【杀】用于进攻；手牌充足时才把最后一张也重铸换质量
            const keepOne = me.hand.length >= 5 ? 0 : 1;
            if (shas.length <= keepOne) break;
            const card = [...shas].sort((a, b) => a.value - b.value)[0];
            mutateHand(me.id, h => h.filter(c => c.id !== card.id));
            addLog(`夏侯氏发动「燕语」，重铸【杀】（弃置【${card.name}】并摸一张牌）`, 'skill');
            showSkillBanner('夏侯氏', '燕语');
            drawCards(me.id, 1);
            yanyuCountRef.current += 1;
            guard++;
            await delay(300);
          }
        }

        // 徐氏「问卦」：所有角色出牌阶段限一次，可交给徐氏一张牌；徐氏将其置于牌堆顶或牌堆底，双方从另一端各摸一张
        const xushi = playersRef.current.find(p => !p.isDead && p.id !== currentPlayer.id
          && p.hero.name === '徐氏' && skillsOn(p.id));
        if (xushi && currentPlayer.hand.length > 0) {
          let gift: Card | null = null;
          if (currentPlayer.isHuman && !isAiTakeover) {
            // 人类给牌者：自选一张交给徐氏，或放弃
            const pick = await requestSkillChoice({
              skill: '问卦',
              owner: '徐氏',
              title: '是否交给徐氏一张牌？（徐氏置于牌堆顶/底，你与其从另一端各摸一张）',
              mode: 'card',
              cards: currentPlayer.hand,
              min: 1,
              max: 1,
              cancelLabel: '不发动',
            }, true);
            if (pick && pick.kind === 'card') gift = currentPlayer.hand.find(c => c.id === pick.ids[0]) ?? null;
          } else if (isAlly(currentPlayer, xushi)) {
            // AI 给牌者：仍是友方才愿意交出最便宜的一张
            gift = [...currentPlayer.hand].sort((a, b) => a.value - b.value)[0];
          }
          if (gift) {
            const giftCard = gift;
            mutateHand(currentPlayer.id, h => h.filter(c => c.id !== giftCard.id));
            let placeTop = false;
            if (xushi.isHuman && !isAiTakeover) {
              const pick = await requestSkillChoice({
                skill: '问卦',
                owner: '徐氏',
                title: `【问卦】将 ${currentPlayer.hero.name} 的【${giftCard.name}】置于牌堆顶还是牌堆底？`,
                mode: 'choose',
                choices: [
                  { id: 'top', label: '置于牌堆顶（双方从牌堆底各摸一张）' },
                  { id: 'bottom', label: '置于牌堆底（双方从牌堆顶各摸一张）' },
                ],
                cancelLabel: '置于牌堆底',
              }, true);
              placeTop = !!(pick && pick.kind === 'choose' && pick.id === 'top');
            }
            if (placeTop) {
              // 牌堆顶 = 数组末尾（摸牌从末尾取）
              setDeck(prev => {
                const next = [...prev, giftCard];
                deckRef.current = next;
                return next;
              });
            } else {
              // 牌堆底 = 数组开头
              setDeck(prev => {
                const next = [giftCard, ...prev];
                deckRef.current = next;
                return next;
              });
            }
            addLog(`【问卦】${currentPlayer.hero.name} 交给徐氏【${giftCard.name}】，徐氏将其置于牌堆${placeTop ? '顶' : '底'}`, 'skill');
            showSkillBanner('徐氏', '问卦');
            if (placeTop) {
              // 置于牌堆顶：双方从牌堆底（数组开头）各摸一张
              for (const pid of [xushi.id, currentPlayer.id]) {
                const now = deckRef.current;
                const bottom = now[0];
                if (!bottom) break;
                const next = now.slice(1);
                setDeck(next);
                deckRef.current = next;
                mutateHand(pid, h => [...h, bottom]);
              }
            } else {
              drawCards(xushi.id, 1);
              drawCards(currentPlayer.id, 1);
            }
            await delay(350);
          }
        }

        // 何太后「鸩毒」：其他角色出牌阶段开始时，弃一张手牌令其视为使用【酒】，然后对其造成1点伤害
        const hetai = playersRef.current.find(p => !p.isDead && p.hero.name === '何太后'
          && p.id !== currentPlayer.id && skillsOn(p.id));
        if (hetai && hetai.hand.length > 0 && isEnemy(hetai, currentPlayer)) {
          const cheap = [...hetai.hand].sort((a, b) => {
            const ai = a.type === CardType.BASIC ? 0 : 1;
            const bi = b.type === CardType.BASIC ? 0 : 1;
            return ai - bi || a.value - b.value;
          })[0];
          discardCards(hetai.id, [cheap]);
          addLog(`何太后发动「鸩毒」，弃置【${cheap.name}】，令 ${currentPlayer.hero.name} 视为使用【酒】`, 'skill');
          showSkillBanner('何太后', '鸩毒');
          if (!window.jiuBoost) window.jiuBoost = {};
          window.jiuBoost[currentPlayer.id] = true;
          await delay(400);
          await combat.takeDamage(currentPlayer.id, hetai.id, 1);
        }

        // 邹氏「祸水」：出牌阶段明置武将牌（本回合其他角色不能明置）
        if (currentPlayer.hero.name === '邹氏' && !zoushiRevealedRef.current.has(currentPlayer.id)
            && skillsOn(currentPlayer.id)) {
          zoushiRevealedRef.current.add(currentPlayer.id);
          setGeneralRevealed(currentPlayer.id, true, '祸水', true);
          addLog('邹氏发动「祸水」，明置武将牌（本回合其他角色不能明置）', 'skill');
          showSkillBanner('邹氏', '祸水');
          await delay(400);
        }

        // 乐不思蜀已在判定阶段结算（judgeSkipRef.action）；「惴恐」获胜只限制目标，不再跳过出牌阶段
        // AI or Human Auto-Takeover
        if (!currentPlayer.isHuman || isAiTakeover) {
          await cpuAI(currentPlayer);
        }
        // If human and not takeover, we wait for UI interaction.
      }
      
      // DISCARD PHASE
      else if (currentPhase === GamePhase.DISCARD) {
        // 更新ref中的最新状态
        playersRef.current = players;
        const updatedPlayer = getPlayer(turnIndex);
        if (!updatedPlayer) return;
        
        const rawExcess = updatedPlayer.hand.length - updatedPlayer.hp;
        const excess = excessCards(updatedPlayer);
        dbgMark(`discard:enter:${updatedPlayer.hero.name}:excess=${excess}`);
        if (updatedPlayer.hero.name === '诸葛果' && rawExcess > excess) {
          addLog(`${updatedPlayer.hero.name} 发动「羽化」，非基本牌不计入手牌上限（应弃 ${excess} 张，原为 ${rawExcess} 张）`, 'skill');
          if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true) {
            (window as unknown as { __r4yuhua?: Record<string, unknown> }).__r4yuhua = {
              ...((window as unknown as { __r4yuhua?: Record<string, unknown> }).__r4yuhua || {}),
              discardHit: true, rawExcess, excess,
            };
          }
        }
        if (updatedPlayer.hero.name === '董白' && rawExcess > excess) {
          addLog(`董白「黠慧」：黑色牌不计入手牌上限（应弃 ${excess} 张，原为 ${rawExcess} 张）`, 'skill');
        }
        if (updatedPlayer.hero.name === '胡金定' && updatedPlayer.hand.length > updatedPlayer.maxHp && rawExcess > excess) {
          addLog(`胡金定 发动「怀子」，手牌上限视为体力上限（应弃 ${excess} 张，原为 ${rawExcess} 张）`, 'skill');
        }
        
        // 吕蒙「克己」：本回合出牌阶段未使用【杀】，可跳过弃牌阶段
        if (updatedPlayer.hero.name === '吕蒙' && (slashUsageRef.current[updatedPlayer.id] ?? 0) === 0) {
          if (excess > 0) {
            addLog(`${updatedPlayer.hero.name} 发动「克己」，本回合未出【杀】，跳过弃牌阶段`, 'skill');
            showSkillBanner(updatedPlayer.hero.name, '克己');
            await delay(500);
          }
          setPhase(GamePhase.END);
        } else if (updatedPlayer.isHuman && !isAiTakeover) {
           if (excess <= 0) {
             // Auto skip if no need to discard
             setPhase(GamePhase.END);
           } else {
             // Wait for human to discard
             if (selectedCardIds.length === 0) {
                // Warning handled in UI render or user patience
             }
           }
        } else {
          // AI or Auto Discard：弃牌前同样有思考光环
          await aiThink(updatedPlayer.id, 1000);
          dbgMark('discard:afterThink');
          if (excess > 0) {
            // 更新ref中的最新状态
            playersRef.current = players;
            const finalPlayer = getPlayer(turnIndex);
            if (finalPlayer) {
              const finalExcess = excessCards(finalPlayer);
              if (finalExcess > 0) {
                // AI 智能弃牌：优先弃置低价值牌，保留桃/闪/杀等关键牌
                // AI 弃牌：困难保留桃/闪/无懈/酒等关键牌；简单有概率乱弃
                const difficulty = aiDifficultyRef.current;
                const keepValue = (c: Card) => {
                  switch (c.name) {
                    case CardName.TAO: return 0;   // 桃必留
                    case CardName.SHAN: return difficulty === 'hard' ? 0.5 : 1;
                    case CardName.WUXIE: return difficulty === 'hard' ? 0.8 : 3;
                    case CardName.SHA: return 2;
                    case CardName.WUZHONG: return 3;
                    case CardName.JIU: return difficulty === 'hard' ? 2.5 : 4;
                    default: return 6;
                  }
                };
                const discarded = (difficulty === 'easy' && Math.random() < 0.35)
                  ? [...finalPlayer.hand].sort(() => Math.random() - 0.5).slice(0, finalExcess)
                  : [...finalPlayer.hand].sort((a, b) => keepValue(b) - keepValue(a)).slice(0, finalExcess);
                discardCards(finalPlayer.id, discarded);
                addLog(`${finalPlayer.hero.name} 弃置了 ${finalExcess} 张牌。`, 'info');
              }
            }
          }
          dbgMark('discard:setEnd');
          setPhase(GamePhase.END);
        }
      }

      // END PHASE
      else if (currentPhase === GamePhase.END) {
        dbgMark('end:enter');
        await delay(500);

        // 许身授予的「武圣」「当先」：持续到救援者的下回合结束
        {
          const grantedTurn = xushenGrantTurnsRef.current[currentPlayer.id];
          if (grantedTurn !== undefined && turnCountRef.current > grantedTurn) {
            delete xushenGrantTurnsRef.current[currentPlayer.id];
            const stillOwner = getPlayer(currentPlayer.id);
            if (stillOwner) {
              revokeSkill(currentPlayer.id, '武圣', '许身到期');
              revokeSkill(currentPlayer.id, '当先', '许身到期');
              addLog(`【许身】${stillOwner.hero.name} 的下回合结束，「武圣」「当先」消失`, 'info');
            }
          }
        }

        // 王元姬「尚俭」：任一角色结束阶段，若本回合失去的牌数不大于体力值，摸等量牌
        {
          const wj = playersRef.current.find(p => !p.isDead && p.hero.name === '王元姬' && skillsOn(p.id));
          if (wj) {
            const lost = wj.lostCardsThisTurn ?? 0;
            if (lost > 0 && lost <= wj.hp) {
              updatePlayer(wj.id, { lostCardsThisTurn: 0 });
              drawCards(wj.id, lost);
              addLog(`【尚俭】王元姬本回合失去 ${lost} 张牌（不大于体力 ${wj.hp}），摸 ${lost} 张牌`, 'skill');
              showSkillBanner('王元姬', '尚俭');
              await delay(400);
            }
          }
        }

        // 花鬘「芳踪」：结束阶段，将手牌摸至X张（X为场上存活人数；嬉战弃牌则本回合失效）
        if (currentPlayer.hero.name === '花鬘' && skillsOn(currentPlayer.id)
            && fangzongDisabledTurnRef.current !== turnCountRef.current) {
          const hm = getPlayer(currentPlayer.id);
          if (hm) {
            const alive = playersRef.current.filter(p => !p.isDead).length;
            const need = Math.max(0, alive - hm.hand.length);
            if (need > 0) {
              drawCards(hm.id, need);
              addLog(`【芳踪】花鬘 结束阶段将手牌摸至 ${alive} 张（摸 ${need} 张）`, 'skill');
              showSkillBanner('花鬘', '芳踪');
              await delay(400);
            }
          }
        }

        // 诸葛果「羽化」结束阶段分支：若手牌数大于体力值，观看牌堆顶 X 张（X 为手牌类别数），
        // 将任意数量置于牌堆顶，其余置于牌堆底。
        if (currentPlayer.hero.name === '诸葛果' && skillsOn(currentPlayer.id)) {
          const zg = getPlayer(currentPlayer.id);
          if (zg && zg.hand.length > zg.hp) {
            const typeCount = new Set(zg.hand.map(c => c.type)).size;
            const x = Math.min(5, Math.max(1, typeCount));
            const deckNow = [...deckRef.current];
            const viewed = deckNow.slice(-x).reverse();
            if (viewed.length > 0) {
              const pick = await requestSkillChoice({
                skill: '羽化',
                owner: '诸葛果',
                title: `结束阶段：手牌 ${zg.hand.length} 多于体力 ${zg.hp}，观看牌堆顶 ${viewed.length} 张`,
                hint: '选中的牌置于牌堆顶（下一张先摸到），未选中的置于牌堆底',
                mode: 'card',
                cards: viewed,
                min: 0,
                max: viewed.length,
                cancelLabel: '全部放回牌堆顶',
              }, currentPlayer.isHuman);
              const pickedIds = pick && pick.kind === 'card' ? pick.ids : null;
              const topCards = pickedIds ? viewed.filter(c => pickedIds.includes(c.id)) : viewed;
              const bottomCards = viewed.filter(c => !topCards.includes(c));
              const restDeck = deckNow.slice(0, Math.max(0, deckNow.length - viewed.length));
              const nextDeck = [...bottomCards, ...restDeck, ...topCards];
              setDeck(nextDeck);
              deckRef.current = nextDeck;
              addLog(`【羽化】诸葛果观看牌堆顶 ${viewed.length} 张，将 ${topCards.length} 张置于牌堆顶、${bottomCards.length} 张置于牌堆底${pick && pick.kind === 'card' ? '（玩家选择）' : '（自动）'}`, 'skill');
              showSkillBanner('诸葛果', '羽化');
              await delay(400);
            }
          }
        }

        // 周妃「箜声」：结束阶段使用置于武将牌上的装备牌，并获得其余的牌；「良姻」令手牌少者弃一张
        if (currentPlayer.hero.name === '周妃' && skillsOn(currentPlayer.id)) {
          const zf = getPlayer(currentPlayer.id);
          if (zf && (zf.placedCards?.length ?? 0) > 0) {
            const placed = zf.placedCards!;
            const equips = placed.filter(c => c.type === CardType.EQUIPMENT);
            const rest = placed.filter(c => c.type !== CardType.EQUIPMENT);
            const eq = { ...(zf.equipment ?? {}) };
            const equipped: Card[] = [];
            for (const c of equips) {
              const slot = EQUIP_META[c.name]?.slot;
              if (slot && !eq[slot]) { eq[slot] = c; equipped.push(c); } else { rest.push(c); }
            }
            updatePlayer(zf.id, { placedCards: [], equipment: eq });
            if (rest.length > 0) mutateHand(zf.id, h => [...h, ...rest]);
            addLog(`【箜声】周妃收回武将牌上的 ${placed.length} 张牌${equipped.length ? `（其中 ${equipped.map(c => `【${c.name}】`).join('')} 已装备）` : ''}`, 'skill');
            showSkillBanner('周妃', '箜声');
            const zfAfter = getPlayer(zf.id);
            const poorer = playersRef.current.filter(o => !o.isDead && o.id !== zf.id && o.hand.length < (zfAfter?.hand.length ?? 0) && o.hand.length > 0);
            if (poorer.length > 0) {
              const t = poorer.sort((a, b) => a.hand.length - b.hand.length)[0];
              const low = [...t.hand].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
              discardCards(t.id, [low]);
              addLog(`【良姻】周妃令手牌少于自己的 ${t.hero.name} 弃置一张牌`, 'skill');
              showSkillBanner('周妃', '良姻');
            }
            await delay(300);
          }
        }

        // 蔡贞姬「天音」：结束阶段，从牌堆获得本回合未使用过的牌类型各一张
        if (currentPlayer.hero.name === '蔡贞姬' && skillsOn(currentPlayer.id)) {
          const missingTypes = [CardType.BASIC, CardType.SCROLL, CardType.EQUIPMENT]
            .filter(t => !usedTypesRef.current.has(t));
          const picks: Card[] = [];
          for (const t of missingTypes) {
            const c = deckRef.current.find(x => x.type === t && !picks.some(p => p.id === x.id));
            if (c) picks.push(c);
          }
          if (picks.length > 0) {
            setDeck(prev => {
              const next = prev.filter(c => !picks.some(p => p.id === c.id));
              deckRef.current = next;
              return next;
            });
            picks.forEach(c => mutateHand(currentPlayer.id, h => [...h, c]));
            addLog(`【天音】蔡贞姬从牌堆获得 ${picks.map(c => `【${c.name}】`).join('')}`, 'skill');
            showSkillBanner('蔡贞姬', '天音');
            await delay(300);
          }
        }

        // 张春华「伤逝」：回合结束时，手牌少于已损失体力则补至该值
        const endingPlayer = getPlayer(turnIndex);
        // 技能注册表：回合结束时机统一分发（新技能只需注册，不必在此加分支）
        if (endingPlayer) {
          await dispatchTurnEnd({
            players: playersRef.current,
            turnOwner: endingPlayer,
            draw: (pid: number, n: number) => drawCardsRef.current!(pid, n),
            discard: (pid: number, cards: Card[]) => discardCards(pid, cards),
            heal: (pid: number, n: number) => recoverHp(pid, n),
            damage: async (victimId: number, sourceId: number, amount: number, cd?: Card) => {
              if (combatEngine) await combatEngine.takeDamage(victimId, sourceId, amount, cd);
            },
            gainCard: (fromId: number, toId: number, cd: Card) => {
              mutateHand(fromId, h => h.filter(c => c.id !== cd.id));
              mutateHand(toId, h => [...h, cd]);
            },
            log: (t: string) => addLog(t, 'skill'),
            banner: (h: string, sk: string) => showSkillBanner(h, sk),
            delay: (ms: number) => delay(ms),
            skillsOn: (pid: number) => skillsOn(pid),
          }, endingPlayer);
        }
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '张春华') {
          const lostHp = endingPlayer.maxHp - endingPlayer.hp;
          const deficit = lostHp - endingPlayer.hand.length;
          if (deficit > 0) {
            addLog(`${endingPlayer.hero.name} 发动「伤逝」，摸 ${deficit} 张牌补至已损失体力`, 'skill');
            drawCards(endingPlayer.id, deficit);
          }
        }

        // 唐姬「抗歌」：自己的第一个回合开始时，选择一名其他角色作为守护对象
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '唐姬'
            && skillsOn(endingPlayer.id) && endingPlayer.kanggeTargetId == null
            && (turnCountRef.current <= playersRef.current.length)) {
          const others = playersRef.current.filter(p => !p.isDead && p.id !== endingPlayer.id);
          if (others.length > 0) {
            const chosen = [...others].sort((a, b) => b.hp - a.hp)[0];
            updatePlayer(endingPlayer.id, { kanggeTargetId: chosen.id });
            addLog(`【抗歌】唐姬选择 ${chosen.hero.name} 作为守护对象`, 'skill');
            showSkillBanner('唐姬', '抗歌');
          }
        }

        // 严夫人「匿伏」（锁定技）：一名角色的结束阶段，将其手牌调整为三张
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '严夫人' && skillsOn(endingPlayer.id)) {
          const diff = nifuAdjust(endingPlayer.hand.length);
          if (diff > 0) {
            addLog(`【匿伏】${endingPlayer.hero.name} 手牌不足三张，摸 ${diff} 张`, 'skill');
            showSkillBanner('严夫人', '匿伏');
            drawCards(endingPlayer.id, diff);
          } else if (diff < 0) {
            const toDiscard = [...endingPlayer.hand]
              .sort((a, b) => rankValue(a.rank) - rankValue(b.rank))
              .slice(0, -diff);
            if (toDiscard.length) {
              addLog(`【匿伏】${endingPlayer.hero.name} 手牌超过三张，弃置 ${toDiscard.length} 张`, 'skill');
              showSkillBanner('严夫人', '匿伏');
              discardCards(endingPlayer.id, toDiscard);
            }
          }
        }

        // 貂蝉「闭月」：回合结束时摸一张牌
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '貂蝉') {
          addLog(`${endingPlayer.hero.name} 发动「闭月」，摸一张牌`, 'skill');
          showSkillBanner(endingPlayer.hero.name, '闭月');
          drawCards(endingPlayer.id, 1);
        }

        // 曹婴「伏间」（锁定技）：结束阶段若全场角色均有手牌，随机观看一名其他角色 X 张手牌（X 为全场最少手牌数）
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '曹婴' && skillsOn(endingPlayer.id)) {
          const alive = playersRef.current.filter(p => !p.isDead);
          const allHaveHand = alive.every(p => p.hand.length > 0);
          const others = alive.filter(p => p.id !== endingPlayer.id);
          if (allHaveHand && others.length > 0) {
            const x = Math.min(...alive.map(p => p.hand.length));
            const viewed = others[Math.floor(Math.random() * others.length)];
            const cards = viewed.hand.slice(0, x).map(c => `【${c.name}】`).join('、');
            addLog(`【伏间】曹婴观看 ${viewed.hero.name} 的 ${x} 张手牌：${cards}`, 'skill');
            showSkillBanner('曹婴', '伏间');
          }
        }

        // 吴苋「怠宴」：结束阶段令一名其他角色从牌堆获得一张红桃基本牌；若其本身上回合已被列为目标，其失去1点体力
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '吴苋' && skillsOn(endingPlayer.id)) {
          const others = playersRef.current.filter(p => !p.isDead && p.id !== endingPlayer.id);
          if (others.length > 0) {
            const prevId = endingPlayer.daiyanTargetId;
            const prevTarget = others.find(p => p.id === prevId && isEnemy(endingPlayer, p));
            const target = prevTarget
              ?? others.filter(p => isEnemy(endingPlayer, p)).sort((a, b) => b.hp - a.hp)[0]
              ?? others[0];
            const heartBasic = deckRef.current.find(c => c.suit === Suit.HEART && c.type === CardType.BASIC);
            if (heartBasic) {
              setDeck(prev => {
                const next = prev.filter(c => c.id !== heartBasic.id);
                deckRef.current = next;
                return next;
              });
              mutateHand(target.id, h => [...h, heartBasic]);
              addLog(`【怠宴】吴苋令 ${target.hero.name} 从牌堆获得一张红桃基本牌【${heartBasic.name}】`, 'skill');
              showSkillBanner('吴苋', '怠宴');
              if (prevId === target.id) {
                const targetNow = getPlayer(target.id);
                if (targetNow && !targetNow.isDead) {
                  const nextHp = targetNow.hp - 1;
                  updatePlayer(target.id, { hp: nextHp });
                  addLog(`【怠宴】${target.hero.name} 上回合已成为「怠宴」目标，失去 1 点体力（${nextHp}/${targetNow.maxHp}）`, 'skill');
                  if (nextHp <= 0) {
                    const saved = await combat.askForPeaches(target.id);
                    if (!saved) await handleDeath(target.id, endingPlayer.id);
                  }
                }
              }
              updatePlayer(endingPlayer.id, { daiyanTargetId: target.id });
              await delay(350);
            }
          }
        }

        // 徐氏「伏诛」：一名男性角色的结束阶段内，若牌堆剩余牌数不大于徐氏体力值的十倍，
        // 则徐氏可以依次对该角色使用牌堆中 X 张【杀】（X 为场上人数，不足则全部使用），然后洗牌
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.gender === 'male') {
          const xs = playersRef.current.find(p => !p.isDead && p.id !== endingPlayer.id
            && p.hero.name === '徐氏' && skillsOn(p.id));
          if (xs && deckRef.current.length <= xs.hp * 10) {
            const x = playersRef.current.filter(p => !p.isDead).length;
            // 牌堆顶在数组末尾：从顶向底依次取【杀】，取满 X 张或牌堆中的【杀】用尽为止
            const slashes = [...deckRef.current].reverse().filter(c => c.name === CardName.SHA).slice(0, x);
            if (slashes.length > 0) {
              let go = true;
              if (xs.isHuman && !isAiTakeover) {
                const r = await requestSkillChoice({
                  skill: '伏诛',
                  owner: '徐氏',
                  title: `牌堆剩余 ${deckRef.current.length} 张（≤ 体力值 ${xs.hp} × 10），是否对 ${endingPlayer.hero.name} 依次使用牌堆中 ${slashes.length} 张【杀】？`,
                  mode: 'choose',
                  choices: [{ id: 'yes', label: `发动伏诛（${slashes.length} 张【杀】）` }],
                  cancelLabel: '不发动',
                }, true);
                go = !!(r && r.kind === 'choose' && r.id === 'yes');
              }
              if (go) {
                const usedIds = new Set(slashes.map(s => s.id));
                setDeck(prev => {
                  const next = prev.filter(c => !usedIds.has(c.id));
                  deckRef.current = next;
                  return next;
                });
                addLog(`【伏诛】徐氏对 ${endingPlayer.hero.name} 依次使用牌堆中的 ${slashes.length} 张【杀】`, 'skill');
                showSkillBanner('徐氏', '伏诛');
                await delay(400);
                for (const s of slashes) {
                  const xsNow = getPlayer(xs.id);
                  const victimNow = getPlayer(endingPlayer.id);
                  if (!xsNow || !victimNow || xsNow.isDead || victimNow.isDead) break;
                  await combat.resolveCardEffect(xsNow, [victimNow], s);
                  // 从牌堆取出的【杀】结算后进入弃牌堆
                  const dp = [...discardPileRef.current, s];
                  discardPileRef.current = dp;
                  setDiscardPile(dp);
                }
                const reshuffled = shuffle<Card>(deckRef.current);
                setDeck(reshuffled);
                deckRef.current = reshuffled;
                addLog('【伏诛】结算完毕，牌堆重新洗牌', 'info');
                await delay(300);
              }
            }
          }
        }

        // 陆郁生「润微」：本阶段结束时，弃置因此法获得的手牌
        if (runweiGiftRef.current.length > 0) {
          for (const { targetId, ids } of runweiGiftRef.current) {
            const gifted = getPlayer(targetId);
            if (!gifted) continue;
            const remain = gifted.hand.filter(c => ids.includes(c.id));
            if (remain.length > 0) {
              mutateHand(targetId, h => h.filter(c => !ids.includes(c.id)));
              addLog(`【润微】阶段结束，${gifted.hero.name} 弃置未使用的 ${remain.length} 张润微牌`, 'skill');
            }
          }
          runweiGiftRef.current = [];
        }

        // 夏侯氏「燕语」（结束阶段部分）：本阶段重铸过不少于两张【杀】，令一名男性角色摸两张牌
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '夏侯氏'
            && skillsOn(endingPlayer.id) && yanyuCountRef.current >= 2) {
          const males = playersRef.current
            .filter(p => !p.isDead && p.hero.gender === 'male' && isAlly(endingPlayer, p))
            .sort((a, b) => a.hand.length - b.hand.length);
          const target = males[0];
          if (target) {
            addLog(`【燕语】夏侯氏令 ${target.hero.name} 摸两张牌（本阶段重铸 ${yanyuCountRef.current} 张【杀】）`, 'skill');
            showSkillBanner('夏侯氏', '燕语');
            drawCards(target.id, 2);
            await delay(300);
          } else {
            addLog('【燕语】场上没有可作为目标的男性角色，效果未结算', 'info');
          }
        }

        // 夏侯氏「樵拾」：其他角色的结束阶段，若其手牌数等于夏侯氏的手牌数，令其摸一张牌，然后夏侯氏摸一张牌
        {
          const xiahou = playersRef.current.find(p => !p.isDead && p.id !== turnIndex
            && p.hero.name === '夏侯氏' && skillsOn(p.id));
          const ender = getPlayer(turnIndex);
          if (xiahou && ender && !ender.isDead && ender.hand.length === xiahou.hand.length) {
            addLog(`【樵拾】${ender.hero.name} 与夏侯氏手牌数同为 ${ender.hand.length}，令其摸一张牌，夏侯氏摸一张牌`, 'skill');
            showSkillBanner('夏侯氏', '樵拾');
            drawCards(ender.id, 1);
            drawCards(xiahou.id, 1);
            await delay(300);
          }
        }

        // 蔡夫人「窃听」：其他角色的回合结束时，若其没有用牌指定过其他角色，可取其一张装备或摸一张牌
        {
          const cfr = playersRef.current.find(p => !p.isDead && p.id !== turnIndex
            && p.hero.name === '蔡夫人' && skillsOn(p.id));
          const ender2 = getPlayer(turnIndex);
          if (cfr && ender2 && !ender2.isDead && !turnUsedOnOthersRef.current[turnIndex]) {
            const eqs = Object.values(ender2.equipment ?? {}).filter((c): c is Card => !!c);
            // AI：敌方装备优先夺取，盟友则改用摸牌选项
            const steal = eqs.length > 0 && isEnemy(cfr, ender2);
            const pick = steal
              ? (eqs.find(c => EQUIP_META[c.name]?.slot === 'weapon') ?? eqs[0])
              : null;
            const slot = pick ? EQUIP_META[pick.name]?.slot : undefined;
            if (pick && slot) {
              // 装备区增删基于实时 state 计算：避免「结束阶段其它结算已改过装备」时用快照整体写回
              updatePlayerWith(ender2.id, p => {
                const nextEq = { ...(p.equipment ?? {}) };
                delete nextEq[slot];
                return { equipment: nextEq };
              });
              const cfrLive = getPlayer(cfr.id);
              if (cfrLive?.equipment?.[slot]) {
                mutateHand(cfr.id, h => [...h, pick]);
                addLog(`【窃听】蔡夫人已有同部位装备，改为获得 ${ender2.hero.name} 的【${pick.name}】到手牌`, 'skill');
              } else {
                updatePlayerWith(cfr.id, p => ({ equipment: { ...(p.equipment ?? {}), [slot]: pick } }));
                addLog(`【窃听】蔡夫人获得 ${ender2.hero.name} 装备区的【${pick.name}】`, 'skill');
              }
              showSkillBanner('蔡夫人', '窃听');
              await delay(300);
            } else {
              drawCards(cfr.id, 1);
              addLog('【窃听】蔡夫人摸一张牌', 'skill');
              showSkillBanner('蔡夫人', '窃听');
              await delay(200);
            }
          }
        }

        // 曹节「惠民」（原版）：结束阶段摸 X 张牌（X 为手牌数小于体力值的角色数），
        // 然后依次把手牌交给这些角色各一张（自动从手牌最少者开始）
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '曹节') {
          const needy = playersRef.current.filter(p => !p.isDead && p.hand.length < p.hp);
          const x = needy.length;
          if (x > 0) {
            addLog(`${endingPlayer.hero.name} 发动「惠民」，摸 ${x} 张牌并分给 ${needy.map(p => p.hero.name).join('、')}`, 'skill');
            showSkillBanner(endingPlayer.hero.name, '惠民');
            drawCards(endingPlayer.id, x);
            await delay(300);
            const recipients = needy.slice().sort((a, b) => a.hand.length - b.hand.length);
            for (const r of recipients) {
              const me = playersRef.current.find(p => p.id === endingPlayer.id);
              if (!me || me.hand.length === 0 || r.isDead) break;
              const gift = me.hand[Math.floor(Math.random() * me.hand.length)];
              mutateHand(me.id, h => h.filter(c => c.id !== gift.id));
              mutateHand(r.id, h => [...h, gift]);
              addLog(`${me.hero.name} 将【${gift.name}】交给 ${r.hero.name}`, 'skill');
              await delay(250);
            }
          }
        }

        // 何太后「戚乱」：结束阶段，本回合每杀死一名其他角色，摸三张牌
        const hetaiDuan = playersRef.current.find(p => !p.isDead && p.hero.name === '何太后' && skillsOn(p.id));
        if (hetaiDuan && hetaishouKillsRef.current > 0) {
          const drawN = hetaishouKillsRef.current * 3;
          addLog(`何太后发动「戚乱」，本回合击杀 ${hetaishouKillsRef.current} 人，摸 ${drawN} 张牌`, 'skill');
          showSkillBanner('何太后', '戚乱');
          drawCards(hetaiDuan.id, drawN);
          await delay(400);
        }

        // 张琪瑛「点化」：结束阶段观看牌堆顶
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '张琪瑛') {
          doDianhua(endingPlayer);
          await delay(500);
        }

        // 长局兜底「粮尽」：超过阈值后每回合所有存活角色失去 1 点体力，
        // 由下面的濒死结算统一处理，避免 AI 互相回血导致永远打不完。
        turnCountRef.current += 1;
        const famine = suddenDeathDamage(turnCountRef.current, playersRef.current.length || players.length);
        if (famine > 0) {
          if (!famineAnnouncedRef.current) {
            famineAnnouncedRef.current = true;
            addLog(`【粮尽】战局已持续 ${turnCountRef.current} 个回合，此后每回合所有角色失去 ${famine} 点体力`, 'danger');
          }
          const starved = playersRef.current.map(p => p.isDead ? p : { ...p, hp: p.hp - famine });
          playersRef.current = starved;
          setPlayers(starved);
          addLog(`【粮尽】所有角色失去 ${famine} 点体力`, 'danger');
        }

        // 结束阶段：若有角色体力<=0且未死亡，进行濒死求桃
        const latestPlayers = playersRef.current.length ? playersRef.current : players;
        for (const p of latestPlayers) {
          const savedAt = recentlySavedRef.current[p.id];
          if (p.hp <= 0 && !p.isDead && !(savedAt && Date.now() - savedAt < 3000)) {
            addLog(`${p.hero.name} 体力为 ${p.hp}，进入濒死状态！`, 'danger');
            // 进入濒死求桃流程
            const isSaved = await combat.askForPeaches(p.id);
            if (!isSaved) {
              addLog(`${p.hero.name} 未能得到救援，死亡！`, 'danger');
              await handleDeath(p.id);
            }
          }
        }
        // 更新ref中的最新状态
        playersRef.current = players;

        // 下一位存活角色：跳过阵亡玩家（规则实现见 src/game/rules.ts）
        const nextIndex = nextAliveTurnIndex(playersRef.current.length ? playersRef.current : players, turnIndex);
        
        // 存档点：本回合结算完毕、下一位尚未开始时落盘
        setCheckpoint({ turnIndex: nextIndex, id: Date.now() });

        // 回合过场：墨金横带提示「上一位结束 → 轮到下一位」，让换手有节奏
        setTurnPass({
          from: endingPlayer?.hero.name ?? currentPlayer.hero.name,
          to: getPlayer(nextIndex)?.hero.name ?? '',
          id: Date.now(),
        });
        if (!isMutedRef.current) playSfx('turn');
        await delay(1000);
        setTurnPass(null);

        dbgMark('end:setTurn');
        setTurnIndex(nextIndex);
        setPhase(GamePhase.START);
      }
    };

    // 兜底：阶段结算抛出异常时不要让主循环永久卡死，记录后跳过本阶段
    const releaseStage = () => {
      if (activeStepRef.current?.token === stageToken) activeStepRef.current = null;
    };
    runTurn().catch((err) => {
      console.error('[runTurn] phase error', err);
      setIsProcessing(0);
      addLog('本阶段结算出现异常，已自动跳到结束阶段', 'danger');
      setPhase(GamePhase.END);
    }).finally(releaseStage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnIndex, screen, isAiTakeover, isProcessing, tutorialActive, loopNudge]); 

  // 仅本地开发：把主循环门控状态暴露到 window，便于长局卡死时定位（生产构建整段被移除）
  useEffect(() => {
    if (!DEV_BUILD) return;
    (window as unknown as { __sgDbg?: Record<string, unknown> }).__sgDbg = {
      phase, turnIndex, isProcessing, isAiTakeover,
      stepKey: turnStepRef.current,
      aiTurnActive: aiTurnActiveRef.current,
      screen, winnerSide, logs: logs.length,
      ui: {
        dying: !!dyingState, reaction: !!pendingReaction,
        skillChoice: !!skillChoice, wugu: !!wuguSelection,
      },
    };
  });

  // 实时同步阶段/回合，供异步链兜底判断使用
  useEffect(() => {
    phaseLiveRef.current = phase;
    turnLiveRef.current = turnIndex;
  }, [phase, turnIndex]);

  // 卡死看门狗（防御）：非人类操作阶段若长时间没有任何战报推进，
  // 先解锁并重跑本阶段一次，连续两次仍无进展则强制进入结束阶段。
  // 人类操作阶段不介入（本身有 20 秒读秒兜底）。
  useEffect(() => {
    if (screen !== 'game') return;
    const timer = window.setInterval(() => {
      if (isGameOverRef.current || winnerSide || tutorialActive || !players.length) return;
      const human = players.find(p => p.isHuman);
      const humanInControl = !!human && !isAiTakeover && !human.isDead && turnIndex === human.id;
      if (humanInControl) { stallKeyRef.current = ''; stallCountRef.current = 0; return; }
      // 弹窗/查看面板打开属于正常停留，刷新心跳不判卡死
      if (showRules || showDiscardViewer || inspectPlayerId !== null || showSkillModal || wuguSelection || dyingState || pendingReaction) {
        progressAtRef.current = Date.now();
        return;
      }
      if (Date.now() - progressAtRef.current < 12000) return;
      const key = `${turnIndex}-${phase}`;
      if (stallKeyRef.current !== key) { stallKeyRef.current = key; stallCountRef.current = 0; }
      stallCountRef.current += 1;
      progressAtRef.current = Date.now();
      if (stallCountRef.current <= 2) {
        addLog('检测到结算停滞，已自动重新推进本阶段', 'warning');
        activeStepRef.current = null;
        turnStepRef.current = '';
        setIsProcessing(0);
        setLoopNudge(n => n + 1);
      } else {
        addLog('本阶段连续停滞，强制结束本回合', 'danger');
        activeStepRef.current = null;
        turnStepRef.current = '';
        setIsProcessing(0);
        setPhase(GamePhase.END);
      }
    }, 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, winnerSide, tutorialActive, players, isAiTakeover, turnIndex, phase,
      showRules, showDiscardViewer, inspectPlayerId, showSkillModal, wuguSelection, dyingState, pendingReaction]);

  // 人类决策读秒：出牌 / 弃牌阶段 20 秒未操作则自动处理，避免对局永久卡住
  useEffect(() => {
    const human = players.find(p => p.isHuman);
    const shouldCount =
      screen === 'game' &&
      !tutorialActive &&
      !isAiTakeover &&
      phase === GamePhase.ACTION &&
      !!human && !human.isDead && turnIndex === human.id &&
      !dyingState && !pendingReaction && !showSkillModal && !wuguSelection &&
      // 看说明 / 查弃牌堆 / 查看武将详情时暂停读秒
      !showRules && !showDiscardViewer && inspectPlayerId === null &&
      isProcessing === 0;
    const shouldCountDiscard =
      screen === 'game' &&
      !tutorialActive &&
      !isAiTakeover &&
      phase === GamePhase.DISCARD &&
      !!human && !human.isDead && turnIndex === human.id &&
      !dyingState && !pendingReaction && !wuguSelection &&
      !showRules && !showDiscardViewer && inspectPlayerId === null &&
      isProcessing === 0;

    if (!shouldCount && !shouldCountDiscard) {
      setDecisionLeft(null);
      return;
    }

    const startedAt = Date.now();
    setDecisionLeft(DECISION_SECONDS);
    const tick = window.setInterval(() => {
      const left = DECISION_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      if (left <= 0) {
        window.clearInterval(tick);
        setDecisionLeft(0);
        onDecisionTimeoutRef.current();
      } else {
        setDecisionLeft(left);
      }
    }, 250);

    return () => {
      window.clearInterval(tick);
      setDecisionLeft(null);
    };
  }, [screen, isAiTakeover, phase, turnIndex, players, dyingState, pendingReaction, showSkillModal, wuguSelection, isProcessing, showRules, showDiscardViewer, inspectPlayerId, tutorialActive]);

  // 五谷丰登选牌同样读秒：超时自动取第一张，避免对局停在此处
  useEffect(() => {
    if (!wuguSelection) {
      setWuguLeft(null);
      return;
    }
    const startedAt = Date.now();
    setWuguLeft(DECISION_SECONDS);
    const tick = window.setInterval(() => {
      const left = DECISION_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      setWuguLeft(left > 0 ? left : 0);
    }, 250);
    const timer = window.setTimeout(() => {
      const pick = wuguSelection.cards[0] ?? null;
      setWuguSelection(null);
      wuguSelection.onSelect(pick);
      setWuguSelectedCard(null);
      addLog(pick ? `时间到！自动选择【${pick.name}】` : '时间到！无可选牌', 'warning');
    }, DECISION_SECONDS * 1000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timer);
    };
  }, [wuguSelection, addLog]);

  // 开启托管：立即接管此刻仍挂起的人类决策（响应 / 五谷丰登 / 濒死求桃）
  // 这样无论什么时候点托管（包括「南蛮入侵」求杀、「万箭齐发」求闪、五谷丰登选牌时）都立刻生效
  const resolveReactionLikeAI = () => {
    const resolver = humanReactionResolver.current;
    if (!resolver || !pendingReaction) return;
    const responder = playersRef.current.find(p => p.id === pendingReaction.targetId);
    if (!responder) {
      resolver({ played: false, isWuxie: false });
      return;
    }
    const needed = pendingReaction.cardName;

    // 无懈可击判定阶段：有则打出
    if (needed === CardName.WUXIE) {
      const wuxie = responder.hand.find(c => c.name === CardName.WUXIE);
      if (wuxie) {
        playCard(responder.id, wuxie);
        addLog(`托管接管，${responder.hero.name} 使用【无懈可击】`, 'info');
        resolver({ played: true, isWuxie: true });
      } else {
        resolver({ played: false, isWuxie: false });
      }
      return;
    }

    // 普通响应：优先同名牌，其次技能转化（龙胆 / 武圣 / 倾国）
    let card = responder.hand.find(c => c.name === needed);
    if (!card && responder.hero.name === '赵云') {
      card = responder.hand.find(c => c.name === (needed === CardName.SHAN ? CardName.SHA : CardName.SHAN));
    }
    if (!card && canUseWusheng(responder) && needed === CardName.SHA) {
      card = responder.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
    }
    if (!card && responder.hero.name === '甄姬' && needed === CardName.SHAN) {
      card = responder.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
    }

    if (card) {
      playCard(responder.id, card);
      addLog(`托管接管，${responder.hero.name} 打出【${card.name}】响应【${needed}】`, 'info');
      resolver({ played: true, isWuxie: false });
    } else {
      addLog(`托管接管，${responder.hero.name} 无牌可出，选择承受`, 'info');
      resolver({ played: false, isWuxie: false });
    }
  };

  useEffect(() => {
    if (!isAiTakeover) return;

    // 退出所有技能选牌模式，清空手动选择
    setIsRendeMode(false);
    setIsZhihengMode(false);
    setIsLijianMode(false);
    setIsJieyinMode(false);
    setIsQixiMode(false);
    setIsJiedaoMode(false);
    setSelectedCardIds([]);
    setActiveSelectedId(null);
    setIsSelectingTarget(false);

    // 五谷丰登：立刻按价值选取
    if (wuguSelection) {
      const best = [...wuguSelection.cards].sort((a, b) => wuguKeepPriority(a) - wuguKeepPriority(b))[0] ?? null;
      setWuguSelection(null);
      wuguSelection.onSelect(best);
      setWuguSelectedCard(null);
      addLog(best ? `托管接管，自动选取【${best.name}】` : '托管接管，无可选牌', 'info');
    }

    // 杀机已至 / 无懈可击：按 AI 逻辑立即响应
    if (pendingReaction) {
      resolveReactionLikeAI();
    }

    // 濒死求桃：有桃/酒且值得救就立即出手
    if (dyingState && dyingResolver.current) {
      const rescuer = playersRef.current.find(p => p.id === dyingState.rescuerId);
      const victim = playersRef.current.find(p => p.id === dyingState.victimId);
      const canSave = !!rescuer?.hand.some(c => c.name === CardName.TAO || c.name === CardName.JIU);
      const worthSaving = !!rescuer && !!victim && (rescuer.isHuman || rescuer.id === victim.id || isAlly(rescuer, victim));
      const shouldSave = canSave && worthSaving;
      addLog(shouldSave ? '托管接管，自动使用【桃】/【酒】救援' : '托管接管，放弃救援', 'info');
      dyingResolver.current(shouldSave);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiTakeover]);


  // --- Interactions ---

  // Global cancel: ESC 统一「退出」——先关弹窗，再退出技能选牌模式，最后清空选择
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // 1. 弹窗优先关闭
      if (inspectPlayerId !== null) { setInspectPlayerId(null); return; }
      if (showRules) { setShowRules(false); return; }
      if (showSkillModal) { setShowSkillModal(false); return; }
      if (showDiscardViewer) { setShowDiscardViewer(false); return; }
      if (advice) { setAdvice(null); return; }
      // 2. 退出各技能选牌模式（此前 ESC 只会清空已选牌，模式仍挂着）
      if (isZhihengMode) setIsZhihengMode(false);
      if (isLijianMode) {
        setIsLijianMode(false);
        setLijianSelectedCardId(null);
        setLijianSelectedTargets([]);
      }
      if (isRendeMode) {
        setIsRendeMode(false);
        setRendeSelectedCardIds([]);
        setRendeSelectedTarget(null);
      }
      if (isJieyinMode) {
        setIsJieyinMode(false);
        setJieyinTarget(null);
      }
      if (isQixiMode) setIsQixiMode(false);
      setIsJijiangMode(false);
      if (isFanjianMode) setIsFanjianMode(false);
      if (isGuoseMode) setIsGuoseMode(false);
      if (isQingnangMode) {
        setIsQingnangMode(false);
        setQingnangCardId(null);
      }
      if (isAnxuMode) {
        setIsAnxuMode(false);
        setAnxuTargets([]);
      }
      if (isZhangbaMode || zhangbaPending) {
        setIsZhangbaMode(false);
        setZhangbaPending(null);
      }
      setIsJiedaoMode(false);
      setJiedaoWeaponTarget(null);
      setJiedaoVictimTarget(null);
      setTiesuoSelectedTargets([]);
      // 3. 清空当前选择
      setSelectedCardIds([]);
      setActiveSelectedId(null);
      setIsSelectingTarget(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showRules, showSkillModal, showDiscardViewer, advice, isZhihengMode, isLijianMode, isRendeMode, isJieyinMode, isQixiMode, isJijiangMode, isZhangbaMode, zhangbaPending, isFanjianMode, isGuoseMode, isQingnangMode, isAnxuMode, inspectPlayerId]);

  // Clear any selection when entering reaction mode
  useEffect(() => {
    if (pendingReaction) {
      setSelectedCardIds([]);
      setIsSelectingTarget(false);
      setIsJiedaoMode(false);
      setJiedaoWeaponTarget(null);
      setJiedaoVictimTarget(null);
    }
  }, [pendingReaction]);

  // 桌面端键盘快捷键：1-9 选手牌，Enter 确认出牌，E 结束回合
  useEffect(() => {
    const onHotkey = (e: KeyboardEvent) => {
      // ?：任意界面都能打开玩法说明
      if (e.key === '?') {
        e.preventDefault();
        setShowRules(true);
        return;
      }
      if (screen !== 'game') return;
      // 新手引导浮层接管键盘（Enter/Esc 用于引导本身），不再驱动对局
      if (tutorialActive) return;
      if (dyingState || pendingReaction || showSkillModal || wuguSelection || isAiTakeover) return;
      // 弹窗打开时不响应快捷键，避免关着说明弹窗也能出牌
      if (showRules || showDiscardViewer || advice || inspectPlayerId !== null) return;
      if (!players.length) return;
      const meNow = players.find(p => p.isHuman) || players[0];
      if (!meNow || meNow.isDead || turnIndex !== meNow.id) return;

      // 数字键 1-9：选择第 N 张手牌（出牌与弃牌阶段都可用，规则说明中已承诺）
      if (/^[1-9]$/.test(e.key) && (phase === GamePhase.ACTION || phase === GamePhase.DISCARD)) {
        const idx = Number(e.key) - 1;
        const card = meNow.hand[idx];
        if (card) {
          e.preventDefault();
          dispatchCardClick(card);
        }
        return;
      }
      // Enter：确认出牌（非目标牌）/ 确认弃牌
      if (e.key === 'Enter') {
        if (phase === GamePhase.ACTION && selectedCardIds.length > 0 && !isProcessing) {
          e.preventDefault();
          handleConfirmPlay();
        } else if (phase === GamePhase.DISCARD) {
          e.preventDefault();
          handleDiscardConfirm();
        }
        return;
      }
      // E：结束回合
      if (e.key === 'e' || e.key === 'E') {
        if (phase === GamePhase.ACTION && !isProcessing) {
          e.preventDefault();
          endTurn();
        }
      }
    };
    window.addEventListener('keydown', onHotkey);
    return () => window.removeEventListener('keydown', onHotkey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, phase, turnIndex, players, selectedCardIds, dyingState, pendingReaction, showSkillModal, wuguSelection, isAiTakeover, isProcessing, showRules, showDiscardViewer, advice, inspectPlayerId, tutorialActive]);

  const clickGuard = useRef(false);
  const handleCardClick = (card: Card, e?: React.MouseEvent) => {
    // 改进的点击防护机制
    // 如果正在结算且不是在响应（pendingReaction），则拦截
    if (clickGuard.current || (isProcessing && !pendingReaction)) return;
    clickGuard.current = true;
    
    // 如果处于濒死求桃状态，禁止通过常规点击出牌（只能通过弹窗操作）
    if (dyingState) {
      addLog("处于濒死求桃状态，请先处理救援请求", 'warning');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 确保事件处理正确
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    const me = players[0];
    if (me.isDead) return;
    
    // 1. Handling Reaction (Manual Response)
    if (pendingReaction && !isAiTakeover) {
      const responder = getPlayer(pendingReaction.targetId)!;
      const neededCard = pendingReaction.cardName;
      const canUseSkill = pendingReaction.canUseLongdan || me.hero.name === '赵云'
        || (me.hero.name === '赵襄' && (me.meiyanMarks ?? 0) > 0);
      const skillCardName = pendingReaction.skillCardName || 
                           (neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN);

      // 「穆穆」：本回合不能打出【杀】（含武圣/龙胆等转化）
      if (neededCard === CardName.SHA && mumuNoSlashRef.current === me.id) {
        addLog('你因「穆穆」本回合不能打出【杀】', 'skill');
        setTimeout(() => { clickGuard.current = false; }, 120);
        return;
      }

      // 董白「黠慧」：体力未减少时，从董白处获得的黑色牌不能打出
      if (card && xiaohuiLocked(me.id, card.id)) {
        addLog(`「黠慧」：你获得的黑色牌【${card.name}】在体力减少前不能打出`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 120);
        return;
      }
      
      // 检查是否使用了无懈可击（仅无懈响应阶段可打出）
      if (card.name === CardName.WUXIE && neededCard === CardName.WUXIE && responder.hand.some(c => c.name === CardName.WUXIE)) {
        // 使用无懈可击
        playCard(me.id, card);
        addLog(`${me.hero.name} 使用了【无懈可击】`, 'info');
        
        // 直接调用resolve，无需等待discardPile更新
        if (humanReactionResolver.current) {
          // 由于playCard是同步调用的，discardPile会立即更新
          // 所以我们可以直接调用resolve，系统会检测到无懈可击
          humanReactionResolver.current({ played: true, isWuxie: true });
        }
      } else {
        // 检查是否使用了正确的牌或技能牌
        const isUsingNormalCard = card.name === neededCard;
        const isUsingSkillCard = canUseSkill && card.name === skillCardName;
        // 关羽的「武圣」技能：红色牌可以当杀使用
        const isUsingWusheng = canUseWusheng(me) && [Suit.HEART, Suit.DIAMOND].includes(card.suit) && neededCard === CardName.SHA;
        // 甄姬的「倾国」技能：黑色手牌可以当【闪】使用
        const isUsingQingguo = me.hero.name === '甄姬' && neededCard === CardName.SHAN &&
          (card.suit === Suit.SPADE || card.suit === Suit.CLUB);

        if (isUsingNormalCard || isUsingSkillCard || isUsingWusheng || isUsingQingguo) {
          // User plays the correct card or uses skill
          playCard(me.id, card);
          
          // 记录日志，显示是否使用了技能
          if (isUsingSkillCard) {
            if (me.hero.name === '赵襄') {
              // 「芳魂」：移去 1 枚「梅影」发动「龙胆」转化
              updatePlayer(me.id, { meiyanMarks: Math.max(0, (me.meiyanMarks ?? 0) - 1) });
              addLog(`【芳魂】赵襄移去 1 个「梅影」，发动「龙胆」将【${card.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner('赵襄', '芳魂');
            } else {
              addLog(`${me.hero.name} 使用技能「龙胆」，将【${card.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner(me.hero.name, '龙胆');
            }
          } else if (isUsingWusheng) {
            addLog(`${me.hero.name} 使用技能「武圣」，将【${card.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(me.hero.name, '武圣');
          } else if (isUsingQingguo) {
            addLog(`${me.hero.name} 使用技能「倾国」，将【${card.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(me.hero.name, '倾国');
          } else {
            addLog(`${me.hero.name} 打出了【${card.name}】`, 'info');
          }

          // 鲍三娘「姝勇」：打出【杀】同样触发（决斗/南蛮/借刀等响应）
          if (neededCard === CardName.SHA) void triggerShuyong(me.id);
          
          if (humanReactionResolver.current) {
            humanReactionResolver.current({ played: true, isWuxie: false });
          }
        }
      }
      // 确保在反应模式下也释放防护
      setTimeout(() => { clickGuard.current = false; }, 120);
      return;
    }
    
    if (turnIndex !== 0) {
      // 不是自己的回合，释放防护
      setTimeout(() => { clickGuard.current = false; }, 120);
      return; // Not my turn
    }
    
    if (isAiTakeover) {
      // AI在控制，释放防护
      setTimeout(() => { clickGuard.current = false; }, 120);
      return; // AI is playing
    }

    // 处理卡牌选择
    if (phase === GamePhase.ACTION) {
      const me = players.find(p => p.isHuman) || players[0];
      const isZhaoyun = me.hero.name === '赵云';
      const isGuanyu = canUseWusheng(me);
      // 赵襄「芳魂」：有「梅影」时可将【闪】当【杀】使用（主动使用，目标由玩家选择）
      const isZhaoxiang = me.hero.name === '赵襄' && (me.meiyanMarks ?? 0) > 0;
      const isRedCard = [Suit.HEART, Suit.DIAMOND].includes(card.suit); // 红色牌（红桃和方块）

      // 丈八蛇矛模式：选两张手牌
      if (isZhangbaMode) {
        if (selectedCardIds.includes(card.id)) {
          setSelectedCardIds(prev => prev.filter(id => id !== card.id));
        } else if (selectedCardIds.length < 2) {
          setSelectedCardIds(prev => [...prev, card.id]);
        } else {
          addLog('丈八蛇矛只能选两张手牌', 'warning');
        }
        setTimeout(() => { clickGuard.current = false; }, 150);
        return;
      }

      // 大乔「国色」：选一张方块牌当【乐不思蜀】
      if (isGuoseMode) {
        if (card.suit !== Suit.DIAMOND) {
          addLog('「国色」只能将方块牌当【乐不思蜀】使用', 'warning');
        } else if (selectedCardIds.includes(card.id)) {
          setSelectedCardIds([]);
          setActiveSelectedId(null);
          setIsSelectingTarget(false);
          addLog('已取消「国色」选牌', 'info');
        } else {
          setSelectedCardIds([card.id]);
          setActiveSelectedId(card.id);
          setIsSelectingTarget(true);
          addLog(`已选择方块牌【${card.name}】，请选择【乐不思蜀】的目标`, 'info');
        }
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }

      // 华佗「青囊」：选一张手牌作为代价
      if (isQingnangMode) {
        setQingnangCardId(card.id);
        setSelectedCardIds([card.id]);
        setActiveSelectedId(card.id);
        setIsSelectingTarget(true);
        addLog(`已选择【${card.name}】作为「青囊」的代价，请选择回复目标`, 'info');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }

      // 步练师「安恤」：只选角色，不选牌
      if (isAnxuMode) {
        addLog('「安恤」：请直接点击两名角色', 'info');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }

      // 制衡模式：支持多选
      if (isZhihengMode) {
        if (selectedCardIds.includes(card.id)) {
          // 取消选择这张牌
          setSelectedCardIds(prev => {
            const updated = prev.filter(id => id !== card.id);
            // 如果取消的是当前activeSelectedId，且还有其他选中的牌，设置第一个选中的为active
            if (activeSelectedId === card.id && updated.length > 0) {
              setActiveSelectedId(updated[0]);
            } else if (updated.length === 0) {
              setActiveSelectedId(null);
            }
            return updated;
          });
        } else {
          // 添加选择这张牌
          setSelectedCardIds(prev => [...prev, card.id]);
          setActiveSelectedId(card.id);
        }
        // 释放点击防护，允许后续点击
        setTimeout(() => {
          clickGuard.current = false;
        }, 200);
        return;
      }
      
      // 离间模式：首先选择要弃置的牌
      if (isLijianMode) {
        if (lijianSelectedCardId === card.id) {
          // 取消选择这张牌
          setLijianSelectedCardId(null);
          setSelectedCardIds([]);
        } else {
          // 选择这张牌作为要弃置的牌
          setLijianSelectedCardId(card.id);
          setSelectedCardIds([card.id]);
          addLog(`已选择【${card.name}】作为离间要弃置的牌，请选择2名男性角色`, 'info');
        }
        setTimeout(() => {
          clickGuard.current = false;
        }, 200);
        return;
      }
      
      // 仁德模式：选择要给出的牌
      if (isRendeMode) {
        if (rendeSelectedCardIds.includes(card.id)) {
          // 取消选择这张牌
          setRendeSelectedCardIds(prev => prev.filter(id => id !== card.id));
          setSelectedCardIds(prev => prev.filter(id => id !== card.id));
        } else {
          // 选择这张牌
          setRendeSelectedCardIds(prev => [...prev, card.id]);
          setSelectedCardIds(prev => [...prev, card.id]);
          addLog(`已选择【${card.name}】作为仁德要给出的牌，请选择目标角色`, 'info');
        }
        setTimeout(() => {
          clickGuard.current = false;
        }, 200);
        return;
      }
      
      // 甘宁「奇袭」模式：只能选黑色牌，选完再点目标角色
      if (isQixiMode) {
        const isBlackCard = card.suit === Suit.SPADE || card.suit === Suit.CLUB;
        if (!isBlackCard) {
          addLog('「奇袭」只能将黑色牌当【过河拆桥】使用', 'warning');
        } else if (selectedCardIds.includes(card.id)) {
          setSelectedCardIds([]);
          setActiveSelectedId(null);
          setIsSelectingTarget(false);
          addLog('已取消「奇袭」选牌', 'info');
        } else {
          setSelectedCardIds([card.id]);
          setActiveSelectedId(card.id);
          setIsSelectingTarget(true);
          addLog(`已选择【${card.name}】，请选择【过河拆桥】的目标`, 'info');
        }
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }

      // 装备牌：点击即上装，无需选择目标（技能选牌模式除外）
      if (card.type === CardType.EQUIPMENT && EQUIP_META[card.name] && !isQixiMode) {
        equipCard(me.id, card);
        setSelectedCardIds([]);
        setActiveSelectedId(null);
        setIsSelectingTarget(false);
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }

      // 普通模式：严格控制单选
      if (selectedCardIds.includes(card.id)) {
        // 取消选择
        setSelectedCardIds([]);
        setActiveSelectedId(null);
        setIsSelectingTarget(false);
      } else {
        // 无懈可击不能主动使用：仅提示，不进入选择
        if (card.name === CardName.WUXIE) {
          addLog('【无懈可击】只能在你或队友被锦囊牌指定时打出响应', 'warning');
          setTimeout(() => { clickGuard.current = false; }, 200);
          return;
        }
        // 选中新卡牌，确保只选这一张
        setSelectedCardIds([card.id]);
        setActiveSelectedId(card.id);
        
        // 目标选择模式
        // 对于赵云，将闪当杀使用时也需要选择目标
        // 对于关羽，将红色牌当杀使用时也需要选择目标
        const needTarget = [CardName.SHA, CardName.JUEDOU, CardName.SHUNSHOU, CardName.GUOHE, CardName.LESI, CardName.TAO, CardName.HUOGONG, CardName.BINGLIANG, CardName.TIESUO, CardName.JIEDAO].includes(card.name) ||
                          (isZhaoyun && card.name === CardName.SHAN) || // 赵云的闪可以当杀使用，需要选择目标
                          (isGuanyu && isRedCard) || // 关羽的红色牌可以当杀使用，需要选择目标
                          (isZhaoxiang && card.name === CardName.SHAN); // 赵襄的闪可移去梅影当杀使用
        
        if (needTarget) {
          setIsSelectingTarget(true);
          // 铁索连环特殊处理：重置目标选择
          if (card.name === CardName.TIESUO) {
            setTiesuoSelectedTargets([]);
            addLog("请选择1-2名目标（点击已选中的目标可取消选择）", 'info');
          } else if (card.name === CardName.JIEDAO) {
            // 借刀杀人特殊处理
            setIsJiedaoMode(true);
            setJiedaoWeaponTarget(null);
            setJiedaoVictimTarget(null);
            addLog("【借刀杀人】请先选择一名有武器的角色", 'info');
          } else if (isZhaoyun && card.name === CardName.SHAN) {
            addLog("请选择【杀】的目标...", 'info');
          } else if (isZhaoxiang && card.name === CardName.SHAN) {
            addLog("【芳魂】请选择【杀】的目标（将移去 1 枚「梅影」发动「龙胆」）...", 'info');
          } else if (isGuanyu && isRedCard) {
            addLog("请选择【杀】的目标...", 'info');
          } else {
            addLog("请选择目标...", 'info');
          }
        } else {
          setIsSelectingTarget(false);
        }
        
        // 技能提示
        if (isZhaoyun && [CardName.SHA, CardName.SHAN].includes(card.name)) {
          addLog(`${me.hero.name} 可以使用技能「龙胆」，将【${card.name}】当另一种牌使用`, 'info');
        } else if (isGuanyu && isRedCard) {
          addLog(`${me.hero.name} 可以使用技能「武圣」，将【${card.name}】当【杀】使用`, 'info');
        }
      }
    } else if (phase === GamePhase.DISCARD) {
      // Discard Phase: 多选模式
      if (selectedCardIds.includes(card.id)) {
        setSelectedCardIds(prev => prev.filter(id => id !== card.id));
      } else {
        setSelectedCardIds(prev => [...prev, card.id]);
      }
    }
    
    // 延迟释放防护，防止快速连续点击
    setTimeout(() => {
      clickGuard.current = false;
    }, 200);
  };

  // 稳定的卡牌点击分发器：ref 始终指向最新的 handleCardClick，
  // 而 dispatchCardClick 引用恒定 —— 手牌 CardComponent 配合 memo 可跳过无关重渲染
  const handleCardClickRef = useRef(handleCardClick);
  handleCardClickRef.current = handleCardClick;
  const dispatchCardClick = useCallback((card: Card, e?: React.MouseEvent) => {
    handleCardClickRef.current(card, e);
  }, []);

  // 简化的状态同步逻辑，仅保留一个useEffect来确保状态一致性
  useEffect(() => {
    // 仅在非弃牌阶段、非制衡/仁德/丈八模式下执行单选强制逻辑
    if (phase !== GamePhase.DISCARD && !isZhihengMode && !isRendeMode && !isZhangbaMode) {
      // 确保只有一个选中的卡牌
      if (selectedCardIds.length > 1) {
        // 使用最后一个选中的卡牌
        const last = selectedCardIds[selectedCardIds.length - 1];
        setSelectedCardIds([last]);
      }

      // 确保activeSelectedId与selectedCardIds同步
      const firstSelected = selectedCardIds.length > 0 ? selectedCardIds[0] : null;
      if (activeSelectedId !== firstSelected) {
        setActiveSelectedId(firstSelected);
      }
    }
  }, [selectedCardIds, phase, isZhihengMode, isRendeMode, isZhangbaMode]);

  // 吴国太「甘露」：交换两名角色的装备区（装备数之差不超过吴国太已损体力）
  const resolveGanlu = async (ownerId: number, aId: number, bId: number) => {
    const owner = getPlayer(ownerId);
    const a = getPlayer(aId);
    const b = getPlayer(bId);
    if (!owner || !a || !b || a.isDead || b.isDead || aId === bId) return false;
    const countEq = (p: Player) => Object.values(p.equipment ?? {}).filter(Boolean).length;
    const lost = owner.maxHp - owner.hp;
    if (Math.abs(countEq(a) - countEq(b)) > lost) {
      addLog(`「甘露」：${a.hero.name} 与 ${b.hero.name} 装备数差超过已损体力（${lost}），无法交换`, 'info');
      return false;
    }
    // 交换必须一次 setPlayers 原子完成：分两次写回时，第二个人可能拿着已被并发改动过的快照覆盖第一个人
    setPlayers(prev => {
      const pa = prev.find(p => p.id === aId);
      const pb = prev.find(p => p.id === bId);
      if (!pa || !pb) return prev;
      const updated = prev.map(p =>
        p.id === aId ? { ...p, equipment: { ...(pb.equipment ?? {}) } }
          : p.id === bId ? { ...p, equipment: { ...(pa.equipment ?? {}) } }
            : p);
      playersRef.current = updated;
      return updated;
    });
    addLog(`吴国太发动「甘露」，交换 ${a.hero.name} 与 ${b.hero.name} 的装备区`, 'skill');
    showSkillBanner('吴国太', '甘露');
    ganluUsedRef.current = true;
    setHasUsedGanlu(true);
    setIsGanluMode(false);
    setGanluTargets([]);
    await delay(500);
    return true;
  };

  // 邹氏「倾城」：弃置一张黑色牌（手牌或装备区），暗置一名武将牌明置的角色；
  // 若弃置的是装备牌，可再暗置一名武将牌明置的其他角色（人类自行选择）
  const resolveQingcheng = async (ownerId: number, targetId: number) => {
    const owner = getPlayer(ownerId);
    const target = getPlayer(targetId);
    if (!owner || !target || target.isDead || targetId === ownerId) return false;
    // 本作默认武将牌均明置；已被暗置的角色不能再被「倾城」选中（已暗置才为 false）
    if (target.generalRevealed === false) {
      addLog('「倾城」不能选择武将牌已暗置的角色', 'info');
      return false;
    }
    const eq = owner.equipment ?? {};
    const equipCards = (Object.keys(eq) as EquipmentSlot[])
      .map(k => (eq as Record<string, Card | undefined>)[k])
      .filter((c): c is Card => !!c && (c.suit === Suit.SPADE || c.suit === Suit.CLUB));
    const blackCards = [...owner.hand.filter(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB), ...equipCards];
    if (blackCards.length === 0) {
      addLog('「倾城」需要弃置一张黑色牌，当前没有合法牌', 'info');
      return false;
    }
    let cost: Card | undefined;
    if (owner.isHuman && !isAiTakeover && blackCards.length > 1) {
      const pick = await requestSkillChoice({
        skill: '倾城',
        owner: owner.hero.name,
        title: '「倾城」：选择弃置一张黑色牌（手牌或装备区）',
        mode: 'card',
        cards: blackCards,
        min: 1,
        max: 1,
        cancelLabel: '取消倾城',
      }, true);
      if (!pick || pick.kind !== 'card' || pick.ids.length !== 1) return false;
      cost = blackCards.find(c => c.id === pick.ids[0]);
      if (!cost) return false;
    } else {
      cost = [...blackCards].sort((a, b) => {
        const ai = a.type === CardType.EQUIPMENT ? 0 : 1;
        const bi = b.type === CardType.EQUIPMENT ? 0 : 1;
        return ai - bi || a.value - b.value;
      })[0];
    }
    if (!owner.hand.some(c => c.id === cost.id)) {
      // 代价来自装备区：移出槽位、置入弃牌堆，并触发「枭姬」
      // 人手选择期间有 await，必须按牌 id 在实时装备区里找槽位删，不能拿选择前的快照整体写回
      updatePlayerWith(ownerId, p => {
        const nextEq = { ...(p.equipment ?? {}) };
        const slot = (Object.keys(nextEq) as EquipmentSlot[])
          .find(k => (nextEq as Record<string, Card | undefined>)[k]?.id === cost.id);
        if (slot) delete nextEq[slot];
        return { equipment: nextEq };
      });
      setDiscardPile(prev => {
        const next = [...prev, cost];
        discardPileRef.current = next;
        return next;
      });
      triggerXiaoji(ownerId);
    } else {
      discardCards(ownerId, [cost]);
    }
    const sealSpan = playersRef.current.filter(p => !p.isDead).length + 1;
    skillSealRef.current[targetId] = turnCountRef.current + sealSpan;
    setGeneralRevealed(targetId, false, '倾城', true);
    addLog(`邹氏发动「倾城」，弃置黑色【${cost.name}】，暗置 ${target.hero.name} 的武将牌`, 'skill');
    showSkillBanner('邹氏', '倾城');
    qingchengUsedRef.current = true;
    setHasUsedQingcheng(true);
    setIsQingchengMode(false);
    await delay(500);
    if (cost.type === CardType.EQUIPMENT) {
      const candidates = playersRef.current
        .filter(p => !p.isDead && p.id !== ownerId && p.id !== targetId && p.generalRevealed !== false);
      if (candidates.length > 0) {
        let secondId: number | null = null;
        if (owner.isHuman && !isAiTakeover) {
          const pick = await requestSkillChoice({
            skill: '倾城',
            owner: owner.hero.name,
            title: '弃置的是装备牌：可再暗置一名武将牌明置的其他角色',
            mode: 'choose',
            choices: candidates.map(p => ({ id: String(p.id), label: p.hero.name, desc: `${p.hp}/${p.maxHp}` })),
            cancelLabel: '不再暗置',
          }, true);
          if (pick && pick.kind === 'choose') secondId = Number(pick.id);
        } else {
          const enemy = candidates.filter(p => isEnemy(owner, p)).sort((a, b) => a.hp - b.hp)[0];
          secondId = enemy ? enemy.id : null;
        }
        const second = secondId !== null ? getPlayer(secondId) : undefined;
        if (second) {
          skillSealRef.current[second.id] = turnCountRef.current + sealSpan;
          setGeneralRevealed(second.id, false, '倾城', true);
          addLog(`「倾城」弃置的是装备牌，再次暗置 ${second.hero.name} 的武将牌`, 'skill');
          await delay(400);
        }
      }
    }
    return true;
  };

  // 郭皇后「矫诏」：展示一张手牌，由距离最近的角色声明牌名（Lv3 自己声明）。
  // Lv1 基本牌；Lv2+ 基本牌或普通锦囊；本回合可将展示牌当声明牌使用，不能指定自己。
  const clearJiaozhaoPending = () => {
    jiaozhaoPendingRef.current = null;
    setJiaozhaoPending(null);
  };

  const buildJiaozhaoCard = (shown: Card, declared: CardName, ownerId: number): Card => ({
    ...shown,
    id: `jiaozhao-${ownerId}-${Date.now()}`,
    name: declared,
    type: declared === CardName.SHA
      ? CardType.BASIC
      : ([CardName.SHUNSHOU, CardName.GUOHE, CardName.JUEDOU, CardName.NANMAN, CardName.WANJIAN] as CardName[]).includes(declared)
        ? CardType.SCROLL
        : shown.type,
    description: `矫诏：将【${shown.name}】当【${declared}】使用`,
  });

  const resolveJiaozhao = async (ownerId: number) => {
    const owner = getPlayer(ownerId);
    if (!owner || jiaozhaoUsedRef.current || owner.hand.length === 0) return false;
    const level = guohuanghouLevelRef.current[ownerId] ?? 1;
    // 展示手牌：人类自行选择，AI 优先基本牌
    let shown = [...owner.hand].sort((a, b) => {
      const ai = a.type === CardType.BASIC ? 1 : 0;
      const bi = b.type === CardType.BASIC ? 1 : 0;
      return ai - bi || a.value - b.value;
    })[0];
    if (owner.isHuman && !isAiTakeover) {
      const pick = await requestSkillChoice({
        skill: '矫诏',
        owner: owner.hero.name,
        title: '选择要展示的手牌',
        hint: level >= 3
          ? '本回合可将此牌当声明的基本牌或普通锦囊使用（不能对自己使用）'
          : '展示后由距离你最近的角色声明牌名',
        mode: 'card',
        cards: owner.hand,
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (!pick || pick.kind === 'cancel' || pick.kind === 'timeout') return false;
      if (pick.kind === 'card' && pick.ids.length) {
        shown = owner.hand.find(c => c.id === pick.ids[0]) ?? shown;
      }
    }
    // 声明者：Lv1/Lv2 为距离最近的其他角色（并列时由郭皇后指定/AI 取座位序）；Lv3 为郭皇后自己
    let declarer: Player = owner;
    if (level < 3) {
      const others = playersRef.current.filter(p => !p.isDead && p.id !== ownerId);
      if (others.length === 0) return false;
      const minDist = Math.min(...others.map(p => getDistance(ownerId, p.id)));
      const nearest = others.filter(p => getDistance(ownerId, p.id) === minDist)
        .sort((a, b) => a.id - b.id);
      declarer = nearest[0];
      if (nearest.length > 1 && owner.isHuman && !isAiTakeover) {
        const pick = await requestSkillChoice({
          skill: '矫诏',
          owner: owner.hero.name,
          title: `距离 ${minDist} 的角色有 ${nearest.length} 名，选择由谁声明`,
          mode: 'target',
          targets: nearest.map(p => ({ id: p.id, name: p.hero.name, sub: `距离 ${minDist}` })),
          min: 1,
          max: 1,
          cancelLabel: '按座位顺序自动',
        });
        if (pick && pick.kind === 'target' && pick.ids.length) {
          declarer = nearest.find(p => p.id === pick.ids[0]) ?? nearest[0];
        }
      }
    }
    const foes = playersRef.current.filter(p => !p.isDead && p.id !== ownerId && isEnemy(owner, p));
    const foesWithCards = foes.filter(p => p.hand.length > 0 || Object.values(p.equipment ?? {}).some(Boolean));
    // 可声明牌名：Lv1 基本牌；Lv2+ 基本牌或普通锦囊（仅纳入引擎已实现、可主动使用的牌名）
    const basicNames: CardName[] = [CardName.SHA];
    const scrollNames: CardName[] = [CardName.GUOHE, CardName.SHUNSHOU, CardName.JUEDOU, CardName.NANMAN, CardName.WANJIAN];
    const declarable: CardName[] = level >= 2 ? [...basicNames, ...scrollNames] : basicNames;
    // AI 推荐：优先能拆牌的锦囊 / 群体伤害 / 单点决斗 / 杀
    let aiDeclared: CardName = CardName.SHA;
    if (level >= 2 && foesWithCards.length > 0) aiDeclared = CardName.GUOHE;
    else if (level >= 2 && foes.length >= 2) aiDeclared = CardName.NANMAN;
    else if (level >= 2 && foes.length > 0) aiDeclared = CardName.JUEDOU;
    let declared: CardName = aiDeclared;
    if (declarer.isHuman && !isAiTakeover && declarable.length > 1) {
      const r = await requestSkillChoice({
        skill: '矫诏',
        owner: declarer.hero.name,
        title: `${owner.hero.name} 发动「矫诏」，请声明一种牌名`,
        hint: level >= 2 ? '可声明基本牌或普通锦囊；展示牌本回合将按此牌名结算' : '只能声明基本牌',
        mode: 'choose',
        choices: declarable.map(n => ({ id: n, label: `【${n}】` })),
        cancelLabel: `按 AI 推荐（${aiDeclared}）`,
      });
      if (r && r.kind === 'choose' && declarable.includes(r.id as CardName)) declared = r.id as CardName;
    }
    addLog(`郭皇后发动「矫诏」(Lv${level})，展示【${shown.name}】，由 ${declarer.hero.name} 声明为【${declared}】`, 'skill');
    showSkillBanner('郭皇后', '矫诏');
    jiaozhaoUsedRef.current = true;
    setHasUsedJiaozhao(true);
    setGuohuanghouLevel(level);
    await delay(450);
    const me = getPlayer(ownerId);
    if (!me) return false;

    // 人类郭皇后：保留展示牌，本回合由玩家决定何时使用
    if (owner.isHuman && !isAiTakeover) {
      jiaozhaoPendingRef.current = { ownerId, cardId: shown.id, declared, level };
      setJiaozhaoPending({ ownerId, cardId: shown.id, declared, level });
      addLog(`【矫诏】本回合可将【${shown.name}】当【${declared}】使用（不能指定自己）`, 'info');
      return true;
    }

    // AI：当场按声明的牌名使用（原「即时结算」路径，供 AI 使用）
    discardCards(ownerId, [shown]);
    const virtual = buildJiaozhaoCard(shown, declared, ownerId);
    if (([CardName.NANMAN, CardName.WANJIAN] as CardName[]).includes(declared)) {
      const targets = playersRef.current.filter(p => !p.isDead && p.id !== ownerId);
      if (targets.length) await combat.resolveCardEffect(me, targets, virtual);
    } else {
      const foe = [...foes].sort((a, b) => a.hp - b.hp)[0];
      if (foe) await combat.resolveCardEffect(me, [getPlayer(foe.id)!], virtual);
      else addLog(`「矫诏」没有合法的【${declared}】目标`, 'info');
    }
    return true;
  };

  // 人类郭皇后使用「矫诏」：选择合法目标后弃置展示牌，按声明牌名结算
  const resolveJiaozhaoUse = async () => {
    const pending = jiaozhaoPendingRef.current;
    if (!pending) return;
    const owner = getPlayer(pending.ownerId);
    if (!owner || owner.isDead) { clearJiaozhaoPending(); return; }
    const shown = owner.hand.find(c => c.id === pending.cardId);
    if (!shown) {
      addLog('【矫诏】展示的牌已不在手中，效果结束', 'warning');
      clearJiaozhaoPending();
      return;
    }
    const declared = pending.declared;
    const virtual = buildJiaozhaoCard(shown, declared, owner.id);
    const isGroup = declared === CardName.NANMAN || declared === CardName.WANJIAN;
    const others = playersRef.current.filter(p => !p.isDead && p.id !== owner.id);
    if (others.length === 0) { addLog('「矫诏」没有合法的目标', 'warning'); return; }
    if (!isGroup && declared === CardName.SHA && !canPlaySlash(owner, virtual)) {
      addLog('「矫诏」本回合【杀】已达使用上限，无法再当【杀】使用', 'warning');
      return;
    }
    let candidates = others;
    if (declared === CardName.SHA) candidates = others.filter(p => canReach(owner, p));
    else if (declared === CardName.SHUNSHOU) candidates = others.filter(p => getDistance(owner.id, p.id) <= 1);
    else if (declared === CardName.GUOHE) {
      candidates = others.filter(p => p.hand.length > 0 || Object.values(p.equipment ?? {}).some(Boolean) || (p.judgeZone ?? []).length > 0);
    }
    let targets: Player[] = [];
    if (isGroup) {
      targets = others;
    } else {
      if (candidates.length === 0) {
        addLog(`「矫诏」没有合法的【${declared}】目标`, 'warning');
        return;
      }
      const pick = await requestSkillChoice({
        skill: '矫诏',
        owner: owner.hero.name,
        title: `选择【${declared}】的目标（不能指定自己）`,
        mode: 'target',
        targets: candidates.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}/${p.maxHp}` })),
        min: 1,
        max: 1,
        cancelLabel: '暂不使用',
      });
      if (!pick || pick.kind === 'cancel' || pick.kind === 'timeout') return;
      const target = candidates.find(p => pick.kind === 'target' && pick.ids[0] === p.id);
      if (!target) return;
      targets = [target];
    }
    discardCards(owner.id, [shown]);
    clearJiaozhaoPending();
    addLog(`郭皇后使用「矫诏」，将【${shown.name}】当【${declared}】对 ${targets.map(t => t.hero.name).join('、')} 使用`, 'skill');
    await combat.resolveCardEffect(owner, targets, virtual);
  };

  const handleTargetClick = async (targetId: number) => {
    if (dyingState || isProcessing) return;

    // 吴国太「甘露」：依次点选两名角色，选满后交换装备区
    if (isGanluMode) {
      const meG = players.find(p => p.isHuman) || players[0];
      if (hasUsedGanlu || ganluUsedRef.current) {
        setIsGanluMode(false);
        setGanluTargets([]);
        setIsSelectingTarget(false);
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const target = players.find(p => p.id === targetId);
      if (!target || target.isDead) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const next = ganluTargets.includes(targetId) ? ganluTargets : [...ganluTargets, targetId];
      setGanluTargets(next);
      addLog(`「甘露」已选择：${next.map(id => players.find(p => p.id === id)?.hero.name || '').join('、')}`, 'info');
      if (next.length >= 2) {
        setIsProcessing(p => p + 1);
        try {
          await resolveGanlu(meG.id, next[0], next[1]);
        } finally {
          setIsProcessing(p => Math.max(0, p - 1));
          setIsSelectingTarget(false);
          setSelectedCardIds([]);
          setActiveSelectedId(null);
          setTimeout(() => { clickGuard.current = false; }, 200);
        }
      } else {
        setTimeout(() => { clickGuard.current = false; }, 200);
      }
      return;
    }

    // 邹氏「倾城」：点选一名角色，弃黑牌暗置其武将牌
    if (isQingchengMode) {
      const meQ = players.find(p => p.isHuman) || players[0];
      setIsProcessing(p => p + 1);
      try {
        await resolveQingcheng(meQ.id, targetId);
      } finally {
        setIsProcessing(p => Math.max(0, p - 1));
        setIsSelectingTarget(false);
        setSelectedCardIds([]);
        setActiveSelectedId(null);
        setTimeout(() => { clickGuard.current = false; }, 200);
      }
      return;
    }

    // 丈八蛇矛：两张手牌当【杀】已选定，正在点目标
    if (zhangbaPending) {
      const meZ = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      if (!target || target.isDead || target.id === meZ.id) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (!canReach(meZ, target)) {
        addLog(`【${target.hero.name}】超出攻击范围，无法对其使用【杀】`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const [first, second] = zhangbaPending;
      setZhangbaPending(null);
      setSelectedCardIds([]);
      setActiveSelectedId(null);
      setIsSelectingTarget(false);
      // 第一张由虚拟【杀】落桌时弃置，第二张先手动弃置
      discardCards(meZ.id, [second]);
      const virtualSlash: Card = {
        ...first,
        name: CardName.SHA,
        type: CardType.BASIC,
        attribute: undefined,
        description: '丈八蛇矛：两张手牌当【杀】使用。',
      };
      addLog(`${meZ.hero.name} 发动【丈八蛇矛】，将【${first.name}】与【${second.name}】当【杀】使用`, 'skill');
      showSkillBanner(meZ.hero.name, '丈八蛇矛');
      setIsProcessing(p => p + 1);
      try {
        await combat.resolveCardEffect(meZ, [target], virtualSlash);
      } finally {
        setIsProcessing(p => Math.max(0, p - 1));
        setTimeout(() => { clickGuard.current = false; }, 200);
      }
      return;
    }

    // 周瑜「反间」：令目标猜花色，展示周瑜一张手牌；猜错受1点伤害并获得该牌
    if (isFanjianMode) {
      const meF = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      if (!target || target.isDead || target.id === meF.id) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (hasUsedFanjian || meF.hand.length === 0) {
        setIsFanjianMode(false);
        setIsSelectingTarget(false);
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const live = getPlayer(meF.id)!;
      const revealed = live.hand[Math.floor(Math.random() * live.hand.length)];
      const suits = [Suit.SPADE, Suit.HEART, Suit.CLUB, Suit.DIAMOND];
      const guessed = suits[Math.floor(Math.random() * suits.length)];
      mutateHand(meF.id, hand => hand.filter(c => c.id !== revealed.id));
      mutateHand(target.id, hand => [...hand, revealed]);
      setHasUsedFanjian(true);
      setIsFanjianMode(false);
      setIsSelectingTarget(false);
      setSelectedCardIds([]);
      setActiveSelectedId(null);
      addLog(`${target.hero.name} 猜测花色为 ${guessed}，周瑜展示【${revealed.name}】${revealed.suit}`, 'chat');
      if (guessed !== revealed.suit) {
        addLog(`猜错！${target.hero.name} 受到1点伤害并获得【${revealed.name}】`, 'danger');
        setIsProcessing(p => p + 1);
        try { await combat.takeDamage(target.id, meF.id, 1); } finally { setIsProcessing(p => Math.max(0, p - 1)); }
      } else {
        addLog(`猜对！${target.hero.name} 获得【${revealed.name}】，不受到伤害`, 'info');
      }
      showSkillBanner(meF.hero.name, '反间');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 大乔「国色」：方块牌当【乐不思蜀】
    if (isGuoseMode) {
      const meG = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      const card = meG.hand.find(c => c.id === selectedCardIds[0]);
      if (!target || target.isDead || !card || card.suit !== Suit.DIAMOND) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const protect = getTargetProtection(target, CardName.LESI);
      if (protect) {
        addLog(`${target.hero.name} 发动「${protect}」，不能被【乐不思蜀】指定`, 'skill');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      setIsGuoseMode(false);
      setSelectedCardIds([]);
      setActiveSelectedId(null);
      setIsSelectingTarget(false);
      const lesiCard: Card = { ...card, name: CardName.LESI, type: CardType.SCROLL, description: '国色：方块牌当【乐不思蜀】使用。' };
      showSkillBanner(meG.hero.name, '国色');
      setIsProcessing(p => p + 1);
      try { await combat.resolveCardEffect(meG, [target], lesiCard); } finally { setIsProcessing(p => Math.max(0, p - 1)); }
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 华佗「青囊」：弃一张手牌，令一名角色回复1点体力
    if (isQingnangMode) {
      const meH = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      const cost = meH.hand.find(c => c.id === qingnangCardId);
      if (!target || target.isDead || !cost) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (target.hp >= target.maxHp) {
        addLog(`${target.hero.name} 体力已满，无需使用「青囊」`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      discardCards(meH.id, [cost]);
      recoverHp(target.id, 1);
      setHasUsedQingnang(true);
      setIsQingnangMode(false);
      setQingnangCardId(null);
      setSelectedCardIds([]);
      setActiveSelectedId(null);
      setIsSelectingTarget(false);
      addLog(`${meH.hero.name} 发动「青囊」，弃置【${cost.name}】，令 ${target.hero.name} 回复1点体力`, 'skill');
      showSkillBanner(meH.hero.name, '青囊');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 步练师「安恤」：选择两名手牌数不同的其他角色
    if (isAnxuMode) {
      const meA = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      if (!target || target.isDead || target.id === meA.id) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (anxuTargets.includes(targetId)) {
        setAnxuTargets(prev => prev.filter(id => id !== targetId));
        addLog(`取消了【${target.hero.name}】的安恤选择`, 'info');
      } else if (anxuTargets.length < 2) {
        const next = [...anxuTargets, targetId];
        setAnxuTargets(next);
        addLog(`安恤已选择：${next.map(id => getPlayer(id)?.hero.name).join('、')}（${next.length}/2）`, 'info');
        if (next.length === 2) {
          setIsProcessing(p => p + 1);
          try {
            await resolveAnxu(meA.id, next);
          } finally {
            setIsProcessing(p => Math.max(0, p - 1));
          }
        }
      } else {
        addLog('「安恤」最多选择两名角色', 'warning');
      }
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 刘备「激将」：主动使用【杀】时，令其他蜀势力角色打出一张【杀】（视为刘备使用）
    if (isJijiangMode) {
      const meL = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      if (!target || target.isDead) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (target.id === meL.id) {
        addLog('「激将」不能对自己使用，请选择其他角色', 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const reach = getAttackRange(meL);
      const dist = getDistance(meL.id, target.id);
      if (dist > reach) {
        addLog(`距离不足：你与 ${target.hero.name} 距离 ${dist}，攻击范围 ${reach}`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (!canPlaySlash(meL)) {
        addLog('本回合使用的【杀】已达到上限，无法再发动「激将」', 'warning');
        setIsJijiangMode(false);
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const helper = playersRef.current.find(p =>
        !p.isDead && p.id !== meL.id && p.hero.kingdom === meL.hero.kingdom
        && p.hand.some(c => c.name === CardName.SHA));
      if (!helper) {
        addLog('没有其他蜀势力角色可以打出【杀】，「激将」无效', 'warning');
        setIsJijiangMode(false);
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const helpCard = helper.hand.find(c => c.name === CardName.SHA)!;
      mutateHand(helper.id, h => h.filter(c => c.id !== helpCard.id));
      setIsJijiangMode(false);
      setIsSelectingTarget(false);
      addLog(`刘备 发动「激将」，${helper.hero.name} 打出了【杀】（视为 刘备 使用）`, 'skill');
      showSkillBanner('刘备', '激将');
      setIsProcessing(p => p + 1);
      try {
        await combat.resolveCardEffect(meL, [target], helpCard);
      } finally {
        setIsProcessing(p => Math.max(0, p - 1));
        setTimeout(() => { clickGuard.current = false; }, 200);
      }
      return;
    }

    // 甘宁「奇袭」：将选中的黑色牌当【过河拆桥】对目标使用
    if (isQixiMode) {
      const meQ = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      const card = meQ.hand.find(c => c.id === selectedCardIds[0]);
      if (!target || !card || target.isDead) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (target.id === meQ.id) {
        addLog('「奇袭」不能对自己使用，请选择其他角色', 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      setIsQixiMode(false);
      setSelectedCardIds([]);
      setActiveSelectedId(null);
      setIsSelectingTarget(false);
      addLog(`${meQ.hero.name} 使用技能「奇袭」，将【${card.name}】当【过河拆桥】使用`, 'skill');
      showSkillBanner(meQ.hero.name, '奇袭');
      setIsProcessing(p => p + 1);
      try {
        const tempGuohe = { ...card, name: CardName.GUOHE };
        await combat.resolveCardEffect(meQ, [target], tempGuohe);
      } finally {
        setIsProcessing(p => Math.max(0, p - 1));
        setTimeout(() => { clickGuard.current = false; }, 200);
      }
      return;
    }

    // 孙尚香「结姻」：弃两张手牌，与一名已受伤的男性角色各回复 1 点体力
    if (isJieyinMode) {
      const meJ = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      if (!target || target.isDead || target.id === meJ.id) return;
      if (target.hero.gender !== 'male') {
        addLog(`【${target.hero.name}】不是男性角色，无法结姻`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (target.hp >= target.maxHp) {
        addLog(`【${target.hero.name}】未受伤，无法结姻`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (meJ.hand.length < 2) {
        addLog('「结姻」需要弃置两张手牌', 'warning');
        setIsJieyinMode(false);
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      const cardsToDiscard = meJ.hand.slice(0, 2);
      discardCards(meJ.id, cardsToDiscard);
      recoverHp(meJ.id, 1);
      recoverHp(target.id, 1);
      addLog(`${meJ.hero.name} 发动「结姻」，弃置两张牌，与 ${target.hero.name} 各回复 1 点体力`, 'skill');
      showSkillBanner(meJ.hero.name, '结姻');
      setHasUsedJieyin(true);
      setIsJieyinMode(false);
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }
    
    // 处理离间技能的目标选择
    if (isLijianMode && lijianSelectedCardId) {
      const me = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      
      if (!target || target.isDead) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      
      // 检查是否已经是男性角色
      if (target.hero.gender !== 'male') {
        addLog(`${target.hero.name} 不是男性角色，无法作为离间目标`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      
      // 不能选择自己
      if (target.id === me.id) {
        addLog(`不能选择自己作为离间目标`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      
      // 检查是否已经选中了
      if (lijianSelectedTargets.includes(targetId)) {
        // 取消选择
        setLijianSelectedTargets(prev => prev.filter(id => id !== targetId));
        const now = Date.now();
        if (!lijianLogRef.current || lijianLogRef.current.targetId !== targetId || now - lijianLogRef.current.timestamp > 300) {
          addLog(`取消了【${target.hero.name}】的离间选择`, 'info');
          lijianLogRef.current = { targetId, timestamp: now };
        }
      } else {
        // 添加选择，最多2个
        if (lijianSelectedTargets.length < 2) {
          setLijianSelectedTargets(prev => {
            const newTargets = [...prev, targetId];
            const targetNames = newTargets.map(id => playersRef.current.find(p => p.id === id)?.hero.name).join('、');
            const now = Date.now();
            if (!lijianLogRef.current || lijianLogRef.current.targetId !== targetId || now - lijianLogRef.current.timestamp > 300) {
              addLog(`离间已选择：${targetNames}（${newTargets.length}/2）`, 'info');
              lijianLogRef.current = { targetId, timestamp: now };
            }
            return newTargets;
          });
        } else {
          addLog(`最多只能选择2个目标`, 'warning');
        }
      }
      
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }
    
    // 处理仁德技能的目标选择
    if (isRendeMode && rendeSelectedCardIds.length > 0) {
      const me = players.find(p => p.isHuman) || players[0];
      const target = players.find(p => p.id === targetId);
      
      if (!target || target.isDead) {
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      
      // 不能选择自己
      if (target.id === me.id) {
        addLog(`不能选择自己作为仁德目标`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      
      // 设置目标
      setRendeSelectedTarget(targetId);
      addLog(`已选择【${target.hero.name}】作为仁德目标，点击确认给出 ${rendeSelectedCardIds.length} 张牌`, 'info');
      
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }
    
    // 普通目标选择
    if (!selectedCardIds.length || !isSelectingTarget) return;
    const me = players.find(p => p.isHuman) || players[0];
    const target = players.find(p => p.id === targetId);
    const card = me.hand.find(c => c.id === selectedCardIds[0]);

    if (!target || !card || target.isDead) return;
    // 董白「黠慧」：体力未减少时，获得的黑色牌不能使用
    if (xiaohuiLocked(me.id, card.id)) {
      addLog(`【黠慧】你获得的黑色牌【${card.name}】在体力减少前不能使用`, 'warning');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }
    // 孙鲁育「魅步」止息：本回合使用牌已达上限
    {
      const zx = zhixiRef.current;
      if (zx && zx.id === me.id && zx.used >= zx.limit) {
        addLog(`【止息】你本回合至多使用 ${zx.limit} 张牌，已达上限`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
    }

    // 通用目标合法性钩子：伤害牌的目标可能被技能禁止（花鬘「芳踪」等）
    const vetoReason = getTargetLegalityVeto(me, target, card);
    if (vetoReason) {
      addLog(`【${vetoReason}】不能指定 ${target.hero.name} 为目标`, 'warning');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 距离限制：顺手牵羊 / 兵粮寸断 仅限距离 1（黄月英「奇才」、王元姬「谦冲」选锦囊牌时无距离限制）
    if (card.name === CardName.SHUNSHOU || card.name === CardName.BINGLIANG) {
      const dist = getDistance(me.id, target.id);
      if (dist > 1 && me.hero.name !== '黄月英'
          && !(me.hero.name === '王元姬' && me.qianchongType === 'trick')) {
        addLog(`【${card.name}】只能对距离为1的角色使用（当前距离 ${dist}）`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
    }

    // 【杀】的距离与次数限制（含 龙胆 / 武圣 转化的杀）
    const isSlashLike = card.name === CardName.SHA ||
      (me.hero.name === '赵云' && card.name === CardName.SHAN) ||
      (canUseWusheng(me) && [Suit.HEART, Suit.DIAMOND].includes(card.suit));
    if (isSlashLike && target.id !== me.id) {
      const reach = getAttackRange(me);
      const dist = getDistance(me.id, target.id);
      const qiangwuLong = me.hero.name === '张星彩' && qiangwuPointRef.current !== null
        && rankValue(card.rank) < qiangwuPointRef.current;
      const qianchongLong = me.hero.name === '王元姬' && me.qianchongType === 'basic';
      if (dist > reach && !qiangwuLong && !qianchongLong) {
        addLog(`距离不足：你与 ${target.hero.name} 距离 ${dist}，攻击范围 ${reach}`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (!canPlaySlash(me, card)) {
        addLog(mumuNoSlashRef.current === me.id
          ? '「穆穆」：本回合已获得防具牌，不能使用【杀】'
          : '出牌阶段只能使用一张【杀】（诸葛连弩 / 张飞「咆哮」不限；张星彩「枪舞」可让大点数【杀】不计次数）', 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
    }

    // 借刀杀人目标选择
    if (card.name === CardName.JIEDAO && isJiedaoMode) {
      // 第一步：选择有武器的角色（不能是自己）
      if (!jiedaoWeaponTarget) {
        if (target.id === me.id) {
          addLog(`不能选择自己作为借刀杀人的目标`, 'warning');
          setTimeout(() => { clickGuard.current = false; }, 200);
          return;
        }
        if (!target.equipment?.weapon) {
          addLog(`【${target.hero.name}】装备区没有武器，无法成为借刀目标`, 'warning');
          setTimeout(() => { clickGuard.current = false; }, 200);
          return;
        }
        setJiedaoWeaponTarget(targetId);
        addLog(`已选择【${target.hero.name}】作为借刀目标，请选择其攻击范围内的另一名角色`, 'info');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      
      // 第二步：选择被攻击的角色（不能是借刀目标自己）
      if (jiedaoWeaponTarget && !jiedaoVictimTarget) {
        if (target.id === jiedaoWeaponTarget) {
          addLog(`不能选择同一名角色，请选择另一名角色`, 'warning');
          setTimeout(() => { clickGuard.current = false; }, 200);
          return;
        }
        setJiedaoVictimTarget(targetId);
        const weaponPlayer = players.find(p => p.id === jiedaoWeaponTarget);
        addLog(`已选择【${weaponPlayer?.hero.name}】攻击【${target.hero.name}】，点击出牌按钮确认`, 'info');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
    }
    
    // 铁索连环多目标选择
    if (card.name === CardName.TIESUO) {
      // 检查是否已经选中了
      if (tiesuoSelectedTargets.includes(targetId)) {
        // 取消选择
        setTiesuoSelectedTargets(prev => prev.filter(id => id !== targetId));
        const now = Date.now();
        if (!tiesuoLogRef.current || tiesuoLogRef.current.targetId !== targetId || now - tiesuoLogRef.current.timestamp > 300) {
          addLog(`取消了【${target.hero.name}】的铁索连环选择`, 'info');
          tiesuoLogRef.current = { targetId, timestamp: now };
        }
      } else {
        // 添加选择，最多2个
        if (tiesuoSelectedTargets.length < 2) {
          setTiesuoSelectedTargets(prev => {
            const newTargets = [...prev, targetId];
            const targetNames = newTargets.map(id => playersRef.current.find(p => p.id === id)?.hero.name).join('、');
            const now = Date.now();
            if (!tiesuoLogRef.current || tiesuoLogRef.current.targetId !== targetId || now - tiesuoLogRef.current.timestamp > 300) {
              addLog(`铁索连环已选择：${targetNames}（${newTargets.length}/2）`, 'info');
              tiesuoLogRef.current = { targetId, timestamp: now };
            }
            return newTargets;
          });
        } else {
          addLog(`铁索连环最多只能选择2个目标`, 'warning');
        }
      }
      
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }
    
    // 空城 / 谦逊：人类选择目标时直接拦截
    let effectiveCardName = card.name;
    if (canUseWusheng(me) && [Suit.HEART, Suit.DIAMOND].includes(card.suit)) effectiveCardName = CardName.SHA;
    if (me.hero.name === '赵云' && card.name === CardName.SHAN) effectiveCardName = CardName.SHA;
    if (me.hero.name === '赵襄' && card.name === CardName.SHAN && (me.meiyanMarks ?? 0) > 0) effectiveCardName = CardName.SHA;
    const targetProtection = getTargetProtection(target, effectiveCardName);
    if (target.id !== me.id && targetProtection) {
      addLog(`${target.hero.name} 发动「${targetProtection}」，不能成为该牌的目标`, 'skill');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    // 伏皇后「惴恐」获胜：本回合使用牌不能选择除自己以外的角色为目标
    if (doutuSelfOnlyRef.current === me.id && target.id !== me.id
        && card.name !== CardName.TAO && card.name !== CardName.JIU) {
      addLog(`${me.hero.name} 受「惴恐」影响，本回合不能选择其他角色为目标`, 'warning');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    setIsProcessing(p => p + 1);
    try {
      if (card.name === CardName.TAO || card.name === CardName.JIU) {
        // 桃和酒可以对自己使用
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await combat.resolveCardEffect(me, [target], card);
        return;
      }
      
      // 其他卡牌不能对自己使用
      if (target.id === me.id) return;
      
      // 处理赵云的「龙胆」技能 - 主动使用
      const isUsingLongdan = me.hero.name === '赵云' && card.name === CardName.SHAN;
      // 处理「武圣」（关羽或许身授予）- 主动使用
      const isUsingWusheng = canUseWusheng(me) && [Suit.HEART, Suit.DIAMOND].includes(card.suit);
      // 赵襄「芳魂」：移去 1 枚「梅影」发动「龙胆」，将【闪】当【杀】使用
      const isUsingFanghun = me.hero.name === '赵襄' && card.name === CardName.SHAN && (me.meiyanMarks ?? 0) > 0;
      
      setSelectedCardIds([]);
      setIsSelectingTarget(false);

      if (isUsingFanghun) {
        // 赵襄移去梅影，将闪当杀使用，结算后摸一张
        updatePlayer(me.id, { meiyanMarks: Math.max(0, (me.meiyanMarks ?? 0) - 1) });
        addLog(`【芳魂】赵襄移去 1 个「梅影」，发动「龙胆」将【${card.name}】当【杀】对 ${target.hero.name} 使用`, 'skill');
        showSkillBanner('赵襄', '芳魂');
        const tempShaCard = { ...card, name: CardName.SHA };
        await combat.resolveCardEffect(me, [target], tempShaCard);
        drawCards(me.id, 1);
        addLog('【芳魂】龙胆结算后赵襄摸一张牌', 'skill');
      } else if (isUsingLongdan) {
        // 赵云将闪当杀使用
        addLog(`${me.hero.name} 使用技能「龙胆」，将【${card.name}】当【杀】使用`, 'skill');
        showSkillBanner(me.hero.name, '龙胆');
        // 创建一个临时的杀卡牌对象用于效果处理
        const tempShaCard = { ...card, name: CardName.SHA };
        await combat.resolveCardEffect(me, [target], tempShaCard);
      } else if (isUsingWusheng) {
        // 关羽将红色牌当杀使用
        addLog(`${me.hero.name} 使用技能「武圣」，将【${card.name}】当【杀】使用`, 'skill');
        showSkillBanner(me.hero.name, '武圣');
        // 创建一个临时的杀卡牌对象用于效果处理
        const tempShaCard = { ...card, name: CardName.SHA };
        await combat.resolveCardEffect(me, [target], tempShaCard);
      } else {
        // 执行普通卡牌效果
        await combat.resolveCardEffect(me, [target], card);
      }
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  const handleConfirmPlay = async () => {
    // Only for non-target cards (Tao, Wuzhong, Nanman, Wanjian, Wuxie) and special skill cases
    if (dyingState || isProcessing) return;
    if (!selectedCardIds.length) return;
    const me = players.find(p => p.isHuman) || players[0];
    const card = me.hand.find(c => c.id === selectedCardIds[0]);
    if (!card) return;
    // 董白「黠慧」：体力未减少时，获得的黑色牌不能使用
    if (xiaohuiLocked(me.id, card.id)) {
      addLog(`【黠慧】你获得的黑色牌【${card.name}】在体力减少前不能使用`, 'warning');
      return;
    }
    // 孙鲁育「魅步」止息：本回合使用牌已达上限
    {
      const zx = zhixiRef.current;
      if (zx && zx.id === me.id && zx.used >= zx.limit) {
        addLog(`【止息】你本回合至多使用 ${zx.limit} 张牌，已达上限`, 'warning');
        return;
      }
    }
    
    setIsProcessing(p => p + 1);
    try {
      // 处理赵云的特殊情况 - 杀通常需要目标，但赵云可以将杀当闪使用
      const isZhaoyunShaToShan = me.hero.name === '赵云' && card.name === CardName.SHA;
      
      // 处理赵云将杀当闪使用的情况
      if (isZhaoyunShaToShan) {
        addLog(`${me.hero.name} 使用技能「龙胆」，将【${card.name}】当【闪】使用`, 'skill');
        playCard(me.id, card);
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        return;
      }

      // Self target or All target or Selectable target
      if (card.name === CardName.WUZHONG) {
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await combat.resolveCardEffect(me, [me], card);
      } else if (card.name === CardName.TAO) {
        // 如果已经选择了目标，直接使用桃
        if (isSelectingTarget) {
          // 目标选择模式下，应该已经有了选中的卡牌和目标
          // 这里需要处理桃的目标使用
          const target = players.find(p => p.isSelected) || me;
          setSelectedCardIds([]);
          setIsSelectingTarget(false);
          await combat.resolveCardEffect(me, [target], card);
        } else {
          // 没有选择目标，默认对自己使用
          if (me.hp < me.maxHp) {
            setSelectedCardIds([]);
            setIsSelectingTarget(false);
            await combat.resolveCardEffect(me, [me], card);
          } else {
            addLog("体力已满，无需吃桃", 'warning');
            // 保持选择状态，不要清除选择
            return;
          }
        }
      } else if (card.name === CardName.NANMAN || card.name === CardName.WANJIAN) {
        const targets = players.filter(p => p.id !== me.id && !p.isDead);
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await combat.resolveCardEffect(me, targets, card);
      } else if (card.name === CardName.JIU) {
        // 酒可以对自己使用
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await combat.resolveCardEffect(me, [me], card);
      } else if (card.name === CardName.TIESUO) {
        // 铁索连环：使用玩家选择的目标
        if (tiesuoSelectedTargets.length > 0) {
          const selectedTargets = players.filter(p => tiesuoSelectedTargets.includes(p.id));
          setSelectedCardIds([]);
          setIsSelectingTarget(false);
          setTiesuoSelectedTargets([]);
          await combat.resolveCardEffect(me, selectedTargets, card);
        } else {
          addLog("请选择至少1个目标", 'warning');
          return;
        }
      } else if (card.name === CardName.WUGU || card.name === CardName.TAOYUAN) {
        // 五谷丰登和桃园结义：无需选择目标，直接生效
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await combat.resolveCardEffect(me, [], card);
      } else if (card.name === CardName.JIEDAO) {
        // 借刀杀人：使用已选择的两个目标
        if (jiedaoWeaponTarget && jiedaoVictimTarget) {
          const weaponPlayer = players.find(p => p.id === jiedaoWeaponTarget);
          const victimPlayer = players.find(p => p.id === jiedaoVictimTarget);
          if (weaponPlayer && victimPlayer) {
            setSelectedCardIds([]);
            setIsSelectingTarget(false);
            setIsJiedaoMode(false);
            setJiedaoWeaponTarget(null);
            setJiedaoVictimTarget(null);
            await combat.resolveCardEffect(me, [weaponPlayer, victimPlayer], card);
          }
        } else {
          addLog("请先选择两名目标角色", 'warning');
          return;
        }
      } else if (card.name === CardName.SHANDIAN) {
        // 闪电：对自己使用，放置到判定区
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await combat.resolveCardEffect(me, [me], card);
      }
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  const handleDiscardConfirm = () => {
    if (phase !== GamePhase.DISCARD) return;
    const me = players.find(p => p.isHuman) || players[0];
    const cards = me.hand.filter(c => selectedCardIds.includes(c.id));
    const excess = excessCards(me);
    
    if (cards.length !== excess) {
      addLog(`需弃置 ${excess} 张牌，已选 ${cards.length} 张`, 'warning');
      return;
    }
    
    discardCards(me.id, cards);
    setSelectedCardIds([]);
    addLog(`${me.hero.name} 弃置了 ${cards.length} 张牌`, 'info');
    setPhase(GamePhase.END);
  };

  const handleManualSkipReaction = () => {
    if (pendingReaction && humanReactionResolver.current) {
      humanReactionResolver.current({ played: false, isWuxie: false });
    }
  };

  // --- Effects Implementation ---

  // 专门的决斗执行函数 - 用于离间技能
  const executeDuel = async (attackerId: number, defenderId: number) => {
    let currentAttackerId = attackerId;
    let currentDefenderId = defenderId;
    let duelOver = false;
    let exchanges = 0;

    addLog(`决斗开始！`, 'danger');

    while (!duelOver) {
      // 兜底：正常决斗每轮都会消耗一张【杀】，不可能超过 40 轮；防止异常状态下死循环
      if (++exchanges > 40) {
        addLog('决斗回合异常，判定中止', 'warning');
        break;
      }
      // 让出一次宏任务，确保上一轮的出牌/体力更新已提交后再询问
      await delay(250);
      // 检查双方是否存活
      const attacker = getPlayer(currentAttackerId);
      const defender = getPlayer(currentDefenderId);
      
      if (!attacker || !defender) {
        addLog('决斗因角色阵亡结束', 'info');
        return;
      }

      if (attacker.isDead || defender.isDead) {
        addLog('因有角色阵亡，决斗结束', 'info');
        return;
      }

      // 当前攻击者出一张杀（询问是否出杀）
      addLog(`${attacker.hero.name} 出一张杀`, 'info');
      
      // 询问防御者是否出杀
      const defenderResponded = await combat.triggerReaction(defender.id, attacker.id, CardName.SHA, {
        id: 'duel-temp',
        name: CardName.JUEDOU,
        type: CardType.SCROLL,
        suit: Suit.SPADE,
        rank: 'A',
        value: 0,
        description: '决斗',
        imageColor: 'from-purple-800 to-indigo-900',
      } as Card);

      // 如果防御者没有出杀，攻击者对防御者造成1点伤害
      if (!defenderResponded) {
        addLog(`${defender.hero.name} 没有出杀，受到1点伤害！`, 'danger');
        applyDamage(defender.id, attacker.id, 1);
        duelOver = true;
      } else {
        // 角色互换，继续决斗
        addLog(`${defender.hero.name} 出了一张杀，决斗继续！`, 'info');
        const temp = currentAttackerId;
        currentAttackerId = currentDefenderId;
        currentDefenderId = temp;
      }
    }
  };

  // 应用伤害的辅助函数
  const applyDamage = async (victimId: number, sourceId: number, damage: number) => {
    const victim = getPlayer(victimId);
    if (!victim || victim.isDead) return;

    addLog(`${victim.hero.name} 受到 ${damage} 点伤害`, 'danger');
    playSound('damage');

    // 触发伤害动画和数字显示
    setDamageAnimTarget(victimId);
    setDamageNumber({ targetId: victimId, amount: damage, id: Date.now().toString() });

    setTimeout(() => setDamageAnimTarget(null), 600);
    setTimeout(() => setDamageNumber(null), 1000);

    const newHp = victim.hp - damage;
    updatePlayer(victimId, { hp: newHp });

    // 关银屏「虎啸」：锁定技，造成伤害后摸一张牌（原版无次数限制）
    if (sourceId >= 0) {
      const src = getPlayer(sourceId);
      if (src && !src.isDead && src.hero.name === '关银屏') {
        addLog(`${src.hero.name} 发动「虎啸」，摸一张牌`, 'skill');
        showSkillBanner(src.hero.name, '虎啸');
        drawCards(sourceId, 1);
      }
    }

    if (newHp <= 0 && !victim.isDead) {
      addLog(`${victim.hero.name} 进入濒死状态！`, 'danger');
      const saved = await combat.askForPeaches(victimId);
      // 求桃失败必须立即结算阵亡，否则 0 体力角色会继续留在场上、胜负判定也会被推迟
      if (!saved) await handleDeath(victimId, sourceId);
    }
  };

  // 出牌飞行（完整档）：实测两座位中心（扣除根节点缩放），走一段二次曲线到目标
  const spawnCardFlight = (card: Card, fromId: number, toId: number) => {
    const root = document.querySelector('[data-seat-stagger]') as HTMLElement | null;
    const fromEl = document.querySelector(`[data-seat-id="${fromId}"]`) as HTMLElement | null;
    const toEl = document.querySelector(`[data-seat-id="${toId}"]`) as HTMLElement | null;
    if (!root || !fromEl || !toEl) return;
    const rr = root.getBoundingClientRect();
    const scale = root.offsetWidth > 0 ? rr.width / root.offsetWidth : 1;
    const center = (r: DOMRect) => ({
      x: Math.round((r.left + r.width / 2 - rr.left) / scale),
      y: Math.round((r.top + r.height / 2 - rr.top) / scale),
    });
    const a = center(fromEl.getBoundingClientRect());
    const b = center(toEl.getBoundingClientRect());
    setFlightFx({ card, id: Date.now(), x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
    flightTimerRef.current = setTimeout(() => setFlightFx(null), Math.max(700, Math.round(780 / speedRef.current)));
  };

  // 判定演出：翻牌 0.62s + 停留 0.6s，合计约 1.2s；不随倍速压到看不清
  const showJudgmentVisual = (card: Card, playerName: string, reason: string, duration: number = 1300) => {
    if (judgmentTimerRef.current) clearTimeout(judgmentTimerRef.current);
    // 洛神 / 八卦阵这类「技能带判定」会同时出技能特写，会把判定牌压住
    // 判定演出优先，收起技能横幅（技能名已写在判定名牌里）
    if (skillBannerTimerRef.current) clearTimeout(skillBannerTimerRef.current);
    setSkillBanner(null);
    setJudgmentVisual({ card, playerName, reason, id: Date.now() });
    if (!isMutedRef.current) playSfx('flip');
    judgmentTimerRef.current = setTimeout(() => setJudgmentVisual(null), Math.max(1220, duration / speedRef.current));
  };

  // 技能发动横幅：武将名 + 技能名 金色大字短暂展示
  const showSkillBanner = useCallback((hero: string, skill: string) => {
    // 仅本地开发：把技能发动记录挂到 window，便于 headless 实测取证（生产构建移除）
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true) {
      const w = window as unknown as { __r4skills?: Array<{ hero: string; skill: string; t: number }> };
      (w.__r4skills ||= []).push({ hero, skill, t: Date.now() });
    }
    if (!isMutedRef.current) playSkillVoice(skill);
    // 找到发动者并高亮头像
    const caster = playersRef.current.find(p => p.hero.name === hero);
    if (caster) {
      if (skillGlowTimerRef.current) clearTimeout(skillGlowTimerRef.current);
      setSkillGlowId(caster.id);
      skillGlowTimerRef.current = setTimeout(() => setSkillGlowId(null), 1800);
    }
    if (skillBannerTimerRef.current) clearTimeout(skillBannerTimerRef.current);
    setSkillBanner({ hero, skill, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
    skillBannerTimerRef.current = setTimeout(() => setSkillBanner(null), 1200);
  }, []);

  // 卞夫人「挽危」（原版）：每回合限一次，当你的牌被其他角色弃置或获得后，
  // 从牌堆获得一张同名牌；牌堆中没有同名牌时改为摸一张牌。
  const triggerWanwei = (ownerId: number, names: string[]) => {
    if (wanweiUsedRef.current) return;
    const owner = getPlayer(ownerId);
    if (!owner || owner.isDead || owner.hero.name !== '卞夫人') return;
    wanweiUsedRef.current = true;
    const deck = [...deckRef.current];
    const idx = deck.findIndex(c => names.includes(c.name));
    if (idx >= 0) {
      const card = deck.splice(idx, 1)[0];
      setDeck(deck);
      deckRef.current = deck;
      mutateHand(ownerId, h => [...h, card]);
      addLog(`${owner.hero.name} 发动「挽危」，从牌堆获得同名牌【${card.name}】`, 'skill');
    } else {
      addLog(`${owner.hero.name} 发动「挽危」，牌堆无同名牌，改为摸一张牌`, 'skill');
      drawCardsRef.current?.(ownerId, 1);
    }
    showSkillBanner(owner.hero.name, '挽危');
  };

  // 通用判定：从牌堆顶翻一张判定牌并展示，返回判定牌
  const performJudgment = async (playerId: number, reason: string): Promise<Card | null> => {
    let currentDeck = [...deckRef.current];
    if (currentDeck.length === 0) {
      if (discardPileRef.current.length === 0) {
        addLog('牌堆与弃牌堆均空，判定失败', 'warning');
        return null;
      }
      currentDeck = shuffle([...discardPileRef.current]);
      setDiscardPile([]);
      discardPileRef.current = [];
      addLog('牌堆已洗切', 'info');
    }
    const judgmentCard = currentDeck.pop()!;
    setDeck(currentDeck);
    deckRef.current = currentDeck;

    const playerName = getPlayer(playerId)?.hero.name || '';
    // 小乔「红颜」：方块牌视为红桃
    const isXiaoqiao = playerName === '小乔';
    let finalCard = isXiaoqiao && judgmentCard.suit === Suit.DIAMOND
      ? { ...judgmentCard, suit: Suit.HEART }
      : judgmentCard;
    // 张琪瑛「真仪·紫微」：判定牌生效前弃置标记，改为黑桃5/红桃5
    let zhenyiNote = '';
    const zqy = playersRef.current.find(p => !p.isDead && p.hero.name === '张琪瑛'
      && hasZhangMark(p, '紫微') && skillsOn(p.id));
    if (zqy) {
      const judged = getPlayer(playerId);
      const friendly = playerId === zqy.id || (judged ? isAlly(zqy, judged) : false);
      const wantBlack = reason === '洛神' && playerId === zqy.id;
      const redBad = reason === '闪电' && finalCard.suit === Suit.SPADE && finalCard.value >= 2 && finalCard.value <= 9;
      const notSafe = (reason === '乐不思蜀' || reason === '兵粮寸断') && finalCard.suit !== Suit.HEART;
      const blackWeak = wantBlack && !(finalCard.suit === Suit.SPADE || finalCard.suit === Suit.CLUB);
      if (friendly && (redBad || notSafe || blackWeak)) {
        finalCard = { ...finalCard, suit: wantBlack ? Suit.SPADE : Suit.HEART, rank: '5', value: 5 };
        updatePlayer(zqy.id, { zhangMarks: (zqy.zhangMarks ?? []).filter(m => m !== '紫微') });
        zhenyiNote = `，触发「真仪·紫微」改为${wantBlack ? '黑桃' : '红桃'}5`;
        addLog('【真仪·紫微】张琪瑛弃置“紫微”标记，改变判定结果', 'skill');
        showSkillBanner('张琪瑛', '真仪');
      }
    }
    // 司马懿「鬼才」：判定牌生效前，可打出一张手牌替换之
    let guicaiNote = '';
    const simayi = playersRef.current.find(p => !p.isDead && p.hero.name === '司马懿' && skillsOn(p.id) && p.hand.length > 0);
    if (simayi) {
      const badJudge = (c: Card) => {
        if (reason === '闪电') return c.suit === Suit.SPADE && c.value >= 2 && c.value <= 9;
        if (reason === '乐不思蜀' || reason === '兵粮寸断') return c.suit !== Suit.HEART;
        if (reason === '洛神') return !(c.suit === Suit.SPADE || c.suit === Suit.CLUB);
        return false;
      };
      const judged = getPlayer(playerId);
      const friendly = simayi.id === playerId || (judged ? isAlly(simayi, judged) : false);
      let replaceCard: Card | null = null;
      if (simayi.isHuman && !isAiTakeoverRef.current) {
        // 人类玩家：弹窗选择是否用手牌替换判定牌；托管时走下方 AI 分支
        const pick = await requestSkillChoice({
          skill: '鬼才',
          owner: '司马懿',
          title: `${playerName} 的【${reason}】判定为 ${finalCard.suit}${finalCard.rank}，是否打出一张手牌替换？`,
          hint: '规则：在一名角色的判定牌生效前，你可以打出一张手牌代替之',
          mode: 'card',
          cards: simayi.hand,
          min: 1,
          max: 1,
          cancelLabel: '不发动',
        }, true);
        if (pick && pick.kind === 'card') {
          replaceCard = simayi.hand.find(c => c.id === pick.ids[0]) ?? null;
        } else if (pick && pick.kind === 'timeout') {
          replaceCard = friendly && badJudge(finalCard)
            ? ([...simayi.hand].filter(c => !badJudge(c)).sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0] ?? null)
            : null;
        }
      } else if (friendly && badJudge(finalCard)) {
        // AI：仅当判定对象为己方且当前结果不利时，取点数最小的“不坏”手牌替换
        replaceCard = [...simayi.hand].filter(c => !badJudge(c)).sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0] ?? null;
      }
      if (replaceCard) {
        mutateHand(simayi.id, h => h.filter(c => c.id !== replaceCard!.id));
        setDiscardPile(prev => {
          const next = [...prev, judgmentCard];
          discardPileRef.current = next;
          return next;
        });
        finalCard = replaceCard;
        guicaiNote = `，触发「鬼才」改为【${replaceCard.name}】`;
        addLog(`【鬼才】司马懿打出【${replaceCard.name}】替换 ${playerName} 的【${reason}】判定牌（原 ${judgmentCard.suit}${judgmentCard.rank}）${simayi.isHuman ? '（玩家选择）' : '（自动）'}`, 'skill');
        showSkillBanner('司马懿', '鬼才');
      }
    }
    const rankDisplay = finalCard.rank;
    addLog(`⚖️ ${playerName} 的【${reason}】判定：${finalCard.suit} ${rankDisplay}（判定牌：【${judgmentCard.name}】）${isXiaoqiao && finalCard.suit !== judgmentCard.suit ? '，触发「红颜」视为红桃' : ''}${zhenyiNote}${guicaiNote}`, 'warning');
    showJudgmentVisual(finalCard, playerName, reason);
    await delay(1600);
    // 郭嘉「天妒」：判定牌生效后获得之
    if (playerName === '郭嘉') {
      mutateHand(playerId, hand => [...hand, finalCard]);
      addLog(`${playerName} 发动「天妒」，获得判定牌【${finalCard.name}】`, 'skill');
      showSkillBanner(playerName, '天妒');
    }
    // 张宁「天则」①：其他角色的黑色判定牌生效后，张宁摸一张牌
    {
      const zn = playersRef.current.find(x => !x.isDead && x.hero.name === '张宁' && skillsOn(x.id));
      const judgeOwner = playersRef.current.find(x => x.id === playerId) ?? null;
      if (zn && judgeOwner && tianzeDraws(finalCard, judgeOwner, zn)) {
        drawCards(zn.id, 1);
        addLog(`【天则】${judgeOwner.hero.name} 判定为黑色（${finalCard.suit}），张宁摸一张牌`, 'skill');
        showSkillBanner('张宁', '天则');
        await delay(300);
      }
    }
    return finalCard;
  };

  // 张星彩「枪舞」：出牌阶段限一次，进行判定；
  // 本回合内点数小于判定结果的【杀】无距离限制，点数大于判定结果的【杀】不计次数。
  const activateQiangwu = async () => {
    const human = playersRef.current.find(p => p.isHuman);
    const me = human ? getPlayer(human.id) : null;
    if (!me || me.isDead || me.hero.name !== '张星彩' || qiangwuUsedRef.current) return;
    qiangwuUsedRef.current = true;
    setHasUsedQiangwu(true);
    const jc = await performJudgment(me.id, '枪舞');
    if (!jc) return;
    const pt = rankValue(jc.rank);
    qiangwuPointRef.current = pt;
    setQiangwuPoint(pt);
    addLog(`${me.hero.name} 发动「枪舞」：判定点数 ${pt}，点数小于 ${pt} 的【杀】无距离限制，点数大于 ${pt} 的【杀】不计次数`, 'skill');
    showSkillBanner(me.hero.name, '枪舞');
  };

  const playCard = (playerId: number, card: Card) => {
    usedTypesRef.current.add(card.type); // 蔡贞姬「天音」：记录本回合使用过的牌类型
    // 卞夫人「约俭」：牌**置入弃牌堆**的这一刻才展示手牌并判定花色（每回合限两次）
    const yjBfId = yuejianPendingRef.current.get(card.id);
    if (yjBfId !== undefined) {
      yuejianPendingRef.current.delete(card.id);
      const bf = getPlayer(yjBfId);
      if (bf && !bf.isDead && skillsOn(bf.id) && yuejianCountRef.current < 2) {
        const shown = bf.hand.map(c => `${c.suit}【${c.name}】`).join(' ');
        addLog(`【约俭】卞夫人展示手牌：${shown || '（无）'}`, 'skill');
        yuejianCountRef.current += 1;
        const sameSuit = bf.hand.some(c => c.suit === card.suit);
        if (!sameSuit) {
          mutateHand(playerId, h => h.filter(c => c.id !== card.id));
          mutateHand(bf.id, h => [...h, card]);
          addLog(`【约俭】卞夫人手牌均无 ${card.suit} 花色，获得置入弃牌堆的【${card.name}】`, 'skill');
          showSkillBanner('卞夫人', '约俭');
          showCardVisual(card, getPlayer(playerId)?.hero.name || '', 1200, getPlayer(playerId)?.hero.gender);
          return;
        }
        addLog(`【约俭】卞夫人手牌中有 ${card.suit} 花色，未获得【${card.name}】`, 'info');
        showSkillBanner('卞夫人', '约俭');
      }
    }
    discardCards(playerId, [card]);
    showCardVisual(card, getPlayer(playerId)?.hero.name || '', 1200, getPlayer(playerId)?.hero.gender);
  };

  // 结束出牌阶段：若是「当先」的额外出牌阶段，则回到正常回合流程（判定阶段），否则进入弃牌阶段
  const leaveActionPhase = () => {
    const dx = dangxianExtraPhaseRef.current;
    if (dx && dx.active) {
      dx.active = false;
      const owner = getPlayer(turnIndex);
      addLog(`【当先】${owner?.hero.name ?? ''} 的额外出牌阶段结束，继续正常回合流程`, 'info');
      setPhase(GamePhase.JUDGE);
      return;
    }
    setPhase(GamePhase.DISCARD);
  };

  // 「止息」闸门需要在 cpuAI 内遮蔽同名函数，这里保留一份本名别名供其内部调用
  // ── 对局战斗引擎接线 ──
  // 6 个互相递归的结算函数已搬到 src/game/combat.ts（函数体逐字保留，未改一行）。
  // 它们共用本组件的 93 个闭包，其中若干（grantXushenToRescuer / shouldAiSavePlayer /
  // triggerBeige / tryZhenlie 等）在本文件里声明在更靠后的位置，而这 6 个函数在早期就被调用。
  // 所以引擎改为「首次调用时才组装」：调用点一律走 combat.xxx(...)，组装发生在那一刻，
  // 此时下方所有声明都已初始化——与搬出前按词法作用域按需查找的语义完全一致。
  let combatEngine: CombatEngine | null = null;
  const getCombatEngine = (): CombatEngine => {
    if (!combatEngine) {
      combatEngine = createCombatEngine({
    DECISION_SECONDS,
    MAX_WUXIE_DEPTH,
    addDelayedTrick,
    addLog,
    aiDifficultyRef,
    canReach,
    canUseWusheng,
    cangHuiUsedRef,
    chainWaveRef,
    deckRef,
    delay,
    discardCards,
    discardPileRef,
    drawCards,
    dyingResolver,
    dyingTickRef,
    dyingTimeoutRef,
    fengpoBoostRef,
    fengpoUsedRef,
    firstUsedCardRef,
    turnOwnerIdRef,
    fangduUsedRef,
    lingleUsedRef,
    kanggeRescueRef,
    fumianTargetUsedRef,
    fxFly,
    gainThreeTypes,
    getDistance,
    getPlayer,
    getTargetLegalityVeto,
    getTargetProtection,
    grantXushenToRescuer,
    guohuanghouLevelRef,
    handleDeath,
    hasGrantedSkill,
    hasWeimu,
    hasZhangMark,
    humanReactionResolver,
    identityGuessRef,
    isAiTakeover,
    isAiTakeoverRef,
    isAlly,
    isEnemy,
    lastShuanghuaiTargetRef,
    leaveActionPhase,
    lingrenBoostRef,
    lingrenUsedRef,
    lockXiaohuiCards,
    luoyiPlayerRef,
    mumuNoSlashRef,
    mutateHand,
    onEquipLost,
    performJudgment,
    phaseLiveRef,
    playCard,
    playSound,
    players,
    playersRef,
    reactionTickRef,
    recentlySavedRef,
    recoverHp,
    requestSkillChoice,
    setDamageAnimTarget,
    setDyingLeft,
    setDyingState,
    setGuohuanghouLevel,
    setHealAnimTarget,
    setHealNumber,
    setIsProcessing,
    setPendingReaction,
    setReactionLeft,
    setWuguSelection,
    sheyiUsedRef,
    shouldAiSavePlayer,
    shouxiDeclaredRef,
    showSkillBanner,
    shuanghuaiUsedRef,
    skillsOn,
    slashUsageRef,
    spawnCardFlight,
    timeoutIdRef,
    triggerBeige,
    triggerLieren,
    triggerShuyong,
    triggerWanwei,
    triggerXiaoji,
    tryZhenlie,
    turnCountRef,
    turnIndex,
    turnUsedOnOthersRef,
    updatePlayer,
    updatePlayerWith,
    xiaohuiLocked,
    yuejianCountRef,
    yuejianPendingRef,
    zhixiRef,
    zhuquePrefRef,
      } as CombatDeps);
    }
    return combatEngine;
  };
  const combat: CombatEngine = {
    resolveCardEffect: (source, targets, card) => getCombatEngine().resolveCardEffect(source, targets, card),
    resolveWuxieChain: (sourceId, triggerCard) => getCombatEngine().resolveWuxieChain(sourceId, triggerCard),
    triggerReaction: (responderId, sourceId, neededCard, triggerCard, isSecondReaction) =>
      getCombatEngine().triggerReaction(responderId, sourceId, neededCard, triggerCard, isSecondReaction),
    askForPeaches: (victimId) => getCombatEngine().askForPeaches(victimId),
    takeDamage: (victimId, sourceId, amount, damageCard, nature) =>
      getCombatEngine().takeDamage(victimId, sourceId, amount, damageCard, nature),
    triggerZhennan: (source, finalTargets, card) => getCombatEngine().triggerZhennan(source, finalTargets, card),
  };
  // 引擎原始 resolveCardEffect（AI 侧在 cpuAI 内再包一层「止息」闸门时作为基底）
  const resolveCardEffectBase = combat.resolveCardEffect;

  // 孙寒华「集灵」：连翻 5 张牌，红牌（莲花）+1 分、黑牌（天雷）-1 分，分数区间 0～5
  const performJiling = async (playerId: number): Promise<number> => {
    let score = 0;
    const parts: string[] = [];
    const flipped: Card[] = [];
    for (let i = 0; i < 5; i++) {
      let pool = [...deckRef.current];
      if (pool.length === 0) {
        pool = shuffle([...discardPileRef.current]);
        discardPileRef.current = [];
        setDiscardPile([]);
        addLog('牌堆已洗切', 'info');
      }
      if (pool.length === 0) break;
      const card = pool.pop() as Card;
      deckRef.current = pool;
      setDeck(pool);
      flipped.push(card);
      const isRed = card.suit === Suit.HEART || card.suit === Suit.DIAMOND;
      score = Math.max(0, Math.min(5, score + (isRed ? 1 : -1)));
      parts.push(`${isRed ? '莲花' : '天雷'}【${card.name}】${isRed ? '+1' : '-1'}`);
      await delay(320);
    }
    if (flipped.length) {
      const dp = [...discardPileRef.current, ...flipped];
      discardPileRef.current = dp;
      setDiscardPile(dp);
    }
    addLog(`${getPlayer(playerId)?.hero.name ?? '孙寒华'}「集灵」：${parts.join('，')}，最终 ${score} 分`, 'skill');
    showSkillBanner(getPlayer(playerId)?.hero.name ?? '孙寒华', '冲虚');
    return score;
  };

  /**
   * 无懈可击询问链（官方规则）：
   * - 锦囊生效前，按座次依次询问所有合法角色（存活且手中有【无懈可击】）是否使用；
   * - 一旦有人使用，该层结束，进入下一层：对这张【无懈可击】本身继续按座次询问是否反制；
   * - 每层都重新按座次询问，但同一角色在同一链条中只被询问一次（asked 集合）；
   * - 层数奇偶决定原锦囊最终是否被抵消。
   * 返回 true = 原锦囊效果被抵消；false = 原锦囊最终生效。
   */
  // 许身：鲍三娘因许身进入濒死并被他人用【桃】/【酒】救活后，救援者获得「武圣」「当先」
  const grantXushenToRescuer = (victimId: number, rescuerId: number) => {
    const flag = xushenDyingRef.current;
    if (!flag || flag.id !== victimId) return;
    const victim = getPlayer(victimId);
    const rescuer = getPlayer(rescuerId);
    if (!victim || !rescuer || rescuer.isDead || rescuer.id === victimId) return;
    if (victim.hero.name !== '鲍三娘') return;
    xushenDyingRef.current = null;
    xushenGrantTurnsRef.current[rescuerId] = turnCountRef.current;
    addLog(`【许身】${rescuer.hero.name} 使鲍三娘脱离濒死，获得「武圣」与「当先」直到其下回合结束`, 'skill');
    showSkillBanner('鲍三娘', '许身');
    grantSkill(rescuerId, '武圣', '许身');
    grantSkill(rescuerId, '当先', '许身');
  };

  // AI是否救援的决策函数
  // 决策树见 src/game/ai/rescue.ts（纯函数，已单测覆盖）
  const shouldAiSavePlayer = (rescuer: Player, victim: Player): boolean => shouldAiSavePlayerImpl(
    rescuer,
    victim,
    {
      difficulty: aiDifficultyRef.current,
      rebelsAlive: playersRef.current.some(p => !p.isDead && p.identity === Identity.FANZEI),
    },
  );

  // 黄盖「苦肉」：失去1点体力，摸两张牌
  const resolveKurou = async (playerId: number) => {
    const p = getPlayer(playerId);
    if (!p || p.isDead || p.hero.name !== '黄盖') return;
    setIsProcessing(v => v + 1);
    try {
      updatePlayer(playerId, { hp: p.hp - 1 });
      addLog(`${p.hero.name} 发动「苦肉」，失去1点体力`, 'skill');
      showSkillBanner(p.hero.name, '苦肉');
      drawCards(playerId, 2);
      addLog(`${p.hero.name} 摸了两张牌`, 'success');
      await delay(400);
      const after = getPlayer(playerId);
      if (after && after.hp <= 0 && !after.isDead) {
        const saved = await combat.askForPeaches(playerId);
        if (!saved) await handleDeath(playerId);
      }
    } finally {
      setIsProcessing(v => Math.max(0, v - 1));
    }
  };

  // 蔡文姬「悲歌」：一名角色受到【杀】伤害后，弃一张牌判定
  const triggerBeige = async (victimId: number, sourceId: number, damageCard?: Card) => {
    if (damageCard?.name !== CardName.SHA) return;
    const cai = playersRef.current.find(p => !p.isDead && p.hero.name === '蔡文姬');
    if (!cai || cai.hand.length === 0) return;
    const cost = cai.hand.find(c => c.name !== CardName.TAO && c.name !== CardName.SHAN) || cai.hand[0];
    discardCards(cai.id, [cost]);
    addLog(`${cai.hero.name} 发动「悲歌」，弃置【${cost.name}】进行判定`, 'skill');
    showSkillBanner(cai.hero.name, '悲歌');
    const jc = await performJudgment(cai.id, '悲歌');
    if (!jc) return;
    const victim = getPlayer(victimId);
    const attacker = getPlayer(sourceId);
    if (jc.suit === Suit.HEART && victim && !victim.isDead) {
      recoverHp(victim.id, 1);
      addLog(`「悲歌」判定为红桃，${victim.hero.name} 回复1点体力`, 'success');
    } else if (jc.suit === Suit.DIAMOND && victim && !victim.isDead) {
      drawCards(victim.id, 2);
      addLog(`「悲歌」判定为方块，${victim.hero.name} 摸两张牌`, 'success');
    } else if (jc.suit === Suit.CLUB && attacker && !attacker.isDead) {
      const discard = attacker.hand.slice(0, 2);
      discardCards(attacker.id, discard);
      addLog(`「悲歌」判定为梅花，${attacker.hero.name} 弃置 ${discard.length} 张牌`, 'warning');
    } else if (jc.suit === Suit.SPADE && attacker && !attacker.isDead) {
      const discard = attacker.hand.slice(0, 1);
      discardCards(attacker.id, discard);
      addLog(`「悲歌」判定为黑桃，${attacker.hero.name} 弃置一张牌`, 'warning');
    }
  };

  // 祝融「烈刃」：使用【杀】造成伤害后与目标拼点，赢则获得其一张牌
  const triggerLieren = async (victimId: number, sourceId: number, damageCard?: Card) => {
    if (damageCard?.name !== CardName.SHA) return;
    const source = getPlayer(sourceId);
    const victim = getPlayer(victimId);
    if (!source || !victim || source.isDead || victim.isDead || sourceId === victimId) return;
    if (source.hero.name !== '祝融' || source.hand.length === 0 || victim.hand.length === 0) return;
    const sourceCard = [...source.hand].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
    const victimCard = [...victim.hand].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
    discardCards(sourceId, [sourceCard]);
    discardCards(victimId, [victimCard]);
    addLog(`【烈刃】拼点：${source.hero.name} ${sourceCard.rank} vs ${victim.hero.name} ${victimCard.rank}`, 'skill');
    showSkillBanner(source.hero.name, '烈刃');
    if (rankValue(sourceCard.rank) > rankValue(victimCard.rank)) {
      const currentVictim = getPlayer(victimId);
      if (currentVictim && currentVictim.hand.length > 0) {
        const gained = currentVictim.hand[Math.floor(Math.random() * currentVictim.hand.length)];
        mutateHand(victimId, hand => hand.filter(c => c.id !== gained.id));
        mutateHand(sourceId, hand => [...hand, gained]);
        addLog(`「烈刃」获胜，${source.hero.name} 获得 ${victim.hero.name} 的【${gained.name}】`, 'success');
      }
    } else {
      addLog(`「烈刃」拼点未获胜`, 'info');
    }
  };

  // 鲍三娘「镇南」：一张牌指定多个目标后，若鲍三娘为目标之一且目标数大于使用者当前体力值，
  // 可弃置一张牌，对使用者造成1点伤害。多目标【杀】（福绵/方天画戟）同样适用。
  // 鲍三娘「姝勇」：使用或打出【杀】时，可获得一名其他角色区域内
  // （手牌 / 装备区 / 判定区）的一张牌，然后其摸一张牌。
  const triggerShuyong = async (ownerId: number, preferredVictimId?: number) => {
    const bao = getPlayer(ownerId);
    if (!bao || bao.isDead || bao.hero.name !== '鲍三娘' || !skillsOn(ownerId)) return;
    type ZoneEntry = { card: Card; zone: 'hand' | 'equip' | 'judge'; slot?: string };
    const zonesOf = (p: Player): ZoneEntry[] => {
      const entries: ZoneEntry[] = [];
      p.hand.forEach(c => entries.push({ card: c, zone: 'hand' }));
      Object.entries(p.equipment ?? {}).forEach(([slot, c]) => {
        if (c) entries.push({ card: c as Card, zone: 'equip', slot });
      });
      (p.judgeZone ?? []).forEach(c => entries.push({ card: c, zone: 'judge' }));
      return entries;
    };
    const pool = playersRef.current.filter(p => !p.isDead && p.id !== ownerId && zonesOf(p).length > 0);
    if (pool.length === 0) return;
    const victim = (preferredVictimId != null ? pool.find(p => p.id === preferredVictimId) : undefined)
      ?? [...pool].sort((a, b) => b.hand.length - a.hand.length)[0];
    const entries = zonesOf(victim);
    const handEntries = entries.filter(e => e.zone === 'hand');
    const entry = handEntries.sort((a, b) => a.card.value - b.card.value)[0]
      ?? entries.find(e => e.zone === 'equip')
      ?? entries[0];
    if (!entry) return;
    if (entry.zone === 'hand') {
      mutateHand(victim.id, h => h.filter(c => c.id !== entry.card.id));
    } else if (entry.zone === 'equip') {
      updatePlayerWith(victim.id, p => {
        const nextEquip = { ...(p.equipment ?? {}) };
        if (entry.slot) delete nextEquip[entry.slot as keyof typeof nextEquip];
        return { equipment: nextEquip };
      });
      onEquipLost(victim.id, entry.card.name);
    } else {
      updatePlayerWith(victim.id, p => {
        const zone = (p.judgeZone ?? []).filter(c => c.id !== entry.card.id);
        return {
          judgeZone: zone,
          isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
          isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
          isShandian: zone.some(c => c.name === CardName.SHANDIAN),
        };
      });
    }
    mutateHand(ownerId, h => [...h, entry.card]);
    const zoneLabel = entry.zone === 'hand' ? '手牌' : entry.zone === 'equip' ? '装备区' : '判定区';
    addLog(`【姝勇】鲍三娘获得 ${victim.hero.name} ${zoneLabel}的【${entry.card.name}】，其摸一张牌`, 'skill');
    showSkillBanner('鲍三娘', '姝勇');
    drawCards(victim.id, 1);
    await delay(300);
  };

  // 王异「贞烈」：成为【杀】或非延时锦囊目标时，失去1点体力弃其一张手牌，令此牌无效
  const tryZhenlie = async (target: Player, source: Player, card: Card): Promise<boolean> => {
    if (target.hero.name !== '王异' || target.id === source.id || target.isDead || target.hp <= 1) return false;
    // 官方覆盖：其他角色使用的【杀】或「非延时锦囊牌」全部牌型
    // （延时锦囊：乐不思蜀 / 兵粮寸断 / 闪电 不在其列）
    const delayedTricks: CardName[] = [CardName.LESI, CardName.BINGLIANG, CardName.SHANDIAN];
    const isNonDelayedTrick = card.type === CardType.SCROLL && !delayedTricks.includes(card.name);
    if (card.name !== CardName.SHA && !isNonDelayedTrick) return false;
    const attacker = getPlayer(source.id);
    if (!attacker || attacker.hand.length === 0) return false;
    updatePlayer(target.id, { hp: target.hp - 1 });
    const cost = attacker.hand[0];
    discardCards(attacker.id, [cost]);
    addLog(`${target.hero.name} 发动「贞烈」，失去1点体力并弃置【${cost.name}】，令【${card.name}】无效`, 'skill');
    showSkillBanner(target.hero.name, '贞烈');
    await delay(400);
    return true;
  };

  // 步练师「安恤」：让手牌少者获得手牌多者一张，若之后相等则摸一张
  const resolveAnxu = async (meId: number, targetIds: number[]) => {
    const me = getPlayer(meId);
    const a = getPlayer(targetIds[0]);
    const b = getPlayer(targetIds[1]);
    if (!me || !a || !b || a.isDead || b.isDead || a.id === b.id) return false;
    if (a.hand.length === b.hand.length) {
      addLog('「安恤」需要两名手牌数不同的角色', 'warning');
      setAnxuTargets([]);
      return false;
    }
    const fewer = a.hand.length < b.hand.length ? a : b;
    const more = a.hand.length > b.hand.length ? a : b;
    if (more.hand.length === 0) return false;
    const given = more.hand[Math.floor(Math.random() * more.hand.length)];
    mutateHand(more.id, hand => hand.filter(c => c.id !== given.id));
    mutateHand(fewer.id, hand => [...hand, given]);
    addLog(`${me.hero.name} 发动「安恤」，${fewer.hero.name} 获得 ${more.hero.name} 的【${given.name}】`, 'skill');
    showSkillBanner(me.hero.name, '安恤');
    setHasUsedAnxu(true);
    setIsAnxuMode(false);
    setAnxuTargets([]);
    setIsSelectingTarget(false);
    await delay(400);
    const afterFewer = getPlayer(fewer.id);
    const afterMore = getPlayer(more.id);
    if (afterFewer && afterMore && afterFewer.hand.length === afterMore.hand.length) {
      drawCards(meId, 1);
      addLog(`「安恤」后两人手牌数相等，${me.hero.name} 摸一张牌`, 'success');
    }
    return true;
  };

  // 张昌蒲「严教」：把指定花色的全部手牌交给一名其他角色，然后对其造成 1 点伤害；
  // 下回合开始时按交出数量摸回（yanjiaoCount 在回合开始结算）。
  const doYanjiao = async (ownerId: number, targetId: number, suit: Suit) => {
    const owner = getPlayer(ownerId);
    const target = getPlayer(targetId);
    if (!owner || !target || target.isDead || targetId === ownerId) return false;
    if (yanjiaoUsedRef.current) return false;
    const cards = owner.hand.filter(c => c.suit === suit);
    if (!cards.length) return false;
    yanjiaoUsedRef.current = true;
    setHasUsedYanjiao(true);
    mutateHand(ownerId, h => h.filter(c => c.suit !== suit));
    mutateHand(targetId, h => [...h, ...cards]);
    updatePlayer(ownerId, { yanjiaoCount: (owner.yanjiaoCount ?? 0) + cards.length });
    addLog(`【严教】${owner.hero.name} 将 ${cards.length} 张${suit}牌交给 ${target.hero.name}，并对其造成1点伤害`, 'skill');
    showSkillBanner(owner.hero.name, '严教');
    await delay(300);
    await combat.takeDamage(targetId, ownerId, 1, undefined, undefined);
    return true;
  };

  // 关银屏「血祭」：出牌阶段限一次，弃置一张红色牌，
  // 对攻击范围内至多 X 名其他角色各造成 1 点伤害，这些角色各摸一张牌（X = 已损失体力值）。
  const resolveXueji = async (ownerId: number) => {
    const owner = getPlayer(ownerId);
    if (!owner || owner.isDead || owner.hero.name !== '关银屏' || xuejiUsedRef.current) return;
    const lost = owner.maxHp - owner.hp;
    if (lost <= 0) return;
    const redCards = owner.hand.filter(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
    if (redCards.length === 0) return;
    // 官方：攻击范围内至多 X 名「其他角色」，不限敌我
    const candidates = playersRef.current.filter(p => !p.isDead && p.id !== ownerId && canReach(owner, p));
    if (candidates.length === 0) return;
    const maxVictims = Math.min(lost, candidates.length);

    let cost = redCards[0];
    let victims: Player[] = [];
    if (owner.isHuman && !isAiTakeover) {
      // 人类：先选弃置的红色牌，再选至多 X 名范围内的任意其他角色
      if (redCards.length > 1) {
        const pickCard = await requestSkillChoice({
          skill: '血祭',
          owner: owner.hero.name,
          title: '选择要弃置的红色牌',
          mode: 'card',
          cards: redCards,
          min: 1,
          max: 1,
          cancelLabel: '不发动',
        });
        if (!pickCard || pickCard.kind === 'cancel' || pickCard.kind === 'timeout') return;
        if (pickCard.kind === 'card' && pickCard.ids.length) {
          cost = redCards.find(c => c.id === pickCard.ids[0]) ?? redCards[0];
        }
      }
      const pickTargets = await requestSkillChoice({
        skill: '血祭',
        owner: owner.hero.name,
        title: `选择至多 ${maxVictims} 名攻击范围内的角色（已损失体力 ${lost}）`,
        hint: '可指定任意其他角色，不限敌我；伤害结算后目标各摸一张牌',
        mode: 'target',
        targets: candidates.map(p => ({ id: p.id, name: p.hero.name, sub: `体力 ${p.hp}/${p.maxHp}` })),
        min: 1,
        max: maxVictims,
        cancelLabel: '不发动',
      });
      if (!pickTargets || pickTargets.kind === 'cancel' || pickTargets.kind === 'timeout') return;
      victims = candidates.filter(p => pickTargets.kind === 'target' && pickTargets.ids.includes(p.id));
      if (victims.length === 0) return;
    } else {
      victims = candidates
        .filter(p => isEnemy(owner, p))
        .sort((a, b) => a.hp - b.hp || a.hand.length - b.hand.length)
        .slice(0, maxVictims);
      if (victims.length === 0) return;
    }
    xuejiUsedRef.current = true;
    setHasUsedXueji(true);
    discardCards(ownerId, [cost]);
    addLog(`${owner.hero.name} 发动「血祭」，弃置【${cost.name}】，对 ${victims.map(t => t.hero.name).join('、')} 各造成 1 点伤害`, 'skill');
    showSkillBanner(owner.hero.name, '血祭');
    await delay(500);
    for (const t of victims) {
      if (getPlayer(t.id)?.isDead) continue;
      await combat.takeDamage(t.id, ownerId, 1);
      const after = getPlayer(t.id);
      if (after && !after.isDead) {
        drawCards(t.id, 1);
        addLog(`「血祭」${after.hero.name} 摸一张牌`, 'info');
      }
    }
  };

  // --- AI Logic ---
  
  const cpuAI = async (aiPlayer: Player) => {
    aiTurnActiveRef.current = true;
    dbgMark(`cpu:enter:${aiPlayer.hero.name}`);
    // 邹氏「倾城」：被暗置的角色技能不发动
    const aiSkillsOn = skillsOn(aiPlayer.id);
    // 孙鲁育「魅步」止息：AI 侧同样受"至多使用 X 张牌、使用锦囊后结束出牌阶段"限制
    // （在本函数内遮蔽 resolveCardEffect，所有出牌分支自动走此闸门；超限时静默跳过，
    //  并刷新进度心跳，避免看门狗把"到期不应出牌"误判为卡死）
    const baseResolveCardEffect = resolveCardEffectBase;
    const resolveCardEffect = async (src: Player, tgs: Player[], cd: Card): Promise<void> => {
      const zx = zhixiRef.current;
      if (zx && zx.id === src.id) {
        if (zx.used >= zx.limit || zx.trickUsed) {
          if (zx.used >= zx.limit && !zx.trickUsed) {
            addLog(`【止息】${src.hero.name} 本回合已使用 ${zx.used} 张牌，达到上限，不再出牌`, 'info');
            zx.trickUsed = true; // 用同一标记停止后续尝试，避免刷屏
          }
          progressAtRef.current = Date.now();
          return;
        }
      }
      await baseResolveCardEffect(src, tgs, cd);
    };
    // 出牌前先「思考」：头像暖光 + 随机 300~800ms，AI 不再瞬发
    await aiThink(aiPlayer.id);

    const alivePlayers = players.filter(p => !p.isDead && p.id !== aiPlayer.id);
    let targetId = -1;

    // 0. 黄盖「苦肉」：手牌少且体力充足时卖血摸牌
    if (aiSkillsOn && aiPlayer.hero.name === '黄盖' && aiPlayer.hp > 2 && aiPlayer.hand.length <= 3) {
      await resolveKurou(aiPlayer.id);
      const refreshed = getPlayer(aiPlayer.id);
      if (refreshed) aiPlayer = refreshed;
      await delay(600);
    }

    // 0. 关银屏「血祭」：已受伤且范围内有敌人时发动
    if (aiSkillsOn && aiPlayer.hero.name === '关银屏' && !xuejiUsedRef.current && aiPlayer.maxHp > aiPlayer.hp) {
      await resolveXueji(aiPlayer.id);
      const refreshed = getPlayer(aiPlayer.id);
      if (refreshed) aiPlayer = refreshed;
      await delay(600);
    }

    // 0. 装备优先：空槽直接上装，武器仅替换为攻击范围更大的
    // 注意：用最新状态判断装备槽，避免传进来的 aiPlayer 快照装备信息过期，
    // 导致重复装备同一件防具（日志里会出现「弃置旧装备【白银狮子】→ 又装备白银狮子」）
    const equipLive = getPlayer(aiPlayer.id) ?? aiPlayer;
    const equipCandidates = equipLive.hand.filter(c => c.type === CardType.EQUIPMENT && EQUIP_META[c.name]);
    if (equipCandidates.length > 0) {
      const pick = equipCandidates.sort((a, b) => (EQUIP_META[b.name]?.range ?? 0) - (EQUIP_META[a.name]?.range ?? 0))[0];
      const slot = EQUIP_META[pick.name]!.slot;
      const current = equipLive.equipment?.[slot];
      const betterWeapon = slot === 'weapon' && (!current || (EQUIP_META[pick.name]?.range ?? 0) > (EQUIP_META[current.name]?.range ?? 0));
      if (!current || betterWeapon) {
        equipCard(equipLive.id, pick);
        await delay(900);
      }
    }

    // 1. Sun Quan's Zhiheng Skill: AI automatically uses it when appropriate
    if (aiSkillsOn && aiPlayer.hero.name === '孙权') {
      // Simple AI strategy: Use Zhiheng when hand has more than 3 cards and has at least 1 useless card
      // Define useless cards: Shan (if more than 2 in hand), Sha (if more than 2 in hand)
      const shaCount = aiPlayer.hand.filter(c => c.name === CardName.SHA).length;
      const shanCount = aiPlayer.hand.filter(c => c.name === CardName.SHAN).length;
      
      let cardsToDiscard: Card[] = [];
      
      // Excess Shan cards
      if (shanCount > 2) {
        cardsToDiscard = cardsToDiscard.concat(aiPlayer.hand.filter(c => c.name === CardName.SHAN).slice(2));
      }
      
      // Excess Sha cards
      if (shaCount > 2) {
        cardsToDiscard = cardsToDiscard.concat(aiPlayer.hand.filter(c => c.name === CardName.SHA).slice(2));
      }
      
      // If there are cards to discard, use Zhiheng skill
      if (cardsToDiscard.length > 0) {
        // At most discard 2 cards (simple strategy)
        cardsToDiscard = cardsToDiscard.slice(0, 2);

        // Execute Zhiheng
        discardCards(aiPlayer.id, cardsToDiscard);
        drawCards(aiPlayer.id, cardsToDiscard.length);
        addLog(`${aiPlayer.hero.name} 使用技能「制衡」，弃置了 ${cardsToDiscard.length} 张牌，摸了 ${cardsToDiscard.length} 张牌！`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '制衡');
        await delay(1500);
      }
    }

    // 孙尚香「结姻」：自身受伤且存在已受伤男性时，弃两张牌双方回血
    if (aiSkillsOn && aiPlayer.hero.name === '孙尚香' && aiPlayer.hand.length >= 2 && aiPlayer.hp < aiPlayer.maxHp) {
      const male = players.find(p => !p.isDead && p.id !== aiPlayer.id && p.hero.gender === 'male' && p.hp < p.maxHp);
      if (male) {
        const cost = aiPlayer.hand.slice(0, 2);
        discardCards(aiPlayer.id, cost);
        recoverHp(aiPlayer.id, 1);
        recoverHp(male.id, 1);
        addLog(`${aiPlayer.hero.name} 发动「结姻」，弃置两张牌，与 ${male.hero.name} 各回复 1 点体力`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '结姻');
        await delay(1200);
      }
    }

    // 华佗「青囊」：弃一张非关键手牌，为受伤的己方回复1点体力
    if (aiSkillsOn && aiPlayer.hero.name === '华佗' && !hasUsedQingnang && aiPlayer.hand.length >= 2) {
      const wounded = playersRef.current
        .filter(p => !p.isDead && p.hp < p.maxHp && (p.id === aiPlayer.id || isAlly(aiPlayer, p)))
        .sort((a, b) => (a.maxHp - a.hp) - (b.maxHp - b.hp))[0];
      const cost = aiPlayer.hand.find(c => c.name !== CardName.TAO && c.name !== CardName.SHAN);
      if (wounded && cost) {
        discardCards(aiPlayer.id, [cost]);
        recoverHp(wounded.id, 1);
        setHasUsedQingnang(true);
        addLog(`${aiPlayer.hero.name} 发动「青囊」，弃置【${cost.name}】，令 ${wounded.hero.name} 回复1点体力`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '青囊');
        await delay(900);
        const refreshed = getPlayer(aiPlayer.id);
        if (refreshed) aiPlayer = refreshed;
      }
    }

    // 周瑜「反间」：对敌方使用一次
    if (aiSkillsOn && aiPlayer.hero.name === '周瑜' && !hasUsedFanjian && aiPlayer.hand.length >= 1) {
      const target = pickAITarget(aiPlayer);
      if (target && !target.isDead && target.id !== aiPlayer.id) {
        const live = getPlayer(aiPlayer.id)!;
        const revealed = live.hand[Math.floor(Math.random() * live.hand.length)];
        const suits = [Suit.SPADE, Suit.HEART, Suit.CLUB, Suit.DIAMOND];
        const guessed = suits[Math.floor(Math.random() * suits.length)];
        mutateHand(aiPlayer.id, hand => hand.filter(c => c.id !== revealed.id));
        mutateHand(target.id, hand => [...hand, revealed]);
        setHasUsedFanjian(true);
        addLog(`${target.hero.name} 猜测花色为 ${guessed}，周瑜展示【${revealed.name}】${revealed.suit}`, 'chat');
        showSkillBanner(aiPlayer.hero.name, '反间');
        if (guessed !== revealed.suit) {
          addLog(`猜错！${target.hero.name} 受到1点伤害并获得【${revealed.name}】`, 'danger');
          await combat.takeDamage(target.id, aiPlayer.id, 1);
        }
        await delay(800);
        const refreshed = getPlayer(aiPlayer.id);
        if (refreshed) aiPlayer = refreshed;
      }
    }

    // 大乔「国色」：方块牌当【乐不思蜀】压制敌人
    if (aiSkillsOn && aiPlayer.hero.name === '大乔') {
      const diamond = aiPlayer.hand.find(c => c.suit === Suit.DIAMOND && c.name !== CardName.TAO && c.name !== CardName.SHAN);
      const target = pickAITarget(aiPlayer);
      if (diamond && target && !target.isDead && !getTargetProtection(target, CardName.LESI)) {
        const lesiCard: Card = { ...diamond, name: CardName.LESI, type: CardType.SCROLL, description: '国色：方块牌当【乐不思蜀】使用。' };
        addLog(`${aiPlayer.hero.name} 发动「国色」，将【${diamond.name}】当【乐不思蜀】使用`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '国色');
        await resolveCardEffect(aiPlayer, [target], lesiCard);
        await delay(800);
        const refreshed = getPlayer(aiPlayer.id);
        if (refreshed) aiPlayer = refreshed;
      }
    }

    // 步练师「安恤」：把手牌从多的一方转给少的一方
    if (aiSkillsOn && aiPlayer.hero.name === '步练师' && !hasUsedAnxu) {
      const others = playersRef.current.filter(p => !p.isDead && p.id !== aiPlayer.id);
      const allies = others.filter(p => isAlly(aiPlayer, p)).sort((a, b) => a.hand.length - b.hand.length);
      const enemies = others.filter(p => isEnemy(aiPlayer, p)).sort((a, b) => b.hand.length - a.hand.length);
      const fewer = allies[0] ?? [...others].sort((a, b) => a.hand.length - b.hand.length)[0];
      const more = enemies.find(p => p.hand.length > (fewer?.hand.length ?? 0))
        ?? [...others].filter(p => p.id !== fewer?.id && p.hand.length > (fewer?.hand.length ?? 0))
          .sort((a, b) => b.hand.length - a.hand.length)[0];
      if (fewer && more && fewer.id !== more.id && fewer.hand.length !== more.hand.length) {
        await resolveAnxu(aiPlayer.id, [fewer.id, more.id]);
        await delay(900);
      }
    }
    const picked = pickAITarget(aiPlayer);
    targetId = picked ? picked.id : -1;
    // 距离为 1 的可达敌人（顺手/兵粮/杀 使用）
    const adjacentEnemy = players.find(p => !p.isDead && p.id !== aiPlayer.id && isEnemy(aiPlayer, p) && getDistance(aiPlayer.id, p.id) <= 1);
    // 黄月英「奇才」：使用锦囊牌无距离限制
    const shunshouTarget = aiPlayer.hero.name === '黄月英'
      ? players.find(p => !p.isDead && p.id !== aiPlayer.id && isEnemy(aiPlayer, p))
      : adjacentEnemy;
    // 攻击范围内可打的敌人
    const reachableEnemy = players
      .filter(p => !p.isDead && p.id !== aiPlayer.id && isEnemy(aiPlayer, p) && canReach(aiPlayer, p))
      .sort((a, b) => a.hp - b.hp)[0];

    // 2. Play Tao（困难 AI 不在小伤时浪费桃，留作濒死救援）
    const taoThreshold = aiDifficultyRef.current === 'hard'
      ? (aiPlayer.hp <= 1 || aiPlayer.maxHp - aiPlayer.hp >= 2)
      : true;
    if (aiPlayer.hp < aiPlayer.maxHp && taoThreshold && aiPlayer.caiShiMode !== 'limitSelf') {
      const peach = aiPlayer.hand.find(c => c.name === CardName.TAO);
      if (peach) {
        await resolveCardEffect(aiPlayer, [aiPlayer], peach);
        await delay(1500);
      }
    }

    // 3. Play Wuzhong
    const wuzhong = aiPlayer.hand.find(c => c.name === CardName.WUZHONG);
    if (wuzhong && aiPlayer.caiShiMode !== 'limitSelf') {
      await resolveCardEffect(aiPlayer, [aiPlayer], wuzhong);
      await delay(1500);
    }

    // 辛宪英「才识」：本回合不能对其他角色使用牌，只保留装备与自我目标牌后结束出牌
    if (aiPlayer.hero.name === '辛宪英' && aiPlayer.caiShiMode === 'limitOther') {
      addLog('辛宪英受「才识」限制，本回合不能对其他角色使用牌', 'info');
      aiTurnActiveRef.current = false;
      leaveActionPhase();
      return;
    }

    // 4. Play Wanjian Qifa
    const wanjian = aiPlayer.hand.find(c => c.name === CardName.WANJIAN);
    if (wanjian) {
      const targets = players.filter(p => p.id !== aiPlayer.id && !p.isDead);
      const enemyCount = targets.filter(t => isEnemy(aiPlayer, t)).length;
      const allyCount = targets.filter(t => isAlly(aiPlayer, t)).length;
      const hard = aiDifficultyRef.current === 'hard';
      const riskyAlly = hard && targets.some(t => isAlly(aiPlayer, t) && t.hp <= 1
        && t.equipment?.armor?.name !== CardName.TENGJIA);
      if (hard ? (enemyCount > allyCount && !riskyAlly) : enemyCount >= allyCount) {
        await resolveCardEffect(aiPlayer, targets, wanjian);
        await delay(1500);
      }
    }
    
    // 5. Play Shunshou Qianyang（仅限距离 1；黄月英「奇才」无视距离）
    const shunshou = aiPlayer.hand.find(c => c.name === CardName.SHUNSHOU);
    if (shunshou && shunshouTarget) {
      await resolveCardEffect(aiPlayer, [shunshouTarget], shunshou);
      await delay(1500);
    }
    
    // 6. Play Guohe Chaiqiao
    const guohe = aiPlayer.hand.find(c => c.name === CardName.GUOHE);
    if (guohe && targetId !== -1) {
      const target = getPlayer(targetId)!;
      await resolveCardEffect(aiPlayer, [target], guohe);
      await delay(1500);
    }

    // 吴国太「甘露」：把装备从装备多的一方换给己方装备少者
    if (aiSkillsOn && aiPlayer.hero.name === '吴国太' && !ganluUsedRef.current) {
      const countEq = (p: Player) => Object.values(p.equipment ?? {}).filter(Boolean).length;
      const others = playersRef.current.filter(p => !p.isDead);
      const allies = others.filter(p => p.id !== aiPlayer.id && isAlly(aiPlayer, p)).sort((a, b) => countEq(a) - countEq(b));
      const donors = others.filter(p => countEq(p) > 0).sort((a, b) => countEq(b) - countEq(a));
      const lost = aiPlayer.maxHp - aiPlayer.hp;
      const beneficiary = allies[0];
      const donor = donors[0];
      if (beneficiary && donor && donor.id !== beneficiary.id && Math.abs(countEq(beneficiary) - countEq(donor)) <= lost) {
        await resolveGanlu(aiPlayer.id, beneficiary.id, donor.id);
        await delay(500);
      }
    }

    // 邹氏「倾城」：弃黑色牌（手牌或装备区）暗置敌方已明置的武将牌
    if (aiSkillsOn && aiPlayer.hero.name === '邹氏' && !qingchengUsedRef.current
        && zoushiRevealedRef.current.has(aiPlayer.id)) {
      const hasBlack = aiPlayer.hand.some(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB)
        || Object.values(aiPlayer.equipment ?? {}).some(c => !!c && (c.suit === Suit.SPADE || c.suit === Suit.CLUB));
      const enemy = playersRef.current
        .filter(p => !p.isDead && p.id !== aiPlayer.id && isEnemy(aiPlayer, p) && p.generalRevealed !== false)
        .sort((a, b) => a.hp - b.hp)[0];
      if (hasBlack && enemy) {
        await resolveQingcheng(aiPlayer.id, enemy.id);
        await delay(500);
      }
    }

    // 郭皇后「矫诏」：展示手牌声称为牌使用
    if (aiSkillsOn && aiPlayer.hero.name === '郭皇后' && !jiaozhaoUsedRef.current && aiPlayer.hand.length > 0) {
      await resolveJiaozhao(aiPlayer.id);
      const refreshed = getPlayer(aiPlayer.id);
      if (refreshed) aiPlayer = refreshed;
      await delay(500);
    }

    // 6.5 甘宁「奇袭」：黑色牌当【过河拆桥】
    if (aiSkillsOn && aiPlayer.hero.name === '甘宁' && targetId !== -1) {
      const target = getPlayer(targetId);
      const targetHasCards = target && !target.isDead && (target.hand.length > 0 ||
        !!(target.equipment?.weapon || target.equipment?.armor || target.equipment?.horsePlus || target.equipment?.horseMinus));
      const blackCards = aiPlayer.hand.filter(c => (c.suit === Suit.SPADE || c.suit === Suit.CLUB) &&
        c.name !== CardName.GUOHE && c.name !== CardName.WUXIE);
      // 优先用价值较低的黑色牌，避免浪费【杀】/【酒】等重要牌
      const lowValueBlack = blackCards.find(c => c.name !== CardName.SHA && c.name !== CardName.JIU && c.type !== CardType.EQUIPMENT);
      const blackCard = lowValueBlack ?? blackCards.find(c => c.name === CardName.SHA);
      if (target && targetHasCards && blackCard) {
        addLog(`${aiPlayer.hero.name} 发动「奇袭」，将【${blackCard.name}】当【过河拆桥】使用`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '奇袭');
        const tempGuohe = { ...blackCard, name: CardName.GUOHE };
        await resolveCardEffect(aiPlayer, [target], tempGuohe);
        await delay(1500);
      }
    }
    
    // 7. Play Leshi Busi Shu
    const lesi = aiPlayer.hand.find(c => c.name === CardName.LESI);
    if (lesi && targetId !== -1) {
      const target = getPlayer(targetId)!;
      await resolveCardEffect(aiPlayer, [target], lesi);
      await delay(1500);
    }

    // 8. Play Wugu Fengdeng (AI will use it when there are alive players)
    const wugu = aiPlayer.hand.find(c => c.name === CardName.WUGU);
    if (wugu) {
      const alivePlayers = players.filter(p => !p.isDead);
      if (alivePlayers.length > 0) {
        await resolveCardEffect(aiPlayer, [], wugu);
        await delay(1500);
      }
    }

    // 9. Play Taoyuan Jieyi (AI will use it when there are wounded allies or self is wounded)
    const taoyuan = aiPlayer.hand.find(c => c.name === CardName.TAOYUAN);
    if (taoyuan) {
      const alivePlayers = players.filter(p => !p.isDead);
      const woundedPlayers = alivePlayers.filter(p => p.hp < p.maxHp);
      // 使用条件：有受伤的角色（包括自己或队友）
      if (woundedPlayers.length > 0) {
        await resolveCardEffect(aiPlayer, [], taoyuan);
        await delay(1500);
      }
    }

    // 10. Play Bingliang Cunduan（仅限距离 1；黄月英「奇才」无视距离）
    const bingliang = aiPlayer.hand.find(c => c.name === CardName.BINGLIANG);
    if (bingliang && shunshouTarget) {
      await resolveCardEffect(aiPlayer, [shunshouTarget], bingliang);
      await delay(1500);
    }

    // 9. Play Huogong
    const huogong = aiPlayer.hand.find(c => c.name === CardName.HUOGONG);
    if (huogong && targetId !== -1) {
      const target = getPlayer(targetId)!;
      if (target.hand.length > 0) {
        await resolveCardEffect(aiPlayer, [target], huogong);
        await delay(1500);
      }
    }

    // 10. Play Tiesuo Lianhuan
    const tiesuo = aiPlayer.hand.find(c => c.name === CardName.TIESUO);
    if (tiesuo) {
      const targets = players.filter(p => p.id !== aiPlayer.id && !p.isDead).slice(0, 2);
      if (targets.length > 0) {
        await resolveCardEffect(aiPlayer, targets, tiesuo);
        await delay(1500);
      }
    }

    // 11. Play Jiu (before Slash for boost)
    const jiu = aiPlayer.hand.find(c => c.name === CardName.JIU);
    if (jiu && targetId !== -1 && aiPlayer.caiShiMode !== 'limitSelf') {
      await resolveCardEffect(aiPlayer, [aiPlayer], jiu);
      await delay(1000);
    }

    // 11.5 Play Juedou（决斗：对血量最低的敌人）
    const juedou = aiPlayer.hand.find(c => c.name === CardName.JUEDOU);
    if (juedou && targetId !== -1) {
      const target = getPlayer(targetId)!;
      await resolveCardEffect(aiPlayer, [target], juedou);
      await delay(1500);
    }

    // 11.6 Play Jiedao（借刀杀人：借有武器的敌人之手攻击另一名敌人）
    const jiedao = aiPlayer.hand.find(c => c.name === CardName.JIEDAO);
    if (jiedao) {
      const weaponTarget = players.find(p => !p.isDead && p.id !== aiPlayer.id && p.equipment?.weapon && isEnemy(aiPlayer, p));
      if (weaponTarget) {
        const victim = players.filter(p => !p.isDead && p.id !== aiPlayer.id && p.id !== weaponTarget.id && isEnemy(aiPlayer, p))[0]
          || players.find(p => !p.isDead && p.id !== aiPlayer.id && p.id !== weaponTarget.id);
        if (victim) {
          await resolveCardEffect(aiPlayer, [weaponTarget, victim], jiedao);
          await delay(1500);
        }
      }
    }

    // 11.7 张星彩「枪舞」：出牌阶段限一次，先判定再出【杀】
    const xingcai = getPlayer(aiPlayer.id);
    if (xingcai && !xingcai.isDead && xingcai.hero.name === '张星彩' && !qiangwuUsedRef.current) {
      qiangwuUsedRef.current = true;
      const jc = await performJudgment(xingcai.id, '枪舞');
      if (jc) {
        const pt = rankValue(jc.rank);
        qiangwuPointRef.current = pt;
        setQiangwuPoint(pt);
        addLog(`${xingcai.hero.name} 发动「枪舞」：判定点数 ${pt}`, 'skill');
        showSkillBanner(xingcai.hero.name, '枪舞');
        await delay(400);
      }
    }

    // 12. Play Slash（受攻击范围限制；张飞「咆哮」/ 诸葛连弩 可连续出【杀】）
    let slashPlayed = 0;
    for (let i = 0; i < 3; i++) {
      const aiNow = getPlayer(aiPlayer.id);
      if (!aiNow || aiNow.isDead) break;
      let slash = aiNow.hand.find(c => c.name === CardName.SHA);
      let zhangbaCost: Card[] = [];
      // 丈八蛇矛：没有【杀】时，可用两张手牌当【杀】
      if (!slash && aiNow.equipment?.weapon?.name === CardName.ZHANGBA && aiNow.hand.length >= 2) {
        zhangbaCost = aiNow.hand.slice(0, 2);
        slash = {
          ...zhangbaCost[0],
          name: CardName.SHA,
          type: CardType.BASIC,
          attribute: undefined,
          description: '丈八蛇矛：两张手牌当【杀】使用。',
        };
      }
      // 张星彩「枪舞」：点数小于判定结果的【杀】无距离限制
      const qiangwuLongShot = !!slash && aiNow.hero.name === '张星彩' && qiangwuPointRef.current !== null
        && rankValue(slash.rank) < qiangwuPointRef.current;
      const target = players
        .filter(p => !p.isDead && p.id !== aiNow.id && isEnemy(aiNow, p) && (canReach(aiNow, p) || qiangwuLongShot)
          && (!slash || !getTargetLegalityVeto(aiNow, p, slash)))
        .sort((a, b) => a.hp - b.hp)[0];
      if (!slash || !target || !canPlaySlash(aiNow, slash)) break;
      // 花鬘「芳踪」：AI 规避——无法指定攻击范围内的目标时不使用【杀】
      if (!target && slash && aiNow.hero.name === '花鬘') {
        addLog('【芳踪】花鬘 受「芳踪」限制，无法指定攻击范围内的角色，本回合不使用【杀】', 'skill');
        showSkillBanner('花鬘', '芳踪');
        break;
      }
      if (zhangbaCost.length === 2) {
        discardCards(aiNow.id, [zhangbaCost[1]]);
        addLog(`${aiNow.hero.name} 发动【丈八蛇矛】，将两张手牌当【杀】使用`, 'skill');
      }
      await resolveCardEffect(aiNow, [target], slash);
      slashPlayed++;
      await delay(1200);
    }

    if (slashPlayed === 0) {
       // 13. Play Nanman
    const nanman = aiPlayer.hand.find(c => c.name === CardName.NANMAN);
    if (nanman) {
      const targets = players.filter(p => p.id !== aiPlayer.id && !p.isDead);
      const enemyCount = targets.filter(t => isEnemy(aiPlayer, t)).length;
      const allyCount = targets.filter(t => isAlly(aiPlayer, t)).length;
      const hard = aiDifficultyRef.current === 'hard';
      const riskyAlly = hard && targets.some(t => isAlly(aiPlayer, t) && t.hp <= 1
        && t.equipment?.armor?.name !== CardName.TENGJIA && t.hero.name !== '祝融');
      if (hard ? (enemyCount > allyCount && !riskyAlly) : enemyCount >= allyCount) {
        await resolveCardEffect(aiPlayer, targets, nanman);
        await delay(1500);
      }
    }
    }

    aiTurnActiveRef.current = false;
    dbgMark(`cpu:setDiscard:${aiPlayer.hero.name}`);
    leaveActionPhase();
  };

  const handleAskStrategy = () => {
    const me = players.find(p => p.isHuman) || players[0];
    if(me.isDead) return;

    // 显示技能说明弹窗
    setShowSkillModal(true);
  };

  const endTurn = () => {
    if (dyingState || isProcessing) return;
    if (phase === GamePhase.ACTION) {
      leaveActionPhase();
    }
  };

  // 主动退出对局：清存档、结束所有挂起交互、停止主循环并回首页
  const exitToHome = (notice = '已退出对局，存档已清除') => {
    clearSave();
    setSavedGame(null);
    isGameOverRef.current = true; // 阻止旧回合继续推进/写档
    turnStepRef.current = '';
    aiTurnActiveRef.current = false;
    if (humanReactionResolver.current) {
      humanReactionResolver.current({ played: false, isWuxie: false });
      humanReactionResolver.current = null;
    }
    if (dyingResolver.current) {
      dyingResolver.current(false);
      dyingResolver.current = null;
    }
    setPendingReaction(null);
    setDyingState(null);
    setWuguSelection(null);
    setWuguSelectedCard(null);
    setSelectedCardIds([]);
    setActiveSelectedId(null);
    setIsSelectingTarget(false);
    setIsAiTakeover(false);
    setTutorialActive(false);
    setShowExitConfirm(false);
    setShowRules(false);
    setShowDiscardViewer(false);
    setInspectPlayerId(null);
    setWinnerSide(null);
    setScreen('start');
    setHomeNotice(notice);
  };

  // 超时自动弃牌：保留关键牌，优先弃置低价值牌（与 AI 弃牌策略一致）
  const autoDiscardLowestCards = () => {
    const self = playersRef.current.find(p => p.isHuman) || players[0];
    if (!self) return;
    const excess = excessCards(self);
    if (excess <= 0) {
      setPhase(GamePhase.END);
      return;
    }
    const keepValue = (c: Card) => {
      switch (c.name) {
        case CardName.TAO: return 0;
        case CardName.SHAN: return 1;
        case CardName.SHA: return 2;
        case CardName.WUZHONG: return 3;
        case CardName.WUXIE: return 3;
        case CardName.JIU: return 4;
        default: return 6;
      }
    };
    const toDiscard = [...self.hand].sort((a, b) => keepValue(b) - keepValue(a)).slice(0, excess);
    discardCards(self.id, toDiscard);
    addLog(`时间到！${self.hero.name} 自动弃置 ${toDiscard.length} 张牌`, 'warning');
    setSelectedCardIds([]);
    setActiveSelectedId(null);
    setPhase(GamePhase.END);
  };

  // 读秒归零后的自动决策：已选牌就出牌，没选牌就跳过出牌阶段
  onDecisionTimeoutRef.current = () => {
    if (dyingState || isProcessing) return;
    if (phase === GamePhase.DISCARD) {
      autoDiscardLowestCards();
      return;
    }
    if (phase === GamePhase.ACTION) {
      if (selectedCardIds.length > 0) {
        addLog('时间到！自动出牌', 'warning');
        handleConfirmPlay();
      } else {
        addLog('时间到！未出牌，自动结束出牌阶段', 'warning');
        setSelectedCardIds([]);
        setActiveSelectedId(null);
        setIsSelectingTarget(false);
        endTurn();
      }
    }
  };

  // --- Render ---


  if (screen === 'start') {
    return (
      <StartRoute
        theme={theme}
        layoutDensity={layoutDensity}
        sizeTier={sizeTier}
        motionOn={motionOn}
        fxLevel={fxLevel}
        scaleStyle={scaleStyle ?? EMPTY_STYLE}
        playerCount={playerCount}
        onPlayerCount={setPlayerCount}
        aiDifficulty={aiDifficulty}
        onAiDifficulty={setAiDifficulty}
        savedGame={savedGame}
        onResume={resumeGame}
        onEnterSelect={() => { initAudio(); setScreen('select'); }}
        onTutorial={startTutorial}
        onShowRules={() => setShowRules(true)}
        onCloseRules={() => setShowRules(false)}
        showRules={showRules}
        stats={stats}
        homeNotice={homeNotice}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onToggleMotion={toggleMotion}
        onCycleFx={cycleFx}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (screen === 'select') {
    return (
      <SelectRoute
        theme={theme}
        motionOn={motionOn}
        fxLevel={fxLevel}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onToggleMotion={toggleMotion}
        onCycleFx={cycleFx}
        onToggleTheme={toggleTheme}
        onBack={() => { setSelectedHero(null); setScreen('start'); }}
        heroKingdom={heroKingdom}
        kingdomCounts={kingdomCounts}
        onKingdomChange={(k) => { setHeroKingdom(k); setHeroPage(0); }}
        heroQuery={heroQuery}
        onQueryChange={(v) => { setHeroQuery(v); setHeroPage(0); }}
        pageClamped={heroPageClamped}
        pageCount={heroPageCount}
        onPageChange={setHeroPage}
        filteredCount={filteredHeroes.length}
        pagedHeroes={pagedHeroes}
        selectedHero={selectedHero}
        onPickHero={(h) => { setSelectedHero(h); setDetailPlayerId(null); setDetailHero(h); }}
        onOpenDetail={(h) => { setDetailPlayerId(null); setDetailHero(h); }}
        onOpenPortrait={setPortraitHero}
        onStart={startGame}
        detailHero={detailHero}
        onCloseDetail={() => setDetailHero(null)}
        onSelectDetail={(h) => { setSelectedHero(h); setDetailHero(null); }}
        onStartWithHero={(h) => { setDetailHero(null); startGame(h); }}
        portraitHero={portraitHero}
        onClosePortrait={() => setPortraitHero(null)}
      />
    );
  }

  if (screen === 'gameover') {
    return (
      <GameOverRoute
        players={players}
        winnerSide={winnerSide}
        deckCount={deck.length}
        discardCount={discardPile.length}
        logs={logs}
        stats={stats}
        durationMs={gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : 0}
        theme={theme}
        isMuted={isMuted}
        toggleMute={toggleMute}
        motionOn={motionOn}
        fxLevel={fxLevel}
        onRestart={() => {
          // 连点「再来一局」只生效一次，避免一次开出两局
          if (Date.now() - startGuardRef.current < 600) return;
          startGuardRef.current = Date.now();
          const myHero = players.find(p => p.isHuman)?.hero;
          if (myHero) startGame(myHero);
        }}
        onHome={() => exitToHome('已返回主页')}
      />
    );
  }

  // --- Game Layout ---
  
  const me = players.find(p => p.isHuman) || players[0];
  const enemies = players.filter(p => !p.isHuman);
  const isMyTurn = turnIndex === me.id;
  // 当前选中的牌是否为「杀」类（含技能转化），用于超出攻击范围的目标灰显
  const activeCard = selectedCardIds.length ? me.hand.find(c => c.id === selectedCardIds[0]) : undefined;
  const slashLikeActive = !!activeCard && (
    activeCard.name === CardName.SHA ||
    (me.hero.name === '赵云' && activeCard.name === CardName.SHAN) ||
    (canUseWusheng(me) && [Suit.HEART, Suit.DIAMOND].includes(activeCard.suit))
  );

  // --- 对局面板自适应 ---
  // 手牌尺寸只按设备类型分档：桌面始终大卡（高度≥140px 硬指标），手机小卡但高度≥110px
  // 例外：ultra 档（≤640px 高的窗口）用标准卡，否则 152px 高的大卡旋转后会超出视口底部
  const compactHand = layoutDensity !== 'roomy';
  const isMobileHand = viewport.w < 768;
  const handLarge = !isMobileHand && layoutDensity !== 'ultra';

  // 对局接线对象：由 App 一次性组装，对局内组件通过 useGameApi() 读取
  const gameApi: GameApi = {
    hasUsedAnxu,
    hasUsedChongxu,
    hasUsedFanjian,
    hasUsedGanlu,
    hasUsedJiaozhao,
    hasUsedJieyin,
    hasUsedLijian,
    hasUsedMiaoJian,
    hasUsedQiangwu,
    hasUsedQingcheng,
    hasUsedQingnang,
    hasUsedXueji,
    hasUsedYanjiao,
    hasUsedZhiheng,
    isAiTakeover,
    isAnxuMode,
    isFanjianMode,
    isGanluMode,
    isGuoseMode,
    isJieyinMode,
    isJijiangMode,
    isLijianMode,
    isMyTurn,
    isQingchengMode,
    isQingnangMode,
    isQixiMode,
    isRendeMode,
    isSelectingTarget,
    isZhangbaMode,
    isZhihengMode,
    selectedCardIds,
    rendeSelectedCardIds,
    lijianSelectedTargets,
    tiesuoSelectedTargets,
    players,
    me,
    phase,
    theme,
    dyingState,
    isProcessing,
    jiaozhaoPending,
    zhangbaPending,
    qiangwuPoint,
    guohuanghouLevel,
    jiedaoVictimTarget,
    jiedaoWeaponTarget,
    lijianSelectedCardId,
    rendeSelectedTarget,
    chongxuUsedRef,
    miaoJianUsedRef,
    playersRef,
    rendeGivenRef,
    rendeHealedRef,
    setActiveSelectedId,
    setAnxuTargets,
    setGanluTargets,
    setHasUsedChongxu,
    setHasUsedLijian,
    setHasUsedMiaoJian,
    setHasUsedZhiheng,
    setHealAnimTarget,
    setHealNumber,
    setIsAnxuMode,
    setIsFanjianMode,
    setIsGanluMode,
    setIsGuoseMode,
    setIsJieyinMode,
    setIsJijiangMode,
    setIsLijianMode,
    setIsProcessing,
    setIsQingchengMode,
    setIsQingnangMode,
    setIsQixiMode,
    setIsRendeMode,
    setIsSelectingTarget,
    setIsZhangbaMode,
    setIsZhihengMode,
    setJieyinTarget,
    setLijianSelectedCardId,
    setLijianSelectedTargets,
    setPlayers,
    setQingnangCardId,
    setRendeSelectedCardIds,
    setRendeSelectedTarget,
    setSelectedCardIds,
    setZhangbaPending,
    addLog,
    activateQiangwu,
    canReach,
    delay,
    discardCards,
    doYanjiao,
    drawCards,
    endTurn,
    excessCards,
    executeDuel,
    getPlayer,
    handleAskStrategy,
    handleConfirmPlay,
    handleDiscardConfirm,
    mutateHand,
    performJiling,
    requestSkillChoice,
    resolveCardEffect: combat.resolveCardEffect,
    resolveJiaozhao,
    resolveJiaozhaoUse,
    resolveKurou,
    resolveXueji,
    showSkillBanner,
    updatePlayer,
  };

  // 对局外壳在 src/screens/BattleScreen.tsx（JSX 逐字搬出）。
  // 用 useMemo 固定 props 对象引用：只要本帧依赖未变，BattleScreen 拿到的就是同一个对象，
  // 不会因为每次渲染新建对象而触发下层重渲染。

  // 对局外壳在 src/screens/BattleScreen.tsx（JSX 逐字搬出）。
  // 这里刻意不用 useMemo：本段位于 start/select/gameover 三个 early return 之后，
  // 在该分支新增 hook 会改变 App 的 hook 调用顺序（React 会报 Rules of Hooks 并中断渲染）。
  // 渲染次数与搬出前一致——BattleScreen 不是 memo 组件，这些 JSX 原本也是每次渲染重建；
  // 传下去的函数/ref 本身在 App 侧已由 useCallback / useRef 保证稳定引用。
  const battleProps: React.ComponentProps<typeof BattleScreen> = {
    DECISION_SECONDS,
    SKILL_CHOICE_SECONDS,
    activeSelectedId,
    advice,
    aiThinkingId,
    bgmPref,
    canUseWusheng,
    chooseBgmPref,
    compactHand,
    cycleFx,
    damageAnimTarget,
    damageNumber,
    decisionLeft,
    deck,
    deckFx,
    detailHero,
    detailPlayerId,
    discardPile,
    dispatchCardClick,
    drawPulse,
    dyingLeft,
    dyingState,
    enemies,
    exitToHome,
    finishTutorial,
    flightFx,
    fxDying,
    fxFlourish,
    fxJudge,
    fxLevel,
    fxSkill,
    gameApi,
    getAttackRange,
    getDistance,
    getPlayer,
    handLarge,
    handleCardClick,
    handleManualSkipReaction,
    handleTargetClick,
    healAnimTarget,
    healNumber,
    inspectPlayerId,
    isAiTakeover,
    isJiedaoMode,
    isJieyinMode,
    isJijiangMode,
    isLijianMode,
    isMobileHand,
    isMuted,
    isMyTurn,
    isProcessing,
    isRendeMode,
    isSelectingTarget,
    isSkillSealed,
    isZhangbaMode,
    isZhihengMode,
    jiedaoVictimTarget,
    jiedaoWeaponTarget,
    judgmentVisual,
    layoutDensity,
    lijianSelectedCardId,
    lijianSelectedTargets,
    logCollapsed,
    logs,
    me,
    motionOn,
    orderCollapsed,
    pendingReaction,
    phase,
    phaseBanner,
    players,
    portraitHero,
    reactionLeft,
    rendeSelectedCardIds,
    rendeSelectedTarget,
    resolveSkillChoice,
    scaleStyle,
    selectedCardIds,
    setAdvice,
    setDetailHero,
    setDetailPlayerId,
    setInspectPlayerId,
    setIsAiTakeover,
    setLogCollapsed,
    setOrderCollapsedPersist,
    setPortraitHero,
    setShowDiscardViewer,
    setShowExitConfirm,
    setShowRules,
    setShowSkillModal,
    setShowUiMenu,
    setSkillBanner,
    setSpeedLevel,
    setWuguSelectedCard,
    setWuguSelection,
    showDiscardViewer,
    showExitConfirm,
    showRules,
    showSkillModal,
    showUiMenu,
    sizeTier,
    skillBanner,
    skillBannerTimerRef,
    skillChoice,
    skillChoiceLeft,
    skillChoiceSel,
    skillChoiceValid,
    skillGlowId,
    skipTutorial,
    slashLikeActive,
    speedLevel,
    startTutorial,
    submitSkillChoice,
    theme,
    tiesuoSelectedTargets,
    toggleMotion,
    toggleMute,
    toggleSkillChoiceItem,
    toggleTheme,
    toggleUiRegion,
    turnIndex,
    turnPass,
    tutorialActive,
    uiHidden,
    viewport,
    visualCard,
    wuguLeft,
    wuguSelectedCard,
    wuguSelection,
  };

  return <BattleScreen {...battleProps} />;
};

export default App;
