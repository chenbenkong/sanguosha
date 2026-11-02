import { Hero, Card, CardName, CardType, Suit, EquipmentSlot } from './types';

// 背景音乐见 App.tsx 的 BGM_TRACKS（Opus 优先 + MP3 回退），此处不再维护路径

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
    avatarUrl: 'images/heroes/曹操.webp',
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
    avatarUrl: 'images/heroes/刘备.webp',
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
    avatarUrl: 'images/heroes/孙权.webp',
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
    avatarUrl: 'images/heroes/吕布.webp',
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
    avatarUrl: 'images/heroes/赵云.webp',
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
    avatarUrl: 'images/heroes/关羽.webp',
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
    avatarUrl: 'images/heroes/司马懿.webp',
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
    avatarUrl: 'images/heroes/貂蝉.webp',
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
    avatarUrl: 'images/heroes/张飞.webp',
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
    avatarUrl: 'images/heroes/黄忠.webp',
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
    avatarUrl: 'images/heroes/夏侯惇.webp',
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
    avatarUrl: 'images/heroes/周瑜.webp',
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
    avatarUrl: 'images/heroes/甄姬.webp',
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
    avatarUrl: 'images/heroes/黄月英.webp',
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
    avatarUrl: 'images/heroes/孙尚香.webp',
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
    avatarUrl: 'images/heroes/张春华.webp',
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
    avatarUrl: 'images/heroes/祝融.webp',
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
    avatarUrl: 'images/heroes/大乔.webp',
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
    avatarUrl: 'images/heroes/小乔.webp',
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
    avatarUrl: 'images/heroes/蔡文姬.webp',
    description: '异乡的孤女',
    skillName: '断肠',
    skillDesc: '你死亡时，伤害来源失去所有手牌。',
    gender: 'female',
  },
  {
    id: 'ganning',
    name: '甘宁',
    kingdom: '吴',
    maxHp: 4,
    avatarUrl: 'images/heroes/甘宁.webp',
    description: '锦帆贼',
    skillName: '奇袭',
    skillDesc: '你可以将一张黑色牌当【过河拆桥】使用（点击「奇袭」按钮选一张黑色牌，再指定目标）。',
    gender: 'male',
  },
  {
    id: 'lvmeng',
    name: '吕蒙',
    kingdom: '吴',
    maxHp: 4,
    avatarUrl: 'images/heroes/吕蒙.webp',
    description: '白衣渡江',
    skillName: '克己',
    skillDesc: '出牌阶段内你未使用过【杀】，可以跳过弃牌阶段。',
    gender: 'male',
  },
  {
    id: 'wangyi',
    name: '王异',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/王异.webp',
    description: '决意的巾帼',
    skillName: '秘计',
    skillDesc: '回合开始时，若你已受伤，你摸X张牌（X为你已损失的体力值）。',
    gender: 'female',
  },
  {
    id: 'bulianshi',
    name: '步练师',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/步练师.webp',
    description: '无冕之后',
    skillName: '追忆',
    skillDesc: '你死亡时，可令一名其他角色摸三张牌。',
    gender: 'female',
  }
];

