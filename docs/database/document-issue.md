# 발급번호 관리 (Document Issue)

가정통신문·봉사활동(개인/반) 문서의 발급번호 연도별 자동 채번 + 발급 대장.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## 개요

`src/features/issue-register`. 교사/관리자가 가정통신문·봉사활동 문서를 발급하면 연도별 발급번호(`YYYY-NNN`)를 자동 채번하고, 전체 발급 대장을 리스트로 관리한다. 반별 봉사활동은 제출 내용으로 HWPX 확인서 양식을 자동 생성·다운로드한다(`hwpx/generateVolunteerHwpx.ts`, jszip 템플릿 행 clone).

### 문서 유형 (`doc_type`)
- `gajeong` — 가정통신문 (학생 정보 없이 제목·발급일·부서)
- `volunteer_personal` — 개인 봉사활동 (학생 1명 = 발급번호 1개, **HWPX 양식 생성 대상**). 발급 모달에서 여러 학생을 다중 선택해 입력 편의를 제공하지만, 저장은 학생별로 분리된 행이며 같은 제출 묶음은 `meta.batch_id`로 그룹핑된다(아래 참고)
- `volunteer_class` — 단체(반) 봉사활동 (학생 N명 = 발급번호 1개, HWPX 양식 생성 대상). UI 라벨은 "단체"(과거 "반별")
- `volunteer_club` — 동아리 단체 봉사활동 (발급 1건이 **여러 동아리** 포함 가능, **별도 HWPX 양식**). 명단·담당교사는 `club_info`에서 자동 로드, 활동(날짜·시간·내용)은 발급 후 **대장 아코디언의 각 동아리 행**에서 작성. 다운로드는 학생×일자 참가 매트릭스 미리보기 경유

### 번호 체계 (`number_space`)
- `volunteer` — 개인 + 단체(반) + 동아리 봉사활동 **공유** 시퀀스
- `gajeong` — 가정통신문 **별도** 시퀀스

연도별로 독립된 시퀀스이며, 같은 연도 안에서 `volunteer`와 `gajeong`은 각각 `2025-001`부터 시작한다.

---

## 테이블

### document_issue
**Purpose**: 발급 대장 (한 행 = 한 발급 건; 반봉사는 1행이 N명 학생 포함)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key (default: `gen_random_uuid()`)
- `status` (TEXT, default `'active'`): `'active'` | `'cancelled'` (CHECK 제약). **소프트 삭제** — 대장에서 "삭제" 버튼은 실제 DELETE가 아니라 이 컬럼을 `'cancelled'`로 바꾸는 UPDATE(`issueService.cancelIssue`, 단건)만 수행한다. 취소된 행은 삭제하지 않고 그대로 남겨 `issue_no`가 결번처럼 보이지 않게 하되(감사 추적·발급번호 연속성 보존), 대장 UI(`IssueLedger`)는 취소된 행을 발급번호 + "삭제된 발급" 배지만 보이도록 나머지 내용(제목·명단·부서 등)을 렌더링에서 숨긴다. 권한은 기존 `document_issue_update` RLS(작성자 본인 또는 admin)를 그대로 재사용 — 별도 정책 불필요. 개인봉사 배치(`meta.batch_id`)는 배치 안 전원이 취소돼야 대표 행이 "완전 취소"로 표시되고, 일부만 취소되면 그 학생 하위 행만 `IssuePersonalRows`에서 취소 표시된다. **일괄 삭제**: 배치(같은 `batch_id`)를 한 번에 취소하는 `issueService.cancelIssues(ids)`(`update ... where id in (...) and status='active'`, 1회 라운드트립)도 있음 — 대장 대표 행의 "배치 전체 삭제" 버튼(다운로드 버튼과 동일 위치)이 배치 내 활성 발급 id 전체를 모아 호출. 개별 학생 1명만 취소하려면 펼친 하위 행(`IssuePersonalRows`)의 학생별 삭제 버튼으로 `cancelIssue` 단건 호출.
- `doc_type` (TEXT): `'gajeong'` | `'volunteer_personal'` | `'volunteer_class'` | `'volunteer_club'` (CHECK 제약 `document_issue_doc_type_check`)
- `issue_no` (TEXT): 발급번호 `'YYYY-NNN'` (자동 채번, immutable)
- `issue_year` (INT): 채번 연도 (필터·시퀀스 키)
- `title` (TEXT): 봉사활동내용 / 가정통신문 제목
- `issued_on` (DATE): 제출일자(반봉사 확인서 하단 확인 날짜, 기본=오늘) / 가정통신문 발급일. 봉사 *기간*은 `form_data.period_start/end`가 별도 보유
- `department` (TEXT, nullable): 활동담당부서
- `students` (JSONB, default `[]`): 참여자 스냅샷 배열. 등록 시점의 학적을 denormalize 보존 (학생이 이후 반이 바뀌어도 과거 발급 확인서는 발급 당시 반 유지). 형식:
  ```jsonc
  [{ "resource_id": "<uuid>", "code": "00-00305", "grade": 2, "class": 3, "number": 5, "name": "홍길동", "hours": 1 }]
  ```
