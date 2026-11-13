// 업무 진행 화면의 단계 줄 — ①→②→③. 같은 단계의 할 일(동시에 하는 일)은 한 칸 안에 쌓인다.
// 상태는 색으로 읽힌다(CLAUDE.md §3): 에메랄드=끝남 · 블루=지금 · 슬레이트=예정.

import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stageNumber, stageStates, type PipelineStage, type PipelineTaskLike } from '@/lib/workPipeline';

export function PipelineStageBar<T extends PipelineTaskLike>({
  stages,
  unordered = [],
  selectedTaskId,
  onSelect,
}: {
  stages: PipelineStage<T>[];
  /** 순서 없는 할 일(일회성) — 단계 사슬에 넣지 않고 그 아래 줄에 가로로(자동 줄바꿈) 보인다 */
  unordered?: T[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}) {
  const states = stageStates(stages);
  return (
    <div className="space-y-2 rounded-xl border bg-card p-2.5 shadow-sm">
      {stages.length > 0 && (
        // 단계 사슬은 한 줄을 지키고 넘치면 **자기 컨테이너에서** 가로 스크롤한다(순서가 곧 의미라 줄을 바꾸지 않는다)
        <div className="overflow-x-auto">
          <ol className="flex min-w-max items-stretch gap-1.5">
            {stages.map((stage, i) => (
              <li key={stage.order} className="flex items-stretch gap-1.5">
                <div
                  className={cn(
                    'flex min-w-[9rem] max-w-[15rem] flex-col gap-1 rounded-lg border p-1.5',
                    states[i] === 'done' && 'border-emerald-200 bg-emerald-50/60',
                    states[i] === 'current' && 'border-blue-300 bg-blue-50/70',
                    states[i] === 'upcoming' && 'border-slate-200 bg-slate-50/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center gap-1 px-1 text-[10px] font-semibold',
                      states[i] === 'done' && 'text-emerald-700',
                      states[i] === 'current' && 'text-blue-700',
                      states[i] === 'upcoming' && 'text-slate-500',
                    )}
                  >
                    {states[i] === 'done' ? <Check className="h-3 w-3" /> : null}
                    {stageNumber(i)} 단계{stage.tasks.length > 1 ? ` · 동시에 ${stage.tasks.length}개` : ''}
                  </span>
                  {stage.tasks.map((task) => {
                    const selected = task.id === selectedTaskId;
                    const done = task.status === 'completed' || task.status === 'cancelled';
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onSelect(task.id)}
                        title={task.title}
                        aria-current={selected ? 'step' : undefined}
                        className={cn(
                          'min-h-[2rem] w-full truncate rounded-md px-2 py-1 text-left text-xs transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                          selected
                            ? 'bg-blue-600 font-semibold text-white shadow-sm'
                            : done
                              ? 'text-emerald-800 hover:bg-emerald-100'
                              : 'text-slate-700 hover:bg-white',
                          task.status === 'cancelled' && !selected && 'line-through opacity-60',
                        )}
                      >
                        {task.title}
                      </button>
                    );
                  })}
                </div>
                {i < stages.length - 1 && (
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-slate-400" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 순서 없는 할 일 — 단계 줄 **아래 한 줄**에 가로로 늘어놓고 폭이 모자라면 자동으로 줄을 바꾼다
          (2026-09-27 사용자 요청). 단계 칸처럼 세로로 쌓으면 «동시에 하는 한 단계»로 읽힌다.
          ⚠️ 단계 줄(min-w-max) 안에 두면 flex-wrap 이 일하지 않는다 — 내용만큼 늘어나는 상자에는 «줄을 바꿀 폭»이
          없다. 그래서 폭이 정해진 바깥 카드에 따로 둔다. */}
      {unordered.length > 0 && (
        <div
          data-testid="unordered-group"
          className="rounded-lg border border-dashed border-slate-300 bg-white p-1.5"
        >
          <span className="block px-1 pb-1 text-[10px] font-semibold text-slate-500">
            순서 없는 할 일 · {unordered.length}개
          </span>
          <div className="flex flex-wrap gap-1">
            {unordered.map((task) => {
              const selected = task.id === selectedTaskId;
              const done = task.status === 'completed' || task.status === 'cancelled';
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelect(task.id)}
                  title={task.title}
                  aria-current={selected ? 'step' : undefined}
                  className={cn(
                    // 한 칸은 최대 13rem(좁은 화면에선 줄 폭)에서 자르고 전문은 title 로
                    'min-h-[2rem] min-w-0 max-w-[min(13rem,100%)] truncate rounded-md border px-2 py-1 text-left text-xs transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    selected
                      ? 'border-blue-600 bg-blue-600 font-semibold text-white shadow-sm'
                      : done
                        ? 'border-emerald-100 text-emerald-800 hover:bg-emerald-50'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                    task.status === 'cancelled' && !selected && 'line-through opacity-60',
                  )}
                >
                  {task.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
