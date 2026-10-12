// Locally hosted effects and original audition music, decoded once per page.
// This module never changes the game's RNG, simulation clock, or run save.
export type AudioSettings = { master: number; sfx: number; music: number; muted: boolean };
export type AudioState = { paused: boolean; hidden: boolean; menu: boolean; running: boolean; danger: boolean };
export type SoundOptions = { volume?: number; pan?: number; distance?: number };

import { SOUND_BY_ID, SOUND_CATALOG, SOUND_NAMES, type SoundName } from "./sound-catalog";
export { SOUND_CATALOG, SOUND_NAMES, WEAPON_SOUND_MAP, ENEMY_SOUND_MAP, soundForAction } from "./sound-catalog";
export type { SoundName } from "./sound-catalog";
import { GAME_MUSIC_ID, MUSIC_TRACKS, type MusicId } from "./music-catalog";
const KEY = "traindefense.audio.v1";
const VOICE_CAP = 16; // includes the optional music loop
const defaults: AudioSettings = { master: 0.55, sfx: 0.7, music: 0.3, muted: false };
const unit = (v: number, fallback: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
const settings = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved && typeof saved === "object") {
    for (const k of ["master", "sfx", "music"] as const) settings[k] = unit(saved[k], defaults[k]);
    if (typeof saved.muted === "boolean") settings.muted = saved.muted;
  }
} catch { /* Missing, blocked, or old storage must not stop the game. */ }
const state: AudioState = { paused: false, hidden: typeof document !== "undefined" && document.hidden, menu: false, running: false, danger: false };
let context: AudioContext | null = null;
let master: GainNode;
let sfx: GainNode;
let musicGain: GainNode;
let unlocked = false;
let failed = false;
let pending: Promise<boolean> | null = null;
let music: AudioBufferSourceNode | null = null;
let musicMode = "";
let musicPurpose: "game" | "preview" | null = null;
let gameMusicOffset = 0, gameMusicRequest: number | null = null;
let musicVoiceGain: GainNode | null = null;
let musicStarted = 0, musicOffset = 0, musicDuration = 0, musicRevision = 0;
const musicBuffers = new Map<MusicId, Promise<AudioBuffer | null>>();
let rng = 0x74524149;
const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
const buffers = new Map<SoundName, AudioBuffer>();
const encoded = new Map<SoundName, Promise<ArrayBuffer | null>>();
const missing = new Set<SoundName>();
let loading: Promise<void> | null = null;

const lastPlayed = new Map<SoundName, number>();
type Voice = { name: SoundName; source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode | null; priority: number; end: number };
const voices: Voice[] = [];
const counts = { played: 0, rateLimited: 0, voiceLimited: 0, notReady: 0, stolen: 0, maxVoices: 0, errors: 0 };

function fetchCue(name: SoundName): Promise<ArrayBuffer | null> {
  let request = encoded.get(name);
  if (!request) {
    request = fetch(SOUND_BY_ID[name].url).then(response => {
      if (!response.ok) throw new Error(`Audio ${response.status}: ${name}`);
      return response.arrayBuffer();
    }).catch(() => { missing.add(name); counts.errors++; return null; });
    encoded.set(name, request);
  }
  return request;
}

/** Fetching needs no gesture. Decoding begins once unlockAudio has made a context.
 * A missing cue remains silent; an old burst is never replayed after a download. */
export function preloadAudio(): Promise<void> {
  if (!context) return Promise.all(SOUND_NAMES.map(fetchCue)).then(() => {});
  if (loading) return loading;
  const ctx = context;
  loading = Promise.all(SOUND_NAMES.map(async name => {
    if (buffers.has(name)) return;
    const bytes = await fetchCue(name);
    if (!ctx || !bytes) return;
    try { buffers.set(name, await ctx.decodeAudioData(bytes.slice(0))); }
    catch { missing.add(name); counts.errors++; }
  })).then(() => {}).finally(() => { loading = null; });
  return loading;
}