- `grade` (INT, nullable): 대표 학년 (필터)
- `class_number` (INT, nullable): 반 (가정통신문은 null)
- `form_data` (JSONB, nullable): 반봉사 양식 데이터 (`volunteer_class`만). 형식:
  ```jsonc
  {
    "period_start": "2025-03-15", "period_end": "2025-03-15",  // period_end 선택(미입력 시 단일 일자)
    "org": "샘플고등학교", "org_tel": "000-0000-0032",   // 교내 봉사 기본값(기관·연락처·장소 일괄)
    "area": "환경보호활동",          // 이웃돕기활동 | 환경보호활동 | 캠페인활동
    "place": "샘플고등학교",
    "content": "자연환경 보호활동",
    "scope": "정규교육과정 내",      // 정규교육과정 내 | 정규교육과정 외
    "hours": 1                       // 인정시간 — 발급 전체 공통, 명단 전 행 동일 기입(미설정 시 1)
  }
  ```
  **동아리(`volunteer_club`)** 양식은 `kind:"club"` discriminator로 구분한다(`isClubFormData()`). 발급 1건이 **여러 동아리**를 담을 수 있고(발급 모달에서 `SearchableMultiSelect`로 다중 선택, "모든 동아리" 가능), **활동 내용은 동아리별**로 발급 후 **대장 아코디언의 각 동아리 행에서 작성**한다(모달에는 활동 내용 입력란 없음):
  ```jsonc
  {
    "kind": "club",
    "scope": "정규교육과정 내",      // 발급 공통: 정규교육과정 내 | 외
    "area": "동아리",                // 발급 공통: 봉사 주관 영역(자율자치 | 동아리 | 진로)
    "org": "샘플고등학교", "org_tel": "000-0000-0032", "place": "샘플고등학교",
    "schedule": [                    // 활동 일시(날짜·시간) 시드 — 발급 모달서 입력(선택), 각 동아리 활동에 채움
      { "date": "2026-03-27", "hours": 1 }
    ],
    "clubs": [                       // 이 발급에 포함된 동아리들 (각자 명단·활동)
      {
        "club_id": "<club_info.id>", "club_name": "방송부",
        "teacher_name": "강시우",            // 동아리 담당교사(확인서 확인자)
        "teacher_resource_id": "<resource.id>", // 담당교사 resource.id — update_club_activities 서버 권한 판정용
        "students": [ /* ParticipantSnapshot[] — club_info 명단 스냅샷 */ ],
        "activities": [                // 활동 N건(아코디언에서 추가/삭제, 최대 9건=명단 날짜열 9)
          { "date": "2026-03-27", "hours": 1, "content": "교내 환경 정화" }
        ],
        // 다운로드 미리보기에서 저장한 출력 설정(선택) — 없으면 전원·전일 참가
        "attendance": { "<resource_id>": { "2026-03-27": true } }, // resource_id → 날짜(ISO) → 참가 여부
        "excludedResourceIds": [ "<resource_id>" ]                  // 확인서에서 제외할 학생
      }
    ]
    // 동아리별: 봉사 기간 = activities 날짜 min~max, 학생 1인 인정시간 = 그 학생이 참가한 날짜의 Σhours
    // document_issue.students = 전 동아리 명단 union(중복 제거) — 대장 표시·검색용
  }
  ```
  - **활동 모델**: `schedule`(발급 공통 일시 시드, 선택)는 발급 시 각 동아리 `activities`에 채워지고(`seedClubActivities`, 기존 보존), **봉사 내용·동아리별 일시는 대장 아코디언에서 작성/추가**. `schedule` 키 없는 옛 레코드는 `?.`로 호환.
  - **발급 모달**: 기존 발급 모달(`IssueCreateDialog`)에 단체/**동아리**/개인 칩으로 통합(별도 모달 아님). 동아리는 제목(봉사활동내용) 입력 없음(title 자동 생성), 활동 일시(`ClubScheduleField`)만 선택 입력.
  - **활동 작성/확인서**: 대장에서 동아리 발급 행을 펼치면(`IssueClubRows`, 컬럼 헤더 표시) 동아리별 행이 나오고, 행에서 `ClubActivityEditDialog`로 활동(날짜·시간·내용)을 작성하거나 다운로드. **다운로드는 `ClubExportPreviewDialog` 미리보기 경유** — 학생×활동일자 매트릭스로 날짜별 참가(√) 조정 + 제외 학생 선택. **다운로드 클릭 시 `update_club_attendance` RPC로 설정을 DB 저장**(`attendance`·`excludedResourceIds`)하고 재열람 시 복원(저장 권한 없으면 이번 다운로드만 적용). 여러 동아리 통합 다운로드는 행 상단 다운로드(동아리별 페이지 분리, 저장된 설정 폴백·없으면 전원 √).
  - **수정 권한**: `canEditClub`(작성자/admin/그 동아리 담당교사명)로 버튼 노출, 서버 `update_club_activities` RPC가 `teacher_resource_id`/이름으로 최종 판정 → 담당교사가 **자기 동아리 활동만** 저장.
  - **아코디언 행 표시 범위**(`useLedgerScope`, 단체·동아리 공통): 일반 교사는 **본인 담임 반**(`isHomeroomOf`)·**담당 동아리**(`isClubAdvisor`) 행만 보이고, **admin·`학교관리자`(=사이트 관리자)·`발급대장담당자` 태그**(`resource_tags`, `SEE_ALL_TAGS`) 보유자는 전체 행. 클라이언트 표시 필터일 뿐이며(열람 RLS는 여전히 전체 교사 SELECT), 수정/저장은 위 권한 게이트가 별도 판정.

  **개인(`volunteer_personal`)** 양식은 학교 표준 "봉사활동 계획 및 확인서(개인)" 양식에 맞춘 데이터를 담는다(계획서·확인서 두 블록이 한 문서 안에 있고 같은 정보를 담아 한 번에 제출·인쇄됨). 학생 1명 = 발급 1건(발급번호 1개)이라 form_data에 명단 배열이 없다:
  ```jsonc
  {
    "period_start": "2026-07-01", "period_end": "2026-07-02",  // period_end 선택(미입력 시 단일 일자)
    "org": "샘플고등학교", "org_tel": "000-0000-0032",
    "place": "샘플고등학교",
    "area": "환경보호활동",          // 이웃돕기활동 | 환경보호활동 | 캠페인활동
    "content": "교내 환경 정화 활동",
    "hours": 2,                      // 인정시간
    "note": "우천 시 실내 활동으로 대체",   // 유의사항 — 선택
    "opinion": "성실히 참여함",              // 의견 — 선택
    "confirmer_title": "교사",       // 확인자 직급 — 기본값 "교사"
    "confirmer_name": "정시우"       // 확인자 성명 — 담임 자동 시딩 또는 직접 입력
  }
  ```
  - **다중 학생 입력 → 학생별 개별 발급**: 발급 모달(`IssueCreateDialog`)에서 같은 내용을 여러 학생이 함께 수행한 경우를 위해 `SearchableMultiSelect`로 다중 선택을 허용하지만, 제출 시 학생마다 **별도 `create_document_issue` 호출**로 별도 행(=별도 발급번호)을 만든다(`submitPersonal`, `Promise.allSettled`로 부분 실패 허용 — 실패한 학생만 안내하고 성공분은 유지). 선택된 학생들의 (학년,반)이 전부 동일하면 그 반 담임을 확인자 성명 기본값으로 자동 시딩(`useHomeroomTeachers`), 반이 섞여 있으면 자동 시딩하지 않고 직접 입력 안내.
  - **배치(batch) 그룹핑**: 같은 제출 묶음임을 표시하기 위해 클라이언트가 `crypto.randomUUID()`로 `batch_id`를 1개 생성해 그 묶음의 모든 행에 동일하게 기록한다(`meta.batch_id`, 아래 `meta` 컬럼 참고). 대장(`IssueLedger`)은 `groupByBatch()`로 같은 `batch_id`의 행을 묶어 대표 행 1개(+펼치면 학생별 발급번호가 보이는 하위 행, `IssuePersonalRows`)로 표시한다. `batch_id`가 없는 레거시 행은 각자 단독 배치로 취급.
  - **편집은 행 단위**: 배치 전체를 한 번에 수정하는 기능은 없음 — 개별 학생 행을 각각 수정(`editing` 모드는 단일 행 스코프, `IssueCreateDialog`가 `personalForm`을 그 행의 `form_data`로 채운다).
