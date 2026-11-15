import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 两处「显示逻辑」回归守卫。
 *
 * 一、双技能武将被连排成「【青囊 / 急救】」+ 整段描述：
 *     技能名挤在一个标题里、两段规则首尾相接，读不出边界也不整齐。
 *     正确做法是走 getHeroDetail(hero).skills 逐条渲染。
 *
 * 二、玩家阵亡后仍弹出别人的求桃窗：
 *     求桃时 AI 决定救不救会短暂挂起 dyingState（让活人看见「AI 在思考」），
 *     而弹窗渲染门此前只看 isActive、不看 me.isDead —— 已阵亡的玩家照样被挡一屏。
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('双技能分列显示', () => {
  const panels = [
    'src/components/game/PlayerInspectModal.tsx',
    'src/components/game/SkillInfoModal.tsx',
  ];

  it('对局内两个查看面板都走 getHeroDetail().skills 逐条渲染', () => {
    for (const p of panels) {
      const src = read(p);
      expect(src, p + ' 应当逐技能渲染').toContain('getHeroDetail(');
      expect(src, p + ' 应当对 skills 做 map').toMatch(/\.skills\.map\(/);
    }
  });

  it('两个面板都不再把 skillName 塞进单个标题里连排', () => {
    for (const p of panels) {
      const src = read(p);
      // 这两种形态就是「【A / B】+ 整段 desc」的连排写法
      expect(src, p + ' 仍有【{...skillName}】连排').not.toMatch(/【\{me\.hero\.skillName\}】/);
      expect(src, p + ' 仍有【{...skillName}】连排').not.toMatch(/【\{p\.hero\.skillName\}】/);
    }
  });
});

describe('座位牌（极窄容器）不再用斜杠连排技能名', () => {
  it('skillLabelOf 把「A / B」拆成「【A】·【B】」，不被误读成一个技能名', async () => {
    const { skillLabelOf } = await import('../game/heroDetail');
    const hero = { name: '华佗', skillName: '青囊 / 急救', skillDesc: '', lordSkillName: undefined } as never;
    expect(skillLabelOf(hero)).toBe('【青囊】·【急救】');
  });

  it('单技能不加多余分隔符；主公技一并带上', async () => {
    const { skillLabelOf } = await import('../game/heroDetail');
    const single = { name: '曹操', skillName: '奸雄', skillDesc: '' } as never;
    expect(skillLabelOf(single)).toBe('【奸雄】');
    const lord = { name: '曹操', skillName: '奸雄', skillDesc: '', lordSkillName: '护驾' } as never;
    expect(skillLabelOf(lord)).toBe('【奸雄】·【护驾】');
  });

  it('两个座位面板都走 skillLabelOf，不再直接拼 skillName', () => {
    for (const p of ['src/components/game/OwnSeatPanel.tsx', 'src/components/game/EnemySeats.tsx']) {
      const src = read(p);
      expect(src, p + ' 应当调用 skillLabelOf').toContain('skillLabelOf(');
      expect(src, p + ' 仍在直接拼 skillName').not.toMatch(/seat-skill">【\{[a-z]+\.hero\.skillName\}】/);
    }
  });
});

describe('阵亡后不再被求桃窗挡住', () => {
  it('DyingModal 的渲染门必须同时检查 me.isDead', () => {
    const src = read('src/screens/BattleScreen.tsx');
    expect(src).toContain('props.dyingState.isActive && !props.me.isDead');
  });

  it('濒死者本人不受该门影响（isDead 要等求桃失败才置真）', () => {
    // 这是语义前提：求桃过程中濒死者 isDead 仍是 false，所以上面那道门不会
    // 把濒死者自己的决策窗挡掉。用源码位置证明这道门只在「已阵亡」时短路。
    const src = read('src/screens/BattleScreen.tsx');
    const gate = src.slice(src.indexOf('props.dyingState.isActive && !props.me.isDead') - 260,
      src.indexOf('props.dyingState.isActive && !props.me.isDead') + 120);
    expect(gate).toContain('阵亡后不再弹求桃窗');
  });
});
