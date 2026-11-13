import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import type { DocumentIssue, ClubActivityEntry } from '../types';
import { isClubFormData, seedClubActivities } from '../types';
import { useIssues } from '../hooks/useIssues';
import { MAX_CLUB_ACTIVITIES } from '../hwpx/clubFormFill';

/**
 * 대장 아코디언의 한 동아리 행에서 그 동아리의 활동(날짜·시간·내용)을 작성한다.
 * 발급 모달에서 공통 일시(schedule)를 넣었으면 그 날짜로 시드되지만, 여기서
 * 직접 일시를 추가/삭제할 수도 있다(동아리별로 다른 봉사일 허용). 저장 시 그 동아리만 교체.
 */
export function ClubActivityEditDialog({
  open, issue, clubId, onClose,
}: {
  open: boolean;
  issue: DocumentIssue;
  clubId: string;
  onClose: () => void;
}) {
  const { updateClubActivities } = useIssues(['volunteer_club']);
  const fd = isClubFormData(issue.form_data) ? issue.form_data : null;
  const club = fd?.clubs.find(c => c.club_id === clubId);

  const [rows, setRows] = useState<ClubActivityEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    // 기존 활동이 있으면 그대로, 없으면 공통 일시(schedule)로 시드 → 최소 1행 보장
    const seeded = seedClubActivities(club?.activities ?? [], fd?.schedule ?? []);
    setRows(seeded.length ? seeded : [{ date: '', hours: 1, content: '' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId, issue.id]);

  const update = (i: number, patch: Partial<ClubActivityEntry>) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => setRows(prev => [...prev, { date: '', hours: 1, content: '' }]);
  const remove = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const totalHours = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const atMax = rows.length >= MAX_CLUB_ACTIVITIES;

  const handleSave = async () => {
    if (!fd || !club) { toast.error('동아리 정보를 찾을 수 없습니다'); return; }
    const clean = rows
      .filter(r => r.date)
      .map(r => ({ date: r.date, hours: Number(r.hours) || 0, content: r.content.trim() }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (clean.length === 0) { toast.error('활동 일시(날짜)를 1건 이상 입력하세요'); return; }
    try {
      await updateClubActivities.mutateAsync({ issueId: issue.id, clubId, activities: clean });
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다. 권한을 확인해 주세요.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{club?.club_name ?? '동아리'} · 활동 내용</DialogTitle>
        </DialogHeader>

        <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700 ring-1 ring-inset ring-brand-100">
          명단 {club?.students.length ?? 0}명 · 담당교사 {club?.teacher_name ?? '미지정'}.
          날짜·시간·봉사 내용을 동아리에 맞게 직접 추가/삭제합니다.
        </p>

        <div className="flex items-center justify-between">
          <Label>활동 <span className="text-[11px] font-normal text-slate-400">날짜 · 시간 · 봉사 내용</span></Label>
          <span className="text-[11px] text-slate-400">
            총 <span className="font-medium tabular-nums text-slate-600">{rows.length}</span>건 ·
            인정 <span className="font-medium tabular-nums text-slate-600">{totalHours}</span>시간
          </span>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[8.5rem_4.5rem_1fr_auto] items-center gap-1.5">
              <Input
                type="date"
                value={r.date}
                onChange={e => update(i, { date: e.target.value })}
                aria-label={`활동 ${i + 1} 날짜`}
              />
              <Input
                type="number" min={0} step={1}
                value={r.hours}
                onChange={e => update(i, { hours: e.target.value === '' ? 0 : Number(e.target.value) })}
                aria-label={`활동 ${i + 1} 시간`}
                title="시간"
              />
              <Input
                value={r.content}
                onChange={e => update(i, { content: e.target.value })}
                placeholder="봉사 내용 (간결하게)"
                aria-label={`활동 ${i + 1} 내용`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={rows.length <= 1}
                title="이 활동 삭제"
                aria-label={`활동 ${i + 1} 삭제`}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all',
                  'hover:bg-rose-50 hover:text-rose-600 active:scale-95',
                  'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400',
                )}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>

        <Button
          type="button" variant="outline" size="sm" onClick={add} disabled={atMax}
          className="w-full gap-1.5 border-dashed"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          활동 추가
          {atMax && <span className="text-[11px] text-slate-400">(최대 {MAX_CLUB_ACTIVITIES}건)</span>}
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={updateClubActivities.isPending}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
