import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BasicConfigSection } from './BasicConfigSection';
import { AlgorithmSelector } from './AlgorithmSelector';
import { ConstraintsSection } from './ConstraintsSection';
import { SpecialClassSectionWithState } from './SpecialClassSection';

export const ConfigPanel: React.FC = () => {
  return (
    <div className="space-y-4 text-sm">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">기본 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <BasicConfigSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">배정 알고리즘</CardTitle>
        </CardHeader>
        <CardContent>
          <AlgorithmSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">배정 제약 조건</CardTitle>
        </CardHeader>
        <CardContent>
          <ConstraintsSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">특수반 배정 (과목 선택 기반)</CardTitle>
        </CardHeader>
        <CardContent>
          <SpecialClassSectionWithState />
        </CardContent>
      </Card>
    </div>
  );
};
