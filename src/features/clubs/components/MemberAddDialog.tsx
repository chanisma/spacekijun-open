// 부원 넣기. 지도교사·담당자 = 바로 확정(미리보기 → 확정) · 학생(부원) = 학번으로 제안 → 지도교사 확정 대기
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Send, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { requestMembers, setMembers } from '../services/clubService';
import { useClubMutation } from '../hooks/useClubs';
import { parseStudentNumbers } from '../model/clubDisplay';
import { personLabel, type ClubDetail, type MemberPreview } from '../types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function MemberAddDialog({ open, onOpenChange, club }: { open: boolean; onOpenChange: (o: boolean) => void; club: ClubDetail }) {
  const asTeacher = club.can_manage;
  const [picked, setPicked] = useState<string[]>([]);
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<MemberPreview | null>(null);

  useEffect(() => { if (open) { setPicked([]); setRaw(''); setNote(''); setPreview(null); } }, [open]);
  useEffect(() => { setPreview(null); }, [picked, raw]);

  const refs = () => (asTeacher
    ? picked.filter((v) => UUID.test(v)).map((id) => ({ resource_id: id }))
    : parseStudentNumbers(raw).ok);

  const check = useClubMutation(async () => setMembers(club.id, refs(), 'add', true));
  const commit = useClubMutation(async () => setMembers(club.id, refs(), 'add', false),
    { success: (r) => `${r.added ?? 0}명을 명단에 넣었습니다` });
  const propose = useClubMutation(async () => {
    const { ok, bad } = parseStudentNumbers(raw);
    if (bad.length) throw new Error(`학번 모양이 아닙니다: ${bad.join(', ')} — 예: 2-5-17 또는 20517`);
    if (!ok.length) throw new Error('제안할 학생의 학번을 적어 주세요');
    return requestMembers(club.id, ok, note.trim() || null);
  }, { success: (r) => `${r.requested}명을 제안했습니다 — 지도교사가 확정하면 명단에 들어갑니다` });

  const count = asTeacher ? picked.filter((v) => UUID.test(v)).length : parseStudentNumbers(raw).ok.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={UserPlus} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{club.name} {asTeacher ? '부원 넣기' : '부원 제안'}</DialogTitle>
              <DialogDescription className="text-xs">
                {asTeacher
                  ? '고른 학생을 확인한 뒤 명단에 넣습니다. 엑셀 명단은 붙여넣기로 한 번에.'
                  : '학번을 적어 보내면 지도교사가 확정합니다.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          {asTeacher ? (
            <div className="space-y-1.5">
              <Label>학생</Label>
              <SearchableMultiSelect
                selectedValues={picked}
                onSelectionChange={setPicked}
                filterByStudent
                placeholder="이름 검색 · 명단 붙여넣기"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="club-req-raw">학번 <span className="text-xs font-normal text-slate-500">(한 줄에 하나 · 2-5-17 또는 20517)</span></Label>
                <Textarea id="club-req-raw" rows={4} value={raw} onChange={(e) => setRaw(e.target.value)} className="text-base sm:text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="club-req-note">지도교사에게 남길 말</Label>
                <Input id="club-req-note" value={note} onChange={(e) => setNote(e.target.value)} className="text-base sm:text-sm" placeholder="예: 면접 합격자" />
              </div>
            </>
          )}

          {preview && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <SectionLabel icon={Check}>확인</SectionLabel>
              {preview.errors && preview.errors.length > 0 && (
                <ul className="space-y-1 text-xs text-rose-700">
                  {preview.errors.map((e) => <li key={e} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span className="break-all">{e}</span></li>)}
                </ul>
              )}
              {preview.add && preview.add.length > 0 && (
                <p className="text-xs text-slate-700">새로 넣을 학생 {preview.add.length}명 — {preview.add.map((p) => personLabel(p)).join(', ')}</p>
              )}
              {(preview.unchanged ?? 0) > 0 && <p className="text-xs text-slate-500">이미 부원 {preview.unchanged}명은 그대로</p>}
            </div>
          )}
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          {asTeacher ? (
            !preview?.ok ? (
              <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={count === 0 || check.isPending}
                onClick={() => check.mutate(undefined, { onSuccess: setPreview })}>
                <Check className="h-3.5 w-3.5" />{count}명 확인
              </Button>
            ) : (
              <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={commit.isPending || !preview.add?.length}
                onClick={() => commit.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
                <UserPlus className="h-3.5 w-3.5" />{preview.add?.length ?? 0}명 넣기
              </Button>
            )
          ) : (
            <Button className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`} disabled={count === 0 || propose.isPending}
              onClick={() => propose.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
              <Send className="h-3.5 w-3.5" />{count}명 제안
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
