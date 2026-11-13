# 업무 흐름(Task Workflow) 데이터 모델

Tasks의 `업무 흐름` 탭에서 Event와 Task 사이의 업무 흐름을 n8n형 노드 캔버스로 구성하고 저장한다. 캔버스는 선후 관계, 포함 관계, 의존성, 인계, 일반 연관성을 시각화하며, Task에 연결된 실행 단위인 WORK를 같은 화면에서 실행하고 결과를 검수할 수 있다.

핵심 개념은 다음과 같이 분리한다.

- `Task`: 누가 무엇을 언제까지 해야 하는지 나타내는 책임 단위
- `WORK`: Task를 실제로 처리하는 애플리케이션 기능과 그 설정
- `RUN`: WORK의 한 번의 실행 시도
- `CHECK`: RUN 종료 시 생성한 기계 검증 결과
- `ARTIFACT`: RUN이 생성·갱신한 파일, 링크, 레코드 집합, 요약의 구조화된 참조
- `EVENT`: RUN의 시작·종료·검수 상태 전이
- `REVIEW`: 사람이 실행 결과를 승인하거나 보완 요청한 결정

## 테이블

### `task_workflow`

- 사용자 소유 워크플로우의 이름, 설명, 주관 부서, 마지막 캔버스 viewport를 저장한다.
- `department_id`는 `department.id`를 참조하며 헤더의 부서 범위로 목록을 필터링할 때 사용한다. 기존·미지정 워크플로우는 `NULL`을 허용한다.
- 생성 후에도 소유자는 목록의 수정 버튼에서 이름과 관련 부서를 변경할 수 있다.
- `owner_id`는 `auth.users.id`를 참조한다. **2026-07-26 공유 개편**: SELECT는 모든 교사/admin(`is_teacher_or_admin`), INSERT는 본인, UPDATE/DELETE는 소유자∨admin(`is_admin`). node/edge도 동일 규칙, WORK 6테이블(`task_work*`)과 산출물 스토리지(`task-work-documents`)는 **SELECT만** 교사 전체로 확대(쓰기는 소유자 전용 유지 — 타인 워크플로에서 실행·연결 불가). `save_task_workflow_graph` 가드도 소유자∨admin. 마이그레이션 `20260726231320`·`20260726232521`.
- **워크플로 복사 RPC** `copy_task_workflow(p_source_workflow_id, p_name, p_excluded_node_ids)` (마이그레이션 `20260726231703`, SECURITY INVOKER): 워크플로+내부 event/task+노드/엣지를 단일 트랜잭션 복제. 제외 노드(이벤트 제외 시 하위 task 연쇄) 반영, event/task는 새 행(매니저=복사자 resource, 담당자 상태 pending 리셋, `deadlineProgress`/`files`/AI 메타 제거), 노드·엣지 전부 새 UUID + entity/containerNodeId/양끝 remap(타 워크플로 id 재사용 방지 제약 준수), 이벤트 노드 없는 task의 소속 이벤트도 자동 복제. 반환=`{workflow_id, events, tasks, nodes, edges, actions}`.
  - **2026-09-23 개정(`20260923140000_copy_task_workflow_actions.sql`, 운영 적용)**: ①**작업(`task_action`)도 복제**한다 — 복제된 할 일의 연결을 새 할 일로(작성자 = 복사자, `task_action_insert_own` RLS 가 `created_by = 본인`), **실행 이력(RUN)은 미복제**. 한 개 유형(`instance_key=''`)은 작성자가 여럿이면 복사 후 모두 복사자 것이 되어 유일 제약에 걸리므로 (할 일, 유형)마다 하나 — 값 제출 연결(`origin=submission`) 우선 → 복사자 것 → 먼저 만든 것. 여러 개 유형은 전부, `instance_key` 새로 ②**할 일 meta 의 작업 id 를 새 id 로** — `submission.actionId`(대응 없으면 null), `actionFlow`(대응 없는 키는 버림). 안 하면 복사본이 **원본의 작업을 조용히 쓴다** ③**서버의 containerNodeId 연쇄 제외를 뺐다** — 제외 목록은 화면이 그래프의 선으로 계산해 전부 보낸다(`utils/workflowCopy.ts`). 기준이 둘이면 사용자가 업무를 빼고 그 할 일만 다시 넣어도 서버가 조용히 뺐다. 옛 화면도 연쇄한 id 를 모두 보냈으므로 호환. 검증 = 실제 소유자 권한으로 작업 5개 달린 흐름을 복사(롤백) → 작업 5/5, 원본 id 를 가리키는 actionFlow·submission 0건.

