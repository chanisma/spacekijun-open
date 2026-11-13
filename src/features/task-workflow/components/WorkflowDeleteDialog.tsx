import { useEffect, useState } from 'react';
import { CalendarDays, CalendarRange, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WorkflowFlowNode } from '../types';

interface WorkflowDeleteDialogProps {
  open: boolean;
  workNode: WorkflowFlowNode | null;
  includedNodes: WorkflowFlowNode[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (includedNodeIds: string[]) => void;
}

export function WorkflowDeleteDialog({
  open,
  workNode,
  includedNodes,
  onOpenChange,
  onConfirm,
}: WorkflowDeleteDialogProps) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelectedNodeIds(new Set());
  }, [workNode?.id, open]);

  const allSelected =
    includedNodes.length > 0 && selectedNodeIds.size === includedNodes.length;

  const toggleNode = (nodeId: string) => {
    setSelectedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedNodeIds(
      allSelected ? new Set() : new Set(includedNodes.map((node) => node.id))
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Work 노드를 삭제할까요?</DialogTitle>
          <DialogDescription>
            <strong className="font-semibold text-slate-700">{workNode?.data.label}</strong> 노드는
            삭제됩니다. 함께 제거할 포함 노드를 선택할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <label className="flex cursor-pointer items-center gap-2 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">
            <Checkbox
              checked={allSelected ? true : selectedNodeIds.size > 0 ? 'indeterminate' : false}
              onCheckedChange={toggleAll}
            />
            포함 노드 전체 선택
            <span className="ml-auto text-xs font-normal text-slate-400">
              {includedNodes.length}개
            </span>
          </label>

          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {includedNodes.map((node) => (
              <label
                key={node.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-white"
              >
                <Checkbox
                  checked={selectedNodeIds.has(node.id)}
                  onCheckedChange={() => toggleNode(node.id)}
                />
                {node.data.kind === 'event' ? (
                  <CalendarRange className="h-4 w-4 shrink-0 text-indigo-500" />
                ) : (
                  <CalendarDays className="h-4 w-4 shrink-0 text-sky-500" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {node.data.label}
                </span>
                <span className="text-[10px] font-semibold uppercase text-slate-400">
                  {node.data.kind}
                </span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs leading-5 text-slate-500">
          이 작업은 업무 흐름 캔버스에서만 노드를 제거합니다. 원본 Work와 Task는 삭제되지 않습니다.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(Array.from(selectedNodeIds))}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {selectedNodeIds.size > 0
              ? `선택한 ${selectedNodeIds.size}개와 삭제`
              : 'Work만 삭제'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
