// 플로우필드 — 모든 적의 목표는 코어 하나뿐(DESIGN §8.0)이라 «목표»는 하나다.
// 필드는 **둘**이다(§8.④ 수륙양용): 지상용 하나 + 호수를 통과하는 수륙양용용 하나 — 목표가 아니라
// 지나갈 수 있는 지형이 갈리기 때문이다(buildFlow의 swim 인자).
// 코어에서 출발하는 다익스트라로 셀별 이동 비용을 구하고, 각 셀에 "코어로 가는 단위벡터"를 굽는다.
// 좌표는 월드 단위. 지형 파괴 시 재계산은 큐 3에서 buildFlow를 다시 부르면 된다.

import { cityCover, coverBlocksMove } from "./map";
import type { GameMap, Terrain } from "./map";

// 감속 지형(언덕·웅덩이)은 **비용에 넣지 않는다**. 비용 = 1/이속배율로 넣어 봤더니 우회가 항상 싸져
// 5개 시드 웨이브 전체에서 적이 감속 지형을 한 번도 밟지 않았다 — "통과하되 감속"이 사실상 차단이 된다.
// 감속은 경로가 아니라 페널티로만 작동해야 §4.1 "언덕 위 적은 직사에 노출(고지 리스크)"이 성립한다.
// 경로를 바꾸는 것은 차단 지형(성벽·호수)뿐이다.

/** 셀 크기. DESIGN §9 리스크 대응 "그리드 해상도 낮게(셀 32px급)" */
export const CELL = 32;
/** 스폰은 맵 가장자리 바깥(§5.0)이므로 그리드는 맵보다 넓어야 한다 */
const PAD = 160;

/** 적 이동을 막는 지형. DESIGN §4.1 — 성벽·호수는 차단, 언덕·웅덩이는 통과(감속).
 * 파괴된 성벽은 잔해라 더 이상 막지 않는다 (§4.2 "부수면 적 진로도 뚫림")
 *
 * `swim = true`는 **수륙양용 적의 시점**이다 (§8.④) — 호수가 안 막힌다. 성벽은 그대로 막는다:
 * 물만 통과하는 적이지 지형을 무시하는 적이 아니다. 필드가 둘로 갈려도 §8.0은 안 깨진다
 * (목표는 여전히 코어 하나이고 갈리는 것은 지나갈 수 있는 지형뿐이다) */
export function blocksMovement(t: Terrain, swim = false): boolean {
  // ⚠ **도시의 건물·주유소는 기본적으로 아무것도 안 막는다** (§0.7 J1-e 착지점 · iter114 실측).
  // 「그려진 벽을 적이 통과한다」를 닫고 싶은 자리지만, 그것은 **플레이트에 구운 성벽·바위가
  // 장식이라 충돌이 없다**는 이 코드베이스의 선례(`PLATE.walls` 주석)를 도시에서만 뒤집는 것이고,
  // 실측으로 **완주가 60/60 → 48/60**으로 깨진다(도시가 감속 지형을 전부 잃은 위에 진로까지 좁아진다).
  // 완주가 걸린 판정은 정본이 아닌 채로 굳히지 않는다 — QA `?cover=move|both`가 사다리를 재는
  // 손잡이이고, 제안은 STATUS 「미결 질문」에 사다리와 함께 올려 뒀다.
  // 수영으로도 안 열린다 — 물이 아니다(켜졌을 때의 규약)
  return (
    (t.kind === "wall" && !t.destroyed) || (t.kind === "lake" && !swim) || (coverBlocksMove() && cityCover(t))
  );
}

/** 이 지형이 **물**인가 (§8.④). 호수는 차단이고 웅덩이는 감속인데, 수륙양용에게는 둘 다 «지름길»이라
 * 한 술어로 묶인다 — 밀어내기 면제(호수)와 수중 가속(둘 다)이 이 판정을 함께 쓴다 */
