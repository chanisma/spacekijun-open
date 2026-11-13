/**
 * 면접 준비 — 화면 부품.
 *
 * 디자인 어휘는 업무 관리 탭과 같다(CLAUDE.md "업무 관리 탭들의 디자인 어휘는 하나다"):
 * 툴바 카드 · 콘텐츠 카드 + 상단 액센트 바 · 세그먼트 알약 · 점선 빈 상태 · slate 팔레트.
 * **판정은 여기 두지 않는다** — `../utils.ts` 가 갖는다.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, FileText, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InterviewCoverage } from '../../../../supabase/functions/_shared/interviewPrep';

// ---------------------------------------------------------------------------
// 루브릭 점수
// ---------------------------------------------------------------------------

/**
 * 0~4 점을 **숫자가 아니라 점**으로 그린다.
 *
 * 숫자로 적으면 학생이 그것을 성적으로 읽고 합산하려 든다(0~4 는 서열 척도라
 * 더하면 없는 정밀도가 생긴다). 점 표시는 "어느 항목이 약한가"만 전달한다.
 * 색만으로 구분되지 않도록 `aria-label` 에 수치를 함께 싣는다.
 */
export function RubricDots({ score, label, className }: { score: number; label?: string; className?: string }) {
  const tone = score >= 3 ? 'bg-emerald-500' : score >= 2 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 align-middle', className)}
      role="img"
      aria-label={`${label ? `${label} ` : ''}4점 중 ${score}점`}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 rounded-full', i < score ? tone : 'bg-slate-200')}
        />
      ))}
    </span>
  );
}

/** 기준 한 줄(이름 + 점) — 목록·요약에서 반복 사용. */
export function RubricRow({ label, score }: { label: string; score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className="truncate">{label}</span>
      <RubricDots score={score} label={label} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// 근거 기록 칩
// ---------------------------------------------------------------------------

/**
 * 질문이 어느 기록에서 나왔는지, 그 원문이 무엇인지.
 *
 * **같은 화면에서 펼친다** — 면접 준비는 "내 생기부에 뭐라고 적혔더라"를 확인하는
 * 데서 시작한다. 새 탭·모달로 빼면 모바일에서 맥락이 끊기고, 데스크톱에서는
 * 모달 안 모달이 된다.
 */
export function SourceChip({ label, excerpt }: { label: string | null; excerpt: string | null }) {
  const [open, setOpen] = useState(false);
  if (!label) return null;
  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={!excerpt}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={excerpt ? open : undefined}
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600',
          excerpt && 'hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
        )}
      >
        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate" title={label}>{label}</span>
        {excerpt && (
          <ChevronDown
            className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        )}
      </button>
      {open && excerpt && (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
          {excerpt}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 콘텐츠 카드 — 상단 1px 상태 액센트 바
// ---------------------------------------------------------------------------

export type CardTone = 'idle' | 'active' | 'done';

const ACCENT: Record<CardTone, string> = {
  idle: 'bg-slate-200',
  active: 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400',
  done: 'bg-emerald-500',
};

export function AccentCard({
  tone = 'idle', className, children,
}: { tone?: CardTone; className?: string; children: ReactNode }) {
  return (
    <section className={cn('relative overflow-hidden rounded-2xl border bg-card shadow-sm', className)}>
      <span className={cn('absolute inset-x-0 top-0 h-1', ACCENT[tone])} aria-hidden="true" />
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 세그먼트 알약
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> { value: T; label: string; count?: number }

export function SegmentFilter<T extends string>({
  value, options, onChange, ariaLabel,
}: { value: T; options: SegmentOption<T>[]; onChange: (value: T) => void; ariaLabel: string }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === option.value
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {option.label}
          {typeof option.count === 'number' && (
            <span className="ml-1 text-[10px] text-slate-400">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 빈 상태
// ---------------------------------------------------------------------------

export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
        {icon ?? <MessageCircleQuestion className="h-7 w-7" aria-hidden="true" />}
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 커버리지
// ---------------------------------------------------------------------------

/**
 * "활동 54개 중 17개를 다뤘다".
 *
 * **활동 수로 센다**(질문 수가 아니다) — 한 활동만 열 번 물은 학생이 "열 개를
 * 다뤘다"로 보이면 이 지표가 답해야 할 질문("무엇이 아직 준비되지 않았나")을 잃는다.
 */
export function CoverageBar({ coverage, className }: { coverage: InterviewCoverage; className?: string }) {
  if (!coverage.total) return null;
  const percent = Math.round((coverage.covered / coverage.total) * 100);
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-semibold text-slate-700">다룬 활동</span>
        <span className="text-[11px] text-slate-500">
          활동 {coverage.total}개 중 <strong className="text-slate-700">{coverage.covered}개</strong> · {percent}%
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`전체 활동 ${coverage.total}개 중 ${coverage.covered}개에서 질문을 받았습니다`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {coverage.byGrade.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {coverage.byGrade.map((bucket) => (
            <li key={bucket.grade ?? 'none'} className="text-[11px] text-slate-500">
              {bucket.grade ? `${bucket.grade}학년` : '학년 미상'}
              <span className="ml-1 text-slate-400">{bucket.covered}/{bucket.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 툴바 카드
// ---------------------------------------------------------------------------

export function Toolbar({
  icon, title, summary, children,
}: { icon: ReactNode; title: string; summary?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-2.5 shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{title}</span>
        {summary && <span className="block truncate text-[10px] text-slate-400">{summary}</span>}
      </span>
      {children}
    </div>
  );
}
