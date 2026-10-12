// Train Defense — 씬 루프.
// QA 계약: ?start=<stage>&warm=<초> 를 읽고, 준비되면 window.__gameReady=true,
// 시뮬 상태는 window.__dbg 에, 수치 요약은 window.__probe() 로 노출한다.

import { fxTierOf, ARC, ARTILLERY, BOSS, DOCTRINES, BOSS_WIN, DMG_NUM, END_SCENE, END_SCENE_SEC, FUEL, NECRO, raiseCapValue, setQaRaiseCap, isEventKind, isEventWave, FX_RULE, PASSIVE, TIER_FX, WEAPON_FX, BRANCHES, CAR_KINDS, CARDS, COLLECT, COMPANY, CORE, CURVE, ENEMY, ENEMY_STATS, FACTIONS, FACTION_ORDER, FACTION_ROTATE, GATE, HUD, LAYOUT, MAPS, MID, MID_KINDS, MIX_ROLES, MULT, ONE_SHOT_OK, PLATE, RENDER, SHIELD, SHOP, SIEGE, STAGE, STAGE_COUNT, SUPPORT, SUPPORT_REACH, TERRAIN, TRAIN, VARIANT_KINDS, VIEW, WAVES, WEAPONS, BOSS_KINDS, BOSS_POOL_KINDS, BOSS_PATTERNS, TELL_RANGE, FORMATIONS, factionAt, factionKind, gateName, slotOffset, bossIndex, bossKindAt, isBossKind, isBossWave, isMidKind, isMidWave, maxLevelOf, midIndex, midKindAt, setMapHills, mapHillsValue, setQaFactionRotate, factionRotateValue, carCap, carCapAt, setCarCap, setQaCarCap, activeSupport, supportUnlocked, upgradeCost, weaponUnlocked, enemyHpMult, weaponDmgMult, weaponRangeMult, standoffOf, standoffRevOn, setQaEnemyHp, setQaWeaponDmg, setQaWeaponRange, setQaStandoffRev, setQaCoPull, coPullValue, setQaPinSlip, pinSlipOn, dropValueOf, setQaDrop, setQaWaveCurve, setQaDocMult, setQaGrowthShift, levelDmgStep, levelRateStep, tierDmgStep, tierRateStep, ROUTE, routeLegStartOf, routeMapOf, type FactionId, type MapId } from "./balance";
import { acidLockOn, callStrike, coreDpsMult, damageTerrain, drawAcidPools, drawCombat, drawDrops, drawEffects, drawFires, drawSmoke, KILL_R_BINS, KILL_R_STEP, losOk, makeCombat, qaTierFxOn, setQaAcidLock, setQaCoreDps, setQaTierFx, shakeOffset, updateCombat, updateTurrets } from "./combat";
import { budgetUnits, isEnemyWalking, drawThreatCues, defuseBomb, isCasting, depart, drawBreach, drawField, drawOrder, effHp, enemyH, effScrap, factionOfWave, makeField, maxHpOf, pickedCard, qaAirPctValue, qaAmphPctValue, qaCard3On, qaFactionValue, qaHpGrowValue, qaHpGrowFromValue, qaHpWaveLinValue, qaEarlyMulValue, earlyHpMult, qaEventOn, hordeMulValue, qaMidOn, qaYSortOn, qaArmorPctValue, qaRunnerPctValue, qaSiegePctValue, qaSkirmPctValue, qaSwarmPctValue, qaSupportPctValue, qaVariantPctValue, qaStopEveryValue, octOf, quadOf, OCT_NAME, QUAD_NAME, ringPoint, waveHpMult, waveLinMult, setQaAirPct, setQaAmphPct, setQaBossHp, setQaBossKind, setQaBossSpeed, setQaHpGrowFrom, setQaHpWaveLin, setQaEarlyMul, setQaHpStep, setQaCard3, setQaEvent, setQaHorde, setQaFaction, setQaGate, setQaHpGrow, setQaMid, setQaYSort, setQaRunnerPct, setQaArmorPct, setQaSiegePct, setQaSkirmPct, setQaSwarmPct, setQaSupportPct, setQaVariantPct, setQaStopEvery, updateField, waveBudget } from "./enemy";
import { blocksMovement, buildFlow, CELL, costAt, deadPocket, isBlocked } from "./flow";
import { blocksLos, coverMode, crackLosR, drawCoreGlow, drawCoreImpact, drawEndScene, drawMap, explosive, fuelHpValue, generateMap, setQaCover, setQaCrackLosR, setQaFuelHp, setQaRingPlace, setQaSlotFree, setQaTwoStage, setQaWallScale, setQaWallStart, slotFree, slowAt, stageTerrain, switchMap, terrainArt, terrainStage, terrainTile, twoStageOf, wallScaleOf, wallStartOf } from "./map";
import { bandStats, buildBackground, drawBackground, drawPlateDebug, loadPlate, plateLoaded } from "./plate";
import { FX } from "./fx";
import { carTinted, failed, loadSprites, sprite, spriteLuma, tileArtBox } from "./sprites";
import { at, bodyName, branchOf, buildTrack, CAR_PITCH, carS, type CarKind, carTip, critChance, critFactor, critMult, dpsOf, drawTrain, hasTurret, makeCar, makeTrain, pendingBranch, supportAt, trainBlocks, trainDps, turretHeight, turretName, updateTrain, weaponOf } from "./train";
import { shopUiGeom, AUTO_REPAIR_ABS, AUTO_REPAIR_MARGIN, AUTO_TARGET_CARS, autoRepair, autoSpend, buyRowGeom, drawShop, makeShop, passiveGeom, passiveNext, refitable, refitFee, repairGeom, rowGeom, shopClick } from "./shop";
import { drawGateAlert, drawGateMarkers, drawHud, gateVisible, hudHit, PANEL_X, TIP, tipReset, woodPanel, buttonPanel, railInk } from "./hud";
import { drawPause, makePause, paused, pauseClick, pauseKey } from "./pause";
import { TUT_CARDS, TUT_FOOT, tutorialSeen } from "./tutorial";
import { drawCardFeedback, drawCardArtSheet, applyCard, type Card, cardsClick, drawCards, label as cardLabel, makeCards, rollBranch, rollDoctrine, rollOffer, sub as cardSub, tierOf } from "./cards";
import { applySave, clearSave, readSave, snapshot, writeSave } from "./save";
import { MAP_H, drawMenu, makeMenu, menuClick } from "./menu";
import { TOP_N, allRows, drawRank, makeRank, netInfo, profile, rankClick, rankKey, setRunEligibility, setNet, setQaNick, setQaRows, setQaUid, submitRun, syncRank } from "./rank";

import { beginControls, endControls, registerControl } from "./controls";
import { makeClock } from "./clock";
import { audioProbe, unlockAudio, playSound, setAudioState, preloadAudio, soundForAction } from "./audio";
import { getEffectSettings } from "./render-settings";
import { drainActionEvents, setActionEventsEnabled } from "./action-events";
import { PLAYBACK_RATE } from "./pacing";
import { FONT, FONT_DISPLAY, loadFonts } from "./typography";

declare global {
  interface Window {
    __gameReady?: boolean;
    __dbg?: unknown;
    __probe?: () => unknown;
  }
}

const params = new URLSearchParams(location.search);
const START = params.get("start") ?? "run";
// Any development override excludes the entire session from production records.
const QA_RUN = [...params.keys()].some(k => !["start", "resume"].includes(k)) || !["run","menu"].includes(START);
setRunEligibility(!QA_RUN);
// **메인 화면 (DESIGN §0.7 I · 채택안 B「라이브 데모」)**. 쿼리 없이 열면 = 게임의 입구,
// `?start=menu`로 강제할 수도 있다. **QA 진입점(`?start=run…`)은 한 자도 안 바뀐다** —
// shot·probe·sweep·perf가 전부 `?start=`를 달고 오므로 이 한 줄이 그 경로를 안 건드린다.
// 데모는 게임의 렌더 경로를 그대로 돌린다(새 렌더를 안 짠다) — 판정만 뺀다(step()의 데모 규약)
const MENU = START === "menu" || location.search.replace("?", "") === "";
// 데모 배경은 «첫 프레임부터 붐벼야» 한다 — 스폰은 맵 밖이고 접근에 5~8초가 걸려서(§5.0)
// warm 없이 열면 빈 들판이 먼저 보인다. warm 루프는 모듈 실행 중 동기로 돈다(tick 앞)
const WARM = Number(params.get("warm") ?? (MENU ? "35" : "0"));
const SEED = Number(params.get("seed") ?? "7");
// QA: ?debug=1 — 배경 플레이트(그림) 위에 게임 루프·지형 판정원·플레이트 경계를 겹쳐 그린다.
// 감독 #5 V1의 "디버그 오버레이로 shot 검증" — 레일 그림과 열차 궤도가 실제로 겹치는지 확인용
const DEBUG = params.get("debug") === "1";
/** QA: 칸 그림 대조표 (§0.6 A3). 렌더 마지막에 전 화면을 덮는다 — 게임 진행은 그대로다 */
// QA: ?cardsheet=1 = 전종 T1 · ?cardsheet=tiers = 전종 × T1·T2·T3 · ?cardsheet=2|3 = 전종 그 티어
const CARD_SHEET = params.get("cardsheet");
// QA: ?freeze=1 — warm 이후 시뮬을 멈춘다. **짧은 연출을 스크린샷으로 검증하려면 필수다** —
// warm이 끝난 뒤에도 rAF는 계속 돌고, playwright가 캡처(또는 __probe 호출)하기까지 몇 프레임이
// 지나는지는 실행마다 다르다. 수명 0.1초짜리 총구 화염은 그 사이에 사라진다(감독 #5 V2에서 실제로 겪었다).
// freeze를 켜면 캡처 프레임 = warm 종료 시점이 되어 probe 좌표와 스크린샷이 정확히 일치한다
const FREEZE = params.get("freeze") === "1";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// QA: ?bosshp=<배율> — 보스 그람의 HP만 배로 잡는다. **BALANCE §5 정본이 아니다**(?dense와 같은 부류).
// 1.5차 공속 ×2로 보스전이 0초가 된 뒤(큐 2 실측) "보스전 15~20초를 되찾는 HP"를 재는 A/B 전용이다.
// 맵 생성보다 먼저 세워야 한다 — 보스는 스폰 시점에 maxHpOf로 HP를 굳힌다
if (params.has("bosshp")) {
  const bh = Number(params.get("bosshp"));
  if (!Number.isFinite(bh) || bh <= 0) throw new Error(`bad ?bosshp: ${params.get("bosshp")}`);
  setQaBossHp(bh);
}

// QA: ?hpstep=<값> — 보스 주기 강화 기울기(`BOSS.hpStep`)를 통째로 갈아끼운다. **BALANCE 정본이 아니다**.
// `?bosshp`(곱셈)와 규약이 다르다 — 이쪽은 절대값이다. 감독 #35 ②의 사다리(절편 × 기울기) 전용이고,
// `?bosshp`와 함께 써야 곡선 한 쌍이 정해진다. 맵 생성보다 먼저 세워야 하는 이유는 `?bosshp`와 같다
if (params.has("hpstep")) {
  const hs = Number(params.get("hpstep"));
  if (!Number.isFinite(hs) || hs <= 0) throw new Error(`bad ?hpstep: ${params.get("hpstep")}`);
  setQaHpStep(hs);
}

// QA: ?bossspd=<배율> — 보스 그람의 이속만 배로 잡는다. **BALANCE §5 정본이 아니다**(?bosshp와 같은 부류).
// `?bossspd=2`가 §0.5 이속 ×0.5를 보스에게서만 정확히 되돌리는 대조 컷이다 (iter34 큐 2 실측)
if (params.has("bossspd")) {
  const bs = Number(params.get("bossspd"));
  if (!Number.isFinite(bs) || bs <= 0) throw new Error(`bad ?bossspd: ${params.get("bossspd")}`);
  setQaBossSpeed(bs);
}

/** QA 전용 보스 얼굴 고정 (`?bosskind=boss_gram|boss_crawler`) — enemy.ts setQaBossKind 주석 */
if (params.has("bosskind")) setQaBossKind(params.get("bosskind")!);

// QA: ?coredps=<배율> — §0.5 "개체당 코어 DPS" 배율을 덮어쓴다. **BALANCE 정본이 아니다**(?bosshp와 같은 부류).
// 감독 #23 ②의 사다리(0.4 / 0.6 / 0.8)를 한 서버·한 빌드에서 재기 위한 A/B 전용이다
if (params.has("coredps")) {
  const cd = Number(params.get("coredps"));
  if (!Number.isFinite(cd) || cd <= 0) throw new Error(`bad ?coredps: ${params.get("coredps")}`);
  setQaCoreDps(cd);
}
// QA: ?ehp=<n> · ?wdmg=<n> — §0.7-B의 두 축(`MULT.enemyHp 4.0` · `MULT.dmg 3`)을 **대체한다**
// (`?coredps`와 같은 규약이라 사다리 값이 곧 후보 정본값이다). **BALANCE 정본이 아니라 사다리용**이다.
// ⚠ **둘은 한 벌이다** — 처치 발수는 `ehp / wdmg`에만 달렸고 그 비가 신설 불변식 6의 분모다.
// 개편 전(3차 체제)의 회귀 컷은 `?ehp=0.4&wdmg=1`이고, 그것이 iter109까지의 모든 표와 같은 자리다.
// **맵·편성보다 먼저 서야 한다** — 적 HP는 스폰 시점에 굳는다(`maxHpOf`)
if (params.has("ehp")) {
  const v = Number(params.get("ehp"));
  if (!Number.isFinite(v) || v <= 0) throw new Error(`bad ?ehp: ${params.get("ehp")}`);
  setQaEnemyHp(v);
}
if (params.has("wdmg")) {
  const v = Number(params.get("wdmg"));
  if (!Number.isFinite(v) || v <= 0) throw new Error(`bad ?wdmg: ${params.get("wdmg")}`);
  setQaWeaponDmg(v);
}
// QA: ?drop=<n> — §0.5 「드랍 가치」(`MULT.drop 0.2`)를 **대체한다**(`?ehp`·`?coredps`와 같은 규약).
// **BALANCE 정본이 아니라 사다리용**이다 — §0.7-B가 「완주가 깨지면 손잡이는 이 순서로만: ⓐ 드랍 가치
// ⓑ 상점·패시브 가격 ⓒ hpGrow 지수」로 못박은 그 ⓐ이고, INBOX #69 ③(도시 완주)의 첫 손잡이다.
// **맵 생성보다 먼저 서야 할 이유는 없지만**(드랍은 처치 시점에 정해진다) 다른 축과 같은 자리에 둔다
if (params.has("drop")) {
  const v = Number(params.get("drop"));
  if (!Number.isFinite(v) || v <= 0) throw new Error(`bad ?drop: ${params.get("drop")}`);
  setQaDrop(v);
}
// QA: ?wcurve=b<n> · ?wcurve=m0 — 웨이브 곡선의 «이음매»를 갈아끼운다 (iter164 · 큐 1).
// `b<n>` = EARLY 예산 기울기를 웨이브 n까지 이어 붙인다(정본 9 · 조성은 정본 그대로),
// `m0` = 조성 보간을 끄고 웨이브 10~36을 웨이브 9의 mix로 고정한다(예산은 정본 그대로).
// **BALANCE 정본이 아니라 대조용**이다 — iter163이 처치 전선의 계단을 웨이브 10으로 좁혔는데
// 그 자리에서 예산 꺾임과 조성 보간이 «함께» 시작해 한 컷으로는 안 갈린다.
// ⚠ **`WAVES`를 읽는 코드보다 먼저 서야 한다** — 손잡이가 배열 내용을 통째로 갈아끼운다
if (params.has("wcurve")) setQaWaveCurve(params.get("wcurve")!);
// QA: ?raisecap=<n> — **일제 부활의 상한**(§0.7 K ⑤ · `NECRO.raiseCap`)을 대체한다.
// **BALANCE 정본이 아니다** — 등재값은 60이고, 이 스위치는 정본 산문이 「실제 제한은 필드 상한 400의
// 여유분 하나」라고 못박은 자리(= 사다리의 위 끝 400)까지 재기 위한 손잡이다.
// 회귀 컷은 스위치 없음(= 60)이고, 「모두」 컷은 `?raisecap=400`이다
if (params.has("raisecap")) {
  const v = Number(params.get("raisecap"));
  if (!Number.isInteger(v) || v < 0) throw new Error(`bad ?raisecap: ${params.get("raisecap")}`);
  setQaRaiseCap(v);
}

// QA: ?nick=<이름> — 랭킹 닉네임을 못박는다 (§0.7 N). 최초 닉네임은 임의 값이라(rank.ts randomNick)
// 컷·probe가 열 때마다 달라진다 — 이 스위치가 재현의 유일한 경로다. **저장하지 않는다**(`?hover=`와 같은 부류)
if (params.has("nick")) setQaNick(params.get("nick")!);
// QA: ?cid=<uuid> — 랭킹의 기기 식별자(`client_id`)를 못박는다 (rank.ts setQaUid). **저장하지 않는다**.
// 헤드리스는 로드마다 새 uuid를 낳으므로 이것 없이는 **「기기당 1행」과 최고 기록 트리거**가 컷에 안 잡힌다
if (params.has("cid")) setQaUid(params.get("cid")!);
// QA: ?rankrows=<n> — 가짜 경쟁자 n명을 랭킹 판에 세운다 (rank.ts setQaRows). **저장하지 않는다** —
// 「10위까지 + 내가 밖이면 마지막 줄」과 정렬을 한 컷에 세우는 유일한 경로다
if (params.has("rankrows")) {
  const v = Number(params.get("rankrows"));
  if (!Number.isInteger(v) || v < 0) throw new Error(`bad ?rankrows: ${params.get("rankrows")}`);
  setQaRows(v);
}
// QA: ?net=0|1 — 랭킹 서버(Supabase) 연결을 끄고/켠다 (§0.7 N · 감독 #70).
// **기본 규칙은 「`warm`이 붙어 있으면 끈다」**이다 — `shot`·`probe`·`sweep`·`hub` 넷이 전부 `warm`을
// 달고 오므로(iter149 튜토리얼 게이트와 같은 표식) 이 한 줄이 **「QA 풀런이 실서버에 가짜 기록을
// 올리는」 사고를 통째로 막는다.** ⚠ RLS가 삭제를 막아서 한 번 들어간 줄은 anon이 못 지운다 —
// 그래서 켜는 쪽이 명시(`?net=1`)이고 끄는 쪽이 기본이다
const NET_Q = params.get("net");
setNet(NET_Q === "1" || (NET_Q !== "0" && !params.has("warm")));
// 첫 로드에 한 번: 밀린 오프라인 기록을 올리고 목록을 읽는다 (rank.ts syncRank)
syncRank();

// 런 중 자동 저장 = 이어하기 (DESIGN §10 2차 · 저장 규칙은 save.ts 머리말).
// QA: ?resume=0 — 저장을 통째로 끈다(읽기·쓰기 둘 다) · ?resume=1 — 다른 QA 스위치와 함께 써도 저장을 읽는다.
// **기본 규칙은 "쿼리가 하나도 없을 때만 자동으로 이어한다"**이다. QA 런은 언제나 ?start=·?warm=을 달고
// 오므로 이 한 줄이 "QA 컷이 남의 저장을 물고 시작해 회귀 수치가 조용히 바뀌는" 사고를 통째로 막는다.
// **맵 생성보다 먼저 서야 한다** — 이어하기는 시작 웨이브(= 지형 보충 횟수)를 바꾸기 때문이다
const RESUME_Q = params.get("resume");
// 메인 화면은 저장을 **읽지도 쓰지도 않는다** — 배경 데모는 자동 정차에서 상점을 돌므로(SHOP_QA),
// 저장을 켜 두면 «데모의 정차»가 사용자의 이어하기를 덮어쓴다. 이어하기는 CONTINUE 클릭이
// `?resume=1`로 다시 여는 순간에만 걸린다(§0.7 I "이미 있는 ?resume 경로를 화면에 노출하는 것뿐")
const SAVE_ON = RESUME_Q !== "0" && !MENU && (!QA_RUN || RESUME_Q === "1");
const RESUMED = SAVE_ON && (RESUME_Q === "1" || location.search.replace("?", "") === "") ? readSave(SEED) : null;
/** 메인 화면의 CONTINUE 자리 — 저장을 **읽기만** 한다(적용은 클릭이 여는 다음 로드의 몫이다) */
const MENU_SAVE = MENU ? readSave(SEED) : null;

/** **재도전 횟수** (DESIGN §0.7 N · 랭킹 항목 4 중 하나). **이 한 줄이 그 값을 올리는 유일한 자리**다 —
 *  「이어하기로 런을 되살렸다」가 곧 재도전이고, 그 사건은 `RESUMED`가 서는 것과 정확히 같다(감독 #67 ④
 *  "이미 있는 `?resume` 경로가 이 값을 올리는 자리"). 저장이 값을 도로 실어(save.ts `retries`) 몇 번을
 *  이어했든 누적된다. ⚠ **지금은 「패배 후」가 아니라 「중단 후」다** — 패배 프레임에 저장을 지우므로
 *  (아래 update의 clearSave) 패배로부터의 이어하기 경로 자체가 없다. STATUS 미결 질문 14행 */
const retries = RESUMED ? RESUMED.retries + 1 : 0;
if (RESUMED?.migrated) setRunEligibility(false, "이전 버전 복원 · 기록 제출 제외");

/** 랭킹의 화면 상태 (§0.7 N). **두 자리가 이 하나를 공유한다** — 메인 오버레이(menu.rank)와 종료
 *  화면 우측 판. 닉네임 수정 중인지도 여기 있으므로 키 입력이 어디서 눌리든 한 곳으로 간다 */
const rank = makeRank();

/** 플레이 중 «일시정지 · 나가기» (감독 #71). 시간 정지의 자리는 tick()의 step 한 줄이다 */
const pause = makePause();

/** 이 런의 보스 총수 (§3 "보스 = 6n 웨이브" · 60웨이브 → 10기). WAVES에서 유도하므로
 * 곡선을 늘리면 종료 화면의 분모가 함께 따라온다 — 상수로 박으면 다음 개정에서 조용히 틀린다 */
const BOSS_TOTAL = WAVES.filter((_, i) => isBossWave(i + 1)).length;
/** 런 누적 보스 처치 수. 풀이 여러 종이 된 뒤로 «그람 처치 수»는 보스 수가 아니다 —
 * 종료 화면·probe·이어하기가 전부 이 한 식을 쓴다 (balance.ts `BOSS_KINDS`) */
const bossKills = (by: Record<string, number>): number => BOSS_KINDS.reduce((a, k) => a + (by[k] ?? 0), 0);
// QA/게임: ?map=plains|city — 이 런의 맵 (DESIGN §0.7 J 「맵 2종 체계」). **§5.0 비율·레일·코어는
// 맵이 갈려도 안 바뀐다** — 갈리는 것은 지형과 배경뿐이고 규칙은 balance.ts MAPS 한 곳이다.
// 기본은 평원이라 기존 QA 진입점(shot·probe·sweep·perf)의 수치가 한 자리도 안 움직인다
// **이어하기는 저장된 맵을 이긴다** — 맵이 다르면 지형 배열의 길이부터 다르다(§0.7 J)
const MAP_Q = params.get("map");
if (MAP_Q !== null && MAP_Q !== "plains" && MAP_Q !== "city") throw new Error(`bad ?map: ${MAP_Q} (plains|city)`);
// **`?map=`은 이제 «경로를 끄는 스위치»다** (§0.7 O ⓑ · `BALANCE.ROUTE` · 감독 #72 ③).
// 파라미터가 없는 기본 런은 **경로 런**이고(평원 1~18 → 도시 19~36), 값을 주면 그 맵에 **고정**된다
// = 단일 맵 회귀 컷(`?map=plains` 9시드 · `?map=city` 9시드)이 그 문으로 남는다.
// **이어하기는 고정 여부도 이어받는다** — 안 이어받으면 파라미터를 잃은 복원이 경로 런으로
// 되돌아가 스테이지 7 이전에 「도시 → 평원」이라는 되돌아가는 전환이 난다(save.ts `pin`)
const MAP_PIN = RESUMED ? !!RESUMED.pin : params.has("map");
// QA: ?wallscale=<n> · ?crackr=<n> — 도시 맵 지형의 **크기**와 **1차 파괴 뒤 사선 배수**를 갈아끼운다
// (`?hpgrow=`·`?w0=`과 같은 부류의 A/B 손잡이 · **BALANCE 정본이 아니다**). 둘 다 §0.7이
// 「루프 제안 · 감독 등재 대기」로 열어 둔 값이고, iter105의 도시 풀런이 완주에 실패해 사다리가 필요해졌다.
// **`generateMap`보다 위에 있어야 한다** — 반경은 맵을 굽는 시점에 정해진다
if (params.has("wallscale")) {
  const v = Number(params.get("wallscale"));
  if (!(v > 0) || !Number.isFinite(v)) throw new Error(`bad ?wallscale: ${params.get("wallscale")}`);
  setQaWallScale(v);
}
if (params.has("crackr")) {
  const v = Number(params.get("crackr"));
  if (!(v >= 0) || v > 1) throw new Error(`bad ?crackr: ${params.get("crackr")} (0..1)`);
  setQaCrackLosR(v);
}
// QA: ?cover=off|move|both — 도시의 구운 지물(건물·주유소)이 막는 범위(기본 off · map.ts `solidCover`).
// 열린 미결 질문의 사다리를 재는 손잡이다 — iter114 실측(도시 s7 · `?ehp=0.4&wdmg=1`):
// **off 60/60 · move 48/60 · both 9/60**(사선만 켠 컷은 12/60 = 범인은 사선이다).
// **`generateMap`보다 위에 있어야 한다** — 플로우필드가 굽는 시점에 이 값을 읽는다
if (params.has("cover")) {
  const v = params.get("cover")!;
  if (v !== "off" && v !== "move" && v !== "both") throw new Error(`bad ?cover: ${v} (off|move|both)`);
  setQaCover(v);
}
// QA: ?wallstart=<n> — **스테이지 1의 지물 목표 개수**만 갈아끼운다(`cap`·`add`는 그대로).
// iter106이 도시의 「사선을 여는 세금」이 **초반에 몰려 있다**는 것을 실측했다 —
// 웨이브 18에 죽은 컷이 이미 지형에 2,405를 부었는데 60웨이브 완주 컷의 총액이 2,494~3,945다.
// 그 세금을 뒤로 미는 손잡이가 이것이고, 후반 밀도는 정본 창(24~32)에 그대로 남는다
if (params.has("wallstart")) {
  const v = Number(params.get("wallstart"));
  if (!Number.isInteger(v) || v < 0) throw new Error(`bad ?wallstart: ${params.get("wallstart")}`);
  setQaWallStart(v);
}
// QA: ?fuelhp=<n> — **폭발 지물(폐주유소)의 HP**. `FUEL` 네 칸이 전부 **루프 제안 · 감독 등재 대기**라
// (§0.7 J1-c 「값은 루프 실측 제안 → 감독 등재」) 사다리를 재는 손잡이가 필요하다. 제안 사다리 =
// 120(포격 1발) / **240**(2발 · 기본) / 360(3발). **`generateMap`보다 위에 있어야 한다** — HP는
// 맵을 굽는 시점에 정해진다(`?wallscale=`·`?wallstart=`와 같은 사정)
// QA: ?acidlock=1 — **§0.7 J2의 네 번째 자물쇠**(산성 웅덩이가 지형을 안 녹인다 · combat.ts
// `updatePools`). 잠그는 것이 정본 문면인데 **도시 완주가 부러진다**(iter116 실측: 도시 s7
// `60/60 · 509.3` → `48/60 · 542.2` — 산성이 녹여 주던 9장이 플레이어의 사선을 열어 주고 있었다).
// 그래서 기본은 **지금 그대로**이고 이 스위치가 사다리를 재는 유일한 손잡이다(`?cover=`와 같은 부류)
if (params.has("acidlock")) {
  const v = params.get("acidlock")!;
  if (v !== "0" && v !== "1") throw new Error(`bad ?acidlock: ${v} (0|1)`);
  setQaAcidLock(v === "1");
}
if (params.has("fuelhp")) {
  const v = Number(params.get("fuelhp"));
  if (!(v > 0) || !Number.isFinite(v)) throw new Error(`bad ?fuelhp: ${params.get("fuelhp")}`);
  setQaFuelHp(v);
}
// QA: ?slotfree=0 — **파괴된 지물이 보충의 자리를 계속 잡는다**(= iter124 이전의 동작).
// 기본 1이 §4.2 문면(「기존 잔존물과 합쳐 과밀해지지 않게」 · 「다 부숴도 기믹이 계속 작동하게」)이고,
// 이 스위치는 **후반 지형 밀도라는 축 하나만 꺼서** 완주·총손실의 증감을 누구 몫으로 셀지 가른다
if (params.has("slotfree")) {
  const v = params.get("slotfree")!;
  if (v !== "0" && v !== "1") throw new Error(`bad ?slotfree: ${v} (0|1)`);
  setQaSlotFree(v === "1");
}
// QA: ?ringplace=0 — **전투 환 우선 배치를 끈다**(= iter167 이전의 「첫 합격점」 규칙).
// 기본 1이 정본(DESIGN §0.8 판정 ③)이고, 이 스위치는 **선택 규칙 하나만** 되돌린다 —
// `railClear`·`gap`·`edge`·`cap`·난수 시드는 그대로다. 판정 ③이 든 근거(「전선 밖의 지형은
// 사선을 막을 일이 없어 장식이 된다」)를 수로 세우려면 `losBlocked`·`terrainShots`를 두 값에서
// 나란히 읽어야 하는데 그 A/B가 없었다(`?slotfree=`와 같은 부류 · BALANCE 정본이 아니다)
if (params.has("ringplace")) {
  const v = params.get("ringplace")!;
  if (v !== "0" && v !== "1") throw new Error(`bad ?ringplace: ${v} (0|1)`);
  setQaRingPlace(v === "1");
}
// QA: ?twostage=0|1 — **이 런의 2단 파괴**(기본 = 맵의 값 · 평원 false · 도시 true).
// STATUS 표 6(「평원도 2단 파괴를 켜는가」)이 「안 쟀다」로 열려 있던 이유가 **손잡이가 없어서**였다 —
// `?terrladder=1`은 다섯 단계를 한 컷에 세우는 «그림» 손잡이라 규칙을 안 간다. 평원에서 켜면
// `CRACK.losR 0.55`가 함께 걸려 **1차 파괴 뒤 사선 차단이 절반**이 되므로 밸런스 변경이다
// (`?cover=`·`?slotfree=`와 같은 부류 · BALANCE 정본이 아니다).
// **`generateMap`보다 위에 있어야 한다** — 이어하기의 되읽기(`save.ts`)가 이 값으로 1차 파괴를 복원한다
if (params.has("twostage")) {
  const v = params.get("twostage")!;
  if (v !== "0" && v !== "1") throw new Error(`bad ?twostage: ${v} (0|1)`);
  setQaTwoStage(v === "1");
}
// QA: ?w=<1..9> — 이 웨이브부터 시작한다. 스테이지 3의 편성을 보려면 앞의 8웨이브를 다 감아야 하는데
// (전멸이 조건이라 warm 시간이 분 단위로 든다) 그럴 필요가 없다. 진행 자체의 검증은 ?w=1 + 긴 warm
// **`generateMap`보다 위에 있어야 한다** — 경로 런(§0.7 O ⓑ)에서 **시작 웨이브가 시작 맵을 정한다**
// (`?w=25`는 도시 구간이다). 지형 보충(§4.2)보다도 위여야 시작 스테이지까지의 보충이 미리 얹힌다
// 메뉴 데모는 웨이브 5(스테이지 2)에서 연다 — 웨이브 1은 단일 종·소수라 「부대가 달려드는 화면」이
// 안 만들어진다(§0.7 I가 요구하는 그림이다). 진행은 그대로 흘러간다(데모는 안 멈춘다)
const START_WAVE = RESUMED ? RESUMED.waveIdx + 1 : Number(params.get("w") ?? (MENU ? "5" : "1"));
if (!Number.isInteger(START_WAVE) || START_WAVE < 1 || START_WAVE > WAVES.length)
  throw new Error(`bad ?w: ${params.get("w")} (1..${WAVES.length})`);
const START_STAGE = WAVES[START_WAVE - 1].stage;

// **튜토리얼 한 페이지** (§P · 감독 #72 ⑧) — 첫 런의 웨이브 1이 열리기 **전**에 한 번. 정지는
// `pause.ts`의 것을 그대로 쓰므로 여기서 하는 일은 «그 칸을 세우는 것» 하나다.
// ⚠ **헤드리스 QA는 브라우저 컨텍스트가 매번 새것이라 `td_tutorial_seen`이 늘 비어 있다** —
// 플래그만으로 걸면 `shot`·`probe`·`sweep`의 모든 컷이 튜토리얼 페이지로 덮인다. QA 진입점의
// 표식은 **`warm`**이다(도구 넷이 전부 그것을 단다) — 그래서 `warm`이 붙어 있으면 안 뜬다.
// 강제 스위치는 `?tut=1`(연다) / `?tut=0`(안 연다)이고, **시각 QA는 `?tut=1`로 찍는다.**
// QA: `?pause=1` — 정지 화면을 **연 채로** 연다. 정지·도움말은 클릭으로만 서므로 그 화면을
// 컷으로 재현할 길이 달리 없다(`?tut=1`과 같은 부류의 QA 손잡이다)
if (params.get("pause") === "1") pause.on = true;
const TUT_Q = params.get("tut");
const TUTORIAL =
  TUT_Q === "1" ||
  (TUT_Q !== "0" && !MENU && !RESUMED && !params.has("warm") && START_WAVE === 1 && !tutorialSeen());
if (TUTORIAL) pause.help = true;
// **경로 런의 시작 맵** (§0.7 O ⓑ). 고정 런은 `?map=`의 값 · 이어하기는 저장된 맵이 둘을 다 이긴다
const MAP_ID: MapId = RESUMED?.map ?? MAP_Q ?? routeMapOf(START_STAGE);
/** 웨이브 i(0-based)가 도는 맵. 고정 런(`?map=`)은 어느 웨이브든 그 한 맵이다 */
const mapAtWave = (i: number): MapId => (MAP_PIN ? MAP_ID : routeMapOf(WAVES[i].stage));
const map = generateMap(SEED, MAP_ID);
// 지형 보충 (DESIGN §4.2 / 감독 #25 ③). 스테이지 1은 초기 채움(고정 5 + 절차 5 = TERRAIN.place.start),
// 이후 스테이지는 3~4개씩 새 위치에. ?w=로 중간부터 시작하면 그 스테이지까지의 보충을 여기서 몰아 얹는다
// `terrainWants`가 짝이다 — 「몇 개를 놓으려 했나」와 「몇 개가 놓였나」를 갈라 둬야 §4.2의
// 「다 부숴도 계속」이 실제로 서는지가 보인다(iter124: 옛 코드는 want 3~4에 placed 0이었다)
const terrainAdds: number[] = [];
const terrainWants: number[] = [];
// **몰아 얹는 것은 «이 구역»의 몫뿐이다** (§0.7 O ⓑ). 경로 런에서 스테이지 7에 들어서면 판이
// 통째로 갈리므로(`switchMap`) 스테이지 1~6의 보충은 다른 판에 얹혔던 것이고 여기 실려 오지 않는다.
// 구간 첫 스테이지는 «보충»이 아니라 «초기 채움»이다(`fresh` — 도시 정본 `start 20`에 닿는 유일한 길)
const LEG_START = MAP_PIN ? 1 : routeLegStartOf(START_STAGE);
for (let s = LEG_START; s <= START_STAGE; s++) {
  const a = stageTerrain(map, s, s === LEG_START);
  terrainWants.push(a.want);
  terrainAdds.push(a.placed);
}
// **관측칸의 조건부 등장** (BALANCE §4.5, 감독 #47). `stageTerrain`이 스테이지 경계에 더하는 것은
// 성벽뿐이라 언덕 수는 런 도중에 안 변한다 — 여기서 한 번 세우면 끝이다
// QA: ?hills=<n> — 세어진 언덕 수를 덮어써 **관측칸이 열린 쪽**을 헤드리스에서 본다.
// 이 맵의 언덕은 §4.1 고정 지형 3개라 임계 6에 영영 못 닿는다(= 일반 맵에서는 안 나오는 것이
// 정본 상태다, 감독 #47) — 언덕이 많은 맵이 생기기 전까지 잠금 해제 경로를 재는 유일한 손잡이다.
// **BALANCE 정본이 아니다**(`?air`와 같은 부류)
setMapHills(
  params.has("hills") ? Number(params.get("hills")) : map.terrain.filter((t) => t.kind === "hill").length
);
if (params.has("hills") && !Number.isFinite(mapHillsValue())) throw new Error(`bad ?hills: ${params.get("hills")}`);
const track = buildTrack(map.loop);
const train = makeTrain(track);
let flow = buildFlow(map);
// **수륙양용용 두 번째 필드** (§8.④ — 호수가 안 막힌 판). 지형이 바뀌면 **둘 다** 다시 굽는다 —
// 한쪽만 갱신하면 그 종만 옛 지형을 보고 걷는다(flow.ts buildFlow 주석)
let swimFlow = buildFlow(map, true);
let flowBuilds = 1;
// QA: ?wave=<kind>[,<kind>…] — 웨이브 편성은 큐 1(스테이지 진행)의 몫이라, 지금까지 추가한 적종
// (hound·archer·shield_orc·mortar_team·slime·drummer)을 검증하려면 적종을 바꿔치기해야 한다.
// 쉼표로 여러 종을 주면 burst마다 번갈아 스폰된다 (적종 혼합)
// QA: ?amph=<%> — 웨이브 조성에 수륙양용 3종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// 편입 비중은 §6 정본 판단이라 감독 등재 대기다(STATUS 미결 질문) — 이 스위치는 그 실측 경로다
if (params.has("amph")) {
  const ap = Number(params.get("amph"));
  if (!Number.isFinite(ap) || ap < 0 || ap > 90) throw new Error(`bad ?amph: ${params.get("amph")}`);
  setQaAmphPct(ap);
}
// QA: ?air=<%> — 웨이브 조성에 공중 5종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// **이 스위치가 대공 플랙의 잠금도 함께 연다**(balance.ts setAirThreat) — 표적이 있을 때만 파는
// 무기라는 규칙이 조성 하나에서 유도되게 하려는 것이다. 편입 비중은 §6 정본이라 감독 등재 대기
if (params.has("air")) {
  const air = Number(params.get("air"));
  if (!Number.isFinite(air) || air < 0 || air > 90) throw new Error(`bad ?air: ${params.get("air")}`);
  setQaAirPct(air);
}
// QA: ?siege=<%> — 웨이브 조성에 공성 4종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// `?amph=`·`?air=`와 같은 부류다 — 편입 비중은 §6 정본이라 감독 등재 대기
if (params.has("siege")) {
  const sg = Number(params.get("siege"));
  if (!Number.isFinite(sg) || sg < 0 || sg > 90) throw new Error(`bad ?siege: ${params.get("siege")}`);
  setQaSiegePct(sg);
}
// QA: ?runner=<%> — 웨이브 조성에 러너 신규 4종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// `?amph=`·`?air=`·`?siege=`와 같은 부류다 — 편입 비중은 §6 정본이라 감독 등재 대기
if (params.has("runner")) {
  const rn = Number(params.get("runner"));
  if (!Number.isFinite(rn) || rn < 0 || rn > 90) throw new Error(`bad ?runner: ${params.get("runner")}`);
  setQaRunnerPct(rn);
}
// QA: ?armor=<%> — 웨이브 조성에 중장갑 신규 4종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// `?amph=`·`?air=`·`?siege=`·`?runner=`와 같은 부류다 — 편입 비중은 §6 정본이라 감독 등재 대기
if (params.has("armor")) {
  const am = Number(params.get("armor"));
  if (!Number.isFinite(am) || am < 0 || am > 90) throw new Error(`bad ?armor: ${params.get("armor")}`);
  setQaArmorPct(am);
}
// QA: ?skirm=<%> — 웨이브 조성에 산병 신규 3종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// `?amph=`·`?air=`·`?siege=`·`?runner=`·`?armor=`와 같은 부류다 — 편입 비중은 §6 정본이라 감독 등재 대기
if (params.has("skirm")) {
  const sk = Number(params.get("skirm"));
  if (!Number.isFinite(sk) || sk < 0 || sk > 90) throw new Error(`bad ?skirm: ${params.get("skirm")}`);
  setQaSkirmPct(sk);
}
// QA: ?swarm=<%> — 웨이브 조성에 증식 신규 4종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// `?amph=`·`?air=`·`?siege=`·`?runner=`·`?armor=`·`?skirm=`와 같은 부류다 — 편입 비중은 §6 정본이라
// 감독 등재 대기
if (params.has("swarm")) {
  const sw = Number(params.get("swarm"));
  if (!Number.isFinite(sw) || sw < 0 || sw > 90) throw new Error(`bad ?swarm: ${params.get("swarm")}`);
  setQaSwarmPct(sw);
}
// QA: ?support=<%> — 웨이브 조성에 지원 신규 4종을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// 앞의 일곱 손잡이와 같은 부류다 — 편입 비중은 §6 정본이라 감독 등재 대기
if (params.has("support")) {
  const su = Number(params.get("support"));
  if (!Number.isFinite(su) || su < 0 || su > 90) throw new Error(`bad ?support: ${params.get("support")}`);
  setQaSupportPct(su);
}
// QA: ?variant=<%> — 웨이브 조성에 **변종 12종**을 그 비중만큼 섞는다 (기본 0 = 기준선 무영향).
// 앞의 여덟 손잡이와 같은 부류인데 켜는 것이 «한 유형»이 아니라 «여덟 유형에 흩어진 12종»이다 —
// 편입 비중·해금 스테이지는 §6 정본이라 감독 등재 대기
if (params.has("variant")) {
  const vr = Number(params.get("variant"));
  if (!Number.isFinite(vr) || vr < 0 || vr > 90) throw new Error(`bad ?variant: ${params.get("variant")}`);
  setQaVariantPct(vr);
}
// **이 줄은 makeField보다 위에 있어야 한다** — 첫 웨이브의 편성(roster)은 makeField가 그 자리에서
// 펴므로, 아래에 두면 웨이브 1~n에 이 스위치가 조용히 안 먹는다(iter62 실측: 초반 컷 swim/leaps 0)
const WAVE_KINDS = params.get("wave")?.split(",") ?? null;
for (const k of WAVE_KINDS ?? []) if (!ENEMY_STATS[k]) throw new Error(`unknown ?wave entry: ${k}`);
// QA: ?dense=<count>[,<burst>[,<window>]] — 웨이브의 스폰 수·무리 크기·창(초)만 바꿔치기한다.
// 편성은 큐 2의 몫이라 지금 웨이브는 좀비 16 하나뿐이고, 그래서 화면에 동시에 2~4기밖에 없다.
// 감독 #5 V4 판정("전투 화면의 밀도가 목업과 동급인가")이 렌더 문제와 편성 문제를 가르려면
// 스폰 수만 올려 본 컷이 필요하다. **BALANCE §6 정본이 아니다 — QA 전용**
const DENSE = params.get("dense")?.split(",").map(Number);
if (DENSE && !DENSE.every((n) => Number.isFinite(n) && n > 0)) throw new Error(`bad ?dense: ${params.get("dense")}`);
// QA: ?faction=<tribe|machine|undead|abyss|off> = 진영 로테이션 고정/끔 (§0.6 D).
// ⚠ **`makeField` 위에 있어야 한다** — `makeField`가 그 자리에서 `startWave`로 첫 웨이브의 조성을
// 펴므로, 아래에 두면 `?w=N` 진입점의 그 웨이브에 이 스위치가 조용히 안 먹는다(`?wave=`와 같은 이유)
// `off`는 `tribe` 고정 = **D 이전의 기준선을 그대로 재현하는 A/B 대조군**이다
if (params.has("faction")) {
  const v = params.get("faction")!;
  if (v === "off") setQaFaction("tribe");
  else if ((FACTION_ORDER as readonly string[]).includes(v)) setQaFaction(v as FactionId);
  else throw new Error(`bad ?faction: ${v} (${FACTION_ORDER.join("|")}|off)`);
}
// QA: ?rotate=<n> = 진영 교대 주기(스테이지) 대체 (감독 #72 ④ · iter145). `?rotate=4`가 옛 기준선이다.
// ⚠ 위 `?faction=`과 같은 이유로 **`makeField` 위**에 있어야 한다
if (params.has("rotate")) {
  const n = Number(params.get("rotate"));
  if (!Number.isFinite(n) || n < 1) throw new Error(`bad ?rotate: ${params.get("rotate")}`);
  setQaFactionRotate(n);
}
const W0 = WAVES[START_WAVE - 1];
const field = makeField(
  map,
  SEED,
  WAVE_KINDS,
  DENSE ? { count: DENSE[0], burst: DENSE[1] ?? W0.burst, window: DENSE[2] ?? W0.len * STAGE.spawnDuty } : null,
  START_WAVE - 1,
);
// QA: ?guns=off — 자동 사격을 빼고 코어 피격·패배 경로만 확인할 때 쓴다
if (params.get("guns") === "off") train.cars = train.cars.filter((c) => !WEAPONS[c.kind]);
// QA: ?cars=hero,mortar,collector — 시작 편성은 §6.1 고정이고 편성 변경은 카드·상점(큐 2·3)의 몫이라,
// 새 무기(박격포)를 지금 검증하려면 편성을 직접 바꿔치기해야 한다
// 메뉴 데모의 편성은 «포탑이 여럿 보이는» 쪽으로 연다 — 시작 편성(무기칸 2)으로는 바깥을 훑는
// 예광이 화면에 거의 안 뜬다(§0.7 I "포탑이 바깥을 훑으며 예광"). 칸은 전부 게임의 그것이다
const CARS = params.get("cars") ?? (MENU ? "hero,machinegun,railgun,mortar,flamer,collector" : null);
if (CARS) {
  train.cars = CARS.split(",").map((k) => {
    if (!(CAR_KINDS as readonly string[]).includes(k)) throw new Error(`unknown ?cars entry: ${k}`);
    return makeCar(k as CarKind);
  });
}
// QA: ?tier=<1..3> — 편성 전체의 무기 티어를 한 번에 세운다 (60웨이브 전환, iter44 신설).
// 후반 웨이브의 필요 화력을 재려면 티어가 필요하다 — `?lvl`은 `maxLevelOf(tier)`(= 티어당 5)에
// 클램프되므로 T1에서는 Lv6이 천장이고, 12칸을 다 채워도 명목 234가 한계다(기준 편성의 1.33배).
// **BALANCE 정본이 아니다 — QA 전용**(`?lvl`·`?scrap`과 같은 부류). ?lvl보다 **먼저** 서야 한다
if (params.has("tier")) {
  const tr = Number(params.get("tier"));
  if (!Number.isInteger(tr) || tr < 1 || tr > CARDS.maxTier) throw new Error(`bad ?tier: ${params.get("tier")}`);
  for (const car of train.cars) if (WEAPONS[car.kind]) car.tier = tr;
}
// QA: ?lvl=<0..5> — 편성 전체의 상점 강화 레벨을 한 번에 세운다. BALANCE §5 검산의 기준 편성이
// "8~9칸 + **상점 레벨 강화 포함**"이라(§0 원칙 5), 필요 DPS를 재려면 칸 수와 강화를 따로 움직여야
// 한다 — 칸 수만으로는 9칸 Lv1의 ~60이 천장이다. **BALANCE 정본이 아니다 — QA 전용**(?scrap과 같은 부류)
if (params.has("lvl")) {
  const lv = Number(params.get("lvl"));
  if (!Number.isInteger(lv) || lv < 0) throw new Error(`bad ?lvl: ${params.get("lvl")}`);
  for (const car of train.cars) if (WEAPONS[car.kind]) car.level = Math.min(lv, maxLevelOf(car.tier));
}
// 데모 편성의 화력 — 웨이브 5의 부대를 실제로 «녹여야» 화면이 안 막힌다(코어 판정을 뺐으므로
// 화력이 모자라면 적이 코어에 쌓이기만 한다). T2 · Lv3은 그 자리의 실측 하한이다
if (MENU && !params.has("tier")) for (const car of train.cars) if (WEAPONS[car.kind]) car.tier = 2;
if (MENU && !params.has("lvl")) for (const car of train.cars) if (WEAPONS[car.kind]) car.level = Math.min(3, maxLevelOf(car.tier));
const combat = makeCombat(map, SEED);
const shop = makeShop();
// QA: ?shop=skip|auto — 정차는 **시간 정지**라(DESIGN §3) 헤드리스 런은 상점 앞에서 영영 멈춘다.
//  · skip = 정차하자마자 출발 (구매 없음 — 상점 도입 전 동작과 같은 회귀 기준선)
//  · auto = 목표 편성까지 자동 구매 후 출발 (shop.ts autoSpend — "상점이 DPS 80을 만드는가"의 실측)
//  · repair = **코어 수리만** 만땅까지 사고 출발 (칸·강화는 0). 편성을 `?cars=`로 고정한 채 "회복만으로
//    런이 어디까지 가는가"를 재는 격리 컷이다 — 화력 성장과 회복을 섞으면 원인이 안 갈린다
// 값이 없으면 실제 게임 그대로 상점이 열린다. 스테이지 경계(≈187초)를 넘는 QA 런은 반드시 이걸 준다
// 메뉴 데모도 같은 자동 조종을 쓴다 — 정차·카드는 **시간 정지**라 손이 없는 화면은 거기서 굳는다.
// (= 데모에는 «판정»이 없다는 §0.7 I 규약의 나머지 반쪽이다: 사람의 선택 자리를 자동이 대신한다)
const SHOP_QA = params.get("shop") ?? (MENU ? "auto" : null);
// QA: ?scrap=<n> — 시작 스크랩을 지급한다. §2 경제(수입)와 §3 상점(가격)은 서로 다른 정본이라
// "상점이 DPS 80을 만들 수 있는가"와 "런 수입이 그 돈을 대는가"를 **따로** 재야 한다.
// 이 스위치는 앞의 질문 전용이다 — BALANCE 정본이 아니다 (?dense와 같은 부류)
if (params.has("scrap")) combat.scrap = Number(params.get("scrap"));
// QA: ?corehp=<n> — 시작 코어 HP를 덮어쓴다. **BALANCE §1 정본(100)이 아니다**(?scrap과 같은 부류).
// "스테이지별로 코어를 얼마나 뺏기는가"를 재려면 런이 도중에 끝나면 안 된다 — 코어 100으로는 약한
// 편성이 스테이지 2~3에서 죽어 뒤 스테이지의 표본이 통째로 비고, 스테이지별 필요 화력을 못 잰다.
// 큰 값을 주면 60웨이브를 완주하므로 **한 런에서 20스테이지치 손실·수입을 한 번에** 얻는다
// (스테이지별 값은 shop.log의 이웃 두 정차 차분 — `?shop=skip`이면 지출이 0이라 차분 = 순수 손실·수입).
// 함정: 편성이 약하면 적이 안 죽고 누적되어 뒤 스테이지의 손실이 부풀려진다 — `capHits`·`aliveMax`로 걸러야 한다
if (params.has("corehp")) combat.coreHp = Number(params.get("corehp"));
// QA: ?range=<n> — **§0.8 사거리 배율**(`MULT.range`)을 통째로 갈아끼운다(곱하는 것이 아니라
// 대체다 — `?ehp`·`?coredps`와 같은 규약이라 사다리 값이 곧 후보 정본값이다). 판정 ④의 사다리
// `{0.45, 0.55, 0.65, 0.75, 0.85, 1.00}`을 재는 손잡이이고 **BALANCE 정본이 아니다**.
// QA: ?range=<무기>:<값>[,...] — 그 무기의 §4 사거리 원값(루프 반경=1)만 갈아끼운다(옛 문법 · 배율은
// 그 위에 그대로 걸린다). `?bosshp`·`?coredps`와 같은 부류의 **A/B 전용**이고 정본이 아니다.
// INBOX #24 ①("화염방사가 공격을 안 하는 것 같다")의 개선안을 사다리로 재려고 만들었다.
// **`:`의 유무가 두 문법을 가른다** — 한 줄에 섞어 쓸 수 있다(`?range=0.65,flamer:1.2`).
for (const t of (params.get("range") ?? "").split(",")) {
  const [k, v] = t.split(":");
  if (v === undefined) {
    if (k) setQaWeaponRange(Number(k));
  } else if (WEAPONS[k]) WEAPONS[k].range = Number(v);
}
// QA: ?standoff=0|1 — **§0.8-B 개정**(`standoff′ = 1 + (standoff − 1) × MULT.range`)을 켜고 끈다.
// 기본은 **켜짐**(정본)이고 `0`이 §0.8-A까지의 옛 체제(= 적만 배율을 안 타는 회귀 컷)다.
// 사다리와 회귀를 «같은 세션에서» 가르려고 감독이 직접 지정한 손잡이다(INBOX #78 ③).
// 확인 지점은 probe `multNow.standoffRev`이고, `?range=1.00`에서는 켜나 끄나 완전한 무연산이다
if (params.has("standoff")) setQaStandoffRev(params.get("standoff") !== "0");
// QA: ?copull=N — §0.6 C1 슬롯 복귀력(`COMPANY.pull` = 2.4)을 덮어쓴다. **정본이 아니다**
// (`?ringplace`·`?standoff`와 같은 부류). 0이면 낙오병이 순수 플로우필드로 걷는 대조군이고,
// STATUS 표 29(「웨이브 정체」)의 원인이 조향인지를 가르는 유일한 손잡이다.
// 확인 지점은 probe `enemies.co.pull`이다
if (params.has("copull")) setQaCoPull(Number(params.get("copull")));
// QA: ?pinslip=0|1 — 「탈출 성분 우선」(STATUS 표 29 갈래 ⓐ) A/B. 기본은 **켜짐**(정본)이고 `0`이
// iter172까지의 옛 동작(지물이 되돌린 개체에도 슬롯 복귀를 걸어 고정점이 서는 체제)이다.
// 확인 지점은 probe `enemies.co.pinSlip`
if (params.has("pinslip")) setQaPinSlip(params.get("pinslip") !== "0");
// QA: ?pull=<월드거리> — §2 드랍 당김(`COLLECT.pull` = 0.55 × 224.6 = 123.5)을 덮어쓴다. 0이면 iter42
// 이전 동작(죽은 자리에 그대로)이다. `?range`·`?coredps`와 같은 부류의 A/B 전용이고 **정본이 아니다** —
// 이 스위치로 찍은 값을 정본 실측으로 인용하지 말 것(probe `drops.pull`이 확인 지점)
if (params.has("pull")) combat.dropPull = Number(params.get("pull"));
// QA: ?repair=<0..1> — `?shop=auto`의 **적응형 수리 정책**(shop.ts `adaptiveRepairFloor` — 직전
// 스테이지의 실측 손실만큼 되돌린다)을 **고정 비율로 갈아끼운다**. 0이면 수리를 아예 안 사고 1이면
// 매 정차 만땅까지 고친다. **자동 소비 정책값이지 BALANCE 정본이 아니다** — "수리와 강화가 실제로
// 갈등하는가"를 사다리로 재는 유일한 손잡이다 (probe `shop.repairFloor`, 미지정이면 `"auto"`).
// 옛 기본 정책(고정 0.6 = `AUTO_REPAIR_FLOOR`)과의 A/B는 `?repair=0.6`이다
const REPAIR_FLOOR = params.has("repair") ? Number(params.get("repair")) : null;
// QA: ?rmargin=<n> — 적응형 수리 정책의 여유 배수(`AUTO_REPAIR_MARGIN`)를 덮어쓴다. `?repair`와 같은
// 부류의 정책 A/B 손잡이이고 **BALANCE 정본이 아니다** (probe `shop.repairMargin`)
const REPAIR_MARGIN = params.has("rmargin") ? Number(params.get("rmargin")) : AUTO_REPAIR_MARGIN;
// **자동 소비의 저축 정책 — iter49에서 기준선으로 승격됐다** (감독 #33 ③ 승인).
// 칸(120)을 살 돈이 모일 때까지 강화를 안 산다. 기본 정책(돈이 생기는 대로 강화)은 정차가 잦아지면
// 칸에 닿기 전에 돈을 흘려 버려서, 사람이 "칸을 하나 더 산다"고 판단하는 행동을 대변하지 못한다.
// **회귀 기준값이 이 승격으로 갱신됐다** — iter48까지의 `?shop=auto` 실측과 직접 비교하지 말 것.
// QA: ?save=0 — 승격 전 정책으로 되돌리는 A/B (정책값이지 BALANCE 정본이 아니다, `?repair`와 같은 부류)
const SAVE_FOR_CAR = params.get("save") !== "0";
// **칸 예약 정책 — iter51에서 기준선으로 승격됐다** (shop.ts autoSpend `reserveCar` 주석에 사다리).
// 목표 칸 미달인 정차에서 수리가 칸 1개 값(120)을 남기고 멈춘다 — 승격 전에는 수리가 정차 자금
// 전액을 먼저 가져가 그 정차에서 화력이 통째로 멈추는 일이 있었다(실측: 같은 수입 442에서 s7만 칸을 산다).
// QA: ?reserve=0 — 승격 전 정책으로 되돌리는 A/B (정책값이지 BALANCE 정본이 아니다, `?repair`와 같은 부류)
const RESERVE_CAR = params.get("reserve") !== "0";
// **다음 스테이지 예산 비례 수리 — iter56에서 기준선으로 승격됐다** (감독 #38 사인 A · shop.ts
// `stageGrowth`). 적응형 바닥이 직전 손실에 **다음 스테이지의 §6 기저 예산 비**를 곱한다 —
// 안 곱하면 수요가 2배가 되는 스테이지 1→2→3 구간에서 체계적으로 덜 고친다.
// QA: ?rscale=0 — 승격 전 정책으로 되돌리는 A/B (정책값이지 BALANCE 정본이 아니다, `?repair`와 같은 부류)
const REPAIR_SCALE = params.get("rscale") !== "0";
// **다음 스테이지 예산의 절대 하한 — iter58에서 기준선으로 승격됐다** (큐 1 · shop.ts
// `absoluteRepairFloor`). 손실 기반 바닥은 직전 스테이지를 싸게 넘긴 런일수록 덜 고쳐서, 화력이
// 높은데 정차 2에서 +10만 사고 스테이지 3에 84.3으로 들어가 죽는 런이 남았다(iter57 s7).
// QA: ?rabs=<k> — 환산 계수를 덮어쓴다. 0이면 승격 전 정책으로 되돌리는 A/B
// (정책값이지 BALANCE 정본이 아니다, `?repair`와 같은 부류)
const REPAIR_ABS = params.has("rabs") ? Number(params.get("rabs")) : AUTO_REPAIR_ABS;
// QA: ?sup=<n>[&supk=<종>] — `?shop=auto`의 자동 소비가 **지원칸을 n대까지** 산다 (iter61 큐 1).
// 기본 0 = 기준선(한 대도 안 산다)이고, 기준선 컷은 이 스위치로 한 톨도 안 움직인다.
// iter60이 특정한 측정 경로 문제 — 지원칸 2종은 A/B가 끝났는데 9 seed 풀런의 `fed`가 전부 0이라
// §6.1 지원칸의 값이 풀런에서 한 번도 안 재졌다 — 를 여는 유일한 손잡이다.
// **정책값이지 BALANCE 정본이 아니다**(`?repair`·`?save`와 같은 부류)
const SUPPORT_CARS = params.has("sup") ? Number(params.get("sup")) : 0;
const SUPPORT_KIND = (params.get("supk") ?? "ammo") as CarKind;
if (!Number.isInteger(SUPPORT_CARS) || SUPPORT_CARS < 0) throw new Error(`bad ?sup: ${params.get("sup")}`);
if (SUPPORT_CARS > 0 && !SHOP.carPrice[SUPPORT_KIND]) throw new Error(`bad ?supk: ${SUPPORT_KIND}`);
const SUPPORT_PLAN = SUPPORT_CARS > 0 ? { kind: SUPPORT_KIND, n: SUPPORT_CARS } : null;
// QA: ?pass=0 — `?shop=auto`의 자동 소비가 **패시브 4종(§0.7 H2)을 안 산다**. 기본 켜짐이 기준선이다
// (H1의 짝이라 꺼진 채로 잰 런은 「부러진 런」이지 기준선이 아니다) — `?gate=0`·`?faction=off`와 같은 부류.
// **H2 이전 상태를 그대로 재현하는 유일한 손잡이**이고, hpGrow 사다리에서 두 축을 가르는 데 쓴다
const PASSIVE_ON = params.get("pass") !== "0";
// QA: ?hpgrow=<n> — §0.7 H1의 웨이브 성장 지수(`ENEMY.hpGrow`)를 **갈아끼운다**(곱하지 않는다).
// **BALANCE 정본이 아니라 사다리용**이다(`?hpstep`과 같은 규약) — 감독 초안 구간 1.045~1.06을
// 한 서버·한 빌드에서 재려고 만들었다. 1이면 H1 이전(웨이브 1과 60의 개체가 같다)으로 되돌린다
if (params.has("hpgrow")) {
  const g = Number(params.get("hpgrow"));
  if (!(g >= 1) || !Number.isFinite(g)) throw new Error(`bad ?hpgrow: ${params.get("hpgrow")}`);
  setQaHpGrow(g);
}
// QA: ?w0=<n> — §0.7 H1 곡선의 **면세 구간**(`ENEMY.hpGrowFrom`)을 갈아끼운다. `?hpgrow`와 **짝**이고
// (감독 #63 「사다리를 두 축으로 재야 한다」) 둘 다 **BALANCE 정본이 아니라 사다리용**이다.
// 1이면 면세가 없는 옛 곡선(`hpGrow^(w-1)`)이고, 61 이상이면 곡선이 통째로 꺼진다
if (params.has("w0")) {
  const w0 = Number(params.get("w0"));
  if (!Number.isInteger(w0) || w0 < 1) throw new Error(`bad ?w0: ${params.get("w0")}`);
  setQaHpGrowFrom(w0);
}
// QA: ?hpwlin=<n> — §0.9의 **선형** 성장 계수(`ENEMY.hpWaveLin`)를 갈아끼운다. `?hpgrow`·`?w0`과
// 같은 규약이고 **BALANCE 정본이 아니라 사다리용**이다(감독 #79 ②가 지정한 사다리 = 0.003/0.004/0.005).
// 0이면 §0.9 이전(면세 구간 19칸이 통째로 배수 1.0)으로 되돌린다 — A/B의 «끈» 쪽이 그것이다
if (params.has("hpwlin")) {
  const v = Number(params.get("hpwlin"));
  if (!(v >= 0) || !Number.isFinite(v)) throw new Error(`bad ?hpwlin: ${params.get("hpwlin")}`);
  setQaHpWaveLin(v);
}
// QA: ?early=<n> — §0.7-B 초반 완화 배수(`ENEMY.earlyMul`)를 **갈아끼운다**. 걸리는 구간
// (`ENEMY.earlyUntil` = 웨이브 1~6)은 안 움직인다 — 감독 #67이 구간을 못 박았고 배수만 실측 대상이다.
// **BALANCE 정본이 아니라 사다리용**이다(`?hpgrow`·`?w0`과 같은 규약). 1이면 완화 이전으로 되돌린다
if (params.has("early")) {
  const e = Number(params.get("early"));
  if (!(e > 0) || !Number.isFinite(e)) throw new Error(`bad ?early: ${params.get("early")}`);
  setQaEarlyMul(e);
}
// QA: ?tierfx=0 — §0.7 L(티어 이펙트 화려함)의 세 축(잔상·약협·착탄 링 + 착탄 크기)만 끈다.
// **판정은 한 자리도 안 움직인다**(연출 전용) — 쓸모는 같은 프레임의 컷 두 장을 `tools/img-diff.mjs`로
// 대면 「L이 화면에 더한 픽셀」이 «그것만» 세어진다는 것이다(`?gate=0`·`?event=0`과 같은 규약).
// ⚠ 색·굵기 단계(§0.6 G ⓑ)는 안 꺼진다 — 이 스위치가 끄는 것은 §0.7 L이 «더한» 축뿐이다
if (params.has("tierfx")) {
  const v = params.get("tierfx");
  if (v !== "0" && v !== "1") throw new Error(`bad ?tierfx: ${v}`);
  setQaTierFx(v === "1");
}
// QA: ?branch=a|b — T3 진화 분기(DESIGN §7.4)를 헤드리스에서 어느 쪽으로 고를지. 기본 a(= 표의 첫 갈래).
// 분기 화면도 카드·정차와 같은 **시간 정지**라 이 스위치가 없으면 첫 T3에서 런이 영영 멈춘다
// (`?card=`와 같은 부류다 — 정책값이지 BALANCE 정본이 아니다). **9 seed A/B의 유일한 손잡이**이기도 하다:
// 분기는 명목 DPS를 보존하므로(balance.ts BRANCHES 불변식) 두 갈래의 차이는 실효로만 나온다
const BRANCH_QA = params.get("branch") ?? "a";
if (BRANCH_QA !== "a" && BRANCH_QA !== "b") throw new Error(`bad ?branch: ${BRANCH_QA}`);
// QA: ?doc=a|b|0 — **열차 교리**(DESIGN §D1 ⓐ · balance.ts DOCTRINES). `?branch=`와 같은 부류이고
// 같은 이유로 있어야 한다(강제 2택 = 시간 정지라 손이 없으면 그 자리에서 런이 멈춘다).
// **`?doc=0`이 iter147 이전 기준선의 문이다** — 교리 화면 자체가 안 열려 옛 회귀 컷이 그대로 재현된다
// **`?doc=hold`은 시각 QA 전용**이다 — 화면은 열되 손을 안 댄다(교리 2택 컷을 찍는 유일한 방법:
// 자리가 「T3 분기를 고른 뒤」라 사람 손 없이는 그 프레임에 멈출 수가 없다)
// **`?doc=abb`꼴(단 수만큼의 a/b)이 «단별» 정책이다** — 세 단을 함께 고른 컷으로는 어느 단이
// 얼마나 기울었는지가 안 갈린다(iter148의 미실시 항목). 한 글자면 전 단 일괄, 여러 글자면 단별이다
const DOC_QA = params.get("doc") ?? "a";
if (!/^([ab]|[ab]{2,}|0|hold)$/.test(DOC_QA) || (DOC_QA.length > 1 && /^[ab]+$/.test(DOC_QA) && DOC_QA.length !== DOCTRINES.length))
  throw new Error(`bad ?doc: ${DOC_QA} (a|b|0|hold 또는 a/b ${DOCTRINES.length}글자)`);
/** 이 단에서 고를 갈래 (0 = ⓐ · 1 = ⓑ). 한 글자 정책은 전 단에 같은 글자를 적용한다 */
const docPick = (step: number): number => ((DOC_QA.length > 1 ? DOC_QA[step] : DOC_QA) === "b" ? 1 : 0);
// QA: ?docmult=aimed.crit=2.4 (쉼표로 여럿) — 교리 한 칸의 **배수**만 갈아 끼운다(balance.ts `docValueOf`).
// `?doc=`이 «갈래»의 손잡이라면 이것은 «배수»의 손잡이다 — §0.7-H ⓓ의 유도값(`aimed.crit` ≈ 2.8)을
// 실측 사다리로 확인하는 자리(`node tools/doc-ladder.mjs`). **BALANCE 정본이 아니다**
if (params.has("docmult")) {
  const raw = params.get("docmult")!;
  const keys = new Set<string>(DOCTRINES.flat().flatMap((d) => ["dmg", "rate", "crit", "drop", "speed", "collect"].map((k) => `${d.id}.${k}`)));
  const m: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [key, val] = part.split("=");
    const v = Number(val);
    if (!keys.has(key) || !(v > 0) || !Number.isFinite(v)) throw new Error(`bad ?docmult: ${part} (<교리id>.<dmg|rate|crit|drop|speed|collect>=<양수>)`);
    m[key] = v;
  }
  setQaDocMult(m);
}
// QA: ?gshift=<lv>[,<tier>] — **성장 축의 «몫»**을 갈아 끼운다(balance.ts `levelDmgStep` 외 3함수).
// 0 = 전량 발당 피해(= INBOX #74 ② «이전»의 정본 · 옛 컷의 문) · 1 = 전량 공속. 둘째 인자를 생략하면
// 레벨·티어에 같은 값이 걸린다. **총량(`levelStep`·`tierStep`)은 안 갈리므로 명목 DPS는 불변이고
// 갈리는 것은 «한 발의 크기»뿐이다** — 그것이 사다리의 축이다(`node tools/growth-ladder.mjs`).
// **BALANCE 정본이 아니라 사다리용**이다(`?docmult=`·`?drop=`과 같은 규약)
if (params.has("gshift")) {
  const parts = params.get("gshift")!.split(",").map(Number);
  const [lv, tier = lv] = parts;
  if (parts.length > 2 || ![lv, tier].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw new Error(`bad ?gshift: ${params.get("gshift")} (<0..1>[,<0..1>])`);
  setQaGrowthShift(lv, tier);
}
// QA: ?stop=<n> — 정차를 n웨이브마다 연다. **DESIGN §3 정본이 아니다**(정본 = 스테이지 사이 19회, `?corehp`와
// 같은 부류). 큐 1의 손잡이 ⓒ("정차를 웨이브 2개마다")를 **넣기 전에** 그 상한을 재는 A/B 전용이다
if (params.has("stop")) {
  const st = Number(params.get("stop"));
  if (!Number.isInteger(st) || st < 1) throw new Error(`bad ?stop: ${params.get("stop")}`);
  setQaStopEvery(st);
}
// QA A/B 2개 — 기본이 켜짐이고 **켜진 쪽이 정본**이다 (enemy.ts setQaMid 주석).
// ?mid=0 = 중간보스(3n) 끔 · ?card3=0 = 정차 직전 카드 끔(= 스테이지당 2회로 되돌림)
if (params.get("mid") === "0") setQaMid(false);
if (params.get("card3") === "0") setQaCard3(false);
// ?gate=0 = 관문 전면 정렬 진군 끔 (§0.6 C6 이전 = 사방에서 황금비 도약). 물량·중간보스 시점은 안 꺼진다
if (params.get("gate") === "0") setQaGate(false);
// ?ysort=0 = 적 깊이 정렬 끔 (iter95 이전 = f.list 순서 = 스폰 순서). **연출 전용 A/B**다 —
// 시뮬은 어느 쪽이든 같고, 갈리는 것은 probe `enemies.depth`와 화면의 겹침 순서뿐이다
if (params.get("ysort") === "0") setQaYSort(false);
// ?event=0 = 네크로맨서 이벤트 웨이브(20·40) 끔 (§0.7 K 이전 = 그 둘이 여느 웨이브).
// 켜진 쪽이 정본이고, 이 스위치는 **K의 몫을 완주·손실에서 따로 세는 유일한 손잡이**다
if (params.get("event") === "0") setQaEvent(false);
// QA: ?horde=<n> — 이벤트 관문(18·36)의 1차 물량 배수(§0.7-G `NECRO.hordeMul`)를 대체한다.
// `?raisecap=`과 짝으로 돌린다 — 둘이 같은 웨이브의 총량에 함께 얹힌다
if (params.has("horde")) {
  const h = Number(params.get("horde"));
  if (!(h > 0) || h > 4) throw new Error(`bad ?horde: ${params.get("horde")}`);
  setQaHorde(h);
}

/** 지금 편성에서 **재장비 가능한 칸들의 수수료 중앙값** (감독 #72 ⑥). 칸마다 투자액이 다르므로
 * 「수수료가 얼마인가」를 한 수로 말하려면 중앙값이 필요하다. 대상이 없으면 0 */
function refitMedian(): number {
  const f = train.cars.filter(refitable).map(refitFee).sort((a, b) => a - b);
  return f.length ? f[Math.floor((f.length - 1) / 2)] : 0;
}

/** 정차 장부(shop.log)의 열림 쪽을 적는다. 정차는 시간 정지라 update()가 매 프레임 이 분기에 들어오므로,
 * "아직 이번 정차의 항목이 없을 때"만 적는다 = 열린 프레임 1회 */
function openStationLog(): void {
  if (shop.log.length && shop.log[shop.log.length - 1].scrapOut < 0) return;
  shop.log.push({
    stage: WAVES[field.waveIdx].stage,
    t: +field.t.toFixed(1),
    scrapIn: +combat.scrap.toFixed(1),
    carsIn: train.cars.length,
    dpsIn: +trainDps(train).toFixed(1),
    coreIn: +combat.coreHp.toFixed(1),
    spent: 0,
    repaired: 0,
    // 재장비 수수료의 중앙값 (감독 #72 ⑥ · `SHOP.refitFee`) — 「수수료가 이 정차 수입의 몇 %인가」의 실측값
    refitMed: refitMedian(),
    scrapOut: -1,
    carsOut: 0,
    dpsOut: 0,
  });
}
/** 웨이브 장부 (큐 1 — 스테이지 1~3의 성장 속도). 정차 장부(shop.log)는 **스테이지당 1행**이라
 * "칸 1개(120)를 몇 웨이브 만에 버는가"를 못 잰다 — 스테이지 안의 3웨이브가 한 덩어리로 뭉친다.
 * 웨이브가 도는 첫 프레임에 스냅샷 1행을 남기고, **이웃 두 행의 차분**이 그 웨이브의 수입·코어 손실이다
 * (정차 지출은 shop.log와 대조해 빼면 갈린다 — `scrap`은 지출 후 잔액, `collected`는 누적 회수라
 * 수입 축은 `collected` 차분으로 보는 것이 지출과 무관하다).
 * **마지막 웨이브의 차분은 여기 없다** — 런이 끝나는 시점의 값은 probe 본체(`shop.*`·`combat.*`)가
 * 그 순간의 스냅샷이므로 그것과의 차분으로 본다 */
const waveLog: { w: number; stage: number; t: number; len: number; collected: number; scrap: number; cars: number; dps: number; coreHp: number }[] = [];
function logWave(): void {
  if (waveLog.length && waveLog[waveLog.length - 1].w === field.waveIdx + 1) return;
  waveLog.push({
    w: field.waveIdx + 1,
    stage: WAVES[field.waveIdx].stage,
    t: +field.t.toFixed(1),
    // **웨이브 길이 정본**(§1 60~75초). 이웃 두 행의 `t` 차분과 이 값이 「웨이브 정체」의 판정선이다
    // (INBOX #78 ④ — `실제 > len × 2`인 웨이브가 하나라도 있으면 그 눈금은 사다리에서 탈락)
    len: WAVES[field.waveIdx].len,
    collected: +combat.collected.toFixed(1),
    scrap: +combat.scrap.toFixed(1),
    cars: train.cars.length,
    dps: +trainDps(train).toFixed(1),
    coreHp: +combat.coreHp.toFixed(1),
  });
}
/** 자동 저장 (DESIGN §10 2차). **정차를 연 프레임 1회만** 쓴다 — 정차는 시간 정지라 update()가 매
 * 프레임 이 분기에 들어오고, 그때마다 직렬화하면 60Hz로 localStorage를 두드리게 된다.
 * 웨이브 인덱스로 중복을 막는 것은 openStationLog()와 같은 방식이다 */
let savedWave = -1;
let saveWrites = 0;
let saveOk = true;
let saveCleared = false;
let savedCheckpoint = RESUMED?.checkpoint ?? "start";
let checkpointLabel = RESUMED ? `웨이브 ${RESUMED.waveIdx + 1}${RESUMED.checkpoint === "station" ? " 종료 정차" : " 시작"}` : "웨이브 1 시작";
function autoSave(force = false): void {
  if (!SAVE_ON || (!force && savedWave === field.waveIdx)) return;
  savedWave = field.waveIdx;
  saveWrites++;
  saveOk = writeSave(snapshot(map, field, train, combat, cards, SEED, retries, MAP_PIN, RESUMED?.migrated, shop.refits));
  if (saveOk) { savedCheckpoint = "station"; checkpointLabel = `웨이브 ${field.waveIdx+1} 종료 정차`; }
  shop.note = saveOk ? "안전 체크포인트 저장됨" : "저장 실패 · 이전 체크포인트 유지";
}

/** 전투 중에는 마지막 안전 체크포인트를 보존한다. */
function exitToHome(): void {
  if (field.station) autoSave(true);
  location.href = location.pathname;
}

/** 정차를 해제한다 = 상점의 「출발」. 장부의 닫힘 쪽도 여기서 적는다 (출구가 이 함수 하나뿐이다) */
function departStation(): void {
  if (!field.station) return;
  autoSave(true);
  playSound("depart");
  const e = shop.log[shop.log.length - 1];
  if (e && e.scrapOut < 0) {
    e.spent = shop.spent;
    e.repaired = +shop.repaired.toFixed(1);
    e.scrapOut = +combat.scrap.toFixed(1);
    e.carsOut = train.cars.length;
    e.dpsOut = +trainDps(train).toFixed(1);
  }
  shop.spent = 0;
  shop.repaired = 0;
  shop.note = "";
  // 재장비는 **정차 1회당 `SHOP.refitPerStation`칸**이다 — 「출발」이 그 카운터의 유일한 리셋 자리다
  shop.refits = 0;
  shop.pick = null;
  depart(field);
  // QA `?stop=`이 스테이지 **안**에 끼운 정차는 스테이지 전환이 아니다 — 지형 보충을 하면 안 된다.
  // depart()가 그 경우에만 카드를 열어 두므로 이 한 줄이 두 경우를 가른다
  if (field.card) return;
  // **런 중 맵 전환** (DESIGN §0.7 O ⓑ · `BALANCE.ROUTE` · 감독 #72 ③) — 웨이브 18 종료 정차에서
  // 평원 → 도시. **여기가 유일한 자리다**: 정차는 시간 정지이고 필드가 비어 있다는 것이 정차 조건
  // 자체라(save.ts 머리말) 갈아 낀 판 위에 적·투사체가 얹혀 있을 일이 없다
  const stage = WAVES[field.waveIdx].stage;
  const switched = !MAP_PIN && routeMapOf(stage) !== map.id;
  if (switched) applyMapSwitch(routeMapOf(stage), stage);
  // 새 스테이지 시작 = 파괴 가능 지형지물 3~4개 보충 (DESIGN §4.2). 정차 해제가 스테이지 전환의
  // 유일한 출구라 여기 하나면 된다. 플로우필드는 지형이 바뀌었으니 다음 프레임에 다시 굽는다.
  // **맵이 갈린 정차는 «보충»이 아니라 «새 구역의 초기 채움»이다**(`fresh`) — 갈아 낀 판에는
  // 플레이트 고정 성벽뿐이라 3~4개만 얹으면 도시가 8장으로 시작한다(정본 `start 20`)
  const add = stageTerrain(map, stage, switched);
  terrainWants.push(add.want);
  terrainAdds.push(add.placed);
  combat.terrainDirty = true;
}

/** 맵 전환 이력 (probe `map.switches`). **드랍 검산의 분모이기도 하다** — 드랍 가치가 맵마다
 *  갈리므로(평원 0.21 · 도시 0.30) `drops.expected`를 한 값으로 재구성하면 전환 뒤로 검산이 깨진다.
 *  그래서 전환 순간의 **누적 처치 스냅샷**을 함께 싣고, probe가 구간별 차분으로 다시 센다*/
const mapSwitches: { stage: number; wave: number; t: number; from: MapId; to: MapId; drop: number; killsAt: Record<string, number> }[] = [];

/** 맵을 갈아 끼운다 (`switchMap`) + **함께 갱신해야 하는 넷**. map.ts가 지형·플레이트 사각형만
 *  갈므로 나머지는 여기서 잇는다 — 하나라도 빠지면 «옛 맵의 규칙으로 도는 새 판»이 된다:
 *   ① `combat`의 맵 규칙 사본(드랍 가치·지형 사격·2단 파괴·적 철거) ② 플로우필드(`terrainDirty`)
 *   ③ 배경(`loadPlate` → `buildBackground`) ④ 언덕 수(§4.5 관측칸의 해금 조건) */
function applyMapSwitch(to: MapId, stage: number): void {
  mapSwitches.push({
    stage,
    wave: field.waveIdx + 1,
    t: +field.t.toFixed(1),
    from: map.id,
    to,
    drop: combat.dropValue,
    killsAt: { ...combat.killsByKind },
  });
  switchMap(map, to, SEED);
  combat.dropValue = dropValueOf(map.id);
  combat.shootTerrain = MAPS[map.id].shootTerrain;
  combat.twoStage = twoStageOf(map.id);
  combat.enemyBreaks = MAPS[map.id].enemyBreaks;
  combat.terrainDirty = true;
  // 언덕은 맵의 고정 지형이라 판이 갈리면 수가 갈린다(도시는 0) — `?hills=`가 있으면 그 값이 이긴다
  if (!params.has("hills")) setMapHills(map.terrain.filter((t) => t.kind === "hill").length);
  // **배경은 다시 굽는다.** 그림은 정차가 열릴 때 미리 받아 뒀으므로(`prefetchNextPlate`) 여기서는
  // 이미 디코드된 그림을 다시 굽기만 한다 — 그래도 실패할 수 있는 경로라(첫 프레임 전환·캐시 밖)
  // 받기를 한 번 더 걸고 그 뒤에 굽는다. 못 받으면 옛 그림이 남지만 시뮬은 새 맵으로 돈다
  void loadPlate(MAPS[map.id].plate).then(() => buildBackground(map, SEED));
}

/** 다음 정차에서 맵이 갈린다면 **그 그림을 지금 받아 둔다** (§0.7 O ⓑ 전환 연출). 정차는 시간
 *  정지라 플레이어가 상점을 보는 동안 1.1MB를 받을 시간이 넉넉하고, 「출발」에서 배경 굽기가
 *  즉시 끝난다 — 안 받아 두면 전환 직후 몇 프레임이 «옛 배경 + 새 지형»으로 그려진다.
 *  `loadPlate`는 모듈의 그림 한 장을 갈아 끼울 뿐이고 **배경은 `buildBackground`가 굽는 것**이라,
 *  미리 받아도 화면은 안 바뀐다 */
/** 처치가 떨군 **스크랩 기대액** — 드랍 가치가 맵마다 갈리므로(§0.7 O ⓑ · 평원 0.21 · 도시 0.30)
 *  **구간별 차분**으로 센다. 한 값으로 재구성하면 전환 뒤로 `drops.balanceErr`가 통째로 거짓이 된다.
 *  마지막 구간은 지금 돌고 있는 맵이라 살아 있는 `killsByKind`를 그대로 본다.
 *  ⚠ 이 식은 **`combat`과 무관한 재구성**이어야 한다(검산의 독립성) — 그래서 처치 수·종별 스크랩
 *  표에서 다시 세고, `combat`에서 가져오는 것은 「구간이 언제 갈렸나」의 스냅샷뿐이다 */
function killScrapByLeg(): number {
  let sum = 0;
  let prev: Record<string, number> = {};
  const legs = [...mapSwitches.map((m) => ({ drop: m.drop, kills: m.killsAt })), { drop: combat.dropValue, kills: combat.killsByKind }];
  for (const leg of legs) {
    for (const [k, n] of Object.entries(leg.kills)) {
      const d = n - (prev[k] ?? 0);
      sum += d * ENEMY_STATS[k].scrap * (isBossKind(k) || isMidKind(k) ? 1 : leg.drop);
    }
    prev = leg.kills;
  }
  return sum;
}

/** **이 정차의 「출발」이 데려갈 다음 구역** — 맵이 안 갈리면 null (상점 제목 옆 한 줄의 조건).
 *  `departStation`이 전환을 판단하는 식과 **같은 식**이어야 한다: 다음 스테이지의 경로 맵이
 *  지금 맵과 다른가. 마지막 정차 다음에도 스테이지가 있으므로 범위 밖 걱정은 없다 */
function stationNextMap(): MapId | null {
  if (MAP_PIN) return null;
  const to = routeMapOf(WAVES[field.waveIdx].stage + 1);
  return to === map.id ? null : to;
}

let prefetchedWave = -1;
function prefetchNextPlate(): void {
  if (MAP_PIN || prefetchedWave === field.waveIdx) return;
  prefetchedWave = field.waveIdx;
  const to = routeMapOf(WAVES[field.waveIdx].stage + 1);
  if (to !== map.id) void loadPlate(MAPS[to].plate);
}

const cards = makeCards(SEED);
// 이어하기 복원 (save.ts applySave). **여기가 자리인 이유**: 스냅샷이 편성·카드·전투 상태를 한꺼번에
// 덮으므로 그 셋이 다 만들어진 뒤여야 하고, ?cars=·?lvl=·?tier= 같은 QA 편성 스위치보다 뒤여야
// "저장이 최종 상태"가 된다. 지형 파괴 상태가 얹혔으니 플로우필드는 다음 프레임에 다시 굽는다
const RESUME_TERRAIN = RESUMED ? applySave(RESUMED, map, field, train, combat, cards) : false;
if (RESUMED) {
  combat.terrainDirty = true;
  shop.refits = RESUMED.stationRefits ?? 0;
  if (SAVE_ON) { saveWrites++; saveOk = writeSave({ ...RESUMED, retries }); }
}

// QA: ?card=skip|auto — 카드도 정차와 같은 **시간 정지**라(DESIGN §7.2) 헤드리스 런은 첫 웨이브 전환
// (≈60초)에서 영영 멈춘다. 값이 없으면 `?shop`의 값을 그대로 쓴다 — 스테이지 경계를 넘는 QA 런은
// 이미 ?shop을 주고 있고, 카드용 스위치를 따로 요구하면 "수치가 조용히 안 늘어난다"가 다시 생긴다.
//  · skip = 아무것도 고르지 않고 진행 (카드 도입 전과 같은 회귀 기준선)
//  · auto = 제시된 첫 장을 고른다 (재현 가능한 성장 기준선 — 최적해가 아니다)
//  · hand = 빈 자리가 있으면 **새 무기 칸을 먼저**, 아니면 best와 같다 (iter57에서 A/B로 확정한 기준선)
//  · best = 제시 3장 중 **명목 DPS 증가분이 가장 큰 것**을 고른다 (사람이 화력을 우선하는 손의 대역).
//    `auto`(첫 장)와의 A/B가 "초반 관문이 카드 **운**인가 카드 **규칙**인가"를 가르는 유일한 대조 컷이다 —
//    auto는 40%(support 0.15 + trait 0.25) 확률로 화력 0인 카드를 집는다. **정책값이지 BALANCE 정본이 아니다**
//  **`?shop=auto`가 상속하는 기본값은 `auto`가 아니라 `hand`다**(iter57 A/B). `auto`는 40% 확률로
//  화력 0인 카드를 집어 수집칸을 5장까지 쌓으므로 **사람의 손의 하한**이지 기준선이 아니다 —
//  9 seed 풀런이 auto 4/9 · best 6/9 · hand 8/9(후퇴 0)로 갈렸다. 옛 표와 비교하려면 `?card=auto`를 준다
const CARD_QA = params.get("card") ?? (SHOP_QA === "auto" ? "hand" : SHOP_QA);
// QA: ?maxcars=<n> — **자동 조종의 칸 상한**만 갈아끼운다(기본 = `TRAIN.maxCars` 12 = BALANCE 정본).
// 왜 필요했나: BALANCE §0.6/§0.7 불변식 3(보스전 창 12~25초)의 문면이 **"기준 편성 8~9칸 + 상점 강화"**인데
// `?shop=auto` 풀런은 12칸 T3로 끝난다(`autoSpend`의 targetCars는 9지만 **카드가 빈 자리를 계속 채운다**).
// 그렇다고 `?card=skip`으로 카드를 끄면 편성이 4칸에서 멈춰 **웨이브 2에 죽는다**(iter122 실측) — 카드는
// §7.2의 무료 성장 트랙이라 끄는 것이 "기준 편성"이 아니다. 이 손잡이는 **카드·상점 둘 다에 같은 상한**을
// 물려 「9칸 + 강화」를 실제 런에서 만드는 유일한 경로다. **정책값이지 BALANCE 정본이 아니다**(`?repair`·`?sup`과 같은 부류)
// QA: ?carcap=<n> — **구간별 편성 상한 표**(`TRAIN.carCapByStage`)를 평평한 n으로 갈아끼운다.
// `?maxcars`(정책값 · 표 «위»에 min으로 걸린다)와 규약이 다르다 — 이쪽은 표 «자체»의 대체다.
// 표가 5차 성장 곡선의 손잡이라 이 손잡이가 없으면 「표의 몫」과 「보스·예산의 몫」이 한 컷에서 안 갈린다
if (params.has("carcap")) {
  const cc = Number(params.get("carcap"));
  if (!Number.isInteger(cc) || cc < 1 || cc > TRAIN.maxCars) throw new Error(`bad ?carcap: ${params.get("carcap")} (1..${TRAIN.maxCars})`);
  setQaCarCap(cc);
}

const MAX_CARS = (() => {
  if (!params.has("maxcars")) return TRAIN.maxCars;
  const v = Number(params.get("maxcars"));
  if (!Number.isInteger(v) || v < 1 || v > TRAIN.maxCars) throw new Error(`bad ?maxcars: ${params.get("maxcars")} (1..${TRAIN.maxCars})`);
  return v;
})();
/** `?card=best`의 점수 = 그 카드가 지금 당장 올리는 명목 DPS. 티어 진행은 완성되는 장에서만 값이
 * 붙으므로 미완성분은 `tierDmg / tierCards`로 안분한다(안 그러면 1장째를 영원히 안 고른다).
 * 지원·특성 카드는 0이다 — 화력이 아니라는 것이 이 대조 컷의 요점이다 */
function cardGain(card: Card): number {
  if (card.pool !== "weapon") return 0;
  const t = tierOf(train, card.kind);
  if (t === 0) return train.cars.length < MAX_CARS ? WEAPONS[card.kind].dmg * WEAPONS[card.kind].rate : 0;
  const own = train.cars.reduce((a, c) => a + (c.kind === card.kind ? dpsOf(c) : 0), 0);
  const p = (cards.prog[card.kind] ?? 0) + 1;
  return p >= CARDS.tierCards ? own * CARDS.tierStep : (own * CARDS.tierStep) / CARDS.tierCards;
}
/** `?card=hand`의 선택 = **빈 자리가 있으면 새 무기 칸을 먼저, 아니면 `best`와 같다**.
 * `best`(즉시 명목 DPS)는 초반 몇 장 만에 보유 무기의 DPS 합이 커져 티어 안분값이 새 칸의 명목을
 * 앞지르고, 그 뒤로 **칸이 영영 안 는다**(iter57 실측: seed 5가 12칸 상한 대신 6칸에서 웨이브 6 사망).
 * `auto`(첫 장)는 반대로 40% 확률의 무작위라 수집칸을 5장까지 쌓는다. 사람의 손은 둘 다 아니다 —
 * "빈 자리는 무기로 채우고 그 다음에 티어를 올린다"가 이 대역이고, 수집칸은 상점이 채운다 */
function handPick(offer: Card[]): Card {
  const fresh = offer.filter((c) => c.pool === "weapon" && tierOf(train, c.kind) === 0);
  const pool = fresh.length && train.cars.length < MAX_CARS ? fresh : offer;
  return pool.reduce((a, c) => (cardGain(c) > cardGain(a) ? c : a));
}
/** 무기별 티어 도달 시각 (DESIGN §10 1.5차 검증 3축 중 "티어 도달 시점").
 * 카드가 티어를 올리는 유일한 경로라 pickCard의 전후 비교로 잡는다 (BALANCE §0 원칙 3).
 * **`tier: 1`은 티어업이 아니라 그 무기의 최초 획득이다** — `tierOf`가 해당 칸이 없으면 0을 내므로
 * 0 → 1 전이가 "카드로 그 무기를 처음 받은 시각"이 된다. §0 원칙 3의 판정 대상은 2·3이다 */
const tierUps: { kind: string; tier: number; t: number; wave: number }[] = [];
/** 카드 장부 (큐 1 — 초반 관문). `cards.taken`은 라벨 배열이라 **몇 번째 웨이브의 카드인지**와
 * **무엇을 마다했는지**가 안 남는다. 초반 관문의 판정("완주 seed와 죽는 seed가 카드에서 갈리는가")은
 * 제시 3장 전부와 그 자리의 편성이 있어야 서므로, 고른 프레임에 1행을 남긴다.
 * `offer`·`took`는 **적용 전** 라벨이고(적용 후에는 티어가 올라 라벨이 달라진다), `cars`·`dps`는 적용 **후**다 */
const cardLog: { w: number; stage: number; t: number; offer: string[]; took: string; cars: number; dps: number }[] = [];
/** **열차 교리 장부** (§D1 ⓐ). 「몇 단을 언제 골랐나」가 이 축의 유일한 자리 지표다 —
 * 교리가 T3에 물려 있어(pendingDoctrine) **자리가 곡선이 아니라 편성에서 나오기 때문**이다.
 * `dps`는 적용 **후**라 「이 교리가 그 자리에서 화력을 얼마나 밀었나」가 앞 행과의 차로 읽힌다 */
const docLog: { w: number; stage: number; t: number; step: number; offer: string[]; took: string; dps: number }[] = [];
/** 카드 1장을 고른다 = 효과 적용 + 다음 웨이브 개시 */
function pickCard(card: Card): void {
  if (!field.card || !cards.offer.includes(card)) return;
  const before = Object.fromEntries(CAR_KINDS.map((k) => [k, tierOf(train, k)]));
  const offer = cards.offer.map((c) => cardLabel(train, c));
  const took = cardLabel(train, card);
  applyCard(cards, card, train, combat);
  cardLog.push({
    w: field.waveIdx + 1,
    stage: WAVES[field.waveIdx].stage,
    t: +field.t.toFixed(1),
    offer,
    took,
    cars: train.cars.length,
    dps: +trainDps(train).toFixed(1),
  });
  for (const k of CAR_KINDS) {
    const t = tierOf(train, k);
    if (t > (before[k] ?? 0)) tierUps.push({ kind: k, tier: t, t: +field.t.toFixed(1), wave: field.waveIdx + 1 });
  }
  cards.offer = [];
  pickedCard(field);
}
/** **T3 진화 분기 1개를 고른다** (DESIGN §7.4). 카드와 달리 웨이브를 열지 않는다 —
 * §7의 카드 자리를 쓰지 않으므로(cards.ts rollBranch) 화면만 닫고 멈췄던 시간이 다시 흐른다.
 * 남은 분기가 또 있으면 다음 프레임에 그 무기의 화면이 이어서 열린다 */
function pickBranch(card: Card): void {
  if (!field.branch || !cards.offer.includes(card)) return;
  // 장부(`cards.taken`)는 applyCard가 남긴다 — 카드와 같은 경로다
  applyCard(cards, card, train, combat);
  cards.offer = [];
  field.branch = false;
}
/** **다음에 열릴 열차 교리의 단**(0-based, 없으면 −1). 조건은 둘뿐이다 —
 * ⓐ 표에 남은 단이 있을 것 ⓑ **T3 분기를 고른 무기 수**가 이미 고른 교리 수보다 많을 것.
 * 「T3 이후」(§D1 ⓐ)를 기계로 옮긴 것이 ⓑ이고, `pendingBranch`와 같이 **상태를 안 들고 편성에서
 * 유도한다** — 카드 티어업·상점 티어업·`?tier=3`·세이브 복원이 전부 같은 자리로 들어온다 */
function pendingDoctrine(): number {
  if (DOC_QA === "0") return -1;
  const step = combat.doctrines.length;
  if (step >= DOCTRINES.length) return -1;
  const kinds = new Set(train.cars.filter((c) => c.branch).map((c) => c.kind));
  return kinds.size > step ? step : -1;
}
/** **열차 교리 1단을 고른다.** `pickBranch`와 같은 자리·같은 문법이다 (웨이브를 안 연다) */
function pickDoctrine(card: Card): void {
  if (!field.doctrine || !cards.offer.includes(card)) return;
  const offer = cards.offer.map((c) => cardLabel(train, c));
  const took = cardLabel(train, card);
  applyCard(cards, card, train, combat);
  docLog.push({
    w: field.waveIdx + 1,
    stage: WAVES[field.waveIdx].stage,
    t: +field.t.toFixed(1),
    step: card.pool === "doctrine" ? card.step + 1 : 0,
    offer,
    took,
    dps: +trainDps(train, combat.pass).toFixed(1),
  });
  cards.offer = [];
  field.doctrine = false;
}
/** 아무것도 고르지 않고 넘긴다 (QA 전용 — 게임 화면에는 이 출구가 없다) */
function skipCard(): void {
  cards.offer = [];
  pickedCard(field);
}
// QA: ?strike=wall|mob — 조준 포격은 플레이어의 클릭이라 헤드리스에는 발사원이 없다.
// 쿨다운이 돌 때마다 자동 조준시켜 착탄·철거·플로우필드 재계산 경로를 검증한다 (iter6의 ?demolish 대체)
const STRIKE = params.get("strike");
function qaAim(): { x: number; y: number } | null {
  if (STRIKE === "wall") {
    return map.terrain.find((t) => t.kind === "wall" && !t.destroyed) ?? null;
  }
  // **폭발 지물을 조준한다** (§0.7 J1-c ⓒ 「조준 포격의 세 번째 용도」). 이 지물은 사선을 안 막아
  // 직사 표적이 되지 않으므로 **포격 말고는 때릴 손이 없다** — 헤드리스에서 그 손의 대역이 이것이다.
  // 살아 있는 탱크가 없으면 null이라 포격이 아예 안 나간다(맵에 없는 컷에서 헛방을 안 친다)
  if (STRIKE === "fuel") {
    return map.terrain.find((t) => explosive(t.kind) && !t.destroyed) ?? null;
  }
  if (STRIKE === "mob") {
    // 가장 밀집한 적 = 착탄 반경 안 이웃이 가장 많은 적
    const r = ARTILLERY.radius * combat.unit;
    let best = null;
    let bn = 0;
    for (const e of field.list) {
      const n = field.list.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) <= r).length;
      if (n > bn) {
        bn = n;
        best = e;
      }
    }
    return best;
  }
  return null;
}
// QA: ?defuse=<초> — 폭탄 해체도 **플레이어의 클릭**이라 헤드리스에는 누를 손이 없다(`?strike`와 같은 이유).
// 이 간격마다 «도화선이 가장 짧은 폭탄»을 한 발씩 누른다 = 사람이 급한 것부터 끄는 순서다.
// **BALANCE 정본이 아니다** — 해체 경로가 실제로 도는지를 재는 대역일 뿐이다
const DEFUSE_SEC = params.has("defuse") ? Number(params.get("defuse")) : 0;
if (params.has("defuse") && (!Number.isFinite(DEFUSE_SEC) || DEFUSE_SEC <= 0)) {
  throw new Error(`bad ?defuse: ${params.get("defuse")}`);
}
let defuseCd = 0;

// 카메라: 코어 고정 + 맵 배율만큼 줌아웃 → 맵 전체가 화면에 들어온다 (§5.0)
const CAM = VIEW.w / map.w;

let frame = 0;
let simT = RESUMED?.t ?? 0;
const DT = 1 / 60;

function update(dt: number) {
  // **구간별 편성 상한**(감독 #72 ② `TRAIN.carCapByStage`)을 이번 프레임의 스테이지로 갱신한다.
  // 상점·카드·HUD 셋이 `carCap()` 하나만 읽으므로 문은 여기 한 곳이다. `?maxcars=`(QA)는 그 위에
  // 다시 걸린다 — 둘 중 **작은 값**이 실제 상한이다(둘은 목적이 다르다: 표는 곡선, QA는 대조 컷)
  setCarCap(Math.min(MAX_CARS, carCapAt(WAVES[field.waveIdx].stage)));
  // 런 종료 = 시뮬 정지. 패배(코어 0)와 클리어(마지막 웨이브 전멸 = 보스 처치) 둘 다 여기서 멈춘다 —
  // 멈춰야 종료 화면의 통계(경과 시간·처치 수)가 그 순간의 값으로 고정된다
  if (combat.over || field.cleared) {
    // 런이 끝났으면 이어하기 저장은 무효다 — 안 지우면 다음 방문이 죽은 런의 정차로 되돌아간다
    if (SAVE_ON && !saveCleared) {
      saveCleared = true;
      clearSave();
    }
    // **랭킹 기록은 런당 한 줄** (§0.7 N · 감독 #67 ④). 종료 프레임에 한 번 남긴다 — `rank.my`가
    // 곧 「이미 남겼다」의 표식이고, 종료 화면의 판이 «내 줄»을 짚는 키이기도 하다.
    // 메인 화면의 데모는 런이 아니라 기록을 안 남긴다(MENU에서는 combat.over가 강제로 false지만
    // 클리어 쪽은 그 방어가 없다 — 뜻을 조건에 적어 둔다)
    if (!MENU && !rank.my) rank.my = submitRun({ wave: endWave(), retries, kills: combat.kills, map: map.id });
    // **엔드 씬** (DESIGN §0.7 M · 감독 #67 ③). 정본 ①「열차와 몬스터가 모두 멈춘다 — 이동도
    // 공격도 전부」는 **이 조기 반환 자체**다(정차 상점 §3 · 카드 §7.2와 같은 부류의 정지 상태) —
    // 그 위에 흐르는 것은 연출의 시계 하나뿐이다. **패배 전용이다**: 클리어는 코어가 멀쩡하므로
    // 부술 것이 없고, 그쪽은 지금까지대로 결과화면이 바로 뜬다
    if (combat.over && combat.endT < END_SCENE_SEC) combat.endT += dt;
    return;
  }
  if (field.station) {
    // 정차 = 시간 정지 (DESIGN §3). QA 스위치가 있으면 그 자리에서 처리하고 바로 출발한다
    openStationLog();
    autoSave();
    prefetchNextPlate();
    if (SHOP_QA === "auto")
      autoSpend(shop, train, combat, REPAIR_FLOOR, Math.min(AUTO_TARGET_CARS, MAX_CARS), SAVE_FOR_CAR, REPAIR_MARGIN, RESERVE_CAR, REPAIR_SCALE, REPAIR_ABS, SUPPORT_PLAN, PASSIVE_ON);
    if (SHOP_QA === "repair") autoRepair(shop, combat, 1);
    if (SHOP_QA) departStation();
    return;
  }
  // **T3 진화 분기** (DESIGN §7.4). 상태를 따로 안 들고 편성에서 유도한다 — 카드 티어업·상점
  // 티어업·`?tier=3`·세이브 복원이 전부 같은 자리로 들어온다(train.ts pendingBranch).
  // 정차 뒤에 두는 이유: 상점에서 산 티어업은 「출발」 다음 프레임에 물어야 한다(상점 위에 겹치지 않는다)
  const evoKind = pendingBranch(train);
  // 이미 **제시가 끝난 카드 화면 위에는 겹치지 않는다** — 겹치면 그 제시가 버려지고 다시 뽑히면서
  // `cards.offered`(§7 카드 자리의 검산값)가 두 번 올라간다. 고른 다음 프레임에 열면 그만이다
  if (evoKind && !field.branch && !(field.card && cards.offer.length)) {
    field.branch = true;
    rollBranch(cards, evoKind);
  }
  if (field.branch) {
    if (cards.offer.length === 0 && evoKind) rollBranch(cards, evoKind);
    // 카드와 같은 이유로 헤드리스에는 손이 없다 — `?branch=a|b`가 그 대역이다
    if (CARD_QA && cards.offer.length) pickBranch(cards.offer[BRANCH_QA === "b" ? 1 : 0] ?? cards.offer[0]);
    return;
  }
  // **열차 교리** (DESIGN §D1 ⓐ · 감독 #72 ⑦). 분기와 같은 자리·같은 문법이고 **분기 뒤**다 —
  // 다음 단의 조건이 「T3 분기를 고른 무기 수」라 그 프레임의 분기를 먼저 닫아야 수가 맞다
  const docStep = pendingDoctrine();
  if (docStep >= 0 && !field.doctrine && !(field.card && cards.offer.length)) {
    field.doctrine = true;
    rollDoctrine(cards, docStep);
  }
  if (field.doctrine) {
    if (cards.offer.length === 0 && docStep >= 0) rollDoctrine(cards, docStep);
    if (CARD_QA && DOC_QA !== "hold" && cards.offer.length) pickDoctrine(cards.offer[docPick(docStep)] ?? cards.offer[0]);
    return;
  }
  if (field.card) {
    // 선택 카드 = 시간 정지 (DESIGN §7.2). 제시는 여기서 한 번만 — offer가 비어 있는 프레임이 곧 개시다
    if (cards.offer.length === 0) rollOffer(cards, train, carCap());
    if (CARD_QA === "best" && cards.offer.length)
      pickCard(cards.offer.reduce((a, c) => (cardGain(c) > cardGain(a) ? c : a)));
    else if (CARD_QA === "hand" && cards.offer.length) pickCard(handPick(cards.offer));
    else if (CARD_QA === "auto" && cards.offer.length) pickCard(cards.offer[0]);
    else if (CARD_QA) skipCard();
    return;
  }
  // 웨이브가 실제로 도는 첫 프레임 = 장부 1행 (정차·카드 분기를 지난 뒤라 시간 정지 중에는 안 찍힌다)
  logWave();
  simT += dt;
  if (STRIKE) {
    const p = qaAim();
    // ?strike는 "플레이어의 손"의 대역이다 — 커서(combat.aim)도 같은 점을 잡아야
    // 주포 포탑이 표적이 아니라 **조준점**을 향하는 경로(큐 1)를 헤드리스에서 잴 수 있다.
    // 판정에는 영향이 없다(aim은 조준원 렌더와 포탑 각도만 읽는다)
    combat.aim = p;
    if (p && combat.artCd <= 0) callStrike(combat, p.x, p.y);
  }
  if (DEFUSE_SEC > 0 && (defuseCd -= dt) <= 0) {
    let b: { x: number; y: number; fuseT: number } | null = null;
    for (const e of field.list) {
      if (!ENEMY_STATS[e.kind].fuse) continue;
      if (!b || e.fuseT < b.fuseT) b = e;
    }
    if (b && defuseBomb(field, b.x, b.y)) defuseCd = DEFUSE_SEC;
  }
  updateTrain(train, dt);
  updateField(field, dt, map, flow, train, swimFlow);
  updateCombat(combat, dt, map, train, field);
  // 포탑 선회는 **판정 뒤**에 돈다 — 이번 프레임에 죽은 적을 표적으로 잡고 그쪽을 보는 일이 없다
  updateTurrets(combat, dt, train, field);
  // 지형 파괴 → 플로우필드 실시간 재계산 (§4.2). 적 무리가 새로 열린 길로 쏟아진다
  if (combat.terrainDirty) {
    combat.terrainDirty = false;
    flow = buildFlow(map);
    swimFlow = buildFlow(map, true);
    flowBuilds++;
  }
}

// Active-frame work = all catch-up simulation steps + audio + rendering in one sample.
// Warm/update and render-only timings remain diagnostic; frozen scenes cannot pass the FPS gate.
const PERF_N = 180;
const perfUpdate: number[] = [];
const perfRender: number[] = [];
const perfGap: number[] = [];
const perfFrame: number[] = [];
let perfLongFrames = 0;
let perfFrameCount = 0;
let perfLast = 0;
function perfPush(a: number[], v: number): void {
  a.push(v);
  if (a.length > PERF_N) a.shift();
}
function perfPct(a: number[], p: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
}
/** update 한 프레임 + 소요 시간 적립. warm 루프와 tick이 둘 다 이 경로로 돈다 */
function step(dt: number): void {
  const t0 = performance.now();
  update(dt);
  // **데모 규약 (§0.7 I "판정 없이")** — 메인 화면의 배경은 지지 않는다: 코어는 안 깎이고
  // 런은 안 끝난다. 시뮬 자체는 그대로 돌아야 «라이브»가 된다(주행·사격·접근이 전부 그 산물이다).
  // 코어 피해의 경로가 넷이라(잡몹 갉기·보스 점타·자폭·설치 폭탄) 입구를 하나씩 막는 대신
  // **결과를 한 자리에서 되돌린다** — 새 분기가 늘어도 이 한 줄이 계속 성립한다.
  // ⚠ 웨이브 60 전멸(`field.cleared`)은 안 되돌린다 — 데모가 거기까지 가려면 20분을 넘겨야 한다
  if (MENU) {
    combat.coreHp = CORE.hp;
    combat.over = false;
    // 데모에서 엔드 씬이 한 프레임이라도 서면 안 된다 — 코어를 되돌리는 것과 같은 이유다
    combat.endT = 0;
  }
  perfPush(perfUpdate, performance.now() - t0);
}

function render() {
  beginControls("game", false);
  // 이 프레임의 툴팁 눈금을 지운다 — 그린 쪽(hud.ts tooltip)만 다시 채운다 (probe `ui.tooltip`)
  tipReset();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  // 착탄 시 화면 진동 (§6.2) — 카메라 중심을 흔든다
  const sh = getEffectSettings().reducedMotion ? {x:0,y:0} : shakeOffset(combat, simT);
  ctx.setTransform(CAM, 0, 0, CAM, VIEW.w / 2 - (map.cx + sh.x) * CAM, VIEW.h / 2 - (map.cy + sh.y) * CAM);
  drawBackground(ctx, map); // 바닥·레일·역사·코어·중앙 소품 = 플레이트 (감독 #5 V1)
  drawCoreGlow(ctx, map, simT, combat.coreHp / CORE.hp, field.list.some(e => e.atCore || e.firing)); // 코어 발광 웅덩이 (감독 #5 V3) — 지면 레이어
  drawMap(ctx, map, combat.aim); // 플레이트에 없는 것만 = 파괴 가능한 성벽
  drawDrops(ctx, combat); // 드랍은 지면 레이어 — 적·열차보다 아래
  drawFires(ctx, combat); // 소이탄 화염 지대도 지면 레이어 (§6.1 "지역 거부")
  drawAcidPools(ctx, combat); // 산성 웅덩이도 같은 지면 레이어 (§8.⑦ "잔해·성벽을 서서히 녹임")
  drawField(ctx, field, map);
  drawSmoke(ctx, combat); // 연막은 지면이 아니라 **적 위**에 덮인다 (§8.⑧ 연막차)
  drawTrain(ctx, train);
  drawBreach(ctx, field, map); // 보스 레일 돌파의 섬광·파편 — 돌파 지점이 레일 위라 유닛 아래면 가려진다
  drawCombat(ctx, combat);
  drawEffects(ctx, combat);
  if (!combat.over) drawCoreImpact(ctx, map, combat.coreImpact);
  drawThreatCues(ctx, field, map); // 이펙트는 맨 위 (감독 #5 V2)
  // 엔드 씬 (§0.7 M) — 코어 위에 덧그리는 빛이라 **월드 레이어의 맨 위**다(코어에 붙어 선 적도 덮는다).
  // 화면 전체 섬광만 그 안에서 화면 좌표로 잠깐 돌아간다
  if (combat.over) drawEndScene(ctx, map, combat.endT);
  if (DEBUG) drawPlateDebug(ctx, map); // ?debug=1 — 그림과 판정의 정합 검증

  // 메인 화면 (§0.7 I) — 여기까지가 「라이브 데모」이고, 그 위에 타이틀·버튼만 얹는다.
  // HUD·상점·카드·종료 화면은 **런의 것이라 메뉴에 안 뜬다**(자동 조종이 정차를 한 프레임에 지나가므로
  // 상점 패널이 한 프레임 스칠 수 있는데, 여기서 먼저 빠져나가 그 깜빡임까지 막는다)
  if (MENU) {
    drawMenu(ctx, menu, rank, mouse);
    endControls(canvas);
    return;
  }

  // HUD (큐 1) — 상단 중앙 웨이브 박스 + 우측 나무 패널. 그리는 것은 전부 hud.ts가 한다
  // 관문 경고 (§0.6 B5) — 비네트가 우측 나무 패널을 덮지 않도록 **drawHud보다 앞**이다
  drawGateAlert(ctx, field, ending());
  drawHud(ctx, combat, train, field);
  drawCardFeedback(ctx, cards);
  // 관문급(중간보스·보스)이 두 패널 뒤나 화면 밖에 있을 때의 **가장자리 마커** (DESIGN §3,
  // 감독 #49 ① ⓒ). HUD **뒤에** 그리면 마커 자체가 패널에 가리므로 반드시 drawHud 다음이다
  drawGateMarkers(ctx, field, map, CAM);

  // 일시정지·나가기 (감독 #71) — **상점·카드·종료 화면에서는 안 그린다**(그 셋은 이미 시간이
  // 멈춰 있고, 두 개의 「정지」가 한 화면에 겹치면 어느 쪽이 시간을 쥐고 있는지가 안 읽힌다)
  if (!MENU && !field.station && !field.card && !field.branch && !field.doctrine && !combat.over && !field.cleared)
    drawPause(ctx, pause, mouse, exitToHome, checkpointLabel + (RESUMED?.migrated ? " · 이전 버전/랭킹 제외" : ""), saveOk);
  else pause.hits = [];

  if (field.station)
    drawShop(ctx, shop, train, combat, WAVES[field.waveIdx].stage, stationNextMap(), mouse, departStation);
  if (field.card || field.branch || field.doctrine)
    drawCards(
      ctx,
      cards,
      train,
      WAVES[field.waveIdx].stage,
      // 3번째 자리(정차 직전)는 웨이브를 열지 않는다 — 다음은 상점이다 (enemy.ts pickedCard)
      field.cardToStation ? "정차역" : `웨이브 ${field.waveIdx + 2}`,
      mouse,
      combat.pass,
      field.doctrine ? pickDoctrine : field.branch ? pickBranch : pickCard,
    );

  // **⑤ 결과화면은 엔드 씬이 끝난 뒤에 뜬다** (§0.7 M). 클리어는 엔드 씬을 안 타므로 즉시다
  if ((combat.over || field.cleared) && !ending()) drawEnd();
  // QA: ?cardsheet=1 — 칸 그림 대조표를 전 화면에 덮는다 (§0.6 A3 판정 컷)
  endControls(canvas);
  if (CARD_SHEET) drawCardArtSheet(ctx, Number(CARD_SHEET) || 1, CARD_SHEET === "tiers");
}

/** 엔드 씬의 지금 단계 (probe `run.endPhase`). **`ending()`과 같은 눈금 하나를 봐야** 「probe는
 * burst라는데 화면은 결과판」이 안 생긴다 — 경계는 `END_SCENE`의 네 칸 누적이 유일한 정본이다 */
function endPhase(t: number): "hold" | "tint" | "crack" | "burst" | "done" {
  if (t < END_SCENE.holdSec) return "hold";
  if (t < END_SCENE.holdSec + END_SCENE.tintSec) return "tint";
  if (t < END_SCENE.holdSec + END_SCENE.tintSec + END_SCENE.crackSec) return "crack";
  if (t < END_SCENE_SEC) return "burst";
  return "done";
}

/** **엔드 씬이 도는 중인가** (§0.7 M). 이 창 동안 ⓐ 결과화면이 안 뜨고 ⓑ 관문 배너를 안 그리며
 * ⓒ 클릭·R이 재시작으로 안 샌다 — 셋 다 「연출이 끝나기 전에는 다음 화면이 없다」의 같은 얼굴이다 */
function ending(): boolean {
  return combat.over && combat.endT < END_SCENE_SEC;
}

/** **최종 클리어 웨이브** (§0.7 N 랭킹 항목 2). 종료 화면의 WAVE 행과 랭킹 기록이 **같은 식**을
 * 봐야 한다 — 갈리면 나란히 선 두 판(좌 결과 · 우 랭킹)이 같은 런을 다른 수로 적는다.
 * 패배는 「죽은 웨이브」(= 화면이 지금까지 찍어 온 수)이고 클리어는 마지막 웨이브다 */
function endWave(): number {
  return field.cleared ? WAVES.length : field.waveIdx + 1;
}

/** 런 종료 화면 (DESIGN §10 "클리어/패배 화면·재시작"). 클리어와 패배는 **같은 판**을 쓰고
 * 제목·색만 다르다 — 둘 다 "이번 런이 어디까지 갔는가"를 같은 항목으로 읽어야 비교가 된다.
 * 재시작은 페이지 리로드다: 맵·시드·편성·카드·상점이 전부 모듈 최상위에서 만들어지므로
 * 상태를 손으로 되돌리는 것보다 다시 만드는 쪽이 짧고, 빠뜨린 상태가 남을 여지가 없다 */
function drawEnd(): void {
  const win = field.cleared;
  beginControls("results");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000000b3";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  // **좌 결과 · 우 랭킹** (§0.7 N "게임 종료 시 → 왼쪽에 결과화면 · 오른쪽에 랭킹 리스트").
  // 두 판의 폭 합(520 + 560) + 사이 40이 1120이라 여백이 좌우 80으로 갈린다 — 판이 화면 밖으로
  // 안 나가는 유일한 나눔이다(VIEW.w 1280). 세로는 옛 판을 그대로 둔다(y·h가 안 바뀐다)
  const panY = 180;
  const cx = 80 + 260;
  // 종료 화면도 HUD·상점과 같은 나무 패널 위에 올린다 (큐 1 스킨 통일)
  woodPanel(ctx, 80, panY, 520, 440, 16);
  drawRank(ctx, rank, 640, panY, 560, 440, false);
  ctx.textAlign = "center";
  ctx.fillStyle = win ? "#ffd24a" : "#ff6a4a";
  ctx.font = `36px ${FONT_DISPLAY}`;
  ctx.fillText(win ? "MAP CLEAR" : "CORE DESTROYED", cx, 245);
  const t = Math.floor(field.t);
  const rows = [
    `TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`,
    `WAVE ${endWave()}/${WAVES.length}   ·   STAGE ${WAVES[field.waveIdx].stage}/${STAGE_COUNT}`,
    `KILLS ${combat.kills}   ·   SCRAP ${Math.floor(combat.collected)}`,
    `CARS ${train.cars.length}   ·   명목 DPS ${trainDps(train, combat.pass).toFixed(1)}`,
    // 60웨이브 런의 이정표는 웨이브 번호가 아니라 **보스 수**다 (§3 "보스 = 6n 웨이브" → 런당 10기).
    // 웨이브 번호만으로는 "20/60에서 죽었다"가 잘 싸웠는지 아닌지를 안 말해 준다
    `BOSS ${bossKills(combat.killsByKind)}/${BOSS_TOTAL}   ·   CORE ${Math.max(0, Math.ceil(combat.coreHp))}/${CORE.hp}`,
    // 패배 화면에서 유일하게 «무엇에 죽었는가»를 적는 줄이다. 값은 probe의 coreLostBoss/coreLostMob과
    // 같은 누적 장부라, 수리를 샀다면 두 값의 합이 CORE 잔량과 안 맞는 것이 정상이다
    `CORE LOST   BOSS ${Math.round(combat.coreDmgBoss)}   ·   MOB ${Math.round(combat.coreDmgMob)}`,
    `주요 피해원: ${damageSummary()}`,
  ];
  ctx.fillStyle = "#f0e2c0";
  ctx.font = `18px ${FONT}`;
  rows.forEach((r, i) => ctx.fillText(r, cx, 290 + i * 30));
  ctx.fillStyle = "#c9b898";
  ctx.font = `500 18px ${FONT}`;
    const topCause = Object.entries(combat.coreDamageByCause).sort((a,b) => b[1]-a[1])[0]?.[0] ?? "";
  ctx.font = `17px ${FONT}`;
  ctx.fillText(win ? "고정 도전 SEED 7 · 다른 편성으로 다시 도전" : topCause.startsWith("boss") ? "다음 도전: 보스 예고에 맞춰 포격을 준비하세요." : topCause.startsWith("ranged") ? "다음 도전: 원거리 적을 포격으로 먼저 압박하세요." : "다음 도전: 코어 앞 밀집에 광역 화력을 배치하세요.",cx,515);
  const buttons = [
    {id:"end-restart",label:"다시 도전 · R",x:122,run:restart},
    {id:"end-home",label:"홈으로",x:352,run:() => { location.href=location.pathname; }},
  ];
  for (const b of buttons) {
    buttonPanel(ctx,b.x,545,206,44,b.id === "end-restart" ? "primary" : "secondary");
    ctx.fillStyle=b.id === "end-restart" ? railInk.dark : railInk.text; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font=`22px ${FONT_DISPLAY}`;
    ctx.fillText(b.label,b.x+103,567);
    registerControl(b.id,b.label,{x:b.x,y:545,w:206,h:44},b.run);
  }
}

function damageSummary(): string {
  const causes = Object.entries(combat.coreDamageByCause).sort((a,b) => b[1]-a[1]);
  if (!causes.length) return "없음";
  const names: Record<string,string> = {rock:"투석",boss:"보스",impact:"돌진",suicide:"자폭",bomb:"폭탄",melee:"근접",ranged:"원거리"};
  return causes.slice(0,2).map(([key,n]) => `${names[key.split(":")[0]] ?? key} ${Math.round(n)}`).join(" · ");
}

/** 재시작 (DESIGN §10). 런 상태가 모듈 최상위 const라 리로드가 가장 확실한 초기화다 */
function restart(): void {
  clearSave();
  location.search = "?start=run";
}

/** 메인 화면 (§0.7 I). 두 버튼은 **쿼리를 갈아 다시 여는 것**이 전부다 — 런 상태가 전부 모듈
 * 최상위에서 만들어지므로 `restart()`와 같은 이유로 리로드가 가장 짧고 빠뜨린 상태가 안 남는다.
 *  · GAME START = 새 런(`?start=run`) — 저장이 있으면 지운다(새 런이 곧 그 자리를 덮는다)
 *  · CONTINUE  = 이어하기(`?resume=1`) — 이미 있는 복원 경로를 화면에 노출하는 것뿐이다 */
const menu = makeMenu(
  MENU_SAVE ? { wave: MENU_SAVE.waveIdx + 1, stage: WAVES[MENU_SAVE.waveIdx].stage, map: MENU_SAVE.map ?? "plains" } : null,
  MAP_ID,
  () => {
    clearSave();
    // **새 런은 «경로 런»이다** (§0.7 O ⓑ · 5차 A3 · `BALANCE.ROUTE`) — 평원 1~18 → 도시 19~36.
    // `&map=`을 달면 그 맵에 **고정**되므로(경로가 꺼진다) 여기서는 안 단다. 아래 2택은
    // 이제 **데모 배경의 미리보기**이고, 런의 맵은 경로가 정한다(§0.7 O ⓐ의 「런 내내 고정」은
    // ⓑ가 대체했다 — 2택의 존폐는 STATUS 미결 질문으로 감독에게 남겼다)
    location.search = "?start=run";
  },
  () => {
    location.search = "?resume=1";
  },
  // 맵 2택 (§0.7 O ⓐ). **메인 화면을 그 맵으로 다시 여는 것**이 전부다 — 데모 배경이 곧 선택의
  // 미리보기가 되고(`MAP_ID`가 `generateMap`으로 그대로 간다). `?start=menu`를 달아야 MENU가 유지된다.
  // ⚠ **이 2택은 더 이상 «런의 맵»을 안 고른다**(§0.7 O ⓑ가 ⓐ의 전제를 대체했다) — 그래서 화면의
  // 이름도 「맵 선택」이 아니라 「배경 미리보기」다(menu.ts). 런의 맵은 `ROUTE`가 정한다
  (id) => {
    location.search = `?start=menu&map=${id}`;
  },
);

// 조작 (§6.2): 맵 아무 지점이나 클릭 → 주포 착탄. 커서 위치는 조준원 표시에 쓴다
function toWorld(ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const sx = ((ev.clientX - rect.left) / rect.width) * VIEW.w;
  const sy = ((ev.clientY - rect.top) / rect.height) * VIEW.h;
  return { x: map.cx + (sx - VIEW.w / 2) / CAM, y: map.cy + (sy - VIEW.h / 2) / CAM };
}
/** QA: `?hover=<sx>,<sy>` — 커서를 **그 화면 좌표에 못박는다**(툴팁 컷의 유일한 재현 경로).
 * playwright의 `page.mouse.move`만으로는 툴팁 컷이 안 찍힌다: **스크린샷 호출 자체가 캔버스에
 * `pointerleave`를 던져** 캡처 직전 프레임에서 `mouse`가 null이 되기 때문이다(iter100 실측 —
 * `before 0 → after 1`, 요소 캡처·페이지 캡처 둘 다). 그래서 `pointerleave`는 null이 아니라
 * **이 값으로** 되돌린다. **연출 전용이다** — `combat.aim`(주포 조준점)은 한 자리도 안 건드린다 */
const QA_HOVER = ((): { x: number; y: number } | null => {
  const v = params.get("hover");
  if (!v) return null;
  const [x, y] = v.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`bad ?hover: ${v}`);
  return { x, y };
})();

/** 커서의 **화면 좌표** (§0.6 A2 툴팁). `combat.aim`은 HUD 위에서 null이 되는 «월드 조준점»이라
 * 상점·카드 패널 위의 마우스 오버를 못 받는다 — 그래서 화면 좌표를 따로 들고 있는다 */
let mouse: { x: number; y: number } | null = QA_HOVER;
canvas.addEventListener("pointermove", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ((ev.clientX - rect.left) / rect.width) * VIEW.w;
  const sy = ((ev.clientY - rect.top) / rect.height) * VIEW.h;
  mouse = { x: sx, y: sy };
  // 메인 화면에는 «플레이어의 손»이 없다 — 조준원이 데모 위에 뜨면 안 된다
  combat.aim = MENU || hudHit(sx, sy) ? null : toWorld(ev);
});
canvas.addEventListener("pointerleave", () => {
  combat.aim = null;
  mouse = QA_HOVER;
});
canvas.addEventListener("pointerdown", (ev) => {
  if (MENU || paused(pause) || field.station || field.card || field.branch || field.doctrine || combat.over || field.cleared) playSound("ui");
  // 메인 화면의 클릭은 전부 메뉴의 것이다 — 데모 위로 조준 포격이 새면 안 된다 (§0.7 I)
  if (MENU) {
    const r = canvas.getBoundingClientRect();
    menuClick(menu, rank, ((ev.clientX - r.left) / r.width) * VIEW.w, ((ev.clientY - r.top) / r.height) * VIEW.h);
    return;
  }
  // 런이 끝났으면 화면 어디를 눌러도 재시작이다 — 종료 화면 아래로 주포 발사가 새면 안 된다.
  // ⚠ **엔드 씬이 도는 동안은 «아무것도» 아니다**(§0.7 M) — 결과화면이 아직 없는데 재시작이
  // 되면 연출이 클릭 한 번으로 사라지고, 통과시키면 부서지는 코어 위로 주포가 나간다
  if (combat.over || field.cleared) {
    if (!ending()) {
      const r = canvas.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * VIEW.w;
      const sy = ((ev.clientY - r.top) / r.height) * VIEW.h;
      // **랭킹 판 위 클릭은 판의 것이다** (§0.7 N 닉네임 수정) — 재시작으로 새면 버튼을 못 누른다.
      // 판 «바깥» 클릭은 이 화면의 원래 뜻(재시작)이 이긴다: 종료 화면의 랭킹은 «오른쪽 절반»이지
      // 닫을 오버레이가 아니라서 ✕도 안 그린다(rank.ts drawRank `closable`)
      if (rankClick(rank, sx, sy) === "inside") return;
      if (sy >= 545 && sy <= 589) {
        if (sx >= 122 && sx <= 328) restart();
        else if (sx >= 352 && sx <= 558) location.href = location.pathname;
      }
    }
    return;
  }
  // 일시정지·나가기가 그려져 있으면 그 클릭이 먼저다 (감독 #71) — 버튼과 팝업 위 클릭이
  // 조준 포격으로 새면 안 된다. `drawPause`가 안 그린 화면(상점·카드·종료)에서는 `hits`가
  // 비어 있고 정지도 꺼져 있으므로 이 분기가 조용히 통과한다
  {
    const r = canvas.getBoundingClientRect();
    const act = pauseClick(pause, ((ev.clientX - r.left) / r.width) * VIEW.w, ((ev.clientY - r.top) / r.height) * VIEW.h);
    if (act === "exit") {
      exitToHome();
      return;
    }
    if (act === "eaten") return;
  }
  // 상점이 열려 있으면 클릭은 전부 상점의 것이다 — 안 그러면 패널 위 클릭이 주포 발사로 샌다
  if (field.station || field.card || field.branch || field.doctrine) {
    const rect = canvas.getBoundingClientRect();
    const sx = ((ev.clientX - rect.left) / rect.width) * VIEW.w;
    const sy = ((ev.clientY - rect.top) / rect.height) * VIEW.h;
    if (field.station) shopClick(shop, sx, sy);
    else cardsClick(cards, sx, sy);
    return;
  }
  // HUD 패널 위 클릭은 UI의 것이다 — 안 그러면 패널에 가려 안 보이는 곳으로 포격이 나간다
  const rect = canvas.getBoundingClientRect();
  if (hudHit(((ev.clientX - rect.left) / rect.width) * VIEW.w, ((ev.clientY - rect.top) / rect.height) * VIEW.h)) return;
  const p = toWorld(ev);
  combat.aim = p;
  // **폭탄 해체가 포격보다 먼저다** (§8.⑥ "폭탄은 사격·클릭으로 해체 가능"). 조준 포격에 이은
  // 두 번째 «플레이어의 손»이고, 폭탄 위 클릭의 뜻은 하나여야 한다 — 해체가 성립한 클릭은
  // 포격으로 새지 않는다(대신 포격 쿨다운도 안 쓴다: 해체는 공짜가 아니라 «다른 행동»이다)
  if (defuseBomb(field, p.x, p.y)) return;
  callStrike(combat, p.x, p.y);
});

document.addEventListener("pointerdown", () => { void unlockAudio(); }, true);
document.addEventListener("keydown", () => { void unlockAudio(); }, true);
window.addEventListener("keydown", (ev) => {
  if (ev.defaultPrevented) return;
  if (rankKey(rank, ev.key)) { ev.preventDefault(); return; }
  if (MENU) { if (ev.key === "Escape") menu.rank=false; return; }
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLButtonElement && ev.key !== "Escape") return;
  if (!field.station && !field.card && !field.branch && !field.doctrine && !combat.over && !field.cleared && pauseKey(pause, ev.key)) { ev.preventDefault(); return; }
  if ((combat.over || field.cleared) && !ending() && ev.key.toLowerCase() === "r") { restart(); return; }
  if (paused(pause) || field.station || field.card || field.branch || field.doctrine || combat.over || field.cleared) return;
  const delta: Record<string,[number,number]> = {ArrowLeft:[-25,0],ArrowRight:[25,0],ArrowUp:[0,-25],ArrowDown:[0,25]};
  if (delta[ev.key]) {
    ev.preventDefault();
    const aim=combat.aim ?? {x:map.cx,y:map.cy};
    const [dx,dy]=delta[ev.key];
    combat.aim={x:Math.max(0,Math.min(map.w,aim.x+dx)),y:Math.max(0,Math.min(map.h,aim.y+dy))};
  } else if (ev.key === " " || ev.key === "Enter") {
    ev.preventDefault();
    const aim=combat.aim ?? {x:map.cx,y:map.cy};
    combat.aim=aim;
    if (!defuseBomb(field,aim.x,aim.y)) callStrike(combat,aim.x,aim.y);
  }
});

let spriteCount = 0;

// QA: ?terrladder=1 — **파괴 3단(§0.7 J1-b)을 한 컷에 세운다.** 파괴 가능 지물을 인덱스 순으로
// 0% / 30% / 55% / 80% / 100% 피해로 미리 때려 「온전 · 균열 · 파손 · 심한 파손 · 잔해」가 같은
// 화면에 함께 서게 한다. 실런에서는 이 다섯이 서로 다른 시각에 흩어져 있어 **한 장으로 못 본다.**
// 피해는 `damageTerrain`(지형 피해의 유일한 문)을 지나므로 파편·흔들림·1차 판정이 실런과 같다.
// **BALANCE 정본이 아니라 QA 컷 손잡이다**(`?cover=`·`?wallscale=`와 같은 부류)
if (params.get("terrladder") === "1") {
  const steps = [0, 0.3, 0.55, 0.8, 1];
  let i = 0;
  for (const t of map.terrain) {
    if (t.destroyed || !Number.isFinite(t.hp0)) continue;
    const f = steps[i++ % steps.length];
    if (f > 0) damageTerrain(combat, t, t.hp0 * f);
  }
}

if (SAVE_ON && !RESUMED) {
  saveWrites++; saveOk=writeSave(snapshot(map,field,train,combat,cards,SEED,retries,MAP_PIN));
  if (!saveOk) checkpointLabel="저장 없음";
}

// warm: 캡처 전에 시뮬을 미리 감는다 (헤드리스 QA용)
for (let i = 0; i < WARM * 60; i++) step(DT);

setActionEventsEnabled(true);
const clock = makeClock(MENU ? 1 : PLAYBACK_RATE);
let audioLast = {kills:combat.kills,coreHit:combat.coreImpact.serial,bosses:combat.bossLog.length,cards:cards.taken.length,station:field.station,scrap:combat.scrap};
const actionCounts: Record<string, number> = {};
function updateAudio(): void {
  const blocked = paused(pause) || document.hidden;
  setAudioState({paused:blocked,hidden:document.hidden,menu:MENU,running:!MENU && !combat.over && !field.cleared,danger:combat.coreHp<CORE.hp*.25});
  const actions = drainActionEvents();
  if (!MENU && !blocked) {
    for (const event of actions) {
      const key = `${event.source}:${event.kind}:${event.action}`;
      actionCounts[key] = (actionCounts[key] ?? 0) + 1;
      const sound = soundForAction(event);
      if (sound) playSound(sound, {
        pan: Math.max(-.65, Math.min(.65, (event.x - map.cx) / (map.outerR * 1.6))),
        distance: Math.min(.6, Math.hypot(event.x - map.cx, event.y - map.cy) / (map.outerR * 4)),
      });
    }
    if (combat.kills>audioLast.kills) playSound("death",{volume:.35});
    if (combat.coreImpact.serial>audioLast.coreHit) playSound("coreDamage");
    if (combat.bossLog.length>audioLast.bosses) playSound("boss");
    if (cards.taken.length>audioLast.cards) playSound("card");
    if (field.station && !audioLast.station || field.station && combat.scrap<audioLast.scrap) playSound("shop");
    if (combat.coreHp<CORE.hp*.25 && !combat.over) playSound("lowHp");
  }
  audioLast={kills:combat.kills,coreHit:combat.coreImpact.serial,bosses:combat.bossLog.length,cards:cards.taken.length,station:field.station,scrap:combat.scrap};
}
document.addEventListener("visibilitychange", () => { clock.reset(); perfLast=0; });
function tick(now = performance.now()) {
  frame++;
  if (perfLast) perfPush(perfGap, now - perfLast);
  perfLast = now;
  const started=performance.now();
  clock.advance(now, FREEZE || paused(pause) || document.hidden, () => step(DT));
  updateAudio();
  const t0 = performance.now();
  render();
  perfPush(perfRender, performance.now() - t0);
  const elapsed=performance.now()-started;
  perfPush(perfFrame,elapsed); perfFrameCount++;
  if (elapsed>50) perfLongFrames++;
  if (frame >= 10) window.__gameReady = true;
  requestAnimationFrame(tick);
}

void preloadAudio();
Promise.all([loadSprites(), loadPlate(MAPS[map.id].plate), loadFonts()]).then(([m]) => {
  spriteCount = m.size;
  // 배경은 정적이라 맵 전체를 한 번만 굽는다 (plate.ts). 시드는 밴드 소품·노이즈 배치에만 쓴다
  buildBackground(map, SEED);
  tick();
});

/** 지형/역이 레일 중심선에서 얼마나 떨어졌는지 (월드 단위) */
function distToLoop(x: number, y: number): number {
  let best = Infinity;
  for (const p of map.loop) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

/** 웨이브 i(0-based)의 적종별 개체 수 = §6 예산을 `mix` 비중으로 나눈 유도값.
 * probe의 `waves.rows`와 `growth`(공급 곡선)가 같은 편성을 봐야 해서 한 곳으로 뺐다.
 * **보스는 여기 없다** — 보스 HP·드랍은 §6 예산 밖이다(balance.ts BOSS 주석) */
function waveCounts(i: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [k, wt] of Object.entries(WAVES[i].mix as Record<string, number>)) {
    const n = Math.round((waveBudget(i) * wt) / 100 / budgetUnits(k));
    if (n > 0) counts[k] = n;
  }
  return counts;
}

/** 스크랩 `scrap`을 §3 가격표에 전액 쏟았을 때 도달하는 **명목 DPS** (`?shop=auto`와 같은 정책:
 * 칸을 `targetCars`까지 사고, 강화가 전부 상한에 닿으면 티어업으로 상한을 연다 — iter47에서 티어업이
 * 메뉴에 들어와 이 곡선의 천장이 T1 Lv5에서 **T3 Lv15**로 올라갔다(그 위는 돈으로도 못 넘는다) */
function affordDps(scrap: number, targetCars: number): number {
  const t = makeTrain(track);
  const c = makeCombat(map, SEED);
  c.scrap = scrap;
  autoSpend(makeShop(), t, c, 0, targetCars);
  // 패시브(§0.7 H2)도 같은 정책으로 사므로 그 몫이 이 곡선에 든다 — 「돈을 전부 화력으로 바꾸면
  // 어디까지 가는가」의 천장이 세 축의 합이 됐다(칸 → 강화 → 패시브 → 티어업)
  return +trainDps(t, c.pass).toFixed(1);
}

const shortSide = Math.min(VIEW.w, VIEW.h);
// 외곽 전장 깊이 (§5.0): 레일→맵 가장자리. 세로와 가로의 기준이 다르므로(0.9 / 1.2) 따로 잰다
const edgeGapX = Math.min(...map.loop.map((p) => Math.min(p.x, map.w - p.x)));
const edgeGapY = Math.min(...map.loop.map((p) => Math.min(p.y, map.h - p.y)));
const loopMinR = Math.min(...map.loop.map((p) => Math.hypot(p.x - map.cx, p.y - map.cy)));

if (import.meta.env.DEV) window.__dbg = {
  get frame() { return frame; },
  get simT() { return simT; },
  stage: START,
  map,
  train,
  field,
  get flow() { return flow; },
  combat,
};
/** `enemies.tail`이 서는 상한 (iter172). 「교착」은 필드가 «거의 빈» 자리에서만 일어나므로
 * 이 위로는 낼 이유가 없다 — 96기가 든 프레임에서 개체 배열을 내면 probe 출력이 통째로 못 읽힌다 */
const TAIL_MAX = 12;
window.__probe = () => ({
  stage: START,
  // **메인 화면 (§0.7 I)** — 컷 없이 「메뉴가 섰는가」를 확인하는 자리다. `btns`는 **직전 프레임에
  // 실제로 그려진 버튼 수**라(drawMenu가 매 프레임 다시 채운다) 0이면 화면에 아무 버튼도 없다는 뜻이다.
  // `cont`는 저장 유무 = CONTINUE가 서는 조건이고, `demoCore`는 데모 규약(코어 불변)의 검산값이다
  menu: {
    on: MENU,
    btns: menu.btns.length,
    rank: menu.rank,
    cont: menu.cont,
    demoCore: MENU ? +combat.coreHp.toFixed(1) : null,
    // **맵 2택 (§0.7 O ⓐ)** — `map`은 지금 고른 맵(= 데모가 실제로 굽고 있는 맵과 «같은 값»이라
    // 어긋나면 여기서 보인다) · `mapBtns`는 2택 버튼이 실제로 그려졌는지(2가 아니면 안 섰다)
    map: menu.map,
    mapBtns: menu.btns.filter((b) => b.h === MAP_H).length,
  },
  frame,
  simT: +simT.toFixed(2),
  presentation: { tempo: MENU ? 1 : PLAYBACK_RATE, actions: actionCounts },
  sprites: spriteCount,
  spritesFailed: failed,
  // **BALANCE §0.5 배율** — 여기 찍힌 값이 곧 지금 코드가 쓰는 배율이다. 1차 상태와 비교할 때
  // 이 블록이 전부 1이면 배율이 꺼진 것이다(A/B 대조 컷의 확인 지점)
  mult: MULT,
  // **QA 사다리가 실제로 걸렸는가** — `?ehp`·`?wdmg`·`?drop`은 위 `mult` 블록을 «대체»하므로
  // `mult`만 읽으면 사다리 컷과 회귀 컷이 같아 보인다(iter140). 여기 찍힌 셋이 지금 도는 값이다
  multNow: { enemyHp: enemyHpMult(), dmg: weaponDmgMult(), drop: dropValueOf(map.id), range: weaponRangeMult(), standoffRev: standoffRevOn(), hpWaveLin: qaHpWaveLinValue() },
  // **§0.5 성능 검증** — 프레임 예산 16.67ms 안에 작업(update + render)이 들어가는지.
  // `?freeze=1`을 주면 시뮬이 멈춘 채 렌더만 돌아 렌더 표본이 안전하게 쌓인다(시뮬 값은 불변).
  // update 표본은 warm 루프에서도 쌓이므로 freeze 컷에서도 마지막 3초치가 남아 있다
  perf: (() => {
    const u95 = perfPct(perfUpdate, 0.95);
    const r95 = perfPct(perfRender, 0.95);
    return {
      updateN: perfUpdate.length,
      renderN: perfRender.length,
      updateMs: { p50: perfPct(perfUpdate, 0.5), p95: u95 },
      renderMs: { p50: perfPct(perfRender, 0.5), p95: r95 },
      /** 판정값: 95퍼센타일 작업 시간이 프레임 예산 안인가.
       * **표본이 60프레임 미만이면 null이다** — probe는 frame 10에 읽히므로 렌더 표본이 전부
       * 워밍업(스프라이트·플레이트 업로드, 첫 컷 61ms)이라 여기서 판정하면 거짓 경보가 난다.
       * 성능 판정은 `npm run perf`(freeze + 4초 표본)로 할 것 */
      workMsP95: perfPct(perfFrame,0.95),
      frameMs: { p50:perfPct(perfFrame,.5), p95:perfPct(perfFrame,.95), p99:perfPct(perfFrame,.99), samples:perfFrame.length, total:perfFrameCount, longFrames:perfLongFrames },
      gapMsP95:perfPct(perfGap,.95),
      clockDroppedMs:clock.droppedMs,
      budgetMs: 16.67,
      fps60Ok: FREEZE || perfFrame.length < 60 ? null : perfPct(perfFrame,.95) < 16.67,
      /** 참고값 — 헤드리스 rAF 간격 (실제 프레임률의 대변이 아니다) */
      gapMsP50: perfPct(perfGap, 0.5),
    };
  })(),
  // §5.0 공간 비율 검증
  layout: {
    mapW: map.w,
    mapH: map.h,
    mapScale: +(map.w / VIEW.w).toFixed(3),
    camScale: +CAM.toFixed(3),
    // §5.0 캐논 지표: 줌아웃이 반영된 **화면 실측** 외경비 (목표 0.50~0.53)
    loopOuterPctOnScreen: +((map.outerR * 2 * CAM) / shortSide).toFixed(3),
    // 월드 길이 기준 비율 (참고용 — iter5까지의 캐논 지표였다)
    loopOuterPctOfShortSide: +((map.outerR * 2) / shortSide).toFixed(3),
    loopOuterR: +map.outerR.toFixed(1),
    loopMinR: +loopMinR.toFixed(1),
    // 레일→맵 가장자리 최단 / 루프 반경 (§5.0 목표: 가로 ≥1.2, 세로 ≥0.9)
    edgeDepthXOverR: +(edgeGapX / map.outerR).toFixed(3),
    edgeDepthYOverR: +(edgeGapY / map.outerR).toFixed(3),
    edgeGapX: +edgeGapX.toFixed(1),
    edgeGapY: +edgeGapY.toFixed(1),
  },
  // 배경 플레이트 정합 (감독 #5 V1). 그림의 레일 링이 게임 루프와 겹치는지가 이 항목의 전부다
  plate: (() => {
    const p = map.plate;
    return {
      loaded: plateLoaded,
      imgPx: `${PLATE.w}x${PLATE.h}`,
      // 자기 검증: 플레이트 레일 링을 월드로 옮긴 반경 = 루프 반경이어야 한다 (x·y 둘 다)
      railWorldRx: +(PLATE.rail.rx * p.sx).toFixed(2),
      railWorldRy: +(PLATE.rail.ry * p.sy).toFixed(2),
      loopR: +map.outerR.toFixed(2),
      // 링 중심이 코어(월드 중심)에 와야 한다
      railCenterErr: +Math.hypot(
        p.ox + (PLATE.rail.cx + MAPS[map.id].plateShift.dx) * p.sx - map.cx,
        p.oy + (PLATE.rail.cy + MAPS[map.id].plateShift.dy) * p.sy - map.cy
      ).toFixed(3), // 그림의 링 중심 = `ox` + (평원 링 + 이동량) — 이 값이 0이어야 그려진 레일이 루프와 겹친다
      // §0.6 A1 판정치: 「타원 모델 ↔ 그림의 레일 중심선」 최대 잔차를 월드로 환산한 것.
      // 기준 = 궤간(LAYOUT.railGauge)의 25%. 잔차 자체는 tools/rail-scan.mjs 실측(PLATE.rail.fitErrPx)
      // **잔차는 맵마다 다르다** — 모델(`PLATE.rail`)은 하나지만 그 모델에 대는 그림이 맵마다 다르다.
      // 평원 6.3px = 14.2% · 도시 5.7px = 12.9%(둘 다 판정선 25% 안 · `MAPS[id].railFitErrPx`)
      railErrWorld: +(MAPS[map.id].railFitErrPx * ((p.sx + p.sy) / 2)).toFixed(2),
      railErrGaugePct: +(((MAPS[map.id].railFitErrPx * ((p.sx + p.sy) / 2)) / LAYOUT.railGauge) * 100).toFixed(1),
      /** 이 맵의 그림이 평원 대비 몇 픽셀 옮겨져 있는가 (감독 #66 ① · 도시 v2 = +151, −53) */
      plateShift: [MAPS[map.id].plateShift.dx, MAPS[map.id].plateShift.dy],
      /** 이 맵이 어느 플레이트를 쓰는가 (감독 #65 반입 뒤 신설). `wide` = 구릉 평원 · `city` = 폐허 도시 */
      file: MAPS[map.id].plate,
      scale: [+p.sx.toFixed(4), +p.sy.toFixed(4)],
      // 플레이트가 덮는 월드 사각형과 그 커버리지 (나머지는 절차 확장 밴드)
      rect: [+p.x0.toFixed(1), +p.y0.toFixed(1), +p.x1.toFixed(1), +p.y1.toFixed(1)],
      coverX: +((p.x1 - p.x0) / map.w).toFixed(3),
      coverY: +((p.y1 - p.y0) / map.h).toFixed(3),
      // 밴드 폭 (좌/우/상/하, 월드)
      band: [
        +p.x0.toFixed(1),
        +(map.w - p.x1).toFixed(1),
        +p.y0.toFixed(1),
        +(map.h - p.y1).toFixed(1),
      ],
      // 밴드 절차 생성 실측 (감독 #7 ③). 단색 바닥 톤 + 실제로 놓인 소품·클러스터 수 + 디더 폭
      bandTone: bandStats.tone,
      bandClusters: bandStats.clusters,
      bandProps: bandStats.props,
      bandDitherPx: bandStats.ditherPx,
      // 루프가 정원인지 (감독 #7 ①로 1차 캐논 확정 — DESIGN §5.1)
      loopRMin: +loopMinR.toFixed(2),
      stationPx: [PLATE.station.x, PLATE.station.y],
    };
  })(),
  // **§0.7 J1-f 검산 — 진입 회랑**. 「왼쪽에 적이 등장할 루트가 없어 보인다」를 눈이 아니라
  // 수치로 가르는 자리다. 두 층이 한 블록에 있다 — 한쪽만 보면 오독한다:
  //  · `oct` = **정적 통로**(ⓑ). 8방위 각각에서 «맵 사각형 가장자리 → 코어»의 플로우필드 경로
  //    길이를 직선거리로 나눈 `detour`. 1.0이면 곧게 들어오고, 크면 벽을 도는 것이며 `reach:false`면
  //    그 방위가 아예 막힌 것이다. **링(맵 밖)이 아니라 가장자리에서 재는 이유**: 맵 밖에는 지형이
  //    한 개도 없어 링~가장자리는 어느 방위에서나 직선이고, 플로우 그리드의 여유(flow.ts PAD 160)가
  //    링(맵 밖 수백 월드)까지 안 닿아 거기서 읽으면 «가장자리 셀»이 클램프로 되읽힌다
  //  · `quad`/`octTraffic` = **실측 통행**(ⓒ). 스폰 방위별 «내보낸 수 / 레일까지 온 수 / 도달 시간».
  //    도달 시간은 `sec × speed`로 **이속 정규화**한다 — 느린 종이 한 방위에 몰린 웨이브에서
  //    그 방위만 느려 보이는 것을 막는다(`enemies.bySpeed`의 `norm` 열과 같은 규약).
  //    ⓒ의 판정선은 「좌측(W)이 나머지 셋과 같은 자리에 든다」이고 `quadSpread`가 그 요약이다
  //  · `blockedPocket`/`deadCells` = **「막혔다」의 두 얼굴**(iter135 신설). 위 두 층만으로는
  //    「가장자리 표본 칸에 지물이 얹혔다」와 「그 방위가 통째로 봉쇄됐다」가 **같은 글자**로 찍힌다.
  //    ⚠ **`blocked` 배열 하나로 J1-f ⓑ를 판정하지 말 것** — `deadCells`(맵 전체의 사각 칸 수)가
  //    0이면 **어느 방위도 안 막혔다**는 기계 증명이고, 그때 `blocked`에 든 이름은 눈금의 잡음이다
  corridor: (() => {
    // 가장자리에서 안쪽으로 한 셀 물린다 — 정확히 가장자리에 놓으면 그리드 경계 셀을 읽는다
    const inset = CELL;
    const edge = (a: number) => {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tx = Math.abs(ca) > 1e-6 ? map.w / 2 / Math.abs(ca) : Infinity;
      const ty = Math.abs(sa) > 1e-6 ? map.h / 2 / Math.abs(sa) : Infinity;
      const r = Math.max(1, Math.min(tx, ty) - inset);
      return { x: map.cx + ca * r, y: map.cy + sa * r, r };
    };
    const norm = (l: { sec: number; speed: number }) => l.sec * l.speed;
    const med = (g: number[]) => (g.length ? +g[g.length >> 1].toFixed(2) : null);
    const oct = OCT_NAME.map((dir, i) => {
      const a = (i / 8) * Math.PI * 2;
      const p0 = edge(a);
      // ⚠ **표본이 지물에 얹히면 안쪽으로 물린다** (iter135 · 이 한 줄이 없으면 눈금이 거짓말을 한다).
      // 절차 성벽은 `place.edge`(70) 덕에 가장자리 표본 칸(안쪽 한 칸 = 32)에 절대 못 닿지만,
      // **골렘 잔해(§8.② `debris` r27)는 간격·가장자리 규칙 밖**이라 죽은 자리 그대로 선다 —
      // 그 하나가 표본 칸을 덮으면 `costAt`가 Infinity라 **통로가 멀쩡한데 그 방위가 «막힘»으로
      // 찍힌다**(실측: 도시 s3 SE·s21 W · 같은 컷의 `deadCells 0` = 사각이 한 칸도 없다).
      // 물린 칸 수는 `onWall`로 남긴다 — 0이 아니면 「가장자리에 지물이 서 있었다」는 뜻이다
      let onWall = 0;
      let p = p0;
      while (onWall < 8 && isBlocked(flow, p.x, p.y)) {
        onWall++;
        const r = Math.max(1, p0.r - onWall * CELL);
        p = { x: map.cx + Math.cos(a) * r, y: map.cy + Math.sin(a) * r, r };
      }
      const c = costAt(flow, p.x, p.y);
      return { dir, reach: Number.isFinite(c), detour: Number.isFinite(c) ? +(c / p.r).toFixed(3) : null, onWall };
    });
    const octTraffic = OCT_NAME.map((dir, i) => {
      const g = field.approachLog.filter((l) => octOf(l.a) === i).map(norm).sort((a, b) => a - b);
      return { dir, sent: field.spawnOct[i], hit: g.length, med: med(g) };
    });
    const quad = QUAD_NAME.map((dir, q) => {
      const g = field.approachLog.filter((l) => quadOf(l.a) === q).map(norm).sort((a, b) => a - b);
      const sent = field.spawnQuad[q];
      return {
        dir,
        sent,
        hit: g.length,
        // 도달률 = 「내보낸 것 중 레일까지 온 몫」. 막힌 방위는 먼저 이 칸이 내려간다
        pct: sent ? +((g.length / sent) * 100).toFixed(1) : null,
        med: med(g),
        // 그 사분면의 **정적 통로 최악값** — 실측이 0표본일 때도 판정이 서게 두 층을 나란히 든다
        detour: Math.max(...oct.filter((_, i) => quadOf((i / 8) * Math.PI * 2) === q).map((o) => o.detour ?? Infinity)),
      };
    });
    // **적-초 점유율**(%). 8칸이 12.5%씩이면 완전 균등이다. `sent`(투입)·`hit`(레일 도달)와 달리
    // 표본이 «개체 × 생존 초»라 한 방위가 비어 보이는 것을 유일하게 큰 표본으로 가른다
    const secAll = field.octSec.reduce((a, b) => a + b, 0);
    const octSecPct = field.octSec.map((v) => (secAll > 0 ? +((v / secAll) * 100).toFixed(1) : 0));
    const meds = quad.map((q) => q.med).filter((v): v is number => v !== null);
    return {
      oct,
      octTraffic,
      quad,
      octSecPct,
      // 8방위 점유율의 **최대/최소 비**. 1.0이 완전 균등이고, 「왼쪽이 비었다」면 이 값이 먼저 튄다.
      // ⚠ **빈 칸이 하나라도 있으면 null이다** — 짧은 컷은 스폰 u의 황금비 도약 탓에 방위가 서너
      // 곳뿐이라(정상) 그 자리에서 비를 내면 수천이 찍혀 «막혔다»로 오독된다. 풀런에서만 값이 선다
      octSecSpread:
        secAll > 0 && Math.min(...octSecPct) > 0
          ? +(Math.max(...octSecPct) / Math.min(...octSecPct)).toFixed(2)
          : null,
      octSecMin: secAll > 0 ? OCT_NAME[octSecPct.indexOf(Math.min(...octSecPct))] : null,
      blocked: oct.filter((o) => !o.reach).map((o) => o.dir),
      // **「막혔다」의 두 얼굴** (iter135). 위 `blocked`는 방위마다 **한 칸**을 읽으므로
      // 「가장자리에 생긴 작은 주머니」와 「그 방위 전체의 봉쇄」가 같은 글자로 찍힌다.
      // `cells`가 그 갈림이다 — 표본이 앉은 **사각(死角)의 넓이**이고, `-1`이면 표본 칸 자체가
      // 지물 안이다(통로 이야기가 아니다). 아래 `deadCells`(맵 전체 사각)가 그 분모다
      blockedPocket: oct.flatMap((o, i) => {
        if (o.reach) return [];
        const p = edge((i / 8) * Math.PI * 2);
        return [{ dir: o.dir, px: [Math.round(p.x), Math.round(p.y)], cells: deadPocket(flow, p.x, p.y) }];
      }),
      // 맵 전체에서 **열려 있는데 코어에 못 닿는** 칸 수. 「어느 한 방위가 막혔다」가 아니라
      // 「이 판에 사각이 얼마나 있는가」를 재는 칸이고, 잔해(§8.②)처럼 **간격 규칙 밖에서
      // 서는 지물**이 늘면 여기가 먼저 오른다
      deadCells: (() => {
        let n = 0;
        for (let i = 0; i < flow.cost.length; i++) if (!flow.blocked[i] && !Number.isFinite(flow.cost[i])) n++;
        return n;
      })(),
      detourMax: Math.max(...oct.map((o) => o.detour ?? Infinity)),
      // 사분면 도달 시간의 **최대/최소 비**. 1.0에 가까울수록 네 방향이 같은 자리에 있다
      quadSpread: meds.length === 4 ? +(Math.max(...meds) / Math.min(...meds)).toFixed(2) : null,
    };
  })(),
  terrain: {
    count: map.terrain.length,
    byKind: map.terrain.reduce<Record<string, number>>((a, t) => {
      a[t.kind] = (a[t.kind] ?? 0) + 1;
      return a;
    }, {}),
    // 지형이 루프 내부에 있으면 안 된다 (§5.0)
    insideLoop: map.terrain.filter((t) => Math.hypot(t.x - map.cx, t.y - map.cy) < loopMinR).length,
    // 지형 가장자리~레일 중심선 최소 여유 (>0 이어야 레일을 안 덮는다)
    minRailClearance: +Math.min(...map.terrain.map((t) => distToLoop(t.x, t.y) - t.r)).toFixed(1),
    // **지형 존재감** (§0.6 F ⓐ). `wallScale`이 곱해진 실제 월드 반경과, 그 결과로 살아 있는
    // 파괴 가능 지물이 덮는 **총 면적**(= 「크게 만들었더니 개수가 줄었다」를 가르는 유일한 수치).
    // `hpBarShown`은 화면에 실제로 바가 서는 지물 수 = F ⓑ의 판정치(잔해·무한 HP는 빠진다).
    // ⚠ **iter118에 정의가 갈렸다** — 성벽은 **상한 미만일 때만** 바가 뜨므로 온전한 것은 안 센다
    // (회귀 대조 칸이다: 옛 값 = 살아 있는 성벽 전부 · 평원 7 · 도시 0). 폭발 지물은 상시라 늘 센다
    wallScale: TERRAIN.wallScale,
    wallRWorld: +(PLATE.wallR * ((map.plate.sx + map.plate.sy) / 2) * TERRAIN.wallScale).toFixed(1),
    blockArea: Math.round(
      map.terrain.filter((t) => t.kind === "wall" && !t.destroyed).reduce((a, t) => a + Math.PI * t.r * t.r, 0)
    ),
    hpBarShown: map.terrain.filter(
      (t) =>
        !t.destroyed &&
        Number.isFinite(t.hp0) &&
        (explosive(t.kind) ? true : t.kind === "wall" && t.hp < t.hp0)
    ).length,
    // 「상시로 뜨는 예외가 몇인가」 — 이 칸이 0이 아닌 맵에서만 무피해 `hpBarShown`이 0을 안 찍는다
    hpBarAlways: map.terrain.filter((t) => explosive(t.kind) && !t.destroyed && Number.isFinite(t.hp0)).length,
    // **바가 지물에 붙어 있는가** (iter96). `cellFill` = 셀에서 그림이 실제로 차지하는 세로 비율
    // (성벽 0.25 = 셀의 3/4이 빈 자리다) · `barGap` = 바 하단 ↔ 그림 상단의 **월드 거리**.
    // 판정 반경으로 놓으면 이 값이 50월드까지 벌어져 「무엇의 HP인가」가 화면에서 사라진다 —
    // **컷으로는 「초록 막대가 잔디에 떠 있네」로만 읽혀서** 눈이 아니라 이 칸으로 볼 것
    barFit: (() => {
      const t = map.terrain.find((q) => q.kind === "wall" && !q.destroyed && Number.isFinite(q.hp0));
      if (!t) return null;
      // 셀 이름은 **`terrainTile()` 한 곳**이다 — 여기서 규칙을 손으로 다시 쓰면 규약이 두 벌이 되고,
      // 다음 지형 시트에서 probe가 «틀린 상자»를 재면서 그 숫자로 회귀를 판정하게 된다 (iter96 규약)
      const b = tileArtBox(terrainTile(t), t.x, t.y, t.r * 2);
      if (!b) return null;
      const by = b.y0 - RENDER.terrain.barH * (1 + RENDER.terrain.barUp);
      return {
        cellFill: +((b.y1 - b.y0) / (t.r * 2)).toFixed(3),
        artTop: +b.y0.toFixed(1),
        artBottom: +b.y1.toFixed(1),
        barBottom: +(by + RENDER.terrain.barH).toFixed(1),
        barGap: +(b.y0 - (by + RENDER.terrain.barH)).toFixed(1),
        barW: +((b.x1 - b.x0) * RENDER.terrain.bar).toFixed(1),
        artW: +(b.x1 - b.x0).toFixed(1),
      };
    })(),
    // **F ⓑ의 순간 상태** — 「지금 맞고 있는가 / 지금 무너지는 중인가 / 상한 미만인가」.
    // 피격 창은 0.32초·붕괴 창은 0.8초뿐이라 이 셋이 없으면 **컷을 찍을 warm을 못 고른다**
    // (`tools/patscan.mjs`의 `terr` 열이 이 값을 훑는다 — 보스 예고와 같은 부류의 짧은 창이다)
    hitting: map.terrain.filter((t) => (t.hitFx ?? 0) > 0).length,
    falling: map.terrain.filter((t) => (t.fallFx ?? 0) > 0).length,
    damaged: map.terrain.filter((t) => Number.isFinite(t.hp0) && !t.destroyed && t.hp < t.hp0).length,
    hillR: map.terrain.filter((t) => t.kind === "hill").map((t) => +t.r.toFixed(1)),
    // **파괴 가능 지물만의** 레일 여유 최소값. 위 `minRailClearance`는 전 지형이 대상이라
    // 언덕·웅덩이가 최소값을 잡고 있어(41.5) **성벽 배수(`wallScale`)의 안전성을 못 잰다** —
    // `TERRAIN.place.railClear` 80이 파국 구간(레일 어깨 46)과 가르는 선이 바로 이 값이다
    minWallRailClear: +Math.min(
      ...map.terrain.filter((t) => t.kind === "wall").map((t) => distToLoop(t.x, t.y) - t.r)
    ).toFixed(1),
    // **전투 환 점유** (§5.0 「지형 배치」 개정 · DESIGN §0.8 판정 ③ · iter167).
    // 「루프 반경 = 1 U」 단위로 살아 있는 파괴 가능 지물이 **전선 안에 몸을 걸치는가**를 센다.
    // ⚠ 판정은 «중심»이 아니라 **안쪽 가장자리**(`d − r`)다 — 사선을 막는 것은 몸통이지 중심이 아니다.
    // `distU`는 중심 거리(오름차순)라 두 눈금을 나란히 읽는다. `outerU`가 이 런이 쓴 전선 값이다
    ring: (() => {
      const ws = map.terrain.filter((t) => t.kind === "wall" && !t.destroyed);
      const outerU = MAPS[map.id].place.ringOuterU;
      const near = (t: (typeof ws)[number]) => (Math.hypot(t.x - map.cx, t.y - map.cy) - t.r) / map.outerR;
      const inFront = ws.filter((t) => near(t) <= outerU).length;
      // **골렘 잔해를 뺀 눈금** (`own` · iter168). 위 `ws`는 `kind === "wall"`이라 **골렘 잔해(scrap 0)까지
      // 센다** — 잔해는 배치 규칙(`stageTerrain`)의 산물이 아니라 «런 중의 사건»이고 수명이 짧다
      // (`ENEMY.armor.debrisCap 8`). 평원 웨이브 12에서 살아 있는 성벽 8장 중 **6장이 잔해**라
      // `pct` 하나로는 「배치 규칙이 시간이 가도 서 있는가」를 못 읽는다. 열쇠는 `map.ts`의 `own`과 같다
      const own = ws.filter((t) => t.scrap !== 0);
      const ownIn = own.filter((t) => near(t) <= outerU).length;
      return {
        outerU,
        inFront,
        pct: ws.length ? +((inFront / ws.length) * 100).toFixed(1) : 0,
        own: {
          alive: own.length,
          inFront: ownIn,
          pct: own.length ? +((ownIn / own.length) * 100).toFixed(1) : 0,
        },
        distU: ws.map((t) => +(Math.hypot(t.x - map.cx, t.y - map.cy) / map.outerR).toFixed(3)).sort((a, b) => a - b),
        nearU: ws.map((t) => +near(t).toFixed(3)).sort((a, b) => a - b),
      };
    })(),
    // 지형 상호작용 (§4.1). 성벽만 파괴 가능, 언덕·웅덩이는 통과하되 감속
    wallHp: TERRAIN.wallHp,
    wallsAlive: map.terrain.filter((t) => t.kind === "wall" && !t.destroyed).length,
    // **기능하는 지형지물** = 직사 차단 + 이동 차단이 둘 다 걸리는 것 (큐 1 판정치, 목표 ~10).
    // 언덕은 직사만 · 호수는 이동만이라 이 수에 들지 않는다 — 성벽(잔해 제외)이 유일하다
    blockers: map.terrain.filter((t) => blocksLos(t) && blocksMovement(t)).length,
    // 스테이지별 보충 실적 (§4.2 "3~4개씩"). [스테이지1 초기채움, 스테이지2, 스테이지3]
    stageAdds: terrainAdds,
    // **보충이 굶었는가** (§4.2 「다 부숴도 기믹이 계속 작동하게」의 유일한 눈금 · iter124 신설).
    // `stageWants[i] > stageAdds[i]`인 스테이지가 굶은 것이고, `starvedFrom`은 **그 뒤로 한 번도
    // 안 채워진 첫 스테이지**(1-기반 · 없으면 null)다. 옛 코드의 실측은 평원 2 · 도시 12였다
    stageWants: terrainWants,
    slotFree: slotFree(),
    starvedFrom: (() => {
      let from: number | null = null;
      for (let i = 0; i < terrainWants.length; i++) {
        if (terrainAdds[i] >= terrainWants[i]) from = null;
        else if (from === null) from = i + 1;
      }
      return from;
    })(),
    place: MAPS[map.id].place,
    // **맵 2종 체계** (§0.7 J). `id`가 규칙 한 벌을 결정한다 — 평원 컷에서는 이 블록이 전부
    // 기존 값과 같아야 한다(회귀 판정선). `cracked`는 2단 파괴가 실제로 두 단계로 도는지의 눈금
    map: {
      id: map.id,
      // **런의 경로** (§0.7 O ⓑ · `BALANCE.ROUTE`). `pinned`면 `?map=`이 경로를 끈 것이고
      // (단일 맵 회귀 컷) `switches`가 빈 채로 끝난다. 경로 런은 스테이지 7에 한 줄이 선다
      route: MAP_PIN ? null : ROUTE.map((l) => `s${l.fromStage}:${l.map}`).join(" → "),
      pinned: MAP_PIN,
      switches: mapSwitches.map((m) => ({ stage: m.stage, wave: m.wave, t: m.t, from: m.from, to: m.to })),
      rule: MAPS[map.id],
      wallR: +(map.terrain.find((t) => t.kind === "wall")?.r ?? 0).toFixed(1),
      // **이 런이 실제로 쓴 두 손잡이** (QA `?wallscale=`·`?crackr=`가 덮었으면 그 값).
      // `rule`은 정본을 찍으므로 사다리 컷에서 둘이 갈린다 — 그것이 「A/B가 실제로 걸렸나」의 검산이다
      wallScale: wallScaleOf(map.id),
      losR: crackLosR(),
      // **이 런이 실제로 쓴 2단 파괴 여부** (QA `?twostage=`가 덮었으면 그 값 · `rule.twoStage`는
      // 정본을 찍으므로 사다리 컷에서 둘이 갈린다 = 「A/B가 실제로 걸렸나」의 검산)
      twoStage: twoStageOf(map.id),
      // **이 런이 실제로 쓴 드랍 가치**(맵 칸 `MAPS[id].drop` · QA `?drop=`이 덮었으면 그 값).
      // 평원 0.2 = §0.5 정본 · 도시 0.3 = §0.7-B 도시 맵 값에 iter140이 더한 칸(INBOX #69 ③)
      drop: dropValueOf(map.id),
      // 도시의 구운 지물이 막은 범위 (QA `?cover=`가 덮었으면 그 값 · 기본 "off").
      // **열린 미결 질문의 판정 칸**이다 — map.ts `solidCover` 주석에 사다리가 있다
      cover: coverMode(),
      wallStart: wallStartOf(map.id),
      walls: map.terrain.filter((t) => t.kind === "wall").length,
      cracked: map.terrain.filter((t) => t.cracked && !t.destroyed).length,
      crackedTotal: combat.cracked,
      // **파괴 3단이 실제로 세 갈래로 그려지는가** (§0.7 J1-b). `[온전, 파손, 잔해]`의 머릿수 —
      // 소멸 맵(도시)에서 2단은 안 그려지므로 그 칸은 `vanished`와 같은 수를 찍는다.
      // `worn` = 「받은 피해가 있어 균열이 얹힌」 지물 수 = 누적 연출이 실제로 도는지의 눈금
      stages: (() => {
        const n = [0, 0, 0];
        for (const t of map.terrain) if (t.kind === "wall") n[terrainStage(t)]++;
        return n;
      })(),
      worn: map.terrain.filter(
        (t) => t.kind === "wall" && !t.destroyed && Number.isFinite(t.hp0) && t.hp < t.hp0
      ).length,
      vanished: MAPS[map.id].vanish ? map.terrain.filter((t) => t.destroyed).length : 0,
      // **폭발 지물** (§0.7 J1-c · 감독 #66 ⑤). `n`이 0이면 이 맵에 폭발 지물이 없는 것이고
      // (평원은 언제나 그렇다) 그때 아래 칸은 전부 0이어야 한다.
      //  · `hp`/`hpLeft` = 이 런이 실제로 쓴 HP(QA `?fuelhp=`가 덮었으면 그 값)와 남은 HP 목록.
      //    `strikes`(= hp / 포격 1발의 지형 피해)가 ⓒ「언제 터뜨릴지 고른다」의 값이다
      //  · `blastRWorld` = 폭발 반경(월드) · `artRWorld` = 조준 포격 착탄 반경. **앞이 더 커야**
      //    ⓐ의 「큰 폭발」이 성립한다
      //  · `blasts`/`hits`/`dmg` = ⓐ의 실적 · **`chain` = ⓑ의 유일한 판정치**(0이면 연쇄가 장식이다)
      //  · `inBlast` = 지금 폭발 반경 안에 있는 **다른 지물** 수 = 연쇄가 «구조적으로» 가능한가
      fuel: (() => {
        const rows = map.terrain.filter((t) => explosive(t.kind));
        const per = ARTILLERY.dmg * ARTILLERY.terrainMult;
        const r0 = rows[0];
        return {
          n: rows.length,
          hp: fuelHpValue(),
          strikes: +(fuelHpValue() / per).toFixed(2),
          hpLeft: rows.map((t) => +t.hp.toFixed(1)),
          destroyed: rows.filter((t) => t.destroyed).length,
          cracked: rows.filter((t) => t.cracked && !t.destroyed).length,
          rWorld: r0 ? +r0.r.toFixed(1) : 0,
          blastRWorld: r0 ? +(r0.r * FUEL.blastR).toFixed(1) : 0,
          artRWorld: +(ARTILLERY.radius * combat.unit).toFixed(1),
          inBlast: r0
            ? map.terrain.filter(
                (q) => q !== r0 && Math.hypot(q.x - r0.x, q.y - r0.y) <= r0.r * FUEL.blastR + q.r
              ).length
            : 0,
          canon: FUEL,
          // **§0.7 J2의 «없는» 네 번째 자물쇠**(iter116 발견 · 미결 질문). `acidLock`이 false면
          // 적의 산성 웅덩이가 지형을 녹인다 — 도시에서 J2 문면이 거짓이고 위 ⓒ도 헐거워진다.
          // `meltDem`이 그 실적이고(도시 풀런 실측 9), `?acidlock=1`이 사다리 손잡이다
          acidLock: acidLockOn(),
          blasts: combat.fuelBlasts,
          hits: combat.fuelHits,
          dmg: +combat.fuelDmg.toFixed(1),
          chain: combat.fuelChain,
        };
      })(),
      // §0.7 J1 「사선을 여는 데 내 화력을 쓴다」 — 평원에서는 언제나 0이다
      terrainShots: combat.terrainShots,
      terrainShotDmg: +combat.terrainShotDmg.toFixed(1),
      losBlocked: combat.losBlocked,
      // §0.7 J2 「적은 지형을 안 부순다」 — 도시에서는 셋 다 0이어야 한다
      siegeRams: combat.siegeRams,
      siegeDemolished: combat.siegeDemolished,
      breakerDemolished: combat.breakerDemolished,
    },
    wallsDestroyed: map.terrain.filter((t) => t.destroyed).length,
    wallHpLeft: map.terrain.filter((t) => t.kind === "wall").map((t) => t.hp),
    slow: TERRAIN.slow,
    // 감속 자가 검증: 지형 중심에서의 실이속 배율이 TERRAIN.slow와 같아야 한다.
    // 적이 감속 지형을 밟는 것은 확률적이라(플로우필드가 우회를 선호) 실측 표본만으로는 판정이 안 된다
    // ⚠ **이 맵에 실제로 있는 갈래만 돈다** — 갈래를 손으로 적어 두면 그 갈래가 없는 맵에서
    // `find`가 undefined를 주고 __probe 전체가 터진다(도시 맵에 호수·웅덩이·언덕이 한 행도
    // 없어진 §0.7 J1-e에서 실제로 밟았다). 맵마다 목록이 갈리므로 판정도 목록에서 유도한다
    slowSelfCheck: [...new Set(map.terrain.map((t) => t.kind))].sort().map((k) => {
      const t = map.terrain.find((x) => x.kind === k)!;
      return [k, +slowAt(map, t.x, t.y).toFixed(2)];
    }),
    slowOnGrass: slowAt(map, 4, 4),
  },
  train: (() => {
    const p = train.cars.map((_, i) => at(track, carS(train, i)));
    // 이웃 칸 중심거리 (직선 거리라 호 길이 CAR_PITCH보다 살짝 짧은 게 정상)
    const gaps = p.slice(1).map((q, i) => Math.hypot(q.x - p[i].x, q.y - p[i].y));
    return {
      cars: train.cars.map((c) => c.kind),
      // 지원칸 (§10 2차 · §6.1). `rate`가 1이 아닌 칸 = 탄약고가 인접한 무기칸,
      // `overHills`가 true인 칸 = 관측칸이 인접한 칸. **편성 순서에서 유도되므로 재배치가 즉시 반영된다**
      support: {
        reach: SUPPORT_REACH,
        stats: SUPPORT,
        active: activeSupport(),
        // 관측칸의 **조건부 등장** (BALANCE §4.5, 감독 #47). `hills`가 `needHills` 미만이면
        // 상점·카드에서 통째로 빠진다 — 대공 플랙과 같은 문법이다
        hills: mapHillsValue(),
        needHills: SUPPORT.observer.needHills,
        observerUnlocked: supportUnlocked("observer"),
        rate: train.cars.map((_, i) => +supportAt(train, i).rate.toFixed(3)),
        overHills: train.cars.map((_, i) => supportAt(train, i).overHills),
        /** 인접 효과를 실제로 받는 **무기칸** 수 (지원칸끼리 붙어 효과가 새는 것을 잡는 지표) */
        fedWeapons: train.cars.filter((c, i) => WEAPONS[c.kind] && (supportAt(train, i).rate !== 1 || supportAt(train, i).overHills)).length,
      },
      lapTime: TRAIN.lapTime,
      speed: +train.speed.toFixed(1),
      trackLen: +track.total.toFixed(1),
      laps: +(train.speed * simT / track.total).toFixed(2),
      carPitch: CAR_PITCH,
      gapMin: +Math.min(...gaps).toFixed(1),
      gapMax: +Math.max(...gaps).toFixed(1),
      // 칸 중심~레일 샘플점 최단거리. 칸은 항상 선분 위에 있으므로 샘플 간격 절반(≈3.2)이 상한이다
      maxRailOffset: +Math.max(...p.map((q) => distToLoop(q.x, q.y))).toFixed(2),
      // 12량 점유 / 루프 둘레 (§9 상한 0.60)
      maxOccupancy: +((TRAIN.maxCars * CAR_PITCH) / track.total).toFixed(3),
      // 포탑 회전 (큐 1). 차체·포탑 2패스 렌더의 자기 검산 —
      // missing이 비어야 시트가 제대로 붙은 것이고, offDeg(포탑각 − 진행각)가 전부 0이면
      // 포탑이 차체에 붙박여 있다는 뜻이다(= 회전이 죽었다). heightRatio는 시트 축척 환산값
      turret: {
        turnRate: RENDER.turret.turnRate,
        bodies: train.cars.map((c) => bodyName(c.kind)),
        names: train.cars.map((c) => turretName(c.kind, c.tier) ?? null),
        missing: [...new Set(train.cars.flatMap((c) => [bodyName(c.kind), turretName(c.kind, c.tier)]))].filter(
          (n): n is string => !!n && !sprite(n)
        ),
        // **색 보정 누락 검산** (iter94). 차체·포탑 셀이 `tintOf`의 칸 보정을 받는지 이름마다 묻는다 —
        // 비어야 통과다. 시트가 늘 때 조용히 빠지는 것이 이 파이프라인의 유일한 고장 방식이고
        // (iter82의 티어 시트 36셀이 그렇게 빠졌다) 컷으로는 「좀 어둡네」로만 보여 못 잡는다
        untinted: [
          ...new Set(
            CAR_KINDS.flatMap((k) => [bodyName(k), ...[1, 2, 3].map((t) => turretName(k, t))]).filter(
              (n): n is string => !!n
            )
          ),
        ].filter((n) => sprite(n) && !carTinted(n)),
        // **포탑–갑판 밝기 대비** (§0.7-C `RENDER.turretTint` · iter138). 보정 «후» 평균 명도(0~255)다.
        // ⚠ **`gap`의 두 표본은 iter94가 쓴 그 둘이다** — `turret_machinegun_t1`(82.3)과 평판차 갑판(77.9).
        // 감독이 「실측 4포인트 → 목표 12~15포인트」를 **그 눈금 위에서** 못박았으므로 표본을 바꾸면
        // 창이 뜻을 잃는다. `deck`은 `car_flat`의 **따뜻한 픽셀만**이다 — 통짜 평균을 재면 어두운
        // 금속 프레임이 갑판을 12포인트나 끌어내려(66.7) 창이 그냥 안 맞는다.
        // `turretMean`·`bodyMean`은 「한 셀만 밝아진 것이 아니다」를 보는 참고 열이다
        luma: (() => {
          const avg = (ns: (string | undefined)[]) => {
            const v = ns.map((n) => (n ? spriteLuma(n) : null)).filter((x): x is number => x != null);
            return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
          };
          const turret = spriteLuma("turret_machinegun_t1");
          const deck = spriteLuma("car_flat", "warm");
          return { tint: RENDER.turretTint, turret, deck,
            gap: turret != null && deck != null ? +(turret - deck).toFixed(1) : null,
            turretMean: avg(CAR_KINDS.filter(hasTurret).flatMap((k) => [1, 2, 3].map((t) => turretName(k, t)))),
            bodyMean: avg(CAR_KINDS.filter(hasTurret).map((k) => bodyName(k))),
            flatAll: spriteLuma("car_flat"), flatFrame: spriteLuma("car_flat", "cool") };
        })(),
        // **어느 셀이 어느 시트에서 왔나** (iter98). `heightRatio`(= `turretHeight`)는 `src` px를
        // `car_flat`과 견주는 식이라 **같은 시트이거나 축척을 손으로 맞춘 시트**에서만 뜻이 있다.
        // 이 칸이 없으면 「차체도 같은 식으로 그려야 한다」가 그럴듯해 보이는데, 차체 4종은 시트가
        // 셋으로 갈려 있어 성립하지 않는다(train.ts `turretHeight` 주석) — 그 사실의 기계 근거다
        sheets: Object.fromEntries(
          [...new Set(CAR_KINDS.flatMap((k) => [bodyName(k), ...[1, 2, 3].map((t) => turretName(k, t))]))]
            .filter((n): n is string => !!n && !!sprite(n))
            .map((n) => [n, sprite(n)!.sheet])
        ),
        heightRatio: Object.fromEntries(
          CAR_KINDS.filter(hasTurret).map((k) => [k, +(turretHeight(k) / LAYOUT.carLen).toFixed(3)])
        ),
        // 티어별 외형 (§0.6 E). cells = 무기별 T1·T2·T3가 **실제로 고르는 셀 이름**이고,
        // flat = 세 티어가 같은 셀로 떨어진 무기(= 3단이 안 갈린 무기)다 — 비어야 판정 통과다.
        // tierHeight는 티어가 올라갈수록 커지는가(포신이 뻗는가)를 수치로 본다
        tiers: (() => {
          const kinds = CAR_KINDS.filter(hasTurret);
          const cells = Object.fromEntries(kinds.map((k) => [k, [1, 2, 3].map((t) => turretName(k, t) ?? null)]));
          return {
            cells,
            flat: kinds.filter((k) => new Set(cells[k]).size < 3),
            height: Object.fromEntries(
              kinds.map((k) => [k, [1, 2, 3].map((t) => +(turretHeight(k, t) / LAYOUT.carLen).toFixed(3))])
            ),
          };
        })(),
        offDeg: train.cars.map((c, i) => {
          if (!hasTurret(c.kind)) return null; // 포탑이 없는 칸(수집칸)은 각도 자체가 없다
          const d = c.turretAng - p[i].ang;
          return +((Math.atan2(Math.sin(d), Math.cos(d)) * 180) / Math.PI).toFixed(1);
        }),
      },
    };
  })(),
  // 편성 대조표 (큐 1). BALANCE §6 예산 규칙과 §2 규모·수입 표를 **한 화면에서** 검산하려고 편다.
  // budget = 실효 HP 예산(좀비=1), used = 반올림 후 실제로 쓴 예산, n = 개체 수(유도값),
  // drop = 분열체까지 포함한 드랍 총합(§2 실효 수입은 여기 회수율 0.85를 곱한 값)
  waves: (() => {
    const rows = WAVES.map((w, i) => {
      const counts = waveCounts(i);
      const used = Object.entries(counts).reduce((a, [k, n]) => a + n * budgetUnits(k), 0);
      // §0.5: 드랍 가치 ×0.2 (물량 ×5와 상쇄 — "런 총수입 ~690 유지"의 검산이 성립하려면 곱해야 한다)
      const drop = Object.entries(counts).reduce((a, [k, n]) => a + n * effScrap(k), 0) * dropValueOf(mapAtWave(i));
      const n = Object.values(counts).reduce((a, c) => a + c, 0);
      const slimeU = (counts.slime ?? 0) * budgetUnits("slime");
      return {
        w: i + 1,
        stage: w.stage,
        budget: waveBudget(i),
        budgetBase: w.budget,
        // 보스 웨이브 감액(§6 65%) **전**의 기저. §6 증가율 상한은 이 열로 잰다 (balance.ts WaveDef 주석)
        budgetNoBoss: w.base,
        used: +used.toFixed(1),
        n,
        drop: +drop.toFixed(1),
        len: w.len,
        spawnSec: +(w.len * STAGE.spawnDuty).toFixed(1),
        burst: w.burst,
        // 웨이브 = 타이머가 된 뒤 **동시 생존 밀도를 결정하는 값**(감독 #5 V4).
        // 동시 생존 ≈ spawnRate × 개체 수명(접근 7.3초 + 처치 시간) — 이 곱이 밀도의 상한이다.
        // 스폰 창(spawnSec)이 분모라 창을 조이면 이 값이 그대로 올라간다
        spawnRate: +(n / (w.len * STAGE.spawnDuty)).toFixed(2),
        // §6 슬라임 비중 상한 25% (실효 HP 기준)
        slimePct: +((slimeU / used) * 100).toFixed(0),
        counts,
      };
    });
    const byStage = Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).map((st) => {
      const r = rows.filter((x) => x.stage === st);
      const drop = r.reduce((a, x) => a + x.drop, 0);
      return {
        stage: st,
        budget: r.reduce((a, x) => a + x.budget, 0),
        // §5 검산: 스테이지 3의 실효 HP 합. **§0.5로 개체 HP가 ×0.4**라 예산 단위 합에 그 배율을 곱한다
        // (물량 ×5 × HP ×0.4 = 총 HP ×2 — §0.5의 "공속 ×2와 정합"이 여기서 확인된다)
        effHpSum: +(r.reduce((a, x) => a + x.used, 0) * effHp("zombie") * enemyHpMult()).toFixed(0),
        n: r.reduce((a, x) => a + x.n, 0),
        drop,
        // §2 기대 수입은 **실효(회수 후)** 기준 — 실측 회수율 0.85를 곱한다
        income: +(drop * 0.85).toFixed(0),
      };
    });
    return {
      // §6 규칙 자기 검산: 스테이지 안 +25%, 스테이지 경계는 **직전 웨이브 대비** +30%,
      // 그리고 인접 웨이브 간 증가율 **상한 +35%**(감독 #15). stepMax가 상한을 넘으면 규칙 위반이다
      // §6 증가율 상한은 **기저 곡선**(감액 전)으로 잰다 — 보스 웨이브의 −35%와 그 다음 웨이브의
      // 복귀를 실제 예산으로 재면 6웨이브마다 ×2가 잡히는데, 그건 곡선이 끊긴 게 아니라 스파이크의
      // 반대편이다(9웨이브 체제에서는 보스가 마지막이라 복귀가 없어 이 구분이 필요 없었다)
      budgetStepMax: +Math.max(...WAVES.slice(1).map((w, i) => w.base / WAVES[i].base)).toFixed(3),
      budgetStepCap: STAGE.budgetStepMax,
      budgetStepOk: WAVES.slice(1).every((w, i) => w.base / WAVES[i].base <= STAGE.budgetStepMax),
      // 실제 예산(감액 반영) 기준의 최대 점프 — 위와 갈리는 값이 곧 보스 웨이브 복귀분이다
      budgetStepMaxRaw: +Math.max(...WAVES.slice(1).map((w, i) => w.budget / WAVES[i].budget)).toFixed(3),
      // 36행을 다 뱉으면 probe가 읽히지 않는다 — 곡선의 형태는 이 5점으로 본다 (§10 2차 장기 곡선).
      // ⚠ **표본 자리가 갈렸다**(감독 #72 ①) — 옛 다섯은 1·9·20·40·60이었다
      budgetAt: [1, 9, 18, 27, 36].map((w) => ({ w, base: WAVES[w - 1].base, budget: WAVES[w - 1].budget })),
      budgetSum: WAVES.reduce((a, w) => a + w.budget, 0),
      spawnDuty: STAGE.spawnDuty,
      stageGapSec: STAGE.stageGapSec,
      // §1 "웨이브 길이 55~70초" 자기 검산 — 웨이브 길이는 WAVES[].len 그 값이다
      waveLenRange: [Math.min(...WAVES.map((w) => w.len)), Math.max(...WAVES.map((w) => w.len))],
      // §3 신표 자기 검산: 총 웨이브 36 · 스테이지 12 · 정차 11 · 보스 6기(6n) — 감독 #72 ①
      waves: WAVES.length,
      stages: STAGE_COUNT,
      stations: STAGE_COUNT - 1,
      bossWaves: WAVES.map((_, i) => i + 1).filter((w) => w % BOSS.every === 0),
      // 런 예상 길이(분) = 웨이브 길이 합 + 정차 간격. #25 ②의 "75분까지 허용"을 재는 열이다
      runMin: +((WAVES.reduce((a, w) => a + w.len, 0) + (STAGE_COUNT - 1) * STAGE.stageGapSec) / 60).toFixed(1),
      // 신규 적종이 어느 웨이브에서 처음 나오는지 (§6 "스테이지 경계 = 신규 1~2 해금")
      unlock: (() => {
        const seen = new Set<string>();
        const out: Record<string, number> = {};
        rows.forEach((r) => {
          for (const k of Object.keys(r.counts)) if (!seen.has(k)) { seen.add(k); out[k] = r.w; }
        });
        return out;
      })(),
      rows,
      byStage,
    };
  })(),
  // **60웨이브 성장 곡선의 공급 쪽** (큐 1 — "스테이지별 수입 vs 필요 DPS"를 한 표로).
  // 여기 있는 것은 전부 정본 유도값이다: §2 기대 수입(드랍 × 회수율 0.85, **보스 드랍 제외**)을
  // 스테이지까지 누적하고, 그 돈을 §3 가격표에 전액 쏟았을 때의 명목 DPS를 낸다.
  //  · dps9  = §0 원칙 5의 기대 편성(9칸)까지만 사고 나머지는 강화 — `?shop=auto`와 같은 정책
  //  · dps12 = 칸 상한(12)까지 사는 변형. **두 열의 포화값이 현행 상점의 천장**이다
  //    (iter47 티어업 구현 후에는 T3 Lv15 = 메뉴가 가진 절대 상한에서 멈춘다)
  // 수요 쪽("그 스테이지를 넘기는 데 필요한 DPS")은 코드가 못 만든다 — `?corehp` 풀런으로 잰다
  growth: (() => {
    const income = Array.from({ length: STAGE_COUNT }, (_, s) => {
      let drop = 0;
      WAVES.forEach((w, i) => {
        if (w.stage !== s + 1) return;
        drop += Object.entries(waveCounts(i)).reduce((a, [k, n]) => a + n * effScrap(k), 0) * dropValueOf(mapAtWave(i));
      });
      return drop * 0.85;
    });
    let cum = 0;
    return income.map((inc, i) => {
      cum += inc;
      return {
        stage: i + 1,
        income: +inc.toFixed(0),
        cum: +cum.toFixed(0),
        dps9: affordDps(cum, AUTO_TARGET_CARS),
        dps12: affordDps(cum, TRAIN.maxCars),
      };
    });
  })(),
  enemies: (() => {
    // 처치된 적까지 포함한 누적 로그 (생존자만 세면 표본이 편향된다).
    // **이속별로 가른다** (감독 #19 ③): §1의 대조창은 **이속 1.0 잡몹**의 것이고, 저속 개체는
    // 배율만큼 길어지는 것이 정상이다 — 섞으면 보스만 있는 컷의 중앙값이 14.2로 찍힌다
    const done = field.approachLog.filter((a) => a.speed === 1).map((a) => a.sec).sort((a, b) => a - b);
    const bySpeed = [...new Set(field.approachLog.map((a) => a.speed))]
      .sort((a, b) => b - a)
      .map((sp) => {
        const g = field.approachLog.filter((a) => a.speed === sp).map((a) => a.sec).sort((a, b) => a - b);
        return {
          speed: sp,
          n: g.length,
          median: +g[g.length >> 1].toFixed(2),
          // 이속으로 되돌린 값. §1의 4~9초 창은 이 열로 봐야 한다
          norm: +(g[g.length >> 1] * sp).toFixed(2),
        };
      });
    return {
      // 웨이브 진행 (큐 1). count는 WAVES에 없다 — 예산(실효 HP)에서 편성이 유도한 값이다
      wave: `${field.waveIdx + 1}/${WAVES.length}`,
      stage: `${WAVES[field.waveIdx].stage}/${STAGE_COUNT}`,
      // §0.5 물량 배율이 곱해진 **실제** 예산. 표값(§6)은 waveBudgetBase에 그대로 남긴다
      waveBudget: waveBudget(field.waveIdx),
      waveBudgetBase: WAVES[field.waveIdx].budget,
      waveCount: field.roster.length,
      // 웨이브 = 타이머 (감독 #11 ①). waveLen = BALANCE §1 "웨이브 길이 60~75초" 정본
      waveT: +field.waveT.toFixed(1),
      waveLen: WAVES[field.waveIdx].len,
      waveSpawnSec: +(WAVES[field.waveIdx].len * STAGE.spawnDuty).toFixed(1),
      waveGap: +field.gap.toFixed(2),
      cleared: field.cleared,
      runT: +field.t.toFixed(1),
      fieldCap: ENEMY.fieldCap,
      // 상한에 스폰이 밀린 프레임 수 — 0이 아니면 §6 예산이 뒤로 밀렸다(물량 ×5의 부작용 지표)
      capHits: field.capHits,
      kindsQa: field.kinds,
      spawned: field.spawned,
      alive: field.list.length,
      // 감독 #5 V4 "전투 밀도"의 측정 지표. alive는 캡처 프레임 운을 타므로 런 최대치를 함께 본다
      aliveMax: field.aliveMax,
      // 겹침의 직접 증거 — 지금 살아 있는 적 중 **이전 웨이브에서 넘어온** 수 (감독 #11 ①)
      overlap: field.list.filter((e) => e.wave < field.waveIdx).length,
      // **깊이 정렬 검산** (iter95 · §0.6 C2 「밀집 3열」). 「겹친 두 개체 중 **앞줄(y가 큰 쪽)**이
      // 먼저 그려져 뒷줄에 덮이는가」를 전수로 센다 — 화면에서는 「뭉쳐 보인다」로만 읽혀서
      // 컷으로는 못 잡는 부류다(iter94 `train.turret.untinted`와 같은 규약).
      // `pairs`가 0이면 이번 프레임에 겹친 적이 없다는 뜻이라 `inverted` 0은 근거가 아니다.
      // ⚠ 공중↔지상 쌍은 안 센다 — 공중이 위인 것은 **의도**다(§8.⑤ `drawOrder` 주석)
      depth: (() => {
        const ord = drawOrder(field);
        const air = (e: (typeof ord)[number]) => ENEMY_STATS[e.kind].air === true;
        let pairs = 0;
        let inverted = 0;
        for (let i = 0; i < ord.length; i++) {
          for (let j = i + 1; j < ord.length; j++) {
            const a = ord[i];
            const b = ord[j];
            if (air(a) !== air(b)) continue;
            // 겹침 상자 = 「접지 타원 반경(`RENDER.shadow.rx`)만큼의 반폭 × 표시 높이의 반높이」.
            // 반폭을 새로 지어내지 않으려고 이미 있는 발자국 비율을 그대로 쓴다
            const s = enemyH(a.kind) + enemyH(b.kind);
            if (Math.abs(a.x - b.x) >= s * RENDER.shadow.rx || Math.abs(a.y - b.y) >= s * 0.5) continue;
            pairs++;
            if (a.y > b.y) inverted++;
          }
        }
        return { sorted: qaYSortOn(), pairs, inverted, invPct: pairs ? +((inverted / pairs) * 100).toFixed(1) : 0 };
      })(),
      // **진영 로테이션** (§0.6 D). 「지금 무슨 진영인가」(`now`)와 「그 진영이 실제로 무엇을
      // 세웠는가」(`roster`)를 함께 찍는다 — 둘이 어긋나면 조성 치환이 안 돈 것이다.
      // `plan`은 12스테이지 전체의 교대표라 **주기가 정본(3~5)의 창 안에 있는지**를 한 줄로 검산한다.
      // `roles`는 이번 웨이브의 «역할 슬롯 → 실제 종» 대조표이고, `mixSum`이 100이 아니면 비중이 샌 것이다.
      // **`legs`·`unlock`이 감독 #72 ④의 판정 칸이다** — `legs`는 `ROUTE`의 구간별 진영 목록(도시 구간이
      // «도시에 맞는 조성»인지가 여기서 한 줄로 읽힌다) · `unlock`은 **적종 → 첫 등장 웨이브**의 런 누적
      // 로그다(`n` = 런에서 실제로 선 종 수 · `medWave` = 첫 등장 웨이브의 중앙값 = 「해금 속도」 그 자체)
      faction: (() => {
        const fid = factionOfWave(field.waveIdx);
        const mix = WAVES[field.waveIdx].mix;
        const byKind = field.roster.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});
        return {
          now: fid,
          name: FACTIONS[fid].name,
          rotate: factionRotateValue(),
          rotateCanon: FACTION_ROTATE,
          qa: qaFactionValue(),
          shown: field.faction,
          plan: Array.from({ length: STAGE_COUNT }, (_, i) => factionAt(i + 1)),
          switches: Array.from({ length: STAGE_COUNT }, (_, i) => factionAt(i + 1)).filter((f, i, a) => i > 0 && f !== a[i - 1]).length,
          roles: Object.fromEntries(MIX_ROLES.map((r) => [r, factionKind(fid, r)])),
          mixSum: Object.values(mix).reduce((a, b) => a + b, 0),
          roster: byKind,
          rosterN: field.roster.length,
          legs: ROUTE.map((leg) => ({
            map: leg.map,
            fromStage: leg.fromStage,
            factions: Array.from({ length: STAGE_COUNT }, (_, i) => i + 1)
              .filter((st) => routeMapOf(st) === leg.map && routeLegStartOf(st) === leg.fromStage)
              .map((st) => factionAt(st))
              .filter((f, i, a) => f !== a[i - 1]),
          })),
          unlock: (() => {
            const log = field.kindFirstWave;
            const ws = Object.values(log).sort((a, b) => a - b);
            return {
              n: ws.length,
              medWave: ws.length ? ws[Math.floor((ws.length - 1) / 2)] : 0,
              maxWave: ws.length ? ws[ws.length - 1] : 0,
              byWave: Object.fromEntries(Object.entries(log).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))),
            };
          })(),
        };
      })(),
      // **부대 편성** (§0.6 C1·C2). 「대형이 화면에 있는가」는 컷 한 장으로는 못 세고 여기서만
      // 기계 검산이 된다. `plan`은 이번 웨이브를 그릇에 나눠 담은 결과(부대 수 / 무리 수 / 크기),
      // `live`는 지금 필드에 서 있는 부대와 그 **대형 유지 오차**(슬롯까지의 거리, 월드)다 —
      // 오차 중앙값이 `COMPANY.pullAt`(26)을 넘으면 대형이 이미 뭉개진 것이다
      companies: (() => {
        const plan = field.plan;
        const cos = plan.filter((g) => g.form);
        const err: number[] = [];
        const byId = new Map(field.companies.map((c) => [c.id, c]));
        for (const e of field.list) {
          const co = e.co >= 0 ? byId.get(e.co) : undefined;
          // **멈춰 선 개체는 표본에서 뺀다** — 산병의 정지 사격·코어 도달·착지는 전부 이동 분기보다
          // 앞에서 끝나므로 슬롯을 안 본다. 섞으면 「대형이 뭉개졌다」가 아니라 「교전이 시작됐다」를 잰다
          if (!co || e.firing || e.atCore || e.perched !== null) continue;
          const o = slotOffset(co.form, e.slot, co.n);
          const ca = Math.cos(co.ang);
          const sa = Math.sin(co.ang);
          err.push(Math.hypot(co.x + o.x * ca - o.y * sa - e.x, co.y + o.x * sa + o.y * ca - e.y));
        }
        err.sort((a, b) => a - b);
        return {
          planCompanies: cos.length,
          planLoose: plan.length - cos.length,
          planSizes: cos.map((g) => g.kinds.length),
          planForms: cos.reduce<Record<string, number>>((a, g) => {
            a[FORMATIONS[g.form!].name] = (a[FORMATIONS[g.form!].name] ?? 0) + 1;
            return a;
          }, {}),
          released: field.planAt,
          live: field.companies.length,
          liveForms: field.companies.reduce<Record<string, number>>((a, c) => {
            a[FORMATIONS[c.form].name] = (a[FORMATIONS[c.form].name] ?? 0) + 1;
            return a;
          }, {}),
          inCompany: field.list.filter((e) => e.co >= 0).length,
          cmdrs: field.list.filter((e) => e.cmdr).length,
          slotErrMedian: err.length ? +err[err.length >> 1].toFixed(1) : null,
          slotErrMax: err.length ? +err[err.length - 1].toFixed(1) : null,
          pullAt: COMPANY.pullAt,
          // 이 런이 실제로 쓴 슬롯 복귀력 (`?copull=N`의 확인 지점 · 기본 = `COMPANY.pull`)
          pull: coPullValue(),
          // 「탈출 성분 우선」이 켜져 있는가 (`?pinslip=0|1`의 확인 지점 · 기본 = true = 정본) +
          // **지금 프레임에 지물이 되돌린 개체 수**(= 복귀 성분을 0으로 둔 개체의 상한)
          pinSlip: pinSlipOn(),
          pinnedNow: field.list.filter((e) => e.pinned).length,
          // **대형 붕괴** (§0.6 C4). `broken` = 지금 산개 중인 부대 수, `brokenTotal` = 이 런에서
          // 지휘 유닛을 잡아 무너뜨린 누적 횟수(전멸한 부대는 안 센다 — enemy.ts의 그 주석).
          // 「C4가 실제로 일어나는가」는 컷이 아니라 `brokenTotal`로 판정할 것 — 산개는 6초뿐이라
          // 임의의 프레임을 찍으면 거의 늘 0이다
          broken: field.companies.filter((c) => c.broken > 0).length,
          brokenTotal: field.coBroken,
          /** 이 런에서 **만들어진 부대의 총수**(id 발번기). `brokenTotal / made` = 붕괴율 —
           * 나머지는 「심장이 마지막까지 살아남은 채 전멸한 부대」다 */
          made: field.coSeq,
          // 붕괴 시점의 **평균 생존율**. 「C4가 장식인가 판단 축인가」는 횟수가 아니라 이 값이 답한다 —
          // 0.1이면 다 죽은 뒤에 심장이 죽은 것이고, 0.5면 온전한 부대가 실제로 무너진 것이다
          brokenAliveAvg: field.coBroken ? +(field.coBrokenAlive / field.coBroken).toFixed(3) : null,
          breakSec: COMPANY.breakSec,
          brokenSpeed: COMPANY.brokenSpeed,
        };
      })(),
      // **대형의 지형 반응** (§0.6 C5). 이름이 `siege`가 아니라 `ram`인 것은 아래에 §8.⑥ 공성 4종
      // 계측이 이미 `siege` 칸을 쓰고 있기 때문이다(그쪽은 개체 문법, 이쪽은 부대 문법이다).
      // 컷 한 장으로는 「우회했다」도 「뚫었다」도 못 세므로 여기서 가른다.
      //  · **돌파** = `rams`(부대가 벽을 문 누적 횟수) · `dmg`(넣은 피해) · `demolished`(철거한 벽 수).
      //    `demolished`가 0인데 `rams`가 크면 「물었지만 못 뚫는다」이고, `rams`가 0이면 종대가 벽을
      //    아예 안 만난다는 뜻이다(= 이 항목이 화면에 안 선다). **판정 수치는 `demolished`다**
      //  · **우회** = `detourDeg` — 공성 종대가 **아닌** 부대 앵커의 진행 방향과 코어 방향의 각도차
      //    중앙값이다. 플로우필드가 지형을 돌아가는 부대만 이 값이 커진다(0이면 다들 곧게 걷는 중 =
      //    그 프레임에 앞을 막은 지형이 없다). 종대는 정의상 0이라 표본에서 뺀다
      ram: (() => {
        const det: number[] = [];
        for (const co of field.companies) {
          if (co.form === "column" || co.broken > 0) continue;
          const a = Math.atan2(map.cy - co.y, map.cx - co.x);
          let da = ((((co.ang - a) * 180) / Math.PI + 540) % 360) - 180;
          det.push(Math.abs(da));
        }
        det.sort((a, b) => a - b);
        return {
          rams: combat.siegeRams,
          ramming: field.companies.filter((co) => co.ram).length,
          columns: field.companies.filter((co) => co.form === "column").length,
          dmg: +combat.siegeDmg.toFixed(1),
          demolished: combat.siegeDemolished,
          dps: SIEGE.dmg / SIEGE.everySec,
          detourDeg: det.length ? +det[det.length >> 1].toFixed(1) : null,
          detourMaxDeg: det.length ? +det[det.length - 1].toFixed(1) : null,
          /** 런 누적 — 순간값(`detourDeg`)은 풀런 끝 프레임에 부대가 0개라 늘 null이다 */
          detourAvgDeg: field.detourN ? +(field.detourSum / field.detourN).toFixed(1) : null,
          detourHitPct: field.detourN ? +((100 * field.detourHits) / field.detourN).toFixed(1) : null,
          /** 대형별로 만들어진 부대 수 — `공성 종대`가 0에 가까우면 돌파가 화면에 안 서는 원인이
           * C5가 아니라 **조성 정본**이다(기본 런의 mix가 8종뿐 · STATUS 미결 질문 iter84 ②) */
          formsMade: field.coForms,
          /** **돌파 표식이 「그려진 성벽」에 얹혀 있는가** (§0.6 C5 · F ⓒ · iter97 신설).
           * 눈으로는 못 잡는다 — 종대가 벽을 무는 프레임이 드물어 대부분의 컷에 이 표식이 없고,
           * 있는 컷에서도 「주황 동그라미가 하나 있네」로만 읽힌다(iter96의 지형 HP바와 같은 부류).
           * `overhang` = 링 상단이 **그림 상단보다 얼마나 위인가**(월드). 0 근처여야 벽에 두른
           * 것이고, 크면 맨 잔디 위의 동그라미다(고치기 전 실측 76.7 = 그림 반높이의 3.6배).
           * ⚠ `n`이 0이면 나머지는 null이다 — 그 프레임에 무는 종대가 없었다는 뜻이지 통과가 아니다 */
          markFit: (() => {
            const co = field.companies.find((c) => c.ram && !c.ram.destroyed);
            if (!co || !co.ram) return { n: 0, ringRy: null, artHalfH: null, artHalfW: null, overhang: null, radiusRing: null };
            const g = terrainArt(co.ram);
            const sg = RENDER.siege;
            return {
              n: field.companies.filter((c) => c.ram && !c.ram.destroyed).length,
              ringRy: +(g.hh * sg.r).toFixed(1),
              artHalfH: +g.hh.toFixed(1),
              artHalfW: +g.hw.toFixed(1),
              overhang: +(g.hh * sg.r - g.hh).toFixed(1),
              /** 옛 기준(판정 반경)으로 그렸다면 나왔을 반지름 — 회귀가 나면 이 값으로 되돌아간다 */
              radiusRing: +(co.ram.r * sg.r).toFixed(1),
            };
          })(),
        };
      })(),
      // **관문 전면 정렬 진군** (§0.6 C6 · 3차 완성 기준 1의 판정 항목). 컷 한 장으로는 「줄을
      // 맞췄다」를 못 세므로 여기서 각도로 잰다 — `lineDeg`는 살아 있는 부대 앵커의 **각 폭**이고
      // 이 값이 `spanDeg`(정렬 폭 61°) 근처면 대열이 한 부채꼴에 서 있는 것이다.
      // `bossOffDeg`는 보스와 대열 중심의 각도차 = 「그 중앙에 보스가 선다」의 유일한 기계 근거다
      gate: (() => {
        const u0 = field.gateU;
        const deg = (x: number, y: number) => (Math.atan2(y - map.cy, x - map.cx) * 180) / Math.PI;
        const c0 = u0 === null ? null : ((u0 * 360 + 180) % 360) - 180;
        const wrap = (d: number) => ((((d - (c0 ?? 0)) % 360) + 540) % 360) - 180;
        const angs = field.companies.map((c) => wrap(deg(c.x, c.y)));
        const boss = field.list.find((e) => isBossKind(e.kind) || isMidKind(e.kind));
        return {
          on: u0 !== null,
          u: u0 === null ? null : +u0.toFixed(3),
          /** 대열의 **가로 폭**(월드) = 갈래 폭 × (첫 파의 전열 갈래 수 − 1) */
          laneW: GATE.laneW,
          /** **같은 정면**(부채꼴)에서 오도록 계획된 부대 수. 관문이면 부대 전부가 여기 든다 —
           * 갈리는 것은 「사방에서 조금씩」 대 「한 정면에서 파도처럼」이다 */
          planLine: field.plan.filter((g) => g.lane).length,
          /** 그중 **첫 파**(웨이브 개시와 동시에 «쫙 깔린 채» 서는 부대) 수 = §0.6 C6의 「부대 3~4개」 */
          planFirst: field.plan.filter((g) => g.lane && g.at === 0).length,
          /** 그중 후열(궁병 열·지원 후미) 수 — 0이면 이번 관문의 대열이 한 겹이다 */
          planRear: field.plan.filter((g) => g.back).length,
          lineDeg: angs.length ? +(Math.max(...angs) - Math.min(...angs)).toFixed(1) : null,
          /** 대열 중심에서 가장 먼 부대의 각(절대값) */
          lineMaxDeg: angs.length ? +Math.max(...angs.map(Math.abs)).toFixed(1) : null,
          bossOffDeg: boss ? +Math.abs(wrap(deg(boss.x, boss.y))).toFixed(1) : null,
          /** **위압감이 «지금 화면에» 있는가** (§0.6 검증 질문 2 「배너 · 정렬 진군 · 보스 크기가
           * 함께 읽히는가」). 눈으로 판정하면 안 된다 — 대열은 웨이브 개시 순간 대부분이 화면 밖이고,
           * 그 원인은 스폰 링이 아니라 **대열 자신의 깊이**다(iter99 실측: 배너 t=2.0에 96기 중 24기).
           *  · `onField`/`offscreen`/`underPanel` = 보스 마커와 **같은 술어**(`hud.ts gateVisible`)
           *  · `outMax` = 맵 사각형 밖으로 나간 **최대** 거리(월드) = 대열의 깊이. 0 이하면 전원이 화면 안
           * 배너가 떠 있는 동안의 값을 보려면 `boss.banner`(같은 probe 출력)와 함께 읽을 것.
           * ⚠ 관문이 아닌 웨이브에서도 찍힌다 — `on`이 false면 「대열」이 아니라 그냥 살아 있는 적이다 */
          onScreen: (() => {
            const seen = { onField: 0, offscreen: 0, underPanel: 0, underWaveBox: 0 };
            let outMax = -Infinity;
            for (const e of field.list) {
              seen[gateVisible(VIEW.w / 2 + (e.x - map.cx) * CAM, VIEW.h / 2 + (e.y - map.cy) * CAM)]++;
              outMax = Math.max(outMax, Math.abs(e.x - map.cx) - map.w / 2, Math.abs(e.y - map.cy) - map.h / 2);
            }
            return { ...seen, outMax: field.list.length ? +outMax.toFixed(0) : null };
          })(),
          /** 관문 예산 배수 (BALANCE §0.6 「관문 웨이브 예산 100~120%」) */
          budgetMult: CURVE.bossBudget,
        };
      })(),
      byKind: field.list.reduce<Record<string, number>>((a, e) => {
        a[e.kind] = (a[e.kind] ?? 0) + 1;
        return a;
      }, {}),
      /** **꼬리 칸** (STATUS 큐 1 · iter172) — 남은 적이 적을 때만(`<= TAIL_MAX` = 12) 개체 좌표를 낸다.
       * 웨이브가 «닫히지 않는» 교착(iter171 표 29)은 집계 칸으로는 원리적으로 못 읽는다 —
       * `spread`는 방위 12칸이라 반경이 없고 `byKind`는 머릿수뿐이라 **어디에 서 있는가**가 없다.
       * 한 컷이 셋을 가른다:
       *  · `railU` = **레일 중심선까지의 거리**(÷`outerR`). 무기는 루프 위의 칸에서 쏘므로 이것이
       *    「언젠가 닿는가」의 불변 눈금이다 — 열차가 한 바퀴 도는 동안의 최소 거리다.
       *    이 값이 이 런의 최장 무기 사거리보다 크면 **사거리 밖 교착**이다.
       *  · `distU` = 코어 거리. 화면 안/밖과 §5.0 눈금을 같이 읽으려고 나란히 둔다
       *  · `st` = 순간 상태 플래그. `railU`가 사거리 «안»인데 HP가 안 줄면 **타겟팅 결함**이다
       * ⚠ 두 컷(다른 `SHOT_WARM`)을 나란히 놓아야 셋째 갈래(**진로** = 플로우필드 국소최소)가 갈린다 —
       * 반경이 시간이 가도 «안 줄면» 걷지 못하는 것이고, 줄면 그냥 느린 것이다 */
      tail: field.list.length <= TAIL_MAX
        ? field.list.map((e) => {
            let rail = Infinity;
            for (const p of map.loop) rail = Math.min(rail, Math.hypot(p.x - e.x, p.y - e.y));
            const st: string[] = [];
            if (e.blocked) st.push("blockedByTrain");
            if (e.everBlocked) st.push("everBlocked");
            if (e.breaking) st.push("breaking");
            if (e.firing) st.push("firing");
            if (e.atCore) st.push("atCore");
            if (e.fleeing) st.push("fleeing");
            if (e.invuln) st.push("invuln");
            // **실드 돔 안** (§8.⑧). iter176이 이 낱말 없이는 못 읽은 교착이 있다 — 돔 안의 적은
            // `combat.ts`가 **직사 표적에서 통째로 뺀다**(0피해 헛방 방지). 그래서 `railU`가
            // 직사 사거리 «안»인데도 안 죽는 자리가 생기고, 그때 판정선은 직사가 아니라
            // **곡사 최장 사거리**다. `pinned`와 함께 서면 그 웨이브는 영영 안 닫힌다
            if (e.domed) st.push("domed");
            if (e.pinned) st.push("pinned");
            if (e.co >= 0) st.push("co" + e.co);
            if (e.leapTo) st.push("leaping");
            if (e.perched !== null) st.push("perched");
            if (e.slow < 1) st.push("slow" + e.slow.toFixed(2));
            return {
              kind: e.kind,
              distU: +(Math.hypot(e.x - map.cx, e.y - map.cy) / map.outerR).toFixed(3),
              railU: +(rail / map.outerR).toFixed(3),
              // §5 등재 이속(월드/s) × 이 프레임의 지형 감속 — 「걸을 수 있는 몸인가」의 눈금
              speed: +(ENEMY.baseSpeed * ENEMY_STATS[e.kind].speed * e.slow).toFixed(1),
              hpPct: +((e.hp / e.maxHp) * 100).toFixed(1),
              wave: e.wave + 1,
              st,
            };
          })
        : null,
      // §8.0 열차 장벽에 막혀 대기 중인 수 / 코어에 도달한 수
      blockedByTrain: field.list.filter((e) => e.blocked).length,
      everBlockedByTrain: field.list.filter((e) => e.everBlocked).length,
      atCore: field.list.filter((e) => e.atCore).length,
      // 산병이 코어 사거리에서 멈춰 쏘는 중인 수 (§8.③) + 보스의 교전 위치 정지(DESIGN §6)
      firing: field.list.filter((e) => e.firing).length,
      // **타겟팅 1순위 후보 수** = 지금 코어를 실제로 깎고 있는 적 (DESIGN §6 우선순위 ①, 감독 #17 ⓑ).
      // atCore ∪ firing이라 위 두 값의 합에서 겹침을 뺀 수다 — 무기는 사거리 안에 이 개체가 있으면
      // 더 가까운 잡몹을 두고 이쪽을 먼저 문다
      hittingCore: field.list.filter((e) => e.atCore || e.firing).length,
      // 그중 **엄폐 중**인 수 = 가장 가까운 레일 지점에서 직사 사선이 막힌 개체 (§8.③ 검증 축
      // "엄폐 → 철거 카운터"). 엄폐물을 철거하면 이 수가 줄고 그 개체가 직사에 노출된다
      inCover: field.list.filter((e) => {
        if (!e.firing) return false;
        let p = map.loop[0];
        let bd = Infinity;
        for (const q of map.loop) {
          const d = Math.hypot(q.x - e.x, q.y - e.y);
          if (d < bd) {
            bd = d;
            p = q;
          }
        }
        return !losOk(map, p.x, p.y, e.x, e.y, 0);
      }).length,
      // BALANCE §5 대조표 + 이번에 추가한 행동 필드 (standoff·aura.r은 "루프 반경 = 1" 단위)
      stats: ENEMY_STATS,
      // **§0.8-B 적용 후**의 자리다(`standoffOf` = 유일한 문). `[종, 월드거리, 실효 U, §5 원값]` —
      // 셋째 칸이 이 런의 `standoff′`이고 넷째가 §5 표값이라 **개정이 걸렸는지가 표 자체로 읽힌다**
      standoffWorld: Object.entries(ENEMY_STATS)
        .filter(([, v]) => v.standoff !== undefined)
        .map(([k, v]) => [k, +(standoffOf(v.standoff!) * map.outerR).toFixed(0), +standoffOf(v.standoff!).toFixed(3), v.standoff!]),
      // 이속 오라 (§8.⑧ 워 드러머). 지금 버프받는 수 / 한 번이라도 받은 누적 수 (순간값만 보면 0만 보인다)
      aura: {
        r: ENEMY_STATS.drummer.aura!.r,
        rWorld: +(ENEMY_STATS.drummer.aura!.r * map.outerR).toFixed(0),
        speed: ENEMY_STATS.drummer.aura!.speed,
        buffedNow: field.list.filter((e) => e.buffed).length,
        buffedEver: field.buffedEver,
      },
      // 적이 차단 지형 안에 있으면 안 된다 (DESIGN §4.1). **수륙양용은 호수에서 면제다** (§8.④) —
      // 그것이 이 종의 정의라, 면제를 안 걸면 이 검산이 «구현이 먹고 있다»를 위반으로 읽는다.
      // 성벽은 수륙양용에게도 그대로 위반이다(물만 통과하는 적이다)
      // **지형 관통 사고 카나리아** — 0이어야 한다. 통과가 «규칙»인 종은 그 지형에서 빠진다:
      // 수륙양용은 호수에서(§8.④), **공중은 지형 전체에서**(§8.⑤ — 날고 있으므로 성벽 위도 정상이다)
      insideWall: field.list.filter((e) =>
        ENEMY_STATS[e.kind].air !== true &&
        map.terrain.some(
          (t) =>
            (t.kind === "wall" || (t.kind === "lake" && !ENEMY_STATS[e.kind].amphib)) &&
            Math.hypot(e.x - t.x, e.y - t.y) < t.r - 1
        )
      ).length,
      // **§8.④ 수륙양용 4종 계측**. 넷 다 «그 종이 자기 문법을 실제로 썼는가»의 직접 지표다 —
      // swimEver 0이면 물 통과가 안 먹고 있고, leaps 0이면 사거리 안에 «더 가까운 물»이 없었다는 뜻이며
      // (버그가 아니라 맵 종속), landed/delivered는 상륙정이 실제로 내려놓은 러너 수,
      // grabSec은 열차가 촉수에 붙잡혀 감속된 누적 시간이다(§8.0 "방해만 허용"의 유일한 계기)
      amphib: {
        // `?amph=<%>` 편입 비중 (기본 0 = 기준선). 0이 아니면 이 컷의 조성은 정본이 아니다
        mixPctQa: qaAmphPctValue(),
        swimEver: field.swimEver,
        swimSpeed: ENEMY.swimSpeed,
        leaps: field.leaps,
        leapRangeWorld: +(ENEMY.leapRange * map.outerR).toFixed(0),
        landed: field.landed,
        delivered: field.delivered,
        grabSec: +field.grabSec.toFixed(2),
        grabRWorld: +(ENEMY_STATS.abyss_tentacle.grab!.r * map.outerR).toFixed(0),
        trainSlowNow: +train.slow.toFixed(2),
        // 지금 물 위에 있는 수륙양용 개체 수 (순간값 — swimEver의 분자가 실제로 도는지 본다)
        onWaterNow: field.list.filter(
          (e) =>
            ENEMY_STATS[e.kind].amphib === true &&
            map.terrain.some(
              (t) => (t.kind === "lake" || t.kind === "pond") && Math.hypot(e.x - t.x, e.y - t.y) < t.r
            )
        ).length,
        // 예산 검산: 상륙정 1기가 먹는 좀비 단위(= effHp/20). 화물 4기가 세어져야 7이다 (§6)
        craftUnits: +budgetUnits("landing_craft").toFixed(2),
      },
      // **§8.⑤ 공중 5종 계측**. 수륙양용과 같은 규약 — 다섯 종의 «문법이 실제로 도는가»다:
      //  · crossed 0이면 열차 장벽 통과가 안 먹고 있고(공중의 정체성)
      //  · boomed/boomDmg는 박쥐가 실제로 코어에 닿아 터진 수와 그 피해 합
      //  · perchSec 0이면 가고일이 칸에 못 앉는 것이다(무기칸이 사거리 밖이거나 편성에 무기가 없다)
      //  · scoutSec은 드론이 살아 있던 누적 시간, buffNext/buffNow가 그것이 만든 HP 배수다
      //  · flakUnlocked = 대공 플랙이 상점·카드에 나와 있는가 (조성에 공중이 있으면 참)
      air: {
        mixPctQa: qaAirPctValue(),
        crossed: field.crossed,
        boomed: field.boomed,
        boomDmg: +field.boomDmg.toFixed(1),
        boomDmgEach: +(ENEMY_STATS.bomb_bat.suicide!.dmg * coreDpsMult()).toFixed(2),
        perchSec: +field.perchSec.toFixed(2),
        perchRWorld: +(ENEMY_STATS.gargoyle.perch!.r * map.outerR).toFixed(0),
        stunnedNow: train.stunned.size,
        scoutSec: +field.scoutSec.toFixed(1),
        buffNow: +field.scoutBuff.toFixed(3),
        buffNext: +field.scoutBuild.toFixed(3),
        // 지금 살아 있는 공중 개체 수 (순간값) + 그중 대공 사거리 안에 든 수
        aliveAir: field.list.filter((e) => ENEMY_STATS[e.kind].air === true).length,
        flakUnlocked: weaponUnlocked("flak"),
        // 예산 검산: 수송 비행선 1기가 먹는 좀비 단위(= effHp/20). 화물 4기가 세어져야 7.5다 (§6)
        zeppelinUnits: +budgetUnits("zeppelin").toFixed(2),
      },
      // **§8.⑥ 공성 4종 계측**. 공중과 같은 규약 — 네 종의 «문법이 실제로 도는가»다:
      //  · gnawSec 0이면 공성충이 코어에 못 닿은 것이다(닿으면 잡몹의 3배로 갉는다)
      //  · planted / defused(클릭) / shot(사격) / blasted(터짐) / fled(이탈)가 폭탄 한 발의 다섯 결말이다.
      //    planted = defused + shot + blasted + 아직 붙어 있는 수여야 장부가 맞는다
      //  · perchSec은 **가고일과 같은 칸**이다 — `?siege=`만 켠 컷에서는 곧 갈고리 사략꾼의 값이다
      //  · ramHitDmg = 공성 램 한 방이 코어 상한(§1 100)에서 차지하는 비중의 분자
      siege: {
        mixPctQa: qaSiegePctValue(),
        gnawSec: +field.gnawSec.toFixed(2),
        gnawDps: ENEMY_STATS.siege_worm.gnaw!,
        planted: field.planted,
        defused: field.defused,
        shot: combat.killsByKind.sabo_bomb ?? 0,
        blasted: field.blasted,
        blastDmg: +field.blastDmg.toFixed(1),
        blastDmgEach: +(ENEMY_STATS.sabo_bomb.fuse!.dmg * coreDpsMult()).toFixed(2),
        fled: field.fled,
        armedNow: field.list.filter((e) => ENEMY_STATS[e.kind].fuse).length,
        perchSec: +field.perchSec.toFixed(2),
        hookRWorld: +(ENEMY_STATS.hook_raider.perch!.r * map.outerR).toFixed(0),
        stunnedNow: train.stunned.size,
        ramHitDmg: ENEMY_STATS.siege_ram.coreHit!.dmg,
        // 예산 검산: 폭파공작원 1기가 먹는 좀비 단위(= effHp/20). 폭탄 12이 세어져야 1.7이다 (§6)
        saboUnits: +budgetUnits("saboteur").toFixed(2),
      },
      // **§8.① 러너 신규 4종 계측**. 앞의 세 유형과 같은 규약 — 네 종의 «문법이 실제로 도는가»다:
      //  · revived / aliveSkel — 재기동이 0이면 30% 분기가 안 도는 것이다. 기대 재기동 ≈ 스폰 해골 × 0.3
      //  · recoilKills / recoilDmg — 멧돼지가 **자기 충돌로** 죽은 수와 그 피해. 성벽 쪽 피해는
      //    `breakerDmg`(오우거와 같은 칸)에 쌓인다 — `?runner=`만 켠 컷에서는 곧 멧돼지의 값이다
      //  · ratsNow / splits — 쥐떼가 실제로 12갈래로 갈라졌는가(splits는 **슬라임과 같은 칸**이다)
      //  · gnawSec은 **공성충과 같은 칸**이다 — `?runner=`만 켠 컷에서는 곧 쥐의 값이다
      //  · raiderUnits / swarmUnits = 예산 검산(= effHp/20). 해골 0.98 · 쥐떼 1.6이 나와야 §6이 맞는다
      runner: {
        mixPctQa: qaRunnerPctValue(),
        revived: field.revived,
        aliveSkel: field.list.filter((e) => e.kind === "skeleton").length,
        skelUnits: +budgetUnits("skeleton").toFixed(3),
        recoilKills: field.recoilKills,
        recoilDmg: +field.recoilDmg.toFixed(1),
        breakerDmg: +combat.breakerDmg.toFixed(1),
        boarNow: field.list.filter((e) => e.kind === "frenzy_boar").length,
        splits: combat.splits,
        ratsNow: field.list.filter((e) => e.kind === "rat").length,
        swarmUnits: +budgetUnits("rat_swarm").toFixed(2),
        ratGnawDps: ENEMY_STATS.rat.gnaw!,
        raiderScrap: ENEMY_STATS.goblin_raider.scrap,
        gnawSec: +field.gnawSec.toFixed(2),
      },
      // **§8.② 중장갑 신규 4종 계측**. 앞의 네 유형과 같은 규약 — 네 종의 «문법이 실제로 도는가»다:
      //  · regenHp / regenBlockSec — 트롤의 재생이 실제로 돌았는가와, **화염이 그것을 멈춘 시간**이다.
      //    화염이 없는 편성에서는 blockSec 0이 정상이고, 그 차이가 §8.②의 "소이탄·화염방사 존재 이유"다
      //  · debris / debrisAlive — 골렘이 세운 잔해의 누적과 지금 살아 있는 수(상한 ENEMY.debrisCap).
      //    0이면 골렘이 전부 **레일 안쪽**에서 죽은 것이다(§5.0 규칙 — 결함이 아니다)
      //  · bounced = 등껍질이 튕겨 낸 피해 합(명목 − 실피해). **양수 = 곡사에 튕겼다 · 음수 = 직사에
      //    증폭됐다**로 한 칸에 두 방향이 쌓인다 = 부호가 곧 "상성으로 잡고 있는가"의 지표다
      //  · miredSec = 장갑 트럭이 웅덩이에서 기어간 누적 시간. 0이면 웅덩이를 안 밟았다는 뜻이다
      //  · trollUnits = 예산 검산(= effHp/20). 재생 상한이 세어져야 **12.0**이다 (§6)
      armor: {
        mixPctQa: qaArmorPctValue(),
        regenHp: +field.regenHp.toFixed(1),
        regenBlockSec: +field.regenBlockSec.toFixed(2),
        regenPerSec: +(ENEMY_STATS.troll.regen!.perSec * enemyHpMult()).toFixed(2),
        trollNow: field.list.filter((e) => e.kind === "troll").length,
        trollUnits: +budgetUnits("troll").toFixed(2),
        debris: combat.debris,
        debrisAlive: map.terrain.filter((t) => t.scrap === 0 && !t.destroyed).length,
        debrisCap: ENEMY.debrisCap,
        debrisRWorld: +(ENEMY_STATS.scrap_golem.debris!.r * map.outerR).toFixed(0),
        bounced: +combat.carapaceDmg.toFixed(1),
        beetleNow: field.list.filter((e) => e.kind === "armor_beetle").length,
        miredSec: +field.miredSec.toFixed(2),
        // 웅덩이 위 실효 이속 배수 = 이속 1.3 × mired 0.25 (좀비 1.0보다 느려져야 §8.②가 성립한다)
        truckMired: +(ENEMY_STATS.armored_truck.speed * ENEMY_STATS.armored_truck.mired!).toFixed(3),
        truckNow: field.list.filter((e) => e.kind === "armored_truck").length,
      },
      // **§8.③ 산병 신규 3종 계측**. 앞의 다섯 유형과 같은 규약 — 세 종의 «문법이 실제로 도는가»다:
      //  · repositions / repoSec — 머스킷 도적이 자리를 옮긴 횟수와 그렇게 걸은 시간. 0이면 재배치가
      //    안 도는 것이다(standoff에 한 번도 안 멈췄거나 fireSec을 못 채웠다는 뜻)
      //  · banditStandoffWorld / banditRailWorld — 교전 자리의 절대 거리와 **레일에서의 거리**.
      //    후자가 기관총 사거리(1.2R = 270월드)를 넘어야 §8.③의 "사거리 최장"이 성립한다
      //  · acidSec / acidNow — 무기칸이 산성에 눌려 있던 누적(칸×초)과 지금 눌린 칸 수.
      //    0이면 뱉기가 교전 위치에 못 섰거나 반경 안에 무기칸이 없었다는 뜻이다
      //  · acidDps — 저하가 걸린 칸의 실효 화력 배수(공속 × 피해). 가고일의 정지(0)와 견주는 값이다
      //  · hiddenSec / hiddenNow — 암살자가 표적에서 빠져 있던 누적 시간과 지금 숨은 수.
      //    0이면 언덕·잔해를 한 번도 안 밟은 것이다(맵의 지형 배치에 종속 = 조건부 프리미엄)
      //  · hideSpots = 지금 맵에 있는 은신처 수(언덕 + 부서진 성벽) — hiddenSec의 분모다
      //  · assassinUnits = 예산 검산(= effHp/20). 은신은 실효 HP를 안 올리므로 2.0이어야 한다
      skirm: {
        mixPctQa: qaSkirmPctValue(),
        repositions: field.repositions,
        repoSec: +field.repoSec.toFixed(2),
        banditNow: field.list.filter((e) => e.kind === "musket_bandit").length,
        // ⚠ **§0.8-B 적용 후**의 값이다 — 둘 다 「레일로부터의 거리」로 정의된 파생 상수라
        // 개정을 안 걸면 표가 §5 원값을 찍어 실제 교전 자리와 어긋난다(INBOX #78 ③ ⓑ)
        banditStandoffWorld: +(standoffOf(ENEMY_STATS.musket_bandit.standoff!) * map.outerR).toFixed(0),
        banditRailWorld: +((standoffOf(ENEMY_STATS.musket_bandit.standoff!) - 1) * map.outerR).toFixed(0),
        acidSec: +field.acidSec.toFixed(2),
        acidNow: train.acid.size,
        acidDps: +(ENEMY_STATS.acid_spitter.spit!.rate * ENEMY_STATS.acid_spitter.spit!.dmg).toFixed(2),
        acidRWorld: +(ENEMY_STATS.acid_spitter.spit!.r * map.outerR).toFixed(0),
        spitterNow: field.list.filter((e) => e.kind === "acid_spitter").length,
        hiddenSec: +field.hiddenSec.toFixed(2),
        hiddenNow: field.list.filter((e) => e.hidden).length,
        hideSpots: map.terrain.filter((t) => t.kind === "hill" || (t.kind === "wall" && t.destroyed)).length,
        assassinNow: field.list.filter((e) => e.kind === "shadow_assassin").length,
        assassinUnits: +budgetUnits("shadow_assassin").toFixed(2),
        // 관측칸이 «은신을 뚫고» 쏜 발 수. 옆 칸 `losOverHills`(언덕이 사선을 막았을 발)와 **다른
        // 칸**이다 — 은신은 사선이 아니라 표적 후보에서 빠지는 것이라 losOk가 세지 못한다.
        // 관측칸이 없는 편성에서는 둘 다 0이다
        stealthPierced: combat.stealthPierced,
        losOverHills: combat.losOverHills,
      },
      // **§8.⑦ 증식 신규 4종 계측**. 앞의 여섯 유형과 같은 규약 — 네 종의 «문법이 실제로 도는가»다:
      //  · sired / queenNow — 슬라임 퀸이 산란한 수와 지금 살아 있는 퀸 수. 0이면 산란이 안 도는 것이다
      //    (퀸이 안 나왔거나 태어나자마자 죽었다는 뜻 — 첫 산란은 쿨 4초를 다 채우고 나온다)
      //  · raised / gravesUsed / gravesNow — 네크로맨서가 처치 지점에서 되살린 수 · 소비한 지점 수 ·
      //    지금 필드에 남은 지점 수. **raised 0은 결함이 아닐 수 있다** — 반경 0.8R 안에 시체밭이
      //    없으면 안 돈다(조건부 프리미엄 = §8.⑦의 "속전속결" 카운터가 먹었다는 뜻이다)
      //  · spores / trentNow — 포자 트렌트가 방출한 새끼 수. 0이면 4발 문턱에 한 번도 안 닿은 것이다
      //    (= 편성이 이 적을 세 발 안에 지웠다 = §8.⑦의 "저연사 고화력"이 먹었다는 뜻이다)
      //  · acidPools / meltDmg / meltDemolished — 산성 슬라임이 깐 웅덩이 수 · 그 지대가 지형에 넣은
      //    누적 피해 · 그렇게 **녹아 없어진 성벽 수**. 셋 다 0이면 슬라임이 성벽에서 멀리 죽은 것이다
      //  · queenUnits / necroUnits — 예산 검산(= effHp/20). 산란·재소환 상한이 세어져야
      //    각각 **11.0 · 10.5**다 (§6 "분열·소환 적은 실효 HP 기준으로 센다")
      swarm: {
        mixPctQa: qaSwarmPctValue(),
        sired: field.sired,
        queenNow: field.list.filter((e) => e.kind === "slime_queen").length,
        queenCap: ENEMY_STATS.slime_queen.spawner!.cap,
        queenUnits: +budgetUnits("slime_queen").toFixed(2),
        raised: field.raised,
        gravesUsed: field.gravesUsed,
        gravesNow: field.graves.length,
        graveCap: ENEMY.graveCap,
        necroNow: field.list.filter((e) => e.kind === "necromancer").length,
        necroRWorld: +(ENEMY_STATS.necromancer.raise!.r * map.outerR).toFixed(0),
        necroUnits: +budgetUnits("necromancer").toFixed(2),
        spores: combat.spores,
        sporePerHits: ENEMY_STATS.spore_trent.spore!.perHits,
        trentNow: field.list.filter((e) => e.kind === "spore_trent").length,
        acidPools: combat.acidPools,
        acidPoolsNow: combat.pools.length,
        meltDmg: +combat.meltDmg.toFixed(1),
        meltDemolished: combat.meltDemolished,
        poolRWorld: +(ENEMY_STATS.acid_slime.puddle!.r * map.outerR).toFixed(0),
        slimeNow: field.list.filter((e) => e.kind === "acid_slime").length,
      },
      // **§8.⑧ 지원 신규 4종 계측** (= 여덟 유형 중 마지막). 앞의 일곱과 같은 규약 —
      // 네 종의 «문법이 실제로 도는가»다. 이 유형만 **자기 화력이 0**이라 계측이 전부 «남에게 한 일»이다:
      //  · healedHp / shamanNow — 오크 주술사가 **남의** HP를 되돌린 합. 0이면 반경 0.28R 안에 다친
      //    적이 없었다는 뜻이다(주술사가 뒤에서 혼자 걸어왔다 = §8.⑧의 "뒤에 숨어 옴"이 안 선 것이다)
      //  · domeBlocked / domedSec / bearerNow — 실드 돔이 **통째로 막은** 피해 · 돔 안에 적이 들어
      //    있던 개체·초. **domeBlocked 0은 결함이 아닐 수 있다** — 편성이 곡사·포격뿐이면 0이 정상이다
      //  · smokeLaid / smokeNow / smokeCleared / smokeBlunted — 깐 연막 수 · 지금 남은 수 ·
      //    **조준 포격이 즉시 소거한** 수 · 연막이 깎아 낸 직사 피해량. smokeLaid 0이면 연막차가
      //    첫 쿨(6초)을 못 채우고 죽은 것이다
      //  · warded / wardCap / bannerNow / deathRages — 배너 방벽이 깎아 준 몫 · **1기당 평생 상한** ·
      //    사망으로 광폭화한 개체 수. `warded`만 `effHp`가 미리 세어 둔 값이라 **실측 ≤ 상한×기수**가
      //    성립해야 한다(§6 예산 검산이 되는 유일한 칸이다)
      //  · shamanUnits / bannerUnits — 예산 검산(= effHp/20). 회복·방벽 상한이 세어져야
      //    각각 **7.5 · 14.0**이다 (§6 "분열·소환 적은 실효 HP 기준으로 센다"의 같은 규칙)
      support: {
        mixPctQa: qaSupportPctValue(),
        healedHp: +field.healedHp.toFixed(1),
        healPool: ENEMY_STATS.orc_shaman.heal!.pool,
        shamanNow: field.list.filter((e) => e.kind === "orc_shaman").length,
        shamanUnits: +budgetUnits("orc_shaman").toFixed(2),
        domeBlocked: +combat.domeBlocked.toFixed(1),
        domedSec: +field.domedSec.toFixed(1),
        // **돔 × 부동 겹침** (iter178 · 큐 1) — 위 `domedSec`의 부분집합이라 **비로 읽는다**.
        // 「도시에서만 서는가」가 이 한 칸으로 갈린다(평원에도 짐꾼은 있고 지물도 있다)
        domedPinnedSec: +field.domedPinnedSec.toFixed(1),
        domeRWorld: +(ENEMY_STATS.shield_bearer.dome!.r * map.outerR).toFixed(0),
        bearerNow: field.list.filter((e) => e.kind === "shield_bearer").length,
        smokeLaid: combat.smokeLaid,
        smokeNow: combat.smokes.length,
        smokeCleared: combat.smokeCleared,
        smokeBlunted: +combat.smokeBlunted.toFixed(1),
        smokeDmgMult: ENEMY_STATS.smoke_truck.smoke!.dmg,
        smokeRWorld: +(ENEMY_STATS.smoke_truck.smoke!.r * map.outerR).toFixed(0),
        truckNow: field.list.filter((e) => e.kind === "smoke_truck").length,
        warded: +combat.warded.toFixed(1),
        wardCap: ENEMY_STATS.banner_lord.banner!.pool,
        wardMult: ENEMY_STATS.banner_lord.banner!.ward,
        bannerNow: field.list.filter((e) => e.kind === "banner_lord").length,
        bannerUnits: +budgetUnits("banner_lord").toFixed(2),
        deathRages: combat.deathRages,
      },
      // **변종 12종 계측** (DESIGN §8 증원 방침 · §10 2차). 앞의 여덟 유형과 계측의 성격이 다르다 —
      // 변종은 **새 문법이 하나도 없으므로** «문법이 도는가»를 잴 것이 없고, 대신 셋을 본다:
      //  · `baked` — 팔레트 굽기가 실제로 12장을 등록했는가(sprites.ts bakePalettes). 12가 아니면
      //    원본 이름이 틀렸거나 시트가 빠진 것이다. probe 최상단 `sprites`도 102 → **114**가 돼야 한다
      //  · rows[].units — 예산 검산(= effHp/20). **원본 units와 나란히 찍는다** — 무겁게 기운 변종은
      //    이 값이 원본보다 크고, 그만큼 같은 예산에서 머릿수가 줄어야 §6 표가 안 흔들린다
      //  · rows[].now / killed — 그 종이 실제로 판에 섰는가. `?variant=`를 안 켠 컷에서는 전부 0이다
      //    (= 기준선 무영향의 확인 지점)
      variant: {
        mixPctQa: qaVariantPctValue(),
        baked: VARIANT_KINDS.filter((k) => sprite(k)).length,
        rows: VARIANT_KINDS.map((k) => {
          const of = ENEMY_STATS[k].palette!.of;
          return {
            kind: k,
            of,
            hp: ENEMY_STATS[k].hp,
            speed: ENEMY_STATS[k].speed,
            scrap: ENEMY_STATS[k].scrap,
            units: +budgetUnits(k).toFixed(2),
            ofUnits: +budgetUnits(of).toFixed(2),
            now: field.list.filter((e) => e.kind === k).length,
            killed: combat.killsByKind[k] ?? 0,
          };
        }),
      },
      // 스폰→**사격 개시** 실측 (§5.0 "등장 즉시 교전 금지"). 산병(궁수·박격포반)은 레일에 닿지
      // 않아 approachSec 표본이 비므로, 이 적종의 접근 시간은 이 값으로 본다
      engageSec: (() => {
        const g = [...field.engageLog].sort((a, b) => a - b);
        return {
          n: g.length,
          min: g.length ? +g[0].toFixed(2) : null,
          median: g.length ? +g[g.length >> 1].toFixed(2) : null,
          max: g.length ? +g[g.length - 1].toFixed(2) : null,
        };
      })(),
      // 스폰→레일 실측 (BALANCE §1: 중앙값 ~7.3초, 방향별 4~9초 — 감독 #8 ①로 실측값이 정본이 됐다).
      // ringDerived(6.5)는 링 반경을 만든 **직선 환산** 파라미터라 실측보다 짧은 것이 정상이다.
      // 분열체는 표본에서 뺀다
      approachSec: {
        target: ENEMY.approachMedianSec,
        ringDerived: ENEMY.approachSec,
        n: done.length,
        min: done.length ? +done[0].toFixed(2) : null,
        median: done.length ? +done[done.length >> 1].toFixed(2) : null,
        max: done.length ? +done[done.length - 1].toFixed(2) : null,
      },
      // 이속별 분리 표본 (감독 #19 ③). `norm` = 중앙값 × 이속 배율 = 이속 1.0으로 환산한 값이라
      // 이 열이 전부 §1의 4~9초 안이면 저속 개체의 긴 접근 시간은 **위반이 아니라 산술적 결과**다
      approachBySpeed: bySpeed,
      speed: +field.baseSpeed.toFixed(1),
      // 지금 감속 지형 위에 있는 적 수 / 최저 배율 (§4.1 "통과하되 감속")
      slowedNow: field.list.filter((e) => e.slow < 1).length,
      // 누적 — 감속 지형을 한 번이라도 밟은 적 수와 그때의 최저 배율 (순간값만 보면 0만 보인다)
      slowedEver: field.slowedEver,
      slowMinEver: +field.slowMinEver.toFixed(2),
      // **감속의 «양»** — 적-초 중 감속 지형 위에서 보낸 몫(%). `slowedEver`(머릿수)와 갈려 있다:
      // iter132가 도시 회귀를 가른 눈금이 이것이다. 갈래에 감속을 붙이는 것(`TERRAIN.slow`)과
      // 그 지물이 **적 진로 위에 있는 것**은 다른 문제이고, 이 칸만 그 둘을 구분한다
      slowSec: +field.slowSec.toFixed(1),
      slowPct: (() => {
        const all = field.octSec.reduce((a, b) => a + b, 0);
        return all > 0 ? +((field.slowSec / all) * 100).toFixed(2) : 0;
      })(),
      // 생존 적의 남은 HP 합 (BALANCE §5 좀비 20)
      aliveHp: +field.list.reduce((a, e) => a + e.hp, 0).toFixed(1),
      // 스폰 링 128점의 레일까지 직선거리 (min/중앙/max) — 접근 시간 편차의 원인
      approachDist: [+field.distMin.toFixed(0), +field.approachDist.toFixed(0), +field.distMax.toFixed(0)],
      // **적 분포** (큐 1 — 감독 #5 V4가 지목한 최대 격차). "한 줄 행렬"과 "사방 전장"을 가르는 두 값:
      // sectors = 살아 있는 적이 코어에서 본 8방위 중 몇 개를 덮는가(1~8, 목표 ≥4).
      // dirVar  = 그 방향의 원형 분산 1-|평균 단위벡터| (0 = 전부 한 방향, 1 = 완전 균등).
      // nnMedian = 최근접 이웃 거리 중앙값(월드). 이 값이 분리 하한 2×radius=18 근처면 한 덩어리로
      // 뭉친 것이고, 지나치게 크면 흩뿌려져 §8.0의 밀집이 안 읽힌다
      spread: (() => {
        const n = field.list.length;
        // 필드가 빈 프레임(전멸 직후·웨이브 사이). **아래 본 반환과 같은 칸을 전부 든다** —
        // 한쪽에만 있는 칸은 `tools/sweep.mjs`의 `spread:` 줄에서 `undefined`로 찍힌다(iter119에 밟았다)
        if (!n) {
          const z = new Array<number>(12).fill(0);
          return { alive: 0, sectors: 0, dirVar: null, nnMedian: null, bins: z, outer: z, outerN: 0, occupied3: 0, outerOcc3: 0, cv: null, top4Pct: null };
        }
        const seen = new Set<number>();
        let sx = 0;
        let sy = 0;
        for (const e of field.list) {
          const a = Math.atan2(e.y - map.cy, e.x - map.cx);
          seen.add(Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)));
          sx += Math.cos(a);
          sy += Math.sin(a);
        }
        const nn: number[] = [];
        for (const e of field.list) {
          let best = Infinity;
          for (const o of field.list) {
            if (o === e) continue;
            best = Math.min(best, Math.hypot(o.x - e.x, o.y - e.y));
          }
          if (Number.isFinite(best)) nn.push(best);
        }
        nn.sort((a, b) => a - b);
        // 감독 #10 가드 ① "코어 주위 배회 금지". 레인은 코어에서 outerR 안쪽이면 0이 되게
        // 설계돼 있으므로(ENEMY.laneFade), **루프 안에 있으면서 편향이 남은 개체 수는 0이어야 한다**.
        // laneMaxInLoop이 0이 아니면 마지막 접근이 곧지 않다는 뜻 = 가드 위반이다
        const laneInLoop = field.list.filter((e) => Math.hypot(e.x - map.cx, e.y - map.cy) <= map.outerR);
        const laneMaxInLoop = laneInLoop.reduce((m, e) => {
          const dc = Math.hypot(e.x - map.cx, e.y - map.cy);
          const t = Math.min(1, Math.max(0, (dc - map.outerR) / (map.outerR * ENEMY.laneFade)));
          return Math.max(m, Math.abs(ENEMY.laneBias * e.lane * t));
        }, 0);
        // **12구간 히스토그램** (iter119 · 큐 1의 판별 눈금). 8방위 `sectors`는 「몇 개를 덮는가」만
        // 세서 **「덮었지만 한 구석에 몰렸다」를 못 가른다** — 웨이브 10 컷의 「네 덩어리」가 정확히
        // 그 경우다(sectors 8인데 화면은 비어 보인다). 구간 색인은 `ringPoint`의 u와 같은 규약이다
        // (0 = 동 · 3 = 남 · 6 = 서 · 9 = 북 · 화면 시계방향).
        //  · `bins` = 생존 전수 · `outer` = 그중 **루프 밖**(코어 거리 > `outerR`)만 = 외곽 전장
        //  · `outerOcc3` = 외곽 구간 중 **3기 이상** 든 수. 낙오 1기는 화면에서 「채워졌다」로 안
        //    읽히므로 **판정 수치는 이것이다**(12구간 중 몇을 실제로 채웠는가)
        //  · `cv` = 구간 수의 변동계수(표준편차/평균). 0 = 완전 균등 · 1 이상이면 덩어리다
        //  · `top4Pct` = 상위 4구간이 가진 비율 — 「네 덩어리」라는 관찰의 직접 눈금이다(균등이면 33%)
        const B = 12;
        const bins = new Array<number>(B).fill(0);
        const outer = new Array<number>(B).fill(0);
        for (const e of field.list) {
          const dx = e.x - map.cx;
          const dy = e.y - map.cy;
          const u = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
          const i = Math.min(B - 1, Math.floor(u * B));
          bins[i]++;
          if (Math.hypot(dx, dy) > map.outerR) outer[i]++;
        }
        const mean = n / B;
        const top4 = [...bins].sort((a, b) => b - a).slice(0, 4).reduce((a, v) => a + v, 0);
        return {
          alive: n,
          sectors: seen.size,
          dirVar: +(1 - Math.hypot(sx, sy) / n).toFixed(3),
          nnMedian: nn.length ? +nn[nn.length >> 1].toFixed(1) : null,
          bins,
          outer,
          outerN: outer.reduce((a, v) => a + v, 0),
          occupied3: bins.filter((v) => v >= 3).length,
          outerOcc3: outer.filter((v) => v >= 3).length,
          cv: +(Math.sqrt(bins.reduce((a, v) => a + (v - mean) ** 2, 0) / B) / mean).toFixed(3),
          top4Pct: +((top4 / n) * 100).toFixed(1),
          // 스폰 분산 (a) 파라미터
          burstClusters: ENEMY.burstClusters,
          clusterArcDeg: +(ENEMY.clusterArcU * 360).toFixed(0),
          // 경로 레인 (b) 파라미터 + 가드 ① 검산
          laneBias: ENEMY.laneBias,
          laneMaxDeg: +((Math.atan(ENEMY.laneBias) * 180) / Math.PI).toFixed(1),
          inLoop: laneInLoop.length,
          laneMaxInLoop: +laneMaxInLoop.toFixed(3),
        };
      })(),
      // 유닛 렌더 폴리시 (감독 #5 V3). 전부 연출이라 밸런스 검산이 없다 — 대신 **상태 분기가 실제로
      // 갈리는지**를 센다. bobbing == alive - (firing + atCore + blocked)여야 하고(멈춘 적은 안 흔들린다),
      // hpBarShown == elite + hurt여야 한다. corpses는 사망 페이드 잔상 수(판정에서 이미 빠진 것)
      render: {
        eliteHp: ENEMY.eliteHp,
        elites: field.list.filter((e) => ENEMY_STATS[e.kind].hp >= ENEMY.eliteHp).length,
        hurtNow: field.list.filter((e) => e.hurt > 0).length,
        // 큐 1(HUD)로 **HP바는 전 개체 상시**가 됐다 — hpBarShown == alive여야 하고,
        // 갈리는 것은 또렷함뿐이다(엘리트·피격 = 1.0 / 나머지 = RENDER.hpBar.idleAlpha)
        hpBarShown: field.list.length,
        hpBarFull: field.list.filter((e) => ENEMY_STATS[e.kind].hp >= ENEMY.eliteHp || e.hurt > 0).length,
        hpBarIdleAlpha: RENDER.hpBar.idleAlpha,
        bobbing: field.list.filter(isEnemyWalking).length,
        flipped: field.list.filter((e) => e.faceX < 0).length,
        corpses: field.corpses.length,
        deathFadeSec: RENDER.deathFade,
        hurtShowSec: RENDER.hurtShow,
        carTint: RENDER.carTint,
        coreGlowRWorld: +(LAYOUT.coreSize * RENDER.coreGlow.r).toFixed(1),
      },
    };
  })(),
  // HUD (큐 1). 전부 연출이라 밸런스 검산이 없다 — 대신 **패널이 실제로 그 자리에 있고**
  // 화면에 띄우는 값이 시뮬 값과 같은지를 센다. coverPct = 패널이 가리는 화면 폭 비율
  // (목업 실측 0.131 — 이보다 커지면 전장을 잡아먹는다)
  hud: {
    panelX: PANEL_X,
    panelW: HUD.panelW,
    coverPct: +((HUD.panelW + HUD.margin) / VIEW.w).toFixed(3),
    waveBox: [VIEW.w / 2 - HUD.wave.w / 2, HUD.wave.y, HUD.wave.w, HUD.wave.h],
    scrap: Math.floor(combat.scrap),
    coreHp: +combat.coreHp.toFixed(1),
    corePct: +(combat.coreHp / CORE.hp).toFixed(3),
    artCd: +combat.artCd.toFixed(2),
    artReady: combat.artCd <= 0,
    artFullSec: +(ARTILLERY.cooldownSec * combat.artCdMult).toFixed(1),
    cars: train.cars.length,
    dps: +trainDps(train).toFixed(1),
    // 편성 목록이 패널 안에 다 들어가는가 (12칸까지 잘리면 안 된다)
    carRowsFit: Math.floor((VIEW.h - HUD.margin - (HUD.margin + HUD.box.scrap + HUD.box.core + HUD.box.art + HUD.box.stats + HUD.gap * 4) - 38) / HUD.box.carRow),
  },
  // 전투 (BALANCE §4 무기 / §1 코어)
  // 이펙트 (감독 #5 V2). 전부 연출이라 판정 검산이 없다 — 대신 **스폰 경로가 실제로 도는지**를 센다.
  // spawned가 0인 종류는 그 연출이 화면에 한 번도 안 났다는 뜻이다 (muzzle은 사격, spark는 피격,
  // explode는 착탄·대형 적 사망, smoke는 기관차 굴뚝). alive는 캡처 프레임에 살아 있는 개수
  fx: (() => {
    const byKind: Record<string, number> = {};
    for (const f of combat.fx.list) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    const frames = Object.values(FX).flatMap((d) => d.frames);
    return {
      // 시트 28셀이 전부 로드됐는지 (fx.ts의 프레임 목록 기준)
      frames: frames.length,
      framesMissing: frames.filter((n) => !sprite(n)),
      spawned: combat.fx.spawned,
      alive: combat.fx.list.length,
      byKind,
      // 캡처 프레임에 살아 있는 이펙트의 월드 좌표 — 스크린샷에서 "어디를 봐야 하는지" 찾는 용도.
      // 연출은 수치 검산이 없어서, 이게 없으면 1280x720 안에서 눈으로 찾아야 한다
      alivePos: combat.fx.list.map((f) => [f.kind, +f.x.toFixed(0), +f.y.toFixed(0), +f.size.toFixed(0), +f.t.toFixed(2)]),
      chimneyEverySec: +(simT / Math.max(combat.fx.spawned.smoke ?? 0, 1)).toFixed(2),
    };
  })(),
  // **무기 이펙트 체계** (§0.6 G). 「쐈는지 모르겠다」를 컷 없이 재는 자리다 —
  // `table`은 무기 × 상황(발사·탄도·착탄) 정본표 그대로이고(코드가 표를 벗어나면 여기서 갈린다),
  // `tierShots`는 「티어가 화면에 서고 있는가」의 유일한 기계 근거다(T2·T3가 0이면 컷을 찍을 이유가 없다).
  // `live`는 이 프레임에 살아 있는 궤적·총구·마커 — **짧은 창**이라 컷을 고를 때 이 값으로 warm을 잡는다
  wfx: {
    weapons: Object.keys(WEAPON_FX).length,
    missing: Object.keys(WEAPONS).filter((k) => !WEAPON_FX[k]),
    tiers: TIER_FX.map((t) => t.color),
    tierShots: combat.tierShots,
    // **화려함의 폭** (§0.7 L). `pieces` = 한 발이 남기는 **연출 조각 수**(궤적 본선 · 예광 머리 ·
    // 잔상 · 포구 화염 · 티어 섬광 · 약협 · 히트 십자 · 착탄 링 · 착탄 스파크)이고, `ink`는 거기에
    // 크기 배수(`size`)를 곱한 **화면 잉크의 근사**다. ⚠ **이 두 수가 「세 배」를 «판정»하지 않는다** —
    // 정본의 판정은 「T3가 T1의 세 배로 **읽힌다**」이고 그것은 컷을 보는 감독의 몫이다. 여기 있는 것은
    // **손잡이가 어느 쪽으로 얼마나 움직였는가**의 재현 가능한 눈금이다(컷 실측은 iter108 STATUS 참조).
    // ⚠ T1 행이 `ghost/casing/ring 0`이 아니면 §0.7 L 이전 화면과 갈린 것이다 — 그 무변경이 이 표의 전제다
    tierFx: TIER_FX.map((t) => {
      const pieces = 6 + t.ghost + t.casing + t.ring; // 고정 여섯 = 궤적 본선·예광 머리·포구 화염·티어 섬광·히트 십자·착탄 스파크
      return { ghost: t.ghost, casing: t.casing, ring: t.ring, px: t.px, size: t.size, alpha: t.alpha,
        pieces, ink: +(pieces * t.size).toFixed(2) };
    }),
    // **T3 분기 2갈래의 색** (§0.7-C · iter138). `rows`는 무기마다 [a갈래, b갈래]의 `TIER_FX` 행 번호이고
    // `sameSide`는 **두 갈래가 같은 색으로 떨어진 무기**다 — 비어야 통과다(같으면 그 무기는 분기가
    // 화면에서 안 갈린다). `colors`가 감독 등재값(주황금 #ff9e2c · 보라 #b46cff)과 대조하는 자리다
    branchFx: {
      colors: { wide: TIER_FX[3].color, pierce: TIER_FX[4].color, t3: TIER_FX[2].color },
      rows: Object.fromEntries(
        Object.entries(BRANCHES).map(([k, bs]) => [k, bs.map((b) => fxTierOf(k, CARDS.maxTier, b.id))])
      ),
      sameSide: Object.entries(BRANCHES).filter(([, bs]) => bs[0].fx === bs[1].fx).map(([k]) => k),
      // 분기를 아직 «안 고른» T3는 금(3행)으로 남는가 — 분기 화면이 열려 있는 동안의 그림이다
      unchosenRow: fxTierOf("machinegun", CARDS.maxTier, null),
    },
    ghost: FX_RULE.ghost,
    casing: FX_RULE.casing,
    tierFxOn: qaTierFxOn(),
    live: { shots: combat.shots.length, muzzles: combat.muzzles.length, marks: combat.marks.length, shells: combat.shells.length },
    // 살아 있는 궤적의 **화면 좌표**(iter68 `mid.at`과 같은 규약) — [무기, 티어, 총구 x,y, 착탄 x,y].
    // 궤적은 0.07~0.34초라 컷에서 눈으로 찾을 수 없다. **크롭 구역을 이 값으로 고를 것**
    livePos: combat.shots.map((s) => [s.kind, s.tier,
      Math.round(VIEW.w / 2 + (s.x0 - map.cx) * CAM), Math.round(VIEW.h / 2 + (s.y0 - map.cy) * CAM),
      Math.round(VIEW.w / 2 + (s.x1 - map.cx) * CAM), Math.round(VIEW.h / 2 + (s.y1 - map.cy) * CAM)]),
    markMax: FX_RULE.mark.max,
    // **포구 화염의 모양** (§0.6 G ⓐ · iter93 목업 대조). 목업의 화염은 「배럴 끝에 붙어 사격 방향으로
    // 뻗는 뾰족한 섬광」이고 칸 길이의 0.36~0.70이다 — `carPct`가 그 대조축이다(우리 = 0.23~0.64).
    // `len × wide`는 **월드 치수**이자 **T1 기준**이다 — 화면에는 `TIER_FX.size`(×1/1.25/1.5)가 곱해지므로
    // T3 함포는 63×35다. `wide`가 칸 폭(≈21)을 크게 넘으면 다시 «둥근 덩어리»다
    muzzleShape: { narrow: FX_RULE.muzzle.narrow, root: FX_RULE.muzzle.root, carLen: LAYOUT.carLen,
      of: Object.fromEntries(Object.keys(WEAPON_FX).filter((k) => WEAPON_FX[k].muzzle.size > 0)
        .map((k) => {
          const len = WEAPON_FX[k].muzzle.size;
          return [k, { len, wide: +(len * FX_RULE.muzzle.narrow).toFixed(1), carPct: +(len / LAYOUT.carLen).toFixed(2) }];
        })) },
    // 포연이 총구 화염 뒤로 얼마나 밀리는가 (§0.6 G ⓐ 함포 「포구 화염 + 포연」 · iter92).
    // `back`은 **월드 거리**로 편다 — 표의 `muzzle.size`가 무기마다 달라 비율만 봐서는 갈렸는지 모른다
    smoke: { ratio: FX_RULE.smokeBack, drift: FX_RULE.smokeDrift,
      back: Object.fromEntries(Object.keys(WEAPON_FX).filter((k) => WEAPON_FX[k].muzzle.smoke > 0)
        .map((k) => [k, +(WEAPON_FX[k].muzzle.size * FX_RULE.smokeBack).toFixed(1)])) },
    byStyle: (() => {
      const o: Record<string, number> = {};
      for (const k of Object.keys(WEAPON_FX)) o[WEAPON_FX[k].style] = (o[WEAPON_FX[k].style] ?? 0) + 1;
      return o;
    })(),
    table: Object.fromEntries(Object.keys(WEAPON_FX).map((k) => {
      const w = WEAPON_FX[k];
      return [k, { style: w.style, color: w.color, muzzle: w.muzzle.size, flash: w.muzzle.flash, smoke: w.muzzle.smoke, px: w.px, ttl: w.ttl, head: w.head, impact: w.impact, trail: w.trail, branch: w.branch }];
    })),
    // 이번 편성이 실제로 쓰는 행 — `?cars=`로 무기를 골라 컷을 찍을 때 「그 무기가 무엇을 그리는가」
    consist: train.cars.filter((c) => weaponOf(c)).map((c) => `${c.kind} T${c.tier} ${WEAPON_FX[c.kind]?.style ?? "?"}`),
  },
  // 정차역 상점 (DESIGN §7.3 · BALANCE §3). 가격은 정본 대조용으로 그대로 싣는다 —
  // 여기 찍힌 값이 BALANCE.md §3 표와 다르면 코드가 정본을 벗어난 것이다
  // 런 중 자동 저장(이어하기) — DESIGN §10 2차. 저장은 **정차 진입 프레임 1회**뿐이라
  // `writes`는 곧 "이번 런이 지난 정차 수"이고, `bytes`가 localStorage 한 칸의 실제 크기다.
  // 이어하기 검증은 한 번의 페이지 로드로 안 된다 — `SHOT_RELOAD=1 npm run probe`가 로드→재로드 컷이다
  save: {
    on: SAVE_ON,
    checkpoint: savedCheckpoint,
    label: checkpointLabel,
    writes: saveWrites,
    ok: saveOk,
    cleared: saveCleared,
    bytes: JSON.stringify(snapshot(map, field, train, combat, cards, SEED, retries, MAP_PIN, RESUMED?.migrated, shop.refits)).length,
    /** 이번 로드가 저장에서 복원됐나 + 그 스냅샷의 요지 (재로드 컷의 판정 지점) */
    resumed: RESUMED
      ? {
          waveIdx: RESUMED.waveIdx, t: RESUMED.t, coreHp: RESUMED.coreHp, scrap: RESUMED.scrap,
          cars: RESUMED.cars.length, terrain: RESUME_TERRAIN,
          // **재도전 횟수의 대물림** (§0.7 N) — 복원된 값이고, 이번 런은 여기에 +1로 시작한다(`retries`)
          retries: RESUMED.retries,
          // **종료 화면이 읽는 누적 장부**가 복원됐는가 (save.ts VERSION 2). 이어하기가 60웨이브 완주의
          // 전제라, 이 넷이 안 실리면 «실제로 완주한 런»의 종료 화면만 0을 찍는다
          kills: RESUMED.kills, bossKills: bossKills(RESUMED.killsByKind),
          lostBoss: RESUMED.coreDmgBoss, lostMob: RESUMED.coreDmgMob,
        }
      : null,
  },
  /** **화면에 지금 떠 있는 UI** (§0.6 A2). 툴팁은 «마우스 오버로만 사는» 연출이라
   *  컷에서 «없는 것»과 «멀쩡한 것»이 구분되지 않는다 — `?hover=`로 커서를 못박고 이 칸으로 센다.
   *  `tooltip`이 null이면 그 프레임에 툴팁이 **안 그려진 것**이고, `lines`가 §0.6 A2의
   *  「계열 · 명목 DPS · 사거리 · 특성 1줄 · 다음 티어 효과」 전문이다(지원칸은 DPS·사거리·티어가 없다) */
  ui: {
    hoverQa: QA_HOVER,
    tooltip: TIP.title ? { title: TIP.title, lines: TIP.lines, x: TIP.x, y: TIP.y } : null,
    /** **관문 배너가 서 있는가 대 그려지는가** (§0.6 B5 · iter125). `banner`는 **상태**(enemy.ts가
     *  세우고 타이머로 지운다)이고 `bannerShown`은 **이 프레임에 실제로 그려졌는가**다 —
     *  둘이 갈리는 프레임이 곧 「시간이 멈춰 배너를 미룬 프레임」이다(정차·카드·분기).
     *  ⚠ **`banner`가 있는데 `bannerShown`이 true인 채로 `stopped`도 true면 배선이 끊긴 것이다** —
     *  그 프레임의 배너는 자기 3.4초를 안 쓰면서 카드 제목 픽셀을 갉는다(hud.ts drawGateAlert) */
    banner: field.banner ? { name: field.banner.name, label: field.banner.label ?? null, t: +field.banner.t.toFixed(2) } : null,
    stopped: field.station || field.card || field.branch || field.doctrine,
    /** **튜토리얼 한 페이지** (§P). `on` = 지금 떠 있는가 · `seen` = 이 브라우저가 이미 봤는가 ·
     *  `stops` = 이 페이지가 실제로 시간을 멈추고 있는가(정지 문법이 하나라는 기계 증명).
     *  `chars`는 세 칸 본문의 **글자 수**다 — §P가 "문구는 이 길이가 상한"이라고 못박았으므로
     *  이 세 수가 늘면 정본을 넘긴 것이다(강조 표식 `**`는 뺀 순 글자 수) */
    tutorial: {
      on: pause.help,
      seen: tutorialSeen(),
      stops: pause.help && paused(pause),
      cards: TUT_CARDS.length,
      chars: TUT_CARDS.map((c) => c.body.replace(/\*\*/g, "").length),
      foot: TUT_FOOT.replace(/\*\*/g, "").length,
    },
    bannerShown: !!field.banner && !(field.station || field.card || field.branch || field.doctrine),
  },
  audio: audioProbe(),
  coreDamageByCause: { ...combat.coreDamageByCause },
  qaRun: QA_RUN,
  shop: {
    ui: shopUiGeom(shop),
    qa: SHOP_QA,
    station: field.station,
    spent: shop.spent,
    /** 런 전체 지출 = 누적 회수액 − 잔액 */
    spentTotal: +(combat.collected - combat.scrap).toFixed(2),
    carPrice: SHOP.carPrice,
    upgradeCosts: Array.from({ length: SHOP.maxLevel }, (_, i) => upgradeCost(i)),
    maxLevel: SHOP.maxLevel,
    // 티어업 (BALANCE §3 "T2 = 200 / T3 = 500") — 티어업은 피해 +60%와 함께 **레벨 상한을 +5 연다**
    tierPrice: SHOP.tierPrice,
    // **성장 축의 몫 나누기** (INBOX #74 ② · iter154) — `levelStep`이 총량이고 두 칸이 그 몫이다.
    // 곱(`(1+dmg)(1+rate)`)이 언제나 `1 + levelStep`이라야 명목 DPS 곡선이 안 갈린다
    levelStep: SHOP.levelStep,
    levelRateShare: SHOP.levelRateShare,
    levelDmg: +levelDmgStep().toFixed(4),
    levelRate: +levelRateStep().toFixed(4),
    sellRate: SHOP.sellRate,
    /** **재장비(Refit)** (DESIGN §D1 · 감독 #72 ⑥ · BALANCE §3 `refitFee`/`refitPerStation`).
     *  `fees`는 **지금 편성 각 칸의 수수료**(투자액 × 25%)이고 `median`이 그 대표값이다 —
     *  이 값과 `economy.stations[].scrapIn`의 비가 곧 「수수료가 정차 수입의 몇 %인가」다.
     *  `used`/`perStation`은 이번 정차의 횟수, `pick`은 지금 고른 칸(없으면 null),
     *  `log`는 런 전체의 재장비 기록이다(자동 소비는 재장비를 «안 쓴다» — 기준선이 안 갈린다). */
    refit: {
      feeRate: SHOP.refitFee,
      perStation: SHOP.refitPerStation,
      used: shop.refits,
      pick: shop.pick,
      median: refitMedian(),
      fees: train.cars.flatMap((car, i) =>
        refitable(car) ? [{ i, kind: car.kind, tier: car.tier, lv: car.level + 1, invested: car.invested, fee: refitFee(car) }] : []
      ),
      log: shop.refitLog,
    },
    // 코어 수리 (BALANCE §3 "HP 10당 40") — 런 전체의 유일한 코어 회복 경로다
    repairHp: SHOP.repairHp,
    repairPrice: SHOP.repairPrice,
    repairFloor: REPAIR_FLOOR ?? "auto",
    repairMargin: REPAIR_MARGIN,
    /** 칸 예약 정책 (iter51 큐 1 — QA `?reserve=1`) */
    reserveCar: RESERVE_CAR,
    /** 다음 스테이지 예산 비례 수리 (iter56 큐 1 — QA `?rscale=0`) */
    repairScale: REPAIR_SCALE,
    repairAbs: REPAIR_ABS,
    /** 자동 소비의 지원칸 목표 (iter61 큐 1 — QA `?sup=<n>&supk=<종>`). null = 기준선 */
    supportPlan: SUPPORT_PLAN,
    /** 칸 구매 버튼 행의 실측 기하 (iter54). `right <= inner`이고 `textMax < w - 12`여야 패널 안에 들어간다.
     *  `textMax`는 상점을 한 번 그린 뒤에만 0이 아니다(필드 컷에서는 0). */
    buyRow: buyRowGeom(),
    /** 편성 1행의 실측 기하 (iter69). `right === inner`이고, `textMax.<열> > cols.<열>.w`인 열은
     *  **fitText가 줄인 열**이다 — 옛 판은 그 자리에서 이웃 열·버튼 밑으로 글자가 밀려 들어갔다.
     *  `textMax`도 상점을 한 번 그린 뒤에만 0이 아니다(필드 컷에서는 0). */
    row: rowGeom(),
    /** 코어 수리 버튼의 실측 기하 + **지금 한 번 누르면 무엇이 일어나는가** (iter77).
     *  `tools/shop-click.mjs`가 이 좌표로 버튼을 누른다 — 수리는 셋 중 마지막까지 손 상수로
     *  남아 있던 버튼이다. `on`이 false인 프레임의 클릭은 먹지 않는다(만땅 / 스크랩 부족). */
    repairBtn: repairGeom(combat),
    repaired: +shop.repaired.toFixed(1),
    repairedTotal: +shop.log.reduce((a, e) => a + Math.max(e.repaired, 0), 0).toFixed(1),
    maxCars: TRAIN.maxCars,
    /** **구간별 편성 상한** (감독 #72 ② 판정선 「12칸 만편성이 33~36웨이브 직전」의 기계 근거).
     *  `capNow`는 이번 스테이지의 실제 상한(= 표 ∧ `?maxcars`) · `capFullAt`은 12칸이 열리는 스테이지 */
    carCapByStage: TRAIN.carCapByStage,
    capNow: carCap(),
    capFullAt: TRAIN.carCapByStage.findIndex((n) => n >= TRAIN.maxCars) + 1,
    // §0 원칙 5 / §5 검산의 판정 지표 — "8~9칸 + 강화 포함 실효 DPS 80+"
    cars: train.cars.length,
    consist: train.cars.map((c) => `${c.kind}${WEAPONS[c.kind] ? `:T${c.tier}Lv${c.level + 1}${c.branch ? `/${c.branch}` : ""}` : ""}`),
    dps: +trainDps(train, combat.pass).toFixed(1),
    dpsNoUpgrade: +train.cars.reduce((a, c) => a + (WEAPONS[c.kind]?.dmg ?? 0) * (WEAPONS[c.kind]?.rate ?? 0), 0).toFixed(1),
    /** **상점 한 프레임 안의 DPS 두 값** (§0.6 A2 · 표 9 · iter121). `row`는 편성 목록이 칠하는 줄,
     *  `tip`은 **그 행에 뜨는 툴팁**의 같은 칸에 대한 줄이다 — 한 프레임에 나란히 서는데 지금 2배 어긋난다
     *  (`dpsOf` 대 `dmgOf × w.rate`: `MULT.fireRate`가 한 칸 빠진다). **hover 없이 읽히는 것이 요점**이다 —
     *  `ui.tooltip`은 `?hover=`를 줘야 서므로 회귀 컷이 이 자리를 스무 이터레이션 못 봤다.
     *  카드 쪽 짝은 `cards.offerSub`이고, 어느 단위가 정본인가는 **감독 대기**(표 9)라 여기는 재지 않고 «적기»만 한다 */
    dpsUnit: train.cars.flatMap((c, i) =>
      weaponOf(c)
        ? [{
            kind: c.kind,
            row: `DPS ${(dpsOf(c, combat.pass) * supportAt(train, i).rate).toFixed(1)}`,
            tip: carTip(c.kind, c, combat.pass)[1] ?? "",
          }]
        : []
    ),
    /** **패시브 4종** (DESIGN §0.7 H2 · BALANCE §0.7). `on`이 자동 소비 정책(QA `?pass=0`)이고
     *  나머지는 지금 산 것이다. `dpsNoPassive`와의 차가 **이 축이 실제로 만든 화력**이다 —
     *  0이면 세 축 중 하나가 판에서 안 도는 것이다.
     *  `critDmgMult`·`critPct`는 명목 산식 `1 + 치확 × (치피 − 1)`의 두 인자이고 그 곱이 `critFactor`다 */
    passive: {
      on: PASSIVE_ON,
      lv: { ...combat.pass },
      buttons: passiveGeom(combat),
      critPct: +(critChance(combat.pass) * 100).toFixed(1),
      critDmgMult: +critMult(combat.pass).toFixed(2),
      critFactor: +critFactor(combat.pass).toFixed(3),
      dpsNoPassive: +trainDps(train).toFixed(1),
      /** 다음 1단계씩의 값 (상한이면 null) — 세 축의 가격 경쟁을 한 줄로 본다 */
      nextCost: Object.fromEntries(PASSIVE.axes.map((a) => [a.id, passiveNext(combat, a.id)])),
    },
  },
  // DESIGN §10 1.5차의 검증 3축 중 아직 안 잰 둘 — "스테이지당 구매력"과 "티어 도달 시점".
  // 대조 기준: BALANCE §0 원칙 2(정차 1회 구매력 = 칸 1개(120) or 강화 4~5회(163~264)) ·
  // §3 검산("정차 1회차 자금 ~80 → 강화 3~4회 위주, 칸 구매는 2회차부터") · §0 원칙 3(한 무기 T3은 런 후반)
  economy: {
    stations: shop.log,
    /** 웨이브별 스냅샷 (큐 1 — 스테이지 1~3의 성장 속도). 차분 = 그 웨이브의 수입·코어 손실.
     * 정본 대조: §2 기대 수입 표 / §3 칸 가격 120 → "칸 1개 = 몇 웨이브" */
    waves: waveLog,
    tierUps,
    carPrice: SHOP.carPrice.machinegun,
    /** QA `?stop=N`의 현재값 (0 = 정본 = 스테이지 사이 19회). 0이 아닌 컷을 정본 실측으로 인용하지 말 것 */
    stopEvery: qaStopEveryValue(),
    /** QA A/B 상태 (기본 true = 정본). false면 그 축이 꺼진 컷이다 */
    midOn: qaMidOn(),
    card3On: qaCard3On(),
    upgrade4: [0, 1, 2, 3].reduce((a, i) => a + upgradeCost(i), 0),
    upgrade5: [0, 1, 2, 3, 4].reduce((a, i) => a + upgradeCost(i), 0),
  },
  // 선택 카드 (DESIGN §7.2 · BALANCE §7). `offered`가 런 6회(스테이지당 2회)여야 §7이 성립한다 —
  // 완주 런에서 이 값이 6이 아니면 카드 자리(스테이지 안의 웨이브 전환)가 틀어진 것이다
  cards: {
    qa: CARD_QA,
    open: field.card,
    /** **T3 진화 분기** (DESIGN §7.4 · QA `?branch=a|b`). `open`은 분기 화면이 열려 있는가,
     * `chosen`은 무기별로 고른 갈래다 — `pending`이 남아 있는데 화면이 안 열렸으면 배선이 끊긴 것이다 */
    branchQa: BRANCH_QA,
    branchOpen: field.branch,
    doctrineOpen: field.doctrine,
    branchChosen: Object.fromEntries(
      Object.keys(BRANCHES).map((k) => [k, branchOf(train, k as CarKind)]).filter(([, b]) => b),
    ),
    /** **분기가 명목 DPS를 보존하는가**의 검산 (balance.ts BRANCHES 불변식). 24개 갈래 전부를
     * `weaponOf`에 실제로 태워 `dmg × rate`를 기준 스탯과 비교한다 — **0이 아니면 그 갈래가
     * §4의 명목 문법(직사 10 / 곡사 6)을 몰래 올린 것**이다 */
    branchNominalErr: +Math.max(
      0,
      ...Object.entries(BRANCHES).flatMap(([k, pair]) =>
        pair.map((b) => {
          const base = WEAPONS[k];
          const w = weaponOf({ ...makeCar(k as CarKind), tier: CARDS.maxTier, branch: b.id })!;
          return Math.abs((w.dmg * w.rate) / (base.dmg * base.rate) - 1);
        }),
      ),
    ).toFixed(6),
    /** 지금 열린 카드가 스테이지 3번째 자리(= 다음이 정차역)인가 (감독 #35 ①) */
    toStation: field.cardToStation,
    offered: cards.offered,
    offer: cards.offer.map((c) => cardLabel(train, c)),
    /** 제시된 카드의 **본문 한 줄** — 「이 카드가 무엇을 약속하는가」를 눈이 아니라 문자열로 읽는 칸.
     * 새 무기칸 카드의 「DPS +n」은 위 `train.dps`(= `trainDps`)와 **같은 단위**여야 한다
     * (BALANCE §0.7 「명목 DPS 표기가 전부 한 식을 쓴다」) — 어긋나면 여기서 먼저 보인다 */
    offerSub: cards.offer.map((c) => cardSub(cards, train, c, combat.pass)),
    taken: cards.taken,
    /** 카드 1장당 1행 — 제시 3장 · 고른 것 · 그 직후 편성 (큐 1 초반 관문의 판정창) */
    log: cardLog,
    /** 무기별 티어 진행도(장) — CARDS.tierCards(2)에 닿으면 그 무기의 칸 전체가 티어업 */
    prog: cards.prog,
    tiers: Object.fromEntries(Object.keys(WEAPONS).map((k) => [k, tierOf(train, k as CarKind)])),
    /** **열차 교리** (DESIGN §D1 ⓐ · 감독 #72 ⑦ · balance.ts `DOCTRINES`). `qa`가 이번 컷의 정책이고
     *  (`0`이면 축 자체가 꺼진 iter147 이전 기준선이다) `taken`이 실제로 고른 단이다.
     *  `mult` 여섯은 **효과가 실제로 곱해졌는가**의 유일한 검산창 — 「고른 목록」과 「배수」가
     *  어긋나면 적용 경로(cards.ts applyCard) 한 곳이 샌 것이다.
     *  `openAt`은 「T3 분기를 고른 무기 수」이고 그 수가 곧 지금까지 열린 단의 상한이다 */
    doctrine: {
      qa: DOC_QA,
      steps: DOCTRINES.length,
      taken: [...combat.doctrines],
      log: docLog,
      openAt: new Set(train.cars.filter((c) => c.branch).map((c) => c.kind)).size,
      pending: pendingDoctrine() + 1,
      mult: {
        dmg: +combat.pass.docDmg.toFixed(4),
        rate: +combat.pass.docRate.toFixed(4),
        crit: +combat.pass.docCrit.toFixed(4),
        drop: +combat.docDrop.toFixed(4),
        speed: +train.speed.toFixed(1),
        collect: +combat.collectMult.toFixed(4),
      },
    },
    weight: CARDS.weight,
    tierCards: CARDS.tierCards,
    tierStep: CARDS.tierStep,
    tierRateShare: CARDS.tierRateShare,
    tierDmg: +tierDmgStep().toFixed(4),
    tierRate: +tierRateStep().toFixed(4),
    trait: CARDS.trait,
    // 열차 특성 카드의 실제 적용 결과. 1.0이면 아직 안 받았다는 뜻이다
    artCdMult: +combat.artCdMult.toFixed(4),
    artCdSec: +(ARTILLERY.cooldownSec * combat.artCdMult).toFixed(2),
    collectMult: +combat.collectMult.toFixed(4),
    collectRadius: +(COLLECT.radius * combat.unit * combat.collectMult).toFixed(1),
    // 주행 속도는 COLLECT.pullSpeed(220)를 넘으면 수집칸이 드랍을 못 따라잡는다 (train.ts 주석)
    trainSpeed: +train.speed.toFixed(1),
    pullSpeed: COLLECT.pullSpeed,
  },
  // **맵 보스 그람** (DESIGN §3 신표 보스 = 6n · §8 · BALANCE §5 HP 1,050 / §2 드랍 100).
  // 보스는 편성 예산 **밖**이라 waves 표에 안 잡힌다 — 이 블록이 유일한 대조창이다.
  // 자기 검산: `roars`는 hpPct가 70·40을 지날 때마다 1씩 올라 최대 2이고, `summoned`는 그 배수다.
  // `raged`는 hpPct ≤ 30에서만 true. `coreHits × coreHit.dmg`가 코어에서 깎인 보스 몫이다
  boss: (() => {
    const b = field.list.find((e) => isBossKind(e.kind)) ?? null;
    // 보스 웨이브는 6n이고 HP는 순번마다 ×BOSS.hpStep이다 — "그람의 HP"는 이제 하나가 아니다
    const bn = bossIndex(field.waveIdx + 1);
    // 지금 판에 선(없으면 이번 순번의) 보스 종. **`BOSS.kind` 고정이 아니다** — 풀 로테이션이
    // 들어온 뒤로 아래 고유 행동 열(포효·광폭화)은 종마다 있고 없고가 갈린다
    const kind = b ? b.kind : bossKindAt(Math.max(0, bn));
    const st = ENEMY_STATS[kind];
    const bossWaves = WAVES.map((_, i) => i + 1).filter((w) => isBossWave(w));
    const g0 = ENEMY_STATS[BOSS.kind];
    return {
      kind,
      every: BOSS.every,
      /** **풀 로테이션 표** — 자리 10개 × 종 `pool.length`개. 이 열이 곧 「관문마다 다른 얼굴이
       * 서는가」다. 마지막 자리(웨이브 60)는 풀 크기와 무관하게 그람 고정이다(balance.ts `bossKindAt`) */
      // ⚠ `earlyHpMult`를 곱한다 — 관문은 `waveHpMult`를 안 타지만 **초반 완화는 탄다**(§0.7-B · 감독 #67 ②).
      // 이 표가 «실제로 스폰되는 HP»여야 HP바 분모·광폭화 문턱과 안 밀린다 (웨이브 6이 구간 안이다)
      gates: bossWaves.map((w, i) => ({ w, n: i, kind: bossKindAt(i), maxHp: +(maxHpOf(bossKindAt(i), i) * earlyHpMult(w - 1)).toFixed(0) })),
      /** **로테이션 풀**의 적종 키 (순서). 0번 = 웨이브 6의 앵커.
       * ⚠ `BOSS_KINDS`(= 보스 «격»)와 다른 배열이다 — 죽음의 군주는 격에는 들고 풀에는 안 든다 */
      pool: BOSS_POOL_KINDS,
      /** 보스 «격»의 전 종 = 풀 + 이벤트 관문. `isBossKind`가 보는 배열 */
      kinds: BOSS_KINDS,
      /** 팔레트 굽기가 실제로 등록했는가 (sprites.ts bakePalettes). `pool.length`가 아니면 원본
       * 이름이 틀렸거나 시트가 빠진 것이다 — probe 최상단 `sprites`도 121 → **122**가 돼야 한다 */
      baked: BOSS_KINDS.filter((k) => sprite(k)).length,
      /** 눈금 넷 + 보스 공통 골격 셋이 풀 전 종에서 같은가 = 「관문 세기는 순번의 함수다」의
       * 기계 검산(balance.ts BOSS_GRADE 주석). false면 어느 행이 원본 눈금을 물고 들어온 것이다 */
      gradeOk: BOSS_POOL_KINDS.every((k) => {
        const e = ENEMY_STATS[k];
        return (
          e.hp === g0.hp &&
          e.speed === g0.speed &&
          e.scrap === g0.scrap &&
          e.scale === g0.scale &&
          e.standoff === g0.standoff &&
          e.coreHit!.dmg === g0.coreHit!.dmg &&
          e.coreHit!.everySec === g0.coreHit!.everySec &&
          e.breaker!.dmg === g0.breaker!.dmg
        );
      }),
      /** 이번 웨이브의 보스 순번 (0-based, 보스 웨이브가 아니면 -1) */
      idx: bn,
      hpStep: BOSS.hpStep,
      /** 보스 웨이브별 최대 HP (자리 수만큼 — 36웨이브 체제는 6기) — §5 검산 "교전 10~13초"를 순번마다 재는 대조표 */
      maxHpByBoss: Array.from({ length: CURVE.waves / BOSS.every }, (_, i) => +maxHpOf(BOSS.kind, i).toFixed(0)),
      pending: field.bossPending,
      alive: !!b,
      /** **표시 배율** (§0.6 B2 = 3.4 · 중간보스 2.0). 충돌 반경(ENEMY.radius)은 안 따라 커진다 */
      scale: st.scale ?? 1,
      midScale: ENEMY_STATS[MID_KINDS[0]].scale ?? 1,
      /** **능동 패턴** (§0.6 B3). `fired`는 런 누적 발동 수 — 「패턴이 실제로 돌았는가」는
       *  컷 한 장으로 못 세고 이 카운터가 유일한 기계 근거다. `tellOk`는 예고 길이가
       *  **감독 고정 구간(0.8~1.5초)** 안인지의 전수 검산이고 false면 §0.6 B3 ⓑ 위반이다 */
      patterns: {
        fired: field.patFired,
        now: b && b.patIdx >= 0 ? `${BOSS_PATTERNS[b.kind][b.patIdx].id}:${b.patActing ? "act" : "tell"}` : null,
        tellOk: Object.values(BOSS_PATTERNS).every((ps) =>
          ps.every((q) => q.tell >= TELL_RANGE.min && q.tell <= TELL_RANGE.max)
        ),
        table: Object.entries(BOSS_PATTERNS).map(([k, ps]) => ({
          kind: k,
          name: gateName(k),
          n: ps.length,
          ids: ps.map((q) => `${q.id} cd${q.cd} tell${q.tell} act${q.act}`),
        })),
      },
      /** **관문 배너**(§0.6 B5) — 지금 떠 있는가. 스크린샷 QA가 배너 컷을 겨눌 때 보는 값이다 */
      // `label`·`ink`는 **관문이 아닌 배너**(진영 교대 §0.6 D · EVENT §0.7 K)를 가르는 두 칸이다 —
      // 이것 없이는 「배너가 떴다」와 「어느 배너가 떴다」가 probe에서 구분되지 않는다
      banner: field.banner
        ? { name: field.banner.name, boss: field.banner.boss, t: +field.banner.t.toFixed(2), label: field.banner.label ?? null, ink: field.banner.ink ?? null }
        : null,
      /** 돌진에 멈춘 칸 수(지금) — §8.0을 넘지 않는다(칸 HP 없음, 잠깐 쉴 뿐이다) */
      carStunNow: field.carStun.filter((v) => v > 0).length,
      maxHp: b ? b.maxHp : maxHpOf(BOSS.kind, Math.max(0, bn)),
      hp: b ? +b.hp.toFixed(1) : null,
      hpPct: b ? +((b.hp / b.maxHp) * 100).toFixed(1) : null,
      killed: bossKills(combat.killsByKind) > 0,
      scrap: st.scrap,
      // 이속: 기본 = 89 × 0.45, 광폭화 시 ×1.5 (BALANCE §5)
      speedWorld: +(ENEMY.baseSpeed * st.speed).toFixed(1),
      rageSpeedWorld: st.rage ? +(ENEMY.baseSpeed * st.speed * st.rage.speed).toFixed(1) : null,
      // 포효 소환 (§8 70%·40%). kind·n은 BALANCE 미등재 자유 변수다 (STATUS 미결 질문)
      roarAtPct: st.roar?.atPct ?? null,
      roars: b ? b.roars : null,
      summonKind: st.roar?.kind ?? null,
      summonPerRoar: st.roar?.n ?? null,
      // **등껍질** (§8.② 철갑 딱정벌레 골격 — 초중장갑 크롤러가 물려받았다). 이 열이 있는 관문은
      // 곡사 편성이 3배로 늘어진다 = 「관문마다 다른 얼굴」이 세기가 아니라 편성 요구를 가르는 자리
      carapace: st.carapace ?? null,
      summoned: field.summoned,
      // 포효 충격파 연출의 남은 시간(초). 수명이 RENDER.roarFx(0.9)뿐이라 스크린샷 QA는
      // 이 값이 0보다 큰 warm을 먼저 찾아야 한다 (화염방사·테슬라와 같은 방법)
      roarFx: b ? +b.roarFx.toFixed(2) : null,
      // **레일 돌파** 연출 (큐 1). `breachT` = 보스가 레일 중심선을 넘은 절대 시각(연출과 무관하게 남는다),
      // `breachFx` = 그 연출의 남은 시간(초). 수명이 RENDER.breachFx(2)뿐이라 스크린샷 QA는
      // 포효와 같은 방법으로 이 값이 0보다 큰 warm을 먼저 이분해 찾아야 한다
      breachT: b && b.railT !== null ? +b.railT.toFixed(1) : null,
      // **보스별 기록** (감독 #31 ⓒ) — 위의 단일 필드들은 지금 교전 중인 1기의 것이고, 이 배열이
      // 10기 전체다. `BOSS.hpStep` 확정의 판정 열은 `fightSec`(§5 검산 10~13초)이고, 그 정의는
      // iter50에서 **「첫 피해 → 처치」**로 바뀌었다(감독 #34 ① — combat.ts BossLog 주석)
      // ⚠ **derived 두 칸이 붙는다**(iter156 · 큐 1) — `killVis`/`killAt`. 장부 자신은 루프 반경 단위
      // 두 칸(`killDistU`·`killDeg`)만 싣고, **화면 술어는 여기서 건다**: 반지름·각으로 화면 좌표를
      // 되만들어 `hud.ts gateVisible`에 넘긴다(보스 마커·`enemies.gate.onScreen`과 **같은 술어**).
      // 이렇게 해야 `combat.ts`가 `VIEW`·`CAM`·`hud`를 안 본다. 되만든 좌표의 오차는 각 0.05° ·
      // 반지름 0.0005U ⇒ 화면에서 **0.5px 미만**이라 분류가 안 갈린다
      log: combat.bossLog.map((r) => {
        if (r.killDistU === null || r.killDeg === null) return { ...r, killAt: null, killVis: null };
        const rad = (r.killDeg * Math.PI) / 180;
        const sx = VIEW.w / 2 + Math.cos(rad) * r.killDistU * map.outerR * CAM;
        const sy = VIEW.h / 2 + Math.sin(rad) * r.killDistU * map.outerR * CAM;
        return { ...r, killAt: [Math.round(sx), Math.round(sy)], killVis: gateVisible(sx, sy) };
      }),
      // **불변식 3의 유일한 눈금 — 「보스전 창 12~25초」** (BALANCE §0.6/§0.7 불변식 3 · iter122 신설).
      // iter102가 「«기준 편성»에서 다시 재야 한다」로 열어 둔 자리다. 표본은 위 `log`의 `fightSec`
      // (신 정의 = 첫 피해 → 처치)이고 **처치된 보스만** 센다(`killT`가 null인 행 = 런이 거기서 끝났다).
      // ⚠ 이 칸은 **풀런에서만 뜻이 있다** — 한 컷의 보스 1기로 「창 위반」을 말하지 말 것.
      // ⚠ **판정 규약은 감독 판정 5(DESIGN §0.7 · 2026-08-24)가 못박았다**: 「기준 편성」은
      //   **그 관문 순번의 «자동 구매 상태»**로 읽고(= `?shop=auto` 기본 · `?maxcars=9`가 아니다 —
      //   §5의 8~9칸 문면은 지금 커브에서 웨이브 18·24에 죽어 표본 자체가 안 난다 · iter122 실측),
      //   **3 seed 중앙값**(`med`)으로 잰다. 그래서 판정 열은 `okPct`가 아니라 **`med`**다 —
      //   `okPct`(전량 창 안)는 양 끝 두 기가 새는 것을 그대로 감점하므로 규약이 말하는 눈금이 아니다.
      window: (() => {
        // ⚠ **이벤트 관문(죽음의 군주)은 표본에서 뺀다** (감독 #72 ⑤). 불변식 3(12~25초)은 «관문 1기와의
        // 결투»의 창이고, 이벤트 관문은 부활군 200기를 함께 세우는 **물량전**이라 같은 자를 대면
        // 창의 뜻이 두 벌이 된다. 뺀 행도 `log`에는 그대로 남는다(`kind`로 갈린다)
        const w = combat.bossLog.filter((r) => r.fightSec !== null && !isEventKind(r.kind)).map((r) => r.fightSec as number);
        // ⚠ 두 반환의 «칸 모양»을 같게 둘 것 — `enemies.spread`가 조기 반환 한쪽만 고쳐 밟은 자리다(iter119)
        if (!w.length) return { n: 0, sec: [], win: BOSS_WIN, med: null, medInWin: null, inWin: 0, below: 0, above: 0, okPct: null, rising: null };
        const below = w.filter((x) => x < BOSS_WIN[0]).length;
        const above = w.filter((x) => x > BOSS_WIN[1]).length;
        // 중앙값 — 규약의 판정 열이다. 짝수 표본은 가운데 둘의 평균(런마다 표본 수가 갈린다)
        const srt = [...w].sort((a, b) => a - b);
        const mid = srt.length >> 1;
        const med = srt.length % 2 ? srt[mid] : (srt[mid - 1] + srt[mid]) / 2;
        // 「순번 우상향」 = 이웃 쌍 중 오르는 쌍의 비율 (1.0이면 완전 단조 증가)
        let up = 0;
        for (let i = 1; i < w.length; i++) if (w[i] >= w[i - 1]) up++;
        return {
          n: w.length,
          sec: w,
          win: BOSS_WIN,
          med: +med.toFixed(1),
          medInWin: med >= BOSS_WIN[0] && med <= BOSS_WIN[1],
          inWin: w.length - below - above,
          below,
          above,
          okPct: +(((w.length - below - above) / w.length) * 100).toFixed(1),
          rising: w.length > 1 ? +(up / (w.length - 1)).toFixed(2) : null,
        };
      })(),
      breachFx: field.breach ? +(RENDER.breachFx - field.breach.t).toFixed(2) : 0,
      // 광폭화 (§8 30% 이하)
      rageAtPct: st.rage?.atPct ?? null,
      raged: b ? b.raged : null,
      // 코어 점타 (BALANCE §1 "10/히트 2.5s = 실효 4/s") — 잡몹의 연속 DPS와 다른 경로다
      coreHitDmg: st.coreHit!.dmg,
      coreHitEverySec: st.coreHit!.everySec,
      coreDpsEff: +(st.coreHit!.dmg / st.coreHit!.everySec).toFixed(2),
      // **교전 위치** (DESIGN §6 "루프 반경 0.5 정지 점타", 감독 #17 ⓒ). `distU`는 지금 보스가 선
      // 자리를 루프 반경 단위로 환산한 값이라 멈추면 standoff로 수렴한다. `engaged`가 그 정지 상태다
      // §0.8-B의 **예외**다 — 0.5는 루프 «안»이라 `standoffOf`가 안 스케일한다(balance.ts 주석)
      standoff: standoffOf(st.standoff!),
      engaged: b ? b.firing : null,
      // 보스전 길이 = 지금(또는 종료) 시각 - 교전 개시 시각. 감독 #17 ⓐ의 목표는 **15~20초**다
      engageT: field.bossEngageT === null ? null : +field.bossEngageT.toFixed(1),
      fightSec: field.bossEngageT === null ? null : +(field.t - field.bossEngageT).toFixed(1),
      distU: b ? +(Math.hypot(b.x - map.cx, b.y - map.cy) / map.outerR).toFixed(3) : null,
      coreHits: combat.bossCoreHits,
      coreDmg: combat.bossCoreHits * st.coreHit!.dmg,
      // **보스전 구간의 코어 손실 분해** (큐 2). iter30·31은 보스전을 가르는 것이 보스 점타가 아니라
      // "보스전 중 잡몹이 코어에서 뽑아가는 5.4/s"라고 실측했다 — 1.5차 배율(물량 ×5 · 개체 코어
      // DPS ×0.2 · 이속 ×0.5) 뒤 그 값이 얼마인지를 재려고 경로별 누적을 뺀 것이다.
      // `mobDps`+`bossDps`가 보스전 중 코어 총 손실률이고, `mobShare`가 잡몹 몫의 비중이다
      fight: (() => {
        const base = combat.bossFightBase;
        if (base === null || field.bossEngageT === null) return null;
        const sec = field.t - field.bossEngageT;
        const boss = combat.coreDmgBoss - base.boss;
        const mob = combat.coreDmgMob - base.mob;
        return {
          sec: +sec.toFixed(1),
          coreAtEngage: +(combat.coreHp + boss + mob).toFixed(1),
          lostBoss: +boss.toFixed(1),
          lostMob: +mob.toFixed(1),
          bossDps: sec > 0 ? +(boss / sec).toFixed(2) : null,
          mobDps: sec > 0 ? +(mob / sec).toFixed(2) : null,
          mobShare: boss + mob > 0 ? +(mob / (boss + mob)).toFixed(2) : null,
        };
      })(),
      // §1 "보스 도달 = 25초 안에 잡아야 함"의 검산: 코어 100 / (dmg / everySec)
      coreKillSec: +((CORE.hp / st.coreHit!.dmg) * st.coreHit!.everySec).toFixed(0),
      // 성벽 파괴는 오우거와 같은 경로(breaker) — 수치는 combat.breaker에서 함께 본다
      breaker: st.breaker,
      /** **시각 QA 검산용** — 중간보스 블록과 **같은 규약**이다(iter68 `mid.at`/`mid.visible`).
       * 「컷에 안 보인다」의 원인 셋(뷰포트 밖 / 패널 뒤 / 미스폰)을 눈 없이 가른다 */
      at: b ? [Math.round(VIEW.w / 2 + (b.x - map.cx) * CAM), Math.round(VIEW.h / 2 + (b.y - map.cy) * CAM)] : null,
      visible: b ? gateVisible(VIEW.w / 2 + (b.x - map.cx) * CAM, VIEW.h / 2 + (b.y - map.cy) * CAM) : null,
    };
  })(),
  // **네크로맨서 이벤트** (DESIGN §0.7 K · BALANCE §0.7). 관문 둘과 **같은 규약의 세 번째 블록**이고,
  // §0.7 K의 판정 기준(「웨이브 20·40에서 런이 안 부러진다」)이 재는 값이 전부 여기 있다.
  // 자기 검산 셋: ① `on`이 false면 `?event=0` A/B라 아래가 전부 0이어야 한다 ② `raised`가 0인데
  // `fired`가 1 이상이면 **시전은 돌았는데 재료가 없었다**(시체밭이 비었다) ③ `raised / primaryN`이
  // §0.7 K 판정선 ⓐ(「부활군이 1차 물량과 같은 규모」)의 유일한 눈금이다.
  // ⚠ **`blocked 0`은 iter111부터 «정상»이다** — 5단 흐름에서 ③④는 필드가 비어 있고 본체는 맵
  // 구석이라 **자동 사격의 사거리 밖**이다(옛 흐름은 웨이브 개시와 동시라 잡몹과 함께 맞았다).
  // 무적이 실제로 값을 하는 상대는 **조준 포격**(플레이어의 클릭) 하나이고, `?shop=auto` 런은
  // 그 클릭을 안 한다. 그러니 이 칸이 0인 것을 「무적 국면이 안 돈다」로 읽지 말 것 — 국면은
  // `phase`가 `stand`/`cast`를 지나는 것으로 확인한다
  necro: (() => {
    const e = field.list.find((x) => isEventKind(x.kind)) ?? null;
    const st = ENEMY_STATS[NECRO.kind];
    const sx = e ? VIEW.w / 2 + (e.x - map.cx) * CAM : 0;
    const sy = e ? VIEW.h / 2 + (e.y - map.cy) * CAM : 0;
    return {
      /** `?event=0`이면 false — 아래 계측이 전부 0인 것이 그때의 정상이다 */
      on: qaEventOn(),
      /** 자리(1-based) = **보스 자리 둘**(감독 #72 ⑤ · 18·36) */
      waves: NECRO.waves,
      /** **자리 검산이 뒤집혔다** — 옛 칸(`clashesGate`)은 「관문과 겹치면 안 된다」였고,
       * 지금은 **전부 6n이어야 한다**. 비어 있지 않으면 그 자리는 관문이 아니라 옛 이벤트로
       * 되돌아간 것이고 `bossKindAt`이 그 자리를 풀로 채운다(= 그 웨이브에 보스가 둘) */
      notBossWave: NECRO.waves.filter((w) => !isBossWave(w)),
      /** 이 자리들이 실제로 받는 보스 순번과 **`bossKindAt`이 내는 얼굴** — 둘이 어긋나면
       * 「18·36의 보스가 네크로맨서」가 코드에서 안 선 것이다 */
      slots: NECRO.waves.map((w) => ({ w, n: bossIndex(w), kind: bossKindAt(bossIndex(w)) })),
      /** **1차 물량 배수**(감독 #72 ⑤ 「물량을 더 주고」)와 그것이 실제로 낸 편성 수 */
      hordeMul: hordeMulValue(),
      hordeMulCanon: NECRO.hordeMul,
      /** 이번 웨이브가 이벤트인가 · 아직 안 내보냈나 */
      thisWave: isEventWave(field.waveIdx + 1),
      pending: field.eventPending,
      alive: !!e,
      /** 지금 무적인가(= ③ 등장 또는 ④ 시전 국면) · 지금 국면 */
      invuln: e ? e.invuln : null,
      /** **흐름 5단의 지금 자리** (§0.7 K · iter111 전면 개정). `pending`이 참인 동안이 ①②이고,
       * 그 뒤가 ③`stand` → ④`cast`/`act` → ⑤ 이후의 `fight`다. `null` = 이벤트 웨이브가 아니다 */
      phase: isEventWave(field.waveIdx + 1) && field.eventPending
        ? "wave1"
        : e && e.patIdx >= 0 ? (isCasting(e) ? "cast" : "act") : e ? (e.invuln ? "stand" : "fight") : null,
      /** **지금 그려지는 셀**(§0.7 K ④ · 감독 #65 반입). `necro_lord` ↔ `necro_lord_cast`가
       * `phase`의 `cast` 칸과 **함께** 갈리는지가 이 칸의 전부다 — 갈리지 않으면 「시전 자체가
       * 예고」가 그림으로는 안 선 것이다. `null` = 이벤트 보스가 필드에 없다 */
      cell: e ? (isCasting(e) ? NECRO.castSprite : ENEMY_STATS[NECRO.kind].sprite ?? NECRO.kind) : null,
      /** **판정선 ⓐ의 두 수** (§0.7 K "부활군이 1차 물량과 같은 규모여야 한다").
       * `primaryN` = 이번 웨이브 1차 물량(편성 수) · `graveStock` = 그중 지금 재료로 남은 자리 수.
       * 부활 뒤에는 `graveStock`이 0으로 떨어지고 그 몫이 `undeadAlive`로 옮겨 간다 */
      primaryN: field.roster.length,
      graveStock: field.graves.filter((g) => g.w === field.waveIdx).length,
      /** **시전 = 예고**다 (§0.7 K ②). 감독 고정 구간(0.8~1.5) 안이어야 하고 `boss.patterns.tellOk`가
       * 이 값도 함께 검산한다 — 예외를 만들면 그 검산이 이 적만 안 본다 */
      castSec: NECRO.castSec,
      standSec: NECRO.standSec,
      /** 부활 발동 횟수(런 누적). 이벤트 2회면 **최대 2**다 — 3 이상이면 「한 번만」이 깨진 것이다 */
      fired: field.patFired.raise ?? 0,
      /** **되살아난 개체의 누적 수**. 엘리트 네크로맨서의 4초 재소환(`enemies.swarm.raised`)과 다른 칸이다 */
      raised: field.undeadMade,
      /** **지금 걸려 있는 상한**(= `?raisecap=` 있으면 그 값) · 등재값 · 정본이 말한 「실제 제한」 */
      raiseCap: raiseCapValue(),
      raiseCapCanon: NECRO.raiseCap,
      roomCap: Math.max(0, ENEMY.fieldCap - field.list.length),
      /** 지금 살아 있는 부활체 수 — 「일제히」가 화면에서 읽히는지의 유일한 수치 */
      undeadAlive: field.list.filter((x) => x.undead).length,
      /** **판정선 ⓑ의 눈금** (§0.7 K "부활 순간이 화면에서 **한 번에** 읽혀야 한다"). 위의
       * `undeadAlive`는 「몇 기가 일어났나」이고 이 칸은 「그것이 **한 화면**에 있는가」다 — 둘은
       * 같은 수가 아니다. 부활은 **시전자 자리의 링 한 번**(`raiseUndead`의 `e.roarFx`)으로만
       * 예고되는데 실제로 일어서는 자리는 **시체밭 전체**라, 시전자와 부활군이 멀수록 「한 번에」가
       * 화면에서 안 선다. 눈금 셋:
       *  · `onField`/`offscreen`/`underPanel`/`underWaveBox` = 부활체의 화면 배치. 보스 마커·
       *    `enemies.gate.onScreen`과 **같은 술어**(`hud.ts gateVisible`)라 옛 값과 그대로 비교된다
       *  · `maxFromCasterPx` = 시전자에서 가장 먼 부활체까지의 **화면 거리**(px). 링 반지름
       *    (`roarRPx` = 링의 **최대** 반지름 = `enemyH × 2.8` × CAM)보다 크면 링은 그 부활을 **안 덮는다**
       *  · `spanPx` = 부활군 자신의 화면 지름(가장 먼 두 기 사이) — 「한 덩어리로 일어나는가」
       * 부활이 없는 프레임에서는 전부 0/null이다 */
      raiseRead: (() => {
        const us = field.list.filter((x) => x.undead);
        const pt = (u: { x: number; y: number }) => [VIEW.w / 2 + (u.x - map.cx) * CAM, VIEW.h / 2 + (u.y - map.cy) * CAM] as const;
        const seen = { onField: 0, offscreen: 0, underPanel: 0, underWaveBox: 0 };
        for (const u of us) seen[gateVisible(...pt(u))]++;
        let far = 0;
        let span = 0;
        for (let i = 0; i < us.length; i++) {
          const a = pt(us[i]);
          if (e) far = Math.max(far, Math.hypot(a[0] - sx, a[1] - sy));
          for (let j = i + 1; j < us.length; j++) {
            const b = pt(us[j]);
            span = Math.max(span, Math.hypot(a[0] - b[0], a[1] - b[1]));
          }
        }
        return {
          ...seen,
          maxFromCasterPx: us.length && e ? Math.round(far) : null,
          spanPx: us.length > 1 ? Math.round(span) : null,
          /** 시전자 자리에 뜨는 링의 화면 반지름(px) — 「예고가 부활을 덮는가」의 비교 대상 */
          roarRPx: Math.round(enemyH(NECRO.kind) * 2.8 * CAM),
        };
      })(),
      /** 무덤 재고(부활의 재료). ⚠ **이벤트 웨이브 동안의 천장은 `graveCap`이 아니라 `fieldCap`이다**
       * (combat.ts · iter111) — 그래서 `raiseCap`이 `graveCap`보다 커도 재료가 안 잘린다.
       * 감독 #72 ⑤의 「`graveCap`을 함께 볼 것」의 답이 이 두 칸이다: `graveCapEffective`가 실효값 */
      gravesNow: field.graves.length,
      graveCap: ENEMY.graveCap,
      graveCapEffective: field.eventWave ? ENEMY.fieldCap : ENEMY.graveCap,
      /** **무적이 되돌린 피해 합** — 0이면 무적 국면이 한 번도 안 맞았다는 뜻이다 */
      blocked: +combat.invulnBlocked.toFixed(1),
      /** 부활체 규약 3종의 검산값 (감독 고정) */
      speedMul: NECRO.speedMul,
      undeadSpeedWorld: +(ENEMY.baseSpeed * NECRO.speedMul).toFixed(1),
      /** 눈금 — 관문 둘과의 격 대조(보스 1050/3.4 · 중간보스 625/2.0) */
      hp: st.hp,
      maxHp: +maxHpOf(NECRO.kind).toFixed(0),
      scale: st.scale ?? 1,
      scrap: st.scrap,
      /** 시각 QA 검산 — 관문 둘과 **같은 규약**(iter68). `underPanel`이면 §0.7 K ②가 안 읽힌다 */
      at: e ? [Math.round(sx), Math.round(sy)] : null,
      visible: e ? gateVisible(sx, sy) : null,
    };
  })(),
  // **중간보스 = 엘리트 강화판 풀 7종** (DESIGN §3 신표 "중간보스 = 매 스테이지 마지막 웨이브
  // (3·9·15…) — 엘리트 강화판 풀에서 로테이션"). 보스와 같은 규약이다 — 편성 예산 **밖**이라
  // waves 표에 안 잡히고 이 블록이 유일한 대조창이다.
  // 자기 검산 셋: ① `waves`는 3n 중 6n을 뺀 6개 ② `maxHpByMid[i] × 3 ≈ boss.maxHpByBoss[i]`
  // (중간보스 = 같은 자리 보스의 ~1/3 — balance.ts MID 주석) ③ **`gradeOk`** = 풀 전 종의 눈금이
  // 같은가 = 「관문 세기는 순번의 함수다」의 기계 검산(balance.ts MID_GRADE 주석).
  mid: (() => {
    const m = field.list.find((e) => isMidKind(e.kind)) ?? null;
    const mn = midIndex(field.waveIdx + 1);
    const midWaves = WAVES.map((_, i) => i + 1).filter((w) => isMidWave(w));
    const g0 = ENEMY_STATS[MID.kind];
    return {
      /** 지금 판에 선(없으면 이번 순번의) 중간보스 종 */
      kind: m ? m.kind : midKindAt(Math.max(0, mn)),
      every: MID.every,
      /** 중간보스가 서는 웨이브 = 3n 중 비(非)보스 (36웨이브 체제 = 3·9·15·21·27·33의 6개) */
      waves: midWaves,
      /** 이번 웨이브의 중간보스 순번 (0-based, 중간보스 웨이브가 아니면 -1) */
      idx: mn,
      hpStep: MID.hpStep,
      /** 중간보스 웨이브별 최대 HP (자리 수만큼 — 36웨이브 체제는 6기) */
      maxHpByMid: midWaves.map((_, i) => +maxHpOf(midKindAt(i), i).toFixed(0)),
      /** **풀 로테이션 표** — 자리 10개 × 종 7개. 이 열이 곧 「관문마다 다른 얼굴이 서는가」다.
       * 45·51·57(순번 7·8·9)에서 앞의 셋이 한 번 더 서지만 `maxHp`가 5.4~9.1배라 같은 관문이 아니다 */
      // ⚠ 보스 표와 같은 이유로 `earlyHpMult`를 곱한다 — **웨이브 3 중간보스가 완화 구간 안**이다
      gates: midWaves.map((w, i) => ({ w, n: i, kind: midKindAt(i), maxHp: +(maxHpOf(midKindAt(i), i) * earlyHpMult(w - 1)).toFixed(0) })),
      /** 풀의 적종 키 (로테이션 순서) */
      pool: MID_KINDS,
      /** 팔레트 굽기가 실제로 7장을 등록했는가 (sprites.ts bakePalettes). 7이 아니면 원본 이름이
       * 틀렸거나 시트가 빠진 것이다 — probe 최상단 `sprites`도 114 → **121**이 돼야 한다 */
      baked: MID_KINDS.filter((k) => sprite(k)).length,
      /** 눈금 넷이 풀 전 종에서 같은가 (위 검산 ③). false면 어느 행이 원본 눈금을 물고 들어온 것이다 */
      gradeOk: MID_KINDS.every(
        (k) =>
          ENEMY_STATS[k].hp === g0.hp &&
          ENEMY_STATS[k].scrap === g0.scrap &&
          ENEMY_STATS[k].scale === g0.scale &&
          // 이속만 예외가 하나 있다 — 고정 출현(심연 촉수 강화판)은 0을 지킨다(골격이다)
          (ENEMY_STATS[k].speed === g0.speed || ENEMY_STATS[k].inWater === true)
      ),
      pending: field.midPending,
      alive: !!m,
      maxHp: m ? m.maxHp : maxHpOf(midKindAt(Math.max(0, mn)), Math.max(0, mn)),
      hp: m ? +m.hp.toFixed(1) : null,
      killed: MID_KINDS.reduce((a, k) => a + (combat.killsByKind[k] ?? 0), 0),
      scrap: g0.scrap,
      speedWorld: +(field.baseSpeed * g0.speed).toFixed(1),
      breaker: g0.breaker,
      /** **시각 QA 검산용** — 살아 있는 중간보스의 화면 좌표(px)와 «컷에 실제로 찍히는가».
       * 맵은 뷰포트의 1.2배(§5.0)라 살아 있어도 화면 밖에 있을 수 있고, 우측 HUD 패널과 상단
       * 웨이브 박스는 필드 위를 덮는다 — 컷을 눈으로 볼 때 "안 보인다"의 원인이 셋(밖/가림/미스폰)
       * 이라 수치로 갈라야 한다. `visible` = 뷰포트 안 && 두 패널 밖. */
      at: m ? [Math.round(VIEW.w / 2 + (m.x - map.cx) * CAM), Math.round(VIEW.h / 2 + (m.y - map.cy) * CAM)] : null,
      // 판정은 **hud.ts gateVisible 하나**다 — 가장자리 마커(감독 #49 ① ⓒ)가 같은 함수를 보고
      // 그리므로, 여기서 규칙을 다시 쓰면 「probe는 가려졌다는데 마커는 안 뜬다」가 생긴다
      visible: m ? gateVisible(VIEW.w / 2 + (m.x - map.cx) * CAM, VIEW.h / 2 + (m.y - map.cy) * CAM) : null,
    };
  })(),
  // 런 종료 (DESIGN §10 "클리어/패배 화면·재시작"). 둘 다 시뮬을 멈춘다
  run: {
    over: combat.over,
    cleared: field.cleared,
    /** **엔드 씬** (DESIGN §0.7 M). `endT` = 연출만의 시계(시뮬은 멎어 있다) · `endSec` = 전체 길이 ·
     * `endPhase` = 지금 어느 단계인가(`hold`/`tint`/`crack`/`burst`/`done`). **`done`이 뜬 프레임이
     * 곧 결과화면이 뜬 프레임**이라, 「연출이 결과화면을 얼마나 미뤘는가」가 이 두 칸으로 검산된다.
     * 패배가 아니면 전부 null이다 — 클리어는 이 연출을 안 탄다 */
    endT: combat.over ? +combat.endT.toFixed(2) : null,
    endSec: +END_SCENE_SEC.toFixed(2),
    endPhase: combat.over ? endPhase(combat.endT) : null,
    runT: +field.t.toFixed(1),
    kills: combat.kills,
    collected: +combat.collected.toFixed(1),
    // 종료 화면의 BOSS 행 (§3 보스 = 6n웨이브). boss.killed는 "잡았는가"의 불리언이라 런당 10기를
    // 세는 자리가 없었다 — 화면에 찍는 값과 같은 식을 그대로 노출해 눈과 장부를 맞춘다.
    // CORE LOST 두 값은 combat.coreLostBoss / coreLostMob이 이미 같은 장부를 찍고 있다
    bossKilled: bossKills(combat.killsByKind),
    bossTotal: BOSS_TOTAL,
  },
  /** **랭킹 (DESIGN §0.7 N · 감독 #67 ④)** — 컷 없이 「기록이 남았는가 · 정렬이 맞는가」를 보는 자리.
   *  `top`의 한 줄 = `[닉네임, 웨이브, 재도전, 처치]`(정본이 못박은 항목 4개 그대로)이고, **정렬 검산은
   *  이 배열 하나로 끝난다** — 웨이브 내림차순이 먼저, 같으면 재도전 오름차순. `retries`는 **지금 런의**
   *  재도전 횟수라 이어하기 컷(`SHOT_RELOAD=1`)에서 1씩 올라야 한다 */
  rank: (() => {
    const p = profile();
    const rows = allRows();
    return {
      nick: p.nick,
      nickFixed: p.nickFixed,
      retries,
      rows: rows.length,
      top: rows.slice(0, TOP_N).map((r) => [r.nick, r.wave, r.retries, r.kills]),
      my: rank.my ? [rank.my.nick, rank.my.wave, rank.my.retries, rank.my.kills] : null,
      editing: rank.editing,
      /** **서버 연결** (§0.7 N · 감독 #70). `on` = 이 런이 서버를 쓰는가(QA 컷은 `?net=1` 없이는
       *  언제나 false) · `state` = 마지막 왕복 · `remote` = 서버에서 읽은 줄 수(null = 아직 못 읽었다)
       *  · `pending` = 아직 못 올린 내 기록이 로컬에 있는가 */
      net: netInfo(),
    };
  })(),
  combat: (() => {
    const weapons = [];
    for (let i = 0; i < train.cars.length; i++) {
      const car = train.cars[i];
      // **분기가 덮인 실효 스탯**이다 (train.ts weaponOf) — 기준 스탯을 그대로 찍으면 T3 진화가
      // probe에서 안 보이고, 사격 루프가 쓰는 값과 갈린다
      const w = weaponOf(car);
      if (!w) continue;
      weapons.push({
        car: car.kind,
        tier: car.tier,
        /** T3 진화 분기 (DESIGN §7.4). null = 아직 T3가 아니거나 안 골랐다 */
        branch: car.branch,
        level: car.level,
        dmg: w.dmg,
        rate: w.rate,
        // 강화 레벨이 반영된 값 = 실제로 쓰이는 피해/DPS (dpsBase = Lv1 기준, BALANCE §4 표값)
        dpsBase: +(w.dmg * w.rate).toFixed(1),
        dps: +dpsOf(car).toFixed(2),
        // "루프 반경 = 1" → 월드
        range: w.range,
        rangeWorld: +(w.range * combat.unit).toFixed(0),
        pierceWalls: w.pierceWalls,
        // 곡사 (BALANCE §4 박격포: 12 광역 r 0.25 / 0.5-s / 사거리 1.8). arc = 사선 판정을 하지 않는다
        arc: w.arc ?? false,
        splash: w.splash ?? null,
        splashWorld: w.splash ? +(w.splash * combat.unit).toFixed(1) : null,
        // 특수 2종 (BALANCE §4 화염방사 1×다중히트 r 0.4 / 테슬라 4 체인3 r 0.6).
        // coneDeg는 **반각**이라 부채꼴 전체는 2배다. ignoreLos = 사선도 방패도 안 본다
        cone: w.cone ?? null,
        coneFanDeg: w.cone ? w.cone * 2 : null,
        chain: w.chain ?? null,
        chainJumpWorld: w.chainJump ? +(w.chainJump * combat.unit).toFixed(0) : null,
        ignoreLos: w.ignoreLos ?? false,
        fired: train.cars[i].fired,
        // 발사 수 / 경과 시간 ≤ rate 여야 한다 (사거리 밖·사선 차단이면 그만큼 적다)
        firedPerSec: +(train.cars[i].fired / Math.max(simT, 0.001)).toFixed(2),
        dealt: +train.cars[i].dealt.toFixed(1),
      });
    }
    // **무기 정본 카탈로그** (큐 1). 위의 `weapons`는 «편성에 실린 칸»이라 안 산 무기는 안 보인다 —
    // §4 표와 코드를 대조하려면 등재된 전 무기 행이 필요하다. 명목 DPS = dmg × rate(§0.5 배율 전)
    const catalog = Object.entries(WEAPONS).map(([k, w]) => ({
      kind: k,
      dmg: w.dmg,
      rate: w.rate,
      dpsBase: +(w.dmg * w.rate).toFixed(2),
      range: w.range,
      family: w.arc ? "곡사" : w.cone || w.chain || w.airOnly ? "특수" : "직사",
      // 계열별 프리미엄 — 없으면 null이라 §4 표의 비고 열과 1:1로 읽힌다
      pierceWalls: w.pierceWalls || null,
      splash: w.splash ?? null,
      hitSplash: w.hitSplash ?? null,
      ramp: w.ramp ?? null,
      homing: w.homing ?? null,
      salvo: w.salvo ?? null,
      burn: w.burn ? `${w.burn.dpsRate}×dmg/s ${w.burn.sec}s` : null,
      airOnly: w.airOnly ?? null,
      // 상점·카드에 나가는가 (대공 플랙만 false — 공중 적이 없어 표적이 0이다)
      active: !w.inactive,
      buyPrice: SHOP.carPrice[k] ?? null,
    }));
    return {
      rangeUnitWorld: +combat.unit.toFixed(1),
      weapons,
      catalog,
      // 신규 계열 계측 (큐 1). 직사 광역이 주 표적 말고 더 때린 연인원 · 화염 지대 수/무산/누적 피해 ·
      // 레이저 지속 조사 배수의 가중 평균(1.0 = 증폭 없음, 상한은 WEAPONS.laser.ramp)
      splashHits: combat.splashHits,
      fireZones: combat.fireZones,
      fireOnWater: combat.fireOnWater,
      fireDmg: +combat.fireDmg.toFixed(1),
      rampAvg: combat.rampShots ? +(combat.rampSum / combat.rampShots).toFixed(3) : null,
      kills: combat.kills,
      killsByKind: combat.killsByKind,
      // 분열 (§8.⑦ 슬라임 30 → 15×2 → 8×4). 분열체는 웨이브 스폰 수(enemies.spawned)에 안 잡힌다
      splits: combat.splits,
      dealtTotal: +train.cars.reduce((a, b) => a + b.dealt, 0).toFixed(1),
      coreHp: +combat.coreHp.toFixed(1),
      coreMax: CORE.hp,
      // 런 **누적** 코어 손실을 경로별로 가른 값 (큐 2). `coreMax - coreHp`와 합이 같아야 한다 —
      // 어긋나면 코어 피해가 이 두 경로 밖에서 새고 있다는 뜻이라 그 자체가 검산이다
      coreLostBoss: +combat.coreDmgBoss.toFixed(1),
      coreLostMob: +combat.coreDmgMob.toFixed(1),
      // BALANCE §1: 근접 2/s, 산병 원거리 1/s (감독 #6 ③) — **§0.5로 개체당 ×0.2**
      enemyDpsEach: +(CORE.enemyDps * coreDpsMult()).toFixed(2),
      skirmisherDps: +(CORE.skirmisherDps * coreDpsMult()).toFixed(2),
      enemyDpsBase: CORE.enemyDps,
      // **보스는 여기 안 잡힌다** — 점타라 연속 DPS가 아니다(BALANCE §1). 보스 몫은 boss.coreHits
      coreDpsNow: +(
        field.list.reduce(
          (n, e) =>
            n +
            (ENEMY_STATS[e.kind].coreHit
              ? 0
              : e.atCore
                ? CORE.enemyDps * coreDpsMult()
                : e.firing
                  ? CORE.skirmisherDps * coreDpsMult()
                  : 0),
          0,
        )
      ).toFixed(1),
      shotsAlive: combat.shots.length,
      // 곡사 (§6 "탄속 느림, 이동 표적에 약함"). 탄속 300은 BALANCE §4에 등재됐다(감독 #8 ③).
      // flightAtRange = 최대 사거리에서의 비행 시간, leaveSplashSec = 좀비가 착탄 반경을 벗어나는 시간.
      // 앞의 값이 뒤의 값보다 커야 "이동 표적에 약함"이 성립한다
      arc: (() => {
        const w = WEAPONS.mortar;
        const splash = (w.splash ?? 0) * combat.unit;
        return {
          shellSpeed: ARC.shellSpeed,
          shellsAlive: combat.shells.length,
          impacts: combat.arcImpacts,
          // 아무도 못 맞힌 착탄 = 표적이 비행 시간 동안 걸어 나간 경우 (곡사의 대가)
          misses: combat.arcMisses,
          hits: combat.arcHits,
          hitsPerImpact: +(combat.arcHits / Math.max(combat.arcImpacts, 1)).toFixed(2),
          flightAtRange: +((w.range * combat.unit) / ARC.shellSpeed).toFixed(2),
          leaveSplashSec: +(splash / ENEMY.baseSpeed).toFixed(2),
        };
      })(),
      // 특수 2종의 **실효** 검산 (BALANCE §4 비고). 화염방사는 "명목 10 → 실효 15"라 분사당 평균
      // 1.5기를 때려야 하고(hitsPerShot), 테슬라는 "명목 4 → 실효 12"라 방전당 3기를 채워야 한다.
      // 둘 다 밀집 의존이라 표본이 적으면 1.0에 가깝게 나온다 — 그때는 값이 아니라 편성·밀도를 볼 것
      cone: (() => {
        const w = WEAPONS.flamer;
        return {
          fanDeg: w.cone! * 2,
          rangeWorld: +(w.range * combat.unit).toFixed(0),
          shots: combat.coneShots,
          hits: combat.coneHits,
          hitsPerShot: +(combat.coneHits / Math.max(combat.coneShots, 1)).toFixed(2),
          effDps: +((combat.coneHits / Math.max(combat.coneShots, 1)) * w.dmg * w.rate).toFixed(1),
        };
      })(),
      chain: (() => {
        const w = WEAPONS.tesla;
        return {
          max: w.chain!,
          jumpWorld: +(w.chainJump! * combat.unit).toFixed(0),
          shots: combat.chainShots,
          hits: combat.chainHits,
          hitsPerShot: +(combat.chainHits / Math.max(combat.chainShots, 1)).toFixed(2),
          effDps: +((combat.chainHits / Math.max(combat.chainShots, 1)) * w.dmg * w.rate).toFixed(1),
        };
      })(),
      // 성벽 파괴 직진 (§8 오우거). BALANCE §1 "성벽 HP 120 … 오우거 12히트"의 검산 —
      // hitsPerWall이 12여야 정본과 맞는다. breaking = 지금 성벽을 때리고 있는 개체 수
      breaker: {
        dmg: ENEMY_STATS.ogre.breaker!.dmg,
        everySec: ENEMY_STATS.ogre.breaker!.everySec,
        hitsPerWall: TERRAIN.wallHp / ENEMY_STATS.ogre.breaker!.dmg,
        breakers: field.list.filter((e) => ENEMY_STATS[e.kind].breaker).length,
        breaking: field.list.filter((e) => e.breaking).length,
        wallDmg: +combat.breakerDmg.toFixed(1),
        demolished: combat.breakerDemolished,
      },
      // **실드 전열** (§0.6 C3 · §8.② 방패 오크). 세 조항이 세 축으로 나뉜다:
      //  · blocked  = 실드가 **자기 몫으로** 흡수한 직사 피해 총량 (ⓑ 유한 — 이만큼이 총량에서 빠졌다)
      //  · coverSkipped = 전열에 가려 **표적 후보에서 빠진 연인원** (= C3 신규 문법의 «주» 경로.
      //    `losBlocked`와 같은 규약이고, **0이면 전열이 아무것도 안 가린 것이다**)
      //  · coverBlocked  = 전열이 **피해 단계에서** 막은 몫 — 관통 빔·착탄 광역만 여기로 온다
      //  · breaks / made = 태어난 방패병 중 전열이 **실제로 열린** 수 (ⓑ의 유일한 판정 분수)
      //  · openSec / breaks = 깨진 뒤 **살아서 싸운 평균 초**. 0에 가까우면 실드는 그냥 HP 한 겹이지
      //    「열리는 열」이 아니다 — 횟수만으로는 이 둘이 안 갈린다(C4 `brokenAliveAvg`와 같은 규약)
      shield: {
        pool: SHIELD.pool,
        cover: SHIELD.cover,
        reach: SHIELD.reach,
        blocked: +combat.shieldBlocked.toFixed(1),
        coverSkipped: combat.coverSkipped,
        coverBlocked: +combat.coverBlocked.toFixed(1),
        breaks: combat.shieldBreaks,
        made: field.guardsMade,
        brokePct: +((combat.shieldBreaks / Math.max(field.guardsMade, 1)) * 100).toFixed(1),
        openSec: +field.shieldOpenSec.toFixed(1),
        openAvg: +(field.shieldOpenSec / Math.max(combat.shieldBreaks, 1)).toFixed(2),
        guardsNow: field.guards.length,
      },
      // **처치까지 맞은 발수** (DESIGN §0.7 H1 · BALANCE §0.7 — 4차의 첫 판정 기준).
      // 판정선은 「**웨이브 40+에서 기준 편성이 잡몹을 2~5발에** 죽인다」이고 1발 = 실패다.
      // ⚠ **`late.onePct`가 이 축의 사용자 판정("한 방에 죽는다")과 정확히 마주 보는 수치다** —
      // 평균만 보면 광역 한 발이 20기를 스치고 지나간 표본이 평균을 1 쪽으로 끌어당겨 안 보인다.
      // 표본은 «사격에 맞아 죽은 잡몹»만이다(자폭·소진·관문은 뺀다 — combat.ts 처치 루프)
      ttk: (() => {
        /** **화면 진입 최대반경 `Rmax(θ)`를 루프 반경 단위로** (iter159가 남긴 눈금 · iter160이 코드로).
         * `Rmax(θ) = min((VIEW.w/2)/|cosθ|, (VIEW.h/2)/|sinθ|)` px = 코어 기준 각 θ에서 적이
         * **화면 안에 들 수 있는 가장 먼 반경**이다. 세 대표각만 낸다: 동·서축(θ=0) · 대각(45°) ·
         * 남·북축(θ=90°). 1280×720·`mapScale 1.2`에서 663 / 509 / **373px** = 3.54 / 2.72 / **1.99 U**.
         * ⚠ **하드코딩하지 말 것** — 뷰포트나 `map.w`가 갈리면 이 셋이 통째로 움직인다 */
        const uPx0 = map.outerR * CAM;
        const rmaxU = {
          ew: +(VIEW.w / 2 / uPx0).toFixed(3),
          diag: +(Math.min(VIEW.w / 2 / Math.SQRT1_2, VIEW.h / 2 / Math.SQRT1_2) / uPx0).toFixed(3),
          ns: +(VIEW.h / 2 / uPx0).toFixed(3),
        };
        const band = (lo: number, hi: number) => {
          let n = 0;
          let sum = 0;
          let one = 0;
          let nNc = 0;
          let oneNc = 0;
          let nDs = 0;
          let oneDs = 0;
          const kinds: Record<string, { n: number; one: number; ds: number; dsOne: number }> = {};
          let krN = 0;
          let krSum = 0;
          const krHist = Array.from({ length: KILL_R_BINS }, () => 0);
          const krKinds: Record<string, { n: number; sum: number }> = {};
          const krEnemies: Record<string, { n: number; sum: number; hits: number; life: number }> = {};
          let msN = 0;
          let msSum = 0;
          for (let i = lo; i < Math.min(hi, combat.ttk.length); i++) {
            n += combat.ttk[i].n;
            sum += combat.ttk[i].sum;
            one += combat.ttk[i].one;
            nNc += combat.ttk[i].nNc;
            oneNc += combat.ttk[i].oneNc;
            nDs += combat.ttk[i].nDs;
            oneDs += combat.ttk[i].oneDs;
            for (const [k, v] of Object.entries(combat.ttk[i].kind)) {
              const acc = (kinds[k] ??= { n: 0, one: 0, ds: 0, dsOne: 0 });
              acc.n += v.n;
              acc.one += v.one;
              acc.ds += v.ds;
              acc.dsOne += v.dsOne;
            }
            krN += combat.ttk[i].killR.n;
            krSum += combat.ttk[i].killR.sum;
            for (let b = 0; b < KILL_R_BINS; b++) krHist[b] += combat.ttk[i].killR.hist[b];
            for (const [k, v] of Object.entries(combat.ttk[i].killRByKind)) {
              const acc = (krKinds[k] ??= { n: 0, sum: 0 });
              acc.n += v.n;
              acc.sum += v.sum;
            }
            for (const [k, v] of Object.entries(combat.ttk[i].killRByEnemy)) {
              const acc = (krEnemies[k] ??= { n: 0, sum: 0, hits: 0, life: 0 });
              acc.n += v.n;
              acc.sum += v.sum;
              acc.hits += v.hits;
              acc.life += v.life;
            }
            msN += combat.ttk[i].miss.n;
            msSum += combat.ttk[i].miss.sum;
          }
          return {
            n,
            avg: +(sum / Math.max(n, 1)).toFixed(2),
            onePct: +((one / Math.max(n, 1)) * 100).toFixed(1),
            /** **불변식 6**(§0.7-B) — 예외 무기 셋을 뺀 분모 위의 「비치명타 한 방 처치」 비율.
             * `onePct`와 갈리는 폭이 곧 「레일건·저격포·함포가 지고 있던 몫 + 치명타의 몫」이다 */
            nNc,
            oneNcPct: +((oneNc / Math.max(nNc, 1)) * 100).toFixed(1),
            /** **판정 밖으로 빠진 몫** (iter157 · 큐 1) — 예외 무기 셋(`ONE_SHOT_OK`)이 분모에서
             * 통째로 빠지므로 「규약이 실제로 덮는 표본이 몇 %인가」가 이 한 칸이다.
             * `nNc / n`의 여집합이고, 이 수가 크면 불변식 6의 비율은 «편성의 절반 이하»만 보고 있다 */
            exPct: +(((n - nNc) / Math.max(n, 1)) * 100).toFixed(1),
            /** **§0.7-H가 다시 그은 불변식 6의 판정 칸** (INBOX #76 ① · iter161 신설).
             * 분모 `nDs` = 예외 무기 셋을 뺀 위에 **「죽인 한 발이 직사 계열의 단일 표적 타격」**인
             * 처치만 남긴 것이고(광역·연쇄·지속은 분모에서도 뺀다 · combat.ts `hitDsg`),
             * `oneDsPct`가 그 위의 「비치명타 한 방」 비율 = **판정선 ≤10%의 새 눈금**이다.
             * `dsOutPct`는 그 규약이 «못 보는» 몫(= `1 − nDs/n`)이라 옛 `exPct`의 확대판이다.
             * ⚠ **`oneNcPct`와 같은 자로 읽지 말 것** — 분모가 다르다(옛 칸은 회귀 대조용으로 남긴다) */
            nDs,
            oneDsPct: +((oneDs / Math.max(nDs, 1)) * 100).toFixed(1),
            dsOutPct: +(((n - nDs) / Math.max(n, 1)) * 100).toFixed(1),
            /** **무기칸별 「비치명 한 방」 분해** (iter157 · 큐 1). 형식 = `<칸>[*]:<한 방 수>/<처치 수>(<%>)`
             * 이고 처치 수 내림차순이다. **원수를 적는 것이 규약이다** — 여러 시드를 합칠 때 비율만
             * 있으면 가중이 안 맞는다(도구가 되뽑아 더한다). **예외 셋(railgun·sniper·cannon)에는 `*`**가
             * 붙는다: 그 셋은 분모 밖이라 비율이 아무리 높아도 불변식 6이 안 본다(§0.7-B는 그것이
             * «정체성»이라고 못박았다). ⚠ 이 칸은 «분해»이지 판정이 아니다 — 판정선은 여전히 `oneNcPct ≤ 10`다 */
            oneByKind: Object.entries(kinds)
              .sort((a, b) => b[1].n - a[1].n)
              .map(([k, v]) => `${k}${ONE_SHOT_OK.includes(k) ? "*" : ""}:${v.one}/${v.n}(${((v.one / v.n) * 100).toFixed(0)}%)`),
            /** **새 분모의 무기칸별 분해** (INBOX #76 ① · iter161). 형식 = `<칸>[*]:<한 방>/<직사단일 처치>`
             * 이고 **`ds`가 0인 칸은 아예 안 싣는다**(= 그 무기는 새 분모에 한 줄도 안 낸다는 뜻이다).
             * 옛 `oneByKind`와 나란히 두면 「§0.7-H가 무엇을 분모에서 뺐는가」가 칸 단위로 읽힌다 */
            dsByKind: Object.entries(kinds)
              .filter(([, v]) => v.ds > 0)
              .sort((a, b) => b[1].ds - a[1].ds)
              .map(([k, v]) => `${k}${ONE_SHOT_OK.includes(k) ? "*" : ""}:${v.dsOne}/${v.ds}(${((v.dsOne / v.ds) * 100).toFixed(0)}%)`),
            /** **잡몹의 처치 반경 분포** (iter160 · 큐 1 — 감독 결정 요청 표 8 갈래 ⓔ의 근거).
             * 단위는 **루프 반경 1**(`boss.log[].killDistU`와 같은 규약 · combat.ts `KILL_R_STEP`).
             * ⓔ(「적이 화면에 들기 전에 지워진다」)는 **`med`를 `rmaxU.ns`(= 화면 진입 최대반경의
             * 세로축 값)와 견주어** 판정한다 — 밖이면 세로 방향에서 오는 적은 화면에 들기 전에 죽는다.
             * `outNsPct`/`outDiagPct`/`outEwPct`는 그 세 문턱 «밖에서» 난 처치의 비율이고,
             * 문턱 자체는 아래 `rmaxU`가 **VIEW·CAM에서 유도**한다(하드코딩이 아니다).
             * ⚠ 표본은 위 `n`과 **같다** — 사격에 맞아 죽은 잡몹만이다(보스·중간보스·자폭·소진 제외) */
            killR: (() => {
              const uPx = map.outerR * CAM;
              const q = (pq: number) => {
                if (krN === 0) return 0;
                const want = krN * pq;
                let acc = 0;
                for (let b = 0; b < KILL_R_BINS; b++) {
                  if (acc + krHist[b] >= want) {
                    // 칸 안 선형보간 — 폭 0.25라 보간 없이는 판정선(1.99)이 칸 하나에 삼켜진다
                    const within = krHist[b] === 0 ? 0 : (want - acc) / krHist[b];
                    return +((b + within) * KILL_R_STEP).toFixed(3);
                  }
                  acc += krHist[b];
                }
                return +(KILL_R_BINS * KILL_R_STEP).toFixed(3);
              };
              const outPct = (u: number) => {
                if (krN === 0) return 0;
                let acc = 0;
                for (let b = 0; b < KILL_R_BINS; b++) {
                  const loU = b * KILL_R_STEP;
                  const hiU = loU + KILL_R_STEP;
                  if (u <= loU) acc += krHist[b];
                  else if (u < hiU) acc += krHist[b] * ((hiU - u) / KILL_R_STEP);
                }
                return +((acc / krN) * 100).toFixed(1);
              };
              const med = q(0.5);
              return {
                n: krN,
                avg: +(krSum / Math.max(krN, 1)).toFixed(3),
                med,
                q25: q(0.25),
                q75: q(0.75),
                medPx: Math.round(med * uPx),
                outNsPct: outPct(rmaxU.ns),
                outDiagPct: outPct(rmaxU.diag),
                outEwPct: outPct(rmaxU.ew),
                hist: krHist,
              };
            })(),
            /** **처치 반경의 무기칸별 분해** (iter162 · 큐 1 — 표 8 ⓔ의 «손잡이»가 §4 무기표의
             * 어느 «행»인지를 가르는 칸). 위 `killR`은 전선이 얼마나 먼지만 말하고 무엇이 그 전선을
             * 만드는지는 안 말한다 — 이 칸이 그 목록이다.
             * 형식 = `<칸>:<반경 합>/<처치 수>@<§4 range>[^]`이고 **평균 반경 내림차순**이다.
             * · **원수(합·수)를 적는 것이 규약이다** — 여러 시드를 합칠 때 평균만 있으면 가중이 안 맞는다
             *   (`oneByKind`와 같은 규약 · 도구가 되뽑아 더한다).
             * · `@` 뒤는 **§4 무기표의 기준 `range`**(T1 Lv1 · 루프 반경 1 단위)이고 `^`는 **곡사**(`arc`)다 —
             *   「사거리가 길어서 멀리서 죽이나」와 「곡사라 멀리 착탄하나」는 이 둘을 나란히 놔야 갈린다.
             *   ⚠ 카드 티어가 사거리를 ±15~40% 흔들므로 **기준값이지 실효값이 아니다**.
             * · 문턱은 `rmax.ns`(= 화면 진입 최대반경의 세로축 값) — 평균이 그 밖인 칸이 «화면 밖에서
             *   죽이는 칸»이다. ⚠ **판정이 아니다** — 갈래를 고르는 것은 감독이다(표 8 ⓔ).
             * · `Σ n === killR.n`이 기계 검산이다(같은 표본을 같은 열쇠로 한 번 더 가른 것이다) */
            killRByKind: Object.entries(krKinds)
              .sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)
              .map(([k, v]) => `${k}:${v.sum.toFixed(1)}/${v.n}@${WEAPONS[k] ? `${WEAPONS[k].range}${WEAPONS[k].arc ? "^" : ""}` : "?"}`),
            /** **처치 반경의 «적종별» 분해** (iter165 · 큐 1 — 표 8 ⓔ). 위 `killRByKind`가 「어느
             * 무기가 전선을 만드나」라면 이 칸은 **「어느 적이 그 자리에서 죽나」**다. iter164가
             * w10의 계단을 **진영 교대**로 못박았으므로 진영을 가르는 열쇠는 적종이다.
             * 형식 = `<적종>:<반경 합>/<처치 수>`이고 **평균 반경 내림차순**이다(원수를 싣는 것이
             * 규약 — 9시드를 합칠 때 평균만 있으면 가중이 안 맞는다).
             * `Σ n === killR.n`이 기계 검산이다(같은 표본을 다른 열쇠로 한 번 더 가른 것이다) */
            killRByEnemy: Object.entries(krEnemies)
              .sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)
              .map(([k, v]) => `${k}:${v.sum.toFixed(1)}/${v.n}`),
            /** **적종별 위협도** (BALANCE §0.9 ③ · 감독 #79 ③ — 「근접이 원거리보다 유의하게 빨리
             * 죽는가」의 눈금). 표본은 위 `killRByEnemy`와 **완전히 같다**(사격에 맞아 죽은 잡몹) —
             * 같은 표본을 반경이 아니라 **발수·생존 초**로 한 번 더 읽은 칸이다.
             * 형식 = `<적종>:<발수 합>/<처치 수>/<생존 초 합>`이고 **평균 발수 오름차순**이다
             * (= 「가장 빨리 죽는 적」이 맨 앞). **원수를 싣는 것이 규약**이라 9시드를 합칠 때
             * 가중이 안 어긋난다(`killRByEnemy`와 같은 규약 — inv.mjs가 되뽑아 더한다).
             * ⚠ **반경만으로는 못 가른다** — 원거리 4종은 `standoff`로 애초에 멀리 서므로 반경이
             * 크게 나오는 것이 당연하다. 「빨리 죽는가」는 이 칸의 발수·생존 초가 진다 */
            ttkByEnemy: Object.entries(krEnemies)
              .sort((a, b) => a[1].hits / a[1].n - b[1].hits / b[1].n)
              .map(([k, v]) => `${k}:${v.hits}/${v.n}/${v.life.toFixed(1)}`),
            /** **표본 «밖»의 몫** (iter165 · 큐 1 — 계단이 «전선»인가 «눈금»인가의 판정 칸).
             * 위 `killR`의 표본은 `e.hits > 0`(사격에 맞아 죽은 잡몹)뿐이라 **한 발도 안 맞고 죽은
             * 개체**(화염 지대·산성 풀·폭발 지물)가 통째로 빠진다. 그 빠진 개체를 같은 처치 지점에서
             * 같은 식으로 센 것이 이 칸이다. `pct`는 `n / (killR.n + n)` = 「눈금이 못 보는 몫」이고
             * `avg`가 그 자리다 — **avg가 `killR.avg`보다 «안쪽»이면 남은 표본이 밖으로 쏠린 것**이고
             * 그때 전선의 계단은 «눈금»이 만든 수다. ⚠ 자폭 박쥐·설치 폭탄은 여기 안 든다(`boomed` 경로) */
            miss: { n: msN, avg: +(msSum / Math.max(msN, 1)).toFixed(3), pct: +((msN / Math.max(krN + msN, 1)) * 100).toFixed(1) },
          };
        };
        return {
          /** 판정 문턱 셋 (위 `rmaxU` 주석) — `band().killR`의 `outNsPct` 등이 이것을 쓴다.
           * `px`를 함께 실어 컷의 픽셀 자와 바로 맞춰 볼 수 있게 한다 */
          rmax: { ...rmaxU, px: { ew: Math.round(rmaxU.ew * uPx0), diag: Math.round(rmaxU.diag * uPx0), ns: Math.round(rmaxU.ns * uPx0) }, loopPx: +uPx0.toFixed(1) },
          hpGrow: qaHpGrowValue(),
          /** **§0.7-B의 두 축이 이 컷에서 실제로 쓴 값**(QA `?ehp=`·`?wdmg=`가 덮었으면 그 값).
           * 처치 발수는 이 둘의 «비»에만 달렸으므로 `ehpPerDmg`가 사다리의 눈금이다 —
           * 3차 체제(개편 전)가 0.4/1 = **0.40**이고 §0.7-B가 4.0/3 = **1.33**이다(×3.33) */
          ehp: enemyHpMult(),
          wdmg: weaponDmgMult(),
          ehpPerDmg: +(enemyHpMult() / weaponDmgMult()).toFixed(3),
          /** 곡선의 **면세 구간** (감독 #63) — 이 웨이브까지는 배수 1.0이다 */
          w0: qaHpGrowFromValue(),
          /** 웨이브 1 대비 잡몹 HP 배수 (§0.7 H1 곡선의 눈금).
           * `w18`이 **1.0이어야 한다** — 면세 구간(`w0 19`)의 기계 검산이 이 한 칸이다.
           * ⚠ **끝 칸이 `w60` → `w36`으로 갈렸다**(감독 #72 ①) — 「60은 ×13~30」이던 감독 초안
           * 구간은 **60웨이브 전제**라 36 체제의 표적은 아직 없다(감독 #72 ②가 다시 유도한다) */
          mult: { w18: +waveHpMult(17).toFixed(2), w20: +waveHpMult(19).toFixed(2), w28: +waveHpMult(27).toFixed(2), w36: +waveHpMult(35).toFixed(2) },
          /** **§0.9 선형 성장의 기계 검산**(감독 #79 ①) — 계수 0.005면 `w10 1.05 · w18 1.09 · w36 1.18`이다.
           * 위 `mult`(지수)와 **따로 낸다**: 지수는 면세 구간(w0 19) 밖에서만 서고 이 칸은 런 전체에 선다.
           * `all36`이 종점의 «두 곡선 곱»이라 감독 표의 「7.06 → 8.33」이 이 한 칸으로 대조된다 */
          lin: {
            coef: qaHpWaveLinValue(),
            w10: +waveLinMult(9).toFixed(3),
            w18: +waveLinMult(17).toFixed(3),
            w36: +waveLinMult(35).toFixed(3),
            all36: +(waveHpMult(35) * waveLinMult(35)).toFixed(2),
          },
          /** **초반 완화**(§0.7-B · 감독 #67 ②) — `earlyMul` 배수와 그것이 걸리는 마지막 웨이브,
           * 그리고 경계 세 칸의 실효 배수. `w6`이 배수 그대로이고 `w7`이 1.0이어야 한다.
           * ⚠ 이 배수는 **관문도 탄다** — 웨이브 3(중간보스)·6(보스)이 구간 안이다(enemy.ts 주석) */
          early6: {
            mul: qaEarlyMulValue(),
            until: ENEMY.earlyUntil,
            w1: +earlyHpMult(0).toFixed(2),
            w6: +earlyHpMult(5).toFixed(2),
            w7: +earlyHpMult(6).toFixed(2),
          },
          // ⚠ **세 구간은 «런의 3등분»이다** — 60웨이브 체제의 0~20 / 20~40 / 39~60을
          // 36웨이브로 옮긴 값이 아래다(감독 #72 ①). 옛 컷의 `late`와 직접 비교하지 말 것 —
          // 분모가 웨이브 40~60에서 **웨이브 24~36**으로 갈렸다
          early: band(0, 12),
          mid: band(12, 24),
          late: band(23, 36),
          /** **불변식 6의 판정 구간**(§0.7-B) — 「웨이브 4부터」라 인덱스 3부터이고, 위 `early`가
           * 웨이브 1~3(면제 구간)을 포함해 이 축을 아래로 끌기 때문에 따로 낸다.
           * 위쪽 끝(19)은 감독이 §0.7-B에 적은 구간 그대로다 — 그 위는 §0.7 H1의 창이 맡는다 */
          noOne: band(3, 19),
          /** 웨이브별 평균 발수 (표본이 있는 웨이브만) — 곡선이 «어디서» 창을 벗어나는지가 여기 있다 */
          byWave: combat.ttk
            .map((r, i) => (r.n > 0 ? `w${i + 1}:${(r.sum / r.n).toFixed(1)}` : null))
            .filter(Boolean),
          /** **웨이브별 「비치명타 한 방」 비율** (INBOX #74 ② · iter154 신설). `noOne`은 웨이브 4~19를
           * 한 수로 뭉치므로 **그 28%가 «어느 웨이브»에서 나는지**가 안 보인다 — 성장 축을 옮기는
           * 작업은 「초반(배율의 몫)」과 「중반(성장의 몫)」을 갈라야 손잡이를 고를 수 있다.
           * 형식 = `w<번호>:<비율>%/<표본>` (예외 무기 셋을 뺀 분모 위) */
          noOneByWave: combat.ttk
            .map((r, i) => (r.nNc > 0 ? `w${i + 1}:${((r.oneNc / r.nNc) * 100).toFixed(0)}%/${r.nNc}` : null))
            .filter(Boolean),
          /** **같은 줄을 새 분모로** (INBOX #76 ①). 형식은 위와 같고 분모만 `nDs`다 —
           * 판정 구간의 위 끝이 「4~18」인지 「4~19」인지가 §0.7-B와 §0.7-H에서 갈려 있어(STATUS 미결)
           * **웨이브 19 한 줄의 몫을 이 칸에서 직접 빼 볼 수 있어야** 두 읽기가 같은 답인지 난다 */
          oneDsByWave: combat.ttk
            .map((r, i) => (r.nDs > 0 ? `w${i + 1}:${((r.oneDs / r.nDs) * 100).toFixed(0)}%/${r.nDs}` : null))
            .filter(Boolean),
          /** **웨이브별 평균 처치 반경** (iter163 신설 · 큐 1 — 표 8 ⓔ의 근거).
           * 위 `band().killR`은 런을 셋으로만 뭉치는데 **가운데 대(w13~24)에서 칸별 평균 반경 자체가
           * 정점**이라(iter162) 「그 안 어디서 꺾이나」가 안 갈린다 — 면세 구간의 끝(`w0` 19)이
           * 그 밴드 «안»에 있어 면세 안(13~19)과 밖(20~24)이 한 칸에 섞이기 때문이다.
           * 형식 = `w<번호>:<평균 반경>/<표본>` (`noOneByWave`·`oneDsByWave`와 같은 규약 · 단위는
           * 루프 반경 1). ⚠ **히스토그램은 웨이브별로 내지 않는다** — 곡선의 «모양»에는 평균 하나면
           * 되고 17빈 × 36줄은 sweep 한 줄이 못 읽는다. 위 `w0`·`hpGrow`·`early6`과 나란히 읽을 것 */
          killRByWave: combat.ttk
            .map((r, i) => (r.killR.n > 0 ? `w${i + 1}:${(r.killR.sum / r.killR.n).toFixed(3)}/${r.killR.n}` : null))
            .filter(Boolean),
          /** **웨이브별 «표본 밖»** (iter165 · 큐 1). 위 `killRByWave`와 **한 자로 읽는 짝**이다 —
           * 같은 웨이브의 「빠진 개체」가 몇이고 어디서 죽었는가. 형식·단위가 위와 같다
           * (`w<번호>:<평균 반경 U>/<수>`). w9→w10에서 위 줄이 +0.68 U 계단을 내는데 이 줄의
           * 몫이 그 자리에서 커지고 **안쪽**이면 계단은 «눈금»이고, 몫이 안 갈리거나 이 줄도
           * 같이 밖으로 가면 계단은 «전선»이다 */
          missByWave: combat.ttk
            .map((r, i) => (r.miss.n > 0 ? `w${i + 1}:${(r.miss.sum / r.miss.n).toFixed(3)}/${r.miss.n}` : null))
            .filter(Boolean),
        };
      })(),
      // **데미지 숫자** (§0.7 H3). 이 항목의 판정선은 60fps이고 그 앞의 두 손잡이가
      // 합산 창(`mergeSec`)과 동시 표시 상한(`max`)이다 — 아래 네 칸이 그 둘이 실제로 도는지를 잡는다:
      //  · `merged / (spawned + merged)` = 합산이 삼킨 비율. 0이면 창이 안 도는 것이다
      //  · `liveMax` = 한 프레임 최대 동시 표시 수. `max`에 붙어 있으면 상한이 «상시» 걸린 것이다
      //  · `dropped` = 상한에서 버린 수. 크면 숫자가 화면에서 «깜빡인다»
      //  · `hist`/`q` = 퇴장 시점의 **합산 후** 값 분포 = §0.7 H3의 「구간 경계는 실측 분포로」의 근거.
      //    `hist`는 밑 √2(칸 i의 아래 경계 = 2^(i/2))이고 `q`는 거기서 뽑은 근사 사분위다
      //  · `bandPct` = 지금 경계로 4구간이 실제로 갈리는가(한 칸이 100%면 색이 하나뿐인 것과 같다)
      dmgNum: (() => {
        const h = combat.dmgHist;
        const n = h.reduce((a2, b2) => a2 + b2, 0);
        const lo = (i: number) => (i <= 0 ? 0 : 2 ** (i / 2));
        const at = (p: number) => {
          let acc = 0;
          for (let i = 0; i < h.length; i++) {
            acc += h[i];
            if (acc >= n * p) return +lo(i).toFixed(1);
          }
          return 0;
        };
        // 구간 집계는 히스토그램이 아니라 **combat.ts `bandOf`가 값마다 센 것**이다 —
        // 버킷(밑 √2)으로 나누면 경계가 버킷 안에 떨어질 때 화면과 다른 것을 센다
        const band = combat.dmgBand;
        return {
          cfg: { max: DMG_NUM.max, mergeSec: DMG_NUM.mergeSec, sec: DMG_NUM.sec, critScale: DMG_NUM.critScale, band: DMG_NUM.band },
          spawned: combat.dmgSpawned,
          merged: combat.dmgMerged,
          mergedPct: +((combat.dmgMerged / Math.max(combat.dmgSpawned + combat.dmgMerged, 1)) * 100).toFixed(1),
          dropped: combat.dmgDropped,
          live: combat.dmgNums.length,
          liveMax: combat.dmgLiveMax,
          n,
          q: { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9), p99: at(0.99) },
          bandPct: band.map((v) => +((v / Math.max(n, 1)) * 100).toFixed(1)),
          hist: h.map((v, i) => (v > 0 ? `${+lo(i).toFixed(1)}:${v}` : null)).filter(Boolean),
        };
      })(),
      // **치명타** (§0.7 H2). `pct`가 실측 치확이고 명목(`shop.passive.critPct`)과 갈리면
      // 어딘가가 `hit()`을 안 지나는 것이다 — 조준 포격(§6.2)은 설계상 그 밖이라 여기 안 든다
      crit: {
        hits: combat.hits,
        crits: combat.critHits,
        pct: +((combat.critHits / Math.max(combat.hits, 1)) * 100).toFixed(1),
        bonus: +combat.critBonus.toFixed(1),
      },
      shieldBlocked: +combat.shieldBlocked.toFixed(1),
      // 직사 사선 (§4.1) — 막혀서 후보에서 빠진 연인원과, 그중 관측칸(§6.1)이 열어 준 몫
      losBlocked: combat.losBlocked,
      losOverHills: combat.losOverHills,
      shieldSelfCheck: (() => {
        const deg = ENEMY_STATS.shield_orc.frontShield!;
        const cos = Math.cos((deg * Math.PI) / 180);
        return { deg, front: 1 >= cos, side: 0 >= cos, back: -1 >= cos };
      })(),
      // 조준 포격 (BALANCE §4 마지막 행 / DESIGN §6.2). 발사원은 플레이어 클릭 — QA는 ?strike=wall|mob
      artillery: {
        dmg: ARTILLERY.dmg,
        radiusWorld: +(ARTILLERY.radius * combat.unit).toFixed(1),
        terrainDmg: ARTILLERY.dmg * ARTILLERY.terrainMult,
        delaySec: ARTILLERY.delaySec,
        cooldownSec: ARTILLERY.cooldownSec,
        fired: combat.artFired,
        // 발사 수 ≤ 경과/쿨다운 + 1 이어야 한다 (쿨다운이 실제로 걸려 있는지)
        firedMax: Math.floor(simT / ARTILLERY.cooldownSec) + 1,
        inFlight: combat.strikes.length,
        cdLeft: +Math.max(0, combat.artCd).toFixed(2),
        hits: combat.artHits,
        dealt: +combat.artDealt.toFixed(1),
      },
      demolished: combat.demolished,
      // 스크랩 드랍·수집 (DESIGN §7.1 / BALANCE §2). scrap = 수집칸이 실제로 흡수한 양(= 화폐)
      // scrap = 잔액(상점 지출 반영), collected = 누적 회수액. 검산식은 collected를 쓴다
      scrap: +combat.scrap.toFixed(2),
      drops: {
        radius: COLLECT.radius,
        radiusWorld: +(COLLECT.radius * combat.unit).toFixed(1),
        collectors: train.cars.filter((c) => c.kind === "collector").length,
        dropMult: COLLECT.dropMult,
        perWall: TERRAIN.wallScrap,
        // 드랍 수명 (BALANCE §2, 감독 #12 ③). expired = 25초 안에 수집칸이 못 지나간 드랍
        lifeSec: COLLECT.lifeSec,
        // 검산: dropped = Σ(종류별 처치 × §2 드랍값) + demolished×perWall, 그리고
        // **collected + onFieldValue + expired = dropped** (수명 도입으로 항이 하나 늘었다).
        // 적종이 섞이고 분열체가 생겨도 성립하도록 종류별 처치 수로 센다
        dropped: +combat.dropped.toFixed(2),
        // §0.5: 적 드랍은 ×0.2(보스·중간보스 제외) · 성벽은 배율 밖. 누산기에 남은 소수(dropAcc)는 아직
        // 필드로 안 나간 몫이라 빼야 등식이 닫힌다 — 이 항이 없으면 balanceErr가 항상 1 미만으로 뜬다
        expected: +(
          (killScrapByLeg() + combat.demolished * TERRAIN.wallScrap - combat.dropAcc) * COLLECT.dropMult
        ).toFixed(2),
        dropAcc: +combat.dropAcc.toFixed(3),
        collected: +combat.collected.toFixed(2),
        onField: combat.drops.length,
        onFieldValue: +combat.drops.reduce((a, d) => a + d.value, 0).toFixed(2),
        expired: +combat.expired.toFixed(2),
        expiredN: combat.expiredN,
        // 자기 검산: 0이어야 한다 (회수 + 필드 잔류 + 소멸 = 총 드랍)
        balanceErr: +(
          combat.collected + combat.drops.reduce((a, d) => a + d.value, 0) + combat.expired - combat.dropped
        ).toFixed(2),
        // §2 실측 회수율 ~0.85가 수명 도입 후에도 유지되는지 (감독 #12 ③ "회수율 회귀 실측")
        collectRate: +(combat.collected / Math.max(combat.dropped, 1)).toFixed(2),
        // QA A/B 스위치 ?pull의 현재값 (0 = 기본 동작 = 죽은 자리에 그대로 떨어진다).
        // **실측을 정본으로 인용하기 전에 이 값이 0인지 반드시 확인할 것**
        pull: +combat.dropPull.toFixed(1),
        // 미회수 드랍이 어디에 남는가 — 레일에서 먼 것부터 (수집 반경 밖 = 영영 못 줍는 자리)
        maxDistToRail: combat.drops.length
          ? +Math.max(...combat.drops.map((d) => distToLoop(d.x, d.y))).toFixed(1)
          : null,
      },
      over: combat.over,
    };
  })(),
  flow: {
    cell: CELL,
    grid: `${flow.gw}x${flow.gh}`,
    blockedCells: flow.blocked.reduce((a, b) => a + b, 0),
    // 지형 파괴 시 재계산 횟수 (초기 1회 + 파괴마다 1회)
    builds: flowBuilds,
    // 스폰 링 위 128점이 전부 코어까지 도달 가능해야 한다 (막힌 스폰 = 영원히 안 오는 적)
    // ⚠ **iter135에 정의가 갈렸다 — 옛 값과 직접 비교하지 말 것.** 옛 판은 `reachable` 하나만 봐서
    // **「그 점이 지물 «안»이다」와 「그 점에서 코어로 갈 길이 없다」를 한 칸에 합쳐 셌다**.
    // 앞의 것은 막힌 스폰이 아니다 — `flowAt`은 지물 칸에도 **빠져나갈 방향**을 주므로 그 개체는
    // 걸어 나와 그대로 온다(`buildFlow` 말미). 그래서 **진짜 막힌 것(`deadPocket > 0`)만** 여기 세고,
    // 「표본이 지물에 얹힌 것」은 아래 `spawnsOnTerrain`으로 갈랐다(평원 s11 웨이브 60 실측: 옛 1 = 새 0 + 1)
    unreachableSpawns: (() => {
      let n = 0;
      for (let i = 0; i < 128; i++) {
        const p = ringPoint(map, i / 128);
        if (deadPocket(flow, p.x, p.y) > 0) n++;
      }
      return n;
    })(),
    /** 스폰 링 128점 중 **지물 안에 든** 점 수 (막힌 스폰이 아니다 — 위 ⚠ 참조).
     *  0이 아닌 것은 대개 **골렘 잔해**(§8.② · 간격·가장자리 규칙 밖이라 맵 밖에도 선다)다 */
    spawnsOnTerrain: (() => {
      let n = 0;
      for (let i = 0; i < 128; i++) {
        const p = ringPoint(map, i / 128);
        if (deadPocket(flow, p.x, p.y) === -1) n++;
      }
      return n;
    })(),
    // 열차 장벽 판정이 살아 있는지: 레일 위 편성 중앙점은 반드시 막혀야 한다
    barrierOk: trainBlocks(train, at(track, train.s).x, at(track, train.s).y, 0),
  },
  station: {
    // 역사 가장자리~레일 중심선 = 밀착이면 궤간 절반(8) 근처
    railGap: +(distToLoop(map.station.x, map.station.y) - LAYOUT.stationLen / 2).toFixed(1),
    southOfCore: map.station.y > map.cy,
  },
});

export {};
