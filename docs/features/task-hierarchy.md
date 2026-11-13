# 업무 체계 — 세 계층의 어휘 사전

**이 문서는 살아 있는 사전이다.** 일의 위계를 가리키는 이름은 영문·한국어·DB 물리명·
저장된 값 네 가지 표기를 갖는데, 그 대응을 여기 한 곳에만 적는다.
재정의 작업의 절차·단계는 [`docs/plans/2026-09-20-work-task-action-hierarchy.md`](../plans/2026-09-20-work-task-action-hierarchy.md)에 있다.

**현재 상태: Phase 5a 완료 — 클라이언트(이름·문구·탭)와 DB 표·함수 이름이 모두 새 어휘다.
남은 것은 배포 후 뒷정리뿐**(호환 층 제거 · Storage 버킷 · `task.event_id` 등 컬럼 4개 ·
`node_kind='event'` 11행 · 판별자 `'event'`).
회귀 = `npx tsx scripts/task-vocabulary-test/run.mts`

> **⚠️ 지금 DB 에는 구 이름이 "호환 층"으로 함께 살아 있다.** 배포된 번들이 아직 `task_work*` 를
> 부르기 때문이다 — `security_invoker` 뷰 8개 + 래퍼 함수 6개(`20260920120000_task_action_rename.sql`).
> **새 코드는 절대 구 이름을 쓰지 말 것.** 걷어내기 = `20260920120100_task_action_compat_drop.sql.pending`.
> **Storage 버킷은 아직 `task-work-documents`** 다(물리 객체 이동이 필요 — 같은 `.pending` 에 절차).

---

## 1. 세 계층

| 계층 | 뜻 | 신 영문 | 신 한국어 | 구 영문 | 구 한국어 |
|---|---|---|---|---|---|
| 최상위 | 하나의 프로젝트·행사. 여러 할 일을 담는 그릇 | **Work** | **업무** | Event | 이벤트 |
| 중간 | 사람에게 배정되어 마감과 상태를 갖는 단위 | **Task** | **할 일** | Task | 업무 |
| 최하위 | 할 일에 붙어 실제로 수행하는 기능(문서 생성·입력/제출 받기·NEIS 화면·링크) | **Action** | **작업** | Work / WORK | WORK · 워크 · 실행 |

**Work(업무) → Task(할 일) → Action(작업)**

> **2026-10-05 화면 이름 정리 (사용자 결정)** — Action 의 한국어는 **작업**이다(«실행»은 작업을 **한 번 돌린 것** — 실행 이력·검수에만 쓴다).
> 같은 날 함께 정한 화면 이름: 업무를 만들고 관리하는 사람 = **책임자**(코드의 `manager`·`meta.managers` 는 그대로, «관리자»는 시스템 관리자 전용) ·
> 미완료 상태 = **진행 중**(진행중·진행·활성·대기 → 하나로) · 업무 진행 모달 = **단계별 진행** · 캔버스 = **업무 흐름**(워크플로·Work/Task 머리 → 업무 흐름·업무·할 일).
> 화면 문구만 바꿨다(내부 키·주석 그대로). 서버 예외문 27곳 = `20261005130000_task_vocabulary_messages.sql`. 회귀 = `npx tsx scripts/task-naming-test/run.mts`.
> 근거 = `docs/plans/2026-10-05-task-ux-audit.md` §4-2.

> `업무 관리`(메뉴)와 `업무 흐름`(workflow 캔버스)은 **그대로 둔다** —
> 둘 다 새 어휘에서도 뜻이 맞는다.

---

## 2. DB 물리명

| 구 | 신 |
|---|---|
| `event` | `work` |
| `task` | `task` (유지) |
| `task_work` | `task_action` |
| `task_work_run` | `task_action_run` |
| `task_work_check` | `task_action_check` |
| `task_work_artifact` | `task_action_artifact` |
| `task_work_review` | `task_action_review` |
| `task_work_run_event` | **`task_action_run_log`** (컬럼 `event_type` → `log_type`) |
| `task_work_document` | `task_action_document` |
| `task_work_document_template` | `task_action_document_template` |
| `task_workflow` · `_node` · `_edge` | **유지** |
| `task_spec_submission_view` | 유지 |

