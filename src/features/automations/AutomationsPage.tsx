// ========================================
// 자동화 업무 (/automations, 2026-10-23)
//
// 허용된 교직원이 «언제 · 누구에게 · 무엇을» 정해 두면 학교 서버 PC 가 쿨메신저 기전봇으로 보낸다.
// 회차는 DB(pg_cron automation-tick)가 만들고, 이 화면은 설정·승인·기록만 한다.
// 설계 = docs/plans/2026-10-23-automation-scheduler.md
//
// 화면 규약: 머리글에 기능명을 쓰지 않는다 — 머리글 카드는 상태 요약과 [새 자동화]만.
// ========================================
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock, Eye, History, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, ShieldAlert, Trash2, Users,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/unifiedAuth';
import {
  AUTOMATION_KIND_LABEL, AUTOMATION_STATE_LABEL, AUTOMATION_STATE_TONE, COOLMSG_SENDER_NAME, RUN_STATUS_LABEL,
  RUN_STATUS_TONE, automationState, isPerRecipient,
} from '@/lib/automationConfig';
import { describeSpec, formatRunAt, kstDateKeyOf, nextRuns } from '@/lib/automationCron';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  AUTOMATIONS_KEY, AUTOMATION_CONFIG_KEY, AUTOMATION_GRANT_KEY, deleteAutomation, fetchAutomationConfig, fetchMyGrant,
  listAutomations, listLatestRuns, setAutomationPaused, type Automation,
} from './automationService';
import { AutomationEditorDialog } from './components/AutomationEditorDialog';
import { AutomationApproveDialog } from './components/AutomationApproveDialog';
import { AutomationRunsDialog } from './components/AutomationRunsDialog';

