import React from 'react';
import { IconBolt, IconEye, IconMotion, IconSpeaker, ThemeIcon } from '../Icons';

export type UiRegion = 'controls' | 'objective' | 'phase' | 'log' | 'order';
export const UI_REGION_ITEMS: { key: UiRegion; label: string }[] = [
  { key: 'controls', label: '设置栏' },
  { key: 'objective', label: '身份目标' },
  { key: 'phase', label: '阶段指示' },
  { key: 'log', label: '战报' },
  { key: 'order', label: '出牌顺序' },
];
export type BgmPref = 'auto' | 'home' | 'battle';
export const BGM_PREF_LABEL: Record<BgmPref, string> = { auto: '随人数', home: '首页曲', battle: '战场曲' };

/** 右上角「界面」菜单：显隐开关 / 速度 / 对局音乐 */
export const UiDisplayMenu: React.FC<{
  theme: 'dark' | 'light';
  uiHidden: Record<UiRegion, boolean>;
  speedLevel: 1 | 2 | 3;
  bgmPref: BgmPref;
  onToggleRegion: (key: UiRegion) => void;
  onSetSpeed: (v: 1 | 2 | 3) => void;
  onChooseBgm: (v: BgmPref) => void;
  onClose: () => void;
}> = ({ theme, uiHidden, speedLevel, bgmPref, onToggleRegion, onSetSpeed, onChooseBgm, onClose }) => (
  <>
    <div className="fixed inset-0 z-[380]" onClick={onClose} aria-hidden="true" />
    <div
      role="dialog"
      aria-label="界面显示设置"
      className="fixed right-3 top-14 z-[390] w-48 rounded-lg border p-2 ui-panel"
    >
      <div className="text-[var(--fs-11)] tracking-[0.25em] opacity-70 px-1 pb-1">界面显示</div>
      {UI_REGION_ITEMS.map(item => {
        const shown = !uiHidden[item.key];
        return (
          <button
            key={item.key}
            type="button"
            role="switch"
            aria-checked={shown}
            onClick={() => onToggleRegion(item.key)}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[var(--fs-12)] hover:bg-[rgba(var(--gold-rgb)/0.10)]"
          >
            <span>{item.label}</span>
            <span className={`text-[var(--fs-11)] px-1.5 py-0.5 rounded border ${shown ? 'border-[var(--line-strong)] text-[var(--gold)]' : 'border-current opacity-50'}`}>
              {shown ? '显示' : '隐藏'}
            </span>
          </button>
        );
      })}
      <div className="h-px my-1.5 bg-[var(--line-soft)]" />
      <div className="text-[var(--fs-11)] tracking-[0.25em] opacity-70 px-1 pb-1">游戏速度</div>
      <div className="flex gap-1 px-1 pb-1">
        {([1, 2, 3] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onSetSpeed(v)}
            aria-pressed={speedLevel === v}
            className={`flex-1 px-1 py-1 rounded text-[var(--fs-11)] border tabular-nums ${speedLevel === v ? 'border-[var(--line-strong)] text-[var(--gold)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
          >
            ×{v}
          </button>
        ))}
      </div>
      <div className="h-px my-1.5 bg-[var(--line-soft)]" />
      <div className="text-[var(--fs-11)] tracking-[0.25em] opacity-70 px-1 pb-1">对局音乐</div>
      <div className="flex gap-1 px-1">
        {(['auto', 'home', 'battle'] as BgmPref[]).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChooseBgm(v)}
            aria-pressed={bgmPref === v}
            className={`flex-1 px-1 py-1 rounded text-[var(--fs-11)] border ${bgmPref === v ? 'border-[var(--line-strong)] text-[var(--gold)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
          >
            {BGM_PREF_LABEL[v]}
          </button>
        ))}
      </div>
    </div>
  </>
);

/** 右上角控制组：帮助 / 速度 / 主题 / 动效 / 特效 / 静音 / 界面显隐 */
export const GameTopBar: React.FC<{
  theme: 'dark' | 'light';
  controlsHidden: boolean;
  anyRegionHidden: boolean;
  isMuted: boolean;
  motionOn: boolean;
  speedLevel: 1 | 2 | 3;
  fxLabel: string;
  fxTag: string;
  uiMenuOpen: boolean;
  onShowRules: () => void;
  onCycleSpeed: () => void;
  onToggleTheme: () => void;
  onToggleMute: () => void;
  onToggleMotion: () => void;
  onCycleFx: () => void;
  onToggleUiMenu: () => void;
}> = ({
  theme, controlsHidden, anyRegionHidden, isMuted, motionOn, speedLevel, fxLabel, fxTag, uiMenuOpen,
  onShowRules, onCycleSpeed, onToggleTheme, onToggleMute, onToggleMotion, onCycleFx, onToggleUiMenu,
}) => (
  <div data-region="top-controls" className="absolute top-2 right-3 z-50 flex items-center gap-2">
    {!controlsHidden && (
      <>
        <button
          onClick={onShowRules}
          className="ui-icon-btn font-bold"
          title="玩法说明与新手教学"
          aria-label="玩法说明与新手教学"
        >
          <span className="text-base leading-none">?</span>
        </button>
        <button
          onClick={onCycleSpeed}
          className="ui-icon-btn game-settings-hide font-bold text-sm tracking-wider"
          title="切换游戏速度"
          aria-label={`切换游戏速度，当前 ${speedLevel} 倍`}
        >
          <IconBolt />
          <span className="tabular-nums">×{speedLevel}</span>
        </button>
        <button
          onClick={onToggleTheme}
          className="ui-icon-btn game-settings-hide"
          title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
          aria-label={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
        >
          <ThemeIcon theme={theme} />
        </button>
        <button
          onClick={onToggleMotion}
          className="ui-icon-btn game-settings-hide"
          title={motionOn ? '关闭动效' : '开启动效'}
          aria-label={motionOn ? '关闭动效' : '开启动效'}
        >
          <IconMotion off={!motionOn} />
        </button>
        <button
          onClick={onCycleFx}
          className="ui-icon-btn game-settings-hide flex-col !gap-0.5"
          title={`${fxLabel}（点击切换）`}
          aria-label={`特效强度：${fxLabel}，点击切换`}
        >
          <span className="text-[var(--fs-12)] leading-none font-bold">特效</span>
          <span className="text-[var(--fs-11)] leading-none opacity-75">{fxTag}</span>
        </button>
      </>
    )}
    {/* 静音始终可见：收起设置栏后仍能随时开关声音 */}
    <button
      onClick={onToggleMute}
      className="ui-icon-btn"
      title={isMuted ? '开启音乐' : '静音'}
      aria-label={isMuted ? '开启音乐' : '静音'}
    >
      <IconSpeaker muted={isMuted} />
    </button>
    <button
      type="button"
      onClick={onToggleUiMenu}
      className="ui-icon-btn"
      title="界面显示设置"
      aria-label="界面显示设置"
      aria-expanded={uiMenuOpen}
      aria-haspopup="dialog"
    >
      <IconEye off={anyRegionHidden} />
    </button>
  </div>
);
