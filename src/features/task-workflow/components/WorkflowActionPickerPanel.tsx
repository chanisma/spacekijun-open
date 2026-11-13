/**
 * 노드 선택기의 «작업» 구역 — 할 일 노드의 + 를 끌어 놓았을 때만 뜬다 (2026-09-24).
 *
 * n8n 의 «노드에서 + 를 끌면 고를 목록이 뜨고, 고르면 그 자리에 만들어지며 이어진다»를
 * 그대로 옮긴 것이다. 고를 것은 두 가지다 —
 *   ① 이 할 일에 **이미 연결된** 작업 중 캔버스에 없는 것(가져오기)
 *   ② **새로 연결할** 작업 유형(연결 + 노드 추가를 한 번에)
 * 업무·할 일 탭이 「기존 가져오기 / 새로 만들기」로 갈리는 것과 같은 짜임이다.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Landmark, Play, Plus, Wrench } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { isFacultyRole } from '@/lib/roles';
import {
  AVAILABLE_TASK_ACTION_DEFINITIONS,
  TASK_ACTION_CATEGORY_META,
  TASK_ACTION_CATEGORY_ORDER,
  type TaskActionDefinition,
} from '../actionRegistry';
import { useBindTaskAction, useTaskActions } from '../hooks/useTaskActions';
import { listableActions } from '../utils/taskActionDraft';
import type { TaskAction } from '../types';

const KIND_ICON = {
  link: { box: 'bg-slate-100 text-slate-500', Icon: ExternalLink },
  external: { box: 'bg-indigo-100 text-indigo-600', Icon: Landmark },
  embed: { box: 'bg-emerald-100 text-emerald-600', Icon: Wrench },
  runner: { box: 'bg-blue-100 text-blue-600', Icon: Play },
} as const;

export interface WorkflowActionPickerSource {
  /** 끌기를 시작한 할 일 노드의 할 일 */
  taskId: string;
  taskTitle: string;
  /** 이 흐름에 이미 올라와 있는 작업 — 두 번 올리지 않는다 */
  placedActionIds: Set<string>;
}

export function WorkflowActionPickerPanel({
  source,
  onAddAction,
}: {
  source: WorkflowActionPickerSource;
  /** 캔버스에 노드를 세운다(끌어 놓은 자리에) */
  onAddAction: (action: TaskAction) => void;
}) {
  const { user, profile, isAdmin } = useAuth();
  const { data: actions = [], isLoading } = useTaskActions(source.taskId);
  const bindAction = useBindTaskAction();
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  // 제출 구현용 연결은 화면에 세우지 않는다(패널·카드와 같은 규칙)
  const bound = useMemo(() => listableActions(actions), [actions]);
  const unplaced = bound.filter((action) => !source.placedActionIds.has(action.id));

  const canUse = (definition: TaskActionDefinition) =>
    definition.adminOnly ? isAdmin : Boolean(user) && isFacultyRole(profile?.role);

  const byCategory = useMemo(() => {
    const grouped = new Map<string, TaskActionDefinition[]>();
    AVAILABLE_TASK_ACTION_DEFINITIONS.forEach((definition) => {
      if (definition.hidden || !canUse(definition)) return;
      const bucket = grouped.get(definition.category);
      if (bucket) bucket.push(definition);
      else grouped.set(definition.category, [definition]);
    });
    return grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile?.role, user]);

  /** 이미 연결된 유형은 새로 만들지 않는다 — 여러 개를 두는 유형(NEIS)만 예외 */
  const boundTypes = new Set(bound.map((action) => action.action_type));

  const handleConnect = async (definition: TaskActionDefinition) => {
    try {
      const created = await bindAction.mutateAsync({ taskId: source.taskId, workType: definition.type });
      onAddAction(created);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
      toast.error(message ? `작업을 연결하지 못했습니다 — ${message}` : '작업을 연결하지 못했습니다.');
    }
  };

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-3 p-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
          <span className="font-semibold text-slate-700">{source.taskTitle}</span> 에 붙일 작업을 고르세요.
          고르면 놓은 자리에 노드가 생기고 할 일과 이어집니다.
        </p>

        {/* ① 이미 연결돼 있는데 캔버스에 없는 것 */}
        <section>
          <h3 className="mb-1.5 text-[11px] font-bold text-slate-500">이미 연결된 작업</h3>
          {isLoading ? (
            <p className="px-1 text-[11px] text-slate-400">불러오는 중…</p>
          ) : unplaced.length === 0 ? (
            <p className="px-1 text-[11px] text-slate-400">
              {bound.length === 0 ? '아직 연결된 작업이 없습니다.' : '연결된 작업이 모두 흐름에 올라와 있습니다.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {unplaced.map((action) => {
                const definition = AVAILABLE_TASK_ACTION_DEFINITIONS.find(
                  (item) => item.type === action.action_type
                );
                const style = KIND_ICON[definition?.kind ?? 'runner'];
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      onClick={() => onAddAction(action)}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', style.box)}>
                        <style.Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-700" title={action.title}>
                          {action.title}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {definition?.title ?? action.action_type}
                        </span>
                      </span>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ② 새로 연결하기 */}
        <section>
          <h3 className="mb-1.5 text-[11px] font-bold text-slate-500">작업 연결</h3>
          <div className="space-y-1.5">
            {TASK_ACTION_CATEGORY_ORDER.map((category) => {
              const definitions = byCategory.get(category) ?? [];
              if (definitions.length === 0) return null;
              const meta = TASK_ACTION_CATEGORY_META[category];
              const opened = openCategory === category;
              return (
                <div key={category} className="overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button"
                    aria-expanded={opened}
                    onClick={() => setOpenCategory(opened ? null : category)}
                    className="flex w-full items-center justify-between gap-2 bg-gradient-to-r from-indigo-50/70 to-blue-50/40 px-2.5 py-1.5 text-left"
                  >
                    <span className="text-[11px] font-bold text-slate-700">{meta.label}</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      {definitions.length}
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', opened && 'rotate-180')} />
                    </span>
                  </button>
                  {opened && (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {definitions.map((definition) => {
                        const already = !definition.multiple && boundTypes.has(definition.type);
                        const style = KIND_ICON[definition.kind];
                        return (
                          <li key={definition.type}>
                            <button
                              type="button"
                              disabled={already || bindAction.isPending}
                              onClick={() => void handleConnect(definition)}
                              title={already ? '이미 연결돼 있습니다 — 위 목록에서 가져오세요' : definition.description}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-blue-50/40 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
                            >
                              <span
                                className={cn(
                                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                                  style.box
                                )}
                              >
                                <style.Icon className="h-3 w-3" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700">
                                {definition.title}
                              </span>
                              {already && <span className="shrink-0 text-[10px] text-slate-400">연결됨</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
