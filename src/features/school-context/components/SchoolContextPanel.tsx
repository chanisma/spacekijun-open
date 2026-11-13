// 맥락 관리 › «학교 맥락» 탭 (2026-11-06) — 학교 지식이 어디에 어떤 구조로 있는지의 목록 + 새 맥락(note).
//
// 맥락 라이브러리 다이얼로그 안의 두 번째 보기다(목록 ↔ 편집 전환과 같은 이유로 Dialog 를 더 겹치지 않는다).
// 개별 자료는 보이지 않는다 — 줄을 펼치면 구조·들어 있는 것·찾는 곳·갱신 방법·지금 규모(건수)만.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, ChevronDown, ChevronRight, Loader2, MapPin, Pencil, Plus, Save, Search } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  LOCATION_TYPE_LABEL, SCHOOL_CONTEXT_AREAS, SCHOOL_CONTEXT_BODY_MAX, SCHOOL_CONTEXT_SUMMARY_MAX,
  archiveSchoolContext, createSchoolNote, listSchoolContexts, schoolContextLive, updateSchoolNote,
  type SchoolContext, type SchoolContextArea,
} from '../services/schoolContextService';

const KEY = ['school-context'];

/** 지금 규모 jsonb → 한 줄 글 («rows 76 · semesters 2026-2») */
function liveText(live: Record<string, unknown> | null | undefined): string {
  if (!live) return '';
  const label: Record<string, string> = {
    rows: '건', semesters: '학기', last_synced: '마지막 갱신', last_updated: '마지막 갱신', last_uploaded: '마지막 올림', standards: '성취기준',
    subjects: '과목', docgen_subjects: '맥락 라이브러리 과목', curriculum_years: '교육과정', admission_years: '입학 연도', seats: '자리', years: '학년도',
    holders: '지금 앉은 사람', areas: '영역', works: '업무', active: '활성', by_kind: '종류별', documents: '문서', folders: '폴더',
    by_category: '분류별', from: '부터', to: '까지', notices: '공지', current: '게시 중', clubs: '동아리', staff: '교직원', departments: '부서', notes: '새 맥락',
  };
  const show = (v: unknown): string => {
    if (Array.isArray(v)) return v.join(', ');
    if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${x}`).join(', ');
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
  };
  return Object.entries(live).filter(([k]) => k !== 'note' && k !== 'error').map(([k, v]) => `${label[k] ?? k} ${show(v)}`).join(' · ');
}

function Row({ c, mine, onEdit, onArchive }: { c: SchoolContext; mine: boolean; onEdit: () => void; onArchive: () => void }) {
  const [open, setOpen] = useState(false);
  const live = useQuery({ queryKey: [...KEY, 'live', c.key], queryFn: () => schoolContextLive(c.key), enabled: open, staleTime: 60_000 });
  return (
    <div className={cn('rounded-lg border bg-white p-2.5', c.status === 'archived' ? 'border-slate-100 opacity-60' : 'border-slate-200')}>
      <div className="flex items-start gap-2">
        <button type="button" className="mt-0.5 text-slate-400" onClick={() => setOpen(!open)} aria-label={open ? '접기' : '펼치기'}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpen(!open)}>
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span>{c.title}</span>
            <span className="rounded bg-indigo-50 px-1 py-0.5 text-[9px] text-indigo-600">{c.area}</span>
            <span className={cn('rounded px-1 py-0.5 text-[9px]', c.kind === 'note' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
              {c.kind === 'note' ? '새 맥락' : '자료 위치'}
            </span>
            {c.sensitivity !== 'none' && (
              <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700">{c.sensitivity === 'student' ? '학생 개인정보' : '교직원 정보'}</span>
            )}
            {c.status === 'archived' && <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">보관됨</span>}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{c.summary}</p>
          {!open && c.locations.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {c.locations.map((l, i) => (
                <span key={i} className="rounded border border-slate-200 px-1 py-0.5 text-[9px] text-slate-500">
                  {LOCATION_TYPE_LABEL[l.type] ?? l.type}{l.ref ? ` · ${l.ref}` : ''}
                </span>
              ))}
            </p>
          )}
        </div>
        {mine && c.kind === 'note' && c.status === 'active' && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-blue-600" title="수정" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-amber-600" title="보관" onClick={onArchive}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pl-5 pt-2 text-[11px] text-slate-600">
          {c.kind === 'note' && c.body && <p className="whitespace-pre-wrap rounded bg-emerald-50/50 p-2 leading-relaxed">{c.body}</p>}
          {c.structure.length > 0 && (
            <div>
              <p className="font-semibold text-slate-700">구조</p>
              <ul className="mt-0.5 space-y-0.5">
                {c.structure.map((s, i) => <li key={i}><b className="font-medium">{s.name}</b>{s.description ? ` — ${s.description}` : ''}</li>)}
              </ul>
            </div>
          )}
          {c.contents && <p><b className="font-semibold text-slate-700">들어 있는 것</b> {c.contents}</p>}
          {c.locations.length > 0 && (
            <div>
              <p className="font-semibold text-slate-700">찾는 곳</p>
              <ul className="mt-0.5 space-y-0.5">
                {c.locations.map((l, i) => (
                  <li key={i} className="flex gap-1">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    <span><b className="font-medium">{LOCATION_TYPE_LABEL[l.type] ?? l.type}</b>{l.ref ? ` ${l.ref}` : ''}{l.how ? ` — ${l.how}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.maintenance && <p><b className="font-semibold text-slate-700">갱신</b> {c.maintenance}</p>}
          {live.isLoading && <p className="text-slate-400">규모를 세는 중…</p>}
          {live.data && <p><b className="font-semibold text-slate-700">지금 규모</b> {liveText(live.data)}</p>}
          {c.archived_reason && <p className="text-slate-400">보관한 까닭: {c.archived_reason}</p>}
          {c.tags.length > 0 && <p className="text-slate-400">{c.tags.map((t) => `#${t}`).join(' ')}</p>}
        </div>
      )}
    </div>
  );
}

