/**
 * 技能注册入口。
 *
 * 新增武将技能时：在 skills/ 下新建一个 <武将拼音>.ts，末尾调用 registerSkill(...)，
 * 再在这里 import 一行即可。**不需要改 App.tsx / combat.ts。**
 */
import './batch6';
import './batch7';
import './batch8';
import './batch6new';
import './batch6new3';
import './batch6new2';
import './batch6new4';
import './batch6new5';
import './batch6new8';
import './batch6new6';
import './batch6new10';
import './batch6new7';
import './batch6new12';
import './batch6new13';
import './batch6new11';
import './batch6new14';
import './batch6new15';
import './batch6new16';
import './batch6new17';
import './batch6new18';
import './batch6new19';
import './batch6new20';
import './batch6new21';
import './migrated1';
import './migrated2';
import './migrated3';
import './migrated_wa';
import './migrated_abilities';
import './migrated_phase';
import './migrated_abilities2';

export { skillsOf, skillHook, registeredHeroCount } from './registry';
export type {
  SkillDef, SkillHooks, SkillContext, DamageEvent, CardUsedEvent, JudgeEvent,
  DrawPhaseEvent, DrawPhaseResult, DiscardPhaseEvent, DiscardPhaseResult, CardLostEvent,
} from './registry';
