/**
 * 코드 공유 — 상세 (`/code-share/:id`). [실행] / [코드] 두 보기.
 * 상세는 RPC `get_code_project` 로 읽는다 — '링크를 아는 사람' 공개는 목록 SELECT 정책에 없다.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Code2, Download, GitFork, Globe, Link2, Loader2, Lock, Pencil, PencilLine, Play, Trash2, User,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { canEditCodeProject, canForkCodeProject, formatBytes, listMarkdownPaths, VISIBILITY_LABELS, type CodeProjectVisibility } from '@/lib/codeShare';
import {
  useCodeProject, useCodeProjectFiles, useCodeProjectForkCount, useDeleteCodeProject, useDeleteCodeProjectFile,
  useMyResourceId, useSaveCodeProjectTextFile,
} from './hooks/useCodeProjects';
import { buildProjectZip, safeZipName } from './services/codeShareService';
import { CodeRunner } from './components/CodeRunner';
import { CodeWorkspace } from './components/CodeWorkspace';
import { CodeProjectEditDialog } from './components/CodeProjectEditDialog';
import { ForkDialog } from './components/ForkDialog';
import { MarkdownReader } from './components/MarkdownReader';
import { KindBadge } from './CodeSharePage';

/** run = 실행 · docs = 마크다운 읽기(스킬·README) · code = 파일 보기/편집 */
type View = 'run' | 'docs' | 'code';
const VISIBILITY_ICON: Record<CodeProjectVisibility, typeof Globe> = { school: Globe, link: Link2, private: Lock };

