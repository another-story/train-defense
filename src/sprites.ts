// public/sprites/manifest.json (tools/slice.mjs 산출물)을 읽어 이미지로 올린다.
// 앵커는 전부 중심(2D 탑다운) — draw()가 중심 기준으로 그린다.

import { CAR_KINDS, ENEMY_STATS, NECRO, RENDER } from "./balance";
import { enemyRigParts, type EnemyMotionProfile } from "./enemy-motion";
import { AUTHORED_ENEMIES, authoredEnemyKind, makeEnemyArt } from "./enemy-art";

export type SpriteMeta = {
  file: string;
  w: number;
  h: number;
  anchor: { x: number; y: number };
  sheet: string;
  src: { x: number; y: number; w: number; h: number };
};

// 원본 셀은 <img>지만 **팔레트 스왑 변종**은 구운 캔버스다(아래 bakePalettes). drawImage는 둘 다 받는다
export type Sprite = SpriteMeta & { img: HTMLImageElement | HTMLCanvasElement };

const loaded = new Map<string, Sprite>();
export const failed: string[] = [];

export async function loadSprites(): Promise<Map<string, Sprite>> {
  const res = await fetch("sprites/manifest.json");
  const manifest = (await res.json()) as { sprites: Record<string, SpriteMeta> };
  await Promise.all(
    Object.entries(manifest.sprites).map(async ([name, meta]) => {
      const img = new Image();
      img.src = `sprites/${meta.file}`;
      try {
        await img.decode();
        loaded.set(name, { ...meta, img });
      } catch {
        failed.push(name);
      }
    })
  );
  for (const kind of AUTHORED_ENEMIES) {
    const base = loaded.get(kind);
    if (base) loaded.set(kind, { ...base, img: makeEnemyArt(kind, 0), w: 64, h: 64, anchor: { x: 0.5, y: 0.5 }, sheet: "authored-enemy-v3" });
  }
  normalizeEnemyPixels();
  bakePalettes();
  return loaded;
}

/** **팔레트 스왑 변종을 굽는다** (DESIGN §8 증원 방침 · balance.ts `ENEMY_STATS.palette`).
 * 원본 셀의 픽셀을 HSL로 옮겨 색상환을 돌리고 채도·명도를 곱한 사본을 만들어 **변종 이름으로 등록**한다.
 * 등록해 두면 draw·drawOutline·drawFlash·시체가 전부 «이름 하나»만 보므로 호출부에 분기가 안 생긴다.
 *
 * **왜 `sprite: "원본"` + 그릴 때 색을 먹이는 방식이 아닌가**: 그러면 tint 캐시 키가 원본과 같아져
 * 원본과 변종이 한 화면에 있을 때 먼저 그린 쪽 색이 둘 다에 남는다. 굽기는 로드 때 한 번뿐이라
 * 프레임 비용도 0이다(tintOf·silhouetteOf와 같은 규약). */
function bakePalettes(): void {
  for (const [kind, st] of Object.entries(ENEMY_STATS)) {
    const p = st.palette;
    if (!p) continue;
    if (!bakeTint(ENEMY_STATS[p.of]?.sprite ?? p.of, kind, p.hue, p.sat, p.light)) failed.push(kind);
  }
}

/** 원본 셀을 HSL로 옮겨 **한 벌 더 구워 새 이름으로 등록한다**. `bakePalettes`(로드 때 전 종)와
 * `undeadName`(첫 부활 때 그 종만)이 함께 쓰는 한 곳이다 — 굽는 규약이 두 벌이 되면 변종과
 * 부활체의 색이 서로 다른 식으로 흐른다. 원본이 아직 안 올라왔으면 false를 돌려준다 */
function bakeTint(baseName: string, outName: string, hue: number, sat: number, light: number): boolean {
  const base = loaded.get(baseName);
  if (!base) return false;
  const c = document.createElement("canvas");
  c.width = base.w;
  c.height = base.h;
  const g = c.getContext("2d")!;
  g.drawImage(base.img, 0, 0, base.w, base.h);
  shiftPalette(c, hue, sat, light);
  loaded.set(outName, { ...base, img: c });
  return true;
}

