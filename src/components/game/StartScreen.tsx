import React from 'react';
import { BackgroundCarousel } from '../BackgroundCarousel';
import { BACKGROUND_IMAGES, CAROUSEL_CONFIG } from '../../config/backgrounds';
import RulesDialog from '../RulesDialog';
import { IconSpeaker, IconMotion, IconDice, IconBook, ThemeIcon } from '../Icons';
import { APP_VERSION } from '../../game/constants';
import type { GameSave } from '../../game/save';

export type AiDifficulty = 'easy' | 'normal' | 'hard';

/** 首页：标题 / 出征面板 / 战绩 / 版本 / 说明与教学入口 */
export const StartScreen: React.FC<{
  theme: 'dark' | 'light';
  layoutDensity: string;
  sizeTier: string;
  motionOn: boolean;
  fxLevel: string;
  fxLabel: string;
  fxTag: string;
  scaleStyle: React.CSSProperties;
  playerCount: 5 | 7;
  onPlayerCount: (n: 5 | 7) => void;
  aiDifficulty: AiDifficulty;
  onAiDifficulty: (d: AiDifficulty) => void;
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
}> = ({
  theme, layoutDensity, sizeTier, motionOn, fxLevel, fxLabel, fxTag, scaleStyle,
  playerCount, onPlayerCount, aiDifficulty, onAiDifficulty, savedGame, onResume,
  onEnterSelect, onTutorial, onShowRules, onCloseRules, showRules, stats, homeNotice,
  isMuted, onToggleMute, onToggleMotion, onCycleFx, onToggleTheme,
}) => (
  <div
    data-density={layoutDensity}
    data-size-tier={sizeTier}
    data-motion={motionOn ? 'on' : 'off'}
    data-fx={fxLevel}
    className={`h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden ${theme === 'light' ? 'parchment-bg' : ''}`}
    style={scaleStyle}
  >
    <BackgroundCarousel images={BACKGROUND_IMAGES} interval={CAROUSEL_CONFIG.interval} />

    {theme === 'dark' ? (
      <>
        {/* 静态暖光 + 极淡祥云暗纹：去掉 blur + animate 光斑，首页不再持续合成 */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 58% 44% at 50% 34%, rgba(200,164,92,0.13) 0%, rgba(0,0,0,0) 70%)'
        }}></div>
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        <div className="absolute inset-8 border border-amber-800/20 rounded-lg pointer-events-none"></div>
        <div className="absolute inset-10 border border-amber-700/10 rounded-lg pointer-events-none"></div>
        <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-amber-700/40 rounded-tl-lg"></div>
        <div className="absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-amber-700/40 rounded-tr-lg"></div>
        <div className="absolute bottom-6 left-6 w-16 h-16 border-b-2 border-l-2 border-amber-700/40 rounded-bl-lg"></div>
        <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-amber-700/40 rounded-br-lg"></div>
      </>
    ) : (
      <>
        <div className="absolute inset-8 border border-[#e5e0db]/50 rounded-lg pointer-events-none"></div>
        <div className="absolute inset-10 border border-[#d4cfc9]/30 rounded-lg pointer-events-none"></div>
        <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-[#c4a77d]/40 rounded-tl-lg"></div>
        <div className="absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-[#c4a77d]/40 rounded-tr-lg"></div>
        <div className="absolute bottom-6 left-6 w-16 h-16 border-b-2 border-l-2 border-[#c4a77d]/40 rounded-bl-lg"></div>
        <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-[#c4a77d]/40 rounded-br-lg"></div>
      </>
    )}

    <div className="absolute top-5 right-5 z-50 flex items-center gap-2">
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

    <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-center px-5 py-16">
      <div className="relative text-center">
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
            <button className="ui-tile" aria-pressed={playerCount === 5} onClick={() => onPlayerCount(5)}>五人局</button>
            <button className="ui-tile" aria-pressed={playerCount === 7} onClick={() => onPlayerCount(7)}>七人局</button>
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
                  onClick={() => onAiDifficulty(item.key)}
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
          <button onClick={onEnterSelect} className="ui-cta">点兵出征</button>

          {savedGame && (() => {
            const myHeroName = savedGame.players.find(p => p.isHuman)?.hero.name ?? '';
            const d = new Date(savedGame.ts);
            const pad = (n: number) => String(n).padStart(2, '0');
            const savedAt = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            return (
              <button
                onClick={onResume}
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
              onClick={onTutorial}
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
              onClick={onShowRules}
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

    <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 footer-line">
      <span>三国杀 · {playerCount}人军争篇</span>
      <span className="sep">◆</span>
      <span>{APP_VERSION}</span>
    </div>

    {showRules && <RulesDialog onClose={onCloseRules} onStartTutorial={onTutorial} />}
  </div>
);
