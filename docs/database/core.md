# Core / 공통 시스템 테이블

TMS의 핵심 공통 테이블: 사용자·리소스·일정·업무·문서·알림 시스템.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## Core System Tables

### 1. profiles
**Purpose**: User profiles with roles and authentication information
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 39

**Important Note**: This table is shared across multiple websites/applications, so many columns are not used in the TMS system.

#### Columns:
- `id` (UUID): Primary key linked to auth.users.id
- `email` (TEXT): User email address
- `name` (TEXT): User's full name (used for resource ID resolution in TMS)
- `role` (TEXT): User role - 'student', 'teacher', 'admin' (default: 'student')
- `signature` (TEXT): Digital signature data
- `created_at` (TIMESTAMPTZ): Account creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp
- `last_login` (TIMESTAMPTZ): Last login timestamp

#### Unused Columns in TMS:
The following columns exist for other applications but are not utilized in the TMS system:
- `nickname` (TEXT): Display nickname
- `grade` (INTEGER): Student grade level
- `class_number` (INTEGER): Class number for students
- `student_number` (INTEGER): Student ID number
- `is_first_login` (BOOLEAN): First login flag
- `problems_registered` (INTEGER): Count of registered problems
- `solutions_registered` (INTEGER): Count of registered solutions
- `total_likes_received` (INTEGER): Total likes received
- `ranking_points` (INTEGER): User ranking points

#### Key Relationships:
- Links to `user_resource` table for resource associations
- Referenced by various created_by fields across tables

#### Usage Notes:
- The `name` field is critical for resource ID resolution in the TMS system
- Role field determines access permissions throughout the application
- Many columns are legacy/shared fields not relevant to TMS functionality

### 2. resource
**Purpose**: Central resource management for teachers, students, rooms, devices, and groups
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 66

#### Columns:
- `id` (UUID): Primary key
- `type` (TEXT): Resource type - 'teacher', 'student', 'room', 'device', 'group', 'classroom', 'iframe', 'link'
- `name` (TEXT): Resource name/identifier
- `meta` (JSONB): Flexible metadata storage (default: '{}')
- `status` (TEXT): 재학 상태 - 'active'(기본값) | 'graduated'(졸업) | 'transferred'(전출) | 'withdrawn'(자퇴). CHECK 제약으로 값 제한
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### `type` vs `status` 역할 분리 (2026-07 도입)
- **`type`**: 리소스의 종류를 나타내는 불변에 가까운 속성. 학생 리소스는 상태와 무관하게 **항상 `'student'`**를 유지한다 (과거 "졸업 처리" 기능이 `type`을 `'graduated'`로 바꾸던 방식은 폐기, 2026-07 마이그레이션으로 해당 데이터도 `type='student'`로 복구됨).
- **`status`**: 학생의 재학 상태를 나타내는 가변 속성. 재학/졸업/전출/자퇴 구분은 오직 이 컬럼으로만 한다.
- teacher/room/device/group 등 학생이 아닌 리소스는 `status`가 항상 기본값 `'active'`이며 의미를 갖지 않는다.
- `resource.type = 'student'`로 필터링하는 기존 코드(로그인 리소스 해석, 시간표, 시험 감독 배정 등)는 전출/자퇴 학생도 여전히 포함한다 — 이는 의도된 동작이며, 그 학생들을 실제로 제외하려면 각 기능에서 `status = 'active'` 조건을 별도로 추가해야 한다(아직 미적용).

#### 졸업생 개인정보 처리
- 졸업생 이름은 입학연도별 실명 가나다순으로 채번한 `YYYY입학NNN` 형식으로 익명화한다.
- `status = 'graduated'`인 학생은 `meta.grade`, `meta.picture`, `meta.birthday`를 보유할 수 없다. `resource_graduated_student_privacy` CHECK 제약이 이를 강제한다.
- 졸업생과 연결된 Auth 계정은 삭제하지 않고 차단하며, 기존 세션과 리프레시 토큰을 폐기한다.
- 실명과 익명명의 대응표는 DB 외부의 접근 제한된 CSV로 보관하며 저장소에는 커밋하지 않는다.
- 과목 이수·성적·활동 데이터의 `grade = 3`은 당시 학년을 의미하는 교육 기록이므로 유지한다. 삭제 대상은 현재 학적값인 `resource.meta.grade`와 `student_basic_info.grade`다.

#### JSONB Meta Field Properties:
The `meta` field can contain different properties depending on resource type:
- **Teacher resources**: May include subject specializations and schedule preferences
- **Student resources**: May include class information and learning metadata
- **Room resources**: May include capacity, equipment, location details
- **Device resources**: May include specifications, maintenance schedules, allocation status

Personal phone numbers are not stored. The `resource_meta_no_personal_phone`
constraint rejects the legacy `meta.phone` and `meta.hp` keys, and
`profiles.phone` was removed in the 2026-07-23 privacy migration.

#### Key Relationships:
- Referenced by `task.assigned_to`, `task.created_by`
- Referenced by `event.manager_id`
- Referenced by `meeting.created_by`
- Links to `user_resource` for user associations

### 3. user_resource
**Purpose**: Junction table linking users to resources
**Primary Key**: Composite (user_id, resource_id)
**RLS Enabled**: Yes
**Records**: 3

#### Columns:
- `user_id` (UUID): References profiles.id
- `resource_id` (UUID): References resource.id
- `created_at` (TIMESTAMPTZ): Association creation timestamp

#### Usage Notes:
- Essential for resource ID resolution in the TMS system
- Used to determine which resources a user can manage or access
- **2026-10-13 계정 연결 차단막**: 이 연결이 곧 "명단에 연결된 계정"의 근거다. 판정 = `account_link_status(uid)`(교직원 = teacher·staff resource 연결, 학생 = 이메일 학번의 재학 학생 resource), 앱 = `my_account_link_status()`. 미연결·비활성 계정의 Data API 요청은 PostgREST pre-request 훅 `account_link_pre_request` 가 거부하고(연결 절차 경로만 허용), `is_teacher_or_admin`·`is_staff_teacher_or_admin` 도 연결을 요구한다. 이름 조회 = RPC `find_self_linkable_resource(name)`(id·name·type 만). 마이그레이션 `20261013200000`.

### 3-1. resource_accounts (2026-10-13)
**Purpose**: 교사 외부 서비스 계정(구글·웨일스페이스·인공지능용·리로스쿨·마이크로소프트) — 종전 `resource.meta.accounts`
**Primary Key**: `resource_id` (→ resource.id, ON DELETE CASCADE)
**RLS**: SELECT = 본인(`user_resource` 연결) ∨ `is_admin()` · INSERT/UPDATE/DELETE = `is_admin()` · anon 권한 없음

#### Columns:
- `resource_id` (UUID)
- `accounts` (JSONB, object): 종류별 배열(레거시 단일 객체 혼재) — 모양은 옛 `meta.accounts` 와 같다. 읽기는 `parseAccounts({accounts})`
- `updated_at`, `updated_by`: 트리거 `touch_resource_accounts` 가 채움

#### Usage Notes:
- `resource` 는 로그인한 누구나 읽으므로 meta 에 든 평문 비밀번호(인공지능용 27명 34건)가 학생에게도 보였다 → 이 표로 옮김
- `resource.meta` 에 `accounts` 키를 쓰면 트리거 `resource_reject_meta_accounts` 가 23514 로 거부한다
- 클라이언트 = `src/services/resourceAccountsService.ts`, 마이그레이션 `20261013210000`

## School Management Tables

### 4. section
**Purpose**: Class subjects, sections, and academic divisions
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 329

#### Columns:
- `id` (UUID): Primary key
- `name` (TEXT): Section name/identifier
- `subject` (TEXT): Subject name (nullable)
- `is_combined` (BOOLEAN): Whether this is a combined section (default: false)
- `meta` (JSONB): Section metadata (default: '{}')
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### JSONB Meta Field Properties:
- **Grade levels**: Target grade information
- **Teacher assignments**: Primary and secondary teachers
- **Schedule information**: Meeting times, room assignments
- **Curriculum data**: Syllabus links, learning objectives

### 5. meeting
**Purpose**: Scheduled events including classes, duties, training, and school events
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 269

#### Columns:
- `id` (UUID): Primary key
- `kind` (TEXT): Meeting type - 'class', 'schedule', 'duty', 'training', 'event', 'document_submission'
- `section_id` (UUID): Optional reference to section.id
- `starts_at` (TIMESTAMPTZ): Start time
- `ends_at` (TIMESTAMPTZ): End time
- `status` (TEXT): Status - 'scheduled', 'approved', 'cancelled', 'completed' (default: 'scheduled')
- `created_by` (UUID): References resource.id
- `creator` (UUID): Alternative creator reference
- `meta` (JSONB): Meeting metadata (default: '{}')
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### JSONB Meta Field Properties:
The `meta` field contains various properties depending on meeting kind:
- `title` (TEXT): Meeting title/name
- `section_name` (TEXT): Section name for display
- `date_only` (BOOLEAN): Whether this is an all-day event
- `source` (TEXT): Source of the meeting (e.g., 'NEIS' for imported school calendar)
- `hidden` (BOOLEAN): Whether to hide from certain displays
- **NEIS Integration**: Additional fields for imported Korean school calendar events
- **Training meetings**: Signature requirements, attendance tracking
- **Document submission**: Deadline information, submission guidelines

#### RLS (접근 권한):
- **UPDATE/DELETE** (`meeting_update_unified`, `meeting_delete_unified`): `user_can_access_meeting(auth.uid(), id)` 단독으로 판정.
- `user_can_access_meeting()`은 생성자(creator/created_by), personal 본인, duty/document_submission/training의 assignee 명단, meta.participants, 그리고 `kind IN ('schedule','event')`(모든 인증 사용자 접근) 중 하나면 true.
- **참고**: 과거 `schedule_permissions` 테이블 기반 권한 분기가 이 정책에 있었으나 redundant(위 `kind IN ('schedule','event')`가 이미 커버)하여 2026-06 제거됨. 아래 Deprecated 참조.

### 5a. training_signature (연수 참석 서명, 2026-08-14 신설)

연수 일정(`meeting.kind='training'`)의 참석 서명. **1인 1행**이고 서명은 이미지가 아니라 **획 좌표(벡터)**로 담긴다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `meeting_id` | uuid NOT NULL → meeting(id) ON DELETE CASCADE | 연수 일정 |
| `signer_name` | text NOT NULL | **`meta.assignee`의 키와 같은 문자열** — 인쇄 명단 매칭의 기준이라 이름이 정본 |
| `resource_id` | uuid NULL → resource(id) | 편의용 역참조(끊겨도 서명은 유효) |
| `user_id` | uuid NULL → auth.users(id) | 서명한 계정 — **링크 서명(`source='link'`)만 NULL**(CHECK `training_signature_user_unless_link`, 2026-10-25) |
| `strokes` | jsonb NOT NULL | `{"v":1,"w":폭,"h":높이,"s":[[x,y,x,y,...]]}` |
| `source` | text NOT NULL | `'app'`(일정 상세) \| `'qr'`(QR 모바일 페이지) \| `'link'`(로그인 없는 참석자별 링크, 2026-10-25) |
| `signed_at` | timestamptz NOT NULL | |

- UNIQUE `(meeting_id, signer_name)` — 다시 서명은 upsert로 같은 행을 덮어쓴다
- CHECK: 획 배열 1~300개, `strokes::text` 40,000자 이하

#### 설계 결정
- **왜 이미지가 아닌 좌표인가**: 실측 0.5KB(같은 서명의 PNG data URL은 5~15KB)이고, 인쇄 시 SVG path로 그려 A4 해상도에서 선명하다. Storage 버킷을 쓰지 않으므로 고아 파일·공개 URL 문제가 없다(구 `profiles.signature`는 **public 버킷** URL이라 링크만 알면 열람 가능했다). 형식·렌더 단일 출처 = `src/lib/signatureStrokes.ts`
- **왜 `meeting.meta`가 아닌 별도 표인가**: QR로 여러 명이 동시에 서명하면 클라이언트의 JSONB read-modify-write가 서로를 덮어써 서명이 유실된다(`task_submission`을 뺀 것과 같은 이유)
- **하위 호환**: 기존 화면이 보는 `meta.assignee[이름].signature` 플래그는 **트리거 `training_signature_sync_flag`**가 서버에서 단일 `jsonb_set` UPDATE로 동기화한다(행 잠금 → 동시 서명에도 유실 없음). INSERT/UPDATE=1, DELETE=0

#### RLS (4종) + 보조 함수
- SELECT: `user_can_access_meeting(auth.uid(), meeting_id) OR is_admin()` — 연수 가시성과 동일
- INSERT: `user_id = auth.uid() AND signer_name = current_profile_name() AND is_training_assignee(meeting_id, signer_name)` → **대리 서명 불가**(라이브 검증: 남의 이름·남의 user_id·명단 밖 연수 모두 42501)
- UPDATE: 본인 행만(다시 서명)
- DELETE: 본인 ∨ `can_manage_training_signatures(meeting_id)`(일정 생성자 ∨ admin ∨ `연수담당자` 태그)
- 신규 함수 3종은 **SECURITY DEFINER라 RLS를 우회**하므로 `PUBLIC`과 `anon` **양쪽에서** REVOKE했다 — Supabase 스키마 기본 권한이 anon에 직접 부여하므로 PUBLIC만 회수하면 익명이 참석 여부를 탐지할 수 있다(실측 확인)

#### 관련 화면
`ScheduleDetailDialog`(서명·QR·출력) · `TrainingSignDialog` · `TrainingSignatureQrDialog` · `/training-sign/:meetingId`(QR 모바일 페이지, **로그인 필수**) · `TrainingSignaturePrintView`(구 데이터는 `profiles.signature` 이미지로 폴백)

#### 5b. 참석자별 로그인 없는 서명 링크 (2026-10-25, `20261025190000`·MCP `20261025200000`)
사용자 요청 «전자서명의 로그인 없는 서명 링크를 연수에도 — 대상 각각에게, 앞으로 생성되는 연수만». 2026-08-14 «anon 에 아무 것도 열지 않는다»를 **이 범위에서만** 바꿨다.
- **`training_sign_link`**(meeting_id PK → meeting CASCADE, `expires_at`, `expires_custom`) — 연수 INSERT 트리거 `training_sign_link_on_meeting` 이 만든다. **이 행이 있는 연수 = 링크가 있는 연수**(기존 연수는 없다). 기본 기한 `training_sign_default_expiry(ends_at)` = 연수 마지막 날 + 7일의 끝(KST). 직접 정하지 않았으면 연수 날짜를 고칠 때 다시 계산
- **`training_sign_token`**(token PK 43자, meeting_id, signer_name, used_at, used_user_agent; UNIQUE(meeting_id, signer_name)) — 참석자마다 하나. 명단을 고치면 `training_sign_sync_tokens` 가 새 이름 토큰을 만들고 빠진 이름의 **안 쓴** 토큰을 지운다
- 두 표 모두 RLS on·정책 없음·anon/authenticated 권한 회수 — 토큰은 DEFINER 함수로만 나간다
- anon 이 부를 수 있는 것은 **둘뿐**: `get_training_by_token`(연수 이름·일시·장소·서명할 사람·서명 여부 — 명단·남의 서명 없음) · `sign_training_with_token`(기한·명단·중복 확인 후 `training_signature` 에 `source='link'`, `user_id` NULL 로 넣는다 → 기존 트리거가 서명 표시를 올린다)
- 로그인: `get_training_sign_links(meeting_id)` — 만든 사람(`is_training_creator` — `created_by`·`creator` 는 **resource id**)·관리자는 전원, 참석자는 자기 것만(연수담당자 태그는 제외 — 사용자 결정) · `set_training_sign_link_expiry(meeting_id, at|null)`(만든 사람·관리자, 1시간 뒤 ~ 90일, null = 기본으로)
- 연수 알림(`create_meeting_notification`)은 `meta.meeting_kind='training'` 을 실어 누르면 `/training-sign-qr/:id`(내 서명 QR)로 간다
- 회귀 `scripts/training-sign-link-test/run.mts`(`--db` = 운영 권한·흐름을 rollback 으로)

