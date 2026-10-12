import { ENEMY_STATS } from "./balance";

/** Presentation profiles only: none of these values participate in movement or damage. */
export type EnemyRig = "humanoid" | "heavy" | "shield" | "ranged" | "caster" | "quadruped" | "crawler" | "worm" | "winged" | "rotor" | "slime" | "tentacle" | "plant" | "vehicle" | "boat" | "balloon" | "bomb";
export type EnemyMotionProfile = { rig: EnemyRig; cadence: number; reach: number; pace: number };
const profile = (rig: EnemyRig, cadence = 0.7, reach = 1, pace = 1): EnemyMotionProfile => ({ rig, cadence, reach, pace });
const walker = profile("humanoid"), runner = profile("humanoid", 0.55, 1.2, 1.25);
const heavy = profile("heavy", 0.9, 1.1, 0.7), boss = profile("heavy", 1, 1.3, 0.6);
const shield = profile("shield", 0.85), ranged = profile("ranged", 0.85), caster = profile("caster", 0.9);
const beast = profile("quadruped", 0.6, 1.1, 1.3), crawler = profile("crawler", 0.7), worm = profile("worm", 0.7);
const winged = profile("winged", 0.65), rotor = profile("rotor", 0.8), slime = profile("slime", 0.8);
const tentacle = profile("tentacle", 0.9), plant = profile("plant", 0.85), vehicle = profile("vehicle", 0.9);
const boat = profile("boat", 0.9), balloon = profile("balloon", 0.9), bomb = profile("bomb", 0.8);

/** Explicit coverage includes palettes, offspring, seven chiefs, both bosses and the necro event.
 * A new enemy must choose a rig; silently falling back to a universal body wobble is forbidden. */
export const ENEMY_MOTION: Readonly<Record<string, EnemyMotionProfile>> = {
  zombie: walker, hound: beast, archer: ranged, shield_orc: shield, mortar_team: ranged,
  slime, slime_mid: slime, slime_small: slime, drummer: walker,
  swamp_crawler: crawler, frog_warrior: runner, landing_craft: boat, abyss_tentacle: tentacle,
  bomb_bat: winged, gargoyle: winged, scout_drone: rotor, zeppelin: balloon, wyvern: winged,
  siege_worm: worm, saboteur: runner, hook_raider: walker, siege_ram: vehicle, sabo_bomb: bomb,
  goblin_raider: runner, skeleton: walker, frenzy_boar: beast, rat_swarm: crawler, rat: beast,
  troll: heavy, scrap_golem: heavy, armor_beetle: crawler, armored_truck: vehicle,
  musket_bandit: ranged, acid_spitter: profile("humanoid", 0.85, 0.7), shadow_assassin: runner,
  acid_slime: slime, acid_slime_small: slime, slime_queen: slime, necromancer: caster,
  spore_trent: plant, spore_ling: plant, orc_shaman: caster, shield_bearer: shield,
  smoke_truck: vehicle, banner_lord: heavy, ogre: heavy, boss_gram: boss,
  plague_zombie: walker, bone_hound: beast, iron_orc: shield, rust_truck: vehicle,
  venom_spitter: profile("humanoid", 0.85, 0.7), bog_crawler: crawler, ember_bat: winged,
  hawk_drone: rotor, grub_worm: worm, tar_slime: slime, pale_necromancer: caster,
  blood_shaman: caster, boss_crawler: profile("crawler", 1, 1.3, 0.65), necro_lord: caster,
  ogre_chief: boss, troll_chief: boss, abyss_chief: tentacle, ram_chief: vehicle,
  queen_chief: slime, necro_chief: caster, banner_chief: heavy,
};
for (const kind of Object.keys(ENEMY_STATS)) {
  if (!ENEMY_MOTION[kind]) throw new Error(`Missing enemy motion profile: ${kind}`);
}
for (const kind of Object.keys(ENEMY_MOTION)) {
  if (!ENEMY_STATS[kind]) throw new Error(`Unknown enemy motion profile: ${kind}`);
}