export function isWater(t: Terrain): boolean {
  return t.kind === "lake" || t.kind === "pond";
}

export type Flow = {
  gw: number;
  gh: number;
  /** 그리드 원점 (월드) */
  ox: number;
  oy: number;
  /** 셀 → 코어까지 이동 비용 (셀 단위). 도달 불가는 Infinity */
  cost: Float64Array;
  /** 셀 → 코어 방향 단위벡터 */
  fx: Float32Array;
  fy: Float32Array;
  blocked: Uint8Array;
};

const DIAG = Math.SQRT2;
const NB = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAG], [1, -1, DIAG], [-1, 1, DIAG], [-1, -1, DIAG],
] as const;

/** `swim = true`면 **수륙양용용 두 번째 필드**를 굽는다 (§8.④ — 호수를 지나가는 경로).
 * 두 필드는 지형이 바뀔 때 **함께** 다시 구워야 한다(main.ts terrainDirty) — 한쪽만 갱신하면
 * 그 종만 옛 지형을 보고 걷는다 */
export function buildFlow(map: GameMap, swim = false): Flow {
  const ox = -PAD;
  const oy = -PAD;
  const gw = Math.ceil((map.w + 2 * PAD) / CELL);
  const gh = Math.ceil((map.h + 2 * PAD) / CELL);
  const n = gw * gh;
  const blocked = new Uint8Array(n);
  const walls = map.terrain.filter((t) => blocksMovement(t, swim));

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const wx = ox + (gx + 0.5) * CELL;
      const wy = oy + (gy + 0.5) * CELL;
      if (walls.some((t) => Math.hypot(wx - t.x, wy - t.y) < t.r)) blocked[gy * gw + gx] = 1;
    }
  }

  const cost = new Float64Array(n).fill(Infinity);
  // 이진 힙 (비용이 1과 √2 두 종류라 정렬 큐 하나면 충분)
  const hi: number[] = [];
  const hc: number[] = [];
  const push = (i: number, c: number) => {
    hi.push(i);
    hc.push(c);
    let k = hi.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hc[p] <= hc[k]) break;
      [hi[p], hi[k]] = [hi[k], hi[p]];
      [hc[p], hc[k]] = [hc[k], hc[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = hi[0];
    const li = hi.pop()!;
    const lc = hc.pop()!;
    if (hi.length) {
      hi[0] = li;
      hc[0] = lc;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < hi.length && hc[l] < hc[m]) m = l;
        if (r < hi.length && hc[r] < hc[m]) m = r;
        if (m === k) break;
        [hi[m], hi[k]] = [hi[k], hi[m]];
        [hc[m], hc[k]] = [hc[k], hc[m]];
        k = m;
      }
    }
    return top;
  };

  const start = Math.floor((map.cy - oy) / CELL) * gw + Math.floor((map.cx - ox) / CELL);
  cost[start] = 0;
  push(start, 0);
  while (hi.length) {
    const i = pop();
    const c = cost[i];
    const gx = i % gw;
    const gy = (i - gx) / gw;
    for (const [dx, dy, w] of NB) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const j = ny * gw + nx;
      if (blocked[j]) continue;
      // 벽 모서리를 대각으로 스쳐 지나가지 않게 (직교 이웃 둘 다 열려 있어야 대각 통과)
      if (dx && dy && (blocked[gy * gw + nx] || blocked[ny * gw + gx])) continue;
      const nc = c + w;
      if (nc < cost[j]) {
        cost[j] = nc;
        push(j, nc);
      }
    }
  }

  // 셀별 진행 방향: 이웃 중 코스트가 가장 낮은 쪽. 벽 셀은 빠져나갈 방향을 갖는다
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      let best = cost[i];
      let bx = 0;
      let by = 0;
      for (const [dx, dy] of NB) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const c = cost[ny * gw + nx];
        if (c < best) {
          best = c;
          bx = dx;
          by = dy;
        }
      }
      const len = Math.hypot(bx, by) || 1;
      fx[i] = bx / len;
      fy[i] = by / len;
    }
  }

  return { gw, gh, ox, oy, cost, fx, fy, blocked };
}

