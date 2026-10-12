// 이펙트 (감독 #5 V2). fx-sheet-v1을 잘라 만든 프레임을 애니메이션으로 재생한다.
// 여기 있는 수치는 **전부 연출 전용**이다 — BALANCE.md 정본이 아니고 판정에 쓰이지도 않는다
// (combat.ts의 SHAKE_TTL·BLAST_TTL과 같은 부류). 이펙트는 상태를 읽기만 하고 아무것도 바꾸지 않는다.
//
// 합성: 불꽃 계열은 가산("lighter")이라 검은 부분이 저절로 빠진다. 연기는 **불투명**이라 가산으로
// 그리면 잔디가 밝아질 뿐 연기로 안 보인다 — 일반 합성이어야 한다.

import { LAYOUT } from "./balance";
import { draw } from "./sprites";
import { at, carS, type Train } from "./train";
import { getEffectSettings } from "./render-settings";

type FxDef = {
  frames: string[];
  /** 재생 시간(초) */
  dur: number;
  blend: "add" | "normal";
  /** 기본 표시 크기(월드, 높이 기준). spawnFx의 size로 덮어쓴다 */
  size: number;
  /** 알파 감쇠 지수 (1 = 선형, 클수록 늦게 사라진다). 0 = 페이드 없음 */
  fade: number;
  /** 수명 끝에서의 크기 배율 */
  grow?: number;
  /** 재생이 끝나면 같은 자리에 이어 붙는 효과 (폭발 → 잔연) */
  then?: string;
};

export const FX: Record<string, FxDef> = {
  // 폭발: 1~5는 불덩이(가산), 6번 프레임은 흩어지는 잿빛 연기라 별도 효과로 이어 붙인다.
  // 6번까지 가산으로 그리면 폭발이 끝날 때 흰 안개가 번쩍인다
  explode: {
    frames: ["explode_1", "explode_2", "explode_3", "explode_4", "explode_5"],
    dur: 0.4, blend: "add", size: 150, fade: 0.5, then: "explode_fade",
  },
  explode_fade: { frames: ["explode_6"], dur: 0.9, blend: "normal", size: 150, fade: 1, grow: 1.4 },
  muzzle: { frames: ["muzzle_1", "muzzle_2", "muzzle_3"], dur: 0.1, blend: "add", size: 34, fade: 0.6 },
  // 스파크 크기는 **적 표시 크기(22)보다 작아야** 한다 — 26으로 그리면 spark_1(불투명 흰 픽셀 28%)이
  // 적을 통째로 덮어 "피격"이 아니라 흰 사각형으로 보인다(감독 #5 V3 확대 컷 실측)
  spark: { frames: ["spark_1", "spark_2", "spark_3"], dur: 0.2, blend: "add", size: 17, fade: 1 },
  smoke: { frames: ["smoke_1", "smoke_2", "smoke_3", "smoke_4", "smoke_5"], dur: 1.8, blend: "normal", size: 26, fade: 0.9, grow: 2.4 },
  // 골드 스파클은 수명이 없다 — 필드 드랍 위에서 계속 돈다. dur = 한 바퀴 시간 (loopFrame 참조)
  sparkle: { frames: ["sparkle_1", "sparkle_2", "sparkle_3"], dur: 0.6, blend: "add", size: 20, fade: 0 },
  // 화염방사·테슬라 칸은 큐 6. 프레임은 잘라 뒀고 스폰 지점만 그때 붙이면 된다
  flame: { frames: ["flame_1", "flame_2", "flame_3", "flame_4", "flame_5"], dur: 0.3, blend: "add", size: 60, fade: 0.6 },
  arc: { frames: ["arc_1", "arc_2", "arc_3"], dur: 0.18, blend: "add", size: 40, fade: 1 },
  // 곡사 포탄의 연기 궤적 (§0.6 G ⓐ 미사일·MLRS). smoke와 **같은 프레임**이고 갈리는 것은 규모다 —
  // 굴뚝 연기(26 · 1.8초)를 그대로 쓰면 한 발이 하늘을 덮는다. 짧게 뱉고 빨리 흩어진다.
  // ⚠ **작게 그리면 안 된다** — 13으로 잡았더니 화면에서 «잔디 위의 검은 도넛»이 됐다(첫 컷 실측).
  // smoke 프레임은 불투명 회색이라 축소하면 연기가 아니라 점이 된다: 크게 깔고 `fade`로 빨리 지운다
  trail: { frames: ["smoke_1", "smoke_2", "smoke_3"], dur: 0.7, blend: "normal", size: 22, fade: 1.7, grow: 2.4 },
  // 약협·스파크 (§0.7 L ⓑ). spark와 **같은 프레임**이고 갈리는 것은 규모다 — trail↔smoke와 같은 규약.
  // 스파크(17 · 0.2초)는 «맞았다»의 어휘라 그대로 쓰면 총구에서 적중이 난 것처럼 읽힌다:
  // 절반 크기로 짧게 뱉고 `vx/vy`로 튕겨 나가게 한다. **종류를 가른 두 번째 이유는 검산**이다 —
  // spark 카운터를 그대로 쓰면 probe `fx.spawned`에서 「착탄이 늘었는가 총구가 늘었는가」를 못 가른다
  casing: { frames: ["spark_1", "spark_2", "spark_3"], dur: 0.26, blend: "add", size: 9, fade: 1.4 },
};

