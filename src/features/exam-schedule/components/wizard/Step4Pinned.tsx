import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import type {
  AlgorithmWeights,
  HardConstraintOptions,
  MajorSpreadPolicy,
  RunMode,
} from '../../types';
import { DEFAULT_WEIGHTS, SOFT_CONSTRAINT_LABELS } from '../../constants';
import { PinnedGrid } from './PinnedGrid';
import { GradeTabs } from '../shared/GradeTabs';

// Soft constraint weight 설명. 사용자가 알고리즘 행동을 직관적으로 이해하도록
// 각 항목이 "1단위당" 어떻게 점수에 기여하는지 명시.
const WEIGHT_DESCRIPTIONS: Record<keyof AlgorithmWeights, string> = {
  threePlusExamsPerDay: '학생당 일일 한도 초과 1건당 페널티 (cap 위반은 매우 큰 가중치 권장)',
  studentEmptyDay: '한 day라도 시험 없는 학생 1명당 페널티',
  examEveryDay: '시험 없는 일차 1개당 페널티 (매일 최소 1과목 옵션 ON일 때 적용)',
  twoExamsInARow: '학생이 연속 교시에 2시험 보는 사례 1건당 페널티',
  majorClustering: '같은 날 주요교과 2개 이상 묶임 1건당 페널티',
  majorConsecutive: '주요교과 연속일 1건당 페널티',
  unevenLoad: '학생별 일차 부담 표준편차 1단위당 페널티',
  earlyMorningHard: '1교시 주요과목 1건당 보너스 (선호 옵션 ON일 때 적용)',
  electiveConcurrency: '선택과목 동시 배치 1쌍당 보너스 (선호 옵션 ON일 때 적용)',
  supervisorOverflow: '교시별 감독 수요가 가용 인원을 넘는 1명당 페널티 (감독 Soft 모드일 때)',
  supervisorPeak: '가장 수요가 높은 교시의 감독 인원 1명당 페널티 — 피크 평탄화 유도',
};

// 표시 순서 — 점수 영향력 큰 항목을 위로
const WEIGHT_KEYS: Array<keyof AlgorithmWeights> = [
  'threePlusExamsPerDay',
  'supervisorOverflow',
  'supervisorPeak',
  'studentEmptyDay',
  'examEveryDay',
  'majorClustering',
  'electiveConcurrency',
  'unevenLoad',
  'twoExamsInARow',
  'majorConsecutive',
  'earlyMorningHard',
];

/**
 * Hard 토글 — 일반 soft 토글과 시각적으로 구분되도록 rose 색조 + "HARD" 라벨.
 * 사용자가 한 옵션이 hard 게이트로 적용되는지 한눈에 알 수 있게 합니다.
 */
function HardToggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
        disabled
          ? 'border-muted bg-muted/20 text-muted-foreground/50'
          : checked
            ? 'border-rose-300 bg-rose-50 text-rose-700'
            : 'border-muted bg-background text-muted-foreground'
      }`}
    >
      <span className="tracking-wider">HARD</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="scale-75 data-[state=checked]:bg-rose-600"
        aria-label="hard 게이트 토글"
      />
    </div>
  );
}

export function Step4Pinned() {
  const { state, dispatch, setStep, setActiveGrade, activeGradeInput } = useExamScheduleStore();
  const grade = state.activeGrade;

  const handlePin = (entry: { subjectId: string; dayIndex: number; period: number }) => {
    dispatch({ type: 'ADD_PINNED', grade, entry });
  };

  const handleUnpin = (subjectId: string) => {
    dispatch({ type: 'REMOVE_PINNED', grade, subjectId });
  };

  const handleTogglePeriod = (dayIndex: number, period: number) => {
    dispatch({ type: 'TOGGLE_PERIOD_ACTIVE', grade, dayIndex, period });
  };

  const totalPinned = state.grades.reduce(
    (acc, g) => acc + state.gradeInputs[g].pinned.length,
    0,
  );

  const setHardConstraint = (key: keyof HardConstraintOptions, value: boolean) => {
    dispatch({
      type: 'SET_OPTIONS',
      patch: {
        hardConstraints: {
          ...state.options.hardConstraints,
          [key]: value,
        },
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>고정 배치 및 알고리즘 옵션</CardTitle>
        <p className="text-sm text-muted-foreground">
          반드시 특정 위치에 배치할 과목과 알고리즘 옵션을 설정합니다. 시간표의
          빈 슬롯을 클릭해서 과목을 고정할 수 있습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">고정 배치 (전체 {totalPinned}건)</Label>
            {activeGradeInput.pinned.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: 'SET_PINNED', grade, pinned: [] })}
              >
                {grade}학년 모두 해제
              </Button>
            )}
          </div>
          <GradeTabs
            grades={state.grades}
            active={grade}
            onSelect={setActiveGrade}
            badge={(g) => `${state.gradeInputs[g].pinned.length}건`}
          />
          <PinnedGrid
            grade={activeGradeInput}
            subjects={activeGradeInput.subjects}
            pinned={activeGradeInput.pinned}
            onPin={handlePin}
            onUnpin={handleUnpin}
            onTogglePeriod={handleTogglePeriod}
          />
          {activeGradeInput.subjects.length === 0 && (
            <p className="text-xs text-rose-600">
              ⚠ {grade}학년 시험 과목이 선택되지 않았습니다. 1단계에서 과목을 먼저 선택해 주세요.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <Label className="text-base">알고리즘 옵션</Label>
          <div className="space-y-3 rounded-md border p-3">
            <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
              HARD CONSTRAINT: 학생 동시 응시 충돌, 고정 배치, 비활성 교시 사용은 항상 금지합니다.
              아래 옵션은 안전한 범위에서 hard/soft 정책을 조정합니다.
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">선택 과목 동시 배치 허용</div>
                <div className="text-xs text-muted-foreground">
                  같은 슬롯에 응시자가 겹치지 않는 선택 과목을 함께 배치할 수 있게 합니다.
                </div>
              </div>
              <Switch
                checked={state.options.allowConcurrentElectives}
                onCheckedChange={(v) =>
                  dispatch({
                    type: 'SET_OPTIONS',
                    patch: {
                      allowConcurrentElectives: v,
                      preferConcurrentElectives: v
                        ? state.options.preferConcurrentElectives
                        : false,
                      hardConstraints: {
                        ...state.options.hardConstraints,
                        electiveConcurrency: v
                          ? state.options.hardConstraints.electiveConcurrency
                          : false,
                      },
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">선택 과목 동시 배치 최대화</div>
                <div className="text-xs text-muted-foreground">
                  켜면 응시자가 겹치지 않는 선택 과목이 같은 슬롯에 들어가는 후보를 보너스로 평가합니다.
                  Hard로 적용하면 동시 배치 가능한 선택과목 쌍이 있는데도 하나도 같이 배치되지 않은 후보를 제외합니다.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={state.options.preferConcurrentElectives}
                  disabled={!state.options.allowConcurrentElectives}
                  onCheckedChange={(v) =>
                    dispatch({
                      type: 'SET_OPTIONS',
                      patch: {
                        preferConcurrentElectives: v,
                        hardConstraints: {
                          ...state.options.hardConstraints,
                          electiveConcurrency: v
                            ? state.options.hardConstraints.electiveConcurrency
                            : false,
                        },
                      },
                    })
                  }
                />
                <HardToggle
                  checked={state.options.hardConstraints.electiveConcurrency}
                  disabled={
                    !state.options.allowConcurrentElectives ||
                    !state.options.preferConcurrentElectives
                  }
                  onCheckedChange={(v) => setHardConstraint('electiveConcurrency', v)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">매일 최소 1과목 시험</div>
                <div className="text-xs text-muted-foreground">
                  기본은 soft penalty이며, Hard로 적용하면 빈 일차가 있는 후보를 제외합니다.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={state.options.requireExamEveryDay}
                  onCheckedChange={(v) =>
                    dispatch({
                      type: 'SET_OPTIONS',
                      patch: {
                        requireExamEveryDay: v,
                        hardConstraints: {
                          ...state.options.hardConstraints,
                          examEveryDay: v
                            ? state.options.hardConstraints.examEveryDay
                            : false,
                        },
                      },
                    })
                  }
                />
                <HardToggle
                  checked={state.options.hardConstraints.examEveryDay}
                  disabled={!state.options.requireExamEveryDay}
                  onCheckedChange={(v) => setHardConstraint('examEveryDay', v)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">학생당 일일 최대 시험 수</div>
                <div className="text-xs text-muted-foreground">
                  초과 시 soft penalty로 평가합니다. (학생 응시 패턴에 따라 Hard 적용은
                  수학적으로 불가능한 경우가 발생할 수 있어 비활성화됨)
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={state.options.maxExamsPerStudentPerDay}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_OPTIONS',
                      patch: {
                        maxExamsPerStudentPerDay: Math.max(
                          1,
                          Math.min(5, Number(e.target.value) || 2),
                        ),
                      },
                    })
                  }
                  className="w-20 text-center"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">주요 교과 분산 정책</div>
                <div className="text-xs text-muted-foreground">
                  기본은 soft penalty이며, Hard로 적용하면 정책 위반 후보를 제외합니다.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={state.options.majorSubjectsSpread}
                  onValueChange={(v: MajorSpreadPolicy) =>
                    dispatch({
                      type: 'SET_OPTIONS',
                      patch: {
                        majorSubjectsSpread: v,
                        hardConstraints: {
                          ...state.options.hardConstraints,
                          majorSubjectsSpread:
                            v === 'off'
                              ? false
                              : state.options.hardConstraints.majorSubjectsSpread,
                        },
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one-per-day">하루 1과목</SelectItem>
                    <SelectItem value="no-consecutive">연속일 회피</SelectItem>
                    <SelectItem value="off">정책 없음</SelectItem>
                  </SelectContent>
                </Select>
                <HardToggle
                  checked={state.options.hardConstraints.majorSubjectsSpread}
                  disabled={state.options.majorSubjectsSpread === 'off'}
                  onCheckedChange={(v) => setHardConstraint('majorSubjectsSpread', v)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">1교시 주요과목 선호</div>
                <div className="text-xs text-muted-foreground">
                  켜면 1교시에 주요과목이 배치되는 것을 <b>좋은 것</b>으로 평가합니다 (보너스 점수).
                  꺼두면 중립으로 처리됩니다.
                </div>
              </div>
              <Switch
                checked={state.options.preferEarlyMajor}
                onCheckedChange={(v) =>
                  dispatch({ type: 'SET_OPTIONS', patch: { preferEarlyMajor: v } })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">처리 모드</div>
                <div className="text-xs text-muted-foreground">
                  더 충분한 처리 시간을 줄수록 더 좋은 후보를 찾을 가능성이 높아집니다.
                </div>
              </div>
              <Select
                value={state.options.runMode}
                onValueChange={(v: RunMode) =>
                  dispatch({ type: 'SET_OPTIONS', patch: { runMode: v } })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">빠른 (~2초)</SelectItem>
                  <SelectItem value="standard">표준 (~10초)</SelectItem>
                  <SelectItem value="thorough">정밀 (~30초)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">랜덤 시드 (선택)</div>
                <div className="text-xs text-muted-foreground">
                  같은 시드를 입력하면 동일 결과가 재현됩니다.
                </div>
              </div>
              <Input
                type="number"
                placeholder="자동"
                value={state.options.randomSeed ?? ''}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_OPTIONS',
                    patch: {
                      randomSeed: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  })
                }
                className="w-32 text-center"
              />
            </div>

            <Collapsible className="rounded-md border">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/30"
                >
                  <span>고급 옵션 — Soft Constraint 가중치</span>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t px-3 pb-3 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    각 항목의 가중치를 직접 조정합니다. 0이면 무시. 클수록 알고리즘이
                    더 강하게 회피(또는 선호)합니다. 일반 사용자는 기본값을 권장합니다.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      dispatch({ type: 'SET_WEIGHTS', weights: { ...DEFAULT_WEIGHTS } })
                    }
                  >
                    기본값 복원
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {WEIGHT_KEYS.map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {SOFT_CONSTRAINT_LABELS[key] ?? key}
                        </div>
                        <div className="text-[10px] leading-tight text-muted-foreground">
                          {WEIGHT_DESCRIPTIONS[key]}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        value={state.weights[key]}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_WEIGHTS',
                            weights: {
                              ...state.weights,
                              [key]: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="w-20 text-center"
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </section>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep('periods')}>이전</Button>
          <Button onClick={() => setStep('generate')}>생성 단계로</Button>
        </div>
      </CardContent>
    </Card>
  );
}
