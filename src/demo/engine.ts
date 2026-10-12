// An isolated, finite demo. Shared balance constants, campaign progression and saves are never mutated.
import { ENEMY_STATS, TRAIN } from "../balance";
import { callStrike, makeCombat, updateCombat, updateTurrets, type Combat } from "../combat";
import { makeField, markEnemyAction, spawnEnemy, updateField, type Enemy, type Field } from "../enemy";
import { buildFlow, type Flow } from "../flow";
import { generateMap, mulberry32, type GameMap } from "../map";
import { buildTrack, insertCar, makeCar, makeTrain, updateTrain, type CarKind, type Train } from "../train";

export type DemoMode = "standard" | "scout" | "siege";
export const LOCOMOTIVES = {
  standard: { name: "표준 기관차", subtitle: "공통 개선만", description: "기본 속도·화력. 가속 ×1.9(2.4초), 집중 피해 ×1.3·순항 속도 45%(4초). 공통 쿨다운 12초.", strength: "균형 잡힌 주행과 화력", weakness: "기관차 특화 보너스 없음", color: "#e7b66a" },
  scout: { name: "정찰 기관차", subtitle: "빠른 화력 재배치", description: "속도 +25%, 자동 무기 피해 −12%. 가속 ×2.3(2.4초), 집중 피해 ×1.3·순항 속도 45%(4초). 공통 쿨다운 12초.", strength: "빠른 순환과 강한 가속", weakness: "지속 화력 −12%", color: "#75d9bd" },
  siege: { name: "공성 기관차", subtitle: "위치를 잡고 집중 사격", description: "속도 −20%, 자동 무기 피해 +15%. 가속 ×1.5(2.4초), 집중 피해 ×1.55·순항 속도 45%(4초). 공통 쿨다운 12초.", strength: "강한 지속 화력과 집중 사격", weakness: "느린 주행과 약한 재배치", color: "#f29076" },
} satisfies Record<DemoMode, { name: string; subtitle: string; description: string; strength: string; weakness: string; color: string }>;

