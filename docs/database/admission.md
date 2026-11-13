# 입시 데이터 (입시 허브 · 대학 전형)

입시 허브(동영상·뉴스 피드)와 대학 전형 커트라인 데이터 테이블.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## 입시 허브 (ipsi-hub)

입시 관련 동영상·뉴스를 하나의 피드로 보여주는 기능. 두 소스 테이블과, 이를 통합·페이지네이션하는 View/RPC로 구성된다.

### educational_videos
- 입시 관련 YouTube 동영상. `category`, `likes`, `created_by`, `channel_label`, `duration_seconds`, `headline_summary`, AI 분석 결과(`meta.core_points` 등) 보유
- `article_date`: timestamptz / 정렬·표시는 `article_date → collected_at → created_at` 우선순위
- 좋아요: `video_likes` 테이블(`user_id`, `video_id` uuid)에 per-user 저장

### educational_news
- 입시 뉴스(진학사/유웨이/리로스쿨/직접 추가). `source` CHECK = `jinhak`·`uway`·`riroschool`·`manual`(2026-11-09 — MCP `add_ipsi_news` 로 교사·관리자가 더한 기사, `meta.added_by`·`added_via`. 출처 이름 단일 출처 = 웹 `utils/newsSources.ts`), `url` UNIQUE, `category`, `core_points`, `strategy_implications`, `data_points`, `cautions`, `headline_summary` 보유
- `article_date`: **date** 타입 (videos와 다름 — View에서 timestamptz로 캐스팅해 정렬 통일)

### ipsi_hub_feed (View)
- `educational_videos` + `educational_news`를 `UNION ALL`한 통합 피드 View
- `WITH (security_invoker = true)` — 호출자의 RLS를 그대로 상속(두 소스 테이블 모두 RLS 활성)
- `sort_date`: `COALESCE(article_date::timestamptz, collected_at, created_at)`로 NULL 방어 + 타입 통일
- 두 매퍼(`toVideoFeedItem`/`toNewsFeedItem`)가 쓰는 컬럼 합집합을 노출, 한쪽에 없는 컬럼은 NULL

#### Related RPC:
- `get_ipsi_hub_feed(p_type text, p_category text, p_limit int, p_offset int, p_query text default null) → jsonb`
  - 서버 페이지네이션. `p_type`: 'all'|'video'|'news', `p_category`: NULL/'전체'면 전체
  - **`p_query`(2026-09-22)**: 제목·요약·카테고리 + 뉴스 출처·포인트·**본문(`content`)** + 영상 채널·`meta` 문자열·**자막(`transcript`)** 검색.
    공백 분리 AND(최대 8단어·100자), 띄어쓰기·대소문자 무시, `strpos` 비교(와일드카드 없음). 비면 종전과 동일.
    검색 중에는 `video_count`/`news_count` = 검색에 맞는 수(필터 무관), 각 item 에 `match_field`/`match_snippet`(제목·요약에 안 보이는 검색어의 위치와 발췌).
    발췌 도우미 = `ipsi_hub_search_snippet(text, text[])` (IMMUTABLE). 마이그레이션 `20260922110000_ipsi_hub_feed_search.sql`
  - 반환: `{ items: [...], total_count, video_count, news_count }`
  - `total_count`는 필터 적용 후 개수(페이지 버튼용), `video_count`/`news_count`는 필터 무관 전체(배지용)
  - `items`의 video 행은 `auth.uid()` 기준 `is_liked_by_user` 포함
  - `SECURITY INVOKER` + `STABLE`. 프론트엔드: `useIpsiHubFeed` hook (TanStack Query)

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
- 2021~2025년 5개년 적재(2026-11-09 실측 — 연도마다 2.5~2.9만 행)
- MCP `read_data admission_results` 로도 읽는다(0 → null, 2026-11-09)
- 특성화고, 농어촌 등 특별 전형은 분석 쿼리에서 제외 권장

#### Used by:
- `/univ-admission-analysis`: 학생 성적 기반 대학 전형 매칭
- `/admission-favorability`: 교과/종합/수능 전형 유불리 판단
- `/school-admission-report`: 학년 코호트 전형별 경쟁력 분포
- `/admission-trend`: 계열별 경쟁률/컷 추이 분석

### admission_gyogwa_criteria
**Purpose**: 2027 학생부교과전형 통합 대시보드 데이터 (전형별 모집단위 + 교과·진로 반영방법)
> 구 이름: `admission_gyogwa_programs` (2026-06-23 rename)
**Primary Key**: id (TEXT, 예: 'a1')
**RLS Enabled**: Yes (authenticated SELECT 전용, 쓰기는 service_role)
**Records**: 376 (170개 대학)
**출처**: https://jinhak.esteacher.kr/2027gyogwa.html (원 출처: 대입정보119/대교협)

크롤링 경위: 대시보드 페이지는 데이터 API 없이 인라인 `<script>`에 `{base:376, subjects:236, careers:179}` JSON을 임베드한다(Playwright로 추출). 단일 평탄화 테이블로 적재하되, 각 프로그램이 참조하는 교과·진로 반영방법을 ID 대신 **전체 객체를 JSONB로 임베드**(무손실). 참조 무결성 dangling 0건 확인.

#### Columns:
- `id` (TEXT): Primary key (base.id, 예 'a1')
- `region` (TEXT): 권역 (서울/경기/… 17종) NOT NULL
- `university` (TEXT): 대학명, 분교 표기 포함 (예 "가톨릭대 (성의)") NOT NULL
- `uni_key` (TEXT): 정규화 키 (예 "가톨릭대(성의)")
- `broad_uni_key` (TEXT): 분교 통합 키 (예 "가톨릭대")
- `admission` (TEXT): 전형명
- `unit` (TEXT): 모집단위
- `method` (TEXT): 전형방법 원문
- `method_tags` (TEXT[]): 전형방법 태그 (교과100/면접/인적성/출결/서류/봉사/단계별/기타)
- `unit_tags` (TEXT[]): 모집단위 분류 (간호/의예/일반/인문/자연/교육/공학·AI/약학)
- `quota` (INT): 모집인원(정수)
- `quota_text` (TEXT): 모집인원 원문 (비정수 가능, 예 "175+ (계약 학과3)")
- `csat` (TEXT): 수능최저 원문
- `csat_status` (TEXT): 있음(150) / 없음(220) / 미기재(6)
- `has_csat` (BOOLEAN): 수능최저 적용 여부
- `search_blob` (TEXT): 통합 검색용 텍스트 (대시보드 검색창이 쓰던 blob)
- `subjects_exact` (JSONB): 교과 반영방법(정확 매칭) 객체 배열 — {id,region,university,admission,unit,subjects,ratio,…}
- `subjects_all` (JSONB): 교과 반영방법(전체) 객체 배열
- `careers` (JSONB): 진로선택 반영방법 객체 배열 — {id,region,university,method,subject,criteria,note,…}. 64개 프로그램은 빈 배열(진로선택 미반영)
- `source_url` (TEXT): 출처 URL (default 고정값)
- `crawled_at` (TIMESTAMPTZ): 적재 시각 (default: now())

#### Indexes:
- `admission_gyogwa_criteria_pkey`: id
- `idx_gyogwa_region`: region
- `idx_gyogwa_broad_uni`: broad_uni_key
- `idx_gyogwa_csat_status`: csat_status
- `idx_gyogwa_method_tags`: GIN(method_tags)
- `idx_gyogwa_unit_tags`: GIN(unit_tags)
- `idx_gyogwa_search_trgm`: GIN(search_blob gin_trgm_ops) — 부분일치 검색용 (pg_trgm)
- `idx_gyogwa_subjects_all`: GIN(subjects_all)
- `idx_gyogwa_careers`: GIN(careers)

#### Data Constraints:
- 학생부교과전형 데이터만 (종합/논술/정시 미포함). `univ_admissions`와 별개 소스
- `csat_status='미기재'`는 원문에 수능최저 정보가 비어 있던 경우
- 재크롤링 시 동일 `id` UPSERT(`ON CONFLICT DO UPDATE`)로 갱신, `crawled_at` 자동 갱신
- 적재 절차: `docs/superpowers/specs/2026-06-23-2027gyogwa-crawl-design.md` 참조

