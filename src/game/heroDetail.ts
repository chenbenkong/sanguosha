import { Hero } from '../../types';

/** 官方武将牌上的技能类型标签 */
export type SkillTag = '锁定技' | '限定技' | '觉醒技' | '主动技' | '被动技' | '主公技';

export interface SkillMeta {
  /** 类型标签（可多个，如「主动技/转化」） */
  tags: SkillTag[];
  /** 触发时机（官方风格的一句话） */
  timing: string;
  /** 官方风格技能台词 */
  quote: string;
}

/** 59 个已实现技能的元信息：类型 / 触发时机 / 台词。
 *  只收录本作规则引擎真实实现的技能，未实现的技能不在此表、详情页也不会列出。 */
export const SKILL_META: Record<string, SkillMeta> = {
  奸雄: { tags: ['被动技'], timing: '受到伤害后', quote: '宁教我负天下人，休教天下人负我！' },
  护驾: { tags: ['主公技'], timing: '当你需要使用或打出【闪】时', quote: '众将听令，护我周全！' },
  仁德: { tags: ['主动技'], timing: '出牌阶段', quote: '惟贤惟德，能服于人。' },
  激将: { tags: ['主公技'], timing: '当你需要使用或打出【杀】时', quote: '蜀中儿郎，随我出战！' },
  制衡: { tags: ['主动技'], timing: '出牌阶段', quote: '容我三思，再做定夺。' },
  救援: { tags: ['主公技'], timing: '其他吴势力角色对你使用【桃】时', quote: '江东子弟，同气连枝。' },
  无双: { tags: ['锁定技'], timing: '常时生效', quote: '神挡杀神，佛挡杀佛！' },
  龙胆: { tags: ['主动技', '被动技'], timing: '需要使用或打出【杀】/【闪】时', quote: '吾乃常山赵子龙也！' },
  武圣: { tags: ['主动技', '被动技'], timing: '出牌阶段 / 需要使用【杀】时', quote: '观尔乃插标卖首。' },
  反馈: { tags: ['被动技'], timing: '受到伤害后', quote: '天意难违，人心可测。' },
  离间: { tags: ['主动技'], timing: '出牌阶段', quote: '夫君，你要替妾身做主啊。' },
  闭月: { tags: ['被动技'], timing: '回合结束时', quote: '月下美人，独倚阑干。' },
  咆哮: { tags: ['锁定技'], timing: '出牌阶段', quote: '燕人张飞在此，谁敢决一死战！' },
  烈弓: { tags: ['锁定技'], timing: '使用【杀】指定目标后', quote: '百步穿杨，例不虚发！' },
  刚烈: { tags: ['被动技'], timing: '受到伤害后', quote: '宁可战死，绝不后退！' },
  英姿: { tags: ['被动技'], timing: '摸牌阶段', quote: '尔等竖子，不足与谋。' },
  反间: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '猜猜看，哪一张才是真的？' },
  倾国: { tags: ['主动技', '被动技'], timing: '需要使用或打出【闪】时', quote: '北方有佳人，绝世而独立。' },
  洛神: { tags: ['被动技'], timing: '回合开始时', quote: '仿佛兮若轻云之蔽月，飘飖兮若流风之回雪。' },
  集智: { tags: ['被动技'], timing: '使用锦囊牌时', quote: '巧夺天工，妙不可言。' },
  奇才: { tags: ['锁定技'], timing: '使用锦囊牌时', quote: '奇谋妙计，可安天下。' },
  枭姬: { tags: ['被动技'], timing: '失去装备区的牌时', quote: '弓腰姬孙尚香，在此！' },
  结姻: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '愿得一心人，白首不相离。' },
  绝情: { tags: ['锁定技'], timing: '你造成伤害时', quote: '人当有信，何故相欺。' },
  伤逝: { tags: ['被动技'], timing: '回合结束时', quote: '逝者如斯，不胜悲戚。' },
  巨象: { tags: ['锁定技'], timing: '成为【南蛮入侵】目标时', quote: '南蛮之勇，可破千军！' },
  烈刃: { tags: ['被动技'], timing: '你的【杀】造成伤害后', quote: '刀锋所向，寸草不留！' },
  流离: { tags: ['被动技'], timing: '你成为【杀】的目标时', quote: '妾身薄命，望君怜惜。' },
  国色: { tags: ['主动技', '被动技'], timing: '出牌阶段', quote: '国色天香，倾国倾城。' },
  红颜: { tags: ['锁定技'], timing: '判定时生效', quote: '红颜薄命，天妒英才。' },
  天香: { tags: ['被动技'], timing: '受到伤害时', quote: '芙蓉不及美人妆，水殿风来珠翠香。' },
  悲歌: { tags: ['被动技'], timing: '一名角色受到【杀】伤害后', quote: '胡笳十八拍，声声断人肠。' },
  断肠: { tags: ['锁定技'], timing: '你死亡时', quote: '肝肠寸断，此恨绵绵。' },
  奇袭: { tags: ['主动技', '被动技'], timing: '出牌阶段', quote: '锦帆过处，寸草不生！' },
  克己: { tags: ['被动技'], timing: '弃牌阶段前', quote: '圣人之道，以静制动。' },
  秘计: { tags: ['被动技'], timing: '回合开始时', quote: '谋定而后动，知止而有得。' },
  贞烈: { tags: ['被动技'], timing: '你成为【杀】或非延时锦囊牌的目标时', quote: '宁为玉碎，不为瓦全！' },
  安恤: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '温柔敦厚，安抚人心。' },
  追忆: { tags: ['被动技'], timing: '你死亡时', quote: '往事如烟，唯余追忆。' },
  突袭: { tags: ['被动技'], timing: '摸牌阶段（可改为获得他人手牌）', quote: '冲阵斩将，威震逍遥津！' },
  裸衣: { tags: ['被动技'], timing: '摸牌阶段', quote: '谁来与我决一死战！' },
  天妒: { tags: ['被动技'], timing: '你的判定牌生效后', quote: '天妒英才，命不由人。' },
  遗计: { tags: ['被动技'], timing: '受到伤害后', quote: '此计可安天下，可惜天不假年。' },
  马术: { tags: ['锁定技'], timing: '常时生效', quote: '西凉铁骑，来去如风！' },
  铁骑: { tags: ['被动技'], timing: '使用【杀】指定目标后', quote: '铁骑所至，片甲不留！' },
  观星: { tags: ['被动技'], timing: '回合开始时', quote: '观今夜天象，知天下大事。' },
  空城: { tags: ['锁定技'], timing: '你没有手牌时', quote: '瑶琴三尺胜雄师，诸葛西城退敌时。' },
  苦肉: { tags: ['主动技'], timing: '出牌阶段', quote: '为报君恩，甘受苦刑！' },
  谦逊: { tags: ['锁定技'], timing: '常时生效', quote: '谦谦君子，温润如玉。' },
  连营: { tags: ['被动技'], timing: '你失去最后一张手牌时', quote: '火烧连营七百里，蜀军大败！' },
  青囊: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '悬壶济世，医者仁心。' },
  急救: { tags: ['被动技'], timing: '你的回合外', quote: '生死人，肉白骨。' },
  虎啸: { tags: ['锁定技'], timing: '你造成伤害后', quote: '虎父之后，岂可示弱！' },
  枪舞: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '枪出如龙，风雨不透！' },
  挽危: { tags: ['被动技'], timing: '你的牌被其他角色弃置或获得后', quote: '临危不乱，扶大厦之将倾。' },
  祈禳: { tags: ['被动技'], timing: '装备牌置入你的装备区后', quote: '祈禳星辰，羽化而登仙。' },
  惠民: { tags: ['主动技'], timing: '结束阶段', quote: '母仪天下，泽被万民。' },
  求援: { tags: ['被动技'], timing: '你成为【杀】的目标时', quote: '君辱臣死，妾愿相随。' },
};

