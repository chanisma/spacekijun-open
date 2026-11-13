# timetable-generator

## 2026-09-23 단계별 CP-SAT 생성 경로

새 생성에 `단계별 공동 탐색 (로컬 서비스)`를 추가했다. 초기 후보 뒤 자동 과목 선정·배치/분반 공동 탐색·전 학년 제약 조정·독립 검증을 연결하고 분반 명단을 후보에 보존한다. 중단과 서비스 연결 실패를 처리한다. [실행 방법·구성·검증](./timetable-generator-staged-cpsat.md). 운영 시간표 확정은 실행하지 않았다.

## 2026-09-23 검증 배치 브라우저 미리보기

목록의 **검증 배치 미리보기**(`/timetable-generator/preview`)에서 로컬 검증 파일을 열면 반별·교사별·학생별 시간표를 읽기 전용으로 조회한다. 파일의 명단·시수·정원·하드 제약을 재검사하며 운영 시간표를 저장·확정하지 않는다. [실제 배치 파일과 사용법](./timetable-generator-2026-2-feasibility.md#브라우저-읽기-전용-미리보기).

## 2026-09-23 원본 수강 명단의 배치 가능성 검증 완료

629명·804수업의 전 학년 배치에서 기본 공강과 교사 하드 제약을 모두 만족하는 해를 찾았다. 3학년의 분반과 여러 주요 과목 배치를 함께 푼 뒤 전 학년 위치를 정확 탐색으로 조정했다. 독립 검증, 원본 명단 복원, 실제 ID를 사용한 확정 직전 행 전개까지 위반 0을 확인했다. 복원 중 분반 정원 초과를 해소하는 보정과 확정 차단도 추가했다. [검증 결과·배치 증거·재현 명령](./timetable-generator-2026-2-feasibility.md). 브라우저 자동 탐색의 모든 시드 성공을 뜻하지는 않는다.

## 2026-09-22 수강 원본 대조 후 과부하 해소

사용자가 제공한 2학기 학생편성현황 세 파일을 기준으로 수강 DB 68행 제외·86행 추가를 반영했다. 반영 후 원본 6,297행과의 등록·학점·연결 차이는 0건이다. 주제 탐구 독서는 원본 근거로 21명 제외·24명 추가됐고 기존 과부하 20명이 해소됐다. 미재학 6명의 기록은 보존하면서 생성에서는 제외한다. 생성 대상 629명·804수업이 기본 공강의 사전 검사를 통과하지만, 표준·정밀 탐색은 아직 완전한 해를 찾지 못했다. [반영 근거·백업·검증·탐색 결과](./timetable-generator-2026-2-xlsx-reconciliation.md).

## 2026-09-22 2학기 공강 활동 제외 검증 (원본 정정 전)

자율·자치활동과 동아리활동은 학생 시간표 원본을 유지하면서 생성 입력에서 제외한다. 2학기 실제 강좌 54개가 제외되고 해당 배치 수업은 0개인 것을 확인했다. 최종 사용자 지시에 따라 **새 생성·공강 진단은 수강 신청 명단을 기준**으로 하며, 운영 시간표와의 차이로 과목을 자동 삭제하거나 추가하지 않는다. 원본 수강 명단 633명·804개 수업으로 검증하니 2학년 20명이 가용 31칸에 34교시를 수강해 **입력 데이터 오류**로 즉시 거부된다. 해당 학생의 전체 등록 과목·시수는 별도 로컬 보고서로 정리했다. 이전 학생 시간표 기준 630명·804개 수업의 공동 탐색 성공은 비교 실험이며 원본 명단의 가능성을 증명하지 않는다. 저장본은 편성 기준을 보존한다. [데이터 차이·테스트 결과·재현 명령](./timetable-generator-2026-2-validation.md).

## 2026-09-22 제한된 격자의 생성 실패 개선

기본 전략을 `coordinated`(배치·분반 공동 탐색)로 변경했다. 재분반 후 기존 배치를 유지하는 탐색, 교사 부하 연쇄 수리, 교시 묶음 MILP, 정체 시 재시작을 하나의 시간 예산으로 실행한다. 실제 저장된 814개 수업 후보의 교사 위반 5건을 약 91초에 모두 해소했으며, 원본 명단 복원 후에도 검증을 통과했다. 모든 시드의 성공을 보장하지는 않는다. [설계·실측·재현 명령과 한계](./timetable-generator-coordinated.md).

화면에서 `현재 배치 이어서 개선`을 지원한다. 재분반은 동일 학년·과목·시수의 분반 사이에서만 수행한다. 아래 과거 실험 기록의 고정 명단 채색 추정값을 현재 공동 탐색 문제의 불가능성 증명으로 사용하지 않는다.

## 2026-09-22 저장·확정 경로 수정

- 공통수업의 합성 `offeringId`를 DB 강좌 ID로 오인해 확정 시 누락하던 문제를 수정했다. `Lesson.sourceOfferingIds`에 원본 강좌를 보존하고, 구 저장본은 최신 원본으로 복원한다. 팀티칭 교사 배분과 명단 없는 진로활동의 반 명단도 전개한다.
- 확정 전에 명단 복원·재분반·전체 배치 검증·행 생성을 완료한다. 미배치, 중복/알 수 없는 수업, 격자 밖/차단칸, 학생·교사 동시수업, 고정 배치 위반은 DB 작업 시작 전에 거부한다. 교사 부하 위반은 기존 정책대로 검토 후 확정 가능하다. 원본 강좌/시수 변경으로 lesson 집합이 달라지면 재생성을 요구한다.
- 기존 생성분 삭제는 대상 학년으로 한정한다. 다른 후보를 재확정할 때 이전 `finalized_placements`로 덮어쓰지 않고 선택 후보 ID도 갱신한다.
- 새 시간표의 드래그 편집을 부모 후보 상태에 반영해 점수·위반 내역·초안 저장이 같은 배치를 사용한다. 후보별 편집·되돌리기를 지원한다. 저장 상세는 명단을 복원해 학생별 조회하며, 저장 기능 없는 드래그 조작은 표시하지 않는다.
- `Infinity` 점수가 JSON에서 `null`이 되는 구 저장본도 오류 없이 표시한다. 생성 후 설정을 바꾸더라도 저장 학년도·학기는 생성 입력의 값을 사용하고, 공강 진단은 현재 설정에 맞는 원본을 새로 조회한다.
- 회귀: `npx jest --config scripts/timetable-generator-test/jest.config.cjs --runInBand`. 저장소에 Jest 전역 설정이 없어 기능 전용 설정을 추가했으며, 기존 Vite의 esbuild로 TS를 변환한다. 합성 솔버 검증: `npx tsx scripts/timetable-generator-test/run.mts 123`.
- 검증 결과: Jest 19개 통과, 합성 717개 수업/756명에서 충돌·차단칸·하루중복 0, 기능 범위 ESLint 및 프로덕션 빌드 통과. 전체 `tsc -p tsconfig.app.json`은 다른 영역 오류 202개로 실패하며 이 기능 경로의 오류는 0개다.
- 남은 제한: 여러 테이블의 삭제·삽입은 아직 단일 DB 트랜잭션이 아니다. 네트워크/DB 오류 중간 실패의 원자성은 별도 RPC 설계가 필요하다. 실제 DB 확정과 브라우저 드래그 조작은 이번 자동 테스트 범위에 포함하지 않았다.
- [TypeSafe Jev 적용 검토](./timetable-generator-jev.md): 자연어 설정 보조가 유망하며, 확정 검증·배치 솔버는 코드로 유지한다. API 호출은 수행하지 않았다.

> CLAUDE.md '주요 패턴'에서 분리한 timetable-generator 모델·솔버 상세.

**timetable-generator 모델**: 입력 `{academicYear, semester, grades, grid(5일×7교시), lessons, fixedBlocks, pinned, options, weights}`. 강좌(course_offering)를 **credits개 Lesson 인스턴스**로 분해해 각 인스턴스를 칸 1개에 배치(시험솔버 "1과목=1슬롯" 기계 재사용).

**충돌그래프 간선 = (학생 공유)∨(교사 공유)∨(교실 공유)** → "인접 변수는 다른 칸" 한 규칙이 학생·교사·교실 동시충돌을 모두 막음(=35색 그래프 컬러링). 학생집합·`classKeys`(점유 학급 "학년-반")는 `student_enrollment`(course_offering_id↔student_resource_id, **공통·선택 모두** 명단 보유)에서 도출.

**공동수업/팀티칭**(통합과학 등 한 반에 여러 교사가 각각 4학점으로 중복 기재)은 `buildInput`에서 (학년·반·과목) 단위로 **병합** — credits=과목 총교시(합산 아님)·교사 **라운드로빈 분담**으로 교사 부하 부풀림 방지(통합과학1 1반=16교시 아닌 4교시).

**창체 중 자율·동아리는 배치 제외하되 진로활동은 배치**(`isActivitySubject`에서 진로 제외; **명단 없는 반-단위 수업은 그 반 전체를 수강생으로 보정**해 충돌 정상 반영).

**공동교육과정("(공동)…" 과목)은 제외**(정규 시간 외 수업). 학생 반은 **`resource.meta`(grade/class)를 권위 출처**로 사용 — `fetchTimetableSourceData`가 enrollment의 학년/반을 resource.meta로 덮어씀(enrollment와 100% 일치 확인됨, 미갱신 학기 대비). `student_enrollment.student_class`는 "1반" 텍스트, `resource.meta.class`는 숫자문자열 "5"라 `parseClassNum`으로 정규화(주의: `student_timetable.student_class`는 정수). 선택과목 칸은 `studentCountByClass`로 **현재 보는 반 인원**만 표시. lesson별 `blockedCells` = 학년/반 공강 ∪ 교사 불가시간 ∪ 창체 점유를 입력 단계에서 정적 합성.

**하드** = 학생/교사/교실 충돌·같은 과목 하루 1회·차단칸·전 수업 배치, **소프트는 반(grade-class) 단위 집계**(반 중간공강 최소화·과목 분산·교사 연강·일일 균등)라 SA 한 스텝이 저렴.

**Min-conflicts 국소탐색**(완전 배치 출발 → 충돌 lesson을 충돌 최소 칸으로 반복 이동 + plateau kick·**스왑 무브**·Metropolis 수용; 채색수에 가까운 인스턴스에서 백트래킹보다 강건; 여유색=가용칸−최대 학생부하가 난이도 좌우)로 초기해 → SA(가변 `Map<lessonId,칸>`, 무브가 하드 실현가능 보장 → 소프트만 재계산)로 최적화 → TOP-5. Web Worker(`solver.worker.ts`) 실행. 저장 `timetable_plan`(JSONB, studentCodes 제거).

**확정 시 placements → student_timetable(학생×칸)·teacher_timetable(교사×칸) 전개**(`finalizeTimetablePlan` — 외부 출처 행 보호: 대상 학기에 우리(meta.source='timetable-generator')가 아닌 행이 있으면 `replaceExisting` 없이 거부, 우리 행만 삭제 후 재기록). 격자 day_of_week=dayIndex+1, 교시 1..7. 회귀 테스트(합성 인스턴스, 9반·공통8+선택2슬롯): `npx tsx scripts/timetable-generator-test/run.mts [123]`. 라우트 `/timetable-generator`(teacher/admin).

**공강은 학년별**(`blockedCellsByGrade`, UI 학년 탭).

**여유색 0~1이면 phase-transition으로 매우 어려워** min-conflicts가 완전 무충돌을 못 찾을 수 있고, 그때 솔버는 **최선안(잔여 충돌 수 표시)을 반환**("후보 0" 대신). 실데이터 회귀: `npx tsx scripts/timetable-generator-test/run-grade2-real.mts`(2학년 픽스처), 채색 한계 연구: `GN=n CAP=0/1 npx tsx scripts/timetable-generator-test/research-coloring.mts`.

**핵심(검증됨): 실데이터 잔여충돌은 솔버 약점이 아니라 그래프 채색수 χ 자체다.** 2학년 실픽스처는 학생부하 31·교사부하≤16이지만 **χ≈34**(선택과목 교차수강 구조 때문에 클리크 하한보다 3~4 높음). avail<χ면 0충돌이 **구조적으로 불가능**(avail 30→충돌≈15, 31→6, 32→3, 33→1, 34→0). min-conflicts·Metropolis·스왑·Kempe체인·전수 TabuCol·daily-cap 완화까지 **4종 탐색이 모두 동일 잔여 floor에 수렴**해 확인(채색수 한계). 따라서 "모든 학생 무공강(avail=부하)"은 χ>부하인 실데이터에선 불가 — **공강을 줄여 avail≥χ로**(실측상 공강 1칸 이하) 해야 무충돌(학생별 빈 교시는 정상·불가피). 합성 인스턴스는 χ=부하라 0-슬랙도 1.4초 무충돌(솔버 자체는 건강·변경 없음).

**결과 검토 UI**(`TimetableGeneratorPage`/`TimetableGridView`): 반별/학생별/**교사별** 뷰 토글. 충돌 강조 규칙 — 반 뷰는 **같은 교사 중복만 충돌**(같은 과목 다른 교사=분반은 정상), 학생·교사 뷰는 **한 칸 2수업↑이 충돌**(빨강 칸+팝오버 경고).

**균일 공강(2026-1 실측, 결정적 — 2026-06-14 재확인)**: **학업 과목만(창체 제외) 보면 1·2·3학년 전부 완벽히 균일 공강**(반별 staggered=0). 실제 student_timetable에서 학업이 점유하는 칸은 9개 반 전원 동일(2학년 31칸·3학년 30칸·1학년 30칸 busy), 충돌 0. 이전에 "2학년 staggered"로 본 것은 **자율·동아리(창체) 때문이며 솔버는 창체를 배치 대상에서 제외**하므로 무관. 즉 **균일 공강은 2·3학년에도 학교 원칙이고 구조적으로 feasible**(실제 배치가 곧 균일 공강 0충돌의 존재 증명). 단 avail=χ인 슬랙0이라 cold-start min-conflicts/SA는 존재하는 해를 못 찾고 갇힐 수 있음 — 아래 ★정정 참조(솔버 수렴이 핵심 레버).

**공강 진단 버튼**(`probeFeasibility`/`probe.ts`, 워커 `{type:'probe'}`): 학년별 "현재 균일 공강 무충돌 가능?"+"가능한 최대 균일 공강"을 빠른 채색(이분탐색)으로 추정. 회귀: `GN=n npx tsx scripts/timetable-generator-test/run-probe.mts`.

**★정정(2026-06-14 최종 검증 — 위 χ≈34 및 직전 'phantom enrollment' 기재 모두 대체): χ≈34는 (1)그래프 구조도 (2)데이터 오염도 (3)buildInput 모델링도 아니라 솔버가 슬랙0 임계점에서 수렴 실패한 것이다.** 결정적 검증(`run-validate-grade2.mts`): 실제 `teacher_timetable` 배치를 buildInput 그래프에 대입 → 충돌 **단 3개**(전부 학생 1명의 생명과학1반↔지구과학3반 동시간 중복=사소한 데이터 잡음 1건, 두 과목을 다른 칸에 두면 해소) → **buildInput 그래프는 충실하고 진짜 χ=31, 균일 공강(2학년 avail 31) 완전 feasible**(실제 배치가 유효 31채색의 존재 증명).

**주의: `student_timetable`은 불완전**(미디어영어·인공지능수학 등 실재 정규격자 수업을 누락 — 이들은 `teacher_timetable`에 정상 존재)하므로 feasibility ground truth로 쓰면 안 됨. 완전한 출처 = **`student_enrollment`(입력) + `teacher_timetable`(실배치, `course_offering_id` 100% 채워짐)**. 그런데 min-conflicts는 cold-start로 8시드×20s를 줘도 6 edges에 갇혀 존재하는 31채색을 못 찾음(예산만으론 안 풀림 — 슬랙0 탐색 landscape 함정; 실제 학교 시간표의 선택과목 블록 정렬 구조를 구조-맹목 솔버가 못 짚음).

**결론: 균일 공강은 학교 원칙대로 2·3학년도 가능. 데이터·buildInput 수정 불필요. 진짜 레버 = 슬랙0 솔버 수렴 개선**(직전 학기 배치 warm-start, 선택과목 블록 구조 인지 무브). 검증 하니스: `npx tsx scripts/timetable-generator-test/run-validate-grade2.mts`(실배치를 그래프에 대입해 spurious 간선 검출), `GN=1|2|3 [KEEP=n] npx tsx .../run-dsatur.mts`(DSATUR-greedy vs min-conflicts; 라이브 dedup 픽스처 grade{1,2,3}-real.json + grade2-cells.json).

**DSATUR-greedy 실측: 구성형 greedy는 임계점에서 5~8%만 성공, min-conflicts보다 약함 → 단독 부적합·시드용. 채색 한계는 χ가 아니라 솔버 수렴이 핵심.** **공동수업 교사 분담(teacher_split)**: 팀티칭 수업은 `course_offering`이 교사별 행+각 full credits로 기록하고 명단은 한 행에만 있어, 생성기가 roster-bearing 교사에게 전 교시를 몰아주고 공동교사를 누락했다(예: 세계사 이지유 4 → 실제 이지유 2+장은호 2). 분담은 불균등도 가능(통합사회1 강시우 3+장은호 1)이라 round-robin 복원 불가.

**해결**: 2026-1 `teacher_timetable`에서 (학년·과목·반)별 실제 시수를 집계해 roster-bearing `course_offering.meta.teacher_split`(`[{teacher_resource_id,teacher_name,lessons}]`)에 backfill(46행: 공동수업 19섹션 + **진로활동 27**=실제 담당 교사로 round-robin 임의배정 교정), `buildInput`이 split대로 교사 배분(공통·선택 양 경로), `finalizeTimetablePlan`은 lesson별 실제 교사로 전개. 회귀: `run.mts`의 `[teacher_split ...]` 케이스. 상세 DATABASE_TABLES.md.

**솔버 전략 선택(2026-06-15)**: Phase-1 seed를 4전략 중 선택(`options.strategy`, UI 드롭다운 "솔버 전략").

**(1)`min-conflicts`**(기본).

**(2)`block-aware`**(`blockAwareSolver.ts` — 선택과목 블록을 collapse해 같은 칸 정렬; **실험: 슬랙0서 오히려 worse**(2학년 78 vs 4) — collapse가 χ를 안 줄이고 rigid 정렬이 탐색을 과제약. 비교용으로 유지).

**(3)`enhanced-local`**(`enhancedLocalSolver.ts` — tabu+large-neighborhood+하드페널티 SA; **슬랙0 실측 최강**: 2학년 edges 8→**3**·3학년 19→**4**, grade1 0).

**(4)`cp-sat`**(`cpSatSolver.ts`, HiGHS MILP/WASM `highs` 패키지 — grade1 28ms 즉해; 2·3학년은 ~8000 이진변수라 12s 예산서 최적증명 못해 incumbent 6·10 edges 반환).

**결론: 슬랙0은 NP-난해라 어떤 솔버도 즉시-0은 아니고, 실무 예산에선 enhanced-local이 승자**(잔여 3~4 edges=데이터 이상치 생명과학+지구과학 동시수강 등 추정), cp-sat은 작은/쉬운 인스턴스 최적. 블록 추론 `algorithm/blocks.ts`(electives를 교사+학생 인접·이상치 임계값(소수 공유 흡수)·per-credit 최소채색으로 그룹화 — 2학년 7블록=선택4+대수 수준별3{1,2,3}/{4,5,6}/{7,8,9} 정확 복원). 워커는 cp-sat 시 `initCpSatSolver()`로 HiGHS 선로드(실패시 cpSatSeed가 min-conflicts 폴백), `vite.config.ts`에 `worker.format='es'`(HiGHS WASM code-split). 회귀: `run-dsatur.mts`(greedy)·`run-enhanced.mts`·`run-cpsat.mts`·`run-blocks.mts`(블록 collapse 실험).

**교사 부하 제약 — 하드 4종 승격(2026-07-03, 구 2026-06-17 soft 모델 대체)**: "하루 ≤4개·3연속 금지·**주간 7교시 ≤3**·**같은 교사-같은 과목(분반 포함) 인접 교시 연속 금지**"를 **하드 제약 기본 ON**으로 승격(`DEFAULT_OPTIONS.hard.teacherDailyCap/teacherConsecutive/teacherLastPeriodCap/teacherSubjectConsecutive`, 상한 `maxPerTeacherPerDay`4·`maxConsecutivePerTeacher`2·`maxLastPeriodPerTeacher`3; **구 저장본 input_payload엔 키가 없어 undefined=off로 레거시 재현**). 2026-06-17의 "hard 불가" 결론은 후처리(soft+Kempe) 관점이었고, **하드를 Phase-1 시드 탐색 에너지에 직접 통합하면 슬랙0에서도 실현가능**함이 실측 확인됨. 의미론 단일 출처 = `algorithm/teacherConstraints.ts`(`runExcessMask`/`adjacentPairsMask`·한계비용 `teacherPlaceCost`·재측정 `teacherViolationsOf`/`collectTeacherViolations` — **점유는 멀티셋 카운트가 원본, 마스크는 count>0 파생**: 탐색 중 같은 교사 두 수업이 한 칸에 겹치는 transient 상태 안전).

**4계층 동일 통합**: ①enhanced-local 에너지=간선+cap+교사위반(tOcc/tMask/tDayCount/tLastCount/sOcc/sMask 증분 배열·O(1) `teacherMoveDelta`·pinned는 base fold) ②min-conflicts `mcCost` 한계비용 + 이동 시 **같은 교사 수업 전체를 affected 전파**(가짜 0충돌 방지) ③SA 무브 게이트(`moves.ts` `teacherMoveOk` — 교사별 위반 **비증가**만 허용; 같은 교사 swap=교시 집합 불변이라 정확) ④cp-sat MILP 선형화(일일합≤cap·(maxRun+1)윈도합≤maxRun·주간 7교시합≤lastCap·(교사,과목) 인접쌍합≤1; 디코딩 신뢰 게이트 countConflicts에 교사 위반 포함). `evaluateFull`이 4종을 하드 승격(`teacherDailyOver`/`teacherTripleRun`/`teacherLastPeriodOver`/`teacherSubjectAdjacent`)·메트릭에 `teacherLastPeriodOver`/`teacherSubjectAdjacent` 추가(기존 `teacherMaxDaily`/`teacherOverCap`/`teacherConsecutiveTotal` 유지), 소프트 가중치(teacherDailyLoad35·teacherConsecutive14·teacherLastPeriod20·teacherSubjectConsecutive18)는 **플래그 off일 때만 의미**. preflight가 주당>cap×일수 교사 사전 거부. `teacherRebalance.ts`(0충돌-보존 Kempe 후처리)는 유지 — soft 모드 개선용(검증 `run-teacher-load-test.mts`: 0충돌 유지·초과 16→5·3연속 63→36), 하드 모드선 solver.ts의 evaluateFull 가드가 위반 증가를 차단.

**학교 고정 공강 기본값** `DEFAULT_BLOCKED_BY_GRADE`(1·3학년 월4·화4·수4·금4·금5, 2학년 월4·화4·금4·금5)이 신규 생성 UI(`blockedByGrade` state) 시드.

**실측(모두 0위반 완전해)**: 실데이터 2026-1 균일 공강 그대로 **전 학년 하드 4종 완전 실현가능** — g1 4.5s·g2 120s·g3 120s(`GN=n npx tsx scripts/timetable-generator-test/run-teacher-hard-real.mts`, runSolverPipeline), 합성 slack-0 전학년 717 lessons 13.7s(`run-teacher-hard.mts` — 프리미티브 단위검증+독립 재계산 이중확인), 퍼즈 60 인스턴스×시드 2종+풀솔버 15회 "0충돌 주장⟺독립 재계산 0" 불일치 0(`run-fuzz-teacher.mts`), 통합 814 파이프라인 enhanced-local 0위반 51s(`run-pipeline-test.mts enhanced-local` — **기본 인자 min-conflicts는 문서화된 약한 전략이라 잔여 ~17이 정상, 프로덕션 검증은 enhanced-local 인자**). 순수 채색 벤치 스크립트 13개는 `TEACHER_HARD_OFF`(constants)로 고정해 측정 의미 보존.

**★계층화 + 완화-조이기 파이프라인(2026-07-03 v2 — 사용자 보고 "학생/교사 동시수업 포함 시간표 생성" 수정)**: 통합(전학년, **교차 교사 31/54명**) + 하드 4종은 예산 내 0위반 시드가 안 나와(standard feasibleSeeds=0) 최선안이 반환되는데, 평탄 에너지가 기본충돌과 부하위반을 1:1 맞교환해 **기본충돌 30건짜리 최선안**이 나오던 결함. 수정 3축 — ①**하드 계층화**: tier0(학생/교사 동시수업·차단칸·하루중복·미배치·고정위반) ≫ tier1(부하 4종). `solver.ts` tierCounts/candTiers/tierBetter로 bestEffort 선택·파이프라인 비교 전부 사전순, enhanced-local은 `energyT`(교사 위반 에너지 분리)로 best 스냅샷을 (base, teacher) 사전순 기록. ②**runSolverPipeline v2 = 통합 solve→section→re-solve → (하드4종 미달 시) 완화(4종 OFF) 재솔브 → `tightenTeacherHard`(60s)**. 완화 경로가 기본충돌 0 보장(검증된 기존 경로), 조이기가 부하 위반을 직접 깎음.

**tightenTeacherHard(teacherRebalance.ts) = 0충돌-보존 Kempe 하강** — 슬랙0 0충돌 보드에선 단일이동 SA 무력(문서화)이라 Kempe가 유일 레버이며, rebalance(soft 총합 언덕오르기)와 달리 **하드 4종 위반 수 자체가 수용 기준**(감소=무조건 수용, 동률=soft 개선 시 수용 + 정체 시 확률 0.3 랜덤워크, best 스냅샷 복원). 실측(통합 814): 완화 해 부하 186(overCap5·consec35·last15·subjAdj131) → **19, 28s** (enhanced-local 웜스타트 재수리는 0충돌 보드에서 186→186 무력 — Kempe만 통함). ③**종단 실측(run-combined-hard.mts=UI 흐름 재현)**: standard 147s 기본충돌 0+부하 37 / **thorough 335s 기본충돌 0+부하 17(잔여 전부 subjAdj — 구조적 잔여 추정)**, diagnostics.reason으로 완화 사실·잔여 건수 안내.

**학년 순차 분해**(`gradeSequential.ts`+`trySequentialByGrade` — 교차 교사 팬텀 pinned 이월·시드 재시도·웜스타트 통합 수리·재분반 라운드)는 실측 t0 4~6 잔존으로 사전순에서 완화+조이기에 항상 밀려 **파이프라인 제외, export만 유지**(연구·회귀용, `run-sequential-hard.mts`). `enhancedLocalSeed`에 웜스타트 `initial` 파라미터 추가. UI: `diagnostics.reason` 배너 + hardFeasible=false 후보 "확정 금지" 경고 배너. 추가 회귀: `run-combined-hard.mts`·`run-tighten-hard.mts`(`TIGHTEN_CACHE`로 1단계 캐시)·`run-fuzz-teacher.mts`(퍼즈 60인스턴스 "0충돌 주장⟺독립 재계산" 양방향).

**적대적 리뷰 확정 4건 수정(2026-07-03)**: ①완화 경로 후보 **전부를 원 입력(하드 플래그) 의미론으로 재평가 + 사전순 재정렬** — 미조정 tail 후보(부하 ~186)가 hardFeasible=true·"제약 충족" 초록 칩으로 무경고 확정되던 critical 결함 차단(이제 완화 후보의 hard 배열·hardFeasible은 정직, t1>0이면 hardFeasible=false), ②`solveWithSectioning` 라운드 수용을 flat hardCount→사전순(tierBetter)으로(재분반이 tier0을 늘리며 tier1을 줄인 해를 채택하던 결함), ③`candTiers`가 **cfg에서 켜진 종류만** t1 합산(부분 활성 구성 보호), ④동률 시 완화 결과 선호(`!tierBetter(bestTiers, rTiers)`). UI 칩·경고 배너는 3단계: tier0>0=빨강 "기본 충돌 N"(확정 금지) / tier0=0·tier1>0=앰버 "부하 위반 N"(확정 가능·검토 권장) / 완전=초록 "제약 충족"(`candHardTiers`, `TEACHER_HARD_TIER1_IDS` 공유 상수).

**분반 구성원 교체 resection(2026-07-03, 사용자 제안)**: 조이기에 교체 무브 추가 — 위반 교사의 선택과목 수업을 칸 C로 옮기고 싶은데 학생 충돌로 막히면, 막는 학생(≤3명)을 **같은 과목의 다른 분반**으로 이적(그 분반 전 교시 무충돌 + **인원 균형: 분반당 초기 대비 ±`maxResectionShift` 기본 2**, blockers=0이면 순수 개선 이동)시켜 간선을 재배선해 길을 연다. 위반 감소 시에만 수용·아니면 완전 롤백, 이적처의 새 학생 간선은 adj에 증분 추가(제거 간선은 보수 유지=안전), 개선 수용 즉시 스냅샷이라 bestColor·명단 정합 보장. 명단 변경 시 파이프라인이 `TightenResult.rosters`로 받아 갱신 명단으로 그래프 재구축·strict 재평가하고 tail 후보 제거(구 명단 기준 배치라 의미 비교 불가).

**최종 확정 명단은 어차피 `sectionStudents`(여유 분반 우선 = 부하 균형 배정)가 placements에서 재유도**하므로 균형이 종단 보장. 조이기는 실행 분산(잔여 19~31)이 커서 **파이프라인에서 시드 2회 재시작 후 위반 수 최선 채택**(`collectTeacherViolations` — placements만으로 계산, 명단 무관). E2E standard 재실측: 기본 0+부하 32(178s, 교체 6분반·최대 편차 2 준수). room 하드 켜면 resection 비활성(보수).

**resection A/B 실측(같은 완화 해·시드 5쌍, `SHIFT=0|2 TIGHTEN_SEED=n run-tighten-hard.mts`)**: ON 평균 25.8 vs OFF 24.4, 쌍대 2:3 — **평균 효과 미입증(분산 내 동등)**, 단 전체 최저 기록(16)은 ON에서 발생 → 교체는 평균 개선이 아니라 **탐색 다양화**로 작동. 후속 후보 = 파이프라인 2회 재시작을 OFF 1회+ON 1회 포트폴리오로.

**리뷰 잔여 노트(수정 불요 판정)**: 구 저장본 가중치 기본값은 `?? 0`으로 레거시 재현(수정됨); daily-cap Set/multiset 분기와 cp-sat 과제약은 `hard.teacherConflict=false`(UI 도달 불가) 한정·보수 방향; pinned 전용 교사 위반은 두 시드 솔버 가시성이 다르나 최종 라벨은 정직(개선 여지=preflight 사전 경고); tighten witness 명단은 확정 시 sectionStudents 재유도가 설계(±shift는 탐색용 보증); quick 모드 파이프라인 총 소요가 라벨보다 김(정확성 우선 트레이드오프); probe는 짧은 min-conflicts라 파이프라인(완화+조이기)보다 비관적 "추정".

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `timetable-generator` | 새 학기 수업 시간표 자동 생성 (course_offering+enrollment → CSP+SA) | `algorithm/solver.ts`, `services/timetablePlanService.ts` · `docs/features/timetable-generator.md` |
