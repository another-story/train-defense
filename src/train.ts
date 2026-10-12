// 레일 경로의 호 길이 파라미터화 + 열차 주행. DESIGN §6.1(편성)·§8.0(열차는 이동 장벽, HP 없음).
// 좌표는 월드 단위. 열차 위치는 "루프를 따라 잰 거리 s(월드)" 하나로만 관리한다 — 각도로 다루면
// 굴곡 루프에서 칸 간격이 구간마다 달라진다.

import { BRANCHES, CAR_KINDS, CAR_TEXT, CARDS, LAYOUT, levelDmgStep, levelRateStep, LOOP_R, MULT, PASSIVE, RENDER, SHOP, SUPPORT, SUPPORT_REACH, tierDmgStep, tierRateStep, TRAIN, WEAPONS, weaponDmgMult, weaponRangeMult, type Weapon } from "./balance";
import type { Vec } from "./map";
import { draw, drawOutline, drawShadow, sprite } from "./sprites";
import { drawWeaponArt } from "./weapon-art";

export type CarKind = (typeof CAR_KINDS)[number];

/** 편성의 칸 1개. **강화 레벨과 사격 상태를 칸이 직접 들고 있다** — 정차역 상점(§7.3)의
 * 재배치·판매가 배열을 뒤섞기 때문에, 레벨·쿨다운·통계를 인덱스 병렬 배열로 두면 한 번의
 * 재배치로 조용히 어긋난다. 칸을 옮기면 그 칸의 모든 것이 함께 따라온다.
 * `level`은 상점 강화 레벨(0 = Lv1 기본, 상한 SHOP.maxLevel) — 피해 배율은 dmgOf()가 만든다 */
export type Car = {
  kind: CarKind;
  level: number;
  /** 무기 티어 1~3 (DESIGN §7.4 "질적 성장"). 획득은 **동일 무기 카드 2장 추가**(선택 카드, cards.ts)뿐이다 —
   * 상점 티어업 구매는 §3에 가격이 있어도 1차 스코프 밖이다.
   * 티어는 **무기 단위**라 카드 1장이 그 무기의 칸 전체를 함께 올린다(cards.ts tierUp).
   * 그 뒤에 새로 산 같은 무기 칸은 T1로 시작한다 — 1차의 의도적 단순화다 */
  tier: number;
  /** 남은 사격 쿨다운(초) */
  cd: number;
  /** 발사 수 · 누적 피해 (probe 검산용) */
  fired: number;
  dealt: number;
  /** 이 칸에 들어간 총액 (칸 값 + 강화에 쓴 값). **판매 환급의 분모다** — BALANCE §3은
   * "판매 = 구매가의 50%"만 적고 강화 투자분을 말하지 않는데, 강화분이 전액 증발하면
   * 강화한 칸은 못 파는 칸이 되어 §7.3이 규정한 "빌드 전환 출구"가 닫힌다(STATUS 미결 질문).
   * 시작 편성의 칸도 §3 표값을 넣어 둔다 — 산 적은 없지만 "구매가"의 기준은 같아야 한다 */
  invested: number;
  /** 포탑이 향한 방향(월드 라디안, 0 = +x). **연출 전용 상태다** — 판정(combat.ts fireOnce)은
   * 이 값을 읽지 않는다. 읽게 하는 순간 "연출을 만지면 밸런스가 바뀐다"가 시작된다.
   * 실제 발사 각도가 우선하고 updateTurrets는 발사 사이의 자세를 유지한다. 초기값은 0이다 */
  turretAng: number;
  /** **T3 진화 분기** id (DESIGN §7.4, balance.ts BRANCHES). null = 아직 안 골랐다.
   * 칸이 들고 있지만 **뜻은 무기 단위다** — 같은 무기의 다른 칸이 이미 고른 갈래가 있으면
   * 새로 T3에 닿은 칸은 그것을 물려받고 묻지 않는다(`pendingBranch`). T3 미만이면 항상 null이다 */
  branch: string | null;
};

export function makeCar(kind: CarKind, level = 0): Car {
  return { kind, level, tier: 1, cd: 0, fired: 0, dealt: 0, invested: SHOP.carPrice[kind] ?? 0, turretAng: 0, branch: null };
}

