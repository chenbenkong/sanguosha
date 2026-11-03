// 角色 / 卡牌语音：使用开源三国杀项目 noname 的语音资源（本地托管，非商用）
type VoiceKind = 'skill' | 'die' | 'card';

const CARD_SLUG: Record<string, string> = {
  '杀': 'sha', '闪': 'shan', '酒': 'jiu', '决斗': 'juedou',
  '无中生有': 'wuzhong', '南蛮入侵': 'nanman', '无懈可击': 'wuxie', '万箭齐发': 'wanjian',
  '顺手牵羊': 'shunshou', '过河拆桥': 'guohe', '乐不思蜀': 'lebu', '火攻': 'huogong',
  '铁索连环': 'tiesuo', '兵粮寸断': 'bingliang', '五谷丰登': 'wugu', '桃园结义': 'taoyuan',
  '借刀杀人': 'jiedao', '闪电': 'shandian',
  '青釭剑': 'qinggang', '青龙偃月刀': 'qinglong', '方天画戟': 'fangtian', '诸葛连弩': 'zhuge',
  '八卦阵': 'bagua', '仁王盾': 'renwang', '赤兔': 'chitu', '大宛': 'dawan', '的卢': 'dilu', '绝影': 'jueying',
};

const SKILL_SLUG: Record<string, string> = {
  '奸雄': 'jianxiong', '仁德': 'rende', '制衡': 'zhiheng', '无双': 'wushuang',
  '武圣': 'wusheng', '鬼才': 'guicai', '离间': 'lijian', '咆哮': 'paoxiao',
  '烈弓': 'liegong', '刚烈': 'ganglie', '英姿': 'yingzi', '倾国': 'qingguo',
  '洛神': 'luoshen', '集智': 'jizhi', '枭姬': 'xiaoji', '结姻': 'jieyin',
  '伤逝': 'shangshi', '流离': 'liuli', '断肠': 'duanchang',
  '奇袭': 'qixi', '克己': 'keji', '秘计': 'miji', '追忆': 'zhuiyi',
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
export function playSkillVoice(skillName: string): boolean {
  const slug = SKILL_SLUG[skillName];
  if (!slug) return false;
  return playFile(`audio/skill/${slug}.mp3`);
}

// 仅这些武将有本地阵亡语音（与 public/audio/die 下的实际文件一致）。
// 未收录的武将直接返回 false，由调用方回退合成音效，避免产生 404 与控制台报错。
const DEATH_VOICE_HEROES = new Set([
  'bulianshi', 'caiwenji', 'caocao', 'daqiao', 'diaochan', 'ganning', 'guanyu',
  'huangyueying', 'huangzhong', 'liubei', 'lvbu', 'lvmeng', 'simayi', 'sunquan',
  'sunshangxiang', 'wangyi', 'xiahoudun', 'xiaoqiao', 'zhangchunhua', 'zhangfei',
  'zhaoyun', 'zhenji', 'zhouyu', 'zhurong',
]);

/** 阵亡台词：传入武将 id */
export function playDeathVoice(heroId: string): boolean {
  if (!DEATH_VOICE_HEROES.has(heroId)) return false;
  return playFile(`audio/die/${heroId}.mp3`);
}

export const hasSkillVoice = (skillName: string) => !!SKILL_SLUG[skillName];
export const hasCardVoice = (cardName: string) => !!CARD_SLUG[cardName];
export type { VoiceKind };
