# 교육 온톨로지 / 학생 활동 데이터

학교 교육과정, 모의고사 통계, 성취기준, 학생 세부 활동, 외부 교육 콘텐츠 테이블.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

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
**Records**: 5,413

#### Columns:
- `id` (UUID): Primary key
- `year` (INT): 시행 연도
- `month` (INT): 시행 월 (3, 6, 9)
- `student_grade` (INT): 학년
- `subject` (TEXT): 과목명 — DB 조회/필터의 과목 식별자 (예: '한국사', '물리학1', '통합과학')
- `problem_number` (INT): 문항 번호
- `major_category` (TEXT): 대단원 (nullable)
- `sub_category` (TEXT): 소단원 (nullable)
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
- **`major_category`는 과목 식별자가 아니라 대단원명이다.** 과목 필터링은 반드시 `subject` 컬럼을 사용할 것
  (예: `evalearnService.ts`의 `major_category IN ('독서','문학')`은 국어 공통 문항을 대단원 단위로 거르는 것이지 과목 식별이 아님).
- **(2026-07-02 정리)** 이전에는 `sub_category`에 "대단원ㅡ소단원"이 하나의 문자열로 합쳐져 들어간 행이 다수 있었음
  (구분자 `ㅡ`/`–`/`-` 혼재, 사회탐구·역사·통합과학·통합사회 계열 약 2,470건). 전량 `major_category`(대단원)/`sub_category`(소단원)로
  분리 완료 — 이제 전 행이 일관되게 "대단원/소단원" 구조를 따름. 로마숫자 접두사(`Ⅰ.`~`Ⅵ.`, 옛 2015 개정 통합과학 단원 표기)도 제거함.
  단, 같은 대단원이 표기 차이로 남아있을 수 있음 (예: `'시스템과 상호작용'` vs `'시스템과 상호 작용'` — 띄어쓰기만 다름, 미통합).
  원본값은 `mock_problems_category_split_backup_20260702`, `mock_problems_tonghap_gwahak_backup_20260702` 백업 테이블에 보존.

---

## School Exam Tables (학교 지필평가)

> 출처: NEIS "문항정보" / "학생답안" 내려받기를 CSV로 변환한 두 파일.
> 파서·채점 규칙 단일 출처 = `src/features/evalearn/utils/schoolExamCsv.ts`,
> 회귀 = `npx tsx scripts/school-exam-test/run.mts` (라이브 전체 파일 검증은 `SCHOOL_EXAM_DIR=<폴더>` 지정)

**모의고사(`mock_problems`)와 왜 분리했나**
- 키가 다르다. 모의고사는 `(year, month)`, 학교시험은 `(academic_year, semester, exam_round)`.
- 모의고사는 전국 정답률이 주어지지만 학교시험은 **우리 응시 데이터에서 직접 계산**한다.
- 학교시험에만 성취기준코드·교사 지정 난이도·문항별 배점이 있다.

### school_exam_question
**Purpose**: 학교 정기고사 문항 메타
**Primary Key**: id (UUID)
**RLS**: 읽기 = 교사/admin (`is_teacher_or_admin`), 쓰기 = admin 전용
**Unique**: (academic_year, semester, exam_round, grade, subject_section, answer_type, problem_number)