### 5c. approval_request / approval_step (범용 결재, 2026-08-14 신설)

어떤 기능에도 붙일 수 있는 결재 유틸. 결재 대상은 **`subject_type` + `subject_id`**로 가리킨다(기능마다 표가 달라 FK 불가) — 임의 값이 실행 경로가 되지 않도록 **타입 목록은 코드 allowlist**(`src/features/approval/registry.tsx`)로 관리한다(`task_work.work_type`↔`workRegistry.ts`와 같은 원칙).

**approval_request**

| 컬럼 | 설명 |
|------|------|
| `subject_type` / `subject_id` | 결재 대상. 예: `timetable.swap_document` + class_swap id 목록 |
| `title` / `summary` / `payload` | 목록 표시 + **결재 시점 스냅샷**(원본이 바뀌어도 결재된 내용은 남는다) |
| `requester_user_id` / `_resource_id` / `_name` | 신청자 |
| `status` | `pending` \| `approved` \| `rejected` \| `cancelled` |
| `current_order` | 지금 결재할 차례인 단계의 `order_index`(순차 결재) |

- 부분 UNIQUE 인덱스 `approval_request_one_pending_per_subject`: **같은 대상에 진행 중 결재는 하나**(두 번 눌러 두 건이 뜨는 사고를 DB가 막는다)

**approval_step**

| 컬럼 | 설명 |
|------|------|
| `order_index` | 결재 순서. UNIQUE `(request_id, order_index)` |
| `role_label` | **결재란 칸 이름**(계·부장·교감·교장). HWPX 결재란 셀을 찾는 키 |
| `approver_user_id` | nullable — 계정 없는 결재자는 `approver_name`으로 판정한다 |
| `signature` | 결재 서명(획 좌표, `training_signature.strokes`와 **같은 형식**) |
| `status` / `comment` / `acted_at` | |

#### 설계 결정
- **결재선 = 직위 칸 + 사람 지정**(2026-08-14 사용자 결정). HWPX 결재란이 그 4칸 표이므로 `role_label`이 곧 서명이 찍힐 칸이 된다. 자유 명단이면 문서 칸과 맺을 근거가 없다
- **반려 = 전체 종료**, 신청자가 고쳐 재신청(같은 결정)
- **쓰기는 RPC 전용**: 두 표에 INSERT/UPDATE 정책을 두지 않았다. 직접 쓰기를 허용하면 차례를 건너뛰거나 남의 칸에 서명할 수 있다
- **승인에는 서명이 필수**(서버가 거부). 서명 없이 승인되면 결재란이 빈 채로 남는다

#### RPC (3종, SECURITY DEFINER)
- `create_approval_request(subject_type, subject_id, title, summary, payload, steps jsonb)` → uuid. steps는 배열 순서가 결재 순서. 결재자 계정은 `user_resource`→없으면 `profiles.name`으로 해석
- `act_on_approval_step(request_id, 'approve'|'reject', signature, comment)` → 요청 행을 `FOR UPDATE`로 잠그고 **차례·신원·서명 유무**를 검증. 승인 시 마지막 단계면 `approved`, 아니면 `current_order+1`
- `cancel_approval_request(request_id)` — 신청자 ∨ admin, pending일 때만

#### RLS
- SELECT만 정책으로 연다: `can_view_approval_request(id)` = 신청자 ∨ 결재선 포함 ∨ admin. 두 표가 서로를 참조하므로 정책 안에서 직접 조인하면 RLS가 재귀 → **DEFINER 함수로 분리**
- 라이브 검증: 차례 아닌 사람 결재 거부 / 중복 신청 거부(UNIQUE) / 서명 없는 승인 거부 / 2단계 순차 승인 후 `approved`·서명 2건 저장

#### 관련 코드
`src/features/approval/`(registry·service·hooks·components) · `ApprovalButton`(부착 지점) · `ApprovalInboxCard`(교사 대시보드 "결재 대기") · HWPX 날인 = `src/lib/rhwp/approvalCells.ts`(칸 찾기·그림 XML 생성, 순수·무의존)+`approvalStamp.ts`(캔버스 래스터화+zip 조립). 2026-08-14부터 **WASM을 쓰지 않는다** — core `insertPictureEx`는 용지 절대좌표 floating 그림을 만들어 한글에서 서명이 칸 밖으로 나갔다

### 5b. club_info (동아리/부서 정보)

동아리(부서)별 1 레코드. 소속 학생은 JSONB 배열. (2026-06 신설)

> ⚠️ **2026-11-11 부터 파생 사본** — 정본은 `club_year`·`club_advisor`·`club_member`(`docs/database/clubs.md`)이고 이 표는 확정 명단에서 트리거가 다시 쓴다. 직접 고치지 말 것(다음 동기화가 덮는다). `meta.club_year_id`·`meta.club_id` 로 정본을 가리킨다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `name` | text NOT NULL | canonical 동아리명 (예: `두잇(코딩)`) |
| `category` | text | 괄호 안 분류 (예: `코딩`), 없으면 NULL |
| `teacher_name` | text | 담당교사명. 공동지도는 `류로아,소혜신`처럼 콤마 표기 |
| `teacher_resource_id` | uuid FK→resource | 담당교사. 공동지도는 첫 교사를 primary로 연결 |
| `grade` | int | 단일 학년이면 그 학년, 학년 혼합이면 NULL |
| `students` | jsonb | `[{resource_id, code, grade, class, number, name}]` (소속 학생) |
| `student_count` | int | 소속 학생 수 (denormalized) |
| `academic_year` | int | 기본 2026 |
| `meta` | jsonb | 감사용 (`raw_count` 등) |

- `meta.leader` (2026-10-30) = 동아리 기장 `{resource_id, code, grade, class, number, name, in_roster, source, set_at}` — 학년·반·번호로 재학생 resource 와 맞춘 값(이름 매칭 금지). `in_roster=false` = `students` 명단에 없음. 묶음 동아리(«A/B» 한 줄)는 양쪽에 같은 기장. 개인 전화번호 없음. 마이그레이션 `20261030100000_club_info_leaders_2026.sql`.
- `meta.current_name` / `meta.former_names` (2026-10-30) = 동아리 이름 변경 연결. **이전 이름 행은 지우지도 inactive 로 돌리지도 않는다** — 3학년 부원이 이전 이름 행에 남아 있다(엠엔엠즈→체험탐구수학부 · 반크→링크 · 비엠더블유→이코노미). 이전 이름 행 = `current_name`(기장 없음), 현재 이름 행 = `former_names[]` + 기장. `20261030110000_club_info_former_names_2026.sql`.

- **UNIQUE**: `(academic_year, name)` — 같은 해 동일 동아리명 1개.
- **동아리명 정규화**: 같은 동아리의 분반 표기(`두잇`·`두잇1`)는 import 단계에서 **끝의 `1` 제거** 규칙으로 canonical 1개 레코드로 병합. 모든 병합 쌍이 동일 담당교사로 검증됨(74 raw → 43 canonical).
- **학생 매칭**: 원본 xlsx의 (학년·반·번호·성명)을 `resource.meta`(type='student')와 4키 매칭 → `resource_id`·`code` 저장. 2026 import 시 623명 전원 매칭.
- **RLS**: SELECT=teacher/admin, INSERT/UPDATE/DELETE=admin.
- 마이그레이션: `20260629200000_create_club_info_import_2026.sql` (DDL + 2026 동아리 자료 623행 self-contained import).

## Task Management System

### 6. event
**Purpose**: Project-level containers for task management
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 3

#### Columns:
- `id` (UUID): Primary key
- `name` (TEXT): Event name
- `description` (TEXT): Event description (nullable)
- `manager_id` (UUID): References resource.id; retained alongside the multi-manager metadata
- `status` (TEXT): Status - 'active', 'completed', 'cancelled' (default: 'active'). **`'pending'`(대기)은 2026-10-05 은퇴** — 화면이 더 만들지 않고, 남은 값은 진행 중(`active`)과 같이 다룬다(운영 0건). 숨김은 할 일의 `meta.visibleFrom` 이 맡는다(§7)
- `keywords` (TEXT[]): Search keywords array (default: '{}')
- `meta` (JSONB): Event metadata (default: '{}')
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### JSONB Meta Field Properties:
- **Managers**: `meta.managers` array with `{ "id": "resource-uuid", "name": "..." }`
- **Rollover lineage (2026-09-23)**: `meta.rolledOverFrom = { workId, year, name }` — '지난 업무 가져오기'로 만든 업무의 원본. 같은 원본·같은 해 중복 가져오기 판정에 쓴다. 할 일에도 `task.meta.rolledOverFrom = { workId, taskId }`. 스키마 변경 없음 — `docs/features/work-rollover.md`
- **Reference origin (2026-11-12)**: «참고해서 시작 › 비슷한 일 참고»로 만든 업무 `meta.referencedFrom = { workId, year, name }` · 할 일 `meta.copiedFrom = { workId, taskId }` — **계보가 아니다**(`work_lineage` 가 따라가지 않는다 · 작업 `rolled_over_from` = null). 가져오기 분류 `rebuild`(다음 복사로 옮기지 않는다). 원본으로 `ontology_link` «관련» 한 줄
- **Priority levels**: Event importance and urgency
- **Completion tracking**: Progress percentages, milestone data
- **Resource requirements**: Required personnel, equipment, budget
- **Timeline information**: Deadlines, phases, dependencies

### 7. task
**Purpose**: Individual tasks within events with multi-assignee support
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 11

#### Columns:
- `id` (UUID): Primary key
- `event_id` (UUID): References event.id
- `title` (TEXT): Task title
- `description` (TEXT): Task description (nullable)
- `type` (TEXT): Task type - 'procedural', 'one_time' (default: 'procedural')
- `order_index` (INTEGER): Display order (default: 0)
- `assigned_to` (UUID): Legacy single assignee reference (nullable)
- `status` (TEXT): Overall task status - 'pending', 'completed', 'cancelled' (default: 'pending')
- `due_date` (TIMESTAMPTZ): Task deadline (nullable)
- `keywords` (TEXT[]): Search keywords array (default: '{}')
- `meta` (JSONB): Task metadata (default: '{}')
- `created_by` (UUID): References resource.id
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### Critical JSONB Structure - meta.assignees:
```json
[
  {
    "id": "resource-uuid",
    "status": "pending|in_progress|completed|cancelled",
    "assigned_at": "2024-01-01T09:00:00Z",
    "completed_at": "2024-01-02T15:30:00Z"
  }
]
```

#### Task Management Notes:
- **Primary Storage**: Individual assignees and their status are stored in `task.meta.assignees`
- **Status Tracking**: Assignee states are `pending`, `completed`, or `cancelled`
- **Manager Detection**: Use `event.meta.managers`; `event.manager_id` is checked only for legacy compatibility
- **Count Calculation**: Use `task.meta.assignees.length` for assignee counting
- **Role-based UI**: Different interfaces for managers vs assignees
- **Status Update RPC**: `set_task_assignee_status(task_id, assignee_resource_id, status)` permits the target assignee to update their own state and a parent event manager to update any task assignee
- **Deadline Round RPC (2026-07-26)**: `set_task_deadline_status(task_id, assignee_resource_id, deadline, status)` — 다중 마감(반복) 업무의 회차별 완료 기록(`task.meta.deadlineProgress`). 같은 본인/매니저 권한 규칙, 회차가 `meta.deadlines`에 실재하는지 검증, 담당자 전체 상태는 "모든 회차 완료 시 completed"로 파생 후 task.status 재계산·`task_status_history` 기록. 다중 마감 모델 자체는 `meta.deadlines: string[]`(2회 이상일 때만) + `due_date` 컬럼=다음 마감 동기화 — 유틸 `src/lib/taskDeadlines.ts`
- **Migration**: `20260723170858_allow_event_manager_assignee_status_update.sql` adds the permission-checked, atomic status update and history entry

#### 담당자에게 보이는 날 — `task.meta.visibleFrom` (2026-10-05)
- `'YYYY-MM-DD'`(**한국 날짜**), 없으면 바로 보인다. 업무의 「대기」 상태를 대신한다(사용자 결정 — 업무가 아니라 **할 일 단위**). 스키마 변경 없음
- 판정 = DB 함수 `task_visible_to_assignees(meta)` ↔ 클라이언트 `src/lib/taskVisibility.ts` — **같은 정규식·같은 한국 날짜**라 한쪽만 바꾸지 말 것. 형식이 틀린 값은 «없는 것»(= 보임)
- 편집 = 할 일 편집 창 「담당자에게 보이는 날(선택)」(첫 마감보다 늦으면 저장 전에 막음 · 비우면 `null` 을 **명시** — update 가 meta 얕은 병합이라 키를 빼면 예전 값이 남는다 · 복사본은 이어받지 않음). 매니저 화면에는 그날까지 「10/20부터 보임」 칩(`VisibleFromChip`). 지난 업무 가져오기는 마감처럼 1년 옮긴다(`TASK_META_ROLLOVER_POLICY.visibleFrom = 'shift'`)

#### `get_my_tasks_jsonb` 의 목록 규칙 (2026-10-05 마이그레이션 `20261005120000_task_visible_from.sql`)
| 목록 | 규칙 |
|---|---|
| `assigned_tasks`(담당) | **취소된 업무만** 뺀다(종전 `e.status = 'active'` 는 완료된 업무의 할 일까지 빼, 업무가 끝나면 내 할 일 «완료» 보기에서 기록이 통째로 사라졌다) · 보이는 날 전의 할 일을 뺀다 · **완료된 업무의 할 일은 `status:'completed'` 로 싣고 원래 값은 `task_status`**, 모든 행에 `event_status` |
| `urgent_tasks`·`summary` | 진행 중 업무 + 보이는 날이 지난 할 일만(종전과 같은 숫자) |
| `managed_tasks`(매니저) | 거르지 않는다 — 책임자는 언제나 본다 |
- 화면: `getMyTaskStatus` 가 업무 종료(`event_status`)를 할 일 종료보다 먼저 본다 · `isFromClosedWork`(`src/lib/taskStatus.ts`) — 홈 대시보드(`Index.tsx`)는 출처에서 끝난 업무의 할 일을 걸러 종전과 같은 목록을 쓴다
- **status 를 바꿔 싣는 이유**: 옛 화면 코드가 이 행을 «남은 일»로 세지 않게(배포 순서와 무관하게 안전)

### 8. task_status_history
**Purpose**: Audit trail for task status changes
**Primary Key**: id (UUID)
**RLS Enabled**: No
**Records**: 693

#### Columns:
- `id` (UUID): Primary key
- `task_id` (UUID): References task.id
- `changed_by` (UUID): References resource.id - who made the change
- `old_status` (TEXT): Previous status (nullable)
- `new_status` (TEXT): New status
- `comment` (TEXT): Change comment (nullable)
- `changed_at` (TIMESTAMPTZ): Change timestamp (default: now())

### 8-1. task_submission (업무 제출, 2026-08-11 신설 · 값 제출 2026-09-03) — **옛 방식, 2026-10-01 은퇴 · 2026-10-05 화면 코드 제거**

