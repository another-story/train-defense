/** Approved gameplay loop, also available in the sound archive. */
export const MUSIC_TRACKS = [
  {
    id: "iron-siege",
    title: "철의 공성전",
    bpm: 120,
    key: "C minor",
    style: "산업 음악 · 전투",
    description: "묵직한 저음과 기계적인 리듬. 선택한 곡의 전투 구간을 반복 재생하며, 시안보다 음원 레벨을 3dB 낮췄습니다.",
    url: "/music/v2/iron-siege.mp3",
    duration: 32,
    bars: 16,
  },
] as const;
export type MusicId = typeof MUSIC_TRACKS[number]["id"];
export const GAME_MUSIC_ID: MusicId = "iron-siege";
