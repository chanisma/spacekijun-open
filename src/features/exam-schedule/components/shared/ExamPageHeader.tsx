import React from 'react';
import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { cn } from '@/lib/utils';

/**
 * 시험 시간표 기능 전반(목록·새 생성·모의고사)에서 공유하는 페이지 헤더.
 * - 좌측: 아이콘 + 제목 + 설명 — **선택**. 목록(기능 첫 화면)에서는 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
 *   새 생성·상세처럼 "어느 흐름·어느 시간표인가"를 말해야 하는 하위 화면만 제목을 넘긴다.
 * - 우측: 컨텍스트 액션 버튼(actions)
 * - children: 제목 줄 아래 헤더 내부 영역 (정규 위저드의 단계 파이프라인 등)
 */
export function ExamPageHeader({
  title,
  description,
  icon,
  iconClassName = 'bg-blue-50 text-blue-600',
  actions,
  children,
}: {
  title?: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconClassName?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
      <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
        <div className="flex items-center justify-between gap-2">
          {title && (
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
            <div
              className={cn(
                'hidden sm:flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0',
                iconClassName,
              )}
            >
              {icon}
            </div>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 leading-tight truncate">
                {title}
              </h1>
              {description && (
                <p className="text-xs sm:text-sm text-slate-500 leading-tight mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>
          )}
          {actions && (
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">{actions}</div>
          )}
        </div>
        {children && (
          <div className="mt-3 border-t border-slate-200/70 pt-3">{children}</div>
        )}
      </CardHeader>
    </ImprovedCard>
  );
}
