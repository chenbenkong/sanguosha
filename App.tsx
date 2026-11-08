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


// 特效强度：经典（全无）/ 纯净（默认，干净卡面 + 翻牌 + 濒死）/ 克制（+ 技能特写）/ 完整（+ 出牌飞行、扫光）
type FxLevel = 'classic' | 'pure' | 'subtle' | 'full';
const FX_LABEL: Record<FxLevel, string> = {
  classic: '特效·经典', pure: '特效·纯净', subtle: '特效·克制', full: '特效·完整',
};
const FX_TAG: Record<FxLevel, string> = { classic: '典', pure: '净', subtle: '克', full: '全' };
const FX_ORDER: FxLevel[] = ['classic', 'pure', 'subtle', 'full'];

// 战报仅依赖 logs 自身：独立 memo，避免读秒/动画等高频状态带动 40 行战报一起重渲染。
// 只在 logs 引用变化（新增一条战报）时更新，内容、条数、字号与原实现完全一致。
const LogRows = React.memo(function LogRows({ logs }: { logs: LogEntry[] }) {
  return (
    <>
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
    </>
  );
});

// 仅本地开发构建：定向测试探针开关（生产构建为 false，相关代码被裁剪）
const DEV_BUILD = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

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
  // 看门狗复位信号：卡死恢复时自增，触发主循环重新推进当前阶段
  const [loopNudge, setLoopNudge] = useState<number>(0);

  // 仅本地开发：阶段推进轨迹（用于定位长局卡死，生产构建为 no-op 且被裁剪）
  const dbgMark = (where: string) => {
    if (!DEV_BUILD) return;
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
  // 刘备「仁德」：本回合累计给出的牌数与是否已触发回血
  const rendeGivenRef = useRef<number>(0);
  const rendeHealedRef = useRef<boolean>(false);
  const qiangwuPointRef = useRef<number | null>(null);
  const [qiangwuPoint, setQiangwuPoint] = useState<number | null>(null);
  const [hasUsedQiangwu, setHasUsedQiangwu] = useState<boolean>(false);
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
  const yuejianGainedRef = useRef<Set<string>>(new Set()); // 已被「约俭」获得的牌：结算后不再重复置入弃牌堆
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
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // ── 通用「技能选择」弹窗 ──
  // 人类角色触发时弹窗可选；AI 角色 / 托管状态直接返回 null，调用方走原有自动最优路径。
  type SkillChoiceRequest = {
    skill: string;
    owner: string;
    title: string;
    hint?: string;
    mode: 'choose' | 'multi' | 'card' | 'target';
    choices?: { id: string; label: string; desc?: string }[];
    cards?: Card[];
    targets?: { id: number; name: string; sub?: string }[];
    min?: number;
    max?: number;
    cancelLabel?: string;
  };
  type SkillChoiceResult =
    | { kind: 'choose'; id: string }
    | { kind: 'multi'; ids: string[] }
    | { kind: 'card'; ids: string[] }
    | { kind: 'target'; ids: number[] }
    | { kind: 'cancel' }
    | { kind: 'timeout' };
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
  const nonBasicCount = (p: Player) => {
    if (p.hero.name === '诸葛果') return p.hand.filter(c => c.type !== CardType.BASIC).length;
    if (p.hero.name === '董白') return p.hand.filter(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB).length;
    return 0;
  };
  const excessCards = (p: Player) => {
    const nb = nonBasicCount(p);
    if (nb > 0 && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true) {
      const w = window as unknown as { __r4yuhua?: Record<string, unknown> };
      w.__r4yuhua = { ...(w.__r4yuhua || {}), hero: p.hero.name, hand: p.hand.length, hp: p.hp, nonBasic: nb, sample: p.hand.map(c => c.type) };
    }
    // 胡金定「怀子」：手牌上限等于体力上限
    const limitHp = p.hero.name === '胡金定' ? p.maxHp : p.hp;
    return Math.max(0, p.hand.length - limitHp - nb - (p.handLimitDelta ?? 0));
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

  // 延时锦囊进入判定区：按进入先后顺序追加，并同步旧的状态布尔（座位徽标与既有技能仍读这些布尔）
  const addDelayedTrick = (playerId: number, card: Card) => {
    const p = playersRef.current.find(x => x.id === playerId);
    if (!p) return;
    const zone = [...(p.judgeZone ?? []), card];
    playersRef.current = playersRef.current.map(x => x.id === playerId ? {
      ...x,
      judgeZone: zone,
      isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
      isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
      isShandian: zone.some(c => c.name === CardName.SHANDIAN),
    } : x);
    setPlayers(playersRef.current);
    // 延时锦囊实际停留在判定区：从弃牌堆移出，避免同一张牌同时存在于两处
    if (discardPileRef.current.some(c => c.id === card.id)) {
      const newDiscard = discardPileRef.current.filter(c => c.id !== card.id);
      discardPileRef.current = newDiscard;
      setDiscardPile(newDiscard);
    }
  };

  // 判定完成：从判定区移除该牌并置入弃牌堆，同步旧布尔
  const removeDelayedTrick = (playerId: number, card: Card) => {
    const p = playersRef.current.find(x => x.id === playerId);
    if (!p) return;
    const zone = (p.judgeZone ?? []).filter(c => c.id !== card.id);
    playersRef.current = playersRef.current.map(x => x.id === playerId ? {
      ...x,
      judgeZone: zone,
      isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
      isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
      isShandian: zone.some(c => c.name === CardName.SHANDIAN),
    } : x);
    setPlayers(playersRef.current);
    const newDiscard = [...discardPileRef.current, card];
    discardPileRef.current = newDiscard;
    setDiscardPile(newDiscard);
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

  // 邹氏「倾城」：被暗置的角色在解封回合前，其技能不发动（主动技入口与事件触发技均需门控）
  const isSkillSealed = (id: number) => {
    const until = skillSealRef.current[id];
    return !!until && until > turnCountRef.current;
  };
  const skillsOn = (id: number) => !isSkillSealed(id)
    && !(playersRef.current.find(p => p.id === id)?.generalRemoved);

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
    updatePlayer(id, { grantedSkills: [...(p.grantedSkills ?? []), skillName], grantedSkillUntil: until });
    addLog(`【${sourceSkill}】${p.hero.name} 获得技能「${skillName}」${durationTurns ? `（持续 ${durationTurns} 回合）` : ''}`, 'skill');
    return true;
  };

  const revokeSkill = (id: number, skillName: string, reason: string) => {
    const p = getPlayer(id);
    if (!p || !(p.grantedSkills ?? []).includes(skillName)) return false;
    const until = { ...(p.grantedSkillUntil ?? {}) };
    delete until[skillName];
    updatePlayer(id, { grantedSkills: (p.grantedSkills ?? []).filter(s => s !== skillName), grantedSkillUntil: until });
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
    await resolveCardEffect(actor, targets.length ? targets : [actor], card);
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
      await takeDamage(hmNow.id, hmNow.id, 1);
    }
  };

  // ── 王元姬「谦冲 / 帷幕 / 明哲」──
  // 装备区牌列表；「谦冲」按全黑/全红派生“帷幕 / 明哲”
  const equipList = (p: Player): Card[] => {
    const e = p.equipment;
    if (!e) return [];
    return [e.weapon, e.armor, e.horsePlus, e.horseMinus].filter((c): c is Card => !!c);
  };
  const allEquipBlack = (p: Player) => {
    const cs = equipList(p);
    return cs.length > 0 && cs.every(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
  };
  const allEquipRed = (p: Player) => {
    const cs = equipList(p);
    return cs.length > 0 && cs.every(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND);
  };
  const hasWeimu = (p: Player) => p.hero.name === '王元姬' && skillsOn(p.id) && allEquipBlack(p);

  // 相邻存活角色（按座位顺序），“距离最近”的近似：优先下家，其次上家
  const nearestOtherPlayer = (id: number) => {
    const live = playersRef.current.filter(p => !p.isDead);
    const idx = live.findIndex(p => p.id === id);
    if (idx < 0 || live.length <= 1) return null;
    return live[(idx + 1) % live.length];
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

  // ── 张琪瑛「法箓 / 真仪 / 点化」──
  const hasZhangMark = (p: Player, mark: string) => (p.zhangMarks ?? []).includes(mark);

  // 「法箓」：牌因弃置进入弃牌堆后，按花色获得标记
  const grantZhangMarks = (owner: Player, cards: Card[]) => {
    if (!owner || owner.isDead || owner.hero.name !== '张琪瑛' || !skillsOn(owner.id)) return;
    const marks = [...(owner.zhangMarks ?? [])];
    const gained: string[] = [];
    for (const c of cards) {
      const mark = c.suit === Suit.SPADE ? '紫微' : c.suit === Suit.CLUB ? '后土'
        : c.suit === Suit.HEART ? '玉清' : '勾陈';
      if (!marks.includes(mark)) { marks.push(mark); gained.push(mark); }
    }
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
    const next = Math.min(p.maxHp, p.hp + amount);
    const gained = next - p.hp;
    if (gained <= 0) return 0;
    updatePlayer(playerId, { hp: next });
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
    // 伏皇后「惴恐」没赢：该角色与她本回合的距离视为 1
    if (doutuDistanceRef.current[fromId] === toId) return 1;
    // 孙鲁育「魅步」：弃置的牌不为【杀】或黑色锦囊牌时，该角色本回合与孙鲁育的距离视为 1
    if (meibuDistanceRef.current[fromId] === toId) return 1;
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
        __devState?: () => Array<{ id: number; name: string; hp: number; maxHp: number; identity: string; isHuman: boolean; hand: string[]; equip: string[]; sealed: boolean; judge: string[] }>;
        __devPatch?: (spec: Array<{ id: number; hp?: number; maxHp?: number; hand?: string[]; equip?: string[]; marks?: number }>) => void;
        __devDamage?: (victimId: number, sourceId: number, amount: number, nature?: 'fire' | 'thunder', cardName?: string) => void;
        __devKill?: (victimId: number, killerId?: number) => void;
        __devIdentity?: (spec: Array<{ id: number; identity: string }>) => void;
        __devTrick?: (spec: Array<{ id: number; cards: string[] }>) => void;
        __devLogs?: () => string[];
      };
      devWin.__devLogs = () => logsRef.current.map(l => l.text);
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
        void takeDamage(victimId, sourceId, amount, card, nature);
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
    // 「约俭」已在结算前获得该牌：从此处跳过，避免同一张牌既入手又进弃牌堆
    const cardsToDiscard = cardsToDiscardIn.filter(c => {
      if (yuejianGainedRef.current.has(c.id)) { yuejianGainedRef.current.delete(c.id); return false; }
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
      
      const updatedPlayers = playersRef.current;
      const lord = updatedPlayers.find(p => p.identity === Identity.ZHUGONG);
      
      if (!lord) return;

      // 检查主公是否阵亡
      if (lord.isDead) {
        // 官方规则：主公阵亡时，只有「内奸是除主公外的唯一存活者」才判内奸胜；
        // 若仍有其他角色存活（忠臣等），反贼的胜利条件（主公阵亡）已成立，判反贼胜。
        const aliveRebels = updatedPlayers.filter(p => p.identity === Identity.FANZEI && !p.isDead);
        const aliveSpy = updatedPlayers.find(p => p.identity === Identity.NEIJIAN && !p.isDead);
        if (aliveRebels.length > 0) {
          handleGameOver('rebel');
        } else if (aliveSpy) {
          // 内奸需单独存活（与主公单挑胜出）才算赢；仍有忠臣等他人存活则判反贼胜
          const otherAlive = updatedPlayers.filter(p => !p.isDead && p.id !== aliveSpy.id);
          handleGameOver(otherAlive.length === 0 ? 'spy' : 'rebel');
        } else {
          // 反贼与内奸均已阵亡：视为朝廷方获胜（主公死于意外）
          handleGameOver('lord');
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
              updatePlayer(p.id, { placedCards: [...(p.placedCards ?? []), ...picked] });
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
            if (me && foeNow) await resolveCardEffect(me, [foeNow], virtualSlash);
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
          const isSaved = await askForPeaches(latestCurrent.id);
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
              await takeDamage(cur.id, cur.id, 3, {
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

        // 孙寒华「冲虚」：出牌阶段限一次，集灵获得分数，用于升级妙剑/莲华或摸牌
        if (currentPlayer.hero.name === '孙寒华' && skillsOn(currentPlayer.id) && !chongxuUsedRef.current) {
          chongxuUsedRef.current = true;
          const p = getPlayer(currentPlayer.id);
          if (p) {
            let score = 1; // 简化：每次集灵获得 1 分
            addLog(`孙寒华发动「冲虚」，集灵获得 ${score} 分`, 'skill');
            showSkillBanner('孙寒华', '冲虚');
            await delay(400);
            if ((p.miaoJianLevel ?? 1) < 3) {
              updatePlayer(p.id, { miaoJianLevel: (p.miaoJianLevel ?? 1) + 1 });
              addLog(`孙寒华用分数升级「妙剑」至 ${(p.miaoJianLevel ?? 1) + 1} 级`, 'skill');
            } else if ((p.lianHuaLevel ?? 1) < 3) {
              updatePlayer(p.id, { lianHuaLevel: (p.lianHuaLevel ?? 1) + 1 });
              addLog(`孙寒华用分数升级「莲华」至 ${(p.lianHuaLevel ?? 1) + 1} 级`, 'skill');
            } else {
              drawCards(p.id, score);
              addLog(`孙寒华用分数摸 ${score} 张牌`, 'skill');
            }
            await delay(400);
          }
        }

        // 孙寒华「妙剑」：出牌阶段限一次，按等级将牌当【无中生有】或【刺杀】使用（刺杀近似普通【杀】）
        if (currentPlayer.hero.name === '孙寒华' && skillsOn(currentPlayer.id) && !miaoJianUsedRef.current) {
          miaoJianUsedRef.current = true;
          const p = getPlayer(currentPlayer.id);
          if (p) {
            const lv = p.miaoJianLevel ?? 1;
            const trick = lv >= 1 ? p.hand.find(c => c.type !== CardType.BASIC) : undefined;
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
              const foes = playersRef.current.filter(o => !o.isDead && o.id !== p.id && isEnemy(p, o));
              if (foes.length) {
                const foe = [...foes].sort((a, b) => a.hp - b.hp)[0];
                mutateHand(p.id, h => h.filter(c => c.id !== slashCard.id));
                addLog(`孙寒华发动「妙剑」，将【${slashCard.name}】当【刺杀】对 ${foe.hero.name} 使用（近似普通【杀】）`, 'skill');
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
                  };
                  await resolveCardEffect(meNow, [foeNow], virtualSlash);
                }
              }
            }
          }
        }

        // 鲍三娘「许身」：限定技，出牌阶段失去等同存活男性角色数的体力；
        // 若因此进入濒死，脱离濒死后救援者可获得「武圣」「当先」
        if (currentPlayer.hero.name === '鲍三娘' && skillsOn(currentPlayer.id) && !currentPlayer.xushenUsed) {
          const males = playersRef.current.filter(o => !o.isDead && o.id !== currentPlayer.id && o.hero.gender === 'male').length;
          const canBeSaved = playersRef.current.some(p => !p.isDead && p.id !== currentPlayer.id
            && (p.hand.some(c => c.name === CardName.TAO) || p.hand.some(c => c.name === CardName.JIU)));
          if (males > 0 && (currentPlayer.hp >= males + 1 || (currentPlayer.hp === males && canBeSaved))) {
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
              const saved = await askForPeaches(currentPlayer.id);
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
            await resolveCardEffect(me, [foe], virtualSlash);
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
              const nextEquip = { ...(owner.equipment ?? {}) };
              delete nextEquip[slot];
              updatePlayer(owner.id, { equipment: nextEquip });
              addLog(`孙鲁育发动「穆穆」，弃置 ${pick.owner} 的【${pick.card.name}】`, 'skill');
              showSkillBanner('孙鲁育', '穆穆');
              await delay(300);
            }
          } else if (!currentPlayer.equipment?.armor) {
            const armorOwner = playersRef.current.find(p => !p.isDead && p.id !== currentPlayer.id
              && (p.equipment?.armor as Card | undefined) && isAlly(currentPlayer, p));
            if (armorOwner?.equipment?.armor) {
              const armor = armorOwner.equipment.armor;
              const nextEquip = { ...(armorOwner.equipment ?? {}) };
              delete nextEquip.armor;
              updatePlayer(armorOwner.id, { equipment: nextEquip });
              updatePlayer(currentPlayer.id, {
                equipment: { ...(currentPlayer.equipment ?? {}), armor },
              });
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
                    && getDistance(receiverNow, p) <= getAttackRange(receiverNow))
                  .sort((a, b) => a.hp - b.hp)
                  .slice(0, x);
                for (const t of victims) {
                  addLog(`【献州】${receiverNow.hero.name} 对 ${t.hero.name} 造成 1 点伤害`, 'skill');
                  await takeDamage(t.id, receiverNow.id, 1);
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
              setDeck(prev => {
                const next = [giftCard, ...prev];
                deckRef.current = next;
                return next;
              });
            } else {
              setDeck(prev => {
                const next = [...prev, giftCard];
                deckRef.current = next;
                return next;
              });
            }
            addLog(`【问卦】${currentPlayer.hero.name} 交给徐氏【${giftCard.name}】，徐氏将其置于牌堆${placeTop ? '顶' : '底'}`, 'skill');
            showSkillBanner('徐氏', '问卦');
            if (placeTop) {
              // 置于牌堆顶：双方从牌堆底各摸一张
              for (const pid of [xushi.id, currentPlayer.id]) {
                const now = deckRef.current;
                const bottom = now[now.length - 1];
                if (!bottom) break;
                const next = now.slice(0, -1);
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
          await takeDamage(currentPlayer.id, hetai.id, 1);
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
              const topCards = (!pick || pick.kind === 'timeout' || pick.kind === 'cancel')
                ? viewed
                : viewed.filter(c => pick.ids.includes(c.id));
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
                    const saved = await askForPeaches(target.id);
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
        // 则依次对该角色使用牌堆中的 X 张【杀】（X 为场上人数），然后将牌堆洗牌
        if (endingPlayer && !endingPlayer.isDead && endingPlayer.hero.gender === 'male') {
          const xs = playersRef.current.find(p => !p.isDead && p.id !== endingPlayer.id
            && p.hero.name === '徐氏' && skillsOn(p.id));
          if (xs && deckRef.current.length <= xs.hp * 10) {
            const x = playersRef.current.filter(p => !p.isDead).length;
            const slashes = deckRef.current.filter(c => c.name === CardName.SHA).slice(0, x);
            if (slashes.length > 0) {
              setDeck(prev => {
                const next = prev.filter(c => !slashes.some(s => s.id === c.id));
                deckRef.current = next;
                return next;
              });
              addLog(`【伏诛】徐氏对 ${endingPlayer.hero.name} 依次使用牌堆中的 ${slashes.length} 张【杀】`, 'skill');
              showSkillBanner('徐氏', '伏诛');
              await delay(400);
              const xsNow = getPlayer(xs.id);
              for (const s of slashes) {
                const victimNow = getPlayer(endingPlayer.id);
                if (!xsNow || !victimNow || xsNow.isDead || victimNow.isDead) break;
                await resolveCardEffect(xsNow, [victimNow], s);
              }
              const reshuffled = shuffle(deckRef.current);
              setDeck(reshuffled);
              deckRef.current = reshuffled;
              addLog('【伏诛】结算完毕，牌堆重新洗牌', 'info');
              await delay(300);
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
              const nextEq = { ...(ender2.equipment ?? {}) };
              delete nextEq[slot];
              updatePlayer(ender2.id, { equipment: nextEq });
              if (cfr.equipment?.[slot]) {
                mutateHand(cfr.id, h => [...h, pick]);
                addLog(`【窃听】蔡夫人已有同部位装备，改为获得 ${ender2.hero.name} 的【${pick.name}】到手牌`, 'skill');
              } else {
                updatePlayer(cfr.id, { equipment: { ...(cfr.equipment ?? {}), [slot]: pick } });
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
    const ea = a.equipment ?? {};
    const eb = b.equipment ?? {};
    updatePlayer(aId, { equipment: { ...eb } });
    updatePlayer(bId, { equipment: { ...ea } });
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
      const slot = (Object.keys(eq) as EquipmentSlot[])
        .find(k => (eq as Record<string, Card | undefined>)[k]?.id === cost.id);
      if (slot) {
        const nextEq = { ...eq };
        delete nextEq[slot];
        updatePlayer(ownerId, { equipment: nextEq });
        setDiscardPile(prev => {
          const next = [...prev, cost];
          discardPileRef.current = next;
          return next;
        });
        triggerXiaoji(ownerId);
      }
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
      if (targets.length) await resolveCardEffect(me, targets, virtual);
    } else {
      const foe = [...foes].sort((a, b) => a.hp - b.hp)[0];
      if (foe) await resolveCardEffect(me, [getPlayer(foe.id)!], virtual);
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
    await resolveCardEffect(owner, targets, virtual);
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
        await resolveCardEffect(meL, [target], helpCard);
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
        await resolveCardEffect(me, [target], card);
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
        await resolveCardEffect(me, [target], tempShaCard);
        drawCards(me.id, 1);
        addLog('【芳魂】龙胆结算后赵襄摸一张牌', 'skill');
      } else if (isUsingLongdan) {
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
    discardCards(playerId, [card]);
    showCardVisual(card, getPlayer(playerId)?.hero.name || '', 1200, getPlayer(playerId)?.hero.gender);
  };

  const resolveCardEffect = async (source: Player, targets: Player[], card: Card) => {
    // 董白「黠慧」：他人获得的黑色牌在体力减少前不能使用
    if (xiaohuiLocked(source.id, card.id)) {
      addLog(`【黠慧】${source.hero.name} 不能使用获得的黑色牌【${card.name}】（体力未减少）`, 'warning');
      return;
    }
    if (fxFly && targets.length > 0) spawnCardFlight(card, source.id, targets[0].id);
    setIsProcessing(p => p + 1);
    // 孙鲁育「魅步」止息：统计本回合已使用的牌数（打出响应不经过此处，不受限制）
    if (zhixiRef.current?.id === source.id) zhixiRef.current.used += 1;
    try {
      // 通用「勇决」（存嗣授予）：同势力角色本回合使用的第一张牌为【杀】时，结算后获得之
      {
        const key = `${source.id}-${turnCountRef.current}`;
        if (!firstUsedCardRef.current.has(key)) {
          firstUsedCardRef.current.add(key);
          if (card.name === CardName.SHA) {
            const enabler = playersRef.current.find(p => hasGrantedSkill(p, '勇决')
              && p.hero.kingdom === source.hero.kingdom && p.id !== source.id);
            if (enabler) {
              mutateHand(source.id, h => (h.some(c => c.id === card.id) ? h : [...h, card]));
              addLog(`【勇决】${source.hero.name} 本回合使用的第一张牌为【杀】，结算后获得之（「勇决」持有者 ${enabler.hero.name}）`, 'skill');
              showSkillBanner(source.hero.name, '勇决');
            }
          }
        }
      }

      // 通用目标合法性钩子：被技能禁止的目标在结算入口统一剔除（含转化牌、额外目标）
      const vetoedTargets = targets.filter(t => getTargetLegalityVeto(source, t, card));
      if (vetoedTargets.length) {
        targets = targets.filter(t => !vetoedTargets.includes(t));
        addLog(`【${getTargetLegalityVeto(source, vetoedTargets[0], card) || '目标限制'}】${vetoedTargets.map(t => t.hero.name).join('、')} 不能成为 ${source.hero.name} 的【${card.name}】目标`, 'skill');
        if (!targets.length) return;
      }

      // 卞夫人「约俭」：其他角色对你使用的牌置入弃牌堆时，展示手牌，若无同花色牌则获得之（每回合限两次）
      {
        const bf = playersRef.current.find(p => !p.isDead && p.hero.name === '卞夫人' && skillsOn(p.id));
        // 基本牌 / 锦囊使用后进入弃牌堆；装备牌进入装备区，不触发
        const willDiscard = card.type === CardType.BASIC || card.type === CardType.SCROLL;
        const inHand = source.hand.some(c => c.id === card.id); // 仅处理真实手牌（排除虚拟牌）
        if (bf && bf.id !== source.id && targets.some(t => t.id === bf.id)
            && yuejianCountRef.current < 2 && willDiscard && inHand) {
          const shown = bf.hand.map(c => `${c.suit}【${c.name}】`).join(' ');
          addLog(`【约俭】卞夫人展示手牌：${shown || '（无）'}`, 'skill');
          if (!bf.hand.some(c => c.suit === card.suit)) {
            yuejianCountRef.current += 1;
            yuejianGainedRef.current.add(card.id);
            setTimeout(() => { yuejianGainedRef.current.delete(card.id); }, 5000); // 兜底清理，避免标记残留
            mutateHand(source.id, h => h.filter(c => c.id !== card.id)); // 使用的牌离开使用者手牌
            mutateHand(bf.id, h => [...h, card]);
            addLog(`【约俭】卞夫人手牌均无 ${card.suit} 花色，获得置入弃牌堆的【${card.name}】`, 'skill');
            showSkillBanner('卞夫人', '约俭');
            await delay(300);
          } else {
            addLog(`【约俭】卞夫人手牌中有 ${card.suit} 花色，未获得【${card.name}】`, 'info');
          }
        }
      }

      // 卑弥呼「蚕食」：觉醒后，单体基本牌/普通锦囊可额外指定带“傀”的敌人
      const canShiOffense = source.hero.name === '卑弥呼' && source.baiJiaAwakened
        && targets.length === 1 && targets[0].id !== source.id
        && (card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG);
      if (canShiOffense) {
        const extras = playersRef.current.filter(p => !p.isDead && p.hasKui && p.id !== source.id
          && p.id !== targets[0].id && !isAlly(source, p));
        if (extras.length) {
          targets = [...targets, ...extras];
          extras.forEach(p => updatePlayer(p.id, { hasKui: false }));
          addLog(`【蚕食】卑弥呼令 ${extras.map(p => p.hero.name).join('、')} 成为额外目标（失去“傀”）`, 'skill');
          showSkillBanner('卑弥呼', '蚕食');
        }
      }

      // 吴苋「福绵」：选项 2 令红色基本牌或红色普通锦囊额外指定敌方目标（每回合限一次）
      if (source.hero.name === '吴苋' && skillsOn(source.id) && source.fumianChoice === 2
          && !fumianTargetUsedRef.current
          && targets.length === 1 && targets[0].id !== source.id
          && (card.suit === Suit.HEART || card.suit === Suit.DIAMOND)
          && (card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG
              || card.name === CardName.SHUNSHOU || card.name === CardName.GUOHE || card.name === CardName.JIEDAO)) {
        const extraTargets = playersRef.current.filter(p => !p.isDead && p.id !== source.id
          && p.id !== targets[0].id && isEnemy(source, p));
        if (extraTargets.length) {
          const add = extraTargets.slice(0, Math.max(1, source.fumianValue2 ?? 1));
          targets = [...targets, ...add];
          fumianTargetUsedRef.current = true;
          addLog(`【福绵】吴苋令【${card.name}】额外指定 ${add.map(p => p.hero.name).join('、')} 为目标`, 'skill');
          showSkillBanner('吴苋', '福绵');
        }
      }

      // 孙鲁班「谮毁」：出牌阶段限一次，使用【杀】或黑色普通锦囊仅指定唯一目标时，
      // 令能成为此牌目标的另一名角色选择：①交给你一张牌，然后代替你成为此牌的使用者；②也成为此牌的目标
      if (source.hero.name === '孙鲁班' && skillsOn(source.id) && !cangHuiUsedRef.current
          && targets.length === 1 && targets[0].id !== source.id
          && (card.name === CardName.SHA
              || (card.type === CardType.SCROLL && (card.suit === Suit.SPADE || card.suit === Suit.CLUB)))) {
        const extra = playersRef.current.filter(p => !p.isDead && p.id !== source.id && p.id !== targets[0].id);
        if (extra.length) {
          const aiBest = [...extra].sort((a, b) => b.hand.length - a.hand.length)[0];
          // 第一步：孙鲁班（人类）指定拉入哪名角色；AI / 托管自动取手牌最多者；人类点「不发动」则放弃
          const pick = await requestSkillChoice({
            skill: '谮毁',
            owner: '孙鲁班',
            title: `【${card.name}】仅指定 ${targets[0].hero.name} 为目标，是否发动「谮毁」？`,
            hint: '被选中的角色会自行选择「交一张牌并代替你成为使用者」或「也成为此牌的目标」',
            mode: 'target',
            targets: extra.map(p => ({ id: p.id, name: p.hero.name, sub: `手牌 ${p.hand.length}` })),
            min: 0,
            max: 1,
            cancelLabel: '不发动',
          }, source.isHuman);
          const chosen = (!pick || pick.kind === 'timeout')
            ? aiBest
            : (pick.kind === 'target' && pick.ids.length ? (extra.find(p => p.id === pick.ids[0]) ?? null) : null);
          if (chosen) {
            cangHuiUsedRef.current = true;
            showSkillBanner('孙鲁班', '谮毁');
            // 第二步：由被指定的角色选择分支（人类弹窗；AI / 托管按近似收益自动）
            const canPay = chosen.hand.length > 0;
            let branch: 'substitute' | 'target' = 'target';
            if (canPay) {
              const pick2 = await requestSkillChoice({
                skill: '谮毁',
                owner: chosen.hero.name,
                title: `${source.hero.name} 发动「谮毁」，请选择：`,
                hint: `【${card.name}】的使用者仍是 ${source.hero.name}，还是由你代替？`,
                mode: 'choose',
                choices: [
                  { id: 'substitute', label: '交一张牌，代替其成为使用者', desc: `交给 ${source.hero.name} 一张手牌，此牌改由你使用` },
                  { id: 'target', label: '也成为此牌的目标', desc: `此牌仍由 ${source.hero.name} 使用，目标增加你` },
                ],
                cancelLabel: '也成为此牌的目标',
              }, chosen.isHuman && !isAiTakeoverRef.current);
              if (pick2 && pick2.kind === 'choose') branch = pick2.id === 'substitute' ? 'substitute' : 'target';
              else if (!pick2) branch = chosen.hand.length <= 1 ? 'substitute' : 'target';
            }
            if (branch === 'substitute' && canPay) {
              const cost = chosen.hand[Math.floor(Math.random() * chosen.hand.length)];
              mutateHand(chosen.id, h => h.filter(c => c.id !== cost.id));
              mutateHand(source.id, h => [...h, cost]);
              mutateHand(source.id, h => h.filter(c => c.id !== card.id));
              addLog(`【谮毁】${chosen.hero.name} 将【${cost.name}】交给 ${source.hero.name}，代替其成为【${card.name}】的使用者（孙鲁班退出此牌结算，伤害来源改为 ${chosen.hero.name}）`, 'skill');
              source = chosen;
            } else {
              targets = [...targets, chosen];
              addLog(`【谮毁】${chosen.hero.name} 选择成为【${card.name}】的目标（使用者仍为孙鲁班）`, 'skill');
            }
          } else {
            addLog('【谮毁】孙鲁班放弃发动', 'info');
          }
        }
      }

      // 王元姬「帷幕」：装备区全黑时，不能成为黑色锦囊牌的目标
      if (card.type === CardType.SCROLL && (card.suit === Suit.SPADE || card.suit === Suit.CLUB)) {
        const weimuTarget = targets.find(t => hasWeimu(t) && t.id !== source.id);
        if (weimuTarget) {
          const rest = targets.filter(t => t.id !== weimuTarget.id);
          if (rest.length === 0) {
            playCard(source.id, card);
            addLog(`【帷幕】${weimuTarget.hero.name} 不能成为黑色锦囊牌的目标，【${card.name}】对其无效`, 'skill');
            showSkillBanner(weimuTarget.hero.name, '帷幕');
            await delay(300);
            return;
          }
          targets = rest;
          addLog(`【帷幕】${weimuTarget.hero.name} 不能成为黑色锦囊牌的目标，已从【${card.name}】的目标中移除`, 'skill');
          showSkillBanner(weimuTarget.hero.name, '帷幕');
        }
      }

      // 蔡夫人「窃听」记录：本回合是否用牌指定过其他角色（含蚕食追加目标）
      if (source.id >= 0 && targets.some(t => t.id !== source.id)) {
        turnUsedOnOthersRef.current[source.id] = true;
      }

      // 卑弥呼「蚕食」防御：敌方以单体基本牌/普通锦囊指定卑弥呼时，可取消并移除其“傀”
      const harmful = card.name === CardName.SHA || card.name === CardName.JUEDOU || card.name === CardName.HUOGONG
        || card.name === CardName.SHUNSHOU || card.name === CardName.GUOHE
        || card.name === CardName.LESI || card.name === CardName.BINGLIANG;
      if (targets.length === 1 && targets[0].hero.name === '卑弥呼' && targets[0].baiJiaAwakened
          && source.id !== targets[0].id && source.hasKui && harmful && !isAlly(source, targets[0])) {
        updatePlayer(source.id, { hasKui: false });
        playCard(source.id, card);
        addLog(`【蚕食】卑弥呼取消 ${source.hero.name} 的【${card.name}】，其失去“傀”标记`, 'skill');
        showSkillBanner('卑弥呼', '蚕食');
        await delay(350);
        return;
      }

      // 曹婴「凌人」：出牌阶段限一次，使用【杀】或伤害类锦囊指定目标后，公开猜测其手牌类别，
      // 再亮出目标手牌核对（不读取真实手牌来“猜”）。猜中至少 1 项此伤害 +1；2 项摸两张牌；3 项获得「奸雄」「行殇」
      const lingrenCards: CardName[] = [CardName.SHA, CardName.JUEDOU, CardName.HUOGONG, CardName.NANMAN, CardName.WANJIAN];
      if (source.hero.name === '曹婴' && skillsOn(source.id) && !lingrenUsedRef.current
          && targets.length > 0 && lingrenCards.includes(card.name)) {
        const tgt = targets.find(t => t.id !== source.id && !t.isDead);
        if (tgt) {
          lingrenUsedRef.current = true;
          // 猜测阶段：玩家/托管由玩家选，AI 按公开信息（手牌数）推测，均不看手牌明细
          let guessIds: string[] = [];
          const guessChoices = [
            { id: '基本牌', label: '基本牌' },
            { id: '锦囊牌', label: '锦囊牌' },
            { id: '装备牌', label: '装备牌' },
          ];
          const pick = await requestSkillChoice({
            skill: '凌人',
            owner: source.hero.name,
            title: `猜测 ${tgt.hero.name} 的手牌类别（可多选）`,
            hint: '猜测后公开目标手牌并核对，猜错不会获得效果',
            mode: 'multi',
            choices: guessChoices,
            min: 1,
            max: 3,
            cancelLabel: '不猜测',
          });
          if (pick && pick.kind === 'multi') {
            guessIds = pick.ids;
          } else if (pick && pick.kind === 'cancel') {
            lingrenUsedRef.current = false; // 不猜测：本轮不发动，牌照常结算
            guessIds = [];
          } else {
            // AI / 托管：公开信息推断（手牌越厚越可能含装备）
            guessIds = ['基本牌', '锦囊牌'];
            if (tgt.hand.length >= 4) guessIds.push('装备牌');
          }
          if (guessIds.length > 0) {
          // 核对阶段：亮出目标手牌类别
          const actual: string[] = [];
          for (const c of tgt.hand) {
            const cat = c.type === CardType.BASIC ? '基本牌' : (c.type === CardType.SCROLL ? '锦囊牌' : (c.type === CardType.EQUIPMENT ? '装备牌' : ''));
            if (cat && !actual.includes(cat)) actual.push(cat);
          }
          const correct = guessIds.filter(g => actual.includes(g)).length;
          const wrong = guessIds.filter(g => !actual.includes(g));
          const missed = actual.filter(a => !guessIds.includes(a));
          addLog(`【凌人】曹婴猜测 ${tgt.hero.name} 的手牌：${guessIds.join('、')}`, 'skill');
          showSkillBanner('曹婴', '凌人');
          await delay(250);
          addLog(`【凌人】${tgt.hero.name} 亮出手牌：${actual.join('、') || '无'}`, 'chat');
          if (wrong.length) addLog(`【凌人】猜错：${wrong.join('、')}（其手中并无此类牌）`, 'warning');
          if (missed.length) addLog(`【凌人】漏猜：${missed.join('、')}`, 'info');
          addLog(`【凌人】猜中 ${correct} 项`, 'skill');
          lingrenBoostRef.current[card.id] = { targetId: tgt.id, bonus: correct > 0 ? 1 : 0 };
          await delay(350);
          if (correct >= 2) {
            drawCards(source.id, 2);
            addLog('【凌人】猜对至少两项，曹婴摸两张牌', 'skill');
          }
          if (correct >= 3) {
            updatePlayer(source.id, { hasJianxiong: true, hasXingshang: true });
            addLog('【凌人】猜中三项，曹婴获得「奸雄」「行殇」直到下回合开始', 'skill');
          }
          }
        }
      }

      // 鲍三娘「姝勇」：使用【杀】时，获得一名其他角色区域内的一张牌，然后其摸一张牌
      if (source.hero.name === '鲍三娘' && card.name === CardName.SHA && skillsOn(source.id)) {
        await triggerShuyong(source.id, targets.find(t => t.id !== source.id)?.id);
      }

      // 鲍三娘「镇南」：非【杀】的多目标牌在此结算；多目标【杀】在 slashTargets 确定后结算
      if (targets.length > 1 && card.name !== CardName.SHA) {
        await triggerZhennan(source, targets, card);
      }

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

        // 朱雀羽扇：你可以将一张普通【杀】当火【杀】使用。
        // 人类：本回合首张普通【杀】弹窗询问，选择记住本回合；AI：目标有藤甲才转火。
        let slashCard = card;
        if (source.equipment?.weapon?.name === CardName.ZHUQUE && !card.attribute) {
          let pref = zhuquePrefRef.current[source.id];
          if (!pref) {
            // AI：只有目标穿【藤甲】（火杀击穿免疫且火伤+1）、且目标不是免疫火焰伤害的孙茹时才转火
            const hasTengjia = targets.some(t => getPlayer(t.id)?.equipment?.armor?.name === CardName.TENGJIA);
            const fireWasted = targets.every(t => {
              const p = getPlayer(t.id);
              return p && p.hero.name === '孙茹' && skillsOn(p.id);
            });
            let chosen: 'fire' | 'normal' = hasTengjia && !fireWasted ? 'fire' : 'normal';
            if (source.isHuman && !isAiTakeover) {
              const r = await requestSkillChoice({
                skill: '朱雀羽扇',
                owner: source.hero.name,
                title: '是否将这张普通【杀】以火【杀】使用？',
                hint: '火【杀】可击穿【藤甲】的锁定技并使火焰伤害+1；选择会被记住本回合，后续普通【杀】不再询问',
                mode: 'choose',
                choices: [
                  { id: 'fire', label: '以火【杀】使用' },
                  { id: 'normal', label: '以普通【杀】使用' },
                ],
                cancelLabel: '以普通【杀】使用',
              });
              chosen = r && r.kind === 'choose' && r.id === 'fire' ? 'fire' : 'normal';
            }
            pref = chosen;
            zhuquePrefRef.current[source.id] = chosen;
            addLog(`【朱雀羽扇】${source.hero.name} 本回合偏好：${chosen === 'fire' ? '火【杀】' : '普通【杀】'}（后续普通【杀】按此偏好自动处理）`, 'skill');
          }
          if (pref === 'fire') {
            slashCard = { ...card, attribute: 'fire' as const };
            addLog(`【朱雀羽扇】${source.hero.name} 将普通【杀】转化为火【杀】使用`, 'skill');
            showSkillBanner(source.hero.name, '朱雀羽扇');
            await delay(300);
          }
        }

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

        // 鲍三娘「镇南」：多目标【杀】的目标数在方天画戟/福绵追加后确定
        await triggerZhennan(source, slashTargets, card);

        // 马云禄「凤魄」：回合内第一张【杀】仅指定唯一目标后，
        // 可令自己摸 X 张牌或此【杀】伤害 +X（X 为目标方块手牌数）。
        if (source.hero.name === '马云禄' && !fengpoUsedRef.current && slashTargets.length === 1) {
          fengpoUsedRef.current = true;
          const t0 = getPlayer(slashTargets[0].id);
          const x = t0 ? t0.hand.filter(c => c.suit === Suit.DIAMOND).length : 0;
          if (t0 && x > 0) {
            if (t0.hp <= x + 1) {
              fengpoBoostRef.current[card.id] = x;
              addLog(`${source.hero.name} 发动「凤魄」，${t0.hero.name} 有 ${x} 张方块手牌，此【杀】伤害 +${x}`, 'skill');
            } else {
              drawCards(source.id, x);
              addLog(`${source.hero.name} 发动「凤魄」，${t0.hero.name} 有 ${x} 张方块手牌，${source.hero.name} 摸 ${x} 张牌`, 'skill');
            }
            showSkillBanner(source.hero.name, '凤魄');
            await delay(400);
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

          // 曹节「守玺」：成为【杀】的目标后，声明一种未以此法声明过的基本牌或锦囊牌牌名，
          // 除非使用者弃置一张该牌名的牌并获得曹节一张牌，否则此【杀】无效。
          if (effectiveTarget.hero.name === '曹节' && source.id !== effectiveTarget.id) {
            const declarable = ([
              CardName.SHA, CardName.SHAN, CardName.TAO, CardName.JIU,
              CardName.WUXIE, CardName.GUOHE, CardName.SHUNSHOU, CardName.JUEDOU,
              CardName.NANMAN, CardName.WANJIAN, CardName.WUZHONG,
            ] as CardName[]).filter(n => !shouxiDeclaredRef.current.has(n));
            let declared: CardName | null = null;
            if (declarable.length > 0) {
              if (effectiveTarget.isHuman && !isAiTakeover) {
                const r = await requestSkillChoice({
                  skill: '守玺',
                  owner: '曹节',
                  title: '选择要声明的牌名（每种牌名本局限一次）',
                  hint: '若使用者弃置一张该牌名的牌并获得你一张牌，此【杀】继续；否则此【杀】对你无效',
                  mode: 'choose',
                  choices: declarable.map(n => ({ id: n, label: `【${n}】` })),
                  cancelLabel: '放弃守玺',
                });
                if (r && r.kind === 'choose') declared = r.id as CardName;
              } else {
                // AI：优先声明对手最可能拿不出、且价值高的牌名
                const prio: CardName[] = [CardName.TAO, CardName.WUXIE, CardName.WANJIAN, CardName.SHAN, CardName.SHA];
                declared = prio.find(n => declarable.includes(n)) ?? declarable[0];
              }
            }
            if (declared && !shouxiDeclaredRef.current.has(declared)) {
              shouxiDeclaredRef.current.add(declared);
              const payer = getPlayer(source.id);
              const payCard = payer?.hand.find(c => c.name === declared);
              const gainable = effectiveTarget.hand.length > 0;
              // 官方无「手牌数」门槛：只要能弃置声明的牌且曹节有牌可被获得，即可支付
              const pay = !!payCard && gainable;
              if (pay && payCard && payer) {
                discardCards(payer.id, [payCard]);
                const gained = effectiveTarget.hand[Math.floor(Math.random() * effectiveTarget.hand.length)];
                mutateHand(effectiveTarget.id, h => h.filter(c => c.id !== gained.id));
                mutateHand(payer.id, h => [...h, gained]);
                addLog(`${effectiveTarget.hero.name} 发动「守玺」声明【${declared}】，${payer.hero.name} 弃置【${payCard.name}】并获得一张牌，此【杀】继续`, 'skill');
                showSkillBanner(effectiveTarget.hero.name, '守玺');
                await delay(450);
              } else {
                addLog(`${effectiveTarget.hero.name} 发动「守玺」声明【${declared}】，${source.hero.name} 未支付（手牌中无【${declared}】或无可获得之牌），此【杀】无效`, 'skill');
                showSkillBanner(effectiveTarget.hero.name, '守玺');
                await delay(450);
                continue;
              }
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

          // 孙寒华「莲华」：成为其他角色【杀】的目标时按等级结算（摸牌 / 黑桃取消 / 弃牌否则取消）
          if (effectiveTarget.hero.name === '孙寒华' && source.id !== effectiveTarget.id && skillsOn(effectiveTarget.id)) {
            const lv = effectiveTarget.lianHuaLevel ?? 1;
            drawCards(effectiveTarget.id, 1);
            addLog(`孙寒华成为 ${source.hero.name} 的【杀】目标，发动「莲华」（${lv} 级）摸一张牌`, 'skill');
            showSkillBanner('孙寒华', '莲华');
            await delay(350);
            if (lv >= 2) {
              const jc = await performJudgment(effectiveTarget.id, '莲华');
              if (jc && jc.suit === Suit.SPADE) {
                addLog('【莲华】判定为黑桃，此【杀】被取消', 'skill');
                await delay(400);
                continue;
              }
            }
            if (lv >= 3) {
              const sp = getPlayer(source.id);
              const willing = !!sp && sp.hand.length > 0
                && (effectiveTarget.hp <= 2 || sp.hand.length >= 2);
              if (willing && sp) {
                const cost = [...sp.hand].sort((a, b) => a.value - b.value)[0];
                discardCards(sp.id, [cost]);
                addLog(`【莲华】${sp.hero.name} 弃置【${cost.name}】，此【杀】继续`, 'skill');
                await delay(350);
              } else {
                addLog(`【莲华】${source.hero.name} 未弃置牌，此【杀】被取消`, 'skill');
                await delay(350);
                continue;
              }
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
          if (!ignoreArmor && armor === CardName.TENGJIA && !slashCard.attribute) {
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
              await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
              continue;
            }
            addLog(`「铁骑」判定为黑色，${effectiveTarget.hero.name} 仍可出【闪】`, 'info');
          }

          // 黄忠「烈弓」：目标手牌不少于自己体力时，此【杀】不可被闪避
          const isLieGong = source.hero.name === '黄忠' && effectiveTarget.hand.length >= source.hp;
          if (isLieGong) {
            addLog(`${source.hero.name} 发动「烈弓」，${effectiveTarget.hero.name} 无法闪避！`, 'skill');
            showSkillBanner(source.hero.name, '烈弓');
            await takeDamage(effectiveTarget.id, source.id, 1, slashCard);
            continue;
          }

          const hpBefore = getPlayer(effectiveTarget.id)?.hp ?? 0;
          // 用转换后的牌结算（火【杀】造成火焰伤害）
          await triggerReaction(effectiveTarget.id, source.id, CardName.SHAN, slashCard);
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
            if (t && !t.isDead) await takeDamage(t.id, source.id, 1, slashCard);
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
         // 马云禄「凤魄」：回合内第一张【杀】或【决斗】仅指定唯一目标后，
         // 可令自己摸 X 张牌或此牌伤害 +X（X 为目标方块手牌数）
         if (source.hero.name === '马云禄' && !fengpoUsedRef.current) {
           fengpoUsedRef.current = true;
           const x = target.hand.filter(c => c.suit === Suit.DIAMOND).length;
           if (x > 0) {
             if (target.hp <= x + 1) {
               fengpoBoostRef.current[card.id] = x;
               addLog(`${source.hero.name} 发动「凤魄」，${target.hero.name} 有 ${x} 张方块手牌，此【决斗】伤害 +${x}`, 'skill');
             } else {
               drawCards(source.id, x);
               addLog(`${source.hero.name} 发动「凤魄」，${target.hero.name} 有 ${x} 张方块手牌，${source.hero.name} 摸 ${x} 张牌`, 'skill');
             }
             showSkillBanner(source.hero.name, '凤魄');
             await delay(400);
           }
         }
        playCard(source.id, card);
         addLog(`${source.hero.name} 找 ${target.hero.name} 决斗！`, 'danger');
         // 无懈可击询问链（全座次 + 可被反无懈）
         const isWuxieUsed = await resolveWuxieChain(source.id, card);
         if (!isWuxieUsed) {
           // 如果没有使用无懈可击，再询问是否使用杀
           await triggerReaction(target.id, source.id, CardName.SHA, card);
         }
      }
      // NANMAN
      else if (card.name === CardName.NANMAN) {
        playCard(source.id, card);
        addLog('南蛮入侵！全场需打出【杀】', 'danger');
        const nanmanHpBefore = new Map(targets.map(t => [t.id, t.hp] as [number, number]));
        for (const t of targets) {
          // 花鬘「象阵」：南蛮入侵对其无效
          if (t.hero.name === '花鬘' && skillsOn(t.id)) {
            addLog(`${t.hero.name} 发动「象阵」，「南蛮入侵」对其无效`, 'skill');
            showSkillBanner('花鬘', '象阵');
            await delay(400);
            continue;
          }
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
          // 无懈可击询问链（全座次 + 可被反无懈）
          const isWuxieUsed = await resolveWuxieChain(source.id, card);
          if (!isWuxieUsed) {
            // 如果没有使用无懈可击，再询问是否使用杀
            await triggerReaction(t.id, source.id, CardName.SHA, card);
          }
          await delay(500);
        }
        // 花鬘「象阵」：结算结束后若此牌造成过伤害，花鬘与伤害来源各摸一张牌
        const xiangzhenOwner = playersRef.current.find(p => !p.isDead && p.hero.name === '花鬘' && skillsOn(p.id));
        if (xiangzhenOwner) {
          const hurt = targets.some(t => {
            const now = getPlayer(t.id);
            return !!now && now.hp < (nanmanHpBefore.get(t.id) ?? now.hp);
          });
          if (hurt) {
            drawCards(xiangzhenOwner.id, 1);
            if (xiangzhenOwner.id !== source.id) drawCards(source.id, 1);
            addLog(`【象阵】南蛮入侵造成过伤害，${xiangzhenOwner.hero.name}${xiangzhenOwner.id !== source.id ? ` 与 ${source.hero.name}` : ''}各摸一张牌`, 'skill');
            showSkillBanner('花鬘', '象阵');
          }
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

        recoverHp(target.id, healPoints);
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
          // 无懈可击询问链（全座次 + 可被反无懈）
          const isWuxieUsed = await resolveWuxieChain(source.id, card);
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
          // 无懈可击询问链（全座次 + 可被反无懈）
          const isWuxieUsed = await resolveWuxieChain(source.id, card);
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
              lockXiaohuiCards(target.id, source.id, [stolenEquip]);
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
              lockXiaohuiCards(target.id, source.id, [stolenCard]);

              addLog(`${source.hero.name} 从 ${target.hero.name} 那里偷到了【${stolenCard.name}】`, 'chat');
              triggerWanwei(target.id, [stolenCard.name]);
            } else {
              addLog(`${target.hero.name} 没有牌可偷`, 'info');
            }
          } else {
            addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
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
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (isWuxieUsed) {
          addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
          return;
        }
        // 放入判定区：判定阶段按进入先后逐张结算
        addDelayedTrick(target.id, card);
        addLog(`${target.hero.name} 中了【乐不思蜀】，判定区第 ${(getPlayer(target.id)?.judgeZone?.length ?? 1)} 张，下回合判定非红桃将跳过出牌阶段`, 'warning');
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
          // 无懈可击询问链（全座次 + 可被反无懈）
          const isWuxieUsed = await resolveWuxieChain(source.id, card);
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
            addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
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
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (isWuxieUsed) {
          addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
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
          // 王异「贞烈」：铁索连环属非延时锦囊，可令其对自己无效
          if (await tryZhenlie(target, source, card)) continue;
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
          recoverHp(target.id, 1);
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
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (isWuxieUsed) {
          addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
          return;
        }
        // 放入判定区：判定阶段按进入先后逐张结算
        addDelayedTrick(target.id, card);
        addLog(`${target.hero.name} 中了【兵粮寸断】，判定区第 ${(getPlayer(target.id)?.judgeZone?.length ?? 1)} 张，下回合判定非梅花将跳过摸牌阶段`, 'warning');
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
          // 王异「贞烈」：五谷丰登属非延时锦囊，可令其对自己无效（不参与选牌）
          if (await tryZhenlie(player, source, card)) continue;
          
          if (player.isHuman && !isAiTakeover) {
            // 人类玩家选择（30 秒未选自动代选，避免单一响应等待无限挂起）
            const selectedCard = await new Promise<Card | null>(resolve => {
              let settled = false;
              let timer: ReturnType<typeof setTimeout> | null = null;
              const finish = (card: Card | null) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                setWuguSelection(null);
                resolve(card);
              };
              timer = setTimeout(() => {
                if (settled) return;
                const auto = revealedCards[Math.floor(Math.random() * revealedCards.length)] ?? null;
                addLog(`${player.hero.name} 选择超时，自动选取${auto ? `【${auto.name}】` : '无牌'}`, 'warning');
                finish(auto);
              }, 30000);
              setWuguSelection({
                cards: revealedCards,
                playerName: player.hero.name,
                onSelect: (card: Card | null) => finish(card)
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
          // 王异「贞烈」：桃园结义属非延时锦囊，可令其对自己无效（不回复）
          if (await tryZhenlie(player, source, card)) continue;
          if (player.hp < player.maxHp) {
            const newHp = Math.min(player.hp + 1, player.maxHp);
            const healAmount = newHp - player.hp;
            
            // 触发治疗动画
            setHealAnimTarget(player.id);
            setHealNumber({ targetId: player.id, amount: healAmount, id: Date.now().toString() + Math.random() });
            setTimeout(() => setHealAnimTarget(null), 600);
            setTimeout(() => setHealNumber(null), 1000);
            
            recoverHp(player.id, 1);
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
        
        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (isWuxieUsed) {
          addLog(`【无懈可击】生效，【${card.name}】对 ${target.hero.name} 的效果被抵消`, 'success');
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

        // 无懈可击询问链（全座次 + 可被反无懈）
        const isWuxieUsed = await resolveWuxieChain(source.id, card);
        if (isWuxieUsed) {
          addLog(`【无懈可击】生效，【闪电】被抵消`, 'success');
        } else {
          addDelayedTrick(source.id, card);
          addLog(`⚡【闪电】置于 ${source.hero.name} 的判定区第 ${(getPlayer(source.id)?.judgeZone?.length ?? 1)} 张，下回合判定阶段结算`, 'warning');
        }
      }
    } finally {
      setIsProcessing(p => Math.max(0, p - 1));
      // 孙鲁育「魅步」止息：使用锦囊牌后，若使用者正处于自己的出牌阶段，立即结束出牌阶段
      const zx = zhixiRef.current;
      if (zx && zx.id === source.id && card.type === CardType.SCROLL) {
        zx.trickUsed = true;
        const humanOwner = playersRef.current.find(p => p.id === source.id && p.isHuman);
        if (humanOwner && !isAiTakeover && phaseLiveRef.current === GamePhase.ACTION) {
          addLog(`【止息】${source.hero.name} 使用锦囊牌后结束出牌阶段`, 'skill');
          leaveActionPhase();
        }
      }
    }
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
  const resolveCardEffectBase = resolveCardEffect;

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
      // 官方「无双」：仅【杀】需两张【闪】、仅【决斗】需两张【杀】；【南蛮入侵】【万箭齐发】不双牌
      const isLubuWushuang = source.hero.name === '吕布';
      const needTwoCards = isLubuWushuang && !isSecondReaction
        && ((triggerCard.name === CardName.SHA && neededCard === CardName.SHAN)
          || (triggerCard.name === CardName.JUEDOU && neededCard === CardName.SHA));
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
        const canUseSkill = responder.hero.name === '赵云'
          || (responder.hero.name === '赵襄' && (responder.meiyanMarks ?? 0) > 0);
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
        const isGuanyu = canUseWusheng(responder);
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
        // 董白「黠慧」：体力未减少时，获得的黑色牌不能打出
        if (cardToPlay && xiaohuiLocked(responder.id, cardToPlay.id)) {
          addLog(`【黠慧】${responder.hero.name} 不能打出获得的黑色牌【${cardToPlay.name}】（体力未减少）`, 'warning');
          showSkillBanner('董白', '黠慧');
          if (neededCard === CardName.WUXIE) return false;
          cardToPlay = undefined;
          await delay(300);
          await takeDamage(responderId, sourceId, 1, triggerCard);
          return false;
        }
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

        // 「穆穆」：本回合不能打出【杀】
        if (neededCard === CardName.SHA && mumuNoSlashRef.current === responder.id) {
          addLog(`${responder.hero.name} 因「穆穆」本回合不能打出【杀】`, 'skill');
          showSkillBanner(responder.hero.name, '穆穆');
          return false;
        }
        
        // 简单 AI 有概率反应慢半拍，不出【闪】
        if (neededCard === CardName.SHAN && aiDifficultyRef.current === 'easy'
            && responder.hp > 1 && Math.random() < 0.22) {
          addLog(`${responder.hero.name} 反应慢了半拍，没有打出【闪】`, 'info');
          await delay(300);
          await takeDamage(responderId, sourceId, 1, triggerCard);
          return false;
        }
        
        // 检查赵云「龙胆」/ 赵襄「芳魂」的杀闪互转技能
        if (!hasCard && (responder.hero.name === '赵云'
            || (responder.hero.name === '赵襄' && (responder.meiyanMarks ?? 0) > 0))) {
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
        if (!hasCard && canUseWusheng(responder) && neededCard === CardName.SHA) {
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
            // 区分赵云的龙胆、赵襄的芳魂与「武圣」
            if (canUseWusheng(responder)) {
              addLog(`${responder.hero.name} 使用技能「武圣」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner(responder.hero.name, '武圣');
            } else if (responder.hero.name === '赵襄') {
              updatePlayer(responder.id, { meiyanMarks: Math.max(0, (responder.meiyanMarks ?? 0) - 1) });
              addLog(`【芳魂】赵襄移去 1 个「梅影」，发动「龙胆」将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner('赵襄', '芳魂');
            } else {
              addLog(`${responder.hero.name} 使用技能「龙胆」，将【${cardToPlay.name}】当【${neededCard}】使用`, 'skill');
              showSkillBanner(responder.hero.name, '龙胆');
            }
          } else {
            addLog(`${responder.hero.name} 打出了【${neededCard}】`, 'info');
          }

          // 鲍三娘「姝勇」：打出【杀】同样触发（决斗/南蛮/借刀等响应）
          if (neededCard === CardName.SHA) await triggerShuyong(responder.id, sourceId);
          
          
          
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
            
            // 检查「武圣」技能（第二张牌）
            if (!hasSecondCard && canUseWusheng(responder) && neededCard === CardName.SHA) {
              secondCardToPlay = responder.hand.find(c => [Suit.HEART, Suit.DIAMOND].includes(c.suit));
              if (secondCardToPlay) {
                hasSecondCard = true;
                isUsingSecondSkill = true;
              }
            }
            
            if (hasSecondCard && secondCardToPlay) {
              playCard(responder.id, secondCardToPlay);
              if (isUsingSecondSkill) {
                // 区分赵云的龙胆和「武圣」
                if (canUseWusheng(responder)) {
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

  /**
   * 无懈可击询问链（官方规则）：
   * - 锦囊生效前，按座次依次询问所有合法角色（存活且手中有【无懈可击】）是否使用；
   * - 一旦有人使用，该层结束，进入下一层：对这张【无懈可击】本身继续按座次询问是否反制；
   * - 每层都重新按座次询问，但同一角色在同一链条中只被询问一次（asked 集合）；
   * - 层数奇偶决定原锦囊最终是否被抵消。
   * 返回 true = 原锦囊效果被抵消；false = 原锦囊最终生效。
   */
  const MAX_WUXIE_DEPTH = 6;
  const resolveWuxieChain = async (sourceId: number, triggerCard: Card): Promise<boolean> => {
    const total = playersRef.current.length;
    if (total === 0) return false;
    const asked = new Set<number>();
    let anchor = sourceId;
    let nullified = false;
    let depth = 0;
    while (depth < MAX_WUXIE_DEPTH) {
      // 收集本层合法角色：从锚点（锦囊使用者 / 上一张无懈的使用者）起的座次顺序
      const order: number[] = [];
      for (let k = 0; k < total; k++) {
        const id = (anchor + k) % total;
        const p = playersRef.current.find(x => x.id === id);
        if (!p || p.isDead || asked.has(id)) continue;
        if (!p.hand.some(c => c.name === CardName.WUXIE)) continue;
        order.push(id);
      }
      if (order.length === 0) break;
      const orderNames = order.map(id => playersRef.current.find(p => p.id === id)?.hero.name ?? `#${id}`);
      addLog(`【无懈可击】第 ${depth + 1} 层询问（座次）：${orderNames.join(' → ')}`, 'info');

      let user = -1;
      for (const id of order) {
        asked.add(id);
        const used = await triggerReaction(id, depth === 0 ? sourceId : anchor, CardName.WUXIE, triggerCard);
        if (used) { user = id; break; }
      }
      if (user < 0) break;

      depth++;
      nullified = !nullified;
      const name = playersRef.current.find(p => p.id === user)?.hero.name ?? `#${user}`;
      addLog(
        depth === 1
          ? `无懈可击链（第 1 层）：${name} 以【无懈可击】抵消了【${triggerCard.name}】`
          : `无懈可击链（第 ${depth} 层）：${name} 以【无懈可击】反制上一张【无懈可击】`,
        'skill'
      );
      anchor = user;
    }
    if (depth > 0) {
      addLog(
        `无懈可击链结束：共 ${depth} 层，【${triggerCard.name}】${nullified ? '最终被抵消' : '最终生效'}`,
        nullified ? 'success' : 'warning'
      );
    }
    return nullified;
  };

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
      // 张琪瑛「真仪·后土」：自身濒死时，弃置“后土”并将一张手牌当【桃】使用
      const zqyVictim = getPlayer(victimId);
      if (zqyVictim && zqyVictim.hero.name === '张琪瑛' && skillsOn(victimId)
          && hasZhangMark(zqyVictim, '后土') && zqyVictim.hand.length > 0) {
        const card = zqyVictim.hand.find(c => c.name !== CardName.TAO) ?? zqyVictim.hand[0];
        updatePlayer(victimId, { zhangMarks: (zqyVictim.zhangMarks ?? []).filter(m => m !== '后土') });
        mutateHand(victimId, h => h.filter(c => c.id !== card.id));
        const newDiscard = [...discardPileRef.current, card];
        discardPileRef.current = newDiscard;
        setDiscardPile(newDiscard);
        addLog(`【真仪·后土】张琪瑛弃置“后土”标记，将【${card.name}】当【桃】使用`, 'skill');
        showSkillBanner('张琪瑛', '真仪');
        const gained = recoverHp(victimId, 1);
        if (gained > 0) {
          addLog(`${getPlayer(victimId)?.hero.name ?? '张琪瑛'} 因「真仪·后土」回复 1 点体力`, 'success');
        }
        await delay(350);
        if ((getPlayer(victimId)?.hp ?? 0) > 0) {
          recentlySavedRef.current[victimId] = Date.now();
          setDyingState(null);
          return true;
        }
      }

      // 吴国太「补益」：一名角色进入濒死时，可展示其一张非基本手牌，弃置后回复1点体力
      const buyiOwner = playersRef.current.find(p => !p.isDead && p.hero.name === '吴国太' && skillsOn(p.id));
      if (buyiOwner) {
        const curVictim = getPlayer(victimId);
        const nonBasic = curVictim?.hand.find(c => c.type !== CardType.BASIC);
        if (curVictim && curVictim.hp <= 0 && nonBasic) {
          discardCards(victimId, [nonBasic]);
          addLog(`吴国太发动「补益」，展示并弃置 ${curVictim.hero.name} 的【${nonBasic.name}】`, 'skill');
          showSkillBanner('吴国太', '补益');
          const gained = recoverHp(victimId, 1);
          if (gained > 0) {
            addLog(`${curVictim.hero.name} 因「补益」回复 1 点体力（${getPlayer(victimId)?.hp}/${curVictim.maxHp}）`, 'success');
          }
          await delay(300);
          if ((getPlayer(victimId)?.hp ?? 0) > 0) {
            recentlySavedRef.current[victimId] = Date.now();
            setDyingState(null);
            return true;
          }
        }
      }

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
      let lastSaviorId: number | null = null;
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
                  lastSaviorId = player.id;

                  const updatedVictim = getPlayer(victimId)!;
                  if (updatedVictim.hp > 0) {
                    grantXushenToRescuer(victimId, player.id);
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
                lastSaviorId = player.id;

                const updatedVictim = getPlayer(victimId)!;
                if (updatedVictim.hp > 0) {
                  grantXushenToRescuer(victimId, player.id);
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

      // 体力更新可能在下一次提交后才可见：以最终体力为准判定是否脱离濒死
      setDyingState(null);
      const finalHp = getPlayer(victimId)?.hp ?? 0;
      if (finalHp > 0) {
        if (lastSaviorId !== null) grantXushenToRescuer(victimId, lastSaviorId);
        recentlySavedRef.current[victimId] = Date.now();
        addLog(`✅ ${getPlayer(victimId)?.hero.name ?? victim.hero.name} 被救活，脱离了濒死状态！`, 'success');
        return true;
      }
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
  const triggerZhennan = async (source: Player, finalTargets: Player[], card: Card) => {
    if (finalTargets.length <= 1) return;
    const bao = finalTargets.find(t => t.hero.name === '鲍三娘' && t.id !== source.id && skillsOn(t.id) && !t.isDead);
    const srcNow = getPlayer(source.id);
    if (!bao || !srcNow || srcNow.isDead) return;
    if (finalTargets.length <= srcNow.hp) return;
    if (bao.hand.length === 0) return;
    const cost = [...bao.hand].sort((a, b) => a.value - b.value)[0];
    discardCards(bao.id, [cost]);
    addLog(`【镇南】鲍三娘弃置【${cost.name}】，对 ${srcNow.hero.name} 造成 1 点伤害（目标 ${finalTargets.length} > 体力 ${srcNow.hp}）`, 'skill');
    showSkillBanner('鲍三娘', '镇南');
    await delay(300);
    await takeDamage(srcNow.id, bao.id, 1, card);
  };

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
      const nextEquip = { ...(victim.equipment ?? {}) };
      if (entry.slot) delete nextEquip[entry.slot as keyof typeof nextEquip];
      updatePlayer(victim.id, { equipment: nextEquip });
      onEquipLost(victim.id, entry.card.name);
    } else {
      const zone = (victim.judgeZone ?? []).filter(c => c.id !== entry.card.id);
      updatePlayer(victim.id, {
        judgeZone: zone,
        isLeBuSiShu: zone.some(c => c.name === CardName.LESI),
        isBingLiangCunDuan: zone.some(c => c.name === CardName.BINGLIANG),
        isShandian: zone.some(c => c.name === CardName.SHANDIAN),
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
    await takeDamage(targetId, ownerId, 1, undefined, undefined);
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

      // 孙茹「释衅」：锁定技，不会受到火焰伤害（含传导/闪电外的火属性伤害）
      const sunru = getPlayer(victimId);
      if (sunru && sunru.hero.name === '孙茹' && skillsOn(victimId) && dmgNature === 'fire') {
        addLog(`${sunru.hero.name} 的「释衅」发动，免疫火焰伤害`, 'skill');
        showSkillBanner('孙茹', '释衅');
        await delay(350);
        return;
      }
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

      // 古锭刀（锁定技）：你的【杀】造成伤害时，若目标没有手牌，伤害+1
      if (damageCard?.name === CardName.SHA && sourceId !== victimId
          && source?.equipment?.weapon?.name === CardName.GUDING) {
        const victimNow = getPlayer(victimId);
        if (victimNow && victimNow.hand.length === 0) {
          finalAmount += 1;
          addLog(`【古锭刀】目标${victimNow.hero.name}没有手牌，此伤害+1`, 'danger');
          showSkillBanner(source.hero.name, '古锭刀');
        }
      }

      // 马云禄「凤魄」：首张【杀】的伤害加成（按牌 id 一次性结算）
      if (damageCard && fengpoBoostRef.current[damageCard.id]) {
        const bonus = fengpoBoostRef.current[damageCard.id];
        delete fengpoBoostRef.current[damageCard.id];
        finalAmount += bonus;
        addLog(`【凤魄】伤害 +${bonus}`, 'danger');
      }

      // 曹婴「凌人」：猜对的伤害加成（仅对应被猜测的目标）
      const lingrenBoost = damageCard ? lingrenBoostRef.current[damageCard.id] : undefined;
      if (lingrenBoost && lingrenBoost.targetId === victimId) {
        delete lingrenBoostRef.current[damageCard!.id];
        finalAmount += lingrenBoost.bonus;
        if (lingrenBoost.bonus > 0) addLog('【凌人】猜测成功，此伤害 +1', 'danger');
      }

      // 灵雎「竭缘」：对其他角色造成伤害时，若其体力值不小于你，可弃一张黑色手牌令此伤害+1
      const lingjuSrc = getPlayer(sourceId);
      if (lingjuSrc && lingjuSrc.hero.name === '灵雎' && sourceId !== victimId && skillsOn(sourceId)) {
        const v = getPlayer(victimId);
        if (v && v.hp >= lingjuSrc.hp) {
          const black = lingjuSrc.hand.find(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
          if (black) {
            mutateHand(sourceId, h => h.filter(c => c.id !== black.id));
            finalAmount += 1;
            addLog(`【竭缘】灵雎弃置黑色【${black.name}】，此伤害 +1`, 'danger');
            showSkillBanner('灵雎', '竭缘');
          }
        }
      }

      // 张琪瑛「真仪·玉清」：造成伤害时弃置标记判定，黑色则伤害+1
      const zqySrc = getPlayer(sourceId);
      if (zqySrc && zqySrc.hero.name === '张琪瑛' && sourceId !== victimId
          && skillsOn(sourceId) && hasZhangMark(zqySrc, '玉清')) {
        updatePlayer(sourceId, { zhangMarks: (zqySrc.zhangMarks ?? []).filter(m => m !== '玉清') });
        addLog('【真仪·玉清】张琪瑛弃置“玉清”标记进行判定', 'skill');
        showSkillBanner('张琪瑛', '真仪');
        const jc = await performJudgment(sourceId, '真仪');
        if (jc && (jc.suit === Suit.SPADE || jc.suit === Suit.CLUB)) {
          finalAmount += 1;
          addLog('【真仪·玉清】判定为黑色，此伤害 +1', 'danger');
        }
        await delay(300);
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

      // 灵雎「竭缘」：受到其他角色造成的伤害时，若其体力值不小于你，可弃一张红色手牌令此伤害-1
      const lingjuVictim = getPlayer(victimId);
      if (lingjuVictim && lingjuVictim.hero.name === '灵雎' && sourceId >= 0
          && sourceId !== victimId && skillsOn(victimId) && finalAmount > 0) {
        const s = getPlayer(sourceId);
        if (s && s.hp >= lingjuVictim.hp) {
          const red = lingjuVictim.hand.find(c => (c.suit === Suit.HEART || c.suit === Suit.DIAMOND) && c.name !== CardName.TAO)
            ?? (lingjuVictim.hp <= 2
              ? lingjuVictim.hand.find(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND)
              : undefined);
          if (red) {
            mutateHand(victimId, h => h.filter(c => c.id !== red.id));
            finalAmount = Math.max(0, finalAmount - 1);
            addLog(`【竭缘】灵雎弃置红色【${red.name}】，此伤害 -1`, 'skill');
            showSkillBanner('灵雎', '竭缘');
          }
        }
      }

      // 孙鲁班「骄矜」：受到男性角色造成的伤害时，可弃置一张装备牌令此伤害-1
      const jjVictim = getPlayer(victimId);
      if (jjVictim && jjVictim.hero.name === '孙鲁班' && sourceId >= 0 && sourceId !== victimId
          && skillsOn(victimId) && finalAmount > 0) {
        const srcP = getPlayer(sourceId);
        const equipCards = Object.values(jjVictim.equipment ?? {}).filter((c): c is Card => !!c);
        if (srcP && srcP.hero.gender === 'male' && equipCards.length > 0
            && (jjVictim.hp - finalAmount <= 1 || finalAmount >= 2)) {
          const cost = equipCards[0];
          const slot = EQUIP_META[cost.name]?.slot;
          const eq = { ...(jjVictim.equipment ?? {}) };
          if (slot) delete eq[slot];
          updatePlayer(victimId, { equipment: eq });
          setDiscardPile(prev => {
            const next = [...prev, cost];
            discardPileRef.current = next;
            return next;
          });
          finalAmount = Math.max(0, finalAmount - 1);
          addLog(`【骄矜】孙鲁班弃置【${cost.name}】，此伤害 -1`, 'skill');
          showSkillBanner('孙鲁班', '骄矜');
        }
      }

      // 胡金定「仁释」：已受伤时受到【杀】伤害，防止并获得此【杀】，体力上限 -1
      const rjVictim = getPlayer(victimId);
      if (rjVictim && rjVictim.hero.name === '胡金定' && skillsOn(victimId)
          && sourceId !== victimId && damageCard?.name === CardName.SHA
          && rjVictim.hp < rjVictim.maxHp) {
        const gained = damageCard;
        mutateHand(victimId, h => [...h, gained]);
        const newMax = Math.max(1, rjVictim.maxHp - 1);
        updatePlayer(victimId, { maxHp: newMax, hp: Math.min(rjVictim.hp, newMax) });
        addLog(`【仁释】胡金定防止此【杀】造成的伤害并获得【${gained.name}】，体力上限 -1（${newMax}）`, 'skill');
        showSkillBanner('胡金定', '仁释');
        await delay(400);
        return;
      }

      // 羊徽瑜「弘仪」：被指定角色造成伤害时判定，红色受伤角色摸一张，黑色此伤害-1
      const hyOwner = playersRef.current.find(p => !p.isDead && p.hero.name === '羊徽瑜' && skillsOn(p.id));
      if (hyOwner && hyOwner.hongyiTargetId === sourceId && sourceId !== victimId && finalAmount > 0) {
        const hongyiJudge = await performJudgment(hyOwner.id, '弘仪');
        if (hongyiJudge) {
          if (hongyiJudge.suit === Suit.HEART || hongyiJudge.suit === Suit.DIAMOND) {
            drawCards(victimId, 1);
            addLog(`【弘仪】判定为红色，${getPlayer(victimId)?.hero.name} 摸一张牌`, 'skill');
          } else {
            finalAmount = Math.max(0, finalAmount - 1);
            addLog(`【弘仪】判定为黑色，此伤害 -1`, 'skill');
          }
          showSkillBanner('羊徽瑜', '弘仪');
          await delay(300);
          if (finalAmount === 0) return;
        }
      }

      // 蔡贞姬「舍裔」：其他角色受到伤害时，若其体力小于蔡贞姬，可交给其X张牌防止此伤害（每轮一次）
      const czy = playersRef.current.find(p => !p.isDead && p.hero.name === '蔡贞姬' && skillsOn(p.id));
      if (czy && czy.id !== victimId && finalAmount > 0 && !sheyiUsedRef.current && czy.hp > 0) {
        const v = getPlayer(victimId);
        const equipEntries: { card: Card; slot: EquipmentSlot }[] = [];
        const eq = { ...(czy.equipment ?? {}) };
        (Object.keys(eq) as EquipmentSlot[]).forEach(slot => {
          const c = eq[slot];
          if (c) equipEntries.push({ card: c, slot });
        });
        const handAvail = czy.hand;
        const allAvail: Card[] = [...handAvail, ...equipEntries.map(e => e.card)];
        if (v && v.hp < czy.hp && v.hp - finalAmount <= 1 && allAvail.length >= czy.hp) {
          const aiPick = handAvail.slice(0, czy.hp);
          // 人类玩家：从手牌与装备中自选至少 X 张交给受害者；AI / 托管：仍取自手牌前 X 张
          const pick = await requestSkillChoice({
            skill: '舍裔',
            owner: '蔡贞姬',
            title: `是否发动「舍裔」？将至少 ${czy.hp} 张牌交给 ${v.hero.name}，防止即将受到的 ${finalAmount} 点伤害`,
            hint: `可选牌 ${allAvail.length} 张（手牌 ${handAvail.length} / 装备 ${equipEntries.length}），至少交 ${czy.hp} 张`,
            mode: 'card',
            cards: allAvail,
            min: czy.hp,
            max: allAvail.length,
            cancelLabel: '不发动',
          }, czy.isHuman);
          const give = (!pick || pick.kind === 'timeout')
            ? aiPick
            : (pick.kind === 'card' ? allAvail.filter(c => pick.ids.includes(c.id)) : []);
          if (give.length === 0) return;
          sheyiUsedRef.current = true;
          const handGive = give.filter(c => handAvail.some(h => h.id === c.id));
          const equipGive = equipEntries.filter(e => give.some(c => c.id === e.card.id));
          mutateHand(czy.id, h => h.filter(c => !handGive.some(g => g.id === c.id)));
          if (equipGive.length > 0) {
            const nextEq = { ...eq };
            for (const e of equipGive) delete nextEq[e.slot];
            updatePlayer(czy.id, { equipment: nextEq });
          }
          mutateHand(victimId, h => [...h, ...give]);
          addLog(`【舍裔】蔡贞姬将 ${give.length} 张牌交给 ${v.hero.name}（手牌 ${handGive.length} / 装备 ${equipGive.length}），防止此伤害${pick && pick.kind === 'card' ? '（玩家选择）' : '（自动）'}`, 'skill');
          showSkillBanner('蔡贞姬', '舍裔');
          await delay(300);
          return;
        }
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
      if (victim.hero.name === '小乔' && sourceId !== victimId && skillsOn(victimId)) {
        const heartCard = victim.hand.find(c => c.suit === Suit.HEART);
        if (heartCard) {
          discardCards(victimId, [heartCard]);
          addLog(`${victim.hero.name} 发动「天香」，弃置【${heartCard.name}】将伤害转移给 ${getPlayer(sourceId)?.hero.name ?? ''}`, 'skill');
          showSkillBanner(victim.hero.name, '天香');
          await delay(400);
          const receiver = getPlayer(sourceId);
          if (receiver && !receiver.isDead) {
            await takeDamage(sourceId, sourceId, finalAmount, damageCard, dmgNature === 'normal' ? undefined : dmgNature);
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

      // 赵襄「芳魂」：使用【杀】造成伤害后，获得一个「梅影」标记
      if (sourceId !== victimId && damageCard?.name === CardName.SHA) {
        const zx = getPlayer(sourceId);
        if (zx && zx.hero.name === '赵襄' && skillsOn(sourceId)) {
          updatePlayer(sourceId, { meiyanMarks: (zx.meiyanMarks ?? 0) + 1 });
          addLog(`【芳魂】赵襄获得「梅影」标记（${(zx.meiyanMarks ?? 0) + 1} 枚）`, 'skill');
          showSkillBanner('赵襄', '芳魂');
        }
      }

      // 卑弥呼「骨疽」：拥有“傀”的角色受到伤害后，卑弥呼摸一张并获得一个“疽”
      const kuiVictim = getPlayer(victimId);
      if (kuiVictim && kuiVictim.hasKui) {
        const bmh = playersRef.current.find(p => !p.isDead && p.hero.name === '卑弥呼'
          && skillsOn(p.id) && !p.baiJiaAwakened);
        if (bmh) {
          drawCards(bmh.id, 1);
          updatePlayer(bmh.id, { juMarks: (bmh.juMarks ?? 0) + 1 });
          addLog(`【骨疽】${kuiVictim.hero.name} 受到伤害，卑弥呼摸一张牌并获得“疽”（${(bmh.juMarks ?? 0) + 1} 枚）`, 'skill');
          showSkillBanner('卑弥呼', '骨疽');
          await delay(250);
        }
      }

      // 陆郁生「霜怀」：距离 1 以内的其他角色受到伤害后，令其从弃牌堆获得一张【桃】；
      // 与上次目标相同则双方摸一张，不同则陆郁生失去 1 点体力
      if (!shuanghuaiUsedRef.current) {
        const lys = playersRef.current.find(p => !p.isDead && p.id !== victimId
          && p.hero.name === '陆郁生' && skillsOn(p.id) && getDistance(p.id, victimId) <= 1);
        const tao = discardPileRef.current.find(c => c.name === CardName.TAO);
        if (lys && tao) {
          shuanghuaiUsedRef.current = true;
          setDiscardPile(prev => {
            const next = prev.filter(c => c.id !== tao.id);
            discardPileRef.current = next;
            return next;
          });
          mutateHand(victimId, h => [...h, tao]);
          addLog(`【霜怀】陆郁生令 ${victim.hero.name} 从弃牌堆获得【桃】`, 'skill');
          showSkillBanner('陆郁生', '霜怀');
          await delay(300);
          if (lastShuanghuaiTargetRef.current === victimId) {
            drawCards(lys.id, 1);
            drawCards(victimId, 1);
            addLog('【霜怀】目标与上次相同，陆郁生与其各摸一张牌', 'skill');
          } else {
            lastShuanghuaiTargetRef.current = victimId;
            updatePlayer(lys.id, { hp: lys.hp - 1 });
            addLog(`【霜怀】目标与上次不同，陆郁生失去 1 点体力（${lys.hp - 1}/${lys.maxHp}）`, 'skill');
          }
          await delay(250);
        }
      }

      // 张琪瑛「真仪·勾陈」：受到属性伤害后，获得三种类型牌各一张
      const zqyVictim = getPlayer(victimId);
      if (zqyVictim && zqyVictim.hero.name === '张琪瑛' && skillsOn(victimId)
          && dmgNature !== 'normal' && hasZhangMark(zqyVictim, '勾陈')) {
        updatePlayer(victimId, { zhangMarks: (zqyVictim.zhangMarks ?? []).filter(m => m !== '勾陈') });
        addLog('【真仪·勾陈】张琪瑛受到属性伤害，弃置“勾陈”标记', 'skill');
        gainThreeTypes(victimId);
        await delay(400);
      }

      // 张昌蒲「抵诽」：受到伤害后摸或弃一张并展示手牌，若无伤害牌花色则回复1点体力
      const zcpVictim = getPlayer(victimId);
      if (zcpVictim && !zcpVictim.isDead && zcpVictim.hero.name === '张昌蒲' && skillsOn(victimId) && damageCard) {
        const aiDraw = zcpVictim.hand.length < zcpVictim.hp || zcpVictim.hand.length === 0;
        const suitDist = ['♥', '♦', '♠', '♣'].map(s => `${s}${zcpVictim.hand.filter(c => c.suit === s).length}`).join('  ');
        // 人类玩家：先看手牌花色分布，再决定发动方式 / 不发动；AI / 托管：沿用原自动策略
        const pick = await requestSkillChoice({
          skill: '抵诽',
          owner: '张昌蒲',
          title: `是否发动「抵诽」？伤害牌为 ${damageCard.suit}${damageCard.rank}【${damageCard.name}】`,
          hint: `你的手牌花色：${suitDist}；发动后展示手牌，若没有 ${damageCard.suit} 花色则回复 1 点体力`,
          mode: 'choose',
          choices: [
            { id: 'draw', label: '发动：摸一张牌' },
            ...(zcpVictim.hand.length > 0 ? [{ id: 'discard', label: '发动：弃置一张牌', desc: '自动弃点数最小的一张' }] : []),
            { id: 'skip', label: '不发动' },
          ],
          cancelLabel: '不发动',
        }, zcpVictim.isHuman);
        const act = (!pick || pick.kind === 'timeout')
          ? (aiDraw ? 'draw' : 'discard')
          : (pick.kind === 'choose' ? pick.id : 'skip');
        if (act === 'skip') {
          addLog('【抵诽】张昌蒲放弃发动', 'info');
        } else {
          let playerDecided = pick?.kind === 'choose';
          if (act === 'draw') {
            drawCards(victimId, 1);
          } else {
            let chosenCard: Card | undefined;
            const handNow = getPlayer(victimId)?.hand ?? [];
            if (zcpVictim.isHuman && !isAiTakeover) {
              const cardPick = await requestSkillChoice({
                skill: '抵诽',
                owner: '张昌蒲',
                title: '「抵诽」：选择弃置一张手牌',
                mode: 'card',
                cards: handNow,
                min: 1,
                max: 1,
                cancelLabel: '自动弃置点数最小的一张',
              }, true);
              if (cardPick && cardPick.kind === 'card' && cardPick.ids.length === 1) {
                chosenCard = handNow.find(c => c.id === cardPick.ids[0]);
              }
              playerDecided = !!chosenCard;
            }
            const low = chosenCard ?? [...zcpVictim.hand].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
            discardCards(victimId, [low]);
          }
          await delay(0);
          const handForLog = getPlayer(victimId)?.hand ?? [];
          const shown = handForLog.map(c => `【${c.name}】`).join('');
          addLog(`【抵诽】张昌蒲${act === 'draw' ? '摸一张牌' : '弃置一张牌'}，展示手牌：${shown || '（无）'}${playerDecided ? '（玩家选择）' : '（自动）'}`, 'skill');
          showSkillBanner('张昌蒲', '抵诽');
          const zcpAfter = getPlayer(victimId);
          if (zcpAfter && !zcpAfter.isDead && !handForLog.some(c => c.suit === damageCard.suit)) {
            recoverHp(victimId, 1);
            addLog(`【抵诽】张昌蒲手牌均无${damageCard.suit}花色，回复1点体力`, 'skill');
          }
        }
        await delay(300);
      }

      // 郭皇后「殚心」：受到伤害后，摸一张牌或升级「矫诏」（最多升级两次）
      if (victim.hero.name === '郭皇后' && skillsOn(victimId)) {
        const curLevel = guohuanghouLevelRef.current[victimId] ?? 1;
        if (curLevel < 3) {
          guohuanghouLevelRef.current[victimId] = curLevel + 1;
          if (victimId === 0) setGuohuanghouLevel(curLevel + 1);
          addLog(`郭皇后发动「殚心」，「矫诏」提升至 Lv${curLevel + 1}`, 'skill');
        } else {
          drawCards(victimId, 1);
          addLog('郭皇后发动「殚心」，摸一张牌', 'skill');
        }
        showSkillBanner('郭皇后', '殚心');
      }

      // 关银屏「虎啸」：锁定技，造成伤害后摸一张牌（原版无次数限制）
      if (sourceId >= 0 && sourceId !== victimId && source?.hero.name === '关银屏' && skillsOn(sourceId)) {
        addLog(`${source.hero.name} 发动「虎啸」，摸一张牌`, 'skill');
        showSkillBanner(source.hero.name, '虎啸');
        drawCards(sourceId, 1);
      }

      // 郭嘉「遗计」：受到伤害后摸两张牌
      if (victim.hero.name === '郭嘉' && skillsOn(victimId)) {
        drawCards(victimId, 2);
        addLog(`${victim.hero.name} 发动「遗计」，摸两张牌`, 'skill');
        showSkillBanner(victim.hero.name, '遗计');
      }
      // 司马懿「反馈」：受到伤害后获得伤害来源一张手牌
      if (victim.hero.name === '司马懿' && sourceId !== victimId && skillsOn(victimId)) {
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

      // 曹操的「奸雄」技能：受到伤害后，你可以获得造成伤害的牌（曹婴「凌人」可临时获得）
      if ((victim.hero.name === '曹操' || victim.hasJianxiong) && damageCard) {
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

      // 羊徽瑜「劝封」：处于濒死状态时，可加2点体力上限并回复4点体力（限定技）
      const hyDying = getPlayer(victimId);
      if (hyDying && hyDying.hero.name === '羊徽瑜' && skillsOn(victimId) && !hyDying.quanfengUsed && newHp <= 0) {
        // 人类玩家：决定是否发动限定技；AI / 托管：照旧直接发动
        const pick = await requestSkillChoice({
          skill: '劝封',
          owner: '羊徽瑜',
          title: '你处于濒死状态，是否发动限定技「劝封」自救？',
          hint: '体力上限 +2 并回复 4 点体力；不发动则继续求桃，可能阵亡',
          mode: 'choose',
          choices: [{ id: 'yes', label: '发动' }, { id: 'no', label: '不发动' }],
          cancelLabel: '不发动',
        }, hyDying.isHuman);
        const go = (!pick || pick.kind === 'timeout') ? true : (pick.kind === 'choose' ? pick.id === 'yes' : false);
        if (go) {
          const newMax = hyDying.maxHp + 2;
          const healed = Math.min(newMax, Math.max(0, hyDying.hp) + 4);
          updatePlayer(victimId, { maxHp: newMax, hp: healed, quanfengUsed: true });
          addLog(`【劝封】羊徽瑜加2点体力上限并回复4点体力（${healed}/${newMax}）${pick && pick.kind === 'choose' ? '（玩家选择）' : '（自动）'}`, 'skill');
          showSkillBanner('羊徽瑜', '劝封');
          await delay(400);
        } else {
          addLog('【劝封】羊徽瑜放弃发动，继续濒死结算', 'info');
        }
      }

      // 当体力值小于等于0时，进入濒死状态
      if ((getPlayer(victimId)?.hp ?? 0) <= 0) {
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
      await takeDamage(t.id, ownerId, 1);
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
          await takeDamage(target.id, aiPlayer.id, 1);
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
      <div
        data-density={layoutDensity}
        data-size-tier={sizeTier}
        data-motion={motionOn ? 'on' : 'off'}
        data-fx={fxLevel}
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
            onClick={cycleFx}
            className="ui-icon-btn flex-col !gap-0.5"
            title={`${FX_LABEL[fxLevel]}（点击切换）`}
            aria-label={`特效强度：${FX_LABEL[fxLevel]}，点击切换`}
          >
            <span className="text-[12px] leading-none font-bold">特效</span>
            <span className="text-[10px] leading-none opacity-75">{FX_TAG[fxLevel]}</span>
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
              <button onClick={cycleFx} className="ui-icon-btn flex-col !gap-0.5" title={`${FX_LABEL[fxLevel]}（点击切换）`} aria-label={`特效强度：${FX_LABEL[fxLevel]}，点击切换`}>
                <span className="text-[12px] leading-none font-bold">特效</span>
                <span className="text-[10px] leading-none opacity-75">{FX_TAG[fxLevel]}</span>
              </button>
              <button onClick={toggleTheme} className="ui-icon-btn" title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'} aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}>
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
        </div>

        {/* 筛选栏：独立一行，不覆盖/挤占卡片区域；移动端横向滚动，触控高度 ≥44px */}
        <div className="flex-none relative z-20 px-4 pt-1.5">
          <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5" role="tablist" aria-label="按势力筛选武将">
              {(['全部', '魏', '蜀', '吴', '群'] as HeroKingdomFilter[]).map(k => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={heroKingdom === k}
                  onClick={() => { setHeroKingdom(k); setHeroPage(0); }}
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

            <div className={`relative w-full sm:w-64 sm:ml-auto`}>
              <input
                value={heroQuery}
                onChange={(e) => { setHeroQuery(e.target.value); setHeroPage(0); }}
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
                  onClick={() => { setHeroQuery(''); setHeroPage(0); }}
                  aria-label="清空搜索"
                  className={`absolute right-0.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-lg ${theme === 'dark' ? 'text-[#c8bda8]' : 'text-[#6b4a1a]'}`}
                >
                  ✕
                </button>
              )}
            </div>

            <div className={`flex-none text-[11px] text-center sm:text-right ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
              {filteredHeroes.length} / {HEROES.length} 名{heroPageCount > 1 ? ` · 第 ${heroPageClamped + 1}/${heroPageCount} 页` : ''}
            </div>
          </div>
        </div>

        {/* 武将网格：桌面端一屏 3 行，整张牌面裁切，技能名压在牌角 */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 relative z-10 scrollbar-thin">
          {filteredHeroes.length === 0 ? (
            <div className={`py-16 text-center text-sm ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
              没有匹配的武将，试试清空搜索或切换势力
            </div>
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 min-[1200px]:grid-cols-8 gap-3 w-full max-w-[1440px] mx-auto pt-2">
            {pagedHeroes.map(hero => (
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

                {/* 体力：只用勾玉表示（满/空/1血低血量），完整数值见悬停提示 */}
                <span className="hero-hp absolute top-2 right-2" title={`体力上限 ${hero.maxHp}`}>
                  <span className="hero-hp-pips">
                    {Array.from({ length: hero.maxHp }).map((_, i) => (
                      <i key={i} className="hero-hp-pip" />
                    ))}
                  </span>
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
                    {hero.pending && <span className="hero-lord-chip">实装中</span>}
                    {hero.lordSkillName && <span className="hero-lord-chip">主公技</span>}
                  </div>
                  <div className="hero-pick-desc line-clamp-3">{hero.skillDesc}</div>
                </div>
              </button>
            ))}
          </div>
          )}

          {/* 分页：默认每页 24，切页记住位置；按钮触控高度 ≥44px */}
          {heroPageCount > 1 && (
            <div className="flex items-center justify-center gap-2 pb-4 pt-1">
              <button
                onClick={() => setHeroPage(Math.max(0, heroPageClamped - 1))}
                disabled={heroPageClamped === 0}
                className={`min-h-[44px] min-w-[64px] px-3 rounded-md text-sm border disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60'}`}
                aria-label="上一页"
              >
                上一页
              </button>
              {Array.from({ length: heroPageCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroPage(i)}
                  aria-current={heroPageClamped === i ? 'page' : undefined}
                  className={`min-h-[44px] min-w-[44px] rounded-md text-sm font-bold border ${
                    heroPageClamped === i
                      ? (theme === 'dark' ? 'bg-[#c8a45c] text-[#1a1410] border-[#f0d894]' : 'bg-[#6b4a1a] text-[#f7e9c8] border-[#a8842c]')
                      : (theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60')
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setHeroPage(Math.min(heroPageCount - 1, heroPageClamped + 1))}
                disabled={heroPageClamped >= heroPageCount - 1}
                className={`min-h-[44px] min-w-[64px] px-3 rounded-md text-sm border disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-[#1a1410]/80 text-[#c8bda8] border-[#8b7355]/50' : 'bg-[#f3ead8]/80 text-[#6b4a1a] border-[#c4a77d]/60'}`}
                aria-label="下一页"
              >
                下一页
              </button>
            </div>
          )}
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
                  const pool = HEROES.filter(h => h.id !== selectedHero?.id && !h.pending);
                  const pick = pool[Math.floor(Math.random() * pool.length)];
                  startGame(pick);
                }}
                className="btn-ink flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-ancient text-base tracking-wider"
                title="从已实装武将中随机挑选一名立即出战"
              >
                <IconDice />
                天命随机
              </button>
              <button
                onClick={() => selectedHero && startGame(selectedHero)}
                disabled={!selectedHero || selectedHero.pending}
                className="btn-gold flex-1 md:flex-none px-7 py-2.5 rounded-lg font-ancient text-lg tracking-[0.18em]"
              >
                {selectedHero?.pending ? '技能实装中' : '确认出战'}
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

  return (
    <div
      data-density={layoutDensity}
      data-size-tier={sizeTier}
      data-motion={motionOn ? 'on' : 'off'}
      data-fx={fxLevel}
      data-seat-stagger={enemies.length >= 6 ? 'true' : 'false'}
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
      {phaseBanner && fxLevel !== 'classic' && (
        <div key={`phase-${phaseBanner.id}`} className="phase-banner" aria-live="polite">
          <span className="phase-banner-text">{phaseBanner.text}</span>
          <span className="phase-banner-sub">{phaseBanner.sub}</span>
        </div>
      )}
      {damageNumber && (
        <div key={`hit-${damageNumber.id}`} className="absolute inset-0 z-[70] pointer-events-none animate-hit-flash" />
      )}
      {healNumber && (
        <div key={`heal-${healNumber.id}`} className="absolute inset-0 z-[70] pointer-events-none animate-heal-flash" />
      )}

      {/* Visual Effect Overlay - 优化版卡牌动画（判定/濒死期间让位，避免叠影与遮挡抉择弹窗） */}
      {visualCard && !judgmentVisual && !dyingState?.isActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden" style={{ contain: 'layout style paint' }}>
          {/* 出牌聚光：中心微亮 / 四周压暗，视线聚焦到牌面（仅完整档） */}
          {fxFlourish && <div className="absolute inset-0 card-spotlight"></div>}

          {/* 卡牌飞入动画容器 */}
          <div className="relative animate-card-fly-in" style={{ willChange: 'transform' }}>
            {/* 金色冲击环：牌落桌时向外扩散一次（仅完整档） */}
            {fxFlourish && <div className="card-burst" />}
            {/* 卡牌光晕 - 简化 */}
            {fxFlourish && <div className="absolute -inset-6 bg-yellow-400/20 blur-xl rounded-full"></div>}

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

            {/* 粒子效果 - 仅完整档，最多 4 个，随卡面一起销毁 */}
            {fxFlourish && (
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
      {judgmentVisual && fxJudge && (
        <div key={judgmentVisual.id} className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="absolute inset-0 judge-backdrop" />
          <div className="relative flex items-center gap-5 md:gap-9">
            <div className="judge-seal font-ancient">判</div>
            <div className={`relative judge-flip ${['♥', '♦'].includes(String(judgmentVisual.card.suit)) ? 'judge-red' : 'judge-black'} ${fxFlourish ? 'judge-flourish' : ''}`}>
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

      {/* 出牌飞行（仅「完整」档）：牌沿二次曲线从出牌者飞向目标 */}
      {flightFx && (
        <div className="absolute inset-0 z-[54] pointer-events-none overflow-hidden" style={{ contain: 'layout style paint' }}>
          <div
            key={flightFx.id}
            className="fx-flight-card"
            style={{
              '--x0': `${flightFx.x0}px`, '--y0': `${flightFx.y0}px`,
              '--x1': `${flightFx.x1}px`, '--y1': `${flightFx.y1}px`,
            } as React.CSSProperties}
          >
            <span className="fx-flight-name font-ancient">{flightFx.card.name}</span>
          </div>
        </div>
      )}

      {/* 濒死：只在屏幕四边做低透明度红色呼吸，不整屏压红（纯净档起启用） */}
      {fxDying && dyingState?.isActive && <div className="fx-dying-edge" aria-hidden="true" />}

      {/* 技能发动特写：立绘从右侧切入 + 技能名大字（纯 CSS，≤1.2s，点击可跳过） */}
      {skillBanner && fxSkill && (() => {
        const caster = players.find(p => p.hero.name === skillBanner.hero)?.hero;
        return (
          <div key={skillBanner.id} className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none skill-cast-layer">
            <div
              className={`skill-cast text-center ${fxFlourish ? 'has-sweep' : ''}`}
              onClick={() => {
                if (skillBannerTimerRef.current) clearTimeout(skillBannerTimerRef.current);
                setSkillBanner(null);
              }}
              role="presentation"
            >
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

      {/* 通用技能选择弹窗（人类角色可选；AI / 托管不出现） */}
      {skillChoice && !isAiTakeover && (
        <div className="absolute inset-0 z-50 modal-mask flex items-center justify-center p-4">
          <div className="modal-frame w-full max-w-2xl p-5" role="dialog" aria-label={`${skillChoice.skill}选择`}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="modal-title text-2xl font-ancient">【{skillChoice.skill}】</h3>
              <span className="modal-text-dim text-sm tabular-nums">{skillChoiceLeft ?? SKILL_CHOICE_SECONDS} 秒</span>
            </div>
            <p className="modal-text text-base mb-1">{skillChoice.title}</p>
            {skillChoice.hint && <p className="modal-text-dim text-sm mb-2">{skillChoice.hint}</p>}
            <div className="modal-divider mb-3" />

            {skillChoice.mode === 'choose' && (
              <div className="flex flex-col gap-2">
                {skillChoice.choices?.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => resolveSkillChoice({ kind: 'choose', id: ch.id })}
                    className="btn-ink min-h-[44px] px-4 py-2 rounded-lg text-left"
                  >
                    <span className="font-bold">{ch.label}</span>
                    {ch.desc && <span className="block text-xs opacity-70">{ch.desc}</span>}
                  </button>
                ))}
              </div>
            )}

            {skillChoice.mode === 'multi' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {skillChoice.choices?.map(ch => {
                    const on = skillChoiceSel.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        onClick={() => toggleSkillChoiceItem(ch.id, false)}
                        className={`btn-ink min-h-[44px] px-3 py-2 rounded-lg text-sm ${on ? 'ring-2 ring-[#e8cf94]' : ''}`}
                      >
                        <span className="font-bold">{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="modal-text-dim text-xs text-center mt-2">
                  已选 {skillChoiceSel.length} 项，需 {skillChoice.min ?? 1}–{skillChoice.max ?? 3} 项
                </p>
              </>
            )}

            {skillChoice.mode === 'card' && (
              <>
                <div className="flex flex-wrap gap-2 justify-center max-h-[46vh] overflow-y-auto p-1 scrollbar-thin">
                  {skillChoice.cards?.map(c => {
                    const on = skillChoiceSel.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        className="relative cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                        onClick={() => toggleSkillChoiceItem(c.id, false)}
                        role="button"
                        aria-label={`选择【${c.name}】`}
                      >
                        <CardComponent card={c} small />
                        {on && <span className="absolute inset-0 rounded-lg ring-2 ring-[#e8cf94] bg-[#e8cf94]/10" />}
                      </div>
                    );
                  })}
                </div>
                <p className="modal-text-dim text-xs text-center mt-2">
                  已选 {skillChoiceSel.length} 张，需 {skillChoice.min ?? 1}–{skillChoice.max ?? (skillChoice.cards?.length ?? 0)} 张
                </p>
              </>
            )}

            {skillChoice.mode === 'target' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {skillChoice.targets?.map(t => {
                  const on = skillChoiceSel.includes(String(t.id));
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleSkillChoiceItem(String(t.id), (skillChoice.max ?? 1) <= 1)}
                      className={`btn-ink min-h-[44px] px-3 py-2 rounded-lg text-sm ${on ? 'ring-2 ring-[#e8cf94]' : ''}`}
                    >
                      <span className="font-bold">{t.name}</span>
                      {t.sub && <span className="block text-xs opacity-70">{t.sub}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => resolveSkillChoice({ kind: 'cancel' })}
                className="btn-ink min-h-[44px] px-4 rounded-lg text-sm"
              >
                {skillChoice.cancelLabel || '取消'}
              </button>
              {(skillChoice.mode === 'card' || skillChoice.mode === 'target' || skillChoice.mode === 'multi') && (
                <button
                  onClick={submitSkillChoice}
                  disabled={!skillChoiceValid}
                  className="btn-ink min-h-[44px] px-5 rounded-lg text-sm font-bold disabled:opacity-40"
                >
                  {skillChoice.mode === 'card' ? '确认选择' : (skillChoice.mode === 'multi' ? '确认猜测' : '确认目标')}
                </button>
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
                   const canUseSkill = me.hero.name === '赵云'
                     || (me.hero.name === '赵襄' && (me.meiyanMarks ?? 0) > 0);
                   const skillCardName = neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN;
                   const responder = players.find(p => p.id === pendingReaction.targetId) || me;
                   const hasWuxie = responder.hand.some(c => c.name === CardName.WUXIE);
                   // 「武圣」：红色牌可当【杀】打出
                   const canWusheng = canUseWusheng(me) && neededCard === CardName.SHA;
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
                   {/* 对局内技能说明浮层不显示称号（epithet） */}
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
                       {canUseWusheng(me) && (
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
                         const isGuanyu = canUseWusheng(me);
                         
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
          <button
            onClick={cycleFx}
            className="ui-icon-btn game-settings-hide flex-col !gap-0.5"
            title={`${FX_LABEL[fxLevel]}（点击切换）`}
            aria-label={`特效强度：${FX_LABEL[fxLevel]}，点击切换`}
          >
            <span className="text-[12px] leading-none font-bold">特效</span>
            <span className="text-[10px] leading-none opacity-75">{FX_TAG[fxLevel]}</span>
          </button>
        </div>

        {/* 环形座位：桌面端绝对定位环绕牌桌；手机端为顶部横向压缩小卡 */}
      <div data-region="seats" data-many={enemies.length >= 5 ? 'true' : 'false'} className={`relative w-full flex items-start justify-center gap-1 overflow-x-auto pt-[44px] pb-1 px-1 scrollbar-hide md:pt-0 md:pb-0 md:px-0 md:absolute md:top-0 md:left-0 md:right-0 md:h-[68vh] md:block md:overflow-visible`}>
          {enemies.map((p, index) => {
            // 顶部一行平铺全部敌人，左右两侧留给战报与出牌顺序条，中央卡池不被任何座位遮挡
            const totalEnemies = enemies.length;
            const baseW = layoutDensity === 'roomy' ? (sizeTier === 'xl' ? 208 : 196)
              : layoutDensity === 'normal' ? 164
              : layoutDensity === 'compact' ? 156
              : layoutDensity === 'tight' ? 144 : 136;
            // 座位保持基准宽度（不缩卡），中心间距 =（卡宽+12）× 1.17；视口放不下时退让（7 人局允许轻微压叠）
            const seatW = baseW;
            const inner = Math.max(320, viewport.w - 32);
            const wantedPitch = Math.round((seatW + 12) * 1.17);
            const fitPitch = totalEnemies > 1 ? Math.floor((inner - seatW) / (totalEnemies - 1)) : 0;
            const seatPitch = totalEnemies > 1 ? Math.min(wantedPitch, Math.max(1, fitPitch)) : 0;
            // 6 个对手（7 人局）在 1440 宽下必然贴边，用 26px 上下错位拉开视觉
            const seatShift = totalEnemies >= 6 && index % 2 === 1 ? 26 : 0;
            const side = 'top';
            const offset = index - (totalEnemies - 1) / 2;
            const leftPercent = `calc(50% + ${Math.round(offset * seatPitch)}px)`;
            // 选中【杀】类牌时，超出攻击范围的目标灰显
            const outOfRange = !p.isDead && isSelectingTarget && slashLikeActive && getDistance(me.id, p.id) > getAttackRange(me);
            // 正处于「选择目标」流程时，给合法目标一个明确的候选标记
            const selectableTarget = !p.isDead && (isSelectingTarget || isLijianMode || isJieyinMode || isJijiangMode
              || (isRendeMode && rendeSelectedCardIds.length > 0) || isJiedaoMode);
            
            return (
            <div 
              key={p.id} 
              className="ring-seat"
              data-side={side}
              data-seat-id={p.id}
              style={{
                '--seat-left': leftPercent,
                '--seat-shift': `${seatShift}px`,
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
              
              {/* 当前回合呼吸光晕：独立层只动 opacity，避免每帧重绘整张卡 */}
              {turnIndex === p.id && !(dyingState && dyingState.isActive && dyingState.victimId === p.id) && (
                <span className="turn-glow" aria-hidden="true" />
              )}
              
              {/* 玩家卡牌容器 - 统一深墨描金；支持 Enter / Space 等价点击 */}
              <div
                role="button"
                tabIndex={0}
                aria-label={p.isDead ? `${p.hero.name}（已阵亡）` : `查看 ${p.hero.name} 的武将详情`}
                onClick={() => {
                  const selecting = isSelectingTarget || isLijianMode || isJieyinMode || isJijiangMode
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
                  const selecting = isSelectingTarget || isLijianMode || isJieyinMode || isJijiangMode
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
                ${p.isDead ? 'is-dead' : ''}
                ${p.identity === Identity.ZHUGONG ? 'is-lord-card' : ''}
                ${dyingState && dyingState.isActive && dyingState.victimId === p.id ? 'is-dying' : ''}
                ${turnIndex === p.id && !(dyingState && dyingState.isActive && dyingState.victimId === p.id) ? 'is-current-turn' : ''}
                ${turnIndex === p.id
                  ? (fxLevel === 'pure'
                    ? 'border-[#e8cf94]/70'
                    : 'border-[#c8a45c] shadow-[0_0_22px_rgba(200,164,92,0.30)] scale-105')
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
                ${damageAnimTarget === p.id && fxLevel !== 'pure' && fxLevel !== 'classic' ? 'animate-damage-shake' : ''}
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
                    {(p.isRevealed || p.isHuman || p.identity === Identity.ZHUGONG || p.isDead) && (
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

                  {/* 体力勾玉：固定在右上角安全区（身份章下方），绝不与左侧竖排姓名/技能相交 */}
                  <div className="seat-hp-corner" title={`体力 ${p.hp}/${p.maxHp}`}>
                    <div className="seat-pips">
                      {Array.from({ length: p.maxHp }).map((_, i) => (
                        <span key={i} className={`seat-pip ${i < p.hp ? (p.hp === 1 ? 'is-low' : 'is-on') : ''}`} />
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* 底部信息层：手牌数 / 距离 / 装备四槽 / 判定区
                    对局卡面不放称号（epithet）：只显示姓名与技能，避免重复占用卡面 */}
                <div className="seat-info">
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
               {/* 只渲染最近 40 条：独立 memo 组件，仅在 logs 变化时更新 */}
               <LogRows logs={logs} />
               <div ref={logsEndRef} />
             </div>
           </div>
          )}
        </div>

        {/* Phase Indicator - 五阶段进度轨（底部居中，紧邻手牌条上方） */}
        <div className={`phase-panel hidden md:flex ui-panel absolute left-1/2 -translate-x-1/2 top-[63%] px-5 py-2.5 z-30 flex-col items-center ${theme === 'dark' ? 'shadow-[0_6px_24px_rgba(0,0,0,0.55)]' : ''}`}>
          <div className={`text-[15px] mb-1.5 tracking-[0.2em] ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
            当前阶段 · <span className="text-[#e8cf94]">{getPlayer(turnIndex)?.hero.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {[GamePhase.START, GamePhase.JUDGE, GamePhase.DRAW, GamePhase.ACTION, GamePhase.DISCARD, GamePhase.END].map((ph, i) => {
              const phIndex = [GamePhase.START, GamePhase.JUDGE, GamePhase.DRAW, GamePhase.ACTION, GamePhase.DISCARD, GamePhase.END].indexOf(phase);
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
        {/* 出牌顺序：右侧竖向顺序条（桌面）；手机端折叠为一条横排 */}
        <div data-region="turn-rail" data-count={players.length} data-collapsed={orderCollapsed ? 'true' : 'false'} className="hidden md:flex flex-col">
          {orderCollapsed ? (
            <button
              type="button"
              onClick={() => setOrderCollapsedPersist(false)}
              className="turn-rail-mini"
              aria-label="展开出牌顺序"
              aria-expanded={false}
              title="展开出牌顺序"
            >
              <span className="turn-rail-mini-idx">{Math.max(1, players.findIndex(p => p.id === turnIndex) + 1)}</span>
              {players.find(p => p.id === turnIndex) && (
                <img className="turn-rail-mini-avatar" src={players.find(p => p.id === turnIndex)!.hero.avatarUrl} alt="" />
              )}
              <span className="turn-rail-mini-hint">顺序</span>
            </button>
          ) : (
            <>
              <div className="turn-rail-head">
                <span>出牌顺序</span>
                <button
                  type="button"
                  onClick={() => setOrderCollapsedPersist(true)}
                  className="turn-rail-fold"
                  aria-label="收起出牌顺序"
                  aria-expanded={true}
                  title="收起出牌顺序"
                >收</button>
              </div>
              {players.map((p, i) => {
                const isCur = turnIndex === p.id;
                const nextId = players[(turnIndex + 1) % Math.max(1, players.length)]?.id;
                const state = p.isDead ? '阵亡' : isCur ? '当前' : p.id === nextId ? '下家' : p.id < turnIndex ? '已行动' : '待行动';
                return (
                  <div key={p.id} className={`turn-rail-row ${KINGDOM_CLASS[p.hero.kingdom] || 'kingdom-qun'}`} data-active={isCur ? 'true' : 'false'} data-dead={p.isDead ? 'true' : 'false'} title={`${p.hero.name} · ${p.hero.kingdom} · ${state}`}>
                    <span className="turn-rail-idx">{i + 1}</span>
                    <img className="turn-rail-avatar" src={p.hero.avatarUrl} alt="" />
                    <span className="turn-rail-name">{p.hero.name}</span>
                    <span className="turn-rail-state">{state}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div data-region="turn-strip" data-collapsed={orderCollapsed ? 'true' : 'false'} className="md:hidden flex items-center gap-1">
          {orderCollapsed ? (
            <button
              type="button"
              onClick={() => setOrderCollapsedPersist(false)}
              className={`turn-strip-mini ${KINGDOM_CLASS[players.find(p => p.id === turnIndex)?.hero.kingdom ?? ''] || 'kingdom-qun'}`}
              aria-label="展开出牌顺序"
              aria-expanded={false}
              title="展开出牌顺序"
            >
              <span className="turn-strip-mini-tag">顺序</span>
              <span className="turn-strip-mini-name">{players.find(p => p.id === turnIndex)?.hero.name ?? '—'}</span>
              <span className="turn-strip-mini-arrow" aria-hidden="true">▾</span>
            </button>
          ) : (
            <>
              {players.map((p) => (
                <span key={p.id} className={`turn-chip ${KINGDOM_CLASS[p.hero.kingdom] || 'kingdom-qun'}`} data-active={turnIndex === p.id ? 'true' : 'false'}>
                  {p.hero.name}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setOrderCollapsedPersist(true)}
                className="turn-strip-fold"
                aria-label="收起出牌顺序"
                aria-expanded={true}
                title="收起出牌顺序"
              >▴</button>
            </>
          )}
        </div>

        <div data-region="center-decks" className="relative flex items-center gap-12 max-md:gap-6 z-[1]">
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
          {/* 主视角座位：与敌方座位卡同一套卡面（势力框 + 全幅立绘 + 左竖姓名 + 右上勾玉 + 底部信息层） */}
          <div
            data-seat-id={0}
            className={`
              own-seat seat-card relative rounded-xl border-2 kingdom-frame hero-card ${KINGDOM_CLASS[me.hero.kingdom] ?? ''}
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8cf94]
              ${damageAnimTarget === 0 || healAnimTarget === 0
                ? '' // 动画期间禁用过渡效果
                : 'transition-[transform,box-shadow,border-color] duration-300'
              }
              ${me.isDead
                ? 'bg-[#15110e]/95 border-[#4a3f33] opacity-55'
                : 'bg-[#1c1611]/95 border-[#8b7355]/45'
              }
              ${me.isDead ? 'is-dead' : ''}
              ${me.identity === Identity.ZHUGONG ? 'is-lord-card' : ''}
              ${dyingState && dyingState.isActive && dyingState.victimId === me.id ? 'is-dying' : ''}
              ${isMyTurn && !(dyingState && dyingState.isActive && dyingState.victimId === me.id) ? 'is-current-turn' : ''}
              ${isMyTurn
                ? (fxLevel === 'pure'
                  ? 'border-[#e8cf94]/70'
                  : 'border-[#c8a45c] shadow-[0_0_22px_rgba(200,164,92,0.30)] scale-105')
                : ''
              }
              ${damageAnimTarget === 0 && fxLevel !== 'pure' && fxLevel !== 'classic' ? 'animate-damage-shake' : ''}
              ${healAnimTarget === 0 ? 'animate-heal-pulse' : ''}
            `}
          >
            {/* 当前回合呼吸光晕（独立层，只动 opacity） */}
            {isMyTurn && !(dyingState && dyingState.isActive && dyingState.victimId === me.id) && (
              <span className="turn-glow" aria-hidden="true" />
            )}
            {/* 势力色顶条：与座位卡一致 */}
            <span
              className="absolute top-0 left-2 right-2 h-[2px] rounded-full opacity-80"
              style={{ background: 'var(--k-main)' }}
            />

            {/* 伤害数字显示 */}
            {damageNumber && damageNumber.targetId === 0 && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <div className="text-4xl font-bold text-red-500 animate-damage-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                  -{damageNumber.amount}
                </div>
              </div>
            )}

            {/* 治疗数字显示 */}
            {healNumber && healNumber.targetId === 0 && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <div className="text-4xl font-bold text-green-500 animate-heal-float drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                  +{healNumber.amount}
                </div>
              </div>
            )}

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

              {/* 阵亡遮罩 */}
              {me.isDead && (
                <div className="seat-dead">
                  <span>阵亡</span>
                </div>
              )}

              {/* 势力 + 身份：与座位卡同一套角章 */}
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

              {/* 左侧竖排：姓名 + 技能（与座位卡同字号，姓名独占一列，不被勾玉覆盖） */}
              <div className="seat-name-rail">
                <span className="seat-name">{me.hero.name}</span>
                <span className="seat-skill">【{me.hero.skillName}】</span>
              </div>

              {/* 体力勾玉：右上角安全区，与姓名 0 重叠 */}
              <div className="seat-hp-corner" title={`体力 ${me.hp}/${me.maxHp}`}>
                <div className="seat-pips">
                  {Array.from({ length: me.maxHp }).map((_, i) => (
                    <span key={i} className={`seat-pip ${i < me.hp ? (me.hp === 1 ? 'is-low' : 'is-on') : ''}`} />
                  ))}
                </div>
              </div>

              {isMyTurn && (
                <div data-tour="turn" className="own-turn-chip">我的回合</div>
              )}
            </div>

            {/* 底部信息层：手牌 / 范围 / 装备四槽 / 判定区，与座位卡同一层级 */}
            <div className="seat-info">
              <div className="seat-meta-row">
                <span className="seat-hand-count">手牌 <b className="tabular-nums">{me.hand.length}</b></span>
                <span className="seat-distance">范围 {getAttackRange(me)}</span>
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

              {/* 判定区：乐 / 兵 / 电 / 链 逐张可见 */}
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

                            // 官方「仁德」：出牌阶段内累计给出的牌首次达到 2 张时回复 1 点体力（每阶段一次）
                            rendeGivenRef.current += cardsToGive.length;
                            if (!rendeHealedRef.current && rendeGivenRef.current >= 2) {
                              rendeHealedRef.current = true;
                              if (me.hp < me.maxHp) {
                                // 触发治疗动画
                                setHealAnimTarget(me.id);
                                setHealNumber({ targetId: me.id, amount: 1, id: Date.now().toString() });
                                setTimeout(() => setHealAnimTarget(null), 600);
                                setTimeout(() => setHealNumber(null), 1000);

                                updatePlayer(me.id, { hp: me.hp + 1 });
                                addLog(`${me.hero.name} 使用「仁德」本阶段累计给出${rendeGivenRef.current}张牌，回复1点体力！`, 'skill');
                              }
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

                    {/* 张昌蒲「严教」：出牌阶段限一次，人类自选花色与目标 */}
                    {players[0].hero.name === '张昌蒲' && !hasUsedYanjiao && players[0].hand.length > 0 && (
                      <button
                        onClick={async () => {
                          const me = players.find(p => p.isHuman) || players[0];
                          const suits = [Suit.SPADE, Suit.HEART, Suit.CLUB, Suit.DIAMOND]
                            .filter(s => me.hand.some(c => c.suit === s));
                          if (!suits.length) return;
                          const r = await requestSkillChoice({
                            skill: '严教',
                            owner: me.hero.name,
                            title: '选择要交出的花色（该花色的所有手牌）',
                            mode: 'choose',
                            choices: suits.map(s => ({ id: s, label: `全部 ${s} 牌（${me.hand.filter(c => c.suit === s).length} 张）` })),
                            cancelLabel: '取消严教',
                          });
                          if (!r || r.kind !== 'choose') return;
                          const others = playersRef.current.filter(p => !p.isDead && p.id !== me.id);
                          if (!others.length) {
                            addLog('【严教】没有其他角色可交给', 'warning');
                            return;
                          }
                          const r2 = await requestSkillChoice({
                            skill: '严教',
                            owner: me.hero.name,
                            title: '选择交给的角色',
                            mode: 'choose',
                            choices: others.map(p => ({ id: String(p.id), label: p.hero.name, desc: `${p.hp}/${p.maxHp}` })),
                            cancelLabel: '取消严教',
                          });
                          if (!r2 || r2.kind !== 'choose') return;
                          await doYanjiao(me.id, Number(r2.id), r.id as Suit);
                        }}
                        className="skill-btn text-base"
                        title="出牌阶段限一次：将某花色的所有手牌交给一名其他角色，然后对其造成1点伤害"
                      >
                        严教
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

                       {/* 刘备「激将」：主公技，主动使用【杀】时可令其他蜀势力角色打出【杀】 */}
                       {players[0].hero.name === '刘备' && players[0].identity === Identity.ZHUGONG && !isJijiangMode
                         && players.slice(1).some(p => !p.isDead && p.hero.kingdom === '蜀'
                           && p.hand.some(c => c.name === CardName.SHA)) && (
                         <button
                           onClick={() => {
                             setIsJijiangMode(true);
                             setIsSelectingTarget(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('请选择【杀】的目标（刘备「激将」）...', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           激将
                         </button>
                       )}

                       {isJijiangMode && (
                         <button
                           onClick={() => {
                             setIsJijiangMode(false);
                             addLog('取消了「激将」技能', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消激将
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

                       {/* 吴国太「甘露」 */}
                       {players[0].hero.name === '吴国太' && !isGanluMode && !hasUsedGanlu
                         && players.filter(p => !p.isDead).length >= 2 && (
                         <button
                           onClick={() => {
                             setIsGanluMode(true);
                             setGanluTargets([]);
                             setIsSelectingTarget(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('「甘露」：请依次选择两名角色（装备数差不超过已损体力）', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           甘露
                         </button>
                       )}
                       {isGanluMode && (
                         <button
                           onClick={() => {
                             setIsGanluMode(false);
                             setGanluTargets([]);
                             setIsSelectingTarget(false);
                             addLog('取消了「甘露」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消甘露
                         </button>
                       )}

                       {/* 邹氏「倾城」 */}
                       {players[0].hero.name === '邹氏' && !isQingchengMode && !hasUsedQingcheng
                         && (players[0].hand.some(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB)
                           || (Object.values(players[0].equipment ?? {}) as Array<Card | undefined>).some(c => !!c && (c.suit === Suit.SPADE || c.suit === Suit.CLUB))) && (
                         <button
                           onClick={() => {
                             setIsQingchengMode(true);
                             setIsSelectingTarget(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('「倾城」：请选择一名武将牌明置的角色（弃置一张黑色牌暗置其武将牌）', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           倾城
                         </button>
                       )}
                       {isQingchengMode && (
                         <button
                           onClick={() => {
                             setIsQingchengMode(false);
                             setIsSelectingTarget(false);
                             addLog('取消了「倾城」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消倾城
                         </button>
                       )}

                       {/* 郭皇后「矫诏」 */}
                       {players[0].hero.name === '郭皇后' && !hasUsedJiaozhao && players[0].hand.length > 0 && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveJiaozhao(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           矫诏 Lv{guohuanghouLevel}
                         </button>
                       )}
                       {players[0].hero.name === '郭皇后' && jiaozhaoPending && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveJiaozhaoUse(); }}
                           className="skill-btn text-base"
                         >
                           使用矫诏【{jiaozhaoPending.declared}】
                         </button>
                       )}

                       {/* 黄盖「苦肉」 */}
                       {players[0].hero.name === '黄盖' && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveKurou(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           苦肉
                         </button>
                       )}

                       {/* 关银屏「血祭」 */}
                       {players[0].hero.name === '关银屏' && !hasUsedXueji
                         && players[0].maxHp > players[0].hp
                         && players[0].hand.some(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND) && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveXueji(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           血祭
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
                  const excess = excessCards(me);
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
           {/* 手机端最近战报：塞在手牌上方的留白里，不压中央卡池 */}
           <div className="mobile-log md:hidden">
             {logs.slice(-1).map(log => (
               <div key={log.id} className="mobile-log-line">{log.text}</div>
             ))}
           </div>
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
                  const canUseSkill = me.hero.name === '赵云'
                    || (me.hero.name === '赵襄' && (me.meiyanMarks ?? 0) > 0);
                  const skillCardName = neededCard === CardName.SHAN ? CardName.SHA : CardName.SHAN;
                  // 「武圣」：红色牌可当【杀】打出
                  const isWushengCard = canUseWusheng(me) && neededCard === CardName.SHA &&
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
               const fanY = Math.abs(offset) * Math.abs(offset) * 1.6 - (layoutDensity === 'ultra' ? 6 : 0);

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
