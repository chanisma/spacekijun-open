// 구매 신청 상태 — 라벨/색상/선택 옵션 공용 상수.
// ManagerView·RequesterView·StatusChangePopover가 동일한 정의를 공유한다.
import { PurchaseRequestStatus } from './types';

export const STATUS_LABEL: Record<PurchaseRequestStatus, string> = {
  submitted: '제출됨',
  pending: '검토중',
  approved: '승인',
  completed: '완료',
  rejected: '불가',
};

// 배지 배경/글자 색상 (Tailwind 클래스)
export const STATUS_COLOR: Record<PurchaseRequestStatus, string> = {
  submitted: 'bg-blue-50 text-blue-700',
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-indigo-50 text-indigo-700',
  rejected: 'bg-red-50 text-red-700',
};

// 사유 배너 — 카드 본문에서 사유를 강조할 때 쓰는 테두리 포함 색상
export const STATUS_BANNER_COLOR: Record<PurchaseRequestStatus, string> = {
  submitted: 'bg-blue-50 text-blue-800 border-blue-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
};

// 매니저가 선택 가능한 상태 (라디오 순서)
export const STATUS_OPTIONS: { value: PurchaseRequestStatus; label: string }[] = [
  { value: 'submitted', label: STATUS_LABEL.submitted },
  { value: 'pending', label: STATUS_LABEL.pending },
  { value: 'approved', label: STATUS_LABEL.approved },
  { value: 'completed', label: STATUS_LABEL.completed },
  { value: 'rejected', label: STATUS_LABEL.rejected },
];