- `remarks` (TEXT, nullable): 비고
- `created_by` (UUID): FK → `auth.users(id)` — 작성자
- `created_at` / `updated_at` (TIMESTAMPTZ)
- `meta` (JSONB, default `{}`): 확장 필드. 현재 실사용: `volunteer_personal`의 `batch_id`(같은 제출 묶음의 발급 행을 대장에서 그룹핑하는 클라이언트 생성 UUID). `create_document_issue`의 `p_meta` 파라미터로 insert 시점에 원자적으로 기록.

#### Indexes:
- `idx_document_issue_type_year` on `(doc_type, issue_year, issue_no)`
- `idx_document_issue_creator` on `(created_by)`

#### RLS Policies (모든 교사/관리자 공유 열람):
- **SELECT** (`document_issue_select`): 모든 teacher/admin (`profiles.role IN ('teacher','admin')`)
- **INSERT** (`document_issue_insert`): `auth.uid() = created_by` + teacher/admin
- **UPDATE** (`document_issue_update`): 작성자 본인 **또는** admin
- **DELETE** (`document_issue_delete`): 작성자 본인 **또는** admin

#### Triggers:
- `trg_document_issue_updated_at` → `document_issue_set_updated_at()`: `updated_at` 갱신

### document_issue_sequences
**Purpose**: number_space별·연도별 채번 카운터 (race-safe 자동 번호 소스)
**Primary Key**: (number_space, year)
**RLS Enabled**: Yes (정책 없음 → SECURITY DEFINER 함수만 접근)

