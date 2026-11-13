import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSetStudentStatus } from '../../hooks/useRescueStatus';
import { RESCUE_STATUS, STATUS_LABELS, type RescueStatus } from '../../constants';
import { toast } from '@/components/ui/use-toast';

interface Props {
  studentCode: string;
  currentStatus: RescueStatus;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function StatusChangeModal({ studentCode, currentStatus, open, onOpenChange }: Props) {
  const [status, setStatus] = useState<RescueStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const set = useSetStudentStatus(studentCode);

  useEffect(() => {
    if (open) {
      setStatus(currentStatus);
      setReason('');
    }
  }, [open, currentStatus]);

  const handleSave = async () => {
    try {
      await set.mutateAsync({ status, reason: reason.trim() || undefined });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '변경 실패', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-sm font-bold">상태 변경</DialogTitle>
          <div className="border-b border-slate-100 pb-2" />
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1 block">새 상태</Label>
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as RescueStatus)}>
              {Object.values(RESCUE_STATUS).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <RadioGroupItem value={s} id={`status-${s}`} />
                  <Label htmlFor={`status-${s}`} className="font-normal text-sm text-slate-700">{STATUS_LABELS[s]}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="reason" className="text-xs font-medium text-slate-700 mb-1 block">사유 (선택)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="text-sm resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">취소</Button>
          <Button onClick={handleSave} disabled={set.isPending} className="text-xs">저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
