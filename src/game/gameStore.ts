import { useSyncExternalStore } from 'react';
import { Card, GamePhase, Player } from '../../types';
import { WinnerSide } from './constants';

/**
 * 对局核心状态的唯一入口。
 *
 * 背景：App.tsx 里 players / deck / discardPile / turnIndex / phase / winnerSide
 * 原先各自是一个 useState，写入点分散（setPlayers 17 处、setPhase 24 处…），
 * 且需要 playersRef 之类的镜像手动保持同步。
 *
 * 现在统一收敛到本 store：
 * - 读：useGameState() 订阅快照；同步逻辑用 getGameState()
 * - 写：只允许通过导出的 setter / patchGame 写入
 * - 通知：同一微任务内的多次写入合并成一次订阅通知，避免连环 setState 引起的重复渲染
 *
 * 约定：写入必须是「新值或 updater」，不允许在外部直接改 state 里的对象。
 * logs 暂不纳入：它已有唯一写入口 addLog（内部包了 startTransition 降优先级）。
 */

export interface GameState {
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  turnIndex: number;
  phase: GamePhase;
  winnerSide: WinnerSide | null;
}

export type GameSetter<T> = (value: T | ((prev: T) => T)) => void;

let state: GameState = {
  players: [],
  deck: [],
  discardPile: [],
  turnIndex: 0,
  phase: GamePhase.START,
  winnerSide: null,
};

const listeners = new Set<() => void>();
let flushScheduled = false;

const flush = () => {
  flushScheduled = false;
  listeners.forEach(listener => listener());
};

export function getGameState(): GameState {
  return state;
}

export function subscribeGame(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 一次性写入多个字段（读档/开局），只触发一次通知 */
export function patchGame(patch: Partial<GameState>): void {
  let changed = false;
  (Object.keys(patch) as Array<keyof GameState>).forEach(key => {
    if (!Object.is(state[key], patch[key])) changed = true;
  });
  if (!changed) return;
  state = { ...state, ...patch };
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

function makeSetter<K extends keyof GameState>(key: K): GameSetter<GameState[K]> {
  return value => {
    const next = typeof value === 'function'
      ? (value as (prev: GameState[K]) => GameState[K])(state[key])
      : value;
    patchGame({ [key]: next } as Partial<GameState>);
  };
}

export const setPlayers: GameSetter<Player[]> = makeSetter('players');
export const setDeck: GameSetter<Card[]> = makeSetter('deck');
export const setDiscardPile: GameSetter<Card[]> = makeSetter('discardPile');
export const setTurnIndex: GameSetter<number> = makeSetter('turnIndex');
export const setPhase: GameSetter<GamePhase> = makeSetter('phase');
export const setWinnerSide: GameSetter<WinnerSide | null> = makeSetter('winnerSide');

/** 订阅对局核心状态；返回的整个快照在一次通知内不变 */
export function useGameState(): GameState {
  return useSyncExternalStore(subscribeGame, getGameState, getGameState);
}
