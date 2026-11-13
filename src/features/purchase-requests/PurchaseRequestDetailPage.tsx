import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Loader2, ShoppingCart, Users } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useRequesterResourceId } from './hooks/useRequesterResourceId';
import { usePurchaseRequestPage } from './hooks/usePurchaseRequestPages';
import { PageFormDialog } from './components/PageFormDialog';
import { ManagerView } from './components/ManagerView';
import { RequesterView } from './components/RequesterView';
import { PurchaseOrderView } from './components/order/PurchaseOrderView';
import { ManagerStepTabs } from './components/ManagerStepTabs';
import { PeriodBadge, formatPeriodRange } from './components/PeriodBadge';

export default function PurchaseRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // 게시판 "내 신청" 모아보기에서 진입 시 ?tab=mine 딥링크로 내 신청 탭을 기본 선택.
  // ?tab=order = 품의 정리 (매니저 전용 — 매니저가 아니면 탭이 없어 무시된다)
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'mine' ? 'mine' : tabParam === 'order' ? 'order' : 'manage';
  const { profile, isStudentView } = useAuth();
  // 매니저 여부는 user_resource 기반(교사 흐름) 그대로 사용.
  const { data: managerResourceId } = useCurrentResourceId();
  // 신청자 흐름은 학생도 자동 해결되도록 self-healing 리졸버 사용.
  const { data: requesterResourceId } = useRequesterResourceId();
  const { data: page, isLoading } = usePurchaseRequestPage(id);
  const [editOpen, setEditOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!page) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-sm text-slate-500">페이지를 찾을 수 없습니다.</p>
          <Button
            variant="outline"
            onClick={() => navigate('/purchase-requests')}
            className="mt-4"
          >
            목록으로
          </Button>
        </div>
      </Layout>
    );
  }

  const isOwner = !!managerResourceId && page.created_by === managerResourceId;
  const isCollaborator =
    !!managerResourceId && (page.collaborators || []).some((c) => c.resource_id === managerResourceId);
  const isManager = isOwner || isCollaborator;

  // 신청 가능 여부: 학생 시점이면 'student' 포함, 아니면 'teacher' 포함
  const myRoleKey: 'student' | 'teacher' = isStudentView
    ? 'student'
    : profile?.role === 'student'
    ? 'student'
    : 'teacher';
  const isTargetRole = (page.target_roles || []).includes(myRoleKey);
  const canSubmit = !!requesterResourceId && isTargetRole;

  const targetText = (page.target_roles || [])
    .map((r) => (r === 'student' ? '학생' : r === 'teacher' ? '교사' : r))
    .join(' · ');

  // 매니저는 늘 단계 탭을 본다 — ① 신청 검토 · ② 품의·구매(2026-10-13 개편), 신청 대상이기도 하면 + 내 신청.
  // 매니저의 기본 화면은 ① 신청 검토
  const showTabs = isManager;

  const description = page.description?.trim() || '';
  const descIsLong = description.length > 120 || description.includes('\n');

  // 헤더는 탭 유무와 무관하게 같아야 하므로 슬롯만 받는 함수로 만든다
  const headerCard = (tabs: ReactNode) => (
    <div className="px-4 sm:px-6 pt-4 sm:pt-6">
      <div className="rounded-xl border border-white/20 bg-white/70 backdrop-blur-md shadow-sm px-3 sm:px-5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="rounded-lg border border-emerald-100/60 bg-emerald-50 p-2 text-emerald-600 shrink-0">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold leading-tight tracking-tight text-slate-900 sm:text-lg truncate">
                  {page.title}
                </h2>
                <PeriodBadge
                  periodStart={page.period_start}
                  periodEnd={page.period_end}
                  archived={page.is_archived}
                  showDday
                />
                {isOwner ? (
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[10px]">
                    작성자
                  </Badge>
                ) : isCollaborator ? (
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-[10px]">
                    공동 작업자
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                <span>{formatPeriodRange(page.period_start, page.period_end)}</span>
                <span>·</span>
                <span>대상 {targetText}</span>
                {page.creator?.name && (
                  <>
                    <span>·</span>
                    <span>작성자 {page.creator.name}</span>
                  </>
                )}
                {(page.collaborators?.length || 0) > 0 && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3 text-slate-400" />
                      {page.collaborators!.map((c) => c.resource?.name || '—').join(', ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate('/purchase-requests')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border-slate-200 bg-white/50 text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-white sm:h-8 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm"
              title="목록"
              aria-label="목록"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">목록</span>
            </Button>

            {isManager && (
              <Button
                variant="default"
                size="icon"
                onClick={() => setEditOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm transition-all hover:from-emerald-600 hover:to-teal-700 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm"
                title="페이지 수정"
                aria-label="페이지 수정"
              >
                <Edit className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">페이지 수정</span>
              </Button>
            )}
          </div>
        </div>

        {description && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <p
              className={`text-sm text-slate-700 whitespace-pre-wrap ${
                descIsLong && !descExpanded ? 'line-clamp-2' : ''
              }`}
            >
              {description}
            </p>
            {descIsLong && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-0.5 text-xs text-slate-400 hover:text-slate-600"
              >
                {descExpanded ? '접기' : '더보기'}
              </button>
            )}
          </div>
        )}

        {tabs && <div className="mt-2 border-t border-slate-100 pt-2">{tabs}</div>}
      </div>
    </div>
  );

  return (
    <Layout fullWidth>
      <div className="min-h-full bg-slate-50/50">
        {showTabs ? (
          <Tabs defaultValue={initialTab === 'mine' && !canSubmit ? 'manage' : initialTab}>
            {headerCard(<ManagerStepTabs page={page} showMine={canSubmit} />)}
            <main className="px-4 sm:px-6 py-4 pb-24 md:pb-6">
              <TabsContent value="manage" className="mt-0">
                <ManagerView page={page} />
              </TabsContent>
              <TabsContent value="order" className="mt-0">
                <PurchaseOrderView page={page} />
              </TabsContent>
              {canSubmit && (
                <TabsContent value="mine" className="mt-0">
                  <RequesterView page={page} canSubmit={canSubmit} />
                </TabsContent>
              )}
            </main>
          </Tabs>
        ) : (
          <>
            {headerCard(null)}
            <main className="px-4 sm:px-6 py-4 pb-24 md:pb-6">
              {/* 매니저는 위 탭 분기로 간다 — 여기는 신청자·비대상만 */}
              {canSubmit ? (
                <RequesterView page={page} canSubmit={canSubmit} />
              ) : (
                <div className="text-center py-10 text-sm bg-white rounded-lg border">
                  {!isTargetRole ? (
                    <span className="text-slate-500">이 페이지의 신청 대상이 아닙니다.</span>
                  ) : (
                    <div className="space-y-1 text-amber-700">
                      <p className="font-medium">
                        학생/교사 정보를 시스템에서 찾을 수 없어 신청을 진행할 수 없습니다.
                      </p>
                      <p className="text-xs text-slate-500">
                        관리자에게 계정-리소스 연결을 요청해 주세요.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </main>
          </>
        )}

        <PageFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          initialPage={page}
        />
      </div>
    </Layout>
  );
}
