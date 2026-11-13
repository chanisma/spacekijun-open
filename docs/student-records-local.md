# 생기부는 DB 가 아니라 로컬 파일로 (공개판 원칙)

## 원칙
- **생기부 본문과 성적은 Supabase DB 에 올리지 않는다.** 세특·창체·행특·독서·봉사·출결·교과 성적·모의고사 답안 모두 해당한다.
- 교사 PC 의 **생기부 폴더**에 필요한 파일만 두고, 웹 화면이 그 자리에서 읽는다. 서버로 보내지 않는다.
- DB 에는 **명단만** 남긴다. 명단은 `resource`(type='student')이고, 학번(`meta.id`)·이름·학년·반·번호가 들어 있다. 로그인·권한·업무처럼 여러 사람이 함께 쓰는 기능은 명단으로 충분하다.

왜 이렇게 하나:
- 생기부는 가장 민감한 학생 정보다. 클라우드 DB 에 모아 두면 RLS 한 줄의 실수로도 모두 드러난다.
- 생기부를 쓰는 일은 담임·교과 교사 한 사람의 PC 에서 끝나는 경우가 많다. 상담 자료, 세특 초안, 성적 분석이 그렇다.

## 폴더 구조
```
local-records/                 ← 교사 PC. 저장소에 커밋하지 않는다(.gitignore)
  students/
    00-00001.json              ← 학생 한 명 = 파일 하나, 이름 = 학생코드(resource.meta->>'id')
    00-00002.json
```
예시는 저장소의 `local-records.example/` 에 있다. 가상 학생 한 명이다.

### 파일 한 개의 모양 (`schema: 1`)
| 칸 | 내용 | 원래 DB 칸 |
|---|---|---|
| `student_code` | 학생코드. 파일 이름과 같아야 한다 | `student_basic_info.id` |
| `grade_info` | 교과 성적(학기별 과목·등급·원점수) | `student_basic_info.grade_info` |
| `academic_development` | 교과학습발달상황(세특 원문) | `student_basic_info.academic_development` |
| `attendance` · `volunteer` · `reading` | 출결 · 봉사 · 독서 | 같은 이름의 칸 |
| `mock_result` · `mock_marking` | 모의고사 성적 · 문항별 답안 | 같은 이름의 칸 |
| `activities[]` | 서술 한 줄씩 `{category, subject_name, content, grade, semester}` | `student_detailed_activities` 한 행 |

칸 이름을 옛 DB 칸과 같게 두었다. 화면을 옮길 때 «어디서 읽나»만 바꾸면 된다.

## 읽는 코드
`src/lib/localStudentRecords.ts`
- `pickLocalRecordsFolder()`: 폴더를 고르면 브라우저가 그 자리에서 읽는다. Chrome·Edge 의 File System Access API 를 쓰고, 읽기 전용이다.
- `fromFileList(files)`: 폴더 열기를 못 쓰는 브라우저용이다. `<input type="file" webkitdirectory>` 로 고른 파일을 메모리에서만 쓴다.
- `source.read(학생코드)`: 학생 한 명의 파일을 읽는다. 없으면 `null`.
- `parseLocalStudentRecord()`: 형식 검사. schema 버전, 파일 이름과 학생코드가 맞는지 본다.

## 아직 DB 를 읽는 화면 (옮길 대상)
공개판 코드는 원래 학교 운영판에서 왔다. 그래서 아래 화면은 **아직 DB 표를 읽는다.** 이 원칙을 따르면 표가 비어 있어 이 화면들은 빈 상태로 보인다. 하나씩 `localStudentRecords` 로 옮기면 된다.

| 기능 | 읽는 표 | 위치 |
|---|---|---|
| 학생 기록 관리(evalog)·역량분석·활동 타임라인 | `student_basic_info`, `student_detailed_activities` | `src/features/evalog/` |
| 학생 종합 대시보드 | `student_basic_info` | `src/features/student-dashboard/` |
| 모의고사 분석·성적 예측 | `student_basic_info.mock_*` | `src/features/evalearn/` |
| 교과 분석·반 배정 | `student_basic_info.grade_info` | `src/features/course-analyze/`, `class-assignment/` |
| 수시 지원 관리 | `student_basic_info` | `src/features/admission-wishlist/` |
| 창체 GraphRAG·탐구 설계·면접 준비 | `student_detailed_activities`, `inquiry_*` | `src/features/creative-activities/`, `inquiry-design/`, `interview-prep/` |
| 학생 지식그래프 | `student_kg_*` | `src/features/kg-viewer/` |

서버 쪽에서도 생기부를 읽는 것이 있다.
- SQL 함수: `student_identity_map`·`student_academic_flat` 같은 MV, 분석 RPC
- 엣지 함수: 면접 준비, 탐구 설계

이것들은 로컬 파일을 볼 수 없다. 옮길 때는 둘 중 하나를 고른다.
- 계산을 브라우저로 옮긴다.
- 사용자가 고른 칸만 그때그때 요청 본문에 실어 보낸다. 서버에 저장하지 않는다.

## 하지 말 것
- 생기부 파일을 `public/`, 저장소, Supabase Storage 에 두지 않는다.
- 로컬 파일을 읽어 DB 표에 다시 쓰지 않는다. 그러면 원칙이 무너진다.
- AI 기능에 생기부를 보낼 때는 필요한 칸만 보낸다. 엣지 함수 로그(`ai_call_log`)에는 본문을 남기지 않는다.
