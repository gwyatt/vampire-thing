// Tiny WebAudio synth: procedural sound effects and a looping chiptune.
// No audio files are needed.

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.lastPlayed = {};
    this.music = null;
  }

  // Must be called from a user gesture (browsers block autoplay).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.6;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone({ type = 'square', freq = 440, to = null, dur = 0.1, vol = 0.3, bus = null, when = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.1, vol = 0.3, filter = 2000, when = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
  }

  // Throttled named effects
  play(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const gap = { hit: 45, gem: 35, shoot: 60, whip: 80, kill: 40 }[name] ?? 0;
    if (now - (this.lastPlayed[name] || 0) < gap) return;
    this.lastPlayed[name] = now;
    switch (name) {
      case 'hit':
        this.noise({ dur: 0.05, vol: 0.18, filter: 1800 });
        break;
      case 'kill':
        this.tone({ type: 'square', freq: 220, to: 60, dur: 0.08, vol: 0.08 });
        break;
      case 'gem':
        this.tone({ type: 'square', freq: 1320 + Math.random() * 200, to: 1800, dur: 0.05, vol: 0.06 });
        break;
      case 'shoot':
        this.tone({ type: 'triangle', freq: 900, to: 400, dur: 0.07, vol: 0.12 });
        break;
      case 'whip':
        this.noise({ dur: 0.09, vol: 0.12, filter: 5000 });
        break;
      case 'hurt':
        this.tone({ type: 'sawtooth', freq: 180, to: 80, dur: 0.15, vol: 0.25 });
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.12, vol: 0.12, when: i * 0.07 }));
        break;
      case 'chest':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.18, vol: 0.1, when: i * 0.09 }));
        break;
      case 'pickup':
        this.tone({ type: 'square', freq: 660, to: 990, dur: 0.1, vol: 0.12 });
        break;
      case 'heal':
        [440, 554, 659].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.12, vol: 0.15, when: i * 0.05 }));
        break;
      case 'zap':
        this.noise({ dur: 0.18, vol: 0.2, filter: 8000 });
        this.tone({ type: 'sawtooth', freq: 1200, to: 100, dur: 0.15, vol: 0.08 });
        break;
      case 'select':
        this.tone({ type: 'square', freq: 880, dur: 0.05, vol: 0.1 });
        break;
      case 'move':
        this.tone({ type: 'square', freq: 440, dur: 0.03, vol: 0.06 });
        break;
      case 'death':
        [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.3, vol: 0.15, when: i * 0.22 }));
        break;
      case 'boss':
        this.tone({ type: 'sawtooth', freq: 110, to: 55, dur: 0.8, vol: 0.25 });
        break;
      case 'bomb':
        this.noise({ dur: 0.6, vol: 0.4, filter: 900 });
        break;
    }
  }

  // Minimal step sequencer. A minor progression with arpeggios.
  startMusic() {
    if (!this.ctx || this.music) return;
    const bpm = 132;
    const step = 60 / bpm / 2; // eighth notes
    const roots = [57, 53, 55, 52]; // A F G E (MIDI)
    const arp = [0, 3, 7, 12, 7, 3, 0, 7];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let i = 0;
    let next = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.25) {
        const bar = Math.floor(i / 16) % roots.length;
        const root = roots[bar];
        const s = i % 16;
        const when = next - this.ctx.currentTime;
        const third = bar === 1 || bar === 2 ? 4 : 3; // F and G major
        const n = arp[s % 8] === 3 ? third : arp[s % 8];
        this.tone({ type: 'square', freq: mtof(root + 12 + n), dur: step * 0.9, vol: 0.06, bus: this.musicBus, when });
        if (s % 4 === 0) this.tone({ type: 'triangle', freq: mtof(root - 12), dur: step * 3.5, vol: 0.35, bus: this.musicBus, when });
        if (s % 4 === 2) this.noiseHat(when);
        next += step;
        i++;
      }
    };
    this.music = setInterval(tick, 50);
  }

  noiseHat(when) {
    this.noise({ dur: 0.03, vol: 0.05, filter: 9000, when });
  }

  stopMusic() {
    if (this.music) clearInterval(this.music);
    this.music = null;
  }
}

export const audio = new Synth();
