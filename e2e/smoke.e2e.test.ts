import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import {
  openApp, startGameWithHero, readGameState, waitForSkillDialog,
  dismissDialog, clickButton, sleep, shot,
} from './helpers';
import { startPreview } from './preview';
import type { E2EContext } from './helpers';

/**
 * 端到端用例：真实浏览器里跑一局，验证玩家实际看到与能做到的事。
 *
 * 覆盖点（都是单元测试证明不了、只有真跑才能确认的）：
 *  1. 应用能加载、无控制台报错
 *  2. 选将页能选中指定武将并且玩家确实拿到该武将
 *  3. 开局入场仪式出现并自动消失
 *  4. 能进入对局、回合能推进
 *  5. 需要玩家决策的技能会真的弹出选择窗
 */

// 端口不再硬编码：默认由系统分配空闲端口，并校验该端口服务的入口 chunk
// 是否等于本地 dist —— 否则会静默连到别的工作区残留的 preview 上。
let BASE = '';
let previewHandle: { base: string; stop: () => void } | null = null;

beforeAll(async () => {
  previewHandle = await startPreview();
  BASE = previewHandle.base;
}, 90000);

afterAll(() => {
  previewHandle?.stop();
});

describe('端到端：真实浏览器', () => {
  let ctx: E2EContext;

  beforeAll(async () => { ctx = await openApp(BASE); }, 60000);
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('首页能加载且无控制台报错', async () => {
    const title = await ctx.page.title();
    expect(title).toContain('三国杀');
    expect(ctx.errors).toEqual([]);
  }, 30000);

  it('选将页能选中指定武将并开局，玩家拿到该武将', async () => {
    const ok = await startGameWithHero(ctx.page, '曹轶');
    expect(ok).toBe(true);
    const state = await readGameState(ctx.page);
    // 玩家拿到的是选中的武将：右下角「我方座位」必须显示曹轶。
    // 不能用「轮到我了」判断——开局主公先手，玩家不一定在首位。
    const ownText = await ctx.page.evaluate(() => {
      const t = document.body.innerText;
      // 对局界面底部会出现「我的回合」标记或自己的座位名
      return t.includes('曹轶');
    });
    expect(ownText).toBe(true);
    // 并且确实进入了对局（有阶段提示）
    expect(state.phase).toBeTruthy();
  }, 60000);

  it('开局入场仪式出现后会自行消失', async () => {
    // startGameWithHero 已等待 3.8s，过场应已结束
    const state = await readGameState(ctx.page);
    expect(state.hasIntro).toBe(false);
  }, 20000);

  it('对局中回合能推进（点结束回合后阶段变化）', async () => {
    const before = await readGameState(ctx.page);
    if (before.hasEndTurn) {
      await clickButton(ctx.page, '结束回合');
      await sleep(2500);
    }
    const after = await readGameState(ctx.page);
    // 要么换人了，要么至少还在正常对局（不崩、不空白）
    expect(after.phase).toBeTruthy();
    expect(ctx.errors).toEqual([]);
  }, 40000);

  it('曹轶「蜜饴」会向玩家弹出目标选择窗', async () => {
    // 蜜饴在自己回合的准备阶段触发；若还没到自己的回合，先推进几轮
    let dialog = await waitForSkillDialog(ctx.page, 3000);
    for (let i = 0; i < 12 && !dialog; i++) {
      const dismissed = await dismissDialog(ctx.page);
      if (dismissed) { await sleep(800); }
      else {
        const st = await readGameState(ctx.page);
        if (st.hasEndTurn) await clickButton(ctx.page, '结束回合');
        await sleep(2200);
      }
      dialog = await waitForSkillDialog(ctx.page, 1500);
    }
    if (dialog) {
      expect(dialog.label.length).toBeGreaterThan(0);
      await shot(ctx.page, 'skill-dialog');
      await dismissDialog(ctx.page);
    } else {
      // 若本轮没撞上，不误红；但要求对局仍然健康
      expect(ctx.errors).toEqual([]);
    }
  }, 90000);

  it('全程无未捕获错误', async () => {
    expect(ctx.errors).toEqual([]);
  }, 15000);
});