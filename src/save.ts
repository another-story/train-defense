// Safe checkpoints: new run and station entry/departure only. Battles never overwrite them.
// v9 is backed up and migrated conservatively; unfinished waves are replayed.

import { CAR_KINDS, BRANCHES, SHOP, WEAPONS, ENEMY_STATS, CRACK, WAVES, type MapId } from "./balance";
import type { Cards } from "./cards";
import type { Combat, Drop, Shell, Fire, Pool, Smoke, Strike } from "./combat";
import type { Field } from "./enemy";
import { twoStageOf, type GameMap, type Terrain, type TerrainKind } from "./map";
import type { CarKind, Passive, Train } from "./train";
import { makeCar } from "./train";

const KEY = "traindefense.run";
/** Version 10 adds explicit checkpoint semantics and conservative v9 migration. */
const VERSION = 10;

export type SaveState = {
  v: number;
  checkpoint: "start" | "station";
  migrated?: boolean;
  rng?: { field: number; combat: number; cards: number };
  trainS?: number;
  artCd?: number;
  dropAcc?: number;
  stationRefits?: number;
  coreDamageByCause?: Record<string, number>;
  scoutBuild?: number;
  graves?: Field["graves"];
  coSeq?: number;
  carStun?: number[];
  drops?: Drop[];
  pools?: Pool[];
  smokes?: Smoke[];
  strikes?: Strike[];
  shells?: (Omit<Shell,"car"|"target"> & { car: number })[];
  fires?: (Omit<Fire,"car"> & { car: number })[];
  seed: number;
  /** 0-based wave at the checkpoint: start replays it; station departs to the next wave. */
  waveIdx: number;
  /** 런 절대 경과 시간(초) — 종료 화면의 TIME이 이어져야 한다 */
  t: number;
  /** **재도전 횟수** (DESIGN §0.7 N · 랭킹의 항목 4 중 하나). 이 값을 올리는 자리는 **복원 그 자체**다
   *  — main.ts가 `RESUMED.retries + 1`로 시작하고 다음 스냅샷이 그 값을 도로 싣는다. 저장에 안 실으면
   *  이어하기 한 번마다 0으로 되돌아가 「덜 재도전하고 멀리 간 사람이 1등」이라는 정렬이 무의미해진다 */
  retries: number;
  coreHp: number;
  scrap: number;
  collected: number;
  kills: number;
  /** **종료 화면이 읽는 누적 장부**(main.ts drawEnd의 BOSS·CORE LOST 두 행). 이어하기 없이 60웨이브를
   *  완주하는 것이 비현실적이라(위 머리말) 이것을 안 실으면 **실제로 완주한 런의 종료 화면만** 0을 찍는다.
   *  `killsByKind`는 `kills`와 같은 자리에서 오르므로(combat.ts 997) 한쪽만 실으면 합이 안 맞는다 */
  killsByKind: Record<string, number>;
  bossCoreHits: number;
  coreDmgBoss: number;
  coreDmgMob: number;
  /** 특성 카드의 곱연산 누적 (BALANCE §7). 카드 목록만 저장하면 재적용 순서를 다시 짜야 한다 */
  artCdMult: number;
  collectMult: number;
  /** **패시브 4종의 구매 레벨** (§0.7 H2). `artCdMult`·`collectMult`와 같은 자리·같은 이유다 —
   *  런 전체에 걸린 성장이라 편성(`cars`)만 실으면 화력이 정차 하나만큼 통째로 사라진다 */
  pass: Passive;
  trainSpeed: number;
  /** **이번 런에 고른 열차 교리의 id 목록** (§D1 ⓐ · combat.ts `doctrines`). 효과 자체는 이미
   *  `pass.doc*`·`trainSpeed`·`collectMult`와 아래 `docDrop`에 곱해져 있으므로 **복원은 재적용이
   *  아니라 그대로 싣는 것**이다 — 재적용하면 배수가 정차마다 제곱된다.
   *  이 목록이 필요한 이유는 「몇 단까지 골랐나」가 다음 단의 조건이기 때문이다(main.ts `pendingDoctrine`) */
  doctrines: string[];
  /** 교리의 드랍 배수 — `dropValue`(맵 값)는 복원 때 맵에서 다시 유도되므로 그쪽에 곱하면 증발한다 */
  docDrop: number;
  /** `branch` = T3 진화 분기 (DESIGN §7.4). 옛 세이브에는 없다 = null로 복원되고,
   *  T3 칸이면 다음 프레임에 분기 화면이 다시 열린다(train.ts pendingBranch) */
  cars: { kind: string; level: number; tier: number; invested: number; branch?: string | null; cd?: number; fired?: number; dealt?: number }[];
  /** 카드 상태 — 티어 진행도(장)·고른 목록·제시 횟수 */
  prog: Record<string, number>;
  taken: string[];
  offered: number;
  /** **저장한 순간의 맵** (§0.7 J 맵 2종 체계). 맵마다 지형 수·크기·규칙이 다르므로 이 값 없이
   *  이어하면 지형 목록이 다른 맵의 것으로 얹힌다.
   *  ⚠ **이제 런 도중에 갈린다**(§0.7 O ⓑ · `BALANCE.ROUTE` — 스테이지 7에서 평원 → 도시). 그래서
   *  이 칸은 「이 런의 맵」이 아니라 **「저장한 순간의 맵」**이고, 복원 뒤의 전환은 아래 `pin`과
   *  `routeMapOf(stage)`가 다시 판단한다 — 전환 직전(웨이브 18 정차)에 저장했으면 복원 후의
   *  「출발」이 그 전환을 그대로 낸다(전환은 정차 해제 한 곳에서만 난다) */
  map?: MapId;
  /** **이 런이 `?map=`으로 한 맵에 고정됐는가** (= 경로를 껐는가 · 단일 맵 회귀 컷).
   *  안 실으면 `?map=city&resume=1`로 이어한 런이 파라미터를 잃고 **경로 런으로 되돌아가**
   *  스테이지 7 이전에 도시 → 평원이라는 «되돌아가는» 전환이 난다 */
  pin?: boolean;
  /** **절차 지형 전량**(골렘 잔해 제외)을 좌표째로. 복원은 이 목록으로 `map.terrain`을 다시 세운다 —
   *  재생성 배열에 인덱스를 얹던 옛 방식은 iter124에 폐기됐다(파일 머리말 참조).
   *  `hp`·`hp0`의 **−1 = Infinity**(JSON이 Infinity를 null로 바꾼다) · `hp` 0 = 파괴됨 */
  terrain: { k: TerrainKind; x: number; y: number; r: number; hp: number; hp0: number }[];
  /** **스크랩 골렘이 세운 잔해** (§8.② · combat.ts 사망 루프). 절차 생성이 아니라 **런 중에 생긴
   *  지형**이라 인덱스로 못 잇는다 — 스테이지 보충(`stageTerrain`)과 뒤섞여 배열에 쌓이므로,
   *  복원 쪽에서 같은 순서를 재현할 방법이 없다. 그래서 좌표째로 싣고 복원 때 **뒤에 다시 세운다**.
   *  안 실으면 배열 길이가 어긋나 `applySave`가 지형 복원을 통째로 포기한다(= 부순 성벽이 되살아난다) */
  debris: { x: number; y: number; r: number; hp: number; hp0?: number; cracked?: boolean }[];
};

