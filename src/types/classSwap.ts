/**
 * Type definitions for class swap functionality
 */

export type ClassSwapStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ClassSwapMeta {
  requester_name?: string;
  requester_section_name?: string;
  approver_name?: string;
  approver_section_name?: string;
  grade?: number | string;
  class?: number | string;
  reason?: string;
  rejection_reason?: string;
  type?: 'swap' | 'substitute'; // 교체 vs 대체 구분
  /**
   * 이 요청을 만든 결강 일정(meeting.id) — 출장·개인일정의 「결강 처리」에서 보낸 요청.
   * 출처 표시·일정 삭제 경고에만 쓴다. 처리 상태는 날짜·교시로 판정한다(`src/lib/absenceLessons.ts`).
   */
  absence_meeting_id?: string;
  /** 결강 사유 구분 — 받는 쪽 목록의 배지. 개인일정의 제목·내용은 싣지 않는다 */
  absence_kind?: 'event' | 'personal';
}

export interface ClassSwap {
  id: string;
  requester_swap_date: string; // YYYY-MM-DD format - date when requester teaches approver's class
  approver_swap_date: string; // YYYY-MM-DD format - date when approver teaches requester's class

  // Requester info
  requester_resource_id: string;
  requester_section_id: string;
  requester_original_weekday: number; // 1-7
  requester_original_period: number; // 1-8

  // Approver info
  approver_resource_id: string;
  approver_section_id: string;
  approver_original_weekday: number;
  approver_original_period: number;

  // Status
  status: ClassSwapStatus;

  // Metadata
  meta: ClassSwapMeta;

  // Timestamps
  requested_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SwappedClassInfo {
  section_id: string;
  section_name: string;
  swapped_with: string; // Teacher name
  swap_id: string;
  is_swapped: true;
}

export interface CreateClassSwapRequest {
  requester_swap_date: string;
  approver_swap_date: string;
  requester_resource_id: string;
  requester_section_id: string;
  requester_original_weekday: number;
  requester_original_period: number;
  approver_resource_id: string;
  approver_section_id: string;
  approver_original_weekday: number;
  approver_original_period: number;
  meta: ClassSwapMeta;
}

export interface UpdateClassSwapStatus {
  status: ClassSwapStatus;
  rejection_reason?: string;
}
