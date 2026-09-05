import { METERS, SUBDIVISIONS, clampBpm, clampInteger, normalizeAccentBeats } from "./rhythm.js";

export const STORAGE_KEY = "tempo-maestro:v1";

const examplePreset = {
  id: "mozart-k488-i",
  composer: "Mozart",
  work: "Concierto para piano n.º 23 K.488",
  movement: "I. Allegro",
  favorite: true,
  createdAt: "2026-09-05T00:00:00.000Z",
  config: {
    bpm: 120,
    meter: "4/4",
    subdivision: "main",
    accentEnabled: true,
    accentBeats: [1],
    countIn: 1,
    sound: "wood",
    progressive: { enabled: false, start: 80, target: 120, step: 4, everyBars: 4 },
    silent: { enabled: false, soundBars: 4, silentBars: 2 },
  },
};

export function createDefaultState() {
  return {
    bpm: 120,
    volume: 0.68,
    meter: "4/4",
    subdivision: "main",
    accentEnabled: true,
    accentBeats: [1],
    countIn: 0,
    sound: "wood",
    history: [120],
    presets: [structuredCloneSafe(examplePreset)],
    progressive: { enabled: false, start: 80, target: 120, step: 4, everyBars: 4 },
    silent: { enabled: false, soundBars: 4, silentBars: 2 },
    preferences: { installHelpSeen: false },
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizePractice(raw = {}) {
  return {
    progressive: {
      enabled: Boolean(raw.progressive?.enabled),
      start: clampBpm(raw.progressive?.start ?? 80),
      target: clampBpm(raw.progressive?.target ?? 120),
      step: clampInteger(raw.progressive?.step, 1, 40, 4),
      everyBars: clampInteger(raw.progressive?.everyBars, 1, 64, 4),
    },
    silent: {
      enabled: Boolean(raw.silent?.enabled),
      soundBars: clampInteger(raw.silent?.soundBars, 1, 32, 4),
      silentBars: clampInteger(raw.silent?.silentBars, 1, 32, 2),
    },
  };
}

function sanitizePreset(preset, index) {
  const meter = METERS[preset?.config?.meter] ? preset.config.meter : "4/4";
  const practice = sanitizePractice(preset?.config);
  return {
    id: String(preset?.id || `preset-${Date.now()}-${index}`),
    composer: String(preset?.composer || "Sin compositor").slice(0, 80),
    work: String(preset?.work || "Obra sin título").slice(0, 140),
    movement: String(preset?.movement || "").slice(0, 100),
    favorite: Boolean(preset?.favorite),
    createdAt: String(preset?.createdAt || new Date().toISOString()),
    config: {
      bpm: clampBpm(preset?.config?.bpm),
      meter,
      subdivision: SUBDIVISIONS[preset?.config?.subdivision] ? preset.config.subdivision : "main",
      accentEnabled: preset?.config?.accentEnabled !== false,
      accentBeats: normalizeAccentBeats(preset?.config?.accentBeats, meter),
      countIn: [0, 1, 2].includes(Number(preset?.config?.countIn)) ? Number(preset.config.countIn) : 0,
      sound: ["wood", "classic", "digital"].includes(preset?.config?.sound) ? preset.config.sound : "wood",
      ...practice,
    },
  };
}

export function sanitizeState(raw = {}) {
  const defaults = createDefaultState();
  const meter = METERS[raw.meter] ? raw.meter : defaults.meter;
  const practice = sanitizePractice(raw);
  const history = Array.isArray(raw.history)
    ? [...new Set(raw.history.map(clampBpm))].slice(0, 8)
    : defaults.history;
  const presets = Array.isArray(raw.presets)
    ? raw.presets.slice(0, 100).map(sanitizePreset)
    : defaults.presets;

  const rawVolume = Number(raw.volume ?? defaults.volume);
  const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : defaults.volume;

  return {
    bpm: clampBpm(raw.bpm ?? defaults.bpm),
    volume,
    meter,
    subdivision: SUBDIVISIONS[raw.subdivision] ? raw.subdivision : defaults.subdivision,
    accentEnabled: raw.accentEnabled !== false,
    accentBeats: normalizeAccentBeats(raw.accentBeats, meter),
    countIn: [0, 1, 2].includes(Number(raw.countIn)) ? Number(raw.countIn) : defaults.countIn,
    sound: ["wood", "classic", "digital"].includes(raw.sound) ? raw.sound : defaults.sound,
    history: history.length ? history : defaults.history,
    presets,
    ...practice,
    preferences: {
      installHelpSeen: Boolean(raw.preferences?.installHelpSeen),
    },
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    return saved ? sanitizeState(JSON.parse(saved)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state)));
    return true;
  } catch {
    return false;
  }
}

export function addToHistory(history, bpm) {
  const value = clampBpm(bpm);
  return [value, ...(history || []).filter((item) => item !== value)].slice(0, 6);
}
