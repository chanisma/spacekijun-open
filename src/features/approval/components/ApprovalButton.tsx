import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubjectApprovals } from '../hooks/useApprovals';
import { ApprovalRequestDialog } from './ApprovalRequestDialog';
import { ApprovalActDialog } from './ApprovalActDialog';
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, type ApprovalRequest } from '../types';

/**
 * 결재 부착 지점 — 아무 기능의 화면에나 이 버튼 하나만 놓으면 결재가 붙는다.
 *
 * 진행 중이거나 끝난 결재가 있으면 상세를 열고, 없으면 상신 모달을 연다.
 * 결재 상태(진행 중/완료/반려)는 버튼 자체가 배지로 보여준다.
 */

interface ApprovalButtonProps {
  subjectType: string;
  subjectId: string;
  /** 상신 시 저장할 제목 — 목록·알림에 쓰인다 */
  title: string;
  summary?: string;
  /** 결재 시점 스냅샷(결재 화면 미리보기·문서 재생성용) */
  payload?: Record<string, unknown>;
  className?: string;
  size?: 'sm' | 'default';
  /** 결재가 바뀔 때(상신·승인·반려) 호출 — 호출부가 문서를 다시 그릴 수 있다 */
  onChanged?: () => void;
  disabled?: boolean;
}

export const ApprovalButton: React.FC<ApprovalButtonProps> = ({
  subjectType,
  subjectId,
  title,
  summary,
  payload,
  className,
  size = 'sm',
  onChanged,
  disabled,
}) => {
  const { data: approvals = [], isLoading } = useSubjectApprovals(subjectType, subjectId);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  /** 상세에서 '다시 상신'으로 들어온 경우 — 이전 결재선을 씨앗으로 쓴다 */
  const [resubmitting, setResubmitting] = React.useState(false);

  // 진행 중인 것이 있으면 그것, 아니면 가장 최근 것(완료/반려 이력 확인용)
  const active: ApprovalRequest | null =
    approvals.find((r) => r.status === 'pending') ?? approvals[0] ?? null;

  const handleClick = () => {
    if (active) {
      setDetailOpen(true);
    } else {
      setResubmitting(false);
      setRequestOpen(true);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={cn('gap-1.5', className)}
      >
        <Stamp className="h-3.5 w-3.5" />
        {active ? '결재 현황' : '결재 상신'}
        {active && (
          <Badge variant="outline" className={cn('ml-0.5 text-[10px]', APPROVAL_STATUS_TONE[active.status])}>
            {APPROVAL_STATUS_LABEL[active.status]}
          </Badge>
        )}
      </Button>

      <ApprovalRequestDialog
        open={requestOpen}
        onOpenChange={(open) => {
          setRequestOpen(open);
          if (!open) setResubmitting(false);
        }}
        subjectType={subjectType}
        subjectId={subjectId}
        title={title}
        summary={summary}
        payload={payload}
        // 재상신이면 이전 결재선을 그대로 채워 준다(보통 같은 사람들에게 다시 올린다)
        initialSteps={resubmitting ? active?.steps : undefined}
        onRequested={() => {
          // 상신이 끝나야 상세를 닫는다 — 취소하고 돌아오면 이력이 그대로 보인다
          setDetailOpen(false);
          setResubmitting(false);
          onChanged?.();
        }}
      />

      {active && (
        <ApprovalActDialog
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) onChanged?.();
          }}
          request={active}
          // 상세를 열어 둔 채 위에 쌓는다. 두 모달을 같은 틱에 닫고 열면
          // Radix가 body의 pointer-events를 되돌리지 못하는 경우가 있다.
          onResubmit={() => {
            setResubmitting(true);
            setRequestOpen(true);
          }}
        />
      )}
    </>
  );
};