const SHIELD_COUNTERS = ["치유사를 우선 표적으로 지정", "방패 측면으로 가속하거나 곡사·주포로 우회"];
const CHARGE_COUNTERS = ["주황색 예고 중 주포 적중으로 차단", "우선 표적 + 집중 사격으로 경직, 가속으로 전열 재배치"];
const CAST_COUNTERS = ["보라색 시전 중 주포 또는 집중 사격으로 차단", "매달린 사략꾼은 가속으로 떼어내거나 우선 처치"];
export const ROUNDS = [
  { name: "방패와 치유", brief: "치유사를 먼저 끊으면 방패 전열이 무너집니다.", counters: SHIELD_COUNTERS },
  { name: "겹친 전열", brief: "방패 뒤 지원병을 곡사와 주포로 공격하세요.", counters: SHIELD_COUNTERS },
  { name: "전열 돌파", brief: "양쪽에서 오는 치유 부대를 막고 첫 개조를 선택하세요.", counters: SHIELD_COUNTERS },
  { name: "돌진 예고", brief: "주황색 원이 차기 전에 공격하면 돌진을 차단합니다.", counters: CHARGE_COUNTERS },
  { name: "협공", brief: "돌진조 두 개가 다른 방향에서 접근합니다.", counters: CHARGE_COUNTERS },
  { name: "가속과 제압", brief: "가속으로 무기를 옮기고 집중 사격으로 돌진을 끊으세요.", counters: CHARGE_COUNTERS },
  { name: "주술과 갈고리", brief: "시전을 놓치면 코어가 피해를 입습니다. 가속은 부착 적을 떼어냅니다.", counters: CAST_COUNTERS },
  { name: "시전 차단", brief: "부착 적에 무기가 묶이기 전에 주술사를 차단하세요.", counters: CAST_COUNTERS },
  { name: "마지막 방어선", brief: "돌진과 시전을 함께 처리하고 보스전에 대비하세요.", counters: [...CAST_COUNTERS, CHARGE_COUNTERS[0]] },
  { name: "그람의 공성", brief: "보라색 강타 예고를 끊으면 4초 동안 약점 피해가 ×1.75가 됩니다.", counters: ["3초 강타 예고 중 주포 또는 집중 사격으로 차단", "초록 약점 창에 우선 표적과 주포를 집중"] },
];
export type DemoUpgrade = { id: string; name: string; description: string; detail: string };
const OFFERS: DemoUpgrade[][] = [
  [
    { id: "ap", name: "철갑 전열", description: "기관총 T3 철갑탄 + 관측칸", detail: "기관총의 탄이 성벽 1장과 일직선 적을 관통합니다. 관측칸 양옆 직사 무기는 언덕 너머를 공격합니다." },
    { id: "cluster", name: "집속 포대", description: "박격포 T3 집속탄 + 탄약고", detail: "박격포가 4발로 넓게 공격합니다. 탄약고 양옆 무기는 연사 +30%." },
    { id: "tesla", name: "근접 방전", description: "테슬라 T3 광역 방전 + 화염방사 T2", detail: "새 테슬라는 사선을 무시하고 최대 6기를 연결합니다. 근거리 무기를 앞으로 재배치하세요." },
  ],
  [
    { id: "rail", name: "공성 관통탄", description: "레일건 T3 공성 관통 + 관측칸", detail: "성벽 3장 관통·사거리 +15%. 관측칸을 레일건 곁에 두면 언덕도 넘습니다." },
    { id: "battery", name: "이중 박격포", description: "박격포 T2 추가 + 기존 박격포 레벨 +3", detail: "지형을 넘는 포탄을 늘립니다. 새 박격포의 분기는 독립적입니다." },
    { id: "close", name: "근접 화망", description: "화염방사 T3 압축 노즐 + 탄약고", detail: "화염 사거리 ×1.4, 좁은 부채꼴로 집중. 탄약고 양옆의 연사 +30%." },
  ],
  [
    { id: "precision", name: "보스 저격", description: "저격포 T3 철갑 저격 추가", detail: "단발 피해 ×2와 성벽 관통. 약점 창에 강한 일격을 넣습니다." },
    { id: "bunker", name: "벙커버스터", description: "박격포 T3 벙커버스터 추가", detail: "기존 집속탄은 그대로 유지합니다. 새 포대는 단발 ×2·넓은 폭발로 보스를 노립니다." },
    { id: "overload", name: "집중 방전", description: "테슬라 T3 집중 방전 + 기존 테슬라 레벨 +3", detail: "새 테슬라는 단일 대상 피해 ×3·사거리 ×1.2. 기존 광역 방전은 유지됩니다." },
  ],
];
const MODE_STATS = { standard: { speed: 1, damage: 1, boost: 1.9, focus: 1.3 }, scout: { speed: 1.25, damage: 0.88, boost: 2.3, focus: 1.3 }, siege: { speed: 0.8, damage: 1.15, boost: 1.5, focus: 1.55 } };
type Threat = { kind: "charge" | "cast" | "boss"; stage: "approach" | "tell" | "recover"; timer: number; duration: number; damage: number; weak: number; x: number; y: number };
type Spawn = { at: number; kind: string; angle: number; distance: number; threat?: Threat["kind"] };

export class DemoRun {
  map: GameMap;
  train: Train;
  field: Field;
  combat: Combat;
  phase: "combat" | "upgrade" | "won" | "lost" = "combat";
  round = 0;
  elapsed = 0;
  waveTime = 0;
  readonly roundDuration = 60;
  readonly roundLimit = 105;
  ability: "cruise" | "boost" | "focus" = "cruise";
  abilityLeft = 0;
  cooldown = 0;
  marked: Enemy | null = null;
  markLeft = 0;
  notice = "치유사 우선 표적 · 가속과 집중 사격은 12초 재사용 대기";
  noticeLeft = 7;
  choices: DemoUpgrade[] = [];
  chosenUpgrade: DemoUpgrade | null = null;
  history: string[] = [];
  cues: Array<{ x: number; y: number; r: number; kind: "charge" | "cast" | "weak"; progress: number; label: string }> = [];
  metrics = { commands: 0, marks: 0, interrupts: 0, weakHits: 0, shieldBreaks: 0 };
  private flow: Flow;
  private swim: Flow;
  private rnd;
  private timeline: Spawn[] = [];
  private spawnAt = 0;
  private threats = new Map<Enemy, Threat>();
  private detached = new Map<Enemy, number>();