export function snapshot(
  map: GameMap,
  field: Field,
  train: Train,
  combat: Combat,
  cards: Cards,
  seed: number,
  retries: number,
  pin: boolean,
  migrated = false,
  stationRefits = 0,
): SaveState {
  return {
    v: VERSION,
    checkpoint: field.station ? "station" : "start",
    migrated,
    stationRefits,
    drops: combat.drops.map(d => ({...d})),
    pools: combat.pools.map(d => ({...d})),
    smokes: combat.smokes.map(d => ({...d})),
    strikes: combat.strikes.map(d => ({...d})),
    shells: combat.shells.map(({car,target: _target,...shell}) => ({...shell,car:train.cars.indexOf(car)})),
    fires: combat.fires.map(({car,...fire}) => ({...fire,car:train.cars.indexOf(car)})),
    rng: { field: field.rnd.getState(), combat: combat.rnd.getState(), cards: cards.rnd.getState() },
    trainS: train.s,
    artCd: combat.artCd,
    dropAcc: combat.dropAcc,
    scoutBuild: field.scoutBuild,
    graves: field.graves.map(g => ({...g})),
    coSeq: field.coSeq,
    carStun: [...field.carStun],
    coreDamageByCause: { ...combat.coreDamageByCause },
    seed,
    waveIdx: field.waveIdx,
    t: field.t,
    retries,
    coreHp: combat.coreHp,
    scrap: combat.scrap,
    collected: combat.collected,
    kills: combat.kills,
    killsByKind: { ...combat.killsByKind },
    bossCoreHits: combat.bossCoreHits,
    coreDmgBoss: combat.coreDmgBoss,
    coreDmgMob: combat.coreDmgMob,
    artCdMult: combat.artCdMult,
    collectMult: combat.collectMult,
    pass: { ...combat.pass },
    trainSpeed: train.speed,
    doctrines: [...combat.doctrines],
    docDrop: combat.docDrop,
    cars: train.cars.map((c) => ({ kind: c.kind, level: c.level, tier: c.tier, invested: c.invested, branch: c.branch, cd: c.cd, fired: c.fired, dealt: c.dealt })),
    prog: { ...cards.prog },
    taken: [...cards.taken],
    offered: cards.offered,
    map: map.id,
    pin,
    // 불괴 지형(언덕·호수: hp = Infinity)은 -1로 적는다 — JSON이 Infinity를 null로 바꾸기 때문이다.
    // 잔해(scrap 0)는 빼고 싣는다 — 아래 `debris`가 따로 싣고, 복원 순서도 그쪽이 뒤다
    terrain: map.terrain
      .filter((t) => t.scrap !== 0)
      .map((t) => ({
        k: t.kind,
        x: t.x,
        y: t.y,
        r: t.r,
        hp: !Number.isFinite(t.hp) ? -1 : t.destroyed ? 0 : t.hp,
        hp0: !Number.isFinite(t.hp0) ? -1 : t.hp0,
      })),
    // 부서진 잔해는 안 싣는다 — 다시 세울 이유가 없고, 세우면 동시 상한(ENEMY.debrisCap)만 먹는다
    debris: map.terrain
      .filter((t) => t.scrap === 0 && !t.destroyed)
      .map((t) => ({ x: t.x, y: t.y, r: t.r, hp: t.hp, hp0:t.hp0, cracked:!!t.cracked })),
  };
}

