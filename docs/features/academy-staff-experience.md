# Academy 교사·관리자 체험 (2026-09-14)

교사와 관리자는 자신의 계정으로 Academy를 진행한다. 기본 KG·과목·활동은 00-00001에서 읽고, 학생의 기존 설계·종합 분석 이력은 체험 수첩에 노출하지 않는다. 관리자가 특정 학생을 선택한 기존 미리보기는 계속 읽기 전용이다.

## 저장 및 권한

- 화면의 `experience:<user UUID>`를 데이터 읽기 경계에서만 00-00001로 변환한다.
- 설계·분석·AI 캐시·면접 결과는 `academy_experience_records.owner_id`로 본인 계정에 저장한다. 클라이언트의 owner/student 값은 쓰기 RPC가 덮어쓴다. 다른 계정의 ID로 수정·삭제할 수 없다.
- 챕터와 연속 의뢰는 `trial_design_id`로 체험 설계를 연결한다. 학생 설계 FK와 학생 데이터는 보존한다.
- 계획·목표·대화·보상·공방 주문은 기존 본인 계정 테이블을 사용한다. 관리자 공방 관리함과 체험 주문함은 별도 RPC로 구분한다.
- 자습 이력은 기준 학생의 자료를 참고하되 체험 보상은 별도 `academy_experience_study_rewards`에 저장해 학생의 수령 여부와 코인을 변경하지 않는다.
- Edge 체험 클라이언트는 원본 테이블 쓰기를 차단하고 허용된 분석 RPC만 본인 저장소로 전환한다. 종합 분석에서 원본 KG를 정리하는 hygiene 쓰기는 실행하지 않는다.

## 새 별 찾기 속도 비교

후속 변경: 현재는 [단계별 생성/루나 기본 설정](academy-generation-jobs.md)을 사용한다. 아래 low 설명은 단계 분리 이전 시험 기록이다.

Academy 직접 설계 생성은 Solar Pro 4의 `reasoning_effort`를 medium에서 low로 변경했다. 모델과 출력 토큰 제한은 유지하며 추론 강도를 캐시 키에 포함한다. 일반 inquiry-design 호출의 기본값은 medium이다.

코드상 지연 요소는 추론, 긴 구조화 설계 출력(최대 32,000 토큰), 공급자 오류/빈 응답 재시도이다. 실제 공급자 호출의 속도 개선을 측정했다고 주장하지 않는다. 사용자가 low 결과의 품질과 대기 시간을 비교해 유지 여부를 판단한다.

화면은 실제 처리 지점에 맞춰 자료 준비 → 교수 설계 작성 → 초안 보관 및 경과 시간을 표시한다. 서버는 preparationMs/providerMs/finalizeMs/totalMs/providerRequests를 `inquiry_analysis_timing`으로 기록한다. 생성 내용이나 학생 질문을 이 성능 로그에 기록하지 않는다.

## 도서관

책 표지와 펼친 책에서도 활동 이름·분야 검색을 유지한다. 검색 결과가 없어도 현재 책을 닫지 않으며, 검색어를 지우면 목차가 복구된다. 목차와 본문은 각각 스크롤한다.

## 배포 및 검증

`20260914130000_academy_staff_experience.sql`을 연결 DB에 적용하고 migration history를 등록했다. openai-proxy, inquiry-comprehensive, academy-npc, academy-daily, academy-roommate, academy-encouragement, academy-interview를 배포했다.

- SQL 통합 검사: 교사/관리자 자신의 저장·챕터·보상·계획, 다른 계정 접근 차단, 학생 원본 KG/설계/분석 체크섬 유지. 검사 데이터는 롤백.
- Node 검사 17개 통과, Edge Deno 타입 검사 통과.
- 브라우저: 교사 저장/관리자 분리, low 전달, 진행 단계, 책 검색 유지 검증. 프롤로그 및 챕터 1~4 회귀 검증 통과.
- Vite 프로덕션 빌드 통과. 브라우저 AI 응답은 고정 fixture이며 실제 low 결과의 교육적 품질은 사용자의 후속 평가 대상이다.
