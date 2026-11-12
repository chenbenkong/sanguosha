import { describe, expect, it } from 'vitest';
import { tiltFromPoint } from './useTilt';

/**
 * 3D 倾斜的几何算法。
 *
 * 为什么蹲在纯函数上测而不是浏览器里：`(hover: hover) and (pointer: fine)`
 * 在不同机器上判定不同——CI 的 headless Chrome 报 hover:none，本地报 hover:hover
 * （实测 CDP 的 Emulation.setEmulatedMedia 也无法覆盖 hover/pointer，它们是设备
 * 属性而非可模拟的媒体特性）。在浏览器里断言角度，实际测到的是环境。
 * 环境开关由 e2e 验证「允许时开启、不允许时保持关闭」，算法在这里验证。
 */
const RECT = { left: 100, top: 50, width: 200, height: 300 };

describe('tiltFromPoint', () => {
  it('元素未布局（宽或高为 0）时返回 null，让调用方跳过这次更新', () => {
    expect(tiltFromPoint({ ...RECT, width: 0 }, 0, 0)).toBe(null);
    expect(tiltFromPoint({ ...RECT, height: 0 }, 0, 0)).toBe(null);
  });

  it('正中心不倾斜，光斑在 50%', () => {
    const p = tiltFromPoint(RECT, 200, 200);
    expect(p).not.toBe(null);
    expect(parseFloat(p!.rx)).toBe(0);
    expect(parseFloat(p!.ry)).toBe(0);
    expect(p!.mx).toBe('50.0%');
    expect(p!.my).toBe('50.0%');
  });

  it('右下角：向右、向上倾（ry 正、rx 负），光斑靠右下', () => {
    const p = tiltFromPoint(RECT, 300, 350)!;
    expect(parseFloat(p.ry)).toBeGreaterThan(0);
    expect(parseFloat(p.rx)).toBeLessThan(0);
    expect(parseFloat(p.mx)).toBeGreaterThan(50);
    expect(parseFloat(p.my)).toBeGreaterThan(50);
  });

  it('左上角：向左、向下倾，符号与右下角完全相反', () => {
    const p = tiltFromPoint(RECT, 100, 50)!;
    expect(parseFloat(p.ry)).toBeLessThan(0);
    expect(parseFloat(p.rx)).toBeGreaterThan(0);
    expect(parseFloat(p.mx)).toBeLessThan(50);
    expect(parseFloat(p.my)).toBeLessThan(50);
  });

  it('指针移出元素后角度与光斑都被夹住，不产生越界值', () => {
    const far = tiltFromPoint(RECT, 9999, 9999)!;
    // 归一化被夹到 1，所以光斑正好停在 100%、角度停在最大倾斜
    expect(far.mx).toBe('100.0%');
    expect(far.my).toBe('100.0%');
    expect(parseFloat(far.mx)).toBeLessThanOrEqual(100);
    expect(parseFloat(far.my)).toBeLessThanOrEqual(100);

    const neg = tiltFromPoint(RECT, -9999, -9999)!;
    expect(neg.mx).toBe('0.0%');
    expect(neg.my).toBe('0.0%');
  });

  it('最大倾斜角有上限，不会因为极端坐标变得夸张', () => {
    // 对角处的 |ry|、|rx| 都不超过 9deg（CSS 里 MAX_TILT）
    for (const [x, y] of [[0, 0], [300, 0], [0, 350], [300, 350]]) {
      const p = tiltFromPoint(RECT, x, y)!;
      expect(Math.abs(parseFloat(p.ry))).toBeLessThanOrEqual(9.01);
      expect(Math.abs(parseFloat(p.rx))).toBeLessThanOrEqual(9.01);
    }
  });

  it('输出带单位，直接写进 CSS 变量即可用', () => {
    const p = tiltFromPoint(RECT, 300, 350)!;
    expect(p.rx).toMatch(/^-?\d+(\.\d+)?deg$/);
    expect(p.ry).toMatch(/^-?\d+(\.\d+)?deg$/);
    expect(p.mx).toMatch(/^\d+(\.\d+)?%$/);
    expect(p.my).toMatch(/^\d+(\.\d+)?%$/);
  });
});
