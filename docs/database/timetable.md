# 운영 시간표 · 시간표 생성 · 시험 시간표

운영 중인 주간 시간표(student_timetable / teacher_timetable), 수업 시간표 자동 생성(timetable-generator),
시험 시간표(exam-schedule) 테이블.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## 운영 시간표 (학기 단위)

**2026-07-28 전환**: 사용자 화면(교사·학생 시간표, 오늘의 시간표, 수업 학생 명단, 대체 교사 조회,
수업 교체 후보)이 읽는 **정본은 아래 정규화 테이블**이다. 이전에는 학기 개념이 없는
`resource.meta.section`(교사) / `resource.meta.timetable`(학생) 스냅샷을 읽었다.

어느 학기를 표시할지는 **학사력**(`system_settings.academic_term`, 시스템 설정 → 학사력 설정)이
결정한다. 클라이언트 해석기 = `src/hooks/useTimetableTerm.ts`
(학사력 → 없으면 `get_latest_timetable_term()` 폴백 → 없으면 null).

### student_timetable
- 학생 × 요일 × 교시 주간 시간표. **UNIQUE (academic_year, semester, resource_id, day_of_week, period)**
- 컬럼: `academic_year`, `semester`, `resource_id`(→resource, CASCADE), `student_grade`(1~3), `student_class`, `student_no`, `student_name`, `day_of_week`(1~5), `period`(1~10), `subject`, `teacher_name`, `curriculum_id`(→school_curriculum), `course_offering_id`, `teacher_resource_id`, `meta`
- 적재: 학생 시간표 xlsx 업로드(`saveStudentTimetables`) 또는 `finalizeTimetablePlan`. 같은 학기 기존 행 삭제 후 재INSERT
- 읽기: `useStudentTimetable`, `useTodayTimetable`(학생 분기), `student_timetable_flat` MV

### teacher_timetable
- 교사 × 요일 × 교시 주간 시간표. **UNIQUE (academic_year, semester, teacher_name, day_of_week, period)**
- 컬럼: `academic_year`, `semester`, `day_of_week`(1~7), `period`(1~9), `grade`(1~3), `subject_name`, `class_label`, `activity_type`, `credits`, `teacher_name`, `teacher_resource_id`, `school_curriculum_id`, `course_offering_id`, `meta`
- 읽기: `useTimetableData`(교사 시간표 화면), `useTodayTimetable`(교사 분기), `useAvailableTeachers`, `get_teacher_timetables_for_swap`, `supervisionService`(시험 감독)
- **섹션명 파생**: `resource.meta.section` 키와 동일한 문자열은 `${subject_name} ${grade}-${class_label}` 로 재구성한다. 단일 출처 = `src/lib/timetableSource.ts` `teacherSectionName()` + 마이그레이션 `20260728010000` 의 SQL 파생식. 라이브 2026-1 실측으로 (교사, 섹션명) 387쌍이 `meta.section` 키 집합과 **양방향 차이 0** 확인
- **주의: `class_label` 은 자유 문자열**이다. `"3"` 같은 숫자 반이 대부분이지만 `"3학년 4반 한문"` 같은 비표준 값이 6행 있다. 학년·반 숫자가 필요하면 파싱하지 말고 파생 섹션명으로 `section` 테이블을 조인해 `section.meta->>'grade'`/`->>'class'` 를 쓸 것(구 구현과 동일 경로). 폴백이 필요한 곳에서만 `classNumberFromLabel()`(`src/lib/timetableSource.ts`) 사용

### section 의존성 — 새 학기마다 행을 만들어야 한다 (2026-08-14)
`section` 은 **학년도·학기 컬럼이 없는 레거시 표**인데, 학년/반과 `section_id` 의 정본이라
아래가 전부 여기에 매여 있다.
- `get_teacher_timetables_for_swap` 의 **INNER JOIN**(section 행이 없으면 그 슬롯은 후보에서 사라진다)
- `useTimetableData` 의 `grade` / `class_number` / `section_id`
- `class_swap.requester_section_id` / `approver_section_id` — **NOT NULL + FK**

