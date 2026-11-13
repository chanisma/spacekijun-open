import React, { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SubjectAssignmentConfig, SubjectConfig, SubjectAssignmentAlgorithm } from '../../types/subject-assignment.types';

interface SubjectConfigPanelProps {
  config: SubjectAssignmentConfig;
  enrollmentSummary: { subject: string; semester: 'semester1' | 'semester2'; count: number }[];
  onUpdateConfig: (updates: Partial<SubjectAssignmentConfig>) => void;
  subjectConfigs: SubjectConfig[];
  onUpdateSubjectConfig: (index: number, updates: Partial<SubjectConfig>) => void;
  onAddSubjectConfig: (config: SubjectConfig) => void;
  onRemoveSubjectConfig: (index: number) => void;
  // Grade filter
  availableGrades: number[];
  currentGrade: number;
  onGradeChange: (grade: number) => void;
}

const algorithmOptions: { value: SubjectAssignmentAlgorithm; label: string }[] = [
  { value: 'stratified', label: '계층화 배정' },
  { value: 'serpentine', label: '뱀식 배정' },
  { value: 'balanced', label: '성적순 배정' },
  { value: 'random', label: '무작위 배정' },
];

type SemesterFilter = 'semester1' | 'semester2';

export const SubjectConfigPanel: React.FC<SubjectConfigPanelProps> = ({
  config,
  enrollmentSummary,
  onUpdateConfig,
  subjectConfigs,
  onUpdateSubjectConfig,
  onAddSubjectConfig,
  onRemoveSubjectConfig,
  availableGrades,
  currentGrade,
  onGradeChange,
}) => {
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('semester1');

  // Filter enrollment summary by selected semester
  const filteredSubjects = useMemo(
    () => enrollmentSummary.filter((item) => item.semester === semesterFilter),
    [enrollmentSummary, semesterFilter]
  );

  // Count selected subjects per semester
  const selectedCountBySemester = useMemo(() => {
    const s1 = subjectConfigs.filter((c) => c.semester === 'semester1').length;
    const s2 = subjectConfigs.filter((c) => c.semester === 'semester2').length;
    return { semester1: s1, semester2: s2 };
  }, [subjectConfigs]);

  // Check if a subject is selected (exists in subjectConfigs)
  const isSelected = (subject: string, semester: SemesterFilter) =>
    subjectConfigs.some((cfg) => cfg.subject === subject && cfg.semester === semester);

  // Find the config index for a subject
  const findConfigIndex = (subject: string, semester: SemesterFilter) =>
    subjectConfigs.findIndex((cfg) => cfg.subject === subject && cfg.semester === semester);

  // Toggle a subject on/off
  const handleToggle = (subject: string, semester: SemesterFilter, count: number) => {
    const idx = findConfigIndex(subject, semester);
    if (idx >= 0) {
      onRemoveSubjectConfig(idx);
    } else {
      onAddSubjectConfig({
        subject,
        semester,
        enrollmentCount: count,
        classCount: Math.max(1, Math.ceil(count / 30)),
      });
    }
  };

  // Update class count for a subject
  const handleClassCountChange = (subject: string, semester: SemesterFilter, value: string) => {
    const idx = findConfigIndex(subject, semester);
    if (idx >= 0) {
      onUpdateSubjectConfig(idx, { classCount: parseInt(value) || 1 });
    }
  };

  // Get current class count for a subject
  const getClassCount = (subject: string, semester: SemesterFilter): number => {
    const cfg = subjectConfigs.find((c) => c.subject === subject && c.semester === semester);
    return cfg?.classCount ?? Math.max(1, Math.ceil(
      (enrollmentSummary.find((e) => e.subject === subject && e.semester === semester)?.count ?? 0) / 30
    ));
  };

  return (
    <div className="space-y-4">
      {/* Global Settings */}
      <div className="bg-white/60 rounded-xl border border-slate-100/60 p-4 space-y-3">
        <h4 className="text-sm font-bold text-slate-700">전역 설정</h4>

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
      </div>

      {/* Subject List */}
      <div className="bg-white/60 rounded-xl border border-slate-100/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700">과목 목록</h4>
          <span className="text-xs text-slate-400">
            {subjectConfigs.length}개 선택
          </span>
        </div>

        {/* Grade Tabs */}
        {availableGrades.length > 0 && (
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {availableGrades.map((grade) => (
              <button
                key={grade}
                onClick={() => onGradeChange(grade)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center',
                  currentGrade === grade
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {grade}학년
              </button>
            ))}
          </div>
        )}

        {/* Semester Tabs */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setSemesterFilter('semester1')}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center',
              semesterFilter === 'semester1'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            1학기
            {selectedCountBySemester.semester1 > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-indigo-100 text-indigo-600 rounded-full">
                {selectedCountBySemester.semester1}
              </span>
            )}
          </button>
          <button
            onClick={() => setSemesterFilter('semester2')}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all text-center',
              semesterFilter === 'semester2'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            2학기
            {selectedCountBySemester.semester2 > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-indigo-100 text-indigo-600 rounded-full">
                {selectedCountBySemester.semester2}
              </span>
            )}
          </button>
        </div>

        {/* Select All Toggle */}
        {filteredSubjects.length > 0 && (
          <div
            className="flex items-center gap-2 px-1 cursor-pointer"
            onClick={() => {
              const allSelected = filteredSubjects.every((item) =>
                isSelected(item.subject, semesterFilter)
              );
              if (allSelected) {
                // Deselect all in current view (remove in reverse to keep indices stable)
                const indices = filteredSubjects
                  .map((item) => findConfigIndex(item.subject, semesterFilter))
                  .filter((idx) => idx >= 0)
                  .sort((a, b) => b - a);
                indices.forEach((idx) => onRemoveSubjectConfig(idx));
              } else {
                // Select all unselected in current view
                filteredSubjects.forEach((item) => {
                  if (!isSelected(item.subject, semesterFilter)) {
                    onAddSubjectConfig({
                      subject: item.subject,
                      semester: semesterFilter,
                      enrollmentCount: item.count,
                      classCount: Math.max(1, Math.ceil(item.count / 30)),
                    });
                  }
                });
              }
            }}
          >
            <Checkbox
              checked={
                filteredSubjects.length > 0 &&
                filteredSubjects.every((item) => isSelected(item.subject, semesterFilter))
              }
              className="shrink-0"
            />
            <span className="text-xs text-slate-500 font-medium">전체 선택</span>
          </div>
        )}

        {/* Subject Cards */}
        <div className="space-y-1.5 max-h-[calc(100vh-520px)] overflow-y-auto custom-scrollbar">
          {filteredSubjects.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              해당 학기에 과목이 없습니다.
            </div>
          ) : (
            filteredSubjects.map((item) => {
              const selected = isSelected(item.subject, semesterFilter);
              const classCount = getClassCount(item.subject, semesterFilter);

              return (
                <div
                  key={`${item.subject}-${item.semester}`}
                  className={cn(
                    'rounded-lg border p-2.5 transition-all cursor-pointer',
                    selected
                      ? 'bg-indigo-50/60 border-indigo-200'
                      : 'bg-slate-50/50 border-slate-100/60 hover:border-slate-200'
                  )}
                  onClick={() => handleToggle(item.subject, semesterFilter, item.count)}
                >
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => handleToggle(item.subject, semesterFilter, item.count)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">
                        {item.subject}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        <Users className="h-3 w-3" />
                        <span>{item.count}명</span>
                      </div>
                    </div>

                    {selected && (
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          type="number"
                          min={1}
                          max={item.count}
                          value={classCount}
                          onChange={(e) =>
                            handleClassCountChange(item.subject, semesterFilter, e.target.value)
                          }
                          className="w-14 h-7 text-center text-sm px-1"
                        />
                        <span className="text-xs text-slate-400">반</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
