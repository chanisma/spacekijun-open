# 업무 문서 분석 이력 스키마

## 적용 마이그레이션

1. `supabase/migrations/20260722223329_task_document_analysis_history.sql`
2. `supabase/migrations/20260722223529_restrict_task_document_analysis_grants.sql`
3. `supabase/migrations/20260722223755_index_task_document_analysis_foreign_keys.sql`

세 마이그레이션은 원격 Supabase MCP가 기록한 실제 버전과 일치한다. 분석 이력 테이블을 만든 다음, 기존 프로젝트의 기본 권한으로부터 상속될 수 있는 `TRUNCATE`·`TRIGGER`·`REFERENCES`를 회수하고 `authenticated`에 CRUD만 다시 부여한다. 마지막으로 개정 관계와 결정 작성자 외래키의 조회 인덱스를 보완한다. 실행 순서는 파일의 시간순을 기준으로 한다 (2026-07-24부터 루트 `MIGRATION_EXECUTION_ORDER.md`가 존재하지만 Task Workflow/WORK 계열만 다루며, 이 세 마이그레이션은 포함되지 않는다).

## 테이블

### `public.task_document_analysis`

- 업무 관리 화면에서 실행한 문서 분석 한 건을 저장한다.
- 원문 파일은 저장하지 않는다.
- 파일 SHA-256, 정규화 문서 키, 파일 메타데이터를 저장한다.
- 파서·프롬프트·모델 버전과 검증된 JSON 분석 결과를 저장한다.
- `revision_of`로 동일 문서의 재분석·개정판 계보를 표현한다.
- 검토 후보가 실제 업무 이벤트가 되면 `applied_event_id`와 `applied_at`을 기록한다.

### `public.task_document_analysis_decision`

- 분석 후보마다 `create`, `exclude`, `link_event`, `link_task` 중 하나를 저장한다.
- 새 업무 생성 후 후보와 생성된 task ID를 연결한다.
- 연결 대상이 나중에 삭제되어도 감사 시점의 UUID를 보존하기 위해 대상 ID는 감사 스냅샷으로 저장한다.

## 보안

- 두 테이블 모두 RLS를 활성화하고 강제한다.
- 로그인 사용자는 자신이 생성한 분석과 그 하위 결정만 조회·추가·변경·삭제할 수 있다.
- `anon`과 `PUBLIC` 권한은 회수하고 `authenticated`에 필요한 DML만 명시적으로 부여한다.
- UPDATE 정책은 `USING`과 `WITH CHECK`를 모두 사용한다.

## 원격 적용 및 검증

- 대상: `your-project-ref` (`Kijun Dream On`, `ap-northeast-2`)
- Supabase MCP로 세 마이그레이션 적용 완료
- MCP TypeScript 생성 결과에서 새 두 테이블 타입 반영 완료
- `authenticated` 소유자: 분석 1건·결정 1건 조회 확인
- 다른 `authenticated` 사용자: 분석 조회 0건·수정 0건 확인
- RLS 테스트 데이터 삭제 확인
- `authenticated` 권한은 `SELECT`, `INSERT`, `UPDATE`, `DELETE`만 존재하며 `anon` 권한은 없음
- Advisor: 새 테이블 관련 보안 경고 0건, 외래키 미인덱스 경고 0건

브라우저에서 동일 파일 재업로드, 개정 파일 업로드, 기존 업무 연결, 새 업무 생성의 사용자 흐름은 별도 수동 점검 대상으로 남긴다.
