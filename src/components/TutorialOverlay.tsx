import React from 'react';

/**
 * 新手引导浮层
 * - 每一步可绑定一个真实界面控件（selectors 依次尝试，取第一个存在的元素）
 * - 位置每帧跟随目标（窗口缩放 / 手牌横向滚动 / 布局分档变化时气泡不脱离元素）
 * - 不注入任何游戏状态：只做高亮与文案，下一步由玩家点按钮推进
 */
export interface TourStep {
  id: string;
  title: string;
  body: React.ReactNode;
  /** 真实控件选择器，按顺序取第一个能命中的元素 */
  selectors?: string[];
  /** 仍按目标定位，但文案不指向具体按钮 */
  hint?: string;
}

const TUTORIAL_KEY = 'sgs-tutorial-v1';
export const TUTORIAL_STORAGE_KEY = TUTORIAL_KEY;

export const TUTORIAL_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: '欢迎来到三国杀',
    body: (
      <>
        <p>这是一局真实的五人军争对局，本局你坐<b>主公</b>位。引导只会高亮界面，不会替你出牌。</p>
        <p className="mt-2 text-[#a89a84]">看完约 40 秒，随时可以跳过；结束后会为你重开一局干净的对局。</p>
      </>
    ),
  },
  {
    id: 'identity',
    title: '身份与胜负',
    body: (
      <>
        <p><b>主公 + 忠臣</b>：消灭所有反贼和内奸即获胜。</p>
        <p><b>反贼</b>：击杀主公即获胜；<b>内奸</b>：先帮主公清场，最后单挑主公取胜。</p>
        <p className="mt-2 text-[#a89a84]">头像右下角的朱印就是你的身份；其他人的身份阵亡时才公开。</p>
      </>
    ),
    selectors: ['[data-tour="identity"]'],
  },
  {
    id: 'seats',
    title: '座位与距离',
    body: (
      <>
        <p>所有角色围成一圈，行动顺序按座位逆时针轮转。</p>
        <p className="mt-1">默认攻击范围 1，只能打到左右相邻的对手；装备武器后范围会提升。</p>
        <p className="mt-2 text-[#a89a84]">点任意武将头像可查看其技能、装备与介绍。</p>
      </>
    ),
    selectors: ['[data-region="seats"]'],
  },
  {
    id: 'turn',
    title: '一个回合的流程',
    body: (
      <>
        <p><b>准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束</b></p>
        <p className="mt-1">判定区有闪电 / 乐不思蜀 / 兵粮寸断时会先判定；出牌阶段是主要操作时间。</p>
        <p className="mt-2 text-[#a89a84]">顶部的「回合中 / 我的回合」标记表示当前轮到谁。</p>
      </>
    ),
    selectors: ['[data-tour="turn"]', '[data-region="seats"]'],
  },
  {
    id: 'hand',
    title: '手牌怎么打',
    body: (
      <>
        <p>点击手牌选中，再点敌方头像指定目标；<b>再点一次可取消</b>。</p>
        <p className="mt-1">出牌阶段每回合限一张【杀】（诸葛连弩除外），选中后按右侧「出牌」确认。</p>
        <p className="mt-2 text-[#a89a84]">键盘：1-9 选牌 · Enter 出牌 · E 结束回合 · Esc 取消 · ? 帮助。</p>
      </>
    ),
    selectors: ['[data-region="hand"]'],
  },
  {
    id: 'equipment',
    title: '装备区',
    body: (
      <>
        <p>武器 / 防具 / ±1 马各只能装一件，装备牌点击即刻上装，旧装备进入弃牌堆。</p>
        <p className="mt-1">武器决定攻击范围；八卦阵、仁王盾在防御时自动判定。</p>
      </>
    ),
    selectors: ['[data-tour="equipment"]', '[data-region="player-info"]'],
  },
  {
    id: 'basic',
    title: '杀 / 闪 / 桃 的基本循环',
    body: (
      <>
        <p>你出【杀】→ 对方需要打出【闪】，否则受到 1 点伤害。</p>
        <p className="mt-1">受到伤害后体力下降，用【桃】回复；体力归零进入濒死，需要队友或自己出桃救援。</p>
        <p className="mt-2 text-[#a89a84]">被杀时界面会弹出响应框，按提示打出对应的牌即可。</p>
      </>
    ),
    selectors: ['[data-region="hand"]'],
  },
  {
    id: 'control',
    title: '结束回合、托管与退出',
    body: (
      <>
        <p>出牌阶段结束点底部操作条里的<b>「结束回合」</b>；手牌超过体力时需要弃牌。</p>
        <p className="mt-1">左上角<b>托管</b>让 AI 代打；<b>退出</b>会清除本局存档并回到首页。</p>
      </>
    ),
    selectors: ['[data-tour="end-turn"]', '[data-tour="action-bar"]', '[data-tour="takeover"]'],
  },
  {
    id: 'done',
    title: '引导完成',
    body: (
      <>
        <p>现在你已经知道怎么开局、出牌和结算了。</p>
        <p className="mt-2 text-[#a89a84]">点击「开始对局」会重开一局干净的五人局；首页随时可以再看一次引导。</p>
      </>
    ),
  },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 12;
const GAP = 14;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

