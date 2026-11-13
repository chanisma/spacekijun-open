# Evalog 기능 아키텍처 분석

## 1. 디렉토리 구조

```
src/features/evalog/
├── EvalogApp.tsx                          # 메인 진입점
├── App.css / index.css                    # 스타일
│
├── types/
│   ├── index.ts                           # barrel export
│   ├── student.ts                         # Student 핵심 타입
│   ├── evaluation.ts                      # Evaluation 타입
│   ├── curriculum.ts                      # 교육과정 타입
│   ├── pdf.ts / pdfTypes.ts              # PDF 파싱 구조체
│   ├── excelTypes.ts                      # 엑셀 파싱 결과 타입
│   ├── permissions.ts                     # 권한 키/라벨/그룹/매핑
│   └── ui.ts                              # UI 컴포넌트 타입
│
├── hooks/
│   ├── useEvaluationStore.ts              # Zustand 영속 스토어
│   ├── useEvaluationState.ts              # 학생 선택/목록/진행률
│   ├── useAppUI.ts                        # UI 상태 관리
│   ├── useKeyboardShortcuts.ts            # 키보드 단축키
│   ├── usePDFParser.ts                    # PDF 파싱
│   ├── useStudentStorage.ts               # IndexedDB 기반 저장
│   ├── useEvalogPermissions.ts            # 세분화 권한 체크
│   └── useEvalogTagPermissions.ts         # 태그 권한 DB 조회
│
├── services/
│   ├── adminService.ts                    # DB 업로드/업서트/CRUD
│   ├── dataExport.ts                      # JSON/CSV 내보내기
│   ├── dataMerge.ts                       # 데이터 병합 전략
│   ├── openaiWriterService.ts             # AI 문장 생성
│   └── studentStorage.ts                  # IndexedDB CRUD
│
├── components/
│   ├── layout/    (MainLayout, Header)
│   ├── student/   (StudentList, AddStudentDialog)
│   ├── evaluation/ (EvaluationPanel + 13개 하위 컴포넌트)
│   ├── writer/    (EvaluationWriter, SimilarityChecker, TeacherObservationPanel)
│   ├── admin/     (AdminDialog + 4개 탭)
│   ├── upload/    (PDF 업로드 워크플로우 5개)
│   ├── ai/        (AIWriterWidget)
│   ├── charts/    (EvaluationCharts)
│   ├── curriculum/ (CurriculumHierarchy)
│   ├── dev/       (DevTools + 디버그 다이얼로그 5개)
│   └── ui/        (BlurredContent 등 10개)
│
├── utils/
│   ├── excelParser.ts + excelParsers/ (11개 파서)
│   ├── pdf/ (PDF 파싱 시스템)
│   ├── similarity.ts / similarityCache.ts
│   ├── textAnalysis.ts / textUtils.ts
│   ├── curriculumUtils.ts / solarApi.ts
│
├── data/          (교육과정 데이터, 키워드 사전)
└── scripts/       (Python 추출 스크립트)
```

---

## 2. 아키텍처 개요

### 진입점 및 컴포넌트 계층

**진입점**: `EvalogApp.tsx` -- 메인 TMS Layout 안에 3패널 레이아웃을 렌더링

```
Layout (TMS 공통)
└── EvalogApp
    ├── Header (진행률, 학생 정보, Admin 버튼)
    ├── MainLayout (3패널)
    │   ├── 좌측: StudentList + DevTools
    │   ├── 중앙: EvaluationPanel (11개 탭)
    │   └── 우측: EvaluationWriter (4개 탭)
    ├── KeyboardHelp (단축키 도움말)
    ├── PDFUploadWorkflow (조건부)
    ├── AddStudentDialog (조건부)
    └── AIWriterWidget (플로팅)
```

### 데이터 흐름 패턴

**하이브리드 아키텍처**: Zustand(localStorage) + Supabase + IndexedDB 3중 저장소

