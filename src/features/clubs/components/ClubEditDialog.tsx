// 동아리 만들기·고치기. 담당자 = 모든 칸 + 지도교사 · 지도교사 = 장소·정원·소개만(서버 club_save 가 같은 규칙으로 막는다)
import { useEffect, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { saveClub, setAdvisors, type ClubPatch } from '../services/clubService';
import { useClubMutation } from '../hooks/useClubs';
import type { ClubDetail, ClubKind } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 없으면 만들기 */
  club?: ClubDetail | null;
  year: number;
  isManager: boolean;
  onSaved?: (id: string) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ClubEditDialog({ open, onOpenChange, club, year, isManager, onSaved }: Props) {
  const creating = !club;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ClubKind>('regular');
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [advisorIds, setAdvisorIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(club?.name ?? '');
    setKind(club?.kind ?? 'regular');
    setCategory(club?.category ?? '');
    setPlace(club?.place ?? '');
    setCapacity(club?.capacity ? String(club.capacity) : '');
    setDescription(club?.description ?? '');
    setStatus(club?.status === 'inactive' ? 'inactive' : 'active');
    setAdvisorIds(club?.advisors.map((a) => a.resource_id) ?? []);
  }, [open, club]);

  const save = useClubMutation(async () => {
    const cap = capacity.trim() ? Number(capacity) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap <= 0)) throw new Error('정원은 1 이상의 정수로 적어 주세요');
    let patch: ClubPatch;
    if (isManager) {
      patch = { name: name.trim(), kind, category: category.trim() || null, place: place.trim() || null, capacity: cap, description: description.trim() || null };
      if (!creating) patch.status = status;
      else patch.academic_year = year;
    } else {
      patch = { place: place.trim() || null, capacity: cap, description: description.trim() || null };
    }
    if (isManager && !patch.name) throw new Error('동아리 이름을 적어 주세요');
    const saved = await saveClub(club?.id ?? null, patch);
    if (isManager) {
      const ids = advisorIds.filter((v) => UUID.test(v));
      const before = club?.advisors.map((a) => a.resource_id) ?? [];
      if (creating || ids.join() !== before.join()) await setAdvisors(saved.id, ids);
    }
    return saved;
  }, { success: () => (creating ? '동아리를 만들었습니다' : null) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={creating ? Plus : Pencil} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{creating ? `${year}학년도 동아리 만들기` : `${club!.name} 정보`}</DialogTitle>
              <DialogDescription className="text-xs">
                {isManager ? '명단은 만든 뒤 «부원» 탭에서 넣습니다' : '지도교사는 장소·정원·소개를 고칠 수 있습니다'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          className="space-y-4 px-4 py-4 sm:px-6"
          onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onSuccess: (r) => { onOpenChange(false); onSaved?.(r.id); } }); }}
        >
          {isManager && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="club-name">이름</Label>
                  <Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 두잇(코딩)" />
                </div>
                <div className="space-y-1.5">
                  <Label>종류</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as ClubKind)}>
                    <SelectTrigger aria-label="종류"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">정규</SelectItem>
                      <SelectItem value="autonomous">자율</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>지도교사 <span className="text-xs font-normal text-slate-500">(먼저 고른 사람이 대표)</span></Label>
                <SearchableMultiSelect
                  selectedValues={advisorIds}
                  onSelectionChange={setAdvisorIds}
                  filterByTeacher
                  placeholder="선생님 이름 검색"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="club-cat">분야 <span className="text-xs font-normal text-slate-500">(비우면 이름의 괄호 안을 씁니다)</span></Label>
                <Input id="club-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 코딩" />
              </div>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="club-place">활동 장소</Label>
              <Input id="club-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="예: 정보실 · 2-5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-cap">정원</Label>
              <Input id="club-cap" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))} placeholder="명" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-desc">소개</Label>
            <Textarea id="club-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="무엇을 하는 동아리인지 — 학생이 지원할 때 봅니다" />
          </div>
          {isManager && !creating && (
            <div className="space-y-1.5">
              <Label>상태</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'inactive')}>
                <SelectTrigger aria-label="상태"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">활동 중</SelectItem>
                  <SelectItem value="inactive">지금 없음(기록은 남긴다)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)}>닫기</Button>
          <Button
            className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`}
            disabled={save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: (r) => { onOpenChange(false); onSaved?.(r.id); } })}
          >
            <Save className="h-3.5 w-3.5" />{creating ? '만들기' : '저장'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
