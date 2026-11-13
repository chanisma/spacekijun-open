import { ClassGrid } from './ClassGrid';
import { StudentDetail } from '../tabs/StudentDetail';
import { CrisisDashboardContent } from '../overview/CrisisDashboardContent';
import { GradeDashboard } from '../overview/GradeDashboard';
import { MyNotesView } from '../overview/MyNotesView';

export type CenterView = 'dashboard' | 'my-notes';

interface Props {
  selectedClass: { grade: number; classNum: number } | null;
  selectedGrade: { grade: number; classNums: number[] } | null;
  selectedStudent: string | null;
  view: CenterView;
  onSelectStudent: (code: string) => void;
}

export function CenterPanel({ selectedClass, selectedGrade, selectedStudent, view, onSelectStudent }: Props) {
  if (selectedStudent) {
    return <StudentDetail studentCode={selectedStudent} />;
  }
  if (selectedClass) {
    return (
      <ClassGrid
        grade={selectedClass.grade}
        classNum={selectedClass.classNum}
        onSelectStudent={onSelectStudent}
        selectedStudent={selectedStudent}
      />
    );
  }
  if (selectedGrade) {
    return (
      <GradeDashboard
        grade={selectedGrade.grade}
        classNums={selectedGrade.classNums}
      />
    );
  }
  if (view === 'my-notes') {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <MyNotesView />
      </div>
    );
  }
  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="flex items-center gap-3 px-6 pt-6 pb-1">
        <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          위기 관리 현황
        </h2>
        <span className="text-xs text-slate-400">(학급을 선택하면 학급 학생 카드로 전환됩니다)</span>
      </div>
      <CrisisDashboardContent />
    </div>
  );
}
