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
  GUDING = '古锭刀',
  ZHUQUE = '朱雀羽扇',
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
  /** 判定区：延时锦囊按进入先后顺序排列，判定阶段逐张结算 */
  judgeZone?: Card[];
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
  /** 蔡夫人「献州」限定技已使用 */
  xianzhouUsed?: boolean;
  /** 赵襄「梅影」标记数 */
  meiyanMarks?: number;
  /** 赵襄「扶汉」限定技已使用 */
  fuhanUsed?: boolean;
  /** 辛宪英「忠鉴」本回合已发动次数 */
  zhongjianCount?: number;
  /** 辛宪英「忠鉴」本回合发动上限（点数相同改为 2） */
  zhongjianLimit?: number;
  /** 手牌上限修正（忠鉴 -1 / 才识 +1，长期累积） */
  handLimitDelta?: number;
  /** 辛宪英「才识」本回合用牌限制 */
  caiShiMode?: 'limitOther' | 'limitSelf' | null;
  /** 王元姬「尚俭」本回合失去的牌数（每回合开始清零） */
  lostCardsThisTurn?: number;
  /** 王元姬「谦冲」本回合选择的无次数/无距离限制牌型 */
  qianchongType?: 'basic' | 'trick' | 'equip' | null;
  /** 周妃「箜声」置于武将牌上的牌 */
  placedCards?: Card[];
  /** 张昌蒲「严教」下回合开始应摸的牌数 */
  yanjiaoCount?: number;
  /** 羊徽瑜「弘仪」指定的角色（直至其下回合开始） */
  hongyiTargetId?: number | null;
  /** 羊徽瑜「劝封」限定技已使用 */
  quanfengUsed?: boolean;
  /** 通用：武将牌是否明置（暗置为 false/未定义） */
  generalRevealed?: boolean;
  /** 通用：武将牌是否已移出游戏（移除后失去武将技能） */
  generalRemoved?: boolean;
  /** 通用：临时授予的技能名（可被多个技能查询） */
  grantedSkills?: string[];
  /** 通用：临时技能的失效回合（键为技能名，值为全局回合计数） */
  grantedSkillUntil?: Record<string, number>;
  /** 吴苋「福绵」本回合选项（1 额外摸牌 / 2 额外目标） */
  fumianChoice?: number;
  /** 吴苋「福绵」选项 1 数值（额外摸牌数） */
  fumianValue1?: number;
  /** 吴苋「福绵」选项 2 数值（额外目标数） */
  fumianValue2?: number;
  /** 吴苋「怠宴」上回合的目标 */
  daiyanTargetId?: number;
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
  JUDGE = '判定阶段',
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