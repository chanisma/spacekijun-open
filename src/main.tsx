import './index.css'
import { chooseEntry } from './mobile/view'

// 본 앱과 가벼운 모바일 앱(/m) 중 하나만 받는다(2026-10-29) — 휴대폰이 본 앱의 큰 묶음을 기다리지 않게.
// 무엇을 띄울지는 src/mobile/view.ts 가 정한다. 둘 다 같은 index.html·같은 스타일을 쓴다.
const root = document.getElementById("root")!;
if (chooseEntry() === 'mobile') {
  import('./mobile/mobileMain').then((m) => m.mount(root));
} else {
  import('./fullMain').then((m) => m.mount(root));
}
