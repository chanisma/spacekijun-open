// 공문 제안 카드의 버튼 셋 — [내 일로] · [다른 사람에게] · [참고만] (2026-11-08, P2)
// [내 일로]는 세 갈래(2026-11-12): 새 업무로 · 참고해서 새 업무로(«참고해서 시작» 창 — 작년 같은 일·비슷한 일) · 기존 업무에 할 일로.
// 새 업무를 만들면 곧장 그 작업실로 간다(«한 업무를 해내는» 화면이 먼저).
//
// 저장은 공문 판단함과 **같은** `saveDecision`(할 일·업무 만들기 → 결정 기록 → 실패하면 되돌리기). 판정(초안)은
// model/docSuggestion.ts. 교사의 선택도 결정 기록에 남아 다음 회차 AI 판정의 사례가 된다(P2 결정 ②).
// ⚠️ 결정은 지우지 않고 새 행으로 덮는다(판단함 규약) — 그래서 [참고만]에는 되돌리기가 없다. 토스트가 그 사실을 말한다.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FolderPlus, History, ListPlus, PenLine, Search, Sparkles, UserRoundPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { todayKeyKst } from '@/lib/taskVisibility';
import type { DecisionDraft } from '@/lib/officialDocDecision';
import type { PersonOption } from '@/lib/candidateToWork';
import { saveDecision, type OfficialDoc } from '@/features/official-docs/officialDocService';
import { useStaffRoster } from '@/features/official-docs/components/OfficialDocDecisionDialog';
import { WorkFromReferenceDialog } from '@/components/tasks/WorkFromReferenceDialog';
import {
  academicYearOf, acceptDraft, docDeadline, docHints, docWorkName, findPersonalBundle, infoDraft, newWorkDraft, personalBundleName,
  rankWorksForDoc, reassignDraft, RECOMMEND_MIN_SCORE, type MyWorkOption,
} from '../model/docSuggestion';
import { objectHref } from '../model/objectRef';

const TAP = 'min-h-11 sm:min-h-9';
/** 오른쪽 패널(업무노트, 2026-11-12) — 데스크톱은 작게(28px·12px), 휴대폰은 44px 그대로 */
const TAP_COMPACT = 'min-h-11 px-2.5 text-xs sm:h-7 sm:min-h-0';

/** 내가 책임자인 진행 중 업무 — [내 일로]의 후보 */
function useMyActiveWorks(myResourceId: string | null) {
  return useQuery({
    queryKey: ['work-today', 'my-active-works', myResourceId],
    enabled: !!myResourceId,
    queryFn: async (): Promise<MyWorkOption[]> => {
      const id = myResourceId!;
      const { data, error } = await (supabase as any).from('work')
        .select('id, name, meta')
        .eq('status', 'active')
        .or(`manager_id.eq.${id},meta->managers.cs.${JSON.stringify([{ id }])}`)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((w: { id: string; name: string; meta: { year?: number } | null }) => ({ id: w.id, name: w.name, year: w.meta?.year ?? null }));
    },
    staleTime: 60_000,
  });
}

