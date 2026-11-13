import { useMemo } from 'react';
import { useRescueRoster } from '../../hooks/useRescueRoster';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { useStudentPictures } from '../../hooks/useStudentPictures';
import { StudentCard } from '../shared/StudentCard';

interface Props {
  grade: number;
  classNum: number;
  onSelectStudent: (studentCode: string) => void;
  selectedStudent: string | null;
}

export function ClassGrid({ grade, classNum, onSelectStudent, selectedStudent }: Props) {
  const rosterQ = useRescueRoster(grade, classNum);
  const defsQ = useTagDefinitions();

  const rows = useMemo(() => {
    return (rosterQ.data ?? []).slice().sort((a, b) => {
      const aCrisis = a.tagKeys.length > 0 || a.status !== 'closed';
      const bCrisis = b.tagKeys.length > 0 || b.status !== 'closed';
      if (aCrisis !== bCrisis) return aCrisis ? -1 : 1;
      return a.numberInClass - b.numberInClass;
    });
  }, [rosterQ.data]);

  const codes = useMemo(() => rows.map((r) => r.studentCode), [rows]);
  const picturesQ = useStudentPictures(codes);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      r.tagKeys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
    });
    return counts;
  }, [rows]);

  if (rosterQ.isLoading || defsQ.isLoading) {
    return <div className="p-4 text-slate-400 text-sm">불러오는 중...</div>;
  }
  if (rosterQ.isError) {
    return <div className="p-4 text-red-600 text-sm">학급 학생을 불러올 수 없습니다.</div>;
  }

  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {(defsQ.data ?? []).length > 0 && (
          <div className="inline-flex items-center gap-2 bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/40 shadow-sm">
            <span className="text-[10px] font-medium text-slate-500 mr-1">태그</span>
            {(defsQ.data ?? []).map((d) => {
              const count = tagCounts.get(d.key) ?? 0;
              return (
                <span
                  key={d.key}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-700"
                  title={d.description ?? d.label}
                >
                  <span className={`w-2 h-2 rounded-full ${d.color}`} aria-hidden />
                  <span>{d.label}</span>
                  <span className={count > 0 ? 'font-semibold text-slate-700' : 'text-slate-300'}>
                    {count}명
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {rows.map((row) => (
          <StudentCard
            key={row.studentCode}
            row={row}
            tagDefinitions={defsQ.data ?? []}
            picture={picturesQ.data?.[row.studentCode] ?? null}
            onClick={() => onSelectStudent(row.studentCode)}
            selected={selectedStudent === row.studentCode}
          />
        ))}
      </div>
    </div>
  );
}
