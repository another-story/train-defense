// 정차역 상점 v1 — DESIGN §7.3 메뉴 (칸 구매 · 무기 레벨 강화 · 티어업 · 재배치 · 판매 · 코어 수리 + 출발).
// 가격·배율은 전부 balance.ts SHOP(= BALANCE §3·§4 정본)에서만 읽는다.
//
// 그림과 마우스 히트박스는 캔버스에, 같은 기하의 키보드 버튼은 controls.ts에 등록한다.
// 버튼은 그리면서 히트박스를 쌓는 즉시 모드다: draw가 만든 목록을 click이 뒤에서부터 훑는다.
// 그래서 **click 전에 draw가 최소 1프레임 돌아야 한다** — 정차 중에도 render는 계속 도니 성립한다.

import { BRANCHES, CARDS, CAR_TEXT, CORE, DOCTRINES, MAPS, type MapId, PASSIVE, type PassiveId, SHOP, SUPPORT, TRAIN, VIEW, WAVES, WEAPONS, carCap, maxLevelOf, passiveCost, supportUnlocked, upgradeCost, weaponUnlocked } from "./balance";
import { buttonPanel, railInk, slot, tooltip, woodPanel } from "./hud";
import type { Combat } from "./combat";
import { type Car, carName, carTip, drawCarArt, type CarKind, critChance, critMult, dpsOf, insertCar, makeCar, supportAt, type Train, trainDps } from "./train";

import { FONT, FONT_DISPLAY, TYPO } from "./typography";
import { announceControl, beginControls, registerControl } from "./controls";

type Btn = { id: string; label: string; x: number; y: number; w: number; h: number; act: () => void; on: boolean };

/** 정차 1회의 구매력 장부 (BALANCE §0 원칙 2 "스테이지당 구매력 = 칸 1개 or 강화 4~5회"의 실측 지표).
 * `in`은 상점이 열린 순간, `out`은 「출발」 순간이다 — 둘의 차가 그 정차에서 실제로 쓴 돈이다.
 * DESIGN §10 1.5차가 이름 붙인 검증 3축 중 "스테이지당 구매력"이 이 배열이다 */
export type StationLog = {
  stage: number;
  t: number;
  scrapIn: number;
  carsIn: number;
  dpsIn: number;
  /** 정차가 열린 순간의 코어 HP — 「수리냐 화력이냐」의 압력을 그 정차에서 읽는 값이다 */
  coreIn: number;
  spent: number;
  /** 이 정차에서 되돌린 코어 HP (지출 중 수리 몫의 지표) */
  repaired: number;
  /** **정차가 열린 순간의 재장비 수수료 중앙값** (감독 #72 ⑥ · `SHOP.refitFee`). 「수수료가 이 정차의
   * 수입(`scrapIn`)에서 몇 %인가」가 곧 25%라는 값의 실측 근거다 — 칸마다 투자액이 다르므로 중앙값을 쓴다 */
  refitMed: number;
  scrapOut: number;
  carsOut: number;
  dpsOut: number;
};

export type Shop = {
  /** 이번 프레임에 그려진 버튼들 (즉시 모드) */
  btns: Btn[];
  tab: "manage" | "buy" | "passive";
  selected: number;
  page: number;
  confirmSell: Car | null;
  /** 마지막으로 거절된 조작의 사유 — 화면에 한 줄로 띄운다 */
  note: string;
  /** 이번 정차에서 쓴 스크랩 (probe·화면 표시용) */
  spent: number;
  /** 이번 정차에서 되돌린 코어 HP (probe·화면 표시용) */
  repaired: number;
  /** 정차마다 1건씩 쌓이는 구매력 장부 (probe 전용, 판정에 쓰지 않는다) */
  log: StationLog[];
  /** **재장비로 고른 칸의 번호** (감독 #72 ⑥). null이면 평소 화면이고, 숫자면 「칸 구매」 격자 자리가
   * **그 칸을 무엇으로 바꿀 것인가**의 목록으로 바뀐다 — 격자 기하를 그대로 재사용하므로 패널이 안 자란다.
   * 다른 조작이 하나라도 성공하면 풀린다(`ok()`) — 자리가 밀리면 번호가 다른 칸을 가리키기 때문이다 */
  pick: number | null;
  /** 이번 정차에서 이미 쓴 재장비 횟수 (상한 `SHOP.refitPerStation`) */
  refits: number;
  /** 런 전체의 재장비 기록 (probe 전용) */
  refitLog: { stage: number; i: number; from: CarKind; to: CarKind; tier: number; level: number; fee: number }[];
};

export function makeShop(): Shop {
  return { btns: [], tab: "manage", selected: 0, page: 0, confirmSell: null, note: "", spent: 0, repaired: 0, log: [], pick: null, refits: 0, refitLog: [] };
}

/** 상점 격자에 **자리를 잡는** 칸 목록 = SHOP.carPrice에 값이 있는 것 (hero는 없다 = 구매 불가).
 * 패널 높이(BUY_ROWS · LIST_TOP · PANEL.h)는 이 **고정** 목록에서 역산한다 — 잠금 여부에 따라
 * 패널이 프레임마다 늘었다 줄었다 하면 안 된다 */
const BUYABLE = Object.keys(SHOP.carPrice) as CarKind[];

/** 지금 실제로 **살 수 있는** 칸 = 위 목록에서 잠금이 풀린 것만 (iter63).
 * **const가 아니라 함수다** — 잠금이 둘 다 런타임 조건이라 모듈 로드 시점에 굳히면 안 열린다:
 * 대공 플랙(`weaponUnlocked` — 공중 적이 조성에 있을 때) · 관측칸(`supportUnlocked` — 언덕이
 * 임계 이상인 맵일 때, §4.5 감독 #47). 둘 다 아닌 칸(수집칸)은 그대로 통과한다 */
function buyable(): CarKind[] {
  return BUYABLE.filter((k) => (WEAPONS[k] ? weaponUnlocked(k) : SUPPORT[k] ? supportUnlocked(k) : true));
}

/** 무기칸인가 (강화 대상). 기관차·수집칸은 WEAPONS에 없다 */
function isWeapon(car: Car): boolean {
  return !!WEAPONS[car.kind];
}

// ── 조작 (전부 여기서만 스크랩을 움직인다) ────────────────────────────────

export function buyCar(shop: Shop, train: Train, c: Combat, kind: CarKind): boolean {
  const price = SHOP.carPrice[kind];
  // 상한은 **구간별**이다(감독 #72 ② `TRAIN.carCapByStage`) — `TRAIN.maxCars`는 구조적 상한이라
  // 여기서 읽으면 12칸이 스테이지 7에 그대로 닫힌다
  if (train.cars.length >= carCap()) return fail(shop, `칸 상한 ${carCap()}`);
  if (c.scrap < price) return fail(shop, "스크랩 부족");
  c.scrap -= price;
  shop.spent += price;
  // 꼬리가 아니라 §6.1 기본 삽입 위치로 넣는다 (train.ts insertCar) — 산 칸이 자동으로 최악의 자리에 붙던 것을 고친다
  insertCar(train, makeCar(kind));
  return ok(shop);
}

