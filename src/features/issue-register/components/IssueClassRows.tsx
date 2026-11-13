import { Pencil, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentIssue } from '../types';
import { useIssueAccess } from '../hooks/useIssueAccess';
import { useLedgerScope } from '../hooks/useLedgerScope';
import { type ClassFilter } from '../hwpx/generateVolunteerHwpx';
import { groupByClass } from './IssueLedger';

const iconBtn =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all ' +
  'hover:bg-white hover:shadow-sm active:scale-95 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-300';

/**
 * 반별 봉사 record를 반(학년-반) 단위 하위 행으로 전개한다.
 * 각 행에서 그 반 명단만 수정하거나 그 반 확인서만 출력한다.
 */
export function IssueClassRows({
  issue, colCount, onEditClass, onExport,
}: {
  issue: DocumentIssue;
  colCount: number;
  onEditClass: (issue: DocumentIssue, filter: ClassFilter) => void;
  /** 반별 다운로드 → 미리보기 확인 모달 열기 */
  onExport: (issue: DocumentIssue, filter: ClassFilter) => void;
}) {
  const { canEditClass, isHomeroomOf } = useIssueAccess();
  const { canSeeAll } = useLedgerScope();
  // 표시 범위: 전체 권한이면 모든 반, 아니면 본인 담임 반만
  const groups = groupByClass(issue.students).filter(g => canSeeAll || isHomeroomOf(g.grade, g.cls));

  return (
    <tr className="bg-slate-50/60">
      <td colSpan={colCount} className="px-3 py-2 sm:px-4">
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white/70">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5 text-left">학년·반</th>
                <th className="px-3 py-1.5 text-left">인원</th>
                <th className="px-3 py-1.5 text-left">명단</th>
                <th className="px-3 py-1.5 text-right pr-3 sm:pr-4">관리</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-3 text-slate-400">담임으로 있는 반이 없습니다.</td></tr>
              ) : groups.map(({ grade, cls, students }) => (
                <tr
                  key={`${grade}_${cls}`}
                  className="group/cls border-b border-slate-100 last:border-0 hover:bg-brand-50/30"
                >
                  <td className="w-32 whitespace-nowrap px-3 py-2 font-medium text-slate-600">
                    {grade}학년 {cls}반
                  </td>
                  <td className="px-3 py-2 text-slate-500 tabular-nums">{students.length}명</td>
                  <td className="truncate px-3 py-2 text-slate-500">
                    {students.slice(0, 4).map(s => s.name).join(', ')}
                    {students.length > 4 && ` 외 ${students.length - 4}명`}
                  </td>
                  <td className="px-3 py-2 pr-3 sm:pr-4">
                    <div className="flex items-center justify-end gap-0.5 opacity-80 transition-opacity group-hover/cls:opacity-100">
                      <button
                        type="button"
                        onClick={() => onExport(issue, { grade, cls })}
                        title={`${grade}학년 ${cls}반 확인서 다운로드`}
                        aria-label={`${grade}학년 ${cls}반 확인서 다운로드`}
                        className={cn(iconBtn, 'hover:text-brand-600')}
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      {canEditClass(issue, grade, cls) && (
                        <button
                          type="button"
                          onClick={() => onEditClass(issue, { grade, cls })}
                          title={`${grade}학년 ${cls}반 명단 수정`}
                          aria-label={`${grade}학년 ${cls}반 명단 수정`}
                          className={cn(iconBtn, 'hover:text-slate-700')}
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
