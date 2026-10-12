// 전투 기본 — 열차 무기의 자동 사격(직사)과 코어 피격·패배. DESIGN §4.1(사선)·§6.1(무기)·§8.0(코어).
// 수치는 전부 balance.ts(= docs/BALANCE.md)에서 온다. 여기서 매직넘버를 만들지 말 것.
// 직사 2종(기관총·레일건)의 자동 사격 + 조준 포격(§6.2, 플레이어 클릭). 곡사·특수 무기는 이후 큐.

import { ARC, ARTILLERY, BOSS_MELT_PCT, BOSS_NEAR_U, COLLECT, CORE, CRACK, DMG_NUM, ENEMY, ENEMY_STATS, FUEL, FX_RULE, LAYOUT, MAPS, MULT, ONE_SHOT_OK, RENDER, SHIELD, SIEGE, TERRAIN, TIER_FX, dropValueOf, fxTierOf, WAVES, WEAPONS, WEAPON_FX, isBossKind, isMidKind } from "./balance";
import { addCorpse, markEnemyAction, spawnEnemy, type Enemy, type Field } from "./enemy";
import { emitAction } from "./action-events";
import { drawGlow, drawFx, FX, loopFrame, makeFx, spawnFx, updateFx, type FxSys } from "./fx";
import { blocksLos, explosive, losRadius, solidCover, mulberry32, twoStageOf, type GameMap, type Terrain, type Vec } from "./map";
import { drawTile } from "./sprites";
import { getEffectSettings } from "./render-settings";
import { at, type Car, carS, critChance, critMult, dmgOf, hasTurret, makePassive, type Passive, rateOf, supportAt, type Train, trainDps, weaponOf } from "./train";

/** QA: `?coredps=<배율>` — §0.5 "개체당 코어 DPS" 배율을 덮어쓴다. **BALANCE 정본이 아니다**
 * (`?bosshp`·`?dense`와 같은 부류). 감독 #23 ②의 사다리(0.4 / 0.6 / 0.8)를 한 서버에서 재려고 만들었다 —
 * 정본을 고쳐 가며 세 번 빌드하면 seed별 대조가 같은 조건에서 나오지 않는다.
 * `MULT.coreDps`에 **곱해지는 것이 아니라 대체한다** — 사다리 값이 곧 후보 정본값이라 그쪽이 읽기 쉽다
 * (`?bosshp`는 곱셈이다 — 두 스위치의 규약이 다르니 섞지 말 것). */
let qaCoreDps: number | null = null;
export function setQaCoreDps(v: number) {
  qaCoreDps = v;
}
/** 개체당 코어 DPS 배율의 **유일한 경로**. `dmgOf`·`rateOf`·`maxHpOf`와 같은 규약이다 —
 * `MULT.coreDps`를 직접 읽으면 QA 사다리가 조용히 안 걸린다(probe 표시값이 실제와 어긋난다) */
export function coreDpsMult(): number {
  return qaCoreDps ?? MULT.coreDps;
}

/** 사격 궤적(트레이서). 히트스캔이라 궤적은 연출 전용 — 수명이 지나면 사라진다 */
/** 한 발의 궤적. `tier`는 **연출 전용**이다 — 색·굵기를 고르는 데만 쓰고 피해는 이미 `dmgOf`가 들었다 */
export type Shot = { x0: number; y0: number; x1: number; y1: number; kind: string; t: number; tier: number };

/** **무기 이펙트 표의 유일한 조회 문** (§0.6 G · `balance.ts WEAPON_FX`).
 * 표에 없는 무기는 기관총 행을 빌린다 — **없으면 `1 - t/undefined`가 NaN이 되어 궤적이 통째로
 * 사라진다**(무기가 늘 때마다 밟는 함정이라 폴백을 둔다). 새 무기는 표에 한 줄 서면 끝이다 */
const wfx = (kind: string) => WEAPON_FX[kind] ?? WEAPON_FX.machinegun;
/** 티어 색 단계 (BALANCE §0.6 「T1 백 → T2 청 → T3 금」 + §0.7-C 「T3 분기 2갈래의 색」).
 * 인수는 **티어가 아니라 `fxTier`가 낸 행 번호**(1~5)다 — 4·5행이 T3 분기색이고 범위 밖은 클램프한다 */
const tfx = (tier: number) => TIER_FX[Math.max(0, Math.min(TIER_FX.length - 1, (tier | 0) - 1))];
/** 이 칸이 그릴 이펙트 행 (BALANCE `fxTierOf`). **`car.tier`를 여기 통과시키지 않고 그대로 쓰는 자리가
 * 둘 남아 있다** — 포탑 셀 선택(`turretName`)과 티어별 사격 집계(`tierShots`). 둘은 «진짜 티어»의 몫이다 */
const fxTier = (car: Car): number => fxTierOf(car.kind, car.tier, car.branch);
const shotTtl = (kind: string): number => wfx(kind).ttl;

/** **§0.7 L(화려함의 폭)의 조회 문** — 색·굵기(§0.6 G)와 **갈라 둔** 이유는 A/B 때문이다.
 * `?tierfx=0`이면 이 문만 T1 행으로 굳어 화면이 **L 이전과 정확히 같아진다**(색·굵기 단계는 그대로
 * 산다 — 그쪽은 §0.6이고 이 절이 끄는 축이 아니다). 「이 축만 끈다」는 `?gate=0`·`?event=0`과 같은 규약 */
const L_OFF = { ghost: 0, casing: 0, ring: 0, size: 1 };
const lfx = (tier: number): { ghost: number; casing: number; ring: number; size: number } =>
  qaTierFx ? tfx(tier) : L_OFF;
let qaTierFx = true;
/** QA `?tierfx=0` — §0.7 L의 세 축(잔상·약협·착탄 링 + 착탄 크기)을 통째로 끈다.
 * **판정은 한 자리도 안 움직인다**(연출 전용) — 이 스위치의 쓸모는 컷 두 장의 `img-diff`가
 * 「L이 화면에 더한 픽셀」을 «그것만» 세게 하는 것이다(T1은 0px여야 한다) */
export function setQaTierFx(on: boolean): void {
  qaTierFx = on;
}
export function qaTierFxOn(): boolean {
  return qaTierFx;
}

/** QA `?acidlock=1` — **§0.7 J2의 네 번째 자물쇠를 잠근다**(산성 웅덩이가 지형을 안 녹인다).
 * 기본은 `false` = **지금 그대로**다. 잠그는 것이 정본 문면인데 **도시 완주가 부러지므로**
 * (`60/60 → 48/60` 실측) 값을 굳히지 않고 손잡이만 남긴다 — `?cover=`와 같은 부류이고
 * **BALANCE 정본이 아니다**. `updatePools`가 이 값을 본다 */
let qaAcidLock = false;
export function setQaAcidLock(on: boolean): void {
  qaAcidLock = on;
}
export const acidLockOn = (): boolean => qaAcidLock;

/** 착탄 폭발 연출 수명(초) */
const BLAST_TTL = 0.45;
/** 폭발 스프라이트 높이 / 착탄 반경. 불덩이가 판정 원보다 커야 "이 범위가 날아갔다"로 읽힌다 */
const BLAST_FX = 2.2;
/** 대형 적 사망 폭발의 크기 / 적 표시 크기 */
const DEATH_FX = 3.2;
/** **폭발 지물의 화면 흔들림 배수** (§0.7 J1-c ⓐ "화면 흔들림"). 착탄(SHAKE_TTL)보다 **길어야**
 * 「내가 부른 포격」과 「그것이 터뜨린 탱크」가 한 사건으로 뭉치지 않는다 — 연출 전용 파라미터라
 * BALANCE 정본이 아니다(BLAST_FX·SHAKE_TTL과 같은 자리) */
const FUEL_SHAKE = 2.2;
/** 화면 진동 (§6.2 "착탄 폭발 + 화면 진동"). 지속(초)·최대 진폭(월드) — 연출 전용 파라미터 */
const SHAKE_TTL = 0.35;
const SHAKE_AMP = 14;

/** 조준 포격: 클릭 시점에 등록되고 ARTILLERY.delaySec 뒤 착탄한다 (§6.2) */
export type Strike = { x: number; y: number; t: number };
/** 곡사 포탄 (§6 "탄속 느림"). 발사 시점의 **표적 위치**로 날아간다 — 유도하지 않으므로
 * 이동 표적은 착탄 전에 반경 밖으로 걸어 나갈 수 있다(그게 곡사의 대가다) */
export type Shell = {
  x0: number; y0: number; x: number; y: number; t: number; dur: number; car: Car; kind: string;
  /** 이 포탄이 지는 **피해 지분** (1 = 전탄). MLRS는 1회에 salvo발을 뿌리므로 발당 1/salvo다 —
   * 명목 DPS(dmg × rate)를 정직하게 유지하기 위한 나눗셈이고, 프리미엄은 «면적»으로만 받는다.
   * **발사 시점의 산성 저하 배수도 여기 곱해 둔다** (§8.③) — 피해가 착탄 시점에 다시 계산되므로
   * 실어 보내지 않으면 포탄이 나는 동안 저하가 조용히 풀린다 */
  frac?: number;
  /** **유도** 표적 (미사일 포드). 살아 있는 동안 착탄점이 이 적을 따라간다.
   * 착탄 전에 죽으면 그 프레임의 마지막 좌표에 그대로 떨어진다 */
  target?: Enemy;
  /** 연기 궤적을 마지막으로 뱉은 자리(월드, 연출 전용). **시간이 아니라 거리 눈금**이라
   * 비행 시간이 다른 포탄들이 같은 밀도로 연기를 남긴다 (§0.6 F의 「피해 눈금」과 같은 규약) */
  tx: number;
  ty: number;
};

/** **총구 섬광** (§0.6 G ⓐ 「발사」 단 · 연출 전용). 스프라이트 `muzzle`의 **뿌리**에 얹는
 * 티어색 타원이라 무기가 무엇이든 「지금 쐈다」와 「얼마나 센가」가 한 문법으로 읽힌다.
 * `x,y` = **포신 끝**(화염 중심이 아니다 — 화염은 여기서 앞으로 뻗는다) · `a` = 총구가 향한 각 */
export type Muzzle = { x: number; y: number; a: number; t: number; kind: string; tier: number };
/** **히트 마커** (§0.6 G ⓒ 「명중은 표적 위에 히트 마커를 남긴다」 · 연출 전용).
 * 스파크(가산 불덩이)와 갈라 둔 이유: 스파크는 «무언가 터졌다»고만 말하고 **어느 개체가 맞았는지**는
 * 안 말한다. 마커는 표적 중심에 십자를 얹으므로 밀집 대형에서도 「이 한 기가 맞았다」가 읽힌다 */
export type Mark = { x: number; y: number; t: number; tier: number };

/** **데미지 숫자** (§0.7 H3). 「짧게 살다 사라지는 목록」 규약은 `Mark`와 같고 칸이 셋 더 있다:
 *  · `amt`  = **합산된** 피해(§0.7 H3 ⓑ) — 그리는 값이자 색 구간을 고르는 값이다
 *  · `crit` = 창 안의 어느 한 발이라도 치명타였는가 (크기 ×1.25 + 테두리색)
 *  · `src`  = 합산 창의 **열쇠**로만 쓴다. 위치는 스폰 시점에 굳히므로 표적이 죽거나 움직여도
 *    숫자는 그 자리에 남는다 — 그래서 `Enemy`에 「최근 피해」 칸을 만들 필요가 없다(분열·부활이
 *    그 칸을 물려받는지가 애매해지는 것을 피한다 · `Company.broken`과 같은 «목록 쪽 잔여 상태» 규약) */
export type DmgNum = { x: number; y: number; t: number; amt: number; crit: boolean; src: Enemy };

/** 데미지 숫자 분포 히스토그램의 칸 수 (probe `combat.dmgNum.hist` — 밑이 √2다).
 * 색 구간 경계를 «실측 분포에서» 뽑으라는 §0.7 H3의 요구가 재는 곳이 여기 하나다 */
const DMG_HIST_N = 32;

/** **잡몹 처치 반경 히스토그램**의 칸 폭·칸 수 (probe `combat.ttk.*.killR` · iter160 · 표 8 ⓔ).
 * 단위는 **루프 반경 1**(`BossLog.killDistU`와 같은 규약)이고 마지막 칸이 `4.0 이상`이다 —
 * 스폰 링이 distU **3.575**(`outerR + baseSpeed × approachSec`)이므로 그 칸은 비어야 정상이다.
 * 폭이 0.25인 이유는 판정선 때문이다: 「화면에 들 수 있는 가장 먼 반경」의 세로축 값 373px이
 * **1.99 루프반경**이라 0.5 폭에서는 판정선이 칸 «경계»에 얹혀 위아래가 안 갈린다 */
export const KILL_R_STEP = 0.25;
export const KILL_R_BINS = 17;

/** **화염 지대** (소이탄 §6.1 "착탄 지점에 화염 지대 (지속 피해·지역 거부)").
 * `dps`는 착탄 시점의 `dmgOf(car) × burn.dpsRate`를 굳혀 둔다 — 지대가 남아 있는 동안 그 칸이
 * 팔려도(§7.3) 판정이 흔들리지 않게. `car`는 피해 귀속(car.dealt)에만 쓴다 */
export type Fire = { x: number; y: number; r: number; t: number; dur: number; dps: number; car: Car };
/** **산성 웅덩이** (§8.⑦ 산성 슬라임 "사망 지점에 산성 웅덩이 — 잔해·성벽을 서서히 녹임").
 * 화염 지대와 **같은 부류의 수명 있는 지대**인데 때리는 대상이 갈린다 — 저쪽은 적만, 이쪽은 **지형만**이다.
 * 적·열차·코어를 한 톨도 안 건드리는 것이 §8.0을 넘지 않는 가장 좁은 경로이고, 동시에 이 적이
 * «간접 지형 파괴»라는 정체를 갖는 방식이다(피해원이 플레이어 쪽 `car`가 아니므로 공적도 없다) */
export type Pool = { x: number; y: number; r: number; t: number; dur: number; dps: number };
/** **연막 지대** (§8.⑧ 연막차 "구역 내 직사 명중률 급감 — 임시 지형을 만드는 적").
 * 화염 지대·산성 웅덩이와 **같은 부류의 수명 있는 지대**인데 셋 중 **유일하게 아무것도 안 때린다** —
 * 하는 일은 그 안의 적을 때리는 **직사 피해에 `dmg`를 곱하는 것** 하나뿐이다(§8.0 「방해」).
 * `car`가 없는 것도 그래서다: 피해원이 아니라 판정 배수라 공적에 낄 자리가 없다 */
export type Smoke = { x: number; y: number; r: number; t: number; dur: number; dmg: number };
/** 착탄 폭발 (연출 전용). r = 그 폭발의 실제 반경(월드) — 주포와 곡사가 크기가 다르다 */
export type Blast = { x: number; y: number; t: number; r: number; hero?: boolean };
/** 필드에 떨어진 스크랩 (DESIGN §7.1). 값은 BALANCE §2, 흡수 파라미터는 COLLECT.
 * t = 떨어진 뒤 경과(초) — 등장 연출에만 쓴다 */
export type Drop = { x: number; y: number; value: number; t: number };

/** 드랍 등장 연출 시간(초) */
const DROP_POP = 0.2;

/** 곡사 포탄이 그려지는 최고 높이(월드). 순수 연출 — 판정은 지면 좌표로만 한다 */
const SHELL_ARC = 46;

/** 포탄이 **그려지는** 자리(월드). 연기 궤적(update)과 포탄 그림(draw)이 같은 식을 봐야
 * 연기가 포탄 뒤에 붙는다 — 두 벌이 되면 연기가 지면을 따라 기어간다 */
function shellPos(sh: Shell): { x: number; y: number } {
  const k = sh.t / sh.dur;
  return { x: sh.x0 + (sh.x - sh.x0) * k, y: sh.y0 + (sh.y - sh.y0) * k - 4 * k * (1 - k) * SHELL_ARC };
}

/** 보스 1기의 교전 기록 (감독 #31 ⓒ). 시간은 전부 런 절대 시각(초)이고, 손실은 **교전 개시 이후**의
 * 몫만 담는다 — 접근 중(이속 0.45로 14~17초)의 잡몹 피해까지 넣으면 "보스전이 코어를 얼마나 뽑는가"가
 * 부풀려진다. 교전 전에 죽은 보스는 `engageT`가 null이고 손실 열은 0이다 */
export type BossLog = {
  /** 0-based 보스 순번 (웨이브 6 = 0 … 웨이브 36 = 5) = `BOSS.hpStep`의 지수 */
  n: number;
  /** **그 자리에 선 얼굴** (감독 #72 ⑤). 풀(그람·크롤러)과 **이벤트 관문(죽음의 군주)**이 한 장부에
   * 섞이므로 행마다 종이 있어야 갈린다 — `boss.window`(불변식 3)가 이 칸으로 이벤트 행을 뺀다 */
  kind: string;
  wave: number;
  maxHp: number;
  spawnT: number;
  /** 루프 반경 0.5에 서서 점타를 시작한 시각 (DESIGN §6) */
  engageT: number | null;
  /** 레일 중심선을 넘은 시각 */
  breachT: number | null;
  /** **보스가 처음 피해를 받은 시각** — `fightSec`의 기준점이다 (감독 #34 ①) */
  hitT: number | null;
  killT: number | null;
  /** §5 검산의 판정값 — 목표 10~13초. **정의 = 「첫 피해 → 처치」**(감독 #34 ① 승인).
   *
   * 옛 정의는 「교전 위치(루프 반경 0.5) 정지 → 처치」였는데 그것으로는 §5를 **원리적으로 못 잰다** —
   * 화력이 충분하면 보스가 서기 전에 죽어 값이 언제나 `None`이다(iter49 실측: 코어 불사 컷 10기 중
   * 6~8기). §5 문면("보스전 10~13초")이 재려는 것은 "얼마나 오래 쏴야 죽는가"이지 "얼마나 오래
   * 정지해 있었는가"가 아니다 */
  fightSec: number | null;
  coreHits: number;
  lostBoss: number;
  lostMob: number;
  /** **첫 피해 프레임의 내 화력** (iter137 · B7·B9 파형의 갈래 ⓑ·ⓒ를 가르는 눈금).
   *  `dps`는 `shop.dps`와 **같은 단위**(패시브 포함 명목 DPS)이고, `cars`는 그때의 칸 수,
   *  `tier`는 포탑칸의 최대 티어다. 셋 다 `hitT`가 서는 프레임의 스냅샷이라 **보스전 중의
   *  정차·카드 취득이 섞이지 않는다**. `maxHp / dps`가 곧 「이 보스전의 기대 길이」이고,
   *  그것이 `fightSec`과 안 맞으면 원인은 화력 계단이 아니라 다른 축이다 */
  dps: number | null;
  cars: number | null;
  tier: number | null;
  /** **첫 피해 프레임의 판 상태** (iter137 · 갈래 ⓐ「동시 편성」의 눈금).
   *  `hitDistU` = 그때 보스가 선 자리(루프 반경 1) — 크면 «멀리서 장사거리 한 발에 시계가
   *  먼저 시작됐다»는 뜻이라 `fightSec`이 교전 길이가 아니라 **접근 시간**을 싣고 있다.
   *  `aliveAtHit` = 그 프레임의 필드 적 수 · `mobKills` = 보스전 «동안» 죽은 잡몹 수
   *  (= 내 화력이 보스 밖으로 샌 양의 대변). 셋 다 `hitT`~`killT` 구간의 것이다 */
  hitDistU: number | null;
  aliveAtHit: number | null;
  mobKills: number;
  /** **`fightSec`의 편향을 안 타는 대안 눈금 둘** (iter141 · 큐 1).
   *  `fightSec`(첫 피해 → 처치)은 장사거리 한 발이 «맵 밖에서 접근 중인» 보스를 스치면 거기서
   *  시계가 시작돼 **접근 시간을 싣는다**(`hitDistU` ~ `fightSec` r 0.890 · iter137).
   *  두 칸은 그 시작점을 다른 자리에 두어 편향을 걷어낸다:
   *  - `meltT`/`meltSec` = **HP가 90%를 지난 시각 → 처치**. 첫 «스침»을 문턱으로 걷어낸다.
   *  - `nearT`/`nearSec` = **루프 반경 1.5 안에 든 시각 → 처치**. 거리로 직접 자른다.
   *  ⚠ 둘 다 **참고 열**이다 — 불변식 3의 판정 열은 여전히 `boss.window.med`(감독 판정 5)다 */
  meltT: number | null;
  meltSec: number | null;
  /** `meltT` 프레임에 보스가 선 자리(루프 반경 1) — `hitDistU`의 짝이다. **`meltSec`이 편향을
   *  얼마나 걷어냈는지는 이 칸으로만 읽힌다**: 이 값이 여전히 2를 넘으면 문턱을 지나는 순간에도
   *  보스는 «걸어 들어오는 중»이라 `meltSec` 역시 접근 시간을 싣는다 */
  meltDistU: number | null;
  nearT: number | null;
  nearSec: number | null;
  /** **처치 프레임에 보스가 선 자리**(루프 반경 1 · `hitDistU`·`meltDistU`와 같은 규약 · iter155 · 큐 1).
   *  DESIGN §6의 그림(「보스는 루프 반경 0.5에 서서 코어를 점타한다」)이 회귀 컷에서 한 번도 안 서고
   *  `engageT`가 전량 null인 자리를 «수»로 여는 칸이다 — 「보스가 어디까지 왔다가 죽는가」의 분포가
   *  이 칸 하나로 난다. `nearT`(반경 1.5 진입)가 「왔는가」이면 이 칸은 「어디서 끝났는가」다 */
  killDistU: number | null;
  /** **처치 프레임에 보스가 선 «각»**(코어 기준 · `Math.atan2(y-cy, x-cx)` 도 단위 · iter156 · 큐 1).
   *  `killDistU`(반지름)와 이 칸 둘이면 **probe가 화면 좌표를 되만들어** `hud.ts gateVisible`로
   *  「처치 프레임에 관문이 화면 안이었나」를 분류할 수 있다 — `combat.ts`에 `VIEW`·`CAM`·`hud`를
   *  끌어들이지 않는 유일한 길이다. ⚠ **월드 좌표 두 칸(`killX`/`killY`)을 넣지 말 것** —
   *  이 장부의 자리 칸은 전부 루프 반경 단위이고, 각 하나면 반지름과 짝이 맞는다 */
  killDeg: number | null;
};

