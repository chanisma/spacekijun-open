import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { useMyTasksJsonb } from '@/hooks/useTasksJsonb';
import { supabase } from '@/integrations/supabase/client';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';

export function MyTaskStatistics() {
  const { data: myTasks } = useMyTasksJsonb(true);
  const [currentUserResourceId, setCurrentUserResourceId] = useState<string | null>(null);

  // 현재 사용자의 resource_id 가져오기
  useEffect(() => {
    const getCurrentUserResourceId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      if (!userProfile?.name) return;

      const { data: resource } = await supabase
        .from('resource')
        .select('id')
        .eq('name', userProfile.name)
        .single();

      if (resource) {
        setCurrentUserResourceId(resource.id);
      }
    };

    getCurrentUserResourceId();
  }, []);

  // 내 담당 할 일 통계 계산
  const assignedTasks = myTasks?.assigned_tasks || [];
  const totalTasks = assignedTasks.length;

  // 완료율 계산
  const completedTasks = assignedTasks.filter((task: any) => {
    // JSONB 구조에서 현재 사용자의 상태 확인
    if (task.assignees_jsonb && task.assignees_jsonb.length > 0 && currentUserResourceId) {
      const currentUserAssignee = task.assignees_jsonb.find(
        (assignee: any) => assignee.id === currentUserResourceId
      );
      return currentUserAssignee?.status === 'completed';
    }
    // 레거시 구조 또는 단일 담당자의 경우
    return task.status === 'completed';
  });

  const completionRate = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  // 마감 임박 할 일 (3일 이내) — 다중 마감이면 다음 회차 기준
  const urgentTasks = assignedTasks.filter((task: any) => {
    const due = getTaskDeadlineInfo(task).effective ?? task.due_date;
    if (!due) return false;
    const dueDate = new Date(due);
    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
  });

  // 이번 학년도 할 일 수 (3월 시작 - 2월 끝)
  const getAcademicYearTaskCount = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 0-based to 1-based

    // 3월부터 시작하는 학년도 계산
    const academicYearStart = currentMonth >= 3 ?
      new Date(currentYear, 2, 1) : // 현재 연도 3월 1일
      new Date(currentYear - 1, 2, 1); // 작년 3월 1일

    const academicYearEnd = currentMonth >= 3 ?
      new Date(currentYear + 1, 1, 28) : // 내년 2월 28일
      new Date(currentYear, 1, 28); // 올해 2월 28일

    const academicYearTasks = assignedTasks.filter((task: any) => {
      if (!task.created_at) return false;
      const createdDate = new Date(task.created_at);
      return createdDate >= academicYearStart && createdDate <= academicYearEnd;
    });

    return academicYearTasks.length;
  };

  const academicYearTaskCount = getAcademicYearTaskCount();

  const stats = [
    {
      title: '내 할 일',
      value: totalTasks,
      icon: CheckCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: '완료율',
      value: `${completionRate}%`,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: '마감 임박',
      value: urgentTasks.length,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: '이번 학년도',
      value: academicYearTaskCount,
      icon: Clock,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="p-2 sm:p-3">
            <CardContent className="p-0">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className={`p-1.5 sm:p-2 rounded-md ${stat.bgColor}`}>
                  <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${stat.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-600 font-medium truncate">{stat.title}</p>
                  <p className="text-sm sm:text-lg font-semibold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}