> **2026-10-05**: 이 표를 쓰는 화면 코드를 걷어 냈다(제출 다이얼로그·설정 창·상세의 옛 제출 띠·작업 카드의 옛 줄 — 운영 실측 옛 설정 0건 · 이 표 0행). 할 일 저장도 `task.meta.submission` 을 더 쓰지 않는다(이미 있는 키 29건은 `required:false` 로 남음). **표와 옛 제출 RPC(아래 + 표 제출·실물 받음)는 다음 릴리스에 정리한다.** 아래는 기록이다.
>
> 2026-10-01 부터 새 제출은 작업 `submit.*` + `action_submission`(§16-1)이다. 옛 설정을 켠 할 일은 운영 0건(4건을 마감된 새 작업으로 옮김 — `20261001200000`)이라 아래 표·RPC 는 기록 보존용으로 한 릴리스 남긴다. `kind='physical'`·`mark_task_physical_submission` 은 같은 날 잠깐 쓰인 중간 단계(`20261001170000`)다.
**Purpose**: 담당자가 업무에 낸 제출 기록. **제출 유무가 곧 담당자 완료 상태**다.
방식 2종을 한 표에 모은다(`kind`) — 파일이든 값이든 제출의 단일 출처가 하나여야 카드 집계·완료 전이·취소 경로가 갈리지 않는다.
**Primary Key**: id (UUID)
**RLS Enabled**: Yes (FORCE)

#### Columns:
- `id` (UUID): Primary key
- `task_id` (UUID): References task.id (ON DELETE CASCADE)
- `assignee_resource_id` (UUID): 제출한 담당자의 resource.id — **FK 없음**(task.meta.assignees도 id만 담고, 학적 상태 변경으로 resource가 정리돼도 제출 이력은 남아야 함)
- `submitted_by` (UUID): References auth.users.id
- `kind` (TEXT, default `'file'`, CHECK `file|spec`, 2026-09-03): 제출 방식. `spec`=스펙 기반 **값 제출**
- `spec_document_id` (UUID, nullable, 2026-09-03): References task_work_document.id (**ON DELETE RESTRICT** — 제출 행을 먼저 지워야 문서를 지울 수 있다)
- `file_name` / `file_url` / `edit_url` (TEXT): 파일명과 Google Drive 링크. **`file_url`은 nullable**(값 제출은 파일이 없다) — 형태 강제는 아래 CHECK
- `google_drive_id` (TEXT), `mime_type` (TEXT), `file_size` (BIGINT)
- `meta` (JSONB, default `{}`)
- `unit_key` (TEXT, nullable, 2026-08-12): 과제 단위 업무의 제출이면 어느 단위(`task.meta.units[].key`)인지. 일반 업무는 NULL
- `created_at` (TIMESTAMPTZ, default now())

#### 설계 결정
- **task.meta가 아니라 별도 테이블인 이유 2가지**: ①`meta` JSONB 배열은 read-modify-write라 담당자 여러 명이 동시에 제출하면 **lost update로 파일이 조용히 사라진다** ②task 행을 읽을 수 있는 사람은 meta 전체를 읽으므로 "누가 제출했는지"가 API로 새어나가 담당자 명단 비노출 결정(2026-08-11)과 어긋난다. 행 단위 RLS가 필요했다.
- **제출물은 `documents`(서류함)에 등록하지 않는다** — documents는 교사 전원 읽기라 등록 즉시 열람 규칙이 무력화된다. 제출물의 단일 출처는 이 테이블.
- 파일 실체는 **Google 공용 드라이브**(`VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID`) 하위 `업무 관리/<연도>/<부서>/<이벤트>/<업무>` 경로. 업로드 직후 `setFilePermissions`가 `myschool.hs.kr` 도메인 writer 권한 부여. **철회 시 드라이브 원본도 best-effort 삭제(2026-08-12)** — 순서는 기록 삭제(RPC) → `deleteFileAndCleanupFolders`(빈 폴더 정리 포함). 반대 순서면 RPC 실패 시 죽은 링크를 가리키는 제출 행이 남는다. 파일 소유권은 업로더 개인이라(도메인 권한은 writer) **매니저가 남의 제출을 취소하면 Drive 삭제는 403으로 실패**하며, 이 경우(토큰 만료 포함) 기록 취소는 유지하고 파일만 남는다(`driveCleaned=false` 토스트 안내). 안 지우면 재제출 시 같은 이름의 고아 파일이 쌓인다(Drive는 이름 충돌 허용 — 덮어쓰기 아님).
- **수정(UPDATE) 정책 없음** — 파일 재제출 = 삭제 후 등록.
- **값 제출(`kind='spec'`, 2026-09-03)**: 파일 대신 `task_work_document`(plan/field_values/버전 계보)를 가리킨다. 형태는 `task_submission_kind_shape` CHECK 가 강제한다 — `file` ⇒ `file_url` 있음 ∧ `spec_document_id` 없음 / `spec` ⇒ `spec_document_id` 있음. **담당자·단위당 현재 1건**(부분 유니크 `task_submission_spec_one_current`, `where kind='spec'`)이고 **재제출은 같은 행의 참조를 새 버전으로 옮긴다**(삭제 후 삽입이면 완료 상태가 잠깐 pending 으로 흔들리고 이력이 2건 남는다). 그래서 이 경로만 예외적으로 RPC 안에서 UPDATE 한다(정책이 아니라 DEFINER). 상세 = `docs/features/task-spec-submission.md`

#### RLS 정책 (3종)
| 작업 | 허용 |
|------|------|
| SELECT | 본인 제출물 ∨ 본인이 담당자 ∨ 이벤트 매니저 ∨ admin |
| INSERT | 본인 명의(`submitted_by=auth.uid()`) ∧ 본인 resource ∧ **실제 그 업무의 담당자**(`is_task_assignee`) |
| DELETE | 본인 제출물 ∨ 이벤트 매니저 ∨ admin |

#### RPC
- `submit_task_submission(p_task_id, p_file_name, p_file_url, p_edit_url, p_google_drive_id, p_mime_type, p_file_size, p_meta, p_unit_key)`: 행 등록 + **담당자 상태 completed**를 한 트랜잭션에. 상태 파생·이력 기록은 재구현하지 않고 `set_task_assignee_status`를 호출해 재사용한다(SECURITY DEFINER 안에서도 `auth.uid()`는 유지되므로 그 함수의 권한 검사가 그대로 작동). **다중 마감(`meta.deadlines` 2개 이상) 업무는 거부**(0A000) — 회차별 완료는 `meta.deadlineProgress`에 따로 있어 "제출=완료" 한 줄로 표현되지 않는다. **과제 단위 업무(2026-08-12)는 `p_unit_key` 필수**이며 완료 전이는 `set_task_unit_status`(그 단위의 선택+완료)로 분기한다. 파라미터 추가 시 8-인자 구 오버로드는 PostgREST 모호성 방지를 위해 `DROP FUNCTION` 후 재생성했다(프로젝트 규약).
- `submit_task_spec_submission(p_task_id, p_document_id, p_unit_key)` (2026-09-03): **값 제출**. 파일 RPC 와 같은 골격(권한 → 배타 → 제출 행 → 담당자 상태 전이 재사용). 추가로 검증하는 것: 업무가 `meta.submission.mode='spec'` 인지, 문서 작성자가 본인인지, **문서가 이 업무의 제출용 WORK(`meta.submission.workId`)에서 만들어졌는지**. 제출 시점에 문서를 `draft → final` 로 고정한다(계보 트리거가 이 전이만 허용). 담당자 판정 키는 **`meta.assignees[].id`**(`resource_id` 아님).
- `delete_task_submission(p_submission_id)`: **kind 를 보지 않는다**(두 방식이 같은 코드로 취소된다). 삭제 후 그 담당자의 **남은 제출물이 0건이면 pending으로 되돌린다**('완료인데 제출물 없음' 방지). 과제 단위 업무는 **같은 단위의 남은 제출만 세어 그 단위만** pending으로 되돌린다(선택 기록은 유지 — 여전히 그 사람 몫). 편집으로 단위·담당자가 이미 지워졌으면 되돌릴 대상이 없으므로 기록 삭제만 확정.

#### 공용 헬퍼 함수 (같은 마이그레이션에서 신설)
- `current_actor_resource_id()`: 로그인 사용자의 resource.id — `user_resource` → 학생 계정 email prefix 폴백. `set_task_assignee_status` 안에 있던 로직을 단일 출처로 추출.
- `is_task_event_manager(task_id, resource_id)`: `event.meta.managers`(정본) ∨ `event.manager_id`(레거시).
- `is_task_assignee(task_id, resource_id)`: `task.meta.assignees` 배열 기준.
- `can_view_task_spec_document(document_id)` (2026-09-03, DEFINER): 값 문서 열람 판정 — 제출자 ∨ 담당자 본인 ∨ 이벤트 매니저 ∨ admin. **정책 안에서 표를 직접 조인하지 않고 함수로 뺀 이유**는 두 표가 서로를 참조하기 시작하면 42P17 재귀로 죽기 때문이다(창체에서 재발한 전례).

#### 연결된 task.meta 필드
`task.meta.submission = { required: boolean, guide: string|null, mode?: 'file'|'spec', workId?: uuid, template?: {id, name, familyId} }` — 매니저가 업무 편집에서 켠다. 켜지면 카드의 완료 토글이 제출 화면으로 바뀐다. **끌 때 키를 지우지 않고 `required:false`로 남긴다**(update 경로가 meta 얕은 병합이라 키를 빼면 예전 값이 살아남는다).
- **`mode` 가 없으면 `'file'`**(2026-09-03 이전 데이터 호환). 판정 단일 출처 = `src/lib/taskSubmissionConfig.ts` — 화면 4곳이 각자 읽으므로 복붙 금지.
- `mode='spec'` 이면 `workId`(담당자 전원이 공유 실행하는 제출용 WORK)와 `template`(고정 양식)이 함께 있어야 한다. `template.familyId` 는 양식에 새 버전이 등록됐을 때 현재 버전을 되찾기 위한 것 — `id` 만 두면 잠금이 조용히 풀린다.

#### 8-1-1. task_spec_submission_view (2026-09-03)
값 제출 평탄화 뷰(`security_invoker` — 하부 두 표의 RLS 를 그대로 계승: 매니저·admin 전원, 담당자는 본인 행만). 열 = 제출 메타(담당자·단위·시각·재제출 시각) + 문서(제목·버전·`template_version_id`·`plan`·`field_values`·`row_values`).
**`knowledge` 는 의도적으로 제외**한다 — 학생 데이터가 실릴 수 있다.
분석은 `field_values->>'키'` 로 바로 질의한다. 이것이 값 제출을 만든 이유다.

#### 라이브 검증 (2026-08-11, 롤백 트랜잭션)
담당자 본인 제출 시 `pending → completed` + `task.status=completed` 전이, 제출물이 **다른 사용자에게 0행**(RLS), 비담당자 제출 **차단**(42501), 삭제 시 `completed → pending` 복귀까지 8개 항목 확인.

### 8-2. Task 과제 단위 (task units, 2026-08-12 신설 — 테이블 없음, task.meta + RPC)
**Purpose**: 업무를 "사람"이 아니라 **과제 명칭 단위**(예: 과목별 평가계획서, 학급별 서류)로 배분·수합. 별도 테이블 없이 `task.meta` 두 키와 RPC 1개로 구성. 마이그레이션 `task_units_claim_model`.

#### task.meta 필드
- `units: [{key, label}]` — 과제 단위 목록(1개 이상일 때만 존재, 끌 때 **null 명시** — meta 얕은 병합 규약). `key`는 라벨과 무관한 안정 키(라벨 수정에도 수행 기록 유지)
- `unitProgress: {unitKey: {assigneeId: {status: 'pending'|'completed', completed_at}}}` — **항목의 존재 자체가 그 단위의 배정/자기 선택(claim)**이고 status가 수행 상태
- `assignees`(기존) = **담당자 범주(pool)**. 범주 담당자가 내 업무로 인식하고, 담당자 없는 단위를 카드에서 직접 선택(claim)한다

#### 파생 규칙 (사람 기준 집계와 다르다)
- 담당자 개인 상태 = "내 단위 ≥1개 && 전부 완료" → completed. 범주에만 있고 단위를 안 가진 사람은 pending
- `task.status` = "**모든 단위**가 담당자 ≥1명을 갖고 전원 완료" → completed. 범주에만 있는 사람은 완료를 막지 않는다
- 클라이언트 단일 출처 = `src/lib/taskUnits.ts`(파생·prune·payload·붙여넣기 파싱), 회귀 = `npx tsx scripts/task-units-test/run.mts`

#### RPC: `set_task_unit_status(p_task_id, p_unit_key, p_assignee_resource_id, p_status)`
`set_task_deadline_status`와 동일 골격(SECURITY DEFINER, FOR UPDATE 잠금, 이력 기록). `p_status`: `'pending'`=선택(claim)/미완료 되돌림, `'completed'`=완료, **NULL=선택 해제(기록 제거)**. 권한 = 본인 ∨ 이벤트 매니저, 대상은 범주(`meta.assignees`) 소속이어야 한다. **동시 선택이 서로를 지우는 JSONB read-modify-write 경쟁 때문에 클라이언트 직접 UPDATE 금지** — 이 RPC가 정본.

#### 제약·가드
- **`set_task_assignee_status`는 단위 업무를 거부**(0A000) — 사람 기준 task.status 재계산이 단위 기준 파생을 덮어쓰는 것을 방지
- **다중 마감(`meta.deadlines`)과 상호 배타** — UI 비활성 + 저장 검증 + (제출 RPC의 기존 거부)로 방어
- 파일 제출과는 **함께 쓸 수 있다**: 제출 다이얼로그에서 단위를 골라 제출하면 그 단위가 선택+완료된다(§8-1 `p_unit_key`)

#### UI 경로
편집 = `TaskEditDialog` "과제 단위별" 모드 + `TaskUnitEditor`(프리셋: 과목별=`teacher_timetable` 현행 학기, 학급별=`resource_tags` "N학년 M반" 담임 — **불러온 시점 스냅샷**, 라이브 참조 아님; 엑셀 2열 붙여넣기). 카드 = `TaskAssigneeSummary` 단위 모드 — 매니저는 단위×담당자 전체 현황, **비매니저는 내 단위 + 미선택 단위만**(남이 맡은 단위는 개수로만 — 담당자 명단 비노출 결정 유지). 토글 훅 = `useToggleUnitStatusJsonb`.

#### 라이브 검증 (2026-08-12, 실사용자 JWT 시뮬레이션 후 정리)
범주 담당자 선택→완료 전이, 타인 단위 토글 차단(42501), 단위 업무에 사람 RPC 가드(0A000), 전 단위 완료 시 task completed, 선택 해제 시 기록 제거+task pending 복귀까지 6단계 확인.

## Document Management (서류함, 2026-08-11 전면 개편)

### 9. documents
**Purpose**: 서류함 파일·Google Drive 링크 대장 (실데이터의 대부분은 Drive 파일/링크)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key
- `user_id` (UUID): Document owner
- `title` (TEXT): Document title
- `file_name` (TEXT): Original filename
- `file_type` (TEXT): MIME type
- `file_size` (BIGINT): File size in bytes
- `storage_path` (TEXT): **2026-08 이후 로컬 업로드 = `documents` 버킷(비공개) 상대경로 `library/{uid}/{ts}_{uuid}.{ext}`** (열람은 signed URL). 레거시 행·Drive 파일 = http URL 그대로
- `upload_status` (TEXT): Status - 'processing', 'completed', 'failed' (default: 'processing')
- `meta` (JSONB): Document metadata (default: '{}')
- `is_hidden` (BOOLEAN): admin 숨김 플래그 (기본 false)
- `created_at` / `updated_at` (TIMESTAMPTZ)

#### JSONB Meta 주요 키:
- `directory_path`: **가상 폴더 경로** ('/' 구분, 표시·트리 전용 — Storage 물리 경로와 무관)
- `department` / `category` / `description` / `keywords[]` / `search_keywords[]`: 분류·검색
- `storage_bucket`: 로컬 업로드 파일의 버킷 (신규 = 'documents')
- `is_google_drive_file` / `google_drive_id`: Drive 연동
- `source {id,type,title}`: 업무/이벤트 시스템 자동 등록분 (서류함에서 삭제 불가)
- `is_pinned`: 우선 표시 (admin)

