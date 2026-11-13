/**
 * 올라온 코드를 **이 화면 안에서** 실행한다.
 *
 *  - html   : 그 파일 그대로 `srcdoc`
 *  - static : `assembleStaticDocument` 로 상대 참조를 data: URL 로 바꿔 한 문서로 (이진은 버킷에서 받아 base64)
 *  - node   : Sandpack 미리보기(CodeSandbox 번들러 — 외부 서비스)
 *  - other  : 실행 없음
 *
 * ⚠️ iframe sandbox 에 `allow-same-origin` 을 주지 말 것 (`CODE_RUN_SANDBOX` 단일 출처).
 * ⚠️ "새 창에서 열기"를 만들지 말 것 — blob: URL 을 새 탭에 열면 그 코드가 **우리 출처**에서 돌아
 *    Supabase 세션·localStorage 를 읽는다. 전체 화면 토글이 그 자리를 대신한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { SandpackProvider, SandpackLayout, SandpackPreview } from '@codesandbox/sandpack-react';
import { AlertTriangle, Loader2, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  assembleStaticDocument,
  buildSandpackSetup,
  CODE_RUN_SANDBOX,
  KIND_RUN_HINTS,
  type StaticSourceFile,
} from '@/lib/codeShare';
import { blobToDataUrl, downloadBinary, type CodeProject, type CodeProjectFile } from '../services/codeShareService';

interface CodeRunnerProps {
  project: CodeProject;
  files: CodeProjectFile[];
  className?: string;
}

export function CodeRunner({ project, files, className }: CodeRunnerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const frameClass = fullscreen
    ? 'fixed inset-0 z-[70] flex flex-col bg-white'
    : cn('relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm', className);

  return (
    <div className={frameClass}>
      <div className="flex items-center justify-between gap-2 border-b bg-slate-50/80 px-3 py-1.5">
        <p className="min-w-0 truncate text-[11px] text-slate-500">{KIND_RUN_HINTS[project.kind]}</p>
        <div className="flex shrink-0 items-center gap-1">
          {project.kind !== 'other' && project.kind !== 'skill' && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setRunId((n) => n + 1)}>
              <RotateCcw className="h-3.5 w-3.5" /> 다시 실행
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {fullscreen ? '닫기' : '전체 화면'}
          </Button>
        </div>
      </div>
      {/* ⚠️ 전체 화면이 아닐 때 flex-1 을 주면 안 된다 — 부모 높이가 auto 인 세로 flex 에서 basis 0 이 h-* 를 이겨
          iframe 이 기본 150px 로 떨어진다(2026-10-02 실제 증상). 높이를 직접 준다: 화면 높이를 따라가되 최소 480px */}
      <div className={cn(fullscreen ? 'min-h-0 flex-1' : 'h-[max(480px,calc(100vh-300px))]')}>
        {project.kind === 'html' && <SingleHtmlFrame key={runId} project={project} files={files} />}
        {project.kind === 'static' && <StaticFrame key={runId} project={project} files={files} />}
        {project.kind === 'node' && <SandpackFrame key={runId} files={files} />}
        {project.kind === 'skill' && (
          <EmptyRun text="Claude 스킬은 실행하는 것이 아니라 읽는 것입니다 — [문서] 보기에서 SKILL.md 와 참고 문서를 읽고, zip 을 받아 .claude/skills/ 에 넣으세요." />
        )}
        {project.kind === 'other' && (
          <EmptyRun text="실행할 진입 파일(index.html 또는 package.json)이 없습니다. [코드] 탭에서 보거나 내려받아 쓰세요." />
        )}
      </div>
    </div>
  );
}

function EmptyRun({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">{text}</div>
  );
}

function RunFrame({ srcDoc, title }: { srcDoc: string; title: string }) {
  return (
    <iframe
      srcDoc={srcDoc}
      sandbox={CODE_RUN_SANDBOX}
      title={title}
      className="h-full w-full border-0 bg-white"
    />
  );
}

function SingleHtmlFrame({ project, files }: { project: CodeProject; files: CodeProjectFile[] }) {
  const entry = files.find((f) => f.path === project.entry_path) ?? files.find((f) => /\.html?$/i.test(f.path));
  if (!entry || entry.content == null) return <EmptyRun text="HTML 파일을 찾지 못했습니다." />;
  return <RunFrame srcDoc={entry.content} title={project.title} />;
}

function StaticFrame({ project, files }: { project: CodeProject; files: CodeProjectFile[] }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; html: string; missing: string[]; skipped: string[] } | { status: 'error'; message: string }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sources: StaticSourceFile[] = [];
        for (const f of files) {
          if (f.is_binary && f.storage_path) {
            const blob = await downloadBinary(f.storage_path);
            sources.push({ path: f.path, dataUrl: await blobToDataUrl(blob), size: f.size_bytes });
          } else {
            sources.push({ path: f.path, text: f.content ?? '', size: f.size_bytes });
          }
        }
        if (cancelled) return;
        const entry = project.entry_path ?? files.find((f) => /\.html?$/i.test(f.path))?.path;
        if (!entry) { setState({ status: 'error', message: '진입 HTML 이 없습니다.' }); return; }
        const doc = assembleStaticDocument(sources, entry);
        setState({ status: 'ready', html: doc.html, missing: doc.missing, skipped: doc.skipped });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [project.entry_path, files]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> 파일을 합치는 중…
      </div>
    );
  }
  if (state.status === 'error') return <EmptyRun text={state.message} />;
  const notes = [
    ...state.missing.map((m) => `${m} — 묶음에 없는 참조(외부 파일이거나 누락)`),
    ...state.skipped.map((s) => `${s} — 너무 커서 끼워 넣지 못함`),
  ];
  return (
    <div className="flex h-full flex-col">
      {notes.length > 0 && (
        <div className="flex items-start gap-1.5 border-b bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-all">{notes.slice(0, 3).join(' · ')}{notes.length > 3 ? ` 외 ${notes.length - 3}건` : ''}</span>
        </div>
      )}
      <div className="min-h-0 flex-1"><RunFrame srcDoc={state.html} title={project.title} /></div>
    </div>
  );
}

function SandpackFrame({ files }: { files: CodeProjectFile[] }) {
  const setup = useMemo(() => buildSandpackSetup(files.map((f) => ({ path: f.path, content: f.content }))), [files]);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-slate-50 px-3 py-1 text-[11px] text-slate-500">
        템플릿 <span className="font-mono text-slate-700">{setup.template}</span> ({setup.reason})
        {setup.binaryPaths.length > 0 && ` · 이진 파일 ${setup.binaryPaths.length}개는 실행에 실리지 않습니다`}
      </div>
      <div className="min-h-0 flex-1 [&_.sp-wrapper]:h-full [&_.sp-layout]:h-full [&_.sp-preview]:h-full [&_.sp-preview-container]:h-full [&_.sp-preview-iframe]:h-full">
        <SandpackProvider
          template={setup.template}
          files={setup.files}
          customSetup={{ dependencies: setup.dependencies, devDependencies: setup.devDependencies }}
          options={{ initMode: 'immediate' }}
        >
          <SandpackLayout style={{ height: '100%', border: 0, borderRadius: 0 }}>
            <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton style={{ height: '100%' }} />
          </SandpackLayout>
        </SandpackProvider>
      </div>
    </div>
  );
}
