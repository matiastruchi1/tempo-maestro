import { clampBpm, clampInteger, getMeter, getSubdivision, normalizeAccentBeats } from "./rhythm.js";

export class Sequencer {
  constructor(config) {
    this.reset(config);
  }

  reset(config) {
    this.meterName = config.meter;
    this.beatsPerBar = getMeter(config.meter).beats;
    this.subdivisionName = config.subdivision;
    this.subdivisionsPerBeat = getSubdivision(config.subdivision, config.meter).count;
    this.accentEnabled = config.accentEnabled !== false;
    this.accentBeats = normalizeAccentBeats(config.accentBeats, config.meter);
    this.sound = config.sound || "wood";
    this.countInBarsTotal = clampInteger(config.countIn, 0, 2, 0);
    this.countInBarsRemaining = this.countInBarsTotal;
    this.countInBeat = 0;
    this.measureIndex = 0;
    this.beatIndex = 0;
    this.subdivisionIndex = 0;
    this.stageBarsCompleted = 0;

    this.progressive = {
      enabled: Boolean(config.progressive?.enabled),
      start: clampBpm(config.progressive?.start ?? config.bpm),
      target: clampBpm(config.progressive?.target ?? config.bpm),
      step: clampInteger(config.progressive?.step, 1, 40, 4),
      everyBars: clampInteger(config.progressive?.everyBars, 1, 64, 4),
    };
    this.silent = {
      enabled: Boolean(config.silent?.enabled),
      soundBars: clampInteger(config.silent?.soundBars, 1, 32, 4),
      silentBars: clampInteger(config.silent?.silentBars, 1, 32, 2),
    };

    this.runtimeBpm = this.progressive.enabled ? this.progressive.start : clampBpm(config.bpm);
  }

  setTempo(bpm) {
    this.runtimeBpm = clampBpm(bpm);
    return this.runtimeBpm;
  }

  getTempo() {
    return this.runtimeBpm;
  }

  next() {
    if (this.countInBarsRemaining > 0) return this.#nextCountInEvent();
    return this.#nextPlayingEvent();
  }

  #nextCountInEvent() {
    const bpm = this.runtimeBpm;
    const barNumber = this.countInBarsTotal - this.countInBarsRemaining + 1;
    const beatIndex = this.countInBeat;
    const event = {
      phase: "count-in",
      bpm,
      beatIndex,
      subdivisionIndex: 0,
      measureIndex: -this.countInBarsRemaining,
      countInBar: barNumber,
      countInBarsTotal: this.countInBarsTotal,
      accent: beatIndex === 0,
      clickType: beatIndex === 0 ? "accent" : "normal",
      audible: true,
      silent: false,
      sound: this.sound,
    };

    this.countInBeat += 1;
    if (this.countInBeat >= this.beatsPerBar) {
      this.countInBeat = 0;
      this.countInBarsRemaining -= 1;
    }

    return { event, durationSeconds: 60 / bpm, tempoChangedTo: null };
  }

  #nextPlayingEvent() {
    const bpm = this.runtimeBpm;
    const beatIndex = this.beatIndex;
    const subdivisionIndex = this.subdivisionIndex;
    const isMainPulse = subdivisionIndex === 0;
    const isAccent = isMainPulse && this.accentEnabled && this.accentBeats.includes(beatIndex + 1);
    const cycleLength = this.silent.soundBars + this.silent.silentBars;
    const cycleMeasure = this.measureIndex % cycleLength;
    const silent = this.silent.enabled && cycleMeasure >= this.silent.soundBars;
    const clickType = isAccent ? "accent" : isMainPulse ? "normal" : "subdivision";

    const event = {
      phase: "playing",
      bpm,
      beatIndex,
      subdivisionIndex,
      measureIndex: this.measureIndex,
      accent: isAccent,
      clickType,
      audible: !silent,
      silent,
      sound: this.sound,
      stageBarsCompleted: this.stageBarsCompleted,
      progressive: { ...this.progressive },
      silentPattern: { ...this.silent, cycleMeasure },
    };

    const durationSeconds = 60 / bpm / this.subdivisionsPerBeat;
    let tempoChangedTo = null;

    this.subdivisionIndex += 1;
    if (this.subdivisionIndex >= this.subdivisionsPerBeat) {
      this.subdivisionIndex = 0;
      this.beatIndex += 1;
    }

    if (this.beatIndex >= this.beatsPerBar) {
      this.beatIndex = 0;
      this.measureIndex += 1;
      this.stageBarsCompleted += 1;

      if (
        this.progressive.enabled &&
        this.stageBarsCompleted >= this.progressive.everyBars &&
        this.runtimeBpm !== this.progressive.target
      ) {
        const direction = Math.sign(this.progressive.target - this.runtimeBpm);
        const candidate = this.runtimeBpm + direction * this.progressive.step;
        this.runtimeBpm = direction > 0
          ? Math.min(candidate, this.progressive.target)
          : Math.max(candidate, this.progressive.target);
        this.runtimeBpm = clampBpm(this.runtimeBpm);
        this.stageBarsCompleted = 0;
        tempoChangedTo = this.runtimeBpm;
      }
    }

    return { event, durationSeconds, tempoChangedTo };
  }
}
