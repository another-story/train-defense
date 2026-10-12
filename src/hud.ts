// Shared railway UI: weathered timber edges, quiet steel interiors, and restrained gold actions.
// HUD layout and display values come from balance.ts; rendering never changes game state.

import { ARTILLERY, CORE, FACTIONS, HUD, VIEW, WAVES, WEAPONS, carCap, isBossKind, isBossWave, isMidKind, isMidWave, gateName, maxLevelOf } from "./balance";
import type { Combat } from "./combat";
import type { Field } from "./enemy";
import type { GameMap } from "./map";
import { carName, type Train, trainDps } from "./train";

import { FONT, FONT_DISPLAY, TYPO, wrapText } from "./typography";
export { FONT, FONT_DISPLAY } from "./typography";

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Weathered timber stays at the edge; information sits on a quiet painted-metal inset. */
export const railInk = { text: "#ece7d8", muted: "#b7b7a8", gold: "#e5bd6b", dark: "#211c13" } as const;

export function woodPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number = HUD.wood.radius): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "#4b3b2b";
  ctx.fill();
  ctx.clip();
  // Grain is confined to the frame, so it never runs through text or numbers.
  ctx.fillStyle = "#9a795027";
  for (let i = 0; i * 9 < h; i++) {
    const hash = Math.abs(Math.sin((x + y + i * 37) * 12.9898)) % 1;
    ctx.fillRect(x, y + i * 9 + hash * 4, w, 1);
  }
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 4));
  ctx.fillStyle = "#222724";
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#111712";
  roundRect(ctx, x + .5, y + .5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.strokeStyle = "#a0875f55";
  roundRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(2, r - 2));
  ctx.stroke();
  // Small screw heads retain the railway hardware without adding another bright frame.
  ctx.fillStyle = "#8c826955";
  for (const sx of [x + 3, x + w - 3]) {
    ctx.fillRect(sx - 1, y + Math.min(12, h / 2) - 1, 2, 2);
    if (h > 70) ctx.fillRect(sx - 1, y + h - 13, 2, 2);
  }
}

/** Recessed steel for secondary information and lists. */
export function slot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 6): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "#171d1bcc";
  ctx.fill();
}

/** Gold fills are reserved for the next action; selected tabs use only a narrow indicator. */
export function buttonPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  state: "primary" | "secondary" | "selected" | "disabled" = "secondary", hover = false): void {
  const primary = state === "primary";
  const selected = state === "selected";
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = primary ? (hover ? "#efcc83" : "#d2ac64") : state === "disabled" ? "#202522" : hover ? "#3b423a" : selected ? "#343c33" : "#2d342f";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = primary ? "#f0d795" : selected ? "#b9a77b" : state === "disabled" ? "#353b33" : "#626957";
  roundRect(ctx, x + .5, y + .5, w - 1, h - 1, 5);
  ctx.stroke();
  if (selected) { ctx.fillStyle = railInk.gold; ctx.fillRect(x + 1, y + 8, 3, h - 16); }
  if (primary) {
    ctx.fillStyle = "#fff3c044";
    ctx.fillRect(x + 5, y + 2, w - 10, 1);
    ctx.fillStyle = "#493d292c";
    ctx.fillRect(x + 5, y + h - 3, w - 10, 1);
  }
}

/** 가로 게이지 (코어 HP · 주포 쿨다운). p는 0..1 */
function gauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number, color: string): void {
  slot(ctx, x, y, w, h, 3);
  ctx.fillStyle = color;
  roundRect(ctx, x + 1, y + 1, Math.max(0, (w - 2) * p), h - 2, 2);
  ctx.fill();
}

/** **직전 프레임에 실제로 그려진 툴팁** (probe `ui.tooltip`). 「마우스 오버로만 사는 연출」은
 * 컷으로 «없는 것»과 «멀쩡한 것»이 구분되지 않는다 — iter100이 그 자리를 실제로 밟았다
 * (`SHOT_HOVER`가 캡처 시점에 `pointerleave`를 맞아 툴팁이 컷에서 통째로 사라졌다).
 * `render()`가 매 프레임 `tipReset()`으로 지우고 `tooltip()`이 그릴 때만 채운다 —
 * **§0.6 A2 「툴팁 5줄」의 유일한 기계 눈금**이다(돌파 표식 `markFit.n`과 같은 규약). */
