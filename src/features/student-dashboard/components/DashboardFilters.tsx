import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardFiltersProps {
  grade?: number;
  classNum?: number;
  searchTerm: string;
  onGradeChange: (grade: number | undefined) => void;
  onClassNumChange: (classNum: number | undefined) => void;
  onSearchTermChange: (term: string) => void;
  onClearFilters: () => void;
  totalCount?: number;
  filteredCount?: number;
  hasRequiredFilters?: boolean;
}

const GRADES = [1, 2, 3];
const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  grade,
  classNum,
  searchTerm,
  onGradeChange,
  onClassNumChange,
  onSearchTermChange,
  onClearFilters,
  filteredCount = 0,
  hasRequiredFilters = false,
}) => {
  const hasFilters = grade !== undefined || classNum !== undefined || searchTerm !== '';

  return (
    <div className="p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/60 space-y-3">
      {/* 상단: 학년 탭 + 검색 + 결과 */}
      <div className="flex items-center gap-4">
        {/* 학년 탭 */}
        <div className="flex bg-slate-100 rounded-lg p-1">
          {GRADES.map((g) => (
            <button
              key={g}
              onClick={() => onGradeChange(grade === g ? undefined : g)}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                grade === g
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              )}
            >
              {g}학년
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="이름, 번호 검색..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="pl-9 h-9 bg-white"
          />
        </div>

        {/* 초기화 버튼 */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-9 px-2 text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* 결과 수 */}
        <div className="text-sm shrink-0">
          {hasRequiredFilters ? (
            <span className="text-slate-700 font-medium">{filteredCount}명</span>
          ) : (
            <span className="text-amber-600 text-xs">학년/반 선택</span>
          )}
        </div>
      </div>

      {/* 하단: 반 버튼 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 mr-1">반</span>
        <div className="flex gap-1">
          {CLASSES.map((c) => (
            <button
              key={c}
              onClick={() => onClassNumChange(classNum === c ? undefined : c)}
              className={cn(
                'w-8 h-8 text-sm font-medium rounded-lg transition-all',
                classNum === c
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardFilters;
