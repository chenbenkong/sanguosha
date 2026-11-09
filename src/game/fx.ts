/**
 * 特效档位（从 App.tsx 的模块级常量原样搬出，纯数据，无行为）。
 *
 * 搬到独立模块的原因：对局外壳已拆到 src/screens/BattleScreen.tsx，
 * 与 App.tsx 的首页/选将分支共用这张表，不能各存一份。
 * 文案、顺序、类型均未改动。
 */

/** 特效强度：经典（全无）/ 纯净（干净卡面 + 翻牌 + 濒死）/ 克制（+ 技能特写）/ 完整（+ 出牌飞行、扫光） */
export type FxLevel = 'classic' | 'pure' | 'subtle' | 'full';

export const FX_LABEL: Record<FxLevel, string> = {
  classic: '特效·经典', pure: '特效·纯净', subtle: '特效·克制', full: '特效·完整',
};

export const FX_TAG: Record<FxLevel, string> = { classic: '典', pure: '净', subtle: '克', full: '全' };

export const FX_ORDER: FxLevel[] = ['classic', 'pure', 'subtle', 'full'];
