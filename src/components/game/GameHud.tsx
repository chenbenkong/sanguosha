import React, { useEffect, useRef } from 'react';
import { LogEntry, Player, GamePhase, Identity } from '../../../types';
import { KINGDOM_CLASS } from '../../game/constants';

/** 战报行：只依赖 logs 引用，避免高频状态带动 40 行重渲染 */
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

/** 战况记录侧栏：折叠态 + 展开态，含用户滚动检测与自动滚底 */
export const LogPanel: React.FC<{
  logs: LogEntry[];
  collapsed: boolean;
  hidden: boolean;
  onCollapsedChange: (v: boolean) => void;
}> = ({ logs, collapsed, hidden, onCollapsedChange }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToEnd = (behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    const target = endRef.current;
    if (!container || !target) return;
    container.scrollTo({ top: target.offsetTop - container.offsetTop, behavior });
  };

  useEffect(() => {
    if (userScrollingRef.current) return;
    scrollToEnd();
  }, [logs]);

  const resumeLater = (ms: number) => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
      scrollToEnd();
    }, ms);
  };

  return (
    <div data-region="log" className={`absolute left-2 ${hidden ? 'hidden' : 'hidden md:flex'} z-30 transition-[width] duration-200 ${collapsed ? 'log-collapsed w-10' : 'w-[340px]'}`}>
      {collapsed ? (
        <button
          onClick={() => onCollapsedChange(false)}
          className="log-panel w-full h-full flex flex-col items-center justify-center gap-2"
          aria-label="展开战况记录"
          title="展开战况记录"
        >
          <span className="text-[13px] tracking-[0.3em] text-[#d9c49a]" style={{ writingMode: 'vertical-rl' }}>战况记录</span>
          <span className="text-[13px] tabular-nums px-1.5 py-0.5 rounded bg-black/40 text-[#e8cf94] border border-[#8b7355]/40">{logs.length}</span>
        </button>
      ) : (
        <div className="log-panel h-full w-full flex flex-col overflow-hidden">
          <div className="flex-none px-3 py-2 border-b border-[#8b7355]/25 bg-black/25">
            <div className="flex items-center gap-2">
              <span className="w-[3px] h-4 rounded-sm bg-gradient-to-b from-[#f0d894] to-[#a8842c]" />
              <span className="text-[13px] font-bold tracking-[0.2em] text-[#d9c49a]">战况记录</span>
              <span className="text-[13px] tabular-nums text-[#8f806a]">{logs.length}</span>
              <button
                onClick={() => onCollapsedChange(true)}
                className="ml-auto text-[13px] px-1.5 py-0.5 rounded border border-[#8b7355]/50 text-[#d9c49a] hover:bg-white/10"
                aria-label="收起战况记录"
                title="收起战况记录"
              >
                收起 ‹
              </button>
            </div>
          </div>
          <div
            ref={containerRef}
            role="log"
            aria-live="polite"
            aria-label="战况记录"
            className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-transparent"
            onScroll={() => { userScrollingRef.current = true; resumeLater(1000); }}
            onMouseEnter={() => { userScrollingRef.current = true; }}
            onMouseLeave={() => resumeLater(500)}
          >
            <LogRows logs={logs} />
            <div ref={endRef} />
          </div>
        </div>
      )}
    </div>
  );
};

const PHASES = [GamePhase.START, GamePhase.JUDGE, GamePhase.DRAW, GamePhase.ACTION, GamePhase.DISCARD, GamePhase.END];

