import React from 'react';
import { Card, CardName, CardType, GamePhase, Identity, Player, Suit } from '../../../types';
import { IconBook } from '../Icons';

/**
 * 出牌阶段操作栏。
 * 注意：这里保留了对局内的 96 个实时依赖（模式开关/技能结算函数/玩家状态），
 * 属于「从 App 抽出的接线层」，不是纯展示组件；后续做状态单一入口时再收敛。
 */
export interface ActionBarProps {
  hasUsedAnxu: boolean;
  hasUsedChongxu: boolean;
  hasUsedFanjian: boolean;
  hasUsedGanlu: boolean;
  hasUsedJiaozhao: boolean;
  hasUsedJieyin: boolean;
  hasUsedLijian: boolean;
  hasUsedMiaoJian: boolean;
  hasUsedQiangwu: boolean;
  hasUsedQingcheng: boolean;
  hasUsedQingnang: boolean;
  hasUsedXueji: boolean;
  hasUsedYanjiao: boolean;
  hasUsedZhiheng: boolean;
  isAiTakeover: boolean;
  isAnxuMode: boolean;
  isFanjianMode: boolean;
  isGanluMode: boolean;
  isGuoseMode: boolean;
  isJieyinMode: boolean;
  isJijiangMode: boolean;
  isLijianMode: boolean;
  isMyTurn: boolean;
  isQingchengMode: boolean;
  isQingnangMode: boolean;
  isQixiMode: boolean;
  isRendeMode: boolean;
  isSelectingTarget: boolean;
  isZhangbaMode: boolean;
  isZhihengMode: boolean;
  selectedCardIds: string[];
  rendeSelectedCardIds: string[];
  lijianSelectedTargets: number[];
  tiesuoSelectedTargets: number[];
  players: Player[];
  me: Player;
  phase: GamePhase;
  theme: 'dark' | 'light';
  dyingState: unknown;
  isProcessing: number;
  jiaozhaoPending: { ownerId: number; cardId: string; declared: CardName; level: number } | null;
  zhangbaPending: unknown;
  qiangwuPoint: number | null;
  guohuanghouLevel: number;
  jiedaoVictimTarget: number | null;
  jiedaoWeaponTarget: number | null;
  lijianSelectedCardId: string | null;
  rendeSelectedTarget: number | null;
  chongxuUsedRef: React.MutableRefObject<any>;
  miaoJianUsedRef: React.MutableRefObject<any>;
  playersRef: React.MutableRefObject<Player[]>;
  rendeGivenRef: React.MutableRefObject<any>;
  rendeHealedRef: React.MutableRefObject<any>;
  setActiveSelectedId: React.Dispatch<React.SetStateAction<any>>;
  setAnxuTargets: React.Dispatch<React.SetStateAction<any>>;
  setGanluTargets: React.Dispatch<React.SetStateAction<any>>;
  setHasUsedChongxu: React.Dispatch<React.SetStateAction<any>>;
  setHasUsedLijian: React.Dispatch<React.SetStateAction<any>>;
  setHasUsedMiaoJian: React.Dispatch<React.SetStateAction<any>>;
  setHasUsedZhiheng: React.Dispatch<React.SetStateAction<any>>;
  setHealAnimTarget: React.Dispatch<React.SetStateAction<any>>;
  setHealNumber: React.Dispatch<React.SetStateAction<any>>;
  setIsAnxuMode: React.Dispatch<React.SetStateAction<any>>;
  setIsFanjianMode: React.Dispatch<React.SetStateAction<any>>;
  setIsGanluMode: React.Dispatch<React.SetStateAction<any>>;
  setIsGuoseMode: React.Dispatch<React.SetStateAction<any>>;
  setIsJieyinMode: React.Dispatch<React.SetStateAction<any>>;
  setIsJijiangMode: React.Dispatch<React.SetStateAction<any>>;
  setIsLijianMode: React.Dispatch<React.SetStateAction<any>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<any>>;
  setIsQingchengMode: React.Dispatch<React.SetStateAction<any>>;
  setIsQingnangMode: React.Dispatch<React.SetStateAction<any>>;
  setIsQixiMode: React.Dispatch<React.SetStateAction<any>>;
  setIsRendeMode: React.Dispatch<React.SetStateAction<any>>;
  setIsSelectingTarget: React.Dispatch<React.SetStateAction<any>>;
  setIsZhangbaMode: React.Dispatch<React.SetStateAction<any>>;
  setIsZhihengMode: React.Dispatch<React.SetStateAction<any>>;
  setJieyinTarget: React.Dispatch<React.SetStateAction<any>>;
  setLijianSelectedCardId: React.Dispatch<React.SetStateAction<any>>;
  setLijianSelectedTargets: React.Dispatch<React.SetStateAction<any>>;
  setPlayers: React.Dispatch<React.SetStateAction<any>>;
  setQingnangCardId: React.Dispatch<React.SetStateAction<any>>;
  setRendeSelectedCardIds: React.Dispatch<React.SetStateAction<any>>;
  setRendeSelectedTarget: React.Dispatch<React.SetStateAction<any>>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<any>>;
  setZhangbaPending: React.Dispatch<React.SetStateAction<any>>;
  addLog: (...args: any[]) => any;
  activateQiangwu: (...args: any[]) => any;
  canReach: (...args: any[]) => any;
  delay: (...args: any[]) => any;
  discardCards: (...args: any[]) => any;
  doYanjiao: (...args: any[]) => any;
  drawCards: (...args: any[]) => any;
  endTurn: (...args: any[]) => any;
  excessCards: (...args: any[]) => any;
  executeDuel: (...args: any[]) => any;
  getPlayer: (...args: any[]) => any;
  handleAskStrategy: (...args: any[]) => any;
  handleConfirmPlay: (...args: any[]) => any;
  handleDiscardConfirm: (...args: any[]) => any;
  mutateHand: (...args: any[]) => any;
  performJiling: (...args: any[]) => any;
  requestSkillChoice: (...args: any[]) => any;
  resolveCardEffect: (...args: any[]) => any;
  resolveJiaozhao: (...args: any[]) => any;
  resolveJiaozhaoUse: (...args: any[]) => any;
  resolveKurou: (...args: any[]) => any;
  resolveXueji: (...args: any[]) => any;
  showSkillBanner: (...args: any[]) => any;
  updatePlayer: (...args: any[]) => any;
}

