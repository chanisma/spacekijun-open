import '@/components/ui/improved-card.css';
// ========================================
// 공지사항 페이지
// 부서 북마크 탭(활성 공지 부서만) + 공지 리스트 + 작성/상세 모달.
// 홈 대시보드 학사 정보 알림 카드에서 ?notice=<id> 딥링크로 진입 가능.
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, CalendarRange, ChevronRight, Loader2, Megaphone, Paperclip, Plus, Search, UserRound } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useDepartmentNotices } from './hooks/useNotices';
import { useNoticeSeen } from './hooks/useNoticeSeen';
import { NoticeBookmarkTabs, ALL_DEPARTMENTS, type DeptTabInfo } from './components/NoticeBookmarkTabs';
import { NoticeFormDialog } from './components/NoticeFormDialog';
import { NoticeDraftWidget } from './components/NoticeDraftWidget';
import type { NoticeDraftSeed } from './utils/noticeDraft';
import { NoticeDetailDialog } from './components/NoticeDetailDialog';
import { getNoticeStatus, isNoticeActive, formatPeriod, todayStr } from './utils/noticeDates';
import { NOTICE_DEEP_LINK_PARAM } from './utils/noticeShare';
import { STATUS_BADGE } from './utils/statusBadge';
import type { DepartmentNotice } from './types';

const STATUS_ORDER: Record<string, number> = { active: 0, upcoming: 1, expired: 2 };

