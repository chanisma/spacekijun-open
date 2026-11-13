import {
  AlertTriangle,
  Bell,
  CheckSquare,
  Clock,
  FileUp,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NotificationEvent } from '@/hooks/useNotifications';
import { getTimeAgo } from '@/lib/timeUtils';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';

const notificationIcons: Record<string, LucideIcon> = {
  manual: Bell,
  training: GraduationCap,
  duty: Clock,
  document_submission: FileUp,
  task_assigned: CheckSquare,
  task_updated: CheckSquare,
};

export function TeacherNotificationsCard({
  notifications,
  isLoading,
}: {
  notifications: NotificationEvent[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <DashboardCardShell
      title="최근 알림"
      icon={Bell}
      accent="orange"
      description={unreadCount > 0 ? `확인하지 않은 소식이 ${unreadCount}건 있습니다.` : '중요한 변화와 요청을 시간순으로 모았습니다.'}
      badge={unreadCount > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          새 알림 {unreadCount}
        </span>
      ) : null}
      onAction={() => navigate('/notifications')}
      actionLabel="알림 페이지로 이동"
    >
      {isLoading ? (
        <DashboardCardSkeleton />
      ) : notifications.length === 0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center text-center text-slate-500">
          <Bell className="mb-3 h-8 w-8 text-amber-300" />
          <p className="text-sm font-medium">새로운 알림이 없습니다.</p>
        </div>
      ) : (
        <div>
          <div className="divide-y divide-slate-100">
          {notifications.slice(0, 5).map((notification) => {
            const Icon = notificationIcons[notification.type] ?? AlertTriangle;
            const unread = !notification.is_read;

            return (
              <div
                key={notification.id}
                className="teacher-dashboard-row flex items-start gap-3 rounded-lg px-1 py-3"
              >
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                  unread ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{notification.title}</p>
                    {unread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-500" />}
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{notification.message}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{getTimeAgo(notification.created_at)}</span>
                    {notification.sender_name && <span className="truncate">{notification.sender_name}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          {notifications.length > 5 && (
            <p className="pt-3 text-center text-xs text-slate-400">
              그 외 {notifications.length - 5}개 알림
            </p>
          )}
        </div>
      )}
    </DashboardCardShell>
  );
}