// 0 = planted rest, 1..8 = gait cycle, 9..10 = windup, 11..13 = strike/recovery.
// Attacks take priority over gait so the body cannot combine incompatible poses.
export function motionFrame(phase: number, walking: boolean, attackAge: number, cadence: number, tell = 0, repeat = false): number {
  if (tell > 0) return tell < 0.55 ? 9 : 10;
  if (attackAge >= 0 && attackAge < cadence * 0.6) {
    const t = attackAge / (cadence * 0.6);
    return t < 0.2 ? 11 : t < 0.5 ? 12 : 13;
  }
  // A confirmed continuous attack also sets the next windup. Actual hit restarts the strike.
  if (repeat && attackAge >= cadence * 0.78 && attackAge < cadence) return attackAge < cadence * 0.9 ? 9 : 10;
  return walking ? 1 + ((Math.floor(phase / (Math.PI * 2) * 8) % 8 + 8) % 8) : 0;
}

/** Bounds, pivot, angle, displacement and local scale in normalized source coordinates. */
export type RigPart = [number, number, number, number, number, number, number, number?, number?, number?, number?];
export function enemyRigParts(p: EnemyMotionProfile, frame: number): RigPart[] {
  const phase = (frame - 1) / 8 * Math.PI * 2;
  const s = frame > 0 && frame < 9 ? Math.sin(phase) : 0;
  const c = frame > 0 && frame < 9 ? Math.cos(phase) : 0;
  const a = (frame === 9 ? -0.45 : frame === 10 ? -1 : frame === 11 ? 1 : frame === 12 ? 0.6 : frame === 13 ? 0.22 : 0) * p.reach;
  const part = (x0: number, y0: number, x1: number, y1: number, px: number, py: number, angle = 0, dx = 0, dy = 0, sx = 1, sy = 1): RigPart => [x0, y0, x1, y1, px, py, angle, dx, dy, sx, sy];
  const rig = p.rig;
  if (rig === "slime") {
    // Belly stays on the ground; the crown/face follows the upper body rather than rotating.
    const squash = s * 0.075 - a * 0.1;
    return [part(0, 0, 1, 1, 0.5, 0.96, 0, a * 0.055, 0, 1 + squash, 1 - squash)];
  }
  if (rig === "winged" || rig === "rotor") {
    const wing = rig === "winged" ? s * 0.25 - a * 0.17 : s * 0.09;
    return [part(0, 0, 0.39, 1, 0.39, 0.4, wing, 0, 0, 1, 1 - Math.abs(s) * 0.18),
      part(0.61, 0, 1, 1, 0.61, 0.4, -wing, 0, 0, 1, 1 - Math.abs(s) * 0.18),
      part(0.38, 0, 0.62, 1, 0.5, 0.65, -a * 0.09, 0, a * 0.04)];
  }
  if (rig === "tentacle") {
    // Overlapping narrow bands bend one continuous painted tentacle without open seams.
    return Array.from({ length: 12 }, (_, i) => {
      const y = i / 12, bend = (1 - y) * (1 - y);
      return part(0, Math.max(0, y - 0.012), 1, Math.min(1, y + 1 / 12 + 0.012), 0.5, 0.96,
        0, bend * (s * 0.06 + a * 0.15), 0);
    });
  }
  if (rig === "worm") {
    // A travelling contraction, with a larger forward jaw extension on a strike.
    return Array.from({ length: 12 }, (_, i) => {
      const x = i / 12, wave = s * Math.cos(x * Math.PI * 2) + c * Math.sin(x * Math.PI * 2);
      return part(Math.max(0, x - 0.016), 0, Math.min(1, x + 1 / 12 + 0.016), 1, x, 0.8,
        0, a * x * x * 0.045, wave * 0.018, 1, 1 + wave * 0.015);
    });
  }
  if (rig === "crawler") {
    const legs: RigPart[] = [];
    for (let i = 0; i < 3; i++) {
      const k = (i % 2 ? -s : s) * 0.19;
      const y = 0.36 + i * 0.2;
      legs.push(part(0, y, 0.26, Math.min(1, y + 0.24), 0.25, y + 0.08, k - a * 0.1));
      legs.push(part(0.74, y, 1, Math.min(1, y + 0.24), 0.75, y + 0.08, -k + a * 0.1));
    }
    return [...legs, part(0, 0, 1, 0.4, 0.5, 0.37, 0, 0, -a * 0.012),
      part(0.24, 0.35, 0.76, 1, 0.5, 0.75, 0, 0, -a * 0.012)];
  }
  if (rig === "quadruped") {
    // Diagonal feet alternate; head lunges independently for a bite/pounce.
    return [part(0, 0.24, 0.28, 0.67, 0.27, 0.29, s * 0.2),
      part(0.72, 0.24, 1, 0.67, 0.73, 0.29, -s * 0.2),
      part(0, 0.65, 0.3, 1, 0.29, 0.65, -s * 0.22 - a * 0.13),
      part(0.7, 0.65, 1, 1, 0.71, 0.65, s * 0.22 + a * 0.13),
      part(0.27, 0, 0.73, 0.72, 0.5, 0.6, 0, 0, -Math.abs(s) * 0.015),
      part(0.29, 0.64, 0.71, 1, 0.5, 0.66, 0, 0, a * 0.045, 1 + a * 0.035, 1)];
  }
  if (rig === "vehicle" || rig === "boat" || rig === "balloon") {
    if (rig === "balloon") return [part(0, 0, 1, 0.78, 0.5, 0.72),
      part(0, 0.77, 1, 1, 0.5, 0.78, s * 0.055, 0, -a * 0.05)];
    if (rig === "boat") return [part(0, 0, 1, 0.83, 0.5, 0.75, 0, 0, -a * 0.025),
      part(0, 0.77, 1, 1, 0.5, 0.83, s * 0.055, 0, s * 0.015)];
    return [part(0, 0.65, 0.25, 1, 0.13, 0.82, s * 0.13, 0, c * 0.01),
      part(0.75, 0.65, 1, 1, 0.87, 0.82, -s * 0.13, 0, -c * 0.01),
      part(0.24, 0.65, 0.76, 1, 0.5, 0.83),
      part(0, 0, 1, 0.7, 0.5, 0.62, -a * 0.018, 0, -a * 0.025)];
  }
  if (rig === "plant") {
    return [part(0, 0.76, 0.5, 1, 0.35, 0.77, s * 0.15), part(0.5, 0.76, 1, 1, 0.65, 0.77, -s * 0.15),
      part(0, 0.36, 0.28, 0.78, 0.27, 0.4, -s * 0.12 - a * 0.3),
      part(0.72, 0.36, 1, 0.78, 0.73, 0.4, s * 0.12 + a * 0.3),
      part(0.27, 0.35, 0.73, 0.78, 0.5, 0.76, 0, 0, 0, 1, 1 - a * 0.06),
      part(0, 0, 1, 0.39, 0.5, 0.36, s * 0.03, 0, a * 0.018, 1 + a * 0.055, 1)];
  }
  if (rig === "bomb") return [part(0, 0, 1, 1, 0.5, 0.95)];
  const hip = rig === "caster" ? 0.8 : rig === "heavy" ? 0.7 : 0.67;
  const stride = rig === "heavy" ? 0.13 : 0.2;
  const legs = [part(0, hip, 0.5, 1, 0.34, hip, s * stride), part(0.5, hip, 1, 1, 0.66, hip, -s * stride)];
  if (rig === "shield") return [...legs, part(0, 0, 1, hip + 0.01, 0.5, hip, -a * 0.075, a * 0.04)];
  const arm = rig === "caster" ? a * 0.42 : rig === "ranged" ? -a * 0.18 : a * 0.42;
  return [...legs, part(0, 0, 0.26, hip + 0.01, 0.25, 0.3, -s * 0.12 - arm, 0, -a * (rig === "ranged" ? 0.035 : 0)),
    part(0.74, 0, 1, hip + 0.01, 0.75, 0.3, s * 0.12 + arm, 0, -a * (rig === "ranged" ? 0.035 : 0)),
    part(0.25, 0, 0.75, hip + 0.01, 0.5, hip, -a * 0.045, 0, -Math.abs(s) * 0.012)];
}
