import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardType, Identity, Suit } from '../../types.ts';
import {
  computeDiscardExcess,
  countExemptHandCards,
  evaluateWinnerSide,
  handLimitOf,
  nextAliveTurnIndex,
} from './rules.ts';

type P = Parameters<typeof handLimitOf>[0];

const card = (type: CardType, suit: Suit) => ({ type, suit } as unknown as P['hand'][number]);

const mk = (over: Record<string, unknown> = {}) => ({
  id: 0,
  isDead: false,
  identity: Identity.ZHONGCHEN,
  hp: 4,
  maxHp: 4,
  hand: [],
  hero: { name: '曹操' },
  handLimitDelta: 0,
  ...over,
} as unknown as P);

test('handLimitOf：普通武将按体力，胡金定按体力上限', () => {
  assert.equal(handLimitOf(mk({ hp: 2, maxHp: 4 })), 2);
  assert.equal(handLimitOf(mk({ hero: { name: '胡金定' }, hp: 2, maxHp: 4 })), 4);
});

test('countExemptHandCards：羽化算非基本牌，黠慧只算黑色牌', () => {
  const hand = [
    card(CardType.BASIC, Suit.SPADE),
    card(CardType.SCROLL, Suit.HEART),
    card(CardType.EQUIPMENT, Suit.CLUB),
  ];
  assert.equal(countExemptHandCards(mk({ hero: { name: '诸葛果' }, hand })), 2);
  assert.equal(countExemptHandCards(mk({ hero: { name: '董白' }, hand })), 2);
  assert.equal(countExemptHandCards(mk({ hero: { name: '曹操' }, hand })), 0);
});

test('computeDiscardExcess：基础、上限加成、不计入手牌的豁免', () => {
  const six = [1, 2, 3, 4, 5, 6].map(() => card(CardType.BASIC, Suit.HEART));
  assert.equal(computeDiscardExcess(mk({ hand: six })), 2);
  assert.equal(computeDiscardExcess(mk({ hand: six.slice(0, 3) })), 0);
  assert.equal(computeDiscardExcess(mk({ hand: six, handLimitDelta: 2 })), 0);
  assert.equal(computeDiscardExcess(mk({ hand: six, hp: 1 })), 5);
  // 诸葛果 8 张手牌里 2 张非基本牌，体力 4 → 8 - 4 - 2
  const zhuge = [
    ...six,
    card(CardType.SCROLL, Suit.HEART),
    card(CardType.EQUIPMENT, Suit.HEART),
  ];
  assert.equal(countExemptHandCards(mk({ hero: { name: '诸葛果' }, hand: zhuge })), 2);
  assert.equal(computeDiscardExcess(mk({ hero: { name: '诸葛果' }, hand: zhuge })), 2);
  // 体力上限高于当前体力时，弃牌数按当前体力算
  assert.equal(computeDiscardExcess(mk({ hand: six, hp: 2, maxHp: 5 })), 4);
});

test('nextAliveTurnIndex：正常下一位、绕圈、跳过阵亡', () => {
  const players = [0, 1, 2, 3].map(id => mk({ id }));
  assert.equal(nextAliveTurnIndex(players, 0), 1);
  assert.equal(nextAliveTurnIndex(players, 3), 0);
  const withDead = [mk({ id: 0 }), mk({ id: 1, isDead: true }), mk({ id: 2 }), mk({ id: 3 })];
  assert.equal(nextAliveTurnIndex(withDead, 0), 2);
  assert.equal(nextAliveTurnIndex(withDead, 3), 0);
  assert.equal(nextAliveTurnIndex([], 0), 0);
});

test('nextAliveTurnIndex：全部阵亡时不会死循环', () => {
  const allDead = [0, 1, 2, 3, 4].map(id => mk({ id, isDead: true }));
  const idx = nextAliveTurnIndex(allDead, 0);
  assert.ok(idx >= 0 && idx < allDead.length);
  // 受限跳跃次数：只跳 1 次时应停在第二个阵亡位
  assert.equal(nextAliveTurnIndex(allDead, 0, 1), 2);
});

test('evaluateWinnerSide：主公在场且反贼未清空时无结果', () => {
  const players = [
    mk({ id: 0, identity: Identity.ZHUGONG }),
    mk({ id: 1, identity: Identity.FANZEI }),
    mk({ id: 2, identity: Identity.ZHONGCHEN }),
  ];
  assert.equal(evaluateWinnerSide(players), null);
  assert.equal(evaluateWinnerSide([mk({ id: 0, identity: Identity.ZHONGCHEN })]), null);
});

test('evaluateWinnerSide：反贼与内奸全灭 → 主忠胜', () => {
  const players = [
    mk({ id: 0, identity: Identity.ZHUGONG }),
    mk({ id: 1, identity: Identity.FANZEI, isDead: true }),
    mk({ id: 2, identity: Identity.NEIJIAN, isDead: true }),
    mk({ id: 3, identity: Identity.ZHONGCHEN }),
  ];
  assert.equal(evaluateWinnerSide(players), 'lord');
});

test('evaluateWinnerSide：主公阵亡 + 有存活反贼 → 反贼胜', () => {
  const players = [
    mk({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
    mk({ id: 1, identity: Identity.FANZEI }),
    mk({ id: 2, identity: Identity.ZHONGCHEN }),
  ];
  assert.equal(evaluateWinnerSide(players), 'rebel');
});

test('evaluateWinnerSide：主公阵亡 + 仅内奸存活 → 内奸胜', () => {
  const players = [
    mk({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
    mk({ id: 1, identity: Identity.FANZEI, isDead: true }),
    mk({ id: 2, identity: Identity.ZHONGCHEN, isDead: true }),
    mk({ id: 3, identity: Identity.NEIJIAN }),
  ];
  assert.equal(evaluateWinnerSide(players), 'spy');
});

test('evaluateWinnerSide：主公阵亡 + 内奸与忠臣都在 → 反贼胜', () => {
  const players = [
    mk({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
    mk({ id: 1, identity: Identity.NEIJIAN }),
    mk({ id: 2, identity: Identity.ZHONGCHEN }),
  ];
  assert.equal(evaluateWinnerSide(players), 'rebel');
});

test('evaluateWinnerSide：主公阵亡 + 反贼内奸全灭 → 主忠胜', () => {
  const players = [
    mk({ id: 0, identity: Identity.ZHUGONG, isDead: true }),
    mk({ id: 1, identity: Identity.FANZEI, isDead: true }),
    mk({ id: 2, identity: Identity.NEIJIAN, isDead: true }),
    mk({ id: 3, identity: Identity.ZHONGCHEN }),
  ];
  assert.equal(evaluateWinnerSide(players), 'lord');
});
