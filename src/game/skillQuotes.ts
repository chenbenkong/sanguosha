import SKILL_VOICE_LINES_RAW from '../audio/skillVoiceLines.json' with { type: 'json' };

/**
 * 官方技能台词原文（武将名 → 技能名 → 台词数组）。
 *
 * 与 src/audio 下那份音频表是同一份数据：那边只按序号拼音频路径播声音，
 * 这边取文本给详情页显示——同一份原文，两个消费方。
 *
 * 必须按「武将 + 技能」两级查，不能像 voice.ts 的 SKILL_SLUG 那样只按技能名：
 * 同名技能在不同武将手里的台词并不相同（实测「护关」在王悦手里是
 * 「此关有我，固若金汤。」，在王桃手里是「春庭落花坠，遇卿心弦动。」），
 * 只按技能名做全局映射会把台词配到别人身上。
 *
 * JSON 导入会被推断成字面量窄类型（每个键都是具体列名），用 string 索引会报
 * TS7053，所以这里显式收宽成 Record（同 utils.ts 的白名单写法）。
 */
const OFFICIAL_SKILL_LINES = SKILL_VOICE_LINES_RAW as Record<string, Record<string, string[]>>;

/**
 * 该武将、该技能的官方台词原文（通常 1~2 句）。
 * 未收录的武将/技能返回**空数组**而不是 undefined，调用方可以直接 .length / .map。
 */
export function officialSkillQuotes(heroName: string, skillName: string): string[] {
  return OFFICIAL_SKILL_LINES[heroName]?.[skillName] ?? [];
}