#### 주요 컬럼
- `exam_round` (INT): 1차/2차. 원문 라벨은 `exam_name`('1차 정기시험')에 보존
- `subject_section` (TEXT): NEIS 원본 표기 `공통국어1(3)`. **괄호 안은 이수단위(학점)**이며 과목명과 1:1이다(라이브 전수 확인: 과목명 하나에 분반 표기 2개 이상인 경우 0건). `subject_name`·`credits`는 여기서 파생
- `answer_type` (TEXT): `선택형` | `서답형`
- `problem_number` (INT): **`answer_type`별로 각각 1부터 시작한다**(선택형 1..20, 서답형 1..8). 번호만으로 문항을 특정할 수 없으므로 조회 시 `answer_type`을 반드시 함께 걸 것
- `designated_difficulty` (TEXT): 출제 교사가 지정한 `쉬움`/`보통`/`어려움`. 실제 정답률과 다를 수 있고 **그 괴리 자체가 분석 대상**
- `answer` (TEXT): `3` 또는 `3,5`. 쉼표의 의미는 `has_multiple_answers`에 따라 갈린다 — 아래 채점 규칙 참조
- `standard_code` / `standard_text`: `10공국1-05-02` 형식. **`subject_achievement_standards.standard_code`는 대괄호를 포함**(`[10공국1-01-01]`)하므로 조인 시 정규화 필요. 라이브 2026-1은 전 문항에 채워져 있다

### school_exam_result
**Purpose**: 학생별 응시 결과
**Primary Key**: id (UUID)
**RLS**: 읽기 = 교사/admin, 쓰기 = admin 전용
**Unique**: (student_code, academic_year, semester, exam_round, subject_section)

#### 주요 컬럼
- `student_code` (TEXT): `resource.meta->>'id'` (`00-00646`). **FK 없음** — 시험 후 전출·자퇴한 학생의 응시 기록도 남아야 하고 학적 테이블과 수명이 다르다
- `answers` (TEXT[]) / `correct` (BOOLEAN[]): **선택형 문항만**, 문항번호 순. `answers[i]`가 선택형 `i+1`번이다. CHECK 제약이 두 배열 길이를 강제한다
- `class_label` / `student_number`: 응시 당시 학반 스냅샷(현재 학적과 다를 수 있다)
- `meta.scoring = 'derived'`: NEIS 채점이 확정되기 전이라 **우리가 정답 대조로 채점**한 행. 화면이 "채점 미확정" 배지를 띄우는 근거

### get_school_exam_subject_analysis(student_code, academic_year, semester, exam_round, **grade**, subject_section) → jsonb
학년(=그 과목 응시자 전체) 대비 통계. `{cohort, student, items, areas, standards}` 반환.
**SECURITY INVOKER** — 판정을 RLS에 위임한다(DEFINER로 두면 학생이 남의 점수 분포를 읽는다. 실사용자 컨텍스트 검증: 교사 7,433행·학생 0행).
**`grade`가 키에 반드시 들어간다** — `subject_section`이 학년 간 겹친다(라이브: `인공지능 수학(3)` 1차를 2학년 26명·3학년 40명이 **각각 다른 시험으로** 봤다). 빼면 66명이 한 모집단이 되고 `items`의 같은 `problem_number`에 서로 다른 두 문항의 정오가 쌓여 정답률·평균·석차가 통째로 오염된다. 클라이언트도 결과 행의 `grade`를 쓰고 **학생의 현재 학년을 쓰지 않는다**(지난 학년도 고사를 열면 문항을 못 찾는다).
**모집단이 작을 수 있다** — 선택과목은 12명까지 내려가므로 백분위를 쓰는 화면은 `cohort.count`를 함께 보여줘야 한다.

### get_school_exam_student_overview(student_code, academic_year, semester, exam_round) → jsonb
한 학생이 그 고사에서 본 **전 과목**의 분포 요약(5수치 + 평균) + 본인 점수·석차·백분위. 과목별 상자그림 화면을 왕복 한 번으로 그린다.
- **`cohort_count`(채점 완료)와 `taken_count`(응시)를 분리해서 준다.** 분포는 총점이 있는 학생만으로 계산되는데, 채점이 진행 중이면 그 부분집합이 편향돼 있다(라이브 2026-1 2차 화학: 99명 응시 중 24명 채점). 두 수가 다르면 화면이 상자를 점선으로 낮추고 `채점 24/99`를 띄운다 — 191명짜리 과목 상자와 같은 신뢰도로 읽히면 안 된다.
- **수염은 Tukey 울타리가 아니라 최저~최고 전체 범위**다. 이상치를 개별 점으로 찍으면 다른 학생의 정확한 점수가 노출되고, 범위 수염은 숨기는 값이 없어 오해가 없다.
- **석차는 코호트 전체에서 구한 뒤 본인 행을 골라야 한다.** `where student_code = ...`를 `rank()`와 같은 층에 두면 WHERE가 윈도우 함수보다 먼저 적용돼 본인 한 행만 놓고 순위를 매기고 **전 과목이 1위·상위 100%**로 나온다(실제로 겪은 버그).

