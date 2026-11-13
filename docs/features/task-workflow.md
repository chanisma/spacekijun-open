# task-workflow

> CLAUDE.md 에서 분리한 상세 문서. 스키마·마이그레이션은 `docs/database/*.md` 참조.

업무 흐름 캔버스 + **WORK 실행 계층** (Tasks `업무 흐름` 탭).

**캔버스**: n8n형 노드 편집기 — event/task/note/region 노드, 관계선 5종(flow/contains/depends_on/handoff/related), viewport·부서 분류 저장(`save_task_workflow_graph` RPC, SECURITY INVOKER).

**WORK Core(2026-07-24)**: Task(책임)와 WORK(실행 기능)를 분리 — WORK 1회 실행=RUN, 기계 검증=CHECK, 산출물=ARTIFACT, 상태 전이 감사=EVENT, 사람 승인=REVIEW (`task_work`·`task_work_run`·`task_work_check`·`task_work_artifact`·`task_work_run_event`·`task_work_review`). WORK 유형은 **코드 레지스트리 allowlist**(`workRegistry.ts`)만 허용(DB 값으로 임의 URL/SQL/함수 실행 금지): `evalearn.mock_marking_import@1`(admin 전용, 모의고사 마킹 CSV 등록 — evalog `MockMarkingImportTab` 재사용)·`document.template_fill@1`(교사·admin, **"HWPX 직접 작성"** — 2026-07-26 OVERHAUL: 구 치환 필드 방식 대신 업로드→rhwp 편집기 직접 수정→완료 시 RUN(needs_review)+ARTIFACT 기록·다운로드, `HwpxDirectEditRunner`; 구 러너 파일은 미사용 보존)·`document.spec_fill@1`(**"HWPX 스펙 기반 문서 생성"**)·**연결형 WORK ~30종**(2026-07-26, 전수조사 기반): `EmbedWorkRunner`가 **기능의 실제 등록 모달을 러너 안에서 열고 성공 시 RUN(needs_review) 자동 기록**(취소=무기록, 신규 호스트는 렌더 시점 lazy).

**자동 기록 임베드** = 일정 추가·공지 작성·봉사/가정통신문 발급(`onCreated` 신설)·수업 교체(내 수업 픽커→`TimetableChangeDialog`)·생기부·성적(evalog `AdminDialog`+`onDataUploaded` 신설)·NEIS(`importNeisSchedule`)·학사 xlsx 5종(교육과정/강좌개설/수강등록/학생·교사 시간표, `onImported` 신설)·**모의고사 마킹(`MockMarkingHost` — 시작/완료/실패 전 주기+체크·산출물, 구 전용 러너 제거)**·모의고사 성적/학년분석(`onUploaded` 신설)·계정 엑셀/수업 CSV/시간표 CSV(기존 콜백)·연수 이수증(`onRegistered` 신설)·문서 업로드·이벤트 생성.

**관리형 8종**(사용자·교사·리소스·계정·분반·학생·부서·태그 관리) = 공용 `ManagedHost`(화면 임베드+수동 완료 기록).

**바로가기형** = 시험 감독표·시간표 자동생성(마법사). 구 `link.timetable_data`는 `hidden`(호환용). 콜백 프롭 추가 원칙: 기능 로직 복제 금지, 성공 지점에 optional 콜백 1줄.

**연결 카탈로그** = `TASK_WORK_CATEGORY_META` 3그룹(SPACEKIJUN 기능 연결(**admin 전용** — 그룹 미노출+항목 adminOnly)/행정 업무 연결/문서 작성)의 "실질 작업 연결" 모달 — **서랍식**(메인 카테고리 접기/펼치기+건수) + **서브 카테고리**(definition.subcategory, feature 단위·미지정은 직속).

**WORK 연결 판정 = bind 행 존재(2026-07-26 재완화, 사용자 결정)**: 연결 모달 [연결] 클릭 즉시 연결(러너 자동 오픈 없음·모달 유지로 다건 연결/해제), 연결 항목엔 [열기]/[해제] — 해제=`deleteTaskWork`(이력 있으면 confirm 후 이력·파일 포함 삭제, 없으면 즉시). 실행 이력(`useTaskWorkRunPresence`)은 카드 '최근 실행' 표시·해제 confirm 분기용. 연결된 WORK는 패널 카드에서 **삭제 가능**(`deleteTaskWork` — RUN RPC 삭제로 파일 정리 후 행 삭제). 태스크 노드 헤더에 **WORK 연결 아이콘**(연결=파란 렌치/미연결=점선 렌치, `listConnectedTaskIds` 라이브 판정).

**노드 정보는 라이브**(2026-07-26): 캔버스 동기화 effect가 이벤트/업무 노드의 상태·진행률·기한을 실제 event/task 데이터로 상시 갱신(스냅샷 아님), 인스펙터에서 **연결 대상(이벤트→업무) 변경 가능**.

**실행 이력 삭제(2026-07-26, 2026-08-14 완화)**: 소유자는 RUN을 삭제 가능(`delete_task_work_run` RPC + RLS, 하위 감사 행 cascade·파일 정리) — append-only 감사의 의도적 완화.

**상태 가드 없음** — `running`에 갇히는 주 경로가 클라이언트 중단이라 종전 가드는 지울 수 없는 유령 행만 남겼다(가드가 RPC·RLS 양쪽에 있어 한쪽만 풀면 무효).

**검수 UI(보완 요청·결과 승인)는 제거**됐고 `review_task_work_run` RPC·`task_work_review` 테이블은 보존. 이력 ARTIFACT는 rhwp 미리보기(`HwpxPreviewDialog` 공용) 지원. 실행 전이는 `start_task_work_run`/`finalize_task_work_run`/`review_task_work_run` RPC(SECURITY INVOKER + 트랜잭션-로컬 감사 마커 GUC — Data API 직접 쓰기는 트리거가 거부). UI 진입 = `WorkflowInspector`의 Task 노드 → `TaskWorkPanel`(연결·실행·RUN 이력·검수). 모든 RUN은 `needs_review`로 종료되어 사람이 승인/보완 요청.

**캔버스 밖 진입점(2026-08-14)**: 홈 대시보드 '나의 업무' 행과 업무 상세 모달(`TaskDetailDialog` 푸터)에도 WORK 버튼이 있다 — 공용 부품 = `TaskWorkButton`(표시·개폐만) + `useTaskWorkEntries(taskIds)`(연결 여부 + workflowId를 **목록 단위 배치** 조회, 행마다 걸면 N+1).

**연결 판정의 정본은 `task_work` bind 행이지 워크플로 노드가 아니므로** 노드가 없는 WORK도 버튼이 뜨고 `workflowId`만 null이 된다(`TaskWorkDialog`/`TaskWorkPanel` prop은 `string | null` — 서버가 이미 허용: `start_task_work_run`은 null이면 워크플로 소유 검사를 건너뛰고 RUN insert/update 정책도 `workflow_id IS NULL`을 통과). workflowId가 없으면 소유 판정 근거가 없어 **읽기 전용**으로 연다(공유 실행 종류 `document.spec_fill`은 readOnly에서도 실행 버튼이 나온다). 대시보드 행은 **렌치를 업무 이름 옆에 두므로**(2026-08-14 사용자 결정) `<button>` 중첩을 피하려 **stretched-button 패턴**을 쓴다 — 행 전체를 덮는 투명 `<button absolute inset-0>`가 상세 모달을 열고, 그 위 내용은 `pointer-events-none`이라 클릭이 오버레이로 통과하며 렌치만 `pointer-events-auto`로 자기 동작을 되찾는다(z-index 불필요 — 위치 지정된 형제는 DOM 순서대로 그려져 오버레이가 맨 아래).

**HWPX 문서 템플릿**: `task_work_document_template` — `{{field_key}}` 치환 필드, SHA-256, **선형 버전 계보**(`family_id`/`previous_version_id`, 버전 내용 불변·가족당 현재 버전 1개, 새 버전=`create_task_work_document_template_version` RPC 원자적 전환), 비공개 Storage 버킷 `task-work-documents`(`{userId}/templates/...`·`{userId}/runs/...`, 등록 원본 삭제 금지).

**채움 시 줄 캐시 제거 필수**(2026-07-27): 텍스트를 바꾼 문단의 `<hp:linesegarray>`(한글이 저장한 줄 나눔·폭 캐시)를 `editsClearLineSeg`로 제거해야 렌더가 재계산된다(안 하면 옛 폭에 새 텍스트를 밀어넣어 글자가 퍼지거나 페이지 초과 — 실측 986px vs 718px).

**제거 범위는 실제 기록 지점으로 한정**(셀=첫 런 보유 문단, prose 블록=anchor~endAnchor 구간): 넓게 지우면 수백 문단이 비표준이 되어 rhwp Studio 사전 검증이 타임아웃한다(실측 511문단→60초 초과, 구간 한정 후 54개·경고 543→172).