/** localStorage에 쓴다. 저장이 실패해도(사생활 모드·용량) 런은 계속돼야 하므로 삼킨다 */
export function writeSave(s: SaveState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 — 지우기 실패는 다음 저장이 덮어쓴다 */
  }
}

/** 읽어서 형식이 맞으면 돌려준다. 판 번호·시드가 다르면 null (시드가 다르면 맵도 지형도 다른 런이다) */
export function readSave(seed: number): SaveState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SaveState;
    if (!s || (s.v !== VERSION && s.v !== 9) || s.seed !== seed) return null;
    if (!Array.isArray(s.cars) || !Array.isArray(s.terrain) || !Array.isArray(s.debris)) return null;
    // 마지막 웨이브(= 클리어)에는 정차가 없으므로 저장도 없다 — 범위 밖이면 손상된 저장이다
    if (!Number.isInteger(s.waveIdx) || s.waveIdx < 0 || s.waveIdx >= WAVES.length - 1) return null;
    const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
    const positive = (n: unknown) => finite(n) && n >= 0;
    const record = (o: unknown) => !!o && typeof o === "object" && !Array.isArray(o) && Object.values(o).every(positive);
    if (![s.t,s.retries,s.coreHp,s.scrap,s.collected,s.kills,s.bossCoreHits,s.coreDmgBoss,s.coreDmgMob,s.artCdMult,s.collectMult,s.trainSpeed,s.docDrop,s.offered].every(positive)) return null;
    if (!record(s.pass) || !["dmg","rate","crit","critDmg","docDmg","docRate","docCrit"].every(k => positive(s.pass[k as keyof Passive]))) return null;
    if (!record(s.killsByKind) || !record(s.prog) || !Array.isArray(s.taken) || !s.taken.every(x => typeof x === "string") || !Array.isArray(s.doctrines) || !s.doctrines.every(x => typeof x === "string")) return null;
    if (s.map !== "plains" && s.map !== "city") return null;
    if (!s.cars.length || s.cars.length > 12 || !s.cars.every(c => c && CAR_KINDS.includes(c.kind as CarKind) && Number.isInteger(c.level) && c.level >= 0 && c.level <= 30 && [1,2,3].includes(c.tier) && positive(c.invested) && (!c.branch || BRANCHES[c.kind as CarKind]?.some(b => b.id === c.branch)))) return null;
    const kinds = ["lake","hill","wall","pond","building","rubble","fuel"];
    if (!s.terrain.length || !s.terrain.every(e => e && kinds.includes(e.k) && [e.x,e.y,e.r,e.hp,e.hp0].every(finite) && e.r > 0 && e.hp >= -1 && e.hp0 >= -1)) return null;
    if (!s.debris.every(e => e && [e.x,e.y,e.r,e.hp].every(finite) && e.r > 0 && e.hp >= 0 && (e.hp0 === undefined || positive(e.hp0)) && (e.cracked === undefined || typeof e.cracked === "boolean"))) return null;
    if (s.v === 9) {
      // v9 could write an incomplete battle as a finished wave. Keep the original,
      // replay that wave instead of skipping it, and exclude migrated runs from ranking.
      try { localStorage.setItem(`${KEY}.v9.backup`, raw); } catch { /* original remains intact */ }
      s.checkpoint = "start";
      s.migrated = true;
      s.v = VERSION;
    }
    if (s.checkpoint !== "start" && s.checkpoint !== "station") return null;
    if (s.migrated !== undefined && typeof s.migrated !== "boolean") return null;
    if (s.stationRefits !== undefined && (!Number.isInteger(s.stationRefits) || s.stationRefits < 0 || s.stationRefits > SHOP.refitPerStation)) return null;
    if (s.rng && ![s.rng.field,s.rng.combat,s.rng.cards].every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) return null;
    for (const [items, keys] of [[s.drops,["x","y","value","t"]],[s.pools,["x","y","r","t","dur","dps"]],[s.smokes,["x","y","r","t","dur","dmg"]],[s.strikes,["x","y","t"]],[s.shells,["x0","y0","x","y","t","dur","car","tx","ty"]],[s.fires,["x","y","r","t","dur","dps","car"]]] as [unknown,string[]][]) {
      if (items !== undefined && (!Array.isArray(items) || !items.every(item => item && keys.every(k => finite(item[k]))))) return null;
    }
    for (const items of [s.drops,s.pools,s.smokes,s.strikes,s.shells,s.fires]) {
      if (items?.some(item => Object.entries(item).some(([key,value]) => ["r","t","dur","dps","dmg","value"].includes(key) && (!finite(value) || value < 0 || key === "dur" && value === 0)))) return null;
    }
    if (s.shells?.some(item => !Number.isInteger(item.car) || item.car < 0 || item.car >= s.cars.length || !WEAPONS[item.kind as CarKind] || item.frac !== undefined && !positive(item.frac))) return null;
    if (s.fires?.some(item => !Number.isInteger(item.car) || item.car < -1 || item.car >= s.cars.length)) return null;
    if (s.trainS !== undefined && !positive(s.trainS)) return null;
    if (s.artCd !== undefined && !finite(s.artCd)) return null;
    if (s.dropAcc !== undefined && !positive(s.dropAcc)) return null;
    if (s.coSeq !== undefined && (!Number.isInteger(s.coSeq) || s.coSeq < 0)) return null;
    if (s.carStun !== undefined && (!Array.isArray(s.carStun) || !s.carStun.every(positive))) return null;
    if (s.graves !== undefined && (!Array.isArray(s.graves) || !s.graves.every(g => g && finite(g.x) && finite(g.y) && typeof g.kind === "string" && Object.hasOwn(ENEMY_STATS,g.kind) && Number.isInteger(g.w) && g.w >= 0 && g.w < WAVES.length))) return null;
    if (s.scoutBuild !== undefined && !positive(s.scoutBuild)) return null;
    if (s.coreDamageByCause && !record(s.coreDamageByCause)) return null;
    if (!s.cars.every(c => [c.cd,c.fired,c.dealt].every(n => n === undefined || finite(n)))) return null;
    return s;
  } catch {
    return null;
  }
}

