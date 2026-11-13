import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, User } from 'lucide-react';
import { useRescueAccess } from '../../hooks/useRescueAccess';
import { useCrisisDashboard, useRescueRoster } from '../../hooks/useRescueRoster';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { useStudentPictures } from '../../hooks/useStudentPictures';
import type { RescueTagDefinition } from '../../types/rescueTag';

interface Props {
  selectedClass: { grade: number; classNum: number } | null;
  selectedGrade: { grade: number; classNums: number[] } | null;
  selectedStudent: string | null;
  onSelectClass: (grade: number, classNum: number) => void;
  onSelectGrade: (grade: number, classNums: number[]) => void;
  onSelectStudent: (studentCode: string) => void;
}

export function LeftPanel({ selectedClass, selectedGrade, selectedStudent, onSelectClass, onSelectGrade, onSelectStudent }: Props) {
  const access = useRescueAccess();
  const crisis = useCrisisDashboard();
  const defsQ = useTagDefinitions();
  const defByKey = useMemo(
    () => new Map((defsQ.data ?? []).map((d) => [d.key, d])),
    [defsQ.data]
  );
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

  const grouped = useMemo(() => {
    const byGrade = new Map<number, Array<{ grade: number; classNumber: number }>>();
    access.visibleClasses.forEach((c) => {
      if (!byGrade.has(c.grade)) byGrade.set(c.grade, []);
      byGrade.get(c.grade)!.push(c);
    });
    return Array.from(byGrade.entries()).sort(([a], [b]) => a - b);
  }, [access.visibleClasses]);

  const crisisStudents = (crisis.data ?? [])
    .filter((s) => s.status === 'open' || s.status === 'monitoring')
    .sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (b.status === 'open' && a.status !== 'open') return 1;
      const aT = a.lastNoteAt ? new Date(a.lastNoteAt).getTime() : 0;
      const bT = b.lastNoteAt ? new Date(b.lastNoteAt).getTime() : 0;
      return bT - aT || b.tagKeys.length - a.tagKeys.length;
    })
    .slice(0, 20);

  const toggleGrade = (g: number) => {
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const handleClassClick = (grade: number, classNumber: number) => {
    const key = `${grade}-${classNumber}`;
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    onSelectClass(grade, classNumber);
  };

  return (
    <aside className="w-72 h-full border-r border-slate-200/60 bg-gray-50 overflow-y-auto custom-scrollbar shrink-0 min-w-[18rem] p-3 space-y-3">
      {/* Crisis students section */}
      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-3">
        <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" aria-hidden />
          위기 학생
        </h2>
        {crisisStudents.length === 0 ? (
          <div className="text-xs text-slate-400 py-2 px-1">없음</div>
        ) : (
          <ul className="space-y-0.5">
            {crisisStudents.map((s) => {
              const tagTitle = s.tagKeys
                .map((k) => defByKey.get(k)?.label ?? k)
                .join(', ');
              return (
                <li key={s.studentCode}>
                  <button
                    onClick={() => onSelectStudent(s.studentCode)}
                    title={tagTitle || undefined}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-2 border-l-2 ${
                      s.status === 'open' ? 'border-red-500' : 'border-amber-500'
                    } ${
                      selectedStudent === s.studentCode
                        ? 'bg-brand-50/80 shadow-sm'
                        : 'bg-white/40 hover:bg-white/80 hover:shadow-sm'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        s.status === 'open'
                          ? 'bg-red-50 text-red-600 border border-red-100'
                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}
                    >
                      {s.status === 'open' ? '주의' : '관찰'}
                    </span>
                    <span className="font-semibold text-[12.5px] text-slate-800 truncate shrink-0">{s.name}</span>
                    <span className="text-[10.5px] text-slate-500 font-mono shrink-0">
                      {s.grade}-{s.classNum}
                      <span className="text-slate-400"> #{s.numberInClass}</span>
                    </span>
                    <span className="flex-1" />
                    <span className="flex items-center flex-wrap gap-0.5 shrink-0 justify-end max-w-[40%]">
                      {s.tagKeys.map((k) => {
                        const def = defByKey.get(k);
                        return def ? (
                          <span
                            key={k}
                            className={`w-1.5 h-1.5 rounded-full ${def.color}`}
                            aria-label={def.label}
                          />
                        ) : null;
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Class tree section */}
      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-3">
        <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          학급
        </h2>
        {grouped.map(([grade, classes]) => {
          const expanded = expandedGrades.has(grade);
          const gradeClassNums = classes.map((c) => c.classNumber);
          const isGradeSelected = selectedGrade?.grade === grade;
          return (
            <div key={grade} className="mb-1">
              <div
                className={`w-full flex items-center gap-1 text-sm rounded-lg transition-all ${
                  isGradeSelected
                    ? 'bg-brand-50/80 text-brand-700 font-medium shadow-sm border border-brand-100'
                    : 'text-slate-700 font-medium hover:bg-white/60'
                }`}
              >
                <button
                  onClick={() => toggleGrade(grade)}
                  className="py-1.5 pl-2 pr-0.5 shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={expanded ? '접기' : '펼치기'}
                >
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => onSelectGrade(grade, gradeClassNums)}
                  className="flex-1 text-left py-1.5 pr-2"
                  title={`${grade}학년 대시보드`}
                >
                  {grade}학년
                </button>
              </div>
              {expanded && (
                <ul className="ml-4 mt-0.5 space-y-0.5">
                  {classes.map((c) => {
                    const classKey = `${c.grade}-${c.classNumber}`;
                    const isSelected = selectedClass?.grade === c.grade && selectedClass?.classNum === c.classNumber;
                    const isClassExpanded = expandedClasses.has(classKey);
                    const isHomeroom =
                      access.homeroomClass?.grade === c.grade &&
                      access.homeroomClass?.classNumber === c.classNumber;
                    return (
                      <li key={c.classNumber}>
                        <button
                          onClick={() => handleClassClick(c.grade, c.classNumber)}
                          className={`w-full text-left text-sm py-1.5 px-2 rounded-lg transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-brand-50/80 text-brand-700 font-medium shadow-sm border border-brand-100'
                              : 'text-slate-600 hover:bg-white/60 hover:text-slate-800'
                          }`}
                        >
                          {isClassExpanded
                            ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                          }
                          <span>{c.grade}-{c.classNumber}반</span>
                          {isHomeroom && <span className="ml-1 text-brand-500 text-[10px] font-bold">담임</span>}
                        </button>
                        {isClassExpanded && (
                          <ClassStudentList
                            grade={c.grade}
                            classNum={c.classNumber}
                            selectedStudent={selectedStudent}
                            defByKey={defByKey}
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
    </aside>
  );
}

// --------------------------------------------
// ClassStudentList — sub-component, one per expanded class.
// Each instance owns its own useRescueRoster hook (isolated by class).
// --------------------------------------------

interface ClassStudentListProps {
  grade: number;
  classNum: number;
  selectedStudent: string | null;
  defByKey: Map<string, RescueTagDefinition>;
  onSelectStudent: (code: string) => void;
}

function ClassStudentList({ grade, classNum, selectedStudent, defByKey, onSelectStudent }: ClassStudentListProps) {
  const rosterQ = useRescueRoster(grade, classNum);
  const rows = useMemo(() => {
    return (rosterQ.data ?? []).slice().sort((a, b) => a.numberInClass - b.numberInClass);
  }, [rosterQ.data]);

  const codes = useMemo(() => rows.map((r) => r.studentCode), [rows]);
  const picturesQ = useStudentPictures(codes);

  if (rosterQ.isLoading) {
    return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2">불러오는 중...</div>;
  }
  if (rosterQ.isError) {
    return <div className="ml-4 mt-1 text-[11px] text-red-500 px-2">불러올 수 없습니다</div>;
  }
  if (rows.length === 0) {
    return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2">학생 없음</div>;
  }

  return (
    <ul className="ml-4 mt-0.5 space-y-0.5">
      {rows.map((row) => {
        const picture = picturesQ.data?.[row.studentCode] ?? null;
        const isSelected = selectedStudent === row.studentCode;
        const tagTitle = row.tagKeys.map((k) => defByKey.get(k)?.label ?? k).join(', ');

        return (
          <li key={row.studentCode}>
            <button
              onClick={() => onSelectStudent(row.studentCode)}
              title={tagTitle || undefined}
              className={`w-full text-left px-2 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-brand-50/80 shadow-sm border border-brand-100'
                  : 'hover:bg-white/60'
              }`}
            >
              <span className="text-[10px] font-mono text-slate-400 w-4 text-right shrink-0">{row.numberInClass}</span>
              <div className="shrink-0">
                {picture ? (
                  <img
                    src={picture}
                    alt={row.name}
                    className="w-5 h-5 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
                    <User size={10} aria-hidden />
                  </div>
                )}
              </div>
              <span className="text-[12px] text-slate-700 truncate flex-1">{row.name}</span>
              <span className="flex items-center flex-wrap gap-0.5 shrink-0 justify-end max-w-[40%]">
                {row.tagKeys.map((k) => {
                  const def = defByKey.get(k);
                  return def ? (
                    <span
                      key={k}
                      className={`w-1.5 h-1.5 rounded-full ${def.color}`}
                      aria-label={def.label}
                    />
                  ) : null;
                })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
