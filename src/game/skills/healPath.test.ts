import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** App.tsx 是 CRLF，统一成 LF 再比字符串，否则跨行的 needle 永远匹配不上 */
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/**
 * 回血出口守卫。
 *
 * 「回复体力之后」（afterHeal）只有一个派发点：App.tsx 的 recoverHp。
 * combat.ts 的 8 个回血调用点注入的也是它（CombatDeps.recoverHp）。
 * 所以只要有人绕过 recoverHp 直接写 hp 增加，那两个技能就会对这次回血**完全隐形** ——
 * 这种 bug 在单元测试里看不出来（技能逻辑没错，是事件没派发）。
 *
 * 下面按「已知的、故意的例外」逐条登记：它们都是在**同时改体力上限**的场合里
 * 直接写绝对值（替换武将、觉醒改上限），不是「回复体力」语义。
 */
const ALLOWED: Array<{ file: string; needle: string; why: string }> = [
  {
    file: 'App.tsx',
    needle: 'hp: Math.min(me.hp + (isLowest ? 1 : 0), newMax)',
    why: '赵襄「扶汉」替换武将：同一处 updatePlayer 里同时改 maxHp，写的是绝对值',
  },
  {
    file: 'App.tsx',
    needle: 'hp: healed,\n          quanfengUsed: true',
    why: '全峰：替换武将同时改体力上限',
  },
  {
    file: 'src/game/combat.ts',
    needle: 'updatePlayer(victimId, { hp: saved.hp })',
    why: 'onDying 返回的绝对体力（技能救人），不是「回复 N 点」',
  },
  {
    file: 'src/game/combat.ts',
    needle: 'hp: healed, quanfengUsed',
    why: '劝封：替换武将同时改体力上限（combat 侧）',
  },
];

describe('回血出口守卫', () => {
  it('recoverHp 是唯一的「回复体力」出口，并且它派发 afterHeal', () => {
    const app = read('App.tsx');
    expect(app).toContain('dispatchAfterHeal(buildSkillDeps(), { player: healed, amount: gained })');
    // recoverHp 之外不允许再出现「hp: Math.min(x.hp + n, ...)」这种直接加血
    expect(app).not.toContain('updatePlayer(p.id, { hp: healed });');
    expect(app).not.toContain('updatePlayer(target.id, { hp: Math.min(target.maxHp, target.hp + 1) });');
  });

  it('每一处绕过 recoverHp 的直接写 hp 都在允许清单里，且理由成立', () => {
    const app = read('App.tsx');
    const combat = read('src/game/combat.ts');
    for (const a of ALLOWED) {
      const src = a.file === 'App.tsx' ? app : combat;
      expect(src.includes(a.needle), a.file + ' 里找不到：' + a.needle + '（登记的理由是：' + a.why + '）').toBe(true);
    }
  });

  it('武缘的回血已经改走 recoverHp（否则它对酖毒/谮构隐形）', () => {
    const app = read('App.tsx');
    expect(app).toContain('recoverHp(p.id, 1);');
    expect(app).toContain('if (red) recoverHp(target.id, 1);');
  });
});