export const TIP: { title: string | null; lines: string[]; x: number; y: number } = {
  title: null, lines: [], x: 0, y: 0,
};

/** 매 프레임 렌더 앞에서 부른다 — 안 부르면 한 번 뜬 툴팁이 영원히 「떠 있다」로 읽힌다 */
export function tipReset(): void {
  TIP.title = null;
  TIP.lines = [];
  TIP.x = 0;
  TIP.y = 0;
}

/** **툴팁** (§0.6 A2). 상점·카드가 같은 판을 쓴다 — 마우스 오버한 칸의
 * 「계열 · 명목 DPS · 사거리 · 특성 1줄 · 다음 티어 효과」를 커서 옆에 띄운다.
 * 본문은 `train.ts carTip()`이 만들고 여기는 그리기만 한다(수치는 정본에서만 나온다).
 * 화면 밖으로 나가면 커서 반대쪽으로 접는다 — 오른쪽 끝 버튼의 툴팁이 잘리던 자리다 */
export function tooltip(ctx: CanvasRenderingContext2D, sx: number, sy: number, title: string, lines: string[]): void {
  TIP.title = title;
  TIP.lines = lines;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = TYPO.heading;
  let w = ctx.measureText(title).width;
  ctx.font = TYPO.body;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  w = Math.min(600, w + 40);
  const body = lines.flatMap(line => wrapText(ctx, line, w - 40));
  const h = 52 + body.length * 27 + 14;
  const x = Math.max(8, Math.min(sx + 16, VIEW.w - w - 8));
  const y = Math.max(8, Math.min(sy + 14, VIEW.h - h - 8));
  TIP.x = x;
  TIP.y = y;
  woodPanel(ctx, x, y, w, h, 8);
  ctx.fillStyle = HUD.ink.gold;
  ctx.font = TYPO.heading;
  ctx.fillText(title, x + 20, y + 32);
  ctx.fillStyle = "#fff1d2";
  ctx.font = TYPO.body;
  body.forEach((line, i) => ctx.fillText(line, x + 20, y + 59 + i * 27));
}

/** 우측 패널의 x 좌표 (클릭 판정과 공유) */
export const PANEL_X = VIEW.w - HUD.margin - HUD.panelW;

/** 화면 좌표가 HUD 패널 위인가. **주포 발사가 패널 뒤로 새지 않게** 하는 것이 유일한 용도다 */
export function hudHit(sx: number, sy: number): boolean {
  return sx >= PANEL_X && sy >= HUD.margin && sy <= VIEW.h - HUD.margin;
}