### `task_workflow_node`

- `node_kind`: `event`, `task`, `note`, `region`, **`action`**(2026-09-24)
- Event 노드는 `event_id`, Task 노드는 `task_id`를 선택적으로 참조한다.
- **Action 노드는 `action_id`(→ `task_action`)가 필수**이고 `on delete cascade`다 — 작업 연결을 해제하면
  그 노드 행이 함께 사라진다(유령 노드를 클라이언트가 정리하지 않는다). `(workflow_id, action_id)` 부분
  유니크 인덱스로 한 흐름에 같은 작업이 두 번 서지 않는다. `metadata.hostTaskNodeId`는 «함께 움직일
  할 일 노드»를 가리키는 표시일 뿐 자리는 다른 노드와 같은 절대 좌표다. 마이그레이션 `20260924150000`.
- 원본 삭제 시 참조는 `NULL`이 되지만 `label`과 `metadata` 스냅샷은 남아 흐름의 맥락을 보존한다.
- 같은 워크플로우에 동일 Event/Task를 중복 추가하지 못하도록 부분 유니크 인덱스를 둔다.
- `position_x`, `position_y`로 캔버스 위치를 저장한다.
- `region`은 원본 참조 없이 배경 구분 영역의 제목·색상·크기를 `metadata`에 저장한다.

### `task_workflow_edge`

- `source_node_id`에서 `target_node_id`로 향하는 방향성 관계를 저장한다.
- `relation_type`: `flow`, `contains`, `depends_on`, `handoff`, `related`, **`action`**(2026-09-24 — 할 일 → 그
  할 일의 작업 노드. 라벨·화살촉을 그리지 않는다. `contains`로 두면 화면이 «포함 할 일»이라고 잘못 말한다)
- 복합 외래키로 양 끝 노드가 같은 워크플로우에 속하도록 보장한다.
- `metadata`는 클라이언트 저장·복원 과정에서도 보존하므로 향후 실행 제어 정보를 확장할 수 있다. WORK 자체의 정본은 엣지나 노드 스냅샷이 아니라 `task_work`에 둔다.

### `task_work`

- `task_id`로 기존 Task와 실행 가능한 WORK를 연결한다.
- **`task_id`는 nullable (2026-08-16, 마이그레이션 `20260816090000`)**: '문서 생성' 메뉴(`/document-generation`)에서 만든 생성 방식 = `task_id`가 NULL인 행(`work_type='document.spec_fill'`, `config.origin='docgen'`). RUN 전이 RPC들은 `task_id`를 참조하지 않아 파급이 없다. **`task_id`를 채우는 것(업무 연결)은 업무 관리만 한다** — 문서 생성 쪽 경로(`setDocGenWorkTask`)는 2026-09-08 사용자 결정으로 제거됐다(연결을 만드는 자리가 둘이면 어디서 끊는지가 흐려진다). 반대로 **문서 생성 목록은 `origin`을 가리지 않고 읽을 수 있는 `document.spec_fill` 행 전부**를 보여 준다. UNIQUE(task_id, created_by, work_type)는 NULL을 서로 다른 값으로 취급하므로 독립 항목은 사용자당 여러 개 허용되고, task에 연결된 행은 종전대로 사용자·task·유형당 1건이다.
- `work_type`과 `handler_version`은 애플리케이션의 허용 목록 레지스트리 키다. DB에 저장된 URL, SQL 또는 임의 함수명을 직접 실행하지 않는다.
- `execution_mode`: `manual`, `assisted`, `automatic`
- `verification_mode`: `none`, `automatic`, `human_review`
- 같은 사용자·Task·WORK 유형은 하나만 존재하며, 삭제 대신 `archived_at`으로 비활성화할 수 있다.

### `task_work_run`

