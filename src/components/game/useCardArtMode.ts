import { useCallback, useEffect, useState } from 'react';

/**
 * 选将页的画面模式：立绘（裁切脸/半身）或官方完整卡面。
 *
 * 立绘信息密度低、脸大，适合快速扫视；卡面自带势力色、勾玉与技能文本，
 * 更接近实体牌，但字小。两种都有用，所以做成可切换而不是二选一，
 * 选择记在 localStorage 里，下次进来保持上次的偏好。
 */
export type CardArtMode = 'portrait' | 'card';

export const CARD_ART_MODE_KEY = 'sgs-card-art-mode';

const readMode = (): CardArtMode => {
  try {
    return localStorage.getItem(CARD_ART_MODE_KEY) === 'card' ? 'card' : 'portrait';
  } catch {
    // 隐私模式下 localStorage 不可用
    return 'portrait';
  }
};

const writeMode = (mode: CardArtMode): void => {
  try {
    localStorage.setItem(CARD_ART_MODE_KEY, mode);
  } catch {
    /* 忽略写入失败 */
  }
};

export const useCardArtMode = (): { mode: CardArtMode; setMode: (m: CardArtMode) => void } => {
  const [mode, setModeState] = useState<CardArtMode>(readMode);

  const setMode = useCallback((next: CardArtMode) => {
    setModeState(next);
    writeMode(next);
  }, []);

  /** 多标签页同步：另一个标签页改了偏好，这边跟着变 */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CARD_ART_MODE_KEY) setModeState(readMode());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { mode, setMode };
};
