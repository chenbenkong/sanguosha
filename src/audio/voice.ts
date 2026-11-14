// 角色 / 卡牌语音：使用开源三国杀项目 noname 的语音资源（本地托管，非商用）
import DEATH_VOICE_LINES_RAW from './dieVoiceLines.json' with { type: 'json' };

/**
 * 武将名 → 台词。JSON 导入会被推断成字面量窄类型（每个键都是具体列名），
 * 用 string 索引会报 TS7053，所以这里显式收宽成 Record。
 */
const DEATH_VOICE_LINES = DEATH_VOICE_LINES_RAW as Record<string, string>;

import SKILL_VOICE_LINES_RAW from './skillVoiceLines.json' with { type: 'json' };

type VoiceKind = 'skill' | 'die' | 'card';

const CARD_SLUG: Record<string, string> = {
  '杀': 'sha', '闪': 'shan', '酒': 'jiu', '决斗': 'juedou',
  '无中生有': 'wuzhong', '南蛮入侵': 'nanman', '无懈可击': 'wuxie', '万箭齐发': 'wanjian',
  '顺手牵羊': 'shunshou', '过河拆桥': 'guohe', '乐不思蜀': 'lebu', '火攻': 'huogong',
  '铁索连环': 'tiesuo', '兵粮寸断': 'bingliang', '五谷丰登': 'wugu', '桃园结义': 'taoyuan',
  '借刀杀人': 'jiedao', '闪电': 'shandian',
  '青釭剑': 'qinggang', '青龙偃月刀': 'qinglong', '方天画戟': 'fangtian', '诸葛连弩': 'zhuge',
  '八卦阵': 'bagua', '仁王盾': 'renwang', '赤兔': 'chitu', '大宛': 'dawan', '的卢': 'dilu', '绝影': 'jueying',
  // 其余装备台词：来源开源项目 noname（yusanshi/noname，本地托管非商用）；
  // 其中「紫骍」在 noname 中的音频 slug 为 zixin
  '丈八蛇矛': 'zhangba', '贯石斧': 'guanshi', '雌雄双股剑': 'cixiong', '寒冰剑': 'hanbing',
  '麒麟弓': 'qilin', '古锭刀': 'guding', '朱雀羽扇': 'zhuque', '藤甲': 'tengjia',
  '白银狮子': 'baiyin', '爪黄飞电': 'zhuahuang', '紫骍': 'zixin',
};

const SKILL_SLUG: Record<string, string> = {
  '奸雄': 'jianxiong', '仁德': 'rende', '制衡': 'zhiheng', '无双': 'wushuang',
  '武圣': 'wusheng', '鬼才': 'guicai', '离间': 'lijian', '咆哮': 'paoxiao',
  '烈弓': 'liegong', '刚烈': 'ganglie', '英姿': 'yingzi', '倾国': 'qingguo',
  '洛神': 'luoshen', '集智': 'jizhi', '枭姬': 'xiaoji', '结姻': 'jieyin',
  '伤逝': 'shangshi', '流离': 'liuli', '断肠': 'duanchang',
  '奇袭': 'qixi', '克己': 'keji', '秘计': 'miji', '追忆': 'zhuiyi',
  // 补齐缺口（TTS 合成，见 public/audio/语音说明.md）
  '龙胆': 'longdan', '反馈': 'fankui', '闭月': 'biyue', '反间': 'fanjian',
  '奇才': 'qicai', '绝情': 'jueqing', '巨象': 'juxiang', '烈刃': 'lieren',
  '国色': 'guse', '红颜': 'hongyan', '天香': 'tianxiang', '悲歌': 'beige',
  '贞烈': 'zhenlie', '安恤': 'anxu', '突袭': 'tuxi', '裸衣': 'luoyi',
  '天妒': 'tiandu', '遗计': 'yiji', '马术': 'mashu', '铁骑': 'tieqi',
  '观星': 'guanxing', '空城': 'kongcheng', '苦肉': 'kurou', '谦逊': 'qianxun',
  '连营': 'lianying', '青囊': 'qingnang', '急救': 'jijiu', '护驾': 'hujia',
  '激将': 'jijiang', '救援': 'jiuyuan', '虎啸': 'huxiao', '枪舞': 'qiangwu',
  '挽危': 'wanwei', '祈禳': 'qirang', '惠民': 'huimin', '求援': 'qiuyuan',
  // 第 1 批 6 名女将（TTS 合成）
  '影箭': 'yingjian', '释衅': 'shixin', '鸩毒': 'zhendu', '戚乱': 'qiluan',
  '甘露': 'ganlu', '补益': 'buyi', '淑慎': 'shushen', '神智': 'shenzhi',
  '祸水': 'huoshui', '倾城': 'qingcheng', '矫诏': 'jiaozhao', '殚心': 'danxin',
};

const cache = new Map<string, HTMLAudioElement>();

function playFile(url: string): boolean {
  try {
    let el = cache.get(url);
    if (!el) {
      el = new Audio(url);
      el.preload = 'auto';
      el.volume = 0.9;
      cache.set(url, el);
    }
    el.currentTime = 0;
    void el.play().catch(() => { /* 自动播放策略或文件缺失时静默 */ });
    return true;
  } catch {
    return false;
  }
}

/** 卡牌台词：按角色性别选择语音；无对应语音返回 false，交由合成音效兜底 */
export function playCardVoice(cardName: string, gender: 'male' | 'female' = 'male'): boolean {
  const slug = CARD_SLUG[cardName];
  if (!slug) return false;
  return playFile(`audio/card/${gender}/${slug}.mp3`);
}

