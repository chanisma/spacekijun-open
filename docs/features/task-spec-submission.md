# task-spec-submission — 업무 제출: 스펙 기반 값 제출

> **⚠️ 은퇴한 기능의 기록이다 (2026-10-05)** — 옛 제출 `task.meta.submission` 은 2026-10-01 에 「제출 받기」 작업(`submit.*`,
> `docs/features/submit-action.md`)으로 대체됐고, 2026-10-05 에 이 문서가 설명하는 **화면 코드를 걷어 냈다**
> (운영 옛 설정 0건 · `task_submission` 0행). DB 표·RPC 는 다음 릴리스에 정리한다 — `docs/database/core.md` §8-1.
> 아래의 판단(명단 비노출·상태에서 유도한 서버 가드·RUN 미기록 등)은 새 제출 받기의 설계 근거로 남긴다.

> 업무(task)의 제출 방식 2종 중 **"양식에 작성하게 하기"**(`meta.submission.mode = 'spec'`) 상세.
> 파일 제출(`mode='file'`, 구글 드라이브)은 `docs/features/` 밖 CLAUDE.md "파일 제출 업무" 절 참고.
> 신설 2026-09-03.

## 왜 만들었나

파일 제출은 **제출물이 블랙박스**다. 담당자가 낸 hwpx 안에 무엇이 적혔는지 알려면 매니저가
파일을 하나씩 열어야 하고, 모아서 비교하거나 집계할 방법이 없다.

값 제출은 **스펙(양식) + 입력 값**만 저장한다. 그래서:
1. **언제든 파일로 재구성**된다 — 파일을 보관하지 않아도 원하는 때 hwpx 를 만들어 준다.
2. **바로 열람**된다 — 매니저 현황이 목록이 아니라 담당자 × 항목 **표**다.
3. **DB에서 분석된다** — `task_spec_submission_view` 의 `field_values->>'키'` 로 질의된다.

## 구성 요소

| 층 | 파일 |
|---|---|
| 설정 판정 단일 출처 | `src/lib/taskSubmissionConfig.ts` (`getSubmissionConfig`/`isSpecSubmission`/`buildSubmissionMetaPatch`/`validateSubmissionConfig`) |
| CSV (순수) | `src/lib/taskSubmissionCsv.ts` |
| 데이터 계층 | `src/services/taskSpecSubmissionService.ts` (제출 RPC·평탄 조회·문서 재구성·제출용 WORK 보장) |
| 훅 | `src/hooks/useTaskSpecSubmissions.ts` |
| 매니저 설정 UI | `TaskEditDialog` 제출 블록 + `SubmissionTemplatePicker` |
| 담당자 제출 UI | `TaskSubmissionDialog`(`mode='spec'` 분기) + `SpecSubmissionComposerDialog`(러너 호스트) |
| 작성 화면 | `SpecFillWorkRunner` 의 `submission` prop (제출 모드) |
| 매니저 현황 | `SpecSubmissionTable` |
| 스키마 | `supabase/migrations/20260903015305_task_spec_submission.sql`, `..._20260903015338_task_submission_mode_exclusivity.sql` |
| 회귀 | `npx tsx --tsconfig tsconfig.app.json scripts/task-spec-submission-test/run.mts` (31건) |

## 저장 모델 — 표를 새로 만들지 않았다

- **제출 사실**은 기존 `task_submission` 한 표에 계속 모인다(`kind`='file'|'spec'). 파일이든 값이든
  제출의 단일 출처가 하나여야 카드 집계(`N/M 제출`)·완료 전이·취소 경로가 갈리지 않는다.
  `delete_task_submission` RPC 는 kind 를 보지 않으므로 **취소는 두 방식이 같은 코드**다.
- **본문**은 `task_work_document` 재사용 — plan/knowledge/field_values/row_values, 버전 계보
  (`family_id`/`previous_version_id`), draft→final 불변 트리거를 이미 갖췄다.
- `task_submission.file_url` 이 nullable 이 됐다. 형태는 `task_submission_kind_shape` CHECK 가
  강제한다(file ⇒ file_url 있음 & spec_document_id 없음 / spec ⇒ spec_document_id 있음).
- **값 제출은 담당자·단위당 현재 1건**(부분 유니크 `task_submission_spec_one_current`).
  재제출은 삭제·삽입이 아니라 **같은 행의 참조를 새 버전으로 옮긴다** — 삭제 후 삽입이면
  완료 상태가 잠깐 pending 으로 흔들리고 이력이 2건 남는다.

## 제출 경로

```
매니저: 업무 편집 → 제출받기 ON → 받는 방식 "양식에 작성하게 하기" → 양식 선택
        → 저장 시 ensureSubmissionWork() 로 제출용 WORK 1개 생성 → meta.submission.workId 2차 기록
담당자: 업무 카드 칩(문서 작성) → TaskSubmissionDialog → [문서 작성하기]
        → SpecSubmissionComposerDialog(형제 다이얼로그) → SpecFillWorkRunner(제출 모드)
        → 값 입력 → [이 문서 제출하기] → saveDocument → submit_task_spec_submission RPC
```

- **`meta.submission.workId` 는 2차 패치로 적는다**: task 가 있어야 WORK 를 만들 수 있어(FK)
  저장 → WORK 보장 → meta 재기록 순서다. 실패해도 업무 저장 자체는 되돌리지 않고 토스트로
  알린다(다시 저장하면 복구된다).
- **`ensureSubmissionWork` 는 `bindTaskWork` 를 쓰지 않는다** — 그 upsert 는 `config` 를 `{}` 로
  덮어써 `origin`·`defaultTemplate` 을 날린다. 조회 후 없으면 insert, 있으면 config **병합**.
