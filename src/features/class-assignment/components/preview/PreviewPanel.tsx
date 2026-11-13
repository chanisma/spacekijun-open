/**
 * Preview Panel Component
 * 배정 결과 미리보기 및 통계
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, Info, Target, Users } from 'lucide-react';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { ClassStatistics } from './ClassStatistics';
import { matchesSubjectCombination } from '../../utils/algorithms/subjectBased';

export function PreviewPanel() {
  const { assignments, statistics, qualityScore, specialClassMode, subjectCombinations } = useClassAssignmentContext();

  // 과목 조합별 통계 계산
  const combinationStats = useMemo(() => {
    if (specialClassMode !== 'combination' || subjectCombinations.length === 0 || assignments.length === 0) {
      return null;
    }

    const allStudents = assignments.flatMap(cls => cls.students);

    return subjectCombinations.map(combo => {
      // 전체 매칭 학생 수
      const totalMatching = allStudents.filter(s => matchesSubjectCombination(s, combo)).length;

      // 반별 분포
      const classDistribution = assignments.map(cls => ({
        classNum: cls.classNum,
        count: cls.students.filter(s => matchesSubjectCombination(s, combo)).length,
        isTarget: combo.targetClassNum === cls.classNum,
      })).filter(c => c.count > 0);

      return {
        id: combo.id,
        name: combo.name,
        totalMatching,
        classDistribution,
        targetClassNum: combo.targetClassNum,
      };
    });
  }, [specialClassMode, subjectCombinations, assignments]);

  if (!statistics || !qualityScore) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>배정 결과가 없습니다</p>
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return { label: '우수', variant: 'default' as const };
    if (score >= 60) return { label: '양호', variant: 'secondary' as const };
    return { label: '개선 필요', variant: 'destructive' as const };
  };

  return (
    <div className="space-y-4 h-full overflow-y-auto pr-2">
      {/* 전체 품질 점수 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">배정 품질</CardTitle>
            <Badge variant={getScoreBadge(qualityScore.overall).variant}>
              {getScoreBadge(qualityScore.overall).label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-center">
            <span className={`text-4xl font-bold ${getScoreColor(qualityScore.overall)}`}>
              {qualityScore.overall}
            </span>
            <span className="text-muted-foreground text-lg ml-1">/ 100</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>성적 균형</span>
              <span>{qualityScore.gradeBalance}%</span>
            </div>
            <Progress value={qualityScore.gradeBalance} className="h-2" />

            <div className="flex items-center justify-between text-sm">
              <span>인원 균형</span>
              <span>{qualityScore.sizeBalance}%</span>
            </div>
            <Progress value={qualityScore.sizeBalance} className="h-2" />

            <div className="flex items-center justify-between text-sm">
              <span>출신반 다양성</span>
              <span>{qualityScore.diversity}%</span>
            </div>
            <Progress value={qualityScore.diversity} className="h-2" />
          </div>

          {/* 상세 피드백 */}
          <div className="pt-2 border-t space-y-1">
            {qualityScore.details.map((detail, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                {detail.startsWith('✅') ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5" />
                )}
                <span className="text-muted-foreground">{detail.slice(2)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 전체 통계 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">전체 통계</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">총 학생 수</span>
            <span className="font-medium">{statistics.totalStudents}명</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">반 수</span>
            <span className="font-medium">{statistics.classCount}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">반당 평균</span>
            <span className="font-medium">{statistics.avgClassSize.toFixed(1)}명</span>
          </div>
        </CardContent>
      </Card>

      {/* 과목 조합 통계 (combination 모드일 때만) */}
      {combinationStats && combinationStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">과목 조합 배정 현황</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {combinationStats.map(stat => (
              <div key={stat.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{stat.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {stat.totalMatching}명
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {stat.classDistribution.map(cls => (
                    <Badge
                      key={cls.classNum}
                      variant={cls.isTarget ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {cls.classNum}반: {cls.count}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 반별 상세 (접을 수 있는 형태로) */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium p-2 hover:bg-muted rounded-md">
          반별 상세 통계
        </summary>
        <div className="space-y-2 mt-2">
          {assignments.map((cls) => (
            <ClassStatistics key={cls.classNum} classData={cls} />
          ))}
        </div>
      </details>
    </div>
  );
}
