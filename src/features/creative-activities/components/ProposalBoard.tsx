// ========================================
// 제안함 (Phase 3)
//
// 소통 루프 C가 보이는 자리다. 제안은 **공개**라 다른 학생이 관심을 표시할 수 있고,
// 그 개수가 곧 개설 판단의 근거이자 정원 산정의 근거가 된다.
//
// 관심은 **개수만** 보여 준다 — 누가 눌렀는지는 교사만 알면 되고,
// 학생 명단을 화면에 늘어놓을 이유가 없다(RLS도 같은 경계를 지킨다).
//
// 검토는 **교사 전체**가 한다. 창체담당자로 좁히면 아무도 안 봐서 루프가 죽는다.
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  GitBranch,
  Heart,
  Lightbulb,
  Loader2,
  PauseCircle,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useDeleteProposal,
  useReviewProposal,
  useToggleInterest,
} from '../hooks/useActivityProposals';
import { getAreaGroup, getAreaGroupLabel, getAreaGroupTone } from '../utils/activityLabels';
import type { ActivityProposalRow, ProposalStatus } from '../types';

const STATUS_META: Record<ProposalStatus, { label: string; className: string }> = {
  submitted: { label: '접수', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  reviewing: { label: '검토 중', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  accepted: { label: '수락', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  declined: { label: '보류', className: 'border-rose-200 bg-rose-50 text-rose-700' },
};

interface ProposalBoardProps {
  proposals: ActivityProposalRow[];
  highlightedProposalId?: string | null;
  isLoading: boolean;
  /** 학생이면 학생코드 */
  myStudentCode: string | null;
  /** 현재 사용자 profiles.id */
  myProfileId: string | null;
  /** 교사·admin — 검토·개설 가능 */
  canReview: boolean;
  /** 창체담당자·admin — 남의 제안도 삭제 가능 */
  isManager: boolean;
  onCreate: () => void;
  /** 제안을 활동으로 개설 — 폼을 제안 내용으로 씨앗 채워 연다 */
  onOpenAsActivity: (proposal: ActivityProposalRow) => void;
}

export function ProposalBoard({
  proposals,
  highlightedProposalId,
  isLoading,
  myStudentCode,
  myProfileId,
  canReview,
  isManager,
  onCreate,
  onOpenAsActivity,
}: ProposalBoardProps) {
  const [filter, setFilter] = useState<ProposalStatus | 'all'>('all');
  const review = useReviewProposal();
  const remove = useDeleteProposal();
  const toggleInterest = useToggleInterest();

  const counts = useMemo(() => {
    const m = new Map<ProposalStatus, number>();
    for (const p of proposals) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [proposals]);

  const listed = useMemo(
    () => (filter === 'all' ? proposals : proposals.filter((p) => p.status === filter)),
    [proposals, filter]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 상태 필터 + 제안 버튼 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip active={filter === 'all'} onClick={() => setFilter('all')} label="전체" count={proposals.length} />
        {(['submitted', 'reviewing', 'accepted', 'declined'] as const).map((s) => (
          <StatusChip
            key={s}
            active={filter === s}
            onClick={() => setFilter(filter === s ? 'all' : s)}
            label={STATUS_META[s].label}
            count={counts.get(s) ?? 0}
          />
        ))}
        <Button
          size="sm"
          className="ml-auto h-7 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" />
          제안하기
        </Button>
      </div>

      {listed.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-16 text-center">
          <Lightbulb className="h-7 w-7 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {filter === 'all' ? '아직 제안이 없습니다' : '이 상태의 제안이 없습니다'}
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-400">
            해보고 싶은 활동이나, 이어가고 싶은 활동을 제안해 보세요.
            다른 학생이 관심을 표시하면 개설 판단의 근거가 됩니다.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {listed.map((p) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              highlighted={p.id === highlightedProposalId}
              myStudentCode={myStudentCode}
              canDelete={
                isManager ||
                (!!myProfileId && p.proposer_profile_id === myProfileId && p.status === 'submitted')
              }
              canReview={canReview}
              onReview={(status) => review.mutate({ id: p.id, status })}
              onDelete={() => {
                if (window.confirm('이 제안을 삭제할까요?')) remove.mutate(p.id);
              }}
              onOpenAsActivity={() => onOpenAsActivity(p)}
              onToggleInterest={() =>
                myStudentCode &&
                toggleInterest.mutate({
                  subjectType: 'proposal',
                  subjectId: p.id,
                  studentCode: myStudentCode,
                  on: !p.my_interest,
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------

function ProposalRow({
  proposal,
  highlighted = false,
  myStudentCode,
  canDelete,
  canReview,
  onReview,
  onDelete,
  onOpenAsActivity,
  onToggleInterest,
}: {
  proposal: ActivityProposalRow;
  highlighted?: boolean;
  myStudentCode: string | null;
  canDelete: boolean;
  canReview: boolean;
  onReview: (status: ProposalStatus) => void;
  onDelete: () => void;
  onOpenAsActivity: () => void;
  onToggleInterest: () => void;
}) {
  const group = getAreaGroup(proposal.area);
  const tone = getAreaGroupTone(group);
  const status = STATUS_META[proposal.status];
  const isStudent = !!myStudentCode;
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.scrollIntoView({ block: 'center' });
    rowRef.current?.focus({ preventScroll: true });
  }, [highlighted]);

  return (
    <li ref={rowRef} tabIndex={highlighted ? -1 : undefined}
      className={cn('px-3 py-3', highlighted && 'bg-violet-50 ring-2 ring-inset ring-violet-300')}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {proposal.area && (
          <Badge variant="outline" className={cn('h-[18px] px-1.5 text-[10px]', tone.chip)}>
            {getAreaGroupLabel(group)}
          </Badge>
        )}
        <Badge variant="outline" className={cn('h-[18px] px-1.5 text-[10px]', status.className)}>
          {status.label}
        </Badge>
        {proposal.parent_activity_name && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded border border-fuchsia-200 bg-fuchsia-50 px-1 py-px text-[10px] font-medium text-fuchsia-700"
            title={`${proposal.parent_activity_name} 이어가기`}
          >
            <GitBranch className="h-2.5 w-2.5" />
            이어가기
          </span>
        )}
        <span className="min-w-0 truncate text-[14.5px] font-semibold text-slate-900">
          {proposal.title}
        </span>
      </div>

      <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-600">
        {proposal.body}
      </p>

      {proposal.review_note && (
        <p className="mt-1.5 rounded border-l-2 border-slate-300 bg-slate-50 px-2 py-1 text-[12px] text-slate-600">
          <span className="font-medium text-slate-500">선생님 </span>
          {proposal.review_note}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-slate-400">
        <span>
          {proposal.proposer_name ?? '(작성자 없음)'}
          {proposal.is_student && <span className="ml-1 text-slate-300">학생</span>}
        </span>
        {proposal.target_year && <span className="tabular-nums">{proposal.target_year}학년도 희망</span>}
        {proposal.career_fields.length > 0 && (
          <span className="min-w-0 truncate">{proposal.career_fields.join(' · ')}</span>
        )}

        {/* 관심 — 개수만. 누가 눌렀는지는 교사만 알면 된다 */}
        <button
          type="button"
          onClick={onToggleInterest}
          disabled={!isStudent}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition',
            proposal.my_interest
              ? 'border-rose-200 bg-rose-50 text-rose-600'
              : 'border-slate-200 text-slate-400',
            isStudent ? 'hover:border-rose-200 hover:text-rose-600' : 'cursor-default'
          )}
          title={isStudent ? '관심 표시' : '학생이 관심을 표시합니다'}
        >
          <Heart className={cn('h-3 w-3', proposal.my_interest && 'fill-current')} />
          <span className="tabular-nums">{proposal.interest_count}</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {canReview && proposal.status !== 'accepted' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-slate-500 hover:text-blue-700"
                onClick={() => onReview('reviewing')}
              >
                검토 중
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-slate-500 hover:text-rose-700"
                onClick={() => onReview('declined')}
              >
                <PauseCircle className="h-3 w-3" />
                보류
              </Button>
            </>
          )}
          {canReview && (
            <Button
              size="sm"
              className="h-6 gap-1 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-700"
              onClick={onOpenAsActivity}
              title="이 제안으로 활동을 만듭니다"
            >
              {proposal.resulting_activity_id ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  개설됨
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  활동으로 개설
                </>
              )}
            </Button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-slate-300 transition hover:text-rose-600"
              aria-label="제안 삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
        active
          ? 'border-slate-300 bg-slate-100 text-slate-700'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
      )}
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}
