import { LAYOUT } from "../balance";
import { drawAcidPools, drawCombat, drawDrops, drawEffects, drawFires, drawSmoke } from "../combat";
import { drawBreach, drawField, drawThreatCues } from "../enemy";
import { drawCoreGlow, drawCoreImpact, drawMap } from "../map";
import { drawBackground } from "../plate";
import { at, carS, drawCarArt, drawTrain, type CarKind } from "../train";
import { FONT, FONT_DISPLAY } from "../typography";
import { LOCOMOTIVES, type DemoMode, type DemoRun } from "./engine";

/** Chassis fittings are presentation only; the common rail footprint stays fixed. */
function fittings(ctx: CanvasRenderingContext2D, mode: DemoMode, x: number, y: number, h: number, angle: number) {
  if (mode === "standard") return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(h / 48, h / 48);
  ctx.fillStyle = "#15231f"; ctx.strokeStyle = LOCOMOTIVES[mode].color; ctx.lineWidth = 1.5;
  if (mode === "scout") {
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sign * 9, 11); ctx.lineTo(sign * 14, 17); ctx.lineTo(sign * 14, -12); ctx.lineTo(sign * 9, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = "#b9e4c4"; ctx.fillRect(-4, -20, 8, 3);
  } else {
    ctx.fillRect(-15, -17, 30, 9); ctx.strokeRect(-15, -17, 30, 9);
    ctx.fillRect(-14, 4, 28, 13); ctx.strokeRect(-14, 4, 28, 13);
    ctx.fillStyle = "#b2aaa0";
    for (const xx of [-11, 9]) ctx.fillRect(xx, -14, 2, 4);
  }
  ctx.restore();
}

export function drawPreview(canvas: HTMLCanvasElement, mode: DemoMode) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = false;
  ctx.strokeStyle = "#69756c"; ctx.lineWidth = 2;
  for (const yy of [h * .56 - 21, h * .56 + 21]) { ctx.beginPath(); ctx.moveTo(18, yy); ctx.lineTo(w - 18, yy); ctx.stroke(); }
  ctx.strokeStyle = "#414f47"; ctx.lineWidth = 6;
  for (let x = 20; x < w - 16; x += 18) { ctx.beginPath(); ctx.moveTo(x, h * .56 - 26); ctx.lineTo(x, h * .56 + 26); ctx.stroke(); }
  const kinds: CarKind[] = ["collector", "flamer", "mortar", "railgun", "machinegun", "hero"];
  const spacing = Math.min(78, (w - 60) / 6), first = w / 2 - spacing * 2.5;
  kinds.forEach((kind, i) => {
    const x = first + i * spacing;
    drawCarArt(ctx, kind, x, h * .56, 65, Math.PI / 2, Math.PI / 2);
    if (kind === "hero") fittings(ctx, mode, x, h * .56, 65, Math.PI / 2);
  });
  ctx.fillStyle = LOCOMOTIVES[mode].color; ctx.font = `18px ${FONT_DISPLAY}`; ctx.textAlign = "left";
  ctx.fillText("동일한 시작 편성 · 6량", 20, h - 17);
  ctx.font = `12px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = "#aebbb0";
  ctx.fillText("기관차 →", w - 20, 26);
}

export function worldPoint(canvas: HTMLCanvasElement, run: DemoRun, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(canvas.width / run.map.w, canvas.height / run.map.h);
  return { x: run.map.cx + ((clientX - rect.left) * canvas.width / rect.width - canvas.width / 2) / scale,
    y: run.map.cy + ((clientY - rect.top) * canvas.height / rect.height - canvas.height / 2) / scale };
}

export function drawScene(canvas: HTMLCanvasElement, run: DemoRun) {
  const ctx = canvas.getContext("2d")!, { map, combat, field, train } = run;
  const scale = Math.min(canvas.width / map.w, canvas.height / map.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#202a22"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - map.cx * scale, canvas.height / 2 - map.cy * scale);
  drawBackground(ctx, map); drawCoreGlow(ctx, map, run.elapsed, combat.coreHp / 100, field.list.some(e => e.atCore || e.firing));
  drawMap(ctx, map, combat.aim); drawDrops(ctx, combat); drawFires(ctx, combat); drawAcidPools(ctx, combat);
  drawField(ctx, field, map); drawSmoke(ctx, combat); drawTrain(ctx, train);
  const p = at(train.track, carS(train, 0));
  fittings(ctx, run.mode, p.x, p.y, LAYOUT.carLen, p.ang + Math.PI / 2);
  if (run.ability !== "cruise") {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.strokeStyle = run.ability === "boost" ? "#b4f4d6" : "#f5cf79"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const xx = -LAYOUT.carLen * .65 - i * 9;
      ctx.beginPath(); ctx.moveTo(xx, -10); ctx.lineTo(xx - 5, 0); ctx.lineTo(xx, 10); ctx.stroke();
    }
    ctx.restore();
  }
  drawBreach(ctx, field, map); drawCombat(ctx, combat); drawEffects(ctx, combat);
  drawCoreImpact(ctx, map, combat.coreImpact); drawThreatCues(ctx, field, map);
  for (const cue of run.cues) {
    const color = cue.kind === "weak" ? "#b9f3d2" : cue.kind === "cast" ? "#e3b8ef" : "#ffae79";
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3 / scale; ctx.setLineDash([6 / scale, 5 / scale]);
    ctx.beginPath(); ctx.arc(cue.x, cue.y, cue.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cue.x, cue.y, cue.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(.03, cue.progress)); ctx.stroke();
    ctx.font = `600 ${13 / scale}px ${FONT}`; ctx.textAlign = "center";
    const width = ctx.measureText(cue.label).width + 16 / scale;
    ctx.fillStyle = "#14221fec"; ctx.fillRect(cue.x - width / 2, cue.y - cue.r - 28 / scale, width, 21 / scale);
    ctx.fillStyle = color; ctx.fillText(cue.label, cue.x, cue.y - cue.r - 13 / scale); ctx.restore();
  }
  const mark = run.marked;
  if (mark && mark.hp > 0) {
    ctx.strokeStyle = "#ffe2a0"; ctx.lineWidth = 2.5 / scale;
    const r = 25 / scale;
    for (const [dx, dy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      ctx.beginPath(); ctx.moveTo(mark.x + dx * r, mark.y + dy * (r - 9 / scale));
      ctx.lineTo(mark.x + dx * r, mark.y + dy * r); ctx.lineTo(mark.x + dx * (r - 9 / scale), mark.y + dy * r); ctx.stroke();
    }
    ctx.textAlign = "center"; ctx.font = `600 ${12 / scale}px ${FONT}`; ctx.fillStyle = "#fff1cb";
    ctx.fillText(`집중 표적 · ${Math.ceil(run.markLeft)}초`, mark.x, mark.y - r - 9 / scale);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
