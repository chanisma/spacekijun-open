import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X, Pin, ArrowLeftRight, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConstraintDialog } from './ConstraintDialog';
import type { Constraint, SeatStudent } from '../types';

interface ConstraintsPanelProps {
  constraints: Constraint[];
  students: SeatStudent[];
  availableSeats: string[];
  onAdd: (input: Omit<Constraint, 'id'>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function ConstraintsPanel({
  constraints,
  students,
  availableSeats,
  onAdd,
  onRemove,
  onClear,
}: ConstraintsPanelProps) {
  const [open, setOpen] = useState(false);

  const nameOf = (rid: string) => {
    const s = students.find((x) => x.resourceId === rid);
    return s ? `${s.name}${s.number ? `(${s.number})` : ''}` : '(이름 미상)';
  };

  const renderConstraint = (c: Constraint) => {
    const Icon =
      c.kind === 'fixed' ? Pin : c.kind === 'apart' ? ArrowLeftRight : Users;
    const color =
      c.kind === 'fixed'
        ? 'text-purple-600 bg-purple-50'
        : c.kind === 'apart'
          ? 'text-rose-600 bg-rose-50'
          : 'text-emerald-600 bg-emerald-50';
    let label = '';
    if (c.kind === 'fixed') {
      label = `${nameOf(c.resourceId)} → 좌석 ${c.seat}`;
    } else if (c.kind === 'apart') {
      label = `${c.resourceIds.map(nameOf).join(' ↔ ')} (≥${c.minDistance})`;
    } else {
      label = `함께: ${c.resourceIds.map(nameOf).join(', ')}`;
    }
    return (
      <li
        key={c.id}
        className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700"
      >
        <span className={`w-7 h-7 rounded-md flex items-center justify-center ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-xs">{label}</span>
        <button
          type="button"
          onClick={() => onRemove(c.id)}
          className="text-slate-400 hover:text-rose-500"
          aria-label="제약 삭제"
        >
          <X className="h-4 w-4" />
        </button>
      </li>
    );
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">제약 ({constraints.length})</div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={constraints.length === 0}
            className="text-xs h-8"
          >
            모두 삭제
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} className="h-8" disabled={students.length === 0}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            추가
          </Button>
        </div>
      </div>

      {constraints.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          제약 없음. 학생들이 무작위로 배치됩니다.
        </p>
      ) : (
        <ScrollArea className="max-h-56">
          <ul className="space-y-1.5">{constraints.map(renderConstraint)}</ul>
        </ScrollArea>
      )}

      <ConstraintDialog
        open={open}
        onOpenChange={setOpen}
        students={students}
        availableSeats={availableSeats}
        onAdd={onAdd}
      />
    </Card>
  );
}
