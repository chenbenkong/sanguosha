import React from 'react';

/**
 * 玩法说明弹窗：首页与对局中共用。
 * 对局中由右上角「?」打开，底部可进入新手教学。
 */
export interface RulesDialogProps {
  onClose: () => void;
  onStartTutorial: () => void;
}

export const RulesDialog: React.FC<RulesDialogProps> = ({ onClose, onStartTutorial }) => (
  <div className="absolute inset-0 z-[240] modal-mask flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="modal-shell max-w-3xl w-full max-h-[86vh] flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex-none px-6 py-5 border-b border-[#8b7355]/30">
        <div className="text-center">
          <h3 className="modal-title text-3xl font-ancient">玩法说明</h3>
          <div className="w-32 modal-divider mx-auto mt-2.5" />
        </div>
        <button
          onClick={onClose}
          aria-label="关闭玩法说明"
          className="btn-ink absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 md:px-7 py-5 space-y-4 text-[#e5dcc8] scrollbar-thin">
        {/* 身份 */}
        <section className="rounded-md bg-black/20 p-4 border border-[#8b7355]/25">
          <h4 className="font-ancient text-xl text-[#e8cf94] mb-2.5"><span className="mr-2 text-[#8b7355] text-sm">壹</span>身份与胜利</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-sm">
            <div className="p-2.5 rounded bg-[#c8a45c]/10 border border-[#c8a45c]/30"><span className="font-bold text-[#e8cf94]">主公</span>：明示身份，体力上限+1</div>
            <div className="p-2.5 rounded bg-[#c8a45c]/10 border border-[#c8a45c]/30"><span className="font-bold text-[#e8cf94]">忠臣</span>：与主公同阵营</div>
            <div className="p-2.5 rounded bg-[#9e2b25]/15 border border-[#c86b62]/40"><span className="font-bold text-[#f0c8c2]">反贼</span>：击杀主公即胜</div>
            <div className="p-2.5 rounded bg-[#3a3a4a]/30 border border-[#7a7a96]/40"><span className="font-bold text-[#e8e8f0]">内奸</span>：最后与主公单挑并获胜</div>
          </div>
          <p className="text-xs text-[#bfae94] mt-2.5">身份在角色阵亡时公开。杀死反贼摸3张牌；主公误杀忠臣需弃光手牌。</p>
        </section>

        {/* 流程 */}
        <section className="rounded-md bg-black/20 p-4 border border-[#8b7355]/25">
          <h4 className="font-ancient text-xl text-[#e8cf94] mb-2.5"><span className="mr-2 text-[#8b7355] text-sm">贰</span>回合流程</h4>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {['回合开始', '判定', '摸牌阶段', '出牌阶段', '弃牌阶段', '回合结束'].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-[#8b7355]">→</span>}
                <span className="px-2 py-0.5 rounded bg-[#2a2018] border border-[#8b7355]/40">{s}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-[#bfae94] mt-2.5">判定区有延时锦囊（闪电 / 乐不思蜀 / 兵粮寸断）时，回合开始与摸牌、出牌阶段前会进行判定。弃牌阶段手牌不能超过当前体力值。</p>
        </section>

        {/* 牌类 */}
        <section className="rounded-md bg-black/20 p-4 border border-[#8b7355]/25">
          <h4 className="font-ancient text-xl text-[#e8cf94] mb-2.5"><span className="mr-2 text-[#8b7355] text-sm">叁</span>牌型速览</h4>
          <ul className="text-sm space-y-1.5">
            <li><span className="text-[#e8cf94] font-bold">基本牌</span>：杀（攻击）、闪（抵消杀）、桃（回血）、酒（杀伤害+1 或濒死自救）</li>
            <li><span className="text-[#e8cf94] font-bold">锦囊牌</span>：决斗、无中生有、南蛮入侵、万箭齐发、顺手牵羊、过河拆桥、无懈可击、火攻、铁索连环、五谷丰登、桃园结义、借刀杀人、乐不思蜀、兵粮寸断、闪电</li>
            <li><span className="text-[#e8cf94] font-bold">装备牌</span>：武器（青釭剑 / 青龙偃月刀 / 方天画戟 / 诸葛连弩）、防具（八卦阵 / 仁王盾）、坐骑（赤兔 / 大宛 为 -1 进攻马，的卢 / 绝影 为 +1 防御马）。点击装备牌即刻上装</li>
            <li><span className="text-[#e8cf94] font-bold">距离与范围</span>：默认攻击范围 1（左右相邻），装备武器可提升；【杀】无法打到范围外角色，顺手牵羊 / 兵粮寸断仅限距离 1</li>
            <li><span className="text-[#e8cf94] font-bold">无懈可击</span>：仅在锦囊牌生效前打出响应，抵消其对一名角色的效果</li>
            <li><span className="text-[#e8cf94] font-bold">铁索连环</span>：横置1-2名角色，被横置者受到属性伤害（如火攻）时伤害传导</li>
          </ul>
        </section>

        {/* 操作 */}
        <section className="rounded-md bg-black/20 p-4 border border-[#8b7355]/25">
          <h4 className="font-ancient text-xl text-[#e8cf94] mb-2.5"><span className="mr-2 text-[#8b7355] text-sm">肆</span>操作技巧</h4>
          <ul className="text-sm space-y-1.5">
            <li>点击手牌选择，点击头像指定目标；再点一次可取消</li>
            <li>非选目标时，点击任意武将头像可查看人物介绍、技能与装备详情</li>
            <li>桌面端快捷键：<span className="text-[#e8cf94] font-bold">1-9</span> 选手牌 · <span className="text-[#e8cf94] font-bold">Enter</span> 出牌/确认 · <span className="text-[#e8cf94] font-bold">E</span> 结束回合 · <span className="text-[#e8cf94] font-bold">Esc</span> 取消选择 · <span className="text-[#e8cf94] font-bold">?</span> 帮助</li>
            <li>右上角可切换 <span className="text-[#e8cf94] font-bold">速度 / 动效 / 主题 / 静音</span>，设置会记住到下次打开</li>
            <li>右上角 <span className="text-[#e8cf94] font-bold">⚡×N</span> 可加速 AI 结算节奏</li>
            <li>遇到危险时别慌——弹出响应框前先看清需要什么牌</li>
          </ul>
        </section>
      </div>

      <div className="flex-none px-6 py-4 border-t border-[#8b7355]/30 flex flex-col items-center gap-3">
        <p className="text-[11px] leading-relaxed text-[#bfae94] text-center max-w-xl">
          想边看边学？新手教学会用一局五人局带你走完 9 步，随时可跳过；结束后自动进入一局干净的对局。
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <button
            onClick={onStartTutorial}
            aria-label="打开新手教学"
            className="btn-ink px-6 py-2.5 min-h-[44px] rounded-lg font-ancient text-lg tracking-[0.16em]"
          >
            新手教学
          </button>
          <button onClick={onClose} className="btn-gold px-10 py-2.5 min-h-[44px] rounded-lg font-ancient text-xl tracking-[0.2em]">
            知道了
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default RulesDialog;
