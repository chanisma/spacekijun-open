/** 가져가기(포크) — 내 사본의 제목·공개 범위만 정한다. 계보(forked_from)는 서비스가 남긴다 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitFork, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { VISIBILITY_HINTS, VISIBILITY_LABELS, type CodeProjectVisibility } from '@/lib/codeShare';
import { useForkCodeProject } from '../hooks/useCodeProjects';
import type { CodeProject, CodeProjectFile } from '../services/codeShareService';

export function ForkDialog({ open, onOpenChange, project, files }: {
  open: boolean; onOpenChange: (o: boolean) => void; project: CodeProject; files: CodeProjectFile[];
}) {
  const navigate = useNavigate();
  const fork = useForkCodeProject();
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<CodeProjectVisibility>('private');

  useEffect(() => {
    if (open) { setTitle(`${project.title} (내 사본)`); setVisibility('private'); }
  }, [open, project.title]);

  const run = async () => {
    if (!title.trim()) { toast.error('제목을 적어 주세요.'); return; }
    try {
      const created = await fork.mutateAsync({ source: project, files, title, visibility });
      toast.success('내 코드로 가져왔습니다. 이제 자유롭게 고쳐 보세요.');
      onOpenChange(false);
      navigate(`/code-share/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '가져오지 못했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!fork.isPending) onOpenChange(o); }}>
      <DialogContent className="p-0 sm:max-w-md">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base"><TitleIconChip icon={GitFork} tone="emerald" />내 코드로 가져가기</DialogTitle>
          <DialogDescription className="text-xs">
            파일 {files.length}개를 복사해 내 소유의 사본을 만듭니다. 원본은 바뀌지 않고, 사본에는 「원본」 표시가 남습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="space-y-1">
            <Label htmlFor="cs-fork-title" className="text-xs">사본 제목</Label>
            <Input id="cs-fork-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">사본 공개 범위</Label>
            <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as CodeProjectVisibility)} className="space-y-1">
              {(['private', 'link', 'school'] as CodeProjectVisibility[]).map((v) => (
                <label key={v} htmlFor={`cs-fork-${v}`} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <RadioGroupItem id={`cs-fork-${v}`} value={v} className="mt-0.5" />
                  <span><span className="block text-xs font-semibold text-slate-800">{VISIBILITY_LABELS[v]}</span><span className="block text-[11px] text-slate-500">{VISIBILITY_HINTS[v]}</span></span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button type="button" variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)} disabled={fork.isPending}>취소</Button>
          <Button type="button" className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')} onClick={run} disabled={fork.isPending}>
            {fork.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />} 가져가기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
