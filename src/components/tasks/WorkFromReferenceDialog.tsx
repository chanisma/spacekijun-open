// ========================================
// 참고해서 시작 (2026-11-12) — 옛 «지난 업무 가져오기»(연간 템플릿)와 «기존 업무에서 복사»(업무 만들기 창)를 합친 창.
//
// 판정 = `@/lib/workRollover`(`planWorkRollover` 의 두 모드), 쓰기 = `@/services/workRolloverService`. 이 파일은 그리기만 한다.
//   작년 같은 일 이어가기(continue) — 날짜를 해만큼 옮기고 계보 `rolledOverFrom` 을 잇는다 → 작년 업무 지식이 따라온다
//   비슷한 일 참고(reference)     — 할 일·작업 모양만, 날짜 없음, 출처 = `referencedFrom`(계보 아님)
// 두 모드 모두 새 업무 → 원본에 «관련» 연결(ontology_link)을 남긴다 — 첨부 파일은 복사하지 않고 그 연결로 연다(사용자 결정).
// 입구 셋: 업무 관리(지난 업무 가져오기 자리) · 업무노트 [새 업무] · 공문 [내 일로]. 공문은 `onCreate` 로 결정 기록을 덧붙인다.
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CalendarClock, CalendarDays, Copy, FileText, History, ListChecks, Loader2, PenLine, Search, Target, UserX, Users, Wrench,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { todayKeyKst } from '@/lib/taskVisibility';
import { similarityToHints } from '@/lib/workSimilarity';
import type { PersonOption } from '@/lib/candidateToWork';
import { unifiedAuth } from '@/services/unifiedAuth';
import {
  findExistingRollover, inferWorkYear, planWorkRollover, rolloverWorkName, type ReferenceMode, type RolloverPlan,
} from '@/lib/workRollover';
import { executeWorkRollover, loadRolloverSource, type ExtraTaskInsert } from '@/services/workRolloverService';
import { linkObjects } from '@/features/work-ontology/services/ontologyLinkService';
import { academicYearOfDate } from '@/features/work-ontology/model/workRoom';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip,
} from './dialogDesign';

interface ReferenceListWork {
  id: string;
  name: string;
  status: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  tasks: Array<{ count: number }> | null;
}

/** 이 이상 겹치면 «비슷한 업무»로 표시하고 위로 올린다(공문 제안의 RECOMMEND_MIN_SCORE 와 같은 자) */
export const REFERENCE_SIMILAR_MIN = 0.35;

type AssignMode = 'keep' | 'me' | 'none';

export interface WorkFromReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 원본을 가까운 순으로 정렬할 글(공문 제목·AI 후보 이름·적어 둔 업무 이름) */
  hints?: string[];
  /** 새 업무 칸의 초안 */
  defaults?: { name?: string; targetDate?: string | null; goal?: string };
  /** 있으면 책임자 기본값 = 나, 담당 «모두 나»를 고를 수 있다(업무노트·공문 입구) */
  me?: PersonOption | null;
  /** 원본 없이 함께 넣을 할 일(공문 할 일은 `onCreate` 쪽이 넣으므로 보통 비어 있다) */
  extraTasks?: ExtraTaskInsert[];
  /** work.meta.startedIn — 어디서 시작했나(기록용, 다음 해로 옮기지 않는다) */
  startedIn?: string;
  /** 만든 직후 덧붙일 쓰기(공문 결정 기록 등). 실패하면 만든 업무를 지우고 창은 열린 채 오류를 보인다 */
  onCreate?: (workId: string, plan: RolloverPlan) => Promise<void>;
  onCreated?: (workId: string) => void;
  title?: string;
}

