import { Pencil, FileDown, Ban, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentIssue } from '../types';
import { useIssueAccess } from '../hooks/useIssueAccess';
import type { PersonalBatch } from './IssueLedger';

const iconBtn =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all ' +
  'hover:bg-white hover:shadow-sm active:scale-95 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-300';

/**
 * 개인봉사 배치(같은 제출 묶음)를 학생별 하위 행으로 전개한다.
 * 각 행은 독립된 document_issue(=독립 발급번호)이므로 개별 다운로드·수정·삭제(권한자만)를 제공.
 */
export function IssuePersonalRows({
  batch, colCount, onEdit, onExport, onCancel,
}: {
  batch: PersonalBatch;
  colCount: number;
  onEdit: (issue: DocumentIssue) => void;
  onExport: (issue: DocumentIssue) => void;
  /** 이 학생 건만 개별 삭제(취소) */
  onCancel: (id: string) => void;
}) {
  const { canEdit } = useIssueAccess();

  return (
    <tr className="bg-slate-50/60">
      <td colSpan={colCount} className="px-3 py-2 sm:px-4">
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white/70">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5 text-left">발급번호</th>
                <th className="px-3 py-1.5 text-left">학년·반·번호</th>
                <th className="px-3 py-1.5 text-left">이름</th>
                <th className="px-3 py-1.5 text-right pr-3 sm:pr-4">관리</th>
              </tr>
            </thead>
            <tbody>
              {batch.issues.map(issue => {
                // 배치 안에서 이 학생 건만 취소된 경우 — 번호는 그대로 보이고 나머지는 숨긴다.
                if (issue.status === 'cancelled') {
                  return (
                    <tr key={issue.id} className="border-b border-slate-100 last:border-0 opacity-60">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold tabular-nums text-slate-400 line-through decoration-slate-400">
                        {issue.issue_no}
                      </td>
                      <td colSpan={3} className="px-3 py-2 pr-3 sm:pr-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <Ban className="h-3 w-3" strokeWidth={1.75} />
                          삭제된 발급
                        </span>
                      </td>
                    </tr>
                  );
                }
                const s = issue.students[0];
                return (
                  <tr
                    key={issue.id}
                    className="group/personal border-b border-slate-100 last:border-0 hover:bg-brand-50/30"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold tabular-nums text-brand-700">
                      {issue.issue_no}
                    </td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums">
                      {s?.grade != null && s?.class != null
                        ? `${s.grade}학년 ${s.class}반${s.number != null ? ` ${s.number}번` : ''}`
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-600">{s?.name ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 pr-3 sm:pr-4">
                      <div className="flex items-center justify-end gap-0.5 opacity-80 transition-opacity group-hover/personal:opacity-100">
                        <button
                          type="button"
                          onClick={() => onExport(issue)}
                          title="확인서 다운로드"
                          aria-label={`${s?.name ?? ''} 확인서 다운로드`}
                          className={cn(iconBtn, 'hover:text-brand-600')}
                        >
                          <FileDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        {canEdit(issue) && (
                          <>
                            <button
                              type="button"
                              onClick={() => onEdit(issue)}
                              title="수정"
                              aria-label={`${s?.name ?? ''} 발급 내역 수정`}
                              className={cn(iconBtn, 'hover:text-slate-700')}
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancel(issue.id)}
                              title="삭제"
                              aria-label={`${s?.name ?? ''} 발급 내역 삭제`}
                              className={cn(iconBtn, 'hover:bg-rose-50 hover:text-rose-600')}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
