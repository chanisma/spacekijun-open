/**
 * `.css` import 를 빈 모듈로 바꾸는 로더 훅 — SSR 회귀용 (2026-09-24).
 *
 * Vite 는 `import './modal.css'` 를 알아서 처리하지만 Node 는 모른다(`ERR_UNKNOWN_FILE_EXTENSION`).
 * 그래서 **실제 컴포넌트를 SSR 로 렌더하는 회귀**는 이걸 함께 걸어야 한다:
 *
 *   npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs <스크립트>
 *
 * 스타일을 검사하지 않는다는 뜻이 아니라, **마크업 검사에 CSS 가 필요 없다**는 뜻이다
 * (CSS 자체는 `scripts/mobile-modal-test` 처럼 파일을 읽어 따로 본다).
 */
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