export function upgradeCar(shop: Shop, train: Train, c: Combat, i: number): boolean {
  const car = train.cars[i];
  if (!isWeapon(car)) return fail(shop, "무기칸만 강화");
  // 레벨 상한은 **티어당 +5**다 (BALANCE §3) — 카드로 티어가 오르면 강화 여지도 함께 열린다
  if (car.level >= maxLevelOf(car.tier)) return fail(shop, `레벨 상한 ${maxLevelOf(car.tier)}`);
  const price = upgradeCost(car.level);
  if (c.scrap < price) return fail(shop, "스크랩 부족");
  c.scrap -= price;
  shop.spent += price;
  car.invested += price;
  car.level++;
  return ok(shop);
}

/** **패시브 강화 1단계 구매** (DESIGN §0.7 H2 · BALANCE §0.7 · balance.ts `PASSIVE`).
 * 칸 구매(양)·티어업(질)과 나란히 선 **세 번째 축**이라 같은 문(`fail`/`ok` · `shop.spent`)을 쓴다.
 * **`invested`에 안 쌓는다** — 칸이 아니라 열차에 붙는 값이라 판매로 되돌릴 수 없다(§7.3의 출구는
 * 칸에만 있다). 상한은 치확에만 있다(감독 고정 60%) */
export function buyPassive(shop: Shop, c: Combat, id: PassiveId): boolean {
  const ax = PASSIVE.axes.find((a) => a.id === id)!;
  const lv = c.pass[id];
  if (ax.cap !== null && lv >= ax.cap) return fail(shop, `${ax.name} 상한`);
  const price = passiveCost(id, lv);
  if (c.scrap < price) return fail(shop, "스크랩 부족");
  c.scrap -= price;
  shop.spent += price;
  c.pass[id] = lv + 1;
  return ok(shop);
}

/** 그 축의 다음 단계 값. 상한에 닿았으면 null (`tierUpCost`와 같은 규약) */
export function passiveNext(c: Combat, id: PassiveId): number | null {
  const ax = PASSIVE.axes.find((a) => a.id === id)!;
  const lv = c.pass[id];
  return ax.cap !== null && lv >= ax.cap ? null : passiveCost(id, lv);
}

/** 패시브 버튼 1개의 라벨 두 줄분 — 「지금 값」과 「다음 값」. 상점·probe가 같은 문자열을 쓴다 */
export function passiveLabel(c: Combat, id: PassiveId): { now: string; next: string } {
  const ax = PASSIVE.axes.find((a) => a.id === id)!;
  const lv = c.pass[id];
  const fmt = (n: number): string =>
    id === "critDmg" ? `×${(PASSIVE.critBase + n * ax.per).toFixed(2)}` : `+${Math.round(n * ax.per * 100)}%`;
  const price = passiveNext(c, id);
  return { now: `${ax.name} ${fmt(lv)}`, next: price === null ? "상한" : `${fmt(lv + 1)}  ${price}` };
}

/** 판매 = **그 칸에 들어간 총액(칸 값 + 강화 값)의 50%** 환급 (train.ts Car.invested 주석).
 * 주인공 칸은 팔 수 없다 = 주포는 편성에서 빠지지 않는다 (DESIGN §6.2) */
export function sellCar(shop: Shop, train: Train, c: Combat, i: number): boolean {
  const car = train.cars[i];
  if (SHOP.carPrice[car.kind] === undefined) return fail(shop, "주인공 칸은 판매 불가");
  c.scrap += sellValue(car);
  train.cars.splice(i, 1);
  // 팔린 칸을 표적으로 들고 날던 곡사 포탄은 착탄해도 갈 곳이 없다 — 여기서 버린다
  c.shells = c.shells.filter((sh) => sh.car !== car);
  return ok(shop);
}

/** 재배치 = 무료 (DESIGN §7.3 "배치는 퍼즐이지 과금 요소가 아니다"). 인접 칸과 자리를 바꾼다 */
export function moveCar(shop: Shop, train: Train, i: number, dir: -1 | 1): boolean {
  const j = i + dir;
  if (j < 0 || j >= train.cars.length) return false;
  const t = train.cars[i];
  train.cars[i] = train.cars[j];
  train.cars[j] = t;
  return ok(shop);
}

/** 판매 환급액 (반올림) */
export function sellValue(car: Car): number {
  return Math.round(car.invested * SHOP.sellRate);
}

// ── 재장비 (Refit · DESIGN §D1 · 감독 #72 ⑥) ──────────────────────────────

/** 이 칸의 재장비 수수료 = **투자액의 `SHOP.refitFee`** (반올림). `sellValue`와 같은 분모를 쓴다 */
export function refitFee(car: Car): number {
  return Math.round(car.invested * SHOP.refitFee);
}

/** 재장비 대상이 될 수 있는 칸인가 — **살 수 있는 무기칸**만이다.
 * 주인공 칸(`SHOP.carPrice`에 없다)은 §6.2가 편성에서 빼지 못하게 한 자리라 여기서도 뺀다.
 * 지원칸은 무기가 아니라 인접 효과라 「다른 무기로 바꾼다」의 대상이 아니다 */
export function refitable(car: Car): boolean {
  return isWeapon(car) && SHOP.carPrice[car.kind] !== undefined;
}

/** 그 칸을 바꿔 낄 수 있는 무기 목록 = 잠금이 풀린 무기칸 중 **지금 것이 아닌 것** */
export function refitTargets(car: Car): CarKind[] {
  return buyable().filter((k) => WEAPONS[k] && k !== car.kind);
}

/** **재장비** = 칸 하나를 다른 무기로 바꾼다. **티어·강화 레벨·자리는 그대로 따라가고** 잃는 것은
 * 수수료뿐이다 — `invested`를 안 건드리므로 판매 환급의 분모도 안 갈린다(수수료는 소각이다).
 *
 * **T3 분기는 초기화한다**(`branch = null`) — 다음 프레임의 `pendingBranch`(train.ts)가 새 무기의
 * 분기 화면을 연다. 같은 무기의 다른 칸이 이미 골랐으면 그 함수가 **물려받고 안 묻는다** — 즉
 * 「같은 T3로 가되 분기는 다시 고른다」는 D1의 문면이 이 한 줄로 서고, 새 상태를 안 만든다.
 *
 * **정차 1회당 `SHOP.refitPerStation`회**다 — 카운터는 「출발」에서 0으로 돌아간다(main.ts). */
