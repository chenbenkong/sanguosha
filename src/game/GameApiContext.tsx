import React from 'react';
import type { GameApi } from './gameApi';

const GameApiCtx = React.createContext<GameApi | null>(null);

/**
 * 对局接线层：把 App 里的状态/技能模式/结算函数一次性提供给对局内的组件，
 * 组件用它替代逐个 props 透传（操作栏此前有 110 个 props）。
 */
export const GameApiProvider: React.FC<{ value: GameApi; children?: React.ReactNode }> = ({ value, children }) => (
  <GameApiCtx.Provider value={value}>{children}</GameApiCtx.Provider>
);

export function useGameApi(): GameApi {
  const api = React.useContext(GameApiCtx);
  if (!api) throw new Error('useGameApi 必须在 GameApiProvider 内使用');
  return api;
}
