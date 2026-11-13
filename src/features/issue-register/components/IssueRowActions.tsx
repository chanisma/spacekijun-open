import { Pencil, Trash2, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentIssue } from '../types';
import { useIssueAccess } from '../hooks/useIssueAccess';

const iconBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all ' +
  'hover:bg-white hover:shadow-sm active:scale-95 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-300';

export function IssueRowActions({
  issue, onEdit, onDelete, onExport,
}: {
  issue: DocumentIssue;
  onEdit: (i: DocumentIssue) => void;
  onDelete: (id: string) => void;
  /** 다운로드 버튼 클릭 → 미리보기 확인 모달 열기 */
  onExport?: (i: DocumentIssue) => void;
}) {
  const { canEdit } = useIssueAccess();
  const editable = canEdit(issue);
  // 개인·단체(반)·동아리 봉사는 HWPX 확인서 다운로드 대상
  const downloadable = !!onExport
    && (issue.doc_type === 'volunteer_class' || issue.doc_type === 'volunteer_club' || issue.doc_type === 'volunteer_personal')
    && issue.students.length > 0;

  return (
    <div className="flex items-center gap-0.5 opacity-80 transition-opacity group-hover:opacity-100">
      {downloadable && (
        <button
          type="button"
          onClick={() => onExport!(issue)}
          title="HWPX 확인서 다운로드"
          aria-label="HWPX 확인서 다운로드"
          className={cn(iconBtn, 'hover:text-brand-600')}
        >
          <FileDown className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
      {editable && (
        <>
          <button
            type="button"
            onClick={() => onEdit(issue)}
            title="수정"
            aria-label="수정"
            className={cn(iconBtn, 'hover:text-slate-700')}
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(issue.id)}
            title="삭제"
            aria-label="삭제"
            className={cn(iconBtn, 'hover:bg-rose-50 hover:text-rose-600')}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </>
      )}
    </div>
  );
}