export function refitCar(shop: Shop, train: Train, c: Combat, i: number, kind: CarKind): boolean {
  const car = train.cars[i];
  if (!car || !refitable(car)) return fail(shop, "무기칸만 재장비");
  if (shop.refits >= SHOP.refitPerStation) return fail(shop, `정차당 재장비 ${SHOP.refitPerStation}칸`);
  if (kind === car.kind) return fail(shop, "같은 무기");
  if (!WEAPONS[kind] || !weaponUnlocked(kind)) return fail(shop, "잠긴 무기");
  const fee = refitFee(car);
  if (c.scrap < fee) return fail(shop, "스크랩 부족");
  c.scrap -= fee;
  shop.spent += fee;
  shop.refits++;
  shop.refitLog.push({
    stage: shop.log[shop.log.length - 1]?.stage ?? 0,
    i, from: car.kind, to: kind, tier: car.tier, level: car.level, fee,
  });
  car.kind = kind;
  car.branch = null;
  // 재장전 상태는 새 무기의 것이 아니다 — 다음 프레임부터 새 연사로 돈다
  car.cd = 0;
  return ok(shop);
}

function fail(shop: Shop, why: string): false {
  shop.note = why;
  announceControl(why);
  return false;
}
function ok(shop: Shop): true {
  shop.note = "";
  shop.confirmSell = null;
  // 재장비 선택은 **다른 조작이 하나라도 나면 풀린다** — 구매·판매·재배치가 전부 자리를 미는데
  // 선택은 «번호»라 그대로 두면 조용히 다른 칸을 가리킨다. 거절(`fail`)은 선택을 안 푼다
  shop.pick = null;
  return true;
}

/** 코어 수리 = **HP 10당 40** (BALANCE §3). §1이 코어의 자동 회복을 금지하므로 이것이 유일한 회복 경로다.
 * 남은 손상이 1회분(10)보다 적으면 **그만큼만** 사고 값도 비례한다 — 만땅 직전에 40을 다 물지 않는다.
 * "예방보다 비싸게 = 안 맞는 게 이득"이 §3의 문면이라 값을 깎는 재량은 없다 */
export function repairCore(shop: Shop, c: Combat): boolean {
  const miss = CORE.hp - c.coreHp;
  if (miss <= 0.01) return fail(shop, "코어 만땅");
  const hp = Math.min(SHOP.repairHp, miss);
  const price = Math.round((SHOP.repairPrice * hp) / SHOP.repairHp);
  if (c.scrap < price) return fail(shop, "스크랩 부족");
  c.scrap -= price;
  shop.spent += price;
  shop.repaired += hp;
  c.coreHp += hp;
  return ok(shop);
}

/** 이 칸을 한 티어 올리는 값. 상한(CARDS.maxTier)에 닿았으면 null (BALANCE §3 표 그대로) */
export function tierUpCost(car: Car): number | null {
  if (!WEAPONS[car.kind]) return null;
  if (car.tier >= CARDS.maxTier) return null;
  return SHOP.tierPrice[car.tier + 1] ?? null;
}

/** 티어업 = **칸 1개**를 T+1로 (BALANCE §3 "티어업 구매(카드 대안) T2 = 200 / T3 = 500").
 *
 * **칸 단위인 것이 카드와의 차이다.** 카드(§7.4)는 무료지만 동일 무기 카드 2장을 요구하고 그 대신
 * **그 무기의 칸 전체**를 함께 올린다. 상점은 그 자리에서 **지명한 한 칸만** 올린다 — §7.2가 칸 구매에
 * 그어 둔 분업("카드 = 무작위 공급 / 상점 = 지명 보완")과 같은 선이고, 무기 단위로 팔면 기관총 4칸이
 * 200에 함께 오르므로 §0 원칙 4의 "카드 대비 ~2배 가치"를 크게 넘긴다.
 *
 * 값은 `invested`에 쌓인다 = 판매 환급(50%)의 분모에 들어간다 — 강화와 같은 규칙이다. */
export function tierUpCar(shop: Shop, train: Train, c: Combat, i: number): boolean {
  const car = train.cars[i];
  if (!isWeapon(car)) return fail(shop, "무기칸만 티어업");
  const price = tierUpCost(car);
  if (price === null) return fail(shop, `티어 상한 T${CARDS.maxTier}`);
  if (c.scrap < price) return fail(shop, "스크랩 부족");
  c.scrap -= price;
  shop.spent += price;
  car.invested += price;
  car.tier++;
  return ok(shop);
}

// ── QA 자동 소비 ──────────────────────────────────────────────────────────

/** `?shop=auto` — 헤드리스에서 "상점이 실제로 DPS 80을 만들어 주는가"를 재려면 누군가 돈을 써야 한다.
 * 정책은 §0 원칙 5의 목표 편성 그대로다: **9칸이 될 때까지 무기칸을 사고, 그 뒤로는 강화**.
 * 무기 종류는 보유 수가 가장 적은 것부터 골라 편성이 한 종으로 쏠리지 않게 한다.
 * 플레이어가 아니라 측정용 기준선이다 — 최적해가 아니라 재현 가능한 해다 */
export const AUTO_TARGET_CARS = 9;

/** 자동 소비가 코어를 되돌리는 선 (코어 HP 비율). **BALANCE 정본이 아니라 측정용 정책값**이다
 * (`AUTO_TARGET_CARS`와 같은 부류) — 만땅까지 고치면 초반 스테이지 수입(115~221)이 통째로 수리로
 * 흘러 화력이 안 자라고, 안 고치면 60웨이브가 코어 100에서 끝난다. 그 사이의 재현 가능한 한 점이다.
 *
 * **iter50에서 기본 정책이 아니게 됐다** — 아래 `adaptiveRepairFloor()`가 기본이고 이 값은
 * `?repair=<0..1>`로 명시할 때만 쓰이는 옛 정책이다(A/B용 상수로 남긴다) */
export const AUTO_REPAIR_FLOOR = 0.6;

/** 적응형 수리 정책의 여유 배수 — "직전 스테이지와 **같은 만큼** 잃어도 죽지 않는 선"에 얹는 몫.
 * 1.0이면 손실과 정확히 같은 HP까지만 고친다(다음 스테이지가 조금이라도 더 뽑으면 죽는다).
 * 1.75는 **손실 57 이상이면 만땅**과 같은 말이다(57 × 1.75 > 100).
 *
 * **iter50에서 9 seed × 사다리로 확정했다** — 도달 웨이브 합(9 seed): 옛 고정 0.6이 **68**,
 * 적응형 1.25가 **110**, 적응형 **1.75가 113**이고 **60웨이브 완주는 1.75에서만 나온다**(seed 7).
 * 1.25 대비 손해는 조기 사망 seed의 ∓1~2웨이브(w7~w9 구간의 잡음 폭)인데, 이득은 **관문을 넘긴
 * 런이 끝까지 가는 것**이다 — 후반 스테이지는 코어를 100 가까이 뽑아가고 그때는 돈이 남는다
 * (완주 컷의 지출/수입 = 18,243/20,202). **정책값이지 BALANCE 정본이 아니다** */
export const AUTO_REPAIR_MARGIN = 1.75;

