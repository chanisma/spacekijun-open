// 동아리 편성 (2026-11-11 P4) — 사용자 결정: 학생은 지망만, 결정은 면접(기장이 결과 입력) → 지도교사가 명단 확정.
//   RecruitAdmin   담당자: 편성 회차·동아리별 지원 현황·미배정 · 자율동아리 개설 신청 심사 · 새 학년도 준비
//   ApplicantsTab  한 장 보기 «지원»: 기장·지도교사가 면접 결과를 적고, 지도교사가 합격자를 명단에 넣는다
//   StudentRecruit 학생: 열린 회차에 지망 내기 · 내 지원 상태 · 자율동아리 개설 신청
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarRange, Check, ClipboardCheck, Flag, Plus, RefreshCcw, Send, Sparkles, UserCheck, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useApplications, useClubMutation, useProposals, useRecruit, useRecruits } from '../hooks/useClubs';
import {
  applyRecruit, decideProposal, finalizeApplications, judgeApplications, proposeAutonomous, rollOver, saveRecruit, withdrawApplication,
} from '../services/clubService';
import { useViewAsReadOnly, VIEW_AS_READONLY_TITLE } from '../viewAs';
import { APPLICATION_STATUS_LABEL, personLabel, type ApplicationStatus, type ClubDetail, type ClubProposal, type ClubRecruitDetail } from '../types';
import { Card, PanelTitle } from './panel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS_TONE: Record<ApplicationStatus, string> = {
  applied: 'bg-slate-100 text-slate-700', accepted: 'bg-blue-50 text-blue-700', rejected: 'bg-rose-50 text-rose-700',
  withdrawn: 'bg-slate-50 text-slate-400', enrolled: 'bg-emerald-50 text-emerald-700',
};

// ───────────────────────── 담당자 ─────────────────────────
export function RecruitAdmin({ year, onOpenClub }: { year: number; onOpenClub: (id: string) => void }) {
  const { data: rounds = [], isLoading } = useRecruits(year);
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rollOpen, setRollOpen] = useState(false);
  useEffect(() => { if (!selected && rounds.length) setSelected(rounds[0].id); }, [rounds, selected]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" />편성 회차 열기</Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setRollOpen(true)}><RefreshCcw className="h-3.5 w-3.5" />{year + 1}학년도 준비</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="p-2">
          <div className="px-2 pb-1 pt-1"><PanelTitle icon={CalendarRange}>편성 회차 {rounds.length}</PanelTitle></div>
          {isLoading ? <Skeleton className="h-20" /> : rounds.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">아직 연 회차가 없습니다.</p> : (
            <ul className="space-y-0.5">
              {rounds.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)}
                    className={cn('flex min-h-[44px] w-full flex-col justify-center rounded-lg px-2 text-left hover:bg-slate-50', selected === r.id && 'bg-blue-50 hover:bg-blue-50')}>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <span className="truncate">{r.title}</span>
                      {r.is_open && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-label="받는 중" />}
                    </span>
                    <span className="flex flex-wrap gap-x-1.5 text-[11px] text-slate-500">
                      <span className="whitespace-nowrap">{fmt(r.opens_at)} ~</span><span className="whitespace-nowrap">{fmt(r.closes_at)}</span>
                      <span className="whitespace-nowrap">· 지원 {r.applications}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {selected ? <RoundDetail id={selected} onOpenClub={onOpenClub} /> : <Card className="text-sm text-slate-500">회차를 고르세요.</Card>}
      </div>
      <ProposalsCard year={year} />
      <RecruitFormDialog open={createOpen} onOpenChange={setCreateOpen} year={year} onSaved={setSelected} />
      <RollOverDialog open={rollOpen} onOpenChange={setRollOpen} from={year} />
    </div>
  );
}