- WORK의 실행 입력 스냅샷, 출력 요약, 오류와 상태를 저장한다.
- 상태 흐름: `created/running` → `needs_review/failed/cancelled` → `accepted/needs_changes`
- `idempotency_key`는 같은 WORK 안에서 중복 실행 기록 생성을 방지한다.
- `workflow_id`는 어느 업무 흐름 화면에서 실행했는지 추적하는 선택적 참조다.

### `task_work_check`

- 실행 결과에 대한 `pass`, `warn`, `fail` 검증을 저장한다.
- `run_id + check_key`를 유일하게 두어 하나의 검증 항목이 중복 기록되지 않게 한다.

### `task_work_artifact`

- 실행이 만든 실질 결과를 `record_set`, `file`, `link`, `summary`로 구분해 저장한다.
- `locator`는 원본 데이터의 소유권을 가져오지 않고, 기존 기능에서 결과를 다시 찾을 수 있는 구조화된 위치 정보다.
- `metadata`에는 건수 등 화면 표시·검수에 필요한 요약을 두며, 파일형 결과는 MIME 유형·크기·SHA-256을 함께 기록할 수 있다.
- `run_id + artifact_key`를 유일하게 두어 실행 안에서 같은 결과물이 중복 기록되지 않게 한다.

### `task_work_run_event`

- `started`, `finalized`, `reviewed` 이벤트와 전후 상태를 append-only 감사 이력으로 보존한다.
- `sequence_no`는 같은 트랜잭션에서 생성된 이벤트도 RUN 안에서 항상 의미 순서대로 읽히게 한다.

### `task_work_review`

- `needs_review` RUN에 대한 `accepted` 또는 `needs_changes` 결정을 저장한다.
- 실행당 한 번의 최종 검수 결정을 감사 이력으로 보존한다.

### `task_work_document_template`

- `document.template_fill@1`이 사용하는 HWPX 원본, 버전, SHA-256과 치환 필드 정의를 저장한다.
- `fields`는 `key`, `label`, `required`, `defaultValue`, `occurrences`를 가진 JSON 배열이다.
- `family_id`는 논리 템플릿의 v1을, `previous_version_id`는 바로 이전 버전을 가리킨다. 계보는 분기 없는 선형 구조이며 가족별 현재 버전은 한 건만 존재한다.
- 새 버전 RPC는 현재 행을 잠근 뒤 이전 버전 보관과 다음 버전 생성을 한 짧은 트랜잭션으로 처리한다. 동시에 등록해도 하나만 성공한다.
- 템플릿 이름·설명·필드·원본 경로·해시를 포함한 버전 내용은 생성 후 수정하거나 삭제할 수 없다.
- **읽기는 전 교사/admin 공유, 쓰기는 생성자 ∨ admin**(2026-07-27). 템플릿 파일은 이미 `task_work_documents_select_teachers`로 전 교사에게 열려 있었는데 행만 소유자 전용이라 어긋나 있던 것을 행 쪽에 맞췄다. 등록·수정 시 Storage 경로의 첫 폴더는 반드시 **행 소유자(`created_by`)**와 같아야 한다 — `auth.uid()` 기준으로 쓰면 admin이 남의 양식을 고칠 때 with_check를 통과할 수 없다.
- 결과적으로 **스펙 검수 저장은 양식을 만든 사람과 admin만** 가능하다. 그 외 사용자는 공유된 양식을 열어 스펙을 고쳐 그 실행에만 쓸 수 있고 DB에는 반영되지 않는다.
- 주의: RLS가 막은 UPDATE는 오류가 아니라 **0행**이다. 쓰기 함수는 `.select('id')` 반환 행으로 실제 반영을 확인해야 조용한 실패를 막는다.

### `task_work_document`