export function DocSuggestionActions({ doc, me, compact = false }: { doc: OfficialDoc; me: PersonOption | null; compact?: boolean }) {
  const tap = compact ? TAP_COMPACT : TAP;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [chooseOpen, setChooseOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const today = todayKeyKst();
  const year = academicYearOf(today);
  const openRoom = (workId: string) => navigate(objectHref('work', workId));

  const save = useMutation({
    mutationFn: (draft: DecisionDraft) => saveDecision(doc, draft, { year, department: null }),
    onSuccess: (res, draft) => {
      void qc.invalidateQueries({ queryKey: ['work-today'] });
      void qc.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      setChooseOpen(false);
      setReassignOpen(false);
      if (draft.kind === 'create_work' && draft.workTargetDate !== undefined && res.workId) {
        // «새 업무로» — 곧장 작업실로(개인 묶음은 workTargetDate 가 없어 아래 갈래)
        toast.success('새 업무를 만들었습니다');
        openRoom(res.workId);
      } else if (draft.kind === 'link_work' || draft.kind === 'create_work') {
        toast.success('내 일이 되었습니다', res.workId
          ? { action: { label: '업무 보기', onClick: () => navigate(objectHref('work', res.workId!, res.taskId)) } }
          : undefined);
      } else if (draft.kind === 'reassign') {
        toast.success(`«${draft.assignees[0]?.name}» 일로 남겼습니다 — 공문 판단함 기록에 남습니다`);
      } else {
        toast.success('참고로 남겼습니다 — 공문 판단함 기록에 남아 비슷한 공문 판정에 쓰입니다');
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '남기지 못했습니다'),
  });

  if (!me) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" className={cn(tap, 'bg-blue-600 hover:bg-blue-700')} disabled={save.isPending} onClick={() => setChooseOpen(true)}>내 일로</Button>
      <Button size="sm" variant="outline" className={tap} disabled={save.isPending} onClick={() => setReassignOpen(true)}>다른 사람에게</Button>
      <Button size="sm" variant="ghost" className={cn(tap, 'text-slate-600')} disabled={save.isPending} onClick={() => save.mutate(infoDraft(doc, me))}>참고만</Button>
      {chooseOpen && (
        <ChooseWorkDialog
          doc={doc} me={me} year={year} today={today} saving={save.isPending} onOpenChange={setChooseOpen}
          onPick={(workId) => save.mutate(acceptDraft(doc, me, workId))}
          onNewWork={(name, targetDate) => save.mutate(newWorkDraft(doc, me, name, targetDate))}
          onReference={() => { setChooseOpen(false); setReferenceOpen(true); }}
        />
      )}
      <WorkFromReferenceDialog
        open={referenceOpen}
        onOpenChange={setReferenceOpen}
        title="공문 — 참고해서 새 업무로"
        hints={docHints(doc)}
        defaults={{ targetDate: docDeadline(doc) }}
        me={me}
        startedIn="official_doc"
        onCreate={async (workId, plan) => {
          // 공문 할 일(담당 = 나)을 새 업무에 넣고 판단함 결정 기록을 남긴다 — 실패하면 창이 만든 업무를 지운다
          await saveDecision(doc, newWorkDraft(doc, me, plan.name, docDeadline(doc)), {
            year, department: null, createdWorkId: workId, addDocTaskToCreated: true,
          });
        }}
        onCreated={(workId) => {
          void qc.invalidateQueries({ queryKey: ['work-today'] });
          openRoom(workId);
        }}
      />
      {reassignOpen && <ReassignDialog me={me} saving={save.isPending} onOpenChange={setReassignOpen} onPick={(to, reason) => save.mutate(reassignDraft(doc, me, to, reason))} />}
    </div>
  );
}

function ChooseWorkDialog({ doc, me, year, today, saving, onOpenChange, onPick, onNewWork, onReference }: {
  doc: OfficialDoc; me: PersonOption; year: number; today: string; saving: boolean;
  onOpenChange: (o: boolean) => void; onPick: (workId: string | null) => void;
  onNewWork: (name: string, targetDate: string | null) => void; onReference: () => void;
}) {
  // 세 갈래는 같은 모양의 한 줄 — 누르면 그 갈래만 펼친다(한 번에 하나, 2026-11-12 사용자 피드백).
  const [open, setOpen] = useState<'new' | 'existing' | null>(null);
  const toggle = (k: 'new' | 'existing') => setOpen((o) => (o === k ? null : k));
  const [newName, setNewName] = useState(() => docWorkName(doc));
  const [newDate, setNewDate] = useState(() => docDeadline(doc) ?? '');
  const { data: works = [], isLoading } = useMyActiveWorks(me.id);
  const bundle = findPersonalBundle(works, me.name, year);
  const ranked = useMemo(() => rankWorksForDoc(doc, works.filter((w) => w.id !== bundle?.id)), [doc, works, bundle?.id]);
  const recommended = ranked.filter((w) => w.score >= RECOMMEND_MIN_SCORE).slice(0, 5);
  const others = ranked.filter((w) => w.score < RECOMMEND_MIN_SCORE).slice(0, 10);
  const existingSub = isLoading
    ? '내 업무를 찾는 중…'
    : recommended.length > 0
      ? `가까운 업무: ${recommended[0].name}`
      : '내 업무나 «공문 모아 두기»에 넣습니다';
  const PANEL = 'mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3';

  const Option = ({ icon: Icon, title, sub, action, onClick, active }: {
    icon: typeof Sparkles; title: string; sub: string; action: string; onClick: () => void; active?: boolean;
  }) => (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 flex-none text-blue-600" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-800">{title}</span>
        <span className="block truncate text-xs text-slate-500" title={sub}>{sub}</span>
      </span>
      <Button size="sm" variant={active ? 'secondary' : 'outline'} className="min-h-11 flex-none sm:min-h-8" disabled={saving} onClick={onClick} aria-expanded={active}>
        {active ? '접기' : action}
      </Button>
    </div>
  );

  const Row = ({ label, sub, onClick, primary }: { label: string; sub?: string | null; onClick: () => void; primary?: boolean }) => (
    <li className="flex min-w-0 items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-800" title={label}>{label}</span>
        {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
      </span>
      <Button size="sm" variant={primary ? 'default' : 'outline'} className={cn('min-h-11 flex-none sm:min-h-8', primary && 'bg-blue-600 hover:bg-blue-700')} disabled={saving} onClick={onClick}>
        여기에
      </Button>
    </li>
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={FolderPlus} />
            <div className="min-w-0">
              <DialogTitle className="text-base">어떻게 내 일로 만들까요?</DialogTitle>
              <DialogDescription className="truncate text-xs" title={doc.title}>«{doc.title}» — 이 공문의 할 일이 생기고 담당은 나입니다</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          <ul className="divide-y divide-slate-100">
            <li className="py-2">
              <Option icon={Sparkles} title="새 업무로 시작" sub="이 공문이 첫 할 일이 되고 작업실이 열립니다" action="만들기" active={open === 'new'} onClick={() => toggle('new')} />
              {open === 'new' && (
                <form
                  className={cn(PANEL, 'space-y-2')}
                  onSubmit={(e) => { e.preventDefault(); if (newName.trim()) onNewWork(newName, newDate || null); }}
                >
                  <label className="block">
                    <span className="flex items-center gap-1 text-xs text-slate-600"><PenLine className="h-3 w-3" aria-hidden />무슨 일인가요</span>
                    <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} className="mt-1 text-base sm:text-sm" aria-label="새 업무 이름" />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="flex items-center gap-1 text-xs text-slate-600"><CalendarDays className="h-3 w-3" aria-hidden />언제까지(선택)</span>
                      <Input type="date" value={newDate} min={today} onChange={(e) => setNewDate(e.target.value)} className="mt-1 w-44 text-base sm:text-sm" aria-label="목표일" />
                    </label>
                    <Button type="submit" size="sm" className="min-h-11 bg-blue-600 hover:bg-blue-700 sm:min-h-9" disabled={saving || !newName.trim()}>
                      {saving ? '만드는 중…' : '작업실 열기'}
                    </Button>
                  </div>
                </form>
              )}
            </li>
            <li className="py-2">
              <Option icon={History} title="참고해서 새 업무로" sub="작년 같은 일·비슷한 일의 할 일과 작업을 가져옵니다" action="고르기" onClick={onReference} />
            </li>
            <li className="py-2">
              <Option icon={ListPlus} title="기존 업무에 할 일로" sub={existingSub} action="고르기" active={open === 'existing'} onClick={() => toggle('existing')} />
              {open === 'existing' && (
                <div className={PANEL}>
                  {isLoading ? <p className="py-1 text-sm text-slate-500">내 업무를 찾는 중…</p> : (
                    <>
                      {recommended.length > 0 && (
                        <>
                          <p className="text-[11px] text-slate-500">공문과 가까운 내 업무</p>
                          <ul className="divide-y divide-slate-100">
                            {recommended.map((w, i) => <Row key={w.id} label={w.name} primary={i === 0} onClick={() => onPick(w.id)} />)}
                          </ul>
                        </>
                      )}
                      <p className={cn('text-[11px] text-slate-500', recommended.length > 0 && 'mt-2')}>공문 모아 두기</p>
                      <ul className="divide-y divide-slate-100">
                        <Row
                          label={personalBundleName(me.name)}
                          sub={bundle ? '내 공문을 모아 두는 업무' : '처음이라 새로 만듭니다(책임자 = 나)'}
                          onClick={() => onPick(bundle?.id ?? null)}
                        />
                      </ul>
                      {others.length > 0 && (
                        <>
                          <p className="mt-2 text-[11px] text-slate-500">그 밖의 내 업무</p>
                          <ul className="divide-y divide-slate-100">
                            {others.map((w) => <Row key={w.id} label={w.name} onClick={() => onPick(w.id)} />)}
                          </ul>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          </ul>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)}>취소</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({ me, saving, onOpenChange, onPick }: {
  me: PersonOption; saving: boolean; onOpenChange: (o: boolean) => void; onPick: (to: PersonOption, reason: string) => void;
}) {
  const { data: roster = [], isLoading } = useStaffRoster();
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const list = roster.filter((p) => p.id !== me.id && (!q.trim() || p.name.includes(q.trim()))).slice(0, 30);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={UserRoundPlus} />
            <div className="min-w-0">
              <DialogTitle className="text-base">누구 일인가요?</DialogTitle>
              <DialogDescription className="text-xs">업무·할 일은 만들지 않고 누구 일인지만 공문 판단함 기록에 남깁니다. 그 사람에게 알림은 가지 않습니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-6">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 text-base sm:text-sm" placeholder="이름" aria-label="이름 찾기" />
          </label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="text-base sm:text-sm" placeholder="이유(선택) — 예: 상담부 업무" aria-label="이유" maxLength={200} />
          <ul className="divide-y divide-slate-100">
            {isLoading && <li className="py-3 text-sm text-slate-500">명단을 불러오는 중…</li>}
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{p.name}</span>
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-8" disabled={saving} onClick={() => onPick(p, reason)}>이 사람</Button>
              </li>
            ))}
          </ul>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)}>취소</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