/** Equal pixel density and restrained chroma across the remaining imported families. */
function normalizeEnemyPixels(): void {
  const names = new Set([...Object.entries(ENEMY_STATS).map(([kind, st]) => st.sprite ?? kind), NECRO.castSprite]);
  for (const name of names) {
    const s = loaded.get(name);
    if (!s || s.sheet === "authored-enemy-v3") continue;
    const c = document.createElement("canvas"); c.height = 64; c.width = Math.max(1, Math.round(s.w / s.h * 64));
    const g = c.getContext("2d")!; g.imageSmoothingEnabled = false; g.drawImage(s.img, 0, 0, c.width, c.height);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      d[i + 3] = 255;
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      // Small highlights remain readable; broad neon surfaces no longer outrank bosses.
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.round((l + (d[i + ch] - l) * 0.78) * (l > 160 ? 0.85 : 0.96) / 4) * 4;
    }
    g.putImageData(im, 0, 0); loaded.set(name, { ...s, img: c, w: c.width, h: c.height });
  }
}

function shiftPalette(c: HTMLCanvasElement, hue: number, sat: number, light: number): void {
  const g = c.getContext("2d")!, im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    const rgb = hslToRgb(((h + hue / 360) % 1 + 1) % 1, Math.min(1, s * sat), Math.min(1, l * light));
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
  }
  g.putImageData(im, 0, 0);
}

function authoredPose(name: string, frame: number): HTMLCanvasElement | null {
  const kind = authoredEnemyKind(name);
  if (!kind) return null;
  const c = makeEnemyArt(kind, frame);
  const apply = (key: string): void => {
    const st = ENEMY_STATS[key];
    if (st?.palette) { apply(st.palette.of); shiftPalette(c, st.palette.hue, st.palette.sat, st.palette.light); }
    else if (st?.sprite && st.sprite !== key) apply(st.sprite);
  };
  apply(name.replace(/^undead:/, ""));
  if (name.startsWith("undead:")) shiftPalette(c, NECRO.tint.hue, NECRO.tint.sat, NECRO.tint.light);
  return c;
}

/** **부활체의 셀 이름** (§0.7 K ⓓ "팔레트 스왑, 새 적 종을 만들지 않는다").
 * 굽기는 **처음 그 종이 되살아난 프레임에 한 번**이고 그 뒤로는 `loaded`에서 바로 나온다 —
 * 로드 때 전 종을 미리 구우면(67장) 쓰지도 않을 시트를 굽는 비용이 모든 런에 든다.
 *
 * ⚠ **`ENEMY_STATS`에 행을 안 만든다** — 여기서 나온 이름은 **셀 이름**일 뿐이고 판정은 여전히
 * 원본 종(`e.kind`)이 본다. 그래야 「적 종은 늘지 않는다」(BALANCE §0.7 불변식 4)가 산다:
 * `ENEMY_STATS`에 한 줄이라도 넣으면 그 순간 부활체가 **새 종**이 된다.
 * 굽기에 실패하면(원본 셀이 없으면) 원본 이름을 그대로 돌려준다 — 색이 안 갈릴 뿐 그림은 뜬다 */
export function undeadName(name: string): string {
  const out = `undead:${name}`;
  if (loaded.has(out)) return out;
  return bakeTint(name, out, NECRO.tint.hue, NECRO.tint.sat, NECRO.tint.light) ? out : name;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === R ? ((G - B) / d + (G < B ? 6 : 0)) / 6 : mx === G ? ((B - R) / d + 2) / 6 : ((R - G) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255)];
}

export function sprite(name: string): Sprite | undefined {
  return loaded.get(name);
}

/** (x, y)를 앵커 기준으로 삼아 height 픽셀 높이(비율 유지)로 그린다. rot은 라디안.
 * `flip` = 좌우 반전 (감독 #5 V3 "진행 방향 좌우 플립"). 회전 뒤에 적용하므로 회전체(열차)에는 쓰지 않는다. */
export function draw(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  height: number,
  rot = 0,
  flip = false
): void {
  const s = loaded.get(name);
  if (!s) return;
  const h = height;
  const w = (s.w / s.h) * height;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(tintOf(name, s), -w * s.anchor.x, -h * s.anchor.y, w, h);
  ctx.restore();
}

type ActorPose = { image: HTMLCanvasElement; flash?: HTMLCanvasElement; left: number; top: number };
type ActorAtlas = { poses: Map<number, ActorPose>; pixels: number };
const actorPoses = new Map<string, ActorAtlas>();
const ACTOR_PIXEL_CAP = 16 * 1024 * 1024; // 64 MiB including lazily generated hit-flash canvases.
let actorPixels = 0;

