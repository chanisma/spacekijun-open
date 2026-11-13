# schedule

> CLAUDE.md Component Architecture에서 분리한 일정/캘린더 상세 (일별 계획표·duty CSV·연수 서명).

#### Schedule (`src/components/schedule/`)
- **ScheduleCalendar.tsx**: Calendar interface — `viewMode`에 따라 월/주/일 격자와 계획표를 분기하는 진입점. 상세 다이얼로그(일정/업무)·이동 다이얼로그를 소유하므로 새 뷰는 이 안에서 렌더링해 배선을 재사용한다(`handleEventClick` 공유)
- **ScheduleDailyPlanView.tsx (2026-08-12 신규)**: **일별 계획표 뷰**(`viewMode='plan'`) — 왼쪽에 그 달의 전 일자(일정 없는 날 포함), 오른쪽에 구분·일정(설명)·시간·장소·담당자 열. 날짜 셀은 `rowSpan` 병합 + `sticky left-0`. 종류별 건수 칩(=필터)·`일정 없는 날 숨기기` 토글, 행 클릭=상세, 우클릭=이동/추가. **여러 날 일정은 매일 전개**(`2/3일차` 배지) — 달력이 시작일에만 찍어 잃는 정보. **주의 3가지**: ①`useSchedule`의 범위 계산은 `else`가 '하루'라 `'plan'`을 반드시 `'month'`와 함께 묶어야 한다 ②sticky 셀은 `border-collapse`와 깨지므로 표는 `border-separate border-spacing-0`, sticky 셀 배경은 **불투명색**(알파 금지) ③날짜 판정은 `new Date` 기준 — 저장 형식이 UTC 인스턴트(사용자 생성)와 오프셋 없는 문자열(NEIS) 두 갈래라, 기존 `getEventsForDate`의 원시 문자열 prefix 비교는 **오전 9시 이전 일정을 하루 앞으로 민다**. 순수 로직은 `lib/scheduleUtils.ts`(`parseEventAt`/`getEventDayKeys`/`isAllDayEvent`/`formatEventTimeText`/`toDateKey`), 회귀 = `npx tsx scripts/schedule-plan-test/run.mts`
- **뷰 전환**: `ScheduleHeader` 하단의 `[달력][계획표]` 세그먼트 컨트롤. 2026-08-12 이전에는 헤더가 `viewMode` props를 받고도 렌더링하지 않아 **월 뷰 고정**이었다(주/일 격자는 지금도 UI 미노출, 코드만 유지). 뷰 모드 타입 단일 출처 = `lib/scheduleUtils.ts`의 `ScheduleViewMode`
- **ScheduleCreateDialog.tsx**: Event creation (6 types)
- **ScheduleDetailDialog.tsx**: Event details with training signatures
- **duty kind 라벨 = '업무' 통일 (2026-08-12)**: 구 '당직'(short)/'근무'(full) 혼용이 캘린더 범례('업무')와 어긋나 통일. 단일 출처 = `src/lib/scheduleUtils.ts` `EVENT_LABELS.duty` — 새 화면은 하드코딩 대신 `getEventShortLabel`/`getEventFullLabel`을 쓸 것(생성·편집·설정·상세·캘린더 내보내기 다이얼로그와 대시보드/시간표의 하드코딩 라벨도 함께 정리됨. Google 캘린더 내보내기의 task 필터는 duty와 라벨이 겹치지 않게 '업무 마감'). `/duty` 페이지·`useDuty`의 '당직'은 별도 당직 관리 도메인이라 유지
- **서류제출(document_submission) 일정 신규 생성 중단 (2026-08-12)**: 생성 다이얼로그 유형 카드 비활성 + 편집 다이얼로그 생성 모드 SelectItem disabled + **`useSchedule.createEvent` 관문 차단**(AI 어시스턴트 등 다른 경로도 이 훅을 공유하므로 서버행 직전에 한 번 더 거부). 기존 서류제출 일정의 열람·수정·삭제는 유지
- **일괄 업무(duty) CSV = 한 행에 담당자 여러 명 (2026-08-12)**: 근무자 칸에 이름을 쉼표로 구분하면 **일정 하나에 담당자 N명**이 배정된다. 파싱·검증 단일 출처 = **`src/lib/dutyCsv.ts`**(순수 모듈, UI 비의존). 하류는 무수정 — `convertAssigneeToJsonb`가 이미 쉼표 분리 후 이름/UUID를 각각 해석해 `meta.assignee`에 **이름을 키로** 넣고, 가시성 판정(`isUserAssignee`/`Object.keys(assignee).includes(name)`)이 키 전체를 보므로 N명 전원에게 보인다. **함정: CSV의 열 구분자도 쉼표**라 구 파서(`split(',')`)는 `홍길동,김철수`를 두 열로 읽어 이후 열을 통째로 밀어냈다 → RFC 4180 따옴표 파싱(`"홍길동,김철수"`, 엑셀이 쉼표 든 셀을 저장하는 표준 형식)으로 교체하고, 손으로 쓰는 경우를 위해 담당자 칸 전용 대체 구분자(`;` `/` `·` `、`)도 받는다. 담당자가 **마지막 열**이면 따옴표 없는 여분 쉼표도 담당자로 병합(기본 양식 `public/dutyform.csv`가 근무자를 마지막 열에 둔다), 마지막 열이 아니면 어느 열의 쉼표인지 알 수 없으므로 **병합하지 않고 오류로 안내**한다. 미리보기는 교사 명단에 없는 이름을 앰버로 경고(저장은 되지만 그 교사 화면엔 안 뜨므로 — 판정은 리소스 로딩 완료 후에만). 회귀 = `npx tsx scripts/duty-csv-test/run.mts`(38건, 배포 샘플 양식 파싱 포함). **주의: 라이브 경로는 `ScheduleCreateDialog`뿐** — `ScheduleEditDialog`에도 자체 일괄 CSV 코드가 있으나 `ScheduleDetailDialog`가 항상 `event`를 넘겨 `!event` 조건이 성립하지 않는 도달 불가 코드다(구 위치 기반 파서 잔존, 되살릴 때 `dutyCsv.ts`로 교체할 것)

