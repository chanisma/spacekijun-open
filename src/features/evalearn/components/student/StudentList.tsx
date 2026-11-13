import React, { useState } from 'react';
import { EvalearnStudent } from '../../types';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, RotateCcw, Search, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchStudentsWithMocking } from '../../services/evalearnService';
import { useQuery } from '@tanstack/react-query';

interface StudentListProps {
  selectedStudentId: string | null;
  onSelectStudent: (student: EvalearnStudent) => void;
  onRefresh: () => void;
  loading: boolean;
  /** 학년/반 라벨 클릭 -> 집단 분석. classNum=null 이면 학년 전체 */
  onSelectCohort: (grade: number, classNum: number | null) => void;
  selectedCohort: { grade: number; classNum: number | null } | null;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  searchResults: EvalearnStudent[];
  searching: boolean;
}

const GRADES = [1, 2, 3];
const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const StudentList: React.FC<StudentListProps> = ({
  selectedStudentId,
  onSelectStudent,
  onRefresh,
  loading,
  onSelectCohort,
  selectedCohort,
  searchTerm,
  onSearchTermChange,
  searchResults,
  searching,
}) => {
  const isSearching = searchTerm.trim() !== '';

  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  const toggleGrade = (g: number) => {
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };
  const toggleClass = (key: string) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 헤더 */}
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
        <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          학생 목록
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-7 w-7 p-0 hover:bg-slate-200/50"
          title="새로고침"
          disabled={loading}
        >
          <RotateCcw className={cn('h-3.5 w-3.5 text-slate-500', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* 이름 검색 */}
      <div className="px-4 py-2 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="이름 검색"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs bg-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchTermChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="검색 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 학생 목록 / 학년-반 트리 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent">
        {isSearching ? (
          searching ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-500" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center p-6 opacity-50">
              <p className="text-xs text-slate-400">검색 결과가 없습니다</p>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              {searchResults.map((student) => (
                <EvalearnStudentItem
                  key={student.id}
                  student={student}
                  isSelected={selectedStudentId === student.id}
                  onClick={() => onSelectStudent(student)}
                  showClassBadge
                />
              ))}
            </div>
          )
        ) : (
          <div className="p-3 space-y-0.5">
            {GRADES.map((g) => {
              const isGradeExpanded = expandedGrades.has(g);
              return (
                <div key={g}>
                  <div className="w-full flex items-center gap-1 text-sm rounded-lg transition-all text-slate-700 hover:bg-slate-100">
                    <button
                      onClick={() => toggleGrade(g)}
                      className="py-1.5 pl-2 pr-0.5 shrink-0 text-slate-400 hover:text-slate-700"
                      aria-label={isGradeExpanded ? '접기' : '펼치기'}
                    >
                      {isGradeExpanded
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    {/* 셰브론 = 펼치기, 라벨 = 그 집단 분석 */}
                    <button
                      onClick={() => onSelectCohort(g, null)}
                      className={cn(
                        'flex-1 text-left py-1.5 pr-2 font-medium rounded-md',
                        selectedCohort?.grade === g && selectedCohort.classNum === null && 'bg-brand-50 text-brand-700'
                      )}
                      title={`${g}학년 전체 분석`}
                    >
                      {g}학년
                    </button>
                  </div>
                  {isGradeExpanded && (
                    <ul className="ml-3 mt-0.5 space-y-0.5">
                      {CLASSES.map((c) => {
                        const classKey = `${g}-${c}`;
                        const isClassExpanded = expandedClasses.has(classKey);
                        return (
                          <li key={c}>
                            <div className="w-full flex items-center gap-1 text-sm rounded-lg transition-all text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                              <button
                                onClick={() => toggleClass(classKey)}
                                className="py-1.5 pl-2 pr-0.5 shrink-0 text-slate-400 hover:text-slate-700"
                                aria-label={isClassExpanded ? '접기' : '펼치기'}
                              >
                                {isClassExpanded
                                  ? <ChevronDown className="w-3 h-3" />
                                  : <ChevronRight className="w-3 h-3" />}
                              </button>
                              <button
                                onClick={() => onSelectCohort(g, c)}
                                className={cn(
                                  'flex-1 text-left py-1.5 pr-2 rounded-md',
                                  selectedCohort?.grade === g && selectedCohort.classNum === c && 'bg-brand-50 text-brand-700'
                                )}
                                title={`${g}학년 ${c}반 분석`}
                              >
                                {g}-{c}반
                              </button>
                            </div>
                            {isClassExpanded && (
                              <ClassRosterList
                                grade={g}
                                classNum={c}
                                selectedStudentId={selectedStudentId}
                                onSelectStudent={onSelectStudent}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentList;

// ----------------------------------------------------------------
// EvalearnStudentItem — 학생 1명 표시 항목 (student-dashboard의 StudentListItem 스타일 참고)
// ----------------------------------------------------------------
function EvalearnStudentItem({
  student, isSelected, onClick, showClassBadge = false,
}: {
  student: EvalearnStudent;
  isSelected?: boolean;
  onClick?: () => void;
  showClassBadge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-2 py-1.5 rounded-lg border transition-all flex items-center gap-2',
        isSelected
          ? 'bg-brand-50 border-brand-200 shadow-sm'
          : 'border-transparent hover:bg-slate-100 hover:border-slate-200'
      )}
    >
      <span className="text-[10px] font-mono text-slate-400 w-4 text-right shrink-0">
        {student.number ?? ''}
      </span>
      <span className={cn(
        'text-sm truncate flex-1',
        isSelected ? 'text-brand-700 font-semibold' : 'text-slate-700'
      )}>
        {student.name}
      </span>
      {showClassBadge && (
        <span className="text-[10px] font-mono text-slate-400 shrink-0">
          {student.grade}-{student.classNum}
        </span>
      )}
    </button>
  );
}

// ----------------------------------------------------------------
// ClassRosterList — 펼친 반 1개당 한 인스턴스. resource(type='student') 기준
// 재학생 명단을 조회한다 (마킹 데이터 유무와 무관하게 전원 표시).
// ----------------------------------------------------------------
function ClassRosterList({
  grade, classNum, selectedStudentId, onSelectStudent,
}: {
  grade: number;
  classNum: number;
  selectedStudentId: string | null;
  onSelectStudent: (student: EvalearnStudent) => void;
}) {
  const { data: roster = [], isLoading, isError } = useQuery({
    queryKey: ['evalearn', 'class-roster', grade, classNum],
    queryFn: () => fetchStudentsWithMocking(grade, classNum),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2 py-1">불러오는 중...</div>;
  if (isError) return <div className="ml-4 mt-1 text-[11px] text-red-500 px-2 py-1">불러올 수 없습니다</div>;
  if (roster.length === 0) {
    return (
      <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2 py-1 flex items-center gap-1">
        <Users className="w-3 h-3" />학생 없음
      </div>
    );
  }

  return (
    <ul className="ml-4 mt-0.5 space-y-0.5">
      {roster.map((student) => (
        <li key={student.id}>
          <EvalearnStudentItem
            student={student}
            isSelected={selectedStudentId === student.id}
            onClick={() => onSelectStudent(student)}
          />
        </li>
      ))}
    </ul>
  );
}
