// 스펙 채움 파이프라인의 **동작 설정 단일 출처**.
//
// **왜 별도 파일인가**: 이 값들이 여기저기 흩어져 있으면 "어느 화면에서 열었느냐"에 따라
// 동작이 갈리는 사고가 난다 — 실제로 그랬다. 2026-09-02~03에 모델을 `config.origin`으로
// 갈랐더니, 실사용의 대부분인 워크플로·할 일 실행(`origin` 없음)만 조용히 옛 경로로 가서
// 504로 죽었고, 사용자는 "문서 생성 기능이 luna를 쓴다"고 알고 있는데 실제로는 아니었다.
//
// **원칙(2026-09-03 사용자 결정): 라우팅과 무관하게 스펙 관련 기능은 동일하게 동작한다.**
// 화면·진입점·`config`가 달라도 같은 모델, 같은 프롬프트 규칙, 같은 기본값을 쓴다.
// 갈라야 할 이유가 생기면 **여기 한 곳**만 바꾼다.

import { DEFAULT_SPEC_FILL_MODE, type SpecFillMode } from './promptMode';

/**
 * 원본 문서의 그 자리 내용(`regionExamples`)을 프롬프트에 실을지.
 *
 * **재검증 대상이다.** "표기 형식만 참고"로 실었더니 그 **내용**이 결과에 새어 나오는 일이
 * 반복돼 한때 완전히 제거했는데, 그 관찰의 대부분이 **Solar 경로에서 나온 것**임이 나중에
 * 드러났다(모델 라우팅이 어긋나 있었다). luna 단독으로 정리된 지금은 결과가 다를 수 있어
 * **끄고 켜며 비교할 수 있게** 남겨 둔다.
 *
 * 기본값이 `false`인 이유: 새어 나온 내용이 문서에 그대로 실리는 쪽이, 형식이 조금 안 맞는
 * 쪽보다 나쁘다. 확인되면 `true`로 바꾸면 된다 — 계획 검토 화면에서 실행마다 바꿀 수도 있다.
 *
 * **끈 상태에서도 분량 정보(자수·문단 수)는 쓴다** — 파생된 수치라 내용이 샐 수 없고,
 * 없으면 생성물이 칸 크기와 전혀 맞지 않는다.
 */
export const DEFAULT_USE_REGION_EXAMPLES = false;

/** 파이프라인 전 구간이 공유하는 동작 옵션 */
export interface SpecFillOptions {
  /** 작성 모드 — `'strict'`(자료에 있는 것만) / `'generate'`(설명 기반 생성) */
  mode: SpecFillMode;
  /** 원본 문서의 기존 내용을 표기 형식 참고용으로 프롬프트에 실을지 */
  useRegionExamples: boolean;
}

export const DEFAULT_SPEC_FILL_OPTIONS: SpecFillOptions = {
  mode: DEFAULT_SPEC_FILL_MODE,
  useRegionExamples: DEFAULT_USE_REGION_EXAMPLES,
};

/** 부분 지정을 기본값 위에 얹는다 — 호출부마다 기본값을 다시 적지 않게 한다 */
export function resolveSpecFillOptions(partial?: Partial<SpecFillOptions>): SpecFillOptions {
  return { ...DEFAULT_SPEC_FILL_OPTIONS, ...partial };
}