#### RLS (2026-08-11 재설계 — 마이그레이션 `documents_library_overhaul`):
- SELECT: `is_teacher_or_admin(auth.uid())` — **교사/admin 전용, 학생·anon 완전 차단** (구 "is_hidden=false면 전원+anon 열람" 정책 제거)
- INSERT: `user_id = auth.uid() AND is_teacher_or_admin()`
- UPDATE / DELETE: **본인 또는 admin** (구 "모든 교사가 모든 문서 ALL" 정책 제거)
- 클라이언트는 update/delete 후 `.select('id')` 반환 행으로 RLS 차단(0행)을 감지
- 라우트도 `/documents`가 `ProtectedRoute allowed=['teacher','admin']`로 보호됨

#### Foreign Key Relationships:
- `user_id` → `profiles.id` (CASCADE on delete)

### 9-1. document_folders (2026-08-11 신설)
**Purpose**: 가상 폴더 registry — 빈 폴더 표현용. 폴더 트리 = documents의 `meta.directory_path` 유도 경로 ∪ 이 테이블
- `id` (UUID PK), `path` (TEXT UNIQUE, 선행/후행/이중 슬래시 금지 CHECK), `created_by` (UUID, default auth.uid()), `created_at`
- RLS (마이그레이션 `document_folders_teacher_create`): SELECT=교사/admin, **INSERT=교사/admin**(`created_by = auth.uid()` 강제 — 폴더 생성은 교사 전체 개방), UPDATE/DELETE=**admin 전용**(이름변경·이동·삭제)

#### RPC `move_document_folder(p_old_path, p_new_path)` (SECURITY DEFINER, admin 가드):
폴더 이동/이름변경을 **단일 트랜잭션 prefix 치환**으로 수행 — documents의 `meta.directory_path`와
document_folders.path를 함께 치환(하위 경로 포함), 목적지 중복 폴더는 병합. 반환값 = 갱신된 문서 수.
LIKE 대신 `left()` 문자열 prefix 비교를 사용해 `%`/`_` 이스케이프 함정 회피. anon/public EXECUTE revoke.

#### Storage:
- `documents` 버킷(private) `library/{uid}/...`: INSERT=본인 경로만, SELECT=교사/admin, DELETE=본인 또는 admin
- `kijunspace` 버킷(public)은 서류함 신규 업로드에 더 이상 사용하지 않음 (타 기능은 계속 사용)

## Notification System

### 10. notification_events
**Purpose**: System notifications and alerts
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 2

#### Columns:
- `id` (UUID): Primary key
- `user_id` (UUID): Target user
- `type` (TEXT): Notification type (default: 'schedule_created')
- `title` (TEXT): Notification title
- `message` (TEXT): Notification content
- `related_meeting_id` (UUID): Optional meeting reference (nullable)
- `related_user_id` (UUID): Optional user reference (nullable)
- `is_read` (BOOLEAN): Read status (default: false)
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### Notification Types:
- `schedule_created`: New schedule items
- `task_assigned`: Task assignments
- `event_updated`: Event modifications
- `document_shared`: Document sharing notifications
- `training_reminder`: Training session reminders
- `coolmessenger`: 쿨메신저에서 받은 쪽지 — 교직원 PC 의 로컬 감시기가 넣는다. `meta.sender`(표시 이름, `임로아(학년부장)`)·`sender_plain`·`message_key`·`received_at`. 여러 쪽지를 묶은 알림은 제목 `[쿨메신저] 새 쪽지 N건` + 본문 = 보낸 사람 명단이고 `meta.sender` 가 없다. 한 달 뒤 자동 삭제(`docs/features/coolmessenger-notification-retention.md`)
- `direct_reply` (2026-09-22): 알림 [답장] — **`send_notification_reply` RPC 로만** 만든다(보낸 사람 위조 방지). `meta = {source:'spacekijun_reply', sender_resource_id, sender_name, reply_to_notification_id?, reply_to_type?, quote?}`. 답장한 원래 알림에는 `meta.replied_at / replied_to_resource_id / replied_to_name` 이 붙고 읽음 처리된다. 상세 = `docs/features/notification-reply.md`

> ⚠ 위 Columns 목록은 초기 스키마 기준이라 낡았다 — 실제 수신자 키는 `user_id` 가 아니라 **`resource_id`**(→ `resource.id`)이고, `meta`(JSONB)·`priority`(`low|medium|high` CHECK) 컬럼이 있으며 `related_user_id` 는 없다. RLS = SELECT/UPDATE/DELETE `owns_notification_resource(resource_id)`, INSERT `with check (true)`.

### 11. department_notice (부서 공지사항)
**Purpose**: 부서별 공지사항 (공지사항 페이지 `/notices` + 홈 대시보드 학사 정보 알림 카드)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key
- `department` (TEXT): 부서명 (`department` 테이블 name 참조 — FK 없음, 문자열 스냅샷)
- `title` (TEXT): 공지 제목
- `content` (TEXT): 공지 내용
- `start_date` (DATE): 게시 시작일 (default: CURRENT_DATE)
- `end_date` (DATE): 게시 종료일 (inclusive, CHECK end_date >= start_date)
- `created_by` (UUID): 작성자 auth user id (default: auth.uid())
- `author_name` (TEXT): 작성자 이름 스냅샷 (nullable)
- `attachments` (JSONB, default `[]`): 첨부파일 배열 — tasks의 TaskFile 호환 `{id, name, url, size, type, uploaded_at, uploaded_by, isGoogleDrive?, googleDriveId?}`. 로컬 파일=Storage `kijunspace/notice/<id>/`, Google Drive=`GoogleDriveIntegrationService`(targetType 'document') 재사용, 양쪽 모두 documents 테이블에도 등록(부서 문서함 노출). 제거/공지 삭제 시 best-effort 정리(Drive 원본은 보존)
- `target_resource_ids` (UUID[], nullable, 2026-09-17 추가): 열람 대상 `resource.id`. **NULL 또는 빈 배열 = 교직원 전체 공개(기존 동작)**, 값이 있으면 그 사람 + 작성자 + admin 만 볼 수 있다. GIN 인덱스 `department_notice_targets_idx`. ⚠ 학생은 역할 필터에 막혀 이 표를 아예 못 읽으므로 **학생 id를 넣어도 공지로는 도달하지 않는다**(알림을 쓸 것)
- `survey_id` (UUID, nullable, FK → `schedule_survey.id` ON DELETE SET NULL, 2026-09-17 추가): 이 공지가 알리는 일정 설문. 설문이 지워져도 공지는 남는다
- `created_at` / `updated_at` (TIMESTAMPTZ): 생성/수정 시각 (`department_notice_set_updated_at` 트리거)

#### 활성(게시 중) 판정:
`start_date <= 오늘 <= end_date`. 서버 필터 없이 전체 페치 후 클라이언트 로컬 날짜로 판정
(`src/features/notice-board/utils/noticeDates.ts`).

#### RLS 정책:
- SELECT: 교사/직원/admin **그리고** 대상 조건 — `target_resource_ids IS NULL ∨ 빈 배열 ∨ created_by = auth.uid() ∨ admin ∨ 내 resource ∈ target`
  (2026-09-17 대상 지정 추가. 실측: 기존 공지 5건은 교사 5·직원 5·admin 5·학생 0·anon 0 으로 **변화 없음**, 대상 1명 지정 시 대상 교사 1·비대상 직원 0·작성자 admin 1·학생 0)
- INSERT: 교사/직원/admin + `created_by = auth.uid()` 본인 명의만
- UPDATE / DELETE: 작성자 본인 또는 admin

⚠ 이 표의 클라이언트 삽입은 `.insert().select().single()` 이라 **SELECT 정책이 새 행에 WITH CHECK 로 다시 적용된다**. 그래서 SELECT 정책은 전부 새 행의 컬럼으로 판정하고, `department_notice` 를 id 로 되읽는 STABLE 함수를 쓰지 않는다(쓰면 문장 스냅샷에 새 행이 없어 공지 작성이 항상 실패한다 — 2026-09-12 학생 협업보드 생성 실패와 같은 함정).

#### 연동:
- 구 `dashboard_info_boxes`의 '학사 정보 알림' 카드(id c5c0f392…)는 **is_active=false로 비활성화** (2026-07-22) — 대시보드 학사 정보 알림은 이 테이블 기반 `NoticeInfoCard`가 대체
- 인덱스: `(start_date, end_date)`, `(department)`

### 12. schedule_survey / schedule_survey_response (일정 설문, 2026-09-17 신설)
**Purpose**: 선택한 사용자에게 "어떤 날에 무슨 일을 하면 좋을지"를 물어 수합하고, 그 결과로 스케줄(meeting) 일정을 만든다. 진입점 = `/schedule` 헤더 [일정 설문]
**RLS Enabled**: Yes (두 표 모두)

#### schedule_survey
- `id` (UUID): PK
- `title` (TEXT, NOT NULL, `length(btrim(title)) > 0`)
- `description` (TEXT, nullable)
- `created_by` (UUID, default `auth.uid()`): 주최자 auth user id — **권한 판정의 기준**
- `owner_resource_id` (UUID → `resource.id`, ON DELETE SET NULL) / `owner_name` (TEXT): 표시·알림용 스냅샷
- `target_resource_ids` (UUID[], default `{}`): 설문 대상자 `resource.id`. **교사·직원·학생 모두 가능**. 여기 없으면 설문 자체가 보이지 않는다(RLS). GIN 인덱스
- `candidate_dates` (DATE[], default `{}`): 주최자가 제시한 후보 날짜
- `allow_custom_dates` (BOOLEAN, default true): 응답자가 후보 밖 날짜도 제안할 수 있는가
- `due_date` (DATE, nullable): 응답 마감일 — **표시·정렬용이고 서버가 강제하지 않는다**(차단은 `status`가 한다)
- `status` (TEXT, default 'open', CHECK `open|closed`)
- CHECK `schedule_survey_answerable`: `allow_custom_dates ∨ cardinality(candidate_dates) > 0` — 후보도 없고 자유 제안도 막으면 아무도 응답할 수 없다

#### schedule_survey_response
- `id` (UUID): PK, `survey_id` (UUID → schedule_survey, ON DELETE CASCADE)
- `respondent_resource_id` (UUID → `resource.id`, ON DELETE CASCADE) / `respondent_name` (TEXT)
- `items` (JSONB, default `[]`, CHECK `jsonb_typeof = 'array'`): `[{date:'YYYY-MM-DD', available:boolean, activity?:text}]`
- `comment` (TEXT, nullable)
- UNIQUE `(survey_id, respondent_resource_id)` — **(설문, 응답자) 1행**
- 저장은 upsert(`onConflict: 'survey_id,respondent_resource_id'`)로 통째 교체

**왜 응답 항목을 별도 표가 아니라 JSONB로 두었나**: JSONB read-modify-write 유실은 *여러 사람이 한 JSONB를 쓸 때* 생기는데, 여기서는 UNIQUE 제약 덕에 **각 응답자가 자기 행만 쓴다**. 집계 대상도 한 설문당 수십 행이라 클라이언트 집계로 충분하다. 판정·집계 단일 출처 = `src/features/schedule-survey/utils/surveyAggregate.ts`

#### 판정 함수 (전부 SECURITY DEFINER)
- `current_actor_resource_ids()`: **신원 해석 전역 단일 출처**. `user_resource` 링크(교직원) + 학생(이메일 prefix ↔ `resource.meta->>'id'`). `collab_actor_resource_ids()`가 2026-09-17부터 여기에 위임한다(정의 중복 제거, 동작 동일 — 리팩터 전후 교사·직원·학생·admin 4명의 출력과 협업보드 가시성이 모두 일치함을 실측)
- `can_manage_schedule_survey(uuid)`: 주최자 ∨ admin
- `is_schedule_survey_target(uuid, uuid)`: 그 resource가 대상자 명단에 있는가
- 세 함수 모두 맨 앞에 `auth.uid() is not null` 가드가 있다(3값 논리로 익명이 통과하는 것을 막는다)

#### RLS 정책
- `schedule_survey` SELECT: 주최자 ∨ admin ∨ 대상자 — **전부 새 행의 컬럼으로 판정**(`insert ... returning` 통과 필요)
- `schedule_survey` INSERT: `created_by = auth.uid()` ∧ `is_staff_teacher_or_admin(auth.uid())` → **학생은 설문을 만들 수 없고 응답만 한다**
- `schedule_survey` UPDATE/DELETE: 주최자 ∨ admin
- `schedule_survey_response` SELECT: 본인 응답 ∨ `can_manage_schedule_survey(survey_id)` → **응답자는 자기 것만, 주최자는 전원**
- `schedule_survey_response` INSERT: 본인 ∧ 대상자 명단에 있어야 한다
- `schedule_survey_response` UPDATE: 본인만 / DELETE: 본인 ∨ 주최자

**실사용자 검증 (2026-09-17)**: 교사가 설문 생성(`insert..returning`) 성공 → 대상 직원 1·대상 학생 1·비대상 교사 **0**·admin 1 / 대상자 응답 삽입(`insert..returning`) 성공, 비대상 교사 응답 **42501 거부** / 응답 열람 = 응답자 각 1, 주최자 2, 무관 교사 0, anon 0 / 직원(staff)도 설문 생성 가능

#### 익명(anon) 권한 주의
`is_schedule_survey_target`·`can_manage_schedule_survey` 는 PUBLIC·anon EXECUTE를 **회수**했고 `current_actor_resource_ids`만 anon에 남겼다. 이유는 `docs/features/schedule-survey.md` 참고 — 요약하면 ①새 함수의 EXECUTE는 `anon`이 아니라 **PUBLIC**에 붙으므로 `revoke ... from anon`만으로는 아무것도 막지 못한다 ②그런데 정책식 안의 함수는 호출자 권한으로 실행되고 SQL이 OR 단축 평가를 보장하지 않아, 기존 표(`department_notice`)의 익명 조회가 "0행"에서 "42501"로 바뀐다.

## 교사 메타데이터 (2026-09-23)

상세·설계 이유 = `docs/features/duty-assignment.md`.

### 13. department / department_member

| 표 | 칼럼 |
|---|---|
| `department` | id, name(UNIQUE), description, category(`school`\|`simple`\|`custom`), is_active, display_order |
| `department_member` | id, department_id → department(cascade), resource_id → resource(cascade), **academic_year int NOT NULL(기본값 없음)**, UNIQUE(department_id, resource_id, academic_year) |

- 2026-09-23: `교육정보부` → `정보화부`(+ `work.meta.department`·`department_notice.department`·`documents.meta.department` 문자열 동시 갱신, `documents.meta.directory_path` 는 드라이브 폴더라 유지). 추가 `신학년부`·`어문학부`·`수리과학부`·`예능사회부`·`행정실`.
- 쓰기: `set_department_members(p_department_id, p_academic_year, p_resource_ids)` — admin, 그 학년도만 교체. RLS: 읽기 전원, 쓰기 admin.
- 이 표의 생성 마이그레이션은 저장소에 없다(원격에서 만들어짐) — 변경은 `20260923151000_department_rename_and_year.sql`.

### 14. duty_seat / duty_seat_holder (업무분장)

| 표 | 칼럼 |
|---|---|
| `duty_seat` | id, academic_year, name, department_id → department(set null), kind(`head`\|`admin`\|`duty`\|`support`), areas jsonb `[{name, edufine_task}]`, sort_order, note, meta, UNIQUE(academic_year, name) |
| `duty_seat_holder` | id, seat_id → duty_seat(cascade), resource_id → resource(set null, **NULL 허용 = 미연결 이름**), holder_name, role(`primary`\|`co`), start_date, end_date(NULL = 열린 끝) |