export function drawHud(ctx: CanvasRenderingContext2D, combat: Combat, train: Train, field: Field): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = "alphabetic";
  drawWaveBox(ctx, field);

  const x = PANEL_X;
  const w = HUD.panelW;
  const ix = x + 12; // 안쪽 여백
  const iw = w - 24;
  let y = HUD.margin;

  // ── 재화 (목업의 GOLD 자리) ──
  woodPanel(ctx, x, y, w, HUD.box.scrap);
  ctx.textAlign = "left";
  ctx.fillStyle = railInk.muted;
  ctx.font = `16px ${FONT_DISPLAY}`;
  ctx.fillText("SCRAP", ix, y + 28);
  ctx.textAlign = "right";
  ctx.fillStyle = railInk.gold;
  ctx.font = `22px ${FONT_DISPLAY}`;
  ctx.fillText(String(Math.floor(combat.scrap)), ix + iw, y + 28);
  y += HUD.box.scrap + HUD.gap;

  // ── 코어 HP (지금까지는 코어 위 막대뿐이라 "몇 남았는지"가 안 읽혔다) ──
  woodPanel(ctx, x, y, w, HUD.box.core);
  const cp = Math.max(0, combat.coreHp) / CORE.hp;
  label(ctx, "CORE", ix, y + 20);
  ctx.textAlign = "right";
  ctx.fillStyle = HUD.ink.value;
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(`${Math.ceil(combat.coreHp)} / ${CORE.hp}`, ix + iw, y + 20);
  gauge(ctx, ix, y + 30, iw, 14, cp, cp > 0.5 ? "#85b88a" : cp > 0.25 ? "#d7b36b" : "#d77c62");
  y += HUD.box.core + HUD.gap;

  // ── 주포 쿨다운 (§6.2). 커서 조준원의 원호를 여기로 옮겼다 — 조준 위치와 무관하게 항상 보여야 한다 ──
  woodPanel(ctx, x, y, w, HUD.box.art);
  const full = ARTILLERY.cooldownSec * combat.artCdMult;
  const ready = combat.artCd <= 0;
  label(ctx, "주포", ix, y + 20);
  ctx.textAlign = "right";
  ctx.fillStyle = ready ? railInk.gold : railInk.muted;
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(ready ? "READY" : `${combat.artCd.toFixed(1)}s`, ix + iw, y + 20);
  gauge(ctx, ix, y + 30, iw, 14, ready ? 1 : 1 - combat.artCd / full, ready ? railInk.gold : "#777d66");
  y += HUD.box.art + HUD.gap;

  // ── 통계: 긴 DPS 수치는 제목 아래 한 줄을 온전히 쓴다 ──
  slot(ctx, x + 5, y, w - 10, HUD.box.stats, 4);
  ctx.textAlign = "left";
  ctx.fillStyle = railInk.muted;
  ctx.font = `16px ${FONT}`;
  ctx.fillText("명목 DPS", ix, y + 22);
  ctx.textAlign = "right";
  ctx.fillStyle = HUD.ink.value;
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(trainDps(train, combat.pass).toFixed(1), ix + iw, y + 44);
  const t = Math.floor(field.t);
  const rows: [string, string][] = [
    ["처치", String(combat.kills)],
    ["수집", String(Math.floor(combat.collected))],
    ["시간", `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`],
  ];
  rows.forEach((r, i) => {
    const ry = y + 65 + i * 21;
    ctx.textAlign = "left";
    ctx.fillStyle = railInk.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText(r[0], ix, ry);
    ctx.textAlign = "right";
    ctx.fillStyle = HUD.ink.value;
    ctx.font = `500 17px ${FONT}`;
    ctx.fillText(r[1], ix + iw, ry);
  });
  y += HUD.box.stats + HUD.gap;

  // ── 편성 (목업의 UPGRADES 목록 자리). 상점 밖에서도 "무엇을 얼마나 키웠는지"가 보여야
  //    다음 정차에서 무엇을 살지 정할 수 있다 ──
  const listH = VIEW.h - HUD.margin - y;
  woodPanel(ctx, x, y, w, listH);
  ctx.textAlign = "left";
  label(ctx, `CARS ${train.cars.length}/${carCap()}`, ix, y + 22);
  for (let i = 0; i < train.cars.length; i++) {
    const car = train.cars[i];
    const ry = y + 32 + i * 29;
    if (ry + 29 > y + listH - 6) break;
    slot(ctx, ix, ry, iw, 29 - 3, 4);
    const wp = WEAPONS[car.kind];
    const val = wp ? `T${car.tier}·${car.level + 1}` : "—";
    ctx.textAlign = "right";
    ctx.fillStyle = wp ? (car.level >= maxLevelOf(car.tier) ? HUD.ink.gold : "#fff1d2") : "#fff1d2";
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(val, ix + iw - 6, ry + 20);
    // 이름은 값이 쓰고 남은 폭까지만 — `machinegun`처럼 긴 이름이 값과 겹치면 둘 다 못 읽는다
    const room = iw - 18 - ctx.measureText(val).width;
    ctx.textAlign = "left";
    ctx.fillStyle = HUD.ink.title;
    ctx.font = `17px ${FONT_DISPLAY}`;
    ctx.fillText(clip(ctx, carName(car.kind), room), ix + 6, ry + 20);
  }
}

/** 폭 안에 들어가게 자른다 (넘치면 뒤를 …로) */
function clip(ctx: CanvasRenderingContext2D, s: string, room: number): string {
  if (ctx.measureText(s).width <= room) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + "…").width > room) out = out.slice(0, -1);
  return out + "…";
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number): void {
  ctx.textAlign = "left";
  ctx.fillStyle = HUD.ink.title;
  ctx.font = `20px ${FONT_DISPLAY}`;
  ctx.fillText(s, x, y);
}