/** 技能台词：传入技能中文名 */
/**
 * 官方真人原声「技能」台词（v3.58 新增）。
 *
 * 为什么必须按「武将 + 技能」两级查，而不能像 SKILL_SLUG 那样只按技能名：
 * 同名技能在不同武将手里的台词并不相同——实测 223 个技能条目对应 440 句，
 * 存在同名不同词的情况。只按技能名做全局映射会把台词配错人。
 *
 * 每个技能有 1~2 句（223 个条目里 217 个是 2 句、6 个是 1 句），运行时随机取一句，
 * 避免同一局里反复发动同一技能时听到完全一样的一句。
 *
 * 文件位置：public/audio/skill-voice/<武将名>/<技能名><序号>.mp3
 * 序号从 1 开始，对应 SKILL_VOICE_LINES[武将][技能] 数组下标 + 1。
 */
const SKILL_VOICE_LINES = SKILL_VOICE_LINES_RAW as Record<string, Record<string, string[]>>;

/** 该武将的该技能是否有官方原声台词 */
export const hasOfficialSkillVoice = (heroName: string, skillName: string): boolean =>
  (SKILL_VOICE_LINES[heroName]?.[skillName]?.length ?? 0) > 0;

/** 该武将的该技能的全部台词文本（UI 显示用；没有则返回空数组） */
export const skillVoiceLines = (heroName: string, skillName: string): string[] =>
  SKILL_VOICE_LINES[heroName]?.[skillName] ?? [];

/**
 * 播放官方原声技能台词。
 *
 * 未收录的武将/技能返回 false 且**不发起请求** —— 与阵亡语音同一套白名单思路：
 * 本项目是单页应用，缺文件时 vite preview / GitHub Pages 会回退到 index.html
 * 并返回 200 + text/html，<audio> 静默播放失败（error.code=4），页面不报错、
 * 只是没声音，是最难发现的一类回归。所以先查表再发请求。
 */
export function playOfficialSkillVoice(heroName: string, skillName: string): boolean {
  const lines = SKILL_VOICE_LINES[heroName]?.[skillName];
  if (!lines || lines.length === 0) return false;
  // 随机取一句；文件按 1-based 序号命名
  const pick = Math.floor(Math.random() * lines.length) + 1;
  return playFile(`audio/skill-voice/${heroName}/${skillName}${pick}.mp3`);
}

/** 兼容旧调用：只用技能名（老的非官方素材，全局共享） */
export function playSkillVoice(skillName: string): boolean {
  const slug = SKILL_SLUG[skillName];
  if (!slug) return false;
  return playFile(`audio/skill/${slug}.mp3`);
}

// 仅这些武将有本地阵亡语音（与本文件的 DEATH_VOICE_HEROES 及 public/audio/die 一致）。
// 未收录的武将直接返回 false，由调用方回退合成音效，避免产生 404 与控制台报错。
// 白名单登记 45 名：前 24 名为 noname 公开素材，其余 21 名为 TTS 合成。
// 目录里另有 1 个不再被引用的遗留 lvbu.mp3（武将 id 为 lubu），故文件名数 46 ≠ 白名单 45。
const DEATH_VOICE_HEROES = new Set([
  'bulianshi', 'caiwenji', 'caocao', 'daqiao', 'diaochan', 'ganning', 'guanyu',
  'huangyueying', 'huangzhong', 'liubei', 'lubu', 'lvmeng', 'simayi', 'sunquan',
  'sunshangxiang', 'wangyi', 'xiahoudun', 'xiaoqiao', 'zhangchunhua', 'zhangfei',
  'zhaoyun', 'zhenji', 'zhouyu', 'zhurong',
  'zhangliao', 'xuchu', 'guojia', 'machao', 'zhugeliang', 'huanggai', 'luxun',
  'huatuo', 'guanyinping', 'zhangxingcai', 'bianfuren', 'zhugeguo', 'caojie',
  'fuhuanghou', 'mayunlu',
  // 第 1 批 6 名女将（TTS 合成）
  'sunru', 'hetaishou', 'wuguotai', 'ganfuren', 'zoushi', 'guohuanghou',
]);

/**
 * 官方真人原声阵亡台词（v3.56 新增）。
 *
 * 与上面的 audio/die/<id>.mp3 并存而不是替换：老目录按武将 id（拼音）命名，
 * 覆盖 45 名（含 TTS 合成）；新目录按**武将中文名**命名，覆盖 123 名。文件名与
 * public/images/heroes/<中文名>.webp 同一套命名，引擎侧给 hero.name 就能拼路径，
 * 不必再维护 id→拼音 映射表。
 *
 * 优先级：官方原声 > 旧目录 > 合成提示音。
 */
export function playOfficialDeathVoice(heroName: string): boolean {
  if (!(heroName in DEATH_VOICE_LINES)) return false;
  return playFile(`audio/die-voice/${heroName}.mp3`);
}

/** 该武将有官方原声阵亡台词时的台词文本（UI 显示用；没有则返回 null） */
export const deathVoiceLine = (heroName: string): string | null =>
  DEATH_VOICE_LINES[heroName] ?? null;

/** 阵亡台词：传入武将 id */
export function playDeathVoice(heroId: string): boolean {
  if (!DEATH_VOICE_HEROES.has(heroId)) return false;
  return playFile(`audio/die/${heroId}.mp3`);
}

/** 登场台词：白名单 45 名武将均有本地文件（全部 TTS 合成；目录里另有 1 个遗留 lvbu.mp3） */
export function playEnterVoice(heroId: string): boolean {
  if (!DEATH_VOICE_HEROES.has(heroId)) return false;
  return playFile(`audio/enter/${heroId}.mp3`);
}

export const hasSkillVoice = (skillName: string) => !!SKILL_SLUG[skillName];
export const hasCardVoice = (cardName: string) => !!CARD_SLUG[cardName];
export type { VoiceKind };
