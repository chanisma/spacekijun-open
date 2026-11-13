import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Newspaper, ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathVisible } from '@/lib/menuVisibility';
import { supabase } from '@/integrations/supabase/client';
import { DashboardCardShell, DashboardCardSkeleton } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { activeStudentPurchasePages, readStudentIpsiHome, readStudentPurchaseHome } from './studentHomeData';

function QueryError({ retry }: { retry: () => void }) {
  return <p className="py-5 text-sm text-slate-500">정보를 불러오지 못했습니다. <button type="button" onClick={retry} className="rounded text-sky-700 underline focus-visible:ring-2 focus-visible:ring-sky-600">다시 시도</button></p>;
}

function PurchaseCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useCurrentTime();
  const query = useQuery({ queryKey: ['student-home', 'purchases', user?.id], queryFn: () => readStudentPurchaseHome(supabase), staleTime: 30_000, refetchInterval: 60_000 });
  const pages = activeStudentPurchasePages(query.data ?? [], now);
  return (
    <DashboardCardShell title="신청 가능한 구매" icon={ShoppingCart} accent="orange" description="학생에게 열려 있는 구매 신청입니다."
      onAction={() => navigate('/purchase-requests')} actionLabel="구매 신청 전체 보기" className="min-w-0">
      {query.isPending ? <DashboardCardSkeleton rows={2} /> : query.isError ? <QueryError retry={() => void query.refetch()} /> : pages.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">현재 학생에게 열린 구매 신청이 없습니다.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {pages.map((page) => (
            <li key={page.id}>
              <Link to={`/purchase-requests/${page.id}`} className="block rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:border-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                <p className="text-[11px] font-semibold text-amber-700">신청 가능</p>
                <p className="mt-1 break-words text-sm font-bold text-slate-800">{page.title}</p>
                {page.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{page.description}</p>}
                <p className="mt-2 text-xs text-slate-500">{new Date(page.period_end).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 마감</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCardShell>
  );
}

function IpsiCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['student-home', 'ipsi', user?.id], queryFn: () => readStudentIpsiHome(supabase), staleTime: 60_000 });
  return (
    <DashboardCardShell title="최근 입시 정보" icon={Newspaper} accent="blue" description="입시 정보의 최신 글과 영상 5개입니다."
      onAction={() => navigate('/ipsi')} actionLabel="입시 정보 전체 보기" className="min-w-0">
      {query.isPending ? <DashboardCardSkeleton rows={5} /> : query.isError ? <QueryError retry={() => void query.refetch()} /> : !query.data?.length ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">등록된 입시 정보가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {query.data.map((post) => (
            <li key={`${post.kind}-${post.id}`}>
              <a href={post.url || '/ipsi'} target={post.url ? '_blank' : undefined} rel={post.url ? 'noopener noreferrer' : undefined}
                className="flex items-start gap-3 rounded-lg px-1 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800">{post.title}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{post.kind === 'video' ? '영상' : '글'}{post.date && Number.isFinite(Date.parse(post.date)) && ` · ${new Date(post.date).toLocaleDateString('ko-KR')}`}</p>
                </div>
                {post.url && <><ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /><span className="sr-only">새 탭에서 원문 보기</span></>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </DashboardCardShell>
  );
}

export function StudentHomeResources() {
  const { user } = useAuth();
  const menu = useMenuVisibility();
  if (!user || menu.isLoading || menu.error) return null;
  const purchase = isPathVisible(menu.config, '/purchase-requests', { isAdmin: false, role: 'student' });
  const ipsi = isPathVisible(menu.config, '/ipsi', { isAdmin: false, role: 'student' });
  if (!purchase && !ipsi) return null;
  return <div className={`col-span-full grid min-w-0 grid-cols-1 gap-4 sm:gap-5 ${purchase && ipsi ? 'md:grid-cols-2' : ''}`}>{purchase && <PurchaseCard />}{ipsi && <IpsiCard />}</div>;
}
