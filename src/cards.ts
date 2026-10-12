// 선택 카드 (3택 1, 무료) — DESIGN §7.2 · §7.4 · BALANCE §7.
// 자리는 **웨이브 전환 2회 + 정차 직전 1회**라 스테이지당 3회 = 20스테이지 런에서 60회다
// (감독 #35 ① · BALANCE §7 제목). 3번째 자리는 `Field.cardToStation`이 참인 카드다.
// 정차역 상점과 같은 즉시 모드 캔버스 UI(그리면서 히트박스를 쌓고 click이 뒤에서부터 훑는다)이고,
// 같은 이유로 **시간을 멈춘다**(Field.card). 상점과 겹치지 않는 것이 §7.2의 설계다 —
// 카드는 랜덤 제안이고 **스크랩 비용이 없다**. 이 파일에서 c.scrap을 건드리는 곳은 하나도 없다.

import { activeSupport, activeWeapons, BRANCHES, CAR_KINDS, CAR_TEXT, CARDS, DOCTRINES, docValueOf, type Doctrine, type DocKey, VIEW } from "./balance";
import { buttonPanel, railInk, roundRect, slot, tooltip, woodPanel } from "./hud";
import type { Combat } from "./combat";
import { mulberry32 } from "./map";
import { bodyName, carName, carTip, dpsOf, drawCarArt, type CarKind, insertCar, makeCar, type Passive, type Train, trainDps, turretName } from "./train";

import { FONT, FONT_DISPLAY, TYPO, wrapText } from "./typography";
import { announceControl, beginControls, registerControl } from "./controls";

type TraitKey = keyof typeof CARDS.trait;

/** 카드 1장. `weapon`은 **보유 여부로 뜻이 갈린다** — 미보유면 새 칸 장착, 보유면 티어 진행 +1 (§7.2 표) */
export type Card =
  | { pool: "weapon"; kind: CarKind }
  | { pool: "support"; kind: CarKind }
  | { pool: "trait"; trait: TraitKey }
  /** **T3 진화 분기** (DESIGN §7.4). 다른 풀과 달리 뽑기가 아니라 **2택 강제**이고,
   * §7의 카드 자리를 쓰지 않는다 — 칸이 T3에 닿은 그 자리에서 열리는 별도 화면이다 */
  | { pool: "branch"; kind: CarKind; branch: string }
  /** **열차 교리** (DESIGN §D1 ⓐ · balance.ts `DOCTRINES`). 분기와 **같은 부류**다 — 뽑기가 아니라
   * 2택 강제이고 §7의 카드 자리를 안 쓴다. 다른 점은 대상이 «무기 하나»가 아니라 **편성 전체**라
   * `kind`가 없다는 것뿐이다(그림은 특성 카드와 같이 기관차를 세운다) */
  | { pool: "doctrine"; step: number; id: string };

type Btn = { x: number; y: number; w: number; h: number; act: () => void };

export type Cards = {
  /** 이번에 제시된 3장 */
  offer: Card[];
  /** 무기별 티어 진행도(장). CARDS.tierCards(2)에 닿으면 그 무기의 칸 **전체**가 티어업하고 0으로 돌아간다 */
  prog: Record<string, number>;
  /** 이번 런에 고른 카드의 라벨 (probe·인수인계용) */
  taken: string[];
  /** 제시한 횟수 (스테이지당 3회 = 20스테이지 런에서 60회 — probe cards.offered) */
  offered: number;
  /** **적 스폰과 분리된 난수 스트림.** f.rnd()를 쓰면 카드 한 장에 스폰 좌표가 통째로 밀려
   * STATUS·완료 기록의 실측값이 전부 무효가 된다 (enemy.ts bobPhase와 같은 함정) */
  rnd: ReturnType<typeof mulberry32>;
  btns: Btn[];
  feedback: { text: string; until: number } | null;
};

export function makeCards(seed: number): Cards {
  return { offer: [], prog: {}, taken: [], offered: 0, rnd: mulberry32(seed * 613 + 17), btns: [], feedback: null };
}

