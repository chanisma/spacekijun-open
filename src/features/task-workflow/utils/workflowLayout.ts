import type { Task } from '@/types/tasks';

const NODE_WIDTH = 256;
const HORIZONTAL_STEP = 336;
const VERTICAL_STEP = 240;

export interface WorkTaskPlacement {
  task: Task;
  position: { x: number; y: number };
  sourceTaskId: string | null;
  relationType: 'contains' | 'flow';
}

/**
 * Places one-time tasks directly under an event and procedural tasks as a
 * left-to-right sequence. The first procedural task remains a direct child of
 * the event; subsequent steps connect to the previous procedural task.
 */
export function buildWorkTaskPlacements(
  workPosition: { x: number; y: number },
  selectedTasks: Task[]
): WorkTaskPlacement[] {
  const oneTimeTasks = selectedTasks.filter((task) => task.type === 'one_time');
  const proceduralTasks = selectedTasks
    .map((task, selectedIndex) => ({ task, selectedIndex }))
    .filter(({ task }) => task.type === 'procedural')
    .sort(
      (a, b) =>
        (a.task.order_index ?? Number.MAX_SAFE_INTEGER) -
          (b.task.order_index ?? Number.MAX_SAFE_INTEGER) ||
        a.selectedIndex - b.selectedIndex
    )
    .map(({ task }) => task);

  const childRowY = workPosition.y + VERTICAL_STEP;
  const oneTimeRowWidth =
    oneTimeTasks.length > 0
      ? NODE_WIDTH + (oneTimeTasks.length - 1) * HORIZONTAL_STEP
      : 0;
  const oneTimeStartX = workPosition.x + NODE_WIDTH / 2 - oneTimeRowWidth / 2;

  const oneTimePlacements: WorkTaskPlacement[] = oneTimeTasks.map((task, index) => ({
    task,
    position: {
      x: oneTimeStartX + index * HORIZONTAL_STEP,
      y: childRowY,
    },
    sourceTaskId: null,
    relationType: 'contains',
  }));

  const proceduralRowY = childRowY + (oneTimeTasks.length > 0 ? VERTICAL_STEP : 0);
  const proceduralPlacements: WorkTaskPlacement[] = proceduralTasks.map((task, index) => ({
    task,
    position: {
      x: workPosition.x + index * HORIZONTAL_STEP,
      y: proceduralRowY,
    },
    sourceTaskId: index === 0 ? null : proceduralTasks[index - 1].id,
    relationType: index === 0 ? 'contains' : 'flow',
  }));

  return [...oneTimePlacements, ...proceduralPlacements];
}