### admission_adiga_results
**Purpose**: adiga(대입정보포털) 대학발표 입시결과 — **학과별 커트라인**(grade50/grade70) + 2024·2025 과거이력
**Primary Key**: id (TEXT, 예: 'r691')
**RLS Enabled**: Yes (authenticated SELECT 전용, 쓰기는 service_role)
**Records**: 16,129 (191개 대학, 2,627개 학과)
**출처**: https://jinhak.esteacher.kr/adiga/data/admission-data.json (원 출처: adiga 2024/2025/2026 50%·70% 컷 CSV)

크롤링 경위: `/adiga/` 페이지는 별도 정적 JSON 파일(`admission-data.json`, 20.5MB)을 fetch한다. Playwright `browser_evaluate`에서 그 파일을 받아 행을 매핑하고, 브라우저 안에서 직접 Supabase RPC(`load_adiga_batch`, 적재 후 제거된 임시 SECURITY DEFINER 함수)를 500행 배치로 호출해 적재(에이전트 컨텍스트 미경유). 2026 결과는 스칼라 컬럼, 2024·2025 과거이력+추이는 `history` JSONB로 무손실 보존.

#### Columns:
- `id` (TEXT): Primary key (records[].id, 예 'r691')
- `region` (TEXT): 권역 (서울/경기/대구경북/부산울산경남/광주전남/… 13종, '미분류' 포함) NOT NULL
- `university` (TEXT): 대학명 NOT NULL
- `university_canon` (TEXT): 정규화 대학명
- `track` (TEXT): 교과(9,892) / 종합(6,237)
- `track_type` (TEXT): subject / comprehensive
- `program` (TEXT): 전형명
- `major` (TEXT): 학과명
- `field` (TEXT): 계열 (65종, NULL 2,315)
- `domain` (TEXT): 도메인 (의학/자연/예체능/인문/통합/공통, NULL 873)
- `grade50` (NUMERIC): **50% 컷 (중위)**, 범위 1~9, 비NULL
- `grade70` (NUMERIC): **70% 컷 (합격자 하위 30% 선)**, 범위 1~9, 비NULL
- `grade_quality` (TEXT): placeholder / inverted / normal / degenerate
- `recruit_2026` (INT): 2026 모집인원
- `competition_2026` (NUMERIC): 2026 경쟁률 (NULL 208)
- `waitlist_2026` (INT): 2026 충원(예비)
- `real_competition_2026` (NUMERIC): 실질경쟁률 (NULL 208)
- `fill_rate_2026` (NUMERIC): 충원율 (NULL 102)
- `history` (JSONB): `{ trend: {deltaFrom2025, range, direction}, years: {"2024":{…},"2025":{…}} }` — 16,129행 전부 보유
- `search_text` (TEXT): 통합 검색용 텍스트
- `source_url` (TEXT): 출처 URL (default 고정값)
- `crawled_at` (TIMESTAMPTZ): 적재 시각 (default: now())

#### Indexes:
- `admission_adiga_results_pkey`: id
- `idx_adiga_region`: region
- `idx_adiga_univ_canon`: university_canon
- `idx_adiga_track`: track
- `idx_adiga_domain`: domain
- `idx_adiga_field`: field
- `idx_adiga_grade70`: grade70
- `idx_adiga_search_trgm`: GIN(search_text gin_trgm_ops)
- `idx_adiga_history`: GIN(history)

#### Data Constraints:
- `grade70`은 70% 커트라인(합격자 하위 30% 선)이며 합격선이 아님 — `univ_admissions.gpa_cutoff`와 같은 의미체계라 교차 분석 가능
- `track`은 교과/종합만 (논술/정시 미포함)
- `gradeQuality='placeholder'`는 당해 데이터 부족으로 추정치를 채운 경우 — 직접 비교 시 주의
- 과거 추이는 `history.years.{2024,2025}`로 한 행에 내장 (별도 join 불필요)
- 재크롤링 시 동일 `id` UPSERT로 갱신
- 적재 절차: `docs/superpowers/specs/2026-06-23-adiga-crawl-design.md` 참조

#### Used by (예정):
- `/admission-trend`: history.years 기반 학과별 3개년 커트/경쟁률 추이
- `/univ-admission-analysis`, `/admission-favorability`: 학과별 커트라인 매칭 (univ_admissions와 교차)

### admission_jonghap_criteria
**Purpose**: 학생부종합전형 평가기준 — **서류평가 + 면접평가를 대학 단위로 가로 병합** (1대학=1행)
**Primary Key**: code (TEXT, 대학 고유 코드 예: '0000063')
**RLS Enabled**: Yes (authenticated SELECT 전용, 쓰기는 service_role)
**Records**: 197 (대학)
**출처**: jinhak.esteacher.kr/jonghap_eval.html(서류) + jonghap_interview.html(면접) — 데이터 파일은 `jonghapdoc_eval_data.js`·`jonghap_interview_data.js` (원 출처: adiga 2027 전형 평가기준 공개)

크롤링 경위: 두 페이지는 각각 전용 JS 데이터 파일(`window.JONGHAP_DOC_EVAL_DATA`·`window.JONGHAP_INTERVIEW_EVAL_DATA`)을 로드한다. 브라우저에서 두 `.js`를 fetch→파싱→**대학 code로 197:197 완벽 매칭(불일치 0)** 가로 병합→RPC 배치 적재(에이전트 컨텍스트 미경유). 같은 대학의 서류·면접 평가기준을 한 행에서 조회. 59개 대학은 양쪽 모두 미공개(행 유지, 상세 빈 값).

#### Columns:
- `code` (TEXT): Primary key (대학 고유 코드)
- `name` (TEXT): 대학명 (예 '가천대학교[본교]') NOT NULL
- `region` (TEXT): 권역 (17종) NOT NULL
- `recruitment` (INT): 종합전형 모집인원
- **서류평가 (doc_\*)**
  - `has_doc_eval` (BOOLEAN): 서류평가 데이터 보유 (true 137)
  - `doc_section_text` (TEXT): 서류평가 원문
  - `doc_content_tables` (JSONB): 서류 평가내용 표 — [{tableNo,context,rows:[{cells,special,rowText}]}]
  - `doc_ratio_tables` (JSONB): 전형별 평가요소 비율 표(원본)
  - `doc_parsed_ratios` (JSONB): 파싱된 평가요소 비율
  - `doc_top_factors` (JSONB): 서류 대표 평가요소
  - `doc_search_text` (TEXT): 서류 검색 텍스트
- **면접평가 (interview_\*)**
  - `has_interview` (BOOLEAN): 면접 데이터 보유 (true 127)
  - `interview_status` (TEXT): 면접 실시(101)/부분 실시/면접 없음/구간 없음
  - `interview_methods` (TEXT[]): 개별면접/구술·제시문/그룹·다대다/블라인드
  - `interview_blocks` (JSONB): 전형별 면접 상세 — [{admission,process,time,source,special,factors:[{name,standard,ratio,value,items,questions[]}]}]. **questions = 면접 기출질문 배열**
  - `interview_top_factors` (JSONB): 면접 대표 평가요소
  - `interview_primary_time` / `interview_primary_process` / `interview_primary_source` (TEXT): 대표 면접 시간·방식·활용자료
  - `interview_search_text` (TEXT): 면접 검색 텍스트
- `source_url_doc` / `source_url_interview` (TEXT): 출처 URL (default 고정값)
- `crawled_at` (TIMESTAMPTZ): 적재 시각 (default: now())

#### Indexes:
- `admission_jonghap_criteria_pkey`: code
- `idx_jonghap_region`: region
- `idx_jonghap_name`: name
- `idx_jonghap_intv_status`: interview_status
- `idx_jonghap_intv_methods`: GIN(interview_methods)
- `idx_jonghap_parsed_ratios`: GIN(doc_parsed_ratios)
- `idx_jonghap_intv_blocks`: GIN(interview_blocks)
- `idx_jonghap_doc_search_trgm`: GIN(doc_search_text gin_trgm_ops)
- `idx_jonghap_intv_search_trgm`: GIN(interview_search_text gin_trgm_ops)

#### Data Constraints:
- 서류·면접은 대학 `code`로 1:1 병합 (eval/interview 양쪽 197개 대학 동일, name/region/recruitment 불일치 0)
- 양쪽 모두 데이터 없는 대학 59개는 행 유지하되 doc_\*/interview_\* 상세가 빈 값 — `has_doc_eval`/`has_interview`로 필터
- `interview_blocks[].factors[].questions` = 대학·전형별 면접 기출질문 (면접 대비 자료)
- 재크롤링 시 동일 `code` UPSERT로 갱신
- 적재 절차: `docs/superpowers/specs/2026-06-23-jonghap-criteria-crawl-design.md` 참조

