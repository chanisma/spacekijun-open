// 동아리 (/clubs) — 2026-11-11 동아리 관리 P1. 설계 = docs/plans/2026-11-11-club-management.md
//   /clubs                 목록(교직원 = 전교 표 + 내 동아리, 학생 = 우리 동아리)
//   /clubs?year=2025       다른 해
//   /clubs?club=<id>&tab=  한 장 보기(지도교사·학생). 담당자는 표의 행 → 모달
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Crown, Eye, GraduationCap, MapPin, Plus, Search, Send, Users } from 'lucide-react';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { CLUBS_QUERY_KEY, useClubFinanceOverview, useClubList } from './hooks/useClubs';
import { setViewAs, useViewAs, type ViewAsStudent } from './viewAs';

/** 표 칸이 좁아 만 원 단위(1만 미만은 원) */
const manwon = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000) / 10}만` : `${n.toLocaleString('ko-KR')}원`);
import { clubField, clubShortName, clubTodos, clubTone } from './model/clubDisplay';
import { KIND_LABEL, ROLE_LABEL, STATUS_LABEL, personLabel, type ClubKind, type ClubSummary } from './types';
import { ClubView, type ClubTab } from './components/ClubView';
import { ClubEditDialog } from './components/ClubEditDialog';
import { RequestBoard, RequestComposeDialog } from './components/RequestCompose';
import { RecruitAdmin, StudentRecruit } from './components/Recruit';
import { ArchiveLinkCard } from './components/ArchiveLinkCard';

type KindFilter = 'all' | ClubKind;

export default function ClubsPage() {
  const { isStudentView, isAdmin } = useAuth();
  const viewAs = useViewAs();
  const [studentMode, setStudentMode] = useState(false);
  const qc = useQueryClient();
  useEffect(() => () => setViewAs(null), []); // 화면을 떠나면 «학생으로 보기»를 끝낸다
  const [params, setParams] = useSearchParams();
  const year = Number(params.get('year')) || null;
  const openId = params.get('club');
  const [modalId, setModalId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error } = useClubList(year);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    setParams(next);
  };
  const openPage = (id: string) => setParam({ club: id, tab: null });

  /** 관리자의 보기 전환 — 학생을 바꾸면 동아리 캐시를 비우고(다른 사람의 화면) 목록으로 돌아간다 */
  const switchView = (student: boolean, who: ViewAsStudent | null) => {
    setStudentMode(student);
    if (who?.resourceId !== viewAs?.resourceId) {
      setViewAs(who);
      setModalId(null);
      setParam({ club: null, tab: null });
      void qc.resetQueries({ queryKey: CLUBS_QUERY_KEY });
    }
  };
  const showAdminBar = isAdmin && !isStudentView;
  const waitingForStudent = showAdminBar && studentMode && !viewAs;

  return (
    <Layout>
      <PageContainer>
        {showAdminBar && <AdminViewBar studentMode={studentMode} viewAs={viewAs} onSwitch={switchView} />}
        {waitingForStudent ? (
          <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
            학생을 고르면 그 학생이 보는 동아리 화면을 그대로 보여 줍니다(읽기 전용).
          </p>
        ) : openId ? (
          <ClubView
            clubYearId={openId}
            tab={params.get('tab')}
            onTabChange={(t: ClubTab) => setParam({ tab: t === 'overview' ? null : t })}
            onBack={() => setParam({ club: null, tab: null })}
            onOpenOther={openPage}
          />
        ) : isLoading ? (
          <div className="space-y-3"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
        ) : error || !data ? (
          <p className="rounded-xl border bg-white p-6 text-center text-sm text-rose-600">{(error as Error)?.message ?? '불러오지 못했습니다'}</p>
        ) : isStudentView || viewAs ? (
          <StudentHome clubs={data.clubs} year={data.year} onOpen={openPage} />
        ) : (
          <FacultyHome
            year={data.year}
            years={data.years}
            clubs={data.clubs}
            isManager={data.is_manager}
            onYear={(y) => setParam({ year: y === null ? null : String(y) })}
            onOpenPage={openPage}
            onOpenModal={setModalId}
            onCreate={() => setCreateOpen(true)}
          />
        )}

        <Dialog open={!!modalId} onOpenChange={(o) => { if (!o) setModalId(null); }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-slate-50 p-3 sm:p-4">
            <DialogTitle className="sr-only">동아리 상세</DialogTitle>
            {modalId && <ClubView clubYearId={modalId} embedded onOpenOther={setModalId} />}
          </DialogContent>
        </Dialog>
        {data && (
          <ClubEditDialog open={createOpen} onOpenChange={setCreateOpen} year={data.year} isManager={data.is_manager}
            onSaved={(id) => setModalId(id)} />
        )}
      </PageContainer>
    </Layout>
  );
}

function FacultyHome({ year, years, clubs, isManager, onYear, onOpenPage, onOpenModal, onCreate }: {
  year: number; years: number[]; clubs: ClubSummary[]; isManager: boolean;
  onYear: (y: number | null) => void; onOpenPage: (id: string) => void; onOpenModal: (id: string) => void; onCreate: () => void;
}) {
  const [q, setQ] = useState('');
  const [view, setView] = useState<'clubs' | 'requests' | 'recruit'>('clubs');
  const [composeOpen, setComposeOpen] = useState(false);
  const [kind, setKind] = useState<KindFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const mine = clubs.filter((c) => c.my_role === 'advisor');
  const { data: finance = {} } = useClubFinanceOverview(year, isManager);
  const yearOptions = [...new Set([year, ...years])].sort((a, b) => b - a);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clubs
      .filter((c) => (showInactive ? true : c.status === 'active' || c.status === 'proposed'))
      .filter((c) => (kind === 'all' ? true : c.kind === kind))
      .filter((c) => !needle || [c.name, c.place, clubField(c), ...c.advisors.map((a) => a.name)]
        .some((s) => (s ?? '').toLowerCase().includes(needle)));
  }, [clubs, q, kind, showInactive]);
  const inactiveCount = clubs.filter((c) => c.status === 'inactive').length;
  const total = clubs.filter((c) => c.status === 'active').reduce((s, c) => s + c.member_count, 0);

  return (
    <div className="space-y-4">
      {/* 머리글 = 필터·동작만(기능명·아이콘 없음, UI 규약 §1) */}
      <div className="rounded-xl border border-slate-200/70 bg-white/70 px-2 py-2 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] backdrop-blur-md sm:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs sm:text-sm" aria-label="학년도"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}학년도</SelectItem>)}</SelectContent>
          </Select>
          {isManager && (
            <div className="flex gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="보기">
              {(['clubs', 'requests', 'recruit'] as const).map((v) => (
                <Button key={v} type="button" variant="ghost" size="sm" aria-pressed={view === v} onClick={() => setView(v)}
                  className={cn('h-7 px-2 text-xs sm:px-3', view === v ? 'bg-white font-medium text-blue-700 shadow-sm hover:bg-white' : 'text-slate-500')}>
                  {v === 'clubs' ? '동아리' : v === 'requests' ? '요청 현황' : '편성'}
                </Button>
              ))}
            </div>
          )}
          {view === 'clubs' && (<>
          <div className="flex gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="종류">
            {(['all', 'regular', 'autonomous'] as KindFilter[]).map((k) => (
              <Button key={k} type="button" variant="ghost" size="sm" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={cn('h-7 px-2 text-xs sm:px-3', kind === k ? 'bg-white font-medium text-blue-700 shadow-sm hover:bg-white' : 'text-slate-500')}>
                {k === 'all' ? '전체' : KIND_LABEL[k]}
              </Button>
            ))}
          </div>
          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="동아리·지도교사·장소" className="h-8 pl-8 text-base sm:text-sm" />
          </div>
          {inactiveCount > 0 && (
            <Button type="button" variant="ghost" size="sm" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)}
              className={cn('h-8 px-2 text-xs', showInactive ? 'bg-slate-100 text-slate-800' : 'text-slate-500')}>
              지금 없는 동아리 {inactiveCount}
            </Button>
          )}
          </>
          )}
          {isManager && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setComposeOpen(true)} aria-label="요청 보내기">
                <Send className="h-3.5 w-3.5" /><span className="hidden sm:inline">요청 보내기</span>
              </Button>
              {/* 주 동작(파란 버튼)은 화면에 하나 — «편성»에는 편성 회차 열기가 있다 */}
              {view === 'clubs' && (
                <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={onCreate} aria-label="동아리 만들기">
                  <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">동아리 만들기</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {isManager && <RequestComposeDialog open={composeOpen} onOpenChange={setComposeOpen} year={year} clubs={clubs} />}
      {view === 'requests' ? <RequestBoard year={year} onOpenClub={onOpenModal} /> : view === 'recruit' ? <RecruitAdmin year={year} onOpenClub={onOpenModal} /> : (<>
      {isManager && <ArchiveLinkCard clubs={clubs} />}
      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-800">내가 지도하는 동아리</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => <ClubCard key={c.id} club={c} onOpen={() => onOpenPage(c.id)} />)}
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-slate-500">
          <span>{rows.length}개 동아리 · 활동 중 부원 {total}명</span>
          {isManager && <span className="hidden sm:inline">행을 누르면 상세가 열립니다</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b bg-slate-50/60 text-left text-[11px] text-slate-500">
                <th className="px-4 py-2 font-medium">동아리</th>
                <th className="px-2 py-2 font-medium">지도교사</th>
                <th className="px-2 py-2 font-medium">기장</th>
                <th className="px-2 py-2 font-medium">장소</th>
                <th className="px-2 py-2 text-right font-medium">부원</th>
                {isManager && <th className="px-2 py-2 text-right font-medium">품의 / 배정</th>}
                <th className="px-4 py-2 font-medium">확인할 것</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const tone = clubTone(c);
                const todos = clubTodos(c, isManager || c.my_role === 'advisor');
                return (
                  <tr key={c.id} onClick={() => (c.my_role === 'advisor' && !isManager ? onOpenPage(c.id) : onOpenModal(c.id))}
                    className={cn('cursor-pointer border-b last:border-0 hover:bg-blue-50/40', c.status === 'inactive' && 'text-slate-400')}>
                    <td className="px-4 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone.accent }} aria-hidden />
                        <span className="truncate font-medium text-slate-900" title={c.name}>{c.name}</span>
                        {c.kind === 'autonomous' && <Badge variant="outline" className="h-4 px-1 text-[11px]">자율</Badge>}
                        {c.status !== 'active' && <Badge variant="outline" className="h-4 px-1 text-[11px] text-slate-500">{STATUS_LABEL[c.status]}</Badge>}
                        {c.years_running >= 2 && <span className="text-[11px] text-slate-400">{c.years_running}년째</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-slate-700">{c.advisors.map((a) => a.name).join(', ') || <span className="text-rose-600">없음</span>}</td>
                    <td className="px-2 py-2 text-slate-700">{c.leader ? personLabel(c.leader) : <span className="text-slate-400">—</span>}</td>
                    <td className="px-2 py-2 text-slate-600">{c.place ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.member_count}{c.capacity ? <span className="text-slate-400">/{c.capacity}</span> : null}</td>
                    {isManager && (
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-600">
                        {finance[c.id] ? <>{manwon(finance[c.id].amounts?.ordered ?? 0)}<span className="text-slate-400"> / {finance[c.id].allocated == null ? '—' : manwon(finance[c.id].allocated!)}</span></> : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {todos.map((t) => (
                          <span key={t.key} className={cn('rounded-full px-2 py-0.5 text-[11px]',
                            t.tone === 'amber' ? 'bg-amber-50 text-amber-800' : t.tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600')}>
                            {t.key === 'leader_unresolved' ? '기장 확인' : t.label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>)}
    </div>
  );
}

/** 동아리 카드 — 흰 카드(업무노트 톤), 동아리 고유 색은 머리글자 표식에만. featured = 한 장뿐일 때 넓게 */
function ClubCard({ club, onOpen, featured }: { club: ClubSummary; onOpen: () => void; featured?: boolean }) {
  const tone = clubTone(club);
  const todos = clubTodos(club, club.my_role === 'advisor' || club.my_role === 'manager');
  const short = clubShortName(club.name) || club.name;
  const sub = [clubField(club), club.kind === 'autonomous' ? KIND_LABEL.autonomous : null, club.years_running >= 2 ? `${club.years_running}년째` : null]
    .filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onOpen} title={club.name}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
        <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-xl font-bold', featured ? 'h-14 w-14 text-2xl' : 'h-11 w-11 text-lg')}
          style={{ background: tone.badge, color: tone.fg }}>{short.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate font-semibold text-slate-900', featured ? 'text-xl' : 'text-base')}>{short}</span>
            {club.my_role && <Badge className="h-5 shrink-0 bg-blue-50 px-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50">{ROLE_LABEL[club.my_role]}</Badge>}
          </div>
          {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" aria-hidden />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 sm:px-5">
        {club.description && <p className={cn('text-sm leading-relaxed text-slate-600', featured ? 'line-clamp-3' : 'line-clamp-2')}>{club.description}</p>}
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-slate-400" />{club.member_count}명{club.capacity ? <span className="text-slate-400">/{club.capacity}</span> : null}</span>
          {club.leader && <span className="inline-flex items-center gap-1"><Crown className="h-3.5 w-3.5 text-amber-500" />{club.leader.name}</span>}
          {club.advisors.length > 0 && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5 text-slate-400" />{club.advisors.map((a) => a.name).join(' · ')}</span>}
          {club.place && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{club.place}</span>}
        </div>
        {todos.length > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />{todos[0].label}{todos.length > 1 ? ` 외 ${todos.length - 1}` : ''}
          </span>
        )}
      </div>
    </button>
  );
}

/** 관리자 전용 — [담당자 화면 · 학생 화면]. 학생 화면은 고른 학생 계정으로 읽은 그대로(서버 club_view_as), 바꾸기는 막힌다 */
function AdminViewBar({ studentMode, viewAs, onSwitch }: {
  studentMode: boolean; viewAs: ViewAsStudent | null; onSwitch: (student: boolean, who: ViewAsStudent | null) => void;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2',
      viewAs && 'rounded-xl border border-amber-200 bg-amber-50/70 px-2 py-2 sm:px-3')}>
      <div className="flex gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="관리자 보기">
        {([false, true] as const).map((s) => (
          <Button key={String(s)} type="button" variant="ghost" size="sm" aria-pressed={studentMode === s}
            onClick={() => onSwitch(s, s ? viewAs : null)}
            className={cn('h-7 px-2 text-xs sm:px-3', studentMode === s ? 'bg-white font-medium text-blue-700 shadow-sm hover:bg-white' : 'text-slate-500')}>
            {s ? '학생 화면' : '담당자 화면'}
          </Button>
        ))}
      </div>
      {studentMode && (
        <div className="min-w-[14rem] flex-1 sm:max-w-sm">
          <SearchableMultiSelect
            selectedValues={viewAs ? [viewAs.resourceId] : []}
            onSelectionChange={(ids) => {
              const id = ids[0];
              onSwitch(true, id ? { resourceId: id, label: id === viewAs?.resourceId ? viewAs.label : '' } : null);
            }}
            singleSelect
            filterByStudent
            placeholder="볼 학생 이름 검색"
          />
        </div>
      )}
      {viewAs && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-800">
          <Eye className="h-3.5 w-3.5" />{viewAs.label ? `${viewAs.label} 학생으로 보는 중` : '학생으로 보는 중'} · 읽기 전용
        </span>
      )}
    </div>
  );
}

function StudentHome({ clubs, year, onOpen }: { clubs: ClubSummary[]; year: number; onOpen: (id: string) => void }) {
  const mine = clubs.filter((c) => c.my_role === 'leader' || c.my_role === 'member');
  return (
    <div className="space-y-4">
      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-800">우리 동아리 · {year}학년도</h2>
          <div className={cn('grid gap-4', mine.length > 1 && 'sm:grid-cols-2')}>
            {mine.map((c) => <ClubCard key={c.id} club={c} featured={mine.length === 1} onOpen={() => onOpen(c.id)} />)}
          </div>
        </section>
      )}
      {mine.length === 0 && <NoClub />}
      <StudentRecruit year={year} />
    </div>
  );
}

function NoClub() {
  return (
    <div className="rounded-xl border bg-white p-8 text-center">
      <Users className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm text-slate-600">올해 소속된 동아리가 없습니다.</p>
      <p className="mt-1 text-xs text-slate-500">명단이 틀렸다면 동아리 지도교사께 말씀해 주세요.</p>
    </div>
  );
}
