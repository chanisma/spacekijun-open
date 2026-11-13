// 사업 담당자 (2026-11-10) — owner 가 공동 담당(editor)을 더하고 뺀다. 공동 담당은 스스로 빠질 수 있다.
import { useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { addMembers, removeMember, resourceIdsByNames } from '../services/budgetService';
import { useBudgetMutation } from '../hooks/useBudget';
import type { BudgetProjectDetail } from '../types';

export function MembersDialog({ open, onOpenChange, detail }: {
  open: boolean; onOpenChange: (o: boolean) => void; detail: BudgetProjectDetail;
}) {
  const [names, setNames] = useState<string[]>([]);
  const isOwner = detail.myRole === 'owner';
  const add = useBudgetMutation(async () => {
    const map = await resourceIdsByNames(names);
    const missing = names.filter((n) => !map.has(n));
    if (missing.length) throw new Error(`교직원 명단에서 찾지 못했습니다: ${missing.join(', ')}`);
    await addMembers(detail.project.id, [...map.values()]);
  }, { success: () => '공동 담당을 더했습니다' });
  const remove = useBudgetMutation((resourceId: string) => removeMember(detail.project.id, resourceId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <TitleIconChip icon={Users} />
            <DialogTitle className="text-base">담당자</DialogTitle>
          </div>
          <DialogDescription className="pt-1 text-xs">담당자와 공동 담당은 이 사업을 보고 고칩니다. 관리자는 읽기만 합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <ul className="space-y-1">
            {detail.members.map((m) => (
              <li key={m.resource_id} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-100 px-3">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{m.name ?? '이름 없음'}</span>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{m.role === 'owner' ? '담당' : '공동 담당'}</Badge>
                {isOwner && m.role === 'editor' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-600" aria-label={`${m.name} 빼기`} onClick={() => remove.mutate(m.resource_id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="space-y-2">
              <SearchableMultiSelect
                filterByTeacher
                selectedValues={names}
                onSelectionChange={setNames}
                placeholder="공동 담당할 교직원"
                searchPlaceholder="이름 또는 초성으로 검색..."
              />
              <Button
                size="sm"
                className="h-9 w-full gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
                disabled={!names.length || add.isPending}
                onClick={() => add.mutate(undefined, { onSuccess: () => setNames([]) })}
              >
                {add.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}공동 담당 더하기
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
