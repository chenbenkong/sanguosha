import { registerSkill } from './registry';
import type { SkillContext } from './registry';
import type { Player } from '../../../types';

/**
 * 第六批女将 · 第 10 组。
 *
 * 本组 6 个技能里只有来莺儿「绡舞」能用现有钩子**完整**实现，故只装它一个；
 * 其余 5 个（曹华「彩翼」「归离」、滕公主「幸宠」「流年」、来莺儿「化萍」）
 * 都缺引擎原语，已在交付报告里 hand_back，这里不写任何降级版本。
 *
 * ── 来莺儿「绡舞」────────────────────────────────────
 * 原文：出牌阶段限一次，你可以选择你的上家或下家并选择一名终止角色，
 * 这些角色按此方向选择一项：1.令你摸一张牌；2.摸一张牌。
 * 若选择令你/令自己摸牌的角色较多，你获得1个“沙”标记/你对令自己摸牌的角色各造成1点伤害。
 *
 * 触发点：SkillHooks 里没有「出牌阶段」（registry.ts:130-195 的 18 个钩子最接近的是
 * onTurnEnd），主动技统一挂阶段边界 + requestChoice —— 与「才韵」「复学」「讽言」
 * 同一形状（batch6new.ts:129-159 / 231-255 / 591-629）。这里挂**自己**的 onTurnEnd，
 * 问的就是「出牌阶段是否发动」。
 * 「限一次」的复位点是 onTurnStart（对任意角色的回合开始都分发），不能拿 turnOwner.id
 * 当 key（batch6new.ts:263-266 记过这条教训）。
 *
 * 方向与终止角色：「下家 / 上家」= 座位顺序上的相邻存活角色。座位顺序就是 id 顺序
 * （rules.ts:42 nextAliveTurnIndex 用 (id+1) % n 推进），所以下家是 id 更大一侧、上家是
 * 更小一侧，环形回绕；终止角色只能从该方向的队列里选，链条从相邻角色到它（含）为止。
 *
 * 链条里每个人的「选择一项」：引擎的 requestChoice 服务的是**人类玩家本人**
 * （registry.ts:33-36：AI 与托管返回 null，技能据此走自动分支），所以逐人判定
 * p.isHuman 才弹窗，其余按托管策略。托管策略原文没有规定（决定权在角色手中），
 * 这里明确取「2.摸一张牌」——自利默认，且写死让对局可复现；人类玩家的取消 / 超时
 * 同样落到这条策略上（不额外发明「拒绝选择」这种原文没有的状态）。
 *
 * 「沙」标记走 ctx.addMark（dispatch.ts:146-150 的通用标记，落在 heroMemory 里）：
 * 将来「化萍」移去「沙」标记、「☆ 沙舞」消耗 1 个「沙」标记时读的是同一份计数。
 */
const SHA_MARK = '沙';

/** 存活角色按座位（id）顺序 —— 与 rules.ts 的推进口径一致 */
const ringBySeat = (ctx: SkillContext): Player[] =>
  ctx.players.filter(p => !p.isDead).sort((a, b) => a.id - b.id);