1. **Zustand 스토어** (`useEvaluationStore`): 평가 작성 데이터 + 학생 목록을 `localStorage`에 영속 저장
2. **Supabase**: 학생 기초 정보(`student_basic_info`), 상세 활동(`student_detailed_activities`), 권한(`evalog_tag_permissions`), 관찰 노트
3. **IndexedDB** (`studentStorage`): 별도의 로컬 저장소 -- 현재 주 데이터 흐름과 분리됨

---

## 3. 컴포넌트 인벤토리

| 컴포넌트 | 위치 | 설명 |
|---------|------|------|
| `EvalogApp` | `EvalogApp.tsx` | 메인 앱 - 학생 로드, 엑셀 임포트, 3패널 레이아웃 오케스트레이션 |
| `MainLayout` | `layout/MainLayout.tsx` | 좌/중/우 3패널 레이아웃, 리사이즈 핸들, 토글 버튼 |
| `Header` | `layout/Header.tsx` | 상단 바 - EVALOG 로고, 학생 프로필 사진, 평가 진행률, Admin 버튼 |
| `StudentList` | `student/StudentList.tsx` | 학생 목록 테이블, 컨텍스트 메뉴(보기/편집/복사/삭제) |
| `AddStudentDialog` | `student/AddStudentDialog.tsx` | 학생 수동 추가/DB에서 불러오기 다이얼로그 |
| `EvaluationPanel` | `evaluation/EvaluationPanel.tsx` | 중앙 탭 컨테이너 (검색, 요약, 교과성적, 모의고사, 성적분석, 비교과, 교육과정, 과목위계, 유사도, 단어분석, 역량분석, 독서, 관찰노트, 활동 타임라인) |
| `AcademicGrades` | `evaluation/AcademicGrades.tsx` | 교과 추이도 차트(Recharts), 성적표, 진로선택 과목, 성취도 통계 |
| `ExtracurricularActivities` | `evaluation/ExtracurricularActivities.tsx` | 비교과 전체 표시 (출결, 자율, 동아리, 진로, 봉사, 세특, 행동특성) |
| `SeteukDetailDialog` | `evaluation/SeteukDetailDialog.tsx` | 과목 세특 상세 보기 모달 (Portal 사용) |
| `StudentSummary` | `evaluation/StudentSummary.tsx` | 학생 기본 정보 카드 (성명, 학번, 학교, 학과) |
| `SimilarityAnalysis` | `evaluation/SimilarityAnalysis.tsx` | 학생 간 세특 유사도 분석 |
| `SimilarityCacheManager` | `evaluation/SimilarityCacheManager.tsx` | 유사도 캐시 관리 UI |
| `SimilarityDetailDialog` | `evaluation/SimilarityDetailDialog.tsx` | 유사도 상세 비교 다이얼로그 |
| `WordAnalysis` | `evaluation/WordAnalysis.tsx` | 단어 빈도 분석 (형태소 기반) |
| `KeywordAnalysis` | `evaluation/KeywordAnalysis.tsx` | 핵심역량 사전 키워드 매칭 — 역량분석 탭의 두 번째 보기 |
| `CompetencyAnalysis` | `evaluation/CompetencyAnalysis.tsx` | **역량분석 탭**(구 '키워드분석'). 지식그래프 역량 층 + 판정 근거 / 키워드 보기 2종 — `docs/features/evalog.md` |
| `ActivityTimelineView` | `evaluation/ActivityTimelineView.tsx` | **활동 타임라인 탭**(구 'AI 분석'). 분절 활동 + KG 층을 학년 축으로 — `docs/features/evalog.md` |
| `TextSearch` | `evaluation/TextSearch.tsx` | 학생부 전체 텍스트 검색 |
| `CurriculumSchedule` | `evaluation/CurriculumSchedule.tsx` | 교육과정 편제 및 시간배당 표시 |
| `WorksheetPanel` | `evaluation/WorksheetPanel.tsx` | 워크시트 패널 |
| `EvaluationWriter` | `writer/EvaluationWriter.tsx` | 우측 패널 - 담임/교과/동아리/관찰 작성, 엑셀 내보내기, 유사도 체크 |
| `SimilarityChecker` | `writer/SimilarityChecker.tsx` | 작성 중 실시간 문장 유사도 체크 |
| `TeacherObservationPanel` | `writer/TeacherObservationPanel.tsx` | 교사 관찰 노트 (Supabase CRUD) |
| `AdminDialog` | `admin/AdminDialog.tsx` | 관리자 다이얼로그 (업로드, 학생관리, 추출, 교육과정, 권한 5개 탭) |
| `CurriculumExtractionTab` | `admin/CurriculumExtractionTab.tsx` | 교육과정 데이터 추출 |
| `PermissionSettingsTab` | `admin/PermissionSettingsTab.tsx` | 태그-권한 매트릭스 설정 UI |
| `PhotoRegistrationTab` | `admin/PhotoRegistrationTab.tsx` | 학생 사진 일괄 등록 |
| `StudentManagementTab` | `admin/StudentManagementTab.tsx` | DB 학생 조회/삭제 |
| `PDFUploader` | `upload/PDFUploader.tsx` | PDF 드래그앤드롭 업로드 |
| `PDFUploadWorkflow` | `upload/PDFUploadWorkflow.tsx` | PDF 업로드 전체 워크플로우 |
| `PDFPreview` | `upload/PDFPreview.tsx` | PDF 미리보기 |
| `StudentDataEditor` | `upload/StudentDataEditor.tsx` | 파싱된 학생 데이터 편집 |
| `StudentDataPreview` | `upload/StudentDataPreview.tsx` | 학생 데이터 미리보기 |
| `AIWriterWidget` | `ai/AIWriterWidget.tsx` | 플로팅 AI 문장 생성 위젯 |
| `EvaluationCharts` | `charts/EvaluationCharts.tsx` | 평가 관련 차트 |
| `CurriculumHierarchy` | `curriculum/CurriculumHierarchy.tsx` | 과목 위계 트리 시각화 |
| `BlurredContent` | `ui/BlurredContent.tsx` | 권한 없음 플레이스홀더 (실제 콘텐츠 렌더링 안 함) |
| `DebouncedTextarea` | `ui/DebouncedTextarea.tsx` | 디바운스 텍스트영역 |
| `DevTools` | `dev/DevTools.tsx` | 개발용 도구 패널 |