/** 적응형 수리 바닥의 **절대 하한** 계수 — "다음 스테이지 §6 기저 예산 1 = 코어 몇"의 환산값
 * (`absoluteRepairFloor`). **정책값이지 BALANCE 정본이 아니다**(`AUTO_REPAIR_MARGIN`·`AUTO_TARGET_CARS`와
 * 같은 부류). QA `?rabs=<k>` · 0이면 끈다.
 *
 * **iter58에서 9 seed 사다리로 확정했다** — 도달 웨이브 합 / 완주: **0(끔) 489 / 8** · **0.45 489 / 8** ·
 * **0.65 540 / 9(전 seed 완주 · 후퇴 0)**. 스테이지 기저 예산 합이 1→2→3에서 37 / 76 / 156이므로
 * 바닥은 정차 1에서 `76k/100`, 정차 2부터 `156k/100`(상한 1.0)이다 — **0.641이 정차 2를 만땅으로
 * 만드는 최소값**이고 0.65가 그 바로 위다. 0.45(정차 2 바닥 0.70)는 유일한 미완주 s7의 진입 코어
 * 74.3을 못 넘어 **끈 것과 결과가 같다**(합·완주가 소수점까지 동일). 즉 이 축은 연속 곡선이 아니라
 * **「정차 2에서 만땅이냐 아니냐」의 문턱**이고, 채택값은 그 문턱을 넘는 가장 작은 값이다 */
export const AUTO_REPAIR_ABS = 0.65;

/** 적응형 수리 정책 (iter50) — **고정 비율 대신 직전 스테이지의 실측 손실**을 기준으로 삼는다.
 *
 * iter49가 두 가지를 동시에 확인했다: 만땅 수리(floor 1.0)는 seed 7의 60웨이브 완주를 처음
 * 성립시켰지만 다른 2 seed는 **더 일찍** 죽인다 — 코어가 거의 안 깎인 첫 정차에서 돈을 화력 대신
 * 수리로 흘리기 때문이다. 즉 답은 "항상 만땅"도 "항상 60%"도 아니라 **코어가 실제로 위험할 때만
 * 만땅**이고, "위험"의 유일한 실측 지표가 **직전 스테이지가 실제로 뽑아 간 HP**다.
 *
 * 그 값은 이미 정차 장부에 있다 — 직전 항목의 `coreIn + repaired`(= 출발 시점 코어)에서 이번
 * 항목의 `coreIn`을 빼면 그 스테이지의 손실이다. 첫 정차는 직전이 없으므로 시작 코어(`CORE.hp`)를
 * 출발점으로 본다 = 스테이지 1의 손실 그대로다.
 *
 * **iter56에서 「다음 스테이지 예산 비례」가 붙었다** (감독 #38 사인 A) — 직전 손실만 보는 바닥은
 * 수요가 커지는 구간에서 **체계적으로 덜 고친다**. 아래 `stageGrowth()`가 그 증가분이다.
 *
 * 반환값은 `autoRepair`가 받는 **비율**이고 1.0(만땅)에서 잘린다 — 코어 상한 위로는 못 쌓는다 */
export function adaptiveRepairFloor(
  shop: Shop,
  c: Combat,
  margin = AUTO_REPAIR_MARGIN,
  scale = true,
  abs = AUTO_REPAIR_ABS,
): number {
  const cur = shop.log[shop.log.length - 1];
  const prev = shop.log[shop.log.length - 2];
  const coreOut = prev ? prev.coreIn + prev.repaired : CORE.hp;
  const coreNow = cur ? cur.coreIn : c.coreHp;
  const loss = Math.max(0, coreOut - coreNow);
  const done = cur ? cur.stage : 1;
  const grow = scale ? stageGrowth(done) : 1;
  const byLoss = (loss * grow * margin) / CORE.hp;
  return Math.min(1, Math.max(byLoss, absoluteRepairFloor(done, abs)));
}

/** 다음 스테이지 §6 기저 예산의 **절대량**으로 잡는 바닥 (iter58 · 큐 1). 위 손실 기반 바닥과
 * `Math.max`로 합쳐진다 — 즉 "직전에 얼마나 맞았든 **다음 스테이지가 이만큼 뽑아 갈 자리**면
 * 최소 이만큼은 고치고 출발한다"는 하한이다.
 *
 * **왜 필요했나(iter57 ④)**: 손실 기반 바닥은 화력이 세서 직전 스테이지를 싸게 넘긴 런일수록
 * **덜 고친다**. `hand` 기준선의 유일한 미완주 s7이 그 사례다 — 정차 2에 코어 74.3으로 들어와
 * 수리를 +10만 사고 스테이지 3을 84.3으로 시작해 웨이브 9에서 죽었다. 다음 스테이지의 수요는
 * 직전 런의 성적과 무관하므로, 하한은 런이 아니라 **곡선**에서 나와야 한다.
 *
 * `k`는 "§6 기저 예산 1 = 코어 몇"의 환산 계수다. 스테이지 기저 예산 합은 1→2→3이 37 / 76 / 156이라
 * `k = 0.65`면 바닥이 정차 1에서 0.49, **정차 2부터 1.0(만땅)**이다 = 관문 앞에서만 만땅을 강제한다.
 * 0이면 이 하한이 꺼져 iter56~57 정책과 같아진다 (QA `?rabs=0`) */
function absoluteRepairFloor(done: number, k: number): number {
  const next = stageBase(done + 1);
  return next > 0 ? Math.min(1, (next * k) / CORE.hp) : 0;
}

/** 스테이지 `done`(방금 끝난 스테이지) → `done + 1`의 **§6 기저 예산 비**. 직전 손실에 곱하면
 * "다음 스테이지가 뽑아 갈 HP"의 1차 추정이 된다 (iter56 · 감독 #38 사인 A).
 *
 * **`budget`이 아니라 `base`(보스 감액 **전**)를 쓴다** — 보스는 6웨이브마다 오므로 스테이지 하나
 * 걸러 하나만 감액을 품는다. 감액된 열로 비를 내면 증가율이 2.4 / 1.1로 **보스 홀짝에 따라 튄다**
 * (실제 수요는 그렇게 안 튄다 — 감액분은 §6 예산 **밖**인 보스 HP가 도로 채운다). 기저 열은
 * 스테이지 1→2→3이 각각 ×2.05이고 그 뒤로는 ×1.03 대역이다 = 관문 구간에서만 크게 민다.
 *
 * 곡선 밖(마지막 스테이지)이면 1을 돌려준다 = 옛 정책과 같다 */
function stageGrowth(done: number): number {
  const cur = stageBase(done);
  const next = stageBase(done + 1);
  return cur > 0 && next > 0 ? next / cur : 1;
}

/** 스테이지 하나의 §6 기저 예산 합 (보스 감액 전). 곡선 밖이면 0 */
function stageBase(stage: number): number {
  let sum = 0;
  for (const w of WAVES) if (w.stage === stage) sum += w.base;
  return sum;
}

/** 코어를 `floor` 비율까지 1회분씩 되돌린다. 돈이 떨어지면 거기서 멈춘다 (실패는 정상 종료다).
 *
 * `reserve`는 **수리가 건드리면 안 되는 스크랩**이다 (iter51 큐 1 — 칸 예약 정책). 수리는
 * `autoSpend`의 첫 지출이라 정차 자금 전액을 먼저 가져갈 수 있는데, 그러면 화력이 그 정차에서
 * 통째로 멈춘다(iter51 실측: 정차 2회차 수입 442가 같은데 s7만 칸을 사고 s3·s11·s21은 전액이
 * 수리로 나가 `dpsOut = dpsIn`). 이 인자는 그 자리에 칸 1개 값을 남겨 두는 손잡이다 */
