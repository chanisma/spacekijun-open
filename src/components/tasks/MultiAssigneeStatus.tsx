// ========================================
// Multi-Assignee Status Display Component
// 다중 담당자 상태를 다양한 방식으로 표시하는 컴포넌트
// ========================================

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CheckCircle, Clock, PlayCircle, User } from 'lucide-react';
import { TaskAssignee } from '@/types/tasks';
import { useEnrichedAssignees } from '@/hooks/useEnrichedAssignees';

interface MultiAssigneeStatusProps {
  assignees: TaskAssignee[];
  variant?: 'compact' | 'detailed' | 'progress' | 'kanban' | 'dots';
  showNames?: boolean;
  maxVisible?: number;
}

export function MultiAssigneeStatus({
  assignees,
  variant = 'compact',
  showNames = true,
  maxVisible = 3
}: MultiAssigneeStatusProps) {
  const { enrichedAssignees, loading } = useEnrichedAssignees(assignees);

  if (loading) {
    return <span className="text-gray-500 text-sm">로딩 중...</span>;
  }

  if (!enrichedAssignees || enrichedAssignees.length === 0) {
    return <span className="text-gray-500 text-sm">담당자 없음</span>;
  }

  const totalCount = enrichedAssignees.length;
  const completedCount = enrichedAssignees.filter(a => a.status === 'completed').length;
  const pendingCount = enrichedAssignees.filter(a => a.status === 'pending').length;
  const completionPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-600" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-gray-400" />;
      default:
        return <User className="w-3 h-3 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getInitials = (name: string) => {
    // At this point, name is guaranteed to be a valid string
    return name.slice(0, 2);
  };

  // 1. 간결한 표시 (기존 X/Y + 개선)
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs sm:text-sm font-medium">
          {completedCount}/{totalCount}명
        </span>
        <div className="flex -space-x-1">
          {enrichedAssignees.slice(0, maxVisible).map((assignee, index) => (
            <TooltipProvider key={assignee.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium ${getStatusColor(assignee.status || 'pending')}`}>
                    {getInitials(assignee.name)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{assignee.name} - {assignee.status === 'completed' ? '완료' : '진행 중'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
          {totalCount > maxVisible && (
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
              +{totalCount - maxVisible}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. 프로그레스 바 + 상세 정보
  if (variant === 'progress') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">진행률</span>
          <span className="text-sm text-gray-600">{completedCount}/{totalCount}명 완료</span>
        </div>
        <Progress value={completionPercentage} className="h-2" />
        <div className="flex flex-wrap gap-1">
          {enrichedAssignees.map((assignee) => (
            <Badge
              key={assignee.id}
              variant="outline"
              className={`text-xs ${getStatusColor(assignee.status || 'pending')}`}
            >
              {getStatusIcon(assignee.status || 'pending')}
              <span className="ml-1">{assignee.name}</span>
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  // 3. 상태별 그룹화
  if (variant === 'detailed') {
    const groupedAssignees = {
      completed: enrichedAssignees.filter(a => a.status === 'completed'),
      pending: enrichedAssignees.filter(a => a.status === 'pending')
    };

    return (
      <div className="space-y-2">
        <div className="space-y-1">
          {groupedAssignees.completed.length > 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs sm:text-sm text-green-800">완료:</span>
              <div className="flex flex-wrap gap-1">
                {groupedAssignees.completed.map(assignee => (
                  <Badge key={assignee.id} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                    {assignee.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {groupedAssignees.pending.length > 0 && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-xs sm:text-sm text-gray-600">진행:</span>
              <div className="flex flex-wrap gap-1">
                {groupedAssignees.pending.map(assignee => (
                  <Badge key={assignee.id} variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                    {assignee.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. 미니 칸반 스타일
  if (variant === 'kanban') {
    const groupedAssignees = {
      pending: enrichedAssignees.filter(a => a.status === 'pending'),
      completed: enrichedAssignees.filter(a => a.status === 'completed')
    };

    return (
      <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-lg">
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            진행 ({groupedAssignees.pending.length})
          </div>
          <div className="space-y-1">
            {groupedAssignees.pending.map(assignee => (
              <div key={assignee.id} className="text-xs bg-white p-1 rounded border">
                {assignee.name}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-green-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            완료 ({groupedAssignees.completed.length})
          </div>
          <div className="space-y-1">
            {groupedAssignees.completed.map(assignee => (
              <div key={assignee.id} className="text-xs bg-green-50 p-1 rounded border border-green-200">
                {assignee.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 5. 색상 도트 표시
  if (variant === 'dots') {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          {enrichedAssignees.map((assignee, index) => (
            <TooltipProvider key={assignee.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`w-3 h-3 rounded-full border inline-block ${
                      assignee.status === 'completed' ? 'bg-green-500 border-green-600' :
                      'bg-gray-300 border-gray-400'
                    } ${index > 0 ? '-ml-1' : ''}`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{assignee.name} - {assignee.status === 'completed' ? '완료' : '진행 중'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
        <span className="text-sm text-gray-600">({completedCount}/{totalCount})</span>
      </div>
    );
  }

  return null;
}

// 상태 표시 옵션 선택을 위한 설정 컴포넌트
export function StatusDisplaySettings() {
  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold">다중 담당자 상태 표시 방식</h3>

      <div className="space-y-3">
        <div className="border rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2">1. 간결 표시 (Compact)</h4>
          <MultiAssigneeStatus
            assignees={[
              { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
              { id: '2', name: '박학생', type: 'student', status: 'pending' },
              { id: '3', name: '김학생', type: 'student', status: 'pending' }
            ]}
            variant="compact"
          />
        </div>

        <div className="border rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2">2. 프로그레스 바 (Progress)</h4>
          <MultiAssigneeStatus
            assignees={[
              { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
              { id: '2', name: '박학생', type: 'student', status: 'pending' },
              { id: '3', name: '김학생', type: 'student', status: 'pending' }
            ]}
            variant="progress"
          />
        </div>

        <div className="border rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2">3. 상세 그룹화 (Detailed)</h4>
          <MultiAssigneeStatus
            assignees={[
              { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
              { id: '2', name: '박학생', type: 'student', status: 'pending' },
              { id: '3', name: '김학생', type: 'student', status: 'pending' }
            ]}
            variant="detailed"
          />
        </div>

        <div className="border rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2">4. 칸반 스타일 (Kanban)</h4>
          <MultiAssigneeStatus
            assignees={[
              { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
              { id: '2', name: '박학생', type: 'student', status: 'pending' },
              { id: '3', name: '김학생', type: 'student', status: 'pending' }
            ]}
            variant="kanban"
          />
        </div>

        <div className="border rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2">5. 도트 표시 (Dots)</h4>
          <MultiAssigneeStatus
            assignees={[
              { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
              { id: '2', name: '박학생', type: 'student', status: 'pending' },
              { id: '3', name: '김학생', type: 'student', status: 'pending' }
            ]}
            variant="dots"
          />
        </div>
      </div>
    </div>
  );
}