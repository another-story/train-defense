// 일반 맵(구릉 평원) 생성 + 렌더. DESIGN §5.0/§5.1.
// 좌표는 전부 월드 단위. 화면 변환은 main.ts의 카메라가 담당한다.
//
// 감독 #5 V1부터 **배경 플레이트가 정본**이다 (balance.ts PLATE):
//  - 레일·바닥·역사·코어·중앙 소품의 **그림**은 plate.ts가 그린다 (여기서 그리지 않는다)
//  - 루프·지형·역의 **판정**은 여기서 만들되, 전부 플레이트 픽셀 좌표에서 환산한다
//  - 그림에 baked된 성벽·바위는 장식(충돌 없음). 파괴 가능한 성벽만 스프라이트로 얹는다
//    (플레이트 고정 5개 + stageTerrain의 절차 배치·스테이지 보충 — DESIGN §4.2)

import { CRACK, END_SCENE, END_SCENE_SEC, FUEL, LAYOUT, MAPS, PLATE, RENDER, TERRAIN, VIEW, type MapId } from "./balance";
import { drawTile, tileArtBox } from "./sprites";
import { getEffectSettings } from "./render-settings";

/** 지형 갈래. 앞 넷은 평원(§4.1), 뒤 셋은 도시(§0.7 J1-e — 건물·잔해·주유소).
 * **맵마다 쓰는 갈래가 다르다** — 목록은 `MAPS[id].terrain`이고, 여기 있는 것은 그 합집합이다 */
export type TerrainKind = "lake" | "hill" | "wall" | "pond" | "building" | "rubble" | "fuel";
export type Terrain = {
  kind: TerrainKind;
  x: number;
  y: number;
  r: number;
  /** 남은 HP. 파괴 가능한 성벽만 유한값, 나머지는 Infinity (§4.1: 1차 파괴 대상은 성벽뿐) */
  hp: number;
  /** **최초 HP**. 성벽(TERRAIN.wallHp)과 골렘 잔해(`debris.hp`)가 서로 다르므로 진행률을 그리려면
   * 분모가 개체마다 필요하다 (§0.6 C5 돌파 표식 · F ⓑ 피격 피드백이 같은 값을 쓴다) */
  hp0: number;
  /** 파괴됨 = 잔해. 사선도 진로도 열린다 (§4.2 "부수면 사선은 뚫리지만 적 진로도 뚫림").
   * **도시 맵(MAPS.city.vanish)에서는 잔해가 안 남는다** — §0.7 J1의 「2차 파괴 = 소멸」 */
  destroyed: boolean;
  /** **1차 파괴** (§0.7 J1 · 2단 파괴를 켠 맵에서만 선다). HP가 `CRACK.at`(50%) 아래로 내려간
   * 프레임에 서고, 그 뒤로 **사선 차단 반경이 `CRACK.losR`배로 준다**(`losRadius`).
   * 이동 차단·HP·드랍은 한 자리도 안 바뀐다 — 약해지는 것은 「내 탄을 막는 상자」뿐이다 */
  cracked?: boolean;
  /** 철거 드랍 (기본 = TERRAIN.wallScrap, §4.2). **스크랩 골렘이 낳은 잔해만 0이다** —
   * 그 수입은 골렘을 처치할 때 이미 다 줬고, 골렘은 §6 예산을 타는 잡몹이라 여기서 또 주면
   * 한 종이 «머릿수에 비례하는 두 번째 드랍원»이 된다 (§2 총수입 유지의 산술이 깨진다) */
  scrap?: number;
  /** **피격 반응 남은 시간(초)** (§0.6 F ⓑ). `RENDER.terrain.hit`에서 0까지 내려가고
   * `combat.ts updateCombat`이 매 프레임 깎는다. 그림 흔들림과 HP바 «또렷함»이 이 값을 본다 —
   * **절대 시각이 아니라 잔여 타이머**라 렌더가 시뮬 시각을 몰라도 된다(`Company.broken`과 같은 규약) */
  hitFx?: number;
  /** **붕괴 연출 남은 시간(초)** (§0.6 F ⓑ). 파괴 프레임에 `RENDER.terrain.fall`로 선다 */
  fallFx?: number;
  /** 파편 누적 피해 잔량. `RENDER.terrain.chip`을 넘을 때마다 파편 한 묶음이 나가고 그만큼 빠진다 */
  chip?: number;
};
export type Vec = { x: number; y: number };

/** 플레이트 픽셀 → 월드 변환. 링을 정원으로 펴기 위해 x·y 배율이 다르다 (balance.ts PLATE 주석) */
export type PlateFit = {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  /** 플레이트가 덮는 월드 사각형 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type GameMap = {
  /** 이 맵이 무엇인가 (§0.7 J 맵 2종 체계). 규칙은 `MAPS[id]` 한 곳에서 읽는다 —
   * 맵 갈래를 코드 여기저기서 문자열로 비교하면 새 맵마다 자리가 늘어난다 */
  id: MapId;
  w: number;
  h: number;
  /** 코어 = 월드 중심 */
  cx: number;
  cy: number;
  /** 레일 중심선 폐곡선 (등각 샘플, 시계방향) */
  loop: Vec[];
  /** 루프 최대 반경 (= 외경/2) */
  outerR: number;
  terrain: Terrain[];
  station: Vec;
  plate: PlateFit;
};

const LOOP_N = 180;

export type RandomSource = (() => number) & { getState(): number; setState(state: number): void };

export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.getState = () => a >>> 0;
  next.setState = (state: number) => { a = state >>> 0; };
  return next;
}

export function generateMap(_seed = 7, id: MapId = "plains"): GameMap {
  const w = VIEW.w * LAYOUT.mapScale;
  const h = VIEW.h * LAYOUT.mapScale;
  const cx = w / 2;
  const cy = h / 2;

  // 루프 외경 = **화면 실측** 짧은 변의 loopOuterPct (§5.0).
  // 카메라가 1/mapScale로 줌아웃하므로, 화면에서 그 비율로 보이려면 월드 반경은 mapScale배여야 한다
  const outerR = (Math.min(VIEW.w, VIEW.h) * LAYOUT.loopOuterPct * LAYOUT.mapScale) / 2;

  // 플레이트 정합: 그려진 레일 링이 이 정원과 겹치도록 x·y 배율을 따로 잡는다.
  // **그림이 맵마다 옮겨져 있다**(`MAPS[id].plateShift` — 도시 v2는 평원 대비 +151, −53px · 감독 #66 ①).
  // 링 중심과 픽셀 앵커를 **같은 양만큼** 밀어 읽으므로 아래 `toWorld`는 두 항이 상쇄돼 **맵과
  // 무관해진다** — 역사·지형·성벽·코어가 두 맵에서 같은 월드 좌표에 선다. 갈리는 것은 **플레이트
  // 사각형의 자리**뿐이고(밴드가 좌우로 다시 갈린다) 그것이 감독 #66 ①이 고치라고 한 바로 그것이다
  const sh = MAPS[id].plateShift;
  const sx = outerR / PLATE.rail.rx;
  const sy = outerR / PLATE.rail.ry;
  // **앵커 원점** = 평원 플레이트의 픽셀 좌표계. `toWorld`가 이것만 쓰므로 **시뮬이 보는 좌표는
  // 맵과 무관하고, 산술까지 문자 그대로 같다** — 역사·지형·성벽이 두 맵에서 같은 월드 좌표에 선다.
  // ⚠ **`+sh`와 `−sh`를 이 식 안에서 상쇄시키지 말 것**: 대수적으로는 같지만 부동소수 결과가
  // 마지막 자리에서 갈리고, `stageTerrain`의 기각 표본이 그 한 자리에 걸려 배치가 통째로 바뀐다
  // (iter113 실측 — 도시 s7 풀런이 60/60 · 425.5에서 **웨이브 12 사망**으로 갈렸다)
  const ax = cx - PLATE.rail.cx * sx;
  const ay = cy - PLATE.rail.cy * sy;
  // **그림만 옮겨 그린다** — 도시 v2는 평원 그림을 +151, −53px 민 것이라(감독 #66 ①) 그 픽셀만큼
  // 반대로 밀어 놓아야 그려진 링이 루프와 겹친다. 갈리는 것은 **플레이트 사각형의 자리**뿐이고,
  // 그 결과가 감독 #66 ①이 고치라고 한 것이다(밴드 좌 227.7/우 95.1 → 좌우 161.2/161.7)
  const ox = ax - sh.dx * sx;
  const oy = ay - sh.dy * sy;
  const plate: PlateFit = {
    sx,
    sy,
    ox,
    oy,
    x0: ox,
    y0: oy,
    x1: ox + PLATE.w * sx,
    y1: oy + PLATE.h * sy,
  };
  // 반경은 한 배율만 쓸 수 없으므로 평균 — x·y 배율 차가 5.7%뿐이라 판정 오차는 3% 미만이다
  const sr = (sx + sy) / 2;
  const toWorld = (px: number, py: number): Vec => ({ x: ax + px * sx, y: ay + py * sy });

  // 루프 = 정원 (플레이트의 레일 링을 정원으로 펴 붙였으므로)
  const loop: Vec[] = [];
  for (let i = 0; i < LOOP_N; i++) {
    const a = (i / LOOP_N) * Math.PI * 2;
    loop.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) });
  }

  // 지형 = 플레이트 그림 위치 고정 (§5.0 "지형은 외곽 전장에" — 전부 루프 밖이어야 한다)
  const terrain: Terrain[] = MAPS[id].terrain.map((t) => {
    const p = toWorld(t.x, t.y);
    // **구운 지물 중 «폭발 지물»만 유한 HP다** (§0.7 J1-c). 나머지(호수·언덕·건물·잔해밭)는
    // 그림을 갈아 낄 수가 없으니 부술 수 있게 하면 안 된다 — 부순 자리에 온전한 그림이 남는다.
    // 주유소만 예외인 근거는 **터진 뒤의 그림이 「그을음」 한 겹으로 서기 때문**이다(map.ts 그리기 ⑤).
    // ⚠ 이 한 줄이 「2차 파괴 순간」을 만든다 — 무한 HP는 `damageTerrain`이 그대로 튕겨 낸다
    const hp = explosive(t.kind as TerrainKind) ? fuelHpValue() : Infinity;
    return { kind: t.kind as TerrainKind, x: p.x, y: p.y, r: t.r * sr, hp, hp0: hp, destroyed: false };
  });
  // 파괴 가능한 성벽만 스프라이트로 얹는다 (그림의 성벽은 장식)
  const wallR = PLATE.wallR * sr * wallScaleOf(id);
  const grow = wallR - PLATE.wallR * sr;
  for (const wl of PLATE.walls) {
    const p = toWorld(wl.x, wl.y);
    // **레일 쪽 가장자리를 고정하고 바깥으로 자란다** (§0.6 F ⓐ · TERRAIN.wallScale ①).
    // 여유는 «중심거리 − 반경 − outerR»이므로 반경 증가분만큼 중심을 코어 반대쪽으로 밀면
    // 고정 5개의 레일 여유(실측 81.7)가 한 자리도 안 움직인다. 안 밀면 53으로 내려간다
    const d = Math.hypot(p.x - cx, p.y - cy);
    terrain.push({
      kind: "wall",
      x: cx + ((p.x - cx) / d) * (d + grow),
      y: cy + ((p.y - cy) / d) * (d + grow),
      r: wallR,
      hp: TERRAIN.wallHp,
      hp0: TERRAIN.wallHp,
      destroyed: false,
    });
  }

  // 역: 그림의 역사 위치 (§5.0 남측 레일 밀착). 그림은 플레이트가 그리고 이 값은 정차 앵커다
  const station = toWorld(PLATE.station.x, PLATE.station.y);

  return { id, w, h, cx, cy, loop, outerR, terrain, station, plate };
}