---

## 4. 훅 인벤토리

| 훅 | 파일 | 용도 | 데이터 소스 |
|---|------|------|-----------|
| `useEvaluationStore` | `hooks/useEvaluationStore.ts` | **핵심 전역 상태**: 학생 목록, 선택 학생, 평가 데이터(담임/교과/동아리), 파일명 | Zustand + localStorage |
| `useEvaluationState` | `hooks/useEvaluationState.ts` | Store 래핑: 학생 선택, 추가, 배치 추가, 진행률 계산 | `useEvaluationStore` |
| `useAppUI` | `hooks/useAppUI.ts` | UI 상태: 키보드 도움말, PDF 업로드, 활성 패널 전환 | React useState |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | 전역 키보드 단축키 등록/해제 | window.addEventListener |
| `usePDFParser` | `hooks/usePDFParser.ts` | PDF 파일 파싱, 결과/에러/로딩 상태 | 로컬 File API |
| `useStudentStorage` | `hooks/useStudentStorage.ts` | IndexedDB 기반 CRUD, JSON/CSV 내보내기, 백업/복원 | IndexedDB |
| `useEvalogPermissions` | `hooks/useEvalogPermissions.ts` | 태그 기반 세분화 권한 체크 (학년/반 매칭 + 영역별 접근 제어) | `useAuth`, `useUnifiedAuth`, `useResourceTagAssignments`, `useEvalogTagPermissions` |
| `useEvalogTagPermissions` | `hooks/useEvalogTagPermissions.ts` | `evalog_tag_permissions` 테이블 전체 권한 설정 조회 | Supabase (React Query, 5분 staleTime) |

