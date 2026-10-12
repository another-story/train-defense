// Vite 환경 변수 (`.env` · 저장소에 커밋된다). 랭킹 서버 접속 정보 두 칸이 전부다 (§0.7 N).
// **anon 키는 «공개 클라이언트 키»**이고 정적 배포에서는 어차피 번들에 실린다 —
// 보안 경계는 키가 아니라 RLS 정책이다. `service_role` 키는 저장소에 두지 않는다.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_TD_SUPABASE_URL?: string;
  readonly VITE_TD_SUPABASE_ANON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
