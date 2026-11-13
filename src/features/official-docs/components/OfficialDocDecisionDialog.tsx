// 공문 판단함 2단계 — 결정 창 (2026-10-30, 관리자 전용).
// AI 판정으로 초안을 채우고 사람이 고친 뒤 남긴다. 판정·저장 값 = src/lib/officialDocDecision.ts,
// 쓰기 = officialDocService.saveDecision. 후보로 «자세히 만들기»는 이 창을 닫고 후보 창을 연다(모달 겹치지 않음).
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, Gavel, ListChecks, Loader2, PlusSquare, Tag, Wand2 } from 'lucide-react';
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
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, SectionLabel, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import type { PersonOption } from '@/lib/candidateToWork';
import {
  DECISION_CHOICES, NATURES, initialDraft, validateDraft, type DecisionDraft,
} from '@/lib/officialDocDecision';
import { listActiveWorks, type OfficialDoc, type WorkOption } from '../officialDocService';

/** 교직원 명단 — 후보 창과 같은 쿼리 키(캐시 공유) */
export function useStaffRoster() {
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
  doc: OfficialDoc | null;
  /** 후속 공문이면 원 공문이 연결된 업무 — 같은 업무를 미리 고른다 */
  parentWorkId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSave: (doc: OfficialDoc, draft: DecisionDraft, work: WorkOption | null) => void;
  /** 후보 창으로 자세히 만들기 — 이 창을 닫고 부모가 후보 창을 연다 */
  onOpenCandidate: (doc: OfficialDoc, draft: DecisionDraft) => void;
}

