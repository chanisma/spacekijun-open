import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';

export const BasicConfigSection: React.FC = () => {
  const { config, updateConfig } = useClassAssignmentContext();

  return (
    <div className="space-y-4">
      {/* 학년 선택 */}
      <div className="space-y-2">
        <Label>학년</Label>
        <div className="flex gap-2">
          {[1, 2].map((grade) => (
            <Button
              key={grade}
              type="button"
              variant={config.grade === grade ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => updateConfig({ grade })}
            >
              {grade}학년
            </Button>
          ))}
        </div>
      </div>

      {/* 반 개수 */}
      <div className="space-y-2">
        <Label htmlFor="classCount">반 개수</Label>
        <Input
          id="classCount"
          type="number"
          min={1}
          max={20}
          value={config.classCount}
          onChange={(e) => updateConfig({ classCount: parseInt(e.target.value) || 1 })}
        />
      </div>
    </div>
  );
};
