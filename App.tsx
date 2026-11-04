import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Hero, Player, Card, GamePhase, CardName, LogEntry, Identity, Suit, CardType } from './types';
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
import { IconSpeaker, IconSun, IconMoon, IconBolt, IconBook, IconDice, IconMotion, IconArrowLeft, ThemeIcon } from './src/components/Icons';
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
  const [deck, setDeck] = useState<Card[]>([]);
  const deckRef = useRef<Card[]>([]); // 用于获取最新的牌堆状态
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
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
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [turnIndex, setTurnIndex] = useState<number>(0); 
  const [phase, setPhase] = useState<GamePhase>(GamePhase.START);
  const [winnerSide, setWinnerSide] = useState<WinnerSide | null>(null);
  const [isProcessing, setIsProcessing] = useState(0); // 全局状态锁计数，防止结算期间进行其他操作
  const isGameOverRef = useRef<boolean>(false); // 游戏结束标志，防止重复触发
  const gameStartedAtRef = useRef<number>(0); // 本局开始时间，用于结算页「用时」

  // --- 人类决策读秒 ---
  // 出牌 / 弃牌阶段超时未操作：已选牌则自动出牌，未选牌则自动跳过
  const DECISION_SECONDS = 20;
  const [decisionLeft, setDecisionLeft] = useState<number | null>(null);
  const [reactionLeft, setReactionLeft] = useState<number | null>(null);
  const [wuguLeft, setWuguLeft] = useState<number | null>(null);
  const [dyingLeft, setDyingLeft] = useState<number | null>(null);
  const onDecisionTimeoutRef = useRef<() => void>(() => {});
  const reactionTickRef = useRef<number | null>(null);
  
  // Feature State
  const [isAiTakeover, setIsAiTakeover] = useState<boolean>(false);

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
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

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
  const qiangwuPointRef = useRef<number | null>(null);
  const [qiangwuPoint, setQiangwuPoint] = useState<number | null>(null);
  const [hasUsedQiangwu, setHasUsedQiangwu] = useState<boolean>(false);
  // 卞夫人「挽危」：每回合限一次
  const wanweiUsedRef = useRef<boolean>(false);

  // 孙尚香「结姻」技能状态
  const [isJieyinMode, setIsJieyinMode] = useState<boolean>(false);
  const [jieyinTarget, setJieyinTarget] = useState<number | null>(null);
  const [hasUsedJieyin, setHasUsedJieyin] = useState<boolean>(false);

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
  // 对局战报折叠（桌面）
  const [logCollapsed, setLogCollapsed] = useState<boolean>(true);

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
  const [visualCard, setVisualCard] = useState<{ card: Card, playerName: string } | null>(null);

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmModeRef = useRef<'start' | 'battle' | 'climax'>('start');
  const audioReadyRef = useRef<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 保存最新的players状态，避免闭包问题
  const playersRef = useRef<Player[]>([]);
  // 回合状态机去重：同一「回合+阶段」只推进一次，避免 isProcessing 抖动导致 AI 重复行动
  const turnStepRef = useRef<string>('');
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
  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
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
    if (isMuted) return;
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
    setPlayers(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      // 更新ref中的最新状态
      playersRef.current = updated;
      return updated;
    });
  };

  const isAlly = (a: Player, b: Player) => {
    const ta = a.identity;
    const tb = b.identity;
    if (ta === Identity.ZHUGONG || ta === Identity.ZHONGCHEN) return tb === Identity.ZHUGONG || tb === Identity.ZHONGCHEN;
    if (ta === Identity.FANZEI) return tb === Identity.FANZEI;
    return false;
  };

  const isEnemy = (a: Player, b: Player) => {
    const ta = a.identity;
    const tb = b.identity;
    if (ta === Identity.ZHUGONG || ta === Identity.ZHONGCHEN) return tb === Identity.FANZEI || tb === Identity.NEIJIAN;
    if (ta === Identity.FANZEI) return tb === Identity.ZHUGONG || tb === Identity.ZHONGCHEN;
    if (ta === Identity.NEIJIAN) return tb !== Identity.NEIJIAN;
    return false;
  };

  // --- 身份推理 ---
  // AI 依据公开信息（阵亡亮明、攻击主公、救援主公）推测他人身份
  const identityGuessRef = useRef<Record<number, Identity>>({});
  const guessIdentity = (p: Player): Identity | undefined => (p.isRevealed ? p.identity : identityGuessRef.current[p.id]);
  const pickWeakest = (pool: Player[]) => (pool.length ? [...pool].sort((a, b) => a.hp - b.hp)[0] : null);

  // 按自身阵营选择最有价值的目标：反贼集火主公，忠臣/主公先打反贼，内奸先清反贼并留主公
  const pickAITarget = (ai: Player): Player | null => {
    const others = playersRef.current.filter(p => !p.isDead && p.id !== ai.id);
    if (others.length === 0) return null;
    const lord = others.find(p => p.identity === Identity.ZHUGONG);
    const rebels = others.filter(p => guessIdentity(p) === Identity.FANZEI);
    const difficulty = aiDifficultyRef.current;

    const threatScore = (p: Player) => {
      const equipCount = p.equipment
        ? [p.equipment.weapon, p.equipment.armor, p.equipment.horsePlus, p.equipment.horseMinus].filter(Boolean).length
        : 0;
      const heroThreat = ['黄月英', '周瑜', '甄姬', '孙权', '诸葛亮', '华佗', '蔡文姬'].includes(p.hero.name) ? 2 : 0;
      return (p.maxHp - p.hp) * 3 + p.hand.length + equipCount * 2
        + (p.identity === Identity.ZHUGONG ? 4 : 0) + (p.isRevealed ? 2 : 0) + heroThreat;
    };
    const hardPick = (pool: Player[]) => pool.length
      ? [...pool].sort((a, b) => threatScore(b) - threatScore(a))[0]
      : null;
    const easyRandom = (pool: Player[]) => (difficulty === 'easy' && pool.length && Math.random() < 0.3)
      ? pool[Math.floor(Math.random() * pool.length)]
      : null;

    if (ai.identity === Identity.FANZEI) {
      // 反贼：优先集火主公（主公身份始终公开）
      if (lord && lord.id !== ai.id) return lord;
      const pool = others.filter(p => guessIdentity(p) !== Identity.FANZEI);
      return easyRandom(pool)
        ?? (difficulty === 'hard' ? hardPick(pool) : null)
        ?? pickWeakest(pool)
        ?? pickWeakest(others);
    }

    if (ai.identity === Identity.ZHONGCHEN || ai.identity === Identity.ZHUGONG) {
      const pool = rebels.length
        ? rebels
        : others.filter(p => guessIdentity(p) !== Identity.ZHONGCHEN && guessIdentity(p) !== Identity.ZHUGONG);
      return easyRandom(pool)
        ?? (difficulty === 'hard' ? hardPick(pool) : null)
        ?? pickWeakest(pool)
        ?? pickWeakest(others.filter(p => guessIdentity(p) !== Identity.ZHUGONG));
    }

    // 内奸：先帮主公清反贼，最后才动主公
    if (rebels.length) return easyRandom(rebels) ?? (difficulty === 'hard' ? hardPick(rebels) : null) ?? pickWeakest(rebels);
    const nonLord = others.filter(p => p.identity !== Identity.ZHUGONG);
    return (difficulty === 'hard' ? hardPick(nonLord) : null)
      ?? pickWeakest(nonLord)
      ?? (lord && others.length === 1 ? lord : null);
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

  // --- 距离与攻击范围 ---
  // 座位距离：环形相邻为 1；-1 马减少自己到他人的距离，+1 马增加他人到自己的距离
  const getDistance = useCallback((fromId: number, toId: number) => {
    const list = playersRef.current;
    const n = list.length;
    if (!n) return 1;
    const raw = Math.abs(fromId - toId);
    let d = Math.min(raw, n - raw);
    const from = list.find(p => p.id === fromId);
    const to = list.find(p => p.id === toId);
    if (from?.hero.name === '马超' || from?.hero.name === '马云禄') d -= 1; // 马术
    if (from?.equipment?.horseMinus) d -= 1;
    if (to?.equipment?.horsePlus) d += 1;
    return Math.max(1, d);
  }, []);

  // 目标保护：诸葛亮「空城」、陆逊「谦逊」
  const getTargetProtection = (target: Player, cardName: CardName): string | null => {
    if (target.hero.name === '诸葛亮' && target.hand.length === 0
        && (cardName === CardName.SHA || cardName === CardName.JUEDOU)) {
      return '空城';
    }
    if (target.hero.name === '陆逊'
        && (cardName === CardName.SHUNSHOU || cardName === CardName.LESI)) {
      return '谦逊';
    }
    return null;
  };

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
    if (p.equipment?.weapon?.name === CardName.ZHUGE) return true;
    if (p.hero.name === '张飞') return true;
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
      updatePlayer(playerId, { hp: p.hp + 1 });
      addLog(`【白银狮子】离场，${p.hero.name} 回复 1 点体力（${p.hp + 1}/${p.maxHp}）`, 'success');
    }
  }, [getPlayer, updatePlayer]);

  // 装备牌上装：同槽位旧装备进入弃牌堆
  const equipCard = useCallback((playerId: number, card: Card) => {
    const meta = EQUIP_META[card.name];
    if (!meta) return false;
    const player = getPlayer(playerId);
    if (!player) return false;
    const slot = meta.slot;
    const prev = player.equipment?.[slot];
    const nextEquipment = { ...(player.equipment ?? {}), [slot]: card };

    mutateHand(playerId, hand => hand.filter(c => c.id !== card.id));
    updatePlayer(playerId, { equipment: nextEquipment });
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
    playSound(card.name, player.hero.gender);
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
      playBgm(alive <= 2 ? 'climax' : 'battle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, players]);

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
    const otherHeroes = HEROES.filter(h => h.id !== hero.id).sort(() => Math.random() - 0.5);
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

  const discardCards = (playerId: number, cardsToDiscard: Card[]) => {
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

    // 陆逊「连营」/ 卞夫人「挽危」：失去最后一张手牌后摸一张
    if (lostAllHand && before && !before.isDead && (before.hero.name === '陆逊' || before.hero.name === '卞夫人')) {
      const sk = before.hero.name === '卞夫人' ? '挽危' : '连营';
      addLog(`${before.hero.name} 发动「${sk}」，摸一张牌`, 'skill');
      showSkillBanner(before.hero.name, sk);
      drawCards(playerId, 1);
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
    
    // 先更新状态
    updatePlayer(victimId, { isDead: true, isRevealed: true, hand: [] }); 

    // 清理可能阻塞流程的状态
    setDyingState(null);
    if (pendingReaction) setPendingReaction(null);
    if (humanReactionResolver.current) {
      humanReactionResolver.current({ played: false, isWuxie: false });
      humanReactionResolver.current = null;
    }

    if (killerId !== undefined && killerId !== victimId) {
      const killer = getPlayer(killerId)!;
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
      
      const updatedPlayers = playersRef.current;
      const lord = updatedPlayers.find(p => p.identity === Identity.ZHUGONG);
      
      if (!lord) return;

      // 检查主公是否阵亡
      if (lord.isDead) {
        // 官方规则：主公阵亡时，若反贼已全部阵亡则内奸获胜，否则反贼获胜。
        // （此前要求「场上只剩内奸一人」，会漏掉忠臣仍存活的情形，误判成反贼胜）
        const aliveRebels = updatedPlayers.filter(p => p.identity === Identity.FANZEI && !p.isDead);
        const aliveSpy = updatedPlayers.find(p => p.identity === Identity.NEIJIAN && !p.isDead);
        if (aliveRebels.length === 0) {
          // 反贼已清空：内奸存活则内奸胜，内奸也已阵亡则视为朝廷方获胜（主公死于意外）
          handleGameOver(aliveSpy ? 'spy' : 'lord');
        } else {
          handleGameOver('rebel');
        }
        return;
      }
      
      // 检查反贼和内奸是否都阵亡
      const rebels = updatedPlayers.filter(p => p.identity === Identity.FANZEI && !p.isDead);
      const spy = updatedPlayers.find(p => p.identity === Identity.NEIJIAN);
      if (rebels.length === 0 && (!spy || spy.isDead)) {
        handleGameOver('lord');
        return;
      }
    }, 100);
  };

  // Auto-scroll logs with user scroll detection
  // 使用 requestAnimationFrame 优化日志滚动性能
  useEffect(() => {
    // 如果用户正在滚动，延迟滚动
    if (isUserScrollingRef.current) {
      return;
    }
    
    // 立即滚动，减少延迟
    if (logsContainerRef.current && logsEndRef.current) {
      const container = logsContainerRef.current;
      const target = logsEndRef.current;
      container.scrollTo({
        top: target.offsetTop - container.offsetTop,
        behavior: 'smooth'
      });
    }
  }, [logs]);

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
    turnStepRef.current = stepKey;

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
    wanweiUsedRef.current = false; // 重置「挽危」
        setIsJiedaoMode(false); // 重置借刀杀人模式
        setJiedaoWeaponTarget(null); // 重置借刀目标
        setJiedaoVictimTarget(null); // 重置被攻击目标
        // 重置刘备仁德技能状态
        setIsRendeMode(false);
        setRendeSelectedCardIds([]);
        setRendeSelectedTarget(null);
        // 重置孙尚香结姻
        setIsJieyinMode(false);
        setJieyinTarget(null);
        setHasUsedJieyin(false);
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
        addLog(`>>> ${currentPlayer.hero.name} (${currentPlayer.isHuman ? '你' : 'AI'}) 回合开始 <<<`, 'info');

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

        // 闪电判定：判定牌为黑桃2-9时受到3点雷电伤害，否则传递给下一名角色
        if (currentPlayer.isShandian) {
          updatePlayer(currentPlayer.id, { isShandian: false });
          const jc = await performJudgment(currentPlayer.id, '闪电');
          const rankNum = jc ? (parseInt(jc.rank.replace(/\D/g, ''), 10) || 0) : 0;
          if (jc && jc.suit === Suit.SPADE && rankNum >= 2 && rankNum <= 9) {
            addLog(`⚡【闪电】命中！${currentPlayer.hero.name} 受到3点雷电伤害！`, 'danger');
            await takeDamage(currentPlayer.id, currentPlayer.id, 3, {
              ...jc, name: CardName.SHANDIAN,
            } as Card, 'thunder');
          } else {
            // 传递给下一名存活角色
            let nextIdx = (currentPlayer.id + 1) % players.length;
            let safety = 0;
            while (safety < players.length) {
              const np = getPlayer(nextIdx);
              if (np && !np.isDead) break;
              nextIdx = (nextIdx + 1) % players.length;
              safety++;
            }
            if (safety < players.length && nextIdx !== currentPlayer.id) {
              updatePlayer(nextIdx, { isShandian: true });
              addLog(`【闪电】未命中，传递给 ${getPlayer(nextIdx)?.hero.name}`, 'info');
            } else {
              addLog(`【闪电】未命中，无人可传递，进入弃牌堆`, 'info');
            }
          }
          await delay(600);
        }

        // 安全防线：体力<=0的角色需要先进行濒死求桃
        const latestCurrent = getPlayer(turnIndex);
        if (latestCurrent && latestCurrent.hp <= 0 && !latestCurrent.isDead) {
          addLog(`${latestCurrent.hero.name} 体力为 ${latestCurrent.hp}，进入濒死状态！`, 'danger');
          // 进入濒死求桃流程
          const isSaved = await askForPeaches(latestCurrent.id);
          if (!isSaved) {
            addLog(`${latestCurrent.hero.name} 未能得到救援，死亡！`, 'danger');
            await handleDeath(latestCurrent.id);
            setPhase(GamePhase.END);
          } else {
            // 救活后继续本回合，避免同一「回合+阶段」去重后停在开始阶段
            setPhase(GamePhase.DRAW);
          }
          return;
        }
        await delay(800);
        setPhase(GamePhase.DRAW);
      }
      
      // DRAW PHASE
      else if (currentPhase === GamePhase.DRAW) {
        // 周瑜「英姿」：摸牌阶段额外摸一张
        const drawCount = currentPlayer.hero.name === '周瑜' ? 3 : 2;
        if (currentPlayer.hero.name === '周瑜') {
          addLog(`${currentPlayer.hero.name} 发动「英姿」，额外摸一张牌`, 'skill');
          showSkillBanner(currentPlayer.hero.name, '英姿');
        }
        // 检查是否有"兵粮寸断"效果：判定为梅花则解除，否则跳过摸牌阶段
        if (currentPlayer.isBingLiangCunDuan) {
          updatePlayer(currentPlayer.id, { isBingLiangCunDuan: false });
          const jc = await performJudgment(currentPlayer.id, '兵粮寸断');
          if (jc && jc.suit === Suit.CLUB) {
            addLog(`判定为梅花，【兵粮寸断】解除，${currentPlayer.hero.name} 正常摸牌`, 'success');
            drawCards(currentPlayer.id, drawCount);
          } else {
            addLog(`${currentPlayer.hero.name} 受【兵粮寸断】影响，跳过摸牌阶段！`, 'warning');
          }
        } else if (currentPlayer.hero.name === '张辽') {
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
          // 许褚「裸衣」：手中有杀/决斗时少摸一张，本回合伤害+1
          if (currentPlayer.hero.name === '许褚' && currentPlayer.hp > 1
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
        // 检查是否有"乐不思蜀"效果：判定为红桃则解除，否则跳过出牌阶段
        if (currentPlayer.isLeBuSiShu) {
          updatePlayer(currentPlayer.id, { isLeBuSiShu: false });
          const jc = await performJudgment(currentPlayer.id, '乐不思蜀');
          if (jc && jc.suit === Suit.HEART) {
            addLog(`判定为红桃，【乐不思蜀】解除，${currentPlayer.hero.name} 正常出牌`, 'success');
            if (!currentPlayer.isHuman || isAiTakeover) {
              await cpuAI(currentPlayer);
            }
          } else {
            addLog(`${currentPlayer.hero.name} 受【乐不思蜀】影响，跳过出牌阶段！`, 'warning');
          }
          await delay(800);
          setPhase(GamePhase.DISCARD);
        } else {
          // AI or Human Auto-Takeover
          if (!currentPlayer.isHuman || isAiTakeover) {
            await cpuAI(currentPlayer);
          }
        }
        // If human and not takeover, we wait for UI interaction.
      }
      
      // DISCARD PHASE
      else if (currentPhase === GamePhase.DISCARD) {
        // 更新ref中的最新状态
        playersRef.current = players;
        const updatedPlayer = getPlayer(turnIndex);
        if (!updatedPlayer) return;
        
        const excess = updatedPlayer.hand.length - updatedPlayer.hp;
        
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
          if (excess > 0) {
            // 更新ref中的最新状态
            playersRef.current = players;
            const finalPlayer = getPlayer(turnIndex);
            if (finalPlayer) {
              const finalExcess = finalPlayer.hand.length - finalPlayer.hp;
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
          setPhase(GamePhase.END);
        }
      }

      // END PHASE
      else if (currentPhase === GamePhase.END) {
        await delay(500);

        // 张春华「伤逝」：回合结束时，手牌少于已损失体力则补至该值
        const endingPlayer = getPlayer(turnIndex);
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '张春华') {
          const lostHp = endingPlayer.maxHp - endingPlayer.hp;
          const deficit = lostHp - endingPlayer.hand.length;
          if (deficit > 0) {
            addLog(`${endingPlayer.hero.name} 发动「伤逝」，摸 ${deficit} 张牌补至已损失体力`, 'skill');
            drawCards(endingPlayer.id, deficit);
          }
        }

        // 貂蝉「闭月」：回合结束时摸一张牌
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.name === '貂蝉') {
          addLog(`${endingPlayer.hero.name} 发动「闭月」，摸一张牌`, 'skill');
          showSkillBanner(endingPlayer.hero.name, '闭月');
          drawCards(endingPlayer.id, 1);
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

        // 结束阶段：若有角色体力<=0且未死亡，进行濒死求桃
        const latestPlayers = playersRef.current.length ? playersRef.current : players;
        for (const p of latestPlayers) {
          const savedAt = recentlySavedRef.current[p.id];
          if (p.hp <= 0 && !p.isDead && !(savedAt && Date.now() - savedAt < 3000)) {
            addLog(`${p.hero.name} 体力为 ${p.hp}，进入濒死状态！`, 'danger');
            // 进入濒死求桃流程
            const isSaved = await askForPeaches(p.id);
            if (!isSaved) {
              addLog(`${p.hero.name} 未能得到救援，死亡！`, 'danger');
              await handleDeath(p.id);
            }
          }
        }
        let nextIndex = (turnIndex + 1) % players.length;
        // Skip dead logic handled at start of effect, but safer here too
        let safety = 0;
        
        // 更新ref中的最新状态
        playersRef.current = players;
        
        while (safety < 10) {
          const nextPlayer = getPlayer(nextIndex);
          if (!nextPlayer || !nextPlayer.isDead) {
            break;
          }
          nextIndex = (nextIndex + 1) % players.length;
          safety++;
        }
        
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

        setTurnIndex(nextIndex);
        setPhase(GamePhase.START);
      }
    };

    // 兜底：阶段结算抛出异常时不要让主循环永久卡死，记录后跳过本阶段
    runTurn().catch((err) => {
      console.error('[runTurn] phase error', err);
      setIsProcessing(0);
      addLog('本阶段结算出现异常，已自动跳到结束阶段', 'danger');
      setPhase(GamePhase.END);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnIndex, screen, isAiTakeover, isProcessing, tutorialActive]); 

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
    if (!card && responder.hero.name === '关羽' && needed === CardName.SHA) {
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
  }, [showRules, showSkillModal, showDiscardViewer, advice, isZhihengMode, isLijianMode, isRendeMode, isJieyinMode, isQixiMode, isZhangbaMode, zhangbaPending, isFanjianMode, isGuoseMode, isQingnangMode, isAnxuMode, inspectPlayerId]);

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
      const canUseSkill = pendingReaction.canUseLongdan || (me.hero.name === '赵云');
      const skillCardName = pendingReaction.skillCardName || 
                           (neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN);
      
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
        const isUsingWusheng = me.hero.name === '关羽' && [Suit.HEART, Suit.DIAMOND].includes(card.suit) && neededCard === CardName.SHA;
        // 甄姬的「倾国」技能：黑色手牌可以当【闪】使用
        const isUsingQingguo = me.hero.name === '甄姬' && neededCard === CardName.SHAN &&
          (card.suit === Suit.SPADE || card.suit === Suit.CLUB);

        if (isUsingNormalCard || isUsingSkillCard || isUsingWusheng || isUsingQingguo) {
          // User plays the correct card or uses skill
          playCard(me.id, card);
          
          // 记录日志，显示是否使用了技能
          if (isUsingSkillCard) {
            addLog(`${me.hero.name} 使用技能「龙胆」，将【${card.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(me.hero.name, '龙胆');
          } else if (isUsingWusheng) {
            addLog(`${me.hero.name} 使用技能「武圣」，将【${card.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(me.hero.name, '武圣');
          } else if (isUsingQingguo) {
            addLog(`${me.hero.name} 使用技能「倾国」，将【${card.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(me.hero.name, '倾国');
          } else {
            addLog(`${me.hero.name} 打出了【${card.name}】`, 'info');
          }
          
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
      const isGuanyu = me.hero.name === '关羽';
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
                          (isGuanyu && isRedCard); // 关羽的红色牌可以当杀使用，需要选择目标
        
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

  const handleTargetClick = async (targetId: number) => {
    if (dyingState || isProcessing) return;

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
        await resolveCardEffect(meZ, [target], virtualSlash);
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
        try { await takeDamage(target.id, meF.id, 1); } finally { setIsProcessing(p => Math.max(0, p - 1)); }
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
      try { await resolveCardEffect(meG, [target], lesiCard); } finally { setIsProcessing(p => Math.max(0, p - 1)); }
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
      updatePlayer(target.id, { hp: Math.min(target.maxHp, target.hp + 1) });
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
        await resolveCardEffect(meQ, [target], tempGuohe);
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
      const myHp = Math.min(meJ.maxHp, meJ.hp + 1);
      const tgHp = Math.min(target.maxHp, target.hp + 1);
      updatePlayer(meJ.id, { hp: myHp });
      updatePlayer(target.id, { hp: tgHp });
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

    // 距离限制：顺手牵羊 / 兵粮寸断 仅限距离 1（黄月英「奇才」无距离限制）
    if (card.name === CardName.SHUNSHOU || card.name === CardName.BINGLIANG) {
      const dist = getDistance(me.id, target.id);
      if (dist > 1 && me.hero.name !== '黄月英') {
        addLog(`【${card.name}】只能对距离为1的角色使用（当前距离 ${dist}）`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
    }

    // 【杀】的距离与次数限制（含 龙胆 / 武圣 转化的杀）
    const isSlashLike = card.name === CardName.SHA ||
      (me.hero.name === '赵云' && card.name === CardName.SHAN) ||
      (me.hero.name === '关羽' && [Suit.HEART, Suit.DIAMOND].includes(card.suit));
    if (isSlashLike && target.id !== me.id) {
      const reach = getAttackRange(me);
      const dist = getDistance(me.id, target.id);
      const qiangwuLong = me.hero.name === '张星彩' && qiangwuPointRef.current !== null
        && rankValue(card.rank) < qiangwuPointRef.current;
      if (dist > reach && !qiangwuLong) {
        addLog(`距离不足：你与 ${target.hero.name} 距离 ${dist}，攻击范围 ${reach}`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (!canPlaySlash(me, card)) {
        addLog('出牌阶段只能使用一张【杀】（诸葛连弩 / 张飞「咆哮」不限；张星彩「枪舞」可让大点数【杀】不计次数）', 'warning');
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
    if (me.hero.name === '关羽' && [Suit.HEART, Suit.DIAMOND].includes(card.suit)) effectiveCardName = CardName.SHA;
    if (me.hero.name === '赵云' && card.name === CardName.SHAN) effectiveCardName = CardName.SHA;
    const targetProtection = getTargetProtection(target, effectiveCardName);
    if (target.id !== me.id && targetProtection) {
      addLog(`${target.hero.name} 发动「${targetProtection}」，不能成为该牌的目标`, 'skill');
      setTimeout(() => { clickGuard.current = false; }, 200);
      return;
    }

    setIsProcessing(p => p + 1);
    try {
      if (card.name === CardName.TAO || card.name === CardName.JIU) {
        // 桃和酒可以对自己使用
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await resolveCardEffect(me, [target], card);
        return;
      }
      
      // 其他卡牌不能对自己使用
      if (target.id === me.id) return;
      
      // 处理赵云的「龙胆」技能 - 主动使用
      const isUsingLongdan = me.hero.name === '赵云' && card.name === CardName.SHAN;
      // 处理关羽的「武圣」技能 - 主动使用
      const isUsingWusheng = me.hero.name === '关羽' && [Suit.HEART, Suit.DIAMOND].includes(card.suit);
      
      setSelectedCardIds([]);
      setIsSelectingTarget(false);

      if (isUsingLongdan) {
        // 赵云将闪当杀使用
        addLog(`${me.hero.name} 使用技能「龙胆」，将【${card.name}】当【杀】使用`, 'skill');
        showSkillBanner(me.hero.name, '龙胆');
        // 创建一个临时的杀卡牌对象用于效果处理
        const tempShaCard = { ...card, name: CardName.SHA };
        await resolveCardEffect(me, [target], tempShaCard);
      } else if (isUsingWusheng) {
        // 关羽将红色牌当杀使用
        addLog(`${me.hero.name} 使用技能「武圣」，将【${card.name}】当【杀】使用`, 'skill');
        showSkillBanner(me.hero.name, '武圣');
        // 创建一个临时的杀卡牌对象用于效果处理
        const tempShaCard = { ...card, name: CardName.SHA };
        await resolveCardEffect(me, [target], tempShaCard);
      } else {
        // 执行普通卡牌效果
        await resolveCardEffect(me, [target], card);
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
        await resolveCardEffect(me, [me], card);
      } else if (card.name === CardName.TAO) {
        // 如果已经选择了目标，直接使用桃
        if (isSelectingTarget) {
          // 目标选择模式下，应该已经有了选中的卡牌和目标
          // 这里需要处理桃的目标使用
          const target = players.find(p => p.isSelected) || me;
          setSelectedCardIds([]);
          setIsSelectingTarget(false);
          await resolveCardEffect(me, [target], card);
        } else {
          // 没有选择目标，默认对自己使用
          if (me.hp < me.maxHp) {
            setSelectedCardIds([]);
            setIsSelectingTarget(false);
            await resolveCardEffect(me, [me], card);
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
        await resolveCardEffect(me, targets, card);
      } else if (card.name === CardName.JIU) {
        // 酒可以对自己使用
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await resolveCardEffect(me, [me], card);
      } else if (card.name === CardName.TIESUO) {
        // 铁索连环：使用玩家选择的目标
        if (tiesuoSelectedTargets.length > 0) {
          const selectedTargets = players.filter(p => tiesuoSelectedTargets.includes(p.id));
          setSelectedCardIds([]);
          setIsSelectingTarget(false);
          setTiesuoSelectedTargets([]);
          await resolveCardEffect(me, selectedTargets, card);
        } else {
          addLog("请选择至少1个目标", 'warning');
          return;
        }
      } else if (card.name === CardName.WUGU || card.name === CardName.TAOYUAN) {
        // 五谷丰登和桃园结义：无需选择目标，直接生效
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await resolveCardEffect(me, [], card);
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
            await resolveCardEffect(me, [weaponPlayer, victimPlayer], card);
          }
        } else {
          addLog("请先选择两名目标角色", 'warning');
          return;
        }
      } else if (card.name === CardName.SHANDIAN) {
        // 闪电：对自己使用，放置到判定区
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await resolveCardEffect(me, [me], card);
      }
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  const handleDiscardConfirm = () => {
    if (phase !== GamePhase.DISCARD) return;
    const me = players.find(p => p.isHuman) || players[0];
    const cards = me.hand.filter(c => selectedCardIds.includes(c.id));
    const excess = me.hand.length - me.hp;
    
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
      const defenderResponded = await triggerReaction(defender.id, attacker.id, CardName.SHA, {
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
      const saved = await askForPeaches(victimId);
      // 求桃失败必须立即结算阵亡，否则 0 体力角色会继续留在场上、胜负判定也会被推迟
      if (!saved) await handleDeath(victimId, sourceId);
    }
  };

  const showCardVisual = (card: Card, playerName: string, duration: number = 1200, gender: 'male' | 'female' = 'male') => {
    setVisualCard({ card, playerName });
    // Play sound based on card name
    playSound(card.name, gender);
    // 减少显示时间，从2秒减少到1.2秒
    setTimeout(() => setVisualCard(null), duration / speedRef.current);
  };

  // 判定演出：判定牌翻面展示（与普通出牌区分开）
  // 演出时长不跟随倍速压缩过多，否则翻牌 + 盖章会被截断
  const showJudgmentVisual = (card: Card, playerName: string, reason: string, duration: number = 1600) => {
    if (judgmentTimerRef.current) clearTimeout(judgmentTimerRef.current);
    // 洛神 / 八卦阵这类「技能带判定」会同时出技能特写，会把判定牌压住
    // 判定演出优先，收起技能横幅（技能名已写在判定名牌里）
    if (skillBannerTimerRef.current) clearTimeout(skillBannerTimerRef.current);
    setSkillBanner(null);
    setJudgmentVisual({ card, playerName, reason, id: Date.now() });
    if (!isMutedRef.current) playSfx('flip');
    judgmentTimerRef.current = setTimeout(() => setJudgmentVisual(null), Math.max(950, duration / speedRef.current));
  };

  // 技能发动横幅：武将名 + 技能名 金色大字短暂展示
  const showSkillBanner = useCallback((hero: string, skill: string) => {
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
    skillBannerTimerRef.current = setTimeout(() => setSkillBanner(null), 1500);
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
    const finalCard = isXiaoqiao && judgmentCard.suit === Suit.DIAMOND
      ? { ...judgmentCard, suit: Suit.HEART }
      : judgmentCard;
    const rankDisplay = judgmentCard.rank;
    addLog(`⚖️ ${playerName} 的【${reason}】判定：${judgmentCard.suit} ${rankDisplay}（判定牌：【${judgmentCard.name}】）${isXiaoqiao && finalCard.suit !== judgmentCard.suit ? '，触发「红颜」视为红桃' : ''}`, 'warning');
    showJudgmentVisual(finalCard, playerName, reason);
    await delay(1600);
    // 郭嘉「天妒」：判定牌生效后获得之
    if (playerName === '郭嘉') {
      mutateHand(playerId, hand => [...hand, finalCard]);
      addLog(`${playerName} 发动「天妒」，获得判定牌【${finalCard.name}】`, 'skill');
      showSkillBanner(playerName, '天妒');
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
    discardCards(playerId, [card]);
    showCardVisual(card, getPlayer(playerId)?.hero.name || '', 1200, getPlayer(playerId)?.hero.gender);
  };

  const resolveCardEffect = async (source: Player, targets: Player[], card: Card) => {
    setIsProcessing(p => p + 1);
    try {
      // Log construction
      const targetNames = targets.map(t => t.hero.name).join('、');
      if (targets.length === 1 && targets[0].id === source.id) {
          addLog(`${source.hero.name} 对自己使用了【${card.name}】`, 'info');
      } else if (targets.length > 0) {
          addLog(`${source.hero.name} 对 ${targetNames} 使用了【${card.name}】`, 'chat');
      } else {
          addLog(`${source.hero.name} 使用了【${card.name}】`, 'chat');
      }

      // 黄月英「集智」：使用锦囊牌时摸一张（诸葛果的「祈禳」改为装备触发，见 equipCard）
      if (card.type === CardType.SCROLL && source.hero.name === '黄月英') {
        addLog(`${source.hero.name} 发动「集智」，摸一张牌`, 'skill');
        showSkillBanner(source.hero.name, '集智');
        drawCards(source.id, 1);
      }

      // SHA（基本牌，不可被无懈可击响应）
      if (card.name === CardName.SHA) {
        playCard(source.id, card);
        slashUsageRef.current[source.id] = (slashUsageRef.current[source.id] ?? 0) + 1;

        // 方天画戟：打出最后一张手牌【杀】时，可额外指定最多 2 名范围内的角色
        let slashTargets = targets;
        const isFangtian = source.equipment?.weapon?.name === CardName.FANGTIAN;
        if (isFangtian && source.hand.length === 1 && source.hand[0].id === card.id) {
          const extras = playersRef.current
            .filter(p => !p.isDead && p.id !== source.id && p.id !== targets[0].id && canReach(source, p))
            .slice(0, 2);
          if (extras.length > 0) {
            slashTargets = [targets[0], ...extras];
            addLog(`【方天画戟】发动！【杀】额外指向 ${extras.map(p => p.hero.name).join('、')}`, 'skill');
            showSkillBanner(source.hero.name, '方天画戟');
          }
        }

        for (const target of slashTargets) {
          if (target.isDead) continue;

          // 大乔「流离」：弃置一张手牌，将【杀】转移给她攻击范围内的另一名角色
          let effectiveTarget = target;
          if (target.hero.name === '大乔' && target.hand.length > 0) {
            const candidates = playersRef.current.filter(p =>
              !p.isDead && p.id !== source.id && p.id !== target.id && canReach(target, p)
            );
            if (candidates.length > 0) {
              const cost = target.hand[Math.floor(Math.random() * target.hand.length)];
              discardCards(target.id, [cost]);
              effectiveTarget = candidates[Math.floor(Math.random() * candidates.length)];
              addLog(`${target.hero.name} 发动「流离」，弃置【${cost.name}】将【杀】转移给 ${effectiveTarget.hero.name}`, 'skill');
              showSkillBanner(target.hero.name, '流离');
              await delay(500);
            }
          }

          // 伏皇后「求援」（原版）：成为【杀】的目标时，可令另一名其他角色交给你一张【闪】，
          // 否则该角色也成为此【杀】的目标。AI 会优先挑「敌对且没有闪」的人：要么交闪，要么替她挨刀。
          if (effectiveTarget.hero.name === '伏皇后' && source.id !== effectiveTarget.id) {
            const candidates = playersRef.current.filter(p =>
              !p.isDead && p.id !== source.id && p.id !== effectiveTarget.id
              && !slashTargets.some(t => t.id === p.id)
            );
            if (candidates.length > 0) {
              const helper = candidates.slice().sort((a, b) => {
                const enemyDiff = (isAlly(effectiveTarget, a) ? 1 : 0) - (isAlly(effectiveTarget, b) ? 1 : 0);
                if (enemyDiff !== 0) return enemyDiff;
                const shanDiff = (a.hand.some(c => c.name === CardName.SHAN) ? 1 : 0)
                  - (b.hand.some(c => c.name === CardName.SHAN) ? 1 : 0);
                if (shanDiff !== 0) return shanDiff;
                return a.hand.length - b.hand.length;
              })[0];
              const shan = helper.hand.find(c => c.name === CardName.SHAN);
              const willing = !!shan && (isAlly(effectiveTarget, helper) || helper.hp >= 2);
              addLog(`${effectiveTarget.hero.name} 发动「求援」，指定 ${helper.hero.name}`, 'skill');
              showSkillBanner(effectiveTarget.hero.name, '求援');
              await delay(450);
              if (willing && shan) {
                mutateHand(helper.id, h => h.filter(c => c.id !== shan.id));
                mutateHand(effectiveTarget.id, h => [...h, shan]);
                addLog(`${helper.hero.name} 交出【闪】响应「求援」，不再成为此【杀】的目标`, 'skill');
              } else {
                slashTargets.push(helper);
                addLog(`${helper.hero.name} 未交出【闪】，也成为此【杀】的目标`, 'skill');
              }
              await delay(450);
            }
          }

          // 王异「贞烈」：失去1点体力，弃伤害来源一张手牌，令此【杀】无效
          if (await tryZhenlie(effectiveTarget, source, card)) {
            continue;
          }

          // 空城：没有手牌的诸葛亮不能成为【杀】的目标
          const slashProtection = getTargetProtection(effectiveTarget, CardName.SHA);
          if (slashProtection) {
            addLog(`${effectiveTarget.hero.name} 发动「${slashProtection}」，【杀】无效`, 'skill');
            await delay(400);
            continue;
          }

          // 防具判定：仁王盾免疫黑色【杀】；青釭剑无视防具
          const armor = effectiveTarget.equipment?.armor?.name;
          const ignoreArmor = source.equipment?.weapon?.name === CardName.QINGGANG;
          const isBlackSlash = card.suit === Suit.SPADE || card.suit === Suit.CLUB;
          if (!ignoreArmor && armor === CardName.RENWANG && isBlackSlash) {
            addLog(`${effectiveTarget.hero.name} 的【仁王盾】挡住了黑色【杀】，伤害无效`, 'success');
            await delay(500);
            continue;
          }
          // 藤甲：普通【杀】无效（火杀/雷杀不受影响）
          if (!ignoreArmor && armor === CardName.TENGJIA && !card.attribute) {
            addLog(`${effectiveTarget.hero.name} 的【藤甲】挡住了普通【杀】，伤害无效`, 'success');
            await delay(500);
            continue;
          }

          // 雌雄双股剑：指定异性目标后，令其弃一张手牌，或令你摸一张牌
          if (source.equipment?.weapon?.name === CardName.CIXIONG
              && source.hero.gender !== effectiveTarget.hero.gender) {
            const t = getPlayer(effectiveTarget.id);
            if (t && t.hand.length > 0) {
              const cost = t.hand[Math.floor(Math.random() * t.hand.length)];
              discardCards(t.id, [cost]);
              addLog(`【雌雄双股剑】发动，${t.hero.name} 弃置了【${cost.name}】`, 'skill');
            } else {
              drawCards(source.id, 1);
              addLog(`【雌雄双股剑】发动，${source.hero.name} 摸一张牌`, 'skill');
            }
            await delay(400);
          }

          // 马超「铁骑」：判定为红色则目标不能使用【闪】
          if (source.hero.name === '马超') {
            const jc = await performJudgment(source.id, '铁骑');
            if (jc && (jc.suit === Suit.HEART || jc.suit === Suit.DIAMOND)) {
              addLog(`${source.hero.name} 发动「铁骑」，判定为红色，${effectiveTarget.hero.name} 无法闪避！`, 'skill');
              showSkillBanner(source.hero.name, '铁骑');
              await takeDamage(effectiveTarget.id, source.id, 1, card);
              continue;
            }
            addLog(`「铁骑」判定为黑色，${effectiveTarget.hero.name} 仍可出【闪】`, 'info');
          }

          // 黄忠「烈弓」：目标手牌不少于自己体力时，此【杀】不可被闪避
          const isLieGong = source.hero.name === '黄忠' && effectiveTarget.hand.length >= source.hp;
          if (isLieGong) {
            addLog(`${source.hero.name} 发动「烈弓」，${effectiveTarget.hero.name} 无法闪避！`, 'skill');
            showSkillBanner(source.hero.name, '烈弓');
            await takeDamage(effectiveTarget.id, source.id, 1, card);
            continue;
          }

          const hpBefore = getPlayer(effectiveTarget.id)?.hp ?? 0;
          await triggerReaction(effectiveTarget.id, source.id, CardName.SHAN, card);
          const hpAfter = getPlayer(effectiveTarget.id)?.hp ?? 0;

          // 贯石斧：被【闪】抵消时，可弃两张牌令此【杀】依然造成伤害
          const isGuanshi = source.equipment?.weapon?.name === CardName.GUANSHI;
          if (isGuanshi && hpAfter === hpBefore && !getPlayer(effectiveTarget.id)?.isDead
              && source.hand.length >= 2 && (effectiveTarget.hp <= 1 || source.hand.length >= 4)) {
            const cost = source.hand.slice(0, 2);
            discardCards(source.id, cost);
            addLog(`【贯石斧】发动！${source.hero.name} 弃置两张牌，令此【杀】依然造成伤害`, 'skill');
            showSkillBanner(source.hero.name, '贯石斧');
            await delay(400);
            const t = getPlayer(effectiveTarget.id);
            if (t && !t.isDead) await takeDamage(t.id, source.id, 1, card);
            await delay(300);
            continue;
          }

          // 青龙偃月刀：若【杀】被闪避且手中还有【杀】，追加一击
          const isQinglong = source.equipment?.weapon?.name === CardName.QINGLONG;
          if (isQinglong && hpAfter === hpBefore && !getPlayer(effectiveTarget.id)?.isDead) {
            const extraSha = playersRef.current.find(p => p.id === source.id)?.hand.find(c => c.name === CardName.SHA);
            if (extraSha) {
              addLog(`【青龙偃月刀】发动，追加一击！`, 'skill');
              showSkillBanner(source.hero.name, '青龙偃月刀');
              await delay(500);
              await resolveCardEffect(source, [effectiveTarget], extraSha);
              continue;
            }
          }
          await delay(300);
        }
      }
      // JUEDOU
      else if (card.name === CardName.JUEDOU) {
         const target = targets[0];
         if (await tryZhenlie(target, source, card)) {
           playCard(source.id, card);
           return;
         }
         const protect = getTargetProtection(target, CardName.JUEDOU);
         if (protect) {
           addLog(`${target.hero.name} 发动「${protect}」，【决斗】无效`, 'skill');
           return;
         }
        playCard(source.id, card);
         addLog(`${source.hero.name} 找 ${target.hero.name} 决斗！`, 'danger');
         // 先询问是否使用无懈可击
         const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
         if (!isWuxieUsed) {
           // 如果没有使用无懈可击，再询问是否使用杀
           await triggerReaction(target.id, source.id, CardName.SHA, card);
         }
      }
      // NANMAN
      else if (card.name === CardName.NANMAN) {
        playCard(source.id, card);
        addLog('南蛮入侵！全场需打出【杀】', 'danger');
        for (const t of targets) {
          // 祝融「巨象」：南蛮入侵对其无效，并摸一张牌
          if (t.hero.name === '祝融') {
            addLog(`${t.hero.name} 发动「巨象」，「南蛮入侵」对其无效`, 'skill');
            showSkillBanner(t.hero.name, '巨象');
            drawCards(t.id, 1);
            await delay(400);
            continue;
          }
          // 藤甲：南蛮入侵对其无效
          if (t.equipment?.armor?.name === CardName.TENGJIA) {
            addLog(`${t.hero.name} 的【藤甲】使【南蛮入侵】无效`, 'success');
            await delay(400);
            continue;
          }
          if (await tryZhenlie(t, source, card)) continue;
          // 先询问是否使用无懈可击
          const isWuxieUsed = await triggerReaction(t.id, source.id, CardName.WUXIE, card);
          if (!isWuxieUsed) {
            // 如果没有使用无懈可击，再询问是否使用杀
            await triggerReaction(t.id, source.id, CardName.SHA, card);
          }
          await delay(500);
        }
      }
      // TAO
      else if (card.name === CardName.TAO) {
        const target = targets[0];
        // 检查目标体力是否已满
        if (target.hp >= target.maxHp) {
          // 体力已满，不消耗桃，显示提示
          addLog(`${target.hero.name} 体力已满，无需吃桃`, 'warning');
          // 不消耗桃，直接返回
          return;
        }
        // 体力未满，正常使用桃
        playCard(source.id, card);
        // 孙权「救援」：其他吴势力角色对主公使用【桃】时额外回复1点
        let healPoints = 1;
        if (target.hero.name === '孙权' && target.identity === Identity.ZHUGONG
            && source.id !== target.id && source.hero.kingdom === '吴') {
          healPoints = 2;
          addLog(`${target.hero.name} 的「救援」发动，额外回复1点体力`, 'skill');
          showSkillBanner(target.hero.name, '救援');
        }
        // 更新目标体力，确保体力正确
        const newHp = Math.min(target.hp + healPoints, target.maxHp);
        const healAmount = newHp - target.hp;

        // 触发治疗动画
        setHealAnimTarget(target.id);
        setHealNumber({ targetId: target.id, amount: healAmount, id: Date.now().toString() });
        setTimeout(() => setHealAnimTarget(null), 600);
        setTimeout(() => setHealNumber(null), 1000);

        updatePlayer(target.id, { hp: newHp });
        // 身份推理：给主公回血者视为忠臣
        if (target.identity === Identity.ZHUGONG && source.id !== target.id) {
          identityGuessRef.current[source.id] = Identity.ZHONGCHEN;
        }
        // 显示谁使用桃救援了谁，以及救援后的体力
        if (source.id === target.id) {
          addLog(`${source.hero.name} 使用了【桃】自救，当前体力: ${newHp}/${target.maxHp}`, 'success');
        } else {
          addLog(`${source.hero.name} 使用了【桃】救援 ${target.hero.name}，${target.hero.name} 当前体力: ${newHp}/${target.maxHp}`, 'success');
        }
      }
      // WUZHONG
      else if (card.name === CardName.WUZHONG) {
        playCard(source.id, card);
        drawCards(source.id, 2);
        addLog(`${source.hero.name} 摸了两张牌`, 'success');
      }
      // 万箭齐发
      else if (card.name === CardName.WANJIAN) {
        playCard(source.id, card);
        addLog('万箭齐发！全场需打出【闪】', 'danger');
        for (const t of targets) {
          // 藤甲：万箭齐发对其无效
          if (t.equipment?.armor?.name === CardName.TENGJIA) {
            addLog(`${t.hero.name} 的【藤甲】使【万箭齐发】无效`, 'success');
            await delay(400);
            continue;
          }
          if (await tryZhenlie(t, source, card)) continue;
          // 先询问是否使用无懈可击
          const isWuxieUsed = await triggerReaction(t.id, source.id, CardName.WUXIE, card);
          if (!isWuxieUsed) {
            // 如果没有使用无懈可击，再询问是否使用闪
            await triggerReaction(t.id, source.id, CardName.SHAN, card);
          }
          await delay(500);
        }
      }
      // 顺手牵羊
      else if (card.name === CardName.SHUNSHOU) {
        const target = targets[0];
        const protect = getTargetProtection(target, CardName.SHUNSHOU);
        if (protect) {
          addLog(`${target.hero.name} 发动「${protect}」，不能被【顺手牵羊】指定`, 'skill');
          return;
        }
        if (await tryZhenlie(target, source, card)) {
          playCard(source.id, card);
          return;
        }
        const targetHasEquip = !!(target.equipment?.weapon || target.equipment?.armor || target.equipment?.horsePlus || target.equipment?.horseMinus);
        if (target.hand.length > 0 || targetHasEquip) {
          playCard(source.id, card);
          // 询问目标是否使用无懈可击
          const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
          if (!isWuxieUsed) {
            // 优先偷装备（有则 40% 概率），否则偷手牌
            const equipCards = [target.equipment?.weapon, target.equipment?.armor, target.equipment?.horsePlus, target.equipment?.horseMinus].filter(Boolean) as Card[];
            const stealEquip = equipCards.length > 0 && (target.hand.length === 0 || Math.random() < 0.4);

            if (stealEquip) {
              const stolenEquip = equipCards[Math.floor(Math.random() * equipCards.length)];
              const nextEquip = { ...(target.equipment ?? {}) };
              (Object.keys(nextEquip) as Array<keyof typeof nextEquip>).forEach(k => {
                if (nextEquip[k]?.id === stolenEquip.id) delete nextEquip[k];
              });
              updatePlayer(target.id, { equipment: nextEquip });
              mutateHand(source.id, hand => [...hand, stolenEquip]);
              onEquipLost(target.id, stolenEquip.name);
              triggerXiaoji(target.id);
              addLog(`${source.hero.name} 顺手牵走了 ${target.hero.name} 的装备【${stolenEquip.name}】`, 'chat');
              triggerWanwei(target.id, [stolenEquip.name]);
            } else if (target.hand.length > 0) {
              const randomIndex = Math.floor(Math.random() * target.hand.length);
              const stolenCard = target.hand[randomIndex];

              // 从目标手牌中移除、加入自己手牌（基于最新 state，避免旧闭包导致卡牌复活）
              mutateHand(target.id, hand => hand.filter(c => c.id !== stolenCard.id));
              mutateHand(source.id, hand => [...hand, stolenCard]);

              addLog(`${source.hero.name} 从 ${target.hero.name} 那里偷到了【${stolenCard.name}】`, 'chat');
              triggerWanwei(target.id, [stolenCard.name]);
            } else {
              addLog(`${target.hero.name} 没有牌可偷`, 'info');
            }
          } else {
            addLog(`${target.hero.name} 使用了【无懈可击】，免疫了【${card.name}】的效果！`, 'success');
          }
        } else {
          addLog(`${target.hero.name} 没有手牌可偷，【${card.name}】不消耗！`, 'warning');
        }
      }
      // 乐不思蜀
      else if (card.name === CardName.LESI) {
        const target = targets[0];
        const protect = getTargetProtection(target, CardName.LESI);
        if (protect) {
          addLog(`${target.hero.name} 发动「${protect}」，不能被【乐不思蜀】指定`, 'skill');
          return;
        }
        playCard(source.id, card);
        addLog(`${source.hero.name} 对 ${target.hero.name} 使用了乐不思蜀`, 'info');
        // 询问目标是否使用无懈可击
        const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
        if (isWuxieUsed) {
          addLog(`${target.hero.name} 使用了【无懈可击】，免疫了【${card.name}】的效果！`, 'success');
          return;
        }
        // 设置乐不思蜀状态
        updatePlayer(target.id, { isLeBuSiShu: true });
        addLog(`${target.hero.name} 中了【乐不思蜀】，下回合判定非红桃将跳过出牌阶段`, 'warning');
      }
      // 过河拆桥
      else if (card.name === CardName.GUOHE) {
        const target = targets[0];
        if (await tryZhenlie(target, source, card)) {
          playCard(source.id, card);
          return;
        }
        const equipCards = [target.equipment?.weapon, target.equipment?.armor, target.equipment?.horsePlus, target.equipment?.horseMinus].filter(Boolean) as Card[];
        if (target.hand.length > 0 || equipCards.length > 0) {
          playCard(source.id, card);
          // 询问目标是否使用无懈可击
          const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
          if (!isWuxieUsed) {
            // 有装备且（无手牌 或 35% 概率）则拆装备
            const shouldEquip = equipCards.length > 0 && (target.hand.length === 0 || Math.random() < 0.35);
            if (shouldEquip) {
              const brokenEquip = equipCards[Math.floor(Math.random() * equipCards.length)];
              const nextEquip = { ...(target.equipment ?? {}) };
              (Object.keys(nextEquip) as Array<keyof typeof nextEquip>).forEach(k => {
                if (nextEquip[k]?.id === brokenEquip.id) delete nextEquip[k];
              });
              updatePlayer(target.id, { equipment: nextEquip });
              setDiscardPile(prev => {
                const newPile = [...prev, brokenEquip];
                discardPileRef.current = newPile;
                return newPile;
              });
              onEquipLost(target.id, brokenEquip.name);
              triggerXiaoji(target.id);
              addLog(`${source.hero.name} 拆掉了 ${target.hero.name} 的装备【${brokenEquip.name}】`, 'chat');
              triggerWanwei(target.id, [brokenEquip.name]);
            } else {
              // 从目标手牌中弃置（基于最新 state），进入弃牌堆
              const randomIndex = Math.floor(Math.random() * target.hand.length);
              const brokenCard = target.hand[randomIndex];

              mutateHand(target.id, hand => hand.filter(c => c.id !== brokenCard.id));
              setDiscardPile(prev => {
                const newPile = [...prev, brokenCard];
                discardPileRef.current = newPile;
                return newPile;
              });

              addLog(`${source.hero.name} 弃置了 ${target.hero.name} 的【${brokenCard.name}】`, 'chat');
              triggerWanwei(target.id, [brokenCard.name]);
            }
          } else {
            addLog(`${target.hero.name} 使用了【无懈可击】，免疫了【${card.name}】的效果！`, 'success');
          }
        } else {
          addLog(`${target.hero.name} 没有牌可弃置，【${card.name}】不消耗！`, 'warning');
        }
      }
      // 无懈可击（只能在自己或队友成为锦囊牌目标时响应使用，主动使用无效且不消耗）
      else if (card.name === CardName.WUXIE) {
        addLog('【无懈可击】只能在你或队友被锦囊牌指定时打出响应，已取消使用', 'warning');
      }
      // 火攻
      else if (card.name === CardName.HUOGONG) {
        const target = targets[0];
        if (await tryZhenlie(target, source, card)) {
          playCard(source.id, card);
          return;
        }
        // 先将火攻放入弃牌堆
        playCard(source.id, card);
        if (target.hand.length === 0) {
          addLog(`${target.hero.name} 没有手牌，【火攻】无效！`, 'warning');
          return;
        }
        // 询问目标是否使用无懈可击
        const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
        if (isWuxieUsed) {
          addLog(`${target.hero.name} 使用了【无懈可击】，免疫了【火攻】的效果！`, 'success');
          return;
        }
        // 目标展示一张手牌
        const shownCard = target.hand[Math.floor(Math.random() * target.hand.length)];
        addLog(`${target.hero.name} 展示了手牌【${shownCard.name}】(${shownCard.suit})`, 'info');
        // 检查源玩家是否有同花色手牌
        const sameSuitCard = source.hand.find(c => c.suit === shownCard.suit);
        if (sameSuitCard) {
          // 弃置同花色手牌并造成伤害
          updatePlayer(source.id, {
            hand: source.hand.filter(c => c.id !== sameSuitCard.id)
          });
          setDiscardPile(prev => [...prev, sameSuitCard]);
          addLog(`${source.hero.name} 弃置了【${sameSuitCard.name}】(${sameSuitCard.suit})，对 ${target.hero.name} 造成1点火焰伤害！`, 'danger');
          // 属性伤害统一由 takeDamage 处理（含藤甲加伤与铁索传导）
          await takeDamage(target.id, source.id, 1, card, 'fire');
        } else {
          addLog(`${source.hero.name} 没有${shownCard.suit}花色的手牌，【火攻】失败！`, 'warning');
        }
      }
      // 铁索连环
      else if (card.name === CardName.TIESUO) {
        playCard(source.id, card);
        addLog(`${source.hero.name} 使用了【铁索连环】`, 'info');
        // 标记目标为横置状态
        for (const target of targets) {
          // 切换横置状态
          const newChainedState = !target.isChained;
          updatePlayer(target.id, { isChained: newChainedState });
          addLog(`${target.hero.name} ${newChainedState ? '被横置' : '重置'}`, 'info');
        }
      }
      // 酒
      else if (card.name === CardName.JIU) {
        playCard(source.id, card);
        const target = targets[0];
        // 濒死状态使用：回复1点体力（目标必须是濒死者）
        if (target && target.hp <= 0) {
          const newHp = Math.min(target.hp + 1, target.maxHp);
          setHealAnimTarget(target.id);
          setHealNumber({ targetId: target.id, amount: 1, id: Date.now().toString() });
          setTimeout(() => setHealAnimTarget(null), 600);
          setTimeout(() => setHealNumber(null), 1000);
          updatePlayer(target.id, { hp: newHp });
          if (source.id === target.id) {
            addLog(`${source.hero.name} 使用【酒】自救，当前体力: ${newHp}/${target.maxHp}`, 'success');
          } else {
            addLog(`${source.hero.name} 使用【酒】救援 ${target.hero.name}，${target.hero.name} 当前体力: ${newHp}/${target.maxHp}`, 'success');
          }
        } else {
          // 出牌阶段使用：下一张杀伤害+1
          // 简化实现：标记玩家状态，下次使用杀时伤害+1
          addLog(`${source.hero.name} 喝酒壮胆，本回合下一张【杀】伤害+1！`, 'success');
          // 使用全局状态或ref来标记
          if (!window.jiuBoost) window.jiuBoost = {};
          window.jiuBoost[source.id] = true;
        }
      }
      // 兵粮寸断
      else if (card.name === CardName.BINGLIANG) {
        playCard(source.id, card);
        const target = targets[0];
        addLog(`${source.hero.name} 对 ${target.hero.name} 使用了【兵粮寸断】`, 'info');
        // 询问目标是否使用无懈可击
        const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
        if (isWuxieUsed) {
          addLog(`${target.hero.name} 使用了【无懈可击】，免疫了【兵粮寸断】的效果！`, 'success');
          return;
        }
        // 设置兵粮寸断状态
        updatePlayer(target.id, { isBingLiangCunDuan: true });
        addLog(`${target.hero.name} 中了【兵粮寸断】，下回合判定非梅花将跳过摸牌阶段`, 'warning');
      }
      // 五谷丰登
      else if (card.name === CardName.WUGU) {
        playCard(source.id, card);
        addLog(`${source.hero.name} 使用了【五谷丰登】`, 'info');
        
        // 获取所有存活角色
        const alivePlayers = players.filter(p => !p.isDead);
        const cardCount = alivePlayers.length;

        // 从牌堆顶亮出等同于存活角色数量的牌（基于 deckRef，必要时洗切弃牌堆）
        let currentDeck = [...deckRef.current];
        if (currentDeck.length < cardCount && discardPileRef.current.length > 0) {
          currentDeck = shuffle([...discardPileRef.current, ...currentDeck]);
          setDiscardPile([]);
          discardPileRef.current = [];
          addLog('牌堆已洗切', 'info');
        }
        const drawCount = Math.min(cardCount, currentDeck.length);
        let revealedCards: Card[] = currentDeck.splice(currentDeck.length - drawCount, drawCount);
        setDeck(currentDeck);
        deckRef.current = currentDeck;

        await delay(500);
        addLog(`亮出了 ${revealedCards.length} 张牌: ${revealedCards.map(c => c.name).join('、')}`, 'info');
        
        // 按照行动顺序（从当前角色开始）依次选择牌
        const playerCount = players.length;
        const sortedPlayers = [...alivePlayers].sort((a, b) => {
          const offsetA = (a.id - source.id + playerCount) % playerCount;
          const offsetB = (b.id - source.id + playerCount) % playerCount;
          return offsetA - offsetB;
        });
        
        for (const player of sortedPlayers) {
          if (revealedCards.length === 0) break;
          
          if (player.isHuman && !isAiTakeover) {
            // 人类玩家选择
            const selectedCard = await new Promise<Card | null>(resolve => {
              setWuguSelection({
                cards: revealedCards,
                playerName: player.hero.name,
                onSelect: (card: Card | null) => resolve(card)
              });
            });
            
            if (selectedCard) {
              revealedCards = revealedCards.filter(c => c.id !== selectedCard.id);
              mutateHand(player.id, hand => [...hand, selectedCard]);
              addLog(`${player.hero.name} 选择了【${selectedCard.name}】`, 'success');
            }
          } else {
            // AI 随机选择
            const randomIndex = Math.floor(Math.random() * revealedCards.length);
            const selectedCard = revealedCards[randomIndex];
            revealedCards = revealedCards.filter(c => c.id !== selectedCard.id);
            mutateHand(player.id, hand => [...hand, selectedCard]);
            addLog(`${player.hero.name} 选择了【${selectedCard.name}】`, 'success');
            await delay(800);
          }
        }
        
        // 剩余的牌进入弃牌堆
        if (revealedCards.length > 0) {
          setDiscardPile(prev => [...prev, ...revealedCards]);
          addLog(`${revealedCards.length} 张牌进入弃牌堆`, 'info');
        }
        
        setWuguSelection(null);
      }
      // 桃园结义
      else if (card.name === CardName.TAOYUAN) {
        playCard(source.id, card);
        addLog(`${source.hero.name} 使用了【桃园结义】`, 'info');
        
        // 获取所有存活角色
        const alivePlayers = players.filter(p => !p.isDead);
        
        // 所有存活角色依次回复1点体力
        for (const player of alivePlayers) {
          if (player.hp < player.maxHp) {
            const newHp = Math.min(player.hp + 1, player.maxHp);
            const healAmount = newHp - player.hp;
            
            // 触发治疗动画
            setHealAnimTarget(player.id);
            setHealNumber({ targetId: player.id, amount: healAmount, id: Date.now().toString() + Math.random() });
            setTimeout(() => setHealAnimTarget(null), 600);
            setTimeout(() => setHealNumber(null), 1000);
            
            updatePlayer(player.id, { hp: newHp });
            addLog(`${player.hero.name} 回复了 ${healAmount} 点体力，当前体力: ${newHp}/${player.maxHp}`, 'success');
            await delay(500);
          } else {
            addLog(`${player.hero.name} 体力已满，无需回复`, 'info');
          }
        }
      }
      // 借刀杀人
      else if (card.name === CardName.JIEDAO) {
        const target = targets[0];
        const victim = targets[1];
        if (await tryZhenlie(target, source, card)) {
          playCard(source.id, card);
          return;
        }
        playCard(source.id, card);
        addLog(`${source.hero.name} 对 ${target.hero.name} 使用了【借刀杀人】，令其攻击 ${victim.hero.name}`, 'info');
        
        // 询问目标是否使用无懈可击
        const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
        if (isWuxieUsed) {
          addLog(`${target.hero.name} 使用了【无懈可击】，【借刀杀人】失效！`, 'success');
          return;
        }
        
        // 目标有【杀】则必须使用；受害者可打出【闪】抵消
        if (target.hand.some(c => c.name === CardName.SHA)) {
          // 使用杀攻击目标
          const shaCard = target.hand.find(c => c.name === CardName.SHA)!;
          playCard(target.id, shaCard);
          addLog(`${target.hero.name} 被【借刀杀人】所迫，对 ${victim.hero.name} 使用了【杀】`, 'info');

          // 受害者通过响应流程打出【闪】（人类玩家会收到响应弹窗）
          await triggerReaction(victim.id, target.id, CardName.SHAN, card);
        } else {
          // 无【杀】：将武器牌交给使用者
          const weapon = target.equipment?.weapon;
          if (weapon) {
            const nextEquip = { ...(target.equipment ?? {}) };
            delete nextEquip.weapon;
            updatePlayer(target.id, { equipment: nextEquip });
            mutateHand(source.id, hand => [...hand, weapon]);
            triggerXiaoji(target.id);
            addLog(`${target.hero.name} 无法使用【杀】，将【${weapon.name}】交给了 ${source.hero.name}`, 'info');
          } else {
            addLog(`${target.hero.name} 没有【杀】也没有武器，【借刀杀人】无效果`, 'info');
          }
        }
      }
      // 闪电（延时锦囊）：挂置于自己判定区，下回合开始时判定
      else if (card.name === CardName.SHANDIAN) {
        playCard(source.id, card);
        addLog(`${source.hero.name} 使用了【闪电】，将其放置于自己的判定区`, 'warning');

        // 询问是否使用无懈可击（对自己使用的情况）
        const isWuxieUsed = await triggerReaction(source.id, source.id, CardName.WUXIE, card);
        if (isWuxieUsed) {
          addLog(`${source.hero.name} 使用了【无懈可击】，【闪电】被抵消！`, 'success');
        } else {
          updatePlayer(source.id, { isShandian: true });
          addLog(`⚡【闪电】悬于 ${source.hero.name} 头顶，下回合开始时判定`, 'warning');
        }
      }
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  const triggerReaction = async (responderId: number, sourceId: number, neededCard: CardName, triggerCard: Card, isSecondReaction: boolean = false) => {
    setIsProcessing(p => p + 1);
    try {
      const responder = getPlayer(responderId)!;
      const source = getPlayer(sourceId)!;
      
      // Check if responder is dead, skip reaction if dead
      if (responder.isDead) {
        return false;
      }
      
      // 检查是否为无懈可击判定
      const isWuxieCheck = neededCard === CardName.WUXIE;
      
      // 检查是否为吕布的无双技能
      const isLubuWushuang = source.hero.name === '吕布';
      const needTwoCards = isLubuWushuang && !isSecondReaction && (neededCard === CardName.SHAN || neededCard === CardName.SHA);
      const wushuangCardName = neededCard === CardName.SHAN ? '闪' : '杀';

      // 八卦阵：需要【闪】时自动判定，红色视为打出【闪】（青釭剑无视防具）
      if (
        neededCard === CardName.SHAN &&
        !isSecondReaction &&
        responder.equipment?.armor?.name === CardName.BAGUA &&
        source.equipment?.weapon?.name !== CardName.QINGGANG
      ) {
        const judgment = await performJudgment(responderId, '八卦阵');
        if (judgment && (judgment.suit === Suit.HEART || judgment.suit === Suit.DIAMOND)) {
          addLog(`${responder.hero.name} 的【八卦阵】判定为红色，视为打出了【闪】！`, 'success');
          await delay(400);
          return false;
        }
        addLog(`${responder.hero.name} 的【八卦阵】判定失败，仍需自行出【闪】`, 'warning');
        await delay(300);
      }

      // 主公技：曹操「护驾」/ 刘备「激将」
      const lordSkillName =
        responder.identity === Identity.ZHUGONG && responder.hero.name === '曹操' && neededCard === CardName.SHAN ? '护驾'
        : responder.identity === Identity.ZHUGONG && responder.hero.name === '刘备' && neededCard === CardName.SHA ? '激将'
        : null;
      if (lordSkillName && !responder.hand.some(c => c.name === neededCard)) {
        const kingdom = responder.hero.kingdom;
        const helper = playersRef.current.find(p =>
          !p.isDead && p.id !== responder.id && p.hero.kingdom === kingdom
          && p.hand.some(c => c.name === neededCard)
        );
        if (helper) {
          const helpCard = helper.hand.find(c => c.name === neededCard)!;
          playCard(helper.id, helpCard);
          addLog(`${responder.hero.name} 发动「${lordSkillName}」，${helper.hero.name} 打出了【${neededCard}】（视为 ${responder.hero.name} 打出）`, 'skill');
          showSkillBanner(responder.hero.name, lordSkillName);
          await delay(500);
          return false;
        }
      }

      // HUMAN REACTION
      if (responder.isHuman && !isAiTakeover) {
        const hasCard = responder.hand.some(c => c.name === neededCard);
        const canUseSkill = responder.hero.name === '赵云';
        const skillCardName = canUseSkill ? (neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN) : null;
        const hasSkillCard = canUseSkill && responder.hand.some(c => c.name === skillCardName);
        const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
        
        // 如果是无懈可击判定，且玩家手中没有无懈可击，直接返回false，不显示弹窗
        if (isWuxieCheck && !hasWuxie) {
          addLog(`${responder.hero.name} 没有【无懈可击】，无法免疫效果！`, 'info');
          return false;
        }
        
        // 构建更详细的提示信息
        let prompt = `受到 ${source.hero.name} 的【${triggerCard.name}】威胁！`;
        // 吕布无双技能提示
        if (needTwoCards) {
          prompt += `【无双】需要两张【${wushuangCardName}】！`;
        }
        let options = [];
        
        // 关羽的「武圣」技能：红色牌可以当杀使用
        const isGuanyu = responder.hero.name === '关羽';
        const hasRedCard = responder.hand.some(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
        
        if (isWuxieCheck) {
          // 无懈可击判定
          if (hasWuxie) options.push(`使用【无懈可击】免疫效果`);
          options.push('不使用无懈可击');
        } else {
          // 普通判定
          if (hasCard) options.push(`出【${neededCard}】`);
          if (hasSkillCard && canUseSkill) {
            const skillDesc = neededCard === CardName.SHAN 
              ? `使用【杀】（「龙胆」技能）` 
              : `使用【闪】（「龙胆」技能）`;
            options.push(skillDesc);
          }
          // 关羽的「武圣」技能：红色牌可以当杀使用
          if (isGuanyu && neededCard === CardName.SHA && hasRedCard) {
            options.push(`使用红色牌当【杀】（「武圣」技能）`);
          }
          if (hasWuxie) options.push(`使用【无懈可击】免疫效果`);
          options.push('承受伤害');
        }
        
        prompt += `请选择：${options.join(' / ')}`;
        
        addLog(prompt, 'warning');
        
        // Set State for UI to show prompt
        setPendingReaction({ 
          sourceId, 
          targetId: responderId, 
          cardName: neededCard, 
          originalCard: triggerCard,
          canUseLongdan: canUseSkill,
          skillCardName: skillCardName,
          canUseWuxie: hasWuxie
        });
        
        // Wait for user input via Promise with timeout（与出牌阶段一致的读秒）
        setReactionLeft(DECISION_SECONDS);
        const result = await new Promise<{ played: boolean, isWuxie: boolean }>((resolve) => {
           humanReactionResolver.current = resolve;

           const tickId = window.setInterval(() => {
             setReactionLeft(v => (v === null ? null : Math.max(0, v - 1)));
           }, 1000);
           reactionTickRef.current = tickId;

           const timeoutId = window.setTimeout(() => {
              if (humanReactionResolver.current) {
                addLog('时间到！自动放弃防御', 'danger');
                humanReactionResolver.current({ played: false, isWuxie: false });
              }
            }, DECISION_SECONDS * 1000);

           timeoutIdRef.current = timeoutId;
        });

        // Cleanup
        clearTimeout(timeoutIdRef.current); // Clear timeout to prevent memory leak
        timeoutIdRef.current = null;
        if (reactionTickRef.current) {
          window.clearInterval(reactionTickRef.current);
          reactionTickRef.current = null;
        }
        setReactionLeft(null);
        setPendingReaction(null);
        humanReactionResolver.current = null;

        if (result.played) {
           if (result.isWuxie) {
             addLog(`你使用了【无懈可击】，免疫了【${triggerCard.name}】的效果！`, 'success');
             
             return true;
           } else {
             if (isWuxieCheck) {
               addLog(`你选择不使用【无懈可击】`, 'info');
               return false;
             } else {
               addLog(`你打出了【${neededCard}】，防御成功！`, 'success');
               
               
               // 吕布无双技能：需要第二张牌
               if (needTwoCards) {
                 addLog(`【无双】还需要一张【${wushuangCardName}】！`, 'warning');
                 await delay(500);
                 const secondResult = await triggerReaction(responderId, sourceId, neededCard, triggerCard, true);
                 // 如果第二张牌没有打出，仍然受到伤害
                 if (!secondResult) {
                   addLog(`没有打出第二张【${wushuangCardName}】，防御失败！`, 'danger');
                   await takeDamage(responderId, sourceId, 1, triggerCard);
                   // 防御失败，决斗结束，不再继续
                   return false;
                 }
                 // 防御成功，如果是决斗则继续
                 if (triggerCard.name === CardName.JUEDOU) {
                    await delay(800);
                    await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
                 }
                 return false;
               }
               
               if (triggerCard.name === CardName.JUEDOU) {
                  await delay(800);
                  await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
               }
               return false;
             }
           }
        } else {
           if (isWuxieCheck) {
             // 无懈可击判定超时，不使用无懈可击
             addLog(`你选择不使用【无懈可击】`, 'info');
             return false;
           } else {
             // 普通判定超时，承受伤害
             addLog(`你放弃了防御。`, 'danger');
             await takeDamage(responderId, sourceId, 1, triggerCard);
             return false;
           }
        }
      } 
      // AI (or Human Auto) REACTION
      else {
        await delay(1000); 
        let hasCard = responder.hand.some(c => c.name === neededCard);
        let cardToPlay = responder.hand.find(c => c.name === neededCard);
        let isUsingSkill = false;
        
        // 检查是否为无懈可击判定
        const isWuxieCheck = neededCard === CardName.WUXIE;
        
        // 无懈可击决策：简单随机、普通必用、困难只留给高价值锦囊
        if (isWuxieCheck) {
          const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
          const difficulty = aiDifficultyRef.current;
          const highValue = [CardName.JUEDOU, CardName.NANMAN, CardName.WANJIAN,
            CardName.LESI, CardName.BINGLIANG, CardName.HUOGONG].includes(triggerCard.name);
          const shouldWuxie = !hasWuxie ? false
            : difficulty === 'easy' ? Math.random() < 0.5
            : difficulty === 'hard'
              ? (highValue || responder.identity === Identity.ZHUGONG || responder.hp <= 1 || Math.random() < 0.45)
              : true;
          if (hasWuxie && shouldWuxie) {
            const wuxieCard = responder.hand.find(c => c.name === CardName.WUXIE)!;
            playCard(responder.id, wuxieCard);
            addLog(`${responder.hero.name} 使用了【无懈可击】`, 'info');
            return true;
          } else if (hasWuxie) {
            addLog(`${responder.hero.name} 保留了【无懈可击】`, 'info');
            return false;
          } else {
            return false;
          }
        }

        // 简单 AI 有概率反应慢半拍，不出【闪】
        if (neededCard === CardName.SHAN && aiDifficultyRef.current === 'easy'
            && responder.hp > 1 && Math.random() < 0.22) {
          addLog(`${responder.hero.name} 反应慢了半拍，没有打出【闪】`, 'info');
          await delay(300);
          await takeDamage(responderId, sourceId, 1, triggerCard);
          return false;
        }
        
        // 检查赵云的技能
        if (!hasCard && responder.hero.name === '赵云') {
          // 尝试使用技能：如果需要闪，使用杀；如果需要杀，使用闪
          if (neededCard === CardName.SHAN) {
            cardToPlay = responder.hand.find(c => c.name === CardName.SHA);
          } else if (neededCard === CardName.SHA) {
            cardToPlay = responder.hand.find(c => c.name === CardName.SHAN);
          }
          
          if (cardToPlay) {
            hasCard = true;
            isUsingSkill = true;
          }
        }
        
        // 检查关羽的武圣技能：红色牌可以当杀使用
        if (!hasCard && responder.hero.name === '关羽' && neededCard === CardName.SHA) {
          // 尝试使用红色牌（红桃或方块）当杀
          cardToPlay = responder.hand.find(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
          
          if (cardToPlay) {
            hasCard = true;
            isUsingSkill = true;
          }
        }

        // 甄姬「倾国」：黑色手牌可当【闪】
        let isQingguoAI = false;
        if (!hasCard && responder.hero.name === '甄姬' && neededCard === CardName.SHAN) {
          cardToPlay = responder.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
          if (cardToPlay) {
            hasCard = true;
            isUsingSkill = true;
            isQingguoAI = true;
          }
        }
        
        if (hasCard && cardToPlay) {
          playCard(responder.id, cardToPlay);
          
          if (isQingguoAI) {
            addLog(`${responder.hero.name} 使用技能「倾国」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
            showSkillBanner(responder.hero.name, '倾国');
          } else if (isUsingSkill) {
            // 区分赵云的龙胆和关羽的武圣
            if (responder.hero.name === '关羽') {
              addLog(`${responder.hero.name} 使用技能「武圣」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner(responder.hero.name, '武圣');
            } else {
              addLog(`${responder.hero.name} 使用技能「龙胆」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner(responder.hero.name, '龙胆');
            }
          } else {
            addLog(`${responder.hero.name} 打出了【${neededCard}】`, 'info');
          }
          
          
          
          // 吕布无双技能：需要第二张牌
          if (needTwoCards) {
            await delay(500);
            // 检查是否还有第二张牌
            let hasSecondCard = responder.hand.some(c => c.name === neededCard);
            let secondCardToPlay = responder.hand.find(c => c.name === neededCard);
            let isUsingSecondSkill = false;
            
            // 检查赵云的技能
            if (!hasSecondCard && responder.hero.name === '赵云') {
              if (neededCard === CardName.SHAN) {
                secondCardToPlay = responder.hand.find(c => c.name === CardName.SHA);
              } else if (neededCard === CardName.SHA) {
                secondCardToPlay = responder.hand.find(c => c.name === CardName.SHAN);
              }
              if (secondCardToPlay) {
                hasSecondCard = true;
                isUsingSecondSkill = true;
              }
            }
            
            // 检查关羽的武圣技能（第二张牌）
            if (!hasSecondCard && responder.hero.name === '关羽' && neededCard === CardName.SHA) {
              secondCardToPlay = responder.hand.find(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
              if (secondCardToPlay) {
                hasSecondCard = true;
                isUsingSecondSkill = true;
              }
            }
            
            if (hasSecondCard && secondCardToPlay) {
              playCard(responder.id, secondCardToPlay);
              if (isUsingSecondSkill) {
                // 区分赵云的龙胆和关羽的武圣
                if (responder.hero.name === '关羽') {
                  addLog(`${responder.hero.name} 使用技能「武圣」，将【${secondCardToPlay.name}】当【${neededCard}】使用`, 'skill');
                } else {
                  addLog(`${responder.hero.name} 使用技能「龙胆」，将【${secondCardToPlay.name}】当【${neededCard}】使用`, 'skill');
                }
              } else {
                addLog(`${responder.hero.name} 打出了第二张【${neededCard}】`, 'info');
              }
              addLog(`【无双】防御成功！`, 'success');
              // 防御成功，如果是决斗则继续
              if (triggerCard.name === CardName.JUEDOU) {
                await delay(800);
                await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
              }
            } else {
              addLog(`【无双】没有打出第二张【${wushuangCardName}】，防御失败！`, 'danger');
              await takeDamage(responderId, sourceId, 1, triggerCard);
              // 防御失败，决斗结束，不再继续
            }
            return false;
          }

          if (triggerCard.name === CardName.JUEDOU) {
            await delay(800);
            await triggerReaction(sourceId, responderId, CardName.SHA, triggerCard);
          }
          return false;
        } else {
          // AI 没有所需的牌：直接承受伤害（无懈可击不能代替闪/杀）
          await takeDamage(responderId, sourceId, 1, triggerCard);
          return false;
        }
      }
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  const askForPeaches = async (victimId: number): Promise<boolean> => {
    const victim = getPlayer(victimId)!;
    const savedAt = recentlySavedRef.current[victimId];
    if (victim.hp > 0 || (savedAt && Date.now() - savedAt < 3000)) {
      setDyingState(null);
      return true;
    }

    setIsProcessing(p => p + 1);

    addLog(`☠️ ${victim.hero.name} 进入濒死状态，开始求桃！`, 'danger');

    try {
      // 原版三国杀规则：按顺序从濒死者开始询问是否出桃
      // 顺序：濒死者 -> 下家 -> 下下家... -> 上家
      const allPlayers = playersRef.current.filter(p => !p.isDead);
      const playerCount = playersRef.current.length;
      // 只记 id：每轮都用 getPlayer 取最新手牌，避免用快照里的旧桃反复“救援”
      const order = allPlayers
        .sort((a, b) => ((a.id - victimId + playerCount) % playerCount) - ((b.id - victimId + playerCount) % playerCount))
        .map(p => p.id);

      // 循环询问，直到有人出桃或者所有人都放弃（最多 12 轮兜底，防止状态异常时死循环）
      let rounds = 0;
      while (getPlayer(victimId)?.hp <= 0) {
        if (++rounds > 12) {
          addLog(`求桃轮次异常（${rounds}），按无人救援处理`, 'warning');
          return false;
        }
        let someoneSaved = false;

        for (const pid of order) {
          const player = getPlayer(pid);
          if (!player || player.isDead) continue;
          const currentVictim = getPlayer(victimId)!;
          if (currentVictim.hp > 0) {
            setDyingState(null);
            return true;
          }

          const hasTao = player.hand.some(c => c.name === CardName.TAO);
          const hasJiu = player.hand.some(c => c.name === CardName.JIU);
          // 华佗「急救」：回合外可将红色牌当【桃】
          const hasRed = player.hero.name === '华佗' && player.id !== turnIndex
            && player.hand.some(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
          const hasJijiu = hasRed && !hasTao && !hasJiu;
          const canSave = hasTao || hasJiu || hasRed;

          // 所有有桃或酒的角色（包括濒死角色自己）都可以选择是否使用
          if (canSave) {
            const saveCardName = hasTao ? '桃' : hasJiu ? '酒' : '红色牌（急救）';
            addLog(`👉 询问 ${player.hero.name} 是否使用【${saveCardName}】救援 ${victim.hero.name}`, 'info');

            // 如果是人类玩家，显示弹窗询问
            if (player.isHuman && !isAiTakeover) {
              // 等待玩家决策
              const result = await new Promise<boolean>((resolve) => {
                dyingResolver.current = resolve;

                // 设置弹窗状态，传入真正的resolve函数
                setDyingState({
                  victimId,
                  isActive: true,
                  rescuerId: player.id,
                  hasTao,
                  hasJiu,
                  hasJijiu,
                  resolve: (result: boolean) => {
                    resolve(result);
                  }
                });

                // 与出牌阶段一致的 20 秒读秒
                setDyingLeft(DECISION_SECONDS);
                const tickId = window.setInterval(() => {
                  setDyingLeft(v => (v === null ? null : Math.max(0, v - 1)));
                }, 1000);
                dyingTickRef.current = tickId;

                const timeoutId = setTimeout(() => {
                  if (dyingResolver.current) {
                    addLog(`${player.hero.name} 超时未响应，放弃救援`, 'warning');
                    dyingResolver.current(false);
                  }
                }, DECISION_SECONDS * 1000);

                dyingTimeoutRef.current = timeoutId;
              });

              // 清理
              clearTimeout(dyingTimeoutRef.current);
              dyingTimeoutRef.current = null;
              if (dyingTickRef.current) {
                window.clearInterval(dyingTickRef.current);
                dyingTickRef.current = null;
              }
              setDyingLeft(null);
              dyingResolver.current = null;
              setDyingState(null);

              if (result) {
                // 玩家选择救援，优先使用桃，其次酒，华佗可用红色牌急救
                const saveCard = player.hand.find(c => c.name === CardName.TAO)
                  || player.hand.find(c => c.name === CardName.JIU)
                  || player.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
                if (saveCard) {
                  const actualCard: Card = saveCard.name === CardName.TAO || saveCard.name === CardName.JIU
                    ? saveCard
                    : { ...saveCard, name: CardName.TAO, type: CardType.BASIC, description: '急救：红色牌当【桃】使用。' };
                  await resolveCardEffect(player, [currentVictim], actualCard);
                  someoneSaved = true;

                  const updatedVictim = getPlayer(victimId)!;
                  if (updatedVictim.hp > 0) {
                    recentlySavedRef.current[victimId] = Date.now();
                    addLog(`✅ ${updatedVictim.hero.name} 被救活，脱离了濒死状态！`, 'success');
                    return true;
                  }
                  // 还需要更多桃/酒，继续询问
                  break;
                }
              } else {
                // 玩家选择不救援
                addLog(`${player.hero.name} 选择不使用【桃】或【酒】救援`, 'info');
              }
            } else {
              // AI玩家：显示弹窗让AI"思考"，给玩家看到AI在决策
              // 先显示弹窗
              setDyingState({
                victimId,
                isActive: true,
                rescuerId: player.id,
                hasTao,
                hasJiu,
                hasJijiu,
                resolve: () => {} // AI不需要点击，所以用空函数
              });

              // AI决策
              const shouldSave = shouldAiSavePlayer(player, victim);

              if (shouldSave) {
                await delay(1500); // 给玩家看到AI在思考
                setDyingState(null);
                // AI优先使用桃，其次酒，华佗可用红色牌急救
                const saveCard = player.hand.find(c => c.name === CardName.TAO)
                  || player.hand.find(c => c.name === CardName.JIU)
                  || player.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
                if (!saveCard) {
                  addLog(`⚠️ ${player.hero.name} 想救援但没有【桃】或【酒】了`, 'warning');
                  continue; // 继续询问下一个玩家
                }
                const actualCard: Card = saveCard.name === CardName.TAO || saveCard.name === CardName.JIU
                  ? saveCard
                  : { ...saveCard, name: CardName.TAO, type: CardType.BASIC, description: '急救：红色牌当【桃】使用。' };
                addLog(`🍑 ${player.hero.name} 决定使用【${actualCard.name}】救援 ${victim.hero.name}`, 'success');
                await resolveCardEffect(player, [currentVictim], actualCard);
                someoneSaved = true;

                const updatedVictim = getPlayer(victimId)!;
                if (updatedVictim.hp > 0) {
                  recentlySavedRef.current[victimId] = Date.now();
                  addLog(`✅ ${updatedVictim.hero.name} 被救活，脱离了濒死状态！`, 'success');
                  return true;
                }
                // 还需要更多桃/酒，继续询问
                break;
              } else {
                await delay(1000);
                setDyingState(null);
                addLog(`${player.hero.name} 选择不出【桃】或【酒】`, 'info');
              }
            }
          } else {
            addLog(`${player.hero.name} 没有【桃】或【酒】，无法救援`, 'info');
          }
        }

        // 如果一轮询问下来没人出桃，则死亡
        if (!someoneSaved) {
          addLog(`❌ ${victim.hero.name} 无人救援，死亡！`, 'danger');
          setDyingState(null);
          return false;
        }
        // 有人出桃但体力仍未回正：让出一次宏任务，等体力更新提交后再继续询问
        await delay(150);
      }

      setDyingState(null);
      return false;
    } finally {
      setDyingState(null);
      setDyingLeft(null);
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  // AI是否救援的决策函数
  const shouldAiSavePlayer = (rescuer: Player, victim: Player): boolean => {
    const ri = rescuer.identity;
    const vi = victim.identity;
    const difficulty = aiDifficultyRef.current;

    if (difficulty === 'easy') {
      if (rescuer.id === victim.id) return Math.random() < 0.7;
      if (vi === Identity.ZHUGONG) return Math.random() < 0.5;
      return Math.random() < 0.35;
    }

    if (difficulty === 'hard') {
      if (rescuer.id === victim.id) return true;
      if (ri === Identity.ZHONGCHEN) return vi === Identity.ZHUGONG || vi === Identity.ZHONGCHEN;
      if (ri === Identity.ZHUGONG) return vi === Identity.ZHONGCHEN;
      if (ri === Identity.FANZEI) return vi === Identity.FANZEI;
      if (ri === Identity.NEIJIAN) {
        // 内奸：反贼未清时保主公，残局保自己
        const rebelsAlive = playersRef.current.some(p => !p.isDead && p.identity === Identity.FANZEI);
        return (vi === Identity.ZHUGONG && rebelsAlive) || vi === Identity.NEIJIAN;
      }
      return false;
    }

    if (ri === Identity.FANZEI) {
      // 反贼：救反贼，不救主公，其他看情况
      if (vi === Identity.ZHUGONG) return false;
      if (vi === Identity.FANZEI) return true;
      return Math.random() < 0.3;
    } else if (ri === Identity.ZHONGCHEN) {
      // 忠臣：救主公，其他看情况
      if (vi === Identity.ZHUGONG) return true;
      return Math.random() < 0.4;
    } else if (ri === Identity.ZHUGONG) {
      // 主公：救忠臣，其他看情况
      if (vi === Identity.ZHONGCHEN) return Math.random() < 0.8;
      return Math.random() < 0.3;
    } else if (ri === Identity.NEIJIAN) {
      // 内奸：看情况
      return Math.random() < 0.5;
    }
    return Math.random() < 0.3;
  };

  // 黄盖「苦肉」：失去1点体力，摸两张牌
  const resolveKurou = async (playerId: number) => {
    const p = getPlayer(playerId);
    if (!p || p.isDead || p.hero.name !== '黄盖' || p.hp <= 1) return;
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
        const saved = await askForPeaches(playerId);
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
      updatePlayer(victim.id, { hp: Math.min(victim.maxHp, victim.hp + 1) });
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

  // 王异「贞烈」：成为【杀】或非延时锦囊目标时，失去1点体力弃其一张手牌，令此牌无效
  const tryZhenlie = async (target: Player, source: Player, card: Card): Promise<boolean> => {
    if (target.hero.name !== '王异' || target.id === source.id || target.isDead || target.hp <= 1) return false;
    const harmful = card.name === CardName.SHA
      || [CardName.JUEDOU, CardName.NANMAN, CardName.WANJIAN, CardName.SHUNSHOU,
          CardName.GUOHE, CardName.HUOGONG, CardName.JIEDAO].includes(card.name);
    if (!harmful) return false;
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

  const takeDamage = async (
    victimId: number,
    sourceId: number,
    amount: number,
    damageCard?: Card,
    nature?: 'fire' | 'thunder',
  ) => {
    setIsProcessing(p => p + 1);
    // 铁索连环传导波次：同一波内每名角色只吃一次传导伤害。
    // 不能只靠 updatePlayer 重置 isChained —— React 尚未提交时 getPlayer 仍会读到旧值，
    // 递归传导会出现 A→B→A 的无限循环（3 倍速下曾导致页面卡死、内存暴涨）。
    let ownsChainWave = false;
    try {
      // 伤害属性：显式传入优先，其次看伤害牌（火杀 / 雷杀）
      const dmgNature: 'normal' | 'fire' | 'thunder' = nature ?? damageCard?.attribute ?? 'normal';
      const natureLabel = dmgNature === 'fire' ? '火焰' : dmgNature === 'thunder' ? '雷电' : '';
      const source = getPlayer(sourceId);
      // 青釭剑：使用【杀】时无视目标防具
      const ignoreArmor = damageCard?.name === CardName.SHA
        && source?.equipment?.weapon?.name === CardName.QINGGANG;

      // 检查是否有"酒"的伤害加成（仅对杀有效）
      let finalAmount = amount;
      if (damageCard?.name === CardName.SHA && window.jiuBoost?.[sourceId]) {
        finalAmount = amount + 1;
        addLog(`【酒】效果触发！伤害+1`, 'danger');
        // 清除酒的效果
        window.jiuBoost[sourceId] = false;
      }

      // 许褚「裸衣」：本回合【杀】/【决斗】伤害+1
      if (luoyiPlayerRef.current === sourceId && damageCard
          && (damageCard.name === CardName.SHA || damageCard.name === CardName.JUEDOU)) {
        finalAmount += 1;
        addLog(`【裸衣】触发，${source?.hero.name ?? ''} 的伤害+1`, 'danger');
      }

      // 张春华「绝情」：造成的伤害改为失去体力（不触发防具/伤害后技能）
      if (source?.hero.name === '张春华' && sourceId !== victimId && finalAmount > 0) {
        const target = getPlayer(victimId)!;
        const lostHp = Math.max(0, target.hp - finalAmount);
        setDamageAnimTarget(victimId);
        setTimeout(() => setDamageAnimTarget(null), 500);
        updatePlayer(victimId, { hp: lostHp });
        addLog(`${target.hero.name} 因「绝情」失去 ${finalAmount} 点体力！当前体力: ${lostHp}/${target.maxHp}`, 'danger');
        showSkillBanner(source.hero.name, '绝情');
        await delay(500);
        if (lostHp <= 0) {
          const saved = await askForPeaches(victimId);
          if (!saved) await handleDeath(victimId, sourceId);
        }
        return;
      }

      // 防具：藤甲受火焰伤害+1；白银狮子把大于1的伤害压到1
      let victim = getPlayer(victimId)!;
      const armor = victim.equipment?.armor?.name;
      if (!ignoreArmor && armor === CardName.TENGJIA && dmgNature === 'fire') {
        finalAmount += 1;
        addLog(`${victim.hero.name} 的【藤甲】遇火，火焰伤害+1`, 'danger');
      }
      if (!ignoreArmor && armor === CardName.BAIYIN && finalAmount > 1) {
        finalAmount = 1;
        addLog(`${victim.hero.name} 的【白银狮子】将伤害减为 1 点`, 'skill');
      }

      // 寒冰剑：造成伤害时，可防止伤害并改为弃置目标两张牌
      if (damageCard?.name === CardName.SHA && source?.equipment?.weapon?.name === CardName.HANBING) {
        const v = getPlayer(victimId);
        // 仅在目标手牌不少于两张、且此伤害不致命时改为弃牌，避免误放过斩杀
        if (v && v.hand.length >= 2 && v.hp > finalAmount) {
          const cost = v.hand.slice(0, 2);
          discardCards(v.id, cost);
          addLog(`【寒冰剑】发动：防止伤害，改为弃置 ${v.hero.name} 的 ${cost.length} 张牌`, 'skill');
          await delay(300);
          return;
        }
      }

      // 小乔「天香」：弃一张红桃手牌，将伤害转移给伤害来源
      if (victim.hero.name === '小乔' && sourceId !== victimId) {
        const heartCard = victim.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
        if (heartCard) {
          discardCards(victimId, [heartCard]);
          addLog(`${victim.hero.name} 发动「天香」，弃置【${heartCard.name}】将伤害转移`, 'skill');
          showSkillBanner(victim.hero.name, '天香');
          await delay(400);
          const receiver = getPlayer(sourceId);
          if (receiver && !receiver.isDead) {
            await takeDamage(sourceId, sourceId, finalAmount, damageCard, dmgNature === 'normal' ? undefined : dmgNature);
            const after = getPlayer(sourceId);
            if (after && !after.isDead) {
              const lost = Math.min(5, after.maxHp - after.hp);
              if (lost > 0) {
                drawCards(after.id, lost);
                addLog(`${after.hero.name} 因「天香」摸 ${lost} 张牌`, 'info');
              }
            }
          }
          return;
        }
      }

      // 铁索连环：属性伤害传导（同一波次内每个角色只传导一次，避免状态未提交时递归打回自己）
      let chainOthers: Player[] = [];
      if (dmgNature !== 'normal' && victim.isChained) {
        const wave = chainWaveRef.current ?? new Set<number>();
        if (!chainWaveRef.current) {
          chainWaveRef.current = wave;
          ownsChainWave = true;
        }
        wave.add(victimId);
        const chained = playersRef.current.filter(p => p.isChained && !p.isDead && !wave.has(p.id));
        if (chained.length > 0) {
          addLog(`🔗【铁索连环】传导！${natureLabel}伤害波及 ${chained.map(p => p.hero.name).join('、')}`, 'danger');
          chained.forEach(cp => {
            wave.add(cp.id);
            updatePlayer(cp.id, { isChained: false });
          });
          chainOthers = chained;
        }
      }

      setDamageAnimTarget(victimId);
      playSound('damage');
      setTimeout(() => setDamageAnimTarget(null), 500);

      victim = getPlayer(victimId)!;
      const newHp = victim.hp - finalAmount;

      // 立即更新玩家体力
      updatePlayer(victimId, { hp: newHp });
      addLog(`${victim.hero.name} 受到 ${finalAmount} 点${natureLabel}伤害！当前体力: ${newHp}/${victim.maxHp}`, 'danger');

      // 关银屏「虎啸」：锁定技，造成伤害后摸一张牌（原版无次数限制）
      if (sourceId >= 0 && sourceId !== victimId && source?.hero.name === '关银屏') {
        addLog(`${source.hero.name} 发动「虎啸」，摸一张牌`, 'skill');
        showSkillBanner(source.hero.name, '虎啸');
        drawCards(sourceId, 1);
      }

      // 郭嘉「遗计」：受到伤害后摸两张牌
      if (victim.hero.name === '郭嘉') {
        drawCards(victimId, 2);
        addLog(`${victim.hero.name} 发动「遗计」，摸两张牌`, 'skill');
        showSkillBanner(victim.hero.name, '遗计');
      }
      // 司马懿「反馈」：受到伤害后获得伤害来源一张手牌
      if (victim.hero.name === '司马懿' && sourceId !== victimId) {
        const attacker = getPlayer(sourceId);
        if (attacker && attacker.hand.length > 0) {
          const gained = attacker.hand[Math.floor(Math.random() * attacker.hand.length)];
          mutateHand(sourceId, hand => hand.filter(c => c.id !== gained.id));
          mutateHand(victimId, hand => [...hand, gained]);
          addLog(`${victim.hero.name} 发动「反馈」，获得 ${attacker.hero.name} 的【${gained.name}】`, 'skill');
          showSkillBanner(victim.hero.name, '反馈');
        }
      }

      // 蔡文姬「悲歌」/ 祝融「烈刃」：伤害后触发
      await triggerBeige(victimId, sourceId, damageCard);
      if (getPlayer(victimId)?.hp > 0) {
        await triggerLieren(victimId, sourceId, damageCard);
      }

      // 麒麟弓：造成伤害后，可弃置目标一匹坐骑
      if (damageCard?.name === CardName.SHA && source?.equipment?.weapon?.name === CardName.QILIN) {
        const v = getPlayer(victimId);
        const slot = v?.equipment?.horsePlus ? 'horsePlus' as const : v?.equipment?.horseMinus ? 'horseMinus' as const : null;
        if (v && slot) {
          const horse = v.equipment![slot]!;
          const nextEquip = { ...(v.equipment ?? {}) };
          delete nextEquip[slot];
          updatePlayer(victimId, { equipment: nextEquip });
          setDiscardPile(prev => {
            const next = [...prev, horse];
            discardPileRef.current = next;
            return next;
          });
          triggerXiaoji(victimId);
          addLog(`${source.hero.name} 的【麒麟弓】射落了 ${v.hero.name} 的【${horse.name}】`, 'skill');
        }
      }

      // 身份推理：攻击主公者视为反贼；击杀已亮明反贼者视为忠臣
      if (sourceId !== victimId) {
        if (victim.identity === Identity.ZHUGONG) {
          identityGuessRef.current[sourceId] = Identity.FANZEI;
        } else if (victim.isRevealed && victim.identity === Identity.FANZEI) {
          const srcRole = getPlayer(sourceId)?.identity;
          if (srcRole !== Identity.FANZEI) identityGuessRef.current[sourceId] = Identity.ZHONGCHEN;
        }
      }

      // 曹操的「奸雄」技能：受到伤害后，你可以获得造成伤害的牌
      if (victim.hero.name === '曹操' && damageCard) {
        const me = getPlayer(victimId);
        const alreadyHas = !!me?.hand.some(c => c.id === damageCard.id);
        // 同一张牌不能在「手牌 + 弃牌堆」同时存在，否则洗回牌堆后会出现重复卡（React 也会报重复 key）
        setDiscardPile(prev => {
          const next = prev.filter(c => c.id !== damageCard.id);
          discardPileRef.current = next;
          return next;
        });
        if (me && !alreadyHas) {
          mutateHand(victimId, hand => [...hand, damageCard]);
          addLog(`${victim.hero.name} 使用技能「奸雄」，获得了【${damageCard.name}】！`, 'skill');
          showSkillBanner(victim.hero.name, '奸雄');
        } else {
          addLog(`${victim.hero.name} 的「奸雄」发动，但【${damageCard.name}】已在其手牌中`, 'info');
        }
      }

      // 当体力值小于等于0时，进入濒死状态
      if (newHp <= 0) {
        addLog(`${victim.hero.name} 进入濒死状态，需要求桃！`, 'danger');
        // 进入濒死状态，开始求桃
        const isSaved = await askForPeaches(victimId);
        if (!isSaved) {
          addLog(`${victim.hero.name} 未能得到救援，死亡！`, 'danger');
          await handleDeath(victimId, sourceId);
        }
      }

      // 夏侯惇「刚烈」：受到伤害后判定，非红桃则伤害来源失去 1 点体力
      const survivor = getPlayer(victimId);
      if (victim.hero.name === '夏侯惇' && sourceId !== victimId && survivor && !survivor.isDead) {
        const jc = await performJudgment(victimId, '刚烈');
        if (jc && jc.suit !== Suit.HEART) {
          const attacker = getPlayer(sourceId);
          if (attacker && !attacker.isDead) {
            const attackerHp = attacker.hp - 1;
            updatePlayer(sourceId, { hp: attackerHp });
            addLog(`${victim.hero.name} 发动「刚烈」，${attacker.hero.name} 失去 1 点体力（${attackerHp}/${attacker.maxHp}）`, 'skill');
            showSkillBanner(victim.hero.name, '刚烈');
            if (attackerHp <= 0) {
              const saved = await askForPeaches(sourceId);
              if (!saved) await handleDeath(sourceId, victimId);
            }
          }
        } else {
          addLog(`「刚烈」判定为红桃，未能反伤`, 'info');
        }
      }

      // 铁索连环传导：结算完当前目标后，依次传导给其他横置角色
      for (const cp of chainOthers) {
        if (getPlayer(cp.id)?.isDead) continue;
        // 每次传导让出一次宏任务，确保此前的 hp / isChained 更新已提交
        await delay(250);
        await takeDamage(cp.id, sourceId, amount, damageCard, dmgNature === 'normal' ? undefined : dmgNature);
      }
    } finally {
      if (ownsChainWave) chainWaveRef.current = null;
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  // --- AI Logic ---
  
  const cpuAI = async (aiPlayer: Player) => {
    aiTurnActiveRef.current = true;
    // 出牌前先「思考」：头像暖光 + 随机 300~800ms，AI 不再瞬发
    await aiThink(aiPlayer.id);

    const alivePlayers = players.filter(p => !p.isDead && p.id !== aiPlayer.id);
    let targetId = -1;

    // 0. 黄盖「苦肉」：手牌少且体力充足时卖血摸牌
    if (aiPlayer.hero.name === '黄盖' && aiPlayer.hp > 2 && aiPlayer.hand.length <= 3) {
      await resolveKurou(aiPlayer.id);
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
    if (aiPlayer.hero.name === '孙权') {
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
    if (aiPlayer.hero.name === '孙尚香' && aiPlayer.hand.length >= 2 && aiPlayer.hp < aiPlayer.maxHp) {
      const male = players.find(p => !p.isDead && p.id !== aiPlayer.id && p.hero.gender === 'male' && p.hp < p.maxHp);
      if (male) {
        const cost = aiPlayer.hand.slice(0, 2);
        discardCards(aiPlayer.id, cost);
        updatePlayer(aiPlayer.id, { hp: aiPlayer.hp + 1 });
        updatePlayer(male.id, { hp: Math.min(male.maxHp, male.hp + 1) });
        addLog(`${aiPlayer.hero.name} 发动「结姻」，弃置两张牌，与 ${male.hero.name} 各回复 1 点体力`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '结姻');
        await delay(1200);
      }
    }

    // 华佗「青囊」：弃一张非关键手牌，为受伤的己方回复1点体力
    if (aiPlayer.hero.name === '华佗' && !hasUsedQingnang && aiPlayer.hand.length >= 2) {
      const wounded = playersRef.current
        .filter(p => !p.isDead && p.hp < p.maxHp && (p.id === aiPlayer.id || isAlly(aiPlayer, p)))
        .sort((a, b) => (a.maxHp - a.hp) - (b.maxHp - b.hp))[0];
      const cost = aiPlayer.hand.find(c => c.name !== CardName.TAO && c.name !== CardName.SHAN);
      if (wounded && cost) {
        discardCards(aiPlayer.id, [cost]);
        updatePlayer(wounded.id, { hp: Math.min(wounded.maxHp, wounded.hp + 1) });
        setHasUsedQingnang(true);
        addLog(`${aiPlayer.hero.name} 发动「青囊」，弃置【${cost.name}】，令 ${wounded.hero.name} 回复1点体力`, 'skill');
        showSkillBanner(aiPlayer.hero.name, '青囊');
        await delay(900);
        const refreshed = getPlayer(aiPlayer.id);
        if (refreshed) aiPlayer = refreshed;
      }
    }

    // 周瑜「反间」：对敌方使用一次
    if (aiPlayer.hero.name === '周瑜' && !hasUsedFanjian && aiPlayer.hand.length >= 1) {
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
          await takeDamage(target.id, aiPlayer.id, 1);
        }
        await delay(800);
        const refreshed = getPlayer(aiPlayer.id);
        if (refreshed) aiPlayer = refreshed;
      }
    }

    // 大乔「国色」：方块牌当【乐不思蜀】压制敌人
    if (aiPlayer.hero.name === '大乔') {
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
    if (aiPlayer.hero.name === '步练师' && !hasUsedAnxu) {
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
    if (aiPlayer.hp < aiPlayer.maxHp && taoThreshold) {
      const peach = aiPlayer.hand.find(c => c.name === CardName.TAO);
      if (peach) {
        await resolveCardEffect(aiPlayer, [aiPlayer], peach);
        await delay(1500);
      }
    }

    // 3. Play Wuzhong
    const wuzhong = aiPlayer.hand.find(c => c.name === CardName.WUZHONG);
    if (wuzhong) {
      await resolveCardEffect(aiPlayer, [aiPlayer], wuzhong);
      await delay(1500);
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

    // 6.5 甘宁「奇袭」：黑色牌当【过河拆桥】
    if (aiPlayer.hero.name === '甘宁' && targetId !== -1) {
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
    if (jiu && targetId !== -1) {
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
        .filter(p => !p.isDead && p.id !== aiNow.id && isEnemy(aiNow, p) && (canReach(aiNow, p) || qiangwuLongShot))
        .sort((a, b) => a.hp - b.hp)[0];
      if (!slash || !target || !canPlaySlash(aiNow, slash)) break;
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
    setPhase(GamePhase.DISCARD);
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
      setPhase(GamePhase.DISCARD);
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
    const excess = self.hand.length - self.hp;
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
      <div
        data-density={layoutDensity}
        data-size-tier={sizeTier}
        data-motion={motionOn ? 'on' : 'off'}
        className={`h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden ${theme === 'light' ? 'parchment-bg' : ''}`}
        style={scaleStyle}
      >
        {/* 背景轮播 */}
        <BackgroundCarousel 
          images={BACKGROUND_IMAGES}
          interval={CAROUSEL_CONFIG.interval}
        />
        
        {/* 多层背景效果 - 根据主题切换（在没有背景图或背景图加载失败时显示） */}
        {theme === 'dark' ? (
          <>
            {/* 静态暖光 + 极淡祥云暗纹：去掉 blur + animate 光斑，首页不再持续合成 */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse 58% 44% at 50% 34%, rgba(200,164,92,0.13) 0%, rgba(0,0,0,0) 70%)'
            }}></div>
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}></div>
            {/* 装饰性边框 */}
            <div className="absolute inset-8 border border-amber-800/20 rounded-lg pointer-events-none"></div>
            <div className="absolute inset-10 border border-amber-700/10 rounded-lg pointer-events-none"></div>
            {/* 四角装饰 */}
            <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-amber-700/40 rounded-tl-lg"></div>
            <div className="absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-amber-700/40 rounded-tr-lg"></div>
            <div className="absolute bottom-6 left-6 w-16 h-16 border-b-2 border-l-2 border-amber-700/40 rounded-bl-lg"></div>
            <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-amber-700/40 rounded-br-lg"></div>
          </>
        ) : (
          <>
            {/* 白天模式装饰边框 - 简约风格 */}
            <div className="absolute inset-8 border border-[#e5e0db]/50 rounded-lg pointer-events-none"></div>
            <div className="absolute inset-10 border border-[#d4cfc9]/30 rounded-lg pointer-events-none"></div>
            {/* 四角装饰 - 柔和色调 */}
            <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-[#c4a77d]/40 rounded-tl-lg"></div>
            <div className="absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-[#c4a77d]/40 rounded-tr-lg"></div>
            <div className="absolute bottom-6 left-6 w-16 h-16 border-b-2 border-l-2 border-[#c4a77d]/40 rounded-bl-lg"></div>
            <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-[#c4a77d]/40 rounded-br-lg"></div>
          </>
        )}

        {/* 顶部控制：静音 / 主题 */}
        <div className="absolute top-5 right-5 z-50 flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="ui-icon-btn"
            title={isMuted ? '开启音乐' : '静音'}
            aria-label={isMuted ? '开启音乐' : '静音'}
          >
            <IconSpeaker muted={isMuted} />
          </button>
          <button
            onClick={toggleMotion}
            className="ui-icon-btn"
            title={motionOn ? '关闭动效' : '开启动效'}
            aria-label={motionOn ? '关闭动效' : '开启动效'}
          >
            <IconMotion off={!motionOn} />
          </button>
          <button
            onClick={toggleTheme}
            className="ui-icon-btn"
            title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
            aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>

        {/* 主内容：标题 + 出征面板 + 战绩，全部在一屏内 */}
        <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-center px-5 py-16">
          <div className="relative text-center">
            {/* 朱印 */}
            <div className={`absolute -top-5 right-1 md:-right-12 rotate-6 w-11 h-11 md:w-14 md:h-14 rounded-[5px] flex items-center justify-center border shadow-[0_6px_20px_rgba(0,0,0,0.5)] ${
              theme === 'dark'
                ? 'bg-gradient-to-br from-[#9e2b25] to-[#701c17] border-[#d4af37]/55'
                : 'bg-gradient-to-br from-[#a8342c] to-[#7d211c] border-[#8a6914]/55'
            }`}>
              <span className="font-ancient text-3xl md:text-4xl text-[#f3d9a4] leading-none select-none">殺</span>
            </div>

            <h1 className={`font-ancient text-7xl md:text-8xl lg:text-[104px] leading-[1.15] tracking-[0.12em] relative ${
              theme === 'dark'
                ? 'text-transparent bg-clip-text bg-gradient-to-b from-[#f6e3ae] via-[#d4af37] to-[#8d6a18]'
                : 'text-[#2a1d0e]'
            }`}>
              三国杀
            </h1>

            <div className="mt-3 flex items-center justify-center gap-2 md:gap-4">
              <span className={`h-px w-6 sm:w-14 md:w-20 ${theme === 'dark' ? 'bg-gradient-to-r from-transparent to-[#c8a45c]/60' : 'bg-gradient-to-r from-transparent to-[#8b6914]/45'}`} />
              <span className={`text-[13px] md:text-sm tracking-[0.24em] md:tracking-[0.42em] pl-[0.24em] md:pl-[0.42em] font-ancient whitespace-nowrap ${theme === 'dark' ? 'text-[#d9c49a]' : 'text-[#6b4a1a]'}`}>
                群雄逐鹿 · {playerCount}人军争
              </span>
              <span className={`h-px w-6 sm:w-14 md:w-20 ${theme === 'dark' ? 'bg-gradient-to-l from-transparent to-[#c8a45c]/60' : 'bg-gradient-to-l from-transparent to-[#8b6914]/45'}`} />
            </div>
            <div className={`mt-2 text-[10px] tracking-[0.52em] pl-[0.52em] ${theme === 'dark' ? 'text-[#8f7c5e]' : 'text-[#9b8a6c]'}`}>
              SANGUOSHA · IDENTITY
            </div>
          </div>

          <div className="ui-panel mt-9 w-full max-w-[600px] px-6 py-6 md:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-[76px_1fr] items-center gap-y-3 sm:gap-y-5 gap-x-4">
              <span className="section-caption">对局人数</span>
              <div className="flex gap-2" role="group" aria-label="对局人数">
                <button className="ui-tile" aria-pressed={playerCount === 5} onClick={() => setPlayerCount(5)}>五人局</button>
                <button className="ui-tile" aria-pressed={playerCount === 7} onClick={() => setPlayerCount(7)}>七人局</button>
              </div>

              <span className="section-caption">AI 难度</span>
              <div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="AI 难度">
                  {([
                    { key: 'easy', label: '简单', hint: 'AI 会偶尔失误，可能乱弃关键牌' },
                    { key: 'normal', label: '普通', hint: '按身份与血量进行常规决策' },
                    { key: 'hard', label: '困难', hint: '威胁评估、保留无懈/桃、协同保主公' },
                  ] as const).map(item => (
                    <button
                      key={item.key}
                      className="ui-tile !text-base !px-2.5 sm:!px-4 !py-1.5"
                      aria-pressed={aiDifficulty === item.key}
                      onClick={() => setAiDifficulty(item.key)}
                      title={item.hint}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className={`mt-2 text-[11px] leading-relaxed ${theme === 'dark' ? 'text-[#8f806a]' : 'text-[#8a7a60]'}`}>
                  {aiDifficulty === 'easy' ? 'AI 会偶尔失误，适合熟悉规则' : aiDifficulty === 'hard' ? 'AI 会评估威胁、保留关键牌并协同队友' : '标准 AI 强度'}
                </p>
              </div>
            </div>

            <div className={`mt-5 h-px ${theme === 'dark' ? 'bg-gradient-to-r from-transparent via-[#c8a45c]/25 to-transparent' : 'bg-gradient-to-r from-transparent via-[#8b6914]/20 to-transparent'}`} />

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => { initAudio(); setScreen('select'); }}
                className="ui-cta"
              >
                点兵出征
              </button>

              {/* 继续上一局：读取本地存档，从该回合开头重放 */}
              {savedGame && (() => {
                const myHeroName = savedGame.players.find(p => p.isHuman)?.hero.name ?? '';
                const d = new Date(savedGame.ts);
                const pad = (n: number) => String(n).padStart(2, '0');
                const savedAt = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                return (
                  <button
                    onClick={resumeGame}
                    className="group flex items-center gap-3 px-6 py-2 rounded-lg border border-[#c8a45c]/40 bg-[#1b1510]/80 transition-colors hover:border-[#e8cf94] hover:bg-[#241c14]/90"
                  >
                    <span className="font-ancient text-lg tracking-[0.18em] text-[#e8cf94]">继续上一局</span>
                    <span className="text-[11px] tracking-wide text-[#9a8b74]">
                      {myHeroName} · {savedGame.playerCount}人局 · 存于 {savedAt}
                    </span>
                  </button>
                );
              })()}

              <div className="flex w-full max-w-[430px] flex-col sm:flex-row items-stretch justify-center gap-2.5">
                <button
                  onClick={startTutorial}
                  aria-label="新手教学：9 步分步引导，可跳过，随时可重看"
                  className={`group flex flex-1 items-center justify-center gap-3 min-h-[52px] px-4 rounded-lg border transition-colors ${theme === 'dark'
                    ? 'border-[#c8a45c]/50 bg-[#1b1510]/85 hover:border-[#e8cf94] hover:bg-[#241c14]/95'
                    : 'border-[#8b6914]/45 bg-[#fbf6ea]/90 hover:border-[#8b6914] hover:bg-[#fff9ec]'
                    }`}
                >
                  <IconDice />
                  <span className="flex flex-col items-start leading-tight text-left">
                    <span className={`font-ancient text-base tracking-[0.18em] ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]'}`}>新手教学</span>
                    <span className={`text-[10px] tracking-wide ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>9 步 · 可跳过 · 随时重看</span>
                  </span>
                </button>

                <button
                  onClick={() => setShowRules(true)}
                  aria-label="玩法说明"
                  className={`flex items-center justify-center gap-2 min-h-[52px] px-4 rounded-lg border transition-colors ${theme === 'dark'
                    ? 'border-[#c8a45c]/30 hover:border-[#e8cf94]/70'
                    : 'border-[#8b6914]/30 hover:border-[#8b6914]/70'
                    }`}
                >
                  <IconBook />
                  <span className={`font-ancient text-base tracking-[0.18em] ${theme === 'dark' ? 'text-[#d9c49a]' : 'text-[#6b4a1a]'}`}>玩法说明</span>
                </button>
              </div>

              {homeNotice && (
                <div role="status" className="mt-1 px-4 py-2 rounded-lg border border-[#c8a45c]/45 bg-[#1b1510]/90 text-[12px] text-[#e8cf94]">
                  {homeNotice}
                </div>
              )}
            </div>
          </div>

          <div className="footer-line mt-6">
            <span>对局 <b>{stats.games}</b></span>
            <span className="sep">·</span>
            <span>胜 <b className={stats.wins > 0 ? '!text-[#9fcfae]' : ''}>{stats.wins}</b></span>
            <span className="sep">·</span>
            <span>负 <b className={stats.losses > 0 ? '!text-[#e0a49c]' : ''}>{stats.losses}</b></span>
            {stats.games > 0 && (
              <>
                <span className="sep">·</span>
                <span>胜率 <b>{Math.round((stats.wins / stats.games) * 100)}%</b></span>
              </>
            )}
          </div>
        </div>

        {/* 页脚版本信息：与战绩分离，避免相互叠压 */}
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 footer-line">
          <span>三国杀 · {playerCount}人军争篇</span>
          <span className="sep">◆</span>
          <span>{APP_VERSION}</span>
        </div>
        
        {showRules && <RulesDialog onClose={() => setShowRules(false)} onStartTutorial={startTutorial} />}
      </div>
    );
  }

  if (screen === 'select') {
    return (
      <div className={`h-screen flex flex-col relative ${theme === 'light' ? 'parchment-bg' : ''}`}>
        {/* 背景轮播 - 白天模式显示 */}
        {theme === 'light' && (
          <BackgroundCarousel 
            images={BACKGROUND_IMAGES}
            interval={CAROUSEL_CONFIG.interval}
          />
        )}
        
        {/* Background Effects - 根据主题切换 */}
        {theme === 'dark' ? (
          <>
            {/* 底层：深色背景 */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#1a1410] via-[#2d2418] to-[#1a1410]"></div>
            
            {/* 羊皮纸纹理层 */}
            <div 
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                mixBlendMode: 'overlay'
              }}
            ></div>
            
            {/* 古风纹理图案 */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20,20 Q40,5 60,20 T100,20 M20,50 Q40,35 60,50 T100,50 M20,80 Q40,65 60,80 T100,80' stroke='%23d4af37' stroke-width='0.5' fill='none' opacity='0.3'/%3E%3C/svg%3E")`
              }}
            ></div>
            
            {/* 原版三国杀风格边框装饰 */}
            <div className="absolute inset-4 border-2 border-[#8b7355]/30 rounded-lg pointer-events-none"></div>
            <div className="absolute inset-6 border border-[#8b7355]/20 rounded-lg pointer-events-none"></div>
            
            {/* 四角装饰 */}
            <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-[#d4af37]/50 rounded-tl-lg pointer-events-none"></div>
            <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-[#d4af37]/50 rounded-tr-lg pointer-events-none"></div>
            <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-[#d4af37]/50 rounded-bl-lg pointer-events-none"></div>
            <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-[#d4af37]/50 rounded-br-lg pointer-events-none"></div>
          </>
        ) : (
          <>
            {/* 白天模式装饰边框 */}
            <div className="absolute inset-4 border-2 border-[#c4a77d]/30 rounded-lg pointer-events-none z-10"></div>
            <div className="absolute inset-6 border border-[#c4a77d]/20 rounded-lg pointer-events-none z-10"></div>
            
            {/* 四角装饰 */}
            <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-[#c4a77d]/40 rounded-tl-lg pointer-events-none z-10"></div>
            <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-[#c4a77d]/40 rounded-tr-lg pointer-events-none z-10"></div>
            <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-[#c4a77d]/40 rounded-bl-lg pointer-events-none z-10"></div>
            <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-[#c4a77d]/40 rounded-br-lg pointer-events-none z-10"></div>
          </>
        )}

        {/* Header：返回 / 标题 / 图标控制 */}
        <div className="flex-none relative z-20 px-4 pt-3">
          <div className="relative flex items-center justify-center py-2">
            <button
              onClick={() => { setSelectedHero(null); setScreen('start'); }}
              className="ui-text-btn absolute left-0"
              aria-label="返回首页"
            >
              <IconArrowLeft />
              <span>返回</span>
            </button>

            <div className="text-center px-2 min-w-0 pr-[6.5rem] sm:pr-2 md:max-w-none">
              <h2 className={`font-ancient text-lg sm:text-3xl md:text-5xl whitespace-nowrap ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]'}`}>选择您的武将</h2>
              <div className={`mt-1.5 text-[10px] tracking-[0.3em] md:tracking-[0.42em] pl-[0.3em] whitespace-nowrap hidden sm:block ${theme === 'dark' ? 'text-[#8f7c5e]' : 'text-[#9b8a6c]'}`}>
                CHOOSE YOUR GENERAL · {HEROES.length} 名
              </div>
            </div>

            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button onClick={toggleMute} className="ui-icon-btn" title={isMuted ? '开启音乐' : '静音'} aria-label={isMuted ? '开启音乐' : '静音'}>
                <IconSpeaker muted={isMuted} />
              </button>
              <button onClick={toggleMotion} className="ui-icon-btn" title={motionOn ? '关闭动效' : '开启动效'} aria-label={motionOn ? '关闭动效' : '开启动效'}>
                <IconMotion off={!motionOn} />
              </button>
              <button onClick={toggleTheme} className="ui-icon-btn" title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'} aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}>
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
        </div>

        {/* 武将网格：桌面端一屏 3 行，整张牌面裁切，技能名压在牌角 */}
        <div className="flex-1 overflow-y-auto px-4 pb-28 relative z-10 scrollbar-thin">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 min-[1200px]:grid-cols-8 gap-3 w-full max-w-[1440px] mx-auto pt-2">
            {HEROES.map(hero => (
              <button
                key={hero.id}
                onClick={() => { setSelectedHero(hero); setDetailHero(hero); }}
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

                {/* 势力印章（卡框同时按势力配色） */}
                <span className="hero-kingdom absolute top-2 left-2">
                  {hero.kingdom}
                </span>

                {/* 体力：勾玉 + 数字同时呈现 */}
                <span className="hero-hp absolute top-2 right-2" title={`体力上限 ${hero.maxHp}`}>
                  <span className="hero-hp-pips">
                    {Array.from({ length: hero.maxHp }).map((_, i) => (
                      <i key={i} className="hero-hp-pip" />
                    ))}
                  </span>
                  <b className="hero-hp-num tabular-nums">{hero.maxHp}</b>
                </span>

                {/* 选中角标 */}
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
                    {hero.lordSkillName && <span className="hero-lord-chip">主公技</span>}
                  </div>
                  <div className="hero-pick-desc line-clamp-3">{hero.skillDesc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 底部详情条：始终存在，未选将时提示并可直接天命随机
            手机端按钮换行到下一行，避免把武将名/技能挤成竖排 */}
        <div className="pick-detail flex-none z-30 px-4 py-2.5">
          <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
            <div className="flex items-center gap-3 min-w-0 w-full md:flex-1">
              {selectedHero ? (
                <>
                  {/* 竖幅立绘缩略：点击查看原图大图 */}
                  <button
                    onClick={() => setPortraitHero(selectedHero)}
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
                        onClick={() => setPortraitHero(selectedHero)}
                        className={`ml-auto flex-none text-[11px] px-2 py-0.5 rounded border ${theme === 'dark' ? 'border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15' : 'border-[#a8842c]/50 text-[#6b4a1a] hover:bg-[#c8a45c]/15'}`}
                      >
                        查看立绘
                      </button>
                      <button
                        onClick={() => setDetailHero(selectedHero)}
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
                  滚动浏览 {HEROES.length} 名武将 · 点选查看技能，确认后出战
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-none w-full md:w-auto">
              <button
                onClick={() => {
                  const pool = HEROES.filter(h => h.id !== selectedHero?.id);
                  const pick = pool[Math.floor(Math.random() * pool.length)];
                  startGame(pick);
                }}
                className="btn-ink flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-ancient text-base tracking-wider"
                title="随机挑选一名武将立即出战"
              >
                <IconDice />
                天命随机
              </button>
              <button
                onClick={() => selectedHero && startGame(selectedHero)}
                disabled={!selectedHero}
                className="btn-gold flex-1 md:flex-none px-7 py-2.5 rounded-lg font-ancient text-lg tracking-[0.18em]"
              >
                确认出战
              </button>
            </div>
          </div>
        </div>

        <HeroDetailModal
          hero={detailHero}
          onClose={() => setDetailHero(null)}
          onSelect={(h) => { setSelectedHero(h); setDetailHero(null); }}
          onStart={(h) => { setDetailHero(null); startGame(h); }}
          onZoom={(h) => setPortraitHero(h)}
        />
        <PortraitLightbox hero={portraitHero} onClose={() => setPortraitHero(null)} />
      </div>
    );
  }

  if (screen === 'gameover') {
    return (
      <GameOverScreen
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
    (me.hero.name === '关羽' && [Suit.HEART, Suit.DIAMOND].includes(activeCard.suit))
  );

  // --- 对局面板自适应 ---
  // 手牌尺寸只按设备类型分档：桌面始终大卡（高度≥140px 硬指标），手机小卡但高度≥110px
  const compactHand = layoutDensity !== 'roomy';
  const isMobileHand = viewport.w < 768;
  const handLarge = !isMobileHand;

  return (
    <div
      data-density={layoutDensity}
      data-size-tier={sizeTier}
      data-motion={motionOn ? 'on' : 'off'}
      className={`h-screen w-full flex flex-col overflow-hidden relative ${theme === 'light' ? 'parchment-bg' : 'bg-[#1c1c1c]'}`}
      style={scaleStyle}
    >
      {/* 卡面锐化滤镜：全局只挂一份，供所有 CardComponent 引用 */}
      <CardArtFilters />

      {/* 背景轮播 - 白天模式显示 - 放在最底层 */}
      {theme === 'light' && (
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
          background: theme === 'dark'
            ? 'repeating-linear-gradient(42deg, rgba(255,236,190,0.014) 0 1px, rgba(0,0,0,0) 1px 4px), linear-gradient(180deg, #14100d 0%, #241b14 48%, #0c0906 100%)'
            : 'repeating-linear-gradient(42deg, rgba(120,95,55,0.035) 0 1px, rgba(0,0,0,0) 1px 5px), linear-gradient(180deg, #faf8f5 0%, #f2ece2 48%, #ece5d9 100%)'
        }}
      />
      {/* 中央牌桌柔光（静态 radial-gradient，零滤镜开销） */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: -5,
          background: theme === 'dark'
            ? 'radial-gradient(ellipse 62% 48% at 50% 46%, rgba(200,164,92,0.14) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 62% 48% at 50% 46%, rgba(196,167,125,0.20) 0%, transparent 70%)'
        }}
      />
      {/* 暗角（仅黑夜模式） */}
      {theme === 'dark' && (
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
        className={`absolute inset-2 rounded-lg border pointer-events-none ${theme === 'dark' ? 'border-[#8b7355]/30' : 'border-[#c4a77d]/25'}`}
        style={{ zIndex: 5 }}
      />
      <div className={`absolute top-2 left-2 w-16 h-16 border-l-2 border-t-2 rounded-tl-lg pointer-events-none ${theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      <div className={`absolute top-2 right-2 w-16 h-16 border-r-2 border-t-2 rounded-tr-lg pointer-events-none ${theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      <div className={`absolute bottom-2 left-2 w-16 h-16 border-l-2 border-b-2 rounded-bl-lg pointer-events-none ${theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      <div className={`absolute bottom-2 right-2 w-16 h-16 border-r-2 border-b-2 rounded-br-lg pointer-events-none ${theme === 'dark' ? 'border-[#c8a45c]/45' : 'border-[#c4a77d]/35'}`} style={{ zIndex: 5 }}></div>
      
      {/* 原版三国杀风格装饰线 */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent pointer-events-none z-10"></div>
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent pointer-events-none z-10"></div>
      
      {/* 命中 / 治疗全屏闪光：用 id 作为 key 保证每次伤害都能重新触发动画 */}
      {damageNumber && (
        <div key={`hit-${damageNumber.id}`} className="absolute inset-0 z-[70] pointer-events-none animate-hit-flash" />
      )}
      {healNumber && (
        <div key={`heal-${healNumber.id}`} className="absolute inset-0 z-[70] pointer-events-none animate-heal-flash" />
      )}

      {/* Visual Effect Overlay - 优化版卡牌动画（判定演出期间让位，避免两层卡牌叠影） */}
      {visualCard && !judgmentVisual && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden" style={{ contain: 'layout style paint' }}>
          {/* 出牌聚光：中心微亮 / 四周压暗，视线聚焦到牌面 */}
          <div className="absolute inset-0 card-spotlight"></div>

          {/* 卡牌飞入动画容器 */}
          <div className="relative animate-card-fly-in" style={{ willChange: 'transform' }}>
            {/* 金色冲击环：牌落桌时向外扩散一次 */}
            <div className="card-burst" />
            {/* 卡牌光晕 - 简化 */}
            <div className="absolute -inset-6 bg-yellow-400/20 blur-xl rounded-full"></div>

            {/* 卡牌主体 */}
            <div className="relative scale-110 md:scale-125 animate-card-bounce">
              <div className="card-settle">
                <CardComponent card={visualCard.card} />
              </div>

              {/* 卡牌名称标签 */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="card-plate px-5 py-1.5 rounded-lg font-ancient text-lg">
                  {visualCard.playerName} 打出
                </div>
              </div>
            </div>

            {/* 粒子效果 - 减少数量 */}
            <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-particle-1"></div>
            <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-400 rounded-full animate-particle-2"></div>
            <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-orange-400 rounded-full animate-particle-3"></div>
            <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-particle-4"></div>
          </div>
        </div>
      )}

      {/* 判定演出：判定牌翻面 + 朱印「判」 */}
      {judgmentVisual && (
        <div key={judgmentVisual.id} className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="absolute inset-0 judge-backdrop" />
          <div className="relative flex items-center gap-5 md:gap-9">
            <div className="judge-seal font-ancient">判</div>
            <div className="relative judge-flip">
              <div className="judge-halo" />
              <div className="scale-105 md:scale-125">
                <CardComponent card={judgmentVisual.card} />
              </div>
              <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap card-plate px-4 py-1 rounded-md font-ancient text-base">
                {judgmentVisual.playerName} · {judgmentVisual.reason} 判定
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 回合过场：墨金横带「X 回合结束 → 轮到 Y」，让换手不再突兀 */}
      {turnPass && (
        <div key={turnPass.id} className="absolute inset-0 z-[55] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="turn-pass-band" style={{ animationDuration: `${Math.round(1000 / speedLevel)}ms` }}>
            <span className="turn-pass-from font-ancient">{turnPass.from} · 回合结束</span>
            <span className="turn-pass-arrow" />
            <span className="turn-pass-to font-ancient">轮到 {turnPass.to}</span>
          </div>
        </div>
      )}

      {/* 技能发动特写：武将头像 + 技能名一起出场（不再是纯文字横幅） */}
      {skillBanner && (() => {
        const caster = players.find(p => p.hero.name === skillBanner.hero)?.hero;
        return (
          <div key={skillBanner.id} className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
            <div className="skill-cast text-center">
              {caster && (
                <div className="skill-cast-portrait">
                  <span className="skill-cast-ring" />
                  <img src={caster.avatarUrl} alt={caster.name} draggable={false} />
                </div>
              )}
              <div className="skill-banner-skill font-ancient">{skillBanner.skill}</div>
              <div className="skill-banner-hero font-ancient">{skillBanner.hero} · 发动技能</div>
            </div>
          </div>
        );
      })()}

      {/* 弃牌堆查看器 */}
      {showDiscardViewer && (
         <div className="absolute inset-0 z-[90] modal-mask flex items-center justify-center p-4" onClick={() => setShowDiscardViewer(false)}>
            <div
              className="modal-shell max-w-3xl w-[92%] max-h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
               <div className="flex items-center justify-between px-5 py-3 border-b border-[#8b7355]/35">
                 <h3 className="modal-title text-xl font-ancient">弃牌堆 <span className="text-sm opacity-60 tracking-normal normal-case">{discardPile.length} 张</span></h3>
                 <button
                   onClick={() => setShowDiscardViewer(false)}
                   className="btn-ink w-8 h-8 rounded-full flex items-center justify-center text-sm"
                   aria-label="关闭弃牌堆"
                 >✕</button>
               </div>
               <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                 {discardPile.length === 0 ? (
                   <p className="modal-text-dim text-center py-10">弃牌堆空空如也</p>
                 ) : (
                   <div className="flex flex-wrap gap-2 justify-center">
                     {[...discardPile].reverse().map(card => (
                       <div key={card.id} title={card.description}>
                         <CardComponent card={card} small disabled />
                       </div>
                     ))}
                   </div>
                 )}
               </div>
            </div>
         </div>
      )}

      {/* Manual Reaction Modal */}
      {pendingReaction && !isAiTakeover && (
         <div className="absolute inset-0 z-40 modal-mask flex items-center justify-center p-4">
            <div className="modal-frame modal-frame-danger w-full max-w-xl p-6 text-center">
               <h3 className="modal-title text-3xl font-ancient mb-1">杀机已至</h3>
               <div className="modal-divider mb-3" />
               <div className="flex items-center justify-center gap-2 mb-3">
                 <span className={`text-xl font-bold tabular-nums ${(reactionLeft ?? 0) <= 5 ? 'text-[#e0705f] animate-pulse' : 'text-[#e8cf94]'}`}>
                   {reactionLeft ?? DECISION_SECONDS}
                 </span>
                 <span className="modal-text-dim text-xs">秒内请选择，超时自动放弃</span>
               </div>
               <p className="modal-text mb-2 text-base leading-relaxed">
                 <span className="font-bold text-[#f0dcae]">{getPlayer(pendingReaction.sourceId)?.hero.name}</span> 对你使用了 
                 <span className="font-bold text-[#e8a99f] mx-1">【{pendingReaction.originalCard.name}】</span>
               </p>
               <p className="modal-text-dim text-sm mb-5">
                 需要打出【{pendingReaction.cardName}】来抵消
               </p>
               <div className="mb-6 flex justify-center gap-2 flex-wrap">
                 {/* Filter Hand for needed card, skill cards, and Wuxie */}
                 {(() => {
                   const neededCard = pendingReaction.cardName;
                   const canUseSkill = me.hero.name === '赵云';
                   const skillCardName = neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN;
                   const responder = players.find(p => p.id === pendingReaction.targetId) || me;
                   const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
                   // 关羽「武圣」：红色牌可当【杀】打出
                   const canWusheng = me.hero.name === '关羽' && neededCard === CardName.SHA;
                   const isWushengCard = (c: Card) => canWusheng && (c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
                   // 甄姬「倾国」：黑色牌可当【闪】打出
                   const canQingguo = me.hero.name === '甄姬' && neededCard === CardName.SHAN;
                   const isQingguoCard = (c: Card) => canQingguo && (c.suit === Suit.SPADE || c.suit === Suit.CLUB);

                   // 过滤可用卡牌：需要的卡牌、技能卡牌、武圣红牌、倾国黑牌、无懈可击（仅无懈响应阶段）
                   const usableCards = responder.hand.filter(c => {
                     return c.name === neededCard || 
                            (canUseSkill && c.name === skillCardName) ||
                            isWushengCard(c) ||
                            isQingguoCard(c) ||
                            (neededCard === CardName.WUXIE && c.name === CardName.WUXIE);
                   });
                    
                   return usableCards.length > 0 ? (
                     usableCards.map(c => (
                       <div key={c.id} className="transform hover:-translate-y-2 transition-transform cursor-pointer" onClick={() => handleCardClick(c)}>
                          <CardComponent card={c} small />
                       </div>
                     ))
                   ) : (
                     <p className="modal-text-dim italic">手中无【{pendingReaction.cardName}】可挡...</p>
                   );
                 })()}
               </div>
               <div className="flex justify-center gap-4">
                  <button 
                    onClick={handleManualSkipReaction}
                    className="btn-ink px-6 py-2 rounded-lg font-ancient text-lg"
                  >
                    放弃/掉血
                  </button>
               </div>
            </div>
         </div>
      )}
      
      {/* 武将详情：点击任意头像打开（人物介绍 + 技能说明） */}
      {inspectPlayerId !== null && (() => {
        const p = getPlayer(inspectPlayerId);
        if (!p) return null;
        const knownIdentity = p.isHuman || p.isRevealed || p.identity === Identity.ZHUGONG;
        const equipNames = [p.equipment?.weapon, p.equipment?.armor, p.equipment?.horsePlus, p.equipment?.horseMinus]
          .filter(Boolean).map(c => c!.name);
        return (
          <div className="absolute inset-0 z-[100] modal-mask flex items-center justify-center p-4" onClick={() => setInspectPlayerId(null)}>
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
                    onClick={() => { setInspectPlayerId(null); setPortraitHero(p.hero); }}
                    className="text-[11px] px-2 py-0.5 rounded border border-[#c8a45c]/50 text-[#e8cf94] hover:bg-[#c8a45c]/15"
                  >
                    查看立绘
                  </button>
                  <button
                    onClick={() => { setInspectPlayerId(null); setDetailHero(p.hero); }}
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
                  <p className="text-stone-400 text-sm">{p.hero.description}</p>
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

              <div className="bg-black/20 p-4 rounded-lg border border-[#8b7355]/20 text-sm space-y-2">
                <div className="flex gap-2"><span className="text-stone-500 w-16 shrink-0">装备</span>
                  <span className="text-stone-300">{equipNames.length ? equipNames.join('、') : '无'}</span>
                </div>
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
                <button onClick={() => setInspectPlayerId(null)} className="px-10 py-2.5 btn-gold font-ancient text-xl rounded-lg">
                  关闭
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 立绘大图查看（竖幅原图，可关闭） */}
      <PortraitLightbox hero={portraitHero} onClose={() => setPortraitHero(null)} />

      {/* 武将详情（对局内点击座位 → 武将详情） */}
      <HeroDetailModal
        hero={detailHero}
        onClose={() => setDetailHero(null)}
        onZoom={(h) => setPortraitHero(h)}
      />

      {/* Skill Info Modal - 技能说明弹窗 */}
      {showSkillModal && (
         <div className="absolute inset-0 z-[100] modal-mask flex items-center justify-center p-4">
            <div className="modal-shell max-w-3xl w-[95%] max-h-[85vh] overflow-y-auto p-6 scrollbar-thin">
               {/* 标题 */}
               <div className="text-center mb-6">
                 <h3 className="modal-title text-3xl font-ancient mb-2">技能说明</h3>
                 <div className="w-32 modal-divider mx-auto"></div>
               </div>

               {/* 武将信息 */}
               <div className="flex items-center gap-4 mb-6 p-4 bg-black/30 rounded-lg border border-[#8b7355]/30">
                 <img src={me.hero.avatarUrl} alt={me.hero.name} loading="eager" decoding="async" className="w-20 h-[120px] rounded-lg border-2 border-[#d4af37]/50 object-cover" />
                 <div>
                   <h4 className="text-2xl font-bold text-[#d4af37] font-ancient">{me.hero.name}</h4>
                   <p className="text-stone-400 text-sm">{me.hero.description}</p>
                   <div className="flex items-center gap-2 mt-1">
                     <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                       me.hero.kingdom === '魏' ? 'bg-blue-900/60 text-blue-200' :
                       me.hero.kingdom === '蜀' ? 'bg-red-900/60 text-red-200' :
                       me.hero.kingdom === '吴' ? 'bg-green-900/60 text-green-200' :
                       'bg-stone-700/60 text-stone-200'
                     }`}>
                       {me.hero.kingdom}
                     </span>
                     <span className="text-red-400 text-sm">♥ {me.maxHp}</span>
                   </div>
                 </div>
               </div>

               {/* 左右分栏布局：技能介绍 + 手牌说明 */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* 左侧：技能介绍 */}
                 <div className="space-y-4">
                   {/* 技能名称 */}
                   <div className="bg-gradient-to-r from-[#8b4513]/30 to-transparent p-4 rounded-lg border-l-4 border-[#d4af37]">
                     <h5 className="text-xl font-bold text-[#d4af37] mb-2 font-ancient">
                       【{me.hero.skillName}】
                     </h5>
                     <p className="text-stone-300 leading-relaxed">{me.hero.skillDesc}</p>
                     {me.hero.lordSkillName && (
                       <div className="mt-3 pt-3 border-t border-[#8b7355]/30">
                         <div className="text-base font-bold text-[#e8cf94] mb-1 font-ancient">主公技【{me.hero.lordSkillName}】</div>
                         <p className="text-stone-300 leading-relaxed">{me.hero.lordSkillDesc}</p>
                       </div>
                     )}
                   </div>

                   {/* 使用示例 */}
                   <div className="bg-black/20 p-4 rounded-lg border border-[#8b7355]/20">
                     <h6 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2">
                       <span>💡</span> 使用示例
                     </h6>
                     <div className="text-stone-300 text-sm space-y-2">
                       {me.hero.name === '曹操' && (
                         <>
                           <p>• 当你受到【杀】的伤害后，会自动获得这张【杀】</p>
                           <p>• 当你受到【决斗】的伤害后，会自动获得这张【决斗】</p>
                           <p>• <span className="text-yellow-400">示例</span>：曹操被赵云用【杀】攻击并受伤，曹操获得这张【杀】加入手牌</p>
                         </>
                       )}
                       {me.hero.name === '刘备' && (
                         <>
                           <p>• 点击【仁德】按钮进入给牌模式</p>
                           <p>• 选择任意数量的手牌（至少1张）</p>
                           <p>• 选择目标角色，点击确认给出</p>
                           <p>• 给出2张或更多牌时，回复1点体力</p>
                           <p>• <span className="text-yellow-400">示例</span>：刘备有3张牌，选择给出2张给关羽，刘备回复1点体力</p>
                         </>
                       )}
                       {me.hero.name === '孙权' && (
                         <>
                           <p>• 点击【制衡】按钮进入制衡模式</p>
                           <p>• 选择任意数量的手牌弃置</p>
                           <p>• 系统会自动摸取等量的牌</p>
                           <p>• 每回合限使用一次</p>
                           <p>• <span className="text-yellow-400">示例</span>：孙权弃置2张【闪】，摸取2张新牌，可能获得【杀】或【桃】</p>
                         </>
                       )}
                       {me.hero.name === '吕布' && (
                         <>
                           <p>• 使用【杀】攻击目标时，目标需要打出两张【闪】才能抵消</p>
                           <p>• 与目标【决斗】时，目标需要打出两张【杀】才能反击</p>
                           <p>• <span className="text-yellow-400">示例</span>：吕布对曹操使用【杀】，曹操只有1张【闪】，无法防御，受到伤害</p>
                         </>
                       )}
                       {me.hero.name === '赵云' && (
                         <>
                           <p>• 可以将【杀】当【闪】使用</p>
                           <p>• 可以将【闪】当【杀】使用</p>
                           <p>• 在需要出【闪】时，点击红色手牌即可使用</p>
                           <p>• <span className="text-yellow-400">示例</span>：赵云被【杀】攻击，手牌中只有【杀】，可以将【杀】当【闪】使用来防御</p>
                         </>
                       )}
                       {me.hero.name === '关羽' && (
                         <>
                           <p>• 可以将任意红色牌（红桃、方块）当【杀】使用</p>
                           <p>• 红色牌包括：【桃】、【无中生有】等</p>
                           <p>• <span className="text-yellow-400">示例</span>：关羽手牌中有【桃】（红桃），可以将其当【杀】使用攻击敌人</p>
                         </>
                       )}
                       {me.hero.name === '司马懿' && (
                         <>
                           <p>• 当你使用【闪】或【无懈可击】成功免疫攻击后</p>
                           <p>• 如果体力未满，回复1点体力</p>
                           <p>• 如果体力已满，摸一张牌</p>
                           <p>• <span className="text-yellow-400">示例</span>：司马懿使用【闪】抵消【杀】，体力从2/3回复到3/3</p>
                         </>
                       )}
                       {me.hero.name === '貂蝉' && (
                         <>
                           <p>• 点击【离间】按钮进入离间模式</p>
                           <p>• 弃置一张手牌</p>
                           <p>• 选择两名男性角色进行【决斗】</p>
                           <p>• 先被选中的角色先出【杀】</p>
                           <p>• <span className="text-yellow-400">示例</span>：貂蝉弃置【闪】，选择吕布和曹操决斗，吕布先出【杀】</p>
                         </>
                       )}
                       {me.hero.name === '张飞' && (
                         <>
                           <p>• 出牌阶段可连续使用任意数量的【杀】，不受次数限制</p>
                           <p>• 配合【酒】可对同一目标连续造成高额伤害</p>
                           <p>• <span className="text-yellow-400">示例</span>：张飞手握 3 张【杀】，一回合内可全部打出</p>
                         </>
                       )}
                       {me.hero.name === '黄忠' && (
                         <>
                           <p>• 你使用【杀】时，若目标手牌数 ≥ 你的体力值，此【杀】不可被【闪】抵消</p>
                           <p>• 体力越低越容易触发，适合残血反打</p>
                           <p>• <span className="text-yellow-400">示例</span>：黄忠 2 点体力，目标有 3 张手牌，其无法出【闪】</p>
                         </>
                       )}
                       {me.hero.name === '夏侯惇' && (
                         <>
                           <p>• 受到伤害后自动判定，结果非红桃则伤害来源失去 1 点体力</p>
                           <p>• 越被围攻越容易反伤，注意别把自己逼入濒死</p>
                           <p>• <span className="text-yellow-400">示例</span>：夏侯惇被【杀】命中，判定为黑桃，攻击者失去 1 点体力</p>
                         </>
                       )}
                       {me.hero.name === '周瑜' && (
                         <>
                           <p>• 摸牌阶段额外摸一张（共摸 3 张）</p>
                           <p>• 手牌更充裕，适合储备【杀】【闪】与锦囊</p>
                           <p>• <span className="text-yellow-400">示例</span>：周瑜每回合稳定摸 3 张，快速积累装备与锦囊</p>
                         </>
                       )}
                       {me.hero.name === '甄姬' && (
                         <>
                           <p>• 需要出【闪】时，任意黑色手牌（♠♣）都可以当【闪】打出</p>
                           <p>• 回合开始自动「洛神」：判定为黑色则获得该牌并可继续，最多 3 次</p>
                           <p>• <span className="text-yellow-400">示例</span>：甄姬开局洛神连翻两张黑牌，手牌直接+2</p>
                         </>
                       )}
                       {me.hero.name === '黄月英' && (
                         <>
                           <p>• 每使用一张锦囊牌，立即摸一张牌（集智）</p>
                           <p>• 使用锦囊牌无距离限制（奇才），可越位顺手</p>
                           <p>• <span className="text-yellow-400">示例</span>：黄月英用【顺手牵羊】偷取远位敌人的装备</p>
                         </>
                       )}
                       {me.hero.name === '孙尚香' && (
                         <>
                           <p>• 失去装备区的牌时摸两张（枭姬，换装/被拆/被偷都触发）</p>
                           <p>• 弃两张手牌可与一名已受伤男性各回复 1 点体力（结姻，每回合一次）</p>
                           <p>• <span className="text-yellow-400">示例</span>：孙尚香点「结姻」→ 点一名受伤男将，双方回血</p>
                         </>
                       )}
                       {me.hero.name === '张春华' && (
                         <>
                           <p>• 回合结束时，若手牌少于已损失体力，自动摸牌补至该数值</p>
                           <p>• 越受伤手牌越多，残血时反而更耐打</p>
                           <p>• <span className="text-yellow-400">示例</span>：张春华 3 体力上限、当前 1 点体力，回合结束补至 2 张</p>
                         </>
                       )}
                       {me.hero.name === '祝融' && (
                         <>
                           <p>• 【南蛮入侵】对你完全无效，并额外摸一张牌</p>
                           <p>• 敌方放南蛮时你是最大受益者</p>
                           <p>• <span className="text-yellow-400">示例</span>：对手使用【南蛮入侵】，祝融不受伤害并摸一张</p>
                         </>
                       )}
                       {me.hero.name === '大乔' && (
                         <>
                           <p>• 成为【杀】目标时，自动弃一张手牌并把【杀】转给攻击范围内另一名角色</p>
                           <p>• 手牌越充足越难被打中</p>
                           <p>• <span className="text-yellow-400">示例</span>：大乔被【杀】指定，弃一张牌后将【杀】转移给相邻的敌人</p>
                         </>
                       )}
                       {me.hero.name === '小乔' && (
                         <>
                           <p>• 你的方块牌在判定时视为红桃</p>
                           <p>• 对【乐不思蜀】等判定有额外容错</p>
                           <p>• <span className="text-yellow-400">示例</span>：小乔的【乐不思蜀】判定翻出方块，视为红桃而免于跳过出牌</p>
                         </>
                       )}
                       {me.hero.name === '蔡文姬' && (
                         <>
                           <p>• 你阵亡时，击杀你的角色失去所有手牌</p>
                           <p>• 敌人击杀你需付出代价，可用来威慑</p>
                           <p>• <span className="text-yellow-400">示例</span>：蔡文姬被击杀，凶手手牌全部进入弃牌堆</p>
                         </>
                       )}
                       {me.hero.name === '甘宁' && (
                         <>
                           <p>• 点击「奇袭」按钮后，选一张黑色牌（♠♣），再点目标角色，即当【过河拆桥】使用</p>
                           <p>• 无需距离限制，可拆手牌或装备</p>
                           <p>• <span className="text-yellow-400">示例</span>：甘宁用黑色【酒】当【过河拆桥】，拆掉远处敌人的武器</p>
                         </>
                       )}
                       {me.hero.name === '吕蒙' && (
                         <>
                           <p>• 出牌阶段没有使用过【杀】，弃牌阶段自动跳过</p>
                           <p>• 手上牌多时可以放心留牌蓄势</p>
                           <p>• <span className="text-yellow-400">示例</span>：吕蒙本回合只上装、不出杀，回合结束无需弃牌</p>
                         </>
                       )}
                       {me.hero.name === '王异' && (
                         <>
                           <p>• 回合开始时若已受伤，自动摸等同于已损失体力的牌</p>
                           <p>• 越受伤收益越大，适合主动换血</p>
                           <p>• <span className="text-yellow-400">示例</span>：王异 3 上限、当前 1 体力，回合开始摸 2 张</p>
                         </>
                       )}
                       {me.hero.name === '步练师' && (
                         <>
                           <p>• 你阵亡时，自动令己方体力最低的一名角色摸三张牌</p>
                           <p>• 阵亡也能为队友留下资源</p>
                           <p>• <span className="text-yellow-400">示例</span>：步练师阵亡，队友主公摸三张牌继续作战</p>
                         </>
                       )}
                     </div>
                   </div>
                 </div>

                 {/* 右侧：当前手牌使用效果 */}
                 {me.hand.length > 0 && (
                   <div className="bg-gradient-to-b from-[#1a1510] to-[#0f0f0f] p-4 rounded-lg border border-[#d4af37]/30">
                     <h6 className="text-lg font-bold text-[#d4af37] mb-4 flex items-center gap-2 font-ancient">
                       <span className="w-[3px] h-5 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
                       当前手牌使用效果
                     </h6>
                     <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto">
                       {me.hand.map((card, index) => {
                         const isRedCard = [Suit.HEART, Suit.DIAMOND].includes(card.suit);
                         const isZhaoyun = me.hero.name === '赵云';
                         const isGuanyu = me.hero.name === '关羽';
                         
                         // 获取卡牌效果说明
                         const getCardEffect = () => {
                           switch (card.name) {
                             case CardName.SHA:
                               if (isZhaoyun) return '可当【杀】或【闪】使用';
                               if (isGuanyu && isRedCard) return '红色【杀】，可通过「武圣」转换';
                               return '对目标造成1点伤害';
                             case CardName.SHAN:
                               if (isZhaoyun) return '可当【杀】或【闪】使用';
                               return '抵消一张【杀】的伤害';
                             case CardName.TAO:
                               return '回复1点体力';
                             case CardName.JIU:
                               return '本回合下一张【杀】伤害+1';
                             case CardName.JUEDOU:
                               return '与目标轮流出【杀】，先不出者受伤';
                             case CardName.WUZHONG:
                               return '摸两张牌';
                             case CardName.NANMAN:
                               return '全场需打出【杀】，否则受伤';
                             case CardName.WANJIAN:
                               return '全场需打出【闪】，否则受伤';
                             case CardName.SHUNSHOU:
                               return '获得目标一张手牌';
                             case CardName.GUOHE:
                               return '弃置目标一张手牌';
                             case CardName.LESI:
                               return '目标下回合可能跳过出牌阶段';
                             case CardName.WUXIE:
                               return '抵消一张锦囊牌的效果';
                             case CardName.HUOGONG:
                               return '展示目标手牌，弃置同花色牌造成火焰伤害';
                             case CardName.TIESUO:
                               return '横置1-2名角色，传导属性伤害';
                             case CardName.BINGLIANG:
                               return '目标下回合可能跳过摸牌阶段';
                             case CardName.WUGU:
                               return '所有角色依次选择并获得一张牌';
                             case CardName.TAOYUAN:
                               return '所有角色回复1点体力';
                             case CardName.JIEDAO:
                               return '令有武器的角色攻击另一名角色，否则获得其武器';
                             case CardName.SHANDIAN:
                               return '延时锦囊，判定黑桃2-9则受到3点雷电伤害';
                             default:
                               return card.description;
                           }
                         };

                         // 获取卡牌类型颜色
                         const getCardTypeColor = () => {
                           switch (card.type) {
                             case CardType.BASIC:
                               return 'border-stone-500/50 bg-stone-800/50';
                             case CardType.SCROLL:
                               return 'border-amber-600/50 bg-amber-900/30';
                             case CardType.EQUIPMENT:
                               return 'border-blue-600/50 bg-blue-900/30';
                             default:
                               return 'border-stone-500/50';
                           }
                         };

                         return (
                           <div 
                             key={card.id} 
                             className={`flex items-center gap-3 p-3 rounded-lg border ${getCardTypeColor()} hover:bg-[#2a2018] transition-colors`}
                           >
                             {/* 使用 CardComponent 显示卡牌 */}
                             <div className="flex-shrink-0 transform scale-75 origin-left -ml-2">
                               <CardComponent card={card} small />
                             </div>
                             <div className="flex-1 min-w-0 -ml-1">
                               <div className="flex items-center gap-2 mb-1">
                                 <span className="text-[#d4af37] font-bold font-ancient">{card.name}</span>
                                 <span className="text-stone-500 text-xs">{card.rank}</span>
                                 <span className={`text-xs px-1.5 py-0.5 rounded ${
                                   card.type === CardType.BASIC ? 'bg-stone-700 text-stone-300' :
                                   card.type === CardType.SCROLL ? 'bg-amber-800/60 text-amber-200' :
                                   'bg-blue-800/60 text-blue-200'
                                 }`}>
                                   {card.type}
                                 </span>
                               </div>
                               <p className="text-stone-400 text-sm leading-relaxed">{getCardEffect()}</p>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>
                 )}
               </div>

               {/* 关闭按钮 */}
               <div className="mt-6 flex justify-center">
                 <button
                   onClick={() => setShowSkillModal(false)}
                   className="btn-gold px-8 py-3 rounded-lg font-ancient text-xl"
                 >
                   明白了
                 </button>
               </div>
            </div>
         </div>
      )}

      {/* Dying State Modal - Ask for Peaches - 最高优先级 */}
      {dyingState && dyingState.isActive && (
         <div className="absolute inset-0 z-[200] modal-mask flex items-center justify-center p-4">
            <div className="modal-frame modal-frame-danger w-full max-w-lg p-6 text-center">
               <h3 className="modal-title text-3xl font-ancient mb-1">💀 濒死求桃</h3>
               <div className="modal-divider mb-3" />
               {dyingState.rescuerId === me.id && (
                 <div className="flex items-center justify-center gap-2 mb-2">
                   <span className={`text-xl font-bold tabular-nums ${(dyingLeft ?? 0) <= 5 ? 'text-[#e0705f] animate-pulse' : 'text-[#e8cf94]'}`}>
                     {dyingLeft ?? DECISION_SECONDS}
                   </span>
                   <span className="modal-text-dim text-xs">秒内请选择，超时自动放弃</span>
                 </div>
               )}
               <div className="modal-text-dim text-xs mb-4">
                 目标: {getPlayer(dyingState.victimId)?.hero.name} | 当前体力: {getPlayer(dyingState.victimId)?.hp}/{getPlayer(dyingState.victimId)?.maxHp}
               </div>

               {/* 显示当前被询问的玩家 */}
               <div className={`mb-4 p-3 rounded-lg border transition-all duration-300 ${
                 dyingState.rescuerId === me.id
                   ? 'bg-[#1b3024]/45 border-[#6a9a80]/60 animate-pulse'
                   : 'bg-black/25 border-[#8b7355]/30'
               }`}>
                 <p className="modal-text-dim text-sm">当前询问</p>
                 <p className={`text-xl font-bold ${dyingState.rescuerId === me.id ? 'text-[#9fd4b4]' : 'text-[#d4af37]'}`}>
                   {dyingState.rescuerId === me.id ? '🔥 轮到你了！' : getPlayer(dyingState.rescuerId!)?.hero.name}
                 </p>
                 {dyingState.rescuerId === me.id && (
                   <p className="text-[#a8d4bb] text-sm mt-1">
                     {dyingState.hasTao && dyingState.hasJiu 
                       ? '请选择是否使用【桃】或【酒】救援' 
                       : dyingState.hasTao 
                         ? '请选择是否使用【桃】救援'
                         : dyingState.hasJiu
                           ? '请选择是否使用【酒】救援'
                           : '请选择是否使用红色牌发动「急救」'}
                   </p>
                 )}
               </div>

               <p className="modal-text mb-6 text-base leading-relaxed">
                 <span className="font-bold text-[#e8a99f]">{getPlayer(dyingState.victimId)?.hero.name}</span> 处于濒死状态，需要【桃】或【酒】来救命！
               </p>
               
               {/* 只有被询问的玩家才能看到操作按钮 */}
               {dyingState.rescuerId === me.id ? (
                 <>
                   <div className="mb-6 flex justify-center gap-2 flex-wrap">
                     {/* Show player's hand with peaches and wine highlighted */}
                     {me.hand.map(card => {
                       const isJijiuCard = !!dyingState.hasJijiu
                         && (card.suit === Suit.HEART || card.suit === Suit.DIAMOND);
                       const isSaveCard = card.name === CardName.TAO || card.name === CardName.JIU || isJijiuCard;
                       const cardType = card.name === CardName.TAO ? '桃' : card.name === CardName.JIU ? '酒' : '急救';
                       return (
                         <div 
                           key={card.id} 
                           className={`transform transition-all duration-200 relative
                             ${isSaveCard ? 'scale-110 hover:scale-125 shadow-yellow-500/50 cursor-pointer' : 'opacity-30 grayscale pointer-events-none'}
                           `}
                           onClick={() => {
                             if (isSaveCard && dyingState) {
                               dyingState.resolve(true);
                             }
                           }}
                         >
                           <CardComponent card={card} small />
                           {isSaveCard && (
                             <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] px-1 rounded border border-white animate-pulse">
                               点击使用{cardType}
                             </div>
                           )}
                         </div>
                       );
                     })}
                   </div>
                   <div className="flex justify-center gap-6">
                      <button 
                        onClick={() => {
                          // 使用桃或酒
                          dyingState.resolve(true);
                        }}
                        disabled={!me.hand.some(c => c.name === CardName.TAO || c.name === CardName.JIU
                          || (dyingState.hasJijiu && (c.suit === Suit.HEART || c.suit === Suit.DIAMOND)))}
                        className={`px-8 py-3 rounded-lg font-ancient text-xl ${
                          me.hand.some(c => c.name === CardName.TAO || c.name === CardName.JIU
                            || (dyingState.hasJijiu && (c.suit === Suit.HEART || c.suit === Suit.DIAMOND)))
                          ? 'btn-gold'
                          : 'btn-ink opacity-45'
                        }`}
                      >
                        {dyingState.hasTao ? '使用桃' : dyingState.hasJiu ? '使用酒' : '使用急救'}
                      </button>
                      <button 
                        onClick={() => {
                          // 不使用桃/酒
                          dyingState.resolve(false);
                        }}
                        className="px-8 py-3 rounded-lg font-ancient text-xl bg-[#5e1a15] text-[#f0c8c2] border border-[#c86b62]/70 hover:bg-[#7a221b] hover:text-[#ffe4de] hover:scale-105 transition-all"
                      >
                        不救
                      </button>
                   </div>
                 </>
               ) : (
                 /* 其他玩家等待中 */
                 <div className="p-4 bg-black/25 rounded-lg border border-[#8b7355]/25">
                   <p className="modal-text-dim">等待 <span className="text-[#d4af37] font-bold">{getPlayer(dyingState.rescuerId!)?.hero.name}</span> 决策中...</p>
                   <div className="mt-3 flex justify-center">
                     <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4af37]"></div>
                   </div>
                 </div>
               )}
            </div>
         </div>
      )}

      {/* 五谷丰登选择弹窗 - 点击选中+确认按钮 */}
      {wuguSelection && (
        <div className="absolute inset-0 z-[150] modal-mask flex items-center justify-center p-4">
          <div className="modal-frame max-w-5xl w-[95%] p-8">
            {/* 标题 */}
            <div className="text-center mb-6">
              <h3 className="modal-title text-3xl font-ancient mb-3">五谷丰登</h3>
              <p className="modal-text text-lg">{wuguSelection.playerName}，请选择一张牌</p>
              <p className={`mt-1 text-sm ${(wuguLeft ?? 0) <= 5 ? 'text-[#e0705f] animate-pulse' : 'text-[#e8cf94]'}`}>
                <span className="text-lg font-bold tabular-nums">{wuguLeft ?? DECISION_SECONDS}</span> 秒内请选择，超时自动选取
              </p>
              <div className="w-40 modal-divider mx-auto mt-3"></div>
            </div>

            {/* 展示的卡牌 - 点击选中效果 */}
            <div className="flex justify-center gap-5 mb-6 flex-wrap px-4">
              {wuguSelection.cards.map((card, index) => {
                const isSelected = wuguSelectedCard?.id === card.id;
                return (
                  <div 
                    key={card.id}
                    onClick={() => setWuguSelectedCard(card)}
                    className={`group relative cursor-pointer transition-all duration-300 ${
                      isSelected ? 'scale-110 -translate-y-4 z-10' : 'hover:scale-105 hover:-translate-y-2'
                    }`}
                    style={{ 
                      animation: `fade-in-up 0.4s ease-out ${index * 80}ms both`
                    }}
                  >
                    {/* 选中/悬停光晕效果 */}
                    <div className={`absolute inset-0 rounded-lg transition-all duration-300 ${
                      isSelected 
                        ? 'bg-[#d4af37]/40 shadow-[0_0_40px_rgba(212,175,55,0.8)] scale-110' 
                        : 'bg-[#d4af37]/0 group-hover:bg-[#d4af37]/20 group-hover:shadow-[0_0_30px_rgba(212,175,55,0.6)]'
                    }`}></div>
                    
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#d4af37] text-[#1a1410] flex items-center justify-center text-lg font-bold z-20 shadow-lg animate-bounce">
                        ✓
                      </div>
                    )}
                    
                    {/* 卡牌容器 */}
                    <div className="relative">
                      <CardComponent card={card} />
                    </div>
                    
                    {/* 序号指示器 */}
                    <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      isSelected 
                        ? 'bg-[#d4af37] text-[#1a1410] border-[#d4af37] scale-110' 
                        : 'bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/40 opacity-0 group-hover:opacity-100'
                    }`}>
                      {index + 1}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 确认按钮 */}
            <div className="text-center">
              <button
                onClick={() => {
                  if (wuguSelectedCard) {
                    // 立即关闭弹窗并返回选择
                    setWuguSelection(null);
                    wuguSelection.onSelect(wuguSelectedCard);
                    setWuguSelectedCard(null);
                  }
                }}
                disabled={!wuguSelectedCard}
                className={`px-10 py-3 rounded-full font-bold text-xl font-ancient tracking-widest transition-all duration-300 ${
                  wuguSelectedCard ? 'btn-gold' : 'btn-ink opacity-55'
                }`}
              >
                {wuguSelectedCard ? '确认选择' : '请先选择一张牌'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 常驻托管开关：z-index 高于所有弹窗，响应求闪 / 五谷丰登等弹窗期间也能直接点 */}
      <div className="absolute top-2 left-2 z-[230] flex items-center gap-2">
        <button
          data-tour="takeover"
          onClick={() => setIsAiTakeover(!isAiTakeover)}
          title={isAiTakeover ? '关闭托管，亲自操作' : '开启托管，由 AI 代打（弹窗期间点击也会立即接管）'}
          aria-pressed={isAiTakeover}
          className={`ui-icon-btn gap-2 px-3 ${isAiTakeover ? '!bg-[#5d1b16] !border-[#c86b62] !text-[#f7e7cf]' : ''}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isAiTakeover ? 'bg-[#f2a79c]' : 'bg-[#c8a45c]/70'}`} />
          <span className="text-xs font-bold tracking-[0.16em]">{isAiTakeover ? '托管中' : '托管'}</span>
        </button>
        <button
          onClick={() => setShowExitConfirm(true)}
          title="退出本局（会清除本局存档）"
          aria-label="退出对局"
          className="ui-icon-btn gap-1.5 px-2 md:px-3"
        >
          <IconArrowLeft />
          <span className="hidden md:inline text-xs font-bold tracking-[0.16em]">退出</span>
        </button>
      </div>

      {/* 左上身份目标条：对齐官方参考图左上角的「主×1 忠×1 反×2 内×1」与目标提示 */}
      <div className="hidden md:flex objective-strip absolute top-2 left-[150px] z-[225] items-center gap-2">
        <span className="objective-seats">
          {([
            [Identity.ZHUGONG, '主'],
            [Identity.ZHONGCHEN, '忠'],
            [Identity.FANZEI, '反'],
            [Identity.NEIJIAN, '内'],
          ] as [Identity, string][]).map(([id, short]) => {
            const n = [me, ...enemies].filter(p => p.identity === id).length;
            return n > 0 ? (
              <span key={id} className={`objective-chip is-${id}`}>{short}×{n}</span>
            ) : null;
          })}
        </span>
        <span className="objective-goal">
          {me.identity === Identity.ZHUGONG ? '目标：剿灭反贼与内奸' :
            me.identity === Identity.ZHONGCHEN ? '目标：护主，清除反贼' :
            me.identity === Identity.FANZEI ? '目标：击杀主公' :
            '目标：先清场，再与主公单挑'}
        </span>
      </div>

      {/* 手机端紧凑阶段指示：放在顶部控制区中间的空档，避免压住牌桌与战报 */}
      <div className="md:hidden absolute top-2 left-[156px] z-[230]">
        <div className="ui-panel relative overflow-hidden flex items-center gap-1.5 h-10 px-2.5 whitespace-nowrap">
          <span className={`text-[11px] font-bold font-ancient tracking-[0.12em] ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#6b4a1a]'}`}>
            {phase.replace('回合', '').replace('阶段', '')}
          </span>
          {decisionLeft !== null && (
            <span className={`text-[11px] font-bold tabular-nums ${decisionLeft <= 5 ? 'text-[#e0705f] animate-pulse' : theme === 'dark' ? 'text-[#c8a45c]' : 'text-[#8b6914]'}`}>
              {decisionLeft}s
            </span>
          )}
          {decisionLeft !== null && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
              <span
                className={`block h-full transition-[width] duration-200 ease-linear ${decisionLeft <= 5 ? 'bg-[#e0705f]' : 'bg-[#c8a45c]'}`}
                style={{ width: `${Math.max(0, Math.min(100, (decisionLeft / DECISION_SECONDS) * 100))}%` }}
              />
            </span>
          )}
        </div>
      </div>

      {/* 顶部工具栏：桌面端不占竖向高度，座位环绝对定位覆盖牌桌舞台 */}
      <div className="flex-none md:h-0 z-10 relative md:static">
        {/* 顶部装饰条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-700/50 to-transparent"></div>

        {/* 右上角控制组：帮助 / 速度 / 主题 / 静音 */}
        <div data-region="top-controls" className="absolute top-2 right-3 z-50 flex items-center gap-2">
          <button
            onClick={() => setShowRules(true)}
            className="ui-icon-btn font-bold"
            title="玩法说明与新手教学"
            aria-label="玩法说明与新手教学"
          >
            <span className="text-base leading-none">?</span>
          </button>
          <button
            onClick={() => setSpeedLevel(speedLevel === 1 ? 2 : speedLevel === 2 ? 3 : 1)}
            className="ui-icon-btn font-bold text-sm tracking-wider"
            title="切换游戏速度"
            aria-label={`切换游戏速度，当前 ${speedLevel} 倍`}
          >
            <IconBolt />
            <span className="tabular-nums">×{speedLevel}</span>
          </button>
          <button
            onClick={toggleTheme}
            className="ui-icon-btn game-settings-hide"
            title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
            aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
          >
            <ThemeIcon theme={theme} />
          </button>
          <button
            onClick={toggleMute}
            className="ui-icon-btn"
            title={isMuted ? '开启音乐' : '静音'}
            aria-label={isMuted ? '开启音乐' : '静音'}
          >
            <IconSpeaker muted={isMuted} />
          </button>
          <button
            onClick={toggleMotion}
            className="ui-icon-btn game-settings-hide"
            title={motionOn ? '关闭动效' : '开启动效'}
            aria-label={motionOn ? '关闭动效' : '开启动效'}
          >
            <IconMotion off={!motionOn} />
          </button>
        </div>

        {/* 环形座位：桌面端绝对定位环绕牌桌；手机端为顶部横向压缩小卡 */}
      <div data-region="seats" data-many={enemies.length >= 5 ? 'true' : 'false'} className={`relative w-full flex items-start justify-center gap-1 overflow-x-auto pt-[44px] pb-1 px-1 scrollbar-hide md:pt-0 md:pb-0 md:px-0 md:absolute md:top-0 md:left-0 md:right-0 md:h-[68vh] md:block md:overflow-visible`}>
          {enemies.map((p, index) => {
            // 官方参考布局骨架：敌人顶部横向平铺，超出部分放左右两侧；不再为椭圆压缩尺寸
            const totalEnemies = enemies.length;
            const sideCount = totalEnemies >= 4 ? 2 : 0;
            const topCount = totalEnemies - sideCount;
            const seatW = layoutDensity === 'roomy' ? (sizeTier === 'xl' ? 272 : 256)
              : layoutDensity === 'normal' ? 240
              : layoutDensity === 'compact' ? 210
              : layoutDensity === 'tight' ? 190 : 178;
            const side = index < topCount ? 'top' : (index === topCount ? 'left' : 'right');
            const offset = index - (topCount - 1) / 2;
            const leftPercent = side === 'top' ? `calc(50% + ${Math.round(offset * (seatW + 12))}px)` : '12px';
            // 选中【杀】类牌时，超出攻击范围的目标灰显
            const outOfRange = !p.isDead && isSelectingTarget && slashLikeActive && getDistance(me.id, p.id) > getAttackRange(me);
            // 正处于「选择目标」流程时，给合法目标一个明确的候选标记
            const selectableTarget = !p.isDead && (isSelectingTarget || isLijianMode || isJieyinMode
              || (isRendeMode && rendeSelectedCardIds.length > 0) || isJiedaoMode);
            
            return (
            <div 
              key={p.id} 
              className="ring-seat"
              data-side={side}
              style={{
                '--seat-left': leftPercent,
              } as React.CSSProperties}
            >
              {/* 回合指示器 - 朱红小匾 */}
              {turnIndex === p.id && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
                  <div className="bg-[#9e2b25] text-[#f7e7cf] text-[11px] px-3 py-0.5 rounded-full font-bold shadow-[0_2px_10px_rgba(158,43,37,0.5)] border border-[#c86b62]/70 whitespace-nowrap tracking-widest">
                    回合中
                  </div>
                </div>
              )}
              
              {/* 玩家卡牌容器 - 统一深墨描金；支持 Enter / Space 等价点击 */}
              <div
                role="button"
                tabIndex={0}
                aria-label={p.isDead ? `${p.hero.name}（已阵亡）` : `查看 ${p.hero.name} 的武将详情`}
                onClick={() => {
                  const selecting = isSelectingTarget || isLijianMode || isJieyinMode
                    || (isRendeMode && rendeSelectedCardIds.length > 0) || (isJiedaoMode && !p.isDead);
                  if (selecting) {
                    handleTargetClick(p.id);
                  } else if (!dyingState && !pendingReaction && !isProcessing) {
                    setInspectPlayerId(p.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  const selecting = isSelectingTarget || isLijianMode || isJieyinMode
                    || (isRendeMode && rendeSelectedCardIds.length > 0) || (isJiedaoMode && !p.isDead);
                  if (selecting) {
                    handleTargetClick(p.id);
                  } else if (!dyingState && !pendingReaction && !isProcessing) {
                    setInspectPlayerId(p.id);
                  }
                }}
                title={p.isDead ? `${p.hero.name}（已阵亡）` : `点击查看 ${p.hero.name} 的武将详情`}
                className={`
                seat-card relative rounded-xl border-2 kingdom-frame hero-card ${KINGDOM_CLASS[p.hero.kingdom] ?? ''}
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8cf94]
                ${damageAnimTarget === p.id || healAnimTarget === p.id
                  ? '' // 动画期间禁用过渡效果
                  : 'transition-[transform,box-shadow,border-color] duration-300'
                }
                ${p.isDead
                  ? 'bg-[#15110e]/95 border-[#4a3f33] opacity-55'
                  : 'bg-[#1c1611]/95 border-[#8b7355]/45'
                }
                ${turnIndex === p.id
                  ? 'border-[#c8a45c] shadow-[0_0_22px_rgba(200,164,92,0.30)] scale-105'
                  : ''
                }
                ${(isSelectingTarget || isLijianMode || (isRendeMode && rendeSelectedCardIds.length > 0) || isJiedaoMode) && !p.isDead
                  ? 'cursor-pointer hover:border-[#c86b62] hover:shadow-[0_0_18px_rgba(158,43,37,0.4)]'
                  : ''
                }
                ${isLijianMode && lijianSelectedTargets.includes(p.id)
                  ? 'ring-4 ring-red-500 scale-110'
                  : ''
                }
                ${selectedCardIds.length > 0 && (() => {
                  const card = me.hand.find(c => c.id === selectedCardIds[0]);
                  return card?.name === CardName.TIESUO && tiesuoSelectedTargets.includes(p.id);
                })()
                  ? 'ring-4 ring-amber-500 scale-110'
                  : ''
                }
                ${isRendeMode && rendeSelectedTarget === p.id
                  ? 'ring-4 ring-green-500 scale-110'
                  : ''
                }
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
                ${damageAnimTarget === p.id ? 'animate-damage-shake' : ''}
                ${healAnimTarget === p.id ? 'animate-heal-pulse' : ''}
                ${outOfRange ? 'opacity-40 saturate-[0.6]' : ''}
                ${selectableTarget && !outOfRange ? 'target-candidate' : ''}
              `}>
                {/* 合法目标候选标记：配合高亮描边，明确「可点」 */}
                {selectableTarget && !outOfRange && (
                  <span className="target-chip absolute -top-3 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap">
                    选择目标
                  </span>
                )}
                {/* 势力色顶条：魏蓝 / 蜀红 / 吴绿 / 群金 */}
                <span
                  className="absolute top-0 left-2 right-2 h-[2px] rounded-full opacity-80"
                  style={{ background: 'var(--k-main)' }}
                />

                {/* 伤害数字显示 */}
                {damageNumber && damageNumber.targetId === p.id && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="text-4xl font-bold text-red-500 animate-damage-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                      -{damageNumber.amount}
                    </div>
                  </div>
                )}

                {/* 治疗数字显示 */}
                {healNumber && healNumber.targetId === p.id && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="text-4xl font-bold text-green-500 animate-heal-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                      +{healNumber.amount}
                    </div>
                  </div>
                )}

                {/* 立绘铺满整张座位卡（官方对局座位牌构图）：信息改为浮层，立绘高度=卡高 */}
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

                  {/* 阵亡遮罩 */}
                  {p.isDead && (
                    <div className="seat-dead">
                      <span>阵亡</span>
                    </div>
                  )}

                  {/* 势力 + 身份：卡面左上 / 右上角章 */}
                  <div className="seat-topline">
                    <span className="seat-kingdom">{p.hero.kingdom}</span>
                    {(p.isRevealed || p.isHuman || p.identity === Identity.ZHUGONG) && (
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

                  {/* 左侧竖排：武将名 + 技能名（官方牌面把名字做在左边缘） */}
                  <div className="seat-name-rail">
                    <span className="seat-name">{p.hero.name}</span>
                    <span className="seat-skill">【{p.hero.skillName}】</span>
                  </div>
                </div>
                
                {/* 底部信息层：称号 / 体力数字 + 勾玉 / 手牌数 / 距离 / 装备四槽 / 判定区 */}
                <div className="seat-info">
                  <div className="seat-title" title={p.hero.description}>{p.hero.description}</div>
                  <div className="seat-hp-row" title={`体力 ${p.hp}/${p.maxHp}`}>
                    <span className="seat-hp-num tabular-nums">{p.hp}</span>
                    <span className="seat-hp-max">/{p.maxHp}</span>
                    <div className="seat-pips">
                      {Array.from({ length: p.maxHp }).map((_, i) => (
                        <span key={i} className={`seat-pip ${i < p.hp ? (p.hp === 1 ? 'is-low' : 'is-on') : ''}`} />
                      ))}
                    </div>
                  </div>

                  <div className="seat-meta-row">
                    <span className="seat-hand-count">手牌 <b className="tabular-nums">{p.hand.length}</b></span>
                    <span className="seat-distance">距 {getDistance(me.id, p.id)}</span>
                    {p.isDead && <span className="seat-dead-tag">阵亡</span>}
                  </div>

                  {/* 装备区：武器 / 防具 / +1 马 / -1 马 四槽常显，悬停显示全称 */}
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

                  {/* 判定区：乐 / 兵 / 电 / 链 逐张可见 */}
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
      </div>

      {/* Middle: Field - 原版三国杀风格 */}
      <div data-region="field" className="flex-1 relative flex items-center justify-center w-full">
        
        {/* Logs - 战况记录：可折叠侧栏（桌面端） */}
        <div data-region="log" className={`absolute left-2 hidden md:flex z-30 transition-[width] duration-200 ${logCollapsed ? 'log-collapsed w-10' : 'w-[340px]'}`}>
          {logCollapsed ? (
            <button
              onClick={() => setLogCollapsed(false)}
              className="log-panel w-full h-full flex flex-col items-center justify-center gap-2"
              aria-label="展开战况记录"
              title="展开战况记录"
            >
              <span className="text-[13px] tracking-[0.3em] text-[#d9c49a]" style={{ writingMode: 'vertical-rl' }}>战况记录</span>
              <span className="text-[13px] tabular-nums px-1.5 py-0.5 rounded bg-black/40 text-[#e8cf94] border border-[#8b7355]/40">{logs.length}</span>
            </button>
          ) : (
           <div className="log-panel h-full w-full flex flex-col overflow-hidden">
             {/* 标题栏 */}
             <div className="flex-none px-3 py-2 border-b border-[#8b7355]/25 bg-black/25">
               <div className="flex items-center gap-2">
                 <span className="w-[3px] h-4 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
                 <span className="text-[13px] font-bold tracking-[0.2em] text-[#d9c49a]">战况记录</span>
                 <span className="text-[13px] tabular-nums text-[#8f806a]">{logs.length}</span>
                 <button
                   onClick={() => setLogCollapsed(true)}
                   className="ml-auto text-[13px] px-1.5 py-0.5 rounded border border-[#8b7355]/50 text-[#d9c49a] hover:bg-white/10"
                   aria-label="收起战况记录"
                   title="收起战况记录"
                 >
                   收起 ‹
                 </button>
               </div>
             </div>
             {/* 可滚动日志内容 */}
             <div 
               ref={logsContainerRef}
               role="log"
               aria-live="polite"
               aria-label="战况记录"
               className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-transparent"
               onScroll={() => {
                 // 用户开始滚动
                 isUserScrollingRef.current = true;
                 
                 // 清除之前的定时器
                 if (scrollTimeoutRef.current) {
                   clearTimeout(scrollTimeoutRef.current);
                 }
                 
                 // 1秒后恢复自动滚动（减少延迟）
                 scrollTimeoutRef.current = setTimeout(() => {
                   isUserScrollingRef.current = false;
                   // 自动滚动到最新记录（只在容器内滚动）
                   if (logsContainerRef.current && logsEndRef.current) {
                     const container = logsContainerRef.current;
                     const target = logsEndRef.current;
                     container.scrollTo({
                       top: target.offsetTop - container.offsetTop,
                       behavior: 'smooth'
                     });
                   }
                 }, 1000);
               }}
               onMouseEnter={() => {
                 // 鼠标进入日志区域，标记为用户正在查看
                 isUserScrollingRef.current = true;
               }}
               onMouseLeave={() => {
                 // 鼠标离开日志区域，0.5秒后恢复自动滚动（更快恢复）
                 if (scrollTimeoutRef.current) {
                   clearTimeout(scrollTimeoutRef.current);
                 }
                 scrollTimeoutRef.current = setTimeout(() => {
                   isUserScrollingRef.current = false;
                   if (logsContainerRef.current && logsEndRef.current) {
                     const container = logsContainerRef.current;
                     const target = logsEndRef.current;
                     container.scrollTo({
                       top: target.offsetTop - container.offsetTop,
                       behavior: 'smooth'
                     });
                   }
                 }, 500);
               }}
             >
               {/* 只渲染最近 40 条：AI 高频写日志时避免整块重绘拖慢帧率 */}
               {logs.slice(-40).map(log => (
                  <div key={log.id} className={`
                    px-3 py-1.5 rounded-sm text-[13px] leading-relaxed font-serif
                    ${log.type === 'danger' ? 'bg-[#3a1512]/60 text-[#f0c8c2] border-l-2 border-[#c86b62]' : 
                      log.type === 'success' ? 'bg-[#2a2114]/60 text-[#f0e0b8] border-l-2 border-[#c8a45c]' : 
                      log.type === 'skill' ? 'bg-[#1c2a33]/60 text-[#cfe0ee] border-l-2 border-[#8fb4d9]' :
                      log.type === 'chat' ? 'bg-[#2a2414]/60 text-[#f0e8c8] border-l-2 border-[#c8a45c]' : 
                      log.type === 'warning' ? 'bg-[#33240f]/60 text-[#f0dcb8] border-l-2 border-[#c8963c]' : 
                      'bg-[#1f1914]/60 text-[#cdc2b0] border-l-2 border-[#6a5642]'}
                  `}>
                    {log.text}
                  </div>
                ))}
               <div ref={logsEndRef} />
             </div>
           </div>
          )}
        </div>

        {/* Mobile Toast Log */}
        <div className="md:hidden absolute top-0 left-0 right-0 p-2 pointer-events-none z-20 flex flex-col items-center">
           {logs.slice(-1).map(log => (
             <div key={log.id} className="bg-[#14100c]/90 text-[#f0e0c4] py-2 px-4 mb-1 rounded-lg border border-[#c8a45c]/45 text-xs shadow-[0_4px_18px_rgba(0,0,0,0.55)] w-full text-center backdrop-blur-sm">
               {log.text}
             </div>
           ))}
        </div>

        {/* Phase Indicator - 五阶段进度轨（底部居中，紧邻手牌条上方） */}
        <div className={`hidden md:flex ui-panel absolute left-1/2 -translate-x-1/2 top-[63%] px-5 py-2.5 z-30 flex-col items-center ${theme === 'dark' ? 'shadow-[0_6px_24px_rgba(0,0,0,0.55)]' : ''}`}>
          <div className={`text-[15px] mb-1.5 tracking-[0.2em] ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
            当前阶段 · <span className="text-[#e8cf94]">{getPlayer(turnIndex)?.hero.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {[GamePhase.START, GamePhase.DRAW, GamePhase.ACTION, GamePhase.DISCARD, GamePhase.END].map((ph, i) => {
              const phIndex = [GamePhase.START, GamePhase.DRAW, GamePhase.ACTION, GamePhase.DISCARD, GamePhase.END].indexOf(phase);
              const active = ph === phase;
              const passed = phIndex >= 0 && i < phIndex;
              const short = ph.replace('回合', '').replace('阶段', '');
              return (
                <div key={ph} className="flex items-center gap-1">
                  {i > 0 && <div className={`w-3 h-px ${passed || active ? (theme === 'dark' ? 'bg-yellow-600' : 'bg-[#8b6914]') : (theme === 'dark' ? 'bg-stone-600' : 'bg-[#d8d3ce]')}`}></div>}
                  <div className={`
                    px-2 py-1 rounded text-[15px] font-bold font-ancient transition-all duration-300
                    ${active
                      ? theme === 'dark'
                        ? 'bg-gradient-to-b from-yellow-500 to-yellow-700 text-white shadow-[0_0_10px_rgba(234,179,8,0.5)] scale-110'
                        : 'bg-gradient-to-b from-[#c9a86c] to-[#a08050] text-white shadow-[0_0_10px_rgba(184,149,106,0.5)] scale-110'
                      : passed
                        ? theme === 'dark' ? 'text-yellow-600/70' : 'text-[#8b6914]/70'
                        : theme === 'dark' ? 'text-stone-500' : 'text-[#b0aba5]'
                    }
                  `}>
                    {short}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 决策读秒：只在轮到自己出牌/弃牌且未托管时出现 */}
          {decisionLeft !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className={`flex-1 h-1 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`}>
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ease-linear ${decisionLeft <= 5 ? 'bg-[#e0705f]' : theme === 'dark' ? 'bg-[#d4af37]' : 'bg-[#a8842c]'}`}
                  style={{ width: `${Math.max(0, Math.min(100, (decisionLeft / DECISION_SECONDS) * 100))}%` }}
                />
              </div>
              <span className={`text-[14px] font-bold tabular-nums tracking-wider ${decisionLeft <= 5 ? 'text-[#e0705f] animate-pulse' : theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>
                {decisionLeft}s
              </span>
            </div>
          )}
        </div>

        {/* 中央牌桌：静态椭圆绒面，给牌堆与结算一个视觉落点 */}
        <div data-region="felt" className="table-felt z-0" aria-hidden="true" />
        {/* 桌面水印：极淡的「殺」字，补足中央留白但不抢牌堆 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0" aria-hidden="true">
          <span className={`font-ancient select-none leading-none text-[110px] md:text-[150px] ${theme === 'dark' ? 'text-[#c8a45c]/[0.045]' : 'text-[#8b6914]/[0.07]'}`}>殺</span>
        </div>

        {/* Center Decks - 牌堆和弃牌堆 - 原版三国杀风格 */}
        <div data-region="center-decks" className="relative flex items-center gap-12 max-md:gap-6 z-[1] transform scale-90 md:scale-100">
           {/* 弃牌堆（点击查看明细） */}
           <div className="relative group cursor-pointer" onClick={() => setShowDiscardViewer(true)} title="点击查看弃牌堆">
              <div className={`text-sm text-center mb-2 font-ancient tracking-wider transition-colors ${theme === 'dark' ? 'text-stone-400 group-hover:text-yellow-500' : 'text-[#5c5854] group-hover:text-[#8b6914]'}`}>弃牌堆</div>
              {discardPile.length > 0 ? (
                 <div className="relative">
                   {/* 压在下层的旧牌：给弃牌堆一点厚度 */}
                   {discardPile.length > 1 && (
                     <>
                       <div className="absolute top-[7px] left-[7px] w-full h-full rounded-lg bg-[#191410] border border-[#5a4a38]/40 rotate-2" />
                       <div className="absolute top-[3px] left-[3px] w-full h-full rounded-lg bg-[#221b16] border border-[#6a5642]/45 -rotate-1" />
                     </>
                   )}
                   <div className="relative transition-transform duration-200 group-hover:scale-105">
                     {/* 新牌入堆：从上方按下落定 */}
                     <div key={discardPile[discardPile.length - 1].id} className="discard-arrive">
                       <CardComponent card={discardPile[discardPile.length - 1]} disabled />
                     </div>
                   </div>
                   <div
                     key={`dc-${discardPile.length}`}
                     className="discard-count absolute -bottom-3 -right-3 bg-gradient-to-br from-stone-600 to-stone-800 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center border-2 border-stone-500 shadow-lg"
                   >
                     {discardPile.length}
                   </div>
                   {/* 查看提示 */}
                   <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
                     <span className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-400 text-xs font-bold bg-black/70 px-2 py-1 rounded">查看</span>
                   </div>
                 </div>
               ) : (
                 <div className={`w-24 h-36 rounded-lg flex items-center justify-center border border-dashed ${theme === 'dark' ? 'border-[#6a5642]/60 text-[#7d6d56] bg-black/30' : 'border-[#c4a77d]/60 text-[#a09585] bg-[#f5f0eb]/40'}`}>
                   <span className="font-ancient text-sm tracking-[0.2em] opacity-70">空</span>
                 </div>
               )}
           </div>
           
           {/* 牌堆 - 与卡牌牌背统一的黑漆描金风格 */}
           <div className="relative">
              <div className={`text-sm text-center mb-2 font-ancient tracking-wider ${theme === 'dark' ? 'text-stone-400' : 'text-[#5c5854]'}`}>牌堆</div>
              <div
                key={deckFx ? `${deckFx.kind}-${deckFx.id}` : 'deck'}
                className={`relative ${deckFx?.kind === 'tap' ? 'deck-tap' : ''} ${deckFx?.kind === 'shuffle' ? 'deck-shuffle' : ''}`}
              >
                {/* 堆叠厚度：随牌堆数量变化，抽得越少牌堆越薄 */}
                {Array.from({ length: deck.length > 80 ? 3 : deck.length > 40 ? 2 : deck.length > 8 ? 1 : 0 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-24 h-36 rounded-lg"
                    style={{
                      top: `${(i + 1) * 3}px`,
                      left: `${(i + 1) * 2}px`,
                      background: i % 2 === 0 ? '#221b16' : '#191410',
                      border: '1px solid rgba(106, 86, 66, 0.45)',
                      transform: `rotate(${i % 2 === 0 ? 1.4 : -0.9}deg)`,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    }}
                  />
                ))}

                {/* 主牌堆 */}
                <div
                  className="w-24 h-36 rounded-lg relative overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.55)] border-2 border-[#8b7355]/70"
                  style={{ background: 'linear-gradient(155deg, #2b2320 0%, #221b18 55%, #151110 100%)' }}
                >
                   {/* 云纹（内联 SVG，无外部请求） */}
                   <div className="absolute inset-0 opacity-25" style={{
                     backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 20 Q14 12 20 20 T32 20' stroke='%23c8a45c' stroke-width='0.8' fill='none'/%3E%3C/svg%3E")`,
                     backgroundSize: '40px 40px'
                   }}></div>

                   {/* 双层描金内框 */}
                   <div className="absolute inset-1.5 border border-[#c8a45c]/45 rounded"></div>
                   <div className="absolute inset-3 border border-[#c8a45c]/20 rounded-sm"></div>

                   {/* 中心朱印 */}
                   <div className="absolute inset-0 flex items-center justify-center">
                     <div
                       className="w-12 h-12 rounded-md flex items-center justify-center -rotate-3 border border-[#c8a45c]/60 shadow-lg"
                       style={{ background: 'linear-gradient(145deg, #9e2b25, #7a1f1a)' }}
                     >
                       <span className="font-ancient text-[#f3d9a4] text-2xl leading-none">殺</span>
                     </div>
                   </div>

                   <div className="absolute bottom-2 inset-x-0 text-center text-[8px] tracking-[0.28em] text-[#c8a45c]/45">
                     三国杀
                   </div>
                </div>

                {/* 牌堆数量（低于10张时朱红告警） */}
                <div className={`absolute -bottom-3 -right-3 w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-lg transition-colors font-bold text-sm ${
                  deck.length < 10
                    ? 'bg-[#9e2b25] border-red-400/70 text-[#f7e7cf] ring-2 ring-red-500/30 animate-pulse'
                    : 'bg-[#c8a45c] border-[#e0c07a]/80 text-[#2a1f14]'
                }`}>
                  {deck.length}
                </div>
              </div>

              {/* 洗切提示：弃牌堆洗回牌堆时的短暂说明 */}
              {deckFx?.kind === 'shuffle' && (
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap font-ancient text-[11px] tracking-[0.18em] text-[#f2dca5] bg-black/75 border border-[#c8a45c]/40 px-2 py-0.5 rounded deck-fade">
                  洗切中…
                </div>
              )}
           </div>
        </div>

        {/* Advice Modal */}
        {advice && (
          <div className="absolute right-4 top-10 w-72 modal-frame p-4 z-30">
             <div className="flex items-center gap-2 mb-3 border-b border-[#8b7355]/35 pb-2">
                <span className="w-[3px] h-6 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
                <div className="modal-title font-ancient text-2xl">孔明锦囊</div>
             </div>
             <p className="text-sm modal-text leading-relaxed italic tracking-wide">"{advice}"</p>
             <button onClick={() => setAdvice(null)} className="btn-ink mt-4 w-full text-sm py-2 rounded-lg">收起</button>
          </div>
        )}
      </div>

      {/* Bottom: Player Controls & Hand - 原版三国杀风格 */}
      <div data-region="bottom" className={`bottom-bar flex-none z-20 pb-2 pt-3 relative ${theme === 'dark' ? 'bg-gradient-to-t from-[#050505] via-[#0f0f0f] to-transparent' : 'bg-gradient-to-t from-[#f5f0eb]/60 via-transparent to-transparent'}`}>
        {/* 底部装饰线 */}
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${theme === 'dark' ? 'via-yellow-700/30' : 'via-[#c4a77d]/30'} to-transparent`}></div>
        
        {/* 玩家信息栏：自己固定牌桌下首（左侧），操作区靠右下 */}
        <div data-region="player-info" className="player-info-row flex flex-col md:flex-row md:justify-between md:items-start gap-1 md:gap-6 px-2 md:px-4 mb-1 md:mb-2">
          {/* 主视角座位：立绘 + 信息合成一张大卡，官方参考里固定在右下角 */}
          <div className={`own-seat flex items-center gap-2 kingdom-frame ${KINGDOM_CLASS[me.hero.kingdom] ?? ''}`}>
            <div className="relative">
              {/* 玩家头像卡片 */}
              <div className={`
                relative p-2 rounded-xl border-2 kingdom-frame hero-card ${KINGDOM_CLASS[me.hero.kingdom] ?? ''}
                ${damageAnimTarget === 0 || healAnimTarget === 0
                  ? '' // 动画期间禁用过渡效果
                  : 'transition-[transform,box-shadow,border-color] duration-300'
                }
                ${me.isDead 
                  ? theme === 'dark' ? 'bg-[#15110e]/95 border-[#4a3f33] opacity-55' : 'bg-[#e8e0d5]/90 border-[#c4b8a8] opacity-55'
                  : theme === 'dark' 
                    ? 'bg-[#1c1611]/95 border-[#8b7355]/45'
                    : 'bg-[#fbf8f2]/95 border-[#c4a77d]/60 shadow-lg'
                }
                ${isMyTurn 
                  ? theme === 'dark'
                    ? 'border-[#c8a45c] shadow-[0_0_22px_rgba(200,164,92,0.35)] scale-105'
                    : 'border-[#b8955c] shadow-[0_0_18px_rgba(184,149,92,0.30)] scale-105'
                  : ''
                }
                ${damageAnimTarget === 0 ? 'animate-damage-shake' : ''}
                ${healAnimTarget === 0 ? 'animate-heal-pulse' : ''}
              `}>
                {/* 势力色顶条 */}
                <span
                  className="absolute top-0 left-2 right-2 h-[2px] rounded-full opacity-80"
                  style={{ background: 'var(--k-main)' }}
                />

                {/* 伤害数字显示 */}
                {damageNumber && damageNumber.targetId === 0 && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="text-5xl font-bold text-red-500 animate-damage-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                      -{damageNumber.amount}
                    </div>
                  </div>
                )}

                {/* 治疗数字显示 */}
                {healNumber && healNumber.targetId === 0 && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="text-5xl font-bold text-green-500 animate-heal-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                      +{healNumber.amount}
                    </div>
                  </div>
                )}

                {/* 武将头像区域 */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 ${me.hero.name} 的武将详情`}
                  onClick={() => { if (!dyingState && !pendingReaction) setInspectPlayerId(me.id); }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (!dyingState && !pendingReaction) setInspectPlayerId(me.id);
                  }}
                  title={`点击查看 ${me.hero.name} 的武将详情`}
                  className={`player-avatar relative cursor-pointer ${
                  healAnimTarget === 0 ? 'animate-heal-glow' :
                  damageAnimTarget === 0 ? 'animate-damage-glow' : ''
                } ${skillGlowId === 0 ? 'skill-glow' : ''} ${aiThinkingId === 0 ? 'ai-thinking' : ''}`}>
                  {/* 描金外框（统一色调） */}
                  <div className="absolute -inset-1 rounded-lg bg-gradient-to-br from-[#c8a45c]/45 via-[#8b7355]/25 to-[#5a4a38]/15"></div>
                  
                  {/* 头像 */}
                  <div className="relative w-full h-full rounded-lg overflow-hidden border border-[#c8a45c]/55 hero-portrait">
                    <img 
                      src={me.hero.avatarUrl} 
                      alt={me.hero.name} 
                      loading="eager"
                      decoding="async"
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#241b14"/><text x="128" y="158" font-size="96" fill="#c8a45c" text-anchor="middle" font-family="serif">${me.hero.name}</text></svg>`)}`;
                      }}
                    />
                    
                    {/* 阵亡遮罩 */}
                    {me.isDead && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                        <span className="font-ancient text-[#c86b62] text-xl font-bold transform -rotate-12 border border-[#9e2b25] px-2 py-1">
                          阵亡
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* 势力标识：深墨圆环 + 势力色字 */}
                  <div className={`
                    absolute -top-2 -left-2 w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold border shadow-md
                    bg-[#1a1512] border-[#c8a45c]/50
                    ${me.hero.kingdom === '魏' ? 'text-[#8fb4d9]' :
                      me.hero.kingdom === '蜀' ? 'text-[#d98a8a]' :
                      me.hero.kingdom === '吴' ? 'text-[#8fc39a]' :
                      'text-[#bfae94]'
                    }
                  `}>
                    {me.hero.kingdom}
                  </div>
                  
                  {/* 身份标识：朱印方章 */}
                  <div data-tour="identity" className={`
                    absolute -bottom-2 -right-2 w-7 h-7 flex items-center justify-center rounded-[4px] rotate-3 font-bold text-[11px] border shadow-md
                    ${me.identity === Identity.ZHUGONG ? 'bg-[#c8a45c] border-[#e8cf94] text-[#2a1f14]' :
                      me.identity === Identity.ZHONGCHEN ? 'bg-[#8a5a20] border-[#c8a45c]/70 text-[#f7e7cf]' :
                      me.identity === Identity.FANZEI ? 'bg-[#9e2b25] border-[#c86b62] text-[#f7e7cf]' :
                      'bg-[#3a3a4a] border-[#7a7a96] text-[#e8e8f0]'
                    }
                  `}>
                    {me.identity === Identity.ZHUGONG ? '主' :
                      me.identity === Identity.ZHONGCHEN ? '忠' :
                      me.identity === Identity.FANZEI ? '反' : '内'
                    }
                  </div>
                </div>
                
                {/* 回合指示器 */}
                {isMyTurn && (
                  <div data-tour="turn" className="absolute -top-4 left-1/2 -translate-x-1/2 z-30">
                    <div className="bg-[#9e2b25] text-[#f7e7cf] text-[11px] px-4 py-0.5 rounded-full font-bold shadow-[0_2px_12px_rgba(158,43,37,0.55)] border border-[#c86b62]/70 whitespace-nowrap tracking-widest">
                      我的回合
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* 玩家详细信息面板 */}
            <div className="player-info-panel ui-panel px-4 py-3 w-[280px] md:w-[320px]">
              <div className={`own-name font-ancient mb-1 ${theme === 'dark' ? 'text-[#e8dcc8]' : 'text-[#3a332a]'}`}>{me.hero.name}</div>
              
              {/* 体力值 - 数字 + 朱红勾玉（与官方牌面一致，数字优先可读） */}
              <div className="own-hp-row" title={`体力 ${me.hp}/${me.maxHp}`}>
                <span className="own-hp-num tabular-nums">{me.hp}</span>
                <span className="own-hp-max">/{me.maxHp}</span>
                <div className="flex gap-1">
                  {Array.from({ length: me.maxHp }).map((_, i) => (
                    <div 
                      key={i}
                      className={`
                        w-4 h-4 hp-fish
                        ${i < me.hp 
                          ? (me.hp === 1 ? 'hp-fish-low' : '')
                          : 'hp-fish-empty'
                        }
                      `}
                    />
                  ))}
                </div>
              </div>
              
              {/* 状态标志 */}
              {(me.isChained || me.isLeBuSiShu || me.isBingLiangCunDuan || me.isShandian) && (
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs ${theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}`}>状态</span>
                  <div className="flex gap-1.5">
                    {me.isChained && (
                      <div className="px-2 py-0.5 rounded-[4px] bg-[#6a4f22] border border-[#c8a45c]/60 text-[#f0d9a8] text-[11px] font-bold" title="铁索连环">
                        链
                      </div>
                    )}
                    {me.isLeBuSiShu && (
                      <div className="px-2 py-0.5 rounded-[4px] bg-[#5a3350] border border-[#b07aa0]/50 text-[#f0d0e8] text-[11px] font-bold" title="乐不思蜀">
                        乐
                      </div>
                    )}
                    {me.isBingLiangCunDuan && (
                      <div className="px-2 py-0.5 rounded-[4px] bg-[#2b4353] border border-[#6a9ab0]/50 text-[#cfe8f0] text-[11px] font-bold" title="兵粮寸断">
                        兵
                      </div>
                    )}
                    {me.isShandian && (
                      <div className="px-2 py-0.5 rounded-[4px] bg-[#4a3560] border border-[#a97fd0]/60 text-[#eadcfa] text-[11px] font-bold animate-pulse" title="闪电悬顶">
                        电
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* 手牌和技能信息 */}
              <div className="own-meta-row flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className={theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}>手牌</span>
                  <span className="own-hand text-[#e8cf94] font-bold tabular-nums">{me.hand.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={theme === 'dark' ? 'text-[#8f806a]' : 'text-[#8a7a60]'}>技能</span>
                  <span className={`font-bold ${theme === 'dark' ? 'text-[#d9c49a]' : 'text-[#6b4a1a]'}`}>{me.hero.skillName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={theme === 'dark' ? 'text-[#8f806a]' : 'text-[#8a7a60]'}>范围</span>
                  <span className={`font-bold ${theme === 'dark' ? 'text-[#9fcfae]' : 'text-[#3f7d55]'}`}>{getAttackRange(me)}</span>
                </div>
              </div>

              {/* 我的装备区：武器 / 防具 / +1 马 / -1 马 四槽，悬停显示全称与效果 */}
              <div data-tour="equipment" className="own-equip">
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
                    className={`own-equip-slot ${slot.item ? 'is-on' : ''}`}
                  >
                    {slot.label}
                    {slot.item && <i className="seat-equip-dot" />}
                  </span>
                ))}
              </div>
            </div>
          </div>
            
            {/* Control Buttons - 操作按钮：托管已统一放在左上角，避免重复入口 */}
            <div data-tour="action-bar" className="action-bar flex flex-wrap gap-2 md:gap-3 items-center relative z-40">
              <div className="ui-panel flex flex-wrap items-center gap-2 p-2">
                {/* Action Buttons */}
                {isMyTurn && phase === GamePhase.ACTION && !isAiTakeover && (
                  <>
                    {/* Play Button - Only for non-target cards */}
                    {selectedCardIds.length > 0 && (
                      <>                         
                        {(() => {
                          const me = players.find(p => p.isHuman) || players[0];
                          const card = me.hand.find(c => c.id === selectedCardIds[0]);
                          if (!card) return null;
                            
                          // 检查是否为非目标卡牌（不包括无懈可击）
                          const isNonTargetCard = [CardName.WUZHONG, CardName.TAO, CardName.NANMAN, CardName.WANJIAN, CardName.JIU, CardName.WUGU, CardName.TAOYUAN, CardName.SHANDIAN].includes(card.name);
                          // 铁索连环需要选择目标后才能出牌
                          const isTiesuo = card.name === CardName.TIESUO;
                            
                          // 对非目标卡牌或已选目标的铁索连环显示出牌按钮
                          if (isNonTargetCard) {
                            return (
                              <button 
                                onClick={handleConfirmPlay}
                                disabled={!!dyingState || !!isProcessing}
                                className={`btn-gold px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.14em] ${!!dyingState || !!isProcessing ? 'opacity-45 cursor-not-allowed' : ''}`}
                              >
                                出 牌
                              </button>
                            );
                          }
                          
                          // 借刀杀人特殊处理：选择了两个目标后才显示出牌按钮
                          const isJiedao = card.name === CardName.JIEDAO;
                          if (isJiedao && jiedaoWeaponTarget && jiedaoVictimTarget) {
                            const weaponPlayer = players.find(p => p.id === jiedaoWeaponTarget);
                            const victimPlayer = players.find(p => p.id === jiedaoVictimTarget);
                            return (
                              <button 
                                onClick={handleConfirmPlay}
                                disabled={!!dyingState || !!isProcessing}
                                className={`btn-gold px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.14em] ${!!dyingState || !!isProcessing ? 'opacity-45 cursor-not-allowed' : ''}`}
                              >
                                出牌 ({weaponPlayer?.hero.name}→{victimPlayer?.hero.name})
                              </button>
                            );
                          }
                          
                          // 铁索连环特殊处理：选择了目标后才显示出牌按钮
                          if (isTiesuo && tiesuoSelectedTargets.length > 0) {
                            return (
                              <button 
                                onClick={handleConfirmPlay}
                                disabled={!!dyingState || !!isProcessing}
                                className={`btn-gold px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.14em] ${!!dyingState || !!isProcessing ? 'opacity-45 cursor-not-allowed' : ''}`}
                              >
                                出 牌 ({tiesuoSelectedTargets.length}/2)
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}
                       
                    {/* Liu Bei's Rende Skill Button */}
                    {players[0].hero.name === '刘备' && !isRendeMode && (
                      <button 
                        onClick={() => {
                          setIsRendeMode(true);
                          setRendeSelectedCardIds([]);
                          setRendeSelectedTarget(null);
                          setSelectedCardIds([]);
                          setIsSelectingTarget(false);
                          addLog(`请选择要给出的牌（刘备「仁德」技能）...`, 'info');
                        }}
                        className="skill-btn text-base"
                      >
                        仁德
                      </button>
                    )}
                    
                    {/* Rende Confirm Button */}
                    {isRendeMode && rendeSelectedCardIds.length > 0 && rendeSelectedTarget !== null && (
                      <button 
                        onClick={() => {
                          const me = players.find(p => p.isHuman) || players[0];
                          const target = getPlayer(rendeSelectedTarget);
                          const cardsToGive = me.hand.filter(card => rendeSelectedCardIds.includes(card.id));
                          
                          if (target && cardsToGive.length > 0) {
                            // 将牌从自己的手牌移除
                            setPlayers(prev => {
                              const updated = prev.map(p => {
                                if (p.id === me.id) {
                                  return { ...p, hand: p.hand.filter(c => !rendeSelectedCardIds.includes(c.id)) };
                                }
                                if (p.id === rendeSelectedTarget) {
                                  return { ...p, hand: [...p.hand, ...cardsToGive] };
                                }
                                return p;
                              });
                              playersRef.current = updated;
                              return updated;
                            });
                            
                            addLog(`${me.hero.name} 使用技能「仁德」，将 ${cardsToGive.length} 张牌交给了 ${target.hero.name}！`, 'skill');
                            showSkillBanner(me.hero.name, '仁德');

                            // 如果给出了2张或更多牌，回复1点体力
                            if (cardsToGive.length >= 2 && me.hp < me.maxHp) {
                              // 触发治疗动画
                              setHealAnimTarget(me.id);
                              setHealNumber({ targetId: me.id, amount: 1, id: Date.now().toString() });
                              setTimeout(() => setHealAnimTarget(null), 600);
                              setTimeout(() => setHealNumber(null), 1000);

                              updatePlayer(me.id, { hp: me.hp + 1 });
                              addLog(`${me.hero.name} 使用「仁德」给出了${cardsToGive.length}张牌，回复1点体力！`, 'skill');
                            }
                          }
                          
                          // 退出仁德模式
                          setIsRendeMode(false);
                          setRendeSelectedCardIds([]);
                          setRendeSelectedTarget(null);
                          setSelectedCardIds([]);
                        }}
                        className="skill-btn text-base"
                      >
                        确认给出
                      </button>
                    )}
                    
                    {/* Rende Cancel Button */}
                    {isRendeMode && (
                      <button 
                        onClick={() => {
                          setIsRendeMode(false);
                          setRendeSelectedCardIds([]);
                          setRendeSelectedTarget(null);
                          setSelectedCardIds([]);
                          addLog(`取消了「仁德」技能`, 'info');
                        }}
                        className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                      >
                        取消仁德
                      </button>
                    )}
                    
                    {/* 张星彩「枪舞」：出牌阶段限一次判定 */}
                    {players[0].hero.name === '张星彩' && !hasUsedQiangwu && (
                      <button
                        onClick={() => { void activateQiangwu(); }}
                        className="skill-btn text-base"
                        title="出牌阶段限一次：判定后，点数小于判定结果的【杀】无距离限制，点数大于判定结果的【杀】不计次数"
                      >
                        枪舞
                      </button>
                    )}
                    {players[0].hero.name === '张星彩' && qiangwuPoint !== null && (
                      <span className="px-2 py-1 rounded border border-[#d4af37]/50 text-[#f0d38a] text-sm font-ancient whitespace-nowrap">
                        枪舞 · 判定 {qiangwuPoint}
                      </span>
                    )}

                    {/* Sun Quan's Zhiheng Skill Button */}
                    {players[0].hero.name === '孙权' && !isZhihengMode && !hasUsedZhiheng && (
                      <button 
                        onClick={() => {
                          setIsZhihengMode(true);
                          setSelectedCardIds([]);
                          setIsSelectingTarget(false);
                          addLog(`请选择要弃置的牌（孙权「制衡」技能）...`, 'info');
                        }}
                        className="skill-btn text-base"
                      >
                        制衡
                      </button>
                    )}
                       
                       {/* Zhiheng Confirm Button */}
                       {isZhihengMode && (
                         <button 
                           onClick={() => {
                             // 执行制衡技能
                             const me = players.find(p => p.isHuman) || players[0];
                             const cardsToDiscard = me.hand.filter(card => selectedCardIds.includes(card.id));
                             if (cardsToDiscard.length > 0) {
                               // 弃置选中的牌
                               discardCards(me.id, cardsToDiscard);
                               // 摸等量的牌
                               drawCards(me.id, cardsToDiscard.length);
                               addLog(`${me.hero.name} 使用技能「制衡」，弃置了 ${cardsToDiscard.length} 张牌，摸了 ${cardsToDiscard.length} 张牌！`, 'skill');
                               showSkillBanner(me.hero.name, '制衡');
                               setHasUsedZhiheng(true); // 标记制衡技能已使用
                             }
                             // 退出制衡模式并重置所有相关状态
                             setIsZhihengMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                           }}
                           className="skill-btn text-base"
                         >
                           确认制衡
                         </button>
                       )}
                       
                       {/* Zhiheng Cancel Button */}
                       {isZhihengMode && (
                         <button 
                           onClick={() => {
                             setIsZhihengMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog(`取消了「制衡」技能`, 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消制衡
                         </button>
                       )}
                       
                       {/* Sun Shangxiang's Jieyin Skill Button */}
                       {players[0].hero.name === '孙尚香' && !isJieyinMode && !hasUsedJieyin && players[0].hand.length >= 2 && (
                         <button
                           onClick={() => {
                             setIsJieyinMode(true);
                             setJieyinTarget(null);
                             addLog('请选择一名已受伤的男性角色（孙尚香「结姻」）...', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           结姻
                         </button>
                       )}

                       {isJieyinMode && (
                         <button
                           onClick={() => {
                             setIsJieyinMode(false);
                             setJieyinTarget(null);
                             addLog('取消了「结姻」技能', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消结姻
                         </button>
                       )}

                       {/* 甘宁「奇袭」技能按钮 */}
                       {players[0].hero.name === '甘宁' && !isQixiMode && (
                         <button
                           onClick={() => {
                             setIsQixiMode(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('请选择一张黑色牌（甘宁「奇袭」）...', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           奇袭
                         </button>
                       )}

                       {isQixiMode && (
                         <button
                           onClick={() => {
                             setIsQixiMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('取消了「奇袭」技能', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消奇袭
                         </button>
                       )}

                       {/* 丈八蛇矛：两张手牌当【杀】 */}
                       {players[0].equipment?.weapon?.name === CardName.ZHANGBA && !isZhangbaMode && !zhangbaPending
                         && players[0].hand.length >= 2 && (
                         <button
                           onClick={() => {
                             setIsZhangbaMode(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('【丈八蛇矛】：请选择两张手牌当【杀】使用', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           丈八蛇矛
                         </button>
                       )}
                       {isZhangbaMode && (
                         <>
                           <button
                             disabled={selectedCardIds.length !== 2}
                             onClick={() => {
                               const meZ = players.find(p => p.isHuman) || players[0];
                               const picked = meZ.hand.filter(c => selectedCardIds.includes(c.id));
                               if (picked.length !== 2) {
                                 addLog('请选择两张手牌', 'warning');
                                 return;
                               }
                               setZhangbaPending(picked);
                               setIsZhangbaMode(false);
                               setIsSelectingTarget(true);
                               setSelectedCardIds([]);
                               setActiveSelectedId(null);
                               addLog('请选择【杀】的目标', 'info');
                             }}
                             className={`px-4 py-2 rounded-lg font-ancient text-base border-2 ${selectedCardIds.length === 2
                               ? 'bg-[#9e2b25] text-[#f7e7cf] border-[#c86b62] hover:bg-[#b0322b]'
                               : 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed'}`}
                           >
                             当【杀】使用
                           </button>
                           <button
                             onClick={() => {
                               setIsZhangbaMode(false);
                               setSelectedCardIds([]);
                               setActiveSelectedId(null);
                               setIsSelectingTarget(false);
                               addLog('取消了「丈八蛇矛」', 'info');
                             }}
                             className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                           >
                             取消
                           </button>
                         </>
                       )}

                       {/* 周瑜「反间」 */}
                       {players[0].hero.name === '周瑜' && !isFanjianMode && !hasUsedFanjian && (
                         <button
                           onClick={() => {
                             setIsFanjianMode(true);
                             setIsSelectingTarget(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('「反间」：请选择一名其他角色', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           反间
                         </button>
                       )}
                       {isFanjianMode && (
                         <button
                           onClick={() => {
                             setIsFanjianMode(false);
                             setIsSelectingTarget(false);
                             setSelectedCardIds([]);
                             addLog('取消了「反间」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消反间
                         </button>
                       )}

                       {/* 大乔「国色」 */}
                       {players[0].hero.name === '大乔' && !isGuoseMode && (
                         <button
                           onClick={() => {
                             setIsGuoseMode(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('「国色」：请选择一张方块牌', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           国色
                         </button>
                       )}
                       {isGuoseMode && (
                         <button
                           onClick={() => {
                             setIsGuoseMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('取消了「国色」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消国色
                         </button>
                       )}

                       {/* 华佗「青囊」 */}
                       {players[0].hero.name === '华佗' && !isQingnangMode && !hasUsedQingnang
                         && players[0].hand.length > 0 && (
                         <button
                           onClick={() => {
                             setIsQingnangMode(true);
                             setQingnangCardId(null);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('「青囊」：请选择一张手牌作为代价', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           青囊
                         </button>
                       )}
                       {isQingnangMode && (
                         <button
                           onClick={() => {
                             setIsQingnangMode(false);
                             setQingnangCardId(null);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('取消了「青囊」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消青囊
                         </button>
                       )}

                       {/* 步练师「安恤」 */}
                       {players[0].hero.name === '步练师' && !isAnxuMode && !hasUsedAnxu
                         && players.filter(p => !p.isDead && !p.isHuman).length >= 2 && (
                         <button
                           onClick={() => {
                             setIsAnxuMode(true);
                             setAnxuTargets([]);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(true);
                             addLog('「安恤」：请选择两名手牌数不同的其他角色', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           安恤
                         </button>
                       )}
                       {isAnxuMode && (
                         <button
                           onClick={() => {
                             setIsAnxuMode(false);
                             setAnxuTargets([]);
                             setIsSelectingTarget(false);
                             addLog('取消了「安恤」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消安恤
                         </button>
                       )}

                       {/* 黄盖「苦肉」 */}
                       {players[0].hero.name === '黄盖' && players[0].hp > 1 && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveKurou(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           苦肉
                         </button>
                       )}

                       {/* Diaochan's Lijian Skill Button */}
                       {players[0].hero.name === '貂蝉' && !isLijianMode && !hasUsedLijian && (
                         <button 
                           onClick={() => {
                             setIsLijianMode(true);
                             setLijianSelectedCardId(null);
                             setLijianSelectedTargets([]);
                             addLog(`请选择要弃置的牌（貂蝉「离间」技能）...`, 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           离间
                         </button>
                       )}
                       
                       {/* Lijian Confirm Button */}
                       {isLijianMode && lijianSelectedCardId && (
                         <button 
                           onClick={async () => {
                             if (lijianSelectedTargets.length !== 2) {
                               addLog(`请选择2名男性角色进行决斗`, 'warning');
                               return;
                             }
                             
                             const me = players.find(p => p.isHuman) || players[0];
                             const card = me.hand.find(c => c.id === lijianSelectedCardId);
                             
                             if (card) {
                               setIsProcessing(p => p + 1);
                               try {
                                 // 弃置选中的牌
                                 discardCards(me.id, [card]);
                                 addLog(`${me.hero.name} 弃置了【${card.name}】，发动「离间」技能！`, 'skill');
                                 showSkillBanner(me.hero.name, '离间');
                                 
                                 // 获取两个目标
                                 const target1 = getPlayer(lijianSelectedTargets[0]);
                                 const target2 = getPlayer(lijianSelectedTargets[1]);
                                 
                                 if (target1 && target2) {
                                   addLog(`离间目标：【${target1.hero.name}】 vs 【${target2.hero.name}】`, 'info');
                                   addLog(`${target1.hero.name} 与 ${target2.hero.name} 开始决斗！`, 'danger');
                                   
                                   // 执行决斗逻辑 - 使用专门的决斗执行函数
                                   await executeDuel(target1.id, target2.id);
                                 }
                                 
                                 setHasUsedLijian(true);
                               } finally {
                                 setIsProcessing(p => Math.max(0, p - 1));
                               }
                             }
                             
                             // 退出离间模式并重置所有相关状态
                             setIsLijianMode(false);
                             setLijianSelectedCardId(null);
                             setLijianSelectedTargets([]);
                           }}
                           disabled={lijianSelectedTargets.length !== 2 || !!dyingState || !!isProcessing}
                           className={`bg-[#33212a] hover:bg-[#402a34] text-[#f0d0e0] px-5 py-2 rounded-lg border border-[#a9737f]/70 hover:border-[#d98a8a] hover:text-white transition-colors font-ancient text-base shadow-lg
                             ${lijianSelectedTargets.length !== 2 || dyingState || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                           确认离间
                         </button>
                       )}
                       
                       {/* Lijian Cancel Button */}
                       {isLijianMode && (
                         <button 
                           onClick={() => {
                             setIsLijianMode(false);
                             setLijianSelectedCardId(null);
                             setLijianSelectedTargets([]);
                             addLog(`取消了「离间」技能`, 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消离间
                         </button>
                       )}
                       
                       {/* End Turn - 结束回合按钮 */}
                      <button 
                        data-tour="end-turn"
                        onClick={endTurn}
                        disabled={!!dyingState || isProcessing}
                        className={`btn-ink px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.1em] border
                          ${(dyingState || isProcessing) ? 'opacity-45 cursor-not-allowed' : ''}
                        `}
                      >
                        结束回合
                      </button>
                    </>
                  )}
                </div>

                {/* Discard Button - 弃牌阶段（附「需弃置 N 张」提示，避免不知道点几张） */}
                {isMyTurn && phase === GamePhase.DISCARD && !isAiTakeover && (() => {
                  const excess = me.hand.length - me.hp;
                  const picked = selectedCardIds.length;
                  const exact = excess === picked && excess > 0;
                  const over = picked > excess;
                  return (
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold tabular-nums tracking-wide ${over ? 'text-[#e0705f]' : exact ? 'text-[#e8cf94]' : theme === 'dark' ? 'text-stone-400' : 'text-[#6b6459]'}`}>
                        需弃置 {Math.max(0, excess)} 张 · 已选 {picked} 张
                      </span>
                      <button
                        onClick={handleDiscardConfirm}
                        disabled={!!dyingState || isProcessing || !exact}
                        className={`
                          px-8 py-2.5 rounded-lg text-xl font-ancient tracking-[0.14em] border
                          ${exact && !dyingState && !isProcessing
                            ? 'btn-gold'
                            : 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed'}
                        `}
                      >
                        弃 牌
                      </button>
                    </div>
                  );
                })()}
                
                {/* Cancel Selection - 取消选择按钮 */}
                {(isSelectingTarget || (isMyTurn && phase === GamePhase.ACTION && selectedCardIds.length > 0)) && (
                  <button 
                    onClick={() => { if (!dyingState && !isProcessing) { setSelectedCardIds([]); setActiveSelectedId(null); setIsSelectingTarget(false); } }}
                    disabled={!!dyingState || isProcessing}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors border
                      ${(dyingState || isProcessing) 
                        ? 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed opacity-50' 
                        : 'bg-[#221b16] text-[#c8bda8] border-[#6a5642] hover:border-[#c8a45c] hover:text-[#e8cf94]'}
                    `}
                  >
                    取消选择
                  </button>
                )}

                <button
                  onClick={handleAskStrategy}
                  disabled={me.isDead || !!dyingState || isProcessing}
                  className={`btn-ink px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 ${(dyingState || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <IconBook />
                  问计
                </button>
            </div>
         </div>

         {/* Hand Cards Area - 手牌区域
             内层 w-max + mx-auto：牌少时居中，牌多时从左侧完整展示并可横向滚动，
             避免 justify-center 在内容超宽时把最左边一张裁掉 */}
         <div data-region="hand" className={`w-full overflow-x-auto overflow-y-visible px-2 sm:px-4 pb-1 scrollbar-hide flex relative ${compactHand ? 'pt-3' : 'pt-4 sm:pt-5'}`} style={{ zIndex: 10, minHeight: 'var(--hand-min)' }}>
           {/* 手牌背景 - 白天模式移除遮罩 */}
           {theme === 'dark' && (
             <div className="absolute inset-x-4 bottom-0 h-32 rounded-t-2xl pointer-events-none bg-gradient-to-t from-[#0c0906]/85 to-transparent"></div>
           )}
           <div className="hand-tray" aria-hidden="true" />
           {/* 左下角标：手牌数 + 弃牌堆（可查看，含张数） */}
           <div className="absolute left-3 bottom-3 hidden md:flex items-center gap-3 z-20">
             <div className="flex items-center gap-1.5 pointer-events-none">
               <span className={`text-[10px] tracking-[0.28em] ${theme === 'dark' ? 'text-[#8f806a]' : 'text-[#9a8a70]'}`}>手牌</span>
               <span className={`font-ancient text-lg leading-none ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>{me.hand.length}</span>
             </div>
             <button
               onClick={() => setShowDiscardViewer(true)}
               disabled={!!dyingState || isProcessing}
               className={`pointer-events-auto inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border text-[10px] leading-none transition-colors ${
                 theme === 'dark'
                   ? 'bg-[#14100c]/80 border-[#8b7355]/45 text-[#c8bda8] hover:border-[#c8a45c] hover:text-[#e8cf94]'
                   : 'bg-white/60 border-[#c4b8a8]/70 text-[#6b5a42] hover:border-[#a8842c]'
               }`}
               aria-label={`查看弃牌堆，共 ${discardPile.length} 张`}
               title="查看弃牌堆"
             >
               <span className="opacity-70">弃牌堆</span>
               <span className="font-bold tabular-nums text-[#e8cf94]">{discardPile.length}</span>
             </button>
           </div>

           {/* 右下角标：牌堆剩余张数 */}
           <div className="absolute right-3 bottom-3 hidden md:flex items-center gap-2 z-20">
             <div
               className={`inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border text-[10px] leading-none ${
                 theme === 'dark' ? 'bg-[#14100c]/80 border-[#8b7355]/45 text-[#c8bda8]' : 'bg-white/60 border-[#c4b8a8]/70 text-[#6b5a42]'
               }`}
               title="牌堆剩余张数"
             >
               <span className="opacity-70">牌堆</span>
               <span className="font-bold tabular-nums text-[#e8cf94]">{deck.length}</span>
             </div>
           </div>

           <div className="flex -space-x-2 sm:space-x-1 md:space-x-2 items-end px-4 pb-2 relative mx-auto shrink-0 w-max">
             {me.hand.map((card, index) => {
               // Selection Logic
               const isSelected = (phase === GamePhase.DISCARD || isZhihengMode || (isLijianMode && lijianSelectedCardId === card.id) || isRendeMode)
                 ? selectedCardIds.includes(card.id) || (isLijianMode && lijianSelectedCardId === card.id) || (isRendeMode && rendeSelectedCardIds.includes(card.id))
                 : activeSelectedId === card.id;
               // Playability Check for Visuals
               let isPlayable = isMyTurn && !isAiTakeover;
               if (phase === GamePhase.DISCARD && !isAiTakeover) isPlayable = true;
               else if (phase !== GamePhase.ACTION && phase !== GamePhase.DISCARD) isPlayable = false;

               // Reaction Mode
               if (pendingReaction && !isAiTakeover) {
                  // 检查是否为需要的牌或可以通过技能使用的牌
                  const neededCard = pendingReaction.cardName;
                  const canUseSkill = me.hero.name === '赵云';
                  const skillCardName = neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN;
                  // 关羽「武圣」：红色牌可当【杀】打出
                  const isWushengCard = me.hero.name === '关羽' && neededCard === CardName.SHA &&
                    (card.suit === Suit.HEART || card.suit === Suit.DIAMOND);
                  // 甄姬「倾国」：黑色牌可当【闪】打出
                  const isQingguoCard = me.hero.name === '甄姬' && neededCard === CardName.SHAN &&
                    (card.suit === Suit.SPADE || card.suit === Suit.CLUB);

                  isPlayable = card.name === neededCard ||
                    (canUseSkill && card.name === skillCardName) ||
                    isWushengCard ||
                    isQingguoCard ||
                    (neededCard === CardName.WUXIE && card.name === CardName.WUXIE);
               }

               // When one is selected in ACTION phase (not Zhiheng mode, not Rende mode), disable others
               const lockOthers = (phase === GamePhase.ACTION && !isAiTakeover && !isZhihengMode && !isRendeMode && !isZhangbaMode && selectedCardIds.length > 0);

               // 检查是否为赵云且卡牌是杀或闪，以显示技能提示
               const isZhaoyun = players[0]?.hero?.name === '赵云';
               const canUseLongdan = isZhaoyun &&
                                   ([CardName.SHA, CardName.SHAN].includes(card.name) && isPlayable);

               // 扇形排列参数：以中间牌为轴，两侧牌旋转并下沉
               const handCount = me.hand.length;
               const offset = index - (handCount - 1) / 2;
               const fanRot = Math.max(-24, Math.min(24, offset * 3.2));
               const fanY = Math.abs(offset) * Math.abs(offset) * 1.6;

               // 新摸到的牌：从牌堆方向飞入手牌区
               const drawStartIndex = drawPulse ? me.hand.length - drawPulse.count : me.hand.length;
               const isNewDrawn = index >= drawStartIndex;
               return (
                <div
                  key={card.id}
                  className={`
                    fan-card origin-bottom relative shrink-0
                    ${isSelected ? 'is-selected' : ''}
                    ${lockOthers && !isSelected ? 'pointer-events-none' : ''}
                  `}
                  style={{
                    '--fan-rot': `${fanRot}deg`,
                    '--fan-y': `${fanY}px`,
                  } as React.CSSProperties}
                >
                  <div
                    className={isNewDrawn ? 'draw-in' : undefined}
                    style={isNewDrawn ? { animationDelay: `${(index - drawStartIndex) * 70}ms` } : undefined}
                  >
                    <CardComponent
                      card={card}
                      selected={isSelected}
                      disabled={!isPlayable || (lockOthers && !isSelected)}
                      onClick={dispatchCardClick}
                      canUseSkill={canUseLongdan}
                      skillName="龙胆"
                      small={isMobileHand}
                      large={handLarge}
                    />
                  </div>
                </div>
               );
             })}
           </div>
         </div>
      </div>

      {/* 对局中玩法说明 / 新手教学入口（右上角 ?） */}
      {showRules && <RulesDialog onClose={() => setShowRules(false)} onStartTutorial={startTutorial} />}

      {/* 新手引导：高亮真实控件，不改变对局状态 */}
      {tutorialActive && (
        <TutorialOverlay onFinish={finishTutorial} onSkip={skipTutorial} />
      )}

      {/* 退出对局确认：明确告知会清档，避免误触后无法恢复 */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-[260] modal-mask flex items-center justify-center p-4" onClick={() => setShowExitConfirm(false)}>
          <div className="modal-shell rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title font-ancient text-2xl mb-2">退出本局？</h3>
            <p className="modal-text-dim text-sm mb-5">退出会清除本局存档，当前进度无法恢复。</p>
            <div className="flex flex-wrap justify-end gap-3">
              <button onClick={() => setShowExitConfirm(false)} className="btn-ink px-5 py-2.5 rounded-lg">继续对局</button>
              <button onClick={() => exitToHome()} className="btn-gold px-5 py-2.5 rounded-lg">退出并回首页</button>
            </div>
          </div>
        </div>
      )}
   </div>
 );
};

export default App;