**컬럼**

| 구 | 신 |
|---|---|
| `task.event_id` | `task.work_id` |
| `task_workflow_node.event_id` | `task_workflow_node.work_id` |
| `task_document_analysis.applied_event_id` | `applied_work_id` |
| `task_document_analysis_decision.linked_event_id` | `linked_work_id` |
| `task_work.work_type` | `task_action.action_type` |
| `task_work_run.work_id` | `task_action_run.action_id` |
| `task_work_document.work_id` | `task_action_document.action_id` |

**함수 이름**

| 구 | 신 |
|---|---|
| `get_task_event_detail` | `get_work_detail` |
| `get_task_events` | `get_works` |
| `is_task_event_manager` | `is_work_manager` |
| `start_task_work_run` | `start_task_action_run` |
| `finalize_task_work_run` | `finalize_task_action_run` |
| `review_task_work_run` | `review_task_action_run` |
| `delete_task_work_run` | `delete_task_action_run` |
| `create_task_work_document_version` | `create_task_action_document_version` |
| `create_task_work_document_template_version` | `create_task_action_document_template_version` |
| `guard_task_work_audit_write` | `guard_task_action_audit_write` |
| `guard_task_work_document_lineage` | `guard_task_action_document_lineage` |
| `guard_task_work_document_template_lineage` | `guard_task_action_document_template_lineage` |
| `assign_task_work_run_event_sequence` | `assign_task_action_run_log_sequence` |

> `save_task_workflow_graph` · `copy_task_workflow` 는 **이름 유지**(본문만 고친다).

---

## 3. 값으로 저장된 이름

코드 이름이 아니라 **행에 들어 있는 문자열**이다. 바꾸려면 데이터 이관이 따라온다.

| 무엇 | 구 값 | 신 값 | 라이브(2026-09-20) |
|---|---|---|---|
| `task_workflow_node.node_kind` | `'event'` | `'work'` | **11 / 51행** |
| `task.meta.submission.workId` | `workId` | `actionId` | **1행** |
| `task_action.action_type` | `'link.event_create'` | `'link.work_create'` | **0행** |
| Storage 버킷 id | `task-work-documents` | `task-action-documents` | **객체 32** |
| `*.storage_bucket` 값 | 위와 동일 | 위와 동일 | 템플릿 9행 |
| `notification_events.type` | `'event_updated'` | `'work_updated'` | **0행** (죽은 경로) |
| `documents.meta` source type | `'event'` | `'work'` | **0행** |
| 협업 카드 `LinkedItemType` | `'event'` | `'work'` | **0행** |
| `get_admin_dashboard_stats` allowlist | `('events','event')` 등 | 새 키·표명 | 함수 본문 |

### 3-1. URL 탭 값 — ⚠️ 부분 문자열 치환 금지

> **2026-10-05 탭 → 페이지**: 업무 관리의 탭은 각자의 주소를 가진 페이지가 됐다 —
> `/tasks/mine`(업무 목록) · `/tasks/workflow` · `/tasks/timeline` · `/tasks/map`(관리자). 「내 업무 관리」와 「업무 검색」은
> **업무 목록 하나**로 합쳐 범위(`?scope=all`)로 가른다. 아래 값들은 이제 **보기 값**(`taskViewOf` — 안내·내부 분기)과
> **구 주소 `/tasks?tab=…` 넘겨 주기**에만 쓰인다. 정본 = `src/lib/taskTabs.ts`.

| 구 | 신(보기 값) | 화면 · 지금 주소 |
|---|---|---|
| `myWork` | `myTasks` | 내 할 일 → `/my-tasks` |
| `myEvents` | **`myWorks`** | 업무 목록 «내가 책임자인 업무» → `/tasks/mine` (2026-09-21 「내 업무 관리」 · 그 전 '내 업무') |
| `events` | `works` | 업무 목록 «전체 업무» → `/tasks/mine?scope=all` (구 「업무 검색」) |
| `workflow` | `workflow` | 업무 흐름 → `/tasks/workflow` |
| `timeline` | `timeline` | 타임라인 → `/tasks/timeline` |
| — | `map` | 학교 전체 → `/tasks/map`(관리자) |