/** **런 도중 맵을 갈아 끼운다** (DESIGN §0.7 O ⓑ · `BALANCE.ROUTE`). 부르는 자리는 **정차의
 * 「출발」 하나뿐이다** — 필드가 비어 있는 유일한 프레임이라(save.ts 머리말) 갈아 낀 지형 위에
 * 적·드랍·투사체가 얹혀 있을 일이 없다.
 *
 * **갈리는 것은 `id`·`plate`·`terrain` 셋뿐이다** — `cx`/`cy`/`loop`/`outerR`/`station`은
 * `generateMap`의 앵커가 맵과 무관해서(위 `toWorld` 주석) 두 맵에서 **문자 그대로 같은 값**이 나온다.
 * 그래서 열차 궤도(`buildTrack(map.loop)`)도 스폰 링도 다시 세울 것이 없다.
 * ⚠ **배열은 갈아 끼운다 — 참조는 그대로 둔다**(`map.terrain =`가 아니라 length 0 + push).
 * 지형 배열을 들고 있는 쪽이 있으면 재할당은 조용히 옛 배열을 남긴다(save.ts `applySave`와 같은 규약).
 * ⚠ 부르는 쪽이 **함께** 해야 하는 것 넷: 플로우필드 재계산 · `combat`의 맵 규칙 사본 갱신 ·
 * 배경 재굽기(`loadPlate` → `buildBackground`) · 언덕 수 재계수(`setMapHills`). main.ts가 한다 */
export function switchMap(map: GameMap, id: MapId, seed: number): void {
  const next = generateMap(seed, id);
  map.id = next.id;
  map.plate = next.plate;
  map.terrain.length = 0;
  for (const t of next.terrain) map.terrain.push(t);
}

/** 스테이지 `stage` 시작 시점의 **파괴 가능 지형지물**을 채운다 (DESIGN §4.2 "지형 보충").
 *  · stage 1 = 초기 채움 — 플레이트 고정 5개에 절차분을 얹어 TERRAIN.place.start(10)까지
 *  · stage 2+ = 보충 — 3~4개를 **새 위치에** 추가
 * 둘 다 살아 있는 지물 수가 `cap`을 넘지 않는다. 잔해는 세지 않으므로 부순 만큼 다시 들어온다.
 *
 * ⚠ **위 한 줄(「부순 만큼 다시 들어온다」)은 문자 그대로는 «거짓»이고, 그것이 STATUS 표 12였다 —
 * 그리고 그 표는 감독 판정 3(DESIGN §0.7 · 2026-08-24)으로 닫혔다.** 간격(`gap`) 기각이 **파괴된
 * 성벽까지** 세므로 부순 자리가 영영 못 쓰는 땅이 되고, 실측으로 **평원은 스테이지 1부터 보충이
 * 74 중 2**(웨이브 60에 성벽 **0장** 생존) · **도시는 스테이지 7부터 굶어 83 중 42**다.
 * ⚠ **문면대로 채우는 길은 있고(`?slotfree=1`) 그 길은 두 맵의 완주를 부순다** — 평원 `60/60 · 333.4`
 * → **57/60 · 507.5**, 도시 `60/60 · 509.3` → **48/60 · 553.4**(iter124 실측 · 되살아난 성벽이 내
 * 사선을 막는다: `losBlocked` 평원 16,452 → 34,594).
 * ⚠ **감독의 판정**: §4.2의 목적은 **«기믹이 죽지 않는 것»이지 «지물 수를 유지하는 것»이 아니다.**
 * 스테이지당 보충(3~4개)은 유지하되 **완주를 깨면서까지 채우지 않는다** — **상한은 맵별 `cap`이
 * 정한다.** 그래서 **기본값 `slotFree=false`가 정본이고**, `?slotfree=1`은 사다리 손잡이로만 남는다.
 * 「굶는다」는 이제 결함이 아니라 **cap이 완주 쪽으로 낸 값**이다(눈금 `terrain.stageWants`는 그대로
 * 둔다 — 「기믹이 죽었는가」는 `want>placed`가 아니라 `wallsAlive`·`terrainShots`로 읽는다).
 * ⚠ **`?slotfree=1`은 배치를 «런 이력»에 종속시킨다**(아래 ②가 경고하던 바로 그것이다) — 그래서
 * 이어하기는 **좌표째로 싣도록 이미 고쳐 뒀다**(save.ts `terrain` · VERSION 6). 그 전제 제거는
 * 스위치와 무관하게 항상 켜져 있다 = 기본 경로도 더 이상 「재생성으로 같은 배열」에 기대지 않는다.
 *
 * 배치 규칙은 §5.0 그대로다 — 루프 밖(레일 여유 `railClear`) · 기존 지물과 `gap` 이상 · 맵 가장자리 `edge` 안.
 * 세로 외곽 전장이 루프 반경의 0.92배뿐이라(§5.0) 루프 바로 위/아래 중앙은 자리가 없다 —
 * 기각 표본이라 좌우·대각으로 자연히 몰린다. 시드는 스테이지 번호라 같은 런은 같은 배치가 나온다(QA 재현성).
 * @returns `{ want, placed }` — **둘을 갈라 돌려주는 것이 이 함수의 눈금이다**(probe `terrain.stageWants`).
 * `want > placed`면 그 스테이지의 보충이 굶은 것이고, §4.2의 「다 부숴도 계속」이 그만큼 안 선다 */