export interface HeroProfile {
  /** 武将包 / 版本定位 */
  pack: string;
  /** 定位标签 */
  roles: string[];
  /** 难度 1~5 星 */
  difficulty: number;
  /** 实战提示（自写，非攻略原文） */
  tip: string;
}

/** 39 名武将的定位与难度。技能文本一律来自 constants.ts 的实际实现。 */
export const HERO_PROFILES: Record<string, HeroProfile> = {
  曹操: { pack: '标准包', roles: ['控制', '续航'], difficulty: 2, tip: '受伤反而是收益：留好【杀】和锦囊，等被集火时用【奸雄】把关键牌收回来。' },
  刘备: { pack: '标准包', roles: ['辅助'], difficulty: 2, tip: '优先把牌分给缺牌的队友；一回合给出 2 张以上还能回血，别把牌攥在手里。' },
  孙权: { pack: '标准包', roles: ['爆发', '续航'], difficulty: 3, tip: '【制衡】把废牌换成新牌，尽量一次性弃够再摸，别只换一张。' },
  吕布: { pack: '标准包', roles: ['爆发'], difficulty: 1, tip: '5 点体力配合【无双】硬碰硬，优先找软目标连续施压。' },
  赵云: { pack: '标准包', roles: ['防御', '爆发'], difficulty: 2, tip: '手里的【闪】就是第二张【杀】，进攻与防守都能用同一套牌。' },
  关羽: { pack: '标准包', roles: ['爆发'], difficulty: 2, tip: '红牌即【杀】，留红桃/方块保底，缺杀时随时转化。' },
  司马懿: { pack: '标准包', roles: ['控制'], difficulty: 3, tip: '被打了不吃亏，【反馈】优先拿对方的关键牌（如装备、桃）。' },
  貂蝉: { pack: '标准包', roles: ['控制', '辅助'], difficulty: 3, tip: '用【离间】逼两名男性内耗，自己留【闪】等【闭月】补牌。' },
  张飞: { pack: '标准包', roles: ['爆发'], difficulty: 1, tip: '有杀就全打出去，一回合内尽量多消耗对手的【闪】。' },
  黄忠: { pack: '标准包', roles: ['爆发'], difficulty: 2, tip: '对满手牌的敌人用【杀】，【烈弓】能让对方连【闪】都用不了。' },
  夏侯惇: { pack: '标准包', roles: ['防御', '控制'], difficulty: 2, tip: '主动贴脸挨打换判定，红桃以外就能让对手掉血，适合换子。' },
  周瑜: { pack: '标准包', roles: ['爆发', '控制'], difficulty: 3, tip: '多摸的一张牌是启动资源；【反间】在对方手牌花色不明时命中率最高。' },
  甄姬: { pack: '标准包', roles: ['防御', '爆发'], difficulty: 3, tip: '黑牌全是【闪】，防御很稳；【洛神】黑色判定能连摸，开局就能滚雪球。' },
  黄月英: { pack: '标准包', roles: ['爆发'], difficulty: 2, tip: '锦囊越多收益越大，先用【集智】摸牌再连续输出，注意别断锦囊。' },
  孙尚香: { pack: '标准包', roles: ['续航', '辅助'], difficulty: 3, tip: '换装备时【枭姬】白赚两张牌；【结姻】优先救受伤的男性队友。' },
  张春华: { pack: '标准包', roles: ['控制', '爆发'], difficulty: 3, tip: '【绝情】让对方「失去体力」绕开【桃】以外的回复，压血线更稳。' },
  祝融: { pack: '标准包', roles: ['控制'], difficulty: 3, tip: '【南蛮入侵】对你是白赚的牌；【烈刃】拼点赢面取决于手牌点数，留大点。' },
  大乔: { pack: '标准包', roles: ['控制', '防御'], difficulty: 3, tip: '方块牌可当【乐不思蜀】废掉对手回合；【流离】把【杀】甩给下家。' },
  小乔: { pack: '标准包', roles: ['防御'], difficulty: 2, tip: '方块视为红桃，判定更稳；【天香】把伤害弹回伤害来源。' },
  蔡文姬: { pack: '标准包', roles: ['控制', '辅助'], difficulty: 3, tip: '【悲歌】按判定花色选收益，配合队友受【杀】伤害时价值最大。' },
  甘宁: { pack: '标准包', roles: ['控制'], difficulty: 2, tip: '黑牌就是拆牌工具，优先拆对方的武器和防具。' },
  吕蒙: { pack: '标准包', roles: ['续航'], difficulty: 3, tip: '本回合不打【杀】就能跳过弃牌，把牌囤到下一轮爆发。' },
  王异: { pack: '标准包', roles: ['控制', '防御'], difficulty: 4, tip: '受伤时【秘计】补牌滚雪球；【贞烈】用 1 点体力换掉关键牌。' },
  步练师: { pack: '标准包', roles: ['辅助', '控制'], difficulty: 3, tip: '【安恤】抢对手的牌给队友，注意让两人手牌数最终相等以触发摸牌。' },
  张辽: { pack: '标准包', roles: ['控制'], difficulty: 2, tip: '【突袭】直接拿两名对手的手牌，比摸未知牌更稳。' },
  许褚: { pack: '标准包', roles: ['爆发'], difficulty: 2, tip: '少摸一张换伤害 +1，手里有【杀】或【决斗】时再发动最划算。' },
  郭嘉: { pack: '标准包', roles: ['续航', '辅助'], difficulty: 2, tip: '【遗计】受伤摸两张，敢挨打就有牌；判定牌还能被【天妒】收回。' },
  马超: { pack: '标准包', roles: ['爆发', '控制'], difficulty: 2, tip: '【马术】拉近距离，【铁骑】判定红色时对方无法【闪】，专打关键目标。' },
  诸葛亮: { pack: '标准包', roles: ['控制', '防御'], difficulty: 4, tip: '【观星】优先把【杀】/【桃】放牌堆顶；空手时【空城】让你免疫【杀】与【决斗】。' },
  黄盖: { pack: '标准包', roles: ['爆发'], difficulty: 2, tip: '【苦肉】用 1 点体力换两张牌，残血时谨慎，别把自己送进濒死。' },
  陆逊: { pack: '标准包', roles: ['防御', '续航'], difficulty: 2, tip: '【谦逊】免疫顺手和乐；打光最后一张手牌就能【连营】再摸一张。' },
  华佗: { pack: '标准包', roles: ['辅助', '续航'], difficulty: 2, tip: '红牌留着当【桃】救人或自救；【青囊】每回合稳定回 1 血。' },
  关银屏: { pack: 'SP 武将', roles: ['爆发'], difficulty: 2, tip: '【虎啸】锁定收益：每次造成伤害就摸牌，越打越有牌，优先制造伤害。' },
  张星彩: { pack: 'SP 武将', roles: ['爆发', '控制'], difficulty: 3, tip: '先【枪舞】判定，再按点数分两批出【杀】：小点无距离限制、大点不计次数。' },
  卞夫人: { pack: 'SP 武将', roles: ['续航'], difficulty: 2, tip: '【挽危】专门补回被拆被顺的牌，装备和关键牌被弃时收益最大。' },
  诸葛果: { pack: 'SP 武将', roles: ['爆发', '辅助'], difficulty: 3, tip: '先上装备再触发【祈禳】拿锦囊，装备越多，锦囊连发越顺。' },
  曹节: { pack: 'SP 武将', roles: ['辅助'], difficulty: 3, tip: '【惠民】按缺牌人数摸牌再分发，队友越缺牌，整体收益越高。' },
  伏皇后: { pack: 'SP 武将', roles: ['防御', '控制'], difficulty: 3, tip: '【求援】把【杀】转给对手，逼其交【闪】或一起成为目标。' },
  马云禄: { pack: 'SP 武将', roles: ['爆发'], difficulty: 1, tip: '【马术】恒定减距离，4 点体力正面压制，优先贴脸输出。' },
  // 第 1 批实装女将
  孙茹: { pack: '新将·第1批', roles: ['爆发', '防御'], difficulty: 2, tip: '【影箭】每回合准备阶段白嫖一张无距离【杀】，优先打残血；火攻/火杀对你无效。' },
  何太后: { pack: '新将·第1批', roles: ['控制'], difficulty: 3, tip: '【鸩毒】在敌人出牌阶段前弃牌压血线，优先针对手牌少的敌人；【戚乱】靠击杀滚雪球。' },
  吴国太: { pack: '新将·第1批', roles: ['辅助', '控制'], difficulty: 3, tip: '【甘露】把队友的装备换给缺装备的人，注意装备差不超过自己已损体力；【补益】留非基本牌救濒死。' },
  甘夫人: { pack: '新将·第1批', roles: ['辅助', '续航'], difficulty: 2, tip: '【淑慎】回血时让最缺牌的队友补牌；【神智】手牌多时弃光换 1 点体力。' },
  邹氏: { pack: '新将·第1批', roles: ['控制'], difficulty: 3, tip: '先用【祸水】明置，再用【倾城】弃黑牌暗置敌方技能，专封对方核心。' },
  郭皇后: { pack: '新将·第1批', roles: ['爆发', '控制'], difficulty: 3, tip: '【矫诏】把废手牌声明成关键牌；【殚心】受伤后优先升级矫诏到 Lv3。' },
};

