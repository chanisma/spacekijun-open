# notice-board

> CLAUDE.md 에서 분리한 상세 문서. 스키마·마이그레이션은 `docs/database/*.md` 참조.

부서 공지사항 (`/notices`, 교사/admin 전용 — 학생 미노출).

**활성 공지(start_date≤오늘≤end_date)가 있는 부서만** 리스트 상단에 북마크 탭 표시(+전체 탭·점선 '공지 작성' 탭, 작성·상세 모두 모달; 페이지 헤더 없음 — 탭 행이 헤더 겸용, '지난 공지 포함' 토글은 탭 행 맨 오른쪽 trailing 슬롯, 모바일<sm에선 부서명 축약 `utils/deptShortName.ts`).

**본문 목록 지원**(`utils/noticeContent.ts`): 저장은 plain text 유지 — 붙여넣기 시 클립보드 text/html의 ul/ol만 글머리 텍스트로 변환(`htmlClipboardToText`, Word는 plain text에 • 글리프가 이미 있어 무개입), 상세 표시는 글머리·번호(•·-·1.·①·가. 등) 줄 파싱 렌더(`NoticeContentView`, 행잉 인덴트·2칸=1레벨).

**열람 대상 지정 (2026-09-17)**: 작성 모달의 `[열람 대상]` 스위치 — 끄면 기존대로 교직원 전체 공개, 켜면 `SearchableMultiSelect`로 고른 사람 + 작성자 + admin 만 본다(`department_notice.target_resource_ids` UUID[], **NULL·빈 배열 = 전체 공개**라 기존 공지는 영향 없음). 수정 시에도 값을 항상 실어 보내 '제한 해제'가 반영된다. 판정은 RLS SELECT 정책이 하고 신원 해석은 `current_actor_resource_ids()`(교직원 `user_resource` + 학생 이메일 prefix). ⚠ **학생은 역할 필터에 막혀 이 표를 아예 못 읽으므로 학생을 대상에 넣어도 공지로는 도달하지 않는다** — 학생에게 알려야 하면 알림을 쓸 것. ⚠ 이 표의 삽입은 `.insert().select().single()` 이라 SELECT 정책이 새 행에 다시 적용되므로, 정책은 **새 행의 컬럼으로만** 판정하고 `department_notice`를 id로 되읽는 STABLE 함수를 쓰지 않는다. 일정 설문이 이 기능을 써서 «대상자에게만 보이는 설문 공지»를 만든다(`survey_id` 컬럼 + `[[survey:…]]` 토큰, 상세 = `docs/features/schedule-survey.md`).

**링크 복사 — 특정 공지로 바로 가는 주소 (2026-09-18)**: 상세 모달 푸터 왼쪽 `[링크 복사]`. **이 공지를 볼 수 있는 사람 전원**에게 보인다(수정·삭제는 종전대로 작성자·admin — 그래서 푸터가 `canManage` 일 때만 렌더되던 것을 항상 렌더로 바꾸고 `justify-between` 으로 갈랐다). 복사되는 주소는 이미 있던 딥링크 `/notices?notice=<id>` 의 절대 주소이고, 대시보드 카드가 쓰던 것과 **같은 경로**다 — 경로·파라미터 이름·복사 함수의 단일 출처 = `utils/noticeShare.ts`(`noticeDeepLinkPath`/`noticeShareUrl`/`copyTextToClipboard`).
- **⚠ 주소창은 공유 수단이 될 수 없다** — `NoticeBoardPage` 가 `?notice=` 를 **1회 소비 후 `setSearchParams(..., {replace:true})` 로 지우므로**(새로고침 때 모달이 다시 열리는 것을 막으려는 의도) 링크를 받고 나면 주소창에는 `/notices` 만 남는다. 그래서 복사 버튼이 편의가 아니라 **링크를 얻는 유일한 수단**이다. 딥링크 소비 로직을 고칠 때 이 전제를 깨지 말 것.
- **성공은 토스트가 아니라 버튼 라벨이 말한다**(`링크 복사` → `링크 복사됨` 2초, 에메랄드). 화면이 이미 말하는 것에 토스트를 겹치지 않는다는 규약. 실패했을 때만 토스트 + **주소를 readonly `Input` 으로 드러낸다** — `navigator.clipboard` 는 **보안 컨텍스트(https·localhost)에서만 존재**하고 권한도 거부될 수 있어, `execCommand('copy')` 폴백까지 실패하면 직접 복사할 길을 줘야 한다(복사 버튼은 "눌렀는데 아무 일도 안 일어남"이 가장 알아채기 어려운 부류다).
- **딥링크가 실패하면 말한다**: 종전 소비 로직은 대상 공지를 못 찾으면 **조용히 param 만 지웠다**. 링크를 주고받기 시작하면 이건 실제로 일어나는 일이다(삭제된 공지, `target_resource_ids` 열람 대상이 아닌 사람) → 지금은 `toast.error`. 함께 **판정 기준을 `notices.length === 0` 에서 `isLoading` 으로** 바꿨다 — 열람 가능한 공지가 하나도 없는 사용자는 목록이 영영 비어 있어 **분기 자체에 도달하지 못했다**.
- 목록 행에는 복사 버튼을 두지 않았다 — 행 전체가 이미 `<button>` 이라 안에 버튼을 넣으면 HTML 이 깨진다(행 구조를 통째로 갈아야 한다). 공유는 상세를 열고 하는 동작이라 실익도 작다.