/** 상단 중앙 진행 표시 (목업: "WAVE: 14" 큰 글씨 + "NEXT WAVE: 0:45" 작은 글씨).
 * 웨이브 사이 간격에는 무엇을 기다리는지(카드 · 정차)를 같은 자리에 적는다 */
function drawWaveBox(ctx: CanvasRenderingContext2D, field: Field): void {
  const w = HUD.wave.w;
  const x = (VIEW.w - w) / 2;
  const y = HUD.wave.y;
  roundRect(ctx, x, y, w, HUD.wave.h, 10);
  // 알파 0.87(`dd`) → **0.65**(`a6`) — DESIGN §3(2026-08-22 감독 #49 ①, 선택지 ⓑ). 이 박스는
  // 살아 있는 전장 위에 얹혀 있어서(맵 세로가 화면에 꽉 찬다) 그 뒤를 지나는 개체가 통째로 사라졌다.
  // **레이아웃(300×58 @ y10)은 목업 정본이라 안 건드린다** — 바꾸는 것은 불투명도 하나뿐이다
  ctx.fillStyle = "#17201da6";
  ctx.fill();
  ctx.strokeStyle = "#74776077";
  ctx.lineWidth = 1;
  ctx.stroke();

  const wv = WAVES[field.waveIdx];
  // 스테이지 안의 웨이브는 시계로 열린다(감독 #11 ①). 스테이지 마지막 웨이브는 전멸이 조건이라 카운트다운이 없다
  const lastOfStage = WAVES[field.waveIdx + 1]?.stage !== wv.stage;
  const left = Math.max(0, wv.len - field.waveT);
  const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
  const top = field.cleared
    ? "ALL WAVES CLEAR"
    : field.card
      ? "CARD"
      : field.station
        ? "STATION"
        : `WAVE: ${field.waveIdx + 1} / ${WAVES.length}`;
  // **진영**(§0.6 D)은 스테이지 표기 옆에 늘 붙는다 — 배너는 교대 순간 한 번뿐이라
  // 상점을 닫고 돌아온 플레이어에게 「지금 무엇과 싸우는가」가 아무 데도 안 남는다(관문 비네트와 같은 이유)
  const fac = FACTIONS[field.faction].name;
  const bottom = field.cleared
    ? ""
    : field.gap > 0
      ? `STATION ${Math.ceil(field.gap)}`
      : isBossWave(field.waveIdx + 1)
        ? `STAGE ${wv.stage} · ${fac} — 보스`
        : isMidWave(field.waveIdx + 1)
          ? `STAGE ${wv.stage} · ${fac} — 중간보스`
          : lastOfStage
            ? `S${wv.stage} · ${fac} · 전멸 대기`
            : `S${wv.stage} · ${fac} · ${clock}`;

  ctx.textAlign = "center";
  ctx.fillStyle = HUD.ink.title;
  ctx.font = `28px ${FONT_DISPLAY}`;
  ctx.fillText(top, VIEW.w / 2, y + 27);
  ctx.fillStyle = railInk.muted;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(bottom, VIEW.w / 2, y + 47);
}

/** **관문 경고** (DESIGN §0.6 B5 "보스 웨이브임을 알 수 없다") — 가장자리 비네트 + 상단 배너.
 * 둘 다 **순수 연출**이고 상태를 안 바꾼다. `drawHud`보다 **앞**에 그린다: 비네트가 우측 나무 패널
 * 위를 덮으면 패널의 대비가 무너지고, 배너는 상단 중앙(웨이브 박스 아래)이라 패널과 안 겹친다.
 *  · **비네트**는 관문이 «살아 있는 동안» 내내 깔린다 — 배너 한 번만으로는 상점을 닫고 돌아온
 *    플레이어에게 아무 표시가 안 남는다
 *  · **배너**는 웨이브 개시에 한 번(`field.banner`, enemy.ts가 세우고 스스로 지운다) */
