import React from 'react';
import { Identity, LogEntry, Player } from '../../types';
import { BackgroundCarousel } from '../components/BackgroundCarousel';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from '../config/backgrounds';
import { IconSpeaker } from '../components/Icons';
import { WINNER_LABEL, WinnerSide } from '../game/constants';
import { useLayoutProfile } from '../hooks/useLayoutProfile';

interface GameOverScreenProps {
  players: Player[];
  winnerSide: WinnerSide | null;
  deckCount: number;
  discardCount: number;
  logs: LogEntry[];
  stats: { games: number; wins: number; losses: number } | null;
  /** 本局用时（毫秒），首页续局等场景可能为 0，此时不显示 */
  durationMs?: number;
  theme: 'dark' | 'light';
  isMuted: boolean;
  toggleMute: () => void;
  motionOn: boolean;
  onRestart: () => void;
  onHome: () => void;
}

/**
 * 结算页
 * 除了胜负与身份，还给出存活人数、累计战绩与本局关键战报，
 * 让玩家在结算时有「这局发生了什么」的回顾，而不是只有一个结果横幅。
 */
export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  players, winnerSide, deckCount, discardCount, logs, stats, durationMs,
  theme, isMuted, toggleMute, motionOn, onRestart, onHome,
}) => {
  const myIdentity = players.find(p => p.isHuman)?.identity;
  const isVictory = winnerSide !== null && myIdentity !== undefined && (
    (winnerSide === 'rebel' && myIdentity === Identity.FANZEI) ||
    (winnerSide === 'lord' && (myIdentity === Identity.ZHUGONG || myIdentity === Identity.ZHONGCHEN)) ||
    (winnerSide === 'spy' && myIdentity === Identity.NEIJIAN)
  );
  const aliveCount = players.filter(p => !p.isDead).length;
  // 关键战报：只取技能发动 / 阵亡 / 关键判定这类节点，避免把流水账全搬上来
  const keyLogs = logs.filter(l => l.type === 'danger' || l.type === 'skill' || l.type === 'success').slice(-5);
  const durationText = durationMs && durationMs > 0
    ? `${Math.floor(durationMs / 60000)} 分 ${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')} 秒`
    : null;
  // 结算页也按可视高度收敛标题：860 高的笔记本上要保证「身份全员 + 战报 + 按钮」一屏可见
  const { layoutDensity } = useLayoutProfile();
  const compact = layoutDensity === 'compact' || layoutDensity === 'tight' || layoutDensity === 'ultra';
  const titleClass = layoutDensity === 'ultra'
    ? 'text-3xl md:text-4xl'
    : compact ? 'text-4xl md:text-5xl' : 'text-6xl md:text-8xl';

  return (
    <div data-density={layoutDensity} data-motion={motionOn ? 'on' : 'off'} className={`min-h-screen w-full flex flex-col items-center justify-center text-center p-4 pb-28 relative overflow-y-auto ${theme === 'light' ? 'parchment-bg' : 'bg-black'}`}>
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
          className="ui-icon-btn"
          title={isMuted ? '开启音乐' : '静音'}
          aria-label={isMuted ? '开启音乐' : '静音'}
        >
          <IconSpeaker muted={isMuted} />
        </button>
      </div>

      <div className={`absolute top-1/3 left-1/4 w-96 h-96 rounded-full blur-[120px] ${theme === 'dark' ? 'bg-red-900/10' : 'bg-red-500/5'}`}></div>
      <div className={`absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full blur-[120px] ${theme === 'dark' ? 'bg-yellow-900/10' : 'bg-amber-500/5'}`}></div>

      {/* 胜负判定横幅 */}
      <div className={`z-20 mb-4 px-8 py-2.5 rounded-lg border-2 font-ancient ${compact ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'} tracking-[0.3em] shadow-[0_10px_40px_rgba(0,0,0,0.5)] animate-fade-in-scale ${
        isVictory
          ? 'bg-gradient-to-b from-[#c9a227] to-[#9a7a1a] text-[#fff8e0] border-[#f4d03f] shadow-[0_0_40px_rgba(212,175,55,0.4)]'
          : 'bg-gradient-to-b from-stone-700 to-stone-900 text-stone-300 border-stone-500'
      }`}>
        {isVictory ? '大 获 全 胜' : '败 走 麦 城'}
      </div>

      <h1 className={`font-ancient ${titleClass} mb-3 z-10 drop-shadow-2xl relative ${theme === 'light' ? 'text-[#8b6914]' : 'text-[#d9b85c]'}`}>
        游戏结束
        <span className="absolute -inset-4 bg-yellow-600/10 blur-xl rounded-lg"></span>
      </h1>
      <h2 className={`text-2xl md:text-4xl font-ancient mb-4 z-10 border-b pb-3 ${theme === 'dark' ? 'text-stone-200 border-[#8b7355]/50' : 'text-[#2d2a26] border-[#c4a77d]'}`}>
        获胜方：<span className={theme === 'dark' ? 'text-[#e0705f]' : 'text-[#9e2b25]'}>{winnerSide ? WINNER_LABEL[winnerSide] : ''}</span>
      </h2>

      {/* 面板高度跟随视口收缩：矮屏（如 1600×860 / 1366×620）在面板内部滚动，
          保证底部「再来一局 / 返回主页」永远不被内容压住 */}
      <div className="z-10 modal-shell rounded-xl p-4 md:p-5 mb-3 max-w-3xl w-full max-h-[calc(100dvh-355px)] min-h-[160px] overflow-y-auto scrollbar-thin">
        <h3 className="modal-title text-2xl font-ancient mb-1 text-center">玩家身份</h3>
        <div className="modal-divider mb-3" />
        <div className="flex flex-wrap justify-center gap-2.5">
          {players.map((player, idx) => (
            <div
              key={player.id}
              className={`reveal-card flex flex-col items-center p-2.5 rounded-xl border transition-all duration-300 w-[86px]
                ${player.isDead
                  ? 'bg-black/45 border-[#9e2b25]/60 opacity-70 grayscale'
                  : 'bg-black/25 border-[#8b7355]/35 hover:border-[#c8a45c]/70 hover:bg-black/35'
                }
              `}
              style={{ animationDelay: `${idx * 90}ms` }}
            >
              <img src={player.hero.avatarUrl} alt={player.hero.name} loading="lazy" decoding="async" className={`w-[52px] h-[78px] rounded-md mb-2 border-2 object-cover object-top ${player.isDead ? 'border-[#9e2b25]/60 grayscale' : 'border-[#c8a45c]/55'}`} />
              <div className="text-base modal-text font-bold mb-1">
                {player.hero.name}
              </div>
              <div className={`text-sm font-ancient px-2.5 py-0.5 rounded-full
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
              <div className={`text-xs mt-1.5 ${player.isDead ? 'text-red-500' : 'text-green-500'}`}>
                {player.isDead ? '阵亡' : '存活'}
              </div>
            </div>
          ))}
        </div>

        {/* 对局摘要：存活人数 / 累计战绩 */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
          <span className="modal-text-dim">
            存活 <b className="font-ancient text-[#e8cf94] text-base">{aliveCount}</b>
            <span className="text-[#8f806a]"> / {players.length} 人</span>
          </span>
          {durationText && (
            <span className="modal-text-dim">
              用时 <b className="font-ancient text-[#e8cf94] text-base">{durationText}</b>
            </span>
          )}
          {stats && (
            <span className="modal-text-dim">
              第 <b className="font-ancient text-[#e8cf94] text-base">{stats.games}</b> 局
              <span className="text-[#8f806a]"> · 胜 </span>
              <b className="text-[#9fcfae]">{stats.wins}</b>
              <span className="text-[#8f806a]"> 负 </span>
              <b className="text-[#e0a49c]">{stats.losses}</b>
            </span>
          )}
        </div>

        {/* 结算收尾：牌堆与弃牌堆余量，用牌背小方块延续牌堆视觉 */}
        <div className="mt-4 pt-4 border-t border-[#8b7355]/30 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm">
          <span className="flex items-center gap-2">
            <span
              className="w-4 h-6 rounded-[2px] border border-[#8b7355]/60 shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
              style={{ background: 'linear-gradient(155deg,#2b2320 0%,#221b18 55%,#151110 100%)' }}
            />
            <span className="modal-text-dim">牌堆剩余 <b className="font-ancient text-[#e8cf94] text-base">{deckCount}</b> 张</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-6 rounded-[2px] border border-[#6a5642]/60 bg-[#221b16] shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
            <span className="modal-text-dim">弃牌堆 <b className="font-ancient text-[#e8cf94] text-base">{discardCount}</b> 张</span>
          </span>
        </div>

        {/* 关键战报：技能发动 / 阵亡 / 关键判定 */}
        {keyLogs.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#8b7355]/30 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="font-ancient text-[#e8cf94] tracking-[0.12em]">本局战报</span>
              <span className="text-[11px] text-[#8f806a]">最近 {keyLogs.length} 条关键事件</span>
            </div>
            <ul className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin pr-1">
              {keyLogs.map((l) => (
                <li key={l.id} className="flex items-start gap-2 text-[12px] leading-relaxed">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    l.type === 'danger' ? 'bg-[#c86b62]' : l.type === 'skill' ? 'bg-[#c8a45c]' : 'bg-[#9fcfae]'
                  }`} />
                  <span className="modal-text-dim">{l.text}</span>
                </li>
              ))}
            </ul>          </div>
        )}
      </div>

      <div className={`fixed inset-x-0 bottom-0 z-30 w-full flex flex-wrap justify-center gap-3 px-4 py-4 bg-gradient-to-t ${theme === 'dark' ? 'from-black/90 via-black/70 to-transparent' : 'from-[#f5f0eb]/95 via-[#f5f0eb]/80 to-transparent'}`}>
        <button
          onClick={onRestart}
          className="btn-gold z-10 px-8 py-3 min-h-[48px] font-ancient text-xl md:text-2xl rounded-lg"
        >
          再来一局
        </button>
        <button
          onClick={onHome}
          className="btn-ink z-10 px-8 py-3 min-h-[48px] font-ancient text-xl md:text-2xl rounded-lg"
        >
          返回主页
        </button>
      </div>
    </div>
  );
};

export default GameOverScreen;
