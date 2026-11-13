/**
 * Course Analyze Feature Configuration
 *
 * 학교 내부 배포(현재) vs 다른 학교 배포(미래) 분기를 위한 feature flag.
 *
 * - `false` (기본): 학교 내부 운영 — DB에서 자동 로드, 파일 업로드/성적 소스 UI 숨김
 * - `true`: 다른 학교 배포 — 파일 업로드, 성적 소스 선택, 데이터 관리 UI 표시
 *
 * 코드/서비스는 모두 보존됨 (UploadZone, GradeSourceSelector, fileUtils 등).
 * 다른 학교에서 활용 시 이 상수만 `true`로 바꾸면 됨.
 */
export const SHOW_FILE_LOADING_UI = false;
