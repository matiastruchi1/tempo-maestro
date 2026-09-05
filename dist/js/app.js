import { AudioEngine } from "./audio-engine.js";
import { BPM_MAX, BPM_MIN, METERS, SUBDIVISIONS, clampBpm, clampInteger, getMeter, normalizeAccentBeats } from "./rhythm.js";
import { LookaheadScheduler } from "./scheduler.js";
import { addToHistory, loadState, saveState } from "./storage.js";
import { TapTempo } from "./tap-tempo.js";

const byId = (id) => document.getElementById(id);
const deepCopy = (value) => JSON.parse(JSON.stringify(value));

let state = loadState();
let running = false;
let wakeLock = null;
let toastTimer = null;
let tapResetTimer = null;

const audio = new AudioEngine();
const tapTempo = new TapTempo();
const scheduler = new LookaheadScheduler(audio, {
  onPulse: handleScheduledPulse,
  onTempoChange: (bpm) => {
    setBpm(bpm, { record: true, updateScheduler: false, announce: true });
    renderProgressiveProgress(bpm);
  },
  onTimingInterruption: () => showToast("El reloj de audio se reanudó después de una interrupción."),
  onError: (error) => {
    stopMetronome();
    showToast(error?.message || "No se pudo continuar con el audio.");
  },
});

const controlsLockedDuringPlayback = [
  "meter-select",
  "subdivision-select",
  "sound-select",
  "count-in-select",
  "accent-enabled",
  "progressive-enabled",
  "progressive-start",
  "progressive-target",
  "progressive-step",
  "progressive-bars",
  "silent-enabled",
  "silent-sound-bars",
  "silent-muted-bars",
  "save-preset",
];

initialize();

function initialize() {
  wireEvents();
  renderAll();
  updateConnectionStatus();
  registerServiceWorker();
  updateWakeLockSupport();
}

function wireEvents() {
  wireHoldButton(byId("decrease-bpm"), -1);
  wireHoldButton(byId("increase-bpm"), 1);

  byId("bpm-input").addEventListener("focus", (event) => event.target.select());
  byId("bpm-input").addEventListener("change", (event) => {
    setBpm(event.target.value, { record: true, announce: true });
  });
  byId("bpm-input").addEventListener("blur", (event) => {
    event.target.value = state.bpm;
  });

  byId("start-stop").addEventListener("click", toggleMetronome);
  byId("resume-audio").addEventListener("click", resumeAudioAfterInterruption);
  byId("tap-tempo").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleTapTempo();
  });
  byId("tap-tempo").addEventListener("click", (event) => {
    if (event.detail === 0) handleTapTempo();
  });

  byId("meter-select").addEventListener("change", (event) => {
    state.meter = event.target.value;
    state.accentBeats = normalizeAccentBeats(state.accentBeats, state.meter);
    persist();
    renderAll();
  });
  byId("subdivision-select").addEventListener("change", (event) => {
    state.subdivision = event.target.value;
    persist();
    renderMainLabels();
  });
  byId("sound-select").addEventListener("change", (event) => {
    state.sound = event.target.value;
    persist();
    renderSummaries();
  });
  byId("count-in-select").addEventListener("change", (event) => {
    state.countIn = clampInteger(event.target.value, 0, 2, 0);
    persist();
  });
  byId("accent-enabled").addEventListener("change", (event) => {
    state.accentEnabled = event.target.checked;
    persist();
    renderAccents();
    renderPulseTrack();
  });
  byId("volume-input").addEventListener("input", (event) => {
    state.volume = Number(event.target.value) / 100;
    audio.setVolume(state.volume);
    renderVolume();
    persist();
  });

  byId("progressive-enabled").addEventListener("change", (event) => {
    state.progressive.enabled = event.target.checked;
    persist();
    renderPractice();
  });
  byId("silent-enabled").addEventListener("change", (event) => {
    state.silent.enabled = event.target.checked;
    persist();
    renderPractice();
  });

  wireNumberSetting("progressive-start", (value) => { state.progressive.start = clampBpm(value); });
  wireNumberSetting("progressive-target", (value) => { state.progressive.target = clampBpm(value); });
  wireNumberSetting("progressive-step", (value) => { state.progressive.step = clampInteger(value, 1, 40, 4); });
  wireNumberSetting("progressive-bars", (value) => { state.progressive.everyBars = clampInteger(value, 1, 64, 4); });
  wireNumberSetting("silent-sound-bars", (value) => { state.silent.soundBars = clampInteger(value, 1, 32, 4); });
  wireNumberSetting("silent-muted-bars", (value) => { state.silent.silentBars = clampInteger(value, 1, 32, 2); });

  byId("save-preset").addEventListener("click", openPresetDialog);
  byId("preset-form").addEventListener("submit", savePresetFromForm);
  byId("install-help-button").addEventListener("click", () => openDialog("install-dialog"));

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", () => persist());
}

