import { Hero, Card, CardName, CardType, Suit, EquipmentSlot } from './types';

export const BGM_URL = "./背景音乐.mp3"; // 本地背景音乐文件

// 音效已在 src/audio/sfx.ts 中改为本地 WebAudio 合成，不再依赖外部 CDN

/** 装备元数据：槽位、攻击范围、描述、卡面配色 */
export interface EquipMeta {
  slot: EquipmentSlot;
  range?: number; // 仅武器：攻击范围
  desc: string;
  face: string;
  accent: string;
}

export const EQUIP_META: Partial<Record<CardName, EquipMeta>> = {
  [CardName.QINGGANG]: { slot: 'weapon', range: 2, desc: '攻击范围2。你使用的【杀】无视目标防具。', face: 'from-[#eef1f6] via-[#e3e8f1] to-[#cfd7e4]', accent: '#3c5a80' },
  [CardName.QINGLONG]: { slot: 'weapon', range: 3, desc: '攻击范围3。', face: 'from-[#eef7f0] via-[#e0efe4] to-[#c8dfd0]', accent: '#2f6e52' },
  [CardName.FANGTIAN]: { slot: 'weapon', range: 4, desc: '攻击范围4。', face: 'from-[#f6efe2] via-[#ece0cc] to-[#dcc9a8]', accent: '#8a6a2a' },
  [CardName.ZHUGE]: { slot: 'weapon', range: 1, desc: '攻击范围1。出牌阶段你可以使用任意数量的【杀】。', face: 'from-[#f2ece6] via-[#e7ddd2] to-[#d6c7b6]', accent: '#7a5230' },
  [CardName.BAGUA]: { slot: 'armor', desc: '需要使用【闪】时，可进行一次判定：红色则视为你打出【闪】。', face: 'from-[#f1f5f2] via-[#e3ebe6] to-[#cfdad3]', accent: '#3f6b58' },
  [CardName.RENWANG]: { slot: 'armor', desc: '黑色的【杀】对你无效。', face: 'from-[#f4f1ed] via-[#e9e4dd] to-[#d9d1c6]', accent: '#5b5148' },
  [CardName.CHITU]: { slot: 'horseMinus', desc: '进攻马：你计算与其他角色的距离-1。', face: 'from-[#fbeeee] via-[#f4dcdc] to-[#e7c3c3]', accent: '#9a3a34' },
  [CardName.DAWAN]: { slot: 'horseMinus', desc: '进攻马：你计算与其他角色的距离-1。', face: 'from-[#f3eefb] via-[#e8e0f4] to-[#d6c9e8]', accent: '#5b3d8f' },
  [CardName.DILU]: { slot: 'horsePlus', desc: '防御马：其他角色计算与你的距离+1。', face: 'from-[#eef2fb] via-[#e0e7f6] to-[#cbd6ea]', accent: '#3c5a90' },
  [CardName.JUEYING]: { slot: 'horsePlus', desc: '防御马：其他角色计算与你的距离+1。', face: 'from-[#f0f1f3] via-[#e4e6ea] to-[#ced2d8]', accent: '#4a4f58' },
};

