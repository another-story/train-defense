// 적 스폰·이동. DESIGN §8.0(목표 = 코어뿐, 열차는 이동 장벽) · §5.0(맵 밖 스폰, 접근 5~8초).
// 피격·처치는 combat.ts가 담당한다 — 여기서는 HP를 들고 있기만 한다.

import { BOSS, BOSS_MOVE, BOSS_PATTERNS, COMPANY, coPullValue, pinSlipOn, ENEMY, FACTIONS, FORMATIONS, FORMATION_OF, GATE, HUD, ENEMY_STATS, MAPS, MID, MULT, NECRO, raiseCapValue, enemyHpMult, standoffOf, RENDER, SHIELD, SIEGE, STAGE, VARIANT_KINDS, WAVES, WEAPONS, bossIndex, bossFaceAt, factionAt, factionKind, isBossKind, isBossWave, isEventKind, isEventWave, isMidKind, isMidWave, midIndex, midKindAt, setAirThreat, gateName, slotOffset, type BossPattern, type FactionId, type FormationId } from "./balance";
import { HIT_FLASH, losOk } from "./combat";
import { blocksMovement, flowAt, isWater, type Flow } from "./flow";
import { hideAt, hideKind, mulberry32, slowAt, terrainArt, type GameMap, type Terrain } from "./map";
import { draw, drawActor, drawOutline, drawShadow, undeadName } from "./sprites";
import { ENEMY_MOTION, motionFrame } from "./enemy-motion";
import { MELEE_PRESSURE, LATE_PRESSURE, isApproachMelee, enemySpeedOf } from "./balance";
import { emitAction, type ActionEvent } from "./action-events";
import { getEffectSettings } from "./render-settings";
import { at, carS, trainBlocks, type Train } from "./train";

export type Enemy = {
  kind: string;
  x: number;
  y: number;
  /** 남은 HP (BALANCE §5). 0 이하 = 처치 — combat.ts가 걸러낸다 */
  hp: number;
  /** 스폰 시각(초) */
  bornT: number;
  /** 레일 중심선에 처음 닿은 시각. 접근 시간(§5.0) 실측용 */
  railT: number | null;
  /** 이번 프레임에 열차 장벽에 막혔나 (§8.0 대기·밀집) */
  blocked: boolean;
  /** 한 번이라도 막힌 적이 있나 (장벽이 실제로 작동했는지 QA용 — 막힘은 순간적이라 누적이 필요) */
  everBlocked: boolean;
  /** 이번 프레임의 지형 이속 배율 (§4.1 감속). 1 미만 = 언덕·웅덩이 위 */
  slow: number;
  /** 한 번이라도 감속 지형을 밟았나. slow는 순간값이라 누적이 없으면 QA에서 0만 보인다 */
  everSlowed: boolean;
  atCore: boolean;
  /** 진행 방향 단위벡터(= 정면). 방패 오크의 전면 직사 무효 판정에 쓴다 (§8.②).
   * 멈춘 프레임에도 마지막 방향을 유지한다 — 안 그러면 막힌 적이 정면을 잃는다 */
  faceX: number;
  faceY: number;
  /** 산병이 코어 사거리에 들어 **멈춰 사격 중**인가 (§8.③). 코어 피해는 combat.ts가 준다 */
  firing: boolean;
  /** 이번 프레임에 이속 오라를 받고 있나 (§8.⑧ 워 드러머) */
  buffed: boolean;
  /** 한 번이라도 오라를 받은 적이 있나. buffed는 순간값이라 누적이 없으면 QA에서 0만 보인다 */
  everBuffed: boolean;
  /** 피격 플래시 남은 시간(초). combat.ts의 hit()이 켜고 여기서 깎는다 (감독 #5 V2) */
  flash: number;
  /** HP바 표시 남은 시간(초). 잡몹은 피격 시에만 바가 보인다 (감독 #5 V3) — 엘리트는 이 값과 무관하게 상시.
   * flash(0.06초)와 따로 두는 이유: 플래시는 "맞은 순간"이고 바는 "얼마나 남았나"라 수명이 다르다 */
  hurt: number;
  /** 걷기 바운스의 위상(라디안). 스폰 좌표에서 유도한 고정값 —
   * f.rnd()를 쓰면 난수 스트림이 밀려 스폰 위치가 통째로 바뀌고 지금까지의 probe 실측이 전부 무효가 된다 */
  bobPhase: number;
  /** 경로 레인 (-1~1, 큐 1 ②). 개체별 측면 편향의 부호·세기 — 코어로 가는 접근선을 개체마다
   * 다른 곡률로 만든다. 스폰 좌표에서 유도한 **고정값**이다: f.rnd()를 쓰면 난수 스트림이 밀려
   * 스폰 위치가 통째로 바뀌고 지금까지의 probe 실측이 전부 무효가 된다(bobPhase와 같은 이유) */
  lane: number;
  /** 태어날 때의 웨이브 번호(0-based). 감독 #11 ①로 웨이브가 겹치므로 "지금 화면의 적 중
   * 몇 기가 이전 웨이브의 잔적인가"가 밀도의 직접 지표다 (probe `enemies.overlap`) */
  wave: number;
  /** 스폰 링에서 들어온 개체인가. 분열체(§8.⑦)는 필드 한복판에서 태어나므로 접근 시간 표본에 넣으면
   * "1.2초 만에 레일 도달" 같은 값이 섞여 §5.0 검증이 망가진다 */
  ring: boolean;
  /** **태어난 방위**(라디안 · 맵 중심 기준 `atan2`). §0.7 J1-f ⓒ 검산의 유일한 기준선이다 —
   * 「좌측에 진입 루트가 없어 보인다」를 재려면 **스폰 방위**로 갈라야 하고, 도착 시점의 방위로
   * 가르면 벽을 도느라 방위가 옮겨간 개체가 «옆 사분면»에 적혀 격차 자체가 지워진다.
   * 링 스폰이 아닌 개체(분열체·부활체·수송)도 값은 들어가지만 `ring`으로 걸러서 쓴다 */
  bornA: number;
  /** **부활체인가** (§0.7 K ⓐ~ⓓ). **새 적 종이 아니라 기존 개체에 붙는 플래그다** — 그래서
   * BALANCE §0.7 불변식 4(「적 종은 늘리지 않는다」)가 산다. 이 한 칸이 넷을 동시에 바꾼다:
   * 이속 ×`NECRO.speedMul` · 드랍 0 · **처치 지점 미적립**(같은 시체로 두 번 못 일어난다) ·
   * 셀 이름이 `sprites.ts undeadName()`을 지난다 */
  undead: boolean;
  /** **무적인가** (§0.7 K ① 등장 ~ ② 시전). 지금은 네크로맨서만 쓴다 — `hit()`·`detonate()`가
   * 이 값을 보고 통째로 돌아선다(돔 `domed`와 **같은 자리·같은 규약**이고 갈리는 것은 계열
   * 예외가 없다는 것뿐이다). 서 있는 동안 이동도 멈춘다(§0.7 K "맵 구석에 선다") */
  invuln: boolean;
  /** 성벽 파괴 다음 타격까지 남은 시간(초). `breaker` 적(오우거)만 쓴다 — 피해는 combat.ts가 준다 */
  breakCd: number;
  /** 스폰 시점에 굳은 최대 HP. **`maxHpOf(kind)`로 다시 계산하면 안 된다** — 보스는 주기 강화
   * (BOSS.hpStep)를 타서 같은 종이라도 웨이브마다 값이 다르다. 광폭화·포효 문턱과 HP바의 분모다 */
  maxHp: number;
  /** 이번 프레임에 성벽을 부수는 중인가 (§8 오우거). combat.ts가 세우고 연출·probe가 읽는다 */
  breaking: boolean;
  /** 코어 **점타** 남은 쿨다운(초). `ENEMY_STATS[kind].coreHit`이 있는 적(보스)만 쓴다 —
   * 잡몹의 코어 피해는 연속 DPS라 이 값을 안 본다 (BALANCE §1). combat.ts가 깎는다 */
  coreCd: number;
  /** 지금까지 터뜨린 포효 수 (§8 보스 70%·40%). 다음에 볼 임계의 인덱스이기도 하다 —
   * 임계마다 한 번씩만 터지는 것이 이 값 하나로 보장된다 */
  roars: number;
  /** 광폭화 중인가 (§8 보스 30% 이하). 남은 HP에서 유도되는 **순간값**이라 상태가 아니다 */
  raged: boolean;
  /** 포효 충격파 연출의 남은 시간(초). 판정은 아무것도 이 값을 안 본다 */
  roarFx: number;
  /** **능동 패턴 쿨다운** (§0.6 B3, 패턴별 남은 초). `BOSS_PATTERNS[kind]`와 **같은 순서**다 —
   * 보스가 아니면 빈 배열이라 이 축이 통째로 꺼진다. 스폰 시 쿨을 다 채우고 시작한다
   * (도약·산란과 같은 규약: §5.0 "등장 즉시 교전 금지"의 접근 창을 패턴이 먹으면 안 된다) */
  patCd: number[];
  /** 지금 도는 패턴의 인덱스. -1 = 없음 (예고도 발동도 아닌 평시) */
  patIdx: number;
  /** 지금 국면의 경과(초). `patActing`이 false면 **예고**, true면 **발동**의 경과다 */
  patT: number;
  /** 예고가 끝나고 **발동 중**인가. 즉발 패턴(act 0)은 이 값이 서는 프레임이 없다 */
  patActing: boolean;
  /** 이번 패턴의 조준점(월드) — 돌진의 진행 방향 끝점 · 투척의 착탄 지대 · 분쇄의 중심.
   * **예고 시작 프레임에 굳는다**: 예고가 가리킨 곳과 실제로 일어나는 곳이 달라지면 예고가 거짓말이 된다 */
  patAim: { x: number; y: number } | null;
  /** **이속 배수의 현재값** (§0.6 B4 "등속 직선 금지"). 목표값(정지 0 · 평시 1 · 돌진 speed)을
   * `BOSS_MOVE.ease`로 따라간다 — 이것이 가·감속이다. 보스가 아니면 항상 1이라 잡몹은 안 탄다 */
  vEase: number;
  /** **등장 이펙트를 이미 터뜨렸나** (§0.6 B5). 보스는 맵 **밖**(distU 3.4대)에서 태어나므로
   * 스폰 프레임에 링을 그려도 화면 밖이라 아무도 못 본다 — 「맵 안에 처음 들어선 프레임」이
   * 화면에서의 등장이고, 이 값이 그 한 번을 보장한다 */
  entered: boolean;
  /** **바라보는 각도**(라디안, 연출 전용). 진행 방향을 `BOSS_MOVE.turn`으로 따라가 방향 전환이
   * 한 프레임에 튀지 않게 한다. 보스만 쓴다 — 잡몹은 `faceX`의 부호(좌우 플립)면 충분하다 */
  faceAng: number;
  /** 물 위를 한 번이라도 지났나 (§8.④). onWater는 순간값이라 누적이 없으면 QA에서 0만 보인다 */
  everSwam: boolean;
  /** **도약 쿨다운**(초, §8.④ 독개구리). 0이 되는 프레임에 목표 웅덩이를 찾는다 */
  leapCd: number;
  /** **도약 목표**(월드) — null이면 걷는 중이다. 도약 중에는 플로우필드 대신 이 점을 향한다 */
  leapTo: { x: number; y: number } | null;
  /** 도약 경과 시간(초). 열차·성벽에 막혀 목표에 못 닿는 개체를 풀어 주는 안전장치의 분모다 */
  leapT: number;
  /** **남은 수송 화물 수** (§8.④ 상륙정). 레일에 닿는 순간 한 번에 방출되고 0이 된다 —
   * 그 전에 격침되면 화물째 사라진다(= "수송 중 요격이 이득") */
  cargo: number;
  /** 이번 프레임에 **붙잡고 있는 칸의 위치** (§8.④ 심연 촉수). **순수 연출**이다 —
   * 감속 판정은 `Train.slow`가 지고, 여기는 촉수와 칸을 잇는 선을 그리기 위한 좌표일 뿐이다 */
  grabbing: { x: number; y: number } | null;
  /** 이번 프레임에 **앉아 있는 칸의 인덱스** (§8.⑤ 가고일). `grabbing`과 같은 규약이다 —
   * 정지 판정은 `Train.stunned`(순간값 집합)가 지고, 여기는 연출 좌표와 「앉았다」의 표시용이다.
   * null = 아직 나는 중. 앉은 동안 이 적은 그 칸을 따라 움직인다(칸 위에 올라탄 것이 화면에 읽힌다) */
  perched: number | null;
  /** 이번 프레임에 **자폭했나** (§8.⑤ 폭격 박쥐). combat.ts의 코어 피해 루프가 세우고 같은 프레임에
   * 리스트에서 뺀다 — «처치»가 아니라 «소진»이라 드랍도 처치 수도 붙지 않는다(그것이 이 플래그의 뜻이다) */
  boomed: boolean;
  /** 열차 장벽을 한 번이라도 **넘었나** (§8.⑤ 공중). 순간값이 아니라 누적 표본용 —
   * probe `enemies.air.crossed`가 0이면 공중 문법 ③이 안 도는 것이다 */
  everCrossed: boolean;
  /** **설치 후 이탈 중인가** (§8.⑥ 폭파공작원). 폭탄을 낳은 프레임에 서고, 그 뒤로는 코어의
   * **반대 방향**으로 걷는다 — 코어를 붙잡지 않으므로 `atCore`도 `firing`도 서지 않는다
   * (= 코어 피해 경로를 아예 안 탄다: 이 적의 피해는 전부 폭탄이 진다).
   * 스폰 링 밖으로 나가면 드랍도 처치 수도 없이 사라진다(폭격 박쥐의 「소진」과 같은 규약) */
  fleeing: boolean;
  /** **남은 도화선**(초, §8.⑥ 설치된 폭탄). 0이 되는 프레임에 코어를 한 번 치고 사라진다 —
   * 그 전에 사격으로 HP를 지우거나 클릭으로 해체하면 아무 일도 일어나지 않는다 */
  fuseT: number;
  /** **남은 재기동 수** (§8.① 해골 보병). 스폰 시점에 «좌표에서 유도한 고정 난수 < chance»면 1,
   * 아니면 0이다 — 사망 프레임에 `f.rnd()`를 뽑으면 스폰 좌표 스트림이 밀려 지금까지의 실측이
   * 전부 무효가 된다(`lane`·`bobPhase`와 같은 이유). 1이면 처치가 한 번 취소된다 */
  revives: number;
  /** **남은 회복 총량** (§8.② 트롤). 스폰 시 `hp × regen.pool`로 굳고 회복한 만큼 줄어든다 —
   * 이 값이 있어야 `effHp`가 트롤을 유한하게 셀 수 있다(§6 예산 구멍 방지). 0이면 더 안 찬다 */
  regenPool: number;
  /** **재생 정지 남은 시간**(초, §8.② 트롤). 화염 계열 피해를 맞은 프레임마다 `regen.blockSec`로
   * 다시 채워진다(combat.ts hit) — 화염 지대 아래에서는 0으로 안 내려간다 */
  regenBlock: number;
  /** **재배치 중인가** (§8.③ 머스킷 도적). 참이면 `standoff` 정지 판정을 건너뛰고 코어 둘레의
   * **접선 방향**으로 걷는다 — 코어까지의 거리가 안 바뀌므로 레일에 닿지 않는다(BALANCE §1) */
  repositioning: boolean;
  /** 지금 국면(사격 또는 재배치)의 경과 시간(초). `reposition`을 든 적만 쓴다 */
  repoT: number;
  /** 한 번이라도 `standoff`에 멈춰 쏜 적이 있나. **`engageLog`가 이 값을 본다** —
   * 재배치 적은 쏘고 걷기를 되풀이하므로 매번 담으면 BALANCE §1 "산병 교전 개시 3~7초"의
   * 표본이 «두 번째 이후의 교전»으로 오염된다. 개시는 런에 한 번이다 */
  everFired: boolean;
  /** 이번 프레임에 **은신 중인가** (§8.③ 그림자 암살자). `blocked`·`slow`와 같은 순간값이고,
   * combat.ts의 **표적 선택**이 이 값을 본다 — 광역 여파·조준 포격·관측칸은 안 본다 */
  hidden: boolean;
  /** **다음 산란·재소환까지 남은 시간**(초, §8.⑦ 슬라임 퀸 · 네크로맨서). 두 문법이 **같은 칸을
   * 쓴다** — 한 종이 둘을 함께 들지 않으므로 칸을 가르면 언제나 한쪽이 0으로 놀고, 그러면
   * «어느 칸이 이 개체의 것인가»를 읽는 쪽이 매번 종을 다시 물어야 한다 */
  breedCd: number;
  /** 지금까지 낳은 수 (산란 또는 재소환). `spawner.cap`·`raise.cap`의 분자이고,
   * **`effHp`가 예산으로 세어 둔 값의 실측 대응물**이다 (§6) */
  bred: number;
  /** 맞은 **발수**. 피해량이 아니라 발수라는 것이 §8.⑦ 포자 트렌트의 정체이고, **§0.7 H1의
   * 판정 기준(「웨이브 40+에서 잡몹 2~5발」)이 재는 것도 이 값이다** — 처치 프레임에
   * `Combat.ttk`로 넘어간다(combat.ts). 화염 지대의 매 프레임 틱은 여기 안 쌓인다
   * (combat.ts hit의 `tick` 인자) — 60틱/s라 세면 「발수」가 「초」가 된다 */
  hits: number;
  /** 그중 **치명타로 맞은 발수** · **마지막으로 때린 무기 종류**. 둘 다 **probe 전용**이고
   * (§0.7-B 불변식 6 「평타 한 방 금지」) 판정·연출은 안 읽는다 — 「비치명타 한 방 처치」는
   * `hits === 1 && critHits === 0`이라야 하고, 예외 무기 셋(`ONE_SHOT_OK`)을 가르려면
   * 그 한 발이 **어느 무기였나**가 함께 있어야 한다(combat.ts 처치 루프) */
  critHits: number;
  hitKind: string;
  /** **그 마지막 한 발이 «직사 계열의 단일 표적 타격»이었나** (BALANCE §0.7-H · INBOX #76 ①).
   * 불변식 6의 분모가 재정의되면서 생긴 칸이다 — `hitKind`만으로는 못 가르는 것이 둘 있다:
   * ⓐ 같은 무기칸이 «주 표적»과 «착탄 광역»을 함께 내는 경우(함포·플랙 `hitSplash`)
   * ⓑ 같은 계열 이름 아래 단일과 다표적이 섞이는 경우(관통 = 일직선 전부 타격).
   * 참인 것은 **`hit()`의 `cls === "direct"`이면서 그 발이 한 표적만 겨눈 경우**뿐이고
   * 곡사 착탄(`arc`)·연쇄(`chain`)·화염(`flame`)·지속 틱은 전부 거짓이다(combat.ts `hitDirect`) */
  hitDsg: boolean;
  /** 지금까지 방출한 포자 새끼 수 (`spore.cap`의 분자) */
  spores: number;
  /** **남은 회복 총량**(§8.⑧ 오크 주술사) / **남은 방벽 총량**(배너 로드). 트롤의 `regenPool`과
   * 같은 규약인데 **쓰는 대상이 남**이라는 점만 다르다 — 스폰 시 `heal.pool`·`banner.pool`로 굳고
   * 써 준 만큼 줄어든다. 두 문법이 **같은 칸을 쓴다**: 한 종이 둘을 함께 들지 않으므로 칸을 가르면
   * 언제나 한쪽이 0으로 논다(`breedCd`가 산란·재소환을 같이 쓰는 것과 같은 이유) */
  aidPool: number;
  /** 이번 프레임에 **돔 안인가** (§8.⑧ 실드 짐꾼). `hidden`·`blocked`와 같은 순간값이고,
   * combat.ts의 **표적 선택과 `hit()`**이 함께 본다 — 곡사와 조준 포격만 이 값을 무시한다 */
  domed: boolean;
  /** 이번 프레임에 이 개체를 덮고 있는 **배너 로드**(§8.⑧) — 없으면 null. 참조를 드는 이유는
   * 「깎아 준 몫을 그 깃발의 `aidPool`에서 뺀다」가 성립해야 해서다(집합으로는 누구의 몫인지 모른다).
   * 순간값이라 매 프레임 다시 세운다 = 깃발이 죽으면 그 프레임에 풀린다 */
  wardBy: Enemy | null;
  /** **광폭화 남은 시간**(초)과 그때의 이속 배수 (§8.⑧ 배너 로드 사망 시). 보스의 `raged`(HP 트리거,
   * 안 꺼진다)와 달리 **시한부**라 값을 함께 들어야 한다 — 원인(깃발)이 이미 죽어 스탯을 못 묻는다 */
  rageT: number;
  rageMul: number;
  /** **다음 연막까지 남은 시간**(초, §8.⑧ 연막차). 지대를 까는 것은 combat.ts다(지대 목록이 거기 있다) */
  smokeCd: number;
  /** **소속 부대의 id** (§0.6 C1). -1 = 무소속 = 지금까지처럼 흩어져 오는 개체다.
   * 부대가 전멸하면 그 프레임에 -1로 돌아간다(빈 id를 들고 다니면 슬롯 좌표가 유령을 가리킨다) */
  co: number;
  /** **직전 프레임에 차단 지형이 이 개체를 되돌렸는가** (STATUS 표 29 · 갈래 ⓐ 「탈출 성분 우선」).
   * 서 있으면 그 프레임의 **슬롯 복귀 성분을 0으로 둔다** = 순수 플로우필드로 걷는다.
   * 「슬롯 위에서는 복귀가 0이라 부대원도 지형 우회를 잃지 않는다」는 아래 슬롯 복귀 주석의 문면을
   * **지물 표면에도** 그대로 적용한 것이다 — 복귀력(`COMPANY.pull` 2.4)이 플로우 성분(단위벡터)을
   * 항상 이겨서 낙오병이 지물 안으로 걸어 들어가고 밀어내기가 매 프레임 되돌리는 **고정점**을 없앤다.
   * 플래그로 드는 이유: 밀어내기가 개체를 정확히 `t.r + radius`에 세우므로 「표면에 있다」를
   * 거리로 재려면 여유 상수가 하나 필요한데, **실제로 되돌려졌는가**는 그 상수 없이 정확하다.
   * 규약의 선례는 **앵커의 `pinnedByUnbreakable`**이다(§0.6 C5 ⓑ) — 지물에 눌린 프레임만
   * 플로우필드로 되돌아간다는 같은 문면을 개체 층에 얹은 것이다 */
  pinned: boolean;
  /** 대형에서 이 개체의 **슬롯 번호**(0 = 최전방). 부대의 정원(`Company.n`)에 대한 인덱스라
   * **개체가 죽어도 남은 개체의 슬롯은 안 바뀐다** — 대형이 오그라들지 않는 것이 이 규약의 뜻이다 */
  slot: number;
  /** **지휘 유닛인가** (§0.6 C1 "부대 = 지휘 유닛 1 + 병종 조합 N"). 부대마다 정확히 1기다.
   * 지금은 표식이지 효과가 아니다 — 「처치 시 대형 붕괴」는 C4의 몫이다 */
  cmdr: boolean;
  /** **남은 전면 실드 총량**(§0.6 C3 ⓑ "실드는 유한하다"). `frontShield`를 든 종만 0보다 크게
   * 태어나고(= `maxHp * SHIELD.pool`), 정면에서 온 **직사** 피해를 대신 받아 준다. 0이 되면
   * 그 개체의 전열이 **영영** 열린다 — 회복은 없다(트롤 `regenPool`과 같은 「평생 총량」 규약).
   * **표적 선정은 이 값을 안 본다** — 실드가 살아 있어도 방패병 자신은 표적이다(그래야 닳는다).
   * 가리는 것은 **뒤에 선 남**이다(`Field.guards`) */
  shield: number;
  /** 실드가 **깨진 순간의 연출** 남은 시간(초). 판정에는 안 쓴다 — `flash`와 같은 순수 표시값 */
  shieldT: number;
};

/** **부대** (DESIGN §0.6 C1). 개체가 아니라 **부대가 걷는다** — 앵커(대열 중심)가 플로우필드를
 * 따라 한 덩어리로 전진하고, 개체는 자기 슬롯을 향해 붙는다(`COMPANY.pull`).
 * 부대는 적을 새로 만들지 않는다: 웨이브 예산이 낸 편성 목록을 담는 **그릇**일 뿐이다 */
export type Company = {
  id: number;
  form: FormationId;
  /** **정원**(슬롯 수) — 생존 수가 아니다. 죽어도 안 줄어들어야 대형이 안 오그라든다 */
  n: number;
  /** 앵커(대열 중심)의 월드 좌표 */
  x: number;
  y: number;
  /** 앵커가 바라보는 각(rad). 대형 로컬 좌표를 이 각으로 돌려 슬롯의 월드 좌표를 만든다.
   * 선회는 `COMPANY.turn`으로 제한한다 — 한 프레임에 홱 돌면 대형 전체가 그만큼 휘둘린다 */
  ang: number;
  /** 부대 이동 속도 배율 = 구성원 중 **가장 느린** 종의 배율 (§0.6 C1 "함께 이동") */
  speed: number;
  /** 살아 있는 인원. 매 프레임 다시 세고 0이면 부대가 사라진다 */
  alive: number;
  /** **대형 붕괴의 남은 산개 시간**(초, §0.6 C4). 0 = 건재. 지휘 유닛이 죽는 프레임에 `COMPANY.breakSec`이
   * 서고, 0으로 내려가면 부대가 **해산**한다(다시 뭉치지 않는다 — 심장이 돌아오지 않기 때문이다).
   * 붕괴 중에는 ⓐ 앵커가 멈추고 ⓑ 슬롯 복귀 대신 **산개**가 걸리고 ⓒ 이속이 `brokenSpeed`배가 되고
   * ⓓ 구성원이 주는 **버프가 전부 꺼진다** */
  broken: number;
  /** **지금 돌파 중인 성벽** (§0.6 C5 · 공성 종대만 채워진다). null = 앞이 트였다 = 앵커가 걷는다.
   * 값이 있으면 앵커가 **그 자리에 선다** — 피해는 combat.ts의 `siegeWalls`가 준다(오우거 `breaker`와
   * 같은 분업: 이동은 여기서, 지형 피해는 스크랩 드랍·플로우필드 재계산을 든 쪽에서) */
  ram: Terrain | null;
  /** 다음 타격까지 남은 쿨(초). `Enemy.breakCd`와 같은 규약이고 combat.ts가 센다 */
  ramCd: number;
};

/** 웨이브 편성을 **투입 단위**로 쪼갠 것 (§0.6 C6 일반 웨이브 = 부대 단위 시차 투입).
 * `form`이 null이면 무소속 무리 = 지금까지의 `spawnBurst` 그대로다 */
type PlanGroup = {
  form: FormationId | null;
  kinds: string[];
  /** 스폰 창 안의 투입 시점 (0~1). 실제 초는 창 길이를 곱해 얻는다 —
   * 창 길이는 `waveQa`로 갈릴 수 있어 startWave 시점에는 확정이 아니다 */
  at: number;
  /** 관문 대열에서의 **자리**(`i`번째 / 전체 `n`갈래). 전면 정렬 진군(§0.6 C6)에서만 채워진다 —
   * 일반 웨이브는 `undefined`이고 스케줄러의 황금비 도약이 자리를 정한다(= 사방에서 조금씩).
   * **각이 아니라 자리로 든다** — 링 반경이 방향마다 달라 각→월드 폭이 1.6배까지 갈리므로,
   * 실제 각은 `map`을 아는 스폰 시점에 `gateLaneU()`가 낸다 */
  lane?: { i: number; n: number };
  /** 앵커를 링 **바깥으로** 물린 거리(월드). 관문 대열의 **후열**(궁병 열·지원 후미)이 전열
   * 뒤에 서는 값이다 — `FORMATIONS[].back`이 대형 «안»의 물러섬이라면 이쪽은 대열 «사이»다 */
  back?: number;
};

/** 사망 잔상 (감독 #5 V3 "사망 페이드 1s"). 판정에서 이미 빠진 **순수 연출**이라
 * 어떤 로직도 이 목록을 읽지 않는다 — f.list에 남겨 두면 타겟팅·통계·드랍이 전부 오염된다 */
export type Corpse = { sprite: string; x: number; y: number; h: number; flip: boolean; t: number };

