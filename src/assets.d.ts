// Vite 에셋 임포트(플레이트 PNG). public/ 밖의 이미지를 번들 경로로 받는다 —
// public/에 복사하면 6.3MB 파일이 저장소에 두 벌 남는다.
declare module "*.png" {
  const url: string;
  export default url;
}

/** 배포 용량 — 맵 플레이트는 WebP로 낸다(PNG 13.7MB → 1.1MB · 감독 2026-08-25) */
declare module "*.webp" {
  const src: string;
  export default src;
}