export const HEROES: Hero[] = [
  {
    id: 'caocao',
    name: '曹操',
    kingdom: '魏',
    maxHp: 4,
    avatarUrl: 'images/heroes/曹操.jpg',
    description: '乱世之奸雄',
    skillName: '奸雄',
    skillDesc: '受到伤害后，你可以获得造成伤害的牌。',
    gender: 'male',
  },
  {
    id: 'liubei',
    name: '刘备',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/刘备.jpg',
    description: '仁德之君',
    skillName: '仁德',
    skillDesc: '出牌阶段，你可以将任意手牌交给其他角色。每阶段给出2张或更多牌时，你回复1点体力。',
    gender: 'male',
  },
  {
    id: 'sunquan',
    name: '孙权',
    kingdom: '吴',
    maxHp: 4,
    avatarUrl: 'images/heroes/孙权.jpg',
    description: '年轻的贤君',
    skillName: '制衡',
    skillDesc: '出牌阶段，你可以弃置任意张牌，然后摸等量的牌。',
    gender: 'male',
  },
  {
    id: 'lubu',
    name: '吕布',
    kingdom: '群',
    maxHp: 5,
    avatarUrl: 'images/heroes/吕布.jpg',
    description: '天下无双',
    skillName: '无双',
    skillDesc: '使用【杀】需两张【闪】抵消；与你【决斗】需打出两张【杀】。',
    gender: 'male',
  },
  {
    id: 'zhaoyun',
    name: '赵云',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/赵云.jpg',
    description: '浑身是胆',
    skillName: '龙胆',
    skillDesc: '你可以将【杀】当【闪】，【闪】当【杀】使用。',
    gender: 'male',
  },
  {
    id: 'guanyu',
    name: '关羽',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/关羽.jpg',
    description: '美髯公',
    skillName: '武圣',
    skillDesc: '你可以将一张红色牌当【杀】使用。',
    gender: 'male',
  },
  {
    id: 'simayi',
    name: '司马懿',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/司马懿.jpg',
    description: '狼顾之鬼',
    skillName: '鬼才',
    skillDesc: '成功使用卡牌免疫了对方的任何攻击，回复一滴血，如果血量是满的，则获得一张牌。',
    gender: 'male',
  },
  {
    id: 'diaochan',
    name: '貂蝉',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/貂蝉.jpg',
    description: '绝世舞姬',
    skillName: '离间',
    skillDesc: '出牌阶段，弃置一张牌，令两名男性角色进行决斗。',
    gender: 'female',
  },
  {
    id: 'zhangfei',
    name: '张飞',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/张飞.jpg',
    description: '万夫不当',
    skillName: '咆哮',
    skillDesc: '出牌阶段，你使用【杀】无次数限制。',
    gender: 'male',
  },
  {
    id: 'huangzhong',
    name: '黄忠',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/黄忠.jpg',
    description: '老当益壮',
    skillName: '烈弓',
    skillDesc: '你使用【杀】指定目标后，若目标手牌数不少于你的体力值，此【杀】不可被【闪】抵消。',
    gender: 'male',
  },
  {
    id: 'xiahoudun',
    name: '夏侯惇',
    kingdom: '魏',
    maxHp: 4,
    avatarUrl: 'images/heroes/夏侯惇.jpg',
    description: '独眼之狼',
    skillName: '刚烈',
    skillDesc: '受到伤害后进行一次判定，若结果不为红桃，伤害来源失去1点体力。',
    gender: 'male',
  },
  {
    id: 'zhouyu',
    name: '周瑜',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/周瑜.jpg',
    description: '美周郎',
    skillName: '英姿',
    skillDesc: '摸牌阶段，你额外摸一张牌。',
    gender: 'male',
  },
  {
    id: 'zhenji',
    name: '甄姬',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/甄姬.jpg',
    description: '洛水佳人',
    skillName: '倾国 / 洛神',
    skillDesc: '倾国：你可以将一张黑色手牌当【闪】使用或打出。洛神：回合开始时进行判定，若为黑色你获得该判定牌并可继续判定（最多3次）。',
    gender: 'female',
  },
  {
    id: 'huangyueying',
    name: '黄月英',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/黄月英.jpg',
    description: '归隐的才女',
    skillName: '集智 / 奇才',
    skillDesc: '集智：你使用锦囊牌时摸一张牌。奇才：你使用锦囊牌无距离限制。',
    gender: 'female',
  },
  {
    id: 'sunshangxiang',
    name: '孙尚香',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/孙尚香.jpg',
    description: '弓腰姬',
    skillName: '枭姬 / 结姻',
    skillDesc: '枭姬：当你失去装备区的牌时摸两张牌。结姻：出牌阶段限一次，弃置两张手牌，与一名已受伤的男性角色各回复1点体力。',
    gender: 'female',
  },
  {
    id: 'zhangchunhua',
    name: '张春华',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/张春华.jpg',
    description: '冷血皇后',
    skillName: '伤逝',
    skillDesc: '回合结束时，若你的手牌数少于已损失的体力值，你摸牌补至该数值。',
    gender: 'female',
  },
  {
    id: 'zhurong',
    name: '祝融',
    kingdom: '群',
    maxHp: 4,
    avatarUrl: 'images/heroes/祝融.jpg',
    description: '南蛮女王',
    skillName: '巨象',
    skillDesc: '【南蛮入侵】对你无效，且你可以获得之（改为摸一张牌）。',
    gender: 'female',
  },
  {
    id: 'daqiao',
    name: '大乔',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/大乔.jpg',
    description: '国色天香',
    skillName: '流离',
    skillDesc: '你成为【杀】的目标时，可以弃置一张手牌，将此【杀】转移给你攻击范围内的另一名角色。',
    gender: 'female',
  },
  {
    id: 'xiaoqiao',
    name: '小乔',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/小乔.jpg',
    description: '江东之花',
    skillName: '红颜',
    skillDesc: '你的方块牌视为红桃（判定时生效）。',
    gender: 'female',
  },
  {
    id: 'caiwenji',
    name: '蔡文姬',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/蔡文姬.jpg',
    description: '异乡的孤女',
    skillName: '断肠',
    skillDesc: '你死亡时，伤害来源失去所有手牌。',
    gender: 'female',
  }
];