export type Field = {
  list: Enemy[];
  corpses: Corpse[];
  spawned: number;
  /** **런 절대 경과 시간(초)** — 웨이브가 바뀌어도 리셋하지 않는다. 감독 #11 ①로 웨이브가 겹치게 되면서
   * 웨이브 리셋 시간을 쓰면 이전 웨이브에서 살아남은 적의 `bornT`가 미래가 돼 접근 시간 표본이 깨진다 */
  t: number;
  /** 현재 웨이브의 경과 시간(초). 스폰 스케줄과 웨이브 타이머만 이 값을 본다 */
  waveT: number;
  waveIdx: number;
  /** 좀비 기준 속도 (월드/초) = BALANCE §1 등재값 */
  baseSpeed: number;
  /** 스폰 링→레일 대표 거리 + 링 전체의 분포 (접근 시간 편차의 원인 — probe 참고용) */
  approachDist: number;
  distMin: number;
  distMax: number;
  /** 레일에 닿은 적의 접근 시간(초) 누적 로그. 적은 처치되면 리스트에서 사라지므로
   * 생존자만 세면 "빨리 도착한 적"으로 표본이 편향된다 (§5.0 검증용).
   * **이속 배율을 함께 담는다** (감독 #19 ③): §1의 "중앙값 ~7.3초 · 방향별 4~9초"는 **이속 1.0 잡몹**
   * 기준값이고, 저속 개체(오우거 0.6·보스 0.45·슬라임 0.9)는 배율만큼 길어지는 것이 정상이다 —
   * 한 표본에 섞으면 보스만 있는 컷의 중앙값이 14.2로 찍혀 "§1 위반"으로 오독된다 */
  approachLog: { sec: number; speed: number; a: number }[];
  /** **맵 중심** (§0.7 J1-f). 방위 계산에만 쓴다 — Field가 map을 안 들어서 이 두 값만 복사한다 */
  cx: number;
  cy: number;
  /** 링 스폰 **방위별 누적 투입 수** — 8분원 8칸 · 4사분면 4칸.
   * `approachLog`의 방위별 수가 «레일까지 온 수»이고 이것이 «내보낸 수»라, 둘의 비가 곧
   * §0.7 J1-f ⓒ의 「통행량」이다. 한 방위만 도달률이 낮으면 그 방위가 막힌 것이다 */
  spawnOct: number[];
  spawnQuad: number[];
  /** **방위별 적-초 누적**(8분원). 매 프레임 살아 있는 개체를 «지금 있는 방위»에 dt만큼 적립한다.
   * `approachLog`가 「레일까지 온 개체」만 세는 것과 달리 이 칸은 **죽은 개체가 살아 있던 시간까지**
   * 담으므로 표본이 수천 배 크다 — §0.7 J1-f ⓒ의 「통행량」은 이 칸으로 판정한다.
   * 사용자가 본 것도 「왼쪽에 적이 «안 보인다»」이지 「왼쪽 적이 레일에 못 닿는다」가 아니다 */
  octSec: number[];
  /** 감속 지형을 밟은 적의 누적 수 + 최저 배율 (처치되면 리스트에서 사라지므로 Field가 들고 있어야 한다) */
  slowedEver: number;
  slowMinEver: number;
  /** **감속 지형 위에서 보낸 적-초 누적** (§4.1 "통과하되 감속"의 유일한 «양» 눈금).
   * `slowedEver`는 머릿수라 「한 번 스쳤다」와 「내내 밟고 걸었다」가 같은 1로 세어진다 —
   * 도시 회귀(iter132)를 가른 것이 정확히 그 차이다: 갈래에 감속을 붙여도(`rubble` 0.55)
   * 그 지물이 **진로 밖**이면 이 칸이 안 오른다. `octSec` 합으로 나누면 「전 적-초 중 감속 몫」이다 */
  slowSec: number;
  /** 이속 오라를 한 번이라도 받은 적의 누적 수 (§8.⑧ QA용 — 순간값만 보면 0만 보인다) */
  buffedEver: number;
  /** 산병이 스폰→사격 개시까지 걸린 시간(초) 누적. 산병은 레일에 닿지 않아 approachLog가 비므로
   * §5.0 "등장 즉시 교전 금지 · 접근 4~9초"를 검증하려면 이 표본이 필요하다 */
  engageLog: number[];
  /** 이번 웨이브에 나올 적종을 **스폰 순서대로** 편 목록 (큐 1). 길이 = 이 웨이브의 개체 수다 —
   * WAVES의 `budget`은 실효 HP 예산이지 개체 수가 아니라서, 개체 수는 여기서만 알 수 있다 */
  roster: string[];
  /** 이번 웨이브의 **투입 계획** (§0.6 C1·C6) — 편성 목록(`roster`)을 부대와 무리로 나눠 담은 것.
   * 개체 총수도 종별 수도 `roster`와 **정확히 같다**(예산·조성 불변) — 갈리는 것은 «함께 오는 모양»뿐이다 */
  plan: PlanGroup[];
  /** 다음에 내보낼 계획 인덱스. `spawned`(개체 진행도)와 달리 **그릇 진행도**다 */
  planAt: number;
  /** **이번 웨이브가 관문이면 대열의 중심 각**(링 위 u), 아니면 null (§0.6 C6).
   * 「관문인가」의 판정과 「대열이 어디에 섰는가」를 한 칸으로 든다 — 보스·중간보스가 **그 중앙에**
   * 서는 좌표도 여기서 나온다. 웨이브마다 `startWave`가 다시 정한다 */
  gateU: number | null;
  /** 지금 필드에 있는 부대들 (§0.6 C1). 전멸한 부대는 그 프레임에 빠진다 */
  companies: Company[];
  /** 부대 id 발번기. 인덱스를 쓰면 부대가 빠질 때 남은 개체의 `co`가 조용히 다른 부대를 가리킨다 */
  coSeq: number;
  /** 이 런에서 **대형이 붕괴한 횟수** (§0.6 C4) = 지휘 유닛을 잡아낸 횟수. 전멸한 부대는 안 센다 —
   * 그 부대는 붕괴 판정보다 **먼저** 목록에서 빠지므로, 이 값은 「심장을 겨눠 무너뜨린 부대」만 센다 */
  coBroken: number;
  /** **대형별로 만들어진 부대 수** (§0.6 C5 검산). 「C5가 화면에 안 선다」의 원인이 «돌파 미구현»인지
   * «공성 종대가 애초에 안 만들어진다»인지를 가르는 유일한 수치다 — 후자면 그것은 C의 결함이 아니라
   * 조성 정본(§6 mix)의 결함이다(STATUS 미결 질문 iter84 ②와 같은 자리) */
  coForms: Record<string, number>;
  /** **우회 누적**(§0.6 C5 ⓐ). 공성 종대가 아닌 부대 앵커의 «코어 직선에서 벗어난 각»을 매 프레임 쌓는다.
   * 순간값은 컷 운을 타므로(풀런 끝 프레임에는 부대가 0개다) 누적이 아니면 「우회했다」를 못 센다.
   * `detourHits` = 그중 20°를 넘긴 프레임 수 = 「실제로 돌아 걷고 있던」 표본 */
  detourSum: number;
  detourN: number;
  detourHits: number;
  /** 붕괴 시점의 **생존율 합**(`alive / n`). `coBroken`으로 나누면 「대형이 얼마나 멀쩡할 때 무너졌는가」다.
   * **C4가 장식인지 판단 축인지를 가르는 유일한 수치다** — 0.1이면 이미 다 죽은 뒤에 심장이 죽은 것이고,
   * 0.5면 온전한 부대가 실제로 무너진 것이다(횟수만으로는 둘이 구분되지 않는다) */
  coBrokenAlive: number;
  /** **이번 프레임의 실드 전열** (§0.6 C3) = 살아 있고 실드가 남은 방패병 전부. 오라·돔과 같은
   * 「가리는 쪽의 순간 목록」 규약이고, combat.ts의 표적 선정·직사 피해가 이 목록만 본다.
   * **부대를 안 본다** — 방패는 「자기 부대원」이 아니라 「자기 뒤에 선 것」을 가린다(§0.6 C2의
   * 「궁병 열 = 방진 뒤 정렬, 전열을 깨야 사거리가 닿는다」가 두 부대에 걸쳐 성립해야 한다) */
  guards: Enemy[];
  /** 이 런에서 태어난 **방패병 수**(`frontShield`를 든 종). `shieldBreaks`의 분모다 */
  guardsMade: number;
  /** 실드가 **깨진 채로 살아 있던 누적 개체·초** (§0.6 C3 ⓑ). 파괴 «횟수»만으로는 실드가 판단 축인지
   * 장식인지 안 갈린다 — 깨지자마자 죽으면 「열린 열」이 실제로는 없었던 것이다.
   * `shieldBreaks`(combat)로 나누면 「전열이 열린 채 싸운 평균 시간」이 된다 */
  shieldOpenSec: number;
  /** 스테이지 경계의 남은 대기 시간(초) = 열차가 역으로 굴러 들어가는 연출 여유.
   * 0이 되면 `station`이 열린다 (스폰은 그동안 멈추지만 전투는 계속된다) */
  gap: number;
  /** **정차 중인가** (DESIGN §3 "정차 중에는 시간 정지 — 출발 버튼을 눌러야 다음 스테이지 시작").
   * true인 동안 main.ts가 시뮬 자체를 멈추고 상점을 연다. 해제는 상점의 「출발」(depart) 하나뿐이라
   * updateField는 이 값을 내리지 않는다 — 여기서 자동으로 풀면 "시간 정지"가 성립하지 않는다 */
  station: boolean;
  /** **선택 카드가 열려 있나** (DESIGN §7.2 · BALANCE §7). 자리는 **스테이지당 3회**다 (감독 #35 ①,
   * §7 갱신) — 스테이지 안의 웨이브 전환 2회 + **스테이지의 마지막 웨이브 뒤 = 정차 직전 1회**.
   * 정차와 같이 **시간 정지**다 — true인 동안 main.ts가 update를 통째로 건너뛴다.
   * 해제는 카드 선택(`pickedCard`) 하나뿐이고 updateField는 이 값을 내리지 않는다 */
  card: boolean;
  /** 지금 열려 있는 카드가 **정차 직전 카드**인가 (= 고른 뒤 다음 웨이브가 아니라 상점이 온다).
   * 3번째 자리를 「정차 **직전**」으로 잡은 이유: 카드가 주는 무기 칸은 **무료**라 상점의 예산 계산에
   * 들어가야 한다 — 정차 뒤로 밀면 그 스테이지의 구매 결정이 카드를 모르는 채로 내려진다.
   * (스테이지 1도 같은 자리를 받는다 — 「출발 뒤」로 잡으면 첫 스테이지만 2회가 된다) */
  cardToStation: boolean;
  /** **T3 진화 분기 화면이 열려 있나** (DESIGN §7.4 · cards.ts rollBranch). 카드·정차와 같은
   * **시간 정지**이지만 §7의 카드 자리가 아니다 — 칸이 T3에 닿으면 그 자리에서 열리고 고르면 닫힌다.
   * 열고 닫는 것은 main.ts뿐이고(편성에서 유도한다 — train.ts pendingBranch) updateField는 안 건드린다 */
  branch: boolean;
  /** **열차 교리 화면이 열려 있나** (DESIGN §D1 ⓐ · cards.ts rollDoctrine). `branch`와 **같은 규약**이다 —
   * 시간 정지이고 §7의 카드 자리가 아니며, 열고 닫는 것은 main.ts뿐이다(고른 교리 수와 편성에서
   * 유도한다 — main.ts `pendingDoctrine`) */
  doctrine: boolean;
  /** QA `?stop=N` 전용 — 스테이지 **안**에 낀 정차를 「출발」한 뒤 카드를 열어야 하나.
   * 기본 런에서는 항상 false다(스테이지 안의 전환에는 정차가 없다) */
  cardAfter: boolean;
  /** 마지막 웨이브까지 끝났나 = **맵 클리어** (DESIGN §3: 스테이지의 마지막 웨이브는 전멸이 조건이라
   * 이 값이 서려면 보스가 죽어 있어야 한다). main.ts가 클리어 화면을 띄운다 */
  cleared: boolean;
  /** 이번 웨이브에 **맵 보스**를 아직 안 내보냈나 (DESIGN §3 "웨이브 9 = 맵 보스").
   * 보스는 편성 예산 밖이라 roster에 없다 — startWave가 세우고 첫 스폰 프레임이 내린다 */
  bossPending: boolean;
  /** 이번 웨이브에 **중간보스**를 아직 안 내보냈나 (DESIGN §3 신표 "중간보스 = 매 스테이지 마지막 웨이브").
   * `bossPending`과 **완전히 같은 규약**이다 — roster 밖 1기, 스폰 창이 닫힌 뒤 등장, 전멸 조건에 걸린다.
   * 3n 중 6n은 보스가 가져가므로 두 값이 동시에 서는 웨이브는 없다 */
  midPending: boolean;
  /** 이번 웨이브에 **이벤트 보스**(네크로맨서)를 아직 안 내보냈나 (§0.7 K).
   * `bossPending`·`midPending`과 **같은 규약**이다 — roster 밖 1기, 전멸 조건에 걸린다.
   * 자리(20·40)가 3n·6n과 안 겹치므로 셋이 동시에 서는 웨이브는 없다 */
  eventPending: boolean;
  /** **이번 웨이브가 이벤트 관문인가** — `eventPending`은 시전자가 나오는 프레임에 false가 되므로
   * 「웨이브 내내 참인 칸」이 따로 필요하다. `?event=0`을 **함께** 실어야 combat.ts의 무덤 천장이
   * A/B 대조군에서 안 열린다(그 컷은 「여느 보스 웨이브」라 무덤도 여느 웨이브의 것이어야 한다) */
  eventWave: boolean;
  /** 보스가 **교전 위치에 멈춘** 절대 시각(초). 아직이면 null (DESIGN §6 "루프 반경 0.5 정지 점타").
   * 감독 #17 ⓐ의 목표 "경제 가용 편성이 15~20초에 클리어"는 **보스전 길이**의 기준이라
   * 런 시작부터의 runT로는 못 잰다 — 접근(이속 0.45라 14초대)이 섞이기 때문이다 */
  bossEngageT: number | null;
  /** 보스가 **레일 중심선을 넘은** 지점과 그 뒤 경과 시간(초). 아직이면 null (큐 1).
   * **순수 연출이다** — 판정은 아무것도 이 값을 안 보고, 레일·열차는 부서지지 않는다(§8.0).
   * 필드에 두는 이유: 보스는 계속 안쪽으로 걸어 들어가는데 연출은 **넘은 자리**에 남아야 한다 */
  breach: { x: number; y: number; ang: number; t: number } | null;
  /** 보스 포효로 **소환된** 개체의 누적 수 (§8). f.spawned(웨이브 스폰 진행도)에는 안 잡힌다 —
   * 분열체와 같은 부류다 */
  summoned: number;
  /** **패턴 발동 누적**(§0.6 B3, 패턴 id별). probe `boss.patterns`가 그대로 읽는다 —
   * 「패턴이 실제로 돌았는가」는 컷 한 장으로는 못 세고 이 카운터로만 기계 검산이 된다 */
  patFired: Record<string, number>;
  /** **지형 분쇄의 미결 요청**(§0.6 B3 크롤러) — 이 원 안의 파괴 가능 지형을 combat.ts가 그 프레임에
   * 밀고 플로우필드를 다시 굽는다. 지형을 만지는 곳이 combat 한 곳뿐이라는 규약(§4.2)을 지키는 우편함이다 */
  quakeAt: { x: number; y: number; r: number } | null;
  /** **바위 투척의 미결 코어 피해**(§0.6 B3 크롤러). enemy.ts가 쌓고 combat.ts가 그 프레임에
   * 비우며 **보스 장부**(coreDmgBoss)로 넣는다 — 코어 HP는 combat.ts 한 곳만 만진다는 규약을
   * 깨지 않기 위한 우편함이다(점타가 combat에 있는 것과 같은 이유) */
  rockPending: number;
  /** **칸별 정지 남은 시간**(초, 인덱스 = 칸 번호). 돌진에 부딪힌 칸이 «일시» 정지한다(§0.6 B3).
   * `Train.stunned`(순간값 집합)는 매 프레임 비워지므로 지속을 여기가 들고, 매 프레임 다시 담는다 —
   * §8.0의 「원인 처치 시 즉시 해제」와 충돌하지 않는다: 원인은 «지나간 돌진»이지 «살아 있는 적»이 아니다 */
  carStun: number[];
  /** **관문 배너**(§0.6 B5) — 웨이브 개시에 한 번 서고 `HUD.banner.sec` 뒤에 사라진다.
   * `boss`가 false면 중간보스(격을 낮춘 같은 문법). 순수 연출이라 판정은 아무것도 안 본다 */
  banner: { name: string; boss: boolean; t: number; label?: string; ink?: string } | null;
  /** 이번 웨이브의 **진영** (§0.6 D). 스테이지에서 유도한 값을 웨이브 개시에 한 번 굳힌다 —
   * HUD·probe가 같은 값을 봐야 「화면에 뜬 진영」과 「실제로 스폰된 조성」이 어긋나지 않는다 */
  faction: FactionId;
  /** **적종 → 그 종이 런에서 처음 선 웨이브(1-based)** (감독 #72 ④ · iter145).
   * 「67종을 12스테이지로 압축 · **해금이 빨라지는 것이 이 항목의 이득**」의 유일한 기계 눈금이다 —
   * 진영 교대 주기를 옮기면 «몇 종이 서는가»와 «언제 서는가»가 함께 갈리는데, 컷 한 장으로도
   * 웨이브 로그로도 그 둘을 못 센다. 분열체·부활체·수송 화물도 그대로 들어간다(그것도 해금이다).
   * probe `faction.unlock`이 이 표를 그대로 읽는다 */
  kindFirstWave: Record<string, number>;
  /** 동시 필드 상한(§0.5 400)에 스폰이 밀린 **프레임 수** — 0이 아니면 §6 예산이 뒤로 밀렸다는 뜻이다.
   * 물량 ×5가 상한을 실제로 건드리는지 보는 지표라 probe에 그대로 나간다 */
  capHits: number;
  /** 런 전체에서 관측한 동시 생존 최대치. 감독 #5 V4 "전투 밀도"의 측정 지표 —
   * 순간값(list.length)만 보면 캡처 프레임 운에 따라 결론이 뒤집힌다 */
  aliveMax: number;
  /** **§8.④ 계측 4종** (probe `enemies.amphib`). 넷 다 «그 종이 실제로 자기 문법을 썼는가»를 재는
   * 누적값이다 — 적은 처치되면 리스트에서 사라지므로 Field가 들고 있어야 한다:
   *  · swimEver = 물 위를 한 번이라도 지난 수륙양용 개체 수 (0이면 물 통과가 안 먹고 있다)
   *  · leaps    = 성공한 도약 수 (0이면 웅덩이가 사거리 밖이라는 뜻이지 버그가 아니다)
   *  · landed   = 상륙(화물 방출) 횟수 · delivered = 그렇게 내린 러너 수
   *  · grabSec  = 열차가 촉수에 붙잡혀 **감속된 누적 시간**(초) */
  swimEver: number;
  leaps: number;
  landed: number;
  delivered: number;
  grabSec: number;
  /** **§8.⑤ 계측 4종** (probe `enemies.air`). 수륙양용 4종과 같은 규약 — «그 종이 실제로 자기
   * 문법을 썼는가»를 재는 누적값이다:
   *  · boomed    = 코어에 닿아 자폭한 폭격 박쥐 수 · boomDmg = 그렇게 들어간 코어 피해 합
   *  · perchSec  = 가고일이 칸에 앉아 무기를 **정지시킨 누적 시간**(초, 칸×초)
   *  · scoutSec  = 정찰 드론이 살아 있던 누적 시간(초) — `scoutBuff`의 분자다
   *  · crossed   = 열차 장벽을 **넘어간** 공중 개체 수 (0이면 ③ 문법이 안 도는 것이다) */
  boomed: number;
  boomDmg: number;
  perchSec: number;
  scoutSec: number;
  crossed: number;
  /** **§8.⑥ 계측 5종** (probe `enemies.siege`). 공중 5종과 같은 규약 — «그 종이 실제로 자기 문법을
   * 썼는가»를 재는 누적값이다:
   *  · gnawSec  = 공성충이 코어에 붙어 갉은 누적 시간(초) — 0이면 공성충이 코어에 못 닿은 것이다
   *  · planted  = 설치된 폭탄 수 · fled = 설치를 마치고 맵 밖으로 빠져나간 공작원 수
   *  · defused  = **클릭으로** 해체된 폭탄 수 (사격 해체는 `killsByKind.sabo_bomb`이 센다)
   *  · blasted  = 터진 폭탄 수 · blastDmg = 그렇게 들어간 코어 피해 합
   *  갈고리 사략꾼의 정지 시간은 **가고일과 같은 칸**(`perchSec`)에 쌓인다 — 판정 경로가 하나라
   *  칸을 가르면 같은 값을 두 번 세게 된다(`?siege=`만 켠 컷에서는 가고일이 없으므로 곧 갈고리의 값이다) */
  gnawSec: number;
  planted: number;
  fled: number;
  defused: number;
  blasted: number;
  blastDmg: number;
  /** **§8.① 계측 3종** (probe `enemies.runner`). 앞의 세 유형과 같은 규약 — «그 종이 실제로 자기
   * 문법을 썼는가»를 재는 누적값이다:
   *  · revived     = 재기동한 해골 보병 수 (0이면 30% 분기가 안 도는 것이다)
   *  · recoilKills = **자기 충돌로 죽은** 광란 멧돼지 수 (성벽에 닿지 못하면 0이 정상이다)
   *  · recoilDmg   = 멧돼지가 자기에게 넣은 피해 합. 성벽 쪽 피해는 `combat.breakerDmg`가 센다
   *  쥐떼의 분열은 슬라임과 **같은 칸**(`combat.splits`)에 쌓인다 — 판정 경로가 하나라 칸을 가르면
   *  같은 값을 두 번 세게 된다(`?runner=`만 켠 컷에서는 곧 쥐떼의 값이다) */
  revived: number;
  recoilKills: number;
  recoilDmg: number;
  /** **§8.② 계측 3종** (probe `enemies.armor`). 앞의 네 유형과 같은 규약 — «그 종이 실제로 자기
   *  문법을 썼는가»를 재는 누적값이다:
   *   · regenHp      = 트롤이 실제로 회복한 HP 합 (0이면 재생 분기가 안 도는 것이다)
   *   · regenBlockSec= 화염에 재생이 **막혀 있던** 누적 시간(초) — 0이면 편성에 화염이 없다는 뜻이고,
   *     그것이 §8.②의 "소이탄·화염방사 존재 이유"가 실측에서 갈리는 자리다
   *   · miredSec     = 장갑 트럭이 웅덩이 감속(`mired`)을 받은 누적 시간(초). 0이면 트럭이 웅덩이를
   *     한 번도 안 밟은 것이다(맵의 웅덩이 배치에 종속 = 조건부 대가)
   *  잔해 수와 등껍질 몫은 **combat 쪽 칸**이다(`debris`·`carapaceDmg`) — 판정이 거기서 돈다 */
  regenHp: number;
  regenBlockSec: number;
  miredSec: number;
  /** **§8.③ 계측 4종** (probe `enemies.skirm`). 앞의 다섯 유형과 같은 규약 — «그 종이 실제로 자기
   *  문법을 썼는가»를 재는 누적값이다:
   *   · repositions = 머스킷 도적이 자리를 옮긴 횟수 (0이면 재배치 분기가 안 도는 것이다)
   *   · repoSec     = 그렇게 걸은 누적 시간(초). repoSec / (repoSec + 사격 시간)이 듀티의 분모다
   *   · acidSec     = 산성으로 무기칸이 눌려 있던 누적 시간(**칸×초** — 가고일의 perchSec과 같은 단위)
   *   · hiddenSec   = 그림자 암살자가 표적에서 빠져 있던 누적 시간(초). 0이면 언덕·잔해를 한 번도
   *     안 밟은 것이다(맵의 지형 배치에 종속 = 조건부 프리미엄) */
  repositions: number;
  repoSec: number;
  acidSec: number;
  hiddenSec: number;
  /** **§8.⑦ 계측 3종** (probe `enemies.swarm`). 앞의 여섯 유형과 같은 규약 — «그 종이 실제로 자기
   *  문법을 썼는가»를 재는 누적값이다:
   *   · sired  = 슬라임 퀸이 산란한 수 (0이면 산란 분기가 안 도는 것이다)
   *   · raised = 네크로맨서가 처치 지점에서 되살린 수. **0이 정상일 수 있다** — 반경 안에 시체밭이
   *     없으면 안 돈다(조건부 프리미엄 = §8.⑦의 "속전속결" 카운터가 먹었다는 뜻이기도 하다)
   *   · gravesUsed = 그렇게 **소비된** 처치 지점 수 (= raised와 같은 값이지만, 소비가 재소환과
   *     갈리는 날이 오면 여기서 갈린다)
   *  산성 웅덩이와 포자는 **combat 쪽 칸**이다(`acidPools`·`meltDmg`·`spores`) — 판정이 거기서 돈다.
   *  산성 슬라임의 분열은 슬라임과 **같은 칸**(`combat.splits`)에 쌓인다(쥐떼와 같은 규약) */
  sired: number;
  raised: number;
  gravesUsed: number;
  /** **§8.⑧ 계측 2종** (probe `enemies.support`). 앞의 일곱 유형과 같은 규약 — «그 종이 실제로 자기
   *  문법을 썼는가»를 재는 누적값이다:
   *   · healedHp = 오크 주술사가 **남에게** 되돌린 HP 합 (0이면 반경 안에 다친 적이 없었다는 뜻이다)
   *   · domedSec = 돔 안에 적이 들어 있던 누적 개체·초 (0이면 짐꾼이 늘 혼자 걸었다는 뜻이다)
   *  방벽·연막·광폭화는 **combat 쪽 칸**이다(`warded`·`smokeBlunted`·`deathRages`) — 판정이 거기서 돈다 */
  healedHp: number;
  domedSec: number;
  /** **돔 × 부동 겹침** (iter178 · 큐 1). `domed`(실드 돔 안)이면서 `pinned`(차단 지형에 눌림)인
   *  개체의 누적 개체·초. `domedSec`과 **같은 분모·같은 규약**이라 둘의 비가 「돔 안에 있던 시간 중
   *  얼마가 못 걷는 시간이었나」다. ⚠ probe `enemies.tail`은 `alive ≤ 12`에서만 서므로 교착이
   *  **이미 난 뒤**에만 읽히는데, 이 칸은 웨이브 내내 세므로 **교착 «전»의 빈도**가 난다 */
  domedPinnedSec: number;
  /** **처치 지점** (§8.⑦ 네크로맨서 "필드의 처치 지점에서 좀비 재소환"). combat.ts의 사망 루프가
   * 쌓고 네크로맨서가 하나씩 **소비한다**(소비된 자리는 다시 못 쓴다 — 안 그러면 한 자리가 무한
   * 재료가 되어 상한만이 유일한 제동이 된다).
   * 시체 잔상(`corpses`)과 **다른 목록**이다: 저쪽은 1초 페이드의 순수 연출이고 이쪽은 판정이
   * 읽는 값이다. 상한(ENEMY.graveCap)에서 **가장 오래된 것부터** 버린다 = "시체밭"은 최근의 것이다.
   * ⚠ **이벤트 웨이브 동안에는 상한이 `ENEMY.fieldCap`이다**(combat.ts의 적립 한 줄) — §0.7 K ⑤가
   * 「그 웨이브의 전사자 **전원**」을 요구하는데 1차 물량이 195~227기라 60에서 잘리면 「모두」가
   * 재료 단계에서 이미 깨진다. 정본이 「실제 제한은 필드 상한의 여유분 하나」라고 못박은 자리다.
   * **`w` = 죽은 웨이브(0-based `Field.waveIdx`)** — 일제 부활이 「이 웨이브에서 죽은」을 가르는
   * 유일한 칸이다. 엘리트 재소환(`breed`)은 이 칸을 안 본다(그쪽은 「필드의 처치 지점」이다) */
  graves: { x: number; y: number; kind: string; w: number }[];
  /** **부활한 개체의 누적 수** (§0.7 K). `raised`(엘리트 네크로맨서의 4초 재소환)와 **다른 칸**이다 —
   * 둘을 한 칸에 담으면 「이벤트가 실제로 돌았나」와 「엘리트가 시체밭을 먹었나」가 안 갈린다 */
  undeadMade: number;
  /** **다음 웨이브에 얹을 HP 배수 증분** (§8.⑤ 정찰 드론). 살아 있는 드론이 매 프레임 쌓고,
   * `startWave`가 그것을 `scoutBuff`로 넘긴 뒤 0으로 비운다 — 「다음 웨이브 강화」가 이 두 칸의 뜻이다 */
  scoutBuild: number;
  /** 이번 웨이브에 실제로 적용 중인 HP 배수 증분 (0 = 강화 없음). 스폰 시 maxHp에 (1 + 이 값)을 곱한다 */
  scoutBuff: number;
  /** QA 스위치 `?wave=<kind>[,<kind>…]` — 편성을 통째로 이 적종들로 바꿔치기한다.
   * null이면 WAVES의 `mix` 편성을 쓴다. 여러 종을 주면 무리 안에서 번갈아 나온다 */
  kinds: string[] | null;
  /** QA 스위치 `?dense=<count>,<burst>[,<window>]`. 웨이브 편성(큐 2)이 아직 웨이브 1(좀비 16)뿐이라
   * "목업만큼 빽빽한 전장"을 지금 화면에서 볼 방법이 없다 — 감독 #5 V4 판정이 "남은 격차가 렌더 문제인가
   * 편성 문제인가"를 가르려면 스폰 수만 QA에서 올려 봐야 한다. **BALANCE §6 정본이 아니다** */
  waveQa: { count: number; burst: number; window: number } | null;
  rnd: ReturnType<typeof mulberry32>;
};

/** 스폰 링 위의 점 (u = 0~1 둘레 위치). §5.0: 스폰은 맵 밖.
 *
 * 감독 #7 ② 승인으로 **사각 링 → 원형 링**. 사각 링은 코어에서 본 거리가 방향마다 달라
 * (세로 522 vs 대각 1004) 접근 시간이 3.5~8.8초로 벌어졌다 — 원형 링은 그 편차가 구조적으로 없다.
 * 반경은 접근 시간에서 **직접 유도**한다: `outerR + baseSpeed × approachSec`
 * = 224.6 + 89×6.5 = 803 → 어느 방향에서 와도 레일까지 6.5초(BALANCE §1 중앙값).
 *
 * 단 하나의 예외가 대각선이다 — 맵이 16:9라 대각 방향은 803에서도 아직 **화면 안**이라
 * (모서리까지 881.7) §5.0 "등장 즉시 교전 금지"가 깨진다. 그래서 그 방향에서만 맵 사각형 밖으로
 * 밀어내는 클램프가 걸린다(둘레의 ≈25%, 접근 6.5 → 최대 7.6초). 4~9초 안이라 §1을 지킨다. */
/** **방위 8분원 / 4사분면** (§0.7 J1-f). 화면 좌표계(y가 아래)라 0 = E · π/2 = S · π = W다.
 * 두 칸 모두 **자기 방위를 한가운데** 두는 부채꼴이다(8분원 45° · 사분면 90°) — 그래야 «좌측»이
 * 한 칸으로 떨어진다. 45° 어긋나게 접으면 서쪽이 두 칸으로 쪼개져 격차가 반씩 묽어진다.
 * 그래서 **사분면은 `oct >> 1`이 아니다** — 각에서 따로 접는다 */
export const OCT_NAME = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"] as const;
export const QUAD_NAME = ["E", "S", "W", "N"] as const;
export function octOf(a: number): number {
  return Math.floor((a / (Math.PI * 2) + 1 / 16 + 1) * 8) % 8;
}
export function quadOf(a: number): number {
  return Math.floor((a / (Math.PI * 2) + 1 / 8 + 1) * 4) % 4;
}

export function ringPoint(map: GameMap, u: number): { x: number; y: number } {
  const a = u * Math.PI * 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // 접근 시간에서 유도한 원형 링 반경
  const want = map.outerR + ENEMY.baseSpeed * ENEMY.approachSec;
  // 이 방향에서 맵 사각형을 벗어나는 최소 반경 + 여유
  const outX = Math.abs(ca) > 1e-6 ? map.w / 2 / Math.abs(ca) : Infinity;
  const outY = Math.abs(sa) > 1e-6 ? map.h / 2 / Math.abs(sa) : Infinity;
  const r = Math.max(want, Math.min(outX, outY) + ENEMY.spawnMargin);
  return { x: map.cx + ca * r, y: map.cy + sa * r };
}

