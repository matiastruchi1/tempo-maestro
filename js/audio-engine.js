const SOUND_PROFILES = Object.freeze({
  wood: {
    accent: { frequency: 1380, endFrequency: 760, duration: 0.038, type: "triangle", level: 0.46 },
    normal: { frequency: 920, endFrequency: 520, duration: 0.032, type: "triangle", level: 0.34 },
    subdivision: { frequency: 610, endFrequency: 420, duration: 0.022, type: "sine", level: 0.2 },
  },
  classic: {
    accent: { frequency: 1960, endFrequency: 1550, duration: 0.035, type: "sine", level: 0.38 },
    normal: { frequency: 1320, endFrequency: 1120, duration: 0.03, type: "sine", level: 0.31 },
    subdivision: { frequency: 880, endFrequency: 760, duration: 0.02, type: "sine", level: 0.18 },
  },
  digital: {
    accent: { frequency: 1700, endFrequency: 1500, duration: 0.019, type: "square", level: 0.26 },
    normal: { frequency: 1080, endFrequency: 980, duration: 0.016, type: "square", level: 0.21 },
    subdivision: { frequency: 690, endFrequency: 620, duration: 0.012, type: "square", level: 0.13 },
  },
});

export class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.volume = 0.68;
    this.activeSources = new Set();
  }

  async ensureReady() {
    if (!this.context) {
      try {
        if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = "playback";
      } catch {
        // Safari versions without a writable AudioSession keep their default behavior.
      }
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API no está disponible en este navegador.");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.#volumeCurve(this.volume);
      this.masterGain.connect(this.context.destination);
      this.#primeIOSAudio();
    }

    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  get currentTime() {
    return this.context?.currentTime ?? 0;
  }

  get state() {
    return this.context?.state ?? "closed";
  }

  async resume() {
    if (!this.context) return this.ensureReady();
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value)));
    if (!this.masterGain || !this.context) return;
    this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
    this.masterGain.gain.setTargetAtTime(this.#volumeCurve(this.volume), this.context.currentTime, 0.012);
  }

  scheduleClick(time, clickType = "normal", sound = "wood") {
    if (!this.context || !this.masterGain) return;
    const profile = SOUND_PROFILES[sound] ?? SOUND_PROFILES.wood;
    const tone = profile[clickType] ?? profile.normal;
    const start = Math.max(time, this.context.currentTime + 0.001);
    const end = start + tone.duration;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, tone.endFrequency), end);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(tone.level, start + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(this.masterGain);
    oscillator.start(start);
    oscillator.stop(end + 0.004);
    this.activeSources.add(oscillator);
    oscillator.onended = () => {
      this.activeSources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  stopAll() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // It may already have finished between iteration and stop().
      }
    }
    this.activeSources.clear();
  }

  #primeIOSAudio() {
    const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start(0);
  }

  #volumeCurve(value) {
    return Math.pow(value, 1.7);
  }
}
