/**
 * 홈의 «오늘의 플래너» 카드 — 학생·교사 홈 공용 (2026-10-25 사용자 요청).
 *
 * 플래너 화면과 **같은 쿼리 키**(`['academy-dormitory', userId, 'planner', day]`)를 쓴다 — 홈에서 체크하면 플래너가,
 * 플래너에서 고치면 홈이 같은 캐시로 따라온다. 체크 = 플래너와 같은 쓰기(`complete`, 보상 규칙은 서버).
 * 메뉴 노출 스위치(`/planner`)와 역할(직원은 플래너가 없다)을 따른다 — 안 보이면 카드도 없다.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Check, ClipboardCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useIsMenuVisible } from '@/hooks/useMenuVisibility';
import { canRoleSeePath } from '@/lib/routeAccess';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { DashboardCardShell, DashboardCardSkeleton } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { fetchPlanner, writePlanner } from './plannerService';
import { seoulDay } from './plannerModel';
import type { PlannerTask } from './types';

const SHOW_MAX = 6;

function byTime(a: PlannerTask, b: PlannerTask) {
  return Number(!a.start_time) - Number(!b.start_time) || (a.start_time || '').localeCompare(b.start_time || '');
}

function PlannerHomeBody({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const day = seoulDay();
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['academy-dormitory', userId, 'planner', day],
    queryFn: () => fetchPlanner(day),
    staleTime: 30_000,
    retry: 1,
  });
  const tasks = (query.data?.tasks ?? []).filter((t) => t.task_date === day).sort(byTime);
  const done = tasks.filter((t) => t.completed).length;

  const toggle = async (task: PlannerTask) => {
    if (busy) return;
    setBusy(task.id);
    try {
      await writePlanner('complete', { id: task.id, completed: !task.completed });
      await cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally { setBusy(null); }
  };

  return (
    <DashboardCardShell title="오늘의 플래너" icon={ClipboardCheck} accent="green"
      description={tasks.length ? `오늘 계획 ${tasks.length}개 중 ${done}개 했어요` : '오늘 할 일을 적어 두면 여기서 바로 체크할 수 있어요'}
      onAction={() => navigate('/planner')} actionLabel="플래너 열기">
      {query.isPending ? <DashboardCardSkeleton rows={2} />
        : query.isError ? (
          <button type="button" onClick={() => void query.refetch()} className="text-sm text-slate-500 underline-offset-2 hover:underline">
            플래너를 불러오지 못했어요 — 다시 시도
          </button>
        ) : tasks.length === 0 ? (
          <button type="button" onClick={() => navigate('/planner')}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
            <Plus className="h-4 w-4" />오늘 계획 적기
          </button>
        ) : (
          <>
            {tasks.length > 0 && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={done} aria-label="오늘 계획 진행">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / tasks.length) * 100}%` }} />
              </div>
            )}
            <ul className="space-y-1">
              {tasks.slice(0, SHOW_MAX).map((task) => (
                <li key={task.id}>
                  <button type="button" disabled={!!busy} onClick={() => void toggle(task)} aria-pressed={task.completed}
                    className="flex min-h-[44px] w-full min-w-0 items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-50 disabled:opacity-60">
                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      task.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white')}>
                      {task.completed && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate text-sm', task.completed ? 'text-slate-400 line-through' : 'text-slate-800')} title={task.title}>
                      {task.title}
                    </span>
                    {task.start_time && (
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{task.start_time}{task.end_time ? `–${task.end_time}` : ''}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {tasks.length > SHOW_MAX && (
              <button type="button" onClick={() => navigate('/planner')} className="mt-1 px-2 text-xs text-slate-500 hover:text-slate-800">
                +{tasks.length - SHOW_MAX}개 더 — 플래너에서 보기
              </button>
            )}
          </>
        )}
    </DashboardCardShell>
  );
}

export function PlannerHomeCard() {
  const { user, profile, isAdmin, effectiveRole } = useAuth();
  const visible = useIsMenuVisible(isAdmin, effectiveRole)('/planner');
  // 관리자 역할 미리보기 중에는 그리지 않는다 — 플래너 화면도 미리보기에선 관리자 본인 계획을 열지 않는다
  const preview = profile?.role === 'admin' && effectiveRole !== 'admin';
  if (!user || preview || !visible || !canRoleSeePath(effectiveRole, '/planner')) return null;
  return <PlannerHomeBody userId={user.id} />;
}