export type Combat = {
  /** Optional isolated encounter hooks; the campaign leaves these unset. */
  priorityTarget?: Enemy | null;
  damageScale?: (enemy: Enemy, kind: string) => number;
  onHit?: (enemy: Enemy, kind: string, damage: number) => void;
  shots: Shot[];
  /** 비행 중인 곡사 포탄 */
  shells: Shell[];
  /** 비행 중인 조준 포격 (§6.2) */
  strikes: Strike[];
  /** 지면에 남은 화염 지대 (소이탄) */
  fires: Fire[];
  blasts: Blast[];
  /** 주포 남은 쿨다운(초). 0 이하 = 발사 가능 */
  artCd: number;
  /** 주포 발사 수 · 적에게 준 누적 피해 · 명중한 적 수 (probe 검산용) */
  artFired: number;
  artDealt: number;
  artHits: number;
  /** 마우스 커서의 월드 좌표. 조준 보조 표시 전용(헤드리스 QA에서는 null) */
  aim: { x: number; y: number } | null;
  /** 남은 화면 진동 시간(초) */
  shake: number;
  /** 곡사 착탄 수 · 그중 아무도 못 맞힌 수 · 명중 적 수 (§6 "이동 표적에 약함" QA용) */
  arcImpacts: number;
  arcMisses: number;
  arcHits: number;
  /** **실드가 흡수한 직사 피해 총량** (§0.6 C3 ⓑ "실드는 유한하다"). iter86 이전에는 「관통 빔이
   * 정면을 통과해 무산된 횟수」였는데, 실드가 유한해지면서 **막힌 것이 그대로 실드에서 빠지므로**
   * 세는 단위가 «횟수»에서 «피해»로 바뀌었다(`domeBlocked`와 같은 규약이 됐다) */
  shieldBlocked: number;
  /** **실드가 깨진 횟수** (§0.6 C3 ⓑ). `Field.guardsMade`가 분모다 — 태어난 방패병 중 몇 %의 전열이
   * 실제로 열렸는가가 「실드가 유한하다」의 유일한 판정 수치다(무한이면 0, 종잇장이면 100%다) */
  shieldBreaks: number;
  /** **전열에 가려 표적 후보에서 빠진 연인원** (§0.6 C3 = 이번 항목의 신규 문법의 «주» 경로).
   * `losBlocked`(사선 차단)와 **같은 규약**이다 — 직사 무기가 방진을 만나 「뒤가 아니라 앞줄을
   * 쏘게 된」 횟수이고, 이 값이 0이면 전열이 아무것도 안 가린 것이다.
   * `coverBlocked`(피해)와 갈라 세는 이유: 대부분의 차단은 **표적 선정 단계**에서 일어나 피해가
   * 아예 발생하지 않는다(관통 빔·착탄 광역만 피해 단계에서 막힌다) */
  coverSkipped: number;
  /** **전열이 「뒤에 선 남」 대신 막은 직사 피해 총량** (§0.6 C3 = 이번 항목의 신규 문법).
   * `shieldBlocked`(자기 몫)와 갈라 센다 — 이 값이 0이면 방패 오크는 여전히 «자기만 단단한 적»이지
   * «부대의 전열»이 아니다. **C3가 장식인지 축인지를 가르는 첫 수치다** */
  coverBlocked: number;
  /** 직사 타겟팅에서 **사선이 막혀** 후보에서 빠진 연인원 (§4.1 언덕·성벽) */
  losBlocked: number;
  /** 그중 **관측칸이 열어 준** 연인원 (§6.1 "인접 직사 무기가 언덕 너머 사격") = 관측칸의 실효 지표 */
  losOverHills: number;
  /** **관측칸이 은신을 뚫고 쏜 발 수** (§8.③ 그림자 암살자 · §6.1 "사계 개척"). `losOverHills`와
   * 같은 규약이고 재는 것만 다르다 — 저쪽은 «언덕이 사선을 막았을 발», 이쪽은 «은신이라 표적조차
   * 안 됐을 발»이다. 관측칸이 없으면 둘 다 0이다 */
  stealthPierced: number;
  /** 화염방사 부채꼴 발사 수 · 그 발사들이 때린 적 연인원 (§4 "실효 DPS 15 = 명목 10 × 평균 1.5기" QA용) */
  coneShots: number;
  coneHits: number;
  /** 테슬라 발사 수 · 체인이 실제로 닿은 적 연인원 (§4 "실효 12 = 4 × 3기" QA용) */
  chainShots: number;
  chainHits: number;
  /** 직사 착탄 광역(함포 hitSplash)이 **주 표적 말고** 더 때린 적 연인원 (§6.1 "광역 착탄" QA용) */
  splashHits: number;
  /** 소이탄: 만든 화염 지대 수 · **물 위라 무산된** 수 (§6.1 "물 위엔 무효" QA용) · 지대가 준 누적 피해 */
  fireZones: number;
  fireOnWater: number;
  fireDmg: number;
  /** 레이저 지속 조사 배수의 **가중 평균** 산출용 누산기 (발사 수 · 배수 합, §6.1 "지속 조사 시 증폭" QA용) */
  rampShots: number;
  rampSum: number;
  /** 오우거가 성벽에 넣은 누적 피해 · 오우거가 철거한 성벽 수 (§8 "적이 새 길을 개척함" QA용).
   * demolished는 조준 포격 철거와 합산되므로 적 파괴분을 따로 세야 경로가 돌았는지 알 수 있다 */
  breakerDmg: number;
  breakerDemolished: number;
  /** **공성 종대 돌파** (§0.6 C5). 부대가 성벽에 넣은 누적 피해 · 부대가 철거한 성벽 수 ·
   * 돌파를 **시작한 누적 횟수**(부대 하나가 벽 한 장을 무는 사건). 오우거 몫(`breakerDmg`)과 칸을
   * 나눈 이유는 그때와 같다 — 합치면 「부대가 실제로 뚫는가」가 개체 파괴분에 묻힌다 */
  siegeDmg: number;
  siegeDemolished: number;
  siegeRams: number;
  /** 보스가 코어에 넣은 **점타** 횟수 (BALANCE §1 "10/히트 2s"). 잡몹의 연속 DPS와 경로가 달라
   * 따로 세지 않으면 "코어가 왜 10씩 깎였는지"를 probe가 설명하지 못한다 */
  bossCoreHits: number;
  /** 코어가 잃은 HP를 **경로별로** 가른 누적치 (큐 2 계측). `coreHp`만으로는 "보스 점타가 깎았나
   * 잡몹이 깎았나"를 못 가른다 — iter30·31이 보스전을 가르는 원인으로 지목한 것이 잡몹 몫이라
   * 그 값을 직접 재려면 두 갈래를 따로 적립해야 한다. 판정·수치에는 영향이 없다(적립만 한다) */
  coreDmgBoss: number;
  coreDmgMob: number;
  /** Read-only defeat summary ledger; records existing damage, never drives combat. */
  coreDamageByCause: Record<string, number>;
  /** 보스 교전 개시 프레임의 위 두 누적치 스냅샷. 보스전 **구간만**의 손실률을 빼서 구한다.
   * **보스가 죽으면 비워진다** — 60웨이브 체제는 보스가 10기라 안 비우면 첫 보스의 값이 런 끝까지 남는다 */
  bossFightBase: { boss: number; mob: number } | null;
  /** 보스 1기당 1행 (감독 #31 ⓒ). `BOSS.hpStep 1.13`의 확정 근거가 될 계측이다 —
   * "순번마다 교전 시간이 §5 검산 10~13초를 유지하는가"는 보스별로 쌓아야만 보인다.
   * 위의 단일 필드(`bossFightBase`·`Field.bossEngageT`)는 **지금 교전 중인 1기**의 것이다 */
  bossLog: BossLog[];
  coreHp: number;
  /** Presentation only: a bounded pulse for real HP loss, including continuous damage. */
  coreImpact: { age: number; serial: number; heavy: boolean };
  kills: number;
  /** 종류별 처치 수. 드랍 검산(§2 드랍원별 값)이 적종 혼합·분열체까지 견디려면 종류별로 세야 한다 */
  killsByKind: Record<string, number>;
  /** 분열 발생 횟수 (§8.⑦ QA용). 분열체는 f.spawned에 잡히지 않는다 */
  splits: number;
  /** **등껍질이 튕겨 낸 피해 합** (§8.② 철갑 딱정벌레 · probe `armor.bounced`). 명목 − 실피해다 —
   * 곡사에서는 양수(0.3배로 깎였다), 직사에서는 음수(1.4배로 증폭됐다)라 **한 칸에 두 방향이 함께
   * 쌓인다**: 부호가 곧 "이 편성이 이 적을 상성으로 잡고 있는가"의 지표다 */
  carapaceDmg: number;
  /** **산성 웅덩이** (§8.⑦ 산성 슬라임) — 지금 살아 있는 지대 · 지금까지 깐 총수 ·
   * 그 지대들이 **지형에 넣은 누적 피해** · 그렇게 **녹아 없어진 성벽 수**.
   * `demolished`(조준 포격 + 오우거 철거)와 갈라 세야 «적이 지형을 녹였는가»가 probe에서 보인다 */
  pools: Pool[];
  acidPools: number;
  meltDmg: number;
  meltDemolished: number;
  /** **포자 트렌트가 방출한 새끼 수** (§8.⑦ · probe `swarm.spores`). 0이면 `perHits` 문턱에
   * 한 번도 안 닿은 것이다(= 편성이 이 적을 두세 발에 지웠다는 뜻이기도 하다) */
  spores: number;
  /** **§8.⑧ 지원 계측** — 지금 깔려 있는 연막 · 지금까지 깐 총수 · 조준 포격이 **즉시 소거**한 수 ·
   * 연막이 **깎아 낸 직사 피해량** · 실드 돔이 **통째로 막은 피해량** · 배너 방벽이 **깎아 준 몫** ·
   * 배너 로드 사망으로 광폭화한 개체 수.
   * 셋(`smokeBlunted`·`domeBlocked`·`warded`)이 곧 §6 예산에서 «지원 4종이 편성에게 물린 추가 화력»이고,
   * 그중 방벽만 `effHp`가 미리 세어 둔 값이라 **실측과 상한을 맞대 볼 수 있다** */
  smokes: Smoke[];
  smokeLaid: number;
  smokeCleared: number;
  smokeBlunted: number;
  domeBlocked: number;
  /** **무적이 되돌린 피해 합** (§0.7 K). `domeBlocked`와 같은 규약이고 갈리는 것은 원인뿐이다 —
   * 0이면 무적 국면이 «한 번도 맞지 않았다»는 뜻이고, 그것은 시전 창이 화면에서 안 읽혔다는 신호다 */
  invulnBlocked: number;
  warded: number;
  deathRages: number;
  /** **골렘이 세운 잔해 수** (§8.② · probe `armor.debris`). 0이면 골렘이 전부 레일 안쪽에서
   * 죽었거나(§5.0 규칙) 동시 상한(ENEMY.debrisCap)에 걸린 것이다 */
  debris: number;
  /** 필드에 떨어져 아직 회수되지 않은 스크랩 (§7.1) */
  drops: Drop[];
  /** 지금까지 **떨어진** 스크랩 총합. scrap(= 회수액)과의 차 = 회수 실패분 (probe 검산용) */
  dropped: number;
  /** §0.5 드랍 배율의 **소수점 누산기** — 1을 채울 때마다 드랍 1개가 나간다(dropScrap 참조).
   * 런이 끝나도 남는 잔여(<1)가 있어 `dropped`와 §2 표값 합의 차는 항상 1 미만이다 */
  dropAcc: number;
  /** **이 런의 드랍 가치**(= `dropValueOf(map.id)` · 평원 0.2 · 도시 0.3 · QA `?drop=`이 덮는다).
   * 맵마다 갈리는 값이라 런 시작에 한 번 굳힌다 — `dropScrap`은 맵을 안 받는다 */
  dropValue: number;
  /** 수명이 다해 사라진 드랍의 총액·개수 (BALANCE §2 드랍 수명 25초, 감독 #12 ③).
   * 검산식이 `collected + onField = dropped`에서 **`+ expired`**로 바뀐다 — 이 항이 없으면
   * 소멸분이 어디로 갔는지 probe가 설명하지 못한다 */
  expired: number;
  expiredN: number;
  /** 런 내 화폐 (BALANCE §2) = **잔액**. 수집칸이 흡수하면 늘고 정차역 상점(§7.3)이 쓰면 준다 */
  scrap: number;
  /** 지금까지 **회수한** 총액 (지출과 무관). 드랍 검산식
   * `collected + onFieldValue + expired == dropped`은 이 값을 써야 한다 —
   * 잔액(scrap)을 쓰면 상점에서 돈을 쓰는 순간 검산이 깨진다 */
  collected: number;
  /** 지형이 파괴돼 플로우필드를 다시 구워야 한다 (§4.2 "지형 파괴 시 실시간 재계산").
   * 재계산은 main.ts가 하고 플래그를 내린다 */
  terrainDirty: boolean;
  /** 파괴된 성벽 수 (QA용) */
  demolished: number;
  /** **이 맵의 지형 규칙** (§0.7 J · `MAPS[map.id]`에서 한 번 읽어 든다). 맵 갈래를 매 프레임
   * 문자열로 비교하지 않기 위한 사본이고, 정본은 balance.ts MAPS 한 곳이다 */
  shootTerrain: boolean;
  twoStage: boolean;
  enemyBreaks: boolean;
  /** **지형을 향해 나간 직사 탄 수** (§0.7 J1 「사선을 여는 데 내 화력을 쓴다」의 유일한 눈금).
   * `losBlocked`(표적을 못 잡은 횟수)와 짝이다 — 도시 맵에서는 그 중 몇이 «탄으로 바뀌었나»가
   * 이 값이고, 평원에서는 언제나 0이다 */
  terrainShots: number;
  /** 그 탄이 지형에 넣은 피해 합 */
  terrainShotDmg: number;
  /** **1차 파괴(균열)에 든 지물 수** (§0.7 J1). 2단 파괴가 실제로 두 단계로 도는지의 눈금 —
   * `demolished`(2차 = 소멸)보다 크거나 같아야 한다 */
  cracked: number;
  /** **폭발 지물 우편함** (§0.7 J1-c). `damageTerrain`은 `map`도 `Field`도 안 받으므로 —
   * 지형 피해의 유일한 문이라 **파괴원 다섯이 전부 그 문을 지난다**(인자를 늘리면 다섯 곳이 갈린다) —
   * 2차 파괴 프레임에 여기 «터질 것»을 적어 두고 `resolveFuelBlasts`가 같은 프레임에 비운다.
   * `Field.rockPending`·`quakeAt`과 **같은 규약**이다(enemy.ts → combat.ts 우편함) */
  fuelPending: Terrain[];
  /** 폭발 지물이 터진 횟수 · 폭발이 적에게 넣은 누적 피해 · 맞은 적 연인원 ·
   * **폭발이 연쇄로 철거한 지물 수**(ⓑ 「주변 지물에도 피해」의 유일한 판정치 — 0이면 연쇄가 장식이다) */
  fuelBlasts: number;
  fuelDmg: number;
  fuelHits: number;
  fuelChain: number;
  /** 패배 = 코어 HP 0 */
  over: boolean;
  /** **엔드 씬 경과 시간**(초 · DESIGN §0.7 M). `over`가 선 다음 프레임부터 흐르고, 그동안
   * **시뮬은 멎어 있다**(main.ts update의 조기 반환이 곧 정본 ① 「전부 정지」다) —
   * 그래서 이 값은 «시뮬 시간»이 아니라 **연출만의 시계**이고 `field.t`와 따로 논다.
   * `END_SCENE_SEC`을 넘으면 결과화면이 뜬다. 클리어(`field.cleared`)는 코어가 멀쩡하므로 안 쓴다 */
  endT: number;
  /** 사거리 단위 "루프 반경 = 1"의 월드 환산값 */
  unit: number;
  /** 레일 폴리라인 (드랍 당김 전용). §7.1 수집은 열차 = 레일 위에서만 일어나므로
   * "회수 가능한 자리"의 기준선이 이 선이다 */
  loop: Vec[];
  /** 드랍을 레일 쪽으로 당기는 최대 **월드** 거리 = `COLLECT.pull × unit`(§2 등재값, 감독 #29 ①).
   * QA `?pull=<월드>`로 덮어쓸 수 있다 — A/B 컷을 정본 실측으로 인용하기 전에 probe `drops.pull`을 볼 것 */
  dropPull: number;
  /** 열차 특성 카드의 누적 배율 (BALANCE §7 "주포 쿨다운 −10% / 수집 반경 +15%"). 카드는 **곱연산 누적**이라
   * 같은 카드를 두 번 받으면 0.9²다. 1.0 = 카드 없음 — 이 두 값을 쓰는 곳은 각각 callStrike/조준원 표시와
   * updateDrops뿐이고, **ARTILLERY.cooldownSec·COLLECT.radius를 직접 읽는 새 코드는 카드를 무시하게 된다** */
  artCdMult: number;
  collectMult: number;
  /** **이번 런에 고른 열차 교리의 id 목록** (balance.ts `DOCTRINES` · 감독 #72 ⑦ · DESIGN §D1 ⓐ).
   * 순서가 곧 단(段)이고 `length`가 「몇 단까지 골랐나」다 — 다음 단이 열리는 조건을 **여기와
   * 편성(T3 분기를 고른 무기 수)만으로 유도한다**(main.ts `pendingDoctrine`). 별도 카운터를 두면
   * 세이브 복원·QA 진입점마다 두 값이 어긋난다(train.ts `pendingBranch`와 같은 규약).
   * 효과 자체는 여기 없다 — `pass.doc*`·`docDrop`·`collectMult`·`train.speed`에 이미 곱해져 있다 */
  doctrines: string[];
  /** 열차 교리의 **스크랩 드랍 가치 배수** (기본 1). `dropValue`(맵 값)와 갈라 두는 이유는
   * 그쪽이 복원 때 맵에서 다시 유도되는 값이기 때문이다 — 곱해 두면 이어하기에 교리가 증발한다 */
  docDrop: number;
  /** **패시브 4종의 구매 레벨** (DESIGN §0.7 H2 · train.ts `Passive`). `artCdMult`·`collectMult`와
   * **같은 자리·같은 이유**다: 칸이 아니라 런 전체에 걸리는 배수의 집. 값이 아니라 **레벨**을 들고
   * 있고(값은 train.ts의 네 함수가 만든다) 정차 상점이 여기 한 곳만 올린다.
   * **`dmgOf`·`rateOf`에 이것을 안 넘기는 사격 경로는 §0.7 H2가 조용히 꺼진다** */
  pass: Passive;
  /** **치명타 난수 스트림** (§0.7 H2). 이 코드베이스에는 `Math.random`이 한 곳도 없다 —
   * probe·sweep 재현성이 그것에 걸려 있다(STATUS 함정). `Field.rnd`(스폰)와 **갈라 둔 이유**는
   * 한 스트림을 나눠 쓰면 「사격이 한 발 늘어난 것」이 스폰 순서를 통째로 밀어 A/B가 안 되기 때문이다 */
  rnd: ReturnType<typeof mulberry32>;
  /** 치명타로 나간 타격 수 · 그 초과분 피해 (probe 검산용). `critHits / hits`가 실측 치확이고
   * 명목(`critChance`)과 갈리면 어딘가가 이 문(`hit`)을 안 지나는 것이다 */
  hits: number;
  critHits: number;
  critBonus: number;
  /** **처치까지 맞은 발수**(§0.7 H1 판정 기준 「웨이브 40+에서 잡몹 2~5발」의 유일한 눈금).
   * 웨이브 인덱스별로 `{n, sum, one}` — `one`은 **한 방에 죽은 처치 수**이고 그것이 사용자 판정
   * ("한 방에 죽어 HP바가 의미가 없다")의 직접 반증 대상이다. 보스·중간보스는 안 센다(잡몹의 창이다).
   * ⚠ **화염 지대 같은 지속 판정(`tick`)은 발로 세지 않는다** — 60틱/s라 세면 「발수」가 「초」가 된다.
   *
   * **`nNc`/`oneNc`는 신설 불변식 6(§0.7-B 「평타 한 방 금지」)의 눈금이다.** 예외 무기 셋
   * (`ONE_SHOT_OK` — 레일건·저격포·함포)이 **분자와 분모 양쪽에서** 빠진다: 저 셋은 한 방이
   * 정체성이라 분자에서만 빼면 그 칸을 많이 산 편성에서 비율이 분모만 불어 조용히 통과한다.
   * 즉 `oneNc / nNc` = 「한 방이 금지된 무기들이 실제로 한 방에 죽인 비율」이고 판정선은 ≤ 10%다.
   *
   * **`nDs`/`oneDs`는 §0.7-H가 «다시 그은» 같은 눈금이다** (INBOX #76 ① · iter161 신설). `nNc`가
   * 「예외 무기 셋만 뺀 분모」라면 이쪽은 그 위에 **「직사 계열의 «단일 표적» 타격만」**을 더 건다 —
   * 광역(곡사 splash · 함포 hitSplash)·연쇄(테슬라)·지속(화염)이 **분모에서도** 빠진다.
   * 판정선은 그대로 ≤10%이고 **눈금만 `oneNc / nNc` → `oneDs / nDs`로 옮겨 갔다**(옛 칸은 회귀
   * 대조용으로 남긴다 — 두 수를 같은 자로 읽지 말 것).
   *
   * **`kind`는 그 분모의 «분해»다** (iter157 신설 · 큐 1). `nNc`는 예외 무기 셋을 통째로 빼므로
   * 「판정 밖으로 빠진 몫이 얼마나 되는가」가 안 보인다 — 이 칸은 **예외를 안 가르고** 무기칸별로
   * `{n, one}`(처치 수 / 비치명 한 방 처치 수)을 그대로 적는다. `Σ kind[k].n === n`이고
   * 예외 셋을 뺀 합이 `nNc`다 = 규약이 덮는 폭이 기계로 검산된다.
   * **`ds`/`dsOne`은 그 같은 줄의 «직사 단일 표적» 몫**이고 예외 셋을 뺀 `ds`의 합이 `nDs`다.
   * ⚠ **판정은 이 칸을 안 읽는다** — 불변식 6의 눈금은 여전히 `oneNc / nNc`다(규약 변경이 아니다).
   *
   * **`killR`는 그 같은 표본의 «자리»다** (iter160 신설 · 큐 1 — 감독 결정 요청 표 8 ⓔ의 근거).
   * 「적이 화면에 들기 «전에» 지워지는가」는 잡몹의 **처치 반경 분포**로만 갈리는데, 그 축이
   * 지금껏 **보스 54기**(`BossLog.killDistU`)로만 재져 있었다 — 화면을 채우는 것은 잡몹이다.
   * 규약은 `killDistU`와 **같은 식**이다: `hypot(e − 코어) / map.outerR` = **루프 반경 1**.
   * ⚠ **개체 장부를 만들지 않는다** — 풀런이 3만 처치라 sweep이 못 싣는다. 그래서 `{n, sum, hist}`
   * 누적 히스토그램이고, **칸 폭은 0.25**(제안된 0.5가 아니다): 판정선 `Rmax` 세로축 373px =
   * **1.99 루프반경**이 0.5칸의 «경계»에 정확히 얹혀 0.5 폭으로는 위아래가 안 갈린다.
   * `hist[i]`의 아래 경계는 `i × 0.25`이고 **마지막 칸(16)은 4.0 이상**이다(스폰 링이 3.575라 비어야 정상).
   * ⚠ **월드 좌표·각은 안 적는다**(iter155가 명시로 막은 자리 — 장부의 다른 칸도 전부 루프 반경 규약이다).
   *
   * **`killRByKind`는 그 반경의 «무기칸별 분해»다** (iter162 신설 · 큐 1 — 표 8 ⓔ의 손잡이).
   * `killR`는 「전선이 얼마나 멀리 있나」만 말하고 **「어느 칸이 그 전선을 만드나」**는 안 말한다.
   * 열쇠는 위 `kind`와 **같은 `e.hitKind`**라 `Σ killRByKind[k].n === killR.n`이 기계 검산이 된다.
   * ⚠ **히스토그램을 만들지 않는다** — 칸 12종 × 17빈 × 36웨이브면 sweep이 못 싣는다.
   * 순위를 가르는 데는 **평균 반경 하나면 충분하다**(`sum / n`).
   *
   * **`killRByEnemy`는 같은 반경의 «적종별» 분해다** (iter165 신설 · 큐 1 — 표 8 ⓔ).
   * `killRByKind`가 「어느 «무기»가 전선을 만드나」라면 이쪽은 「어느 «적»이 그 자리에서 죽나」다.
   * 웨이브 10의 계단(+0.68 U)이 **진영 교대**에서 나므로(iter164) 진영을 가르는 축은 적종이다.
   * 열쇠는 `e.kind`이고 표본은 위와 **똑같다** ⇒ `Σ killRByEnemy[k].n === killR.n`이 기계 검산이다.
   *
   * **`miss`는 그 표본 «밖»이다** (iter165 신설 · 큐 1 — 계단이 «전선»인지 «눈금»인지의 판정).
   * 위 블록이 `e.hits === 0`을 통째로 빼므로(사격에 안 맞고 죽은 개체 = 지대·산성·폭발 지물)
   * **남은 표본이 저절로 밖으로 치우칠 수 있다**. `miss`는 그 빠진 개체를 **같은 처치 지점에서
   * 같은 식**(`hypot / outerR`)으로 세는 별도 칸이다.
   * ⚠ **표본에 넣지 않는다** — 넣으면 iter160~164의 기준선이 통째로 갈린다. 나란히 읽는 칸이다.
   * ⚠ **자폭(박쥐)·설치 폭탄은 여기 안 든다** — 그 둘은 `hp <= 0` 사망 필터가 아니라
   * `boomed` 정리 경로로 빠진다(이 블록에 애초에 안 온다).
   */
  ttk: { n: number; sum: number; one: number; nNc: number; oneNc: number; nDs: number; oneDs: number; kind: Record<string, { n: number; one: number; ds: number; dsOne: number }>; killR: { n: number; sum: number; hist: number[] }; killRByKind: Record<string, { n: number; sum: number }>; killRByEnemy: Record<string, { n: number; sum: number; hits: number; life: number }>; miss: { n: number; sum: number } }[];
  /** 이펙트 (감독 #5 V2). 연출 전용 — 판정은 아무것도 여기서 읽지 않는다 */
  fx: FxSys;
  /** 총구 섬광 · 히트 마커 (§0.6 G · 둘 다 연출 전용). `marks`는 `FX_RULE.mark.max`에서 잘린다 */
  muzzles: Muzzle[];
  marks: Mark[];
  /** **데미지 숫자** (§0.7 H3 · 연출 전용). `DMG_NUM.max`에서 **오래된 것부터** 잘린다.
   * 아래 넷은 probe 검산용 눈금이다 — `dropped`가 크면 상한이 낮아 숫자가 «깜빡이는» 것이고,
   * `hist`는 색 구간 경계를 뽑은 실측 분포다(밑 √2 · `DMG_HIST_N`칸) */
  dmgNums: DmgNum[];
  dmgSpawned: number;
  dmgMerged: number;
  dmgDropped: number;
  dmgLiveMax: number;
  dmgHist: number[];
  dmgBand: number[];
  /** 티어별 발사 수 (probe 검산용 · [T1, T2, T3]). 「티어가 화면에서 갈리는가」를 컷 없이 재는 유일한 수치다 */
  tierShots: [number, number, number];
};

