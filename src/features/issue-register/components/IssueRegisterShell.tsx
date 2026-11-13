import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * 머리글 왼쪽 안내 한 줄(선택) — **기능명·설명이 아니라 지금 해야 할 일**만 쓴다
   * (예: 동아리 탭의 "발급 후 각 동아리 행을 펼쳐 활동 내용을 작성합니다").
   */
  hint?: ReactNode;
  /** 누적 발급 건수 (헤더 우측 통계 칩) */
  count: number;
  /** 발급 버튼 라벨 */
  issueLabel: string;
  onIssue: () => void;
  /** 탭/필터 등 헤더 하단 영역 (선택) */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * 발급번호 관리 페이지 공통 셸.
 * 시간표·입시 허브의 디자인 언어(글래스 헤더 카드, brand 액센트, slate gray, 둥근 칩)를 따른다.
 * 머리글에 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1) — 어느 대장인지는 사이드바가 말한다.
 */
export function IssueRegisterShell({
  hint, count, issueLabel, onIssue, toolbar, children,
}: Props) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-slate-50/40 to-transparent">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-5">
        {/* 헤더 — 글래스 카드 */}
        <header
          className={cn(
            'relative overflow-hidden rounded-2xl border border-white/40 bg-white/70 backdrop-blur-md',
            'shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)]',
          )}
        >
          {/* 우상단 ambient brand glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-300/20 blur-3xl"
          />
          <div className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            {hint ? (
              <p className="min-w-0 text-sm text-slate-500 text-pretty">{hint}</p>
            ) : null}

            <div className="ml-auto flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex flex-col items-end leading-none">
                <span className="font-mono text-2xl font-semibold tabular-nums text-slate-800">
                  {count}
                </span>
                <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  발급
                </span>
              </div>
              <Button
                onClick={onIssue}
                className="h-10 gap-1.5 rounded-xl bg-brand-600 px-4 font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                {issueLabel}
              </Button>
            </div>
          </div>

          {toolbar && (
            <div className="relative border-t border-slate-100/80 px-5 py-3 sm:px-6">
              {toolbar}
            </div>
          )}
        </header>

        {children}
      </div>
    </div>
  );
}