export const TutorialOverlay: React.FC<{
  onFinish: () => void;
  onSkip: () => void;
  steps?: TourStep[];
}> = ({ onFinish, onSkip, steps = TUTORIAL_STEPS }) => {
  const [index, setIndex] = React.useState(0);
  const [target, setTarget] = React.useState<Box | null>(null);
  const [bubbleSize, setBubbleSize] = React.useState({ w: 0, h: 0 });
  const targetRef = React.useRef<Box | null>(null);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const nextRef = React.useRef<HTMLButtonElement | null>(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  // 每帧跟随目标位置：窗口缩放、手牌横向滚动、布局分档都会实时反映
  React.useEffect(() => {
    let alive = true;
    let raf = 0;
    const resolve = () => {
      if (!step.selectors) return null;
      for (const sel of step.selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return el;
        }
      }
      return null;
    };
    const el = resolve();
    if (el) {
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ignore */
      }
    }
    const tick = () => {
      if (!alive) return;
      const node = resolve();
      const r = node ? node.getBoundingClientRect() : null;
      const next = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      const prev = targetRef.current;
      const changed = !prev !== !next
        || (prev && next && (Math.abs(prev.x - next.x) > 1 || Math.abs(prev.y - next.y) > 1
          || Math.abs(prev.w - next.w) > 1 || Math.abs(prev.h - next.h) > 1));
      if (changed) {
        targetRef.current = next;
        setTarget(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps]);

  // 气泡尺寸随内容与视口变化重新测量
  React.useLayoutEffect(() => {
    const measure = () => {
      const b = bubbleRef.current;
      if (!b) return;
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      setBubbleSize(prev => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [index, target]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isLast) onFinish();
        else setIndex(i => Math.min(steps.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLast, onFinish, onSkip, steps.length]);

  React.useEffect(() => {
    const t = window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [index]);

  const vw = typeof window === 'undefined' ? 0 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight;
  const bw = bubbleSize.w || Math.min(380, vw - PAD * 2);
  const bh = bubbleSize.h || 200;

  let bubbleTop = (vh - bh) / 2;
  let bubbleLeft = (vw - bw) / 2;
  let side: 'above' | 'below' | 'center' = 'center';

  if (target) {
    const roomBelow = vh - (target.y + target.h) - GAP - PAD;
    const roomAbove = target.y - GAP - PAD;
    if (roomBelow >= bh || roomBelow >= roomAbove) {
      bubbleTop = target.y + target.h + GAP;
      side = 'below';
    } else {
      bubbleTop = target.y - bh - GAP;
      side = 'above';
    }
    bubbleLeft = target.x + target.w / 2 - bw / 2;
  }

  bubbleTop = clamp(bubbleTop, PAD, vh - bh - PAD);
  bubbleLeft = clamp(bubbleLeft, PAD, vw - bw - PAD);

  // 气泡箭头：指向目标中心，且限制在气泡圆角内
  let caretX: number | null = null;
  if (target) {
    const center = target.x + target.w / 2;
    caretX = clamp(center - bubbleLeft, 26, Math.max(26, bw - 26));
  }

  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* 背景遮罩：点击不穿透，避免引导期间误操作真实对局 */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* 高亮框：box-shadow 挖洞，不额外裁剪，缩放/滚动时跟随 */}
      {target && (
        <div
          className="absolute pointer-events-none rounded-xl ring-2 ring-[#e8cf94] transition-[left,top,width,height] duration-150"
          style={{
            left: target.x - 6,
            top: target.y - 6,
            width: target.w + 12,
            height: target.h + 12,
            boxShadow: '0 0 0 9999px rgba(8,6,4,0.62), 0 0 26px rgba(232,207,148,0.35) inset',
          }}
        />
      )}
      {!target && <div className="absolute inset-0 bg-[#080604]/70" />}

      <div
        ref={bubbleRef}
        className="absolute w-[min(380px,calc(100vw-24px))] rounded-xl border border-[#c8a45c]/55 bg-[#1b1510]/97 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.65)] backdrop-blur-sm animate-fade-in-scale"
        style={{ left: bubbleLeft, top: bubbleTop }}
      >
        {caretX !== null && (
          <div
            className="absolute w-3 h-3 rotate-45 border border-[#c8a45c]/55 bg-[#1b1510]"
            style={side === 'below'
              ? { top: -7, left: caretX - 6, borderBottom: 'none', borderRight: 'none' }
              : { bottom: -7, left: caretX - 6, borderTop: 'none', borderLeft: 'none' }}
          />
        )}

        <div className="flex items-start justify-between gap-3">
          <h3 id="tour-title" className="font-ancient text-xl tracking-[0.08em] text-[#e8cf94] leading-snug">
            {step.title}
          </h3>
          <span className="text-[11px] tabular-nums text-[#8f806a] mt-1 shrink-0">{index + 1}/{steps.length}</span>
        </div>

        <div className="mt-2 text-[13px] leading-relaxed text-[#e5dcc8]">{step.body}</div>

        {/* 进度点 */}
        <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              tabIndex={-1}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[#e8cf94]' : i < index ? 'w-1.5 bg-[#c8a45c]/70' : 'w-1.5 bg-[#5a4a33]'}`}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={onSkip}
            className="text-[12px] text-[#9a8b74] hover:text-[#e8cf94] underline-offset-4 hover:underline px-1 py-1"
          >
            跳过引导
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={() => setIndex(i => Math.max(0, i - 1))}
                className="btn-ink px-3.5 py-2 rounded-lg text-sm"
              >
                上一步
              </button>
            )}
            <button
              ref={nextRef}
              onClick={() => (isLast ? onFinish() : setIndex(i => Math.min(steps.length - 1, i + 1)))}
              className="btn-gold px-4 py-2 rounded-lg font-ancient text-base tracking-[0.12em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8cf94]"
            >
              {isLast ? '开始对局' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