export function OfficialDocDecisionDialog({ doc, parentWorkId = null, open, onOpenChange, saving, onSave, onOpenCandidate }: Props) {
  const { data: roster = [], isLoading: rosterLoading } = useStaffRoster();
  const { data: works = [] } = useQuery({ queryKey: ['official-docs', 'works'], queryFn: listActiveWorks, staleTime: 60_000, enabled: open });
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [workQuery, setWorkQuery] = useState('');

  useEffect(() => {
    if (!open) { setDraft(null); setWorkQuery(''); return; }
    if (doc && !draft && !rosterLoading) {
      const d = initialDraft(doc, roster);
      // AI 후보 id 가 올해 업무면 그 업무를 미리 고른다(후보면 후보 id 로 남긴다)
      const ids = (doc.triage?.result?.work_candidates ?? []).map((c) => c.id).filter(Boolean) as string[];
      const work = works.find((w) => ids.includes(w.id));
      if (work) { d.workId = work.id; if (d.candidateId === work.id) d.candidateId = null; }
      // 후속 공문: 원 공문을 업무에 연결해 두었으면 그 업무가 먼저다
      if (parentWorkId && works.some((w) => w.id === parentWorkId)) d.workId = parentWorkId;
      setDraft(d);
    }
  }, [open, doc, draft, roster, rosterLoading, works, parentWorkId]);

  const patch = (next: Partial<DecisionDraft>) => setDraft((d) => (d ? { ...d, ...next } : d));
  const error = draft ? validateDraft(draft) : null;
  const aiIds = useMemo(() => new Set((doc?.triage?.result?.work_candidates ?? []).map((c) => c.id).filter(Boolean) as string[]), [doc]);
  const workMatches = useMemo(() => {
    const q = workQuery.trim();
    const list = q ? works.filter((w) => w.name.includes(q) || (w.department ?? '').includes(q)) : works.filter((w) => aiIds.has(w.id));
    return list.slice(0, 8);
  }, [works, workQuery, aiIds]);
  const chosenWork = works.find((w) => w.id === draft?.workId) ?? null;
  const candidateName = (doc?.triage?.result?.work_candidates ?? []).find((c) => c.id === draft?.candidateId)?.name;

  if (!doc) return null;
  const needsTask = draft?.kind === 'link_work' || draft?.kind === 'create_work';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className={cn(DIALOG_HEADER_CLASS, 'shrink-0 rounded-t-lg')}>
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <TitleIconChip icon={Gavel} />
            <span className="truncate" title={doc.title}>공문 결정 — {doc.title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            AI 판정으로 채운 초안입니다. 고친 뒤 남기세요 — 결정과 이유는 다음 판정의 지식이 됩니다.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            {doc.triage?.question && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">AI 의 질문: {doc.triage.question}</p>
            )}

            <section className="space-y-2">
              <SectionLabel icon={ListChecks}>무엇을 할까요</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {DECISION_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => patch({ kind: c.value })}
                    className={cn('min-h-[44px] rounded-lg border px-3 py-2 text-left text-sm',
                      draft.kind === c.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50')}
                  >
                    <div className="font-medium text-slate-900">{c.label}</div>
                    <div className="text-xs text-slate-500">{c.hint}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <SectionLabel icon={Tag}>공문의 성격</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {NATURES.map((n) => (
                  <Button key={n} type="button" size="sm" variant={draft.nature === n ? 'default' : 'outline'}
                    className={draft.nature === n ? 'bg-blue-600 hover:bg-blue-700' : ''} onClick={() => patch({ nature: n })}>
                    {n}
                  </Button>
                ))}
              </div>
            </section>

            {draft.kind === 'link_work' && (
              <section className="space-y-2">
                <SectionLabel icon={Briefcase}>연결할 업무</SectionLabel>
                {chosenWork && (
                  <p className="text-sm">고름: <span className="font-medium">{chosenWork.name}</span>
                    {chosenWork.department && <span className="text-slate-500"> · {chosenWork.department}</span>}
                    {aiIds.has(chosenWork.id) && <span className="ml-1 text-xs text-blue-600">AI 후보</span>}
                  </p>
                )}
                <Input value={workQuery} onChange={(e) => setWorkQuery(e.target.value)} placeholder="업무 이름·부서로 찾기" className="text-base sm:text-sm" />
                <div className="space-y-1">
                  {workMatches.map((w) => (
                    <button key={w.id} type="button" onClick={() => patch({ workId: w.id })}
                      className={cn('flex w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm',
                        draft.workId === w.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50')}>
                      <span className="min-w-0 flex-1 truncate">{w.name}</span>
                      {w.department && <span className="shrink-0 text-xs text-slate-500">{w.department}</span>}
                      {aiIds.has(w.id) && <span className="shrink-0 text-xs text-blue-600">AI 후보</span>}
                    </button>
                  ))}
                  {workMatches.length === 0 && (
                    <p className="text-xs text-slate-500">{workQuery ? '맞는 업무가 없습니다 — «새 업무 만들기»를 고르세요.' : 'AI 가 고른 올해 업무가 없습니다 — 이름으로 찾아 고르세요.'}</p>
                  )}
                </div>
              </section>
            )}

            {draft.kind === 'create_work' && (
              <section className="space-y-2">
                <SectionLabel icon={PlusSquare}>새 업무</SectionLabel>
                <div className="space-y-1">
                  <Label className="text-xs">업무 이름</Label>
                  <Input value={draft.newWorkName} onChange={(e) => patch({ newWorkName: e.target.value })} className="text-base sm:text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">책임자</Label>
                  <SearchableMultiSelect filterByTeacher selectedValues={draft.managers.map((m) => m.id)}
                    onSelectionChange={(ids) => patch({ managers: ids.map((id) => roster.find((r) => r.id === id) ?? { id, name: '' }) })}
                    placeholder="책임자를 고르세요" searchPlaceholder="이름 검색" emptyText="검색된 사람이 없습니다" maxSelectedDisplay={3} />
                </div>
                {draft.candidateId && candidateName && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpenCandidate(doc, draft)}>
                    <Wand2 className="mr-1 h-4 w-4" /> 업무 후보 «{candidateName}»의 절차로 자세히 만들기
                  </Button>
                )}
              </section>
            )}

            {needsTask && (
              <section className="space-y-2">
                <SectionLabel icon={CalendarClock}>이 공문의 할 일</SectionLabel>
                <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                  <div className="space-y-1">
                    <Label className="text-xs">제목</Label>
                    <Input value={draft.taskTitle} onChange={(e) => patch({ taskTitle: e.target.value })} className="text-base sm:text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">기한</Label>
                    <Input type="date" value={draft.taskDue ?? ''} onChange={(e) => patch({ taskDue: e.target.value || null })} className="text-base sm:text-sm" />
                  </div>
                </div>
              </section>
            )}

            {(needsTask || draft.kind === 'reassign') && (
              <section className="space-y-1">
                <Label className="text-xs">{draft.kind === 'reassign' ? '누구 일인가요' : '담당자'} <span className="font-normal text-slate-400">— 정해지면 그 사람에게 할 일이 배정됩니다</span></Label>
                <SearchableMultiSelect filterByTeacher selectedValues={draft.assignees.map((a) => a.id)}
                  onSelectionChange={(ids) => patch({ assignees: ids.map((id) => roster.find((r) => r.id === id) ?? { id, name: '' }) })}
                  placeholder="사람을 고르세요" searchPlaceholder="이름 검색" emptyText="검색된 사람이 없습니다" maxSelectedDisplay={3} />
              </section>
            )}

            <section className="space-y-1">
              <Label className="text-xs">판단 이유 <span className="font-normal text-slate-400">— 다음에 같은 공문이 오면 «이전에 받은 비슷한 공문»에 함께 보입니다</span></Label>
              <Textarea rows={2} value={draft.reason} onChange={(e) => patch({ reason: e.target.value })}
                placeholder="예: 수의계약 자료는 행정실 계약 담당이 모은다" />
            </section>

          </div>
        )}

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, 'shrink-0 items-center rounded-b-lg')}>
          {error && <span className="mr-auto text-xs text-rose-600">{error}</span>}
          <Button variant="ghost" className={FOOTER_BUTTON_CLASS} onClick={() => onOpenChange(false)} disabled={saving}>닫기</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" disabled={!draft || !!error || saving}
            onClick={() => draft && onSave(doc, draft, chosenWork)}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 결정 남기기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