#### Used by (예정):
- 종합전형 상담: 대학별 서류 평가요소 비율 + 면접 방식·기출질문을 한 행에서 조회
- 입시 도메인 3축 완성: `admission_gyogwa_criteria`(교과) · `admission_adiga_results`(커트) · `admission_jonghap_criteria`(종합 평가기준)

### admission_exam_schedule
**Purpose**: **대학별고사 일정**(논술·면접·실기) + 원서접수 + **최종 합격자 발표일**. 비교표 `일정` 영역이 읽는다.
**Primary Key**: id (TEXT, `E0001…` = 원본 events 배열 순번)
**RLS**: 로그인 사용자 SELECT `using(true)`, 쓰기 정책 없음(service_role 적재 전용)
**출처**: `jinhak.esteacher.kr/2027gosa.html` 의 **`const DB = {...}` JS 리터럴**. 변경사항 페이지와 달리 `application/json` 태그가 아니라 변수라 괄호 균형으로 잘라 낸다(파서 = `utils/admissionSchedule.ts`).
**적재**: `npx tsx scripts/admission-schedule-import/run.mts [--apply]`
**적재 현황(2026-09-01)**: 1,461건 · 대학 211곳 · 면접 779·실기 602·논술 80 · 발표일 1,310 · 원서접수 1,299 · 수집일 2026-06-12

#### 원본이 인덱스 압축 구조다
`events[i] = [u, t, st, d1, d2, p, m, app, ann, os, c, x]` 로 `unis`/`paths`/`units` 를 인덱스로 참조한다(페이지 자신의 전개 코드가 스키마를 밝힌다). 적재 시 **평탄화**해서 넣는다 — 참조를 그대로 두면 화면·SQL 이 매번 조인 테이블 3개를 더 알아야 한다.
- `t` = 0 논술 / 1 면접 / 2 실기 (**`EXAM_TYPES` 배열 순서가 곧 인덱스라 순서를 바꾸면 안 된다**)
- `d1`/`d2`·`app` 은 **MMDD** 라 연도가 없다 → `meta.year` 로 만든다. 코드에 연도를 박으면 다음 해 자료를 넣는 순간 전 일정이 1년 어긋난다.
- `c` 가 빈 문자열이면 '요강 보완 이벤트'(모집단위 없이 `x=[고사시각, 비고]` 만, 라이브 147건)

#### `announce_text` 는 최종 합격자 발표일이다
라이브 실측: 10월 69·11월 559·12월 624건(수시 최종 발표 시기)이고, 1차/2차 고사 쌍 32건 중 29건이 같은 값이라 **단계별 발표가 아니라 전형 단위 값**이다. **1차(면접 대상자) 발표일은 이 자료에 없어** 수동 입력으로 남긴다.
`' / '` 가 들어 있으면 원본이 "모집단위별 상이"를 뜻한다(18건) → **자동 채움을 보류**한다. 어느 쪽인지 모르는 채 한 날짜를 넣으면 학생이 그 날짜를 믿는다.

#### `university_canon` (generated)
`공백 제거 → [] () 제거 → 대학교→대`. 이 자료는 **정식명**(`전북대학교`)인데 위시리스트는 약칭(`전북대`)이라 trgm 유사도가 0.375 밖에 안 나온다(실측: 21개 대학 중 3곳만 매칭). 유사도 대신 결정적 정규화로 맞춰 **19곳(90%)** 으로 올렸다. 캠퍼스가 뭉개지므로 RPC 가 `matched_university` 원문을 함께 돌려주고 화면이 그걸 표시한다.
- **변경사항 테이블과 규칙이 다른 이유**: 그쪽은 이름이 그대로 맞아떨어져 '정확 일치 우선'이 통했다. 자료마다 다르다.

#### RPC
- `get_admission_schedules(p_universities text[])` (INVOKER): 정규화 대학명으로 매칭해 **대학 단위로** 내려준다. **전형 필터는 화면이 한다**(`matchesAdmissionName`) — 근거 모달이 "이 대학의 다른 전형" 도 보여줘야 해서 서버가 미리 걸러 버리면 그 정보를 잃는다.
- **전형명 매칭이 정확하다는 것은 라이브로 확인했다**(2026-09-01, 위시리스트 46건): 19건 매칭, 나머지는 대부분 **그 트랙 고사가 아예 없는 전형**(전북대 교과 전형들·성균관대 학교장추천 등)이었다. 매칭 0건을 자료 결손으로 오해하지 말 것. 점검 도구 = `scripts/admission-schedule-import/match-audit.mts`.
  - 그 감사 스크립트는 일정 전체를 읽으므로 **`range()` 페이징이 필수**다 — 1,461건이라 범위 없는 select 는 1000행에서 조용히 잘리고, 실제로 그 탓에 전북대가 7건 → 1건으로 보여 매칭률을 거짓으로 낮게 재는 일이 있었다.

---

### admission_csat_rule
**Purpose**: **수능최저 원문을 학과 범위별로 구조화**. 원문 한 칸에 여러 조건이 붙어 있어(`국,수,영,탐 중 2개 합 5, 한 5  의예,한의예: … 3개 합 4`) 화면이 학생 학과에 어느 조건이 적용되는지 몰라 보류하던 것을 판정 가능하게 한다.
**Primary Key**: id (UUID) · **Unique**: (gyogwa_id, block_index)
**RLS**: 로그인 사용자 SELECT `using(true)`, 쓰기 정책 없음
**적재**: `SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/csat-structure-import/run.mts [--apply]` (**LLM 없음**)
**적재 현황(2026-09-01)**: **253건 · 147/150 전형** · 학과지정 150 · 계열 19 · 기본 84 · 블록 커버리지 91.7%

#### ★ 생성 모델을 쓰지 않는다 (2026-09-01 전환) ★
처음엔 Solar `solar-pro3` 로 범위를 해석했으나 **사전 방식으로 교체**했다(사용자 결정). 결과도 더 좋다: LLM 179건/96전형 → **사전 253건/147전형**.
- **블록 분리·수치** = 기존 파서(`splitCsatBlocks`/`parseCsatRule`)
- **라벨 해석** = 손으로 쓴 사전 `utils/csatLabels.ts` (라이브 라벨은 88종뿐이고 대부분 반복된다)
- 셋 다 결정적이라 같은 원문이면 언제 돌려도 같은 결과가 나온다. 수능최저처럼 틀리면 지원 판단이 무너지는 값에는 **재현성이 정확도만큼 중요하다**.
- 사전이 못 푸는 라벨은 **건너뛴다** → 화면이 종전대로 "판정 보류 + 원문 표시". 새 라벨은 `scripts/csat-structure-import/labels.mts` 로 목록을 뽑아 확실한 것만 추가한다.
- **사전에 일부러 넣지 않은 것들**: `자연(일부 제외)`·`사범대(체육교육 제외)`(제외 범위 불명) · `한의예(인문)`/`한의예(자연)`(같은 학과를 둘로 갈라 ambiguous) · `글로벌(리더`·`경영)`(원문 분리 오류 조각) · `석당인재`·`아산아너스`(전형명) · `경영`·`공과`·`사범`(너무 넓다).
- `buildCsatRules()`(LLM 답안 검증 경로)는 삭제하지 않고 남겨 두었다 — 회귀 테스트가 검증 규칙을 고정하고 있고, 나중에 보조 수단으로 쓸 여지가 있다.

#### 검증에서 버리는 이유 (`RejectReason`)
`block-not-found` · `condition-not-in-source` · `label-not-in-source`(모델이 지어낸 학과명) · `unparseable` · `series-invalid` · `terms-forbidden`(`전체`·`모든` 등 포괄어 — **범위를 넓히는 실수는 좁히는 실수보다 위험**) · `terms-too-many` · `terms-missing` · **`areas-incomplete`**
- **조건 꼬리 자르기(`trimConditionText`)**: `splitCsatBlocks` 는 수치 없는 조건(`… : 없음`)을 블록으로 만들지 못해 **앞 블록 끝에 남긴다**. 계명대 실측에서 `[경찰행정,간호]` 조건에 `기독교,철학,사진영상미디어,경영(야): 없음` 이 딸려 들어가 남의 학과 조건이 내 칸에 붙었다. 수치 조건 뒤의 `학과나열:` 에서 잘라 내고, 블록 분리가 괄호 도중 끊겨 남은 `… 합 4 (` 도 정리한다.
- **`areas-incomplete` 가 파서 결함을 드러냈고, 그 결함을 고쳤다**: `국,수(미/기),영,과(1) 중 3개 합 5` 를 파서가 `영·탐` 으로만 읽어 **국·수를 안 보는 기준**이 될 뻔했다(39건 폐기). 원인은 `parseCsatRule` 의 영역 토큰 정규식에 `미`·`기` 가 없어 나열 앞부분을 통째로 건너뛴 것 — **`csat.ts` 의 `AREA` 집합에 `미기` 를 추가**해 고쳤다. 그 결과 블록이 224 → **276** 으로 늘고 `areas-incomplete` 는 39 → **1** 이 됐다. 검증 자체는 그대로 남겨 둔다(다른 표기에서 같은 일이 또 생길 수 있다).

