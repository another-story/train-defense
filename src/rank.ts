// 랭킹 (DESIGN §0.7 N · 감독 #67 ④ · 서버 연결은 감독 #70 = INBOX #72 ⑨).
// **기록은 Supabase 테이블 `public.td_ranking`에 있다** — 게임은 정적 배포를 유지한 채 REST로
// 직접 읽고 쓴다(서버 코드 없음). 이 파일의 규약 하나는 그대로다: **기록 한 줄(`RankRow`)이 곧
// 서버 테이블의 행**이고, 서버가 붙어도 **정렬·표시·판정은 한 줄도 안 바뀐다.**
//   · `uid` = `client_id`(기기당 1행 · **unique**) · `id` = 같은 값 (한 기기에 행이 하나뿐이라
//     「내 기록인가」는 여전히 **`row.uid === profile().uid`** 하나로 판정된다) · `at` = `created_at`
//
// **최고 기록 판단을 클라이언트가 안 한다** — 서버 트리거가 «더 낮은 기록으로 덮어쓰기»를 조용히
// 무시하고(정렬과 같은 순서로 비교) 닉네임 변경만 통과시킨다. 그래서 쓰기는 **upsert 한 번**이고,
// 돌아온 행(`return=representation`)이 곧 정본이다.
//
// **로컬은 폴백이다** (§0.7 N). 네트워크가 끊겨도 런이 멈추면 안 되므로 내 기록 한 줄을 항상
// 로컬에 남기고 `pending`을 세워 둔다 — 다음 접속의 `syncRank()`가 그 한 줄을 올린다.
//
// 화면도 여기 있다. 랭킹은 **두 곳에서 열리는데**(메인 RANKING 버튼 · 종료 화면 우측) 판·정렬·수정
// 버튼이 같아야 하므로, 판을 그리는 함수 하나(`drawRank`)에 «상자 넷»만 인자로 준다.

import { VIEW } from "./balance";
import { FONT, FONT_DISPLAY, buttonPanel, railInk, roundRect, slot, woodPanel } from "./hud";
import { beginControls, registerControl, registerTextInput, announceControl } from "./controls";

export const RULES_VERSION = "quality-1-seed7";
let eligible = true;
let exclusionLabel = "QA · 기록 제출 제외";
let qaLocal: Local = { v: 2, mine: null, pending: false, rules: RULES_VERSION };
export function setRunEligibility(value: boolean, reason = "QA · 기록 제출 제외"): void { eligible = value; exclusionLabel = reason; }

/** 기록 한 줄 = 서버 테이블의 행 (위 머리말). 항목 4개(§0.7 N)는 `nick`·`wave`·`retries`·`kills`이고
 *  나머지 넷은 **테이블의 뼈대**다 */
export type RankRow = {
  id: string;
  uid: string;
  nick: string;
  /** 최종 클리어 웨이브 — **종료 화면의 WAVE 행과 같은 식**이다(main.ts drawEnd) */
  wave: number;
  /** 재도전 횟수 = 이어하기(`?resume`)로 런을 되살린 횟수 (main.ts `retries`) */
  retries: number;
  kills: number;
  /** 이 런이 «끝난» 맵 (경로 §0.7 O ⓑ 때문에 시작 맵과 다를 수 있다) */
  map: string;
  at: number;
};

/** 로컬 프로필 = 계정 자리. `nickFixed` = 「수정 버튼을 이미 썼다」(§0.7 N "최초 1회만") */
export type Profile = { uid: string; nick: string; nickFixed: boolean };

const KEY_BOARD = "traindefense.rank";
const KEY_PROF = "traindefense.prof";
/** **2 = 서버판**. `uid`가 8자 난수 → `client_id`(uuid)로 바뀌고 판이 「여러 줄」 → 「내 한 줄」이
 *  되므로 1의 저장은 못 읽는다. 서버 기록은 감독이 이미 비웠다(0행) */
