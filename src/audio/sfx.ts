// 本地合成音效：使用 WebAudio 实时合成，不依赖外部 CDN，离线可用且无版权问题
export type SfxKind =
  | 'slash' | 'whoosh' | 'heal' | 'clash' | 'drum' | 'mystery' | 'counter'
  | 'arrows' | 'sneak' | 'destroy' | 'imprison' | 'fire' | 'wine' | 'damage' | 'death';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOptions {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone(ac: AudioContext, o: ToneOptions) {
  const t0 = ac.currentTime + (o.delay ?? 0);
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur);
  const peak = o.gain ?? 0.25;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, o.dur / 3));
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

interface NoiseOptions {
  dur: number;
  gain?: number;
  delay?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

function noise(ac: AudioContext, o: NoiseOptions) {
  const t0 = ac.currentTime + (o.delay ?? 0);
  const len = Math.max(1, Math.ceil(o.dur * ac.sampleRate));
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = o.filter ?? 'lowpass';
  const startFreq = o.freq ?? 1200;
  filter.frequency.setValueAtTime(startFreq, t0);
  if (o.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur);
  if (o.q) filter.Q.value = o.q;

  const amp = ac.createGain();
  const peak = o.gain ?? 0.2;
  amp.gain.setValueAtTime(peak, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + o.dur);
}

export function playSfx(kind: SfxKind) {
  const ac = getCtx();
  if (!ac) return;

  switch (kind) {
    case 'slash':
      noise(ac, { dur: 0.16, gain: 0.28, filter: 'highpass', freq: 2400, to: 800 });
      tone(ac, { freq: 900, to: 180, dur: 0.14, type: 'triangle', gain: 0.16 });
      break;
    case 'whoosh':
      noise(ac, { dur: 0.3, gain: 0.2, filter: 'bandpass', freq: 2200, to: 500, q: 0.8 });
      break;
    case 'heal':
      tone(ac, { freq: 520, to: 700, dur: 0.35, gain: 0.18 });
      tone(ac, { freq: 780, to: 1040, dur: 0.45, gain: 0.12, delay: 0.12 });
      break;
    case 'clash':
      tone(ac, { freq: 1200, to: 400, dur: 0.12, type: 'square', gain: 0.12 });
      noise(ac, { dur: 0.2, gain: 0.22, filter: 'highpass', freq: 1800 });
      break;
    case 'drum':
      tone(ac, { freq: 110, to: 60, dur: 0.5, gain: 0.3 });
      noise(ac, { dur: 0.25, gain: 0.16, filter: 'lowpass', freq: 400, delay: 0.02 });
      tone(ac, { freq: 95, to: 55, dur: 0.4, gain: 0.22, delay: 0.35 });
      break;
    case 'mystery':
      tone(ac, { freq: 660, dur: 0.5, gain: 0.1 });
      tone(ac, { freq: 700, dur: 0.5, gain: 0.1 });
      tone(ac, { freq: 990, dur: 0.6, gain: 0.08, delay: 0.18 });
      break;
    case 'counter':
      tone(ac, { freq: 1400, to: 900, dur: 0.18, type: 'triangle', gain: 0.18 });
      noise(ac, { dur: 0.12, gain: 0.14, filter: 'highpass', freq: 3000, delay: 0.03 });
      break;
    case 'arrows':
      for (let i = 0; i < 4; i++) {
        noise(ac, { dur: 0.12, gain: 0.14, filter: 'bandpass', freq: 2000 + i * 300, to: 600, q: 1.2, delay: i * 0.07 });
      }
      break;
    case 'sneak':
      tone(ac, { freq: 420, to: 260, dur: 0.32, type: 'triangle', gain: 0.12 });
      break;
    case 'destroy':
      noise(ac, { dur: 0.35, gain: 0.24, filter: 'lowpass', freq: 900, to: 300 });
      tone(ac, { freq: 180, to: 90, dur: 0.4, type: 'sawtooth', gain: 0.1 });
      break;
    case 'imprison':
      tone(ac, { freq: 330, to: 180, dur: 0.5, gain: 0.16 });
      tone(ac, { freq: 220, to: 140, dur: 0.6, gain: 0.12, delay: 0.1 });
      break;
    case 'fire':
      noise(ac, { dur: 0.45, gain: 0.22, filter: 'bandpass', freq: 700, to: 2200, q: 0.7 });
      tone(ac, { freq: 300, to: 520, dur: 0.32, type: 'sawtooth', gain: 0.08 });
      break;
    case 'wine':
      tone(ac, { freq: 380, to: 520, dur: 0.3, gain: 0.14 });
      break;
    case 'damage':
      noise(ac, { dur: 0.22, gain: 0.3, filter: 'lowpass', freq: 1600, to: 400 });
      tone(ac, { freq: 140, to: 70, dur: 0.28, gain: 0.24 });
      break;
    case 'death':
      tone(ac, { freq: 300, to: 90, dur: 0.9, gain: 0.2 });
      tone(ac, { freq: 200, to: 60, dur: 1.1, gain: 0.14, delay: 0.1 });
      noise(ac, { dur: 0.6, gain: 0.1, filter: 'lowpass', freq: 500, delay: 0.05 });
      break;
  }
}

// 牌名 / 事件名 → 音效类型
export const SFX_FOR_NAME: Record<string, SfxKind> = {
  '杀': 'slash',
  '闪': 'whoosh',
  '桃': 'heal',
  '酒': 'wine',
  '决斗': 'clash',
  '南蛮入侵': 'drum',
  '万箭齐发': 'arrows',
  '无中生有': 'mystery',
  '无懈可击': 'counter',
  '顺手牵羊': 'sneak',
  '过河拆桥': 'destroy',
  '乐不思蜀': 'imprison',
  '兵粮寸断': 'imprison',
  '火攻': 'fire',
  '铁索连环': 'mystery',
  '五谷丰登': 'heal',
  '桃园结义': 'heal',
  '借刀杀人': 'clash',
  '闪电': 'fire',
  damage: 'damage',
  death: 'death',
  equip: 'clash',
};
