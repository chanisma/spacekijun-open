import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Stamp, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { useToast } from '@/hooks/use-toast';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { approvalSubject } from '../registry';
import { useCreateApproval } from '../hooks/useApprovals';
import type { ApprovalStepDraft } from '../types';

/**
 * 결재 신청 — 직위 칸(계·부장·교감·교장)마다 사람을 지정한다(2026-08-14 사용자 결정).
 *
 * 칸 이름을 자유 입력이 아니라 **문서 결재란의 칸**으로 고정하는 것이 요점 —
 * 서명이 어느 칸에 찍힐지가 신청 시점에 결정되고, 결재자도 자기가 어느 칸인지 안다.
 * 필요 없는 칸은 체크를 풀면 결재선에서 빠진다.
 */

interface ApprovalRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectType: string;
  subjectId: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  onRequested?: (requestId: string) => void;
  /**
   * 재상신 시 이전 결재선을 그대로 채워 넣는다(취소·반려 후 다시 올리는 경우).
   * 이전에 체크를 풀었던 칸은 다시 풀린 채로 복원된다.
   */
  initialSteps?: ApprovalStepDraft[];
}

interface RoleRow {
  role: string;
  enabled: boolean;
  resourceId?: string;
  name?: string;
}

export const ApprovalRequestDialog: React.FC<ApprovalRequestDialogProps> = ({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  title,
  summary,
  payload,
  onRequested,
  initialSteps,
}) => {
  const { toast } = useToast();
  const create = useCreateApproval();
  const definition = approvalSubject(subjectType);

  // 주의: SearchableSelect는 `filterByTeacher`일 때 **이름을 value로** 쓴다(레거시 호환).
  // 결재 행에는 안정적인 resource id도 남겨야 해서 같은 목록을 여기서 한 번 더 읽어 이름→id로 맞춘다.
  const { items } = useResourceSelect({ resourceType: ['teacher', 'staff'] });
  const resourceIdByName = React.useMemo(
    () => new Map(items.map((item) => [item.label, item.value])),
    [items],
  );

  const [rows, setRows] = React.useState<RoleRow[]>([]);

  // 열릴 때 한 번만 씨앗을 심는다. 매 렌더 재실행되면 initialSteps나 쿼리 재조회가
  // 입력 중인 결재선을 초기화해 버린다.
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    seeded.current = true;

    const roles = definition?.defaultRoles ?? ['결재'];
    const previous = initialSteps ?? [];

    if (previous.length === 0) {
      setRows(roles.map((role) => ({ role, enabled: true })));
      return;
    }

    const byRole = new Map(previous.map((step) => [step.role_label, step]));
    const base: RoleRow[] = roles.map((role) => {
      const step = byRole.get(role);
      // 이전에 쓰지 않은 칸은 체크를 푼 상태로 복원한다.
      if (!step) return { role, enabled: false };
      return {
        role,
        enabled: true,
        name: step.approver_name,
        resourceId: step.approver_resource_id ?? undefined,
      };
    });
    // 양식이 바뀌어 기본 칸에 없는 역할이 이전 결재선에 남아 있으면 뒤에 덧붙인다.
    const extra: RoleRow[] = previous
      .filter((step) => !roles.includes(step.role_label))
      .map((step) => ({
        role: step.role_label,
        enabled: true,
        name: step.approver_name,
        resourceId: step.approver_resource_id ?? undefined,
      }));

    setRows([...base, ...extra]);
  }, [open, definition, initialSteps]);

  const setRow = (index: number, patch: Partial<RoleRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const activeRows = rows.filter((r) => r.enabled);
  const ready = activeRows.length > 0 && activeRows.every((r) => !!r.name);

  const handleSubmit = async () => {
    if (!ready) return;
    try {
      const requestId = await create.mutateAsync({
        subjectType,
        subjectId,
        title,
        summary,
        payload,
        steps: activeRows.map((row) => ({
          role_label: row.role,
          approver_name: row.name!,
          approver_resource_id: row.resourceId ?? null,
        })),
      });
      toast({ title: '결재 상신 완료', description: `${activeRows[0].name} 선생님께 결재 요청이 전달됩니다.` });
      onOpenChange(false);
      onRequested?.(requestId);
    } catch (error) {
      toast({
        title: '결재 상신 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-2.5">
            <TitleIconChip icon={Stamp} tone="indigo" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left text-base">결재 상신</DialogTitle>
              <p className="mt-0.5 truncate text-left text-xs text-slate-500">{title}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <SectionLabel icon={Stamp}>결재선</SectionLabel>

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={row.role}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2',
                  row.enabled ? 'bg-white' : 'bg-slate-50 opacity-60',
                )}
              >
                <Checkbox
                  checked={row.enabled}
                  onCheckedChange={(checked) => setRow(index, { enabled: checked === true })}
                  aria-label={`${row.role} 칸 사용`}
                />
                <span className="w-12 shrink-0 text-sm font-medium text-slate-700">{row.role}</span>
                <div className="min-w-0 flex-1">
                  <SearchableSelect
                    filterByTeacher
                    disabled={!row.enabled}
                    selectedValue={row.name}
                    onValueChange={(value) =>
                      setRow(index, {
                        name: value,
                        resourceId: value ? resourceIdByName.get(value) : undefined,
                      })
                    }
                    placeholder="결재자 선택"
                    // container를 넘기지 않는다 — Dialog 안에서는 자동으로 DialogContent로 포털된다.
                    // body로 포털하면 드롭다운이 열리기만 하고 **클릭이 먹지 않는다**
                    // (Dialog와 Popover의 aria-hidden hideOthers()가 서로를 숨김. dialog.tsx 주석 참고)
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            위에서부터 순서대로 결재가 진행됩니다. 결재자가 승인하면 그 자리에서 받은 서명이
            문서의 같은 이름 칸에 그대로 표시됩니다. 필요 없는 칸은 체크를 해제하세요.
          </p>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <X className="h-3.5 w-3.5" />
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!ready || create.isPending} className="h-8 gap-1.5 px-3 text-xs">
            <Send className="h-3.5 w-3.5" />
            {create.isPending ? '상신 중...' : '결재 상신'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