- R3 값-기반 완성 문서: 완성본을 파일이 아니라 템플릿 "버전 행" 고정 참조(`template_version_id`) + `plan`/`knowledge`/`field_values`(FillOutput.values, prose 포함)/`row_values`(FillOutput.rows) JSONB로 저장한다.
- 재구성은 엔진 `fillDocument`에 `presetValues`(=field_values)를 재주입해 수행 — prose LLM을 호출하지 않고 같은 입력이면 출력 바이트가 동일하다(회귀: `scripts/task-work-spec-test/run-doc-values.mts`).
- 계보는 템플릿과 동일한 선형 구조(`family_id`/`previous_version_id`/`version`, 가족당 현재 버전 1건). 새 버전은 `create_task_work_document_version` RPC가 현재 행 잠금·보관·차기 생성으로 원자 처리한다.
- 템플릿과 달리 **draft 행은 내용 수정 허용**, `final`·보관 행만 불변(트리거 강제). 상태는 draft→final 단방향, 보관은 null→set 단방향. 삭제는 RLS로 draft 한정(계보 FK restrict가 중간 버전 삭제 추가 차단).
- **`work_id`(2026-08-14 추가)**: 이 문서를 만든 WORK(노드). 러너의 "저장된 완성 문서" 목록은 `created_by = 나 AND work_id = 이 노드`로 거른다. 종전에는 양식 버전에만 연결돼 목록이 **전역**이었고 A 노드를 열어도 B 노드 문서가 보였다. 양식으로 거르는 대안은 같은 양식을 여러 노드가 쓰면 다시 섞이므로 노드를 직접 참조한다. **`on delete set null`** — 노드를 지웠다고 사용자가 저장한 값까지 없애지 않는다(행은 남고 어느 목록에도 뜨지 않음). `create_task_work_document_version` RPC는 이전 버전의 `work_id`를 **승계**한다(안 하면 v2부터 목록에서 사라진다). 인덱스 `task_work_document_owner_work_idx`.
- RLS 소유자 스코프 + FORCE. insert 시 참조하는 템플릿 버전도 본인 소유여야 한다. JSONB 컬럼별 2MB 상한 CHECK.
- **제출된 문서는 예외로 열린다(`task_work_document_select_submitted`, 2026-09-03)**: 업무 제출의 값 제출(`task_submission.kind='spec'`)이 가리키는 문서는 파일 제출과 **같은 문장**으로 열람된다 — 매니저·admin 은 전원, 담당자는 본인 것만. 판정은 정책 안 조인이 아니라 DEFINER `can_view_task_spec_document(uuid)`(재귀 회피 규칙). 제출되지 않은 초안은 계속 소유자 전용이다. 상세 = `docs/features/task-spec-submission.md`
- **`origin='submission'` WORK 의 문서**: 업무 편집이 만든 제출용 WORK 하나를 담당자 전원이 `execution_mode='shared'` 로 공유 실행해 각자 자기 문서를 만든다. 이 경로는 **RUN 을 남기지 않는다** — `task_work_run` SELECT 가 교직원 전체라 `input_snapshot.plan` 이 곧 남의 제출 내용 유출이 된다.
- 서비스: `src/features/task-workflow/services/specDocumentService.ts`, UI 진입 = `SpecFillWorkRunner` ①양식 단계 "저장된 완성 문서" 불러오기 → ③plan 복원(+prose 값 재사용 토글) → ④결과 단계 저장(새 버전).

### 문서 Storage

- 비공개 `task-work-documents` 버킷에 템플릿 원본과 생성 결과 HWPX를 저장한다.
- 파일 크기는 20MB 이하이며 HWPX 관련 MIME 유형만 허용한다.
- 템플릿은 `{userId}/templates/...`, 생성 결과는 `{userId}/runs/{runId}/...` 경로를 사용한다.
- Storage RLS는 인증 사용자가 자기 UUID 최상위 폴더의 파일만 조회·등록·삭제하도록 제한한다. 파일 ARTIFACT 다운로드도 인증된 Storage 요청을 사용한다.
- DB에 등록된 템플릿 원본은 과거 RUN 재현을 위해 Storage에서도 삭제할 수 없다. DB 등록 전에 실패한 고아 템플릿 업로드와 RUN 생성 실패 파일은 정리할 수 있다.

### 문서 시각 편집