**실제 사고**: 2026-2 시간표를 올렸지만 `section` 은 2026-03-05(2026-1 업로드) 이후 갱신된 적이
없어 2학기 신설 과목 **216개 분반의 행이 없었다** → teacher_timetable 884행 중 205행만 조인되고,
남은 205행마저 타입 불일치로 걸러져 **수업 교체 후보가 항상 0건**이었다.
- 백필 = 마이그레이션 `20260814090000_backfill_section_from_teacher_timetable.sql`(멱등)
- 재발 방지 = `TeacherTimetableUploadDialog` 의 `ensureSectionRows()` — 업로드 학기의 분반 중
  없는 것만 생성(best-effort, INSERT RLS 는 admin 전용이라 실패해도 적재를 되돌리지 않는다)
- **이름은 반드시 `teacherSectionName()` 규칙과 같아야 한다** — `section` 의 SELECT RLS
  (`user_can_access_section`)가 교사의 `resource.meta.section` **키 문자열 일치**로 판정하므로,
  이름이 어긋나면 행을 만들어도 그 교사에게 보이지 않는다

### 창체는 교체 대상이 아니다 — 단, 서버에서 거르지 말 것 (2026-08-14)
동아리활동·자율/자치활동·진로활동은 수업 교체 후보가 아니다(사용자 결정). 판정 정본은
`teacher_timetable.activity_type`(라이브 전 행이 `subject|club|career|autonomy` 로 채워져 있다)이고,
값이 없는 경로만 과목명으로 폴백한다(`timetableSwapUtils.isSwappableLesson`).

**`get_teacher_timetables_for_swap` 에서 창체 행을 빼면 안 된다.** 이 RPC 결과는 후보 목록뿐
아니라 **시간 충돌 판정과 교사 부담 계산의 모집단**으로도 쓰인다 — 창체를 빼면 그 시간에
동아리를 맡은 교사가 비어 있는 것으로 보여 실제로 겹치는 교체를 제안하게 된다.
값만 내려주고 거르는 일은 클라이언트의 **후보 목록에서만** 한다.

**DROP + CREATE 시 권한 주의**: `RETURNS TABLE` 을 바꾸려면 `CREATE OR REPLACE` 가 안 되어
DROP 이 필요한데, 새로 만든 함수에는 Postgres 가 **PUBLIC EXECUTE 를 기본 부여**한다.
이 함수는 SECURITY DEFINER 라 RLS 를 우회하므로 `REVOKE ... FROM PUBLIC, anon` 을 반드시
같이 넣어야 한다(원래 ACL = `{postgres, authenticated, service_role}`).

### 학년·반 표기 정합 (2026-08-14)
`section.meta.grade` / `meta.class` 는 라이브에서 **JSON 숫자**다(문자열이 아니다). 출처마다
표기가 갈리므로 `TimetableEntry` 로 올라올 때 **grade=숫자 / class_number=문자열**로 통일한다
(`useTimetableData` 의 `toGradeNumber`/`toClassText`, `useSwapCandidates` 의 `String(...)`).
`3 !== '3'` 이 되면 `findSwappableClasses` 가 **모든 후보를 조용히 버린다** — 그래서 비교는
`timetableSwapUtils.sameClassroom()` 이 정규화해 흡수한다.

### 운영 시간표 — 기간 한정 임시 시간표 (2026-10-26)
시험 기간·수능 대비·학교 전체 특수 교육과정처럼 **며칠~몇 주 동안만** 수업 배치가 바뀌는 경우.
정규 시간표(`teacher_timetable`)는 학기를 대표하는 기록이라 **고치지도 지우지도 않고**, 기간·대상 학년의
수업만 운영 시간표로 덮는다(사용자 결정 — 운영 시간표는 «대표성을 띄는 정규 시간표가 아닌» 운영용).

- **`timetable_override`** — `title`, `kind`(exam·csat·special·other), `academic_year`, `semester`, `start_date`~`end_date`(끝 날 포함, 최대 366일), `grades smallint[]`(**null = 전 학년**), `status`(active·archived — 끄기는 기록을 남긴 채 판정에서만 빠진다), `note`
  - 트리거 `timetable_override_guard` — 같은 학기·**겹치는 기간·겹치는 학년**에 active 가 둘이면 23P01 거부(어느 쪽이 맞는지 정해지지 않으므로)
- **`timetable_override_slot`** — `teacher_timetable` 과 같은 모양(요일·교시·학년·`class_label`·`subject_name`·`activity_type`·교사). **`subject_name` 은 비어 있을 수 있다**(과목 없이 그 반에 들어가는 칸 — 예: 담임 자습). UNIQUE (override, 교사, 요일, 교시)
  - 트리거 `timetable_override_slot_guard` — 칸의 학년이 대상 학년 밖이면 23514(밖이면 정규 수업과 겹쳐 두 번 보인다)