// 每张牌型的类型 / 描述 / 配色（牌堆只负责花色点数）
const CARD_META: Partial<Record<CardName, { type: CardType; desc: string; color: string }>> = {
  [CardName.SHA]: { type: CardType.BASIC, desc: '对攻击范围内的角色造成1点伤害。', color: 'from-stone-800 to-black' },
  [CardName.SHAN]: { type: CardType.BASIC, desc: '抵消一张【杀】的效果。', color: 'from-stone-200 to-stone-400' },
  [CardName.TAO]: { type: CardType.BASIC, desc: '回复1点体力。', color: 'from-rose-400 to-rose-600' },
  [CardName.JIU]: { type: CardType.BASIC, desc: '出牌阶段使用，本回合下一张【杀】伤害+1；濒死时使用，回复1点体力。', color: 'from-amber-600 to-amber-800' },
  [CardName.WUZHONG]: { type: CardType.SCROLL, desc: '出牌阶段使用，摸两张牌。', color: 'from-yellow-600 to-yellow-800' },
  [CardName.JUEDOU]: { type: CardType.SCROLL, desc: '对一名角色使用。轮流打出【杀】，未打出者受1点伤害。', color: 'from-purple-800 to-indigo-900' },
  [CardName.NANMAN]: { type: CardType.SCROLL, desc: '所有其他角色需打出一张【杀】，否则受1点伤害。', color: 'from-orange-800 to-amber-900' },
  [CardName.WUXIE]: { type: CardType.SCROLL, desc: '抵消目标锦囊牌对一名角色的效果。', color: 'from-cyan-600 to-cyan-800' },
  [CardName.WANJIAN]: { type: CardType.SCROLL, desc: '所有其他角色需打出一张【闪】，否则受1点伤害。', color: 'from-indigo-700 to-indigo-900' },
  [CardName.SHUNSHOU]: { type: CardType.SCROLL, desc: '对距离为1的角色使用，获得其一张手牌。', color: 'from-emerald-600 to-emerald-800' },
  [CardName.GUOHE]: { type: CardType.SCROLL, desc: '对一名角色使用，弃置其一张手牌。', color: 'from-red-800 to-red-900' },
  [CardName.LESI]: { type: CardType.SCROLL, desc: '出牌阶段对一名角色使用，其回合判定阶段进行判定，若不为红桃则跳过出牌阶段。', color: 'from-pink-600 to-pink-800' },
  [CardName.HUOGONG]: { type: CardType.SCROLL, desc: '对一名有手牌的角色使用，目标需展示一张手牌，你弃置一张同花色手牌，对其造成1点火焰伤害。', color: 'from-red-600 to-orange-600' },
  [CardName.TIESUO]: { type: CardType.SCROLL, desc: '选择1-2名角色，将其横置或重置。横置的角色受到属性伤害时，其他横置角色也会受到等量伤害。', color: 'from-stone-600 to-stone-800' },
  [CardName.BINGLIANG]: { type: CardType.SCROLL, desc: '出牌阶段对距离为1的角色使用，其回合判定阶段进行判定，若不为梅花则跳过摸牌阶段。', color: 'from-stone-700 to-stone-900' },
  [CardName.WUGU]: { type: CardType.SCROLL, desc: '出牌阶段使用，从牌堆顶亮出等同于存活角色数量的牌，每名角色选择并获得其中一张。', color: 'from-yellow-500 to-amber-600' },
  [CardName.TAOYUAN]: { type: CardType.SCROLL, desc: '出牌阶段使用，所有角色回复1点体力。', color: 'from-pink-400 to-rose-600' },
  [CardName.JIEDAO]: { type: CardType.SCROLL, desc: '对装备区里有武器牌的其他角色使用，令其对其攻击范围内你选择的另一名角色使用一张【杀】，否则将其装备区里的武器牌交给你。', color: 'from-slate-600 to-slate-800' },
  [CardName.SHANDIAN]: { type: CardType.SCROLL, desc: '延时锦囊，出牌阶段对自己使用，将此牌横置于判定区。判定阶段进行判定：若判定结果为黑桃2-9，则目标角色受到3点雷电伤害，并将此牌置入弃牌堆；否则将此牌移动到下一个角色的判定区。', color: 'from-purple-700 to-indigo-900' },
};

