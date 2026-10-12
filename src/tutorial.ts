// 튜토리얼 한 페이지 (DESIGN §P · 감독 #72 ⑧).
//
// **한 화면에서 끝난다** — 스크롤도, 단계별 안내도, 강제 실습도 없다. 세 칸 + 하단 한 줄 + 시작 버튼이
// 전부이고, **문구는 §P의 정본이 상한이다**(늘리지 말 것 · 줄이는 쪽만 재량).
//
// 이 파일이 드는 것은 **그림과 문구**뿐이다. 시간 정지·클릭 판정·「닫기」 버튼은 `pause.ts`가 든다 —
// §P가 "두 번째 정지 문법을 만들지 않는다"고 못박았고, 버튼도 한 벌이어야 하기 때문이다
// (그래서 `drawTutorial`은 버튼 «자리»만 돌려주고 그 위에 pause.ts의 `btn`이 얹는다).
//
// **새 에셋을 안 만든다** (§P): 칸 그림은 카드 화면과 **같은 호출**(`drawCarArt`)이고, 상점 조각은
// 나무 패널·홈(`woodPanel`/`slot`)을 축소해 세운 것이다.
import { HUD, VIEW } from "./balance";
import { FONT, FONT_DISPLAY, railInk, roundRect, slot, woodPanel } from "./hud";
import { drawCarArt, type CarKind } from "./train";

/** 「이미 봤다」 플래그. **런에 안 싣는다** — 저장(save.ts)은 런의 것이고 이것은 «이 브라우저»의 것이다 */
const SEEN_KEY = "td_tutorial_seen";

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // 사생활 모드에서 읽기가 막히면 「안 봤다」로 읽는다 — 못 보는 것보다 두 번 보는 쪽이 낫다
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 저장 실패는 삼킨다 (save.ts와 같은 규약)
  }
}

/** 세 칸 — **문구는 DESIGN §P 정본 그대로다.** `**…**`는 강조(금색 굵게)로만 읽힌다 */
export const TUT_CARDS = [
  {
    title: "① 주포는 직접 쏩니다",
    body: "무기칸은 자동 공격합니다. **주포는 클릭 또는 방향키 조준 후 Space**로 발사합니다.",
    art: "aim" as const,
  },
  {
    title: "② 열차를 늘리고, 키웁니다",
    body: "웨이브 사이에 **카드를 선택**합니다. 같은 무기 카드 **2장으로 티어 상승**, 상점에서 **레벨 강화**합니다.",
    art: "train" as const,
  },
  {
    title: "③ 3웨이브마다 정차합니다",
    body: "웨이브 셋을 넘기면 열차가 역에 서고 **상점**이 열립니다. 열차를 구매·강화하고, **코어를 회복**시키세요!",
    art: "shop" as const,
  },
];

/** 하단 한 줄 (§P) */
export const TUT_FOOT = "적은 **코어만** 공격합니다. 열차는 **이동하는 방벽**입니다. · ESC = 일시정지";

const CARD = { w: 360, h: 358, gap: 24 };
/** 칸 안: 그림 상단 · 굵은 제목 · 본문. 본문 폭은 카드 폭 − 좌우 여백 2×20 */
const PAD = 20;
const TOP = 106;

type Run = { t: string; em: boolean };

/** `**강조**` 마크업을 런으로 가른다 — 캔버스에는 인라인 서식이 없으니 조각으로 쪼개 그린다 */
function runsOf(md: string): Run[] {
  const out: Run[] = [];
  for (const [i, part] of md.split("**").entries()) if (part) out.push({ t: part, em: i % 2 === 1 });
  return out;
}

/** Keep Korean words together while retaining emphasis across line breaks. */
function wrap(ctx: CanvasRenderingContext2D, runs: Run[], maxW: number, size: number): Run[][] {
  const words: Run[][] = [[]];
  for (const run of runs) {
    for (const t of run.t) {
      if (t === " ") words.push([]);
      else words[words.length - 1].push({ t, em: run.em });
    }
  }
  const lines: Run[][] = [[]];
  let width = 0;
  const measure = (run: Run): number => {
    ctx.font = `${run.em ? "600 " : ""}${size}px ${FONT}`;
    return ctx.measureText(run.t).width;
  };
  const append = (run: Run): void => {
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    if (last?.em === run.em) last.t += run.t;
    else line.push({ ...run });
  };
  for (const word of words) {
    if (!word.length) continue;
    const wordWidth = word.reduce((sum, run) => sum + measure(run), 0);
    const space = measure({ t: " ", em: false });
    if (width && width + space + wordWidth > maxW) { lines.push([]); width = 0; }
    if (width) { append({ t: " ", em: false }); width += space; }
    for (const run of word) {
      const charWidth = measure(run);
      if (width + charWidth > maxW) { lines.push([]); width = 0; }
      append(run);
      width += charWidth;
    }
  }
  return lines;
}