/** 스냅샷을 살아 있는 런 상태에 덮어쓴다. **지형은 전제를 안 둔다** — main.ts가 얹어 둔 절차
 * 지형을 통째로 버리고 `s.terrain`으로 다시 세운다(iter124 · 파일 머리말). 옛 방식(재생성 배열에
 * 인덱스로 hp를 얹기)은 「같은 스테이지 → 같은 배열」이 참일 때만 성립했고 그 전제가 깨졌다.
 * @returns 지형까지 복원했는가 (좌표가 비어 있는 손상 저장만 false) */
export function applySave(s: SaveState, map: GameMap, field: Field, train: Train, combat: Combat, cards: Cards): boolean {
  field.waveIdx = s.waveIdx;
  field.t = s.t;
  // Start checkpoints replay this wave; station checkpoints open the saved shop.
  field.station = s.checkpoint === "station";
  field.scoutBuild = s.scoutBuild ?? 0;
  field.graves = (s.graves ?? []).map(g => ({...g}));
  field.coSeq = s.coSeq ?? 0;
  field.carStun = [...(s.carStun ?? [])];
  if (s.rng) { field.rnd.setState(s.rng.field); combat.rnd.setState(s.rng.combat); cards.rnd.setState(s.rng.cards); }
  train.s = s.trainS ?? train.s;
  combat.artCd = s.artCd ?? 0;
  combat.dropAcc = s.dropAcc ?? 0;
  combat.coreDamageByCause = { ...s.coreDamageByCause };
  field.gap = 0;
  combat.coreHp = s.coreHp;
  combat.scrap = s.scrap;
  combat.collected = s.collected;
  combat.kills = s.kills;
  // 옛 판(v1)은 여기 없었다 — VERSION을 올렸으므로 readSave가 이미 버렸고, 이 자리는 항상 값이 있다
  combat.killsByKind = { ...s.killsByKind };
  combat.bossCoreHits = s.bossCoreHits;
  combat.coreDmgBoss = s.coreDmgBoss;
  combat.coreDmgMob = s.coreDmgMob;
  combat.artCdMult = s.artCdMult;
  combat.collectMult = s.collectMult;
  combat.pass = { ...s.pass };
  combat.doctrines = [...s.doctrines];
  combat.docDrop = s.docDrop;
  train.speed = s.trainSpeed;
  train.cars = s.cars.map((c) => {
    const car = makeCar(c.kind as CarKind, c.level);
    car.tier = c.tier;
    car.invested = c.invested;
    car.branch = c.branch ?? null;
    car.cd = c.cd ?? 0;
    car.fired = c.fired ?? 0;
    car.dealt = c.dealt ?? 0;
    return car;
  });
  combat.drops = (s.drops ?? []).map(d => ({...d}));
  combat.pools = (s.pools ?? []).map(d => ({...d}));
  combat.smokes = (s.smokes ?? []).map(d => ({...d}));
  combat.strikes = (s.strikes ?? []).map(d => ({...d}));
  combat.shells = (s.shells ?? []).filter(d => train.cars[d.car]).map(d => ({...d,car:train.cars[d.car]}));
  combat.fires = (s.fires ?? []).map(d => ({...d,car:train.cars[d.car] ?? makeCar("incendiary")}));
  cards.prog = { ...s.prog };
  cards.taken = [...s.taken];
  cards.offered = s.offered;
  if (!s.terrain.length) return false;
  // **배열은 갈아 끼운다 — 참조는 그대로 둔다**(`map.terrain =`가 아니라 length 0 + push).
  // 지형 배열을 들고 있는 쪽이 있으면 재할당은 조용히 옛 배열을 남긴다
  map.terrain.length = 0;
  for (const e of s.terrain) {
    const hp0 = e.hp0 < 0 ? Infinity : e.hp0;
    const t: Terrain = {
      kind: e.k,
      x: e.x,
      y: e.y,
      r: e.r,
      hp: e.hp < 0 ? Infinity : e.hp,
      hp0,
      destroyed: e.hp === 0,
    };
    // **1차 파괴는 HP에서 되읽는다** (§0.7 J1) — 파생값이라 따로 싣지 않는다.
    // 저장 파일이 한 칸도 안 늘고, 문턱(`CRACK.at`)을 고쳐도 옛 세이브가 새 문턱을 따른다
    if (twoStageOf(map.id) && !t.destroyed && Number.isFinite(hp0) && t.hp <= hp0 * CRACK.at) t.cracked = true;
    map.terrain.push(t);
  }
  // **잔해를 다시 세운다** (§8.②). 위의 지형 복원이 끝난 **뒤**여야 한다 — 먼저 세우면 그 항목들이
  // 배열을 비우는 위 한 줄에 함께 지워진다. 복원 후 플로우필드 재계산은 main.ts가 시킨다(RESUMED 분기)
  for (const d of s.debris) {
    map.terrain.push({ kind: "wall", x: d.x, y: d.y, r: d.r, hp: d.hp, hp0: d.hp0 ?? d.hp, cracked:!!d.cracked, destroyed: false, scrap: 0 });
  }
  return true;
}