function distToRail(map: GameMap, x: number, y: number): number {
  let best = Infinity;
  for (const p of map.loop) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

export function makeField(
  map: GameMap,
  seed = 7,
  kinds: string[] | null = null,
  waveQa: Field["waveQa"] = null,
  startWaveIdx = 0,
): Field {
  // 속도는 BALANCE §1 등재값(89 월드/s)을 그대로 쓴다. 링 표본은 접근 시간 검증용 참고 분포다.
  const ds: number[] = [];
  for (let i = 0; i < 128; i++) {
    const p = ringPoint(map, i / 128);
    ds.push(distToRail(map, p.x, p.y));
  }
  ds.sort((a, b) => a - b);
  const approachDist = ds[ds.length >> 1];
  const f: Field = {
    list: [],
    corpses: [],
    spawned: 0,
    t: 0,
    waveT: 0,
    waveIdx: 0,
    baseSpeed: ENEMY.baseSpeed * MULT.enemySpeed,
    approachDist,
    distMin: ds[0],
    distMax: ds[ds.length - 1],
    approachLog: [],
    cx: map.cx,
    cy: map.cy,
    spawnOct: new Array(8).fill(0),
    spawnQuad: new Array(4).fill(0),
    octSec: new Array(8).fill(0),
    slowedEver: 0,
    slowMinEver: 1,
    slowSec: 0,
    buffedEver: 0,
    engageLog: [],
    roster: [],
    plan: [],
    planAt: 0,
    gateU: null,
    companies: [],
    coSeq: 0,
    coBroken: 0,
    coBrokenAlive: 0,
    coForms: {},
    detourSum: 0,
    detourN: 0,
    detourHits: 0,
    guards: [],
    guardsMade: 0,
    shieldOpenSec: 0,
    gap: 0,
    station: false,
    card: false,
    branch: false,
    doctrine: false,
    cardToStation: false,
    cardAfter: false,
    cleared: false,
    bossPending: false,
    midPending: false,
    eventPending: false,
    eventWave: false,
    bossEngageT: null,
    breach: null,
    summoned: 0,
    patFired: { charge: 0, summon: 0, rock: 0, quake: 0, raise: 0 },
    quakeAt: null,
    rockPending: 0,
    carStun: [],
    banner: null,
    faction: "tribe",
    kindFirstWave: {},
    capHits: 0,
    aliveMax: 0,
    swimEver: 0,
    leaps: 0,
    landed: 0,
    delivered: 0,
    grabSec: 0,
    boomed: 0,
    boomDmg: 0,
    perchSec: 0,
    scoutSec: 0,
    crossed: 0,
    gnawSec: 0,
    planted: 0,
    fled: 0,
    defused: 0,
    blasted: 0,
    blastDmg: 0,
    revived: 0,
    recoilKills: 0,
    recoilDmg: 0,
    regenHp: 0,
    regenBlockSec: 0,
    miredSec: 0,
    repositions: 0,
    repoSec: 0,
    acidSec: 0,
    hiddenSec: 0,
    sired: 0,
    raised: 0,
    gravesUsed: 0,
    undeadMade: 0,
    healedHp: 0,
    domedSec: 0,
    domedPinnedSec: 0,
    graves: [],
    scoutBuild: 0,
    scoutBuff: 0,
    kinds,
    waveQa,
    rnd: mulberry32(seed * 31 + 5),
  };
  startWave(f, startWaveIdx);
  return f;
}

/** 이 적종 1기가 먹는 **실효 HP** = 분열체까지 포함한 합 (BALANCE §6 "슬라임 1기 = 92").
 * 편성 예산이 개체 수가 아니라 이 값 기준이라, 슬라임 1기는 좀비 4.6기의 자리를 차지한다 */
export function effHp(kind: string): number {
  const st = ENEMY_STATS[kind];
  // **수송 화물도 같은 규칙으로 센다** (§8.④ 상륙정 — 분열체와 문법이 같다). 안 세면 상륙정 1기가
  // 좀비 3기 값으로 좀비 4기를 데려오는 «예산 구멍»이 된다
  // **설치물도 같은 규칙으로 센다** (§8.⑥ 폭파공작원 — 화물·분열체와 문법이 같다)
  return (
    st.hp +
    (st.split ? st.split.n * effHp(st.split.into) : 0) +
    (st.cargo ? st.cargo.n * effHp(st.cargo.into) : 0) +
    (st.plant ? effHp(st.plant.into) : 0) +
    // **재기동도 같은 규칙으로 센다** (§8.① 해골 보병). 30%로 한 번 더 서므로 기댓값은 hp × 0.3이고,
    // 안 세면 15짜리 적이 19.5의 자리를 무료로 쓰는 «예산 구멍»이 된다
    (st.revive ? st.hp * st.revive.chance : 0) +
    // **재생도 같은 규칙으로 센다** (§8.② 트롤). 평생 회복 상한이 `hp × pool`이므로 이 적이 실제로
    // 지워지기까지 넣어야 하는 피해는 `hp × (1 + pool)`이다 — 안 세면 명목 120짜리가 240의 자리를
    // 무료로 쓰는 «예산 구멍»이 된다(화물·분열체·설치물·재기동과 같은 규칙).
    // 화염을 든 편성에서는 이 몫이 실제로 안 나오지만, 예산은 **편성을 모른 채** 서는 값이라
    // 상한 쪽으로 센다(방패 오크의 frontShield를 안 세는 것과 반대 방향의 이유: 저쪽은 각도에
    // 따라 0이 될 수 있어 상한이 곧 명목이다)
    (st.regen ? st.hp * st.regen.pool : 0) +
    // **산란·재소환·포자도 같은 규칙으로 센다** (§8.⑦ 증식 4종). 셋 다 «평생 상한»(cap)을 들고
    // 있고, 그것이 곧 이 적이 필드에 내놓는 몸의 총량이다 — 상한을 안 세면 퀸 1기가 좀비 11기분
    // 자리에 좀비 21기분을 데려오는 «예산 구멍»이 된다(화물·분열체·설치물·재기동·재생과 같은 규칙).
    // 재소환은 **재료(처치 지점)가 없으면 안 도는** 조건부라 실측은 상한 아래로 나오는 것이 정상이다 —
    // 예산은 편성을 모른 채 서는 값이라 트롤의 회복 상한과 같이 **상한 쪽으로** 센다
    (st.spawner ? st.spawner.cap * effHp(st.spawner.into) : 0) +
    (st.raise ? st.raise.cap * effHp(st.raise.into) : 0) +
    (st.spore ? st.spore.cap * effHp(st.spore.into) : 0) +
    // **회복·방벽도 같은 규칙으로 센다** (§8.⑧ 지원 4종). 둘 다 «평생 총량»(pool)을 들고 있고,
    // 그것이 곧 이 적이 편성에게 물리는 추가 화력이다 — 주술사가 되돌린 HP도, 깃발이 깎아 준 몫도
    // 플레이어가 **한 번 더 넣어야 하는 피해**라 명목 HP와 같은 자리에 선다.
    // 돔(`dome`)과 연막(`smoke`)은 **안 센다** — 곡사 한 문·포격 한 번이면 실효가 0이라 상한이 곧
    // 명목이다(방패 오크 `frontShield`를 안 세는 것과 같은 이유)
    (st.heal ? st.heal.pool : 0) +
    (st.banner ? st.banner.pool : 0)
  );
}

/** 이 적종 1기가 떨어뜨리는 **실효 스크랩** = 분열체 드랍까지 포함 (BALANCE §2 "슬라임(대) 5, 분열체 중 2·소 1") */
export function effScrap(kind: string): number {
  const st = ENEMY_STATS[kind];
  return (
    st.scrap +
    (st.split ? st.split.n * effScrap(st.split.into) : 0) +
    (st.cargo ? st.cargo.n * effScrap(st.cargo.into) : 0) +
    (st.plant ? effScrap(st.plant.into) : 0) +
    (st.spawner ? st.spawner.cap * effScrap(st.spawner.into) : 0) +
    (st.raise ? st.raise.cap * effScrap(st.raise.into) : 0) +
    (st.spore ? st.spore.cap * effScrap(st.spore.into) : 0)
  );
}

/** 예산 단위 = 좀비 1기 (실효 HP 20). WAVES.budget은 이 단위로 적혀 있다.
 * **§0.5의 HP 배율은 여기 안 곱한다** — 비율이라 곱해도 값이 같고, effHp 쪽에 곱하면 같은 예산이
 * 사는 머릿수가 ×5가 아니라 ×12.5가 된다(HP ×0.4의 몫까지 물량으로 새는 것) */
export function budgetUnits(kind: string): number {
  return effHp(kind) / effHp("zombie");
}

/** 웨이브 스폰 예산 = §6 표값 × **§0.5 물량 배율**. WAVES.budget을 읽는 유일한 경로다 —
 * 직접 읽는 새 코드는 §0.5의 "물량 ×5"를 조용히 무시한다(probe의 증가율 검산은 비율이라 무관) */
export function waveBudget(idx: number): number {
  // **이벤트 관문(18·36)만 물량 배수를 탄다** (감독 #72 ⑤ 「물량을 더 주고」 · `NECRO.hordeMul`).
  // 자리가 여기인 이유: §6 예산표를 두 행 고치면 「이 관문은 물량전」이 표에 숨고, `?wave=`·probe·
  // 편성 유도가 각자 다른 수를 보게 된다 — 예산을 읽는 문이 이 함수 하나여야 그 셋이 안 갈린다.
  // `?event=0`이면 배수도 함께 꺼진다(대조군의 뜻 = 「여느 보스 웨이브」)
  const evt = qaEvent && isEventWave(idx + 1) ? hordeMulValue() : 1;
  return WAVES[idx].budget * MULT.spawnBudget * evt;
}

/** 개체 최대 HP = §5 표값 × **§0.5 HP 배율**. 보스는 잡몹 배율(`enemyHp` ×0.4) 대신
 * **보스 전용 배율 `MULT.bossHp`(×3)**를 탄다 — 물량 ×5 밖에 있는 1기짜리라 "총 HP ×2" 정합을
 * 개체 HP로만 만들어야 하고, 이속 ×0.5가 보스에게만 순수 하향으로 얹히기 때문이다(도출은 balance.ts 주석).
 * HP를 비율로 읽는 곳(광폭화·포효 문턱, HP바)도 전부 이 함수를 거쳐야 문턱이 안 밀린다 */
export function maxHpOf(kind: string, bossN = 0): number {
  // 중간보스는 **잡몹 배율(enemyHp)을 그대로 타고** 그 위에 주기 강화만 얹는다 — 엘리트의 강화판이라
  // §5 표값 축이 잡몹 쪽이다(보스만 MULT.bossHp라는 별도 축을 쓴다).
  // **풀 7종이 전부 같은 값을 낸다** — 눈금(hp 625)이 풀 공통이라 이 함수는 순번만 본다
  if (isMidKind(kind)) return ENEMY_STATS[kind].hp * enemyHpMult() * Math.pow(MID.hpStep, Math.max(0, bossN));
  if (!isBossKind(kind)) return ENEMY_STATS[kind].hp * enemyHpMult() * (isApproachMelee(kind) ? MELEE_PRESSURE.hp : 1);
  // **주기 강화** (DESIGN §3 신표 "보스 풀 로테이션 + 주기 강화"): n번째 보스는 ×`BOSS.hpStep`^n.
  // 웨이브 6이 n=0이라 1차 프로토의 9웨이브 체제와 첫 보스의 HP가 정확히 같다 (§0.5 확정값 보존)
  return ENEMY_STATS[kind].hp * MULT.bossHp * qaBossHp * Math.pow(qaHpStep ?? BOSS.hpStep, Math.max(0, bossN));
}

/** **적 HP의 웨이브 성장 배수** (BALANCE §0.7 · DESIGN §0.7 H1) = `ENEMY.hpGrow^(w-1)`.
 * 인자는 **0-based 웨이브 인덱스**다(`Field.waveIdx`) — 정본 식의 `w`는 1-based라 지수가 그대로 인덱스다.
 *
 * **보스·중간보스는 이 배수를 안 탄다** — 둘은 이미 순번 곡선(`BOSS.hpStep`·`MID`)을 갖고 있어서
 * 여기까지 태우면 관문에 곡선이 두 번 얹힌다(BALANCE §0.7 "H1 곡선을 관문에 두 번 태우지 말 것").
 * 그 갈림은 `spawnEnemy` 한 곳에서만 진다 — `maxHpOf`는 종·순번만 보는 **웨이브를 모르는 함수**이고,
 * 그 성질이 광폭화·포효 문턱과 HP바의 분모가 안 밀리는 근거다(그 주석 참조).
 *
 * **면세 구간**(`ENEMY.hpGrowFrom` · 감독 #63)이 지수의 밑에 깔린다 — `waveIdx`는 0-based이므로
 * 1-based 웨이브 `w`에 대해 지수는 `max(0, w − hpGrowFrom)` = `max(0, waveIdx + 1 − from)`이다.
 * `from 19`면 **웨이브 1~19가 배수 1.0**이고 20부터 자란다.
 *
 * QA `?hpgrow=<n>`·`?w0=<n>`으로 **두 축을 따로** 갈아끼운다 — **정본이 아니라 사다리용 A/B**다
 * (`?bosshp`·`?hpstep`과 같은 부류). 감독 #63이 「사다리를 두 축으로 재라」고 지정한 자리다 */
export function waveHpMult(waveIdx: number): number {
  return Math.pow(qaHpGrow ?? ENEMY.hpGrow, Math.max(0, waveIdx + 1 - (qaHpGrowFrom ?? ENEMY.hpGrowFrom)));
}

/** **개체 위협도의 선형 성장 배수** (BALANCE §0.9 · 감독 #79 ①) = `1 + ENEMY.hpWaveLin × w`.
 * 인자는 `waveHpMult`와 같은 **0-based 웨이브 인덱스**라 `w = waveIdx + 1`이다.
 *
 * **`waveHpMult`와 같이 관문(보스·중간보스)은 안 탄다** — 「자기 순번 곡선에 곡선을 두 번 태우지
 * 말 것」이 두 함수 공통의 규약이고, `spawnEnemy`의 `gate` 갈림 한 곳에서 함께 진다.
 * ⚠ `earlyHpMult`는 반대로 관문을 «탄다» — 세 배수를 한 줄에서 곱하지 않고 따로 두는 이유가 그 갈림이다.
 *
 * QA `?hpwlin=<n>`으로 계수만 갈아끼운다(`?hpgrow`·`?w0`과 같은 부류 — **정본이 아니라 사다리용**) */
export function waveLinMult(waveIdx: number): number {
  return 1 + (qaHpWaveLin ?? ENEMY.hpWaveLin) * (waveIdx + 1);
}

let qaHpWaveLin: number | null = null;
export function setQaHpWaveLin(v: number): void {
  qaHpWaveLin = v;
}
export function qaHpWaveLinValue(): number {
  return qaHpWaveLin ?? ENEMY.hpWaveLin;
}

/** **초반 완화 배수** (BALANCE §0.7-B · 감독 #67 ②) = `w ≤ ENEMY.earlyUntil ? ENEMY.earlyMul : 1`.
 * 인자는 `waveHpMult`와 같은 **0-based 웨이브 인덱스**다(`Field.waveIdx`).
 *
 * ⚠ **`waveHpMult`와 달리 관문(보스·중간보스)도 이 배수를 탄다** — 이유는 `ENEMY.earlyMul` 주석에
 * 있다(초반 6칸의 벽이 웨이브 3 중간보스·웨이브 6 보스 그 자체다). 두 배수를 한 줄에서 곱하지 말고
 * 따로 두는 이유가 이 갈림이다.
 *
 * QA `?early=<n>`으로 배수만 갈아끼운다(`?hpgrow=`와 같은 부류 — **정본이 아니라 A/B용**) */
export function earlyHpMult(waveIdx: number): number {
  return waveIdx + 1 <= ENEMY.earlyUntil ? (qaEarlyMul ?? ENEMY.earlyMul) : 1;
}

let qaEarlyMul: number | null = null;
export function setQaEarlyMul(v: number): void {
  qaEarlyMul = v;
}
export function qaEarlyMulValue(): number {
  return qaEarlyMul ?? ENEMY.earlyMul;
}

let qaHpGrow: number | null = null;
export function setQaHpGrow(v: number): void {
  qaHpGrow = v;
}
export function qaHpGrowValue(): number {
  return qaHpGrow ?? ENEMY.hpGrow;
}
let qaHpGrowFrom: number | null = null;
export function setQaHpGrowFrom(v: number): void {
  qaHpGrowFrom = v;
}
export function qaHpGrowFromValue(): number {
  return qaHpGrowFrom ?? ENEMY.hpGrowFrom;
}

/** QA 전용 보스 HP 배율 (`?bosshp=N`). **BALANCE §5 정본이 아니다 — `?dense`·`?lvl`과 같은 부류**다.
 * `MULT.bossHp`(정본 ×3)에 **곱해지는** 값이라 `?bosshp=2`는 실효 ×6이다 — iter34의 사다리 표
 * (`bosshp×N` = 실효 1,050×N)와 배수가 다르니 그 표를 이 스위치로 재현하려면 3으로 나눠 넣을 것 */
let qaBossHp = 1;
export function setQaBossHp(mult: number): void {
  qaBossHp = mult;
}

/** QA 전용 보스 주기 강화 기울기 (`?hpstep=N`). **BALANCE 정본이 아니다 — `?bosshp`와 같은 부류**다.
 * `?bosshp`는 **곱셈**인데 이쪽은 `BOSS.hpStep`을 통째로 **갈아끼운다**(절대값) — 두 스위치의 규약이
 * 다르니 섞지 말 것. 감독 #35 ②의 사다리(절편 `MULT.bossHp` × 기울기 `BOSS.hpStep`)를 한 서버·한
 * 빌드에서 재려고 만들었다. **`MID.hpStep`은 안 건드린다** — 이 사다리가 재려는 것은 보스전 길이
 * 하나이고, 중간보스까지 같이 움직이면 런 궤적이 함께 바뀌어 축이 섞인다 (STATUS 미결 질문) */
let qaHpStep: number | null = null;
export function setQaHpStep(step: number): void {
  qaHpStep = step;
}

/** QA 전용 보스 이속 배율 (`?bossspd=N`). **BALANCE §5 정본이 아니다** — `?bosshp`와 같은 부류의 A/B다.
 * `Field.baseSpeed`가 이속의 유일한 경로라 §0.5의 `enemySpeed 0.5`를 **보스도 같이 탄다**(balance.ts
 * `MULT` 주석의 "보스는 전 축에서 제외"는 이속 축에서 사실이 아니었다 — iter34 실측). `?bossspd=2`가
 * 그 배율을 정확히 되돌리는 대조 컷이고, 보스가 "사거리 안에서 사격받는 시간"만 절반으로 되돌린다 */
let qaBossSpeed = 1;
export function setQaBossSpeed(mult: number): void {
  qaBossSpeed = mult;
}

/** QA 전용 **보스 얼굴 고정** (`?bosskind=<종>`). **정본이 아니다** — 로테이션은 `bossKindAt`이
 * 정하고, 이 스위치는 「같은 순번(= 같은 HP)에서 종만 갈아 끼운다」는 A/B 하나를 위해 있다.
 * 풀 종은 눈금이 전부 같으므로 이 손잡이가 바꾸는 것은 **고유 행동 하나뿐**이다 — 크롤러의
 * 등껍질이 §5 보스전 창(12~25초)을 얼마나 미는가가 그 측정이다 */
let qaBossKind: string | null = null;
export function setQaBossKind(kind: string): void {
  if (!isBossKind(kind)) throw new Error(`bad ?bosskind: ${kind}`);
  qaBossKind = kind;
}

/** QA 전용 **정차 빈도** (`?stop=N` — N웨이브마다 정차). **DESIGN §3 정본이 아니다**(`?corehp`와 같은 부류) —
 * 정본은 "정차 = 스테이지 사이 19회"이고 기본값 0이면 이 스위치는 통째로 꺼진다.
 * 있는 이유는 iter48 큐 1의 손잡이 ⓒ("정차를 웨이브 2개마다") 하나뿐이다 — 그 손잡이는 §3 문면 수정이라
 * 감독 지정 없이는 못 넣지만, **넣었을 때 얼마나 벌어지는가**는 재야 감독이 고를 수 있다.
 * 스테이지 **안**에 낀 정차는 원래 그 자리에 있던 카드를 지우지 않는다 — 정차를 먼저 열고 「출발」에서
 * 카드로 넘긴다(카드가 칸의 주 공급이라 지우면 다른 컷이 된다 — iter47 함정 ①) */
let qaStopEvery = 0;
export function setQaStopEvery(n: number): void {
  qaStopEvery = n;
}
export function qaStopEveryValue(): number {
  return qaStopEvery;
}

/** QA 전용 A/B 스위치 2개 — 둘 다 **기본이 켜짐(true)이고 그 켜진 상태가 정본**이다.
 * 끄는 갈래만 QA다(감독 #35 ①의 사다리와 큐 1 중간보스의 후퇴 측정이 **같은 컷에서 두 축을 분리**해야 해서
 * 넣었다 — 축을 하나씩 꺼봐야 도달 웨이브 합의 증감을 누구 몫으로 셀지가 정해진다).
 *  · `?mid=0` — 중간보스(3n)를 안 내보낸다 (DESIGN §3 신표 이전 상태)
 *  · `?card3=0` — 정차 직전 카드를 안 연다 (BALANCE §7 갱신 이전 = 스테이지당 2회) */
let qaMid = true;
let qaCard3 = true;
/** `?gate=0` — **관문의 전면 정렬 진군을 끈다**(§0.6 C6 이전 상태 = 사방에서 황금비 도약).
 * 부대 대열과 「보스가 대열 중앙에 선다」가 함께 꺼진다 — 관문의 물량(`CURVE.bossBudget`)과
 * 중간보스 등장 시점은 **안 꺼진다**(축을 하나씩 꺼야 도달 웨이브의 증감을 누구 몫으로 셀지 정해진다) */
let qaGate = true;
/** `?ysort=0` — **적의 깊이 정렬을 끈다**(iter95 이전 상태 = `f.list` 순서 = 스폰 순서).
 * 연출 전용 스위치다 — 시뮬은 어느 쪽이든 한 자리도 안 갈린다(아래 `drawOrder` 주석) */
let qaYSort = true;
/** `?event=0` — **네크로맨서 이벤트 흐름을 끈다**. ⚠ **대조군의 뜻이 감독 #72 ⑤로 갈렸다** —
 * 옛 뜻은 「웨이브 20·40이 여느 웨이브」였고 지금은 **「웨이브 18·36이 여느 «보스» 웨이브」**다
 * (자리가 6n 안으로 들어왔으므로 그 자리를 비울 수는 없다 — 풀(그람·크롤러)이 대신 선다).
 * 함께 꺼지는 것 셋: 구석 5단 흐름 · 일제 부활 · **`NECRO.hordeMul` 물량 배수**.
 * **켜진 쪽이 정본이다**(`?mid`·`?gate`와 같은 규약) — 완주가 갈렸을 때 그것이 ⑤ 때문인지 여기서 가른다 */
let qaEvent = true;
/** `?horde=<n>` — **이벤트 관문의 1차 물량 배수**(`NECRO.hordeMul`)를 대체한다. `?raisecap=`과 **짝**이다:
 * 두 값이 웨이브 총량에 함께 얹히므로(1차 × horde → 부활 × min(raiseCap, 그 수)) 한쪽만 재면
 * 완주가 어느 몫에서 부러졌는지 안 갈린다. `1`이 「물량 배수 없음」 대조군이다 */
let qaHorde: number | null = null;
export function setQaHorde(v: number): void {
  qaHorde = v;
}
export function hordeMulValue(): number {
  return qaHorde ?? NECRO.hordeMul;
}
export function setQaYSort(on: boolean): void {
  qaYSort = on;
}
export function qaYSortOn(): boolean {
  return qaYSort;
}
export function setQaMid(on: boolean): void {
  qaMid = on;
}
export function setQaCard3(on: boolean): void {
  qaCard3 = on;
}
export function setQaGate(on: boolean): void {
  qaGate = on;
}
export function qaGateOn(): boolean {
  return qaGate;
}
export function qaMidOn(): boolean {
  return qaMid;
}
export function setQaEvent(on: boolean): void {
  qaEvent = on;
}
export function qaEventOn(): boolean {
  return qaEvent;
}
export function qaCard3On(): boolean {
  return qaCard3;
}

/** QA 전용 **수륙양용 편입 비중**(`?amph=<%>`, 기본 0 = 꺼짐). **BALANCE 정본이 아니다** —
 * §8.④ 4종을 웨이브 `mix`에 실제로 넣었을 때 무엇이 갈리는지를 재기 위한 A/B 손잡이다
 * (iter61이 지원칸에 남긴 `?sup=`와 같은 부류). 넣는 방식은 «기존 비중을 (100−p)%로 눌러 담고
 * 남은 p%를 4종에 균등 분배»라 **예산 총량은 안 바뀐다** = 갈리는 것은 조성뿐이다.
 * 기본이 0인 이유: 편입 비중·해금 스테이지는 §6 "스테이지 경계에 신규 적종 1~2 해금"에 걸리는
 * 정본 판단이라 감독 등재를 기다린다(STATUS 미결 질문) */
let qaAmphPct = 0;
export function setQaAmphPct(p: number): void {
  qaAmphPct = p;
}
export function qaAmphPctValue(): number {
  return qaAmphPct;
}
/** `?amph=`가 섞어 넣는 4종 (§8.④). 심연 촉수가 빠져 있다 — 호수 고정 출현이라 «웨이브 조성»이
 * 아니라 «맵에 몇 기가 서 있는가»의 축이고, 예산에 넣으면 물가에 촉수 수십 기가 쌓인다 */
const AMPHIB_MIX = ["swamp_crawler", "frog_warrior", "landing_craft"] as const;

/** QA 전용 **공중 편입 비중**(`?air=<%>`, 기본 0 = 꺼짐). `?amph=`와 **문법도 이유도 같다** —
 * §8.⑤ 5종을 웨이브 `mix`에 실제로 넣었을 때 무엇이 갈리는지를 재는 A/B 손잡이이고,
 * 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다.
 * **이 스위치가 대공 플랙의 잠금도 함께 연다** (balance.ts `setAirThreat`) — 「표적이 있을 때만
 * 파는 무기」라는 규칙이 조성 하나에서 유도되려면 두 값이 한 손잡이에 묶여 있어야 한다 */
let qaAirPct = 0;
export function setQaAirPct(p: number): void {
  qaAirPct = p;
  setAirThreat(p > 0);
}
export function qaAirPctValue(): number {
  return qaAirPct;
}
/** `?air=`가 섞어 넣는 5종 (§8.⑤). 다섯 종이 다 들어간다 — 수륙양용과 달리 «고정 출현»이 없어
 * 전부 스폰 링에서 온다 */
const AIR_MIX = ["bomb_bat", "gargoyle", "scout_drone", "zeppelin", "wyvern"] as const;

/** QA 전용 **공성 편입 비중**(`?siege=<%>`, 기본 0 = 꺼짐). `?amph=`·`?air=`와 **문법도 이유도 같다** —
 * §8.⑥ 4종을 웨이브 `mix`에 실제로 넣었을 때 무엇이 갈리는지를 재는 A/B 손잡이이고,
 * 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다 */
let qaSiegePct = 0;
export function setQaSiegePct(p: number): void {
  qaSiegePct = p;
}
export function qaSiegePctValue(): number {
  return qaSiegePct;
}
/** `?siege=`가 섞어 넣는 4종 (§8.⑥). **`sabo_bomb`은 없다** — 그것은 편성이 아니라 공작원의 산물이고,
 * 예산에는 이미 `effHp(saboteur)`가 폭탄 몫을 함께 세고 있다(화물·분열체와 같은 규약) */
const SIEGE_MIX = ["siege_worm", "saboteur", "hook_raider", "siege_ram"] as const;

/** QA 전용 **러너 편입 비중**(`?runner=<%>`, 기본 0 = 꺼짐). `?amph=`·`?air=`·`?siege=`와
 * **문법도 이유도 같다** — §8.① 신규 4종을 웨이브 `mix`에 실제로 넣었을 때 무엇이 갈리는지를 재는
 * A/B 손잡이이고, 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다 */
let qaRunnerPct = 0;
export function setQaRunnerPct(p: number): void {
  qaRunnerPct = p;
}
export function qaRunnerPctValue(): number {
  return qaRunnerPct;
}
/** `?runner=`가 섞어 넣는 4종 (§8.①). **`rat`은 없다** — 그것은 편성이 아니라 쥐떼의 분열체이고,
 * 예산에는 이미 `effHp(rat_swarm)`가 12기분을 함께 세고 있다(슬라임·화물과 같은 규약) */
const RUNNER_MIX = ["goblin_raider", "skeleton", "frenzy_boar", "rat_swarm"] as const;

/** QA 전용 **중장갑 편입 비중**(`?armor=<%>`, 기본 0 = 꺼짐). `?amph=`·`?air=`·`?siege=`·`?runner=`와
 * **문법도 이유도 같다** — §8.② 신규 4종을 웨이브 `mix`에 실제로 넣었을 때 무엇이 갈리는지를 재는
 * A/B 손잡이이고, 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다 */
let qaArmorPct = 0;
export function setQaArmorPct(p: number): void {
  qaArmorPct = p;
}
export function qaArmorPctValue(): number {
  return qaArmorPct;
}
/** `?armor=`가 섞어 넣는 4종 (§8.②). **오우거·방패 오크는 없다** — 그 둘은 이미 §6의 `mix`에 있는
 * 기존 종이고, 여기 넣으면 «신규 4종이 무엇을 바꾸는가»가 기존 종의 비중 변화와 섞인다 */
const ARMOR_MIX = ["troll", "scrap_golem", "armor_beetle", "armored_truck"] as const;

/** QA 전용 **산병 편입 비중**(`?skirm=<%>`, 기본 0 = 꺼짐). `?amph=`·`?air=`·`?siege=`·`?runner=`·
 * `?armor=`와 **문법도 이유도 같다** — §8.③ 신규 3종을 웨이브 `mix`에 실제로 넣었을 때 무엇이
 * 갈리는지를 재는 A/B 손잡이이고, 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다 */
let qaSkirmPct = 0;
export function setQaSkirmPct(p: number): void {
  qaSkirmPct = p;
}
export function qaSkirmPctValue(): number {
  return qaSkirmPct;
}
/** `?skirm=`이 섞어 넣는 3종 (§8.③). **궁수·박격포반은 없다** — 그 둘은 이미 §6의 `mix`에 있는
 * 기존 종이고, 여기 넣으면 «신규 3종이 무엇을 바꾸는가»가 기존 종의 비중 변화와 섞인다
 * (중장갑의 오우거·방패 오크와 같은 규약) */
const SKIRM_MIX = ["musket_bandit", "acid_spitter", "shadow_assassin"] as const;

/** QA 전용 **증식 편입 비중**(`?swarm=<%>`, 기본 0 = 꺼짐). `?amph=`·`?air=`·`?siege=`·`?runner=`·
 * `?armor=`·`?skirm=`와 **문법도 이유도 같다** — §8.⑦ 신규 4종을 웨이브 `mix`에 실제로 넣었을 때
 * 무엇이 갈리는지를 재는 A/B 손잡이이고, 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다 */
let qaSwarmPct = 0;
export function setQaSwarmPct(p: number): void {
  qaSwarmPct = p;
}
export function qaSwarmPctValue(): number {
  return qaSwarmPct;
}
/** `?swarm=`이 섞어 넣는 4종 (§8.⑦). **슬라임은 없다** — 이미 §6의 `mix`에 있는 기존 종이고,
 * 여기 넣으면 «신규 4종이 무엇을 바꾸는가»가 기존 종의 비중 변화와 섞인다(앞의 세 유형과 같은 규약).
 * 분열체·산란체·포자 새끼도 없다 — 편성이 아니라 산물이고, 예산에는 이미 `effHp`가 함께 세고 있다 */
const SWARM_MIX = ["acid_slime", "slime_queen", "necromancer", "spore_trent"] as const;

/** QA 전용 **지원 편입 비중**(`?support=<%>`, 기본 0 = 꺼짐). `?amph=`·`?air=`·`?siege=`·`?runner=`·
 * `?armor=`·`?skirm=`·`?swarm=`와 **문법도 이유도 같다** — §8.⑧ 신규 4종을 웨이브 `mix`에 실제로
 * 넣었을 때 무엇이 갈리는지를 재는 A/B 손잡이이고, 편입 비중·해금 스테이지는 §6 정본 판단이라
 * 감독 등재를 기다린다 */
let qaSupportPct = 0;
export function setQaSupportPct(p: number): void {
  qaSupportPct = p;
}
export function qaSupportPctValue(): number {
  return qaSupportPct;
}
/** `?support=`이 섞어 넣는 4종 (§8.⑧). **워 드러머는 없다** — 이미 §6의 `mix`에 있는 기존 종이고,
 * 여기 넣으면 «신규 4종이 무엇을 바꾸는가»가 기존 종의 비중 변화와 섞인다(앞의 네 유형과 같은 규약).
 * 지원 4종은 **자기 화력이 0에 가깝다** — 그래서 이 손잡이는 다른 유형과 달리 «판이 얼마나 안
 * 죽는가»를 재는 A/B다(같은 예산에 같은 잡몹, 갈리는 것은 옆에 선 넷뿐이다) */
const SUPPORT_MIX = ["orc_shaman", "shield_bearer", "smoke_truck", "banner_lord"] as const;

/** QA 전용 **변종 편입 비중**(`?variant=<%>`, 기본 0 = 꺼짐). 앞의 여덟 유형(`?amph=`·`?air=`·
 * `?siege=`·`?runner=`·`?armor=`·`?skirm=`·`?swarm=`·`?support=`)과 **문법도 이유도 같다** —
 * 변종 12종을 웨이브 `mix`에 실제로 넣었을 때 무엇이 갈리는지를 재는 A/B 손잡이이고,
 * 편입 비중·해금 스테이지는 §6 정본 판단이라 감독 등재를 기다린다.
 * **이 손잡이만 유형이 아니라 «축»을 켠다** — 12종이 여덟 유형에 흩어져 있으므로 이 컷은
 * «한 유형이 무엇을 바꾸는가»가 아니라 «같은 골격의 다른 눈금이 판에 섞이면 무엇이 바뀌는가»다 */
let qaVariantPct = 0;
export function setQaVariantPct(p: number): void {
  qaVariantPct = p;
}
export function qaVariantPctValue(): number {
  return qaVariantPct;
}

/** QA: `?faction=<id|off>` — 진영 로테이션을 **끄거나 한 진영으로 고정**한다 (§0.6 D).
 *
 * ⚠ **이 스위치가 D 구현의 일부다**(iter87 함정 「원인이 셋이면 끄는 스위치를 먼저 만들어라」).
 * `off`(= `tribe` 고정)가 **변경 전 기준선을 그대로 재현하는 A/B 대조군**이라, 완주·코어 손실이
 * 갈렸을 때 「진영 몫인가 다른 축인가」를 코드를 되돌리지 않고 한 런으로 가른다.
 * 값을 안 주면 `null` = 정본 로테이션(스테이지 4개마다 교대) */
let qaFaction: FactionId | null = null;
export function setQaFaction(f: FactionId | null): void {
  qaFaction = f;
}
export function qaFactionValue(): FactionId | null {
  return qaFaction;
}

/** 이 웨이브(0-based)의 진영 — QA 고정이 있으면 그것, 없으면 스테이지에서 유도한다 */
export function factionOfWave(idx: number): FactionId {
  return qaFaction ?? factionAt(WAVES[idx].stage);
}

/** 웨이브의 예산·비중을 **스폰 순서대로 편 적종 목록**으로 바꾼다.
 *
 * 개체 수 = round(예산 × 비중 / 그 적종의 예산 단위) — 슬라임·오우거처럼 무거운 단위는 같은 비중이라도
 * 머릿수가 적게 나온다. 순서는 브레젠험식 균등 인터리브다: 종별로 (배출수 + 0.5) / 총수가 가장 작은
 * 것을 계속 뽑으면 어느 구간을 잘라도 비율이 유지된다. **한 덩어리가 통째로 한 종이면 혼합이 안 보인다** */
function rosterFromMix(idx: number): string[] {
  const w = WAVES[idx];
  const counts: [string, number][] = [];
  // `?amph=p` / `?air=q` / `?siege=r` / `?runner=n` / `?armor=a` / `?skirm=s` / `?swarm=w` /
  // `?support=u` / `?variant=v`: 기존 비중을 (100−…)%로 누르고 남은 몫을 각 유형에 균등 분배
  // (총 비중 100 유지 = 예산 총량 불변, 갈리는 것은 조성뿐이다). 아홉을 함께 켤 수도 있다
  const p = Math.min(90, Math.max(0, qaAmphPct));
  const q = Math.min(90, Math.max(0, qaAirPct));
  const g = Math.min(90, Math.max(0, qaSiegePct));
  const rn = Math.min(90, Math.max(0, qaRunnerPct));
  const am = Math.min(90, Math.max(0, qaArmorPct));
  const sk = Math.min(90, Math.max(0, qaSkirmPct));
  const sw = Math.min(90, Math.max(0, qaSwarmPct));
  const su = Math.min(90, Math.max(0, qaSupportPct));
  const vr = Math.min(90, Math.max(0, qaVariantPct));
  const keep = Math.max(0, 100 - p - q - g - rn - am - sk - sw - su - vr);
  const mix: Record<string, number> = {};
  // **진영 로테이션** (§0.6 D). 조성표의 키는 «역할 슬롯»이고 진영이 그 자리에 세울 종을 정한다 —
  // 비중(`v`)은 그대로라 예산 총량도 몫의 비율도 안 흔들리고, 머릿수만 `budgetUnits()`가 다시 편다.
  // ⚠ **QA 조성(`?amph=`…)은 이 뒤에 얹힌다** — 그쪽은 「이 종을 강제로 세운다」는 명시 지시라
  // 진영이 다시 갈아 끼우면 안 된다(같은 종이 나오면 비중이 합쳐질 뿐 정상이다)
  const fid = factionOfWave(idx);
  for (const [k, v] of Object.entries(w.mix as Record<string, number>)) {
    const kind = factionKind(fid, k);
    mix[kind] = (mix[kind] ?? 0) + (v * keep) / 100;
  }
  if (p > 0) for (const k of AMPHIB_MIX) mix[k] = (mix[k] ?? 0) + p / AMPHIB_MIX.length;
  if (q > 0) for (const k of AIR_MIX) mix[k] = (mix[k] ?? 0) + q / AIR_MIX.length;
  if (g > 0) for (const k of SIEGE_MIX) mix[k] = (mix[k] ?? 0) + g / SIEGE_MIX.length;
  if (rn > 0) for (const k of RUNNER_MIX) mix[k] = (mix[k] ?? 0) + rn / RUNNER_MIX.length;
  if (am > 0) for (const k of ARMOR_MIX) mix[k] = (mix[k] ?? 0) + am / ARMOR_MIX.length;
  if (sk > 0) for (const k of SKIRM_MIX) mix[k] = (mix[k] ?? 0) + sk / SKIRM_MIX.length;
  if (sw > 0) for (const k of SWARM_MIX) mix[k] = (mix[k] ?? 0) + sw / SWARM_MIX.length;
  if (su > 0) for (const k of SUPPORT_MIX) mix[k] = (mix[k] ?? 0) + su / SUPPORT_MIX.length;
  if (vr > 0) for (const k of VARIANT_KINDS) mix[k] = (mix[k] ?? 0) + vr / VARIANT_KINDS.length;
  for (const [kind, weight] of Object.entries(mix)) {
    const n = Math.round((waveBudget(idx) * weight) / 100 / budgetUnits(kind));
    if (n > 0) counts.push([kind, n]);
  }
  const total = counts.reduce((a, c) => a + c[1], 0);
  const out: string[] = [];
  const done = counts.map(() => 0);
  for (let i = 0; i < total; i++) {
    let bi = 0;
    let bv = Infinity;
    for (let j = 0; j < counts.length; j++) {
      if (done[j] >= counts[j][1]) continue;
      const v = (done[j] + 0.5) / counts[j][1];
      if (v < bv) {
        bv = v;
        bi = j;
      }
    }
    done[bi]++;
    out.push(counts[bi][0]);
  }
  return out;
}

/** 편성 목록(`roster`)을 **투입 단위로 나눠 담는다** (§0.6 C1·C2).
 *
 * **적을 새로 만들지도, 예산을 다시 세지도 않는다** — 들어온 목록의 종별 수를 한 자리도 안 바꾸고
 * 「어느 종이 어느 대형에 속하는가」(`FORMATION_OF`)로 갈라 담을 뿐이다. 그래서 이 함수를 지워도
 * 웨이브의 물량·조성은 그대로이고 사라지는 것은 **모양**뿐이다.
 *
 * 대형 몫이 `COMPANY.min`(8)에 못 미치면 **부대를 안 세운다** — 3기짜리 「방진」은 화면에서
 * 부대로 안 읽히고, 그 셋이 대형 유지에 묶이면 오히려 접근이 느려진다(감독 등재값의 하한이 8인 이유).
 * 그 몫은 무소속으로 내려가 지금까지처럼 무리로 흩어져 온다. */
function buildPlan(roster: readonly string[], burst: number, gateU: number | null): PlanGroup[] {
  const buckets = new Map<FormationId, string[]>();
  const loose: string[] = [];
  for (const k of roster) {
    const id = FORMATION_OF[k];
    if (!id) {
      loose.push(k);
      continue;
    }
    const b = buckets.get(id);
    if (b) b.push(k);
    else buckets.set(id, [k]);
  }
  const groups: PlanGroup[] = [];
  // 대형 순서는 FORMATIONS의 선언 순서로 고정한다 — Map의 삽입 순서(= roster에 먼저 나온 종)를
  // 쓰면 같은 조성인데도 웨이브마다 부대 순서가 바뀌어 대조 컷이 재현되지 않는다
  for (const id of Object.keys(FORMATIONS) as FormationId[]) {
    const b = buckets.get(id);
    if (!b) continue;
    if (b.length < COMPANY.min) {
      loose.push(...b);
      continue;
    }
    // 상한(20)을 넘으면 **고르게** 쪼갠다 — 나머지를 마지막 부대에 몰면 8 미만이 나올 수 있다
    const k = Math.ceil(b.length / COMPANY.max);
    for (let i = 0; i < k; i++) {
      const a = Math.floor((b.length * i) / k);
      const z = Math.floor((b.length * (i + 1)) / k);
      groups.push({ form: id, kinds: b.slice(a, z), at: 0 });
    }
  }
  // 무소속은 지금까지와 같은 크기(웨이브의 `burst`)로 묶는다 = 흩어져 오는 무리의 리듬이 안 바뀐다
  for (let i = 0; i < loose.length; i += burst) groups.push({ form: null, kinds: loose.slice(i, i + burst), at: 0 });
  // **투입 시점은 부대와 무리를 섞어 편다** — 대형을 앞에 몰면 웨이브 전반이 통째로 부대가 되고
  // 후반이 통째로 잡몹이 된다. 창 안에 균등 배치하되 순서는 위에서 만든 순서 그대로다
  for (const [i, g] of groups.entries()) g.at = groups.length > 1 ? i / groups.length : 0;
  // **관문 웨이브 = 전면 정렬 진군** (§0.6 C6). 여기서 갈리는 것은 **부대의 `at`과 `u`뿐**이다 —
  // 목록도 종별 수도 무소속 무리의 리듬도 위에서 이미 정해졌고 한 자리도 안 바뀐다.
  //  · `at = 0`  → 부대가 **동시에** 선다(시차 투입의 반대)
  //  · `u`       → 한 부채꼴 안에 **줄을 맞춰** 선다(황금비 도약의 반대 = 사방으로 흩는 힘을 끈다)
  //  · `back`    → 후열(궁병 열·지원 후미)이 전열 **뒤**에 선다(iter84 ⑧ⓐ가 C6에 넘긴 자리)
  // **무소속 무리는 안 건드린다** — 관문에서도 잡몹은 흩어져 오는 것이 맞고(§0.6 C2 무소속 문면),
  // 무엇보다 전부 at=0으로 몰면 `fieldCap` 한 프레임에 걸려 대열이 두 동강 난다(함정 목록)
  if (gateU !== null) {
    const front = groups.filter((g) => g.form && FORMATIONS[g.form].back === 0);
    const rear = groups.filter((g) => g.form && FORMATIONS[g.form].back > 0);
    for (const [rank, wide, back] of [
      [front, GATE.lineMax, 0],
      [rear, GATE.rearMax, GATE.rankGap],
    ] as [PlanGroup[], number, number][]) {
      // 한 «파»에 `wide`개까지 나란히 세우고 넘치면 다음 파로 민다 — 파 수가 곧 창 안의 시차다
      const lanes = Math.min(rank.length, wide);
      const waves = Math.ceil(rank.length / Math.max(1, wide));
      for (const [k, g] of rank.entries()) {
        const lane = k % wide;
        const w = Math.floor(k / wide);
        // 첫 파만 at 0(= 웨이브 개시와 동시에 «쫙 깔린 채» 선다). 뒤 파는 창 안에 균등 배치한다
        g.at = waves > 1 ? w / waves : 0;
        g.lane = { i: lane, n: lanes };
        if (back) g.back = back;
      }
    }
    // **투입 시각 순으로 다시 세운다** — 스케줄러는 `plan`을 **앞에서부터** 훑다가 시각이 안 된
    // 그룹에서 멈추므로(그 자리가 `fieldCap` 대기열과 같은 문이다), 배열 순서와 `at` 순서가
    // 어긋나면 뒤에 있는 «첫 파» 부대가 다음 파를 기다리며 서 있게 된다.
    // JS의 sort는 안정 정렬이라 같은 파 안의 순서(= 부채꼴 왼쪽부터)는 그대로 남는다
    groups.sort((a, b) => a.at - b.at);
  }
  return groups;
}

/** 웨이브를 시작한다 — 편성을 펴고 스폰 진행도·웨이브 시간을 리셋한다.
 * **`f.t`(절대 시간)는 건드리지 않는다** — 감독 #11 ①로 웨이브가 겹치므로 이전 웨이브의 적이
 * 살아 있는 채로 여기 들어온다. 리셋하는 것은 스폰 스케줄이 쓰는 `f.waveT`뿐이다 */
export function startWave(f: Field, idx: number): void {
  f.waveIdx = idx;
  f.spawned = 0;
  f.waveT = 0;
  // **정찰 드론 정산** (§8.⑤ "생존 시간에 비례해 다음 웨이브 강화"). 지난 웨이브에 쌓인 값을
  // 이번 웨이브의 배수로 넘기고 비운다 — 누적이 아니라 **한 웨이브짜리**다(방치를 만회할 창이 있어야 한다)
  f.scoutBuff = f.scoutBuild;
  f.scoutBuild = 0;
  // **진영** (§0.6 D) — 조성을 펴기 **전에** 굳힌다(`rosterFromMix`가 같은 값을 다시 유도한다).
  // 갈렸는가는 여기서만 알 수 있다 — `startWave`가 웨이브 개시의 유일한 문이다
  const prevFaction = f.faction;
  f.faction = factionOfWave(idx);
  // QA 오버라이드 우선순위: ?wave=(적종) → ?dense=(개체 수) → WAVES의 mix 편성
  const base = f.kinds ?? rosterFromMix(idx);
  const n = f.waveQa?.count ?? (f.kinds ? waveBudget(idx) : base.length);
  f.roster = Array.from({ length: n }, (_, i) => base[i % base.length]);
  // **부대 편성** (§0.6 C1). roster를 그릇에 나눠 담을 뿐 물량·조성은 안 건드린다.
  // 지난 웨이브의 부대는 살아 있으면 그대로 둔다 — 감독 #11 ①로 웨이브가 겹치기 때문이다
  // **관문이면 대열의 방향을 먼저 정한다** (§0.6 C6). 웨이브 번호에서 유도하므로 `f.rnd()`를
  // 안 쓴다 — 스폰 좌표 스트림을 한 칸 밀면 그 뒤 모든 웨이브의 스폰 위치가 통째로 갈려
  // STATUS의 실측값이 전부 무효가 된다(bobPhase·lane과 같은 함정).
  //
  // ⚠ **6n(보스)만이다 — 3n(중간보스)은 «격을 낮춘 같은 문법»(§0.6 B5)으로 남긴다.** §0.6 C6의
  // 문면은 3n도 관문이라 부르지만, iter87이 3n까지 정렬시켰다가 **9 seed 풀런에서 완주가 7/9로
  // 깨졌다**(s17이 웨이브 3에서 죽는다 — 코어 100 전부를 잡몹이 가져간다). 3n이 만나는 것은
  // 스테이지 1~2의 편성이고, 한 정면에서 통째로 오는 대열은 그 화력이 감당할 그림이 아니다.
  // 불변식(BALANCE §0.6 ①)이 정본 «문면»보다 위라 6n으로 좁혔다 — 감독 판단은 미결 질문에 남긴다
  const gate = qaGate && isBossWave(idx + 1);
  // 관문 순번(웨이브 6·12·18… = 0·1·2…)으로 정면 목록을 돈다
  f.gateU = gate ? GATE.fronts[bossIndex(idx + 1) % GATE.fronts.length] : null;
  f.plan = buildPlan(f.roster, f.waveQa?.burst ?? WAVES[idx].burst, f.gateU);
  f.planAt = 0;
  // 맵 보스는 편성(roster) 밖이다 (DESIGN §3 · BALANCE §5 "HP 합 ~5,000 + 보스 1,500").
  // roster에 넣으면 §6 예산을 두 번 세게 되고, ?wave= QA 오버라이드에 보스가 통째로 지워진다
  // **이벤트 관문**(네크로맨서 · §0.7 K · 감독 #72 ⑤)이 «먼저» 선다 — 자리(18·36)가 6n 안으로
  // 들어왔으므로 이제 두 술어가 **같은 웨이브에서 함께 참**이다. 둘 중 하나만 서야 하는 이유:
  // 링 보스와 구석 시전자가 함께 나오면 그 관문에 보스가 둘이 되고 §6 예산이 두 번 세어진다.
  // **이벤트가 이긴다** — 그 자리의 얼굴을 `bossKindAt`이 이미 네크로맨서로 준다.
  f.eventPending = f.eventWave = qaEvent && isEventWave(idx + 1);
  f.bossPending = isBossWave(idx + 1) && !f.eventPending;
  // 중간보스도 같은 이유로 roster 밖이다 (balance.ts MID 주석). 6n은 보스가 가져가므로 배타적이다
  f.midPending = qaMid && isMidWave(idx + 1);
  // **관문 배너** (§0.6 B5 "보스 웨이브임을 알 수 없다"). 웨이브가 열리는 이 한 곳에서만 선다 —
  // 스폰 쪽에 두면 보스가 링에 나타나는 프레임에 뜨는데, 그때는 이미 «모르고 들어선 뒤»다.
  // 중간보스는 **격을 낮춘 같은 문법**이라 같은 자리에서 `boss: false`로 선다
  if (f.eventPending) {
    // **이벤트 관문의 배너** (§0.7 K "관문 배너와 구분되는 문구·색" + 감독 #72 ⑤ 보스화).
    // 판은 관문과 **같은 것**을 쓰고(§0.6 B5의 문법이 화면에 한 벌만 있어야 한다) 갈리는 것은
    // `label`·`ink` 둘뿐이다. ⚠ **`boss: true`로 올린다** — 이제 이 자리가 관문이고, 비네트·하단
    // 표기(「STAGE n — 보스」)가 이미 6n을 보므로 배너만 EVENT 색이면 화면이 두 말을 한다.
    // 문구는 그대로 EVENT다: 「같은 격의 «다른 종류»」가 이 한 칸에서 읽혀야 한다
    f.banner = { name: gateName(NECRO.kind), boss: true, t: 0, label: "EVENT", ink: HUD.eventInk };
  } else if (f.bossPending) {
    f.banner = { name: gateName(qaBossKind ?? bossFaceAt(bossIndex(idx + 1), qaEvent)), boss: true, t: 0 };
  } else if (f.midPending) {
    f.banner = { name: gateName(midKindAt(midIndex(idx + 1))), boss: false, t: 0 };
  } else if (idx > 0 && f.faction !== prevFaction) {
    // **진영 교대 배너** (§0.6 D). 관문 배너와 **같은 판**을 쓴다 — 「이번 웨이브가 여느 때와 다르다」의
    // 표기는 화면에 한 문법만 있어야 한다. 관문과 겹치지 않는다: 교대는 스테이지 4n+1의 첫 웨이브
    // (13·25·37·49)에서만 나고 그중 6n은 하나도 없다
    f.banner = { name: FACTIONS[f.faction].name, boss: false, t: 0, label: "NEW FACTION", ink: FACTIONS[f.faction].ink };
  } else f.banner = null;
}

/** 정차 해제 = 상점의 「출발」 (DESIGN §3). 다음 스테이지의 첫 웨이브를 연다 —
 * 정차는 스테이지 경계에서만 생기므로 `waveIdx + 1`은 항상 존재한다 */
export function depart(f: Field): void {
  if (!f.station) return;
  f.station = false;
  // QA `?stop=N`: 스테이지 안에 낀 정차라면 원래 그 자리였던 카드를 지금 연다 (다음 웨이브는 카드가 연다)
  if (f.cardAfter) {
    f.cardAfter = false;
    f.card = true;
    return;
  }
  startWave(f, f.waveIdx + 1);
}

/** 카드 선택 완료 = 다음 웨이브 개시 (DESIGN §7.2). 카드는 **스테이지 안**의 전환에서만 열리므로
 * `waveIdx + 1`은 항상 같은 스테이지의 다음 웨이브다. 카드에 스크랩 비용이 없어(§7.2) 여기서
 * 재화를 건드릴 일도 없다 — 효과 적용은 cards.ts의 몫이고 이 함수는 시간을 다시 흐르게 할 뿐이다 */
export function pickedCard(f: Field): void {
  if (!f.card) return;
  f.card = false;
  // 정차 직전 카드(스테이지 3번째 자리)는 웨이브를 열지 않는다 — 대기 간격(`f.gap`)이 이미 돌고 있고
  // 그게 0이 되는 프레임에 정차가 선다. 다음 웨이브는 상점의 「출발」이 연다
  if (f.cardToStation) {
    f.cardToStation = false;
    return;
  }
  startWave(f, f.waveIdx + 1);
}

/** 개체 1기를 필드에 올린다. 웨이브 스폰과 분열(§8.⑦)이 함께 쓴다 —
 * `f.spawned`(웨이브 진행도)는 여기서 올리지 않는다. 분열체는 웨이브 스폰 수가 아니기 때문이다 */
/** (x, y) → (tx, ty) 단위벡터. 도약 목표를 향할 때 쓴다 (§8.④) */
function unitTo(x: number, y: number, tx: number, ty: number): { x: number; y: number } {
  const l = Math.hypot(tx - x, ty - y) || 1;
  return { x: (tx - x) / l, y: (ty - y) / l };
}

/** 코어를 향한 단위벡터 (성벽 파괴 직진 — §8 오우거) */
function unitToCore(map: GameMap, x: number, y: number): { x: number; y: number } {
  const l = Math.hypot(map.cx - x, map.cy - y) || 1;
  return { x: (map.cx - x) / l, y: (map.cy - y) / l };
}

/** 이탈 방향 = 코어의 반대 (§8.⑥ 폭파공작원 "설치 후 이탈"). 온 길을 되짚지 않고 그냥 바깥으로
 * 곧게 나간다 — 목표가 코어 하나인 것과 같은 이유로 «되돌아가는 길»도 하나면 충분하다 */
function awayFromCore(map: GameMap, x: number, y: number): { x: number; y: number } {
  const u = unitToCore(map, x, y);
  return { x: -u.x, y: -u.y };
}

/** **재배치 방향** = 코어를 도는 접선 (§8.③ 머스킷 도적). 코어까지의 거리가 안 바뀌므로
 * 「산병은 레일에 안 닿음」(BALANCE §1)이 이 적에게도 그대로 성립한다 — 앞으로 걷게 하면
 * 재배치가 «조금씩 다가오는 러너»가 되어 유형이 바뀐다.
 * 도는 방향은 개체마다 고정된 `lane`의 부호다(난수를 새로 뽑으면 스폰 좌표 스트림이 밀린다) */
function tangentAroundCore(map: GameMap, e: Enemy): { x: number; y: number } {
  const u = unitToCore(map, e.x, e.y);
  const s = e.lane >= 0 ? 1 : -1;
  return { x: -u.y * s, y: u.x * s };
}

/** **이벤트 보스가 서는 맵 구석** (§0.7 K ①). 이벤트 순번으로 **왼쪽 두 모서리**를 번갈아 쓴다 —
 * 웨이브 20과 40이 같은 자리에 서면 두 번째가 「또 저기」가 되고, 난수로 고르면 스폰 좌표
 * 스트림이 밀린다(포효·분열과 같은 함정).
 *
 * ⚠ **오른쪽 두 모서리는 못 쓴다** — 카메라가 맵 전체를 화면에 넣으므로(줌아웃 1/`mapScale`)
 * 구석은 언제나 화면 «안»이지만, 오른쪽 끝은 **불투명한 HUD 패널 뒤**다(`hud.ts gateVisible`의
 * `underPanel`). §0.7 K ②가 「시전 자체가 예고로 화면에 읽혀야 한다」를 요구하므로 패널 뒤에서
 * 시전하는 자리는 그 문면을 못 지킨다. 상단 웨이브 박스는 중앙이라 왼쪽 모서리를 안 가린다.
 *
 * 여백은 짧은 변 대비 `NECRO.cornerIn`이라 맵 크기가 바뀌어도 「구석」이 그대로 따라온다 */
function eventCorner(map: GameMap, wave1: number): { x: number; y: number } {
  const m = Math.min(map.w, map.h) * NECRO.cornerIn;
  const n = Math.max(0, NECRO.waves.indexOf(wave1));
  return { x: map.cx - (map.w / 2 - m), y: map.cy + (n % 2 === 0 ? -1 : 1) * (map.h / 2 - m) };
}

/** 스폰 링 반경 — 이탈한 공작원이 «맵 밖으로 나갔다»고 보는 거리 (ringPoint의 기본 반경과 같은 식) */
function ringR(map: GameMap): number {
  return map.outerR + ENEMY.baseSpeed * ENEMY.approachSec;
}

/** 파괴 직진 적이 **부술 수 없는** 차단 지형(호수 = hp Infinity)에 눌려 있는가.
 * 성벽은 부수면 길이 열리지만 호수는 안 열리므로, 이때만 플로우필드로 우회한다.
 * 여유(6)는 밀어내기가 개체를 정확히 t.r + radius에 세우기 때문에 필요하다 — 0이면 판정이 경계에서 떤다 */
function pinnedByUnbreakable(map: GameMap, x: number, y: number): boolean {
  return map.terrain.some(
    (t) =>
      blocksMovement(t) &&
      !Number.isFinite(t.hp) &&
      Math.hypot(x - t.x, y - t.y) < t.r + ENEMY.radius + 6
  );
}

/** **부대 앵커의 정면**에 닿아 있는 부술 수 있는 차단 지형(§0.6 C5 공성 종대 돌파).
 * 개체용 `breakableAhead`와 갈리는 것 둘: ⓐ 「있나」가 아니라 **어느 것인가**를 돌려준다(표식·피해가
 * 그 한 장을 가리켜야 한다) ⓑ **정면 판정**이 붙는다 — 옆을 스치는 벽까지 물면 종대가 지나가던
 * 벽 앞에 서 버린다. 가장 가까운 한 장만 문다 */
function wallAhead(map: GameMap, x: number, y: number, dx: number, dy: number): Terrain | null {
  let best: Terrain | null = null;
  let bd = Infinity;
  for (const t of map.terrain) {
    if (!blocksMovement(t) || !Number.isFinite(t.hp)) continue;
    const ox = t.x - x;
    const oy = t.y - y;
    const d = Math.hypot(ox, oy) || 1;
    if (d > t.r + ENEMY.radius + SIEGE.reach || d >= bd) continue;
    if ((ox / d) * dx + (oy / d) * dy < SIEGE.facing) continue;
    best = t;
    bd = d;
  }
  return best;
}

/** (x, y)가 **부술 수 있는** 차단 지형(성벽) 안인가. 파괴 직진 적의 정지 판정용 */
function breakableAhead(map: GameMap, x: number, y: number, r: number): boolean {
  return map.terrain.some(
    (t) => blocksMovement(t) && Number.isFinite(t.hp) && Math.hypot(x - t.x, y - t.y) < t.r + r
  );
}

export function spawnEnemy(f: Field, kind: string, x: number, y: number, fx: number, fy: number, ring = false, undead = false): void {
  // 최대 HP는 스폰 시점에 굳는다 — 보스는 주기 강화(BOSS.hpStep)를 타므로 종(kind)만으로는 못 정한다.
  // 광폭화·포효 문턱과 HP바가 전부 이 값을 분모로 쓴다 (maxHpOf를 다시 부르면 문턱이 밀린다)
  // **정찰 드론의 「다음 웨이브 강화」가 여기서 실현된다** (§8.⑤). 스폰 시점에 굳는 값이라
  // 웨이브 도중에 배수가 바뀌어도 이미 태어난 개체는 안 변한다 — 보스 주기 강화와 같은 규약이다.
  // 보스·중간보스도 함께 탄다: 드론을 방치한 대가가 그 웨이브의 관문에서 가장 무겁게 와야 한다
  // **웨이브 성장 곡선**(§0.7 H1 지수 + §0.9 선형)이 여기서 얹힌다 — 잡몹·엘리트만이고 관문(보스·
  // 중간보스)은 자기 순번 곡선을 이미 갖고 있어 둘 다 안 탄다(`gate` 갈림 한 곳이 그 규약의 자리다).
  // 스폰 시점에 굳는 것은 드론 강화·보스 주기 강화와 같은 규약이다
  const gate = isBossKind(kind) || isMidKind(kind);
  const maxHp = maxHpOf(
    kind,
    isBossKind(kind) ? bossIndex(f.waveIdx + 1) : isMidKind(kind) ? midIndex(f.waveIdx + 1) : 0
  ) * (1 + f.scoutBuff) * (gate ? 1 : waveHpMult(f.waveIdx) * waveLinMult(f.waveIdx)
    * (f.waveIdx + 1 >= LATE_PRESSURE.fromWave ? LATE_PRESSURE.hp : 1)) * earlyHpMult(f.waveIdx);
  if (ENEMY_STATS[kind].frontShield !== undefined) f.guardsMade++;
  // 해금 로그(감독 #72 ④) — 첫 등장 웨이브만 남긴다. 여기가 «모든» 스폰이 지나는 유일한 문이다
  if (f.kindFirstWave[kind] === undefined) f.kindFirstWave[kind] = f.waveIdx + 1;
  if (ring) {
    const a = Math.atan2(y - f.cy, x - f.cx);
    f.spawnOct[octOf(a)]++;
    f.spawnQuad[quadOf(a)]++;
  }
  f.list.push({
    kind,
    hp: maxHp,
    maxHp,
    x,
    y,
    faceX: fx,
    faceY: fy,
    firing: false,
    bornT: f.t,
    railT: null,
    blocked: false,
    everBlocked: false,
    slow: 1,
    everSlowed: false,
    buffed: false,
    everBuffed: false,
    flash: 0,
    hurt: 0,
    wave: f.waveIdx,
    bobPhase: (x * 0.13 + y * 0.07) % (Math.PI * 2),
    // 좌표에서 유도한 의사난수 레인. 근처에서 태어난 개체끼리도 부호가 갈려야 무리가 갈라진다 —
    // 그래서 좌표를 그대로 쓰지 않고 sin으로 흩은 소수부를 쓴다
    lane: ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1 * 2 - 1,
    ring,
    bornA: Math.atan2(y - f.cy, x - f.cx),
    // §0.7 K — 부활체 플래그와 무적. 부활체는 **웨이브 성장 곡선을 이미 탄 뒤**의 개체가 아니라
    // 지금 웨이브의 눈금으로 새로 태어난다(원본이 죽은 웨이브의 HP를 되살리려면 무덤이 그 값을
    // 들고 있어야 하는데, 그러면 「시체밭」이 값 저장소가 된다 — §8.⑦ 재소환과 같은 규약으로 둔다)
    undead,
    // 네크로맨서는 **무적으로 태어난다** (§0.7 K ① 등장). 푸는 것은 부활 발동 하나뿐이다
    invuln: isEventKind(kind),
    atCore: false,
    breakCd: 0,
    breaking: false,
    coreCd: 0,
    roars: 0,
    raged: false,
    roarFx: 0,
    // 패턴은 **쿨을 다 채우고** 시작한다 — 스폰 프레임에 예고가 뜨면 §5.0의 접근 창(5~8초)이
    // 관문에서만 사라진다(도약 `leapCd`·산란 `breedCd`와 같은 규약)
    patCd: (BOSS_PATTERNS[kind] ?? []).map((q) => q.cd),
    patIdx: -1,
    patT: 0,
    patActing: false,
    patAim: null,
    vEase: 1,
    entered: false,
    faceAng: Math.atan2(fy, fx),
    // 첫 도약은 쿨을 다 채우고 시작한다 — 스폰하자마자 뛰면 §5.0 "등장 즉시 교전 금지"의 접근 시간이
    // 첫 웨이브부터 반토막 난다
    everSwam: false,
    leapCd: ENEMY_STATS[kind].leap?.everySec ?? 0,
    leapTo: null,
    leapT: 0,
    cargo: ENEMY_STATS[kind].cargo?.n ?? 0,
    grabbing: null,
    perched: null,
    boomed: false,
    everCrossed: false,
    fleeing: false,
    fuseT: ENEMY_STATS[kind].fuse?.sec ?? 0,
    // 재기동 여부는 **여기서 굳는다** (§8.① 해골 보병). `lane`과 같은 좌표 해시를 쓰되 상수를 달리해
    // 두 값이 상관되지 않게 한다 — f.rnd()를 뽑으면 스폰 좌표 스트림이 통째로 밀린다
    revives:
      ENEMY_STATS[kind].revive !== undefined &&
      ((Math.sin(x * 39.3467 + y * 11.135) * 24634.6345) % 1 + 1) % 1 < ENEMY_STATS[kind].revive!.chance
        ? 1
        : 0,
    // 회복 총량은 **스폰 시점에 굳는다** (§8.② 트롤). `maxHp` 기준이라 정찰 드론 버프·주기 강화가
    // 얹힌 개체는 회복 몫도 그만큼 함께 커진다 = «바 한 장을 더 채운다»가 어느 웨이브에서도 같다
    regenPool: ENEMY_STATS[kind].regen ? maxHp * ENEMY_STATS[kind].regen!.pool : 0,
    regenBlock: 0,
    repositioning: false,
    repoT: 0,
    everFired: false,
    hidden: false,
    // 첫 산란·재소환은 **쿨을 다 채우고** 시작한다 — 태어나자마자 낳으면 §5.0 "등장 즉시 교전 금지"의
    // 접근 창이 이 종에게만 통째로 사라진다(독개구리의 `leapCd`와 같은 규약)
    breedCd: ENEMY_STATS[kind].spawner?.everySec ?? ENEMY_STATS[kind].raise?.everySec ?? 0,
    bred: 0,
    hits: 0,
    critHits: 0,
    hitKind: "",
    hitDsg: false,
    spores: 0,
    // 회복·방벽의 **평생 총량**은 트롤의 `regenPool`과 같이 스폰 때 굳는다 — §0.5(enemyHpMult())를
    // 함께 태우지 않으면 난이도 배율이 바뀔 때 «되돌리는 몫»만 조용히 상대적으로 줄어든다
    aidPool:
      (ENEMY_STATS[kind].heal?.pool ?? ENEMY_STATS[kind].banner?.pool ?? 0) * enemyHpMult(),
    domed: false,
    wardBy: null,
    rageT: 0,
    rageMul: 1,
    // 첫 연막도 **쿨을 다 채우고** 나온다(산란과 같은 규약 — §5.0 "등장 즉시 교전 금지")
    smokeCd: ENEMY_STATS[kind].smoke?.everySec ?? 0,
    // 소속은 **여기서 정하지 않는다** (§0.6 C1). 이 함수는 분열·소환·화물·설치물이 함께 쓰는
    // 공용 출구라 그쪽 개체는 전부 무소속이 맞다 — 부대원은 `releaseCompany`가 태어난 직후에 채운다
    co: -1,
    pinned: false,
    slot: 0,
    cmdr: false,
    // **실드 총량도 스폰 시점에 굳는다** (§0.6 C3 ⓑ) — `regenPool`·`aidPool`과 같은 규약이다.
    // maxHp를 타므로 §0.5 적HP 배율도 정찰 드론의 다음 웨이브 강화도 저절로 함께 실린다
    shield: ENEMY_STATS[kind].frontShield !== undefined ? maxHp * SHIELD.pool : 0,
    shieldT: 0,
  });
}

/** **클릭 해체 반경**(월드, §8.⑥). 폭탄 표시 크기(16.5)보다 넉넉해야 «누르면 꺼진다»가 손에 잡힌다 —
 * 조준 포격이 좌표를 정확히 안 요구하는 것과 같은 이유다. 판정 반경이지 밸런스 값이 아니라 여기 둔다 */
const DEFUSE_R = 26;

/** **폭탄 클릭 해체** (§8.⑥ "폭탄은 사격·클릭으로 해체 가능"). 조준 포격에 이은 **두 번째
 * «플레이어의 손»**이다 — main.ts의 pointerdown이 포격보다 **먼저** 이것을 보고, 해체가 성립하면
 * 그 클릭은 포격으로 새지 않는다(폭탄 위 클릭의 뜻은 하나여야 한다).
 * 가장 가까운 한 발만 지운다: 겹친 폭탄 두 개가 한 클릭에 같이 꺼지면 «한 번에 하나»가 깨진다.
 * 처치가 아니므로 드랍도 처치 수도 붙지 않는다 — 시체만 남긴다(사라진 것이 보여야 한다) */
export function defuseBomb(f: Field, x: number, y: number): boolean {
  let best: Enemy | null = null;
  let bd = DEFUSE_R;
  for (const e of f.list) {
    if (!ENEMY_STATS[e.kind].fuse) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > bd) continue;
    bd = d;
    best = e;
  }
  if (!best) return false;
  f.defused++;
  addCorpse(f, best);
  f.list = f.list.filter((e) => e !== best);
  return true;
}

