import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';
import type { SeatStudent } from '../types';
import { cn } from '@/lib/utils';

interface StudentPickerProps {
  students: SeatStudent[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multi?: boolean;
  max?: number;
  placeholder?: string;
  className?: string;
}

export function StudentPicker({
  students,
  selectedIds,
  onChange,
  multi = true,
  max,
  placeholder = '이름 검색...',
  className,
}: StudentPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || String(s.number).includes(q)
    );
  }, [students, query]);

  const toggle = (rid: string) => {
    if (selectedIds.includes(rid)) {
      onChange(selectedIds.filter((id) => id !== rid));
    } else {
      if (!multi) {
        onChange([rid]);
        return;
      }
      if (max && selectedIds.length >= max) return;
      onChange([...selectedIds, rid]);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      <ScrollArea className="h-56 border rounded-md p-1">
        <div className="space-y-1">
          {filtered.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-6">학생 없음</div>
          )}
          {filtered.map((s) => {
            const checked = selectedIds.includes(s.resourceId);
            const disabled = !checked && !!max && selectedIds.length >= max;
            return (
              <label
                key={s.resourceId}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800',
                  disabled && 'opacity-40 cursor-not-allowed',
                  checked && 'bg-blue-50 dark:bg-blue-900/20'
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => !disabled && toggle(s.resourceId)}
                  disabled={disabled}
                />
                <span className="font-mono text-xs text-slate-500 w-7 text-right">
                  {s.number || '-'}
                </span>
                <span>{s.name}</span>
              </label>
            );
          })}
        </div>
      </ScrollArea>
      {multi && (
        <div className="text-[11px] text-slate-500">
          선택 {selectedIds.length}{max ? ` / ${max}` : ''}명
        </div>
      )}
    </div>
  );
}
