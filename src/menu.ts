// 메인 화면 (DESIGN §0.7 I · 채택안 B「라이브 데모」).
// **배경은 이 파일이 안 그린다** — 게임의 렌더 경로가 그대로 돌고(main.ts render), 여기서는
// 그 위에 스크림 + 타이틀 + 세로 버튼 스택 + 랭킹 오버레이만 얹는다. 시안(`showcase/mainmenu.html`
// `#b`)의 캔버스 코드는 «무엇을 보여줄지»의 참고이지 구현 사본이 아니다(§0.7 I "구현 시 원칙").
// 버튼은 HUD·상점과 같은 철제 면과 금색 주 동작 문법을 쓴다.

import { MAPS, ROUTE, VIEW, WAVES, type MapId } from "./balance";
import { FONT, FONT_DISPLAY, buttonPanel, railInk } from "./hud";
import { drawRankOverlay, rankClick, syncRank, type Rank } from "./rank";

import { beginControls, registerControl } from "./controls";

export type MenuBtn = { x: number; y: number; w: number; h: number; act: () => void };
export type Menu = {
  btns: MenuBtn[];
  /** 랭킹 오버레이가 열려 있는가 (열려 있으면 클릭은 전부 «닫기»다) */
  rank: boolean;
  /** 이어하기가 있으면 CONTINUE가 GAME START 위에 선다 (§0.7 I) */
  cont: { wave: number; stage: number; map: MapId } | null;
  /** **지금 고른 맵** (§0.7 O ⓐ). 데모 배경이 곧 이 맵이라 «고른 것이 보인다» —
   *  값의 보관처는 URL(`?map=`)이고 여기 든 것은 그 사본이다 */
  map: MapId;
  onStart: () => void;
  onContinue: () => void;
  /** 2택을 누르면 그 맵으로 메인 화면을 **다시 연다**(데모 배경이 갈린다) */
  onMap: (id: MapId) => void;
};

export function makeMenu(
  cont: { wave: number; stage: number; map: MapId } | null,
  map: MapId,
  onStart: () => void,
  onContinue: () => void,
  onMap: (id: MapId) => void,
): Menu {
  return { btns: [], rank: false, cont, map, onStart, onContinue, onMap };
}

/** 부제의 세 수는 **정본에서 유도한다** — 상수로 박으면 다음 개정에서 조용히 틀린다 */
const SUBTITLE = `고정 도전 SEED 7 · ${WAVES.length}웨이브 / ${new Set(WAVES.map((w) => w.stage)).size}스테이지`;

const BTN_W = 320;
const BTN_H = 52;
const BTN_GAP = 12;
/** 맵 2택 한 줄 (§0.7 O ⓐ). 스택과 **같은 총폭**이라 세 줄이 한 기둥으로 읽힌다 */
export const MAP_H = 44;
/** 2택 위의 작은 표제 (§3 「[맵 선택] — 일반/특수」) */
const MAP_CAP_H = 32;

/** 자간을 준 가운데 정렬 텍스트 (시안의 `letter-spacing`). `ctx.letterSpacing`은 브라우저마다
 * 있고 없고가 갈려서 손으로 벌린다 — 타이틀·부제·힌트가 전부 이 한 경로를 쓴다 */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, gap: number): void {
  const chars = [...text];
  let w = -gap;
  for (const c of chars) w += ctx.measureText(c).width + gap;
  let x = cx - w / 2;
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + gap;
  }
}

