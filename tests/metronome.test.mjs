import test from "node:test";
import assert from "node:assert/strict";

import { BPM_MAX, BPM_MIN, METERS, clampBpm, secondsPerEvent } from "../dist/js/rhythm.js";
import { Sequencer } from "../dist/js/sequencer.js";
import { LookaheadScheduler } from "../dist/js/scheduler.js";
import { addToHistory, createDefaultState, loadState, saveState, sanitizeState } from "../dist/js/storage.js";
import { TapTempo } from "../dist/js/tap-tempo.js";

const baseConfig = (overrides = {}) => ({
  bpm: 120,
  meter: "4/4",
  subdivision: "main",
  accentEnabled: true,
  accentBeats: [1],
  countIn: 0,
  sound: "wood",
  progressive: { enabled: false, start: 80, target: 120, step: 4, everyBars: 4 },
  silent: { enabled: false, soundBars: 4, silentBars: 2 },
  ...overrides,
});

test("el BPM queda limitado al rango 30–300", () => {
  assert.equal(clampBpm(12), BPM_MIN);
  assert.equal(clampBpm(301), BPM_MAX);
  assert.equal(clampBpm(119.6), 120);
});

test("el scheduler inicia, agenda sobre el reloj de audio y se detiene", () => {
  const fakeAudio = {
    context: { currentTime: 10 },
    clicks: [],
    stopCount: 0,
    get currentTime() { return this.context.currentTime; },
    scheduleClick(time, clickType, sound) { this.clicks.push({ time, clickType, sound }); },
    stopAll() { this.stopCount += 1; },
  };
  const scheduler = new LookaheadScheduler(fakeAudio);
  scheduler.start(baseConfig());
  assert.equal(scheduler.running, true);
  assert.equal(fakeAudio.clicks.length, 1);
  assert.ok(fakeAudio.clicks[0].time > fakeAudio.currentTime);
  assert.ok(fakeAudio.clicks[0].time <= fakeAudio.currentTime + 0.12);
  scheduler.stop();
  assert.equal(scheduler.running, false);
  assert.ok(fakeAudio.stopCount >= 1);
});

for (const bpm of [60, 80, 100, 120, 160, 200]) {
  test(`el reloj acumulado no deriva a ${bpm} BPM durante 30 minutos`, () => {
    const sequencer = new Sequencer(baseConfig({ bpm }));
    const eventCount = bpm * 30;
    let scheduledTime = 0;
    let lastTime = 0;
    for (let index = 0; index < eventCount; index += 1) {
      lastTime = scheduledTime;
      const { durationSeconds } = sequencer.next();
      scheduledTime += durationSeconds;
    }
    const expectedEnd = eventCount * (60 / bpm);
    const expectedLast = (eventCount - 1) * (60 / bpm);
    assert.ok(Math.abs(scheduledTime - expectedEnd) < 1e-8, `error final: ${scheduledTime - expectedEnd}`);
    assert.ok(Math.abs(lastTime - expectedLast) < 1e-8, `error último pulso: ${lastTime - expectedLast}`);
  });
}

test("las subdivisiones mantienen intervalos exactos", () => {
  assert.equal(secondsPerEvent(120, "main", "4/4"), 0.5);
  assert.equal(secondsPerEvent(120, "eighths", "4/4"), 0.25);
  assert.ok(Math.abs(secondsPerEvent(120, "triplets", "4/4") - 1 / 6) < 1e-12);
  assert.equal(secondsPerEvent(120, "sixteenths", "4/4"), 0.125);
});

test("los compases compuestos usan pulso de negra con puntillo", () => {
  assert.equal(METERS["6/8"].beats, 2);
  assert.equal(METERS["9/8"].beats, 3);
  assert.equal(METERS["12/8"].beats, 4);
  assert.equal(METERS["6/8"].beatUnit, "♩.");
  assert.ok(Math.abs(secondsPerEvent(60, "eighths", "6/8") - 1 / 3) < 1e-12);
  assert.ok(Math.abs(secondsPerEvent(60, "sixteenths", "6/8") - 1 / 6) < 1e-12);
});