**내부 링크**(`utils/noticeLinks.ts`): 본문에 `[[schedule|task|purchase|collab|docgen|activity|survey:uuid|라벨]]` 토큰으로 스케줄 일정(meeting)·업무(task)·구매 신청 게시글·협업보드 연결 — 작성 모달 '링크 삽입' 툴바(`NoticeLinkPicker` 검색 픽커, RLS 그대로)로 커서 위치 삽입, 상세에서 클릭 칩 렌더. 이동: schedule=`/schedule`+`state.scheduleId`(**월 이동+상세 모달 자동 오픈** — Schedule.tsx가 scheduleId로 월 이동 후 로드된 events에서 매칭해 페이지 레벨 `ScheduleDetailDialog` 렌더, 학생 뷰는 숨김 kind 필터 동일 적용), task=`/tasks?task=id`(**TaskManagement에 딥링크 신규 추가** — eventData에서 찾아 상세 다이얼로그 오픈 후 param 소비), purchase=`/purchase-requests/:id`, collab=`/collab/:id`(**이동 전 권한 확인** `utils/collabAccess.ts`=BoardDetail hasViewAccess 규칙 동일: admin∨public/read_only∨private+멤버·소유자, 무권한=토스트·이동 차단; 픽커 목록도 같은 규칙+비보관 보드만, `useCollabBoards` 재사용). 픽커 UI=타입별: 일정=**월 달력**(날짜 도트→일자별 목록, 검색 시 전체기간 리스트로 전환), 업무=**event→task 트리**(`useEventsJsonb` 재사용, 검색 시 자동 펼침), 구매글=리스트.

**픽커 내 신규 생성**: 일정='새 일정 만들기' 버튼→`ScheduleCreateDialog`+`useSchedule.createEvent` 재사용(호스트 컴포넌트를 열릴 때만 마운트, meeting id 반환 시 즉시 토큰 삽입), 업무=이벤트 행 '+' 버튼→`TaskEditDialog` 생성 모드(**공용 컴포넌트에 `onSaved?(taskId,title)` 옵션 프롭 추가** — 저장된 업무를 즉시 토큰 삽입) + '새 이벤트(프로젝트) 만들기'→`EventCreateDialog` 재사용(onSuccess의 eventId로 트리 갱신·자동 펼침; 비검색 모드 트리는 task 0개 이벤트도 표시해 신규 이벤트에 바로 '+' 가능).

**첨부파일**(`services/noticeFileService.ts`, `attachments` JSONB): tasks 패턴 재사용 — `CombinedFileUpload`(로컬+Drive), 로컬=Storage `notice/<id>/`+documents 등록, Drive=`GoogleDriveIntegrationService` targetType 'document'(pending 생성/업로드 포함, 부서 문서함 노출), 저장 흐름=공지 저장→파일 처리→attachments 갱신(파일 부분 실패 허용), 제거·삭제 시 best-effort 정리(Drive 원본 보존). 미확인 공지 NEW 표시=사용자별 localStorage(`notice-board-seen-v1`, 상세 열람 시 확인 처리·삭제된 id prune). 작성=모든 교사/admin, 수정·삭제=작성자 본인/admin(RLS). '지난 공지 포함' 토글로 예정/종료 공지 관리. 홈 대시보드 **'학사 정보 알림' = `NoticeInfoCard`**(활성 공지 최대 5건, 없으면 카드 숨김, 클릭=`/notices?notice=id` 딥링크 — **단 현행 교사 대시보드(V2)는 `TeacherNoticesCard`('학교 공지')이고 2026-08-13부터 카드에서 `NoticeDetailDialog`를 직접 연다**(페이지 이동 없음, 클릭 시 `markSeen`). 수정 버튼만 `/notices?notice=id`로 넘긴다 — 대시보드에 작성 폼(첨부·Drive 업로드)까지 싣지 않기 위함. `NoticeInfoCard`는 레거시 대시보드(`TeacherHomeLegacy`) 전용. 배치: 첫 행이 `오늘의 흐름·이번 주 일정·학교 공지` 3열(lg 4/4/4)이고 **활성 공지가 없으면 부모(`TeacherDashboardV2`)가 같은 판정을 다시 해 7/5로 폭을 회수**한다 — 카드가 스스로 null을 반환하므로 부모가 모르면 4칸 구멍이 남는다. 자습 좌석 카드는 그 아래 행)가 구 `dashboard_info_boxes` '학사 정보 알림' 카드를 대체(해당 행 is_active=false 처리, DashboardInfoCard는 excludeTitles로 이중 차단). 사이드바 [오늘] 섹션 **홈 대시보드 바로 아래**에 메뉴 추가하되 **모바일 하단 5칸은 기존 유지**(`applyMobileLayout`이 공지사항을 [오늘] 끝으로 재배치 후 ipsiHub push → 공지는 햄버거 시트에서만) | `NoticeBoardPage.tsx`, `components/NoticeBookmarkTabs.tsx`·`NoticeFormDialog.tsx`·`NoticeDetailDialog.tsx`, `hooks/useNotices.ts`·`useNoticeSeen.ts`, `src/components/dashboard/NoticeInfoCard.tsx`, `department_notice` 테이블

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `notice-board` | 부서 공지사항 (`/notices`, 교사·admin, 내부 링크·첨부) | `NoticeBoardPage.tsx`, `useNotices.ts` · `docs/features/notice-board.md` |