/** 런 줄을 왼쪽 정렬로 그린다. 강조는 **금색 굵게** — HUD의 강조색과 같은 자리다 */
function drawRuns(ctx: CanvasRenderingContext2D, lines: Run[][], x: number, y: number, size: number, lh: number): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, i) => {
    let cx = x;
    for (const run of line) {
      ctx.font = `${run.em ? "600 " : ""}${size}px ${FONT}`;
      ctx.fillStyle = run.em ? railInk.gold : HUD.ink.title;
      ctx.fillText(run.t, cx, y + i * lh);
      cx += ctx.measureText(run.t).width;
    }
  });
}

/** 가운데 정렬 한 줄 (하단 문구 전용) */
function drawRunsCentered(ctx: CanvasRenderingContext2D, runs: Run[], cx: number, y: number, size: number): void {
  let w = 0;
  for (const run of runs) {
    ctx.font = `${run.em ? "600 " : ""}${size}px ${FONT}`;
    w += ctx.measureText(run.t).width;
  }
  drawRuns(ctx, [runs], cx - w / 2, y, size, 0);
}

/** 칸 ①의 그림 — 기관차 + 조준원. 조준원은 combat.ts의 커서 보조와 **같은 문법**(점선 원 + 금색)이다 */
function artAim(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.strokeStyle = railInk.gold;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.arc(cx, cy, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  drawCarArt(ctx, "hero", cx, cy, 120, Math.PI / 2, Math.PI / 2);
}

/** 칸 ②의 그림 — 세 칸이 붙어 선 열차 한 토막(카드 화면과 같은 `drawCarArt` 호출) */
function artTrain(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const row: [CarKind, number][] = [["railgun", 3], ["machinegun", 2], ["hero", 1]];
  // 포신이 **오른쪽으로만** 뻗어 그림의 무게중심이 차체 중심보다 오른쪽에 있다 —
  // 칸 중심에 그대로 맞추면 맨 오른쪽 포신이 홈 밖으로 샌다. 그 몫만큼 왼쪽으로 민다
  row.forEach(([kind, tier], i) => {
    drawCarArt(ctx, kind, cx - 10 + (i - 1) * 100, cy, 110, Math.PI / 2, Math.PI / 2, undefined, tier);
  });
}

/** 칸 ③의 그림 — 상점 패널 «조각». 나무 판 + 홈 세 줄 + 금화 하나로 그 화면을 축소한 것이다 */
function artShop(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const w = 196;
  const h = 108;
  const x = cx - w / 2;
  const y = cy - h / 2;
  woodPanel(ctx, x, y, w, h, 8);
  for (let i = 0; i < 3; i++) {
    slot(ctx, x + 14, y + 16 + i * 28, w - 62, 20, 4);
    ctx.fillStyle = railInk.gold;
    roundRect(ctx, x + w - 40, y + 16 + i * 28, 26, 20, 4);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x + w - 14, y + h - 12, 11, 0, Math.PI * 2);
  ctx.fillStyle = railInk.gold;
  ctx.fill();
  ctx.strokeStyle = "#8a6a1c";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 튜토리얼 한 페이지. **버튼은 안 그린다** — 돌려준 사각형에 pause.ts의 `btn`이 얹는다 */
export function drawTutorial(ctx: CanvasRenderingContext2D): { x: number; y: number; w: number; h: number } {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(11,18,15,.86)";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  const totalW = TUT_CARDS.length * CARD.w + (TUT_CARDS.length - 1) * CARD.gap;
  const x0 = (VIEW.w - totalW) / 2;
  TUT_CARDS.forEach((card, i) => {
    const x = x0 + i * (CARD.w + CARD.gap);
    woodPanel(ctx, x, TOP, CARD.w, CARD.h, 12);
    // 그림 칸 = 홈(눌린 자리). 카드 화면의 본문 자리와 같은 문법이고, 그림이 나뭇결에 안 묻힌다
    slot(ctx, x + PAD, TOP + PAD, CARD.w - PAD * 2, 148, 8);
    const cx = x + CARD.w / 2;
    const cy = TOP + PAD + 74;
    if (card.art === "aim") artAim(ctx, cx, cy);
    else if (card.art === "train") artTrain(ctx, cx, cy);
    else artShop(ctx, cx, cy);

    ctx.fillStyle = railInk.text;
    ctx.font = `26px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(card.title, cx, TOP + 210);

    const lines = wrap(ctx, runsOf(card.body), CARD.w - PAD * 2, 18);
    drawRuns(ctx, lines, x + PAD, TOP + 244, 18, 27);
  });

  // 하단 한 줄
  drawRunsCentered(ctx, runsOf(TUT_FOOT), VIEW.w / 2, TOP + CARD.h + 40, 18);

  // 「시작하기」 자리 = 카드 열의 **우하단**
  return { x: x0 + totalW - 200, y: TOP + CARD.h + 64, w: 200, h: 46 };
}
