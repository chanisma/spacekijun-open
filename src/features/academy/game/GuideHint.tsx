import type { ReactNode } from 'react';
import styles from './game.module.css';

/**
 * 장 안내 손가락 (2026-10-15) — 이야기가 «이 단추를 눌러야 다음으로 넘어가는» 자리를 가리킨다.
 *
 * 왜 필요한가: 장 조건은 대개 «정해진 단추로 저장한 것»만 받는다(빠른 줄로 적은 계획·다른 편지에 적은 일지·고친 카드는
 * 조건을 채워도 장이 넘어가지 않는다). 설명 글만으로는 학생이 다른 길로 같은 일을 하고 같은 대사로 되돌아왔다(제3장 제보).
 *
 * 쓰는 법은 두 조각이다 — 눌러야 할 단추에 `data-guide={guideMark(on)}`(반짝이는 테두리 = game.module.css 의 `[data-guide=active]`),
 * 그 옆에 `<GuideHint show={on}>세린 · 여기를 눌러요</GuideHint>`. 제1장 설계지의 `.guidePointer` 는 절대 위치라 따로 둔다.
 * 글자는 `<b>` — 책의 `.pageActions > span` 같은 규칙이 `<span>` 의 글자색을 덮는다.
 */
export const guideMark = (on: boolean | undefined) => (on ? 'active' as const : undefined);

export function GuideHint({ show = true, children }: { show?: boolean; children: ReactNode }) {
  if (!show) return null;
  return <b className={styles.guideHint} aria-hidden="true">☛ {children}</b>;
}