export default function AutomationsPage() {
  const queryClient = useQueryClient();
  const { user: authUser, isAdmin } = useAuth();
  const { user } = useUnifiedAuth();
  const myResourceIds = useMemo(() => (user?.allResources ?? []).map((r) => r.id), [user]);
  const [searchParams, setSearchParams] = useSearchParams();

  const list = useQuery({ queryKey: AUTOMATIONS_KEY, queryFn: listAutomations });
  const config = useQuery({ queryKey: AUTOMATION_CONFIG_KEY, queryFn: fetchAutomationConfig });
  const grant = useQuery({
    queryKey: [...AUTOMATION_GRANT_KEY, myResourceIds.join(',')],
    queryFn: () => fetchMyGrant(myResourceIds),
    enabled: myResourceIds.length > 0,
  });
  const ids = useMemo(() => (list.data ?? []).map((a) => a.id), [list.data]);
  const latest = useQuery({
    queryKey: ['automation-latest-runs', ids.join(',')],
    queryFn: () => listLatestRuns(ids),
    enabled: ids.length > 0,
    refetchInterval: 60_000,
  });

  const canAuthor = isAdmin || grant.data === true;
  const [editing, setEditing] = useState<Automation | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [approving, setApproving] = useState<Automation | null>(null);
  const [history, setHistory] = useState<Automation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 알림 딥링크 ?automation=<id> → 그 자동화의 기록
  useEffect(() => {
    const id = searchParams.get('automation');
    if (!id || !list.data) return;
    const found = list.data.find((a) => a.id === id);
    if (found) setHistory(found);
    const next = new URLSearchParams(searchParams);
    next.delete('automation');
    setSearchParams(next, { replace: true });
  }, [searchParams, list.data, setSearchParams]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: AUTOMATIONS_KEY });
  const today = kstDateKeyOf(Date.now());
  const items = useMemo(() => list.data ?? [], [list.data]);
  const counts = useMemo(() => {
    const c = { active: 0, draft: 0, paused: 0, ended: 0 };
    for (const a of items) c[automationState(a, today)]++;
    return c;
  }, [items, today]);

  async function togglePause(a: Automation) {
    setBusy(a.id);
    try {
      await setAutomationPaused(a.id, !a.paused);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '바꾸지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: Automation) {
    if (!window.confirm(`«${a.title}» 자동화를 지울까요? 앞으로 보내지 않고, 이미 보낸 기록은 남습니다.`)) return;
    setBusy(a.id);
    try {
      await deleteAutomation(a.id);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '지우지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Layout>
      <PageContainer>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            {(['active', 'draft', 'paused', 'ended'] as const).map((s) => (
              <span key={s} className={cn('rounded-md px-2 py-1 ring-1 ring-inset', AUTOMATION_STATE_TONE[s])}>
                {AUTOMATION_STATE_LABEL[s]} {counts[s]}
              </span>
            ))}
            <span className="text-slate-400">· 보내는 계정 «{COOLMSG_SENDER_NAME}»</span>
          </div>
          <Button size="sm" className="ml-auto h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={!canAuthor}
            onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />새 자동화
          </Button>
        </div>

        {config.data?.paused_all && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            관리자가 자동화 발송을 전체 정지해 두었습니다. 정지가 풀릴 때까지 어떤 자동화도 회차를 만들지 않습니다.
          </div>
        )}

        {!canAuthor && !grant.isLoading && (
          <div className="rounded-xl border bg-card p-4 text-sm text-slate-700 shadow-sm">
            자동화 업무는 관리자가 허용한 교직원만 만들 수 있습니다. 필요하면 관리자에게 «자동화 업무» 허용을 요청해 주세요.
          </div>
        )}

        {list.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-rose-600">{list.error instanceof Error ? list.error.message : '불러오지 못했습니다.'}</p>
        ) : items.length === 0 ? (
          canAuthor && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <CalendarClock className="h-8 w-8" />
              </div>
              <p className="text-sm text-slate-700">아직 자동화가 없습니다.</p>
              <p className="mt-1 text-xs text-slate-500">예: 평일 아침 8시 «오늘 급식지도 당번» 안내를 담임 선생님들께</p>
            </div>
          )
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((a) => {
              const state = automationState(a, today);
              const next = state === 'active'
                ? nextRuns(a.schedule_cron, Date.now(), 1, { startsOn: a.starts_on, endsOn: a.ends_on })[0]
                : undefined;
              const last = latest.data?.get(a.id);
              const mine = a.owner_id === authUser?.id;
              const accent = state === 'active' ? 'from-blue-500 via-cyan-500 to-emerald-400' : state === 'draft' ? 'bg-amber-400' : 'bg-slate-300';
              const ruleCount = a.config.recipients.rule ? a.config.recipients.rule.include.length : 0;
              return (
                <article key={a.id} className="relative min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className={cn('absolute inset-x-0 top-0 h-1', accent.startsWith('from') ? `bg-gradient-to-r ${accent}` : accent)} />
                  <div className="space-y-2 p-4 pt-5">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800" title={a.title}>{a.title}</p>
                        <p className="text-xs text-slate-500">
                          {AUTOMATION_KIND_LABEL[a.kind]} · {describeSpec(a.schedule_spec, a.schedule_cron)}
                          {a.skip_closed_days && ' · 쉬는 날 건너뜀'}
                          {(a.starts_on || a.ends_on) && a.schedule_spec?.kind !== 'once' && ` · ${a.starts_on ?? ''}~${a.ends_on ?? ''}`}
                        </p>
                      </div>
                      <span className={cn('flex-shrink-0 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset', AUTOMATION_STATE_TONE[state])}>
                        {AUTOMATION_STATE_LABEL[state]}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 flex-shrink-0 p-0" aria-label="더 보기" disabled={busy === a.id}>
                            {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {mine && (
                            <DropdownMenuItem onSelect={() => { setEditing(a); setEditorOpen(true); }}>
                              <Pencil className="mr-2 h-4 w-4" />고치기
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => setApproving(a)}>
                            <Eye className="mr-2 h-4 w-4" />{a.approved_at ? '미리보기' : '미리보기 · 승인'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setHistory(a)}>
                            <History className="mr-2 h-4 w-4" />기록
                          </DropdownMenuItem>
                          {a.approved_at && (
                            <DropdownMenuItem onSelect={() => togglePause(a)}>
                              {a.paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                              {a.paused ? '다시 켜기' : '일시정지'}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onSelect={() => remove(a)}>
                            <Trash2 className="mr-2 h-4 w-4" />지우기
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-700">
                      <span className="font-medium">{a.config.title}</span> — {a.config.body}
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />
                        {[ruleCount > 0 && `조건 ${ruleCount}개`, a.config.recipients.people.length > 0 && `직접 ${a.config.recipients.people.length}명`].filter(Boolean).join(' · ')}
                        {isPerRecipient(a.config) && ' · 사람마다 한 통'}
                      </span>
                      {next && <span>다음 {formatRunAt(next)}</span>}
                      {last && (
                        <span className="flex min-w-0 items-center gap-1">
                          마지막
                          <span className={cn('rounded px-1', RUN_STATUS_TONE[last.status])}>{RUN_STATUS_LABEL[last.status]}</span>
                          {formatRunAt(Date.parse(last.scheduled_for))}
                        </span>
                      )}
                      {!mine && <span className="text-slate-400">다른 사람의 자동화</span>}
                    </div>
                    {state === 'draft' && mine && (
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setApproving(a)}>
                        <Eye className="mr-1 h-3.5 w-3.5" />미리보기 보고 승인하기
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <AutomationEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          automation={editing}
          onSaved={(saved) => {
            setEditorOpen(false);
            void refresh();
            // 겹쳐 띄우지 않고 바꿔 띄운다 — 편집 창이 닫힌 다음 프레임에 승인 단계를 연다
            requestAnimationFrame(() => setApproving(saved));
          }}
        />
        <AutomationApproveDialog
          automation={approving}
          canApprove={Boolean(approving && approving.owner_id === authUser?.id && canAuthor)}
          onOpenChange={(v) => !v && setApproving(null)}
          onApproved={() => { setApproving(null); void refresh(); }}
        />
        <AutomationRunsDialog automation={history} onOpenChange={(v) => !v && setHistory(null)} />
      </PageContainer>
    </Layout>
  );
}