/** 살아 있는 무기 카드 종류 = WEAPONS에 등재되고 **잠금이 풀린** 것. BALANCE §7의 "5종 균등"은
 * §4의 무기 5종인데 §10 2차 "무기 완비"로 12종이 됐으므로 **있는 것만 균등**으로 나눈다.
 * **함수다** (iter63): 대공 플랙의 잠금이 조성(공중 적이 있는가)에 달린 런타임 조건이라
 * 모듈 로드 시점에 굳히면 안 된다. 표적이 없는 동안 플랙 카드를 제시하면 자동 카드(`hand`)가
 * 그것을 집어 9 seed 기준선이 조용히 망가진다 — 그것이 이 필터의 유일한 목적이다 */
const weaponKinds = (): CarKind[] => activeWeapons() as CarKind[];
/** 살아 있는 지원칸 카드 종류 = 지금 잠금이 풀린 것. 수리칸은 언제나 빠지고(게이트 맵 전용),
 * 관측칸은 **언덕이 적은 맵에서 빠진다**(§4.5 조건부 등장 — 감독 #47).
 * §7의 지원 비중 15%를 이 종끼리 균등으로 나눈다 — 무기 카드의 "있는 것만 균등"과 같은 규칙이다.
 * **const가 아니라 함수다** — `activeWeapons`와 같은 이유(모듈 로드 시점에 굳히면 안 열린다) */
const supportKinds = (): CarKind[] => activeSupport() as CarKind[];
const TRAIT_KEYS = Object.keys(CARDS.trait) as TraitKey[];

/** 이 무기의 현재 티어 = 그 무기 칸 중 최고 티어 (티어는 무기 단위라 보통 전부 같다) */
export function tierOf(train: Train, kind: CarKind): number {
  let t = 0;
  for (const c of train.cars) if (c.kind === kind) t = Math.max(t, c.tier);
  return t;
}

/** 이 분기 카드의 정의 (balance.ts BRANCHES) */
function branchDef(card: Card): { name: string; sub: string } | undefined {
  return card.pool === "branch" ? BRANCHES[card.kind]?.find((b) => b.id === card.branch) : undefined;
}

/** **T3 진화 분기 2택을 제시한다** (DESIGN §7.4). 뽑기가 아니라 그 무기의 두 갈래 전부이므로
 * `cards.rnd`도 `cards.offered`도 건드리지 않는다 — **§7의 카드 자리를 쓰지 않는다**는 뜻이다
 * (자리를 쓰면 T3에 닿는 것이 카드 1장을 빼앗는 벌칙이 된다) */
export function rollBranch(cards: Cards, kind: CarKind): void {
  cards.offer = (BRANCHES[kind] ?? []).map((b) => ({ pool: "branch", kind, branch: b.id }) as Card);
}

/** **열차 교리 2택을 제시한다** (`step` = 0-based 단). `rollBranch`와 같은 이유로 `cards.rnd`도
 * `cards.offered`도 안 건드린다 — 교리는 §7의 카드 자리를 쓰지 않는다 */
export function rollDoctrine(cards: Cards, step: number): void {
  cards.offer = (DOCTRINES[step] ?? []).map((d) => ({ pool: "doctrine", step, id: d.id }) as Card);
}

/** 이 교리 카드의 정의 (balance.ts DOCTRINES) */
export function doctrineDef(card: Card): Doctrine | undefined {
  return card.pool === "doctrine" ? DOCTRINES[card.step]?.find((d) => d.id === card.id) : undefined;
}

