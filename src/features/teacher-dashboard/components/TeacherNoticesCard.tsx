import { CalendarClock, Megaphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDepartmentNotices } from '@/features/notice-board/hooks/useNotices';
import { useNoticeSeen } from '@/features/notice-board/hooks/useNoticeSeen';
import { NoticeDetailDialog } from '@/features/notice-board/components/NoticeDetailDialog';
import { formatPeriod, isNoticeActive, todayStr } from '@/features/notice-board/utils/noticeDates';
import { noticeDeepLinkPath } from '@/features/notice-board/utils/noticeShare';
import type { DepartmentNotice } from '@/features/notice-board/types';
import { DashboardCardShell } from './DashboardCardShell';

export function TeacherNoticesCard({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { data: notices = [] } = useDepartmentNotices();
  const { isUnseen, markSeen } = useNoticeSeen(notices);
  const [detailNotice, setDetailNotice] = useState<DepartmentNotice | null>(null);
  const today = todayStr();
  const activeNotices = useMemo(
    () => notices.filter((notice) => isNoticeActive(notice, today)),
    [notices, today],
  );

  if (activeNotices.length === 0) return null;

  const unseenCount = activeNotices.filter((notice) => isUnseen(notice.id)).length;

  // 대시보드에서 바로 상세 모달을 연다 (공지 페이지로 이동하지 않음)
  const openDetail = (notice: DepartmentNotice) => {
    setDetailNotice(notice);
    markSeen([notice.id]);
  };

  return (
    <>
    <DashboardCardShell
      title="학교 공지"
      icon={Megaphone}
      accent="violet"
      description="현재 게시 중인 부서 공지를 모았습니다."
      badge={unseenCount > 0 ? (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">새 공지 {unseenCount}</span>
      ) : null}
      onAction={() => navigate('/notices')}
      actionLabel="전체 공지 보기"
      className={className}
    >
      <div className="divide-y divide-slate-100">
        {activeNotices.slice(0, 4).map((notice) => {
          const unseen = isUnseen(notice.id);
          return (
            <button
              key={notice.id}
              type="button"
              onClick={() => openDetail(notice)}
              className="teacher-dashboard-row flex w-full items-start gap-3 rounded-lg px-1 py-3 text-left"
            >
              <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${unseen ? 'bg-violet-500' : 'bg-slate-200'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {notice.department}
                  </span>
                  <span className={`truncate text-sm ${unseen ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                    {notice.title}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                  <CalendarClock className="h-3 w-3" /> {formatPeriod(notice)}
                  {notice.author_name && <span>· {notice.author_name}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {activeNotices.length > 4 && (
        <p className="pt-3 text-center text-xs text-slate-400">그 외 {activeNotices.length - 4}개 공지</p>
      )}
    </DashboardCardShell>

    {/* 수정은 공지 페이지에서 — 대시보드에 작성 폼(첨부·Drive)까지 싣지 않는다 */}
    <NoticeDetailDialog
      notice={detailNotice}
      onOpenChange={(open) => {
        if (!open) setDetailNotice(null);
      }}
      onEdit={(notice) => {
        setDetailNotice(null);
        navigate(noticeDeepLinkPath(notice.id));
      }}
    />
    </>
  );
}