#### Columns:
- `number_space` (TEXT): `'volunteer'` | `'gajeong'`
- `year` (INT): 채번 연도
- `last_value` (INT, default 0): 마지막 발급 순번

---

## 함수 (RPC)

### next_document_issue_no(p_space text) → text
**SECURITY DEFINER**, `authenticated`만 EXECUTE.
`INSERT ... ON CONFLICT (number_space, year) DO UPDATE SET last_value = last_value + 1 RETURNING`으로 race-safe하게 다음 번호를 채번하고 `'YYYY-NNN'` 반환.

### create_document_issue(p_doc_type, p_title, p_issued_on, p_department, p_students, p_grade, p_class_number, p_form_data, p_remarks, p_meta) → uuid
**SECURITY DEFINER**, `authenticated`만 EXECUTE.
채번 + insert를 원자적으로 처리. 검증: 인증 여부, teacher/admin 권한, doc_type 유효성(`gajeong`/`volunteer_personal`/`volunteer_class`/`volunteer_club`), title 비어있지 않음. `number_space`는 `doc_type='gajeong'`이면 `'gajeong'`, 그 외(personal·class·club) `'volunteer'` 공유. 생성된 행의 id 반환.
`p_meta` (jsonb, `DEFAULT NULL` → 컬럼 기본값 `{}`로 저장)는 2026-07-02에 추가된 파라미터(개인 봉사 `batch_id` 원자적 기록용). 기존 9-인자 오버로드는 `CREATE OR REPLACE`가 시그니처를 바꿔도 Postgres가 별개 함수로 취급해 오버로드가 생기므로, 마이그레이션에서 옛 9-인자 함수를 명시적으로 `DROP FUNCTION`했다 — PostgREST의 named-parameter RPC 호출이 두 오버로드 사이에서 모호해지는 것을 방지.