export interface HeroSkillView {
  name: string;
  tags: SkillTag[];
  desc: string;
  timing: string;
  quote: string;
  /** 主公技在非主公身份时不生效 */
  isLord?: boolean;
}

export interface HeroDetailView {
  hero: Hero;
  profile: HeroProfile;
  skills: HeroSkillView[];
}

/** 把「离间 / 闭月」这类合并写法按技能名拆开，并从整段描述里取出各自的规则文本 */
function splitSkillDesc(desc: string, names: string[]): string[] {
  if (names.length <= 1) return [desc];
  const out: string[] = [];
  names.forEach((name, i) => {
    const start = desc.indexOf(`${name}：`);
    if (start < 0) { out.push(''); return; }
    const bodyStart = start + name.length + 1;
    const next = names.slice(i + 1).map(n => desc.indexOf(`${n}：`)).filter(v => v > 0);
    const end = next.length ? Math.min(...next) : desc.length;
    out.push(desc.slice(bodyStart, end).trim());
  });
  return out;
}

const FALLBACK_PROFILE: HeroProfile = { pack: '标准包', roles: ['均衡'], difficulty: 2, tip: '按技能描述的触发时机出牌，优先保证每回合都有稳定收益。' };

/** 新增 30 名武将的技能类型/时机：技能逻辑尚未实装，仅用于详情面板如实展示 */
const PENDING_SKILL_META: Record<string, { tags: SkillTag[]; timing: string; quote?: string }> = {
  影箭: { tags: ['主动技'], timing: '准备阶段' },
  释衅: { tags: ['锁定技'], timing: '常时生效' },
  竭缘: { tags: ['主动技'], timing: '造成或受到伤害时' },
  焚心: { tags: ['限定技'], timing: '杀死一名角色后' },
  鸩毒: { tags: ['主动技'], timing: '其他角色的出牌阶段开始时' },
  戚乱: { tags: ['被动技'], timing: '一名角色的回合结束时' },
  穆穆: { tags: ['主动技'], timing: '出牌阶段开始时' },
  魅步: { tags: ['主动技'], timing: '其他角色的出牌阶段开始时' },
  甘露: { tags: ['主动技'], timing: '出牌阶段' },
  补益: { tags: ['主动技'], timing: '一名角色进入濒死状态时' },
  窃听: { tags: ['主动技'], timing: '其他角色的回合结束时' },
  献州: { tags: ['限定技'], timing: '出牌阶段' },
  樵拾: { tags: ['主动技'], timing: '其他角色的结束阶段' },
  燕语: { tags: ['主动技'], timing: '出牌阶段' },
  连诛: { tags: ['主动技'], timing: '出牌阶段' },
  黠慧: { tags: ['锁定技'], timing: '常时生效' },
  芳魂: { tags: ['被动技'], timing: '使用【杀】造成伤害后' },
  扶汉: { tags: ['限定技'], timing: '回合开始时' },
  矫诏: { tags: ['主动技'], timing: '出牌阶段' },
  殚心: { tags: ['被动技'], timing: '受到伤害后' },
  忠鉴: { tags: ['主动技'], timing: '出牌阶段' },
  才识: { tags: ['主动技'], timing: '摸牌阶段' },
  福绵: { tags: ['主动技'], timing: '准备阶段' },
  怠宴: { tags: ['主动技'], timing: '结束阶段' },
  问卦: { tags: ['主动技'], timing: '出牌阶段' },
  伏诛: { tags: ['主动技'], timing: '男性角色的结束阶段' },
  谮毁: { tags: ['主动技'], timing: '出牌阶段' },
  骄矜: { tags: ['被动技'], timing: '受到男性角色造成的伤害时' },
  谦冲: { tags: ['锁定技'], timing: '常时生效' },
  尚俭: { tags: ['锁定技'], timing: '任一角色的结束阶段' },
  姝勇: { tags: ['被动技'], timing: '使用或打出【杀】时' },
  许身: { tags: ['限定技'], timing: '出牌阶段' },
  镇南: { tags: ['被动技'], timing: '一张牌指定多个目标后' },
  纵傀: { tags: ['主动技'], timing: '回合开始时' },
  骨疽: { tags: ['锁定技'], timing: '拥有“傀”标记的角色受到伤害后' },
  拜假: { tags: ['觉醒技'], timing: '准备阶段' },
  凌人: { tags: ['主动技'], timing: '使用【杀】或伤害类锦囊指定目标后' },
  伏间: { tags: ['锁定技'], timing: '结束阶段' },
  仁释: { tags: ['锁定技'], timing: '已受伤时受到【杀】的伤害时' },
  武缘: { tags: ['主动技'], timing: '出牌阶段' },
  怀子: { tags: ['锁定技'], timing: '常时生效' },
  淑慎: { tags: ['被动技'], timing: '回复体力后' },
  神智: { tags: ['主动技'], timing: '准备阶段' },
  祸水: { tags: ['主动技'], timing: '出牌阶段' },
  倾城: { tags: ['主动技'], timing: '出牌阶段' },
  闺秀: { tags: ['被动技'], timing: '明置/移除武将牌时' },
  存嗣: { tags: ['主动技'], timing: '出牌阶段' },
  良姻: { tags: ['被动技'], timing: '牌被置于/获得武将牌上时' },
  箜声: { tags: ['主动技'], timing: '准备阶段 / 结束阶段' },
  法箓: { tags: ['锁定技'], timing: '弃牌进入弃牌堆后' },
  真仪: { tags: ['被动技'], timing: '判定/濒死/造成伤害/受到属性伤害时' },
  点化: { tags: ['主动技'], timing: '准备阶段或结束阶段' },
  弘仪: { tags: ['主动技'], timing: '出牌阶段' },
  劝封: { tags: ['限定技'], timing: '一名其他角色死亡后' },
  舍裔: { tags: ['主动技'], timing: '一名其他角色受到伤害时' },
  天音: { tags: ['锁定技'], timing: '结束阶段' },
  象阵: { tags: ['锁定技'], timing: '常时生效' },
  芳踪: { tags: ['锁定技'], timing: '出牌阶段 / 结束阶段' },
  嬉战: { tags: ['锁定技'], timing: '其他角色回合开始时' },
  冲虚: { tags: ['主动技'], timing: '出牌阶段' },
  妙剑: { tags: ['主动技'], timing: '出牌阶段' },
  莲华: { tags: ['被动技'], timing: '成为其他角色【杀】的目标时' },
  抵诽: { tags: ['被动技'], timing: '受到伤害后' },
  严教: { tags: ['主动技'], timing: '出牌阶段' },
  润微: { tags: ['主动技'], timing: '出牌阶段' },
  霜怀: { tags: ['被动技'], timing: '与你距离1以内的其他角色受到伤害时' },
};


