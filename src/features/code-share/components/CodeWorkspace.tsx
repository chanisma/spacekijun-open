/**
 * 코드 보기·고치기 작업대 — Sandpack 의 파일 탐색기 + CodeMirror 편집기를 그대로 쓴다
 * (하이라이팅 라이브러리를 따로 들이지 않는다 — Sandpack 이 이미 안고 있다).
 *
 * 실행과는 분리돼 있다(미리보기를 그리지 않으면 번들러가 뜨지 않는다). 소유자가 [편집] 을 켜면
 * 편집기가 쓰기 가능이 되고, 바뀐 파일만 저장한다. 이진 파일은 편집기에 싣지 않고 아래 목록으로.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
  useSandpack,
} from '@codesandbox/sandpack-react';
import { FilePlus2, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { formatBytes, normalizeProjectPath, isTextPath } from '@/lib/codeShare';
import type { CodeProjectFile } from '../services/codeShareService';

interface CodeWorkspaceProps {
  files: CodeProjectFile[];
  canEdit: boolean;
  editing: boolean;
  onSave: (changes: Array<{ path: string; content: string }>, deleted: string[]) => Promise<void>;
  saving?: boolean;
}

export function CodeWorkspace({ files, canEdit, editing, onSave, saving }: CodeWorkspaceProps) {
  const textFiles = useMemo(() => files.filter((f) => !f.is_binary), [files]);
  const binaryFiles = useMemo(() => files.filter((f) => f.is_binary), [files]);

  const spFiles = useMemo(() => {
    const out: Record<string, { code: string }> = {};
    for (const f of textFiles) out[`/${f.path}`] = { code: f.content ?? '' };
    return out;
  }, [textFiles]);

  const activeFile = useMemo(() => {
    const prefer = ['README.md', 'index.html', 'src/App.tsx', 'src/App.jsx', 'src/main.tsx', 'package.json'];
    const found = prefer.find((p) => spFiles[`/${p}`]);
    return found ? `/${found}` : Object.keys(spFiles)[0];
  }, [spFiles]);

  // 파일 집합이 바뀌면(저장·추가·삭제 뒤) Provider 를 다시 세운다 — Sandpack 은 files 변경을 부분 반영한다
  const providerKey = useMemo(() => Object.keys(spFiles).join('|') + (editing ? '#edit' : '#view'), [spFiles, editing]);

  if (textFiles.length === 0) {
    return <div className="rounded-2xl border bg-card p-6 text-center text-sm text-slate-500">텍스트 파일이 없습니다.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm [&_.sp-wrapper]:h-full [&_.sp-layout]:h-full">
        <SandpackProvider
          key={providerKey}
          template="static"
          files={spFiles}
          options={{ activeFile, visibleFiles: Object.keys(spFiles), initMode: 'lazy' }}
        >
          {editing && canEdit && <EditToolbar original={textFiles} onSave={onSave} saving={saving} />}
          <SandpackLayout style={{ border: 0, borderRadius: 0, height: '70vh' }}>
            <SandpackFileExplorer style={{ height: '100%', minWidth: 180 }} autoHiddenFiles={false} />
            <SandpackCodeEditor
              readOnly={!(editing && canEdit)}
              showTabs
              showLineNumbers
              showInlineErrors={false}
              wrapContent={false}
              style={{ height: '100%' }}
            />
          </SandpackLayout>
        </SandpackProvider>
      </div>
      {binaryFiles.length > 0 && (
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">이진 파일 {binaryFiles.length}개</p>
          <ul className="grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
            {binaryFiles.map((f) => (
              <li key={f.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1">
                <span className="min-w-0 truncate font-mono" title={f.path}>{f.path}</span>
                <span className="shrink-0 text-slate-400">{formatBytes(f.size_bytes)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-slate-400">실행·내려받기에는 포함되고 편집기에는 실리지 않습니다.</p>
        </div>
      )}
    </div>
  );
}

/** Provider 안에서 Sandpack 상태를 읽어 바뀐 파일만 저장한다 */
function EditToolbar({ original, onSave, saving }: {
  original: CodeProjectFile[];
  onSave: CodeWorkspaceProps['onSave'];
  saving?: boolean;
}) {
  const { sandpack } = useSandpack();
  const [deleted, setDeleted] = useState<string[]>([]);
  const [dirty, setDirty] = useState(0);

  const originalMap = useMemo(() => new Map(original.map((f) => [`/${f.path}`, f.content ?? ''])), [original]);

  useEffect(() => {
    let n = 0;
    for (const [p, f] of Object.entries(sandpack.files)) {
      if (originalMap.get(p) !== f.code) n += 1;
    }
    setDirty(n + deleted.length);
  }, [sandpack.files, originalMap, deleted.length]);

  const addFile = () => {
    const raw = window.prompt('새 파일 경로 (예: src/util.js)');
    if (!raw) return;
    const path = normalizeProjectPath(raw);
    if (!path) { toast.error('경로가 올바르지 않습니다.'); return; }
    if (!isTextPath(path)) { toast.error('텍스트 파일만 여기서 만들 수 있습니다.'); return; }
    if (sandpack.files[`/${path}`]) { toast.error('이미 있는 파일입니다.'); return; }
    sandpack.addFile(`/${path}`, '');
    sandpack.openFile(`/${path}`);
    setDeleted((d) => d.filter((x) => x !== path));
  };

  const removeActive = () => {
    const active = sandpack.activeFile;
    if (!active) return;
    if (Object.keys(sandpack.files).length <= 1) { toast.error('마지막 파일은 지울 수 없습니다.'); return; }
    if (!window.confirm(`${active.slice(1)} 파일을 지울까요?`)) return;
    sandpack.deleteFile(active);
    const path = active.slice(1);
    if (originalMap.has(active)) setDeleted((d) => (d.includes(path) ? d : [...d, path]));
  };

  const save = async () => {
    const changes: Array<{ path: string; content: string }> = [];
    for (const [p, f] of Object.entries(sandpack.files)) {
      if (originalMap.get(p) !== f.code) changes.push({ path: p.slice(1), content: f.code });
    }
    const removed = deleted.filter((d) => !sandpack.files[`/${d}`]);
    if (changes.length === 0 && removed.length === 0) { toast.info('바뀐 것이 없습니다.'); return; }
    await onSave(changes, removed);
    setDeleted([]);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50/70 px-3 py-1.5">
      <p className="text-[11px] text-amber-800">
        편집 중 — 바뀐 파일 {dirty}개. 저장하면 실행에도 바로 반영됩니다.
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={addFile}>
          <FilePlus2 className="h-3.5 w-3.5" /> 새 파일
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-rose-600 hover:text-rose-700" onClick={removeActive}>
          <Trash2 className="h-3.5 w-3.5" /> 이 파일 삭제
        </Button>
        <Button size="sm" className="h-7 gap-1 bg-blue-600 px-2.5 text-xs hover:bg-blue-700" onClick={save} disabled={saving || dirty === 0}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 저장
        </Button>
      </div>
    </div>
  );
}