- **연수 참석 서명 = 직접 서명 + 벡터 저장 (2026-08-14 전면 교체)**: 구 구현은 **서명 그림을 저장하지 않았다** — 캔버스에 그려도 `meta.assignee[이름].signature` 플래그만 1로 올렸고, 인쇄 뷰는 그 플래그로 **`profiles.signature`(프로필 등록 이미지)**를 이름 조회해 찍었다. 등록 서명이 있는 교사는 559명 중 17명뿐이라 나머지는 서명해도 인쇄물이 빈 칸이었다(그 17건도 **public 버킷** URL이라 링크만 알면 열람 가능). 지금은 그 자리에서 직접 받아 **획 좌표**로 `training_signature` 표에 1인 1행 저장한다(등록 서명 재사용 경로는 제거 — 사용자 결정). **형식·렌더 단일 출처 = `src/lib/signatureStrokes.ts`**(`{v,w,h,s:[[x,y,...]]}` 평탄 정수 배열 + RDP 단순화 + 잉크 경계 trim + SVG path). **왜 이미지가 아닌가**: 실측 0.5KB(PNG data URL 5~15KB)·인쇄 해상도 무관·Storage 고아 파일 없음. **왜 `meeting.meta`가 아닌가**: QR로 동시에 서명하면 JSONB read-modify-write가 서로를 덮어쓴다 → 플래그 동기화는 **DB 트리거**가 서버에서 원자적으로(클라가 meta를 쓰지 말 것). 공용 부품 = `components/signature/SignaturePad`(포인터 이벤트+`getCoalescedEvents`+DPR 보정, 반환값이 dataURL이 **아니라** strokes)·`SignatureStrokesView`. **명단 파싱은 `lib/trainingSignature.ts` 하나로**(meta.assignee가 객체형·문자열형 두 갈래라 화면마다 분기하면 한 곳만 고쳐진다). 회귀 = `npx tsx scripts/training-signature-test/run.mts`(55건)
- **QR 서명은 링크일 뿐, 익명 서명은 없다 (2026-08-14 사용자 결정)**: 상세 모달 'QR로 서명받기' → `/training-sign/:meetingId`(`TrainingSignatureQrDialog`, 서명 현황 실시간 표시). 이 라우트는 **public 화이트리스트에 넣지 않았다** — 서버가 `signer_name = current_profile_name()`을 강제하므로 QR이 유출돼도 남의 이름으로 서명되지 않고, 그래서 QR에 토큰·유효기간이 필요 없다. 대신 **로그인 후 원래 주소로 복귀**가 필요해 `RequireAuth`가 `sessionStorage`에 경로를 남긴다(react-router `state.from`은 Google OAuth 왕복에서 사라진다). 저장·소비는 반드시 **effect에서** — 렌더 중에 지우면 StrictMode 이중 렌더의 첫 출력이 버려지며 이동이 유실된다
- **머리글 [부가 기능] 드롭다운 (2026-09-28 사용자 요청)**: 일정 설문 · 회의 가능 시간 검색 · 구글 캘린더(.ics · 직접 전송)를 한 메뉴로 묶었다. 회의 가능 시간 검색은 도구 모음에도 남기고(사용자 결정) 컴포넌트는 `MeetingTimeSearchDialog`(이 폴더) 한 벌을 공유한다. 결정 2가지: ①미응답 설문 배지는 **메뉴 버튼 위** — 메뉴 안에만 두면 열기 전엔 답할 설문이 있다는 사실이 사라진다(메뉴 안 항목에도 「미응답 N」) ②학생은 쓸 수 있는 것이 일정 설문 하나뿐이라 항목 하나짜리 메뉴 대신 **종전 버튼**을 둔다. 구글 내보내기는 로딩 중 비활성(종전엔 메뉴 전체가 비활성이었다 — 지금은 설문·회의 검색은 로딩과 무관하게 열린다)
- **일정 AI 도우미 (2026-09-30 사용자 요청)**: 공지사항 AI 도우미와 같은 오른쪽 아래 떠 있는 버튼(교직원만). 메모·공문을 넣으면 제목·종류·날짜·시각·세부 사항·담당자 초안을 만들고, 사람이 고친 뒤 [일정 추가로 이어가기]를 누르면 **채워진 일정 추가 창**이 열린다 — **저장은 언제나 그 창**(결강 미리보기·첨부가 거기 있다). 순수 로직 = `src/lib/scheduleDraft.ts`, 호출 = `services/scheduleDraftService.ts`(공용 `aiChat`, 추출 과제), UI = `ScheduleDraftWidget`, 창 연결 = `ScheduleCreateInitialValues` 에 `date`·`startTime`·`endTime`·`dateOnly` 추가. **조용히 틀리는 자리 4종**: ①상대 날짜를 모델에게 계산시키지 않는다 — 추론 'none' 이라 **날짜표(지난 주부터 10주, 월요일 시작)를 프롬프트에 싣고** 찾아 쓰게 한다 ②담당자는 **교직원 명단과 정확히 한 명 일치할 때만** 넣는다(동명이인·명단 밖 이름은 줄 그어 보여 주고 사람이 고른다 — 엉뚱한 사람 달력에 출장이 생긴다) ③없는 날짜(2026-02-30)는 옆 날로 굴리지 않고 비운 뒤 묻는다, 시각이 없으면 종일로 둔다(폼 기본 09:00~09:50 이 원문에 없는 시각으로 저장되지 않게) ④페이지의 초안 상태는 [일정 추가]·날짜 클릭·창 닫기·저장 때 비운다 — 남기면 다음 빈 창에 지난 초안이 다시 채워진다. 휴대폰에서는 버튼을 하단 네비 위로 올렸다. 회귀 = `npx tsx scripts/schedule-draft-test/run.mts`(42건) + `live.mts`(실제 모델 5건 — 2026-09-30 전부 기대대로, 1~6초)
- **출장·개인일정 ↔ 수업 교체·대체 = 「결강 처리」 (2026-09-28 사용자 결정)**: 일정 시간에 걸린 **내** 수업을 저장 뒤 이어서 교체·대체로 처리한다. **판정 단일 출처 = `src/lib/absenceLessons.ts`**(겹침 = 조금이라도 겹치면, 경계는 반열린 구간 · 처리 상태 = 그날·그 교시에 내가 **요청자**인 `class_swap` 에서 계산하고 저장하지 않는다 — 시간표에서 먼저 신청해 둔 교체도 처리됨으로 잡힌다). 조회 = `useAbsenceLessons`(생성 모달 미리보기·결강 처리 모달·상세 칩이 공용). **입구 3곳이 한 모달이다** — 전역 호스트 `AbsenceResolutionHost`(App 에 하나)가 `?absence=<일정 id>` 를 보고 연다(생성 모달은 호스트에 따라 저장 시 언마운트되므로 모달을 품을 수 없다). 입구 = 생성 직후(닫힌 다음 프레임) · 일정 상세 `AbsenceDetailSection` · 출장 동행자 알림 `absence_lessons`.
  - 결정 3가지: ①**저장을 막지 않는다**(교체는 상대 승인을 기다리는 일) ②**여러 날 일정은 다루지 않는다**(생성이 하루짜리 — 끝이 다음 날이면 시작일로 자른다) ③**개인일정의 제목·내용은 상대에게 가지 않는다**(사유 = `absenceReason` 의 「개인 사정」, meta 에는 `absence_meeting_id`·`absence_kind` 뿐).
  - **조용히 틀리는 자리 4종**: ①승인된 교체의 수업은 `useTimetableData` 가 이미 시간표에서 지운다 → 요청 행에서 되살리지 않으면 해결한 수업이 목록에서 사라져 "1/3" 이 "0/2" 가 된다 ②교체 상대 날짜가 **결강 구간 안**이면 결강이 해결되지 않는다 → `absenceApproverDateOptions` 가 막는다(기존 "이번 주부터 4주" 는 먼 결강의 주를 담지 못해 결강 주 앞뒤로 만든다) ③**같은 출장 동행자**는 시간표상 비어 있어도 그날 없다 → 후보에서 사유와 함께 접는다 ④대상자가 없는 `event`(교무회의처럼 쓰인 행 — 라이브 `event` 11건 중 다수)는 **아무도 빠지지 않는** 것으로 본다.
  - 동행자 알림 = `notifyAbsenceParticipants`(그 시간 수업이 있는 사람만, 남에게 보내는 알림이라 `.select()` 금지). 요청자는 본인이어야 해서 등록한 사람이 남의 수업을 대신 처리할 수 없다.
  - 일정 삭제 = 그 일정으로 보낸 **대기 중** 요청은 함께 취소, **승인된 요청은 건드리지 않고** 개수만 알린다(상대가 이미 수업을 맡기로 했다).
  - 한계: 대체 후보는 요일·교시 **정규 시간표**로만 판정한다 — 그날 다른 선생님의 출장·개인일정은 보지 않는다(개인일정은 남이 읽을 수 없다).
  - 회귀 = `npx tsx scripts/absence-lessons-test/run.mts`(62건) + `node scripts/absence-lessons-test/run-screenshots.mjs`(실제 모달 390·1280 — `PLAYWRIGHT_MODULE`·개발 서버 필요)



