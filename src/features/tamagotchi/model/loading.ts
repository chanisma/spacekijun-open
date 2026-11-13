/**
 * 다마고찌 첫 로딩(2026-10-09) — 무엇을 기다리는가 · 몇 % 인가. 순수 함수(회귀가 부른다).
 *
 * 사용자 지시: «접속하면 three.js 가 구현될 때까지 기본 값이 다마고치가 표현됨» — 종전엔 기다리는 동안 «다른 모습»이 먼저 보였다:
 *   ①3D 묶음을 받는 동안 2D 대체 기기 ②펫을 읽기 전의 연습용 알 ③상점(장착)을 받기 전의 기본 껍데기·컬러 기기
 *   — 받으면 기기를 다시 만들어 한 번 더 바뀐다 ④codex 그림을 받기 전의 절차적 도트 캐릭터 ⑤글꼴을 받기 전의 대체 글씨.
 * 그래서 다 준비될 때까지 로딩 화면이 덮는다. 단, 무엇 하나가 멈춰도 갇히지 않게 LOADING_TIMEOUT_MS 뒤엔 걷는다(열어 두는 쪽).
 */
export type LoadStepKey = 'fonts' | 'art' | 'pet' | 'decor' | 'device';

export const LOAD_STEP_LABEL: Record<LoadStepKey, string> = {
  fonts: '화면 글꼴', art: '캐릭터 그림', pet: '펫 깨우기', decor: '꾸민 모습', device: '3D 기기',
};

/** 무엇 하나가 멈춰도 이 뒤엔 로딩을 걷는다 — 데이터는 각자 늦게라도 들어와 그려진다 */
export const LOADING_TIMEOUT_MS = 12_000;

/** 기다릴 단계 — 그림체가 절차적 도트면 그림을 안 받고, 체험 모드(서버 아님)면 장착이 없다 */
export function loadSteps(opts: { codexArt: boolean; server: boolean }): LoadStepKey[] {
  return (['fonts', 'art', 'pet', 'decor', 'device'] as LoadStepKey[])
    .filter((k) => (k === 'art' ? opts.codexArt : k === 'decor' ? opts.server : true));
}

export interface LoadProgress { percent: number; complete: boolean; current: LoadStepKey | null }

export function loadProgress(steps: LoadStepKey[], done: Partial<Record<LoadStepKey, boolean>>): LoadProgress {
  if (!steps.length) return { percent: 100, complete: true, current: null };
  const n = steps.filter((k) => done[k]).length;
  return { percent: Math.round((n / steps.length) * 100), complete: n === steps.length, current: steps.find((k) => !done[k]) ?? null };
}
