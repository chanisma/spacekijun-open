import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { AlertTriangle, Check, ChevronsUpDown, UserMinus, UserX, X } from 'lucide-react';
import type {
  SupervisionLedgerEntry,
  SupervisionTeacher,
  SupervisorTeacherRef,
} from '../../types';
import { MAX_SUPERVISIONS_PER_DAY } from '../../supervision/autoAssign';

export interface TeacherLoads {
  /** teacherId -> 이번 감독표 배정 횟수 */
  current: Map<string, number>;
  /** teacherId -> 누적(과거 확정 + 수동 보정) */
  past: Map<string, number>;
  /** `${teacherId}|${dayIndex}` -> 그 일차의 감독 횟수 (좌석 드롭다운 당일 표시용) */
  day?: Map<string, number>;
}

/** rooms에서 일차별 감독 횟수 맵 생성 (`${teacherId}|${dayIndex}` 키) */
export function buildDayLoadMap(
  rooms: { dayIndex: number; teachers: (SupervisorTeacherRef | null)[] }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rooms) {
    for (const t of r.teachers) {
      if (!t) continue;
      const k = `${t.id}|${r.dayIndex}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}

export function buildPastLoadMap(
  ledger: Map<string, SupervisionLedgerEntry> | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, e] of ledger ?? []) m.set(id, e.pastCount + e.adjustment);
  return m;
}

/**
 * 좌석 1개의 교사 선택기 (검색 가능).
 * - 과목 담당 교사(preferredIds)는 ★와 함께 상단 그룹으로
 * - 같은 교시에 이미 투입된 교사(busyIds)는 경고 표시 (선택은 가능 — 의도적 교체 허용)
 * - 각 교사에 (이번/누적) 부담 표시
 */
export function TeacherSeatSelect({
  value,
  teachers,
  loads,
  dayIndex,
  dayCap = MAX_SUPERVISIONS_PER_DAY,
  preferredIds,
  busyIds,
  highlight = false,
  onChange,
}: {
  value: SupervisorTeacherRef | null;
  teachers: SupervisionTeacher[];
  loads: TeacherLoads;
  /** 이 좌석의 일차 — 드롭다운에 교사별 당일 감독 횟수를 표시 */
  dayIndex: number;
  /** 이 일차의 일일 감독 상한 (당일 횟수 뱃지 색상 기준, 기본 2) */
  dayCap?: number;
  preferredIds?: Set<string>;
  busyIds?: Set<string>;
  /** 담임 고정 좌석 등 강조 표시 */
  highlight?: boolean;
  onChange: (next: SupervisorTeacherRef | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const { preferred, others } = useMemo(() => {
    const preferred: SupervisionTeacher[] = [];
    const others: SupervisionTeacher[] = [];
    for (const t of teachers) {
      if (preferredIds?.has(t.id)) preferred.push(t);
      else others.push(t);
    }
    return { preferred, others };
  }, [teachers, preferredIds]);

  const loadLabel = (id: string) =>
    `${loads.current.get(id) ?? 0}·${loads.past.get(id) ?? 0}`;
  const dayLoadOf = (id: string) => loads.day?.get(`${id}|${dayIndex}`) ?? 0;

  const isBusyOther = value !== null && busyIds?.has(value.id);

  const renderItem = (t: SupervisionTeacher, starred: boolean) => (
    <CommandItem
      key={t.id}
      value={`${t.name} ${t.id}`}
      onSelect={() => {
        onChange(value?.id === t.id ? null : { id: t.id, name: t.name });
        setOpen(false);
      }}
      className="flex items-center justify-between gap-2"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <Check
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0',
            value?.id === t.id ? 'opacity-100' : 'opacity-0',
          )}
        />
        <span className="truncate">
          {starred && <span className="text-amber-500 mr-0.5">★</span>}
          {t.name}
        </span>
        {busyIds?.has(t.id) && value?.id !== t.id && (
          <span className="text-[10px] text-rose-500 flex-shrink-0">교시중복</span>
        )}
      </span>
      <span
        className="flex items-center gap-1 flex-shrink-0"
        title={`이 일차 ${dayLoadOf(t.id)}회 · 이번 시험 ${loads.current.get(t.id) ?? 0}회 · 누적 ${loads.past.get(t.id) ?? 0}회`}
      >
        <span
          className={cn(
            'rounded px-1 py-0 text-[9px] font-medium tabular-nums leading-4',
            dayLoadOf(t.id) >= dayCap
              ? 'bg-rose-100 text-rose-700'
              : dayLoadOf(t.id) > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-500',
          )}
        >
          당일 {dayLoadOf(t.id)}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {loadLabel(t.id)}
        </span>
      </span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          className={cn(
            'h-7 w-full justify-between px-2 text-xs font-normal',
            highlight && 'border-amber-300 bg-amber-50',
            // 미배정 좌석은 점선 + 장미색으로 한눈에 띄게
            !value && 'border-dashed border-rose-300 bg-rose-50/70 font-medium text-rose-600',
            isBusyOther && 'border-rose-300 bg-rose-50 text-rose-700',
          )}
        >
          <span className="truncate">
            {value ? value.name : '미배정'}
          </span>
          <ChevronsUpDown className="h-3 w-3 flex-shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="교사 검색..." className="h-8 text-xs" />
          <CommandList className="max-h-56">
            <CommandEmpty>교사가 없습니다.</CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <UserX className="mr-1.5 h-3.5 w-3.5" /> 배정 해제
                </CommandItem>
              </CommandGroup>
            )}
            {preferred.length > 0 && (
              <CommandGroup heading="과목 담당">
                {preferred.map((t) => renderItem(t, true))}
              </CommandGroup>
            )}
            <CommandGroup heading={preferred.length > 0 ? '전체 교사' : undefined}>
              {others.map((t) => renderItem(t, false))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** 교사별 감독 부담 요약 표 (이번 + 누적 = 합계, 합계 내림차순) */
export function TeacherLoadSummary({
  teachers,
  loads,
}: {
  teachers: SupervisionTeacher[];
  loads: TeacherLoads;
}) {
  const rows = useMemo(() => {
    return teachers
      .map((t) => {
        const cur = loads.current.get(t.id) ?? 0;
        const past = loads.past.get(t.id) ?? 0;
        return { id: t.id, name: t.name, cur, past, total: cur + past };
      })
      .sort((a, b) => b.total - a.total || b.cur - a.cur || a.name.localeCompare(b.name, 'ko'));
  }, [teachers, loads]);

  const maxTotal = rows.length ? rows[0].total : 0;
  const minTotal = rows.length ? rows[rows.length - 1].total : 0;

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
        <span>교사별 감독 부담</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          편차 {maxTotal - minTotal}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto lg:max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60">
            <tr className="text-[10px] text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">교사</th>
              <th className="px-1 py-1 text-right font-medium">이번</th>
              <th className="px-1 py-1 text-right font-medium">누적</th>
              <th className="px-2 py-1 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-0.5">{r.name}</td>
                <td className="px-1 py-0.5 text-right tabular-nums">{r.cur}</td>
                <td className="px-1 py-0.5 text-right tabular-nums text-muted-foreground">
                  {r.past}
                </td>
                <td className="px-2 py-0.5 text-right tabular-nums font-medium">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 배정 전 제외 교사 선택 (출제·출장 등 이번 시험 한정 제외).
 * '학교관리자'·'고사운영교사' 태그의 고정 제외는 목록 자체에서 빠지므로
 * 여기에는 나타나지 않는다. 선택 결과는 plan.excludedTeacherIds로 저장된다.
 */
export function TeacherExcludePicker({
  teachers,
  excludedIds,
  onChange,
}: {
  teachers: SupervisionTeacher[];
  excludedIds: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const excluded = teachers.filter((t) => excludedIds.has(t.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 gap-1 text-xs',
              excluded.length > 0 && 'border-rose-200 bg-rose-50 text-rose-700',
            )}
          >
            <UserMinus className="h-3.5 w-3.5" />
            제외 교사
            {excluded.length > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0 text-[10px] font-semibold text-white tabular-nums">
                {excluded.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="교사 검색..." className="h-8 text-xs" />
            <CommandList className="max-h-56">
              <CommandEmpty>교사가 없습니다.</CommandEmpty>
              {excluded.length > 0 && (
                <CommandGroup>
                  <CommandItem
                    value="__clear_all__"
                    onSelect={() => onChange(new Set())}
                    className="text-muted-foreground"
                  >
                    <UserX className="mr-1.5 h-3.5 w-3.5" /> 전체 해제
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {teachers.map((t) => {
                  const isExcluded = excludedIds.has(t.id);
                  return (
                    <CommandItem
                      key={t.id}
                      value={`${t.name} ${t.id}`}
                      onSelect={() => {
                        const next = new Set(excludedIds);
                        if (isExcluded) next.delete(t.id);
                        else next.add(t.id);
                        onChange(next);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 flex-shrink-0',
                          isExcluded ? 'text-rose-600 opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className={cn(isExcluded && 'text-rose-700 line-through')}>
                        {t.name}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {excluded.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            const next = new Set(excludedIds);
            next.delete(t.id);
            onChange(next);
          }}
          className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-200"
          title="클릭하여 제외 해제"
        >
          {t.name}
          <X className="h-2.5 w-2.5" />
        </button>
      ))}
    </div>
  );
}

/** 자동 배정 경고 + 검증 이슈 목록 */
export function PlanIssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-1">
      {issues.map((msg, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          {msg}
        </div>
      ))}
    </div>
  );
}
