import { Pencil, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentIssue } from '../types';
import { isClubFormData } from '../types';
import { useIssueAccess } from '../hooks/useIssueAccess';
import { useLedgerScope } from '../hooks/useLedgerScope';

const iconBtn =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all ' +
  'hover:bg-white hover:shadow-sm active:scale-95 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-300';

/**
 * 동아리 봉사 record를 동아리 단위 하위 행으로 전개한다(단체의 IssueClassRows와 동형).
 * 각 행에서 그 동아리의 활동 내용을 작성하거나 그 동아리 확인서만 출력한다.
 */
export function IssueClubRows({
  issue, colCount, onEditClub, onExportClub,
}: {
  issue: DocumentIssue;
  colCount: number;
  /** 활동 내용 작성 모달 열기 */
  onEditClub: (issue: DocumentIssue, clubId: string) => void;
  /** 그 동아리 확인서 다운로드 */
  onExportClub: (issue: DocumentIssue, clubId: string) => void;
}) {
  const { canEditClub, isClubAdvisor } = useIssueAccess();
  const { canSeeAll } = useLedgerScope();
  if (!isClubFormData(issue.form_data)) return null;
  const allClubs = issue.form_data.clubs;
  // 표시 범위: 전체 권한이면 모든 동아리, 아니면 본인 담당 동아리만
  const clubs = allClubs.filter(c => canSeeAll || isClubAdvisor(c.teacher_name));

  return (
    <tr className="bg-slate-50/60">
      <td colSpan={colCount} className="px-3 py-2 sm:px-4">
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white/70">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5 text-left">동아리</th>
                <th className="px-3 py-1.5 text-left">담당교사</th>
                <th className="px-3 py-1.5 text-left">인원</th>
                <th className="px-3 py-1.5 text-left">활동</th>
                <th className="px-3 py-1.5 text-right pr-3 sm:pr-4">관리</th>
              </tr>
            </thead>
            <tbody>
              {clubs.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-3 text-slate-400">
                  {allClubs.length === 0
                    ? '동아리가 없습니다. 발급 내역 수정에서 동아리를 추가하세요.'
                    : '담당으로 있는 동아리가 없습니다.'}
                </td></tr>
              ) : clubs.map(club => {
                const ready = club.activities.length > 0 && club.students.length > 0;
                const editable = canEditClub(issue, club.club_id);
                return (
                  <tr
                    key={club.club_id}
                    className="group/club border-b border-slate-100 last:border-0 hover:bg-brand-50/30"
                  >
                    <td className="w-40 whitespace-nowrap px-3 py-2 font-medium text-slate-600">
                      {club.club_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {club.teacher_name ?? '담당 미지정'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500 tabular-nums">
                      {club.students.length}명
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {club.activities.length > 0
                        ? <span className="tabular-nums">활동 {club.activities.length}건 · 인정 {club.activities.reduce((s, a) => s + (a.hours || 0), 0)}시간</span>
                        : <span className="text-amber-600">활동 내용 미작성</span>}
                    </td>
                    <td className="px-3 py-2 pr-3 sm:pr-4">
                      <div className="flex items-center justify-end gap-0.5 opacity-80 transition-opacity group-hover/club:opacity-100">
                        <button
                          type="button"
                          onClick={() => ready && onExportClub(issue, club.club_id)}
                          disabled={!ready}
                          title={ready ? `${club.club_name} 확인서 다운로드` : '활동 내용을 먼저 작성하세요'}
                          aria-label={`${club.club_name} 확인서 다운로드`}
                          className={cn(iconBtn, 'hover:text-brand-600',
                            !ready && 'cursor-not-allowed opacity-30 hover:bg-transparent hover:text-slate-400')}
                        >
                          <FileDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        {editable && (
                          <button
                            type="button"
                            onClick={() => onEditClub(issue, club.club_id)}
                            title={`${club.club_name} 활동 내용 작성`}
                            aria-label={`${club.club_name} 활동 내용 작성`}
                            className={cn(iconBtn, 'hover:text-slate-700')}
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
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
