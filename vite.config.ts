import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/** 청크·자산 이름을 URL 에 그대로 쓸 수 있는 ASCII 로(아래 build.rollupOptions 참고). */
export function asciiFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_./-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : 'chunk';
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api/timetable-solver': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/api\/timetable-solver/, ''),
      },
      '/solar-api': {
        target: 'https://api.upstage.ai/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/solar-api/, ''),
      },
    },
  },
  plugins: [
    react(),
    // lovable-tagger currently injects Windows paths with backslashes into JSX,
    // which makes the SWC transform fail before the application can load.
    mode === 'development' && process.platform !== 'win32' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // 모달 레이어 모듈은 **반드시 사본 1개**여야 한다.
    //
    // Radix 의 DismissableLayer 는 body 의 pointer-events 원래 값을 모듈 스코프 변수에
    // 적어 두므로, 사본이 둘이면 두 사본이 서로의 레이어를 못 보고 나중 사본이 오염된
    // 'none' 을 되돌린다 → 모달을 닫은 뒤 사이트 전체가 클릭 불가가 된다.
    // package.json 의 overrides 가 디스크 사본을 하나로 고정하지만, **개발 서버는
    // node_modules/.vite 에 사전 번들 결과를 캐시**하므로 의존성이 바뀌기 전에 만들어진
    // 캐시가 남아 있으면 브라우저에서는 여전히 사본이 둘이다(실제로 그렇게 재발했다).
    // 여기 적어 두면 dev·build 양쪽에서 해석이 하나로 고정되고, 이 파일이 바뀌면
    // Vite 가 최적화 캐시를 다시 만든다.
    // 상세 = docs/nested-modal-pitfalls.md · 회귀 = scripts/modal-layer-test
    dedupe: [
      'react',
      'react-dom',
      '@radix-ui/react-dismissable-layer',
      '@radix-ui/react-focus-guards',
      '@radix-ui/react-focus-scope',
      'react-remove-scroll',
    ],
  },
  // garu-ko resolves its WASM/model assets relative to import.meta.url.
  // Pre-bundling moves the JS into .vite/deps and breaks those relative URLs.
  optimizeDeps: {
    exclude: ['garu-ko'],
  },
  build: {
    target: 'esnext',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // 배포 파일 이름은 ASCII 만. Vite 는 지연 import·glob 청크를 원본 파일 이름으로 짓는데
        // (`neis-kb/guides/교무학사(고)/….json` → `개별화교육계획관리__…-해시.js`) Lovable 호스팅은
        // 한글 이름 파일을 404 로 돌려준다 — 빌드·로컬 미리보기는 멀쩡하고 운영에서만
        // «Failed to fetch dynamically imported module» 로 화면이 죽는다(2026-10-12 /neis-guide).
        // 이름이 겹쳐도 [hash] 가 다르고 Rollup 이 같은 이름에 번호를 붙인다.
        // 회귀 = scripts/build-asset-names-test/run.mts
        sanitizeFileName: asciiFileName,
      },
    },
  },
  // 솔버 워커(solver.worker.ts)가 HiGHS(WASM, cp-sat 전략)를 동적 import → code-splitting 발생.
  // Vite 기본 워커 포맷 'iife'는 code-splitting 미지원이라 'es'로 전환 (모던 브라우저 ES 모듈 워커).
  worker: {
    format: 'es',
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none',
  },
}));
