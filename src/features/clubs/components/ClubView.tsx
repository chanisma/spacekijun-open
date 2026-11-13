// 동아리 한 장 보기 — 머리(이름·N년째·지도교사·기장·장소) + 탭.
// 지도교사·학생은 페이지로(/clubs?club=), 담당자는 표에서 모달로 같은 부품을 연다.
// 탭은 단계마다 늘어난다(P1 = 개요·부원). 빈 탭을 미리 두지 않는다.
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, Crown, History, MapPin, Pencil, UserMinus, UserPlus, Users, X, Check, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useClub, useClubMutation } from '../hooks/useClubs';
import { decideMembers, setLeader, setMembers } from '../services/clubService';
import { clubField, clubShortName, clubTodos, clubTone, sortMembers } from '../model/clubDisplay';
import { useViewAsReadOnly, VIEW_AS_READONLY_TITLE } from '../viewAs';
import { KIND_LABEL, ROLE_LABEL, STATUS_LABEL, personLabel, type ClubDetail, type ClubMember } from '../types';
import { ClubEditDialog } from './ClubEditDialog';
import { MemberAddDialog } from './MemberAddDialog';
import { ActivitiesTab, NotesTab, RequestsTab } from './ClubTabs';
import { FinanceTab } from './FinanceTab';
import { ApplicantsTab } from './Recruit';
import { Card, PanelTitle, StatTile } from './panel';

export type ClubTab = 'overview' | 'members' | 'activities' | 'notes' | 'budget' | 'requests' | 'apply';
const TABS: ClubTab[] = ['overview', 'members', 'activities', 'notes', 'budget', 'requests', 'apply'];

interface Props {
  clubYearId: string;
  tab?: string | null;
  onTabChange?: (t: ClubTab) => void;
  onBack?: () => void;
  onOpenOther?: (id: string) => void;
  /** 모달 안에서는 머리의 뒤로가기를 숨긴다 */
  embedded?: boolean;
}