export function autoRepair(shop: Shop, c: Combat, floor: number, reserve = 0): void {
  for (let guard = 0; guard < 100 && c.coreHp < CORE.hp * floor; guard++) {
    // 다음 1회분의 값을 예약분 **밖**에서 낼 수 있을 때만 산다 (마지막 1회는 만땅 직전이라 값이 비례로 작다)
    const hp = Math.min(SHOP.repairHp, CORE.hp - c.coreHp);
    if (c.scrap - reserve < Math.round((SHOP.repairPrice * hp) / SHOP.repairHp)) return;
    if (!repairCore(shop, c)) return;
  }
}

export function autoSpend(
  shop: Shop,
  train: Train,
  c: Combat,
  /** null = 적응형(기본 정책, `adaptiveRepairFloor`). 숫자면 그 비율로 고정한다 (QA `?repair=`) */
  repairFloor: number | null = null,
  /** 칸을 몇 개까지 사고 강화로 넘어갈지. 기본은 §0 원칙 5의 기대 편성(9)이고, probe의 공급 곡선만
   * `TRAIN.maxCars`(12)를 넣어 **상점 메뉴의 구조적 상한**을 잰다 (main.ts growth 블록) */
  targetCars = AUTO_TARGET_CARS,
  /** QA `?save=1` — 칸을 살 돈(120)이 모일 때까지 **강화를 사지 않는다**. 기본 false는 "그 자리에서
   * 살 수 있는 가장 싼 것을 산다"라 정차가 잦아질수록 돈이 칸에 닿기 전에 강화로 빠진다
   * (iter48 실측: `?stop=2`가 기준선보다 **더 쓰고 DPS가 더 낮다`). 정차 빈도(손잡이 ⓒ)의 상한을
   * 재려면 이 편향을 걷어낸 컷이 필요하다 — **정책값이지 BALANCE 정본이 아니다**(`?repair`와 같은 부류) */
  saveForCar = false,
  /** QA `?rmargin=<n>` — 적응형 정책의 여유 배수(`AUTO_REPAIR_MARGIN`)를 갈아끼운다. `repairFloor`가
   * 숫자면(= `?repair=`) 적응형 자체가 꺼지므로 이 값은 안 쓰인다 */
  repairMargin = AUTO_REPAIR_MARGIN,
  /** **칸 예약 정책 — iter51에서 기준선으로 승격됐다.** 목표 칸 미달인 정차에서 수리가 칸 1개 값(120)을
   * 남기고 멈춘다. 9 seed 사다리에서 도달 웨이브 합 **113 → 117**(s3 7→8 · s11 7→9 · s21 7→8, 후퇴 0,
   * 완주 seed 7은 소수점까지 무변경). **정책값이지 BALANCE 정본이 아니다**(`?repair`·`?save`와 같은 부류).
   * QA `?reserve=0` — 승격 전 정책(수리가 자금 전액을 먼저 가져갈 수 있다)으로 되돌리는 A/B */
  reserveCar = true,
  /** **다음 스테이지 예산 비례 — iter56에서 기준선으로 승격됐다** (`adaptiveRepairFloor` `scale`).
   * QA `?rscale=0` — 승격 전 정책(직전 손실만 본다)으로 되돌리는 A/B. `repairFloor`가 숫자면
   * 적응형 자체가 꺼지므로 이 값은 안 쓰인다 */
  repairScale = true,
  /** **다음 스테이지 예산의 절대 하한 — iter58에서 기준선으로 승격됐다** (`absoluteRepairFloor` `k`).
   * QA `?rabs=<k>` · `?rabs=0` = 승격 전 정책(손실 기반 바닥만 본다)으로 되돌리는 A/B.
   * `repairFloor`가 숫자면 적응형 자체가 꺼지므로 이 값은 안 쓰인다 */
  repairAbs = AUTO_REPAIR_ABS,
  /** **QA `?sup=<n>[&supk=<종>]` — 자동 소비가 지원칸을 n대까지 산다** (iter61 큐 1).
   * 기본 null = 기준선(지원칸을 한 대도 안 산다) — 켜지 않으면 기존 컷이 소수점까지 재현된다.
   *
   * **왜 필요했나(iter60 ⑪)**: 지원칸 2종은 구현·A/B가 끝났는데 9 seed 풀런의 최종 편성에
   * 지원칸이 **시작 수집칸 1대뿐**이고 `fed`(효과를 받는 무기칸)가 9 seed 전부 0이다. 자동 소비가
   * 무기칸만 사고(`weaponKinds`) 자동 카드는 빈 자리를 무기로 먼저 채우기 때문이다. 그래서 §6.1
   * 지원칸의 값은 QA 편성(`?cars=`)에서만 보였다 — 이 손잡이가 **풀런에서 재는 유일한 경로**다.
   *
   * **정책값이지 BALANCE 정본이 아니다**(`?repair`·`?save`와 같은 부류). 사는 순서는 **지원칸 먼저**다 —
   * 인접 효과는 「그 칸이 편성에 있던 시간」에 비례하므로 꼬리에 사면 마지막 스테이지에서만 값이 난다 */
  support: { kind: CarKind; n: number } | null = null,
  /** **패시브 4종을 자동 소비가 사는가** (§0.7 H2). 기본 true = 기준선 — H1(적 HP 웨이브 성장)의
   * 짝이라 이 축이 꺼진 채로 잰 런은 「부러진 런」이지 기준선이 아니다.
   * QA `?pass=0`이 이 축만 꺼서 **H2 이전 기준선을 그대로 재현한다**(`?gate=0`·`?faction=off`와 같은 부류) */
  passive = true,
): void {
  // 수리가 먼저다 — 코어가 0이면 편성이 아무리 세도 런이 끝난다. 남는 돈이 화력으로 간다.
  // 칸 예약이 켜져 있고 편성이 목표 미만이면 칸 1개 값만 남기고 고친다
  const reserve =
    reserveCar && train.cars.length < Math.min(targetCars, TRAIN.maxCars)
      ? Math.min(...buyable().filter((k) => WEAPONS[k]).map((k) => SHOP.carPrice[k]))
      : 0;
  autoRepair(shop, c, repairFloor ?? adaptiveRepairFloor(shop, c, repairMargin, repairScale, repairAbs), reserve);
  const weaponKinds = buyable().filter((k) => WEAPONS[k]);
  for (let guard = 0; guard < 200; guard++) {
    if (train.cars.length < targetCars && train.cars.length < carCap()) {
      // 지원칸 목표(QA `?sup=`)가 남아 있으면 무기보다 먼저 산다
      if (support && train.cars.filter((x) => x.kind === support.kind).length < support.n) {
        if (c.scrap >= SHOP.carPrice[support.kind] && buyCar(shop, train, c, support.kind)) continue;
        if (saveForCar) break;
      }
      let pick = weaponKinds[0];
      let pn = Infinity;
      for (const k of weaponKinds) {
        const n = train.cars.filter((x) => x.kind === k).length;
        if (n < pn) {
          pn = n;
          pick = k;
        }
      }
      if (c.scrap >= SHOP.carPrice[pick] && buyCar(shop, train, c, pick)) continue;
      // 저축 정책: 칸이 목표 미만인데 돈이 모자라면 여기서 멈춘다 (강화로 흘리지 않는다)
      if (saveForCar) break;
    }
    // **패시브(§0.7 H2)도 같은 «가장 싼 것부터» 규칙에 든다.** §0.7이 요구하는 것은 「세 축이
    // 경쟁한다」이고, 가격으로 경쟁시키는 것이 이 정책의 언어다 — 시작가 50~60 · ×1.5 누진이라
    // 편성 전체가 Lv3 대(45 → 68)에 닿는 순간부터 패시브가 강화보다 싸진다. 최적해가 아니라
    // 재현 가능한 기준선이다(`AUTO_TARGET_CARS`와 같은 부류)
    let pid: PassiveId | null = null;
    let pp = Infinity;
    if (passive) {
      for (const ax of PASSIVE.axes) {
        const price = passiveNext(c, ax.id);
        if (price !== null && price < pp) {
          pp = price;
          pid = ax.id;
        }
      }
    }
    // 가장 싼 강화 = 레벨이 가장 낮은 무기칸
    let best = -1;
    let bl = Infinity;
    for (let i = 0; i < train.cars.length; i++) {
      const car = train.cars[i];
      if (!isWeapon(car) || car.level >= maxLevelOf(car.tier)) continue;
      if (car.level < bl) {
        bl = car.level;
        best = i;
      }
    }
    // 강화보다 싼 패시브가 있으면 그쪽이 먼저다. **동가는 강화가 이긴다**(H2 이전 순서를 보존한다)
    if (pid !== null && pp < (best < 0 ? Infinity : upgradeCost(bl))) {
      if (c.scrap < pp) break;
      if (!buyPassive(shop, c, pid)) break;
      continue;
    }
    if (best < 0) {
      // 강화할 칸이 하나도 없다 = 편성 전체가 레벨 상한이다. 그 상한을 여는 유일한 유료 경로가
      // 티어업이다(BALANCE §3 "티어당 상한 +5"). **레벨을 먼저 채우고 티어를 여는** 순서인 것은
      // §3 가격표에서 싼 쪽부터 사는 현행 정책의 연장일 뿐이다 — 최적해가 아니라 재현 가능한 기준선
      let ti = -1;
      let tp = Infinity;
      for (let i = 0; i < train.cars.length; i++) {
        const price = tierUpCost(train.cars[i]);
        if (price !== null && price < tp) {
          tp = price;
          ti = i;
        }
      }
      if (ti < 0 || c.scrap < tp) break;
      if (!tierUpCar(shop, train, c, ti)) break;
      continue;
    }
    if (c.scrap < upgradeCost(bl)) break;
    if (!upgradeCar(shop, train, c, best)) break;
  }
}

