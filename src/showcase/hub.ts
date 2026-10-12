// **쇼케이스 허브** (DESIGN §10 0.5단계 — "게임 코드에 넣기 전 에셋·수치·이펙트를 한눈에 검수하는
// 정적 페이지" + §10 2차 본대 "이펙트 탭 + 완비 반영").
//
// **이 파일은 게임 렌더 경로를 한 줄도 안 건드린다** — balance/sprites/fx/map/plate/train에서
// **읽기만** 한다. 그것이 이 작업의 성립 조건이다(STATUS 큐 5 "범위 함정").
// 수치는 하나도 안 적는다: 표에 뜨는 모든 눈금은 balance.ts(= BALANCE.md 정본)에서 읽은 값이고,
// 여기 있는 것은 라벨·설명·레이아웃뿐이다.
//
// 판정 컷: `npm run hub` → shots/hub-<탭>.png. 기계 검산은 `window.__hub()`.

import {
  ARTILLERY, BRANCHES, CAR_KINDS, FX_RULE, CAR_TEXT, CURVE, ENEMY_STATS, FACTIONS, MIX_ROLES, FORMATIONS, FORMATION_OF, LAYOUT, MAPS, MID_KINDS, MULT,
  SUPPORT, TERRAIN, TIER_FX, TRAIN, VARIANT_KINDS, WEAPONS, WEAPON_FX, isBossWave, isMidWave,
} from "../balance";
import { FX } from "../fx";
import { drawMap, generateMap, stageTerrain, type GameMap } from "../map";
import { buildBackground, drawBackground, loadPlate } from "../plate";
import { draw, failed, loadSprites, sprite } from "../sprites";
import { dpsOf, drawCarArt, makeCar, type CarKind } from "../train";
import { classify, GROUPS, type Entry } from "./taxonomy";

const TABS = [
  { id: "home", label: "홈" },
  { id: "parts", label: "구성요소" },
  { id: "weapons", label: "무기 도감" },
  { id: "fx", label: "이펙트" },
  { id: "map", label: "맵" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── DOM 헬퍼 ────────────────────────────────────────────────────────────────
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, html?: string
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}
function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}

// ── 스프라이트 썸네일 ───────────────────────────────────────────────────────
/** 적 한 종의 셀을 캔버스 하나에 그린다. 표시 배율(`scale`)까지 게임과 같은 규약으로 태운다 */
function enemyThumb(kind: string, box = 54): HTMLCanvasElement {
  const st = ENEMY_STATS[kind];
  const c = el("canvas");
  c.width = c.height = box;
  const g = c.getContext("2d")!;
  const name = st.sprite ?? kind;
  if (!sprite(name)) {
    g.fillStyle = "#d9744a";
    g.font = "10px monospace";
    g.fillText("no cell", 4, box / 2);
    return c;
  }
  draw(g, name, box / 2, box / 2, box * 0.72 * (st.scale ?? 1));
  return c;
}

/** 열차 칸 한 량 — **게임·카드와 같은 헬퍼 하나**(train.ts `drawCarArt`)를 부른다 (§0.6 A3).
 * iter81까지는 여기에 2패스 사본이 따로 있었다 — 사본이 있으면 필드가 고쳐져도 허브는 안 따라온다 */
function carThumb(kind: CarKind, box = 62): HTMLCanvasElement {
  const c = el("canvas");
  c.width = c.height = box;
  drawCarArt(c.getContext("2d")!, kind, box / 2, box / 2, box * 0.86);
  return c;
}

