// 담당자의 «요청 보내기»와 «요청 현황» (2026-11-11 동아리 P2).
// 보내기 = 서버 club_send_request — «동아리 운영 (N학년도)» 업무 › 할 일 › 입력 받기(동아리·부원 축)를 만들고 보낸다.
// 그래서 받은 지도교사는 «내 할 일 › 요청»·「오늘」·MCP 에서 같은 요청을 본다(요청함을 따로 두지 않는다).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, ExternalLink, Plus, Send, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { sendClubRequest, type ClubRequestDraft } from '../services/clubService';
import { useClubMutation, useClubRequests } from '../hooks/useClubs';
import type { ClubSummary, RequestPreview } from '../types';

type FieldType = ClubRequestDraft['fields'][number]['type'];
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: '글' }, { value: 'yesno', label: '예/아니오' }, { value: 'number', label: '숫자' }, { value: 'date', label: '날짜' },
];
const PRESETS: { label: string; draft: Pick<ClubRequestDraft, 'title' | 'axis' | 'fields'> }[] = [
  { label: '누가기록', draft: { title: '누가기록', axis: 'club_member', fields: [{ label: '관찰 내용', type: 'text', required: true }] } },
  { label: '활동 보고', draft: { title: '활동 보고', axis: 'club', fields: [{ label: '활동 내용', type: 'text', required: true }, { label: '활동 일수', type: 'number' }] } },
  { label: '행사 참가 조사', draft: { title: '행사 참가 조사', axis: 'club', fields: [{ label: '참가 여부', type: 'yesno', required: true }, { label: '비고', type: 'text' }] } },
];