/** 적의 표시 크기(월드). 분열체는 슬라임 시트 한 장을 scale로 줄여 쓴다 */
export function enemyH(kind: string): number {
  return ENEMY.size * (ENEMY_STATS[kind].scale ?? 1);
}

/** 적을 **그리는 순서** — 화면 아래(y가 큰 쪽 = 앞줄)일수록 **나중에** 그린다 (§0.6 C2 「밀집 3열」).
 *
 * 왜 필요한가: 개체 루프가 `f.list`(= **스폰 순서**)를 그대로 돌면 밀집 대형에서 **뒷줄이 앞줄을 덮는다**.
 * 부대는 통째로 태어나므로 한 부대의 스폰 순서 = 슬롯 순서이고, 그 순서는 깊이와 아무 관계가 없다 —
 * 그래서 방진·궁병 열이 화면에서 «줄»이 아니라 «뭉치»로 읽혔다(iter95 목업 대조).
 * 여러 패스(꺾쇠·실드 호·돔)가 「개체 루프 안에 그리면 앞줄이 덮는다」로 이미 밖으로 빠져 나온 것이
 * 같은 고장의 다른 얼굴이다 — 그 패스들은 **오버레이라 그대로 둔다**(적 «위»가 맞다).
 *
 * ⚠ **`f.list`를 정렬하면 안 된다.** 목록 순서는 스폰 스케줄러·표적 선택·분열·저장이 함께 보는
 * **시뮬 상태**다(`bobPhase`·`lane`과 같은 부류) — 정렬하는 순간 판정이 갈린다. 사본을 정렬한다.
 * `sort`는 안정 정렬이라 y가 같은 개체는 목록 순서를 지킨다(= 재현성).
 *
 * **공중은 y와 무관하게 마지막이다** (§8.⑤) — 날고 있는 것을 지상 개체가 덮으면 «떠 있다»가 깨진다. */
const drawBuf: Enemy[] = [];
export function drawOrder(f: Field): readonly Enemy[] {
  drawBuf.length = 0;
  for (const e of f.list) drawBuf.push(e);
  if (qaYSort) drawBuf.sort((a, b) => airRank(a) - airRank(b) || a.y - b.y);
  return drawBuf;
}
const airRank = (e: Enemy): number => (ENEMY_STATS[e.kind].air ? 1 : 0);

/** 이 적이 **걷는 중**인가 = 바운스를 줄지 (감독 #5 V3). 멈춘 적을 흔들면 "멈췄다"가 안 읽힌다 */
export function isEnemyWalking(e: Enemy): boolean {
  return !e.firing && !e.atCore && !e.blocked && !e.breaking && e.perched === null && (actorMotion.get(e)?.moving ?? false);
}

type ActorMotion = { x: number; y: number; phase: number; moving: boolean; actionAt: number; action: ActionEvent["action"] | null; attemptedAt: number; lastByAction: Partial<Record<ActionEvent["action"], number>> };
const actorMotion = new WeakMap<Enemy, ActorMotion>();
function motionOf(e: Enemy): ActorMotion {
  let m = actorMotion.get(e);
  if (!m) {
    m = { x: e.x, y: e.y, phase: e.bobPhase, moving: false, actionAt: -Infinity, action: null, attemptedAt: -Infinity, lastByAction: {} };
    actorMotion.set(e, m);
  }
  return m;
}

function actionCadence(e: Enemy, action: ActionEvent["action"] | null): number {
  return action === "heal" ? 1.2 : action === "buff" ? 1.8 : ENEMY_MOTION[e.kind].cadence;
}

/** Actual gameplay actions drive presentation. Continuous DPS is grouped into readable strikes;
 * no cooldown, HP, velocity, collision or simulation RNG is changed here. */
export function markEnemyAction(e: Enemy, time: number, action: ActionEvent["action"]): void {
  const m = motionOf(e);
  const cadence = actionCadence(e, action);
  const continuous = action === "melee" || action === "shot" || action === "spit" || action === "heal" || action === "buff";
  if (action === m.action) m.attemptedAt = time;
  if (continuous && time - (m.lastByAction[action] ?? -Infinity) < cadence) return;
  m.lastByAction[action] = time;
  m.actionAt = time; m.action = action; m.attemptedAt = time;
  emitAction({ source: "enemy", kind: e.kind, action, x: e.x, y: e.y });
}