export function stageTerrain(map: GameMap, stage: number, fresh = false): { want: number; placed: number } {
  const P = MAPS[map.id].place;
  // **골렘 잔해(scrap 0)는 이 규칙 밖이다** (§8.②). 두 가지가 여기 걸려 있다:
  //  ① 상한(cap)·간격(gap)을 잔해가 먹으면, 골렘이 나온 런에서만 맵의 **기본 지형이 조용히 줄어든다**
  //     — cap 13은 «맵 설계가 유지하는 지물 수»(§4.2)이고 잔해는 «런 중의 사건»이라 축이 다르다
  //  ② 그리고 잔해가 상한을 먹으면 골렘이 나온 런에서만 지물 수가 갈린다 — 축이 다른 두 가지를
  //     한 예산에 넣는 것이라 그 자체로 틀렸다. ⚠ **이 주석이 원래 들던 두 번째 근거(「배치가 런
  //     이력에 종속되면 이어하기가 같은 배열을 못 재현한다」)는 iter124에 무효가 됐다** —
  //     이어하기가 배열을 재현하는 대신 **좌표째로 싣게** 됐기 때문이다(save.ts `terrain`)
  const own = (t: Terrain) => t.scrap !== 0;
  const alive = () => map.terrain.filter((t) => own(t) && t.kind === "wall" && !t.destroyed).length;
  const rnd = mulberry32(stage * 7919 + 13);
  const sr = (map.plate.sx + map.plate.sy) / 2;
  const r = PLATE.wallR * sr * wallScaleOf(map.id);
  // `fresh` = **새 구역에 막 들어선 스테이지**(§0.7 O ⓑ 맵 전환 · 스테이지 1도 이 경우다).
  // 갈아 낀 판에는 플레이트 고정 성벽뿐이라 보충(3~4)만 얹으면 그 구역이 8장으로 시작한다 —
  // 도시 정본은 `start 20`이고, 그 값에 닿는 길은 초기 채움 하나뿐이다
  const want = fresh || stage <= 1 ? wallStartOf(map.id) - alive() : P.add[0] + (rnd() < 0.5 ? 1 : 0);
  const n = Math.min(want, P.cap - alive());
  let placed = 0;
  // **전투 환의 안쪽 테두리** = 옛 「루프 밖 + 레일 여유」와 **같은 선**이다(이 함수의 불변).
  const ringMin = map.outerR + r + P.railClear;
  for (let i = 0; i < n; i++) {
    // **전투 환 우선 배치** (§5.0 「지형 배치」 개정 · DESIGN §0.8 판정 ③ · iter167).
    // 옛 규칙은 «맵 사각형에서 균일하게 뽑아 첫 합격점»이라, 지물이 전선(`place.ringOuterU`)
    // 밖에 앉아 사선을 막을 일이 없는 장식이 됐다. 이제 600회 표본 중 **코어에 가장 가까운 합격점**을
    // 고른다 — 전투 환이 비어 있으면 거기가 뽑히고, **차면 그 «바로 바깥»이 이어받는다.**
    // ⚠ **고리로 «제한»하지 않는 것이 요점이다** — 제한하면 고리가 찬 뒤 보충이 조용히 굶고,
    // 그것은 §4.2가 금지한 것이다(`place.cap` 주석과 같은 규약). `railClear`·`gap`·`edge`·`cap`은
    // 한 자도 안 갈렸다(INBOX #77 ⑤ 명문) — 갈린 것은 **합격점 중 어느 것을 고르는가** 하나다.
    let bx = 0;
    let by = 0;
    let bd = Infinity;
    for (let tries = 0; tries < 600; tries++) {
      const x = P.edge + r + rnd() * (map.w - 2 * (P.edge + r));
      const y = P.edge + r + rnd() * (map.h - 2 * (P.edge + r));
      const d = Math.hypot(x - map.cx, y - map.cy);
      // 루프 밖 + 레일 여유 (§5.0 "지형은 외곽 전장에" — 루프 안은 코어+드랍만)
      // **`?ringplace=0`이면 이 가지치기 한 칸만 꺼진다** = iter167 이전의 「첫 합격점」 규칙(아래 break).
      // `railClear`(ringMin)·`gap`·`edge`·`cap`·난수 시드는 한 자도 안 갈린다 — 갈리면 A/B가 아니다
      if (d < ringMin || (qaRingPlace && d >= bd)) continue;
      // **파괴된 성벽은 자리를 안 잡는다** (위 ⚠). 도시는 소멸해 아무것도 없고, 평원의 잔해도
      // §4.2가 말하는 「잔존물」이 아니다 — 사선도 진로도 안 막으므로 과밀의 분모에 들 것이 없다
      if (map.terrain.some((t) => own(t) && !(qaSlotFree && t.destroyed) && Math.hypot(x - t.x, y - t.y) < t.r + r + P.gap))
        continue;
      bx = x;
      by = y;
      bd = d;
      if (!qaRingPlace) break;
    }
    if (bd === Infinity) continue;
    map.terrain.push({ kind: "wall", x: bx, y: by, r, hp: TERRAIN.wallHp, hp0: TERRAIN.wallHp, destroyed: false });
    placed++;
  }
  return { want: n, placed };
}

/** 직사를 막는 지형인가 (§4.1: 언덕·성벽. 웅덩이·호수는 사격에 무관).
 * 파괴된 성벽은 잔해라 사선을 막지 않는다 */
export function blocksLos(t: Terrain): boolean {
  return solidCover(t) || (t.kind === "wall" && !t.destroyed);
}

/** **직사를 막되 부술 수 없는 차단물**인가 — 곡사(와 관측칸)만 넘어간다.
 *
 * ⚠ **도시의 건물·주유소는 기본적으로 여기 안 든다** (§0.7 J1-e 착지점 · iter114 실측).
 * 근거는 §0.7 J1 자신이다 — 도시 맵의 핵심 기믹이 「사선을 여는 데 내 화력을 쓴다 · 2차 파괴 =
 * 소멸하고 더는 아무것도 막지 않는다」인데, **플레이트에 구운 건물은 HP가 무한이라 영영 안 열린다.**
 * 그것을 사선 차단으로 세우면 「열 수 없는 사선」이 7장 상시로 서고 도시 완주가 부러진다
 * (실측: 완주 60/60 → **웨이브 9 사망** · 사선만 켜고 진로를 끄면 웨이브 12 = **사선이 범인**).
 * 그래서 건물·주유소는 **진로만** 막는다(`blocksMovement` — 「그려진 벽을 적이 통과한다」는 여기서
 * 닫힌다) — 이 맵에서 사선을 막는 것은 **부술 수 있는 성벽**과 언덕뿐이고, 그것이 J1의 문면이다.
 * ⚠ **언덕은 진로를 안 막는다**(§4.1 "통과하되 감속") — 이동 차단은 `blocksMovement`가 따로 가른다.
 * ⚠ 「건물도 사선을 막아야 한다」는 판정은 **열린 미결 질문**이다(STATUS) — 사다리를 다시 재려면
 *    아래 `?coverlos=1`을 켠다. 값을 굳히지 않은 이유는 완주가 걸린 판정이라서다 */
export function solidCover(t: Terrain): boolean {
  if (t.kind === "hill") return true;
  return qaCover === "both" && cityCover(t);
}

/** 이 지물이 **도시 플레이트에 구워진 지물**인가 (건물·주유소). `rubble`은 안 든다 —
 * 잔해밭은 밟고 서는 은신처라 애초에 막는 쪽 이야기가 아니다 (§8.③) */
export function cityCover(t: Terrain): boolean {
  return t.kind === "building" || t.kind === "fuel";
}

/** **폭발 지물**인가 (§0.7 J1-c · 감독 #66 ⑤). 「구운 지물 중 유일하게 부술 수 있는 것」의 한 줄
 * 술어이고, `generateMap`(유한 HP를 굽는다) · `combat.ts damageTerrain`(2차 파괴에 폭발을 세운다) ·
 * `drawMap`(HP바·그을음)이 **이 한 곳**을 본다. `Terrain`이 아니라 갈래를 받는 이유는 맵을 굽는
 * 시점에도 물어야 하기 때문이다(그때는 아직 `Terrain`이 없다) */
export function explosive(kind: TerrainKind): boolean {
  return kind === "fuel";
}

/** 도시의 구운 지물이 **진로**를 막는가 (`?cover=move|both`). flow.ts `blocksMovement`가 이것을 본다 */
export const coverBlocksMove = (): boolean => qaCover !== "off";

/** **사선을 막는 반경** (§0.7 J1 「1차 파괴 = 차단 판정이 약해진다」). 판정 반경 `t.r`과 갈려 있다 —
 * 이동 차단·밀어내기·돌파는 여전히 `t.r`을 보고, **줄어드는 것은 사선(그리고 도시 맵에서는
 * 「내 탄이 맞는 상자」)뿐**이다. 둘을 한 값으로 두면 1차 파괴가 적의 진로까지 바꿔 버린다 */
export function losRadius(t: Terrain): number {
  return t.cracked ? t.r * crackLosR() : t.r;
}

// QA 손잡이 둘 (iter105 · §0.7 J-검증). **BALANCE 정본이 아니라 사다리용 A/B**다 — `?hpgrow=`·`?w0=`과
// 같은 부류이고, 둘 다 BALANCE §0.7이 「루프 제안 · 감독 등재 대기」로 열어 둔 값이라
// **사다리를 재는 손잡이가 없으면 제안을 갱신할 수가 없다**(도시 풀런이 완주에 실패했다).
//  · `?wallscale=` = 지물 반경 배수(`MAPS[id].wallScale`) — 개수는 그대로 두고 **크기**만 움직인다
//  · `?crackr=`   = 1차 파괴 뒤의 사선 차단 반경 배수(`CRACK.losR`)
// ⚠ **`generateMap`보다 먼저 세워야 한다** — 반경은 맵을 굽는 시점에 한 번 정해진다
/** 도시의 구운 지물(건물·주유소)이 무엇을 막는가 — QA `?cover=`. 기본은 **아무것도 안 막는다** */
export type CoverMode = "off" | "move" | "both";
let qaCover: CoverMode = "off";
let qaWallScale: number | null = null;
let qaCrackLosR: number | null = null;
let qaWallStart: number | null = null;
export const setQaWallScale = (v: number): void => void (qaWallScale = v);
export const setQaCrackLosR = (v: number): void => void (qaCrackLosR = v);
export const setQaWallStart = (v: number): void => void (qaWallStart = v);
let qaFuelHp: number | null = null;
//  · `?fuelhp=<n>` = **폭발 지물의 HP**(`FUEL.hp`). §0.7 J1-c의 값 셋 중 「언제 터뜨릴지를 고른다」에
//    값을 매기는 칸이고, `FUEL` 전체가 **루프 제안 · 감독 등재 대기**라 사다리 손잡이가 필요하다.
//    ⚠ **`generateMap`보다 «먼저» 세워야 한다** — HP는 맵을 굽는 시점에 한 번 정해진다
export const setQaFuelHp = (v: number): void => void (qaFuelHp = v);
/** 이 런이 실제로 쓰는 폭발 지물 HP (probe `terrain.map.fuel.hp`가 이 값을 찍는다) */
export const fuelHpValue = (): number => qaFuelHp ?? FUEL.hp;
//  · `?cover=off|move|both` = 도시의 구운 지물이 막는 범위(기본 `off` · `solidCover` 주석의 사다리).
//    이 항목이 미결로 남은 이유가 「완주가 걸렸다」라서, **사다리를 재는 손잡이가 없으면 제안을
//    갱신할 수가 없다** — `?wallscale=`·`?crackr=`와 같은 부류다
export const setQaCover = (m: CoverMode): void => void (qaCover = m);
/** 이 런이 실제로 쓴 범위 (probe `terrain.map.cover`가 이 값을 찍는다) */
export const coverMode = (): CoverMode => qaCover;
/** 이 런이 실제로 쓰는 지물 반경 배수 (QA가 덮었으면 그 값). 굽기·보충이 같은 식을 써야 한다 */
export const wallScaleOf = (id: MapId): number => qaWallScale ?? MAPS[id].wallScale;
/** 이 런이 실제로 쓰는 **스테이지 1 목표 개수** (QA가 덮었으면 그 값).
 * `cap`은 안 건드리므로 보충(`add`)이 그대로 돌아 **후반 밀도는 정본대로** 24~32에 든다 —
 * 갈리는 것은 「초반에 몇 개로 시작하는가」뿐이다(iter106이 도시의 세금이 앞에 몰린 것을 실측했다) */
