import { Sequencer } from "./sequencer.js";

export class LookaheadScheduler {
  constructor(audioEngine, callbacks = {}) {
    this.audio = audioEngine;
    this.onPulse = callbacks.onPulse || (() => {});
    this.onTempoChange = callbacks.onTempoChange || (() => {});
    this.onTimingInterruption = callbacks.onTimingInterruption || (() => {});
    this.onError = callbacks.onError || (() => {});
    this.lookaheadMs = 25;
    this.scheduleAheadSeconds = 0.12;
    this.startLeadSeconds = 0.075;
    this.running = false;
    this.timerId = null;
    this.visualTimers = new Set();
  }

  start(config) {
    if (!this.audio.context) throw new Error("El motor de audio todavía no está listo.");
    this.stop();
    this.sequencer = new Sequencer(config);
    this.nextEventTime = this.audio.currentTime + this.startLeadSeconds;
    this.running = true;
    this.#tick();
    this.timerId = globalThis.setInterval(() => this.#tick(), this.lookaheadMs);
    return this.sequencer.getTempo();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) globalThis.clearInterval(this.timerId);
    this.timerId = null;
    for (const timer of this.visualTimers) globalThis.clearTimeout(timer);
    this.visualTimers.clear();
    this.audio.stopAll();
  }

  setTempo(bpm) {
    return this.sequencer?.setTempo(bpm) ?? bpm;
  }

  #tick() {
    if (!this.running) return;
    try {
      const now = this.audio.currentTime;
      if (this.nextEventTime < now - 0.1) {
        this.nextEventTime = now + 0.05;
        this.onTimingInterruption();
      }

      let guard = 0;
      while (this.nextEventTime < now + this.scheduleAheadSeconds && guard < 128) {
        const { event, durationSeconds, tempoChangedTo } = this.sequencer.next();
        const scheduledTime = this.nextEventTime;
        if (event.audible) this.audio.scheduleClick(scheduledTime, event.clickType, event.sound);
        this.#scheduleVisual({ ...event, scheduledTime });
        this.nextEventTime += durationSeconds;

        if (tempoChangedTo !== null) {
          this.#scheduleCallback(this.nextEventTime, () => this.onTempoChange(tempoChangedTo));
        }
        guard += 1;
      }
    } catch (error) {
      this.stop();
      this.onError(error);
    }
  }

  #scheduleVisual(event) {
    this.#scheduleCallback(event.scheduledTime, () => this.onPulse(event));
  }

  #scheduleCallback(audioTime, callback) {
    const delay = Math.max(0, (audioTime - this.audio.currentTime) * 1000);
    const timer = globalThis.setTimeout(() => {
      this.visualTimers.delete(timer);
      if (this.running) callback();
    }, delay);
    this.visualTimers.add(timer);
  }
}
