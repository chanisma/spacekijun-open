/**
 * 업무 후보 → 업무 만들기 창 (2026-10-05 사용자 요청).
 *
 * 후보를 **그대로 옮기지 않는다** — 기존 분석(절차 검토·일회성 분석·상세·분장 자리)으로 초안을 채우고,
 * 사람이 업무 이름·설명·부서·매니저·학년도와 할 일(제목·종류·순서·기한·담당자·설명)을 고친 뒤 만든다.
 * 판정·초안·저장 값은 전부 `src/lib/candidateToWork.ts`, 쓰기는 `candidateWorkService.ts`.
 *
 * 만든 업무에는 «어느 후보에서 왔는지»(`meta.fromCandidate`)가 남는다 — 지도는 그 후보를 «업무로 만듦»으로
 * 표시하고 후보 수에서 뺀다. 후보 자체는 지우지 않는다(분석 결과이고, 시드가 다시 넣는다).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { useDepartments } from '@/hooks/useDepartments';
import { useDutySeats } from '@/hooks/useDutySeats';
import { useWorkCandidateProcedures } from '@/hooks/useWorkCandidates';
import { activeHolders, referenceDateForYear } from '@/lib/dutySeats';
import type { WorkCandidate } from '@/lib/workCandidates';
import {
  buildCandidateWorkDraft,
  draftToInsert,
  newDraftKey,
  onceOptions,
  procedureBases,
  retargetDraftYear,
  validateCandidateWorkDraft,
  type CandidateWorkDraft,
  type DraftTask,
  type PersonOption,
} from '@/lib/candidateToWork';
import { createWorkFromCandidate } from '@/services/candidateWorkService';

/** 교직원 명단 — 이름으로 사람을 찾고(정확히 한 명일 때만) 선택기의 id 를 이름으로 되돌린다 */
function useStaffRoster() {
  return useQuery({
    queryKey: ['candidate-work-roster'],
    queryFn: async (): Promise<PersonOption[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name')
        .in('type', ['teacher', 'staff'])
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
    },
    staleTime: 5 * 60_000,
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: WorkCandidate;
  /** 이미 이 후보로 만든 업무(있으면 경고) */
  existing?: { workId: string; workName: string } | null;
  /** 만든 뒤 — 주면 업무 화면으로 옮기지 않고 이것을 부른다(공문 판단함이 결정을 이어 남긴다, 2026-10-30) */
  onCreated?: (result: { workId: string; workName: string }) => void | Promise<void>;
  /** 업무 meta 에 더할 값(예: 공문 링크 `fromOfficialDoc`) */
  extraWorkMeta?: Record<string, unknown>;
}

export function CandidateWorkDialog({ open, onOpenChange, candidate, existing, onCreated, extraWorkMeta }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: roster = [], isLoading: rosterLoading } = useStaffRoster();
  const { departments } = useDepartments({ source: 'database', category: 'school' });
  const { data: seats = [], isLoading: seatsLoading } = useDutySeats(candidate.academic_year);
  const proceduresQuery = useWorkCandidateProcedures(candidate.id);
  const entries = useMemo(() => proceduresQuery.data ?? [], [proceduresQuery.data]);
  const bases = useMemo(() => procedureBases(entries), [entries]);
  const onces = useMemo(() => onceOptions(entries), [entries]);

  // 바탕 고르기 — 절차가 있으면 단계 많은 사람을 기본으로
  const [basePerson, setBasePerson] = useState<string | null | undefined>(undefined);
  const [onceSelected, setOnceSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<CandidateWorkDraft | null>(null);
  const [saving, setSaving] = useState(false);

  /** 분장 자리의 기준일 담당자 = 매니저 기본값 */
  const seatManagers = useMemo<PersonOption[]>(() => {
    const seat = seats.find((s) => s.id === candidate.seat_id);
    if (!seat) return [];
    const holders = activeHolders(seat, referenceDateForYear(candidate.academic_year));
    return holders
      .filter((h) => h.resource_id)
      .map((h) => ({ id: h.resource_id as string, name: h.holder_name }));
  }, [seats, candidate.seat_id, candidate.academic_year]);

  const ready = !rosterLoading && !seatsLoading && !proceduresQuery.isLoading;

  const rebuild = (person: string | null, onceKeys: Set<string>, year?: number) => {
    const chosen = person ? bases.find((b) => b.person === person) ?? null : null;
    setDraft((prev) => buildCandidateWorkDraft({
      candidate,
      base: chosen,
      once: onces.filter((o) => onceKeys.has(o.person + o.summary)),
      targetYear: year ?? prev?.year ?? candidate.academic_year,
      roster,
      managers: prev?.managers.length ? prev.managers : seatManagers,
    }));
  };

  // 처음 열 때 한 번 — 자료가 다 오면 초안을 만든다
  useEffect(() => {
    if (!open || !ready || draft) return;
    const first = bases[0]?.person ?? null;
    setBasePerson(first);
    rebuild(first, new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, draft, bases]);

  const patch = (next: Partial<CandidateWorkDraft>) => setDraft((d) => (d ? { ...d, ...next } : d));
  const patchTask = (key: string, next: Partial<DraftTask>) =>
    setDraft((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.key === key ? { ...t, ...next } : t)) } : d));
  const moveTask = (key: string, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const i = d.tasks.findIndex((t) => t.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.tasks.length) return d;
    const tasks = [...d.tasks];
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    return { ...d, tasks };
  });
  const addTask = (type: DraftTask['type']) => setDraft((d) => (d ? {
    ...d,
    tasks: [...d.tasks, { key: newDraftKey('n'), type, title: '', description: '', due: null, assignees: [], unmatched: [], source: '직접 추가' }],
  } : d));

  const yearOptions = [candidate.academic_year, candidate.academic_year + 1];
  const error = draft ? validateCandidateWorkDraft(draft) : null;
  const stepCount = draft?.tasks.filter((t) => t.type === 'procedural').length ?? 0;

  const handleCreate = async () => {
    if (!draft || error) return;
    setSaving(true);
    try {
      const insert = draftToInsert(draft, candidate);
      if (extraWorkMeta) insert.work.meta = { ...insert.work.meta, ...extraWorkMeta };
      const result = await createWorkFromCandidate(insert);
      await queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
      toast.success(`「${draft.name}」 업무를 만들었습니다 — 할 일 ${result.taskCount}개`);
      onOpenChange(false);
      if (onCreated) await onCreated({ workId: result.workId, workName: draft.name });
      else navigate({ search: `?work=${result.workId}` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업무를 만들지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className={cn(DIALOG_HEADER_CLASS, 'shrink-0 rounded-t-lg')}>
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <TitleIconChip icon={Wand2} />
            <span className="truncate" title={candidate.name}>후보를 업무로 만들기 — {candidate.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            기존 분석(절차 검토·일회성 분석·분장 자리)으로 초안을 채웠습니다. 고친 뒤 만드세요 — 후보는 그대로 남습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {existing && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">이 후보로 이미 만든 업무가 있습니다 — «<b className="break-all">{existing.workName}</b>». 또 만들면 같은 일이 두 업무로 갈라집니다.</span>
            </p>
          )}

          {!ready || !draft ? (
            <p className="flex items-center justify-center py-10 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />후보 분석을 불러오는 중
            </p>
          ) : (
            <>
              {/* ── 업무 ── */}
              <section className="space-y-3">
                <p className="text-xs font-semibold text-slate-500">업무</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">업무 이름</Label>
                    <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">부서</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={draft.department ?? ''}
                      onChange={(e) => patch({ department: e.target.value || null })}
                    >
                      <option value="">부서 없음</option>
                      {[...new Set([...(draft.department ? [draft.department] : []), ...departments])].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">학년도</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={draft.year}
                      onChange={(e) => setDraft(retargetDraftYear(draft, Number(e.target.value)))}
                    >
                      {yearOptions.map((y) => <option key={y} value={y}>{y}학년도</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">설명</Label>
                  <Textarea rows={3} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">책임자 <span className="font-normal text-slate-400">— 기본값 = 분장 자리 «{candidate.seat_label ?? '없음'}»의 지금 담당자</span></Label>
                  <SearchableMultiSelect
                    filterByTeacher
                    selectedValues={draft.managers.map((m) => m.id)}
                    onSelectionChange={(ids) => patch({
                      managers: ids.map((id) => roster.find((r) => r.id === id) ?? { id, name: '' }),
                    })}
                    placeholder="책임자를 고르세요"
                    searchPlaceholder="이름 검색"
                    emptyText="검색된 사람이 없습니다"
                    maxSelectedDisplay={3}
                  />
                </div>
              </section>

              {/* ── 할 일 초안의 바탕 ── */}
              <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-600">할 일 초안의 바탕</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => rebuild(basePerson ?? null, onceSelected)}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />이 바탕으로 할 일 다시 채우기
                  </Button>
                </div>
                <p className="text-[11px] leading-4 text-slate-500">
                  절차 검토(2026-09-29)가 찾은 «사람별 절차» 가운데 하나를 순서 있는 할 일로 씁니다. 다시 채우면 아래에서 고친 할 일은 사라집니다.
                </p>
                {bases.length === 0 ? (
                  <p className="text-xs text-slate-400">이 후보에는 단계가 있는 절차 검토가 없습니다 — 할 일을 직접 더하세요.</p>
                ) : (
                  <div className="space-y-1">
                    {[...bases.map((b) => b.person), null].map((person) => {
                      const b = person ? bases.find((x) => x.person === person)! : null;
                      return (
                        <label key={person ?? 'none'} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white">
                          <input
                            type="radio"
                            className="mt-0.5"
                            checked={(basePerson ?? null) === person}
                            onChange={() => setBasePerson(person)}
                          />
                          {b ? (
                            <span className="min-w-0">
                              <b className="text-slate-700">{b.person}</b> 선생님의 절차 · {b.steps.length}단계
                              {b.cycle ? ` · ${b.cycle}` : ''}
                              <span className="block truncate text-slate-500" title={b.summary}>{b.summary}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">절차 없이(일회성·직접 추가만)</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {onces.length > 0 && (
                  <div className="space-y-1 border-t border-slate-200 pt-2">
                    <p className="text-[11px] font-medium text-slate-500">일회성 할 일로 덧붙이기 — 일회성 분석에서 «업무로 올릴 만함»</p>
                    {onces.map((o) => {
                      const k = o.person + o.summary;
                      return (
                        <label key={k} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-white">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={onceSelected.has(k)}
                            onChange={(e) => setOnceSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(k); else next.delete(k);
                              return next;
                            })}
                          />
                          <span className="min-w-0"><b className="text-slate-700">{o.person}</b> · {o.once?.action} — <span className="text-slate-500">{o.summary}</span></span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── 할 일 ── */}
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500">
                    할 일 {draft.tasks.length}개 <span className="font-normal text-slate-400">· 순서 있는 단계 {stepCount}개</span>
                  </p>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => addTask('procedural')}>
                      <Plus className="mr-1 h-3.5 w-3.5" />단계
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => addTask('one_time')}>
                      <Plus className="mr-1 h-3.5 w-3.5" />일회성
                    </Button>
                  </div>
                </div>
                {draft.tasks.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">할 일이 없습니다 — 업무만 만들어도 됩니다.</p>
                )}
                <ol className="space-y-2">
                  {draft.tasks.map((t, i) => {
                    const stepNo = draft.tasks.slice(0, i + 1).filter((x) => x.type === 'procedural').length;
                    return (
                      <li key={t.key} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label="할 일 종류"
                            className={cn(
                              'h-8 rounded-md border px-1.5 text-xs font-medium',
                              t.type === 'procedural' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600',
                            )}
                            value={t.type}
                            onChange={(e) => patchTask(t.key, { type: e.target.value as DraftTask['type'] })}
                          >
                            <option value="procedural">{t.type === 'procedural' ? `${stepNo}단계` : '단계'}</option>
                            <option value="one_time">일회성</option>
                          </select>
                          {/* 휴대폰에서는 제목이 한 줄을 통째로 쓴다 — 종류·날짜·버튼과 한 줄이면 제목이 「국제교…」로 줄었다(스크린샷) */}
                          <Input
                            className="order-last h-8 w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1"
                            value={t.title}
                            placeholder="할 일 제목"
                            onChange={(e) => patchTask(t.key, { title: e.target.value })}
                          />
                          <Input
                            type="date"
                            aria-label="기한"
                            className="h-8 w-[9.5rem] text-xs"
                            value={t.due ?? ''}
                            onChange={(e) => patchTask(t.key, { due: e.target.value || null })}
                          />
                          <div className="ml-auto flex shrink-0 sm:ml-0">
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => moveTask(t.key, -1)} aria-label="위로"><ArrowUp className="h-3.5 w-3.5" /></Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={i === draft.tasks.length - 1} onClick={() => moveTask(t.key, 1)} aria-label="아래로"><ArrowDown className="h-3.5 w-3.5" /></Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-rose-600" onClick={() => patch({ tasks: draft.tasks.filter((x) => x.key !== t.key) })} aria-label="빼기"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <SearchableMultiSelect
                            filterByTeacher
                            selectedValues={t.assignees.map((a) => a.id)}
                            onSelectionChange={(ids) => patchTask(t.key, {
                              assignees: ids.map((id) => roster.find((r) => r.id === id) ?? { id, name: '' }),
                            })}
                            placeholder="담당자"
                            searchPlaceholder="이름 검색"
                            emptyText="검색된 사람이 없습니다"
                            maxSelectedDisplay={2}
                          />
                          <Textarea
                            rows={2}
                            className="min-h-0 text-xs"
                            value={t.description}
                            placeholder="설명(선택)"
                            onChange={(e) => patchTask(t.key, { description: e.target.value })}
                          />
                        </div>
                        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                          <span>{t.source}</span>
                          {t.unmatched.length > 0 && (
                            <span className="text-amber-700">이름으로 사람을 못 찾음: {t.unmatched.join(', ')} — 담당자를 직접 고르세요</span>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </>
          )}
        </div>

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, 'shrink-0 rounded-b-lg')}>
          {error && draft && <p className="mr-auto text-xs text-rose-600">{error}</p>}
          <Button variant="ghost" size="sm" className={FOOTER_BUTTON_CLASS} disabled={saving} onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            size="sm"
            className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
            disabled={!draft || !!error || saving}
            onClick={() => void handleCreate()}
          >
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            업무 만들기{draft ? ` · 할 일 ${draft.tasks.length}개` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

