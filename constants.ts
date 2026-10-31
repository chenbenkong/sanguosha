import { Hero, Card, CardName, CardType, Suit } from './types';

export const BGM_URL = "./背景音乐.mp3"; // 本地背景音乐文件

export const SOUNDS: Record<string, string> = {
  [CardName.SHA]: "https://cdn.pixabay.com/audio/2022/03/15/audio_244e0f6319.mp3", // Sword slash
  [CardName.SHAN]: "https://cdn.pixabay.com/audio/2022/03/24/audio_349666f747.mp3", // Whoosh
  [CardName.TAO]: "https://cdn.pixabay.com/audio/2022/03/10/audio_c874288094.mp3", // Magic heal/chime
  [CardName.JUEDOU]: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d0.mp3", // Clash
  [CardName.NANMAN]: "https://cdn.pixabay.com/audio/2022/03/19/audio_827cb63a23.mp3", // War horn/drum
  [CardName.WUZHONG]: "https://cdn.pixabay.com/audio/2022/03/15/audio_78385627b0.mp3", // Mystery sound
  [CardName.WUXIE]: "https://cdn.pixabay.com/audio/2022/03/16/audio_417d9f70cf.mp3", // Counter spell
  [CardName.WANJIAN]: "https://cdn.pixabay.com/audio/2022/02/08/audio_437d3a3773.mp3", // Volley of arrows
  [CardName.SHUNSHOU]: "https://cdn.pixabay.com/audio/2022/03/17/audio_51cc5e0d3a.mp3", // Sneak
  [CardName.GUOHE]: "https://cdn.pixabay.com/audio/2022/03/18/audio_771c62e928.mp3", // Destroy
  [CardName.LESI]: "https://cdn.pixabay.com/audio/2022/03/14/audio_c13d3d6e2a.mp3", // Imprison
  [CardName.HUOGONG]: "https://cdn.pixabay.com/audio/2022/03/10/audio_c874288094.mp3", // Fire
  [CardName.TIESUO]: "https://cdn.pixabay.com/audio/2022/03/15/audio_78385627b0.mp3", // Chain
  [CardName.JIU]: "https://cdn.pixabay.com/audio/2022/03/10/audio_c874288094.mp3", // Wine
  [CardName.BINGLIANG]: "https://cdn.pixabay.com/audio/2022/03/14/audio_c13d3d6e2a.mp3", // Supply
  [CardName.WUGU]: "https://cdn.pixabay.com/audio/2022/03/15/audio_78385627b0.mp3", // Harvest/Abundant
  [CardName.TAOYUAN]: "https://cdn.pixabay.com/audio/2022/03/10/audio_c874288094.mp3", // Peach Garden/Heal
  'equip': "https://cdn.pixabay.com/audio/2022/03/22/audio_d17676e10c.mp3",
  'damage': "https://cdn.pixabay.com/audio/2022/03/10/audio_5103704289.mp3", // Impact
  'death': "https://cdn.pixabay.com/audio/2021/08/09/audio_03d6d0e80a.mp3" // Sad gong
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