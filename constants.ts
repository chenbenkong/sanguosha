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
  [CardName.QINGLONG]: { slot: 'weapon', range: 3, desc: '攻击范围3。你使用的【杀】被【闪】抵消后，可弃一张【杀】追加一击。', face: 'from-[#eef7f0] via-[#e0efe4] to-[#c8dfd0]', accent: '#2f6e52' },
  [CardName.FANGTIAN]: { slot: 'weapon', range: 4, desc: '攻击范围4。', face: 'from-[#f6efe2] via-[#ece0cc] to-[#dcc9a8]', accent: '#8a6a2a' },
  [CardName.ZHUGE]: { slot: 'weapon', range: 1, desc: '攻击范围1。出牌阶段你可以使用任意数量的【杀】。', face: 'from-[#f2ece6] via-[#e7ddd2] to-[#d6c7b6]', accent: '#7a5230' },
  [CardName.ZHANGBA]: { slot: 'weapon', range: 3, desc: '攻击范围3。你可以将两张手牌当【杀】使用或打出。', face: 'from-[#f4efe6] via-[#e8dfd1] to-[#d6c9b5]', accent: '#6d5a3a' },
  [CardName.GUANSHI]: { slot: 'weapon', range: 3, desc: '攻击范围3。你的【杀】被【闪】抵消时，可弃两张牌令此【杀】依然造成伤害。', face: 'from-[#f3ece4] via-[#e6dccf] to-[#d4c4b0]', accent: '#7a5a38' },
  [CardName.CIXIONG]: { slot: 'weapon', range: 2, desc: '攻击范围2。你使用【杀】指定异性目标后，可令其弃一张手牌，或令你摸一张牌。', face: 'from-[#f6edef] via-[#ecdde1] to-[#dcc8cd]', accent: '#8a4a5a' },
  [CardName.HANBING]: { slot: 'weapon', range: 2, desc: '攻击范围2。你的【杀】造成伤害时，可防止伤害并改为弃置目标两张牌。', face: 'from-[#eff4f7] via-[#e0eaf1] to-[#c9dae6]', accent: '#3a6280' },
  [CardName.QILIN]: { slot: 'weapon', range: 5, desc: '攻击范围5。你的【杀】造成伤害时，可弃置目标的一匹坐骑。', face: 'from-[#f7f0e4] via-[#efe2cb] to-[#e0c9a5]', accent: '#8a6a2a' },
  [CardName.BAGUA]: { slot: 'armor', desc: '需要使用【闪】时，可进行一次判定：红色则视为你打出【闪】。', face: 'from-[#f1f5f2] via-[#e3ebe6] to-[#cfdad3]', accent: '#3f6b58' },
  [CardName.RENWANG]: { slot: 'armor', desc: '黑色的【杀】对你无效。', face: 'from-[#f4f1ed] via-[#e9e4dd] to-[#d9d1c6]', accent: '#5b5148' },
  [CardName.TENGJIA]: { slot: 'armor', desc: '锁定技：南蛮入侵、万箭齐发与普通【杀】对你无效；你受到火焰伤害时伤害+1。', face: 'from-[#f1f4ec] via-[#e4ebdf] to-[#d0dbc6]', accent: '#4f6b3a' },
  [CardName.BAIYIN]: { slot: 'armor', desc: '锁定技：受到大于1点的伤害时改为1点；失去此装备后回复1点体力。', face: 'from-[#f4f5f7] via-[#e7e9ee] to-[#d3d7de]', accent: '#6a7080' },
  [CardName.CHITU]: { slot: 'horseMinus', desc: '进攻马：你计算与其他角色的距离-1。', face: 'from-[#fbeeee] via-[#f4dcdc] to-[#e7c3c3]', accent: '#9a3a34' },
  [CardName.DAWAN]: { slot: 'horseMinus', desc: '进攻马：你计算与其他角色的距离-1。', face: 'from-[#f3eefb] via-[#e8e0f4] to-[#d6c9e8]', accent: '#5b3d8f' },
  [CardName.ZIXING]: { slot: 'horseMinus', desc: '进攻马：你计算与其他角色的距离-1。', face: 'from-[#f0f1f5] via-[#e3e5ec] to-[#cfd3de]', accent: '#4a5268' },
  [CardName.DILU]: { slot: 'horsePlus', desc: '防御马：其他角色计算与你的距离+1。', face: 'from-[#eef2fb] via-[#e0e7f6] to-[#cbd6ea]', accent: '#3c5a90' },
  [CardName.JUEYING]: { slot: 'horsePlus', desc: '防御马：其他角色计算与你的距离+1。', face: 'from-[#f0f1f3] via-[#e4e6ea] to-[#ced2d8]', accent: '#4a4f58' },
  [CardName.ZHUAHUANG]: { slot: 'horsePlus', desc: '防御马：其他角色计算与你的距离+1。', face: 'from-[#faf1e2] via-[#f0e2c8] to-[#e0cba5]', accent: '#8a6a2a' },
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
    lordSkillName: '护驾',
    lordSkillDesc: '当你需要使用或打出【闪】时，可令其他魏势力角色打出一张【闪】（视为你打出）。',
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
    lordSkillName: '激将',
    lordSkillDesc: '当你需要使用或打出【杀】时，可令其他蜀势力角色打出一张【杀】（视为你打出）。',
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
    lordSkillName: '救援',
    lordSkillDesc: '其他吴势力角色对你使用【桃】时，你额外回复1点体力。',
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
    skillName: '反馈',
    skillDesc: '受到伤害后，你可以获得伤害来源的一张手牌。',
    gender: 'male',
  },
  {
    id: 'diaochan',
    name: '貂蝉',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/貂蝉.webp',
    description: '绝世舞姬',
    skillName: '离间 / 闭月',
    skillDesc: '离间：出牌阶段，弃置一张牌，令两名男性角色进行决斗。闭月：回合结束时摸一张牌。',
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
    skillName: '英姿 / 反间',
    skillDesc: '英姿：摸牌阶段额外摸一张牌。反间：出牌阶段限一次，令一名其他角色猜测花色，展示你一张手牌；猜错则受1点伤害，并获得该牌。',
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
    skillName: '绝情 / 伤逝',
    skillDesc: '绝情：你造成的伤害改为令目标失去等量体力。伤逝：回合结束时，若你的手牌数少于已损失的体力值，你摸牌补至该数值。',
    gender: 'female',
  },
  {
    id: 'zhurong',
    name: '祝融',
    kingdom: '群',
    maxHp: 4,
    avatarUrl: 'images/heroes/祝融.webp',
    description: '南蛮女王',
    skillName: '巨象 / 烈刃',
    skillDesc: '巨象：【南蛮入侵】对你无效，且你可以获得之（改为摸一张牌）。烈刃：你的【杀】造成伤害后，可与目标拼点，赢则获得其一张牌。',
    gender: 'female',
  },
  {
    id: 'daqiao',
    name: '大乔',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/大乔.webp',
    description: '国色天香',
    skillName: '流离 / 国色',
    skillDesc: '流离：你成为【杀】的目标时，可弃一张手牌将【杀】转移给攻击范围内的另一名角色。国色：你可以将一张方块牌当【乐不思蜀】使用。',
    gender: 'female',
  },
  {
    id: 'xiaoqiao',
    name: '小乔',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/小乔.webp',
    description: '江东之花',
    skillName: '红颜 / 天香',
    skillDesc: '红颜：你的方块牌视为红桃（判定时生效）。天香：受到伤害时，可弃一张红桃手牌，将伤害转移给伤害来源（简化实现）。',
    gender: 'female',
  },
  {
    id: 'caiwenji',
    name: '蔡文姬',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/蔡文姬.webp',
    description: '异乡的孤女',
    skillName: '悲歌 / 断肠',
    skillDesc: '悲歌：一名角色受到【杀】伤害后，你可以弃一张牌并判定：红桃其回复1点体力，方块其摸两张牌，梅花伤害来源弃两张牌，黑桃伤害来源弃一张牌。断肠：你死亡时，伤害来源失去所有手牌。',
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
    skillName: '秘计 / 贞烈',
    skillDesc: '秘计：回合开始时，若你已受伤，你摸X张牌（X为你已损失的体力值）。贞烈：你成为其他角色【杀】或非延时锦囊牌的目标时，可失去1点体力并弃其一张手牌，令此牌对你无效。',
    gender: 'female',
  },
  {
    id: 'bulianshi',
    name: '步练师',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/步练师.webp',
    description: '无冕之后',
    skillName: '安恤 / 追忆',
    skillDesc: '安恤：出牌阶段限一次，选择两名手牌数不同的其他角色，令手牌少者获得手牌多者一张牌；若之后两人手牌数相等，你摸一张牌。追忆：你死亡时，可令一名其他角色摸三张牌。',
    gender: 'female',
  },
  // —— 标准包补员 ——
  {
    id: 'zhangliao',
    name: '张辽',
    kingdom: '魏',
    maxHp: 4,
    avatarUrl: 'images/heroes/张辽.webp',
    description: '威震逍遥津',
    skillName: '突袭',
    skillDesc: '摸牌阶段，你可以不摸牌，改为获得至多两名其他角色的各一张手牌。',
    gender: 'male',
  },
  {
    id: 'xuchu',
    name: '许褚',
    kingdom: '魏',
    maxHp: 4,
    avatarUrl: 'images/heroes/许褚.webp',
    description: '虎痴',
    skillName: '裸衣',
    skillDesc: '摸牌阶段，你可以少摸一张牌；本回合你的【杀】与【决斗】伤害+1（手中有杀或决斗时自动发动）。',
    gender: 'male',
  },
  {
    id: 'guojia',
    name: '郭嘉',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/郭嘉.webp',
    description: '早终的先知',
    skillName: '天妒 / 遗计',
    skillDesc: '天妒：你的判定牌生效后获得之。遗计：你受到伤害后摸两张牌。',
    gender: 'male',
  },
  {
    id: 'machao',
    name: '马超',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/马超.webp',
    description: '一骑当千',
    skillName: '马术 / 铁骑',
    skillDesc: '马术：你计算与其他角色的距离-1。铁骑：你使用【杀】指定目标后判定，若为红色，目标不能使用【闪】。',
    gender: 'male',
  },
  {
    id: 'zhugeliang',
    name: '诸葛亮',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/诸葛亮.webp',
    description: '卧龙',
    skillName: '观星 / 空城',
    skillDesc: '观星：回合开始时观看牌堆顶三张牌并调整顺序。空城：你没有手牌时不能成为【杀】或【决斗】的目标。',
    gender: 'male',
  },
  {
    id: 'huanggai',
    name: '黄盖',
    kingdom: '吴',
    maxHp: 4,
    avatarUrl: 'images/heroes/黄盖.webp',
    description: '轻身为国',
    skillName: '苦肉',
    skillDesc: '出牌阶段，你可以失去1点体力，然后摸两张牌。',
    gender: 'male',
  },
  {
    id: 'luxun',
    name: '陆逊',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/陆逊.webp',
    description: '儒生雄才',
    skillName: '谦逊 / 连营',
    skillDesc: '谦逊：你不能成为【顺手牵羊】和【乐不思蜀】的目标。连营：你失去最后一张手牌时摸一张牌。',
    gender: 'male',
  },
  {
    id: 'huatuo',
    name: '华佗',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/华佗.webp',
    description: '神医',
    skillName: '青囊 / 急救',
    skillDesc: '青囊：出牌阶段限一次，弃置一张手牌，令一名角色回复1点体力。急救：你的回合外，可将一张红色牌当【桃】使用。',
    gender: 'male',
  },
  // ===== 新增女将（7 名，技能均接入规则引擎）=====
  {
    id: 'guanyinping',
    name: '关银屏',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/关银屏.webp',
    description: '将门虎女',
    skillName: '血祭 / 虎啸',
    skillDesc: '血祭：出牌阶段限一次，弃置一张红色牌，对攻击范围内至多X名其他角色各造成1点伤害，这些角色各摸一张牌（X为你已损失的体力值）。虎啸：锁定技，你每造成一次伤害后，摸一张牌。',
    gender: 'female',
  },
  {
    id: 'zhangxingcai',
    name: '张星彩',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/张星彩.webp',
    description: '星之少女',
    skillName: '甚贤 / 枪舞',
    skillDesc: '甚贤：每名角色的回合限一次，你的回合外，当其他角色因弃置而失去牌且其中有基本牌时，你可以摸一张牌。枪舞：出牌阶段限一次，你可以进行判定；直到回合结束，你使用点数小于判定结果的【杀】无距离限制，使用点数大于判定结果的【杀】不计入使用次数。',
    gender: 'female',
  },
  {
    id: 'bianfuren',
    name: '卞夫人',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/卞夫人.webp',
    description: '母仪天下',
    skillName: '挽危',
    skillDesc: '挽危：每回合限一次，当你的牌被其他角色弃置或获得后，你可以从牌堆获得一张同名牌；没有同名牌则改为摸一张牌。',
    gender: 'female',
  },
  {
    id: 'zhugeguo',
    name: '诸葛果',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/诸葛果.webp',
    description: '羽化登仙',
    skillName: '祈禳 / 羽化',
    skillDesc: '祈禳：当一张装备牌置入你的装备区后，你从牌堆获得一张锦囊牌；牌堆中没有锦囊牌则改为摸一张牌。羽化：锁定技，非基本牌不计入手牌上限（本作实现部分；结束阶段的观顶分支尚未实现）。',
    gender: 'female',
  },
  {
    id: 'caojie',
    name: '曹节',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/曹节.webp',
    description: '汉室皇后',
    skillName: '守玺 / 惠民',
    skillDesc: '守玺：当你成为【杀】的目标后，可声明一种未以此法声明过的基本牌或锦囊牌牌名（本作固定声明【杀】），除非使用者弃置一张你声明的牌并获得你的一张牌，否则此【杀】无效。惠民：结束阶段，你可以摸X张牌（X为手牌数小于体力值的角色数），然后依次交给这些角色各一张手牌。',
    gender: 'female',
  },
  {
    id: 'fuhuanghou',
    name: '伏皇后',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/伏皇后.webp',
    description: '汉献帝皇后',
    skillName: '惴恐 / 求援',
    skillDesc: '惴恐：其他角色的回合开始时，若你已受伤，你可以与其拼点；若你赢，该角色本回合跳过出牌阶段；若你没赢，该角色本回合与你的距离视为1。求援：当你成为【杀】的目标时，你可以指定另一名其他角色，除非该角色交给你一张【闪】，否则其也成为此【杀】的目标。',
    gender: 'female',
  },
  {
    id: 'mayunlu',
    name: '马云禄',
    kingdom: '群',
    maxHp: 4,
    avatarUrl: 'images/heroes/马云禄.webp',
    description: '马踏西凉',
    skillName: '凤魄 / 马术',
    skillDesc: '凤魄：你在回合内使用第一张【杀】或【决斗】仅指定唯一目标后，你可选择一项：1.你摸X张牌；2.此牌的伤害+X（X为该目标的方块手牌数）。本作仅覆盖【杀】。马术：锁定技，你计算与其他角色的距离-1。',
    gender: 'female',
  },
  // —— 第五轮新增 30 名女性武将（技能文本取自三国杀移动版官网 hero-detail 页，pending: 技能实装中） ——
  {
    id: 'sunru',
    name: '孙茹',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/孙茹.webp',
    description: '陆逊之妻',
    skillName: '影箭 / 释衅',
    skillDesc: '影箭：准备阶段，你可以视为使用一张无距离限制的【杀】。释衅：锁定技，你不会受到火焰伤害。',
    gender: 'female',
  },
  {
    id: 'lingju',
    name: '灵雎',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/灵雎.webp',
    description: '吕布与貂蝉之女',
    skillName: '竭缘 / 焚心',
    skillDesc: '竭缘：当你对其他角色造成伤害时，若其体力值不小于你，则你可以弃置一张黑色手牌，然后此伤害+1；当你受到其他角色造成的伤害时，若其体力值不小于你，则你可以弃置一张红色手牌，然后此伤害-1。焚心：限定技，当你杀死了一名角色时，若你不为主公，则你可以与其交换身份牌。',
    gender: 'female',
  },
  {
    id: 'hetaishou',
    name: '何太后',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/何太后.webp',
    description: '汉灵帝皇后',
    skillName: '鸩毒 / 戚乱',
    skillDesc: '鸩毒：其他角色的出牌阶段开始时，你可以弃置一张手牌。若如此做，该角色视为使用一张【酒】，然后你对其造成1点伤害。戚乱：一名角色的回合结束时，你每于此回合内杀死过一名其他角色，你便摸三张牌。',
    gender: 'female',
  },
  {
    id: 'sunluyu',
    name: '孙鲁育',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/孙鲁育.webp',
    description: '孙权与步练师之女',
    skillName: '穆穆 / 魅步',
    skillDesc: '穆穆：出牌阶段开始时，你可以选择一项：弃置场上的一张装备牌；获得场上的一张防具牌，然后你本回合不能使用或打出【杀】。魅步：其他角色的出牌阶段开始时，若你在其攻击范围内，你可以弃置一张牌，然后其本回合获得“止息”（锁定技，出牌阶段，你至多使用X张牌（X为你的体力值）。你使用锦囊牌后，结束出牌阶段。）。若你以此法弃置的牌不是【杀】或黑色锦囊牌，则本回合其与你距离为1。',
    gender: 'female',
  },
  {
    id: 'wuguotai',
    name: '吴国太',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/吴国太.webp',
    description: '孙坚次妻',
    skillName: '甘露 / 补益',
    skillDesc: '甘露：出牌阶段限一次，你可以选择两名装备区里的牌数之差不大于你已损失体力值数的角色，交换他们装备区里的牌。补益：当一名角色进入濒死状态时，你可以展示其一张手牌，然后若此牌不为基本牌，则该角色弃置此牌，然后回复1点体力。',
    gender: 'female',
  },
  {
    id: 'caifuren',
    name: '蔡夫人',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/蔡夫人.webp',
    description: '刘表后妻',
    skillName: '窃听 / 献州',
    skillDesc: '窃听：其他角色的回合结束时，若其没有于此回合内使用过牌指定除自己以外的角色为目标，则你可以选择一项：1.将其装备区里的一张牌置入你的装备区；2.摸一张牌。献州：限定技，出牌阶段，你可以将装备区里的所有牌交给一名其他角色，然后该角色选择一项：1.令你回复X点体力；2.对其攻击范围内的至多X名角色各造成1点伤害(X为你以此法交给该角色的牌的数量)。',
    gender: 'female',
  },
  {
    id: 'xiahoushi',
    name: '夏侯氏',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/夏侯氏.webp',
    description: '张飞之妻',
    skillName: '樵拾 / 燕语',
    skillDesc: '樵拾：其他角色的结束阶段，若其手牌数等于你，你可以与其各摸一张牌。燕语：出牌阶段，你可以重铸【杀】；出牌阶段结束时，若你于此阶段内重铸过两张或更多的【杀】，则你可以令一名男性角色摸两张牌。',
    gender: 'female',
  },
  {
    id: 'dongbai',
    name: '董白',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/董白.webp',
    description: '董卓孙女',
    skillName: '连诛 / 黠慧',
    skillDesc: '连诛：出牌阶段限一次，你可以展示并交给一名其他角色一张牌，若该牌为黑色，其选择一项：1.你摸两张牌；2.弃置两张牌。黠慧：锁定技，你的黑色牌不占用手牌上限；其他角色获得你的黑色牌时，其不能使用、打出、弃置这些牌直到其受到伤害或流失体力导致体力值减少为止。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'zhaoxiang',
    name: '赵襄',
    kingdom: '蜀',
    maxHp: 4,
    avatarUrl: 'images/heroes/赵襄.webp',
    description: '赵云之女',
    skillName: '芳魂 / 扶汉',
    skillDesc: '芳魂：当你使用【杀】造成伤害后，你获得1个“梅影”标记；你可以移去1个“梅影”标记来发动“龙胆”并于相应结算后摸一张牌。扶汉：限定技，回合开始时，如果你拥有过“梅影”标记，你可以发动技能，移去所有“梅影”标记，随机观看五名未登场的蜀势力角色，将武将牌替换为其中一名角色，并将体力上限数调整为本局游戏中移去“梅影”标记的数量（至多为游戏人数），然后若你是体力值最低的角色，你回复1点体力。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'guohuanghou',
    name: '郭皇后',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/郭皇后.webp',
    description: '曹叡皇后',
    skillName: '矫诏 / 殚心',
    skillDesc: '矫诏：1级：出牌阶段限一次，你可以展示一张手牌，然后令你距离最近的角色声明一种基本牌。本回合你可将此手牌当声明的牌使用（不能对自己使用）。2级：出牌阶段限一次，你可以展示一张手牌，然后令你距离最近的角色声明一种基本牌或普通锦囊牌。本回合你可将此手牌当声明的牌使用（不能对自己使用）。3级：出牌阶段限一次，你可以展示一张手牌，然后声明一种基本牌或普通锦囊牌。本回合你可以将一张手牌当任意一种基本牌或普通锦囊牌使用（不能对自己使用）。殚心：当你受到伤害后，你可以摸一张牌，或升级“矫诏”（可被升级两次）。',
    gender: 'female',
  },
  {
    id: 'xinxianying',
    name: '辛宪英',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/辛宪英.webp',
    description: '曹魏才女',
    skillName: '忠鉴 / 才识',
    skillDesc: '忠鉴：出牌阶段限一次，你可以展示一张手牌，然后展示一名其他角色X张手牌（X为其手牌数减体力值）。对比你与其展示的牌，若包含：颜色相同，你摸一张牌或弃置其一张牌；点数相同，本回合此技能改为"限两次"；都不同，你的手牌上限-1。才识：摸牌阶段，你可以选择一项：1.手牌上限+1，然后本回合你不能对其他角色使用牌；2.回复1点体力，然后本回合你不能对自己使用牌。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'wuxian',
    name: '吴苋',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/吴苋.webp',
    description: '刘备皇后',
    skillName: '福绵 / 怠宴',
    skillDesc: '福绵：准备阶段，你可以选择一项：1.摸牌阶段多摸一张牌；2.使用红色基本牌或红色普通锦囊牌可以多选择一个目标（限一次，不限制距离）。若与你上回合选择的选项不同，则该选项数值+1并复原此技能。怠宴：结束阶段，你可以令一名其他角色从牌堆中获得一张红桃基本牌，然后若其于上回合成为过该技能目标，其失去1点体力。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'xushi',
    name: '徐氏',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/徐氏.webp',
    description: '孙翊之妻',
    skillName: '问卦 / 伏诛',
    skillDesc: '问卦：所有角色出牌阶段限一次，其可以交给你一张牌，然后你可以将此牌置于牌堆顶或牌堆底，你与其从另一端摸一张牌。伏诛：一名男性角色的结束阶段内，若牌堆剩余牌数小于等于你体力值的十倍，则你可以依次对其使用牌堆中X张【杀】（X为场上人数，若牌堆中【杀】不足则全部使用）。然后将牌堆重新洗牌。',
    gender: 'female',
  },
  {
    id: 'sunluban',
    name: '孙鲁班',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/孙鲁班.webp',
    description: '孙权长女',
    skillName: '谮毁 / 骄矜',
    skillDesc: '谮毁：出牌阶段限一次，当你使用【杀】或黑色普通锦囊牌仅指定唯一目标时，你可令能成为此牌目标的另一名角色选择一项：1.交给你一张牌，然后代替你成为此牌的使用者；2.也成为此牌的目标。骄矜：当你受到男性角色造成的伤害时，你可以弃置一张装备牌，然后此伤害-1。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'wangyuanji',
    name: '王元姬',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/王元姬.webp',
    description: '司马昭之妻',
    skillName: '谦冲 / 尚俭',
    skillDesc: '谦冲：锁定技，如果你的装备区所有牌均为黑色，则你获得“帷幕”（锁定技，你不能被选择为黑色锦囊牌的目标）；如果你的装备区所有牌均为红色，则你获得“明哲”（当你于回合外因使用、打出或弃置而失去红色牌时，你可以摸一张牌）。出牌阶段开始时，若你不满足上述条件，则你选择一种类型的牌，本回合使用此类型的牌无次数和距离限制。尚俭：锁定技，任一角色的结束阶段，若你于此回合失去的牌不大于你的体力值，你可以摸等同于失去数量的牌。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'baosanniang',
    name: '鲍三娘',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/鲍三娘.webp',
    description: '关索之妻',
    skillName: '姝勇 / 许身 / 镇南',
    skillDesc: '姝勇：当你使用或打出【杀】时，你可以获得一名其他角色区域内的一张牌；若如此做，其摸一张牌。许身：限定技，出牌阶段，你可以失去等同场上存活男性角色数的体力值；若你因此进入濒死状态，则你脱离濒死状态后，你可令使你脱离濒死的角色获得“武圣”（你可以将一张红色牌当【杀】使用或打出）、“当先”（锁定技，回合开始时，你执行一个额外的出牌阶段）。镇南：当一张牌指定多个目标后，若你为此牌目标之一且此牌指定目标数大于使用者当前体力值，则你可以弃置一张牌，对此牌使用者造成1点伤害。',
    gender: 'female',
  },
  {
    id: 'beimihu',
    name: '卑弥呼',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/卑弥呼.webp',
    description: '邪马台女王',
    skillName: '纵傀 / 骨疽 / 拜假',
    skillDesc: '纵傀：回合开始时，你可以选择一名没有“傀”标记的其他角色，令其获得“傀”标记。每轮游戏开始时，你令体力值最少且没有“傀”标记的一名其他角色获得“傀”标记。骨疽：锁定技，拥有“傀”标记的角色受到伤害后，你摸一张牌并获得一个“疽”标记。拜假：觉醒技，准备阶段，若你的“疽”标记数不小于7，则你增加1点体力上限，回复1点体力，然后令所有未拥有“傀”标记的其他角色获得“傀”标记，最后失去技能“骨疽”，并获得技能“蚕食”（一名角色使用基本牌或普通锦囊牌指定你为唯一目标时，若其有“傀”标记，你可以取消之，然后其失去“傀”标记；你使用基本牌或普通锦囊牌仅指定一名角色为目标时，你可以额外指定任意名带有“傀”标记的角色为目标，然后其失去“傀”标记）。',
    gender: 'female',
  },
  {
    id: 'caoying',
    name: '曹婴',
    kingdom: '魏',
    maxHp: 4,
    avatarUrl: 'images/heroes/曹婴.webp',
    description: '曹操孙女',
    skillName: '凌人 / 伏间',
    skillDesc: '凌人：出牌阶段限一次，当你使用【杀】或伤害类锦囊牌指定目标后，你可以猜测其中一个目标是否有基本牌、锦囊牌或装备牌类型的手牌。至少猜对一项则此牌对其伤害+1；至少猜对两项则你摸两张牌；猜对三项则你获得“奸雄”（当你受到伤害后，你可以获得造成此伤害的牌）和“行殇”（当其他角色死亡时，你可以获得其所有的牌）直到你下回合开始。伏间：锁定技，结束阶段，若全场角色均有手牌，你随机观看一名其他角色的X张手牌（X为全场手牌数最少的角色手牌数）。',
    gender: 'female',
  },
  {
    id: 'hujinding',
    name: '胡金定',
    kingdom: '蜀',
    maxHp: 6,
    avatarUrl: 'images/heroes/胡金定.webp',
    description: '关羽之妻（传说）',
    skillName: '仁释 / 武缘 / 怀子',
    skillDesc: '仁释：锁定技，当你于已受伤的状态下受到【杀】造成的伤害时，你防止此伤害并获得此【杀】，然后扣减1点体力上限。武缘：出牌阶段限一次，你可以交给一名其他角色一张【杀】，然后你回复1点体力，其摸一张牌；若此【杀】为红色，则其额外回复1点体力；若此【杀】为属性【杀】，则其额外摸一张牌。怀子：锁定技，你的手牌上限等于你的体力上限。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'ganfuren',
    name: '甘夫人',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/甘夫人.webp',
    description: '刘备之妻',
    skillName: '淑慎 / 神智',
    skillDesc: '淑慎：当你回复1点体力后，你可以令一名其他角色摸一张牌。神智：准备阶段，你可以弃置所有手牌，若你以此法弃置的手牌数不小于你的体力值，你回复1点体力。',
    gender: 'female',
  },
  {
    id: 'zoushi',
    name: '邹氏',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/邹氏.webp',
    description: '张济之妻',
    skillName: '祸水 / 倾城',
    skillDesc: '祸水：出牌阶段，你可以明置此武将牌；你的回合内，其他角色不能明置其武将牌。倾城：出牌阶段，你可以弃置一张黑色牌并选择一名武将牌均明置的其他角色，然后你暗置其一张武将牌。然后若你以此法弃置的牌是装备牌，则你可以再选择另一名武将牌均明置的其他角色，暗置其一张武将牌。',
    gender: 'female',
  },
  {
    id: 'mifuren',
    name: '糜夫人',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/糜夫人.webp',
    description: '刘备之妻',
    skillName: '闺秀 / 存嗣',
    skillDesc: '闺秀：当你明置此武将牌时，你可以摸两张牌；当你移除此武将牌时，你可以回复1点体力。存嗣：出牌阶段，你可以移除此武将牌并选择一名角色，然后其获得技能“勇决”（若与你势力相同的一名角色于其回合内使用的第一张牌为【杀】，则该角色可以在此【杀】结算完成后获得之），若你没有获得“勇决”，则获得“勇决”的角色摸两张牌。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'zhoufei',
    name: '周妃',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/周妃.webp',
    description: '周瑜之女',
    skillName: '良姻 / 箜声',
    skillDesc: '良姻：当有牌被置于武将牌上时，你可以令手牌数大于你的一名角色摸一张牌；当任意角色获得一名角色武将牌上的牌时，你可以令手牌数小于你的一名角色弃置一张牌。箜声：准备阶段，你可以将任意张牌置于武将牌上。结束阶段，你使用其中的装备牌，并获得剩余的牌。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'zhangqiying',
    name: '张琪瑛',
    kingdom: '群',
    maxHp: 3,
    avatarUrl: 'images/heroes/张琪瑛.webp',
    description: '张鲁之女',
    skillName: '法箓 / 真仪 / 点化',
    skillDesc: '法箓：锁定技，当你的牌因弃置而移至弃牌堆后，根据这些牌的花色，你获得对应标记：黑桃牌，你获得1枚“紫微”；梅花牌，你获得1枚“后土”；红桃牌，你获得1枚“玉清”；方块牌，你获得1枚“勾陈”（每种标记限拥有一个）。游戏开始时，你获得以上四种标记。真仪：你可以在以下时机弃置相应的标记来发动以下效果：1.当一张判定牌生效前，你可以弃置“紫微”，然后将判定结果改为黑桃5或红桃5；2.当你处于濒死状态时，你可以弃置“后土”，然后将你的一张手牌当【桃】使用；3.当你造成伤害时，你可以弃置“玉清”，然后你进行判定。若结果为黑色，此伤害+1；4.当你受到属性伤害后，你可以弃置“勾陈”，然后你从牌堆或弃牌堆中随机获得三种类型的牌各一张。点化：准备阶段或结束阶段，你可以观看牌堆顶的X张牌（X为你的标记数）。若如此做，你将这些牌以任意顺序放回牌堆顶。',
    gender: 'female',
  },
  {
    id: 'yanghuiyu',
    name: '羊徽瑜',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/羊徽瑜.webp',
    description: '司马师之妻',
    skillName: '弘仪 / 劝封',
    skillDesc: '弘仪：出牌阶段限一次，你可以指定一名其他角色，直至你的下个回合开始时，该角色造成伤害时进行一次判定：若为红色则受伤角色摸一张牌；若为黑色则此伤害-1。劝封：限定技，当一名其他角色死亡后，你可以失去技能“弘仪”，然后获得其武将牌的所有技能（主公技除外），若如此做，你加1点体力上限，回复1点体力。当你处于濒死状态时，你可以加2点体力上限，回复4体力。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'caizhenji',
    name: '蔡贞姬',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/蔡贞姬.webp',
    description: '蔡邕之女',
    skillName: '舍裔 / 天音',
    skillDesc: '舍裔：每轮限一次，当一名其他角色受到伤害时，若其体力值小于你，你可以将至少X张牌交给该角色（X为你的体力值）。若如此做，你防止此伤害。天音：锁定技，结束阶段，你从牌堆中获得本回合未使用过的牌类型的各一张牌。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'huaman',
    name: '花鬘',
    kingdom: '蜀',
    maxHp: 3,
    avatarUrl: 'images/heroes/花鬘.webp',
    description: '孟获之女',
    skillName: '象阵 / 芳踪 / 嬉战',
    skillDesc: '象阵：锁定技，【南蛮入侵】对你无效；【南蛮入侵】结算结束后，若此牌造成过伤害，你与伤害来源各摸一张牌。芳踪：锁定技，出牌阶段，你使用伤害类的牌不能指定你攻击范围内的角色为目标。攻击范围内含有你的其他角色使用伤害类卡牌时，不能指定你为目标。结束阶段，你将手牌摸至X张（X为场上存活人数）。嬉战：锁定技，其他角色回合开始时，你须弃一张牌并令你本回合“芳踪”失效，或流失1点体力。若你以此法弃置了牌，根据弃置牌的花色，执行以下效果：黑桃，其视为使用一张【酒】；红桃，你视为使用【无中生有】；梅花，你视为对其使用【铁索连环】；方块，你视为对其使用一张无距离限制的【火杀】。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'sunhanhua',
    name: '孙寒华',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/孙寒华.webp',
    description: '东吴女仙',
    skillName: '冲虚 / 妙剑 / 莲华',
    skillDesc: '冲虚：出牌阶段限一次，你可以进行一次“集灵”来获得分数，然后你可以用分数来升级“妙剑”、升级“莲华”或摸牌。妙剑：1级，出牌阶段限一次，你可以将一张【杀】当做【刺杀】使用，或将一张锦囊牌当做【无中生有】使用；2级，出牌阶段限一次，你可以将一张基本牌当做【刺杀】使用，或将一张非基本牌当做【无中生有】使用；3级，出牌阶段限一次，你可以视为使用了一张【刺杀】或视为使用了一张【无中生有】。莲华：1级，你成为其他角色使用【杀】的目标时，你摸一张牌。2级，你成为其他角色使用【杀】的目标时，你摸一张牌，然后进行一次判定，若判定结果为黑桃，则取消之。3级，你成为其他角色使用【杀】的目标时，你摸一张牌，除非该角色弃置一张牌，否则取消之。',
    gender: 'female',
  },
  {
    id: 'zhangchangpu',
    name: '张昌蒲',
    kingdom: '魏',
    maxHp: 3,
    avatarUrl: 'images/heroes/张昌蒲.webp',
    description: '钟繇之妾',
    skillName: '抵诽 / 严教',
    skillDesc: '抵诽：当你受到伤害后，你摸牌或弃牌，然后展示手牌，若均没有与造成伤害的牌花色相同的牌，则你回复1点体力。严教：你可将手牌中某花色的所有牌交给一名其他角色，然后你对其造成伤害。下回合开始时，你摸等同于交出数量的牌。',
    gender: 'female',
    pending: true,
  },
  {
    id: 'luyusheng',
    name: '陆郁生',
    kingdom: '吴',
    maxHp: 3,
    avatarUrl: 'images/heroes/陆郁生.webp',
    description: '陆绩之女',
    skillName: '润微 / 霜怀',
    skillDesc: '润微：出牌阶段限一次，你可以展示牌堆顶至多五张牌，令一名角色获得其中一种颜色的所有牌。若如此做：1.每阶段限一次，你失去X张牌后（X为其因此获得的牌数），该技能可以再次发动且不能指定本回合获得过牌的角色为目标；2.本阶段结束时，你弃置以此法获得的手牌。霜怀：每回合限一次，当与你距离1以内的其他角色受到伤害时，你可以选择一项：防止此伤害；令其从弃牌堆中获得一张【桃】。若该角色与你上一次发动时：相同，你与其各摸一张牌；不同，你失去1点体力。',
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
// 尚未入池的军争武器：古锭刀、朱雀羽扇（后续补齐）。
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
  // 属性杀：牌名仍是【杀】，靠 attribute 标记火焰/雷电伤害
  const addElementSha = (attribute: 'fire' | 'thunder', list: Array<[Suit, string]>) => list.forEach(([suit, rank]) => {
    deck.push({
      id: `card-${idCounter++}`,
      name: CardName.SHA,
      type: CardType.BASIC,
      suit,
      rank,
      value: 0,
      description: attribute === 'fire' ? '对攻击范围内的一名角色造成1点火焰伤害。' : '对攻击范围内的一名角色造成1点雷电伤害。',
      imageColor: attribute === 'fire' ? 'from-orange-700 to-red-900' : 'from-indigo-700 to-purple-900',
      attribute,
    });
  });

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
  // 火杀 5 / 雷杀 9（军争属性杀）
  addElementSha('fire', [[H, '4'], [H, '7'], [H, '10'], [D, '4'], [D, '5']]);
  addElementSha('thunder', [[S, '4'], [S, '5'], [S, '6'], [S, '7'], [S, '8'], [C, '5'], [C, '6'], [C, '7'], [C, '8']]);

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

  // ===== 装备牌（22）=====
  addEquipAll(CardName.ZHUGE, [[C, 'A'], [D, 'A']]);
  addEquipAll(CardName.QINGGANG, [[S, '6']]);
  addEquipAll(CardName.QINGLONG, [[S, '5']]);
  addEquipAll(CardName.FANGTIAN, [[D, 'Q']]);
  addEquipAll(CardName.ZHANGBA, [[S, 'Q']]);
  addEquipAll(CardName.GUANSHI, [[D, '5']]);
  addEquipAll(CardName.CIXIONG, [[S, '2']]);
  addEquipAll(CardName.HANBING, [[S, '2']]);
  addEquipAll(CardName.QILIN, [[H, '5']]);
  addEquipAll(CardName.BAGUA, [[S, '2'], [C, '2']]);
  addEquipAll(CardName.RENWANG, [[C, '2']]);
  addEquipAll(CardName.TENGJIA, [[S, '2'], [C, '2']]);
  addEquipAll(CardName.BAIYIN, [[C, 'A']]);
  addEquipAll(CardName.CHITU, [[H, '5']]);
  addEquipAll(CardName.DAWAN, [[S, 'K']]);
  addEquipAll(CardName.ZIXING, [[D, 'K']]);
  addEquipAll(CardName.DILU, [[C, '5']]);
  addEquipAll(CardName.JUEYING, [[S, '5']]);
  addEquipAll(CardName.ZHUAHUANG, [[H, 'K']]);

  // 洗切后共 159 张（基本 85 + 锦囊 52 + 装备 22）
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