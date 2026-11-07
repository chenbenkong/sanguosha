// 胜利阵营：以阵营枚举为唯一判定依据，显示文案单独映射
// （此前直接用 '反贼 (起义军)' 字符串与 Identity.FANZEI='反贼' 全等比较，永远不成立）
export type WinnerSide = 'lord' | 'rebel' | 'spy';

export const WINNER_LABEL: Record<WinnerSide, string> = {
  lord: '主公 & 忠臣 (朝廷)',
  rebel: '反贼 (起义军)',
  spy: '内奸 (野心家)',
};

// 版本号统一维护：首页页脚、README 与发布记录都以此为准
export const APP_VERSION = 'v3.34';

// 势力色：魏蓝 / 蜀红 / 吴绿 / 群金（对应 theme.css 中的 --k-main）
export const KINGDOM_CLASS: Record<string, string> = {
  魏: 'kingdom-wei',
  蜀: 'kingdom-shu',
  吴: 'kingdom-wu',
  群: 'kingdom-qun',
};