## 담임 반 학생 생일 (2026-10-11)

담임 교사(태그 `N학년 N반`)의 달력에 반 학생 생일을 표시한다.

- **저장하지 않는 가상 일정**이다. `Schedule.tsx` 가 생활기록 일정과 같은 자리에서 합친다. 반 배정이 해마다 바뀌므로 `meeting` 행으로 만들면 학년이 바뀔 때마다 정리해야 한다.
- 출처 = `resource.meta.birthday`(재학생 `status='active'`, 2026-10 기준 630명 중 614명). 졸업생은 CHECK 제약이 생일을 지운다.
- 교사 시점 미리보기에서는 미리보기 태그를 쓴다(`useHomeroomStudentOverview` 와 같은 규칙). 학생 시점에서는 아무것도 띄우지 않는다.
- 하루에 여럿이면 한 칸으로 묶는다(`🎂 정시우 외 2명`, 번호순). 2월 29일생은 평년에 2월 28일.
- **조용히 틀리는 자리**: 가상 일정 id(`birthday:YYYY-MM-DD`)는 `meeting` 에 없다. 일정 상세 창은 권한을 비동기로 계산해 관리자에게 [삭제]를 띄우므로 클릭을 `onOpenBirthday` 로 따로 보낸다. [일정 이동] 메뉴(월·주 두 곳)와 이동 처리기, **구글 캘린더 직접 내보내기**에서도 `isBirthdayEvent` 로 뺀다 — 마지막을 빠뜨리면 학생 이름·생일이 교사 개인 구글 캘린더로 나간다.
- 회귀 = `npx tsx scripts/homeroom-birthday-test/run.mts`