export function actorPoseCacheStats(): { atlases: number; frames: number; bytes: number; limitBytes: number } {
  let frames = 0;
  for (const a of actorPoses.values()) frames += a.poses.size;
  return { atlases: actorPoses.size, frames, bytes: actorPixels * 4, limitBytes: ACTOR_PIXEL_CAP * 4 };
}

/** Authored joint/contour poses for principal families, existing anatomy rigs for the rest.
 * Atlas LRU is capped by both count and pixels. A crowd draws one cached image per actor. */
export function drawActor(
  ctx: CanvasRenderingContext2D, name: string, x: number, y: number, height: number,
  flip: boolean, profile: EnemyMotionProfile, frame: number,
  outline: { color: string; px: number; alpha: number }, flash: number
): void {
  const s = loaded.get(name);
  if (!s) return;
  const key = `${name}:${height}:${profile.rig}:${profile.reach}:${outline.color}:${outline.px}:${outline.alpha}`;
  let atlas = actorPoses.get(key);
  if (!atlas) {
    atlas = { poses: new Map(), pixels: 0 };
    actorPoses.set(key, atlas);
  } else {
    actorPoses.delete(key); actorPoses.set(key, atlas);
  }
  let pose = atlas.poses.get(frame);
  if (!pose) {
    const w = s.w / s.h * height;
    const margin = Math.ceil(Math.max(w, height) * 0.2 + outline.px * 2);
    const left = -w * s.anchor.x - margin, top = -height * s.anchor.y - margin;
    const image = document.createElement("canvas");
    image.width = Math.ceil(w + margin * 2) * 2; image.height = Math.ceil(height + margin * 2) * 2;
    const g = image.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.scale(2, 2); g.translate(-left, -top);
    const authored = authoredPose(name, frame);
    const parts = authored || frame === 0 ? [[0, 0, 1, 1, 0.5, 0.5, 0]] : enemyRigParts(profile, frame);
    const paint = (img: CanvasImageSource, ox = 0, oy = 0) => {
      for (const [x0, y0, x1, y1, px, py, angle, dx = 0, dy = 0, sx = 1, sy = 1] of parts) {
        g.save();
        g.translate((px - s.anchor.x + dx) * w + ox, (py - s.anchor.y + dy) * height + oy);
        g.rotate(angle); g.scale(sx, sy);
        g.drawImage(img, s.w * x0, s.h * y0, s.w * (x1 - x0), s.h * (y1 - y0),
          (x0 - px) * w, (y0 - py) * height, (x1 - x0) * w, (y1 - y0) * height);
        g.restore();
      }
    };
    g.globalAlpha = outline.alpha;
    let sil: CanvasImageSource;
    if (authored) {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const sg = c.getContext("2d")!; sg.drawImage(authored, 0, 0); sg.globalCompositeOperation = "source-in";
      sg.fillStyle = outline.color; sg.fillRect(0, 0, 64, 64); sil = c;
    } else sil = silhouetteOf(name, s, outline.color);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(sil, dx * outline.px, dy * outline.px);
    g.globalAlpha = 1;
    paint(authored ?? tintOf(name, s));
    pose = { image, left, top };
    atlas.poses.set(frame, pose);
    const pixels = image.width * image.height;
    atlas.pixels += pixels; actorPixels += pixels;
  }
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(pose.image, pose.left, pose.top, pose.image.width / 2, pose.image.height / 2);
  if (flash > 0) {
    if (!pose.flash) {
      pose.flash = document.createElement("canvas");
      pose.flash.width = pose.image.width; pose.flash.height = pose.image.height;
      const g = pose.flash.getContext("2d")!;
      g.drawImage(pose.image, 0, 0); g.globalCompositeOperation = "source-in";
      g.fillStyle = "#fff"; g.fillRect(0, 0, pose.flash.width, pose.flash.height);
      const pixels = pose.flash.width * pose.flash.height;
      atlas.pixels += pixels; actorPixels += pixels;
    }
    ctx.globalAlpha *= flash; ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(pose.flash, pose.left, pose.top, pose.flash.width / 2, pose.flash.height / 2);
  }
  ctx.restore();
  while (actorPoses.size > 128 || actorPixels > ACTOR_PIXEL_CAP) {
    const oldest = actorPoses.keys().next().value!;
    actorPixels -= actorPoses.get(oldest)!.pixels;
    actorPoses.delete(oldest);
  }
}

