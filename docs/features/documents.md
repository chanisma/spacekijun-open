# documents

> CLAUDE.md Component Architecture에서 분리한 서류함(documents) 상세. 저장 모델·폴더·AI 검색·Drive.

#### Documents / 서류함 (`src/components/documents/` + `src/features/documents/`, 2026-08-11 전면 개편)
- **접근 = 교사/admin 전용**: `/documents` 라우트 ProtectedRoute + `documents` RLS(`is_teacher_or_admin`) 이중 차단. 쓰기(수정·삭제)는 **본인+admin만**(RLS) — RLS 차단은 0행이므로 mutation은 `.select('id')` 반환 행 검증
- **데이터 계층 = `src/features/documents/`**: `services/documentService.ts`(fetch/업로드/삭제/열람/폴더, `sanitizeSearchTerm`으로 `.or()` 예약문자 이스케이프, `DOCUMENT_FETCH_LIMIT=2000` 명시 상한+count로 1000행 잘림 감지) + `hooks/useDocumentsQuery.ts`(TanStack Query, `['documents', filters]` 단일 키를 페이지·트리·탭이 공유, invalidate 갱신). **구 `src/hooks/useDocuments.ts`는 삭제됨** — `Document` 타입 단일 출처는 `features/documents/types.ts`
- **저장 모델**: 로컬 업로드 = 비공개 `documents` 버킷 `library/{uid}/...` **상대경로**(+`meta.storage_bucket`), 열람 = signed URL 새 창. 레거시·Drive 행은 http URL 그대로. **폴더는 `meta.directory_path` 가상 경로**라 Storage 물리 이동 없음(EnhancedFileList의 구 물리 이동 로직 제거됨 — 되살리지 말 것)
- **폴더 시스템**: `document_folders` registry(빈 폴더 허용) + `move_document_folder` RPC(admin, 하위 문서 경로까지 원자적 prefix 치환) — **폴더 생성은 교사 전체**(INSERT RLS 개방, 2026-08-11), 이름변경·이동·삭제는 admin 전용
- **단일 뷰 (2026-08-11 사용자 결정으로 탭 전면 제거)**: 구 내 문서/진학자료/문서 관리 탭 폐지 — 교사 전원이 **전체 폴더 트리·전체 문서를 열람**하고(쓰기는 본인+admin, EnhancedFileList 버튼 게이트+RLS 이중), 진학자료는 폴더 경로로, admin 관리 기능은 리스트의 isAdmin 기능(우선 표시 등)으로 흡수(`CollegePrepDocumentList`·`DocumentManagement` 삭제됨). 통합 검색 = DocumentHeader 검색창 1개(파일명·제목·키워드·부서명)+부서+기간(서버 사이드, 300ms 디바운스). **"문서 추가" 버튼은 리스트 카드 툴바에 위치**(사용자 피드백 — EnhancedFileList `headerActions` 슬롯 경유, 페이지 헤더 아님)
- **AI 검색**: `features/documents/services/documentAiSearch.ts` — 공용 `aiChat()`(Solar)로 자연어→검색조건 해석 후 일반 DB 검색 (구 Gemini 클라이언트 키·벡터 검색(document_chunks) 전면 제거, `document_shares` 공유 기능도 테이블째 제거)
- **문서 추가 = `AddDocumentDialog` 단일 진입점**(구 문서 업로드/Drive/Link 버튼 3개 → "문서 추가" 1개, 2026-08-11): 방식 3종(파일 업로드(저장 위치: **Google Drive 기본**, 스페이스기전 서버 저장은 admin 전용 선택지)/Drive에서 가져오기(탐색기 다중선택+링크 붙여넣기+admin 폴더 일괄)/새 Google 문서) + **공통 분류 폼(부서·분류·키워드)이 모든 방식에 적용** — `IntegrationOptions.documentMeta`로 Drive 등록 경로에도 메타 저장(구 구현은 로컬만 메타를 받아 Drive 등록분이 검색에 안 걸렸음). 현재 폴더가 등록 위치(폴더 선택 시 작성 연도 등 자동 경로용 필드는 폼에서 제거됨). task-workflow `link.document_upload` WORK도 이 다이얼로그 사용. 구 `DocumentUpload`·`GoogleDriveLinkDialog`·`GoogleDriveUpload` 삭제됨
- **Drive 저장의 실체**: `VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID` 설정 빌드(현재 설정됨)는 **공용 폴더**에, 미설정이면 업로더 개인 드라이브 "Spacekijun" 폴더에 저장. `supportsAllDrives` 미사용이라 진짜 공유 드라이브(Shared Drive)는 불가 — 파일 **소유권은 업로더 개인**에 귀속. 공유는 업로드 직후 `setFilePermissions`가 걸며 **`type:'domain'`(myschool.hs.kr) + writer로 한정**(2026-08-11 — 구 `type:'anyone'`은 링크만 알면 외부인도 편집 가능했음; `WORKSPACE_DOMAIN` 상수 = `googleDriveServiceNew.ts`). 그 전에 등록된 기존 파일들은 여전히 anyone 권한임(일괄 정리는 별도 과제)

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

#### Documents / 서류함 (`src/components/documents/` + `src/features/documents/`, 2026-08-11 전면 개편)
- 교사/admin 전용(ProtectedRoute+RLS), 데이터 계층=`src/features/documents/`(`documentService.ts`+`useDocumentsQuery.ts`), 저장=비공개 `documents` 버킷 상대경로 / 폴더는 `meta.directory_path` 가상 경로
- 단일 뷰(탭 폐지, 교사 전원 전체 열람·쓰기는 본인+admin), 문서 추가=`AddDocumentDialog` 단일 진입점(파일/Drive/새 Google 문서 + 공통 분류 폼), AI 검색(`documentAiSearch.ts`, 공용 `aiChat()`)
- 상세 = `docs/features/documents.md`
