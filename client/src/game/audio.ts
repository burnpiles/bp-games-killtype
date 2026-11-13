// Procedural audio engine: synthesized SFX + an adaptive synthwave score.
// The AudioContext is created lazily and resumed on every user gesture, which is
// what iOS Safari and Chrome's autoplay policy require.

import type { WeaponId } from './config';

type Ctx = AudioContext;

const STORAGE_KEY = 'killtype.audio.v1';

interface AudioPrefs { muted: boolean; music: number; sfx: number }

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { muted: false, music: 0.8, sfx: 1, ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  return { muted: false, music: 0.8, sfx: 1 };
}

// Natural minor progression in A: Am - F - C - G  /  boss: Am - Bb - Am - E
const PROG_NORMAL = [
  [45, 52, 57, 60, 64],
  [41, 48, 53, 57, 60],
  [48, 55, 60, 64, 67],
  [43, 50, 55, 59, 62],
];
const PROG_BOSS = [
  [45, 52, 57, 60, 64],
  [46, 53, 58, 62, 65],
  [45, 52, 57, 60, 64],
  [40, 47, 52, 56, 59],
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: Ctx | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private prefs: AudioPrefs = loadPrefs();
  private listeners = new Set<() => void>();

  // music sequencer
  private musicOn = false;
  private nextNoteTime = 0;
  private step = 0;
  private schedTimer: number | null = null;
  private bpm = 112;
  /** 0 = menu, 1 = calm play, 2 = combo heat, 3 = max / boss */
  intensity = 0;
  boss = false;
  private musicFilter!: BiquadFilterNode;
  private duckGain!: GainNode;

  get muted() { return this.prefs.muted; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  /** Must be called from inside a user gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    // iOS needs a sound started inside the gesture to fully unlock.
    const b = this.ctx.createBufferSource();
    b.buffer = this.ctx.createBuffer(1, 1, 22050);
    b.connect(this.ctx.destination);
    b.start(0);
  }

  private build() {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.prefs.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85 * this.prefs.sfx;
    this.sfxBus.connect(this.master);

    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2400;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32 * this.prefs.music;
    this.musicBus.connect(this.musicFilter).connect(this.duckGain).connect(this.master);

    // Generated impulse response for a dark, roomy reverb.
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(conv).connect(wet).connect(this.master);

    const nlen = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.prefs.muted = m;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
    this.listeners.forEach(f => f());
  }
  toggleMute() { this.setMuted(!this.prefs.muted); }

  suspend() { this.ctx?.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  private get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  // ---------- primitives ----------
  private tone(freq: number, dur: number, opts: {
    type?: OscillatorType; gain?: number; endFreq?: number; attack?: number; when?: number;
    bus?: AudioNode; reverb?: number; filter?: number; detune?: number;
  } = {}) {
    const ctx = this.ctx!;
    const t = (opts.when ?? ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain(); s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: {
    type?: BiquadFilterType; freq?: number; endFreq?: number; q?: number; gain?: number;
    attack?: number; when?: number; bus?: AudioNode; reverb?: number;
  } = {}) {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.frequency.setValueAtTime(opts.freq ?? 2000, t);
    if (opts.endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.endFreq), t + dur);
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    if (opts.reverb) {
      const s = ctx.createGain(); s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private duck(amount = 0.45, time = 0.35) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(amount, t + 0.02);
    g.linearRampToValueAtTime(1, t + time);
  }

  // ---------- SFX ----------
  key(progress: number) {
    if (!this.ok) return;
    const f = 900 + Math.min(progress, 14) * 70;
    this.tone(f, 0.05, { type: 'triangle', gain: 0.07 });
    this.noise(0.018, { type: 'highpass', freq: 5000, gain: 0.05 });
  }

  tracer() {
    if (!this.ok) return;
    this.noise(0.04, { type: 'bandpass', freq: 3200, q: 1.4, gain: 0.06 });
  }

  miss() {
    if (!this.ok) return;
    this.tone(140, 0.09, { type: 'square', gain: 0.06, endFreq: 90, filter: 900 });
    this.noise(0.05, { type: 'lowpass', freq: 600, gain: 0.05 });
  }

  shot(weapon: WeaponId) {
    if (!this.ok) return;
    switch (weapon) {
      case 'pistol':
        this.noise(0.09, { type: 'bandpass', freq: 1700, endFreq: 500, q: 0.9, gain: 0.32, reverb: 0.3 });
        this.tone(170, 0.11, { type: 'sine', gain: 0.35, endFreq: 50 });
        break;
      case 'machinegun':
        for (let i = 0; i < 3; i++) {
          const w = this.ctx!.currentTime + i * 0.045;
          this.noise(0.05, { type: 'bandpass', freq: 2200, endFreq: 700, q: 1, gain: 0.22, when: w });
          this.tone(150, 0.06, { gain: 0.2, endFreq: 60, when: w });
        }
        break;
      case 'grenade':
        this.tone(420, 0.18, { type: 'triangle', gain: 0.12, endFreq: 180 });
        this.noise(0.12, { type: 'bandpass', freq: 900, gain: 0.12 });
        break;
      case 'rocket':
      case 'bazooka':
        this.noise(0.35, { type: 'bandpass', freq: 600, endFreq: 3000, q: 1.2, gain: 0.25, attack: 0.03 });
        this.tone(90, 0.25, { type: 'sawtooth', gain: 0.12, endFreq: 40, filter: 400 });
        break;
      case 'nuke':
        this.tone(1400, 0.7, { type: 'sine', gain: 0.1, endFreq: 200, reverb: 0.6 });
        this.noise(0.6, { type: 'bandpass', freq: 400, endFreq: 4000, gain: 0.2, attack: 0.1 });
        break;
    }
  }

  explosion(size: number) {
    if (!this.ok) return;
    const s = Math.min(size, 3);
    this.duck(0.5, 0.25 + s * 0.15);
    this.noise(0.5 + s * 0.35, { type: 'lowpass', freq: 1800 + s * 400, endFreq: 70, gain: 0.45, reverb: 0.5 });
    this.tone(85, 0.5 + s * 0.3, { type: 'sine', gain: 0.55, endFreq: 28 });
    this.tone(55, 0.6 + s * 0.3, { type: 'triangle', gain: 0.3, endFreq: 25 });
  }

  kill(multi: number) {
    if (!this.ok) return;
    this.noise(0.14, { type: 'lowpass', freq: 900, endFreq: 200, gain: 0.25 });
    this.tone(70, 0.16, { gain: 0.3, endFreq: 35 });
    const base = multi > 1 ? 1046 : 880;
    this.tone(base, 0.12, { type: 'sine', gain: 0.05, reverb: 0.4, when: this.ctx!.currentTime + 0.02 });
    this.tone(base * 1.5, 0.18, { type: 'sine', gain: 0.04, reverb: 0.4, when: this.ctx!.currentTime + 0.06 });
  }

  hurt() {
    if (!this.ok) return;
    this.duck(0.25, 0.6);
    this.tone(110, 0.45, { type: 'sawtooth', gain: 0.25, endFreq: 30, filter: 700 });
    this.tone(60, 0.5, { type: 'sine', gain: 0.5, endFreq: 25 });
    this.noise(0.3, { type: 'lowpass', freq: 1200, endFreq: 100, gain: 0.3 });
  }

  pickup(_weapon: WeaponId) {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(72 + n), 0.16, { type: 'square', gain: 0.05, filter: 3000, when: t + i * 0.05, reverb: 0.4 }));
  }

  comboTier(tier: number) {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noise(0.35, { type: 'bandpass', freq: 500, endFreq: 6000, q: 0.7, gain: 0.08, attack: 0.15 });
    const root = 57 + tier * 2;
    [0, 7, 12, 16].forEach(n => this.tone(mtof(root + n), 0.5, { type: 'sawtooth', gain: 0.035, filter: 2500, when: t + 0.12, reverb: 0.6 }));
  }

  comboLost() {
    if (!this.ok) return;
    this.tone(330, 0.25, { type: 'triangle', gain: 0.05, endFreq: 140 });
  }

  bossEnter() {
    if (!this.ok) return;
    this.duck(0.2, 2);
    this.tone(48, 2.2, { type: 'sawtooth', gain: 0.25, endFreq: 36, filter: 300, attack: 0.3, reverb: 0.5 });
    this.tone(72, 1.6, { type: 'sawtooth', gain: 0.12, endFreq: 50, filter: 500, attack: 0.4, detune: 14 });
    this.noise(1.8, { type: 'bandpass', freq: 250, endFreq: 120, q: 3, gain: 0.25, attack: 0.4, reverb: 0.5 });
  }

  stomp() {
    if (!this.ok) return;
    this.tone(60, 0.35, { gain: 0.6, endFreq: 25 });
    this.noise(0.25, { type: 'lowpass', freq: 400, endFreq: 60, gain: 0.35 });
  }

  laserCharge() {
    if (!this.ok) return;
    this.tone(260, 0.7, { type: 'sawtooth', gain: 0.05, endFreq: 1100, filter: 2500, attack: 0.5 });
  }

  laserFire() {
    if (!this.ok) return;
    this.tone(1800, 0.25, { type: 'square', gain: 0.06, endFreq: 200, filter: 4000 });
    this.noise(0.2, { type: 'highpass', freq: 3000, gain: 0.07 });
  }

  bossPart() {
    if (!this.ok) return;
    this.explosion(1.5);
    this.tone(220, 0.4, { type: 'square', gain: 0.06, endFreq: 70, filter: 1500 });
  }

  bossDeath() {
    if (!this.ok) return;
    this.explosion(3);
    const t = this.ctx!.currentTime;
    this.tone(40, 2.5, { type: 'sawtooth', gain: 0.2, endFreq: 20, filter: 200, reverb: 0.8 });
    [0, 3, 7, 12].forEach((n, i) => this.tone(mtof(57 + n), 1.6, { type: 'sawtooth', gain: 0.04, filter: 2000, when: t + 0.6 + i * 0.12, reverb: 0.8 }));
  }

  chapter() {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone(mtof(60 + n), 0.9, { type: 'triangle', gain: 0.06, when: t + i * 0.08, reverb: 0.7 }));
  }

  gameOver() {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.duck(0.0, 3);
    [64, 60, 57, 52].forEach((m, i) => this.tone(mtof(m), 0.7, { type: 'sawtooth', gain: 0.06, filter: 900, when: t + i * 0.28, reverb: 0.8 }));
    this.tone(45, 2.4, { type: 'sine', gain: 0.4, endFreq: 22, when: t + 0.9 });
  }

  // ---- close-quarters / new enemies ----
  grabStart() {
    if (!this.ok) return;
    this.duck(0.3, 0.8);
    this.tone(220, 0.5, { type: 'sawtooth', gain: 0.18, endFreq: 110, filter: 1400, reverb: 0.3 });
    this.tone(233, 0.5, { type: 'sawtooth', gain: 0.14, endFreq: 116, filter: 1400 });
    this.noise(0.35, { type: 'bandpass', freq: 900, endFreq: 300, q: 2, gain: 0.25 });
  }
  bite() {
    if (!this.ok) return;
    this.noise(0.12, { type: 'bandpass', freq: 1800, endFreq: 600, q: 3, gain: 0.35 });
    this.tone(90, 0.16, { type: 'square', gain: 0.18, endFreq: 50, filter: 600 });
  }
  breakFree() {
    if (!this.ok) return;
    this.tone(180, 0.25, { type: 'square', gain: 0.22, endFreq: 520, filter: 2600 });
    this.noise(0.22, { type: 'highpass', freq: 800, endFreq: 3000, gain: 0.25, reverb: 0.25 });
    this.tone(70, 0.3, { gain: 0.45, endFreq: 30 });
  }
  armorBreak() {
    if (!this.ok) return;
    this.noise(0.2, { type: 'highpass', freq: 2500, endFreq: 1200, gain: 0.3 });
    this.tone(880, 0.18, { type: 'triangle', gain: 0.14, endFreq: 440, reverb: 0.3 });
  }
  enemyShot() {
    if (!this.ok) return;
    this.tone(1200, 0.16, { type: 'square', gain: 0.08, endFreq: 300, filter: 3000 });
  }
  enemyCharge() {
    if (!this.ok) return;
    this.tone(300, 0.5, { type: 'sine', gain: 0.07, endFreq: 1100 });
  }
  missileLaunch() {
    if (!this.ok) return;
    this.noise(0.6, { type: 'bandpass', freq: 600, endFreq: 2400, q: 1, gain: 0.25, reverb: 0.2 });
    this.tone(160, 0.4, { type: 'sawtooth', gain: 0.08, endFreq: 420, filter: 1200 });
  }
  swipeTell() {
    if (!this.ok) return;
    this.tone(140, 0.7, { type: 'sawtooth', gain: 0.1, endFreq: 260, filter: 800 });
  }
  swipe() {
    if (!this.ok) return;
    this.noise(0.35, { type: 'bandpass', freq: 400, endFreq: 2600, q: 0.8, gain: 0.4 });
  }
  bark() {
    if (!this.ok) return;
    this.tone(420, 0.09, { type: 'square', gain: 0.07, endFreq: 260, filter: 1500 });
    this.tone(400, 0.08, { type: 'square', gain: 0.06, endFreq: 240, filter: 1500, when: this.ctx!.currentTime + 0.12 });
  }
  engine() {
    if (!this.ok) return;
    this.tone(55, 0.9, { type: 'sawtooth', gain: 0.12, endFreq: 140, filter: 500 });
  }
  crash() {
    if (!this.ok) return;
    this.noise(0.5, { type: 'lowpass', freq: 3000, endFreq: 200, gain: 0.45 });
    this.tone(80, 0.4, { gain: 0.4, endFreq: 30 });
  }
  levelClear() {
    if (!this.ok) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.12, when: this.ctx!.currentTime + i * 0.09, reverb: 0.4 }));
  }

  uiHover() {
    if (!this.ok) return;
    this.tone(1600, 0.04, { type: 'sine', gain: 0.025 });
  }

  uiClick() {
    if (!this.ok) return;
    this.tone(700, 0.08, { type: 'triangle', gain: 0.08, endFreq: 1400 });
    this.noise(0.03, { type: 'highpass', freq: 4000, gain: 0.04 });
  }

  // ---------- music ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      if (this.ctx.state === 'running') {
        while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
          this.scheduleStep(this.step, this.nextNoteTime);
          this.nextNoteTime += 60 / this.bpm / 4;
          this.step = (this.step + 1) % 64;
        }
      } else {
        this.nextNoteTime = this.ctx.currentTime + 0.1;
      }
      this.schedTimer = window.setTimeout(tick, 25);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    if (this.schedTimer) clearTimeout(this.schedTimer);
  }

  setIntensity(level: number, boss: boolean) {
    this.intensity = level;
    this.boss = boss;
    if (this.ctx) {
      const target = level === 0 ? 900 : level === 1 ? 2000 : level === 2 ? 3600 : 6000;
      this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    }
  }

  private scheduleStep(step: number, t: number) {
    const bus = this.musicBus;
    const prog = this.boss ? PROG_BOSS : PROG_NORMAL;
    const chord = prog[Math.floor(step / 16) % 4];
    const s16 = step % 16;
    const I = this.intensity;
    const stepDur = 60 / this.bpm / 4;

    // Pad: on bar start
    if (s16 === 0) {
      chord.slice(1, 4).forEach((m, i) => {
        this.tone(mtof(m), stepDur * 16, { type: 'sawtooth', gain: I === 0 ? 0.05 : 0.035, filter: 1100, attack: 0.6, when: t, bus, detune: (i - 1) * 9, reverb: 0.5 });
      });
    }
    // Bass
    if (I >= 1) {
      const pattern = this.boss ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1] : [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1];
      if (pattern[s16]) {
        const m = chord[0] - 12 + (s16 === 14 && !this.boss ? 12 : 0);
        this.tone(mtof(m), stepDur * 0.9, { type: 'sawtooth', gain: 0.16, filter: 380 + I * 160, when: t, bus });
      }
    }
    // Kick
    if (I >= 1 && (s16 % 4 === 0 || (this.boss && s16 === 10))) {
      this.tone(120, 0.22, { type: 'sine', gain: 0.55, endFreq: 38, when: t, bus });
    }
    // Snare / clap
    if (I >= 1 && (s16 === 4 || s16 === 12)) {
      this.noise(0.16, { type: 'bandpass', freq: 1800, q: 0.7, gain: 0.16, when: t, bus, reverb: 0.3 });
      this.tone(190, 0.08, { type: 'triangle', gain: 0.1, endFreq: 120, when: t, bus });
    }
    // Hats
    if (I >= 2 || (I >= 1 && s16 % 2 === 0)) {
      const open = s16 % 4 === 2;
      this.noise(open ? 0.08 : 0.03, { type: 'highpass', freq: 7500, gain: open ? 0.05 : 0.035, when: t, bus });
    }
    // Arp lead
    if (I >= 2 || (I === 0 && step % 2 === 0)) {
      const arp = [0, 2, 3, 4, 3, 2, 1, 2];
      const idx = arp[(s16 / (I === 0 ? 2 : 1) | 0) % arp.length];
      const m = chord[Math.min(idx + 1, chord.length - 1)] + (I >= 3 ? 12 : 0) + (I === 0 ? 12 : 0);
      this.tone(mtof(m), stepDur * (I === 0 ? 1.6 : 0.8), { type: I === 0 ? 'triangle' : 'square', gain: I === 0 ? 0.025 : 0.03, filter: I >= 3 ? 4200 : 2200, when: t, bus, reverb: 0.5 });
    }
  }
}

export const audio = new AudioEngine();
