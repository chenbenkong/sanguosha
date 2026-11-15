import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 「操作被拦」提示守卫。
 *
 * 背景：战况记录侧栏默认常被玩家收起，而「为什么这一下点不动」（超出攻击范围、
 * 兵粮寸断只能距离 1、不能选自己…）此前**只写进日志**。侧栏一收，玩家点了没反应
 * 又看不到原因 —— 等于没有反馈。现在这类拦截统一走 hintBlocked()：既记日志，
 * 又弹一个居中的醒目浮层（.blocked-hint）。
 *
 * 这里用源码级断言钉住三条不变式，防止以后又退回「只写日志」：
 *   A. 不允许存在「warning 级 addLog 紧跟 clickGuard 复位」的裸调用（那正是被拦的形态）。
 *   B. hintBlocked 必须既记日志又设浮层，且卸载清定时器。
 *   C. BattleScreen 渲染 .blocked-hint，CSS 给足 z-index 且 pointer-events:none。
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const app = read('App.tsx');
const battle = read('src/screens/BattleScreen.tsx');
const css = read('src/styles/theme.css');

/** 找出「addLog(...,'warning') 之后 3 行内出现 clickGuard.current = false」的残留 */
const bareBlockedWarnings = (): number[] => {
  const lines = app.split('\n');
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('addLog(')) continue;
    const window = lines.slice(i, i + 4).join('\n');
    if (!/['\"]warning['\"]/.test(window)) continue;
    if (!/clickGuard\.current = false/.test(window)) continue;
    hits.push(i + 1);
  }
  return hits;
};

describe('操作被拦提示（blocked-hint）', () => {
  it('A. 没有「只写 warning 日志就 return」的拦截残留', () => {
    const bare = bareBlockedWarnings();
    expect(bare, '这些行仍用裸 addLog 反馈拦截，应改为 hintBlocked：' + bare.join(', ')).toEqual([]);
  });

  it('A2. hintBlocked 调用点数量足够（覆盖全部拦截分支）', () => {
    // 定义行写成 const hintBlocked = useCallback，不含 hintBlocked(，所以计数就是调用数
    const n = (app.match(/hintBlocked\(/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(28);
  });

  it('B. hintBlocked 既记日志又弹浮层，序号自增，卸载清定时器', () => {
    const def = app.slice(app.indexOf('const hintBlocked = useCallback'));
    expect(def).toContain('addLog(text, "warning")');
    expect(def).toContain('setBlockedHint(');
    // 用自增序号而非 Date.now()：连点两次可能同毫秒，key 不变就不重播动画
    expect(def).toContain('blockedHintSeqRef.current += 1');
    // 卸载清定时器：单独一条 useEffect，返回清理函数
    const cleanup = app.slice(app.indexOf('// 卸载时清掉待触发的隐藏定时器'));
    expect(cleanup).toContain('blockedHintTimerRef.current !== null');
    expect(cleanup).toContain('window.clearTimeout(blockedHintTimerRef.current)');
    expect(cleanup).toContain('}, []);');
  });

  it('C. BattleScreen 渲染浮层，role=alert 供读屏，且 CSS 层级压过侧栏', () => {
    expect(battle).toContain('props.blockedHint &&');
    expect(battle).toContain('className="blocked-hint"');
    expect(battle).toContain('role="alert"');
    // 浮层必须点得穿（它是解释不是新拦截），且 z-index 高于战况侧栏(z-30)与操作栏
    expect(css).toMatch(/\.blocked-hint\s*\{[\s\S]*?pointer-events:\s*none;/);
    expect(css).toMatch(/\.blocked-hint\s*\{[\s\S]*?z-index:\s*90;/);
    // 减弱动效时不做抖动
    expect(css).toMatch(/\[data-motion="off"\] \.blocked-hint \{ animation: none; \}/);
  });
});
