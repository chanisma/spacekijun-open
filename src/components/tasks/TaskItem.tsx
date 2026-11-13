// ========================================
// Task Item Component
// Individual task item with status controls
// ========================================

import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Task } from '@/types/tasks';
import { useEnrichAssignees } from '@/hooks/useTasksJsonb';
import {
  getTaskStatusLabel,
  getStatusBadgeVariant,
  isOverdue as checkIsOverdue,
  isDueSoon as checkIsDueSoon,
  getDueDateVariant as getDueDateVariantUtil,
} from '@/lib/taskUtils';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';
import {
  Calendar,
  User,
  FileText,
  Tag,
  MoreHorizontal,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface TaskItemProps {
  task: Task;
  showConnector?: boolean;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  showWorkName?: boolean;
  compact?: boolean;
}

export function TaskItem({
  task,
  showConnector = false,
  onStatusChange,
  onEdit,
  onDelete,
  showWorkName = false,
  compact = false
}: TaskItemProps) {
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Enrich assignees with resource names
  const { data: enrichedAssignees = [] } = useEnrichAssignees((task as any).assignees_jsonb);

  // Calculate completion status based on JSONB assignees or fallback to task.status
  const getEffectiveStatus = () => {
    if ((task as any).assignees_jsonb && (task as any).assignees_jsonb.length > 0) {
      const allCompleted = (task as any).assignees_jsonb.every((a: any) => a.status === 'completed');
      return allCompleted ? 'completed' : task.status;
    }
    return task.status;
  };

  const effectiveStatus = getEffectiveStatus();
  // 다중 마감이면 판정·표시는 "다음 마감"(전부 지났으면 마지막) 기준 — 지난 회차로 지연 오표시 방지
  const deadlineInfo = getTaskDeadlineInfo(task);
  const effectiveDueDate = deadlineInfo.effective ?? task.due_date;
  const isOverdue = checkIsOverdue(effectiveDueDate) && effectiveStatus !== 'completed';
  const isDueSoon = checkIsDueSoon(effectiveDueDate) && !isOverdue;

  const handleStatusChange = async (checked: boolean) => {
    setIsChangingStatus(true);
    try {
      const newStatus = checked ? 'completed' : 'pending';
      await onStatusChange(task.id, newStatus);
    } finally {
      setIsChangingStatus(false);
    }
  };

  const getDueDateVariant = () => {
    return getDueDateVariantUtil(effectiveDueDate, effectiveStatus);
  };

  return (
    <div className="relative">
      <Card className={cn(
        'transition-all duration-200 hover:shadow-sm',
        effectiveStatus === 'completed' && 'bg-green-50 border-green-200',
        isOverdue && effectiveStatus as any !== 'completed' && 'bg-red-50 border-red-200',
        compact ? 'p-3' : 'p-4'
      )}>
        <CardContent className="p-0">
          <div className="flex items-start space-x-3">
            <Checkbox
              checked={effectiveStatus === 'completed'}
              disabled={isChangingStatus}
              onCheckedChange={handleStatusChange}
              className="mt-1"
            />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <h4 className={cn(
                  'font-medium text-sm',
                  effectiveStatus === 'completed' && 'line-through text-muted-foreground',
                  compact && 'text-xs'
                )}>
                  {task.title}
                  {task.type === 'procedural' && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {task.order_index}단계
                    </Badge>
                  )}
                </h4>
                
                <div className="flex items-center space-x-2 ml-2">
                  {effectiveDueDate && (
                    <Badge
                      variant={getDueDateVariant()}
                      className="text-xs"
                      title={deadlineInfo.isMulti
                        ? `마감 일정 ${deadlineInfo.total}회 (${deadlineInfo.passed}회 지남) — 다음: ${effectiveDueDate}`
                        : undefined}
                    >
                      <Calendar className="mr-1 h-2 w-2" />
                      {format(new Date(effectiveDueDate), 'MM/dd', { locale: ko })}
                      {deadlineInfo.isMulti && (
                        <span className="ml-0.5">
                          ({deadlineInfo.passed + 1}/{deadlineInfo.total}회)
                        </span>
                      )}
                      {isOverdue && <AlertTriangle className="ml-1 h-2 w-2" />}
                      {isDueSoon && <Clock className="ml-1 h-2 w-2" />}
                    </Badge>
                  )}
                  
                  <Badge variant={getStatusBadgeVariant(effectiveStatus)} className="text-xs">
                    {getTaskStatusLabel(effectiveStatus)}
                  </Badge>
                  
                  {(onEdit || onDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(task)}>
                            수정
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem 
                            onClick={() => onDelete(task)}
                            className="text-red-600"
                          >
                            삭제
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              
              {task.description && !compact && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {task.description}
                </p>
              )}
              
              {/* Keywords */}
              {task.keywords && task.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {task.keywords.slice(0, compact ? 2 : 4).map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      <Tag className="mr-1 h-2 w-2" />
                      {keyword}
                    </Badge>
                  ))}
                  {task.keywords.length > (compact ? 2 : 4) && (
                    <Badge variant="outline" className="text-xs">
                      +{task.keywords.length - (compact ? 2 : 4)}
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Additional Info */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                  {/* 여러 담당자 표시 - JSONB 구조 우선 사용 */}
                  {enrichedAssignees.length > 0 ? (
                    <div className="flex items-center">
                      <User className="mr-1 h-3 w-3" />
                      <div className="flex flex-wrap gap-1">
                        {enrichedAssignees.slice(0, compact ? 1 : 2).map((assignee, index) => (
                          <Badge key={assignee.id} variant="outline" className="text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${
                              assignee.status === 'completed' ? 'bg-green-500' :
                              'bg-gray-400'
                            }`} />
                            {assignee.name}
                          </Badge>
                        ))}
                        {enrichedAssignees.length > (compact ? 1 : 2) && (
                          <Badge variant="outline" className="text-xs">
                            +{enrichedAssignees.length - (compact ? 1 : 2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : task.assignees && task.assignees.length > 0 ? (
                    <div className="flex items-center">
                      <User className="mr-1 h-3 w-3" />
                      <div className="flex flex-wrap gap-1">
                        {task.assignees.slice(0, compact ? 1 : 2).map((assignee, index) => (
                          <Badge key={assignee.id} variant="outline" className="text-xs">
                            {assignee.name}
                          </Badge>
                        ))}
                        {task.assignees.length > (compact ? 1 : 2) && (
                          <Badge variant="outline" className="text-xs">
                            +{task.assignees.length - (compact ? 1 : 2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : task.assigned_name && (
                    <div className="flex items-center">
                      <User className="mr-1 h-3 w-3" />
                      {task.assigned_name}
                    </div>
                  )}

                  {showWorkName && (task as any).event_name && (
                    <div className="flex items-center">
                      <FileText className="mr-1 h-3 w-3" />
                      {(task as any).event_name}
                    </div>
                  )}
                </div>
                
                {task.meta?.document_number && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <FileText className="mr-1 h-3 w-3" />
                    {task.meta.document_number}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {showConnector && (
        <div className="absolute left-6 top-full w-0.5 h-2 bg-border" />
      )}
    </div>
  );
}