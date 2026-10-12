import "./styles.css";
import { DemoRun, LOCOMOTIVES, ROUNDS, type DemoMode } from "./engine";
import { drawPreview, drawScene, worldPoint } from "./render";
import { loadSprites, failed } from "../sprites";
import { buildBackground, loadPlate, plateLoaded } from "../plate";
import { loadFonts } from "../typography";
import { makeClock } from "../clock";
import { carName } from "../train";
import { BRANCHES } from "../balance";
import { drainActionEvents, setActionEventsEnabled } from "../action-events";
import { audioProbe, getAudioSettings, playSound, preloadAudio, setAudioSettings, setAudioState, soundForAction, unlockAudio } from "../audio";
import { getEffectSettings, setEffectSettings } from "../render-settings";

const app = document.querySelector<HTMLDivElement>("#app")!;
const modes: DemoMode[] = ["standard", "scout", "siege"];
const SEED = 7;
const qa = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("qa") === "1";
const HISTORY_KEY = `traindefense.demo.v1.results${qa ? ".qa" : ""}`;
type Result = { mode: DemoMode; won: boolean; seconds: number; hp: number; round: number; interrupts: number; commands: number; loss: number; builds: string[] };
let results: Result[] = [];
try {
  const stored: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  if (Array.isArray(stored)) results = stored.filter((x): x is Result => x && modes.includes(x.mode) && typeof x.won === "boolean" && [x.seconds,x.hp,x.round,x.interrupts,x.commands,x.loss].every(Number.isFinite) && Array.isArray(x.builds) && x.builds.every((s: unknown) => typeof s === "string")).slice(-12);
} catch { /* Private browsing may disable result history. */ }