**남은 경고는 내보내기 직전 `normalizeHwpxLayout`(`src/lib/rhwp/coreEngine.ts`)이 제거**(2026-07-27): core `reflowLinesegs()`(=Studio [자동 보정]과 같은 경로)로 캐시를 재계산한 뒤 `exportHwpx()` — 실측 경고 44→**0건**, 원본 템플릿도 0건이라 경고는 전량 우리 편집이 원인이고 전량 제거된다. 적용 지점 = `exportHwpxSections`(생성·미리보기 공통 병목). 재직렬화는 IR 전체 재작성이지만 텍스트·표·컨트롤·필드·header.xml·mimetype STORE 선두가 모두 보존되고 결정적이다(회귀 `check-lineseg-normalize.mts` 11건). 고칠 것이 없으면 원본 바이트를 그대로 통과시키고, 실패는 fail-open. 편집기 `requestTimeoutMs`=180초.

**반복 행의 서술 열**은 plan 한 번에 만들면 키워드 나열이 되므로 **열별 배치 생성**(`collectRowProseColumns`+`generateRowProseColumn`, 원본 표 같은 열을 양식 예시로 줘 분량 자동 정합 — 실측 50자 나열→110자 문장).

**서술은 전부 계획 단계에서 확정(2026-07-27 사용자 결정)**: 예전엔 최상위 prose 타깃만 채움 단계가 매번 LLM을 불러 ①계획 검토에서 본 적 없는 문장이 문서에 들어가고 ②재실행마다 결과가 달라졌다. 이제 `generateSpecFillPlan`이 `fillRowProseColumns` 뒤에 `fillProseTargets`(구역 양식 예시·형제 값 참조, 빈 것만 생성)를 돌려 **본문을 plan에 싣고**, `runSpecFillPipeline`이 `proseValuesFromPlan`으로 그 값을 `presetValues`로 승격해 채움이 LLM을 부르지 않는다(재실행 시 바이트 동일). 계획 필드 의미도 '서술 방향 지침'→**'서술 본문(비우면 AI가 작성)'**으로 바뀌고 `PlanFieldSchema.prose` 플래그가 붙어 폼은 textarea, 본 계획 프롬프트는 그 키를 빈 문자열로 두라고 지시한다(전용 배치가 씀). 계획에 본문이 없으면 종전 생성 경로로 후퇴. 회귀 `check-prose-in-plan.mts`. 치환 엔진=`document/hwpxTemplateEngine.ts`(`inspectHwpxTemplate`/`prepareHwpxTemplate`(기존 문구→필드 토큰화)/`fillHwpxTemplate` — 순수 문자열 치환, AI 아님).

**공용 rhwp 편집기**(feature 비종속): `public/rhwp-studio`(edwardkim/rhwp **v0.7.19 vendored** WASM Studio, same-origin iframe+MessageChannel — `src/lib/rhwp/config.ts`가 same-origin 강제, env `VITE_RHWP_STUDIO_URL` 선택), `@rhwp/editor@0.7.19` SDK, `src/components/rhwp/`(`RhwpVisualEditor` ref API + `RhwpAiAssistant`).

**AI 문서 작성**: `src/lib/rhwp/aiDocumentWriter.ts` — LLM은 **Supabase edge fn `openai-proxy`** 경유(클라이언트 API 키 없음), 전체 문맥 분석(45k자 초과 시 청크)→커서/선택 위치 초안·ClickHere 필드 일괄 초안→검토 후 적용(stale 검사·1 undo 단위), 문서 본문은 untrusted로 취급.

**AI 작업 영역**=`SPACEKIJUN_AI_WORK_V1` 메타 ClickHere 필드(Studio `AI✦`/`Ctrl+Alt+A`, 이름·안내문·작성 지시 저장, 중첩 표 셀 지원).

**독립 편집기** `/toolbox/hwpx-editor`(teacher/admin, Toolbox 카드 "HWPX 시각 편집기" — 로컬 HWP/HWPX 열기·AI 패널·HWP/HWPX/HML 내보내기, AI 실행 시에만 텍스트 전송).

**WorkflowLinkButton**: 이벤트/업무 카드→소속 워크플로우 딥링크(`/tasks/workflow?workflow=<id>` — 2026-10-05 전엔 `/tasks?tab=workflow&workflow=`, `listTaskWorkflowEntityLinks`).

**RLS(2026-07-26 공유 개편)**: 워크플로·노드·엣지·WORK 계열은 **모든 교사/admin 읽기**, 쓰기는 워크플로=생성자∨admin(`save_task_workflow_graph` 가드에 is_admin 포함)·WORK 계열=소유자 전용 유지(타인 워크플로에서 실행·연결 불가).

**삭제=생성자∨admin**이며, RUN 이력이 있어도 지워진다(2026-07-27 수정): `task_work_run.workflow_id`가 ON DELETE SET NULL이라 삭제 시 Postgres가 감사 행을 UPDATE하는데 감사 쓰기 가드가 이를 42501로 거부해 **이력이 한 건이라도 있는 워크플로는 삭제 자체가 불가능**했다. `guard_task_work_audit_write`가 그 FK 경로만 예외 허용(workflow_id 값→NULL ∧ 나머지 컬럼 불변 ∧ 참조 워크플로가 실제로 소멸 — 세 조건 동시 성립은 삭제 연쇄뿐). 살아 있는 워크플로 링크를 끊는 직접 UPDATE는 계속 거부(실측). 삭제 시 노드·엣지는 연쇄 삭제, **RUN 이력은 보존되고 링크만 해제**. `deleteTaskWorkflow`는 `.select('id')` 반환 행으로 실제 삭제를 확인한다(RLS 차단은 오류가 아니라 0행).

**노드 기본 스펙 + 공유 실행(2026-07-27 사용자 결정)**: 워크플로 생성자가 양식 목록의 핀 버튼으로 `task_work.config.defaultTemplate`(`{id,name}`)을 지정하면, 그 노드를 여는 사람은 **양식 선택을 건너뛰고 스펙 검수로 바로** 들어간다(러너가 templates에서 찾아 자동 `openTemplate`; 보관·삭제된 양식이면 선택 화면 유지, 비생성자는 '← 양식 선택' 대신 기본 양식명 표기). 지정은 `setTaskWorkDefaultTemplate`(RLS `task_work_update_own` = WORK 생성자, 0행이면 오류).

**실행 개방 범위 = `document.spec_fill` 1종만**(연결형·관리형은 다른 기능에 쓰기를 유발하므로 소유자 전용 유지). 서버가 정본이고 관문이 **네 곳**이라 전부 같은 조건으로 열어야 한다: `start_task_work_run`(WORK 소유·워크플로 소유 검사)·`task_work_run` INSERT·UPDATE with_check(RPC가 SECURITY INVOKER라 RLS도 통과해야 함 — finalize가 UPDATE)·`task_work_document` INSERT(참조 템플릿이 '내 것'→'내가 읽을 수 있는 것'). RUN/CHECK/ARTIFACT/EVENT/REVIEW의 나머지 정책은 전부 'RUN 생성자=나' 기준이라 무수정(실행자가 RUN을 만들므로 산출물도 실행자 소유). 클라이언트 `SHARED_RUNNABLE_TYPES`(TaskWorkPanel)는 서버 목록의 거울일 뿐이며, readOnly 카드에 '이 양식으로 내 문서 만들기' 버튼을 낸다.

**공유 실행의 '내 것' 경계(2026-08-14 사용자 결정)**: 실행·검수 이력은 `listTaskWorkRuns`가 `created_by = 나`로 거른다 — **다만 이건 화면 규칙이고 `task_work_run` SELECT 정책은 아직 전 교사 읽기라 API로는 노출된다**(하위 check·artifact·run_event·review 동일, RLS를 좁히면 비소유자 이력 열람·WORK 삭제 시 남의 RUN 정리가 함께 영향 — 미결). 완성 문서는 원래 RLS가 소유자 전용이고 클라이언트 조건은 이중 방어.

**지정 양식이 있으면 비생성자는 양식을 못 고른다**(목록에 지정 양식 한 건만 '사용 중', 등록·열기·핀·삭제 숨김; 지정 양식이 보관·삭제됐으면 잠그지 않음 — 잠그면 실행 불가).

**자동 열기는 단계를 옮기지 않는다**(`openTemplate(row,{advance:false})`) — 양식 단계에 **내가 저장한 완성 문서**가 있어 건너뛰면 이어서 작업할 문서를 못 찾는다; 대신 양식 단계 하단 '스펙 검수로 →' 버튼으로 진행.

**주의: DB `work_type`은 `document.spec_fill`이고 `@1`은 UI 표기**(버전은 `handler_version` 별도 컬럼) — 정책에 `@1`을 쓰면 조용히 무효가 된다(실측). 비소유 UI=캔버스 `readOnly`(저장·추가·드래그·인스펙터 편집 차단, WORK는 '실행·검수 이력 보기' 열람만).

**워크플로 복사**=캔버스 [복사] 버튼 → 작업대에서 제외 노드 클릭 선택(기본 전체 포함, 이벤트 제외 시 하위 연쇄) → `copy_task_workflow` RPC(SECURITY INVOKER 단일 트랜잭션: event/task 새 행 복제 — 매니저=복사자·담당자 상태 리셋·회차 기록/파일 제거, 노드/엣지 전부 새 UUID remap, WORK 연결·이력 미복제).