- rhwp 런타임과 React 래퍼는 업무 흐름에 종속되지 않은 공용 자산으로 둔다. 정적 Studio는 `public/rhwp-studio`, SDK 설정은 `src/lib/rhwp`, 공용 UI는 `src/components/rhwp`가 담당한다.
- 업무 흐름의 `DocumentTemplateVisualEditor`는 비공개 Storage 원본 로드와 템플릿 버전 저장만 연결하는 기능 어댑터다.
- 편집 결과는 등록 원본을 덮어쓰지 않고 `create_task_work_document_template_version` RPC를 거쳐 다음 버전으로 저장한다. 기존 치환 필드는 HWPX 안의 `{{field_key}}` 표기를 유지해야 한다.
- 자세한 공용 API와 갱신 절차는 `docs/rhwp-visual-editor.md`를 따른다.

### WORK RPC

- `start_task_work_run(...)`: RUN과 `started` EVENT를 한 트랜잭션으로 생성한다.
- `finalize_task_work_run(...)`: 실행 종료 상태·출력·CHECK·ARTIFACT·`finalized` EVENT를 한 트랜잭션으로 기록한다.
- `review_task_work_run(...)`: 검수 결정과 RUN 상태 전이를 한 트랜잭션으로 기록한다.
- `delete_task_work_run(p_run_id)`(2026-07-26, 2026-08-14 완화): 소유한 RUN을 하위 감사 행(FK cascade)과 함께 삭제하고, 정리할 파일 ARTIFACT의 Storage 경로 목록을 반환한다(클라이언트가 자기 폴더 권한으로 best-effort 파일 정리). RLS delete 정책(`task_work_run_delete_own`)도 같은 조건 — 이력 삭제는 소유자의 명시적 권리이며 append-only였던 감사 모델의 의도적 완화(사용자 요청). **2026-08-14: 상태 가드 제거** — 종전에는 `created`/`running`을 거부했는데, RUN이 그 상태에 갇히는 주된 경로가 실제 진행이 아니라 **클라이언트 중단**(탭 닫기·새로고침·오류)이라 지울 수 없는 유령 행이 영구히 쌓였다. 정말 진행 중인 RUN을 지우면 뒤이은 finalize가 실패하지만, 삭제는 **자기 RUN에만** 가능해 피해가 남에게 가지 않고 실패가 자기 화면에 즉시 드러난다. UI는 미종료 RUN 삭제 시 별도 경고 문구를 띄운다.
- 세 함수는 `SECURITY INVOKER`, 빈 `search_path`, 명시적인 `auth.uid()` 소유권·상태 검사를 사용한다.
- 트랜잭션 로컬 감사 쓰기 마커와 트리거가 일반 Data API의 직접 RUN 생성·갱신 및 CHECK/ARTIFACT/EVENT/REVIEW 삽입을 거부한다. 마커는 세 전이 RPC 안에서만 설정된다.
- **예외 1건(2026-07-27)**: 워크플로 삭제 시 `task_work_run.workflow_id`의 `ON DELETE SET NULL`이 만드는 갱신은 허용한다. ①workflow_id가 값→NULL ②나머지 컬럼(`updated_at` 제외)이 전부 그대로 ③참조하던 워크플로가 실제로 소멸 — 세 조건이 동시에 성립하는 것은 삭제 연쇄뿐이므로 살아 있는 워크플로의 링크를 끊는 직접 UPDATE는 계속 거부된다. 이 예외가 없으면 **RUN 이력이 있는 업무 흐름을 영영 삭제할 수 없다**(삭제 시 42501). 감사 본체(상태·시각·행위자)는 이 경로로 바뀌지 않는다.
- 업무 흐름 삭제 = 생성자 ∨ admin. 노드·엣지는 FK 연쇄로 삭제되고 **RUN 이력은 보존된 채 링크만 해제**된다.
- **공유 실행(2026-07-27, 2026-08-16 staff 정렬)**: `work_type = 'document.spec_fill'`인 WORK는 워크플로·WORK 소유자가 아니어도 교사/admin이 실행할 수 있다. staff 권한 개편(2026-08-14) 때 RLS 관문들은 `is_staff_teacher_or_admin`으로 치환됐는데 `start_task_work_run` 함수 본문만 `is_teacher_or_admin`으로 남아 staff가 RLS는 통과하고 RPC에서 42501로 막혔다 — `20260816090000`이 함수 본문을 같은 판정 함수로 정렬했다. RUN·CHECK·ARTIFACT·완성 문서는 전부 실행자 소유. 관문 네 곳(`start_task_work_run`, `task_work_run` INSERT·UPDATE with_check, `task_work_document` INSERT)이 같은 조건을 강제하므로 범위를 넓힐 때 네 곳을 함께 고쳐야 한다. **주의: 비교값은 `document.spec_fill`** — `@1`은 UI 표기이고 버전은 `handler_version` 컬럼이다.
- 노드 기본 양식은 `task_work.config.defaultTemplate = {id, name}`에 저장하며 WORK 생성자만 쓸 수 있다(`task_work_update_own`).
- NEIS 업무 화면(`work_type='neis.screen'`, 2026-09-23)은 `config.neis = {version:1, screens:[{key,name,path[4],innerTab?}], note?}` — 한 작업에 화면 최대 10개, 한 할 일에 NEIS 작업 여러 개(아래 `instance_key`). 쓰기는 같은 `task_work_update_own`(작성자 전용), 병합은 `mergeNeisActionConfig`. 상세 = `docs/features/neis-actions.md`.
- **`instance_key text not null default ''` + UNIQUE(task_id, created_by, action_type, instance_key)** (마이그레이션 `20260923120000_task_action_instance_key.sql`, 종전 UNIQUE(task_id, created_by, action_type) 대체). 같은 할 일·사람·유형 안의 구분자다. 기본값 `''` 라 기존 행과 기존 insert 경로(값 제출·문서 생성·연간 가져오기)는 종전처럼 "사람·할 일·유형당 하나"이고, 레지스트리 `multiple: true` 유형(현재 `neis.screen`)만 연결마다 `crypto.randomUUID()` 를 받아 여러 행이 된다. ⚠️ **`bindTaskAction` 은 더 이상 `upsert(onConflict)` 를 쓰지 않는다**(조회 → 수정/추가) — 유일 제약의 컬럼 구성이 바뀌면 onConflict 문자열이 맞지 않아 모든 연결이 실패하기 때문이고, 이렇게 해야 코드 배포와 마이그레이션 적용의 순서가 상관없어진다. **2026-09-23 운영 DB 적용 완료**(기존 13행 전부 `''`, `migration repair` 완료). ⚠️ 적용 시점에 운영 사이트는 옛 코드(`upsert(onConflict: 'task_id,created_by,action_type')`)였으므로 **이 코드가 배포되기 전까지 운영의 [작업 연결]은 실패한다**(사용자 결정 — 최근 30일 연결 생성 4건). 새 코드는 칸이 없던 시절에도 동작하도록 `PGRST204` 면 `instance_key` 없이 다시 만든다.

