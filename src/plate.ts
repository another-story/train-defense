// 맵 배경 = 플레이트 이미지 + 절차 확장 외곽 밴드 (감독 #5 V1, 밴드는 감독 #7 ③으로 재작성).
// 코드가 그리던 바닥·레일·역사·코어·중앙 소품 렌더는 전부 여기로 넘어왔다 — 로직·콜리전은 map.ts.
//
// 프리렌더 전략: 플레이트는 정적이고 카메라는 코어 고정이라, 맵 전체(월드 1:1)를 캔버스 한 장에
// 한 번만 구워 두고 매 프레임 그 한 장만 그린다. 월드 1536px는 화면 1280px보다 크므로(CAM 0.833)
// 해상도 손실은 없다.
//
// 밴드 원칙 (감독 #7 ③): **그림을 늘리지 않는다.** V1은 가장자리 스트립을 밴드 폭으로 확대해
// 색을 이월했는데, 그 결과가 좌·우·하단의 블러 스미어였다. 지금은 단색 + 노이즈 + 소품 클러스터로
// 밴드를 "조용한 벌판"으로 만들고, 시선은 비네트로 중앙(플레이트)에 모은다.

import { GRASS, PLATE, type PlateId } from "./balance";
import { mulberry32, type GameMap } from "./map";
// 배포 용량 — PNG 13.7MB → WebP q92 1.1MB(−92%). 원본 PNG는 마스터에 남는다(재편집용)
import plateWideUrl from "../images/plate/plate-wide.webp";
import plateCityUrl from "../images/plate/plate-city.webp";

/** 플레이트 갈래 → 그림 파일 (감독 #65 반입). **좌표계는 둘이 같다** — 도시 플레이트는 평원에서
 * i2i로 나왔고 크기(2752×1536)도 레일 링도 보존돼 있어 `PLATE`의 값이 그대로 맞는다.
 * 새 맵이 늘면 여기 한 줄과 `MAPS[id].plate` 한 칸이다 */
const PLATE_URL: Record<PlateId, string> = { wide: plateWideUrl, city: plateCityUrl };

let img: HTMLImageElement | null = null;
export let plateLoaded = false;

export async function loadPlate(id: PlateId): Promise<void> {
  const el = new Image();
  el.src = PLATE_URL[id];
  try {
    await el.decode();
    img = el;
    plateLoaded = true;
  } catch {
    plateLoaded = false;
  }
}

let bg: HTMLCanvasElement | null = null;

/** 밴드 QA 지표 (probe `plate.band*`). 절차 생성이라 "몇 개가 실제로 놓였나"가 유일한 수치 검증이다 */
export const bandStats = { tone: GRASS, props: 0, clusters: 0, ditherPx: 0 };

/** 플레이트 테두리의 대표색 — 밴드 바탕색 (감독 #7 ③ "가장자리 평균 단색").
 * **산술 평균이 아니라 채널별 중앙값**을 쓴다: 테두리에는 호수(파랑)·바위(회색)·흙(갈색)이 섞여
 * 있어 평균은 어두운 올리브 rgb(119,120,49)로 끌려가고, 그러면 밴드와 플레이트의 명도 차이가
 * 이음새를 **사각 테두리로** 드러낸다(iter12 첫 컷 실측). 중앙값은 소수 이물색에 끌리지 않아
 * 테두리의 다수인 잔디색을 그대로 집는다 */
function edgeToneOf(src: HTMLImageElement): [number, number, number] {
  const c = document.createElement("canvas");
  // 중앙값을 쓰려면 표본이 필요하다 — 256×144로 줄여 테두리 링 2px를 모은다
  c.width = 256;
  c.height = 144;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const ch: number[][] = [[], [], []];
  const take = (x: number, y: number) => {
    const i = (y * c.width + x) * 4;
    ch[0].push(d[i]);
    ch[1].push(d[i + 1]);
    ch[2].push(d[i + 2]);
  };
  for (let x = 0; x < c.width; x++) {
    take(x, 0);
    take(x, 1);
    take(x, c.height - 1);
    take(x, c.height - 2);
  }
  for (let y = 0; y < c.height; y++) {
    take(0, y);
    take(1, y);
    take(c.width - 1, y);
    take(c.width - 2, y);
  }
  return ch.map((v) => {
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  }) as [number, number, number];
}