/** Read-only snapshot for the motion QA harness. */
export function enemyMotionState(e: Enemy, time: number): { moving: boolean; phase: number; frame: number; action: ActionEvent["action"] | null; actionAt: number } {
  const m = motionOf(e), p = ENEMY_MOTION[e.kind];
  const reduced = getEffectSettings().reducedMotion;
  const st = ENEMY_STATS[e.kind];
  const q = e.patIdx >= 0 && !e.patActing ? BOSS_PATTERNS[e.kind]?.[e.patIdx] : undefined;
  const flies = st.air && e.perched === null;
  const nextHit = e.breaking && st.breaker ? e.breakCd : (e.firing || e.atCore) && st.coreHit ? e.coreCd : Infinity;
  const tell = q ? Math.max(0.01, e.patT / q.tell) : nextHit > 0 && nextHit < 0.22 ? 1 - nextHit / 0.22 : 0;
  const phase = flies ? time * (p.rig === "winged" ? 9 : 13) + e.bobPhase : m.phase;
  // Ground idle poses stay planted. Hovering wings keep beating until they perch.
  const frame = reduced ? 0 : motionFrame(phase, Boolean(flies) || isEnemyWalking(e), time - m.actionAt,
    actionCadence(e, m.action), tell, time - m.attemptedAt < 0.08);
  return { moving: isEnemyWalking(e), phase, frame, action: m.action, actionAt: m.actionAt };
}

/** Advance footfalls by actual displacement after collision/separation, never by wall clock. */
function updateActorMotion(f: Field, dt: number): void {
  for (const e of f.list) {
    const m = motionOf(e);
    const d = Math.hypot(e.x - m.x, e.y - m.y);
    m.moving = d > dt * 0.8;
    if (m.moving && !e.blocked && !e.firing && !e.atCore && !e.breaking) m.phase += d / (Math.min(enemyH(e.kind), ENEMY.size * 1.25) * 0.18) * ENEMY_MOTION[e.kind].pace;
    m.x = e.x; m.y = e.y;
    actorMotion.set(e, m);
  }
}

/** 사망 잔상을 남긴다. 처치 처리(combat.ts)가 적을 리스트에서 빼기 직전에 부른다 */
export function addCorpse(f: Field, e: Enemy): void {
  f.corpses.push({
    sprite: ENEMY_STATS[e.kind].sprite ?? e.kind,
    x: e.x,
    y: e.y,
    h: enemyH(e.kind),
    flip: e.faceX < 0,
    t: 0,
  });
}

/** (x, y)가 **물 위**인가 (§8.④). 수륙양용의 수중 가속·밀어내기 면제가 이 판정을 함께 쓴다 */
function inWaterAt(map: GameMap, x: number, y: number): boolean {
  return map.terrain.some((t) => isWater(t) && !t.destroyed && Math.hypot(x - t.x, y - t.y) < t.r);
}

/** (x, y)가 **웅덩이 위**인가 (§8.② 장갑 트럭). `inWaterAt`(호수+웅덩이)과 갈라 두는 이유:
 * 지상 적은 호수에 들어갈 수 없으므로(blocksMovement) 실측상 같은 값이 나오지만, «수렁에 빠진다»는
 * 판정이 호수까지 포함하면 나중에 호수를 통과하는 지상 적이 생겼을 때 조용히 뜻이 바뀐다 */
function onPondAt(map: GameMap, x: number, y: number): boolean {
  return map.terrain.some((t) => t.kind === "pond" && !t.destroyed && Math.hypot(x - t.x, y - t.y) < t.r);
}

/** **고정 출현 자리** (§8.④ 심연 촉수). 호수 중에서 레일에 가장 가까운 것을 골라, 그 호수의
 * **레일 쪽 물가**에 세운다 — 호수 한복판에 세우면 사거리(grab.r) 안에 레일이 안 들어와 이 적이
 * 아무 일도 안 한다. 개체마다 물가를 따라 접선 방향으로 어긋나게 놓는다(겹침 분리에 밀리지 않게).
 *
 * ⚠ **호수가 없는 맵(도시 · §0.7 J1-e)에서는 레일 바깥 어깨에 선다.** null로 되돌리면 링에 서는데,
 * 이 종은 **이속 0**이라 사거리 밖에 영원히 서 있고 웨이브가 안 닫힌다(이 함수의 옛 주석이 예고한
 * 자리다 — J1-e가 도시의 호수를 지우면서 실제로 열렸다). 자리는 **결정론**이라 `f.rnd()`를 안 뽑는다:
 * 뽑으면 스폰 좌표 스트림이 밀려 그 뒤 모든 웨이브의 위치가 갈린다.
 * ⚠ **「물 없는 맵의 자리」는 루프가 고른 것이지 정본이 아니다** — STATUS 미결 질문에 올려 뒀다 */
function lakeSpot(map: GameMap, i: number): { x: number; y: number } | null {
  let best: { x: number; y: number; r: number } | null = null;
  let bd = Infinity;
  for (const t of map.terrain) {
    if (t.kind !== "lake") continue;
    const d = Math.abs(Math.hypot(t.x - map.cx, t.y - map.cy) - t.r - map.outerR);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  // **물이 없는 맵**: 서측(코어에서 왼쪽) 레일 바깥 어깨. 개체마다 접선으로 어긋나게 놓는 규칙은
  // 물가와 같다 — 이 종은 안 움직이므로 겹치면 영원히 겹친 채로 서 있다
  if (!best) {
    const rr = map.outerR + ENEMY.radius * 2;
    const a0 = Math.PI + (((i % 5) - 2) * ENEMY.radius * 3) / rr;
    return { x: map.cx + Math.cos(a0) * rr, y: map.cy + Math.sin(a0) * rr };
  }
  // 호수 중심 → 코어 방향의 물가에서 안쪽으로 한 걸음 (물 밖으로 나가면 amphib 면제가 안 걸린다)
  const a = Math.atan2(map.cy - best.y, map.cx - best.x);
  const rr = Math.max(0, best.r - ENEMY.radius * 2);
  const off = (i % 5) - 2;
  const spread = (off * ENEMY.radius * 3) / Math.max(1, rr);
  return { x: best.x + Math.cos(a + spread) * rr, y: best.y + Math.sin(a + spread) * rr };
}

/** 덩어리 하나를 링 위 한 점(u)에 놓는다. 적종이 여러 개면 덩어리 **안에서** 번갈아 넣는다 —
 * 한 덩어리가 통째로 한 종이면 혼합이 안 보인다 */
function spawnCluster(f: Field, map: GameMap, kinds: readonly string[], u: number): void {
  const n = kinds.length;
  const c = ringPoint(map, u);
  // 흩어짐은 **접선 + 바깥쪽으로만** (감독 #7 ②). 사각 링 시절의 정사각 지터는 무리의 절반을
  // 링 안쪽으로 밀어 접근 거리를 다시 벌렸고, 클램프가 걸린 대각 방향에서는 화면 안에 스폰됐다
  const ra = Math.atan2(c.y - map.cy, c.x - map.cx);
  const tx = -Math.sin(ra);
  const ty = Math.cos(ra);
  for (let i = 0; i < n; i++) {
    const kind = kinds[i];
    // **호수 고정 출현** (§8.④ 심연 촉수): 링 대신 물가에 선다. `ring = false`라 §5.0 접근 시간
    // 표본에 안 섞인다(분열체·포효 소환과 같은 규약). 맵에 호수가 없으면 링으로 되돌아간다
    if (ENEMY_STATS[kind].inWater) {
      const spot = lakeSpot(map, f.spawned);  // 물가 자리는 스폰 진행도로 순번을 돈다
      if (spot) {
        const a = Math.atan2(map.cy - spot.y, map.cx - spot.x);
        spawnEnemy(f, kind, spot.x, spot.y, Math.cos(a), Math.sin(a));
        f.spawned++;
        continue;
      }
    }
    const along = (f.rnd() - 0.5) * 2 * ENEMY.spawnSpread;
    const out = f.rnd() * ENEMY.spawnSpread * 0.5;
    const x = c.x + tx * along + Math.cos(ra) * out;
    const y = c.y + ty * along + Math.sin(ra) * out;
    const a = Math.atan2(map.cy - y, map.cx - x);
    spawnEnemy(f, kind, x, y, Math.cos(a), Math.sin(a), true);
    f.spawned++;
  }
}

/** 무리 스폰 (큐 1 "적 분포" — 감독 #5 V4 판정이 지목한 최대 격차).
 *
 * iter15까지는 무리 하나가 링의 **한 점**에서 통째로 들어왔고, 무리와 무리 사이의 u는 층화 추출로
 * 링을 한 방향으로 천천히 훑었다. 그 둘이 겹쳐 적 76기를 깔아도 화면이 "한 줄 행렬"이 됐다 —
 * 어느 순간에도 살아 있는 적의 진입 방향이 사실상 이웃한 한두 곳뿐이었기 때문이다.
 *
 * 여기서 두 층을 같이 편다: 무리를 `burstClusters`개 덩어리로 쪼개 `clusterArcU` 폭에 뿌리고(공간),
 * 무리 사이 u는 황금비로 도약시킨다(시간, 호출부). §5.0은 깨지지 않는다 — 링은 원형이라
 * **어느 u에서 들어와도 접근 거리가 같다**. 바뀌는 것은 방향뿐이고 시간은 그대로다. */
function spawnBurst(f: Field, map: GameMap, kinds: readonly string[], u: number): void {
  const n = kinds.length;
  const k = Math.min(ENEMY.burstClusters, n);
  let done = 0;
  for (let i = 0; i < k; i++) {
    // 덩어리 몫: 나머지를 앞쪽 덩어리에 몰아주지 않고 고르게 나눈다 (n=4, k=3 → 2·1·1이 아니라 2·1·1)
    const cn = Math.floor((n * (i + 1)) / k) - Math.floor((n * i) / k);
    if (cn <= 0) continue;
    // 덩어리를 arc 위에 균등 배치 + 지터. k=1이면 오프셋 0 (분모 0 방지)
    const base = k > 1 ? (i / (k - 1) - 0.5) * ENEMY.clusterArcU : 0;
    const jitter = ((f.rnd() - 0.5) * ENEMY.clusterArcU) / Math.max(1, k - 1) / 2;
    spawnCluster(f, map, kinds.slice(done, done + cn), (u + base + jitter + 1) % 1);
    done += cn;
  }
}

/** 관문 대열의 `i`번째 갈래(전체 `n`갈래)가 설 **링 위 각**(§0.6 C6).
 * 폭은 `GATE.laneW`(월드)로 주어지므로 여기서 **그 방향의 실제 링 반경**으로 나눠 각으로 바꾼다 —
 * 남·북(반경 496)과 서(808)에서 대열의 «가로 폭»이 같아지는 것이 이 한 줄의 전부다 */
function gateLaneU(map: GameMap, u0: number, i: number, n: number): number {
  const p = ringPoint(map, u0);
  const r = Math.hypot(p.x - map.cx, p.y - map.cy);
  const stepU = GATE.laneW / (2 * Math.PI * r);
  return (u0 + (i - (n - 1) / 2) * stepU + 1) % 1;
}

/** 링 위 한 점을 **바깥으로 `back`만큼 물린** 좌표. 앵커는 코어 쪽을 보고 걷으므로 «바깥»이 곧
 * «뒤»다 — 관문 대열의 후열·보스가 전열 뒤에 서는 유일한 수단이다(§0.6 C6).
 * `back = 0`이면 `ringPoint`와 정확히 같은 점이라 일반 웨이브의 좌표는 한 픽셀도 안 움직인다 */
function gatePoint(map: GameMap, u: number, back: number): { x: number; y: number } {
  const p = ringPoint(map, u);
  if (!back) return p;
  const a = Math.atan2(p.y - map.cy, p.x - map.cx);
  return { x: p.x + Math.cos(a) * back, y: p.y + Math.sin(a) * back };
}

/** **부대 하나를 대형째 내보낸다** (§0.6 C1·C2). 무리 스폰(`spawnBurst`)이 링의 한 점 둘레에
 * 흩뿌리는 자리에, 부대는 **슬롯 좌표에 정확히 선다** — 그것이 「대형을 갖춰 다가온다」의 전부다.
 *
 * 두 가지가 여기서 굳는다:
 *  · **전열은 단단한 개체가 맡는다** — 실효 HP 내림차순으로 앞 슬롯부터 채운다(§0.6 C3의 예비 작업.
 *    방패 오크가 방진의 앞줄에 서는 것이 지금은 배치의 결과이고, 「직사 차단」은 C3가 얹는다)
 *  · **지휘 유닛은 후미 중앙에 선다** — 가장 단단한 1기를 빼서 대열 **가장 깊은 중앙 슬롯**에 놓는다.
 *    앞에 세우면 「부대의 심장을 어떻게 칠까」(C4)가 «맨 앞을 쏜다»로 무너진다 */
function releaseCompany(f: Field, map: GameMap, form: FormationId, kinds: readonly string[], u: number, back = 0): void {
  const n = kinds.length;
  const c = gatePoint(map, u, back);
  const ang = Math.atan2(map.cy - c.y, map.cx - c.x);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // 부대는 **가장 느린 종의 속도**로 걷는다 (§0.6 C1 "함께 이동") — 없으면 빠른 종이 앞서 나가
  // 대형이 늘 찢어진다. 대형은 «누가 뒤처지는가»가 아니라 «함께 온다»가 그림이다
  let speed = Infinity;
  for (const k of kinds) speed = Math.min(speed, enemySpeedOf(k, f.waveIdx));
  const co: Company = { id: f.coSeq++, form, n, x: c.x, y: c.y, ang, speed, alive: 0, broken: 0, ram: null, ramCd: 0 };
  f.companies.push(co);
  f.coForms[form] = (f.coForms[form] ?? 0) + 1;
  // 가장 깊은(=x가 최소) 슬롯 중 가장 중앙(|y| 최소)이 지휘 자리다. 대형 6종의 기하가 서로 다르므로
  // 「n-1번」 같은 인덱스 규칙은 모양마다 다른 곳을 가리킨다 — 좌표로 고르면 한 규칙으로 끝난다
  let cmdrSlot = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const o = slotOffset(form, i, n);
    const score = o.x * 1000 + Math.abs(o.y);
    if (score < best) {
      best = score;
      cmdrSlot = i;
    }
  }
  const sorted = kinds.slice().sort((a, b) => effHp(b) - effHp(a));
  const assign: string[] = new Array(n);
  assign[cmdrSlot] = sorted[0];
  let j = 1;
  for (let i = 0; i < n; i++) if (i !== cmdrSlot) assign[i] = sorted[j++];
  for (let i = 0; i < n; i++) {
    const o = slotOffset(form, i, n);
    const x = c.x + o.x * ca - o.y * sa;
    const y = c.y + o.x * sa + o.y * ca;
    spawnEnemy(f, assign[i], x, y, ca, sa, true);
    const e = f.list[f.list.length - 1];
    e.co = co.id;
    e.slot = i;
    e.cmdr = i === cmdrSlot;
    f.spawned++;
  }
}

/** 포효 = 러너 소환 (§8 보스 그람 "HP 70%·40%에 포효"). 임계를 넘는 프레임에 한 번만 불린다.
 *
 * 소환체는 보스 주위 링에 놓고 **`ring = false`로 태어난다** — 맵 밖에서 걸어오는 것이 아니라
 * 이미 전장 한복판에 나타나므로, 접근 시간 표본(§5.0 검증)에 넣으면 "1초 만에 레일 도달"이 섞인다.
 * 분열체(§8.⑦)와 같은 이유다. 난수를 쓰지 않는 것도 같은 이유다(f.rnd()는 스폰 좌표 스트림이라
 * 여기서 뽑으면 이후 웨이브의 스폰 위치가 통째로 밀린다 — bobPhase·lane과 같은 함정) */
function roar(f: Field, map: GameMap, e: Enemy, r: { kind: string; n: number }, spin: number): void {
  e.roarFx = RENDER.roarFx;
  markEnemyAction(e, f.t, "summon");
  const d = enemyH(e.kind) * 0.8;
  for (let i = 0; i < r.n; i++) {
    // 발동 회차마다 반 칸씩 돌려 두 번째 포효가 첫 번째와 같은 자리에 겹치지 않게 한다.
    // **회차 카운터를 인자로 받는다** (§0.6 B3): HP 문턱 포효는 `e.roars`, 쿨다운 포효(summon 패턴)는
    // `f.patFired.summon`을 쓴다 — 한 카운터를 공유하면 쿨 포효가 문턱 포효의 자리를 조용히 먹는다
    const a = ((i + spin * 0.5) / r.n) * Math.PI * 2;
    const x = e.x + Math.cos(a) * d;
    const y = e.y + Math.sin(a) * d;
    const c = Math.atan2(map.cy - y, map.cx - x);
    spawnEnemy(f, r.kind, x, y, Math.cos(c), Math.sin(c));
    f.summoned++;
  }
}

/** 이 패턴의 **조준점**(월드). 예고가 시작되는 프레임에 한 번 굳는다 —
 * 예고가 가리킨 곳과 실제로 일어나는 곳이 갈리면 예고가 거짓말이 되고 §0.6 B3 ⓒ(대응 여지)가 죽는다 */
function patAimOf(map: GameMap, e: Enemy, q: BossPattern): { x: number; y: number } {
  // 돌진은 **레일까지**다 (§0.6 B3). 코어에서 보스로 그은 선이 레일 링과 만나는 점이라,
  // 보스가 링 밖(접근 중)이든 안(교전 위치 0.5)이든 «레일 쪽으로» 달린다는 뜻이 같다
  if (q.id === "charge") {
    const a = Math.atan2(e.y - map.cy, e.x - map.cx);
    return { x: map.cx + Math.cos(a) * map.outerR, y: map.cy + Math.sin(a) * map.outerR };
  }
  // 투척의 착탄 지대는 **코어**다 — 장거리 곡사가 노리는 것은 §8.0대로 코어뿐이다
  if (q.id === "rock") return { x: map.cx, y: map.cy };
  // 분쇄는 **제자리** — 「전방의 성벽·건물을 민다」라 보스가 선 자리가 중심이다
  return { x: e.x, y: e.y };
}

/** **보스 능동 패턴** (DESIGN §0.6 B3 · 상수는 balance.ts `BOSS_PATTERNS`).
 * 국면은 셋뿐이다: **평시**(쿨을 깎는다) → **예고**(`tell`초, 그 자리에 멈춘다) → **발동**(`act`초, 0이면 즉발).
 * 한 번에 **한 패턴만** 돈다 — 둘이 겹치면 예고가 무엇의 예고인지 화면에서 안 읽힌다.
 *
 * 반환값 = **이번 프레임의 이동을 패턴이 가져갔는가**. true면 호출부가 아래 이동 분기를 건너뛴다:
 * 예고 중에는 서 있어야 하고(§0.6 B4 "패턴 전후 정지 모션") 돌진 중에는 플로우필드가 아니라
 * 조준점을 향해 달려야 하기 때문이다.
 *
 * **§8.0을 넘지 않는다** — 어떤 패턴도 열차·레일을 부수지 않고, 칸은 HP 없이 «잠깐 멈출» 뿐이다.
 * 코어 피해와 지형 분쇄는 combat.ts의 우편함(`f.rockPending`·`f.quakeAt`)으로 넘긴다 */
/** **지금 시전(예고) 중인가** — 패턴이 골라졌고 아직 발동 전인 창(`tell`초).
 * 네크로맨서에게는 이 창이 곧 §0.7 K ②의 「시전 = 예고」이고, 그 동안만 시전 셀
 * (`NECRO.castSprite`)로 갈아 끼운다. **판정을 안 바꾼다** — 그리는 이름 하나만 고른다.
 * probe `necro.phase`의 `cast` 칸도 이 술어를 쓴다(둘이 갈리면 컷과 계측이 어긋난다) */
export function isCasting(e: Enemy): boolean {
  return e.patIdx >= 0 && !e.patActing;
}

function bossPatterns(f: Field, map: GameMap, e: Enemy, dt: number, train: Train): boolean {
  const list = BOSS_PATTERNS[e.kind];
  if (!list) return false;
  const st = ENEMY_STATS[e.kind];

  if (e.patIdx >= 0) {
    const q = list[e.patIdx];
    e.patT += dt;
    const close = (): void => {
      e.patCd[e.patIdx] = q.cd;
      e.patIdx = -1;
      e.patActing = false;
      e.patT = 0;
    };
    if (!e.patActing) {
      // **예고 중** — 제자리에 선다. 이 창이 §0.6 B3 ⓒ의 「대응 여지」다(멈춘 보스 = 조준 포격의 창)
      e.vEase += (0 - e.vEase) * Math.min(1, BOSS_MOVE.ease * dt);
      if (e.patT < q.tell) return true;
      // **발동**
      const aim = e.patAim ?? { x: e.x, y: e.y };
      f.patFired[q.id]++;
      markEnemyAction(e, f.t, q.id);
      if (q.id === "summon") roar(f, map, e, { kind: q.kind!, n: q.n! }, f.patFired.summon);
      else if (q.id === "rock") f.rockPending += q.dmg!;
      else if (q.id === "quake") f.quakeAt = { x: aim.x, y: aim.y, r: q.r! * map.outerR };
      // **부활** (§0.7 K ③). 시전이 끝나는 이 프레임에 일제히 일어나고 **그와 동시에 무적이 풀린다** —
      // 정본이 그 둘을 한 문장에 묶었다("시전이 끝나면 무적이 풀린다"). 한 번만 돈다
      else if (q.id === "raise") {
        raiseUndead(f, map, e);
        e.invuln = false;
      }
      if (q.act <= 0) {
        // **이벤트는 두 번째가 없다** — 쿨을 무한으로 줘서 이 패턴을 영영 닫는다(나머지 넷은
        // 쿨로 계속 돈다). `close()`가 `patIdx`를 -1로 내리므로 **그 전에** 자리를 집어야 한다.
        // 이렇게 두면 그 뒤의 네크로맨서는 «패턴 없는 보스급 적»으로 남는다
        const once = q.id === "raise" ? e.patIdx : -1;
        close();
        if (once >= 0) e.patCd[once] = Infinity;
        return true; // 즉발이라도 이 프레임은 «멈춰 있었다» — 다음 프레임부터 다시 걷는다
      }
      e.patActing = true;
      e.patT = 0;
      return true;
    }
    // **발동 중** — 돌진만 지속 국면을 쓴다(나머지는 즉발이라 여기 안 온다)
    if (q.id === "charge") {
      e.vEase += (q.speed! - e.vEase) * Math.min(1, BOSS_MOVE.ease * dt);
      // 달리는 동안에는 코어 점타가 멈춘다 — 「멀리서 맞기만 하는 더미」의 반대편이라
      // 서서 쏘는 것과 달리는 것이 동시에 되면 패턴이 순수 추가 피해가 된다
      e.firing = false;
      const aim = e.patAim!;
      const dx = aim.x - e.x;
      const dy = aim.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = f.baseSpeed * st.speed * e.vEase;
      const nx = e.x + (dx / d) * v * dt;
      const ny = e.y + (dy / d) * v * dt;
      // 열차는 여전히 **이동 장벽**이다 (§8.0) — 부딪히면 거기서 멈춘다. 부수는 것이 아니다
      if (!trainBlocks(train, nx, ny, ENEMY.radius) || trainBlocks(train, e.x, e.y, ENEMY.radius)) {
        e.x = nx;
        e.y = ny;
      }
      e.faceX = dx / d;
      e.faceY = dy / d;
      // **부딪힌 칸 일시 정지** — 반경 안의 칸에 정지 시간을 «채운다»(누적이 아니라 최대값이다:
      // 한 번의 돌진이 한 번의 정지다). 무기칸만 표적이다 — 가고일과 같은 이유로 기관차·수집칸을
      // 누르면 이 패턴의 값이 편성 내용이 아니라 «어느 칸이 마침 거기 있었나»에 걸린다
      const rr = q.r! * map.outerR;
      for (let i = 0; i < train.cars.length; i++) {
        if (!WEAPONS[train.cars[i].kind]) continue;
        const cp = at(train.track, carS(train, i));
        if (Math.hypot(cp.x - e.x, cp.y - e.y) > rr) continue;
        f.carStun[i] = Math.max(f.carStun[i] ?? 0, q.stun!);
      }
    }
    if (e.patT >= q.act) close();
    return true;
  }

  // **등장 이펙트** (§0.6 B5) — 맵 안에 처음 들어서는 프레임에 충격파 한 번. 포효와 **같은 링**을
  // 쓴다: 「거대한 것이 도착했다」의 어휘가 이미 그 링이고, 여기서 새 연출을 만들면 화면의 문법이
  // 두 벌이 된다. 소환은 일어나지 않는다 — `roarFx`는 연출 필드일 뿐이고 판정은 아무것도 안 본다
  const inMap = e.x > 0 && e.y > 0 && e.x < map.w && e.y < map.h;
  if (!e.entered && inMap) {
    e.entered = true;
    e.roarFx = RENDER.roarFx;
  }

  // **평시** — 쿨을 깎고, 다 찬 것 중 앞의 것 하나만 연다
  let pick = -1;
  for (let i = 0; i < list.length; i++) {
    e.patCd[i] -= dt;
    if (e.patCd[i] <= 0 && pick < 0) pick = i;
  }
  // 이속 배수는 평시에 1로 돌아온다 = **가속**(§0.6 B4). 스폰 직후에는 이미 1이라 접근 시간(§5.0)이 안 밀린다
  e.vEase += (1 - e.vEase) * Math.min(1, BOSS_MOVE.ease * dt);
  // **맵 안에 들어온 뒤에만** 연다 (§5.0 "등장 즉시 교전 금지" — 산병의 standoff와 같은 조건)
  // **무적이면 서 있는다** (§0.7 K ① "맵 구석에 선다"). true = 「이번 프레임의 이동을 패턴이
  // 가져갔다」라 호출부가 이동·사격 분기를 통째로 건너뛴다 — 등장 국면이 «걸어오는 보스»가
  // 되면 ①과 ②가 화면에서 안 갈린다
  if (pick < 0 || !inMap) return e.invuln;
  e.patIdx = pick;
  e.patT = 0;
  e.patActing = false;
  e.patAim = patAimOf(map, e, list[pick]);
  return true;
}

/** **일제 부활** (§0.7 K ③). 시전이 끝나는 **한 프레임**에 시체밭을 통째로 비우며 그 자리마다
 * 언데드 1기를 세운다 — 엘리트 네크로맨서의 `breed`(4초에 1기)와 갈리는 것이 정확히 이 «일제»다.
 *
 * 규약 넷(BALANCE §0.7 「네크로맨서(이벤트)」 · DESIGN §0.7 K):
 *  ⓐ **되살아나는 것은 죽은 그 종이다** — 그래서 `Field.graves`가 좌표와 함께 `kind`를 든다.
 *    관문(보스·중간보스·이벤트)의 자리는 건너뛴다: 관문은 순번 곡선을 타는 «1기짜리 예산»이라
 *    되살리면 그 웨이브에 보스가 둘이 되고 §6 예산이 두 번 세어진다
 *  ⓑ **상한은 둘이 동시에 걸린다** — `NECRO.raiseCap`(이벤트의 크기)과 **필드 상한의 여유분**
 *    (`ENEMY.fieldCap` − 지금 살아 있는 수). 정본이 후자를 못박았고 전자는 루프 제안이다
 *  ⓒ **쓴 자리는 소비된다**(`breed`의 재소환과 같은 규약) — 안 그러면 웨이브 40이 웨이브 20의
 *    시체를 다시 먹는다
 *  ⓓ **난수를 안 쓴다** — `f.rnd()`는 스폰 좌표 스트림이라 여기서 뽑으면 그 뒤 모든 웨이브의
 *    스폰 위치가 통째로 밀린다(포효·분열과 같은 함정). 오래된 자리부터 순서대로 먹는다 */
function raiseUndead(f: Field, map: GameMap, e: Enemy): void {
  const room = Math.max(0, ENEMY.fieldCap - f.list.length);
  let left = Math.min(raiseCapValue(), room);
  if (left <= 0) return;
  const keep: { x: number; y: number; kind: string; w: number }[] = [];
  for (const g of f.graves) {
    // **「이 웨이브에서 죽은」이 여기 한 줄이다** (§0.7 K ⑤). 시전자의 웨이브와 다른 자리는 안 먹는다 —
    // 웨이브 19의 잔적이 웨이브 20의 부활군에 섞이면 「1차 물량이 통째로 일어난다」가 흐려지고,
    // 웨이브 40이 웨이브 20의 시체를 다시 먹는 길도 여기서 함께 닫힌다
    if (left <= 0 || g.w !== e.wave || isBossKind(g.kind) || isMidKind(g.kind) || isEventKind(g.kind)) {
      keep.push(g);
      continue;
    }
    left--;
    // 얼굴은 코어 쪽 — 일어나자마자 걸어갈 방향이다(재소환·분열과 같은 한 줄)
    const c = Math.atan2(map.cy - g.y, map.cx - g.x);
    spawnEnemy(f, g.kind, g.x, g.y, Math.cos(c), Math.sin(c), false, true);
    f.undeadMade++;
  }
  f.graves = keep;
  // 시전자 자리에 충격파 한 번 — 포효·등장과 **같은 링**을 쓴다(새 어휘를 안 만든다)
  e.roarFx = RENDER.roarFx;
}

/** **증식** — 주기 산란(슬라임 퀸)과 처치 지점 재소환(네크로맨서)이 **한 함수**다 (§8.⑦).
 * 갈리는 것은 «어디에 세우는가»뿐이라 나머지(쿨다운·상한·소환체 규약)를 두 벌 두면 그대로 중복이 된다.
 *
 * 소환체는 포효·분열체와 같이 **`ring = false`로 태어난다** — 맵 밖에서 걸어오는 것이 아니라 이미
 * 전장 안에 나타나므로 접근 시간 표본(§5.0 검증)에 넣으면 "1초 만에 레일 도달"이 섞인다.
 * 난수를 안 쓰는 것도 같은 이유다(`f.rnd()`는 스폰 좌표 스트림이라 여기서 뽑으면 이후 웨이브의
 * 스폰 위치가 통째로 밀린다 — bobPhase·lane과 같은 함정).
 *
 * 재소환은 **소비한다**: 쓴 처치 지점은 목록에서 뺀다. 안 빼면 한 자리가 무한 재료가 되어
 * 상한(cap)만이 유일한 제동이 되고, §8.⑦의 "오래 끌수록 시체밭"이 "한 번 죽은 자리가 영원한
 * 샘"으로 바뀐다. 반경 안에 재료가 없으면 **쿨을 소모하지 않는다** — 도착하자마자 한 기가
 * 튀어나오는 것이 이 적의 조건부 프리미엄이 성립하는 방식이다 */
function breed(f: Field, map: GameMap, e: Enemy, dt: number): void {
  const st = ENEMY_STATS[e.kind];
  const sp = st.spawner;
  const rz = st.raise;
  if (!sp && !rz) return;
  const cap = sp ? sp.cap : rz!.cap;
  if (e.bred >= cap) return;
  e.breedCd -= dt;
  if (e.breedCd > 0) return;
  let x: number;
  let y: number;
  if (sp) {
    // 산란: 본체 둘레에 반 칸씩 돌려 놓는다(포효와 같은 규약 — 같은 자리에 겹치지 않게)
    const d = enemyH(e.kind) * 0.8;
    const a = ((e.bred * 0.618) % 1) * Math.PI * 2;
    x = e.x + Math.cos(a) * d;
    y = e.y + Math.sin(a) * d;
  } else {
    // 재소환: 반경 안에서 **자기에게 가장 가까운** 처치 지점 하나를 소비한다
    let bi = -1;
    let bd = rz!.r * map.outerR;
    for (let i = 0; i < f.graves.length; i++) {
      const g = f.graves[i];
      const d = Math.hypot(g.x - e.x, g.y - e.y);
      if (d > bd) continue;
      bd = d;
      bi = i;
    }
    if (bi < 0) return; // 재료 없음 — 쿨은 그대로 0 이하로 남아 다음 프레임에 다시 본다
    x = f.graves[bi].x;
    y = f.graves[bi].y;
    f.graves.splice(bi, 1);
    f.gravesUsed++;
  }
  e.breedCd = (sp ?? rz!).everySec;
  e.bred++;
  markEnemyAction(e, f.t, sp ? "summon" : "raise");
  const c = Math.atan2(map.cy - y, map.cx - x);
  spawnEnemy(f, (sp ?? rz!).into, x, y, Math.cos(c), Math.sin(c));
  if (sp) f.sired++;
  else f.raised++;
}

/** 레일에서 이 지점이 **은폐**돼 있나 (§8.③ 박격포반 "지형 너머 완전 은폐").
 * 열차는 루프를 계속 돌므로 "지금 열차 위치"가 아니라 **가장 가까운 레일 지점**을 기준으로 잡는다 —
 * probe `enemies.inCover`와 같은 정의라 실측이 자기 검증이 된다 */
function hiddenFromRail(map: GameMap, x: number, y: number): boolean {
  const p = nearestRail(map, x, y);
  return !losOk(map, p.x, p.y, x, y, 0);
}

/** 레일 중심선에서 (x, y)에 **가장 가까운 점**. 열차는 루프를 계속 도는 개체라 "지금 열차 위치"가
 * 아니라 이 점이 «적이 레일을 향해 무엇을 하는가»의 기준이다 — 은폐 판정(위)과 산성 착탄점(§8.③)이
 * 같은 정의를 쓰므로 두 실측이 서로의 검증이 된다 */
function nearestRail(map: GameMap, x: number, y: number): { x: number; y: number } {
  let p = map.loop[0];
  let bd = Infinity;
  for (const q of map.loop) {
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < bd) {
      bd = d;
      p = q;
    }
  }
  return p;
}

/** **도약 목표 웅덩이** (§8.④ 독개구리 전사 "웅덩이 간 도약으로 경로 구간 스킵").
 * 규칙 둘뿐이다: ⓐ `ENEMY.leapRange` 안 ⓑ **자기보다 코어에 가까운** 물 — 뒤로 뛰면 스킵이 아니다.
 * 그중 코어에 가장 가까운 물을 고른다. 없으면 null = 이번 주기는 그냥 걷는다 */
