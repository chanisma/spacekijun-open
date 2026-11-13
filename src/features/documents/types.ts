/**
 * 서류함(documents) feature 타입 정의.
 * 구 `src/hooks/useDocuments.ts`의 Document 타입을 승계한 단일 출처 —
 * EnhancedFileList·FolderTree 등 공용 컴포넌트도 이 타입을 사용한다.
 */
export interface Document {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  upload_status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  meta?: {
    // 연결 정보 (작업/이벤트 시스템에서 자동 생성 — 서류함에서 삭제 불가)
    source?: {
      id: string;
      type: 'task' | 'event';
      title: string;
    };
    // 사용자 분류 정보
    department?: string;
    team?: string;
    category?: string;
    description?: string;
    tags?: string[];
    // 가상 폴더 경로 (표시용, '/' 구분)
    directory_path?: string;
    // 업로드 정보
    uploaded_from?: string;
    uploaded_by_user?: boolean;
    upload_source?: 'manual_upload' | 'system_generated';
    upload_date?: string;
    upload_timestamp?: string;
    // 파일 정보
    original_filename?: string;
    storage_filename?: string;
    file_extension?: string;
    original_size?: number;
    /** 로컬 업로드 파일이 저장된 Storage 버킷 (2026-08 신규 업로드 = 'documents' 비공개 버킷) */
    storage_bucket?: string;
    // 검색 관련
    keywords?: string[];
    search_keywords?: string[];
    // Google Drive
    is_google_drive_file?: boolean;
    google_drive_id?: string;
    // 우선 표시
    is_pinned?: boolean;
    // 기타 (레거시 meta 키 다수 — 점진 타이핑)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

/** 업로더 프로필이 조인된 관리자용 문서 행 */
export interface DocumentWithUploader extends Document {
  profiles?: {
    name: string;
    email: string;
  } | null;
}

/** 통합 검색·필터 조건 (탭 간 공유) */
export interface DocumentFilters {
  /** 검색어 — 파일명·제목·부서명·분류·키워드에 걸쳐 검색 */
  q?: string;
  /** 부서 필터 (meta.department 일치) */
  department?: string;
  /** 기간 시작 (created_at 기준) */
  dateFrom?: Date | null;
  /** 기간 끝 (created_at 기준, 그날 23:59까지 포함) */
  dateTo?: Date | null;
}

/** 업로드 메타데이터 (서류함 업로드 다이얼로그 입력) */
export interface DocumentUploadMetadata {
  title?: string;
  description?: string;
  department?: string;
  category?: string;
  creation_year?: string;
  search_keywords?: string[];
  tags?: string[];
}