export function RequestComposeDialog({ open, onOpenChange, year, clubs }: {
  open: boolean; onOpenChange: (o: boolean) => void; year: number; clubs: ClubSummary[];
}) {
  const active = useMemo(() => clubs.filter((c) => c.status === 'active'), [clubs]);
  const [draft, setDraft] = useState<ClubRequestDraft>(() => blank(year));
  const [allClubs, setAllClubs] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<RequestPreview | null>(null);

  useEffect(() => { if (open) { setDraft(blank(year)); setAllClubs(true); setPicked([]); setPreview(null); } }, [open, year]);
  const set = (patch: Partial<ClubRequestDraft>) => { setDraft((d) => ({ ...d, ...patch })); setPreview(null); };
  const payload = (): ClubRequestDraft => ({ ...draft, clubYearIds: allClubs ? null : picked, fields: draft.fields.filter((f) => f.label.trim()) });

  const check = useClubMutation(() => sendClubRequest(payload(), true));
  const send = useClubMutation(() => sendClubRequest(payload(), false), { success: () => '요청을 보냈습니다 — 지도교사에게 알림이 갔습니다' });
  const ready = draft.title.trim() && draft.fields.some((f) => f.label.trim()) && (allClubs || picked.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl gap-0 overflow-y-auto p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={Send} />
            <div className="min-w-0">
              <DialogTitle className="text-base">동아리에 요청 보내기</DialogTitle>
              <DialogDescription className="text-xs">지도교사에게 알림이 가고, «내 할 일 › 요청»에서 채웁니다. 부원마다 받은 값은 누가기록 옆에 쌓입니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} type="button" size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => set({ ...p.draft, title: `${new Date().getMonth() + 1}월 ${p.draft.title}`, fields: p.draft.fields.map((f) => ({ ...f })) })}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-title">제목</Label>
            <Input id="cr-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} className="text-base sm:text-sm" placeholder="예: 11월 누가기록" />
          </div>
          <div className="space-y-1.5">
            <Label>한 줄의 단위</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['club', '동아리마다', '공동지도 교사 중 누구든 한 번'], ['club_member', '부원마다', '학생별 기록 — 누가기록']] as const).map(([v, t, h]) => (
                <button key={v} type="button" onClick={() => set({ axis: v })}
                  className={cn('rounded-lg border px-3 py-2 text-left transition', draft.axis === v ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'hover:bg-slate-50')}>
                  <div className="text-sm font-medium text-slate-900">{t}</div>
                  <div className="text-xs text-slate-500">{h}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>입력 항목</Label>
            {draft.fields.map((f, i) => (
              <div key={i} className="flex gap-2">
                <Input value={f.label} onChange={(e) => set({ fields: draft.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  placeholder="항목 이름" className="min-w-0 flex-1 text-base sm:text-sm" aria-label={`${i + 1}번째 항목 이름`} />
                <Select value={f.type} onValueChange={(v) => set({ fields: draft.fields.map((x, j) => (j === i ? { ...x, type: v as FieldType } : x)) })}>
                  <SelectTrigger className="w-28" aria-label="형식"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-10 w-10 shrink-0 p-0 text-slate-400 hover:text-rose-600" aria-label="항목 빼기"
                  disabled={draft.fields.length === 1} onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {draft.fields.length < 6 && (
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs text-slate-600"
                onClick={() => set({ fields: [...draft.fields, { label: '', type: 'text' }] })}><Plus className="h-3.5 w-3.5" />항목 더하기</Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cr-due">마감</Label>
              <Input id="cr-due" type="date" value={draft.due ?? ''} onChange={(e) => set({ due: e.target.value || null })} className="text-base sm:text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>공개</Label>
              <Select value={draft.visibility} onValueChange={(v) => set({ visibility: v as 'private' | 'shared' })}>
                <SelectTrigger aria-label="공개"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">나만 봄(지도교사는 자기 줄만)</SelectItem>
                  <SelectItem value="shared">대상 교사 모두 표를 봄</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-guide">안내</Label>
            <Textarea id="cr-guide" rows={2} value={draft.guide} onChange={(e) => set({ guide: e.target.value })} className="text-base sm:text-sm"
              placeholder="무엇을 어떻게 적으면 되는지" />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <Checkbox checked={allClubs} onCheckedChange={(v) => { setAllClubs(v === true); setPreview(null); }} />
              활동 중인 동아리 전부({active.length})
            </Label>
            {!allClubs && (
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                {active.map((c) => (
                  <label key={c.id} className="flex min-h-[36px] items-center gap-2 rounded px-1.5 text-sm hover:bg-slate-50">
                    <Checkbox checked={picked.includes(c.id)}
                      onCheckedChange={(v) => { setPicked((p) => (v === true ? [...p, c.id] : p.filter((x) => x !== c.id))); setPreview(null); }} />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
              <SectionLabel icon={Check}>보내기 전 확인</SectionLabel>
              <p className="mt-1.5 text-slate-700">
                동아리 {preview.clubs.length}곳 · 지도교사 {preview.advisors}명에게 · {draft.axis === 'club_member' ? `부원 ${preview.rows}줄` : `${preview.rows}줄`}
              </p>
            </div>
          )}
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          {!preview ? (
            <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={!ready || check.isPending}
              onClick={() => check.mutate(undefined, { onSuccess: (r) => setPreview(r as RequestPreview) })}>
              <Check className="h-3.5 w-3.5" />대상 확인
            </Button>
          ) : (
            <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={send.isPending}
              onClick={() => send.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
              <Send className="h-3.5 w-3.5" />보내기
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function blank(year: number): ClubRequestDraft {
  return { title: '', axis: 'club_member', fields: [{ label: '관찰 내용', type: 'text', required: true }], due: null, clubYearIds: null, guide: '', visibility: 'private', year };
}

/** 담당자의 요청 현황 — 요청마다 동아리별 진척(안 낸 동아리가 위) */
export function RequestBoard({ year, onOpenClub }: { year: number; onOpenClub: (id: string) => void }) {
  const { data = [], isLoading } = useClubRequests(null, year);
  const [openId, setOpenId] = useState<string | null>(null);
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (data.length === 0) {
    return <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">아직 보낸 요청이 없습니다. [요청 보내기]로 누가기록·활동 보고를 받으세요.</div>;
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-white ">
      <ul className="divide-y">
        {data.map((r) => {
          const done = r.clubs.filter((c) => c.answered >= c.units).length;
          const pct = r.clubs.length ? Math.round((done / r.clubs.length) * 100) : 0;
          const expanded = openId === r.action_id;
          return (
            <li key={r.action_id}>
              <button type="button" onClick={() => setOpenId(expanded ? null : r.action_id)} className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
                  <span className="text-xs text-slate-500">{r.axis === 'club_member' ? '부원마다' : '동아리마다'}{r.due ? ` · ${r.due.slice(5).replace('-', '/')}까지` : ''}{r.status === 'closed' ? ' · 마감' : ''}</span>
                </span>
                <span className="hidden w-32 sm:block">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-600">{done}/{r.clubs.length}곳</span>
              </button>
              {expanded && (
                <div className="space-y-2 bg-slate-50/50 px-4 pb-3 pt-1">
                  <div className="flex justify-end">
                    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs"><Link to={`/tasks/mine?task=${r.task_id}`}>전체 표·다시 알림·마감<ExternalLink className="h-3 w-3" /></Link></Button>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {r.clubs.map((c) => {
                      const ok = c.answered >= c.units;
                      return (
                        <button key={c.club_year_id} type="button" onClick={() => onOpenClub(c.club_year_id)}
                          className={cn('flex min-h-[40px] items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm hover:border-blue-200',
                            !ok && 'border-amber-200')}>
                          <span className="truncate">{c.name}</span>
                          <span className={cn('shrink-0 text-xs tabular-nums', ok ? 'text-emerald-700' : 'text-amber-700')}>{c.answered}/{c.units}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
