import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Pin, X, Lock, Ban, Plus, RotateCcw } from 'lucide-react';
import type { ExamSubject, GradeInput, PinnedAssignment } from '../../types';

interface PinnedGridProps {
  grade: GradeInput;
  subjects: ExamSubject[];
  pinned: PinnedAssignment[];
  onPin: (entry: PinnedAssignment) => void;
  onUnpin: (subjectId: string) => void;
  onTogglePeriod: (dayIndex: number, period: number) => void;
}

const ALL_PERIODS = [1, 2, 3, 4, 5, 6, 7];

export function PinnedGrid({
  grade,
  subjects,
  pinned,
  onPin,
  onUnpin,
  onTogglePeriod,
}: PinnedGridProps) {
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);

  const subjectMap = useMemo(() => {
    const m = new Map<string, ExamSubject>();
    for (const s of subjects) m.set(s.id, s);
    return m;
  }, [subjects]);

  const pinBySubject = useMemo(() => {
    const m = new Map<string, PinnedAssignment>();
    for (const p of pinned) m.set(p.subjectId, p);
    return m;
  }, [pinned]);

  const pinByCell = useMemo(() => {
    const m = new Map<string, PinnedAssignment>();
    for (const p of pinned) m.set(`${p.dayIndex}|${p.period}`, p);
    return m;
  }, [pinned]);

  const usedPeriodsByDay = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const d of grade.days) m.set(d.dayIndex, new Set(d.availablePeriods));
    return m;
  }, [grade.days]);

  const handleSelect = (dayIndex: number, period: number, subjectId: string) => {
    onPin({ subjectId, dayIndex, period });
    setOpenCellKey(null);
  };

  const handleDeactivate = (dayIndex: number, period: number) => {
    onTogglePeriod(dayIndex, period);
    setOpenCellKey(null);
  };

  const handleActivate = (dayIndex: number, period: number) => {
    onTogglePeriod(dayIndex, period);
  };

  const handleUnpin = (subjectId: string) => {
    onUnpin(subjectId);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-center text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="w-12 px-1 py-1"></th>
              {grade.days.map((d) => (
                <th key={d.dayIndex} className="px-2 py-1 font-medium">
                  {d.dayIndex + 1}일차
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERIODS.map((p) => (
              <tr key={p} className="border-t">
                <th className="bg-muted/20 px-1 py-1 font-medium">{p}교시</th>
                {grade.days.map((d) => {
                  const cellKey = `${d.dayIndex}|${p}`;
                  const isActive = usedPeriodsByDay.get(d.dayIndex)?.has(p) ?? false;
                  const pinAt = pinByCell.get(cellKey);
                  const subject = pinAt ? subjectMap.get(pinAt.subjectId) : null;
                  const isOpen = openCellKey === cellKey;

                  // Inactive period — show "활성화" toggle
                  if (!isActive) {
                    return (
                      <td key={d.dayIndex} className="border-l bg-muted/30 p-0.5">
                        <button
                          type="button"
                          onClick={() => handleActivate(d.dayIndex, p)}
                          className="flex w-full items-center justify-center gap-1 rounded px-1.5 py-2 text-muted-foreground/60 hover:bg-emerald-50 hover:text-emerald-700"
                          title="이 교시를 사용함으로 변경"
                        >
                          <Lock className="h-3 w-3" />
                          <span className="text-[10px]">비활성</span>
                        </button>
                      </td>
                    );
                  }

                  // Pinned cell — chip + X
                  if (subject) {
                    return (
                      <td key={d.dayIndex} className="border-l px-1.5 py-2">
                        <div
                          className={cn(
                            'flex items-center justify-between gap-1 rounded px-1.5 py-1',
                            subject.isMajor
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800',
                          )}
                        >
                          <Pin className="h-3 w-3 flex-shrink-0" />
                          <span className="flex-1 truncate text-left text-[11px]">
                            {subject.name}
                          </span>
                          <button
                            type="button"
                            aria-label={`${subject.name} 고정 해제`}
                            onClick={() => handleUnpin(subject.id)}
                            className="rounded p-0.5 hover:bg-white/50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    );
                  }

                  // Active empty cell — Popover with two action groups
                  return (
                    <td key={d.dayIndex} className="border-l p-0.5">
                      <Popover
                        open={isOpen}
                        onOpenChange={(o) => setOpenCellKey(o ? cellKey : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex w-full items-center justify-center gap-1 rounded px-1.5 py-2 text-muted-foreground/60 transition-colors hover:bg-amber-50 hover:text-amber-700 hover:ring-1 hover:ring-amber-300"
                          >
                            <Plus className="h-3 w-3" />
                            <span className="text-[10px]">설정</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="center">
                          <Command>
                            <CommandInput placeholder="과목 검색..." />
                            <CommandList>
                              <CommandEmpty>일치하는 과목이 없습니다.</CommandEmpty>
                              <CommandGroup
                                heading={`${d.dayIndex + 1}일차 ${p}교시에 과목 고정`}
                              >
                                {subjects.map((sub) => {
                                  const existingPin = pinBySubject.get(sub.id);
                                  return (
                                    <CommandItem
                                      key={sub.id}
                                      value={`${sub.name} ${sub.id}`}
                                      onSelect={() => handleSelect(d.dayIndex, p, sub.id)}
                                    >
                                      <Pin className="mr-2 h-3 w-3" />
                                      <span className="flex-1 truncate">{sub.name}</span>
                                      {sub.isMajor && (
                                        <Badge className="ml-1 bg-rose-100 text-rose-700 hover:bg-rose-100">
                                          주요
                                        </Badge>
                                      )}
                                      {existingPin && (
                                        <span className="ml-1 text-[10px] text-muted-foreground">
                                          {existingPin.dayIndex + 1}일{existingPin.period}교시 →
                                        </span>
                                      )}
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                              <CommandSeparator />
                              <CommandGroup heading="이 교시 설정">
                                <CommandItem
                                  value={`__deactivate_${d.dayIndex}_${p}`}
                                  onSelect={() => handleDeactivate(d.dayIndex, p)}
                                >
                                  <Ban className="mr-2 h-3 w-3 text-rose-600" />
                                  <span className="flex-1">이 교시 사용 안 함 (비활성화)</span>
                                </CommandItem>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-rose-100" /> 주요교과
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-emerald-100" /> 일반과목
        </span>
        <span className="flex items-center gap-1">
          <Lock className="h-3 w-3" /> 비활성 교시 (클릭 → 활성화)
        </span>
        <span className="flex items-center gap-1">
          <Plus className="h-3 w-3" /> 빈 슬롯 (클릭 → 고정 또는 비활성화)
        </span>
      </div>
    </div>
  );
}
