# 단계별 배치·분반 공동 탐색

2026-09-23. 검증용 CP-SAT 모델을 로컬 계산 서비스로 분리하고 **새 시간표 생성**에 `단계별 공동 탐색 (로컬 서비스)` 전략을 연결했다. 운영 시간표를 자동 저장하거나 확정하지 않는다.

## 실행

현재 PC에는 OR-Tools가 설치되어 있다. 저장소 루트에서 별도 터미널 두 개로 실행한다.

```powershell
npm run dev:solver
npm run dev
```

`http://localhost:8080/timetable-generator/new`에서 해당 전략을 선택하고 시간표를 생성한다. 로컬 개발 화면의 기본 전략이다. 초기 탐색 약 20초 후, 빠름 90초·표준 360초·정밀 600초·최정밀 1200초의 CP-SAT 계산 예산을 사용한다. 모델 구성과 통신 시간은 추가된다. 현재 단계와 중단 버튼을 표시한다. 연결 실패 시 원인을 표시하며 기존 브라우저 공동 탐색으로 임의 전환하지 않는다.

다른 PC에서 최초 설치:

```powershell
python -m venv .venv-timetable
.venv-timetable\Scripts\python.exe -m pip install -r services/timetable_solver/requirements.txt
npm run dev:solver
```

실행기는 `.venv-timetable` 또는 기존 검증 환경을 찾는다. 별도 Python 경로는 `TIMETABLE_SOLVER_PYTHON`으로 지정한다. 서비스는 `127.0.0.1:8765`에만 바인딩하고 Vite의 `/api/timetable-solver` 프록시로 연결한다. 외부 Origin·외부 전달 주소를 거부하며 CORS를 열지 않는다. 운영 배포의 정적 프런트에는 이 서비스가 포함되지 않는다. 공유 운영 환경에서는 인증된 계산 API와 접근 통제·작업 격리를 별도로 구축해야 한다. 운영 빌드의 기본 전략은 기존 브라우저 공동 탐색을 유지한다.

## 자동 탐색

1. 기존 브라우저 워커가 초기 후보를 만든다. 이어서 개선할 때는 선택한 후보의 위치에서 시작한다.
2. 전체 분반을 고정한 정확 배치부터 짧게 검사한다.
3. 선택 수업이 많은 학년부터 검사하고, 공통수업과 수강 인원이 많은 주요 선택과목을 묶어 배치·분반을 함께 푼다. 실패하면 선택과목 범위를 4개→8개→전체로 넓힌다. 학년도·과목명·기존 정답을 하드코딩하지 않는다.
4. 학년별 중간 탐색에서는 교사 부하만 일시 완화한다. 학생·교사 동시수업, 과목 일일 상한, 차단칸, 고정 배치는 계속 지킨다. 분반 이동은 같은 학년·과목·시수 안에서만 가능하고 정원은 35명이다.
5. 전 학년 모든 교사·공강 제약으로 조정한다. 남은 예산으로 전체 학년·분반 공동 모델을 시도한다.
6. 반환된 배치와 명단을 브라우저가 다시 검사한다. 학생별 수강 과목·시수, 공통수업 명단, 정원, 전체 배치 수, 모든 활성 하드 제약을 통과해야 후보를 표시한다.

좁은 과목 범위나 고정 분반의 `INFEASIBLE`을 전체 불가능으로 표시하지 않는다. 전 학년·전체 분반 공동 모델의 불가능 증명만 전체 불가능으로 표시하며, 시간 내 미해결은 `UNKNOWN`으로 구분한다. [OR-Tools 상태 정의](https://developers.google.com/optimization/cp/cp_solver).

## 명단 보존과 작업 수명

후보는 정렬된 원본 학생 목록의 인덱스와 원본 변경 확인값을 보존한다. 기존 `candidates` JSON을 사용하므로 스키마 변경이 없다. 미리보기·수기 배치 편집·초안 복원·확정 전 메모리 전개에서 같은 분반을 사용한다. 원본 수강 명단이나 교사 연결이 바뀌면 재생성을 요구한다. 변경 확인값은 데이터 변경 감지용이며 인증 서명이 아니다.

서버는 DB 연결이나 자격 증명이 없으며 수강 자료를 파일로 저장하지 않는다. 한 번에 한 작업만 계산하고 두 번째 요청에는 사용 중임을 알린다. 중단·화면 이탈 시 DELETE로 자식 계산 프로세스를 종료한다. 폴링이 끊긴 작업은 마지막 접근 이후 120초가 지나면 정리하며, 30초마다 점검한다. 반환 성공·실패 뒤에도 클라이언트가 작업 자료를 삭제한다.

## 검증 명령

```powershell
npx jest --config scripts/timetable-generator-test/jest.config.cjs --runInBand
python scripts/timetable-generator-test/test_verify_cpsat.py
# services 폴더에서:
python -m unittest timetable_solver.test_pipeline
# 저장소 루트, 서비스 및 Vite 실행 중:
npx tsx scripts/timetable-generator-test/run-staged-e2e.mts reports/private/staged-baseline.json reports/private/staged-e2e-result.json
npx tsx scripts/timetable-generator-test/smoke-solver-http.mts reports/private/staged-baseline.json
```

초기 충돌 후보에서 자동 과목 선정→CP-SAT→별도 검증까지 804수업으로 확인했다. 익명 데이터에서는 저장된 정답을 주지 않고 새 초기 탐색 약 20.3초 후 계산 서비스 약 52.9초로 모든 하드 제약을 만족했다. 초기 후보에는 교사 충돌 1건과 일일 상한 22·연속 수업 57·마지막 교시 8건의 위반이 있었다. 과목명을 지정하지 않고 선정된 3학년 8개 과목의 공동 탐색과 전 학년 조정으로 해소했다. 이 시간은 해당 실행의 실측이며 모든 입력·시드에 대한 보장이 아니다.

실제 학생·강좌 ID 자료에서도 새 초기 탐색 약 20.5초 + 계산 서비스 약 50.1초에 성공했다. 초기 후보의 교사 동시수업 1건·일일 상한 21건·연속 수업 60건·마지막 교시 상한 6건을 해소했다. 원본 명단에서 인덱스를 복원한 뒤 교사 804행·학생 18,960행을 메모리에 전개해 확인했으며 DB 쓰기는 없었다. 새 생성 결과는 `reports/private/2026-2-staged-browser-preview.json`으로도 보관해 기존 읽기 전용 미리보기에서 열 수 있다.

Jest 53개, Python 모델·파이프라인 회귀 10개, 변경 기능 ESLint·핵심 서비스/명단/훅의 TypeScript 검사 및 프로덕션 빌드를 통과했다. 실제 HTTP 프록시에서 외부 Origin/전달 주소 거부, 입력 오류, 동시 요청 거부, 진행 조회, 취소 후 삭제를 검증했다. 브라우저 버튼에 연결된 서비스 클라이언트와 초기 솔버를 그대로 호출한 통합 검증이며, 데스크톱 화면의 직접 클릭 검증과 공유 운영 서버 배포는 포함하지 않았다.