/** 접지 타원 그림자 (감독 #5 V3 "전 유닛 타원 그림자"). 유닛 밑에 먼저 깔아 배경에서 떼어낸다.
 * 스프라이트가 아니라 도형이라 여기 두는 것이 어색해 보이지만, 적·열차·시체가 전부 쓰는
 * 유일한 공용 드로 헬퍼라 sprites.ts가 제일 얕은 자리다(sprites.ts는 아무것도 import하지 않는다) */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  rx: number,
  ry: number,
  dy: number,
  alpha: number,
  rot = 0
): void {
  ctx.save();
  ctx.translate(x, y + height * dy);
  if (rot) ctx.rotate(rot);
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, height * rx, height * ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 유닛 색 보정 (감독 #5 V3). 열차 칸 시트는 어두운 회녹색이라 잔디·자갈 노반에 묻힌다
// (실측: hero 불투명 픽셀 평균 rgb(86,91,69), collector rgb(75,68,56)).
// RGB를 곱해 따뜻한 갈색으로 밀되 **한 번만 구워 캐시**한다 — 프레임마다 픽셀을 만지면 안 된다.
// 대상은 CAR_KINDS뿐이다: 적까지 물들이면 적종별 색 구분(§8 실루엣)이 무너진다.
const CAR_TINT_NAMES = new Set(CAR_KINDS as readonly string[]);
// 포탑 분리 시트(감독 #12 ⑤)의 셀은 이름이 CAR_KINDS와 다르므로 **시트 단위**로 같은 보정을 건다.
// 실측 평균색이 기존 칸과 같은 어두운 올리브(차체 84,93,71 / 포탑 75~78,83~88,62~63)라 보정이
// 빠지면 차체만 밝고 포탑만 어두워진다. 시트로 걸면 셀이 늘어도 이름 목록을 고칠 필요가 없다
// ⚠ **시트 «이름 목록»으로 들면 새 포탑 시트가 조용히 빠진다** — iter82의 티어 시트 3장
// (`sheet-turret-tier-{a,b,c}-v1`, 36셀)이 정확히 그렇게 빠져서 T1~T3 전 포탑이 보정 없이 그려졌다
// (실측: 티어 셀 rgb(77,81,56) L=77 그대로 대 보정된 옛 셀 L≈85 · 평판차 갑판 L≈78의 **차가운** 쪽).
// 그래서 목록이 아니라 **접두어**로 든다: 「포탑 시트는 전부 칸 보정을 받는다」가 규약이다
const isCarSheet = (sheet: string): boolean => sheet.startsWith("sheet-turret");
/** 「이 셀이 **포탑**인가」 — `isCarSheet`와 헷갈리지 말 것. 저 문은 **「칸 보정을 받는가」**이고
 * 시트로 들기 때문에 **차체까지 참이다**: `sheet-turret-v1`에는 `car_hero`·`car_flat`이 함께 들어 있고
 * `sheet-turret2-v1`에는 지원칸 차체 셋이 들어 있다(probe `train.turret.sheets`가 그 근거다).
 * 그래서 포탑 전용 보정(`RENDER.turretTint`)을 시트로 걸면 **갑판이 함께 밝아져 대비가 안 벌어진다**
 * (실측: 갑판 66.7 → 73.3으로 같이 떠서 차이가 12.6 → 15.4밖에 안 움직였다).
 * 포탑 셀은 이름이 전부 `turret_`로 시작한다(`train.ts turretName` = `turret_<kind>_t<n>` · `turret_hero`) */
const isTurretCell = (name: string): boolean => name.startsWith("turret_");
/** **보정 «후» 셀의 평균 명도** (0~255. `L = 0.299R + 0.587G + 0.114B`, 불투명 픽셀만).
 * `part`를 주면 재질 한쪽만 센다 — 평판차 갑판(`warm`)이 그 자리다.
 * 감독이 §0.7-C에서 「포탑이 차체보다 12~15포인트 밝아야 한다」를 **포인트로** 못박았으므로
 * 그 값이 probe에 서야 회귀가 기계로 잡힌다(`train.turret.luma`) — 컷으로는 「좀 어둡네」로만 보인다.
 * ⚠ **`tintOf`를 그대로 지난다** — 보정 «전»을 재면 손잡이를 돌려도 숫자가 안 움직인다 */
export function spriteLuma(name: string, part?: "warm" | "cool"): number | null {
  const s = loaded.get(name);
  if (!s) return null;
  const c = document.createElement("canvas");
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext("2d")!;
  g.drawImage(tintOf(name, s), 0, 0, s.w, s.h);
  const d = g.getImageData(0, 0, s.w, s.h).data;
  // 재질 판정은 **원본 픽셀**로 한다 — `tintOf`가 바로 그렇게 가르고, 보정 «후»로 가르면
  // `flatcarFrameTint`(R을 덜 누른다)가 프레임까지 R > G로 뒤집어 놔 갈래가 통째로 섞인다
  let raw: Uint8ClampedArray | null = null;
  if (part) {
    g.clearRect(0, 0, s.w, s.h);
    g.drawImage(s.img, 0, 0, s.w, s.h);
    raw = g.getImageData(0, 0, s.w, s.h).data;
    g.clearRect(0, 0, s.w, s.h);
    g.drawImage(tintOf(name, s), 0, 0, s.w, s.h);
  }
  let sum = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    // `NAME_TINT_COOL`과 **같은 갈래**(R > G = 따뜻한 나무 갑판 · G ≥ R = 차가운 금속 프레임).
    // 평판차는 한 셀 안에 재질이 둘이라 통짜 평균을 재면 **어두운 프레임이 갑판을 끌어내린다**
    if (raw && part === "warm" && raw[i] <= raw[i + 1]) continue;
    if (raw && part === "cool" && raw[i] > raw[i + 1]) continue;
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    n++;
  }
  return n ? +(sum / n).toFixed(1) : null;
}

/** 「이 셀이 칸 색 보정을 받는가」 — probe가 회귀를 기계로 잡는 자리(`train.turret.untinted`) */
export function carTinted(name: string): boolean {
  const s = loaded.get(name);
  return !!s && (CAR_TINT_NAMES.has(name) || isCarSheet(s.sheet));
}
/** 스프라이트 1장짜리 예외. 시트 전체 보정이 맞지 않는 재질(나무 갑판)만 여기 둔다 */
const NAME_TINT: Record<string, [number, number, number]> = { car_flat: RENDER.flatcarTint };
/** 한 스프라이트 안에 재질이 둘일 때 쓰는 **두 번째** 보정. 픽셀이 차가운 쪽(G ≥ R)이면 이 값을,
 * 따뜻한 쪽이면 위의 값을 먹인다 — 평판차의 나무 갑판(R > G)과 금속 프레임(G ≥ R)이 그 경우다 */
const NAME_TINT_COOL: Record<string, [number, number, number]> = { car_flat: RENDER.flatcarFrameTint };
// 적 스프라이트에도 같은 파이프라인으로 **명도 보정**을 건다 (감독 #10). 배율은 RGB 균등이라
// 색상 관계가 보존된다 — 칸처럼 한쪽으로 밀면 적종별 색 구분(§8 실루엣)이 무너진다.
// 이름은 ENEMY_STATS에서 유도한다: sprite 대체(분열체는 슬라임 시트를 공유)까지 자동으로 따라온다
const ENEMY_TINT_NAMES = new Set(Object.entries(ENEMY_STATS).map(([k, v]) => v.sprite ?? k));
const tinted = new Map<string, HTMLCanvasElement>();

function tintOf(name: string, s: Sprite): CanvasImageSource {
  const isCar = CAR_TINT_NAMES.has(name) || isCarSheet(s.sheet);
  if (s.sheet === "authored-enemy-v3") return s.img;
  if (!isCar && !ENEMY_TINT_NAMES.has(name)) return s.img;
  const hit = tinted.get(name);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext("2d")!;
  g.drawImage(s.img, 0, 0, s.w, s.h);
  const im = g.getImageData(0, 0, s.w, s.h);
  const d = im.data;
  const lift = RENDER.enemyLift;
  const base = NAME_TINT[name] ?? (isCar ? RENDER.carTint : [lift, lift, lift]);
  // **포탑만 한 단 더 밝힌다** (BALANCE §0.7-C `RENDER.turretTint`). 균등 배수라 위 보정이 만든
  // 색상 관계는 그대로 살고 명도만 오른다 — 차체·갑판은 이 줄을 안 탄다(대비가 목적이므로)
  const tt = isTurretCell(name) ? RENDER.turretTint : 1;
  const warm: [number, number, number] = [base[0] * tt, base[1] * tt, base[2] * tt];
  const cool = NAME_TINT_COOL[name];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [tr, tg, tb] = cool && d[i + 1] >= d[i] ? cool : warm;
    d[i] = Math.min(255, d[i] * tr);
    d[i + 1] = Math.min(255, d[i + 1] * tg);
    d[i + 2] = Math.min(255, d[i + 2] * tb);
  }
  g.putImageData(im, 0, 0);
  tinted.set(name, c);
  return c;
}