/** 플레이트의 한 지점 색을 실제로 읽는다 — 밴드로 이어지는 지형(호수)을 그림과 같은 색으로 잇기 위해.
 * 색을 하드코딩하지 않으므로 플레이트를 갈아 끼워도 따라간다 */
function samplePlate(src: HTMLImageElement, px: number, py: number, size: number): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const g = c.getContext("2d")!;
  g.drawImage(src, px - size / 2, py - size / 2, size, size, 0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

const rgb = (c: [number, number, number], a = 1) =>
  a >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const shade = (c: [number, number, number], k: number): [number, number, number] => [
  Math.max(0, Math.min(255, Math.round(c[0] * k))),
  Math.max(0, Math.min(255, Math.round(c[1] * k))),
  Math.max(0, Math.min(255, Math.round(c[2] * k))),
];

/** 밴드 소품 1개. 지형 시트에는 바위·풀 **단품**이 없어(언덕·웅덩이 같은 큰 지물뿐) 캔버스 도형으로
 * 그린다 — 언덕 스프라이트를 장식으로 놓으면 "언덕처럼 보이는데 안 느려지는" 거짓말이 된다(§4.1).
 * 톤은 하드코딩이 아니라 밴드 바닥색에서 유도해 플레이트와 붙어 있어도 이물감이 없다 */
function drawProp(
  g: CanvasRenderingContext2D,
  rnd: () => number,
  x: number,
  y: number,
  tone: [number, number, number]
): void {
  const roll = rnd();
  if (roll < 0.34) {
    // 바위: 불규칙 다각형 + 접지 그림자 + 위쪽 하이라이트
    const r = 5 + rnd() * 11;
    g.fillStyle = "rgba(0,0,0,0.20)";
    g.beginPath();
    g.ellipse(x, y + r * 0.42, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rr = r * (0.72 + rnd() * 0.42);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.78;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = "#7c7a6e";
    g.fill();
    g.strokeStyle = "#33322a";
    g.lineWidth = 2;
    g.stroke();
    g.beginPath();
    g.ellipse(x - r * 0.2, y - r * 0.28, r * 0.42, r * 0.26, 0, 0, Math.PI * 2);
    g.fillStyle = "#a9a698";
    g.fill();
  } else if (roll < 0.55) {
    // 덤불: 겹친 원 3~5개 (바닥색보다 어둡게 — 밝게 하면 잔디에 뜬다)
    const r = 8 + rnd() * 9;
    const n = 3 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const px = x + (rnd() - 0.5) * r * 1.6;
      const py = y + (rnd() - 0.5) * r * 0.9;
      g.beginPath();
      g.arc(px, py, r * (0.45 + rnd() * 0.4), 0, Math.PI * 2);
      g.fillStyle = rgb(shade(tone, 0.62 + rnd() * 0.16));
      g.fill();
    }
  } else if (roll < 0.72) {
    // 흙 얼룩: 바닥색을 갈색 쪽으로 민 부드러운 타원
    const r = 12 + rnd() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(120, 96, 54, ${(0.18 + rnd() * 0.14).toFixed(3)})`);
    grad.addColorStop(1, "rgba(120, 96, 54, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  } else {
    // 풀 다발: 짧은 선 3~4개
    const n = 3 + ((rnd() * 2) | 0);
    g.lineWidth = 2;
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const h = 7 + rnd() * 9;
      const lean = (rnd() - 0.5) * 8;
      g.strokeStyle = i % 2 ? "#6f8f2a" : "#4c6b1c";
      g.beginPath();
      g.moveTo(x + i * 3 - n * 1.5, y);
      g.lineTo(x + i * 3 - n * 1.5 + lean, y - h);
      g.stroke();
    }
  }
}

/** 맵 전체 배경을 한 번 굽는다. 플레이트 로드 후·generateMap 후에 부를 것 */
export function buildBackground(map: GameMap, seed: number): void {
  const c = document.createElement("canvas");
  c.width = Math.round(map.w);
  c.height = Math.round(map.h);
  const g = c.getContext("2d")!;
  const p = map.plate;
  const rnd = mulberry32(seed * 977 + 31);
  const B = PLATE.band;

  // ① 바닥 = 플레이트 가장자리 평균 **단색**
  const tone: [number, number, number] = img ? edgeToneOf(img) : [88, 160, 64];
  bandStats.tone = rgb(tone);
  g.fillStyle = rgb(tone);
  g.fillRect(0, 0, c.width, c.height);

  const inBand = (x: number, y: number) => x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1;
  /** 밴드 안의 점을 뽑는다 (기각 표본) */
  const pickInBand = (): { x: number; y: number } | null => {
    for (let i = 0; i < 40; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      if (inBand(x, y)) return { x, y };
    }
    return null;
  };

  // ② 저주파 얼룩 — 단색 바닥의 평탄함을 깬다 (늘린 그림이 아니라 부드러운 원이라 스미어가 안 생긴다)
  for (let i = 0; i < B.blotches; i++) {
    const q = pickInBand();
    if (!q) continue;
    const r = 26 + rnd() * 84;
    const dark = rnd() < 0.5;
    const grad = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
    grad.addColorStop(0, dark ? "rgba(30,42,12,0.15)" : "rgba(190,200,120,0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(q.x, q.y, r, 0, Math.PI * 2);
    g.fill();
  }

  // ③ 플레이트 밖으로 삐져나온 지형의 **연장**. 호수 판정원은 그림보다 왼쪽으로 넓다
  //    (balance.ts `TERRAIN_PLAINS` 주석) — V1은 스트립 이월로 물색을 끌어냈지만 그게 스미어였다.
  //    지금은 판정원 그대로 그린다. 안 그리면 밴드에 "보이지 않는 물"이 생겨 적이 허공에 막힌다.
  //    ⚠ **물만 연장한다** — 도시의 건물·잔해는 여기서 안 그리므로 판정원이 플레이트 안에 있어야
  //    한다(`TERRAIN_CITY` 주석). 나가면 밴드에 «보이지 않는 벽»이 생긴다
  const water = map.terrain.filter((t) => t.kind === "lake" || t.kind === "pond");
  if (img && water.length) {
    g.save();
    // 플레이트 사각형 **바깥**만 클립 (안쪽은 그림이 정본이다)
    g.beginPath();
    g.rect(0, 0, c.width, c.height);
    // 구멍은 디더 폭만큼 **안으로** 판다 — 디더 이음새에서 플레이트가 반투명해지는 구간에
    // 밑그림이 잔디면 물 위로 잔디 점이 뿌려져 이음새가 선으로 드러난다
    g.rect(p.x0 + B.dither, p.y0 + B.dither, p.x1 - p.x0 - B.dither * 2, p.y1 - p.y0 - B.dither * 2);
    g.clip("evenodd");
    for (const t of water) {
      // 색은 그림에서 직접 읽는다 — 그것도 **이음새 쪽 가장자리**에서. 중심(깊은 물)을 읽으면
      // 이음새에서 색이 튄다. 플레이트 안으로 한 뼘 들어간 점을 잡는다
      const px = Math.max(24, Math.min(PLATE.w - 24, (t.x - p.ox) / p.sx));
      const py = Math.max(24, Math.min(PLATE.h - 24, (t.y - p.oy) / p.sy));
      const wc = samplePlate(img, px, py, 48);
      g.beginPath();
      g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      g.fillStyle = rgb(wc);
      g.fill();
      g.lineWidth = 7;
      g.strokeStyle = rgb(shade(wc, 0.72), 0.85);
      g.stroke();
    }
    g.restore();
  }

  // ④ 소품 **클러스터** (감독 #7 ③ "균일 산포 금지"). 클러스터 중심을 밴드에서 뽑고 그 주변에 뭉친다
  bandStats.props = 0;
  bandStats.clusters = 0;
  const onWater = (x: number, y: number) =>
    water.some((t) => Math.hypot(x - t.x, y - t.y) < t.r + 6);
  for (let i = 0; i < B.clusters; i++) {
    const q = pickInBand();
    if (!q) continue;
    bandStats.clusters++;
    const cr = B.clusterR[0] + rnd() * (B.clusterR[1] - B.clusterR[0]);
    const n = B.clusterCount[0] + ((rnd() * (B.clusterCount[1] - B.clusterCount[0] + 1)) | 0);
    for (let k = 0; k < n; k++) {
      // 중심 쪽이 촘촘하도록 반경에 제곱근이 아니라 제곱을 쓴다 (뭉침 강조)
      const a = rnd() * Math.PI * 2;
      const rr = cr * rnd() * rnd();
      const x = q.x + Math.cos(a) * rr;
      const y = q.y + Math.sin(a) * rr * 0.8;
      if (!inBand(x, y) || onWater(x, y)) continue;
      drawProp(g, rnd, x, y, tone);
      bandStats.props++;
    }
  }

  // ⑤ 미세 색 노이즈 (픽셀 그레인) — 밴드 픽셀에만. 단색 바닥이 "칠한 면"으로 보이지 않게 한다
  if (B.grain > 0) {
    const im = g.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    const amp = B.grain;
    for (let y = 0; y < c.height; y++) {
      const rowBand = y < p.y0 || y > p.y1;
      for (let x = 0; x < c.width; x++) {
        if (!rowBand && x >= p.x0 && x <= p.x1) {
          x = Math.ceil(p.x1); // 플레이트 가로 구간은 통째로 건너뛴다
          continue;
        }
        const i = (y * c.width + x) * 4;
        const j = (rnd() - 0.5) * 2 * amp;
        d[i] = Math.max(0, Math.min(255, d[i] + j));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + j * 1.15));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + j * 0.7));
      }
    }
    g.putImageData(im, 0, 0);
  }

  // ⑥ 플레이트 본체를 **좁은 디더 밴드**로 얹는다 (감독 #7 ③). 페더 블러는 테두리 30월드를 흐렸는데,
  //    디더는 알파를 확률적으로 뚫을 뿐이라 **그림이 선명한 채로** 이음새만 섞인다
  if (img) {
    const tw = Math.round(p.x1 - p.x0);
    const th = Math.round(p.y1 - p.y0);
    const t = document.createElement("canvas");
    t.width = tw;
    t.height = th;
    const tg = t.getContext("2d")!;
    tg.drawImage(img, 0, 0, tw, th);
    const D = Math.max(1, Math.round(B.dither));
    bandStats.ditherPx = D;
    const im = tg.getImageData(0, 0, tw, th);
    const d = im.data;
    for (let y = 0; y < th; y++) {
      const ey = Math.min(y, th - 1 - y);
      for (let x = 0; x < tw; x++) {
        const e = Math.min(x, tw - 1 - x, ey);
        if (e >= D) {
          // 테두리 D px 밖은 손대지 않는다 — 가로로 건너뛴다
          if (ey >= D && x < tw - 1 - D) x = tw - 2 - D;
          continue;
        }
        // 테두리에서 안쪽으로 갈수록 남을 확률이 오른다 (0 → 1)
        if (rnd() > (e + 0.5) / D) d[(y * tw + x) * 4 + 3] = 0;
      }
    }
    tg.putImageData(im, 0, 0);
    g.drawImage(t, p.x0, p.y0);
  }

  // ⑦ **도시 톤 블록은 빠졌다** (iter113). 감독 #65가 도시 플레이트를 반입해 `MAPS.city.plate`가
  // 그림 자체를 갈아 끼우므로, 평원 그림에 색 보정 세 겹을 얹던 임시 블록이 자리를 잃었다.
  // 밴드 바탕색(①)·호수 잇기(위)·비네트(⑧)는 **전부 플레이트에서 색을 읽으므로**(`edgeToneOf`·
  // `samplePlate`) 도시 플레이트를 그대로 따라간다 — 그것이 「색을 하드코딩하지 않는다」의 값이다

  // ⑧ 최외곽 비네트 — 약하게. 시선을 루프(중앙)로 모으고, 밴드의 낮은 밀도를 눈에 덜 띄게 한다
  if (B.vignette > 0) {
    g.save();
    g.translate(c.width / 2, c.height / 2);
    g.scale(1, c.height / c.width);
    const grad = g.createRadialGradient(0, 0, c.width * 0.42, 0, 0, c.width * 0.78);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${B.vignette})`);
    g.fillStyle = grad;
    g.fillRect(-c.width, -c.width, c.width * 2, c.width * 2);
    g.restore();
  }

  // Grade the complete cached world, including its extension band, once per map.
  // Geometry and source assets are untouched; quieter terrain separates live actors.
  const graded = document.createElement("canvas");
  graded.width = c.width; graded.height = c.height;
  const gg = graded.getContext("2d")!;
  gg.filter = map.id === "city" ? "saturate(0.76) contrast(0.88) brightness(0.92)" : "saturate(0.82) contrast(0.91) brightness(0.96)";
  gg.drawImage(c, 0, 0); gg.filter = "none";
  if (map.id === "city") {
    // The tower's cyan floor light is baked into the plate. A soft multiply pool
    // quiets idle light; drawCoreGlow supplies the live pressure/critical cues.
    const shade = gg.createRadialGradient(map.cx, map.cy, 24, map.cx, map.cy, 145);
    shade.addColorStop(0, "rgba(55, 72, 65, 0.22)");
    shade.addColorStop(0.55, "rgba(55, 72, 65, 0.28)"); shade.addColorStop(1, "rgba(55, 72, 65, 0)");
    gg.globalCompositeOperation = "multiply"; gg.fillStyle = shade;
    gg.fillRect(map.cx - 145, map.cy - 145, 290, 290);
    const tint = gg.createRadialGradient(map.cx, map.cy, 12, map.cx, map.cy, 165);
    tint.addColorStop(0, "rgba(111, 119, 112, 0.12)");
    tint.addColorStop(0.3, "rgba(111, 119, 112, 0.7)");
    tint.addColorStop(0.72, "rgba(111, 119, 112, 0.7)");
    tint.addColorStop(1, "rgba(111, 119, 112, 0)");
    gg.globalCompositeOperation = "color"; gg.fillStyle = tint;
    gg.fillRect(map.cx - 165, map.cy - 165, 330, 330);
    gg.globalCompositeOperation = "source-over";
  }
  bg = graded;
}

