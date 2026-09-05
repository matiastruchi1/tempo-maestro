import { BPM_MAX, BPM_MIN, clampBpm } from "./rhythm.js";

const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

export class TapTempo {
  constructor({ resetAfterMs = 2500, maxIntervals = 8, minimumIntervals = 3 } = {}) {
    this.resetAfterMs = resetAfterMs;
    this.maxIntervals = maxIntervals;
    this.minimumIntervals = minimumIntervals;
    this.reset();
  }

  reset() {
    this.lastTapMs = null;
    this.intervals = [];
    this.tapCount = 0;
  }

  tap(timestampMs = performance.now()) {
    if (this.lastTapMs === null || timestampMs - this.lastTapMs > this.resetAfterMs) {
      this.reset();
      this.lastTapMs = timestampMs;
      this.tapCount = 1;
      return { ready: false, tapCount: 1, needed: this.minimumIntervals + 1 };
    }

    const interval = timestampMs - this.lastTapMs;
    const minimumMs = 60000 / BPM_MAX;
    const maximumMs = 60000 / BPM_MIN;

    if (interval < minimumMs) {
      return { ready: false, tapCount: this.tapCount, needed: this.minimumIntervals + 1, ignored: true };
    }

    if (interval > maximumMs) {
      this.reset();
      this.lastTapMs = timestampMs;
      this.tapCount = 1;
      return { ready: false, tapCount: 1, needed: this.minimumIntervals + 1, restarted: true };
    }

    this.lastTapMs = timestampMs;
    this.tapCount += 1;
    this.intervals.push(interval);
    if (this.intervals.length > this.maxIntervals) this.intervals.shift();

    if (this.intervals.length < this.minimumIntervals) {
      return { ready: false, tapCount: this.tapCount, needed: this.minimumIntervals + 1 };
    }

    const center = median(this.intervals);
    const tolerance = Math.max(55, center * 0.24);
    const filtered = this.intervals.filter((value) => Math.abs(value - center) <= tolerance);
    const usable = filtered.length >= 2 ? filtered : this.intervals;
    const average = usable.reduce((sum, value) => sum + value, 0) / usable.length;
    const bpm = clampBpm(60000 / average);

    return { ready: true, bpm, tapCount: this.tapCount, sampleCount: usable.length };
  }
}
