import "../styles/sounds.css";
import { loadFonts } from "./typography";
import { audioProbe, getAudioSettings, playAudition, playMusicPreview, musicPreviewPosition, preloadAudio, setAudioSettings, stopAllEffects, stopMusicPreview, unlockAudio } from "./audio";
import { ENEMY_SOUND_MAP, SOUND_BY_ID, SOUND_CATALOG, WEAPON_SOUND_MAP, type SoundName } from "./sound-catalog";
import { MUSIC_TRACKS, type MusicId } from "./music-catalog";
import { ENEMY_STATS } from "./balance";
import { carName, drawCarArt, type CarKind } from "./train";
import { draw, loadSprites, sprite } from "./sprites";

type Tab = "train" | "enemy" | "system" | "all" | "music";
const catalog = document.querySelector<HTMLDivElement>("#catalog")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;
const search = document.querySelector<HTMLInputElement>("#search")!;
const volume = document.querySelector<HTMLInputElement>("#volume")!;
const volumeValue = document.querySelector<HTMLOutputElement>("#volume-value")!;
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const actionLabels: Record<string, string> = { melee: "근접 공격", shot: "원거리 공격", spit: "산성 뱉기", rock: "투석", charge: "돌진", quake: "지면 강타", summon: "소환·방출", raise: "부활", plant: "폭탄 설치", explode: "자폭", break: "벽 파괴", smoke: "연막", heal: "회복", buff: "강화" };
let tab: Tab = "train", playToken = 0, timer = 0, musicTimer = 0, spritesReady = false;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") => {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
};
// This uses the same persisted volume control as the game.
volume.value = String(Math.round(getAudioSettings().master * 100));
volumeValue.value = `${volume.value}%`;
volume.addEventListener("input", () => { volumeValue.value = `${volume.value}%`; setAudioSettings({ master: +volume.value / 100 }); });
function stop() {
  playToken++; clearTimeout(timer); clearInterval(musicTimer); stopAllEffects(); stopMusicPreview(); document.body.classList.remove("playing");
  document.querySelectorAll(".playing-cue").forEach(node => node.classList.remove("playing-cue"));
  document.querySelectorAll<HTMLButtonElement>("[data-music], [data-seam]").forEach(button => button.setAttribute("aria-pressed", "false"));
}
document.querySelector("#stop")!.addEventListener("click", () => { stop(); status.textContent = "재생을 멈췄습니다."; });
document.addEventListener("visibilitychange", () => { if (document.hidden) { stop(); status.textContent = "재생을 멈췄습니다."; } });
async function audition(id: SoundName, button: HTMLButtonElement) {
  stop(); const token = playToken; status.textContent = "소리를 준비하고 있습니다…";
  const settings = getAudioSettings();
  if (settings.muted || settings.sfx === 0) setAudioSettings({ muted: false, sfx: settings.sfx || .7 });
  const unlocked = await unlockAudio(); await preloadAudio();
  if (token !== playToken || document.hidden) return;
  if (!unlocked || !playAudition(id)) { status.textContent = audioProbe().missing.includes(id) ? "음원을 불러오지 못했습니다. 페이지를 새로고침해 주세요." : "재생할 수 없습니다. 음량과 브라우저 소리 설정을 확인해 주세요."; return; }
  const cue = SOUND_BY_ID[id]; status.textContent = `${cue.name} · ${cue.duration.toFixed(2)}초`;
  button.classList.add("playing-cue"); document.body.classList.add("playing");
  timer = window.setTimeout(() => { if (token === playToken) { stop(); status.textContent = `${cue.name} · 재생 완료`; } }, cue.duration * 1000 + 80);
}
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
async function auditionMusic(id: MusicId, seam: boolean, button: HTMLButtonElement) {
  stop(); const token = playToken;
  const track = MUSIC_TRACKS.find(t => t.id === id)!;
  status.textContent = `${track.title} · 준비하고 있습니다…`;
  if (getAudioSettings().muted) setAudioSettings({ muted: false });
  const playing = await playMusicPreview(id, seam);
  if (token !== playToken || document.hidden) return;
  if (!playing) { status.textContent = "음악을 재생하지 못했습니다. 음량과 연결 상태를 확인한 뒤 다시 눌러주세요."; return; }
  button.classList.add("playing-cue"); button.setAttribute("aria-pressed", "true"); document.body.classList.add("playing");
  status.textContent = `${track.title} · ${seam ? "마지막 4초부터 이음새를 듣습니다" : "반복 재생 중"}`;
  const card = button.closest("article")!, progress = card.querySelector("progress")!, clock = card.querySelector(".music-time")!;
  const update = () => {
    const position = musicPreviewPosition();
    if (!position) { stop(); status.textContent = "재생을 멈췄습니다."; return; }
    progress.value = position.position / position.duration;
    clock.textContent = `${time(position.position)} / ${time(position.duration)} · ${position.loops + 1}회차`;
  };
  update(); musicTimer = window.setInterval(update, 200);
}
function cueButton(id: SoundName, label?: string) {
  const cue = SOUND_BY_ID[id], button = el("button", "", "cue"); button.type = "button"; button.dataset.sound = id;
  button.setAttribute("aria-label", `${cue.name} 듣기`);
  button.append(el("span", "▶", "play-icon"), el("span", label ?? cue.name.split(" · ").slice(1).join(" · "), "cue-label"), el("small", `${cue.duration.toFixed(2)}s`));
  button.addEventListener("click", () => void audition(id, button)); return button;
}
function thumbnail(kind: string, enemy: boolean) {
  const canvas = el("canvas", "", "portrait"); canvas.width = 128; canvas.height = 128; canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.kind = kind; canvas.dataset.enemy = String(enemy);
  if (spritesReady) { const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false;
    if (enemy) {
      const stats = ENEMY_STATS[kind], name = stats.palette ? kind : stats.sprite ?? kind;
      const art = sprite(name);
      if (art) draw(ctx, name, 64, 64, Math.min(104, 104 * art.h / art.w));
    }
    else drawCarArt(ctx, kind as CarKind, 64, 64, 78, -Math.PI / 2);
  } return canvas;
}
function render() {
  catalog.replaceChildren(); const query = search.value.trim().toLocaleLowerCase(); let count = 0;
  const matches = (value: string) => value.toLocaleLowerCase().includes(query);
  const add = (title: string, detail: string, entries: [string, SoundName][], kind?: string, enemy = false) => {
    const searchable = `${title} ${detail} ${entries.map(([label, id]) => `${label} ${SOUND_BY_ID[id].name} ${SOUND_BY_ID[id].description}`).join(" ")}`;
    if (!matches(searchable)) return; count++;
    const card = el("article", "", "sound-card"), heading = el("div", "", "card-heading"), text = el("div");
    if (kind) heading.append(thumbnail(kind, enemy));
    text.append(el("h3", title), el("p", detail)); heading.append(text); card.append(heading);
    const buttons = el("div", "", "cue-list"); entries.forEach(([label, id]) => buttons.append(cueButton(id, label))); card.append(buttons);
    if (!entries.length) card.append(el("p", "정찰 전용 · 공격하지 않습니다.", "quiet"));
    catalog.append(card);
  };
  if (tab === "train") for (const [kind, cues] of Object.entries(WEAPON_SOUND_MAP)) {
    add(kind === "hero" ? "조준 포격" : carName(kind as CarKind), SOUND_BY_ID[cues.fire].description, [["발사", cues.fire], ["명중·폭발", cues.impact]], kind);
  } else if (tab === "enemy") for (const [kind, row] of Object.entries(ENEMY_SOUND_MAP)) {
    const unique = new Set<SoundName>(), entries: [string, SoundName][] = [];
    for (const [action, id] of Object.entries(row.actions)) if (id && !unique.has(id)) { unique.add(id); entries.push([actionLabels[action] ?? action, id]); }
    add(row.name, row.family, entries, kind, true);
  } else if (tab === "music") MUSIC_TRACKS.forEach(track => {
    if (!matches(`${track.title} ${track.style} ${track.description} ${track.bpm}`)) return; count++;
    const card = el("article", "", "sound-card music-card"), heading = el("div", "", "card-heading"), text = el("div");
    card.dataset.track = track.id;
    text.append(el("span", `현재 게임 BGM / ${track.style}`, "music-kicker"), el("h3", track.title), el("p", track.description));
    heading.append(text); card.append(heading, el("p", `${track.bpm} BPM · ${track.key} · ${time(track.duration)}`, "music-meta"));
    const buttons = el("div", "", "cue-list");
    for (const seam of [false, true]) {
      const button = el("button", seam ? "↻ 이음새 듣기 · 마지막 4초부터" : "▶ 반복 듣기", "cue");
      button.type = "button"; button.dataset[seam ? "seam" : "music"] = track.id;
      button.setAttribute("aria-label", `${track.title} ${seam ? "이음새 듣기" : "반복 듣기"}`); button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => void auditionMusic(track.id, seam, button)); buttons.append(button);
    }
    const progress = el("progress"); progress.max = 1; progress.value = 0; progress.setAttribute("aria-label", `${track.title} 재생 위치`);
    card.append(buttons, progress, el("p", `0:00 / ${time(track.duration)}`, "music-time")); catalog.append(card);
  });
  else for (const cue of SOUND_CATALOG) if (tab === "all" || cue.category === "system") {
    add(cue.name, cue.description, [["들어보기", cue.id]]);
  }
  document.querySelector("#section-title")!.textContent = { train: "무기마다 다른 한 발", enemy: "괴물마다 다른 위협", system: "전장이 보내는 신호", all: "모든 소리, 한곳에서", music: "전투를 받치는 리듬" }[tab];
  document.querySelector<HTMLParagraphElement>("#music-note")!.hidden = tab !== "music";
  document.querySelector("#result-count")!.textContent = `${count}개 항목`;
  document.querySelector<HTMLParagraphElement>("#empty")!.hidden = count > 0;
}
function select(button: HTMLButtonElement) { stop(); status.textContent = "듣기 버튼을 누르면 재생합니다."; tab = button.dataset.tab as Tab; tabs.forEach(t => { const active = t === button; t.setAttribute("aria-selected", String(active)); t.tabIndex = active ? 0 : -1; }); catalog.setAttribute("aria-labelledby", button.id); render(); }
tabs.forEach(button => { button.id = `tab-${button.dataset.tab}`; button.setAttribute("aria-controls", "catalog"); });
catalog.setAttribute("aria-labelledby", "tab-train");
tabs.forEach((button, i) => { button.addEventListener("click", () => select(button)); button.addEventListener("keydown", event => {
  const idx = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
  if (idx < 0) return; event.preventDefault(); tabs[idx].focus(); select(tabs[idx]);
}); });
search.addEventListener("input", () => { stop(); status.textContent = "듣기 버튼을 누르면 재생합니다."; render(); });
window.addEventListener("hashchange", () => { if (location.hash === "#music") select(tabs.find(t => t.dataset.tab === "music")!); });
const credits = document.querySelector("#credits")!;
for (const url of new Set(SOUND_CATALOG.flatMap(cue => [...cue.sourceUrls]))) { const li = el("li"), link = el("a", `${new URL(url).hostname.replace("www.", "")} / ${url.split("/").at(-1)!.replaceAll("-", " ")}`); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; li.append(link); credits.append(li); }
document.querySelector(".stamp strong")!.textContent = String(SOUND_CATALOG.length);
select(tabs.find(t => t.dataset.tab === (location.hash === "#music" ? "music" : "train"))!); void preloadAudio();
void Promise.all([loadFonts(), loadSprites()]).then(() => {
  spritesReady = true;
  catalog.querySelectorAll<HTMLCanvasElement>("canvas[data-kind]").forEach(canvas => {
    canvas.replaceWith(thumbnail(canvas.dataset.kind!, canvas.dataset.enemy === "true"));
  });
});
