import { ArrowRight, Lightbulb } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathVisible } from '@/lib/menuVisibility';
import { DashboardCardShell, DashboardCardSkeleton } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { useActivityProposals } from '../hooks/useActivityProposals';
import type { ActivityProposalRow } from '../types';
import { proposalBoardUrl, proposalStatusLabels, summarizeHomeProposals } from '../utils/proposalHome';

function ProposalList({ rows, empty, showReview = false }: {
  rows: ActivityProposalRow[];
  empty: string;
  showReview?: boolean;
}) {
  if (!rows.length) return <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.slice(0, 3).map(proposal => (
        <li key={proposal.id}>
          <Link to={proposalBoardUrl(proposal.id)}
            className="flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="text-violet-700">{proposalStatusLabels[proposal.status]}</span>
                <span className="text-slate-500">관심 {proposal.interest_count}명</span>
                {proposal.my_interest && <span className="text-rose-600">내가 관심 표시함</span>}
                {proposal.resulting_activity_id && <span className="text-emerald-700">활동 개설됨</span>}
              </div>
              <p className="line-clamp-2 break-words text-sm font-semibold text-slate-800">{proposal.title}</p>
              {showReview && proposal.review_note ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">선생님 의견 · {proposal.review_note}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{proposal.proposer_name || (proposal.is_student ? '학생' : '선생님')} 제안</p>
              )}
            </div>
            <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProposalHomeContent({ studentCode, isStudent, className }: {
  studentCode: string | null;
  isStudent: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const query = useActivityProposals(studentCode, 60_000);
  const { pending, mine, discover } = summarizeHomeProposals(query.data ?? [], studentCode);
  return (
    <DashboardCardShell title="창의적 체험활동 제안" icon={Lightbulb} accent="violet"
      description={isStudent ? '내 제안의 진행 상황을 확인하고, 함께 하고 싶은 활동을 찾아보세요.' : '함께 해보고 싶은 활동 제안입니다. 접수된 제안부터 검토해 주세요.'}
      className={className} onAction={() => navigate(proposalBoardUrl())} actionLabel="창의적 체험활동 제안함 전체 보기">
      {query.isPending ? <DashboardCardSkeleton rows={3} /> : query.isError ? (
        <div role="status" className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
          제안을 불러오지 못했습니다.
          <button type="button" onClick={() => void query.refetch()}
            className="ml-2 rounded font-semibold text-violet-700 underline focus-visible:ring-2 focus-visible:ring-violet-600">다시 시도</button>
        </div>
      ) : isStudent ? (
        <div className="grid gap-5 md:grid-cols-2">
          <section aria-label="내 활동 제안">
            <h3 className="mb-2 text-sm font-bold text-slate-700">내 제안 <span className="text-violet-600">{mine.length}</span></h3>
            <ProposalList rows={mine} empty="아직 내 제안이 없습니다. 제안함에서 해보고 싶은 활동을 제안해 보세요." showReview />
          </section>
          <section aria-label="함께 하고 싶은 활동 제안">
            <h3 className="mb-2 text-sm font-bold text-slate-700">함께 하고 싶은 제안 <span className="text-violet-600">{discover.length}</span></h3>
            <ProposalList rows={discover} empty="현재 관심을 표시할 새 제안이 없습니다." />
          </section>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">접수 {pending.filter(p => p.status === 'submitted').length}건 · 검토 중 {pending.filter(p => p.status === 'reviewing').length}건</p>
          <ProposalList rows={pending} empty="현재 검토를 기다리는 제안이 없습니다." />
        </div>
      )}
      {!query.isPending && !query.isError && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {isStudent ? '내 제안은 최근 변경 순, 함께 할 제안은 관심 표시한 순으로 각각 최대 3건을 보여 드려요.' : '접수 상태를 먼저, 같은 상태에서는 오래된 제안부터 최대 3건을 보여 드립니다.'}
        </p>
      )}
    </DashboardCardShell>
  );
}

export function ActivityProposalHomeCard({ className }: { className?: string }) {
  const { user, profile, effectiveRole, isStudentView, isAdminUI, viewAsStudentId } = useAuth();
  const menu = useMenuVisibility();
  if (!user || !profile || menu.isLoading || menu.error
    || !isPathVisible(menu.config, '/activities', { isAdmin: isAdminUI, role: effectiveRole })) return null;
  if (!['student', 'teacher', 'admin'].includes(effectiveRole)) return null;
  // 학생을 지정하지 않은 관리자 미리보기에서 관리자 자신의 제안을 보여 주지 않는다.
  const studentCode = isStudentView
    ? profile.role === 'admin' ? viewAsStudentId : user.email?.split('@')[0]
    : null;
  if (isStudentView && !studentCode) return null;
  return <ProposalHomeContent key={`${user.id}:${studentCode ?? 'teacher'}`}
    studentCode={studentCode || null} isStudent={isStudentView} className={className} />;
}
