import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, User } from 'lucide-react';
import { useWishlistAccess } from '../../hooks/useWishlistAccess';
import { useClassRoster } from '../../hooks/useClassRoster';
import { useStudentPictures } from '@/features/rescue-note/hooks/useStudentPictures';

interface Props {
  selectedStudent: string | null;
  selectedClass: { grade: number; classNum: number } | null;
  onSelectStudent: (code: string) => void;
  onSelectClass: (grade: number, classNum: number) => void;
  onDeselectClass: () => void;
}

/**
 * 교사/admin 용 학생 선택 좌측 패널. evalog(생기부 분석) 좌측 패널과 같이 별도 카드
 * 컨테이너 없이 패널 배경에 트리를 밀착시킨다. useWishlistAccess.visibleClasses 로
 * 권한 반만 노출하고, 학생 선택은 상위로 올린다(실제 데이터 게이트는 서버
 * can_care_student / RLS).
 */
export function LeftPanel({ selectedStudent, selectedClass, onSelectStudent, onSelectClass, onDeselectClass }: Props) {
  const access = useWishlistAccess();

  const grouped = useMemo(() => {
    const byGrade = new Map<number, Array<{ grade: number; classNumber: number }>>();
    access.visibleClasses.forEach((c) => {
      if (!byGrade.has(c.grade)) byGrade.set(c.grade, []);
      byGrade.get(c.grade)!.push(c);
    });
    return Array.from(byGrade.entries()).sort(([a], [b]) => a - b);
  }, [access.visibleClasses]);

  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(() => {
    const init = new Set<number>();
    if (access.homeroomClass) init.add(access.homeroomClass.grade);
    return init;
  });
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (access.homeroomClass) {
      init.add(`${access.homeroomClass.grade}-${access.homeroomClass.classNumber}`);
    }
    return init;
  });

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

  // 반 라벨(#-#반) 클릭 = 선택 + 명단 펼침 통합 (student-dashboard StudentListSidebar 와 동일 패턴).
  // 이미 선택된 반을 다시 누르면 선택 해제 + 명단 접힘. 셰브론은 별도 유지(선택과 무관한 미리보기 토글).
  const handleClassLabelClick = (grade: number, classNumber: number) => {
    const classKey = `${grade}-${classNumber}`;
    const isSelected = selectedClass?.grade === grade && selectedClass?.classNum === classNumber;
    if (isSelected) {
      onDeselectClass();
      setExpandedClasses((prev) => {
        if (!prev.has(classKey)) return prev;
        const next = new Set(prev);
        next.delete(classKey);
        return next;
      });
      return;
    }
    onSelectClass(grade, classNumber);
    setExpandedClasses((prev) => (prev.has(classKey) ? prev : new Set(prev).add(classKey)));
  };

  return (
    <aside className="flex flex-col w-72 h-full border-r border-slate-200 bg-white shrink-0 min-w-[18rem]">
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
        <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
          학급
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
      {grouped.length === 0 ? (
        <p className="text-xs text-slate-400 py-2 px-1">열람 가능한 반이 없습니다.</p>
      ) : (
        grouped.map(([grade, classes]) => {
          const expanded = expandedGrades.has(grade);
          return (
            <div key={grade} className="mb-1">
              <button
                onClick={() => toggleGrade(grade)}
                className="w-full flex items-center gap-1 text-sm rounded-lg transition-all text-slate-700 font-medium hover:bg-slate-100 py-1.5 px-2"
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                {grade}학년
              </button>
              {expanded && (
                <ul className="ml-4 mt-0.5 space-y-0.5">
                  {classes.map((c) => {
                    const classKey = `${c.grade}-${c.classNumber}`;
                    const isClassExpanded = expandedClasses.has(classKey);
                    const isHomeroom =
                      access.homeroomClass?.grade === c.grade &&
                      access.homeroomClass?.classNumber === c.classNumber;
                    const isClassSelected =
                      selectedClass?.grade === c.grade && selectedClass?.classNum === c.classNumber;
                    return (
                      <li key={c.classNumber}>
                        <div
                          className={`w-full flex items-center gap-1 text-sm rounded-lg transition-all ${
                            isClassSelected
                              ? 'bg-brand-50 text-brand-700 font-medium border border-brand-100'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          {/* 셰브론: 학생 목록 펼치기/접기 */}
                          <button
                            onClick={() => toggleClass(classKey)}
                            className="py-1.5 pl-2 pr-0.5 shrink-0 text-slate-400 hover:text-slate-600"
                            aria-label={isClassExpanded ? '접기' : '펼치기'}
                          >
                            {isClassExpanded
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />}
                          </button>
                          {/* 라벨: 학급 선택(반 전체 테이블) + 명단 펼침/접힘 통합. 다시 누르면 선택 해제 + 접힘. */}
                          <button
                            onClick={() => handleClassLabelClick(c.grade, c.classNumber)}
                            className="flex-1 text-left py-1.5 pr-2"
                            title={`${c.grade}학년 ${c.classNumber}반 지원 현황`}
                          >
                            {c.grade}-{c.classNumber}반
                            {isHomeroom && <span className="ml-1 text-brand-500 text-[10px] font-bold">담임</span>}
                          </button>
                        </div>
                        {isClassExpanded && (
                          <ClassStudents
                            grade={c.grade}
                            classNum={c.classNumber}
                            selectedStudent={selectedStudent}
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
        })
      )}
      </div>
    </aside>
  );
}

// ----------------------------------------------------------------
// ClassStudents — 펼친 학급 1개당 한 인스턴스. 각자 useClassRoster 보유.
// ----------------------------------------------------------------
function ClassStudents({
  grade, classNum, selectedStudent, onSelectStudent,
}: { grade: number; classNum: number; selectedStudent: string | null; onSelectStudent: (c: string) => void }) {
  const rosterQ = useClassRoster(grade, classNum);
  const rows = useMemo(
    () => (rosterQ.data ?? []).slice().sort((a, b) => (a.numberInClass ?? 0) - (b.numberInClass ?? 0)),
    [rosterQ.data]
  );
  const codes = useMemo(() => rows.map((r) => r.studentCode), [rows]);
  const picturesQ = useStudentPictures(codes);

  if (rosterQ.isLoading) return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2">불러오는 중...</div>;
  if (rosterQ.isError) return <div className="ml-4 mt-1 text-[11px] text-red-500 px-2">불러올 수 없습니다</div>;
  if (rows.length === 0) return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2">학생 없음</div>;

  return (
    <ul className="ml-4 mt-0.5 space-y-0.5">
      {rows.map((row) => {
        const picture = picturesQ.data?.[row.studentCode] ?? null;
        const isSelected = selectedStudent === row.studentCode;
        return (
          <li key={row.studentCode}>
            <button
              onClick={() => onSelectStudent(row.studentCode)}
              className={`w-full text-left px-2 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${
                isSelected ? 'bg-brand-50 border-brand-200 shadow-sm' : 'border-transparent hover:bg-slate-100 hover:border-slate-200'
              }`}
            >
              <span className="text-[10px] font-mono text-slate-400 w-4 text-right shrink-0">{row.numberInClass ?? ''}</span>
              <div className="shrink-0">
                {picture ? (
                  <img src={picture} alt={row.name} className="w-6 h-6 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-brand-50 flex items-center justify-center border border-slate-200 text-brand-600">
                    <User size={10} aria-hidden />
                  </div>
                )}
              </div>
              <span className={`text-sm truncate flex-1 ${isSelected ? 'text-brand-700 font-semibold' : 'text-slate-700'}`}>{row.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
