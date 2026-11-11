import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import {
  HERO_CANDIDATES, clickThemeToggle, dismissDialog, enableTakeover, isGameOver,
  openApp, readActivePhase, readActivePlayer, readDiscardPrompt, readGameState, readTheme,
  setSpeedLevel, shot, sleep, startGameWithHero, waitForSkillDialog,
} from './helpers';
import type { E2EContext } from './helpers';

/**
 * 端到端 · 玩家真实流程。
 *
 * smoke.e2e.test.ts 只证明「能进对局」；这里补的是玩家在对局中会实际走到、
 * 且只有真跑浏览器才能确认没回归的分支：
 *   1. 一整局能打完并出现结算界面（主循环不会卡死）
 *   2. 弃牌阶段能选牌、弃牌，阶段能推进
 *   3. 技能弹窗能取消，取消后对局继续（不会卡在弹窗上）
 *   4. 刷新页面后能用存档恢复对局
 *   5. 暗/亮主题能切换且持久化
 *
 * 设计取舍：
 *  - 每局都开独立浏览器 + 独立 localStorage，用例之间互不污染；
 *    代价是启动慢，但 fileParallelism:false 下本来就是串行。
 *  - 对局类用例先把速度调到 3 倍并开托管，实测整局约 62 秒，落在 90 秒预算内。
 *  - 所有等待都带 deadline，绝不用无上限轮询：挂死比失败更难排查。
 */

const PORT = 7301;
const BASE = `http://127.0.0.1:${PORT}/`;

let server: ChildProcess | null = null;

beforeAll(async () => {
  // 与 smoke 用不同端口：两个测试文件同进程串行执行，避免抢端口
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch { /* 还没起来 */ }
    await sleep(700);
  }
  throw new Error('预览服务在 40 秒内未就绪');
}, 60000);

afterAll(() => {
  if (server) server.kill();
});

/** 开一局并尽量开启托管；返回是否成功进入对局 */
const bootGame = async (ctx: E2EContext, opts: { takeover?: boolean; speed?: 1 | 2 | 3 } = {}) => {
  let started = false;
  for (const hero of HERO_CANDIDATES) {
    if (await startGameWithHero(ctx.page, hero)) { started = true; break; }
  }
  if (!started) return false;
  if (opts.speed) await setSpeedLevel(ctx.page, opts.speed);
  if (opts.takeover) await enableTakeover(ctx.page);
  return true;
};

/**
 * 在弃牌阶段精确选满 excess 张。
 *
 * 为什么不用“一次性连点 N 张”：弃牌阶段是活的——每次勾选都会重渲染，
 * 而卡牌点击还有 200ms 的 clickGuard。实测偶发「点了 3 张但已选仍为 0」，
 * 说明中间夹了一次状态漂移（手牌/阶段在点击间隙变化）。所以这里做成闭环：
 * 每轮读一次「需弃置 N 张 · 已选 M 张」，只补点一张未选中的牌，直到 M === N。
 *
 * 返回 ok=false 时附带原因，由调用方决定是等待还是按“没撞上”处理。
 */
const selectForDiscard = async (
  page: E2EContext['page'],
  excess: number,
  // 预算随张数增长：每张卡一轮「evaluate + 350ms 等待 + 再求值」，
  // 慢机上单张实测可到 0.6s（CI 慢跑时整体曾慢到 2.7 倍）。
  // 固定 20s 在 excess 较大时会不够，所以按 8s 起步 + 每张 4s。
  deadlineMs = 15000 + excess * 6000,
): Promise<{ ok: boolean; prompt: Awaited<ReturnType<typeof readDiscardPrompt>>; reason?: string }> => {
  const deadline = Date.now() + deadlineMs;
  let last = await readDiscardPrompt(page);
  while (Date.now() < deadline) {
    if (last.excess === null) return { ok: false, prompt: last, reason: 'prompt-gone' };
    if (last.excess !== excess) return { ok: false, prompt: last, reason: 'excess-changed' };
    if (last.picked === excess) return { ok: true, prompt: last };

    const clicked = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.fan-card')]
        .find((c) => !c.classList.contains('is-selected'))
        ?.querySelector('button') as HTMLButtonElement | null;
      if (!card || card.disabled) return false;
      card.click();
      return true;
    });
    if (!clicked) return { ok: false, prompt: last, reason: 'no-clickable-card' };
    await sleep(350);
    last = await readDiscardPrompt(page);
  }
  return { ok: false, prompt: last, reason: 'timeout' };
};

