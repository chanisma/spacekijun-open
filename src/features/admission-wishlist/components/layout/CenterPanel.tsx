import { GraduationCap } from 'lucide-react';
import { WishlistView } from '../WishlistView';
import { ClassWishlistTable } from '../ClassWishlistTable';

interface Props {
  selectedStudent: string | null;
  selectedClass: { grade: number; classNum: number } | null;
  /** admin 이 학생을 대신해 편집 가능한지 (쓰기 허용 + Header 가 안내 배지 표시). */
  canEdit: boolean;
  studentLabel?: string | null;
  onSelectStudent: (code: string) => void;
}

/**
 * 교사/admin 뷰 중앙 패널 라우터.
 * 학생 선택 → WishlistView, 학급 선택 → ClassWishlistTable, 미선택 → 안내.
 */
export function CenterPanel({ selectedStudent, selectedClass, canEdit, studentLabel, onSelectStudent }: Props) {
  if (selectedStudent) {
    return (
      <WishlistView
        key={selectedStudent}
        studentCode={selectedStudent}
        readOnly={!canEdit}
        proxyEditing={false}
        studentLabel={studentLabel}
      />
    );
  }

  if (selectedClass) {
    return (
      <ClassWishlistTable
        key={`${selectedClass.grade}-${selectedClass.classNum}`}
        grade={selectedClass.grade}
        classNum={selectedClass.classNum}
        onSelectStudent={onSelectStudent}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <GraduationCap className="h-10 w-10 text-slate-300 mb-3" aria-hidden />
      <p className="text-sm text-slate-400">
        왼쪽에서 <b>학급</b>을 선택하면 반 전체 지원 현황을, <b>학생</b>을 선택하면 개별 지원 내용을
        {canEdit ? ' 대신 신청·열람' : ' 열람'}할 수 있습니다.
      </p>
    </div>
  );
}