**Work Spec 엔진(2026-07-24)**: 문서 유형 독립 자동 채움 — 양식별 코드 대신 **스펙 JSON**(타깃 9종 scalar/choice/prose/rowGroup/**tableGroup**/computed/keep/**personTeacher·personStudent** × locator 6종(+`table`) 구조주소+지문 이중화)과 공통 엔진(`document/spec/`, DOM 비의존 — README에 일반화 원칙: **엔진에 특정 양식 지식 금지**). 파이프라인 detect(구조 탐지 10종 제안)→confirm(사람 확정)→plan(스펙에서 스키마 자동 유도, LLM+사람 검토 왕복)→fill(결정적 kind는 코드, prose만 LLM)→verify(제약·keep 불변성 — **잔여물 검사는 2026-09-03 폐지**, 아래 참고). 어댑터=`services/specFillService.ts`(`runSpecFillPipeline`·`generateSpecFillPlan`).

**UI(2026-07-26 Overhaul)**: `document.spec_fill@1` 레지스트리 등록 + `SpecFillWorkRunner` 4단계(양식→**스펙 검수**(좌 오버레이 문서+우 칩·AI 라벨 보완·타깃 목록, confirmRequired 전건 확인 전 저장 차단; **영역 재지정**=타깃 행 Crosshair 버튼→문서에서 새 위치 지정(라벨·지침 유지, `reassignTargetLocator` — SpecStudio 공유); **페이지 경계 드래그** 지원=`cellsInRectAcrossPages`/`textRangeAnchorAcrossPages`로 분할 표·문단 이어 지정(판정=`resolveCrossPageDrag` — 시작·끝점이 같은 표 셀일 때만 셀 우선); **선택 모드 툴바**(오버레이 내장)=일반(자동)/셀(다행도 셀별 scalar)/반복 행(단일 행도 rowGroup)/텍스트(I-beam 커서+줄 단위 선형 하이라이트 `linearSelectionRects`, 표 무시))→**계획 검토**(진입 시 스키마 유도 빈칸 폼 자동 표시·'입력 초기화'·AI 계획 생성은 폼 하단 보조(**재생성=빈 칸만**: 사용자 입력값은 유지되고 LLM에 맥락으로 전달, `generateSpecFillPlan` existingPlan+**행·칸 단위 병합** `mergePlanWithUserValues`.

**반복 행 생성 4중 가드**(LLM 실패 모드 대응): ⓪**행 형식 회수** — LLM이 행을 2차원 배열이나 다른 키로 반환해도 `normalizePlan`이 스키마 `itemFields` 순서로 키를 부여해 회수(미회수 시 `validatePlan`이 오류, `planSchemaPrompt`가 행 객체 형식 예시 제시 — 실측 주원인) ①`validatePlan`이 required 배열의 **빈 배열을 오류**로 게이트 ②사용자 입력의 빈 칸을 `"<채울 것>"` **센티널**로 치환해 전달("복사할 값"과 "채울 칸" 구분, 응답 잔존은 `stripSentinels`로 정리) ③`validateRegeneratedArrays`가 행 수 축소·빈 칸 잔존을 칸 단위로 지목해 재시도, 최종 실패 시에도 **마지막 부분 생성을 반환**(빈 plan 아님).

**양식 예시(2026-07-27 재정비)**: 각 타깃 구역의 기존 내용을 `collectRegionExamples`로 수집해 plan 프롬프트에 표기 형식 참고로 전달.

**반복 행은 표 전체를 통짜 절단하지 않는다** — 8열×20행 표를 500자로 뭉개면 첫 1~2행만 남아 열별 표기 형식이 사라지므로 열마다 기존 셀 3개를 뽑아 `c0(시기): "8월 4주" | …` 구조로 재구성(실측 500자 뭉치→573자 구조, 전 열 형식 노출). 상한은 유형별(scalar 500·prose 1500·rowGroup 1800·셀 200).

**서술은 수집하되 본 계획 프롬프트에서 제외**(`planPromptExamples`) — 그 키는 '빈 문자열로 둘 것'이라 지시하는데 예시가 보이면 LLM이 원문을 복사하고, 그러면 `fillProseTargets`가 '사람이 확정한 본문'으로 보고 건너뛰어 양식 원문이 그대로 남는다. 서술 예시는 전용 생성 단계에만 전달(구역 원문+분량 자수·문단)), 배열=행 테이블·JSON 토글, **행 추가는 개수 지정**(입력칸+버튼, Enter 실행. 버튼 라벨이 실제 추가 개수를 표기. 스펙의 `rowGroup.minRows/maxRows`·`tableGroup.minItems/maxItems`가 `PlanFieldSchema.minItems/maxItems`로 올라와 상한을 넘기지 못하게 막는다 — **엔진은 초과분을 `slice`로 조용히 잘라내므로** 폼이 먼저 막아야 한다. 클램프=순수 함수 `rowAddCapacity`), 값이 좌측 문서에 **800ms 라이브 반영**=무LLM fillDocument)→**최종 수정·결과**(좌측이 rhwp 편집기로 전환: 값·서식 수정 후 '최종 수정본 다운로드' 단일 버튼—원본 불변, 검증 CHECK·완성본 저장(값)·**실행·검수 이력 통합** — 이력 RUN 카드 '이 작업 내용 불러와서 진행'=입력 스냅샷의 양식·계획 복원 후 계획 검토 재진입, `WorkRunHistory` 별도 파일로 서랍·러너 공유)). 양식 로드 후 전 단계 좌=문서/우=기능 통일 레이아웃+리사이즈 스플리터(localStorage), StepHeader 칩=클릭 이동, 실행·검수 이력=서랍식(evalog rightPanel 패턴: 경계 반원 토글·width 0 접힘, 양식·최종 단계만 기본 펼침), 우측 편집 컬럼은 `SpecEditColumn`으로 추출해 SpecStudio(hwpx-editor 양식 만들기)와 부품 공유.

**계획 생성은 분할 호출(2026-08-14)**: 한 번에 전 타깃을 만들면 큰 양식이 엣지 함수 게이트웨이(≈150초)를 넘어 **504**로 죽는다(form2 실측 278초). 병목이 **추론 토큰(low에서도 출력의 79~85%)과 본문 길이 둘 다**라 양쪽을 손봐야 한다 — `PLAN_REASONING_EFFORT='none'`(specFillService, `solar-proxy`에 전달·서버 수정 불필요) + `generatePlanChunked`(`document/spec/llm.ts`, 칸 예산 65칸 단위 분할·배열은 열 단위 분할 후 **행 인덱스 병합**·배열 먼저 처리해 파생 스칼라가 행을 참조).

**행 수 추정 규칙 = 씨앗 > `maxItems` > 보수적 기본값이고 `minItems`는 바닥으로만**(하한을 추정치로 쓰면 칸 30개 배열을 1행으로 오판해 분할을 건너뛴다), 첫 조각 결과에서 실제 행 수를 읽어 나머지를 다시 나눈다. 병합은 **빈 값이 기존 값을 지우는 경우만** 차단(넓게 막으면 뒤 조각에만 있는 열이 통째로 유실된다).

**생성 속도가 호출마다 17~62토큰/초로 흔들리고 호출당 고정비가 약 20초**라 예산은 최악값 기준으로 잡되 더 잘게 쪼개지 말 것. 실측 form2 6회·최대 66.7초·총 221초, form1은 1회 유지. 회귀 `check-plan-chunking.mts`(`LIVE=1`이 실호출로 벽시간 검사 — 칸 유실은 LIVE에서만 재현된다). spec 저장=`services/specTemplateService.ts`.

**스펙 번들 내보내기(2026-07-27)**: 스펙 검수 단계 [스펙 내보내기] → `buildSpecBundle`(`document/spec/bundle.ts`)이 스펙+**타깃별 현재 문서 원문**+planSchema+빈 계획 골격+사용법을 JSON 한 파일로 묶어 외부 AI 에이전트(Claude Code 등)에 넘긴다.

**locator는 엔진 상대 주소라 스펙만으론 외부에서 쓸모가 없다** — currentText가 그 간극을 메운다.

**내보내기 형식 = zip**(`spec-bundle.json` + **`template.hwpx` 원본 양식** + `plan.skeleton.json` + `README.md`) — 원본이 없으면 아래 2단계 지시가 수행 불가능하다.

**readme가 지시하는 작업은 2단계**(2026-07-27 사용자 요청): ①계획(plan) JSON 작성 ②**그 계획으로 한글 문서까지 생성** — `npx tsx scripts/task-work-spec-apply/apply-plan.mts --bundle … --plan … [--template …] [--out …]`. 이 CLI는 앱과 **같은 채움 엔진**(`fillDocument`+`verifyDocument`+core `reflowLinesegs` 보정)을 쓰고 채우지 못한 타깃·검증 경고를 출력한다. readme는 XML 직접 편집을 금지한다(locator는 엔진 상대 주소·줄 캐시 때문에 렌더가 깨짐 — 문서를 바꾸는 길은 이 명령뿐). 행 객체 형식·2차원 배열 금지·choice 값 일치도 명시. 앱에서 이어서 하려면 계획 검토의 'JSON 직접 편집'에 붙여넣으면 같은 결과(+실행 이력·완성본 저장). 번들 JSON 실측 7.5~13.8KB(~2~4천 토큰). 회귀 `check-spec-bundle.mts`·`check-apply-cli.mts`(번들→계획→.hwpx 종단, 줄 캐시 경고 0·mimetype STORE 확인).

**양식 스펙 공유(2026-07-27 사용자 결정)**: `task_work_document_template` 읽기=**전 교사/admin**(구 select_own → `task_work_document_template_select_teachers`) · 쓰기=**생성자 ∨ admin**(경로 불변식은 `auth.uid()`가 아니라 행 소유자 `created_by` 기준이라야 admin이 남의 양식을 고칠 수 있다). 템플릿 **파일**은 이미 `task_work_documents_select_teachers`로 전 교사에게 열려 있었는데 행만 소유자 전용이라 어긋나 있던 것을 정렬. 즉 **스펙 검수 저장은 만든 사람만** — 생성자·admin이 아닌 사용자는 남의 양식을 열어 스펙을 고쳐 **그 실행에만** 쓸 수 있고 DB에는 반영되지 않는다(러너 버튼이 '스펙 저장 → 계획' 대신 '계획 검토로 →'로 바뀌고 안내 문구 표시, 양식 목록엔 '공유' 배지·보관 버튼 숨김).

**주의**: RLS가 막은 UPDATE는 **오류가 아니라 0행**이라 그냥 두면 '저장됨'으로 보인다 — `updateTemplateSpec`·`archiveSpecTemplate`은 `.select('id')` 반환 행으로 실제 반영을 확인하고 아니면 던진다. 검증(라이브 RLS 실사용자 컨텍스트): 비소유 교사 읽기 4행·UPDATE **0행**, 소유자 UPDATE 3행, admin이 남의 양식 UPDATE **1행**. 회귀: `npx tsx scripts/task-work-spec-test/run-form1|form2|detect.mts`(detect는 미학습 문서 일반화 가드 포함).

**라이브 활성화 완료(2026-07-25)**: spec 컬럼 마이그레이션 `20260725003603` 적용(선행 task_work 26건도 적용 확인), 실브라우저 E2E 완주(실 LLM plan·prose 포함, RUN accepted까지 — 상세는 설계 문서 §9).

**값-기반 완성 문서(R3, 2026-07-25 · 2026-08-14 노드 스코프)**: 완성본은 파일이 아니라 값만 저장해 재구성 — 엔진 `presetValues`(키 있는 prose는 LLM 무호출) + `task_work_document` 테이블(마이그레이션 `20260725120000`: 템플릿 버전 행 고정 참조+plan/knowledge/field_values/row_values, 선형 계보+`create_task_work_document_version` RPC, draft 수정 허용·final/보관 불변, RLS 소유자+FORCE) + `specDocumentService.ts` + 러너 불러오기/prose 값 재사용 토글/새 버전 저장.

**목록은 `created_by = 나 AND work_id = 이 노드`**(2026-08-14) — 종전엔 양식 버전에만 연결돼 전역 목록이라 다른 노드 문서가 섞였다. `work_id`는 `on delete set null`(노드를 지워도 값은 보존, 목록에서만 사라짐)이고 **새 버전 RPC가 승계**해야 한다(빠뜨리면 v2부터 목록에서 사라진다). 쿼리 키에도 workId를 넣을 것(노드 이동 시 캐시 잔상). 재구성 바이트 동일성 회귀 `run-doc-values.mts` + **라이브 E2E 완주(2026-07-26)**: 저장→불러오기→재구성 2초(LLM 무호출)→v2, DB 대조 값 동일. 스펙 파이프라인 기본 LLM은 **Solar(solar-proxy)**(`defaultSpecChat`), 생성 타입 전체 재생성으로 specTemplateService any 캐스트 제거됨.

**R4 핵심(2026-07-26)**: 러너 confirm에 "시각 검수" 전체화면 다이얼로그(`SpecVisualReview`=오버레이+패널+원터치 지정, 목록형 폴백; 지정 로직 `specDesignate.ts` 공유) + `SpecTargetPanel` 타깃 고급(JSON) 편집(수식·rowSchema 탈출구). E2E가 잡은 detect/엔진 결함 3건 수정(자리표시 수식 크래시→값-확정 타깃별 격리, 중첩 표 컨테이너 셀 제안 억제, 누름틀 내부 텍스트 이중 제안(clickTexts) 억제).

**표 묶음 kind `tableGroup`(2026-07-27)**: `rowGroup`이 표 **안의 행**만 복제해서 "수행평가 종류마다 같은 서식의 표 1개"를 만들 수 없던 공백을 메운다. HWPX에서 **표는 평범한 문단의 `<hp:run>` 안에** 있으므로 **표를 감싼 문단째** 복제한다 — 행 수가 고정이라 행 복제·`rowCnt` 재계산이 불필요하고, 병합 셀도 `hp:cellAddr` 주소를 하나 차지할 뿐이라 `(row,col)` 지정이 그대로 통한다. 감싼 문단 경계는 인덱서가 아니라 **원문에서 직접**(`lastIndexOf('<hp:p ', table.start)` / `indexOf('</hp:p>', table.end)`) 잡는다. 소제목이 셀이 아니라 **표 앞 런**이라 절대 위치로 N번째 복제본을 못 가리키므로 `caption:{anchor,source}`를 타깃 필드로 둔다.

**범위 밖 = 항목마다 행 수가 달라지는 표**(병합을 쪼개야 함 → 표 안 rowGroup 중첩 필요). 회귀 `run-tablegroup.mts`.

**이름 타깃 2종 `personTeacher`·`personStudent`(2026-08-22)**: 계획 검토에서 **`SearchableMultiSelect`로 학교 명단에서 고른다**(교사=교직원+셀 붙여넣기, 학생=명단+`enableClassSearch`).

**kind가 곧 검색 대상**이라 유형만 바꾸면 명단이 바뀐다(별도 필드 없음).

**plan 저장은 배열이 아니라 이어 붙인 문자열**이다 — 배열이면 ①`fillProseTargets`의 형제 값이 배열·객체를 건너뛰어 **AI 서술이 이름을 못 본다**(이 기능의 목적이 깨진다) ②계획 분할 생성이 배열마다 호출을 따로 잡는다 ③계획 폼이 반복 행 표로 렌더한다. 문자열이면 전부 스칼라 경로라 이 셋이 사라진다. 저장은 정규 `", "`, 문서 표시는 스펙 `separator`·`template`이 정한다(엔진이 split→join).

**LLM은 이름을 절대 채우지 않는다** — 실재하지 않는 교사·학생 이름이 학교 문서에 박히는 것이 최악의 실패라 ①`planSchemaPrompt`가 "빈 문자열로 둘 것 + 지어내지 말 것" ②`collectRegionExamples`가 이름 구역 예시를 **아예 수집하지 않는다**(양식의 "홍길동" 복사 차단 — **예시 키가 타깃 id가 아니라 plan 키**라서 소비 측에서 id로 거르면 빗나가므로 근원에서 막았다) ③스펙 번들 README도 같은 규칙을 지시.

**`derivePlanSchema`에서 이름 필드는 항상 `optional`**(누적 `f.person` 기준이라 add 순서 무관) — 서술 `sources`처럼 읽기만 하는 사용처가 필수로 끌어올리면 안 고른 상태에서 AI 계획 생성이 매번 검증에 걸린다(문서 필수 여부는 `target.required`+verify 담당). 명단에 없는 이름은 값 그대로 흘려 선택기가 앰버 배지로 노출.

**UI 배치 = 계획 검토 맨 위 전용 블록**(폼 속에 섞으면 65칸짜리 양식에서 묻혀 'AI 계획 생성'을 먼저 누르게 된다) + 생성 버튼 옆 "선택한 사람이 함께 전달됩니다" 요약.

**분할 생성에서는 이름을 모든 청크에 실어야 한다** — `subsetPlan`이 청크가 가진 키만 넘기므로 그대로 두면 이름을 안 다루는 청크가 이름을 못 본다(작은 양식은 단일 호출이라 멀쩡하고 **큰 양식에서만 조용히 깨진다**). 반대로 이름 필드는 청크 **작업 목록에서 제외**(채울 것이 없는데 칸 예산·호출을 먹는다). 회귀 `check-person-target.mts`(25건, 청킹 4건 포함).

**인덱서 치명 결함 2건 수정(같은 날)**: `TAG_RE`가 접두 일치를 해 `<hp:pos/>`·`<hp:parameters>`가 `hp:p`로 읽혔고 + `hp:p` 분기가 `self`를 무시해, 둘이 겹치면 **문단 스택이 영구히 어긋나** 표를 감싼 문단이 `topParagraphs`에서 빠지고 그 텍스트가 `fullText`에 안 들어왔다 → verify 잔여물 검사가 **거짓 음성**(남아 있는 예시 문구를 0건 통과). 수정 = 태그명 경계 `(?![\w.:-])` + 자기완결 `<hp:p/>` 즉시 완결.

**잔여물 검사 폐지 (2026-09-03)**: `verifyDocument`가 `spec.residualPatterns`·`no-residual` 제약을 **읽지 않고** `detectSpecDraft`가 **채우지도 않는다**(타입 필드는 저장된 스펙 파싱 호환용으로만 남김). 폐지 이유는 오검출이다 — 패턴이 사람이 적은 것이 아니라 자동 시드된 추측인데 지울 화면조차 없었고(입력칸은 2026-09-02 제거), 라이브 양식에서 `시스코`·`08:00~22:00` 같은 **그 문서의 정상 내용**을 잡고 있었다. 원본 텍스트를 내용으로 쓰지 않기로 한 뒤로는 그 구역이 원문 그대로 남으므로 맞는 문서가 fail 로 보고됐다. 아래 form2의 `[별첨 1]` 사례가 같은 병의 초기 증상이었다(그때는 한 양식만 손봤다). 회귀 = `scripts/task-work-spec-test/check-no-residual.mts`. 종전 구현 메모(원문 `<hp:t>` 기준 = `rawSectionText`)는 위 인덱서 결함 항목의 배경으로만 남는다. 셀 값의 `\n`은 `editsSetRunText`가 `<hp:lineBreak/>`로 기록하고, 복제 원본의 여분 문단은 `editsSetCellSingleValue`가 채움 시 제거(rowGroup·tableGroup 공통 — 빈 줄 방지).

**prose·인라인 경로도 동일 규칙(2026-08-16 수정)**: `escapeInline`이 `\n`→`<hp:lineBreak/>` 변환을 포함하고, prose 넘침 병합 3곳(셀 `writeParagraphsToCell`·블록 첫 문단·단일 앵커)은 `join('\n')`을 쓴다 — 종전 `join(' ')`은 계획 검토에서 적은 답안의 줄바꿈을 공백으로 뭉갰다(CLI `run-fill-plan.mts`의 후처리만 이를 보정해 앱 경로에서만 증상). 회귀 `check-prose-linebreak.mts`. 지정(`specDesignate`) 보강: 단일 행 반복 지정은 데이터 구역을 표 끝(합계 행 제외)까지 확장, `rowTemplate`은 '열이 모두 있으면서 문단 최소' 행 자동 선택, 유형을 택일로 바꿀 때 `deriveChoiceOptions`가 구역 체크박스에서 선택지·**마크쌍(문서 관습 관찰)** 유도. 회귀 `check-indexer.mts`·`check-designate.mts`.

**form2(교수학습 및 평가운영 계획) 저장 스펙 = 타깃 8→66개**(마이그레이션 `20260727020000`, 파일 SHA로 대상 지목): 평가 개요표 41·동점자 처리 10·학기단위 성취수준 5·최소 성취수준 1·`tableGroup` 1 추가 + 표 locator 전부에 지문. `residualPatterns`의 `[별첨 1]`은 **목차·별첨 제목에 정상적으로 쓰이는 문자열**이라 제거(항상 실패하는 검사는 소음).

**기존 타깃 id(pick1000~1009) 유지** — 실행 이력의 `input_snapshot`이 그 키로 plan을 담아 "불러와서 진행"이 깨진다. 스펙 단일 출처 = `scripts/task-work-spec-test/fixtures/form2.spec.ts`, 종단 검증 = `run-form2-full.mts`. 잔여: 부서 공유(RLS 정책 결정 대기), form2급 knowledge 연계 실전, overlapping edits 타깃 귀속, **수행평가 개수에 따라 열·행이 달라지는 구역**(평가 개요표 수행 열·별첨1 성취기준 블록)은 아직 사람 편집. 별도 문서: 스키마=`docs/database/task-workflows.md`, 공용 편집기 API=`docs/rhwp-visual-editor.md`, 현황·남은 과제=`docs/task-workflow-hwpx-ai-current-status.md`, 마이그레이션 순서=`MIGRATION_EXECUTION_ORDER.md` | `components/WorkflowCanvas.tsx`·`TaskWorkPanel.tsx`·`HwpxTemplateWorkRunner.tsx`·`DocumentTemplateVisualEditor.tsx`·`WorkflowLinkButton.tsx`, `document/hwpxTemplateEngine.ts`, `services/taskWorkflowService.ts`·`taskWorkService.ts`·`documentTemplateService.ts`, `workRegistry.ts`, `src/components/rhwp/`·`src/lib/rhwp/`·`src/pages/HwpxEditor.tsx`, `task_workflow(+node/edge)`·`task_work*` 테이블


## 노드 이름 → 원본 이름 동기화 제안 (2026-09-23)

업무·할 일 노드의 **표시 이름은 원본과 따로 저장**된다(상태·진행률·기한만 실시간 동기화). 그래서 노드에서 이름을 고쳐도 업무 관리·내 할 일의 이름은 그대로다. 인스펙터에서 이름을 고치고 **편집을 마치면**(입력칸을 벗어남·Enter — 한글 조합 중 Enter 제외) "연결된 업무/할 일 이름도 바꿀까요?"를 묻는다. 자동으로 바꾸지 않는 이유 = ①캔버스용 약칭만 원할 때가 있고 ②원본 이름은 담당자 전원의 내 할 일·알림에 보이는 공용 값이다.

- **묻는 조건**(판정 단일 출처 `utils/nodeRename.ts`): 업무·할 일 노드 ∧ 원본 존재 ∧ 이번 편집에서 이름이 바뀜 ∧ 원본 이름과 다름 ∧ **그 업무의 매니저 ∨ admin**(할 일은 소속 업무의 매니저). ⚠️ `work`·`task` UPDATE RLS 는 로그인 사용자 전원에게 열려 있어 **서버가 막아 주지 않는다** — 캔버스에 남의 업무를 올려 둔 사람에게 제안하지 않는 것이 유일한 방어선이다.
- **한 편집에 한 번**: 이미 원본과 다른 약칭을 쓰던 노드를 클릭만 하고 나가면 묻지 않는다(매번 물으면 곧 읽지 않고 누른다). 대신 원본과 다르면 입력칸 아래에 `원본 이름: …` 과 [원본에도 적용]·[원본 이름으로 되돌리기]가 남아 "노드만"을 고른 뒤에도 되돌아갈 수 있다.
- **확인창은 캔버스(`WorkflowCanvas`)가 소유한다** — 편집을 마치는 가장 흔한 동작이 캔버스 빈 곳 클릭인데, blur 직후 선택이 풀려 인스펙터가 통째로 언마운트된다. 확인창이 인스펙터 안에 있으면 뜨자마자 사라진다.
- 쓰기 = `useRenameWorkflowSource`(`work.name` / `task.title`, `.select('id')` 로 0행을 오류로), 성공 시 `works-jsonb`·`my-tasks-jsonb`·`work`·`work-detail` 무효화. 노드 라벨 자체는 종전대로 캔버스 저장으로 남는다.
- 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/workflow-node-rename-test/run.mts`(24건).

## 연결된 작업 패널 — 관리 / 사용 두 보기 (2026-09-23)

같은 `TaskActionPanel` 이 업무 흐름 인스펙터·할 일 상세·홈 대시보드·업무 카드 렌치에서 열리는데, 종전엔 **업무 흐름 소유자인가(`readOnly`) 하나로만** 갈라 담당자에게도 관리자용 카드(연결 해제·"워크플로에서 실행")가 버튼만 빠진 채 보였다. 지금은 입장이 다른 두 보기다.

| | 관리 | 사용 |
|---|---|---|
| 누구 | 연결·해제 권한자(업무 흐름 소유자 ∨ admin — 종전 `!readOnly` 그대로) | 그 밖의 전원(담당자·열람자) |
| 행 | **한 줄 행** — 번호·제목 / 무엇을 가리키는지. 행을 누르면 설정, ↑↓·해제는 호버/포커스 때 | **한 줄 행** — 번호·제목 / 제목에 없는 것(매니저 안내, 없으면 나이스 메뉴 경로). 행 전체가 주 동작(끝에 `안내 ›`·`열기 ›`), solid 버튼은 할 일을 완료시키는 [제출]에만 |
| 상단 | [작업 연결] | "차례로 처리하고 내 할 일에서 완료를 체크" |

- **관리자이면서 담당자면 [관리 \| 사용] 토글**. 기본 보기는 진입점이 정한다 — 할 일 목록 경로(`TaskActionDialog`)는 `use`(하러 왔다), 업무 흐름 인스펙터는 `manage`(짜러 왔다). 담당자가 아닌 관리자에게는 사용 보기를 주지 않는다("내가 할 일"이 아니다).
- **사용 보기의 실행 버튼은 서버가 허용할 때만** 보인다 — RUN 쓰기는 연결 소유자 ∨ 공유 실행 유형(`document.spec_fill`)뿐이라, 그 밖에는 버튼을 비활성으로 두지 않고 이유("관리자가 처리하는 작업입니다")를 말한다. 버튼을 보여 놓고 42501 로 거절되면 담당자에게는 고장이다. NEIS 는 누구에게나 안내(`guideOnly`).
- 담당 여부 = `useIsTaskAssignee(taskId)`(`task.meta.assignees`). **모르는 동안은 false** — 관리자에게 관리 보기가 먼저 서고 토글이 나중에 붙는다(반대면 사용 보기가 잠깐 떴다 바뀐다).
- 판정 단일 출처 = `utils/actionPanelMode.ts`(보기·주 동작·요약 문구, `SHARED_RUNNABLE_TYPES` 도 여기로 옮겼다). 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/action-panel-mode-test/run.mts`(22건).
- ⚠️ 이름이 `link.*` 여도 `kind` 는 `embed` 인 유형이 많다(`link.notice_write` 등) — 문구·분기는 `action_type` 접두가 아니라 레지스트리의 `kind` 로 판단할 것.

## 할 일 마감 알림 (2026-09-24)

이 시스템은 «누가 무엇을 하는가»는 잘 표현했지만 **«언제까지인지 아무도 알려 주지 않았다»**. 담당자에게 마감 3일 전 예고(`task_deadline`)를, 매니저에게 미완료 인원 요약(`task_deadline_summary`)을 보낸다. 판정은 전부 **`notify_task_deadlines()` 안이 단일 출처**다.

- **⚠️ pg_cron 이 없다(실측). 그래서 «화면이 방아쇠»다** — 전자서명 문서 정리와 같은 방식으로, 교직원이 앱을 열면 `BrowserNotificationBridge` 가 세션당 한 번 RPC 를 부른다(`services/taskDeadlineNotice.ts`). 정해진 시각 발송이 아니므로 아무도 앱을 열지 않은 날은 그다음 접속 때 나간다(D-3~당일 창 안에서는 잡힌다).
- **중복 발송 방지에 표를 새로 만들지 않았다.** 알림 자체에 (사람·종류·`task_id`·`deadline`)을 적고 **부분 유니크 인덱스**(`notification_events_task_deadline_key`)가 거부한다 — 기록이 곧 알림이라 «보냈다는 기록»과 «알림»이 어긋날 자리가 없다. 클라이언트는 아무것도 기억하지 않는다.
- 목적지가 갈린다 — 담당자는 `/my-tasks?task=`(수행), 매니저는 `/tasks/mine?task=`(관리 — 2026-10-05 전엔 `/tasks?tab=myWorks&task=`). **매니저이면서 담당자인 사람에게는 개인 알림만** 보낸다.

### ⚠️ 만드는 동안 세 번 조용히 틀렸다 — 전부 «알림이 안 온다»로만 드러나는 부류

1. **`jsonb_typeof(meta->'deadlines') <> 'array'` 가 NULL 이라 단일 마감 할 일이 통째로 빠졌다.** 키가 없으면 `jsonb_typeof` 는 NULL 이고 `NULL <> 'array'` 는 false 가 아니라 **NULL** 이라 WHERE 를 통과하지 못한다. 가장 흔한 경우가 전부 사라졌는데 오류는 없었다 — `coalesce(..., '')` 가 필수다.
2. **`task.due_date` 는 `timestamptz` 다.** 다중 마감 회차(`date`)와 섞이면 `deadline - current_date` 가 정수가 아니라 interval 이 되어 D-n 계산이 깨진다 — `::date` 로 못 박는다.
3. **`notification_events.priority` 의 허용값은 `low|medium|high`** 다. `'normal'` 은 CHECK 위반이다.

이 셋을 잡은 것은 정적 검사가 아니라 **롤백 트랜잭션 안에서 가짜 할 일을 만들어 실제로 보내 본 것**이다 — 라이브에 D-0~D-3 마감이 0건이라 «0건 발송»이 정상처럼 보였다. 회귀 = `npx tsx scripts/task-deadline-notice-test/run.mts`(30건).

## 작업 「서명 받기」 — 두 유형 (2026-09-24)

학교 업무의 끝은 대개 «서명을 받는다»인데, 이 앱에는 **서로 다른 서명 시스템이 둘** 있다. 한 유형으로 합치면 설정이 «둘 중 무엇인가»를 먼저 묻는 갈림길로 시작하므로 **유형을 나눴다**(사용자 결정).

| | `signature.request` 전자서명 받기 | `signature.training` 연수 참석 서명 받기 |
|---|---|---|
| 대상 | 내가 올린 **문서**(한글·PDF·이미지) | 스케줄의 **연수 일정**과 그 참석자 명단 |
| 저장 | `signature_request` + `signature_signer` | `training_signature`(행 단위) |
| 서명 방식 | 문서 위 **좌표**를 찍어 순차/동시 | QR·일정에서 직접·출력 |
| 이 작업이 새로 갖는 것 | 없음(대상 두 칸으로 잇기만) | `config.training.meetingId` 한 칸 |

- **새 표도 마이그레이션도 없다.** 전자서명은 `subject_type='task_action'` + `subject_id=<작업 id>` 로 잇는다 — `signature_request.subject_type` 에 CHECK 가 없어(자유 문자열) 결재·task_action 과 같은 «대상을 두 칸으로 가리킨다» 원칙이 그대로 통한다.
- **서명 화면을 두 벌로 만들지 않는다.** 전자서명은 `SignatureRequestWizard`·`SignatureSignDialog` 를, 연수는 일정 상세의 QR·출력을 그대로 쓴다. 러너가 하는 일은 «이 작업에 매달고 현황을 보여 주는 것»뿐이다.
- **완료를 자동으로 찍지 않는다.** 서명 완료는 서버가 알지만 «이 작업이 끝났는가»는 한 요청으로 결정되지 않는다(한 할 일에 계획서·결과보고 두 요청을 매다는 것이 정상이라 둘 다 `multiple: true`). 그래서 `ManualCompletionRecord` 로 남긴다.
- **7일 자동 삭제를 화면이 말한다** — 전자서명 문서는 완료·요청 후 7일이면 지워지므로 목록에 `문서 삭제 D-n` 을 띄운다(2일 이하 로즈). 안 그러면 «왜 파일이 없지»가 된다.
- **연수 참석자가 0명이면 «완료»라고 하지 않는다** — 받을 사람이 없는 것뿐이다(`isTrainingSignatureComplete`). 0/0 을 초록으로 칠하면 거짓말이다.
- **연수 설정 저장은 병합이다**(`mergeTaskActionConfig`) — `bindTaskAction` 처럼 `config` 를 통째로 덮어쓰면 `origin`·`defaultTemplate` 이 조용히 사라진다. 쓰기 RLS 가 `created_by` 전용이라 **연결을 만든 사람만** 바꾼다(NEIS 화면과 같다).
- **연수 링크는 실제로 그 일정을 연다** — `/schedule?event=<id>` 딥링크를 새로 만들었다. ⚠️ 다른 달의 일정이면 캘린더가 아직 그 일정을 갖고 있지 않으므로 **시작일로 먼저 이동**하고, **못 찾은 동안은 파라미터를 지우지 않는다**(먼저 지우면 조용히 아무 일도 일어나지 않는다).
- **범주 순서는 `TASK_ACTION_CATEGORY_ORDER` 단일 출처**가 됐다 — 종전엔 연결 모달과 캔버스 선택기가 각자 배열을 들고 있어서, 새 범주를 한쪽에만 넣으면 다른 쪽에서 **조용히 사라졌다**.
- 회귀 = `npx tsx scripts/signature-action-test/run.mts`(47건) + `scripts/signature-action-test/fixture.mjs`(두 실행 화면 실제 렌더).

## 캔버스의 작업(ACTION) 노드 — 정식 노드 (2026-09-24)

연결된 작업이 종전엔 할 일 노드 헤더의 **렌치 아이콘 하나**로만 보였다. 그 아이콘은 「있다/없다」만 말하고 무엇이 몇 개인지는 말하지 못해, 캔버스만 보고는 그 할 일에 무슨 일이 붙어 있는지 알 수 없었다. 지금은 작업 하나하나가 **n8n 식 아이콘 노드**이고 점선으로 이어진다. 렌치 아이콘은 뺐다 — 같은 사실을 덜 정확하게 되풀이한다.

**처음엔 «유도 전용»(저장하지 않고 매번 계산)으로 만들었다가 같은 날 정식 노드로 바꿨다** — 사용자 결정: 자리를 옮기고 자유롭게 이을 수 있어야 한다. 유도로는 **불가능**했다: 선(`task_workflow_edge`)은 `task_workflow_node` 행을 FK 로 가리키므로 행이 없는 노드에는 선을 저장할 길이 아예 없다.

- **저장** = `task_workflow_node.node_kind='action'` + **`action_id`**(마이그레이션 `20260924150000`). 다른 노드와 똑같이 절대 좌표로 자리를 갖고, 끌고 지우고 이을 수 있다.
- **유령 노드는 클라이언트가 아니라 FK 가 막는다** — `action_id` 가 `on delete cascade` 라 **작업 연결을 해제하면 그 노드 행이 함께 사라진다**. 정리 코드를 다시 만들지 말 것. 한 흐름에 같은 작업을 두 번 올리지 않도록 `(workflow_id, action_id)` 부분 유니크 인덱스가 있다.
- **기존 흐름은 한 번 심었다** — 마이그레이션이 유도 시절의 배치(할 일 카드 아래 한 줄)를 그대로 옮겨 **노드 26개 + 선 26개**를 만들었다. 이 한 번이 없으면 기존 흐름 23개에서 작업이 통째로 사라진 것처럼 보인다.
- **자리 기준은 «할 일 카드»다**(사용자 결정) — 자리 자체는 절대 좌표로 저장하되, 할 일 노드를 끌면 `metadata.hostTaskNodeId` 가 가리키는 작업 노드가 **같은 간격을 유지한 채 따라온다**.
  - ⚠️ `onNodesChange(changes)` 를 먼저 부르고 이동량을 재면 **항상 0 이다**(그 호출이 이미 새 좌표로 바꿔 놓는다 — 오류 없이 조용히 안 따라온다). 변경 적용과 동반 이동을 **`applyNodeChanges` 로 한 번의 갱신 안에서** 함께 한다.
- **처음 자리를 아래 한 줄로 고른 근거**(지금도 기본 배치다): 오른쪽 세로 쌓기는 라이브에서 작업이 달린 할 일 노드 **23개 중 16개(70%)**가 오른쪽 360px 안에 다른 노드를 이미 두고 있었다(오른쪽 빈칸 평균 40px — 흐름이 왼→오른으로 흐르니 당연하다). 아래·위 한 줄은 **1개**만 겹쳤다.
- **순서·표시**: 권장 순서(`task.meta.actionFlow`)를 **`utils/actionFlow.ts` 의 `orderByFlow` 로** 적용한다(캔버스에서 다시 구현하면 패널의 단계 번호와 갈린다). 작업이 둘 이상일 때만 ①② 번호를 그리고, 실행 이력이 있으면 초록 점. 아이콘·색은 패널의 `KindIcon` 과 **같은 종류(kind) 어휘**다. 제목·유형·번호·이력은 저장값이 아니라 원본에서 다시 읽어 맞춘다(업무·할 일 노드의 라이브 동기화와 같은 방식, dirty 로 잡지 않는다).
- **노드 = 흰 동그라미 버튼(48×48) 그 자체이고 라벨은 상자 «밖» 아래**에 그린다(2026-09-24 사용자 지적). 라벨을 상자 안에 두면 **선택 테두리와 연결점이 글자까지 감싼다** — 연결점이 아이콘이 아니라 글자 옆에 붙는다. 라벨은 `pointer-events-none` 이라야 글자 위에서 시작한 드래그가 노드를 잡는다. 동그라미 안에는 **사각 칩을 겹치지 않는다**(48px 원 안에 원·사각이 겹치면 지저분하다) — 칩 배경색이 하던 일은 아이콘 색이 맡는다.
  - ⚠️ **48 은 흰 상자의 원래 크기(`h-12 w-12`)다 — 이 값을 키우면 흰 상자가 함께 커진다.** 요구는 «테두리를 흰 상자에 맞춰라»이지 «흰 상자를 키워라»가 아니었고, 처음에 56 으로 잡았다가 그대로 커졌다.
  - 크기는 바꿀 수 없고, **저장된 크기(옛 배치의 88×86)는 무시한다** — `Math.max(min, stored)` 를 그대로 태우면 옛 값이 영원히 이긴다.
- **실행 진입점은 둘** — 노드 **더블클릭**(다른 노드가 원본을 여는 것과 같은 동작)과 **노드 정보창의 [이 작업 실행]**. 노드를 한 번 누르면 정보창이 열리므로, 더블클릭 하나뿐이면 «눌렀는데 아무 일도 없다»가 된다. 러너(`TaskActionRunnerDialog`)는 **캔버스가 소유**하고 정보창은 요청만 올린다(두 길이 같은 화면으로 모인다). 남의 흐름(`readOnly`)에서는 RUN 쓰기가 서버에서 막히므로 `guideOnly` 로 안내만 열고 **버튼도 「작업 안내 보기」라고 말한다**(눌렀다 거절되면 고장처럼 보인다).
  - ⚠️ **노드 안에 버튼을 두지 않는다** — 아이콘 칸이 노드의 대부분이라 버튼으로 만들면 그 영역을 잡고 끌 수 없다(`nodrag` 가 필요해진다). 실행 버튼은 정보창에 둔다.
  - 정보창에는 **이름 편집 칸을 두지 않는다** — 이름은 `task_action.title` 에서 동기화되므로 고쳐도 다음 동기화가 되돌린다. 대신 "바꾸려면 할 일 편집 창의 [작업]에서"라고 말한다.
- **선의 이름은 `action`**(마이그레이션 `20260924160000`) — 라벨을 그리지 않고 화살촉도 달지 않는다(흐름의 다음 단계가 아니라 «딸린 것»이다). 처음엔 `contains` 로 심었는데 그 라벨이 «포함 할 일»이라 화면이 «이 작업은 포함된 할 일이다»라고 말했다.

### 만들기 = 할 일 노드의 + 를 끌어 놓기 (n8n 방식)

할 일 노드의 핸들을 빈 곳으로 끌면 노드 선택기가 뜨는 구조가 이미 있었다. 거기에 **「작업」 탭**을 더해, 고르면 놓은 자리에 노드가 생기고 그 할 일과 이어진다. 탭은 **출발 노드가 할 일일 때만** 뜨고(그때만 «어디에 붙일지»가 정해진다) 있으면 기본으로 열린다.

- 고를 것은 둘 — ①이 할 일에 **이미 연결된** 작업 중 캔버스에 없는 것(가져오기) ②**새로 연결할** 유형(연결 + 노드 추가를 한 번에). 업무·할 일 탭이 「기존 가져오기 / 새로 만들기」로 갈리는 것과 같은 짜임이다.
- 관리자 전용 유형은 관리자에게만, 제출 구현용 연결은 목록에 세우지 않는다(`listableActions`).
- 파일 = `WorkflowActionPickerPanel.tsx`.

### ⚠️ 복사 RPC 는 `action_id` 를 새 작업으로 옮겨야 한다

`copy_task_workflow` 는 복제한 할 일에 붙은 작업도 새로 만드는데, 노드 INSERT 가 `action_id` 칸을 모르면 NULL 이 들어가 **CHECK 위반으로 복사 전체가 실패**한다(조용한 오류가 아니라 즉시 실패라 그나마 낫다). 마이그레이션 `20260924170000` 이 `tmp_action_map` 으로 remap 하고, **옮길 작업이 없는 노드는 매핑에서 지워** 그 노드를 쓰는 선도 함께 빠지게 한다(엣지 복제가 같은 매핑을 조인한다). 실측: 작업 노드 5개 흐름 복사 → 복사본 5개, `action_id` NULL 0건, 원본 작업과 공유 0건.

### ⚠️ 작업 노드는 «측정»에 기대지 않는다 — 기대면 선이 조용히 사라진다

**하루에 두 번 겪었다**(유도 노드 시절 한 번, 정식 노드로 크기를 56 으로 줄이며 또 한 번). `adoptUserNodes` 는 노드 객체가 이전과 같은 참조가 아니면서 `measured` 가 없으면 `handleBounds` 를 **초기화한다**(`parseHandles`, `node_modules/@xyflow/system`). 핸들 좌표가 없으면 **선이 오류도 경고도 없이 사라진다**(RF 의 008 오류는 핸들이 «안 맞을» 때만 나고, 그때는 아예 «없다»). 게다가 `width`/`height` 만 주면 노드는 보이지만 선이 빠지고, `style` 로만 크기를 주면 `visibility: hidden` 이 되어 노드까지 사라진다.

**그래서 작업 노드는 `width`·`height`·`measured`·`handles` 를 전부 선언한다** — `types.ts` 의 **`ACTION_NODE_FLOW_PROPS` 단일 출처**이고, 노드를 만드는 **두 곳**(불러오기 `graphNodeToFlowNode`, 새로 추가 `handleAddAction`)이 함께 쓴다. 크기가 고정이라 좌표를 이미 알고 있으니 측정할 이유가 없다. 노드의 `<Handle id>` 는 선언한 값과 **같아야** 한다.

- **이 결함은 스크린샷 한 장으로 속는다**: 측정되지 않은 노드도 `getBoundingClientRect` 는 상자를 돌려주므로 「개수·좌표」만 세는 검사는 통과한다. 그래서 브라우저 검사가 **`visibility`** 를 함께 본다.
- 회귀 = `npx tsx scripts/workflow-action-node-test/run.mts`(50건 — 저장 왕복의 `action_id`, CASCADE·유니크·CHECK, 복사 remap, 선 이름, 진입점 배선) + `node scripts/workflow-action-node-test/run-browser.mjs`(실제 렌더 — 노드가 보이는가·선이 붙는가·겹치는가·**할 일을 끌면 따라오는가**·메모에 스크롤바가 없는가. `PLAYWRIGHT_MODULE` 필요, 개발 서버 주소는 `CANVAS_TEST_URL`).

## 메모 노드에 스크롤바를 두지 않는다 (2026-09-24)

메모 노드는 껍데기(핸들·크기 조절)와 표면(테두리·배경·본문)이 **두 겹**이다. 종전엔 한 겹이라 `overflow-auto` 상자 **안에** 연결 핸들과 크기 조절 버튼이 들어가 있었고, 그 결과 ①좌·우 연결점과 우측 하단 버튼이 잘렸으며 ②그 삐져나옴 자체가 넘침으로 계산돼 **내용이 짧아도 스크롤바가 생겼다**. React Flow 의 핸들은 노드 경계선 위에 걸쳐 그려지므로 스크롤 상자 안에 두면 안 된다.

지금은 바깥 `relative` 상자가 핸들을 들고, 안쪽 카드가 `overflow-hidden` + `break-words`(긴 URL 같은 한 단어가 가로로 밀지 않게) 이다. **넘치는 글은 잘린다** — 스크롤바를 두지 않기로 한 대가이고, 전체 내용은 `title` 툴팁과 노드 크기 조절로 본다.

## 할 일 편집 창의 작업 카드 — 제출 받기도 하나의 작업 (2026-09-23)

사용자 판단: **담당자에게 제출받는 것도 작업(Action)의 하나**이고, 작업 설정이 할 일과 따로 떨어진 창에 있으면 UX 가 갈라진다. 그래서 할 일 편집 창의 종전 "담당자에게 제출받기" 블록 자리에 **[작업] 카드**(`components/tasks/TaskActionsSection.tsx`)를 두고, 제출 받기·NEIS 화면·문서 양식·앱 기능을 **한 목록**에서 추가·빼기·설정한다.

- **저장 위치는 옮기지 않았다.** 제출 받기는 화면에서만 작업의 한 항목이고 저장은 종전대로 `task.meta.submission`(설정 폼·검증·`buildSubmissionMetaPatch` 무변경). 이유 둘 — ①서버의 함수·트리거 6종(`set_task_assignee_status` 완료 가드, 제출 RPC 3종, `guard_task_submission_config` 등)이 이 값을 직접 읽는다 ②`task_action` 수정은 작성자(`created_by`) 전용이라, 옮기면 **공동 매니저가 제출 설정을 못 바꾸는 회귀**가 생긴다. 사용자에게 보이는 차이는 없고 위험만 크다.
- **변경은 초안에 모았다가 [저장] 때 반영**(`utils/taskActionDraft.ts`). 새 할 일은 id 가 없어 연결을 만들 수 없고(FK), 수정 창도 같은 규칙이라야 "어떤 변경은 즉시, 어떤 건 저장 때"로 갈리지 않는다. 반영 순서 = **삭제 → 추가 → 수정**(해제한 유형을 다시 추가하면 UNIQUE(task, 사람, 유형)에 걸리지 않게). 할 일 저장 **뒤에** 돌고, 일부가 실패하면 창을 닫지 않는다(다시 저장하면 같은 계획이 재적용된다 — 연결은 upsert).
- NEIS 화면은 카드 안에서 바로 고른다 — 편집기(`NeisScreensEditor`)를 **값만 바꾸는 부품**으로 떼어, 실행 창은 즉시 저장(`noteMode='commit'`)·할 일 편집 창은 초안(`'live'`)으로 쓴다. 그 밖의 유형은 저장 뒤 [열기]에서 세부 설정(기본 양식 등).
- **남의 연결은 빼거나 고칠 수 없다**(RLS `created_by`) — 버튼을 비활성으로 두고 이유를 적는다. 추가 가능 목록은 **내가 이미 가진 유형**만 뺀다(남의 행과는 별개 행이다).
- 값 제출(양식 작성)이 스스로 만드는 연결(`config.origin='submission'`)은 제출 받기의 **구현**이라 목록에 따로 세우지 않는다(`listableActions`) — 할 일 편집 창·연결된 작업 창 둘 다.
- **할 일 목록 경로의 "연결된 작업" 창은 사용 보기뿐**이다(`allowManage={false}`, 사용자 결정). 관리 보기는 업무 흐름 인스펙터에만 남고, 거기서도 제출 받기는 "할 일 편집 창의 [작업]에서 바꿉니다" 안내 카드로 보인다. 사용 보기는 제출을 받는 할 일이면 **①제출하기**가 첫 단계이고, [제출하기]는 제출 화면을 가진 호스트(할 일 상세)가 넘긴 콜백으로 연다 — 제출 화면은 방식별 호스트 조합(값 제출 러너를 형제로 띄우기 등)이 있어 패널이 새로 띄우지 않는다. 콜백이 없는 곳에서는 "내 할 일에서 [제출]"을 안내한다.
- 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/task-action-draft-test/run.mts`(25건).

## 작업 순서(action flow) — 권장 순서, 강제하지 않는다 (2026-09-23)

관리자는 한 할 일 안의 작업(제출 받기 포함)에 **순서**를 정한다 — 할 일 편집 창의 [작업] 카드와 업무 흐름 인스펙터의 관리 보기에서 ↑↓. 담당자에게는 번호로 보이지만 **순서대로 하도록 막지 않는다**(사용자 결정 — 지금은 순서만 지정).

- 저장 = **`task.meta.actionFlow: string[]`**(작업 연결 id + 제출 받기의 고정 키 `'submission'`). `task_action` 쪽에 두지 않은 이유: 수정이 작성자 전용이라 공동 매니저가 남의 작업 순서를 못 바꾸고, 제출 받기는 행 자체가 없다. 단일 출처 = `utils/actionFlow.ts`.
- **순서 설정 때문에 작업이 사라지지 않는다**: 목록에 없는 항목(나중에 붙은 작업)은 뒤에 원래 순서로, 목록에 있는데 사라진 키(해제된 연결)는 무시.
- 할 일 편집 창은 **화살표를 눌렀을 때만** 순서를 저장하고, 저장 전 새 작업의 임시 키는 연결 뒤 새 id 로 바꿔 적는다(`resolveFlowKeys`). 관리 보기는 누른 즉시 저장(로컬 사본으로 먼저 보여 주고, 서버 값이 바뀌면 비운다).
- 연간 가져오기·복사 규칙표 = `drop`(옛 연결 id 는 새 할 일에서 가리킬 대상이 없다 → 기본 순서로 돌아간다).
- 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/action-flow-test/run.mts`(20건).

## 노드 정보(인스펙터) 배치 (2026-09-23)

폭 288px 안에서 자주 쓰는 것을 위로, 드물게 쓰는 설정은 헤더의 작은 버튼으로 올렸다.

- **헤더** = 종류 아이콘·제목 · [● 헤더 배경색(현재 색, 누르면 팝오버)] · [↗ 원본 업무/할 일 열기] · [✕]. 종전엔 색 8칸 격자가 본문에 늘 펼쳐져 있었고, 원본 열기는 본문 중간의 큰 버튼이었다.
- **본문 순서** = 표시 이름 → 연결된 업무/할 일 → 연결된 작업 → **세부 정보(맨 아래)**.
- 세부 정보에서 **겹치는 것은 뺀다** — '유형'은 헤더 아이콘과 '연결된 할 일' 라벨이, '소속'은 연결 편집기의 업무 선택이 이미 말한다(편집기가 없는 **읽기 전용에서만** 소속을 보인다). 남는 것 = 상태·할 일 유형·기한·진행률.
- 회귀는 `scripts/workflow-node-rename-test/run.mts` 에 함께 있다(배치 4건).

## 업무 흐름 복사 — 선(edge) 기준 선택 · 작업까지 복사 (2026-09-23)

- **업무(WORK) 노드를 누르면 그 업무에 딸린 노드가 함께 빠지고 들어온다.** 딸렸는지는 **그래프의 선**으로 정한다 — 종전엔 `metadata.containerNodeId`(업무를 올릴 때 자동 생성된 노드의 표시)만 봐서, 따로 추가해 직접 연결한 노드는 따라오지 않았다. 판정 = `utils/workflowCopy.ts` `assignWorkOwners`: ①자동 생성 표시·업무에서 나온 포함 선으로 확정 ②업무 안의 선(포함·흐름·선행)으로 **모든 업무에서 동시에** 퍼뜨린다(가까운 업무가 이긴다) ③그래도 주인이 없는 노드만 업무 사이의 선(인계·연관)으로. 업무 노드는 지나가지 않는다. 방향은 보지 않는다.
  - ⚠️ 처음엔 "다른 업무에 포함된 노드에서 멈춘다"로만 짰다가 회귀에서 틀린 것이 드러났다 — A 에 **흐름** 선으로 이어진 할 일은 '포함'이 아니라서 B 에서 인계 선을 타고 들어오면 B 의 것으로 끌려갔다. 소속을 먼저 정하고 고르는 방식이라야 한다.
  - 딸린 노드는 따로 다시 넣거나 뺄 수 있다(업무를 뺀 뒤 할 일 하나만 넣기). 서버는 보낸 목록만 본다.
- **작업(Action)도 복사된다**(실행 이력은 제외) — `copy_task_workflow` 개정, 상세 `docs/database/task-workflows.md`.
- 회귀 = `npx tsx scripts/workflow-copy-test/run.mts`(20건).

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `task-workflow` | 업무 흐름 캔버스 + WORK 실행 계층 + HWPX 스펙 기반 문서 생성. **연결된 작업이 캔버스의 「작업 노드」다**(2026-09-24, n8n 식 · `task_workflow_node.node_kind='action'` + `action_id`, 끌어서 옮기고 자유롭게 잇는다 · 유령 노드는 FK CASCADE 가 막는다 = 정리 코드 금지 · 만들기 = 할 일 노드의 + 를 끌면 선택기에 「작업」 탭 · 자리 기준 = 할 일 카드라 할 일을 끌면 따라온다 — ⚠️ `onNodesChange` 를 먼저 부르면 이동량이 **항상 0** 이라 조용히 안 따라온다) | `WorkflowCanvas.tsx`, `WorkflowActionPickerPanel.tsx`, `taskWorkService.ts`, `workRegistry.ts` · `docs/features/task-workflow.md`, `docs/database/task-workflows.md` |
