import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useCreateCertificate } from '../hooks/useTrainingCertificates';
import { formatFileSize } from '../utils/format';
import type { TrainingType } from '../types';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trainingType: TrainingType | null;
  resourceId: string | null;
  /** 등록 성공 시(워크플로 WORK 완료 기록용) */
  onRegistered?: () => void;
}

export function RegisterCertificateDialog({ open, onOpenChange, trainingType, resourceId, onRegistered }: Props) {
  const create = useCreateCertificate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => setFile(null);

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_SIZE) {
      toast({ title: '파일이 너무 큽니다', description: '최대 10MB까지 첨부할 수 있습니다.', variant: 'destructive' });
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file || !trainingType || !resourceId) return;
    try {
      await create.mutateAsync({
        resourceId,
        trainingTypeId: trainingType.id,
        title: trainingType.name,
        hours: trainingType.required_hours,
        completedAt: new Date().toISOString().slice(0, 10),
        file,
      });
      onRegistered?.();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({ title: '등록 실패', description: e instanceof Error ? e.message : '알 수 없는 오류', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>이수증 등록{trainingType ? ` — ${trainingType.name}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[88px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">연수 종류</dt>
            <dd className="font-medium">{trainingType?.name ?? '—'}</dd>
            <dt className="text-muted-foreground">이수 시간</dt>
            <dd className="tabular-nums">{trainingType?.required_hours ?? '—'}{trainingType?.unit ?? '시간'} (자동)</dd>
          </dl>

          <div>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0] ?? null); }}
              className={cn(
                'flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition',
                dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-emerald-400',
              )}
            >
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              <Upload className="mb-2 h-6 w-6 text-emerald-600" />
              <div className="text-sm font-medium">파일을 끌어다 놓거나 클릭</div>
              <div className="mt-1 text-xs text-muted-foreground">PDF · PNG · JPG · 최대 10MB</div>
            </label>
            {file && (
              <div className="mt-3 flex items-center gap-3 rounded-md border bg-white p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={!file || create.isPending} onClick={submit}>
            {create.isPending ? '등록 중…' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