export function drawGateAlert(ctx: CanvasRenderingContext2D, field: Field, ending = false): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // `eventPending`이 함께 든다 (감독 #72 ⑤) — 이벤트 관문(18·36)의 보스는 **1차 물량이 전멸한 뒤**에
  // 나오므로, 그 전 구간이 비네트 없이 지나면 「관문에 들어섰다」가 웨이브의 대부분에서 화면에 안 남는다
  const boss = field.bossPending || field.eventPending || field.list.some((e) => isBossKind(e.kind));
  const mid = !boss && (field.midPending || field.list.some((e) => isMidKind(e.kind)));
  if (boss || mid) {
    const v = boss ? HUD.vignette.boss : HUD.vignette.mid;
    // 맥동은 f.t의 사인파라 스크린샷 QA가 재현된다 (폭탄 링·사격선과 같은 규약)
    const a = v.alpha * (0.62 + 0.38 * Math.abs(Math.sin(field.t * 1.6)));
    const th = Math.min(VIEW.w, VIEW.h) * HUD.vignette.thick;
    const band = (x: number, y: number, w: number, h: number, x1: number, y1: number): void => {
      const g = ctx.createLinearGradient(x, y, x1, y1);
      g.addColorStop(0, `rgba(${v.color}, ${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${v.color}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    };
    band(0, 0, VIEW.w, th, 0, th);
    band(0, VIEW.h - th, VIEW.w, th, 0, VIEW.h - th);
    band(0, 0, th, VIEW.h, th, 0);
    band(VIEW.w - th, 0, th, VIEW.h, VIEW.w - th, 0);
  }
  const b = field.banner;
  // **시간이 멈춘 화면 위에는 배너를 안 그린다** (정차 상점 §3 · 선택 카드 §7.2 · T3 진화 분기 §7.4).
  // `enemy.ts updateField`가 「시뮬이 멈춘 동안 배너 타이머도 안 돈다」로 배너를 **온전히 보존**하는데,
  // 그리기가 그 프레임에도 배너를 세우면 그 표기는 **자기 3.4초를 안 쓰면서** 화면을 차지한다 —
  // 게다가 배너 판(y 84~162)과 카드 화면 제목(baseline 150 · 28px)이 **같은 픽셀을 쓴다**
  // (iter125 실측: `?w=30&tier=3`의 분기 화면에서 「강철 대주자 그람」이 「STAGE 10 — T3 진화 분기」를
  // 뒤에서 갉는다 — 카드 오버레이가 `#000000bb`라 27%가 비친다). **미루면 둘 다 온전히 읽힌다.**
  // ⚠ **비네트는 안 끈다** — 그쪽은 타이머가 아니라 「지금 관문 웨이브다」라는 **상시 상태**의 표기이고,
  //    상점을 닫고 돌아온 플레이어에게 남아야 하는 것이 정확히 그것이다(위 주석)
  // ⚠ **엔드 씬(§0.7 M)도 같은 부류의 정지 상태다** — 시뮬이 멎어 배너 타이머가 안 도는데
  // 그리기만 살아 있으면 배너가 자기 3.4초를 안 쓰면서 «부서지는 코어» 위에 4.6초를 더 앉아 있다
  if (!b || field.station || field.card || field.branch || ending) return;
  // 앞뒤 페이드 — 뜨는 것도 사라지는 것도 «한 프레임에»면 스크린샷에서 잘린 판처럼 읽힌다
  const fd = HUD.banner.fade;
  const k = Math.min(1, Math.min(b.t, HUD.banner.sec - b.t) / fd);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  const w = HUD.banner.w;
  const h = HUD.banner.h;
  const x = (VIEW.w - w) / 2;
  const y = HUD.banner.y;
  woodPanel(ctx, x, y, w, h, 12);
  // 진영 교대 배너(§0.6 D)는 같은 판에 `label`·`ink`만 갈아 끼운다 — 「이번 웨이브가 여느 때와
  // 다르다」의 표기는 화면에 한 문법만 있어야 한다
  const col = b.ink ?? (b.boss ? HUD.ink.gold : "#ff9a4a");
  ctx.textAlign = "center";
  ctx.fillStyle = col;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(b.label ?? (b.boss ? "BOSS WAVE" : "MINI BOSS"), VIEW.w / 2, y + 24);
  ctx.fillStyle = HUD.ink.title;
  ctx.font = `${b.boss ? 36 : 30}px ${FONT_DISPLAY}`;
  ctx.fillText(b.name, VIEW.w / 2, y + 58);
  ctx.textAlign = "left";
  ctx.restore();
}

/** 화면 좌표 (sx, sy)에 있는 개체가 **컷에 실제로 찍히는가**. 원인 넷을 가른다:
 * `offscreen`(뷰포트 밖 — 맵이 뷰포트의 1.2배다, §5.0) · `underPanel`(우측 HUD 뒤) ·
 * `underWaveBox`(상단 웨이브 박스 뒤) · `onField`(보인다).
 * **probe(`mid.visible`)와 아래 마커가 같은 함수를 봐야 한다** — 규칙이 두 벌이면 조용히 어긋난다 */
export function gateVisible(sx: number, sy: number): "offscreen" | "underPanel" | "underWaveBox" | "onField" {
  if (sx < 0 || sy < 0 || sx > VIEW.w || sy > VIEW.h) return "offscreen";
  if (sx > VIEW.w - HUD.panelW - HUD.margin * 2) return "underPanel";
  const wx = (VIEW.w - HUD.wave.w) / 2;
  if (sy < HUD.wave.y + HUD.wave.h && sx > wx && sx < wx + HUD.wave.w) return "underWaveBox";
  return "onField";
}

/** 마커가 설 수 있는 안쪽 여백(px) — 삼각형과 글자가 잘리지 않을 만큼 */
const MARK_PAD = 26;

/** **관문급 위치 마커** (DESIGN §3, 2026-08-22 감독 #49 ① — 선택지 ⓒ).
 * 중간보스·보스가 **화면 밖이거나 두 패널 뒤**에 있으면 그 방향의 가장자리에 삼각형 + 이름을 찍는다.
 * 알파 완화(ⓑ)가 못 덮는 자리가 둘 있기 때문이다 — ① 우측 HUD는 불투명한 나무 패널이고
 * ② 맵이 뷰포트의 1.2배라 아예 화면 밖일 수 있다(§5.0).
 * **순수 연출이다** — 판정은 아무것도 이 함수를 안 보고, 여기서 상태를 바꾸는 곳도 없다 */
export function drawGateMarkers(ctx: CanvasRenderingContext2D, field: Field, map: GameMap, cam: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = "alphabetic";
  // 마커가 설 수 있는 사각형 = 뷰포트에서 우측 패널을 뺀 «살아 있는 전장»
  const x0 = MARK_PAD;
  const y0 = MARK_PAD;
  const x1 = VIEW.w - HUD.panelW - HUD.margin * 2 - MARK_PAD;
  const y1 = VIEW.h - MARK_PAD;
  for (const e of field.list) {
    const boss = isBossKind(e.kind);
    if (!boss && !isMidKind(e.kind)) continue;
    const sx = VIEW.w / 2 + (e.x - map.cx) * cam;
    const sy = VIEW.h / 2 + (e.y - map.cy) * cam;
    if (gateVisible(sx, sy) === "onField") continue;
    // 화면 중앙 → 개체 방향의 광선이 위 사각형과 만나는 점. 개체가 사각형 안이면(= 패널 뒤)
    // 그대로 클램프되어 패널 가장자리에 선다 — 「저 뒤에 있다」가 방향으로 읽힌다
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    let dx = sx - cx;
    let dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const t = Math.min(
      dx ? (dx > 0 ? x1 - cx : x0 - cx) / dx : Infinity,
      dy ? (dy > 0 ? y1 - cy : y0 - cy) / dy : Infinity
    );
    const mx = cx + dx * t;
    const my = cy + dy * t;
    const col = boss ? HUD.ink.gold : "#ff9a4a";
    // 바깥을 가리키는 삼각형
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -8);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = HUD.wood.edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // 이름은 **안쪽**에 적는다 — 가장자리에 적으면 잘린다
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = dx > 0.5 ? "right" : dx < -0.5 ? "left" : "center";
    ctx.fillStyle = HUD.wood.edge;
    const lx = mx - dx * 18;
    const ly = my - dy * 18 + 4;
    // **한글 명칭 정본**은 `balance.ts GATE_TEXT` 한 곳이다 (§0.6 A2와 같은 규약) —
    // 「저 뒤에 뭔가 있다」보다 「무엇이 있다」가 읽혀야 관문의 격이 마커에서도 선다(§0.6 B5)
    const name = gateName(e.kind);
    ctx.fillText(name, lx + 1, ly + 1);
    ctx.fillStyle = col;
    ctx.fillText(name, lx, ly);
  }
  ctx.textAlign = "left";
}