export const wallStartOf = (id: MapId): number => qaWallStart ?? MAPS[id].place.start;
/** 이 런이 실제로 쓰는 1차 파괴 사선 배수 (probe `terrain.map.losR`가 이 값을 찍는다) */
export const crackLosR = (): number => qaCrackLosR ?? CRACK.losR;
let qaRingPlace = true;
//  · `?ringplace=0|1` = **전투 환 우선 배치**(iter167 · DESIGN §0.8 판정 ③)를 켜고 끈다. 기본 **1**이
//    정본이고, `0`이면 600회 표본에서 **첫 합격점**으로 돌아간다(= iter167 이전의 규칙).
//    ⚠ **`stageTerrain`의 다른 칸은 한 자도 안 갈린다** — `railClear`·`gap`·`edge`·`cap`·난수 시드가
//    그대로라 두 컷의 차이는 「합격점 중 어느 것을 고르는가」 하나뿐이다(= 그것이 A/B의 정의다).
//    ⚠ **`generateMap`보다 «먼저» 세워야 한다** — 스테이지 1의 초기 채움이 맵을 굽는 자리에서 돈다
export const setQaRingPlace = (v: boolean): void => void (qaRingPlace = v);

let qaSlotFree = false;
//  · `?slotfree=1` =**파괴된 지물이 보충의 자리를 비운다** = §4.2 문면(「기존 **잔존물**과 합쳐
//    과밀해지지 않게」 · 「다 부숴도 기믹이 계속 작동하게」). ⚠ **기본값이 «0»인 것은 문면이 아니라
//    실측 때문이다** — 1로 두면 §4.2는 서지만 **두 맵의 완주가 부러진다**(iter124 실측: 평원
//    `60/60 · 333.4` → **57/60 · 507.5** · 도시 `60/60 · 509.3` → **48/60 · 553.4**). 완주가 걸린
//    판정을 정본이 아닌 채로 굳히지 않는 것이 이 저장소의 규약이라(`?cover=`·`?acidlock=`과 같은
//    자리) **기본은 옛 동작이고 이 스위치가 사다리를 재는 유일한 손잡이다** — STATUS 표 12
export const setQaSlotFree = (v: boolean): void => void (qaSlotFree = v);
/** 파괴된 지물이 보충의 자리를 비우는가 (probe `terrain.slotFree` · 기본 **false** = 옛 동작) */
export const slotFree = (): boolean => qaSlotFree;

let qaTwoStage: boolean | null = null;
//  · `?twostage=0|1` = **이 런의 2단 파괴 on/off**(`MAPS[id].twoStage`). 표 6(「평원도 2단 파괴를
//    켜는가」)이 **「안 쟀다」로 열려 있었던 이유가 바로 손잡이가 없어서**다 — `?terrladder=1`은
//    피해 사다리를 «한 컷에 세우는» 그림 손잡이지 이 규칙을 갈지 않는다(iter136이 갈라냈다).
//    켜면 그림만 갈리는 것이 아니라 **`CRACK.losR`(0.55)이 함께 걸려 사선 차단이 절반으로 준다** =
//    밸런스 변경이라 완주 재측정이 필요하고, 그래서 `?cover=`·`?slotfree=`와 같은 부류의
//    **A/B 손잡이**로 둔다(BALANCE 정본이 아니다)
export const setQaTwoStage = (v: boolean): void => void (qaTwoStage = v);
/** 이 런이 실제로 쓰는 2단 파괴 여부 (probe `terrain.map.twoStage`가 이 값을 찍는다).
 * 규칙을 읽는 자리가 셋(`combat.ts` 굽기 · `save.ts` 되읽기 · probe)이라 **한 문을 지나야** 한다 */
export const twoStageOf = (id: MapId): boolean => qaTwoStage ?? MAPS[id].twoStage;

/** **밟고 설 수 있는 은신처**인가 (§8.③ "언덕·잔해 경유 중에만 은신"). `hideAt`(위치 판정)과
 * enemy.ts `hideTarget`(경유지 선택)이 **같은 술어를 봐야** 한다 — 두 벌이면 「숨을 수 있다고 믿고
 * 갔는데 안 숨어지는 자리」가 생긴다. 도시의 `rubble`은 그려진 잔해밭이라 언덕과 같은 자리에 든다.
 * `wallRubble` = 이 맵에서 **부순 성벽이 잔해로 남는가**(소멸 맵은 안 남는다) */
export function hideKind(t: Terrain, wallRubble: boolean): boolean {
  return t.kind === "hill" || t.kind === "rubble" || (wallRubble && t.kind === "wall" && t.destroyed);
}

/** (x, y)가 **은신처** 위인가 (§8.③ 그림자 암살자 "언덕·잔해 경유 중에만 은신").
 * 후보는 «밟고 설 수 있는 지형»뿐이다 — 온전한 성벽·골렘 잔해는 `blocksMovement`가 밀어내므로
 * 그 안에 서 있는 개체 자체가 없고, 물은 지형 위가 아니라 지형 안이다.
 * 그래서 남는 것이 정확히 §8.③의 문면인 **언덕과 잔해(부서진 성벽)** 둘이다 */
export function hideAt(map: GameMap, x: number, y: number): boolean {
  // **소멸 맵(도시)에는 잔해가 없다** — 그림이 사라진 자리에서 은신하면 「무엇에 숨었는지」가
  // 화면에 하나도 없다. 그 맵에서 남는 은신처는 언덕뿐이다
  const wallRubble = !MAPS[map.id].vanish;
  return map.terrain.some((t) => hideKind(t, wallRubble) && Math.hypot(x - t.x, y - t.y) < t.r);
}

/** (x, y)를 지나는 유닛의 이속 배율 (§4.1 "통과하되 감속"). 겹치면 가장 느린 쪽을 따른다 */
export function slowAt(map: GameMap, x: number, y: number): number {
  let s = 1;
  for (const t of map.terrain) {
    const f = TERRAIN.slow[t.kind];
    if (f === undefined || t.destroyed || f >= s) continue;
    if (Math.hypot(x - t.x, y - t.y) < t.r) s = f;
  }
  return s;
}

/** 코어 발광 웅덩이 (감독 #5 V3 "코어 발광 펄스"). 목업의 코어에는 청록 빛이 바닥에 깔려 있는데
 * 플레이트가 그린 결정은 그 웅덩이가 없어 코어가 잔디 위의 작은 소품으로 보인다.
 * **지면 레이어**다 — 적·열차보다 아래에 깔아야 빛 웅덩이지 유닛 위의 안개가 아니다.
 * 맥동은 난수가 아니라 t의 사인파라 스크린샷 QA가 재현된다(화면 진동과 같은 규칙) */
/** **지형 셀의 이름** — 「그림을 그리는 쪽」과 「그림 위에 무엇을 놓는 쪽」이 반드시 같은 셀을 봐야
 * 한다. 규약이 두 벌이 되면 다음 시트에서 조용히 어긋난다(iter96가 `tileArtBox`의 인자를
 * `drawTile`과 같게 둔 것과 같은 이유) */
export function terrainTile(t: Terrain): string {
  // **파손(1단)의 «셀»은 온전 셀이다** — 파손은 셀 한 장이 아니라 **두 장의 합성**이라
  // (`drawTerrainBody`) 밑동이 온전 그림이고, 그러니 상자를 재는 쪽도 온전 셀을 봐야 한다.
  // 잘려 나간 윗부분은 `terrainArt`가 `RENDER.terrain.hurtKeep`으로 상자에서 뺀다
  return terrainStage(t) === 2 ? "wall_broken" : t.scrap === 0 ? "scrap" : "wall";
}

/** **파괴 3단** (§0.7 J1-b · 감독 #66 ④ 「단계별로 부서지는 모습이 보이도록」).
 * `0 = 온전 · 1 = 파손 · 2 = 잔해`. **판정은 한 자리도 안 바뀐다** — 1단은 `t.cracked`(=`CRACK.at`
 * 50% 아래), 2단은 `t.destroyed`(HP 0)라 여기 있는 것은 그 둘을 **그림 쪽 한 이름으로 묶은 것**뿐이다.
 * 2단 파괴를 안 켠 맵(평원 `twoStage: false`)에서는 1단이 서지 않으므로 0↔2만 오간다.
 * `terrainTile`·`terrainArt`·`drawMap`이 **이 한 곳**을 봐야 그림과 상자가 안 갈린다(iter96 규약) */
