/**
 * 技能注册入口。
 *
 * 新增武将技能时：在 skills/ 下新建一个 <武将拼音>.ts，末尾调用 registerSkill(...)，
 * 再在这里 import 一行即可。**不需要改 App.tsx / combat.ts。**
 */
import './batch6';
import './batch7';
import './batch8';

export { skillsOf, skillHook, registeredHeroCount } from './registry';
export type { SkillDef, SkillHooks, SkillContext, DamageEvent, CardUsedEvent, JudgeEvent } from './registry';
