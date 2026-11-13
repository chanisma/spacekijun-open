import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installModalPointerEventsGuard } from './lib/modalPointerEvents'
import { installModalBackHistory } from './lib/modalBackHistory'

// 중첩 모달이 닫힌 뒤 body 가 클릭 불가로 갇히는 것을 푸는 안전망(2차선).
// 근본 수정은 package.json 의 `overrides` — 자세한 이유는 해당 모듈 주석 참고.
installModalPointerEventsGuard();

// 휴대폰 뒤로가기 = 맨 위 모달 닫기. 라우터보다 **먼저** popstate 를 받아야 하므로
// React 렌더 전에 설치한다(라우터가 볼 필요 없는 모달 전환을 삼킨다 — 모듈 주석 참고).
installModalBackHistory();

export function mount(root: HTMLElement) {
  createRoot(root).render(<App />);
}
