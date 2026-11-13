import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, Info, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Grade, GradeInput, ScheduleCandidate, SupervisionConfig } from '../../types';
import { CandidateGridPreview } from './CandidateGridPreview';
import { SOFT_CONSTRAINT_LABELS } from '../../constants';

export function CandidateCard({
  candidate,
  rank,
  grades,
  gradeInputs,
  supervision,
  selected,
  onSelect,
}: {
  candidate: ScheduleCandidate;
  rank: number;
  grades: Grade[];
  gradeInputs: Partial<Record<Grade, GradeInput>>;
  supervision: SupervisionConfig | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const feasible = candidate.metrics.hardFeasible;
  return (
    <Card
      className={cn(
        'transition-shadow',
        selected && 'ring-2 ring-amber-500 shadow-md',
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Badge
              className={cn(
                'rounded-full px-2 py-0',
                rank === 1 ? 'bg-amber-500 hover:bg-amber-500' : 'bg-muted hover:bg-muted',
              )}
            >
              {rank}위
            </Badge>
            <span>점수 {Number.isFinite(candidate.scoreBreakdown.total) ? candidate.scoreBreakdown.total.toFixed(1) : '∞'}</span>
            {feasible ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
          </CardTitle>
          {supervision?.enabled && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                candidate.metrics.peakSupervisorDemand > supervision.availableSupervisors
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600',
              )}
              title="가장 수요가 높은 교시의 감독 인원"
            >
              <Users className="h-3 w-3" />
              피크 {candidate.metrics.peakSupervisorDemand}/{supervision.availableSupervisors}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-2">
        <CandidateGridPreview
          grades={grades}
          gradeInputs={gradeInputs}
          assignments={candidate.assignments}
          supervision={supervision}
          compact
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">학생당 평균 시험: </span>
            <b>{candidate.metrics.avgExamsPerStudent.toFixed(1)}개</b>
          </div>
          <div>
            <span className="text-muted-foreground">하루 최대: </span>
            <b>{candidate.metrics.maxExamsPerStudentInOneDay}개</b>
          </div>
          <div>
            <span className="text-muted-foreground">일차별 부담 편차: </span>
            <b>{candidate.metrics.studentLoadStdev.toFixed(2)}</b>
          </div>
          <div>
            <span className="text-muted-foreground">주요교과 클러스터: </span>
            <b>{candidate.metrics.majorClusterCount}</b>
          </div>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            점수 분해 보기
          </summary>
          <TooltipProvider delayDuration={150}>
            <table className="mt-2 w-full">
              <tbody>
                {candidate.scoreBreakdown.soft
                  .filter((s) => s.weight !== 0 || s.count > 0)
                  .map((s) => {
                  const isBonus = s.penalty < 0;
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help underline-offset-2 hover:underline">
                              {SOFT_CONSTRAINT_LABELS[s.id] ?? s.id}
                              <Info className="h-3 w-3 opacity-60" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <div className="space-y-1 text-[11px]">
                              <div className="font-semibold">
                                {SOFT_CONSTRAINT_LABELS[s.id] ?? s.id}
                                {isBonus && (
                                  <span className="ml-2 rounded bg-emerald-100 px-1 py-0.5 text-emerald-700">
                                    보너스
                                  </span>
                                )}
                              </div>
                              {s.details && s.details.length > 0 ? (
                                <ul className="list-disc list-inside space-y-0.5">
                                  {s.details.map((d, i) => (
                                    <li key={i}>{d}</li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-muted-foreground">상세 케이스 없음</div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td
                        className={cn(
                          'py-1 text-right tabular-nums',
                          isBonus && 'text-emerald-700',
                        )}
                      >
                        {s.count} × {s.weight} = {s.penalty.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TooltipProvider>
        </details>
      </CardContent>
      <CardFooter>
        <Button
          variant={selected ? 'default' : 'outline'}
          size="sm"
          className="w-full"
          onClick={onSelect}
          disabled={!feasible}
        >
          {selected ? '선택됨' : '이 후보로 진행'}
        </Button>
      </CardFooter>
    </Card>
  );
}
