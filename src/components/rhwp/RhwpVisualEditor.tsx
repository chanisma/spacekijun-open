import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  HmlSaveState,
  HwpVerifyResult,
  RendererDiagnosticsV1,
  RhwpEditor,
} from '@rhwp/editor';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  applyRhwpAiFieldValues,
  getRhwpAiFillableFields,
  getRhwpAiEditingContext,
  replaceRhwpAiEditingTarget,
  type RhwpAiEditingApplyResult,
  type RhwpAiEditingContext,
  type RhwpAiEditingTarget,
  type RhwpAiFieldApplyResult,
  type RhwpAiFieldValue,
  type RhwpAiFillableField,
} from '@/lib/rhwp/aiEditing';
import { getRhwpStudioUrl } from '@/lib/rhwp/config';

export type RhwpDocumentSource = Blob | ArrayBuffer | Uint8Array;

export type RhwpVisualEditorState =
  | { status: 'loading' }
  | {
      status: 'ready';
      pageCount: number;
      diagnostics: RendererDiagnosticsV1 | null;
    }
  | { status: 'error'; message: string };

export interface RhwpVisualEditorHandle {
  loadFile: (
    source: RhwpDocumentSource,
    fileName?: string
  ) => Promise<{ pageCount: number }>;
  pageCount: () => Promise<number>;
  getPageSvg: (page?: number) => Promise<string>;
  getRendererDiagnostics: (page?: number) => Promise<RendererDiagnosticsV1>;
  exportHwp: () => Promise<Uint8Array>;
  exportHwpx: () => Promise<Uint8Array>;
  exportHml: () => Promise<Uint8Array>;
  getHmlSaveState: () => Promise<HmlSaveState>;
  exportHwpVerify: () => Promise<HwpVerifyResult>;
  getAiEditingContext: () => Promise<RhwpAiEditingContext>;
  replaceAiEditingTarget: (
    text: string,
    expected: RhwpAiEditingTarget
  ) => Promise<RhwpAiEditingApplyResult>;
  getAiFillableFields: () => Promise<RhwpAiFillableField[]>;
  applyAiFieldValues: (
    values: RhwpAiFieldValue[],
    expected: RhwpAiFillableField[]
  ) => Promise<RhwpAiFieldApplyResult>;
  getIframe: () => HTMLIFrameElement | null;
}

export interface RhwpVisualEditorProps {
  fileName: string;
  loadSource: () => Promise<RhwpDocumentSource>;
  className?: string;
  onStateChange?: (state: RhwpVisualEditorState) => void;
}

async function toEditorBytes(
  source: RhwpDocumentSource
): Promise<ArrayBuffer | Uint8Array> {
  return source instanceof Blob ? source.arrayBuffer() : source;
}

function editorUnavailableError(): Error {
  return new Error('rhwp 편집기가 아직 준비되지 않았습니다.');
}

export const RhwpVisualEditor = forwardRef<
  RhwpVisualEditorHandle,
  RhwpVisualEditorProps