export function terrainStage(t: Terrain): 0 | 1 | 2 {
  return t.destroyed ? 2 : t.cracked ? 1 : 0;
}

/** **「그려진 지물」의 중심·반폭·반높이**(월드). `t.r`(판정 반경)은 그림의 크기가 아니다 —
 * 지형 셀은 그림이 셀의 일부만 채운다(성벽 = 셀 높이의 25% · 골렘 잔해 = 가로 38%/세로 37%).
 * 그래서 **지물 위/아래에 무엇을 놓는 연출은 전부 이 상자를 봐야 한다**: HP바·접지 그림자(여기)와
 * 돌파 표식(enemy.ts)이 그 셋이다. 상자가 없으면(스프라이트 미로드) 예전대로 반경으로 물러선다.
 * `x`는 피격 흔들림이 실린 **그림 좌표**를 받기 위한 것이고, 기본값은 판정 좌표다 */
export function terrainArt(t: Terrain, x = t.x): { cx: number; cy: number; hw: number; hh: number } {
  const box = tileArtBox(terrainTile(t), x, t.y, t.r * 2);
  if (!box) return { cx: x, cy: t.y, hw: t.r, hh: t.r };
  // **파손 단계는 윗부분이 무너져 «없다»** (§0.7 J1-b). 그림이 줄었으니 그 위에 놓는 HP바도,
  // 아래에 까는 접지 그림자도 같이 내려와야 한다 — 안 그러면 바가 «없는 벽 위»에 뜬다
  const y0 = terrainStage(t) === 1 ? box.y1 - (box.y1 - box.y0) * RENDER.terrain.hurtKeep : box.y0;
  return { cx: (box.x0 + box.x1) / 2, cy: (y0 + box.y1) / 2, hw: (box.x1 - box.x0) / 2, hh: (box.y1 - y0) / 2 };
}

