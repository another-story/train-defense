// Presentation-only events. Recording is disabled during deterministic QA warm-up.
export type ActionEvent = {
  source: "train" | "enemy";
  kind: string;
  action: "fire" | "impact" | "melee" | "shot" | "spit" | "rock" | "charge" | "quake" | "summon" | "raise" | "plant" | "explode" | "break" | "smoke" | "heal" | "buff";
  x: number;
  y: number;
};
let enabled = false;
const events: ActionEvent[] = [];
const seen = new Set<string>();
export function setActionEventsEnabled(on: boolean): void { enabled = on; events.length = 0; seen.clear(); }
export function emitAction(event: ActionEvent): void {
  if (!enabled || events.length >= 96) return;
  const key = `${event.source}:${event.kind}:${event.action}`;
  if (seen.has(key)) return;
  seen.add(key);
  events.push(event);
}
export function drainActionEvents(): ActionEvent[] { seen.clear(); return events.splice(0); }