- 기간 판정 = `duty_holder_active(start, end, on)` 단일 출처. 복사 = `copy_duty_seats(from, to, keep_holders)`(admin).
- RLS: 읽기 `is_staff_teacher_or_admin(auth.uid())`, 쓰기 `is_admin()`. 시드 = 업무 지도 artifact(2026-09-22) — 자리 45·담당자 39.

### 14-1. work_candidate (업무 후보, 2026-09-24)

「아직 시스템에 올라오지 않았지만 실제로 하고 있는 일」. 학교 업무 지도의 **빈 칸이 무엇으로
비었는지**를 말한다. 라이브(2026-09-28 재검토 반영 목록): 후보 **306**(영역 71 + 업무 235 — 행정실 47),
자리 연결 268, 근거 문서 9,236건(합친 뒤 8,980줄).

| 칼럼 | 뜻 |
|---|---|
| `academic_year`, `kind`(`area`\|`work`), `code` | artifact 식별자 — 업무 = **이름 해시 `P…`**(2026-09-28, 옛 위치 코드 `W086`·`A01` 은 판마다 다른 업무를 가리켜 폐기)/영역 키. **사람이 만든 후보는 NULL** = 시드 갱신 대상 아님 |
| `name`, `area_name`, `note` | 사람이 고치는 값 — **시드가 덮지 않는다** |
| `seat_id` → duty_seat(set null) · `seat_name` · `seat_label` | 연결 · 조인용 이름 · artifact 원본 라벨(연결이 끊겨도 "누구 일이었는지"는 남는다) |
| `department` | **부서 이름**(id 아님) — `event.meta.department` 와 같은 공간이라야 부서 축에서 나란히 선다 |
| `brm`, `work_type`, `scale`, `load`, `months int[]`, `repeat_hint`, `counts jsonb` | 공문 분석값(접수·의무·생산·행정실 지원·단계 수) |
| `budget bigint` | 사업비(원) — **칼럼인 이유는 정렬·필터**(돈 걸린 업무부터). 46건 / 29.2억 |
| `meta.owner` · `meta.tier_counts` · `meta.carried_from` | **분장표 ↔ 문서가 가리키는 사람**(`seatPeople`·`top`·`grade`·`same`·`subject`·`people[[이름,등급,문서 수,분장 사람]]`) · 근거 등급별 문서 수(`EVIDENCE_TIERS` 순서) · 옛 카탈로그에서 값을 이어받은 업무 이름(2026-09-28) |
| `meta.detail` · `meta.budget` · `meta.budget_notices` · `meta.supports` · `meta.office` | 공문 본문 상세 19건 · 사업비 세부 · 예산 관련 공문 제목 · 행정실 업무가 떠받친 교무실 업무 · `'admin'`=행정실 업무. (옛 `notices`·`seat_check`·`seat_override`·`actual_seats`·`from`·`acts` 는 2026-09-28 시드가 **교체**로 지웠다) |
| `procedures jsonb` | **사람 × 업무 절차 검토** `[{person, kind('절차'\|'반복'\|'일회성'\|'참고'), cycle, summary, revised, steps[{name, by, docs[{date,dir,title}]}], related[{person, work, role, docs[]}]}]` — 목록 조회에서 빼고 펼칠 때만 읽는다(마이그레이션 `20260929110000`, 원본 `scripts/work-candidate-seed/procedures-2026.json`). 목록 칩 요약 = `meta.procedure_summary` |
| `evidence jsonb` | **근거 문서** `[{date:'MM-DD', dir:0\|1(1=기안), tier:0~7, title\|null(가림), who:text[]}]` — 목록 조회에서 **빼고**(업무 하나 최대 1,000건↑, 전체 ~400KB) 서랍에서 펼칠 때 `useWorkCandidateEvidence` 가 한 줄씩 읽는다(마이그레이션 `20260928120000`) |

- UNIQUE `(academic_year, kind, code) where code is not null` — 시드 재적재가 중복되지 않고 **갱신**된다.
- RLS: 읽기·쓰기·삭제 모두 `is_staff_teacher_or_admin(auth.uid())`(업무 관리 화면의 관객과 같다).
  삭제가 정상 사용이라 막지 않는다 — 지운 것은 시드를 다시 넣으면 돌아온다.
- **`event`/`task` 를 참조하지 않는다** — 후보는 Work 가 아니다(사용자 결정).
- **공문 본문 상세의 요구·학교절차 «원문»은 담지 않는다** — 개수만(`meta.detail.requestCount`). 근거 문서 제목은 artifact 가 개인 사안을 가려 넘긴 것(`title=null`)을 그대로 둔다.
- **행정실 업무**(`meta.office='admin'`) — 새 목록은 교무실·행정실을 한 목록에 담는다. 1차 시드가 행정실 모집단을 빠뜨려 행정실 자리 9개가 전부 0이었던 사고가 있어 회귀가 수를 본다.
- 시드 = `20260929110100`(재검토 반영 목록 2차 판 + 절차 검토. 1차 = `20260928120100` — 옛 artifact 업무 행을 **지우고** 넣는다, `meta` 는 결합이 아니라 교체). 생성기 `scripts/work-candidate-seed/`. 상세 = `docs/features/work-map.md` §3-2.

### 15. subject_classification (교과 분류)

`subject_name` PK, `subject_group`(2022 개정 교과(군) 10종 — `subject_group_names()`), `source`(`auto`\|`manual`), updated_at/by.
- 조회 = `subject_group_of(subject)` — 표 → 없으면 `normalize_subject_group(school_curriculum.category)` 폴백 → 둘 다 없으면 NULL(미분류).
- **교과 묶음(2026-09-24)**: `cluster_override`(NULL = 교과(군)에서 유도) · `subject_cluster_names()`(7종) · `subject_cluster_of_group(group)` · `subject_cluster_of(subject)`. 어문학과 = 국어·제2외국어/한문, 예체능 = 기가·정보·체육·예술·교양(교육학 예외 = 교양). `audience_teaching_rows` 에 `subject_cluster` 칸, 수업 조건 `subjectClusters` 는 `subjectGroups` 와 OR.
- 관리 화면용 = `subject_group_catalog(p_academic_year)` — 분류 표 ∪ 그 학년도 개설 과목, 교과(군)·묶음·묶음 예외·판정 출처(`manual`/`auto`/`fallback`/`none`).
- RLS: 읽기 전원, 쓰기 admin. `current_academic_term()` = 학사력 → 없으면 최신 교사 시간표 학기.

## 할 일 작업 「메시지 보내기」 (2026-09-24)

상세 = `docs/features/task-message.md`.

### 17. task_message_send

id, action_id → task_action(cascade), task_id, sent_at, sent_by, sender_resource_id, sender_name, title, body, rule_snapshot, recipient_ids uuid[], recipient_names text[], unlinked_names text[]. 읽기 = `can_manage_task_action(action_id)`, 쓰기 = RPC(`update_message_config` · `send_task_message`) 전용. 알림 type `task_message`, `meta.task_id`. `club_info.meta.place` = 동아리 활동 장소, `club_info.meta.status` = `active`|`inactive`(지금은 없는 동아리 — 지우지 않고 기록, `inactive_since`·`inactive_reason`) (2026-09-24).

## 할 일 작업 「입력 받기」 (2026-09-23)

상세 = `docs/features/collect-input.md`. **쓰기는 전부 RPC**(세 표 모두 INSERT/UPDATE/DELETE 권한 회수).

### 16. collect_request / collect_target / collect_response

| 표 | 칼럼 |
|---|---|
| `collect_request` | action_id PK → task_action(cascade), task_id, status(`open`\|`closed`), academic_year, semester, axis(`person`\|`subject`\|`class`), answer_mode(`each`\|`shared`), visibility(`private`\|`shared`), rule_snapshot, config_snapshot, started_at/by, closed_at, closed_reason(`manual`\|`task_completed`\|`task_cancelled`\|`archived`) |
| `collect_target` | id, action_id → collect_request, unit_key(`person` \| `학년|과목` \| `학년|과목|반`), unit_label, resource_id(NULL = 미연결 이름), holder_name, reasons text[], removed_at — UNIQUE(action_id, unit_key, coalesce(resource_id, 'name:'‖holder_name)) |
| `collect_response` | id, action_id, unit_key, dimension_key('' = 구분 없음), owner_key(each = 응답자 id, shared = ''), responder_resource_id, values jsonb(object), created/updated_at — UNIQUE(action_id, unit_key, dimension_key, owner_key) |

- 설정(설계)은 `task_action.config.collect` — 실행 상태를 config 에 두지 않는 이유: 업무 흐름 복사·연간 가져오기가 config 를 통째로 복제한다.
- RPC: `resolve_audience(rule, axis, year, semester)` · `update_collect_config` · `start_collect_request` · `sync_collect_targets(action, apply)` · `submit_collect_response` · `set_collect_request_status` · `remind_collect_pending` · `get_collect_board` · `my_collect_requests`. 판정 = `can_manage_collect(action)`(작성자 ∨ `is_work_manager` ∨ admin) · `is_collect_target(action)`. PUBLIC·anon 회수.
- 트리거: `task.status` → completed/cancelled 이면 요청 마감 · `task_action.archived_at` 설정 시 마감 · 요청이 있는 `task_action` 삭제 거부(`auth.uid()` 가 있을 때 — 계정 삭제 cascade 는 막지 않음).
- RLS SELECT: 응답 = 본인 ∨ 매니저 ∨ (공개 표 ∧ 대상자) ∨ (과목당 한 번 ∧ 같은 단위 공동 담당). 명단 = 매니저 ∨ 본인 ∨ (공개 표 ∧ 대상자).
- 알림 `notification_events.type = 'collect_input_requested'`, `meta.action_id` → `/my-tasks?collect=<id>`.

### 16-1. 제출 받기 작업 — `collect_request.kind` · `action_submission` (2026-10-01)

상세 = `docs/features/submit-action.md`. 마이그레이션 = `20261001180000_submission_actions.sql` · `20261001190000_submission_units.sql` · `20261001200000_migrate_legacy_submissions.sql`.

- `collect_request.kind`(`input`·`file`·`document`·`physical`, 작업 유형에서 유도 `request_kind_of`) · `axis` 에 `unit` 추가(과제 단위 할 일의 제출 요청 — 대상은 사람 축으로 풀고 단위는 낼 때 고른다).
- 설정 = `task_action.config.submit`(`submit_cfg_of` — 비면 대상 기본 `{include:[{type:'task_assignees'}]}`). `request_cfg_of(type, config)` 가 입력/제출 설정을 고른다.
- **`action_submission`**: id, action_id → collect_request(cascade), resource_id → resource, kind(`file`|`document`|`physical`), unit_key(단위 축만), file_name·file_url·google_drive_id·mime_type·file_size, document_id → task_action_document, received_at·received_by(실물), submitted_by, created/updated_at. 모양 CHECK `action_submission_shape`, 부분 유니크(문서·실물 = 사람×단위당 1행). RLS SELECT = 요청 매니저 ∨ 본인, **쓰기 권한 회수**(RPC 전용).
- RPC: `submit_action_file` · `submit_action_document`(문서의 `action_id` 가 이 작업이어야 — 옛 `workId` 결함 해소) · `mark_action_received`(매니저) · `delete_action_submission`(담당자는 실물 기록 불가) — 모두 `p_unit_key` · `resolve_task_audience(rule, task_id, axis)`(미리보기).
- 판정: `submission_target_pending/complete(action, resource)` · `assignee_has_pending_submission(task, resource)` · `unit_has_pending_submission(task, resource, unit)` · `submission_held_units(task, resource)`.
- 트리거: `guard_submission_completion`(task BEFORE UPDATE OF meta — 담당자·단위가 completed 로 바뀌는데 채우지 않은 열린 제출 요청이 있으면 거부) · `follow_task_assignees_in_requests`(task AFTER UPDATE — 담당자가 바뀌면 «이 할 일의 담당자»가 든 요청의 명단을 다시 계산) · ~~`auto_start_submission_request`~~(대상이 담당자뿐이면 만들 때 요청을 열던 트리거 — **2026-10-01 제거** `20261001210000`, 요청은 [요청 보내기]로만 연다).
- 입력 받기 RPC 일반화: `start_collect_request`·`sync_collect_targets`(내부 `_start_action_request`·`_sync_action_targets` 로 분리 — 트리거가 권한 확인 없이 부른다, `authenticated` 실행 회수) · `update_collect_config`(제출은 `config.submit`) · `remind_collect_pending` · `get_collect_board`(`kind`·`submissions`·`units`·`unit_progress`) · `my_collect_requests`(`kind`, 제출은 사람/맡은 단위당 한 칸) · `collect_notify`(제출은 `submission_requested`). 입력 받기 가지의 본문은 바꾸지 않았다.
- 운영 롤백 드라이런: 사람 축 17종 · 단위 축 11종 · 옮기기(알림·상태 변화 0) — 기록은 기능 문서.

## 업무 진행 화면 — 할 일 산출물 · AI 제안 (2026-09-27)

상세 = `docs/features/work-pipeline.md`. 마이그레이션 = `20260927120000_work_pipeline.sql`.

### 18. task_output_value

task_id PK → task(cascade), kind(`value`|`people`|`table`), payload jsonb(≤512KB), provenance jsonb(어디서 왔나 — 앞 단계 표에서 고른 줄이면 `fromTaskId`·`sourceLabel`·`rowKeys`·`pickedAt`), updated_by → auth.users, updated_by_name, created_at, updated_at.
- **사람이 직접 남긴 산출물만** 담는다. 자동으로 유도되는 것(입력 받기 표·발송 기록·제출물·스펙 문서)은 원본 표가 이미 있고 가시성도 거기서 판정되므로 여기 두 벌 두지 않는다. **스냅샷**이다(앞 단계가 나중에 바뀌어도 이미 넘긴 것은 그대로).
- payload 모양: `value` = `{text}` · `people` = `{people:[{resourceId|null, name}]}` · `table` = `{columns:[{key,label}], rows:[{key, cells, people?}]}` — 서버 RPC 가 형태별로 한 번 더 본다.
- 읽기 = `can_view_task_output(task_id)` — 업무 매니저 ∨ **같은 업무의 어느 할 일이든 담당자** ∨ admin(뒤 단계 담당자가 앞 단계 산출물을 받아 쓰는 것이 이 표의 목적). task 는 전원 열람이지만 이 표는 좁힌다(명단 비노출 결정과 같은 결).
- 쓰기 = RPC 전용 `save_task_output(task, kind, payload, provenance)` · `clear_task_output(task)`, 판정 `can_write_task_output(task)` = 업무 매니저 ∨ **그 할 일의** 담당자 ∨ admin. 담당자 판정 = `is_task_assignee_actor(task)`(`meta.assignees[].id` ∈ `current_actor_resource_ids()`). 쓰기 정책 없음. 네 함수 모두 PUBLIC·anon 회수.
- 선언(무엇을 남기는가)은 이 표가 아니라 `task.meta.output = {kind, label?}` (지난 업무 가져오기 규칙 `keep`).

- **2026-09-27 보강**(`20260927130000`): `restricted boolean`(비공개 원천에서 가져온 표 — 매니저·관리자만, SELECT 정책이 `is_task_work_manager_actor`) · `save_task_output(…, p_restricted)` 가 명단·표 줄의 사람 이름을 `resource.name` 으로 다시 쓰고(`normalize_output_people`), 다른 업무를 가리키는 `provenance.fromTaskId` 를 버리고, 선언된 형태와 다르면 거부 · 선언 저장 = `set_task_output_decl(task, decl)`(그 키만, 매니저·만든 사람·관리자).

### 19. task_ai_suggestion

