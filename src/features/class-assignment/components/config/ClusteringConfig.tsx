/**
 * Clustering Configuration Component
 * 과목 클러스터링 알고리즘 설정 UI
 */

import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Layers, Target, Info } from 'lucide-react';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { useCourseIntegration } from '../../hooks/useCourseIntegration';
import { getStudentSubjects, kMeansCluster, generateClusterName } from '../../utils/algorithms/subjectBased';

interface ClusteringConfigProps {
  clusterCount: number;
  onClusterCountChange: (count: number) => void;
  minClusterSize: number;
  onMinClusterSizeChange: (size: number) => void;
  balanceGrades: boolean;
  onBalanceGradesChange: (balance: boolean) => void;
  centroidThreshold: number;
  onCentroidThresholdChange: (threshold: number) => void;
}

export const ClusteringConfig: React.FC<ClusteringConfigProps> = ({
  clusterCount,
  onClusterCountChange,
  minClusterSize,
  onMinClusterSizeChange,
  balanceGrades,
  onBalanceGradesChange,
  centroidThreshold,
  onCentroidThresholdChange,
}) => {
  const { sourceStudents, config } = useClassAssignmentContext();
  const { hasCourseData } = useCourseIntegration();

  // 미리보기 클러스터링 (학생 수가 적을 때만)
  const previewClusters = useMemo(() => {
    if (!hasCourseData || sourceStudents.length === 0) return null;

    // 과목 데이터가 있는 학생만 필터링
    const studentsWithCourses = sourceStudents.filter(s =>
      s.courseSelections &&
      (s.courseSelections.semester1?.length > 0 || s.courseSelections.semester2?.length > 0)
    );

    if (studentsWithCourses.length === 0) return null;
    if (studentsWithCourses.length > 300) return null; // 너무 많으면 미리보기 생략

    try {
      const clusters = kMeansCluster(studentsWithCourses, clusterCount, 20, centroidThreshold);
      return clusters.map(c => ({
        name: generateClusterName(c.centroid),
        subjects: c.centroid,
        count: c.students.length,
        similarity: c.similarity,
      }));
    } catch {
      return null;
    }
  }, [sourceStudents, clusterCount, hasCourseData, centroidThreshold]);

  // 과목 데이터가 있는 학생 수
  const studentsWithCoursesCount = useMemo(() => {
    return sourceStudents.filter(s =>
      s.courseSelections &&
      (s.courseSelections.semester1?.length > 0 || s.courseSelections.semester2?.length > 0)
    ).length;
  }, [sourceStudents]);

  // 클러스터 유형별 설명 생성
  const getClusterDescription = (name: string, subjects: string[]): string => {
    if (name === '이과중점') {
      return '과학 탐구 과목(물리, 화학, 생명, 지구과학)을 주로 선택한 학생들';
    }
    if (name === '문과중점') {
      return '사회 탐구 과목(정치, 경제, 사회, 지리, 역사 등)을 주로 선택한 학생들';
    }
    if (name === '예체능') {
      return '예술·체육 관련 과목(미술, 음악, 체육 등)을 선택한 학생들';
    }
    if (name === '교차선택') {
      return '과학과 사회 탐구 과목을 함께 선택한 학생들';
    }
    if (name === '일반') {
      return '특정 패턴 없이 다양한 과목을 선택한 학생들';
    }
    // 과목명 조합인 경우
    if (subjects.length > 0) {
      return `${subjects.slice(0, 3).join(', ')} 등을 공통 선택한 학생들`;
    }
    return '유사한 과목 선택 패턴의 학생들';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-blue-500" />
        <Label>클러스터링 설정</Label>
      </div>

      {/* 과목 데이터 상태 */}
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Info className="h-4 w-4" />
        과목 데이터가 있는 학생: {studentsWithCoursesCount}명 / {sourceStudents.length}명
      </div>

      {/* 클러스터 수 */}
      <div className="space-y-2">
        <Label className="text-sm">클러스터 수</Label>
        <Select
          value={clusterCount.toString()}
          onValueChange={(v) => onClusterCountChange(parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: Math.max(config.classCount - 1, 1) }, (_, i) => i + 2).map(n => (
              <SelectItem key={n} value={n.toString()}>
                {n}개 그룹
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          반 수({config.classCount})보다 작거나 같아야 합니다.
        </p>
      </div>

      {/* 최소 클러스터 크기 */}
      <div className="space-y-2">
        <Label className="text-sm">최소 그룹 크기</Label>
        <Select
          value={minClusterSize.toString()}
          onValueChange={(v) => onMinClusterSizeChange(parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 15, 20, 25, 30].map(n => (
              <SelectItem key={n} value={n.toString()}>
                {n}명 이상
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          이보다 작은 그룹은 다른 그룹과 병합됩니다.
        </p>
      </div>

      {/* 성적 균형 */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm">성적 균형 유지</Label>
          <p className="text-xs text-muted-foreground">
            각 클러스터 내에서 성적 분포를 균등하게 유지
          </p>
        </div>
        <Switch
          checked={balanceGrades}
          onCheckedChange={onBalanceGradesChange}
        />
      </div>

      {/* 클러스터 기준 강도 */}
      <div className="space-y-2">
        <Label className="text-sm">클러스터 기준 강도</Label>
        <Select
          value={centroidThreshold.toString()}
          onValueChange={(v) => onCentroidThresholdChange(parseFloat(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.4">느슨함 (40%) - 많은 과목 포함</SelectItem>
            <SelectItem value="0.5">보통 (50%) - 기본값</SelectItem>
            <SelectItem value="0.6">다소 엄격 (60%)</SelectItem>
            <SelectItem value="0.7">엄격함 (70%) - 핵심 과목만</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          클러스터 내 학생 중 해당 비율 이상이 선택한 과목만 기준 과목으로 사용
        </p>
      </div>

      {/* 클러스터 미리보기 */}
      {previewClusters && previewClusters.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            예상 그룹 (미리보기)
          </Label>
          <div className="space-y-2">
            {previewClusters.map((cluster, idx) => (
              <Card key={idx} className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {cluster.name || `그룹 ${idx + 1}`}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {cluster.count}명
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      유사도 {(cluster.similarity * 100).toFixed(0)}%
                    </Badge>
                  </div>

                  {/* 클러스터 설명 */}
                  <p className="text-xs text-muted-foreground mb-2">
                    {getClusterDescription(cluster.name, cluster.subjects)}
                  </p>

                  {/* 주요 과목 */}
                  {cluster.subjects.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">공통 선택 과목:</span>
                      <div className="flex flex-wrap gap-1">
                        {cluster.subjects.slice(0, 5).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {cluster.subjects.length > 5 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{cluster.subjects.length - 5}개
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 설명 */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-medium">클러스터링 알고리즘 동작 방식:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-600 dark:text-blue-400">
            <li>학생들의 과목 선택 패턴을 분석합니다.</li>
            <li>유사한 패턴의 학생들을 자동으로 그룹화합니다.</li>
            <li>각 그룹을 반에 배정하고 나머지 학생을 균등 분배합니다.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};
