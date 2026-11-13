// ========================================
// 내 할 일 칩 — 목록·요청·계획표가 같은 모양을 쓴다 (2026-10-05 시각 정리)
//
// 칩은 **알려야 할 것에만** 쓴다(지남·오늘·제출·회차·완료). 평범한 마감일은 칩이 아니라 글자다 —
// 모든 행에 칩이 붙으면 화면 전체가 고르게 시끄러워져 정작 예외가 묻힌다.
// 모양 하나 = 높이 20px · 11px · 완전한 원 · 옅은 배경 + 같은 색 계열 inset 테두리.
// 글자 대비는 전부 4.5:1 이상(700 단계 글자 on 50 단계 배경).
// ========================================

export const INBOX_CHIP = 'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none ring-1 ring-inset';

export const INBOX_CHIP_TONE = {
  /** 마감 지남 — 오늘보다 한 단계 진하게(색이 아니라 무게로 가른다) */
  overdue: 'bg-amber-100 font-semibold text-amber-900 ring-amber-300',
  today: 'bg-amber-50 text-amber-800 ring-amber-200',
  /** 인디고 = 제출·요청(앱 색 규약) */
  request: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-slate-50 text-slate-600 ring-slate-200',
  /** 로즈 = 취소(앱 색 규약) */
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  notice: 'border-0 bg-amber-50 text-amber-800 ring-amber-200',
} as const;