### `save_task_workflow_graph(...)`

- 워크플로우 기본 정보, viewport, 노드, 엣지를 한 트랜잭션에서 동기화한다.
- `SECURITY INVOKER`로 실행되어 호출 사용자의 RLS를 그대로 적용한다.
- 전달되지 않은 기존 노드·엣지를 제거하고 현재 캔버스 내용을 upsert한다.
- 다른 워크플로우에 속한 노드·엣지 UUID의 재사용을 거부한다.

## 보안 및 성능

- 워크플로우와 WORK 관련 모든 테이블에 RLS를 적용한다. WORK 관련 테이블은 `FORCE ROW LEVEL SECURITY`도 활성화한다.
- Data API 접근 권한은 `authenticated`에 명시적으로 부여하고 `anon`은 철회한다.
- WORK, RUN, CHECK, ARTIFACT, EVENT, REVIEW는 현재 생성자 소유 범위로 제한한다. 부서 공동 작업 권한은 별도 역할 모델을 추가한 뒤 확장한다.
- 소유자/갱신 시각, 워크플로우·Task·RUN과 사용자 참조 FK에 인덱스를 둔다.
- 현재 코드 레지스트리는 `evalearn.mock_marking_import@1`과 `document.template_fill@1`을 허용한다.
- 문서 WORK는 HWPX 구조, 필드 치환 수, 남은 플레이스홀더를 CHECK로 기록하고 생성 파일의 경로·MIME·크기·SHA-256을 ARTIFACT로 남긴 뒤 사람 검수를 요구한다.
- 마이그레이션: `20260722143300_create_task_workflows.sql`
- 범위 검증 보강: `20260723000021_harden_task_workflow_graph_scope.sql`
- 부서 분류·배경 영역 추가: `20260723015222_add_task_workflow_department.sql`
- WORK Core: `20260724132347_create_task_work_core.sql`
- WORK 사용자 FK 인덱스: `20260724132644_index_task_work_actor_foreign_keys.sql`
- WORK 감사 쓰기 강화: `20260724133324_harden_task_work_audit_writes.sql`
- WORK invoker 전이 가드: `20260724133556_guard_task_work_audit_transitions.sql`
- WORK 결과물·RUN 이벤트: `20260724134647_add_task_work_artifacts_events.sql`
- RUN 이벤트 결정적 순서: `20260724135323_sequence_task_work_run_events.sql`
- HWPX 문서 템플릿·비공개 Storage: `20260724140436_create_task_work_document_templates.sql`
- HWPX 템플릿 계보·원자적 버전 전환: `20260724150900_add_task_work_document_template_versioning.sql`
- HWPX 버전 내용 불변성 보강: `20260724151513_harden_task_work_document_template_immutability.sql`
- 등록된 HWPX 템플릿 원본 보호: `20260724151800_protect_registered_task_work_document_templates.sql`
- 값-기반 완성 문서(R3): `20260725120000_create_task_work_documents.sql`
- RUN 삭제 허용: `20260726010000_allow_task_work_run_deletion.sql`
- 양식 스펙 읽기 공유·쓰기 소유자 전용: `20260727010000_spec_template_teacher_read_owner_write.sql`
- 양식 스펙 쓰기에 admin 추가: `20260727011000_spec_template_admin_write.sql`
- 실행 이력 있는 워크플로 삭제 허용: `20260727012000_allow_workflow_delete_with_run_history.sql`
- 감사 가드 컬럼 안전성 수정(22번과 한 쌍): `20260727013000_fix_audit_guard_column_safety.sql`
- 문서 생성 WORK 공유 실행: `20260727014000_spec_fill_shared_workflow_execution.sql`
- 업무 제출: 스펙 기반 값 제출(`task_submission.kind`·`spec_document_id`·제출 RPC·분석 뷰·문서 열람 정책): `20260903015305_task_spec_submission.sql`
- 제출 방식 배타(파일 RPC 가 값 제출 업무를 거부): `20260903015338_task_submission_mode_exclusivity.sql`
- form2 양식 스펙 보강(타깃 8→66, `tableGroup` 도입): `20260727020000_form2_plan_spec_tablegroup.sql`
- 문서 생성 독립 항목(task_id nullable)·공유 실행 staff 정렬: `20260816090000_docgen_standalone_task_work.sql`
- 문서 생성 방식 공개/비공개(`config.visibility`, SELECT 정책 조건 추가): `20260816120000_docgen_visibility.sql`
  - `task_work_select_teachers`가 **docgen 항목(config.origin='docgen')은 `visibility='public'`일 때만** 타인에게 보이도록 좁혀졌다(없음=비공개 기본, 소유자는 항상). start RPC(SECURITY INVOKER)의 조회와 RUN INSERT/UPDATE 정책의 EXISTS 서브쿼리가 모두 이 SELECT RLS를 거치므로 **정책 한 곳이 열람·공유 실행을 함께 막는다**. 워크플로 캔버스산 WORK는 종전대로 교직원 전체 읽기.
  - 스키마 변경이 아니라 **데이터 마이그레이션**이다. 대상 행은 `content_sha256`(양식 파일 해시)으로 지목하고, 그 양식이 없는 환경에서는 0행 갱신 후 warning만 남긴다(재실행 안전).
  - `spec.targets[].kind`에 신규 값 `tableGroup`이 들어가므로 그 kind를 아는 앱 코드와 함께 배포해야 한다(구 코드는 알 수 없는 kind를 채우지 않고 건너뛴다).
  - JSON 단일 출처 = `scripts/task-work-spec-test/fixtures/form2.spec.ts`, 종단 검증 = `npx tsx scripts/task-work-spec-test/run-form2-full.mts`.
  - **타깃 id는 plan 키이기도 하다** — `task_work_run.input_snapshot`이 그 키로 계획을 담고 있어 러너의 "이 작업 내용 불러와서 진행"이 이 이름에 의존한다. 기존 id(`pick1000`~`pick1009`) 이름 변경 금지.

