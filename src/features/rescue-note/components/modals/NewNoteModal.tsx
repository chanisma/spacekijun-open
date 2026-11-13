import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { useCreateRescueNote } from '../../hooks/useRescueNotes';
import { RESCUE_VISIBILITY, VISIBILITY_LABELS, type RescueVisibility } from '../../constants';
import { toast } from '@/components/ui/use-toast';

interface Props {
  studentCode: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

export function NewNoteModal({ studentCode, open, onOpenChange }: Props) {
  const [date, setDate] = useState<string>(todayDate);
  const [startTime, setStartTime] = useState<string>(nowTime);
  const [endTime, setEndTime] = useState<string>('');
  const [title, setTitle] = useState('');
  const [remarks, setRemarks] = useState('');
  const [visibility, setVisibility] = useState<RescueVisibility>(RESCUE_VISIBILITY.TEAM);
  const [coStudents, setCoStudents] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const create = useCreateRescueNote(studentCode);

  // SearchableMultiSelect는 학생을 resource.id(UUID)로 식별하지만, rescue-note RPC는
  // 학적 코드(resource.meta->>'id')를 기대한다. 동일한 student 쿼리를 재사용(React Query 캐시 공유)해
  // resource.id → 학적 코드 매핑을 만든다.
  const { studentResources } = useResourceSelect({ resourceType: 'student', enabled: open });
  const resourceIdToCode = useMemo(() => {
    const m = new Map<string, string>();
    studentResources.forEach((s) => {
      if (s.studentCode) m.set(s.value, s.studentCode);
    });
    return m;
  }, [studentResources]);

  const reset = () => {
    setDate(todayDate());
    setStartTime(nowTime());
    setEndTime('');
    setTitle('');
    setRemarks('');
    setVisibility(RESCUE_VISIBILITY.TEAM);
    setCoStudents([]);
    setContent('');
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: '제목을 입력해주세요.', variant: 'destructive' });
      return;
    }
    if (!content.trim()) {
      toast({ title: '내용을 입력해주세요.', variant: 'destructive' });
      return;
    }
    const occurredAt = new Date(`${date}T${startTime}:00`).toISOString();
    const endAt = endTime ? new Date(`${date}T${endTime}:00`).toISOString() : null;
    // 선택값(resource.id, UUID)을 학적 코드로 변환. 해석 불가하거나 마스터 학생과 같은 코드는 제외하고 중복 제거.
    const filteredCo = Array.from(
      new Set(
        coStudents
          .map((rid) => resourceIdToCode.get(rid))
          .filter((code): code is string => !!code && code !== studentCode)
      )
    );

    if (coStudents.length > 0 && filteredCo.length === 0) {
      toast({ title: '함께 상담한 학생을 다시 선택해주세요.', variant: 'destructive' });
      return;
    }

    try {
      await create.mutateAsync({
        studentCode,
        coStudentCodes: filteredCo,
        occurredAt,
        endAt,
        title: title.trim(),
        remarks: remarks.trim() || null,
        content: content.trim(),
        visibility,
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-sm font-bold">새 상담일지</DialogTitle>
          <div className="border-b border-slate-100 pb-2" />
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1 block">일지번호</Label>
              <div className="h-9 px-3 flex items-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-md font-mono">
                저장 시 자동
              </div>
            </div>
            <div>
              <Label htmlFor="n-date" className="text-xs font-medium text-slate-700 mb-1 block">상담일자</Label>
              <Input id="n-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label htmlFor="n-start" className="text-xs font-medium text-slate-700 mb-1 block">시작 시간</Label>
              <Input id="n-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label htmlFor="n-end" className="text-xs font-medium text-slate-700 mb-1 block">종료 시간</Label>
              <Input id="n-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm" />
            </div>
          </div>
          <div>
            <Label htmlFor="n-title" className="text-xs font-medium text-slate-700 mb-1 block">제목</Label>
            <Input id="n-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 1차 정서 면담" className="text-sm" />
          </div>
          <div>
            <Label htmlFor="n-remarks" className="text-xs font-medium text-slate-700 mb-1 block">비고 (선택)</Label>
            <Input id="n-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="장소·유형·특이사항 메모" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1 block">공개 범위</Label>
            <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as RescueVisibility)} className="flex flex-wrap gap-4">
              {Object.entries(VISIBILITY_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <RadioGroupItem value={key} id={`n-vis-${key}`} />
                  <Label htmlFor={`n-vis-${key}`} className="font-normal text-xs text-slate-700">{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1 block">함께 상담한 학생 (선택)</Label>
            <SearchableMultiSelect
              filterByStudent
              selectedValues={coStudents}
              onSelectionChange={setCoStudents}
              placeholder="학생을 검색하여 선택..."
              searchPlaceholder="학생 이름 검색"
              emptyText="검색 결과가 없습니다"
            />
          </div>
          <div>
            <Label htmlFor="n-content" className="text-xs font-medium text-slate-700 mb-1 block">내용</Label>
            <Textarea
              id="n-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="상담 내용, 관찰 사항, 후속 조치 등"
              className="text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">취소</Button>
          <Button onClick={handleSave} disabled={create.isPending} className="text-xs">저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