#### 판정 우선순위 (`pickRuleForDepartment`)
학과 지정 > 계열 > 기본. **학과 지정이 둘 이상 걸리면 보류**(`ambiguous`) — 어느 쪽인지 모르는 채 하나를 고르면 틀린 기준으로 확신 있게 판정한다. 계열은 학과명만으로 인문/자연을 알 수 없어 **호출부가 알려 줄 때만** 쓴다(추측해서 정하면 그게 곧 오답).
`itemInsight.computeItemInsight` 가 규칙이 있으면 먼저 쓰고, 없거나 `ambiguous` 면 종전 원문 재해석 경로로 내려간다.

---

### admission_change
**Purpose**: **대입 전형 연도별 변경사항** — 전형요소·수능최저·면접 등이 학년도 사이에 어떻게 바뀌었는지의 원문. 위시리스트 비교표의 `변경사항` 행과 상세 모달이 읽는다.
**Primary Key**: id (TEXT, 원본 레코드 id `R0001…`)
**RLS Enabled**: Yes — 다른 참고 테이블과 같은 관례(로그인 사용자 SELECT `using(true)`, 쓰기 정책 없음 → service_role 적재 전용)
**출처**: `jinhak.esteacher.kr/jinhak2028.html` 의 `<script id="records-data" type="application/json">`. 원본 = `전국 주요 대학 2027 대입 대비 변경사항(20260502).xlsx`(한가람고 장태영 자료 · 충청남도교육청진로융합교육원 뷰어). 페이지가 외부 요청 없이 데이터를 통째로 품고 있어 **HTML 파싱 없이 JSON 한 덩어리**를 읽는다.
**적재**: `npx tsx scripts/admission-change-import/run.mts [--apply]` (기본은 점검 모드 — `--apply` 와 `SUPABASE_SERVICE_ROLE_KEY` 가 **둘 다** 있어야 쓴다). 재실행 안전(id upsert) + 원본에서 사라진 행 삭제.

#### 성질이 다른 점 (중요)
gyogwa/jonghap/adiga 는 **"현재 전형의 스냅샷"**이라 학년도 컬럼이 없지만, 이 표는 **연도쌍(after↔before)의 차이**가 곧 레코드다. 그래서 `comparison`('2028↔2027') 문자열을 그대로 두지 않고 `after_year`/`before_year` 로 쪼개 저장한다 — 비교표가 연도쌍으로 행을 나누고 최신순 정렬해야 하기 때문.

#### 커버리지 한계 (반드시 알고 쓸 것)
**전국 주요 대학 64곳뿐**이다. 2026-09-01 라이브 실측: 위시리스트 21개 대학 중 13개(62%), 44개 항목 중 17개(39%)만 매칭. 지방 국립대·전문대는 대체로 비어 있으므로 화면은 **"변경 없음"이 아니라 "자료 없음"**으로 적어야 한다(둘을 섞으면 지방대 지원자가 변경사항을 놓친다). 회귀 테스트가 이 구분을 고정한다.

#### Columns:
- `id` (TEXT): 원본 레코드 id (`R0001`…). upsert 키라 재적재가 안전
- `sheet` / `source_row` (TEXT/INT): 원본 시트명·행 번호 (역추적용)
- `category` (TEXT): 학생부위주 / 연도별 비교 / 수능위주 / 논술위주
- `comparison` (TEXT): 원문 표기 그대로 (`'2028↔2027'`) — 사람이 읽는 라벨
- `after_year` / `before_year` (SMALLINT): comparison 을 쪼갠 값. **정렬·필터는 반드시 이쪽**
- `region` (TEXT): 권역. 원문의 `'미분류'` 는 NULL 로 접는다(필터에 가짜 선택지가 생기지 않게)
- `university` (TEXT) NOT NULL: 대학명. 캠퍼스가 별도 표기(`고려대(세종)`·`한양대(ERICA)`)
- `admission_item` (TEXT): 전형명. **매칭에 강제하지 않는다**(표기가 출처마다 갈라져 있어 좁히면 대부분 0건)
- `keywords` (TEXT[]): `#수능최저`(81) `#수능`(78) `#전형방식`(62) `#면접`(46) … 비교표 셀 요약에 사용
- `after_text` (TEXT) NOT NULL / `before_text` (TEXT): 변경 후/전 원문
- `change_type` (TEXT): 변경(256) / 신설·추가(77) / 폐지·삭제(31) / 강화·확대(17) / 완화·축소(13)
- `source_url` / `source_date` / `crawled_at`

#### 적재 현황 (2026-09-01)
394행 · 대학 64곳 · 연도쌍 3종(`2028↔2027` 248 · `2027↔2026` 85 · `2026↔2025` 61) · 자료 기준일 2026-05-02

#### RPC
- `get_admission_changes(p_universities text[])` (SECURITY INVOKER): 대학 목록 → 변경사항. **한 번의 왕복**으로 받는다(항목마다 부르면 N+1).
  - **대학명 정확 일치 우선 — 정확 일치가 있으면 trgm 폴백을 버린다.** 실측에서 `similarity('고려대','고려대(세종)') >= 0.5` 라 서울 고려대 지원자에게 세종캠 변경사항 9건이 섞여 나왔다. 캠퍼스는 전형이 통째로 다르므로 오답이다. 유사 매칭은 정확 일치가 아예 없을 때만(문턱 0.6), 그때도 `matched_university`·`is_exact` 로 어느 대학 자료인지 화면에 밝힌다.
  - **전형(admission_item) 단위로는 거르지 않는다** — 표기가 갈라져 있어(`'학생부교과(지역인재1전형)'` vs `'지역균형(학생부교과)'`) 좁히면 0건이 된다. 대학 단위로 모아 주고 상세 모달이 전형명 닮은 순으로 위에 올린다.

---

### admission_university_info
**Purpose**: 대학 **입학처 사이트**와 **복수지원 가능 여부**(+ 원서접수처·전화·주소). 비교표 `기본 정보` 영역과 상세 모달이 읽는다.
**Primary Key**: university (TEXT, 원본 정식명 — **캠퍼스 포함**)
**RLS**: 로그인 사용자 SELECT `using(true)`, 쓰기 정책 없음(service_role 적재 전용)
**출처**: `jinhak.esteacher.kr/2027susi-summary.html` 의 **`const D = {...}` JS 리터럴**(원 출처: 한국대학교육협의회 대학별 2027학년도 수시모집 자료, 202개 대학). 고사 일정 페이지와 같은 형태라 괄호 균형으로 잘라 낸다(파서 = `utils/admissionUnivInfo.ts`).
**적재**: `npx tsx scripts/admission-univ-info-import/run.mts [--apply]` · 매칭 점검 `match-audit.mts`
**회귀**: `scripts/admission-wishlist-test/run-univ-info.mts`(121) + `render-univ-info.mts`(25, SSR 렌더 — `--tsconfig tsconfig.app.json` 필요)
**적재 현황(2026-09-09)**: 202곳 · 입학처 링크 194 · 원서접수 162 · 복수지원 가능 168·불가 16·해당없음 10·보류 8 · 본교 상한 6회 미만 18곳

#### Columns:
- `university` (TEXT): PK. 원본 정식명(`강원대학교(춘천)`)
- `university_canon` / `university_base` (TEXT): 매칭 키 — **캠퍼스 보존 / 캠퍼스 제거**. 정규화 규칙은 **TS 단일 출처**(`utils/admissionUnivInfo.ts`)이고 여기에는 결과만 저장한다
- `region` / `address` / `phone` (TEXT)
- `home_url` (TEXT): 링크로 쓸 수 있는 입학처 주소. **파싱에 성공했을 때만** 채운다
- `home_raw` (TEXT): 입학처 칸 원문 — 주소가 아니어도 보존
- `apply_url` / `apply_raw` (TEXT): 원서접수처(유웨이·진학어플라이 등)
- `multi_apply_status` (TEXT): `allowed`(168) / `blocked`(16) / `not-applicable`(10) / `unknown`(8) — CHECK 제약
- `multi_apply_limit` (SMALLINT): **본교 내** 최대 지원 횟수(1~20, 없으면 NULL). 6 이상은 전국 공통 제한과 같아 추가 제약이 아니다
- `multi_apply_summary` (TEXT): 표 한 칸에 넣을 요약(`'가능 · 본교 내 최대 3회'`)
- `multi_apply_text` (TEXT): 섹션 13 전문 — **화면이 항상 함께 펼친다**
- `base_date` (TEXT): 그 대학 자료의 기준일 · `source_url` / `crawled_at`