export type Fx = {
  kind: string;
  priority?: boolean;
  x: number;
  y: number;
  t: number;
  size: number;
  rot: number;
  /** 월드/초. 연기가 열차 뒤로 흐르는 데 쓴다 */
  vx: number;
  vy: number;
  /** 회전축에 **직교하는 폭**의 배수 (1 = 스프라이트 원래 비율).
   * 포구 화염이 「사격 방향으로 뻗는 뾰족한 섬광」이 되는 유일한 축이다 — 프레임이 방사 대칭이라
   * 크기·회전만으로는 방향이 안 나온다(§0.6 G ⓐ · `FX_RULE.muzzle.narrow`) */
  xs: number;
};

export type FxSys = {
  list: Fx[];
  /** 기관차 굴뚝 연기까지 남은 시간(초) */
  chimney: number;
  /** 종류별 누적 스폰 수 (probe 검산용) */
  spawned: Record<string, number>;
};

export function makeFx(): FxSys {
  return { list: [], chimney: 0, spawned: {} };
}

export function spawnFx(
  s: FxSys,
  kind: string,
  x: number,
  y: number,
  opts: { priority?: boolean; size?: number; rot?: number; vx?: number; vy?: number; xs?: number } = {}
): void {
  const def = FX[kind];
  s.list.push({
    kind, x, y, t: 0, priority: opts.priority,
    size: opts.size ?? def.size,
    rot: opts.rot ?? 0,
    vx: opts.vx ?? 0,
    vy: opts.vy ?? 0,
    xs: opts.xs ?? 1,
  });
  s.spawned[kind] = (s.spawned[kind] ?? 0) + 1;
}

/** 기관차 굴뚝 연기 주기(초)와 배출 지점·속도. 연기는 진행 반대 방향으로 흘러 열차 뒤에 꼬리를 남긴다 */
const CHIMNEY_EVERY = 0.45;
/** 굴뚝은 기관차 앞쪽 — 스프라이트 위(진행 방향)에서 carLen의 이 비율만큼 앞 */
const CHIMNEY_FWD = 0.2;
const CHIMNEY_TRAIL = 26;

export function updateFx(s: FxSys, dt: number, train: Train): void {
  s.chimney -= dt;
  if (s.chimney <= 0) {
    s.chimney += CHIMNEY_EVERY;
    // 굴뚝은 기관차의 것이다. ?cars로 기관차를 뺀 편성이면 연기도 없다
    const i = train.cars.findIndex((c) => c.kind === "hero");
    if (i >= 0) {
      const p = at(train.track, carS(train, i));
      const c = Math.cos(p.ang);
      const n = Math.sin(p.ang);
      spawnFx(s, "smoke", p.x + c * LAYOUT.carLen * CHIMNEY_FWD, p.y + n * LAYOUT.carLen * CHIMNEY_FWD, {
        vx: -c * CHIMNEY_TRAIL,
        vy: -n * CHIMNEY_TRAIL,
      });
    }
  }

  const done: Fx[] = [];
  for (const f of s.list) {
    f.t += dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.t >= FX[f.kind].dur) done.push(f);
  }
  if (!done.length) return;
  for (const f of done) {
    const next = FX[f.kind].then;
    if (next) spawnFx(s, next, f.x, f.y, { size: f.size, rot: f.rot, vx: f.vx, vy: f.vy, xs: f.xs });
  }
  s.list = s.list.filter((f) => f.t < FX[f.kind].dur);
}

export function drawFx(ctx: CanvasRenderingContext2D, s: FxSys): void {
  const reduced = getEffectSettings().reducedEffects;
  const cells = new Map<string, number>();
  let budget = reduced ? 24 : 56;
  // Newest impacts win each spatial budget. Spawn/lifetime counters stay unchanged.
  for (let n = s.list.length - 1; n >= 0; n--) {
    const f = s.list[n];
    const essential = f.kind === "muzzle" || !!f.priority;
    const group = f.kind === "explode_fade" || f.kind === "trail" ? "smoke" : f.kind;
    const key = `${group}:${Math.floor(f.x / 48)},${Math.floor(f.y / 48)}`;
    const count = cells.get(key) ?? 0;
    if (!essential && (budget <= 0 || count >= (group === "spark" && !reduced ? 2 : 1))) continue;
    cells.set(key, count + 1);
    if (!essential) budget--;
    const def = FX[f.kind];
    const k = f.t / def.dur;
    const i = Math.min(def.frames.length - 1, Math.floor(k * def.frames.length));
    ctx.save();
    const cap = f.priority ? 0.82 : essential ? 0.8 : group === "smoke" ? 0.2 : f.kind === "explode" ? 0.4 : 0.65;
    ctx.globalAlpha = (def.fade ? Math.pow(1 - k, def.fade) : 1) * cap * (reduced && !essential ? 0.6 : 1);
    if (def.blend === "add") ctx.globalCompositeOperation = "lighter";
    const size = f.size * (def.grow ? 1 + (def.grow - 1) * k : 1);
    if (f.xs === 1) draw(ctx, def.frames[i], f.x, f.y, size, f.rot);
    else {
      // 축 직교 방향만 좁힌다. ctx.scale은 회전 **뒤**에 와야 «사격 방향 축»이 기준이 된다
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.scale(f.xs, 1);
      draw(ctx, def.frames[i], 0, 0, size);
    }
    ctx.restore();
  }
}

/** 수명 없이 도는 연출의 현재 프레임 (필드 드랍의 골드 스파클). t는 그 개체의 경과 시간(초) */
export function loopFrame(kind: string, t: number): string {
  const def = FX[kind];
  const n = def.frames.length;
  return def.frames[Math.floor((t / def.dur) * n) % n];
}

/** 프레임 한 장을 가산 합성으로 그린다 (스폰하지 않는 상시 연출용) */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  draw(ctx, name, x, y, size);
  ctx.restore();
}