// 지형 타일은 알파가 없다(잔디 사각 타일 위에 그려진 원본).
// iter2~10에서는 가장자리 페더링으로 배경 잔디(GRASS #58a040)에 녹였지만, 감독 #5 V1로 바닥이
// **배경 플레이트**가 되면서 시트 배경색과 바닥 톤이 달라졌다 — 페더링만으로는 초록 후광이 남고
// 세게 페더링하면 그림 자체가 흐려진다(실측). 그래서 **크로마 키**로 배경색을 실제로 뚫는다.
// 키 색은 하드코딩하지 않고 **스프라이트 테두리의 평균색**을 쓴다 (시트가 바뀌어도 따라간다).
const keyed = new Map<string, HTMLCanvasElement>();

/** 배경색 제거 임계 (RGB 유클리드 거리). in 이하 = 완전 투명, out 이상 = 완전 불투명 */
const KEY_IN = 46;
const KEY_OUT = 104;

/** 타일별 색 보정 (RGB 곱). 지형 시트의 성벽은 **차가운 회색 석재**인데 배경 플레이트의 성벽·역사는
 * 따뜻한 갈색 조적이다 — 보정 없이 얹으면 창백한 블록이 떠 보인다(감독 #5 V1 실측) */
const TILE_TINT: Record<string, [number, number, number]> = {
  wall: [1.0, 0.85, 0.64],
  wall_broken: [1.0, 0.85, 0.64],
};