#### 조용히 틀리는 자리 4종 (모두 실측으로 확인)
- **입학처 칸이 URL 이 아닐 수 있다**: 조선대 `'입학처(해오름관 2층)'` · 가톨릭대 `'입학처'`. 그대로 `href` 에 넣으면 **상대경로**로 해석돼 앱 안에서 이동한다 → 호스트로 파싱될 때만 링크를 만들고 아니면 글로 둔다. 스킴 없는 값 34건은 `https://` 를 붙이고, `wwww.howon.ac.kr`(w 4개) 같은 오타는 좁게 교정한다.
- **원본이 PDF 추출본이라 단어 한가운데 줄바꿈이 들어간다**: 명지대 `'모든 전형 간 복수 지
원 가능'`. 원문 그대로 정규식을 대면 조용히 빗나가고 결과는 '원문 확인'으로만 보인다 → **공백을 모두 지운 문자열** 위에서 판정한다(이 한 가지로 보류가 38 → 8로 줄었다).
- **`최대 N회` 가 본교 상한이 아닐 수 있다**: 부산대는 `'우리 대학교에는 최대 6회까지'` 가 상한이고 `'학생부교과 유형 안에서는 2회'` 는 하위 규칙이다. 그냥 최솟값을 쓰면 6 → 2 로 틀린다 → **`최대`·`총` 이 붙은 총량 표현이 있으면 그 계열만** 보고, 없을 때만 맨 수치(2 이상)를 본다. `'최대 11개 전형 **중** 6개'`(동서대)의 11 은 모집단이라 `중` 이 뒤따르면 제외한다.
- **부정 어미**: `'복수지원을 허용하지 않습니다'`(아신대)가 `허용` 에 걸려 **'가능'으로 뒤집힌다** → `(?!하지않|되지않|…)` 필수. 정반대 판정이라 가장 위험하다.

#### 캠퍼스가 정보의 단위다
분화 11곳 중 **입학처 URL 이 다른 곳 9 · 복수지원 규정이 다른 곳 10**(강원대 춘천/강릉·원주/삼척이 서로 다르다). 그래서 PK 가 캠퍼스 포함 정식명이고, 위시리스트 약칭이 캠퍼스를 특정하지 못하면(`강원대`) **고르지 않고 보류**한다 — 화면이 후보를 밝힌다.

#### 대학명 매칭 (라이브 실측 2026-09-09)
위시리스트는 약칭(`전북대`), 자료는 정식명(`전북대학교`)이다. `대학교→대` 에 더해 **약칭 3종(과학기술대→과기대·교육대→교대·여자대→여대)** 을 적용하면 미매칭 14건 중 11건이 해결된다. 결과 = **대학 102종 중 정확 일치 93 · 캠퍼스 폴백 4 · 보류 2 · 자료 없음 3**(군산간호대·기전대·DGIST — 전문대·과기원이라 4년제 자료에 원래 없다), 항목 기준 **399/406**.

#### Related RPC:
- `get_admission_university_info(p_keys text[])` (SECURITY INVOKER): `university_canon` 또는 `university_base` 가 키에 걸리는 행을 돌려준다.
  - **정규화를 SQL 에서 하지 않는다** — 호출부가 `univInfoQueryKeys()` 로 canon·base 를 만들어 넘기고, 어느 것을 고를지(정확 일치 / 캠퍼스 폴백 / 보류)는 TS 의 `resolveUnivInfo` 가 정한다. 규칙을 SQL 에도 적으면 두 벌이 조용히 갈라지고, **갈라져도 화면에는 "자료 없음"으로만 보인다**.
  - EXECUTE = `authenticated`, `service_role`. **PUBLIC 과 anon 양쪽에서 회수해야 한다** — `revoke ... from anon` 만으로는 PUBLIC 기본 grant 가 남아 `has_function_privilege('anon', …)` 이 계속 true 였다(실측). 실질 보호는 RLS 라 익명 호출은 원래 0행이지만 심층 방어로 막아 둔다.

---

### admission_wishlist
**Purpose**: 학생별 **수시 지원 학교 목록** — 학생이 지원할 대학/학과/전형을 저장하고, 위 3개 참고 테이블(교과/종합/커트)을 매칭해 함께 열람. 정시 제외(수시 교과·종합만).
**Primary Key**: id (UUID)
**RLS Enabled**: Yes
**학생 anchor**: `student_code` = `resource`(type='student').`meta->>'id'` (FK 없음 — 생기부 미import 신입생 대응)

#### Columns:
- `id` (UUID): Primary key (default: gen_random_uuid())
- `student_code` (TEXT): 학생 코드 (anchor, FK 없음) NOT NULL
- `track` (TEXT): 'gyogwa'(교과) | 'jonghap'(종합) — CHECK 제약, 수시만 NOT NULL
- `university` (TEXT): 대학명 (denormalized, 자유입력 대비) NOT NULL
- `department` (TEXT): 모집단위/학과
- `admission_name` (TEXT): 전형명 (자유 텍스트)
- `gyogwa_id` (TEXT): FK → `admission_gyogwa_criteria(id)` ON DELETE SET NULL (DB 매칭 선택 시)
- `jonghap_code` (TEXT): FK → `admission_jonghap_criteria(code)` ON DELETE SET NULL
- `adiga_id` (TEXT): FK → `admission_adiga_results(id)` ON DELETE SET NULL (커트라인 명시 매칭 시)
- `memo` (TEXT): 학생 메모 (비교표 '메모' 행에서 편집)
- `sort_order` (INT): **칸 안에서의 순번**(지원희망이면 0=1지망). 화면의 위/아래 이동이 이 값을 0..n-1 로 다시 매긴다 (default: 0)
- `tier` (TEXT): **`'apply'`(지원희망, 기본) | `'interest'`(관심대학)** — CHECK 강제 (2026-09-01). 순번은 tier 안에서만 의미가 있고, 칸을 옮기면 대상 칸 맨 뒤로 붙는다
- `converted_score` (TEXT): **대학별 환산점수** (2026-09-01) — 사용자 직접 입력. 만점 척도가 대학마다 달라(1000점/100점) 숫자 비교가 불가능하므로 자유 텍스트
- `interview_date` (TEXT): **학교 일정**(면접·실기 등, 2026-09-01) — 사용자 직접 입력. `"26.11.28(토) ~ 11.29(일)"` 같은 기간 표기가 흔해 date 아님. 비어 있으면 화면이 `jonghap.interview_primary_time` 을 참고값으로 표시
- `first_announce_date` (DATE): **1차 합격자 발표일** (2026-09-01) — 사용자 직접 입력
- `final_announce_date` (DATE): **최종 합격자 발표일** (2026-09-01) — 사용자 직접 입력
- `csat_check_6` / `csat_check_9` (TEXT): **수능최저 충족 수동 판정** (2026-09-01) — `'meet'|'fail'`, CHECK 강제. **NULL = 자동 판정을 따름**
- `created_by` (UUID): FK → auth.users(id)
- `created_at` / `updated_at` (TIMESTAMPTZ): 트리거로 updated_at 자동 갱신

