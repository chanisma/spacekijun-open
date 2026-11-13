/**
 * Special Class Section Component
 * 특수반 배정 설정 - 과목조합/클러스터링 모드
 */

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCourseIntegration } from '../../hooks/useCourseIntegration';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { SubjectCombinationConfig } from './SubjectCombinationConfig';
import { ClusteringConfig } from './ClusteringConfig';
import type { SpecialClassMode } from '../../types/class-assignment.types';
import type { SubjectCombination } from '../../utils/algorithms/subjectBased';

export interface SpecialClassSectionProps {
  mode: SpecialClassMode;
  onModeChange: (mode: SpecialClassMode) => void;
  subjectCombinations: SubjectCombination[];
  onSubjectCombinationsChange: (combinations: SubjectCombination[]) => void;
  clusterCount: number;
  onClusterCountChange: (count: number) => void;
  minClusterSize: number;
  onMinClusterSizeChange: (size: number) => void;
  balanceGrades: boolean;
  onBalanceGradesChange: (balance: boolean) => void;
  centroidThreshold: number;
  onCentroidThresholdChange: (threshold: number) => void;
}

export const SpecialClassSection: React.FC<SpecialClassSectionProps> = ({
  mode,
  onModeChange,
  subjectCombinations,
  onSubjectCombinationsChange,
  clusterCount,
  onClusterCountChange,
  minClusterSize,
  onMinClusterSizeChange,
  balanceGrades,
  onBalanceGradesChange,
  centroidThreshold,
  onCentroidThresholdChange,
}) => {
  const { sourceStudents, setSourceStudents, setSpecialClassMode, setSubjectCombinations, setClusteringOptions } = useClassAssignmentContext();

  // Sync mode to context when it changes
  React.useEffect(() => {
    setSpecialClassMode(mode);
  }, [mode, setSpecialClassMode]);

  // Sync subject combinations to context when they change
  React.useEffect(() => {
    setSubjectCombinations(subjectCombinations);
  }, [subjectCombinations, setSubjectCombinations]);

  // Sync clustering options to context when they change
  React.useEffect(() => {
    setClusteringOptions({ clusterCount, minClusterSize, balanceGrades, centroidThreshold });
  }, [clusterCount, minClusterSize, balanceGrades, centroidThreshold, setClusteringOptions]);

  const {
    hasCourseData,
    loadCourseData,
    isLoading,
    enrichStudentsWithCourses,
  } = useCourseIntegration();

  // 과목 데이터 항상 자동 로드 (학생 데이터가 있을 때)
  useEffect(() => {
    if (!hasCourseData && sourceStudents.length > 0 && !isLoading) {
      loadCourseData().then(data => {
        if (data) {
          const enriched = enrichStudentsWithCourses(sourceStudents, data);
          setSourceStudents(enriched);
        }
      });
    }
  }, [sourceStudents.length, hasCourseData, isLoading]);

  return (
    <div className="space-y-4">

      {/* 특수반 모드 선택 */}
      <div className="space-y-2">
        <Label>특수반 배정 방식</Label>
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as SpecialClassMode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="none" className="text-xs">사용 안함</TabsTrigger>
            <TabsTrigger value="combination" className="text-xs">과목 조합</TabsTrigger>
            <TabsTrigger value="clustering" className="text-xs">클러스터링</TabsTrigger>
          </TabsList>

          {/* 사용 안함 */}
          <TabsContent value="none" className="mt-4">
            <p className="text-sm text-muted-foreground text-center py-4">
              특수반 없이 일반 배정만 수행합니다.
            </p>
          </TabsContent>

          {/* 과목 조합 매칭 */}
          <TabsContent value="combination" className="mt-4">
            {!hasCourseData ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                {isLoading ? '과목 데이터 로드 중...' : '과목 선택 데이터가 없습니다.'}
              </p>
            ) : (
              <SubjectCombinationConfig
                combinations={subjectCombinations}
                onCombinationsChange={onSubjectCombinationsChange}
              />
            )}
          </TabsContent>

          {/* 클러스터링 */}
          <TabsContent value="clustering" className="mt-4">
            {!hasCourseData ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                {isLoading ? '과목 데이터 로드 중...' : '과목 선택 데이터가 없습니다.'}
              </p>
            ) : (
              <ClusteringConfig
                clusterCount={clusterCount}
                onClusterCountChange={onClusterCountChange}
                minClusterSize={minClusterSize}
                onMinClusterSizeChange={onMinClusterSizeChange}
                balanceGrades={balanceGrades}
                onBalanceGradesChange={onBalanceGradesChange}
                centroidThreshold={centroidThreshold}
                onCentroidThresholdChange={onCentroidThresholdChange}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* 모드별 설명 */}
      {mode !== 'none' && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 text-xs text-muted-foreground">
            {mode === 'combination' && (
              <p>
                <strong>과목 조합 매칭:</strong> 물리+화학 등 특정 과목 조합을 선택한 학생을 같은 반에 배정합니다.
              </p>
            )}
            {mode === 'clustering' && (
              <p>
                <strong>클러스터링:</strong> 유사한 과목 선택 패턴의 학생을 자동으로 분석하여 같은 반에 그룹화합니다.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// 기본 내보내기 - props 없이 사용 가능한 버전
export const SpecialClassSectionWithState: React.FC = () => {
  const { config } = useClassAssignmentContext();

  const [mode, setMode] = useState<SpecialClassMode>('none');
  const [subjectCombinations, setSubjectCombinations] = useState<SubjectCombination[]>([]);
  const [clusterCount, setClusterCount] = useState(config.classCount);
  const [minClusterSize, setMinClusterSize] = useState(15);
  const [balanceGrades, setBalanceGrades] = useState(true);
  const [centroidThreshold, setCentroidThreshold] = useState(0.7);

  return (
    <SpecialClassSection
      mode={mode}
      onModeChange={setMode}
      subjectCombinations={subjectCombinations}
      onSubjectCombinationsChange={setSubjectCombinations}
      clusterCount={clusterCount}
      onClusterCountChange={setClusterCount}
      minClusterSize={minClusterSize}
      onMinClusterSizeChange={setMinClusterSize}
      balanceGrades={balanceGrades}
      onBalanceGradesChange={setBalanceGrades}
      centroidThreshold={centroidThreshold}
      onCentroidThresholdChange={setCentroidThreshold}
    />
  );
};