## 학사일정의 «수업 없는 날 · 학년» (2026-10-11)

쉬는 날 판정(`src/lib/schoolDay.ts`)의 근거는 NEIS 학사일정의 수업공제일명(`meta.sbtr_dd_sc_nm` — `공휴일`·`휴업일`·`해당없음`)이다. 스케줄에서 손으로 넣은 학사일정에는 이 값이 없어 재량휴업일을 손으로 넣어도 수업일로 보였다.

- 일정 만들기·수정 창에서 **학사일정일 때만** «수업 없는 날» 체크 + 학년(전 학년 / 1·2·3학년 중 고르기, 셋 다 = 전 학년)이 나온다(`NoClassDayField`).
- 저장 = NEIS 와 **같은 값** `sbtr_dd_sc_nm: '휴업일'` + `no_class_grades: [2]`(없음 = 전 학년). 그래서 판정 코드는 출처를 가리지 않는다. 규칙은 `noClassMetaPatch` 한 곳 — NEIS `공휴일`을 고쳐도 `공휴일`로 남고, 체크를 끄면 NEIS 일정은 `해당없음`·손 일정은 null.
- 학년별 판정:

| 화면 | 학년 |
|---|---|
| 학생 대시보드·학생 시간표·학생 다마고찌 | 그 학생의 학년 |
| 자습 감독 배정 | 배정하는 학년 |
| 교사 대시보드·교사 시간표 | 수업마다 반 이름(`과목 2-3`)의 학년 |
| 교사 다마고찌 | 전 학년 휴업만(여러 학년을 가르친다) |
| 급식지도 | 전 학년 휴업만 — 다른 학년은 급식을 먹는다 |