export function makeCombat(map: GameMap, seed = 7): Combat {
  return {
    pass: makePassive(),
    // 스폰 스트림(`seed * 31 + 5`)·카드 스트림(`seed * 613 + 17`)과 겹치지 않는 계수다
    rnd: mulberry32(seed * 149 + 11),
    hits: 0,
    critHits: 0,
    critBonus: 0,
    ttk: Array.from({ length: WAVES.length }, () => ({
      n: 0,
      sum: 0,
      one: 0,
      nNc: 0,
      oneNc: 0,
      nDs: 0,
      oneDs: 0,
      kind: {} as Record<string, { n: number; one: number; ds: number; dsOne: number }>,
      killR: { n: 0, sum: 0, hist: Array.from({ length: KILL_R_BINS }, () => 0) },
      killRByKind: {} as Record<string, { n: number; sum: number }>,
      killRByEnemy: {} as Record<string, { n: number; sum: number; hits: number; life: number }>,
      miss: { n: 0, sum: 0 },
    })),
    shots: [],
    shells: [],
    muzzles: [],
    marks: [],
    dmgNums: [],
    dmgSpawned: 0,
    dmgMerged: 0,
    dmgDropped: 0,
    dmgLiveMax: 0,
    dmgHist: Array.from({ length: DMG_HIST_N }, () => 0),
    dmgBand: [0, 0, 0, 0],
    tierShots: [0, 0, 0],
    strikes: [],
    fires: [],
    blasts: [],
    artCd: 0,
    artCdMult: 1,
    collectMult: 1,
    doctrines: [],
    docDrop: 1,
    artFired: 0,
    artDealt: 0,
    artHits: 0,
    drops: [],
    dropped: 0,
    dropAcc: 0,
    dropValue: dropValueOf(map.id),
    expired: 0,
    expiredN: 0,
    aim: null,
    shake: 0,
    arcImpacts: 0,
    arcMisses: 0,
    arcHits: 0,
    shieldBlocked: 0,
    shieldBreaks: 0,
    coverSkipped: 0,
    coverBlocked: 0,
    losBlocked: 0,
    losOverHills: 0,
    stealthPierced: 0,
    coneShots: 0,
    coneHits: 0,
    chainShots: 0,
    chainHits: 0,
    splashHits: 0,
    fireZones: 0,
    fireOnWater: 0,
    fireDmg: 0,
    rampShots: 0,
    rampSum: 0,
    breakerDmg: 0,
    breakerDemolished: 0,
    siegeDmg: 0,
    siegeDemolished: 0,
    siegeRams: 0,
    bossCoreHits: 0,
    coreDmgBoss: 0,
    coreDmgMob: 0,
    coreDamageByCause: {},
    bossFightBase: null,
    bossLog: [],
    coreHp: CORE.hp,
    coreImpact: { age: 1, serial: 0, heavy: false },
    kills: 0,
    killsByKind: {},
    splits: 0,
    pools: [],
    acidPools: 0,
    meltDmg: 0,
    meltDemolished: 0,
    spores: 0,
    smokes: [],
    smokeLaid: 0,
    smokeCleared: 0,
    smokeBlunted: 0,
    domeBlocked: 0,
    invulnBlocked: 0,
    warded: 0,
    deathRages: 0,
    carapaceDmg: 0,
    debris: 0,
    scrap: 0,
    collected: 0,
    terrainDirty: false,
    demolished: 0,
    shootTerrain: MAPS[map.id].shootTerrain,
    twoStage: twoStageOf(map.id),
    enemyBreaks: MAPS[map.id].enemyBreaks,
    terrainShots: 0,
    terrainShotDmg: 0,
    cracked: 0,
    fuelPending: [],
    fuelBlasts: 0,
    fuelDmg: 0,
    fuelHits: 0,
    fuelChain: 0,
    over: false,
    endT: 0,
    unit: map.outerR,
    loop: map.loop,
    dropPull: COLLECT.pull * map.outerR,
    fx: makeFx(),
  };
}

/** 선분 a→b가 원(c, r)과 만나는가 */
function segHitsCircle(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  return px * px + py * py < r * r;
}

/** 직사 사선 확보 여부 (§4.1: 언덕·성벽이 직사를 막는다. 웅덩이·호수는 사격에 무관).
 * 성벽은 pierceWalls장까지 뚫는다(레일건 1장, §6.1). 언덕은 뚫지 못한다 —
 * **관측칸이 인접한 직사 무기만 예외**다(§6.1, `overHills`). 성벽은 관측칸으로도 안 열린다.
 * 단 표적이 그 지형 안에 서 있으면 막지 않는다 — §4.1 "언덕 위 적은 직사에 노출(고지 리스크)" */
export function losOk(
  map: GameMap,
  ax: number, ay: number, bx: number, by: number,
  pierceWalls: number,
  overHills = false
): boolean {
  let walls = 0;
  for (const t of map.terrain) {
    if (!blocksLos(t)) continue;
    // **차단 반경은 `t.r`이 아니라 `losRadius(t)`다** (§0.7 J1). 1차 파괴한 지물은 상자가 줄어
    // 가장자리를 스치던 선이 지나간다 = 정본 문면의 「판정 반경 축소 + 관통 허용」
    const lr = losRadius(t);
    if (Math.hypot(bx - t.x, by - t.y) < lr) continue;
    if (!segHitsCircle(ax, ay, bx, by, t.x, t.y, lr)) continue;
    // **부술 수 없는 차단물**(언덕·건물·주유소)은 관통 계정에 안 든다 — 곡사만 넘어간다
    if (solidCover(t)) {
      if (overHills) continue;
      return false;
    }
    if (++walls > pierceWalls) return false;
  }
  return true;
}

/** 지형에 피해 (§4.1: 1차 파괴 대상은 성벽뿐). 파괴되면 잔해로 바뀌고 스크랩이 들어오며
 * 사선·진로가 함께 열린다. 파괴원은 조준 포격(아래 detonate)과 오우거(이후 큐).
 * 반환값 = 이번 호출로 파괴됐는가 */
export function damageTerrain(c: Combat, t: Terrain, dmg: number): boolean {
  if (t.destroyed || !Number.isFinite(t.hp)) return false;
  t.hp -= dmg;
  // **피격 피드백** (§0.6 F ⓑ). 지형을 때리는 넷(조준 포격·오우거·공성 종대·산성)이 전부 이 문을
  // 지나므로 반응도 여기 한 곳에만 둔다 — 부르는 쪽에 흩으면 새 파괴원마다 연출이 빠진다.
  // 파편은 **피해 눈금**이라(RENDER.terrain 주석) 매 프레임 dt로 들어오는 산성도 저절로 눌린다
  const F = RENDER.terrain;
  t.hitFx = F.hit;
  t.chip = (t.chip ?? 0) + dmg;
  while (t.chip >= F.chip) {
    t.chip -= F.chip;
    // 각은 «지금까지 받은 피해»에서 낸다 — 이 코드베이스에 Math.random은 한 곳도 없다(QA 재현성)
    const seed = (t.hp0 - t.hp) / F.chip;
    for (let i = 0; i < F.chipN; i++) {
      const a = ((i / F.chipN + seed * 0.37) % 1) * Math.PI * 2;
      spawnFx(c.fx, "spark", t.x + Math.cos(a) * t.r * 0.72, t.y + Math.sin(a) * t.r * 0.72, {
        vx: Math.cos(a) * F.chipSpd,
        vy: Math.sin(a) * F.chipSpd,
      });
    }
  }
  // **1차 파괴** (§0.7 J1 · 2단 파괴를 켠 맵에서만). HP가 `CRACK.at`(50%) 아래로 내려간 그 프레임에
  // 한 번만 선다. 여기가 자리인 이유는 2차 파괴와 같다 — **지형 피해의 유일한 문**이라(iter90 ⓑ)
  // 파괴원 넷(조준 포격·오우거·공성 종대·산성)과 새 파괴원(직사 탄)이 전부 이 한 줄을 지난다.
  // 사선 차단이 줄어드는 것은 `losRadius`가 `t.cracked`를 읽어 저절로 따라온다 —
  // **이동 차단은 안 바뀌므로 플로우필드를 다시 굽지 않는다**(적의 진로는 1차 파괴에 반응하지 않는다)
  if (c.twoStage && !t.cracked && t.hp > 0 && t.hp <= t.hp0 * CRACK.at) {
    t.cracked = true;
    t.fallFx = F.fall;
    spawnFx(c.fx, "smoke", t.x, t.y, { size: t.r * 1.1 });
    c.cracked++;
  }
  if (t.hp > 0) return false;
  t.hp = 0;
  t.destroyed = true;
  // **붕괴 연출** (§0.6 F ⓑ). 확산 링은 map.ts가 이 타이머로 그리고, 여기서는 먼지와 진동을 낸다.
  // 진동은 `Math.max`다 — 착탄이 이미 흔들고 있으면 그 위에 얹지 않고 더 센 쪽을 남긴다
  t.fallFx = F.fall;
  spawnFx(c.fx, "smoke", t.x, t.y, { size: t.r * 1.6 });
  c.shake = Math.max(c.shake, SHAKE_TTL);
  // 성벽은 §0.5 물량 배율 밖 → 드랍 배율도 밖. 골렘 잔해만 `scrap 0`이다(map.ts Terrain.scrap)
  dropScrap(c, t.x, t.y, t.scrap ?? TERRAIN.wallScrap, false);
  c.demolished++;
  c.terrainDirty = true;
  // **폭발 지물의 «2차 파괴 순간»** (§0.7 J1-c ⓐ). 여기서 바로 터뜨리지 않고 우편함에 적는다 —
  // 이 함수는 `map`도 `Field`도 안 받는데(파괴원 다섯의 공용 문이다) 폭발은 **적과 다른 지물**을
  // 봐야 한다. 같은 프레임에 `resolveFuelBlasts`가 비우므로 「부서진 프레임에 터진다」는 그대로다
  if (explosive(t.kind)) c.fuelPending.push(t);
  return true;
}

/** **폭발 지물이 터진다** (§0.7 J1-c · 감독 #66 ⑤ 「연료 탱크가 터지듯 큰 폭발과 함께 잔해가 된다」).
 * `damageTerrain`이 적어 둔 우편함을 **같은 프레임에** 비우고, 규약 셋을 한 자리에서 낸다:
 *  ⓐ 반경 `t.r × FUEL.blastR` 안의 **적에게 `FUEL.dmg`** + 폭발·연기·화면 흔들림
 *  ⓑ 같은 반경의 **다른 지물에 `FUEL.dmg × FUEL.terrainMult`** = 연쇄 철거
 *  ⓒ 터뜨리는 손은 조준 포격이다(호출자가 아니라 `FUEL.hp`가 그것을 정한다 · balance.ts 주석)
 *
 * ⚠ **큐를 «비우는» 반복문이어야 한다** — ⓑ가 또 다른 폭발 지물을 부수면 그 프레임에 그것도 터져야
 * 「연쇄」다. `destroyed` 플래그가 재진입을 막으므로 지물 수만큼에서 반드시 멈춘다.
 * ⚠ **사망 필터보다 «앞»에서 불러야 한다** — 안 그러면 폭발로 죽은 적이 그 프레임에 드랍·시체를
 * 못 남기고 다음 프레임으로 넘어간다(`breakWalls`와 같은 사정) */
function resolveFuelBlasts(c: Combat, map: GameMap, f: Field): void {
  while (c.fuelPending.length) {
    const t = c.fuelPending.shift()!;
    const r = t.r * FUEL.blastR;
    for (const e of f.list) {
      if (Math.hypot(e.x - t.x, e.y - t.y) > r) continue;
      // 지형이 낸 피해는 `hit()`을 안 지난다(조준 포격·곡사 착탄과 같은 사정) — 무적·숫자를 여기서 본다
      if (e.invuln) {
        c.invulnBlocked += Math.min(FUEL.dmg, e.hp);
        continue;
      }
      const dealt = Math.min(FUEL.dmg, e.hp);
      c.fuelDmg += dealt;
      e.hp -= FUEL.dmg;
      hurtFx(e);
      dmgNum(c, e, dealt, false);
      c.fuelHits++;
    }
    for (const q of map.terrain) {
      if (q === t || q.destroyed || !Number.isFinite(q.hp)) continue;
      // 지물끼리는 **겹침 판정**이다(적은 중심 거리) — 반경 33의 성벽이 폭발 원에 물리기만 하면
      // 연쇄가 서야 「탱크 옆에 있던 것이 같이 날아갔다」로 읽힌다
      if (Math.hypot(q.x - t.x, q.y - t.y) > r + q.r) continue;
      if (damageTerrain(c, q, FUEL.dmg * FUEL.terrainMult)) c.fuelChain++;
    }
    c.blasts.push({ x: t.x, y: t.y, t: 0, r });
    spawnFx(c.fx, "explode", t.x, t.y, { size: r * BLAST_FX });
    spawnFx(c.fx, "smoke", t.x, t.y, { size: r * 1.3 });
    c.shake = Math.max(c.shake, SHAKE_TTL * FUEL_SHAKE);
    c.fuelBlasts++;
    c.terrainDirty = true;
  }
}

/** **이 사선을 막고 있는 「부술 수 있는」 지물** (§0.7 J1 「지형이 내 공격을 먼저 맞는다」).
 * `losOk`가 「막혔나」만 돌려주는 것과 갈린다 — 도시 맵에서는 **어느 것이** 막았는지를 알아야
 * 그쪽으로 탄을 보낼 수 있다. 규칙 둘:
 *  ⓐ **가장 가까운 한 장**만 문다 — 뒤의 벽은 앞의 벽을 부순 뒤의 일이다
 *  ⓑ 그보다 앞에 **부술 수 없는** 차단물(언덕)이 서 있으면 **null**이다 — 언덕은 HP가 무한이라
 *     쏘면 그 칸이 런 내내 헛방을 친다. 그 경우는 지금까지대로 「표적 없음」이 맞다 */
function blockerOnPath(map: GameMap, ax: number, ay: number, bx: number, by: number): Terrain | null {
  let best: Terrain | null = null;
  let bd = Infinity;
  for (const t of map.terrain) {
    if (!blocksLos(t)) continue;
    const lr = losRadius(t);
    // 표적이 **그 지물 안에** 서 있으면 그것은 막은 것이 아니다 — `losOk`와 같은 예외라야
    // 「막혔다」의 정의가 두 벌이 되지 않는다(§4.1 "언덕 위 적은 직사에 노출")
    if (Math.hypot(bx - t.x, by - t.y) < lr) continue;
    if (!segHitsCircle(ax, ay, bx, by, t.x, t.y, lr)) continue;
    const d = Math.hypot(t.x - ax, t.y - ay);
    if (d >= bd) continue;
    bd = d;
    best = Number.isFinite(t.hp) && !t.destroyed ? t : null;
  }
  return best;
}

/** 스크랩을 필드에 떨군다 (§7.1: 처치·지형 파괴는 즉시 화폐가 아니라 **드랍**이다).
 * 유입원이 늘어도(엘리트·보스·다른 파괴 지형) 값만 바꿔 이 함수를 부르면 된다 */
function dropScrap(c: Combat, x: number, y: number, value: number, scaled = true): void {
  if (value <= 0) return;
  // §0.5 드랍 배율(×0.2)은 **물량 ×5를 같이 탄 드랍원에만** 곱한다(scaled). 성벽 파괴·보스는
  // 머릿수가 안 늘었으므로 곱하면 그만큼 총수입이 준다 — "런 총수입 ~690 유지"의 산술이다.
  // **누산기로 정수 단위만 떨군다** (§0.5 "최소 1, 확률 보정 허용"): 좀비 2 × 0.2 = 0.4를 그대로
  // 떨구면 드랍 **개수**가 ×5가 돼 화면이 적이 아니라 금색 스파클로 덮인다(iter18 실측 = 그때
  // 이미 드랍 65~81개 vs 적 10~14기였다). 난수 대신 누산기를 쓰는 이유는 두 가지다 — 기대값이
  // 근사가 아니라 **정확히** 보존되고, 새 난수 스트림이 없어 probe 실측이 그대로 재현된다
  // 열차 교리(§D1 ⓐ)의 드랍 배수는 **`scaled`와 무관하게** 전부에 걸린다 — 「보급」 축이라
  // 성벽·보스 드랍만 빼면 그 교리가 후반에 뜻을 잃는다(후반 수입의 큰 몫이 관문이다)
  const target = value * (scaled ? c.dropValue : 1) * c.docDrop;
  c.dropAcc += target;
  const n = Math.floor(c.dropAcc);
  if (n < 1) return;
  c.dropAcc -= n;
  // 총량 배수 (감독 #4 ②: §2 기대 수입은 실효 기준 → 회수 실패분만큼 드랍을 올린다)
  const v = n * COLLECT.dropMult;
  const p = c.dropPull > 0 ? pullToRail(c, x, y) : { x, y };
  c.drops.push({ x: p.x, y: p.y, value: v, t: 0 });
  c.dropped += v;
}

/** 드랍의 낙하 위치를 레일 쪽으로 `c.dropPull` 월드 거리만큼 당긴다 (§2 드랍 당김, 감독 #29 ①).
 * 레일 **너머로는 안 넘긴다** — 남는 거리가 0이면 레일 위에 놓인다. 당김이 유한하므로
 * 아주 먼 자리(사거리 2.0의 레일건 처치 등)의 드랍은 여전히 반경 밖에 남는다 */
function pullToRail(c: Combat, x: number, y: number): Vec {
  let bx = x;
  let by = y;
  let bd = Infinity;
  for (const p of c.loop) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) {
      bd = d;
      bx = p.x;
      by = p.y;
    }
  }
  if (bd <= c.dropPull || bd < 1e-6) return { x: bx, y: by };
  const k = c.dropPull / bd;
  return { x: x + (bx - x) * k, y: y + (by - y) * k };
}

/** 수집칸 흡수 (§7.1 "수집칸의 반경 안을 지날 때 흡수 → 배치 위치가 유의미").
 * 반경 안에 들어온 드랍만 끌어당긴다 — 밖으로 벗어나면 그 자리에 남아 다음 바퀴를 기다린다 */
function updateDrops(c: Combat, dt: number, train: Train): void {
  const r = COLLECT.radius * c.unit * c.collectMult;
  const cars: { x: number; y: number }[] = [];
  for (let i = 0; i < train.cars.length; i++) {
    if (train.cars[i].kind === "collector") cars.push(at(train.track, carS(train, i)));
  }
  for (const d of c.drops) {
    d.t += dt;
    let bx = 0;
    let by = 0;
    let bd = Infinity;
    for (const p of cars) {
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist < bd) {
        bd = dist;
        bx = p.x;
        by = p.y;
      }
    }
    if (bd > r) continue;
    if (bd <= COLLECT.pickup) {
      c.scrap += d.value;
      c.collected += d.value;
      d.value = 0;
      continue;
    }
    const k = Math.min(1, (COLLECT.pullSpeed * dt) / bd);
    d.x += (bx - d.x) * k;
    d.y += (by - d.y) * k;
  }
  // 수명 만료 (BALANCE §2 "필드 드랍 수명 25초", 감독 #12 ③). 회수된 드랍은 위에서 value를 0으로
  // 만들어 두므로 여기서 남는 것은 **못 주운 것**뿐이다 — 소멸분을 따로 적어 검산식을 닫는다
  for (const d of c.drops) {
    if (d.value > 0 && d.t >= COLLECT.lifeSec) {
      c.expired += d.value;
      c.expiredN++;
      d.value = 0;
    }
  }
  c.drops = c.drops.filter((d) => d.value > 0);
}

/** 적 히트 플래시 지속(초). 감독 #5 V2 "흰색 1프레임" — 60fps 1프레임(0.017)은 눈에 안 잡혀서
 * 세 프레임 남짓으로 잡았다. 스프라이트 실루엣을 흰색으로 가산 합성한다(sprites.drawFlash) */
export const HIT_FLASH = 0.06;

/** **산성 저하 배수** (§8.③ 산성 뱉기). 값의 유일한 출처는 종의 스탯이다 — 여기 상수를 새로 두면
 * 「수치는 BALANCE·ENEMY_STATS 한 곳」이라는 규약이 갈린다 */
const ACID = ENEMY_STATS.acid_spitter.spit!;

/** 자동 사격 피해의 **계열** (§6 계열표). 두 신규 문법이 이 한 인자를 함께 본다:
 *  · `carapace`(§8.② 철갑 딱정벌레) — `arc`·`direct`만 배수가 붙고 `flame`·`chain`은 1이다
 *  · `regen`(§8.② 트롤) — `flame`을 맞은 프레임에만 재생이 `blockSec`만큼 멈춘다
 * 조준 포격(detonate)은 이 함수를 아예 안 지나므로 두 문법의 **밖**이다 — 방패 오크와 같은 규약이다 */
type DmgClass = "direct" | "arc" | "flame" | "chain";

/** `tick` = **매 프레임 도는 지속 판정인가** (화염 지대만 true). 「발수」를 세는 문법(§8.⑦ 포자
 * 트렌트)이 이 인자 하나를 본다 — 화염 지대는 60틱/s라 발로 세면 «연사에 역효과»가 «불에 닿으면
 * 즉시 상한»이 된다. 피해·계열·공적은 이 인자와 무관하다(세는 방식만 갈린다) */
