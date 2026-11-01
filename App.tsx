import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Hero, Player, Card, GamePhase, CardName, LogEntry, Identity, Suit, CardType } from './types';
import { HEROES, INITIAL_DECK, BGM_URL, EQUIP_META } from './constants';
import { playSfx, SFX_FOR_NAME } from './src/audio/sfx';
import { playCardVoice, playSkillVoice, playDeathVoice, hasCardVoice } from './src/audio/voice';
import CardComponent from './components/CardComponent';
import { useTheme } from './src/contexts/ThemeContext';
import { BackgroundCarousel } from './src/components/BackgroundCarousel';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from './src/config/backgrounds';

// 分段背景音乐：首页 / 对局 / 决战
const BGM_TRACKS = {
  start: BGM_URL,
  battle: 'audio/bgm/battle.mp3',
  climax: 'audio/bgm/climax.mp3',
} as const;

// 胜利阵营：以阵营枚举为唯一判定依据，显示文案单独映射
// （此前直接用 '反贼 (起义军)' 字符串与 Identity.FANZEI='反贼' 全等比较，永远不成立）
type WinnerSide = 'lord' | 'rebel' | 'spy';
const WINNER_LABEL: Record<WinnerSide, string> = {
  lord: '主公 & 忠臣 (朝廷)',
  rebel: '反贼 (起义军)',
  spy: '内奸 (野心家)',
};

// 势力色：魏蓝 / 蜀红 / 吴绿 / 群金（对应 theme.css 中的 --k-main）
const KINGDOM_CLASS: Record<string, string> = {
  魏: 'kingdom-wei',
  蜀: 'kingdom-shu',
  吴: 'kingdom-wu',
  群: 'kingdom-qun',
};

// ===== 对局存档 =====
// 只在「回合开始」这类安全节点落盘：恢复时从该回合开头重放，
// 不会重复摸牌、重复发动回合开始技能
const SAVE_KEY = 'sgs-save-v1';
const SAVE_VERSION = 1;

interface GameSave {
  v: number;
  ts: number;
  playerCount: 5 | 7;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  turnIndex: number;
  logs: LogEntry[];
}

const readSave = (): GameSave | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameSave;
    if (s?.v !== SAVE_VERSION) return null;
    if (!Array.isArray(s.players) || s.players.length < 5) return null;
    if (!s.players.some(p => p?.isHuman) || !Array.isArray(s.deck)) return null;
    if (typeof s.turnIndex !== 'number' || s.turnIndex < 0 || s.turnIndex >= s.players.length) return null;
    return s;
  } catch {
    return null;
  }
};

const writeSave = (s: GameSave) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
};

const clearSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};

// 五谷丰登取牌优先级（数值越小越优先）
const wuguKeepPriority = (c: Card): number => {
  switch (c.name) {
    case CardName.TAO: return 0;
    case CardName.WUZHONG: return 1;
    case CardName.SHAN: return 2;
    case CardName.SHA: return 3;
    case CardName.JIU: return 4;
    default: return c.type === CardType.EQUIPMENT ? 6 : 5;
  }
};

// 全局类型声明
declare global {
  interface Window {
    jiuBoost?: Record<number, boolean>;
    bingliangMark?: Record<number, boolean>;
  }
}


// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }
  return shuffled;
}