function RoundDetail({ id, onOpenClub }: { id: string; onOpenClub: (id: string) => void }) {
  const { data: r } = useRecruit(id);
  const close = useClubMutation(() => saveRecruit(id, { status: r?.status === 'open' ? 'closed' : 'open' }));
  if (!r) return <Skeleton className="h-60 rounded-xl" />;
  const totalApplied = r.clubs.reduce((s, c) => s + c.applied, 0);
  return (
    <Card className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900">{r.title}</h3>
          <p className="text-xs text-slate-500">
            {r.target_grades.join('·')}학년 · 지망 {r.max_choices}개 · {fmt(r.opens_at)} ~ {fmt(r.closes_at)}
            {r.is_open ? <span className="ml-1 text-blue-700">받는 중</span> : <span className="ml-1">마감</span>}
          </p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => close.mutate(undefined)}>{r.status === 'open' ? '지금 마감' : '다시 열기'}</Button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">지원 {totalApplied}건</span>
        {r.unassigned != null && <span className={cn('rounded-full px-2 py-0.5', r.unassigned ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700')}>정규 동아리 미배정 {r.unassigned}명</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead><tr className="border-b text-left text-[11px] text-slate-500">
            <th className="py-1.5 pr-2 font-medium">동아리</th><th className="py-1.5 pr-2 text-right font-medium">정원</th>
            <th className="py-1.5 pr-2 text-right font-medium">지원</th><th className="py-1.5 pr-2 text-right font-medium">합격</th><th className="py-1.5 text-right font-medium">확정</th>
          </tr></thead>
          <tbody>
            {r.clubs.map((c) => (
              <tr key={c.club_year_id} className="cursor-pointer border-b last:border-0 hover:bg-blue-50/40" onClick={() => onOpenClub(c.club_year_id)}>
                <td className="py-1.5 pr-2"><span className="block truncate">{c.name}</span></td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{c.capacity ?? '—'}</td>
                <td className={cn('py-1.5 pr-2 text-right tabular-nums', c.capacity && c.applied > c.capacity && 'font-medium text-amber-700')}>{c.applied}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-blue-700">{c.accepted}</td>
                <td className="py-1.5 text-right tabular-nums text-emerald-700">{c.enrolled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">면접 결과는 각 동아리 «지원» 탭에서 기장·지도교사가 적고, 지도교사가 합격자를 명단에 넣습니다. 미배정 학생은 동아리 «부원»에서 직접 넣습니다.</p>
    </Card>
  );
}

function RecruitFormDialog({ open, onOpenChange, year, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; year: number; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [grades, setGrades] = useState<number[]>([1, 2]);
  const [max, setMax] = useState('3');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<'regular' | 'autonomous' | 'all'>('regular');
  const [guide, setGuide] = useState('');
  useEffect(() => { if (open) { setTitle(`${year}학년도 동아리 지원`); setGrades([1, 2]); setMax('3'); setFrom(''); setTo(''); setKind('regular'); setGuide(''); } }, [open, year]);
  const save = useClubMutation(() => {
    if (!from || !to) throw new Error('지원 기간을 정해 주세요');
    return saveRecruit(null, { academic_year: year, title: title.trim(), target_grades: grades, max_choices: Number(max), kind,
      opens_at: new Date(from).toISOString(), closes_at: new Date(to).toISOString(), guide });
  }, { success: () => '편성 회차를 열었습니다 — 학생 «동아리» 화면에 지원 안내가 뜹니다' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5"><TitleIconChip icon={CalendarRange} />
            <div><DialogTitle className="text-base">편성 회차 열기</DialogTitle><DialogDescription className="text-xs">학생이 지망을 내는 기간입니다. 결정은 면접 뒤 각 동아리에서 합니다.</DialogDescription></div>
          </div>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="space-y-1.5"><Label htmlFor="rc-title">이름</Label><Input id="rc-title" value={title} onChange={(e) => setTitle(e.target.value)} className="text-base sm:text-sm" /></div>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5"><Label>대상 학년</Label>
              <div className="flex gap-3">{[1, 2, 3].map((g) => (
                <label key={g} className="flex min-h-[36px] items-center gap-1.5 text-sm"><Checkbox checked={grades.includes(g)}
                  onCheckedChange={(v) => setGrades((p) => (v === true ? [...p, g].sort() : p.filter((x) => x !== g)))} />{g}학년</label>
              ))}</div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="rc-max">지망 수</Label><Input id="rc-max" inputMode="numeric" className="w-20 text-base sm:text-sm" value={max} onChange={(e) => setMax(e.target.value.replace(/[^1-5]/g, '').slice(0, 1))} /></div>
            <div className="space-y-1.5"><Label>동아리</Label>
              <div className="flex gap-1">{(['regular', 'autonomous', 'all'] as const).map((k) => (
                <Button key={k} type="button" size="sm" variant={kind === k ? 'default' : 'outline'} className={cn('h-9 text-xs', kind === k && 'bg-blue-600 hover:bg-blue-700')} onClick={() => setKind(k)}>
                  {k === 'regular' ? '정규' : k === 'autonomous' ? '자율' : '전부'}</Button>
              ))}</div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="rc-from">시작</Label><Input id="rc-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="text-base sm:text-sm" /></div>
            <div className="space-y-1.5"><Label htmlFor="rc-to">마감</Label><Input id="rc-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="text-base sm:text-sm" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rc-guide">학생 안내</Label><Textarea id="rc-guide" rows={2} value={guide} onChange={(e) => setGuide(e.target.value)} className="text-base sm:text-sm" placeholder="면접 일정·주의할 점" /></div>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={!title.trim() || grades.length === 0 || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: (r) => { onOpenChange(false); onSaved(r.id); } })}><Check className="h-3.5 w-3.5" />열기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RollOverDialog({ open, onOpenChange, from }: { open: boolean; onOpenChange: (o: boolean) => void; from: number }) {
  const [carry, setCarry] = useState(true);
  const [preview, setPreview] = useState<{ clubs: number; skipped: string[] } | null>(null);
  useEffect(() => { if (open) setPreview(null); }, [open, carry]);
  const check = useClubMutation(() => rollOver(from, from + 1, carry, true));
  const run = useClubMutation(() => rollOver(from, from + 1, carry, false),
    { success: (r) => `${from + 1}학년도 동아리 ${r.clubs}곳을 만들었습니다${carry ? ` — 이월 부원 ${r.carried_members}명은 지도교사 확인 대기` : ''}` });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5"><TitleIconChip icon={RefreshCcw} />
            <div><DialogTitle className="text-base">{from + 1}학년도 준비</DialogTitle><DialogDescription className="text-xs">올해 활동 중인 동아리를 같은 동아리로 이어 새 학년도 운영 단위를 만듭니다(지도교사 복사).</DialogDescription></div>
          </div>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={carry} onCheckedChange={(v) => setCarry(v === true)} className="mt-0.5" />
            <span>1·2학년 부원을 «확인 대기»로 이월(지도교사가 확정) — 졸업생·3학년은 빠집니다</span></label>
          {preview && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">새로 만들 동아리 {preview.clubs}곳{preview.skipped.length ? ` · 이미 있어 건너뜀 ${preview.skipped.length}곳` : ''}</p>}
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          {!preview ? (
            <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={check.isPending} onClick={() => check.mutate(undefined, { onSuccess: setPreview })}><Check className="h-3.5 w-3.5" />미리 보기</Button>
          ) : (
            <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={run.isPending || preview.clubs === 0} onClick={() => run.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>만들기</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProposalsCard({ year }: { year: number }) {
  const { data = [] } = useProposals(year);
  const [deciding, setDeciding] = useState<ClubProposal | null>(null);
  const pending = data.filter((p) => p.status === 'proposed');
  if (data.length === 0) return null;
  return (
    <Card>
      <PanelTitle icon={Sparkles}>자율동아리 개설 신청 {pending.length ? `· 심사 대기 ${pending.length}` : ''}</PanelTitle>
      <ul className="mt-2 divide-y">
        {data.map((p) => (
          <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-2 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{p.name}{p.category ? <span className="text-slate-500"> · {p.category}</span> : null}</span>
              <span className="line-clamp-2 text-xs text-slate-500">{p.proposer} · {p.description}{p.wish_advisor ? ` · 희망 지도교사 ${p.wish_advisor}` : ''}</span>
            </span>
            {p.status === 'proposed'
              ? <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDeciding(p)}>심사</Button>
              : <Badge variant="outline" className="text-[11px] text-rose-600">반려</Badge>}
          </li>
        ))}
      </ul>
      <ProposalDecideDialog proposal={deciding} onClose={() => setDeciding(null)} />
    </Card>
  );
}

function ProposalDecideDialog({ proposal, onClose }: { proposal: ClubProposal | null; onClose: () => void }) {
  const [teachers, setTeachers] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  useEffect(() => { setTeachers([]); setReason(''); }, [proposal]);
  const approve = useClubMutation(() => decideProposal(proposal!.id, true, teachers.filter((t) => UUID.test(t)), null), { success: () => '개설을 승인했습니다' });
  const reject = useClubMutation(() => decideProposal(proposal!.id, false, null, reason.trim() || null), { success: () => '반려했습니다' });
  return (
    <Dialog open={!!proposal} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-base">{proposal?.name} 개설 심사</DialogTitle>
          <DialogDescription className="text-xs">{proposal?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="space-y-1.5"><Label>지도교사(승인 시 필수){proposal?.wish_advisor ? <span className="text-xs font-normal text-slate-500"> — 희망: {proposal.wish_advisor}</span> : null}</Label>
            <SearchableMultiSelect selectedValues={teachers} onSelectionChange={setTeachers} filterByTeacher placeholder="선생님 이름 검색" /></div>
          <div className="space-y-1.5"><Label htmlFor="pd-reason">반려 사유</Label><Input id="pd-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="text-base sm:text-sm" /></div>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} text-rose-600 hover:bg-rose-50`} disabled={reject.isPending} onClick={() => reject.mutate(undefined, { onSuccess: onClose })}><X className="h-3.5 w-3.5" />반려</Button>
          <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={!teachers.some((t) => UUID.test(t)) || approve.isPending}
            onClick={() => approve.mutate(undefined, { onSuccess: onClose })}><Check className="h-3.5 w-3.5" />승인</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── 한 장 보기 «지원» ─────────────────────────
export function ApplicantsTab({ club }: { club: ClubDetail }) {
  const { data = [], isLoading } = useApplications(club.id);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const readOnly = useViewAsReadOnly();
  const judge = useClubMutation(({ id, result }: { id: string; result: 'accepted' | 'rejected' | 'applied' }) => judgeApplications([id], result, notes[id]?.trim() || null));
  const finalize = useClubMutation(() => finalizeApplications(club.id));
  const accepted = data.filter((a) => a.status === 'accepted').length;
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  return (
    <Card className="space-y-4">
      <PanelTitle icon={ClipboardCheck} trailing={club.can_manage && accepted > 0 ? (
        <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" disabled={finalize.isPending}
          onClick={() => finalize.mutate(undefined, { onSuccess: (r) => {
            if (r.skipped.length) toast.warning(`${r.added}명 확정 · ${r.skipped.length}명은 건너뜀 — ${r.skipped.map((s) => `${s.student} ${s.reason}`).join(', ')}`);
            else toast.success(`${r.added}명을 명단에 넣었습니다`);
          } })}>
          <UserCheck className="h-3.5 w-3.5" />합격자 {accepted}명 명단에 넣기
        </Button>
      ) : null}>지원자 {data.length}</PanelTitle>
      <p className="text-xs text-slate-500">
        {club.can_manage ? '기장이 면접 결과를 적으면 여기서 확인하고 명단에 넣습니다. 높은 지망부터, 다른 정규 동아리에 이미 있는 학생은 건너뜁니다.'
          : '면접을 본 뒤 합격·불합격을 적어 주세요. 명단은 지도교사가 확정합니다.'}
      </p>
      {data.length === 0 ? <p className="text-sm text-slate-500">지원자가 없습니다.</p> : (
        <ul className="divide-y">
          {data.map((a) => (
            <li key={a.id} className="space-y-1.5 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">{a.choice_rank}지망</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{personLabel(a)}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px]', STATUS_TONE[a.status])}>{APPLICATION_STATUS_LABEL[a.status]}</span>
              </div>
              {a.motivation && <p className="whitespace-pre-wrap text-sm text-slate-700">{a.motivation}</p>}
              {a.enrolled_elsewhere && a.status !== 'enrolled' && <p className="text-xs text-amber-700">이미 «{a.enrolled_elsewhere}» 부원 — 여기서는 확정되지 않습니다</p>}
              {a.status !== 'enrolled' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input value={notes[a.id] ?? a.interview_note ?? ''} onChange={(e) => setNotes((p) => ({ ...p, [a.id]: e.target.value }))}
                    placeholder="면접 메모(선택)" className="h-9 min-w-[10rem] flex-1 text-base sm:text-sm" aria-label="면접 메모" disabled={readOnly} />
                  <Button size="sm" variant="ghost" className="h-9 gap-1 text-xs text-blue-700 hover:bg-blue-50" disabled={readOnly} title={readOnly ? VIEW_AS_READONLY_TITLE : undefined} onClick={() => judge.mutate({ id: a.id, result: 'accepted' })}><Check className="h-3.5 w-3.5" />합격</Button>
                  <Button size="sm" variant="ghost" className="h-9 gap-1 text-xs text-rose-600 hover:bg-rose-50" disabled={readOnly} onClick={() => judge.mutate({ id: a.id, result: 'rejected' })}><X className="h-3.5 w-3.5" />불합격</Button>
                  {a.status !== 'applied' && <Button size="sm" variant="ghost" className="h-9 text-xs text-slate-500" disabled={readOnly} onClick={() => judge.mutate({ id: a.id, result: 'applied' })}>되돌리기</Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────── 학생 ─────────────────────────
export function StudentRecruit({ year }: { year: number }) {
  const { data: rounds = [] } = useRecruits(year);
  const open = rounds.find((r) => r.is_open);
  const { data: detail } = useRecruit(open?.id ?? null);
  const { data: proposals = [] } = useProposals(year);
  const [applyOpen, setApplyOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const readOnly = useViewAsReadOnly();
  const withdraw = useClubMutation(() => withdrawApplication(open!.id), { success: () => '지원을 취소했습니다' });
  const mine = detail?.my_applications.filter((a) => a.status !== 'withdrawn') ?? [];

  return (
    <div className="space-y-4">
      {open && detail && (
        <Card className="border-blue-200 bg-blue-50/40">
          <PanelTitle icon={Flag}>{detail.title} · {fmt(detail.closes_at)}까지</PanelTitle>
          {detail.guide && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{detail.guide}</p>}
          {mine.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {mine.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-white px-1.5 text-[11px] tabular-nums text-slate-600">{a.choice_rank}지망</span>
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px]', STATUS_TONE[a.status])}>{APPLICATION_STATUS_LABEL[a.status]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-slate-600">지망을 {detail.max_choices}개까지 낼 수 있습니다. 결과는 면접 뒤 동아리에서 알려 줍니다.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="h-10 gap-1.5 bg-blue-600 hover:bg-blue-700" disabled={readOnly} title={readOnly ? VIEW_AS_READONLY_TITLE : undefined} onClick={() => setApplyOpen(true)}><Send className="h-4 w-4" />{mine.length ? '지망 바꾸기' : '지원하기'}</Button>
            {mine.some((a) => a.status === 'applied') && <Button size="sm" variant="ghost" className="h-10 text-slate-600" disabled={readOnly} onClick={() => withdraw.mutate(undefined)}>지원 취소</Button>}
          </div>
        </Card>
      )}
      <Card>
        <PanelTitle icon={Sparkles}>자율동아리 만들기</PanelTitle>
        <p className="mt-1 text-sm text-slate-600">함께 탐구하고 싶은 주제가 있으면 개설을 신청하세요. 동아리 담당 선생님이 지도교사를 정해 승인합니다.</p>
        {proposals.length > 0 && (
          <ul className="mt-2 space-y-1">
            {proposals.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px]', p.status === 'proposed' ? 'bg-slate-100 text-slate-700' : 'bg-rose-50 text-rose-700')}>
                  {p.status === 'proposed' ? '심사 중' : `반려${p.rejected_reason ? ` — ${p.rejected_reason}` : ''}`}</span></li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="outline" className="mt-3 h-10" disabled={readOnly} title={readOnly ? VIEW_AS_READONLY_TITLE : undefined} onClick={() => setProposeOpen(true)}>개설 신청</Button>
      </Card>
      {detail && <ApplyDialog open={applyOpen} onOpenChange={setApplyOpen} round={detail} />}
      <ProposeDialog open={proposeOpen} onOpenChange={setProposeOpen} />
    </div>
  );
}

function ApplyDialog({ open, onOpenChange, round }: { open: boolean; onOpenChange: (o: boolean) => void; round: ClubRecruitDetail }) {
  const [choices, setChoices] = useState<string[]>([]);
  const [motivations, setMotivations] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    const mine = round.my_applications.filter((a) => a.status !== 'withdrawn').sort((a, b) => a.choice_rank - b.choice_rank);
    setChoices(mine.map((a) => a.club_year_id));
    setMotivations(Object.fromEntries(mine.map((a) => [a.club_year_id, a.motivation ?? ''])));
    setQ('');
  }, [open, round]);
  const byId = useMemo(() => new Map(round.clubs.map((c) => [c.club_year_id, c])), [round]);
  const list = round.clubs.filter((c) => !q.trim() || `${c.name} ${c.description ?? ''}`.includes(q.trim()));
  const move = (i: number, d: -1 | 1) => setChoices((p) => { const n = [...p]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const submit = useClubMutation(() => applyRecruit(round.id, choices, motivations), { success: () => '지원했습니다' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg gap-0 overflow-y-auto p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-base">동아리 지원</DialogTitle>
          <DialogDescription className="text-xs">지망을 {round.max_choices}개까지 순서대로 고르세요. 마감 전까지 바꿀 수 있습니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 py-4 sm:px-6">
          {choices.length > 0 && (
            <div className="space-y-2">
              {choices.map((id, i) => (
                <div key={id} className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50/40 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-blue-600 px-1.5 text-[11px] font-medium text-white">{i + 1}지망</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{byId.get(id)?.name}</span>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로"><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" disabled={i === choices.length - 1} onClick={() => move(i, 1)} aria-label="아래로"><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400" onClick={() => setChoices((p) => p.filter((x) => x !== id))} aria-label="빼기"><X className="h-4 w-4" /></Button>
                  </div>
                  <Textarea rows={2} value={motivations[id] ?? ''} onChange={(e) => setMotivations((p) => ({ ...p, [id]: e.target.value }))}
                    placeholder="지원 동기(선택)" className="bg-white text-base sm:text-sm" />
                </div>
              ))}
            </div>
          )}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="동아리 찾기" className="text-base sm:text-sm" aria-label="동아리 찾기" />
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {list.map((c) => {
              const picked = choices.includes(c.club_year_id);
              return (
                <li key={c.club_year_id}>
                  <button type="button" disabled={picked || choices.length >= round.max_choices}
                    onClick={() => setChoices((p) => [...p, c.club_year_id])}
                    className="flex min-h-[48px] w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
                    <span className="flex w-full items-center gap-1.5 text-sm font-medium">
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {picked && <Check className="h-4 w-4 text-blue-600" />}
                    </span>
                    <span className="line-clamp-2 text-xs text-slate-500">
                      {c.advisors?.join('·')}{c.place ? ` · ${c.place}` : ''}{c.capacity ? ` · 정원 ${c.capacity}` : ''}{c.description ? ` — ${c.description}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={choices.length === 0 || submit.isPending}
            onClick={() => submit.mutate(undefined, { onSuccess: () => onOpenChange(false) })}><Send className="h-3.5 w-3.5" />{choices.length}개 지원</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProposeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [wish, setWish] = useState('');
  useEffect(() => { if (open) { setName(''); setCategory(''); setDesc(''); setWish(''); } }, [open]);
  const send = useClubMutation(() => proposeAutonomous(name.trim(), category.trim() || null, desc.trim(), wish.trim() || null),
    { success: () => '개설을 신청했습니다 — 동아리 담당 선생님이 심사합니다' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-base">자율동아리 개설 신청</DialogTitle>
          <DialogDescription className="text-xs">승인되면 내가 기장이 되고, 부원은 «부원 제안»으로 모읍니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="space-y-1.5"><Label htmlFor="pp-name">이름</Label><Input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} className="text-base sm:text-sm" /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-cat">분야</Label><Input id="pp-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="text-base sm:text-sm" placeholder="예: 생명과학" /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-desc">무엇을 하나요</Label><Textarea id="pp-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} className="text-base sm:text-sm" /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-wish">희망 지도교사(선택)</Label><Input id="pp-wish" value={wish} onChange={(e) => setWish(e.target.value)} className="text-base sm:text-sm" /></div>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={!name.trim() || !desc.trim() || send.isPending}
            onClick={() => send.mutate(undefined, { onSuccess: () => onOpenChange(false) })}><Send className="h-3.5 w-3.5" />신청</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