function cellIndex(f: Flow, gx: number, gy: number): number {
  const x = gx < 0 ? 0 : gx >= f.gw ? f.gw - 1 : gx;
  const y = gy < 0 ? 0 : gy >= f.gh ? f.gh - 1 : gy;
  return y * f.gw + x;
}

/** (x, y)에서 코어로 향하는 단위벡터. 인접 4셀을 이중선형 보간해 셀 경계의 각짐을 없앤다 */
export function flowAt(f: Flow, x: number, y: number): { x: number; y: number } {
  const gx = (x - f.ox) / CELL - 0.5;
  const gy = (y - f.oy) / CELL - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  let vx = 0;
  let vy = 0;
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= 1; i++) {
      const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
      const k = cellIndex(f, x0 + i, y0 + j);
      vx += f.fx[k] * w;
      vy += f.fy[k] * w;
    }
  }
  const len = Math.hypot(vx, vy);
  return len > 1e-6 ? { x: vx / len, y: vy / len } : { x: 0, y: 0 };
}

export function isBlocked(f: Flow, x: number, y: number): boolean {
  const gx = Math.floor((x - f.ox) / CELL);
  const gy = Math.floor((y - f.oy) / CELL);
  return f.blocked[cellIndex(f, gx, gy)] === 1;
}

/** (x, y)에서 코어까지의 **플로우필드 경로 길이**(월드). 도달 불가는 Infinity.
 * `cost`는 셀 단위 누적이라 `CELL`을 곱하면 월드 길이가 된다 — 직선거리로 나눈 값이 곧
 * 「이 방위가 얼마나 돌아가는가」이고, 그것이 §0.7 J1-f ⓑ 「통로가 남아 있는가」의 눈금이다 */
export function costAt(f: Flow, x: number, y: number): number {
  const gx = Math.floor((x - f.ox) / CELL);
  const gy = Math.floor((y - f.oy) / CELL);
  return f.cost[cellIndex(f, gx, gy)] * CELL;
}

/** (x, y)를 품은 **«열려 있는데 코어에 못 닿는» 칸 덩어리**의 크기(칸 수).
 *
 * `corridor.blocked`(= 그 방위의 표본 칸이 코어에 못 닿는다)는 **한 칸**을 읽으므로 「가장자리에 생긴 작은
 * 주머니」와 「그 방위 전체의 봉쇄」가 화면에 같은 글자로 찍힌다 — 둘을 가르는 것이 이 함수다.
 *  · **0** = 그 칸은 코어에 닿는다(막히지 않았다)
 *  · **-1** = 그 칸 자체가 지물 안이다 — 「통로가 막혔다」가 아니라 「표본이 지물에 얹혔다」다
 *  · **n > 0** = 그 칸을 품은 사각(死角)의 넓이. 작으면 «주머니» · 크면 «봉쇄»다 */
export function deadPocket(f: Flow, x: number, y: number): number {
  const s = cellIndex(f, Math.floor((x - f.ox) / CELL), Math.floor((y - f.oy) / CELL));
  if (f.blocked[s]) return -1;
  if (Number.isFinite(f.cost[s])) return 0;
  const seen = new Uint8Array(f.gw * f.gh);
  const stack = [s];
  seen[s] = 1;
  let n = 0;
  while (stack.length) {
    const i = stack.pop()!;
    n++;
    const gx = i % f.gw;
    const gy = (i - gx) / f.gw;
    for (const [dx, dy] of NB) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= f.gw || ny >= f.gh) continue;
      const j = ny * f.gw + nx;
      if (seen[j] || f.blocked[j] || Number.isFinite(f.cost[j])) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return n;
}
