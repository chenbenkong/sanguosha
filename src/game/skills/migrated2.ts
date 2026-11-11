import { registerSkill } from './registry';
import type { SkillContext } from './registry';

/**
 * 迁移批次 2（清单 chunk2.txt）：把 App.tsx 结束阶段的内联分支搬进注册表。
 *
 * 选型标准：只搬「SkillContext 能完全表达」的技能 —— 触发条件、副作用（摸牌/日志/横幅）
 * 都不需要读牌堆内容、不需要改 App 的 ref/state、不需要判定牌。
 * 清单里其余条目与 App/combat 的交互状态深度耦合（逐条理由见交付报告），
 * 硬搬会改变规则，故保留内联并在原处标注。
 *
 * 等价性说明：三处实现逐字搬运，唯一差异是注册表统一按 skillsOn 过滤 ——
 * 被「倾城」封印 / 武将移除的角色不再触发（原内联分支没有这道判断，属漏判）。
 */

// ── 张春华「伤逝」：回合结束时，手牌少于已损失体力则补至该值 ──
registerSkill({
  hero: '张春华',
  skill: '伤逝',
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      const lostHp = ending.maxHp - ending.hp;
      const deficit = lostHp - ending.hand.length;
      if (deficit > 0) {
        ctx.log(`${ending.hero.name} 发动「伤逝」，摸 ${deficit} 张牌补至已损失体力`);
        ctx.draw(ending.id, deficit);
      }
    },
  },
});

// ── 貂蝉「闭月」：回合结束时摸一张牌 ──
registerSkill({
  hero: '貂蝉',
  skill: '闭月',
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      ctx.log(`${ending.hero.name} 发动「闭月」，摸一张牌`);
      ctx.banner();
      ctx.draw(ending.id, 1);
    },
  },
});

// ── 曹婴「伏间」（锁定技）：结束阶段若全场角色均有手牌，
//    随机观看一名其他角色 X 张手牌（X 为全场最少手牌数）──
registerSkill({
  hero: '曹婴',
  skill: '伏间',
  locked: true,
  hooks: {
    onTurnEnd: (ctx: SkillContext, ending) => {
      if (ending.id !== ctx.self.id) return;
      const alive = ctx.players.filter(p => !p.isDead);
      if (!alive.every(p => p.hand.length > 0)) return;
      const others = alive.filter(p => p.id !== ending.id);
      if (others.length === 0) return;
      const x = Math.min(...alive.map(p => p.hand.length));
      const viewed = others[Math.floor(Math.random() * others.length)];
      const cards = viewed.hand.slice(0, x).map(c => `【${c.name}】`).join('、');
      ctx.log(`【伏间】曹婴观看 ${viewed.hero.name} 的 ${x} 张手牌：${cards}`);
      ctx.banner();
    },
  },
});