export default function NoticeBoardPage() {
  const { data: notices = [], isLoading } = useDepartmentNotices();
  const { isUnseen, markSeen } = useNoticeSeen(notices);
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedDept, setSelectedDept] = useState<string>(ALL_DEPARTMENTS);
  const [showAllPeriods, setShowAllPeriods] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState<NoticeDraftSeed | null>(null);
  const [editing, setEditing] = useState<DepartmentNotice | null>(null);
  const [detailNotice, setDetailNotice] = useState<DepartmentNotice | null>(null);

  const today = todayStr();

  // 활성 공지 (게시 기간 내)
  const activeNotices = useMemo(
    () => notices.filter((n) => isNoticeActive(n, today)),
    [notices, today]
  );

  // 부서 북마크 — 활성 공지가 있는 부서만, 미확인(NEW) 여부 포함
  const deptTabs = useMemo<DeptTabInfo[]>(() => {
    const map = new Map<string, { count: number; hasNew: boolean }>();
    activeNotices.forEach((n) => {
      const entry = map.get(n.department) || { count: 0, hasNew: false };
      entry.count += 1;
      if (isUnseen(n.id)) entry.hasNew = true;
      map.set(n.department, entry);
    });
    return [...map.entries()]
      .map(([department, { count, hasNew }]) => ({ department, count, hasNew }))
      .sort((a, b) => a.department.localeCompare(b.department, 'ko'));
  }, [activeNotices, isUnseen]);

  const hasAnyNew = useMemo(
    () => activeNotices.some((n) => isUnseen(n.id)),
    [activeNotices, isUnseen]
  );

  // 선택된 부서 탭이 사라지면(공지 만료 등) 전체 탭으로 복귀.
  // 로딩 중에는 판정하지 않는다 — 목록이 아직 빈 것을 "탭 소멸"로 오판해
  // 사용자의 탭 선택을 리셋하는 것을 막는다(비동기 목록 판정 버그 부류).
  useEffect(() => {
    if (isLoading) return;
    if (selectedDept === ALL_DEPARTMENTS) return;
    if (!deptTabs.some((t) => t.department === selectedDept)) {
      setSelectedDept(ALL_DEPARTMENTS);
    }
  }, [deptTabs, selectedDept, isLoading]);

  // 딥링크 (?notice=<id>) — 대시보드 카드 클릭·공유받은 링크 진입. 1회 소비 후 URL에서 제거.
  // 판정 기준은 `notices.length === 0`이 아니라 `isLoading`이다 — 열람 가능한 공지가
  // 하나도 없는 사용자(열람 대상 제한)에게는 목록이 영영 비어 있어 아무 일도 일어나지 않았다.
  useEffect(() => {
    const noticeId = searchParams.get(NOTICE_DEEP_LINK_PARAM);
    if (!noticeId || isLoading) return;
    const target = notices.find((n) => n.id === noticeId);
    if (target) {
      setDetailNotice(target);
      markSeen([target.id]);
    } else {
      // 삭제됐거나 열람 대상(target_resource_ids)이 아닌 공지. 링크를 주고받는 기능이
      // 생긴 이상 실제로 일어나는 일이라, 조용히 param만 지우면 "눌렀는데 아무 일도
      // 안 일어남"이 된다.
      toast.error('공지를 열 수 없습니다. 삭제되었거나 열람 권한이 없는 공지입니다.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete(NOTICE_DEEP_LINK_PARAM);
    setSearchParams(next, { replace: true });
  }, [notices, isLoading, searchParams, setSearchParams, markSeen]);

  // 리스트에 표시할 공지 — 기본은 활성만, "지난 공지 포함" 시 전체 기간
  const visibleNotices = useMemo(() => {
    const base = showAllPeriods ? notices : activeNotices;
    const filtered =
      selectedDept === ALL_DEPARTMENTS
        ? base
        : base.filter((n) => n.department === selectedDept);
    // 게시 중 → 예정 → 종료 순, 같은 상태 안에서는 최신 등록순 유지
    const query = search.trim().toLocaleLowerCase();
    const matches = filtered.filter((notice) => !query || [notice.title, notice.department, notice.author_name ?? ''].some(value => value.toLocaleLowerCase().includes(query)));
    return [...matches].sort(
      (a, b) => STATUS_ORDER[getNoticeStatus(a, today)] - STATUS_ORDER[getNoticeStatus(b, today)]
    );
  }, [notices, activeNotices, selectedDept, showAllPeriods, today, search]);

  const openDetail = (notice: DepartmentNotice) => {
    setDetailNotice(notice);
    markSeen([notice.id]);
  };

  const openCreate = () => {
    setNoticeDraft(null);
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (notice: DepartmentNotice) => {
    setNoticeDraft(null);
    setDetailNotice(null);
    setEditing(notice);
    setFormOpen(true);
  };

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
        {/* 머리글 — 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
            게시 중 건수는 [전체] 북마크의 숫자가 이미 말한다. 부서 북마크 | 검색·버튼 한 덩어리. */}
        <header className="card-surface-effect rounded-3xl border border-white/20 bg-white/70 shadow-sm backdrop-blur-md">
          <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <NoticeBookmarkTabs tabs={deptTabs} totalCount={activeNotices.length} hasAnyNew={hasAnyNew}
              selected={selectedDept} onSelect={setSelectedDept} />
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)}
                  aria-label="공지 검색" placeholder="제목, 부서, 작성자 검색"
                  className="h-9 rounded-xl border-slate-200 bg-slate-50/50 pl-9 text-sm shadow-none" />
              </div>
              <Button variant="outline" size="sm" aria-pressed={showAllPeriods}
                onClick={() => setShowAllPeriods((value) => !value)}
                title={showAllPeriods ? '전체 기간 표시 중' : '지난 공지·예정 공지 포함'}
                className={cn('h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-xs sm:px-3 sm:text-sm',
                  showAllPeriods ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                <Archive className="h-3.5 w-3.5 text-amber-500" />
                {/* 휴대폰에서는 검색창 옆에 서므로 아이콘만 — 상태는 목록 머리의 '게시 중 · 예정 · 종료'가 말한다 */}
                <span className="hidden sm:inline">{showAllPeriods ? '전체 기간 표시 중' : '지난 공지·예정 공지 포함'}</span>
              </Button>
              <Button size="sm" onClick={openCreate}
                className="h-9 shrink-0 gap-1.5 rounded-xl bg-blue-600 px-2.5 text-xs text-white hover:bg-blue-700 sm:px-3 sm:text-sm">
                <Plus className="h-3.5 w-3.5" />공지 작성
              </Button>
            </div>
          </div>
        </header>

        <section aria-label="공지 목록" className="card-surface-effect overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
            <p className="text-xs font-medium text-slate-500">
              {selectedDept === ALL_DEPARTMENTS ? '전체 부서' : selectedDept}
              <span className="ml-2 font-semibold tabular-nums text-slate-900">{visibleNotices.length}</span>
            </p>
            <span className="text-xs text-slate-400">{showAllPeriods ? '게시 중 · 예정 · 종료' : '현재 게시 중인 공지'}</span>
          </div>
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                공지사항을 불러오는 중...
              </div>
            ) : visibleNotices.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">
                  {search.trim() ? '검색 조건에 맞는 공지사항이 없습니다.' : showAllPeriods ? '등록된 공지사항이 없습니다.' : '현재 게시 중인 공지사항이 없습니다.'}
                </p>
                {search.trim() ? (
                  <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={() => setSearch('')}>검색어 지우기</Button>
                ) : (
                  <Button size="sm" className="mt-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={openCreate}>공지 작성하기</Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleNotices.map((notice) => {
                  const status = getNoticeStatus(notice, today);
                  const isNew = status === 'active' && isUnseen(notice.id);
                  return (
                    <li key={notice.id}>
                      <button
                        type="button"
                        onClick={() => openDetail(notice)}
                        className={cn(
                          'group flex w-full items-center gap-4 px-4 py-5 text-left transition-colors sm:px-6',
                          'hover:bg-slate-50/80 active:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400',
                          status !== 'active' && 'opacity-60'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded-md border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600"
                            >
                              {notice.department}
                            </Badge>
                            {status !== 'active' && (
                              <Badge
                                variant="outline"
                                className={cn('shrink-0 text-[11px]', STATUS_BADGE[status].className)}
                              >
                                {STATUS_BADGE[status].label}
                              </Badge>
                            )}
                            {isNew && (
                              <Badge className="shrink-0 bg-rose-500 px-1.5 py-0 text-[10px] leading-4 hover:bg-rose-500">
                                N
                              </Badge>
                            )}
                          </div>
                          <span
                            className={cn(
                              'mt-2 block break-words text-sm leading-relaxed text-slate-900 sm:text-base',
                              isNew ? 'font-semibold' : 'font-medium'
                            )}
                          >
                            {notice.title}
                          </span>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <CalendarRange className="h-3 w-3" />
                              {formatPeriod(notice)}
                            </span>
                            {notice.author_name && (
                              <span className="flex items-center gap-1">
                                <UserRound className="h-3 w-3" />
                                {notice.author_name}
                              </span>
                            )}
                            <span>{new Date(notice.created_at).toLocaleDateString('ko-KR')} 등록</span>
                            {!!notice.attachments?.length && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />첨부 {notice.attachments.length}</span>}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-600" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 작성/수정 모달 */}
      <NoticeFormDialog
        initialDraft={noticeDraft}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onCreated={(notice) => markSeen([notice.id])}
      />

      {/* 상세 모달 */}
      <NoticeDraftWidget onUseDraft={draft => {
        setNoticeDraft(draft);
        setEditing(null);
        setFormOpen(true);
      }} />
      <NoticeDetailDialog
        notice={detailNotice ? notices.find((notice) => notice.id === detailNotice.id) ?? detailNotice : null}
        onOpenChange={(open) => {
          if (!open) setDetailNotice(null);
        }}
        onEdit={openEdit}
      />
    </Layout>
  );
}
