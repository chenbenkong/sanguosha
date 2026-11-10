import React from 'react';

/**
 * 开局入场仪式。
 *
 * 问题：startGame 直接 setScreen('game')，主循环立刻从「回合开始」推进，
 * 玩家看到的是一个已经开打的对局，像中途加入。
 *
 * 这里在进入对局的最初约 2.6 秒做一件事：把本局武将依次亮出、宣告势力，
 * 然后淡出交还主循环。过场期间主循环由 App 的 isProcessing 门控暂停。
 */

export interface BattleIntroProps {
  /** 每局唯一，用于重置动画 */
  id: number;
  /** 本局武将名，按座位顺序 */
  names: string[];
  /** 玩家自己的座位下标 */
  meIndex: number;
  onDone: () => void;
}

export const BattleIntro: React.FC<BattleIntroProps> = ({ id, names, meIndex, onDone }) => {
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    setLeaving(false);
    const t1 = window.setTimeout(() => setLeaving(true), 2200);
    const t2 = window.setTimeout(() => onDone(), 2600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // id 变化代表新的一局，重新播放
  }, [id, onDone]);

  return (
    <div
      className={`battle-intro${leaving ? ' is-leaving' : ''}`}
      aria-live="polite"
      data-testid="battle-intro"
    >
      <div className="battle-intro__inner">
        <div className="battle-intro__rule" />
        <div className="battle-intro__title font-ancient">群 雄 逐 鹿</div>
        <div className="battle-intro__sub">SANGUOSHA · BATTLE START</div>
        <ul className="battle-intro__names" style={{ ['--count' as string]: names.length }}>
          {names.map((n, i) => (
            <li
              key={n + i}
              className={`battle-intro__name${i === meIndex ? ' is-me' : ''}`}
              style={{ animationDelay: `${240 + i * 130}ms` }}
            >
              {n}
            </li>
          ))}
        </ul>
        <div className="battle-intro__rule" />
      </div>
    </div>
  );
};
