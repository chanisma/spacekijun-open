# 할 일 작업 「제출 받기」 (`submit.file` · `submit.document` · `submit.physical`)

> 2026-10-01 신설 — 옛 제출 받기(`task.meta.submission` + `task_submission`)를 **작업(Action) 세 개**로 바꿨다.
> 설계·결정 경위 = [`docs/plans/2026-10-01-submission-action-overhaul.md`](../plans/2026-10-01-submission-action-overhaul.md).
> 요청·명단 표는 [입력 받기](collect-input.md)와 같다.

## 무엇이 바뀌었나

| | 옛 제출 받기 | 새 제출 받기 |
|---|---|---|
| 정체 | 할 일 설정(`task.meta.submission`)을 작업처럼 흉내 | 진짜 작업(`task_action`) — 연결 목록·편집 창·렌치 색이 다른 작업과 같은 경로 |
| 받는 것 | 파일 · 양식 문서 · 스프레드시트 · 실물(한 설정 안의 «방식») | **작업 셋**: 파일 / 양식 문서 / 실물. 스프레드시트는 없앴다 — 값을 표로 받는 것은 **입력 받기**가 한다 |
| 누구에게 | 할 일 담당자 고정 | **대상 규칙**(입력 받기와 같다). 기본 = «이 할 일의 담당자» |
| 한 할 일에 | 하나 | 여럿(`multiple`) — «계획서 파일» + «서명본 실물» |

사용자 결정(2026-10-01): ①받는 것으로 나눈다(입력 = 값, 제출 = 결과물) ②대상 규칙, 기본 = 담당자 ③담당자가 내면 그 담당자 완료
④화면은 입력 받기를 따른다 ⑤[요청 보내기]가 필요하되 대상이 담당자뿐이면 자동(**같은 날 되돌림 — 언제나 버튼으로만**, 아래 «수명» 2) ⑥내 할 일 「입력 요청」과 배지를 「요청」으로 합친다
⑦과제 단위별 제출 지원 ⑧옛 4건은 마감된 새 작업으로 옮긴다.

## 수명

1. 할 일 편집 창 [작업] 또는 렌치 창 [작업 연결] → 「제출 받기」 묶음에서 하나 추가.
2. [열기] → 설정·미리보기 → **[요청 보내기]**를 눌러야 요청이 열리고 대상자에게 알림이 간다(입력 받기와 같다).
   연결하거나 설정을 저장하는 것만으로는 아무에게도 가지 않는다 — **2026-10-01 사용자 결정**으로 «대상이 담당자뿐이면 만들 때 자동으로 보냄»
   (트리거 `auto_start_submission_request`)을 없앴다(`20261001210000`). 그래서 보내기 전에는 완료 가드도 걸리지 않는다
   (담당자는 내지 않고도 완료할 수 있다 — 설정 화면이 그렇게 말한다). 보낸 뒤 «이 할 일의 담당자» 명단이 담당자 변경을 따라가는 것은 그대로다.
3. 대상자: 알림 → `/my-tasks?collect=<작업 id>`(입력 받기와 같은 창이 종류로 본문을 가른다) · 내 할 일 「요청」 · 홈 「나의 업무」 · 메뉴 배지 · 계획표.
   담당자인 대상자는 내 할 일 줄·할 일 상세 «내 작업»에서 [완료하기] 대신 **[제출하기]**를 본다.
4. 매니저: 현황(진척 · 다시 알림 · 명단 다시 계산 · 마감 · 내려받기) · 실물은 [받음]/[받음 취소].
5. 할 일이 완료·취소되면 요청이 닫힌다(입력 받기와 같은 트리거).

## 완료 연결

- **담당자의 완료 = 그 사람이 대상인 «열린» 제출 요청을 전부 채웠다.** 채우면 서버가 저절로 완료로, 지우면 대기로 바꾼다.
- **가드는 `task` 의 BEFORE UPDATE 트리거 하나**(`guard_submission_completion`) — 상태 RPC·단위 RPC·직접 쓰기가 모두 `task.meta` 를 고치므로
  한 곳이면 된다. 옛 가드는 `set_task_assignee_status` 안에만 있어 **과제 단위 할 일은 «제출 없이 완료»가 가능했다**(지금은 막힌다).
