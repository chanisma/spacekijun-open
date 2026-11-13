# 차트 등장 애니메이션 (recharts Line)

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 차트 등장 애니메이션 (recharts `<Line>`, 2026-08-13)
- **새 `<Line>`에는 반드시 `{...drawLineProps}`를 스프레드할 것** (`src/lib/chartAnimation.ts`). 안 붙이면 recharts 기본 동작으로 되돌아간다 — `Line.renderDots()`가 `if (isAnimationActive && !isAnimationFinished) return null`이라 **선 그리기(기본 1.5초)가 끝날 때까지 데이터 점이 하나도 안 보인다**. prop으로 끌 수 없는 게이트라 애니메이션을 켠 채 점만 먼저 그릴 방법이 없다.
- **원리**: recharts의 JS 애니메이션을 끄면(`isAnimationActive: false`) 점·선이 즉시 정적 렌더되고, 선 그리기는 CSS(`stroke-dashoffset`)가 대신한다 → **점 먼저, 선 나중**. `pathLength={1}`이 경로 길이를 1로 정규화해 실제 픽셀 길이를 몰라도 `stroke-dasharray: 1`로 그릴 수 있게 해준다(recharts가 `pathLength`를 SVG 속성 허용목록에 두고 있어 곡선 `<path>`까지 전달됨).
- **점선 Line에는 `fadeLineProps`를 쓴다**: CSS `stroke-dasharray`가 SVG presentation attribute보다 우선순위가 높아, 점선에 `drawLineProps`를 쓰면 그리기용 `dasharray: 1`이 점선 패턴을 덮어 **실선으로 보인다**. 같은 이유로 `.chart-line-draw` Line에 나중에 `strokeDasharray`를 추가하면 조용히 무시된다.
- 한 화면에 차트가 많아 등장 효과가 부담이면 `staticLineProps`(애니메이션만 끔). 목적(점 즉시 표시)은 동일하게 달성된다.
- 스타일 정의 = `src/index.css`의 `.chart-line-draw`/`.chart-line-fade` — **`chartAnimation.ts`와 클래스명으로 묶여 있으니 한쪽만 바꾸지 말 것**. `prefers-reduced-motion` 대응 포함.
- **recharts 내부 구현 3가지(className 전달 위치·`pathLength` 허용목록·`recharts-line-curve`/`recharts-line-dots` 클래스명)에 의존**하므로 버전 업 시 조용히 깨질 수 있다. 회귀 = `npx tsx scripts/chart-animation-test/run.mts`(SSR 마크업으로 11건 검증)
- 적용 범위 = evalog(요약/교과성적/모의고사/성적분석·EvaluationCharts)·evalearn·student-dashboard·spaced-repetition 13개 파일 26개 `<Line>`. 예외 = `GradeTrendAnalysis.tsx`(학생 20명 겹쳐 그리는 차트라 원래 `isAnimationActive={false}`)