- RLS = `teacher_timetable` 과 같다(읽기 = 로그인, 쓰기 = admin). anon 권한 없음
- **판정 단일 출처 = `teacher_timetable_effective(year, semester, from, to, teacher_resource_id?)`** (INVOKER, 날짜별로 펼친 행, 최대 63일): 날짜 D 에 active 인 운영 시간표가 있으면 그 grades 의 정규 수업을 빼고 운영 칸을 더한다. 대상 밖 학년의 정규 수업은 그대로. **칸이 없는 운영 시간표도 그 학년 정규 수업을 가린다** — 저장(`createTimetableOverride`)은 칸 넣기가 실패하면 머리 행을 지운다
- 날짜마다 따로 판정하므로 기간 경계에 걸친 주도 맞다(예: 11-16 주 = 월~수만 운영)

**누가 운영 시간표를 따르나 (운영 화면)** — 교사 주간 시간표(`useTimetableData`)·오늘의 시간표(`useTodayTimetable`)·대체 교사(`useAvailableTeachers` — 날짜를 모르면 다가오는 그 요일)·출장 결강 알림(`absenceLessonService`)·결강 처리 모달·MCP `timetable_of`(요일 시간표 = 오늘부터 7일)·`mcp_find_meeting_times`.
**정규를 그대로 읽는 곳 (대표)** — 수업 그룹(`audience_teaching_rows`·`subject_group_catalog`)·교과 분석·시간표 생성기·시험 감독 과목 담당·학생 시간표(`student_timetable`)·수업 학생 명단.
**아직 정규만 보는 운영 기능 (2026-10-26 현재, 후속)** — 수업 교체 후보·교체 신청(`get_teacher_timetables_for_swap`·`get_swap_roster_fit`·`mcp_request_class_swap`·`mcp_swap_sources` — `section`·학생 명단에 묶여 있어 운영 칸을 넣으려면 설계가 더 필요) · MCP `tt_my_lesson`(수업 메모·수업 학생) · `mcp_request_substitute` 의 상대 교사 수업 판정 · 급식지도 후보의 3교시 수업(`mcp_meal_duty_sources`·`useMealDutySources`) · 다마고찌 시간표.

- 화면: Admin ▸ 교사 시간표 관리 «운영 시간표»(`TimetableOverridePanel` — 만들기·끄기·지우기). 엑셀 = 격자형(시트 = 요일, 첫 행 = «3학년 1반», 왼쪽 열 = «1교시», 칸 = «과목(교사)» 또는 이름만), 파서 `src/lib/timetableOverride.ts` `parseOverrideGrid`, 재직 교직원 한 명으로 정해지지 않는 이름은 화면에서 바로잡는다
- 시드 도구 `scripts/timetable-override-test/build-seed.mts`(같은 파서로 엑셀 → SQL, `--fix 오타=이름`)
- 회귀: `npx tsx scripts/timetable-override-test/run.mts`(파서) · `supabase/tests/timetable_override.sql`(판정·권한, rollback)
- 첫 사례: «3학년 수능 대비 운영 시간표» 2026-10-26 ~ 11-18(수능 당일 미등교), grades {3}, 315칸 — 이동수업이 사라져 3학년 교사의 들어가는 반이 바뀌었다. 학생 시간표는 바꾸지 않았다(사용자: 학생은 상관없다)

### student_timetable_flat (MV)
- `student_timetable` × `resource` 조인 평탄화. 컬럼: `resource_id`, `student_name`, `student_code`, `grade`, `class_num`, `number`, `picture`, `day_of_week`, `period`, `subject`, `teacher_name`, **`academic_year`, `semester`**
- 인적사항(`student_name`/`student_code`/`picture`)은 **`resource` 에서** 가져온다 — 졸업생 익명화(`process_graduated_student_cohort`)가 `resource.name` 을 별칭으로 바꾸므로 `student_timetable.student_name` 을 쓰면 익명화가 우회된다
- 유니크 인덱스 `idx_stf_unique (academic_year, semester, resource_id, day_of_week, period)` — `REFRESH MATERIALIZED VIEW CONCURRENTLY` 요구사항이며 학기가 포함돼야 여러 학기 공존 시 위반이 안 난다
- 갱신: `refresh_student_timetable_flat()` RPC (업로드 후 자동 호출)
- **GRANT 없음**: MV 는 RLS 를 가질 수 없어 `authenticated` 에 SELECT 를 주지 않는다. 학생이 전교생 명단을 긁는 것을 막기 위해 아래 DEFINER RPC 로만 읽는다