### update_volunteer_class_roster(p_issue_id, p_grade, p_class, p_students) → document_issue
**SECURITY DEFINER**, `authenticated`만 EXECUTE.
`volunteer_class` 발급의 **한 반 명단만** 교체(다른 반·발급정보 보존). 권한 게이트 = admin · 작성자 · 그 반 담임(`is_homeroom_teacher`). UPDATE RLS(작성자/admin)를 우회해 담임이 자기 반만 수정하게 하는 통로.

### update_club_activities(p_issue_id, p_club_id, p_activities) → document_issue
**SECURITY DEFINER**, `authenticated`만 EXECUTE(anon revoke).
`volunteer_club` 발급의 **한 동아리 activities 배열만** 교체(다른 동아리 보존). 권한 게이트 = admin · 작성자 · **그 동아리 담당교사**(form_data의 `teacher_resource_id`가 호출자 teacher resource와 일치, 또는 `teacher_name`=호출자 profile 이름). UPDATE RLS(작성자/admin)를 우회해 담당교사가 자기 동아리 활동만 저장하게 하는 통로(`update_volunteer_class_roster`와 동형). 서비스: `issueService.updateClubActivities` → `useIssues.updateClubActivities`.

### update_club_attendance(p_issue_id, p_club_id, p_attendance, p_excluded) → document_issue
**SECURITY DEFINER**, `authenticated`만 EXECUTE(anon revoke).
`volunteer_club` 발급의 **한 동아리 출력 설정**(`attendance`·`excludedResourceIds`)만 교체(다른 동아리·activities 보존). 다운로드 미리보기(`ClubExportPreviewDialog`)에서 **다운로드 클릭 시 저장**. 권한 게이트는 `update_club_activities`와 동일(admin·작성자·그 동아리 담당교사). 서비스: `issueService.updateClubAttendance` → `useIssues.updateClubAttendance`.

---

## HWPX 양식 생성

### 개인 봉사 — `volunteer_personal`
- `src/features/issue-register/hwpx/personal-template.hwpx`: 학교 표준 양식(봉사활동 계획 및 확인서(개인)) 빌드 자산. 12×4 표(본문 전체) + 2×5 표(담임/부장/교감/교장 결재선, 자동 채움 대상 아님) 2개뿐 — **로스터(명단) 표가 없어** 단체/동아리 템플릿과 달리 행 복제 로직이 불필요(학생 1명 = 정적 텍스트 치환만)
- `personalFormFill.ts`: `section0.xml` 문자열 순수 치환. 계획서·확인서 두 블록이 완전히 동일한 정보를 담아 대부분의 필드가 **2회 등장**(라벨 정규식에 `/g`로 양쪽 동시 치환) — 인적사항·대상기관은 1회(공용/계획서 전용), 유의사항·의견·확인 날짜·확인자 직급/성명·발급번호는 1회(확인서 전용 또는 최하단). 각 `{value}` 자리표시자가 하나의 `<hp:t>` 런 안에 온전히 들어있고 안정적 라벨 접두어를 가져 단체 템플릿보다 매칭이 안정적. **학생 서명란("성명: {이름} (인, 서명)")은 실물 서명 대상이라 의도적으로 치환하지 않는다** — 확인자 성명 치환 정규식은 "성명:" 라벨 없이 공백만으로 들여쓰기된 confirmer 전용 줄로 앵커링해 학생 서명란(및 제출 서명란)과 혼동되지 않게 한다.
- `generatePersonalHwpx.ts`: `generatePersonalHwpx(issue)`(학생 1명 확인서 1건) / `generatePersonalHwpxBatch(issues)`(배치 내 여러 학생을 `mergeSectionsOnePage`로 페이지 분리해 단일 파일 — class/club 통합 다운로드와 동일 패턴). `reorderAndExport`/`triggerDownload`는 volunteer 생성기와 공유(export)
- 회귀 테스트: `npx tsx scripts/document-issue-test/run-personal.mts`(채우기 — 2회 등장 필드 검증, 학생 서명란 미치환, 확인자 성명 앵커링, 유의사항/의견 미입력 폴백), `run-personal-batch.mts`(배치 페이지 분리 병합 + mimetype STORE-first 재개봉)

