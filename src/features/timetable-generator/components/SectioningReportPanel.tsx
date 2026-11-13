import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Lesson, Placement, SectioningDiagnostics } from '../types';
import { buildSectioningDiagnosticsFromPlacements } from '../utils/sectioningReport';

interface SectioningReportPanelProps {
  originalLessons: Lesson[];
  currentLessons: Lesson[];
  placements: Placement[];
  diagnostics?: SectioningDiagnostics | null;
  defaultOpen?: boolean;
}

function offeringLabel(row: { subjectName: string; classLabel: string | null }): string {
  return row.classLabel ? `${row.subjectName} ${row.classLabel}` : row.subjectName;
}

export function SectioningReportPanel({
  originalLessons,
  currentLessons,
  placements,
  diagnostics,
  defaultOpen = false,
}: SectioningReportPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const report = useMemo(() => {
    if (diagnostics) return diagnostics;
    return buildSectioningDiagnosticsFromPlacements(originalLessons, currentLessons, placements);
  }, [diagnostics, originalLessons, currentLessons, placements]);

  const hasElective = originalLessons.some((l) => l.isElective);
  if (!hasElective) {
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        선택과목이 없어 학생 재분반(sectioning)을 수행하지 않았습니다.
      </div>
    );
  }

  const activeAttempts = report.attempts.filter((a) => a.rounds.length > 0 || a.applied);
  const final = report.final;
  const changedRows = final?.rosterChanges.filter((r) => r.beforeCount !== r.afterCount) ?? [];
  const badge =
    (final?.conflictedStudents ?? 0) > 0
      ? { text: `미해결 충돌 ${final!.conflictedStudents}명`, className: 'bg-red-100 text-red-800 border-red-200' }
      : (final?.changedOfferings ?? 0) > 0
        ? { text: `분반 ${final!.changedOfferings}개 조정`, className: 'bg-blue-100 text-blue-800 border-blue-200' }
        : { text: '명단 변화 없음', className: 'bg-muted text-muted-foreground border-border' };

  return (
    <div className="rounded-md border bg-card text-xs">
      <button
        type="button"
        className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 rounded-t-md"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">선택과목 sectioning</span>
        <span className={`px-2 py-0.5 rounded border text-[10px] ${badge.className}`}>{badge.text}</span>
        <span className="text-muted-foreground text-[10px] w-full">
          {open ? '접기 ▲' : '펼치기 ▼ — 재분반 라운드·분반별 명단 변화'}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t pt-2">
          {activeAttempts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              라운드별 상세 기록이 없습니다. 아래에서 원본과 최종 분반 명단의 인원을 비교할 수 있습니다.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-medium">솔브 중 재분반 라운드</p>
              {activeAttempts.map((att) => (
                <div key={att.label} className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{att.label}</p>
                  {att.rounds.length === 0 ? (
                    <p className="text-[11px] pl-2 text-muted-foreground">— 라운드 없음 (개선 여지 없어 중단)</p>
                  ) : (
                    <div className="overflow-x-auto rounded border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-[10px]">라운드</TableHead>
                            <TableHead className="h-8 text-[10px]">재분반 전</TableHead>
                            <TableHead className="h-8 text-[10px]">재솔브 후</TableHead>
                            <TableHead className="h-8 text-[10px]">수용</TableHead>
                            <TableHead className="h-8 text-[10px]">충돌학생</TableHead>
                            <TableHead className="h-8 text-[10px]">대상</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {att.rounds.map((r) => (
                            <TableRow key={`${att.label}-${r.round}`}>
                              <TableCell className="py-1 text-[11px]">{r.round}</TableCell>
                              <TableCell className="py-1 text-[11px]">t0={r.beforeT0} · t1={r.beforeT1}</TableCell>
                              <TableCell className="py-1 text-[11px]">t0={r.afterT0} · t1={r.afterT1}</TableCell>
                              <TableCell className={`py-1 text-[11px] ${r.accepted ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                                {r.accepted ? '채택' : '거부'}
                              </TableCell>
                              <TableCell className={`py-1 text-[11px] ${r.conflictedStudents > 0 ? 'text-red-600' : ''}`}>
                                {r.conflictedStudents}명
                                {r.studentConflicts > 0 ? ` (${r.studentConflicts}쌍)` : ''}
                              </TableCell>
                              <TableCell className="py-1 text-[11px] text-muted-foreground">
                                {r.electiveSubjects}과목 · {r.electiveOfferings}분반 · {r.studentsAssigned}명
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {final && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium">최종 후보 기준 결과</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                재분반 후 잔여 학생 충돌{' '}
                <b className={final.conflictedStudents > 0 ? 'text-red-600' : 'text-emerald-700'}>
                  {final.conflictedStudents}명
                </b>
                {final.studentConflicts > 0 ? ` (${final.studentConflicts}쌍)` : ''}
                {' · '}정원 초과 분반 <b>{final.capacityOverflow}</b>
                {' · '}명단 변경 분반 <b>{final.changedOfferings}</b>
                {final.studentsMoved > 0 ? ` · 이동 학생 약 ${final.studentsMoved}명` : ''}
              </p>
              {changedRows.length > 0 ? (
                <div className="overflow-x-auto rounded border max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent sticky top-0 bg-card">
                        <TableHead className="h-8 text-[10px]">과목·분반</TableHead>
                        <TableHead className="h-8 text-[10px] text-right">변경 전</TableHead>
                        <TableHead className="h-8 text-[10px] text-right">변경 후</TableHead>
                        <TableHead className="h-8 text-[10px] text-right">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changedRows.map((r) => (
                        <TableRow key={r.offeringId}>
                          <TableCell className="py-1 text-[11px]">{offeringLabel(r)}</TableCell>
                          <TableCell className="py-1 text-[11px] text-right">{r.beforeCount}</TableCell>
                          <TableCell className="py-1 text-[11px] text-right">{r.afterCount}</TableCell>
                          <TableCell className={`py-1 text-[11px] text-right font-medium ${r.afterCount - r.beforeCount > 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                            {r.afterCount - r.beforeCount > 0 ? '+' : ''}{r.afterCount - r.beforeCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">분반별 수강 인원 변화 없음 (초기 명단과 동일).</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