- 교사 화면은 일부 학년 수업이 빠지면 «2학년 재량휴업(2학년) · 그 학년 수업 없음» 을 말한다. 시간표 화면은 요일 머리에 같은 이름을 붙이고 그 학년 칸만 흐린다.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

#### Schedule (`src/components/schedule/`)
- **핵심 파일**: `ScheduleCalendar.tsx`(진입점, viewMode 월/주/일·계획표 분기·상세/이동 다이얼로그 소유), `ScheduleDailyPlanView.tsx`(일별 계획표), `ScheduleCreateDialog.tsx`(6종), `ScheduleDetailDialog.tsx`, 순수 로직 `lib/scheduleUtils.ts`
- **주의**: duty kind 라벨='업무' 통일(`EVENT_LABELS.duty`), 서류제출(document_submission) 일정 **신규 생성 중단**(열람·수정·삭제는 유지), 일괄 업무 CSV=한 행 담당자 여러 명(`lib/dutyCsv.ts`, RFC 4180), 연수 참석 서명=직접 서명 벡터 저장(`lib/signatureStrokes.ts`, DB 트리거 동기화), QR 서명은 링크일 뿐(로그인 필수)
- **일정 설문 (`src/features/schedule-survey/`, 2026-09-17 신설)**: 선택한 사용자에게 "어떤 날에 무슨 일을 하면 좋을지"를 물어 수합하고 그 결과로 일정을 만든다. 진입점 = 스케줄 헤더 `[일정 설문]`(미응답 배지) · 공지 본문 토큰 `[[survey:uuid|라벨]]` · 알림, 딥링크는 전부 `/schedule?survey=<id>`. **주최자 = 교사·직원·admin, 대상자 = 학생 포함**(학생은 응답만). 방식 = 주최자가 달력에서 후보 날짜를 고르고 응답자가 날짜마다 `[가능 + 할 일]`, 토글을 켜면 응답자도 날짜를 제안. 표 2개 = `schedule_survey`·`schedule_survey_response`(응답은 (설문,응답자) 1행 + items JSONB — 각자 자기 행만 쓰므로 동시 쓰기 유실이 없다). **결과 표 기본 정렬은 날짜순이 아니라 '가능 인원 많은 순'**이라 화면이 그 사실을 말한다. 일정 만들기는 `ScheduleCreateDialog` 재사용(`initialValues` 프롭 신설, 기본 유형 = **업무** — 학사일정은 담당자를 JSONB로 정규화하지 않아 명단이 남지 않는다)이고 **결과 모달 안에 중첩하지 않고 형제로 띄웠다 되돌린다**. 신원 해석은 **`current_actor_resource_ids()` 전역 단일 출처**(`collab_actor_resource_ids()`가 여기 위임 — 리팩터 전후 4개 역할 실측 동일). 회귀 = `npx tsx scripts/schedule-survey-test/run.mts`(49건), 상세·조용히 틀리는 자리 6종 = `docs/features/schedule-survey.md`
- **공지 열람 대상 지정 (2026-09-17)**: `department_notice.target_resource_ids`(UUID[], **NULL·빈 배열 = 전체 공개 = 기존 동작**) + SELECT 정책 확장. 설문 전용이 아니라 **공지 전반 기능**(사용자 결정) — 작성 모달의 `[열람 대상]` 스위치. ⚠ **학생은 이 표를 아예 못 읽으므로 학생 id를 넣어도 공지로는 도달하지 않는다**(알림을 쓸 것). 실측: 기존 공지 5건 가시성 변화 없음(교사·직원·admin 5 / 학생·anon 0), 대상 1명 지정 시 대상 교사 1·비대상 직원 0·작성자 admin 1
- **출장·개인일정 → 수업 교체·대체 = 「결강 처리」 (2026-09-28)**: 일정 시간에 걸린 내 수업을 **저장 뒤 이어서** 교체·대체로 처리한다(저장은 막지 않는다). 입구 3곳(생성 직후·일정 상세 `수업 처리 N/M`·출장 동행자 알림 `absence_lessons`)이 전부 전역 호스트 `AbsenceResolutionHost`(App 에 하나, `?absence=<일정 id>`)의 한 모달이다. 판정 단일 출처 = `src/lib/absenceLessons.ts` — **처리 상태는 저장하지 않고** 그날·그 교시에 내가 요청자인 `class_swap` 에서 계산한다. ⚠️ **개인일정의 제목·내용은 상대 선생님께 가지 않는다**(사유 = 「개인 사정」, `class_swap.meta` 에는 `absence_meeting_id`·`absence_kind` 뿐). 여러 날 일정은 다루지 않는다. 교체·대체 모달 3종은 선택 prop `absence` 로 결강일 고정·결강 구간 칸 차단·동행자 제외를 한다. 회귀 = `npx tsx scripts/absence-lessons-test/run.mts`(62건) + `run-screenshots.mjs`
- **머리글 [부가 기능] 드롭다운 (2026-09-28)**: 일정 설문 · 회의 가능 시간 검색 · 구글 캘린더 내보내기를 한 메뉴로 묶었다(`ScheduleHeader`). 미응답 설문 배지는 **메뉴 버튼 위**에 둔다(메뉴 안에만 두면 열기 전엔 안 보인다). 학생은 일정 설문 버튼 하나만 본다. 회의 가능 시간 검색은 **도구 모음에도 남아 있고** 컴포넌트는 `components/schedule/MeetingTimeSearchDialog.tsx` 한 벌을 두 곳이 공유한다. 메뉴에서 모달을 열 때는 `useDropdownDialog` 의 `triggerDialog` 를 거칠 것(메뉴가 닫힌 뒤에 열어야 aria-hidden 포커스 충돌이 없다)
- **일정 AI 도우미 (2026-09-30)**: 공지사항 AI 도우미와 같은 떠 있는 버튼 → 메모·공문에서 일정 초안 → **채워진 일정 추가 창**으로 이어진다(저장은 그 창). 로직 단일 출처 = `src/lib/scheduleDraft.ts` — 상대 날짜는 모델이 계산하지 않고 **프롬프트의 날짜표**에서 찾게 하고, 담당자는 교직원 명단과 **정확히 한 명 일치**할 때만 넣는다. 회귀 = `npx tsx scripts/schedule-draft-test/run.mts`
- **급식지도 명단 만들기 (2026-10-01)**: [부가 기능] 항목. 손 명단 113건을 시간표와 대조해 찾은 규칙 — **그 요일 3교시가 빈 교사만**(우연 50% vs 실제 4%) · 교장·교감·행정실·직원 제외, 비교과 포함 · **월이 아니라 이어지는 순환**(마지막 배정일이 오래된 사람부터) · 하루 2명(수학여행·현장체험학습 날 1명) · 휴업일·공휴일·**전 학년 시험일**(서로 다른 `N차고사` 둘 이상) 쉼 — 10월 공식 명단과 배정일·인원 완전 일치. **화면은 초안 검토용**(개인 일정·연수·행사 동참은 시스템이 모른다 — 사용자 지적): 칸별 문제 표시·맞바꾸기·되돌리기·달력 보기, 바꿀 사람은 **횟수가 아니라 마지막 감독일** 순. 규칙 단일 출처 = `src/lib/mealDuty.ts`. ⚠️ **과거 명단을 `meeting` 에서 직접 읽지 말 것** — duty 행 RLS 가 만든 사람·담당자에게만 보여 순환이 오류 없이 틀어진다 → RPC `get_meal_duty_history`. 회귀 = `npx tsx scripts/meal-duty-test/run.mts`(62건) + `run-screenshots.mjs`, 상세 = `docs/features/meal-duty.md`
- **자습 감독 배정 (2026-10-11)**: [부가 기능] 항목. 학년부장(`N학년 부장`)·담임(`N학년 N반`) 태그가 **자기 학년**의 한 달 감독 초안을 만들고 고쳐 duty 일정으로 만든다(관리자는 전 학년, 학생·직원은 메뉴 없음). 사용자 결정 — 감독 단위 = **학년·하루 1명**, 시간대 = 아침·저녁(월~금)·토요일(그 학년에 토요 열람실이 있을 때 = 3학년), 아침은 «저녁과 다른 사람 / 그날 저녁 감독이 함께» 중 선택, 공정 기준 = **학년도 누적 횟수 균등(시간대별로 따로) + 요일 분산**, 교체 = **상대 수락 즉시**(학년부장은 알림만). 대상 = `N학년부` 부서(그 학년도) ∪ 담임·학년부장 태그. 자습 시간은 seaton `study_rooms` 에서(아침 = 이름에 `아침` — seaton 통계 계약과 같은 규칙). 쉬는 날은 `schoolDay.ts`(시험일은 배정하되 표시). 감독 일정 표지 = `meta.supervision` — ⚠ 이력은 **RPC 로만** 읽는다(duty RLS). 규칙 단일 출처 = `src/lib/selfStudySupervision.ts`, 화면 = `features/self-study-supervision/`, 알림 → `/schedule?supervision=swap`. **2026-10-12**: [전 학년 아침] 통합 당번(`meta.supervision.grade = 0` — 세 학년 명단의 합, 수능일부터 3학년 자동 제외, 학년 화면 아침 방식 «전 학년 통합 당번») + **못 하는 날** 표 `supervision_unavailability`(매주 요일 또는 특정 날짜 × 시간대 — 자동 배정이 피함, 쓰기 = 본인 ∨ 교사·관리자, 삭제는 행 수 확인). 회귀 = `npx tsx scripts/self-study-supervision-test/run.mts` + `run-screenshots.mjs`, 상세 = `docs/features/self-study-supervision.md`
- **명단 출력 — 급식지도·자습 감독 (2026-10-11)**: 두 명단 창 푸터의 [출력] → 새 창(A4 가로) = 그 달 **달력 한 장**(이미 만든 일정 + 지금 초안, **쉬는 날은 빈칸이 아니라 이유**). 선생님별 표는 사용자 결정으로 뺐다. 문서 만들기 단일 출처 = `src/lib/dutyRosterPrint.ts`(`buildDutyRosterDocument`·`openPrintDocument` — 창은 **클릭 흐름 안에서** 연다, 비동기 뒤면 팝업 차단). 이름은 HTML 이스케이프. 회귀 = `npx tsx scripts/duty-roster-print-test/run.mts`
- **담임 반 학생 생일 (2026-10-11)**: 담임 태그(`N학년 N반`)가 있는 교사의 달력에 반 학생 생일을 **가상 일정**으로 띄운다(`meeting` 에 저장하지 않는다 — 해마다 반 배정이 바뀐다). 출처 = `resource.meta.birthday`(재학생, YYYY-MM-DD), 하루 여러 명은 한 칸(`🎂 정시우 외 2명`), 2/29생은 평년 2/28. 클릭 = 읽기 전용 명단 창(`HomeroomBirthdayDialog`) — ⚠️ 일정 상세 창·[일정 이동]·**구글 캘린더 내보내기로 새지 않게** `isBirthdayEvent` 로 막는다(마지막은 학생 개인정보가 외부로 나간다). 단일 출처 = `src/lib/homeroomBirthdays.ts`, 훅 = `features/schedule-birthdays/useHomeroomBirthdays.ts`, 회귀 = `npx tsx scripts/homeroom-birthday-test/run.mts`(26건)
- 상세 = `docs/features/schedule.md`, 일정 설문 = `docs/features/schedule-survey.md`