let selected: DemoMode = "standard", ready = false, run: DemoRun | null = null;
let paused = false, tapMode: "strike" | "mark" = "strike", recorded = false, phaseShown = "";
let canvas: HTMLCanvasElement | null = null, aim = { x: 0, y: 0 }, selectedCar = 1;
let clock = makeClock(), lastHud = 0, coreSerial = 0, kills = 0, noticeText = "";
let frameMs: number[] = [];
let qaFast = false;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]!);
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,"0")}`;
const text = (id: string, value: string) => { const el = document.getElementById(id); if (el && el.textContent !== value) el.textContent = value; };
const button = (id: string, action: () => void) => document.getElementById(id)?.addEventListener("click", action);

function header() {
  return `<header class="site-header"><a class="wordmark" href="/demo.html" aria-label="전술 체험 처음으로"><span class="rail-logo" aria-hidden="true">II</span> TRAIN DEFENSE <span class="edition">전술 체험</span></a><div class="header-actions"><span class="test-badge">FIELD TEST 01</span><button id="mute" class="quiet" aria-pressed="${getAudioSettings().muted}">${getAudioSettings().muted ? "소리 켜기" : "소리 끄기"}</button><a class="quiet" href="/">기존 게임 ↗</a></div></header>`;
}
function bindHeader() {
  button("mute", () => {
    void unlockAudio();
    const settings = setAudioSettings({ muted: !getAudioSettings().muted });
    text("mute", settings.muted ? "소리 켜기" : "소리 끄기");
    document.getElementById("mute")?.setAttribute("aria-pressed", String(settings.muted));
  });
}
function historyTable() {
  return `<div class="comparison"><div><span class="eyebrow">이 기기의 최근 결과</span><p>같은 개조 경로와 편성으로 비교하세요. 누적 피격은 정비 회복 전 받은 피해입니다.</p></div><div class="table-scroll"><table><thead><tr><th>기관차</th><th>도달</th><th>남은 코어</th><th>누적 피격</th><th>시전 차단</th><th>전투 시간</th></tr></thead><tbody>${modes.map(mode => {
    const r = results.filter(r => r.mode === mode).at(-1);
    return `<tr><th>${escape(LOCOMOTIVES[mode].name)}</th>${r ? `<td>${r.won ? "완주" : `${r.round}구간`}</td><td>${r.hp.toFixed(0)}</td><td>${r.loss.toFixed(0)}</td><td>${r.interrupts}회</td><td>${time(r.seconds)}</td>` : `<td colspan="5" class="muted">아직 출동 기록이 없습니다</td>`}</tr>${r ? `<tr class="build-row"><td colspan="6">개조: ${r.builds.map(escape).join(" → ") || "첫 개조 전"}</td></tr>` : ""}`;
  }).join("")}</tbody></table></div></div>`;
}
function lobby() {
  run = null; canvas = null; paused = false; clock.reset(); phaseShown = "";
  setAudioState({ menu: true, running: false, paused: false });
  app.innerHTML = `${header()}<main class="lobby"><section class="intro"><div><p class="eyebrow">IRONLOOP · 전술 검증 출동</p><h1>편성을 고르고.<br>전선을 움직이다.</h1><p class="intro-copy">기관차의 운행, 무기의 진화, 적의 허점을 체험하는 짧은 원정.<br>먼저 표준 기관차로 출발한 뒤, 같은 전장을 다른 기관차로 비교해 보세요.</p><div class="facts"><span><b>10–12</b> 분 내외</span><span><b>3</b> 번의 개조</span><span><b>1</b> 최종 보스</span></div></div><div class="dispatch-art"><div class="drawing-title"><span>STARTING CONSIST</span><span>06 CARS / SEED 07</span></div><canvas id="consist-preview" width="560" height="200" aria-label="기관차와 시작 열차 6량"></canvas><div class="route-line"><span>방패 전열</span><i></i><span>돌격 부대</span><i></i><span>주술·습격</span><i></i><span>그람</span></div><p>공통 조작과 강화 개선은 세 기관차에 모두 적용됩니다.</p></div></section>
    <section aria-labelledby="choose-title"><div class="section-line"><h2 id="choose-title">이번 출동의 기관차</h2><span>같은 무기 · 같은 적 · 다른 운행</span></div><div class="mode-grid" role="radiogroup" aria-label="기관차 선택">${modes.map((mode,i) => {
      const m=LOCOMOTIVES[mode];
      return `<button class="mode-card ${selected===mode?"selected":""}" role="radio" aria-checked="${selected===mode}" data-mode="${mode}" style="--accent:${m.color}"><div class="mode-top"><span>0${i+1} / ${mode === "standard" ? "비교 기준" : "기관차 특화"}</span><span class="selection-dot" aria-hidden="true"></span></div><h3>${escape(m.name)}</h3><p class="mode-subtitle">${escape(m.subtitle)}</p><p class="mode-description">${escape(m.description)}</p><dl><div><dt>강점</dt><dd>${escape(m.strength)}</dd></div><div><dt>제약</dt><dd>${escape(m.weakness)}</dd></div></dl></button>`;
    }).join("")}</div></section>
    <div class="departure"><div><strong id="selected-name">${escape(LOCOMOTIVES[selected].name)} 선택</strong><p>출동 중에는 일시정지할 수 있습니다. 페이지를 닫으면 이번 출동이 종료됩니다.</p></div><button class="primary" id="start" ${ready?"":"disabled"}>${ready?"이 편성으로 출발 →":"전장 준비 중…"}</button></div>
    <details class="field-guide"><summary>출발 전 조작과 전투 요령</summary><div class="guide-grid"><p><kbd>Q</kbd> 과급 · 급한 전선으로 이동<br><kbd>E</kbd> 집중사격 · 잠시 감속하며 화력 집중<br><kbd>F</kbd> 표적 순환 · 자동 사격의 우선순위 지정</p><p>전장 클릭 · 주포 발사 / 오른쪽 클릭 · 표적 지정<br>방향키 · 조준 이동 / <kbd>Space</kbd> · 주포<br><kbd>Esc</kbd> · 일시정지</p><p>방패의 측면을 노리거나 곡사로 후열을 공격하세요.<br>돌격·시전 예고를 보면 집중 표적과 주포를 활용하세요.<br>정차 중 지원칸을 무기 사이에 배치할 수 있습니다.<br>각 구간은 105초 안에 적을 모두 처치하면 돌파합니다.</p></div></details>
    ${historyTable()}<footer>체험 결과는 이 기기에만 저장됩니다. 본편의 진행 기록과 랭킹에는 반영되지 않습니다.</footer></main>`;
  bindHeader(); button("start", start);
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(el => {
    el.onclick = () => selectMode(el.dataset.mode as DemoMode);
    el.onkeydown = e => {
      if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) return;
      e.preventDefault(); const delta=["ArrowLeft","ArrowUp"].includes(e.key)?-1:1;
      selectMode(modes[(modes.indexOf(selected)+delta+3)%3]);
      document.querySelector<HTMLButtonElement>(`[data-mode="${selected}"]`)?.focus();
    };
  });
  if (ready) drawPreview(document.querySelector<HTMLCanvasElement>("#consist-preview")!, selected);
  window.scrollTo(0,0);
}
function selectMode(mode: DemoMode) {
  selected = mode;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(el => { const on=el.dataset.mode===mode; el.classList.toggle("selected",on); el.setAttribute("aria-checked",String(on)); });
  text("selected-name", `${LOCOMOTIVES[mode].name} 선택`);
  if (ready) drawPreview(document.querySelector<HTMLCanvasElement>("#consist-preview")!, mode);
}

function start() {
  if (!ready) return;
  void unlockAudio(); void preloadAudio();
  run = new DemoRun(selected, SEED); buildBackground(run.map, SEED);
  aim={x:run.map.cx,y:run.map.cy}; run.combat.aim=aim;
  paused=false; recorded=false; phaseShown=""; coreSerial=0; kills=0; frameMs=[]; tapMode="strike"; noticeText=""; clock=makeClock();qaFast=false;
  setActionEventsEnabled(true); clock.reset();
  app.innerHTML=`${header()}<main class="operation"><div class="operation-heading"><div><p class="eyebrow">${escape(LOCOMOTIVES[selected].name)} · 동일 조건 출동</p><h1 id="round-title">전투 준비</h1></div><div class="run-time"><span>전투 시간</span><strong id="elapsed">0:00</strong><button class="quiet" id="pause">일시정지 <kbd>Esc</kbd></button></div></div><div class="round-track" aria-label="원정 진행">${ROUNDS.map((_,i)=>`<span data-round="${i}">${String(i+1).padStart(2,"0")}</span>`).join("")}</div>
    <div class="battle-layout"><section class="battlefield" aria-label="전장"><canvas id="battle" width="1280" height="800" tabindex="0" role="application" aria-label="전장. 클릭으로 주포, 오른쪽 클릭으로 표적 지정. 방향키로 조준, Space로 주포, Q 과급, E 집중사격, F 표적 순환, Escape 일시정지."></canvas><div id="notice" class="battle-notice" role="status" aria-live="polite"></div><div class="battle-bottom"><span id="phase-caption">전선 진입</span><span id="alive">접근 중 0</span></div><div id="overlay-host"></div></section>
    <aside class="command-panel"><div class="core-panel"><span class="eyebrow">방어 코어</span><div><strong id="core">100</strong><span>/ 100</span></div><meter id="core-meter" min="0" max="100" low="30" value="100" aria-label="코어 체력"></meter></div>
    <div class="orders"><span class="eyebrow">운행 명령 <span id="cooldown">준비</span></span><button id="boost" class="order"><kbd>Q</kbd><span><b>과급</b><small>짧게 가속 · 다음 전선으로</small></span><span aria-hidden="true">↗</span></button><button id="focus" class="order"><kbd>E</kbd><span><b>집중사격</b><small>잠시 감속 · 화력 집중</small></span><span aria-hidden="true">◎</span></button><p id="ability-state" class="command-state">순항 중</p></div>
    <div class="target-controls"><span class="eyebrow">조준</span><div class="segmented"><button id="tap-strike" class="active" aria-pressed="true">주포 발사</button><button id="tap-mark" aria-pressed="false">표적 지정</button></div><button id="cycle" class="secondary">우선 표적 순환 <kbd>F</kbd></button><p id="artillery">주포 준비 완료 · 전장 클릭</p></div>
    <div class="intel"><span class="eyebrow">이번 전선</span><p id="brief"></p><ul id="counters"></ul></div><div class="compact-stats"><span>처치 <b id="kills">0</b></span><span>시전 차단 <b id="interrupts">0</b></span></div><button id="reduce" class="quiet" aria-pressed="${getEffectSettings().reducedEffects}">효과 줄이기 ${getEffectSettings().reducedEffects?"켜짐":"꺼짐"}</button></aside></div>
    <p class="input-hint">클릭: 주포 · 오른쪽 클릭: 표적 · 방향키: 조준 · Space: 주포 · Q/E: 운행 · F: 표적 순환</p>${qa?'<details class="qa"><summary>로컬 검증 정보</summary><button id="qa-speed">검증 속도 15배</button><pre id="qa-summary"></pre></details>':""}</main>`;
  canvas=document.querySelector<HTMLCanvasElement>("#battle")!;
  bindHeader(); button("pause",()=>setPaused(!paused)); button("boost",()=>command("boost")); button("focus",()=>command("focus"));
  button("cycle",()=>{ if (playing()) run!.cycleTarget(); });
  button("tap-strike",()=>setTapMode("strike")); button("tap-mark",()=>setTapMode("mark"));
  button("reduce",()=>{const on=!getEffectSettings().reducedEffects;setEffectSettings({reducedEffects:on,reducedMotion:on});text("reduce",`효과 줄이기 ${on?"켜짐":"꺼짐"}`);document.getElementById("reduce")?.setAttribute("aria-pressed",String(on));});
  button("qa-speed",()=>{qaFast=!qaFast;clock=makeClock(qaFast?15:1);text("qa-speed",qaFast?"검증 속도 15배 · 정상 속도로 전환":"검증 속도 15배");});
  canvas.addEventListener("pointermove",e=>{ if(!run||!canvas)return;aim=worldPoint(canvas,run,e.clientX,e.clientY);run.combat.aim=aim; });
  canvas.addEventListener("pointerdown",e=>{
    if(!playing()||!canvas||!run||e.button>2||e.button===1)return;
    canvas.focus();e.preventDefault();aim=worldPoint(canvas,run,e.clientX,e.clientY);run.combat.aim=aim;
    if(e.button===2||tapMode==="mark")run.mark(aim.x,aim.y);else run.strike(aim.x,aim.y);
  });
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  canvas.focus(); updateHud();
  window.scrollTo(0,0);
}
function setTapMode(mode: "strike"|"mark") {
  tapMode=mode;
  for(const id of ["strike","mark"]) {const el=document.getElementById(`tap-${id}`)!;el.classList.toggle("active",id===mode);el.setAttribute("aria-pressed",String(id===mode));}
}
function playing() { return !!run&&run.phase==="combat"&&!paused&&!document.hidden; }
function command(kind: "boost"|"focus") { if(playing()&&run!.command(kind))playSound("card",{volume:.4}); }
function setPaused(on: boolean) {
  if(!run||run.phase!=="combat")return;
  paused=on;clock.reset();phaseShown="";text("pause",on?"계속하기":"일시정지 Esc");syncOverlay();
  if(!on)canvas?.focus();
}
function modal(content: string, label: string) {
  document.getElementById("overlay-host")!.innerHTML=`<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-label="${label}">${content}</section></div>`;
  document.querySelector<HTMLElement>(".dialog button:not([disabled])")?.focus();
}
function syncOverlay() {
  if(!run)return;
  const state=paused?"paused":run.phase;
  if(state===phaseShown)return;
  phaseShown=state; clock.reset();
  if(state==="combat") {document.getElementById("overlay-host")!.replaceChildren();return;}
  if(state==="paused") {
    modal(`<p class="eyebrow">운행 중지</p><h2>잠시 정차합니다.</h2><p>전투와 재사용 대기시간이 모두 멈췄습니다.</p><button id="resume" class="primary">계속하기</button><button id="return" class="secondary">이번 출동 종료 · 기관차 선택</button>`,"일시정지");
    button("resume",()=>setPaused(false));button("return",lobby);return;
  }
  if(state==="upgrade") {workshop();return;}
  if(!recorded) {
    recorded=true;
    results.push({mode:run.mode,won:run.phase==="won",seconds:run.elapsed,hp:Math.max(0,run.combat.coreHp),round:run.round+1,interrupts:run.metrics.interrupts,commands:run.metrics.commands,loss:run.combat.coreDmgMob+run.combat.coreDmgBoss,builds:[...run.history]});
    results=results.slice(-12);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(results));}catch{/* Optional local history. */}
  }
  const won=state==="won";
  modal(`<p class="eyebrow">${escape(LOCOMOTIVES[run.mode].name)} · 출동 기록</p><h2>${won?"철로를 지켰습니다.":"방어선이 무너졌습니다."}</h2><p>${won?"다른 기관차로 같은 전장을 돌파해 보세요.":`${run.round+1}구간 · ${escape(run.notice)}. 표적 지정과 주포로 지원병·시전을 먼저 끊어 보세요.`}</p><div class="result-grid"><div><span>남은 코어</span><strong>${Math.max(0,run.combat.coreHp).toFixed(0)}</strong></div><div><span>전투 시간</span><strong>${time(run.elapsed)}</strong></div><div><span>운행 명령</span><strong>${run.metrics.commands}회</strong></div><div><span>시전 차단</span><strong>${run.metrics.interrupts}회</strong></div></div><p class="damage-summary">이번 출동 누적 코어 피격: ${(run.combat.coreDmgMob+run.combat.coreDmgBoss).toFixed(0)}</p><p class="build-summary">${run.history.map(escape).join(" → ")||"첫 개조 전"}</p><button id="compare" class="primary">다른 기관차와 비교하기 →</button><button id="retry" class="secondary">같은 기관차로 다시 출동</button>`,"출동 결과");
  button("compare",()=>{selected=modes[(modes.indexOf(selected)+1)%3];lobby();});button("retry",start);
}
function workshop() {
  if(!run)return;
  selectedCar=Math.min(Math.max(1,selectedCar),run.train.cars.length-1);
  modal(`<p class="eyebrow">정차역 · ${run.round+1}구간 완료</p><h2>다음 전투를 위한 한 가지 변화.</h2><p>코어를 최대 20 수리했습니다. 개조 하나를 고른 뒤 새 편성을 배치하고 출발하세요.</p><div class="consist-editor"><div class="car-strip">${run.train.cars.map((car,i)=>`<button data-car="${i}" class="car-slot ${i===selectedCar?"selected":""}" ${i===0?"disabled":""}><span>${i===0?"선두":String(i+1).padStart(2,"0")}</span><strong>${escape(carName(car.kind))}</strong><small>${car.kind==="hero"||car.kind==="collector"||car.kind==="ammo"?"지원":`T${car.tier}`}</small></button>`).join("")}</div><div class="reorder"><span id="car-detail"></span><button id="move-front" class="quiet" ${selectedCar<=1?"disabled":""}>← 앞 칸과 교환</button><button id="move-back" class="quiet" ${selectedCar>=run.train.cars.length-1?"disabled":""}>뒤 칸과 교환 →</button></div><p class="adjacency">탄약고는 앞·뒤 무기 공속 +30%, 관측칸은 앞·뒤 직사 무기의 언덕 사격을 돕습니다.</p></div>${run.chosenUpgrade ? `<div class="chosen-upgrade"><span class="eyebrow">적용한 개조</span><h3>${escape(run.chosenUpgrade.name)}</h3><p>${escape(run.chosenUpgrade.description)}</p><p>${escape(run.chosenUpgrade.detail)}</p></div><button id="depart" class="primary">이 편성으로 다음 전선 →</button>` : `<div class="upgrade-grid">${run.choices.map((c,i)=>`<button class="upgrade-card" data-upgrade="${escape(c.id)}"><span class="eyebrow">개조 0${i+1}</span><h3>${escape(c.name)}</h3><p>${escape(c.description)}</p><small>${escape(c.detail)}</small><b>이 개조 적용 →</b></button>`).join("")}</div>`}`,"정차역 개조 선택");
  button("depart",()=>{if(run?.depart()){phaseShown="";syncOverlay();canvas?.focus();}});
  const car=run.train.cars[selectedCar];const branch=BRANCHES[car.kind]?.find(b=>b.id===car.branch);
  text("car-detail",`${carName(car.kind)}${branch?` · ${branch.name}`:""}`);
  document.querySelectorAll<HTMLButtonElement>("[data-car]").forEach(el=>el.onclick=()=>{selectedCar=Number(el.dataset.car);workshop();document.querySelector<HTMLButtonElement>(`[data-car="${selectedCar}"]`)?.focus();});
  const move=(dir:-1|1)=>{if(run?.moveCar(selectedCar,dir)){selectedCar+=dir;workshop();document.getElementById(dir===-1?"move-front":"move-back")?.focus();}};
  button("move-front",()=>move(-1));button("move-back",()=>move(1));
  document.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach(el=>el.onclick=()=>{if(run?.choose(el.dataset.upgrade!)){workshop();document.getElementById("depart")?.focus();}});
}
function updateHud() {
  if(!run)return;
  const info=ROUNDS[run.round];
  text("round-title",`${String(run.round+1).padStart(2,"0")} / ${info.name}`);text("elapsed",time(run.elapsed));
  text("core",String(Math.max(0,Math.ceil(run.combat.coreHp))));
  const meter=document.getElementById("core-meter") as HTMLMeterElement;meter.value=Math.max(0,run.combat.coreHp);
  text("alive",`접근 중 ${run.field.list.length}`);text("kills",String(run.combat.kills));text("interrupts",String(run.metrics.interrupts));
  text("brief",info.brief);
  const counters=document.getElementById("counters")!;
  if(counters.dataset.round!==String(run.round)){counters.innerHTML=info.counters.map(c=>`<li>${escape(c)}</li>`).join("");counters.dataset.round=String(run.round);}
  text("cooldown",run.cooldown>0?`${Math.ceil(run.cooldown)}초 후 준비`:"준비");
  text("ability-state",run.ability==="cruise"?"순항 중":`${run.ability==="boost"?"과급 운행":"집중사격"} · ${run.abilityLeft.toFixed(1)}초`);
  for(const id of ["boost","focus","cycle"]){const el=document.getElementById(id) as HTMLButtonElement;el.disabled=!playing()||(id!=="cycle"&&run.cooldown>0);}
  text("artillery",run.combat.artCd>0?`주포 장전 ${run.combat.artCd.toFixed(1)}초`:`주포 준비 완료 · ${tapMode==="strike"?"전장 클릭":"발사 모드로 전환"}`);
  text("phase-caption",run.phase==="combat"?`${run.waveTime>=run.roundLimit-15 ? `봉쇄 제한 ${Math.max(0,Math.ceil(run.roundLimit-run.waveTime))}초` : run.waveTime<run.roundDuration?"적 부대 접근":"전선 정리"} · ${run.history.length}/3 개조`:run.phase==="upgrade"?"안전 정차 · 전투 일시 중지":"출동 종료");
  document.querySelectorAll<HTMLElement>("[data-round]").forEach(el=>{const n=Number(el.dataset.round);el.classList.toggle("current",n===run!.round);el.classList.toggle("done",n<run!.round);if(n===run!.round)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");});
  const notice=run.noticeLeft>0?run.notice:"";
  if(notice!==noticeText){text("notice",notice);noticeText=notice;document.getElementById("notice")!.classList.toggle("visible",!!notice);}
  if(qa) {
    const sorted=[...frameMs].sort((a,b)=>a-b);
    text("qa-summary",JSON.stringify({mode:run.mode,phase:run.phase,paused,round:run.round+1,seconds:run.elapsed,hp:run.combat.coreHp,kills:run.combat.kills,alive:run.field.list.length,ability:run.ability,cooldown:run.cooldown,marked:run.marked?.kind,metrics:run.metrics,history:run.history,cars:run.train.cars.map(c=>({kind:c.kind,tier:c.tier,branch:c.branch})),updateRenderP95:sorted[Math.floor(sorted.length*.95)]??0,audio:audioProbe()},null,2));
  }
  syncOverlay();
}

document.addEventListener("keydown",e=>{
  const dialog=document.querySelector<HTMLElement>(".dialog");
  if(e.key==="Tab"&&dialog){
    const items=Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input'));
    const first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;
  }
  if(!run)return;
  if(e.key==="Escape"){e.preventDefault();setPaused(!paused);return;}
  if(!playing()||dialog||e.target instanceof HTMLInputElement)return;
  const key=e.key.toLowerCase();
  if(key==="q"||key==="e"){e.preventDefault();if(!e.repeat)command(key==="q"?"boost":"focus");}
  else if(key==="f"){e.preventDefault();if(!e.repeat)run.cycleTarget();}
  else if(e.target===canvas&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Enter"].includes(e.key)){
    e.preventDefault();
    if(e.key===" "||e.key==="Enter")run.strike(aim.x,aim.y);
    else {const delta=18;aim={x:Math.max(0,Math.min(run.map.w,aim.x+(e.key==="ArrowLeft"?-delta:e.key==="ArrowRight"?delta:0))),y:Math.max(0,Math.min(run.map.h,aim.y+(e.key==="ArrowUp"?-delta:e.key==="ArrowDown"?delta:0)))};run.combat.aim=aim;}
  }
});
document.addEventListener("visibilitychange",()=>{clock.reset();if(document.hidden&&run?.phase==="combat")setPaused(true);});

function tick(now: number) {
  const startMs=performance.now();
  clock.advance(now,!playing(),()=>{if(playing())run!.step(1/60);});
  if(run&&canvas) {
    drawScene(canvas,run);
    if(now-lastHud>100){updateHud();lastHud=now;}
    const active=playing();setAudioState({menu:false,running:active,paused:!active,hidden:document.hidden,danger:run.combat.coreHp<25});
    for(const event of drainActionEvents())if(active){const sound=soundForAction(event);if(sound)playSound(sound,{pan:Math.max(-.65,Math.min(.65,(event.x-run.map.cx)/run.map.outerR)),volume:.8});}
    if(active&&run.combat.coreImpact.serial>coreSerial)playSound("coreDamage");
    if(active&&run.combat.kills>kills)playSound("death",{volume:.25});
    coreSerial=run.combat.coreImpact.serial;kills=run.combat.kills;
    frameMs.push(performance.now()-startMs);if(frameMs.length>180)frameMs.shift();
  } else drainActionEvents();
  requestAnimationFrame(tick);
}
lobby();requestAnimationFrame(tick);
async function load() {
  try {
    await Promise.all([loadSprites(),loadPlate("wide"),loadFonts()]);
    if(!plateLoaded||failed.length)throw new Error("일부 전장 이미지를 불러오지 못했습니다.");
    ready=true;lobby();
  } catch(error) {
    const startButton=document.getElementById("start") as HTMLButtonElement;
    startButton.disabled=false;startButton.textContent="다시 불러오기";startButton.onclick=()=>location.reload();
    text("selected-name",error instanceof Error?error.message:"전장을 준비하지 못했습니다.");
  }
}
void load();