function wireHoldButton(button, delta) {
  let delayTimer = null;
  let repeatTimer = null;
  let handledPointerAt = 0;

  const clear = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
    delayTimer = null;
    repeatTimer = null;
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    handledPointerAt = performance.now();
    button.setPointerCapture?.(event.pointerId);
    adjustBpm(delta);
    delayTimer = setTimeout(() => {
      repeatTimer = setInterval(() => adjustBpm(delta), 82);
    }, 420);
  });
  button.addEventListener("pointerup", clear);
  button.addEventListener("pointercancel", clear);
  button.addEventListener("lostpointercapture", clear);
  button.addEventListener("click", (event) => {
    if (event.detail === 0 && performance.now() - handledPointerAt > 300) adjustBpm(delta);
  });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

function wireNumberSetting(id, setter) {
  const input = byId(id);
  input.addEventListener("change", () => {
    setter(input.value);
    persist();
    renderPractice();
  });
}

function adjustBpm(delta) {
  const next = Math.min(BPM_MAX, Math.max(BPM_MIN, state.bpm + delta));
  setBpm(next, { updateScheduler: true });
}

function setBpm(value, { record = false, updateScheduler = true, announce = false } = {}) {
  const bpm = clampBpm(value);
  state.bpm = bpm;
  if (record) state.history = addToHistory(state.history, bpm);
  if (running && updateScheduler) scheduler.setTempo(bpm);
  byId("bpm-input").value = bpm;
  renderHistory();
  renderProgressiveProgress(bpm);
  persist();
  if (announce) announceStatus(`${bpm} BPM`);
}

async function toggleMetronome() {
  if (running) {
    stopMetronome();
    return;
  }

  const button = byId("start-stop");
  button.disabled = true;
  try {
    await audio.ensureReady();
    audio.setVolume(state.volume);
    if (state.progressive.enabled) setBpm(state.progressive.start, { updateScheduler: false });
    const initialBpm = scheduler.start(currentConfig());
    running = true;
    setBpm(initialBpm, { record: true, updateScheduler: false });
    renderPlaybackState();
    requestWakeLock();
    announceStatus(state.countIn ? `Metrónomo iniciado con ${state.countIn} compás de cuenta previa` : "Metrónomo iniciado");
  } catch (error) {
    showToast(error?.message || "Safari no permitió iniciar el audio.");
  } finally {
    button.disabled = false;
  }
}

function stopMetronome() {
  scheduler.stop();
  running = false;
  releaseWakeLock();
  document.body.classList.remove("silent-phase");
  byId("resume-audio").hidden = true;
  clearPulseIndicators();
  renderPlaybackState();
  announceStatus("Metrónomo detenido");
}

async function resumeAudioAfterInterruption() {
  try {
    await audio.resume();
    byId("resume-audio").hidden = true;
    requestWakeLock();
    showToast("Audio reanudado.");
  } catch {
    showToast("Tocá DETENER y luego INICIAR para reactivar el audio.");
  }
}