// ── 능력 배지 ───────────────────────────────────────────────────────────────
type St = (typeof ENEMY_STATS)[string];
/** §8 고유 행동을 한 줄 라벨로. **판정에 안 쓰는 표시용 문자열이고 수치는 전부 정본에서 읽는다** */
function abilities(st: St): string[] {
  const t: string[] = [];
  if (st.frontShield) t.push(`전면 실드 ${st.frontShield}`);
  if (st.standoff) t.push(`교전 ${num(st.standoff)}R`);
  if (st.cover) t.push("완전 은폐");
  if (st.stealth) t.push("지형 은신");
  if (st.split) t.push(`분열 ${st.split.into} ×${st.split.n}`);
  if (st.spawner) t.push(`산란 ${st.spawner.everySec}s · 상한 ${st.spawner.cap}`);
  if (st.raise) t.push(`재소환 ${st.raise.everySec}s · 상한 ${st.raise.cap}`);
  if (st.spore) t.push(`포자 ${st.spore.perHits}히트 · 상한 ${st.spore.cap}`);
  if (st.aura) t.push(`이속 오라 ×${st.aura.speed} (r ${st.aura.r})`);
  if (st.heal) t.push(`회복 ${st.heal.perSec}/s · 평생 ${st.heal.pool}`);
  if (st.dome) t.push(`실드 돔 r ${st.dome.r} (곡사 외 면역)`);
  if (st.smoke) t.push(`연막 r ${st.smoke.r} · 직사 ×${st.smoke.dmg}`);
  if (st.banner) t.push(`방벽 ×${st.banner.ward} · 평생 ${st.banner.pool}`);
  if (st.deathRage) t.push(`사망 광폭화 ×${st.deathRage.speed} / ${st.deathRage.sec}s`);
  if (st.breaker) t.push(`성벽 파괴 ${st.breaker.dmg}/${st.breaker.everySec}s`);
  if (st.recoil) t.push(`충돌 반동 ${st.recoil}`);
  if (st.regen) t.push(`재생 ${st.regen.perSec}/s (화염이 ${st.regen.blockSec}s 차단)`);
  if (st.carapace) t.push(`등껍질 곡사 ×${st.carapace.arc} · 직사 ×${st.carapace.direct}`);
  if (st.mired) t.push(`웅덩이 ×${st.mired}`);
  if (st.debris) t.push(`사망 잔해 HP ${st.debris.hp}`);
  if (st.revive) t.push(`재기동 ${st.revive.chance * 100}%`);
  if (st.amphib) t.push("수륙양용");
  if (st.inWater) t.push("호수 고정 출현");
  if (st.leap) t.push(`웅덩이 도약 ×${st.leap.mult}`);
  if (st.grab) t.push(`열차 감속 ×${st.grab.slow} (r ${st.grab.r})`);
  if (st.cargo) t.push(`화물 ${st.cargo.into} ×${st.cargo.n}`);
  if (st.air) t.push("공중");
  if (st.suicide) t.push(`자폭 ${st.suicide.dmg}`);
  if (st.perch) t.push(`착지 정지 (r ${st.perch.r})`);
  if (st.scout) t.push(`정찰 — 다음 웨이브 최대 +${Math.round(st.scout.max * 100)}%`);
  if (st.gnaw) t.push(`코어 갉기 ${st.gnaw}/s`);
  if (st.plant) t.push(`폭탄 설치 후 이탈`);
  if (st.fuse) t.push(`도화선 ${st.fuse.sec}s → ${st.fuse.dmg}`);
  if (st.reposition) t.push(`재배치 ${st.reposition.fireSec}s 사격 / ${st.reposition.moveSec}s 이동`);
  if (st.spit) t.push(`무기칸 저하 공속 ×${st.spit.rate} · 피해 ×${st.spit.dmg}`);
  if (st.puddle) t.push(`산성 웅덩이 ${st.puddle.dps}/s · ${st.puddle.sec}s`);
  if (st.coreHit) t.push(`코어 점타 ${st.coreHit.dmg}/${st.coreHit.everySec}s`);
  if (st.roar) t.push(`포효 소환 ${st.roar.kind} ×${st.roar.n}`);
  if (st.rage) t.push(`광폭화 ×${st.rage.speed} (HP ${st.rage.atPct * 100}%)`);
  return t;
}

// ── 홈 ─────────────────────────────────────────────────────────────────────
const cls = classify();
/** 로드된 스프라이트 셀 수 (팔레트 스왑 사본 포함) — boot()가 채운다 */
let spriteTotal = 0;

function tabHome(root: HTMLElement): void {
  root.append(el("h2", "", "무엇을 만드는가"));
  root.append(el("p", "note",
    "루프 레일 위를 도는 무장 열차로 중앙 코어를 지키는 <b>2D 탑다운 타워디펜스</b>. " +
    "적의 목표는 코어 하나뿐이고 열차는 <b>HP 없는 이동 장벽</b>이다(DESIGN §8.0). " +
    "이 페이지는 게임 코드에 넣기 전 에셋·수치·이펙트를 한눈에 보는 검수 도구다 — <b>게임 화면이 아니다</b>."));

  const kpi = el("div", "kpi");
  const rows: [string, string | number][] = [
    ["적 로스터", `${Object.keys(ENEMY_STATS).length}행`],
    ["└ 변종", `${VARIANT_KINDS.length}종`],
    ["└ 관문 풀", `중간보스 ${MID_KINDS.length} · 보스 1`],
    ["무기", `${Object.keys(WEAPONS).length}종 × T3 분기`],
    ["지원칸", `${Object.keys(SUPPORT).length}종`],
    ["웨이브", `${CURVE.waves} (${CURVE.waves / CURVE.wavesPerStage}스테이지)`],
    ["스프라이트", `${spriteTotal}장`],
    ["이펙트", `${Object.keys(FX).length}종`],
  ];
  for (const [k, v] of rows) kpi.append(el("div", "", `<b>${v}</b><span>${k}</span>`));
  root.append(kpi);

  root.append(el("h2", "", "정본 문서"));
  root.append(el("p", "note",
    "화면의 모든 눈금은 <code>src/balance.ts</code>에서 읽는다 — 이 페이지는 수치를 하나도 안 적는다."));
  const ul = el("ul");
  for (const [f, d] of [
    ["docs/DESIGN.md", "무엇을 만드는가 — 공간 비율 §5.0 · 적 목표 모델 §8.0 · 로드맵 §10"],
    ["docs/BALANCE.md", "수치 정본 — 여기 없는 값은 «자유 변수»로 STATUS 미결 질문에 올린다"],
    ["docs/STATUS.md", "인수인계서 — 지금 위치 · 큐 · 완성 기준"],
  ]) ul.append(el("li", "", `<code>${f}</code> — ${d}`));
  root.append(ul);

  root.append(el("h2", "", "분류표 정합"));
  if (cls.unknown.length) {
    root.append(el("div", "warn",
      `§8 유형표에 없는 적종 ${cls.unknown.length}개: <code>${cls.unknown.join(", ")}</code> — ` +
      `<code>src/showcase/taxonomy.ts</code>가 balance.ts보다 뒤처졌다.`));
  } else {
    root.append(el("p", "note",
      `<code>ENEMY_STATS</code> ${Object.keys(ENEMY_STATS).length}행이 전부 §8 여덟 유형 + 관문으로 분류됐다. ` +
      `누락 스프라이트 ${failed.length}건.`));
  }
}