## 2026-10-25 — 연수 참석자별 로그인 없는 서명 링크

- 사용자 결정: 앞으로 만드는 연수만 · 기한 기본 = 연수 마지막 날 + 7일(만든 사람이 웹·MCP `set_training_sign_link_expiry` 로 바꾼다) ·
  전달 = 만든 사람이 연수 상세 «서명 링크»에서 복사(개별·모두 복사 = «이름: 주소» 줄, 서명한 사람 제외) + **연수 알림은 QR 만**(누르면 `/training-sign-qr/:id`
  — PC 로 알림을 연 선생님이 휴대폰으로 찍어 로그인 없이 서명) · 목록은 만든 사람·관리자만.
- 화면: `TrainingSignLinksPanel`(상세, 만든 사람·관리자) · `pages/TrainingSignLink.tsx`(`/training-sign-link/:token`, public — «○○님의 서명란» 먼저) ·
  `pages/TrainingSignQr.tsx`(내 QR, 로그인) · 서비스 `services/trainingSignLinkService.ts`. 알림 목적지 = `notificationNavigation.ts`(`schedule_created` + `meta.meeting_kind`).
- 링크 서명은 같은 표(`training_signature`, `source='link'`, `user_id` 없음)라 서명 현황·출력이 그대로 보인다. ⚠️ 링크로 서명한 사람이 앱에서 «다시 서명»하면
  본인 행 UPDATE 정책(user_id = 나)에 걸린다 — 만든 사람이 그 서명을 지우고 다시 받게 한다.