### 단체(반) 봉사 — `volunteer_class`
- `src/features/issue-register/hwpx/volunteer-template.hwpx`: 학교 표준 양식(단체봉사활동 실시 확인서) 빌드 자산
- `volunteerFormFill.ts`: `section0.xml` 문자열 순수 치환 (인적사항·기간·영역체크·내용 + 명단표 템플릿 행 clone, rowAddr 재계산, 2명/행)
- `generateVolunteerHwpx.ts`: 템플릿 fetch → 채우기 → **mimetype STORE-first 재정렬** → Blob 다운로드. `reorderAndExport`/`triggerDownload`는 club 생성기와 공유(export)
- 회귀 테스트: `npx tsx scripts/document-issue-test/run-hwpx.mts` (채우기), `npx tsx scripts/document-issue-test/run-rezip.mts` (mimetype STORE/첫항목 검증)

### 동아리 봉사 — `volunteer_club`
- `club-template.hwpx`: 동아리 단체 봉사활동 확인서(31×14 단일 표). 일반 양식과 다른 점 = **봉사 주관 영역(자율자치/동아리/진로 √)**, **활동 내용 N행(날짜·시간·내용)**, **명단표 날짜별 출석(√) 열 N개 + 봉사 인정시간**, **확인자 직위 = 동아리 담당교사**
- `clubFormFill.ts`: 순수 치환. (1) markpen(노란 편집가이드)·MEMO 주석 전역 제거 → 깨끗한 출력 + 복제용 셀 정리, (2) 헤더(0~7)·푸터(30) 행 단위 치환, (3) **활동 내용(N행)·명단(날짜열 N개 × 학생 M명) 라이브 셀 복제 재구성**. 날짜열은 고정 9 grid 컬럼(폭 21258)을 N개로 균등 분배(`dateColumns`, 헤더·본문 동일 → 열 경계 정렬). **불변식**: 모든 행이 `[0,colCnt=14)` 타일링, rowAddr 무결, `rowCnt = 12 + N + M`. 출석은 `ClubFillStudent.attend[]`(활동별 boolean, 없으면 전부 √)로 학생별 날짜 √, **학생 1인 인정시간 = 그 학생이 참가한 날짜의 Σhours**(부분 참가 반영). 최대 활동 9건(=날짜 grid 9열). `MAX_CLUB_ACTIVITIES` export
- `generateClubHwpx.ts`: `generateClubHwpx(issue, clubId?, opts?)` — clubId 지정 시 그 동아리 1장, 없으면 활동이 입력된 모든 동아리를 **동아리별 페이지 분리**(`mergeSectionsOnePage`)로 한 파일. `opts`(`{attendance, excludedResourceIds}`, 단일 동아리만 적용) = 다운로드 미리보기(`ClubExportPreviewDialog`)에서 정한 학생별 날짜 참가 + 제외 학생. 동아리별: 봉사 기간=활동 날짜 min~max, 확인 날짜=`issued_on`. `clubsReadyForExport(issue)`=활동·명단 있는 동아리
- 회귀 테스트: `npx tsx scripts/document-issue-test/run-club.mts` (채우기·타일링·rowAddr·rowCnt 불변식 + 부분참가 √/인정시간), `run-club-e2e.mts` (단일 동아리 전체 파이프라인 + mimetype STORE-first 재개봉), `run-club-multi.mts` (동아리 3개 페이지 분리 병합·secPr 단일·재개봉)