id, work_id → work(cascade), task_id → task(cascade, NULL = 업무 전체), kind(`work_check`|`table_tidy`|`table_to_text`), input_hash(FNV-1a 64 — 같은 입력이면 7일 동안 다시 부르지 않는다), model, result jsonb(≤256KB), usage jsonb(초·토큰·finish·버린 지적 수), decisions jsonb(`{항목id: 'applied'|'dismissed'}` = AI 칸별 수락률), created_by → auth.users(cascade), created_at, updated_at.
- RLS: SELECT = 본인 ∨ admin(지표용), INSERT = 본인 ∧ `is_staff_teacher_or_admin`, UPDATE = 본인. SELECT 정책이 **새 행의 컬럼(created_by)으로 직접** 판정되므로 `INSERT … RETURNING` 함정에 걸리지 않는다(실측 확인).
- 인덱스: (created_by, kind, input_hash, created_at desc) — 캐시 조회, (work_id, created_at desc).

- 결정 기록 = `record_ai_suggestion_decision(id, item, decision)` — jsonb 병합(원자적, 본인 행, INVOKER). decision ∈ applied·dismissed·copied.

### 20. 구조 필드 가드 (2026-09-27, 앱 전체)

`work.created_by uuid default auth.uid()`(서버가 정하고 못 바꾼다) + 트리거 `guard_task_structure`·`guard_work_structure`(**SECURITY INVOKER** —
DEFINER 면 current_user 로 직접 쓰기를 가를 수 없다). 직접 쓰기(`current_user='authenticated'`)에서 task 담당자 id 집합·업무 이동·담당자 든 INSERT·DELETE,
work 매니저 변경·DELETE 는 `can_manage_work_structure(work)` = 관리자 ∨ 매니저 ∨ 만든 사람만. 담당자 **상태**만 바뀌는 변경과 DEFINER RPC 는 통과.
헬퍼 `jsonb_person_ids(jsonb)`. 근거 = `docs/features/work-pipeline.md` «적대적 검증».

### 21. 조건으로 고르기(학생·교직원) — 함수 5개 + 표 1개 (2026-10-01)

마이그레이션 `20261001120000_student_audience.sql`(학생 함수) · `20261001140000_student_audience_saved_rule.sql`(표) ·
`20261001160000_audience_selection_v2.sql`(학생 조건 `past_course`·`teacher_students` + `resolve_faculty_rule` + 표 `target` 열).

- `resolve_faculty_rule(p_rule jsonb) → jsonb` — 교직원 규칙(묶음 AND·또는·제외). **조건 하나는 `resolve_audience(…, 'person')` 에 맡긴다**(교사 조건 10종의 의미를
  두 벌로 두지 않는다). 교직원 전용(`is_staff_teacher_or_admin`), 모르는 조건 거부. 분장표에만 있는 이름(resource_id 없음)은 고를 수 없어 뺀다.
- 학생 조건 추가: `past_course {grade, semester?, subjects}` = `student_academic_flat`(성적 — 끝난 학기만), `teacher_students {teacher_ids, subjects?}` = 이번 학기 시간표.
  어휘에 `teachers`(이번 학기 수업이 있는 선생님)·`past_subjects`(과목별 학년-학기) 추가.

- `resolve_student_audience(p_rule jsonb, p_academic_year int = null, p_semester int = null) → jsonb` — 규칙
  `{include:[{all:[조건…]}…], exclude:[…]}`(묶음 안 AND · 묶음끼리 OR)을 재학생 명단 + 묶음·조건별 인원(`no_record`·`unknown`)으로.
  **교사·관리자 전용**(`is_teacher_or_admin`, 직원 거부), 학기 생략 = `current_academic_term()`, 모르는 조건 type 은 22023 거부.
- `get_student_audience_vocab(year?, sem?) → jsonb` — 학급·학기 과목·활동 중인 동아리·내 담임 반·내 수업 과목·최대 교시. 같은 권한.
- 내부 전용(EXECUTE = service_role 만): `student_audience_pool()`(재학생 = `resource` student·active, 테스트 계정 제외 — **모든 조건이 여기에 조인**),
  `student_audience_matches(조건, year, sem)`.
- 조건 type = `all_students`·`current_class`·`past_class`(`meta.snumN`)·`club`(`club_info.students`, 활동 중 동아리만)·`course`/`slot`/`my_students`(`student_timetable`)·`my_homeroom`(태그 `N학년 M반`)·`people`.
  ⚠️ `student_enrollment` 를 쓰지 않는다 — 비재학생 행(`(미재학) …`)이 남아 있다. 클라이언트 짝 = `src/lib/studentAudienceRule.ts`. 설계 = `docs/plans/2026-10-01-student-audience-selection.md`.

**`student_audience_saved_rule`** — 본인의 최근·즐겨찾기 규칙(명단이 아니라 규칙 — 학기가 바뀌어도 낡지 않는다).
`id`·`user_id`(auth.uid, 기본값)·`rule` jsonb·`rule_key`(정준형 `canonicalRule` — **unique (user_id, rule_key)**)·`label`(요약)·`title`(이름, 아직 화면 없음)·
`sentence`(문장으로 만들었으면)·`pinned`·`use_count`·`last_used_at`·`created_at`. RLS = 본인 행만(SELECT·UPDATE·DELETE), INSERT 는 본인 ∧ 교사·관리자.
쓰기 = `record_student_audience_rule(rule, rule_key, label, sentence?, pin?)`(**INVOKER** — 같은 열쇠면 사용 횟수·시각 갱신, 별표는 풀지 않음,
**별표 없는 행은 최근 8개만 남긴다**). ⚠️ 시각은 `clock_timestamp()` — `now()` 는 한 트랜잭션 안에서 같아 정리 순서가 정해지지 않는다(드라이런에서 실제로).
⚠️ `canonicalRule` 을 바꾸면 저장된 열쇠와 어긋나 같은 조건이 두 줄로 쌓인다(오류 없음).
v2: **`target`**(`student`|`faculty`, 기본 student) — unique 는 (user_id, target, rule_key), 최근 8개 정리도 대상마다. INSERT 정책 = 학생 규칙은 교사·관리자,
교직원 규칙은 교직원. `record_student_audience_rule` 에 `p_target`(기본 student) 추가 — 5인자 옛 호출도 그대로 동작한다.

## 코드 공유 — `code_project` · `code_project_file` (2026-10-01)

바이브코딩 산출물을 올리고·실행하고·가져가는 기능(`docs/features/code-share.md`). **학생 + 교직원이 함께 쓰는 표**라
사람은 `resource.id`, "나"는 `current_actor_resource_ids()` 로만 판정한다. 마이그레이션 `20261001220000_code_share.sql`.

**`code_project`** — `id`·`owner_resource_id`(resource FK, cascade)·`created_by`(auth.uid 기본값)·`title`(1~120)·`description`·
`visibility`(`school`|`link`|`private`)·`kind`(`html`|`static`|`node`|`skill`|`other` — 실행 방식, `skill` 은 `20261001230000` 에서 추가)·`entry_path`(진입 HTML)·`origin_tool`(만든 도구, 표시용)·
`tags text[]`·`forked_from`(자기 FK, **on delete set null** — 원본이 지워져도 사본은 남는다)·`file_count`·`total_bytes`(파일 표 트리거가 유지)·시각 2종.

**`code_project_file`** — `id`·`project_id`(cascade)·`path`(상대 경로, `^/`·`..` CHECK 거부, **unique (project_id, path)**)·
`content`(텍스트) / `storage_path`(이진 — 버킷 `code-projects` 의 `<project_id>/<path>`) 중 **정확히 하나**(CHECK)·`is_binary`·`size_bytes`.

**RLS** — ⚠️ 목록 SELECT 는 **새 행의 컬럼만으로** 판정한다(`visibility='school'` ∨ 내 것 ∨ 관리자): 클라이언트가 `.insert().select()` 라
`INSERT … RETURNING` 에 SELECT 정책이 덧붙는데, 같은 표를 되읽는 DEFINER 함수를 쓰면 학생 생성이 42501 로 죽는다(2026-09-12 협업 보드).
**`link` 는 목록 정책에 없다** → 상세는 RPC `get_code_project(uuid)`(DEFINER, `can_view_code_project` 판정) 로만. INSERT = `created_by = auth.uid()` ∧
`owner_resource_id ∈ 내 resource`. UPDATE/DELETE = 본인·관리자. 파일 표는 `can_view_code_project(project_id)` / `can_edit_code_project(project_id)`
(DEFINER — 다른 표의 커밋된 행을 읽으므로 RETURNING 안전). 버킷 정책은 경로 첫 폴더를 `code_project_id_of_object(name)`(uuid 모양이 아니면 null) 로 풀어 같은 두 함수로 판정.

**RPC** — `get_code_project(uuid) → setof code_project` · `code_project_fork_count(uuid) → int`(비공개 사본도 센다 — 숫자만) ·
`can_view_code_project(uuid)` · `can_edit_code_project(uuid)`. 넷 다 EXECUTE 를 **public, anon 양쪽에서 회수**하고 authenticated·service_role 에 부여.
⚠️ `tg_code_project_file_stats` 는 DEFINER 다(집계는 권한 판정이 아니다 — 가드 트리거를 DEFINER 로 만들지 말라는 §20 과 다른 부류).

## 관리자 대시보드 스냅샷 — `admin_dashboard_snapshot` (2026-10-08)

한 줄짜리 표(`id = 1` CHECK). Admin ▸ 대시보드의 **«기능별 자료 현황»(표 60여 개의 건수·최근 30일)** 을 담는다 —
대시보드를 열 때마다 전수로 세느라 콜드에서 3~5초(8초 제한의 턱밑)가 걸렸기 때문이다.

| 컬럼 | 뜻 |
|---|---|
| `datasets` | `{키: {total, recent, exact, skipped, as_of}}` — 계약은 `adminDashboardCatalog.ts` 의 `DatasetCount` |
| `counting` | `{counted, estimated, elapsed_ms, budget_hit, size_cap_mb}` |
| `generated_at` · `source` | 언제 · 어떻게(`nightly` / `manual` / `bootstrap`) |

- **RLS 켜짐 · 정책 없음 · anon/authenticated 권한 회수** — 읽기·쓰기는 DEFINER 함수만.
- 세기 = `admin_dashboard_count_datasets(budget_ms, size_cap_mb)`(allowlist 의 정본 — 내부 전용), 저장 = `admin_dashboard_snapshot_save(source, …)`(내부 전용).
- 채우는 길 셋: **pg_cron `admin-dashboard-snapshot`**(`30 19 * * *` UTC = 04:30 KST, postgres 역할이라 statement_timeout 이 없어 **큰 표까지 정확히** — 실측 65개 6.9초 콜드 · 0.9초 웜) ·
  관리자 RPC **`refresh_admin_dashboard_datasets()`**(낮 예산 3.5초·20MB, 1분 안 재요청은 세지 않음) · 스냅샷이 없을 때 `get_admin_dashboard_stats()` 의 첫 호출.
- ⚠️ 낡아도 **자동으로 다시 세지 않는다**(크론 실패가 곧 매 조회 비용이 된다) — 화면이 기준 시각을 상시 표시하고 36시간을 넘으면 경고한다.
- 마이그레이션 `20261008140000_admin_dashboard_snapshot_tamagotchi.sql`, 상세 `docs/features/admin-dashboard.md`.

## 자습 감독 — `supervision_swap_request` + 감독 일정 표지 (2026-10-11)

자습 감독 배정 결과는 **기존 `meeting`(kind=`duty`)** 이다. 감독 일정의 표지 = `meta.supervision = {grade, slot, with_morning?}`
(`slot` ∈ `morning`·`evening`·`saturday`), 담당자는 한 명(`meta.assignee = {"이름": {"name": "이름"}}`), 제목은 `자습감독 · N학년 저녁 · 이름`
— **이름이 맨 끝 ` · 이름`** 이어야 교체 RPC 가 그 자리만 바꾼다.

| 열 | 뜻 |
|---|---|
| `grade` | 1~3 |
| `requester_resource_id` · `partner_resource_id` | 신청한 사람 · 받은 사람(`resource.id`) |
| `requester_meeting_id` | 신청한 사람의 감독 일정 |
| `partner_meeting_id` | 맞바꿀 상대의 감독 일정. **null = 대신 맡아 주세요** |
| `status` | `pending`·`accepted`·`rejected`·`cancelled` (한 일정에 대기 신청은 하나 — 부분 유일 색인) |

- **읽기** = 신청한 사람·받은 사람(`current_actor_resource_ids()`). **쓰기 정책 없음** — RPC 전용.
- RPC(전부 DEFINER, `auth.uid()` 가드, anon·PUBLIC 회수):
  - `get_self_study_supervision_history(grade, since, until)` — 학년의 감독 일정(날짜·시간대·이름). duty RLS 가 만든 사람·담당자에게만 보여 **누적 횟수가 오류 없이 틀리는 것**을 막는다(급식지도 `get_meal_duty_history` 와 같은 이유). 교직원 전용
  - `list_my_supervision_swaps()` — 내가 낸·받은 신청(상대 일정은 RLS 로 안 보이므로 날짜·시간대를 서버가 붙인다)
  - `request_supervision_swap(my_meeting, partner, partner_meeting?, message?)` — 내가 담당자인 앞으로의 감독만, 맞바꾸기는 같은 학년 감독만. 받은 사람에게 `supervision_swap_requested` 알림
  - `respond_supervision_swap(request, accept)` — 받은 사람만. 수락 = 두 일정을 **잠그고 담당자를 다시 확인한 뒤** 담당자·제목을 맞바꾼다(신청 뒤 담당자가 바뀌었으면 거부). 같은 일정에 걸린 다른 대기 신청은 취소. 신청자·학년부장(태그 `N학년 부장`)에게 `supervision_swap_result` 알림
  - `cancel_supervision_swap(request)` — 신청한 사람만, 대기 중일 때만
- ⚠ `notification_events.priority` 는 CHECK 가 `low·medium·high` 만 받는다(`normal` 을 넣으면 신청 전체가 롤백된다 — 드라이런에서 잡았다).
- 마이그레이션 `20261011100000_self_study_supervision.sql`. 상세 = `docs/features/self-study-supervision.md`
- **2026-10-12** `20261012130000_supervision_unavailability_school_morning.sql`:
  - `meta.supervision.grade = 0` = **전 학년 통합 아침 당번**. `supervision_swap_request.grade` CHECK → `between 0 and 3`, `respond_supervision_swap` 은 grade 0 이면 세 학년부장 모두에게 알린다.
  - 표 **`supervision_unavailability`** — 감독을 못 하는 날. `resource_id` · `weekday`(1~6) **또는** `on_date`(CHECK 로 둘 중 하나) · `slots text[]`(morning·evening·saturday) · `valid_from`/`valid_until`(매주 반복의 기간, 선택) · `note`(≤100) · `created_by`. RLS: 읽기 = `is_staff_teacher_or_admin`, 쓰기(INSERT·UPDATE·DELETE) = 본인(`current_actor_resource_ids`) ∨ `is_teacher_or_admin`, anon 전부 회수. 실측(롤백 트랜잭션): 교사가 남의 행 추가 OK · 직원 본인 행 OK · 직원 남의 행 추가 거부 · 직원 남의 행 삭제 0행 · 잘못된 모양 CHECK 거부 · anon 거부

## 에이전트(MCP) 연결 — `mcp_tool_grant` + `mcp_*` RPC (2026-10-18 시험판)