- 요청이 열리거나 명단이 바뀌면 이미 완료였던 담당자·단위가 **대기로 돌아갈 수 있다**(낼 것이 생겼으므로 — 의도한 동작).
- 담당자가 아닌 대상의 제출은 완료와 무관(입력 받기와 같다).

## 대상 조건 «이 할 일의 담당자» (`task_assignees`)

- **id 를 담지 않는다.** 서버가 풀 때마다 그 할 일의 지금 담당자로 바꾼다(`expand_task_audience`) — 업무 흐름 복사·연간 가져오기가
  설정을 통째로 복제하므로 박아 둔 id 는 다른 할 일의 사람을 가리킨다.
- 이 조건이 든 요청은 **담당자가 바뀌면 명단이 저절로 따라간다**(트리거 `follow_task_assignees_in_requests`).
  안 그러면 나중에 넣은 담당자는 대상이 아니라서 **제출 없이 완료**할 수 있다(설계 중 발견).
- 고를 수 있는 곳 = 입력 받기·제출 받기(`AudienceRuleBuilder allowTaskScoped`). **메시지 보내기는 아직 아니다** — 그 서버 경로
  (`send_task_message`)가 할 일 맥락 없이 풀어서 고르면 아무에게도 가지 않는다.
- 미리보기는 `resolve_task_audience(rule, task_id)` — `useAudiencePreview(rule, axis, enabled, taskId)`.

## 과제 단위별 제출 (2026-10-01 «단위별 제출 지원»)

과제 단위 할 일(`task.meta.units`)에 붙은 요청은 축이 **`unit`** 이다(보낼 때 서버가 정한다).
- 대상자는 **내 단위 · 아직 아무도 맡지 않은 단위** 중 하나를 골라 낸다 — 내는 순간 그 단위를 맡는다(`set_task_unit_status` 재사용).
- 그 단위에 **남은 제출이 없으면** 단위가 완료된다. 한 단위가 파일·실물 두 요청에 걸리면 둘 다 내야 완료(운영 드라이런에서 잡은 결함 —
  하나 내고 완료로 밀면 가드가 거부했다).
- «다 냄» = 맡은 단위가 하나 이상이고 전부 냈다. 맡은 단위가 없으면 낼 것도 없다(미완료로 세지 않는다 — 내 요청 칸 수 0).
- 실물은 매니저가 **사람 × 단위**로 [받음].

## 저장

| 표 | |
|---|---|
| `task_action` | `action_type` = `submit.file`/`submit.document`/`submit.physical`, 설정 = `config.submit`(`title`·`audience`·`dueDate`·`guide`·`template`(양식 문서)·`forms`(실물 양식, 구글 공용 드라이브)) |
| `collect_request` | `kind`(`file`·`document`·`physical`) · `axis`(`person`·`unit`) — 입력 받기와 같은 표 |
| `collect_target` | 명단 스냅샷 — 입력 받기와 같다(사람 축만) |
| `action_submission` | 제출물. 파일은 사람(×단위)당 여러 행, 양식 문서·실물은 사람(×단위)당 1행. 실물 = `received_at`/`received_by` |

쓰기는 RPC 전용: `submit_action_file` · `submit_action_document` · `mark_action_received`(매니저) · `delete_action_submission`
(담당자는 자기 실물 수령 기록을 못 지운다) — 모두 `p_unit_key` 를 받는다. 요청·명단·설정·재알림·마감은 입력 받기 RPC 를 종류로 넓혀 쓴다.
알림 `submission_requested`. 상세 스키마 = [`docs/database/core.md`](../database/core.md) §16-1.

## 조용히 틀리는 자리

1. **화면이 할 일을 «작업 흉내»로 다루면 화면마다 따로 맞춰야 한다** — 옛 제출 받기가 렌치 색·연결 목록·편집 창 세 곳에서 따로 틀렸다.
   작업이 되면서 이 부품(`SubmissionSettingsDialog`·`hasConnectedActions` 의 제출 분기 등)은 **쓸모가 없어졌다** — **2026-10-05 에 걷어 냈다**(옛 제출 다이얼로그·설정 창·초안·작업 카드의 옛 줄, `taskActionPresence` 는 연결 판정만 남음). DB 표·RPC 는 다음 릴리스.