/** 第六批新增 30 名女将的技能类型 / 时机 / 台词 */
const BATCH6_SKILL_META: Record<string, SkillMeta> = {
  尊位: { tags: ['主动技'], timing: '出牌阶段', quote: '尊位在此，尔等安敢造次。' },
  蜜饴: { tags: ['主动技'], timing: '准备阶段 / 结束阶段', quote: '蜜饴甘甜，可慰军心。' },
  寅君: { tags: ['被动技'], timing: '对其他角色使用手牌结算结束后', quote: '寅时之君，当立威仪。' },
  异色: { tags: ['被动技'], timing: '其他角色获得你的牌后', quote: '色分异同，命由我定。' },
  顺世: { tags: ['主动技'], timing: '准备阶段 / 回合外受到伤害后', quote: '顺势而为，方可长久。' },
  媵予: { tags: ['主动技'], timing: '准备阶段', quote: '媵妾之礼，不敢有违。' },
  拥嬖: { tags: ['限定技'], timing: '出牌阶段', quote: '得宠如此，夫复何求。' },
  庇族: { tags: ['主动技'], timing: '出牌阶段', quote: '庇我宗族，同气连枝。' },
  无胁: { tags: ['主动技'], timing: '回合结束时', quote: '无以为胁，唯以诚待。' },
  霞泪: { tags: ['被动技'], timing: '你的红色牌进入弃牌堆后', quote: '霞光如泪，转瞬即逝。' },
  暗织: { tags: ['主动技'], timing: '出牌阶段 / 受到伤害后', quote: '暗夜织锦，无人得见。' },
  宛蝉: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '宛转如蝉，绕梁不绝。' },
  绛脂: { tags: ['被动技'], timing: '你成为基本牌或普通锦囊牌的目标后', quote: '绛唇一点，脂粉生香。' },
  浮萍: { tags: ['被动技'], timing: '其他角色对你使用牌结算结束后', quote: '身如浮萍，随波逐流。' },
  炜烈: { tags: ['主动技'], timing: '出牌阶段', quote: '炜烈之光，照亮丹心。' },
  护关: { tags: ['主动技'], timing: '一名角色出牌阶段使用第一张牌时', quote: '过关斩将，护我周全。' },
  摇佩: { tags: ['主动技'], timing: '其他角色弃牌阶段结束时', quote: '环佩叮当，步履生姿。' },
  经音: { tags: ['主动技'], timing: '一名角色回合外使用【杀】结算后', quote: '经声琅琅，余音绕梁。' },
  迟行: { tags: ['被动技'], timing: '一名角色的出牌阶段结束时', quote: '迟迟其行，不疾不徐。' },
  斥怠: { tags: ['主动技'], timing: '一名角色的回合开始时', quote: '怠惰者，当斥之。' },
  缢节: { tags: ['被动技'], timing: '其他角色获得你的牌后', quote: '缢节明志，不负此身。' },
  异瞳: { tags: ['锁定技'], timing: '游戏开始时', quote: '异瞳所视，非此凡尘。' },
  醅酿: { tags: ['主动技'], timing: '出牌阶段 / 一名角色进入濒死状态时', quote: '新醅初酿，愿君共饮。' },
  诱言: { tags: ['主动技'], timing: '你的回合内（限一次）', quote: '巧言相诱，静待时机。' },
  追还: { tags: ['主动技'], timing: '结束阶段', quote: '追而还之，恩怨分明。' },
  蕙质: { tags: ['主动技'], timing: '准备阶段', quote: '蕙质兰心，自有分寸。' },
  继椒: { tags: ['限定技'], timing: '出牌阶段', quote: '椒房之宠，绵延不绝。' },
  芳妒: { tags: ['锁定技'], timing: '回合外受到伤害后', quote: '芳华易妒，天亦怜之。' },
  节行: { tags: ['被动技'], timing: '体力值变化后', quote: '节行自守，不负初心。' },
  元嫡: { tags: ['主动技'], timing: '其他角色出牌阶段使用第一张牌时', quote: '元嫡之尊，井然有序。' },
  心幽: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '心有所幽，静水流深。' },
  辞虑: { tags: ['主动技'], timing: '你成为普通锦囊牌的目标后', quote: '辞去烦虑，心自安然。' },
  痛悼: { tags: ['限定技'], timing: '当你处于濒死状态时', quote: '痛悼故人，泣血以告。' },
  织纴: { tags: ['主动技'], timing: '你的回合内使用第一张非转化牌时', quote: '织纴之巧，可比天工。' },
  燕尔: { tags: ['被动技'], timing: '其他角色出牌阶段失去最后的手牌时', quote: '燕尔新婚，如胶似漆。' },
  遭谮: { tags: ['被动技'], timing: '其他角色出牌阶段', quote: '遭人构陷，何以自明。' },
  追懿: { tags: ['锁定技'], timing: '你使用牌结算后', quote: '追慕懿德，不敢或忘。' },
  育贤: { tags: ['主动技'], timing: '每轮开始时 / 其他角色出牌阶段使用牌时', quote: '育养贤才，为国储用。' },
  愍善: { tags: ['被动技'], timing: '你受到1点伤害后', quote: '愍恤弱小，善莫大焉。' },
  聆乐: { tags: ['锁定技'], timing: '一名角色造成本轮第一次伤害后', quote: '聆此雅乐，可慰平生。' },
  盻睇: { tags: ['主动技'], timing: '出牌阶段', quote: '盻睇之间，已定胜负。' },
  同礼: { tags: ['主动技'], timing: '出牌阶段使用牌指定目标后', quote: '同礼相待，不敢僭越。' },
  奢葬: { tags: ['被动技'], timing: '进入濒死状态时', quote: '奢以为葬，聊尽哀思。' },
  天则: { tags: ['被动技'], timing: '其他角色黑色判定牌生效后', quote: '天则有常，不容僭越。' },
  生妒: { tags: ['主动技'], timing: '回合开始时', quote: '妒心一起，祸福难料。' },
  介绫: { tags: ['主动技'], timing: '出牌阶段', quote: '绫罗为介，可挡刀兵。' },
  妩艳: { tags: ['主动技'], timing: '出牌阶段 / 受到伤害后', quote: '妩媚姿容，倾城倾国。' },
  占欲: { tags: ['主动技'], timing: '回合开始时', quote: '占其所欲，尽归于我。' },
  望资: { tags: ['主动技'], timing: '其他角色的出牌阶段开始时', quote: '望其资财，为我所用。' },
  和戎: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '和戎之策，胜于刀兵。' },
  谗逆: { tags: ['主动技'], timing: '出牌阶段（限一次）', quote: '谗言逆耳，其心可诛。' },
  匿伏: { tags: ['锁定技'], timing: '一名角色的结束阶段', quote: '匿于暗处，静待时机。' },
  抗歌: { tags: ['主动技'], timing: '你的第一个回合开始时', quote: '抗声而歌，以励同袍。' },
  节烈: { tags: ['被动技'], timing: '你受到其他角色造成的伤害时', quote: '节烈之名，宁死不辱。' },
  狡黠: { tags: ['主动技'], timing: '出牌阶段', quote: '狡黠如狐，出其不意。' },
  狐魅: { tags: ['主动技'], timing: '出牌阶段（每个选项限一次）', quote: '狐魅之惑，摄人心魄。' },
};