function handleTapTempo() {
  const result = tapTempo.tap(performance.now());
  clearTimeout(tapResetTimer);
  tapResetTimer = setTimeout(() => {
    tapTempo.reset();
    byId("tap-feedback").textContent = "marcá 4 pulsos";
  }, 2600);

  if (result.ignored) return;
  if (result.ready) {
    setBpm(result.bpm, { record: true, updateScheduler: true, announce: true });
    byId("tap-feedback").textContent = `${result.bpm} BPM`;
  } else {
    byId("tap-feedback").textContent = `${Math.min(result.tapCount, result.needed)} de ${result.needed}`;
  }

  const button = byId("tap-tempo");
  button.classList.remove("tap-flash");
  requestAnimationFrame(() => button.classList.add("tap-flash"));
  setTimeout(() => button.classList.remove("tap-flash"), 90);
}

function handleScheduledPulse(event) {
  const dots = [...byId("pulse-track").children];
  const dot = dots[event.beatIndex];
  if (dot) {
    clearTimeout(dot.pulseTimer);
    dot.classList.remove("active", "subdivision-pulse");
    if (event.subdivisionIndex > 0) dot.classList.add("subdivision-pulse");
    requestAnimationFrame(() => dot.classList.add("active"));
    const duration = event.subdivisionIndex > 0 ? 44 : 78;
    dot.pulseTimer = setTimeout(() => dot.classList.remove("active", "subdivision-pulse"), duration);
  }

  if (event.phase === "count-in") {
    setModeBadge(`CUENTA ${event.countInBar}/${event.countInBarsTotal}`, "playing");
  } else if (event.silent) {
    const silentNumber = event.silentPattern.cycleMeasure - event.silentPattern.soundBars + 1;
    setModeBadge(`SILENCIO ${silentNumber}/${event.silentPattern.silentBars}`, "silent");
    document.body.classList.add("silent-phase");
  } else {
    if (state.silent.enabled) {
      setModeBadge(`SONIDO ${event.silentPattern.cycleMeasure + 1}/${event.silentPattern.soundBars}`, "playing");
    } else {
      setModeBadge("EN MARCHA", "playing");
    }
    document.body.classList.remove("silent-phase");
  }

  if (event.phase === "playing" && event.subdivisionIndex === 0) {
    renderProgressiveProgress(event.bpm, event.stageBarsCompleted);
  }
}

function setModeBadge(text, variant = "") {
  const badge = byId("mode-badge");
  const className = `mode-badge ${variant}`.trim();
  if (badge.textContent !== text) badge.textContent = text;
  if (badge.className !== className) badge.className = className;
}

function renderAll() {
  byId("bpm-input").value = state.bpm;
  byId("meter-select").value = state.meter;
  byId("subdivision-select").value = state.subdivision;
  byId("sound-select").value = state.sound;
  byId("count-in-select").value = String(state.countIn);
  byId("accent-enabled").checked = state.accentEnabled;
  byId("volume-input").value = Math.round(state.volume * 100);
  byId("progressive-enabled").checked = state.progressive.enabled;
  byId("progressive-start").value = state.progressive.start;
  byId("progressive-target").value = state.progressive.target;
  byId("progressive-step").value = state.progressive.step;
  byId("progressive-bars").value = state.progressive.everyBars;
  byId("silent-enabled").checked = state.silent.enabled;
  byId("silent-sound-bars").value = state.silent.soundBars;
  byId("silent-muted-bars").value = state.silent.silentBars;
  renderMainLabels();
  renderVolume();
  renderAccents();
  renderPulseTrack();
  renderHistory();
  renderPresets();
  renderPractice();
  renderPlaybackState();
}

function renderMainLabels() {
  const meter = getMeter(state.meter);
  byId("beat-unit").textContent = meter.beatUnit;
  byId("measure-status").textContent = `${state.meter} · ${SUBDIVISIONS[state.subdivision].shortLabel}`;
  renderSummaries();
}

function renderVolume() {
  const percent = Math.round(state.volume * 100);
  byId("volume-output").textContent = `${percent}%`;
  byId("volume-input").style.setProperty("--range-progress", `${percent}%`);
  renderSummaries();
}