2. **양식 문서는 문서의 `action_id` 로 검증한다** — 옛 함수는 이름이 바뀐 키(`workId`)를 읽어 **2026-09-20 이후 모든 양식 문서 제출이 실패**하고 있었다
   (켠 할 일이 0건이라 아무도 몰랐다). 작성 러너는 제출 작업의 양식을 `config.defaultTemplate` 자리로 받아 그 작업 id 로 문서를 만든다.
3. **`resolve_audience` 는 `unit` 축을 모른다** — 단위 축 요청도 대상(사람)은 사람 축으로 푼다. 바꿔 넘기면 예외.
4. **단위 할 일의 «다시 맞추기»는 단위로** — 담당자 상태 함수는 단위 할 일을 거부한다(P1 에 있던 결함, 운영 드라이런에서 잡혀 `20261001190000` 이 고쳤다).
5. ~~복제 경로에서 자동 보내기가 즉시 열린다~~ — 자동 보내기를 없애 해소(2026-10-01). 복제된 작업도 [요청 보내기]를 눌러야 나간다.
6. **실물 양식을 목록에서 빼면 드라이브에서도 지운다 — 단 다른 작업이 같은 파일을 쓰면 남긴다** (2026-10-01).
   연간 가져오기·업무 흐름 복사는 설정을 통째로 복제해 **같은 드라이브 링크를 공유**하므로, 지우면 작년(또는 복사본) 할 일의 양식이 죽은 링크가 된다.
   지우는 시점은 설정 저장 **뒤**(반대면 저장 실패 시 설정이 지워진 파일을 가리킨다), 공유 여부를 모르면 지우지 않는다,
   올린 사람이 아니면 드라이브가 403 으로 거부하므로 남긴다 — 남긴 이유는 화면이 말한다(`deleteUnusedFormFiles`).
7. **드라이브 삭제 함수가 «아무것도 안 지우고 성공»으로 끝날 수 있었다** — `deleteFileAndCleanupFolders` 가 Google API 를
   준비하지 않은 채 파일을 조회해 실패하면 그 예외를 «이미 지워짐»으로 삼켰다. 스스로 준비하고, «이미 없음»은 404 일 때만으로 좁혔다.

## 검증

- 운영 롤백 드라이런: 사람 축 17종(59명 할 일) · 단위 축 11종(64단위 할 일) · 옛 4건 옮기기(알림·상태 변화 0).
- 회귀 `npx tsx --tsconfig tsconfig.app.json scripts/submit-action-test/run.mts`(50건 — 설정 모델·사람/단위 현황·대상 조건·배선·마이그레이션 불변식).

## 파일

- 서버: `supabase/migrations/20261001180000_submission_actions.sql` · `20261001190000_submission_units.sql` · `20261001200000_migrate_legacy_submissions.sql`
- 모델: `src/lib/submitAction.ts` · `src/lib/audienceRule.ts`(`task_assignees`) · `src/lib/collectInput.ts`(`RequestKind`·`pendingSubmitRequestsByTask`)
- 화면: `src/features/task-workflow/components/submit/*` · `services/submitActionService.ts` · `hooks/useSubmitAction.ts`

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| (task-workflow) `submit.*` | **할 일 작업 「제출 받기」** (2026-10-01 — 옛 `task.meta.submission` 을 대체). 파일 / 양식 문서 / 실물 세 작업, 대상 규칙(기본 «이 할 일의 담당자»), 요청·명단은 입력 받기 표를 종류로 넓혀 공유, 제출물 = `action_submission`. 담당자는 다 내면 완료(가드 = task 트리거), 과제 단위 할 일은 단위별 제출. 내 할 일 「요청」·배지는 입력·제출 합산 | `src/lib/submitAction.ts`, `components/submit/*` · `docs/features/submit-action.md` |
