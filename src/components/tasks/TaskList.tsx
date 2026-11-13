// ========================================
// Task List Component
// Displays list of tasks with status management
// ========================================

import { TaskItem } from './TaskItem';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Task } from '@/types/tasks';
import { Workflow, CheckCircle } from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
  type?: 'all' | 'procedural' | 'one_time';
  onStatusChange: (taskId: string, newStatus: string) => void;
  onTaskEdit?: (task: Task) => void;
  onTaskDelete?: (task: Task) => void;
  showWorkName?: boolean;
}

export function TaskList({
  tasks,
  type = 'all',
  onStatusChange,
  onTaskEdit,
  onTaskDelete,
  showWorkName = false
}: TaskListProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p>할 일이 없습니다</p>
      </div>
    );
  }

  // Filter and sort tasks
  const filteredTasks = type === 'all' ? tasks : tasks.filter(task => task.type === type);
  
  const proceduralTasks = filteredTasks
    .filter(task => task.type === 'procedural')
    .sort((a, b) => a.order_index - b.order_index);
    
  const oneTimeTasks = filteredTasks
    .filter(task => task.type === 'one_time');


  return (
    <div className="space-y-6">
      {/* Procedural Tasks */}
      {proceduralTasks.length > 0 && (type === 'all' || type === 'procedural') && (
        <div>
          <div className="flex items-center mb-3">
            <Workflow className="mr-2 h-4 w-4" />
            <h3 className="font-semibold">절차형 할 일</h3>
            <Badge variant="secondary" className="ml-2">
              {proceduralTasks.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {proceduralTasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                showConnector={index < proceduralTasks.length - 1}
                onStatusChange={onStatusChange}
                onEdit={onTaskEdit}
                onDelete={onTaskDelete}
                showWorkName={showWorkName}
              />
            ))}
          </div>
        </div>
      )}

      {/* Separator */}
      {proceduralTasks.length > 0 && oneTimeTasks.length > 0 && (type === 'all') && (
        <Separator />
      )}

      {/* One-time Tasks */}
      {oneTimeTasks.length > 0 && (type === 'all' || type === 'one_time') && (
        <div>
          <div className="flex items-center mb-3">
            <CheckCircle className="mr-2 h-4 w-4" />
            <h3 className="font-semibold">일회성 할 일</h3>
            <Badge variant="secondary" className="ml-2">
              {oneTimeTasks.length}
            </Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {oneTimeTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onStatusChange={onStatusChange}
                onEdit={onTaskEdit}
                onDelete={onTaskDelete}
                showWorkName={showWorkName}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}