### 관련 RPC
| RPC | 용도 |
|-----|------|
| `get_latest_timetable_term()` | 정규화 시간표에 존재하는 최신 (학년도, 학기). 학사력 미설정 시 클라이언트 폴백 |
| `get_section_students(p_teacher_name, p_day_of_week, p_period, p_academic_year, p_semester)` | 해당 수업 학생 명단. SECURITY DEFINER + 교사/admin 게이트 |
| `get_teacher_timetables_for_swap(target_grade, target_class, p_academic_year, p_semester)` | 수업 교체 후보용 전체 교사 시간표(해당 학기). `target_grade`/`target_class` 는 **본문에서 쓰이지 않고** 클라이언트가 필터링한다(구 정의도 동일). 2026-08-14 반환에 `activity_type` 추가 — 창체 제외 판정용이며 **서버에서 거르지 않는다**(아래 참조) |
| `get_swap_roster_fit(p_teacher_resource_id, p_day_of_week, p_period, p_academic_year, p_semester)` | **수업 교체 후보의 수강생 판정** (2026-10-12). 내 수업과 학생이 겹치거나 학년-반 표기가 같은 다른 교사의 수업마다 내/상대/같은 학생 수 + 맞바꾸면 시간이 겹치는 학생 수(양방향)와 이름 표본 3명. 명단 = `student_timetable` 의 (요일, 교시, `teacher_resource_id`) — "학생 x 가 수업 L 에 있다 ⇔ x 의 L 시각 행의 교사가 L 의 교사"라 모든 판정이 유니크 인덱스 조회 한 번(따뜻한 호출 ~150ms). 교사·관리자 전용(학생 42501, anon EXECUTE 없음) |
| `refresh_student_timetable_flat()` | MV 갱신 (CONCURRENTLY) |

### resource.meta dual-write (legacy)
업로드는 정규화 테이블과 `resource.meta` 양쪽에 쓰지만, **`meta` 는 학기 필드가 없는 단일
스냅샷이라 "현행 학기"만 담을 수 있다.** 그래서 업로드 학기가 학사력과 다르면 `meta` 갱신을
건너뛴다(`SaveOptions.syncResourceMeta`, 교사 다이얼로그의 `isCurrentTerm`).

`meta` 를 아직 읽는 곳: 교사 CSV import(`ResourceCsvImport`), 리소스 관리 백업·학년 태그 추출,
회의 가능시간 검색(`MeetingTimeSearchDialog`), 시험 감독 분반 수 보조 소스(`supervisionService`).
이들은 모두 "현행 학기" 의미로 동작하므로 위 규칙과 정합한다.

---

## 시간표 생성 (timetable-generator)

### timetable_plan
- 새 학기 수업 시간표 자동 생성기의 초안/확정 저장소 (JSONB). `exam_schedule` 패턴 미러링.
- 컬럼: `academic_year`, `semester`, `title`, `status`('draft'|'finalized'|'archived'), `input_payload`(TimetableInput — studentCodes 제거), `candidates`(TimetableCandidate[]), `selected_candidate_id`, `finalized_placements`(Placement[]), `diagnostics`, `created_by`(resource.id)
- RLS: teacher/admin select·insert, admin 또는 작성자 update·delete (user_resource 경유)
- 확정(`finalizeTimetablePlan`) 시 placements를 `student_timetable`(학생×칸)·`teacher_timetable`(교사×칸)로 전개. `meta.source='timetable-generator'`·`plan_id` 태깅 → 외부 출처 행 보호(대상 학기에 우리 아닌 행이 있으면 replaceExisting 없이 거부, 우리 행만 삭제 후 재기록).
- 생성 입력: `course_offering`(개설 강좌) + `student_enrollment`(수강 명단). 창체(자율·동아리·진로)는 배치 제외.