function hit(c: Combat, f: Field, car: Car, e: Enemy, dmg: number, cls: DmgClass = "direct", tick = false, solo = false): void {
  // **이미 죽은 개체는 때리지 않는다.** 사망 필터는 프레임 끝에 한 번 도므로, 같은 프레임 안에서는
  // hp가 음수인 시체가 아직 f.list에 남아 있다. 아래 `Math.min(dmg, e.hp)`는 «남은 HP까지만 공적으로
  // 친다»는 뜻인데, 그 시체를 때리면 **음수가 적립된다** — 큐 1의 소이탄 화염 지대(매 프레임 판정)가
  // 그것을 실제로 밟았다(60웨이브 풀런에서 `dealt` −74,916 · 실효/명목 −29%).
  // 판정에는 영향이 없고(이미 죽었다) 계측만 망가지는 종류의 결함이라 조용히 오래 살 수 있다
  if (e.hp <= 0) return;
  // **무적** (§0.7 K ① 등장 ~ ② 시전). 돔(`domed`)과 **같은 자리·같은 규약**이고 갈리는 것은
  // 계열 예외가 없다는 것뿐이다 — 곡사도 조준 포격도 못 뚫는다(정본이 「무적」이라고 못박았다).
  // 막힌 몫은 따로 적립한다(probe `necro.blocked` — 0이면 무적 국면이 안 도는 것이다)
  if (e.invuln) {
    c.invulnBlocked += Math.min(dmg, e.hp);
    return;
  }
  const st = ENEMY_STATS[e.kind];
  // **실드 돔** (§8.⑧ 실드 짐꾼 "돔 안 적은 직사 면역, 곡사는 관통"). 계열 배수보다 **앞**이다 —
  // 통째로 막히는 피해는 등껍질도 방벽도 지나갈 필요가 없다. 곡사만 뚫고, 조준 포격은 이 함수를
  // 아예 안 지나므로 그것도 뚫는다(방패 오크와 같은 규약: 카운터가 둘이라는 것이 이 적의 값이다)
  if (e.domed && cls !== "arc") {
    c.domeBlocked += Math.min(dmg, e.hp);
    return;
  }
  // **연막** (§8.⑧ 연막차 "구역 내 직사 명중률 급감"). **직사만** 눌린다 — 문면이 «직사 명중률»이라
  // 곡사·화염·연쇄는 그대로 지나간다. 여러 장이 겹쳐도 **가장 센 한 장만** 먹는다(0.35²가 되면
  // «연막차 두 대 = 직사 무효»가 되어 §8.0의 「방해」가 「면역」으로 번진다)
  if (cls === "direct" && c.smokes.length) {
    let m = 1;
    for (const z of c.smokes) {
      if (Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
      m = Math.min(m, z.dmg);
    }
    if (m < 1) {
      c.smokeBlunted += Math.min(dmg, e.hp) * (1 - m);
      dmg *= m;
    }
  }
  // **광역 방벽** (§8.⑧ 배너 로드). 깎아 준 몫은 그 깃발의 남은 총량(`aidPool`)에서 빠지고,
  // 다 쓰면 그 프레임부터 깃발이 꺼진다 — 상한이 있어야 `effHp`가 이 적을 유한하게 센다(§6).
  // 남은 몫보다 크게는 못 깎는다: 마지막 한 방을 «절반만» 깎아 주고 바닥나는 것이 정직한 소진이다
  const wb = e.wardBy;
  if (wb && wb.aidPool > 0) {
    const bn = ENEMY_STATS[wb.kind].banner!;
    const cut = Math.min(dmg * (1 - bn.ward), wb.aidPool);
    wb.aidPool -= cut;
    c.warded += cut;
    dmg -= cut;
  }
  // **등껍질 상성** (§8.② 철갑 딱정벌레). 계열 배수는 `car.dealt`(공적) **앞**에서 곱한다 —
  // 뒤에서 곱하면 명목만 적립돼 «곡사 칸이 실제로 얼마를 넣었나»가 장부에서 부풀어 보인다.
  // 튕겨 낸 몫은 따로 적립한다(probe `armor.bounced` — 0이면 이 상성이 안 도는 것이다)
  if (st.carapace && (cls === "arc" || cls === "direct")) {
    const m = cls === "arc" ? st.carapace.arc : st.carapace.direct;
    c.carapaceDmg += dmg * (1 - m);
    dmg *= m;
  }
  // **재생 차단** (§8.② 트롤 "화염 피해만 재생을 차단"). 맞은 프레임마다 다시 채우므로
  // 화염 지대·화염방사 아래에서는 재생이 영영 안 돈다 — 그것이 이 유형의 카운터다
  if (st.regen && cls === "flame") e.regenBlock = st.regen.blockSec;
  // **치명타** (§0.7 H2 — 신설 축). 자리가 `hit()`인 것은 여기가 **자동 사격 피해의 유일한 문**이라
  // 직사·곡사·화염·연쇄·광역이 한 번에 따라오기 때문이다. 표적마다 따로 굴리므로 광역 한 발이
  // 20기를 때리면 20번 굴린다 — 그래야 H3(데미지 숫자)이 표적별로 갈린 색을 낼 수 있다.
  // ⚠ **지속 판정(`tick` = 화염 지대)은 안 굴린다** — 60틱/s에 치명타가 붙으면 「가끔 크게」가
  // 「깜빡임」이 되고, 명목 DPS 산식(`1 + 치확 × (치피 − 1)`)의 단위인 «발»과도 어긋난다.
  // ⚠ **조준 포격(detonate)은 이 문을 아예 안 지나므로 치명타 밖이다** — 방패 오크·돔과 같은 규약이고,
  //   §0.7 H2의 문면도 「전 무기칸」이라 수동 개입 1종(§6.2)은 그 밖이다
  let crit = false;
  if (!tick) {
    e.hits++;
    c.hits++;
    // **불변식 6의 두 눈금**(§0.7-B) — 이 적을 마지막으로 때린 무기와 치명타 발수. 처치 프레임에서
    // 「비치명타 한 방」과 예외 무기 셋을 가르는 데만 쓴다(probe 전용 · 판정은 안 읽는다)
    e.hitKind = car.kind;
    // **§0.7-H가 다시 그은 분모의 눈금** (INBOX #76 ①). `solo`는 «이 발이 한 표적만 겨눴는가»이고
    // 계열은 여기서 본다 — 둘이 함께라야 「직사 계열의 단일 표적 타격」이 된다. 곡사 착탄·연쇄·
    // 화염 부채꼴은 `cls`에서 떨어지고, 함포의 착탄 광역·관통의 곁 표적은 `solo`에서 떨어진다
    e.hitDsg = cls === "direct" && solo;
    if (c.rnd() < critChance(c.pass)) {
      const bonus = dmg * (critMult(c.pass) - 1);
      c.critHits++;
      c.critBonus += bonus;
      dmg += bonus;
      crit = true;
      e.critHits++;
    }
  }
  // **실제로 들어간 몫**이다(넘치는 오버킬은 안 센다) — `car.dealt`(공적 장부)와 **같은 값**이라야
  // 화면의 숫자와 probe의 피해 합이 갈리지 않는다. §0.7 H3이 띄우라는 것도 이 값이다
  dmg *= c.damageScale?.(e, car.kind) ?? 1;
  const dealt = Math.min(dmg, e.hp);
  if (!tick && cls !== "arc" && dealt > 0) emitAction({ source: "train", kind: car.kind, action: "impact", x: e.x, y: e.y });
  car.dealt += dealt;
  e.hp -= dmg;
  c.onHit?.(e, car.kind, dealt);
  hurtFx(e);
  dmgNum(c, e, dealt, crit);
  // **착탄 단**(§0.6 G ⓐ). 스폰 수는 그대로이고 **크기만 표가 준다** — 0인 무기(함포·곡사)는
  // 폭발이 그 자리를 이미 들고 있어서 스파크를 겹치면 불덩이 위에 흰 점이 뜬다
  const im = wfx(car.kind).impact;
  if (im > 0) spawnFx(c.fx, "spark", e.x, e.y, { size: im * tfx(fxTier(car)).size });
  markHit(c, e, fxTier(car), tick);
  // **피격 시 포자 방출** (§8.⑦ 포자 트렌트 "연사 무기에 역효과, 저연사 고화력 요구").
  // 전 적 중 유일하게 **피해량이 아니라 발수**를 센다 — 그래서 이 블록은 dmg를 안 본다.
  // 죽은 발에는 안 낳는다: 마지막 한 발이 새끼를 더 뽑으면 «저연사 고화력»의 보상이 사라진다
  const sp = st.spore;
  if (sp && !tick) {
    // `e.hits`는 위 치명타 블록이 이미 올렸다 (§0.7 H1이 처치 발수를 세면서 전 종 공통이 됐다)
    if (e.hp > 0 && e.spores < sp.cap && e.hits % sp.perHits === 0) {
      const a = ((e.spores * 0.618) % 1) * Math.PI * 2;
      const off = ENEMY.radius * 2;
      spawnEnemy(f, sp.into, e.x + Math.cos(a) * off, e.y + Math.sin(a) * off, e.faceX, e.faceY);
      e.spores++;
      c.spores++;
      markEnemyAction(e, f.t, "summon");
    }
  }
}

/** 피격 표시 (감독 #5 V2 플래시 + V3 HP바). **모든 피해원이 이 함수를 경유해야** "맞았는데 바가
 * 안 뜨는 적"이 안 생긴다 — 조준 포격(detonate)은 hit()을 안 타므로 따로 부른다 */
function hurtFx(e: Enemy): void {
  e.flash = HIT_FLASH;
  e.hurt = RENDER.hurtShow;
}

/** 전면 직사 무효 (§8.② 방패 오크 "전면 직사 차단, 곡사에 무방비").
 * (px, py)에서 온 직사가 적의 정면 반각 안이면 막힌다. 판정에 쓰는 정면은 진행 방향(e.faceX/faceY)이라,
 * 열차가 루프를 돌아 **측·후면으로 돌아가면 그대로 뚫린다** — 그것이 이 적의 카운터다.
 * 곡사(arc)와 조준 포격은 이 함수를 부르지 않는다 = 방패가 안 통한다 */
function shielded(e: Enemy, px: number, py: number): boolean {
  const deg = ENEMY_STATS[e.kind].frontShield;
  if (deg === undefined) return false;
  // **실드는 유한하다** (§0.6 C3 ⓑ) — 총량이 0이면 이 각도는 더 이상 아무것도 안 막는다.
  // 회복이 없으므로 한 번 깨진 개체는 남은 생애 동안 평범한 잡몹이다
  if (e.shield <= 0) return false;
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return (dx / d) * e.faceX + (dy / d) * e.faceY >= Math.cos((deg * Math.PI) / 180);
}

/** **전열 차단** (§0.6 C3 "실드 유닛은 부대의 전열이다 — 앞 열에 서서 뒤의 병종을 가린다").
 * (px, py) → e의 **직사** 사선 위에 실드가 남은 방패병이 **사이에** 서 있으면 e는 안 맞는다.
 * §0.6 C3의 세 조항이 그대로 세 줄이다:
 *   ⓐ 방패병이 그 방향을 **정면으로** 막고 있어야 한다(`shielded`) — 열차가 측면으로 돌면 전열도 열린다
 *   ⓑ 실드가 남아 있어야 한다 — `f.guards`가 `shield > 0`만 들므로 깨지면 그 열이 열린다
 *   ⓒ 담당이 죽으면 목록에서 빠진다 — 뒤가 노출된다
 * **부대는 안 본다**: 방패는 「자기 부대원」이 아니라 「자기 뒤에 선 것」을 가린다 — §0.6 C2의
 * 「궁병 열 = 방진 뒤 정렬, 전열을 깨야 사거리가 닿는다」가 **두 부대에 걸쳐** 성립해야 한다.
 * **직사에만 부른다** — 곡사·조준 포격·테슬라는 이 함수를 아예 안 지난다(BALANCE §0.6 「직사 계열만」) */
function covered(f: Field, e: Enemy, px: number, py: number): boolean {
  if (!f.guards.length || e.shield > 0) return false; // 방패병 자신은 남의 뒤에 숨지 않는다
  // **공중은 전열 위로 지나간다** (§8.⑤ "하늘 — 지형·열차 무시"). 방패는 땅에 선 줄이라 나는 것을
  // 못 가린다 — 이 한 줄이 없으면 방패 오크가 대공 플랙의 사선을 막는다(지상 무기는 애초에 공중을
  // 표적으로 못 잡으므로 `targetable`이 막고, 여기서 갈리는 것은 **대공 한 종**이다)
  if (ENEMY_STATS[e.kind].air) return false;
  const dx = e.x - px;
  const dy = e.y - py;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  for (const g of f.guards) {
    // 전열은 «줄»이지 «벽»이 아니다 — 방패병은 자기 뒤 `reach`까지만 가린다.
    // 축 투영보다 **먼저** 거른다: 대부분의 방패병은 표적과 아무 상관이 없다(비용이 여기서 결정된다)
    if (Math.abs(g.x - e.x) > SHIELD.reach || Math.abs(g.y - e.y) > SHIELD.reach) continue;
    const t = (g.x - px) * ux + (g.y - py) * uy;
    if (t <= 0 || t >= d) continue;                                            // 쏘는 쪽과 표적 «사이»인가
    if (Math.abs(-(g.x - px) * uy + (g.y - py) * ux) > SHIELD.cover) continue;  // 사선에서 벗어난 폭
    if (!shielded(g, px, py)) continue;                                        // 그 방패가 이쪽을 보고 있는가
    return true;
  }
  return false;
}

/** **직사 한 발이 실드를 먼저 지난다** (§0.6 C3 ⓑ "피해 누적으로 깨지고 깨지면 그 열이 열린다").
 * 반환값 = HP까지 간 몫. **넘치는 몫은 통과시킨다** — 막는 것이 «한 발»이 아니라 «총량»이어야
 * 유한하다(레일건 한 발이 실드를 깨고 남은 힘으로 때리는 것이 「누적으로 깨진다」의 뒷면이다) */
function soakShield(c: Combat, e: Enemy, dmg: number, px: number, py: number): number {
  if (!shielded(e, px, py)) return dmg;
  const cut = Math.min(dmg, e.shield);
  e.shield -= cut;
  c.shieldBlocked += cut;
  // 실드에 막힌 발도 **맞은 것으로 보여야 한다** — 안 그러면 「쏘는데 아무 일도 안 일어난다」가 된다.
  // HP바는 안 움직이고 정면 호만 얇아진다 = 「지금 깎이는 것은 HP가 아니라 실드다」가 그 차이로 읽힌다
  hurtFx(e);
  spawnFx(c.fx, "spark", e.x, e.y);
  if (e.shield <= 0) {
    e.shieldT = SHIELD.breakFx;
    c.shieldBreaks++;
  }
  return dmg - cut;
}

/** **직사 피해 한 발** — §0.6 C3의 두 겹(전열 차단 → 실드 흡수)을 지나 `hit()`으로 간다.
 * 직사 경로만 이것을 부른다: 곡사·화염·연쇄는 `hit()`을 그대로 부르고 조준 포격은 `hit()`조차 안 지난다.
 * 반환값 = **HP까지 실제로 닿았는가** — 광역 명중 수(`splashHits`)가 막힌 발까지 세면 실효 지표가 부푼다 */
function hitDirect(c: Combat, f: Field, car: Car, e: Enemy, dmg: number, px: number, py: number, solo = false): boolean {
  if (covered(f, e, px, py)) {
    c.coverBlocked += Math.min(dmg, e.hp);
    return false;
  }
  const rest = soakShield(c, e, dmg, px, py);
  if (rest <= 0) return false;
  hit(c, f, car, e, rest, "direct", false, solo);
  return true;
}

/** **타겟팅 우선순위** (DESIGN §6 "①코어에 붙어 타격 중인 적(원거리 산병 제외) → ②사거리 내 최근접",
 * 감독 #18 ②로 ⓑ 확정). 1순위는 **코어에 붙은 적(atCore)과 점타를 든 보스(coreHit)뿐이다** —
 * 최근접만 보면 레일에 막 닿은 잡몹이 언제나 먼저 뽑혀서 코어를 실제로 깎는 적이 방치된다
 * (iter26 실측: 혼합 12칸의 보스 실효 피해가 명목 DPS의 12%였던 원인의 절반이 이것이다).
 * **산병(firing)은 넣지 않는다** — 박격포반은 2.3R(517월드)에 서므로 1순위에 넣으면 코어로
 * 달려오는 러너보다 먼 적이 먼저 뽑힌다. 산병의 코어 피해는 1/s, 붙은 러너는 2/s다
 * (iter28 A/B 실측: 산병 포함 시 자동 소비 런 seed 11이 239.1 → 190.1초, -49초). */
function hittingCore(e: Enemy): boolean {
  return e.atCore || (e.firing && !!ENEMY_STATS[e.kind].coreHit);
}

/** **대공 전용 필터** (§6.1 대공 플랙 "공중 적 전용"). 무기가 airOnly면 공중 적만, 아니면 지상 적만
 * 표적으로 잡는다 — 지상 무기가 공중을 못 때리는 쪽도 같은 한 줄로 성립한다.
 * 공중 적(ENEMY_STATS.air)은 큐 4 ⓑ까지 하나도 없으므로 **지금 대공 플랙의 후보는 언제나 0**이다 */
function targetable(w: { airOnly?: boolean }, e: Enemy): boolean {
  return !!w.airOnly === (ENEMY_STATS[e.kind]?.air === true);
}

/** **레이저 지속 조사** 상태 (§6.1 "지속 조사 시 피해 증폭"). 칸 → {표적, 조사 시간}.
 * Car에 필드를 더하지 않고 여기 두는 이유: ① 저장(save.ts)·재배치가 만지는 상태가 아니고
 * ② combat이 enemy를 아는 유일한 곳이라 Car → Enemy 참조를 만들면 train.ts가 enemy를 import하게 된다.
 * WeakMap이라 팔린 칸은 저절로 사라진다 */
const focus = new WeakMap<Car, { at: Enemy; t: number }>();

/** 이번 발사의 피해 배수 = 같은 표적을 계속 조사한 시간 / rampSec (상한 ramp).
 * **표적이 바뀌면 0부터 다시 쌓는다** — 그것이 이 프리미엄의 대가다(물량전에서는 표적이 계속 죽는다) */
function rampMult(c: Combat, car: Car, w: { ramp?: number; rampSec?: number }, e: Enemy, rate: number): number {
  // `ramp <= 1`은 증폭이 없다는 뜻이다 (레이저 T3 「확산」 분기가 ramp 1로 덮는다) — 여기서 걸러야
  // `rampAvg`(probe)가 증폭 없는 사격까지 표본에 넣어 평균을 1쪽으로 끌지 않는다
  if (!w.ramp || w.ramp <= 1 || !w.rampSec) return 1;
  const f = focus.get(car);
  const t = f && f.at === e ? f.t + 1 / Math.max(rate, 0.001) : 0;
  focus.set(car, { at: e, t });
  const m = 1 + (w.ramp - 1) * Math.min(1, t / w.rampSec);
  c.rampShots++;
  c.rampSum += m;
  return m;
}

/** 후보 비교: 우선순위가 같으면 가까운 쪽. 네 계열(직사·곡사·화염·테슬라)이 같은 규칙을 쓴다 */
function better(c: Combat, e: Enemy, d: number, best: Enemy | null, bd: number): boolean {
  if (!best) return true;
  if (c.priorityTarget && c.priorityTarget.hp > 0 && (e === c.priorityTarget || best === c.priorityTarget)) return e === c.priorityTarget;
  const a = hittingCore(e);
  if (a !== hittingCore(best)) return a;
  return d < bd;
}

/** 총구 화염 (감독 #5 V2 → §0.6 G에서 **무기·티어별**로 갈렸다). 칸 중심이 아니라 **표적 방향으로
 * 밀어낸 포신 끝**(`muzzle.out`)에서 시작한다 — 칸 한가운데서 터지면 어느 칸이 어디를 쏘는지가
 * 안 읽힌다. 0.34(칸 길이의 1/3)로 잡았더니 **칸 실루엣 위에 겹쳐** 가산 합성이 칸을 허옇게 만들
 * 뿐이었다(첫 컷 실측) — 칸 반 길이(0.5)를 넘겨야 읽힌다.
 *
 * **모양은 «뻗는다»이지 «터진다»가 아니다 (iter93 목업 대조).** 프레임 `muzzle_1..3`은 방사 대칭
 * 별폭발이라 그대로 띄우면 무기·티어와 무관하게 «둥근 덩어리»가 된다. 셋을 함께 옮겨야 방향이 난다:
 *  ⓐ 축 직교 폭을 좁힌다(`xs` = `FX_RULE.muzzle.narrow`) ⓑ **뿌리를 포신 끝에 걸고** 중심을 길이의
 *  `root`만큼 앞으로 민다 ⓒ 티어 섬광(`c.muzzles`)은 **중심이 아니라 뿌리**에 얹는다 — 목업의
 *  흰 코어가 배럴 끝에 붙어 있고 뾰족한 끝으로 갈수록 주황이다.
 * 티어는 스프라이트를 갈아 끼우지 않는다 — 시트에 muzzle 프레임이 한 벌뿐이고, 색만 다른 셀을
 * 굽는 것은 §0.6 G가 요구한 것이 아니다 */
const firingPose = new WeakMap<Car, { angle: number; remaining: number }>();

/** Record the selected shot, after targeting. Never query enemies a second time for art. */
function aimFired(car: Car, angle: number): void {
  car.turretAng = angle;
  firingPose.set(car, { angle, remaining: Math.max(0.22, Math.min(1.5, car.cd || 0.6)) });
}

function muzzleFx(c: Combat, car: Car, px: number, py: number, tx: number, ty: number): void {
  const fx = wfx(car.kind);
  const tf = tfx(fxTier(car));
  const a = Math.atan2(ty - py, tx - px);
  aimFired(car, a);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // 뿌리 = 포신 끝. 화염·섬광·포연 셋이 전부 이 점을 기준으로 선다
  const bx = px + ca * LAYOUT.carLen * fx.muzzle.out;
  const by = py + sa * LAYOUT.carLen * fx.muzzle.out;
  if (fx.muzzle.size > 0) {
    const len = fx.muzzle.size * tf.size;
    spawnFx(c.fx, "muzzle", bx + ca * len * FX_RULE.muzzle.root, by + sa * len * FX_RULE.muzzle.root,
      { size: len, rot: a + Math.PI / 2, xs: FX_RULE.muzzle.narrow });
  }
  // 포연 (§0.6 G ⓐ 함포 「포구 화염 + 포연」). 총구 **뒤쪽**에 남아 열차가 지나가며 꼬리를 만든다.
  // 스폰 자리를 화염 뒤로 미는 것이 핵심이다 — 같은 점에 뱉으면 화염이 연기를 통째로 덮는다
  if (fx.muzzle.smoke > 0) {
    const back = fx.muzzle.size * FX_RULE.smokeBack;
    spawnFx(c.fx, "smoke", bx - ca * back, by - sa * back,
      { size: fx.muzzle.smoke, vx: -ca * FX_RULE.smokeDrift, vy: -sa * FX_RULE.smokeDrift });
  }
  if (fx.muzzle.flash > 0) c.muzzles.push({ x: bx, y: by, a, t: 0, kind: car.kind, tier: fxTier(car) });
  // 약협·스파크 (§0.7 L ⓑ 「부가 파티클」). **총구 섬광이 있는 무기만** 뱉는다 — 화염방사는
  // `flash 0`이고(부채꼴 자체가 총구다) 10/s로 도는 지속 무기라, 여기서 거르지 않으면 한 칸이
  // 초당 20장을 뱉어 부채꼴 뿌리가 흰 덩어리가 된다(iter91 「상한 없는 목록」 함정과 같은 자리).
  // 방향은 **뒤·옆**이고 좌우가 번갈아 난다 — 난수 없이 `i`만으로 편다
  for (let i = 0; i < lfx(fxTier(car)).casing && fx.muzzle.flash > 0; i++) {
    const g = Math.PI * (FX_RULE.casing.spread + FX_RULE.casing.step * i) * (i % 2 ? -1 : 1);
    spawnFx(c.fx, "casing", bx, by, {
      size: FX_RULE.casing.size * tf.size,
      vx: Math.cos(a + g) * FX_RULE.casing.speed,
      vy: Math.sin(a + g) * FX_RULE.casing.speed,
    });
  }
  c.tierShots[Math.max(0, Math.min(2, (car.tier | 0) - 1))]++;
}

/** 히트 마커 한 장 (§0.6 G ⓒ). `tick`(화염 지대처럼 매 프레임 도는 지속 판정)에는 안 남긴다 —
 * 60틱/s로 찍으면 마커가 아니라 «불타는 개체 위의 흰 덩어리»가 된다(§0.6 F의 「피해 눈금」과 같은 이유).
 * 상한에서는 **가장 오래된 것부터** 버린다(`Field.graves`와 같은 규약) */
function markHit(c: Combat, e: Enemy, tier: number, tick: boolean): void {
  if (tick) return;
  if (c.marks.length >= FX_RULE.mark.max) c.marks.shift();
  c.marks.push({ x: e.x, y: e.y, t: 0, tier });
}

/** **데미지 숫자 한 장** (§0.7 H3). 피해가 확정된 자리에서만 불린다 — `hit()`의 `dealt` 산출 직후와
 * `detonate()` 두 곳이고, 그 둘이 「적이 피해를 받는 유일한 두 문」이다.
 *
 * 과밀 방지 셋이 여기 다 있다 (§0.7 H3 ⓐⓑⓒ):
 *  ⓐ **합산** — 같은 표적의 연속 타격은 `DMG_NUM.mergeSec` 창 안에서 한 숫자로 붙는다. 화염 지대
 *    (60틱/s)·화염방사가 이 창으로 «초당 5장»이 되므로 `markHit`처럼 `tick`을 거를 필요가 없다 —
 *    거르면 「지속 피해가 들어가고 있다」가 화면에서 통째로 사라진다(그쪽은 눈금이 아니라 값이다).
 *  ⓑ **상한** — `DMG_NUM.max`에서 **가장 오래된 것부터** 버린다(= 가장 많이 바랜 것부터).
 *  ⓒ 위 둘의 검산이 probe `combat.dmgNum`이고 판정선은 60fps다(`npm run perf`).
 * ⚠ 목록은 상한에서 잘리므로 아래 선형 탐색은 `DMG_NUM.max`칸을 넘지 않는다 */
function dmgNum(c: Combat, e: Enemy, amt: number, crit: boolean): void {
  if (amt <= 0) return;
  for (let i = c.dmgNums.length - 1; i >= 0; i--) {
    const d = c.dmgNums[i];
    if (d.src !== e) continue;
    // 그 표적의 **가장 최근** 숫자만 본다 — 창을 벗어났으면 합치지 않고 새로 띄운다
    if (d.t < DMG_NUM.mergeSec) {
      d.amt += amt;
      d.crit ||= crit;
      c.dmgMerged++;
      return;
    }
    break;
  }
  if (c.dmgNums.length >= DMG_NUM.max) {
    c.dmgDropped++;
    recordDmgNum(c, c.dmgNums.shift()!.amt);
  }
  // **겹침 밀어내기** (§0.7 H3 ⓐ 「과밀 방지」의 세 번째 손잡이 — 합산·상한이 못 막는 몫이다).
  // 합산은 «같은 표적»만 묶으므로 **밀집 대형에서 이웃끼리 겹치는 것**은 그대로 남는다: 첫 컷에서
  // 41·41·78 세 장이 한 덩어리로 뭉쳐 「441 / 4178」로 읽혔다(iter102 `shots/h3-verify.png` 1판).
  // 이미 떠 있는 숫자의 **지금 그려지는 y**(= 떠오른 뒤의 자리)와 견줘 겹치면 한 칸씩 위로 올린다.
  // **난수를 안 쓴다** — 이 코드베이스에 `Math.random`은 한 곳도 없다(STATUS 함정). 사다리는 결정적이다
  const x = e.x;
  let y = e.y - ENEMY.size * 0.35;
  // 8칸까지 올린다 — 4칸은 밀집 대형에서 모자랐다(iter102 실측: 웨이브 49의 한 자리에 10장이
  // 몰려 사다리가 소진되고 두 장이 1px 간격으로 붙었다). 여기서 포기하면 그때는 상한의 몫이다
  for (let tries = 0; tries < 8; tries++) {
    let clash = false;
    for (const d of c.dmgNums) {
      const dy = d.y - DMG_NUM.rise * (d.t / DMG_NUM.sec);
      // x 문턱 2.4 = **세 자리 두 개의 반폭 합**이다. 1.8로 뒀더니 나란히 선 「32」와 「12」가
      // 붙어 «3212»로 읽혔다(iter102 컷 2판) — 사다리는 세로로만 미므로 가로 문턱이 좁으면
      // 「밀어낼 필요 없음」으로 잘못 판정한다
      if (Math.abs(d.x - x) < DMG_NUM.size * 2.4 && Math.abs(dy - y) < DMG_NUM.size * 1.15) {
        clash = true;
        break;
      }
    }
    if (!clash) break;
    y -= DMG_NUM.size * 1.2;
  }
  c.dmgNums.push({ x, y, t: 0, amt, crit, src: e });
  c.dmgSpawned++;
}

/** 사라지는 숫자의 **최종(합산 후) 값**을 분포에 적립한다. 밑 √2의 로그 히스토그램이라
 * 32칸이 1~65,536을 덮는다 — §0.7 H3의 「구간 경계는 루프가 실측 분포로 제안한다」가 재는 곳이다.
 * 스폰 시점이 아니라 **퇴장 시점**에 세는 이유: 화면에 실제로 남은 값은 합산이 끝난 뒤의 값이다 */
function recordDmgNum(c: Combat, amt: number): void {
  const b = Math.floor(Math.log2(Math.max(amt, 1)) * 2);
  c.dmgHist[Math.max(0, Math.min(DMG_HIST_N - 1, b))]++;
  c.dmgBand[bandOf(amt)]++;
}

/** 값 → 색 구간 인덱스 (§0.7 H3 「낮음(백) → 중간(청) → 높음(금) → 최고(주황)」).
 * **그리는 쪽과 세는 쪽이 같은 함수를 쓴다** — 갈라 두면 probe의 `bandPct`가 화면과 다른 것을 센다 */
function bandOf(amt: number): number {
  let i = 0;
  while (i < DMG_NUM.band.length - 1 && amt >= DMG_NUM.band[i + 1]) i++;
  return i;
}

/** 곡사 1회 사격 (§6 계열표: 사선 = 지형 무시). 사선 판정도 방패 판정도 하지 않고,
 * 대신 **발사 시점의 표적 위치**로 포탄을 날린다 — 이동 표적을 놓치는 것이 곡사의 대가다.
 * 자동 사격의 지형 피해는 없다 (§6.1 "지형 철거는 조준 포격의 몫") */
function fireArc(c: Combat, car: Car, px: number, py: number, f: Field, am: number): boolean {
  const kind = car.kind;
  const w = weaponOf(car)!;
  const range = w.range * c.unit;
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of f.list) {
    const d = Math.hypot(e.x - px, e.y - py);
    if (d > range || !better(c, e, d, best, bd)) continue;
    if (!targetable(w, e) || e.hidden) continue;
    best = e;
    bd = d;
  }
  if (!best) return false;
  const dur = bd / ARC.shellSpeed;
  const n = w.salvo ?? 1;
  // **산성 저하는 포탄에 실어 보낸다** (§8.③): 피해는 착탄 시점에 `dmgOf(sh.car)`로 다시 계산되므로
  // 여기서 곱해 두지 않으면 «눌린 총구가 쏜 포탄»이 날아가는 동안 저하가 조용히 풀린다.
  // 태울 칸은 `frac`(살보 분배 몫)이 이미 하는 일과 같은 «이 발의 비중»이라 한 칸을 같이 쓴다
  if (n === 1) {
    c.shells.push({ x0: px, y0: py, x: best.x, y: best.y, t: 0, dur, car, kind, frac: am, target: w.homing ? best : undefined, tx: px, ty: py });
  } else {
    // 분산 제압 (MLRS §6.1 "광역 도배 — 지정 구역 포화"). 표적을 중심으로 `spread` 안에 n발을 뿌린다.
    // 좌표는 **난수가 아니라 발사 순번의 고정 나선**이다 — f.rnd()를 쓰면 스폰 난수 스트림이 밀려
    // 지금까지의 seed 실측이 전부 무효가 된다(enemy.ts bobPhase와 같은 함정).
    // car.fired를 위상에 넣어 매 발사마다 무늬가 돌아간다
    const sp = (w.spread ?? 0) * c.unit;
    for (let k = 0; k < n; k++) {
      const a = ((k + car.fired * 0.37) / n) * Math.PI * 2;
      const rr = sp * Math.sqrt((k + 0.5) / n);
      c.shells.push({
        x0: px, y0: py, x: best.x + Math.cos(a) * rr, y: best.y + Math.sin(a) * rr,
        t: 0, dur, car, kind, frac: am / n, tx: px, ty: py,
      });
    }
  }
  muzzleFx(c, car, px, py, best.x, best.y);
  car.fired++;
  return true;
}

