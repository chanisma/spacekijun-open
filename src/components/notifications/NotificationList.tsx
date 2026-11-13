import React, { useMemo, useState } from 'react';
import { CardContent, CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Bell, AlertTriangle, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NotificationEvent } from '@/hooks/useNotifications';
import { NotificationItem } from './NotificationItem';

interface NotificationListProps {
  notifications: NotificationEvent[];
  loading: boolean;
  error: Error | null;
  onMarkAsRead: (notificationId: string) => void;
  onDelete?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  markAsReadLoading?: boolean;
  markAllAsReadLoading?: boolean;
  deleteLoading?: boolean;
}

type Filter = 'all' | 'unread';

const GROUP_ORDER = ['오늘', '어제', '지난 7일', '이전'] as const;
type GroupLabel = (typeof GROUP_ORDER)[number];

/** 알림을 받은 날짜로 묶는다(브라우저 현지 시각 = 한국 시간 기준 자정) */
function groupLabelOf(createdAt: string, todayStart: number): GroupLabel {
  const t = new Date(createdAt).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  if (t >= todayStart) return '오늘';
  if (t >= todayStart - DAY) return '어제';
  if (t >= todayStart - 6 * DAY) return '지난 7일';
  return '이전';
}

export const NotificationList = ({
  notifications,
  loading,
  error,
  onMarkAsRead,
  onDelete,
  onMarkAllAsRead,
  markAsReadLoading,
  markAllAsReadLoading,
  deleteLoading
}: NotificationListProps) => {
  const [filter, setFilter] = useState<Filter>('all');

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const groups = useMemo(() => {
    const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const map = new Map<GroupLabel, NotificationEvent[]>();
    for (const n of visible) {
      const label = groupLabelOf(n.created_at, todayStart);
      const list = map.get(label);
      if (list) list.push(n);
      else map.set(label, [n]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [notifications, filter]);

  if (error) {
    return (
      <ImprovedCard>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-medium mb-2">알림을 불러올 수 없습니다</h3>
            <p className="text-muted-foreground mb-4">문제가 계속되면 관리자에게 문의하세요.</p>
            <Button onClick={() => window.location.reload()}>새로고침</Button>
          </div>
        </CardContent>
      </ImprovedCard>
    );
  }

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: notifications.length },
    { key: 'unread', label: '안 읽음', count: unreadCount },
  ];

  return (
    <ImprovedCard className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b px-3 py-2.5 sm:px-4">
        <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'inline-flex h-10 sm:h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                filter === tab.key
                  ? 'bg-white font-medium text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-full px-1.5 text-center text-xs tabular-nums',
                  tab.key === 'unread' && tab.count > 0
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {onMarkAllAsRead && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllAsRead}
            disabled={unreadCount === 0 || markAllAsReadLoading || loading}
            className="h-10 sm:h-8 shrink-0 gap-1.5 px-3 text-sm text-slate-600 hover:text-emerald-700"
            title={unreadCount === 0 ? '안 읽은 알림이 없습니다' : `안 읽은 알림 ${unreadCount}건을 읽음으로 표시`}
          >
            <CheckCheck className="h-4 w-4" />
            모두 읽음
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <ul className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
                <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-4 w-1/2 rounded bg-slate-200" />
                  <div className="h-3 w-5/6 rounded bg-slate-100" />
                </div>
              </li>
            ))}
          </ul>
        ) : groups.length === 0 ? (
          <div className="text-center py-14 px-4">
            <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <h3 className="text-base font-medium mb-1">
              {filter === 'unread' && notifications.length > 0 ? '안 읽은 알림이 없습니다' : '알림이 없습니다'}
            </h3>
            <p className="text-sm text-muted-foreground">새로운 알림이 있으면 여기에 표시됩니다.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <h2 className="border-b bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500">
                {group.label}
                <span className="ml-1.5 tabular-nums text-slate-400">{group.items.length}</span>
              </h2>
              <ul className="divide-y">
                {group.items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={onMarkAsRead}
                    onDelete={onDelete}
                    isLoading={markAsReadLoading}
                    isDeleting={deleteLoading}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </ImprovedCard>
  );
};
