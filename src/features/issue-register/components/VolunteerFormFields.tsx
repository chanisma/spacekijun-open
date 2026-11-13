import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { VolunteerFormData, VolunteerArea, VolunteerScope } from '../types';

const AREAS: VolunteerArea[] = ['이웃돕기활동', '환경보호활동', '캠페인활동'];
const SCOPES: VolunteerScope[] = ['정규교육과정 내', '정규교육과정 외'];

export function VolunteerFormFields({
  value, onChange,
}: { value: VolunteerFormData; onChange: (v: VolunteerFormData) => void }) {
  const set = <K extends keyof VolunteerFormData>(k: K, v: VolunteerFormData[K]) =>
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
        <div><Label>봉사활동 기관</Label>
          <Input value={value.org} onChange={e => set('org', e.target.value)} /></div>
        <div><Label>기관 연락처</Label>
          <Input value={value.org_tel} onChange={e => set('org_tel', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div><Label>활동 장소</Label>
          <Input value={value.place} onChange={e => set('place', e.target.value)} /></div>
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
      <div><Label>활동 내용</Label>
        <Input value={value.content} onChange={e => set('content', e.target.value)} /></div>
      <div>
        <Label>봉사 영역</Label>
        <RadioGroup value={value.area} onValueChange={v => set('area', v as VolunteerArea)} className="flex gap-4 mt-1">
          {AREAS.map(a => (
            <div key={a} className="flex items-center gap-1">
              <RadioGroupItem value={a} id={`area-${a}`} /><Label htmlFor={`area-${a}`}>{a}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <div>
        <Label>단체봉사 구분</Label>
        <RadioGroup value={value.scope} onValueChange={v => set('scope', v as VolunteerScope)} className="flex gap-4 mt-1">
          {SCOPES.map(s => (
            <div key={s} className="flex items-center gap-1">
              <RadioGroupItem value={s} id={`scope-${s}`} /><Label htmlFor={`scope-${s}`}>{s}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
