# Database Tables Documentation

This document provides comprehensive information about the database tables used in the TMS (Teacher's Management System). The system uses Supabase PostgreSQL with JSONB data types for flexible metadata storage.

**Important Note**: JSONB fields may contain different properties across various features and components. Not all functions will load or use the same JSONB attributes.

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
- `phone` (TEXT): Contact phone number
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
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### JSONB Meta Field Properties:
The `meta` field can contain different properties depending on resource type:
- **Teacher resources**: May include subject specializations, contact info, schedule preferences
- **Student resources**: May include class information, parent contacts, medical notes
- **Room resources**: May include capacity, equipment, location details
- **Device resources**: May include specifications, maintenance schedules, allocation status

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
- `manager_id` (UUID): References resource.id - event manager
- `status` (TEXT): Status - 'active', 'completed', 'cancelled' (default: 'active')
- `keywords` (TEXT[]): Search keywords array (default: '{}')
- `meta` (JSONB): Event metadata (default: '{}')
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### JSONB Meta Field Properties:
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
- `assignees_jsonb` (JSONB): Multi-assignee storage with status tracking (default: '[]')
- `status` (TEXT): Overall task status - 'pending', 'completed', 'cancelled' (default: 'pending')
- `due_date` (TIMESTAMPTZ): Task deadline (nullable)
- `keywords` (TEXT[]): Search keywords array (default: '{}')
- `meta` (JSONB): Task metadata (default: '{}')
- `created_by` (UUID): References resource.id
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### Critical JSONB Structure - assignees_jsonb:
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
- **Migration Status**: System is migrating from `assigned_to` to `assignees_jsonb`
- **Status Tracking**: Individual assignee status is stored in JSONB array
- **Manager Detection**: Use `event.manager_id` to determine management permissions
- **Count Calculation**: Use `assignees_jsonb.length` for assignee counting
- **Role-based UI**: Different interfaces for managers vs assignees

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

## Document Management

### 9. documents
**Purpose**: File storage and document management with vector search support
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 0

#### Columns:
- `id` (UUID): Primary key
- `user_id` (UUID): Document owner
- `title` (TEXT): Document title
- `file_name` (TEXT): Original filename
- `file_type` (TEXT): MIME type
- `file_size` (BIGINT): File size in bytes
- `storage_path` (TEXT): Supabase Storage path
- `upload_status` (TEXT): Status - 'processing', 'completed', 'failed' (default: 'processing')
- `meta` (JSONB): Document metadata (default: '{}')
- `created_at` (TIMESTAMPTZ): Upload timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp

#### JSONB Meta Field Properties:
- **Department information**: Document categorization by department
- **Tags**: Custom tagging for organization
- **Access controls**: Permission levels, sharing settings
- **Processing results**: OCR text, thumbnail paths, preview information
- **Version control**: Version numbers, change tracking

#### Foreign Key Relationships:
- `user_id` → `profiles.id` (CASCADE on delete): Document owner reference

#### Related Tables:
- `document_chunks`: Text chunks with embeddings for vector search
- `document_shares`: Document sharing permissions

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

## Additional System Tables

### Secondary Tables:
- `attendance_records`: Student attendance tracking
- `training_signatures`: Digital signature collection for training
- `message_threads`, `message_participants`, `messages`: Internal messaging system
- `document_shares`: Document permission management
- `system_settings`: System configuration storage
- `timetable_activities`: Class timetable management

### Backup Tables:
- `backup_resource`, `backup_section`, `backup_meeting`, `backup_section_member`: Data backup storage
- `schema_migration_tracking`: Migration status tracking

### Deprecated Tables:
- `meeting_allocation`: **REMOVED** - Teacher allocations are now stored in `meeting.meta.assignee` JSONB field

## 입시 허브 (ipsi-hub)

입시 관련 동영상·뉴스를 하나의 피드로 보여주는 기능. 두 소스 테이블과, 이를 통합·페이지네이션하는 View/RPC로 구성된다.

### educational_videos
- 입시 관련 YouTube 동영상. `category`, `likes`, `created_by`, `channel_label`, `duration_seconds`, `headline_summary`, AI 분석 결과(`meta.core_points` 등) 보유
- `article_date`: timestamptz / 정렬·표시는 `article_date → collected_at → created_at` 우선순위
- 좋아요: `video_likes` 테이블(`user_id`, `video_id` uuid)에 per-user 저장

### educational_news
- 입시 뉴스(진학사/유웨이/리로스쿨). `source`, `category`, `core_points`, `strategy_implications`, `data_points`, `cautions`, `headline_summary` 보유
- `article_date`: **date** 타입 (videos와 다름 — View에서 timestamptz로 캐스팅해 정렬 통일)

### ipsi_hub_feed (View)
- `educational_videos` + `educational_news`를 `UNION ALL`한 통합 피드 View
- `WITH (security_invoker = true)` — 호출자의 RLS를 그대로 상속(두 소스 테이블 모두 RLS 활성)
- `sort_date`: `COALESCE(article_date::timestamptz, collected_at, created_at)`로 NULL 방어 + 타입 통일
- 두 매퍼(`toVideoFeedItem`/`toNewsFeedItem`)가 쓰는 컬럼 합집합을 노출, 한쪽에 없는 컬럼은 NULL

#### Related RPC:
- `get_ipsi_hub_feed(p_type text, p_category text, p_limit int, p_offset int) → jsonb`
  - 서버 페이지네이션. `p_type`: 'all'|'video'|'news', `p_category`: NULL/'전체'면 전체
  - 반환: `{ items: [...], total_count, video_count, news_count }`
  - `total_count`는 필터 적용 후 개수(페이지 버튼용), `video_count`/`news_count`는 필터 무관 전체(배지용)
  - `items`의 video 행은 `auth.uid()` 기준 `is_liked_by_user` 포함
  - `SECURITY INVOKER` + `STABLE`. 프론트엔드: `useIpsiHubFeed` hook (TanStack Query)

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

## Database Functions (RPC)

### Task Management Functions:
- `get_my_tasks_jsonb()`: Retrieve user's tasks with role-based filtering
- `update_assignee_status_jsonb(task_id, user_resource_id, new_status)`: Update individual assignee status
- `add_assignees_jsonb(task_id, resource_ids[])`: Add assignees to task
- `remove_assignees_jsonb(task_id, resource_ids[])`: Remove assignees from task
- `get_task_event_detail(event_id)`: Get event with enriched task data

### Validation Functions:
- `validate_assignees_jsonb(jsonb)`: Validate assignee JSONB structure

## Key Architectural Patterns

### JSONB Usage Guidelines:
1. **Meta Fields**: Used for flexible, feature-specific data storage
2. **Structure Validation**: Some JSONB fields have validation constraints
3. **Feature Isolation**: Different components may use different JSONB properties
4. **Migration Compatibility**: JSONB allows smooth schema evolution

### Resource ID Resolution Pattern:
```sql
-- Standard pattern for getting user's resource ID
SELECT r.id
FROM resource r
JOIN profiles p ON r.name = p.name
WHERE p.id = auth.uid()
```

### Multi-Assignee Task Pattern:
- **Storage**: Use `assignees_jsonb` array with status tracking
- **Counting**: `json_array_length(assignees_jsonb)` for assignee count
- **Status Updates**: Use RPC functions for atomic updates
- **Permission Checks**: Compare `event.manager_id` with user's resource ID

## Row Level Security (RLS) Configuration

### RLS-Enabled Tables:
**User and Content Tables** (RLS: Yes):
- `profiles`: Users can only access their own profile data
- `resource`: Access based on user-resource associations
- `section`: Access controlled by teaching assignments
- `meeting`: Access based on section membership and creator permissions
- `event`: Access controlled by manager permissions and participant roles
- `task`: Access based on assignee status and event management roles
- `documents`: Document owners and shared users only
- `notification_events`: Users can only see their own notifications
- `user_stats`, `tasks`, `user_goals`: User-specific data access
- `problems`, `problem_solutions`: Content visibility based on ownership and sharing
- `user_*` tables: All user-specific preference and activity tables
- `projects`, `project_*`: Project-based access control
- `continents`, `hex_goals`: User-specific goal management
- `achievements`, `user_achievements`: Achievement system access control
- `training_signatures`: Signature access based on meeting participation
- `attendance_records`: Access based on teacher-student relationships
- `timetable_activities`: Access controlled by creator and section permissions
- `message_*` tables: Message thread participation-based access
- `document_shares`: Sharing permission management
- `system_settings`: Admin-only access for system configuration

### RLS-Disabled Tables:
**System and Audit Tables** (RLS: No):
- `task_status_history`: Audit trail - no user restrictions needed
- `schema_migration_tracking`: System maintenance table
- `backup_*` tables: Backup data storage - system level access
- `user_roles`: Role management handled at application level

### RLS Policy Patterns:

#### User Data Access Pattern:
```sql
-- Users can only access their own data
CREATE POLICY "Users can view own data" ON profiles
FOR SELECT USING (auth.uid() = id);
```

#### Resource-Based Access Pattern:
```sql
-- Access based on user-resource associations
CREATE POLICY "Resource access via user_resource" ON resource
FOR SELECT USING (
  id IN (
    SELECT resource_id
    FROM user_resource
    WHERE user_id = auth.uid()
  )
);
```

#### Role-Based Access Pattern:
```sql
-- Admin users have full access
CREATE POLICY "Admin full access" ON system_settings
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);
```

#### Manager/Participant Access Pattern:
```sql
-- Event managers and participants can access tasks
CREATE POLICY "Task access for assignees and managers" ON task
FOR SELECT USING (
  -- User is event manager
  event_id IN (
    SELECT e.id FROM event e
    JOIN user_resource ur ON e.manager_id = ur.resource_id
    WHERE ur.user_id = auth.uid()
  )
  OR
  -- User is assigned to task
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(assignees_jsonb) AS assignee
    WHERE (assignee->>'id')::uuid IN (
      SELECT resource_id FROM user_resource WHERE user_id = auth.uid()
    )
  )
);
```

### Security Implementation Notes:
- **Authentication Required**: All RLS policies assume authenticated users (auth.uid())
- **Resource ID Resolution**: Many policies use the user_resource junction table
- **Hierarchical Access**: Teachers can access student data in their sections
- **Audit Trail Protection**: Status history tables maintain integrity without user restrictions
- **System Table Security**: Backup and migration tables rely on database-level permissions
- **Performance Considerations**: Complex RLS policies may impact query performance

This documentation reflects the current database schema and should be updated when structural changes occur. Always verify current table structures using database introspection tools when implementing new features.

---

## Education Ontology Tables

### school_curriculum
**Purpose**: 학교 교육과정 운영 (한 학기 한 과목 = 한 행). 매학기 갱신.
**Primary Key**: id (UUID)
**RLS Enabled**: Yes (authenticated 읽기, teacher/admin CUD)
**Source of truth**: `학교교육과정 편제 및 시간배당 관리 보고서(N학기 N학년).xlsx` (학년도별 6개)

#### Columns:
- `id` (UUID): Primary key
- `academic_year` (INT, NOT NULL): **실제 운영 학년도** (예: 2026)
- `grade` (INT, NOT NULL, CHECK 1~3): 학년
- `semester` (INT, NOT NULL, CHECK 1~2): 학기
- `admission_year` (INT, **GENERATED ALWAYS AS** `academic_year - grade + 1` STORED): 입학년도 (자동 계산, 무결성 보장)
- `area` (TEXT): 교과영역 (기초/탐구/체육·예술/생활·교양). 2015 개정만 사용, 2022 개정은 NULL
- `category` (TEXT, NOT NULL): 교과군 (국어, 수학, 영어, 사회, 과학, 체육, 예술, 기술·가정, 교양)
- `subject` (TEXT, NOT NULL): 과목명
- `hours` (INT): 시수 (학기당 총 수업 시간)
- `credits` (INT, NOT NULL): 학점 (학기당)
- `grading_type` (TEXT): 성적처리유형 (`성취도(5단계)+석차등급(5등급)`, `이수/미이수` 등 원문)
- `subject_type` (TEXT): 과목유형 (grading_type에서 추론된 분류, 예: `공통/일반(2022)`, `진로/융합선택`)
- `curriculum_revision` (TEXT): 적용 교육과정 개정연도 (`2015` or `2022`)
- `meta` (JSONB, DEFAULT `'{}'`): 부가 정보 (`source`, legacy `selection_group`, `is_minority` 등)
- `created_at` / `updated_at` (TIMESTAMPTZ)

#### Unique Constraint:
`(academic_year, grade, semester, subject)` — 한 학기 한 과목 1행 보장

#### Related RPC:
- `get_curriculum_overview(p_admission_year)`: 입학연도별 교과군×과목유형 집계
- `get_curriculum_comparison(p_year_a, p_year_b)`: 두 입학연도 변경점 (added/removed/modified)
- `get_semester_credit_distribution(p_admission_year)`: 학기별 학점 분포
- `get_curriculum_by_term(p_academic_year, p_grade, p_semester)`: 특정 학년도/학년/학기 운영 과목 (xlsx 보고서와 동일 형태)

#### 마이그레이션 주의사항:
- 기존 `school_curriculum` (credits_by_semester JSONB 기반)은 `school_curriculum_archive`로 보존됨
- legacy 데이터는 unnest 후 `meta.source = 'legacy_jsonb'` 로 마킹
- xlsx 데이터는 `meta.source = 'xlsx_2026'` 등 학년도 표기

### school_curriculum_archive
**Purpose**: 마이그레이션 전 원본 데이터 백업 (참조 전용)
**Primary Key**: id (UUID)
**스키마**: 옛 school_curriculum과 동일 (credits_by_semester JSONB 포함)
**Note**: 새 작업은 모두 `school_curriculum`을 사용. archive는 과거 data 추적용으로만 조회.

### mock_school_stats (Materialized View)
**Purpose**: 학교 단위 모의고사 문항별 응답 집계 (student_basic_info.mock_marking + mock_problems 자동 교차 집계)
**Type**: Materialized View
**Refresh**: `SELECT refresh_mock_school_stats();`

#### Columns:
- `year` (INT): 시행 연도
- `month` (INT): 시행 월 (3, 6, 9)
- `student_grade` (INT): 학년
- `subject` (TEXT): 과목명
- `problem_number` (INT): 문항 번호
- `total_students` (INT): 응시 학생수
- `correct_count` (INT): 정답 학생수
- `school_correct_rate` (DECIMAL): 학교 정답률 (%)
- `national_correct_rate` (DECIMAL): 전국 정답률 (mock_problems.correct_rate에서)
- `answer_distribution` (JSONB): 선택지별 응답 분포 `{"1": 15, "2": 8, "3": 42, ...}`

#### Unique Index:
`(year, month, student_grade, subject, problem_number)`

#### Data Source:
- `student_basic_info.mock_marking` JSONB → 학생별 답안/정오 풀기
- `mock_problems` → 전국 정답률 JOIN

#### Related RPC:
- `get_mock_item_analysis(p_year, p_month, p_grade, p_subject)`: 문항별 학교 vs 전국
- `get_mock_category_stats(p_year, p_month, p_grade, p_subject)`: 영역별 집계
- `refresh_mock_school_stats()`: MV 갱신

### student_mock_flat (Materialized View)
**Purpose**: student_basic_info.mock_result JSONB를 SQL 행으로 평탄화 (모의고사 성적 사전 파싱)
**Type**: Materialized View
**Refresh**: `SELECT refresh_student_mock_flat();`

#### Columns:
- `student_code` (TEXT): 학생 코드 (student_basic_info.id)
- `name` (TEXT): 학생 이름
- `current_grade` (INT): 현재 학년 (student_identity_map)
- `current_class` (INT): 현재 반 (student_identity_map)
- `academic_year` (INT): 시행 연도
- `exam_grade` (INT): 응시 학년
- `exam_month` (INT): 시행 월
- `subject` (TEXT): 과목명
- `raw_score` (NUMERIC): 원점수
- `standard_score` (NUMERIC): 표준점수
- `percentile` (NUMERIC): 백분위
- `grade` (INT): 등급

#### Indexes:
- `idx_smf_student_code`: (student_code)
- `idx_smf_grade_month`: (current_grade, academic_year, exam_month)
- `idx_smf_subject`: (subject)
- `idx_smf_unique` (UNIQUE): (student_code, academic_year, exam_month, subject)

#### Data Source:
- `student_basic_info.mock_result` JSONB → 시험별/과목별 행 전개
- `student_identity_map` → 현재 학년/반 JOIN

#### Related RPC:
- `refresh_student_mock_flat()`: MV 갱신 (CONCURRENTLY)
- `get_student_mock_summary(p_student_code)`: 원본 함수 (이 MV로 대체 가능)

### subject_achievement_standards
**Purpose**: 교과 성취기준 (과목별 성취기준 코드, 영역, 내용 저장)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes (authenticated 읽기, teacher/admin CUD)

#### Columns:
- `id` (UUID): Primary key
- `subject` (TEXT): 과목명 (예: "공통수학1")
- `standard_code` (TEXT): 성취기준 코드 (예: "[12수학01-01]")
- `domain` (TEXT): 대영역 (예: "다항식")
- `subdomain` (TEXT): 소영역 (예: "다항식의 연산")
- `description` (TEXT): 성취기준 내용
- `level` (TEXT): 성취수준 (A/B/C/D/E)
- `curriculum_year` (INT): 교육과정 연도 (2015, 2022)
- `meta` (JSONB): 추가 메타 (핵심개념, 기능 등)
- `created_at` / `updated_at` (TIMESTAMPTZ)

#### Unique Constraint:
`(subject, standard_code)`

#### Used by:
- `/subject-ontology` 스킬: 과목 성취기준 분석
- `mock_problems.curriculum_code`와 연결하여 문항↔성취기준 매핑

### mock_problems
**Purpose**: 모의고사 문항 정보 (연도/월/학년/과목별 문항 메타데이터)
**Primary Key**: id (UUID)
**Records**: 3,229

#### Columns:
- `id` (UUID): Primary key
- `year` (INT): 시행 연도
- `month` (INT): 시행 월 (3, 6, 9)
- `student_grade` (INT): 학년
- `subject` (TEXT): 과목명
- `problem_number` (INT): 문항 번호
- `major_category` (TEXT): 대영역 (nullable)
- `sub_category` (TEXT): 소영역 (nullable)
- `correct_rate` (TEXT): 전국 정답률 (nullable)
- `intention` (TEXT): 출제 의도 (nullable)
- `collected_at` (TIMESTAMPTZ): 수집 일시 (nullable)
- `updated_at` (TIMESTAMPTZ): 수정 일시 (nullable)
- `info` (JSONB): 추가 문항 정보 (nullable)
- `difficulty_level` (TEXT): 상/중/하 (CHECK 제약, nullable)
- `curriculum_code` (TEXT): 성취기준 코드 연결 (nullable)
- `answer_type` (TEXT): 객관식/주관식/서술형 (기본: '객관식')
- `point` (INT): 배점 (기본: 2)

#### Usage Notes:
- `correct_rate`는 TEXT 타입 (퍼센트 문자열). 수치 비교 시 캐스팅 필요
- `curriculum_code`로 `subject_achievement_standards.standard_code`와 연결하여 문항↔성취기준 매핑
- `mock_school_stats` MV의 전국 정답률 소스로 사용됨

---

## Admission Data Tables

### univ_admissions
**Purpose**: 대학 입시 전형별 커트라인 데이터 (리로스쿨 스마트 배치표 기반)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**Records**: 134,456 (약 56MB)

#### Columns:
- `id` (UUID): Primary key (default: gen_random_uuid())
- `year` (SMALLINT): 입시 연도 (NOT NULL)
- `region` (TEXT): 지역 (NOT NULL)
- `university_name` (TEXT): 대학명 (NOT NULL)
- `department` (TEXT): 학과/모집단위 (NOT NULL)
- `admission_period` (TEXT): 수시/정시 (NOT NULL)
- `admission_type` (TEXT): 전형 유형 (교과, 종합, 논술 등)
- `admission_category` (TEXT): 전형 세부 분류
- `quota` (INT): 모집 인원
- `applicants` (INT): 지원자 수
- `competition_rate` (NUMERIC): 경쟁률
- `additional_accepted` (INT): 추가 합격 인원
- `gpa_cutoff` (NUMERIC): 70% 컷오프 (합격자 하위 30% 선)
- `converted_score` (NUMERIC): 환산 점수
- `max_score` (NUMERIC): 만점 기준
- `korean_score` (NUMERIC): 국어 점수
- `math_score` (NUMERIC): 수학 점수
- `science_score` (NUMERIC): 탐구 점수
- `csat_percentile` (NUMERIC): 수능 백분위
- `created_at` (TIMESTAMPTZ): 생성 일시 (default: now())
- `seq` (SMALLINT): 동일 전형 내 순번 (NOT NULL, default: 1)

#### Indexes:
- `univ_admissions_pkey`: id
- `idx_univ_admissions_year`: year
- `idx_univ_admissions_univ`: university_name
- `idx_univ_admissions_dept`: department
- `idx_univ_admissions_period`: admission_period
- `idx_univ_admissions_category`: admission_category
- `uniq_admission`: (year, university_name, department, admission_period, admission_type, seq) UNIQUE

#### Data Constraints:
- `gpa_cutoff`은 70% 커트라인 (합격자 하위 30% 선)이며, 합격선이 아님
- 값이 0인 경우 미공개 데이터를 의미 (0점이 아님)
- 현재 2025년 데이터만 적재됨
- 특성화고, 농어촌 등 특별 전형은 분석 쿼리에서 제외 권장

#### Used by:
- `/univ-admission-analysis`: 학생 성적 기반 대학 전형 매칭
- `/admission-favorability`: 교과/종합/수능 전형 유불리 판단
- `/school-admission-report`: 학년 코호트 전형별 경쟁력 분포
- `/admission-trend`: 계열별 경쟁률/컷 추이 분석

---

## Knowledge Graph Tables

### student_kg_versions
**Purpose**: 학생별 지식그래프 JSON 버전 관리
**Primary Key**: id (UUID)
**Records**: 17

#### Columns:
- `id` (UUID): Primary key
- `student_id` (TEXT): 학생 코드 (NOT NULL)
- `version` (INT): 버전 번호 (NOT NULL, default: 1)
- `kg_json` (JSONB): 지식그래프 전체 JSON (NOT NULL)
- `source_categories` (TEXT[]): 소스 카테고리 목록 (default: '{}')
- `created_by` (UUID): 생성자
- `created_at` (TIMESTAMPTZ): 생성 일시

#### Usage Notes:
- `kg_json` 저장 시 트리거로 `student_kg_entities`, `student_kg_relations` 자동 생성
- `/text-knowledge-graph extract`로 생성된 JSON을 `/kg-save`로 저장

### student_kg_entities
**Purpose**: 지식그래프 엔티티 (트리거로 kg_json에서 자동 추출)
**Primary Key**: id (UUID)
**Records**: 1,300

#### Columns:
- `id` (UUID): Primary key
- `kg_version_id` (UUID): FK → student_kg_versions.id (NOT NULL)
- `student_id` (TEXT): 학생 코드 (NOT NULL)
- `entity_id` (TEXT): 엔티티 식별자 (NOT NULL)
- `label` (TEXT): 엔티티 라벨 (NOT NULL)
- `type` (TEXT): 엔티티 유형 (역량, 활동, 관심분야, 태도 등)
- `properties` (JSONB): 추가 속성 (default: '{}')
- `created_at` (TIMESTAMPTZ): 생성 일시

#### Usage Notes:
- `student_kg_versions` INSERT 트리거로 자동 생성됨. 직접 INSERT 불필요
- `/cohort-knowledge-graph` 스킬에서 코호트 간 공유 엔티티 분석에 사용

### student_kg_relations
**Purpose**: 지식그래프 관계 (트리거로 kg_json에서 자동 추출)
**Primary Key**: id (UUID)
**Records**: 2,190

#### Columns:
- `id` (UUID): Primary key
- `kg_version_id` (UUID): FK → student_kg_versions.id (NOT NULL)
- `student_id` (TEXT): 학생 코드 (NOT NULL)
- `source_entity_id` (TEXT): 출발 엔티티 ID (NOT NULL)
- `target_entity_id` (TEXT): 도착 엔티티 ID (NOT NULL)
- `relation_type` (TEXT): 관계 유형 (NOT NULL)
- `properties` (JSONB): 추가 속성 (default: '{}')
- `created_at` (TIMESTAMPTZ): 생성 일시

#### Usage Notes:
- `student_kg_versions` INSERT 트리거로 자동 생성됨. 직접 INSERT 불필요
- `source_entity_id`, `target_entity_id`는 `student_kg_entities.entity_id`와 매핑

---

## Student Activity Tables

### student_detailed_activities
**Purpose**: 학생 세부 활동 기록 (세특, 자율활동, 동아리, 진로 등 서술형 기록)
**Primary Key**: id (UUID)
**Records**: 24,593 (약 84MB)

#### Columns:
- `id` (UUID): Primary key
- `student_id` (TEXT): 학생 코드
- `category` (TEXT): 기록 유형 (세특, 자율활동, 동아리활동, 진로활동, 행동특성 등)
- `subject_name` (TEXT): 과목명 (세특인 경우)
- `content` (TEXT): 서술형 기록 내용
- `grade` (INT): 학년
- `semester` (INT): 학기
- `source` (TEXT): 데이터 출처
- `data` (JSONB): 추가 구조화 데이터
- `created_at` (TIMESTAMPTZ): 생성 일시
- `updated_at` (TIMESTAMPTZ): 수정 일시
- `analysis` (JSONB): AI 분석 결과

#### Indexes:
- `student_detailed_activities_pkey`: id
- `idx_sda_analysis_null`: (student_id, grade, category) WHERE analysis IS NULL — 미분석 레코드 빠른 조회
- `student_detailed_activities_no_dups`: (student_id, grade, semester, category, subject_name) UNIQUE — 중복 방지

#### Usage Notes:
- `/text-knowledge-graph extract` 스킬의 소스 데이터
- `analysis` 컬럼은 AI 분석 후 결과가 채워지며, NULL인 경우 미분석 상태
- `idx_sda_analysis_null` 부분 인덱스로 미분석 레코드를 효율적으로 조회

## External Content Tables

### educational_videos
**Purpose**: 교사가 큐레이션한 외부 교육 영상 메타데이터 (URL, 썸네일, 카테고리)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key (default: gen_random_uuid())
- `title` (TEXT): 영상 제목
- `url` (TEXT): 외부 영상 URL (YouTube 등)
- `thumbnail` (TEXT, nullable): 썸네일 URL
- `category` (TEXT): 카테고리 분류
- `likes` (INT): 좋아요 수 (default: 0)
- `created_by` (UUID): 등록자 (auth.users.id)
- `created_at` (TIMESTAMPTZ): 등록 일시
- `updated_at` (TIMESTAMPTZ): 수정 일시
- `meta` (JSONB): 추가 메타데이터 (default: '{}')

#### RLS Policies:
- **SELECT**: 모든 사용자 조회 가능
- **INSERT**: teacher 또는 admin만 등록 가능
- **UPDATE/DELETE**: 등록자 본인 또는 admin만

### educational_news
**Purpose**: 외부 입시/교육 뉴스 수집 (jinhak, uway, riroschool 사이트 큐레이션)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key (default: gen_random_uuid())
- `source` (TEXT): 출처 식별자 — CHECK ('jinhak', 'uway', 'riroschool')
- `title` (TEXT): 기사 제목
- `url` (TEXT): 원문 URL — UNIQUE 제약
- `article_date` (DATE, nullable): 기사 게시일
- `category` (TEXT, nullable): 분류 (수시, 정시, 전형분석, 학생부, 진로, 대입, 기타 등)
- `analysis_status` (TEXT, nullable): AI 요약 상태 (e.g., 'done')
- `academic_year` (TEXT, nullable): 학년도 (e.g., '2027학년도')
- `headline_summary` (TEXT, nullable): AI 추출 핵심 한 줄 요약
- `core_points` (TEXT[], nullable): AI 추출 핵심 포인트 배열
- `strategy_implications` (TEXT[], nullable): AI 추출 전략 시사점 배열
- `analyzed_from` (TEXT, nullable): 분석 파이프라인 식별자
- `analyzed_at` (TIMESTAMPTZ, nullable): 분석 일시
- `analysis_error` (TEXT, nullable): 분석 오류 메시지
- `collected_at` (TIMESTAMPTZ, nullable): 수집 시각 (외부 스크래퍼 timestamp)
- `meta` (JSONB): 추가 메타데이터 (default: '{}')
- `created_at` (TIMESTAMPTZ): 등록 일시
- `updated_at` (TIMESTAMPTZ): 자동 갱신 (BEFORE UPDATE 트리거)

#### Indexes:
- `educational_news_pkey`: id
- `educational_news_url_unique`: url UNIQUE — 중복 수집 방지
- `idx_educational_news_source_date`: (source, article_date DESC NULLS LAST)
- `idx_educational_news_category`: (category)
- `idx_educational_news_article_date`: (article_date DESC NULLS LAST)

#### RLS Policies:
- **SELECT**: 모든 사용자 조회 가능 ("Anyone can view educational news")
- **INSERT**: teacher 또는 admin만 등록 가능
- **UPDATE**: admin만 가능
- **DELETE**: admin만 가능

#### Trigger:
- `trg_educational_news_updated_at` → `set_educational_news_updated_at()` (SECURITY INVOKER, search_path=public): UPDATE 시 `updated_at` 자동 갱신

#### Usage Notes:
- 외부 입시 뉴스 수집 자동화에 사용. 정기 수집 시 `INSERT ... ON CONFLICT (url) DO NOTHING` 패턴으로 idempotent 적재
- `analysis` 관련 컬럼은 AI 요약 파이프라인이 후처리로 채움 (수집 시점에는 NULL)
- `core_points`, `strategy_implications`은 Postgres 네이티브 배열 (`text[]`)로 `ANY()` 검색 지원
- 데이터 소스 JSON 구조: `{ collected_at, sources: { jinhak|uway|riroschool: { articles: [{title, url, date, category, analysis}] } } }`

---

## Purchase Request Feature Tables

구매 신청 게시판(`src/features/purchase-requests`). 매니저가 신청 페이지를 만들고, 대상(학생/교사)이 항목을 신청하며, 매니저가 각 신청의 상태(제출됨/검토중/승인/거절)를 사유와 함께 변경한다.

### purchase_request_pages
**Purpose**: 구매 신청 페이지 (제목, 대상, 신청 기간, 컬럼 정의)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns (요약):
- `id` (UUID): Primary key
- `title` (TEXT), `description` (TEXT, nullable)
- `target_roles` (text[]): 신청 대상 ('student' | 'teacher')
- `period_start` / `period_end` (TIMESTAMPTZ): 신청 기간
- `columns` (JSONB): 신청 표 컬럼 정의 (`{ id, name, type, required, isDefault }[]`)
- `is_archived` (BOOLEAN), `archived_at` (TIMESTAMPTZ, nullable)
- `created_by` (UUID): FK → `resource(id)` — 페이지 작성자(매니저)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### purchase_request_collaborators
**Purpose**: 페이지 공동 작업자 (작성자와 동일한 매니저 권한)
**Columns**: `id`, `page_id` (FK), `resource_id` (FK → resource), `created_at`

### purchase_requests
**Purpose**: 개별 구매 신청 (신청자별 다건 가능). 항목은 JSONB로 저장, 상태/사유는 매니저가 관리
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key (default: gen_random_uuid())
- `page_id` (UUID): FK → `purchase_request_pages(id)`
- `requester_id` (UUID): FK → `resource(id)` — 신청자
- `items` (JSONB): 신청 항목 배열 (`{ id, cells: Record<colId, string|number> }[]`, default: `[]`)
- `status` (TEXT): 처리 상태 (default: `'submitted'`) — `'submitted'`(제출됨) | `'pending'`(검토중) | `'approved'`(승인) | `'completed'`(완료) | `'rejected'`(불가). CHECK 제약 없음 — 라벨은 프론트 `purchaseRequestStatus.ts`에서 관리
- `status_reason` (TEXT, nullable): **매니저가 입력한 상태 변경 사유 (최신 1개만 보관)**
- `status_updated_at` (TIMESTAMPTZ, nullable): **매니저가 상태/사유를 마지막으로 바꾼 시각**
- `meta` (JSONB): 확장 필드 (default: `{}`)
- `created_at` / `updated_at` (TIMESTAMPTZ)

#### RLS Policies:
- **SELECT/UPDATE/DELETE** (`view_own_or_manager` / `update_own_or_manager` / `delete_own_or_manager`): 본인 신청(`requester_id` = 내 resource) **또는** 페이지 매니저(`is_purchase_page_manager(page_id)`)
- **INSERT** (`create_own_request`): 본인 resource로만 신청 생성 가능

#### Triggers (실행 순서 = 트리거명 알파벳 순):
1. `aa_guard_purchase_request_status` → `guard_purchase_request_status()`: **비매니저가 status/status_reason 변경을 시도하면 OLD 값으로 복원** (신청자의 우회 상태 변경 차단). history 적재보다 먼저 실행되도록 `aa_` 접두 사용
2. `purchase_request_history_trigger` → `record_purchase_request_history()`: `items` 또는 `status` 변경 시 OLD 스냅샷(`status_reason` 포함)을 `purchase_request_history`에 적재
3. `trg_pr_updated_at` → `purchase_request_set_updated_at()`: `updated_at` 갱신

### purchase_request_history
**Purpose**: 신청 수정/상태 변경 이력 (트리거 전용 INSERT). 과거 사유도 보존
**Primary Key**: id (UUID)

#### Columns:
- `id` (UUID): Primary key
- `request_id` (UUID): FK → `purchase_requests(id)`
- `page_id` (UUID), `requester_id` (UUID)
- `items` (JSONB): 변경 전 항목 스냅샷
- `status` (TEXT): 변경 전 상태
- `status_reason` (TEXT, nullable): **변경 전 사유 스냅샷**
- `snapshot_at` (TIMESTAMPTZ): 변경 전 `updated_at`

#### Helper Function:
- `is_purchase_page_manager(p_page_id uuid)` → boolean: 현재 사용자가 페이지 작성자 또는 공동작업자인지 판정 (RLS·guard 트리거에서 사용)

---

## 교원 연수 이수증 (Training Certificate)

교원 연수 이수증 등록/관리 시스템. **승인 절차 없음** — 교사가 자신의 이수증을 직접 등록·관리한다. (마이그레이션 `20260608000001`에서 승인 컬럼 제거)

### training_types
**Purpose**: 교원 연수 종류 마스터. 관리자/연수담당자가 종류·이수기준 관리
**Primary Key**: id (UUID)

#### Columns:
- `id` (UUID): Primary key
- `code` (TEXT, UNIQUE): 연수 코드 (예: `mandatory1`)
- `name` (TEXT): 연수명
- `category` (TEXT): `annual` | `multi` | `special` (CHECK 제약)
- `category_label` (TEXT): '매년 필수' / '3년 누적' / '특수 연수'
- `required_hours` (INTEGER): 이수 기준 시간
- `unit` (TEXT): 단위 (기본 '시간')
- `description`, `cycle` (TEXT, nullable): 설명 / 다년 주기 표시
- `year` (INTEGER, nullable): 대상 학년도
- `is_active` (BOOLEAN): 비활성 시 교사 선택지에서 숨김
- `display_order` (INTEGER): 정렬 순서

#### RLS Policies:
- SELECT: 모두 / ALL: admin만

### training_certificates
**Purpose**: 교사가 등록한 연수 이수증. **종류당 1건** (UNIQUE 제약)
**Primary Key**: id (UUID)
**UNIQUE**: `(resource_id, training_type_id)` — 종류당 1건 보장

#### Columns:
- `id` (UUID): Primary key
- `resource_id` (UUID): FK → `resource(id)`, 등록 교사
- `training_type_id` (UUID): FK → `training_types(id)`
- `title` (TEXT): 연수명 (등록 시 연수 종류명 자동 채움)
- `organization` (TEXT): 주관 기관 (등록 UX 단순화로 빈 문자열 자동)
- `hours` (NUMERIC(5,1)): 이수 시간 (연수 종류의 required_hours 자동)
- `completed_at` (DATE): 이수일 (등록일로 자동)
- `certificate_number`, `memo` (TEXT, nullable): 미사용 (UI 비노출, NULL)
- `file_path`, `file_name`, `file_size`, `file_mime`: 첨부 파일 (Storage `training-certificates` 버킷)
- `submitted_at` (TIMESTAMPTZ): **등록 시기** (UI에 표시)
- `created_at`, `updated_at` (TIMESTAMPTZ)

> **제거됨** (마이그레이션 `20260608000001`): `status`, `reviewed_by`, `reviewed_at`, `review_note` — 승인 개념 삭제

#### RLS Policies:
- SELECT: admin 전체 / 교사 본인 resource 제출건
- INSERT: 본인 resource만
- UPDATE/DELETE: admin 전체 / 교사 본인 건 (승인 잠금 없음 → 항상 가능)

### training_progress_view (VIEW)
**Purpose**: 교사 × 연수종류별 이수 시간/건수 집계 (`security_invoker = true`)

#### Columns:
- `resource_id`, `teacher_name`, `training_type_id`, `training_code`, `training_name`, `category`, `required_hours`
- `completed_hours` (NUMERIC): 등록된 이수 시간 합계
- `entries` (INTEGER): 등록 건수

> **제거됨**: `percent`, `approved_entries`, `pending_entries` — 퍼센티지·승인 집계 개념 삭제

### 권한 (연수담당자)
- 전체 리스트 열람 + 연수 종류 관리: **admin** 또는 `resource_tags` `'연수담당자'` 태그 보유자
- 식별: `resource_tag_assignments` → `resource_tags(name='연수담당자')`
- 일반 교사: 본인 현황만 열람·등록
---

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