function leapTarget(map: GameMap, e: Enemy): { x: number; y: number } | null {
  const dc = Math.hypot(e.x - map.cx, e.y - map.cy);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const t of map.terrain) {
    if (!isWater(t) || t.destroyed) continue;
    if (Math.hypot(t.x - e.x, t.y - e.y) > ENEMY.leapRange * map.outerR) continue;
    const tc = Math.hypot(t.x - map.cx, t.y - map.cy);
    if (tc >= dc - t.r) continue;
    if (tc < bd) {
      bd = tc;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

/** **은신처 경유 목표** (§8.③ 그림자 암살자 "언덕·잔해 경유 중에만 은신"). 규칙은 독개구리의
 * `leapTarget`과 **같다** — ⓐ `ENEMY.hideSeek` 안 ⓑ **자기보다 코어에 가까운** 은신처만
 * (뒤로 돌아가면 «경유»가 아니라 후퇴다). 그중 코어에 가장 가까운 것을 고른다.
 * null이면 그냥 플로우필드로 걷는다 = 은신처가 없는 방향에서 온 개체는 평범한 근접 적이다
 * (맵의 지형 배치에 정비례하는 조건부 프리미엄 — 장갑 트럭의 웅덩이와 같은 축) */
function hideTarget(map: GameMap, e: Enemy): { x: number; y: number } | null {
  const dc = Math.hypot(e.x - map.cx, e.y - map.cy);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const t of map.terrain) {
    // **`hideAt`과 같은 술어를 본다** (map.ts `hideKind`) — 도시의 잔해밭이 여기 든다.
    // 소멸 맵은 부순 성벽이 안 남으므로 그 갈래를 끈다(`vanish`)
    if (!hideKind(t, !MAPS[map.id].vanish)) continue;
    if (Math.hypot(t.x - e.x, t.y - e.y) > ENEMY.hideSeek * map.outerR) continue;
    const tc = Math.hypot(t.x - map.cx, t.y - map.cy);
    if (tc >= dc - t.r) continue;
    if (tc < bd) {
      bd = tc;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

export function updateField(
  f: Field,
  dt: number,
  map: GameMap,
  flow: Flow,
  train: Train,
  /** **수륙양용용 두 번째 플로우필드** (§8.④ — 호수가 안 막힌 판). 안 주면 지상 필드를 쓴다 =
   * 물 통과가 조용히 꺼진다(호수 앞에서 우회한다) */
  swimFlow: Flow = flow
): void {
  f.t += dt;
  f.waveT += dt;
  // **방위별 적-초 적립** (§0.7 J1-f ⓒ). 「어느 방향에 적이 «있었는가»」의 유일한 누적 칸이다 —
  // `enemies.spread.bins`는 순간값이라 한 프레임의 우연을 판정으로 못 쓴다(STATUS 「함정」)
  for (const e of f.list) f.octSec[octOf(Math.atan2(e.y - f.cy, e.x - f.cx))] += dt;
  // 관문 배너는 한 번 서고 스스로 사라진다 (§0.6 B5). 정차·카드로 시뮬이 멈춘 동안에는 여기 안 오므로
  // 「상점을 닫자마자 배너가 다 지나가 있는」 일이 없다
  if (f.banner) {
    f.banner.t += dt;
    if (f.banner.t >= HUD.banner.sec) f.banner = null;
  }
  if (f.list.length > f.aliveMax) f.aliveMax = f.list.length;
  // 피격 플래시(V2)·HP바 표시(V3) 감쇠. 둘 다 combat.ts의 hit()이 켠다
  for (const e of f.list) {
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.hurt > 0) e.hurt = Math.max(0, e.hurt - dt);
    if (e.shieldT > 0) e.shieldT = Math.max(0, e.shieldT - dt);
    // 「전열이 열린 채로 얼마나 싸웠나」 — 깨진 직후에 죽으면 이 값이 안 쌓인다(= 실드가 장식이다)
    if (e.shield <= 0 && ENEMY_STATS[e.kind].frontShield !== undefined) f.shieldOpenSec += dt;
    // **지속 재생** (§8.② 트롤). 이동 분기보다 **앞**에 둔다 — 코어에 붙은(atCore) 개체도, 막힌
    // 개체도 계속 회복해야 «지속»이다(광폭화·포효를 앞에 둔 것과 같은 이유).
    // `perSec`는 hp와 **같이 `enemyHpMult()`를 탄다**(balance.ts regen 주석) — 안 곱하면 §0.5 배율이
    // 바뀔 때마다 바를 채우는 시간이 조용히 달라진다.
    // 상한(`regenPool`)이 있어야 `effHp`가 이 적을 유한하게 셀 수 있다(§6 예산 구멍 방지)
    const rg = ENEMY_STATS[e.kind].regen;
    if (rg && e.hp > 0) {
      if (e.regenBlock > 0) {
        e.regenBlock = Math.max(0, e.regenBlock - dt);
        f.regenBlockSec += dt;
      } else if (e.regenPool > 0 && e.hp < e.maxHp) {
        const heal = Math.min(rg.perSec * enemyHpMult() * dt, e.regenPool, e.maxHp - e.hp);
        e.hp += heal;
        e.regenPool -= heal;
        f.regenHp += heal;
      }
    }
  }
  // 보스 레일 돌파 연출 (큐 1). 시체와 같은 부류 — 나이만 먹이고 수명이 다하면 버린다
  if (f.breach) {
    f.breach.t += dt;
    if (f.breach.t >= RENDER.breachFx) f.breach = null;
  }
  // 사망 잔상 (감독 #5 V3). 판정과 무관한 연출이라 여기서 나이만 먹이고 수명이 다하면 버린다
  if (f.corpses.length) {
    for (const c of f.corpses) c.t += dt;
    f.corpses = f.corpses.filter((c) => c.t < RENDER.deathFade);
  }

  // 웨이브 사이 간격 (큐 1). 0이 되는 프레임에 다음 웨이브를 연다 — 선택 카드·정차역 상점이
  // 들어갈 자리다(큐 3). 마지막 웨이브가 끝나면 cleared로 멈춘다 (클리어 화면은 큐 5).
  // **간격 동안에도 전투는 계속된다** — 멈추는 것은 스폰뿐이다 (감독 #11 ①)
  if (f.station) {
    // 정차 중에는 시뮬이 멈춰 있어야 하므로 여기 오지 않는 것이 정상이다 (main.ts가 update를 안 부른다).
    // 그래도 방어로 둔다 — 스폰이 진행되면 상점 화면 뒤에서 다음 스테이지가 조용히 시작된다
  } else if (f.card || f.branch || f.doctrine) {
    // 선택 카드·진화 분기·열차 교리도 시간 정지다 (§7.2 · §7.4 · §D1 ⓐ) — 정차와 같은 이유로
    // 여기 오지 않는 것이 정상이고 방어로만 둔다
  } else if (f.gap > 0) {
    f.gap = Math.max(0, f.gap - dt);
    // 간격은 스테이지 경계에서만 잡히므로, 0이 되는 순간이 곧 정차다 (출발은 상점이 시킨다)
    if (f.gap === 0) f.station = true;
  } else if (!f.cleared) {
    const wave = WAVES[f.waveIdx];
    const count = f.roster.length;
    // `burst`는 이제 **투입 계획을 세울 때**만 쓴다 (startWave → buildPlan) — 무소속 무리의 크기다
    // 스폰 창은 웨이브 길이의 앞 `spawnDuty`뿐이다 — 뒤쪽은 소강(스폰 없음, 전투는 계속).
    // 웨이브 길이도 개체 수도 정본 그대로 두고 동시 생존 밀도만 올리는 손잡이다 (balance.ts STAGE 주석)
    const spawnSec = f.waveQa?.window ?? wave.len * STAGE.spawnDuty;
    // 웨이브 종료 조건은 두 갈래다 (DESIGN §3, 감독 #11 ①):
    //  · 스테이지 안의 웨이브 → **타이머**. 웨이브 길이가 차면 잔적이 있어도 다음 웨이브가 겹쳐 열린다
    //  · 스테이지의 마지막 웨이브(3·6·9) → **스폰 완료 + 필드 전멸**. 그게 정차 조건이라 시계로 못 연다
    // 타이머 쪽에도 `spawned >= count`를 함께 요구한다 — fieldCap에 스폰이 밀린 웨이브를 시계만 보고
    // 닫으면 편성 예산의 일부가 조용히 증발한다(§6 예산이 실제로 나오지 않게 된다)
    const last = f.waveIdx + 1 >= WAVES.length || WAVES[f.waveIdx + 1].stage !== wave.stage;
    // `!f.bossPending`이 없으면 보스가 나오기 전에 웨이브 9가 닫힌다 — 아래에서 보스를 스폰 창이
    // 닫힌 **뒤에** 내보내므로, 잡몹이 먼저 전멸하는 프레임에 done이 서 버린다
    // **이벤트 웨이브는 시계로 안 닫힌다** (§0.7 K ⑤ "웨이브 종료 = 부활군 전멸 + 네크로맨서 처치").
    // 스테이지 안의 웨이브라 원래는 타이머가 닫는데, 그러면 부활군이 살아 있는 채로 다음 웨이브가
    // 겹쳐 열려 「일제 부활」이 그냥 «물량이 두 배인 웨이브»가 된다. `last`와 **같은 조건**을 쓴다 —
    // 새 규약이 아니라 자리를 하나 넓히는 것이다
    // ⚠ **`?event=0`이면 이 자리도 함께 꺼진다** — 그쪽은 「웨이브 20·40이 여느 웨이브」인 A/B 컷이라
    // 종료 조건만 이벤트로 남으면 그 컷이 K의 몫을 못 가른다
    const evt = qaEvent && isEventWave(f.waveIdx + 1);
    const done = !f.bossPending && !f.midPending && !f.eventPending && f.spawned >= count && (last || evt ? f.list.length === 0 : f.waveT >= wave.len);
    if (done) {
      const next = f.waveIdx + 1;
      if (next >= WAVES.length) f.cleared = true;
      // 스테이지 경계만 대기 간격을 둔다. 스테이지 안에서는 소강이 이미 웨이브 길이에 들어 있다
      else if (WAVES[next].stage !== wave.stage) {
        f.gap = STAGE.stageGapSec;
        // **스테이지 3번째 카드 = 정차 직전** (감독 #35 ①, §7 "스테이지당 3회"). 간격을 돌려둔 채
        // 카드를 여는 것으로 충분하다 — 카드가 열려 있는 동안 간격은 안 줄고(updateField의 분기 순서),
        // 고른 뒤에야 0으로 내려가 정차가 선다
        f.card = qaCard3;
        f.cardToStation = qaCard3;
      }
      // QA `?stop=N` (기본 0 = 꺼짐): 스테이지 안에도 N웨이브마다 정차를 낀다. 카드는 「출발」 뒤로 밀린다
      else if (qaStopEvery > 0 && next % qaStopEvery === 0) {
        f.station = true;
        f.cardAfter = true;
      }
      // 스테이지 **안**의 전환에는 선택 카드가 낀다 (§7.2 "웨이브 사이, 짧게") — 스테이지당 2회.
      // 다음 웨이브는 카드를 고른 뒤에 열린다 — pickedCard()가 유일한 출구다
      else f.card = true;
    } else {
      // **맵 보스**는 관문 웨이브의 **개시와 동시에** 링에서 1기 (DESIGN §0.6 B1 · BALANCE §0.6
      // 「보스 등장 시점」). 편성 예산 밖이라 f.spawned를 올리지 않는다 — 웨이브 종료 조건(스폰
      // 완료 + 전멸)에는 f.list.length가 걸리므로 보스를 잡아야 클리어가 선다.
      // **`f.spawned >= count` 지연은 §0.6 B1이 폐기했다** — 옛 조건은 BALANCE §6 "보스전은 준(準)결투"의
      // 시간축이었고(보스가 코어 앞에 서는 동안 잡몹이 안 쏟아지게), 3차 캐논이 그 규칙을 통째로 폐기했다:
      // 보스는 **부대와 함께** 진군한다. 잡몹과 겹치는 것이 이 축의 목적이지 부작용이 아니다.
      // **«대열 중앙»은 C6이 채웠다** — `f.gateU`가 이번 관문 대열의 중심 각이고, 보스는 그 각의
      // 링 위에서 `GATE.bossBack`만큼 물러나 선다(전열 부대의 슬롯에 겹치지 않는 자리).
      // ⚠ `f.rnd()`는 **관문에서도 그대로 뽑는다** — 뽑는 횟수를 줄이면 스폰 좌표 스트림이 밀려
      // 그 뒤 모든 웨이브의 위치가 갈린다(일반 웨이브 회귀가 통째로 무효가 된다)
      if (f.bossPending) {
        f.bossPending = false;
        const jit = f.rnd();
        const p = f.gateU === null ? ringPoint(map, jit) : gatePoint(map, f.gateU, GATE.bossBack);
        const a = Math.atan2(map.cy - p.y, map.cx - p.x);
        // 얼굴은 순번이 정한다 — 풀의 로테이션(balance.ts `bossKindAt`). 눈금은 풀 공통이라
        // 이 줄이 바뀌어도 `maxHpOf`가 내는 값은 한 자리도 안 움직인다
        // `?event=0`이면 네크로맨서 자리를 풀이 대신 채운다(balance.ts `bossFaceAt`) — 안 그러면
        // 그 자리에 **무적으로 태어나는 시전자**가 링에 서서 웨이브가 영영 안 닫힌다
        spawnEnemy(f, qaBossKind ?? bossFaceAt(bossIndex(f.waveIdx + 1), qaEvent), p.x, p.y, Math.cos(a), Math.sin(a), true);
      }
      // **중간보스**도 같은 자리·같은 조건이다 (DESIGN §3 신표). 보스와 배타적이라 순서는 무관하다.
      // 얼굴은 순번이 정한다 — 풀 7종의 로테이션(balance.ts `midKindAt`)
      // **중간보스의 «시점»은 안 건드린다 — 자리만 대열 중앙으로 옮긴다.** §0.6 B1과 BALANCE §0.6
      // 「보스 등장 시점」이 폐기한 것은 **보스**의 지연 하나뿐이고, C6이 3n을 관문이라 부르는 것은
      // «부대가 줄을 맞춰 온다»는 배치 문면이다. iter87이 여기까지 함께 풀었다가 **9 seed 풀런에서
      // 완주가 7/9로 깨졌다**(s17이 웨이브 3에서, s7이 12에서 죽는다) — 중간보스는 스테이지 1~2의
      // 편성과 정면으로 만나므로 보스와 같은 여유가 없다. 되돌리고 미결 질문에 남긴다
      if (f.midPending && f.spawned >= count) {
        f.midPending = false;
        const kind = midKindAt(midIndex(f.waveIdx + 1));
        // **난수는 종과 무관하게 먼저 뽑는다** — `f.rnd()`는 스폰 좌표 스트림이라 분기 안에서 뽑으면
        // 물가 출현 순번 뒤의 모든 웨이브가 통째로 밀린다(bobPhase·lane과 같은 함정)
        const jit = f.rnd();
        const ring = f.gateU === null ? ringPoint(map, jit) : gatePoint(map, f.gateU, GATE.bossBack);
        // **고정 출현 중간보스**(심연 촉수 강화판)는 링이 아니라 물가에 선다 — 잡몹 쪽 규약
        // (spawnCluster의 같은 한 줄)과 하나다. 링에 세우면 이속 0이라 사거리 밖에 영원히 서 있고
        // 웨이브가 안 닫힌다. **물이 없는 맵(도시)에서는 `lakeSpot`이 레일 바깥 어깨를 준다** —
        // null로 되돌아 링에 서는 일이 없다(그 함수 주석 · §0.7 J1-e)
        const spot = ENEMY_STATS[kind].inWater ? lakeSpot(map, 0) : null;
        const p = spot ?? ring;
        const a = Math.atan2(map.cy - p.y, map.cx - p.x);
        spawnEnemy(f, kind, p.x, p.y, Math.cos(a), Math.sin(a), !spot);
      }
      // **이벤트 보스** (§0.7 K ③ 등장). 관문 둘과 갈리는 것 넷:
      //  ⓐ **링이 아니라 맵 «구석»**이다 — 「스폰은 맵 밖」(§5.0)의 예외이고 정본이 그렇게 못박았다.
      //     `ring = false`로 태어나므로 접근 시간 표본(§5.0 검증)에는 안 섞인다
      //  ⓑ **`f.rnd()`를 안 뽑는다** — 자리가 결정론이라 뽑을 것이 없고, 뽑으면 스폰 좌표 스트림이
      //     한 칸 밀려 웨이브 20 이후의 «모든» 위치가 갈린다(관문에서 난수를 그대로 뽑는 것과 같은 이유)
      //  ⓒ **웨이브 개시와 «동시가 아니다»** — 이것이 iter111의 전면 개정이다(§0.7 K 흐름 5단).
      //     보스·중간보스는 부대와 함께 진군하지만(§0.6 B1) 이 적은 **1차 물량이 전멸한 뒤에** 나온다:
      //     ① 여느 웨이브처럼 밀려오고 → ② **전멸이 트리거**(「끝난 줄 알았는데」가 이 적의 연출이다)
      //     → ③ 구석 등장. 옛 구현(iter107)은 개시와 동시라 «혼자 나와 혼자 죽었다» — 부활시킬
      //     시체를 자기가 만들지 않으니 이름값이 안 섰다.
      //  ⓓ **트리거의 술어는 «스테이지 마지막 웨이브»의 종료 조건과 같은 것이다**(`spawned >= count`
      //     + 필드 전멸) — 새 규약을 안 만든다. 그래서 도달 가능성도 그쪽이 이미 증명해 두었다.
      if (f.eventPending && f.spawned >= count && f.list.length === 0) {
        f.eventPending = false;
        const p = eventCorner(map, f.waveIdx + 1);
        const a = Math.atan2(map.cy - p.y, map.cx - p.x);
        spawnEnemy(f, NECRO.kind, p.x, p.y, Math.cos(a), Math.sin(a));
        // **등장을 한 번 읽히게 한다** — 이 프레임의 필드는 방금 비었고(전멸 직후) 구석의 1기는
        // 작다. 포효·부활과 **같은 링**을 쓴다(새 어휘를 안 만든다)
        f.list[f.list.length - 1].roarFx = RENDER.roarFx;
      }
      // 스폰 스케줄 = **부대·무리 단위 시차 투입** (§0.6 C6 일반 웨이브). 창 안에 균등 배치해 둔
      // 계획(`plan`)을 시각이 되는 대로 내보낸다 — 옛 스케줄(`개체 수 / burst`개의 무리)과 **리듬이
      // 같고**, 갈리는 것은 «한 번에 나가는 것이 흩어진 무리인가 대형을 갖춘 부대인가»뿐이다
      while (f.planAt < f.plan.length && f.waveT >= f.plan[f.planAt].at * spawnSec) {
        const g = f.plan[f.planAt];
        // BALANCE §6 동시 필드 상한 = 대기열. 여기서 멈추면 다음 프레임에 같은 조건으로 다시 온다.
        // **while 안에서 f.planAt을 안 올리는 유일한 탈출구다** — break가 아니면 무한 루프다.
        // **부대는 통째로 서거나 통째로 기다린다** — 절반만 내보내면 슬롯이 빈 대형이 서고
        // 나머지가 다음 프레임에 **다른 링 자리**에서 태어나 대열이 두 동강 난다
        if (f.list.length + g.kinds.length > ENEMY.fieldCap) {
          f.capHits++;
          break;
        }
        // 투입 사이 링 위치는 **황금비 도약**(큐 1). 층화 추출은 링을 한 방향으로 훑어서 최근
        // 투입들이 늘 이웃한 방향에 몰린다 — 도약은 연속 투입을 ≈137° 떼어 놓는다
        // ⚠ 지터는 **관문에서도 그대로 뽑는다**(위 보스 스폰과 같은 이유 — 뽑는 횟수가 갈리면
        // 스폰 좌표 스트림이 밀린다). 관문 부대만 자기 자리(`g.u`)를 이미 알고 있어 그것을 쓴다
        const jit = f.rnd() * 0.05;
        const u = g.lane && f.gateU !== null ? gateLaneU(map, f.gateU, g.lane.i, g.lane.n) : (f.planAt * ENEMY.burstJumpU + jit) % 1;
        if (g.form) releaseCompany(f, map, g.form, g.kinds, u, g.back ?? 0);
        else spawnBurst(f, map, g.kinds, u);
        f.planAt++;
      }
    }
  }

  // **열차 감속** (§8.④ 심연 촉수 · §8.0 "방해만 허용"). 매 프레임 1로 되돌린 뒤 잡고 있는 촉수만
  // 다시 깎는다 — 상태를 쌓으면 촉수를 처치해도 안 풀린다(§8.0 "원인 처치 시 즉시 해제").
  // 칸 HP는 어디서도 안 건드린다: 이 적이 열차에 할 수 있는 일의 전부가 이 한 줄이다
  train.slow = 1;
  for (const e of f.list) {
    const g = ENEMY_STATS[e.kind].grab;
    e.grabbing = null;
    if (!g) continue;
    const reach = g.r * map.outerR;
    for (let i = 0; i < train.cars.length; i++) {
      const p = at(train.track, carS(train, i));
      if (Math.hypot(p.x - e.x, p.y - e.y) > reach) continue;
      e.grabbing = { x: p.x, y: p.y };
      train.slow = Math.min(train.slow, g.slow);
      markEnemyAction(e, f.t, "melee");
      break;
    }
  }
  if (train.slow < 1) f.grabSec += dt;

  // **착지 정지** (§8.⑤ 가고일 · §8.0 "무기 일시 정지"). 위 열차 감속과 **같은 규약**이다 —
  // 매 프레임 비운 뒤 앉아 있는 개체만 다시 세운다(처치하면 그 프레임에 풀린다). 칸 HP는 없다.
  // 표적은 **무기칸만**이다: §8.⑤의 문면이 "해당 칸 무기를 정지"라 기관차·수집칸에 앉으면 실효 0이고,
  // 그러면 이 적의 값이 편성 내용이 아니라 운에 걸린다
  train.stunned.clear();
  for (const e of f.list) {
    const pc = ENEMY_STATS[e.kind].perch;
    e.perched = null;
    if (!pc) continue;
    const reach = pc.r * map.outerR;
    let bi = -1;
    let bd = reach;
    for (let i = 0; i < train.cars.length; i++) {
      if (!WEAPONS[train.cars[i].kind]) continue;
      const p = at(train.track, carS(train, i));
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > bd) continue;
      bd = d;
      bi = i;
    }
    if (bi < 0) continue;
    // 앉은 개체는 **칸을 따라 움직인다** — 좌표를 칸에 붙여 두면 "올라탔다"가 화면에서 읽히고,
    // 아래 이동 루프는 `perched`를 보고 통째로 건너뛴다
    const p = at(train.track, carS(train, bi));
    e.perched = bi;
    e.x = p.x;
    e.y = p.y;
    train.stunned.add(bi);
    markEnemyAction(e, f.t, "melee");
    f.perchSec += dt;
  }
  // **돌진에 맞은 칸의 «일시» 정지** (§0.6 B3 그람). `Train.stunned`는 순간값 집합이라 지속을 못
  // 들고, 그 지속을 Field가 들고 매 프레임 여기서 다시 담는다 — 위 착지 정지와 **같은 규약**이고
  // 원인만 다르다(살아 있는 가고일 vs 지나간 돌진). 칸 HP는 여전히 없다(§8.0)
  for (let i = 0; i < f.carStun.length; i++) {
    if (!(f.carStun[i] > 0)) continue;
    f.carStun[i] = Math.max(0, f.carStun[i] - dt);
    if (f.carStun[i] > 0) train.stunned.add(i);
  }

  // **산성 저하** (§8.③ 산성 뱉기 · §8.0 "무기 성능 저하"). 위 착지 정지와 **같은 규약**이다 —
  // 매 프레임 비운 뒤 «지금 쏘고 있는 산성 뱉기»의 반경 안 무기칸만 다시 담는다(처치하면 그 프레임에
  // 풀린다). 표적이 **무기칸만**인 것도 가고일과 같은 이유다: 기관차·수집칸을 누르면 실효가 0이라
  // 이 적의 값이 편성 내용이 아니라 운에 걸린다. 정지(×0)와 달리 배수(spit.rate·spit.dmg)로 누르므로
  // 사격 루프는 이 집합을 «건너뛰지» 않고 «곱한다»(combat.ts)
  train.acid.clear();
  for (const e of f.list) {
    const sp = ENEMY_STATS[e.kind].spit;
    // 멈춰 쏘는 동안만 뱉는다 — 걸어오는 개체가 지나가며 누르면 «교전 위치»가 뜻을 잃는다
    if (!sp || !e.firing) continue;
    // **착탄점은 «가장 가까운 레일»이지 «지금 칸의 위치»가 아니다** (§8.③ "곡사 투사체").
    // 반경을 개체에서 재면 그 값이 곧 standoff에 종속돼(레일까지 닿아야 하므로 최소 standoff − 1R)
    // «산성이 덮는 넓이»가 «어디에 서느냐»와 한 덩어리가 된다 — 두 축은 갈려 있어야 한다.
    // 레일에 뱉고 그 자리를 지나는 칸이 걸리는 것이 곡사 투사체의 정직한 모형이다
    const at0 = nearestRail(map, e.x, e.y);
    const reach = sp.r * map.outerR;
    for (let i = 0; i < train.cars.length; i++) {
      if (!WEAPONS[train.cars[i].kind]) continue;
      const q = at(train.track, carS(train, i));
      if (Math.hypot(q.x - at0.x, q.y - at0.y) > reach) continue;
      train.acid.add(i);
      markEnemyAction(e, f.t, "spit");
    }
  }
  f.acidSec += train.acid.size * dt;

  // **정찰** (§8.⑤ 정찰 드론 "생존 시간에 비례해 다음 웨이브 강화"). 상한은 **드론 전체가 공유**한다 —
  // 개체마다 상한을 주면 10기가 +400%가 되어 «우선 처치 강요»가 아니라 «즉사»가 된다.
  // 여러 기가 살아 있으면 차오르는 속도만 그만큼 빨라진다
  for (const e of f.list) {
    const sc = ENEMY_STATS[e.kind].scout;
    if (!sc) continue;
    f.scoutSec += dt;
    f.scoutBuild = Math.min(sc.max, f.scoutBuild + sc.perSec * dt);
  }

  // **부대 앵커 전진** (§0.6 C1 "부대는 대형을 유지한 채 함께 이동"). 개체 루프보다 **앞**이다 —
  // 슬롯의 월드 좌표가 앵커에서 나오므로 앵커가 먼저 이번 프레임 자리에 서야 한다.
  //
  // 앵커는 «보이지 않는 대열 중심»이고 **플로우필드를 따라 걷는다** — 지형 우회·성벽 재계산이
  // 부대 단위로 그대로 도는 것이 이 설계의 값이다(개체마다 다시 계산할 필요가 없다).
  // 앵커 자신은 열차 장벽·지형 밀어내기를 안 탄다: 막히는 것은 개체이고(§8.0 "이동 장벽"),
  // 앵커가 함께 막히면 앞줄이 열차에 눌린 순간 부대 전체가 그 자리에 얼어붙는다
  for (const co of f.companies) co.alive = 0;
  const coById = new Map<number, Company>();
  for (const co of f.companies) coById.set(co.id, co);
  // **지휘 유닛이 살아 있는 부대의 id** (§0.6 C4). 부대마다 정확히 1기이므로 이 집합에 없는 부대 =
  // 심장을 잃은 부대다. 처치를 combat.ts에서 통보받지 않는 이유는 §0.6 B의 우편함 규약과 같다 —
  // 「누가 죽었는가」는 목록을 세면 나오고, 그러면 사망 경로(사격·화염·자멸)마다 통보를 안 심어도 된다
  const hasCmdr = new Set<number>();
  for (const e of f.list) {
    if (e.co < 0) continue;
    const co = coById.get(e.co);
    if (co) {
      co.alive++;
      if (e.cmdr) hasCmdr.add(co.id);
    } else e.co = -1;  // 전멸한 부대의 id를 들고 있으면 슬롯 좌표가 유령을 가리킨다
  }
  if (f.companies.some((co) => co.alive === 0)) {
    for (const co of f.companies) if (co.alive === 0) coById.delete(co.id);
    f.companies = f.companies.filter((co) => co.alive > 0);
  }
  // **대형 붕괴** (§0.6 C4 "지휘 유닛 = 대형의 심장. 잡으면 대형이 붕괴한다").
  // **전멸한 부대는 여기 못 온다** — 위 필터가 먼저 지우므로 `coBroken`은 「심장을 겨눠 무너뜨린 부대」만 센다
  for (const co of f.companies) {
    if (co.broken === 0 && !hasCmdr.has(co.id)) {
      co.broken = COMPANY.breakSec;
      f.coBroken++;
      f.coBrokenAlive += co.alive / co.n;
    }
  }
  const disband: number[] = [];
  for (const co of f.companies) {
    // 붕괴한 부대의 앵커는 **멈춘다** — 대열이 없으니 이끌 것이 없고, 그 자리가 「대형이 무너진 지점」이자
    // 산개의 기준점이다(앵커가 계속 걸으면 뒤쪽 개체가 «앵커에서 바깥»을 뒤로 읽어 되돌아 걷는다)
    if (co.broken > 0) {
      co.broken -= dt;
      co.ram = null;                              // 무너진 부대는 뚫지 않는다 — 이끌 대열이 없다
      if (co.broken <= 0) disband.push(co.id);
      continue;
    }
    // 코어에 닿은 앵커는 멈춘다 — 지나쳐 걸어가면 슬롯이 맵 반대편으로 끌려가 부대가 코어를
    // 통과해 흩어진다(§8.0 "목표는 코어뿐"의 종점이 앵커에게도 코어다)
    co.ram = null;   // 아래 두 갈래 중 «돌파»만 다시 채운다 (표적을 놓은 프레임에 쿨도 되돌아간다)
    if (Math.hypot(co.x - map.cx, co.y - map.cy) <= ENEMY.coreReach) continue;
    // **C5 — 대형은 지형에 반응한다** (§0.6). 두 갈래가 여기서 갈린다:
    //  ⓐ **우회**(방진·궁병 열·기병·지원) = 아래 `flowAt` 그대로다. 플로우필드가 이미 성벽·호수를
    //     돌아가므로 값도 분기도 필요 없다 — iter84가 앵커를 플로우필드에 태운 것의 배당이다
    //  ⓑ **돌파**(공성 종대) = 플로우필드를 **안 본다**. 우회로가 있으면 플로우필드는 늘 그쪽을
    //     고르므로, 플로우필드를 따르는 한 종대는 벽을 만날 일이 영영 없다. 그래서 오우거 `breaker`와
    //     **같은 규약**을 앵커에 얹는다: 코어로 곧게 향하고, 정면의 성벽에 닿으면 멈춰서 부순다.
    //     부술 수 없는 차단 지형(호수)에 눌린 프레임만 플로우필드로 되돌아간다(`pinnedByUnbreakable`).
    // **§0.7 J2 — 맵이 돌파를 끄면 종대도 우회한다.** 「맵 규칙이 대형 규칙을 이긴다」가 이 한 줄이다:
    // `siege`가 false면 앵커가 플로우필드를 타므로(아래 `flowAt`) 우회는 값도 분기도 없이 성립하고,
    // `co.ram`도 안 채워져 `combat.ts siegeWalls`가 때릴 표적 자체가 없다
    const siege = MAPS[map.id].enemyBreaks && co.form === "column" && !pinnedByUnbreakable(map, co.x, co.y);
    const d = siege ? unitToCore(map, co.x, co.y) : flowAt(flow, co.x, co.y);
    // **우회 누적** — 「플로우필드가 부대를 실제로 돌려세웠나」의 표본. 진행 방향이 아니라 **이번 프레임의
    // 플로우 방향**과 코어 직선의 각차다(앵커의 `ang`은 선회 제한 때문에 늘 한 박자 늦는다)
    if (!siege && (d.x || d.y)) {
      const u = unitToCore(map, co.x, co.y);
      const da = Math.abs((Math.atan2(d.y, d.x) - Math.atan2(u.y, u.x) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      f.detourSum += (da * 180) / Math.PI;
      f.detourN++;
      // 문턱 30° = **8방위 양자화의 천장(22.5°) 위**다(함정 목록). 플로우필드는 셀마다 8이웃 중
      // 하나를 굽고 `flowAt`이 보간할 뿐이라 지형이 없어도 각차가 22.5°까지 난다 — 그 위만 세야
      // 「지형이 만든 우회」가 남는다. 평균(`detourSum`)은 양자화가 섞이므로 A/B 비교용이다
      if (da > Math.PI / 6) f.detourHits++;
    }
    if (d.x || d.y) {
      let da = Math.atan2(d.y, d.x) - co.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const lim = COMPANY.turn * dt;
      co.ang += Math.max(-lim, Math.min(lim, da));
    }
    co.ram = siege ? wallAhead(map, co.x, co.y, Math.cos(co.ang), Math.sin(co.ang)) : null;
    // 표적을 문 부대는 **그 자리에 선다**. 밀어내기가 전열을 벽면에 세워 두므로 「부대가 벽을 때린다」가
    // 화면에서 그대로 읽힌다 — 앵커를 계속 걸리면 슬롯이 벽 **안**으로 들어가 전열이 벽면을 타고 미끄러진다
    if (co.ram) continue;
    const v = f.baseSpeed * co.speed * dt;
    co.x += Math.cos(co.ang) * v;
    co.y += Math.sin(co.ang) * v;
  }
  // 산개 창이 닫힌 부대는 **해산**한다 — 남기면 `broken === 0`이 되는 순간 슬롯 복귀가 되살아나
  // 대형이 저절로 다시 선다(심장이 죽었는데 대열이 돌아오면 C4가 뜻을 잃는다).
  // 구성원의 `e.co`는 **다음 프레임의 유령 부대 경로**가 -1로 되돌린다(위 첫 루프 · 함정 목록의 그 규약)
  if (disband.length) {
    for (const id of disband) coById.delete(id);
    f.companies = f.companies.filter((co) => !disband.includes(co.id));
  }

  // 이속 오라 (§8.⑧ 워 드러머 "주변 적 이동속도 +30%"). 오라 보유자는 소수라 매 프레임 훑어도 싸다.
  // 자기 자신은 버프하지 않는다 — 드러머가 빨라지면 §8.⑧ "뒤에 숨어 옴"이 성립하지 않는다
  // **붕괴한 부대의 버프는 꺼진다** (§0.6 C4 "산개 + 이속 저하 + **버프 소멸**").
  // 주는 쪽을 끈다 — 받는 쪽을 끄면 「지원 후미의 심장을 잡으면 그 부대가 앞을 못 살린다」가 아니라
  // 「붕괴한 부대는 남의 버프도 못 받는다」가 되어 §0.6 C2의 「후미를 못 치면 앞이 안 죽는다」와 어긋난다
  const bufOff = (e: Enemy) => e.co >= 0 && (coById.get(e.co)?.broken ?? 0) > 0;
  const auras = f.list.filter((e) => ENEMY_STATS[e.kind].aura && !bufOff(e));
  // **지원 3종의 보유자 목록** (§8.⑧). 이속 오라와 **같은 규약**이라 같은 자리에서 한 번만 훑는다 —
  // 셋 다 보유자가 소수이고, 셋 다 «반경 안의 **다른** 적»에게 건다.
  // 남은 몫(`aidPool`)이 0이면 목록에서 빠진다 = 다 쓴 주술사·깃발은 그 프레임부터 평범한 잡몹이다
  const healers = f.list.filter((e) => ENEMY_STATS[e.kind].heal && e.aidPool > 0 && !bufOff(e));
  const domes = f.list.filter((e) => ENEMY_STATS[e.kind].dome && !bufOff(e));
  const banners = f.list.filter((e) => ENEMY_STATS[e.kind].banner && e.aidPool > 0 && !bufOff(e));
  // **실드 전열** (§0.6 C3 "실드 유닛은 부대의 전열이다"). 위 셋과 같은 자리에서 한 번만 훑는다 —
  // 셋이 「버프를 주는 쪽」의 목록이라면 이쪽은 「가려 주는 쪽」의 목록이고 규약이 같다.
  // 실드가 0이 되거나 개체가 죽으면 **그 프레임에 목록에서 빠진다** = §0.6 C3의 ⓑ「깨지면 그 열이
  // 열린다」와 ⓒ「실드 담당이 죽으면 뒤가 노출된다」가 이 한 줄로 함께 성립한다.
  // **붕괴한 부대에 예외를 두지 않는다** — 산개하면 대열이 풀려 「사이에 서 있다」가 저절로 깨진다
  f.guards = f.list.filter((e) => e.shield > 0);

  const r = ENEMY.radius;
  for (const e of f.list) {
    e.blocked = false;
    e.buffed = false;
    // **시한부 광폭화** (§8.⑧ 배너 로드 사망 시). 보스의 `raged`와 같은 이속 경로를 쓰지만
    // 원인이 이미 죽었으므로 스탯을 못 묻는다 — 배수를 개체가 들고 시간만 깎는다
    if (e.rageT > 0) e.rageT = Math.max(0, e.rageT - dt);
    const st = ENEMY_STATS[e.kind];
    // **은신** (§8.③ 그림자 암살자). `blocked`·`slow`와 같은 순간값이라 매 프레임 다시 센다 —
    // 언덕을 벗어나거나 밟고 선 잔해가 사라지면 그 프레임에 표적으로 돌아온다.
    // 이동 분기보다 **앞**에 둔다: 코어에 붙은(atCore) 개체도 계속 판정돼야 「코어 앞 언덕」이 뜻을 갖는다
    e.hidden = st.stealth === true && hideAt(map, e.x, e.y);
    if (e.hidden) f.hiddenSec += dt;
    let buff = 1;
    for (const a of auras) {
      const au = ENEMY_STATS[a.kind].aura!;
      if (a === e || Math.hypot(a.x - e.x, a.y - e.y) > au.r * map.outerR) continue;
      buff = Math.max(buff, au.speed);
      e.buffed = true;
      if (!e.everBuffed) f.buffedEver++;
      e.everBuffed = true;
    }
    // **회복 오라** (§8.⑧ 오크 주술사). 이속 오라와 같은 줄에 서고 거는 것만 다르다 —
    // 여러 주술사가 겹치면 «가장 빠른 하나»가 아니라 **차례로 채운다**(이속은 배수라 최댓값이지만
    // HP는 양이라 합이다). 채운 만큼 그 주술사의 평생 총량에서 뺀다
    if (e.hp < e.maxHp) {
      for (const h of healers) {
        if (h === e || h.aidPool <= 0) continue;
        const hl = ENEMY_STATS[h.kind].heal!;
        if (Math.hypot(h.x - e.x, h.y - e.y) > hl.r * map.outerR) continue;
        const heal = Math.min(hl.perSec * enemyHpMult() * dt, h.aidPool, e.maxHp - e.hp);
        if (heal <= 0) continue;
        e.hp += heal;
        h.aidPool -= heal;
        f.healedHp += heal;
        markEnemyAction(h, f.t, "heal");
        if (e.hp >= e.maxHp) break;
      }
    }
    // **실드 돔** (§8.⑧ 실드 짐꾼). `hidden`과 같은 순간값이고, **짐꾼 자신도 자기 돔 안이다** —
    // 돔을 «운반»하는 적이라 걸어 나갈 수가 없다(그래서 `h === e`를 안 뺀다)
    e.domed = false;
    for (const h of domes) {
      if (Math.hypot(h.x - e.x, h.y - e.y) > ENEMY_STATS[h.kind].dome!.r * map.outerR) continue;
      e.domed = true;
      f.domedSec += dt;
      break;
    }
    // **광역 방벽** (§8.⑧ 배너 로드). 남은 몫이 있는 **가장 가까운** 깃발 하나에 귀속한다 —
    // 여럿이 겹쳐도 배수는 한 번만 걸린다(0.75²가 되면 «깃발 두 기 = 사실상 무적»이 된다).
    // 자기 자신은 안 덮는다(드러머·주술사와 같은 규약 — 그래야 «먼저 지운다»가 답이 된다)
    e.wardBy = null;
    let wd = Infinity;
    for (const b of banners) {
      if (b === e || b.aidPool <= 0) continue;
      const d = Math.hypot(b.x - e.x, b.y - e.y);
      if (d > ENEMY_STATS[b.kind].banner!.r * map.outerR || d >= wd) continue;
      wd = d;
      e.wardBy = b;
    }
    // **광폭화·포효** (§8 보스 그람). 둘 다 트리거가 남은 HP 비율이고 회복이 없으므로 한 방향이다.
    // 코어에 도달한(atCore) 뒤에도 계속 돌아야 하므로 아래의 이동 분기보다 **앞**에 둔다 —
    // 코어를 때리는 동안 HP가 임계를 지나면 그때도 포효한다
    if (e.roarFx > 0) e.roarFx = Math.max(0, e.roarFx - dt);
    if (st.rage) e.raged = e.hp <= e.maxHp * st.rage.atPct;
    if (st.roar && e.roars < st.roar.atPct.length && e.hp <= e.maxHp * st.roar.atPct[e.roars]) {
      e.roars++;
      roar(f, map, e, st.roar, e.roars - 1);
    }

    // **보스 능동 패턴** (§0.6 B3). 광폭화·포효와 같은 자리(이동 분기보다 앞)이고, 이동을 가져가는
    // 국면(예고 정지·돌진)에서는 true를 돌려 아래 이동 분기를 통째로 건너뛴다
    if (bossPatterns(f, map, e, dt, train)) continue;

    // **증식** (§8.⑦ 슬라임 퀸 산란 · 네크로맨서 재소환). 재생·포효와 같이 **이동 분기보다 앞**이다 —
    // 코어에 붙은 개체도 막힌 개체도 계속 낳아야 «본체를 잡기 전까지»가 성립한다
    breed(f, map, e, dt);

    // **폭탄 설치 후 이탈** (§8.⑥ 폭파공작원). 코어에 닿는 «순간»에 한 번만 선다 — 여기서 atCore를
    // 도로 내리므로 이 적은 코어 지속 피해 경로(combat.ts)를 한 프레임도 안 탄다. 이 적의 피해는
    // 전부 설치물이 진다. 설치물은 필드 한복판에서 태어나므로 `ring = false`다(화물·분열체와 같은 규약)
    if (st.plant && e.atCore && !e.fleeing) {
      spawnEnemy(f, st.plant.into, e.x, e.y, e.faceX, e.faceY);
      f.planted++;
      markEnemyAction(e, f.t, "plant");
      e.atCore = false;
      e.fleeing = true;
    }
    if (e.atCore) continue;
    // 칸에 앉은 가고일·갈고리 사략꾼은 이동하지 않는다 — 위 착지 블록이 이미 좌표를 칸에 붙여 놨다
    if (e.perched !== null) continue;

    // 지형 감속 (§4.1). 플로우필드 비용에는 넣지 않는다 — 적은 감속을 모르고 최단 거리로 돌진한다.
    // **수륙양용만 예외다** (§8.④ "물에서 오히려 가속"): 물 위에서는 감속 배율의 자리를 ENEMY.swimSpeed가
    // **대신** 차지한다(곱하는 것이 아니다 — 곱하면 웅덩이 0.55 × 1.5 = 0.83으로 여전히 느려서
    // "물이 지름길"이 성립하지 않는다). 언덕은 그대로 밟는다 = 물 밖에서는 남들과 같은 적이다
    // **공중은 지형을 아예 안 밟는다** (§8.⑤). 감속도 밀어내기도 성벽 정지도 전부 면제다
    const flies = st.air === true;
    const swims = st.amphib === true;
    const onWater = swims && inWaterAt(map, e.x, e.y);
    if (onWater && !e.everSwam) {
      e.everSwam = true;
      f.swimEver++;
    }
    e.slow = flies ? 1 : onWater ? ENEMY.swimSpeed : slowAt(map, e.x, e.y);
    // **웅덩이 대폭 감속** (§8.② 장갑 트럭). 지형 감속의 자리를 이 값이 **대신** 차지한다 —
    // 수륙양용의 swimSpeed와 같은 문법이고 부호만 반대다. min으로 쓰는 것은 언덕과 겹친 자리
    // 때문이다(둘 다 밟고 있으면 더 무거운 쪽이 이긴다 — slowAt 자신의 규칙과 같다)
    if (st.mired !== undefined && !flies && onPondAt(map, e.x, e.y)) {
      e.slow = Math.min(e.slow, st.mired);
      f.miredSec += dt;
    }
    if (e.slow < 1) {
      if (!e.everSlowed) f.slowedEver++;
      e.everSlowed = true;
      f.slowMinEver = Math.min(f.slowMinEver, e.slow);
      f.slowSec += dt;
    }
    // 산병: 코어 사거리에 들면 **그 자리에 멈춰** 코어를 쏜다 (§8.③ "엄폐물 뒤 정지 사격").
    // 어디에 멈추는지는 플로우필드가 정하므로, 언덕·성벽 뒤에서 멈춘 개체는 직사에 안 맞는다 —
    // 엄폐물을 철거하면 사선이 열려 무방비가 된다(§4.2). 별도의 엄폐 탐색 로직은 두지 않았다
    // 은폐 곡사(§8.③ 박격포반)는 사거리 안이라도 **은폐된 자리에서만** 멈춘다. 은폐처를 못 찾으면
    // 계속 걸어 들어와 결국 직사에 노출된다 — "완전 은폐"는 지형이 만들어 주는 것이지 무적이 아니다
    // 맵 안으로 들어온 뒤에만 멈춘다 — §5.0 "등장 즉시 교전 금지". 은폐 곡사는 사거리가 길어
    // 스폰 링에서 이미 standoff 안인 방향이 있는데, 이 조건이 그것을 막는다
    const inMap = e.x > 0 && e.y > 0 && e.x < map.w && e.y < map.h;
    // **재배치** (§8.③ 머스킷 도적 "엄폐→이동→엄폐 반복"). 국면은 둘뿐이다 — `fireSec`초를 쏘면
    // `moveSec`초 동안 걷고, 그 동안은 아래 standoff 정지가 꺼진다. **지난 프레임의 `e.firing`을
    // 보는 것이 맞다**: 이 블록이 standoff 판정보다 앞에 있어야 «이번 프레임부터 걷는다»가 성립한다
    if (st.reposition) {
      if (e.repositioning) {
        e.repoT += dt;
        f.repoSec += dt;
        if (e.repoT >= st.reposition.moveSec) {
          e.repositioning = false;
          e.repoT = 0;
        }
      } else if (e.firing) {
        e.repoT += dt;
        if (e.repoT >= st.reposition.fireSec) {
          e.repositioning = true;
          e.repoT = 0;
          f.repositions++;
        }
      }
    }
    if (
      st.standoff !== undefined &&
      inMap &&
      !e.repositioning &&
      // **§0.8-B** — `standoff`도 «레일로부터의 거리»가 `MULT.range`를 탄다(`standoffOf`가 유일한 문).
      // 안 걸면 아군 최장 도달(2.43 U)보다 먼 곳(도적 2.50 U)에 서는 적이 생겨 웨이브가 안 끝난다
      Math.hypot(e.x - map.cx, e.y - map.cy) <= standoffOf(st.standoff) * map.outerR &&
      (!st.cover || hiddenFromRail(map, e.x, e.y))
    ) {
      // 교전 개시 표본은 **산병만**, 그것도 **개체당 한 번만** 담는다 (BALANCE §1 "산병 교전 개시
      // 3~7초"). 보스도 같은 standoff 로직으로 멈추지만 이속 0.45라 15초대가 찍히고, 섞이면 §1
      // 대조창이 망가진다. `everFired`가 없으면 재배치 적이 쏠 때마다 담겨 «개시»가 아니라
      // «재교전»의 분포가 된다
      if (!e.firing && !st.coreHit && !e.everFired) f.engageLog.push(f.t - e.bornT);
      e.everFired = true;
      if (!e.firing && st.coreHit && f.bossEngageT === null) f.bossEngageT = f.t;
      e.firing = true;
      continue;
    }
    e.firing = false;

    // 광폭화는 이속 배율에 곱해진다 (BALANCE §5 "30% 광폭화 이속 ×1.5") — 오라 버프와 곱연산이다
    // 시한부 광폭화(§8.⑧ 배너 로드 사망 시)는 보스의 `raged`와 **같은 자리에 곱한다** —
    // 두 축이 겹치면 곱이 되는 것이 맞다(다른 원인이 각각 건 버프다)
    // `vEase`는 **보스의 가·감속**이다 (§0.6 B4 · `bossPatterns`가 굴린다). 잡몹은 항상 1이라
    // 이 줄이 내는 값이 한 자리도 안 바뀐다 — 등속 직선 금지는 관문에만 걸린 규칙이다
    // **부활체 이속 −10%** (§0.7 K ⓐ · 감독 고정). 광폭화·오라와 **같은 자리에 곱한다** —
    // 다른 원인이 각각 건 배수라 곱이 되는 것이 맞다
    const v = f.baseSpeed * enemySpeedOf(e.kind, e.wave) * e.slow * buff * (e.raged ? st.rage!.speed : 1) * (e.rageT > 0 ? e.rageMul : 1)
      * e.vEase
      * (e.undead ? NECRO.speedMul : 1)
      * (isBossKind(e.kind) ? qaBossSpeed : 1); // QA A/B 전용, 기본 1 (setQaBossSpeed 주석)
    // **성벽 파괴 직진** (§8 오우거): 플로우필드를 아예 안 본다 — 코어로 곧게 걸어가고 앞을 막는
    // 성벽은 부순다(피해는 combat.ts의 breakWalls). 부술 수 없는 차단 지형(호수)에 눌린 프레임만
    // 플로우필드로 돌아간다 — 안 그러면 호수 앞에 영원히 서 있는 개체가 생긴다
    // 공중 파괴자(와이번)는 **호수에 눌리지 않는다** — 넘어 다니므로 우회 분기가 필요 없다
    // **§0.7 J2** — 도시 맵에서는 파괴 직진도 없다(오우거·와이번·멧돼지). 플로우필드로 우회한다
    const bust = MAPS[map.id].enemyBreaks && st.breaker !== undefined && (flies || !pinnedByUnbreakable(map, e.x, e.y));
    // **도약** (§8.④ 독개구리). 쿨이 차면 목표 웅덩이를 잡고, 닿을 때까지 그쪽으로 «빠르게 걷는다».
    // 열차 장벽·성벽 판정은 아래 그대로 걸린다 — 도약은 방향과 속도만 바꾼다(§8.0을 넘지 않는다)
    let leapMult = 1;
    if (st.leap) {
      if (e.leapTo) {
        e.leapT += dt;
        // 목표에 닿았거나(성공) 막혀서 6초가 지났으면(실패) 놓아준다 — 실패한 도약은 세지 않는다
        if (Math.hypot(e.x - e.leapTo.x, e.y - e.leapTo.y) <= ENEMY.radius * 3) {
          f.leaps++;
          e.leapTo = null;
          e.leapCd = st.leap.everySec;
        } else if (e.leapT >= 6) {
          e.leapTo = null;
          e.leapCd = st.leap.everySec;
        } else leapMult = st.leap.mult;
      } else if ((e.leapCd -= dt) <= 0) {
        e.leapTo = leapTarget(map, e);
        e.leapT = 0;
        // 사거리 안에 «더 가까운 물»이 없으면 다음 주기에 다시 본다 (맵의 물 배치에 종속 = 조건부 적)
        if (!e.leapTo) e.leapCd = st.leap.everySec;
      }
    }
    // **공중은 플로우필드를 안 본다** — 우회할 지형이 없으므로 코어로 곧게 난다(§8.⑤)
    // **은신처 경유** (§8.③ 그림자 암살자). 이미 숨은 프레임에는 안 찾는다 — 밟고 선 지형을
    // 다시 겨누면 그 자리에서 멈춘다. 상태를 안 들고 매 프레임 새로 고르는 것은 지형이 열댓 개라
    // 비용이 없고, 조준 포격이 은신처를 지운 프레임에 바로 다른 곳으로 꺾이기 때문이다
    const hideTo = st.stealth === true && !e.hidden ? hideTarget(map, e) : null;
    const d = e.fleeing
      ? awayFromCore(map, e.x, e.y)
      : e.repositioning
        ? tangentAroundCore(map, e)
        : bust || flies
          ? unitToCore(map, e.x, e.y)
          : e.leapTo
            ? unitTo(e.x, e.y, e.leapTo.x, e.leapTo.y)
            : hideTo
              ? unitTo(e.x, e.y, hideTo.x, hideTo.y)
              : flowAt(swims ? swimFlow : flow, e.x, e.y);
    // 경로 레인 (큐 1 ②): 플로우 방향에 **수직 성분**을 개체별로 더해 접근선을 갈라 놓는다.
    // 코어에 가까워질수록 0으로 잦아들어(§8.0 "코어로 직진") 마지막에는 모두 곧게 모인다.
    // 목표는 바뀌지 않는다 — 여전히 코어 하나다
    let dx = d.x;
    let dy = d.y;
    // **부대 속도 상한** (§0.6 C1). 슬롯 위에 있는 동안은 «부대의 걸음»으로 걷는다 —
    // 없으면 빠른 종이 매 프레임 슬롯을 앞질렀다가 되돌아와 대형이 잘게 떤다
    let vCap = Infinity;
    if (dx || dy) {
      const co = e.co >= 0 ? coById.get(e.co) : undefined;
      if (co && co.broken > 0 && !bust && !e.leapTo && !e.fleeing && !e.repositioning && !hideTo) {
        // **산개** (§0.6 C4 "대형 붕괴 = 산개"). 슬롯 복귀와 **정확히 반대 방향**의 힘이다 —
        // 붕괴 지점(멈춘 앵커)에서 바깥으로 밀려 대형이 화면에서 풀린다
        const sx = e.x - co.x;
        const sy = e.y - co.y;
        const sl = Math.hypot(sx, sy);
        if (sl > 0.01) {
          const bx = dx + (sx / sl) * COMPANY.scatter;
          const by = dy + (sy / sl) * COMPANY.scatter;
          const bl = Math.hypot(bx, by) || 1;
          dx = bx / bl;
          dy = by / bl;
        }
        // **이속 저하** — 창이 열려 있는 동안은 여전히 «부대 걸음»이고 그 위에 배수가 걸린다.
        // 상한을 통째로 풀면 빠른 종이 붕괴 즉시 **자기 속도**로 뛰어 「저하」가 거짓말이 된다
        // (부대 걸음 = 가장 느린 종의 속도다). 대형 보너스가 사라지는 것은 창이 닫힌 뒤다
        vCap = f.baseSpeed * co.speed * e.slow * COMPANY.brokenSpeed;
      } else if (co && !bust && !e.leapTo && !e.fleeing && !e.repositioning && !hideTo) {
        // **슬롯 복귀** (§0.6 C1 "대형을 유지한 채 함께 이동"). 레인(개체별 산개)의 **자리를 대신
        // 차지한다** — 둘은 정반대의 힘이라 함께 걸면 대형이 서다 말고 흩어진다.
        // 플로우 성분은 **그대로 남긴다**: 슬롯 위에서는 복귀 성분이 0이라 그 프레임의 이동이
        // 순수 플로우필드가 되고, 그래서 부대원도 지형 우회를 잃지 않는다
        const o = slotOffset(co.form, e.slot, co.n);
        const ca = Math.cos(co.ang);
        const sa = Math.sin(co.ang);
        const gx = co.x + o.x * ca - o.y * sa - e.x;
        const gy = co.y + o.x * sa + o.y * ca - e.y;
        const gl = Math.hypot(gx, gy);
        // **탈출 성분 우선** (STATUS 표 29 · 갈래 ⓐ): 직전 프레임에 차단 지형이 되돌린 개체는
        // 이 프레임의 복귀 성분을 **0으로 둔다**. 슬롯 위(`gl ≈ 0`)에서 복귀가 0인 것과 같은 규약이고,
        // 그래서 지물 표면에 붙은 낙오병이 대형을 잃지 않은 채 플로우필드의 우회를 되찾는다
        if (gl > 0.01 && !(e.pinned && pinSlipOn())) {
          const w = Math.min(1, gl / COMPANY.pullAt) * coPullValue();
          const bx = dx + (gx / gl) * w;
          const by = dy + (gy / gl) * w;
          const bl = Math.hypot(bx, by) || 1;
          dx = bx / bl;
          dy = by / bl;
        }
        // 슬롯 안쪽이면 부대 걸음, 벗어났으면 자기 걸음으로 따라붙는다.
        // 지형 감속(`e.slow`)은 상한에도 그대로 곱한다 — 안 그러면 대형이 언덕을 안 밟는 셈이 된다
        if (gl < COMPANY.pullAt) vCap = f.baseSpeed * co.speed * e.slow;
      } else if (!bust && !e.leapTo && !e.fleeing && !e.repositioning && !hideTo) {
        // 파괴 직진 적에게는 레인을 얹지 않는다 — "직진"이 이 적의 정체이고, 비껴 걸으면
        // 성벽을 스쳐 지나가 §8의 "새 길을 개척함"이 일어나지 않는다
        const dc = Math.hypot(e.x - map.cx, e.y - map.cy);
        const t = Math.min(1, Math.max(0, (dc - map.outerR) / (map.outerR * ENEMY.laneFade)));
        const k = ENEMY.laneBias * e.lane * t;
        const bx = dx - dy * k;
        const by = dy + dx * k;
        const bl = Math.hypot(bx, by) || 1;
        dx = bx / bl;
        dy = by / bl;
      }
      e.faceX = dx;
      e.faceY = dy;
      // **방향 전환 보간** (§0.6 B4). 보스만 각속도 제한을 받는다 — 잡몹은 좌우 플립뿐이라
      // 보간할 것이 없고, 큰 실루엣이 한 프레임에 뒤집히는 것이 «부자연스럽다»의 절반이었다
      const want = Math.atan2(dy, dx);
      if (BOSS_PATTERNS[e.kind]) {
        let da = want - e.faceAng;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const lim = BOSS_MOVE.turn * dt;
        e.faceAng += Math.max(-lim, Math.min(lim, da));
      } else e.faceAng = want;
    }
    const step = Math.min(v, vCap) * leapMult * dt;
    const nx = e.x + dx * step;
    const ny = e.y + dy * step;

    // 열차 장벽 (§8.0): 점유 구간으로는 못 들어간다. 이미 안에 있으면(열차가 덮고 지나감) 그냥 진행.
    // **공중은 이 판정을 통째로 건너뛴다** (§8.⑤ "열차 장벽을 넘는 공중 문법") — §8.0이 금지한 것은
    // «열차를 공격 대상으로 삼는 것»이고 열차는 여전히 HP가 없다. 넘는 것은 이동 규칙이다
    if (flies && trainBlocks(train, nx, ny, r)) {
      if (!e.everCrossed) {
        e.everCrossed = true;
        f.crossed++;
      }
    }
    if (!flies && trainBlocks(train, nx, ny, r) && !trainBlocks(train, e.x, e.y, r)) {
      e.blocked = true;
      e.everBlocked = true;
    } else if (flies || !bust || !breakableAhead(map, nx, ny, r)) {
      e.x = nx;
      e.y = ny;
    }
    // else = 파괴 직진 적이 성벽에 막혔다 → **멈춰 서서 때린다** (피해는 combat.ts의 breakWalls).
    // 아래의 밀어내기에 맡기면 벽면을 타고 돌아 그냥 지나가 버린다 — 실측으로 30기가 60초 동안
    // 벽 두 장을 긁고만 갔다(철거 0). 멈춰야 §8의 "부수며 직진 — 새 길을 개척함"이 실제로 일어난다

    // 차단 지형은 관통 금지 — 플로우필드가 이미 우회를 시키므로 침투분만 밀어낸다.
    // 성벽이 파괴되면 blocksMovement가 false가 되어 그 프레임부터 통과할 수 있다
    // `pinned`는 **이 프레임의 밀어내기 결과**다 — 위 조향은 직전 프레임의 값을 읽었다(1프레임 지연)
    e.pinned = false;
    for (const t of map.terrain) {
      // **공중은 지형 전체가 면제다** (§8.⑤). 수륙양용은 **호수만** 면제된다 (§8.④) —
      // 성벽은 그대로 밀어낸다(물만 통과하는 적이다)
      if (flies || !blocksMovement(t, swims)) continue;
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      const want = t.r + r;
      if (dist < want) {
        e.x = t.x + (dx / dist) * want;
        e.y = t.y + (dy / dist) * want;
        e.pinned = true;
      }
    }
    // **돔 × 부동 겹침을 여기서 센다** (iter178 · 큐 1) — `e.domed`는 이 프레임 위쪽의 오라 절이
    // 이미 갈아 두었고 `e.pinned`는 바로 위 밀어내기의 결과다. 두 낱말이 함께 서면 그 개체는
    // «못 걷고» + «직사 표적에서 빠진» 상태이고, iter176이 도시 교착에서 읽은 것이 그 겹침이다
    if (e.domed && e.pinned) f.domedPinnedSec += dt;

    // **상륙** (§8.④ 상륙정): 레일 중심선에 닿는 순간 화물 러너를 한 번에 내린다. 그 전에 격침되면
    // 화물째 사라진다 = "수송 중 요격이 이득". 방출체는 필드 한복판에서 태어나므로 `ring = false`다
    // (분열체·포효 소환과 같은 규약 — 접근 시간 표본에 넣으면 §5.0 검증이 망가진다)
    const cargo = st.cargo;
    if (cargo && e.cargo > 0 && distToRail(map, e.x, e.y) <= r) {
      const dd = enemyH(e.kind) * 0.7;
      for (let i = 0; i < e.cargo; i++) {
        const a = ((i + 0.5) / e.cargo) * Math.PI * 2;
        const x = e.x + Math.cos(a) * dd;
        const y = e.y + Math.sin(a) * dd;
        const c = Math.atan2(map.cy - y, map.cx - x);
        spawnEnemy(f, cargo.into, x, y, Math.cos(c), Math.sin(c));
        f.delivered++;
      }
      e.cargo = 0;
      f.landed++;
    }
    if (e.ring && e.railT === null && distToRail(map, e.x, e.y) <= r) {
      e.railT = f.t;
      f.approachLog.push({ sec: f.t - e.bornT, speed: st.speed, a: e.bornA });
      // 돌파 연출은 **보스만** 남긴다 (큐 1). 잡몹은 웨이브마다 수십 기가 같은 선을 넘으므로
      // 같은 연출을 주면 레일이 상시로 번쩍인다 — 이 연출의 뜻은 "런에 한 번 있는 사건"이다
      if (isBossKind(e.kind)) {
        f.breach = { x: e.x, y: e.y, ang: Math.atan2(e.y - map.cy, e.x - map.cx), t: 0 };
      }
    }
    // 이탈 중인 공작원은 코어를 다시 붙잡지 않는다 — 설치 지점이 정의상 coreReach 안이라
    // 이 줄에 걸리면 나가자마자 도로 붙어 «설치 후 이탈»이 성립하지 않는다
    if (!e.fleeing && Math.hypot(e.x - map.cx, e.y - map.cy) <= ENEMY.coreReach) e.atCore = true;
  }

  // **이탈 완료** (§8.⑥): 스폰 링 밖으로 나간 공작원을 지운다. **드랍도 처치 수도 없다** —
  // §2의 수입은 «처치»의 대가이고 이 개체는 처치된 것이 아니라 제 몫을 다 하고 빠져나간 것이다
  // (= 공작원을 놓치면 코어와 지갑이 함께 상한다: 폭격 박쥐와 같은 규약)
  const out = ringR(map);
  if (f.list.some((e) => e.fleeing && Math.hypot(e.x - map.cx, e.y - map.cy) > out)) {
    for (const e of f.list) {
      if (!e.fleeing || Math.hypot(e.x - map.cx, e.y - map.cy) <= out) continue;
      f.fled++;
      addCorpse(f, e);
    }
    f.list = f.list.filter((e) => !e.fleeing || Math.hypot(e.x - map.cx, e.y - map.cy) <= out);
  }

  // 겹침 분리 — §8.0의 "밀집"이 한 덩어리로 뭉개지지 않게 최소한만
  const list = f.list;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 2 * r;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = ((min - d) / d) * 0.5;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
    }
  }
  updateActorMotion(f, dt);
}

export function drawField(ctx: CanvasRenderingContext2D, f: Field, map: GameMap): void {
  // 이속 오라 (§8.⑧). 지면 링으로 그려 "이 안의 적이 빨라진다"가 한눈에 읽히게 한다.
  // 난수 대신 f.t의 사인파로 맥동시켜 스크린샷 QA가 재현된다
  const pulse = 0.5 + 0.5 * Math.sin(f.t * 4);
  for (const e of f.list) {
    const au = ENEMY_STATS[e.kind].aura;
    if (!au) continue;
    const r = au.r * map.outerR;
    ctx.fillStyle = "rgba(255, 176, 60, 0.12)";
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 196, 90, ${(0.45 + 0.35 * pulse).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * (0.9 + 0.1 * pulse), 0, Math.PI * 2);
    ctx.stroke();
  }

  // **회복 오라·광역 방벽** (§8.⑧ 오크 주술사 · 배너 로드) — 이속 오라와 **같은 자리·같은 이유**로
  // 지면 링을 그린다: 반경이 안 보이면 «왜 저 잡몹이 안 죽는가»가 화면 어디에도 안 적혀 있다.
  // 남은 몫(aidPool)이 0이면 링도 사라진다 = «깃발이 꺼졌다»가 그대로 읽힌다
  for (const e of f.list) {
    const st = ENEMY_STATS[e.kind];
    const aid = st.heal ?? st.banner;
    if (!aid || e.aidPool <= 0) continue;
    const rr = aid.r * map.outerR;
    const green = st.heal !== undefined;
    ctx.fillStyle = green ? "rgba(120, 240, 130, 0.10)" : "rgba(230, 200, 110, 0.10)";
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = green
      ? `rgba(150, 255, 160, ${(0.40 + 0.30 * pulse).toFixed(2)})`
      : `rgba(255, 225, 140, ${(0.40 + 0.30 * pulse).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr * (0.9 + 0.1 * pulse), 0, Math.PI * 2);
    ctx.stroke();
  }

  // **촉수 붙잡기** (§8.④ 심연 촉수) — 지면 레이어. 촉수와 붙잡힌 칸을 굵은 물빛 줄로 잇는다.
  // 이 연출이 없으면 화면에서 «열차가 왜 느려졌는지»가 아무 데도 안 적혀 있다(§8.0 방해는
  // 파괴와 달리 HP바가 안 줄어 원인이 안 보인다). 판정은 전부 위 updateField가 이미 끝냈다 —
  // 여기서는 e.grabbing 좌표를 읽기만 한다
  for (const e of f.list) {
    if (!e.grabbing) continue;
    ctx.strokeStyle = `rgba(80, 220, 210, ${(0.35 + 0.3 * pulse).toFixed(2)})`;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.grabbing.x, e.grabbing.y);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
  }

  // **보스 레일 돌파** — 지면 레이어 (큐 1). 목업에서 적은 전부 루프 밖인데 우리 보스는 교전 위치
  // 0.5(DESIGN §6)라 루프 **안**에 선다 — 그 사이의 "레일을 넘어왔다"가 화면에 아예 없어서 보스가
  // 순간이동한 것처럼 읽혔다. 여기서는 **흙먼지 충격 링**만 그린다(레일 위 섬광·파편은 유닛 위 —
  // drawBreach 참조). **판정은 없다** — 레일도 열차도 안 부서진다(§8.0 열차는 이동 장벽일 뿐)
  if (f.breach) {
    const k = f.breach.t / RENDER.breachFx;
    const fade = 1 - k;
    // 포효(주황 불빛)와 **색으로 구분**한다 — 이쪽은 흙먼지라 회백색이다
    const rr = enemyH(BOSS.kind) * (0.45 + k * 1.7);
    ctx.fillStyle = `rgba(196, 186, 166, ${(0.34 * fade * fade).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(f.breach.x, f.breach.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(238, 231, 210, ${(0.9 * fade).toFixed(2)})`;
    ctx.lineWidth = 8 * fade + 2;
    ctx.beginPath();
    ctx.arc(f.breach.x, f.breach.y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 포효 충격파 (§8 보스). 소환은 이미 끝나 있고 이것은 **왜 갑자기 러너가 늘었는지**를 설명하는
  // 연출뿐이다 — 링이 보스에서 밖으로 퍼지며 옅어진다. 시간은 f.t가 아니라 개체의 남은 수명을 쓴다
  for (const e of f.list) {
    if (e.roarFx <= 0) continue;
    const k = 1 - e.roarFx / RENDER.roarFx;
    const fade = 1 - k;
    const rr = enemyH(e.kind) * (0.6 + k * 2.2);
    // 링 한 줄만으로는 축소 컷에서 옅은 실선으로 묻힌다(큐 1 ②) — 안쪽을 채워 **면**으로 만들고
    // 테두리를 밝은 쪽(226,150)으로 올린다. 채움은 fade²라 링보다 빨리 빠져 잔상이 안 남는다
    ctx.fillStyle = `rgba(255, 150, 60, ${(0.3 * fade * fade).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 226, 150, ${fade.toFixed(2)})`;
    ctx.lineWidth = 10 * fade + 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // **패턴 예고** (§0.6 B3 ⓑ) — 지면 레이어. 「0.8~1.5초 전에 화면에 예고가 뜬다」가 이 블록이고,
  // 이것이 없으면 패턴은 그냥 «갑자기 일어나는 일»이라 대응 여지(ⓒ)가 화면에 없다.
  // **판정은 하나도 여기 없다** — 좌표·남은 시간은 updateField가 이미 정해 뒀다
  for (const e of f.list) {
    if (e.patIdx < 0 || e.patActing) continue;
    const q = BOSS_PATTERNS[e.kind][e.patIdx];
    const k = Math.min(1, e.patT / q.tell); // 0 → 1로 차오르는 «남은 시간»
    const aim = e.patAim ?? { x: e.x, y: e.y };
    const h = enemyH(e.kind);
    // 공통 문법: **붉은 주황**이 예고색이다(포효의 노란 불빛·돌파의 회백색과 색으로 갈린다).
    // 차오르는 쪽이 k라 「곧 터진다」가 밝기로 읽힌다
    const hot = `rgba(225, ${Math.round(75 + 28 * k)}, 64, `;
    ctx.lineCap = "round";
    if (q.id === "charge") {
      // 돌진 예고 = **달릴 선**을 바닥에 긋는다. 폭은 칸 정지 반경 그대로라 「어디를 스치는가」가 보인다
      const rr = q.r! * map.outerR;
      const dx = aim.x - e.x;
      const dy = aim.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = hot + (0.07 + 0.08 * k).toFixed(2) + ")";
      ctx.lineWidth = rr * 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + (dx / d) * d * k, e.y + (dy / d) * d * k);
      ctx.stroke();
      ctx.strokeStyle = hot + (0.5 + 0.4 * k).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(aim.x, aim.y);
      ctx.stroke();
    } else if (q.id === "rock" || q.id === "quake") {
      // 착탄 지대·분쇄 반경 = **원**. 바깥 원이 범위이고 안쪽 원이 «남은 시간»이라 둘이 만나면 터진다
      const rr = q.r! * map.outerR;
      ctx.fillStyle = hot + (0.1 + 0.14 * k).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hot + (0.65 + 0.3 * k).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, rr * k, 0, Math.PI * 2);
      ctx.stroke();
      // 투척은 **어디서 날아오는지**도 그린다 — 곡사라 보스와 착탄점이 멀다
      if (q.id === "rock") {
        ctx.setLineDash([10, 10]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = hot + "0.45)";
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(aim.x, aim.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (q.id === "raise") {
      // **부활 예고 = 「일어날 자리」들이다** (§0.7 K ② "시전 자체가 예고로 화면에 읽혀야 한다").
      // 소환 예고(아래 else)처럼 시전자 둘레에 링을 그리면 **어디서 일어나는지가 화면에 없다** —
      // 이 패턴이 만지는 것은 시체밭이고 그 자리는 맵 전역에 흩어져 있다. 무덤마다 조여드는 원
      // 하나씩이 그 답이고, 「누가 시키는가」는 아래 공통 꼬리(발밑 자세 표식)가 잇는다.
      // **거르는 조건은 `raiseUndead`와 같아야 한다** — 안 일어날 자리에 예고가 뜨면 거짓말이 된다
      for (const g of f.graves) {
        if (isBossKind(g.kind) || isMidKind(g.kind) || isEventKind(g.kind)) continue;
        ctx.strokeStyle = hot + (0.4 + 0.5 * k).toFixed(2) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, ENEMY.radius * (2.4 - 1.2 * k), 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // 소환 예고 = 보스를 조여드는 링. 「주변에 뭔가 나온다」가 자리로 읽혀야 한다
      ctx.strokeStyle = hot + (0.5 + 0.4 * k).toFixed(2) + ")";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, h * (1.6 - 0.7 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    // 발동체(보스) 발밑의 **자세 표식** — 어느 개체가 무엇을 하려는지가 예고와 개체를 잇는다
    ctx.strokeStyle = hot + (0.7 + 0.3 * k).toFixed(2) + ")";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, h * 0.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  // Confirmed shots leave a short travelling dart; sustained aim is shown by core chevrons.
  // This reads separately from the red hatched boss intent and never adds full-screen rays.
  for (const e of f.list) {
    if (!e.firing) continue;
    const motion = motionOf(e), age = f.t - motion.actionAt;
    if (motion.action !== "shot" || age < 0 || age > 0.16) continue;
    const t = getEffectSettings().reducedMotion ? 0.75 : age / 0.16, dx = map.cx - e.x, dy = map.cy - e.y;
    const arc = ENEMY_STATS[e.kind].cover ? 0.44 * t * (1 - t) : 0;
    const x = e.x + dx * t - dy * arc, y = e.y + dy * t + dx * arc;
    const a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = "#bba783"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.fillStyle = "#d2c6aa"; ctx.fillRect(3, -1, 2, 2); ctx.restore();
  }

  // 사망 잔상 (감독 #5 V3) — 산 적보다 **아래**에 깔아야 시체가 새 적을 가리지 않는다
  const sh = RENDER.shadow;
  const ol = RENDER.enemyOutline;
  for (const c of f.corpses) {
    const k = c.t / RENDER.deathFade;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    drawShadow(ctx, c.x, c.y, c.h, sh.rx, sh.ry, sh.dy, sh.alpha);
    drawOutline(ctx, c.sprite, c.x, c.y, c.h, 0, ol.color, ol.px, ol.alpha, c.flip);
    draw(ctx, c.sprite, c.x, c.y, c.h, 0, c.flip);
    ctx.restore();
  }

  // **지휘 유닛 표식 — 발밑 링** (§0.6 C4). 적보다 **아래**에 깐다(그림자와 같은 층) — 위에 그리면
  // 실루엣을 가려 「누가 지휘인가」 대신 「금색 원이 있다」가 읽힌다.
  // **붕괴 중인 부대의 앵커**에는 확산 링이 남는다 = 「여기서 대열이 무너졌다」의 유일한 화면 신호다
  const cm = RENDER.cmdr;
  for (const co of f.companies) {
    if (co.broken <= 0) continue;
    // 링은 산개 창 전체가 아니라 **붕괴 직후 `breakFx`초**만 산다 — 창(6초) 내내 그리면 링이 여러 개
    // 겹쳐 화면이 금색 낙서가 된다(첫 컷 실측). 산개 자체는 그동안 계속 돈다
    const age = COMPANY.breakSec - co.broken;
    if (age > cm.breakFx) continue;
    const k = age / cm.breakFx;                   // 0 = 방금 무너짐 → 1 = 링 소멸
    ctx.strokeStyle = `rgba(${cm.color}, ${(0.55 * (1 - k)).toFixed(2)})`;
    ctx.lineWidth = cm.breakPx;
    ctx.beginPath();
    ctx.arc(co.x, co.y, cm.breakR * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // **돌파 표식** (§0.6 C5 · F ⓒ "차단이 화면에서 읽혀야 한다"). 공성 종대가 때리고 있는 성벽에
  // **남은 HP 호**를 두르고 앵커 쪽에 쐐기를 찍는다 — 이것이 없으면 종대는 그냥 벽 앞에 멈춰 선
  // 무리이고, 「부수며 길을 연다」가 화면에서 «아무 일도 안 일어난다»로 읽힌다(iter87 컷의 그 상태).
  // 호는 **12시에서 시계방향**으로 줄어든다(HP바와 같은 방향 규약) + 맥동으로 «지금 진행 중»을 낸다
  const sg = RENDER.siege;
  for (const co of f.companies) {
    const t = co.ram;
    if (!t || t.destroyed) continue;
    const left = Math.max(0, Math.min(1, t.hp / t.hp0));
    const pulse = 0.72 + 0.28 * Math.sin(f.t * sg.rate * Math.PI * 2);
    // **두르는 것은 판정 반경이 아니라 «그려진 성벽»이다** (iter96 규약 · map.ts `terrainArt`).
    // 성벽 셀은 그림이 셀 높이의 25%뿐이라 `t.r`로 원을 그으면 **그림보다 4배 높은 동그라미**가
    // 맨 잔디 위에 뜬다(실측: 반경 98월드 대 그림 반높이 21.5) — 「이 벽을 뚫는 중」이 그 자리에서
    // 안 읽힌다. 그래서 **그림 상자에 맞춘 타원**이다: `sg.r`의 뜻은 그대로 「두르는 정도」이고
    // 대상이 반경에서 **그림 반폭·반높이**로 바뀐 것뿐이다(iter96가 HP바의 `bar`에 한 것과 같다)
    const g = terrainArt(t);
    const rx = g.hw * sg.r;
    const ry = g.hh * sg.r;
    ctx.strokeStyle = `rgba(${sg.color}, ${(0.3 * pulse).toFixed(2)})`;
    ctx.lineWidth = sg.px;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${sg.color}, ${pulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
    // 쐐기 = 앵커에서 벽으로 파고드는 방향. 「누가 뚫고 있나」를 벽과 부대 사이에 놓는다.
    // 끝점은 **같은 타원 위**다 — 원의 반경 하나로 잡으면 납작한 성벽에서 쐐기만 위아래로 뻗는다
    const a = Math.atan2(t.y - co.y, t.x - co.x);
    ctx.lineWidth = sg.wedgePx;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      const aa = a + s * 0.5;
      ctx.moveTo(g.cx - Math.cos(aa) * (rx + sg.wedge), g.cy - Math.sin(aa) * (ry + sg.wedge));
      ctx.lineTo(g.cx - Math.cos(a) * rx, g.cy - Math.sin(a) * ry);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  for (const e of f.list) {
    if (!e.cmdr) continue;
    const h = enemyH(e.kind);
    ctx.strokeStyle = `rgba(${cm.color}, 0.85)`;
    ctx.lineWidth = cm.ringPx;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + h * sh.dy, h * cm.ring, h * cm.ring * (sh.ry / sh.rx), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // 분열체는 슬라임 시트 한 장을 크기만 줄여 쓴다 (ENEMY_STATS.sprite/scale)
  // **순서는 `f.list`가 아니라 `drawOrder`다** — 뒷줄이 앞줄을 덮지 않게 y로 정렬한 사본이다
  for (const e of drawOrder(f)) {
    const st = ENEMY_STATS[e.kind];
    // **부활체는 셀만 갈린다** (§0.7 K ⓓ · `sprites.ts undeadName`). 판정은 여전히 원본 종이
    // 보므로 `ENEMY_STATS`에 행이 안 늘고, 그래서 「적 종은 늘리지 않는다」가 산다.
    // 굽기는 그 종이 처음 되살아난 프레임 한 번뿐이라 프레임 비용은 변종과 같이 0이다
    // **시전 국면은 셀이 갈린다** (§0.7 K ④ · 감독 #65 반입). 종이 아니라 «국면»이라
    // `ENEMY_STATS`에 행이 안 늘고, 창은 예고(`castSec`) 동안뿐이다
    const name = e.undead
      ? undeadName(st.sprite ?? e.kind)
      : isEventKind(e.kind) && isCasting(e) ? NECRO.castSprite
      : st.sprite ?? e.kind;
    const h = enemyH(e.kind);
    const ar = RENDER.air;
    const pose = enemyMotionState(e, f.t);
    const profile = ENEMY_MOTION[e.kind];
    // Ground coordinates and shadow never follow animated limbs. Flight keeps its true ground shadow.
    const bob = st.air && e.perched === null ? -h * ar.lift : 0;
    // 좌우 플립: 진행 방향이 왼쪽이면 뒤집는다. 시트의 적은 전부 오른쪽(또는 정면)을 보고 있다.
    // **보스는 보간된 각도(faceAng)로 뒤집는다** (§0.6 B4 "방향 전환 보간") — 순간값 faceX를 쓰면
    // 큰 실루엣이 한 프레임에 뒤집혀 그 자체가 «부자연스러움»의 절반이었다
    const flip = BOSS_PATTERNS[e.kind] ? Math.cos(e.faceAng) < 0 : e.faceX < 0;
    if (st.air) drawShadow(ctx, e.x, e.y, h, sh.rx * ar.shadow, sh.ry * ar.shadow, sh.dy, sh.alpha * ar.shadow);
    else drawShadow(ctx, e.x, e.y, h, sh.rx, sh.ry, sh.dy, sh.alpha);
    // **설치된 폭탄은 시트에 셀이 없다** (§8.⑥ — 공작원의 산물이지 «적 스프라이트»가 아니다).
    // 도형으로 그린다. HP바는 그대로 붙인다 — 사격으로도 지울 수 있는 개체라는 것이 그 막대다
    if (st.fuse) {
      drawBomb(ctx, e, h, st.fuse.sec, f.t);
      drawHpBar(ctx, e, h, 0, 1);
      continue;
    }
    // 어두운 외곽선 (감독 #10 "목업의 적들이 또렷한 이유는 외곽 대비다"). 명도 보정(RENDER.enemyLift)은
    // sprites.tintOf가 굽고, 배경에서 떼어내는 테두리는 여기서 깐다 — 잔디 위 짙은 녹색 실루엣 대책
    drawActor(ctx, name, e.x, e.y + bob, h, flip, profile, pose.frame, ol, e.flash / HIT_FLASH);
    // Ordinary full-health crowds need no repeated chrome; command units keep priority.
    const indicators = enemyIndicators(e);
    if (indicators.health && !indicators.priority) drawHpBar(ctx, e, h, bob, 1);
  }

  // **지휘 유닛 표식 — 머리 위 꺾쇠** (§0.6 C4). **적 전체를 그린 뒤**의 별도 패스다: 적은 y정렬이
  // 아니라 목록 순서로 그려지므로, 개체 루프 안에서 그리면 **뒤에 그려지는 앞줄 개체가 꺾쇠를 덮는다**
  // (밀집 3열의 방진에서는 거의 항상 덮인다 — 첫 컷 실측). HP바(`up 0.6`)보다 위에 둬서
  // 「남은 HP」와 「심장인가」가 한 뭉치로 안 읽히게 한다
  for (const e of f.list) {
    if (!e.cmdr) continue;
    const h = enemyH(e.kind);
    const w = h * cm.chevron;
    const y = e.y - h * cm.chevronUp;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // 어두운 밑선 — 잔디·적 실루엣 어디에 걸려도 금색이 떠 보이게 한다(적 외곽선과 같은 규약)
    for (const [col, px] of [["rgba(20, 14, 6, 0.75)", cm.ringPx + 2.4], [`rgba(${cm.color}, 1)`, cm.ringPx]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = px;
      ctx.beginPath();
      ctx.moveTo(e.x - w / 2, y + w * 0.5);
      ctx.lineTo(e.x, y);
      ctx.lineTo(e.x + w / 2, y + w * 0.5);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
  }

  // **실드 전열 — 정면 호** (§0.6 C3). 돔과 같은 이유로 **적보다 위**의 별도 패스다: 실드는 바닥에
  // 그린 반경이 아니라 «앞에 든 것»이고, 밀집 3열에서 개체 루프 안에 그리면 뒤에 그려지는 앞줄이
  // 덮는다(iter85가 꺾쇠로 밟은 그 함정). 호의 **각도는 판정 그대로**(`frontShield` 반각)이고
  // **두께·불투명도가 남은 총량에 비례**한다 = 「얼마나 남았나」가 HP바와 따로 읽힌다.
  // 깨지는 순간에는 그 자리에 파편 링이 한 번 터진다(§0.6 C3 ⓑ "깨지면 그 열이 열린다")
  const sd = RENDER.shield;
  const hostileShield = "187, 132, 157";
  for (const e of f.list) {
    const deg = ENEMY_STATS[e.kind].frontShield;
    if (deg === undefined) continue;
    const h = enemyH(e.kind);
    if (e.shield > 0) {
      const k = Math.min(1, e.shield / Math.max(e.maxHp * SHIELD.pool, 0.001));
      const a = Math.atan2(e.faceY, e.faceX);
      const half = (deg * Math.PI) / 180;
      ctx.strokeStyle = `rgba(${hostileShield}, ${(0.25 + 0.55 * k).toFixed(2)})`;
      ctx.lineWidth = sd.px * (0.35 + 0.65 * k);
      ctx.beginPath();
      ctx.arc(e.x, e.y - h * 0.35, h * sd.r, a - half, a + half);
      ctx.stroke();
      ctx.lineWidth = 1;
    } else if (e.shieldT > 0) {
      const k = 1 - e.shieldT / SHIELD.breakFx;   // 0 = 방금 깨짐 → 1 = 파편 소멸
      ctx.strokeStyle = `rgba(216, 156, 170, ${(0.8 * (1 - k)).toFixed(2)})`;
      ctx.lineWidth = sd.breakPx;
      ctx.beginPath();
      ctx.arc(e.x, e.y - h * 0.35, h * sd.r + sd.breakR * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // **무적 링** (§0.7 K ①②). 「때려도 안 들어간다」가 화면에 없으면 무적 국면은 «안 죽는 결함»으로
  // 읽힌다 — 데미지 숫자(§0.7 H3)조차 안 뜨므로 화면에는 아무 단서도 없다.
  // 실드 전열과 **같은 색·같은 레이어**를 쓰되 «정면 호»가 아니라 **닫힌 원**이다: 실드는 방향이
  // 있고 무적은 없다는 것이 그 둘의 차이고, 그래서 새 색을 안 만든다
  for (const e of f.list) {
    if (!e.invuln) continue;
    const h = enemyH(e.kind);
    ctx.strokeStyle = `rgba(${hostileShield}, ${(0.4 + 0.4 * pulse).toFixed(2)})`;
    ctx.lineWidth = sd.px * (0.6 + 0.4 * pulse);
    ctx.beginPath();
    ctx.arc(e.x, e.y - h * 0.35, h * sd.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // **실드 돔** (§8.⑧ 실드 짐꾼) — 오라·방벽과 달리 **적보다 위**다. 돔은 바닥에 그린 반경이 아니라
  // 덮개라서, 지면에 깔면 «안에 든 적이 직사에 안 맞는다»가 아니라 «바닥이 파랗다»로 읽힌다.
  // 판정 반경을 그대로 그린다(화염 지대·산성 웅덩이와 같은 규약 — 안 보이면 카운터를 못 고른다)
  const brokenCompanies = new Set(f.companies.filter((co) => co.broken > 0).map((co) => co.id));
  const domes = f.list.filter((e) => ENEMY_STATS[e.kind].dome && !brokenCompanies.has(e.co));
  // Fill the union once. Interior overlaps are not extra protection and must not stack opacity.
  ctx.beginPath();
  for (const e of domes) {
    const rr = ENEMY_STATS[e.kind].dome!.r * map.outerR;
    ctx.moveTo(e.x + rr, e.y); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
  }
  ctx.fillStyle = getEffectSettings().reducedEffects ? "rgba(166, 99, 132, 0.02)" : "rgba(166, 99, 132, 0.035)";
  ctx.fill();
  ctx.strokeStyle = "rgba(188, 127, 153, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  for (let n = 0; n < domes.length; n++) {
    const e = domes[n];
    const rr = ENEMY_STATS[e.kind].dome!.r * map.outerR;
    const covered: [number, number][] = [];
    const tau = Math.PI * 2;
    let hidden = false;
    // A circle intersection covers one angular interval, not 48 separately searched samples.
    for (let j = 0; j < domes.length; j++) {
      if (j === n) continue;
      const o = domes[j], r = ENEMY_STATS[o.kind].dome!.r * map.outerR;
      const dx = o.x - e.x, dy = o.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < 1e-8 && Math.abs(r - rr) < 1e-8) { if (j < n) { hidden = true; break; } else continue; }
      if (r > rr && d2 <= (r - rr) ** 2) { hidden = true; break; }
      if (d2 >= (r + rr) ** 2 || (rr >= r && d2 <= (rr - r) ** 2)) continue;
      const d = Math.sqrt(d2), half = Math.acos(Math.max(-1, Math.min(1, (d2 + rr * rr - r * r) / (2 * d * rr))));
      const a = ((Math.atan2(dy, dx) - half) % tau + tau) % tau, b = a + half * 2;
      if (b <= tau) covered.push([a, b]);
      else { covered.push([a, tau]); covered.push([0, b - tau]); }
    }
    if (hidden) continue;
    covered.sort((a, b) => a[0] - b[0]);
    ctx.beginPath();
    const arc = (a: number, b: number) => {
      ctx.moveTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
      ctx.arc(e.x, e.y, rr, a, b);
    };
    let end = 0;
    for (const [a, b] of covered) {
      if (a > end) arc(end, a);
      end = Math.max(end, b);
      if (end >= tau) break;
    }
    if (end < tau) arc(end, tau);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Role marks sit above all actors/domes, below the final threat pass.
  for (const e of f.list) {
    drawEnemyRole(ctx, e);
    if (enemyIndicators(e).priority) {
      const h = enemyH(e.kind), st = ENEMY_STATS[e.kind];
      drawHpBar(ctx, e, h, st.air && e.perched === null ? -h * RENDER.air.lift : 0, 1);
    }
  }
}

/** Last world pass, above explosions: active intent, its source and its true boundary. */
export function drawThreatCues(ctx: CanvasRenderingContext2D, f: Field, map: GameMap): void {
  ctx.save();
  ctx.lineJoin = "round";
  const labels: Record<string, string> = { charge: "돌진", rock: "코어 투척", quake: "지형 분쇄", raise: "부활", summon: "증원" };
  const coreSectors = new Set<number>();
  for (const e of f.list) {
    const h = enemyH(e.kind);
    if ((e.atCore || e.firing) && !ENEMY_STATS[e.kind].scout) {
      const a = Math.atan2(e.y - map.cy, e.x - map.cx);
      const sector = Math.round(a * 4 / Math.PI);
      if (!coreSectors.has(sector)) {
        coreSectors.add(sector);
        ctx.save(); ctx.translate(map.cx + Math.cos(a) * 35, map.cy + Math.sin(a) * 35); ctx.rotate(a);
        ctx.strokeStyle = "#251614"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(0, 0); ctx.lineTo(7, 5); ctx.stroke();
        ctx.strokeStyle = "#ffb484"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    }
    const hit = ENEMY_STATS[e.kind].coreHit;
    const q = e.patIdx >= 0 && !e.patActing ? BOSS_PATTERNS[e.kind]?.[e.patIdx] : undefined;
    const coreTell = hit && (e.atCore || e.firing) && e.coreCd > 0 && e.coreCd <= 1.2;
    if (!q && !coreTell) continue;
    const aim = q ? e.patAim ?? e : { x: map.cx, y: map.cy };
    const k = q ? Math.min(1, e.patT / q.tell) : 1 - e.coreCd / 1.2;
    const radius = q?.r ? q.r * map.outerR : coreTell ? ENEMY.coreReach : h * 0.75;
    const boundary = () => {
      ctx.beginPath();
      if (q?.id === "charge") {
        const a = Math.atan2(aim.y - e.y, aim.x - e.x);
        const dx = Math.cos(a + Math.PI / 2) * radius, dy = Math.sin(a + Math.PI / 2) * radius;
        ctx.moveTo(e.x + dx, e.y + dy); ctx.lineTo(aim.x + dx, aim.y + dy);
        ctx.arc(aim.x, aim.y, radius, a + Math.PI / 2, a - Math.PI / 2, true);
        ctx.lineTo(e.x - dx, e.y - dy);
        ctx.arc(e.x, e.y, radius, a - Math.PI / 2, a + Math.PI / 2, true); ctx.closePath();
      } else ctx.arc(aim.x, aim.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.strokeStyle = "rgba(34, 15, 12, 0.9)"; ctx.lineWidth = 5; boundary();
    ctx.strokeStyle = "#ed7569"; ctx.lineWidth = 2; boundary();
    ctx.save();
    // Clip to the very same boundary: the hatch cannot imply a larger damage area.
    ctx.clip(); ctx.strokeStyle = "rgba(233, 99, 88, 0.2)"; ctx.lineWidth = 2;
    const minX = Math.min(e.x, aim.x) - radius, maxX = Math.max(e.x, aim.x) + radius;
    const minY = Math.min(e.y, aim.y) - radius, maxY = Math.max(e.y, aim.y) + radius;
    for (let x = minX - (maxY - minY); x < maxX; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, maxY); ctx.lineTo(x + maxY - minY, minY); ctx.stroke();
    }
    ctx.restore();
    const angle = Math.atan2(aim.y - e.y, aim.x - e.x), distance = Math.hypot(aim.x - e.x, aim.y - e.y);
    ctx.strokeStyle = "#ed7569"; ctx.lineWidth = 2;
    for (let d = h * 0.65; d < distance - radius; d += 36) {
      ctx.save(); ctx.translate(e.x + Math.cos(angle) * d, e.y + Math.sin(angle) * d); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(1, 0); ctx.lineTo(-4, 4); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = "#f2bc9a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, h * 0.54, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    const label = q ? labels[q.id] ?? "증원" : "코어 타격";
    const y = e.y - h * 0.82;
    ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const width = ctx.measureText(label).width + 12;
    ctx.fillStyle = "rgba(31, 18, 15, 0.92)"; ctx.fillRect(e.x - width / 2, y - 9, width, 18);
    ctx.fillStyle = "#ffc4ad"; ctx.fillText(label, e.x, y);
  }
  ctx.restore();
}

/** Pure presentation rule, also inspected by visual QA. No selection state enters simulation. */
export function enemyIndicators(e: Enemy): { priority: boolean; health: boolean; role: boolean } {
  const priority = e.cmdr || isBossKind(e.kind) || isMidKind(e.kind) || isEventKind(e.kind);
  const active = e.atCore || e.firing || e.breaking || e.hurt > 0;
  return { priority, health: priority || active, role: priority || active };
}

function drawEnemyRole(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const st = ENEMY_STATS[e.kind];
  const role = st.dome ? "shield" : st.breaker ? "breaker" : st.standoff !== undefined && !st.coreHit ? "ranged" : null;
  if (!role || !enemyIndicators(e).role) return;
  const h = enemyH(e.kind);
  const r = Math.max(3.5, Math.min(5.5, h * 0.14));
  ctx.save(); ctx.translate(e.x + h * 0.35, e.y - h * 0.22);
  ctx.strokeStyle = "#17202a"; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.fillStyle = role === "shield" ? "#bf8aa6" : role === "breaker" ? "#ffb979" : "#efe0aa";
  ctx.beginPath();
  if (role === "shield") {
    ctx.moveTo(-r, -r); ctx.lineTo(r, -r); ctx.lineTo(r * 0.8, r * 0.5); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 0.8, r * 0.5); ctx.closePath();
  } else if (role === "breaker") {
    ctx.rect(-r, -r, r * 2, r); ctx.rect(-r * 0.25, 0, r * 0.5, r * 1.25);
  } else {
    ctx.moveTo(-r, -r); ctx.lineTo(r * 1.2, 0); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.3, 0); ctx.closePath();
  }
  ctx.fill(); ctx.stroke(); ctx.restore();
}

/** **설치된 폭탄** (§8.⑥). 링이 곧 «몇 초 남았나»다 — 이것이 안 보이면 「6초 안에 눌러라」가
 * 화면 어디에도 안 적혀 있게 된다(§8.0의 방해 연출과 같은 이유: 원인이 화면에 있어야 한다).
 * 맥동은 남은 시간이 짧을수록 빨라진다. `f.t`의 사인파라 스크린샷 QA가 재현된다 */
function drawBomb(ctx: CanvasRenderingContext2D, e: Enemy, h: number, fuseSec: number, t: number): void {
  const r = h * 0.5;
  const k = Math.max(0, Math.min(1, e.fuseT / fuseSec));
  const beat = getEffectSettings().reducedMotion ? 0.65 : 0.5 + 0.5 * Math.sin(t * (6 + (1 - k) * 22));
  ctx.fillStyle = "#16120f";
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 92, 58, ${(0.4 + 0.5 * beat).toFixed(2)})`;
  ctx.lineWidth = 3;
  ctx.stroke();
  // 도화선 링 — 12시부터 시계방향으로 «남은 만큼»
  ctx.strokeStyle = "#ffd05a";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(e.x, e.y, r + 6, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineWidth = 1;
  // 심지 불꽃
  ctx.fillStyle = `rgba(255, 232, 156, ${(0.5 + 0.5 * beat).toFixed(2)})`;
  ctx.beginPath();
  ctx.arc(e.x, e.y - r - 6, 3 + 2 * beat, 0, Math.PI * 2);
  ctx.fill();
}

/** 적 개체 HP바 (감독 #5 V3). 폭·높이는 RENDER.hpBar — 월드 단위라 줌과 무관하게 두께가 일정하다 */
function drawHpBar(ctx: CanvasRenderingContext2D, e: Enemy, h: number, bob: number, alpha: number): void {
  const b = RENDER.hpBar;
  ctx.globalAlpha = alpha;
  const w = h * b.w;
  const x = e.x - w / 2;
  const y = e.y + bob - h * b.up;
  const p = Math.max(0, Math.min(1, e.hp / e.maxHp));
  ctx.fillStyle = "rgba(14, 12, 10, 0.85)";
  ctx.fillRect(x - 1, y - 1, w + 2, b.h + 2);
  // 목업의 적 HP바는 색이 변하지 않는 붉은 막대다 — 코어 HP바(초록→노랑→빨강)와 색이 겹치면
  // "내 것"과 "적 것"이 화면에서 안 갈린다
  ctx.fillStyle = "#e2492f";
  ctx.fillRect(x, y, w * p, b.h);
  ctx.globalAlpha = 1;
}

/** **보스 레일 돌파**의 유닛 위 레이어 (큐 1) — 레일에 남는 섬광 자국 + 튄 파편.
 * 지면 링(drawField)과 갈라 놓은 이유는 **가려지기 때문이다**: 돌파 지점은 정의상 레일 위라
 * 보스 스프라이트(표시 78)와 지나가는 열차 칸이 그 자리를 덮는다 — 지면에 그리면 이 연출의
 * 핵심인 "레일을 넘어왔다"가 화면에서 사라진다(첫 컷 실측). main.ts가 drawTrain 뒤에 부른다.
 * 여기도 **판정은 없다** — 순수 연출이다 */
export function drawBreach(ctx: CanvasRenderingContext2D, f: Field, map: GameMap): void {
  const b = f.breach;
  if (!b) return;
  const k = b.t / RENDER.breachFx;
  const fade = 1 - k;
  // 레일 호는 **가운데를 비운 두 토막**이다. 한 줄로 이으면(첫 컷 실측) ① 돌파 지점이 정의상
  // 레일 위라 밝은 띠가 보스 얼굴을 가로질러 덮고 ② "부순 자리"가 아니라 "빛나는 선"으로 읽힌다.
  // 비운 가운데가 곧 보스가 지나간 구멍이고, 양 토막은 그 양옆에 남은 자국이다.
  // gap은 보스 실루엣 반폭(39월드 = 0.21rad)보다 커야 한다 — 0.2로 잡았더니 둥근 캡이 선 굵기의
  // 절반씩(≈10월드) 양쪽에서 먹어 두 토막이 한 줄로 도로 붙었다(둘째 컷 실측).
  // **토막은 짧게 유지한다** — 길게 늘였더니(span 0.62) 두 토막이 다시 한 줄로 읽혀
  // "부순 자리"가 아니라 "레일이 빛난다"가 됐다(셋째 컷 실측). 그을음이 주고 섬광은 초반뿐이다
  const gap = 0.24;
  const span = gap + 0.2 + 0.1 * k;
  const seg = (r0: number, r1: number): void => {
    ctx.beginPath();
    ctx.arc(map.cx, map.cy, map.outerR, b.ang - r1, b.ang - r0);
    ctx.arc(map.cx, map.cy, map.outerR, b.ang + r0, b.ang + r1);
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(38, 24, 12, ${(0.6 * fade).toFixed(2)})`;
  ctx.lineWidth = 13 * fade + 4;
  seg(gap, span);
  // 가산 글로우 한 겹. 옅은 흰 선 하나만으로는 자갈 노반(갈색 잡티)에서 **먼지 자국**처럼 읽혔다 —
  // 목업의 어휘대로 따뜻한 쪽으로 달궈야 "부딪혀 부순 자리"가 된다(첫 컷 실측)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(255, 168, 66, ${(0.5 * fade * fade).toFixed(2)})`;
  ctx.lineWidth = 10 * fade + 2;
  seg(gap, gap + (span - gap) * 0.8);
  ctx.restore();
  ctx.strokeStyle = `rgba(255, 244, 214, ${(fade * fade).toFixed(2)})`;
  ctx.lineWidth = 3.5 * fade + 1;
  seg(gap, gap + (span - gap) * 0.5);
  // 파편은 보스가 **들어간 쪽**(코어 방향)으로 튄다. 개체별 난수를 쓰면 스크린샷 QA가 재현되지
  // 않으므로 인덱스에서 유도한다 (f.rnd()는 스폰 좌표 스트림이라 여기서 뽑으면 실측이 전부 밀린다 —
  // bobPhase·lane과 같은 함정)
  const h = enemyH(BOSS.kind);
  ctx.strokeStyle = `rgba(238, 226, 198, ${(0.9 * fade).toFixed(2)})`;
  ctx.lineWidth = 4 * fade + 1;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = b.ang + Math.PI + ((i + 0.5) / 9 - 0.5) * 2.6;
    const reach = h * (0.5 + (0.7 * ((i * 7) % 5)) / 4);
    // 시작점을 보스 실루엣 밖에 둔다 — 안쪽에서 시작하면 파편이 스프라이트에 먹혀 안 보인다
    const d0 = h * 0.55 + reach * k;
    const d1 = d0 + reach * 0.55 * fade;
    ctx.moveTo(b.x + Math.cos(a) * d0, b.y + Math.sin(a) * d0);
    ctx.lineTo(b.x + Math.cos(a) * d1, b.y + Math.sin(a) * d1);
  }
  ctx.stroke();
  ctx.lineCap = "butt";
}
