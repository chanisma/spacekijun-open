// 한 장 보기의 P2 탭 — 활동 · 누가기록 · 요청.
//   활동     = 창체 activity 중 이 동아리(같은 club 의 모든 해) 주최. 기록은 창체 화면에서(학생은 바로 반영).
//   누가기록 = 지도교사가 부원별로 남기는 관찰(학생 비공개) + 부원마다 받은 요청 응답을 한 학생 옆에 모은다.
//              ⚠️ 웹은 문장을 만들지 않는다(사용자 결정 — AI 초안은 MCP 로만).
//   요청     = 이 동아리에 걸린 «입력 받기» 요청(동아리·부원 축). 응답은 «내 할 일»에서.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CalendarDays, ExternalLink, FileText, Inbox, NotebookPen, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useClubActivities, useClubMutation, useClubNotes, useClubRequests } from '../hooks/useClubs';
import { deleteClubNote, saveClubNote } from '../services/clubService';
import { useViewAsReadOnly, VIEW_AS_READONLY_TITLE } from '../viewAs';
import { personLabel, type ClubActivity, type ClubDetail, type ClubNoteStudent, type ClubNotes } from '../types';
import { Card, PanelTitle } from './panel';


const fmtDay = (d: string | null) => (d ? d.slice(5, 10).replace('-', '/') : '');

// ───────────────────────── 활동 ─────────────────────────
export function ActivitiesTab({ club }: { club: ClubDetail }) {
  const { data = [], isLoading } = useClubActivities(club.id);
  const readOnly = useViewAsReadOnly();
  const canWrite = club.status === 'active' && !!club.activity_host_id && (club.can_manage || club.my_role === 'leader' || club.my_role === 'member');
  const thisYear = data.filter((a) => a.this_year);
  const past = data.filter((a) => !a.this_year);
  return (
    <div className="space-y-4">
      <Card>
        <PanelTitle icon={Sparkles} trailing={canWrite ? readOnly ? (
          <Button size="sm" disabled title={VIEW_AS_READONLY_TITLE} className="h-8 gap-1.5 bg-blue-600 text-xs"><Plus className="h-3.5 w-3.5" />활동 기록하기</Button>
        ) : (
          <Button asChild size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700">
            <Link to={`/activities?newActivityHost=${club.activity_host_id}`}><Plus className="h-3.5 w-3.5" />활동 기록하기</Link>
          </Button>
        ) : null}>올해 활동 {thisYear.length}</PanelTitle>
        <p className="mt-1 text-xs text-slate-500">활동은 창체 아카이브에 남고, 부원이 쓴 기록은 바로 반영됩니다. 학생별 근거는 여기서 «누가기록»으로 이어집니다.</p>
        {isLoading ? <Skeleton className="mt-3 h-24" /> : thisYear.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">올해 기록된 활동이 없습니다.</p>
        ) : <ActivityList items={thisYear} />}
      </Card>
      {past.length > 0 && (
        <Card>
          <PanelTitle icon={CalendarDays}>지난 해 활동 {past.length}</PanelTitle>
          <ActivityList items={past} showYear />
        </Card>
      )}
    </div>
  );
}