// ── 렌더 + 입력 ───────────────────────────────────────────────────────────

const PANEL = { w: 1120, h: 660 };
const PX = (VIEW.w - PANEL.w) / 2;
const PY = (VIEW.h - PANEL.h) / 2;
const BUY_PER_ROW = 4;
const BUY_GAP = 12;
const BUY_H = 72;
const BUY_TOP = 218;
const BUY_W = (PANEL.w - 48 - BUY_GAP * 3) / 4;
const LIST_TOP = 204;
const ROW_H = 54;
const PAGE_SIZE = 6;
const REPAIR_BTN = { x: 24, y: 76, w: 390, h: 44 };
// Compatibility metadata for existing probes. Actions now belong to the selected car.
const ROW = {
  name: { x: 36, w: 210 }, tier: { x: 246, w: 132 }, dps: { x: 424, w: 320 },
  up: { x: 424, w: 316 }, tierUp: { x: 756, w: 340 },
  left: { x: 424, w: 316 }, right: { x: 756, w: 340 },
  refit: { x: 424, w: 316 }, sell: { x: 756, w: 340 },
};
let buyTextMax = 0;
const rowTextMax = { name: 0, tier: 0, dps: 0 };

/** Old numerical probe fields remain available; ui.buttons is the current click contract. */
export function buyRowGeom() {
  return { kinds: BUYABLE.length, shown: buyable().length, perRow: BUY_PER_ROW,
    rows: Math.ceil(BUYABLE.length / BUY_PER_ROW), w: BUY_W, step: BUY_W + BUY_GAP,
    inner: PANEL.w - 48, right: PANEL.w - 48, textMax: buyTextMax,
    panelH: PANEL.h, listBottom: LIST_TOP + PAGE_SIZE * ROW_H,
    panelTop: PY, viewH: VIEW.h, top: BUY_TOP, h: BUY_H, gap: BUY_GAP };
}

export function rowGeom() {
  return { cols: ROW, inner: PANEL.w - 48, right: ROW.sell.x + ROW.sell.w, h: ROW_H,
    panelW: PANEL.w, listTop: LIST_TOP, textMax: { ...rowTextMax }, layout: "selected-car" };
}

export function shopUiGeom(shop: Shop) {
  return { tab: shop.tab, selected: shop.selected, page: shop.page,
    buttons: shop.btns.map(({ id, label, x, y, w, h, on }) => ({ id, label, x, y, w, h, on })) };
}

export function passiveGeom(c: Combat) {
  return PASSIVE.axes.map((ax, i) => {
    const price = passiveNext(c, ax.id);
    const lab = passiveLabel(c, ax.id);
    return { id: ax.id, lv: c.pass[ax.id], x: 24 + i % 2 * 548, y: 242 + Math.floor(i / 2) * 128,
      w: 524, h: 108, price, on: price !== null && c.scrap >= price,
      label: `${lab.now} → ${lab.next}` };
  });
}

