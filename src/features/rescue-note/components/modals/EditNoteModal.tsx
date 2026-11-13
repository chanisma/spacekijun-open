import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUpdateRescueNote } from '../../hooks/useRescueNotes';
import { RESCUE_VISIBILITY, VISIBILITY_LABELS, type RescueVisibility } from '../../constants';
import { toast } from '@/components/ui/use-toast';
import type { RescueNote } from '../../types/rescueNote';
import { useCoStudentNames } from '../../hooks/useCoStudentNames';

interface Props {
  note: RescueNote;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const offsetMs = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offsetMs).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function EditNoteModal({ note, open, onOpenChange }: Props) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [title, setTitle] = useState(note.title);
  const [remarks, setRemarks] = useState(note.remarks ?? '');
  const [visibility, setVisibility] = useState<RescueVisibility>(note.visibility);
  const [content, setContent] = useState(note.content);
  const update = useUpdateRescueNote(note.studentCode);
  const { resolve } = useCoStudentNames();

  useEffect(() => {
    const start = isoToLocalParts(note.occurredAt);
    setDate(start.date);
    setStartTime(start.time);
    setEndTime(note.endAt ? isoToLocalParts(note.endAt).time : '');
    setTitle(note.title);
    setRemarks(note.remarks ?? '');
    setVisibility(note.visibility);
    setContent(note.content);
  }, [note]);

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
    try {
      await update.mutateAsync({
        id: note.id,
        patch: {
          occurredAt,
          endAt,
          title: title.trim(),
          remarks: remarks.trim() || null,
          content: content.trim(),
          visibility,
        },
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '수정 실패', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-sm font-bold flex items-center gap-2 flex-wrap">
            상담일지 수정
            {note.noteNo && (
              <span className="font-mono text-[11px] text-slate-500 font-normal">{note.noteNo}</span>
            )}
            {note.linkedNoteId && (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-1.5 py-0.5">
                복제본
              </span>
            )}
          </DialogTitle>
          <div className="border-b border-slate-100 pb-2" />
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="e-date" className="text-xs font-medium text-slate-700 mb-1 block">상담일자</Label>
              <Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label htmlFor="e-start" className="text-xs font-medium text-slate-700 mb-1 block">시작 시간</Label>
              <Input id="e-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label htmlFor="e-end" className="text-xs font-medium text-slate-700 mb-1 block">종료 시간</Label>
              <Input id="e-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm" />
            </div>
          </div>
          <div>
            <Label htmlFor="e-title" className="text-xs font-medium text-slate-700 mb-1 block">제목</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label htmlFor="e-remarks" className="text-xs font-medium text-slate-700 mb-1 block">비고</Label>
            <Input id="e-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1 block">공개 범위</Label>
            <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as RescueVisibility)} className="flex flex-wrap gap-4">
              {Object.entries(VISIBILITY_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <RadioGroupItem value={key} id={`e-vis-${key}`} />
                  <Label htmlFor={`e-vis-${key}`} className="font-normal text-xs text-slate-700">{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {note.coStudentCodes.length > 0 && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1 block">함께 상담한 학생 (수정 불가)</Label>
              <div className="flex flex-wrap gap-1">
                {note.coStudentCodes.map((c) => (
                  <span key={c} className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 rounded px-1.5 py-0.5">
                    {resolve(c)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="e-content" className="text-xs font-medium text-slate-700 mb-1 block">내용</Label>
            <Textarea
              id="e-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">취소</Button>
          <Button onClick={handleSave} disabled={update.isPending} className="text-xs">저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