- WORK 의 `origin` 은 **`'submission'`**(docgen 아님): `task_work_select_teachers` 정책이
  `origin='docgen'` 인 행에만 `visibility='public'` 을 요구하므로, docgen 으로 두면 비공개
  항목이 담당자에게 아예 안 보이는 함정에 걸린다.
- `execution_mode='shared'` — 담당자 전원이 WORK **하나**를 공유 실행해 각자 자기 문서
  (`created_by`=본인)를 만든다. 문서화된 "노드 기본 스펙 + 공유 실행" 모델 그대로다.

## 러너의 제출 모드 (`SpecFillWorkRunner` `submission` prop)

`submissionMode` 하나로 갈리는 것들:

| | 일반(문서 생성·워크플로) | 제출 모드 |
|---|---|---|
| 단계 | ①양식 ②스펙 검수 ③계획 검토 ④최종 | **①내용 작성 ②확인 후 제출**(양식·스펙 칩 숨김) |
| 진입 | 양식 단계 | 지정 양식 자동 열기 → **바로 계획 검토** |
| 양식 | 소유자면 변경 가능 | **소유자여도 잠근다** |
| RUN 기록 | `start/finalize_task_work_run` | **기록하지 않는다** |
| 최종 주행동 | 문서 내려받기 | **[이 문서 제출하기]** (내려받기는 부차) |
| 보관·이력 | 있음 | 없음 |
| 재개 | 이력에서 "불러와서 진행" | 마운트 시 **내 최신 제출본 자동 열기**(+"처음부터") |

- **RUN 을 남기지 않는 것이 보안 요구다**: `task_work_run` SELECT 는 교직원 전체 읽기라
  `input_snapshot.plan` 이 곧 **남의 제출 내용 유출**이 된다. 담당자 명단 비노출 결정과 충돌한다.
- 매니저가 적은 `meta.submission.guide` 는 계획 검토 **맨 위**에 그대로 뜬다.
- 양식 잠금은 `familyId` 로 되찾는다 — 핀한 `id` 는 **버전 행**이라 새 버전이 등록되면
  보관본이 되어 목록에서 사라지고, 그 순간 잠금이 **조용히 풀린다**(`findPinned`).

## 권한·열람

- 제출 RPC(`submit_task_spec_submission`)가 서버에서 다시 본다: 담당자 본인 여부
  (**키는 `meta.assignees[].id`** — `resource_id` 아님), 업무가 값 제출 설정인지,
  다중 마감 배타, 단위 실재, 문서 작성자 본인, **문서가 이 업무의 제출용 WORK 것인지**.
- 열람 범위는 파일 제출과 **같은 문장**: 매니저·admin 은 전원, 담당자는 본인 것만.
  판정은 정책 안 조인이 아니라 DEFINER `can_view_task_spec_document(uuid)` — 지금은 재귀가
  없지만 두 표가 서로를 참조하기 시작하면 42P17 로 죽는다(창체에서 재발한 전례).
- 제출되지 않은 초안은 계속 소유자 전용(기존 `task_work_document_select_own`).
- `task_spec_submission_view` 는 `security_invoker` 라 하부 RLS 를 그대로 계승하고,
  **`knowledge` 는 의도적으로 제외**한다(학생 데이터가 실릴 수 있다).

## 배타 규칙 (3중 방어: 화면 · `validateSubmissionConfig` · 서버 RPC)

- **다중 마감과 함께 쓸 수 없다**(파일 제출과 같은 이유 — 회차별 완료가 `meta.deadlineProgress` 에
  따로 있어 "제출=완료" 한 줄로 표현되지 않는다).
- **이미 제출물이 있으면 방식을 바꿀 수 없다**(이종 행이 섞이면 현황·분석이 무너진다).
  `submit_task_submission`(파일)은 값 제출 업무면 `0A000` 으로 거부하고, 반대도 같다.
- **이미 spec 제출물이 있으면 양식을 바꿀 수 없다**(이미 낸 사람과 앞으로 낼 사람의 서식이 갈린다).
- 과제 단위 업무와는 **조합 가능**(단위별 1건, 제출 시 `set_task_unit_status(completed)`).

## 문서 재구성 (`rebuildSpecDocumentBlob`)

**LLM·DB 조회가 없다.** `runSpecFillPipeline` 을 타면 `resolveKnowledge` 가 **열람자 권한으로
DB 를 다시 읽어** 제출 시점과 다른 문서가 나온다(매니저가 열면 매니저가 보는 데이터로 채워진다).
그래서 저장된 `knowledge` 를 그대로 쓰고 `fillDocument` 만 부른다.
`template_version_id` 가 **버전 행**을 가리키므로 양식이 나중에 바뀌어도 제출 시점 서식이 나온다.

**편집기에서 손으로 고친 서식은 제출물에 포함되지 않는다** — 제출되는 것은 값이다.
러너 최종 단계와 제출 다이얼로그 양쪽에 이 문장을 적어 둔다.

## 알려진 한계

- 매니저 표의 열 라벨은 첫 제출물의 **양식 버전 스펙**에서 뽑는다. 스펙을 못 읽으면 키를
  라벨로 쓴다(표는 그려진다).
- 반복 행(rowGroup)은 표·CSV 에서 **`N행`** 으로만 요약된다. 행 단위 비교가 필요하면
  `task_spec_submission_view.row_values` 를 SQL 로 펼쳐야 한다.
- 제출 취소는 제출 **행**만 지운다. 값 문서(`task_work_document`)는 담당자 소유로 남아
  다시 열어 재제출할 수 있다(`on delete restrict` — 제출 행을 먼저 지워야 문서를 지울 수 있다).