export function repairGeom(c: Combat) {
  const miss = CORE.hp - c.coreHp;
  const hp = Math.min(SHOP.repairHp, miss);
  const price = Math.round(SHOP.repairPrice * hp / SHOP.repairHp);
  return { ...REPAIR_BTN, miss: +Math.max(miss, 0).toFixed(2), hp: +Math.max(hp, 0).toFixed(2),
    price: Math.max(price, 0), on: miss > 0.01 && c.scrap >= price };
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 18, color = "#fff1d2", bold = false): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = bold ? `${size + 2}px ${FONT_DISPLAY}` : `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(value, PX + x, PY + y);
}

function button(shop: Shop, ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number,
  label: string, on: boolean, act: () => void, selected = false): void {
  const rect = { x: PX + x, y: PY + y, w, h };
  const primary = id === "shop-depart" || id === "shop-sell-confirm";
  buttonPanel(ctx, rect.x, rect.y, w, h, !on ? "disabled" : primary ? "primary" : selected ? "selected" : "secondary");
  ctx.fillStyle = primary && on ? railInk.dark : on ? railInk.text : railInk.muted;
  ctx.font = TYPO.button;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = label.split("\n");
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? TYPO.button : TYPO.small;
    ctx.fillStyle = primary && on ? railInk.dark : on ? (i === 0 ? railInk.text : railInk.muted) : "#949c8f";
    ctx.fillText(line, rect.x + w / 2, rect.y + h / 2 + (i - (lines.length - 1) / 2) * 27, w - 24);
  });
  const action = () => { act(); };
  shop.btns.push({ id, label: label.replaceAll("\n", " · "), ...rect, act: action, on });
  registerControl(id, label.replaceAll("\n", " · "), rect, action, !on);
}

export function drawShop(
  ctx: CanvasRenderingContext2D, shop: Shop, train: Train, c: Combat, stage: number,
  nextMap: MapId | null, mouse: { x: number; y: number } | null, onDepart: () => void,
): void {
  beginControls("정차역 상점");
  shop.btns = [];
  shop.selected = Math.max(0, Math.min(shop.selected, train.cars.length - 1));
  shop.page = Math.max(0, Math.min(shop.page, Math.ceil(train.cars.length / PAGE_SIZE) - 1));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b120fd4";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  woodPanel(ctx, PX, PY, PANEL.w, PANEL.h, 14);
  ctx.fillStyle = "#777b5940";
  ctx.fillRect(PX + 24, PY + 126, PANEL.w - 48, 1);
  ctx.fillRect(PX + 24, PY + 592, PANEL.w - 48, 1);
  text(ctx, `정차역 · STAGE ${stage} 완료`, 24, 38, 26, "#fff3d2", true);
  text(ctx, `SCRAP ${Math.floor(c.scrap)}`, 828, 38, 26, railInk.gold, true);
  text(ctx, `편성 ${train.cars.length}/${carCap()} · 명목 DPS ${trainDps(train, c.pass).toFixed(1)}`, 24, 65);
  if (nextMap) text(ctx, `다음 구역: ${MAPS[nextMap].name}`, 660, 65, 18, "#ffdd75");
  const rep = repairGeom(c);
  button(shop, ctx, "shop-repair", rep.x, rep.y, rep.w, rep.h,
    rep.miss > .01 ? `코어 ${Math.ceil(c.coreHp)} → ${Math.ceil(c.coreHp + rep.hp)} · 수리 ${rep.price} S` : `코어 ${CORE.hp}/${CORE.hp} · 수리 완료`, rep.on,
    () => { if (repairCore(shop, c)) { shop.note = `코어 수리 완료 · ${Math.ceil(c.coreHp)}/${CORE.hp}`; announceControl(shop.note); } });
  text(ctx, "칸 선택 → 강화·배치 · 구매 비용은 스크랩(S)", 440, 104);
  const tabs = [["manage", "편성 관리"], ["buy", "칸 구매"], ["passive", "열차 전체 강화"]] as const;
  tabs.forEach(([id, name], i) => button(shop, ctx, `shop-tab-${id}`, 24 + i * 364, 134, 348, 44,
    `${shop.tab === id ? "✓ " : ""}${name}`, true, () => {
      shop.tab = id; shop.pick = null; shop.confirmSell = null; shop.note = "";
    }, shop.tab === id));
  let hover: { kind: CarKind; car?: Car } | undefined;
  if (shop.tab === "manage") {
    text(ctx, "1. 관리할 칸 선택", 24, 198, 18, railInk.muted, true);
    text(ctx, "2. 선택한 칸 관리", 424, 198, 18, railInk.muted, true);
    const start = shop.page * PAGE_SIZE;
    train.cars.slice(start, start + PAGE_SIZE).forEach((car, row) => {
      const i = start + row;
      const label = `${shop.selected === i ? "✓ " : ""}${i + 1}. ${carName(car.kind)}  ${isWeapon(car) ? `T${car.tier} · Lv${car.level + 1}` : car.kind === "hero" ? "주포" : "지원"}`;
      ctx.font = TYPO.button;
      rowTextMax.name = Math.max(rowTextMax.name, ctx.measureText(label).width);
      button(shop, ctx, `shop-car-${i}`, 24, LIST_TOP + row * ROW_H, 366, 46, label, true, () => {
        shop.selected = i; shop.confirmSell = null; shop.pick = null; shop.note = "";
      }, shop.selected === i);
    });
    const pages = Math.ceil(train.cars.length / PAGE_SIZE);
    if (pages > 1) {
      button(shop, ctx, "shop-page-prev", 24, 538, 176, 44, "◀ 앞 칸", shop.page > 0, () => { shop.page--; });
      button(shop, ctx, "shop-page-next", 212, 538, 178, 44, "뒤 칸 ▶", shop.page < pages - 1, () => { shop.page++; });
    }
    const car = train.cars[shop.selected];
    if (car) {
      const i = shop.selected;
      slot(ctx, PX + 414, PY + 208, 682, 90, 8);
      text(ctx, `${i + 1}. ${carName(car.kind)}`, 430, 238, 23, "#fff3d2", true);
      const branch = car.branch ? BRANCHES[car.kind]?.find((b) => b.id === car.branch) : null;
      text(ctx, isWeapon(car) ? `T${car.tier} · Lv${car.level + 1}${branch ? ` · ${branch.name}` : ""}` : car.kind === "hero" ? "직접 조준하는 주포 · 칸 강화 대상 아님" : "지원칸 · 강화/티어업 없음", 430, 267);
      drawCarArt(ctx, car.kind, PX + 982, PY + 250, 100, Math.PI / 2, Math.PI / 2, undefined, car.tier, car.branch);
      const sup = supportAt(train, i);
      text(ctx, isWeapon(car) ? `명목 DPS ${(dpsOf(car, c.pass) * sup.rate).toFixed(1)}${sup.rate !== 1 ? ` · 인접 연사 ×${sup.rate.toFixed(2)}` : ""}${sup.overHills ? " · 언덕 관통" : ""}` : car.kind === "hero" ? "클릭 또는 방향키 조준 후 Space로 발사" : CAR_TEXT[car.kind]?.line ?? "지원칸", 424, 324);
      const up = isWeapon(car) && car.level < maxLevelOf(car.tier) ? upgradeCost(car.level) : null;
      const tu = tierUpCost(car);
      button(shop, ctx, "shop-upgrade", 424, 340, 316, 68,
        up === null ? (isWeapon(car) ? `레벨 상한 Lv${car.level + 1}` : "강화 불가") : `강화 Lv${car.level + 1} → ${car.level + 2}\n비용 ${up} S`,
        up !== null && c.scrap >= up, () => { if (upgradeCar(shop, train, c, i)) { shop.note = `${carName(car.kind)} Lv${car.level + 1} 강화 완료`; announceControl(shop.note); } });
      button(shop, ctx, "shop-tier", 756, 340, 340, 68,
        tu === null ? (isWeapon(car) ? `T${CARDS.maxTier} · 최대 티어` : "티어업 불가") : `티어 T${car.tier} → T${car.tier + 1}\n이 칸만 · 비용 ${tu} S`,
        tu !== null && c.scrap >= tu, () => { if (tierUpCar(shop, train, c, i)) { shop.note = `${carName(car.kind)} T${car.tier} 완료`; announceControl(shop.note); } });
      button(shop, ctx, "shop-move-left", 424, 422, 316, 44, "◀ 앞 칸과 교환 · 무료", i > 0, () => { if (moveCar(shop, train, i, -1)) { shop.selected--; shop.page = Math.floor(shop.selected / PAGE_SIZE); } });
      button(shop, ctx, "shop-move-right", 756, 422, 340, 44, "뒤 칸과 교환 ▶ · 무료", i < train.cars.length - 1, () => { if (moveCar(shop, train, i, 1)) { shop.selected++; shop.page = Math.floor(shop.selected / PAGE_SIZE); } });
      const rf = refitable(car) ? refitFee(car) : null;
      const used = shop.refits >= SHOP.refitPerStation;
      button(shop, ctx, "shop-refit", 424, 480, 316, 44, used ? "재장비 횟수 사용 완료" : rf === null ? "재장비 불가" : `무기 재장비 · ${rf} S`,
        rf !== null && !used && c.scrap >= rf, () => { shop.pick = i; shop.tab = "buy"; shop.confirmSell = null; shop.note = ""; });
      const canSell = SHOP.carPrice[car.kind] !== undefined;
      button(shop, ctx, "shop-sell", 756, 480, 340, 44, canSell ? `칸 판매 · 환급 ${sellValue(car)} S` : "주인공 칸 · 판매 불가", canSell,
        () => { shop.confirmSell = car; shop.note = `${carName(car.kind)} 판매는 되돌릴 수 없습니다.`; announceControl(shop.note); });
      if (shop.confirmSell === car) {
        button(shop, ctx, "shop-sell-cancel", 424, 538, 316, 44, "판매 취소", true, () => { shop.confirmSell = null; shop.note = "판매를 취소했습니다."; });
        button(shop, ctx, "shop-sell-confirm", 756, 538, 340, 44, `판매 확정 · +${sellValue(car)} S`, true,
          () => { if (shop.confirmSell === car && sellCar(shop, train, c, i)) { shop.note = `${carName(car.kind)} 판매 완료`; announceControl(shop.note); } });
      } else text(ctx, "강화·티어는 이 칸에 적용 · 재장비는 티어/레벨 유지", 424, 565);
    }
  } else if (shop.tab === "buy") {
    const picked = shop.pick !== null ? train.cars[shop.pick] : null;
    text(ctx, picked ? `재장비: ${carName(picked.kind)} → 새 무기 · T${picked.tier}/Lv${picked.level + 1} 유지 · 분기 재선택` : "원하는 칸 구매 · 신규 칸 T1/Lv1 · 편성의 기본 위치에 추가", 24, 205, 18, railInk.muted, true);
    const kinds = picked ? refitTargets(picked) : buyable();
    buyTextMax = 0;
    kinds.forEach((kind, n) => {
      const price = picked ? refitFee(picked) : SHOP.carPrice[kind];
      const x = 24 + n % BUY_PER_ROW * (BUY_W + BUY_GAP);
      const y = BUY_TOP + Math.floor(n / BUY_PER_ROW) * (BUY_H + BUY_GAP);
      const on = c.scrap >= price && (picked ? shop.refits < SHOP.refitPerStation : train.cars.length < carCap());
      const label = `${carName(kind)}\n${picked ? "재장비" : "구매"} ${price} S`;
      ctx.font = TYPO.button;
      buyTextMax = Math.max(buyTextMax, ...label.split("\n").map((line) => ctx.measureText(line).width));
      const pi = shop.pick ?? 0;
      button(shop, ctx, `shop-buy-${kind}`, x, y, BUY_W, BUY_H, label, on, () => {
        if (picked ? refitCar(shop, train, c, pi, kind) : buyCar(shop, train, c, kind)) {
          shop.note = `${carName(kind)} ${picked ? "재장비" : "구매"} 완료`;
          if (picked) { shop.tab = "manage"; shop.selected = pi; }
          announceControl(shop.note);
        }
      });
      if (mouse && mouse.x >= PX + x && mouse.x <= PX + x + BUY_W && mouse.y >= PY + y && mouse.y <= PY + y + BUY_H) hover = { kind };
    });
    if (picked) button(shop, ctx, "shop-refit-cancel", 24, 558, 260, 44, "재장비 취소", true, () => { shop.pick = null; shop.tab = "manage"; shop.note = ""; });
    else text(ctx, train.cars.length >= carCap() ? `편성 상한 ${carCap()}칸 · 구매하려면 기존 칸을 판매하세요.` : "무기칸은 자동 공격 · 지원칸은 인접 효과 · 자세한 수치는 칸 위에 마우스", 24, 580);
  } else {
    text(ctx, `편성 전체에 누적 적용 · 치명타 ${Math.round(critChance(c.pass) * 100)}% ×${critMult(c.pass).toFixed(2)}`, 24, 212, 20, "#ffdd75", true);
    passiveGeom(c).forEach((g) => {
      const lab = passiveLabel(c, g.id);
      button(shop, ctx, `shop-passive-${g.id}`, g.x, g.y, g.w, g.h,
        `${lab.now} → ${g.price === null ? "상한" : lab.next.split("  ")[0]}\n${g.price === null ? "더 강화할 수 없음" : `비용 ${g.price} S · 현재 Lv${g.lv}`}`,
        g.on, () => { if (buyPassive(shop, c, g.id)) { shop.note = `${passiveLabel(c, g.id).now} 강화 완료`; announceControl(shop.note); } });
    });
    const docs = c.doctrines.map((id) => DOCTRINES.flat().find((d) => d.id === id)?.name ?? id);
    text(ctx, `열차 교리: ${docs.length ? docs.join(" · ") : "아직 없음"}`, 24, 532);
    text(ctx, "전체 강화는 칸을 팔아도 유지됩니다. 판매 환급 대상이 아닙니다.", 24, 568);
  }
  text(ctx, shop.note || "시간이 멈춰 있습니다. 준비되면 출발하세요.", 24, 633, 18, shop.confirmSell ? "#ffe0a0" : "#fff1d2");
  button(shop, ctx, "shop-depart", 876, 602, 220, 44, "준비 완료 · 출발 ▶", true, () => { shop.confirmSell = null; onDepart(); });
  if (hover && mouse) tooltip(ctx, mouse.x, mouse.y, carName(hover.kind), carTip(hover.kind, hover.car, c.pass));
}

export function shopClick(shop: Shop, sx: number, sy: number): boolean {
  for (let i = shop.btns.length - 1; i >= 0; i--) {
    const b = shop.btns[i];
    if (sx < b.x || sx > b.x + b.w || sy < b.y || sy > b.y + b.h) continue;
    if (b.on) b.act();
    return true;
  }
  return true;
}
