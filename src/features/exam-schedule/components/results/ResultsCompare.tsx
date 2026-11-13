import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { gradeInputsWithCandidateDays, gradesLabel } from '../../utils/multiGrade';
import { CandidateCard } from './CandidateCard';
import { ScoreRadarChart } from './ScoreRadarChart';
import { ArrowRight } from 'lucide-react';

export function ResultsCompare() {
  const { state, dispatch, setStep, buildInput } = useExamScheduleStore();
  const candidates = state.result?.candidates ?? [];
  const diagnostics = state.result?.diagnostics;
  const cspDiagnostics = diagnostics?.csp;
  const selectedSeeds = cspDiagnostics?.selectedSeeds ?? cspDiagnostics?.feasibleSeeds ?? 0;
  const uniqueSeeds = cspDiagnostics?.uniqueSeeds ?? cspDiagnostics?.feasibleSeeds ?? 0;
  const seedsAttempted = cspDiagnostics?.seedsAttempted ?? 0;
  const variantsExplored = cspDiagnostics?.variantsExplored ?? 0;
  const duplicateSeeds = cspDiagnostics?.duplicateSeeds ?? 0;

  const input = useMemo(() => buildInput(), [buildInput]);

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          생성된 후보가 없습니다. 입력값을 확인하고 다시 시도해 주세요.
          <div className="mt-3">
            <Button variant="outline" onClick={() => setStep('generate')}>
              생성 단계로 돌아가기
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const onSelect = (id: string) => {
    dispatch({ type: 'SELECT_CANDIDATE', candidateId: id });
  };

  const proceedToEdit = () => {
    if (state.selectedCandidateId) setStep('edit');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            TOP {candidates.length} 후보 비교
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({gradesLabel(input.grades)})
            </span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            점수가 낮을수록 좋은 시간표입니다. 축별 기준을 정규화한 비교 차트로 후보별 강점·약점을 확인하세요.
          </p>
        </CardHeader>
        <CardContent>
          <ScoreRadarChart candidates={candidates} input={input} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {candidates.map((c, idx) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            rank={idx + 1}
            grades={input.grades}
            gradeInputs={gradeInputsWithCandidateDays(input, c)}
            supervision={input.supervision.enabled ? input.supervision : null}
            selected={state.selectedCandidateId === c.id}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep('generate')}>
          다시 생성
        </Button>
        <Button
          disabled={!state.selectedCandidateId}
          onClick={proceedToEdit}
          className="gap-2"
        >
          최종 편집으로 진행 <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {diagnostics && (
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <div>처리 시간: {(diagnostics.elapsedMs / 1000).toFixed(2)}초</div>
          <div>
            CSP 시드: {selectedSeeds}개 선택 / {uniqueSeeds}개 유니크 /{' '}
            {seedsAttempted}회 시도
          </div>
          <div>
            시험 개수 조합: {variantsExplored}개 탐색
            {duplicateSeeds > 0
              ? ` (중복 seed ${duplicateSeeds}개 제외)`
              : ''}
          </div>
          <div>
            SA 반복: {diagnostics.sa.iterations}회 (수락 {diagnostics.sa.acceptedMoves}회)
          </div>
        </div>
      )}
    </div>
  );
}
