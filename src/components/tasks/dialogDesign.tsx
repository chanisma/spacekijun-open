// ========================================
// 내 할 일 모달 공통 디자인 부품 (2026-08-12)
// 기준 = TaskDetailDialog (2026-08-11 오버홀). 규약:
// - DialogContent p-0 + 헤더(border-b, 그라데이션) / 본문(px-4 sm:px-6) / 푸터(border-t) 3단
// - 섹션 헤더 = SectionLabel (아이콘 + uppercase 11px 마이크로 라벨)
// - 동작 버튼은 전부 푸터에, 전부 ghost(h-8 text-xs + 아이콘): 파괴적=rose, 나머지=slate.
//   단 폼 모달의 제출(저장) 버튼만 solid primary — 주행동은 시각적으로 남긴다
// - 상태는 텍스트 대신 색: 에메랄드=완료, 블루=진행중(업무 active), 슬레이트=진행(task pending, 구 '대기'), 로즈=취소, 인디고=제출
// ========================================

import { cn } from '@/lib/utils';

/** 헤더 컨테이너 — DialogHeader에 그대로 넘긴다 */
export const DIALOG_HEADER_CLASS =
  'space-y-0 border-b bg-gradient-to-b from-slate-50/80 to-transparent px-4 pb-4 pt-4 sm:px-6 sm:pt-5';

/** 푸터 컨테이너 */
export const DIALOG_FOOTER_CLASS =
  'flex justify-end gap-1.5 border-t bg-slate-50/50 px-4 py-3 sm:px-6';

/** 푸터 ghost 버튼 — variant="ghost"와 함께 사용 */
export const FOOTER_BUTTON_CLASS = 'h-8 gap-1.5 px-3 text-xs';
export const FOOTER_NEUTRAL_CLASS = 'text-slate-600 hover:bg-slate-100 hover:text-slate-800';
export const FOOTER_DESTRUCTIVE_CLASS = 'text-rose-600 hover:bg-rose-50 hover:text-rose-700';

/** 섹션 헤더 — 아이콘 + 마이크로 라벨 (+ 우측 trailing 슬롯) */
export function SectionLabel({
  icon: Icon,
  children,
  trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {children}
      </span>
      {trailing}
    </div>
  );
}

/** 제목 옆 작은 아이콘 칩 (파일 제출·수정 폼 등 헤더용) */
export function TitleIconChip({
  icon: Icon,
  tone = 'blue',
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'emerald' | 'indigo';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  } as const;
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1', tones[tone])}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