function setGain(node: GainNode, value: number): void {
  if (!context) return;
  node.gain.cancelScheduledValues(context.currentTime);
  node.gain.setTargetAtTime(value, context.currentTime, 0.025);
}

function removeVoice(voice: Voice, stop = false): void {
  const index = voices.indexOf(voice);
  if (index < 0) return;
  voices.splice(index, 1);
  voice.source.onended = null;
  if (stop) { try { voice.source.stop(); } catch { /* Already ended. */ } }
  voice.source.disconnect();
  voice.gain.disconnect();
  voice.pan?.disconnect();
}

/** Fade user stops; suspension uses an immediate stop so nothing replays on return. */
export function stopMusicPreview(immediate = false): void {
  if (musicPurpose === "game") gameMusicOffset = musicPreviewPosition()?.position ?? gameMusicOffset;
  musicRevision++;
  gameMusicRequest = null;
  const source = music, gain = musicVoiceGain;
  music = null; musicVoiceGain = null; musicMode = ""; musicPurpose = null;
  if (!source || !gain || !context) return;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + .018);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.stop(immediate || context.state !== "running" ? now : now + .02);
}

function loadMusic(id: MusicId, ctx: AudioContext): Promise<AudioBuffer | null> {
  const track = MUSIC_TRACKS.find(t => t.id === id);
  if (!track) return Promise.resolve(null);
  let request = musicBuffers.get(id);
  if (!request) {
    request = fetch(track.url).then(response => {
      if (!response.ok) throw new Error(`Music ${response.status}`);
      return response.arrayBuffer();
    }).then(bytes => ctx.decodeAudioData(bytes)).catch(() => {
      musicBuffers.delete(id); counts.errors++; return null;
    });
    musicBuffers.set(id, request);
  }
  return request;
}

function startMusic(ctx: AudioContext, buffer: AudioBuffer, id: MusicId, offset: number, purpose: "game" | "preview"): void {
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = buffer.duration;
  gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(1, ctx.currentTime + (purpose === "game" ? .3 : .025));
  source.connect(gain); gain.connect(musicGain);
  music = source; musicVoiceGain = gain; musicMode = id; musicPurpose = purpose;
  setGain(musicGain, purpose === "game" ? settings.music : 1);
  musicDuration = buffer.duration; musicOffset = offset % buffer.duration;
  musicStarted = ctx.currentTime; source.start(0, musicOffset);
  counts.maxVoices = Math.max(counts.maxVoices, voices.length + 1);
}

/** Archive previews use the master slider and never start gameplay music. */
export async function playMusicPreview(id: MusicId, seam = false): Promise<boolean> {
  stopMusicPreview(); stopAllEffects();
  const revision = musicRevision, resumed = unlockAudio(), ctx = context;
  if (!ctx) return false;
  const [ok, buffer] = await Promise.all([resumed, loadMusic(id, ctx)]);
  if (!ok || !buffer || revision !== musicRevision || blocked() || ctx.state !== "running") return false;
  startMusic(ctx, buffer, id, seam ? Math.max(0, buffer.duration - 4) : 0, "preview");
  return true;
}

function wantsGameMusic(): boolean {
  return state.running && !state.menu && !blocked() && settings.music > 0 && unlocked && context?.state === "running";
}

function syncGameMusic(): void {
  if (!wantsGameMusic()) {
    if (musicPurpose === "game" || gameMusicRequest !== null) stopMusicPreview();
    if (!state.running || state.menu) gameMusicOffset = 0;
    return;
  }
  if (music || gameMusicRequest !== null || !context) return;
  const ctx = context, revision = musicRevision;
  gameMusicRequest = revision;
  void loadMusic(GAME_MUSIC_ID, ctx).then(buffer => {
    if (gameMusicRequest === revision) gameMusicRequest = null;
    if (!buffer || revision !== musicRevision || !wantsGameMusic()) return;
    // A delayed music download must still leave the shared voice cap intact.
    if (voices.length >= VOICE_CAP) removeVoice(voices.reduce((a, b) => a.priority <= b.priority ? a : b), true);
    startMusic(ctx, buffer, GAME_MUSIC_ID, gameMusicOffset, "game");
  });
}