const PENDING_PROFILE: HeroProfile = {
  pack: '新将·技能实装中',
  roles: ['均衡'],
  difficulty: 2,
  tip: '本轮已开放图鉴与立绘，技能逻辑尚未实装，暂不进入随机池、不可开局；实装后将分批加入对局。',
};

/** 由武将数据生成详情面板所需的全部字段（不编造未实现技能） */
export function getHeroDetail(hero: Hero): HeroDetailView {
  const names = hero.skillName.split('/').map(s => s.trim()).filter(Boolean);
  const descs = splitSkillDesc(hero.skillDesc, names);
  const skills: HeroSkillView[] = names.map((name, i) => {
    const meta = SKILL_META[name] ?? BATCH6_SKILL_META[name] ?? PENDING_SKILL_META[name];
    return {
      name,
      tags: meta?.tags ?? ['主动技'],
      desc: descs[i] || hero.skillDesc,
      timing: meta?.timing ?? '按技能描述',
      quote: meta?.quote ?? '',
    };
  });
  if (hero.lordSkillName) {
    const meta = SKILL_META[hero.lordSkillName];
    skills.push({
      name: hero.lordSkillName,
      tags: ['主公技'],
      desc: hero.lordSkillDesc ?? '',
      timing: meta?.timing ?? '仅主公身份时生效',
      quote: meta?.quote ?? '',
      isLord: true,
    });
  }
  return { hero, profile: hero.pending ? PENDING_PROFILE : (HERO_PROFILES[hero.name] ?? FALLBACK_PROFILE), skills };
}