  constructor(public mode: DemoMode, public seed = 7) {
    this.map = generateMap(seed);
    this.train = makeTrain(buildTrack(this.map.loop));
    this.field = makeField(this.map, seed);
    this.field.station = true; // Only the stock wave scheduler is suppressed; enemy movement still runs.
    this.combat = makeCombat(this.map, seed);
    this.combat.artCdMult = 0.8;
    this.rnd = mulberry32(seed + 9401);
    this.flow = buildFlow(this.map);
    this.swim = buildFlow(this.map, true);
    this.combat.damageScale = (e, kind) => (kind === "hero" ? 2.5 : 1) * (e.kind === "boss_gram" ? 0.35 : 1) * ((this.threats.get(e)?.weak ?? 0) > 0 ? 1.75 : 1);
    this.combat.onHit = (e, kind, damage) => this.onHit(e, kind, damage);
    this.startRound();
    this.updateStats();
  }

  private say(text: string): void { this.notice = text; this.noticeLeft = 3.5; }

  private updateStats(): void {
    const stats = MODE_STATS[this.mode];
    this.train.speed = this.train.track.total / TRAIN.lapTime * stats.speed * (this.ability === "boost" ? stats.boost : this.ability === "focus" ? 0.45 : 1);
    this.combat.pass.docDmg = stats.damage * (this.ability === "focus" ? stats.focus : 1);
  }

  command(kind: "boost" | "focus"): boolean {
    if (this.phase !== "combat" || this.cooldown > 0) return false;
    this.ability = kind;
    this.abilityLeft = kind === "boost" ? 2.4 : 4;
    this.cooldown = 12;
    this.metrics.commands++;
    if (kind === "boost") {
      let freed = 0;
      for (const e of this.field.list) if (e.perched !== null) {
        const d = Math.hypot(e.x - this.map.cx, e.y - this.map.cy) || 1;
        e.x += (e.x - this.map.cx) / d * 70;
        e.y += (e.y - this.map.cy) / d * 70;
        e.perched = null;
        this.detached.set(e, 2.4);
        freed++;
      }
      this.say(freed ? `가속! 부착 적 ${freed}기 이탈` : "가속! 2.4초 동안 빠르게 재배치");
    } else this.say("집중 사격! 4초 동안 감속하며 화력 증가");
    this.updateStats();
    return true;
  }