### course_offering.meta.teacher_split (공동수업 교사 분담)
- **문제**: 한 반/섹션의 4학점 수업을 여러 교사가 나눠 가르칠 때(팀티칭), `course_offering`은 교사마다 별도 행을 두고 **각 행에 full credits(4)**를 기록한다. 명단(`student_enrollment`)은 한 행(roster-bearing)에만 있고 공동교사 행은 비어 있다. 그래서 생성기는 (a) 명단 없는 공동교사 행을 건너뛰고 (b) roster-bearing 교사에게 4교시 전부를 배정 → 실제 분담(예: 이지유 2 + 장은호 2)과 불일치. 게다가 분담은 **불균등**할 수 있어(통합사회1 강시우 3 + 장은호 1) round-robin으로 복원 불가.
- **해결**: 실제 분담은 2026-1 `teacher_timetable`(실 생성 시간표)에 있다. (학년·과목·정규화 반)별 교사 시수를 집계해 **roster-bearing 행의 `meta.teacher_split`** = `[{teacher_resource_id, teacher_name, lessons}]`(lessons 합=credits)로 기록(추가·가역적). `buildInput`이 split이 있으면 라운드로빈/단일 교사 대신 **교사별 lessons만큼 배분**(공통·선택 경로 모두), 명단 없는 공동교사 행은 무시. 확정(`finalizeTimetablePlan`)은 lesson별 실제 교사로 `teacher_timetable` 기록(`expandPlacementsToRows`의 `lessonTeacher` 맵).
- **진로활동**: 명단(roster)이 없어 **실제 담당 교사 행**(teacher_timetable 기준, 보통 학년 진로코디 — 1학년 정채원·2학년 신이안·3학년 이다인/류은호/정채원)에 split을 기록. round-robin이 담임/코디를 임의로 고르던 문제 해결 → 설정된 실제 교사로 고정. 배치 자체는 `classRoster` 보정(반 전체) 유지.
- 적용 backfill: 2026-1 총 **46행** — 공동수업 19섹션(통합과학1 9·통합사회1 8·세계사 2) + 진로활동 27(9반×3학년). 되돌리기: `update course_offering set meta = meta - 'teacher_split' where academic_year=2026 and semester=1`.

## Exam Schedule (시험 시간표)

### exam_schedule
**Purpose**: 시험 시간표 생성 결과 저장 (전 학년 통합 또는 단일 학년) + 감독 교사 배정

#### Columns:
- `id` (UUID, PK)
- `grade` (SMALLINT, NOT NULL): **0 = 복수 학년 통합(전학년)**, 1~3 = 단일 학년. CHECK (0,1,2,3). 포함 학년 상세는 `input_payload.grades` 참조 (마이그레이션 `exam_schedule_allow_multi_grade`)
- `title` (TEXT)
- `status` (TEXT): 'draft' | 'finalized' | 'archived'
- `exam_type` (TEXT, DEFAULT 'regular'): **'regular' = 정규고사(CSP 생성), 'mock' = 모의고사(감독 배정 전용)**. CHECK (regular, mock) (마이그레이션 `exam_schedule_supervision_support`)
- `input_payload` (JSONB): regular = `ExamScheduleInput` v2 — `{grades, gradeInputs{1..3}, supervision, options, weights}` (v1 레거시 `{grade, gradeInput, ...}` 행도 존재, 클라이언트 `normalizeScheduleInput()`이 양쪽 처리). mock = `MockExamInput` — `{kind:'mock', grades, classCountByGrade, periodsByGrade}`. **studentCodes는 PII 보호를 위해 저장 전 제거됨**
- `candidates` (JSONB): TOP 5 후보 배열 (`grades`, `dayConfigsByGrade`, scoreBreakdown, metrics 포함). mock 행은 빈 배열
- `selected_candidate_id` (TEXT), `finalized_assignments` (JSONB), `diagnostics` (JSONB)
- `supervisor_assignments` (JSONB): 감독 배정 plan `SupervisorPlan` — `{version:1, examType, rooms:[{roomId, dayIndex, period, label, kind:'classroom'|'pool', grade, classNum, subjectIds, subjectNames, teachers:[{id,name}|null], homeroomRequired?}], excludedTeacherIds?}`. teachers[i].id = resource.id, excludedTeacherIds = 이 시험 한정 제외 교사 (마이그레이션 `exam_schedule_supervision_support`)
- `created_by` (UUID → resource.id), `created_at`, `updated_at`