/** 이 칸의 **실효 무기 스탯** = 기준 스탯(§4) 위에 T3 분기(§7.4)를 덮고 **§0.8 사거리 배율**을 곱한 것.
 * **모든 사격 경로가 이 함수를 거쳐야 한다** — `WEAPONS[car.kind]`를 직접 읽는 코드는 분기를
 * 조용히 무시한다(dmgOf가 §0.5 배율의 유일한 경로인 것과 같은 규약).
 * 분기는 **명목 DPS를 보존한다**: 공속 배수를 `1 / dmg`로 못박아 두었다(balance.ts BRANCHES 불변식).
 *
 * **`weaponRangeMult()`(§0.8 `MULT.range`)의 유일한 경로가 여기다** — `range` **한 칸에만** 곱한다.
 * `splash`·`hitSplash`·`chainJump`·`cone`은 **일부러 안 곱한다**(§0.8: 광역을 안 줄이는 것이 의도다).
 * 분기 배수(`b.range` 0.8~1.4)와는 **곱셈으로 겹친다** — §6 계열표의 상대 관계가 그대로 보존된다.
 * ⚠ 분기가 없어도 **새 객체를 만든다**(옛 코드는 상수 그대로 돌려줬다) — 배율이 걸려야 하기 때문이고,
 * `WEAPONS[k]`와 이 반환값을 `===`로 견주던 코드가 있으면 그 자리에서 깨진다(지금은 없다) */
export function weaponOf(car: Car): Weapon | undefined {
  const w = WEAPONS[car.kind];
  if (!w) return w;
  const rm = weaponRangeMult();
  if (!car.branch) return { ...w, range: w.range * rm };
  const b = BRANCHES[car.kind]?.find((x) => x.id === car.branch);
  if (!b) return { ...w, range: w.range * rm };
  return { ...w, ...b.set, dmg: w.dmg * b.dmg, rate: w.rate / b.dmg, range: w.range * (b.range ?? 1) * rm };
}

/** 그 무기가 이미 고른 분기 (칸 단위로 들고 있지만 뜻은 무기 단위다 — Car.branch 주석) */
export function branchOf(t: Train, kind: CarKind): string | null {
  for (const c of t.cars) if (c.kind === kind && c.branch) return c.branch;
  return null;
}

/** **분기 선택이 밀려 있는 무기** = T3에 닿았는데 아직 안 고른 칸이 있는 무기. 없으면 null.
 * 같은 무기의 다른 칸이 이미 골랐으면 **그 자리에서 물려받고** 묻지 않는다 — 그래서 이 함수는
 * 순수 조회가 아니라 «물려받기 + 조회»다(한 곳에서만 부르는 것이 전제다: main.ts의 프레임 진입).
 * 상태를 따로 안 들고 편성에서 유도하므로 상점 티어업·카드 티어업·`?tier=3`·세이브 복원이
 * 전부 같은 경로로 들어온다 */
export function pendingBranch(t: Train): CarKind | null {
  for (const car of t.cars) {
    if (!WEAPONS[car.kind] || car.tier < CARDS.maxTier || car.branch) continue;
    const b = branchOf(t, car.kind);
    if (b) car.branch = b;
    else return car.kind;
  }
  return null;
}

/** 신규 칸의 **기본 삽입 위치** (DESIGN §6.1 "신규 칸 기본 삽입 위치", 2026-08-21 신설).
 * 꼬리 고정(`cars.push`)이 아니라 **발사 기회를 최대화하는 자리**에 넣는다 — 편성 내 자리에 따라
 * 실효 DPS가 2.5배 갈리고(선두 기관총 25% vs 2번째 10~11%, iter38 실측), 사거리가 짧은 무기일수록
 * 앞자리가 아니면 표적을 아예 못 만난다(화염방사 0.7 · 테슬라 0.8은 코어 거리 1.0에 못 닿는다).
 * 규칙 = **사거리 오름차순** — 짧을수록 선두 쪽. 무기가 아닌 지원칸(수집)은 사거리를 Infinity로 봐 꼬리다.
 * 기관차(0번)는 밀리지 않는다(주포 고정, §6.2). **기존 칸의 순서는 건드리지 않는다** — 정하는 것은
 * 새 칸이 들어갈 한 자리뿐이고, 재배치(무료, §7.3 moveCar)로 플레이어가 덮어쓸 수 있는 기본값이다.
 *
 * **인접 효과를 가진 지원칸(탄약고·관측칸)은 사거리 규칙을 쓰지 않는다** — 사거리를 Infinity로 보면
 * 꼬리에 붙고, 꼬리의 이웃은 보통 같은 지원칸이라 효과가 0이 된다. 같은 원칙("발사 기회 최대화")을
 * 그 칸의 언어로 옮기면 **그 칸의 효과를 실제로 쓸 수 있는 이웃이 가장 많은 자리**다
 * (탄약고 = 무기 전부 / 관측칸 = 직사만 — iter64에서 «무기 이웃»에서 좁혔다) */