/** 화염방사 1회 분사 (§6.1 "근거리 부채꼴, 접근 저지" / §4 "1 × 다중히트, 사거리가 페널티").
 * 축은 **사거리 안 최근접 적** 방향이고, 그 축의 반각(WEAPONS.cone) 안에 든 적을 **전부** 때린다 —
 * 그래서 밀집할수록 실효 DPS가 오른다(§4 "실효 15"의 정체). 사선 판정은 직사와 같게 한다:
 * 화염은 성벽을 타넘지 않는다(그건 테슬라의 프리미엄이다) */
function fireCone(c: Combat, car: Car, px: number, py: number, f: Field, map: GameMap, am: number): boolean {
  const w = weaponOf(car)!;
  const range = w.range * c.unit;
  const dmg = dmgOf(car, c.pass) * am;

  // 축 = 최근접 표적. 방패·사선으로 못 때리는 적을 축으로 잡으면 부채꼴이 헛돈다
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of f.list) {
    const d = Math.hypot(e.x - px, e.y - py);
    if (d > range || !better(c, e, d, best, bd)) continue;
    if (!targetable(w, e) || e.hidden || e.domed) continue;
    if (shielded(e, px, py)) continue;
    if (!losOk(map, px, py, e.x, e.y, w.pierceWalls)) continue;
    best = e;
    bd = d;
  }
  if (!best) return false;

  const ang = Math.atan2(best.y - py, best.x - px);
  aimFired(car, ang);
  const half = Math.cos((w.cone! * Math.PI) / 180);
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  let n = 0;
  for (const e of f.list) {
    const dx = e.x - px;
    const dy = e.y - py;
    const d = Math.hypot(dx, dy) || 1;
    if (d > range) continue;
    if ((dx / d) * ax + (dy / d) * ay < half) continue; // 부채꼴 밖
    if (shielded(e, px, py)) continue;
    if (!losOk(map, px, py, e.x, e.y, w.pierceWalls)) continue;
    hit(c, f, car, e, dmg, "flame");
    n++;
  }
  c.coneShots++;
  c.coneHits += n;
  // 궤적은 축의 끝점으로 남긴다 — drawCombat이 이 선분에서 각도와 사거리를 되읽어 부채꼴을 그린다
  c.shots.push({ x0: px, y0: py, x1: px + ax * range, y1: py + ay * range, kind: car.kind, t: 0, tier: fxTier(car) });
  spawnFx(c.fx, "flame", px + ax * range * 0.55, py + ay * range * 0.55, {
    rot: ang + Math.PI / 2,
    size: range * 0.9,
  });
  car.fired++;
  return true;
}

/** 테슬라 1회 방전 (§6.1 "근거리 체인 감전 — 전호가 지형을 타넘음" / §4 "4 (체인 3)").
 * 사선을 아예 보지 않으므로(ignoreLos) 방패 오크의 전면 직사 무효도 통하지 않는다 — 곡사와 같은 규칙이다.
 * 체인은 **직전 표적에서 chainJump 안**의 아직 안 맞은 적으로 뛴다: 흩어진 적에게는 1기밖에 못 맞히고
 * 밀집한 무리에서만 3기를 채운다(§4 "실효 12"의 조건) */
function fireChain(c: Combat, car: Car, px: number, py: number, f: Field, am: number): boolean {
  const w = weaponOf(car)!;
  const range = w.range * c.unit;
  const jump = (w.chainJump ?? 0) * c.unit;
  const dmg = dmgOf(car, c.pass) * am;

  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of f.list) {
    const d = Math.hypot(e.x - px, e.y - py);
    if (d > range || !better(c, e, d, best, bd)) continue;
    if (e.hidden || e.domed) continue;
    best = e;
    bd = d;
  }
  if (!best) return false;

  const chain: Enemy[] = [best];
  while (chain.length < (w.chain ?? 1)) {
    const from = chain[chain.length - 1];
    let next: Enemy | null = null;
    let nd = Infinity;
    for (const e of f.list) {
      if (chain.includes(e)) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d > jump || d >= nd) continue;
      next = e;
      nd = d;
    }
    if (!next) break;
    chain.push(next);
  }

  let sx = px;
  let sy = py;
  for (const e of chain) {
    hit(c, f, car, e, dmg, "chain");
    spawnFx(c.fx, "arc", e.x, e.y);
    c.shots.push({ x0: sx, y0: sy, x1: e.x, y1: e.y, kind: car.kind, t: 0, tier: fxTier(car) });
    sx = e.x;
    sy = e.y;
  }
  c.chainShots++;
  c.chainHits += chain.length;
  muzzleFx(c, car, px, py, best.x, best.y);
  car.fired++;
  return true;
}

/** 성벽 파괴 직진 (§8 오우거 "성벽·잔해를 부수며 직진 — 적이 새 길을 개척함").
 * 이동(플로우필드 무시 · 코어 직진)은 enemy.ts가 하고, **피해는 여기서** 준다 — damageTerrain이
 * 스크랩 드랍·플로우필드 재계산 플래그까지 한 곳에서 처리하기 때문이다.
 * 판정은 "적 원과 성벽 원이 닿았나" 하나뿐이다: 밀어내기가 개체를 정확히 t.r + radius에 세우므로
 * 직진하다 막힌 개체는 자동으로 이 조건에 들어온다 */
function breakWalls(c: Combat, dt: number, map: GameMap, f: Field): void {
  // **§0.7 J2 — 도시 맵에서는 적이 지형을 안 부순다.** 맵 규칙이 종·대형 규칙을 이긴다
  if (!c.enemyBreaks) return;
  for (const e of f.list) {
    const br = ENEMY_STATS[e.kind].breaker;
    if (!br) continue;
    e.breaking = false;
    let target: Terrain | null = null;
    let bd = Infinity;
    for (const t of map.terrain) {
      if (t.destroyed || !Number.isFinite(t.hp)) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d > t.r + ENEMY.radius + 2 || d >= bd) continue;
      target = t;
      bd = d;
    }
    if (!target) {
      e.breakCd = 0;
      continue;
    }
    e.breaking = true;
    e.breakCd -= dt;
    if (e.breakCd > 0) continue;
    e.breakCd = br.everySec;
    markEnemyAction(e, f.t, "break");
    c.breakerDmg += Math.min(br.dmg, target.hp);
    if (damageTerrain(c, target, br.dmg)) c.breakerDemolished++;
    // **자폭성 충돌** (§8.① 광란 멧돼지). 같은 파괴 경로를 쓰되 한 대마다 자기도 깎인다 —
    // 아래 사망 필터가 이 프레임에 바로 걸러 주므로 «성벽에 부딪혀 죽는» 그림이 성립한다.
    // 처치로 세는 것이 맞다(드랍도 붙는다): 이 적을 잡은 것은 플레이어가 세운 지형이다(§4.2)
    const rc = ENEMY_STATS[e.kind].recoil;
    if (rc) {
      const d = Math.min(rc, e.hp);
      e.hp -= rc;
      f.recoilDmg += d;
      if (e.hp <= 0) f.recoilKills++;
    }
    spawnFx(c.fx, "explode", target.x, target.y, { size: target.r * 0.9 });
    c.shake = SHAKE_TTL * 0.5;
  }
}

/** **공성 종대 돌파** (DESIGN §0.6 C5 "성벽·호수를 만나면 방진은 우회하고 공성 종대는 뚫는다").
 * 표적을 고르고 앵커를 세우는 것은 enemy.ts이고(`Company.ram`), **피해는 여기서** 준다 —
 * `breakWalls`와 정확히 같은 분업이다(damageTerrain이 스크랩 드랍·플로우필드 재계산을 든다).
 * 눈금도 오우거 `breaker`와 같다(SIEGE.dmg / everySec) — 「부대 하나가 오우거 한 기만큼 민다」 */
function siegeWalls(c: Combat, dt: number, f: Field): void {
  // **§0.7 J2 — 도시 맵에서는 공성 종대도 «대형을 유지한 채 최단 우회»다**(맵 규칙이 대형 규칙을
  // 이긴다). 앵커 쪽에서 `co.ram`이 아예 안 채워지므로 이 줄은 두 번째 자물쇠다
  if (!c.enemyBreaks) return;
  for (const co of f.companies) {
    const t = co.ram;
    if (!t || t.destroyed) {
      co.ramCd = 0;
      continue;
    }
    // 0 = **이번 프레임에 처음 문 벽**이다 — 표적을 놓으면 위에서 0으로 되돌리고, 한 대 친 뒤에는
    // 늘 `everySec`으로 되돌아가므로 이 값이 0으로 보이는 프레임은 «물기 시작한» 그 한 번뿐이다
    if (co.ramCd === 0) c.siegeRams++;
    co.ramCd -= dt;
    if (co.ramCd > 0) continue;
    co.ramCd = SIEGE.everySec;
    const attacker = f.list.find(e => e.co === co.id && e.hp > 0);
    if (attacker) markEnemyAction(attacker, f.t, "break");
    c.siegeDmg += Math.min(SIEGE.dmg, t.hp);
    if (damageTerrain(c, t, SIEGE.dmg)) c.siegeDemolished++;
    spawnFx(c.fx, "explode", t.x, t.y, { size: t.r * 0.9 });
    c.shake = SHAKE_TTL * 0.5;
  }
}

/** i번 칸이 1회 사격. 표적이 없으면 false(= 쿨다운 없이 다음 프레임에 다시 시도).
 * `sup` = 이 칸에 붙은 인접 지원칸 효과(train.ts supportAt) — 여기서는 관측칸의 `overHills`만 쓴다.
 * 탄약고의 연사 배수는 **쿨다운을 세는 쪽**(updateCombat)의 몫이다 */
function fireOnce(
  c: Combat, car: Car, px: number, py: number, f: Field, map: GameMap,
  sup: { rate: number; overHills: boolean },
  /** **산성 저하 피해 배수** (§8.③ 산성 뱉기, 기본 1). 공속 쪽 배수는 쿨다운을 세는
   *  updateCombat이 지고, 여기는 단발 피해만 본다 — 두 축이 갈려 있는 것은 탄약고(연사)와
   *  상점 레벨(피해)이 이미 그렇게 갈려 있기 때문이다 */
  am: number
): boolean {
  const kind = car.kind;
  const w = weaponOf(car)!;
  if (w.arc) return fireArc(c, car, px, py, f, am);
  if (w.cone) return fireCone(c, car, px, py, f, map, am);
  if (w.chain) return fireChain(c, car, px, py, f, am);
  const range = w.range * c.unit;
  const dmg = dmgOf(car, c.pass) * am;

  // 타겟팅 = §6 우선순위(코어 타격 중 → 최근접) + 사선 확보. 정면이 막힌 적은 표적으로 잡지 않는다
  // (0피해 헛방 방지) — 방패·사선 판정을 통과한 후보끼리만 우선순위를 비교한다
  let best: Enemy | null = null;
  let bd = Infinity;
  /** **사선이 막힌 최근접 후보** (§0.7 J1 · 도시 맵에서만 채워진다) */
  let blocked: Enemy | null = null;
  let blockedD = Infinity;
  for (const e of f.list) {
    const d = Math.hypot(e.x - px, e.y - py);
    if (d > range || !better(c, e, d, best, bd)) continue;
    if (!targetable(w, e)) continue;
    // **은신** (§8.③ 그림자 암살자): 표적으로 잡지 않는다. 단 **관측칸이 붙은 직사 칸은 예외**다 —
    // §6.1 "인접 직사 무기가 언덕 너머 사격"이 곧 §8.③의 카운터 "사계 개척"이고, 이 적이 그
    // 칸의 존재 이유다(iter64 판정: 관측칸은 자동 기준선에서 손해였다). 곡사·화염·체인에는
    // 이 예외가 없다 — 관측칸의 문면이 «직사»라서다
    if (e.hidden && !sup.overHills) continue;
    // **실드 돔** (§8.⑧): 곡사가 아닌 이 자리에서는 0피해 헛방이 되므로 표적으로 잡지 않는다
    // (방패·사선과 같은 이유). 「표적을 다른 데로 돌린다」가 곧 이 유형의 카운터인 «우선순위 판단»이다
    if (e.domed) continue;
    // **방패병 자신은 이제 표적이다** (§0.6 C3 ⓑ) — 실드가 유한해졌으므로 정면을 쏘는 것이
    // 「0피해 헛방」이 아니라 **전열을 깎는 일**이 됐다. 대신 그 **뒤에 선 적**이 후보에서 빠진다:
    // 그래서 직사 무기는 방진을 만나면 저절로 앞줄부터 지운다 = 「전열을 깨야 뒤가 닿는다」
    if (covered(f, e, px, py)) {
      c.coverSkipped++;
      continue;
    }
    if (!losOk(map, px, py, e.x, e.y, w.pierceWalls, sup.overHills)) {
      c.losBlocked++;
      // **막은 지물을 기억해 둔다** (§0.7 J1). 사거리 안에서 가장 가까운 「막힌 후보」의 사선을
      // 쓴다 — 표적 우선순위(§6)와 같은 눈금이라 «어차피 다음에 잡을 적»의 앞을 먼저 연다
      if (c.shootTerrain && d < blockedD) {
        blockedD = d;
        blocked = e;
      }
      continue;
    }
    best = e;
    bd = d;
  }
  // **지형이 내 공격을 먼저 맞는다** (§0.7 J1 · 도시 맵 전용). 사선이 트인 표적이 하나도 없고
  // 막힌 표적이 있으면, 그 한 발은 **막고 있는 지물로 나간다** — 이것이 이 맵의 자원 교환이다
  // (「사선을 여는 데 내 화력을 쓴다」). 평원에서는 `shootTerrain`이 false라 이 블록이 통째로 죽는다.
  // ⚠ 광역·관통 프리미엄은 여기 안 붙는다 — 지형은 한 장씩 깎는 것이 이 기믹의 눈금이고,
  //    한 발이 여러 장을 여는 것은 조준 포격(지형 피해 ×3)의 몫이다(§0.7 J1 말미)
  if (!best && blocked) {
    const t = blockerOnPath(map, px, py, blocked.x, blocked.y);
    if (t) {
      c.terrainShots++;
      c.terrainShotDmg += Math.min(dmg, t.hp);
      damageTerrain(c, t, dmg);
      // 궤적은 **지물 표면**에서 멈춘다 — 중심까지 그으면 탄이 벽을 뚫고 들어간 그림이 된다
      const d = Math.hypot(t.x - px, t.y - py) || 1;
      const hx = px + ((t.x - px) / d) * Math.max(0, d - t.r * 0.5);
      const hy = py + ((t.y - py) / d) * Math.max(0, d - t.r * 0.5);
      c.shots.push({ x0: px, y0: py, x1: hx, y1: hy, kind, t: 0, tier: fxTier(car) });
      muzzleFx(c, car, px, py, t.x, t.y);
      car.fired++;
      return true;
    }
  }
  if (!best) return false;
  // **관측칸이 없었으면 이 발이 없었는가** — §6.1 관측칸의 유일한 실효 지표다. 후보마다가 아니라
  // 「고른 표적」을 한 번만 재판정한다(후보마다면 관측칸 편성에서 사선 판정이 두 배가 된다).
  // 편성에 관측칸이 없으면 비용은 0이다
  if (sup.overHills && !losOk(map, px, py, best.x, best.y, w.pierceWalls)) c.losOverHills++;
  // **은신 관통** (§8.③): 관측칸이 없었으면 이 표적은 애초에 후보에서 빠졌다 — 위 사선 재판정과
  // 같은 자리에서 같은 규약으로 한 번만 센다
  if (sup.overHills && best.hidden) c.stealthPierced++;

  const dx = (best.x - px) / bd;
  const dy = (best.y - py) / bd;
  if (w.pierceWalls > 0) {
    // 관통 = 일직선 전부 타격 (§6.1). 빔 축에 투영해 반경 안에 걸친 적을 모두 맞힌다
    const ex = px + dx * range;
    const ey = py + dy * range;
    for (const e of f.list) {
      const t = (e.x - px) * dx + (e.y - py) * dy;
      if (t < 0 || t > range) continue;
      if (Math.abs(-(e.x - px) * dy + (e.y - py) * dx) > ENEMY.radius) continue;
      // `solo`를 안 준다(= 거짓) — 관통은 **일직선 전부 타격**이라 단일 표적이 아니다(§0.7-H).
      // 지금 관통을 든 것은 레일건과 철갑 관통탄뿐이고 둘 다 예외 무기라 판정선은 안 움직인다
      hitDirect(c, f, car, e, dmg, px, py);
    }
    c.shots.push({ x0: px, y0: py, x1: ex, y1: ey, kind, t: 0, tier: fxTier(car) });
  } else {
    // 지속 조사 증폭(레이저)은 **주 표적에만** 곱한다. 광역(함포 hitSplash)은 증폭이 없으므로
    // 두 무기가 같은 줄을 써도 서로의 프리미엄이 섞이지 않는다
    hitDirect(c, f, car, best, dmg * rampMult(c, car, w, best, rateOf(car, c.pass) * sup.rate), px, py, true);
    if (w.hitSplash) {
      // 직사 착탄 광역 (§6.1 함포 "대구경 단발, 광역 착탄"). **명중한 적을 중심으로** 즉착하므로
      // 표적이 없으면 광역도 없다 — 빗나가도 지면에 터지는 곡사와 다른 점이다.
      // 지형 피해는 주지 않는다(§6.1 "자동 사격의 지형 피해는 미미", 철거는 조준 포격의 몫)
      const r = w.hitSplash * c.unit;
      for (const e of f.list) {
        if (e === best || Math.hypot(e.x - best.x, e.y - best.y) > r) continue;
        if (!targetable(w, e)) continue;
        // 광역도 **계열은 직사**다 — 한 발의 계열이 둘이면 §6 계열표가 두 벌이 된다.
        // 그래서 전열·실드 판정도 착탄점이 아니라 **쏜 자리**를 기준으로 한다(px, py)
        if (hitDirect(c, f, car, e, dmg, px, py)) c.splashHits++;
      }
      c.blasts.push({ x: best.x, y: best.y, t: 0, r });
      spawnFx(c.fx, "explode", best.x, best.y, { size: r * BLAST_FX });
    }
    c.shots.push({ x0: px, y0: py, x1: best.x, y1: best.y, kind, t: 0, tier: fxTier(car) });
  }
  muzzleFx(c, car, px, py, best.x, best.y);
  car.fired++;
  return true;
}

/** Actual firing direction holds through the flash; idle turrets return toward the track.
 * This only reads the shot pose. Target priority, shot timing and damage remain in fireOnce. */
export function updateTurrets(c: Combat, dt: number, train: Train, _f: Field): void {
  const step = RENDER.turret.turnRate * dt;
  for (let i = 0; i < train.cars.length; i++) {
    const car = train.cars[i];
    if (!hasTurret(car.kind)) continue; // 수집칸 = 포탑 없음
    const p = at(train.track, carS(train, i));
    let want = p.ang;
    if (car.kind === "hero") {
      if (c.aim) want = Math.atan2(c.aim.y - p.y, c.aim.x - p.x);
    } else {
      const pose = firingPose.get(car);
      if (pose && pose.remaining > 0) {
        pose.remaining -= dt;
        car.turretAng = pose.angle;
        continue;
      }
    }
    // 최단 회전 방향으로 선회 속도만큼 (각도 차를 (-π, π]로 접는다)
    const diff = Math.atan2(Math.sin(want - car.turretAng), Math.cos(want - car.turretAng));
    const a = car.turretAng + (Math.abs(diff) <= step ? diff : Math.sign(diff) * step);
    // (-π, π]로 되접는다 — 안 접으면 진행 방향을 따라 도는 동안 각이 랩마다 2π씩 쌓인다
    car.turretAng = Math.atan2(Math.sin(a), Math.cos(a));
  }
}

/** 조준 포격 요청 (§6.2: 맵 아무 지점이나 클릭 → delaySec 뒤 착탄, 사거리 무제한).
 * 쿨다운 중이거나 패배 후면 무시하고 false. 자동 사격이 아니라 **플레이어의 손**이므로
 * 게임 로직이 이 함수를 스스로 부르는 곳은 없다 — 호출자는 main.ts의 클릭 핸들러(와 QA 스위치)뿐 */
export function callStrike(c: Combat, x: number, y: number): boolean {
  if (c.over || c.artCd > 0) return false;
  c.strikes.push({ x, y, t: 0 });
  c.artCd = ARTILLERY.cooldownSec * c.artCdMult;
  c.artFired++;
  emitAction({ source: "train", kind: "hero", action: "fire", x, y });
  return true;
}

/** 착탄. 적과 지형에 동시에 피해를 준다 (§6.2 "적·지형 모두 파괴").
 * 명중 판정은 적·지형 모두 **중심 거리 ≤ 착탄 반경** 하나로 통일한다 —
 * 지형에까지 겹침 판정을 쓰면 성벽 가장자리만 스쳐도 1발 철거가 되어 §4의 "철거 전용급"이 헐거워진다.
 * (착탄 반경 65 vs 성벽 반경 55라 성벽 위를 실제로 찍어야 철거된다) */
function detonate(c: Combat, map: GameMap, f: Field, s: Strike): void {
  emitAction({ source: "train", kind: "hero", action: "impact", x: s.x, y: s.y });
  const r = ARTILLERY.radius * c.unit;
  for (const e of f.list) {
    if (Math.hypot(e.x - s.x, e.y - s.y) > r) continue;
    // 조준 포격은 `hit()`을 안 지나므로 **무적을 여기서 따로 본다** (§0.7 K · 돔·방패와 같은 사정)
    if (e.invuln) {
      c.invulnBlocked += Math.min(ARTILLERY.dmg, e.hp);
      continue;
    }
    const damage = ARTILLERY.dmg * (c.damageScale?.(e, "hero") ?? 1);
    const dealt = Math.min(damage, e.hp);
    c.artDealt += dealt;
    e.hp -= damage;
    if (dealt > 0) c.onHit?.(e, "hero", dealt);
    hurtFx(e);
    // 조준 포격은 `hit()`을 안 지나므로(방패 오크·돔·치명타와 같은 규약) **숫자만 따로 띄운다** —
    // §0.7 H3의 문면은 「적 타격」이지 「자동 사격」이 아니고, 이 한 발이 화면에서 가장 큰 값이다.
    // 치명타는 여전히 밖이다(`crit = false`) — 그쪽은 §0.7 H2가 「전 무기칸」으로 못박은 축이다
    dmgNum(c, e, dealt, false);
    c.artHits++;
  }
  // 지형 피해 ×3 (BALANCE §4). damageTerrain이 파괴·스크랩·플로우필드 재계산 플래그를 함께 처리한다
  for (const t of map.terrain) {
    if (Math.hypot(t.x - s.x, t.y - s.y) > r) continue;
    damageTerrain(c, t, ARTILLERY.dmg * ARTILLERY.terrainMult);
  }
  // **연막 즉시 소거** (§8.⑧ 연막차 "조준 포격으로 즉시 소거"). 착탄 반경에 중심이 든 지대를 지운다 —
  // 차를 못 잡아도 지대는 지운다는 것이 이 적의 두 번째 카운터다(첫째는 차 자체를 먼저 지우는 것).
  // 지형·적과 같은 «중심 거리 ≤ 착탄 반경» 판정을 쓴다
  if (c.smokes.length) {
    const before = c.smokes.length;
    c.smokes = c.smokes.filter((z) => Math.hypot(z.x - s.x, z.y - s.y) > r);
    c.smokeCleared += before - c.smokes.length;
  }
  c.blasts.push({ x: s.x, y: s.y, t: 0, r, hero: true });
  spawnFx(c.fx, "explode", s.x, s.y, { priority: true, size: r * BLAST_FX });
  c.shake = SHAKE_TTL;
}