/** 五阶段进度轨 + 决策读秒（桌面） */
export const PhasePanel: React.FC<{
  theme: 'dark' | 'light';
  phase: GamePhase;
  playerName: string;
  decisionLeft: number | null;
  decisionSeconds: number;
  hidden: boolean;
}> = ({ theme, phase, playerName, decisionLeft, decisionSeconds, hidden }) => {
  const phIndex = PHASES.indexOf(phase);
  return (
    <div className={`phase-panel ${hidden ? 'hidden' : 'hidden md:flex'} ui-panel absolute left-1/2 -translate-x-1/2 top-[63%] px-5 py-2.5 z-30 flex-col items-center ${theme === 'dark' ? 'shadow-[0_6px_24px_rgba(0,0,0,0.55)]' : ''}`}>
      <div className={`text-[15px] mb-1.5 tracking-[0.2em] ${theme === 'dark' ? 'text-[#9a8b74]' : 'text-[#8a7a60]'}`}>
        当前阶段 · <span className="text-[#e8cf94]">{playerName}</span>
      </div>
      <div className="flex items-center gap-1">
        {PHASES.map((ph, i) => {
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
      {decisionLeft !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className={`flex-1 h-1 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`}>
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-linear ${decisionLeft <= 5 ? 'bg-[#e0705f]' : theme === 'dark' ? 'bg-[#d4af37]' : 'bg-[#a8842c]'}`}
              style={{ width: `${Math.max(0, Math.min(100, (decisionLeft / decisionSeconds) * 100))}%` }}
            />
          </div>
          <span className={`text-[14px] font-bold tabular-nums tracking-wider ${decisionLeft <= 5 ? 'text-[#e0705f] animate-pulse' : theme === 'dark' ? 'text-[#e8cf94]' : 'text-[#8b6914]'}`}>
            {decisionLeft}s
          </span>
        </div>
      )}
    </div>
  );
};

/** 出牌顺序：桌面右侧竖条 */
export const TurnRail: React.FC<{
  players: Player[];
  turnIndex: number;
  collapsed: boolean;
  hidden: boolean;
  onCollapsedChange: (v: boolean) => void;
}> = ({ players, turnIndex, collapsed, hidden, onCollapsedChange }) => {
  const current = players.find(p => p.id === turnIndex);
  return (
    <div data-region="turn-rail" data-count={players.length} data-collapsed={collapsed ? 'true' : 'false'} className={`${hidden ? 'hidden' : 'hidden md:flex'} flex-col`}>
      {collapsed ? (
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="turn-rail-mini"
          aria-label="展开出牌顺序"
          aria-expanded={false}
          title="展开出牌顺序"
        >
          <span className="turn-rail-mini-idx">{Math.max(1, players.findIndex(p => p.id === turnIndex) + 1)}</span>
          {current && <img className="turn-rail-mini-avatar" src={current.hero.avatarUrl} alt="" />}
          <span className="turn-rail-mini-hint">顺序</span>
        </button>
      ) : (
        <>
          <div className="turn-rail-head">
            <span>出牌顺序</span>
            <button
              type="button"
              onClick={() => onCollapsedChange(true)}
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
  );
};

/** 出牌顺序：手机顶部横条 */
export const TurnStrip: React.FC<{
  players: Player[];
  turnIndex: number;
  collapsed: boolean;
  hidden: boolean;
  onCollapsedChange: (v: boolean) => void;
}> = ({ players, turnIndex, collapsed, hidden, onCollapsedChange }) => {
  const current = players.find(p => p.id === turnIndex);
  return (
    <div data-region="turn-strip" data-collapsed={collapsed ? 'true' : 'false'} className={`${hidden ? 'hidden' : 'md:hidden flex'} items-center gap-1`}>
      {collapsed ? (
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className={`turn-strip-mini ${KINGDOM_CLASS[current?.hero.kingdom ?? ''] || 'kingdom-qun'}`}
          aria-label="展开出牌顺序"
          aria-expanded={false}
          title="展开出牌顺序"
        >
          <span className="turn-strip-mini-tag">顺序</span>
          <span className="turn-strip-mini-name">{current?.hero.name ?? '—'}</span>
          <span className="turn-strip-mini-arrow" aria-hidden="true">▾</span>
        </button>
      ) : (
        <>
          {players.map(p => (
            <span key={p.id} className={`turn-chip ${KINGDOM_CLASS[p.hero.kingdom] || 'kingdom-qun'}`} data-active={turnIndex === p.id ? 'true' : 'false'}>
              {p.hero.name}
            </span>
          ))}
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="turn-strip-fold"
            aria-label="收起出牌顺序"
            aria-expanded={true}
            title="收起出牌顺序"
          >▴</button>
        </>
      )}
    </div>
  );
};

/** 左上身份目标条：主×1 忠×1 反×2 内×1 + 个人目标 */
export const ObjectiveStrip: React.FC<{ players: Player[]; me: Player; hidden: boolean }> = ({ players, me, hidden }) => {
  const chips: [Identity, string][] = [
    [Identity.ZHUGONG, '主'],
    [Identity.ZHONGCHEN, '忠'],
    [Identity.FANZEI, '反'],
    [Identity.NEIJIAN, '内'],
  ];
  return (
    <div className={`objective-strip absolute top-2 left-[150px] z-[225] items-center gap-2 ${hidden ? 'hidden' : 'hidden md:flex'}`}>
      <span className="objective-seats">
        {chips.map(([id, short]) => {
          const n = players.filter(p => p.identity === id).length;
          return n > 0 ? <span key={id} className={`objective-chip is-${id}`}>{short}×{n}</span> : null;
        })}
      </span>
      <span className="objective-goal">
        {me.identity === Identity.ZHUGONG ? '目标：剿灭反贼与内奸' :
          me.identity === Identity.ZHONGCHEN ? '目标：护主，清除反贼' :
          me.identity === Identity.FANZEI ? '目标：击杀主公' :
          '目标：先清场，再与主公单挑'}
      </span>
    </div>
  );
};

/** 手机端紧凑阶段指示 + 读秒 */
export const MobilePhaseChip: React.FC<{
  theme: 'dark' | 'light';
  phase: GamePhase;
  decisionLeft: number | null;
  decisionSeconds: number;
  hidden: boolean;
}> = ({ theme, phase, decisionLeft, decisionSeconds, hidden }) => (
  <div className={`${hidden ? 'hidden' : 'md:hidden'} absolute top-2 left-[156px] z-[230]`}>
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
            style={{ width: `${Math.max(0, Math.min(100, (decisionLeft / decisionSeconds) * 100))}%` }}
          />
        </span>
      )}
    </div>
  </div>
);
