/** Hand-pixelled train hardware. Coordinates use a 64 px car length; the mount is (0, 0).
 * Baked once per kind/tier/branch, never at display size or angle. No simulation state or RNG. */
import { BRANCHES } from "./balance";

export const WEAPON_ART_KINDS = ["machinegun", "railgun", "sniper", "cannon", "mortar", "flamer", "tesla", "missile", "mlrs", "laser", "incendiary", "flak"] as const;
const kinds: ReadonlySet<string> = new Set([...WEAPON_ART_KINDS, "hero"]);
const SIZE = 80, UNIT = 64, CX = 40, CY = 48;
const P = {
  ink: "#202622", shade: "#414a43", iron: "#737e74", steel: "#b5c4b5", light: "#e4e7cb",
  brass: "#ae8952", gold: "#dbc18a", rust: "#75513c", wood: "#816143", red: "#a9583e",
  amber: "#f0b863", blue: "#75bfc2", white: "#d9eece", black: "#121c1b",
};
type PixelArt = { image: HTMLCanvasElement; mask: HTMLCanvasElement; maskColor: string };
const cache = new Map<string, PixelArt>();
let bakes = 0;

/** 12 × (T1 + T2 + T3 + two T3 branches) + hero + locomotive = 62 entries independent of draw size, rotation or outline color. */
export function weaponArtCacheStats(): { entries: number; bakes: number; maxEntries: number; pixels: number } {
  return { entries: cache.size, bakes, maxEntries: 62, pixels: cache.size * SIZE * SIZE * 2 };
}

