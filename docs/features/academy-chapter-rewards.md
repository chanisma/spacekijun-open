# 챕터 완료 보상과 연속 의뢰 권한 수정

각 챕터를 처음 완료하면 기존 `academy_user_stats.coins`에 50코인이 추가된다. 제1장·제2장 완료 화면에 보상을 표시하고 기숙사 지갑 조회를 갱신한다. 구매와 공방에서 쓰는 기존 코인이다. 프롤로그, 대사 뒤로가기, 완료 화면 재감상은 보상 대상이 아니다.

`20260913171546_academy_chapter_rewards.sql`은 `academy_chapters.completed_at` 저장 시 트리거로 지급한다. `(user_id, chapter)` 고유 지급 원장 `academy_chapter_rewards`를 먼저 기록하고 실제로 새 영수증이 생긴 경우에만 지갑을 갱신한다. 완료·원장·잔액은 한 트랜잭션이므로 실패하면 함께 롤백한다. 중복 요청, 재접속, 이미 지급된 책갈피 삭제 후 재생성에도 추가 지급하지 않는다. 학생은 자기 원장만 읽으며 직접 지급하거나 잔액을 수정할 수 없다. 관리자 미리보기에는 기존 학생 쓰기 제한이 적용된다.

기존 완료 기록에도 동일한 트리거를 한 번 실행해 소급 지급한다. 책갈피 단계, 완료 시각, 설계와 질문 내용은 유지한다. 연결 DB 적용 시 기존 완료 2건에 총 100코인을 지급했으며 보상 누락은 0건이었다. 후속 챕터가 같은 완료 테이블을 사용하면 같은 지급 규칙이 적용된다.

`20260913171545_academy_journey_profile_lookup.sql`은 카시안 연속 의뢰의 `permission denied for table users`를 수정한다. Edge Function이 인증한 사용자 ID에 대해 기존 학생 프로필의 이메일에서 학번을 구한다. 서버 `service_role`에 없던 `auth.users` SELECT 권한을 추가하지 않으며, RPC의 서버 전용 실행 권한과 설계·활동 소유권 검사를 유지한다. 이전 테스트가 postgres로 RPC를 실행해 발견하지 못했던 문제이므로 실제 service_role로 수락·연결·실행 확인·회고 완료를 검증하도록 개선했다.

두 마이그레이션은 제2장 마이그레이션 뒤 순서대로 연결 DB에 적용하고 이력을 등록했다. SQL 검증은 실제 학생/서버 역할을 사용하며 모든 테스트 변경을 롤백한다:

- `supabase/tests/academy_chapter_rewards.sql`: 각 장 50코인, 신규 지갑, 트랜잭션 롤백, 중복/재감상/책갈피 재생성, 학생 격리와 직접 지급 금지.
- `supabase/tests/academy_growth.sql`: service_role 의뢰 전 과정, 다른 학생의 설계·활동 거부, 회고 원자성, 직접 RPC 호출 거부.
- `supabase/tests/academy_library_chapter.sql`: 제2장 질문을 사용한 service_role 의뢰 수락.

대상 ESLint와 연속 의뢰 단위 테스트 3개, 제1·2장 브라우저 검증(보상 표시 포함)을 통과했다. 프런트엔드 호스팅 배포는 별도이며 로컬 개발 화면에 반영했다.
