import { CardName, CardType, Suit } from '../../types.ts';
import type { Card, Player } from '../../types.ts';

/**
 * 第六批新增武将的技能规则纯函数。
 *
 * 只放「输入确定 → 输出确定」的判定：不读 React state、不写日志、不碰计时器，
 * 由 App 主循环与 combat 引擎调用。这样每条技能都能被 node:test 直接覆盖。
 */

/** 王悦 / 王桃「护关」：出牌阶段第一张牌为红色时，可声明一个花色使其本回合不计入手牌上限 */
export const canHuguan = (card: Card): boolean =>
  card.suit === Suit.HEART || card.suit === Suit.DIAMOND;

/** 王悦 / 王桃「护关」：被声明的花色在本回合不计入手牌上限 */
export const countHuguanExempt = (p: Player, declaredSuit: Suit | null): number => {
  if (p.hero.name !== '王悦' && p.hero.name !== '王桃') return 0;
  if (!declaredSuit) return 0;
  return p.hand.filter(c => c.suit === declaredSuit).length;
};

/** 张宁「天则」①：其他角色的黑色判定牌生效后，张宁摸一张 */
export const tianzeDraws = (judgeCard: Card | null, judgeOwner: Player, zhangning: Player | undefined): boolean => {
  if (!judgeCard || !zhangning || zhangning.isDead) return false;
  if (judgeOwner.id === zhangning.id) return false;
  if (judgeOwner.hero.name === '张宁') return false;
  return judgeCard.suit === Suit.SPADE || judgeCard.suit === Suit.CLUB;
};

/** 张宁「天则」②：其他角色出牌阶段第一张黑色手牌结算后，张宁可弃一张黑牌对其造成 1 点伤害 */
export const tianzeCanStrike = (card: Card, usedCount: number, actorId: number, zhangning: Player | undefined): boolean => {
  if (!zhangning || zhangning.isDead) return false;
  if (actorId === zhangning.id) return false;
  if (usedCount !== 1) return false;
  const black = card.suit === Suit.SPADE || card.suit === Suit.CLUB;
  if (!black) return false;
  return zhangning.hand.some(c => c.suit === Suit.SPADE || c.suit === Suit.CLUB);
};

/** 袁姬「芳妒」：回合外本回合第一次受到伤害后，回血（普通伤害）或获得来源一张手牌（属性伤害） */
export const fangduEffect = (
  nature: 'normal' | 'fire' | 'thunder',
): 'heal' | 'steal' => (nature === 'normal' ? 'heal' : 'steal');

/** 袁姬「节行」：体力值变化后摸一张（不计入本回合手牌上限） */
export const jiexingTriggers = (p: Player, hpBefore: number, hpAfter: number): boolean =>
  p.hero.name === '袁姬' && hpBefore !== hpAfter && !p.isDead;

/** 董绾「介绫」：出牌阶段每种花色限一次，可将两张花色不同的手牌当无距离与次数限制的【杀】 */
export const jielingSlotsLeft = (used: Partial<Record<Suit, boolean>>): number =>
  Object.keys(used).length === 0 ? 4 : 4 - Object.values(used).filter(Boolean).length;

/** 董绾「介绫」：两张手牌花色必须不同且该组合花色本阶段未用过 */
export const canJieling = (a: Card, b: Card, used: Partial<Record<Suit, boolean>>): boolean => {
  if (a.suit === b.suit) return false;
  if (used[a.suit] || used[b.suit]) return false;
  return true;
};

/** 董绾「生妒」：目标摸牌后，董绾摸「标记数 × 其摸牌数」张 */
export const shengduDrawCount = (marks: number, drawn: number): number =>
  Math.max(0, marks) * Math.max(0, drawn);

/** 唐姬「抗歌」选中角色于其回合外获得牌时，唐姬摸等量（每回合至多三张） */
export const kanggeDrawCount = (gained: number, alreadyThisTurn: number, cap = 3): number =>
  Math.max(0, Math.min(gained, cap - Math.max(0, alreadyThisTurn)));

/** 庞凤衣「异瞳」：本轮第一次因使用置入弃牌堆的指定花色 → 获得其他每种花色各一张 */
export const yitongTriggers = (
  card: Card, chosenSuit: Suit | null, alreadyThisRound: boolean,
): boolean => !!chosenSuit && !alreadyThisRound && card.suit === chosenSuit;

/** 侯昭宁「和戎」：交换的手牌类型相同 → 免伤并各得装备；不同 → 拆牌并造成 1 点伤害 */
export const herongResult = (a: Card, b: Card): 'same' | 'different' =>
  (a.type === b.type ? 'same' : 'different');

/** 严夫人「匿伏」：锁定技，一名角色的结束阶段把手牌调整为三张 —— 返回需要摸/弃的张数（正数摸，负数弃） */
export const nifuAdjust = (handCount: number): number => 3 - handCount;

/** 朱佩兰「辞虑」：成为普通锦囊目标后，摸「剩余选项数」张 */
export const cilvDrawCount = (remainingOptions: number): number =>
  Math.max(0, remainingOptions);

/** 谢灵毓「元嫡」：其他角色出牌阶段第一张牌未指定除自己以外的目标时可选 */
export const yuanditriggers = (cardTargetsOthers: boolean, usedCount: number): boolean =>
  usedCount === 1 && !cardTargetsOthers;

export const __internal = { Suit, CardType, CardName };