export default function CodeProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: myResourceId = null } = useMyResourceId();
  const { data: project, isLoading, error } = useCodeProject(id);
  const { data: files = [], isLoading: filesLoading } = useCodeProjectFiles(id);
  const { data: forkCount = 0 } = useCodeProjectForkCount(id);
  const { data: origin } = useCodeProject(project?.forked_from ?? undefined);

  const [view, setView] = useState<View | null>(null);
  const [editing, setEditing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [zipping, setZipping] = useState(false);

  const saveFile = useSaveCodeProjectTextFile(id ?? '');
  const deleteFile = useDeleteCodeProjectFile(id ?? '');
  const deleteProject = useDeleteCodeProject();

  const hasDocs = useMemo(() => listMarkdownPaths(files.map((f) => f.path)).length > 0, [files]);
  const isSkill = project?.kind === 'skill';
  // 기본 보기: 스킬·실행 없는 묶음은 [문서], 나머지는 [실행]. 문서가 없으면 [문서] 탭 자체가 없다.
  const defaultView: View = isSkill || (project?.kind === 'other' && hasDocs) ? 'docs' : 'run';
  const activeView: View = view ?? defaultView;
  const views = useMemo<Array<[View, typeof Play, string]>>(() => {
    const out: Array<[View, typeof Play, string]> = [];
    if (!isSkill) out.push(['run', Play, '실행']);
    if (hasDocs) out.push(['docs', BookOpen, '문서']);
    out.push(['code', Code2, '코드']);
    return out;
  }, [isSkill, hasDocs]);

  const canEdit = useMemo(() => (project ? canEditCodeProject(project, myResourceId, isAdmin) : false), [project, myResourceId, isAdmin]);
  const canFork = useMemo(() => (project ? canForkCodeProject(project, myResourceId, isAdmin) : false), [project, myResourceId, isAdmin]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/code-share/${id}`);
      toast.success('링크를 복사했습니다. 로그인한 사람만 열 수 있습니다.');
    } catch {
      toast.error('복사하지 못했습니다.');
    }
  };

  const downloadZip = async () => {
    if (!project) return;
    setZipping(true);
    try {
      const blob = await buildProjectZip(project, files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = safeZipName(project.title); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`${safeZipName(project.title)} 을(를) 내려받습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '내려받지 못했습니다.');
    } finally {
      setZipping(false);
    }
  };

  const onSaveFiles = async (changes: Array<{ path: string; content: string }>, deleted: string[]) => {
    try {
      for (const c of changes) await saveFile.mutateAsync(c);
      for (const d of deleted) {
        const f = files.find((x) => x.path === d);
        if (f) await deleteFile.mutateAsync(f);
      }
      toast.success(`파일 ${changes.length}개 저장${deleted.length ? ` · ${deleted.length}개 삭제` : ''}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    }
  };

  if (isLoading) {
    return <Layout><PageContainer><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div></PageContainer></Layout>;
  }
  if (error || !project) {
    return (
      <Layout>
        <PageContainer width="narrow">
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
            <h3 className="text-base font-semibold text-slate-700">코드를 열 수 없습니다</h3>
            <p className="mt-1 text-xs text-slate-500">삭제됐거나 비공개로 바뀌었거나, 주소가 틀렸을 수 있습니다.</p>
            <Button variant="outline" size="sm" className="mt-4 h-8 text-xs" onClick={() => navigate('/code-share')}>목록으로</Button>
          </div>
        </PageContainer>
      </Layout>
    );
  }

  const VisIcon = VISIBILITY_ICON[project.visibility] ?? Globe;

  return (
    <Layout>
      <PageContainer>
        <div className="rounded-xl border bg-card p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={() => navigate('/code-share')} aria-label="목록으로">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="min-w-0 truncate text-sm font-semibold text-slate-800" title={project.title}>{project.title}</h1>
                <KindBadge kind={project.kind} />
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{project.owner?.name ?? '—'}</span>
                <span className="flex items-center gap-1"><VisIcon className="h-3 w-3" />{VISIBILITY_LABELS[project.visibility]}</span>
                <span>파일 {project.file_count}개 · {formatBytes(project.total_bytes)}</span>
                {forkCount > 0 && <span className="flex items-center gap-1"><GitFork className="h-3 w-3" />{forkCount}명이 가져감</span>}
                {project.origin_tool && <span>만든 도구 {project.origin_tool}</span>}
                {project.forked_from && (
                  origin
                    ? <span>원본 <Link to={`/code-share/${origin.id}`} className="text-blue-600 hover:underline">{origin.title}</Link>{origin.owner?.name ? ` (${origin.owner.name})` : ''}</span>
                    : <span className="text-slate-400">원본은 비공개이거나 삭제됨</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
                {views.map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={cn('flex h-6 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors', activeView === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
              {canFork && (
                <Button size="sm" className="h-8 gap-1 bg-blue-600 px-2.5 text-xs hover:bg-blue-700" onClick={() => setForkOpen(true)} disabled={filesLoading}>
                  <GitFork className="h-3.5 w-3.5" /> 가져가기
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={downloadZip} disabled={zipping || filesLoading}>
                {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} zip
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={copyLink}>
                <Link2 className="h-3.5 w-3.5" /> 링크
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant={editing ? 'default' : 'ghost'}
                    size="sm"
                    className={cn('h-8 gap-1 px-2 text-xs', editing && 'bg-amber-500 text-white hover:bg-amber-600')}
                    onClick={() => { setEditing((v) => !v); setView('code'); }}
                  >
                    <PencilLine className="h-3.5 w-3.5" /> {editing ? '편집 끝' : '파일 편집'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" /> 정보
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                  </Button>
                </>
              )}
            </div>
          </div>
          {(project.description || project.tags.length > 0) && (
            <div className="mt-2 border-t pt-2">
              {project.description && <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{project.description}</p>}
              {project.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {project.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">#{t}</span>)}
                </div>
              )}
            </div>
          )}
        </div>

        {filesLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : activeView === 'run' ? (
          <CodeRunner project={project} files={files} />
        ) : activeView === 'docs' ? (
          <MarkdownReader files={files} isSkill={isSkill} onDownloadZip={downloadZip} />
        ) : (
          <CodeWorkspace files={files} canEdit={canEdit} editing={editing} onSave={onSaveFiles} saving={saveFile.isPending || deleteFile.isPending} />
        )}

        <ForkDialog open={forkOpen} onOpenChange={setForkOpen} project={project} files={files} />
        {canEdit && <CodeProjectEditDialog open={editOpen} onOpenChange={setEditOpen} project={project} files={files} />}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>이 코드를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                파일 {project.file_count}개가 함께 지워지고 되돌릴 수 없습니다. 다른 사람이 가져간 사본은 남습니다(원본 표시만 끊깁니다).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs">취소</AlertDialogCancel>
              <AlertDialogAction
                className="h-9 bg-rose-600 text-xs hover:bg-rose-700"
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    await deleteProject.mutateAsync(project.id);
                    toast.success('삭제했습니다.');
                    setDeleteOpen(false);
                    navigate('/code-share');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : '삭제하지 못했습니다.');
                  }
                }}
              >
                {deleteProject.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '삭제'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </Layout>
  );
}