#### Supervision (감독 인력·시험실 제약) — input_payload.supervision:
- `{enabled, availableSupervisors, supervisorsPerRoom, classCountByGrade, roomTiers, hard}`
- 시험실 산정: **공통(전체 응시) 과목 = 학년 반 수**(`classCountByGrade`, 각 반에서 응시), **선택과목 = 자기 학년 일반 교실(classCountByGrade 중 공통과목 미점유분) 먼저 + 공유 고사실 풀**(`roomTiers: [{capacity, count}]`)에서 greedy 배정 (1실=1과목). 선택과목은 자기 학년 교실도 쓸 수 있으므로 작은 공유 풀에 갇히지 않음 (감독 HARD CSP 막힘 방지)
- 슬롯(일차×교시)별 감독 수요 = 전 학년 합산 (반 시험실 + 고사실) × supervisorsPerRoom ≤ 가용 인원, 고사실 풀 수용 가능 여부(fits)도 hard 제약
- v2 저장본의 단일 `roomCapacity`는 클라이언트 `normalizeSupervision()`이 티어로 변환
- 가용 인원 기본값은 `resource(type='teacher')` 수, 학년별 반 수 기본값은 `student_basic_info` distinct class_num 집계

#### RPC: get_exam_subject_candidates(p_grade)
- 학년 총원·공통과목 판정 분모 = **resource 학년 재적 전체** (timetable 유무 무관 — 전입생 포함)
- 공통(is_universal, 응시율 ≥95%) 과목의 student_codes = 학년 재적 전체 (timetable 없는 전입생도 전체 응시 과목은 응시하므로)
- 선택과목 student_codes = resource.meta.timetable 기반 실제 수강자 (timetable 없는 학생의 선택과목은 알 수 없음 — 한계)
- 마이그레이션 `exam_subject_candidates_full_cohort`

#### 감독 배정 데이터 소스 (클라이언트 조합)
- 과목 담당 교사: **`teacher_timetable`(최신 학년도·학기, 1차 소스)** — `${subject_name}|${grade}`별 distinct `class_label` 수 + `resource.meta.section` 키 파싱(보조)을 키별 max로 병합. section 키는 `"과목명 학년-분반"` 형식이되 분반은 자유 문자열 허용 (예: `"한문Ⅱ 3-3학년 1반 한문"` — 숫자 반 형식 `"한문 2-1"`만 가정하면 파싱 실패)
- 담임: `resource_tags`의 `"N학년 M반"` 태그 + `resource_tag_assignments` (태그 시스템이 단일 진실)
- 누적 감독 횟수: **finalized 상태**인 행들의 `supervisor_assignments` 좌석 수 합산 + `exam_supervision_adjustment` delta 합
- **감독 제외 (고정)**: ① `resource.meta.exclude_supervision = true` 교사 (테스트 계정 "교사A"), ② **`resource_tags` '학교관리자'·'고사운영교사' 태그** 교사 — 둘 다 배정 대상·좌석 선택·부담 요약에서 완전히 제외. 새 고정 제외는 태그 부착으로 처리 (코드 수정 불필요)
- **감독 제외 (시험별 임시)**: 감독 배정 화면의 "제외 교사" 선택 — `supervisor_assignments.excludedTeacherIds`로 저장 (출제·출장 등)
- **일일 상한**: 한 교사는 같은 날 최대 **2회** 감독 기본, 그날 시험이 **4교시 이상이면 3회**까지 (정규·모의 공통). 단 **3개 교시 연속 감독은 금지**. 자동 배정이 hard로 지키고(`canPlace`), 수동 편집 위반은 validatePlan이 경고(`dailyCap`·`consecutive`)

### exam_supervision_adjustment
**Purpose**: 교사별 누적 감독 횟수 수동 보정 (시스템 외 과거 감독 이력 이관·수기 조정, append-only ledger)

#### Columns:
- `id` (UUID, PK)
- `teacher_resource_id` (UUID, NOT NULL → resource.id, ON DELETE CASCADE)
- `delta` (INTEGER, NOT NULL): 보정값 (음수 가능 — 취소는 역방향 delta 추가가 원칙)
- `reason` (TEXT), `created_by` (UUID), `created_at`

