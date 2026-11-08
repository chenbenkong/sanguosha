import React from 'react';

// ===== 界面图标：内联 SVG，避免各屏使用风格不一的 emoji =====

export const IconSpeaker: React.FC<{ muted?: boolean }> = ({ muted }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    {muted
      ? <><path d="M16.5 9.5l4.5 5" /><path d="M21 9.5l-4.5 5" /></>
      : <><path d="M15.5 8.6a5.2 5.2 0 0 1 0 6.8" /><path d="M18.5 6a9 9 0 0 1 0 12" /></>}
  </svg>
);

export const IconSun: React.FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17L5.4 18.6" />
  </svg>
);

export const IconMoon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6 8.6 8.6 0 1 0 20.4 14.2z" />
  </svg>
);

export const IconBolt: React.FC = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.5 2.5L5 14h6.2L10 21.5 19 10h-6.2z" />
  </svg>
);

export const IconBook: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 4.5h9a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5h-9.5z" />
    <path d="M19 19.5a2.5 2.5 0 0 0-2.5-2.5H4.5V4.5" />
  </svg>
);

export const IconDice: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <circle cx="8.4" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="8.4" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

/** 动效开关图标：三道风线；关闭时加斜杠 */
export const IconMotion: React.FC<{ off?: boolean }> = ({ off }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M4 8h9.5a2.5 2.5 0 1 0-2.4-3.2" />
    <path d="M4 12.5h13.5a2.5 2.5 0 1 1-2.4 3.2" />
    <path d="M4 17h6.5" />
    {off && <path d="M3 21L21 3" strokeWidth="2" />}
  </svg>
);

/** 界面显隐：眼睛图标；关闭时加斜杠 */
export const IconEye: React.FC<{ off?: boolean }> = ({ off }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.6 12s3.4-6 9.4-6 9.4 6 9.4 6-3.4 6-9.4 6-9.4-6-9.4-6z" />
    <circle cx="12" cy="12" r="2.7" />
    {off && <path d="M3 21L21 3" strokeWidth="2" />}
  </svg>
);

export const IconArrowLeft: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const ThemeIcon: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => theme === 'dark' ? <IconSun /> : <IconMoon />;
