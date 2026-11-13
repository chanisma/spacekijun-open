# student-dashboard

> CLAUDE.md 에서 분리한 상세 문서. 스키마·마이그레이션은 `docs/database/*.md` 참조.

학생 종합 대시보드 (student_code 기반 키 통합).

**개요 탭 = 교과별 추이도 + 모의고사 추이도(2026-08-13)** — 모의고사는 `student_basic_info.mock_result` JSONB이고 목록 RPC(`get_student_dashboard_data`)가 반환하지 않으므로 선택된 학생 1명분만 `useStudentMockResults`로 얇게 읽는다(분석 탭의 `useAnalysisData`는 학년 전체를 읽는 별개 경로). 지표 3종 토글(등급 9등급제·백분위·표준점수, **값이 없는 지표는 버튼 자체를 감춘다** — 영어·한국사는 절대평가라 백분위/표준점수가 항상 null).

**과목명 표기 통합이 핵심(순수 로직 = `utils/mockExamTrend.ts`)**: ①3학년은 국어·수학이 선택과목명(`언어와매체`·`미적분`)으로 기록 → 기존 `MOCK_SUBJECT_FAMILY`로 계열 통합 ②**`공통사회`·`사회탐구`·`사회`·`통합사회`는 같은 과목의 업로드 양식별 다른 이름**(라이브 확인: 회차마다 배타적으로 나타나고 개별 탐구 과목과 공존 0건) → evalog처럼 "합산 표기"로 보고 제외하면 1·2학년 탐구 라인이 통째로 사라지므로 **제외가 아니라 통합사회/통합과학으로 병합** ③2학년 9월 회차만 탐구가 아라비아 표기(`생명과학1`)라 정규화하지 않으면 한 과목이 두 라인으로 갈라진다 ④`미응시`가 과목 키로 들어오고 grade 9·percentile 0.47을 달고 있어 라인·평균에서 제외. 전과목 평균 라인은 **등급 지표에서만**(백분위·표준점수는 과목별 모집단이 달라 평균이 오해를 부름). 회귀 = `npx tsx scripts/mock-exam-trend-test/run.mts` | `StudentDashboardPage.tsx`, `useStudentDashboard.ts`, `components/MockExamTrendChart.tsx`, `utils/mockExamTrend.ts`, `hooks/useStudentMockResults.ts`


**방과후 = 학년도·학년별 표시 (2026-09-04)** — 학생 상세의 방과후 탭은 평면 목록이 아니라 **학년도·학년 그룹**이다(최신 학년이 위, 봉사활동과 같은 학년 원판 배치). 묶는 규칙 단일 출처 = `utils/afterschoolTerms.ts`, 그리기 = `components/AfterschoolTermList.tsx`(**상세 패널·상세 모달이 같은 부품을 쓴다** — 각자 그리면 기준이 갈린다).

- **학년도는 유도한다 — 컬럼이 없다**: `afterschool_enrollments` 에는 학년도·학기 컬럼이 없고 대신 `student_number`(**수강 당시** 학번, 첫 자리 = 그때의 학년)와 `student_id`(학적 코드 `YY-…`, 앞 두 자리 = 입학연도)가 있다 → `학년도 = 입학연도 + 학년 - 1`. 라이브 전수 검증: student_id 가 붙은 **1,378행 전부** `student_number` 가 그 학생 `resource.meta.snum{학년}` 과 정확히 일치(불일치 0). 즉 추정이 아니라 학교 기록과 맞물린 값이다.
- **학기는 유도할 수 없다 — 라벨을 지어내지 말 것 (사용자 결정)**: `cate_id` 는 리로스쿨 개설 카테고리 일련번호일 뿐 이름·기간이 저장돼 있지 않고, `collected_at` 은 수집 시각이라 **2025학년도분이 2026-01-25 에 1년치 통째로** 들어와 학기 구분이 남아 있지 않다(2026학년도만 3월·9월 수집으로 우연히 갈린다). 수집 시점으로 추정하면 2025학년도 전체가 "2학기"로 잘못 찍힌다. 그래서 그룹은 학년도·학년까지만 나눈다. 학기 정보가 실제로 생기면 그때 축을 하나 더한다.
- **`- 복사` 는 강좌가 아니라 카테고리 복제 흔적**: 리로스쿨에서 개설 카테고리를 통째로 복사하면 강좌명 뒤에 ` - 복사` 가 붙는다(라이브 116행, 그중 114행은 같은 학생·같은 학년에 접미사 없는 쌍이 함께 있어 **같은 수강이 두 번** 보였다). 접미사 있는 쪽만 버리고 쌍이 없는 2행은 이름만 정리해 남긴다. **접미사 없는 동명 강좌끼리는 합치지 않는다** — 그건 실제 재수강이고(2026학년도 2학년 `수학 심화반` 이 cate 47·53 두 차례) 배지 `N회` 로 표시한다.
- **개수는 한 기준으로만 센다**: 개요 카드·방과후 탭·학급 카드(`useAfterSchoolCounts`)가 전부 `groupAfterschoolByTerm` 을 거친다. 종전엔 상세가 원본 행 수를 세어 학급 카드와 다른 수를 말할 수 있었다(라이브 426명 중 **121명**이 달라진다, 최대 5과목 차이).
- **`useAfterSchoolCounts` 는 페이지로 나눠 받는다**: 종전 구현은 `.select('student_id')` 를 필터 없이 던졌는데 표가 이미 1,396행이라 **PostgREST 1000행 상한에 오류 없이 잘려** 뒤쪽 학생이 조용히 0건이 됐다. `.range()` 페이징 + Map 집계(종전엔 학생마다 전체 배열을 `filter` 해 630명 × 1,396행이었다).
- **납부 표시는 그리지 않는다**: `is_paid` 는 라이브 **1,396행 전부 `false`** 로 한 번도 채워진 적이 없다. 그대로 그리던 상세 모달은 전교생을 "미납"으로 표시하고 있었다. 값이 실제로 들어오면 되살릴 것.
- **알려진 데이터 품질 이슈(이 기능이 만든 것이 아님)**: 학번이 학년마다 재사용되므로 `student_id` 매칭이 연도를 구분하지 못해 **11행이 다른 학생(동일 1학년 학번의 상급생·졸업생)에게 붙어 있다**. 화면에는 유도된 학년도가 그 학생 기준으로 나오므로 티가 나지 않는다. 적재 경로(외부 스크래퍼)를 고쳐야 한다.
- 회귀 = `npx tsx scripts/afterschool-terms-test/run.mts`(46건, 순수 로직) + `npx tsx --tsconfig tsconfig.app.json scripts/afterschool-terms-test/render.mts`(18건, SSR 렌더 — 그룹 머리글 누락·복사 접미사 누출은 로직 테스트로 안 잡힌다). **`--tsconfig` 를 빠뜨리면 `React is not defined` 로 죽는다.**

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `student-dashboard` | 학생 종합 대시보드 (student_code 키 통합, 개요=교과·모의고사 추이, 방과후=학년도·학년별) | `StudentDashboardPage.tsx`, `utils/mockExamTrend.ts`, `utils/afterschoolTerms.ts` · `docs/features/student-dashboard.md` |
