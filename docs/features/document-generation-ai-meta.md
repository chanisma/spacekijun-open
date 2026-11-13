# 스펙 검수 AI 라벨 보완

2026-09-07: 반복 행의 열별 공통 지침을 AI 보완 대상에 포함했다.

- 이름과 행 전체 작성 지시가 이미 있어도, rowSchema의 입력·서술·계산 열 중 빈 지침이 있으면 요청한다. 유지 열은 제외한다.
- AI에 실제 열번호, 유형, 기존 지침과 해당 열의 헤더·최대 3개 예시를 전달한다. 병합 헤더는 셀의 열 점유 범위로 대응시킨다.
- 응답의 rowSchema는 배열 순서 대신 col로 대응한다. 기존 열의 빈 instruction만 채우고, 기존 지침·유형·source·formula는 보존한다. 없는 열번호, 잘못된 유형, 공백 지침은 무시한다.
- 타깃 메타데이터 보완 건수에 실제로 채운 열 지침 수를 추가한다. 열 지침이 모두 있으면 다른 보완 대상이 없는 한 AI를 다시 호출하지 않는다.
- 스펙 검수 및 공용 스펙 편집기의 안내·완료 알림에 열별 지침을 명시한다.

검증 명령:

```powershell
npx --yes tsx --tsconfig tsconfig.app.json --test src/features/task-workflow/document/spec/__tests__/specMetaColumns.test.ts
npx --yes tsx --tsconfig tsconfig.app.json scripts/task-work-spec-test/check-context-example.mts
```

새 회귀 테스트는 열 지침만 비었을 때 요청, 열번호별 적용, 기존 작성 내용 및 수식 보존, 잘못된 응답 무시, 재호출 생략을 검증한다. 실제 AI 서비스 대신 주입한 응답으로 요청·파싱·스펙 반영 경로를 검사한다.

반복 행의 새 지정·자동 탐지에서는 열 지침을 빈칸으로 둔다. 재지정으로 추가되는 열도 빈 지침으로 만들고, 기존 열에 작성한 지침은 보존한다. 헤더 기반 자동 지침 입력은 제거했으며, 사용자가 AI 라벨 보완을 실행하면 앞서 설명한 경로로 빈 지침을 채운다.
