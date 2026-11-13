# Solar Pro 4 신규 문서 생성 실험

2026-09-08. 가상 성적 데이터로 Solar Pro 4의 신규 HTML/HWPX 생성 능력을 실제 API 호출로 확인했다. 앱 기능으로 통합하지 않은 독립 실험이다.

- 실측 모델: `solar-pro4-260806`.
- HWPX XML 전체 직접 생성: 규격 오류로 프로젝트 rhwp 엔진에서 빈 페이지로 표시.
- 원자료에서 HTML 생성: 완성된 문서는 생성했으나 표의 수치 48개 중 5개 오류.
- 코드로 계산한 통계를 함께 제공한 HTML: 표의 수치 48개 모두 일치.
- 같은 HTML의 문단·표를 rhwp API로 새 문서에 작성: HWPX 3페이지 생성·재열기·렌더, 표 수치 모두 일치.
- 한컴 한글 데스크톱 호환성은 미검증. CSS 차트/서식 보존과 서술 검토가 추가로 필요하다.

실험 결과·원문·산출물·검증 범위·재실행 방법: [전체 실험 기록](../../reports/solar-pro4-documents/README.md).

스크립트: `scripts/solar-document-test/`. 공통 가상 데이터: `reports/solar-pro4-documents/2026-09-08-baseline/input.json`. 실제 학생 데이터나 운영 DB는 사용하지 않았다.
