import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { VolunteerArea, PersonalVolunteerFormData } from '../types';

const AREAS: VolunteerArea[] = ['이웃돕기활동', '환경보호활동', '캠페인활동'];

export function PersonalFormFields({
  value, onChange, confirmerHint,
}: {
  value: PersonalVolunteerFormData;
  onChange: (v: PersonalVolunteerFormData) => void;
  /** 선택 학생들의 담임이 서로 달라 자동 시딩을 건너뛴 경우 안내 문구 */
  confirmerHint?: string;
}) {
  const set = <K extends keyof PersonalVolunteerFormData>(k: K, v: PersonalVolunteerFormData[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label>봉사 시작일</Label>
          <Input type="date" value={value.period_start} onChange={e => set('period_start', e.target.value)} /></div>
        <div>
          <Label className="flex items-center gap-1">
            봉사 종료일 <span className="text-[11px] font-normal text-slate-400">선택</span>
          </Label>
          <Input
            type="date"
            value={value.period_end ?? ''}
            min={value.period_start || undefined}
            onChange={e => set('period_end', e.target.value || undefined)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>대상기관</Label>
          <Input value={value.org} onChange={e => set('org', e.target.value)} /></div>
        <div>
          <Label>인정시간</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={value.hours ?? 1}
            onChange={e => set('hours', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      </div>
      <div><Label>활동 장소</Label>
        <Input value={value.place} onChange={e => set('place', e.target.value)} /></div>
      <div><Label>활동 내용</Label>
        <Input value={value.content} onChange={e => set('content', e.target.value)} /></div>
      <div>
        <Label>봉사 영역</Label>
        <RadioGroup value={value.area} onValueChange={v => set('area', v as VolunteerArea)} className="flex gap-4 mt-1">
          {AREAS.map(a => (
            <div key={a} className="flex items-center gap-1">
              <RadioGroupItem value={a} id={`personal-area-${a}`} /><Label htmlFor={`personal-area-${a}`}>{a}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t pt-3">
        <div>
          <Label className="flex items-center gap-1">
            유의사항 <span className="text-[11px] font-normal text-slate-400">선택</span>
          </Label>
          <Input value={value.note ?? ''} onChange={e => set('note', e.target.value || undefined)} />
        </div>
        <div>
          <Label className="flex items-center gap-1">
            의견 <span className="text-[11px] font-normal text-slate-400">선택</span>
          </Label>
          <Input value={value.opinion ?? ''} onChange={e => set('opinion', e.target.value || undefined)} />
        </div>
      </div>

      <div className="grid grid-cols-[6rem_1fr] gap-2 border-t pt-3">
        <div><Label>확인자 직급</Label>
          <Input value={value.confirmer_title} onChange={e => set('confirmer_title', e.target.value)} /></div>
        <div><Label>확인자 성명</Label>
          <Input
            value={value.confirmer_name ?? ''}
            onChange={e => set('confirmer_name', e.target.value || undefined)}
            placeholder="담임교사 이름"
          />
        </div>
      </div>
      {confirmerHint && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 ring-1 ring-inset ring-amber-100">
          {confirmerHint}
        </p>
      )}
    </div>
  );
}