export function insertCar(t: Train, car: Car): number {
  const sup = SUPPORT[car.kind];
  if (sup && (sup.rate || sup.overHills)) {
    // 이웃을 «무기인가»가 아니라 **«이 지원칸의 효과를 실제로 쓸 수 있는가»**로 센다 (iter64 실측).
    // 탄약고의 연사 배수는 모든 무기에 걸리지만 관측칸의 사선 면제는 **직사에만** 걸린다 —
    // combat.ts `fireOnce`가 `arc`·`cone`·`chain`을 `sup`을 보기도 전에 return하기 때문이다.
    // 무기 이웃 수만 세면 관측칸이 곡사 옆에 앉아 효과의 절반이 «자리»에서 사라진다
    // (iter64 obs1 seed 1의 실제 편성이 `missile | observer | laser`였다)
    const gains = (x: Car): boolean => {
      const w = weaponOf(x);
      if (!w) return false;
      if (sup.rate) return true; // 탄약고 = 무기면 무엇이든
      return !w.arc && !w.cone && !w.chain; // 관측칸 = 직사만
    };
    let bi = t.cars.length;
    let bn = -1;
    for (let i = 1; i <= t.cars.length; i++) {
      // i에 끼우면 이웃은 i-1번과 (밀려난) 옛 i번이다
      const n = (gains(t.cars[i - 1]) ? 1 : 0) + (i < t.cars.length && gains(t.cars[i]) ? 1 : 0);
      if (n > bn) {
        bn = n;
        bi = i;
      }
    }
    t.cars.splice(bi, 0, car);
    return bi;
  }
  const reach = (c: Car) => weaponOf(c)?.range ?? Infinity;
  const r = reach(car);
  let i = t.cars.length;
  for (let j = 1; j < t.cars.length; j++) {
    if (reach(t.cars[j]) > r) {
      i = j;
      break;
    }
  }
  t.cars.splice(i, 0, car);
  return i;
}

/** 폐곡선 + 구간 누적 길이. cum[i] = 0번 점부터 i번 점까지의 거리, cum[n] = 총 둘레 */
export type Track = { pts: Vec[]; cum: number[]; total: number };

export function buildTrack(loop: Vec[]): Track {
  const n = loop.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = loop[i - 1];
    const b = loop[i % n];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { pts: loop, cum, total: cum[n] };
}