function ActivityList({ items, showYear }: { items: ClubActivity[]; showYear?: boolean }) {
  return (
    <ul className="mt-2 divide-y">
      {items.map((a) => (
        <li key={a.id}>
          <Link to={`/activities?activity=${a.id}`} className="flex min-w-0 items-start gap-3 rounded-md px-1 py-2.5 hover:bg-slate-50">
            <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-slate-500">{showYear ? a.academic_year : fmtDay(a.starts_on) || '—'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900" title={a.name}>{a.name}</span>
              {a.content && <span className="line-clamp-1 text-xs text-slate-500">{a.content}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
              {a.mine && <Badge className="h-5 bg-blue-50 px-1.5 text-[11px] text-blue-700 hover:bg-blue-50">참여</Badge>}
              <Users className="h-3 w-3" />{a.participants}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── 누가기록 ─────────────────────────
export function NotesTab({ club }: { club: ClubDetail }) {
  const { data, isLoading } = useClubNotes(club.id, club.can_manage);
  const [selected, setSelected] = useState<string | null>(null);
  const students = useMemo(() => data?.students ?? [], [data]);
  const current = students.find((s) => s.code === selected) ?? null;
  if (isLoading || !data) return <Skeleton className="h-64 rounded-xl" />;
  const empty = students.filter((s) => s.notes.length === 0 && s.answers.length === 0).length;

  return (
    <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className={cn('p-2', current && 'hidden lg:block')}>
        <div className="px-2 pb-2 pt-1">
          <PanelTitle icon={NotebookPen}>부원 {students.length}</PanelTitle>
          {empty > 0 && <p className="mt-1 text-xs text-amber-700">기록 없는 부원 {empty}명</p>}
        </div>
        <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
          {students.map((s) => {
            const n = s.notes.length + s.answers.length;
            return (
              <li key={s.code}>
                <button type="button" onClick={() => setSelected(s.code)}
                  className={cn('flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-slate-50',
                    selected === s.code && 'bg-blue-50 text-blue-800 hover:bg-blue-50')}>
                  <span className="min-w-0 flex-1 truncate">{personLabel(s)}</span>
                  <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', n ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700')}>{n}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      {current ? (
        <StudentNotes club={club} student={current} requests={data.requests} onBack={() => setSelected(null)} />
      ) : (
        <Card className="hidden items-center justify-center text-sm text-slate-500 lg:flex">왼쪽에서 부원을 고르세요.</Card>
      )}
    </div>
  );
}

function StudentNotes({ club, student, requests, onBack }: {
  club: ClubDetail; student: ClubNoteStudent; requests: ClubNotes['requests']; onBack: () => void;
}) {
  const [body, setBody] = useState('');
  const [period, setPeriod] = useState('');
  const save = useClubMutation(() => saveClubNote({ clubYearId: club.id, studentCode: student.code, body: body.trim(), period: period.trim() || null }),
    { success: () => null });
  const remove = useClubMutation((id: string) => deleteClubNote(id));

  return (
    <Card className="min-w-0 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs lg:hidden" onClick={onBack}>← 부원</Button>
        <h3 className="min-w-0 truncate text-base font-semibold text-slate-900">{personLabel(student)}</h3>
        {student.role === 'leader' && <Badge variant="outline" className="h-5 text-[11px] text-amber-700">기장</Badge>}
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex gap-2">
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="시기(예: 11월)" className="h-9 w-28 text-base sm:text-sm" aria-label="시기" />
          <span className="self-center text-xs text-slate-500">비우면 적은 날로 봅니다</span>
        </div>
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="text-base sm:text-sm"
          placeholder="관찰한 사실 — 무엇을 했고 어떤 역할·태도였는지" />
        <div className="flex justify-end">
          <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={!body.trim() || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: () => { setBody(''); } })}>기록 남기기</Button>
        </div>
      </div>

      <div>
        <PanelTitle icon={NotebookPen}>누가기록 {student.notes.length}</PanelTitle>
        {student.notes.length === 0 ? <p className="mt-2 text-sm text-slate-500">아직 없습니다.</p> : (
          <ul className="mt-2 space-y-2">
            {student.notes.map((n) => (
              <li key={n.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{n.period || new Date(n.created_at).toLocaleDateString('ko-KR')}</span>
                  {n.author && <span>· {n.author}</span>}
                  {n.source === 'agent' && <span className="inline-flex items-center gap-0.5 text-violet-700"><Bot className="h-3 w-3" />에이전트 초안</span>}
                  <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0 text-slate-400 hover:text-rose-600" aria-label="기록 지우기"
                    onClick={() => remove.mutate(n.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {student.answers.length > 0 && (
        <div>
          <PanelTitle icon={Inbox}>요청으로 받은 기록 {student.answers.length}</PanelTitle>
          <ul className="mt-2 space-y-2">
            {student.answers.map((a, i) => {
              const req = requests[a.action_id];
              return (
                <li key={`${a.action_id}-${a.dimension_key}-${i}`} className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                  <div className="text-[11px] text-indigo-800">{req?.title ?? '요청'}{a.dimension_key ? ` · ${req?.dimensions.find((d) => d.key === a.dimension_key)?.label ?? a.dimension_key}` : ''}</div>
                  <dl className="mt-1 space-y-0.5 text-sm">
                    {(req?.fields ?? []).filter((f) => a.values?.[f.key] !== undefined && a.values?.[f.key] !== '').map((f) => (
                      <div key={f.key} className="flex gap-2"><dt className="shrink-0 text-slate-500">{f.label}</dt><dd className="min-w-0 whitespace-pre-wrap text-slate-800">{String(a.values[f.key] === true ? '예' : a.values[f.key] === false ? '아니오' : a.values[f.key])}</dd></div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── 요청 ─────────────────────────
export function RequestsTab({ club }: { club: ClubDetail }) {
  const { data = [], isLoading } = useClubRequests(club.id, null);
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;
  return (
    <Card>
      <PanelTitle icon={FileText}>이 동아리에 온 요청 {data.length}</PanelTitle>
      {data.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">아직 받은 요청이 없습니다. 동아리 담당자가 누가기록 등을 요청하면 여기와 «내 할 일»에 나타납니다.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {data.map((r) => {
            const mine = r.clubs.find((c) => c.club_year_id === club.id);
            const done = mine ? mine.answered >= mine.units : false;
            return (
              <li key={r.action_id} className="flex min-w-0 flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900" title={r.title}>{r.title}</span>
                  <span className="text-xs text-slate-500">
                    {r.axis === 'club_member' ? '부원마다' : '동아리마다'}{r.due ? ` · ${fmtDay(r.due)}까지` : ''}{r.status === 'closed' ? ' · 마감' : ''}
                  </span>
                </span>
                {mine && (
                  <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', done ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700')}>
                    {mine.answered}/{mine.units}
                  </span>
                )}
                {club.my_role === 'advisor' && r.status === 'open' && (
                  <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
                    <Link to={`/my-tasks?collect=${r.action_id}`}>{done ? '고치기' : '응답하기'}<ExternalLink className="h-3 w-3" /></Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
