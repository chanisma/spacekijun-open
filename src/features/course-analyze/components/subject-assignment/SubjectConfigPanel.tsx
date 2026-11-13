import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { X, Wand2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SubjectAssignmentConfig, SubjectConfig, SubjectAssignmentAlgorithm } from '../../types/course.types';

interface SubjectConfigPanelProps {
  config: SubjectAssignmentConfig;
  enrollmentSummary: { subject: string; semester: 'semester1' | 'semester2'; count: number }[];
  onUpdateConfig: (updates: Partial<SubjectAssignmentConfig>) => void;
  subjectConfigs: SubjectConfig[];
  onUpdateSubjectConfig: (index: number, updates: Partial<SubjectConfig>) => void;
  onAddSubjectConfig: (config: SubjectConfig) => void;
  onRemoveSubjectConfig: (index: number) => void;
  onAutoConfig: () => void;
}

const algorithmOptions: { value: SubjectAssignmentAlgorithm; label: string }[] = [
  { value: 'stratified', label: '계층화 배정' },
  { value: 'serpentine', label: '뱀식 배정' },
  { value: 'balanced', label: '성적순 배정' },
  { value: 'random', label: '무작위 배정' },
];

export const SubjectConfigPanel: React.FC<SubjectConfigPanelProps> = ({
  config,
  enrollmentSummary,
  onUpdateConfig,
  subjectConfigs,
  onUpdateSubjectConfig,
  onAddSubjectConfig,
  onRemoveSubjectConfig,
  onAutoConfig,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('');

  // Get available subjects not yet in configs
  const availableSubjects = enrollmentSummary.filter(
    (item) =>
      !subjectConfigs.some(
        (cfg) => cfg.subject === item.subject && cfg.semester === item.semester
      )
  );

  const handleAddSubject = () => {
    if (!selectedSubject) return;

    const [subject, semester] = selectedSubject.split('|');
    const enrollmentItem = enrollmentSummary.find(
      (item) => item.subject === subject && item.semester === semester
    );

    if (!enrollmentItem) return;

    onAddSubjectConfig({
      subject,
      semester: semester as 'semester1' | 'semester2',
      enrollmentCount: enrollmentItem.count,
      classCount: Math.max(1, Math.ceil(enrollmentItem.count / 30)),
    });

    setSelectedSubject('');
  };

  return (
    <div className="space-y-4">
      {/* Global Settings */}
      <div className="bg-white/60 rounded-xl border border-slate-100/60 p-4 space-y-3">
        <h4 className="text-sm font-bold text-slate-700">전역 설정</h4>

        {/* Algorithm Select */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">배정 알고리즘</Label>
          <Select
            value={config.globalAlgorithm}
            onValueChange={(value) =>
              onUpdateConfig({ globalAlgorithm: value as SubjectAssignmentAlgorithm })
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {algorithmOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Balance Grades Checkbox */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="balanceGrades"
            checked={config.balanceGrades}
            onCheckedChange={(checked) =>
              onUpdateConfig({ balanceGrades: checked === true })
            }
          />
          <Label
            htmlFor="balanceGrades"
            className="text-sm text-slate-700 cursor-pointer"
          >
            성적 균형 고려
          </Label>
        </div>

        {/* Auto Configure Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={onAutoConfig}
        >
          <Wand2 className="h-4 w-4 mr-2" />
          자동 설정
        </Button>
      </div>

      {/* Subject List */}
      <div className="bg-white/60 rounded-xl border border-slate-100/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700">과목 목록</h4>
          <span className="text-xs text-slate-400">{subjectConfigs.length}개 과목</span>
        </div>

        {/* Add Subject Dropdown */}
        {availableSubjects.length > 0 && (
          <div className="flex gap-2">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="h-9 text-sm flex-1">
                <SelectValue placeholder="과목 추가..." />
              </SelectTrigger>
              <SelectContent>
                {availableSubjects.map((item) => (
                  <SelectItem
                    key={`${item.subject}|${item.semester}`}
                    value={`${item.subject}|${item.semester}`}
                  >
                    {item.subject} ({item.semester === 'semester1' ? '1학기' : '2학기'}) - {item.count}명
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAddSubject}
              disabled={!selectedSubject}
              className="h-9"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {subjectConfigs.map((cfg, idx) => (
            <div
              key={`${cfg.subject}-${cfg.semester}-${idx}`}
              className="flex items-center gap-2 p-2 bg-slate-50/50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">
                  {cfg.subject}
                </div>
                <div className="text-xs text-slate-400">
                  {cfg.semester === 'semester1' ? '1학기' : '2학기'} · {cfg.enrollmentCount}명
                </div>
              </div>
              <Input
                type="number"
                min={1}
                max={cfg.enrollmentCount}
                value={cfg.classCount}
                onChange={(e) =>
                  onUpdateSubjectConfig(idx, {
                    classCount: parseInt(e.target.value) || 1,
                  })
                }
                className="w-16 h-8 text-center text-sm"
              />
              <span className="text-xs text-slate-400">반</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onRemoveSubjectConfig(idx)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {subjectConfigs.length === 0 && (
          <div className="text-center py-4 text-sm text-slate-400">
            과목이 없습니다. 자동 설정을 사용하거나 수동으로 추가하세요.
          </div>
        )}
      </div>
    </div>
  );
};
