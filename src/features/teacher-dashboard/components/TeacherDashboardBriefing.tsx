import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  Sparkles,
  Tags,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { useAcademicTerm, getTermWeekInfo } from '@/hooks/useAcademicTerm';
import { cn } from '@/lib/utils';
import type { NotificationEvent } from '@/hooks/useNotifications';
import type { MyTasksResponse } from '@/types/tasks';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';
import { isMyTaskCompleted } from '@/lib/taskStatus';

interface TeacherDashboardBriefingProps {
  myTasksData: MyTasksResponse | null | undefined;
  currentResourceId: string | undefined;
  notifications: NotificationEvent[];
}

function getGreeting(hour: number) {
  if (hour < 11) return '좋은 아침입니다';
  if (hour < 17) return '좋은 오후입니다';
  return '오늘도 수고 많으셨습니다';
}

export function TeacherDashboardBriefing({
  myTasksData,
  currentResourceId,
  notifications,
}: TeacherDashboardBriefingProps) {
  const { profile, isTeacherView, teacherPreviewTags } = useAuth();
  const resourceIds = currentResourceId && !isTeacherView ? [currentResourceId] : [];
  const { data: assignments } = useResourceTagAssignments(resourceIds);
  const actualTags = currentResourceId
    ? (assignments?.get(currentResourceId) ?? []).map((tag) => tag.name)
    : [];
  const visibleTags = isTeacherView ? teacherPreviewTags : actualTags;
  const now = new Date();
  // 학사력에 학기 기간이 설정돼 있으면 "N학기 M주차"(개학 전엔 D-일수)를 날짜 옆에 표시
  const { data: academicTermSetting } = useAcademicTerm();
  const termWeekInfo = getTermWeekInfo(academicTermSetting, now);
  const termWeekLabel =
    academicTermSetting && termWeekInfo
      ? termWeekInfo.kind === 'week'
        ? `${academicTermSetting.semester}학기 ${termWeekInfo.week}주차`
        : `${academicTermSetting.semester}학기 개학 D-${termWeekInfo.daysUntil}`
      : null;
  const dateLabel = now.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const mobileDateLabel = now.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const activeTasks = (myTasksData?.assigned_tasks ?? []).filter(
    (task) => !isMyTaskCompleted(task, currentResourceId),
  );
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const overdueTasks = activeTasks.filter((task) => {
    // 다중 마감이면 다음 회차 기준(전 회차가 지나도 다음이 남아 있으면 지연 아님)
    const due = getTaskDeadlineInfo(task).effective ?? task.due_date;
    if (!due) return false;
    return new Date(due).getTime() < todayStart;
  }).length;
  const unreadNotifications = notifications.filter((notification) => !notification.is_read).length;
  const metrics = [
    {
      label: '진행할 업무',
      mobileLabel: '업무',
      value: activeTasks.length,
      icon: BriefcaseBusiness,
      surface: 'border-sky-100 bg-sky-50/80',
      iconTone: 'bg-white text-sky-700 ring-sky-100',
      valueTone: 'text-sky-950',
    },
    {
      label: '기한 초과',
      mobileLabel: '초과',
      value: overdueTasks,
      icon: AlertTriangle,
      surface: overdueTasks > 0
        ? 'border-amber-200 bg-amber-50/90'
        : 'border-slate-200 bg-slate-50/80',
      iconTone: overdueTasks > 0
        ? 'bg-white text-amber-700 ring-amber-100'
        : 'bg-white text-slate-500 ring-slate-200',
      valueTone: overdueTasks > 0 ? 'text-amber-950' : 'text-slate-800',
    },
    {
      label: '읽지 않은 알림',
      mobileLabel: '미열람',
      value: unreadNotifications,
      icon: Bell,
      surface: unreadNotifications > 0
        ? 'border-violet-100 bg-violet-50/80'
        : 'border-slate-200 bg-slate-50/80',
      iconTone: unreadNotifications > 0
        ? 'bg-white text-violet-700 ring-violet-100'
        : 'bg-white text-slate-500 ring-slate-200',
      valueTone: unreadNotifications > 0 ? 'text-violet-950' : 'text-slate-800',
    },
  ];

  return (
    <section className="teacher-dashboard-briefing teacher-dashboard-surface col-span-full px-4 py-4 sm:px-6 sm:py-6 lg:px-7">
      <div className="relative z-[1] grid items-center gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.72fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-sky-700">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-sky-100 sm:h-7 sm:w-7">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              오늘의 브리핑
            </span>
            <span className="hidden h-3.5 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span className="sm:hidden">{mobileDateLabel}</span>
              <span className="hidden sm:inline">{dateLabel}</span>
              {termWeekLabel && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {termWeekLabel}
                </span>
              )}
            </span>
          </div>

          <h1 className="mt-3 text-xl font-bold tracking-[-0.035em] text-slate-950 sm:mt-4 sm:text-[28px]">
            {getGreeting(now.getHours())}, {profile?.name ? `${profile.name} 선생님` : '선생님'}.
          </h1>
          <p className="mt-2 hidden max-w-xl text-sm leading-6 text-slate-500 sm:block">
            오늘 처리할 항목과 학교 운영 정보를 한 흐름에서 확인하세요.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
            {isTeacherView && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 sm:gap-1.5 sm:px-2.5 sm:text-xs">
                <Eye className="h-3 w-3" /> 역할 미리보기
              </span>
            )}
            {visibleTags.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 sm:gap-1.5 sm:px-2.5 sm:text-xs">
                <Tags className="h-3 w-3" />
                <span className="sm:hidden">일반 교사</span>
                <span className="hidden sm:inline">일반 교사 · 태그 없음</span>
              </span>
            ) : visibleTags.slice(0, 4).map((tagName, index) => (
              <span
                key={tagName}
                className={cn(
                  'rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm shadow-slate-200/40 sm:px-2.5 sm:text-xs',
                  index >= 2 ? 'hidden sm:inline-flex' : 'inline-flex',
                )}
              >
                {tagName}
              </span>
            ))}
            {visibleTags.length > 2 && (
              <span className="text-[11px] font-medium text-slate-400 sm:hidden">
                +{visibleTags.length - 2}
              </span>
            )}
            {visibleTags.length > 4 && (
              <span className="hidden text-xs font-medium text-slate-400 sm:inline">
                +{visibleTags.length - 4}
              </span>
            )}
          </div>
          {isTeacherView && (
            <p className="mt-3 hidden text-xs text-slate-400 sm:block">
              카드 구성만 태그 기준으로 미리보기하며 일정·업무·알림은 관리자 계정 데이터입니다.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {metrics.map(({ label, mobileLabel, value, icon: Icon, surface, iconTone, valueTone }) => (
            <div
              key={label}
              className={cn(
                'teacher-dashboard-metric rounded-xl border px-2 py-2 sm:rounded-2xl sm:px-3.5 sm:py-3.5',
                surface,
              )}
            >
              <div className="flex items-center justify-between gap-1 sm:gap-2">
                <span className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-lg ring-1 sm:h-8 sm:w-8 sm:rounded-xl',
                  iconTone,
                )}>
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
                <p className={cn(
                  'text-lg font-bold tracking-[-0.04em] tabular-nums sm:text-2xl',
                  valueTone,
                )}>
                  {value}
                </p>
              </div>
              <p className="mt-1 truncate text-[10px] font-semibold text-slate-600 sm:mt-3 sm:text-xs">
                <span className="sm:hidden">{mobileLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
