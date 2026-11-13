import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import {
  Bell,
  ArrowRight,
  CheckSquare,
  Clock,
  MapPin,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { getTimeAgo } from '@/lib/timeUtils';
import { DashboardInfoCard } from '@/components/dashboard/DashboardInfoCard';
import { NoticeInfoCard } from '@/components/dashboard/NoticeInfoCard';
import { TeacherWeeklyScheduleCard } from '@/components/dashboard/cards/TeacherWeeklyScheduleCard';
import { TeacherTodayTimetableCard } from '@/components/dashboard/cards/TeacherTodayTimetableCard';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';
import { getMyTaskStatus, isMyTaskCompleted } from '@/lib/taskStatus';
import { ActivityProposalHomeCard } from '@/features/creative-activities/components/ActivityProposalHomeCard';

export interface TeacherHomeLegacyProps {
  myTasksData: any;
  currentResourceId: string | undefined;
  loadingTasks: boolean;
  notifications: any[];
  loadingNotifications: boolean;
}

/**
 * 대시보드의 교사 전용 영역.
 * 나의 업무 카드, 최근 알림 카드, DashboardInfoCard를 묶어 렌더합니다.
 */
export const TeacherHomeLegacy = ({
  myTasksData,
  currentResourceId,
  loadingTasks,
  notifications,
  loadingNotifications,
}: TeacherHomeLegacyProps) => {
  const navigate = useNavigate();
  const [showAllTasks, setShowAllTasks] = React.useState(false);

  const activeTasks = (myTasksData?.assigned_tasks || []).filter(
    (task: any) => !isMyTaskCompleted(task, currentResourceId),
  );

  const sortedActiveTasks = [...activeTasks].sort((a: any, b: any) => {
    // 다중 마감이면 다음 회차 기준 정렬
    const aDue = getTaskDeadlineInfo(a).effective ?? a.due_date;
    const bDue = getTaskDeadlineInfo(b).effective ?? b.due_date;
    if (aDue && bDue) {
      return new Date(aDue).getTime() - new Date(bDue).getTime();
    }
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return 0;
  });

  const noActiveTasks = !myTasksData?.assigned_tasks || activeTasks.length === 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-sm';
      case 'in_progress':
        return 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 shadow-sm';
      case 'cancelled':
        return 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200 shadow-sm';
      default:
        return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'manual':
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 shadow-sm">
            <Bell className="h-4 w-4 text-white" />
          </div>
        );
      case 'training':
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-400 to-pink-600 shadow-sm">
            <MapPin className="h-4 w-4 text-white" />
          </div>
        );
      case 'duty':
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 shadow-sm">
            <Clock className="h-4 w-4 text-white" />
          </div>
        );
      case 'document_submission':
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-sm">
            <ExternalLink className="h-4 w-4 text-white" />
          </div>
        );
      case 'task_assigned':
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-green-400 to-green-600 shadow-sm">
            <CheckSquare className="h-4 w-4 text-white" />
          </div>
        );
      case 'task_updated':
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 shadow-sm">
            <CheckSquare className="h-4 w-4 text-white" />
          </div>
        );
      default:
        return (
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
        );
    }
  };

  return (
    <>
      <TeacherWeeklyScheduleCard
        myTasksData={myTasksData}
        currentResourceId={currentResourceId}
      />
      <TeacherTodayTimetableCard currentResourceId={currentResourceId} />
      <ActivityProposalHomeCard className="teacher-dashboard-v2 col-span-full" />
      {/* 나의 업무 */}
      <ImprovedCard>
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
                <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-green-500 to-green-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                  <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent hover:from-green-500 hover:to-green-600 transition-all duration-200 truncate">
                  나의 업무
                </span>
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/tasks/mine')}
              className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-green-100 hover:text-green-600 transition-all duration-200 hover:scale-105"
            >
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTasks ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg animate-pulse">
                  <div className="w-4 h-4 bg-gray-300 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : noActiveTasks ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>할당된 업무가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(showAllTasks ? sortedActiveTasks : sortedActiveTasks.slice(0, 4)).map((task: any) => {
                const taskStatus = getMyTaskStatus(task, currentResourceId);

                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all duration-200 hover:shadow-md ${getStatusColor(taskStatus)}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-xs sm:text-sm line-clamp-1 ${
                        taskStatus === 'completed' ? 'text-green-800'
                          : taskStatus === 'in_progress' ? 'text-blue-800'
                            : taskStatus === 'cancelled' ? 'text-red-800'
                              : 'text-gray-800'
                      }`}>{task.title}</p>
                      <p className={`text-xs line-clamp-1 mt-1 ${
                        taskStatus === 'completed' ? 'text-green-600'
                          : taskStatus === 'in_progress' ? 'text-blue-600'
                            : taskStatus === 'cancelled' ? 'text-red-600'
                              : 'text-gray-600'
                      }`}>
                        <span className="truncate">{task.event_name} • {task.event_description || '설명 없음'}</span>
                      </p>
                      {(getTaskDeadlineInfo(task).effective ?? task.due_date) && (
                        <p className={`text-xs mt-1 ${
                          taskStatus === 'completed' ? 'text-green-500'
                            : taskStatus === 'in_progress' ? 'text-blue-500'
                              : taskStatus === 'cancelled' ? 'text-red-500'
                                : 'text-gray-500'
                        }`}>
                          마감: {new Date(getTaskDeadlineInfo(task).effective ?? task.due_date!).toLocaleDateString('ko-KR')}
                        </p>
                      )}
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      taskStatus === 'completed' ? 'bg-green-500'
                        : taskStatus === 'in_progress' ? 'bg-blue-500'
                          : taskStatus === 'cancelled' ? 'bg-red-500'
                            : 'bg-gray-400'
                    }`}></div>
                  </div>
                );
              })}
              {sortedActiveTasks.length > 4 && !showAllTasks && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setShowAllTasks(true)}
                    className="text-center text-sm text-muted-foreground pb-2 hover:text-primary transition-colors cursor-pointer underline-offset-2 hover:underline"
                  >
                    총 {sortedActiveTasks.length}개 업무 중 4개 표시
                  </button>
                </div>
              )}
              {showAllTasks && sortedActiveTasks.length > 4 && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setShowAllTasks(false)}
                    className="text-center text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer underline-offset-2 hover:underline"
                  >
                    접기
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </ImprovedCard>

      {/* 최근 알림 */}
      <ImprovedCard>
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
                <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent hover:from-orange-500 hover:to-orange-600 transition-all duration-200 truncate">
                  최근 알림
                </span>
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/notifications')}
              className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-orange-100 hover:text-orange-600 transition-all duration-200 hover:scale-105"
            >
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingNotifications ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg animate-pulse">
                  <div className="w-4 h-4 bg-gray-300 rounded mt-0.5"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>새로운 알림이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-all duration-200 hover:shadow-md ${
                    !notification.is_read
                      ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200 shadow-sm'
                      : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'
                  }`}
                >
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <p className={`font-medium text-xs sm:text-sm truncate ${!notification.is_read ? 'text-blue-900' : 'text-gray-800'}`}>
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      )}
                    </div>
                    <p className={`text-xs line-clamp-1 mt-1 ${!notification.is_read ? 'text-blue-700' : 'text-gray-600'}`}>
                      <span className="truncate">{notification.message}</span>
                    </p>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <p className={`text-xs truncate ${!notification.is_read ? 'text-blue-600' : 'text-gray-500'}`}>
                        {getTimeAgo(notification.created_at)}
                      </p>
                      <p className={`text-xs font-medium truncate ${!notification.is_read ? 'text-blue-600' : 'text-gray-500'}`}>
                        {notification.sender_name}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </ImprovedCard>

      {/* 학사 정보 알림 — 활성 부서 공지 (구 dashboard_info '학사 정보 알림' 카드 대체) */}
      <NoticeInfoCard />

      {/* 대시보드 정보 */}
      <DashboardInfoCard excludeTitles={['학사 정보 알림']} />
    </>
  );
};