const VERSION = 2;
/** 표시 상한 (§0.7 N "10위까지"). 내가 밖이면 마지막 줄에 따로 붙는다 */
export const TOP_N = 10;
/** 서버에서 한 번에 읽는 줄 수. **「내 등수」를 이 배열 안에서 세므로**(`board`) 이 수가 곧 등수의
 *  상한이다 — 101위 밖은 101위로 보인다. 늘릴 자리는 이 상수 하나 */
const FETCH_N = 100;
/** 닉네임 최대 길이 (판 폭이 이 이상을 못 받는다) */
const NICK_MAX = 12;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 무시 — 사생활 모드·용량. 기록이 안 남아도 런은 계속돼야 한다 (save.ts와 같은 규약) */
  }
}

/** `client_id`는 **uuid 열**이라 아무 문자열이나 못 넣는다. `randomUUID`는 보안 컨텍스트에만
 *  있으므로(http 배포·구형 브라우저) 폴백을 둔다 — 없으면 게임이 시작도 못 한다 */
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// 최초 닉네임은 **임의 값**이다 (§0.7 N). 두 조각 + 두 자리 수 = 충돌이 드물고 한 줄에 들어간다
const NICK_HEAD = ["STEEL", "IRON", "RUST", "COAL", "ASH", "GRIM", "NOVA", "BOLT", "GRAM", "OLIVE"];
const NICK_TAIL = ["RAT", "HOWL", "LOOP", "FANG", "CREW", "DRIVE", "SPUR", "HAWK", "COIL", "RAIL"];
function randomNick(): string {
  const a = NICK_HEAD[Math.floor(Math.random() * NICK_HEAD.length)];
  const b = NICK_TAIL[Math.floor(Math.random() * NICK_TAIL.length)];
  return `${a}_${b}${Math.floor(Math.random() * 90) + 10}`;
}

/** QA: `?nick=<이름>` — 닉네임을 못박는다(컷·probe 재현의 유일한 경로). **저장하지 않는다** —
 *  QA 런이 사용자의 프로필을 덮어쓰면 안 된다 (`?hover=`와 같은 부류의 연출 전용 손잡이다) */
let qaNick: string | null = null;
export function setQaNick(n: string): void {
  qaNick = n;
  prof = null;
}

/** QA: `?cid=<uuid>` — **기기 식별자(`client_id`)를 못박는다**. 헤드리스는 컨텍스트가 매번 새것이라
 *  `uid`가 로드마다 달라지고, 그러면 **「기기당 1행」과 최고 기록 트리거가 원리적으로 컷에 안 잡힌다**
 *  (컷 둘이 언제나 서로 다른 행이 된다). 이것이 그 둘을 가르는 유일한 경로다. **저장하지 않는다** */
let qaUid: string | null = null;
export function setQaUid(u: string): void {
  qaUid = u;
  prof = null;
}

let prof: Profile | null = null;
export function profile(): Profile {
  if (prof) return prof;
  const got = readJson<Profile & { v: number }>(KEY_PROF);
  prof =
    got && got.v === VERSION && typeof got.nick === "string" && typeof got.uid === "string"
      ? { uid: got.uid, nick: got.nick, nickFixed: !!got.nickFixed }
      : { uid: uuid(), nick: randomNick(), nickFixed: false };
  if (qaUid) prof.uid = qaUid;
  if (qaNick) prof.nick = qaNick;
  if (eligible && !qaNick && !qaUid) write(KEY_PROF, { v: VERSION, ...prof });
  return prof;
}

function writeProf(): void {
  if (eligible && !qaNick && !qaUid) write(KEY_PROF, { v: VERSION, ...profile() });
}

/** **정렬 (§0.7 N)**: ① 최종 클리어 웨이브 내림차순 → ② 같으면 재도전 횟수 오름차순.
 *  뒤의 둘(처치 수 내림 · 시각 오름)은 정본에 없는 **동점 마무리**다 — 없으면 같은 성적의 줄 순서가
 *  프레임마다 흔들려 「내 등수」가 안 정해진다. **서버 `order=`와 앞 셋이 같은 순서다** */