function keyedOf(name: string, s: Sprite, feather: number): HTMLCanvasElement {
  const ck = `${name}@${feather}`;
  const hit = keyed.get(ck);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext("2d")!;
  g.drawImage(s.img, 0, 0, s.w, s.h);
  const im = g.getImageData(0, 0, s.w, s.h);
  const d = im.data;
  // 테두리 2px 평균 = 배경색
  let kr = 0;
  let kg = 0;
  let kb = 0;
  let n = 0;
  const take = (x: number, y: number) => {
    const i = (y * s.w + x) * 4;
    kr += d[i];
    kg += d[i + 1];
    kb += d[i + 2];
    n++;
  };
  for (let x = 0; x < s.w; x++) {
    take(x, 0);
    take(x, 1);
    take(x, s.h - 1);
    take(x, s.h - 2);
  }
  for (let y = 0; y < s.h; y++) {
    take(0, y);
    take(1, y);
    take(s.w - 1, y);
    take(s.w - 2, y);
  }
  kr /= n;
  kg /= n;
  kb /= n;
  const tint = TILE_TINT[name];
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
    if (dist <= KEY_IN) {
      d[i + 3] = 0;
      continue;
    }
    if (dist < KEY_OUT) d[i + 3] = Math.round(255 * ((dist - KEY_IN) / (KEY_OUT - KEY_IN)));
    if (tint) {
      d[i] = Math.min(255, d[i] * tint[0]);
      d[i + 1] = Math.min(255, d[i + 1] * tint[1]);
      d[i + 2] = Math.min(255, d[i + 2] * tint[2]);
    }
  }
  g.putImageData(im, 0, 0);
  if (feather > 0) {
    // 남은 사각 이음새를 살짝만 문지른다 (키잉이 대부분을 처리하므로 넓게 할 필요가 없다)
    const f = Math.max(1, Math.round(Math.min(s.w, s.h) * feather));
    g.globalCompositeOperation = "destination-in";
    g.filter = `blur(${f}px)`;
    g.fillStyle = "#fff";
    g.fillRect(f, f, s.w - f * 2, s.h - f * 2);
  }
  keyed.set(ck, c);
  return c;
}

/** 알파 없는 지형 타일용 draw — 배경색을 크로마 키로 뚫고 그린다.
 * `feather`는 추가 가장자리 페더 폭 / 짧은 변 (0 = 키잉만) */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  height: number,
  feather = 0.02
): void {
  const s = loaded.get(name);
  if (!s) return;
  const w = (s.w / s.h) * height;
  ctx.drawImage(keyedOf(name, s, feather), x - w * s.anchor.x, y - height * s.anchor.y, w, height);
}