> **수능최저 충족여부 = 자동 판정 + 수동 덮어쓰기 (2026-09-01)**
>
> 기본값은 `get_wishlist_mock_rounds` 회차 성적 × `gyogwa.csat` 원문의 **자동 판정**이고
> (`utils/csat.ts` + `utils/itemInsight.ts`), 사용자가 저장한 `csat_check_*` 가 있으면
> **그것이 이긴다**. 대체가 아니라 override 라서 자동 판정 결과는 계속 계산·보존되고
> (`CsatRoundJudgement.autoVerdict`) 수동값을 지우면 즉시 자동으로 되돌아간다.
>
> 왜 수동 입력이 필요한가: 자동 판정은 학과 분기가 모호하거나(`ambiguous`/`no-match`)
> 조건 파싱이 안 되면 **보류**로 떨어지고, 종합전형은 구조화된 최저 데이터가 아예 없어
> 자동 판정 자체가 불가능하다. 그 칸을 사람이 채울 수 없으면 표의 한 줄이 영구히 빈다.
>
> 왜 컬럼 2개인가(JSONB 아님): 판정 회차는 6월·9월 모평으로 제도상 고정이고 값 도메인이
> 2개뿐이라 CHECK 로 그대로 강제된다. JSONB 였다면 키·값 검증에 서브쿼리가 필요해
> **CHECK 에 넣지 못하고 검증이 앱으로 새어 나간다**(Postgres CHECK 는 서브쿼리 불가).
> 회차가 늘면 컬럼 하나 + `CSAT_ROUND_MONTHS` 한 줄을 함께 추가한다.
>
> **`tier` 는 같은 날 철회했다가 되살렸다 (2026-09-01)**
>
> 철회 사유는 개념이 불필요해서가 아니라 **화면에서 지원희망과 똑같은 카드 그리드로 두 번
> 그려 겹쳐 보였기** 때문이었다. 지금은 관심대학이 **접이식 리스트**(`InterestList`, 기본
> 접힘)라 두 영역이 충돌하지 않는다. 되살리면서 개념은 그대로 두고 표현만 바꾼 셈.
>
> **정원은 DB 가 아니라 앱이 지킨다**(`utils/tierRules.ts`): 지원희망 6 · 관심대학 15.
> 행 개수 제약은 CHECK(행 단위)로 표현할 수 없고 트리거로 강제하면 대량 이동·정리가
> 중간 상태에서 막힌다. 그리고 두 상한은 **성질이 다르다** — 지원희망 6은 제도상의 사실이지만
> 목록을 짜는 도중 넘겨 담는 것이 정상이라 **막지 않고 경고**하고, 관심대학 15는 화면·비교의
> 실용 한계라 **실제로 막는다**. DB 는 값 도메인(`apply|interest`)만 지킨다.
>
> **레거시 행(tier 없음)은 지원희망으로 읽는다** — 관심대학으로 떨어뜨리면 기존 지망이
> 화면에서 통째로 사라진다(`splitByTier`, 회귀 테스트가 고정).

#### Indexes:
- `admission_wishlist_pkey`: id
- `idx_admission_wishlist_student`: (student_code, sort_order)
- `idx_admission_wishlist_gyogwa` / `_jonghap` / `_adiga`: 각 참고 FK

#### RLS Policies (2026-06-26 학년부장 쓰기 허용으로 재개편):
- **SELECT**: `is_wishlist_owner(student_code) OR can_read_wishlist(student_code)` — 학생 본인 + (담임/학년부장/admin). **상담교사·위기관리담당자는 열람 불가**(can_read_wishlist에서 제외).
- **INSERT/UPDATE/DELETE**: `is_wishlist_owner(student_code) OR can_write_wishlist(student_code)` — **학생 본인 + 담임(자기 반) + 학년부장(자기 학년 전체) + admin(전 학생) 대신 신청**. INSERT는 `created_by = auth.uid()`도 필수(대리 신청 시 작성자=교사/admin 기록).
- **권한 모델 요약**: 학생 본인=R/W, admin=전 학생 R/W, **담임=자기 반 학생 R/W, 학년부장=해당 학년 전체 R/W**, 상담교사=접근 불가.
- **이전 모델(20260626 1차 개편)**: 담임만 대리 쓰기, 학년부장은 읽기 전용(can_read에만 포함) — `can_read_wishlist`가 학년부장 분기를 직접 가졌었다. 학년부장 쓰기 요구로 분기를 `can_write_wishlist`로 이동(아래 헬퍼 설명).
- **이전 모델(20260624104350)**: admin만 대리 쓰기, 담임·학년부장 읽기 전용, 상담교사 열람 가능 — `can_care_student` 단일 게이트를 썼으나 쓰기/읽기 구분·상담교사 분리가 불가능해 전용 헬퍼 2개로 분해.

#### can_care_student vs 위시리스트 전용 게이트:
- 공용 `can_care_student`(담임+학년부장+상담교사+admin 단일 boolean)는 **이 기능에 부적합** — 쓰기/읽기를 구분 못 하고 상담교사를 포함한다. 그대로 두고 위시리스트 전용 헬퍼 2개를 신설.
- `can_write_wishlist(p_student_code)` (SECURITY DEFINER): admin OR 담임("N학년 M반" 태그가 학생 grade/class 일치) OR 레거시 담임(`resource.meta.grade+class_number`) OR **학년부장("N학년 부장" 태그가 학생 grade 일치 → 해당 학년 전체 R/W)**. 쓰기 RLS·DEFINER RPC 게이트의 공통 분모. EXECUTE = `authenticated`만(anon REVOKE).
- `can_read_wishlist(p_student_code)` (SECURITY DEFINER): 이제 `can_write_wishlist(...)`와 동일(학년부장 분기가 can_write로 이동했으므로). 읽기 권한자 ⊇ 쓰기 권한자가 **구조적으로 보장**(can_write를 그대로 위임). 학생 본인은 RLS 식에서 `is_wishlist_owner`로 별도 OR. EXECUTE = `authenticated`만.
- **DEFINER RPC 게이트 정합(중요)**: 테이블 RLS를 우회하는 `get_wishlist_*`·`get_class_wishlist_summary`(DEFINER) 5개 함수의 내부 게이트도 `is_wishlist_owner OR can_read_wishlist`로 교체. **테이블 RLS만 바꾸면 이 DEFINER 함수들이 RLS를 우회해 상담교사에게 성적(naesin/mock/subjects)을 노출하는 백도어가 남기 때문.** `get_admission_wishlist`는 INVOKER라 테이블 RLS를 그대로 상속 → 변경 불필요.

#### Helper / RPC:
- `is_wishlist_owner(p_student_code)` (SECURITY DEFINER): 현재 사용자가 해당 학생 본인인지. RLS 쓰기 게이트. **EXECUTE는 `authenticated`에 GRANT, `anon`에서만 REVOKE** — RLS 정책 식이 `authenticated` 역할로 평가되므로 EXECUTE가 있어야 함(없으면 `permission denied for function`로 모든 쓰기/조회가 깨짐). 노출 정보가 "당신이 이 학생 본인인가"라는 자기정보뿐이라 직접 호출돼도 무해. `can_care_student`에는 학생 본인 분기가 없으므로 본 기능 전용으로 추가.
  - **2026-07 재작성(`profiles.email` 기반)**: 원래 `resource(type='student') JOIN user_resource ON ur.user_id=auth.uid()`로 판정했으나, **학생 계정의 97.5%(479명 중 467명)가 `user_resource` 링크 자체가 없어**(대량 학생 import가 `resource` 행만 만들고 링크는 생성 안 함, `ProfileEditDialog`의 자동연결도 `type='teacher'` 하드코딩이라 학생은 영원히 대상 밖) 자기 위시리스트 INSERT/UPDATE/DELETE가 전원 RLS 위반으로 막혔었다. `profiles.role='student' AND split_part(profiles.email,'@',1) = p_student_code`로 교체(`inquiry_design_can_access_student`/`get_latest_kg_version`과 동일 관례) — `user_resource` 의존 제거, `resource` row 존재 여부와 무관하게 본인 판정. `can_write_wishlist`(담임/학년부장/admin, 교사측 `user_resource` 의존)는 변경 없음.
