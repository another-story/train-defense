import { ENEMY_STATS } from "./balance";

/** Authored 64px poses. Joints and contours are redrawn per key, never cut from a still. */
export const AUTHORED_ENEMIES = ["zombie", "hound", "archer", "ogre", "shield_orc", "shield_bearer", "swamp_crawler", "necromancer", "slime"] as const;
type ArtKind = typeof AUTHORED_ENEMIES[number];
type Point = [number, number];
const ink = "#191d20", seam = "#303233";
const artKinds = new Set<string>(AUTHORED_ENEMIES);

export function authoredEnemyKind(name: string): ArtKind | null {
  const base = name.replace(/^undead:/, "");
  if (artKinds.has(base)) return base as ArtKind;
  const st = ENEMY_STATS[base];
  const parent = st?.palette?.of ?? st?.sprite;
  return parent && parent !== base ? authoredEnemyKind(parent) : null;
}

/** Shared upper-left light, one-pixel dark contour and opaque integer pixel clusters. */
export function makeEnemyArt(kind: ArtKind, frame: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const line = (a: Point, b: Point, color: string, width = 1) => {
    let x = Math.round(a[0]), y = Math.round(a[1]);
    const tx = Math.round(b[0]), ty = Math.round(b[1]), dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1; let err = dx + dy;
    for (;;) {
      rect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width, color);
      if (x === tx && y === ty) break;
      const e = err * 2; if (e >= dy) { err += dy; x += sx; } if (e <= dx) { err += dx; y += sy; }
    }
  };
  const poly = (points: Point[], color: string, border = true) => {
    const ymin = Math.ceil(Math.min(...points.map(p => p[1]))), ymax = Math.floor(Math.max(...points.map(p => p[1])));
    for (let y = ymin; y <= ymax; y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
    }
    if (border) points.forEach((p, i) => line(p, points[(i + 1) % points.length], ink));
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))));
      rect(x - half, y + dy, half * 2 + 1, 1, color);
    }
  };
  const limb = (a: Point, joint: Point, end: Point, width: number, color: string, light: string) => {
    line(a, joint, ink, width + 2); line(joint, end, ink, width + 2);
    line(a, joint, color, width); line(joint, end, color, width);
    line([a[0] - 1, a[1]], [joint[0] - 1, joint[1]], light, Math.max(1, width - 2));
  };
  const boot = (p: Point, color = "#343936") => { poly([[p[0] - 3, p[1] - 2], [p[0] + 2, p[1] - 2], [p[0] + 4, p[1]], [p[0] + 4, p[1] + 2], [p[0] - 3, p[1] + 2]], color); rect(p[0] - 2, p[1] - 1, 3, 1, "#697064"); };
  const phase = frame >= 1 && frame <= 8 ? frame - 1 : 0;
  const walking = frame >= 1 && frame <= 8;
  const step = walking ? [0, 2, 4, 2, 0, -2, -4, -2][phase] : 0;
  const lift = walking ? [0, 1, 2, 1, 0, 0, 0, 0][phase] : 0;
  const wind = frame === 9 || frame === 10, strike = frame === 11, follow = frame === 12, recover = frame === 13;

  if (kind === "slime") {
    // Each contact key has its own asymmetric belly, leading pseudopod and face.
    const shapes: Point[][] = [
      [[8, 51], [10, 35], [16, 24], [27, 20], [38, 23], [44, 33], [48, 45], [56, 50], [54, 57], [14, 58]],
      [[5, 51], [12, 38], [20, 32], [36, 33], [44, 43], [58, 49], [58, 56], [8, 58]],
      [[11, 53], [13, 32], [22, 16], [33, 14], [41, 22], [43, 40], [50, 51], [49, 57], [14, 58]],
      [[5, 54], [9, 40], [19, 33], [35, 31], [43, 37], [54, 42], [61, 48], [60, 54], [45, 57], [9, 58]],
    ];
    const shape = wind ? 1 : strike ? 3 : follow ? 2 : walking ? [0, 1, 1, 2, 2, 0, 3, 0][phase] : 0;
    poly(shapes[shape], "#2b7189");
    const fy = shape === 1 ? 42 : shape === 2 ? 30 : 37, fx = shape === 3 ? 38 : 26;
    poly([[13, 49], [15, fy - 9], [23, fy - 15], [32, fy - 14], [37, fy - 9], [35, fy - 4], [23, fy - 1], [19, 49]], "#4e9aa7", false);
    line([15, 54], [47, 54], "#205168", 3); rect(19, fy - 10, 6, 3, "#92c4b8"); rect(17, fy - 6, 3, 3, "#76b4b3");
    rect(fx, fy, 3, 4, ink); rect(fx + 10, fy - 1, 3, 4, ink); rect(fx + 4, fy + 7, 7, 2, "#214252");
    rect(43, 48, 3, 2, "#68a0a4"); return canvas;
  }

  if (kind === "hound") {
    const crouch = wind ? 5 : 0, leap = strike || follow;
    const back: Point = [19, 36 + crouch], front: Point = [39 + (strike ? 3 : 0), 35 + crouch];
    if (leap) {
      limb([20, 40], [14, 41], [10, 38], 4, "#77594d", "#ab8870");
      limb([36, 40], [47, 36], [55, 33], 4, "#77594d", "#ab8870");
    } else {
      limb([20, 40], [16 - step, 47], [14 - step, 55 - lift], 4, "#77594d", "#ab8870");
      limb([36, 40], [39 + step, 48], [43 + step, 55], 4, "#77594d", "#ab8870");
    }
    if (leap) { limb([19, 39], [10, 45], [6, 48], 4, "#987461", "#c9a080"); limb([40, 37], [49, 44], [57, 43], 4, "#987461", "#c9a080"); }
    else { limb([23, 43], [26 + step, 48], [25 + step, 57], 4, "#987461", "#c9a080"); limb([40, 40], [40 - step, 50 - lift], [43 - step, 57 - lift], 4, "#987461", "#c9a080"); }
    line([back[0], back[1]], [10, 29 + crouch], ink, 4); line([11, 30 + crouch], [8, 20 + crouch], "#ae896b", 2);
    poly([[13, 32 + crouch], [22, 27 + crouch], [36, 28 + crouch], [45, 35 + crouch], [39, 44 + crouch], [23, 45 + crouch], [15, 41 + crouch]], "#96735e");
    poly([[15, 33 + crouch], [24, 29 + crouch], [36, 31 + crouch], [35, 35 + crouch], [22, 37 + crouch]], "#c29d7c", false);
    line([19, 38 + crouch], [29, 39 + crouch], "#57483f", 2);
    const hx = front[0] + (leap ? 7 : 1), hy = 26 + crouch + (leap ? 3 : 0);
    poly([[hx - 8, hy - 4], [hx - 7, hy - 12], [hx - 2, hy - 8], [hx + 4, hy - 9], [hx + 8, hy - 14], [hx + 9, hy - 3], [hx + 11, hy + 8], [hx + 7, hy + 14], [hx - 3, hy + 13], [hx - 9, hy + 5]], "#a38068");
    poly([[hx - 4, hy - 6], [hx + 3, hy - 6], [hx + 7, hy + 4], [hx + 5, hy + 9], [hx - 3, hy + 7]], "#d1b394", false);
    poly([[hx + 3, hy + 4], [hx + 10, hy + 4], [hx + 13, hy + 8], [hx + 11, hy + 12], [hx + 3, hy + 11]], "#c8aa89");
    rect(hx + 10, hy + 6, 3, 3, ink);
    line([hx - 5, hy - 8], [hx - 5, hy - 4], "#6c4c41", 2);
    rect(hx - 5, hy + 1, 3, 2, "#c47547"); rect(hx + 5, hy, 3, 2, "#c47547"); rect(hx, hy + 7, 6, 3, ink);
    if (leap) { poly([[hx - 1, hy + 10], [hx + 8, hy + 10], [hx + 6, hy + 16], [hx, hy + 16]], "#653c39"); rect(hx, hy + 11, 2, 3, "#d8c9a7"); rect(hx + 5, hy + 11, 2, 3, "#d8c9a7"); }
    return canvas;
  }

  if (kind === "swamp_crawler") {
    const reach = strike ? 6 : follow ? 3 : wind ? -3 : 0;
    // Alternating tripods lift one knee while the opposite feet retain ground contact.
    for (let i = 0; i < 3; i++) {
      const sy = 29 + i * 9, shift = walking ? (i % 2 ? -step : step) : 0;
      limb([22, sy], [12 + shift, sy + 1], [7 + shift, sy + 10 - (i === 0 ? lift : 0)], 3, "#6d6936", "#a49c54");
      limb([42, sy], [51 - shift, sy + 1], [57 - shift, sy + 10 - (i === 1 ? lift : 0)], 3, "#6d6936", "#a49c54");
    }
    poly([[20, 16], [30, 11], [41, 16], [48, 29], [44, 44], [34, 48], [21, 43], [15, 29]], "#74733c");
    poly([[20, 23], [24, 17], [32, 15], [38, 18], [32, 24], [25, 34], [19, 32]], "#aaa265", false);
    line([31, 18], [33, 40], "#545733", 2); line([18, 30], [28, 27], "#b3aa69");
    for (const [x, y] of [[24, 23], [39, 27], [23, 36], [37, 37]]) rect(x, y, 3, 2, "#c0b573");
    const hy = 44 + reach;
    poly([[21, hy - 7], [30, hy - 10], [42, hy - 7], [44, hy + 1], [38, hy + 8], [25, hy + 8], [19, hy + 2]], "#898246");
    rect(24, hy - 2, 5, 4, ink); rect(36, hy - 2, 5, 4, ink); rect(25, hy - 2, 2, 2, "#dbc37c"); rect(37, hy - 2, 2, 2, "#dbc37c");
    limb([25, hy + 3], [20 - reach / 2, hy + 6], [26, hy + 10], 2, "#c8b27a", "#e0c896");
    limb([39, hy + 3], [44 + reach / 2, hy + 6], [37, hy + 10], 2, "#c8b27a", "#e0c896");
    return canvas;
  }

  const ogre = kind === "ogre", caster = kind === "necromancer", archer = kind === "archer";
  const shield = kind === "shield_orc" || kind === "shield_bearer";
  const skin = ogre ? "#82969a" : caster ? "#a7aa9e" : archer ? "#83a25e" : "#8ca273";
  const skinHi = ogre ? "#b0bfc0" : caster ? "#d0cfc0" : "#bbc792";
  const skinShade = ogre ? "#52696f" : "#546248";
  const lean = strike ? 3 : follow ? 2 : recover ? 1 : wind ? -2 : 0;
  const x = 31 + lean, torsoY = ogre ? 27 : 29;
  const leftFoot: Point = [x - (ogre ? 11 : 6) + step, 57 - lift];
  const rightFoot: Point = [x + (ogre ? 10 : 6) - step, 57];
  const cloth = caster ? "#544663" : archer ? "#655b3f" : ogre ? "#635a47" : shield ? "#65534a" : "#665b50";
  if (!caster) {
    limb([x - 5, 41], [x - 8 + step, 48], leftFoot, ogre ? 7 : 4, cloth, "#8e8065");
    limb([x + 5, 41], [x + 7 - step, 49 - lift], rightFoot, ogre ? 7 : 4, cloth, "#8e8065");
    boot(leftFoot); boot(rightFoot);
  }
  // Far arm is deliberately drawn behind the torso; the near hand comes back over weapons.
  const shoulderL: Point = [x - (ogre ? 14 : 7), torsoY - 2];
  const shoulderR: Point = [x + (ogre ? 14 : 7), torsoY - 2];
  let elbowL: Point = [x - 12 - step / 2, 37], handL: Point = [x - 12 - step / 2, 44];
  let elbowR: Point = [x + 12 + step / 2, 36], handR: Point = [x + 12 + step / 2, 43];
  if (wind) { elbowR = [x + 14, 21]; handR = [x + 9, frame === 10 ? 8 : 16]; }
  if (recover) { elbowR = [x + 13, 34]; handR = [x + 16, 44]; }
  if (strike || follow) { elbowL = [x - 3, 33]; handL = [x + 10, 30]; elbowR = [x + 15, 29]; handR = [x + 24, strike ? 29 : 36]; }
  if (kind === "zombie") {
    if (wind) { elbowR = [x + 13, 32]; handR = [x + 9, 25]; }
    if (strike || follow) { elbowL = [x + 3, 36]; handL = [x + 19, 35]; }
  }
  if (archer) {
    // Bow hand extends, drawing hand retracts to the cheek, then opens on release.
    elbowR = [x + 12, 31]; handR = [x + 20, 30];
    elbowL = [x - (wind ? 12 : 3), wind ? 25 : 35]; handL = [x + (wind ? -3 : strike ? 12 : 7), wind ? 26 : 32];
  }
  if (caster) {
    elbowL = [x - 13, wind ? 21 : strike ? 25 : 38]; handL = [x - 13, wind ? 10 : strike ? 15 : 39];
    elbowR = [x + 13, wind ? 21 : strike ? 24 : 36]; handR = [x + (strike ? 22 : 13), wind ? 10 : strike ? 23 : 34];
  }
  limb(shoulderL, elbowL, handL, ogre ? 7 : 4, skinShade, skin);
  if (caster) {
    poly([[x - 8, 24], [x + 8, 24], [x + 11, 43], [x + 17 - step / 2, 58], [x + 5, 57], [x, 59], [x - 16 + step / 2, 58], [x - 10, 42]], cloth);
    poly([[x - 6, 27], [x - 3, 28], [x - 4, 52], [x - 9, 57]], "#80718d", false);
    poly([[x + 2, 30], [x + 5, 32], [x + 10, 57], [x + 4, 55]], "#383540", false);
    line([x, 30], [x - 1, 55], "#b3a174");
  } else {
    poly([[x - (ogre ? 11 : 8), torsoY - 5], [x + (ogre ? 10 : 7), torsoY - 5], [x + (ogre ? 13 : 9), 37], [x + 7, 45], [x - 8, 44], [x - (ogre ? 13 : 9), 36]], ogre ? skin : cloth);
    poly([[x - 8, torsoY - 3], [x - 2, torsoY - 3], [x, 39], [x - 5, 39]], ogre ? skinHi : "#92846a", false);
    if (ogre) {
      line([x + 2, 30], [x + 9, 29], skinShade, 2); line([x - 6, 36], [x + 7, 36], skinShade);
      poly([[x - 12, 26], [x - 8, 24], [x - 5, 30], [x - 7, 34], [x - 11, 32]], "#a4b2b0", false);
      rect(x - 8, 39, 17, 3, "#4f4d40"); rect(x - 1, 39, 4, 3, "#a99868");
      poly([[x - 8, 43], [x + 7, 43], [x + 9, 48], [x + 4, 47], [x, 50], [x - 3, 47], [x - 8, 49]], "#756751");
    }
    else { line([x - 6, 33], [x + 5, 37], "#3c4337", 2); rect(x - 7, 42, 15, 3, "#34332e"); rect(x + 1, 42, 3, 3, "#baa56e"); }
  }
  limb(shoulderR, elbowR, handR, ogre ? 8 : 4, skin, skinHi);
  const hx = x + (strike ? 2 : 0), hy = ogre ? 17 : 15;
  if (archer || caster) {
    poly([[hx - 10, hy + 8], [hx - 8, hy - 7], [hx - 1, hy - 12], [hx + 7, hy - 8], [hx + 10, hy + 6], [hx + 4, hy + 13], [hx - 7, hy + 12]], caster ? "#635471" : "#6c6849");
    poly([[hx - 7, hy - 3], [hx, hy - 8], [hx + 4, hy - 6], [hx - 2, hy - 2], [hx - 5, hy + 7]], caster ? "#93819b" : "#99946a", false);
  }
  if (archer || shield) {
    poly([[hx - 7, hy], [hx - 13, hy - 4], [hx - 11, hy + 3], [hx - 6, hy + 5]], skin);
    poly([[hx + 5, hy], [hx + 12, hy - 3], [hx + 10, hy + 3], [hx + 5, hy + 5]], skin);
  }
  poly([[hx - 7, hy - 4], [hx + 5, hy - 5], [hx + 8, hy], [hx + 7, hy + 9], [hx + 2, hy + 12], [hx - 6, hy + 9], [hx - 8, hy + 3]], skin);
  poly([[hx - 6, hy - 3], [hx + 3, hy - 3], [hx + 3, hy + 1], [hx - 5, hy + 2]], skinHi, false);
  rect(hx - 5, hy + 3, 4, 2, ink); rect(hx + 3, hy + 2, 4, 2, ink);
  rect(hx - 4, hy + 3, 1, 1, "#d8c382"); rect(hx + 4, hy + 2, 1, 1, "#d8c382");
  line([hx + 1, hy + 4], [hx + 2, hy + 7], skinShade); rect(hx - 2, hy + 9, 7, 2, ink); rect(hx - 1, hy + 9, 2, 1, "#d5ccb0");
  if (caster) {
    rect(hx - 5, hy + 2, 4, 3, "#363b3a"); rect(hx + 3, hy + 1, 4, 3, "#363b3a");
    rect(hx, hy + 6, 2, 2, "#565d54");
    for (let tooth = 0; tooth < 3; tooth++) rect(hx - 1 + tooth * 2, hy + 10, 1, 2, "#d0cfc0");
  }
  if (ogre) {
    rect(hx - 3, hy + 8, 2, 3, "#ded4bb"); rect(hx + 4, hy + 7, 2, 4, "#ded4bb");
    // Club changes from overhead anticipation to a lateral swing and a low follow-through.
    const end: Point = wind ? [handR[0] - 17, 6] : strike ? [59, 20] : follow ? [57, 48] : recover ? [20, 48] : [12, 30];
    line(handR, end, ink, 7); line(handR, end, "#735a3d", 5); line([handR[0], handR[1] - 1], [end[0], end[1] - 1], "#b09566", 2);
    oval(end[0], end[1], 4, 5, ink); oval(end[0] - 1, end[1] - 1, 3, 4, "#94764d"); rect(end[0] - 2, end[1] - 2, 2, 2, "#c1a579"); rect(end[0] + 1, end[1] + 1, 2, 2, "#a9aaa0");
    rect(handR[0] - 2, handR[1] - 2, 5, 4, skinHi);
  } else if (archer) {
    const bx = handR[0] + 2, by = 30, bend = wind ? 6 : strike ? 1 : 4;
    line([bx - bend, by - 15], [bx + 3, by - 8], ink, 3); line([bx + 3, by - 8], [bx + 3, by + 8], ink, 3); line([bx + 3, by + 8], [bx - bend, by + 15], ink, 3);
    line([bx - bend, by - 15], [bx + 2, by - 7], "#b79862"); line([bx + 2, by - 7], [bx + 2, by + 7], "#b79862"); line([bx + 2, by + 7], [bx - bend, by + 15], "#b79862");
    const pull: Point = wind ? handL : [bx, by]; line([bx - bend, by - 15], pull, "#c6bda1"); line(pull, [bx - bend, by + 15], "#c6bda1");
    if (!strike && !follow) { line(handL, [60, by], "#c7b38d"); poly([[61, by], [57, by - 2], [57, by + 2]], "#afbabb", false); }
    if (strike) { rect(handL[0], handL[1] - 2, 5, 1, skinHi); rect(handL[0] + 1, handL[1] + 1, 5, 1, skinHi); }
  } else if (shield) {
    const bx = x + (strike ? 16 : wind ? 4 : 9), by = wind ? 33 : 34;
    poly([[bx - 9, by - 14], [bx + 10, by - 12], [bx + 11, by + 8], [bx + 2, by + 18], [bx - 10, by + 9]], kind === "shield_bearer" ? "#6d566b" : "#75674f");
    poly([[bx - 7, by - 11], [bx - 2, by - 11], [bx - 3, by + 12], [bx - 8, by + 7]], "#a6a294", false);
    line([bx + 6, by - 9], [bx + 7, by + 7], "#b0aea0", 2); line([bx - 7, by - 11], [bx + 7, by - 9], "#c3be9c", 2);
    oval(bx, by + 1, 4, 4, ink); oval(bx - 1, by, 3, 3, "#b4b2a0");
    for (const yy of [-6, 7]) rect(bx + 6, by + yy, 2, 2, "#ddd2aa");
    if (kind === "shield_bearer") { rect(x - 13, 25, 5, 16, seam); rect(x - 12, 23, 3, 4, "#af87a4"); rect(x - 12, 29, 2, 8, "#775b77"); }
  } else if (caster) {
    const sx = handL[0]; line([sx, 13], [sx, 57], ink, 4); line([sx - 1, 14], [sx - 1, 56], "#8d8065", 2);
    poly([[sx - 4, 12], [sx - 4, 6], [sx, 2], [sx + 4, 6], [sx + 4, 12], [sx, 15]], "#7d9481"); rect(sx - 2, 6, 3, 5, "#b5c1a0");
    if (wind || strike || follow) {
      const ox = handR[0] + 1, oy = handR[1] - 5;
      poly([[ox - 5, oy], [ox, oy - 5], [ox + 5, oy], [ox, oy + 5]], "#648c83"); rect(ox - 1, oy - 2, 3, 3, "#b9c9a8");
      if (strike) { rect(ox - 8, oy - 3, 2, 2, "#c4c4a0"); rect(ox + 6, oy + 3, 2, 2, "#c4c4a0"); }
    }
  } else {
    // Torn sleeve, exposed wrist and separated fingers make the zombie's reach readable.
    rect(x - 7, 29, 4, 5, "#7a8060"); rect(x + 3, 38, 4, 3, "#8c7459");
    for (let i = 0; i < 3; i++) line([handR[0] + i - 1, handR[1]], [handR[0] + i + (strike ? 3 : 0), handR[1] + (strike ? 1 : 4)], skinHi);
    rect(hx - 5, hy - 6, 8, 2, "#4a5142");
  }
  return canvas;
}
