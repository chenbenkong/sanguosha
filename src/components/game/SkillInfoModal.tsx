import React from 'react';
import { Player, CardName, CardType, Suit } from '../../../types';
import CardComponent from '../../../components/CardComponent';

const KINGDOM_BADGE: Record<string, string> = {
  魏: 'bg-blue-900/60 text-blue-200',
  蜀: 'bg-red-900/60 text-red-200',
  吴: 'bg-green-900/60 text-green-200',
};

/** 技能说明弹窗：技能规则 + 该武将的使用示例 + 当前手牌效果速查 */
export const SkillInfoModal: React.FC<{
  me: Player;
  canWusheng: boolean;
  onClose: () => void;
}> = ({ me, canWusheng, onClose }) => {
  const isRedCard = (suit: Suit) => suit === Suit.HEART || suit === Suit.DIAMOND;

  const cardEffect = (card: Player['hand'][number]): string => {
    const isZhaoyun = me.hero.name === '赵云';
    switch (card.name) {
      case CardName.SHA:
        if (isZhaoyun) return '可当【杀】或【闪】使用';
        if (canWusheng && isRedCard(card.suit)) return '红色【杀】，可通过「武圣」转换';
        return '对目标造成1点伤害';
      case CardName.SHAN:
        if (isZhaoyun) return '可当【杀】或【闪】使用';
        return '抵消一张【杀】的伤害';
      case CardName.TAO: return '回复1点体力';
      case CardName.JIU: return '本回合下一张【杀】伤害+1';
      case CardName.JUEDOU: return '与目标轮流出【杀】，先不出者受伤';
      case CardName.WUZHONG: return '摸两张牌';
      case CardName.NANMAN: return '全场需打出【杀】，否则受伤';
      case CardName.WANJIAN: return '全场需打出【闪】，否则受伤';
      case CardName.SHUNSHOU: return '获得目标一张手牌';
      case CardName.GUOHE: return '弃置目标一张手牌';
      case CardName.LESI: return '目标下回合可能跳过出牌阶段';
      case CardName.WUXIE: return '抵消一张锦囊牌的效果';
      case CardName.HUOGONG: return '展示目标手牌，弃置同花色牌造成火焰伤害';
      case CardName.TIESUO: return '横置1-2名角色，传导属性伤害';
      case CardName.BINGLIANG: return '目标下回合可能跳过摸牌阶段';
      case CardName.WUGU: return '所有角色依次选择并获得一张牌';
      case CardName.TAOYUAN: return '所有角色回复1点体力';
      case CardName.JIEDAO: return '令有武器的角色攻击另一名角色，否则获得其武器';
      case CardName.SHANDIAN: return '延时锦囊，判定黑桃2-9则受到3点雷电伤害';
      default: return card.description;
    }
  };

  const typeColor = (t: CardType) => {
    if (t === CardType.BASIC) return 'border-stone-500/50 bg-stone-800/50';
    if (t === CardType.SCROLL) return 'border-amber-600/50 bg-amber-900/30';
    if (t === CardType.EQUIPMENT) return 'border-blue-600/50 bg-blue-900/30';
    return 'border-stone-500/50';
  };

  return (
    <div className="absolute inset-0 z-[100] modal-mask flex items-center justify-center p-4">
      <div className="modal-shell max-w-3xl w-[95%] max-h-[85vh] overflow-y-auto p-6 scrollbar-thin">
        <div className="text-center mb-6">
          <h3 className="modal-title text-3xl font-ancient mb-2">技能说明</h3>
          <div className="w-32 modal-divider mx-auto"></div>
        </div>

        <div className="flex items-center gap-4 mb-6 p-4 bg-[rgba(var(--gold-rgb)/0.06)] rounded-lg border border-[var(--line)]">
          <img src={me.hero.avatarUrl} alt={me.hero.name} loading="eager" decoding="async" className="w-20 h-[120px] rounded-lg border-2 border-[#d4af37]/50 object-cover" />
          <div>
            <h4 className="text-2xl font-bold text-[var(--gold)] font-ancient">{me.hero.name}</h4>
            {/* 对局内技能说明浮层不显示称号（epithet） */}
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${KINGDOM_BADGE[me.hero.kingdom] ?? 'bg-stone-700/60 text-stone-200'}`}>
                {me.hero.kingdom}
              </span>
              <span className="text-red-400 text-sm">♥ {me.maxHp}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-[rgba(var(--gold-rgb)/0.18)] to-transparent p-4 rounded-lg border-l-4 border-[var(--gold)]">
              <h5 className="text-xl font-bold text-[var(--gold)] mb-2 font-ancient">【{me.hero.skillName}】</h5>
              <p className="text-stone-300 leading-relaxed">{me.hero.skillDesc}</p>
              {me.hero.lordSkillName && (
                <div className="mt-3 pt-3 border-t border-[var(--line-soft)]">
                  <div className="text-base font-bold text-[var(--gold-strong)] mb-1 font-ancient">主公技【{me.hero.lordSkillName}】</div>
                  <p className="text-stone-300 leading-relaxed">{me.hero.lordSkillDesc}</p>
                </div>
              )}
            </div>

            <div className="bg-[rgba(var(--gold-rgb)/0.05)] p-4 rounded-lg border border-[var(--line-soft)]">
              <h6 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2">
                <span>💡</span> 使用示例
              </h6>
              <div className="text-stone-300 text-sm space-y-2">
                {me.hero.name === '曹操' && (<><p>• 当你受到【杀】的伤害后，会自动获得这张【杀】</p><p>• 当你受到【决斗】的伤害后，会自动获得这张【决斗】</p><p>• <span className="text-yellow-400">示例</span>：曹操被赵云用【杀】攻击并受伤，曹操获得这张【杀】加入手牌</p></>)}
                {me.hero.name === '刘备' && (<><p>• 点击【仁德】按钮进入给牌模式</p><p>• 选择任意数量的手牌（至少1张）</p><p>• 选择目标角色，点击确认给出</p><p>• 给出2张或更多牌时，回复1点体力</p><p>• <span className="text-yellow-400">示例</span>：刘备有3张牌，选择给出2张给关羽，刘备回复1点体力</p></>)}
                {me.hero.name === '孙权' && (<><p>• 点击【制衡】按钮进入制衡模式</p><p>• 选择任意数量的手牌弃置</p><p>• 系统会自动摸取等量的牌</p><p>• 每回合限使用一次</p><p>• <span className="text-yellow-400">示例</span>：孙权弃置2张【闪】，摸取2张新牌，可能获得【杀】或【桃】</p></>)}
                {me.hero.name === '吕布' && (<><p>• 使用【杀】攻击目标时，目标需要打出两张【闪】才能抵消</p><p>• 与目标【决斗】时，目标需要打出两张【杀】才能反击</p><p>• <span className="text-yellow-400">示例</span>：吕布对曹操使用【杀】，曹操只有1张【闪】，无法防御，受到伤害</p></>)}
                {me.hero.name === '赵云' && (<><p>• 可以将【杀】当【闪】使用</p><p>• 可以将【闪】当【杀】使用</p><p>• 在需要出【闪】时，点击红色手牌即可使用</p><p>• <span className="text-yellow-400">示例</span>：赵云被【杀】攻击，手牌中只有【杀】，可以将【杀】当【闪】使用来防御</p></>)}
                {canWusheng && (<><p>• 可以将任意红色牌（红桃、方块）当【杀】使用</p><p>• 红色牌包括：【桃】、【无中生有】等</p><p>• <span className="text-yellow-400">示例</span>：关羽手牌中有【桃】（红桃），可以将其当【杀】使用攻击敌人</p></>)}
                {me.hero.name === '司马懿' && (<><p>• 当你使用【闪】或【无懈可击】成功免疫攻击后</p><p>• 如果体力未满，回复1点体力</p><p>• 如果体力已满，摸一张牌</p><p>• <span className="text-yellow-400">示例</span>：司马懿使用【闪】抵消【杀】，体力从2/3回复到3/3</p></>)}
                {me.hero.name === '貂蝉' && (<><p>• 点击【离间】按钮进入离间模式</p><p>• 弃置一张手牌</p><p>• 选择两名男性角色进行【决斗】</p><p>• 先被选中的角色先出【杀】</p><p>• <span className="text-yellow-400">示例</span>：貂蝉弃置【闪】，选择吕布和曹操决斗，吕布先出【杀】</p></>)}
                {me.hero.name === '张飞' && (<><p>• 出牌阶段可连续使用任意数量的【杀】，不受次数限制</p><p>• 配合【酒】可对同一目标连续造成高额伤害</p><p>• <span className="text-yellow-400">示例</span>：张飞手握 3 张【杀】，一回合内可全部打出</p></>)}
                {me.hero.name === '黄忠' && (<><p>• 你使用【杀】时，若目标手牌数 ≥ 你的体力值，此【杀】不可被【闪】抵消</p><p>• 体力越低越容易触发，适合残血反打</p><p>• <span className="text-yellow-400">示例</span>：黄忠 2 点体力，目标有 3 张手牌，其无法出【闪】</p></>)}
                {me.hero.name === '夏侯惇' && (<><p>• 受到伤害后自动判定，结果非红桃则伤害来源失去 1 点体力</p><p>• 越被围攻越容易反伤，注意别把自己逼入濒死</p><p>• <span className="text-yellow-400">示例</span>：夏侯惇被【杀】命中，判定为黑桃，攻击者失去 1 点体力</p></>)}
                {me.hero.name === '周瑜' && (<><p>• 摸牌阶段额外摸一张（共摸 3 张）</p><p>• 手牌更充裕，适合储备【杀】【闪】与锦囊</p><p>• <span className="text-yellow-400">示例</span>：周瑜每回合稳定摸 3 张，快速积累装备与锦囊</p></>)}
                {me.hero.name === '甄姬' && (<><p>• 需要出【闪】时，任意黑色手牌（♠♣）都可以当【闪】打出</p><p>• 回合开始自动「洛神」：判定为黑色则获得该牌并可继续，最多 3 次</p><p>• <span className="text-yellow-400">示例</span>：甄姬开局洛神连翻两张黑牌，手牌直接+2</p></>)}
                {me.hero.name === '黄月英' && (<><p>• 每使用一张锦囊牌，立即摸一张牌（集智）</p><p>• 使用锦囊牌无距离限制（奇才），可越位顺手</p><p>• <span className="text-yellow-400">示例</span>：黄月英用【顺手牵羊】偷取远位敌人的装备</p></>)}
                {me.hero.name === '孙尚香' && (<><p>• 失去装备区的牌时摸两张（枭姬，换装/被拆/被偷都触发）</p><p>• 弃两张手牌可与一名已受伤男性各回复 1 点体力（结姻，每回合一次）</p><p>• <span className="text-yellow-400">示例</span>：孙尚香点「结姻」→ 点一名受伤男将，双方回血</p></>)}
                {me.hero.name === '张春华' && (<><p>• 回合结束时，若手牌少于已损失体力，自动摸牌补至该数值</p><p>• 越受伤手牌越多，残血时反而更耐打</p><p>• <span className="text-yellow-400">示例</span>：张春华 3 体力上限、当前 1 点体力，回合结束补至 2 张</p></>)}
                {me.hero.name === '祝融' && (<><p>• 【南蛮入侵】对你完全无效，并额外摸一张牌</p><p>• 敌方放南蛮时你是最大受益者</p><p>• <span className="text-yellow-400">示例</span>：对手使用【南蛮入侵】，祝融不受伤害并摸一张</p></>)}
                {me.hero.name === '大乔' && (<><p>• 成为【杀】目标时，自动弃一张手牌并把【杀】转给攻击范围内另一名角色</p><p>• 手牌越充足越难被打中</p><p>• <span className="text-yellow-400">示例</span>：大乔被【杀】指定，弃一张牌后将【杀】转移给相邻的敌人</p></>)}
                {me.hero.name === '小乔' && (<><p>• 你的方块牌在判定时视为红桃</p><p>• 对【乐不思蜀】等判定有额外容错</p><p>• <span className="text-yellow-400">示例</span>：小乔的【乐不思蜀】判定翻出方块，视为红桃而免于跳过出牌</p></>)}
                {me.hero.name === '蔡文姬' && (<><p>• 你阵亡时，击杀你的角色失去所有手牌</p><p>• 敌人击杀你需付出代价，可用来威慑</p><p>• <span className="text-yellow-400">示例</span>：蔡文姬被击杀，凶手手牌全部进入弃牌堆</p></>)}
                {me.hero.name === '甘宁' && (<><p>• 点击「奇袭」按钮后，选一张黑色牌（♠♣），再点目标角色，即当【过河拆桥】使用</p><p>• 无需距离限制，可拆手牌或装备</p><p>• <span className="text-yellow-400">示例</span>：甘宁用黑色【酒】当【过河拆桥】，拆掉远处敌人的武器</p></>)}
                {me.hero.name === '吕蒙' && (<><p>• 出牌阶段没有使用过【杀】，弃牌阶段自动跳过</p><p>• 手上牌多时可以放心留牌蓄势</p><p>• <span className="text-yellow-400">示例</span>：吕蒙本回合只上装、不出杀，回合结束无需弃牌</p></>)}
                {me.hero.name === '王异' && (<><p>• 回合开始时若已受伤，自动摸等同于已损失体力的牌</p><p>• 越受伤收益越大，适合主动换血</p><p>• <span className="text-yellow-400">示例</span>：王异 3 上限、当前 1 体力，回合开始摸 2 张</p></>)}
                {me.hero.name === '步练师' && (<><p>• 你阵亡时，自动令己方体力最低的一名角色摸三张牌</p><p>• 阵亡也能为队友留下资源</p><p>• <span className="text-yellow-400">示例</span>：步练师阵亡，队友主公摸三张牌继续作战</p></>)}
              </div>
            </div>
          </div>

          {me.hand.length > 0 && (
            <div className="bg-gradient-to-b from-[#1a1510] to-[#0f0f0f] p-4 rounded-lg border border-[var(--line)]">
              <h6 className="text-lg font-bold text-[var(--gold)] mb-4 flex items-center gap-2 font-ancient">
                <span className="w-[3px] h-5 rounded-sm bg-gradient-to-b from-[var(--gold-strong)] to-[var(--gold-deep)]" />
                当前手牌使用效果
              </h6>
              <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto">
                {me.hand.map(card => (
                  <div key={card.id} className={`flex items-center gap-3 p-3 rounded-lg border ${typeColor(card.type)} hover:bg-[#2a2018] transition-colors`}>
                    <div className="flex-shrink-0 transform scale-75 origin-left -ml-2">
                      <CardComponent card={card} small />
                    </div>
                    <div className="flex-1 min-w-0 -ml-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[var(--gold)] font-bold font-ancient">{card.name}</span>
                        <span className="text-stone-500 text-xs">{card.rank}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          card.type === CardType.BASIC ? 'bg-stone-700 text-stone-300' :
                          card.type === CardType.SCROLL ? 'bg-amber-800/60 text-amber-200' :
                          'bg-blue-800/60 text-blue-200'
                        }`}>
                          {card.type}
                        </span>
                      </div>
                      <p className="text-stone-400 text-sm leading-relaxed">{cardEffect(card)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <button onClick={onClose} className="btn-gold px-8 py-3 rounded-lg font-ancient text-xl">明白了</button>
        </div>
      </div>
    </div>
  );
};