// ── 구성요소 ────────────────────────────────────────────────────────────────
/** 적종 → 그 종을 세우는 진영 이름 목록 (§0.6 D). 부족은 조성표의 키가 곧 종이라 역할 슬롯
 * 여덟 개가 그대로 그 진영의 목록이다 */
const FACTION_OF: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const f of Object.values(FACTIONS)) {
    for (const role of MIX_ROLES) (out[f.kinds[role] ?? role] ??= []).push(f.name);
  }
  return out;
})();

function enemyCard(e: Entry): HTMLElement {
  const st = ENEMY_STATS[e.kind];
  const card = el("div", "card");
  const top = el("div", "top");
  top.append(enemyThumb(e.kind));
  const nm = el("div");
  nm.append(el("div", "name", NAMES[e.kind] ?? e.kind));
  nm.append(el("div", "key", e.kind));
  top.append(nm);
  card.append(top);
  card.append(el("div", "stat",
    `<span>HP <b>${st.hp}</b></span><span>이속 <b>${num(st.speed)}</b></span><span>드랍 <b>${st.scrap}</b></span>`));
  const tags = el("div", "tags");
  // **소속 대형** (§0.6 C2 배치표). 표에 없는 종은 태그가 없다 = 무소속(흩어져 오는 무리)이라는 뜻이고,
  // D(진영 로테이션)가 `FORMATIONS[].kinds`를 갈아 끼우면 여기가 그대로 따라온다
  if (FORMATION_OF[e.kind]) tags.append(el("span", "tag var", FORMATIONS[FORMATION_OF[e.kind]].name));
  // **소속 진영** (§0.6 D 로테이션표). 태그가 없으면 어느 진영의 조성에도 안 서는 종이다
  // (= `?amph=`·`?air=` 같은 QA 조성으로만 나온다) — 「67종 중 몇이 실제로 판에 서는가」가 여기서 읽힌다
  for (const f of FACTION_OF[e.kind] ?? []) tags.append(el("span", "tag var", f));
  if (e.sub) tags.append(el("span", "tag sub", "부속체"));
  if (e.via === "variant") tags.append(el("span", "tag var", `변종 ← ${e.of}`));
  if (e.via === "mid") tags.append(el("span", "tag var", `강화판 ← ${e.of}`));
  for (const a of abilities(st)) tags.append(el("span", "tag", a));
  card.append(tags);
  return card;
}

function tabParts(root: HTMLElement): void {
  root.append(el("h2", "", `열차 — 칸 ${CAR_KINDS.length}종`));
  root.append(el("p", "note",
    `시작 편성은 주인공 칸 + 무기 2 + 수집 1이고 상한은 12량(§6.1). ` +
    `칸에는 <b>HP가 없다</b> — 열차는 이동 장벽이다(§8.0).`));
  const cars = el("div", "grid");
  for (const k of CAR_KINDS) {
    const card = el("div", "card");
    const top = el("div", "top");
    top.append(carThumb(k));
    const nm = el("div");
    nm.append(el("div", "name", NAMES[k] ?? k));
    nm.append(el("div", "key", k));
    top.append(nm);
    card.append(top);
    const w = WEAPONS[k];
    const s = SUPPORT[k];
    if (w) card.append(el("div", "stat",
      `<span>명목 DPS <b>${num(w.dmg * w.rate)}</b></span><span>사거리 <b>${num(w.range)}R</b></span>`));
    else if (s) card.append(el("div", "stat", `<span>지원칸</span>`));
    else card.append(el("div", "stat", `<span>${k === "hero" ? "주포 = 조준 포격" : "자동 사격 없음"}</span>`));
    card.append(el("div", "tags", (w?.inactive || s?.inactive) ? '<span class="tag sub">비활성 — 상점·카드 제외</span>' : ""));
    cars.append(card);
  }
  root.append(cars);

  for (const g of GROUPS) {
    const list = cls.byGroup[g.id];
    if (!list.length) continue;
    root.append(el("h2", "", `${g.label} — ${list.length}행`));
    root.append(el("p", "note", g.note));
    const grid = el("div", "grid");
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(268px, 1fr))";
    for (const e of list) grid.append(enemyCard(e));
    root.append(grid);
  }
}