function bake(kind: string, tier: number, branch: string | null): PixelArt {
  const image = document.createElement("canvas"); image.width = image.height = SIZE;
  const g = image.getContext("2d")!;
  g.translate(CX, CY);
  const r = (x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const plate = (x: number, y: number, w: number, h: number, color = P.iron) => {
    r(x + 1, y, w - 2, h, P.ink); r(x, y + 1, w, h - 2, P.ink);
    r(x + 1, y + 1, w - 2, h - 2, color);
    r(x + 2, y + 1, w - 4, 1, P.steel); r(x + 1, y + 2, 1, h - 4, P.steel);
    r(x + 2, y + h - 2, w - 3, 1, P.shade);
  };
  // Integer scanlines keep bores, coils and rivets on the same pixel grid as the body PNG.
  const disc = (x: number, y: number, rad: number, color: string) => {
    for (let dy = -rad; dy <= rad; dy++) {
      const dx = Math.floor(Math.sqrt(rad * rad - dy * dy)); r(x - dx, y + dy, dx * 2 + 1, 1, color);
    }
  };
  const ring = (x: number, y: number, rad: number, color = P.brass) => {
    disc(x, y, rad, P.ink); disc(x, y, rad - 1, color); disc(x, y, rad - 3, P.shade);
    r(x - 2, y - rad + 1, 4, 1, P.gold);
  };
  const barrel = (x: number, top: number, w: number, bottom: number, bands = 1) => {
    plate(x, top, w, bottom - top, P.iron);
    if (w > 3) r(x + 1, top + 2, Math.max(1, Math.floor(w / 3)), bottom - top - 4, P.steel);
    if (w > 7) r(x + w - 3, top + 3, 1, bottom - top - 5, P.shade);
    r(x, top, w, 2, P.ink); if (w > 4) r(x + 1, top + 2, w - 2, 1, P.black);
    for (let i = 0; i < bands; i++) { const y = bottom - 4 - i * 5; r(x - 1, y, w + 2, 2, P.shade); r(x, y, w, 1, P.brass); }
  };
  const tank = (x: number, y: number, h: number, color = P.red) => {
    plate(x, y, 7, h, color); r(x + 1, y + 3, 5, 2, P.brass); r(x + 1, y + h - 5, 5, 2, P.brass);
    r(x + 2, y - 2, 3, 3, P.ink); r(x + 2, y - 2, 2, 1, P.gold);
  };
  const fin = (x: number, y: number, w: number, n: number) => {
    r(x, y, w, n * 3, P.ink); for (let i = 0; i < n; i++) { r(x, y + i * 3, w, 1, P.steel); r(x + 1, y + i * 3 + 1, w - 1, 1, P.iron); }
  };
  const rocket = (x: number, y: number, w: number, h: number, heavy = false) => {
    plate(x, y + 5, w, h - 5, P.iron); r(x + 1, y + 5, w - 2, 3, heavy ? P.red : P.brass);
    r(x + 2, y, w - 4, 2, P.ink); r(x + 1, y + 2, w - 2, 3, P.ink);
    r(x + 2, y + 2, w - 4, 4, heavy ? P.amber : P.light);
    r(x - 2, y + h - 7, 2, 6, P.ink); r(x + w, y + h - 7, 2, 6, P.ink);
    r(x - 1, y + h - 6, 1, 4, P.brass); r(x + w, y + h - 6, 1, 4, P.brass);
  };
  const coil = (x: number, y: number, tall: number) => {
    plate(x - 4, y, 9, tall, P.shade);
    for (let yy = y + 3; yy < y + tall - 2; yy += 4) { r(x - 5, yy, 11, 2, P.ink); r(x - 4, yy, 8, 1, P.brass); r(x - 3, yy + 1, 7, 1, P.gold); }
    disc(x, y, 5, P.ink); disc(x, y - 1, 4, P.steel); r(x - 2, y - 3, 3, 2, P.light);
  };

  if (kind === "locomotive") {
    // Cowcatcher, boiler bands and cab windows follow the chassis, never the aiming turret.
    r(-8, -28, 16, 3, P.ink); r(-7, -28, 14, 1, P.brass);
    for (let i = -6; i <= 6; i += 3) { r(i, -31, 2, 4, P.ink); r(i, -30, 1, 3, P.gold); }
    r(-7, -21, 14, 2, P.brass); r(-6, -21, 12, 1, P.gold);
    ring(0, -23, 4); disc(0, -23, 2, P.black);
    plate(-8, 15, 16, 11, P.wood); plate(-6, 17, 5, 5, P.shade); plate(1, 17, 5, 5, P.shade);
    r(-5, 18, 3, 1, P.blue); r(2, 18, 3, 1, P.blue); r(-6, 24, 12, 1, P.gold);
  } else {
    const rad = kind === "hero" ? 11 : 10 + tier;
    ring(0, 2, rad, P.brass); disc(0, 2, rad - 3, P.iron);
    r(-rad + 4, 4, (rad - 4) * 2, 2, P.shade);
    for (const x of [-rad + 4, rad - 4]) { r(x, -2, 2, 2, P.gold); r(x, 7, 2, 2, P.ink); }
    if (tier >= 2 && kind !== "hero") {
      plate(-rad - 2, -4, 5, 13, P.shade); plate(rad - 3, -4, 5, 13, P.shade);
      r(-rad - 1, -1, 2, 3, P.brass); r(rad - 2, -1, 2, 3, P.brass);
    }
    switch (kind) {
      case "machinegun": {
        const ap = branch === "ap", n = branch === "gatling" ? 5 : ap ? 2 : tier + 1;
        const step = ap ? 7 : 5, top = ap ? -31 : -23 - tier;
        plate(-9, -9, 18, 17, P.shade);
        for (let i = 0; i < n; i++) barrel(Math.round((i - (n - 1) / 2) * step) - 2, top, ap ? 5 : 4, -4, tier);
        plate(-8, -6, 16, 9, P.iron); r(-5, -4, 10, 2, P.brass);
        if (tier >= 2) { ring(-13, 5, 5); r(-14, 2, 2, 6, P.gold); }
        if (tier >= 3) { ring(13, 5, 5); r(12, 2, 2, 6, P.gold); }
        break;
      }
      case "railgun": {
        const top = branch === "siege" ? -38 : -31 - tier, gap = branch === "super" ? 8 : 6;
        plate(-8, -15, 16, 25, P.shade);
        for (const x of [-gap - 3, gap - 1]) {
          barrel(x, top, 4, -4, 0); r(x + 1, top + 3, 1, -top - 8, P.blue);
          for (let y = -19; y > top + 3; y -= 6) { r(x - 1, y, 6, 2, P.brass); r(x, y, 4, 1, P.gold); }
        }
        plate(-5, -10, 10, 14, P.iron); r(-2, -8, 4, 7, P.black); r(-1, -7, 2, 4, P.blue);
        if (tier >= 2) { fin(-14, -9, 5, 5); fin(10, -9, 5, 5); }
        if (tier >= 3) { tank(-12, 5, 11, P.shade); tank(5, 5, 11, P.shade); }
        if (branch === "super") { r(-13, -17, 26, 3, P.ink); r(-12, -16, 24, 1, P.blue); }
        if (branch === "siege") { plate(-11, -26, 22, 4, P.brass); r(-3, -25, 6, 2, P.black); }
        break;
      }
      case "sniper": {
        const top = branch === "apshell" ? -39 : -33 - tier;
        barrel(-2, top, 5, -2, tier >= 2 ? 2 : 1); plate(-5, -7, 11, 17, P.shade);
        // An offset scope is the persistent identifier, separate from the long single barrel.
        plate(5, -22, 5, 17, P.iron); r(6, -22, 3, 2, P.black); r(6, -20, 2, 2, P.blue);
        r(1, -17, 5, 2, P.brass); r(1, -8, 5, 2, P.brass);
        if (tier >= 2) { plate(-11, 0, 6, 11, P.brass); r(-10, 3, 4, 1, P.ink); r(-10, 6, 4, 1, P.ink); }
        if (tier >= 3) { r(-13, -14, 26, 3, P.ink); r(-12, -14, 24, 1, P.steel); r(-13, -17, 3, 6, P.brass); r(10, -17, 3, 6, P.brass); }
        if (branch === "rapid") { ring(-12, 5, 6); r(-13, 1, 2, 8, P.gold); }
        if (branch === "apshell") plate(-4, -35, 9, 5, P.brass);
        break;
      }
      case "cannon": case "hero": {
        const hero = kind === "hero", ap = branch === "apcannon";
        const w = hero ? 10 : branch === "he" ? 16 : 10 + tier * 2;
        const top = hero ? -29 : ap ? -37 : -26 - tier;
        barrel(-w / 2, top, w, -1, hero ? 2 : tier);
        plate(-10, -6, 20, 16, hero ? P.brass : P.shade);
        plate(-7, -4, 14, 10, hero ? P.red : P.iron);
        r(-4, -2, 8, 2, P.gold); r(-2, 2, 4, 3, P.shade);
        if (tier >= 2 && !hero) { barrel(-14, -17, 4, 5); barrel(10, -17, 4, 5); }
        if (tier >= 3 && !hero) { plate(-16, 6, 9, 8, P.brass); plate(7, 6, 9, 8, P.brass); }
        if (branch === "he") { plate(-10, -30, 20, 6, P.brass); r(-7, -30, 14, 3, P.black); }
        if (hero) { r(-12, -8, 3, 15, P.brass); r(9, -8, 3, 15, P.brass); r(-10, 11, 20, 2, P.brass); }
        break;
      }
      case "mortar": {
        const cluster = branch === "cluster", radius = branch === "bunker" ? 12 : 7 + tier;
        r(-13, -9, 26, 4, P.ink); r(-12, -9, 24, 2, P.steel);
        plate(-8, 1, 16, 13, P.shade);
        if (tier >= 2) { r(-15, 9, 30, 3, P.ink); r(-14, 9, 28, 1, P.brass); }
        if (cluster) { for (const x of [-7, 7]) for (const y of [-14, -1]) { ring(x, y, 7); disc(x, y - 1, 4, P.black); r(x - 2, y - 5, 4, 1, P.steel); } }
        else { ring(0, -9, radius, P.iron); disc(0, -10, radius - 3, P.black); r(-4, -9 - radius + 1, 8, 2, P.light); r(-radius + 3, -10, 2, 5, P.shade); }
        if (tier >= 3) { plate(-17, -6, 5, 14, P.brass); plate(12, -6, 5, 14, P.brass); }
        break;
      }
      case "flamer": {
        const storm = branch === "storm", narrow = branch === "nozzle";
        tank(-12, -1, 18 + tier, P.red); tank(5, -1, 18 + tier, P.red);
        r(-8, -7, 16, 4, P.ink); r(-7, -7, 14, 2, P.brass);
        barrel(-4, narrow ? -35 : -26, 8, 1, tier); plate(-7, -4, 14, 10, P.shade);
        if (storm) { for (const x of [-11, 4]) barrel(x, -23, 7, -7, 1); r(-12, -24, 24, 3, P.ink); r(-11, -23, 22, 1, P.amber); }
        else { plate(narrow ? -3 : -6, narrow ? -35 : -27, narrow ? 6 : 12, 6, P.brass); r(narrow ? -2 : -4, narrow ? -35 : -27, narrow ? 4 : 8, 2, P.black); }
        if (tier >= 2) { r(6, -15, 6, 3, P.ink); r(8, -17, 3, 5, P.brass); r(9, -17, 1, 2, P.amber); }
        if (tier >= 3) { tank(-16, -15, 12, P.brass); tank(9, -15, 12, P.brass); }
        break;
      }
      case "tesla": {
        plate(-9, -5, 18, 16, P.shade); r(-5, 6, 10, 2, P.brass);
        if (tier >= 2) { coil(-11, -10, 19); coil(11, -10, 19); }
        coil(0, branch === "focus" ? -33 : -24 - tier, 32);
        if (tier >= 3) { r(-16, -22, 33, 3, P.ink); r(-15, -21, 31, 1, P.blue); disc(-16, -21, 3, P.steel); disc(16, -21, 3, P.steel); }
        if (branch === "arcstorm") { coil(-15, -21, 20); coil(15, -21, 20); }
        if (branch === "focus") { ring(0, -32, 7, P.steel); disc(0, -32, 3, P.blue); r(-1, -40, 3, 7, P.ink); r(0, -39, 1, 6, P.light); }
        break;
      }
      case "missile": {
        // Upright exposed warheads and fins; MLRS instead has a closed rectangular tube bank.
        plate(-12, -8, 24, 18, P.shade);
        const heavy = branch === "heavy", top = branch === "long" ? -36 : -28;
        rocket(-11, top, 8, 34, heavy); rocket(3, top, 8, 34, heavy);
        if (tier >= 2) { r(-15, -9, 30, 3, P.ink); r(-14, -9, 28, 1, P.gold); }
        if (tier >= 3) { rocket(-4, -33, 8, 39, heavy); plate(-16, 7, 32, 6, P.brass); }
        if (heavy) { plate(-15, -21, 6, 12, P.red); plate(9, -21, 6, 12, P.red); }
        break;
      }
      case "mlrs": {
        const precision = branch === "precision", cols = branch === "saturate" ? 5 : tier + 2;
        const w = cols * 6 + 2;
        plate(-w / 2, -22, w, 28, P.shade); r(-w / 2 + 1, -8, w - 2, 3, P.brass);
        if (precision) {
          for (const x of [-10, 2]) { plate(x, -28, 8, 29, P.iron); ring(x + 4, -25, 4, P.brass); disc(x + 4, -25, 2, P.black); }
        } else {
          for (let i = 0; i < cols; i++) {
            const x = -w / 2 + 2 + i * 6;
            plate(x, -21, 5, 21, P.iron); r(x + 1, -19, 3, 4, P.black); r(x + 1, -10, 3, 4, P.black); r(x + 1, -3, 3, 2, P.brass);
          }
        }
        if (tier >= 2) { plate(-w / 2 - 2, 5, 7, 9, P.brass); plate(w / 2 - 5, 5, 7, 9, P.brass); }
        if (tier >= 3) { r(-w / 2 + 1, -25, w - 2, 3, P.ink); r(-w / 2 + 2, -24, w - 4, 1, P.steel); }
        break;
      }
      case "laser": {
        plate(-8, -13, 16, 24, P.shade); fin(-13, -10, 5, 5); fin(9, -10, 5, 5);
        barrel(-4, -25 - tier * 2, 9, -4, 1); r(-2, -21, 4, 13, P.blue);
        ring(0, -25 - tier * 2, tier + 5, P.brass); disc(0, -25 - tier * 2, tier + 2, P.black); disc(0, -26 - tier * 2, tier, P.white);
        if (tier >= 2) { tank(-8, 5, 13, P.shade); tank(1, 5, 13, P.shade); }
        if (tier >= 3) { plate(-16, -18, 6, 13, P.iron); plate(10, -18, 6, 13, P.iron); r(-14, -16, 2, 7, P.blue); r(12, -16, 2, 7, P.blue); }
        if (branch === "scatter") { for (const x of [-12, 12]) { ring(x, -22, 5, P.brass); disc(x, -23, 2, P.white); } }
        if (branch === "beam") { r(-7, -37, 3, 12, P.ink); r(5, -37, 3, 12, P.ink); r(-6, -36, 1, 10, P.steel); r(6, -36, 1, 10, P.steel); }
        break;
      }
      case "incendiary": {
        // A squat chemical bomb thrower, with a lobbed-shell cup and a rear reservoir.
        tank(-12, -2, 19, P.red); tank(5, -2, 19, P.red);
        plate(-9, -19, 18, 19, P.brass); ring(0, -20, 8, P.iron); disc(0, -21, 5, P.black);
        r(-3, -20, 6, 3, P.rust); r(-2, -20, 4, 1, P.amber);
        if (tier >= 2) { plate(-14, -14, 6, 12, P.brass); plate(8, -14, 6, 12, P.brass); }
        if (tier >= 3) { tank(-4, 1, 22, P.red); r(-3, 5, 5, 8, P.ink); r(-2, 6, 3, 5, P.amber); }
        if (branch === "wp") { ring(-9, -22, 6, P.brass); ring(9, -22, 6, P.brass); disc(-9, -23, 3, P.white); disc(9, -23, 3, P.white); }
        if (branch === "napalm") { barrel(-4, -33, 8, -18, 2); r(-3, -27, 6, 3, P.red); }
        break;
      }
      case "flak": {
        const n = tier >= 3 ? 4 : 2, step = n === 4 ? 7 : 15, top = branch === "burst" ? -35 : -29;
        plate(-11, -4, 22, 14, P.shade);
        for (let i = 0; i < n; i++) { const x = Math.round((i - (n - 1) / 2) * step) - 2; barrel(x, top, 5, -2, tier); if (branch === "prox") plate(x - 1, top, 7, 6, P.brass); }
        r(-14, -12, 28, 3, P.ink); r(-13, -12, 26, 1, P.steel);
        if (tier >= 2) { ring(-14, 5, 5); ring(14, 5, 5); }
        // Elevated AA ring sight, with daylight through its center.
        ring(0, -20, 5, P.steel); disc(0, -20, 3, P.black); r(0, -26, 1, 4, P.gold); r(-6, -20, 4, 1, P.gold); r(3, -20, 4, 1, P.gold);
        break;
      }
    }
    // Small fixed chips on the mount, never randomized or used as tier/branch encoding.
    r(-5, 9, 2, 1, P.rust); r(5, 7, 2, 1, P.steel);
  }
  const mask = document.createElement("canvas"); mask.width = mask.height = SIZE;
  const m = mask.getContext("2d")!; m.drawImage(image, 0, 0); m.globalCompositeOperation = "source-in"; m.fillStyle = P.ink; m.fillRect(0, 0, SIZE, SIZE);
  bakes++;
  return { image, mask, maskColor: P.ink };
}

function artOf(kind: string, tier: number, branch: string | null): PixelArt {
  const t = kind === "hero" || kind === "locomotive" ? 1 : Math.max(1, Math.min(3, Math.floor(tier) || 1));
  const fork = t === 3 && BRANCHES[kind]?.some(b => b.id === branch) ? branch : null;
  const key = `${kind}:${t}:${fork ?? "base"}`;
  let art = cache.get(key);
  if (!art) { art = bake(kind, t, fork); cache.set(key, art); }
  return art;
}

export function drawWeaponArt(
  ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, height: number, rot: number,
  tier = 1, branch: string | null = null, outline?: { color: string; px: number; alpha: number }
): boolean {
  if (!kinds.has(kind) && kind !== "locomotive") return false;
  const art = artOf(kind, tier, branch), scale = height / UNIT;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false;
  if (outline) {
    if (art.maskColor !== outline.color) {
      const m = art.mask.getContext("2d")!;
      m.fillStyle = outline.color; m.fillRect(0, 0, SIZE, SIZE); art.maskColor = outline.color;
    }
    ctx.save();
    ctx.globalAlpha *= outline.alpha;
    const d = outline.px / scale;
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d]]) ctx.drawImage(art.mask, -CX + dx, -CY + dy);
    ctx.restore();
  }
  ctx.drawImage(art.image, -CX, -CY); ctx.restore();
  return true;
}