function formatDate(key: string) {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function isMine(w: ReferenceListWork, me: string | null | undefined): boolean {
  if (!me) return false;
  const managers = w.meta?.managers;
  return Array.isArray(managers) && managers.some((m) => (m as { id?: string } | null)?.id === me);
}

export function WorkFromReferenceDialog({
  open, onOpenChange, hints = [], defaults, me = null, extraTasks, startedIn, onCreate, onCreated, title,
}: WorkFromReferenceDialogProps) {
  const queryClient = useQueryClient();
  const today = todayKeyKst();
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [mode, setMode] = useState<ReferenceMode>('continue');
  const [targetYear, setTargetYear] = useState<number>(academicYearOfDate(defaults?.targetDate ?? today));
  const [assignMode, setAssignMode] = useState<AssignMode>('keep');
  const [managerIds, setManagerIds] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [targetDate, setTargetDate] = useState(defaults?.targetDate ?? '');
  const [goal, setGoal] = useState(defaults?.goal ?? '');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /** 원본을 고르면 목록을 접는다 — 휴대폰에서 목록 상자와 본문이 겹쳐 스크롤되지 않게(2026-11-12 화면 검증) */
  const [pickerOpen, setPickerOpen] = useState(true);
  /** 입구에서 적어 온 이름 — «비슷한 일 참고»의 이름 초안. «이어가기»는 원본 이름의 연도를 바꾼 것이 초안이다 */
  const [defaultName, setDefaultName] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSourceId(null);
    setPickerOpen(true);
    setManagerIds(null);
    setName('');
    setNameTouched(false);
    setDefaultName(defaults?.name?.trim() ?? '');
    setTargetDate(defaults?.targetDate ?? '');
    setGoal(defaults?.goal ?? '');
    setSkipped(new Set());
    // 열 때 한 번만 — defaults 객체가 렌더마다 새로 와도 입력을 지우지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: myResourceId } = useQuery({
    queryKey: ['current-resource-id'],
    queryFn: () => unifiedAuth.getCurrentResourceId(),
    enabled: open && !me,
    staleTime: 10 * 60 * 1000,
  });
  const myId = me?.id ?? myResourceId ?? null;

  // 원본 후보 — 볼 수 있는 업무 전부(작년·끝난 업무 포함). 업무 SELECT RLS 가 열려 있어 범위를 서버가 좁히지 않는다
  const list = useQuery({
    queryKey: ['work-reference-list'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async (): Promise<ReferenceListWork[]> => {
      const { data, error } = await supabase
        .from('work')
        .select('id, name, status, meta, created_at, tasks:task(count)')
        .order('created_at', { ascending: false })
        .range(0, 1999);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReferenceListWork[];
    },
  });

  const hintKey = hints.join('\u0001');
  const candidates = useMemo(() => {
    const q = query.trim().replace(/\s+/g, '').toLowerCase();
    const hs = hintKey ? hintKey.split('\u0001') : [];
    return (list.data ?? [])
      .filter((w) => !q || w.name.replace(/\s+/g, '').toLowerCase().includes(q))
      .map((w) => ({ work: w, year: inferWorkYear(w), score: hs.length ? similarityToHints(w.name, hs) : 0, mine: isMine(w, myId) }))
      .sort((a, b) => {
        const sa = a.score >= REFERENCE_SIMILAR_MIN ? a.score : 0;
        const sb = b.score >= REFERENCE_SIMILAR_MIN ? b.score : 0;
        if (sa !== sb) return sb - sa;
        if (a.mine !== b.mine) return a.mine ? -1 : 1;
        return (b.year ?? 0) - (a.year ?? 0) || a.work.name.localeCompare(b.work.name, 'ko');
      })
      .slice(0, 80);
  }, [list.data, query, hintKey, myId]);

  const source = useQuery({
    queryKey: ['work-rollover-source', sourceId],
    queryFn: () => loadRolloverSource(sourceId!),
    enabled: open && !!sourceId,
    staleTime: 0,
  });

  // 원본을 고르면 모드·연도·담당 기본값을 정한다 — 원본이 지난해 이전이면 «이어가기», 올해 업무면 «참고»
  useEffect(() => {
    if (!source.data) return;
    const srcYear = inferWorkYear(source.data.work);
    const nowYear = academicYearOfDate(targetDate || today);
    const nextMode: ReferenceMode = srcYear != null && srcYear < nowYear ? 'continue' : 'reference';
    setMode(nextMode);
    setTargetYear(nextMode === 'continue' && srcYear != null ? Math.max(srcYear + 1, nowYear) : nowYear);
    setAssignMode(nextMode === 'continue' ? 'keep' : me ? 'me' : 'none');
    setSkipped(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.data]);

  const plan: RolloverPlan | null = useMemo(() => {
    if (!source.data) return null;
    const pick = new Set((source.data.work.tasks ?? []).map((t) => t.id).filter((id) => !skipped.has(id)));
    const base = planWorkRollover(source.data.work, {
      mode,
      targetYear,
      keepAssignees: assignMode === 'keep',
      assignAllTo: assignMode === 'me' && me ? { id: me.id, name: me.name } : null,
      activeResources: source.data.activeResources,
      taskIds: pick,
    });
    const fallback = me ? [{ id: me.id, name: me.name }] : base.managers.length === 0 && myId ? [{ id: myId, name: null }] : base.managers;
    const managers = managerIds ? managerIds.map((id) => ({ id, name: null })) : fallback;
    const autoName = mode === 'continue'
      ? base.name
      : defaultName || rolloverWorkName(source.data.work.name, base.sourceYear, targetYear).name;
    return { ...base, managers, name: nameTouched ? name : autoName };
  }, [source.data, mode, targetYear, assignMode, me, myId, managerIds, skipped, name, nameTouched, defaultName]);

  useEffect(() => {
    if (plan && !nameTouched) setName(plan.name);
  }, [plan, nameTouched]);

  const allTasks = source.data?.work.tasks ?? [];
  const actionCountByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of source.data?.actions ?? []) m.set(a.task_id, (m.get(a.task_id) ?? 0) + 1);
    return m;
  }, [source.data]);
  const planById = useMemo(() => new Map((plan?.tasks ?? []).map((t) => [t.sourceTaskId, t])), [plan]);
  const pickedActions = (source.data?.actions ?? []).filter((a) => !skipped.has(a.task_id));

  const existing = plan && mode === 'continue' ? findExistingRollover(list.data ?? [], plan.sourceWorkId, targetYear) : undefined;
  const fileCount = Array.isArray(source.data?.work.meta?.files) ? (source.data!.work.meta!.files as unknown[]).length : 0;
  const weekendCount = plan?.tasks.reduce((n, t) => n + t.dates.filter((d) => d.weekend).length, 0) ?? 0;
  const droppedPeople = useMemo(() => {
    if (!plan) return [];
    const names = new Set<string>();
    for (const m of plan.droppedManagers) if (!me) names.add(m.name || '이름 없음');
    for (const t of plan.tasks) for (const a of t.droppedAssignees) names.add(a.name || '이름 없음');
    return [...names];
  }, [plan, me]);
  const yearInvalid = !Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100;
  const canSubmit = !!plan && !existing && !yearInvalid && plan.managers.length > 0 && name.trim() !== '' && !saving;

  const handleSubmit = async () => {
    if (!plan || !source.data || !canSubmit) return;
    setSaving(true);
    let createdId: string | null = null;
    try {
      const workMeta: Record<string, unknown> = {};
      if (targetDate) workMeta.targetDate = targetDate;
      if (goal.trim()) workMeta.goal = goal.trim();
      if (startedIn) workMeta.startedIn = startedIn;
      const result = await executeWorkRollover(
        { ...plan, name: name.trim(), description: goal.trim() || plan.description },
        pickedActions,
        { tasks: extraTasks, workMeta },
      );
      createdId = result.workId;
      if (onCreate) await onCreate(result.workId, plan);
      // 원본으로 가는 «관련» 연결 — 작년 파일·기록은 이 연결로 연다. 실패해도 업무는 그대로 쓴다
      let linked = true;
      try {
        await linkObjects({ fromType: 'work', fromId: result.workId, toType: 'work', toId: plan.sourceWorkId, kind: 'related', note: mode === 'continue' ? '작년 같은 일' : '참고한 업무' });
      } catch {
        linked = false;
      }
      for (const key of [['works-jsonb'], ['my-tasks-jsonb'], ['work-detail-jsonb'], ['work-reference-list'], ['work-today'], ['work-room']]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const extra = [
        result.actionCount > 0 ? `작업 ${result.actionCount}개` : '',
        result.detachedSubmissions > 0 ? `양식을 다시 골라야 하는 제출 ${result.detachedSubmissions}건` : '',
        linked ? '' : '원본 연결은 남기지 못했습니다',
      ].filter(Boolean);
      toast.success(`할 일 ${result.taskCount}개로 시작했습니다${extra.length ? ` · ${extra.join(' · ')}` : ''}`);
      onOpenChange(false);
      onCreated?.(result.workId);
    } catch (error) {
      if (createdId) await supabase.from('work').delete().eq('id', createdId);
      toast.error(error instanceof Error ? error.message : '업무를 만들지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = (id: string) => setSkipped((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={History} />
            <div className="min-w-0">
              <DialogTitle className="text-base">{title ?? '참고해서 시작'}</DialogTitle>
              <DialogDescription className="text-xs">
                작년 같은 일이나 비슷한 일의 할 일·작업을 가져와 새 업무를 만듭니다. 진척·제출물·파일은 가져오지 않습니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* 1. 원본 */}
          <section className="space-y-2">
            <SectionLabel icon={Search}>무엇을 참고할까요</SectionLabel>
            {sourceId && !pickerOpen ? (() => {
              const picked = (list.data ?? []).find((w) => w.id === sourceId);
              return (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2">
                  <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600 ring-1 ring-slate-200">
                    {picked ? inferWorkYear(picked) ?? '연도 없음' : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-blue-900" title={picked?.name}>{picked?.name ?? '고른 업무'}</span>
                  <Button type="button" size="sm" variant="outline" className="min-h-11 shrink-0 bg-white sm:min-h-8" onClick={() => setPickerOpen(true)}>바꾸기</Button>
                </div>
              );
            })() : (<>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="업무 이름으로 찾기" className="h-9 text-base sm:text-sm" aria-label="참고할 업무 찾기" />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
              {list.isLoading ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">업무를 불러오는 중…</p>
              ) : candidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">찾는 업무가 없습니다</p>
              ) : (
                <ul role="listbox" aria-label="참고할 업무" className="divide-y divide-slate-100">
                  {candidates.map(({ work, year, score, mine }) => {
                    const selected = work.id === sourceId;
                    return (
                      <li key={work.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => { setSourceId(work.id); setPickerOpen(false); }}
                          className={cn(
                            'flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors sm:min-h-0',
                            selected ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50',
                          )}
                        >
                          <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600 ring-1 ring-slate-200">{year ?? '연도 없음'}</span>
                          <span className="min-w-0 flex-1 truncate" title={work.name}>{work.name}</span>
                          {score >= REFERENCE_SIMILAR_MIN && <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">비슷</span>}
                          {mine && <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline">내 업무</span>}
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">할 일 {work.tasks?.[0]?.count ?? 0}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            </>)}
          </section>

          {sourceId && source.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 원본을 읽는 중…
            </div>
          )}
          {source.error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{(source.error as Error).message}</p>
          )}

          {plan && (
            <>
              {/* 2. 어떻게 가져올까 */}
              <section className="space-y-2">
                <SectionLabel icon={Copy}>어떻게 가져올까요</SectionLabel>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="가져오는 방식">
                  {([
                    ['continue', '작년 같은 일 이어가기', '마감을 새 해로 옮기고 작년 지식을 잇습니다'],
                    ['reference', '비슷한 일 참고', '할 일·작업 모양만, 날짜는 비웁니다'],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      onClick={() => {
                        setMode(value);
                        setAssignMode(value === 'continue' ? 'keep' : me ? 'me' : 'none');
                        if (value === 'continue') setTargetYear((y) => Math.max(y, plan.sourceYear + 1));
                      }}
                      className={cn(
                        'min-h-11 rounded-lg border px-3 py-2 text-left transition-colors',
                        mode === value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <span className="block text-sm font-medium text-slate-800">{label}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 3. 새 업무 */}
              <section className="space-y-3">
                <SectionLabel icon={PenLine}>새 업무</SectionLabel>
                <div className={cn('grid gap-3', mode === 'continue' && 'sm:grid-cols-[1fr_7rem]')}>
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="ref-name" className="text-xs text-slate-600">업무 이름</Label>
                    <Input id="ref-name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} className="h-9 text-base sm:text-sm" />
                  </div>
                  {mode === 'continue' && (
                    <div className="space-y-1">
                      <Label htmlFor="ref-year" className="text-xs text-slate-600">학년도</Label>
                      <Input id="ref-year" type="number" inputMode="numeric" value={Number.isNaN(targetYear) ? '' : targetYear} onChange={(e) => setTargetYear(Number(e.target.value))} className="h-9 text-base tabular-nums sm:text-sm" />
                    </div>
                  )}
                </div>
                {mode === 'continue' && !plan.nameReplaced && !nameTouched && (
                  <p className="text-xs text-amber-700">이름에 {plan.sourceYear}년이 없어 그대로 가져옵니다. 올해 업무와 구분되게 고쳐 주세요.</p>
                )}
                {yearInvalid && <p className="text-xs text-rose-600">학년도를 확인해 주세요.</p>}
                {existing && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">이 업무는 이미 {targetYear}학년도로 이어 왔습니다 — “{existing.name}”. 그 업무에서 계속하거나, «비슷한 일 참고»로 만드세요.</span>
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                  <div className="space-y-1">
                    <Label htmlFor="ref-date" className="flex items-center gap-1 text-xs text-slate-600"><CalendarDays className="h-3 w-3" />목표일(선택)</Label>
                    <Input id="ref-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-9 text-base sm:text-sm" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="ref-goal" className="flex items-center gap-1 text-xs text-slate-600"><Target className="h-3 w-3" />목표 한 줄(선택)</Label>
                    <Input id="ref-goal" value={goal} maxLength={200} onChange={(e) => setGoal(e.target.value)} className="h-9 text-base sm:text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">책임자</Label>
                  <SearchableMultiSelect
                    filterByTeacher
                    includeTagOptions
                    selectedValues={plan.managers.map((m) => m.id)}
                    onSelectionChange={setManagerIds}
                    placeholder="책임자를 검색하거나 선택하세요"
                    searchPlaceholder="이름을 입력하세요"
                    emptyText="검색된 교직원이 없습니다"
                    maxSelectedDisplay={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-xs text-slate-600"><Users className="h-3 w-3" />할 일 담당</Label>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="할 일 담당">
                    {([
                      ['keep', '원본대로(재직자만)'],
                      ...(me ? [['me', '모두 나'] as const] : []),
                      ['none', '비워 두기'],
                    ] as Array<readonly [AssignMode, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={assignMode === value}
                        onClick={() => setAssignMode(value)}
                        className={cn(
                          'min-h-11 rounded-full border px-3 text-sm sm:min-h-8',
                          assignMode === value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* 4. 할 일 고르기 */}
              <section className="space-y-2">
                <SectionLabel
                  icon={ListChecks}
                  trailing={mode === 'continue' ? <span className="text-[11px] text-slate-400">{plan.sourceYear} → {targetYear}</span> : undefined}
                >
                  가져올 할 일 {plan.tasks.length}/{allTasks.length}
                </SectionLabel>
                {allTasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">할 일이 없는 업무입니다. 이름·설명만 가져옵니다.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {[...allTasks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((t) => {
                      const p = planById.get(t.id);
                      const on = !skipped.has(t.id);
                      const actions = actionCountByTask.get(t.id) ?? 0;
                      return (
                        <li key={t.id} className="min-w-0 px-3 py-2">
                          <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 sm:min-h-0">
                            <Checkbox checked={on} onCheckedChange={() => toggleTask(t.id)} aria-label={`${t.title} 가져오기`} />
                            <span className={cn('min-w-0 flex-1 truncate text-sm', on ? 'text-slate-800' : 'text-slate-400 line-through')} title={t.title}>{t.title}</span>
                            {actions > 0 && <span className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-slate-500"><Wrench className="h-3 w-3" aria-hidden />작업 {actions}</span>}
                            {p && <span className={cn('flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums', p.keptAssignees.length ? 'text-slate-500' : 'text-slate-400')}><Users className="h-3 w-3" aria-hidden />{p.keptAssignees.length ? `담당 ${p.keptAssignees.length}` : '담당 없음'}</span>}
                          </label>
                          {p && (p.dates.length > 0 || p.hadProgress) && (
                            <div className="flex flex-wrap items-center gap-1 pl-7">
                              {p.dates.map((d) => (
                                <span
                                  key={d.from}
                                  title={d.weekend ? '새 날짜가 주말입니다' : undefined}
                                  className={cn('rounded-md px-1.5 py-0.5 text-[11px] tabular-nums', d.weekend ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-slate-100 text-slate-600')}
                                >
                                  {formatDate(d.from)} → {formatDate(d.to)}{d.weekend ? ' 주말' : ''}
                                </span>
                              ))}
                              {p.hadProgress && <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">진척 초기화</span>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* 5. 알아둘 것 */}
              <section className="space-y-1.5 text-xs text-slate-600">
                {weekendCount > 0 && (
                  <p className="flex items-start gap-1.5 text-amber-800">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    마감 {weekendCount}건이 주말에 떨어집니다. 월·일을 그대로 옮겨 요일이 밀립니다 — 만든 뒤 고쳐 주세요.
                  </p>
                )}
                {droppedPeople.length > 0 && assignMode === 'keep' && (
                  <p className="flex items-start gap-1.5 text-rose-700">
                    <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">재직하지 않아 빠지는 사람: {droppedPeople.join(', ')}</span>
                  </p>
                )}
                {pickedActions.length > 0 && (
                  <p className="flex items-start gap-1.5">
                    <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    고른 할 일에 걸린 작업(제출 받기·입력 받기·문서 생성 등) {pickedActions.length}개도 함께 옮깁니다. 실행 이력은 가져오지 않습니다.
                  </p>
                )}
                {mode === 'reference' && (
                  <p className="flex items-start gap-1.5">
                    <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    비슷한 일은 계보로 잇지 않아 원본의 업무 지식은 새 업무의 «작년 지식»에 나오지 않습니다. 원본은 연결로 엽니다.
                  </p>
                )}
                <p className="flex items-start gap-1.5">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {fileCount > 0 ? `첨부 파일 ${fileCount}개는 복사하지 않습니다. ` : ''}새 업무의 «연결»에 원본 업무가 남아 파일·기록을 거기서 엽니다.
                </p>
              </section>
            </>
          )}
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button type="button" variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
          <Button type="button" className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')} onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
            만들기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
