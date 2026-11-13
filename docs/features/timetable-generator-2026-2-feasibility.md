# 2026학년도 2학기 배치 가능성 검증 완료

2026-09-23. **정정된 수강 명단과 기존 기본 제약으로 전 학년 시간표를 배치할 수 있음을 확인했다.** 629명·804수업의 구체적인 배치와 분반 명단을 생성했고, 독립 검증 및 실제 명단 복원·확정 전 행 생성으로 재검증했다.

## 검증 범위와 결과

| 항목 | 결과 |
| --- | --- |
| 수강 기준 | 사용자 제공 2026-2 학생편성현황 세 원본으로 정정한 명단 |
| 대상 | 1학년 222명, 2학년 190명, 3학년 217명 = 629명 |
| 미재학 | 6명 기록 보존, 생성 제외 |
| 격자·공강 | 5일×7교시, 1·3학년 가용 30칸 / 2학년 31칸 유지 |
| 과목·시수 | 모든 학생의 원본 수강 과목과 주당 시수 보존 |
| 수업 | 804개 전부 배치, 누락·중복·격자 밖·공강 침범 0 |
| 교사 식별 | 804수업 모두 교사 ID 확인, 총 53명 |
| 학생·교사 동시수업 | 0 |
| 같은 분반 하루 수업 한도 | 1회 유지, 위반 0 |
| 교사 하루 상한 | 4교시, 위반 0 |
| 교사 연속 수업 | 최대 2교시, 위반 0 |
| 교사 마지막 교시 | 주 3회 이하, 위반 0 |
| 같은 분반·교사의 연속 수업 | 위반 0 |
| 선택 분반 정원 | 35명 이하, 복원 후 초과 분반 0 |
| 확정 직전 행 전개 | 교사 804행, 학생 18,960행 |

기본 설정에서 교실 충돌 하드는 비활성이다. 이 검증은 현재 활성화된 하드 제약의 실현 가능성에 대한 결과이며 소프트 점수의 최적성을 주장하지 않는다. 학생별 모든 주간 칸을 채우는 제약을 추가하지 않았다. 원본에 짧은 시수가 있는 학생도 과목을 임의로 추가하지 않고 그대로 유지했다.

## 해를 찾은 방법

1. 이전 후보의 분반을 고정한 3학년 문제를 별도 CP-SAT 모델로 검사했다. 교사 부하를 완화한 기본 제약만으로도 `INFEASIBLE`이었다(약 4.7초). 이는 **그 분반 배정에서** 불가능하다는 결과이며 재분반까지 포함한 전체 문제의 불가능성 증명이 아니다.
2. 3학년의 수강 과목·시수·교사·분반 수를 유지하면서 학생의 분반 선택을 변수로 만들었다. 같은 학년·과목·시수의 선택 분반 사이에서만 이동하며 정원은 35명이다.
3. 기존 후보에서 통합수학Ⅰ·Ⅱ, 심화 영어Ⅰ, 실용 국어, 심화 국어, 체육 탐구, 진로활동을 함께 재배치하고 다른 수업 위치는 유지했다. 이 배치·분반 공동 부분문제에서 3학년 기본 충돌 0인 해를 찾았다(약 55.3초).
4. 위 분반 결과와 1·2학년 명단을 결합한 뒤, 전 학년의 모든 수업 위치를 변수로 만들고 기본 공강 및 교사 하드 제약 전체를 적용했다. 초기 후보를 약 31.0초에 얻었으나, 교사 ID 누락이 발견되어 이 결과만으로 검증을 끝내지 않았다.
5. 논술 1개·공통수학2 3개 강좌의 누락된 교사 연결을 복구하고, 해당 15교시까지 같은 교사의 충돌·부하 제약에 포함해 전 학년을 다시 풀었다. 이전 후보를 힌트로 사용한 마지막 실행은 약 7.0초에 `OPTIMAL`로 완료됐다. 목적함수가 없는 가능성 검사이므로 이 상태는 배치 존재를 의미한다. 아래 저장 증거는 이 최종 결과다.

