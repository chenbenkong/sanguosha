import { Player, Card, LogEntry, Identity } from '../../types';

/**
 * 对局存档
 * 只在「回合开始」这类安全节点落盘：恢复时从该回合开头重放，
 * 不会重复摸牌、重复发动回合开始技能。
 */
export const SAVE_KEY = 'sgs-save-v1';
export const SAVE_VERSION = 1;

let saveRejected = false;

export interface GameSave {
  v: number;
  ts: number;
  playerCount: 5 | 7;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  turnIndex: number;
  logs: LogEntry[];
}

/**
 * 存档是否已经是「已结束」状态：人类阵亡、主公阵亡、或反贼清空且内奸阵亡
 * 这类存档不应该再出现在首页「继续上一局」，否则会进入一局无人可控的 AI 自走棋
 */
export const isSaveFinished = (s: GameSave): boolean => {
  const human = s.players.find(p => p?.isHuman);
  if (!human || human.isDead) return true;
  const lord = s.players.find(p => p.identity === Identity.ZHUGONG);
  if (!lord || lord.isDead) return true;
  const aliveRebels = s.players.filter(p => p.identity === Identity.FANZEI && !p.isDead);
  const spy = s.players.find(p => p.identity === Identity.NEIJIAN);
  if (aliveRebels.length === 0 && (!spy || spy.isDead)) return true;
  return false;
};

export const readSave = (): GameSave | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameSave;
    if (s?.v !== SAVE_VERSION) return null;
    if (!Array.isArray(s.players) || s.players.length < 5) return null;
    if (!s.players.some(p => p?.isHuman) || !Array.isArray(s.deck)) return null;
    if (typeof s.turnIndex !== 'number' || s.turnIndex < 0 || s.turnIndex >= s.players.length) return null;
    // 已结束的局直接清掉，避免结算后仍能续上一局
    if (isSaveFinished(s)) {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      saveRejected = true;
      return null;
    }
    return s;
  } catch {
    return null;
  }
};

/** 供首页提示「上一局已结束」：只消费一次 */
export const consumeSaveRejected = () => {
  const v = saveRejected;
  saveRejected = false;
  return v;
};

export const writeSave = (s: GameSave): boolean => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
};

export const clearSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};
