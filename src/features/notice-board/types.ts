// ========================================
// notice-board 타입 정의
// department_notice 테이블 기반 부서 공지사항
// ========================================

/** 첨부파일 — tasks의 TaskFile과 호환되는 구조 (department_notice.attachments JSONB) */
export interface NoticeAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploaded_at: string;
  uploaded_by: string;
  /** Google Drive 파일 여부 (삭제 시 Drive 원본은 보존) */
  isGoogleDrive?: boolean;
  googleDriveId?: string;
}

export interface DepartmentNotice {
  id: string;
  department: string;
  title: string;
  content: string;
  /** 게시 시작일 (YYYY-MM-DD) */
  start_date: string;
  /** 게시 종료일 (YYYY-MM-DD, inclusive) */
  end_date: string;
  created_by: string;
  author_name: string | null;
  attachments: NoticeAttachment[];
  /**
   * 공지 대상 resource.id. NULL·빈 배열 = 교직원 전체 공개(기본).
   * 값이 있으면 그 사람 + 작성자 + admin 만 볼 수 있다(RLS가 강제).
   * ⚠ 학생은 공지 표 자체를 못 읽으므로 학생 id를 넣어도 도달하지 않는다.
   */
  target_resource_ids: string[] | null;
  /** 이 공지가 알리는 일정 설문(schedule_survey.id) */
  survey_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoticeInput {
  department: string;
  title: string;
  content: string;
  start_date: string;
  end_date: string;
  /** 생략하면 기존 동작(전체 공개)을 유지한다 */
  target_resource_ids?: string[] | null;
  survey_id?: string | null;
}

/** 공지 게시 상태 — active(게시 중) / upcoming(게시 예정) / expired(게시 종료) */
export type NoticeStatus = 'active' | 'upcoming' | 'expired';