// ── 무기 도감 ───────────────────────────────────────────────────────────────
function weaponTags(k: string): string[] {
  const w = WEAPONS[k];
  const t: string[] = [w.arc ? "곡사 — 사선 무시" : "직사"];
  if (w.pierceWalls) t.push(`성벽 ${w.pierceWalls}장 관통`);
  if (w.splash) t.push(`착탄 반경 ${w.splash}R`);
  if (w.hitSplash) t.push(`명중 광역 ${w.hitSplash}R`);
  if (w.cone) t.push(`부채꼴 반각 ${w.cone}°`);
  if (w.chain) t.push(`체인 ${w.chain}기 (도약 ${w.chainJump}R)`);
  if (w.ignoreLos) t.push("사선 무시");
  if (w.ramp) t.push(`조사 증폭 ×${w.ramp} / ${w.rampSec}s`);
  if (w.homing) t.push("유도");
  if (w.salvo) t.push(`분산 ${w.salvo}발 (${w.spread}R · 발당 1/${w.salvo})`);
  if (w.burn) t.push(`화염 지대 ${w.burn.sec}s`);
  if (w.airOnly) t.push("공중 전용");
  if (w.inactive) t.push("비활성 — 표적 없음");
  return t;
}

function tabWeapons(root: HTMLElement, outerR: number): void {
  root.append(el("h2", "", `무기 ${Object.keys(WEAPONS).length}종 × T3 분기`));
  root.append(el("p", "note",
    `스탯은 <b>T1 Lv1 명목값</b>(BALANCE §4). 사거리 단위는 «루프 반경 = 1»이라 월드 환산은 ` +
    `×${Math.round(outerR)}이고, 코어는 레일에서 정확히 1.0R이다. ` +
    `실전에는 공속 ×${MULT.fireRate}·단발 ×${MULT.dmg}가 곱해진다 — 그것이 <b>실효 DPS</b> 열이고, ` +
    `게임 안 모든 화면(HUD·상점·카드·툴팁)이 쓰는 단위다(감독 판정 6).`));
  const grid = el("div", "grid");
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(330px, 1fr))";
  for (const k of Object.keys(WEAPONS)) {
    const w = WEAPONS[k];
    const card = el("div", "card");
    const top = el("div", "top");
    top.append(carThumb(k as CarKind));
    const nm = el("div");
    nm.append(el("div", "name", NAMES[k] ?? k));
    nm.append(el("div", "key", k));
    top.append(nm);
    card.append(top);
    card.append(el("div", "stat",
      `<span>단발 <b>${w.dmg}</b></span><span>연사 <b>${num(w.rate)}/s</b></span>` +
      // **감독 판정 6(DESIGN §0.7 · 2026-08-24)** — 화면은 실효 하나만 쓰고 «기본값을 병기하는 자리는
      // 도감뿐»이다. 그래서 여기만 두 값이다: `기본`은 §4 표 원값(배율 전 · 무기 간 상대 관계),
      // `실효`는 게임 안 모든 화면과 같은 단위(`dpsOf` = T1 Lv1 · 패시브 0단계 · §0.7-B 배율 포함)
      `<span>기본 DPS <b>${num(w.dmg * w.rate)}</b></span>` +
      `<span>실효 DPS <b>${num(dpsOf(makeCar(k as CarKind)))}</b></span>` +
      `<span>사거리 <b>${num(w.range)}R</b> (${Math.round(w.range * outerR)})</span>`));
    const tags = el("div", "tags");
    for (const t of weaponTags(k)) tags.append(el("span", "tag", t));
    card.append(tags);
    const br = BRANCHES[k];
    if (br) {
      const box = el("div", "branch");
      for (const b of br) box.append(el("div", "",
        `<b>${b.name}</b><p>${b.sub}</p><p class="key">단발 ×${b.dmg}${b.range ? ` · 사거리 ×${b.range}` : ""}</p>`));
      card.append(box);
    }
    grid.append(card);
  }
  root.append(grid);

  root.append(el("h2", "", "조준 포격 (주인공 칸 주포)"));
  root.append(el("p", "note", "플레이어 개입 1종 — 자동 사격을 하지 않고 클릭한 지점에 착탄한다. 사거리 무제한(§6.2)."));
  const t = el("table");
  t.innerHTML =
    `<tr><th>피해</th><th>반경</th><th>지형 배수</th><th>착탄 지연</th><th>쿨다운</th></tr>` +
    `<tr><td>${ARTILLERY.dmg}</td><td>${ARTILLERY.radius}R</td><td>×${ARTILLERY.terrainMult}</td>` +
    `<td>${ARTILLERY.delaySec}s</td><td>${ARTILLERY.cooldownSec}s</td></tr>`;
  root.append(t);

  root.append(el("h2", "", `지원칸 ${Object.keys(SUPPORT).length}종`));
  root.append(el("p", "note", `«인접» = 앞뒤 1칸. 무기가 아니라 옆 칸을 바꾼다.`));
  const st = el("table");
  st.innerHTML = `<tr><th>칸</th><th>효과</th><th>등장 조건</th></tr>` +
    Object.keys(SUPPORT).map((k) => {
      const s = SUPPORT[k];
      const eff = s.rate ? `인접 무기칸 공속 ×${s.rate}` : s.overHills ? "인접 직사 무기가 언덕 너머 사격" : "필드 드랍 흡수";
      const cond = s.inactive ? "비활성(일반 맵에 대상 없음)" : s.needHills ? `맵 언덕 ${s.needHills}개 이상` : "상시";
      return `<tr><td>${NAMES[k] ?? k} <span class="key">${k}</span></td><td>${eff}</td><td>${cond}</td></tr>`;
    }).join("");
  root.append(st);
}

