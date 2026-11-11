import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { enableTakeover, openApp, setSpeedLevel, sleep, startGameWithHero } from './helpers';
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

const PORT = 7452;
const BASE = `http://127.0.0.1:${PORT}/`;

let server: ChildProcess | null = null;

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
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isOurDevServer()) return;
    await sleep(700);
  }
  throw new Error(`端口 ${PORT} 上没等到本仓库的 vite dev server（可能被别的进程占用）`);
}, 90000);

afterAll(() => {
  if (server) server.kill();
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

describe('端到端：结算前钩子', () => {
  it('孙茹「释衅」免疫火焰伤害、普通伤害照常结算，且结算后主循环没有被锁死', async () => {
    const ctx = await openApp(BASE);
    try {
      expect(await startGameWithHero(ctx.page, '孙茹')).toBe(true);
      expect(await probeReady(ctx.page)).toBe(true);
      await setSpeedLevel(ctx.page, 3);
      // 托管：让 AI 代答【杀】的反应，避免用例被人类决策弹窗卡住
      await enableTakeover(ctx.page);
      await sleep(800);

      const before = await snapshot(ctx.page, 0);
      expect(before.name).toBe('孙茹');

      // 喂 2 点火焰伤害：释衅从 damageBefore 返回 prevent
      await ctx.page.evaluate(() => {
        (window as unknown as { __devDamage: (v: number, s: number, a: number, n?: string) => void })
          .__devDamage(0, 1, 2, 'fire');
      });

      const prevented = await until(ctx.page, 15000, async () =>
        (await snapshot(ctx.page, 0)).logs.some(l => l.includes('释衅') && l.includes('不受火焰伤害')));
      expect(prevented).toBe(true);

      const afterFire = await snapshot(ctx.page, 0);
      // 引擎走到 prevent 分支并提前返回，没有落到扣血那一段
      expect(afterFire.logs.some(l => l.includes('孙茹 的伤害被技能阻止'))).toBe(true);
      expect(afterFire.logs.some(l => l.includes('孙茹 受到 2 点火焰伤害'))).toBe(false);
      expect(afterFire.hp).toBe(before.hp);

      // ── 结算锁：上一批扩展真正翻车的地方 ──
      // 泄漏时 setIsProcessing 停在 1，主循环 effect 直接 return，整局冻结在
      // 「回合 / 阶段不再变化」。所以断言的是用户能看见的后果：对局还在往前走。
      const advanced = await until(ctx.page, 45000, async () =>
        (await snapshot(ctx.page, 0)).loop.turnIndex !== before.loop.turnIndex);
      expect(advanced).toBe(true);

      // 对照：普通伤害不被释衅拦截，体力真的会掉
      await ctx.page.evaluate(() => {
        (window as unknown as { __devDamage: (v: number, s: number, a: number, n?: string) => void })
          .__devDamage(0, 1, 1);
      });
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
      expect(await probeReady(ctx.page)).toBe(true);
      expect((await snapshot(ctx.page, 0)).name).toBe('小乔');

      // 1) 给小乔挂一张【乐不思蜀】，她的判定阶段必定做一次判定
      await ctx.page.evaluate(() => {
        (window as unknown as { __devTrick: (spec: Array<{ id: number; cards: string[] }>) => void })
          .__devTrick([{ id: 0, cards: ['乐不思蜀'] }]);
      });
      // 2) 牌堆重建成「方块杀」：判定牌只可能翻出方块
      await ctx.page.evaluate((names) => {
        (window as unknown as { __devDeckOnly: (n: string[]) => void }).__devDeckOnly(names);
      }, Array.from({ length: 120 }, () => '♦杀'));
      // 3) 托管 + 3 倍速，让回合自己推到小乔的判定阶段
      await setSpeedLevel(ctx.page, 3);
      await enableTakeover(ctx.page);

      const judged = await until(ctx.page, 90000, async () =>
        (await snapshot(ctx.page, 0)).logs.some(l => l.includes('小乔 的【乐不思蜀】判定：')));
      expect(judged).toBe(true);

      const line = (await snapshot(ctx.page, 0)).logs.find(l => l.includes('小乔 的【乐不思蜀】判定：'))!;
      // 生效花色是红桃（牌堆整个是方块，翻出来的判定牌不可能是红桃）
      expect(line).toMatch(/判定：♥/);
      expect(line).toContain('触发「红颜」视为红桃');

      // 改写后的花色真的参与了结算：【乐不思蜀】判定为红桃即解除
      const removed = await until(ctx.page, 25000, async () =>
        (await snapshot(ctx.page, 0)).logs.some(l => l.includes('判定为红桃，【乐不思蜀】解除')));
      expect(removed).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 180000);
});