export function ClubView({ clubYearId, tab, onTabChange, onBack, onOpenOther, embedded }: Props) {
  const { data: club, isLoading, error } = useClub(clubYearId);
  const [localTab, setLocalTab] = useState<ClubTab>('overview');
  const current = (TABS.includes(tab as ClubTab) ? tab : localTab) as ClubTab;
  const setTab = (t: ClubTab) => { setLocalTab(t); onTabChange?.(t); };
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (error || !club) {
    return <p className="rounded-xl border bg-white p-6 text-center text-sm text-rose-600">{(error as Error)?.message ?? '동아리를 찾지 못했습니다'}</p>;
  }

  const tone = clubTone(club);
  const field = clubField(club);
  // 누가기록 = 지도교사·담당자만(학생 비공개) · 요청 = 교사 화면(응답은 지도교사가 «내 할 일»에서)
  const showNotes = club.can_manage;
  const showRequests = club.can_manage || club.my_role === 'advisor';
  // 지원 = 면접 결과를 적는 기장 + 확정하는 지도교사·담당자
  const showApply = club.can_manage || club.my_role === 'leader';
  const shown = (current === 'notes' && !showNotes) || (current === 'requests' && !showRequests) || (current === 'apply' && !showApply) ? 'overview' : current;

  const short = clubShortName(club.name) || club.name;
  const fill = club.capacity ? Math.min(1, club.member_count / club.capacity) : null;

  // 업무노트 「한 장 보기」와 같은 틀 — 흰 머리(경로 → 큰 제목 → 막대) + 본문(탭) · 오른쪽 곁칸(숫자·사람·지난 기록).
  // 동아리 색은 머리글자 표식 하나에만(색은 상태에 쓴다). 모달(embedded)은 좁아서 곁칸을 아래로 내린다.
  return (
    <div className="min-w-0 space-y-4">
      <Card className={cn('space-y-3', embedded && 'pr-11 sm:pr-11')}>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          {!embedded && onBack && (
            <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs text-slate-600" onClick={onBack} aria-label="목록으로">
              <ArrowLeft className="h-3.5 w-3.5" />동아리
            </Button>
          )}
          <span className="truncate">{[embedded || !onBack ? '동아리' : null, field, KIND_LABEL[club.kind], `${club.academic_year}학년도`].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold"
            style={{ background: tone.badge, color: tone.fg }}>{short.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="break-keep text-xl font-bold tracking-tight text-slate-900 sm:text-2xl" title={club.name}>{club.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {club.my_role && <Badge className="h-5 bg-blue-50 px-1.5 text-[11px] text-blue-700 hover:bg-blue-50">내 역할 · {ROLE_LABEL[club.my_role]}</Badge>}
              {club.years_running >= 2 && <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-slate-600">{club.years_running}년째</Badge>}
              {club.status !== 'active' && <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-slate-500">{STATUS_LABEL[club.status]}</Badge>}
            </div>
          </div>
          {club.can_manage && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />정보 고치기
            </Button>
          )}
        </div>
        {fill !== null && (
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`부원 ${club.member_count}명 / 정원 ${club.capacity}`}>
              <div className="h-full rounded-full bg-slate-700" style={{ width: `${fill * 100}%` }} />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">부원 {club.member_count}/{club.capacity}</span>
          </div>
        )}
      </Card>

      <div className={cn('grid gap-4', !embedded && 'lg:grid-cols-[minmax(0,1fr)_19rem]')}>
        <Tabs value={shown} onValueChange={(v) => setTab(v as ClubTab)} className="min-w-0">
          <div className="max-w-full overflow-x-auto">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">개요</TabsTrigger>
            <TabsTrigger value="members" className="text-xs sm:text-sm">
              부원{club.can_manage && (club.pending_count ?? 0) > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-800">{club.pending_count}</span>}
            </TabsTrigger>
            <TabsTrigger value="activities" className="text-xs sm:text-sm">활동</TabsTrigger>
            {showNotes && <TabsTrigger value="notes" className="text-xs sm:text-sm">누가기록</TabsTrigger>}
            <TabsTrigger value="budget" className="text-xs sm:text-sm">예산·구매</TabsTrigger>
            {showRequests && <TabsTrigger value="requests" className="text-xs sm:text-sm">요청</TabsTrigger>}
            {showApply && <TabsTrigger value="apply" className="text-xs sm:text-sm">지원</TabsTrigger>}
          </TabsList>
          </div>
          <TabsContent value="activities" className="mt-4"><ActivitiesTab club={club} /></TabsContent>
          {showNotes && <TabsContent value="notes" className="mt-4"><NotesTab club={club} /></TabsContent>}
          {showRequests && <TabsContent value="requests" className="mt-4"><RequestsTab club={club} /></TabsContent>}
          <TabsContent value="budget" className="mt-4"><FinanceTab club={club} /></TabsContent>
          {showApply && <TabsContent value="apply" className="mt-4"><ApplicantsTab club={club} /></TabsContent>}
          <TabsContent value="overview" className="mt-4">
            <OverviewTab club={club} onGoMembers={() => setTab('members')} />
          </TabsContent>
          <TabsContent value="members" className="mt-4">
            <MembersTab club={club} />
          </TabsContent>
        </Tabs>

        <aside className="min-w-0 space-y-4">
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="부원" value={club.member_count} sub={club.capacity ? `정원 ${club.capacity}` : undefined} />
              {club.can_manage
                ? <StatTile label="확정 대기" value={club.pending_count ?? 0} tone={(club.pending_count ?? 0) > 0 ? 'amber' : undefined} />
                : club.capacity ? <StatTile label="빈자리" value={Math.max(0, club.capacity - club.member_count)} /> : null}
            </div>
            <dl className="mt-4 space-y-2 border-t pt-3 text-sm">
              <div className="flex gap-3"><dt className="w-10 shrink-0 text-slate-500">지도</dt>
                <dd className="min-w-0 text-slate-800">{club.advisors.length ? club.advisors.map((a) => a.name).join(' · ') : <span className="text-rose-600">없음</span>}</dd></div>
              <div className="flex gap-3"><dt className="w-10 shrink-0 text-slate-500">기장</dt>
                <dd className="min-w-0 text-slate-800">{club.leader ? <span className="inline-flex items-center gap-1"><Crown className="h-3.5 w-3.5 text-amber-500" />{personLabel(club.leader)}</span> : <span className="text-slate-400">정하지 않음</span>}</dd></div>
              <div className="flex gap-3"><dt className="w-10 shrink-0 text-slate-500">장소</dt>
                <dd className="min-w-0 text-slate-800">{club.place ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{club.place}</span> : <span className="text-slate-400">—</span>}</dd></div>
            </dl>
          </Card>
          <Card>
            <PanelTitle icon={History}>지난 기록</PanelTitle>
            {club.lineage.length === 0 && club.club.former_names.length === 0 && !(club.linked_hosts?.length) ? (
              <p className="mt-2 text-sm text-slate-500">올해가 첫 기록입니다. 해가 바뀌어도 같은 동아리로 이어집니다.</p>
            ) : (
              <ul className="mt-2 space-y-0.5">
                {club.lineage.map((l) => (
                  <li key={l.id}>
                    <button type="button" disabled={!onOpenOther} onClick={() => onOpenOther?.(l.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:hover:bg-transparent">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 tabular-nums text-slate-500">{l.academic_year}</span>
                        <span className="min-w-0 truncate text-slate-800">{l.name}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{l.member_count}명</span>
                    </button>
                  </li>
                ))}
                {(club.linked_hosts ?? []).length > 0 && (
                  <li className="px-2 py-1 text-xs text-slate-500">창체 옛 기록 «{club.linked_hosts!.join('», «')}» — «활동» 탭의 지난 해</li>
                )}
                {club.club.former_names.map((f) => (
                  <li key={`${f.name}-${f.until_year}`} className="px-2 py-1 text-xs text-slate-500">이전 이름 «{f.name}» (~{f.until_year})</li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <ClubEditDialog open={editOpen} onOpenChange={setEditOpen} club={club} year={club.academic_year} isManager={club.is_manager} />
    </div>
  );
}

function OverviewTab({ club, onGoMembers }: { club: ClubDetail; onGoMembers: () => void }) {
  const todos = clubTodos(club, club.can_manage);
  const grades = Object.entries(club.grades ?? {}).sort().map(([g, n]) => [g, Number(n)] as const);
  const gradeTotal = grades.reduce((sum, [, n]) => sum + n, 0);
  const SHADE = ['bg-slate-700', 'bg-slate-400', 'bg-slate-300'];
  return (
    <div className="space-y-4">
      {/* 할 것이 없으면 카드 대신 점선 한 줄(업무노트 «지금 급한 것은 없습니다»와 같은 모양) */}
      {club.can_manage && todos.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">지금 처리할 것이 없습니다.</p>
      )}
      {club.can_manage && todos.length > 0 && (
        <Card>
          <PanelTitle icon={ClipboardList}>해야 할 것</PanelTitle>
          {(
            <ul className="mt-2 space-y-1.5">
              {todos.map((t) => (
                <li key={t.key}>
                  <button type="button" onClick={onGoMembers}
                    className={cn('flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition hover:brightness-95',
                      t.tone === 'amber' ? 'bg-amber-50 text-amber-900' : t.tone === 'rose' ? 'bg-rose-50 text-rose-800' : 'bg-slate-50 text-slate-700')}>
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', t.tone === 'amber' ? 'bg-amber-500' : t.tone === 'rose' ? 'bg-rose-500' : 'bg-slate-400')} />
                    <span className="min-w-0 flex-1 truncate" title={t.label}>{t.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <PanelTitle icon={Users}>{club.description ? '소개 · 부원 구성' : '부원 구성'}</PanelTitle>
        {club.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{club.description}</p>}
        {gradeTotal > 0 && (
          <div className={cn('mt-3 space-y-2', club.description && 'mt-4 border-t pt-4')}>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img"
              aria-label={grades.map(([g, n]) => `${g}학년 ${n}명`).join(', ')}>
              {grades.map(([g, n], k) => (
                <div key={g} className={cn('h-full', SHADE[k] ?? 'bg-slate-200')} style={{ width: `${(n / gradeTotal) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {grades.map(([g, n], k) => (
                <span key={g} className="inline-flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-sm', SHADE[k] ?? 'bg-slate-200')} aria-hidden />{g}학년 <b className="font-semibold tabular-nums text-slate-800">{n}명</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function MembersTab({ club }: { club: ClubDetail }) {
  const [addOpen, setAddOpen] = useState(false);
  const members = club.members ?? [];
  const pending = members.filter((m) => m.status === 'pending');
  const confirmed = sortMembers(members.filter((m) => m.status === 'confirmed'));
  const canPropose = club.my_role === 'leader' || club.my_role === 'member';
  const readOnly = useViewAsReadOnly();

  const decide = useClubMutation(({ ids, d }: { ids: string[]; d: 'confirm' | 'reject' }) => decideMembers(ids, d),
    { success: (r) => `${r.changed}명 처리했습니다` });
  const leader = useClubMutation((code: string | null) => setLeader(club.id, code), { success: () => '기장을 바꿨습니다' });
  const remove = useClubMutation((m: ClubMember) => decideMembers([m.id], 'remove'));
  const readd = useClubMutation((m: ClubMember) => setMembers(club.id, [{ code: m.code, role: m.role }], 'add', false));

  const onRemove = (m: ClubMember) => remove.mutate(m, {
    onSuccess: () => toast.success(`${personLabel(m)} 학생을 명단에서 뺐습니다`, {
      action: { label: '되돌리기', onClick: () => readd.mutate(m) },
    }),
  });

  if (club.members === null) {
    return <Card><p className="text-sm text-slate-500">부원 명단은 그 동아리 부원과 교사만 볼 수 있습니다. 지금 {club.member_count}명이 활동합니다.</p></Card>;
  }

  return (
    <div className="space-y-3">
      {club.leader_unresolved && club.can_manage && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            받은 기장 목록의 <b>{personLabel(club.leader_unresolved)}</b> 학생이 이 동아리 명단에 없습니다. 명단에 넣은 뒤 기장으로 정하거나, 다른 부원을 기장으로 정해 주세요.
          </span>
        </div>
      )}

      {pending.length > 0 && (club.can_manage || canPropose) && (
        <Card>
          <PanelTitle icon={UserPlus} trailing={club.can_manage && pending.length > 1 ? (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700 hover:bg-emerald-50"
              onClick={() => decide.mutate({ ids: pending.map((p) => p.id), d: 'confirm' })}>모두 확정</Button>
          ) : null}>확정 대기 {pending.length}</PanelTitle>
          <ul className="mt-2 divide-y">
            {pending.map((m) => (
              <li key={m.id} className="flex min-w-0 items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{personLabel(m)}{m.note ? <span className="text-xs text-slate-500"> · {m.note}</span> : null}</span>
                {club.can_manage ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-emerald-700 hover:bg-emerald-50"
                      onClick={() => decide.mutate({ ids: [m.id], d: 'confirm' })}><Check className="h-3.5 w-3.5" />확정</Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-rose-600 hover:bg-rose-50"
                      onClick={() => decide.mutate({ ids: [m.id], d: 'reject' })}><X className="h-3.5 w-3.5" />거절</Button>
                  </>
                ) : <Badge variant="outline" className="text-[11px] text-slate-500">지도교사 확인 중</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <PanelTitle icon={Users} trailing={(club.can_manage || canPropose) && club.status === 'active' ? (
          <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setAddOpen(true)}
            disabled={readOnly} title={readOnly ? VIEW_AS_READONLY_TITLE : undefined}>
            <UserPlus className="h-3.5 w-3.5" />{club.can_manage ? '부원 넣기' : '부원 제안'}
          </Button>
        ) : null}>부원 {confirmed.length}</PanelTitle>
        {confirmed.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 명단이 없습니다.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-2 font-medium">학번</th>
                  <th className="py-1.5 pr-2 font-medium">이름</th>
                  <th className="py-1.5 pr-2 font-medium">역할</th>
                  {club.can_manage && <th className="py-1.5 text-right font-medium"><span className="sr-only">동작</span></th>}
                </tr>
              </thead>
              <tbody>
                {confirmed.map((m) => (
                  <tr key={m.id} className={cn('border-b last:border-0', m.mine && 'bg-blue-50/50')}>
                    <td className="py-1.5 pr-2 tabular-nums text-slate-600">{m.grade}-{m.class}-{m.number}</td>
                    <td className="py-1.5 pr-2">
                      {m.name ?? '—'}
                      {m.enrolled === false && <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[11px] text-slate-500">재학 아님</Badge>}
                    </td>
                    <td className="py-1.5 pr-2">
                      {m.role === 'leader'
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><Crown className="h-3 w-3" />기장</span>
                        : <span className="text-xs text-slate-500">부원</span>}
                    </td>
                    {club.can_manage && (
                      <td className="py-1 text-right whitespace-nowrap">
                        {m.role !== 'leader' && (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-slate-600" onClick={() => leader.mutate(m.code)}>
                            <Crown className="h-3.5 w-3.5" /><span className="hidden sm:inline">기장으로</span>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50" onClick={() => onRemove(m)} aria-label={`${m.name ?? ''} 빼기`}>
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MemberAddDialog open={addOpen} onOpenChange={setAddOpen} club={club} />
    </div>
  );
}