// ── 이펙트 ──────────────────────────────────────────────────────────────────
const players: { g: CanvasRenderingContext2D; kind: string; box: number }[] = [];

function tabFx(root: HTMLElement): void {
  root.append(el("h2", "", `이펙트 ${Object.keys(FX).length}종`));
  root.append(el("p", "note",
    "왼쪽 = 실동작 루프(합성·페이드·확대까지 게임과 같은 규약), 오른쪽 = 프레임 스트립. " +
    "여기 수치는 <b>전부 연출 전용</b>이고 판정에 안 쓰인다(<code>src/fx.ts</code>)."));
  const grid = el("div", "grid");
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(360px, 1fr))";
  for (const kind of Object.keys(FX)) {
    const def = FX[kind];
    const card = el("div", "card");
    card.append(el("div", "name", kind));
    card.append(el("div", "stat",
      `<span>프레임 <b>${def.frames.length}</b></span><span>지속 <b>${def.dur}s</b></span>` +
      `<span>합성 <b>${def.blend}</b></span><span>크기 <b>${def.size}</b></span>` +
      (def.grow ? `<span>확대 <b>×${def.grow}</b></span>` : "") +
      (def.then ? `<span>연결 <b>${def.then}</b></span>` : "")));
    const row = el("div", "fx");
    const play = el("canvas");
    play.width = play.height = 96;
    play.style.background = "#0b0f06";
    play.style.borderRadius = "5px";
    row.append(play);
    players.push({ g: play.getContext("2d")!, kind, box: 96 });
    const strip = el("div", "strip");
    for (const f of def.frames) {
      const c = el("canvas");
      c.width = c.height = 42;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0b0f06";
      g.fillRect(0, 0, 42, 42);
      if (def.blend === "add") g.globalCompositeOperation = "lighter";
      draw(g, f, 21, 21, 34);
      strip.append(c);
    }
    row.append(strip);
    card.append(row);
    grid.append(card);
  }
  root.append(grid);
  weaponFxTable(root);
}

/** **어느 무기가 어느 이펙트를 쓰는가** (§0.6 G · 옛 큐 5 ⓓ). 위 카드가 「이펙트가 무엇인가」라면
 * 이 표는 「누가 그것을 쓰는가」다 — 둘이 갈려 있으면 «쓰는 데가 없는 이펙트»와 «표에 없는 무기»가
 * 조용히 산다. 값은 전부 `balance.ts WEAPON_FX`에서 읽는다(허브는 수치를 안 적는다) */