function cmp(a: RankRow, b: RankRow): number {
  return b.wave - a.wave || a.retries - b.retries || b.kills - a.kills || a.at - b.at;
}

// ── 서버 (Supabase REST · §0.7 N · 감독 #70) ──────────────────────────────

const SB_URL = import.meta.env.VITE_TD_SUPABASE_URL ?? "";
const SB_ANON = import.meta.env.VITE_TD_SUPABASE_ANON ?? "";
const TABLE = "td_ranking";
/** 서버 `order=`. **위 `cmp`의 앞 셋과 같은 순서여야 한다** — 갈리면 서버가 준 상위 100과 화면의
 *  상위 10이 다른 표본이 된다 */
const ORDER = "wave.desc,retries.asc,kills.desc";
const SELECT = "client_id,nick,wave,retries,kills,map,created_at";

/** `off` = 연결이 꺼져 있다(QA 컷·`.env` 없음) · `idle` = 아직 안 읽었다 · `ok`/`err` = 마지막 왕복의 결과 */
export type NetState = "off" | "idle" | "loading" | "ok" | "err";

let netOn = !!(SB_URL && SB_ANON);
let netState: NetState = netOn ? "idle" : "off";
let netErr: string | null = null;

/** **QA 컷이 실서버에 가짜 기록을 올리는 사고를 막는 유일한 문**이다 (main.ts `?net=`).
 *  RLS가 삭제를 막으므로 한 번 들어간 줄은 anon이 못 지운다 — 그래서 기본값이 「꺼짐」 쪽이다 */
export function setNet(on: boolean): void {
  netOn = on && !!(SB_URL && SB_ANON);
  netState = netOn ? "idle" : "off";
}

function head(extra?: Record<string, string>): Record<string, string> {
  return { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, ...extra };
}

type Wire = { client_id: string; nick: string; wave: number; retries: number; kills: number; map: string | null; created_at: string };

function fromWire(w: Wire): RankRow {
  return { id: w.client_id, uid: w.client_id, nick: w.nick, wave: w.wave, retries: w.retries, kills: w.kills, map: w.map ?? "", at: Date.parse(w.created_at) || 0 };
}

/** 서버로 보내는 몸통. `created_at`/`updated_at`은 서버가 찍는다 */
function toWire(r: RankRow): Record<string, unknown> {
  return { client_id: r.uid, nick: r.nick, wave: r.wave, retries: r.retries, kills: r.kills, map: r.map };
}

/** 서버 상위 `FETCH_N`. `null` = 아직 한 번도 못 읽었다(그동안은 로컬 폴백만 선다) */
let remoteRows: RankRow[] | null = null;