>(function RhwpVisualEditor(
  { fileName, loadSource, className, onStateChange },
  forwardedRef
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<RhwpEditor | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<RhwpVisualEditorState>({
    status: 'loading',
  });
  onStateChangeRef.current = onStateChange;

  useImperativeHandle(
    forwardedRef,
    () => ({
      loadFile: async (source, nextFileName = fileName) => {
        const editor = editorRef.current;
        if (!editor) throw editorUnavailableError();
        return editor.loadFile(await toEditorBytes(source), nextFileName);
      },
      pageCount: () =>
        editorRef.current?.pageCount() ?? Promise.reject(editorUnavailableError()),
      getPageSvg: (page) =>
        editorRef.current?.getPageSvg(page) ??
        Promise.reject(editorUnavailableError()),
      getRendererDiagnostics: (page) =>
        editorRef.current?.getRendererDiagnostics(page) ??
        Promise.reject(editorUnavailableError()),
      exportHwp: () =>
        editorRef.current?.exportHwp() ?? Promise.reject(editorUnavailableError()),
      exportHwpx: () =>
        editorRef.current?.exportHwpx() ?? Promise.reject(editorUnavailableError()),
      exportHml: () =>
        editorRef.current?.exportHml() ?? Promise.reject(editorUnavailableError()),
      getHmlSaveState: () =>
        editorRef.current?.getHmlSaveState() ??
        Promise.reject(editorUnavailableError()),
      exportHwpVerify: () =>
        editorRef.current?.exportHwpVerify() ??
        Promise.reject(editorUnavailableError()),
      getAiEditingContext: () => {
        const editor = editorRef.current;
        return editor
          ? getRhwpAiEditingContext(editor)
          : Promise.reject(editorUnavailableError());
      },
      replaceAiEditingTarget: (text, expected) => {
        const editor = editorRef.current;
        return editor
          ? replaceRhwpAiEditingTarget(editor, text, expected)
          : Promise.reject(editorUnavailableError());
      },
      getAiFillableFields: () => {
        const editor = editorRef.current;
        return editor
          ? getRhwpAiFillableFields(editor)
          : Promise.reject(editorUnavailableError());
      },
      applyAiFieldValues: (values, expected) => {
        const editor = editorRef.current;
        return editor
          ? applyRhwpAiFieldValues(editor, values, expected)
          : Promise.reject(editorUnavailableError());
      },
      getIframe: () => editorRef.current?.element ?? null,
    }),
    [fileName]
  );

  useEffect(() => {
    let cancelled = false;
    let mountedEditor: RhwpEditor | null = null;

    const updateState = (nextState: RhwpVisualEditorState) => {
      if (cancelled) return;
      setState(nextState);
      onStateChangeRef.current?.(nextState);
    };

    const mountEditor = async () => {
      const container = containerRef.current;
      if (!container) return;

      updateState({ status: 'loading' });
      container.replaceChildren();

      try {
        const [{ createEditor }, source] = await Promise.all([
          import('@rhwp/editor'),
          loadSource(),
        ]);
        if (cancelled) return;

        mountedEditor = await createEditor(container, {
          studioUrl: getRhwpStudioUrl(),
          width: '100%',
          height: '100%',
          handshakeTimeoutMs: 5_000,
          // 대형 문서(20p+)는 Studio의 로드·사전 검증이 기본 60초를 넘길 수 있다
          requestTimeoutMs: 180_000,
        });
        if (cancelled) {
          mountedEditor.destroy();
          mountedEditor = null;
          return;
        }

        editorRef.current = mountedEditor;
        const result = await mountedEditor.loadFile(
          await toEditorBytes(source),
          fileName
        );
        const readyState: RhwpVisualEditorState = {
          status: 'ready',
          pageCount: result.pageCount,
          diagnostics: null,
        };
        updateState(readyState);

        void mountedEditor
          .getRendererDiagnostics(0)
          .then((diagnostics) => {
            if (cancelled || editorRef.current !== mountedEditor) return;
            updateState({ ...readyState, diagnostics });
          })
          .catch(() => {
            // Diagnostics are optional and must not block document editing.
          });
      } catch (error) {
        updateState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'rhwp 편집기를 시작하지 못했습니다.',
        });
        mountedEditor?.destroy();
        mountedEditor = null;
        editorRef.current = null;
      }
    };

    void mountEditor();

    return () => {
      cancelled = true;
      if (editorRef.current === mountedEditor) {
        editorRef.current = null;
      }
      mountedEditor?.destroy();
    };
  }, [fileName, loadSource, reloadKey]);

  return (
    <div
      className={cn(
        'relative min-h-[420px] overflow-hidden bg-slate-100',
        className
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {state.status === 'loading' && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-md backdrop-blur">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="font-medium">문서와 rhwp 편집 엔진을 불러오는 중</span>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white p-6 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-500" />
          <p className="text-sm font-semibold text-slate-700">
            문서 편집기를 열지 못했습니다.
          </p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            {state.message}
          </p>
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            다시 시도
          </Button>
        </div>
      )}
    </div>
  );
});
