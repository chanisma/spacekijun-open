import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { ExamScheduleInput, ScheduleCandidate } from '../../types';
import { allSubjects } from '../../utils/multiGrade';

const COLORS = ['#d97706', '#0891b2', '#7c3aed', '#16a34a', '#dc2626'];

type AxisDirection = 'lower' | 'higher';

interface AxisDef {
  key: string;
  label: string;
  direction: AxisDirection;
  target: (candidates: ScheduleCandidate[]) => number;
}

function softCount(candidate: ScheduleCandidate, key: string): number {
  return candidate.scoreBreakdown.soft.find((s) => s.id === key)?.count ?? 0;
}

function maxCount(candidates: ScheduleCandidate[], key: string, fallback: number): number {
  return Math.max(fallback, ...candidates.map((c) => softCount(c, key)));
}

function normalize(value: number, direction: AxisDirection, target: number): number {
  if (target <= 0) return 100;
  const ratio = Math.min(1, Math.max(0, value / target));
  return Math.round((direction === 'lower' ? 1 - ratio : ratio) * 100);
}

export function ScoreRadarChart({
  candidates,
  input,
}: {
  candidates: ScheduleCandidate[];
  input: ExamScheduleInput;
}) {
  if (candidates.length === 0) return null;

  const subjects = allSubjects(input);
  const majorCount = subjects.filter((s) => s.isMajor).length;
  const electiveCount = subjects.filter((s) => s.scope === 'elective').length;
  const dayCount = Math.max(
    1,
    ...input.grades.map((g) => input.gradeInputs[g]?.days.length ?? 0),
  );
  const axes: AxisDef[] = [
    {
      key: 'examEveryDay',
      label: '빈 일차↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'examEveryDay', Math.max(1, dayCount * input.grades.length)),
    },
    {
      key: 'twoExamsInARow',
      label: '연속 교시↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'twoExamsInARow', 10),
    },
    {
      key: 'threePlusExamsPerDay',
      label: '하루 과다↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'threePlusExamsPerDay', 5),
    },
    {
      key: 'majorClustering',
      label: '주요 집중↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'majorClustering', Math.max(1, majorCount - dayCount)),
    },
    {
      key: 'majorConsecutive',
      label: '주요 연속일↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'majorConsecutive', Math.max(1, dayCount - 1)),
    },
    {
      key: 'unevenLoad',
      label: '부담 편차↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'unevenLoad', 2),
    },
    {
      key: 'earlyMorningHard',
      label: '1교시 주요↑',
      direction: 'higher',
      target: (cs) => maxCount(cs, 'earlyMorningHard', Math.max(1, majorCount)),
    },
    {
      key: 'studentEmptyDay',
      label: '시험 없는 날↓',
      direction: 'lower',
      target: (cs) => maxCount(cs, 'studentEmptyDay', 100),
    },
    {
      key: 'electiveConcurrency',
      label: '선택 동시↑',
      direction: 'higher',
      target: (cs) => maxCount(cs, 'electiveConcurrency', Math.max(1, electiveCount - 1)),
    },
    {
      key: 'supervisorPeak',
      label: '감독 피크↓',
      direction: 'lower',
      target: (cs) =>
        maxCount(cs, 'supervisorPeak', Math.max(1, input.supervision.availableSupervisors)),
    },
  ];

  const activeAxes = axes.filter((ax) =>
    candidates.some((c) => {
      const soft = c.scoreBreakdown.soft.find((s) => s.id === ax.key);
      return soft && soft.weight !== 0;
    }),
  );

  if (activeAxes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border text-sm text-muted-foreground">
        활성화된 soft constraint가 없어 그래프를 표시할 항목이 없습니다.
      </div>
    );
  }

  const data = activeAxes.map((ax) => {
    const row: Record<string, string | number> = { axis: ax.label };
    candidates.forEach((c, idx) => {
      const raw = softCount(c, ax.key);
      row[`c${idx}`] = normalize(raw, ax.direction, ax.target(candidates));
      row[`c${idx}Raw`] = Number(raw.toFixed(2));
    });
    return row;
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          {candidates.map((_c, idx) => (
            <Radar
              key={idx}
              name={`후보 ${idx + 1}`}
              dataKey={`c${idx}`}
              stroke={COLORS[idx % COLORS.length]}
              fill={COLORS[idx % COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name, props) => {
              const raw = props.payload?.[`${props.dataKey}Raw`];
              return [`${value}/100 (원값 ${raw})`, name];
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