/** Timeout covers both the response headers and body. All sync requests are serialized. */
async function request(url: string, init: RequestInit = {}): Promise<Wire[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${res.status}`);
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) throw new Error("Invalid ranking response");
    return rows.filter((r): r is Wire => r && typeof r.client_id === "string" && typeof r.nick === "string" && [r.wave,r.retries,r.kills].every(Number.isFinite));
  } finally { clearTimeout(timer); }
}
export async function refreshBoard(): Promise<void> {
  if (!netOn) return;
  try {
    remoteRows = (await request(`${SB_URL}/rest/v1/${TABLE}?select=${SELECT}&order=${ORDER}&limit=${FETCH_N}`, { headers: head() })).map(fromWire);
    if (!netErr) netState = "ok";
  } catch (e) { netState = "err"; netErr = String(e); }
}
async function pushMine(): Promise<void> {
  const st = localBoard();
  if (!eligible || !netOn || !st.mine || !st.pending) return;
  const sent = JSON.stringify(st.mine);
  const got = await request(`${SB_URL}/rest/v1/${TABLE}?on_conflict=client_id`, {
    method: "POST", headers: head({ "Content-Type":"application/json", Prefer:"resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(toWire(st.mine)),
  });
  // A newer result or nickname edit may arrive while this request is in flight.
  // Its pending bit belongs to the next request, never to this acknowledgement.
  if (JSON.stringify(localBoard().mine) === sent) localSet(got[0] ? fromWire(got[0]) : st.mine, false);
}
let syncing = false;
let syncAgain = false;
export function syncRank(): void {
  if (!netOn) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  void (async () => {
    do {
      syncAgain = false;
      netState = "loading"; netErr = null;
      try { await pushMine(); }
      catch (e) { netState = "err"; netErr = String(e); }
      await refreshBoard();
    } while (syncAgain && netOn);
  })().finally(() => { syncing = false; });
}
export function netInfo(): { on: boolean; state: NetState; err: string | null; remote: number | null; pending: boolean; eligible: boolean; rules: string } {
  return { on:netOn, state:netState, err:netErr, remote:remoteRows?.length ?? null, pending:localBoard().pending, eligible, rules:RULES_VERSION };
}

// ── 로컬 폴백 ────────────────────────────────────────────────────────────

/** 로컬은 **내 한 줄**만 든다 (서버가 「기기당 1행」이므로 같은 모양이다).
 *  `pending` = 「아직 서버에 못 올렸다」 = 다음 접속에 올릴 것 (§0.7 N) */
type Local = { v: number; mine: RankRow | null; pending: boolean; rules?: string };

function localBoard(): Local {
  if (!eligible) return qaLocal;
  const got = readJson<Local>(KEY_BOARD);
  if (!got || got.v !== VERSION || (got.mine && typeof got.mine.nick !== "string")) return { v: VERSION, mine: null, pending: false };
  return { v: VERSION, mine: got.mine, pending: !!got.pending && got.rules === RULES_VERSION, rules: got.rules };
}

function localSet(mine: RankRow | null, pending: boolean): void {
  if (!eligible) { qaLocal = { v: VERSION, mine, pending: false, rules: RULES_VERSION }; return; }
  write(KEY_BOARD, { v: VERSION, mine, pending, rules: RULES_VERSION } satisfies Local);
}

/** QA: `?rankrows=<n>` — **가짜 경쟁자 n명**을 판에 세운다. 저장하지 않는다(위 `localBoard`).
 *  판정 두 가지가 이 한 줄로 열린다: ⓐ 10위까지만 서고 **내가 밖이면 마지막 줄**(§0.7 N) ⓑ **정렬**.
 *  ⓑ를 위해 **일부러 어긋난 순서로 만든다** — 웨이브는 오름차순으로 낳고(정렬이 뒤집어야 한다),
 *  같은 웨이브 짝은 재도전이 큰 쪽을 앞에 낳는다(정렬이 자리를 바꿔야 한다) */
let qaRows: RankRow[] = [];
export function setQaRows(n: number): void {
  qaRows = Array.from({ length: n }, (_, i) => ({
    id: `qa${i}`,
    uid: "qa",
    nick: `RIVAL_${String(i).padStart(2, "0")}`,
    wave: 20 + Math.floor(i / 2) * 4,
    retries: i % 2 === 0 ? 5 : 1,
    kills: 100 + i * 13,
    map: "plains",
    at: i,
  }));
}

/** 서버 목록 + 로컬 폴백 + QA 줄. **`id`로 겹치면 좋은 쪽 하나만 남긴다** — 내 줄은 서버와 로컬
 *  양쪽에 있고(올린 직후) 둘이 같은 기기의 같은 행이라 두 줄로 서면 안 된다 */
export function allRows(): RankRow[] {
  const by = new Map<string, RankRow>();
  for (const r of [...(remoteRows ?? []), ...localRows(), ...qaRows]) {
    const prev = by.get(r.id);
    if (!prev || cmp(r, prev) < 0) by.set(r.id, r);
  }
  return [...by.values()].sort(cmp);
}

function localRows(): RankRow[] {
  const m = localBoard().mine;
  return m ? [m] : [];
}

/** 런 하나의 결과를 기록한다. **로컬에 먼저 남기고 그 다음 올린다** — 네트워크가 없어도 기록이
 *  안 사라져야 한다(§0.7 N "오프라인 기록은 다음 접속에 올린다") */
export function submitRun(r: { wave: number; retries: number; kills: number; map: string }): RankRow {
  const p = profile();
  const row: RankRow = { id: p.uid, uid: p.uid, nick: p.nick, wave: r.wave, retries: r.retries, kills: r.kills, map: r.map, at: Date.now() };
  const previous = localBoard();
  const prev = previous.rules === RULES_VERSION ? previous.mine : null;
  // 로컬도 **최고 기록만** 든다 — 서버 트리거와 같은 순서로 비교하므로 두 쪽의 뜻이 안 갈린다
  localSet(prev && cmp(prev, row) < 0 ? prev : row, true);
  syncRank();
  return row;
}

/** 닉네임 수정 = **최초 1회** (§0.7 N). 서버에서는 닉네임 변경이 «언제나» 통과하므로
 *  같은 upsert 한 번이면 된다 — 기록은 그대로 두고 이름만 간다 */
export function setNick(n: string): void {
  const name = n.trim().slice(0, NICK_MAX);
  if (!name) return;
  const p = profile();
  p.nick = name;
  p.nickFixed = true;
  writeProf();
  const st = localBoard();
  if (st.mine) {
    if (eligible && st.rules !== RULES_VERSION) write(KEY_BOARD, { ...st, mine:{...st.mine,nick:name}, pending:false });
    else localSet({ ...st.mine, nick: name }, true);
  }
  // 서버 사본의 이름도 그 자리에서 간다 — 다음 새로고침까지 옛 이름이 서 있으면 안 된다
  if (remoteRows) remoteRows = remoteRows.map((r) => (r.uid === p.uid ? { ...r, nick: name } : r));
  syncRank();
}

/** 표시용 목록 (§0.7 N "10위까지 · 내가 밖이면 마지막 줄에 내 기록") */
export function board(myId: string | null): { top: RankRow[]; mine: { row: RankRow; rank: number } | null } {
  const rows = allRows();
  const top = rows.slice(0, TOP_N);
  if (!myId) return { top, mine: null };
  const i = rows.findIndex((r) => r.id === myId);
  if (i < 0 || i < TOP_N) return { top, mine: null };
  return { top, mine: { row: rows[i], rank: i + 1 } };
}

// ── 화면 ────────────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number };

export type Rank = {
  /** 메인 화면의 오버레이가 열려 있는가 (종료 화면의 판은 항상 서므로 이 값을 안 본다) */
  open: boolean;
  /** 이번 런의 내 기록 — 런이 끝난 프레임에 한 번 채워진다 (main.ts) */
  my: RankRow | null;
  /** 닉네임 수정 중이면 지금 입력 중인 문자열, 아니면 null */
  editing: string | null;
  /** 직전 프레임에 그려진 상자들 = 클릭 판정의 유일한 정본 (drawRank가 매 프레임 다시 채운다) */
  box: Box | null;
  close: Box | null;
  edit: Box | null;
  cancel: Box | null;
};

export function makeRank(): Rank {
  return { open: false, my: null, editing: null, box: null, close: null, edit: null, cancel: null };
}

function inBox(b: Box | null, x: number, y: number): boolean {
  return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

function row(ctx: CanvasRenderingContext2D, r: RankRow, place: string, x: number, y: number, w: number, h: number, mine: boolean): void {
  slot(ctx, x, y, w, h, 5);
  if (mine) {
    ctx.fillStyle = "#d6b87512";
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
  }
  const ty = y + h / 2 + 4;
  ctx.textAlign = "left";
  ctx.font = `${mine ? "600 " : ""}16px ${FONT}`;
  ctx.fillStyle = mine ? "#ffcf5c" : "#c8b48c";
  ctx.fillText(place, x + 12, ty);
  ctx.fillStyle = mine ? "#fff0c8" : "#e8d8b4";
  // 12 Korean glyphs keep their own column, even on the narrower result panel.
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 44, y, w - 270, h); ctx.clip();
  ctx.fillText(r.nick, x + 44, ty);
  ctx.restore();
  ctx.font = `500 16px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffcf5c";
  ctx.fillText(String(r.wave), x + w - 176, ty);
  ctx.fillStyle = "#c8b48c";
  ctx.fillText(String(r.retries), x + w - 96, ty);
  ctx.fillStyle = "#e8d8b4";
  ctx.fillText(String(r.kills), x + w - 16, ty);
}