export const ActionBar: React.FC<ActionBarProps> = (props) => {
  const {
    activateQiangwu,
    addLog,
    canReach,
    chongxuUsedRef,
    delay,
    discardCards,
    doYanjiao,
    drawCards,
    dyingState,
    endTurn,
    excessCards,
    executeDuel,
    getPlayer,
    guohuanghouLevel,
    handleAskStrategy,
    handleConfirmPlay,
    handleDiscardConfirm,
    hasUsedAnxu,
    hasUsedChongxu,
    hasUsedFanjian,
    hasUsedGanlu,
    hasUsedJiaozhao,
    hasUsedJieyin,
    hasUsedLijian,
    hasUsedMiaoJian,
    hasUsedQiangwu,
    hasUsedQingcheng,
    hasUsedQingnang,
    hasUsedXueji,
    hasUsedYanjiao,
    hasUsedZhiheng,
    isAiTakeover,
    isAnxuMode,
    isFanjianMode,
    isGanluMode,
    isGuoseMode,
    isJieyinMode,
    isJijiangMode,
    isLijianMode,
    isMyTurn,
    isProcessing,
    isQingchengMode,
    isQingnangMode,
    isQixiMode,
    isRendeMode,
    isSelectingTarget,
    isZhangbaMode,
    isZhihengMode,
    jiaozhaoPending,
    jiedaoVictimTarget,
    jiedaoWeaponTarget,
    lijianSelectedCardId,
    lijianSelectedTargets,
    me,
    miaoJianUsedRef,
    mutateHand,
    performJiling,
    phase,
    players,
    playersRef,
    qiangwuPoint,
    rendeGivenRef,
    rendeHealedRef,
    rendeSelectedCardIds,
    rendeSelectedTarget,
    requestSkillChoice,
    resolveCardEffect,
    resolveJiaozhao,
    resolveJiaozhaoUse,
    resolveKurou,
    resolveXueji,
    selectedCardIds,
    setActiveSelectedId,
    setAnxuTargets,
    setGanluTargets,
    setHasUsedChongxu,
    setHasUsedLijian,
    setHasUsedMiaoJian,
    setHasUsedZhiheng,
    setHealAnimTarget,
    setHealNumber,
    setIsAnxuMode,
    setIsFanjianMode,
    setIsGanluMode,
    setIsGuoseMode,
    setIsJieyinMode,
    setIsJijiangMode,
    setIsLijianMode,
    setIsProcessing,
    setIsQingchengMode,
    setIsQingnangMode,
    setIsQixiMode,
    setIsRendeMode,
    setIsSelectingTarget,
    setIsZhangbaMode,
    setIsZhihengMode,
    setJieyinTarget,
    setLijianSelectedCardId,
    setLijianSelectedTargets,
    setPlayers,
    setQingnangCardId,
    setRendeSelectedCardIds,
    setRendeSelectedTarget,
    setSelectedCardIds,
    setZhangbaPending,
    showSkillBanner,
    theme,
    tiesuoSelectedTargets,
    updatePlayer,
    zhangbaPending,
  } = props;
  return (
    <>
            <div data-tour="action-bar" className="action-bar flex flex-wrap gap-2 md:gap-3 items-center relative z-40">
              <div className="ui-panel flex flex-wrap items-center gap-2 p-2">
                {/* Action Buttons */}
                {isMyTurn && phase === GamePhase.ACTION && !isAiTakeover && (
                  <>
                    {/* Play Button - Only for non-target cards */}
                    {selectedCardIds.length > 0 && (
                      <>                         
                        {(() => {
                          const me = players.find(p => p.isHuman) || players[0];
                          const card = me.hand.find(c => c.id === selectedCardIds[0]);
                          if (!card) return null;
                            
                          // 检查是否为非目标卡牌（不包括无懈可击）
                          const isNonTargetCard = [CardName.WUZHONG, CardName.TAO, CardName.NANMAN, CardName.WANJIAN, CardName.JIU, CardName.WUGU, CardName.TAOYUAN, CardName.SHANDIAN].includes(card.name);
                          // 铁索连环需要选择目标后才能出牌
                          const isTiesuo = card.name === CardName.TIESUO;
                            
                          // 对非目标卡牌或已选目标的铁索连环显示出牌按钮
                          if (isNonTargetCard) {
                            return (
                              <button 
                                onClick={handleConfirmPlay}
                                disabled={!!dyingState || !!isProcessing}
                                className={`btn-gold px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.14em] ${!!dyingState || !!isProcessing ? 'opacity-45 cursor-not-allowed' : ''}`}
                              >
                                出 牌
                              </button>
                            );
                          }
                          
                          // 借刀杀人特殊处理：选择了两个目标后才显示出牌按钮
                          const isJiedao = card.name === CardName.JIEDAO;
                          if (isJiedao && jiedaoWeaponTarget && jiedaoVictimTarget) {
                            const weaponPlayer = players.find(p => p.id === jiedaoWeaponTarget);
                            const victimPlayer = players.find(p => p.id === jiedaoVictimTarget);
                            return (
                              <button 
                                onClick={handleConfirmPlay}
                                disabled={!!dyingState || !!isProcessing}
                                className={`btn-gold px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.14em] ${!!dyingState || !!isProcessing ? 'opacity-45 cursor-not-allowed' : ''}`}
                              >
                                出牌 ({weaponPlayer?.hero.name}→{victimPlayer?.hero.name})
                              </button>
                            );
                          }
                          
                          // 铁索连环特殊处理：选择了目标后才显示出牌按钮
                          if (isTiesuo && tiesuoSelectedTargets.length > 0) {
                            return (
                              <button 
                                onClick={handleConfirmPlay}
                                disabled={!!dyingState || !!isProcessing}
                                className={`btn-gold px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.14em] ${!!dyingState || !!isProcessing ? 'opacity-45 cursor-not-allowed' : ''}`}
                              >
                                出 牌 ({tiesuoSelectedTargets.length}/2)
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}
                       
                    {/* Liu Bei's Rende Skill Button */}
                    {players[0].hero.name === '刘备' && !isRendeMode && (
                      <button 
                        onClick={() => {
                          setIsRendeMode(true);
                          setRendeSelectedCardIds([]);
                          setRendeSelectedTarget(null);
                          setSelectedCardIds([]);
                          setIsSelectingTarget(false);
                          addLog(`请选择要给出的牌（刘备「仁德」技能）...`, 'info');
                        }}
                        className="skill-btn text-base"
                      >
                        仁德
                      </button>
                    )}
                    
                    {/* Rende Confirm Button */}
                    {isRendeMode && rendeSelectedCardIds.length > 0 && rendeSelectedTarget !== null && (
                      <button 
                        onClick={() => {
                          const me = players.find(p => p.isHuman) || players[0];
                          const target = getPlayer(rendeSelectedTarget);
                          const cardsToGive = me.hand.filter(card => rendeSelectedCardIds.includes(card.id));
                          
                          if (target && cardsToGive.length > 0) {
                            // 将牌从自己的手牌移除
                            setPlayers(prev => {
                              const updated = prev.map(p => {
                                if (p.id === me.id) {
                                  return { ...p, hand: p.hand.filter(c => !rendeSelectedCardIds.includes(c.id)) };
                                }
                                if (p.id === rendeSelectedTarget) {
                                  return { ...p, hand: [...p.hand, ...cardsToGive] };
                                }
                                return p;
                              });
                              playersRef.current = updated;
                              return updated;
                            });
                            
                            addLog(`${me.hero.name} 使用技能「仁德」，将 ${cardsToGive.length} 张牌交给了 ${target.hero.name}！`, 'skill');
                            showSkillBanner(me.hero.name, '仁德');

                            // 官方「仁德」：出牌阶段内累计给出的牌首次达到 2 张时回复 1 点体力（每阶段一次）
                            rendeGivenRef.current += cardsToGive.length;
                            if (!rendeHealedRef.current && rendeGivenRef.current >= 2) {
                              rendeHealedRef.current = true;
                              if (me.hp < me.maxHp) {
                                // 触发治疗动画
                                setHealAnimTarget(me.id);
                                setHealNumber({ targetId: me.id, amount: 1, id: Date.now().toString() });
                                setTimeout(() => setHealAnimTarget(null), 600);
                                setTimeout(() => setHealNumber(null), 1000);

                                updatePlayer(me.id, { hp: me.hp + 1 });
                                addLog(`${me.hero.name} 使用「仁德」本阶段累计给出${rendeGivenRef.current}张牌，回复1点体力！`, 'skill');
                              }
                            }
                          }
                          
                          // 退出仁德模式
                          setIsRendeMode(false);
                          setRendeSelectedCardIds([]);
                          setRendeSelectedTarget(null);
                          setSelectedCardIds([]);
                        }}
                        className="skill-btn text-base"
                      >
                        确认给出
                      </button>
                    )}
                    
                    {/* Rende Cancel Button */}
                    {isRendeMode && (
                      <button 
                        onClick={() => {
                          setIsRendeMode(false);
                          setRendeSelectedCardIds([]);
                          setRendeSelectedTarget(null);
                          setSelectedCardIds([]);
                          addLog(`取消了「仁德」技能`, 'info');
                        }}
                        className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                      >
                        取消仁德
                      </button>
                    )}
                    
                    {/* 张星彩「枪舞」：出牌阶段限一次判定 */}
                    {players[0].hero.name === '张星彩' && !hasUsedQiangwu && (
                      <button
                        onClick={() => { void activateQiangwu(); }}
                        className="skill-btn text-base"
                        title="出牌阶段限一次：判定后，点数小于判定结果的【杀】无距离限制，点数大于判定结果的【杀】不计次数"
                      >
                        枪舞
                      </button>
                    )}
                    {players[0].hero.name === '张星彩' && qiangwuPoint !== null && (
                      <span className="px-2 py-1 rounded border border-[#d4af37]/50 text-[#f0d38a] text-sm font-ancient whitespace-nowrap">
                        枪舞 · 判定 {qiangwuPoint}
                      </span>
                    )}

                    {/* 张昌蒲「严教」：出牌阶段限一次，人类自选花色与目标 */}
                    {players[0].hero.name === '张昌蒲' && !hasUsedYanjiao && players[0].hand.length > 0 && (
                      <button
                        onClick={async () => {
                          const me = players.find(p => p.isHuman) || players[0];
                          const suits = [Suit.SPADE, Suit.HEART, Suit.CLUB, Suit.DIAMOND]
                            .filter(s => me.hand.some(c => c.suit === s));
                          if (!suits.length) return;
                          const r = await requestSkillChoice({
                            skill: '严教',
                            owner: me.hero.name,
                            title: '选择要交出的花色（该花色的所有手牌）',
                            mode: 'choose',
                            choices: suits.map(s => ({ id: s, label: `全部 ${s} 牌（${me.hand.filter(c => c.suit === s).length} 张）` })),
                            cancelLabel: '取消严教',
                          });
                          if (!r || r.kind !== 'choose') return;
                          const others = playersRef.current.filter(p => !p.isDead && p.id !== me.id);
                          if (!others.length) {
                            addLog('【严教】没有其他角色可交给', 'warning');
                            return;
                          }
                          const r2 = await requestSkillChoice({
                            skill: '严教',
                            owner: me.hero.name,
                            title: '选择交给的角色',
                            mode: 'choose',
                            choices: others.map(p => ({ id: String(p.id), label: p.hero.name, desc: `${p.hp}/${p.maxHp}` })),
                            cancelLabel: '取消严教',
                          });
                          if (!r2 || r2.kind !== 'choose') return;
                          await doYanjiao(me.id, Number(r2.id), r.id as Suit);
                        }}
                        className="skill-btn text-base"
                        title="出牌阶段限一次：将某花色的所有手牌交给一名其他角色，然后对其造成1点伤害"
                      >
                        严教
                      </button>
                    )}

                    {/* 孙寒华「冲虚」：出牌阶段限一次，人类自选集灵分数的用途 */}
                    {players[0].hero.name === '孙寒华' && !hasUsedChongxu && (
                      <button
                        onClick={async () => {
                          const m = playersRef.current.find(p => p.isHuman) || playersRef.current[0];
                          if (!m) return;
                          chongxuUsedRef.current = true;
                          setHasUsedChongxu(true);
                          let left = await performJiling(m.id);
                          let mj = m.miaoJianLevel ?? 1;
                          let lh = m.lianHuaLevel ?? 1;
                          // 升级需 3 分、摸牌需 2 分（可重复）；分数不足或两项满级时自动结束
                          while (left >= 2) {
                            const opts: Array<{ id: string; label: string; desc?: string }> = [];
                            if (left >= 3 && mj < 3) opts.push({ id: 'mj', label: '升级「妙剑」（3分）', desc: `${mj} → ${mj + 1} 级` });
                            if (left >= 3 && lh < 3) opts.push({ id: 'lh', label: '升级「莲华」（3分）', desc: `${lh} → ${lh + 1} 级` });
                            opts.push({ id: 'draw', label: '摸一张牌（2分，可重复）', desc: `当前 ${left} 分` });
                            const r = await requestSkillChoice({
                              skill: '冲虚',
                              owner: m.hero.name,
                              title: `集灵获得 ${left} 分，选择用途`,
                              mode: 'choose',
                              choices: opts,
                              cancelLabel: '结束集灵',
                            }, true);
                            if (!r || r.kind !== 'choose') break;
                            if (r.id === 'mj') {
                              left -= 3; mj += 1;
                              updatePlayer(m.id, { miaoJianLevel: mj });
                              addLog(`孙寒华将 3 分用于升级「妙剑」：${mj - 1} → ${mj} 级（剩余 ${left} 分）`, 'skill');
                            } else if (r.id === 'lh') {
                              left -= 3; lh += 1;
                              updatePlayer(m.id, { lianHuaLevel: lh });
                              addLog(`孙寒华将 3 分用于升级「莲华」：${lh - 1} → ${lh} 级（剩余 ${left} 分）`, 'skill');
                            } else if (r.id === 'draw') {
                              left -= 2;
                              drawCards(m.id, 1);
                              addLog(`孙寒华将 2 分用于摸一张牌（剩余 ${left} 分）`, 'skill');
                            }
                            await delay(300);
                          }
                        }}
                        className="skill-btn text-base"
                        title="出牌阶段限一次：集灵获得分数（至多5分），可用分数升级妙剑/莲华（各3分）或摸牌（2分）"
                      >
                        冲虚
                      </button>
                    )}

                    {/* 孙寒华「妙剑」：出牌阶段限一次，人类自选转化方式与目标 */}
                    {players[0].hero.name === '孙寒华' && !hasUsedMiaoJian && (
                      <button
                        onClick={async () => {
                          const m = playersRef.current.find(p => p.isHuman) || playersRef.current[0];
                          if (!m) return;
                          const lv = m.miaoJianLevel ?? 1;
                          const opts: Array<{ id: string; label: string; desc?: string; kind: 'sha' | 'wz'; cardId?: string }> = [];
                          if (lv >= 3) {
                            opts.push({ id: 'sha3', label: '视为使用【刺杀】', desc: '被【闪】抵消时目标须弃一张手牌', kind: 'sha' });
                            opts.push({ id: 'wz3', label: '视为使用【无中生有】', desc: '摸两张牌', kind: 'wz' });
                          } else {
                            const shaCards = lv >= 2 ? m.hand.filter(c => c.type === CardType.BASIC) : m.hand.filter(c => c.name === CardName.SHA);
                            for (const c of shaCards) opts.push({ id: `sha:${c.id}`, label: `将【${c.name}】当【刺杀】使用`, kind: 'sha', cardId: c.id });
                            const wzCards = lv === 1 ? m.hand.filter(c => c.type === CardType.SCROLL) : m.hand.filter(c => c.type !== CardType.BASIC);
                            for (const c of wzCards) opts.push({ id: `wz:${c.id}`, label: `将【${c.name}】当【无中生有】使用`, desc: '摸两张牌', kind: 'wz', cardId: c.id });
                          }
                          if (!opts.length) { addLog('「妙剑」没有可转化的牌', 'info'); return; }
                          const r = await requestSkillChoice({
                            skill: '妙剑',
                            owner: m.hero.name,
                            title: '选择「妙剑」的使用方式',
                            mode: 'choose',
                            choices: opts.map(o => ({ id: o.id, label: o.label, desc: o.desc })),
                            cancelLabel: '取消妙剑',
                          }, true);
                          if (!r || r.kind !== 'choose') return;
                          const opt = opts.find(o => o.id === r.id);
                          if (!opt) return;
                          const convertName = opt.cardId ? (m.hand.find(c => c.id === opt.cardId)?.name ?? '杀') : '刺杀';
                          if (opt.kind === 'wz') {
                            if (opt.cardId) mutateHand(m.id, h => h.filter(c => c.id !== opt.cardId));
                            setHasUsedMiaoJian(true); miaoJianUsedRef.current = true;
                            addLog(opt.cardId ? `孙寒华发动「妙剑」，将【${convertName}】当【无中生有】使用` : '孙寒华发动「妙剑」，视为使用一张【无中生有】', 'skill');
                            showSkillBanner('孙寒华', '妙剑');
                            await delay(300);
                            drawCards(m.id, 2);
                            return;
                          }
                          const targets = playersRef.current.filter(o => !o.isDead && o.id !== m.id && canReach(m, o));
                          if (!targets.length) { addLog('「妙剑」没有距离内的目标', 'info'); return; }
                          const tr = await requestSkillChoice({
                            skill: '妙剑',
                            owner: m.hero.name,
                            title: '选择【刺杀】的目标',
                            mode: 'target',
                            targets: targets.map(o => ({ id: o.id, name: o.hero.name, sub: `${o.hp}/${o.maxHp} 手牌${o.hand.length}` })),
                            cancelLabel: '取消妙剑',
                          }, true);
                          if (!tr || tr.kind !== 'target' || !tr.ids.length) return;
                          const t = getPlayer(tr.ids[0]);
                          if (!t) return;
                          if (opt.cardId) mutateHand(m.id, h => h.filter(c => c.id !== opt.cardId));
                          setHasUsedMiaoJian(true); miaoJianUsedRef.current = true;
                          addLog(opt.cardId ? `孙寒华发动「妙剑」，将【${convertName}】当【刺杀】对 ${t.hero.name} 使用` : `孙寒华发动「妙剑」，视为使用一张【刺杀】对 ${t.hero.name}`, 'skill');
                          showSkillBanner('孙寒华', '妙剑');
                          await delay(300);
                          const meNow = getPlayer(m.id);
                          const tNow = getPlayer(t.id);
                          if (meNow && tNow) {
                            const virtualSlash: Card = {
                              id: `miaojian-${m.id}-${Date.now()}`,
                              name: CardName.SHA,
                              type: CardType.BASIC,
                              suit: Suit.SPADE,
                              rank: 'K',
                              value: 13,
                              description: '妙剑：视为使用一张【刺杀】',
                              imageColor: 'from-slate-700 to-slate-900',
                              cisha: true,
                            };
                            await resolveCardEffect(meNow, [tNow], virtualSlash);
                          }
                        }}
                        className="skill-btn text-base"
                        title="出牌阶段限一次：按等级将牌当【刺杀】或【无中生有】使用"
                      >
                        妙剑
                      </button>
                    )}

                    {/* Sun Quan's Zhiheng Skill Button */}
                    {players[0].hero.name === '孙权' && !isZhihengMode && !hasUsedZhiheng && (
                      <button 
                        onClick={() => {
                          setIsZhihengMode(true);
                          setSelectedCardIds([]);
                          setIsSelectingTarget(false);
                          addLog(`请选择要弃置的牌（孙权「制衡」技能）...`, 'info');
                        }}
                        className="skill-btn text-base"
                      >
                        制衡
                      </button>
                    )}
                       
                       {/* Zhiheng Confirm Button */}
                       {isZhihengMode && (
                         <button 
                           onClick={() => {
                             // 执行制衡技能
                             const me = players.find(p => p.isHuman) || players[0];
                             const cardsToDiscard = me.hand.filter(card => selectedCardIds.includes(card.id));
                             if (cardsToDiscard.length > 0) {
                               // 弃置选中的牌
                               discardCards(me.id, cardsToDiscard);
                               // 摸等量的牌
                               drawCards(me.id, cardsToDiscard.length);
                               addLog(`${me.hero.name} 使用技能「制衡」，弃置了 ${cardsToDiscard.length} 张牌，摸了 ${cardsToDiscard.length} 张牌！`, 'skill');
                               showSkillBanner(me.hero.name, '制衡');
                               setHasUsedZhiheng(true); // 标记制衡技能已使用
                             }
                             // 退出制衡模式并重置所有相关状态
                             setIsZhihengMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                           }}
                           className="skill-btn text-base"
                         >
                           确认制衡
                         </button>
                       )}
                       
                       {/* Zhiheng Cancel Button */}
                       {isZhihengMode && (
                         <button 
                           onClick={() => {
                             setIsZhihengMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog(`取消了「制衡」技能`, 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消制衡
                         </button>
                       )}
                       
                       {/* Sun Shangxiang's Jieyin Skill Button */}
                       {players[0].hero.name === '孙尚香' && !isJieyinMode && !hasUsedJieyin && players[0].hand.length >= 2 && (
                         <button
                           onClick={() => {
                             setIsJieyinMode(true);
                             setJieyinTarget(null);
                             addLog('请选择一名已受伤的男性角色（孙尚香「结姻」）...', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           结姻
                         </button>
                       )}

                       {isJieyinMode && (
                         <button
                           onClick={() => {
                             setIsJieyinMode(false);
                             setJieyinTarget(null);
                             addLog('取消了「结姻」技能', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消结姻
                         </button>
                       )}

                       {/* 刘备「激将」：主公技，主动使用【杀】时可令其他蜀势力角色打出【杀】 */}
                       {players[0].hero.name === '刘备' && players[0].identity === Identity.ZHUGONG && !isJijiangMode
                         && players.slice(1).some(p => !p.isDead && p.hero.kingdom === '蜀'
                           && p.hand.some(c => c.name === CardName.SHA)) && (
                         <button
                           onClick={() => {
                             setIsJijiangMode(true);
                             setIsSelectingTarget(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('请选择【杀】的目标（刘备「激将」）...', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           激将
                         </button>
                       )}

                       {isJijiangMode && (
                         <button
                           onClick={() => {
                             setIsJijiangMode(false);
                             addLog('取消了「激将」技能', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消激将
                         </button>
                       )}

                       {/* 甘宁「奇袭」技能按钮 */}
                       {players[0].hero.name === '甘宁' && !isQixiMode && (
                         <button
                           onClick={() => {
                             setIsQixiMode(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('请选择一张黑色牌（甘宁「奇袭」）...', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           奇袭
                         </button>
                       )}

                       {isQixiMode && (
                         <button
                           onClick={() => {
                             setIsQixiMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('取消了「奇袭」技能', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消奇袭
                         </button>
                       )}

                       {/* 丈八蛇矛：两张手牌当【杀】 */}
                       {players[0].equipment?.weapon?.name === CardName.ZHANGBA && !isZhangbaMode && !zhangbaPending
                         && players[0].hand.length >= 2 && (
                         <button
                           onClick={() => {
                             setIsZhangbaMode(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('【丈八蛇矛】：请选择两张手牌当【杀】使用', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           丈八蛇矛
                         </button>
                       )}
                       {isZhangbaMode && (
                         <>
                           <button
                             disabled={selectedCardIds.length !== 2}
                             onClick={() => {
                               const meZ = players.find(p => p.isHuman) || players[0];
                               const picked = meZ.hand.filter(c => selectedCardIds.includes(c.id));
                               if (picked.length !== 2) {
                                 addLog('请选择两张手牌', 'warning');
                                 return;
                               }
                               setZhangbaPending(picked);
                               setIsZhangbaMode(false);
                               setIsSelectingTarget(true);
                               setSelectedCardIds([]);
                               setActiveSelectedId(null);
                               addLog('请选择【杀】的目标', 'info');
                             }}
                             className={`px-4 py-2 rounded-lg font-ancient text-base border-2 ${selectedCardIds.length === 2
                               ? 'bg-[#9e2b25] text-[#f7e7cf] border-[#c86b62] hover:bg-[#b0322b]'
                               : 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed'}`}
                           >
                             当【杀】使用
                           </button>
                           <button
                             onClick={() => {
                               setIsZhangbaMode(false);
                               setSelectedCardIds([]);
                               setActiveSelectedId(null);
                               setIsSelectingTarget(false);
                               addLog('取消了「丈八蛇矛」', 'info');
                             }}
                             className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                           >
                             取消
                           </button>
                         </>
                       )}

                       {/* 周瑜「反间」 */}
                       {players[0].hero.name === '周瑜' && !isFanjianMode && !hasUsedFanjian && (
                         <button
                           onClick={() => {
                             setIsFanjianMode(true);
                             setIsSelectingTarget(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('「反间」：请选择一名其他角色', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           反间
                         </button>
                       )}
                       {isFanjianMode && (
                         <button
                           onClick={() => {
                             setIsFanjianMode(false);
                             setIsSelectingTarget(false);
                             setSelectedCardIds([]);
                             addLog('取消了「反间」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消反间
                         </button>
                       )}

                       {/* 大乔「国色」 */}
                       {players[0].hero.name === '大乔' && !isGuoseMode && (
                         <button
                           onClick={() => {
                             setIsGuoseMode(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('「国色」：请选择一张方块牌', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           国色
                         </button>
                       )}
                       {isGuoseMode && (
                         <button
                           onClick={() => {
                             setIsGuoseMode(false);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('取消了「国色」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消国色
                         </button>
                       )}

                       {/* 华佗「青囊」 */}
                       {players[0].hero.name === '华佗' && !isQingnangMode && !hasUsedQingnang
                         && players[0].hand.length > 0 && (
                         <button
                           onClick={() => {
                             setIsQingnangMode(true);
                             setQingnangCardId(null);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('「青囊」：请选择一张手牌作为代价', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           青囊
                         </button>
                       )}
                       {isQingnangMode && (
                         <button
                           onClick={() => {
                             setIsQingnangMode(false);
                             setQingnangCardId(null);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(false);
                             addLog('取消了「青囊」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消青囊
                         </button>
                       )}

                       {/* 步练师「安恤」 */}
                       {players[0].hero.name === '步练师' && !isAnxuMode && !hasUsedAnxu
                         && players.filter(p => !p.isDead && !p.isHuman).length >= 2 && (
                         <button
                           onClick={() => {
                             setIsAnxuMode(true);
                             setAnxuTargets([]);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             setIsSelectingTarget(true);
                             addLog('「安恤」：请选择两名手牌数不同的其他角色', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           安恤
                         </button>
                       )}
                       {isAnxuMode && (
                         <button
                           onClick={() => {
                             setIsAnxuMode(false);
                             setAnxuTargets([]);
                             setIsSelectingTarget(false);
                             addLog('取消了「安恤」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消安恤
                         </button>
                       )}

                       {/* 吴国太「甘露」 */}
                       {players[0].hero.name === '吴国太' && !isGanluMode && !hasUsedGanlu
                         && players.filter(p => !p.isDead).length >= 2 && (
                         <button
                           onClick={() => {
                             setIsGanluMode(true);
                             setGanluTargets([]);
                             setIsSelectingTarget(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('「甘露」：请依次选择两名角色（装备数差不超过已损体力）', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           甘露
                         </button>
                       )}
                       {isGanluMode && (
                         <button
                           onClick={() => {
                             setIsGanluMode(false);
                             setGanluTargets([]);
                             setIsSelectingTarget(false);
                             addLog('取消了「甘露」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消甘露
                         </button>
                       )}

                       {/* 邹氏「倾城」 */}
                       {players[0].hero.name === '邹氏' && !isQingchengMode && !hasUsedQingcheng
                         && (players[0].hand.some(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB)
                           || (Object.values(players[0].equipment ?? {}) as Array<Card | undefined>).some(c => !!c && (c.suit === Suit.SPADE || c.suit === Suit.CLUB))) && (
                         <button
                           onClick={() => {
                             setIsQingchengMode(true);
                             setIsSelectingTarget(true);
                             setSelectedCardIds([]);
                             setActiveSelectedId(null);
                             addLog('「倾城」：请选择一名武将牌明置的角色（弃置一张黑色牌暗置其武将牌）', 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           倾城
                         </button>
                       )}
                       {isQingchengMode && (
                         <button
                           onClick={() => {
                             setIsQingchengMode(false);
                             setIsSelectingTarget(false);
                             addLog('取消了「倾城」', 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消倾城
                         </button>
                       )}

                       {/* 郭皇后「矫诏」 */}
                       {players[0].hero.name === '郭皇后' && !hasUsedJiaozhao && players[0].hand.length > 0 && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveJiaozhao(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           矫诏 Lv{guohuanghouLevel}
                         </button>
                       )}
                       {players[0].hero.name === '郭皇后' && jiaozhaoPending && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveJiaozhaoUse(); }}
                           className="skill-btn text-base"
                         >
                           使用矫诏【{jiaozhaoPending.declared}】
                         </button>
                       )}

                       {/* 黄盖「苦肉」 */}
                       {players[0].hero.name === '黄盖' && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveKurou(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           苦肉
                         </button>
                       )}

                       {/* 关银屏「血祭」 */}
                       {players[0].hero.name === '关银屏' && !hasUsedXueji
                         && players[0].maxHp > players[0].hp
                         && players[0].hand.some(c => c.suit === Suit.HEART || c.suit === Suit.DIAMOND) && (
                         <button
                           disabled={!!isProcessing || !!dyingState}
                           onClick={() => { void resolveXueji(players[0].id); }}
                           className="skill-btn text-base"
                         >
                           血祭
                         </button>
                       )}

                       {/* Diaochan's Lijian Skill Button */}
                       {players[0].hero.name === '貂蝉' && !isLijianMode && !hasUsedLijian && (
                         <button 
                           onClick={() => {
                             setIsLijianMode(true);
                             setLijianSelectedCardId(null);
                             setLijianSelectedTargets([]);
                             addLog(`请选择要弃置的牌（貂蝉「离间」技能）...`, 'info');
                           }}
                           className="skill-btn text-base"
                         >
                           离间
                         </button>
                       )}
                       
                       {/* Lijian Confirm Button */}
                       {isLijianMode && lijianSelectedCardId && (
                         <button 
                           onClick={async () => {
                             if (lijianSelectedTargets.length !== 2) {
                               addLog(`请选择2名男性角色进行决斗`, 'warning');
                               return;
                             }
                             
                             const me = players.find(p => p.isHuman) || players[0];
                             const card = me.hand.find(c => c.id === lijianSelectedCardId);
                             
                             if (card) {
                               setIsProcessing(p => p + 1);
                               try {
                                 // 弃置选中的牌
                                 discardCards(me.id, [card]);
                                 addLog(`${me.hero.name} 弃置了【${card.name}】，发动「离间」技能！`, 'skill');
                                 showSkillBanner(me.hero.name, '离间');
                                 
                                 // 获取两个目标
                                 const target1 = getPlayer(lijianSelectedTargets[0]);
                                 const target2 = getPlayer(lijianSelectedTargets[1]);
                                 
                                 if (target1 && target2) {
                                   addLog(`离间目标：【${target1.hero.name}】 vs 【${target2.hero.name}】`, 'info');
                                   addLog(`${target1.hero.name} 与 ${target2.hero.name} 开始决斗！`, 'danger');
                                   
                                   // 执行决斗逻辑 - 使用专门的决斗执行函数
                                   await executeDuel(target1.id, target2.id);
                                 }
                                 
                                 setHasUsedLijian(true);
                               } finally {
                                 setIsProcessing(p => Math.max(0, p - 1));
                               }
                             }
                             
                             // 退出离间模式并重置所有相关状态
                             setIsLijianMode(false);
                             setLijianSelectedCardId(null);
                             setLijianSelectedTargets([]);
                           }}
                           disabled={lijianSelectedTargets.length !== 2 || !!dyingState || !!isProcessing}
                           className={`bg-[#33212a] hover:bg-[#402a34] text-[#f0d0e0] px-5 py-2 rounded-lg border border-[#a9737f]/70 hover:border-[#d98a8a] hover:text-white transition-colors font-ancient text-base shadow-lg
                             ${lijianSelectedTargets.length !== 2 || dyingState || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                           确认离间
                         </button>
                       )}
                       
                       {/* Lijian Cancel Button */}
                       {isLijianMode && (
                         <button 
                           onClick={() => {
                             setIsLijianMode(false);
                             setLijianSelectedCardId(null);
                             setLijianSelectedTargets([]);
                             addLog(`取消了「离间」技能`, 'info');
                           }}
                           className="btn-ink px-4 py-2 rounded-lg font-ancient text-base"
                         >
                           取消离间
                         </button>
                       )}
                       
                       {/* End Turn - 结束回合按钮 */}
                      <button 
                        data-tour="end-turn"
                        onClick={endTurn}
                        disabled={!!dyingState || isProcessing > 0}
                        className={`btn-ink px-6 py-2 rounded-lg text-lg font-ancient tracking-[0.1em] border
                          ${(dyingState || isProcessing > 0) ? 'opacity-45 cursor-not-allowed' : ''}
                        `}
                      >
                        结束回合
                      </button>
                    </>
                  )}
                </div>

                {/* Discard Button - 弃牌阶段（附「需弃置 N 张」提示，避免不知道点几张） */}
                {isMyTurn && phase === GamePhase.DISCARD && !isAiTakeover && (() => {
                  const excess = excessCards(me);
                  const picked = selectedCardIds.length;
                  const exact = excess === picked && excess > 0;
                  const over = picked > excess;
                  return (
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold tabular-nums tracking-wide ${over ? 'text-[#e0705f]' : exact ? 'text-[#e8cf94]' : theme === 'dark' ? 'text-stone-400' : 'text-[#6b6459]'}`}>
                        需弃置 {Math.max(0, excess)} 张 · 已选 {picked} 张
                      </span>
                      <button
                        onClick={handleDiscardConfirm}
                        disabled={!!dyingState || isProcessing > 0 || !exact}
                        className={`
                          px-8 py-2.5 rounded-lg text-xl font-ancient tracking-[0.14em] border
                          ${exact && !dyingState && !isProcessing
                            ? 'btn-gold'
                            : 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed'}
                        `}
                      >
                        弃 牌
                      </button>
                    </div>
                  );
                })()}
                
                {/* Cancel Selection - 取消选择按钮 */}
                {(isSelectingTarget || (isMyTurn && phase === GamePhase.ACTION && selectedCardIds.length > 0)) && (
                  <button 
                    onClick={() => { if (!dyingState && !isProcessing) { setSelectedCardIds([]); setActiveSelectedId(null); setIsSelectingTarget(false); } }}
                    disabled={!!dyingState || isProcessing > 0}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors border
                      ${(dyingState || isProcessing > 0) 
                        ? 'bg-[#1a1512] text-[#5a5248] border-[#3a3229] cursor-not-allowed opacity-50' 
                        : 'bg-[#221b16] text-[#c8bda8] border-[#6a5642] hover:border-[#c8a45c] hover:text-[#e8cf94]'}
                    `}
                  >
                    取消选择
                  </button>
                )}

                <button
                  onClick={handleAskStrategy}
                  disabled={me.isDead || !!dyingState || isProcessing > 0}
                  className={`btn-ink px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 ${(dyingState || isProcessing > 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <IconBook />
                  问计
                </button>
            </div>
    </>
  );
};
