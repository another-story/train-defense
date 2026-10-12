// 쇼케이스 허브의 **유형 분류표** (DESIGN §8 "여덟 유형" + 관문).
//
// 이 파일에는 **수치가 하나도 없다** — 눈금은 전부 balance.ts(= BALANCE.md 정본)에서 읽고,
// 여기 있는 것은 「어느 종이 §8의 몇 번 유형인가」라는 **분류 라벨**뿐이다.
// balance.ts에 `group` 필드를 새로 다는 대신 분류를 여기에 둔 이유: 게임 판정이 한 번도 안 보는
// 값이라 정본 옆에 두면 «게임 수치»와 «검수 도구의 라벨»이 한 표에 섞인다.
//
// **드리프트 방지**: BASE_GROUP은 손으로 적은 표라 balance.ts에 종이 늘면 뒤처질 수 있다.
// 그래서 classify()가 **분류되지 않은 키를 그대로 돌려준다** — 허브 홈 탭과 `window.__hub()`가
// 그 목록을 띄우므로, 표가 뒤처지면 다음 세션이 스크린샷 한 장으로 본다.

import { BOSS_KINDS, ENEMY_STATS, MID_KINDS } from "../balance";

export type GroupId =
  | "runner" | "armor" | "skirm" | "amphib" | "air" | "siege" | "swarm" | "support" | "gate";

export const GROUPS: readonly { id: GroupId; label: string; note: string }[] = [
  { id: "runner", label: "① 러너", note: "물량·속도 압박. 개별 가치는 낮고 수로 민다" },
  { id: "armor", label: "② 중장갑", note: "직사/곡사 상성. 엘리트가 이 유형에서 나온다" },
  { id: "skirm", label: "③ 산병", note: "교전 위치에 멈춰 쏜다 — 레일에 안 닿는다. 조준 포격의 존재 이유" },
  { id: "amphib", label: "④ 수륙양용", note: "물을 지름길로 쓴다. 실효는 맵의 물 배치에 정비례" },
  { id: "air", label: "⑤ 공중", note: "곧게 난다 · 열차 장벽을 넘는다 · 대공 전용 무기만 표적으로 잡는다" },
  { id: "siege", label: "⑥ 공성", note: "코어에 붙어 갉거나 폭탄을 설치한다. 방치의 대가가 크다" },
  { id: "swarm", label: "⑦ 증식", note: "분열·산란·재소환 — 실효 HP가 명목보다 크다(§6 예산)" },
  { id: "support", label: "⑧ 지원", note: "자기는 안 죽이고 옆의 적을 안 죽게 만든다 — 우선 처치 판단" },
  { id: "gate", label: "관문", note: "중간보스(3n) · 보스(6n). 눈금이 같고 골격이 갈린다" },
];

/** §8 유형표에 등재된 **골격 47종**의 분류. 변종은 원본을 따라가므로 여기 없다(classify가 유도한다) */
const BASE_GROUP: Record<string, GroupId> = {
  zombie: "runner", hound: "runner", goblin_raider: "runner", skeleton: "runner",
  frenzy_boar: "runner", rat_swarm: "runner", rat: "runner",

  shield_orc: "armor", troll: "armor", scrap_golem: "armor", armor_beetle: "armor",
  armored_truck: "armor", ogre: "armor",

  archer: "skirm", mortar_team: "skirm", musket_bandit: "skirm", acid_spitter: "skirm",
  shadow_assassin: "skirm",

  swamp_crawler: "amphib", frog_warrior: "amphib", landing_craft: "amphib", abyss_tentacle: "amphib",

  bomb_bat: "air", gargoyle: "air", scout_drone: "air", zeppelin: "air", wyvern: "air",

  siege_worm: "siege", saboteur: "siege", hook_raider: "siege", siege_ram: "siege", sabo_bomb: "siege",

  slime: "swarm", slime_mid: "swarm", slime_small: "swarm", acid_slime: "swarm",
  acid_slime_small: "swarm", slime_queen: "swarm", necromancer: "swarm",
  spore_trent: "swarm", spore_ling: "swarm",

  drummer: "support", orc_shaman: "support", shield_bearer: "support", smoke_truck: "support",
  banner_lord: "support",

  boss_gram: "gate",
  // **죽음의 군주**는 감독 #72 ⑤로 `BOSS_KINDS`에 들어갔다 — 아래 `classify`의 `gate` 갈래가
  // 이 행보다 먼저 이기므로 이 줄은 «출처의 기록»이다(옛 자리는 ⑦ 증식이었다)
  necro_lord: "gate",
};

/** **부속체** — 웨이브 조성에 직접 안 서고 분열·산란·화물·설치로만 나오는 행.
 * 카드에 배지로 표시해 «60행이 곧 60가지 적»이 아님을 화면에서 읽히게 한다 */
const SUB = new Set([
  "slime_mid", "slime_small", "acid_slime_small", "rat", "spore_ling", "sabo_bomb",
]);

export type Entry = {
  kind: string;
  group: GroupId;
  /** 분류의 출처: 직접 등재 / 변종이 원본에서 물려받음 / 관문 풀(중간보스·보스) */
  via: "base" | "variant" | "mid";
  /** 변종·관문 강화판일 때 원본 키 */
  of?: string;
  sub: boolean;
};

/** ENEMY_STATS 전 행을 §8 유형으로 가른다. **분류표에 없는 키는 unknown으로 돌려준다** */
export function classify(): { byGroup: Record<GroupId, Entry[]>; unknown: string[] } {
  const byGroup = {} as Record<GroupId, Entry[]>;
  for (const g of GROUPS) byGroup[g.id] = [];
  const unknown: string[] = [];

  for (const kind of Object.keys(ENEMY_STATS)) {
    const gate = MID_KINDS.includes(kind) || BOSS_KINDS.includes(kind);
    const pal = ENEMY_STATS[kind].palette;
    // **관문이 먼저다** — 중간보스·보스 풀도 palette를 들지만 그쪽은 «강화판»이라 관문으로 간다.
    // 이름 목록이 아니라 `MID_KINDS`/`BOSS_KINDS`를 보는 이유: 풀에 한 종이 붙을 때마다
    // palette 갈래가 그 종을 **원본의 유형으로 조용히 접어 넣는다**(boss_crawler → ② 중장갑).
    // 그 오배치는 `unknown`에도 안 잡히므로 드리프트 배너가 못 본다 — iter80에서 실제로 밟았다
    const group: GroupId | undefined = gate ? "gate" : BASE_GROUP[kind] ?? (pal ? BASE_GROUP[pal.of] : undefined);
    if (!group) {
      unknown.push(kind);
      continue;
    }
    byGroup[group].push({
      kind,
      group,
      via: gate ? "mid" : pal ? "variant" : "base",
      of: pal?.of,
      sub: SUB.has(kind),
    });
  }
  return { byGroup, unknown };
}