> **2026-10-24 — 업무 실행 기록 `work_event`** (마이그레이션 `20261024150000`). 업무 진행을 AI 가 분석할 기록 — 담당자가 따로 쓰지 않는다.
>
> | 열 | 뜻 |
> |---|---|
> | `id` | bigint identity |
> | `work_id` | 업무, FK CASCADE(업무를 지우면 기록도) |
> | `task_id` · `action_id` | FK 없음 — 지운 할 일·작업의 기록도 남는다 |
> | `kind` | CHECK: `task.created/deleted/deadline_changed/assignees_changed/step_changed/visible_from_changed/title_changed` · `action.added/removed/archived/config_changed` · `agent.preview/sent` · `insight.saved/decided` |
> | `actor_resource_id` | 감사용(누가). **조회·분석은 `actor_role` 로만**(사용자 결정 — 사람별 집계 금지) |
> | `actor_role` | `manager`·`assignee`·`admin`·`other`·`system` |
> | `via` | `web`·`mcp`(토큰의 `client_id` 클레임)·`system` |
> | `detail` · `at` | 변경 내용(from/to·바뀐 칸) · 시각. 작업 설정 변경은 같은 사람의 10분 안 변경을 한 줄로(`times`) |
>
> **같은 날 — 업무 수행 지식 `work_knowledge`** (`20261024170000`): `id` · `work_id`(FK CASCADE) · `task_id`·`action_type`(선택, FK 없음) · `kind`(procedure·tip·caution·reference·insight) · `title`(≤200)·`body`(≤4000)·`basis`·`suggestions`(인사이트) · `status`(active·archived)·`archived_reason` · `author_resource_id`·`author_role`·`via`(트리거 `work_knowledge_stamp` 가 정함 — 업무·할 일·종류·작성 정보 변경 거부) · `created_at`·`updated_at`. 정책: SELECT·UPDATE = `can_view_work_events(work_id)`(이제 «그 업무 ∨ 이어받은 **모든 후손** 업무의 책임자» — 계보 `mcp_private.work_descendants`), INSERT = `can_manage_work_structure(work_id)`, **DELETE 없음**. 계보 함수 = `mcp_private.work_lineage`·`work_descendants`·`task_lineage`(`meta.rolledOverFrom` 재귀, 순환·깊이 20 상한). 상세 = `docs/features/mcp-agent.md` «업무 수행 지식».
> **작업 단위 (`20261024190000`)**: `work_knowledge.action_id`(그 작업 — 할 일은 트리거가 작업에서 채움, 바꿀 수 없음) + **`task_action.rolled_over_from uuid`**(«지난 업무 가져오기»가 적는 원본 작업 id, FK 없음, 부분 인덱스) + 계보 함수 `mcp_private.action_lineage`.
>
> 쓰기 = 트리거 `work_event_task`·`work_event_action`(SECURITY DEFINER `mcp_private.work_event_on_*` — 상태 변화는 `task_status_history` 가 이미 있어 쓰지 않는다)과 `mcp_private.wr_event`(에이전트·인사이트, 책임자 확인) 뿐 — **INSERT/UPDATE/DELETE 정책 없음**. 읽기 = `can_view_work_events(work_id)`(DEFINER) = 그 업무의 책임자 ∨ `meta.rolledOverFrom.workId` 로 그 업무를 가져온 업무의 책임자. 요청·응답·제출·발송·다시 알림 시각은 각자의 표(`collect_*`·`action_submission`·`task_message_send`·`notification_events`)에서 돌아보기 때 읽는다(두 벌로 쌓지 않는다). 상세 = `docs/features/mcp-agent.md` «업무 진행하기».

> **2026-10-24 — 교사 기본 허용.** 허용 = `mcp_tool_policy(tool pk, teacher_default, updated_by, updated_at)`(도구마다 «계정이 연결된 모든 교사에게 켜짐», 읽기 = 로그인, UPDATE = 관리자) ∪ `mcp_tool_grant`(사람별 추가) − `mcp_tool_block(resource_id, tool → mcp_tool_policy, blocked_by, blocked_at)`(사람별 해제, 읽기 = 관리자·본인, 쓰기 = 관리자, teacher·staff 리소스만). 판정 = `mcp_private.my_grants()`. 직원은 기본을 받지 않는다. 시드 = 급식지도 명단·자습 감독 배정만 끔. 같은 날 읽기/쓰기 허용 쌍을 합쳐 `tool` CHECK 는 28개(`20261024140000` — 이 아래의 옛 허용 이름은 기록). 상세 = `docs/features/mcp-agent.md`.

허용된 교직원이 자기 에이전트를 MCP 로 연결한다. 에이전트 토큰 = Supabase OAuth 2.1 서버가 발급한 **사용자 본인의 JWT**
(`client_id` 클레임 — 일반 세션에는 없다).

| 열 | 뜻 |
|---|---|
| `resource_id` | 허용받은 교직원(`resource.id`, teacher·staff 만 — INSERT 정책이 확인), FK CASCADE |
| `tool` | 허용 단위. CHECK `schedule.read`·`schedule.write` (⚠️ 엣지 함수 `mcp` TOOLS · `src/lib/mcpTools.ts` 와 같아야 한다) |
| `granted_by` · `granted_at` | 허용한 사람(auth uid) · 시각 |

- PK (`resource_id`, `tool`). RLS: 읽기 = 관리자 ∨ 본인(`current_actor_resource_ids`), INSERT·DELETE = `is_admin()`. anon 회수.
- `mcp_private.require_tool(tool) → uuid`(DEFINER, `auth.uid()` 가드) — 허용된 내 교직원 리소스 id, 없으면 42501 hint `MCP_TOOL_NOT_GRANTED`.
- RPC(전부 **SECURITY INVOKER** — RLS 그대로, anon·PUBLIC 회수):
  - `mcp_my_tools() → text[]` — 동의 화면·`tools/list` 가 같이 쓴다
  - `mcp_list_schedules(p_from date, p_to date) → jsonb` — 한국 날짜, 양끝 포함, 최대 62일·300건, `mine` = 내가 만든 일정
  - `mcp_create_personal_schedule(p_title, p_date, p_start_time?, p_end_time?, p_description?) → jsonb` — `kind='personal'` 만(알림 없음), `created_by`·`creator` = `require_tool` 이 준 내 id, `meta.via = {channel:'mcp', client_id, at}`
- **DB 입구**: `account_link_pre_request` 가 `client_id` 있는 토큰을 `/rpc/mcp_*`(POST·GET)만 통과시킨다(hint `MCP_TOOLS_ONLY`, 그 뒤 명단 연결 판정은 그대로). 연결 절차 허용 목록도 에이전트 토큰에는 열지 않는다.
- **RESTRICTIVE 정책 2개**: `storage.objects` 의 `mcp_agent_no_storage`(ALL) · `notification_events` 의 `mcp_agent_no_realtime`(SELECT) — PostgREST 를 거치지 않는 Storage·Realtime 입구. (2026-11-04 `20261104100000`) 알림 정책은 트랜잭션 설정 `mcp.read_notifications = 'on'` 이면 통과 — `mcp_list_notifications` 만 켠다(Realtime 은 계속 0행).
- 마이그레이션 `20261018100000_mcp_agent_access.sql`. 상세 = `docs/features/mcp-agent.md`

### 담임 반 · 업무 도구 (2026-10-19)

- `tool` CHECK 가 넷 늘었다 → `schedule.read`·`schedule.write`·**`homeroom.read`·`task.read`·`task.write`**(마이그레이션 `20261019100000`·`20261019110000` 이 제약을 지우고 다시 만든다 — 최신 정의가 정본).
- **표 `mcp_call_log`** — 학생 정보를 읽은 호출과 할 일 상태를 바꾼 호출의 기록. 열 `id`(identity) · `resource_id`(FK SET NULL) · `user_id` · `client_id` · `tool` · `detail` jsonb · `at`. 읽기 = `is_admin()`, **쓰기 정책 없음** — `mcp_private.log_call()`(DEFINER)만 넣는다. 보관 기간 미정.
- **RPC `admin_mcp_connections()`** (2026-10-25, `20261025150000`) — 관리자 전용 DEFINER. 에이전트 연결 동의(`auth.oauth_consents`) 한 줄마다 사람(이름·이메일·역할·resource)·에이전트 이름·범위·허용/해제 시각·살아 있는 세션 수·마지막 세션·기록된 호출(30일)·마지막 호출. 토큰·주소·IP 는 내보내지 않는다. 화면 = Admin ▸ 에이전트(MCP) «연결한 사람».
- 내부 함수(`mcp_private`, 전부 anon·PUBLIC 회수): `my_homeroom(me)`(담임 태그 `N학년 N반` **정확히 하나** — 없으면 hint `MCP_NO_HOMEROOM`, 둘 이상이면 `MCP_HOMEROOM_AMBIGUOUS`) · `current_term()`(학사력 → 시간표 최신 학기) · `room_students(학년, 반)`(재학생 id·번호) · `manages(work, me)`(manager_id ∨ meta.managers) · `task_mode(meta)`(`single`·`rounds`·`units`) · `my_task_state(task, 업무 상태, me)` · `arr`·`obj`·`kst_day`.
- RPC(INVOKER):
  - `mcp_homeroom_roster()` — 내 반 재학생 **번호만**. `mcp_homeroom_timetable(p_date?, p_day?, p_number?)` — 반 전체는 교시마다 과목·선생님·듣는 번호, 번호를 주면 그 학생, 날짜를 주면 그날 학사일정(`no_class`). **반을 인자로 받지 않는다**(담임 태그에서 유도) · 이름·학적 코드를 돌려주지 않는다 · 호출을 기록한다.
  - `mcp_list_my_tasks(p_status 'open'|'completed'|'all', p_limit)` · `mcp_get_task(p_task_id)` · `mcp_list_managed_works(p_include_completed)` — 담당자이거나 책임자인 것만(웹 «전체 업무»보다 좁다), 담당자 명단은 책임자에게만.
  - `mcp_set_my_task_status(p_task_id, p_status 'completed'|'pending', p_deadline?, p_unit_key?)` — **내** 상태만. 방식별로 기존 `set_task_assignee_status`·`set_task_deadline_status`·`set_task_unit_status` 를 부른다(직접 UPDATE 없음 → 이력·가드 그대로). 단위는 이미 맡은 것만, 제출이 남으면 거부(`guard_submission_completion` 트리거도 그대로).

## 업무 온톨로지 연결 — `ontology_link` (2026-11-08)

객체(업무·할 일·공문·일정·서명·문서) 사이의 연결. 설계 `docs/plans/2026-11-08-work-ontology-redesign.md` §3, 화면 `docs/features/work-ontology.md`.
마이그레이션 `20261108100000_ontology_link.sql`, 시험 `supabase/tests/ontology_link.sql`(9단계, rollback).

| 칸 | 뜻 |
|---|---|
| `from_type`·`from_id` → `to_type`·`to_id` | 종류 CHECK = `work·task·official_doc·meeting·signature_request·document` (화면 `objectRef.ts` OBJECT_TYPES 와 두 벌) |
| `kind` | `evidence`(근거) · `schedule`(일정) · `output`(만든 것) · `related`(관련) · `precedes`(앞 → 뒤) |
| `note` | 200자 이하 · `created_by`(기본 auth.uid()) · `via` web/mcp/system · 같은 다섯 칸 유일 · 자기 자신 금지 |

- **판정 `can_view_object(type, id)` = SECURITY INVOKER** — 그 객체 표를 호출자 권한으로 읽어 본다(각 표 RLS 그대로: 공문 = 관리자, 개인 일정 = 본인, 서명 = 관계자). ⚠️ DEFINER 로 바꾸면 모든 객체가 «보인다»가 된다.
- RLS: 보기·잇기 = `is_staff_teacher_or_admin` + **양 끝 모두** `can_view_object` · 지우기 = 만든 사람 또는 관리자(+ 양 끝 보기) · 고치기 없음. ⚠️ 명단에 연결되지 않은 계정은 `is_staff_teacher_or_admin` 이 거짓이라 못 쓴다(옳은 동작 — 시험 재료도 연결된 계정만).
- 쓰기 RPC `link_objects(from_type, from_id, to_type, to_id, kind, note)`(멱등 — 있으면 그 id) · `unlink_objects(id)` — 둘 다 INVOKER·VOLATILE.
- **옛 연결은 옮기지 않았다** — `meta.fromOfficialDoc` · `meta.rolledOverFrom` · 업무 흐름 선(`flow`·`related`·`depends_on`·`handoff`)은 화면 판정(`src/features/work-ontology/model/workObject.ts`)이 읽어 이 표의 연결과 합친다. SQL 뷰로 같은 판정을 한 벌 더 두지 않는다.

### work_note — 업무 작업실 서랍 (2026-11-12, `20261112100000_work_note.sql`)
- 한 업무의 메모·링크 한 줄씩: `id`, `work_id`(→ work CASCADE), `kind`(`note`|`link`), `body`(1~2000), `url`(http/https만, link 는 필수), `created_by`(기본 auth.uid()), `created_at`, `updated_at`.
- 지식(`work_knowledge`, 다음 해를 위한 정리)과 다르다 — 지금 하는 일의 작업 흔적. 연간 가져오기는 옮기지 않는다.
- RLS: 보기·쓰기 = 교직원 ∧ `work_note_member(work_id)` = 책임자(`can_manage_work_structure`) ∨ 그 업무 할 일의 담당자(`is_task_assignee_actor`) · 쓰기는 `created_by = auth.uid()` · 고치기·지우기 = 쓴 사람 ∨ 책임자. 트리거 `work_note_guard` = 업무·쓴 사람·만든 시각 변경 거부.
- ⚠️ `task` SELECT 정책은 `true` — «그 업무의 할 일이 보인다»로 담당을 판정하면 모두 통과한다. 담당 판정은 `is_task_assignee_actor`.
- 시험 `supabase/tests/work_note.sql`(5단계, rollback). 화면 = `docs/features/work-ontology.md` «W0».

### agent_request — 에이전트 작업 요청 (2026-11-11, `20261111120000_mcp_agent_request.sql`)
- 받는 사람마다 한 줄: `id`, `batch_id`(같이 보낸 것), `sender_resource_id`·`sender_name`, `recipient_resource_id`·`recipient_name`, `title`(80), `body`(3000), `steps` jsonb(글 배열), `refs` jsonb(`{kind: document_generation|action|work|task|skill, id?, title}` — 제목은 보낼 때 서버가 채움), `due_date`, `status`(`sent`→`handed`→`done`|`declined`, 보낸 사람 `cancelled`), `handed_to` jsonb(`{via: desk|phone|web, label, agent, message_id?}`), `handed_at`, `result`(2000), `closed_at`, `created_at`, `updated_at`.
- RLS: SELECT = 보낸 사람 또는 받는 사람(`owns_notification_resource`). INSERT·UPDATE·DELETE 권한 없음 — 쓰기는 `agent_req_private.insert`·`set_status`(DEFINER, 누가 무엇을 바꾸는지 다시 판정)로만.
- 알림: 보내면 받는 사람에게 `notification_events` type `agent_request`(meta `request_id`·`batch_id`·`sender_name`·`sender_resource_id`), 완료·거절·취소는 상대에게 `agent_request_result`(meta `status`).
- 맡길 말(에이전트에게 넘기는 글)은 `agent_req_private.prompt(row)` 한 곳 — MCP `get_agent_request` · 데스크 `agent_request_prompt` · 모바일·웹 `agent_request_send_to_agent` 가 모두 쓴다.

## Additional System Tables

### Secondary Tables:
- `attendance_records`: Student attendance tracking
- `training_signatures`: Digital signature collection for training
- `message_threads`, `message_participants`, `messages`: Internal messaging system
- `system_settings`: System configuration storage
- `timetable_activities`: Class timetable management

### Backup Tables:
- `backup_resource`, `backup_section`, `backup_meeting`, `backup_section_member`: Data backup storage
- `schema_migration_tracking`: Migration status tracking