### 알아야 할 데이터 성질 (라이브 2026-1 전수 확인)

1. **학생 답안은 선택형만 있다.** 75개 (고사×학년×과목) 조합 전부에서 `답안` 개수 == 선택형 문항 수였다. 서답형 404문항은 메타만 있고 학생별 정오가 없어 총점(`descriptive_score`)으로만 다룰 수 있다.
2. **학생 매칭 키는 NEIS 학번이 아니라 (학년, 반, 번호)다.** NEIS 학번(`2026000182`)은 우리 학생코드와 이어지지 않는다. 626명 전수 대조에서 622명 매칭·이름 불일치 0건(미매칭 4명은 시험 후 자퇴/전출). **이름으로 매칭하면 안 된다** — 학년 내 동명이인이 19쌍 있다.
3. **`반`이 숫자가 아닌 행은 우리 학생이 아니다.** 타교 위탁 수강생(`고급화학`·`고급생명과학`, 26명)이 섞여 오며 전원 그 한 과목만 응시했다.
4. **채점 규칙 — 정답 필드의 쉼표는 두 가지 뜻이다.** `has_multiple_answers=true`면 `2,5`는 "둘 다 골라야 정답"(집합 일치), 아니면 `1,2,3,4,5`는 "전항 정답"(문제 오류로 전원 정답 처리 — 포함되기만 하면 정답, 무응답도 정답). 이 규칙으로 재채점하면 NEIS 정오 152,120건 중 152,119건이 일치한다. **그래도 NEIS 정오가 있으면 그것이 정본**이고, 파생 채점은 미채점 행에만 적용한다.
5. **NEIS는 뒤쪽 연속 무응답을 잘라서 내보낸다.** 라이브에서 1건 발견(3학년 2차 윤리와 사상, 18문항인데 답안 16개). 배열 인덱스가 곧 문항번호라 짧은 채로 두면 그 학생이 뒤 문항 통계에서 조용히 빠진다 — `applyDerivedScoring`이 무응답으로 복원한다.
6. **난이도 밴드 컷오프가 모의고사와 다르다.** 학교 시험 전체 평균 정답률이 **66.9%**라 모의고사 컷(≤40% = 상)을 쓰면 '상'이 9%뿐이라 가중치가 죽는다. 학교 시험은 **≤55% = 상, ≥80% = 하**(분포 사분위 기준, 상 27%/중 44%/하 28%). 상수 = `utils/difficulty.ts`의 `SCHOOL_HARD_CUTOFF`/`SCHOOL_EASY_CUTOFF`
7. **교사 지정 난이도는 실제 정답률과 순서만 맞고 분포가 크게 겹친다**(쉬움 72.6% / 보통 67.1% / 어려움 59.0% 평균). 1단계 차이는 전체의 47%라 노이즈이므로 **2단계 어긋남(8.6%)만** 화면에 표시한다(`isDifficultyGap`).

### 적재 경로 2종
- **관리 UI**: evalearn 헤더 ⚙(admin 전용) → "학교 시험" 탭. 분석 → 확인 → 등록 2단계이며 미매칭 학생·이름 불일치·무결성 문제를 먼저 보여준다
- **스크립트**: `npx tsx scripts/school-exam-import/run.mts <문항정보.csv> <학생답안.csv> [--apply]`. `--apply`와 `SUPABASE_SERVICE_ROLE_KEY`가 **둘 다** 있어야 실제로 쓴다(없으면 점검 모드)

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
