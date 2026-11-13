// ========================================
// 공지 게시 기간 판정 유틸
// date 컬럼은 YYYY-MM-DD 문자열 — 사전순 비교가 곧 날짜 비교
// ========================================

import type { DepartmentNotice, NoticeStatus } from '../types';

/** 로컬(KST) 기준 오늘 날짜를 YYYY-MM-DD로 반환 */
export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNoticeStatus(notice: DepartmentNotice, today: string = todayStr()): NoticeStatus {
  if (today < notice.start_date) return 'upcoming';
  if (today > notice.end_date) return 'expired';
  return 'active';
}

export function isNoticeActive(notice: DepartmentNotice, today: string = todayStr()): boolean {
  return getNoticeStatus(notice, today) === 'active';
}

/** YYYY-MM-DD → M.D 표기 (기간 라벨용) */
export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}.${Number(d)}`;
}

export function formatPeriod(notice: DepartmentNotice): string {
  return `${formatShortDate(notice.start_date)} ~ ${formatShortDate(notice.end_date)}`;
}
