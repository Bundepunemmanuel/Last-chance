// 100% Procedural Offline TikTok Meme-Style Sound Engine (Web Audio API)

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private noiseBuffer: AudioBuffer | null = null;
  private deathVariant = 0;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.createNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      this.unlock();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.6;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  // Vine Boom sub-bass thud helper
  private triggerVineBoom(ctx: AudioContext, startTime: number, volume = 0.34): void {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(128, startTime);
    sub.frequency.exponentialRampToValueAtTime(30, startTime + 0.42);

    subGain.gain.setValueAtTime(volume, startTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(startTime);
    sub.stop(startTime + 0.58);

    if (this.noiseBuffer) {
      const punch = ctx.createBufferSource();
      punch.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(260, startTime);
      const pGain = ctx.createGain();
      pGain.gain.setValueAtTime(volume * 0.6, startTime);
      pGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);
      punch.connect(lp);
      lp.connect(pGain);
      pGain.connect(ctx.destination);
      punch.start(startTime);
      punch.stop(startTime + 0.18);
    }
  }

  // Funny Squidward/Cartoon tip-toe plop footsteps
  public playFootstep(running: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = running ? 280 + Math.random() * 110 : 210 + Math.random() * 60;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.45, now + 0.04);

    gain.gain.setValueAtTime(running ? 0.075 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Bouncy cartoon "BOING!" jump
  public playJump(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.2);

    lfo.frequency.setValueAtTime(34, now);
    lfoGain.gain.setValueAtTime(28, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.23);
    osc.stop(now + 0.23);
  }

  // Coconut / cartoon "BONK!" landing
  public playLand(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(390, now);
    osc.frequency.exponentialRampToValueAtTime(155, now + 0.075);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Metal Gear "!" alert chirp when hidden spikes arm
  public playSpikeWarning(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1046, now);
    osc.frequency.setValueAtTime(1480, now + 0.045);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Rubber-chicken squeak + snap when spikes shoot up
  public playSpikeSnap(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.linearRampToValueAtTime(920, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.16);

    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Cartoon panicky slide-whistle wobble on collapsing catwalk
  public playPlatformCreak(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.linearRampToValueAtTime(520, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.34);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.37);
  }

  // "ERRRNT!" Game-show wrong buzzer + Vine Boom on Fake Exit Decoy
  public playFakeExitAlarm(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Two detuned sawtooth waves for classic game-show wrong buzzer
    for (const freq of [138, 146]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.setValueAtTime(freq * 0.92, now + 0.22);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.46);
    }

    this.triggerVineBoom(ctx, now + 0.04, 0.28);
  }

  // Sparkly Taco-Bell/Ding-Dong + upbeat chime on Checkpoint
  public playCheckpoint(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.13, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  // Cycles funny TikTok meme death SFX:
  // 0: Vine Boom + Sad Trombone ("Wah-wah-waaaah")
  // 1: Taco Bell Gong + Coconut Bonk
  // 2: Cartoon Slip Slide-Whistle + Vine Boom
  public playDeath(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const mode = this.deathVariant % 3;
    this.deathVariant += 1;

    if (mode === 0) {
      this.triggerVineBoom(ctx, now, 0.32);
      const notes = [
        { f: 233.08, t: 0.14, d: 0.14 },
        { f: 220.0, t: 0.29, d: 0.14 },
        { f: 207.65, t: 0.44, d: 0.14 },
        { f: 196.0, t: 0.59, d: 0.34 },
      ];
      notes.forEach((n, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        const start = now + n.t;
        osc.frequency.setValueAtTime(n.f, start);
        if (idx === 3) {
          osc.frequency.linearRampToValueAtTime(n.f - 18, start + n.d);
        }
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950, start);

        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + n.d);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + n.d + 0.02);
      });
    } else if (mode === 1) {
      // Taco Bell bell dong + comedic bonk
      const bonk = ctx.createOscillator();
      const bGain = ctx.createGain();
      bonk.type = 'sine';
      bonk.frequency.setValueAtTime(480, now);
      bonk.frequency.exponentialRampToValueAtTime(160, now + 0.08);
      bGain.gain.setValueAtTime(0.22, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      bonk.connect(bGain);
      bGain.connect(ctx.destination);
      bonk.start(now);
      bonk.stop(now + 0.1);

      const partials = [164.81, 247.0, 329.63, 494.0];
      partials.forEach((freq, i) => {
        const bell = ctx.createOscillator();
        const g = ctx.createGain();
        bell.type = i === 0 ? 'triangle' : 'sine';
        bell.frequency.setValueAtTime(freq, now + 0.06);
        g.gain.setValueAtTime(0.14 / (i + 1), now + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        bell.connect(g);
        g.connect(ctx.destination);
        bell.start(now + 0.06);
        bell.stop(now + 0.88);
      });
    } else {
      // Cartoon slip whistle + Vine Boom splat
      const slide = ctx.createOscillator();
      const sGain = ctx.createGain();
      slide.type = 'sine';
      slide.frequency.setValueAtTime(1250, now);
      slide.frequency.exponentialRampToValueAtTime(190, now + 0.24);
      sGain.gain.setValueAtTime(0.14, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      slide.connect(sGain);
      sGain.connect(ctx.destination);
      slide.start(now);
      slide.stop(now + 0.27);

      this.triggerVineBoom(ctx, now + 0.22, 0.34);
    }
  }

  // Triple MLG Airhorn meme blast on Victory!
  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const hornHits = [
      { t: 0.0, d: 0.13 },
      { t: 0.16, d: 0.13 },
      { t: 0.32, d: 0.48 },
    ];

    hornHits.forEach((hit) => {
      const start = now + hit.t;
      for (const freq of [349.23, 353.5, 466.16]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);
        if (hit.d > 0.2) {
          osc.frequency.linearRampToValueAtTime(freq * 0.97, start + hit.d);
        }
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1200, start);
        bp.Q.setValueAtTime(0.8, start);

        gain.gain.setValueAtTime(0.075, start);
        gain.gain.setValueAtTime(0.07, start + hit.d * 0.75);
        gain.gain.exponentialRampToValueAtTime(0.001, start + hit.d);

        osc.connect(bp);
        bp.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + hit.d + 0.02);
      }
    });
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.noiseBuffer = null;
    }
  }
}

export const soundEngine = new SoundEngine();