function weaponFxTable(root: HTMLElement): void {
  root.append(el("h2", "", `무기 × 이펙트 ${Object.keys(WEAPON_FX).length}행`));
  root.append(el("p", "note",
    "정본 = <code>balance.ts WEAPON_FX</code>(§0.6 G). <b>발사·탄도·착탄 3단</b>이 한 행이고, " +
    "색은 <b>무기색</b>(무엇이 쏘는가) — 궤적의 심과 총구 섬광은 <b>티어색</b>(얼마나 센가)이 덮는다. " +
    "티어 색 단계는 <b>T1 백 → T2 청 → T3 금</b>(BALANCE §0.6 등재값)."));
  const tier = el("div", "note");
  // 4·5행은 티어가 아니라 **T3 분기 2갈래의 색**이다 (§0.7-C) — 「T4」로 읽히면 안 된다
  const TIER_NAME = ["T1", "T2", "T3", "T3 집속·광역", "T3 관통·단일"];
  tier.innerHTML = "티어 색: " + TIER_FX.map((t, i) =>
    `<b style="color:rgb(${t.color})">${TIER_NAME[i] ?? `T${i + 1}`}</b> <span class="dim">굵기 ×${t.px} · 크기 ×${t.size}</span>`).join(" · ");
  root.append(tier);
  const tbl = el("table", "tbl");
  tbl.innerHTML =
    "<tr><th>무기</th><th>계열</th><th>발사(총구 길이×폭·섬광·포연)</th><th>탄도</th><th>착탄</th><th>색</th></tr>" +
    Object.keys(WEAPON_FX).map((k) => {
      const w = WEAPON_FX[k];
      const t = CAR_TEXT[k as keyof typeof CAR_TEXT];
      const traj = w.style === "shell" ? `포탄 비행${w.trail ? ` · 연기 눈금 ${w.trail}` : ""}`
        : w.style === "cone" ? "부채꼴"
        : w.style === "bolt" ? `전호 지그재그 · 분기 ${w.branch}`
        : w.style === "beam" ? `빔 굵기 ${w.px} · ${w.ttl}s`
        : `예광 ${w.px} · 머리 ${w.head} · ${w.ttl}s`;
      return `<tr><td><b>${t?.name ?? k}</b><br><span class="dim">${k}</span></td><td>${t?.series ?? "-"}</td>` +
        `<td>${w.muzzle.size ? `${w.muzzle.size}×${+(w.muzzle.size * FX_RULE.muzzle.narrow).toFixed(1)}` : "—"} · 섬광 ${w.muzzle.flash || "—"} · 포연 ${w.muzzle.smoke || "—"}</td>` +
        `<td>${traj}</td><td>${w.impact ? `스파크 ${w.impact}` : "폭발이 대신한다"}</td>` +
        `<td><span style="display:inline-block;width:34px;height:12px;border-radius:3px;background:rgb(${w.color})"></span></td></tr>`;
    }).join("");
  root.append(tbl);
}

/** 실동작 루프. drawFx의 감쇠·확대·합성 규약을 그대로 따르되 **상태를 안 만든다**(읽기 전용) */
function tickFx(now: number): void {
  for (const p of players) {
    const def = FX[p.kind];
    const k = ((now / 1000) % (def.dur + 0.35)) / def.dur;
    p.g.fillStyle = "#0b0f06";
    p.g.fillRect(0, 0, p.box, p.box);
    if (k > 1) continue;
    const i = Math.min(def.frames.length - 1, Math.floor(k * def.frames.length));
    p.g.save();
    p.g.globalAlpha = def.fade ? Math.pow(1 - k, def.fade) : 1;
    if (def.blend === "add") p.g.globalCompositeOperation = "lighter";
    const size = p.box * 0.8 * (def.grow ? 1 + (def.grow - 1) * k : 1);
    draw(p.g, def.frames[i], p.box / 2, p.box / 2, size);
    p.g.restore();
  }
  requestAnimationFrame(tickFx);
}

