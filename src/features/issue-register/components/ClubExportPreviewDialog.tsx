import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, FileDown } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { DocumentIssue, ParticipantSnapshot, ClubActivityEntry } from '../types';
import { isClubFormData } from '../types';
import { downloadClubHwpx } from '../hwpx/generateClubHwpx';
import { useIssues } from '../hooks/useIssues';

/** ISO 'YYYY-MM-DD' → 'M.D' */
function toMD(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || '?';
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 동아리 확인서 다운로드 전 미리보기.
 * 학생 × 활동일자 매트릭스에서 각 학생의 날짜별 참가 여부(√)를 조정하고,
 * 확인서에서 제외할 학생을 선택한 뒤 그 설정대로 파일을 생성한다(설정은 저장 안 함).
 */
export function ClubExportPreviewDialog({
  open, issue, clubId, onClose,
}: {
  open: boolean;
  issue: DocumentIssue;
  clubId: string;
  onClose: () => void;
}) {
  const { updateClubAttendance } = useIssues(['volunteer_club']);
  const fd = isClubFormData(issue.form_data) ? issue.form_data : null;
  const club = fd?.clubs.find(c => c.club_id === clubId);

  // 활동(날짜순) — 매트릭스 열
  const acts = useMemo<ClubActivityEntry[]>(
    () => [...(club?.activities ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [club],
  );
  // 학생(학년·반·번호순) — 매트릭스 행
  const students = useMemo<ParticipantSnapshot[]>(
    () => [...(club?.students ?? [])].sort((a, b) =>
      (a.grade ?? 0) - (b.grade ?? 0) || (a.class ?? 0) - (b.class ?? 0) || (a.number ?? 0) - (b.number ?? 0)),
    [club],
  );

  // attend[resource_id][activityIndex] = 참가 여부 (기본 전부 참가)
  const [attend, setAttend] = useState<Record<string, boolean[]>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 저장된 출력 설정(attendance/excludedResourceIds)이 있으면 그걸로 초기화, 없으면 전원·전일 참가
    const savedAtt = club?.attendance;
    const init: Record<string, boolean[]> = {};
    for (const s of students) {
      const row = savedAtt?.[s.resource_id];
      init[s.resource_id] = acts.map(a => (row ? row[a.date] !== false : true));
    }
    setAttend(init);
    setExcluded(new Set(club?.excludedResourceIds ?? []));
  }, [open, students, acts, club]);

  const toggleCell = (resId: string, i: number) =>
    setAttend(prev => ({
      ...prev,
      [resId]: (prev[resId] ?? acts.map(() => true)).map((v, idx) => (idx === i ? !v : v)),
    }));

  const toggleExclude = (resId: string) =>
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(resId)) next.delete(resId); else next.add(resId);
      return next;
    });

  // 날짜 열 전체 토글: 그 날짜에 한 명이라도 참가 false면 전원 참가로, 아니면 전원 미참가로
  const toggleColumn = (i: number) =>
    setAttend(prev => {
      const active = students.filter(s => !excluded.has(s.resource_id));
      const allOn = active.every(s => (prev[s.resource_id] ?? [])[i] !== false);
      const next = { ...prev };
      for (const s of active) {
        const row = (next[s.resource_id] ?? acts.map(() => true)).slice();
        row[i] = !allOn;
        next[s.resource_id] = row;
      }
      return next;
    });

  const includedCount = students.length - excluded.size;

  const handleDownload = async () => {
    if (!club) { toast.error('동아리 정보를 찾을 수 없습니다'); return; }
    if (includedCount === 0) { toast.error('확인서에 포함할 학생이 없습니다'); return; }
    // 옵션 구성 — 제외 학생 + 날짜별 참가 맵(resource_id → {dateISO: bool})
    const attendance: Record<string, Record<string, boolean>> = {};
    for (const s of students) {
      if (excluded.has(s.resource_id)) continue;
      const row: Record<string, boolean> = {};
      acts.forEach((a, i) => { row[a.date] = (attend[s.resource_id] ?? [])[i] !== false; });
      attendance[s.resource_id] = row;
    }
    const excludedResourceIds = [...excluded];
    setBusy(true);
    // 1) 출력 설정을 DB에 저장(권한: 작성자/admin/담당교사). 권한이 없으면 이번 다운로드에만 적용.
    let saved = false;
    try {
      await updateClubAttendance.mutateAsync({ issueId: issue.id, clubId, attendance, excludedResourceIds });
      saved = true;
    } catch (e) {
      console.warn('출력 설정 저장 실패(권한 없음일 수 있음):', e);
    }
    // 2) 같은 설정으로 확인서 생성·다운로드
    try {
      await downloadClubHwpx(issue, clubId, { attendance, excludedResourceIds });
      toast.success(saved
        ? '설정을 저장하고 확인서를 내려받았습니다'
        : '확인서를 내려받았습니다 (설정 저장 권한 없음 — 이번 다운로드만 적용)');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : '양식을 생성하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{club?.club_name ?? '동아리'} 확인서 미리보기</DialogTitle>
        </DialogHeader>

        <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700 ring-1 ring-inset ring-brand-100">
          각 학생의 <b>활동일자별 참가 여부</b>(√)를 확인·조정하고, 확인서에서 <b>제외할 학생</b>을 선택하세요.
          이 설정은 저장되지 않고 이번 다운로드에만 적용됩니다.
        </p>

        {acts.length === 0 || students.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
            활동 또는 명단이 없습니다. 먼저 활동 내용을 작성하세요.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200/70">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5 text-center">제외</th>
                  <th className="px-2 py-1.5 text-left">학번</th>
                  <th className="px-2 py-1.5 text-left">이름</th>
                  {acts.map((a, i) => (
                    <th key={`${a.date}_${i}`} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleColumn(i)}
                        title={`${toMD(a.date)} 열 전체 토글`}
                        className="tabular-nums hover:text-brand-600"
                      >
                        {toMD(a.date)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const isOut = excluded.has(s.resource_id);
                  const hakno = `${s.grade ?? ''}${String(s.class ?? 0).padStart(2, '0')}${String(s.number ?? 0).padStart(2, '0')}`;
                  return (
                    <tr
                      key={s.resource_id}
                      className={cn('border-b border-slate-100 last:border-0', isOut ? 'bg-rose-50/40 text-slate-300' : 'hover:bg-brand-50/30')}
                    >
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={isOut}
                          onChange={() => toggleExclude(s.resource_id)}
                          aria-label={`${s.name} 제외`}
                          className="h-4 w-4 cursor-pointer accent-rose-500"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-500">{hakno}</td>
                      <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-600">{s.name}</td>
                      {acts.map((a, i) => {
                        const on = (attend[s.resource_id] ?? [])[i] !== false;
                        return (
                          <td key={`${a.date}_${i}`} className="px-1 py-1 text-center">
                            <button
                              type="button"
                              disabled={isOut}
                              onClick={() => toggleCell(s.resource_id, i)}
                              aria-label={`${s.name} ${toMD(a.date)} 참가`}
                              aria-pressed={on}
                              className={cn(
                                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-all',
                                isOut
                                  ? 'cursor-not-allowed border-slate-100 bg-slate-50'
                                  : on
                                    ? 'border-brand-300 bg-brand-50 text-brand-600 hover:bg-brand-100'
                                    : 'border-slate-200 bg-white text-transparent hover:border-slate-300',
                              )}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="items-center">
          <span className="mr-auto text-xs text-slate-400">
            포함 <span className="font-medium tabular-nums text-slate-600">{includedCount}</span>명
            {excluded.size > 0 && <> · 제외 <span className="font-medium tabular-nums text-rose-500">{excluded.size}</span>명</>}
          </span>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleDownload} disabled={busy || includedCount === 0} className="gap-1.5">
            <FileDown className="h-4 w-4" strokeWidth={2} />
            확인서 다운로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