- `get_admission_wishlist(p_student_code)` (SECURITY INVOKER): 지원 목록 + 매칭 참고데이터(gyogwa/jonghap/adiga JSONB) 반환. **2026-09-01: 반환에 `tier`/`converted_score`/`interview_date`/`first_announce_date`/`final_announce_date`/`csat_check_6`/`csat_check_9` 추가** — `RETURNS TABLE` 타입이 바뀌므로 `CREATE OR REPLACE` 가 아니라 **DROP + CREATE**(인자 목록은 그대로라 오버로드 모호성은 없음). 정렬은 `(tier='interest'), sort_order, created_at` — 지원희망 먼저, 각 칸 안에서 순번 순. INVOKER라 테이블 RLS가 그대로 적용(권한 없는 교사는 0행). **adiga는 `adiga_id` 우선, 무매칭 시 대학+학과 pg_trgm. gyogwa/jonghap은 명시적 ID 우선, 없으면 같은 대학(트랙 일치) best match로 자동 링크** — 학과 1건만 골라도 커트라인+교과 반영방법+종합 평가기준/면접이 한 카드에 통합됨. gyogwa는 `subjects_all`(반영 교과목)·`careers`(진로 환산기준), jonghap은 `interview_blocks`(면접 평가요소+기출질문+시간+위원)·`doc_content_tables`까지 포함.
- `get_wishlist_mock(p_student_code)` (**SECURITY DEFINER**, 동일 권한 게이트): **수능최저 충족 판정용** 학생 최근 모의고사 영역별 등급(`mock_result` 최근 회차). 클라이언트(`utils/csat.ts`)가 gyogwa `csat` 원문을 파싱해 학생 모의 영역별 best 등급과 비교. 세부과목→영역 매핑(화법과작문→국, 확률과통계→수, 사회·문화/생활과윤리→탐, **사/과→탐**), 탐구는 tamCount개. **교과(gyogwa.csat)만 적용** — 종합은 구조화 데이터 없어 추후. `get_admission_wishlist` gyogwa JSONB에 `csat` 원문 포함.
  - **충족 계산 3모드(`parseCsatRule.mode`)**: `sum`("N개 합 K"=선택 N개 등급 합 ≤K)·`avg`("N개 평균 K"=평균 ≤K, `sum≤K*N`으로 부동소수 회피)·`each`("N개 각 K"=각 영역 ≤K, 선택 N개는 오름차순이라 최댓값만 ≤K 확인). 키워드 없는 "N개 K"는 N=1이면 each, N>1이면 sum 근사. **정규식은 "중" 생략형도 허용**("국,수,영,탐 4개 합 6"처럼 '중' 없는 변형 구제). 이전엔 sum만 다뤄 "평균"·"각"을 합으로 오판하고 '중' 생략을 판정불가로 흘렸음(audit 4+4+5건). 판정 결과(`CsatJudgeResult`)는 `mode`·`value`(측정값)·`threshold`를 노출, 카드(`CsatBasis`)가 모드별 문구로 표시.
  - **탐구는 2과목 → 1개 영역으로 환산(`tamguGrade`)**: 수능 탐구는 2과목인데 "N개"는 **영역 수**를 센다(증거: "국,수,영,탐 4개 합 6"=영역 4개). 따라서 탐구는 학생이 2과목을 봐도 **합산 시 1개 영역**으로 들어간다 — `탐(1)`(또는 `과(1)`/`직(1)`)=상위 1과목 등급, `탐`/`탐(2)`/`탐(절사)`=**2과목 평균**(원문에 `절사`면 내림·`반올림`이면 반올림·미명시면 소수 유지). **이전 버그**: 탐구 2과목을 별개 pool 원소로 넣어 "N개"에서 탐구가 2개 영역처럼 이중 계산됨. **표시**: `mockByArea`/`MockGradeStrip`/`RightPanel`이 영역당 best 1개로 접어 **탐구가 1과목만 보이던 문제**도 수정(탐구는 응시 2과목 모두 표시, key=`area-subject`). 학생 mock 출처=`get_wishlist_mock`(`mock_result` 최근 회차의 `subjects` 객체).
  - **영역 매핑 전수 정합(`subjectToArea`, mock_result 38개 고유 키 검증)**: 국/수/영/한 + 사·과 선택과목 외에 **1·2학년 통합/공통 라벨도 탐 매핑** — `통합사회`/`통합과학`/`공통사회`/`공통과학` 및 영역 일반 라벨 `사회탐구`/`과학탐구`. 1·2학년은 통합사회+통합과학 2개가 들어와 위 "탐구 2과목→1영역" 모델에 그대로 올라타 표시·판정 일관. **모의 등급은 전 학년 9등급제**라 통합과목 등급도 수능 탐구 9등급과 같은 척도(1·2학년 판정은 통합과목을 탐구 proxy로 쓰는 근사 — 1·2학년은 수시 미지원이라 미리보기 성격). `미응시`는 등급 placeholder라 매핑 제외(드롭).
  - 회귀: `npx tsx scripts/admission-wishlist-test/run-csat.mts`(29 케이스). 전수 분석: `docs/handoff/csat-structure-audit_2026-06-25.md`.
  - **학과별 조건 분리 + 런타임 매칭(검증된 설계)**: 수능최저의 **67%가 한 텍스트에 학과별 다른 기준** 병기("간호: … 의예: …", 전체 150개 중 100개). 첫 조건만 쓰면 오판하므로 `judgeCsatForDepartment(csat, department, mock)`이 csat을 `[라벨]:조건` 블록으로 split하고 위시리스트 `department`(adiga major)에 **학과명 부분일치**로 매칭: 분기없음=`single`·정확1개=`matched`·매칭0개+디폴트조건=`default`만 **자동 판정**, 다중매칭=`ambiguous`·계열(인문/자연)=`series`·매칭0개=`no-match`·파싱실패=`unparseable`은 **판정 보류**. 보류 시 UI는 수능최저 원문 + 학생 영역별 모의 등급(`mockByArea`)만 나란히 제공해 사람이 직접 확인(틀린 충족 판정 방지). 계열 라벨·단과대(`대학$`)·노이즈는 매칭 제외. 전수 분석: `docs/handoff/csat-structure-audit_2026-06-25.md`.
  - **전체 노출(방어적)**: 매칭이 틀릴 위험에 대비해 카드는 **수능최저 원문을 조건별 줄바꿈으로 항상 전체 표시**(`CsatText`)하고 판정에 쓴(내 학과) 조건만 하이라이트("← 내 학과"). gyogwa 폴백은 unit이 학과와 명확히(≥0.3) 매칭되는 행 우선, 약하면 `has_csat=true` 행 우선해 **같은 대학에 수능최저 있으면 누락 없이 노출**(강서대 간호처럼 같은 대학에 '없음' 행과 공존할 때 '없음'을 집던 버그 수정). 라벨 정리는 `자연(일부 제외)`·`공공정책학(야)` 등 정상 괄호 라벨은 보존하고 이전 조건의 `* 주석`·`…) ` 꼬리만 제거.
- `get_class_wishlist_summary(p_grade, p_class)` (**SECURITY DEFINER**): **학급 전체 수시 지원 현황** (교사가 학급 선택 시 테이블). 행=학생×지원항목(지원 없는 학생도 1행), 각 항목에 adiga 커트/경쟁률/계열 매칭. **명단 출처=`resource.meta`(권위·최신 — 반 편성·신입생 반영, `student_basic_info` 아님)**, `student_code=resource.meta->>'id'`로 위시리스트 조인. 권한 게이트=반 대표 학생 1명 `can_care_student`(담임=자기반/학년부장=학년) OR admin. 프론트(`ClassWishlistTable`, glassmorphism 테이블)가 학생 단위로 묶어 표시.
- `search_admission_majors(p_track, p_query, p_limit, p_offset, p_regions, p_cut_min, p_cut_max, p_sort)` (SECURITY INVOKER, **v3 2026-06-26**): **입력 화면 학과 검색 (major 선택의 핵심 경로)**. adiga(대학×학과×전형) 단위. 커트라인(grade50/70)·경쟁률·모집인원 프리뷰 반환. 선택 시 `adiga_id` 저장.
  - **토큰 분리 검색(다중 단어 AND — 2026-06-26 버그 수정)**: `p_query`를 공백으로 토큰 분리해 **각 토큰이 (university|major|search_text) 중 한 곳에 ILIKE 포함**되면 매칭(토큰 간 AND, `bool_and`). 이전엔 단일 컬럼 `ILIKE '%전체질의%'`라 **"충남대 사회학과"처럼 대학+학과를 함께 치면 0행**이었다(공백 포함 연속 문자열이 한 컬럼에 없음, `search_text`는 공백 없이 연결돼 매칭 실패). 이제 "충남대"+"사회학과"가 같은 행에서 각각 매칭돼 충남대 사회학과(70%컷 2.84)가 정상 노출.
  - **정렬(`p_sort`)**: `grade70`(기본, 70%컷 오름=성적 높은 학과 먼저) | `competition`(경쟁률 오름) | `recruit`(모집인원 내림) | `score`(검색 유사도 내림). SELECT의 `sort_key`(숫자) 단일 컬럼으로 ORDER BY(alias 가시성 문제 회피, NULL은 1e9로 밀어 NULLS LAST 효과). tiebreaker = `grade70 ASC, id`.
  - **필터**: `p_regions text[]`(권역 다중, NULL/빈배열=전체, `region = ANY`), `p_cut_min`/`p_cut_max numeric`(70%컷 범위 `grade70 BETWEEN`, NULL=무제한), `p_recruit_min integer`(**모집인원 최소** `recruit_2026 >= p_recruit_min`, NULL=무제한 — recruit_2026은 NULL 없음·범위 0~586이라 최소만 제공). 서버 필터라 페이지네이션과 정합(클라 필터 시 페이지마다 빈 결과 방지).
  - **무한 스크롤 페이지네이션**(`p_offset`): `AddProgramDialog`이 `useInfiniteQuery`(페이지 40)+`IntersectionObserver`로 추가 로드. 정렬·필터는 `useMajorSearch` 쿼리키에 포함돼 변경 시 자동 refetch. **검색어 없이 필터만으로도 조회 허용**(지역·컷으로 탐색).
  - **수능최저 표시**: best-match gyogwa(교과만, university trgm→unit~major→has_csat 순, `get_admission_wishlist` 링크 규칙 동일)를 `LATERAL`로 붙여 `has_csat`/`csat`/`csat_status` 반환 → 검색 결과 행에 "수능최저" 배지+원문 미리보기. 종합/무매칭은 `has_csat=false`.
  - **오버로드 정리**: v3 적용 시 구 3-arg·4-arg 오버로드를 DROP(default 파라미터 추가로 4-arg 호출이 ambiguous해지는 것 방지). `p_recruit_min` 추가(2026-06-26) 시에도 구 8-arg 시그니처를 명시 DROP 후 9-arg로 재생성(동일 ambiguous 방지). EXECUTE = `authenticated`.
