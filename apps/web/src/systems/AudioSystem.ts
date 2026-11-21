/**
 * 环境音。优先播放 public/audio/bgm.mp3；
 * 文件不存在时，用 WebAudio 现场合成一段舒缓的铺底和弦 + 零星的钟琴音 + 风声与虫鸣。
 */
export class AudioSystem {
  muted = true;
  private ctx?: AudioContext;
  private master?: GainNode;
  private wet?: GainNode;
  private file?: HTMLAudioElement;
  private timers: number[] = [];
  private readonly volume = 0.55;

  /** 必须在用户点击之后调用（浏览器的自动播放限制） */
  async start() {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.muted = false;
    this.master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 3);

    if (await this.tryFile()) {
      this.ambience();
      return;
    }
    this.reverb();
    this.pad();
    this.bells();
    this.ambience();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      if (!m) void this.ctx.resume();
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : this.volume, this.ctx.currentTime + 0.6);
    }
    if (this.file) this.file.muted = m;
  }

  /** 献花、点蜡烛时的一声轻响 */
  chime(high = false) {
    if (!this.ctx || this.muted) return;
    const base = high ? 880 : 659.25;
    this.bell(base, 0.12, 2.2);
    this.bell(base * 1.5, 0.07, 2.6, 0.12);
  }

  private async tryFile() {
    try {
      const url = `${import.meta.env.BASE_URL}audio/bgm.mp3`;
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) return false;
      const el = new Audio(url);
      el.loop = true;
      el.volume = 0.5;
      await el.play();
      this.file = el;
      return true;
    } catch {
      return false;
    }
  }

  private out() {
    return this.wet ?? this.master!;
  }

  private reverb() {
    const ctx = this.ctx!;
    // 用带反馈的延迟模拟空旷的回声
    const input = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.41;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    input.connect(this.master!);
    input.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(this.master!);
    this.wet = input;
  }

  private pad() {
    const ctx = this.ctx!;
    // C - Am - F - G，每个和弦持续 10 秒，互相交叠
    const chords = [
      [130.81, 196.0, 261.63, 329.63],
      [110.0, 164.81, 220.0, 261.63],
      [87.31, 174.61, 220.0, 261.63],
      [98.0, 146.83, 196.0, 246.94],
    ];
    let i = 0;
    const play = () => {
      const now = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.085, now + 4);
      g.gain.linearRampToValueAtTime(0.06, now + 9);
      g.gain.linearRampToValueAtTime(0, now + 14);
      lp.connect(g);
      g.connect(this.out());
      for (const f of chords[i % chords.length]) {
        for (const det of [-5, 5]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          o.detune.value = det;
          o.connect(lp);
          o.start(now);
          o.stop(now + 14.5);
        }
      }
      i++;
    };
    play();
    this.timers.push(window.setInterval(play, 10000));
  }

  private bell(freq: number, gain: number, dur: number, delay = 0) {
    const ctx = this.ctx!;
    const now = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    g.connect(this.out());
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  private bells() {
    // C 大调五声音阶上零星落下的音
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
    const next = () => {
      this.bell(scale[Math.floor(Math.random() * scale.length)], 0.035 + Math.random() * 0.03, 3.2);
      if (Math.random() < 0.3) this.bell(scale[Math.floor(Math.random() * scale.length)], 0.03, 3, 0.35);
      this.timers.push(window.setTimeout(next, 1800 + Math.random() * 3800));
    };
    this.timers.push(window.setTimeout(next, 2500));
  }

  private ambience() {
    const ctx = this.ctx!;
    // 风声：低通噪声 + 缓慢起伏
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[i] = last * 14;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master!);
    src.start();
    lfo.start();

    // 虫鸣：几声很轻的高频短音
    const chirp = () => {
      const now = ctx.currentTime;
      const f = 3900 + Math.random() * 700;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const cg = ctx.createGain();
        const t = now + k * 0.075;
        cg.gain.setValueAtTime(0, t);
        cg.gain.linearRampToValueAtTime(0.006, t + 0.012);
        cg.gain.linearRampToValueAtTime(0, t + 0.05);
        o.connect(cg);
        cg.connect(this.master!);
        o.start(t);
        o.stop(t + 0.06);
      }
      this.timers.push(window.setTimeout(chirp, 500 + Math.random() * 1900));
    };
    chirp();
  }
}
