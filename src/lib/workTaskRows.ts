// ========================================
// 업무 안 할 일 표의 행 규칙 — 내 업무 관리·업무 검색이 함께 쓴다 (2026-09-27)
// 컴포넌트 파일(WorkTaskTable.tsx)에 두면 fast refresh 가 깨져 lib 로 뺐다.
// ========================================
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';
import type { Task } from '@/types/tasks';

/**
 * 표의 행 순서 — 절차형(순서 번호 → id) 다음 일회성(만든 순). 내 업무 관리·업무 검색이 **같은 순서**로
 * 보이도록 한 곳에 둔다(두 화면이 따로 정렬하면 같은 업무가 화면마다 다른 순서로 보인다).
 */
export function sortWorkTasks<T extends Pick<Task, 'id' | 'type' | 'order_index' | 'created_at'>>(tasks: T[]): T[] {
  const procedural = tasks
    .filter(task => task.type === 'procedural')
    .sort((a, b) => {
      const ai = a.order_index ?? 9999;
      const bi = b.order_index ?? 9999;
      return ai === bi ? a.id.localeCompare(b.id) : ai - bi;
    });
  const oneTime = tasks
    .filter(task => task.type !== 'procedural')
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  return [...procedural, ...oneTime];
}

/** 마감 표기 — 다중 마감이면 다음 회차와 «(n/N회)» */
export function formatTaskDue(task: { due_date?: string | null; meta?: Record<string, unknown> | null }): string | null {
  const info = getTaskDeadlineInfo(task);
  const due = info.effective ?? task.due_date;
  if (!due) return null;
  const label = new Date(due).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  return info.isMulti ? `${label} (${info.passed + 1}/${info.total}회)` : label;
}