/** 곡사 착탄. 광역 피해만 준다 — 방패(정면 직사 무효)도 사선도 여기서는 무의미하다.
 * 지형 피해는 없다 (§6.1: 자동 사격의 지형 피해는 미미, 철거는 조준 포격의 몫) */
function impact(c: Combat, map: GameMap, f: Field, sh: Shell): void {
  emitAction({ source: "train", kind: sh.kind, action: "impact", x: sh.x, y: sh.y });
  const w = weaponOf(sh.car)!;
  const r = (w.splash ?? 0) * c.unit;
  const dmg = dmgOf(sh.car, c.pass) * (sh.frac ?? 1);
  let n = 0;
  for (const e of f.list) {
    if (Math.hypot(e.x - sh.x, e.y - sh.y) > r) continue;
    hit(c, f, sh.car, e, dmg, "arc");
    n++;
  }
  c.arcImpacts++;
  c.arcHits += n;
  if (!n) c.arcMisses++;
  // 화염 지대 (소이탄 §6.1 "착탄 지점에 화염 지대 / **웅덩이·호수 위엔 무효**").
  // 물 판정은 착탄점이 물 지형 원 안인가 하나다 — 지대는 원이라 중심이 물이면 통째로 무산된다
  if (w.burn) {
    if (onWater(map, sh.x, sh.y)) c.fireOnWater++;
    else {
      c.fires.push({ x: sh.x, y: sh.y, r, t: 0, dur: w.burn.sec, dps: dmg * w.burn.dpsRate, car: sh.car });
      c.fireZones++;
    }
  }
  c.blasts.push({ x: sh.x, y: sh.y, t: 0, r });
  spawnFx(c.fx, "explode", sh.x, sh.y, { size: r * BLAST_FX });
}

/** (x, y)가 물 지형(웅덩이·호수) 위인가 — 소이탄의 "물 위엔 무효"(§6.1)가 쓰는 유일한 판정 */
function onWater(map: GameMap, x: number, y: number): boolean {
  for (const t of map.terrain) {
    if (t.destroyed || (t.kind !== "pond" && t.kind !== "lake")) continue;
    if (Math.hypot(x - t.x, y - t.y) <= t.r) return true;
  }
  return false;
}

/** 화염 지대 갱신 — 안에 있는 적에게 초당 `dps`를 먹인다 (지속 피해·지역 거부).
 * 곡사 착탄과 달리 **매 프레임** 도는 판정이라 지대 수 × 적 수가 곧 비용이다 —
 * 지대는 4초 수명이고 소이탄 1문이 0.8발/s(§0.5 공속 ×2)라 동시에 3~4개가 상한이다 */
