/**
 * 코드 올리기 — 세 경로(붙여넣기 · 파일/폴더 · zip)를 한 모달에서. 올라온 파일은
 * `planUpload` 가 정리하고(`.env`·node_modules 제외, 공통 루트 벗김) 종류·진입 파일을
 * 코드가 판정해 보여 준다. 사람은 제목·설명·공개 범위만 정한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { ClipboardPaste, FolderOpen, FileArchive, Loader2, UploadCloud, Code2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  detectEntryPath,
  detectProjectKind,
  formatBytes,
  KIND_LABELS,
  KIND_RUN_HINTS,
  normalizeProjectPath,
  validateProjectFiles,
} from '@/lib/codeShare';
import { draftFromPastedCode, draftsFromFiles, draftsFromZip, type CodeFileUpload } from '../services/codeShareService';
import { useCreateCodeProject } from '../hooks/useCodeProjects';
import { emptyProjectMeta, parseTags, ProjectMetaFields, type ProjectMeta } from './ProjectMetaFields';

type Method = 'paste' | 'files' | 'zip';

const METHODS: Array<{ id: Method; label: string; icon: typeof ClipboardPaste; hint: string }> = [
  { id: 'paste', label: '코드 붙여넣기', icon: ClipboardPaste, hint: 'AI 가 만들어 준 HTML 한 장을 그대로' },
  { id: 'files', label: '파일 · 폴더', icon: FolderOpen, hint: '프로젝트 폴더를 통째로 (node_modules 는 자동 제외)' },
  { id: 'zip', label: 'zip', icon: FileArchive, hint: '압축 파일 하나' },
];

export function CodeUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateCodeProject();
  const [method, setMethod] = useState<Method>('paste');
  const [meta, setMeta] = useState<ProjectMeta>(emptyProjectMeta);
  const [pasted, setPasted] = useState('');
  const [pastedName, setPastedName] = useState('index.html');
  const [drafts, setDrafts] = useState<CodeFileUpload[]>([]);
  const [ignored, setIgnored] = useState<Array<{ path: string; reason: string }>>([]);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!open) {
      setMethod('paste'); setMeta(emptyProjectMeta()); setPasted(''); setPastedName('index.html'); setDrafts([]); setIgnored([]);
    }
  }, [open]);

  // 붙여넣기 경로는 초안을 즉시 유도한다
  const effectiveDrafts = useMemo<CodeFileUpload[]>(() => {
    if (method !== 'paste') return drafts;
    const name = normalizeProjectPath(pastedName) ?? 'index.html';
    return pasted.trim() ? [draftFromPastedCode(pasted, name)] : [];
  }, [method, drafts, pasted, pastedName]);

  const paths = effectiveDrafts.map((d) => d.path);
  const kind = effectiveDrafts.length ? detectProjectKind(paths) : null;
  const entry = effectiveDrafts.length ? detectEntryPath(paths) : null;
  const errors = effectiveDrafts.length ? validateProjectFiles(effectiveDrafts) : [];
  const totalBytes = effectiveDrafts.reduce((s, d) => s + d.size, 0);

  const ingest = useCallback(async (files: File[], asZip: boolean) => {
    setReading(true);
    try {
      const result = asZip ? await draftsFromZip(files[0]) : await draftsFromFiles(files);
      setDrafts(result.drafts);
      setIgnored(result.ignored);
      if (result.drafts.length === 0) toast.warning('저장할 파일이 없습니다. 전부 무시 목록에 걸렸거나 비어 있습니다.');
      if (!meta.title && result.drafts.length > 0) {
        // 제목 기본값 = zip 이름 / 첫 폴더 이름 — 사람이 바꾼다
        const guess = asZip ? files[0].name.replace(/\.zip$/i, '') : (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] ?? '';
        if (guess) setMeta((m) => ({ ...m, title: guess }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
    } finally {
      setReading(false);
    }
  }, [meta.title]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length === 0) return;
    const zip = accepted.length === 1 && /\.zip$/i.test(accepted[0].name);
    void ingest(accepted, zip);
  }, [ingest]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true, noKeyboard: true });

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // React 가 모르는 속성이라 ref 로 단다
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
  }, [method]);

  const canSubmit = effectiveDrafts.length > 0 && errors.length === 0 && meta.title.trim().length > 0 && !create.isPending && !reading;

  const submit = async () => {
    if (!canSubmit || !kind) return;
    try {
      const project = await create.mutateAsync({
        input: {
          title: meta.title,
          description: meta.description,
          visibility: meta.visibility,
          kind,
          entryPath: entry,
          originTool: meta.originTool,
          tags: parseTags(meta.tagsText),
        },
        files: effectiveDrafts,
      });
      toast.success(`「${project.title}」을(를) 올렸습니다.`);
      onOpenChange(false);
      navigate(`/code-share/${project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '올리지 못했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!create.isPending) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[92vh] flex-col p-0 sm:max-w-2xl" mobile="fullscreen">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={Code2} />
            코드 올리기
          </DialogTitle>
          <DialogDescription className="text-xs">
            바이브코딩으로 만든 사이트·코드를 올려 두면 다른 사람이 실행해 보고 가져가 응용할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <section className="space-y-2">
            <SectionLabel icon={UploadCloud}>올리는 방법</SectionLabel>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      'flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors',
                      active ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-blue-600' : 'text-slate-400')} />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-800">{m.label}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{m.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {method === 'paste' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="cs-paste-name" className="shrink-0 text-xs">파일 이름</Label>
                  <Input id="cs-paste-name" value={pastedName} onChange={(e) => setPastedName(e.target.value)} className="h-8 max-w-[220px] font-mono text-xs md:text-xs" />
                </div>
                <Textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder={'<!doctype html>\n<html>…'}
                  className="font-mono text-xs md:text-xs"
                />
              </div>
            )}

            {method !== 'paste' && (
              <div
                {...getRootProps()}
                className={cn(
                  'rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
                  isDragActive ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60',
                )}
              >
                <input {...getInputProps()} />
                <p className="text-xs text-slate-600">여기에 {method === 'zip' ? 'zip 파일을' : '폴더나 파일을'} 끌어다 놓거나</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  {method === 'files' && (
                    <>
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => folderInputRef.current?.click()}>폴더 선택</Button>
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => filesInputRef.current?.click()}>파일 선택</Button>
                      <input ref={folderInputRef} type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void ingest(fs, false); e.target.value = ''; }} />
                      <input ref={filesInputRef} type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void ingest(fs, false); e.target.value = ''; }} />
                    </>
                  )}
                  {method === 'zip' && (
                    <>
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => zipInputRef.current?.click()}>zip 선택</Button>
                      <input ref={zipInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void ingest(fs, true); e.target.value = ''; }} />
                    </>
                  )}
                </div>
                {reading && <p className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 읽는 중…</p>}
              </div>
            )}
          </section>

          {effectiveDrafts.length > 0 && kind && (
            <section className="rounded-xl border bg-slate-50/70 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-slate-800">{KIND_LABELS[kind]}</span>
                <span className="text-slate-500">파일 {effectiveDrafts.length}개 · {formatBytes(totalBytes)}</span>
                {entry && <span className="text-slate-500">진입 <span className="font-mono text-slate-700">{entry}</span></span>}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{KIND_RUN_HINTS[kind]}</p>
              {method !== 'paste' && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11px] text-slate-500">파일 목록{ignored.length > 0 ? ` · 무시 ${ignored.length}개` : ''}</summary>
                  <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-[11px] text-slate-600">
                    {effectiveDrafts.map((d) => <li key={d.path} className="truncate" title={d.path}>{d.path}{d.isBinary ? ' (이진)' : ''}</li>)}
                    {ignored.map((d) => <li key={`i-${d.path}`} className="truncate text-slate-400 line-through" title={`${d.path} — ${d.reason}`}>{d.path}</li>)}
                  </ul>
                </details>
              )}
              {errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-rose-600">
                  {errors.map((e) => <li key={e} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{e}</li>)}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-2">
            <SectionLabel icon={Code2}>소개</SectionLabel>
            <ProjectMetaFields value={meta} onChange={setMeta} idPrefix="cs-new" />
          </section>
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button type="button" variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)} disabled={create.isPending}>
            취소
          </Button>
          <Button type="button" className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')} onClick={submit} disabled={!canSubmit}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            올리기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