const generateDeck = (): Card[] => {
  const deck: Card[] = [];
  let idCounter = 0;

  const addCard = (name: CardName, type: CardType, suit: Suit, rank: string, count: number, desc: string, color: string) => {
    for (let i = 0; i < count; i++) {
      // 为相同类型的牌生成唯一的显示标识，避免多张相同类型的牌显示完全相同
      // 对于数量大于1的相同类型牌，在rank后添加序号
      const displayRank = count > 1 ? `${rank}${i+1}` : rank;
      
      deck.push({
        id: `card-${idCounter++}`,
        name,
        type,
        suit,
        rank: displayRank,
        value: 0,
        description: desc,
        imageColor: color,
      });
    }
  };

  // 基础牌 - Expanded for 5 players
  // 杀
  addCard(CardName.SHA, CardType.BASIC, Suit.SPADE, '7', 8, '对攻击范围内的角色造成1点伤害。', 'from-stone-800 to-black');
  addCard(CardName.SHA, CardType.BASIC, Suit.HEART, '10', 5, '对攻击范围内的角色造成1点伤害。', 'from-stone-800 to-black');
  addCard(CardName.SHA, CardType.BASIC, Suit.CLUB, 'J', 6, '对攻击范围内的角色造成1点伤害。', 'from-stone-800 to-black');
  addCard(CardName.SHA, CardType.BASIC, Suit.DIAMOND, 'K', 5, '对攻击范围内的角色造成1点伤害。', 'from-stone-800 to-black');

  // 闪
  addCard(CardName.SHAN, CardType.BASIC, Suit.DIAMOND, '2', 6, '抵消一张【杀】的效果。', 'from-stone-200 to-stone-400');
  addCard(CardName.SHAN, CardType.BASIC, Suit.HEART, '2', 6, '抵消一张【杀】的效果。', 'from-stone-200 to-stone-400');

  // 桃
  addCard(CardName.TAO, CardType.BASIC, Suit.HEART, 'Q', 8, '回复1点体力。', 'from-rose-400 to-rose-600');

  // 锦囊牌
  // 无中生有
  addCard(CardName.WUZHONG, CardType.SCROLL, Suit.HEART, '7', 4, '出牌阶段使用，摸两张牌。', 'from-yellow-600 to-yellow-800');

  // 决斗
  addCard(CardName.JUEDOU, CardType.SCROLL, Suit.SPADE, 'A', 3, '对一名角色使用。轮流打出【杀】，未打出者受1点伤害。', 'from-purple-800 to-indigo-900');
  
  // 南蛮入侵
  addCard(CardName.NANMAN, CardType.SCROLL, Suit.CLUB, '7', 3, '所有其他角色需打出一张【杀】，否则受1点伤害。', 'from-orange-800 to-amber-900');
  
  // 无懈可击
  addCard(CardName.WUXIE, CardType.SCROLL, Suit.DIAMOND, 'Q', 3, '抵消目标锦囊牌对一名角色的效果。', 'from-cyan-600 to-cyan-800');
  addCard(CardName.WUXIE, CardType.SCROLL, Suit.SPADE, 'Q', 2, '抵消目标锦囊牌对一名角色的效果。', 'from-cyan-600 to-cyan-800');
  
  // 万箭齐发
  addCard(CardName.WANJIAN, CardType.SCROLL, Suit.SPADE, 'J', 2, '所有其他角色需打出一张【闪】，否则受1点伤害。', 'from-indigo-700 to-indigo-900');
  
  // 顺手牵羊
  addCard(CardName.SHUNSHOU, CardType.SCROLL, Suit.SPADE, '3', 3, '对距离为1的角色使用，获得其一张手牌。', 'from-emerald-600 to-emerald-800');
  addCard(CardName.SHUNSHOU, CardType.SCROLL, Suit.CLUB, '4', 3, '对距离为1的角色使用，获得其一张手牌。', 'from-emerald-600 to-emerald-800');
  
  // 过河拆桥
  addCard(CardName.GUOHE, CardType.SCROLL, Suit.SPADE, '5', 3, '对一名角色使用，弃置其一张手牌。', 'from-red-800 to-red-900');
  addCard(CardName.GUOHE, CardType.SCROLL, Suit.CLUB, '6', 3, '对一名角色使用，弃置其一张手牌。', 'from-red-800 to-red-900');
  
  // 乐不思蜀
  addCard(CardName.LESI, CardType.SCROLL, Suit.HEART, '6', 2, '出牌阶段对一名角色使用，其回合判定阶段进行判定，若不为红桃则跳过出牌阶段。', 'from-pink-600 to-pink-800');

  // 火攻
  addCard(CardName.HUOGONG, CardType.SCROLL, Suit.HEART, '2', 3, '对一名有手牌的角色使用，目标需展示一张手牌，你弃置一张同花色手牌，对其造成1点火焰伤害。', 'from-red-600 to-orange-600');
  addCard(CardName.HUOGONG, CardType.SCROLL, Suit.DIAMOND, 'Q', 2, '对一名有手牌的角色使用，目标需展示一张手牌，你弃置一张同花色手牌，对其造成1点火焰伤害。', 'from-red-600 to-orange-600');

  // 铁索连环
  addCard(CardName.TIESUO, CardType.SCROLL, Suit.SPADE, 'J', 2, '选择1-2名角色，将其横置或重置。横置的角色受到属性伤害时，其他横置角色也会受到等量伤害。', 'from-stone-600 to-stone-800');
  addCard(CardName.TIESUO, CardType.SCROLL, Suit.CLUB, '10', 2, '选择1-2名角色，将其横置或重置。横置的角色受到属性伤害时，其他横置角色也会受到等量伤害。', 'from-stone-600 to-stone-800');

  // 酒
  addCard(CardName.JIU, CardType.BASIC, Suit.SPADE, '9', 2, '出牌阶段使用，本回合下一张【杀】伤害+1；濒死时使用，回复1点体力。', 'from-amber-600 to-amber-800');
  addCard(CardName.JIU, CardType.BASIC, Suit.CLUB, '9', 2, '出牌阶段使用，本回合下一张【杀】伤害+1；濒死时使用，回复1点体力。', 'from-amber-600 to-amber-800');

  // 兵粮寸断
  addCard(CardName.BINGLIANG, CardType.SCROLL, Suit.SPADE, '10', 2, '出牌阶段对距离为1的角色使用，其回合判定阶段进行判定，若不为梅花则跳过摸牌阶段。', 'from-stone-700 to-stone-900');
  addCard(CardName.BINGLIANG, CardType.SCROLL, Suit.CLUB, '4', 2, '出牌阶段对距离为1的角色使用，其回合判定阶段进行判定，若不为梅花则跳过摸牌阶段。', 'from-stone-700 to-stone-900');

  // 五谷丰登
  addCard(CardName.WUGU, CardType.SCROLL, Suit.HEART, 'A', 2, '出牌阶段使用，从牌堆顶亮出等同于存活角色数量的牌，每名角色选择并获得其中一张。', 'from-yellow-500 to-amber-600');
  addCard(CardName.WUGU, CardType.SCROLL, Suit.CLUB, 'A', 2, '出牌阶段使用，从牌堆顶亮出等同于存活角色数量的牌，每名角色选择并获得其中一张。', 'from-yellow-500 to-amber-600');

  // 桃园结义
  addCard(CardName.TAOYUAN, CardType.SCROLL, Suit.HEART, 'A', 2, '出牌阶段使用，所有角色回复1点体力。', 'from-pink-400 to-rose-600');

  // 借刀杀人
  addCard(CardName.JIEDAO, CardType.SCROLL, Suit.CLUB, 'Q', 2, '对装备区里有武器牌的其他角色使用，令其对其攻击范围内你选择的另一名角色使用一张【杀】，否则将其装备区里的武器牌交给你。', 'from-slate-600 to-slate-800');
  addCard(CardName.JIEDAO, CardType.SCROLL, Suit.DIAMOND, 'Q', 1, '对装备区里有武器牌的其他角色使用，令其对其攻击范围内你选择的另一名角色使用一张【杀】，否则将其装备区里的武器牌交给你。', 'from-slate-600 to-slate-800');

  // 闪电
  addCard(CardName.SHANDIAN, CardType.SCROLL, Suit.SPADE, 'A', 1, '延时锦囊，出牌阶段对自己使用，将此牌横置于判定区。判定阶段进行判定：若判定结果为黑桃2-9，则目标角色受到3点雷电伤害，并将此牌置入弃牌堆；否则将此牌移动到下一个角色的判定区。', 'from-purple-700 to-indigo-900');

  // —— 装备牌 ——
  const addEquip = (name: CardName, suit: Suit, rank: string) => {
    const meta = EQUIP_META[name]!;
    addCard(name, CardType.EQUIPMENT, suit, rank, 1, meta.desc, meta.face);
  };
  addEquip(CardName.QINGGANG, Suit.SPADE, '6');
  addEquip(CardName.QINGLONG, Suit.SPADE, '5');
  addEquip(CardName.FANGTIAN, Suit.DIAMOND, 'Q');
  addEquip(CardName.ZHUGE, Suit.CLUB, 'A');
  addEquip(CardName.ZHUGE, Suit.DIAMOND, 'A');
  addEquip(CardName.BAGUA, Suit.SPADE, '2');
  addEquip(CardName.BAGUA, Suit.CLUB, '2');
  addEquip(CardName.RENWANG, Suit.CLUB, '8');
  addEquip(CardName.CHITU, Suit.HEART, 'K');
  addEquip(CardName.DAWAN, Suit.DIAMOND, 'K');
  addEquip(CardName.DILU, Suit.CLUB, 'K');
  addEquip(CardName.JUEYING, Suit.SPADE, 'K');

  return shuffle(deck);
};

// Fisher-Yates shuffle - 创建新数组避免原地修改
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }
  return shuffled;
}

export const INITIAL_DECK = generateDeck();