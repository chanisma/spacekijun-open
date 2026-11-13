// 공지 게시 상태별 뱃지 라벨/스타일 (상세 모달·리스트 행 공유)
import type { NoticeStatus } from '../types';

export const STATUS_BADGE: Record<NoticeStatus, { label: string; className: string }> = {
  active: { label: '게시 중', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  upcoming: { label: '게시 예정', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  expired: { label: '게시 종료', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};
