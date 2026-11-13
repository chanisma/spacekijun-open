import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableMultiSelect, type SearchableMultiSelectItem } from '@/components/ui/searchable-multi-select';
import type { ClubArea, VolunteerScope, ClubScheduleEntry } from '../types';
import { isClubActive, type Club } from '../hooks/useClubs';
import { ClubScheduleField } from './ClubScheduleField';

const AREAS: ClubArea[] = ['자율자치', '동아리', '진로'];
const SCOPES: VolunteerScope[] = ['정규교육과정 내', '정규교육과정 외'];
const ALL_CLUBS = '__ALL_CLUBS__';   // "모든 동아리" 센티넬 (선택 시 전체 토글)

export interface ClubShared {
  scope: VolunteerScope;
  area: ClubArea;
  org: string;
  orgTel: string;
  place: string;
}

/**
 * 동아리 봉사 발급 모달의 동아리 전용 작성란.
 * 동아리는 SearchableMultiSelect로 검색·다중 선택하며 "모든 동아리"로 전체 선택 가능.
 * 활동 내용(날짜·시간·내용)은 여기서 입력하지 않고 발급 후 대장의 각 동아리 행에서 작성한다.
 */
export function ClubFormFields({
  clubs, selectedClubs, onSelectedClubsChange, shared, onSharedChange, schedule, onScheduleChange,
}: {
  clubs: Club[];
  selectedClubs: string[];
  onSelectedClubsChange: (ids: string[]) => void;
  shared: ClubShared;
  onSharedChange: (patch: Partial<ClubShared>) => void;
  schedule: ClubScheduleEntry[];
  onScheduleChange: (v: ClubScheduleEntry[]) => void;
}) {
  const items = useMemo<SearchableMultiSelectItem[]>(() => [
    { value: ALL_CLUBS, label: '＋ 모든 동아리 선택' } as SearchableMultiSelectItem,
    ...clubs.map(c => ({
      value: c.id,
      label: isClubActive(c) ? c.name : `${c.name} (현재 없음)`,
      description: isClubActive(c)
        ? `${c.teacher_name ?? '담당 미지정'} · ${c.student_count}명`
        : `지금은 없는 동아리(명칭 변경·교체) · ${c.teacher_name ?? '담당 미지정'} · ${c.student_count}명`,
    } as SearchableMultiSelectItem)),
  ], [clubs]);

  // "모든 동아리" 클릭 → 전체 선택/해제 토글, 그 외엔 그대로 반영
  const handleChange = (values: string[]) => {
    if (values.includes(ALL_CLUBS)) {
      // 모든 동아리 = 지금 있는 동아리만(없어진 동아리는 하나씩 골라야 들어간다)
      const allIds = clubs.filter(isClubActive).map(c => c.id);
      const allSelected = allIds.length > 0 && allIds.every(id => selectedClubs.includes(id));
      onSelectedClubsChange(allSelected ? [] : allIds);
    } else {
      onSelectedClubsChange(values);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>동아리 <span className="text-[11px] font-normal text-slate-400">검색·다중 선택</span></Label>
        <SearchableMultiSelect
          items={items}
          selectedValues={selectedClubs}
          onSelectionChange={handleChange}
          placeholder="동아리 검색·선택"
          searchPlaceholder="동아리명 검색 (예: 방송부)"
          emptyText="동아리가 없습니다"
          maxSelectedDisplay={4}
        />
        {selectedClubs.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">선택 {selectedClubs.length}개 동아리</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>봉사 주관 영역</Label>
          <RadioGroup
            value={shared.area}
            onValueChange={v => onSharedChange({ area: v as ClubArea })}
            className="mt-1 flex gap-3"
          >
            {AREAS.map(a => (
              <div key={a} className="flex items-center gap-1">
                <RadioGroupItem value={a} id={`club-area-${a}`} />
                <Label htmlFor={`club-area-${a}`} className="font-normal">{a}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div>
          <Label>단체봉사 구분</Label>
          <RadioGroup
            value={shared.scope}
            onValueChange={v => onSharedChange({ scope: v as VolunteerScope })}
            className="mt-1 flex flex-col gap-1"
          >
            {SCOPES.map(s => (
              <div key={s} className="flex items-center gap-1">
                <RadioGroupItem value={s} id={`club-scope-${s}`} />
                <Label htmlFor={`club-scope-${s}`} className="font-normal">{s}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><Label>봉사활동 기관</Label>
          <Input value={shared.org} onChange={e => onSharedChange({ org: e.target.value })} /></div>
        <div><Label>기관 연락처</Label>
          <Input value={shared.orgTel} onChange={e => onSharedChange({ orgTel: e.target.value })} /></div>
      </div>
      <div><Label>활동 장소</Label>
        <Input value={shared.place} onChange={e => onSharedChange({ place: e.target.value })} /></div>

      <ClubScheduleField value={schedule} onChange={onScheduleChange} />

      <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-[11px] text-brand-700 ring-1 ring-inset ring-brand-100">
        봉사 <b>내용</b>은 발급 후 <b>대장에서 각 동아리 행을 펼쳐</b> 동아리별로 작성합니다.
      </p>
    </div>
  );
}