---

## 5. 서비스 인벤토리

| 서비스 | 파일 | 책임 |
|--------|------|------|
| `adminService` | `services/adminService.ts` | (1) 엑셀 데이터를 `student_basic_info`와 `student_detailed_activities`에 업서트 (2) `smartUpsertDetailedActivities`: 변경 감지 후 삽입/업데이트/스킵 (3) `syncActivitiesToAcademicDevelopment`: 세특 → academic_development JSONB 동기화 (4) `fetchStudents`, `deleteStudent`, `convertBasicInfoToStudent` |
| `dataExport` | `services/dataExport.ts` | JSON/CSV 내보내기, 가져오기, 백업/복원 |
| `dataMerge` | `services/dataMerge.ts` | 학생 데이터 병합 전략 (keep/replace/merge/ask-user) |
| `openaiWriterService` | `services/openaiWriterService.ts` | Supabase Edge Function `openai-proxy`를 통한 GPT 기반 학생부 문장 생성 |
| `studentStorage` | `services/studentStorage.ts` | IndexedDB `EvalogDB` 직접 CRUD |

---

## 6. 타입 인벤토리

| 타입/인터페이스 | 파일 | 용도 |
|---------------|------|------|
| `Student` | `types/student.ts` | **핵심 타입** - 학생 전체 정보 (기본+학생부 섹션 데이터) |
| `SubjectGrade` | `types/student.ts` | 교과 성적 (과목, 등급, 단위, 성취도, 세특) |
| `ExtracurricularActivity` | `types/student.ts` | 비교과 활동 (자율/동아리/진로) |
| `VolunteerActivity` | `types/student.ts` | 봉사활동 |
| `BehaviorRecord` | `types/student.ts` | 행동특성 및 종합의견 |
| `AttendanceRecord` | `types/student.ts` | 출결상황 |
| `Evaluation`, `WorksheetCategory`, `EvaluationDocument`, `EvaluationNote` | `types/evaluation.ts` | 평가 관련 타입 |
| `SchoolCurriculum`, `SchoolCurriculumSubject` | `types/curriculum.ts` | 학교 교육과정 |
| `PDFParseResult`, `PDFParseError`, `PDFSection`, `PDFUploadState` | `types/pdf.ts` | PDF 파싱 관련 |
| `PdfSections`, `Section6Record`, `HeaderInfo`, `Section1PersonalInfo` 등 | `types/pdfTypes.ts` | PDF 구조체 (학생부 각 섹션) |
| `StudentBasicInfo`, `StudentActivity`, `ParsedData` | `types/excelTypes.ts` | 엑셀 파싱 결과 |
| `EvalogPermissionKey`, `EvalogGranularPermissions`, `PERMISSION_GROUPS`, `PERMISSION_LABELS` | `types/permissions.ts` | 권한 시스템 키/라벨/그룹/매핑 |
| `TabItem`, `Highlighter`, `ContextMenuItem` | `types/ui.ts` | UI 컴포넌트 타입 |
| `StudentEvaluation`, `EvaluationMode` | `hooks/useEvaluationStore.ts` | 평가 데이터 구조 (homeroom/subject/club) |

---

## 7. 유틸리티 인벤토리

