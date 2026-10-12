import { HUD, VIEW } from "./balance";
import { FONT, FONT_DISPLAY, buttonPanel, railInk, woodPanel } from "./hud";
import { drawTutorial, markTutorialSeen } from "./tutorial";
import { beginControls, registerControl } from "./controls";
import { getAudioSettings, setAudioSettings, playSound } from "./audio";
import { getEffectSettings, setEffectSettings } from "./render-settings";

type Hit = { x: number; y: number; w: number; h: number; act: string; run: () => void };
export type Pause = { on: boolean; ask: boolean; help: boolean; hits: Hit[] };
export function makePause(): Pause { return { on: false, ask: false, help: false, hits: [] }; }
export function paused(p: Pause): boolean { return p.on || p.ask || p.help; }
function closeHelp(p: Pause): void { p.help = false; markTutorialSeen(); }

export function drawPause(ctx: CanvasRenderingContext2D, p: Pause, mouse: { x: number; y: number } | null,
  onExit: () => void = () => {}, checkpoint = "마지막 정차/출발 시점", saveOk = true): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  p.hits = [];
  const button = (act: string, label: string, x: number, y: number, w: number, run: () => void) => {
    const h = 44;
    const action = () => { playSound("ui"); run(); };
    const primary = act === "ok" || (act === "toggle" && p.on) || (act === "helpClose" && !p.on);
    const hover = !!mouse && mouse.x >= x && mouse.x <= x+w && mouse.y >= y && mouse.y <= y+h;
    buttonPanel(ctx, x, y, w, h, primary ? "primary" : "secondary", hover);
    ctx.fillStyle = primary ? railInk.dark : railInk.text; ctx.font = `22px ${FONT_DISPLAY}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label,x+w/2,y+h/2);
    p.hits.push({ x,y,w,h,act,run: action });
    registerControl(`pause-${act}`,label,{x,y,w,h},action);
  };
  if (p.help) {
    beginControls("tutorial");
    const r = drawTutorial(ctx);
    button("helpClose",p.on ? "닫기" : "시작하기",r.x,r.y,r.w,() => closeHelp(p));
    return;
  }
  if (p.ask) {
    beginControls("exit-confirm");
    ctx.fillStyle = "#080603c9"; ctx.fillRect(0,0,VIEW.w,VIEW.h);
    woodPanel(ctx,340,225,600,270,12);
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillStyle=railInk.text; ctx.font=`32px ${FONT_DISPLAY}`;
    ctx.fillText("홈으로 돌아갈까요?",640,270);
    ctx.fillStyle=HUD.ink.title; ctx.font=`18px ${FONT}`;
    ctx.fillText(`이어하기: ${checkpoint}`,640,316);
    ctx.fillText("그 이후의 전투는 다시 플레이합니다.",640,346);
    if (!saveOk) { ctx.fillStyle="#ff9780"; ctx.fillText("저장 실패 · 이전 체크포인트만 유지됩니다.",640,377); }
    button("ok","홈으로",460,417,170,onExit);
    button("cancel","돌아가기",650,417,170,() => { p.ask=false; });
    return;
  }
  if (p.on) {
    beginControls("pause");
    ctx.fillStyle="#0b120fce"; ctx.fillRect(0,0,VIEW.w,VIEW.h);
    woodPanel(ctx,320,160,640,415,12);
    ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=railInk.text;
    ctx.font=`38px ${FONT_DISPLAY}`; ctx.fillText("일시정지",640,199);
    button("toggle","계속하기 · ESC",350,235,275,() => { p.on=false; });
    button("help","조작 / 도움말",645,235,285,() => { p.help=true; });
    const a=getAudioSettings();
    const next=(v:number) => v >= .99 ? 0 : Math.min(1,Math.round(v*4+1)/4);
    button("mute",a.muted ? "소리 켜기" : "음소거",350,294,135,() => setAudioSettings({muted:!a.muted}));
    button("master",`전체 ${Math.round(a.master*100)}%`,495,294,135,() => setAudioSettings({master:next(a.master)}));
    button("sfx",`효과음 ${Math.round(a.sfx*100)}%`,640,294,140,() => setAudioSettings({sfx:next(a.sfx)}));
    button("music",`BGM ${Math.round(a.music*100)}%`,790,294,140,() => setAudioSettings({music:next(a.music)}));
    const fx=getEffectSettings();
    button("effects",`효과 간소화 ${fx.reducedEffects ? "켬" : "끔"}`,350,353,275,() => setEffectSettings({reducedEffects:!fx.reducedEffects}));
    button("motion",`동작 줄이기 ${fx.reducedMotion ? "켬" : "끔"}`,645,353,285,() => setEffectSettings({reducedMotion:!fx.reducedMotion}));
    ctx.font=`18px ${FONT}`; ctx.fillStyle=railInk.muted;
    ctx.fillText(`저장: ${checkpoint}`,640,431);
    ctx.fillText(saveOk ? "전투 중 나가면 저장 지점부터 다시 시작합니다." : "저장 공간 부족 · 이번 진행은 저장되지 않았습니다.",640,460);
    button("exit","홈으로 나가기",505,495,270,() => { p.ask=true; });
    return;
  }
  button("toggle","일시정지",HUD.margin,HUD.margin,114,() => { p.on=true; });
  button("exit","나가기",HUD.margin+122,HUD.margin,100,() => { p.ask=true; });
}
export function pauseClick(p: Pause, x:number, y:number): "none" | "eaten" | "exit" {
  const hit=p.hits.find(h => x>=h.x && x<=h.x+h.w && y>=h.y && y<=h.y+h.h);
  if (hit) { hit.run(); return "eaten"; }
  return paused(p) ? "eaten" : "none";
}
export function pauseKey(p: Pause,key:string):boolean {
  if (key !== "Escape") return false;
  if (p.help) closeHelp(p);
  else if (p.ask) p.ask=false;
  else p.on=!p.on;
  return true;
}