export function musicPreviewPosition(): { id: string; position: number; duration: number; loops: number } | null {
  if (!music || !context) return null;
  const elapsed = Math.max(0, context.currentTime - musicStarted) + musicOffset;
  return { id: musicMode, position: elapsed % musicDuration, duration: musicDuration, loops: Math.floor(elapsed / musicDuration) };
}

function silence(): void {
  for (let i = voices.length - 1; i >= 0; i--) removeVoice(voices[i], true);
  stopMusicPreview(true);
  lastPlayed.clear();
}

function blocked(): boolean { return state.paused || state.hidden || settings.muted || settings.master === 0; }

function syncContext(): void {
  if (!context || !unlocked) return;
  setGain(master, settings.muted ? 0 : settings.master * 0.8);
  setGain(sfx, settings.sfx);
  setGain(musicGain, musicPurpose === "game" ? settings.music : 1);
  if (blocked()) {
    silence();
    void context.suspend().catch(() => { counts.errors++; });
  } else if (context.state !== "running") {
    void context.resume().then(syncContext).catch(() => { counts.errors++; });
  }
  syncGameMusic();
}

/** Call directly from a user gesture. Autoplay rejection/unavailable audio is harmless. */
export function unlockAudio(): Promise<boolean> {
  if (pending) return pending;
  try {
    if (!context) {
      const Audio = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) { failed = true; return Promise.resolve(false); }
      context = new Audio({ latencyHint: "interactive" });
      master = context.createGain(); sfx = context.createGain(); musicGain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -10; compressor.knee.value = 12; compressor.ratio.value = 8;
      compressor.attack.value = 0.003; compressor.release.value = 0.16;
      sfx.connect(compressor); musicGain.connect(compressor); compressor.connect(master); master.connect(context.destination);
      master.gain.value = settings.muted ? 0 : settings.master * 0.8;
      sfx.gain.value = settings.sfx; musicGain.gain.value = 1;
    }
    // Resume is invoked synchronously inside the gesture, before awaiting anything.
    const resume = context.resume();
    // Fetch/decode is independent of the resume promise and never blocks play.
    void preloadAudio();
    pending = resume.then(() => {
      unlocked = context?.state === "running";
      failed = !unlocked;
      syncContext();
      return unlocked;
    }).catch(() => { failed = true; counts.errors++; return false; }).finally(() => { pending = null; });
    return pending;
  } catch { failed = true; counts.errors++; return Promise.resolve(false); }
}

/** Ignored sounds are never queued: resuming cannot replay an old combat burst. */
export function playSound(name: SoundName, options: SoundOptions = {}): boolean {
  return playCue(name, options, false);
}