| 유틸 | 파일 | 용도 |
|------|------|------|
| `calculateByteSize` | `utils/textUtils.ts` | 한글 3바이트, 영문 1바이트, 줄바꿈 2바이트 기준 바이트 계산 |
| `extractRealContent` | `utils/textUtils.ts` | JSON 래핑된 콘텐츠에서 실제 텍스트 추출 |
| `calculateTextSimilarity` | `utils/similarity.ts` | Jaccard + LCS + 길이비율 가중 평균으로 유사도 계산 |
| `findSimilarSegments`, `findSimilarTexts` | `utils/similarity.ts` | 유사 텍스트 구간 및 후보 검색 |
| `getSimilarity`, `checkSentenceSimilarity`, `findExactSentenceMatches` | `utils/similarity.ts` | Dice 계수 기반 문장 단위 유사도 |
| `analyzeWordFrequency` | `utils/textAnalysis.ts` | 한글 형태소 기반 단어 빈도 분석 (조사 제거, 불용어 처리) |
| `extractStudentTexts` | `utils/textAnalysis.ts` | 학생 객체에서 분석용 텍스트 전체 추출 |
| `generateWordCloudData`, `extractCategoryKeywords`, `findSentencesWithWord` | `utils/textAnalysis.ts` | 워드클라우드/카테고리/문장 검색 |
| `parseStudentExcel` | `utils/excelParser.ts` | 다중 엑셀 파일 오케스트레이션 (파일명 기반 파서 라우팅) |
| 엑셀 파서 11개 | `utils/excelParsers/*.ts` | 시트 유형별 파싱 (학적, 출결, 봉사, 교과, 세특 등) |
| PDF 파서 시스템 | `utils/pdf/*.ts` | PDF 텍스트 추출 및 학생부 구조화 |
| `similarityCache` | `utils/similarityCache.ts` | localStorage 기반 유사도 결과 캐싱 (24시간 만료) |

---

## 8. 상태 관리

### Zustand 스토어 (영속)

`useEvaluationStore`가 핵심 전역 상태를 관리하며, `zustand/middleware/persist`로 `localStorage` 키 `evalog-evaluation-storage`에 저장.

**관리하는 상태:**
- `data: Record<string, StudentEvaluation>` -- 학생 ID별 평가 데이터 (담임/교과/동아리)
- `students: Student[]` -- 현재 세션의 학생 목록
- `selectedStudentId: string | null` -- 선택된 학생
- `sourceFilename: string | null` -- 불러온 파일명

### React Query 키

| 키 | 위치 | 용도 |
|---|------|------|
| `['evalog-tag-permissions']` | `useEvalogTagPermissions.ts` | 권한 설정 조회 (5분 staleTime) |

### 로컬 상태 패턴

- `EvaluationPanel`: 하이라이트 목록 (`useState`)
- `AcademicGrades`: 확장된 카테고리, 차트 활성 카테고리, 선택 과목 (`useState`)
- `EvaluationWriter`: 활성 탭, 미리보기 데이터, 파일명 편집 (`useState`)
- `MainLayout`: 패널 열림/닫힘, 우측 패널 너비, 리사이즈 상태 (`useState`)
- `Header`: 프로필 이미지 (`useState`, `useEffect`로 Supabase 직접 fetch)

### IndexedDB (별도 저장소)

`studentStorage.ts`의 `EvalogDB` -- `useStudentStorage` 훅으로 접근. **현재 메인 데이터 흐름과 분리되어 있음** (아래 문제점 섹션 참조).

---

## 9. 권한 시스템 (End-to-End)

### 구조

```
evalog_tag_permissions 테이블
  ├── tag_id (resource_tags의 FK)
  ├── permission_key (예: "attendance", "seteuk:국어")
  └── grade (1, 2, 3)

resource_tags 테이블 + resource_tag_assignments
  ├── 태그: "2학년 3반", "2학년 담임", "부장" 등
  └── 교사 resource에 태그 할당
```

### 권한 판정 흐름

1. **`useEvalogPermissions(student)`** 호출
2. `useUnifiedAuth()` -> 현재 사용자의 `primaryResource.id` 획득
3. `useResourceTagAssignments([resourceId])` -> 사용자에게 할당된 태그 목록 조회
4. `useEvalogTagPermissions()` -> `evalog_tag_permissions` 전체 조회 (`Map<compositeKey, Set<tagId>>`)
5. **1단계 - 태그-학년반 매칭**: 사용자 태그를 파싱하여 학생의 학년/반과 매칭
   - "부장" 태그 -> 전체 접근
   - "2학년 3반" -> grade=2, classNum=3인 학생만
   - "2학년 담임" -> grade=2인 학생 전체
   - **미매칭시 전체 블러**
