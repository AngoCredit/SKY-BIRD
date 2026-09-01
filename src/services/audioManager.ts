/**
 * Procedural Web Audio Engine for SKYBIRD
 * Synthesizes adaptive aerodynamic audio, cyber bird cries, wing swooshes,
 * ambient wind, tension drones, thunder, lightning, jet explosions,
 * countdown blips, and victorious cash out fanfares.
 */

import { SoundConfig } from '../types';

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Continuous sound loops
  private windNode: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneOsc3: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;

  private thrusterNode: AudioBufferSourceNode | null = null;
  private thrusterFilter: BiquadFilterNode | null = null;
  private thrusterGain: GainNode | null = null;

  // Guard flag: true while stopFlightAmbient's fadeout setTimeout is pending
  // This prevents startFlightAmbient from creating duplicate nodes during the grace period
  private isAmbientStopping = false;

  // Throttle for updateFlightIntensity — only apply Web Audio changes when
  // the multiplier moves by enough to matter (avoids 60fps Web Audio spam)
  private lastIntensityUpdateMultiplier = 0;

  // Custom external audio file integration (MP3 / WAV / OGG)
  private bgMusicAudio: HTMLAudioElement | null = null;
  private bgMusicUrl: string | null = null;
  private customSfxUrls: Record<string, string> = {};
  private customSfxElements: Record<string, HTMLAudioElement> = {};
  private audioEngineMode: 'hybrid' | 'procedural' | 'external_only' = 'hybrid';

  private config: SoundConfig = {
    masterVolume: 0.9,
    musicVolume: 0.75,
    sfxVolume: 0.95,
    muted: false
  };

  private lastFlapTime = 0;
  private lastMilestonePassed = 1;
  private isAudioUnlocked = false;

  constructor() {
    // Setup global gesture listener to instantly unlock and resume AudioContext on modern browsers
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.ensureContext();
        this.resume();
        if (this.ctx && this.ctx.state === 'running') {
          this.isAudioUnlocked = true;
          window.removeEventListener('click', unlock);
          window.removeEventListener('touchstart', unlock);
          window.removeEventListener('keydown', unlock);
          window.removeEventListener('pointerdown', unlock);
        }
      };

      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('pointerdown', unlock, { passive: true });
    }
  }

  /**
   * Set custom background music URL or file path (MP3, WAV, OGG)
   * Example: audioManager.setBackgroundMusicUrl('/audio/background_music.mp3')
   */
  public setBackgroundMusicUrl(url: string | null) {
    this.bgMusicUrl = url;
    if (typeof window === 'undefined') return;

    if (!url) {
      if (this.bgMusicAudio) {
        this.bgMusicAudio.pause();
        this.bgMusicAudio = null;
      }
      return;
    }

    if (!this.bgMusicAudio || this.bgMusicAudio.src !== url) {
      if (this.bgMusicAudio) this.bgMusicAudio.pause();
      this.bgMusicAudio = new Audio(url);
      this.bgMusicAudio.loop = true;
      this.updateVolumes();
    }
  }

  /**
   * Set custom external SFX audio file URL for specific game events
   * Supported keys: 'takeoff' | 'cashout' | 'crash' | 'bird_cry' | 'flap' | 'click' | 'countdown' | 'deposit' | 'withdrawal' | 'message'
   * Example: audioManager.setCustomSfxUrl('cashout', '/audio/cashout.mp3')
   */
  public setCustomSfxUrl(eventKey: string, url: string | null) {
    if (!url) {
      delete this.customSfxUrls[eventKey];
      delete this.customSfxElements[eventKey];
      return;
    }
    this.customSfxUrls[eventKey] = url;
    if (typeof window !== 'undefined') {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.customSfxElements[eventKey] = audio;
    }
  }

  /** Play custom external SFX if configured, returning true if handled */
  public playCustomSfx(eventKey: string): boolean {
    const customAudio = this.customSfxElements[eventKey];
    if (customAudio && !this.config.muted) {
      try {
        const clone = customAudio.cloneNode() as HTMLAudioElement;
        clone.volume = Math.max(0, Math.min(1, this.config.masterVolume * this.config.sfxVolume));
        clone.play().catch(() => {});
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Start playing background music track if configured */
  public startBackgroundMusic() {
    if (this.bgMusicAudio && !this.config.muted) {
      this.bgMusicAudio.currentTime = 0;
      this.bgMusicAudio.play().catch(() => {});
    }
  }

  /** Stop background music track */
  public stopBackgroundMusic() {
    if (this.bgMusicAudio) {
      this.bgMusicAudio.pause();
    }
  }

  /** Ensure AudioContext is initialized and routing graph is connected */
  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;

        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.updateVolumes();
      } catch (err) {
        console.warn('Web Audio API not supported or blocked:', err);
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.isAudioUnlocked = true;
      }).catch(() => {
        // Will unlock on next user gesture
      });
    }

    return this.ctx;
  }

  public init() {
    this.ensureContext();
  }

  public resume() {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.bgMusicAudio && !this.config.muted && this.bgMusicAudio.paused) {
      this.bgMusicAudio.play().catch(() => {});
    }
  }

  public isUnlocked(): boolean {
    return this.isAudioUnlocked || (this.ctx?.state === 'running');
  }

  public setConfig(newConfig: Partial<SoundConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.updateVolumes();
  }

  public setVolumes(newConfig: Partial<SoundConfig>) {
    this.setConfig(newConfig);
  }

  public getConfig(): SoundConfig {
    return { ...this.config };
  }

  public toggleMute(): boolean {
    this.config.muted = !this.config.muted;
    this.ensureContext();
    this.resume();
    this.updateVolumes();
    return this.config.muted;
  }

  private updateVolumes() {
    const masterVal = this.config.muted ? 0 : this.config.masterVolume;

    if (this.masterGain && this.musicGain && this.sfxGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setValueAtTime(masterVal, now);
      this.musicGain.gain.setValueAtTime(this.config.musicVolume, now);
      this.sfxGain.gain.setValueAtTime(this.config.sfxVolume, now);
    }

    if (this.bgMusicAudio) {
      this.bgMusicAudio.muted = this.config.muted;
      this.bgMusicAudio.volume = Math.max(0, Math.min(1, masterVal * this.config.musicVolume));
    }
  }

  // ==========================================
  // --- BIRD & FLIGHT PROCEDURAL SOUNDS ---
  // ==========================================

  /**
   * Futuristic Cyber Bird Cry (Grito / Pio Cibernético do Pássaro)
   * Plays a high-tech robotic falcon chirp during takeoff or milestone bursts with stereo panning
   */
  public playBirdCry(type: 'takeoff' | 'milestone' | 'high_altitude' = 'takeoff') {
    if (this.playCustomSfx('bird_cry')) return;
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    if (panner) {
      panner.pan.setValueAtTime((Math.random() - 0.5) * 0.6, now);
    }

    if (type === 'takeoff') {
      // Natural organic falcon / eagle takeoff chirp inspired by forest ambience
      // Dynamic multi-trill chirp with natural bird frequency modulation (2.2kHz - 4.8kHz)
      const trillOsc = ctx.createOscillator();
      const carrierOsc = ctx.createOscillator();
      const overtoneOsc = ctx.createOscillator();

      const trillGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      carrierOsc.type = 'sine';
      overtoneOsc.type = 'sine';
      trillOsc.type = 'sine';

      // Natural pitch contour: rapid upward flutter then soft glide
      carrierOsc.frequency.setValueAtTime(2400, now);
      carrierOsc.frequency.exponentialRampToValueAtTime(4500, now + 0.12);
      carrierOsc.frequency.exponentialRampToValueAtTime(3200, now + 0.25);
      carrierOsc.frequency.exponentialRampToValueAtTime(2100, now + 0.38);

      overtoneOsc.frequency.setValueAtTime(4800, now);
      overtoneOsc.frequency.exponentialRampToValueAtTime(9000, now + 0.12);
      overtoneOsc.frequency.exponentialRampToValueAtTime(6400, now + 0.25);

      // Acoustic bird flutter (18Hz vibrato)
      trillOsc.frequency.setValueAtTime(18, now);
      trillGain.gain.setValueAtTime(140, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3500, now);
      filter.Q.setValueAtTime(3.2, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35 * this.config.sfxVolume, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      trillOsc.connect(trillGain);
      trillGain.connect(carrierOsc.frequency);

      carrierOsc.connect(filter);
      overtoneOsc.connect(filter);
      filter.connect(gain);

      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain!);
      } else {
        gain.connect(this.sfxGain!);
      }

      trillOsc.start(now);
      carrierOsc.start(now);
      overtoneOsc.start(now);

      trillOsc.stop(now + 0.42);
      carrierOsc.stop(now + 0.42);
      overtoneOsc.stop(now + 0.42);
    } else {
      // Natural organic forest songbird double-chirp for milestones
      const chirp1 = ctx.createOscillator();
      const chirp2 = ctx.createOscillator();
      const gain = ctx.createGain();

      chirp1.type = 'sine';
      chirp2.type = 'sine';

      // First chirp burst (3.2kHz -> 4.6kHz)
      chirp1.frequency.setValueAtTime(3200, now);
      chirp1.frequency.exponentialRampToValueAtTime(4600, now + 0.07);
      chirp1.frequency.exponentialRampToValueAtTime(3800, now + 0.12);

      // Grace note second chirp burst (4.1kHz -> 5.4kHz)
      chirp2.frequency.setValueAtTime(4100, now + 0.14);
      chirp2.frequency.exponentialRampToValueAtTime(5400, now + 0.22);
      chirp2.frequency.exponentialRampToValueAtTime(4400, now + 0.28);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.3 * this.config.sfxVolume, now + 0.03);
      gain.gain.setValueAtTime(0.05, now + 0.13);
      gain.gain.linearRampToValueAtTime(0.28 * this.config.sfxVolume, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      chirp1.connect(gain);
      chirp2.connect(gain);

      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain!);
      } else {
        gain.connect(this.sfxGain!);
      }

      chirp1.start(now);
      chirp2.start(now + 0.14);
      chirp1.stop(now + 0.14);
      chirp2.stop(now + 0.32);
    }
  }

  /**
   * Cyber Bird Wing Flap / Swoosh
   * Aerodynamic wing beat synchronized with dynamic flight
   */
  public playBirdFlap(throttleMs = 280) {
    const nowMs = performance.now();
    if (nowMs - this.lastFlapTime < throttleMs) return;
    this.lastFlapTime = nowMs;

    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.16);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(380, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
    filter.Q.setValueAtTime(3.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22 * this.config.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    noise.start(now);
  }

  /**
   * Takeoff rocket ignition & cyber bird leap
   */
  public playTakeoff() {
    if (this.playCustomSfx('takeoff')) return;
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    this.playBirdCry('takeoff');

    // Powerful sub-thruster surge
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    subOsc.type = 'sine';

    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.7);

    subOsc.frequency.setValueAtTime(45, now);
    subOsc.frequency.exponentialRampToValueAtTime(160, now + 0.7);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.7);

    gain.gain.setValueAtTime(0.4 * this.config.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 0.8);
    subOsc.stop(now + 0.8);
  }

  // ==========================================
  // --- CONTINUOUS AMBIENT FLIGHT SYSTEM ---
  // ==========================================

  /** Continuous ambient flight wind & multiplier tension loop */
  public startFlightAmbient() {
    const ctx = this.ensureContext();
    // Guard: don't start if already running OR if a stop cleanup is still pending
    if (!ctx || this.windNode || this.isAmbientStopping) return;
    this.resume();
    this.lastIntensityUpdateMultiplier = 0;

    this.lastMilestonePassed = 1;
    const now = ctx.currentTime;

    // 1. Wind & Atmospheric Friction Noise (Pink noise buffer)
    const bufferSize = Math.floor(ctx.sampleRate * 2.5);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    this.windNode = ctx.createBufferSource();
    this.windNode.buffer = buffer;
    this.windNode.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.setValueAtTime(360, now);

    this.windGain = ctx.createGain();
    this.windGain.gain.setValueAtTime(0.24 * this.config.sfxVolume, now);

    this.windNode.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.sfxGain!);

    this.windNode.start();

    // 2. Continuous Synth Tension Drone (Clean Harmonic Oscillators)
    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc3 = ctx.createOscillator();
    this.droneFilter = ctx.createBiquadFilter();
    this.droneGain = ctx.createGain();

    this.droneOsc1.type = 'triangle';
    this.droneOsc2.type = 'sine';
    this.droneOsc3.type = 'sine';

    this.droneOsc1.frequency.setValueAtTime(65.41, now); // C2
    this.droneOsc2.frequency.setValueAtTime(130.81, now); // C3
    this.droneOsc3.frequency.setValueAtTime(196.00, now); // G3

    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(320, now);

    this.droneGain.gain.setValueAtTime(0.08 * this.config.musicVolume, now);

    this.droneOsc1.connect(this.droneFilter);
    this.droneOsc2.connect(this.droneFilter);
    this.droneOsc3.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.musicGain!);

    this.droneOsc1.start();
    this.droneOsc2.start();
    this.droneOsc3.start();
  }

  /** Update aerodynamic speed & pitch based on live multiplier */
  public updateFlightIntensity(multiplier: number, altitudeStage: string) {
    const ctx = this.ensureContext();
    if (!ctx || !this.windFilter || !this.windGain || !this.droneOsc1) return;

    // Throttle: only update Web Audio params when multiplier changes by ≥0.05
    // This prevents 60fps RAF spam from flooding the Web Audio scheduling queue.
    const delta = Math.abs(multiplier - this.lastIntensityUpdateMultiplier);
    const isMilestone = [2.0, 5.0, 10.0, 25.0, 50.0, 100.0].some(
      m => multiplier >= m && this.lastIntensityUpdateMultiplier < m
    );
    if (delta < 0.05 && !isMilestone) return;
    this.lastIntensityUpdateMultiplier = multiplier;

    const now = ctx.currentTime;

    // Check for milestone chirps
    const milestoneSteps = [2.0, 5.0, 10.0, 25.0, 50.0, 100.0];
    for (const m of milestoneSteps) {
      if (multiplier >= m && this.lastMilestonePassed < m) {
        this.lastMilestonePassed = m;
        this.playBirdCry('milestone');
        break;
      }
    }

    // Scale wind filter cutoff and volume
    const normalizedMult = Math.min(50, multiplier);
    const targetFreq = Math.min(7500, 360 + Math.pow(normalizedMult, 1.28) * 90);
    this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.12);

    const targetWindGain = Math.min(0.6, 0.2 + (normalizedMult / 50) * 0.38) * this.config.sfxVolume;
    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.12);

    // Scale tension harmonic drone frequencies
    const baseFreq = 65.41 * Math.pow(1.085, Math.min(26, Math.log2(Math.max(1, multiplier)) * 4.2));
    this.droneOsc1.frequency.setTargetAtTime(baseFreq, now, 0.12);

    if (this.droneOsc2) {
      this.droneOsc2.frequency.setTargetAtTime(baseFreq * 2, now, 0.12);
    }
    if (this.droneOsc3) {
      this.droneOsc3.frequency.setTargetAtTime(baseFreq * 3, now, 0.12);
    }

    if (this.droneFilter) {
      const droneCutoff = Math.min(2800, 420 + normalizedMult * 50);
      this.droneFilter.frequency.setTargetAtTime(droneCutoff, now, 0.12);
    }
  }

  /** Stop continuous flight ambient (with fade-out) */
  public stopFlightAmbient() {
    const ctx = this.ctx;
    if (!ctx) return;

    // If already stopping, skip duplicate calls
    if (this.isAmbientStopping) return;
    this.isAmbientStopping = true;

    const now = ctx.currentTime;

    // Capture references synchronously BEFORE setTimeout
    // so they cannot be overwritten by a concurrent startFlightAmbient call
    const windNodeToStop = this.windNode;
    const windGainToFade = this.windGain;
    const droneGainToFade = this.droneGain;
    const osc1ToStop = this.droneOsc1;
    const osc2ToStop = this.droneOsc2;
    const osc3ToStop = this.droneOsc3;

    // Null instance refs immediately so startFlightAmbient can create new nodes
    // after the isAmbientStopping flag is cleared (after 300ms)
    this.windNode = null;
    this.windFilter = null;
    this.windGain = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneOsc3 = null;
    this.droneFilter = null;
    this.droneGain = null;

    // Fade out captured nodes
    if (windGainToFade) {
      try { windGainToFade.gain.linearRampToValueAtTime(0.001, now + 0.25); } catch {}
    }
    if (droneGainToFade) {
      try { droneGainToFade.gain.linearRampToValueAtTime(0.001, now + 0.25); } catch {}
    }

    // Stop and disconnect after fade completes
    setTimeout(() => {
      try { windNodeToStop?.stop(); windNodeToStop?.disconnect(); } catch {}
      try { osc1ToStop?.stop(); osc1ToStop?.disconnect(); } catch {}
      try { osc2ToStop?.stop(); osc2ToStop?.disconnect(); } catch {}
      try { osc3ToStop?.stop(); osc3ToStop?.disconnect(); } catch {}
      this.isAmbientStopping = false;
    }, 300);
  }

  /** Immediately stop all ambient audio without fade (use on component unmount) */
  public forceStopFlightAmbient() {
    this.isAmbientStopping = false; // clear flag so next start is not blocked
    const nodesToStop: (AudioNode | null)[] = [
      this.windNode, this.droneOsc1, this.droneOsc2, this.droneOsc3
    ];
    for (const node of nodesToStop) {
      try { (node as AudioBufferSourceNode | OscillatorNode)?.stop(); } catch {}
      try { node?.disconnect(); } catch {}
    }
    this.windNode = null;
    this.windFilter = null;
    this.windGain = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneOsc3 = null;
    this.droneFilter = null;
    this.droneGain = null;
    this.lastIntensityUpdateMultiplier = 0;
  }

  // ==========================================
  // --- ENVIRONMENTAL & GAME EVENT SOUNDS ---
  // ==========================================

  /** Thunder & Lightning crackle with deep sub reverberation */
  public playThunder() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 1.1);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.32));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + 0.95);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6 * this.config.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 1.0);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    noise.start(now);
  }

  /** Jet flyby and mid-air explosion */
  public playAircraftExplosion() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;

    // Jet whoosh
    const jetOsc = ctx.createOscillator();
    jetOsc.type = 'sawtooth';
    jetOsc.frequency.setValueAtTime(480, now);
    jetOsc.frequency.exponentialRampToValueAtTime(120, now + 0.4);

    const jetGain = ctx.createGain();
    jetGain.gain.setValueAtTime(0.28 * this.config.sfxVolume, now);
    jetGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    jetOsc.connect(jetGain);
    jetGain.connect(this.sfxGain!);
    jetOsc.start(now);
    jetOsc.stop(now + 0.4);

    // Metallic explosion impact
    const bufferSize = Math.floor(ctx.sampleRate * 0.75);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.22));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(750, now + 0.06);
    filter.Q.setValueAtTime(2.4, now + 0.06);

    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.6 * this.config.sfxVolume, now + 0.06);
    boomGain.gain.exponentialRampToValueAtTime(0.005, now + 0.7);

    noise.connect(filter);
    filter.connect(boomGain);
    boomGain.connect(this.sfxGain!);

    noise.start(now + 0.06);
  }

  /**
   * Cash Out Triumph Chime & Arpeggio
   * High-tech futuristic crystal fanfare with metallic shimmer and bass drop
   */
  public playCashOut() {
    if (this.playCustomSfx('cashout')) return;
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;

    // 1. Sub-bass gratification impact
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + 0.35);

    subGain.gain.setValueAtTime(0.45 * this.config.sfxVolume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain!);
    subOsc.start(now);
    subOsc.stop(now + 0.4);

    // 2. Crystal chord progression (Major 9th futuristic arpeggio)
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51, 1567.98, 2093.00]; // C5, E5, G5, B5, C6, E6, G6, C7

    notes.forEach((freq, index) => {
      const startTime = now + index * 0.05;
      const osc = ctx.createOscillator();
      const shimmerOsc = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

      osc.type = 'triangle';
      shimmerOsc.type = 'sine';

      osc.frequency.setValueAtTime(freq, startTime);
      shimmerOsc.frequency.setValueAtTime(freq * 2, startTime);

      if (panner) {
        const panVal = (index / (notes.length - 1)) * 1.6 - 0.8;
        panner.pan.setValueAtTime(panVal, startTime);
      }

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.35 * this.config.sfxVolume, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);

      osc.connect(gain);
      shimmerOsc.connect(gain);

      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain!);
      } else {
        gain.connect(this.sfxGain!);
      }

      osc.start(startTime);
      shimmerOsc.start(startTime);
      osc.stop(startTime + 0.6);
      shimmerOsc.stop(startTime + 0.6);
    });
  }

  /** Crash impact with heavy bass wallop and high-frequency shattering energy */
  public playCrash() {
    if (this.playCustomSfx('crash')) return;
    this.stopFlightAmbient();
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;

    // Sub-bass heavy thump
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.65);

    oscGain.gain.setValueAtTime(0.85 * this.config.sfxVolume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain!);

    osc.start(now);
    osc.stop(now + 0.7);

    // Harsh noise shatter
    const bufferSize = Math.floor(ctx.sampleRate * 0.65);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.16));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.55);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75 * this.config.sfxVolume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 0.65);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain!);

    noise.start(now);
  }

  /** Modern digital glass countdown tick - Professional Acoustic Chime */
  public playCountdown(isFinal = false) {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;

    if (isFinal) {
      // Professional launch countdown chime (C6 -> G6 dual chord burst)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(1046.50, now); // C6
      osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08); // E6

      osc2.frequency.setValueAtTime(1567.98, now); // G6

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.28 * this.config.sfxVolume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.sfxGain!);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.36);
      osc2.stop(now + 0.36);
    } else {
      // Soft high-end studio digital tick (clean 880Hz A5 sine pulse)
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.02);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18 * this.config.sfxVolume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(now);
      osc.stop(now + 0.09);
    }
  }

  /** Slick haptic UI click button sound */
  public playButtonClick() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.035);

    gain.gain.setValueAtTime(0.22 * this.config.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** Premium glass notification chime */
  public playNotification() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc1.frequency.setValueAtTime(987.77, now + 0.08); // B5

    osc2.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    gain.gain.setValueAtTime(0.28 * this.config.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain!);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.34);
    osc2.stop(now + 0.34);
  }

  /** Deposit Alert: High-tech ascending dual-tone futuristic chime */
  public playDepositAlert() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.32 * this.config.sfxVolume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.42);
    });
  }

  /** Withdrawal Alert: Clear warning & processing alert chime */
  public playWithdrawalAlert() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const notes = [440.00, 554.37, 659.25, 880.00]; // A4, C#5, E5, A5

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.26 * this.config.sfxVolume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.38);
    });
  }

  /** Support Message Alert: Soft conversational electronic ping */
  public playMessageAlert() {
    const ctx = this.ensureContext();
    if (!ctx || this.config.muted) return;
    this.resume();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(783.99, now); // G5
    osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.1); // D6

    osc2.frequency.setValueAtTime(1567.98, now + 0.1); // G6

    gain.gain.setValueAtTime(0.28 * this.config.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain!);

    osc1.start(now);
    osc2.start(now + 0.1);
    osc1.stop(now + 0.34);
    osc2.stop(now + 0.34);
  }

  public getBackgroundMusicUrl(): string | null {
    return this.bgMusicUrl;
  }

  public getCustomSfxUrls(): Record<string, string> {
    return { ...this.customSfxUrls };
  }

  public getAudioEngineMode(): 'hybrid' | 'procedural' | 'external_only' {
    return this.audioEngineMode;
  }

  public setAudioEngineMode(mode: 'hybrid' | 'procedural' | 'external_only') {
    this.audioEngineMode = mode;
  }

  public saveAudioSettings(
    bgMusicUrl: string | null,
    customSfxUrls: Record<string, string>,
    mode: 'hybrid' | 'procedural' | 'external_only',
    config?: Partial<SoundConfig>
  ) {
    this.setBackgroundMusicUrl(bgMusicUrl);
    this.audioEngineMode = mode;
    if (config) {
      this.setVolumes(config);
    }

    // Clear and set new custom SFX URLs
    this.customSfxUrls = {};
    this.customSfxElements = {};
    Object.entries(customSfxUrls).forEach(([eventKey, url]) => {
      if (url && url.trim() !== '') {
        this.setCustomSfxUrl(eventKey, url.trim());
      }
    });

    if (typeof localStorage !== 'undefined') {
      const payload = {
        bgMusicUrl: this.bgMusicUrl,
        customSfxUrls: this.customSfxUrls,
        audioEngineMode: this.audioEngineMode,
        config: this.config
      };
      localStorage.setItem('skybird_audio_settings', JSON.stringify(payload));
    }
  }

  public loadAudioSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem('skybird_audio_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.bgMusicUrl !== undefined) {
          this.setBackgroundMusicUrl(parsed.bgMusicUrl);
        }
        if (parsed.audioEngineMode) {
          this.audioEngineMode = parsed.audioEngineMode;
        }
        if (parsed.config) {
          this.setVolumes(parsed.config);
        }
        if (parsed.customSfxUrls && typeof parsed.customSfxUrls === 'object') {
          Object.entries(parsed.customSfxUrls).forEach(([eventKey, url]) => {
            if (typeof url === 'string' && url.trim()) {
              this.setCustomSfxUrl(eventKey, url);
            }
          });
        }
      }
    } catch (e) {
      console.warn('[AudioManager] Failed to load audio settings:', e);
    }
  }
}

export const audioManager = new AudioManager();
audioManager.loadAudioSettings();
