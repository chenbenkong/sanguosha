export enum Suit {
  SPADE = '♠',
  HEART = '♥',
  CLUB = '♣',
  DIAMOND = '♦',
}

export enum CardType {
  BASIC = '基本牌',
  SCROLL = '锦囊牌', 
  EQUIPMENT = '装备牌',
}

export enum CardName {
  SHA = '杀', // Slash
  SHAN = '闪', // Dodge
  TAO = '桃', // Peach
  JUEDOU = '决斗', // Duel
  WUZHONG = '无中生有', // Draw 2
  NANMAN = '南蛮入侵', // AOE Damage
  WUXIE = '无懈可击', // Nullify
  WANJIAN = '万箭齐发', // AOE Attack
  SHUNSHOU = '顺手牵羊', // Steal
  GUOHE = '过河拆桥', // Discard
  LESI = '乐不思蜀', // Imprison
  HUOGONG = '火攻', // Fire Attack
  TIESUO = '铁索连环', // Iron Chain
  JIU = '酒', // Wine
  BINGLIANG = '兵粮寸断', // Supply Shortage
  WUGU = '五谷丰登', // Abundant Harvest
  TAOYUAN = '桃园结义', // Oath of the Peach Garden
  JIEDAO = '借刀杀人', // Borrowed Sword
  SHANDIAN = '闪电', // Lightning
  // —— 装备牌 ——
  QINGGANG = '青釭剑',
  QINGLONG = '青龙偃月刀',
  FANGTIAN = '方天画戟',
  ZHUGE = '诸葛连弩',
  ZHANGBA = '丈八蛇矛',
  GUANSHI = '贯石斧',
  CIXIONG = '雌雄双股剑',
  HANBING = '寒冰剑',
  QILIN = '麒麟弓',
  BAGUA = '八卦阵',
  RENWANG = '仁王盾',
  TENGJIA = '藤甲',
  BAIYIN = '白银狮子',
  CHITU = '赤兔',
  DAWAN = '大宛',
  ZIXING = '紫骍',
  DILU = '的卢',
  JUEYING = '绝影',
  ZHUAHUANG = '爪黄飞电',
}

export interface Card {
  id: string;
  name: CardName;
  type: CardType;
  suit: Suit;
  rank: string; // A, 2-10, J, Q, K
  value: number; 
  description: string;
  imageColor: string; // CSS class for background gradient
  /** 属性杀：火杀 / 雷杀（普通杀不带此字段） */
  attribute?: 'fire' | 'thunder';
}

export enum Identity {
  ZHUGONG = '主公', // Lord
  ZHONGCHEN = '忠臣', // Loyalist
  FANZEI = '反贼', // Rebel
  NEIJIAN = '内奸', // Renegade/Spy
}

export interface Hero {
  id: string;
  name: string;
  kingdom: '魏' | '蜀' | '吴' | '群';
  maxHp: number;
  avatarUrl: string;
  description: string;
  skillName: string;
  skillDesc: string;
  gender: 'male' | 'female';
  /** 主公技（仅主公身份时生效） */
  lordSkillName?: string;
  lordSkillDesc?: string;
  /** 技能尚未实装：可在图鉴/选将页查看，但不进入随机池、不可开局 */
  pending?: boolean;
}

export interface Player {
  id: number; // 0 is always human, 1-4 are AI
  isHuman: boolean;
  hero: Hero;
  hp: number;
  maxHp: number; // Adjusted for Lord (+1)
  hand: Card[];
  identity: Identity;
  isDead: boolean;
  isRevealed: boolean; // Identity revealed (Lord is always true, others on death)
  isSelected: boolean; // For target selection
  // 状态标志
  isChained?: boolean; // 铁索连环状态
  isLeBuSiShu?: boolean; // 乐不思蜀状态
  isBingLiangCunDuan?: boolean; // 兵粮寸断状态
  isShandian?: boolean; // 闪电挂置状态（判定区）
  // 装备区
  equipment?: Equipment;
  /** 张琪瑛「法箓」标记（紫微/后土/玉清/勾陈，每种限一枚） */
  zhangMarks?: string[];
  /** 卑弥呼「傀」标记 */
  hasKui?: boolean;
  /** 卑弥呼「疽」计数 */
  juMarks?: number;
  /** 卑弥呼「拜假」已觉醒（骨疽→蚕食） */
  baiJiaAwakened?: boolean;
  /** 孙寒华「妙剑」等级（1~3） */
  miaoJianLevel?: number;
  /** 孙寒华「莲华」等级（1~3） */
  lianHuaLevel?: number;
  /** 曹婴「凌人」猜中三项后临时获得「奸雄」 */
  hasJianxiong?: boolean;
  /** 曹婴「凌人」猜中三项后临时获得「行殇」 */
  hasXingshang?: boolean;
  /** 鲍三娘「许身」限定技已使用 */
  xushenUsed?: boolean;
  /** 灵雎「焚心」限定技已使用 */
  fenxinUsed?: boolean;
}

/** 装备区：武器 / 防具 / +1马 / -1马 */
export interface Equipment {
  weapon?: Card;
  armor?: Card;
  horsePlus?: Card; // 防御马：别人到你的距离 +1
  horseMinus?: Card; // 进攻马：你到别人的距离 -1
}

export type EquipmentSlot = keyof Equipment;

export enum GamePhase {
  START = '回合开始',
  DRAW = '摸牌阶段',
  ACTION = '出牌阶段',
  DISCARD = '弃牌阶段',
  END = '回合结束',
}

export interface LogEntry {
  id: string;
  text: string;
  type: 'info' | 'danger' | 'success' | 'warning' | 'chat' | 'skill';
}