function playCue(name: SoundName, options: SoundOptions, audition: boolean): boolean {
  if (!context || !unlocked || context.state !== "running" || blocked() || settings.sfx === 0) return false;
  const cue = SOUND_BY_ID[name], buffer = buffers.get(name);
  if (!cue) return false;
  if (!buffer) { counts.notReady++; return false; }
  const now = context.currentTime, volume = unit(options.volume ?? 1, 1), distance = unit(options.distance ?? 0, 0);
  if (volume === 0 || distance === 1) return false;
  if (!audition && now - (lastPlayed.get(name) ?? -Infinity) < cue.minInterval) { counts.rateLimited++; return false; }
  // onended dispatch can be delayed; retire finished voices before measuring the cap.
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) removeVoice(voices[i]);
  if (!audition && voices.filter(v => v.name === name).length >= 2) { counts.voiceLimited++; return false; }
  // Leave room for enemy tells even in a full train salvo. Heavy cues may evict
  // routine attacks, and all voices (including music) still share the hard cap.
  const categoryCap = cue.category === "train" ? 8 : cue.category === "enemy" ? 6 : 4;
  const categoryVoices = voices.filter(v => SOUND_BY_ID[v.name].category === cue.category);
  if (!audition && cue.priority < 3 && categoryVoices.length >= categoryCap) {
    const victim = categoryVoices.find(v => v.priority <= cue.priority);
    if (!victim) { counts.voiceLimited++; return false; }
    removeVoice(victim, true); counts.stolen++;
  }
  const limit = VOICE_CAP - (music ? 1 : 0);
  if (voices.length >= limit) {
    let victim = voices[0];
    for (const voice of voices) if (voice.priority < victim.priority) victim = voice;
    if (victim.priority > cue.priority) { counts.voiceLimited++; return false; }
    removeVoice(victim, true); counts.stolen++;
  }
  try {
    const source = context.createBufferSource(), gain = context.createGain();
    const panValue = Math.max(-1, Math.min(1, Number.isFinite(options.pan) ? options.pan! : 0));
    const pan = panValue !== 0 && typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    source.buffer = buffer;
    const pitch = audition || cue.priority >= 3 || cue.category === "system" ? 1 : 0.985 + random() * 0.03;
    source.playbackRate.value = pitch;
    gain.gain.value = cue.gain * volume * (1 - distance * 0.85);
    source.connect(gain);
    if (pan) { pan.pan.value = panValue; gain.connect(pan); pan.connect(sfx); } else gain.connect(sfx);
    const voice: Voice = { name, source, gain, pan, priority: cue.priority, end: now + buffer.duration / pitch };
    source.onended = () => { removeVoice(voice); };
    source.start();
    voices.push(voice); lastPlayed.set(name, now); counts.played++;
    counts.maxVoices = Math.max(counts.maxVoices, voices.length + (music ? 1 : 0));
    return true;
  } catch { counts.errors++; return false; }
}

/** Stop a preview immediately without changing settings or simulation state. */
export function stopAllEffects(): void {
  for (let i = voices.length - 1; i >= 0; i--) removeVoice(voices[i], true);
  lastPlayed.clear();
}

/** Isolated audition of the game's exact buffer and gain; no pitch variation. */
export function playAudition(name: SoundName, options: SoundOptions = {}): boolean {
  stopMusicPreview(); stopAllEffects();
  return playCue(name, options, true);
}

export function getAudioSettings(): AudioSettings { return { ...settings }; }

export function setAudioSettings(next: Partial<AudioSettings>): AudioSettings {
  for (const key of ["master", "sfx", "music"] as const) if (next[key] !== undefined) settings[key] = unit(next[key]!, settings[key]);
  if (typeof next.muted === "boolean") settings.muted = next.muted;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  syncContext();
  return getAudioSettings();
}

/** Safe to call every frame: unchanged state does no audio work. */
export function setAudioState(next: Partial<AudioState>): void {
  let changed = false;
  for (const key in next) {
    const k = key as keyof AudioState;
    if (typeof next[k] === "boolean" && next[k] !== state[k]) { state[k] = next[k]!; changed = true; }
  }
  if (changed) syncContext();
}

export function audioProbe() {
  return {
    supported: typeof globalThis.AudioContext === "function" || typeof (globalThis as typeof globalThis & { webkitAudioContext?: unknown }).webkitAudioContext === "function",
    unlocked, failed, context: context?.state ?? "locked", settings: getAudioSettings(), state: { ...state },
    voices: voices.length + (music ? 1 : 0), voiceCap: VOICE_CAP, music: musicMode || null,
    active: voices.map(v => ({ name: v.name, priority: v.priority })), buffers: buffers.size,
    expectedBuffers: SOUND_NAMES.length, loading: loading !== null, ready: buffers.size === SOUND_NAMES.length,
    missing: [...missing], catalog: "crystal-core-v4", assetBytes: SOUND_CATALOG.reduce((sum, cue) => sum + cue.bytes, 0),
    musicPreview: musicPreviewPosition(), musicBuffers: musicBuffers.size,
    musicPurpose, musicLevel: musicPurpose === "game" ? settings.music : 1, gameMusicOffset,
    counters: { ...counts }, storageKey: KEY,
  };
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => setAudioState({ hidden: document.hidden }));