test("la cuenta previa ocupa exactamente uno o dos compases", () => {
  const sequencer = new Sequencer(baseConfig({ countIn: 2 }));
  const phases = Array.from({ length: 9 }, () => sequencer.next().event.phase);
  assert.deepEqual(phases.slice(0, 8), Array(8).fill("count-in"));
  assert.equal(phases[8], "playing");
});

test("los acentos personalizados distinguen solo los tiempos elegidos", () => {
  const sequencer = new Sequencer(baseConfig({ meter: "4/4", accentBeats: [1, 3] }));
  const types = Array.from({ length: 4 }, () => sequencer.next().event.clickType);
  assert.deepEqual(types, ["accent", "normal", "accent", "normal"]);
});

test("el modo progresivo cambia en el límite de compás y alcanza la meta", () => {
  const sequencer = new Sequencer(baseConfig({
    progressive: { enabled: true, start: 80, target: 88, step: 4, everyBars: 2 },
  }));
  const downbeats = [];
  for (let index = 0; index < 20; index += 1) {
    const event = sequencer.next().event;
    if (event.beatIndex === 0 && event.subdivisionIndex === 0) downbeats.push(event.bpm);
  }
  assert.deepEqual(downbeats, [80, 80, 84, 84, 88]);
});

test("el modo progresivo también puede bajar sin superar la meta", () => {
  const sequencer = new Sequencer(baseConfig({
    progressive: { enabled: true, start: 100, target: 92, step: 5, everyBars: 1 },
  }));
  const downbeats = [];
  for (let index = 0; index < 12; index += 1) {
    const event = sequencer.next().event;
    if (event.beatIndex === 0) downbeats.push(event.bpm);
  }
  assert.deepEqual(downbeats, [100, 95, 92]);
});

test("el entrenamiento de pulso interno respeta 4 compases con sonido y 2 en silencio", () => {
  const sequencer = new Sequencer(baseConfig({
    silent: { enabled: true, soundBars: 4, silentBars: 2 },
  }));
  const barStates = [];
  for (let index = 0; index < 28; index += 1) {
    const event = sequencer.next().event;
    if (event.beatIndex === 0) barStates.push(event.audible);
  }
  assert.deepEqual(barStates, [true, true, true, true, false, false, true]);
});

test("Tap Tempo usa varios golpes y resiste un intervalo accidental", () => {
  const tap = new TapTempo();
  assert.equal(tap.tap(0).ready, false);
  assert.equal(tap.tap(500).ready, false);
  assert.equal(tap.tap(1000).ready, false);
  assert.equal(tap.tap(1300).bpm, 120);
  assert.equal(tap.tap(1800).bpm, 120);
});

test("Tap Tempo reinicia la medición después de una pausa", () => {
  const tap = new TapTempo();
  tap.tap(0);
  tap.tap(500);
  const restarted = tap.tap(3100);
  assert.equal(restarted.ready, false);
  assert.equal(restarted.tapCount, 1);
});

test("el historial elimina duplicados y conserva los seis últimos", () => {
  let history = [120, 108, 96, 132, 80, 72];
  history = addToHistory(history, 96);
  assert.deepEqual(history, [96, 120, 108, 132, 80, 72]);
});

test("la configuración local se guarda, recupera y sanea", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const original = createDefaultState();
  original.bpm = 144;
  original.volume = 0.42;
  original.meter = "6/8";
  assert.equal(saveState(original, storage), true);
  const restored = loadState(storage);
  assert.equal(restored.bpm, 144);
  assert.equal(restored.volume, 0.42);
  assert.equal(restored.meter, "6/8");

  const sanitized = sanitizeState({ bpm: 900, volume: "x", meter: "15/3", accentBeats: [99] });
  assert.equal(sanitized.bpm, 300);
  assert.equal(sanitized.volume, 0.68);
  assert.equal(sanitized.meter, "4/4");
  assert.deepEqual(sanitized.accentBeats, [1]);
});