function renderSummaries() {
  const soundNames = { wood: "Madera", classic: "Clásico", digital: "Digital" };
  byId("sound-summary").textContent = `${soundNames[state.sound]} · ${Math.round(state.volume * 100)}%`;
  const activeModes = [];
  if (state.progressive.enabled) activeModes.push("Progresivo");
  if (state.silent.enabled) activeModes.push("Pulso interno");
  byId("practice-summary").textContent = activeModes.length ? activeModes.join(" · ") : "Desactivada";
}

function renderAccents() {
  const editor = byId("accent-editor");
  editor.hidden = !state.accentEnabled;
  const container = byId("accent-beats");
  container.replaceChildren();
  const total = getMeter(state.meter).beats;

  for (let beat = 1; beat <= total; beat += 1) {
    const button = document.createElement("button");
    const selected = state.accentBeats.includes(beat);
    button.type = "button";
    button.className = `beat-choice${selected ? " selected" : ""}`;
    button.textContent = beat;
    button.setAttribute("aria-label", `${selected ? "Quitar" : "Acentuar"} tiempo ${beat}`);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = running;
    button.addEventListener("click", () => toggleAccentBeat(beat));
    container.append(button);
  }
}

function toggleAccentBeat(beat) {
  if (running) return;
  if (state.accentBeats.includes(beat)) {
    if (state.accentBeats.length === 1) {
      showToast("Dejá al menos un tiempo acentuado o desactivá Acentos.");
      return;
    }
    state.accentBeats = state.accentBeats.filter((item) => item !== beat);
  } else {
    state.accentBeats = [...state.accentBeats, beat].sort((a, b) => a - b);
  }
  persist();
  renderAccents();
  renderPulseTrack();
}

function renderPulseTrack() {
  const container = byId("pulse-track");
  container.replaceChildren();
  const total = getMeter(state.meter).beats;
  for (let beat = 1; beat <= total; beat += 1) {
    const dot = document.createElement("span");
    dot.className = `pulse-dot${state.accentEnabled && state.accentBeats.includes(beat) ? " accent-option" : ""}`;
    dot.setAttribute("aria-hidden", "true");
    container.append(dot);
  }
  container.setAttribute("aria-label", `${total} pulsos principales para el compás ${state.meter}`);
}

function clearPulseIndicators() {
  byId("pulse-track").querySelectorAll(".pulse-dot").forEach((dot) => {
    clearTimeout(dot.pulseTimer);
    dot.classList.remove("active", "subdivision-pulse");
  });
}

function renderHistory() {
  const container = byId("history-list");
  container.replaceChildren();
  state.history.forEach((bpm) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tempo-chip";
    button.textContent = bpm;
    button.disabled = running;
    button.setAttribute("aria-label", `Cargar ${bpm} BPM`);
    button.addEventListener("click", () => setBpm(bpm, { record: true, announce: true }));
    container.append(button);
  });
}

function renderPresets() {
  const list = byId("preset-list");
  list.replaceChildren();
  const sorted = [...state.presets].sort((a, b) => Number(b.favorite) - Number(a.favorite));

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "info-copy";
    empty.textContent = "Todavía no guardaste ninguna obra.";
    list.append(empty);
  }

  sorted.forEach((preset) => {
    const meter = getMeter(preset.config.meter);
    const card = document.createElement("article");
    card.className = "preset-card";

    const main = document.createElement("div");
    main.className = "preset-main";
    const composer = document.createElement("span");
    composer.className = "preset-composer";
    composer.textContent = preset.composer;
    const title = document.createElement("span");
    title.className = "preset-title";
    title.textContent = preset.work;
    if (preset.movement) {
      const movement = document.createElement("span");
      movement.className = "preset-movement";
      movement.textContent = ` · ${preset.movement}`;
      title.append(movement);
    }
    const meta = document.createElement("span");
    meta.className = "preset-meta";
    meta.textContent = `${meter.beatUnit} = ${preset.config.bpm} · ${preset.config.meter} · ${SUBDIVISIONS[preset.config.subdivision].shortLabel}`;
    main.append(composer, title, meta);

    const actions = document.createElement("div");
    actions.className = "preset-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "load-preset";
    load.textContent = "Cargar";
    load.disabled = running;
    load.addEventListener("click", () => loadPreset(preset.id));
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `favorite${preset.favorite ? " active" : ""}`;
    favorite.textContent = preset.favorite ? "★" : "☆";
    favorite.setAttribute("aria-label", `${preset.favorite ? "Quitar de" : "Añadir a"} favoritos`);
    favorite.addEventListener("click", () => toggleFavorite(preset.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-preset";
    remove.textContent = "×";
    remove.disabled = running;
    remove.setAttribute("aria-label", `Eliminar preset ${preset.work}`);
    remove.addEventListener("click", () => deletePreset(preset.id));
    actions.append(load, favorite, remove);
    card.append(main, actions);
    list.append(card);
  });

  const count = state.presets.length;
  byId("preset-count").textContent = `${count} ${count === 1 ? "preset" : "presets"}`;
  renderFavorites();
}

function renderFavorites() {
  const favorites = state.presets.filter((preset) => preset.favorite);
  const section = byId("favorites-section");
  const list = byId("favorites-list");
  section.hidden = favorites.length === 0;
  list.replaceChildren();
  favorites.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "favorite-chip";
    button.textContent = `${preset.composer} · ${preset.work}`;
    button.title = button.textContent;
    button.disabled = running;
    button.addEventListener("click", () => loadPreset(preset.id));
    list.append(button);
  });
}

