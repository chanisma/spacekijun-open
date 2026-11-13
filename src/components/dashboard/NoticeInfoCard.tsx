// ========================================
// 학사 정보 알림 카드 (홈 대시보드)
// 활성(게시 기간 내) 부서 공지를 표시 — 구 dashboard_info_boxes
// '학사 정보 알림' 카드를 대체. 활성 공지가 없으면 렌더하지 않음.
// ========================================

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarRange, Megaphone } from 'lucide-react';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDepartmentNotices } from '@/features/notice-board/hooks/useNotices';
import { useNoticeSeen } from '@/features/notice-board/hooks/useNoticeSeen';
import { isNoticeActive, formatPeriod, todayStr } from '@/features/notice-board/utils/noticeDates';
import { noticeDeepLinkPath } from '@/features/notice-board/utils/noticeShare';

const MAX_VISIBLE = 5;

export function NoticeInfoCard({ className }: { className?: string } = {}) {
  const navigate = useNavigate();
  const { data: notices = [] } = useDepartmentNotices();
  const { isUnseen } = useNoticeSeen(notices);

  const today = todayStr();
  const activeNotices = useMemo(
    () => notices.filter((n) => isNoticeActive(n, today)),
    [notices, today]
  );

  // 활성 공지가 없으면 카드 자체를 표시하지 않음 (부서 북마크와 동일 원칙)
  if (activeNotices.length === 0) return null;

  const visible = activeNotices.slice(0, MAX_VISIBLE);
  const remaining = activeNotices.length - visible.length;

  return (
    <ImprovedCard className={className}>
      <CardHeader className="pb-3 sm:pb-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
              <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                <Megaphone className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent hover:from-indigo-500 hover:to-indigo-600 transition-all duration-200 truncate">
                학사 정보 알림
              </span>
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/notices')}
            className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-indigo-100 hover:text-indigo-600 transition-all duration-200 hover:scale-105"
          >
            <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {visible.map((notice) => {
            const isNew = isUnseen(notice.id);
            return (
              <button
                key={notice.id}
                type="button"
                onClick={() => navigate(noticeDeepLinkPath(notice.id))}
                className="flex w-full items-center gap-2 rounded-xl border border-indigo-100/80 bg-gradient-to-r from-indigo-50/70 to-blue-50/50 p-2.5 text-left transition-all duration-200 hover:shadow-md sm:gap-3 sm:p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Badge
                      variant="outline"
                      className="shrink-0 border-indigo-200 bg-white/70 text-[10px] text-indigo-700 sm:text-[11px]"
                    >
                      {notice.department}
                    </Badge>
                    <p className="truncate text-xs font-semibold text-indigo-900 sm:text-sm">
                      {notice.title}
                    </p>
                    {isNew && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="새 공지" />
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-indigo-600/80 sm:text-xs">
                    <CalendarRange className="h-3 w-3" />
                    {formatPeriod(notice)}
                    {notice.author_name && <span className="ml-1.5">· {notice.author_name}</span>}
                  </p>
                </div>
              </button>
            );
          })}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => navigate('/notices')}
              className="w-full pt-1 text-center text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
            >
              외 {remaining}건 더 보기
            </button>
          )}
        </div>
      </CardContent>
    </ImprovedCard>
  );
}