### Deprecated Tables:
- `document_shares`: **REMOVED (2026-08-11)** — 문서 공유 기능. UI 진입점이 없고 0행이라 서류함 개편 때 테이블·코드 경로 삭제
- `document_chunks` (+ RPC `search_document_chunks`/`insert_document_chunks`): **REMOVED** — 벡터 검색 인프라. 테이블은 이전에 이미 사라져 RPC·클라이언트 코드만 고아로 남아 있던 것을 2026-08-11 정리 (문서 검색은 DB 필터 + AI 해석(aiChat/Solar)으로 대체)
- `meeting_allocation`: **REMOVED** - Teacher allocations are now stored in `meeting.meta.assignee` JSONB field
- `schedule_permissions` (+ RPC `check_schedule_permission`/`get_user_schedule_permissions`/`cleanup_expired_schedule_permissions`): **REMOVED (2026-06)** — meeting별 read/edit/delete/manage 권한 시스템. 테이블은 이전에 이미 사라져 RPC만 고아로 남아 `meeting` update/delete RLS에서 호출됐으나, `user_can_access_meeting`의 `kind IN ('schedule','event')` 분기가 이미 동일 접근을 보장해 redundant였음. RLS 정책을 `user_can_access_meeting` 단독으로 재작성하고 고아 RPC를 drop. 실제 스케줄 기능에는 영향 없음.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### Core Tables
1. **User Management**
   - `profiles`: User profiles with roles (student/teacher/admin)
   - `resource`: Teachers, classrooms, devices, groups
   - `user_resource`: Links users to resources

2. **Task Management** (JSONB-based)
   - `event`: Project-level containers
   - `task`: Individual tasks with JSONB assignee storage
   - `task_status_history`: Status audit trail

**Resource Meta JSONB Structure** (type: teacher):
```json
{
  "email": "user@myschool.hs.kr",
  "grade": "1",
  "class_number": "3",
  "section": {
    "과목명 학급": { "time": ["시간코드", ...] }
  },
  "accounts": {
    "google":     [{ "id": "...", "password": "...", "note": "" }],
    "whalespace": [{ "id": "...", "password": "...", "note": "" }],
    "ai":         [
      { "id": "kijungpt1@myschool.hs.kr" },
      { "label": "Claude", "id": "claude440@...", "password": "...", "note": "기관 발급 · 2026-08-28" }
    ],
    "riroschool": [{ "id": "...", "password": "...", "note": "" }],
    "microsoft":  [{ "id": "...", "password": "...", "note": "" }]
  }
}
```
- `section`: 시간표 import로 생성되는 수업 배정 데이터 (객체, 배열 아님)
  - key: `"과목명 학년-반"` (예: `"인공지능 기초 1-1"`)
  - value: `{ "time": ["22", "35", "51"] }` (시간 코드 배열)
- `accounts`: 교사 외부 서비스 계정(구글·웨일스페이스·인공지능용·리로스쿨·마이크로소프트). **⚠️ 2026-10-13 부터 meta 가 아니라 표 `resource_accounts`(resource_id PK, `accounts` jsonb = 아래와 같은 모양)에 산다** — `resource` 는 로그인한 누구나 읽어 인공지능용 계정 평문 비밀번호(27명 34건)가 **학생에게도** 보였다. 표는 읽기 = 본인(user_resource 연결)·관리자, 쓰기 = 관리자이고, `resource.meta` 에 `accounts` 를 다시 쓰면 트리거 `resource_reject_meta_accounts` 가 거부한다. 읽기·쓰기 = `services/resourceAccountsService.ts`(`fetchResourceAccounts`·`saveResourceAccounts`·`accountsAsMeta` — 아래 유틸은 `{accounts}` 모양 meta 를 받으므로 그대로 재사용). 아래 서술의 «meta»는 이 표의 값으로 읽을 것. 공용 유틸 = `src/utils/teacherAccounts.ts`(parse/merge/normalize + 엑셀 헤더 매칭). **교사 본인 열람** = `ProfileCard`의 `AccountsSection`(비밀번호 마스킹·토글·복사). **관리자 관리** = Admin "계정 관리" 탭(`AccountManagement` 표 + `AccountEditDialog` 개별 편집 + `AccountExcelImport` 엑셀 일괄 등록). **병합 시맨틱 2종**: 개별 편집 모달은 전체 폼을 보므로 빈 필드=삭제 의도 → `mergeAccountsIntoMeta`(accounts 전체 교체). 엑셀 일괄 등록은 **부분 패치** → `mergeAccountPatchIntoMeta`(=`deepMergeAccounts`, 채워진 것만 덮어쓰고 빈 칸은 기존 값 보존). 두 경로 모두 email/section 등 나머지 meta는 항상 보존.
  - **종류별 계정은 "여러 개"다 (2026-08-31)**: 값이 `{id,password,note}` 객체 하나가 아니라 **배열**이고, 항목마다 선택 필드 `label`(같은 종류 안의 구분 이름 — `Claude`/`GPT`/`Gemini`)이 붙는다. 인공지능용은 한 교사가 Claude·GPT를 동시에 쓰는 것이 정상이라(라이브 8명) 객체 하나로는 표현이 안 되고, 단일 객체 모델에서는 두 번째 계정을 넣는 순간 앞의 계정이 **조용히 사라진다**. **읽기는 객체·배열을 모두 받고 쓰기는 항상 배열**이라 일괄 마이그레이션은 하지 않았다(편집·갱신된 행부터 자연히 배열이 된다 — **2026-08-31 기준 `ai`만 배열 29행이고 `google` 48·`whalespace` 35·`microsoft` 24는 아직 전부 레거시 객체**다) — 즉 `meta.accounts` 를 직접 읽는 새 코드를 쓰지 말고 반드시 `parseAccounts()`를 거칠 것. 두 형태가 실제로 공존하므로 SQL로 계정을 다룰 때도 `jsonb_typeof` 분기가 필요하다.
  - **부분 패치의 계정 대응 = 아이디 → 라벨 → (계정이 하나뿐일 때만) 그 계정**. 대응이 없으면 새 계정으로 추가하되, **아이디도 라벨도 없는 패치 항목은 버린다**(계정이 여러 개일 때 "비밀번호" 열만 있는 표가 엉뚱한 계정의 비밀번호를 덮어쓰는 것을 막는다). 매칭에 쓴 필드는 덮어쓰지 않는다 — 대소문자를 무시해 찾았으므로 그대로 쓰면 저장된 아이디 표기가 조용히 바뀐다.
  - **엑셀 헤더의 날짜 열은 무시한다**: `matchAccountHeader`의 필드 판정은 키워드가 없으면 `id`로 떨어지므로, "Claude 시작일" 같은 열이 **계정 아이디 자리에 날짜를 덮어쓴다**. 날짜/기간 헤더는 명시적으로 `null`을 반환한다. 서비스명이 든 헤더(`Claude 계정`·`GPT 비밀번호`)는 `{kind:'ai', label:'Claude'}`처럼 라벨까지 돌려주므로, 한 시트에 서비스 열이 여러 벌 있어도 계정이 갈라져 들어간다. `-`(미발급) 값도 무시.
  - 회귀 2종 = `npx tsx scripts/teacher-accounts-test/run.mts`(49건, 순수 로직) + `npx tsx --tsconfig tsconfig.app.json scripts/teacher-accounts-test/render.mts`(22건, 프로필 "내 계정" **SSR 렌더** — 종류당 한 칸만 그리는 회귀는 로직 테스트로는 안 잡힌다. 비밀번호 평문 미노출도 여기서 고정). **`--tsconfig` 를 빠뜨리면 안 된다** — 루트 `tsconfig.json` 은 references 만 있는 solution 파일이라 tsx 가 `jsx` 옵션을 적용하지 않아 `.tsx` import 가 `React is not defined` 로 죽는다. 발급 명단 xlsx → 갱신 SQL 생성기 = `scripts/ai-account-import/build-sql.mts`(기존 계정 보존·아이디 기준 중복 제거라 재실행 안전).
- **개인 전화번호는 저장 금지 (2026-07-23)**: `profiles.phone` 컬럼 삭제, `resource.meta`의 `phone`/`hp` 키는 `resource_meta_no_personal_phone` CHECK 제약이 거부. 연락처 기능(Calls)은 내선 중심으로 개편됨. 새 기능에서 전화번호를 meta나 새 컬럼에 다시 저장하지 말 것.

3. **School Management**
   - `section`: Class subjects and sections
   - `meeting`: Scheduled events (classes, duties, training)
     - kinds: 'schedule', 'event', 'duty', 'training', 'document_submission', 'personal'
     - Assignees stored in `meta.assignee` JSONB: `{"name": {"name": "이름", "signature": 0}}`

4. **Document Management**
   - `documents`: File uploads with Google Drive integration

### Database Functions (RPC)
- `mcp_my_tools()` · `mcp_list_schedules(from, to)` · `mcp_create_personal_schedule(...)`: **에이전트(MCP) 도구** — SECURITY INVOKER(RLS 그대로) + `mcp_private.require_tool()` 로 `mcp_tool_grant` 허용 확인. 에이전트 토큰은 이 `mcp_*` RPC 만 부를 수 있다 (2026-10-18, 아래 «에이전트(MCP) 연결»). 2026-10-19 추가: `mcp_homeroom_roster`·`mcp_homeroom_timetable`(담임 반 — 번호만) · `mcp_list_my_tasks`·`mcp_get_task`·`mcp_list_managed_works`·`mcp_set_my_task_status`(업무 — 내 상태만). 2026-10-22 추가: 발급번호 대장(`mcp_list_issues`·`mcp_*gajeong_issue`·`mcp_create_volunteer_*`·`mcp_set_club_activities` …) · 플래너(`mcp_list_planner`·`mcp_save_plan` … — 쓰기는 `academy_dormitory_write` 경유)
- `get_admin_dashboard_stats()`: 관리자 대시보드 통합 통계(기능별 자료 건수·사용자·리소스·운영 점검) — admin 전용 SECURITY DEFINER, 왕복 1회 (2026-09-03)
- `send_notification_reply(recipient_resource_id, body, reply_to_notification_id?)`: **알림 [답장]** — 교직원→재직 교직원에게 `direct_reply` 알림. 보낸 사람·원문 인용(내 알림일 때만)은 서버가 유도, 원래 알림에 '답장함'·읽음 기록, `recipient_linked`(로그인 이력) 반환 (SECURITY DEFINER, anon·PUBLIC 회수, 2026-09-22)
- `resolve_audience(rule, axis, year, semester)`: **대상 규칙 해석**(학년·교과·담임 태그·부서·업무분장·태그·직접 지정 → 사람 / 사람×과목 / 사람×학급 + 포함 이유). 할 일 작업 「입력 받기」가 쓴다 — 단일 출처, 교직원 전용 DEFINER (2026-09-23)
- `resolve_faculty_rule(rule)`: **조건으로 교직원 고르기** — 학생 쪽과 같은 묶음 문법, 조건 하나는 `resolve_audience` 에 위임. 교직원 전용 (2026-10-01)
- `resolve_student_audience(rule, year?, semester?)` / `get_student_audience_vocab()`: **조건으로 학생 고르기** — 규칙 `{include:[{all:[조건…]}…], exclude}`(묶음 안 AND·묶음끼리 OR) → 재학생 명단 + 조건별 인원(0명 원인·기록 없음·모르는 이름). **교사·관리자 전용**(학생 정보 — 직원 거부), 모르는 조건 type 은 거부 (2026-10-01)
- `get_meal_duty_history(since, until)`: 급식지도 일정의 날짜·담당자 이름 — 교직원 전용 DEFINER. duty 행 RLS(만든 사람·담당자만)를 넘어 명단 순환을 계산하기 위함 (2026-10-01)
- `get_self_study_supervision_history(grade, since, until)` · `request/respond/cancel_supervision_swap` · `list_my_supervision_swaps()`: **자습 감독** — 이력(duty RLS 우회, 교직원 전용) · 교체 신청/수락(수락 = 서버가 두 감독 일정의 담당자를 잠그고 재확인 뒤 맞바꿈)/취소 — 표 `supervision_swap_request` 는 RPC 전용 (2026-10-11)
- `get_my_tasks_jsonb()`: 내 할 일(담당·책임·급한 목록·요약). **2026-10-05**: 담당 목록은 **취소된 업무만** 뺀다(완료된 업무의 할 일은 `status:'completed'` + `event_status` 로 남아 «완료» 보기에서 사라지지 않는다) · 보이는 날(`task.meta.visibleFrom`) 전의 할 일은 담당자에게 숨긴다(책임자 목록은 거르지 않는다) — 상세 `docs/database/core.md` §7
- `set_task_deadline_status(task_id, assignee_resource_id, deadline, status)`: **다중 마감 업무의 회차별 완료** — `task.meta.deadlineProgress` 갱신 + 담당자 전체 상태 파생(모든 회차 완료=completed) + task.status 재계산·이력 기록, 권한은 아래와 동일 (SECURITY DEFINER, 2026-07-26)
- `set_task_assignee_status(task_id, assignee_resource_id, status)`: `task.meta.assignees` 상태 원자적 변경 — **담당자 본인 또는 상위 이벤트 매니저**(`event.manager_id` ∨ `event.meta.managers`)가 호출 가능, 전체 task.status 재계산 + `task_status_history` 기록 (SECURITY DEFINER). **과제 단위 업무는 거부**(0A000, 2026-08-12) — 단위 기준 파생과 충돌
- `set_task_unit_status(task_id, unit_key, assignee_resource_id, status)`: **과제 단위 업무의 선택(claim)/해제/완료** — status `'pending'`=선택·되돌림, `'completed'`=완료, NULL=선택 해제. 본인(범주 소속 필수) ∨ 매니저. 담당자 상태("내 단위 전부 완료")·task.status("모든 단위 완료") 파생 + 이력 기록 (SECURITY DEFINER, 2026-08-12)
- `submit_task_submission(...)` / `delete_task_submission(submission_id)`: **업무 파일 제출** — 제출 행 등록/삭제 + 담당자 상태를 completed/pending으로 함께 전이(내부에서 `set_task_assignee_status` 재사용). 다중 마감 업무는 거부 (SECURITY DEFINER, 2026-08-11)
- `update_assignee_status_meta(task_id, user_id, status)`: 본인 담당자 상태만 갱신 — **task.status를 재계산하지 않는다**(2026-08-22 확인). 그래서 이걸 쓰던 클라이언트가 `task.status = 내 개인 상태`를 직접 덮어써 **담당자 1명의 완료가 task 전체를 완료로** 만들었다(라이브 4건 오염). 새 코드는 `set_task_assignee_status`를 쓸 것
- `update_assignee_status_jsonb()`: Update assignee status
- `add_assignees_jsonb()` / `remove_assignees_jsonb()`: Manage assignees
- `get_task_event_detail()`: Get event with enriched task data
- `seaton_stats_summary/students/weekday/temperature(...)`: **자습실 통계 계약** — seaton(자습실 좌석 앱, 같은 DB) 통계를 규칙 한 벌로. 판정 = `seaton_private.clock`·`facts`·`temperature_rule` 만, 교사·관리자 전용 (2026-10-09, 아래 «seaton 공유 DB 계약»)


## 홈 꾸미기 — `dashboard_layout` (2026-10-25)

| 칸 | 내용 |
|---|---|
| `user_id` uuid · `kind` text(`teacher`·`student`) | 기본 키 — 한 사람이 네비 종류마다 한 행(관리자의 학생 미리보기는 관리자 본인의 student 행) |
| `layout` jsonb | `{"version":1,"widgets":[{"id","span"?,"hidden"?}]}` — 16KB 미만, 객체 CHECK |
| `updated_at` | |

- RLS = **본인 행만** select·insert·update·delete(남의 배치를 볼 이유가 없다). anon 회수.
- 기본 배치와 같으면 행을 지운다(코드 기본이 바뀌면 따라가게). 해석 `src/lib/dashboardLayout.ts`, 훅 `useDashboardLayout`.
- 마이그레이션 `20261025130000_dashboard_layout.sql`.