## docgen_context / docgen_context_spec_link (2026-09-02)

문서 생성의 **맥락 정보 라이브러리** — AI 초안 작성에 함께 넘길 배경 설명.

### docgen_context
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → auth.users | 소유자. 기본 `auth.uid()` |
| `title` | text | 1~120자 CHECK |
| `body` | text | ≤20,000자 CHECK — 프롬프트에 그대로 실리므로 상한이 필요(knowledge 상한과 같은 자릿수) |
| `hidden` | boolean | 나만 보기. **스펙에 연결돼 있으면 켤 수 없다**(트리거) |
| `category` | text | 자유 입력 분류(1~N자 CHECK). 현재 쓰이는 값 = `'성취기준'` 118건 |
| `created_at`/`updated_at` | timestamptz | `updated_at`은 트리거로 갱신 |

**RLS** — SELECT는 **두 갈래**다. ①교직원 `is_staff_teacher_or_admin(uid) AND (user_id = uid OR NOT hidden)`(문서 생성은 staff 허용 영역이라 넓은 판정 함수) ②**로그인한 그 외 사용자(학생) = 공개된 성취기준만** `auth.uid() is not null AND category = '성취기준' AND NOT hidden`. INSERT 본인 + 교직원, UPDATE/DELETE 소유자만 — **쓰기는 학생에게 열려 있지 않다**(실측: INSERT 42501, UPDATE/DELETE 0행).