6. **2단계 - 영역별 세분화 체크**: `permission_key@grade` 조합으로 허용 태그 확인
   - DB에 설정 없으면 -> 매칭된 모든 교사에게 공개 (하위 호환)
   - DB에 설정 있으면 -> 사용자 태그가 허용 목록에 있는지 확인
7. **Admin** -> 항상 모든 권한

### UI 적용

- `BlurredContent` 컴포넌트: 실제 콘텐츠를 렌더링하지 않음 (CSS blur가 아닌 콘텐츠 치환)
- `ExtracurricularActivities`: 출결, 자율, 동아리, 진로, 봉사, 세특, 행동특성 각각에 개별 권한 적용
- `AcademicGrades`: 세특 상세 보기(`SeteukDetailDialog`)에 `canViewRemarks` prop으로 전달
- `EvaluationPanel`: "학생 데이터 복사" 시 권한 기반 필터링 적용
- `SimilarityAnalysis`: 유사도 분석 시에도 `permissions` prop 전달

---

## 10. 데이터 흐름

### (A) 학생 데이터 로딩

```
파일 선택 (엑셀 또는 PDF)
    │
    ├─ [엑셀 경로 1] StudentList 엑셀 업로드 → EvalogApp.handleImportStudentsFromExcel()
    │   ├── XLSX.read() → JSON 변환
    │   ├── Supabase에서 student_basic_info + resource 조회 (사진/ID 보강)
    │   ├── DB 매칭 성공 → convertBasicInfoToStudent() 으로 풍부한 Student 생성
    │   ├── DB 매칭 실패 → 엑셀 기본 정보로 최소 Student 생성
    │   └── useEvaluationStore.importData() + setStudents()
    │
    ├─ [엑셀 경로 2] AdminDialog 데이터 업로드 → parseStudentExcel()
    │   ├── 다중 파일 파싱 (파일명 기반 라우팅)
    │   ├── studentSubjects 맵 구축, StudentID 계산
    │   ├── reconcileStudentIdsWithResource() — 채번 ID를 resource(meta.id)와 교차 검증
    │   │   ├── (현재 학년 학번 snum{N}, 이름) 매칭 → resource.meta.id로 ID 교체 (전입생 포함)
    │   │   ├── resource 미등록 학생: 파생 ID 유지, 단 타인 소유 코드면 충돌 → 업로드 제외
    │   │   └── 배경: 전입생은 "전입학" 연도 + 이전 학교 1학년 반/번호로 채번되어
    │   │       재학생 코드와 충돌 가능 (2025-12 한선우→송다인 코드 점유 실사례)
    │   ├── 미리보기 표시
    │   ├── "DB에 저장" → adminService.uploadStudentData()
    │   │   ├── student_basic_info upsert (chunk 50건씩)
    │   │   ├── smartUpsertDetailedActivities() (변경분만 처리)
    │   │   └── syncActivitiesToAcademicDevelopment() (세특 → academic_development)
    │   └── "학생 목록으로 추출" → convertToStudents() → onBatchAddStudents()
    │
    ├─ [PDF 경로] PDFUploadWorkflow → usePDFParser() → PDFParser.parse()
    │   ├── pdf.js로 텍스트 추출
    │   ├── sectionOrchestrator로 섹션 분리
    │   ├── 섹션별 파서 실행
    │   └── Student 객체 생성 → handlePdfJsonLoaded() 또는 handleBatchAddStudents()
    │
    └─ [AddStudentDialog] DB에서 학생 검색/추가
        ├── Supabase에서 student_basic_info + student_detailed_activities 조회
        └── convertBasicInfoToStudent() → handlePdfJsonLoaded()
```

### (B) 평가 표시

