/**
 * 첫 로딩 — 무엇을 기다리는지와 몇 %인지(순수 함수: 회귀가 직접 부른다).
 *
 * 세 가지가 다 돼야 걷힌다.
 *  · tower — 서버의 탑 기록(snap). 없으면 HUD 가 그려질 수 없다.
 *  · art   — 스프라이트 58장. 서버가 먼저 오면 그림 없는 장면 위에 HUD 만 먼저 뜬다(2026-10-11 이전 동작).
 *  · font  — 갈무리. 늦게 오면 글자가 시스템 글꼴로 그려졌다가 점 글꼴로 «툭» 바뀐다.
 */
export type LoadStepKey = 'tower' | 'art' | 'font';

export const LOAD_STEPS: { key: LoadStepKey; label: string; weight: number }[] = [
  { key: 'tower', label: '탑 기록', weight: 30 },
  { key: 'art', label: '그림', weight: 60 },
  { key: 'font', label: '글꼴', weight: 10 },
];

export interface LoadState {
  tower: boolean;
  font: boolean;
  /** 받은 그림 수 / 전체 — done 은 «재기(measure)까지 끝남» */
  art: { loaded: number; total: number; done: boolean };
}

export function loadProgress(s: LoadState): { percent: number; current: string | null; done: boolean } {
  const frac = (k: LoadStepKey) => {
    if (k === 'tower') return s.tower ? 1 : 0;
    if (k === 'font') return s.font ? 1 : 0;
    if (s.art.done) return 1;
    // 다 받았어도 재기 전이면 1 이 아니다 — 100% 인데 화면이 안 걷히는 순간을 만들지 않는다
    return s.art.total > 0 ? Math.min(0.99, s.art.loaded / s.art.total) : 0;
  };
  const done = s.tower && s.font && s.art.done;
  const sum = LOAD_STEPS.reduce((a, st) => a + st.weight * frac(st.key), 0);
  const total = LOAD_STEPS.reduce((a, st) => a + st.weight, 0);
  // 다 되기 전에는 100 을 보이지 않는다(반올림으로 99.6 → 100 이 되는 것 방지)
  const percent = done ? 100 : Math.min(99, Math.floor((sum / total) * 100));
  const current = LOAD_STEPS.find((st) => frac(st.key) < 1)?.label ?? null;
  return { percent, current, done };
}
