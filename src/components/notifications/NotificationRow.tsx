import React, { useState } from 'react';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type RowTone = 'success' | 'error' | 'warning' | 'info';

/** 안 읽은 알림의 왼쪽 띠 색 — 상태 색 규약(에메랄드 완료 · 로즈 취소 · 앰버 행동 필요 · 블루 정보) */
const TONE_STRIPE: Record<RowTone, string> = {
  success: 'before:bg-emerald-500',
  error: 'before:bg-rose-500',
  warning: 'before:bg-amber-500',
  info: 'before:bg-blue-500',
};

interface NotificationRowProps {
  tone: RowTone;
  icon: React.ReactNode;
  title: string;
  message: string;
  /** 답장 알림의 원문 인용 */
  quote?: string;
  timeLabel: string;
  /** 시각 전체(마우스를 올리면 보인다) */
  timeTitle?: string;
  isRead: boolean;
  badge?: { label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive' };
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    variant?: 'default' | 'success' | 'destructive';
  };
  onMarkAsRead?: () => void;
  onDelete?: () => void;
  isActionLoading?: boolean;
}

/**
 * 알림 목록의 한 줄. 카드 격자 대신 시간 순으로 훑어 읽기 위한 행이다.
 * - 본문은 두 줄까지 보이고, 행을 누르면 전체가 펼쳐진다(긴 쪽지·답장).
 * - 읽음·삭제는 데스크톱에서는 마우스를 올렸을 때, 터치 기기에서는 항상 보인다.
 */
export function NotificationRow({
  tone,
  icon,
  title,
  message,
  quote,
  timeLabel,
  timeTitle,
  isRead,
  badge,
  primaryAction,
  onMarkAsRead,
  onDelete,
  isActionLoading,
}: NotificationRowProps) {
  const [expanded, setExpanded] = useState(false);
  // 두 줄을 넘길 만한 본문만 펼침 표시를 단다(정확한 측정 대신 길이·줄바꿈 기준)
  const expandable = message.length > 90 || message.includes('\n') || (quote?.length ?? 0) > 60;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <li
      className={cn(
        'group relative flex gap-3 px-3 py-3 sm:px-4 transition-colors',
        // 안 읽은 알림 = 왼쪽 색 띠 + 옅은 바탕
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        isRead ? 'before:bg-transparent hover:bg-slate-50' : cn(TONE_STRIPE[tone], 'bg-blue-50/40 hover:bg-blue-50/70'),
        expandable && 'cursor-pointer',
      )}
      onClick={expandable ? () => setExpanded((v) => !v) : undefined}
    >
      {/* 아이콘 */}
      <div
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white',
          isRead && 'opacity-60',
        )}
      >
        {icon}
      </div>

      {/* 본문 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="안 읽음" />}
            <h3
              className={cn(
                'min-w-0 break-words text-sm leading-snug',
                isRead ? 'font-medium text-slate-600' : 'font-semibold text-slate-900',
              )}
            >
              {title}
            </h3>
            {badge && (
              <Badge variant={badge.variant || 'outline'} className="text-[11px] font-normal">
                {badge.label}
              </Badge>
            )}
          </div>
          <time className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-slate-500" title={timeTitle}>
            {timeLabel}
          </time>
        </div>

        {quote && (
          <p
            className={cn(
              'mt-1 break-words border-l-2 border-slate-200 pl-2 text-xs text-slate-500',
              !expanded && 'line-clamp-1',
            )}
            title={quote}
          >
            {quote}
          </p>
        )}
        {message && (
          <p
            className={cn(
              'mt-1 break-words text-sm leading-relaxed',
              isRead ? 'text-slate-500' : 'text-slate-700',
              expanded ? 'whitespace-pre-line' : 'line-clamp-2',
            )}
          >
            {message}
          </p>
        )}

        {/* 하단: 주 행동 · 펼치기 · 읽음/삭제 */}
        <div className="mt-2 flex items-center gap-2">
          {primaryAction && (
            <Button
              size="sm"
              onClick={(e) => {
                stop(e);
                primaryAction.onClick();
              }}
              disabled={primaryAction.loading}
              variant={primaryAction.variant === 'destructive' ? 'destructive' : 'outline'}
              className={cn(
                'h-10 sm:h-8 px-3 text-xs',
                primaryAction.variant === 'success'
                  ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white'
                  : primaryAction.variant !== 'destructive' && 'border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800',
              )}
            >
              {primaryAction.label}
            </Button>
          )}
          {expandable && (
            <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
              {expanded ? '접기' : '더 보기'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
            </span>
          )}

          <div
            className={cn(
              'ml-auto flex items-center gap-0.5',
              // 마우스가 있는 기기에서만 숨겨 둔다 — 터치에서는 hover 가 없어 영영 못 찾는다
              '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100',
              'transition-opacity',
            )}
          >
            {onMarkAsRead && !isRead && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  stop(e);
                  onMarkAsRead();
                }}
                className="h-10 sm:h-8 gap-1 px-2.5 sm:px-2 text-xs text-slate-600 hover:text-emerald-700"
                disabled={isActionLoading}
                title="읽음 표시"
              >
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">읽음</span>
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  stop(e);
                  onDelete();
                }}
                className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                disabled={isActionLoading}
                title="삭제"
                aria-label="삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
