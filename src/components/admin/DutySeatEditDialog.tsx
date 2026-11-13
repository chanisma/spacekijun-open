// ========================================
// 업무분장 자리 편집 다이얼로그
// 자리(이름·부서·종류·업무 영역) + 담당자(사람·정/부·기간)
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Trash2, UserRound, ListTree } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_DESTRUCTIVE_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import {
  DUTY_SEAT_KIND_LABEL,
  DUTY_SEAT_KIND_ORDER,
  areasToText,
  parseAreasText,
  type DutySeat,
  type DutySeatKind,
} from '@/lib/dutySeats';
import type { DutySeatDraft } from '@/hooks/useDutySeats';

const NO_DEPT = '__none__';

type HolderDraft = DutySeatDraft['holders'][number] & { key: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYear: number;
  seat: DutySeat | null; // null = 새 자리
  departments: { id: string; name: string }[];
  nextSortOrder: number;
  saving: boolean;
  onSave: (draft: DutySeatDraft) => void;
  onDelete?: (seat: DutySeat) => void;
}

let holderSeq = 0;
const newKey = () => `h${++holderSeq}`;

export function DutySeatEditDialog({
  open,
  onOpenChange,
  academicYear,
  seat,
  departments,
  nextSortOrder,
  saving,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(NO_DEPT);
  const [kind, setKind] = useState<DutySeatKind>('duty');
  const [areasText, setAreasText] = useState('');
  const [holders, setHolders] = useState<HolderDraft[]>([]);

  // 담당자 후보 = 교사·직원. 값은 resource id(이름은 동명이인에서 모호하다)
  const { items: people } = useResourceSelect({ resourceType: ['teacher', 'staff'] });
  const peopleById = useMemo(() => new Map(people.map((p) => [p.value, p.label])), [people]);

  useEffect(() => {
    if (!open) return;
    setName(seat?.name ?? '');
    setDepartmentId(seat?.department_id ?? NO_DEPT);
    setKind(seat?.kind ?? 'duty');
    setAreasText(areasToText(seat?.areas ?? []));
    setHolders(
      (seat?.holders ?? []).map((h) => ({
        key: newKey(),
        id: h.id,
        resource_id: h.resource_id,
        holder_name: h.holder_name,
        role: h.role,
        start_date: h.start_date,
        end_date: h.end_date,
        note: h.note,
      })),
    );
  }, [open, seat]);

  const updateHolder = (key: string, patch: Partial<HolderDraft>) =>
    setHolders((prev) => prev.map((h) => (h.key === key ? { ...h, ...patch } : h)));

  const invalidHolder = holders.find(
    (h) => !h.holder_name.trim() || (h.start_date && h.end_date && h.start_date > h.end_date),
  );
  const canSave = name.trim().length > 0 && !invalidHolder && !saving;

  const handleSave = () => {
    onSave({
      id: seat?.id,
      academic_year: academicYear,
      name: name.trim(),
      department_id: departmentId === NO_DEPT ? null : departmentId,
      kind,
      areas: parseAreasText(areasText),
      sort_order: seat?.sort_order ?? nextSortOrder,
      note: seat?.note ?? null,
      holders: holders.map(({ key: _key, ...rest }) => rest),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 담당자 선택기가 DialogContent 안으로 포털되므로 overflow 는 안쪽 본문에만(잘림 방지) */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3">
            <TitleIconChip icon={Briefcase} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">
                {seat ? seat.name : '새 분장 자리'}
              </DialogTitle>
              <DialogDescription className="text-xs">{academicYear}학년도 업무분장</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="seat-name" className="text-xs">자리 이름</Label>
              <Input id="seat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 고사·성적처리" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">부서</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger aria-label="부서"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEPT}>부서 없음</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종류</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DutySeatKind)}>
                <SelectTrigger aria-label="종류"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DUTY_SEAT_KIND_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>{DUTY_SEAT_KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <section className="space-y-2">
            <SectionLabel
              icon={UserRound}
              trailing={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-blue-600"
                  onClick={() =>
                    setHolders((prev) => [
                      ...prev,
                      { key: newKey(), resource_id: null, holder_name: '', role: prev.length === 0 ? 'primary' : 'co', start_date: null, end_date: null, note: null },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  담당자 추가
                </Button>
              }
            >
              담당자
            </SectionLabel>
            {holders.length === 0 && (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-slate-400">
                아직 담당자가 없습니다(공석).
              </p>
            )}
            {holders.map((h) => (
              <div key={h.key} className="grid gap-2 rounded-lg border bg-slate-50/60 p-2.5 sm:grid-cols-[1fr_96px_132px_132px_auto] sm:items-center">
                <div className="min-w-0">
                  {h.resource_id || !h.holder_name ? (
                    <SearchableSelect
                      items={people}
                      selectedValue={h.resource_id ?? undefined}
                      onValueChange={(value) =>
                        updateHolder(h.key, { resource_id: value ?? null, holder_name: value ? peopleById.get(value) ?? '' : '' })
                      }
                      placeholder="교직원 선택"
                      searchPlaceholder="이름으로 찾기"
                      pickerTitle="담당자"
                    />
                  ) : (
                    <div className="flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-sm">
                      <span className="truncate" title={h.holder_name}>{h.holder_name}</span>
                      <span className="shrink-0 rounded bg-rose-100 px-1.5 text-[10px] text-rose-700">미연결</span>
                    </div>
                  )}
                </div>
                <Select value={h.role} onValueChange={(v) => updateHolder(h.key, { role: v as 'primary' | 'co' })}>
                  <SelectTrigger className="h-9 text-xs" aria-label="정/부"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">정</SelectItem>
                    <SelectItem value="co">부(공동)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  aria-label="시작일"
                  value={h.start_date ?? ''}
                  onChange={(e) => updateHolder(h.key, { start_date: e.target.value || null })}
                  className="h-9 text-xs"
                />
                <Input
                  type="date"
                  aria-label="종료일"
                  value={h.end_date ?? ''}
                  onChange={(e) => updateHolder(h.key, { end_date: e.target.value || null })}
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-slate-400 hover:text-rose-600"
                  aria-label="담당자 빼기"
                  onClick={() => setHolders((prev) => prev.filter((x) => x.key !== h.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-slate-400">
              기간을 비우면 학년도 내내 맡은 것으로 봅니다. 학기 중에 바뀌면 사람을 지우지 말고 종료일을 넣은 뒤
              새 담당자를 추가하세요 — 누가 언제 맡았는지가 남습니다.
            </p>
          </section>

          <section className="space-y-2">
            <SectionLabel icon={ListTree}>맡은 업무 영역</SectionLabel>
            <Textarea
              value={areasText}
              onChange={(e) => setAreasText(e.target.value)}
              rows={5}
              placeholder={'한 줄에 하나 · "영역 | 에듀파인 단위과제"\n예: 학업성적관리·학생평가 | 학업성적평가관리'}
              className="font-mono text-xs"
            />
          </section>
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          {seat && onDelete && (
            <Button
              type="button"
              variant="ghost"
              className={`${FOOTER_BUTTON_CLASS} ${FOOTER_DESTRUCTIVE_CLASS} mr-auto`}
              onClick={() => onDelete(seat)}
              disabled={saving}
            >
              <Trash2 className="h-3.5 w-3.5" />
              자리 삭제
            </Button>
          )}
          <Button type="button" variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" className="h-8 bg-blue-600 px-4 text-xs hover:bg-blue-700" onClick={handleSave} disabled={!canSave}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