// ── 맵 ─────────────────────────────────────────────────────────────────────
function tabMap(root: HTMLElement, map: GameMap, walls: number): void {
  root.append(el("h2", "", "일반 맵 — 1차 스코프의 유일한 맵"));
  root.append(el("p", "note",
    `배경 플레이트 + 절차 배치 지형지물을 <b>게임과 같은 경로로</b> 그린 축소판이다` +
    `(<code>plate.drawBackground</code> + <code>map.drawMap</code>). 스테이지 1 기준 파괴 가능 지물 ${walls}개.`));

  const world = el("canvas");
  world.width = map.w;
  world.height = map.h;
  const wg = world.getContext("2d")!;
  drawBackground(wg, map);
  drawMap(wg, map);

  const view = el("canvas");
  const scale = 1000 / map.w;
  view.width = Math.round(map.w * scale);
  view.height = Math.round(map.h * scale);
  view.style.maxWidth = "100%";
  view.style.borderRadius = "7px";
  view.style.border = "1px solid var(--line)";
  const vg = view.getContext("2d")!;
  vg.imageSmoothingEnabled = true;
  vg.drawImage(world, 0, 0, view.width, view.height);
  root.append(view);

  root.append(el("h2", "", "공간 비율 (DESIGN §5.0 캐논)"));
  const t = el("table");
  t.innerHTML =
    `<tr><th>항목</th><th class="n">값</th><th>규약</th></tr>` +
    [
      ["맵 / 뷰포트", `×${LAYOUT.mapScale}`, "코어 고정 줌아웃 — 1.15~1.25배"],
      ["루프 외경", `화면 짧은 변의 ${Math.round(LAYOUT.loopOuterPct * 100)}%`, "50~55%"],
      ["루프 외경(월드)", `${Math.round(map.outerR * 2)}`, "코어 = 루프 중심 = 레일에서 1.0R"],
      ["칸 상한", `${TRAIN.maxCars}량`, `${TRAIN.maxCars}량 점유 ≤ 루프 둘레의 80%`],
      ["역", "루프 남측", "레일 밀착 — 정차 상점이 열리는 자리"],
    ].map(([a, b, c]) => `<tr><td>${a}</td><td class="n">${b}</td><td>${c}</td></tr>`).join("");
  root.append(t);

  root.append(el("h2", "", "지형 요소"));
  const tt = el("table");
  tt.innerHTML =
    `<tr><th>지형</th><th>이동</th><th>사선</th><th>비고</th></tr>` +
    [
      ["성벽 wall", "차단", "차단", `HP ${TERRAIN.wallHp} · 철거 드랍 ${TERRAIN.wallScrap} · 조준 포격 1발이 정확히 철거`],
      ["잔해 wall_broken", "통과", "통과", "부서진 성벽 — 지나갈 수 있는 자리"],
      ["언덕 hill", `×${TERRAIN.slow.hill}`, "차단", "직사만 막는다 — 관측칸이 여는 자리"],
      ["웅덩이 pond", `×${TERRAIN.slow.pond}`, "통과", "수렁 — 장갑 트럭이 여기서 대폭 감속"],
      ["호수 lake", "차단(수륙양용은 통과·가속)", "통과", "심연 촉수의 고정 출현 자리"],
    ].map((r) => `<tr>${r.map((c, i) => `<td${i === 1 ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`).join("");
  root.append(tt);
  root.append(el("p", "note",
    `절차 배치: 스테이지 1에 ${TERRAIN.place.start}개로 시작해 스테이지마다 ${TERRAIN.place.add.join("~")}개 추가, ` +
    `동시 상한 ${TERRAIN.place.cap}개. 레일에서 ${TERRAIN.place.railClear} 이상 떨어뜨린다 — ` +
    `가까이 놓으면 아군 직사 사계를 가려 클리어율이 무너진다.`));

  root.append(el("h2", "", "관문 배치"));
  const gates: string[] = [];
  for (let w = 1; w <= CURVE.waves; w++) {
    if (isBossWave(w)) gates.push(`<b style="color:var(--hot)">${w}</b>`);
    else if (isMidWave(w)) gates.push(`<b style="color:var(--gold)">${w}</b>`);
  }
  root.append(el("p", "note",
    `<span style="color:var(--gold)">중간보스</span> · <span style="color:var(--hot)">보스</span> — ` +
    gates.join(" · ") + `. 웨이브 ${CURVE.waves} = 최종 보스.`));

  root.append(el("h2", "", "특수 맵 3종"));
  root.append(el("p", "note",
    "스타디움 · 폐허 도시 · 게이트는 <b>2.5차 이월</b>이다(DESIGN §10). 여기 축소판이 없는 것이 정직한 상태다."));
}

// ── 이름표 ─────────────────────────────────────────────────────────────────
// 한글 표시명. **분류 라벨과 같은 부류의 표시용 문자열**이고 게임 판정은 이 표를 안 본다
const NAMES: Record<string, string> = {
  hero: "주인공 칸", machinegun: "기관총", railgun: "레일건", mortar: "박격포", flamer: "화염방사",
  tesla: "테슬라", sniper: "저격포", laser: "레이저", cannon: "함포", missile: "미사일 포드",
  mlrs: "다연장", incendiary: "소이탄 포", flak: "대공 플랙",
  collector: "수집칸", ammo: "탄약고", repair: "수리칸", observer: "관측칸",

  zombie: "좀비", hound: "좀비 사냥개", archer: "고블린 궁수", shield_orc: "방패 오크",
  mortar_team: "고블린 박격포반", slime: "슬라임", slime_mid: "슬라임(중)", slime_small: "슬라임(소)",
  drummer: "워 드러머", ogre: "오우거", boss_gram: "오우거 대족장 그람",
  swamp_crawler: "늪 크롤러", frog_warrior: "독개구리 전사", landing_craft: "상륙정", abyss_tentacle: "심연 촉수",
  bomb_bat: "폭격 박쥐", gargoyle: "가고일", scout_drone: "정찰 드론", zeppelin: "수송 비행선", wyvern: "와이번",
  siege_worm: "공성충", saboteur: "폭파공작원", hook_raider: "갈고리 강습병", siege_ram: "공성 램",
  sabo_bomb: "설치 폭탄",
  goblin_raider: "고블린 약탈자", skeleton: "해골 보병", frenzy_boar: "광란 멧돼지",
  rat_swarm: "쥐떼 우두머리", rat: "쥐",
  troll: "트롤", scrap_golem: "스크랩 골렘", armor_beetle: "철갑 딱정벌레", armored_truck: "장갑 트럭",
  musket_bandit: "머스킷 도적", acid_spitter: "산성 뱉기", shadow_assassin: "그림자 암살자",
  acid_slime: "산성 슬라임", acid_slime_small: "산성 슬라임(소)", slime_queen: "슬라임 퀸",
  necromancer: "네크로맨서", spore_trent: "포자 트렌트", spore_ling: "포자링",
  orc_shaman: "오크 주술사", shield_bearer: "실드 베어러", smoke_truck: "연막차", banner_lord: "배너 로드",

  plague_zombie: "역병 좀비", bone_hound: "뼈 사냥개", iron_orc: "강철 오크", rust_truck: "녹슨 트럭",
  venom_spitter: "맹독 뱉기", bog_crawler: "이끼 크롤러", ember_bat: "잿불 박쥐", hawk_drone: "매 드론",
  grub_worm: "유충 공성충", tar_slime: "타르 슬라임", pale_necromancer: "창백한 네크로맨서",
  blood_shaman: "피의 주술사",

  ogre_chief: "오우거 대장", troll_chief: "트롤 대장", abyss_chief: "심연의 주인", ram_chief: "공성 램 대장",
  queen_chief: "슬라임 여왕", necro_chief: "대네크로맨서", banner_chief: "대배너 로드",
};

// ── 부트 ────────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
let current: TabId = (params.get("tab") as TabId) || "home";

const nav = document.getElementById("tabs")!;
const main = document.getElementById("main")!;

async function boot(): Promise<void> {
  // 허브는 **평원 맵 하나**만 세운다 — 플레이트 갈래도 그 맵에서 꺼내 쓴다(감독 #65 반입 뒤
  // `loadPlate`가 갈래를 받는다). 맵을 먼저 만드는 것이 「어느 플레이트인가」의 유일한 출처다
  const map = generateMap(7);
  const [cells] = await Promise.all([loadSprites(), loadPlate(MAPS[map.id].plate)]);
  spriteTotal = cells.size;
  buildBackground(map, 7);
  stageTerrain(map, 1);
  // 화면에 적는 수는 «스테이지 1이 추가한 수»가 아니라 **필드에 서 있는 성벽 수**다
  // (플레이트 고정분 + 절차 배치분). stageTerrain의 반환값은 추가분뿐이라 그대로 쓰면 절반만 센다
  const walls = map.terrain.filter((t) => t.kind === "wall").length;

  for (const t of TABS) {
    const b = el("button", "", t.label);
    b.onclick = () => {
      current = t.id;
      history.replaceState(null, "", `?tab=${t.id}`);
      render(map, walls);
    };
    nav.append(b);
  }
  render(map, walls);
  requestAnimationFrame(tickFx);

  (window as unknown as Record<string, unknown>).__hub = () => ({
    tab: current,
    enemies: Object.keys(ENEMY_STATS).length,
    variants: VARIANT_KINDS.length,
    mid: MID_KINDS.length,
    weapons: Object.keys(WEAPONS).length,
    support: Object.keys(SUPPORT).length,
    fx: Object.keys(FX).length,
    // §0.6 G — 무기 × 이펙트 표가 무기 12종을 전부 덮는가. `wfxMissing`이 비어야 「쐈는지 모르겠다」의
    // 뿌리(무기가 표에 없어 폴백 행을 쓴다)가 없다는 뜻이다
    wfx: Object.keys(WEAPON_FX).length,
    wfxMissing: Object.keys(WEAPONS).filter((k) => !WEAPON_FX[k]),
    groups: Object.fromEntries(GROUPS.map((g) => [g.id, cls.byGroup[g.id].length])),
    unknown: cls.unknown,
    sprites: spriteTotal,
    spriteMissing: failed,
    walls,
  });
  (window as unknown as Record<string, unknown>).__hubReady = true;
}

function render(map: GameMap, walls: number): void {
  players.length = 0;
  main.textContent = "";
  Array.from(nav.children).forEach((b, i) =>
    b.setAttribute("aria-selected", String(TABS[i].id === current)));
  const root = el("section");
  if (current === "home") tabHome(root);
  else if (current === "parts") tabParts(root);
  else if (current === "weapons") tabWeapons(root, map.outerR);
  else if (current === "fx") tabFx(root);
  else tabMap(root, map, walls);
  main.append(root);
  scrollTo(0, 0);
}

boot();