/** 호 길이 s 지점의 좌표와 진행 방향각. s는 둘레로 감긴다 */
export function at(tr: Track, s: number): { x: number; y: number; ang: number } {
  const n = tr.pts.length;
  let d = s % tr.total;
  if (d < 0) d += tr.total;
  let lo = 0;
  let hi = n;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (tr.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = tr.pts[lo];
  const b = tr.pts[(lo + 1) % n];
  const seg = tr.cum[lo + 1] - tr.cum[lo] || 1;
  const t = (d - tr.cum[lo]) / seg;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    ang: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

export type Train = {
  track: Track;
  /** 선두(기관차) 중심의 호 길이 위치 */
  s: number;
  /** 월드/초 */
  speed: number;
  /** 이번 프레임의 **열차 속도 배수** (§8.④ 심연 촉수 · §8.0 "열차 상호작용은 파괴가 아닌 '방해'만
   * 허용"). 1 = 정상. 적의 순간값이라 **매 프레임 enemy.ts가 다시 세운다** — 여기에 상태를 쌓으면
   * 원인(촉수)을 처치해도 감속이 안 풀린다(§8.0 "원인 처치 시 즉시 해제") */
  slow: number;
  /** 이번 프레임에 **무기가 정지된 칸의 인덱스 집합** (§8.⑤ 가고일 · §8.0 "무기 일시 정지").
   * `slow`와 같은 규약이다 — 적의 순간값이라 **매 프레임 enemy.ts가 비우고 다시 채운다**.
   * 여기에 상태를 쌓으면 원인(가고일)을 처치해도 정지가 안 풀린다(§8.0 "원인 처치 시 즉시 해제").
   * **칸 HP가 아니다** — 정지는 사격 루프(combat.ts)가 이 집합을 보고 건너뛰는 것이 전부다 */
  stunned: Set<number>;
  /** 이번 프레임에 **산성으로 성능이 저하된 칸의 인덱스 집합** (§8.③ 산성 뱉기 · §8.0 "무기 성능 저하").
   * `stunned`와 **같은 규약**이고 세기만 다르다 — 정지는 ×0, 산성은 `spit.rate`·`spit.dmg` 배수다.
   * 적의 순간값이라 매 프레임 enemy.ts가 비우고 다시 채운다(원인을 처치하면 그 프레임에 풀린다) */
  acid: Set<number>;
  cars: Car[];
};

/** 칸 중심 간 거리 = 칸 길이 + 간격 */
export const CAR_PITCH = LAYOUT.carLen + TRAIN.carGap;

/** **패시브 4종의 구매 레벨** (DESIGN §0.7 H2 · balance.ts `PASSIVE`). 전 무기칸에 일괄로 걸리는
 * **열차 단위 스탯**이라 칸이 아니라 런이 들고 있어야 한다 — 자리는 `Combat`이다(`artCdMult`·
 * `collectMult`와 같은 부류: 「런 전체에 걸린 배수」의 이미 있는 집). 여기 있는 것은 **레벨**이고
 * 값은 아래 네 함수가 만든다 — 레벨과 값을 둘 다 들면 한쪽이 조용히 낡는다 */
/** `dmg`·`rate`·`crit`·`critDmg`는 **상점에서 산 레벨**(§0.7 H2)이고, `doc*`는 **열차 교리**(balance.ts
 * `DOCTRINES` · 감독 #72 ⑦)가 얹은 **배수**다(기본 1). 둘을 한 자루에 담는 이유는 하나다 —
 * `Passive`는 이미 `dmgOf`·`rateOf`·`critChance`를 통해 **모든 피해 표기의 유일한 경로**이므로
 * 여기 담으면 상점·카드·툴팁·허브·probe의 DPS가 «한 식»(§0.7)을 그대로 유지한다.
 * 새 인자를 스레드하면 그 표기들이 조용히 교리를 빼고 찍는다. */
export type Passive = { dmg: number; rate: number; crit: number; critDmg: number; docDmg: number; docRate: number; docCrit: number };

export function makePassive(): Passive {
  return { dmg: 0, rate: 0, crit: 0, critDmg: 0, docDmg: 1, docRate: 1, docCrit: 1 };
}

const NO_PASSIVE = makePassive();

/** 패시브 공격력 배수 (레벨 × `per`, 가산 → 배수). 레벨 0이면 정확히 1이다 */
function passDmg(p: Passive): number {
  return (1 + p.dmg * PASSIVE.axes[0].per) * p.docDmg;
}
/** 패시브 공격속도 배수. 레벨 0이면 정확히 1이다 */
function passRate(p: Passive): number {
  return (1 + p.rate * PASSIVE.axes[1].per) * p.docRate;
}

/** **치명타 확률** (0~`PASSIVE.critCap`). 상한은 감독 고정 60% — 여기서 자르는 것이 유일한 경로다 */
export function critChance(p: Passive): number {
  return Math.min(PASSIVE.critCap, p.crit * PASSIVE.axes[2].per * p.docCrit);
}

/** **치명타 피해 배수** = 시작 ×1.5 + 레벨 × 0.15 (감독 고정 시작값) */
export function critMult(p: Passive): number {
  return PASSIVE.critBase + p.critDmg * PASSIVE.axes[3].per;
}

/** **실효 DPS 산식의 치명타 항** = `1 + 치확 × (치피 − 1)` (BALANCE §0.7 표).
 * 치명타가 신설 축이라 **명목 DPS 표기가 전부 이 식을 따라야 한다** — 허브·상점·툴팁·probe가
 * `dpsOf`/`trainDps`를 지나므로 이 한 줄이 그 전부의 유일한 출처다 */
export function critFactor(p: Passive): number {
  const ch = critChance(p);
  return 1 + ch * (critMult(p) - 1);
}

/** 단발 피해 = 기준 스탯 × **§0.7-B 배율**(`weaponDmgMult()` = `MULT.dmg` ×3 · QA `?wdmg=`) × **티어의 피해 몫**(`tierDmgStep()`) × **레벨의 피해 몫**(`levelDmgStep()`)
 * × **패시브 공격력**(§0.7 H2). 성장 3축이 여기 한 곳에서만 곱해진다 —
 * ⚠ **티어·레벨은 이제 «총량의 일부»만 여기로 온다**(INBOX #74 ② · 나머지는 `rateOf`로 간다).
 * `CARDS.tierStep`·`SHOP.levelStep`을 여기서 직접 쓰면 한 발이 다시 커진다 —
 * **모든 피해원이 이 함수를 거쳐야** 상점 강화·카드 티어·패시브가 실제로 화력이 된다. 무기가 아닌 칸은 0.
 *
 * `p`를 생략하면 패시브 0단계다 — **판정 경로에서는 생략하지 말 것**(생략하면 §0.7 H2가 조용히 꺼진다).
 * 생략이 맞는 자리는 「패시브를 빼고 본 기준값」을 뜻하는 곳뿐이다(허브 카탈로그·시트 대조표) */
export function dmgOf(car: Car, p: Passive = NO_PASSIVE): number {
  const w = weaponOf(car);
  if (!w) return 0;
  return w.dmg * weaponDmgMult() * Math.pow(1 + tierDmgStep(), car.tier - 1) * Math.pow(1 + levelDmgStep(), car.level) * passDmg(p);
}

/** 공속(발/초) = 기준 스탯 × **§0.5 배율**(MULT.fireRate) × **티어·레벨의 공속 몫**(INBOX #74 ② —
 * 성장의 대부분이 여기로 온다) × **패시브 공격속도**(§0.7 H2). dmgOf가
 * 피해의 유일한 경로인 것과 같은 이유로 **모든 사격원이 이 함수를 거쳐야** 한다 —
 * `WEAPONS[kind].rate`를 직접 읽는 새 코드는 §0.5의 "공속 ×2"를 조용히 무시한다.
 * 단발 피해는 안 건드린다(§0.5 "단발 피해 유지") */
export function rateOf(car: Car, p: Passive = NO_PASSIVE): number {
  const w = weaponOf(car);
  if (!w) return 0;
  return w.rate * MULT.fireRate * Math.pow(1 + tierRateStep(), car.tier - 1) * Math.pow(1 + levelRateStep(), car.level) * passRate(p);
}

/** 칸 1개의 **실효 DPS** = 단발 피해 × 공속 × **치명타 항**(§0.7 `1 + 치확 × (치피 − 1)`).
 * BALANCE §5 검산 "실효 DPS 합 ~80"이 쓰는 단위다 (관통·광역의 실효 보정은 §4 비고의 몫이라
 * 여기서는 곱하지 않는다). 패시브 0단계면 치명타 항이 정확히 1이라 3차까지의 값과 한 자리도 안 갈린다 */
export function dpsOf(car: Car, p: Passive = NO_PASSIVE): number {
  return dmgOf(car, p) * rateOf(car, p) * critFactor(p);
}

/** i번 칸에 붙은 **인접 지원칸 효과** (DESIGN §6.1 "탄약고(인접 연사+) · 관측칸(인접 직사 무기가
 * 언덕 너머 사격)"). 범위는 앞뒤 `SUPPORT_REACH`칸이고 같은 종이 양옆이면 곱연산이다.
 * **캐시하지 않고 읽는 자리에서 센다** — 칸 12개 × 앞뒤 1칸이라 비용이 없고, Car에 얹으면
 * 재배치·판매(§7.3)가 배열을 뒤섞는 한 번에 조용히 낡는다(Car 주석의 인덱스 병렬 배열과 같은 함정) */
export function supportAt(t: Train, i: number): { rate: number; overHills: boolean } {
  let rate = 1;
  let overHills = false;
  for (let j = i - SUPPORT_REACH; j <= i + SUPPORT_REACH; j++) {
    if (j === i || j < 0 || j >= t.cars.length) continue;
    const sup = SUPPORT[t.cars[j].kind];
    if (!sup) continue;
    if (sup.rate) rate *= sup.rate;
    if (sup.overHills) overHills = true;
  }
  return { rate, overHills };
}

/** 편성의 명목 DPS 합. **탄약고의 인접 연사 배수가 여기 곱해진다** — 지원칸이 없던 편성의 값은
 * 한 톨도 안 바뀌고(배수가 전부 1), 탄약고를 끼운 편성만 그만큼 올라간다 */
export function trainDps(t: Train, p: Passive = NO_PASSIVE): number {
  return t.cars.reduce((a, c, i) => a + dpsOf(c, p) * supportAt(t, i).rate, 0);
}

export function makeTrain(track: Track, startS = 0): Train {
  return {
    track,
    s: startS,
    speed: track.total / TRAIN.lapTime,
    slow: 1,
    stunned: new Set(),
    acid: new Set(),
    cars: TRAIN.startCars.map((k) => makeCar(k)),
  };
}

export function updateTrain(t: Train, dt: number): void {
  t.s = (t.s + t.speed * t.slow * dt) % t.track.total;
}

/** i번 칸(0 = 선두)의 호 길이 위치. 뒤 칸은 앞 칸보다 정확히 CAR_PITCH만큼 뒤 = 간격 유지 */
export function carS(t: Train, i: number): number {
  return t.s - i * CAR_PITCH;
}

// 포탑 분리 렌더 (감독 #12 ⑤ — 목업의 칸은 차체와 포탑이 갈려 포탑만 적을 향한다).
// 차체는 `sheet-turret-v1`의 두 장(평판차 / 기관차)을 무기 칸 전체가 공유하고, 포탑만 무기별로 다르다.
// **수집칸은 분리하지 않는다** — 크레인까지 그려진 `sheet-train-v2`의 한 장을 그대로 쓴다(포탑 셀이 없다).
const BODY_OF: Partial<Record<CarKind, string>> = {
  hero: "car_hero",
  collector: "collector",
  // 지원칸 3종(§10 2차). 포탑 셀이 없는 한 장짜리 왜건이라 수집칸과 같은 규칙이다.
  // **REPAIR·OBSERVER는 시트가 가로**라 컷팅 단계에서 세로로 세운다(tools/sprite-names.json `_rotate`)
  ammo: "car_ammo",
  repair: "car_repair",
  observer: "car_observer",
};
// **포탑 셀 이름의 밑동**이다 — 실제로 쓰는 이름은 `turretName()`이 여기에 `_t<티어>`를 붙여 만든다.
// 무기 12종은 티어 시트(감독 #60)에서 T1·T2·T3 세 장이 나오고, 기관차(hero)만 티어 그림이 없다.
const TURRET_OF: Partial<Record<CarKind, string>> = {
  hero: "turret_hero",
  machinegun: "turret_machinegun",
  railgun: "turret_railgun",
  mortar: "turret_mortar",
  flamer: "turret_flamer",
  tesla: "turret_tesla",
  sniper: "turret_sniper",
  laser: "turret_laser",
  // 함포는 iter81까지 hero 캐논을 재사용했다(감독 #40) — 티어 시트에 자기 그림이 들어와 그 자리가 닫혔다
  cannon: "turret_cannon",
  missile: "turret_missile",
  mlrs: "turret_mlrs",
  incendiary: "turret_incendiary",
  flak: "turret_flak",
};

/** 칸의 화면 표기 이름 (§0.6 A2). **화면에 칸 이름을 쓰는 코드는 전부 이것을 거친다** —
 * 상점 구매 격자·편성 목록·HUD 칸 목록·선택 카드·툴팁. 영문 키는 디버그 표기에만 남는다 */
export function carName(kind: CarKind): string {
  return CAR_TEXT[kind]?.name ?? kind;
}

/** 툴팁 본문 (§0.6 A2 「계열 · 명목 DPS · 사거리 · 특성 1줄 · 다음 티어 효과」).
 * `car`를 주면 **그 칸의 실효값**(티어·레벨·T3 분기 반영)을, 안 주면 상점 구매 격자용 **T1 Lv1 기준값**을 낸다.
 * 수치는 하나도 여기서 만들지 않는다 — `weaponOf`·`dmgOf`(= §0.5 배율의 유일한 경로)와 정본 상수만 읽는다 */
export function carTip(kind: CarKind, car?: Car, p: Passive = NO_PASSIVE): string[] {
  const t = CAR_TEXT[kind];
  const out: string[] = [`계열 ${t?.series ?? "—"}`];
  const probe = car ?? makeCar(kind);
  const w = weaponOf(probe);
  if (w) {
    // **명목 DPS 표기는 §0.7의 한 식을 따른다** — `단발 × 연사 × (1 + 치확 × (치피 − 1))` = `dpsOf`.
    // ⚠ **감독 판정 6(DESIGN §0.7 · 2026-08-24)**: 화면(HUD·상점·카드·툴팁)은 **실효 하나만** 쓴다.
    // 옛 코드는 여기서 `w.rate`(§0.5 배율 전 값)를 곱해 **같은 프레임의 편성 행(`dpsOf`)과 두 값**이
    // 됐다(함포 60.0 대 30.0 · 90px 거리 · iter120·121 실측). 「명목」이라는 말은 이제 **이 식**을
    // 가리키고, §4 표 원값을 병기하는 자리는 **허브 도감뿐**이다(showcase/hub.ts)
    out.push(`명목 DPS ${dpsOf(probe, p).toFixed(1)}   ·   사거리 ${Math.round(w.range * LOOP_R)}`);
  }
  if (t) out.push(t.line);
  if (w) {
    // 다음 티어 효과 — 상한에서는 «무엇이 열리는가»를 대신 적는다(§7.4 T3 = 진화 분기 2택)
    out.push(
      probe.tier >= CARDS.maxTier
        ? probe.branch
          ? `T${CARDS.maxTier} · ${BRANCHES[kind]?.find((b) => b.id === probe.branch)?.name ?? probe.branch}`
          : `T${CARDS.maxTier} — 진화 분기 2택`
        : `T${probe.tier} → T${probe.tier + 1}: 피해 +${Math.round(tierDmgStep() * 100)}% · 공속 +${Math.round(tierRateStep() * 100)}%`
    );
  }
  return out;
}

export function bodyName(kind: CarKind): string {
  return BODY_OF[kind] ?? "car_flat";
}
/** 이 칸에 **포탑이 있는가** (수집칸·지원칸은 없다). 그림이 아니라 **규칙**이라 시트를 안 본다 —
 * `turretName()`으로 대신 물으면 「스프라이트가 아직 안 실려 있다」가 「포탑이 없다」로 읽혀
 * 로딩 첫 프레임에 선회·사격이 조용히 죽는다 */
export function hasTurret(kind: CarKind): boolean {
  return !!TURRET_OF[kind];
}

/** 그 칸·그 티어의 포탑 셀 이름 (§0.6 E). 무기 12종 × T1/T2/T3 = 36셀이
 * `sheet-turret-tier-{a,b,c}`에서 나온다 — 티어 문법은 「포신 수·길이 + 장갑 증축, T3만 실루엣 변형」.
 * **폴백은 조용히 두 단계**다: 그 티어의 셀이 없으면 T1, T1도 없으면 밑동 이름(기관차가 그 자리다).
 * 셋 다 없으면 `undefined` — 「포탑이 없는 칸」(수집칸·지원칸)과 같은 값이라 호출부가 안 갈린다 */
export function turretName(kind: CarKind, tier = 1): string | undefined {
  const base = TURRET_OF[kind];
  if (!base) return undefined;
  for (const n of [`${base}_t${tier}`, `${base}_t1`, base]) if (sprite(n)) return n;
  return undefined;
}

/** 포탑 표시 높이(월드). **출력 px 비율이 아니라 시트 축척으로 잰다** — 슬라이서가 셀마다 256px로
 * 따로 줄이므로 출력 px는 셀 간 비교가 불가능하다. 차체 셀 높이를 기준(= LAYOUT.carLen)으로 두면
 * 포탑 베이스 지름(시트 328px)이 차체 폭(338px)과 맞는다. 따로 키우면 마운트 링과 어긋난다.
 * 티어 시트도 **같은 축척**이라(베이스 지름 실측 310~326px) 이 식이 그대로 맞는다 — 표시 베이스 지름은
 * `carLen × 베이스/893`이라 셀이 세로로 길어져도(T3 = 긴 포신) 베이스는 안 커지고 포신만 뻗는다.
 *
 * ⚠ **이 식은 «한 시트 안»에서만 유효하다 — 차체에는 못 쓴다** (iter98 반증). `src` px는 그 셀이
 * **자기 시트**에서 차지하던 크기라, 시트가 다르면 px끼리 비교하는 것 자체가 뜻이 없다. 포탑이
 * 되는 이유는 `car_flat`과 **같은 시트**(`sheet-turret-v1`)거나 티어 시트처럼 **축척을 손으로
 * 맞춰 둔** 경우뿐이다. 차체 4종은 그 조건을 못 채운다 — `car_flat`·`car_hero` = `sheet-turret-v1` ·
 * `collector` = `sheet-train-v2` · `car_ammo`·`car_repair`·`car_observer` = `sheet-turret2-v1`.
 * 그래서 `drawCarArt`가 차체를 `LAYOUT.carLen` 한 값으로 그리는 것은 **누락이 아니라 유일한 선택**이다
 * (「차체도 시트 축척으로 그려야 한다」는 매력적이지만 시트 간 축척 대조가 없어 성립 안 한다).
 * 어느 셀이 어느 시트에서 왔는지는 probe `train.turret.sheets`가 찍는다 */
export function turretHeight(kind: CarKind, tier = 1): number {
  const tur = turretName(kind, tier);
  const t = tur && sprite(tur);
  const body = sprite("car_flat");
  if (!t || !body) return 0;
  return (t.src.h / body.src.h) * LAYOUT.carLen;
}

/** 칸 한 량의 **그림** = 「차체 + 포탑」 2패스 (§0.6 A3). **필드·카드·상점·허브가 전부 이 함수를 쓴다.**
 *
 * 결함이었던 것: 카드가 `draw(ctx, card.kind, ...)`로 **통짜 칸 스프라이트 1장**을 찾았는데,
 * 2차 신규 무기·지원칸에는 `turret_*`만 있고 그 이름의 셀이 없어 `draw()`가 조용히 반환했다.
 * 로드를 시도조차 안 하므로 `spriteMissing`(로드 실패 목록)에도 안 잡혀 «아무도 못 보는 결함»이었다.
 *
 * `h` = 차체 표시 높이(월드 또는 화면 px). 무기 하드웨어는 64px 차체 좌표계에서 한 번 구워진다.
 * `turretRot`은 포탑만 돌리고, 티어·분기는 포신·냉각·탄창 등 실제 모듈의 실루엣을 가른다.
 * 기존 시트 API는 진단/폴백용으로 유지하며, 판정·회전 상태에는 렌더가 쓰지 않는다. */
export function drawCarArt(
  ctx: CanvasRenderingContext2D,
  kind: CarKind,
  x: number,
  y: number,
  h: number,
  rot = 0,
  turretRot = rot,
  outline?: { color: string; px: number; alpha: number },
  tier = 1,
  branch: string | null = null
): void {
  const body = bodyName(kind);
  if (outline) drawOutline(ctx, body, x, y, h, rot, outline.color, outline.px, outline.alpha);
  draw(ctx, body, x, y, h, rot);
  if (kind === "hero") drawWeaponArt(ctx, "locomotive", x, y, h, rot);
  if (drawWeaponArt(ctx, kind, x, y, h, turretRot, tier, branch, outline)) return;
  const tur = turretName(kind, tier);
  if (!tur) return;
  const th = (turretHeight(kind, tier) / LAYOUT.carLen) * h;
  if (outline) drawOutline(ctx, tur, x, y, th, turretRot, outline.color, outline.px, outline.alpha);
  draw(ctx, tur, x, y, th, turretRot);
}

export function drawTrain(ctx: CanvasRenderingContext2D, t: Train): void {
  const sh = RENDER.shadow;
  const ol = RENDER.carOutline;
  // 뒤 칸부터 그려 선두가 위에 오게 한다
  for (let i = t.cars.length - 1; i >= 0; i--) {
    const car = t.cars[i];
    const p = at(t.track, carS(t, i));
    // 스프라이트는 위쪽이 진행 방향(세로 배치)이라 진행각 + π/2
    const rot = p.ang + Math.PI / 2;
    // 칸 그림자는 진행 방향으로 **길다** — 적의 원형 그림자와 달리 회전을 따라간다.
    // rx가 진행 방향(칸 길이의 절반), ry가 폭 방향이라 회전각은 rot이 아니라 p.ang이다
    drawShadow(ctx, p.x, p.y, LAYOUT.carLen, 0.48, 0.17, sh.dy * 0.35, sh.alpha, p.ang);
    // 어두운 외곽선 — 시트의 칸이 어두운 회녹색이라 자갈 노반 위에서 윤곽이 뭉개진다.
    // 색 보정(sprites.ts의 carTint)만으로는 "밝아졌을 뿐" 경계가 안 생긴다
    // 포탑은 **차체와 다른 각도**로 그린다. 마운트 링이 차체 중심(실측 0.501, 0.521)이라
    // 위치는 칸 중심 그대로고, 포탑 스프라이트의 앵커가 베이스 원 중심이라 그 점을 축으로 돈다
    drawCarArt(ctx, car.kind, p.x, p.y, LAYOUT.carLen, rot, car.turretAng + Math.PI / 2, ol, car.tier, car.branch);
  }
}

// 열차 = 이동 장벽 (§8.0). 칸에 HP는 없고, 적은 편성이 점유한 레일 구간을 통과하지 못한다.
// 칸 하나를 길이 CAR_PITCH의 캡슐로 보면 인접 캡슐이 맞닿아 편성 전체가 틈 없는 벽이 된다.
/** 편성 반폭 (월드). 궤간 절반보다 살짝 넓게 — 칸 몸체가 선로를 덮는 폭 */
const BARRIER_HALF_W = LAYOUT.railGauge / 2 + 2;

/** (x, y)가 편성이 점유한 구간 안인가. pad = 적 반경 */
export function trainBlocks(t: Train, x: number, y: number, pad = 0): boolean {
  for (let i = 0; i < t.cars.length; i++) {
    const p = at(t.track, carS(t, i));
    const c = Math.cos(p.ang);
    const s = Math.sin(p.ang);
    const dx = x - p.x;
    const dy = y - p.y;
    const lon = dx * c + dy * s;
    const lat = -dx * s + dy * c;
    if (Math.abs(lon) <= CAR_PITCH / 2 + pad && Math.abs(lat) <= BARRIER_HALF_W + pad) return true;
  }
  return false;
}