#### RLS:
- SELECT/INSERT: teacher/admin, DELETE: admin only
- 마이그레이션 `exam_schedule_supervision_support`

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 운영 시간표: 학기 단위 전환 (2026-07-28)
- **정본 = 정규화 테이블**: 사용자 화면(교사·학생 시간표, 오늘의 시간표, 수업 학생 명단, 대체 교사 조회, 수업 교체 후보)이 `resource.meta.section`/`resource.meta.timetable` → **`teacher_timetable`/`student_timetable`**(학년도·학기 키)로 전환됨. 마이그레이션 `20260728010000_timetable_academic_term.sql`
- **어느 학기를 볼지는 학사력이 결정**: `src/hooks/useTimetableTerm.ts`가 단일 해석기 — 학사력(`system_settings.academic_term`) → 없으면 `get_latest_timetable_term()` 최신 학기 폴백 → 없으면 null. **시간표 화면엔 학기 선택 UI 없음**(사용자 결정): 항상 학사력 학기를 본다. 과거 학기 열람은 관리자 "학생/교사 시간표 관리" 탭 드롭다운
- **섹션명은 파생**: `meta.section` 키와 동일한 문자열 = `${subject_name} ${grade}-${class_label}`. 단일 출처 = `src/lib/timetableSource.ts` `teacherSectionName()`(+ 마이그레이션 SQL의 같은 식). 라이브 2026-1 실측 등가: (교사, 섹션명) 387쌍 양방향 차이 0, 슬롯 집합 차이 0. 학생 쪽은 정규화 테이블이 **상위집합**(meta에만 있는 행 0, 테이블에만 32행 = meta.timetable이 없어 시간표가 안 보이던 학생 1명 복구)
- **학년·반 숫자는 `class_label`을 파싱하지 말 것**: 자유 문자열이라 `"3학년 4반 한문"` 같은 값이 6행 있다. 파생 섹션명으로 `section`을 조인해 `section.meta->>'grade'`/`->>'class'`를 쓴다(구 구현과 동일 경로 = 정확한 동등성). 교체 후보 RPC의 `section` 조인은 **INNER 유지** — `section` 행이 없는 분반 4개(12슬롯)는 오늘도 후보가 아니며, LEFT로 바꾸면 `section_id`가 null인 후보가 생겨 `class_swap` 삽입이 깨진다
- **RPC 시그니처 변경**: `get_section_students`·`get_teacher_timetables_for_swap`에 `p_academic_year`/`p_semester` 추가. **CREATE OR REPLACE가 아니라 DROP + CREATE**여야 한다(파라미터 추가는 오버로드를 만들고 PostgREST가 모호하다고 거부). `student_timetable_flat` MV도 `student_timetable` 기반으로 재정의(유니크 인덱스에 학기 포함 — `REFRESH ... CONCURRENTLY` 요구사항). MV는 여전히 `authenticated`에 GRANT 없음(DEFINER RPC로만 읽음), 인적사항은 익명화 우회 방지를 위해 `resource`에서 조인
- **시간표 업로드는 "지우고 다시 넣기"다 — 중간 실패가 데이터를 비운다 (2026-09-04)**: 학생은 학생별로, 교사는 **학기 전체**를 DELETE한 뒤 INSERT한다. 종전 학생 경로는 ①DELETE 결과를 검사하지 않고 ②INSERT가 실패해도 `saved++`가 분기 밖에서 실행됐으며 ③호출부가 `result.errors`를 **한 번도 읽지 않고** "저장 완료"를 띄우고 닫아, **시간표가 빈 학생이 성공으로 집계**됐다. 지금은 INSERT 성공 시에만 `saved++`하고, 삭제까지만 된 학생은 `wiped`로 따로 세어(='스킵'과 뜻이 다르다) 다이얼로그가 명단을 보여주고 **닫히지 않는다**. 교사 경로는 오류를 throw하긴 했지만 "기존 데이터가 이미 사라졌다"를 말하지 않아 관리자가 아무 일도 없었다고 오해했다 → `alreadyDeleted` 플래그로 문구를 가른다
- **비현행 학기 업로드 시 `resource.meta` 미갱신**: meta는 학기 필드가 없는 단일 스냅샷이라 "현행 학기"만 담을 수 있다. 업로드 학기 ≠ 학사력이면 건너뛴다(`SaveOptions.syncResourceMeta` / 교사 다이얼로그 `isCurrentTerm`). meta를 아직 읽는 곳 = 교사 CSV import·리소스 관리 백업/학년 태그·회의 가능시간 검색·시험 감독 보조 소스 (모두 "현행 학기" 의미라 정합)
- **시간표 메모의 `year`는 학년도**: `new Date().getFullYear()`(달력연도)를 쓰면 1~2월에 학년도 경계를 넘어 `class_student_memos` 유니크 키가 갈라진다 → 학사력 `year` 사용
- 상세 스키마 = `docs/database/timetable.md` "운영 시간표" 절