- MCP: 링크(토큰)는 에이전트에게 내보내지 않는다(링크 = 신원). 스키마·권한 = `docs/database/core.md` §5b.
- **(같은 날 고침 — 사용자 피드백)** 링크가 있는 연수는 기존 «서명하기»·«QR로 서명받기»를 쓰지 않고 **로그인 없는 서명만** 쓴다. 상세의 연수 칸은
  서명할 당사자 = **내 서명 QR**(서명했으면 내 서명), 만든 사람·관리자 = **참석자별 QR 격자**(눌러서 크게) + 기한. «모두 복사»·«링크 복사»는 없앴다(QR 로 대체).
  «내 서명 QR» 화면의 «이 기기에서 서명»도 로그인 없는 서명 화면으로 간다. 링크 없는 옛 연수는 기존 방식 그대로(`useTrainingSignLinks().data.enabled`).
- **(같은 날 다시 고침)** 만든 사람·관리자 칸은 참석자별 QR 대신 **서명 여부(서명·대기)만** — 각자 자기 QR 로 서명하므로 만든 사람에게 필요한 것은 누가 했는지뿐(사용자 결정).
  서버 `get_training_sign_links` 는 만든 사람에게 여전히 전원의 토큰을 준다(MCP `get_training_sign_links` 가 주소를 쓰기 때문 — 웹 화면만 안 보인다).
