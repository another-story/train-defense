// 멀티 페이지 — 게임(index.html)과 **쇼케이스 허브**(showcase.html, DESIGN §10 0.5단계).
// vite는 기본으로 index.html 하나만 엔트리로 잡으므로, 허브를 빌드에 넣으려면 이 파일이 필요하다.
// **게임 쪽 설정은 하나도 안 바꾼다** — 엔트리 목록에 한 줄이 늘 뿐이다.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: { game: "index.html", showcase: "showcase.html", sounds: "sounds.html", demo: "demo.html" },
    },
  },
});
