import { useCallback, useRef, useState } from 'react';
import {
  CheckCircle2,
  FilePenLine,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  RhwpVisualEditor,
  type RhwpVisualEditorHandle,
  type RhwpVisualEditorState,
} from '@/components/rhwp';
import { Button } from '@/components/ui/button';
import { RHWP_STUDIO_VERSION } from '@/lib/rhwp/config';
import {
  HWPX_MIME_TYPE,
  type HwpxTemplateFieldMapping,
} from '../document/hwpxTemplateEngine';
import { useCreateDocumentTemplateVersion } from '../hooks/useDocumentTemplates';
import { fetchDocumentTemplateSource } from '../services/documentTemplateService';
import type { TaskActionDocumentTemplate } from '../types';

interface DocumentTemplateVisualEditorProps {
  template: TaskActionDocumentTemplate;
  onSaved: (template: TaskActionDocumentTemplate) => void;
  onClose: () => void;
}

function editorFileName(template: TaskActionDocumentTemplate, version: number): string {
  const safeName = template.name
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 100);
  return `${safeName || 'HWPX_템플릿'}_v${version}.hwpx`;
}

function existingFieldMappings(
  template: TaskActionDocumentTemplate
): HwpxTemplateFieldMapping[] {
  return template.fields.map((field) => ({
    sourceText: `{{${field.key}}}`,
    key: field.key,
    label: field.label,
    required: field.required,
    defaultValue: field.defaultValue,
  }));
}

export function DocumentTemplateVisualEditor({
  template,
  onSaved,
  onClose,
}: DocumentTemplateVisualEditorProps) {
  const editorRef = useRef<RhwpVisualEditorHandle | null>(null);
  const createVersion = useCreateDocumentTemplateVersion();
  const [editorState, setEditorState] = useState<RhwpVisualEditorState>({
    status: 'loading',
  });
  const loadSource = useCallback(
    () => fetchDocumentTemplateSource(template),
    [template]
  );

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!editor || editorState.status !== 'ready' || createVersion.isPending) {
      return;
    }

    try {
      const bytes = await editor.exportHwpx();
      if (bytes.byteLength === 0) {
        throw new Error('편집기에서 빈 HWPX가 반환되었습니다.');
      }

      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const file = new File(
        [buffer],
        editorFileName(template, template.version + 1),
        { type: HWPX_MIME_TYPE }
      );
      const savedTemplate = await createVersion.mutateAsync({
        previousTemplate: template,
        name: template.name,
        description: template.description ?? undefined,
        file,
        mappings: existingFieldMappings(template),
      });

      toast.success(`시각 편집본을 v${savedTemplate.version}으로 저장했습니다.`);
      onSaved(savedTemplate);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : '시각 편집본을 새 버전으로 저장하지 못했습니다.'
      );
    }
  };

  const diagnostics =
    editorState.status === 'ready' ? editorState.diagnostics : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FilePenLine className="h-4 w-4 text-blue-600" />
            <h3 className="truncate text-sm font-bold text-slate-800">
              {template.name} v{template.version} 시각 편집
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              rhwp {RHWP_STUDIO_VERSION}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            편집 결과는 원본을 덮어쓰지 않고 v{template.version + 1}로 저장됩니다.
            치환 필드 표기{' '}
            <code className="rounded bg-slate-100 px-1">{'{{field_key}}'}</code>는
            유지해주세요.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editorState.status === 'ready' && (
            <div className="hidden items-center gap-1.5 text-[11px] text-slate-500 md:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {editorState.pageCount}쪽
              {diagnostics?.effectiveBackend
                ? ` · ${diagnostics.effectiveBackend}`
                : ''}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={editorState.status !== 'ready' || createVersion.isPending}
            onClick={() => void handleSave()}
          >
            {createVersion.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            새 버전 저장
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="시각 편집 닫기"
            disabled={createVersion.isPending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <RhwpVisualEditor
        ref={editorRef}
        className="h-[68vh] min-h-[520px] rounded-xl border border-slate-300 shadow-inner"
        fileName={editorFileName(template, template.version)}
        loadSource={loadSource}
        onStateChange={setEditorState}
      />

      <p className="text-[11px] text-slate-400">
        문서 데이터는 인증된 Storage에서 브라우저로 내려받아 같은 출처의 편집기에
        전달됩니다. 편집기 자체 다운로드가 아닌 위의 ‘새 버전 저장’을 사용해야
        업무 흐름의 템플릿 이력에 기록됩니다.
      </p>
    </div>
  );
}