registerSkill({
  hero: '来莺儿',
  // 注册名必须与 HEROES.skillName 逐字一致，否则永不触发。
  skill: '绡舞',
  hooks: {
    onTurnStart: (ctx: SkillContext) => { delete ctx.memory.usedThisTurn; },
    onTurnEnd: async (ctx: SkillContext, ending: Player) => {
      if (ending.id !== ctx.self.id) return;
      if (ctx.memory.usedThisTurn) return;
      const ring = ringBySeat(ctx);
      const selfIdx = ring.findIndex(p => p.id === ctx.self.id);
      // 没有其他存活角色就没有「上/下家」，也无处选终止角色
      if (selfIdx < 0 || ring.length < 2) return;

      const dir = await ctx.requestChoice({
        title: '绡舞：选择方向',
        hint: '先选上家或下家，再选一名终止角色',
        mode: 'choose',
        choices: [
          { id: 'next', label: '下家方向', desc: '沿座位向下（id 更大）' },
          { id: 'prev', label: '上家方向', desc: '沿座位向上（id 更小）' },
        ],
        cancelLabel: '不发动',
      });
      if (dir && dir.kind === 'cancel') return;
      const forward = !(dir && dir.kind === 'choose' && dir.id === 'prev');

      // 该方向上从相邻角色到最远角色（不含自己），顺序即行动顺序
      const line: Player[] = [];
      for (let step = 1; step < ring.length; step++) {
        const idx = ((forward ? selfIdx + step : selfIdx - step) % ring.length + ring.length) % ring.length;
        line.push(ring[idx]);
      }

      const stop = await ctx.requestChoice({
        title: '绡舞：选择一名终止角色',
        hint: '从' + (forward ? '下家' : '上家') + '到该角色（含）的角色各选择一项',
        mode: 'target',
        targets: line.map((p, i) => ({
          id: p.id,
          name: p.hero.name,
          sub: (i + 1) + ' 名参与 · 手牌 ' + p.hand.length,
        })),
        min: 1,
        max: 1,
        cancelLabel: '不发动',
      });
      if (stop && stop.kind === 'cancel') return;
      const stopIdx = stop && stop.kind === 'target'
        ? line.findIndex(p => p.id === Number(stop.ids?.[0]))
        : -1;
      // AI / 托管：取方向上最远的一名（让尽量多的角色参与，不替玩家裁剪）
      const chain = line.slice(0, stopIdx >= 0 ? stopIdx + 1 : line.length);

      const mineList: boolean[] = [];
      for (const p of chain) {
        if (!p.isHuman) { mineList.push(false); continue; }
        const r = await ctx.requestChoice({
          title: '绡舞：' + p.hero.name + ' 选择一项',
          hint: '1.令 ' + ctx.self.hero.name + ' 摸一张牌；2.自己摸一张牌',
          mode: 'choose',
          choices: [
            { id: 'you', label: '令 ' + ctx.self.hero.name + ' 摸一张牌' },
            { id: 'self', label: '自己摸一张牌' },
          ],
          cancelLabel: '放弃（按自己摸牌处理）',
        });
        mineList.push(!!(r && r.kind === 'choose' && r.id === 'you'));
      }
      const mineCount = mineList.filter(Boolean).length;
      const ownCount = mineList.length - mineCount;

      for (let i = 0; i < chain.length; i++) {
        ctx.draw(mineList[i] ? ctx.self.id : chain[i].id, 1);
      }
      ctx.log('【绡舞】' + ctx.self.hero.name + ' 选' + (forward ? '下家' : '上家') + '方向至 '
        + chain[chain.length - 1].hero.name + '：' + chain.length + ' 名角色参与，令其摸牌 '
        + mineCount + ' / 自己摸牌 ' + ownCount);

      if (mineCount > ownCount) {
        ctx.addMark(SHA_MARK, 1);
        ctx.log('【绡舞】令' + ctx.self.hero.name + '摸牌的角色较多，' + ctx.self.hero.name
          + ' 获得 1 个「' + SHA_MARK + '」标记（当前 ' + ctx.markCount(SHA_MARK) + ' 个）');
        ctx.banner();
      } else if (ownCount > mineCount) {
        const victims = chain.filter((_, i) => !mineList[i]);
        for (const v of victims) await ctx.damage(v.id, ctx.self.id, 1);
        ctx.log('【绡舞】选择自己摸牌的角色较多，' + ctx.self.hero.name + ' 对 '
          + victims.map(v => v.hero.name).join('、') + ' 各造成 1 点伤害');
        ctx.banner();
      } else {
        ctx.log('【绡舞】两侧人数相同（无「较多」），不产生额外效果');
      }
      ctx.memory.usedThisTurn = true;
    },
  },
});