export function SchoolContextPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [area, setArea] = useState<SchoolContextArea | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<SchoolContext | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', area: '업무' as SchoolContextArea, summary: '', body: '', contents: '', tags: '' });

  const { data: rows = [], isLoading } = useQuery({ queryKey: [...KEY, showArchived], queryFn: () => listSchoolContexts(showArchived) });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const save = useMutation({
    mutationFn: async () => {
      const input = { ...form, tags: form.tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '')).filter(Boolean).slice(0, 20) };
      if (editing === 'new') await createSchoolNote(input);
      else if (editing) await updateSchoolNote(editing.id, input);
    },
    onSuccess: () => { toast.success('저장했습니다. 교직원과 에이전트가 이 맥락을 찾을 수 있습니다.'); setEditing(null); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.'),
  });
  const archive = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => archiveSchoolContext(id, reason),
    onSuccess: () => { toast.success('보관했습니다.'); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : '보관하지 못했습니다.'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => (!area || c.area === area)
      && (!q || `${c.key} ${c.title} ${c.summary} ${c.contents ?? ''} ${c.body ?? ''} ${c.tags.join(' ')}`.toLowerCase().includes(q)));
  }, [rows, search, area]);

  const startNew = () => { setForm({ title: '', area: area ?? '업무', summary: '', body: '', contents: '', tags: '' }); setEditing('new'); };
  const startEdit = (c: SchoolContext) => {
    setForm({ title: c.title, area: c.area, summary: c.summary, body: c.body ?? '', contents: c.contents ?? '', tags: c.tags.join(', ') });
    setEditing(c);
  };

  if (editing) {
    return (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(null)}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />목록
        </Button>
        <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
          모든 교직원과 에이전트가 봅니다. 학생·교직원 개인정보(이름과 성적·상담·연락처)는 적지 말고, 확인된 사실과 그 출처만 적어 주세요.
        </p>
        <div className="grid grid-cols-[1fr_9rem] gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-700">이름</Label>
            <Input className="h-8 text-xs" maxLength={120} placeholder="예) 정기시험 감독 교체 절차" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-700">영역</Label>
            <select className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs" value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value as SchoolContextArea })}>
              {SCHOOL_CONTEXT_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-700">무엇에 대한 맥락인가 <span className="font-normal text-slate-400">— 어떤 물음의 근거가 되나</span></Label>
          <Textarea rows={2} maxLength={SCHOOL_CONTEXT_SUMMARY_MAX} className="text-xs" value={form.summary}
            placeholder="예) 시험 감독을 바꿔야 할 때 누구에게 어떻게 알리나" onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-700">내용</Label>
          <Textarea rows={10} maxLength={SCHOOL_CONTEXT_BODY_MAX} className="font-mono text-[11px] leading-relaxed" value={form.body}
            placeholder={'학교에서 실제로 하는 방식·규칙·관행을 적습니다.\n예) 감독 교체는 상대 교사와 합의한 뒤 평가계에 쿨메신저로 알린다. 시험 전날까지.'}
            onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <p className="text-right text-[10px] text-slate-400">{form.body.length.toLocaleString()} / {SCHOOL_CONTEXT_BODY_MAX.toLocaleString()}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-700">출처·범위 <span className="font-normal text-slate-400">(선택)</span></Label>
          <Input className="h-8 text-xs" maxLength={1500} placeholder="예) 2026 평가계 안내 쪽지, 학업성적관리규정 제12조" value={form.contents}
            onChange={(e) => setForm({ ...form, contents: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-700">찾기 낱말 <span className="font-normal text-slate-400">(쉼표로)</span></Label>
          <Input className="h-8 text-xs" placeholder="감독, 정기시험" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>취소</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"
            disabled={save.isPending || !form.title.trim() || !form.summary.trim() || !form.body.trim()} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}저장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-100 px-4 py-2">
        <div className="mb-2 flex items-start gap-2">
          <p className="flex-1 text-[11px] leading-snug text-slate-500">
            학교 지식이 <b>어디에 어떤 구조로</b> 있는지 모은 목록입니다. 자료 자체는 각 자리(나이스·업무·서류함…)에 있고, 에이전트도 이 목록으로 근거를 찾습니다.
            목록에 없던 학교의 규칙·관행·절차는 <b>새 맥락</b>으로 남겨 주세요.
          </p>
          <Button size="sm" className="h-7 shrink-0 bg-emerald-600 px-2.5 text-xs hover:bg-emerald-700" onClick={startNew}>
            <Plus className="mr-1 h-3 w-3" />새 학교 맥락
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input className="h-8 pl-7 text-xs" placeholder="이름·내용·낱말 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {[null, ...SCHOOL_CONTEXT_AREAS].map((a) => {
            const n = a === null ? rows.length : rows.filter((c) => c.area === a).length;
            if (a !== null && n === 0) return null;
            return (
              <button key={a ?? 'all'} type="button" onClick={() => setArea(a)}
                className={cn('rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  area === a ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                {a ?? '전체'} {n}
              </button>
            );
          })}
          <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />보관한 것도
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading && <p className="text-xs text-slate-400">불러오는 중…</p>}
        {!isLoading && filtered.length === 0 && <p className="text-xs text-slate-400">맞는 맥락이 없습니다.</p>}
        {filtered.map((c) => (
          <Row key={c.id} c={c} mine={c.created_by === user?.id} onEdit={() => startEdit(c)}
            onArchive={() => {
              const reason = window.prompt(`"${c.title}" 을(를) 보관합니다. 까닭을 적어 주세요.`);
              if (reason && reason.trim()) archive.mutate({ id: c.id, reason });
            }} />
        ))}
      </div>
    </div>
  );
}