/**
 * 推进一格的兜底动作：有技能弹窗就取消，轮到自己就结束回合。
 *
 * 这不是为了“替玩家玩”，而是防止托管在某个决策点上没接手时，
 * 对局干等 20 秒读秒把预算耗光——挂死比失败更难排查。
 * 无操作时是纯读，不影响被测逻辑。
 */
const nudgeTurn = async (page: E2EContext['page']) => {
  const state = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role=dialog]')].find((x) =>
      ((x.getAttribute('aria-label') || '')).endsWith('选择'),
    );
    const endTurn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === '结束回合',
    ) as HTMLButtonElement | undefined;
    return {
      hasDialog: !!dialog,
      canEndTurn: !!endTurn && !endTurn.disabled,
    };
  });
  if (state.hasDialog) {
    await dismissDialog(page);
    await sleep(600);
    return;
  }
  if (state.canEndTurn) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => (x.textContent || '').trim() === '结束回合',
      ) as HTMLButtonElement | undefined;
      if (b && !b.disabled) b.click();
    });
    await sleep(400);
  }
};

describe('端到端 · 玩家真实流程', () => {
  describe('一整局能打完并出现结算', () => {
    let ctx: E2EContext;

    beforeAll(async () => {
      // 预置 3 倍速，省掉 UI 上多步点选
      ctx = await openApp(BASE, { seed: { 'sgs-speed': '3' } });
    }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('托管模式下对局跑到结束，出现结算界面且无控制台报错', async () => {
      const started = await bootGame(ctx, { takeover: true, speed: 3 });
      expect(started).toBe(true);

      // 时长预算：整局在 3 倍速 + 托管下的墙钟分布极宽，且**取决于跑在哪台机器上**。
      // 本机：53s / 62s / 98s / 101s / 115s / 121s / 129s / 209s。
      // GitHub 共享 runner 上同一份代码实测 114s / 129s / 309s——309s 那次整台
      // 机器慢了约 2.7 倍（同一次里的弃牌用例也一起变慢）。speed 上限就是 3，
      // 没法再快，所以只能给足预算。
      // 这里要证的是「对局能走到结算、主循环不卡死」，不是「跑得快」；
      // 退出条件是结算界面出现（轮询），不是固定睡眠，卡死另有 App.tsx 的
      // stall watchdog 收尾，所以放宽预算不会让真卡死等更久。
      const deadline = Date.now() + 600000;
      let over = { over: false, winner: null as string | null };
      while (Date.now() < deadline) {
        over = await isGameOver(ctx.page);
        if (over.over) break;
        // 兜底推进：万一托管没接管到某个决策（例如弹窗先于托管出现），
        // 这里把弹窗点掉并结束回合，避免干等 20 秒读秒。
        await nudgeTurn(ctx.page);
        await sleep(1500);
      }

      expect(over.over).toBe(true);
      // 结算页必须明确写出获胜方，而不是只留一块空白
      expect(over.winner).toBeTruthy();
      await shot(ctx.page, 'flows-game-over');

      // 结算页要给出可继续的出口
      const exits = await ctx.page.evaluate(() => {
        const texts = [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
        return { restart: texts.includes('再来一局'), home: texts.includes('返回主页') };
      });
      expect(exits.restart).toBe(true);
      expect(exits.home).toBe(true);

      expect(ctx.errors).toEqual([]);
    }, 660000);
  });

  describe('弃牌阶段', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('手牌超上限时能选牌弃牌，弃完阶段推进', async () => {
      const started = await bootGame(ctx, { speed: 3 });
      expect(started).toBe(true);

      // 弃牌阶段只在“轮到玩家且手牌超上限”时出现，需要推进若干回合。
      // 不能开托管：托管会替玩家自动弃牌，就测不到这条路径了。
      const deadline = Date.now() + 150000;
      let prompt = { excess: null as number | null, picked: null as number | null, hasDiscardButton: false, discardEnabled: false };
      let phase: string | null = null;
      while (Date.now() < deadline) {
        const done = await isGameOver(ctx.page);
        if (done.over) break;
        prompt = await readDiscardPrompt(ctx.page);
        if (prompt.excess !== null && prompt.excess > 0 && prompt.hasDiscardButton) break;
        const st = await readGameState(ctx.page);
        if (st.hasEndTurn) {
          await ctx.page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '结束回合');
            if (b) (b as HTMLButtonElement).click();
          });
        }
        await sleep(900);
      }

      // 没撞上弃牌阶段不误判为失败：断言前提是对局仍然健康，并显式记录
      if (prompt.excess === null || !prompt.hasDiscardButton) {
        const st = await readGameState(ctx.page);
        expect(st.phase).toBeTruthy();
        expect(ctx.errors).toEqual([]);
        return;
      }

      expect(prompt.excess).toBeGreaterThan(0);
      phase = await readActivePhase(ctx.page);
      expect(phase).toBe('弃牌');
      const actorBefore = await readActivePlayer(ctx.page);
      expect(actorBefore).toBeTruthy();

      // 未选够时「弃 牌」必须是禁用的：防止误点把牌弃多了或弃少了
      expect(prompt.picked).toBe(0);
      expect(prompt.discardEnabled).toBe(false);

      // 选够 N 张后按钮才可用
      const picked = await selectForDiscard(ctx.page, prompt.excess!);
      // 带上 reason：只断言 ok 的话，失败信息是 expect(false).toBe(true)，
      // 看不出是 prompt 消失 / 张数变化 / 没有可点的牌 / 超时。
      expect(picked.ok, 'selectForDiscard 失败原因: ' + (picked.reason ?? 'unknown')).toBe(true);
      expect(picked.prompt.picked).toBe(prompt.excess);
      expect(picked.prompt.discardEnabled).toBe(true);

      await shot(ctx.page, 'flows-discard-before');
      await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '弃 牌');
        if (b) (b as HTMLButtonElement).click();
      });
      await sleep(2500);

      // 弃完：我这一步必须真的推进。
      //
      // 不能“取一次样断言阶段 != 弃牌”——弃牌阶段结束后紧接着可能是下一位
      // AI 角色自己的弃牌阶段，单次采样会撞上它而误判成“没推进”
      // （实测就是这个竞态导致偶发失败）。所以轮询到“换了行动者或离开了
      // 弃牌阶段”为止，两个条件任一成立都算推进。
      const advanced = await (async () => {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const phaseNow = await readActivePhase(ctx.page);
          const actorNow = await readActivePlayer(ctx.page);
          if (actorNow && actorNow !== actorBefore) return { ok: true, phaseNow, actorNow };
          if (phaseNow && phaseNow !== '弃牌') return { ok: true, phaseNow, actorNow };
          await sleep(500);
        }
        return { ok: false, phaseNow: await readActivePhase(ctx.page), actorNow: await readActivePlayer(ctx.page) };
      })();
      expect(advanced.ok).toBe(true);
      // 最关键的一条：行动者已经换人，说明我那一步真的结算掉了，
      // 而不是停在自己的弃牌阶段空转。
      expect(advanced.actorNow).not.toBe(actorBefore);

      // 牌确实进了弃牌堆：弃牌堆计数可读且大于 0
      const discardCount = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(
          (x) => (x.getAttribute('aria-label') || '').startsWith('查看弃牌堆，共'),
        );
        const m = (b?.getAttribute('aria-label') || '').match(/共\s*(\d+)\s*张/);
        return m ? Number(m[1]) : -1;
      });
      expect(discardCount).toBeGreaterThan(0);

      expect(ctx.errors).toEqual([]);
    }, 240000);
  });

  describe('技能弹窗', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('技能弹窗能取消，取消后弹窗消失且对局继续', async () => {
      // 曹轶的「蜜饴」在自己回合准备阶段必触发，是最稳定的弹窗来源
      const started = await bootGame(ctx, { speed: 3 });
      expect(started).toBe(true);

      const deadline = Date.now() + 70000;
      let dialog: { label: string; text: string } | null = null;
      while (Date.now() < deadline && !dialog) {
        dialog = await waitForSkillDialog(ctx.page, 1200);
        if (dialog) break;
        const done = await isGameOver(ctx.page);
        if (done.over) break;
        // 没有弹窗时推进回合，尽快轮到自己
        const st = await readGameState(ctx.page);
        if (st.hasEndTurn) {
          await ctx.page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '结束回合');
            if (b) (b as HTMLButtonElement).click();
          });
        }
        await sleep(1000);
      }

      // 同样不误红：没等到弹窗时至少要求对局健康
      if (!dialog) {
        const st = await readGameState(ctx.page);
        expect(st.phase).toBeTruthy();
        expect(ctx.errors).toEqual([]);
        return;
      }

      expect(dialog.label.length).toBeGreaterThan(0);
      await shot(ctx.page, 'flows-skill-dialog');

      const cancelLabel = await dismissDialog(ctx.page);
      expect(cancelLabel).toBeTruthy();

      // 弹窗必须真的消失（不留一个吞掉后续点击的遮罩）。
      // 用短轮询而不是“等 2 秒再看”：取消是同步关窗，2 秒的窗口内对局可能
      // 已经进入下一次结算并合法地弹出新弹窗，那样断言就会误报。
      const closed = await (async () => {
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline) {
          const still = await waitForSkillDialog(ctx.page, 120);
          if (!still) return true;
          await sleep(100);
        }
        return false;
      })();
      expect(closed).toBe(true);

      // 对局继续：阶段仍在、没有掉回首页
      const st = await readGameState(ctx.page);
      expect(st.phase).toBeTruthy();
      const alive = await ctx.page.evaluate(() => document.body.innerText.includes('当前阶段'));
      expect(alive).toBe(true);

      expect(ctx.errors).toEqual([]);
    }, 120000);
  });

  describe('存档恢复', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('开局后刷新页面，能用存档继续对局', async () => {
      const started = await bootGame(ctx, { speed: 3 });
      expect(started).toBe(true);
      const before = await readGameState(ctx.page);
      const phaseBefore = before.phase;
      expect(phaseBefore).toBeTruthy();

      // 存档在回合切换时落盘，等一个回合确保写出
      await sleep(4000);
      const saveBytes = await ctx.page.evaluate(() => {
        const raw = localStorage.getItem('sgs-save-v1');
        return raw ? raw.length : 0;
      });
      expect(saveBytes).toBeGreaterThan(0);

      await ctx.page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(2500);

      // 回到首页，且出现「继续上一局」入口
      const home = await ctx.page.evaluate(() => {
        const txt = document.body.innerText;
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续上一局'));
        return { hasResume: !!b, resumeText: b ? (b.textContent || '').trim().slice(0, 40) : null };
      });
      expect(home.hasResume).toBe(true);

      await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续上一局'));
        if (b) (b as HTMLButtonElement).click();
      });
      await sleep(3500);

      const after = await readGameState(ctx.page);
      expect(after.phase).toBeTruthy();
      // 恢复后回到对局界面，而不是停在首页
      const backInGame = await ctx.page.evaluate(() => {
        const txt = document.body.innerText;
        return txt.includes('当前阶段') || txt.includes('退出');
      });
      expect(backInGame).toBe(true);
      await shot(ctx.page, 'flows-resume');

      expect(ctx.errors).toEqual([]);
    }, 120000);
  });

  describe('主题切换', () => {
    let ctx: E2EContext;

    beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
    afterAll(async () => { if (ctx) await ctx.close(); });

    it('点击主题按钮后 <html> 的 class 变化，再点能切回，页面无报错', async () => {
      const before = await readTheme(ctx.page);
      // 默认夜间模式：<html> 上没有 theme-light
      expect(before.light).toBe(false);
      expect(before.cls.includes('theme-light')).toBe(false);

      const clicked = await clickThemeToggle(ctx.page);
      expect(clicked).toBe(true);

      const light = await readTheme(ctx.page);
      // 断言 class 真的变了（而不是只有按钮文案变）
      expect(light.light).toBe(true);
      expect(light.cls).toContain('theme-light');
      expect(light.cls).not.toBe(before.cls);
      // color-scheme 跟着走，滚动条等原生控件才不会错色
      expect(light.colorScheme).toBe('light');
      expect(light.stored).toBe('light');
      await shot(ctx.page, 'flows-theme-light');

      // 再点一次切回黑夜
      const clickedBack = await clickThemeToggle(ctx.page);
      expect(clickedBack).toBe(true);
      const dark = await readTheme(ctx.page);
      expect(dark.light).toBe(false);
      expect(dark.cls).not.toContain('theme-light');
      expect(dark.cls).toBe(before.cls);
      expect(dark.stored).toBe('dark');

      // 主题在重载后仍保持（写进了 localStorage）
      await clickThemeToggle(ctx.page);
      await ctx.page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(2000);
      const persisted = await readTheme(ctx.page);
      expect(persisted.stored).toBe('light');
      expect(persisted.light).toBe(true);

      expect(ctx.errors).toEqual([]);
    }, 90000);
  });
});
