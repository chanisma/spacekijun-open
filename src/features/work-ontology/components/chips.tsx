import { cn } from '@/lib/utils';
import type { ChipTone } from '../model/todayFeed';

/**
 * 칩 색 — 상태 색은 CLAUDE.md §3(완료 에메랄드·진행 블루·예정 슬레이트·취소 로즈·제출 인디고),
 * 출처 색(공문 앰버·일정 틸·서명 바이올렛)은 상태와 겹치지 않는 계열로 따로 둔다.
 * 의미를 가진 색을 장식으로 쓰지 말 것 — 출처 칩에 상태 색을 쓰면 «진행 중»과 «공문»이 같은 색이 된다.
 */
export const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  late: 'bg-rose-50 text-rose-700 font-semibold',
  progress: 'bg-blue-50 text-blue-700',
  wait: 'bg-slate-100 text-slate-600',
  submit: 'bg-indigo-50 text-indigo-700',
  doc: 'bg-amber-50 text-amber-800',
  calendar: 'bg-teal-50 text-teal-800',
  sign: 'bg-violet-50 text-violet-700',
  plain: 'border border-slate-200 bg-white text-slate-600',
};

export function Chip({ tone, children, className }: { tone: ChipTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs', CHIP_TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