/** 랭킹 판 하나. **두 자리가 같은 함수를 쓴다** — 메인 오버레이(`closable`)와 종료 화면 우측.
 *  종료 화면에는 ✕가 없다: 그 판은 결과화면의 «오른쪽 절반»이라 닫을 것이 아니고, 바깥 클릭은
 *  그 화면의 원래 뜻(재시작)이 이긴다 (main.ts pointerdown) */
export function drawRank(ctx: CanvasRenderingContext2D, rank: Rank, x: number, y: number, w: number, h: number, closable: boolean): void {
  rank.box = { x, y, w, h };
  rank.close = null;
  rank.edit = null;
  rank.cancel = null;
  woodPanel(ctx, x, y, w, h, 12);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `26px ${FONT_DISPLAY}`;
  ctx.fillStyle = "#ffcf5c";
  ctx.fillText("RANKING", x + 20, y + 39);

  const myId = rank.my ? rank.my.id : profile().uid;
  const { top, mine } = board(myId);
  const action = (id: string, label: string, box: Box, run: () => void) => {
    const primary = id === "rank-edit" && rank.editing !== null;
    buttonPanel(ctx, box.x, box.y, box.w, box.h, primary ? "primary" : "secondary");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `22px ${FONT_DISPLAY}`; ctx.fillStyle = primary ? railInk.dark : railInk.text;
    ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2);
    registerControl(id, label, box, run);
  };
  // The one-time edit stays available only when this device has a ranking row.
  if (!profile().nickFixed && (mine || top.some(r => r.id === myId))) {
    if (rank.editing !== null) {
      registerTextInput("rank-name", "닉네임 · 최대 12자", {x:x+126,y:y+12,w:w-354,h:44}, {
        value: rank.editing, maxLength: NICK_MAX,
        onInput: value => { rank.editing = value.slice(0,NICK_MAX); },
        onCommit: () => { rankKey(rank,"Enter"); },
        onCancel: () => { rankKey(rank,"Escape"); },
      });
      rank.edit = {x:x+w-212,y:y+12,w:64,h:44};
      rank.cancel = {x:x+w-140,y:y+12,w:64,h:44};
      action("rank-edit","저장",rank.edit,() => { rankKey(rank,"Enter"); });
      action("rank-cancel","취소",rank.cancel,() => { rankKey(rank,"Escape"); });
    } else {
      rank.edit = {x:x+w-228,y:y+12,w:156,h:44};
      action("rank-edit","닉네임 수정",rank.edit,() => { rank.editing=profile().nick; });
    }
  }

  // 열 머리 — 항목 4개(§0.7 N)가 이 한 줄에 다 선다
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = "#dbc69f";
  ctx.fillText("NAME", x + 58, y + 76);
  ctx.textAlign = "right";
  ctx.fillText("WAVE", x + w - 190, y + 76);
  ctx.fillText("RETRY", x + w - 110, y + 76);
  ctx.fillText("KILLS", x + w - 30, y + 76);

  // Ten rows, the separate own record and status fit in the 440px result panel.
  const rh = 27;
  const gap = 2;
  let ry = y + 85;
  for (let i = 0; i < top.length; i++) {
    row(ctx, top[i], String(i + 1), x + 14, ry, w - 28, rh, top[i].id === myId);
    ry += rh + gap;
  }
  if (!top.length) {
    ctx.textAlign = "center";
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = "#ddc9a3";
    ctx.fillText("런을 끝내면 여기에 기록이 남습니다", x + w / 2, ry + 30);
  }
  // **내가 10위 밖이면 마지막 줄에 따로** (§0.7 N). 사이를 한 칸 띄워 «이어진 순위»가 아님을 보인다
  if (mine) {
    ry = y + h - 58;
    ctx.strokeStyle = "#00000055";
    ctx.beginPath();
    ctx.moveTo(x + 14, ry - 8);
    ctx.lineTo(x + w - 14, ry - 8);
    ctx.stroke();
    row(ctx, mine.row, String(mine.rank), x + 14, ry, w - 28, rh, true);
  }

  const info = netInfo();
  ctx.textAlign = "left"; ctx.font = `16px ${FONT}`; ctx.fillStyle = info.err ? "#ff9d89" : "#c8b48c";
  const status = !eligible ? exclusionLabel : info.pending ? "기록 기기에 보관 · 연결 시 재전송" : info.state === "loading" ? "랭킹 연결 중…" : info.state === "err" ? "연결 실패 · 로컬 기록 표시" : "참고 랭킹 · 고정 도전 SEED 7";
  ctx.fillText(status, x + 20, y + h - 10);
  if (closable) {
    const b = { x: x + w - 56, y: y + 6, w: 44, h: 44 };
    ctx.textAlign = "center";
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = "#d8c39a";
    ctx.textBaseline = "middle";
    ctx.fillText("✕", b.x + b.w / 2, b.y + b.h / 2);
    rank.close = b;
    registerControl("rank-close","랭킹 닫기",b,() => { rank.open=false; rank.editing=null; });
  }
}

