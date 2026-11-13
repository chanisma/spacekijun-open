/**
 * Class Statistics Component
 * 반별 상세 통계
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ClassAssignment } from '../../types/class-assignment.types';
import { getClassDetails } from '../../utils/statistics';

export interface ClassStatisticsProps {
  classData: ClassAssignment;
}

export function ClassStatistics({ classData }: ClassStatisticsProps) {
  const details = getClassDetails(classData);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{classData.classNum}반 상세</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">인원</span>
          <span className="font-medium">{details.studentCount}명</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">평균 등급</span>
          <span className="font-medium">{details.averageGrade.toFixed(2)}</span>
        </div>

        <div className="space-y-1">
          <span className="text-muted-foreground">성적 분포</span>
          <div className="space-y-1">
            {Object.entries(details.gradeDistribution).map(([label, count]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs w-16 truncate">{label}</span>
                <Progress
                  value={(count / details.studentCount) * 100}
                  className="flex-1 h-2"
                />
                <span className="text-xs w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-muted-foreground">출신반 분포</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(details.originDistribution)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([classNum, count]) => (
                <span
                  key={classNum}
                  className="text-xs px-2 py-0.5 bg-muted rounded"
                >
                  {classNum}반: {count}
                </span>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
