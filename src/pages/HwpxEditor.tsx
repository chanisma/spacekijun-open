import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  ArrowLeft,
  Download,
  FilePenLine,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/toast';
import {
  RhwpAiAssistant,
  RhwpVisualEditor,
  type RhwpVisualEditorHandle,
  type RhwpVisualEditorState,
} from '@/components/rhwp';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { RHWP_STUDIO_VERSION } from '@/lib/rhwp/config';
import { cn } from '@/lib/utils';

// 양식 만들기(Spec Workspace) — 스펙 엔진·오버레이 포함이라 지연 로딩
const SpecWorkspace = lazy(() =>
  import('@/features/task-workflow/components/SpecWorkspace').then((m) => ({
    default: m.SpecWorkspace,
  }))
);

type ExportFormat = 'hwpx' | 'hwp' | 'hml';

const SUPPORTED_EXTENSION_PATTERN = /\.(hwp|hwpx)$/i;
const EXPORT_META: Record<
  ExportFormat,
  { label: string; extension: string; mimeType: string }
> = {
  hwpx: {
    label: 'HWPX 저장',
    extension: 'hwpx',
    mimeType: 'application/hwp+zip',
  },
  hwp: {
    label: 'HWP 저장',
    extension: 'hwp',
    mimeType: 'application/x-hwp',
  },
  hml: {
    label: 'HML 저장',
    extension: 'hml',
    mimeType: 'application/xml',
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function editedFileName(fileName: string, extension: string): string {
  const baseName = fileName.replace(/\.(hwp|hwpx)$/i, '').trim();
  return `${baseName || '문서'}_편집본.${extension}`;
}

function downloadBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string
): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function HwpxEditor() {
  const navigate = useNavigate();
  const editorRef = useRef<RhwpVisualEditorHandle | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [editorState, setEditorState] = useState<RhwpVisualEditorState>({
    status: 'loading',
  });
  const [mode, setMode] = useState<'edit' | 'spec'>('edit');

  const loadSource = useCallback(async () => {
    if (!file) throw new Error('편집할 문서를 선택해주세요.');
    return file;
  }, [file]);
  const getEditor = useCallback(() => editorRef.current, []);

  const openFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (!SUPPORTED_EXTENSION_PATTERN.test(nextFile.name)) {
      toast.error('HWP 또는 HWPX 파일만 열 수 있습니다.');
      return;
    }

    setEditorState({ status: 'loading' });
    setFile(nextFile);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    openFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    openFile(event.dataTransfer.files?.[0]);
  };

  const handleExport = async (format: ExportFormat) => {
    const editor = editorRef.current;
    if (!editor || !file || editorState.status !== 'ready' || exporting) return;

    setExporting(format);
    try {
      const bytes =
        format === 'hwpx'
          ? await editor.exportHwpx()
          : format === 'hwp'
            ? await editor.exportHwp()
            : await editor.exportHml();
      if (bytes.byteLength === 0) {
        throw new Error(`${format.toUpperCase()} 내보내기 결과가 비어 있습니다.`);
      }

      const meta = EXPORT_META[format];
      downloadBytes(
        bytes,
        editedFileName(file.name, meta.extension),
        meta.mimeType
      );
      toast.success(`${format.toUpperCase()} 편집본을 저장했습니다.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `${format.toUpperCase()} 편집본을 저장하지 못했습니다.`
      );
    } finally {
      setExporting(null);
    }
  };

  const closeFile = () => {
    setFile(null);
    setEditorState({ status: 'loading' });
  };

  const isReady = editorState.status === 'ready';
  const diagnostics = isReady ? editorState.diagnostics : null;

  return (
    <Layout>
      <PageContainer className="min-h-[calc(100vh-80px)]">
        <header className="rounded-2xl border border-white/50 bg-white/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                title="도구 모음으로 돌아가기"
                onClick={() => navigate('/toolbox')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                <FilePenLine className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-900">
                    HWPX 시각 편집기
                  </h1>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    rhwp {RHWP_STUDIO_VERSION}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  로컬 HWP/HWPX 문서를 브라우저에서 열어 편집하고 다시 저장합니다.
                </p>
              </div>
            </div>

            {file && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-1 flex rounded-lg border border-slate-200 p-0.5">
                  <Button
                    size="sm"
                    variant={mode === 'edit' ? 'default' : 'ghost'}
                    className="h-7 text-xs"
                    onClick={() => setMode('edit')}
                  >
                    편집
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === 'spec' ? 'default' : 'ghost'}
                    className="h-7 text-xs"
                    onClick={() => setMode('spec')}
                  >
                    양식 만들기
                  </Button>
                </div>
                {(Object.keys(EXPORT_META) as ExportFormat[]).map((format) => (
                  <Button
                    key={format}
                    size="sm"
                    variant={format === 'hwpx' ? 'default' : 'outline'}
                    disabled={!isReady || exporting !== null}
                    onClick={() => void handleExport(format)}
                  >
                    {exporting === format ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {EXPORT_META[format].label}
                  </Button>
                ))}
                <Button
                  size="icon"
                  variant="ghost"
                  title="문서 닫기"
                  disabled={exporting !== null}
                  onClick={closeFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {file && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="flex min-w-0 items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                <strong className="max-w-80 truncate font-medium text-slate-700">
                  {file.name}
                </strong>
              </span>
              <span>{formatFileSize(file.size)}</span>
              {isReady && <span>{editorState.pageCount}쪽</span>}
              {diagnostics?.effectiveBackend && (
                <span>{diagnostics.effectiveBackend}</span>
              )}
              <label
                htmlFor="hwpx-editor-file"
                className="cursor-pointer font-medium text-cyan-700 hover:text-cyan-800"
              >
                다른 문서 열기
              </label>
            </div>
          )}
        </header>

        <input
          id="hwpx-editor-file"
          className="sr-only"
          type="file"
          accept=".hwp,.hwpx,application/x-hwp,application/hwp+zip"
          onChange={handleFileInput}
        />

        {file && mode === 'spec' ? (
          <Suspense
            fallback={
              <div className="flex min-h-[620px] items-center justify-center text-sm text-slate-500">
                양식 작업대 불러오는 중
              </div>
            }
          >
            <SpecWorkspace file={file} />
          </Suspense>
        ) : file ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <RhwpVisualEditor
                ref={editorRef}
                className="h-[calc(100vh-245px)] min-h-[620px] rounded-2xl border border-slate-300 shadow-sm"
                fileName={file.name}
                loadSource={loadSource}
                onStateChange={setEditorState}
              />
              <RhwpAiAssistant
                fileName={file.name}
                disabled={!isReady}
                getEditor={getEditor}
              />
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              일반 편집 중에는 파일이 서버에 업로드되지 않습니다. AI 기능을
              실행한 경우에만 문서 텍스트가 인증된 AI 처리 경로로 전송되며, 저장
              버튼을 눌러야 편집 결과가 새 파일로 내려받아집니다.
            </div>
          </>
        ) : (
          <div
            className={cn(
              'flex min-h-[620px] flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white/70 px-6 text-center transition-colors',
              isDragging
                ? 'border-cyan-500 bg-cyan-50/70'
                : 'border-slate-300 hover:border-cyan-400'
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
              <Upload className="h-7 w-7" />
            </span>
            <h2 className="mt-5 text-xl font-bold text-slate-800">
              편집할 문서를 선택하세요
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              HWP 또는 HWPX 파일을 이곳에 끌어놓거나 파일 선택 버튼을 사용하세요.
            </p>
            <Button asChild className="mt-5 bg-cyan-700 hover:bg-cyan-800">
              <label htmlFor="hwpx-editor-file" className="cursor-pointer">
                <FilePenLine className="h-4 w-4" />
                HWP/HWPX 파일 선택
              </label>
            </Button>
          </div>
        )}
      </PageContainer>
    </Layout>
  );
}
