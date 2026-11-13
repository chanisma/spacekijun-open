import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import type { AlgorithmType } from '../../types/class-assignment.types';

const ALGORITHM_OPTIONS: {
  value: AlgorithmType;
  label: string;
  description: string;
  recommended?: boolean;
}[] = [
    {
      value: 'stratified',
      label: '계층화 배정',
      description: '성적을 상/중/하로 나눈 후 각 그룹에서 뱀식 배정 (추천)',
      recommended: true,
    },
    {
      value: 'serpentine',
      label: '뱀식 배정',
      description: '성적순으로 정렬 후 지그재그 배정 (1→2→3→3→2→1)',
    },
    {
      value: 'gradeBased',
      label: '성적순 배정',
      description: '성적순으로 순차 배정 (1→2→3→1→2→3)',
    },
    {
      value: 'random',
      label: '무작위 배정',
      description: '학생을 무작위로 균등 배정',
    },
  ];

export const AlgorithmSelector: React.FC = () => {
  const { config, updateConfig } = useClassAssignmentContext();

  const selectedAlgorithm = ALGORITHM_OPTIONS.find(opt => opt.value === config.algorithm);

  return (
    <div className="space-y-2">
      <Label htmlFor="algorithm">배정 알고리즘</Label>
      <Select
        value={config.algorithm}
        onValueChange={(value) => updateConfig({ algorithm: value as AlgorithmType })}
      >
        <SelectTrigger id="algorithm">
          <SelectValue placeholder="알고리즘 선택" />
        </SelectTrigger>
        <SelectContent>
          {ALGORITHM_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                {option.label}
                {option.recommended && (
                  <Badge variant="secondary" className="text-xs">추천</Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedAlgorithm && (
        <p className="text-xs text-muted-foreground">
          {selectedAlgorithm.description}
        </p>
      )}
    </div>
  );
};
