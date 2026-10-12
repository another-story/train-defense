// The game and audition page share these exact, locally hosted sample cues.
// Source recordings, edit recipes, and licenses: docs/audio/SOURCES.md.
import { BOSS_PATTERNS, ENEMY_STATS, GATE_TEXT } from "./balance";
import type { ActionEvent } from "./action-events";

const CUES = {
  machinegun: {"name": "기관총 · 발사", "category": "train", "description": "짧은 실사 총성에 노리쇠 금속 클릭을 겹친 한 발.", "url": "/audio/v2/machinegun.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://kenney.nl/assets/rpg-audio"], "duration": 0.22, "bytes": 10604, "minInterval": 0.065, "priority": 1, "gain": 0.52},
  machinegunImpact: {"name": "기관총 · 명중", "category": "train", "description": "탄착의 짧은 살점 충격과 작은 금속 파편.", "url": "/audio/v2/machinegunImpact.wav", "sourceUrls": ["https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://kenney.nl/assets/impact-sounds"], "duration": 0.17, "bytes": 8204, "minInterval": 0.1, "priority": 1, "gain": 0.38},
  mortar: {"name": "박격포 · 발사", "category": "train", "description": "포신의 둔탁한 발사 충격과 짧은 공기 밀림.", "url": "/audio/v2/mortar.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://kenney.nl/assets/impact-sounds"], "duration": 0.36, "bytes": 17324, "minInterval": 0.15, "priority": 1, "gain": 0.68},
  mortarImpact: {"name": "박격포 · 폭발", "category": "train", "description": "낮은 폭압 다음에 흙과 잔해가 무너지는 폭발.", "url": "/audio/v2/mortarImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 0.95, "bytes": 45644, "minInterval": 0.16, "priority": 1, "gain": 0.7},
  flamer: {"name": "화염방사 · 분사", "category": "train", "description": "점화 클릭, 압력 분사, 실제 불꽃의 연속적인 균열음.", "url": "/audio/v2/flamer.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://kenney.nl/assets/sci-fi-sounds", "https://opengameart.org/content/fire-crackling"], "duration": 0.58, "bytes": 27882, "minInterval": 0.32, "priority": 1, "gain": 0.56},
  flamerImpact: {"name": "화염방사 · 연소", "category": "train", "description": "타는 불꽃의 작은 파열과 젖은 표면의 짧은 치익.", "url": "/audio/v2/flamerImpact.wav", "sourceUrls": ["https://opengameart.org/content/fire-crackling", "https://opengameart.org/content/8-wet-squish-slurp-impacts"], "duration": 0.3, "bytes": 14444, "minInterval": 0.22, "priority": 1, "gain": 0.32},
  rail: {"name": "레일건 · 발사", "category": "train", "description": "전자 가속음 뒤에 단단한 관통 충격이 붙는 고속 발사.", "url": "/audio/v2/rail.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://opengameart.org/content/gunshots", "https://kenney.nl/assets/impact-sounds"], "duration": 0.45, "bytes": 21644, "minInterval": 0.13, "priority": 1, "gain": 0.7},
  railImpact: {"name": "레일건 · 관통", "category": "train", "description": "단단한 금속 관통음과 유리질 파편의 긴 꼬리.", "url": "/audio/v2/railImpact.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds"], "duration": 0.47, "bytes": 22604, "minInterval": 0.12, "priority": 1, "gain": 0.55},
  laser: {"name": "레이저 · 발사", "category": "train", "description": "높은 피치 없이 낮게 지직거리는 짧고 작은 전류음.", "url": "/audio/v3/laser.wav", "sourceUrls": [], "duration": 0.24, "bytes": 11564, "minInterval": 0.14, "priority": 1, "gain": 0.19},
  laserImpact: {"name": "레이저 · 명중", "category": "train", "description": "표면에서 작게 끊기는 낮은 전기 잡음.", "url": "/audio/v3/laserImpact.wav", "sourceUrls": [], "duration": 0.14, "bytes": 6764, "minInterval": 0.18, "priority": 1, "gain": 0.14},
  tesla: {"name": "테슬라 · 방전", "category": "train", "description": "멀리서 낮게 구르는 천둥과 짧은 방전. 크고 날카로운 파열은 줄였습니다.", "url": "/audio/v3/tesla.wav", "sourceUrls": [], "duration": 0.54, "bytes": 25964, "minInterval": 0.3, "priority": 1, "gain": 0.22},
  teslaImpact: {"name": "테슬라 · 감전", "category": "train", "description": "작은 저역 방전과 빠르게 사라지는 낮은 울림.", "url": "/audio/v3/teslaImpact.wav", "sourceUrls": [], "duration": 0.25, "bytes": 12044, "minInterval": 0.25, "priority": 1, "gain": 0.16},
  missile: {"name": "유도미사일 · 발사", "category": "train", "description": "발사관의 잠금 해제 뒤로 길게 빠져나가는 단발 추진음.", "url": "/audio/v2/missile.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.64, "bytes": 30764, "minInterval": 0.2, "priority": 1, "gain": 0.63},
  missileImpact: {"name": "유도미사일 · 폭발", "category": "train", "description": "날카로운 폭발 시작과 무거운 저역 잔향.", "url": "/audio/v2/missileImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.86, "bytes": 41324, "minInterval": 0.17, "priority": 1, "gain": 0.7},
  mlrs: {"name": "다연장로켓 · 연속 발사", "category": "train", "description": "세 발이 엇갈려 나가는 발사관 충격과 짧은 로켓 추진음.", "url": "/audio/v2/mlrs.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 0.56, "bytes": 26924, "minInterval": 0.3, "priority": 1, "gain": 0.65},
  mlrsImpact: {"name": "다연장로켓 · 집속 폭발", "category": "train", "description": "시차를 둔 세 번의 작은 폭발과 파편.", "url": "/audio/v2/mlrsImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.65, "bytes": 31244, "minInterval": 0.22, "priority": 1, "gain": 0.62},
  sniper: {"name": "저격포 · 발사", "category": "train", "description": "날카로운 실사 매그넘 발사음과 늦게 닫히는 장전 장치.", "url": "/audio/v2/sniper.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://kenney.nl/assets/rpg-audio"], "duration": 0.57, "bytes": 27402, "minInterval": 0.2, "priority": 1, "gain": 0.76},
  sniperImpact: {"name": "저격포 · 명중", "category": "train", "description": "한 점에 집중된 강한 살점 타격과 금속 파편.", "url": "/audio/v2/sniperImpact.wav", "sourceUrls": ["https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://kenney.nl/assets/impact-sounds"], "duration": 0.33, "bytes": 15884, "minInterval": 0.14, "priority": 1, "gain": 0.54},
  cannon: {"name": "중포 · 발사", "category": "train", "description": "큰 화약 폭압에 무거운 포미 금속음을 더한 단발 포성.", "url": "/audio/v2/cannon.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://kenney.nl/assets/impact-sounds", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.68, "bytes": 32684, "minInterval": 0.22, "priority": 1, "gain": 0.78},
  cannonImpact: {"name": "중포 · 명중", "category": "train", "description": "중량감 있는 일격과 돌·철판 파편의 붕괴.", "url": "/audio/v2/cannonImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 0.98, "bytes": 47084, "minInterval": 0.2, "priority": 1, "gain": 0.75},
  incendiary: {"name": "소이탄 · 발사", "category": "train", "description": "탄통의 짧은 발사 충격 뒤로 빠르게 날아가는 공기음.", "url": "/audio/v2/incendiary.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://opengameart.org/content/battle-sound-effects"], "duration": 0.36, "bytes": 17324, "minInterval": 0.2, "priority": 1, "gain": 0.6},
  incendiaryImpact: {"name": "소이탄 · 착화", "category": "train", "description": "탄통 파열 다음에 불이 번지는 지속적인 불꽃.", "url": "/audio/v2/incendiaryImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://opengameart.org/content/fire-crackling"], "duration": 0.86, "bytes": 41324, "minInterval": 0.26, "priority": 1, "gain": 0.63},
  flak: {"name": "대공포 · 발사", "category": "train", "description": "철제 포신의 빠른 이중 충격을 가진 대공 사격.", "url": "/audio/v2/flak.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://kenney.nl/assets/impact-sounds"], "duration": 0.23, "bytes": 11084, "minInterval": 0.1, "priority": 1, "gain": 0.62},
  flakImpact: {"name": "대공포 · 공중 파열", "category": "train", "description": "짧은 폭발 주변으로 흩어지는 밝은 파편.", "url": "/audio/v2/flakImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 0.38, "bytes": 18284, "minInterval": 0.13, "priority": 1, "gain": 0.5},
  heroWarn: {"name": "조준포격 · 발사 예고", "category": "train", "description": "포격 발사 장치가 잠기고 공중으로 올라가는 긴 추진음.", "url": "/audio/v2/heroWarn.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 0.73, "bytes": 35084, "minInterval": 0.4, "priority": 3, "gain": 0.85},
  heroImpact: {"name": "조준포격 · 대폭발", "category": "train", "description": "큰 폭압, 잔해 붕괴, 지면의 낮은 울림이 이어지는 포격.", "url": "/audio/v2/heroImpact.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 1.65, "bytes": 79244, "minInterval": 0.4, "priority": 3, "gain": 0.9},
  enemyZombie: {"name": "언데드 · 물어뜯기", "category": "enemy", "description": "녹음된 괴물의 목소리와 젖은 살점 공격.", "url": "/audio/v2/enemyZombie.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://opengameart.org/content/8-wet-squish-slurp-impacts"], "duration": 0.43, "bytes": 20684, "minInterval": 0.3, "priority": 2, "gain": 0.64},
  enemyBeast: {"name": "야수 · 물기", "category": "enemy", "description": "거친 짐승의 짧은 으르렁거림과 턱의 충격.", "url": "/audio/v2/enemyBeast.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 0.46, "bytes": 22124, "minInterval": 0.28, "priority": 2, "gain": 0.65},
  enemyBone: {"name": "해골 · 뼈 타격", "category": "enemy", "description": "마른 뼈처럼 부딪히는 나무 충격과 작은 파편.", "url": "/audio/v2/enemyBone.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds"], "duration": 0.28, "bytes": 13484, "minInterval": 0.25, "priority": 2, "gain": 0.55},
  enemyBlade: {"name": "전사 · 베기", "category": "enemy", "description": "칼날을 휘두르는 소리와 둔탁한 근접 타격.", "url": "/audio/v2/enemyBlade.wav", "sourceUrls": ["https://opengameart.org/content/battle-sound-effects", "https://kenney.nl/assets/rpg-audio"], "duration": 0.46, "bytes": 22124, "minInterval": 0.25, "priority": 2, "gain": 0.61},
  enemyHeavy: {"name": "거인 · 강타", "category": "enemy", "description": "낮은 괴물의 기합과 무게가 실린 주먹 충격.", "url": "/audio/v2/enemyHeavy.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 0.64, "bytes": 30764, "minInterval": 0.4, "priority": 2, "gain": 0.8},
  enemyMetal: {"name": "기계 · 금속 충돌", "category": "enemy", "description": "철판과 기어가 맞부딪치는 거친 금속 타격.", "url": "/audio/v2/enemyMetal.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.49, "bytes": 23564, "minInterval": 0.3, "priority": 2, "gain": 0.7},
  enemyBow: {"name": "궁수 · 화살", "category": "enemy", "description": "활시위를 놓는 실제 활 소리.", "url": "/audio/v2/enemyBow.wav", "sourceUrls": ["https://opengameart.org/content/battle-sound-effects"], "duration": 0.45, "bytes": 21644, "minInterval": 0.24, "priority": 2, "gain": 0.57},
  enemyMusket: {"name": "도적 · 머스킷", "category": "enemy", "description": "흑색화약 총성에 장전 금속 클릭을 더한 사격.", "url": "/audio/v2/enemyMusket.wav", "sourceUrls": ["https://opengameart.org/content/gunshots", "https://kenney.nl/assets/rpg-audio"], "duration": 0.44, "bytes": 21164, "minInterval": 0.3, "priority": 2, "gain": 0.66},
  enemyMortar: {"name": "박격포반 · 사격", "category": "enemy", "description": "작은 발사관의 퉁 하는 충격과 포탄의 바람 소리.", "url": "/audio/v2/enemyMortar.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds", "https://opengameart.org/content/gunshots", "https://opengameart.org/content/battle-sound-effects"], "duration": 0.43, "bytes": 20684, "minInterval": 0.35, "priority": 2, "gain": 0.65},
  enemySpit: {"name": "산성 · 분사", "category": "enemy", "description": "젖은 입에서 액체가 튀어나오고 바닥에 흩어지는 소리.", "url": "/audio/v2/enemySpit.wav", "sourceUrls": ["https://opengameart.org/content/8-wet-squish-slurp-impacts"], "duration": 0.53, "bytes": 25484, "minInterval": 0.32, "priority": 2, "gain": 0.64},
  enemySlime: {"name": "슬라임 · 점액 타격", "category": "enemy", "description": "부드러운 덩어리가 찌그러지는 젖은 충격.", "url": "/audio/v2/enemySlime.wav", "sourceUrls": ["https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.43, "bytes": 20684, "minInterval": 0.31, "priority": 2, "gain": 0.61},
  enemyTentacle: {"name": "촉수 · 후려치기", "category": "enemy", "description": "길게 휘두르는 소리 뒤에 무거운 젖은 타격.", "url": "/audio/v2/enemyTentacle.wav", "sourceUrls": ["https://opengameart.org/content/battle-sound-effects", "https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://opengameart.org/content/monster-sound-effects-pack"], "duration": 0.64, "bytes": 30764, "minInterval": 0.4, "priority": 2, "gain": 0.76},
  enemyWing: {"name": "비행 괴물 · 할퀴기", "category": "enemy", "description": "빠른 날개·발톱 소리와 짧은 괴물의 외침.", "url": "/audio/v2/enemyWing.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://opengameart.org/content/battle-sound-effects", "https://kenney.nl/assets/impact-sounds"], "duration": 0.42, "bytes": 20204, "minInterval": 0.3, "priority": 2, "gain": 0.62},
  enemyGnaw: {"name": "벌레·쥐 · 갉기", "category": "enemy", "description": "짧은 젖은 물기 두 번과 마른 이빨 충격.", "url": "/audio/v2/enemyGnaw.wav", "sourceUrls": ["https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://kenney.nl/assets/rpg-audio"], "duration": 0.29, "bytes": 13962, "minInterval": 0.32, "priority": 2, "gain": 0.56},
  enemyRock: {"name": "투석 · 바위", "category": "enemy", "description": "바위를 던지는 스침과 돌끼리 부딪치는 소리.", "url": "/audio/v2/enemyRock.wav", "sourceUrls": ["https://opengameart.org/content/battle-sound-effects", "https://kenney.nl/assets/impact-sounds"], "duration": 0.64, "bytes": 30764, "minInterval": 0.45, "priority": 2, "gain": 0.76},
  enemyCharge: {"name": "돌진 · 충돌", "category": "enemy", "description": "거친 기합과 빠르게 이어지는 무거운 발걸음·충격.", "url": "/audio/v2/enemyCharge.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 0.65, "bytes": 31244, "minInterval": 0.6, "priority": 2, "gain": 0.8},
  enemyQuake: {"name": "지진 · 지면 강타", "category": "enemy", "description": "바닥이 내려앉는 큰 충격 뒤로 돌이 굴러가는 저역 울림.", "url": "/audio/v2/enemyQuake.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 1.13, "bytes": 54282, "minInterval": 0.8, "priority": 3, "gain": 0.82},
  enemySummon: {"name": "포효 · 소환", "category": "enemy", "description": "실제 괴물 보컬을 중심에 둔 길고 낮은 소환 포효.", "url": "/audio/v2/enemySummon.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 1.08, "bytes": 51884, "minInterval": 0.85, "priority": 3, "gain": 0.78},
  enemyRaise: {"name": "강령술 · 부활", "category": "enemy", "description": "뒤집힌 숨소리가 모인 뒤 뼈와 돌이 올라오는 소리.", "url": "/audio/v2/enemyRaise.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 1.05, "bytes": 50444, "minInterval": 0.8, "priority": 3, "gain": 0.74},
  enemyPlant: {"name": "공작원 · 폭탄 설치", "category": "enemy", "description": "바닥에 놓는 금속 덩어리와 도화선의 잠금 클릭.", "url": "/audio/v2/enemyPlant.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds", "https://kenney.nl/assets/rpg-audio"], "duration": 0.45, "bytes": 21644, "minInterval": 0.4, "priority": 2, "gain": 0.66},
  enemyExplode: {"name": "폭탄·박쥐 · 자폭", "category": "enemy", "description": "날카로운 파열과 짧지만 무거운 폭발.", "url": "/audio/v2/enemyExplode.wav", "sourceUrls": ["https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.7, "bytes": 33644, "minInterval": 0.4, "priority": 3, "gain": 0.82},
  enemyBreak: {"name": "공성 · 벽 파괴", "category": "enemy", "description": "나무와 광물이 갈라지고 무너지는 파편 소리.", "url": "/audio/v2/enemyBreak.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds"], "duration": 0.72, "bytes": 34604, "minInterval": 0.4, "priority": 2, "gain": 0.68},
  enemySpore: {"name": "포자 · 분출", "category": "enemy", "description": "마른 껍질이 열리고 작은 젖은 포자가 터지는 소리.", "url": "/audio/v2/enemySpore.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://kenney.nl/assets/impact-sounds"], "duration": 0.4, "bytes": 19244, "minInterval": 0.45, "priority": 2, "gain": 0.57},
  enemySmoke: {"name": "연막차 · 분사", "category": "enemy", "description": "밸브가 열리며 압축된 연막을 길게 내뿜는 소리.", "url": "/audio/v2/enemySmoke.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.63, "bytes": 30284, "minInterval": 0.8, "priority": 2, "gain": 0.54},
  enemyHeal: {"name": "주술사 · 회복", "category": "enemy", "description": "작은 금속 울림과 부드럽게 모이는 괴물의 숨소리.", "url": "/audio/v2/enemyHeal.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds", "https://opengameart.org/content/monster-sound-effects-pack"], "duration": 0.56, "bytes": 26924, "minInterval": 1.3, "priority": 2, "gain": 0.44},
  enemyBuff: {"name": "방벽 · 강화", "category": "enemy", "description": "단단한 금속 울림이 두 겹으로 펼쳐지는 방벽.", "url": "/audio/v2/enemyBuff.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds", "https://kenney.nl/assets/sci-fi-sounds"], "duration": 0.59, "bytes": 28364, "minInterval": 1.2, "priority": 2, "gain": 0.47},
  enemyDrum: {"name": "전투 북 · 타격", "category": "enemy", "description": "가죽을 치는 낮은 두 번의 박자.", "url": "/audio/v2/enemyDrum.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds"], "duration": 0.53, "bytes": 25484, "minInterval": 0.5, "priority": 2, "gain": 0.58},
  impact: {"name": "일반 · 타격", "category": "system", "description": "살점과 작은 파편이 섞인 짧은 보조 타격음.", "url": "/audio/v2/impact.wav", "sourceUrls": ["https://opengameart.org/content/8-wet-squish-slurp-impacts", "https://kenney.nl/assets/impact-sounds"], "duration": 0.24, "bytes": 11564, "minInterval": 0.13, "priority": 1, "gain": 0.38},
  death: {"name": "적 · 쓰러짐", "category": "system", "description": "짧은 괴물의 숨과 몸이 떨어지는 둔탁한 소리.", "url": "/audio/v2/death.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 0.47, "bytes": 22604, "minInterval": 0.22, "priority": 1, "gain": 0.46},
  coreDamage: {"name": "코어 · 수정 피격", "category": "system", "description": "수정 암석을 두드리는 단단한 충격과 짧고 낮은 결정 울림.", "url": "/audio/v4/coreDamage.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds"], "duration": 0.36, "bytes": 17324, "minInterval": 0.2, "priority": 4, "gain": 0.58},
  lowHp: {"name": "코어 · 위험 경보", "category": "system", "description": "산업용 경종처럼 두 번 울리는 짧은 금속 벨.", "url": "/audio/v2/lowHp.wav", "sourceUrls": ["https://kenney.nl/assets/impact-sounds"], "duration": 0.86, "bytes": 41324, "minInterval": 3, "priority": 4, "gain": 0.82},
  boss: {"name": "보스 · 출현", "category": "system", "description": "낮고 긴 괴물의 포효와 무거운 금속 울림.", "url": "/audio/v2/boss.wav", "sourceUrls": ["https://opengameart.org/content/monster-sound-effects-pack", "https://kenney.nl/assets/impact-sounds"], "duration": 1.55, "bytes": 74444, "minInterval": 3, "priority": 4, "gain": 0.85},
  card: {"name": "카드 · 획득", "category": "system", "description": "종이 넘김과 가벼운 금속 확인음.", "url": "/audio/v2/card.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://kenney.nl/assets/impact-sounds"], "duration": 0.49, "bytes": 23564, "minInterval": 0.15, "priority": 2, "gain": 0.58},
  shop: {"name": "상점 · 구매", "category": "system", "description": "동전이 부딪히고 금속 걸쇠가 닫히는 소리.", "url": "/audio/v2/shop.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio"], "duration": 0.43, "bytes": 20684, "minInterval": 0.15, "priority": 2, "gain": 0.58},
  depart: {"name": "열차 · 출발", "category": "system", "description": "견인 장치가 걸리고 엔진 압력이 올라가는 소리.", "url": "/audio/v2/depart.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio", "https://kenney.nl/assets/sci-fi-sounds", "https://kenney.nl/assets/impact-sounds"], "duration": 0.86, "bytes": 41324, "minInterval": 0.5, "priority": 2, "gain": 0.68},
  ui: {"name": "버튼 · 선택", "category": "system", "description": "빠르고 작게 닫히는 기계식 클릭.", "url": "/audio/v2/ui.wav", "sourceUrls": ["https://kenney.nl/assets/rpg-audio"], "duration": 0.12, "bytes": 5804, "minInterval": 0.055, "priority": 2, "gain": 0.42},
} as const;
export type SoundName = keyof typeof CUES;
export type SoundEntry = {
  id: SoundName; name: string; category: "train" | "enemy" | "system";
  description: string; url: string; sourceUrls: readonly string[];
  duration: number; bytes: number; minInterval: number; priority: number; gain: number;
};
export const SOUND_NAMES = Object.keys(CUES) as SoundName[];
export const SOUND_CATALOG: readonly SoundEntry[] = SOUND_NAMES.map(id => ({ id, ...CUES[id] }));
export const SOUND_BY_ID = Object.fromEntries(SOUND_CATALOG.map(cue => [cue.id, cue])) as Record<SoundName, SoundEntry>;

export const WEAPON_SOUND_MAP: Record<string, { fire: SoundName; impact: SoundName }> = {
  machinegun: { fire: "machinegun", impact: "machinegunImpact" },
  mortar: { fire: "mortar", impact: "mortarImpact" },
  flamer: { fire: "flamer", impact: "flamerImpact" },
  railgun: { fire: "rail", impact: "railImpact" },
  laser: { fire: "laser", impact: "laserImpact" },
  tesla: { fire: "tesla", impact: "teslaImpact" },
  missile: { fire: "missile", impact: "missileImpact" },
  mlrs: { fire: "mlrs", impact: "mlrsImpact" },
  sniper: { fire: "sniper", impact: "sniperImpact" },
  cannon: { fire: "cannon", impact: "cannonImpact" },
  incendiary: { fire: "incendiary", impact: "incendiaryImpact" },
  flak: { fire: "flak", impact: "flakImpact" },
  hero: { fire: "heroWarn", impact: "heroImpact" },
};

type EnemySound = { family: string; name: string; actions: Partial<Record<ActionEvent["action"], SoundName>> };
// Material/vocal identity is explicit. Palette variants inherit their actual base.
const ENEMY_FAMILY: Record<string, readonly [string, SoundName]> = {
  zombie: ["언데드", "enemyZombie"], hound: ["야수", "enemyBeast"],
  archer: ["활", "enemyBlade"], shield_orc: ["무장 전사", "enemyBlade"],
  mortar_team: ["화약", "enemyBlade"], slime: ["점액", "enemySlime"],
  slime_mid: ["점액", "enemySlime"], slime_small: ["점액", "enemySlime"],
  drummer: ["전투 북", "enemyDrum"], swamp_crawler: ["수생 생물", "enemyBeast"],
  frog_warrior: ["수생 전사", "enemyBlade"], landing_craft: ["기계", "enemyMetal"],
  abyss_tentacle: ["촉수", "enemyTentacle"], bomb_bat: ["비행 생물", "enemyWing"],
  gargoyle: ["돌·발톱", "enemyWing"], scout_drone: ["정찰 기계 · 공격 없음", "enemyMetal"],
  zeppelin: ["기계", "enemyMetal"], wyvern: ["비행 야수", "enemyWing"],
  siege_worm: ["갉기", "enemyGnaw"], saboteur: ["폭파 장치", "enemyBlade"],
  hook_raider: ["갈고리", "enemyBlade"], siege_ram: ["공성 기계", "enemyMetal"],
  sabo_bomb: ["폭파 장치", "enemyExplode"], goblin_raider: ["무장 전사", "enemyBlade"],
  skeleton: ["뼈", "enemyBone"], frenzy_boar: ["야수", "enemyBeast"],
  rat_swarm: ["갉기", "enemyGnaw"], rat: ["갉기", "enemyGnaw"],
  troll: ["거인", "enemyHeavy"], scrap_golem: ["금속", "enemyMetal"],
  armor_beetle: ["단단한 껍질", "enemyBone"], armored_truck: ["기계", "enemyMetal"],
  musket_bandit: ["흑색화약", "enemyBlade"], acid_spitter: ["산성", "enemySpit"],
  shadow_assassin: ["칼날", "enemyBlade"], acid_slime: ["점액", "enemySlime"],
  acid_slime_small: ["점액", "enemySlime"], slime_queen: ["점액", "enemySlime"],
  necromancer: ["강령술", "enemyZombie"], spore_trent: ["나무·포자", "enemySpore"],
  spore_ling: ["포자", "enemyGnaw"], orc_shaman: ["주술", "enemyBlade"],
  shield_bearer: ["금속 방패", "enemyMetal"], smoke_truck: ["압축 연막", "enemyMetal"],
  banner_lord: ["방벽", "enemyBlade"], ogre: ["거인", "enemyHeavy"],
  boss_gram: ["거인 보스", "enemyHeavy"], necro_lord: ["강령술 보스", "enemyZombie"],
  bone_hound: ["뼈 야수", "enemyBone"], iron_orc: ["강철 전사", "enemyMetal"],
};
const ENEMY_NAMES: Record<string, string> = {
  zombie: "좀비",
  hound: "좀비 사냥개",
  archer: "고블린 궁수",
  shield_orc: "방패 오크",
  mortar_team: "고블린 박격포반",
  slime: "슬라임",
  slime_mid: "슬라임(중)",
  slime_small: "슬라임(소)",
  drummer: "워 드러머",
  swamp_crawler: "늪 크롤러",
  frog_warrior: "독개구리 전사",
  landing_craft: "상륙정",
  abyss_tentacle: "심연 촉수",
  bomb_bat: "폭격 박쥐",
  gargoyle: "가고일",
  scout_drone: "정찰 드론",
  zeppelin: "수송 비행선",
  wyvern: "와이번",
  siege_worm: "공성충",
  saboteur: "폭파공작원",
  hook_raider: "갈고리 강습병",
  siege_ram: "공성 램",
  sabo_bomb: "설치 폭탄",
  goblin_raider: "고블린 약탈자",
  skeleton: "해골 보병",
  frenzy_boar: "광란 멧돼지",
  rat_swarm: "쥐떼 우두머리",
  rat: "쥐",
  troll: "트롤",
  scrap_golem: "스크랩 골렘",
  armor_beetle: "철갑 딱정벌레",
  armored_truck: "장갑 트럭",
  musket_bandit: "머스킷 도적",
  acid_spitter: "산성 뱉기",
  shadow_assassin: "그림자 암살자",
  acid_slime: "산성 슬라임",
  acid_slime_small: "산성 슬라임(소)",
  slime_queen: "슬라임 퀸",
  necromancer: "네크로맨서",
  spore_trent: "포자 트렌트",
  spore_ling: "포자링",
  orc_shaman: "오크 주술사",
  shield_bearer: "실드 베어러",
  smoke_truck: "연막차",
  banner_lord: "배너 로드",
  ogre: "오우거",
  boss_gram: "오우거 대족장 그람",
  plague_zombie: "역병 좀비",
  bone_hound: "뼈 사냥개",
  iron_orc: "강철 오크",
  rust_truck: "녹슨 트럭",
  venom_spitter: "맹독 뱉기",
  bog_crawler: "이끼 크롤러",
  ember_bat: "잿불 박쥐",
  hawk_drone: "매 드론",
  grub_worm: "유충 공성충",
  tar_slime: "타르 슬라임",
  pale_necromancer: "창백한 네크로맨서",
  blood_shaman: "피의 주술사",
  ogre_chief: "오우거 대장",
  troll_chief: "트롤 대장",
  abyss_chief: "심연의 주인",
  ram_chief: "공성 램 대장",
  queen_chief: "슬라임 여왕",
  necro_chief: "대네크로맨서",
  banner_chief: "대배너 로드",
};

export const ENEMY_SOUND_MAP: Record<string, EnemySound> = {};
for (const [kind, stats] of Object.entries(ENEMY_STATS)) {
  const base = stats.palette?.of ?? kind;
  const identity = ENEMY_FAMILY[kind] ?? ENEMY_FAMILY[base];
  if (!identity) continue; // Coverage QA fails on new, unclassified species.
  const [family, melee] = identity;
  const actions: EnemySound["actions"] = {};
  if (!stats.scout && !stats.fuse && !stats.suicide && !stats.plant) actions.melee = melee;
  if (stats.standoff) actions.shot = base === "archer" ? "enemyBow" : base === "mortar_team" ? "enemyMortar" : base === "musket_bandit" ? "enemyMusket" : stats.spit ? "enemySpit" : melee;
  if (stats.spit) actions.spit = "enemySpit";
  if (stats.breaker) actions.break = "enemyBreak";
  if (stats.suicide || stats.fuse) actions.explode = "enemyExplode";
  if (stats.plant) actions.plant = "enemyPlant";
  if (stats.raise || stats.revive) actions.raise = "enemyRaise";
  if (stats.spawner || stats.split) actions.summon = base.includes("slime") ? "enemySlime" : "enemyGnaw";
  if (stats.spore) actions.summon = "enemySpore";
  if (stats.cargo) actions.summon = "enemyMetal";
  if (stats.roar) actions.summon = "enemySummon";
  if (stats.smoke) actions.smoke = "enemySmoke";
  if (stats.heal || stats.regen) actions.heal = "enemyHeal";
  if (stats.aura || stats.banner || stats.dome) actions.buff = base === "drummer" ? "enemyDrum" : "enemyBuff";
  for (const pattern of BOSS_PATTERNS[kind] ?? []) {
    actions[pattern.id] = ({ charge: "enemyCharge", summon: "enemySummon", rock: "enemyRock", quake: "enemyQuake", raise: "enemyRaise" } as const)[pattern.id];
  }
  ENEMY_SOUND_MAP[kind] = { family, name: GATE_TEXT[kind] ?? ENEMY_NAMES[kind] ?? kind, actions };
}

/** Presentation-only lookup; unknown kinds/actions stay silent. */
export function soundForAction(event: { source: "train" | "enemy"; kind: string; action: string; x: number; y: number }): SoundName | null {
  if (event.source === "train") {
    const weapon = WEAPON_SOUND_MAP[event.kind];
    return weapon && (event.action === "fire" || event.action === "impact") ? weapon[event.action] : null;
  }
  return ENEMY_SOUND_MAP[event.kind]?.actions[event.action as ActionEvent["action"]] ?? null;
}
