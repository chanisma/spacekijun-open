import { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { PurchaseGuideDialog } from './components/guide/PurchaseGuideDialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Loader2, Plus, Search, ShoppingCart, Archive, LayoutList, UserRound, HelpCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth/AuthProvider';
import { isFacultyRole } from '@/lib/roles';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useToast } from '@/hooks/use-toast';
import {
  useDeletePurchaseRequestPage,
  usePurchaseRequestPages,
  useUpdatePurchaseRequestPage,
} from './hooks/usePurchaseRequestPages';
import { PurchaseRequestPageWithRelations } from './types';
import { PurchaseRequestRow } from './components/PurchaseRequestRow';
import { PageFormDialog } from './components/PageFormDialog';
import { MyRequestsBoard } from './components/MyRequestsBoard';
import { SortableHeader } from './components/SortableHeader';
import { SortState, nextSortState, sortRows } from '@/lib/tableSort';
import { useMyPurchaseRequestsAllPages } from './hooks/usePurchaseRequests';

type BoardTab = 'pages' | 'mine';

export default function PurchaseRequestsPage() {
  const { profile, isStudentView } = useAuth();
  const { data: resourceId } = useCurrentResourceId();
  const { toast } = useToast();
  const [guideOpen, setGuideOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PurchaseRequestPageWithRelations | null>(null);
  /** 복사 원본 — 있으면 작성 모달이 이 글의 내용을 채운 **새 글**로 열린다 */
  const [copySource, setCopySource] = useState<PurchaseRequestPageWithRelations | null>(null);
  // 탭이 헤더 안으로 들어오면서 헤더의 건수·검색 안내가 탭을 따라가야 해 controlled 로 바꿨다
  const [tab, setTab] = useState<BoardTab>('pages');
  // 목록 열 정렬. null = 기본 순서(서버가 준 최신순)
  const [sort, setSort] = useState<SortState | null>(null);

  const { data: pages = [], isLoading } = usePurchaseRequestPages(showArchived);
  const { data: myRequests = [] } = useMyPurchaseRequestsAllPages();
  const updatePage = useUpdatePurchaseRequestPage();
  const deletePage = useDeletePurchaseRequestPage();

  // 구매 신청은 행정 영역이라 직원(staff)도 교사와 동일하게 쓴다
  const isFaculty = isFacultyRole(profile?.role);
  const canCreate = isFaculty && !isStudentView;

  const isPageManager = (page: PurchaseRequestPageWithRelations): boolean => {
    if (!resourceId) return false;
    if (page.created_by === resourceId) return true;
    return (page.collaborators || []).some((c) => c.resource_id === resourceId);
  };

  const filteredPages = useMemo(() => {
    return pages.filter((p) => {
      const matchesArchive = showArchived ? p.is_archived : !p.is_archived;
      if (!matchesArchive) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.creator?.name || '').toLowerCase().includes(q)
      );
    });
  }, [pages, showArchived, searchQuery]);

  /**
   * 열 머리글 정렬. `sort` 가 null 이면 서버가 준 기본 순서(최신순) 그대로.
   * 빈 값은 방향과 무관하게 뒤로 간다(`compareWithDirection`).
   */
  const sortedPages = useMemo(
    () =>
      sortRows(
        filteredPages,
        sort,
        (p, key) => {
          switch (key) {
            case 'title':
              return p.title;
            case 'creator':
              return p.creator?.name ?? '';
            case 'period':
              return p.period_start;
            case 'requests':
              return p.request_count ?? 0;
            default:
              return '';
          }
        },
        (key) => key === 'requests',
      ),
    [filteredPages, sort],
  );

  const handleSort = (key: string) => setSort((prev) => nextSortState(prev, key));

  const archivedCount = useMemo(() => pages.filter((p) => p.is_archived).length, [pages]);

  const handleArchive = (page: PurchaseRequestPageWithRelations) => {
    updatePage.mutate(
      { pageId: page.id, input: { is_archived: !page.is_archived } },
      {
        onSuccess: () => {
          toast({
            title: page.is_archived ? '보관 해제' : '보관함으로 이동',
            description: page.title,
          });
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : '처리 중 오류';
          toast({ title: '실패', description: msg, variant: 'destructive' });
        },
      },
    );
  };

  const handleDelete = (page: PurchaseRequestPageWithRelations) => {
    if (
      !window.confirm(
        `"${page.title}" 페이지를 삭제하시겠습니까?\n\n⚠️ 모든 신청 데이터도 함께 삭제됩니다.`,
      )
    )
      return;
    deletePage.mutate(page.id, {
      onSuccess: () => toast({ title: '삭제됨', description: page.title }),
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : '삭제 실패';
        toast({ title: '삭제 실패', description: msg, variant: 'destructive' });
      },
    });
  };

  return (
    <Layout fullWidth>
      <div className="min-h-full bg-slate-50/50">
        {/* 탭 전환기가 헤더 카드 안에 있으므로 Tabs 루트가 헤더와 본문을 함께 감싼다 */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as BoardTab)}>
          <div className="px-4 sm:px-6 pt-4 sm:pt-6">
            <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
              <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
                <div className="flex flex-col gap-2">
                  {/* 머리글 — 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
                      건수는 [내 신청] 탭 배지·[보관함] 배지가 이미 말한다. */}
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {/* 사용 방법 — 처음 온 사람만 필요하므로 무게를 낮춰(ghost) 늘 같은 자리에 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setGuideOpen(true)}
                        className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700"
                        title="사용 방법"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">사용 방법</span>
                      </Button>

                      {/* 보관함은 '신청 페이지' 목록에만 걸리는 필터라 내 신청 탭에서는 내린다.
                          Button 이 inline-flex 라 hidden 속성으로는 안 사라지므로 조건부 렌더. */}
                      {tab === 'pages' && (
                        <Button
                          variant={showArchived ? 'default' : 'outline'}
                          size="icon"
                          onClick={() => setShowArchived(!showArchived)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border-slate-200 bg-white/50 text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-white sm:h-8 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm"
                          title="보관함"
                          aria-label="보관함"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">보관함</span>
                          {archivedCount > 0 && (
                            <Badge variant="secondary" className="hidden sm:inline-flex ml-1 h-5 px-1.5 text-[10px]">
                              {archivedCount}
                            </Badge>
                          )}
                        </Button>
                      )}

                      {canCreate && (
                        <Button
                          variant="default"
                          size="icon"
                          onClick={() => setCreateOpen(true)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm transition-all hover:from-emerald-600 hover:to-teal-700 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm"
                          title="페이지 생성"
                          aria-label="페이지 생성"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">페이지 생성</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 탭 + 검색 한 줄 — 탭을 헤더로 올리면서 세로로 쌓지 않는다(헤더가 길어진다).
                      좁은 화면에서만 검색이 탭 아래로 내려간다. */}
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:items-center">
                    <TabsList className="h-9 w-full shrink-0 justify-start bg-slate-100/80 sm:w-auto">
                      <TabsTrigger value="pages" className="gap-1.5">
                        <LayoutList className="h-3.5 w-3.5" /> 신청 페이지
                      </TabsTrigger>
                      <TabsTrigger value="mine" className="gap-1.5">
                        <UserRound className="h-3.5 w-3.5" /> 내 신청
                        {myRequests.length > 0 && (
                          <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                            {myRequests.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder={
                          tab === 'mine'
                            ? '내 신청 품목·페이지 검색...'
                            : '페이지 제목, 설명, 작성자 검색...'
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 bg-white/60 border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
            </ImprovedCard>
          </div>

          <main className="px-4 sm:px-6 py-4 pb-24 md:pb-6">
            <TabsContent value="pages" className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredPages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingCart className="h-12 w-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">
                    {searchQuery
                      ? '검색 결과가 없습니다.'
                      : showArchived
                      ? '보관된 페이지가 없습니다.'
                      : '아직 생성된 구매 신청 페이지가 없습니다.'}
                  </p>
                  {!searchQuery && !showArchived && canCreate && (
                    <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> 첫 페이지 만들기
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-xs font-semibold text-slate-600">
                        <th className="px-3 py-2.5 w-12 text-center hidden sm:table-cell">번호</th>
                        <th className="px-3 py-2.5">
                          <SortableHeader sortKey="title" sort={sort} onSort={handleSort}>
                            제목
                          </SortableHeader>
                        </th>
                        <th className="px-3 py-2.5 hidden md:table-cell whitespace-nowrap">
                          <SortableHeader sortKey="creator" sort={sort} onSort={handleSort}>
                            작성자
                          </SortableHeader>
                        </th>
                        {/* 대상은 값이 2종뿐이라 정렬해도 얻는 게 없다 */}
                        <th className="px-3 py-2.5 hidden lg:table-cell whitespace-nowrap">대상</th>
                        <th className="px-3 py-2.5 hidden md:table-cell whitespace-nowrap">
                          <SortableHeader sortKey="period" sort={sort} onSort={handleSort}>
                            신청 기간
                          </SortableHeader>
                        </th>
                        <th className="px-3 py-2.5 hidden sm:table-cell whitespace-nowrap">
                          <SortableHeader sortKey="requests" sort={sort} onSort={handleSort}>
                            신청 현황
                          </SortableHeader>
                        </th>
                        <th className="px-2 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPages.map((page, idx) => (
                        <PurchaseRequestRow
                          key={page.id}
                          page={page}
                          index={sortedPages.length - idx}
                          isManager={isPageManager(page)}
                          canCopy={canCreate}
                          onEdit={() => setEditingPage(page)}
                          onCopy={() => setCopySource(page)}
                          onArchive={() => handleArchive(page)}
                          onDelete={() => handleDelete(page)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-0">
              <MyRequestsBoard searchQuery={searchQuery} />
            </TabsContent>
          </main>
        </Tabs>

        <PageFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
        {copySource && (
          <PageFormDialog
            open={!!copySource}
            onOpenChange={(o) => {
              if (!o) setCopySource(null);
            }}
            mode="create"
            initialPage={copySource}
          />
        )}

        <PurchaseGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
        {editingPage && (
          <PageFormDialog
            open={!!editingPage}
            onOpenChange={(o) => {
              if (!o) setEditingPage(null);
            }}
            mode="edit"
            initialPage={editingPage}
          />
        )}
      </div>
    </Layout>
  );
}
