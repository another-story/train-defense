/** Presentation preferences only. Combat and movement never read these values. */
export type EffectSettings = { reducedEffects: boolean; reducedMotion: boolean };

const settings: EffectSettings = {
  reducedEffects: false,
  reducedMotion: typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
};

const KEY = "traindefense.effects.v1";
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  if (typeof saved?.reducedEffects === "boolean") settings.reducedEffects = saved.reducedEffects;
  if (typeof saved?.reducedMotion === "boolean") settings.reducedMotion = saved.reducedMotion;
} catch { /* OS defaults remain usable when storage is unavailable. */ }

export function getEffectSettings(): Readonly<EffectSettings> {
  return settings;
}

export function setEffectSettings(next: Partial<EffectSettings>): void {
  Object.assign(settings, next);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* settings still apply this session */ }
}