- `search_admission_programs(p_track, p_query, p_limit)` (SECURITY INVOKER): (레거시) 전형 단위 검색. gyogwa→교과 모집단위, jonghap→종합 대학. 현재 입력 화면은 `search_admission_majors`(학과 단위)를 사용하지만 함수는 유지.
- `get_wishlist_naesin(p_student_code)` (**SECURITY DEFINER**): 적합도 판정용 학점 가중 내신 평균(`SUM(rank·units)/SUM(units)`, category='regular') + 과목 수 반환(전과목 fallback용). **왜 DEFINER인가**: `student_academic_flat` MV 에 `authenticated` SELECT 권한이 없어, 이를 읽는 `get_student_grade_trajectory`(INVOKER)를 프론트가 직접 호출하면 모든 실사용자가 `permission denied for materialized view` 로 실패 → naesin=null → **적합도가 항상 '판정불가'** 였다(2026-06 버그). DEFINER 로 MV 를 정의자 권한으로 읽되 위시리스트와 동일한 권한 게이트(`is_wishlist_owner OR can_care_student OR admin`)를 내장해 열람 권한 있는 학생만 반환. EXECUTE 는 `authenticated` 에만(PUBLIC/anon REVOKE — REVOKE FROM anon 만으론 PUBLIC 기본 grant 가 남으니 PUBLIC 에서 회수 필수).
- **학년별 적합도 분기(도메인 규칙)**: **3학년(2024 입학, 9등급제 상대평가)** 만 전형 반영방법을 정밀 적용. **1·2학년(2025·2026 입학, 5등급제 성취평가)** 은 `get_wishlist_naesin`(category='regular'·석차 있는 정량과목 학점가중 평균)으로 전과목 평균 사용 — 카드에서 `naesin.isFiveTier`면 `computeRuleNaesin` 건너뜀. 같은 과목도 입학연도별 교육과정이 달라 정량/진로선택 구성이 다르기 때문.
- `get_wishlist_subjects(p_student_code)` (**SECURITY DEFINER**, 동일 권한 게이트): **전형 맞춤 내신**(3학년) 계산용 학생 과목별 기록(학년·학기·**category**·교과군·과목·단위·석차등급·성취도A~E·점수). **category `regular`(정량)+`career`(진로선택)+`general` 반환, 예체능(`pe_arts*`) 제외** — 이전엔 `regular` 만 가져와 인공지능 기초·생활과 과학·심화영어 등 진로선택(career) 과목이 통째로 누락됐다(7577행). 진로선택은 석차 없이 성취도만 있어 클라이언트가 환산하며, 전형이 환산기준(`careers.criteria`)을 명시 안 하면 **기본 환산(A=1·B=2·C=3·D=4·E=5)** 폴백 + 카드에 안내(`usedDefaultCareerConv`). 클라이언트(`utils/naesinRule.ts`)가 카드별 gyogwa 반영방법을 파싱해 (반영 교과군 필터 → 상위 N → 진로선택 성취도 환산 → **학년별 반영비율 결합** → 학점가중)으로 전형 맞춤 평균과 **근거 과목 목록(반영/제외 사유 포함)**을 산출. **학년별 반영비율**(`subjects_all[].ratio`, 예 "20/30/50"=1·2·3학년·32개 전형)은 `yearWeights`로 파싱해 학년별 학점가중평균을 비율로 결합(3값만 적용, 라벨 "간호: 40/30/30" 제거, 2값 등 모호형은 미적용+단순화 플래그, 해당 학년 데이터 없으면 재정규화) — 이전엔 ratio를 표시만 하고 flat 평균이었다(`usedYearWeights` 노출, 카드 "학년비율 적용" 표시). 회귀 `scripts/admission-wishlist-test/run-naesin.mts`. 교과 **내부** 세부비율("3과목 10%")·`method`(전형요소 배점 교과/면접)는 데이터에 비율로 없어 미적용. 모호한 규칙(학과별 분기·이수단위 조건)은 단순화 플래그로 표시, 규칙 없으면 전과목 평균 fallback. 적합도(`utils/fit.ts`)는 학생 등급을 9등급 척도로 정규화(5등급제는 백분위 경유 환산)한 뒤 컷(grade70)과 **등급 차 직접 비교**: ≤−0.3 안정 / ≤+0.3 적정 / ≤+1.0 소신 / >+1.0 위험. (이전엔 양쪽 백분위 비교라 6.67 vs 2.92 같은 큰 격차도 '소신'으로 압축되는 버그가 있었다.)
  - **반영교과 파싱 주의(전수 점검으로 검증된 함정들)**: subjects 문자열 머리글자 추출 시 —
    1. `subject_group`은 정확 매핑(국어→국…)으로만 head 부여. `includes` 부분문자열은 "제2외**국어**"의 국어가 국으로 오탐됨.
    2. "**전 과목/전 교과**"는 교과군 필터를 끄고 **정량평가 전 과목 반영**(고려대 학교추천 등). "전 과목"의 `과`, "12과목"의 `과`, "교과"의 `과`가 과학 머리글자로 오인되지 않도록 `과목|교과|전 과목|진로선택…` 노이즈 단어를 추출 전에 제거.
    3. `국,영 전 과목`처럼 머리글자+전과목이면 그 교과군의 전 과목(필터 ON).
    4. **비주력 반영교과 head `기`(기타)**: `제2외국어·한문·기술가정·교양·정보·외·기타` 토큰이 있으면 head `기` 추가 → `기술・가정/제2외국어/한문/교양` 등 교과군을 반영. (한문의 `한`이 한국사로 오인되지 않도록 토큰을 머리글자 추출 전에 공백 치환.) `통과`(통합과학)→과학, `통사`(통합사회)→사회는 `과`/`사`로 자연 매핑.
    5. **머리글자도 "전 과목"도 못 잡으면 전 교과 반영 폴백**("공통/일반 5과목" 등 교과 구분 없는 규칙). 0과목 반영(판정불가) 방지.
    - 전수 점검 스크립트로 376개 프로그램의 모든 고유 규칙을 파서에 통과시켜 ZERO반영·비주력교과 누락 0건 확인.

#### Used by:
- `/admission-wishlist` 라우트 (`src/features/admission-wishlist/`): 학생=본인 입력/열람, **admin=전 학생 대신 신청(쓰기), 담임=자기 반 학생 대신 신청(쓰기), 학년부장=해당 학년 전체 대신 신청(쓰기)**. 프론트 `useWishlistAccess.canEditStudent(grade, classNum)`가 서버 `can_write_wishlist`와 동일 규칙(admin OR 담임 자기반 OR 학년부장 자기학년)으로 편집 UI를 게이트 → UI와 RLS 불일치 없음(담임이 타 반/타 학년 학생을 열어도 편집 버튼 미노출). 헤더 통합검색 `?student=` 딥링크 연동. 적합도(안정/적정/소신)는 adiga grade70(9등급) vs 학생 내신(5/9등급)을 백분위 환산 후 비교.