```
학생 선택 (StudentList 클릭)
    │
    ├── useEvaluationState.handleSelectStudent() → selectedStudentId 설정
    │
    ├── EvaluationPanel (중앙)
    │   ├── useEvalogPermissions(student) → permissions 계산
    │   ├── student.section6_academic_development → AcademicGrades (교과성적)
    │   ├── student.section5_creative_activities → ExtracurricularActivities (비교과)
    │   │   └── 각 섹션에 permissions 기반 BlurredContent 적용
    │   ├── student 전체 → WordAnalysis, SimilarityAnalysis, KeywordAnalysis
    │   └── student.studentId → 외부 링크 (리로스쿨, NotebookLM)
    │
    └── EvaluationWriter (우측)
        ├── useEvaluationStore.getEvaluation(student.id) → 평가 데이터 로드
        ├── DebouncedTextarea → updateEvaluation() → localStorage 자동 저장
        ├── SimilarityChecker → 다른 학생 평가와 유사도 실시간 비교
        └── 엑셀 내보내기 → XLSX.writeFile()
```

### (C) 관리자 작업

```
Header "Admin" 버튼 → AdminDialog
    ├── "데이터 업로드" 탭: 엑셀 → parseStudentExcel() → uploadStudentData() → Supabase
    ├── "학생 관리" 탭: fetchStudents() → 목록 표시/삭제
    ├── "학생 추출" 탭: 파싱 데이터 → 선택 → onBatchAddStudents() → 좌측 목록에 추가
    ├── "교육과정 추출" 탭: 교육과정 데이터 추출/관리
    └── "권한 설정" 탭: evalog_tag_permissions CRUD → PermissionSettingsTab
```

---

## 11. 외부 의존성

### Supabase 테이블

| 테이블 | 접근 방식 | 용도 |
|--------|----------|------|
| `student_basic_info` | `as any` 캐스팅 | 학생 기초 정보, academic_development JSONB |
| `student_detailed_activities` | `as any` 캐스팅 | 과목별 세부능력 및 특기사항 |
| `evalog_tag_permissions` | `as any` 캐스팅 | 태그별 권한 설정 |
| `resource` | 직접 조회 | 학생/교사 리소스 (사진, meta.id) |
| `profiles` | 간접 (`useAuth`) | 인증 정보 |

### 외부 훅/서비스 임포트

| 임포트 | 출처 | 용도 |
|--------|------|------|
| `Layout` | `@/components/layout/Layout` | TMS 메인 레이아웃 래퍼 |
| `useAuth` | `@/components/auth/AuthProvider` | 인증 상태 (isAdmin) |
| `useUnifiedAuth` | `@/services/hooks/useUnifiedAuth` | 통합 인증 (primaryResource) |
| `useResourceTags` | `@/hooks/useResourceTags` | 리소스 태그 목록 조회 |
| `useResourceTagAssignments` | `@/hooks/useResourceTags` | 리소스별 태그 할당 조회 |
| `supabase` | `@/integrations/supabase/client` | Supabase 클라이언트 |
| `cn` | `@/lib/utils` | 클래스명 유틸 |
| `useToast` | `@/hooks/use-toast` | 토스트 알림 |
| `useDebounce` | `@/hooks/use-debounce` | 디바운스 |
| 다수의 shadcn/ui | `@/components/ui/*` | UI 컴포넌트 |

### 외부 라이브러리

- `xlsx`: 엑셀 파싱/생성
- `recharts`: 차트 (교과 추이도)
- `zustand`: 전역 상태 관리
- `@tanstack/react-query`: 서버 상태 관리
- `sonner`: 토스트 알림
- `lucide-react`: 아이콘

---

## 12. 잠재적 문제점 및 개선 영역

### Dead Code

| # | 문제 | 파일 | 심각도 |
|---|------|------|--------|
| 1 | **IndexedDB 저장소 미사용** - `useStudentStorage`, `studentStorage.ts`, `dataMerge.ts`, `dataExport.ts`가 메인 흐름에 연결되지 않음 (~1000줄) | `services/`, `hooks/` | LOW |
| 2 | **Mock 데이터 파일 비어있음** - `mockStudents.ts`, `mockEvaluations.ts` 빈 배열/객체 | `data/` | LOW |

### 타입 안전성