  mark(x: number, y: number): boolean {
    if (this.phase !== "combat") return false;
    let best: Enemy | null = null;
    let distance = 42;
    for (const e of this.field.list) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (e.hp > 0 && d < distance) { best = e; distance = d; }
    }
    return best ? this.setMark(best) : false;
  }

  private setMark(e: Enemy): boolean {
    this.marked = e;
    this.markLeft = 7;
    this.combat.priorityTarget = e;
    this.metrics.marks++;
    return true;
  }

  cycleTarget(): boolean {
    if (this.phase !== "combat") return false;
    const targets = this.field.list.filter(e => e.hp > 0).sort((a, b) => {
      const threat = (e: Enemy) => (this.threats.get(e)?.stage === "tell" ? 4 : 0) + (e.kind === "orc_shaman" ? 3 : 0) + (e.perched !== null ? 2 : 0);
      return threat(b) - threat(a) || Math.hypot(a.x - this.map.cx, a.y - this.map.cy) - Math.hypot(b.x - this.map.cx, b.y - this.map.cy);
    });
    if (!targets.length) return false;
    return this.setMark(targets[(targets.indexOf(this.marked!) + 1) % targets.length]);
  }

  strike(x: number, y: number): boolean {
    return this.phase === "combat" && Number.isFinite(x) && Number.isFinite(y) && callStrike(this.combat, x, y);
  }

  moveCar(index: number, dir: -1 | 1): boolean {
    const next = index + dir;
    if (this.phase !== "upgrade" || !Number.isInteger(index) || index <= 0 || next <= 0 || index >= this.train.cars.length || next >= this.train.cars.length) return false;
    [this.train.cars[index], this.train.cars[next]] = [this.train.cars[next], this.train.cars[index]];
    return true;
  }

  choose(id: string): boolean {
    const choice = this.choices.find(c => c.id === id);
    if (this.phase !== "upgrade" || this.chosenUpgrade || !choice) return false;
    const evolve = (kind: CarKind, branch: string) => {
      const car = this.train.cars.find(c => c.kind === kind)!;
      car.tier = 3; car.branch = branch; car.level += 2;
    };
    const add = (kind: CarKind, tier = 1, branch: string | null = null) => {
      const car = makeCar(kind, tier > 1 ? 2 : 0);
      car.tier = tier; car.branch = branch; insertCar(this.train, car);
    };
    switch (id) {
      case "ap": evolve("machinegun", "ap"); add("observer"); break;
      case "cluster": evolve("mortar", "cluster"); add("ammo"); break;
      case "tesla": add("tesla", 3, "arcstorm"); this.train.cars.find(c => c.kind === "flamer")!.tier = 2; break;
      case "rail": evolve("railgun", "siege"); add("observer"); break;
      case "battery": this.train.cars.find(c => c.kind === "mortar")!.level += 3; add("mortar", 2); break;
      case "close": evolve("flamer", "nozzle"); add("ammo"); break;
      case "precision": add("sniper", 3, "apshell"); break;
      case "bunker": add("mortar", 3, "bunker"); break;
      case "overload": for (const car of this.train.cars) if (car.kind === "tesla") car.level += 3; add("tesla", 3, "focus"); break;
    }
    this.history.push(choice.name);
    this.chosenUpgrade = choice;
    this.choices = [];
    this.say("개조 완료 · 새 지원칸과 무기를 배치한 뒤 출발하세요");
    return true;
  }

  depart(): boolean {
    if (this.phase !== "upgrade" || !this.chosenUpgrade) return false;
    this.chosenUpgrade = null;
    this.round++;
    this.phase = "combat";
    this.startRound();
    return true;
  }

  private startRound(): void {
    this.waveTime = 0;
    this.field.waveT = 0;
    this.field.waveIdx = this.round;
    this.spawnAt = 0;
    this.timeline = [];
    const stage = Math.floor(this.round / 3);
    const offset = this.rnd() * Math.PI * 2;
    if (this.round === 9) {
      this.timeline.push({ at: 0, kind: "boss_gram", angle: offset, distance: 1.5, threat: "boss" });
      for (let pack = 0; pack < 5; pack++) for (let i = 0; i < 3; i++) this.timeline.push({ at: 6 + pack * 10, kind: i === 0 ? "shield_orc" : "hound", angle: offset + pack * 1.1 + i * 0.08, distance: 1.65 });
    } else {
      for (let pack = 0; pack < 8; pack++) {
        const angle = offset + pack * 1.18;
        const kinds = stage === 0 ? ["shield_orc", "shield_orc", "orc_shaman", "zombie", "zombie"] : stage === 1 ? ["hound", "hound", "frenzy_boar", "zombie", "zombie"] : ["mortar_team", "hook_raider", "zombie", "zombie", "shield_orc"];
        if (this.round % 3 === 2) kinds.push(stage === 0 ? "zombie" : stage === 1 ? "shield_orc" : "hound");
        kinds.forEach((kind, i) => this.timeline.push({ at: pack * 8 + (kind === "zombie" ? 3 : 0), kind, angle: angle + (i - 2) * 0.075, distance: 1.65 + (kind === "orc_shaman" ? 0.18 : i * 0.025), threat: kind === "frenzy_boar" || (stage === 2 && kind === "hound") ? "charge" : kind === "mortar_team" ? "cast" : undefined }));
      }
    }
    this.timeline.sort((a, b) => a.at - b.at);
    this.say(`${this.round + 1}/10 · ${ROUNDS[this.round].name}`);
  }

  private spawn(spawn: Spawn): void {
    const x = this.map.cx + Math.cos(spawn.angle) * this.map.outerR * spawn.distance;
    const y = this.map.cy + Math.sin(spawn.angle) * this.map.outerR * spawn.distance;
    spawnEnemy(this.field, spawn.kind, x, y, -Math.cos(spawn.angle), -Math.sin(spawn.angle), true);
    this.field.spawned++;
    const e = this.field.list[this.field.list.length - 1];
    const multiplier = 3.2 * (1 + Math.floor(this.round / 3) * 0.22);
    e.hp = e.maxHp = spawn.kind === "boss_gram" ? 3100 : ENEMY_STATS[e.kind].hp * multiplier;
    if (e.shield > 0) e.shield = e.hp * 0.45;
    if (e.aidPool > 0) e.aidPool = 85;
    e.patCd.fill(Infinity);
    e.roars = 99;
    if (spawn.threat) this.threats.set(e, { kind: spawn.threat, stage: "approach", timer: spawn.threat === "boss" ? 2 : 1.5, duration: 0, damage: 0, weak: 0, x, y });
  }

  private onHit(e: Enemy, kind: string, damage: number): void {
    const threat = this.threats.get(e);
    if (!threat) return;
    if (threat.weak > 0) this.metrics.weakHits++;
    if (threat.stage !== "tell") return;
    threat.damage += damage;
    const threshold = threat.kind === "boss" ? 145 : e.maxHp * 0.26;
    if (kind === "hero" || threat.damage >= threshold || e.hp <= 0) {
      threat.stage = "recover"; threat.timer = 4; threat.weak = threat.kind === "boss" ? 4 : 2.4;
      e.rageT = 0;
      this.metrics.interrupts++;
      this.say(threat.kind === "boss" ? "강타 차단! 4초 약점 노출 · 피해 ×1.75" : "공격 차단! 적이 경직되었습니다");
    }
  }

  private damageCore(amount: number, cause: string): void {
    this.combat.coreHp = Math.max(0, this.combat.coreHp - amount);
    this.combat.coreDamageByCause[cause] = (this.combat.coreDamageByCause[cause] ?? 0) + amount;
    this.combat.coreDmgMob += amount;
    this.combat.coreImpact = { age: 0, serial: this.combat.coreImpact.serial + 1, heavy: true };
    this.combat.shake = 0.35;
    if (this.combat.coreHp === 0) this.combat.over = true;
  }

  private updateThreats(dt: number): void {
    this.cues = [];
    for (const [e, threat] of this.threats) {
      if (e.hp <= 0 || !this.field.list.includes(e)) { this.threats.delete(e); continue; }
      if (threat.kind === "boss" && threat.stage === "approach") {
        const distance = Math.hypot(e.x - this.map.cx, e.y - this.map.cy) || 1;
        if (distance < this.map.outerR * 0.9) {
          e.x = this.map.cx + (e.x - this.map.cx) / distance * this.map.outerR * 0.9;
          e.y = this.map.cy + (e.y - this.map.cy) / distance * this.map.outerR * 0.9;
        }
      }
      threat.weak = Math.max(0, threat.weak - dt);
      threat.timer -= dt;
      // These actors use their demo attack cycle; all other enemies keep their stock attacks.
      if (threat.kind !== "charge" || threat.stage !== "approach") { e.firing = false; e.atCore = false; e.coreCd = Infinity; }
      if (threat.stage !== "approach") { e.x = threat.x; e.y = threat.y; }
      if (threat.stage === "approach" && threat.timer <= 0 && Math.hypot(e.x - this.map.cx, e.y - this.map.cy) < this.map.outerR * 1.55) {
        threat.stage = "tell";
        threat.duration = threat.kind === "charge" ? 2.6 : 3.2;
        threat.timer = threat.duration; threat.damage = 0; threat.x = e.x; threat.y = e.y;
        e.firing = false; e.atCore = false;
      } else if (threat.stage === "tell" && threat.timer <= 0) {
        markEnemyAction(e, this.field.t, threat.kind === "charge" ? "charge" : "shot");
        if (threat.kind === "charge") {
          e.rageT = 3; e.rageMul = 2.8;
          threat.stage = "approach"; threat.timer = 8;
          this.say("돌진! 가속으로 전열을 옮겨 길을 막으세요");
        } else {
          this.damageCore(threat.kind === "boss" ? 9 : 3.5, `demo:${threat.kind}`);
          threat.stage = "recover"; threat.timer = 3; threat.weak = threat.kind === "boss" ? 3 : 0;
          this.say(threat.kind === "boss" ? "강타 적중 −9 · 반격할 약점 창이 열렸습니다" : "주술 적중 · 코어 −3.5");
        }
      } else if (threat.stage === "recover" && threat.timer <= 0) {
        threat.stage = "approach"; threat.timer = threat.kind === "boss" ? 3 : 5;
      }
      if (threat.stage === "tell") this.cues.push({ x: e.x, y: e.y, r: threat.kind === "boss" ? 65 : 34, kind: threat.kind === "charge" ? "charge" : "cast", progress: 1 - Math.max(0, threat.timer) / threat.duration, label: threat.kind === "boss" ? "강타 · 차단 가능" : threat.kind === "cast" ? "시전 · 차단 가능" : "돌진 · 차단 가능" });
      if (threat.weak > 0) this.cues.push({ x: e.x, y: e.y, r: threat.kind === "boss" ? 65 : 31, kind: "weak", progress: threat.weak / 4, label: "약점 ×1.75" });
    }
  }

  step(dt: number): void {
    if (this.phase !== "combat" || !Number.isFinite(dt) || dt <= 0) return;
    // Limit integration steps, including callers resuming after a background-tab pause.
    if (dt > 1 / 30) { let remaining = Math.min(dt, 0.25); while (remaining > 0) { const part = Math.min(remaining, 1 / 60); this.step(part); remaining -= part; } return; }
    this.elapsed += dt; this.waveTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.abilityLeft = Math.max(0, this.abilityLeft - dt);
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
    if (this.abilityLeft === 0) this.ability = "cruise";
    this.markLeft = Math.max(0, this.markLeft - dt);
    if (this.markLeft === 0 || !this.marked || this.marked.hp <= 0) { this.marked = null; this.markLeft = 0; this.combat.priorityTarget = null; }
    while (this.spawnAt < this.timeline.length && this.timeline[this.spawnAt].at <= this.waveTime) this.spawn(this.timeline[this.spawnAt++]);
    this.updateStats();
    updateTrain(this.train, dt);
    updateField(this.field, dt, this.map, this.flow, this.train, this.swim);
    for (const [e, time] of this.detached) {
      if (time <= dt || e.hp <= 0) { this.detached.delete(e); continue; }
      this.detached.set(e, time - dt);
      if (e.perched !== null) this.train.stunned.delete(e.perched);
      e.perched = null;
    }
    this.updateThreats(dt);
    updateCombat(this.combat, dt, this.map, this.train, this.field);
    updateTurrets(this.combat, dt, this.train, this.field);
    this.metrics.shieldBreaks = this.combat.shieldBreaks;
    if (this.combat.terrainDirty) { this.combat.terrainDirty = false; this.flow = buildFlow(this.map); this.swim = buildFlow(this.map, true); }
    if (this.combat.over) { this.phase = "lost"; this.say("코어가 파괴되었습니다"); return; }
    if (this.round === 9 && this.combat.killsByKind.boss_gram) this.spawnAt = this.timeline.length;
    if (this.spawnAt === this.timeline.length && this.field.list.length === 0) {
      if (this.round === 9) { this.phase = "won"; this.field.cleared = true; this.say("그람 격퇴 · 데모 완주"); }
      else if (this.round % 3 === 2) {
        this.phase = "upgrade"; this.choices = OFFERS[Math.floor(this.round / 3)].map(c => ({ ...c }));
        this.combat.coreHp = Math.min(100, this.combat.coreHp + 20);
        this.say("정비 완료 · 코어 +20 · 개조 선택 → 편성 배치 → 출발");
      } else { this.round++; this.startRound(); }
    }
    if (this.waveTime > this.roundLimit && this.phase === "combat") { this.phase = "lost"; this.say("적 봉쇄 실패 · 작전 시간이 초과되었습니다"); }
  }
}