function button(menu: Menu, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, primary: boolean, size: number, mouse: { x: number; y: number } | null, act: () => void, selected = false): void {
  const hover = !!mouse && mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  buttonPanel(ctx, x, y, w, h, primary ? "primary" : selected ? "selected" : "secondary", hover);
  ctx.fillStyle = primary ? railInk.dark : railInk.text;
  ctx.font = `${size + 3}px ${FONT_DISPLAY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  spaced(ctx, label, x + w / 2, y + h / 2, 1.9);
  menu.btns.push({ x, y, w, h, act });
  registerControl(`menu-${menu.btns.length - 1}`, label, { x, y, w, h }, act);
}

export function drawMenu(ctx: CanvasRenderingContext2D, menu: Menu, rank: Rank, mouse: { x: number; y: number } | null): void {
  beginControls("메인 메뉴");
  menu.btns = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = "alphabetic";

  // Dark shelter around the sign and controls, with the live railway visible at both sides.
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  g.addColorStop(0, "rgba(12,18,15,0.94)");
  g.addColorStop(0.28, "rgba(12,18,15,0.64)");
  g.addColorStop(0.47, "rgba(12,18,15,0.28)");
  g.addColorStop(0.70, "rgba(12,18,15,0.74)");
  g.addColorStop(1, "rgba(12,18,15,0.96)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  const shelter = ctx.createLinearGradient(0, 0, VIEW.w, 0);
  shelter.addColorStop(0, "#10171100");
  shelter.addColorStop(.28, "#10171100");
  shelter.addColorStop(.42, "#10171166");
  shelter.addColorStop(.58, "#10171166");
  shelter.addColorStop(.72, "#10171100");
  shelter.addColorStop(1, "#10171100");
  ctx.fillStyle = shelter;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  // ── 타이틀 (시안 #b: top 7%) ──
  const cx = VIEW.w / 2;
  const titleY = VIEW.h * 0.07 + 56;
  ctx.textAlign = "left";
  ctx.font = `80px ${FONT_DISPLAY}`;
  ctx.fillStyle = "#171a14";
  spaced(ctx, "TRAIN DEFENSE", cx, titleY + 4, 9);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff3d2";
  spaced(ctx, "TRAIN DEFENSE", cx, titleY, 9);
  ctx.restore();
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = railInk.gold;
  spaced(ctx, SUBTITLE, cx, titleY + 32, 1.4);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff1d2";
  ctx.fillText("약 34–38분 + 선택 시간 · 기본 템포 ×1.2", cx, titleY + 62);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = railInk.muted;
  ctx.fillText("적은 코어만 공격합니다 · 열차로 길을 막으세요", cx, titleY + 90);
  if (window.innerWidth < 1024 || window.innerHeight < 600) {
    ctx.fillStyle = "#ffe0a0";
    ctx.fillText("PC 가로 화면 · 1024×600 이상을 권장합니다", cx, titleY + 116);
  }

  // ── 하단 세로 버튼 스택 (시안 #b: bottom 7%) ──
  const hintY = VIEW.h - 34;
  const labels: [string, boolean, () => void][] = [];
  if (menu.cont) labels.push(["CONTINUE", true, menu.onContinue]);
  labels.push(["GAME START", !menu.cont, menu.onStart]);
  // 여는 순간 서버를 다시 읽는다 (§0.7 N) — 목록은 도착하는 프레임에 저절로 갈린다
  labels.push(["RANKING", false, () => { menu.rank = true; syncRank(); }]);
  const stackH = MAP_CAP_H + MAP_H + BTN_GAP + labels.length * BTN_H + (labels.length - 1) * BTN_GAP;
  let by = hintY - 22 - stackH;

  // ── 맵 2택 (§0.7 O ⓐ) — GAME START **바로 위**. 이름은 정본에서 든다(MAPS[id].name).
  // 누르면 그 맵으로 메인 화면을 다시 여는 것이 전부라 **고른 맵이 곧 데모 배경**이다 —
  // 「도시 맵이 사실상 안 보인다」가 이 화면에서 닫힌다. 새 런에만 걸린다(이어하기는 저장된 맵을 이긴다)
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = railInk.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // **「맵 선택」이 아니다** — 런의 맵은 이제 경로가 정하고(§0.7 O ⓑ · 평원 1~18 → 도시 19~36)
  // 이 2택이 바꾸는 것은 **이 화면의 데모 배경**뿐이다. 이름이 옛 뜻으로 남으면 화면이 거짓말한다
  spaced(ctx, "배경 미리보기 · 경로 선택 아님", cx, by + 18, 0);
  by += MAP_CAP_H;
  const mapW = (BTN_W - BTN_GAP) / 2;
  const MAP_IDS: MapId[] = ["plains", "city"];
  MAP_IDS.forEach((id, i) => {
    const on = menu.map === id;
    button(menu, ctx, cx - BTN_W / 2 + i * (mapW + BTN_GAP), by, mapW, MAP_H, `${on ? "✓ " : ""}${MAPS[id].name}`, false, 18, mouse, () => {
      if (!on) menu.onMap(id);
    }, on);
  });
  by += MAP_H + BTN_GAP;

  for (const [label, primary, act] of labels) {
    button(menu, ctx, cx - BTN_W / 2, by, BTN_W, BTN_H, label, primary, 19, mouse, act);
    by += BTN_H + BTN_GAP;
  }

  // 진행 표기 한 줄 — 이어하기가 있으면 그 런의 자리, 없으면 새 런의 출발점.
  // **이어하기 줄은 «저장된» 맵을 적는다** — 위 2택과 다를 수 있고, 그때 이기는 것은 저장이다(§0.7 O ⓐ)
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = railInk.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const hint = menu.cont
    ? `이어하기 · ${MAPS[menu.cont.map].name} · WAVE ${menu.cont.wave}/${WAVES.length} · STAGE ${menu.cont.stage}`
    // **새 런은 경로를 적는다** (§0.7 O ⓑ) — 「어느 맵에서 시작하나」가 아니라 「어느 구역들을 도나」다
    : `${ROUTE.map((l) => MAPS[l.map].name).join(" → ")} · WAVE 1/${WAVES.length} · STAGE 1 부터`;
  spaced(ctx, hint, cx, hintY, 1);

  button(menu, ctx, 24, 664, 164, 44, "사운드 도감", false, 17, mouse, () => { window.location.href = "/sounds.html"; });

  if (menu.rank) drawRankOverlay(ctx, rank, () => { menu.rank = false; });
}

/** 클릭 한 번 = 버튼 하나. 랭킹이 열려 있으면 클릭은 전부 랭킹의 것이다 —
 *  **✕와 바깥 클릭만 닫는다**(§0.7 N). 판 안의 클릭은 닉네임 수정 버튼의 자리라 닫으면 안 된다 */
export function menuClick(menu: Menu, rank: Rank, sx: number, sy: number): void {
  if (menu.rank) {
    if (rankClick(rank, sx, sy) !== "inside") menu.rank = false;
    return;
  }
  for (const b of menu.btns) {
    if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
      b.act();
      return;
    }
  }
}
