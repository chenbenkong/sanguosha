import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { enableTakeover, openApp, setSpeedLevel, sleep, startGameWithHero } from './helpers';
import { startPreview } from './preview';
import type { E2EContext } from './helpers';

/**
 * 端到端：结算前钩子在真实对局里生效。
 *
 * 用 vite **dev** server 而不是 preview：要构造「喂火焰伤害」「判定牌必定方块」这类
 * 场景只能靠 App.tsx 的开发态探针（__devDamage / __devDeckOnly / __devTrick /
 * __devState / __devLogs / __sgDbg），而它们被 import.meta.env.DEV 门控，生产构建里
 * 整段被移除。dev server 上跑的仍是真实链路：
 *   App → combat.takeDamage → dispatchDamageBefore → 技能 → setIsProcessing
 *
 * 两个接入点各一条用例：
 *  A. combat.ts takeDamage 的 damageBefore —— 孙茹「释衅」免疫火焰（含结算锁不泄漏）
 *  B. App.tsx performJudgment 的 judgeBefore —— 小乔「红颜」方块判定生效为红桃
 */

// 端口不硬编码：默认系统分配（E2E_PORT 可覆盖），并校验应答方是本仓库的 dev server。
let BASE = '';
let previewHandle: { base: string; stop: () => void } | null = null;


/**
 * 确认真的是**本仓库的** dev server 在应答。
 *
 * 只看 HTTP 200 不够：端口若被别的进程占着，vite 会默默换一个口，而 BASE 仍由占用者
 * 应答——实测期间就有同级的另一份工作区在 7302 上跑 preview，连过去拿到的是生产
 * 构建（没有探针，probeReady 恒为 false）。所以：--strictPort 让 vite 抢不到口就退出，
 * 这里再按产物特征确认应答方是 dev server（preview 给的是打包后的 /assets/js/*.js）。
 */
const isOurDevServer = async (): Promise<boolean> => {
  try {
    const res = await fetch(BASE);
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('/@vite/client') && html.includes('src="/index.tsx"');
  } catch {
    return false;
  }
};

beforeAll(async () => {
  // 用共用模块起 dev server：它会自选空闲端口，并在端口已被占用时校验应答方，
  // 不一致直接报错而不是静默连到别人的服务上。
  previewHandle = await startPreview({ dev: true });
  BASE = previewHandle.base;
}, 120000);

afterAll(() => {
  previewHandle?.stop();
});

type Page = E2EContext['page'];

/** 一次求值里同时取回体力 / 战报 / 主循环状态。
 *  分两次 evaluate 之间主循环还在跑（AI 会自己出牌），合到一次才是同一瞬间的快照。 */
const snapshot = (page: Page, playerId: number) =>
  page.evaluate((id) => {
    const w = window as unknown as {
      __devState: () => Array<{ id: number; name: string; hp: number; maxHp: number }>;
      __devLogs: () => string[];
      __sgDbg: { turnIndex: number; phase: string; isProcessing: number };
    };
    const me = w.__devState().find(p => p.id === id)!;
    return {
      name: me.name, hp: me.hp, maxHp: me.maxHp,
      logs: w.__devLogs(),
      loop: { turnIndex: w.__sgDbg.turnIndex, phase: w.__sgDbg.phase, isProcessing: w.__sgDbg.isProcessing },
    };
  }, playerId);

/** 开发态探针就位（只有 dev server 有；preview 上是 false） */
const probeReady = (page: Page): Promise<boolean> =>
  page.evaluate(() => typeof (window as unknown as { __devState?: unknown }).__devState === 'function');

/** 轮询直到 check 为真；超时返回 false（所有等待都带 deadline，不用无上限轮询） */
const until = async (page: Page, timeoutMs: number, check: () => Promise<boolean>): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(400);
  }
  return false;
};

/** 一次探针调用：[探针名, 实参列表] */
type DevProbeCall = [name: string, args: unknown[]];

/**
 * 等主循环空闲再喂探针，且「判空闲」与「调探针」放在**同一次求值**里。
 *
 * 为什么不写成「先 until(...) 等空闲，再另起一次 evaluate 调探针」：
 * 两次 evaluate 之间主循环仍可能重新进入结算（实测托管 + 3 倍速下
 * isProcessing > 0 的时间占比 34.5%，25s 窗口 / 60ms 采样），而
 * __devDamage 是 `void combat.takeDamage(...)`、不等结算完成，撞上就与
 * 既有结算并发，状态被随后的写回覆盖——这正是此前两次 CI 偶发的成因。
 * 同一次求值里「判断 → 调用」之间没有 await，主循环拿不到执行权，竞态窗口为零。
 *
 * 多个探针必须走同一次调用（例如 __devTrick + __devDeckOnly）：分两次
 * evaluate 时中间那一段就是可被结算插入的窗口。
 *
 * @returns 探针是否真的在空闲时刻被调用；超时返回 false，由调用方断言，
 *          避免「等空闲超时了还照旧往下喂」这种静默降级。
 */
