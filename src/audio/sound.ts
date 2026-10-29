/**
 * Short synthesized sounds in the spirit of the original's tick, boom and
 * win jingle. Nothing plays unless sound is switched on in Options, and the
 * audio context is only created after a user gesture.
 */
type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'square') {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + start;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export type SoundName = 'tick' | 'boom' | 'win';

export function playSound(name: SoundName): void {
  const ac = context();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  try {
    if (name === 'tick') {
      tone(1800, 0, 0.025, 0.04);
    } else if (name === 'win') {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.12, 0.06));
    } else {
      const length = Math.floor(ac.sampleRate * 0.45);
      const buffer = ac.createBuffer(1, length, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      const src = ac.createBufferSource();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      gain.gain.value = 0.35;
      src.buffer = buffer;
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start();
    }
  } catch {
    /* sound is optional */
  }
}