엔진은 별도 로컬 환경의 OR-Tools 9.15.6755를 사용했다. [공식 CP-SAT 상태 정의](https://developers.google.com/optimization/cp/cp_solver)에 따라 시간 초과 `UNKNOWN`과 불가능 증명 `INFEASIBLE`을 구분했다. 위 시간은 성공한 단계의 측정값이며 전체 조사 시간이나 반복 실행의 보장 시간이 아니다. 앞선 전역 공동 모델의 180초 `UNKNOWN` 등 미완성 실험도 가능성 판단 근거로 사용하지 않았다.

## 교차 검증과 복원 오류 수정

- CP-SAT에서 계산한 결과를 기존 TS 점수 함수와 별도의 직접 집계 검증기 `verify-candidate.ts`로 확인했다. 원본 학생별 과목·시수, 교사 배정, 공강, 전체 배치 수 및 모든 활성 하드 제약을 검사했다.
- 초기 명단 복원 알고리즘은 학생별 무충돌 조합을 탐욕적으로 고른 후 정원 초과를 보고만 했다. 검증 배치를 복원하면 익명 데이터에서 5개 분반이 정원을 넘었다.
- `sectionStudents`에 학생의 전체 과목 조합을 다시 맞추는 정원 보정과 결정적 동률 재시도를 추가했다. 수정 후 충돌과 정원 초과가 모두 0이다. 불가능한 총 정원에는 재시도를 하지 않고 초과를 보고한다. 정원을 해결하지 못한 후보는 확정 전 검증에서 거부한다.
- 실제 학생·강좌 ID와 DB 조회 순서를 사용한 정정 후 데이터 스냅샷에서도 별도로 검증했다. 명단 복원 후 모든 하드 제약을 통과했고, 실제 강좌 ID로 학생 18,960행·교사 804행을 메모리에 생성했다. 운영 시간표에 배치를 저장하거나 확정하지 않았다.
- Jest 44개, CP-SAT 모델 회귀 4개, 기능 범위 ESLint 및 프로덕션 빌드를 통과했다. 회귀에는 분반을 고정하면 불가능하지만 재분반하면 가능한 예제, 고정/차단 칸, 교사 상한, 시간 초과 상태, 실제 804수업 증거의 복원과 조회 순서 변경이 포함된다.

## 검증 중 교사 연결 정정

1학년 논술 2반(3교시), 공통수학2 3·6·9반(각 4교시)은 강좌의 교사 이름·계정은 있으나 `teacher_resource_id`가 비어 있었다. 각 강좌 ID에 연결된 기존 교사 시간표의 15행이 모두 동일한 교사 리소스를 가리키며, 교사 이름과 리소스 유형도 일치함을 확인했다. 원본 행을 로컬 백업한 후 해당 학기·강좌·null 값·연결 일치를 조건으로 DB의 누락된 외래키 4건만 채웠다. 수강 명단과 운영 시간표 위치는 변경하지 않았다.

개인정보가 있는 백업은 `reports/private/2026-2-essay-teacher-link-backup.json`, `reports/private/2026-2-math-teacher-link-backup.json`에 보관한다. 정정 후 DB를 다시 조회한 스냅샷으로 실제 ID 검증을 수행했다. 익명 픽스처에도 같은 교사를 반영했으며, 검증 명령과 회귀 테스트는 이제 804수업 모두에 교사 ID가 있어야 통과한다.

## 보관한 증거와 재현

### 브라우저 읽기 전용 미리보기

시간표 생성기 목록에서 **검증 배치 미리보기**를 누르거나 `/timetable-generator/preview`로 이동한다. 기존 교사·관리자 접근 권한을 사용한다. 로컬 개발 서버에서는 `http://localhost:8080/timetable-generator/preview`다.

**검증 배치 파일 (.json)**에서 `C:\repository\spacekijun\reports\private\2026-2-browser-preview.json`을 선택한다. 준비한 파일은 실제 학생·교사 이름을 포함하며 공개 자산이나 Git에 포함하지 않았다. 파일은 브라우저 메모리에서만 읽고, 저장·확정·업로드를 하지 않는다. 새로고침하면 다시 열어야 한다.

반별·교사별·학생별 탭과 학년 선택으로 조회한다. 과목 칸을 클릭하면 상세 내용을 볼 수 있다. 미리보기는 저장된 분반 명단을 그대로 사용하고, 그 명단으로 학급별 인원과 소속 반을 다시 계산한다. 원본 수강 과목·시수, 공통수업 명단, 선택 분반 정원, 모든 활성 하드 제약을 읽을 때 재검사한다. 누락·중복·잘못된 배치, 교사 ID 누락, 검증 실패 파일은 표시하지 않는다. 검증 범위는 파일에 담긴 시점의 자료와 제약이며 최신 DB와 자동 동기화하지 않는다.

파일 재생성(운영 DB 쓰기 없음):

```powershell
npx tsx scripts/timetable-generator-test/export-preview.mts reports/private/2026-2-feasible-real-candidate.json reports/private/2026-2-feasibility-db-snapshot-final.json reports/private/2026-2-browser-preview.json
```

추가 검증: 미리보기의 실제 804수업 읽기·학급 인원 재계산·오류 파일 거부를 포함해 Jest 48개 통과, 변경 기능 ESLint·미리보기 유틸리티와 테스트의 TypeScript 검사·프로덕션 빌드 통과. 전체 프로젝트 TypeScript 검사에는 기존 다른 파일 오류가 남아 있다. 데스크톱 브라우저는 포커스 전환 제한으로 클릭 검증을 완료하지 못했다.

### 증거 파일

- `scripts/timetable-generator-test/2026-2-feasible-witness.json`: 이름·실제 UUID 없는 검증 배치, 분반 명단, 원본 픽스처 SHA-256, 검증한 제약.
- `scripts/timetable-generator-test/2026-2-search-baseline.json`: 동일 원본에 대한 미완성 초기 후보. 공동 부분문제 탐색 재현용이며 실현 가능한 해가 아니다.
- `reports/private/2026-2-feasible-real-candidate.json`: 실제 ID로 복원해 검증한 로컬 후보.
- `reports/private/2026-2-feasible-teacher-timetable.csv`: 교사 이름이 포함된 검토용 배치 목록. 로컬 Git 제외.

저장된 배치의 가능성을 다시 확인하는 데는 OR-Tools 설치나 재탐색이 필요 없다:

```powershell
npx tsx scripts/timetable-generator-test/verify-feasibility-witness.mts
npx jest --config scripts/timetable-generator-test/jest.config.cjs --runInBand
```

탐색을 재현하려면 별도 Python 환경에 `ortools==9.15.6755`를 설치한 뒤 다음 순서로 실행한다. 아래 `python`은 해당 환경의 실행 파일이다. 출력 폴더는 미리 준비한다.

```powershell
npx tsx scripts/timetable-generator-test/materialize-cpsat-input.mts scripts/timetable-generator-test/2026-2-search-baseline.json reports/private/cpsat-start.json
python scripts/timetable-generator-test/verify-cpsat.py reports/private/cpsat-start.json reports/private/cpsat-core.json --grade 3 --joint --basic --hint --free-subjects '통합수학Ⅰ,통합수학Ⅱ,진로활동,심화 영어Ⅰ,실용 국어,심화 국어,체육 탐구' --seconds 180 --workers 4
npx tsx scripts/timetable-generator-test/verify-cpsat-result.mts reports/private/cpsat-start.json reports/private/cpsat-core.json reports/private/cpsat-combined.json
python scripts/timetable-generator-test/verify-cpsat.py reports/private/cpsat-combined.json reports/private/cpsat-full.json --hint --seconds 240 --workers 8
npx tsx scripts/timetable-generator-test/verify-cpsat-result.mts reports/private/cpsat-combined.json reports/private/cpsat-full.json reports/private/cpsat-verified.json
python scripts/timetable-generator-test/test_verify_cpsat.py
```

검증은 특정 정정 원본과 기본 제약에 대한 존재 증명이다. 새 명단·교사·공강·정원으로 변경하면 재검증해야 한다. 이 보고서의 최초 CP-SAT 탐색은 로컬 검증 도구로 실행했다. 이후 [단계별 CP-SAT 생성 경로](./timetable-generator-staged-cpsat.md)를 실제 새 생성 화면에 연결했다. 로컬 계산 서비스가 필요하며, 기존 브라우저 전략이나 새 경로의 모든 입력·시드 성공을 보장하지 않는다.
