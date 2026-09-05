export const BPM_MIN = 30;
export const BPM_MAX = 300;

export const METERS = Object.freeze({
  "2/4": { numerator: 2, denominator: 4, beats: 2, beatUnit: "♩", compound: false },
  "3/4": { numerator: 3, denominator: 4, beats: 3, beatUnit: "♩", compound: false },
  "4/4": { numerator: 4, denominator: 4, beats: 4, beatUnit: "♩", compound: false },
  "6/8": { numerator: 6, denominator: 8, beats: 2, beatUnit: "♩.", compound: true },
  "9/8": { numerator: 9, denominator: 8, beats: 3, beatUnit: "♩.", compound: true },
  "12/8": { numerator: 12, denominator: 8, beats: 4, beatUnit: "♩.", compound: true },
});

export const SUBDIVISIONS = Object.freeze({
  main: { count: 1, label: "Pulso principal", shortLabel: "Principal" },
  eighths: { count: 2, label: "Corcheas", shortLabel: "Corcheas" },
  triplets: { count: 3, label: "Tresillos", shortLabel: "Tresillos" },
  sixteenths: { count: 4, label: "Semicorcheas", shortLabel: "Semicorcheas" },
});

export function clampBpm(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 120;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(number)));
}

export function clampInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function getMeter(meter) {
  return METERS[meter] ?? METERS["4/4"];
}

export function getSubdivision(subdivision, meter = "4/4") {
  const base = SUBDIVISIONS[subdivision] ?? SUBDIVISIONS.main;
  const meterDefinition = getMeter(meter);
  if (!meterDefinition.compound) return base;
  const compoundCounts = { main: 1, eighths: 3, triplets: 3, sixteenths: 6 };
  return { ...base, count: compoundCounts[subdivision] ?? 1 };
}

export function secondsPerEvent(bpm, subdivision = "main", meter = "4/4") {
  return 60 / clampBpm(bpm) / getSubdivision(subdivision, meter).count;
}

export function normalizeAccentBeats(beats, meter) {
  const max = getMeter(meter).beats;
  const values = Array.isArray(beats) ? beats : [1];
  const normalized = [...new Set(values.map(Number).filter((beat) => Number.isInteger(beat) && beat >= 1 && beat <= max))];
  return normalized.length ? normalized.sort((a, b) => a - b) : [1];
}

export function theoreticalEventTimes({ bpm, subdivision = "main", meter = "4/4", eventCount, startTime = 0 }) {
  const interval = secondsPerEvent(bpm, subdivision, meter);
  return Array.from({ length: eventCount }, (_, index) => startTime + index * interval);
}
