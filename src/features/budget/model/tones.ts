// 예산 화면의 의미 색 — 한 곳에서 정한다(CLAUDE.md §3: 의미 색을 장식으로 재사용하지 말 것)
// 막대: 원인행위(진한 파랑) · 남은 계획(연한 파랑) · 미배정(회색) · 계획 초과(로즈)
export const BAR_COLORS = {
  wonin: 'bg-blue-600',
  plan: 'bg-blue-300',
  unassigned: 'bg-slate-200',
  over: 'bg-rose-400',
} as const;

// 사업 종류 배지
export const KIND_TONE = {
  purpose: 'border-violet-200 bg-violet-50 text-violet-700',
  total: 'border-sky-200 bg-sky-50 text-sky-700',
  basic: 'border-slate-200 bg-slate-50 text-slate-600',
} as const;

// 품의 차수 상태(구매 신청 «품의 정리» — purchase_order_batches.status)
export const BATCH_STATUS_LABEL: Record<string, string> = { draft: '작성 중', submitted: '품의 완료', purchased: '구매 완료' };
