import { describe, expect, it } from 'vitest';
import { makeHarness, mkPlayer } from './testHarness';
import { dispatchTurnEnd } from './dispatch';
import { registerSkill } from './registry';

/**
 * 通用标记系统：本人 / 跨角色。
 *
 * 跨角色这条是张楚「集众」「光噬」的前置条件——「所有其他角色是否都有信众」
 * 必须真的能查到别人身上的标记，不能靠技能自己记在 memory 里糊过去。
 */
describe('通用标记', () => {
  it('默认作用于本人', async () => {
    let n = 0;
    registerSkill({
      hero: '标记将',
      skill: '标记技',
      hooks: {
        onTurnEnd: (ctx) => {
          ctx.addMark('绞');
          ctx.addMark('绞', 2);
          n = ctx.markCount('绞');
          expect(ctx.marks()['绞']).toBe(3);
        },
      },
    });
    const a = mkPlayer({ id: 0, name: '标记将' });
    const b = mkPlayer({ id: 1, name: '他人' });
    const { deps } = makeHarness([a, b]);
    await dispatchTurnEnd(deps, b);
    expect(n).toBe(3);
  });

  it('传 playerId 时标记落在对方身上，本人身上必须为 0', async () => {
    /*
     * 这条断言的第一版是**假阳性**：写入与读取都忽略 playerId 时，
     * 标记会落在自己身上、又被自己读回来，同样得到 2，测试照过。
     * 当时那句「自己身上不该有」写成了 expect(a.hero.name).toBe('贴标记将') ——
     * 对夹具的恒真断言，什么都没验证。
     *
     * 现在改成真正能失败的口径：贴完之后
     *   1) 不带 id 读本人 → 必须是 0（旧实现会读到 2）；
     *   2) 本人 marks() 里不含该标记名；
     *   3) 对方 marks(id) 里必须是 2。
     */
    let selfCount = -1;
    let selfMarks: Record<string, number> = {};
    let targetCount = -1;
    registerSkill({
      hero: '贴标记将',
      skill: '贴标记技',
      hooks: {
        onTurnEnd: (ctx) => {
          ctx.addMark('信众', 2, 1);
          selfCount = ctx.markCount('信众');        // 不带 id = 本人
          selfMarks = ctx.marks();                  // 本人全部标记
          targetCount = ctx.markCount('信众', 1);   // 指定对方
        },
      },
    });
    const a = mkPlayer({ id: 0, name: '贴标记将' });
    const b = mkPlayer({ id: 1, name: '被贴者' });
    const { deps } = makeHarness([a, b]);
    await dispatchTurnEnd(deps, b);
    expect(selfCount).toBe(0);
    expect(selfMarks['信众']).toBeUndefined();
    expect(targetCount).toBe(2);
  });

  it('removeMark 不会减到负数，并返回实际移去数量', async () => {
    let removed = -1;
    let after = -1;
    registerSkill({
      hero: '移除将',
      skill: '移除技',
      hooks: {
        onTurnEnd: (ctx) => {
          ctx.addMark('绞', 1);
          removed = ctx.removeMark('绞', 5); // 只有 1 个，请求移 5
          after = ctx.markCount('绞');
        },
      },
    });
    const a = mkPlayer({ id: 0, name: '移除将' });
    const b = mkPlayer({ id: 1, name: '他人2' });
    const { deps } = makeHarness([a, b]);
    await dispatchTurnEnd(deps, b);
    expect(removed).toBe(1);
    expect(after).toBe(0);
  });

  it('标记不影响既有的 Player.*Marks 字段（互不干扰）', async () => {
    registerSkill({
      hero: '并存将',
      skill: '并存技',
      hooks: { onTurnEnd: (ctx) => { ctx.addMark('后土'); } },
    });
    const a = mkPlayer({ id: 0, name: '并存将', zhangMarks: ['后土'] });
    const b = mkPlayer({ id: 1, name: '他人3' });
    const { deps } = makeHarness([a, b]);
    await dispatchTurnEnd(deps, b);
    // 旧的 zhangMarks 数组原样保留，新的 marks 是独立命名空间
    expect(a.zhangMarks).toEqual(['后土']);
  });
});
