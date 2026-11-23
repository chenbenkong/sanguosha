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

/**
 * 校验一份（来自 localStorage **或**外部文件的）存档。
 * 抽成纯函数是为了让「导入存档」与「继续上一局」走**完全相同**的校验，
 * 避免两份逻辑漂移后导入一个畸形存档把游戏搞崩。
 *
 * @returns 合法存档；已结束或被篡改则返回 null。isFinished 由调用方决定怎么处理
 *          （localStorage 要清掉并提示，导入文件只需告诉用户「这局已经结束了」）。
 */
export const validateSave = (raw: string | null | undefined): GameSave | null => {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameSave;
    if (s?.v !== SAVE_VERSION) return null;
    if (!Array.isArray(s.players) || s.players.length < 5) return null;
    if (!s.players.some(p => p?.isHuman) || !Array.isArray(s.deck)) return null;
    if (typeof s.turnIndex !== 'number' || s.turnIndex < 0 || s.turnIndex >= s.players.length) return null;
    return s;
  } catch {
    return null;
  }
};

export const readSave = (): GameSave | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = validateSave(raw);
    if (!s) return null;
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
    const json = JSON.stringify(s);
    localStorage.setItem(SAVE_KEY, json);
    // 原生外壳（APK）里同步备份一份到 SharedPreferences。
    // 网页版 / e2e 里 SGSNativeSave 不存在，这段是 no-op —— 不影响任何既有行为。
    try {
      const bridge = (globalThis as unknown as {
        SGSNativeSave?: { backupSave?: (json: string) => void };
      }).SGSNativeSave;
      bridge?.backupSave?.(json);
    } catch { /* 桥接不可用时静默降级，存档已写进 localStorage */ }
    return true;
  } catch {
    return false;
  }
};

export const clearSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
};

// ── 存档导入 / 导出 ────────────────────────────────────────────────────────────
// 用户反馈的核心风险：存档在 localStorage 里，APK 的 WebView 数据一清就没了，
// 换机更没法带走。单机游戏最该有的「可备份 / 可迁移」此前完全没有。
// 导出成 JSON 文件后，任何平台（网页 / APK）都能导入，彻底摆脱本地存储绑定。

/** 把存档序列化为可下载的文本（带缩进，方便人眼看和 diff） */
export const serializeSave = (s: GameSave): string => JSON.stringify(s, null, 2);

/**
 * 从外部文本导入存档并**写入** localStorage。
 *
 * 与 readSave 的区别：
 *   · readSave 只读现有槽，且会清掉「已结束」的局；
 *   · 这里要主动覆盖当前槽，并把结果回报给调用方（成功 / 无效 / 已结束），
 *     让 UI 能给出准确提示，而不是静默失败。
 */
export type ImportSaveResult = 'ok' | 'invalid' | 'finished' | 'storage-error';
export const importSave = (text: string): ImportSaveResult => {
  const s = validateSave(text);
  if (!s) return 'invalid';
  if (isSaveFinished(s)) return 'finished';
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return 'ok';
  } catch {
    return 'storage-error';
  }
};

/** 导出文件名带日期，避免多次导出互相覆盖；时间用本地时区 */
export const saveFileName = (s: GameSave): string => {
  const d = new Date(s.ts || Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  return `sanguosha-save-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
};