/** 키잉 후 **실제로 남는 그림**의 상자 — `drawTile`과 **같은 인자**를 받아 월드 좌표로 돌려준다.
 * 왜 필요한가: `drawTile`이 채우는 상자는 **셀 전체**인데 지형 셀은 그림이 그 일부만 채운다
 * (실측 — 성벽 `wall`은 셀 높이의 **25%** · 골렘 잔해 `scrap`은 37%). 그래서 「지물 위에/아래에」
 * 무언가를 놓는 연출을 판정 반경(`t.r`)으로 놓으면 **그림과 상관없는 잔디 위에** 뜬다.
 * 인자를 drawTile과 같게 둔 것이 규약이다 — 앵커·종횡비 식이 두 벌이 되면 다시 어긋난다. */
export function tileArtBox(
  name: string,
  x: number,
  y: number,
  height: number,
  feather = 0.02
): { x0: number; y0: number; x1: number; y1: number } | null {
  const s = loaded.get(name);
  if (!s) return null;
  const ck = `${name}@${feather}`;
  let f = artBoxes.get(ck);
  if (f === undefined) {
    f = measureArt(keyedOf(name, s, feather), s.w, s.h);
    artBoxes.set(ck, f);
  }
  if (!f) return null;
  const w = (s.w / s.h) * height;
  const bx = x - w * s.anchor.x;
  const by = y - height * s.anchor.y;
  return { x0: bx + w * f.x0, y0: by + height * f.y0, x1: bx + w * f.x1, y1: by + height * f.y1 };
}

/** 셀 기준 0~1 상자. 한 스프라이트당 한 번만 재고 캐시한다 */
const artBoxes = new Map<string, { x0: number; y0: number; x1: number; y1: number } | null>();

function measureArt(c: HTMLCanvasElement, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const d = c.getContext("2d")!.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] <= 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
}

// 피격 플래시 (감독 #5 V2). 스프라이트의 **실루엣을 흰색으로 칠한 사본**을 캐시해 두고,
// 원본 위에 가산 합성으로 덧그린다. 색을 곱하는 방식(globalCompositeOperation "source-atop")과 달리
// 적종·크기·앵커가 원본과 자동으로 같고, 캐시라 프레임마다 픽셀을 만지지 않는다.
const silhouettes = new Map<string, HTMLCanvasElement>();

function silhouetteOf(name: string, s: Sprite, color: string): HTMLCanvasElement {
  const ck = `${name}@${color}`;
  const hit = silhouettes.get(ck);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext("2d")!;
  g.drawImage(s.img, 0, 0, s.w, s.h);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, s.w, s.h);
  silhouettes.set(ck, c);
  return c;
}

/** 어두운 외곽선 (감독 #5 V3, 열차 실루엣). 같은 실루엣을 8방향으로 조금씩 밀어 깔고 그 위에 원본을
 * 그리면 테두리가 생긴다. `px`는 **월드 단위**라 카메라 줌과 무관하게 두께가 일정하다 */
export function drawOutline(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  height: number,
  rot: number,
  color: string,
  px: number,
  alpha: number,
  flip = false
): void {
  const s = loaded.get(name);
  if (!s) return;
  const h = height;
  const w = (s.w / s.h) * height;
  const sil = silhouetteOf(name, s, color);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  // 적은 진행 방향으로 뒤집혀 그려진다 — 외곽선도 같이 뒤집지 않으면 테두리가 실루엣에서 어긋난다.
  // 뒤집은 뒤 오프셋은 그대로 8방향이라 두께는 좌우 대칭으로 유지된다
  if (flip) ctx.scale(-1, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.drawImage(sil, -w * s.anchor.x + Math.cos(a) * px, -h * s.anchor.y + Math.sin(a) * px, w, h);
  }
  ctx.restore();
}

/** 흰색 실루엣을 alpha만큼 가산 합성. flip은 draw()와 같은 의미 */
export function drawFlash(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  height: number,
  alpha: number,
  flip = false
): void {
  const s = loaded.get(name);
  if (!s) return;
  const w = (s.w / s.h) * height;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(silhouetteOf(name, s, "#fff"), -w * s.anchor.x, -height * s.anchor.y, w, height);
  ctx.restore();
}