**`myWorks`(신)가 `myWork`(구)를 문자열로 포함한다.** 그래서 `myWork → myTasks`를
부분 문자열 치환으로 돌리면 `myWorks`가 `myTaskss`로 망가지고, 순서를 바꿔도
`myEvents → myWorks`를 먼저 적용한 뒤 `myWork`를 치환하면 **방금 만든 새 값이 다시 망가진다.**
반드시 **값 전체가 정확히 일치할 때만** 바꾼다. 회귀가 이 충돌 목록을 고정한다.

저장된 딥링크는 DB에 **0건**(공지 본문·알림 meta 전수 확인)이므로 이관 대상이 없다.
위험은 사용자 북마크뿐이고 레거시 리다이렉트로 덮는다.

---

## 4. 범위 밖 — 같은 낱말, 다른 개념 (절대 바꾸지 말 것)

**이 목록이 이 작업에서 가장 중요하다.** 전부 `event`·`work`·`action`이라는 글자를
갖지만 위계와 무관하고, 일괄 치환이 닿으면 **오류 없이** 다른 기능이 깨진다.

| 무엇 | 어디 |
|---|---|
| 캘린더 `meeting.kind='event'` (행사·출장) | `types/domain.ts`, `hooks/useSchedule.ts`, `lib/scheduleUtils.ts`, `services/notificationService.ts`(`'출장'` 3곳), `googleCalendarExportService.ts`, `googleCalendarService.ts`, `TimetableAddActivityDialog.tsx`, `useTimetableData.ts`, `useStudentWeeklySchedule.ts`, 스케줄 모달 6종 |
| `notification_events` 표 자체 | 알림 이벤트 |
| `student_puzzle_progress.event_id` / `unlock_puzzle_piece()` | 아카데미 퍼즐. `event_id` 컬럼을 갖지만 업무와 무관 |
| `create_meeting_notification()` · `user_can_access_meeting()` | 캘린더 |
| UI의 action | `ActionSearchBar`, `AlertDialogAction`, `SubmissionDataActions`, `enableBulkActions`, DOM id `task-actions-${id}`, 엣지 함수 payload `action:` |
| `academy_workshop_*`, `purchase_request_collaborators`, `point_transactions` | `work`/`action` 글자만 겹친다 |

> **새 Action 계층의 식별자는 맨 이름 `Action`을 쓰지 않고 `TaskAction*`으로 짓는다** —
> 위 UI action과 갈라놓기 위해서다.

### 4-1. 범위 **안**인데 범위 밖처럼 보이는 것

- **`'link.event_create'`** — 이름만 보면 캘린더 같지만 `EmbedWorkRunner`가
  `LazyEventCreateDialog`(업무 Event 생성 모달)를 연다. 라벨도 `이벤트(프로젝트) 생성`이다.
  → `'link.work_create'` · `업무 생성`으로 바꾼다. 라이브 사용 0건.
- **`task_work_run_event.event_type`** — 여기서 event 는 감사 로그 항목이라 위계와 무관하지만,
  낱말을 완전히 회수하기 위해 `task_action_run_log.log_type` 으로 함께 바꾼다(사용자 결정).

---

## 5. 회귀

```
npx tsx scripts/task-vocabulary-test/run.mts
```

검사하는 것:
1. **범위 밖 카나리** — §4의 자리들이 그대로 남아 있는가 (모든 Phase에서)
2. **탭 대응표 안전성** — 부분 문자열 충돌 목록이 문서와 일치하는가
3. **표면 증가 방지** — 이행 중에 구 어휘로 새 코드가 늘지 않았는가
4. **Phase 진행** — 선언된 Phase까지의 이름 변경이 실제로 끝났는가

**이 부류의 실수는 빌드도 타입 검사도 통과한다** — 정적 검사가 유일한 방어선이다.