/** Small crystal-contact flash above the baked core. No RNG or gameplay state changes. */
export function drawCoreImpact(ctx: CanvasRenderingContext2D, map: GameMap, hit: { age: number; heavy: boolean }): void {
  if (hit.age >= 0.32) return;
  const { reducedEffects, reducedMotion } = getEffectSettings();
  const p = hit.age / 0.32, fade = (1 - p) ** 2;
  const r = LAYOUT.coreSize, x = map.cx + r * 0.04, y = map.cy - r * 0.12;
  const strength = (hit.heavy ? 1 : 0.72) * (reducedEffects || reducedMotion ? 0.5 : 1);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 0.24);
  glow.addColorStop(0, `rgba(208, 252, 249, ${fade * strength * 0.55})`);
  glow.addColorStop(1, "rgba(128, 225, 227, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x-r*0.24, y-r*0.24, r*0.48, r*0.48);
  // Three short facet glints, not a full silhouette or permanent cracks.
  ctx.strokeStyle = `rgba(235, 255, 246, ${fade * strength})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (map.id === "city") {
    ctx.moveTo(x-r*.10,y-r*.03); ctx.lineTo(x-r*.03,y); ctx.lineTo(x+r*.01,y-r*.04);
    ctx.moveTo(x+r*.04,y+r*.015); ctx.lineTo(x+r*.08,y+r*.04); ctx.lineTo(x+r*.12,y);
  } else {
    ctx.moveTo(x-r*.055,y); ctx.lineTo(x+r*.025,y-r*.085); ctx.lineTo(x+r*.075,y-r*.02);
    ctx.moveTo(x+r*.025,y-r*.085); ctx.lineTo(x+r*.005,y+r*.09);
  }
  ctx.stroke();
  if (!reducedEffects && !reducedMotion) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(172, 229, 219, ${fade * 0.9})`;
    for (let i=0;i<5;i++) {
      const a = i * Math.PI * 2 / 5 + 0.35;
      const d = r * (0.095 + p * 0.15), size = r * (i%2 ? .018 : .024);
      const px = x + Math.cos(a)*d, py = y + Math.sin(a)*d*.7 + p*p*r*.06;
      ctx.beginPath(); ctx.moveTo(px,py-size); ctx.lineTo(px+size*.6,py); ctx.lineTo(px,py+size*.7); ctx.lineTo(px-size*.6,py); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawCoreGlow(ctx: CanvasRenderingContext2D, map: GameMap, t: number, health = 1, pressure = false) {
  const g = RENDER.coreGlow;
  const r = LAYOUT.coreSize * g.r;
  const k = getEffectSettings().reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * g.rate * Math.PI * 2);
  const danger = Math.max(0, 1 - health / 0.35);
  const a = (g.alpha[0] + (g.alpha[1] - g.alpha[0]) * k) * (pressure ? 0.95 : 0.32);
  const pool = ctx.createRadialGradient(map.cx, map.cy, 0, map.cx, map.cy, r);
  pool.addColorStop(0, `rgba(${g.color}, ${a.toFixed(3)})`);
  pool.addColorStop(0.5, `rgba(${g.color}, ${(a * 0.5).toFixed(3)})`);
  pool.addColorStop(1, `rgba(${g.color}, 0)`);
  ctx.save();
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(map.cx, map.cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 중심 하이라이트만 가산 — 결정 바로 밑이 실제로 "빛나는" 자리다
  const hr = r * g.hot;
  const hot = ctx.createRadialGradient(map.cx, map.cy, 0, map.cx, map.cy, hr);
  hot.addColorStop(0, `rgba(${g.color}, ${(a * g.hotAlpha).toFixed(3)})`);
  hot.addColorStop(1, `rgba(${g.color}, 0)`);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hot;
  ctx.beginPath();
  ctx.arc(map.cx, map.cy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (danger > 0 || pressure) {
    ctx.save();
    ctx.strokeStyle = danger > 0 ? `rgba(235, 117, 72, ${0.35 + danger * 0.4})` : "rgba(148, 219, 217, 0.55)";
    ctx.lineWidth = 2;
    const rr = LAYOUT.coreSize * 0.47;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(map.cx, map.cy, rr, i * Math.PI / 2 + 0.2, i * Math.PI / 2 + 0.9); ctx.stroke();
    }
    ctx.restore();
  }
}

/** **엔드 씬 — 코어 파괴 연출** (DESIGN §0.7 M · 값은 BALANCE `END_SCENE`). `drawCoreGlow`와 같은
 * 자리에 두는 이유는 하나다 — **코어의 그림은 플레이트에 구워져 있어**(plate.ts) 색을 «갈아» 칠할
 * 방법이 없다. 그래서 연출은 전부 **그 위에 덧그리는 빛**이고, 플레이트를 갈아 끼워도 그대로 산다.
 *
 * 호출부는 월드 변환이 걸린 상태이고(main.ts render), **화면 전체 섬광만 안에서 잠깐 화면 좌표로
 * 돌아간다**(save/restore가 변환을 되돌린다). `t` = `combat.endT` = **연출만의 시계**다 —
 * 시뮬이 멎어 있으므로 `field.t`·`simT`는 이 창 동안 한 프레임도 안 흐른다.
 *
 * 난수를 한 번도 안 쓴다(균열 각·파편 각이 고정 등각) — **`?corehp=1` 컷이 프레임 단위로 재현된다**.
 * ⚠ **도시 맵은 같은 4단을 「타워의 어휘」로 옮긴다**(정본 말미) — 원반 대신 **에너지 기둥**이 서고
 *   같은 색 곡선을 탄다. 갈리는 것은 «무엇이 물드는가»뿐이고 단계도 시간도 한 칸도 안 갈린다 */
export function drawEndScene(ctx: CanvasRenderingContext2D, map: GameMap, t: number): void {
  const E = END_SCENE;
  const t1 = E.holdSec;
  const t2 = t1 + E.tintSec;
  const t3 = t2 + E.crackSec;
  // ① 정지 — **그릴 것이 없는 것이 이 단계의 내용**이다. 화면이 한 자리도 안 변하는 한 박자가
  //    「시간이 멎었다」를 만든다(무엇을 더 그리면 그 박자가 사라진다)
  if (t < t1) return;
  const R = LAYOUT.coreSize;
  const body = R * E.bodyR;
  const tower = map.id === "city";

  // ④ 이후 — 코어가 있던 자리. 결과화면 덮개가 `#000000b3`(70%)라 **이 자리가 비어 보여야** 한다.
  // 안 그리면 플레이트의 청록 결정이 그대로 비쳐 「부순 코어가 되살아난」 것으로 읽힌다
  if (t >= END_SCENE_SEC) {
    ctx.save();
    // ④의 어둠과 **같은 그라디언트**여야 한다 — 여기서 옅어지면 결과화면 아래로 결정이 되살아난다
    const gone = ctx.createRadialGradient(map.cx, map.cy, 0, map.cx, map.cy, body * 1.15);
    gone.addColorStop(0, "rgba(14, 10, 10, 1)");
    gone.addColorStop(0.45, "rgba(14, 10, 10, 0.92)");
    gone.addColorStop(1, "rgba(14, 10, 10, 0)");
    ctx.fillStyle = gone;
    ctx.beginPath();
    ctx.arc(map.cx, map.cy, body * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    const ember = ctx.createRadialGradient(map.cx, map.cy, 0, map.cx, map.cy, body * 0.9);
    ember.addColorStop(0, "rgba(255, 96, 48, 0.30)");
    ember.addColorStop(1, "rgba(255, 96, 48, 0)");
    ctx.fillStyle = ember;
    ctx.beginPath();
    ctx.arc(map.cx, map.cy, body * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (t < t3) {
    // ② 변색 — 청 → 밝은 적(앞 절반) → 백(뒷 절반). ③에서는 백으로 굳고 «웅덩이가 줄어든다»
    const tint = t < t2;
    const k = Math.min(1, (t - t1) / E.tintSec);
    const c = tint ? 0 : Math.min(1, (t - t2) / E.crackSec);
    const col = k < 0.5 ? mixRgb(E.tint[0], E.tint[1], k * 2) : mixRgb(E.tint[1], E.tint[2], k * 2 - 1);
    const heat = 0.5 + 0.5 * k;
    ctx.save();
    // ⓐ 웅덩이(주변 지면) = **일반 합성**. `drawCoreGlow`와 같은 규약이고, 이유도 같다 —
    //    가산으로 그리면 잔디의 G 채널에 끌려 색조가 안 선다(그쪽 주석).
    //    ⚠ **③에서는 이 웅덩이가 줄어든다** — 안 줄이면 화면이 통째로 하얘져서 ⓒ 균열 줄이 안 보이고,
    //      ④ 파괴의 섬광이 이미 일어난 것처럼 읽힌다(iter127 첫 컷이 정확히 그랬다)
    // ⚠ **도시는 웅덩이를 더 진하게 덮어야 한다** — 도시 플레이트에는 청록 에너지 웅덩이가
    //   «구워져» 있어(평원의 잔디와 달리 그 자체가 밝은 청록이다) 평원 값 0.34로는 코어가 붉어져도
    //   주변이 청록으로 남아 「타워가 물들었다」가 안 읽힌다(iter127 도시 컷)
    orb(ctx, map.cx, map.cy, R * ((tower ? 1.25 : 0.95) - 0.4 * c), col, ((tower ? 0.62 : 0.34) - 0.06 * c) * heat);
    // ⓑ 몸통 = **일반 합성이어야 «색이 갈린다»**. 플레이트의 코어 결정은 밝은 청록이라
    //    가산으로 붉은빛을 얹으면 붉어지는 것이 아니라 **하얘진다**(iter127 첫 컷: t=1.4에서
    //    결정만 파란 채로 주변만 주황이었다). 덮어써야 「그 코어가 물들었다」로 읽힌다
    orb(ctx, map.cx, map.cy, body * (1 - 0.15 * c), col, 0.92 * heat);
    ctx.globalCompositeOperation = "lighter";
    orb(ctx, map.cx, map.cy, body * 0.55, col, 0.45 * heat);
    if (tower) {
      // 도시 = 에너지 응집 타워 — 물드는 것이 **기둥**이다. 백열에 가까워질수록 길어진다.
      // ⚠ **사각형으로 그리면 안 된다** — 모서리가 서서 「빛기둥」이 아니라 「붙여 놓은 판」으로
      //   읽힌다(iter127 도시 첫 컷). 세로로 늘인 좌표계에 원반을 그려 **사방이 흐려지게** 한다
      const h = R * (1.0 + 0.4 * k);
      ctx.save();
      ctx.translate(map.cx, map.cy - h * 0.85);
      ctx.scale((body * 0.62) / h, 1);
      orb(ctx, 0, 0, h, col, 0.85 * heat);
      ctx.restore();
    }
    ctx.restore();

    // ⓒ ③ 균열 — 백광이 «틈새»로 샌다. 줄은 **몸통 밖까지** 뻗고 가늘다 — 굵게 그리면 몸통과
    //    한 덩어리가 되어 「새어 나온다」가 아니라 「커진다」로 읽힌다
    if (!tint) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.45 + 0.55 * c).toFixed(3)})`;
      ctx.lineWidth = 2 + 5 * c;
      for (let i = 0; i < E.cracks; i++) {
        const a = (i / E.cracks) * Math.PI * 2 + 0.19;
        const r0 = body * 0.45;
        const r1 = body * (1.2 + 2.2 * c) * (tower ? 1.2 : 1);
        ctx.beginPath();
        ctx.moveTo(map.cx + Math.cos(a) * r0, map.cy + Math.sin(a) * r0);
        ctx.lineTo(map.cx + Math.cos(a) * r1, map.cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
    return;
  }

  // ④ 파괴 — 확장 링 + 파편 + **화면 전체 섬광**. 몸통 자리에는 먼저 **어둠**을 깐다:
  // 코어 결정이 플레이트에 구워져 있어, 안 덮으면 터지는 한복판에 «멀쩡한 청록 결정»이 남는다
  const b = Math.min(1, (t - t3) / E.burstSec);
  ctx.save();
  // ⚠ **가장자리가 없는 그라디언트여야 한다** — 단색 원으로 덮으면 섬광에 물들어 한복판에
  //   「회색 원반」이 앉는다(iter127 둘째 컷). 중심만 진하고 밖으로 사라져야 «구멍»이 아니라
  //   «타 버린 자리»로 읽힌다
  const void_ = ctx.createRadialGradient(map.cx, map.cy, 0, map.cx, map.cy, body * 1.15);
  // 중심은 **완전 불투명**이어야 한다 — 결정이 워낙 밝은 청록이라 0.9로는 그대로 비친다
  // (iter127 셋째 컷: b=0.83에서 「폭발이 끝난 자리에 멀쩡한 보석」이 남았다)
  const va = Math.min(1, b * 10);
  void_.addColorStop(0, `rgba(14, 10, 10, ${va.toFixed(3)})`);
  void_.addColorStop(0.45, `rgba(14, 10, 10, ${(va * 0.92).toFixed(3)})`);
  void_.addColorStop(1, "rgba(14, 10, 10, 0)");
  ctx.fillStyle = void_;
  ctx.beginPath();
  ctx.arc(map.cx, map.cy, body * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(255, 255, 255, ${((1 - b) * 0.9).toFixed(3)})`;
  ctx.lineWidth = 2 + 14 * (1 - b);
  ctx.beginPath();
  ctx.arc(map.cx, map.cy, body * (1.0 + 5.6 * b), 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < E.shards; i++) {
    const a = (i / E.shards) * Math.PI * 2 + 0.4;
    // 등거리로 뿌리면 파편이 아니라 **점선 링**으로 읽힌다(iter127 셋째 컷) — 인덱스로 거리·크기를
    // 흩되 난수는 안 쓴다(컷 재현이 이 연출의 유일한 검산 경로다)
    const jitter = 0.72 + 0.56 * (((i * 7) % 5) / 4);
    const d = body * (0.35 + 4.6 * b) * jitter * (tower && Math.sin(a) < 0 ? 1.35 : 1);
    const s = (3 + 9 * (1 - b)) * (0.7 + 0.6 * (((i * 3) % 4) / 3));
    ctx.fillStyle = `rgba(255, ${Math.round(190 + 65 * (1 - b))}, ${Math.round(140 + 115 * (1 - b))}, ${(1 - b).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(map.cx + Math.cos(a) * d, map.cy + Math.sin(a) * d, s, s * 0.5, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 섬광만 화면 좌표다 — 월드에 그리면 맵 밖이 안 덮인다(맵은 뷰포트의 1.2배지만 카메라는 코어 고정)
  const fa = E.flash * (b < 0.2 ? b / 0.2 : Math.max(0, 1 - (b - 0.2) / 0.8));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(255, 255, 255, ${fa.toFixed(3)})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.restore();
}

/** `"r, g, b"` 두 점 사이의 선형 보간. 색을 **문자열 한 벌**로 들고 다니는 것은 `RENDER.coreGlow`와
 * 같은 규약이다(`rgba(${c}, a)` 한 문법으로 알파를 얹는다) */
function mixRgb(a: string, b: string, k: number): string {
  const A = a.split(",").map(Number);
  const B = b.split(",").map(Number);
  return A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(", ");
}

/** 중심이 밝고 가장자리가 0인 원반 하나 (엔드 씬 전용 · 합성 모드는 호출부가 정한다) */
function orb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col}, ${a.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(${col}, ${(a * 0.7).toFixed(3)})`);
  g.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** **3단 그림의 몸통** (§0.7 J1-b). 온전(0단)·잔해(2단)는 셀 한 장이고, **파손(1단)은 합성**이다 —
 * 「무너져 내린 윗부분」을 잔해 셀로 발치에 깔고, 그 앞에 **온전 셀의 아래 `hurtKeep`만** 세운다.
 * 두 셀 다 같은 인자(`x, t.y, t.r*2`)로 그리므로 바닥 선이 저절로 맞는다(둘 다 셀 바닥에 붙은 그림).
 * ⚠ **전용 «파손» 셀이 들어오면 이 합성은 한 줄로 줄어든다** — `terrainTile`이 그 이름을 돌려주게
 * 하고 여기 분기를 지우면 된다(STATUS 「감독에게 요청할 그림」에 그 한 벌이 올라 있다) */
function drawTerrainBody(ctx: CanvasRenderingContext2D, t: Terrain, x: number): void {
  const tile = terrainTile(t);
  if (terrainStage(t) !== 1) {
    drawTile(ctx, tile, x, t.y, t.r * 2);
    return;
  }
  drawTile(ctx, "wall_broken", x, t.y, t.r * 2); // 무너져 내린 윗부분
  const box = tileArtBox(tile, x, t.y, t.r * 2);
  ctx.save();
  if (box) {
    const keep = (box.y1 - box.y0) * RENDER.terrain.hurtKeep;
    ctx.beginPath();
    ctx.rect(box.x0 - 2, box.y1 - keep, box.x1 - box.x0 + 4, keep + 2);
    ctx.clip();
  }
  drawTile(ctx, tile, x, t.y, t.r * 2); // 남은 밑동
  ctx.restore();
}

/** **지물 좌표에서 낸 결정적 해시** — 균열·파편·잔해 조각의 위치가 여기서 나온다.
 * 이 코드베이스에 `Math.random`은 한 곳도 없고(QA 컷 재현성) 지물마다 모양이 갈려야
 * 「같은 도장을 찍은 것」으로 안 보인다. 쓰는 쪽이 둘(`drawTerrainWear`·폭발 지물 잔해)이라 뽑았다 */
function terrHash(t: Terrain): (i: number) => number {
  const seed = t.x * 0.017 + t.y * 0.029;
  return (i: number): number => {
    const v = Math.sin(seed + i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
}

/** **누적 균열·파편** (§0.7 J1-b 「피격 때마다 균열·파편이 누적되게」). 판정은 한 자리도 안 본다 —
 * 눈금은 **받은 피해 비율** 하나이고, 그래서 조준 포격 한 방(120)이든 산성 dps든 같은 규약에 든다
 * (`RENDER.terrain.chip`이 튀는 파편을 «피해 눈금»으로 센 것과 같은 이유).
 * 위치는 지물 좌표에서 낸 **결정적 해시**다 — 이 코드베이스에 Math.random은 한 곳도 없고(QA 컷
 * 재현성) 지물마다 균열 모양이 갈려야 「같은 도장을 찍은 것」으로 안 보인다.
 * 잔해(2단)에는 안 그린다: 이미 부서진 그림이라 균열이 얹힐 몸통이 없다 */
function drawTerrainWear(
  ctx: CanvasRenderingContext2D,
  t: Terrain,
  cx: number,
  cy: number,
  hw: number,
  hh: number
): void {
  const F = RENDER.terrain;
  if (terrainStage(t) === 2 || !Number.isFinite(t.hp0) || t.hp0 <= 0) return;
  const d = Math.max(0, Math.min(1, 1 - t.hp / t.hp0));
  if (d <= 0) return;
  const h = terrHash(t);
  // ① 균열 — 그림 위쪽에서 아래로 갈라진다. **줄 수가 피해에 비례해 늘어나는 것**이 누적의 전부다
  ctx.save();
  ctx.strokeStyle = `rgba(24, 18, 14, ${F.crackAlpha})`;
  ctx.lineWidth = F.crackPx;
  ctx.lineCap = "round";
  // ⚠ **균열은 그림 상자를 벗어나면 안 된다** (iter96 규약 「지물 위/아래 연출은 `t.r`이 아니라
  // 그림 상자」의 안쪽 판). 지형 셀은 그림이 셀의 25%뿐이라 길이를 상수로 주면 금이 **잔디로
  // 흘러내린다** — 그래서 시작점은 상자 위쪽 절반, 길이는 «바닥까지 남은 거리»에서 낸다
  for (let i = 0; i < Math.round(d * F.crackN); i++) {
    const px = cx + (h(i) * 2 - 1) * hw * 0.55;
    const py = cy - hh * (0.55 + h(i + 40) * 0.4);
    const len = (cy + hh * 0.9 - py) * (0.5 + h(i + 80) * 0.5);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (h(i + 120) * 2 - 1) * hw * 0.14, py + len * 0.5);
    ctx.lineTo(px + (h(i + 160) * 2 - 1) * hw * 0.24, py + len);
    ctx.strokeStyle = "rgba(235, 202, 143, 0.6)";
    ctx.lineWidth = F.crackPx + 1.6;
    ctx.stroke();
    ctx.strokeStyle = `rgba(24, 18, 14, ${F.crackAlpha})`;
    ctx.lineWidth = F.crackPx;
    ctx.stroke();
  }
  ctx.restore();
  // ② 발치에 **남는** 파편. 튀는 파편(combat.ts `chip`)은 0.x초에 사라지지만 이쪽은 안 사라져서
  // 「이 지물이 얼마나 맞았나」가 정지 화면(= QA 컷)에서도 읽힌다
  ctx.fillStyle = "rgba(52, 43, 34, 0.7)";
  for (let i = 0; i < Math.round(d * F.debrisN); i++) {
    const px = cx + (h(i + 200) * 2 - 1) * hw * 1.05;
    const py = cy + hh * (0.86 + h(i + 240) * 0.34);
    const r = hw * F.debrisR * (0.55 + h(i + 280) * 0.9);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 배경은 plate.ts가 프리렌더한 한 장. 여기서 얹는 것은 **플레이트에 없는 것**뿐이다 —
 * 파괴 가능한 성벽(장식 성벽과 달리 철거되면 잔해로 바뀌어야 한다) */
export function drawMap(ctx: CanvasRenderingContext2D, map: GameMap, aim: { x: number; y: number } | null = null) {
  const F = RENDER.terrain;

  // **① 언덕 높이감** (§0.6 F ⓓ "직사 차단이 읽히도록 높이감(그림자·윤곽)").
  // 언덕 그림은 플레이트에 baked이라 크기도 모양도 못 바꾼다 — 판정원이 그림을 따라가는 규약이라
  // 반경을 키우면 «그려진 언덕 밖에서 사선이 막히는» 거짓말이 된다(이 파일 머리말). 그래서
  // 위에 두 겹을 얹는다: 남동 어둠 + 북서 밝음 = 광원이 북서에 있는 돔.
  // ⚠ **테두리를 그리는 연출은 여기서 못 쓴다** — `MAPS[id].terrain`의 언덕 판정원은 그려진 언덕과
  // 중심·반경이 몇 십 월드씩 어긋나 있다(iter90 실측: 판정원의 북서 4분면이 맨 잔디 위에 있다).
  // 호를 그으면 그 어긋남이 «잔디 위의 동그라미»로 그대로 드러난다(첫 컷에서 밟았다).
  // 그래서 **가장자리가 없는 것**만 쓴다 — 바깥 정지점이 투명한 방사 그라디언트 두 장이다
  for (const t of map.terrain) {
    if (t.kind !== "hill") continue;
    const off = t.r * F.hillOff;
    const sh = ctx.createRadialGradient(t.x + off, t.y + off, 0, t.x + off, t.y + off, t.r * 1.1);
    sh.addColorStop(0, `rgba(12, 18, 10, ${F.hillShadow})`);
    sh.addColorStop(0.55, `rgba(12, 18, 10, ${(F.hillShadow * 0.72).toFixed(3)})`);
    sh.addColorStop(1, "rgba(12, 18, 10, 0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(t.x + off, t.y + off, t.r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    const lt = ctx.createRadialGradient(t.x - off, t.y - off, 0, t.x - off, t.y - off, t.r * 0.92);
    lt.addColorStop(0, `rgba(228, 248, 206, ${F.hillRim})`);
    lt.addColorStop(1, "rgba(228, 248, 206, 0)");
    ctx.fillStyle = lt;
    ctx.beginPath();
    ctx.arc(t.x - off, t.y - off, t.r * 0.92, 0, Math.PI * 2);
    ctx.fill();
  }

  // **⑤ 폭발 지물** (§0.7 J1-c · 감독 #66 ⑤). 성벽과 **다른 패스**인 이유는 몸통 그림이 없기
  // 때문이다 — 주유소는 **플레이트에 구워져** 있어서 셀을 갈아 낄 수가 없다. 그래서 얹는 것은 둘뿐이다:
  //  ⓐ 살아 있으면 **HP바** — 이것이 없으면 「이건 부술 수 있다」가 화면에 하나도 안 적혀 있다
  //     (⇒ ⓒ「언제 터뜨릴지 고른다」가 성립하지 않는다). 「받은 피해」는 성벽과 **같은 겹**을 쓴다.
  //     ⚠ **그래서 iter118의 「온전하면 바를 숨긴다」가 여기만 예외다** — 성벽은 몸통 셀이 「부술 수
  //     있는 것」을 말해 주지만 구운 주유소는 말해 줄 몸통이 없다(잡몹의 `eliteHp` 예외와 같은 모양)
  //  ⓑ 터졌으면 **그을음** — 구운 그림이 그대로 남으므로 이 한 겹이 「터졌다」의 유일한 표시다
  // ⚠ **여기서는 상자가 `t.r`이 맞다** — iter96 규약(「지물 위/아래 연출은 `t.r`이 아니라 그림
  //    상자」)의 근거는 「지형 셀은 그림이 셀의 25%뿐」인데, 구운 지물은 **셀이 없고** 판정원이
  //    그려진 탱크를 실측해 잡은 원이다(`TERRAIN_CITY`). 즉 이 지물의 «그림 상자»가 곧 `t.r`이다
  for (const t of map.terrain) {
    if (!explosive(t.kind)) continue;
    if (t.destroyed) {
      // **그을음** — 구운 그림 «위»를 덮어야 한다(둘레만 태우면 탱크가 멀쩡해 보인다).
      // 중심이 가장 진하고 `scorchR`에서 0으로 빠지는 방사 그라디언트 한 장이다
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * F.scorchR);
      g.addColorStop(0, `rgba(18, 14, 12, ${F.scorchAlpha})`);
      g.addColorStop(0.62, `rgba(24, 19, 16, ${(F.scorchAlpha * 0.7).toFixed(3)})`);
      g.addColorStop(1, "rgba(24, 19, 16, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * F.scorchR, 0, Math.PI * 2);
      ctx.fill();
      // **잔해 조각** (감독 #66 ⑤ 「큰 폭발과 함께 **잔해**가 된다」). `drawTerrainWear`의 파편과
      // 같은 규약·같은 해시이고, 여기만 **최대치로 고정**이다 — 이 지물의 「받은 피해」는 끝났다
      const h = terrHash(t);
      ctx.fillStyle = "rgba(38, 31, 26, 0.78)";
      for (let i = 0; i < F.debrisN; i++) {
        const a = h(i + 300) * Math.PI * 2;
        const d = t.r * (0.35 + h(i + 340) * 0.75);
        const rr = t.r * F.debrisR * (0.9 + h(i + 380) * 1.4);
        ctx.beginPath();
        ctx.ellipse(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d * 0.7, rr, rr * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    if (!Number.isFinite(t.hp0)) continue;
    // Fuel can be demolished but does not imply a movement barrier when cover is off.
    ctx.save(); ctx.translate(t.x, t.y - t.r * 0.65);
    ctx.fillStyle = "#e8b064"; ctx.strokeStyle = "#34271d"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(7, 5); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#34271d"; ctx.fillRect(-1, -3, 2, 4); ctx.fillRect(-1, 2, 2, 1);
    ctx.restore();
    drawTerrainWear(ctx, t, t.x, t.y, t.r, t.r);
    const left = Math.max(0, Math.min(1, t.hp / t.hp0));
    const w = t.r * 2 * F.bar;
    const by = t.y - t.r - F.barH * (1 + F.barUp);
    ctx.globalAlpha = left >= 1 && (t.hitFx ?? 0) <= 0 ? F.barIdle : 1;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(t.x - w / 2 - 1, by - 1, w + 2, F.barH + 2);
    ctx.fillStyle = left > 0.5 ? "#8fd46a" : left > 0.25 ? "#e0c24a" : "#e05a3c";
    ctx.fillRect(t.x - w / 2, by, w * left, F.barH);
    ctx.globalAlpha = 1;
  }

  // **소멸 규약** (§0.7 J1 「2차 파괴 = 소멸하고 더는 아무것도 막지 않는다」).
  // 평원의 2차 파괴는 «잔해»라 그림이 남고 은신처가 되지만, 도시의 2차 파괴는 자리가 통째로 비어야
  // 「내 화력으로 사계를 열었다」가 화면에서 읽힌다 — 잔해 그림이 남으면 열린 자리가 안 보인다
  const vanish = MAPS[map.id].vanish;
  for (const t of map.terrain) {
    if (t.kind !== "wall") continue;
    if (vanish && t.destroyed) continue;
    // **② 피격 흔들림** (§0.6 F ⓑ). 잔여 타이머의 감쇠 사인파. **그림만 흔들린다** —
    // t.x/t.y는 사선·이동·돌파 표식이 함께 보는 판정 좌표라 여기서 건드리면 규약이 두 벌이 된다
    const hit = t.hitFx ?? 0;
    const k = hit / F.hit;
    const jx = hit > 0 && !getEffectSettings().reducedMotion ? Math.sin((F.hit - hit) * F.hitRate * Math.PI * 2) * F.hitAmp * k : 0;
    const x = t.x + jx;
    // **연출의 기준은 `t.r`(판정 반경)이 아니라 «그려진 그림»이다.** 지형 셀은 그림이 셀의 일부만
    // 채운다(성벽 = 셀 높이의 25%) — 반경으로 놓으면 그림자는 지물 **아래 잔디에** 따로 떨어지고
    // HP바는 지물 **위 잔디에** 떠서 「무엇의 HP인가」가 안 읽힌다(iter96 실측: 바가 성벽 상단에서
    // 50월드 위). 상자가 없으면(스프라이트 미로드) 예전대로 반경을 쓴다
    const { cx: gx, cy: gy, hw: gw, hh: gh } = terrainArt(t, x); // 그림 중심·반폭·반높이
    // Ground contact stays visible; collision guides appear only while inspecting/attacking.
    if (!t.destroyed) {
      if (hit > 0 || (aim && Math.hypot(aim.x - t.x, aim.y - t.y) < t.r + 24)) {
        ctx.strokeStyle = t.cracked ? "rgba(235, 169, 99, 0.7)" : "rgba(221, 203, 155, 0.6)";
        ctx.lineWidth = 1.5; ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = "rgba(24, 25, 22, 0.5)";
      ctx.fillRect(gx - gw * 0.92, gy + gh - 2, gw * 1.84, 5);
    }
    // Mortar fragments / earth chips belong to the existing object's feet, never a new obstacle.
    for (let i = 0; i < 6; i++) {
      const px = Math.round(gx - gw * 0.88 + i * gw * 0.33);
      const py = Math.round(gy + gh + 2 + Math.sin(t.x + i * 2.7) * 4);
      ctx.fillStyle = "rgba(27, 28, 23, 0.32)"; ctx.fillRect(px + 1, py + 2, 6, 3);
      ctx.fillStyle = map.id === "city" ? "#77796b" : "#8b8160"; ctx.fillRect(px, py, 5, 2);
    }
    // 접지 그림자 — 없으면 플레이트 위에 스티커처럼 떠 보인다
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(gx, gy + gh * 0.4, gw * 0.82, gh * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // **골렘 잔해(scrap 0)는 고철 더미로 그린다** (§8.②). 판정은 성벽과 같지만 값이 셋이나 다르다
    // (반경 절반 · HP 절반 · 철거 드랍 0) — 같은 그림으로 그리면 화면에서 «이건 왜 한 발에 부서지나»가
    // 안 읽힌다. 부서진 뒤는 성벽과 같은 잔해 그림이다(둘 다 «지나갈 수 있는 자리»라는 뜻이 같다)
    drawTerrainBody(ctx, t, x);
    // **누적 손상** (§0.7 J1-b). 그림 위에 얹는 겹이라 몸통 바로 뒤에 온다
    drawTerrainWear(ctx, t, gx, gy, gw, gh);

    // **③ 붕괴 확산 링** (§0.6 F ⓑ "붕괴 연출"). 파편·연기는 combat.ts가 이미 뿌렸고, 여기 있는 것은
    // «지금 이 자리가 열렸다»를 반경으로 알리는 한 겹이다 — 잔해 그림만으로는 부서진 순간이 안 읽힌다
    const fall = t.fallFx ?? 0;
    if (fall > 0) {
      const g = 1 - fall / F.fall; // 0 = 방금 무너짐 → 1 = 링 소멸
      ctx.strokeStyle = `rgba(214, 190, 156, ${(0.7 * (1 - g)).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (1 + (F.fallR - 1) * g), 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // **④ HP바** (§0.6 F ⓑ). 분모는 `hp0`이다 — 성벽 120과 골렘 잔해 60이 달라서
    // `TERRAIN.wallHp`를 분모로 쓰면 잔해의 진행률이 거짓말이 된다(iter88이 남긴 자리).
    // 잔해(destroyed)·무한 HP(언덕·호수)는 바가 없다: 「부술 수 있는 것」의 표시이기 때문이다.
    // ⚠ **온전한 지물도 바가 없다** (iter118 · 목업 대조). 웨이브 1에 아무것도 안 맞았는데 꽉 찬
    // 초록 막대 7개가 전장에 떠 있어서 「지금 무엇이 상했나」가 안 읽혔다 — 목업의 막대는 **피격된
    // 것 위에만** 있다. 잡몹의 `RENDER.hurtShow`(피격 후에만 또렷)를 지물로 넓힌 규약이고,
    // 「부술 수 있다」는 이제 **바가 아니라 몸통 그림**(성벽 셀)이 말한다 — 언덕·호수와 생김새가 다르다.
    // 폭발 지물(주유소)만 예외다: 몸통이 플레이트에 구워져 있어 바가 유일한 표시다(아래 ⑤ 패스)
    if (t.destroyed || !Number.isFinite(t.hp0) || t.hp >= t.hp0) continue;
    const left = Math.max(0, Math.min(1, t.hp / t.hp0));
    // 폭을 **그림 폭의** 0.6배로 짧고 두껍게 잡는다 — 지물에 꽉 맞추면 화면 가로 184월드짜리
    // «선»이 되어 바가 아니라 잔디 위의 긁힘으로 읽힌다(iter90 첫 컷 실측)
    const w = gw * 2 * F.bar;
    const by = gy - gh - F.barH * (1 + F.barUp);
    // 피격 창(`hitFx`) 안에서만 또렷하고 그 밖에서는 `barIdle`로 가라앉는다 — 상한 미만인 지물이
    // 여럿이면 상시 불투명한 막대가 다시 전장을 덮는다(위 규약이 지우려던 바로 그 그림이다)
    ctx.globalAlpha = hit > 0 ? 1 : F.barIdle;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(gx - w / 2 - 1, by - 1, w + 2, F.barH + 2);
    ctx.fillStyle = left > 0.5 ? "#8fd46a" : left > 0.25 ? "#e0c24a" : "#e05a3c";
    ctx.fillRect(gx - w / 2, by, w * left, F.barH);
    ctx.globalAlpha = 1;
  }
}
