import React, { useState, useMemo } from 'react';
import { Printer, CheckSquare, Loader2, Square } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Student } from '../../types';
import { PRINT_REGISTRY, type PrintableItem } from './printRegistry';
import { openPrintWindow } from './printPreviewWindow';

interface PrintSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student;
}

const PrintSelectDialog: React.FC<PrintSelectDialogProps> = ({ open, onOpenChange, student }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  const registry = PRINT_REGISTRY;

  // Group items by tab
  const groupedItems = useMemo(() => {
    const groups: { tabLabel: string; items: (PrintableItem & { available: boolean })[] }[] = [];
    const tabMap = new Map<string, (PrintableItem & { available: boolean })[]>();

    for (const item of registry) {
      const available = item.hasData(student);
      if (!tabMap.has(item.tabLabel)) {
        tabMap.set(item.tabLabel, []);
      }
      tabMap.get(item.tabLabel)!.push({ ...item, available });
    }

    for (const [tabLabel, items] of tabMap) {
      groups.push({ tabLabel, items });
    }
    return groups;
  }, [registry, student]);

  const availableIds = useMemo(() =>
    registry.filter(item => item.hasData(student)).map(item => item.id),
    [registry, student]
  );

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(availableIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handlePrint = async () => {
    setIsPreparingPrint(true);
    try {
      const opened = await openPrintWindow(student, Array.from(selectedIds));
      if (opened) onOpenChange(false);
    } finally {
      setIsPreparingPrint(false);
    }
  };

  const selectedCount = selectedIds.size;
  const allSelected = availableIds.length > 0 && availableIds.every(id => selectedIds.has(id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer size={18} className="text-brand-600" />
            인쇄할 항목 선택
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {/* Select all toggle */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
            <span className="text-xs text-slate-400">{selectedCount}개 선택</span>
          </div>

          {/* Item groups */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {groupedItems.map(group => (
              <div key={group.tabLabel}>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  {group.tabLabel}
                </div>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const isSelected = selectedIds.has(item.id);
                    const isDisabled = !item.available;

                    return (
                      <button
                        key={item.id}
                        onClick={() => !isDisabled && toggle(item.id)}
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm ${
                          isDisabled
                            ? 'opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'bg-brand-50 border border-brand-200'
                              : 'hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-brand-600 shrink-0" />
                        ) : (
                          <Square size={16} className="text-slate-300 shrink-0" />
                        )}
                        <span className={`font-medium ${isSelected ? 'text-brand-700' : 'text-slate-700'}`}>
                          {item.label}
                        </span>
                        {isDisabled && (
                          <span className="text-[10px] text-slate-400 ml-auto">데이터 없음</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPreparingPrint}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={selectedCount === 0 || isPreparingPrint}
            onClick={handlePrint}
            className="gap-1.5"
          >
            {isPreparingPrint ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {isPreparingPrint ? '준비 중' : `인쇄 (${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintSelectDialog;