| # | 문제 | 파일 | 심각도 |
|---|------|------|--------|
| 3 | **`as any` 타입 캐스팅 남용** - Supabase 테이블 3개가 타입 생성에 미포함 | 전반 | MEDIUM |

### 코드 품질

| # | 문제 | 파일 | 심각도 |
|---|------|------|--------|
| 4 | **`calculateByteSize` 중복 정의** - `textUtils.ts`와 `EvaluationWriter.tsx`에 동일 함수 | 2개 파일 | LOW |
| 5 | **컨텍스트 메뉴 액션 미구현** - edit/complete/reset/send/delete 전부 `console.log`만 | `StudentList.tsx` | MEDIUM |
| 6 | **키보드 단축키 부분 미구현** - Ctrl+S, Ctrl+E가 TODO만 | `EvalogApp.tsx` | LOW |
| 7 | **Header 프로필 직접 fetch** - React Query 미사용, 캐싱 없음 | `Header.tsx` | LOW |
| 8 | **EvalogApp 엑셀 임포트 ~190줄 인라인 함수** - 서비스 분리 필요 | `EvalogApp.tsx` | LOW |

### 아키텍처 불일치

| # | 문제 | 파일 | 심각도 |
|---|------|------|--------|
| 9 | **Evaluation 타입과 실제 사용 불일치** - `types/evaluation.ts`(worksheets 기반) vs `useEvaluationStore`(homeroom/subject/club) | `types/`, `hooks/` | LOW |
| 10 | **UI 컴포넌트 중복** - evalog/ui/에 shadcn 복제본 존재, 루트 `@/components/ui/`와 혼용 | `components/ui/` | LOW |
| 11 | **Student 타입 비대화** - 필수/선택 필드 혼합, 소스별로 채워지는 필드가 다름 | `types/student.ts` | LOW |

### 하드코딩/버그

| # | 문제 | 파일 | 심각도 |
|---|------|------|--------|
| 12 | **5등급제 정책 하드코딩** - `admissionYear >= 2025` 직접 비교 | `AcademicGrades.tsx` | LOW |
| 13 | **OpenAI 모델명 하드코딩** - `gpt-5.4-mini-2026-03-17` 직접 지정 | `openaiWriterService.ts` | LOW |
| 14 | **`activity_type` 필드 참조 오류** - 실제 타입에 없는 필드 참조 → undefined | `openaiWriterService.ts:60` | MEDIUM |
| 15 | **fail-closed 로딩 UX** - 권한 로딩 중 모든 콘텐츠 차단, 스켈레톤/스피너 미표시 | `useEvalogPermissions.ts` | LOW |

---

*분석일: 2026-02-10*

---

## 부록 — 역량분석 · 활동 타임라인 데이터 계층 (2026-09-12 추가)

`/inquiry-design` 이 읽는 학생 지식그래프와 비교과 탭의 활동 분절을 evalog 로 들여온
계층. **설계·측정값·조용히 틀리는 자리는 `docs/features/evalog.md`** 에 있다.

| 파일 | 역할 |
|---|---|
| `types/kgLayers.ts` | KG 를 활동 중심으로 평탄화한 타입 + **엔진별 차이 표**(v8 / pro3 / v7) |
| `utils/kgLayers.ts` | 엔티티·관계 → `StudentKgLayers`. `layer==='local'` 분기, 활동 id 해석(`recordIdOf`) |
| `utils/activityLedger.ts` | 분절 + KG → 원장 · 학년 밴드 · 역량 뷰. 영역 라벨·색 단일 출처 |
| `hooks/useActivityLedger.ts` | `student_detailed_activities` **1회** 조회 + 색인 3종 |
| `hooks/useActivitySegmentation.ts` | 위 훅의 얇은 래퍼(내용 색인만). 비교과 탭의 기존 API 유지 |
| `hooks/useStudentKgLayers.ts` | **역량 층이 있는 최신 KG 버전** 선택 + 조립 |

회귀 = `npx tsx scripts/evalog-competency-test/run.mts` (88건, 순수 로직).