/** 오버레이용 = 화면 한가운데. 메인 화면이 쓴다 */
export function drawRankOverlay(ctx: CanvasRenderingContext2D, rank: Rank, onClose?: () => void): void {
  beginControls("ranking");
  ctx.fillStyle = "rgba(11,18,15,0.86)";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  const w = 640;
  const h = 460;
  drawRank(ctx, rank, (VIEW.w - w) / 2, (VIEW.h - h) / 2, w, h, true);
  if (rank.close && onClose) registerControl("rank-close","랭킹 닫기",rank.close,() => { rank.editing=null; onClose(); });
}

/** 클릭 한 번의 뜻. **판 안이면 «닫기»가 아니다** — 바깥 클릭과 ✕만 닫는다 (§0.7 N) */
export function rankClick(rank: Rank, sx: number, sy: number): "close" | "inside" | "outside" {
  if (inBox(rank.cancel, sx, sy)) { rankKey(rank,"Escape"); return "inside"; }
  if (inBox(rank.edit, sx, sy)) {
    // 수정 버튼 = 열기/확인 토글. 확인이 곧 「최초 1회」의 소진이다
    if (rank.editing === null) rank.editing = profile().nick;
    else rankKey(rank,"Enter");
    return "inside";
  }
  if (inBox(rank.close, sx, sy)) {
    rank.editing = null;
    return "close";
  }
  if (inBox(rank.box, sx, sy)) return "inside";
  rank.editing = null;
  return "outside";
}

/** 키 입력. 수정 중일 때만 삼킨다 — 아니면 R(재시작) 같은 원래 뜻이 그대로 간다 */
export function rankKey(rank: Rank, key: string): boolean {
  if (rank.editing === null) return false;
  if (key === "Enter") {
    if (!rank.editing.trim()) return true;
    setNick(rank.editing);
    if (rank.my) rank.my = { ...rank.my, nick: profile().nick };
    rank.editing = null;
    announceControl("닉네임 저장 완료");
  } else if (key === "Escape") {
    rank.editing = null;
  } else if (key === "Backspace") {
    rank.editing = rank.editing.slice(0, -1);
  } else if (key.length === 1 && rank.editing.length < NICK_MAX) {
    rank.editing += key;
  }
  return true;
}