function updateFires(c: Combat, dt: number, f: Field): void {
  if (!c.fires.length) return;
  for (const z of c.fires) {
    z.t += dt;
    for (const e of f.list) {
      if (Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
      const d = z.dps * dt;
      hit(c, f, z.car, e, d, "flame", true);
      c.fireDmg += d;
    }
  }
  c.fires = c.fires.filter((z) => z.t < z.dur);
}

/** 산성 웅덩이 갱신 (§8.⑦ 산성 슬라임) — 안에 있는 **지형만** 초당 `dps`씩 녹인다.
 * `damageTerrain`이 파괴·철거 드랍·플로우필드 재계산을 함께 처리하므로 여기서 볼 것은 «누가
 * 녹였는가»의 장부뿐이다. 무한 HP(호수·언덕·웅덩이)는 damageTerrain이 그대로 튕겨 낸다 =
 * 이 지대가 실제로 갉는 것은 **성벽과 잔해뿐**이고 그것이 §8.⑦의 문면이다 */
function updatePools(c: Combat, dt: number, map: GameMap): void {
  if (!c.pools.length) return;
  // ⚠ **§0.7 J2의 네 번째 «자물쇠 없음»은 감독 판정 4(DESIGN §0.7 · 2026-08-24)로 닫혔다.**
  // `breakWalls`(개체)·`siegeWalls`(대형)·`quakeAt`(보스 패턴)에는 `if (!c.enemyBreaks) return;`이
  // 있는데 여기엔 없다 — 산성 웅덩이는 **개체도 대형도 패턴도 아니라 «시체가 남긴 지대»**라 앞의
  // 셋을 모두 비켜 간다. iter116은 이것을 결함으로 올렸고(도시 풀런 `meltDemolished 9`), 감독의
  // 판정은 **「J2의 대상이 아니다」**다: J2는 «기존 지물의 파괴 금지»이지 **적이 «새 지형을 만드는
  // 것»의 금지가 아니고**, 산성 웅덩이·잔해 생성이 바로 그 후자다. 그래서 **기본값 `false`(= 안
  // 잠근다)가 정본이고**, `?acidlock=1`은 사다리를 다시 잴 때만 쓰는 손잡이로 남긴다
  // (잠그면 도시 완주 `60/60 · 509.3` → `48/60 · 542.2` — 산성이 녹여 주던 9장이 플레이어의
  // 사선을 열어 주고 있었다 · iter116 실측).
  // ⚠ **한 줄이 남았다(STATUS 미결 질문 · 감독 등재 필요)** — 이 지대가 실제로 갉는 것은 «새 지형»이
  // 아니라 **이미 서 있던 성벽·잔해**다. 판정의 문면과 이 코드가 가리키는 대상이 반 칸 어긋나 있고,
  // 규약대로 **값은 안 굳히고 판정이 지시한 기본값(안 잠금)을 그대로 둔다**.
  if (qaAcidLock && !c.enemyBreaks) return;
  for (const z of c.pools) {
    z.t += dt;
    for (const t of map.terrain) {
      if (t.destroyed || !Number.isFinite(t.hp)) continue;
      if (Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r) continue;
      const d = Math.min(z.dps * dt, t.hp);
      c.meltDmg += d;
      if (damageTerrain(c, t, z.dps * dt)) c.meltDemolished++;
    }
  }
  c.pools = c.pools.filter((z) => z.t < z.dur);
}

/** 연막 갱신 (§8.⑧ 연막차) — **까는 쪽과 나이 먹는 쪽이 한 함수**다.
 * 지대 목록이 화염·산성과 같이 Combat에 있으므로 «누가 까는가»(살아 있는 연막차)도 여기서 본다 —
 * enemy.ts에 두면 그 파일이 지대 목록을 알아야 하고, 그러면 판정이 두 파일로 갈린다.
 * 죽은 차가 남긴 지대는 **그대로 수명을 산다**(연막은 차가 아니라 판 위의 것이다) */
function updateSmoke(c: Combat, dt: number, f: Field): void {
  for (const e of f.list) {
    const sm = ENEMY_STATS[e.kind].smoke;
    if (!sm) continue;
    e.smokeCd -= dt;
    if (e.smokeCd > 0) continue;
    e.smokeCd = sm.everySec;
    markEnemyAction(e, f.t, "smoke");
    c.smokes.push({ x: e.x, y: e.y, r: sm.r * c.unit, t: 0, dur: sm.sec, dmg: sm.dmg });
    // **동시 상한**에서 가장 오래된 것부터 걷는다 (ENEMY.smokeCap · debrisCap과 같은 규약).
    // 없으면 트럭이 여럿인 편성에서 판 전체가 회색이 되어 「구역」이 「날씨」가 된다
    if (c.smokes.length > ENEMY.smokeCap) c.smokes.shift();
    c.smokeLaid++;
    spawnFx(c.fx, "smoke", e.x, e.y, { size: sm.r * c.unit });
  }
  if (!c.smokes.length) return;
  for (const z of c.smokes) z.t += dt;
  c.smokes = c.smokes.filter((z) => z.t < z.dur);
}

/** 화면 진동 오프셋(월드). 난수 대신 simT의 사인파 — 스크린샷 QA가 재현 가능해야 한다 */
export function shakeOffset(c: Combat, simT: number): { x: number; y: number } {
  if (c.shake <= 0 || getEffectSettings().reducedMotion) return { x: 0, y: 0 };
  const k = (c.shake / SHAKE_TTL) * SHAKE_AMP;
  return { x: Math.sin(simT * 71) * k, y: Math.cos(simT * 53) * k };
}

function recordCoreDamage(c: Combat, cause: string, amount: number): void {
  if (amount > 0) c.coreDamageByCause[cause] = (c.coreDamageByCause[cause] ?? 0) + amount;
}

export function updateCombat(c: Combat, dt: number, map: GameMap, train: Train, f: Field): void {
  if (c.over) return;
  c.coreImpact.age += dt;

  // 보스별 계측 (감독 #31 ⓒ). 필드에 보스가 있는 동안 마지막 행을 열어 두고, 처치 프레임에 닫는다
  // (닫는 쪽은 아래 사망 루프). 보스는 동시에 1기뿐이라 "열린 행"은 언제나 하나다
  {
    const boss = f.list.find((e) => isBossKind(e.kind));
    let row = c.bossLog[c.bossLog.length - 1] ?? null;
    if (boss && (row === null || row.killT !== null)) {
      row = {
        n: c.bossLog.length,
        kind: boss.kind,
        wave: boss.wave + 1,
        maxHp: +boss.maxHp.toFixed(0),
        spawnT: +f.t.toFixed(1),
        engageT: null,
        breachT: null,
        hitT: null,
        killT: null,
        fightSec: null,
        coreHits: 0,
        lostBoss: 0,
        lostMob: 0,
        dps: null,
        cars: null,
        tier: null,
        hitDistU: null,
        aliveAtHit: null,
        mobKills: 0,
        meltT: null,
        meltSec: null,
        meltDistU: null,
        nearT: null,
        nearSec: null,
        killDistU: null,
        killDeg: null,
      };
      c.bossLog.push(row);
    }
    if (boss && row && row.killT === null) {
      // 교전 개시 프레임에 누적치를 스냅샷해 둔다 — 접근 중(14~17초)의 잡몹 피해를 보스전 몫으로
      // 세지 않으려면 기준점이 스폰이 아니라 교전이어야 한다
      if (row.engageT === null && boss.firing) {
        row.engageT = +f.t.toFixed(1);
        row.coreHits = c.bossCoreHits;
        row.lostBoss = c.coreDmgBoss;
        row.lostMob = c.coreDmgMob;
      }
      if (row.breachT === null && boss.railT !== null) row.breachT = +boss.railT.toFixed(1);
      // 첫 피해 = `fightSec`의 기준점 (감독 #34 ①). 피해는 여러 경로(직사·곡사·포격·화염)에서
      // 들어오므로 그 전부를 계측하는 대신 **HP가 처음 깎인 프레임**을 본다 — 프레임(1/60초) 단위다
      if (row.hitT === null && boss.hp < boss.maxHp) {
        row.hitT = +f.t.toFixed(1);
        row.dps = +trainDps(train, c.pass).toFixed(1);
        row.cars = train.cars.length;
        row.tier = train.cars.reduce((a, car) => (hasTurret(car.kind) ? Math.max(a, car.tier) : a), 0);
        row.hitDistU = +(Math.hypot(boss.x - map.cx, boss.y - map.cy) / map.outerR).toFixed(3);
        row.aliveAtHit = f.list.length;
        // 보스전 «동안»의 잡몹 처치는 여기서 기준점을 잡고 처치 프레임에 차분한다 (lostBoss와 같은 규약)
        row.mobKills = c.kills;
      }
      // **대안 눈금 둘의 기준점** (iter141). `hitT`와 달리 «첫 스침»에서 안 선다 —
      // ⓐ 문턱(HP 90%)을 지나야 서고 ⓑ 루프 반경 1.5 안에 들어와야 선다
      if (row.meltT === null && boss.hp <= boss.maxHp * BOSS_MELT_PCT) {
        row.meltT = +f.t.toFixed(1);
        row.meltDistU = +(Math.hypot(boss.x - map.cx, boss.y - map.cy) / map.outerR).toFixed(3);
      }
      if (row.nearT === null && Math.hypot(boss.x - map.cx, boss.y - map.cy) <= map.outerR * BOSS_NEAR_U) {
        row.nearT = +f.t.toFixed(1);
      }
    }
  }

  for (let i = 0; i < train.cars.length; i++) {
    const car = train.cars[i];
    const w = weaponOf(car);
    if (!w) continue; // 무기가 아닌 칸(기관차·수집칸)
    // **가고일이 앉은 칸은 이번 프레임 사격이 없다** (§8.⑤ · §8.0 "무기 일시 정지").
    // 쿨다운도 안 깎는다 — 깎으면 정지가 "다음 발이 밀린다"가 아니라 "정지 중에도 장전된다"가 된다
    if (train.stunned.has(i)) continue;
    car.cd -= dt;
    if (car.cd > 0) continue;
    const p = at(train.track, carS(train, i));
    // 인접 지원칸(§6.1): 탄약고는 여기서 쿨다운을 줄이고, 관측칸은 fireOnce의 사선 판정에 들어간다
    const sup = supportAt(train, i);
    // **산성 저하** (§8.③ 산성 뱉기 · §8.0 "무기 성능 저하"). 가고일의 정지가 «건너뛴다»라면
    // 이쪽은 «곱한다»다 — 공속은 쿨다운에, 피해는 fireOnce의 `am`에 실린다.
    // 배수는 종의 스탯(ENEMY_STATS.acid_spitter.spit)에서 오고, 집합은 enemy.ts가 매 프레임 다시 센다
    const ac = train.acid.has(i) ? ACID : null;
    const fired = fireOnce(c, car, p.x, p.y, f, map, sup, ac ? ac.dmg : 1);
    if (fired) emitAction({ source: "train", kind: car.kind, action: "fire", x: p.x, y: p.y });
    car.cd = fired
      ? 1 / (rateOf(car, c.pass) * sup.rate * (ac ? ac.rate : 1))
      : 0;
  }

  // 곡사 포탄: 비행 → 착탄. 조준 포격과 같은 이유로 사망 필터 앞에서 처리한다.
  // **유도탄(미사일)은 착탄점이 표적을 따라간다** — 표적이 죽으면 마지막 좌표에 그대로 떨어진다
  for (const sh of c.shells) {
    sh.t += dt;
    if (sh.target && sh.target.hp > 0) {
      sh.x = sh.target.x;
      sh.y = sh.target.y;
    }
    // **연기 궤적** (§0.6 G ⓐ 미사일 「연기 궤적」 · MLRS 「다발 궤적」). 거리 눈금이라
    // 비행 시간이 다른 포탄들이 같은 밀도로 남긴다. 자리는 **그려지는 높이**(shellPos)여야
    // 연기가 지면이 아니라 포탄 뒤에 붙는다
    const tr = wfx(sh.kind).trail;
    if (tr > 0) {
      const p = shellPos(sh);
      if (Math.hypot(p.x - sh.tx, p.y - sh.ty) >= tr) {
        spawnFx(c.fx, "trail", p.x, p.y);
        sh.tx = p.x;
        sh.ty = p.y;
      }
    }
  }
  if (c.shells.some((sh) => sh.t >= sh.dur)) {
    for (const sh of c.shells) if (sh.t >= sh.dur) impact(c, map, f, sh);
    c.shells = c.shells.filter((sh) => sh.t < sh.dur);
  }

  // 화염 지대 (소이탄). 곡사 착탄 뒤에 돌려야 이번 프레임에 생긴 지대가 다음 프레임부터 먹인다
  updateFires(c, dt, f);
  updatePools(c, dt, map);
  updateSmoke(c, dt, f);

  // 조준 포격: 비행 → 착탄. 사망 필터 앞에서 처리해야 포격 처치가 kills에 잡힌다
  c.artCd -= dt;
  for (const s of c.strikes) s.t += dt;
  if (c.strikes.some((s) => s.t >= ARTILLERY.delaySec)) {
    for (const s of c.strikes) if (s.t >= ARTILLERY.delaySec) detonate(c, map, f, s);
    c.strikes = c.strikes.filter((s) => s.t < ARTILLERY.delaySec);
  }

  // 성벽 파괴 직진 (§8 오우거). 사망 필터 **앞**이라 마지막 히트로 철거한 개체가 그 프레임에 죽어도
  // 철거가 반영된다. 여기서 terrainDirty가 서면 main.ts가 그 프레임에 플로우필드를 다시 굽는다
  breakWalls(c, dt, map, f);
  siegeWalls(c, dt, f);
  // **폭발 지물** (§0.7 J1-c). 지형을 부수는 넷(포격·오우거·공성 종대·산성)이 **전부 지나간 뒤**라
  // 누가 터뜨렸든 같은 프레임에 터진다. 사망 필터 앞이라 폭발 처치가 kills·드랍에 잡힌다
  resolveFuelBlasts(c, map, f);

  // 지형 연출 타이머 (§0.6 F ⓑ). **잔여 타이머**라 렌더가 시뮬 시각을 몰라도 된다 — 깎는 곳은
  // 여기 한 줄뿐이고 `damageTerrain`이 세운다(`Company.broken`과 같은 규약)
  for (const t of map.terrain) {
    if (t.hitFx) t.hitFx = Math.max(0, t.hitFx - dt);
    if (t.fallFx) t.fallFx = Math.max(0, t.fallFx - dt);
  }

  // 처치 처리 — 리스트에서 빠지기 전에 드랍을 그 자리에 떨구고(§7.1), 분열체를 갈라 놓는다(§8.⑦).
  // 처치 수는 리스트 길이 차로 세면 안 된다 — 분열로 오히려 늘어나기 때문이다
  const dead = f.list.filter((e) => e.hp <= 0);
  for (const e of dead) {
    const st = ENEMY_STATS[e.kind];
    // **재기동** (§8.① 해골 보병 "사망 시 30% 확률로 뼈무더기에서 재기동 — 광역 확인사살 요구").
    // 처치 자체가 취소되는 경로라 드랍·처치 수·시체·폭발이 하나도 안 붙는다 — 아래 `hp > 0` 필터가
    // 이 개체를 그대로 남긴다. 확률은 스폰 때 이미 굳어 있다(enemy.ts revives)
    if (e.revives > 0) {
      e.revives--;
      e.hp = e.maxHp;
      e.hurt = RENDER.hurtShow;
      f.revived++;
      spawnFx(c.fx, "smoke", e.x, e.y, { size: ENEMY.size });
      continue;
    }
    // 보스는 §0.5 전 축 제외(§5 스탯 유지) — 드랍 100도 그대로다.
    // 중간보스도 같다 — 예산 밖 1기라 물량 배율(×5)을 안 탔으므로 드랍 배율(×0.2)도 안 탄다
    // **부활체는 드랍이 없다** (§0.7 K ⓑ · 감독 고정 "같은 개체로 두 번 벌 수 없다").
    // 값을 0으로 주는 것이 아니라 **호출을 건너뛴다** — dropScrap은 소수점 누산기라 0을 넣으면
    // 그 프레임의 잔돈이 조용히 다음 개체로 넘어간다(§0.5 드랍 배율의 반올림 규약)
    if (!e.undead) dropScrap(c, e.x, e.y, st.scrap, !isBossKind(e.kind) && !isMidKind(e.kind));
    // 사망 페이드 (감독 #5 V3) — 판정에서 빠지기 **직전에** 잔상을 남긴다
    addCorpse(f, e);
    // 엘리트(ENEMY.eliteHp 이상)만 터진다 — 잡몹까지 터뜨리면 화면이 폭발로 덮인다.
    // HP바 상시 표시와 같은 기준이라 "바가 보이던 적이 터진다"가 화면에서 일관된다
    if (st.hp >= ENEMY.eliteHp) spawnFx(c.fx, "explode", e.x, e.y, { size: ENEMY.size * DEATH_FX });
    c.kills++;
    c.killsByKind[e.kind] = (c.killsByKind[e.kind] ?? 0) + 1;
    // **처치까지 맞은 발수** (§0.7 H1 판정 기준). 잡몹만 센다 — 창(2~5발)이 잡몹의 것이고
    // 보스·중간보스는 이미 자기 곡선(`BOSS.hpStep`·`MID`)을 갖고 있다. `hits 0`은 사격이
    // 아니라 자폭·소진으로 사라진 개체라 표본에서 뺀다(발수 분포가 0으로 끌려간다)
    if (e.hits > 0 && !isBossKind(e.kind) && !isMidKind(e.kind)) {
      const row = c.ttk[e.wave];
      if (row) {
        row.n++;
        row.sum += e.hits;
        if (e.hits === 1) row.one++;
        // **불변식 6**(§0.7-B) — 예외 무기 셋은 분모에서도 빠진다(위 `ttk` 주석의 이유).
        // 분자는 「치명타가 한 번도 안 붙은 한 방 처치」다: 치명타로 죽은 한 방은 사용자 판정
        // ("크리티컬이 없는데도 한 방이면")의 대상이 아니다
        if (!ONE_SHOT_OK.includes(e.hitKind)) {
          row.nNc++;
          if (e.hits === 1 && e.critHits === 0) row.oneNc++;
        }
        // **무기칸별 분해**(iter157 · 큐 1) — 예외 셋을 «안 가르고» 전부 적는다. 위 두 칸이
        // 「규약이 덮는 안쪽」이라면 이 칸은 「규약의 분모가 얼마를 덮는가」다
        const k = (row.kind[e.hitKind] ??= { n: 0, one: 0, ds: 0, dsOne: 0 });
        k.n++;
        if (e.hits === 1 && e.critHits === 0) k.one++;
        // **불변식 6의 «새» 분모**(§0.7-H · INBOX #76 ①) — 예외 셋을 빼는 것은 `nNc`와 같고,
        // 그 위에 **「죽인 한 발이 직사 단일 표적이었나」**를 더 건다. 광역(곡사 splash·함포
        // hitSplash)·연쇄(테슬라)·화염은 **분자에서도 분모에서도** 빠진다: 곡사가 무리를 쓸어담는
        // 것은 그 무기를 산 대가라 그것을 「평타 한 방」으로 세면 지표가 설계를 벌한다(§0.7-H).
        // ⚠ 화염 지대 같은 지속 틱은 애초에 `e.hits`를 안 올려 이 블록에 못 온다
        if (e.hitDsg) {
          k.ds++;
          if (e.hits === 1 && e.critHits === 0) k.dsOne++;
          if (!ONE_SHOT_OK.includes(e.hitKind)) {
            row.nDs++;
            if (e.hits === 1 && e.critHits === 0) row.oneDs++;
          }
        }
        // **처치 반경**(iter160 · 큐 1 · 표 8 ⓔ). `BossLog.killDistU`와 **같은 식**이고 단위도 같다
        // (루프 반경 = 1). 표본은 이 블록이 이미 고른 것 그대로다 — «사격에 맞아 죽은 잡몹»이라
        // 자폭·소진은 안 든다(그것들은 «지워진» 것이 아니라 스스로 사라진 것이다)
        const kr = +(Math.hypot(e.x - map.cx, e.y - map.cy) / map.outerR).toFixed(3);
        row.killR.n++;
        row.killR.sum += kr;
        row.killR.hist[Math.min(KILL_R_BINS - 1, Math.max(0, Math.floor(kr / KILL_R_STEP)))]++;
        // **무기칸별 분해**(iter162 · 큐 1 · 표 8 ⓔ의 손잡이) — 같은 표본을 `kind`와 **같은 열쇠**로
        // 한 번 더 가른다. 히스토그램 없이 `{n, sum}`만 적는 것이 규약이다(평균 반경으로 순위가 난다)
        const kr2 = (row.killRByKind[e.hitKind] ??= { n: 0, sum: 0 });
        kr2.n++;
        kr2.sum += kr;
        // **적종별 분해**(iter165 · 큐 1 · 표 8 ⓔ) — 같은 표본을 `e.kind`로 한 번 더 가른다.
        // 진영 교대가 계단을 만들었으므로(iter164) 진영을 가르는 열쇠는 무기가 아니라 적종이다
        const kr3 = (row.killRByEnemy[e.kind] ??= { n: 0, sum: 0, hits: 0, life: 0 });
        kr3.n++;
        kr3.sum += kr;
        // **위협도 진단 두 칸**(BALANCE §0.9 ③ · 감독 #79 ③) — 「근접이 원거리보다 유의하게 빨리
        // 죽는가」를 재려면 반경만으로는 못 가른다(원거리는 standoff 때문에 애초에 멀리서 죽는다).
        // `hits`가 **처치 발수**(= ttk의 적종별 분해) · `life`가 **스폰부터 사망까지의 초**다.
        // 표본은 위 세 칸과 **완전히 같다** ⇒ `Σ n === killR.n`이 여기서도 그대로 기계 검산이다
        kr3.hits += e.hits;
        kr3.life += f.t - e.bornT;
      }
    } else if (e.hits === 0 && !isBossKind(e.kind) && !isMidKind(e.kind)) {
      // **표본 «밖»**(iter165 · 큐 1) — 위 블록이 통째로 빼는 개체(사격에 한 발도 안 맞고 죽은 잡몹:
      // 화염 지대·산성 풀·폭발 지물)를 **같은 자리에서 같은 식으로** 따로 센다. 이 몫이 «안쪽»에
      // 몰려 있으면 위 `killR`의 전선은 눈금이 만든 것이다(빠진 개체가 안쪽이라 남은 표본이 밖으로 쏠린다).
      // ⚠ 위 표본에 더하지 말 것 — iter160~164의 기준선이 통째로 갈린다
      const row = c.ttk[e.wave];
      if (row) {
        row.miss.n++;
        row.miss.sum += +(Math.hypot(e.x - map.cx, e.y - map.cy) / map.outerR).toFixed(3);
      }
    }
    // **처치 지점 적립** (§8.⑦ 네크로맨서의 재료). 시체 잔상(addCorpse)과 **다른 목록**이다 —
    // 저쪽은 1초 페이드의 순수 연출이고 이쪽은 판정이 읽는 값이다. 여기(진짜 처치)에만 쌓는다:
    // 자폭한 박쥐·이탈한 공작원·해체된 폭탄은 «처치»가 아니라 소진이라 시체를 안 남긴다.
    // 상한에서 **가장 오래된 것부터** 버린다 = "시체밭"은 최근에 죽은 자리들이다
    // **부활체는 시체를 안 남긴다** (§0.7 K). 드랍 0과 **같은 이유**다 — 한 개체로 두 번 벌 수 없듯
    // 한 시체로 두 번 일어날 수도 없다. 안 그러면 웨이브 40이 웨이브 20의 부활체를 다시 먹는다
    // (엘리트 네크로맨서의 4초 재소환도 같은 자리를 무한히 재활용하게 된다)
    if (!e.undead) {
      // **종을 함께 적는다** (§0.7 K ③ "죽은 몬스터들이 죽은 자리에서 되살아난다") — 좌표만으로는
      // 무엇이 일어나는지 알 수 없다. 엘리트 재소환(`raise.into`)은 이 칸을 안 보므로 안 갈린다
      // **웨이브를 함께 적는다** — 일제 부활(§0.7 K ⑤)이 「**이 웨이브에서** 죽은」을 가르는 칸이다
      f.graves.push({ x: e.x, y: e.y, kind: e.kind, w: e.wave });
      // **이벤트 웨이브 동안에는 천장이 `fieldCap`이다** — 1차 물량이 195~227기라 `graveCap 60`이면
      // 「전사자 전원」이 재료 단계에서 이미 26~31%로 잘린다. 정본이 「실제 제한은 필드 상한 400의
      // 여유분 하나」라고 못박은 자리이고, `graveCap`은 BALANCE 미등재 배치 파라미터다(balance.ts 주석).
      // 여느 웨이브는 한 자리도 안 갈린다 — 엘리트 네크로맨서가 읽는 「최근의 시체밭」이 그대로다
      // ⚠ **`while`이어야 한다** — 이벤트 웨이브가 끝나면 천장이 400에서 60으로 **내려온다**.
      // `if`면 푸시 1회당 1개만 버려 길이가 그 자리에 «고정»되고(들어온 만큼만 나간다) 웨이브 40의
      // 227장이 런 끝까지 남는다(iter111 실측: 웨이브 60에서 재고 389). 그러면 엘리트 네크로맨서가
      // 「최근의 시체밭」이 아니라 «런 전체의 시체밭»을 먹는다 = §8.⑦의 조건부 프리미엄이 무조건이 된다
      // `f.eventWave`를 본다 — `isEventWave`는 `?event=0`을 모른다(그 컷은 「여느 보스 웨이브」라
      // 천장도 여느 웨이브의 것이어야 하는데, 술어만 보면 대조군에서도 400으로 열린다)
      const cap = f.eventWave ? ENEMY.fieldCap : ENEMY.graveCap;
      while (f.graves.length > cap) f.graves.shift();
    }
    if (isBossKind(e.kind)) {
      // 열린 보스 행을 닫는다 (감독 #31 ⓒ). 손실 열은 교전 개시 스냅샷과의 차다 —
      // 교전 전에 죽었으면(engageT null) 스냅샷이 없으므로 0으로 남긴다
      const row = c.bossLog[c.bossLog.length - 1];
      if (row && row.killT === null) {
        row.killT = +f.t.toFixed(1);
        // 한 프레임에 만피에서 죽으면 첫 피해 프레임이 안 잡힌다 — 그 경우가 곧 fightSec 0이다
        if (row.hitT === null) row.hitT = +f.t.toFixed(1);
        row.fightSec = +(f.t - row.hitT).toFixed(1);
        // `c.kills++`가 이 블록 **위에서** 이미 보스 자신을 셌다 — 1을 빼야 순수 잡몹 수다.
        // 첫 피해 프레임이 안 잡힌 행(만피에서 한 프레임에 죽었다)은 기준점이 없으므로 0으로 남긴다
        row.mobKills = row.aliveAtHit === null ? 0 : c.kills - row.mobKills - 1;
        // 대안 눈금 둘을 닫는다. 한 프레임에 만피에서 죽으면 `meltT`도 안 잡히므로 `hitT`와 같은
        // 규약으로 처치 시각을 넣어 0이 되게 한다. `nearT`는 **끝까지 안 서면 null로 남긴다** —
        // 루프 반경 1.5 밖에서 죽은 보스는 「가까이 온 뒤 녹은 시간」이라는 값 자체가 없다
        if (row.meltT === null) row.meltT = row.killT;
        row.meltSec = +(f.t - row.meltT).toFixed(1);
        row.nearSec = row.nearT === null ? null : +(f.t - row.nearT).toFixed(1);
        // 처치 프레임의 자리 (iter155). `nearSec`과 달리 **언제나 선다** — 어디서 죽었든 자리는 있다
        row.killDistU = +(Math.hypot(e.x - map.cx, e.y - map.cy) / map.outerR).toFixed(3);
        // 그 자리의 각 (iter156). 반지름과 짝이라 probe가 화면 좌표를 되만든다 — 분류는 probe 몫이다
        row.killDeg = +((Math.atan2(e.y - map.cy, e.x - map.cx) * 180) / Math.PI).toFixed(1);
        if (row.engageT === null) row.coreHits = row.lostBoss = row.lostMob = 0;
        else {
          row.coreHits = c.bossCoreHits - row.coreHits;
          row.lostBoss = +(c.coreDmgBoss - row.lostBoss).toFixed(1);
          row.lostMob = +(c.coreDmgMob - row.lostMob).toFixed(1);
        }
      }
      // 단일 필드는 **지금 교전 중인 보스**의 것이다 — 여기서 비우지 않으면 10기 체제에서
      // 첫 보스의 engageT가 런 끝까지 남아 `boss.fightSec`가 수천 초로 찍힌다
      f.bossEngageT = null;
      c.bossFightBase = null;
    }
    // **잔해 생성** (§8.② 스크랩 골렘 "죽일 위치를 골라야 하는 적"). 오우거의 `damageTerrain`을
    // **역방향**으로 쓴다 — 지형을 지우는 대신 세우고, 같은 `terrainDirty` 한 줄로 플로우필드가
    // 그 프레임에 다시 구워진다(§4.2). 두 조건이 붙는다:
    //  ① **루프 밖에서만** — §5.0 "지형은 외곽 전장에". 레일 안쪽(코어~루프)에 벽이 서면 적이
    //     코어에 못 가는 «공짜 방어»가 되고, 화면에서도 §5.0의 구도가 무너진다.
    //     그래서 끌어들여 잡으면 이 적의 대가가 0이 된다 = 그것이 "죽일 위치를 골라야" 하는 이유다
    //  ② **동시 상한**(ENEMY.debrisCap) — 살아 있는 잔해만 센다(§4.2 보충 규칙과 같은 규약)
    const db = st.debris;
    if (db && Math.hypot(e.x - map.cx, e.y - map.cy) > map.outerR + db.r * map.outerR) {
      const alive = map.terrain.filter((t) => t.scrap === 0 && !t.destroyed).length;
      if (alive < ENEMY.debrisCap) {
        map.terrain.push({
          kind: "wall",
          x: e.x,
          y: e.y,
          r: db.r * map.outerR,
          hp: db.hp,
          hp0: db.hp,
          destroyed: false,
          scrap: 0, // 잔해 철거는 §4.2의 성벽 파괴가 아니다 — 수입은 처치 때 이미 다 줬다
        });
        c.debris++;
        c.terrainDirty = true;
        spawnFx(c.fx, "smoke", e.x, e.y, { size: db.r * map.outerR });
      }
    }
    // **산성 웅덩이** (§8.⑦ 산성 슬라임 "사망 지점에 산성 웅덩이"). 골렘의 `debris`(지형을 세운다)와
    // **정확히 반대 방향**이고, 같은 «죽은 자리가 판을 바꾼다»는 축의 다른 끝이다.
    // 골렘과 달리 **루프 안팎을 안 가른다** — 지형을 세우는 것이 아니라 녹이는 것이라 §5.0의
    // "지형은 외곽 전장에"가 위태로워지지 않는다(성벽은 어차피 외곽에 있다)
    // **사망 시 주변 광폭화** (§8.⑧ 배너 로드 "죽이는 타이밍도 선택"). 잔해·웅덩이와 **같은 자리**의
    // «죽은 자리가 판을 바꾼다»인데, 이쪽만 바꾸는 것이 지형이 아니라 **옆에 선 적**이다.
    // 배수를 개체가 들고 가는 이유는 원인이 이미 죽어서다(보스 `rage`는 자기 스탯을 계속 물을 수 있다)
    const dr = st.deathRage;
    if (dr) {
      const rr = dr.r * map.outerR;
      for (const o of f.list) {
        if (o === e || o.hp <= 0 || Math.hypot(o.x - e.x, o.y - e.y) > rr) continue;
        o.rageT = dr.sec;
        o.rageMul = dr.speed;
        c.deathRages++;
      }
      spawnFx(c.fx, "explode", e.x, e.y, { size: ENEMY.size * DEATH_FX });
    }
    const pd = st.puddle;
    if (pd) {
      c.pools.push({ x: e.x, y: e.y, r: pd.r * c.unit, t: 0, dur: pd.sec, dps: pd.dps });
      c.acidPools++;
      spawnFx(c.fx, "smoke", e.x, e.y, { size: pd.r * c.unit });
    }
    if (!st.split) continue;
    // 분열체는 진행 방향의 좌우로 갈라진다 (§8.⑦ "단일 고화력에 비효율" — 한 발로 마무리가 안 된다)
    c.splits++;
    const a0 = Math.atan2(e.faceY, e.faceX) + Math.PI / 2;
    for (let i = 0; i < st.split.n; i++) {
      const a = a0 + (i * Math.PI * 2) / st.split.n;
      const off = ENEMY.radius * 1.8;
      spawnEnemy(f, st.split.into, e.x + Math.cos(a) * off, e.y + Math.sin(a) * off, e.faceX, e.faceY);
    }
  }
  f.list = f.list.filter((e) => e.hp > 0);
  updateDrops(c, dt, train);

  // 코어 피격 (§8.0: 코어에 도달한 적이 붙어서 지속 타격) + 산병의 원거리 사격(§8.③).
  // 산병은 붙지 않고 standoff 거리에서 쏘므로 피해가 절반이다 — BALANCE §1 "산병 원거리 사격
  // 피해 1/s" (감독 #6 ③ 등재, 잡몹 근접 2/s의 절반 = 원거리의 대가). 자동 회복 없음
  // **보스만 점타다** (BALANCE §1 "보스 코어 타격 10/히트, 4s 간격 = 실효 2.5/s") — `coreHit`을 든
  // 적은 연속 DPS 경로를 아예 안 탄다. 같은 2.5/s를 연속으로 흘리면 "한 대 맞았다"가 화면에서 안 읽히고,
  // §1이 유도하는 "보스 도달 = 정해진 시간 안에 잡아야 함"의 리듬도 사라진다.
  // 보스는 코어에 **붙지 않는다** — 루프 반경 0.5에서 멈춰(firing) 원거리로 점타한다(DESIGN §6)
  let dmg = 0;
  // **바위 투척 착탄** (DESIGN §0.6 B3 크롤러) — enemy.ts가 쌓아 둔 우편함을 이 프레임에 비운다.
  // 장부는 **보스 계정**이다(점타와 같은 자리): §5 보스전 검산의 분자가 「보스가 뽑아간 값」이라
  // 잡몹 계정으로 보내면 관문의 위험도가 통째로 안 보인다. 히트 수도 점타와 같은 칸에 센다
  if (f.rockPending > 0) {
    dmg += f.rockPending;
    c.bossCoreHits++;
    c.coreDmgBoss += f.rockPending;
    recordCoreDamage(c, "rock", f.rockPending);
    c.shake = SHAKE_TTL;
    spawnFx(c.fx, "explode", map.cx, map.cy, { size: ENEMY.coreReach });
    f.rockPending = 0;
  }
  // **지형 분쇄** (§0.6 B3 크롤러 "전방 성벽·건물을 밀어 새 길을 연다"). 오우거의 성벽 파괴와
  // **같은 경로**(damageTerrain + terrainDirty)를 쓰되 한 번에 원 안을 통째로 민다 —
  // 그 프레임에 플로우필드가 다시 구워져 뒤따르는 잡몹의 진입선이 실제로 바뀐다(§4.2)
  if (f.quakeAt) {
    const qa = f.quakeAt;
    // **§0.7 J2의 세 번째 자물쇠** (iter105). `breakWalls`(개체)·`siegeWalls`(대형)와 같은 이른
    // 반환이 여기에도 있어야 한다 — 보스 패턴은 종도 대형도 아니라 앞의 둘을 둘 다 비켜 간다.
    // 도시 풀런에서 이 줄이 없어 `breakerDemolished`가 9까지 올라갔다(맵 규칙이 패턴을 이긴다).
    // 화면 흔들림은 남긴다 — 「패턴이 돌았다」는 신호는 지형과 무관하다
    if (c.enemyBreaks) {
      for (const t of map.terrain) {
        if (t.destroyed || !Number.isFinite(t.hp)) continue;
        if (Math.hypot(t.x - qa.x, t.y - qa.y) > qa.r + t.r) continue;
        if (damageTerrain(c, t, t.hp)) c.breakerDemolished++;
        spawnFx(c.fx, "explode", t.x, t.y, { size: t.r * 0.9 });
      }
    }
    c.shake = SHAKE_TTL;
    f.quakeAt = null;
  }
  for (const e of f.list) {
    const hit = ENEMY_STATS[e.kind].coreHit;
    if (hit) {
      if (!e.atCore && !e.firing) continue;
      e.coreCd -= dt;
      if (e.coreCd > 0) continue;
      e.coreCd = hit.everySec;
      markEnemyAction(e, f.t, e.firing ? "shot" : "melee");
      dmg += hit.dmg;
      recordCoreDamage(c, `${isBossKind(e.kind) ? "boss" : "impact"}:${e.kind}`, hit.dmg);
      // **점타는 보스만의 것이 아니게 됐다** (§8.⑥ 공성 램). 보스 계정(bossCoreHits·coreDmgBoss)은
      // 보스전 손실 구간의 분자라 램의 한 방이 섞이면 §5 검산의 「보스가 뽑아간 값」이 부풀어
      // 오독된다 — 램은 잡몹 계정으로 간다(같은 점타 경로를 쓰되 장부가 갈린다)
      if (isBossKind(e.kind)) {
        c.bossCoreHits++;
        c.coreDmgBoss += hit.dmg;
      } else c.coreDmgMob += hit.dmg;
      c.shake = SHAKE_TTL; // 한 방짜리 타격은 화면이 흔들린다 (착탄과 같은 문법)
      continue;
    }
    // **자폭** (§8.⑤ 폭격 박쥐). 세 번째 코어 피해 경로다 — 보스 점타(간격마다 한 번)도
    // 잡몹 지속(붙어서 초당)도 아닌 **한 번뿐인 한 방**이고, 그 뒤 개체가 사라진다.
    // 아래 `boomed` 정리에서 리스트에서 빠지는데 **드랍도 처치 수도 안 붙는다** —
    // §2의 수입은 «처치»의 대가이고 이 개체는 처치된 것이 아니라 제 몫을 다 하고 소진된 것이다
    // (= 박쥐를 놓치면 코어와 지갑이 함께 상한다)
    const sui = ENEMY_STATS[e.kind].suicide;
    if (sui) {
      if (!e.atCore) continue;
      const d = sui.dmg * coreDpsMult();
      markEnemyAction(e, f.t, "explode");
      recordCoreDamage(c, `suicide:${e.kind}`, d);
      dmg += d;
      c.coreDmgMob += d;
      f.boomed++;
      f.boomDmg += d;
      e.boomed = true;
      spawnFx(c.fx, "explode", e.x, e.y, { size: ENEMY.size * DEATH_FX });
      c.shake = SHAKE_TTL * 0.5;
      continue;
    }
    // **설치된 폭탄** (§8.⑥ 폭파공작원의 산물). 네 번째 코어 피해 경로다 — 개체가 코어에 «붙어
    // 있는데도» 갉지 않고 도화선만 센다. 0이 되면 한 번에 넣고 사라진다(드랍·처치 수 없음:
    // 자폭과 같은 `boomed` 정리 경로를 탄다). 그 전에 사격으로 HP를 지우거나 클릭으로 해체하면
    // 여기까지 오지 않는다 = 이 적의 값은 **방치의 대가**에만 있다
    const fz = ENEMY_STATS[e.kind].fuse;
    if (fz) {
      e.fuseT -= dt;
      if (e.fuseT > 0) continue;
      const d = fz.dmg * coreDpsMult();
      markEnemyAction(e, f.t, "explode");
      recordCoreDamage(c, `bomb:${e.kind}`, d);
      dmg += d;
      c.coreDmgMob += d;
      f.blasted++;
      f.blastDmg += d;
      e.boomed = true;
      spawnFx(c.fx, "explode", e.x, e.y, { size: ENEMY.size * DEATH_FX });
      c.shake = SHAKE_TTL;
      continue;
    }
    // **정찰 드론은 코어를 못 친다** (§8.⑤ "공격 없음"). 방치의 대가는 이번 웨이브가 아니라
    // 다음 웨이브의 HP 배수로 온다(enemy.ts scoutBuild) — 그것이 "우선 처치 강요"의 뜻이다
    if (ENEMY_STATS[e.kind].scout) continue;
    // §0.5: 개체당 코어 DPS 배율. 보스 점타는 위 분기(coreHit)에서 이미 빠져나갔으므로
    // 이 배율을 안 탄다(§5 스탯 유지)
    // **갉기** (§8.⑥ 공성충): 코어에 붙은 동안의 지속 피해가 잡몹 2/s **대신** 이 값이 된다
    const gn = ENEMY_STATS[e.kind].gnaw;
    if (gn && e.atCore) f.gnawSec += dt;
    const mob = (e.atCore ? (gn ?? CORE.enemyDps) : e.firing ? CORE.skirmisherDps : 0) * coreDpsMult() * dt;
    if (mob > 0) markEnemyAction(e, f.t, e.atCore ? "melee" : "shot");
    recordCoreDamage(c, `${e.atCore ? "melee" : "ranged"}:${e.kind}`, mob);
    dmg += mob;
    c.coreDmgMob += mob;
  }
  // 자폭체 정리 — 사망 필터(위)를 이미 지난 뒤라 여기서 직접 뺀다. 잔상은 남긴다(사라진 것이 보여야 한다)
  if (f.list.some((e) => e.boomed)) {
    for (const e of f.list) if (e.boomed) addCorpse(f, e);
    f.list = f.list.filter((e) => !e.boomed);
  }
  // 보스전 **구간만**의 손실률을 재려면 교전 개시 프레임의 누적치를 남겨야 한다 (큐 2)
  if (f.bossEngageT !== null && c.bossFightBase === null) c.bossFightBase = { boss: c.coreDmgBoss, mob: c.coreDmgMob };
  if (dmg) {
    c.coreHp -= dmg;
    if (c.coreImpact.age >= 0.65 || (dmg >= 2 && c.coreImpact.age >= 0.12)) {
      c.coreImpact = { age: 0, serial: c.coreImpact.serial + 1, heavy: dmg >= 2 };
    }
    if (c.coreHp <= 0) {
      c.coreHp = 0;
      c.over = true;
    }
  }

  for (const s of c.shots) s.t += dt;
  c.shots = c.shots.filter((s) => s.t < shotTtl(s.kind));
  // 총구 섬광·히트 마커도 같은 자리에서 늙는다 (§0.6 G · 둘 다 연출 전용이라 순서가 판정과 무관하다)
  for (const m of c.muzzles) m.t += dt;
  c.muzzles = c.muzzles.filter((m) => m.t < FX_RULE.flashSec);
  for (const m of c.marks) m.t += dt;
  c.marks = c.marks.filter((m) => m.t < FX_RULE.mark.sec);
  // 데미지 숫자도 같은 자리에서 늙는다 (§0.7 H3 · 연출 전용). 퇴장하는 값을 분포에 적립하므로
  // `filter` 한 줄로 못 줄인다 — 그 적립이 색 구간 경계의 유일한 근거다
  if (c.dmgNums.length) {
    if (c.dmgNums.length > c.dmgLiveMax) c.dmgLiveMax = c.dmgNums.length;
    const live: DmgNum[] = [];
    for (const d of c.dmgNums) {
      d.t += dt;
      if (d.t < DMG_NUM.sec) live.push(d);
      else recordDmgNum(c, d.amt);
    }
    c.dmgNums = live;
  }
  for (const b of c.blasts) b.t += dt;
  c.blasts = c.blasts.filter((b) => b.t < BLAST_TTL);
  if (c.shake > 0) c.shake = Math.max(0, c.shake - dt);
  updateFx(c.fx, dt, train);
}

/** 조준 포격 연출 (§6.2 "클릭 → 조준원 표시 → 착탄 폭발"). 전부 월드 좌표 */
function drawArtillery(ctx: CanvasRenderingContext2D, c: Combat): void {
  const r = ARTILLERY.radius * c.unit;

  // 커서 조준 보조: 착탄 반경 + 발사 가능 여부(색)만. **남은 쿨다운은 HUD 패널이 그린다**(큐 1) —
  // 커서 원호는 조준 중일 때만 보여서 "언제 다시 쏠 수 있나"를 물으려면 마우스를 맵에 올려야 했다
  if (c.aim && !c.over) {
    const ready = c.artCd <= 0;
    ctx.strokeStyle = ready ? "#ffd24a" : "#ffffff55";
    ctx.lineWidth = ready ? 2 : 1.5;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(c.aim.x, c.aim.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 비행 중 조준원: 바깥 원은 착탄 범위, 안쪽 원이 조여들며 남은 시간을 알린다
  for (const s of c.strikes) {
    const k = 1 - s.t / ARTILLERY.delaySec;
    ctx.strokeStyle = "#ff9b3d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * k, 0, Math.PI * 2);
    ctx.stroke();
    for (const a of [0, 0.5, 1, 1.5]) {
      const dx = Math.cos(a * Math.PI);
      const dy = Math.sin(a * Math.PI);
      ctx.beginPath();
      ctx.moveTo(s.x + dx * r * 0.75, s.y + dy * r * 0.75);
      ctx.lineTo(s.x + dx * r * 1.25, s.y + dy * r * 1.25);
      ctx.stroke();
    }
  }

}

/** 착탄 충격파 링 — 조준 포격과 곡사가 함께 쓴다 (반경은 Blast.r).
 * 불덩이 자체는 폭발 스프라이트(fx.ts)가 맡는다. 여기 남은 링은 **판정 반경을 알리는 정보**다 —
 * 그림만으로는 "어디까지 맞았나"가 안 보인다 (감독 #5 V2에서 채운 원을 스프라이트로 교체) */
function drawBlasts(ctx: CanvasRenderingContext2D, c: Combat): void {
  const cells = new Set<string>();
  // Artillery owns the full impact ring; automatic splash uses broken dust arcs.
  for (const b of [...c.blasts].sort((a, b) => Number(!!b.hero) - Number(!!a.hero))) {
    const cell = `${Math.floor(b.x / 72)},${Math.floor(b.y / 72)}`;
    if (!b.hero && cells.has(cell)) continue;
    cells.add(cell);
    const k = b.t / BLAST_TTL;
    ctx.save();
    ctx.globalAlpha = (1 - k) * (b.hero ? 0.8 : 0.32) * (getEffectSettings().reducedEffects ? 0.65 : 1);
    ctx.strokeStyle = b.hero ? "#ffe0a0" : "#bcb196";
    ctx.lineWidth = b.hero ? 2 + 3 * (1 - k) : 2;
    ctx.beginPath();
    if (b.hero) ctx.arc(b.x, b.y, b.r * (0.75 + 0.8 * k), 0, Math.PI * 2);
    else for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + b.x * 0.01;
      ctx.moveTo(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r);
      ctx.arc(b.x, b.y, b.r, a, a + 0.75);
    }
    ctx.stroke(); ctx.restore();
  }
}

/** 비행 중인 곡사 포탄 (§6 "탄속 느림"이 눈에 보여야 한다).
 * 지면에 그림자, 포물선 높이만큼 띄운 자리에 포탄 — 판정은 지면 좌표 하나뿐이다 */
function drawShells(ctx: CanvasRenderingContext2D, c: Combat): void {
  for (const sh of c.shells) {
    const k = sh.t / sh.dur;
    const gx = sh.x0 + (sh.x - sh.x0) * k;
    const gy = sh.y0 + (sh.y - sh.y0) * k;
    const h = 4 * k * (1 - k) * SHELL_ARC;
    ctx.fillStyle = "#00000033";
    ctx.beginPath();
    ctx.ellipse(gx, gy, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save(); ctx.translate(gx, gy - h);
    if (sh.kind === "missile" || sh.kind === "mlrs") {
      // Flight tangent includes the arc height: rockets visibly dive toward the target.
      ctx.rotate(Math.atan2(sh.y - sh.y0 - 4 * (1 - 2 * k) * SHELL_ARC, sh.x - sh.x0));
      const scale = sh.kind === "mlrs" ? 0.75 : 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#302e29"; ctx.fillRect(-10, -4, 17, 8);
      ctx.fillStyle = "#b8bca8"; ctx.fillRect(-7, -3, 13, 6);
      ctx.fillStyle = "#d8c396"; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(12, 0); ctx.lineTo(6, 3); ctx.fill();
      ctx.fillStyle = "#665d47"; ctx.fillRect(-9, -6, 5, 12);
      ctx.fillStyle = "#efb967"; ctx.fillRect(-15, -2, 6, 4);
    } else {
      ctx.fillStyle = sh.kind === "incendiary" ? "#855039" : "#383d38";
      ctx.strokeStyle = "#bfb58e"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, sh.kind === "flak" ? 6 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#d1c7a0"; ctx.fillRect(-3, -4, 3, 2);
    }
    ctx.restore();
    // 착탄 예정 지점 — 곡사가 "어디에 떨어질지"가 보여야 이동 표적을 놓치는 이유가 읽힌다
    ctx.strokeStyle = "#d4c38b66";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 12]);
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, (weaponOf(sh.car)?.splash ?? 0) * c.unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 필드 드랍 (§7.1). 지면 레이어라 열차·적보다 **아래**에 그린다 — main.ts가 drawMap 직후에 부른다.
 * scrap 스프라이트는 알파가 없어(sheet-terrain-v1) 반드시 drawTile로 그려야 사각 이음새가 안 보인다 */
export function drawDrops(ctx: CanvasRenderingContext2D, c: Combat): void {
  const glints = new Set<string>(), budget = getEffectSettings().reducedEffects ? 8 : 20;
  for (const d of c.drops) {
    const pop = Math.min(1, d.t / DROP_POP);
    drawTile(ctx, "scrap", d.x, d.y, COLLECT.size * pop);
    // 골드 스파클 (감독 #5 V2). 스폰이 아니라 드랍 위에서 계속 도는 연출이라 loopFrame을 쓴다 —
    // 스크랩 타일은 채도가 낮아 잔디 위에서 눈에 안 띈다
    const key = `${Math.floor(d.x / 56)},${Math.floor(d.y / 56)}`;
    if (glints.size < budget && !glints.has(key)) {
      glints.add(key);
      drawGlow(ctx, loopFrame("sparkle", d.t), d.x, d.y, FX.sparkle.size * pop * 0.65, 0.4);
    }
  }
}

/** 화염 지대 (소이탄 §6.1 "지속 피해·지역 거부"). **판정 반경을 그대로 그린다** — 화염방사 부채꼴과
 * 같은 이유로, 어디가 위험한지가 안 보이면 "지역 거부"라는 정체가 화면에서 사라진다.
 * 지면 레이어라 적·열차보다 **아래**다(main.ts가 drawDrops 옆에서 부른다) */
export function drawFires(ctx: CanvasRenderingContext2D, c: Combat): void {
  for (const z of c.fires) {
    const k = Math.min(1, (1 - z.t / z.dur) * 3);
    ctx.save();
    ctx.fillStyle = `rgba(42, 25, 17, ${0.26 * k})`;
    ctx.strokeStyle = `rgba(224, 119, 51, ${0.38 * k})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Small separated embers leave bodies readable and keep the true hazard edge.
    const count = getEffectSettings().reducedEffects ? 7 : 13;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + z.x * 0.03;
      const r = z.r * Math.sqrt((i + 0.5) / count) * 0.9;
      const pulse = getEffectSettings().reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(z.t * 10 + i * 3);
      const x = Math.round(z.x + Math.cos(a) * r), y = Math.round(z.y + Math.sin(a) * r);
      ctx.globalAlpha = k * (0.55 + 0.35 * pulse);
      ctx.fillStyle = "#d86c2c"; ctx.fillRect(x - 3, y - 3 - pulse * 5, 5, 7 + pulse * 5);
      ctx.fillStyle = "#f5cd78"; ctx.fillRect(x - 1, y - 2, 2, 3);
    }
    ctx.restore();
  }
}

/** 산성 웅덩이 (§8.⑦ 산성 슬라임). 화염 지대와 **같은 자리·같은 이유**로 판정 반경을 그대로
 * 그린다 — 어디가 녹고 있는지가 안 보이면 «적이 내 엄폐물을 지우고 있다»가 화면에서 사라진다.
 * 불과 갈리는 것은 색과 합성뿐이다: 불은 가산(lighter)으로 타오르고 산은 **깔린다** */
export function drawAcidPools(ctx: CanvasRenderingContext2D, c: Combat): void {
  for (const z of c.pools) {
    const k = 1 - z.t / z.dur;
    const pulse = 0.92 + 0.08 * Math.sin(z.t * 5 + z.x * 0.05);
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r * pulse);
    g.addColorStop(0, `rgba(190, 255, 90, ${(0.32 * k).toFixed(3)})`);
    g.addColorStop(0.65, `rgba(120, 200, 40, ${(0.25 * k).toFixed(3)})`);
    g.addColorStop(1, "rgba(60, 120, 20, 0)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 연막 (§8.⑧ 연막차). 화염·산성과 **다른 레이어**다 — 저 둘은 지면에 깔린 지대라 유닛 아래지만
 * 연막은 공중에 뜬 것이라 **적 위**에 덮인다(그래서 main.ts가 drawField 뒤에 부른다).
 * 판정 반경을 그대로 그린다: 어디가 안 맞는지가 안 보이면 「직사를 다른 데로 돌린다」를 못 고른다.
 * 불투명하게 덮으면 안에 든 적이 화면에서 사라지므로 **가장자리만 짙게** 깐다 */
export function drawSmoke(ctx: CanvasRenderingContext2D, c: Combat): void {
  const alpha = getEffectSettings().reducedEffects ? 0.24 : 0.42;
  for (const z of c.smokes) {
    // 태어날 때 부풀고 사라질 때 옅어진다 — 남은 수명이 «언제 다시 직사가 통하나»의 표시다
    const k = Math.min(1, z.t * 2) * Math.min(1, (1 - z.t / z.dur) * 3);
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, `rgba(190, 190, 195, ${(0.30 * k * alpha).toFixed(3)})`);
    g.addColorStop(0.7, `rgba(155, 155, 162, ${(0.42 * k * alpha).toFixed(3)})`);
    g.addColorStop(1, "rgba(120, 120, 128, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 이펙트 레이어 (감독 #5 V2). 열차·적보다 위 — main.ts가 drawCombat 뒤에 부른다 */
export function drawEffects(ctx: CanvasRenderingContext2D, c: Combat): void {
  drawFx(ctx, c.fx);
  // 부채꼴 티어 심도 **이펙트보다 위**다 — 이유는 drawConeCores 주석(flame 스프라이트가 덮는다)
  drawConeCores(ctx, c);
  // 히트 마커는 **이펙트보다도 위**다 — 스파크(가산 불덩이)가 같은 자리에 같은 크기로 뜨므로
  // 아래에 그리면 통째로 덮인다(첫 컷 실측). 「어느 개체가 맞았나」는 그 불덩이 위에서 읽혀야 한다
  drawMarks(ctx, c);
  // 데미지 숫자는 **맨 위**다 — 읽으라고 띄우는 글자라 무엇에도 가리면 안 된다 (§0.7 H3)
  drawDmgNums(ctx, c);
}

/** 데미지 숫자의 글꼴. `cards.ts`와 같은 규약으로 **파일 안의 지역 상수**다 —
 * `hud.ts`의 `FONT`를 끌어오면 combat → hud 런타임 순환이 생긴다(hud는 combat을 타입으로만 본다) */
const DMG_FONT = "system-ui, sans-serif";

/** **데미지 숫자** (§0.7 H3 「때린 느낌이 없는 첫 번째 이유는 맞은 값이 화면에 안 나오기 때문이다」).
 * 자리는 히트 마커와 같은 이유로 `drawEffects` 안 `drawFx` **뒤**다(iter91 함정 — 스파크가 덮는다).
 *
 * **3패스**인 것은 iter91의 「어두운 밑선 → 밝은 심」 규약을 글자로 옮긴 것이다:
 *  ⓐ 치명타만 — 굵은 바깥 테두리(`critInk`). 구간색을 **갈아치우지 않는** 이유는 DMG_NUM 주석에 있다
 *  ⓑ 어두운 밑선 — 잔디(#58a040) 위에서 백·금이 그냥 「밝아진 잔디」가 되는 것을 막는다
 *  ⓒ 구간색 채움 — 값이 클수록 뜨거운 색 (백 → 청 → 금 → 주황)
 * 좌표는 월드다(카메라 변환 안) — 글자 크기 `DMG_NUM.size`도 월드 단위라 `mark.r`과 같은 규약이다 */
function drawDmgNums(ctx: CanvasRenderingContext2D, c: Combat): void {
  if (!c.dmgNums.length) return;
  const D = DMG_NUM;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // Keep one most recent/critical value per screen region; damage records stay untouched.
  const groups = new Map<string, DmgNum>();
  for (const d of c.dmgNums) {
    const key = `${Math.floor(d.x / 62)},${Math.floor(d.y / 46)}`;
    const previous = groups.get(key);
    if (!previous || (d.crit && !previous.crit) || (d.crit === previous.crit && d.t < previous.t)) groups.set(key, d);
  }
  const reduced = getEffectSettings();
  const visible = [...groups.values()].sort((a, b) => Number(b.crit) - Number(a.crit) || a.t - b.t).slice(0, reduced.reducedEffects ? 8 : 16);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  for (const d of visible) {
    const k = d.t / D.sec;
    const size = D.size * (d.crit ? D.critScale : 0.88);
    // 떠오름은 **등속**이다. 감속(k^0.6)으로 두면 먼저 뜬 숫자가 느려져 **나중 것이 따라잡아
    // 겹친다** — 스폰 때 벌려 둔 사다리 간격이 공중에서 무너진다(iter102 실측: 20.4월드로 벌린
    // 둘이 7px까지 붙었다). 등속이면 그 간격이 수명 내내 그대로다
    const y = d.y - (reduced.reducedMotion ? 0 : D.rise * k);
    ctx.globalAlpha = Math.min(1, (1 - k) / D.fade);
    ctx.font = `bold ${size.toFixed(1)}px ${DMG_FONT}`;
    const txt = String(Math.max(1, Math.round(d.amt)));
    const halfWidth = ctx.measureText(txt).width / 2 + 4;
    if (placed.some((p) => Math.abs(p.x - d.x) < p.w + halfWidth && Math.abs(p.y - y) < p.h + size * 0.6)) continue;
    placed.push({ x: d.x, y, w: halfWidth, h: size * 0.6 });
    const bi = bandOf(d.amt);
    if (d.crit) {
      ctx.strokeStyle = D.critInk;
      ctx.lineWidth = size * D.stroke.crit;
      ctx.strokeText(txt, d.x, y);
    }
    ctx.strokeStyle = "#140d04";
    ctx.lineWidth = size * D.stroke.edge;
    ctx.strokeText(txt, d.x, y);
    ctx.fillStyle = D.ink[bi];
    ctx.fillText(txt, d.x, y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 화염방사 부채꼴 (§6.1 "근거리 부채꼴"). **판정 범위를 그대로 그린다** — 사거리 0.4는 화면에서
 * 89월드밖에 안 돼서, 어디까지 닿는지가 안 보이면 "초크 전용"이라는 정체가 화면에서 사라진다.
 * 불덩이 질감은 fx의 flame 스프라이트가 맡고 여기 있는 것은 **범위 정보**다 (착탄 링과 같은 역할).
 *
 * **화염방사의 3단은 이 부채꼴 하나가 겸한다** (§0.6 G ⓐ의 8종 예시에 화염방사가 없는 이유 · iter92):
 * 발사 = 부채꼴 **뿌리**(총구 화염 스프라이트를 따로 안 띄운다 — 부채꼴이 총구에서 난다) ·
 * 탄도 = 부채꼴 몸통 · 착탄 = `impact 9` 스파크 + 히트 마커. 그래서 §0.6 G ⓑ의 **티어 색 단계는
 * 뿌리가 든다** — 다른 무기의 「바깥 = 무기색 · 심 = 티어색」 2겹 규칙을 반경 방향으로 옮긴 것이다
 * (안쪽 = 티어색 → 중간 = 무기색 → 바깥 = 투명). 크기는 사거리·반각이 정하므로 **판정값이고
 * 티어로 안 커진다** — 화염방사에서 티어는 오직 색으로 읽힌다 */
function drawFlameCones(ctx: CanvasRenderingContext2D, c: Combat): void {
  for (const s of c.shots) {
    const w = WEAPONS[s.kind];
    if (!w?.cone) continue;
    const a = 1 - s.t / shotTtl(s.kind);
    const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    const r = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const half = (w.cone * Math.PI) / 180;
    const tf = tfx(s.tier);
    const g = ctx.createRadialGradient(s.x0, s.y0, 0, s.x0, s.y0, r);
    g.addColorStop(0, `rgba(${tf.color}, ${(0.5 * a * tf.alpha).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(${wfx(s.kind).color}, ${(0.3 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(214, 62, 24, 0)`);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.arc(s.x0, s.y0, r, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** **부채꼴의 티어 심** (§0.6 G ⓑ). 축을 따라 좁은 부채꼴 한 장을 티어색으로 덧그린다 —
 * 궤적의 「바깥 = 무기색 · 심 = 티어색」 2겹 규칙을 각도로 옮긴 것이다.
 *
 * ⚠ **이펙트 레이어보다 위에서, 가산이 아닌 일반 합성으로 그린다** — 둘 다 실측이 강제한 것이다:
 *  ⓐ 화염방사의 화면을 지배하는 것은 부채꼴이 아니라 `flame` **스프라이트**이고 그것은 drawFx가
 *    나중에 그린다. 부채꼴과 함께 아래에 그리면 스프라이트가 티어색을 통째로 덮는다
 *    (히트 마커를 fx 위로 올린 iter91과 **같은 이유·같은 자리**다).
 *  ⓑ 그 스프라이트는 포화된 주황이라 가산으로 얹으면 무슨 색을 올려도 흰색으로 클리핑된다
 *    (아래에 가산으로 그린 컷의 R−B가 T1 107.7 · T2 105.9 — `tools/pixel.mjs` 실측). */
function drawConeCores(ctx: CanvasRenderingContext2D, c: Combat): void {
  for (const s of c.shots) {
    const w = WEAPONS[s.kind];
    if (!w?.cone) continue;
    const a = 1 - s.t / shotTtl(s.kind);
    const tf = tfx(s.tier);
    const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    const r = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const half = ((w.cone * Math.PI) / 180) * FX_RULE.coneCore;
    const gc = ctx.createRadialGradient(s.x0, s.y0, 0, s.x0, s.y0, r);
    gc.addColorStop(0, `rgba(${tf.color}, ${(0.5 * a * tf.alpha).toFixed(3)})`);
    gc.addColorStop(1, `rgba(${tf.color}, 0)`);
    ctx.save();
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.arc(s.x0, s.y0, r, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** 테슬라 전호 (§6.1 "전호가 지형을 타넘음"). 곧은 선이면 레일건과 구분이 안 되므로 **지그재그**로
 * 꺾는다. 꺾이는 폭은 난수가 아니라 선분 좌표에서 유도한다 — 스크린샷 QA가 재현돼야 한다 */
function drawArcBolts(ctx: CanvasRenderingContext2D, c: Combat): void {
  for (const s of c.shots) {
    const fx = wfx(s.kind);
    if (fx.style !== "bolt") continue;
    const tf = tfx(s.tier);
    const a = (1 - s.t / fx.ttl) * tf.alpha;
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const seg = 5;
    const jit = (i: number) => Math.sin((s.x0 + s.y1) * 0.11 + i * 2.1) * len * 0.06;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // 바깥(무기색 후광) → 심(티어색). 다른 무기의 2겹 규칙과 같은 순서다
    for (const [wdt, col] of [
      [fx.px * tf.px * 2.8, `rgba(${fx.color}, 0.42)`],
      [fx.px * tf.px, `rgba(${tf.color}, 0.95)`],
    ] as const) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = col;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      for (let i = 1; i < seg; i++) {
        const t = i / seg;
        // 좌표에서 유도한 결정적 흔들림 (±len의 6%)
        const j = jit(i);
        ctx.lineTo(s.x0 + dx * t + nx * j, s.y0 + dy * t + ny * j);
      }
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
    // **전호 분기** (§0.6 G ⓐ 「테슬라 = 전호 분기」). 본선의 마디에서 갈라져 나가 **아무 데도 안 닿는**
    // 짧은 가지다 — 판정은 한 자리도 안 본다(체인이 닿는 적은 자기 shot을 따로 낸다).
    // 각·길이는 난수가 아니라 좌표에서 유도한다(이 코드베이스에는 Math.random이 없다)
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = `rgba(${tf.color}, 0.85)`;
    ctx.lineWidth = Math.max(1, fx.px * tf.px * 0.55);
    ctx.beginPath();
    for (let b = 0; b < fx.branch; b++) {
      const t = (b + 1) / (fx.branch + 1);
      const bx = s.x0 + dx * t + nx * jit(b + 1);
      const by = s.y0 + dy * t + ny * jit(b + 1);
      const sg = b % 2 === 0 ? 1 : -1;
      const bl = len * 0.22;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (dx / len) * bl * 0.4 + nx * sg * bl, by + (dy / len) * bl * 0.4 + ny * sg * bl);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** **탄도 단** (§0.6 G ⓐ). 선을 그리는 무기 전부가 이 한 함수를 지난다 — 무기별 색·굵기·수명은
 * `WEAPON_FX`가, 티어색은 `TIER_FX`가 준다. 부채꼴(화염방사)·전호(테슬라)는 형태가 아예 달라
 * 위에서 따로 그린다.
 *
 * **2겹인 것이 이 항목의 규칙이다**: 바깥 = 무기색(무엇이 쏘는가) · 심 = 티어색(얼마나 센가).
 * 한 선을 티어색으로 통째로 칠하면 T2 레일건과 T2 저격포가 같은 선이 되어 §0.6 G ⓐ가 무너지고,
 * 반대로 무기색만 쓰면 ⓑ(티어 색 단계)가 화면에 없다.
 *  · beam   = 사거리 끝까지 2겹으로 이어진 선 (레일건 관통 · 레이저 지속)
 *  · tracer = 가는 무기색 선 + **표적 쪽 끝의 짧은 티어색 머리**(head 월드) = 예광 */
function drawTracers(ctx: CanvasRenderingContext2D, c: Combat): void {
  ctx.lineCap = "round";
  for (const s of c.shots) {
    const fx = wfx(s.kind);
    if (fx.style !== "beam" && fx.style !== "tracer") continue; // cone·bolt·shell은 자기 함수가 있다
    const tf = tfx(s.tier);
    const k = 1 - s.t / fx.ttl;
    const px = fx.px * tf.px;
    ctx.globalAlpha = k * tf.alpha;
    if (fx.style === "beam") {
      // 굵기·밝기가 수명과 함께 줄되 **0으로 안 간다** — 선형으로 죽이면 빔의 뒷절반이 잔디 위에서
      // 사라져 「지속 빔」(레이저 10/s)이 옅은 얼룩으로 읽힌다(첫 컷 실측). 하한을 둔 것이 그 답이다
      ctx.globalAlpha = (0.4 + 0.6 * k) * tf.alpha;
      // **잔상** (§0.7 L ⓐ) — 빔은 선 전체가 이미 남아 있으므로 남는 축이 «폭»이다:
      // 겹마다 더 넓고 더 옅게 깔아 T3 빔이 두꺼운 후광을 두르게 한다. 본선보다 **먼저** 그린다
      for (let i = Math.min(1, lfx(s.tier).ghost); i >= 1; i--) {
        ctx.globalAlpha = (0.4 + 0.6 * k) * tf.alpha * Math.pow(FX_RULE.ghost.fade, i);
        ctx.strokeStyle = `rgba(${fx.color}, 0.8)`;
        ctx.lineWidth = px * (0.55 + 0.45 * k) * Math.pow(1.35, i);
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
      }
      ctx.globalAlpha = (0.4 + 0.6 * k) * tf.alpha;
      ctx.strokeStyle = `rgba(${fx.color}, 0.8)`;
      ctx.lineWidth = px * (0.55 + 0.45 * k);
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
      ctx.strokeStyle = `rgb(${tf.color})`;
      ctx.lineWidth = Math.max(1.2, px * (0.55 + 0.45 * k) * FX_RULE.core);
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
      continue;
    }
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const len = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = `rgba(${fx.color}, 0.85)`;
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
    // 예광의 머리 — 표적 쪽 끝의 head 월드만 티어색으로 굵게. 사거리가 2.6인 저격포도
    // 이 조각 덕에 「한 발이 저기까지 갔다」로 읽힌다(선 전체가 밝으면 레이저와 구분이 안 된다)
    const h = Math.min(fx.head, len);
    if (h > 0) {
      ctx.strokeStyle = `rgb(${tf.color})`;
      ctx.lineWidth = px * 1.9;
      // **잔상** (§0.7 L ⓐ) — 예광은 이미 「끝의 짧은 머리」라 그 머리가 선 위로 뒤에 여러 개
      // 남는 것이 곧 잔상이다. 겹은 `headGap`만큼씩 뒤로 물러나고 옅어진다. 선 길이를 넘는 겹은
      // 그리지 않는다(넘겨 그리면 머리가 총구 뒤로 나가 «칸에서 불꽃이 난다»로 읽힌다)
      for (let i = Math.min(1, lfx(s.tier).ghost); i >= 1; i--) {
        const back = h * FX_RULE.ghost.headGap * i;
        if (back + h > len) continue;
        ctx.globalAlpha = k * tf.alpha * Math.pow(FX_RULE.ghost.fade, i);
        ctx.beginPath();
        ctx.moveTo(s.x1 - (dx / len) * (back + h), s.y1 - (dy / len) * (back + h));
        ctx.lineTo(s.x1 - (dx / len) * back, s.y1 - (dy / len) * back);
        ctx.stroke();
      }
      ctx.globalAlpha = k * tf.alpha;
      ctx.beginPath();
      ctx.moveTo(s.x1 - (dx / len) * h, s.y1 - (dy / len) * h);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** **발사 단**의 티어 표시 (§0.6 G ⓑ). 시트의 `muzzle` 프레임은 한 벌뿐이라 스프라이트만으로는
 * 티어가 안 갈린다 — **포신 끝(뿌리)에 티어색 코어 + 무기색 테두리**를 얹는다.
 * 가산 합성이라 잔디 위에서도 뜬다(§0.6 F와 같은 이유로 옅은 색은 안 보인다).
 * 원이 아니라 **사격 축으로 늘인 타원**이다 — 원으로 그리면 화염을 좁힌 iter93이 도로 무너져
 * 「뾰족한 섬광 + 그 위의 둥근 덩어리」가 된다(가산이라 코어가 화염보다 밝다) */
function drawMuzzles(ctx: CanvasRenderingContext2D, c: Combat): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const m of c.muzzles) {
    const fx = wfx(m.kind);
    const tf = tfx(m.tier);
    const k = 1 - m.t / FX_RULE.flashSec;
    const r = fx.muzzle.flash * tf.size * (0.45 + 0.35 * k);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.a);
    ctx.scale(1, FX_RULE.muzzle.narrow);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${tf.color}, ${(FX_RULE.flashAlpha * k).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(${fx.color}, ${(0.5 * k).toFixed(3)})`);
    g.addColorStop(1, `rgba(${fx.color}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** **히트 마커** (§0.6 G ⓒ 「맞았다는 것이 개체 단위로 읽혀야 한다」).
 * 표적 중심에 **벌어지는 십자**를 얹는다 — 스파크(가산 불덩이)가 «무언가 터졌다»만 말하는 데 비해
 * 이쪽은 중심이 비어 있어 **어느 개체 위에 있는지**가 밀집 대형에서도 읽힌다.
 * 적 위에 그리는 표식이지만 **개체 루프 안이 아니다** — drawCombat은 drawField(적) 뒤에 불리므로
 * 뒤에 그려지는 적이 앞의 마커를 덮는 iter85의 함정을 안 밟는다 */
function drawMarks(ctx: CanvasRenderingContext2D, c: Combat): void {
  const M = FX_RULE.mark, cells = new Set<string>();
  const budget = getEffectSettings().reducedEffects ? 12 : 24;
  ctx.save(); ctx.lineCap = "square";
  for (let n = c.marks.length - 1; n >= 0 && cells.size < budget; n--) {
    const m = c.marks[n], key = `${Math.floor(m.x / 40)},${Math.floor(m.y / 40)}`;
    if (cells.has(key)) continue;
    cells.add(key);
    const k = m.t / M.sec, r = M.r * (0.5 + 0.12 * m.tier) * (1 + 0.25 * k);
    for (const pass of [0, 1]) {
      ctx.globalAlpha = (1 - k) * (pass ? 0.82 : 0.6);
      ctx.strokeStyle = pass ? `rgb(${tfx(m.tier).color})` : "#201b16";
      ctx.lineWidth = pass ? 1.5 : 3.5;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, -1]] as const) {
        ctx.moveTo(m.x + dx * r * 0.5, m.y + dy * r * 0.5);
        ctx.lineTo(m.x + dx * r, m.y + dy * r);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCombat(ctx: CanvasRenderingContext2D, c: Combat): void {
  drawFlameCones(ctx, c);
  drawArcBolts(ctx, c);
  drawTracers(ctx, c);
  drawMuzzles(ctx, c);
  drawArtillery(ctx, c);
  drawShells(ctx, c);
  drawBlasts(ctx, c);

  // 코어 HP는 **HUD 패널이 그린다**(큐 1) — 목업에도 코어 위 막대는 없고, 같은 값을 두 곳에
  // 그리면 어느 쪽이 정본인지가 흐려진다. 여기서는 아무것도 안 그린다
}