export function label(train: Train, card: Card): string {
  if (card.pool === "trait") {
    const v = CARDS.trait[card.trait];
    const pct = `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
    if (card.trait === "artCd") return `주포 쿨다운 ${pct}`;
    if (card.trait === "collectRadius") return `수집 반경 ${pct}`;
    return `주행 속도 ${pct}`;
  }
  if (card.pool === "support") return `${carName(card.kind)} 장착`;
  if (card.pool === "branch") return branchDef(card)?.name ?? card.branch;
  if (card.pool === "doctrine") return doctrineDef(card)?.name ?? card.id;
  const t = tierOf(train, card.kind);
  return t === 0 ? `${carName(card.kind)} 칸 장착` : `${carName(card.kind)} T${t} → 티어 진행`;
}

/** 카드 본문 한 줄. `pass`는 **생략할 수 없다** — 새 무기칸 카드가 적는 「DPS +n」은
 * 바로 위 머리글의 `trainDps`에 **더해지는 값**이라 같은 단위여야 하고, 그 단위가
 * BALANCE §0.7의 한 식(`단발 × 연사 × (1 + 치확 × (치피 − 1))`) = `dpsOf`다.
 * ⚠ 옛 판은 `WEAPONS[k].dmg × rate`(§4 표 원값)를 적어 **§0.7-B 배율(피해 ×3)·§0.5 공속 ×2·
 * 패시브·치명타가 전부 빠져 있었다** — 함포 카드가 「+10.0」이라고 적는 동안 실제 증분은 60이었고,
 * 같은 화면 46px 위의 「DPS 119.4」와 견줄 수가 없었다(iter120 · DESIGN §0.6 A2 · BALANCE §0.7 표 머리) */
export function sub(cards: Cards, train: Train, card: Card, pass: Passive): string {
  if (card.pool === "trait") return "열차 특성 (곱연산 누적)";
  if (card.pool === "branch") return branchDef(card)?.sub ?? "";
  if (card.pool === "doctrine") return doctrineDef(card)?.sub ?? "";
  if (card.pool === "support") return CAR_TEXT[card.kind]?.line ?? "지원칸";
  const t = tierOf(train, card.kind);
  if (t === 0) return `새 무기칸 (명목 DPS +${dpsOf(makeCar(card.kind), pass).toFixed(1)})`;
  const p = (cards.prog[card.kind] ?? 0) + 1;
  return p >= CARDS.tierCards
    // ⚠ **여기는 «총량»으로 적는다** — 카드 본문(`sub`)에는 제목과 달리 폭 맞춤이 없고(위 `drawCards`의
    // `measureText` 축소는 제목에만 걸린다) 카드 폭이 260px이라 「피해 +26% · 공속 +26%」는 새 나간다.
    // 몫 나누기(§0.7-L)의 전문은 **칸 툴팁**(`train.ts carTip`)이 진다 — 그쪽은 폭이 내용에 맞춰 자란다
    ? `${p}/${CARDS.tierCards} → T${t + 1} 즉시 (명목 DPS +${Math.round(CARDS.tierStep * 100)}%)`
    : `${p}/${CARDS.tierCards} — ${CARDS.tierCards - p}장 더 모으면 T${t + 1}`;
}

// ── 뽑기 ──────────────────────────────────────────────────────────────────

/** 후보 + 비중. **나올 수 없는 카드는 후보에서 빠지고 그 비중은 남은 후보에게 재분배된다**
 * (칸이 상한이면 칸 카드가, 티어가 상한이면 티어 카드가 빠진다) */
function pool(train: Train, maxCars: number): { card: Card; w: number }[] {
  const out: { card: Card; w: number }[] = [];
  const room = train.cars.length < maxCars;
  const wk = weaponKinds();
  const wW = CARDS.weight.weapon / wk.length;
  for (const k of wk) {
    const t = tierOf(train, k);
    // 미보유 = 새 칸(자리가 있어야 한다) / 보유 = 티어 진행(티어 상한이면 나오지 않는다)
    if (t === 0 ? room : t < CARDS.maxTier) out.push({ card: { pool: "weapon", kind: k }, w: wW });
  }
  // 지원칸은 **같은 종을 여러 대 놓을 수 있다**(무기와 달리 티어가 없다) — 자리만 있으면 계속 후보다
  const sk = supportKinds();
  const wS = CARDS.weight.support / sk.length;
  if (room) for (const k of sk) out.push({ card: { pool: "support", kind: k }, w: wS });
  const wT = CARDS.weight.trait / TRAIT_KEYS.length;
  for (const t of TRAIT_KEYS) out.push({ card: { pool: "trait", trait: t }, w: wT });
  return out;
}

/** 비복원 가중 추출로 3장을 제시한다. 후보가 3개 미만이면 있는 만큼만 (§7.2는 "3택 1"이지만
 * 티어·칸 상한에 걸려 후보가 마르는 것이 원칙적으로 가능하다 — 그때 빈 카드를 만들지는 않는다) */
export function rollOffer(cards: Cards, train: Train, maxCars: number): void {
  const cand = pool(train, maxCars);
  const picked: Card[] = [];
  for (let n = 0; n < CARDS.choices && cand.length; n++) {
    let total = 0;
    for (const c of cand) total += c.w;
    let r = cards.rnd() * total;
    let i = 0;
    for (; i < cand.length - 1; i++) {
      r -= cand[i].w;
      if (r <= 0) break;
    }
    picked.push(cand[i].card);
    cand.splice(i, 1);
  }
  cards.offer = picked;
  cards.offered++;
}

// ── 적용 ──────────────────────────────────────────────────────────────────

/** 카드 1장을 실제 효과로 바꾼다. **비용은 없다**(§7.2) */
export function applyCard(cards: Cards, card: Card, train: Train, c: Combat): void {
  cards.taken.push(label(train, card));
  if (card.pool === "trait") {
    // 전부 곱연산 누적. 주포 쿨다운은 combat이, 주행 속도는 train이 들고 있다
    if (card.trait === "artCd") c.artCdMult *= 1 + CARDS.trait.artCd;
    else if (card.trait === "collectRadius") c.collectMult *= 1 + CARDS.trait.collectRadius;
    else train.speed *= 1 + CARDS.trait.trainSpeed;
    return;
  }
  if (card.pool === "doctrine") {
    // 교리는 **편성 전체**에 걸린다 — 효과를 «칸»이 아니라 세 자루(패시브 배수 · 드랍 · 기동)에 곱한다.
    // 전부 곱연산 누적이고, 단이 겹치지 않으므로 같은 교리를 두 번 받는 일은 없다
    const d = doctrineDef(card);
    if (!d) return;
    c.doctrines.push(d.id);
    // 값은 표가 아니라 `docValueOf`에서 읽는다 — QA 사다리(`?docmult=`)가 지나는 유일한 문이다
    const v = (k: DocKey) => docValueOf(d, k);
    if (v("dmg")) c.pass.docDmg *= v("dmg")!;
    if (v("rate")) c.pass.docRate *= v("rate")!;
    if (v("crit")) c.pass.docCrit *= v("crit")!;
    if (v("drop")) c.docDrop *= v("drop")!;
    if (v("collect")) c.collectMult *= v("collect")!;
    if (v("speed")) train.speed *= v("speed")!;
    return;
  }
  if (card.pool === "branch") {
    // 분기는 **무기 단위**다 (§7.4 티어와 같은 규약) — T3에 닿은 그 무기의 칸 전부가 함께 진화한다.
    // T3 미만인 칸은 건드리지 않는다: 나중에 그 칸이 T3에 닿으면 `pendingBranch`가 물려준다
    for (const car of train.cars) {
      if (car.kind === card.kind && car.tier >= CARDS.maxTier && !car.branch) car.branch = card.branch;
    }
    return;
  }
  if (card.pool === "support" || tierOf(train, card.kind) === 0) {
    // 카드로 받은 칸도 `invested`는 §3 표값이다 — 시작 편성의 칸과 같은 규칙(train.ts Car.invested 주석).
    // 판매 환급이 되는 셈이라 STATUS "미결 질문"에 재원 유출로 등재해 뒀다
    // 상점 구매와 같은 §6.1 기본 삽입 위치를 쓴다 (train.ts insertCar)
    insertCar(train, makeCar(card.kind));
    return;
  }
  // 티어 진행 (§7.4 "동일 무기 카드 2장 추가"). 티어는 **무기 단위**라 그 무기의 칸이 함께 오른다
  const p = (cards.prog[card.kind] ?? 0) + 1;
  if (p < CARDS.tierCards) {
    cards.prog[card.kind] = p;
    return;
  }
  cards.prog[card.kind] = 0;
  for (const car of train.cars) {
    if (car.kind === card.kind && car.tier < CARDS.maxTier) car.tier++;
  }
}

// ── 렌더 + 입력 ───────────────────────────────────────────────────────────

const CARD = { w: 344, h: 442, gap: 24 };
/** 본문 스프라이트의 긴 변(px). 세로폭은 이 값의 0.32~0.41배라 132px 본문에 들어간다 */
const ART = 160;

/** The picture shows the actual resulting tier, including incomplete 1/2 progress. */
export function cardArtTier(cards: Cards, train: Train, card: Card): number {
  if (card.pool === "branch") return CARDS.maxTier;
  if (card.pool !== "weapon") return 1;
  const tier = tierOf(train, card.kind);
  if (!tier) return 1;
  return Math.min(CARDS.maxTier, tier + ((cards.prog[card.kind] ?? 0) + 1 >= CARDS.tierCards ? 1 : 0));
}

export function drawCards(
  ctx: CanvasRenderingContext2D, cards: Cards, train: Train, stage: number, nextLabel: string,
  mouse: { x: number; y: number } | null, pass: Passive, onPick: (card: Card) => void,
): void {
  beginControls("카드 선택");
  cards.btns = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b120fde";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff1d2";
  ctx.font = `34px ${FONT_DISPLAY}`;
  const evo = cards.offer[0]?.pool === "branch";
  const doc = cards.offer[0]?.pool === "doctrine";
  const docStep = doc && cards.offer[0].pool === "doctrine" ? cards.offer[0].step + 1 : 0;
  ctx.fillText(doc ? `STAGE ${stage} · 열차 교리 ${docStep}단` : evo ? `STAGE ${stage} · T3 진화 분기` : `STAGE ${stage} · 선택 카드`, VIEW.w / 2, 108);
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = "#e5d5b8";
  ctx.fillText(`${cards.offer.length}택 1 · ${doc || evo ? "선택 후 변경 불가" : "무료"} · 편성 ${train.cars.length} · 명목 DPS ${trainDps(train, pass).toFixed(1)} · 다음: ${nextLabel}`, VIEW.w / 2, 142);
  const n = cards.offer.length;
  const totalW = n * CARD.w + (n - 1) * CARD.gap;
  const y = 184;
  let hover: { kind: CarKind; car: import("./train").Car } | null = null;
  for (let i = 0; i < n; i++) {
    const card = cards.offer[i];
    const x = (VIEW.w - totalW) / 2 + i * (CARD.w + CARD.gap);
    const hue = card.pool === "weapon" ? "#e69c62" : card.pool === "support" ? "#80ccbc" : card.pool === "branch" ? (i === 0 ? "#f0c864" : "#9bd9e2") : card.pool === "doctrine" ? "#e69e86" : "#bcacee";
    woodPanel(ctx, x, y, CARD.w, CARD.h, 12);
    ctx.save();
    roundRect(ctx, x + 2, y + 2, CARD.w - 4, CARD.h - 4, 10);
    ctx.clip();
    ctx.fillStyle = "#31382f";
    ctx.fillRect(x + 5, y + 5, CARD.w - 10, 41);
    ctx.fillStyle = hue;
    ctx.fillRect(x + 16, y + 16, 3, 19);
    ctx.restore();
    const hovered = !!mouse && mouse.x >= x && mouse.x <= x + CARD.w && mouse.y >= y && mouse.y <= y + CARD.h;
    ctx.strokeStyle = hovered ? hue : "#74765a77";
    ctx.lineWidth = hovered ? 2 : 1;
    roundRect(ctx, x + 1, y + 1, CARD.w - 2, CARD.h - 2, 11);
    ctx.stroke();
    ctx.fillStyle = hue;
    ctx.font = TYPO.button;
    ctx.textAlign = "center";
    const band = card.pool === "support" ? "지원 칸 추가" : card.pool === "trait" ? "열차 특성" : card.pool === "doctrine" ? `${doctrineDef(card)?.axis ?? "열차"} 교리 ${card.step + 1}단` : card.pool === "branch" ? `분기 ${i === 0 ? "A" : "B"} · ${carName(card.kind)} T3` : tierOf(train, card.kind) === 0 ? "새 무기 칸" : "무기 티어 진행";
    ctx.fillText(band, x + CARD.w / 2, y + 30);
    const art = card.pool === "trait" || card.pool === "doctrine" ? "hero" : card.kind;
    const artTier = cardArtTier(cards, train, card);
    const existing = train.cars.filter((car) => car.kind === art).sort((a, b) => b.tier - a.tier)[0];
    const branch = card.pool === "branch" ? card.branch : existing?.branch ?? null;
    slot(ctx, x + 18, y + 58, CARD.w - 36, 120, 5);
    drawCarArt(ctx, art, x + CARD.w / 2, y + 116, art === "observer" ? 138 : 170, Math.PI / 2, Math.PI / 2, undefined, artTier, branch);
    // Shape + letter distinguish branches without relying on color or the shared base sprite.
    if (card.pool === "branch" || card.pool === "doctrine") {
      ctx.fillStyle = hue;
      ctx.beginPath();
      if (i === 0) ctx.arc(x + 33, y + 78, 19, 0, Math.PI * 2);
      else { ctx.moveTo(x + 33, y + 56); ctx.lineTo(x + 55, y + 78); ctx.lineTo(x + 33, y + 100); ctx.lineTo(x + 11, y + 78); ctx.closePath(); }
      ctx.fill();
      ctx.fillStyle = "#21180f";
      ctx.font = TYPO.button;
      ctx.fillText(i === 0 ? "A" : "B", x + 33, y + 84);
    }
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = "#ffe0a0";
    const before = card.pool === "weapon" ? tierOf(train, card.kind) : 0;
    const progressOnly = card.pool === "weapon" && before > 0 && artTier === before;
    ctx.fillText(progressOnly ? `선택 후 T${artTier} 유지 · ${(cards.prog[card.kind] ?? 0) + 1}/${CARDS.tierCards}장` : card.pool === "weapon" || card.pool === "branch" ? `선택 후 모습 · T${artTier}` : card.pool === "support" ? "새 지원칸 1개 추가" : "열차 전체에 적용", x + CARD.w / 2, y + 197);
    ctx.fillStyle = "#fff3d2";
    ctx.font = `26px ${FONT_DISPLAY}`;
    const title = card.pool === "weapon" && before > 0 ? `${carName(card.kind)} · ${progressOnly ? "진행 +1" : `T${before} → T${artTier}`}` : label(train, card);
    const titleLines = wrapText(ctx, title, CARD.w - 48);
    titleLines.forEach((line, row) => ctx.fillText(line, x + CARD.w / 2, y + 234 + row * 29));
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = railInk.muted;
    let body = sub(cards, train, card, pass);
    if (card.pool === "branch") {
      const b = BRANCHES[card.kind]?.find((candidate) => candidate.id === card.branch);
      if (b && b.dmg !== 1) body += ` · ${b.dmg > 1 ? `연사 ×${+(1 / b.dmg).toFixed(2)}` : `단발 ×${b.dmg}`}`;
    }
    wrapText(ctx, body, CARD.w - 48).forEach((line, row) => ctx.fillText(line, x + CARD.w / 2, y + 269 + (titleLines.length - 1) * 29 + row * 27));
    const by = y + CARD.h - 64;
    buttonPanel(ctx, x + 24, by, CARD.w - 48, 46, "primary", hovered);
    ctx.fillStyle = railInk.dark;
    ctx.font = TYPO.button;
    ctx.textBaseline = "middle";
    ctx.fillText(`선택 ${i + 1}`, x + CARD.w / 2, by + 23);
    ctx.textBaseline = "alphabetic";
    const rect = { x, y, w: CARD.w, h: CARD.h };
    const act = () => {
      onPick(card);
      cards.feedback = { text: `${title} 선택 완료${progressOnly ? ` · T${artTier} 유지` : ""}`, until: performance.now() + 2800 };
      announceControl(`${title} 선택 완료. ${body}`);
    };
    cards.btns.push({ ...rect, act });
    registerControl(`card-${i}`, `${band}. ${title}. ${body}. 선택`, rect, act);
    if (card.pool !== "trait" && card.pool !== "doctrine" && mouse && mouse.x >= x && mouse.x <= x + CARD.w && mouse.y >= y && mouse.y <= y + CARD.h) {
      hover = { kind: card.kind, car: { ...(existing ?? makeCar(card.kind)), tier: artTier, branch } };
    }
  }
  ctx.fillStyle = "#e5d5b8";
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(evo ? "분기는 공격 방식을 바꿉니다 · 명목 DPS는 유지됩니다" : "Tab으로 이동 · Enter 또는 Space로 선택 · 선택 중 시간 정지", VIEW.w / 2, 666);
  if (hover && mouse) tooltip(ctx, mouse.x, mouse.y, `선택 후: ${carName(hover.kind)}`, carTip(hover.kind, hover.car, pass));
}

/** Short visual receipt; wall clock only, with no effect on simulation time. */
export function drawCardFeedback(ctx: CanvasRenderingContext2D, cards: Cards): void {
  if (!cards.feedback || performance.now() >= cards.feedback.until) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  woodPanel(ctx, 24, VIEW.h - 64, 800, 44, 8);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff3d2";
  ctx.font = TYPO.button;
  ctx.fillText(cards.feedback.text, 424, VIEW.h - 42);
}

/** **QA 전용 — 칸 그림 대조표** (`?cardsheet=1` · §0.6 A3 판정 「16종 전부의 카드 컷」).
 * 카드 본문과 **완전히 같은 호출**(`drawCarArt(..., ART, π/2)`)을 CAR_KINDS 전부에 대해 늘어놓는다 —
 * 카드 화면은 한 번에 3장뿐이라 「어느 종의 그림이 안 서는가」를 한 컷으로 못 본다.
 * 그림 대신 셀 이름을 찍지 않는다: **비어 보이면 그것이 결함이다**(옛 경로가 조용히 반환하던 자리).
 *
 * `tier`를 주면 **그 티어의 포탑**으로 전종을 그리고(§0.6 E 판정 「티어별로 찍는다」),
 * `?cardsheet=tiers`면 한 컷에 **T1·T2·T3를 나란히** 세운다 — 세 컷을 번갈아 보지 않아도
 * 「무기별로 3단이 실제로 갈리는가」가 한 화면에서 읽힌다. */
export function drawCardArtSheet(ctx: CanvasRenderingContext2D, tier = 1, allTiers = false): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#141210";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f0e2c0";
  ctx.font = `28px ${FONT_DISPLAY}`;
  const tiers = allTiers ? [1, 2, 3] : [tier];
  ctx.fillText(
    allTiers
      ? `칸 그림 대조표 — ${CAR_KINDS.length}종 × T1·T2·T3 (카드 본문과 같은 경로)`
      : `칸 그림 대조표 — ${CAR_KINDS.length}종 T${tier} (카드 본문과 같은 경로)`,
    VIEW.w / 2, 34
  );
  const cols = allTiers ? 9 : 6;
  const cw = VIEW.w / cols;
  // 칸 높이는 **가장 넓은 차체**(car_observer, w/h 0.83)가 ART로 누웠을 때의 세로폭에서 잡는다 —
  // 카드 본문(132px)과 같은 여유가 아니면 「대조표에서만 넘치는」 거짓 결함이 보인다
  const ch = allTiers ? 108 : 190; // 티어 3열 = 17종 × 3 = 51칸이 6행이라 720px 안에 다 들어와야 한다
  const art = allTiers ? ART * 0.6 : ART;
  const cells = CAR_KINDS.flatMap((kind) => tiers.map((t) => ({ kind, t })));
  cells.forEach(({ kind, t }, i) => {
    const cx = (i % cols) * cw + cw / 2;
    const cy = 60 + Math.floor(i / cols) * ch;
    woodPanel(ctx, cx - cw / 2 + 4, cy, cw - 8, ch - 10, 8);
    drawCarArt(ctx, kind, cx, cy + (allTiers ? 42 : 78), art, Math.PI / 2, Math.PI / 2, undefined, t);
    ctx.fillStyle = "#f0e2c0";
    ctx.font = `bold ${allTiers ? 12 : 15}px ${FONT}`;
    ctx.fillText(allTiers ? `${carName(kind)} T${t}` : carName(kind), cx, cy + ch - (allTiers ? 24 : 34));
    ctx.fillStyle = "#a89878";
    ctx.font = `${allTiers ? 10 : 12}px ${FONT}`;
    ctx.fillText(turretName(kind, t) ?? bodyName(kind), cx, cy + ch - (allTiers ? 11 : 18));
  });
}

/** 화면 좌표 클릭을 카드에 전달한다. 카드가 열려 있으면 항상 true를 돌려 **주포 발사로 새지 않게** 한다 */
export function cardsClick(cards: Cards, sx: number, sy: number): boolean {
  for (const b of cards.btns) {
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
      b.act();
      break;
    }
  }
  return true;
}