function openPresetDialog() {
  if (running) return;
  byId("preset-form").reset();
  const meter = getMeter(state.meter);
  byId("preset-preview").textContent = `${meter.beatUnit} = ${state.bpm} · ${state.meter} · ${SUBDIVISIONS[state.subdivision].shortLabel}`;
  openDialog("preset-dialog");
  setTimeout(() => byId("preset-composer").focus(), 60);
}

function savePresetFromForm(event) {
  event.preventDefault();
  const composer = byId("preset-composer").value.trim();
  const work = byId("preset-work").value.trim();
  const movement = byId("preset-movement").value.trim();
  if (!composer || !work) return;

  state.presets.unshift({
    id: globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}`,
    composer,
    work,
    movement,
    favorite: false,
    createdAt: new Date().toISOString(),
    config: currentConfig(),
  });
  state.presets = state.presets.slice(0, 100);
  persist();
  renderPresets();
  closeDialog("preset-dialog");
  showToast("Preset guardado en este dispositivo.");
}

function loadPreset(id) {
  if (running) {
    showToast("Detené el metrónomo antes de cargar una obra.");
    return;
  }
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;
  const config = deepCopy(preset.config);
  state.bpm = clampBpm(config.bpm);
  state.meter = METERS[config.meter] ? config.meter : "4/4";
  state.subdivision = SUBDIVISIONS[config.subdivision] ? config.subdivision : "main";
  state.accentEnabled = config.accentEnabled !== false;
  state.accentBeats = normalizeAccentBeats(config.accentBeats, state.meter);
  state.countIn = clampInteger(config.countIn, 0, 2, 0);
  state.sound = ["wood", "classic", "digital"].includes(config.sound) ? config.sound : "wood";
  state.progressive = deepCopy(config.progressive || state.progressive);
  state.silent = deepCopy(config.silent || state.silent);
  state.history = addToHistory(state.history, state.bpm);
  persist();
  renderAll();
  showToast(`${preset.composer} · ${preset.work} cargado.`);
}

function toggleFavorite(id) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;
  preset.favorite = !preset.favorite;
  persist();
  renderPresets();
}

function deletePreset(id) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset || running) return;
  const confirmed = window.confirm(`¿Eliminar el preset “${preset.work}”? Esta acción no se puede deshacer.`);
  if (!confirmed) return;
  state.presets = state.presets.filter((item) => item.id !== id);
  persist();
  renderPresets();
  showToast("Preset eliminado.");
}

function renderPractice() {
  byId("progressive-start").value = state.progressive.start;
  byId("progressive-target").value = state.progressive.target;
  byId("progressive-step").value = state.progressive.step;
  byId("progressive-bars").value = state.progressive.everyBars;
  byId("silent-sound-bars").value = state.silent.soundBars;
  byId("silent-muted-bars").value = state.silent.silentBars;
  byId("progressive-fields").classList.toggle("disabled-fields", !state.progressive.enabled);
  byId("silent-fields").classList.toggle("disabled-fields", !state.silent.enabled);
  byId("progressive-progress").hidden = !state.progressive.enabled;
  renderProgressiveProgress(state.bpm);
  renderSummaries();
}

function renderProgressiveProgress(currentBpm = state.bpm, stageBarsCompleted = 0) {
  if (!state.progressive.enabled) return;
  const start = state.progressive.start;
  const target = state.progressive.target;
  const distance = target - start;
  const travelled = currentBpm - start;
  const percent = distance === 0 ? 100 : Math.max(0, Math.min(100, Math.round((travelled / distance) * 100)));
  const remainingBars = Math.max(1, state.progressive.everyBars - stageBarsCompleted);
  byId("progressive-status").textContent = running
    ? currentBpm === target
      ? `${currentBpm} BPM · meta alcanzada`
      : `${currentBpm} BPM · próximo cambio en ${remainingBars} ${remainingBars === 1 ? "compás" : "compases"}`
    : `${start} → ${target} · cada ${state.progressive.everyBars} ${state.progressive.everyBars === 1 ? "compás" : "compases"}`;
  byId("progressive-percent").textContent = `${percent}%`;
  byId("progressive-bar").style.width = `${percent}%`;
}

function renderPlaybackState() {
  const button = byId("start-stop");
  button.classList.toggle("running", running);
  button.querySelector(".transport-icon").textContent = running ? "■" : "▶";
  button.querySelector("span:last-child").textContent = running ? "DETENER" : "INICIAR";
  byId("bpm-input").readOnly = running;
  controlsLockedDuringPlayback.forEach((id) => {
    const element = byId(id);
    if (element) element.disabled = running;
  });
  document.querySelectorAll(".beat-choice, .load-preset, .delete-preset, .tempo-chip, .favorite-chip").forEach((element) => {
    element.disabled = running;
  });
  if (!running) setModeBadge("LISTO");
  renderAccents();
  renderHistory();
  renderPresets();
  renderProgressiveProgress(state.bpm);
}

function currentConfig() {
  return {
    bpm: state.bpm,
    meter: state.meter,
    subdivision: state.subdivision,
    accentEnabled: state.accentEnabled,
    accentBeats: [...state.accentBeats],
    countIn: state.countIn,
    sound: state.sound,
    progressive: deepCopy(state.progressive),
    silent: deepCopy(state.silent),
  };
}

async function requestWakeLock() {
  if (!running || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; }, { once: true });
  } catch {
    byId("wake-lock-note").innerHTML = "<strong>Pantalla:</strong> iOS no permitió mantenerla encendida en este momento.";
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch {
    // It may have been released automatically by the browser.
  }
  wakeLock = null;
}

function updateWakeLockSupport() {
  if (!("wakeLock" in navigator)) {
    byId("wake-lock-note").innerHTML = "<strong>Pantalla:</strong> esta versión de Safari no ofrece Wake Lock; ajustá el bloqueo automático de iOS si fuera necesario.";
  }
}

function handleVisibilityChange() {
  if (!running) return;
  if (document.visibilityState === "visible") {
    requestWakeLock();
    if (audio.state !== "running") byId("resume-audio").hidden = false;
  }
}

async function registerServiceWorker() {
  const summary = byId("offline-summary");
  if (!("serviceWorker" in navigator) || !["https:", "http:"].includes(location.protocol)) {
    summary.textContent = "Disponible al alojar";
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;
    summary.textContent = "Offline listo";
  } catch {
    summary.textContent = "Offline no disponible";
  }
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  byId("connection-status").classList.toggle("offline", !online);
  byId("connection-label").textContent = online ? "En línea" : "Sin conexión";
}

function openDialog(id) {
  const dialog = byId(id);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(id) {
  const dialog = byId(id);
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function showToast(message) {
  const toast = byId("toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function announceStatus(message) {
  byId("sr-status").textContent = message;
}

function persist() {
  if (!saveState(state)) showToast("Safari no pudo guardar los cambios locales.");
}