const feedProbes = (
  page: Page,
  calls: DevProbeCall[],
  timeoutMs = 30000,
): Promise<boolean> =>
  page.evaluate(
    async (list: DevProbeCall[], budget: number): Promise<boolean> => {
      const w = window as unknown as Record<string, unknown>;
      for (const [name] of list) {
        if (typeof w[name] !== 'function') return false;
      }
      const deadline = Date.now() + budget;
      while (Date.now() < deadline) {
        // 每轮重新读取：__sgDbg 是每次渲染新建的对象，缓存下来就是过期快照
        const dbg = w.__sgDbg as { isProcessing?: number } | undefined;
        if (dbg?.isProcessing === 0) {
          for (const [name, a] of list) (w[name] as (...xs: unknown[]) => void)(...a);
          return true;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    },
    calls,
    timeoutMs,
  );

describe('端到端：结算前钩子', () => {
  it('孙茹「释衅」免疫火焰伤害、普通伤害照常结算，且结算后主循环没有被锁死', async () => {
    const ctx = await openApp(BASE);
    try {
      expect(await startGameWithHero(ctx.page, '孙茹')).toBe(true);
      // 开局入场仪式期间主循环被门控暂停（BattleIntro 2200ms 起淡出、2600ms 交还），
      // 期间 isProcessing 恒为 0——探针此时喂进去会和仪式结束后的首轮结算撞车。
      // 先等仪式退场再取快照。
      // 实测（3 局，preview）：仪式在点下「确认出战」后 3162 / 3166 / 3183 ms 消失。
      expect(
        await until(ctx.page, 15000, () =>
          ctx.page.evaluate(() => !document.querySelector('.battle-intro'))),
      ).toBe(true);
      expect(await probeReady(ctx.page)).toBe(true);
      await setSpeedLevel(ctx.page, 3);
      // 托管：让 AI 代答【杀】的反应，避免用例被人类决策弹窗卡住
      await enableTakeover(ctx.page);
      await sleep(800);

      const before = await snapshot(ctx.page, 0);
      expect(before.name).toBe('孙茹');

      // 喂 2 点火焰伤害：释衅从 damageBefore 返回 prevent。
      // 等空闲与喂探针合并在一次求值里，理由见 feedProbes 的注释。
      expect(await feedProbes(ctx.page, [['__devDamage', [0, 1, 2, 'fire']]])).toBe(true);

      const prevented = await until(ctx.page, 15000, async () =>
        (await snapshot(ctx.page, 0)).logs.some(l => l.includes('释衅') && l.includes('不受火焰伤害')));
      expect(prevented).toBe(true);

      const afterFire = await snapshot(ctx.page, 0);
      // 引擎走到 prevent 分支并提前返回，没有落到扣血那一段
      expect(afterFire.logs.some(l => l.includes('孙茹 的伤害被技能阻止'))).toBe(true);
      expect(afterFire.logs.some(l => l.includes('孙茹 受到 2 点火焰伤害'))).toBe(false);
      // 血量断言不能用「完全相等」：托管 + 3 倍速下 AI 回合与这段轮询并行，
      // 孙茹完全可能被别的来源（如某次【杀】）扣 1 点，那样严格相等就会误红
      // —— 实测在 CI 上偶发过一次 hp 3→2 的红。
      // 这里要证的是「那 2 点火焰伤害没落地」，所以用差值判别：
      // 火焰伤害正好 2，漏了会掉 ≥2；只有其它来源的 1 点则 <2。
      // 加上面那条「没有受到 2 点火焰伤害」的日志断言，两层各自独立。
      expect(before.hp - afterFire.hp).toBeLessThan(2);

      // ── 结算锁：上一批扩展真正翻车的地方 ──
      // 泄漏时 setIsProcessing 停在 1，主循环 effect 直接 return，整局冻结在
      // 「回合 / 阶段不再变化」。所以断言的是用户能看见的后果：对局还在往前走。
      const advanced = await until(ctx.page, 45000, async () =>
        (await snapshot(ctx.page, 0)).loop.turnIndex !== before.loop.turnIndex);
      expect(advanced).toBe(true);

      // 对照组也走同一条「等空闲 + 喂探针」的原子路径。
      // 原先这里是一次 until(...) 求值后再一次 evaluate：前一次的返回值没人接，
      // 等空闲超时了也会照旧喂伤害——是本次要收掉的第二处同源竞态。
      expect(await feedProbes(ctx.page, [['__devDamage', [0, 1, 1]]])).toBe(true);
      const hurt = await until(ctx.page, 20000, async () => {
        const s = await snapshot(ctx.page, 0);
        return s.logs.some(l => l.includes('孙茹 受到 1 点伤害')) || s.hp < before.hp;
      });
      expect(hurt).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 180000);

  /**
   * 「红颜：方块判定视为红桃」这条玩家可见规则必须成立。
   *
   * 注意这条用例证明的是**结果**成立，不是「judgeBefore 钩子跑了」：
   * 引擎目前是在 performJudgment 更早的地方（App.tsx 的 isXiaoqiao 分支）就把方块
   * 改写成红桃了，等 dispatchJudgeBefore 拿到手，card.suit 已经是红桃，注册在
   * migrated_abilities.ts 里的红颜钩子（守卫 ev.card.suit !== DIAMOND 就返回 null）
   * 永远不会命中——它是死代码。这条已在交付报告里单独提出，不在本测试的修改范围
   * （任务是只加测试、不动产品代码）。
   * 钩子本身的行为由单测 abilityIntegration.test.ts 直接覆盖。
   */
  it('小乔「红颜」：方块判定牌生效为红桃（【乐不思蜀】因此解除）', async () => {
    const ctx = await openApp(BASE);
    try {
      expect(await startGameWithHero(ctx.page, '小乔')).toBe(true);
      // 同释衅：先等入场仪式退场（实测 3162 / 3166 / 3183 ms），仪式期间
      // isProcessing 恒为 0，不代表主循环真的空闲。
      expect(
        await until(ctx.page, 15000, () =>
          ctx.page.evaluate(() => !document.querySelector('.battle-intro'))),
      ).toBe(true);
      expect(await probeReady(ctx.page)).toBe(true);
      expect((await snapshot(ctx.page, 0)).name).toBe('小乔');

      // 构造判定牌前先等对局空闲：__devTrick / __devDeckOnly 都是直接改 ref，
      // 若主循环此刻正在结算（isProcessing > 0），它随后的状态写回会把这批改动
      // 覆盖掉，判定阶段就永远等不到——与释衅那条是同一类竞态。
      //
      // 两个探针合并在**同一次**求值里调用：它们是配套的（先挂延时锦囊、再重建牌堆
      // 保证判定只翻方块），分两次 evaluate 中间那一段就是结算可以插进来的窗口。
      expect(
        await feedProbes(ctx.page, [
          ['__devTrick', [[{ id: 0, cards: ['乐不思蜀'] }]]],
          ['__devDeckOnly', [Array.from({ length: 120 }, () => '♦杀')]],
        ]),
      ).toBe(true);
      // 3) 托管 + 3 倍速，让回合自己推到小乔的判定阶段
      await setSpeedLevel(ctx.page, 3);
      await enableTakeover(ctx.page);

      // 预算 90s → 180s。依据：CI 上共享 runner 一慢，等待就超时误报——
      // 那一次整个文件耗时 118s（此前 33s，慢约 3 倍），断言等的是
      // 「回合自然推进到小乔的判定阶段」，慢机器上就是来不及。
      // 拉长等待不削弱这条用例：条件仍然必须成立，只是给它 3 倍余量。
      // 另外已核对那一次的 CI 日志里「结算停滞」告警为 0 条，
      // 说明是机器慢，不是主循环卡死。
      const judged = await until(ctx.page, 180000, async () =>
        (await snapshot(ctx.page, 0)).logs.some(l => l.includes('小乔 的【乐不思蜀】判定：')));
      expect(judged).toBe(true);

      const line = (await snapshot(ctx.page, 0)).logs.find(l => l.includes('小乔 的【乐不思蜀】判定：'))!;
      // 生效花色是红桃（牌堆整个是方块，翻出来的判定牌不可能是红桃）
      expect(line).toMatch(/判定：♥/);
      expect(line).toContain('触发「红颜」视为红桃');

      // 改写后的花色真的参与了结算：【乐不思蜀】判定为红桃即解除
      const removed = await until(ctx.page, 60000, async () =>
        (await snapshot(ctx.page, 0)).logs.some(l => l.includes('判定为红桃，【乐不思蜀】解除')));
      expect(removed).toBe(true);
    } finally {
      await ctx.close();
    }
    // 用例超时必须大于上面两段等待之和（180s + 60s）再加准备时间
  }, 320000);
});
