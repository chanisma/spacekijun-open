import { supabase } from '@/integrations/supabase/client';
import type { DocType, DocumentIssue, CreateIssueInput } from '../types';
import type { Json } from '@/integrations/supabase/types';

export const issueService = {
  async listIssues(docTypes: DocType[]): Promise<DocumentIssue[]> {
    const { data, error } = await supabase
      .from('document_issue')
      .select('*')
      .in('doc_type', docTypes)
      .order('issue_no', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as DocumentIssue[];
  },

  async createIssue(input: CreateIssueInput): Promise<string> {
    // p_meta는 RPC 시그니처에 아직 생성 타입이 없어 캐스팅 (create_document_issue 최신 시그니처)
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ data: string; error: { message: string } | null }>)('create_document_issue', {
      p_doc_type: input.doc_type,
      p_title: input.title,
      p_issued_on: input.issued_on,
      p_department: input.department ?? undefined,
      p_students: (input.students ?? []) as unknown as Json,
      p_grade: input.grade ?? undefined,
      p_class_number: input.class_number ?? undefined,
      p_form_data: (input.form_data ?? undefined) as unknown as Json,
      p_remarks: input.remarks ?? undefined,
      p_meta: (input.meta ?? undefined) as unknown as Json,
    });
    if (error) throw error;
    return data;
  },

  async updateIssue(id: string, patch: Partial<CreateIssueInput>): Promise<void> {
    const { error } = await supabase
      .from('document_issue')
      .update({
        title: patch.title,
        issued_on: patch.issued_on,
        department: patch.department,
        students: patch.students as unknown as Json | undefined,
        grade: patch.grade,
        class_number: patch.class_number,
        form_data: patch.form_data as unknown as Json | undefined,
        remarks: patch.remarks,
      })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * 삭제 = 소프트 삭제. 행은 남기고 status만 'cancelled'로 바꾼다(감사 추적·결번 방지).
   * 기존 document_issue_update RLS(작성자/admin)를 그대로 사용 — 별도 정책 불필요.
   */
  async cancelIssue(id: string): Promise<void> {
    const { error } = await supabase
      .from('document_issue')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * 여러 발급을 한 번에 소프트 삭제(개인봉사 배치 일괄 삭제 전용). 이미 취소된
   * 행은 조건에서 제외해 불필요한 갱신을 건너뛴다. RLS는 cancelIssue와 동일 —
   * 호출자가 작성자/admin이 아닌 행이 섞여 있으면 그 행만 조용히 무시된다(supabase
   * update는 RLS로 걸러진 행에 대해 에러를 던지지 않고 매칭되는 행만 갱신한다).
   */
  async cancelIssues(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('document_issue')
      .update({ status: 'cancelled' })
      .in('id', ids)
      .eq('status', 'active');
    if (error) throw error;
  },

  /**
   * 반별 명단만 교체 (다른 반·발급정보 보존). 권한은 서버 RPC가 판정
   * (작성자/admin/그 반 담임). 통합 record 유지 = "통합 저장" 모델.
   */
  async updateClassRoster(
    issueId: string, grade: number, cls: number, students: DocumentIssue['students'],
  ): Promise<void> {
    // RPC가 생성 타입에 아직 없어 캐스팅 (update_volunteer_class_roster)
    const { error } = await (supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)('update_volunteer_class_roster', {
      p_issue_id: issueId,
      p_grade: grade,
      p_class: cls,
      p_students: students as unknown as Json,
    });
    if (error) throw new Error(error.message);
  },

  /**
   * 동아리 1개의 활동(날짜·시간·내용 배열)만 교체. 서버 RPC가 권한(작성자/admin/그
   * 동아리 담당교사)을 판정하고 다른 동아리는 보존한다 → 담당교사가 자기 동아리만 수정.
   */
  async updateClubActivities(
    issueId: string, clubId: string, activities: unknown,
  ): Promise<void> {
    // RPC가 생성 타입에 아직 없어 캐스팅 (update_club_activities)
    const { error } = await (supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)('update_club_activities', {
      p_issue_id: issueId,
      p_club_id: clubId,
      p_activities: activities as unknown as Json,
    });
    if (error) throw new Error(error.message);
  },

  /**
   * 동아리 1개의 확인서 출력 설정(날짜별 참가 attendance + 제외 학생)만 저장.
   * 권한 게이트는 updateClubActivities와 동일(작성자/admin/그 동아리 담당교사).
   */
  async updateClubAttendance(
    issueId: string, clubId: string,
    attendance: Record<string, Record<string, boolean>>, excludedResourceIds: string[],
  ): Promise<void> {
    // RPC가 생성 타입에 아직 없어 캐스팅 (update_club_attendance)
    const { error } = await (supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)('update_club_attendance', {
      p_issue_id: issueId,
      p_club_id: clubId,
      p_attendance: attendance as unknown as Json,
      p_excluded: excludedResourceIds as unknown as Json,
    });
    if (error) throw new Error(error.message);
  },
};
