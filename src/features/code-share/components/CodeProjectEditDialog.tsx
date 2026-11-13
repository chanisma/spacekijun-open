/** 소유자의 소개·공개 범위·종류·진입 파일 수정 */
import { useEffect, useState } from 'react';
import { Loader2, Pencil, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { KIND_LABELS, KIND_RUN_HINTS, type CodeProjectKind } from '@/lib/codeShare';
import { useUpdateCodeProject } from '../hooks/useCodeProjects';
import type { CodeProject, CodeProjectFile } from '../services/codeShareService';
import { parseTags, ProjectMetaFields, type ProjectMeta } from './ProjectMetaFields';

const KINDS: CodeProjectKind[] = ['html', 'static', 'node', 'skill', 'other'];
const NONE = '__none__';

export function CodeProjectEditDialog({ open, onOpenChange, project, files }: {
  open: boolean; onOpenChange: (o: boolean) => void; project: CodeProject; files: CodeProjectFile[];
}) {
  const update = useUpdateCodeProject(project.id);
  const [meta, setMeta] = useState<ProjectMeta>({
    title: project.title, description: project.description ?? '', visibility: project.visibility,
    originTool: project.origin_tool ?? '', tagsText: project.tags.join(', '),
  });
  const [kind, setKind] = useState<CodeProjectKind>(project.kind);
  const [entry, setEntry] = useState<string>(project.entry_path ?? NONE);

  useEffect(() => {
    if (!open) return;
    setMeta({ title: project.title, description: project.description ?? '', visibility: project.visibility, originTool: project.origin_tool ?? '', tagsText: project.tags.join(', ') });
    setKind(project.kind);
    setEntry(project.entry_path ?? NONE);
  }, [open, project]);

  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path)).map((f) => f.path);

  const save = async () => {
    if (!meta.title.trim()) { toast.error('제목을 적어 주세요.'); return; }
    try {
      await update.mutateAsync({
        title: meta.title, description: meta.description, visibility: meta.visibility,
        originTool: meta.originTool, tags: parseTags(meta.tagsText), kind, entryPath: entry === NONE ? null : entry,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!update.isPending) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[90vh] flex-col p-0 sm:max-w-xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base"><TitleIconChip icon={Pencil} />코드 정보 수정</DialogTitle>
          <DialogDescription className="text-xs">파일 자체는 [코드] 탭의 편집 모드에서 고칩니다.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <ProjectMetaFields value={meta} onChange={setMeta} idPrefix="cs-edit" />
          <section className="space-y-2">
            <SectionLabel icon={Play}>실행 방식</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">종류</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as CodeProjectKind)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k} value={k} className="text-sm">{KIND_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">진입 HTML</Label>
                <Select value={entry} onValueChange={setEntry}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="없음" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-sm">없음</SelectItem>
                    {htmlFiles.map((p) => <SelectItem key={p} value={p} className="font-mono text-xs">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">{KIND_RUN_HINTS[kind]}</p>
          </section>
        </div>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button type="button" variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)} disabled={update.isPending}>취소</Button>
          <Button type="button" className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')} onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