export function drawBackground(ctx: CanvasRenderingContext2D, map: GameMap): void {
  if (!bg) {
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, map.w, map.h);
    return;
  }
  ctx.drawImage(bg, 0, 0);
}

/** 지형 갈래별 판정원 색 (`?debug=1` 오버레이 전용). 갈래가 늘 때 여기 한 줄이면 되고,
 * 빠뜨리면 아래의 기본색(주황)으로 그려져 **컷에서 바로 눈에 띈다** — 조용히 사라지지 않는다 */
const DEBUG_INK: Record<string, string> = {
  lake: "#3fa0ff",
  pond: "#d8a13f",
  hill: "#2fd07a",
  building: "#b06cff",
  rubble: "#9aa0a6",
  fuel: "#ff2f6a",
};

/** 정합 검증 오버레이 (`?debug=1`). 그려진 레일 위에 게임 루프·지형 판정·플레이트 경계를 얹어
 * 이미지와 로직이 실제로 겹치는지 스크린샷 한 장으로 확인한다 */
export function drawPlateDebug(ctx: CanvasRenderingContext2D, map: GameMap): void {
  const p = map.plate;
  ctx.save();
  ctx.setLineDash([]);
  // 플레이트 경계
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  // 게임 루프(레일 중심선) — 그려진 레일 중앙을 지나야 한다
  ctx.strokeStyle = "#ff00ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  map.loop.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.stroke();
  // 지형 판정원 — 그림의 지물과 겹쳐야 한다 (평원: 호수·언덕·웅덩이 / 도시: 건물·잔해·주유소)
  ctx.lineWidth = 2;
  for (const t of map.terrain) {
    ctx.strokeStyle = DEBUG_INK[t.kind] ?? "#ff5a3c";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 역 앵커
  ctx.strokeStyle = "#ffd24a";
  ctx.beginPath();
  ctx.arc(map.station.x, map.station.y, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