**②를 더한 이유 (2026-09-14)**: 탐구 설계(`/inquiry-design`)의 "성취기준 맥락"이 이 표를 재사용하는데 그 화면은 **학생용**이다. 종전 정책은 교직원 전용이라 학생 시점에서 **0행**이 돌아왔고, RLS 차단은 오류가 아니라 빈 결과라서 화면에는 "이 과목은 등록된 성취기준이 없습니다"로만 보였다(실측 학생 0행 / 교사 118행 — 데이터는 멀쩡히 있었다). 표 전체를 열면 교사의 다른 맥락 자료까지 학생에게 나가므로 **성취기준 공개본 한 갈래만** 더했다(합성 행 3종 — 다른 분류·숨긴 성취기준·분류 없음 — 유출 0건 확인).

⚠️ **`category`는 자유 입력 텍스트다.** 즉 교사가 아무 글에나 `성취기준`이라고 적으면 그 글이 학생에게 보인다. `NOT hidden`을 함께 요구해 **공개/비공개 토글이 최종 판단**이 되게 했고, 맥락 라이브러리 화면이 분류가 `성취기준`일 때 학생 열람 대상임을 알린다. 분류를 enum으로 좁히려면 기존 118행을 먼저 정리해야 한다.

### docgen_context_spec_link
`(context_id, template_id)` PK. `task_work_document_template`과 `docgen_context` 양쪽 CASCADE.

**RLS 쓰기** = **내 맥락을**, **내가 고칠 수 있는 양식에만**. 연결은 그 맥락을 영구 공개로 묶으므로 남의 맥락을 남의 양식에 붙이는 경로를 열지 않는다.

### 불변식 "스펙 연결 ⇒ 숨김 불가"
- `docgen_context_link_requires_visible` (링크 INSERT/UPDATE 전) — 숨긴 맥락 연결 거부
- `docgen_context_hide_requires_unlinked` (맥락 UPDATE 전) — 연결된 맥락 숨김 거부

**양방향이어야 한다** — 한쪽만 막으면 순서를 바꿔 깨진 상태(숨김 + 연결)를 만들 수 있다. 둘 다 `errcode = check_violation`으로 던지므로 클라이언트가 메시지를 그대로 보여준다.

**왜 링크를 `spec` JSONB에 두지 않았나**: `task_work_document_template.spec` JSONB 배열 안의 id를 가로지르는 CHECK 제약은 쓸 수 없어 위 불변식을 DB로 강제할 방법이 없다. 관계형이면 트리거로 강제되고, "이 맥락을 쓰는 스펙" 역방향 조회와 CASCADE 정리가 공짜다.