// 牌堆 = 标准版 + EX + 军争篇中本作已实现的牌型，全部使用官方花色与点数。
// 尚未实现因而未入池：火杀 / 雷杀（属性杀）、藤甲 / 白银狮子、丈八蛇矛 / 贯石斧 / 雌雄双股剑 / 寒冰剑 / 麒麟弓、爪黄飞电 / 骅骝。
const generateDeck = (): Card[] => {
  const deck: Card[] = [];
  let idCounter = 0;

  const push = (name: CardName, suit: Suit, rank: string) => {
    const meta = CARD_META[name];
    if (!meta) return;
    deck.push({
      id: `card-${idCounter++}`,
      name,
      type: meta.type,
      suit,
      rank,
      value: 0,
      description: meta.desc,
      imageColor: meta.color,
    });
  };

  const pushEquip = (name: CardName, suit: Suit, rank: string) => {
    const meta = EQUIP_META[name];
    if (!meta) return;
    deck.push({
      id: `card-${idCounter++}`,
      name,
      type: CardType.EQUIPMENT,
      suit,
      rank,
      value: 0,
      description: meta.desc,
      imageColor: meta.face,
    });
  };

  const addAll = (name: CardName, list: Array<[Suit, string]>) => list.forEach(([s, r]) => push(name, s, r));
  const addEquipAll = (name: CardName, list: Array<[Suit, string]>) => list.forEach(([s, r]) => pushEquip(name, s, r));

  const H = Suit.HEART, D = Suit.DIAMOND, S = Suit.SPADE, C = Suit.CLUB;

  // ===== 基本牌（71）=====
  // 杀 30
  addAll(CardName.SHA, [
    [S, '7'], [S, '8'], [S, '8'], [S, '9'], [S, '9'], [S, '10'], [S, '10'],
    [H, '10'], [H, '10'], [H, 'J'],
    [C, '2'], [C, '3'], [C, '4'], [C, '5'], [C, '6'], [C, '7'], [C, '8'], [C, '8'], [C, '9'], [C, '9'], [C, '10'], [C, '10'], [C, 'J'], [C, 'J'],
    [D, '6'], [D, '7'], [D, '8'], [D, '9'], [D, '10'], [D, 'K'],
  ]);
  // 闪 24（标准 15 + 军争 9）
  addAll(CardName.SHAN, [
    [H, '2'], [H, '2'], [H, 'K'],
    [D, '2'], [D, '2'], [D, '3'], [D, '4'], [D, '5'], [D, '6'], [D, '7'], [D, '8'], [D, '9'], [D, '10'], [D, 'J'], [D, 'J'],
    [H, '8'], [H, '9'], [H, 'J'], [H, 'Q'], [D, '6'], [D, '7'], [D, '8'], [D, '10'], [D, 'J'],
  ]);
  // 桃 12（标准 8 + 军争 4）
  addAll(CardName.TAO, [
    [H, '3'], [H, '4'], [H, '6'], [H, '7'], [H, '8'], [H, '9'], [H, 'Q'], [D, 'Q'],
    [H, '5'], [H, '6'], [D, '2'], [D, '3'],
  ]);
  // 酒 5
  addAll(CardName.JIU, [
    [D, '9'], [C, '9'], [S, '9'], [S, '3'], [C, '3'],
  ]);

  // ===== 锦囊牌（52）=====
  // 无中生有 8（标准 4 + 军争 4）
  addAll(CardName.WUZHONG, [
    [H, '7'], [H, '8'], [H, '9'], [H, 'J'],
    [H, '7'], [H, '9'], [H, 'J'], [H, '8'],
  ]);
  // 决斗 3
  addAll(CardName.JUEDOU, [[S, 'A'], [C, 'A'], [D, 'A']]);
  // 南蛮入侵 3
  addAll(CardName.NANMAN, [[C, '7'], [S, '7'], [S, 'K']]);
  // 万箭齐发 1
  addAll(CardName.WANJIAN, [[H, 'A']]);
  // 无懈可击 7（标准 3 + EX 1 + 军争 3）
  addAll(CardName.WUXIE, [[S, 'J'], [C, 'Q'], [C, 'K'], [D, 'Q'], [H, 'A'], [H, 'K'], [S, 'Q']]);
  // 过河拆桥 4
  addAll(CardName.GUOHE, [[S, '3'], [S, '4'], [C, '3'], [C, '4']]);
  // 顺手牵羊 5
  addAll(CardName.SHUNSHOU, [[S, '3'], [S, '4'], [S, 'J'], [D, '3'], [D, '4']]);
  // 借刀杀人 2
  addAll(CardName.JIEDAO, [[C, 'Q'], [C, 'K']]);
  // 乐不思蜀 3
  addAll(CardName.LESI, [[S, '6'], [H, '6'], [C, '6']]);
  // 闪电 2（标准 1 + EX 1）
  addAll(CardName.SHANDIAN, [[S, 'A'], [H, 'Q']]);
  // 五谷丰登 2
  addAll(CardName.WUGU, [[H, '3'], [H, '4']]);
  // 桃园结义 1
  addAll(CardName.TAOYUAN, [[H, 'A']]);
  // 火攻 3
  addAll(CardName.HUOGONG, [[H, '2'], [H, '3'], [D, 'Q']]);
  // 铁索连环 6
  addAll(CardName.TIESUO, [[C, '10'], [C, 'J'], [C, 'Q'], [C, 'K'], [S, 'J'], [S, 'Q']]);
  // 兵粮寸断 2
  addAll(CardName.BINGLIANG, [[C, '4'], [S, '10']]);

  // ===== 装备牌（12）=====
  addEquipAll(CardName.ZHUGE, [[C, 'A'], [D, 'A']]);
  addEquipAll(CardName.QINGGANG, [[S, '6']]);
  addEquipAll(CardName.QINGLONG, [[S, '5']]);
  addEquipAll(CardName.FANGTIAN, [[D, 'Q']]);
  addEquipAll(CardName.BAGUA, [[S, '2'], [C, '2']]);
  addEquipAll(CardName.RENWANG, [[C, '2']]);
  addEquipAll(CardName.CHITU, [[H, '5']]);
  addEquipAll(CardName.DAWAN, [[S, 'K']]);
  addEquipAll(CardName.DILU, [[C, '5']]);
  addEquipAll(CardName.JUEYING, [[S, '5']]);

  // 洗切后 135 张
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