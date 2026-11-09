import { describe, expect, it } from 'vitest';
import { isSkillSealed, skillsOn } from './skillGate';
import type { SkillGateSources } from './skillGate';

describe('isSkillSealed：倾城封印判定', () => {
  it('无封印（undefined）视为未封印', () => {
    expect(isSkillSealed(undefined, 5)).toBe(false);
  });

  it('封印截止回合大于当前回合时为封', () => {
    expect(isSkillSealed(8, 5)).toBe(true);
  });

  it('封印截止回合等于当前回合即解封（严格大于）', () => {
    expect(isSkillSealed(5, 5)).toBe(false);
  });

  it('封印截止回合小于当前回合为已解封', () => {
    expect(isSkillSealed(3, 5)).toBe(false);
  });

  it('0 视为无封印（falsy 短路）', () => {
    expect(isSkillSealed(0, 5)).toBe(false);
  });
});

const gate = (over: Partial<SkillGateSources> = {}): SkillGateSources => ({
  sealUntil: () => undefined,
  turnCount: () => 1,
  generalRemoved: () => undefined,
  ...over,
});

describe('skillsOn：技能可发动总闸门', () => {
  it('未封印且武将未移除 → 可发动', () => {
    expect(skillsOn(1, gate())).toBe(true);
  });

  it('被封印 → 不可发动', () => {
    expect(skillsOn(1, gate({ sealUntil: () => 9, turnCount: () => 2 }))).toBe(false);
  });

  it('封印已到期 → 可发动', () => {
    expect(skillsOn(1, gate({ sealUntil: () => 2, turnCount: () => 2 }))).toBe(true);
  });

  it('武将已移除 → 不可发动', () => {
    expect(skillsOn(1, gate({ generalRemoved: () => true }))).toBe(false);
  });

  it('武将 generalRemoved 为 undefined → 视为未移除', () => {
    expect(skillsOn(1, gate({ generalRemoved: () => undefined }))).toBe(true);
  });

  it('封印短路：封印中不再查询 generalRemoved', () => {
    let removedQueried = false;
    const src = gate({
      sealUntil: () => 99,
      turnCount: () => 1,
      generalRemoved: () => { removedQueried = true; return false; },
    });
    expect(skillsOn(1, src)).toBe(false);
    expect(removedQueried).toBe(false);
  });
});