const App: React.FC = () => {
  // --- Theme ---
  const { theme, toggleTheme } = useTheme();
  
  // --- App State ---
  const [screen, setScreen] = useState<'start' | 'select' | 'game' | 'gameover'>('start');
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);
  const [playerCount, setPlayerCount] = useState<5 | 7>(5); // 游戏人数选择
  
  // 牌桌设计高度：对局界面按此高度排布，视口更矮时整体等比缩放，保证单页完整可见
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 0 : window.innerWidth,
    h: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

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

  // --- UI/Interaction State ---
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // --- 对局存档 ---
  // savedGame：首页「继续上一局」用的存档摘要
  // checkpoint：回合切换时置位，effect 里用当前渲染状态落盘（避免 ref 滞后）
  const [savedGame, setSavedGame] = useState<GameSave | null>(() => readSave());
  const [checkpoint, setCheckpoint] = useState<{ turnIndex: number, id: number } | null>(null);
  useEffect(() => {
    if (!checkpoint) return;
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

  // 司马懿技能状态
  const [hasUsedFumo, setHasUsedFumo] = useState<boolean>(false); // 司马懿是否已使用过鬼才技能

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

  // 孙尚香「结姻」技能状态
  const [isJieyinMode, setIsJieyinMode] = useState<boolean>(false);
  const [jieyinTarget, setJieyinTarget] = useState<number | null>(null);
  const [hasUsedJieyin, setHasUsedJieyin] = useState<boolean>(false);

  // 甘宁「奇袭」技能状态：将黑色牌当【过河拆桥】使用
  const [isQixiMode, setIsQixiMode] = useState<boolean>(false);

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
    resolve: (result: boolean) => void;
  } | null>(null);

  // Dying resolver for async/await
  const dyingResolver = useRef<((result: boolean) => void) | null>(null);
  const dyingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dyingTickRef = useRef<number | null>(null);

  // Skill Info Modal State
  const [showSkillModal, setShowSkillModal] = useState<boolean>(false);

  // 玩法说明弹窗（首页）
  const [showRules, setShowRules] = useState<boolean>(false);

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

  // Audio
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmModeRef = useRef<'start' | 'battle' | 'climax'>('start');
  const audioReadyRef = useRef<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 保存最新的players状态，避免闭包问题
  const playersRef = useRef<Player[]>([]);

  // --- Helpers ---
  // delay 受全局速度倍率控制：2x/3x 下 AI 结算节奏等比加快
  const delay = useCallback((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms / speedRef.current)), []);

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
  const playBgm = useCallback((mode: 'start' | 'battle' | 'climax') => {
    if (bgmModeRef.current === mode && audioRef.current) return;
    bgmModeRef.current = mode;
    const prev = audioRef.current;
    const next = new Audio(BGM_TRACKS[mode]);
    next.loop = true;
    next.volume = isMutedRef.current ? 0 : 0.3;
    next.play().catch(() => { /* 等待用户交互 */ });
    audioRef.current = next;
    if (prev) {
      let v = prev.volume;
      const timer = setInterval(() => {
        v -= 0.05;
        if (v <= 0) {
          clearInterval(timer);
          prev.pause();
        } else {
          prev.volume = v;
        }
      }, 60);
    }
  }, []);

  // 从ref中获取最新的玩家信息
  const getPlayer = (id: number) => playersRef.current.find(p => p.id === id);

  // 以最新 state 为准的手牌修改器，避免闭包旧 hand 导致的“卡牌复活”bug
  const mutateHand = useCallback((id: number, fn: (hand: Card[]) => Card[]) => {
    setPlayers(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, hand: fn(p.hand) } : p);
      playersRef.current = updated;
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

    if (ai.identity === Identity.FANZEI) {
      // 反贼：优先集火主公（主公身份始终公开）
      if (lord && lord.id !== ai.id) return lord;
      return pickWeakest(others.filter(p => guessIdentity(p) !== Identity.FANZEI)) ?? pickWeakest(others);
    }

    if (ai.identity === Identity.ZHONGCHEN || ai.identity === Identity.ZHUGONG) {
      if (rebels.length) return pickWeakest(rebels);
      const suspects = others.filter(p => guessIdentity(p) !== Identity.ZHONGCHEN && guessIdentity(p) !== Identity.ZHUGONG);
      return pickWeakest(suspects) ?? pickWeakest(others.filter(p => guessIdentity(p) !== Identity.ZHUGONG));
    }

    // 内奸：先帮主公清反贼，最后才动主公
    if (rebels.length) return pickWeakest(rebels);
    const nonLord = others.filter(p => p.identity !== Identity.ZHUGONG);
    return pickWeakest(nonLord) ?? (lord && others.length === 1 ? lord : null);
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
          return { ...p, hand: [...p.hand, ...drawn] };
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
    if (from?.equipment?.horseMinus) d -= 1;
    if (to?.equipment?.horsePlus) d += 1;
    return Math.max(1, d);
  }, []);

  // 攻击范围 = 1 + 武器范围
  const getAttackRange = useCallback((p: Player) => {
    const weapon = p.equipment?.weapon;
    const bonus = weapon ? (EQUIP_META[weapon.name]?.range ?? 1) : 0;
    return 1 + bonus;
  }, []);

  const canReach = useCallback((from: Player, to: Player) => getDistance(from.id, to.id) <= getAttackRange(from), [getDistance, getAttackRange]);

  // 本回合是否还能使用【杀】（张飞「咆哮」、诸葛连弩不限）
  const canPlaySlash = useCallback((p: Player) => {
    if (p.equipment?.weapon?.name === CardName.ZHUGE) return true;
    if (p.hero.name === '张飞') return true;
    return (slashUsageRef.current[p.id] ?? 0) < 1;
  }, []);

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
      triggerXiaoji(playerId);
    }
    playSound(card.name, player.hero.gender);
    addLog(`${player.hero.name} 装备了【${card.name}】${meta.range ? `（攻击范围 ${meta.range}）` : ''}`, 'success');
    return true;
  }, [getPlayer, mutateHand, updatePlayer, triggerXiaoji]);

  // --- Initialization ---

  const initAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(BGM_TRACKS[bgmModeRef.current]);
      audioRef.current.loop = true;
      audioRef.current.volume = isMuted ? 0 : 0.3;
    }
    // 浏览器自动播放策略会拦截无交互的播放请求（控制台出现 ERR_ABORTED），静默忽略即可
    audioReadyRef.current = true;
    audioRef.current.play().catch(() => {});
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
    if (audioRef.current) {
      audioRef.current.volume = newMuted ? 0 : 0.3;
    }
  };

  const startGame = (hero: Hero) => {
    initAudio();
    isGameOverRef.current = false; // 重置结束标志，支持"再来一局"
    setAdvice(null);
    setSkillBanner(null);
    const shuffledDeck = [...INITIAL_DECK]; 
    
    // 根据人数分配身份
    let identities: Identity[];
    if (playerCount === 5) {
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

    // Heroes
    const otherHeroes = HEROES.filter(h => h.id !== hero.id).sort(() => Math.random() - 0.5);
    const newPlayers: Player[] = [];

    for (let i = 0; i < playerCount; i++) {
      const isHuman = i === 0;
      const assignedHero = isHuman ? hero : otherHeroes[i - 1];
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
    
    const initLogs: LogEntry[] = [{ id: 'init', text: `${playerCount}人军争模式启动！主公已现身，请各方势力准备。`, type: 'info' }];
    setLogs(initLogs);
    setPhase(GamePhase.START);
    setScreen('game');

    // 开局即落一次存档：中途刷新也能从本回合开头恢复
    const snap: GameSave = {
      v: SAVE_VERSION,
      ts: Date.now(),
      playerCount,
      players: newPlayers,
      deck: shuffledDeck,
      discardPile: [],
      turnIndex: lordIndex,
      logs: initLogs,
    };
    if (writeSave(snap)) setSavedGame(snap);
  };

  // 继续上一局：从存档的「回合开始」重放，先清掉所有挂起的交互与演出状态
  const resumeGame = () => {
    if (!savedGame) return;
    const s = savedGame;
    initAudio();
    isGameOverRef.current = false;

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
    setHasUsedFumo(false);
    setIsRendeMode(false);
    setRendeSelectedCardIds([]);
    setRendeSelectedTarget(null);
    setIsJieyinMode(false);
    setJieyinTarget(null);
    setHasUsedJieyin(false);
    setIsQixiMode(false);
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

  // --- Core Game Functions ---

  const discardCards = (playerId: number, cardsToDiscard: Card[]) => {
    // 创建要移除的卡牌ID集合，确保只移除指定的卡牌
    const cardIdsToRemove = new Set(cardsToDiscard.map(card => card.id));
    
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
      isGameOverRef.current = false; // 重置标志，允许重新开始游戏
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
    if (checkGameOver()) return;
    if (isProcessing) return; // 如果正在处理异步效果，暂停游戏主循环推进

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
        setHasUsedFumo(false); // 重置司马懿鬼才技能使用状态
        setHasUsedLijian(false); // 重置貂蝉离间技能使用状态
        slashUsageRef.current[currentPlayer.id] = 0; // 重置本回合【杀】使用次数
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

        // 闪电判定：判定牌为黑桃2-9时受到3点雷电伤害，否则传递给下一名角色
        if (currentPlayer.isShandian) {
          updatePlayer(currentPlayer.id, { isShandian: false });
          const jc = await performJudgment(currentPlayer.id, '闪电');
          const rankNum = jc ? (parseInt(jc.rank.replace(/\D/g, ''), 10) || 0) : 0;
          if (jc && jc.suit === Suit.SPADE && rankNum >= 2 && rankNum <= 9) {
            addLog(`⚡【闪电】命中！${currentPlayer.hero.name} 受到3点雷电伤害！`, 'danger');
            await takeDamage(currentPlayer.id, currentPlayer.id, 3, {
              ...jc, name: CardName.SHANDIAN,
            } as Card);
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
          }
          // 无论是否获救，都结束当前回合
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
        } else {
          drawCards(currentPlayer.id, drawCount);
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
                const keepValue = (c: Card) => {
                  switch (c.name) {
                    case CardName.TAO: return 0;   // 桃必留
                    case CardName.SHAN: return 1;  // 闪
                    case CardName.SHA: return 2;   // 杀
                    case CardName.WUZHONG: return 3;
                    case CardName.WUXIE: return 3;
                    case CardName.JIU: return 4;
                    default: return 6;             // 其余锦囊优先弃置
                  }
                };
                const discarded = [...finalPlayer.hand]
                  .sort((a, b) => keepValue(b) - keepValue(a))
                  .slice(0, finalExcess);
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

        // 结束阶段：若有角色体力<=0且未死亡，进行濒死求桃
        const latestPlayers = playersRef.current.length ? playersRef.current : players;
        for (const p of latestPlayers) {
          if (p.hp <= 0 && !p.isDead) {
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
        await delay(1000);
        setTurnPass(null);

        setTurnIndex(nextIndex);
        setPhase(GamePhase.START);
      }
    };

    runTurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnIndex, screen, isAiTakeover, isProcessing]); 

  // 人类决策读秒：出牌 / 弃牌阶段 20 秒未操作则自动处理，避免对局永久卡住
  useEffect(() => {
    const human = players.find(p => p.isHuman);
    const shouldCount =
      screen === 'game' &&
      !isAiTakeover &&
      phase === GamePhase.ACTION &&
      !!human && !human.isDead && turnIndex === human.id &&
      !dyingState && !pendingReaction && !showSkillModal && !wuguSelection &&
      isProcessing === 0;
    const shouldCountDiscard =
      screen === 'game' &&
      !isAiTakeover &&
      phase === GamePhase.DISCARD &&
      !!human && !human.isDead && turnIndex === human.id &&
      !dyingState && !pendingReaction && !wuguSelection &&
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
  }, [screen, isAiTakeover, phase, turnIndex, players, dyingState, pendingReaction, showSkillModal, wuguSelection, isProcessing]);

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

  // Global cancel: ESC to clear selection/targeting
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        setIsJiedaoMode(false);
        setJiedaoWeaponTarget(null);
        setJiedaoVictimTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      if (screen !== 'game') return;
      if (dyingState || pendingReaction || showSkillModal || wuguSelection || isAiTakeover) return;
      if (!players.length) return;
      const meNow = players.find(p => p.isHuman) || players[0];
      if (!meNow || meNow.isDead || turnIndex !== meNow.id) return;

      // 数字键 1-9：选择第 N 张手牌
      if (/^[1-9]$/.test(e.key) && phase === GamePhase.ACTION) {
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
  }, [screen, phase, turnIndex, players, selectedCardIds, dyingState, pendingReaction, showSkillModal, wuguSelection, isAiTakeover, isProcessing]);

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
    // 仅在非弃牌阶段、非制衡模式、非仁德模式下执行单选强制逻辑
    if (phase !== GamePhase.DISCARD && !isZhihengMode && !isRendeMode) {
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
  }, [selectedCardIds, phase, isZhihengMode, isRendeMode]);

  const handleTargetClick = async (targetId: number) => {
    if (dyingState || isProcessing) return;

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
        await useCardEffect(meQ, [target], tempGuohe);
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
      if (dist > reach) {
        addLog(`距离不足：你与 ${target.hero.name} 距离 ${dist}，攻击范围 ${reach}`, 'warning');
        setTimeout(() => { clickGuard.current = false; }, 200);
        return;
      }
      if (!canPlaySlash(me)) {
        addLog('出牌阶段只能使用一张【杀】（装备诸葛连弩可无限使用）', 'warning');
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
    
    setIsProcessing(p => p + 1);
    try {
      // 处理桃和酒的特殊情况：可以对自己使用
      if (card.name === CardName.TAO || card.name === CardName.JIU) {
        // 桃和酒可以对自己使用
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await useCardEffect(me, [target], card);
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
        await useCardEffect(me, [target], tempShaCard);
      } else if (isUsingWusheng) {
        // 关羽将红色牌当杀使用
        addLog(`${me.hero.name} 使用技能「武圣」，将【${card.name}】当【杀】使用`, 'skill');
        showSkillBanner(me.hero.name, '武圣');
        // 创建一个临时的杀卡牌对象用于效果处理
        const tempShaCard = { ...card, name: CardName.SHA };
        await useCardEffect(me, [target], tempShaCard);
      } else {
        // 执行普通卡牌效果
        await useCardEffect(me, [target], card);
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
        await useCardEffect(me, [me], card);
      } else if (card.name === CardName.TAO) {
        // 如果已经选择了目标，直接使用桃
        if (isSelectingTarget) {
          // 目标选择模式下，应该已经有了选中的卡牌和目标
          // 这里需要处理桃的目标使用
          const target = players.find(p => p.isSelected) || me;
          setSelectedCardIds([]);
          setIsSelectingTarget(false);
          await useCardEffect(me, [target], card);
        } else {
          // 没有选择目标，默认对自己使用
          if (me.hp < me.maxHp) {
            setSelectedCardIds([]);
            setIsSelectingTarget(false);
            await useCardEffect(me, [me], card);
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
        await useCardEffect(me, targets, card);
      } else if (card.name === CardName.JIU) {
        // 酒可以对自己使用
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await useCardEffect(me, [me], card);
      } else if (card.name === CardName.TIESUO) {
        // 铁索连环：使用玩家选择的目标
        if (tiesuoSelectedTargets.length > 0) {
          const selectedTargets = players.filter(p => tiesuoSelectedTargets.includes(p.id));
          setSelectedCardIds([]);
          setIsSelectingTarget(false);
          setTiesuoSelectedTargets([]);
          await useCardEffect(me, selectedTargets, card);
        } else {
          addLog("请选择至少1个目标", 'warning');
          return;
        }
      } else if (card.name === CardName.WUGU || card.name === CardName.TAOYUAN) {
        // 五谷丰登和桃园结义：无需选择目标，直接生效
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await useCardEffect(me, [], card);
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
            await useCardEffect(me, [weaponPlayer, victimPlayer], card);
          }
        } else {
          addLog("请先选择两名目标角色", 'warning');
          return;
        }
      } else if (card.name === CardName.SHANDIAN) {
        // 闪电：对自己使用，放置到判定区
        setSelectedCardIds([]);
        setIsSelectingTarget(false);
        await useCardEffect(me, [me], card);
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

    addLog(`决斗开始！`, 'danger');

    while (!duelOver) {
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

    if (newHp <= 0 && !victim.isDead) {
      addLog(`${victim.hero.name} 进入濒死状态！`, 'danger');
      await askForPeaches(victimId);
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
    const rankDisplay = judgmentCard.rank.replace(/\d+$/, '');
    addLog(`⚖️ ${playerName} 的【${reason}】判定：${judgmentCard.suit} ${rankDisplay}（判定牌：【${judgmentCard.name}】）${isXiaoqiao && finalCard.suit !== judgmentCard.suit ? '，触发「红颜」视为红桃' : ''}`, 'warning');
    showJudgmentVisual(finalCard, playerName, reason);
    await delay(1600);
    return finalCard;
  };

  const playCard = (playerId: number, card: Card) => {
    discardCards(playerId, [card]);
    showCardVisual(card, getPlayer(playerId)?.hero.name || '', 1200, getPlayer(playerId)?.hero.gender);
  };

  const useCardEffect = async (source: Player, targets: Player[], card: Card) => {
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

      // 黄月英「集智」：使用锦囊牌时摸一张
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

          // 防具判定：仁王盾免疫黑色【杀】；青釭剑无视防具
          const armor = effectiveTarget.equipment?.armor?.name;
          const ignoreArmor = source.equipment?.weapon?.name === CardName.QINGGANG;
          const isBlackSlash = card.suit === Suit.SPADE || card.suit === Suit.CLUB;
          if (!ignoreArmor && armor === CardName.RENWANG && isBlackSlash) {
            addLog(`${effectiveTarget.hero.name} 的【仁王盾】挡住了黑色【杀】，伤害无效`, 'success');
            await delay(500);
            continue;
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

          // 青龙偃月刀：若【杀】被闪避且手中还有【杀】，追加一击
          const isQinglong = source.equipment?.weapon?.name === CardName.QINGLONG;
          if (isQinglong && hpAfter === hpBefore && !getPlayer(effectiveTarget.id)?.isDead) {
            const extraSha = playersRef.current.find(p => p.id === source.id)?.hand.find(c => c.name === CardName.SHA);
            if (extraSha) {
              addLog(`【青龙偃月刀】发动，追加一击！`, 'skill');
              showSkillBanner(source.hero.name, '青龙偃月刀');
              await delay(500);
              await useCardEffect(source, [effectiveTarget], extraSha);
              continue;
            }
          }
          await delay(300);
        }
      }
      // JUEDOU
      else if (card.name === CardName.JUEDOU) {
        playCard(source.id, card);
         const target = targets[0];
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
        // 更新目标体力，确保体力正确
        const newHp = Math.min(target.hp + 1, target.maxHp);
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
              triggerXiaoji(target.id);
              addLog(`${source.hero.name} 顺手牵走了 ${target.hero.name} 的装备【${stolenEquip.name}】`, 'chat');
            } else if (target.hand.length > 0) {
              const randomIndex = Math.floor(Math.random() * target.hand.length);
              const stolenCard = target.hand[randomIndex];

              // 从目标手牌中移除、加入自己手牌（基于最新 state，避免旧闭包导致卡牌复活）
              mutateHand(target.id, hand => hand.filter(c => c.id !== stolenCard.id));
              mutateHand(source.id, hand => [...hand, stolenCard]);

              addLog(`${source.hero.name} 从 ${target.hero.name} 那里偷到了【${stolenCard.name}】`, 'chat');
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
        playCard(source.id, card);
        const target = targets[0];
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
        const equipCards = [target.equipment?.weapon, target.equipment?.armor, target.equipment?.horsePlus, target.equipment?.horseMinus].filter(Boolean) as Card[];
        if (target.hand.length > 0 || equipCards.length > 0) {
          playCard(source.id, card);
          // 询问目标是否使用无懈可击
          const isWuxieUsed = await triggerReaction(target.id, source.id, CardName.WUXIE, card);
          if (!isWuxieUsed) {
            // 有装备且（无手牌 或 35% 概率）则拆装备
            const useEquip = equipCards.length > 0 && (target.hand.length === 0 || Math.random() < 0.35);
            if (useEquip) {
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
              triggerXiaoji(target.id);
              addLog(`${source.hero.name} 拆掉了 ${target.hero.name} 的装备【${brokenEquip.name}】`, 'chat');
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
          // 铁索连环传导：目标被横置时，火焰伤害波及所有横置角色（先重置避免连环循环）
          const chainedPlayers = playersRef.current.filter(p => p.isChained && !p.isDead);
          if (target.isChained && chainedPlayers.length > 1) {
            addLog(`🔗【铁索连环】传导！火焰伤害波及 ${chainedPlayers.map(p => p.hero.name).join('、')}`, 'danger');
            chainedPlayers.forEach(cp => updatePlayer(cp.id, { isChained: false }));
            for (const cp of chainedPlayers) {
              await takeDamage(cp.id, source.id, 1, card);
            }
          } else {
            await takeDamage(target.id, source.id, 1, card);
          }
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
        playCard(source.id, card);
        const target = targets[0];
        const victim = targets[1];
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

  const handleFumoSkill = async (player: Player, attackCardName: string) => {
    if (player.hero.name !== '司马懿') return;
    if (hasUsedFumo) return;
    
    const attackCards = [CardName.SHA, CardName.SHAN, CardName.JUEDOU, CardName.NANMAN, CardName.WANJIAN];
    if (!attackCards.includes(attackCardName as CardName)) return;
    
    setHasUsedFumo(true);
    
    if (player.hp < player.maxHp) {
      // 触发治疗动画
      setHealAnimTarget(player.id);
      setHealNumber({ targetId: player.id, amount: 1, id: Date.now().toString() });
      setTimeout(() => setHealAnimTarget(null), 600);
      setTimeout(() => setHealNumber(null), 1000);

      updatePlayer(player.id, { hp: player.hp + 1 });
      addLog(`${player.hero.name} 使用技能「鬼才」，恢复1点体力！`, 'skill');
      showSkillBanner(player.hero.name, '鬼才');
    } else {
      // 基于 deckRef 取最新牌堆，摸牌入最新手牌
      const newDeck = [...deckRef.current];
      if (newDeck.length > 0) {
        const drawnCard = newDeck.pop()!;
        setDeck(newDeck);
        deckRef.current = newDeck;
        mutateHand(player.id, hand => [...hand, drawnCard]);
        addLog(`${player.hero.name} 使用技能「鬼才」，血量已满，摸到一张【${drawnCard.name}】！`, 'skill');
        showSkillBanner(player.hero.name, '鬼才');
      }
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
             await handleFumoSkill(responder, triggerCard.name);
             return true;
           } else {
             if (isWuxieCheck) {
               addLog(`你选择不使用【无懈可击】`, 'info');
               return false;
             } else {
               addLog(`你打出了【${neededCard}】，防御成功！`, 'success');
               await handleFumoSkill(responder, triggerCard.name);
               
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
        
        // 如果是无懈可击判定，AI会优先使用无懈可击
        if (isWuxieCheck) {
          const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
          if (hasWuxie) {
            const wuxieCard = responder.hand.find(c => c.name === CardName.WUXIE)!;
            playCard(responder.id, wuxieCard);
            addLog(`${responder.hero.name} 使用了【无懈可击】`, 'info');
            await handleFumoSkill(responder, triggerCard.name);
            return true;
          } else {
            return false;
          }
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
          
          await handleFumoSkill(responder, triggerCard.name);
          
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
    if (victim.hp > 0) {
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
      const order = allPlayers
        .sort((a, b) => ((a.id - victimId + playerCount) % playerCount) - ((b.id - victimId + playerCount) % playerCount));

      // 循环询问，直到有人出桃或者所有人都放弃
      while (getPlayer(victimId)!.hp <= 0) {
        let someoneSaved = false;

        for (const player of order) {
          const currentVictim = getPlayer(victimId)!;
          if (currentVictim.hp > 0) {
            setDyingState(null);
            return true;
          }

          const hasTao = player.hand.some(c => c.name === CardName.TAO);
          const hasJiu = player.hand.some(c => c.name === CardName.JIU);
          const canSave = hasTao || hasJiu;

          // 所有有桃或酒的角色（包括濒死角色自己）都可以选择是否使用
          if (canSave) {
            const saveCardName = hasTao ? '桃' : '酒';
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
                // 玩家选择救援，优先使用桃，没有桃则使用酒
                const saveCard = player.hand.find(c => c.name === CardName.TAO) || 
                                player.hand.find(c => c.name === CardName.JIU);
                if (saveCard) {
                  await useCardEffect(player, [currentVictim], saveCard);
                  someoneSaved = true;

                  const updatedVictim = getPlayer(victimId)!;
                  if (updatedVictim.hp > 0) {
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
                resolve: () => {} // AI不需要点击，所以用空函数
              });

              // AI决策
              const shouldSave = shouldAiSavePlayer(player, victim);

              if (shouldSave) {
                await delay(1500); // 给玩家看到AI在思考
                setDyingState(null);
                // AI优先使用桃，没有桃则使用酒
                const saveCard = player.hand.find(c => c.name === CardName.TAO) || 
                                player.hand.find(c => c.name === CardName.JIU);
                if (!saveCard) {
                  addLog(`⚠️ ${player.hero.name} 想救援但没有【桃】或【酒】了`, 'warning');
                  continue; // 继续询问下一个玩家
                }
                addLog(`🍑 ${player.hero.name} 决定使用【${saveCard.name}】救援 ${victim.hero.name}`, 'success');
                await useCardEffect(player, [currentVictim], saveCard);
                someoneSaved = true;

                const updatedVictim = getPlayer(victimId)!;
                if (updatedVictim.hp > 0) {
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
      }

      setDyingState(null);
      return false;
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  // AI是否救援的决策函数
  const shouldAiSavePlayer = (rescuer: Player, victim: Player): boolean => {
    const ri = rescuer.identity;
    const vi = victim.identity;
    
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

  const takeDamage = async (victimId: number, sourceId: number, amount: number, damageCard?: Card) => {
    setIsProcessing(p => p + 1);
    try {
      // 检查是否有"酒"的伤害加成（仅对杀有效）
      let finalAmount = amount;
      if (damageCard?.name === CardName.SHA && window.jiuBoost?.[sourceId]) {
        finalAmount = amount + 1;
        addLog(`【酒】效果触发！伤害+1`, 'danger');
        // 清除酒的效果
        window.jiuBoost[sourceId] = false;
      }

      setDamageAnimTarget(victimId);
      playSound('damage');
      setTimeout(() => setDamageAnimTarget(null), 500);

      let victim = getPlayer(victimId)!;
      const newHp = victim.hp - finalAmount;
      
      // 立即更新玩家体力
      updatePlayer(victimId, { hp: newHp });
      addLog(`${victim.hero.name} 受到 ${finalAmount} 点伤害！当前体力: ${newHp}/${victim.maxHp}`, 'danger');

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
        // 曹操受到伤害，获得造成伤害的牌
        setPlayers(prev => {
          const updated = prev.map(p => {
            if (p.id === victimId) {
              return { ...p, hand: [...p.hand, damageCard] };
            }
            return p;
          });
          playersRef.current = updated;
          return updated;
        });
        addLog(`${victim.hero.name} 使用技能「奸雄」，获得了【${damageCard.name}】！`, 'skill');
        showSkillBanner(victim.hero.name, '奸雄');
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
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
    }
  };

  // --- AI Logic ---
  
  const cpuAI = async (aiPlayer: Player) => {
    // 出牌前先「思考」：头像暖光 + 随机 300~800ms，AI 不再瞬发
    await aiThink(aiPlayer.id);

    const alivePlayers = players.filter(p => !p.isDead && p.id !== aiPlayer.id);
    let targetId = -1;

    // 0. 装备优先：空槽直接上装，武器仅替换为攻击范围更大的
    const equipCandidates = aiPlayer.hand.filter(c => c.type === CardType.EQUIPMENT && EQUIP_META[c.name]);
    if (equipCandidates.length > 0) {
      const pick = equipCandidates.sort((a, b) => (EQUIP_META[b.name]?.range ?? 0) - (EQUIP_META[a.name]?.range ?? 0))[0];
      const slot = EQUIP_META[pick.name]!.slot;
      const current = aiPlayer.equipment?.[slot];
      const betterWeapon = slot === 'weapon' && (!current || (EQUIP_META[pick.name]?.range ?? 0) > (EQUIP_META[current.name]?.range ?? 0));
      if (!current || betterWeapon) {
        equipCard(aiPlayer.id, pick);
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

    // 2. Play Tao
    if (aiPlayer.hp < aiPlayer.maxHp) {
      const peach = aiPlayer.hand.find(c => c.name === CardName.TAO);
      if (peach) {
        await useCardEffect(aiPlayer, [aiPlayer], peach);
        await delay(1500);
      }
    }

    // 3. Play Wuzhong
    const wuzhong = aiPlayer.hand.find(c => c.name === CardName.WUZHONG);
    if (wuzhong) {
      await useCardEffect(aiPlayer, [aiPlayer], wuzhong);
      await delay(1500);
    }

    // 4. Play Wanjian Qifa
    const wanjian = aiPlayer.hand.find(c => c.name === CardName.WANJIAN);
    if (wanjian) {
      const targets = players.filter(p => p.id !== aiPlayer.id && !p.isDead);
      const enemyCount = targets.filter(t => isEnemy(aiPlayer, t)).length;
      const allyCount = targets.filter(t => isAlly(aiPlayer, t)).length;
      if (enemyCount >= allyCount) {
        await useCardEffect(aiPlayer, targets, wanjian);
        await delay(1500);
      }
    }
    
    // 5. Play Shunshou Qianyang（仅限距离 1；黄月英「奇才」无视距离）
    const shunshou = aiPlayer.hand.find(c => c.name === CardName.SHUNSHOU);
    if (shunshou && shunshouTarget) {
      await useCardEffect(aiPlayer, [shunshouTarget], shunshou);
      await delay(1500);
    }
    
    // 6. Play Guohe Chaiqiao
    const guohe = aiPlayer.hand.find(c => c.name === CardName.GUOHE);
    if (guohe && targetId !== -1) {
      const target = getPlayer(targetId)!;
      await useCardEffect(aiPlayer, [target], guohe);
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
        await useCardEffect(aiPlayer, [target], tempGuohe);
        await delay(1500);
      }
    }
    
    // 7. Play Leshi Busi Shu
    const lesi = aiPlayer.hand.find(c => c.name === CardName.LESI);
    if (lesi && targetId !== -1) {
      const target = getPlayer(targetId)!;
      await useCardEffect(aiPlayer, [target], lesi);
      await delay(1500);
    }

    // 8. Play Wugu Fengdeng (AI will use it when there are alive players)
    const wugu = aiPlayer.hand.find(c => c.name === CardName.WUGU);
    if (wugu) {
      const alivePlayers = players.filter(p => !p.isDead);
      if (alivePlayers.length > 0) {
        await useCardEffect(aiPlayer, [], wugu);
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
        await useCardEffect(aiPlayer, [], taoyuan);
        await delay(1500);
      }
    }

    // 10. Play Bingliang Cunduan（仅限距离 1；黄月英「奇才」无视距离）
    const bingliang = aiPlayer.hand.find(c => c.name === CardName.BINGLIANG);
    if (bingliang && shunshouTarget) {
      await useCardEffect(aiPlayer, [shunshouTarget], bingliang);
      await delay(1500);
    }

    // 9. Play Huogong
    const huogong = aiPlayer.hand.find(c => c.name === CardName.HUOGONG);
    if (huogong && targetId !== -1) {
      const target = getPlayer(targetId)!;
      if (target.hand.length > 0) {
        await useCardEffect(aiPlayer, [target], huogong);
        await delay(1500);
      }
    }

    // 10. Play Tiesuo Lianhuan
    const tiesuo = aiPlayer.hand.find(c => c.name === CardName.TIESUO);
    if (tiesuo) {
      const targets = players.filter(p => p.id !== aiPlayer.id && !p.isDead).slice(0, 2);
      if (targets.length > 0) {
        await useCardEffect(aiPlayer, targets, tiesuo);
        await delay(1500);
      }
    }

    // 11. Play Jiu (before Slash for boost)
    const jiu = aiPlayer.hand.find(c => c.name === CardName.JIU);
    if (jiu && targetId !== -1) {
      await useCardEffect(aiPlayer, [aiPlayer], jiu);
      await delay(1000);
    }

    // 11.5 Play Juedou（决斗：对血量最低的敌人）
    const juedou = aiPlayer.hand.find(c => c.name === CardName.JUEDOU);
    if (juedou && targetId !== -1) {
      const target = getPlayer(targetId)!;
      await useCardEffect(aiPlayer, [target], juedou);
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
          await useCardEffect(aiPlayer, [weaponTarget, victim], jiedao);
          await delay(1500);
        }
      }
    }

    // 12. Play Slash（受攻击范围限制；张飞「咆哮」/ 诸葛连弩 可连续出【杀】）
    let slashPlayed = 0;
    for (let i = 0; i < 3; i++) {
      const aiNow = getPlayer(aiPlayer.id);
      if (!aiNow || aiNow.isDead) break;
      const slash = aiNow.hand.find(c => c.name === CardName.SHA);
      const target = players
        .filter(p => !p.isDead && p.id !== aiNow.id && isEnemy(aiNow, p) && canReach(aiNow, p))
        .sort((a, b) => a.hp - b.hp)[0];
      if (!slash || !target || !canPlaySlash(aiNow)) break;
      await useCardEffect(aiNow, [target], slash);
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
      if (enemyCount >= allyCount) {
        await useCardEffect(aiPlayer, targets, nanman);
        await delay(1500);
      }
    }
    }

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
      <div className={`h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden ${theme === 'light' ? 'parchment-bg' : ''}`}>
        {/* 背景轮播 */}
        <BackgroundCarousel 
          images={BACKGROUND_IMAGES}
          interval={CAROUSEL_CONFIG.interval}
        />
        
        {/* 多层背景效果 - 根据主题切换（在没有背景图或背景图加载失败时显示） */}
        {theme === 'dark' ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a1510] to-[#0d0d0d]"></div>
            {/* 古风纹理背景 */}
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}></div>
            {/* 动态光晕效果 */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-radial from-amber-900/30 via-transparent to-transparent blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-red-900/20 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-yellow-900/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
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

        {/* 音乐控制按钮 */}
        <div className="absolute top-6 right-6 z-50">
          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-2 border-[#d4af37]/50 hover:border-[#d4af37] hover:scale-110 transition-all flex items-center justify-center shadow-lg"
            title={isMuted ? "开启音乐" : "静音"}
          >
            <span className="text-lg">{isMuted ? "🔇" : "🎵"}</span>
          </button>
        </div>

        {/* 主题切换按钮 */}
        <div className="absolute top-6 right-20 z-50">
          <button
            onClick={toggleTheme}
            className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center shadow-lg ${
              theme === 'dark' 
                ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37]' 
                : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#e5e0db] hover:border-[#c4a77d]'
            }`}
            title={theme === 'dark' ? "切换到白天模式" : "切换到黑夜模式"}
          >
            <span className="text-lg">{theme === 'dark' ? "🌙" : "☀️"}</span>
          </button>
        </div>

        <div className="z-10 text-center animate-fade-in">
            {/* 主标题区域 */}
            <div className="relative mb-8">
              {/* 印章装饰 */}
              <div className={`absolute -top-6 -right-10 md:-top-3 md:-right-24 rotate-6 w-12 h-12 md:w-16 md:h-16 rounded-md flex items-center justify-center border-2 shadow-[0_6px_20px_rgba(0,0,0,0.5)] ${
                theme === 'dark'
                  ? 'bg-gradient-to-br from-[#9e2b25] to-[#7a1f1a] border-[#d4af37]/60'
                  : 'bg-gradient-to-br from-[#b03a32] to-[#8a2620] border-[#8a6914]/50'
              }`}>
                <span className="font-ancient text-3xl md:text-4xl text-[#f3d9a4] leading-none select-none">殺</span>
              </div>
              {/* 标题背景光晕 - 白天模式更强 */}
              <div className={`absolute inset-0 blur-2xl transform scale-150 ${theme === 'dark' ? 'bg-gradient-to-b from-amber-600/20 to-transparent' : 'bg-gradient-to-b from-white/80 to-transparent'}`}></div>
              
              {/* 主标题 - 白天模式使用深色确保对比度，增加多层阴影 */}
              <h1 className={`font-ancient text-7xl md:text-8xl lg:text-9xl mb-4 tracking-widest relative ${theme === 'dark' ? 'text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]' : 'text-[#1a1815] drop-shadow-[0_2px_4px_rgba(255,255,255,0.9)] drop-shadow-[0_0_30px_rgba(255,255,255,0.6)]'}`} style={theme === 'light' ? { textShadow: '0 2px 4px rgba(255,255,255,0.9), 0 0 30px rgba(255,255,255,0.7), 0 0 60px rgba(250,248,245,0.5)' } : {}}>
                三国杀
              </h1>
              
              {/* 标题装饰线 */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <div className={`w-24 h-px ${theme === 'dark' ? 'bg-gradient-to-r from-transparent via-amber-600 to-amber-600' : 'bg-gradient-to-r from-transparent via-[#5d4037] to-[#5d4037]'}`}></div>
                <div className={`w-2 h-2 rotate-45 ${theme === 'dark' ? 'bg-amber-500' : 'bg-[#5d4037]'}`}></div>
                <div className={`w-32 h-px ${theme === 'dark' ? 'bg-gradient-to-r from-amber-600 via-amber-600 to-transparent' : 'bg-gradient-to-r from-[#5d4037] via-[#5d4037] to-transparent'}`}></div>
              </div>
            </div>
            
            {/* 副标题 */}
            <div className="relative mb-16">
              <h2 className={`text-2xl md:text-3xl tracking-[0.8em] font-serif font-bold ${theme === 'dark' ? 'text-amber-200/80' : 'text-[#2d2a26]'}`} style={theme === 'light' ? { textShadow: '0 2px 4px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.5)' } : {}}>
                {playerCount}人军争篇
              </h2>
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className={`w-16 h-px ${theme === 'dark' ? 'bg-gradient-to-r from-transparent to-amber-700/50' : 'bg-gradient-to-r from-transparent to-[#5d4037]/70'}`}></div>
                <span className={`text-sm tracking-widest font-semibold ${theme === 'dark' ? 'text-amber-600/60' : 'text-[#5d4037]'}`} style={theme === 'light' ? { textShadow: '0 1px 2px rgba(255,255,255,0.8)' } : {}}>SANGUOSHA</span>
                <div className={`w-16 h-px ${theme === 'dark' ? 'bg-gradient-to-l from-transparent to-amber-700/50' : 'bg-gradient-to-l from-transparent to-[#5d4037]/70'}`}></div>
              </div>
            </div>
            
            {/* 主按钮区域 */}
            <div className="flex flex-col items-center gap-8">
              {/* 人数选择 */}
              <div className="flex flex-col items-center gap-4 mb-4">
                <div className={`text-sm tracking-widest font-ancient font-bold ${theme === 'dark' ? 'text-amber-400/80' : 'text-[#3d2914]'}`} style={theme === 'light' ? { textShadow: '0 1px 2px rgba(255,255,255,0.8)' } : {}}>选择游戏人数</div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setPlayerCount(5)}
                    className={`px-6 py-2 rounded-lg border-2 font-bold font-ancient transition-all shadow-lg ${
                      playerCount === 5
                        ? theme === 'dark'
                          ? 'bg-gradient-to-b from-red-700 to-red-900 text-amber-100 border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                          : 'bg-gradient-to-b from-[#b8956a] to-[#a08050] text-white border-[#8b6f4a] shadow-[0_4px_15px_rgba(184,149,106,0.5)]'
                        : theme === 'dark'
                          ? 'bg-stone-800 text-stone-400 border-stone-600 hover:border-amber-600 hover:text-amber-300'
                          : 'bg-white/90 text-[#3d2914] border-[#c4b8a8] hover:border-[#b8956a] hover:text-[#2d1f0f] shadow-[0_2px_8px_rgba(0,0,0,0.1)]'
                    }`}
                  >
                    五人局
                  </button>
                  <button
                    onClick={() => setPlayerCount(7)}
                    className={`px-6 py-2 rounded-lg border-2 font-bold font-ancient transition-all shadow-lg ${
                      playerCount === 7
                        ? theme === 'dark'
                          ? 'bg-gradient-to-b from-red-700 to-red-900 text-amber-100 border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                          : 'bg-gradient-to-b from-[#b8956a] to-[#a08050] text-white border-[#8b6f4a] shadow-[0_4px_15px_rgba(184,149,106,0.5)]'
                        : theme === 'dark'
                          ? 'bg-stone-800 text-stone-400 border-stone-600 hover:border-amber-600 hover:text-amber-300'
                          : 'bg-white/90 text-[#3d2914] border-[#c4b8a8] hover:border-[#b8956a] hover:text-[#2d1f0f] shadow-[0_2px_8px_rgba(0,0,0,0.1)]'
                    }`}
                  >
                    七人局
                  </button>
                </div>
              </div>
              
              {/* 点兵出征按钮 */}
              <button 
                onClick={() => { initAudio(); setScreen('select'); }}
                className="group relative"
              >
                {/* 按钮外发光 - 白天模式更强 */}
                <div className={`absolute -inset-1 rounded-xl blur transition-opacity duration-500 ${theme === 'dark' ? 'bg-gradient-to-r from-red-600 via-amber-500 to-red-600 opacity-40 group-hover:opacity-70' : 'bg-gradient-to-r from-[#b8956a] via-[#d4c4a8] to-[#b8956a] opacity-70 group-hover:opacity-95'}`}></div>
                
                {/* 按钮主体 */}
                <div className={`relative px-20 py-5 text-2xl md:text-3xl font-bold font-ancient rounded-xl border-2 transition-all duration-300 transform group-hover:scale-105 group-hover:-translate-y-1 overflow-hidden shadow-2xl ${theme === 'dark' ? 'bg-gradient-to-b from-red-700 via-red-800 to-red-900 text-amber-100 border-red-500/50 shadow-[0_10px_40px_rgba(185,28,28,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]' : 'bg-gradient-to-b from-[#b8956a] via-[#d4c4a8] to-[#a08050] text-white border-[#8b6f4a]/50 shadow-[0_10px_40px_rgba(184,149,106,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]'}`}>
                  {/* 按钮内部纹理 */}
                  <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='2' cy='2' r='1'/%3E%3C/g%3E%3C/svg%3E")`
                  }}></div>
                  
                  {/* 按钮文字 */}
                  <span className="relative z-10 tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">点兵出征</span>
                  
                  {/* 悬停光效 */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </div>
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
                    className={`group flex flex-col items-center gap-0.5 px-8 py-2.5 rounded-xl border-2 transition-all hover:scale-[1.04] shadow-lg ${
                      theme === 'dark'
                        ? 'border-[#c8a45c]/45 bg-gradient-to-b from-[#2a2118]/90 to-[#171310]/90 hover:border-[#e8cf94]'
                        : 'border-[#c4a77d]/60 bg-gradient-to-b from-white/95 to-[#f2ebe0]/95 hover:border-[#8b6914]'
                    }`}
                  >
                    <span className={`font-ancient text-lg tracking-widest ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>
                      ↺ 继续上一局
                    </span>
                    <span className={`text-[11px] tracking-wide ${theme === 'dark' ? 'text-stone-400' : 'text-[#6b6459]'}`}>
                      {myHeroName} · {savedGame.playerCount}人局 · 存于 {savedAt}
                    </span>
                  </button>
                );
              })()}
              
              {/* 玩法说明入口 */}
              <button
                onClick={() => setShowRules(true)}
                className={`group flex items-center gap-2 px-6 py-2 rounded-full border transition-all hover:scale-105 ${
                  theme === 'dark'
                    ? 'border-[#8b7355]/50 text-[#c8bda8] hover:border-[#d4af37] hover:text-[#e8cf94]'
                    : 'border-[#c4a77d]/60 text-[#5d4037] hover:border-[#8b6914] hover:text-[#3d2914]'
                }`}
              >
                <span>📖</span>
                <span className="tracking-widest font-semibold">玩法说明</span>
              </button>

              {/* 特性标签 */}
              <div className={`flex gap-6 md:gap-10 text-sm mt-6 ${theme === 'dark' ? 'text-stone-400' : 'text-[#3d2914]'}`}>
                <span className="flex items-center gap-2 group cursor-default">
                  <span className={`w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125 ${theme === 'dark' ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-gradient-to-br from-[#b85a5a] to-[#9a4040] shadow-[0_0_8px_rgba(184,90,90,0.5)]'}`}></span>
                  <span className={`font-semibold transition-colors ${theme === 'dark' ? 'group-hover:text-amber-300/80' : 'group-hover:text-[#1a0f0a]'}`} style={theme === 'light' ? { textShadow: '0 1px 2px rgba(255,255,255,0.6)' } : {}}>策略对战</span>
                </span>
                <span className="flex items-center gap-2 group cursor-default">
                  <span className={`w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125 ${theme === 'dark' ? 'bg-gradient-to-br from-amber-500 to-amber-700 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-gradient-to-br from-[#b8956a] to-[#9a7a4a] shadow-[0_0_8px_rgba(184,149,106,0.5)]'}`}></span>
                  <span className={`font-semibold transition-colors ${theme === 'dark' ? 'group-hover:text-amber-300/80' : 'group-hover:text-[#1a0f0a]'}`} style={theme === 'light' ? { textShadow: '0 1px 2px rgba(255,255,255,0.6)' } : {}}>智慧博弈</span>
                </span>
                <span className="flex items-center gap-2 group cursor-default">
                  <span className={`w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125 ${theme === 'dark' ? 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-gradient-to-br from-[#6a8cb8] to-[#4a6c98] shadow-[0_0_8px_rgba(106,140,184,0.5)]'}`}></span>
                  <span className={`font-semibold transition-colors ${theme === 'dark' ? 'group-hover:text-amber-300/80' : 'group-hover:text-[#1a0f0a]'}`} style={theme === 'light' ? { textShadow: '0 1px 2px rgba(255,255,255,0.6)' } : {}}>身份欺诈</span>
                </span>
              </div>
            </div>
        </div>
        
        {/* 玩法说明弹窗 */}
        {showRules && (
          <div className="absolute inset-0 z-[120] modal-mask flex items-center justify-center p-4" onClick={() => setShowRules(false)}>
            <div
              className="modal-shell max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 scrollbar-thin"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h3 className="modal-title text-4xl font-ancient">📖 玩法说明</h3>
                <div className="w-40 modal-divider mx-auto mt-3"></div>
              </div>

              <div className="space-y-5 text-[#e5dcc8]">
                {/* 身份 */}
                <section className="bg-black/25 rounded-lg p-4 border border-[#8b7355]/30">
                  <h4 className="font-ancient text-xl text-[#e8cf94] mb-2">身份与胜利</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-2 rounded bg-[#c8a45c]/10 border border-[#c8a45c]/30"><span className="font-bold text-[#e8cf94]">主公</span>：明示身份，体力上限+1</div>
                    <div className="p-2 rounded bg-[#c8a45c]/10 border border-[#c8a45c]/30"><span className="font-bold text-[#e8cf94]">忠臣</span>：与主公同阵营</div>
                    <div className="p-2 rounded bg-[#9e2b25]/15 border border-[#c86b62]/40"><span className="font-bold text-[#f0c8c2]">反贼</span>：击杀主公即胜</div>
                    <div className="p-2 rounded bg-[#3a3a4a]/30 border border-[#7a7a96]/40"><span className="font-bold text-[#e8e8f0]">内奸</span>：最后与主公单挑并获胜</div>
                  </div>
                  <p className="text-xs text-[#bfae94] mt-2">身份在角色阵亡时公开。杀死反贼摸3张牌；主公误杀忠臣需弃光手牌。</p>
                </section>

                {/* 流程 */}
                <section className="bg-black/25 rounded-lg p-4 border border-[#8b7355]/30">
                  <h4 className="font-ancient text-xl text-[#e8cf94] mb-2">回合流程</h4>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {['回合开始', '判定', '摸牌阶段', '出牌阶段', '弃牌阶段', '回合结束'].map((s, i) => (
                      <span key={s} className="flex items-center gap-2">
                        {i > 0 && <span className="text-[#8b7355]">→</span>}
                        <span className="px-2 py-0.5 rounded bg-[#2a2018] border border-[#8b7355]/40">{s}</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-[#bfae94] mt-2">判定区有延时锦囊（闪电 / 乐不思蜀 / 兵粮寸断）时，回合开始与摸牌、出牌阶段前会进行判定。弃牌阶段手牌不能超过当前体力值。</p>
                </section>

                {/* 牌类 */}
                <section className="bg-black/25 rounded-lg p-4 border border-[#8b7355]/30">
                  <h4 className="font-ancient text-xl text-[#e8cf94] mb-2">牌型速览</h4>
                  <ul className="text-sm space-y-1.5">
                    <li><span className="text-[#e8cf94] font-bold">基本牌</span>：杀（攻击）、闪（抵消杀）、桃（回血）、酒（杀伤害+1 或濒死自救）</li>
                    <li><span className="text-[#e8cf94] font-bold">锦囊牌</span>：决斗、无中生有、南蛮入侵、万箭齐发、顺手牵羊、过河拆桥、无懈可击、火攻、铁索连环、五谷丰登、桃园结义、借刀杀人、乐不思蜀、兵粮寸断、闪电</li>
                    <li><span className="text-[#e8cf94] font-bold">装备牌</span>：武器（青釭剑 / 青龙偃月刀 / 方天画戟 / 诸葛连弩）、防具（八卦阵 / 仁王盾）、坐骑（赤兔 / 大宛 为 -1 进攻马，的卢 / 绝影 为 +1 防御马）。点击装备牌即刻上装</li>
                    <li><span className="text-[#e8cf94] font-bold">距离与范围</span>：默认攻击范围 1（左右相邻），装备武器可提升；【杀】无法打到范围外角色，顺手牵羊 / 兵粮寸断仅限距离 1</li>
                    <li><span className="text-[#e8cf94] font-bold">无懈可击</span>：仅在锦囊牌生效前打出响应，抵消其对一名角色的效果</li>
                    <li><span className="text-[#e8cf94] font-bold">铁索连环</span>：横置1-2名角色，被横置者受到属性伤害（如火攻）时伤害传导</li>
                  </ul>
                </section>

                {/* 操作 */}
                <section className="bg-black/25 rounded-lg p-4 border border-[#8b7355]/30">
                  <h4 className="font-ancient text-xl text-[#e8cf94] mb-2">操作技巧</h4>
                  <ul className="text-sm space-y-1.5">
                    <li>点击手牌选择，点击头像指定目标；再点一次可取消</li>
                    <li>桌面端快捷键：<span className="text-[#e8cf94] font-bold">1-9</span> 选手牌 · <span className="text-[#e8cf94] font-bold">Enter</span> 出牌/确认 · <span className="text-[#e8cf94] font-bold">E</span> 结束回合 · <span className="text-[#e8cf94] font-bold">Esc</span> 取消选择</li>
                    <li>右上角 <span className="text-[#e8cf94] font-bold">⚡×N</span> 可加速 AI 结算节奏</li>
                    <li>遇到危险时别慌——弹出响应框前先看清需要什么牌</li>
                  </ul>
                </section>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowRules(false)}
                  className="px-10 py-3 bg-gradient-to-b from-[#8b4513] to-[#654321] text-[#f5deb3] rounded-lg border-2 border-[#d4af37]/50 hover:from-[#a0522d] hover:to-[#8b4513] hover:scale-105 transition-all font-ancient text-xl"
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 版本信息 */}
        <div className={`absolute bottom-6 flex flex-col items-center gap-1 text-xs tracking-widest ${theme === 'dark' ? 'text-stone-500' : 'text-[#5d4037]'}`}>
          <div className={`flex items-center gap-3 ${theme === 'dark' ? 'text-stone-400' : 'text-[#5d4037]'}`}>
            <span>对局 <span className={`font-bold ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>{stats.games}</span></span>
            <span className={theme === 'dark' ? 'text-stone-600' : 'text-[#c4b8a8]'}>|</span>
            <span>胜 <span className={`font-bold ${theme === 'dark' ? 'text-emerald-500' : 'text-[#3f7d55]'}`}>{stats.wins}</span></span>
            <span className={theme === 'dark' ? 'text-stone-600' : 'text-[#c4b8a8]'}>|</span>
            <span>负 <span className={`font-bold ${theme === 'dark' ? 'text-rose-500' : 'text-[#a83a3a]'}`}>{stats.losses}</span></span>
            {stats.games > 0 && (
              <>
                <span className={theme === 'dark' ? 'text-stone-600' : 'text-[#c4b8a8]'}>|</span>
                <span>胜率 <span className={`font-bold ${theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>{Math.round((stats.wins / stats.games) * 100)}%</span></span>
              </>
            )}
          </div>
          <div>
            <span className={theme === 'dark' ? 'text-amber-700/50' : 'text-[#8b6f4a]/70'}>◆</span> 三国杀 · {playerCount}人军争篇 v3.20 <span className={theme === 'dark' ? 'text-amber-700/50' : 'text-[#8b6f4a]/70'}>◆</span>
          </div>
        </div>
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

        {/* Header - 固定在顶部，不悬浮 */}
        <div className="flex-none relative z-20 px-4 pt-4">
          <div className="text-center py-4">
            <h2 className={`font-ancient text-5xl mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${theme === 'dark' ? 'text-yellow-500' : 'text-[#8b6914]'}`}>选择您的武将</h2>
            <div className={`w-48 h-0.5 bg-gradient-to-r from-transparent to-transparent mx-auto ${theme === 'dark' ? 'via-yellow-600' : 'via-[#8b6914]'}`}></div>
          </div>
          
          {/* 音乐控制按钮 */}
          <div className="absolute top-4 right-4">
            <button
              onClick={toggleMute}
              className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center shadow-lg mr-2 ${
                theme === 'dark'
                  ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37]'
                  : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#c4a77d]/50 hover:border-[#c4a77d]'
              }`}
              title={isMuted ? "开启音乐" : "静音"}
            >
              <span className="text-lg">{isMuted ? "🔇" : "🎵"}</span>
            </button>
          </div>

          {/* 主题切换按钮 */}
          <div className="absolute top-4 right-16">
            <button
              onClick={toggleTheme}
              className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center shadow-lg ${
                theme === 'dark'
                  ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37]'
                  : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#c4a77d]/50 hover:border-[#c4a77d]'
              }`}
              title={theme === 'dark' ? "切换到白天模式" : "切换到黑夜模式"}
            >
              <span className="text-lg">{theme === 'dark' ? "🌙" : "☀️"}</span>
            </button>
          </div>
        </div>
        
        {/* 可滚动内容区域 */}
        <div className="flex-1 overflow-y-auto px-4 pb-32 relative z-10">
        
        {/* Hero Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-6xl pb-32 relative z-10 mx-auto">
          {HEROES.map(hero => (
            <div 
              key={hero.id}
              onClick={() => setSelectedHero(hero)}
              className={`
                cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 relative group
                ${theme === 'dark' 
                  ? selectedHero?.id === hero.id 
                    ? 'bg-gradient-to-b from-[#3a3530] to-[#2a2520] border-[#f4d03f] scale-105 shadow-[0_0_40px_rgba(244,208,63,0.5),0_0_15px_rgba(244,208,63,0.3)] ring-2 ring-[#f4d03f]/30'
                    : 'bg-gradient-to-b from-[#2a2520] to-[#1a1815] border-[#5d4a3a] hover:border-[#8b7355] shadow-lg hover:shadow-[0_0_20px_rgba(139,115,85,0.3)]'
                  : selectedHero?.id === hero.id
                    ? 'bg-gradient-to-b from-[#f5e6c8] to-[#e8d4a8] border-[#b8860b] scale-105 shadow-[0_0_35px_rgba(184,134,11,0.45),0_0_12px_rgba(184,134,11,0.25)] ring-2 ring-[#b8860b]/20'
                    : 'bg-gradient-to-b from-[#f0e6d3] to-[#e0d0b8] border-[#a08060] hover:border-[#8b6914] shadow-lg hover:shadow-[0_0_15px_rgba(139,105,20,0.25)]'
                }
              `}
            >
              {/* Hero Image Area */}
              <div className={`h-48 md:h-64 overflow-hidden relative ${theme === 'dark' ? 'bg-[#1a1510]' : 'bg-[#d4c4a8]'}`}>
                 <img src={hero.avatarUrl} alt={hero.name} loading="lazy" decoding="async" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110" />
                 
                 {/* Kingdom Badge - 深墨章 + 势力色字，与对局界面统一 */}
                 <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-[4px] rotate-3 font-bold text-xs border shadow-md bg-[#161210]/95 border-[#c8a45c]/50 ${
                   hero.kingdom === '魏' ? 'text-[#8fb4d9]' :
                   hero.kingdom === '蜀' ? 'text-[#d98a8a]' :
                   hero.kingdom === '吴' ? 'text-[#8fc39a]' :
                   'text-[#bfae94]'
                 }`}>
                   {hero.kingdom}
                 </div>
                 
                 {/* HP Badge */}
                 <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-[4px] font-bold text-xs border ${theme === 'dark' ? 'bg-black/60 text-[#e8a99f] border-[#9e2b25]/60' : 'bg-[#f5ebe0] text-[#9e2b25] border-[#c86b62]/50 shadow-sm'}`}>
                   ♥ {hero.maxHp}
                 </div>
                 
                 {/* Hover Overlay */}
                 <div className={`absolute inset-0 bg-gradient-to-t opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'from-[#1a1510]/80 to-transparent' : 'from-[#8b6914]/20 to-transparent'}`}></div>
              </div>
              
              {/* Hero Info */}
              <div className={`p-4 ${theme === 'dark' ? 'bg-gradient-to-b from-[#2a2520] to-[#1a1815]' : 'bg-gradient-to-b from-[#e8dcc8] to-[#d4c4a8]'}`}>
                <h3 className={`font-ancient text-3xl text-center mb-3 ${theme === 'dark' ? 'text-[#d4af37] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-[#5d3a1a] drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)]'}`}>{hero.name}</h3>
                
                {/* Skill Description */}
                <div className={`p-3 rounded-lg border shadow-inner ${theme === 'dark' ? 'bg-[#0f0c0a]/80 border-[#3d3025]/60' : 'bg-[#fffdf9]/90 border-[#8b6914]/30'}`}>
                    <div className={`text-sm font-extrabold mb-2 text-center tracking-wide ${theme === 'dark' ? 'text-[#f4d03f] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-[#6b4a1a] drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]'}`}>【{hero.skillName}】</div>
                    <div className={`text-xs leading-relaxed text-center font-semibold ${theme === 'dark' ? 'text-[#d4c4a8] drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]' : 'text-[#3d2914] drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)]'}`}>{hero.skillDesc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Confirm Button - 固定在底部 */}
        {selectedHero && (
          <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center z-30">
            <div className="flex flex-col items-center gap-3">
              {/* Selected Hero Info */}
              <div className={`flex items-center gap-3 px-5 py-2 rounded-full border shadow-lg ${theme === 'dark' ? 'bg-stone-900/90 border-yellow-600/50' : 'bg-[#faf8f5]/95 border-[#c4a77d]/50'}`}>
                <img src={selectedHero.avatarUrl} alt={selectedHero.name} loading="eager" decoding="async" className="w-10 h-10 rounded-full border-2 border-yellow-500" />
                <div>
                  <div className={`text-xs ${theme === 'dark' ? 'text-stone-300' : 'text-[#5d4037]'}`}>已选择</div>
                  <div className={`font-ancient text-lg ${theme === 'dark' ? 'text-yellow-500' : 'text-[#8b6914]'}`}>{selectedHero.name}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    const pool = HEROES.filter(h => h.id !== selectedHero?.id);
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    startGame(pick);
                  }}
                  className={`px-6 py-3 rounded-full font-bold text-lg transition-all transform hover:scale-105 hover:-translate-y-1 font-ancient tracking-widest border-2 shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gradient-to-b from-[#2a2520] to-[#1a1815] text-[#c8bda8] border-[#8b7355]/60 hover:border-[#d4af37] hover:text-[#e8cf94]'
                      : 'bg-gradient-to-b from-[#e8dcc8] to-[#d4c4a8] text-[#5d4037] border-[#a08060] hover:border-[#8b6914]'
                  }`}
                  title="随机挑选一名武将立即出战"
                >
                  🎲 天命随机
                </button>
                <button
                  onClick={() => startGame(selectedHero)}
                  className={`group relative px-12 py-3 rounded-full font-bold text-xl transition-all transform hover:scale-105 hover:-translate-y-1 font-ancient tracking-widest border-2 shadow-[0_0_25px_rgba(234,179,8,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] ${
                    theme === 'dark'
                      ? 'bg-gradient-to-b from-yellow-600 to-yellow-800 hover:from-yellow-500 hover:to-yellow-700 text-stone-100 border-yellow-500'
                      : 'bg-gradient-to-b from-[#c4a77d] to-[#a08050] hover:from-[#d4b87d] hover:to-[#b09060] text-white border-[#8b6914]'
                  }`}
                >
                  <span className="relative z-10">确认出战</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  if (screen === 'gameover') {
    return (
      <div className={`h-screen w-full flex flex-col items-center justify-center text-center p-4 relative overflow-hidden ${theme === 'light' ? 'parchment-bg' : 'bg-black'}`}>
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
             {/* 羊皮纸纹理层 */}
             <div className="absolute inset-0 bg-gradient-to-br from-[#1a1410] via-[#2d2418] to-[#1a1410]"></div>
             
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

         {/* 音乐控制按钮 */}
         <div className="absolute top-4 right-4 z-50">
           <button
             onClick={toggleMute}
             className={`w-10 h-10 rounded-full border-2 hover:border-[#d4af37] hover:scale-110 transition-all flex items-center justify-center shadow-lg ${theme === 'dark' ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50' : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#c4a77d]/50'}`}
             title={isMuted ? "开启音乐" : "静音"}
           >
             <span className="text-lg">{isMuted ? "🔇" : "🎵"}</span>
           </button>
         </div>

         <div className={`absolute top-1/3 left-1/4 w-96 h-96 rounded-full blur-[120px] ${theme === 'dark' ? 'bg-red-900/10' : 'bg-red-500/5'}`}></div>
         <div className={`absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full blur-[120px] ${theme === 'dark' ? 'bg-yellow-900/10' : 'bg-amber-500/5'}`}></div>

         {/* 胜负判定横幅 */}
         {(() => {
           const myIdentity = players.find(p => p.isHuman)?.identity;
           const isVictory = winnerSide !== null && myIdentity !== undefined && (
             (winnerSide === 'rebel' && myIdentity === Identity.FANZEI) ||
             (winnerSide === 'lord' && (myIdentity === Identity.ZHUGONG || myIdentity === Identity.ZHONGCHEN)) ||
             (winnerSide === 'spy' && myIdentity === Identity.NEIJIAN)
           );
           return (
             <div className={`z-20 mb-6 px-10 py-3 rounded-lg border-2 font-ancient text-3xl md:text-4xl tracking-[0.3em] shadow-[0_10px_40px_rgba(0,0,0,0.5)] animate-fade-in-scale ${
               isVictory
                 ? 'bg-gradient-to-b from-[#c9a227] to-[#9a7a1a] text-[#fff8e0] border-[#f4d03f] shadow-[0_0_40px_rgba(212,175,55,0.4)]'
                 : 'bg-gradient-to-b from-stone-700 to-stone-900 text-stone-300 border-stone-500'
             }`}>
               {isVictory ? '大 获 全 胜' : '败 走 麦 城'}
             </div>
           );
         })()}

         <h1 className={`font-ancient text-8xl md:text-9xl mb-8 z-10 drop-shadow-2xl relative ${theme === 'light' ? 'text-[#8b6914]' : 'text-yellow-600'}`}>
           游戏结束
           <span className="absolute -inset-4 bg-yellow-600/10 blur-xl rounded-lg"></span>
         </h1>
         <h2 className={`text-4xl md:text-5xl font-ancient mb-12 z-10 border-b-2 pb-4 ${theme === 'dark' ? 'text-stone-200 border-stone-600' : 'text-[#2d2a26] border-[#c4a77d]'}`}>
           获胜方：<span className="text-red-500">{winnerSide ? WINNER_LABEL[winnerSide] : ''}</span>
         </h2>
         
         <div className="z-10 modal-shell rounded-2xl p-8 mb-8 max-w-4xl w-full">
           <h3 className="modal-title text-3xl font-ancient mb-1 text-center">玩家身份</h3>
           <div className="modal-divider mb-6" />
           <div className="flex flex-wrap justify-center gap-4">
             {players.map((player, idx) => (
               <div
                 key={player.id}
                 className={`reveal-card flex flex-col items-center p-4 rounded-xl border transition-all duration-300 w-[104px]
                   ${player.isDead
                     ? 'bg-black/45 border-[#9e2b25]/60 opacity-70 grayscale'
                     : 'bg-black/25 border-[#8b7355]/35 hover:border-[#c8a45c]/70 hover:bg-black/35'
                   }
                 `}
                 style={{ animationDelay: `${idx * 90}ms` }}
               >
                 <img src={player.hero.avatarUrl} alt={player.hero.name} loading="lazy" decoding="async" className={`w-16 h-16 rounded-full mb-3 border-2 object-cover ${player.isDead ? 'border-[#9e2b25]/60 grayscale' : 'border-[#c8a45c]/55'}`} />
                 <div className="text-lg modal-text font-bold mb-2">
                   {player.hero.name}
                 </div>
                 <div className={`text-base font-ancient px-3 py-1 rounded-full
                   ${player.isDead
                     ? 'bg-red-900/60 text-red-300'
                     : player.identity === Identity.ZHUGONG ? 'bg-yellow-700/60 text-yellow-300' :
                       player.identity === Identity.ZHONGCHEN ? 'bg-blue-800/60 text-blue-300' :
                       player.identity === Identity.FANZEI ? 'bg-red-800/60 text-red-300' :
                       'bg-purple-800/60 text-purple-300'
                   }
                 `}>
                   {player.isRevealed ? player.identity : '未知'}
                 </div>
                 <div className={`text-sm mt-2 ${player.isDead ? 'text-red-500' : 'text-green-500'}`}>
                   {player.isDead ? '阵亡' : '存活'}
                 </div>
               </div>
             ))}
           </div>

           {/* 结算收尾：牌堆与弃牌堆余量，用牌背小方块延续牌堆视觉 */}
           <div className="mt-6 pt-4 border-t border-[#8b7355]/30 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm">
             <span className="flex items-center gap-2">
               <span
                 className="w-4 h-6 rounded-[2px] border border-[#8b7355]/60 shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
                 style={{ background: 'linear-gradient(155deg,#2b2320 0%,#221b18 55%,#151110 100%)' }}
               />
               <span className="modal-text-dim">牌堆剩余 <b className="font-ancient text-[#e8cf94] text-base">{deck.length}</b> 张</span>
             </span>
             <span className="flex items-center gap-2">
               <span className="w-4 h-6 rounded-[2px] border border-[#6a5642]/60 bg-[#221b16] shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
               <span className="modal-text-dim">弃牌堆 <b className="font-ancient text-[#e8cf94] text-base">{discardPile.length}</b> 张</span>
             </span>
           </div>
         </div>

         <div className="z-10 flex gap-4">
           <button
            onClick={() => {
              const myHero = players.find(p => p.isHuman)?.hero;
              if (myHero) startGame(myHero);
            }}
            className="btn-gold z-10 px-10 py-4 font-ancient text-2xl rounded-lg"
          >
            再来一局
          </button>
           <button
            onClick={() => setScreen('start')}
            className="btn-ink z-10 px-10 py-4 font-ancient text-2xl rounded-lg"
          >
            返回主营
          </button>
         </div>
      </div>
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
  const isCompact = viewport.h > 0 && viewport.h < 780;

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden relative font-serif ${theme === 'light' ? 'parchment-bg' : 'bg-[#1c1c1c]'}`}>
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
            ? 'linear-gradient(180deg, #14100d 0%, #241b14 48%, #0c0906 100%)'
            : 'linear-gradient(180deg, #faf8f5 0%, #f2ece2 48%, #ece5d9 100%)'
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
                 <h3 className="modal-title text-xl font-ancient">🗂️ 弃牌堆 <span className="text-sm opacity-60 tracking-normal normal-case">{discardPile.length} 张</span></h3>
                 <button
                   onClick={() => setShowDiscardViewer(false)}
                   className="btn-ink w-8 h-8 rounded-full flex items-center justify-center text-sm"
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
      
      {/* Skill Info Modal - 技能说明弹窗 */}
      {showSkillModal && (
         <div className="absolute inset-0 z-[100] modal-mask flex items-center justify-center p-4">
            <div className="modal-shell max-w-3xl w-[95%] max-h-[85vh] overflow-y-auto p-6 scrollbar-thin">
               {/* 标题 */}
               <div className="text-center mb-6">
                 <h3 className="modal-title text-4xl font-ancient mb-2">📜 技能说明</h3>
                 <div className="w-32 modal-divider mx-auto"></div>
               </div>

               {/* 武将信息 */}
               <div className="flex items-center gap-4 mb-6 p-4 bg-black/30 rounded-lg border border-[#8b7355]/30">
                 <img src={me.hero.avatarUrl} alt={me.hero.name} loading="eager" decoding="async" className="w-20 h-20 rounded-lg border-2 border-[#d4af37]/50" />
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
                       <span>🎴</span> 当前手牌使用效果
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
                         : '请选择是否使用【酒】救援'}
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
                       const isSaveCard = card.name === CardName.TAO || card.name === CardName.JIU;
                       const cardType = card.name === CardName.TAO ? '桃' : '酒';
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
                        disabled={!me.hand.some(c => c.name === CardName.TAO || c.name === CardName.JIU)}
                        className={`px-8 py-3 rounded-lg font-ancient text-xl ${
                          me.hand.some(c => c.name === CardName.TAO || c.name === CardName.JIU)
                          ? 'btn-gold'
                          : 'btn-ink opacity-45'
                        }`}
                      >
                        {dyingState.hasTao ? '使用桃' : '使用酒'}
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
              <h3 className="modal-title text-4xl font-ancient mb-3">🌾 五谷丰登</h3>
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
      <div className="absolute top-2 left-2 z-[230]">
        <button
          onClick={() => setIsAiTakeover(!isAiTakeover)}
          title={isAiTakeover ? '关闭托管，亲自操作' : '开启托管，由 AI 代打（弹窗期间点击也会立即接管）'}
          className={`h-10 px-3 rounded-full border-2 flex items-center gap-1.5 shadow-lg transition-all hover:scale-105 text-sm font-bold tracking-wider ${
            isAiTakeover
              ? 'bg-[#9e2b25] border-[#c86b62] text-[#f7e7cf] shadow-[0_0_16px_rgba(158,43,37,0.5)]'
              : theme === 'dark'
                ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 text-[#e8cf94] hover:border-[#d4af37]'
                : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#c4a77d]/60 text-[#8b6914] hover:border-[#c4a77d]'
          }`}
        >
          <span>{isAiTakeover ? '🤖' : '🎮'}</span>
          <span>{isAiTakeover ? '托管中' : '托管'}</span>
        </button>
      </div>

      {/* Top Area: Enemies - 原版三国杀环形布局 */}
      <div className="flex-none pt-3 pb-2 z-10 relative">
        {/* 顶部装饰条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-700/50 to-transparent"></div>

        {/* 音乐控制按钮 */}
        <div className="absolute top-2 right-4 z-50">
          <button
            onClick={toggleMute}
            className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center shadow-lg ${
              theme === 'dark'
                ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37]'
                : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#e5e0db] hover:border-[#c4a77d]'
            }`}
            title={isMuted ? "开启音乐" : "静音"}
          >
            <span className="text-lg">{isMuted ? "🔇" : "🎵"}</span>
          </button>
        </div>

        {/* 主题切换按钮 */}
        <div className="absolute top-2 right-16 z-50">
          <button
            onClick={toggleTheme}
            className={`w-10 h-10 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center shadow-lg ${
              theme === 'dark'
                ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37]'
                : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#e5e0db] hover:border-[#c4a77d]'
            }`}
            title={theme === 'dark' ? "切换到白天模式" : "切换到黑夜模式"}
          >
            <span className="text-lg">{theme === 'dark' ? "🌙" : "☀️"}</span>
          </button>
        </div>

        {/* 游戏速度控制 */}
        <div className="absolute top-2 right-28 z-50">
          <button
            onClick={() => setSpeedLevel(speedLevel === 1 ? 2 : speedLevel === 2 ? 3 : 1)}
            className={`h-10 px-3 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center shadow-lg font-bold text-sm tracking-wider ${
              theme === 'dark'
                ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37] text-[#e8cf94]'
                : 'bg-gradient-to-b from-[#faf8f5] to-[#f5f0eb] border-[#e5e0db] hover:border-[#c4a77d] text-[#5c5854]'
            }`}
            title="切换游戏速度"
          >
            ⚡ ×{speedLevel}
          </button>
        </div>

        {/* 环形座位布局 */}
        <div className={`relative w-full flex items-start justify-center gap-1 overflow-x-auto md:block ${isCompact ? 'md:h-[152px]' : 'md:h-[288px]'} md:gap-0 md:overflow-visible py-1 md:py-0 px-1 md:px-0 scrollbar-hide`}>
          {enemies.map((p, index) => {
            // 计算环形位置
            const totalEnemies = enemies.length;
            const angleStep = 180 / (totalEnemies + 1); // 上半圆分布
            const angle = angleStep * (index + 1); // 从左侧开始
            const radian = (angle * Math.PI) / 180;
            
            // 计算位置（以屏幕中心为基准）
            const centerX = 50; // 中心点百分比
            const radius = 42; // 半径百分比
            const left = centerX - radius * Math.cos(radian);
            const top = radius * Math.sin(radian) * 0.6; // 压缩垂直方向
            // 选中【杀】类牌时，超出攻击范围的目标灰显
            const outOfRange = !p.isDead && isSelectingTarget && slashLikeActive && getDistance(me.id, p.id) > getAttackRange(me);
            
            return (
            <div 
              key={p.id} 
              className="ring-seat"
              style={{
                '--seat-left': `${left}%`,
                '--seat-top': `${top}%`,
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
              
              {/* 玩家卡牌容器 - 统一深墨描金 */}
              <div
                onClick={(isSelectingTarget || isLijianMode || isJieyinMode || (isRendeMode && rendeSelectedCardIds.length > 0) || (isJiedaoMode && !p.isDead)) ? () => handleTargetClick(p.id) : undefined}
                className={`
                relative p-1.5 md:p-2 rounded-lg border-2 kingdom-frame hero-card ${KINGDOM_CLASS[p.hero.kingdom] ?? ''}
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
              `}>
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

                {/* 武将头像区域 */}
                <div className={`relative w-[74px] h-[92px] ${isCompact ? 'md:w-[64px] md:h-[76px]' : 'md:w-24 md:h-28'} mb-2 ${
                  healAnimTarget === p.id ? 'animate-heal-glow' :
                  damageAnimTarget === p.id ? 'animate-damage-glow' : ''
                } ${skillGlowId === p.id ? 'skill-glow' : ''} ${aiThinkingId === p.id ? 'ai-thinking' : ''}`}>
                  {/* 描金外框：统一色调，势力色只保留在小印章上，降低整屏配色噪音 */}
                  <div className="absolute -inset-1 rounded-lg bg-gradient-to-br from-[#c8a45c]/45 via-[#8b7355]/25 to-[#5a4a38]/15"></div>
                  
                  {/* 头像 */}
                  <div className="relative w-full h-full rounded-lg overflow-hidden border border-[#c8a45c]/55 hero-portrait">
                    <img 
                      src={p.hero.avatarUrl} 
                      alt={p.hero.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#241b14"/><text x="128" y="158" font-size="96" fill="#c8a45c" text-anchor="middle" font-family="serif">${p.hero.name}</text></svg>`)}`;
                      }}
                    />
                    
                    {/* 阵亡遮罩 */}
                    {p.isDead && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                        <span className="font-ancient text-[#c86b62] text-xl font-bold transform -rotate-12 border border-[#9e2b25] px-2 py-1">
                          阵亡
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* 势力标识：深墨圆环 + 势力色字，不用大面积彩色底 */}
                  <div className={`
                    absolute -top-2 -left-2 w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold border shadow-md
                    bg-[#1a1512] border-[#c8a45c]/50
                    ${p.hero.kingdom === '魏' ? 'text-[#8fb4d9]' :
                      p.hero.kingdom === '蜀' ? 'text-[#d98a8a]' :
                      p.hero.kingdom === '吴' ? 'text-[#8fc39a]' :
                      'text-[#bfae94]'
                    }
                  `}>
                    {p.hero.kingdom}
                  </div>
                  
                  {/* 身份标识：朱印方章 */}
                  {(p.isRevealed || p.isHuman || p.identity === Identity.ZHUGONG) && (
                    <div className={`
                      absolute -bottom-2 -right-2 w-7 h-7 flex items-center justify-center rounded-[4px] rotate-3 font-bold text-[11px] border shadow-md
                      ${p.identity === Identity.ZHUGONG ? 'bg-[#c8a45c] border-[#e8cf94] text-[#2a1f14]' :
                        p.identity === Identity.ZHONGCHEN ? 'bg-[#8a5a20] border-[#c8a45c]/70 text-[#f7e7cf]' :
                        p.identity === Identity.FANZEI ? 'bg-[#9e2b25] border-[#c86b62] text-[#f7e7cf]' :
                        'bg-[#3a3a4a] border-[#7a7a96] text-[#e8e8f0]'
                      }
                    `}>
                      {p.identity === Identity.ZHUGONG ? '主' :
                        p.identity === Identity.ZHONGCHEN ? '忠' :
                        p.identity === Identity.FANZEI ? '反' : '内'
                      }
                    </div>
                  )}
                </div>
                
                {/* 武将信息 */}
                <div className="text-center">
                  <div className={`font-ancient text-base mb-1 truncate ${theme === 'dark' ? 'text-[#e8dcc8]' : 'text-[#3a332a]'}`}>{p.hero.name}</div>
                  {/* 技能名牌：官方武将牌在姓名下方标注技能 */}
                  <div className="kingdom-name text-[10px] tracking-[0.12em] leading-none mb-1 truncate opacity-85">【{p.hero.skillName}】</div>
                  
                  {/* 体力值 - 朱红勾玉 */}
                  <div className="flex justify-center gap-0.5 mb-1.5">
                    {Array.from({ length: p.maxHp }).map((_, i) => (
                      <div 
                        key={i}
                        className={`
                          w-3 h-3 md:w-3.5 md:h-3.5 hp-fish
                          ${i < p.hp 
                            ? (p.hp === 1 ? 'hp-fish-low' : '')
                            : 'hp-fish-empty'
                          }
                        `}
                      />
                    ))}
                  </div>
                  
                  {/* 状态标志 - 铁索连环、乐不思蜀、兵粮寸断 */}
                  {(p.isChained || p.isLeBuSiShu || p.isBingLiangCunDuan) && (
                    <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
                      {p.isChained && (
                        <div className="w-5 h-5 rounded-full bg-amber-700 border border-amber-500 flex items-center justify-center" title="铁索连环">
                          <span className="text-[10px] text-amber-200 font-bold">链</span>
                        </div>
                      )}
                      {p.isLeBuSiShu && (
                        <div className="w-5 h-5 rounded-full bg-purple-700 border border-purple-500 flex items-center justify-center" title="乐不思蜀">
                          <span className="text-[10px] text-purple-200 font-bold">乐</span>
                        </div>
                      )}
                      {p.isBingLiangCunDuan && (
                        <div className="w-5 h-5 rounded-full bg-blue-700 border border-blue-500 flex items-center justify-center" title="兵粮寸断">
                          <span className="text-[10px] text-blue-200 font-bold">兵</span>
                        </div>
                      )}
                      {p.isShandian && (
                        <div className="w-5 h-5 rounded-full bg-purple-700 border border-purple-400 flex items-center justify-center animate-pulse" title="闪电悬顶">
                          <span className="text-[10px] text-purple-100 font-bold">电</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 装备区 */}
                  {(p.equipment?.weapon || p.equipment?.armor || p.equipment?.horsePlus || p.equipment?.horseMinus) && (
                    <div className="flex items-center justify-center gap-1 mb-1 flex-wrap max-w-[120px] mx-auto">
                      {p.equipment?.weapon && (
                        <span className="px-1 py-0.5 rounded-[3px] bg-[#2b3a2b]/80 border border-[#6a8a6a]/50 text-[#cfe8cf] text-[10px] leading-none" title={`武器：${p.equipment.weapon.name}`}>
                          {p.equipment.weapon.name.length > 3 ? p.equipment.weapon.name.slice(0, 3) : p.equipment.weapon.name}
                        </span>
                      )}
                      {p.equipment?.armor && (
                        <span className="px-1 py-0.5 rounded-[3px] bg-[#2b3340]/80 border border-[#6a8296]/50 text-[#cfe0ee] text-[10px] leading-none" title={`防具：${p.equipment.armor.name}`}>
                          {p.equipment.armor.name}
                        </span>
                      )}
                      {p.equipment?.horsePlus && (
                        <span className="px-1 py-0.5 rounded-[3px] bg-[#2b3346]/80 border border-[#6a7ea0]/50 text-[#d0dcf0] text-[10px] leading-none" title={`防御马：${p.equipment.horsePlus.name}`}>
                          +1马
                        </span>
                      )}
                      {p.equipment?.horseMinus && (
                        <span className="px-1 py-0.5 rounded-[3px] bg-[#402b33]/80 border border-[#a06a7e]/50 text-[#f0d0dc] text-[10px] leading-none" title={`进攻马：${p.equipment.horseMinus.name}`}>
                          -1马
                        </span>
                      )}
                    </div>
                  )}

                  {/* 手牌数 */}
                  <div className="flex items-center justify-center gap-1 md:gap-2 text-[10px] md:text-xs mt-1">
                    <span className="text-stone-500">手牌</span>
                    <span className="text-yellow-500 font-bold">{p.hand.length}</span>
                    <span className="text-stone-500">距离</span>
                    <span className={`font-bold ${getDistance(me.id, p.id) <= getAttackRange(me) ? 'text-emerald-400' : 'text-stone-500'}`}>
                      {getDistance(me.id, p.id)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Middle: Field - 原版三国杀风格 */}
      <div className="flex-1 relative flex items-center justify-center w-full">
        
        {/* Logs - 左侧日志区域 - 可滚动 - 优化位置和大小 */}
        <div className="absolute left-2 top-0 bottom-4 w-80 hidden md:block z-10">
           <div className="h-full flex flex-col bg-gradient-to-b from-[#171310]/95 to-[#0d0a07]/95 rounded-b-lg border-x border-b border-[#8b7355]/40 shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden">
             {/* 标题栏 */}
             <div className="flex-none px-3 py-2 border-b border-[#8b7355]/30 bg-black/30">
               <div className="text-[#c8a45c]/90 text-xs font-bold tracking-wider">📜 战况记录 <span className="text-[#c8a45c]/45 font-normal">({logs.length})</span></div>
             </div>
             {/* 可滚动日志内容 */}
             <div 
               ref={logsContainerRef}
               className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-transparent max-h-[calc(100vh-200px)]"
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
        </div>

        {/* Mobile Toast Log */}
        <div className="md:hidden absolute top-0 left-0 right-0 p-2 pointer-events-none z-20 flex flex-col items-center">
           {logs.slice(-2).map(log => (
             <div key={log.id} className="bg-[#14100c]/90 text-[#f0e0c4] py-2 px-4 mb-1 rounded-lg border border-[#c8a45c]/45 text-xs shadow-[0_4px_18px_rgba(0,0,0,0.55)] w-full text-center backdrop-blur-sm">
               {log.text}
             </div>
           ))}
        </div>

        {/* Phase Indicator - 五阶段进度轨 */}
        <div className={`absolute top-4 right-4 rounded-xl px-4 py-2.5 z-10 border shadow-lg ${theme === 'dark' ? 'bg-stone-900/85 border-stone-600' : 'bg-[#faf8f5]/90 border-[#c4a77d]/60'}`}>
          <div className={`text-[10px] mb-1.5 tracking-widest ${theme === 'dark' ? 'text-stone-400' : 'text-[#5c5854]'}`}>当前阶段</div>
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
                    px-1.5 py-0.5 rounded text-[11px] font-bold font-ancient transition-all duration-300
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
              <span className={`text-[11px] font-bold tabular-nums tracking-wider ${decisionLeft <= 5 ? 'text-[#e0705f] animate-pulse' : theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>
                {decisionLeft}s
              </span>
            </div>
          )}
        </div>

        {/* Center Decks - 牌堆和弃牌堆 - 原版三国杀风格 */}
        <div className="flex items-center gap-12 z-0 transform scale-90 md:scale-100">
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
                 <div className={`w-24 h-36 rounded-lg flex flex-col items-center justify-center border border-dashed ${theme === 'dark' ? 'border-[#6a5642]/60 text-stone-500 bg-black/30' : 'border-[#c4a77d]/60 text-[#8a8680] bg-[#f5f0eb]/40'}`}>
                   <span className="font-ancient text-base opacity-70">弃牌堆</span>
                   <span className="text-xs mt-1 opacity-50">0</span>
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
                <span className="text-3xl">📜</span>
                <div className="modal-title font-ancient text-2xl">孔明锦囊</div>
             </div>
             <p className="text-sm modal-text leading-relaxed italic tracking-wide">"{advice}"</p>
             <button onClick={() => setAdvice(null)} className="btn-ink mt-4 w-full text-sm py-2 rounded-lg">收起</button>
          </div>
        )}
      </div>

      {/* Bottom: Player Controls & Hand - 原版三国杀风格 */}
      <div className={`flex-none z-20 pb-2 pt-3 relative ${theme === 'dark' ? 'bg-gradient-to-t from-[#050505] via-[#0f0f0f] to-transparent' : 'bg-gradient-to-t from-[#f5f0eb]/60 via-transparent to-transparent'}`}>
        {/* 底部装饰线 */}
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${theme === 'dark' ? 'via-yellow-700/30' : 'via-[#c4a77d]/30'} to-transparent`}></div>
        
        {/* 玩家信息栏 */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-2 px-2 md:px-4 mb-2 md:mb-3">
          {/* 玩家头像和信息 - 原版三国杀风格 */}
          <div className="flex items-center gap-4">
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
                <div className={`relative w-20 h-24 ${isCompact ? 'md:w-[76px] md:h-[90px]' : 'md:w-24 md:h-28'} ${
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
                      className="w-full h-full object-cover"
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
                  <div className={`
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
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30">
                    <div className="bg-[#9e2b25] text-[#f7e7cf] text-[11px] px-4 py-0.5 rounded-full font-bold shadow-[0_2px_12px_rgba(158,43,37,0.55)] border border-[#c86b62]/70 whitespace-nowrap tracking-widest">
                      我的回合
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* 玩家详细信息面板 */}
            <div className={`rounded-xl px-4 py-3 border shadow-lg ${theme === 'dark' ? 'bg-[#1c1611]/90 border-[#8b7355]/45' : 'bg-[#fbf8f2]/90 border-[#c4a77d]/60'}`}>
              <div className={`font-ancient text-lg mb-2 ${theme === 'dark' ? 'text-[#e8dcc8]' : 'text-[#3a332a]'}`}>{me.hero.name}</div>
              
              {/* 体力值 - 朱红勾玉 */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}`}>体力</span>
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
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className={theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}>手牌</span>
                  <span className="text-[#e8cf94] font-bold text-lg">{me.hand.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}>技能</span>
                  <span className={`font-bold ${theme === 'dark' ? 'text-[#8fb4d9]' : 'text-[#3a6a8f]'}`}>{me.hero.skillName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}>范围</span>
                  <span className="text-emerald-400 font-bold">{getAttackRange(me)}</span>
                </div>
              </div>

              {/* 我的装备区 */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className={`text-xs ${theme === 'dark' ? 'text-stone-500' : 'text-[#8a8680]'}`}>装备</span>
                {me.equipment?.weapon ? (
                  <span className="px-2 py-0.5 rounded-[4px] bg-[#2b3a2b]/80 border border-[#6a8a6a]/60 text-[#cfe8cf] text-[11px] font-bold" title={EQUIP_META[me.equipment.weapon.name]?.desc}>
                    {me.equipment.weapon.name}({EQUIP_META[me.equipment.weapon.name]?.range ?? 1})
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 rounded-[4px] border border-dashed text-[11px] ${theme === 'dark' ? 'border-[#4a3f33] text-stone-600' : 'border-[#c4b8a8] text-[#b0aba5]'}`}>武器</span>
                )}
                {me.equipment?.armor ? (
                  <span className="px-2 py-0.5 rounded-[4px] bg-[#2b3340]/80 border border-[#6a8296]/60 text-[#cfe0ee] text-[11px] font-bold" title={EQUIP_META[me.equipment.armor.name]?.desc}>
                    {me.equipment.armor.name}
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 rounded-[4px] border border-dashed text-[11px] ${theme === 'dark' ? 'border-[#4a3f33] text-stone-600' : 'border-[#c4b8a8] text-[#b0aba5]'}`}>防具</span>
                )}
                {me.equipment?.horseMinus && (
                  <span className="px-2 py-0.5 rounded-[4px] bg-[#402b33]/80 border border-[#a06a7e]/60 text-[#f0d0dc] text-[11px] font-bold">-1马</span>
                )}
                {me.equipment?.horsePlus && (
                  <span className="px-2 py-0.5 rounded-[4px] bg-[#2b3346]/80 border border-[#6a7ea0]/60 text-[#d0dcf0] text-[11px] font-bold">+1马</span>
                )}
              </div>
            </div>
          </div>
            
            {/* Control Buttons - 操作按钮 - 原版三国杀风格 */}
            <div className="flex flex-wrap gap-2 md:gap-3 items-center relative z-40">
              {/* 操作按钮组 */}
              <div className={`flex flex-wrap items-center gap-2 rounded-xl p-2 border ${theme === 'dark' ? 'bg-[#14100d]/85 border-[#8b7355]/40' : 'bg-[#fbf8f2]/90 border-[#c4a77d]/50'}`}>
                {/* AI Takeover Toggle */}
                <button 
                  onClick={() => setIsAiTakeover(!isAiTakeover)}
                  className={`
                    px-4 py-2 rounded-lg border text-sm font-bold transition-colors
                    ${isAiTakeover 
                      ? 'bg-[#9e2b25] border-[#c86b62] text-[#f7e7cf] shadow-[0_0_14px_rgba(158,43,37,0.4)]' 
                      : theme === 'dark'
                        ? 'bg-[#241b16] border-[#8b7355]/50 text-[#c8bda8] hover:border-[#c8a45c] hover:text-[#e8cf94]'
                        : 'bg-[#efe8dc] border-[#c4a77d]/60 text-[#6a6055] hover:border-[#b8955c] hover:text-[#3a332a]'}
                  `}
                >
                  {isAiTakeover ? '🤖 AI托管中' : '🎮 托管'}
                </button>

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
                                className={`
                                  px-6 py-2 rounded-lg text-lg font-bold font-ancient shadow-lg transition-all border-2
                                  ${!!dyingState || !!isProcessing 
                                    ? 'bg-stone-800 text-stone-600 border-stone-700 cursor-not-allowed opacity-50' 
                                    : 'bg-gradient-to-b from-yellow-600 to-yellow-800 text-white border-yellow-400 hover:scale-105 hover:shadow-yellow-900/50 cursor-pointer'}
                                `}
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
                                className={`
                                  px-6 py-2 rounded-lg text-lg font-bold font-ancient shadow-lg transition-all border-2
                                  ${!!dyingState || !!isProcessing 
                                    ? 'bg-stone-800 text-stone-600 border-stone-700 cursor-not-allowed opacity-50' 
                                    : 'bg-gradient-to-b from-yellow-600 to-yellow-800 text-white border-yellow-400 hover:scale-105 hover:shadow-yellow-900/50 cursor-pointer'}
                                `}
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
                                className={`
                                  px-6 py-2 rounded-lg text-lg font-bold font-ancient shadow-lg transition-all border-2
                                  ${!!dyingState || !!isProcessing 
                                    ? 'bg-stone-800 text-stone-600 border-stone-700 cursor-not-allowed opacity-50' 
                                    : 'bg-gradient-to-b from-yellow-600 to-yellow-800 text-white border-yellow-400 hover:scale-105 hover:shadow-yellow-900/50 cursor-pointer'}
                                `}
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
                        onClick={endTurn}
                        disabled={!!dyingState || isProcessing}
                        className={`px-6 py-2 rounded-lg text-lg font-bold font-ancient shadow-lg transition-[transform,background-color,border-color] border-2
                          ${(dyingState || isProcessing) 
                            ? 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed opacity-50' 
                            : 'bg-[#2b2318] text-[#e8cf94] border-[#c8a45c]/60 hover:bg-[#3a2f22] hover:border-[#c8a45c] hover:scale-105'}
                        `}
                      >
                        结束回合
                      </button>
                    </>
                  )}
                </div>

                {/* Discard Button - 弃牌阶段 */}
                {isMyTurn && phase === GamePhase.DISCARD && !isAiTakeover && (
                  <button 
                    onClick={handleDiscardConfirm}
                    disabled={!!dyingState || isProcessing || !((me.hand.length - me.hp) === selectedCardIds.length && (me.hand.length - me.hp) > 0)}
                    className={`
                      px-8 py-3 rounded-lg text-xl font-bold font-ancient shadow-lg transition-[transform,background-color] border-2
                      ${(me.hand.length - me.hp) === selectedCardIds.length && (me.hand.length - me.hp) > 0 && !dyingState && !isProcessing
                        ? 'bg-[#9e2b25] text-[#f7e7cf] border-[#c86b62] hover:bg-[#b0322b] hover:scale-105 cursor-pointer shadow-[0_4px_18px_rgba(158,43,37,0.4)]' 
                        : 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed'}
                    `}
                  >
                    弃 牌
                  </button>
                )}
                
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
                  className={`px-4 py-2 rounded-lg border text-sm font-bold transition-colors flex items-center gap-2
                    ${(dyingState || isProcessing)
                      ? 'opacity-50 cursor-not-allowed bg-[#1a1512] border-[#3a3229] text-[#5a5248]'
                      : 'bg-[#2b2318] border-[#c8a45c]/60 text-[#e8cf94] hover:bg-[#3a2f22] hover:border-[#c8a45c] hover:text-[#f7e7cf]'}
                  `}
                >
                  <span>🎋</span>
                  问计
                </button>
            </div>
         </div>

         {/* Hand Cards Area - 手牌区域 */}
         <div className={`w-full overflow-x-auto overflow-y-visible px-2 sm:px-4 pb-1 scrollbar-hide flex justify-center relative ${isCompact ? 'pt-3 min-h-0' : 'pt-5 min-h-[132px] sm:min-h-[158px]'}`} style={{ zIndex: 10 }}>
           {/* 手牌背景 - 白天模式移除遮罩 */}
           {theme === 'dark' && (
             <div className="absolute inset-x-4 bottom-0 h-32 rounded-t-2xl pointer-events-none bg-gradient-to-t from-[#0c0906]/85 to-transparent"></div>
           )}
           
           <div className="flex -space-x-2 sm:space-x-1 md:space-x-2 items-end px-4 pb-2 relative">
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
               const lockOthers = (phase === GamePhase.ACTION && !isAiTakeover && !isZhihengMode && !isRendeMode && selectedCardIds.length > 0);

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
                      small={isCompact}
                    />
                  </div>
                </div>
               );
             })}
           </div>
         </div>
      </div>
    </div>
  );
};

export default App;
