# 교원 연수 이수증 (Training Certificate)

교원 연수 이수증 등록·관리 시스템 테이블.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

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
