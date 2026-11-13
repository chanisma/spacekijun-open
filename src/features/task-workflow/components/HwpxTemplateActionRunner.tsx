import { useState } from 'react';
import {
  Archive,
  Download,
  FileCheck2,
  FilePenLine,
  FilePlus2,
  FileUp,
  History,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  inspectHwpxTemplate,
  type HwpxTemplateFieldMapping,
  type HwpxTemplateInspection,
} from '../document/hwpxTemplateEngine';
import {
  useArchiveDocumentTemplate,
  useCreateDocumentTemplate,
  useCreateDocumentTemplateVersion,
  useDocumentTemplateVersions,
  useDocumentTemplates,
} from '../hooks/useDocumentTemplates';
import {
  useFinalizeTaskActionRun,
  useStartTaskActionRun,
} from '../hooks/useTaskActions';
import {
  downloadDocumentTemplateSource,
  generateHwpxDocument,
  removeGeneratedHwpx,
} from '../services/documentTemplateService';
import { DocumentTemplateVisualEditor } from './DocumentTemplateVisualEditor';
import type {
  TaskAction,
  TaskActionCheckInput,
  TaskActionDocumentTemplate,
} from '../types';

interface HwpxTemplateActionRunnerProps {
  action: TaskAction;
  taskTitle: string;
  workflowId: string;
}

const EMPTY_MAPPING: HwpxTemplateFieldMapping = {
  sourceText: '',
  key: '',
  label: '',
  required: true,
};

function TemplateRegistration({
  previousTemplate,
  onCreated,
  onCancel,
}: {
  previousTemplate?: TaskActionDocumentTemplate;
  onCreated: (template: TaskActionDocumentTemplate) => void;
  onCancel: () => void;
}) {
  const createTemplate = useCreateDocumentTemplate();
  const createVersion = useCreateDocumentTemplateVersion();
  const [name, setName] = useState(previousTemplate?.name ?? '');
  const [description, setDescription] = useState(previousTemplate?.description ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<HwpxTemplateInspection | null>(null);
  const [mappings, setMappings] = useState<HwpxTemplateFieldMapping[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const isSaving = createTemplate.isPending || createVersion.isPending;

  const handleFile = async (selected: File | null) => {
    setFile(selected);
    setInspection(null);
    setMappings([]);
    if (!selected) return;
    if (!/\.hwpx$/i.test(selected.name)) {
      toast.error('HWPX 파일을 선택해주세요.');
      setFile(null);
      return;
    }

    setIsInspecting(true);
    try {
      const result = await inspectHwpxTemplate(selected);
      setInspection(result);
      setName((current) => current || selected.name.replace(/\.hwpx$/i, ''));
      setMappings(
        result.fields.length > 0
          ? result.fields.map((field) => ({
              sourceText: `{{${field.key}}}`,
              key: field.key,
              label: field.label,
              required: field.required,
            }))
          : [{ ...EMPTY_MAPPING }]
      );
      if (result.fields.length === 0) {
        toast.info('기존 문구를 치환 필드로 지정해주세요.');
      }
    } catch (error) {
      setFile(null);
      toast.error(error instanceof Error ? error.message : 'HWPX를 분석하지 못했습니다.');
    } finally {
      setIsInspecting(false);
    }
  };

  const updateMapping = (
    index: number,
    patch: Partial<HwpxTemplateFieldMapping>
  ) => {
    setMappings((current) =>
      current.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...patch } : mapping
      )
    );
  };

  const handleSubmit = async () => {
    if (!file || !name.trim()) {
      toast.error('템플릿 이름과 HWPX 파일을 확인해주세요.');
      return;
    }

    try {
      const templateInput = {
        name,
        description,
        file,
        mappings: mappings.filter(
          (mapping) => mapping.sourceText.trim() || mapping.key.trim()
        ),
      };
      const template = previousTemplate
        ? await createVersion.mutateAsync({
            ...templateInput,
            previousTemplate,
          })
        : await createTemplate.mutateAsync(templateInput);
      toast.success(
        previousTemplate
          ? `HWPX 템플릿 v${template.version}을 등록했습니다.`
          : 'HWPX 템플릿을 등록했습니다.'
      );
      onCreated(template);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '템플릿을 등록하지 못했습니다.');
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">
            {previousTemplate
              ? `${previousTemplate.name} v${previousTemplate.version + 1} 등록`
              : 'HWPX 템플릿 등록'}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {previousTemplate
              ? `현재 v${previousTemplate.version}은 실행 이력 재현을 위해 보존됩니다.`
              : `기존 문구를 필드로 바꾸거나 문서에 입력된 {{필드키}}를 자동으로 찾습니다.`}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hwpx-template-name">템플릿 이름</Label>
          <Input
            id="hwpx-template-name"
            value={name}
            maxLength={120}
            placeholder="예: 교육 계획서"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hwpx-template-file">원본 HWPX</Label>
          <Input
            id="hwpx-template-file"
            type="file"
            accept=".hwpx,application/hwp+zip,application/vnd.hancom.hwpx"
            onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hwpx-template-description">설명</Label>
        <Input
          id="hwpx-template-description"
          value={description}
          maxLength={300}
          placeholder="이 양식을 사용하는 할 일과 작성 기준"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      {isInspecting && (
        <div className="flex items-center text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          HWPX 구조 분석 중
        </div>
      )}

      {inspection && (
        <>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded bg-white px-2 py-1">본문 {inspection.sectionCount}개</span>
            <span className="rounded bg-white px-2 py-1">
              발견 필드 {inspection.fields.length}개
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>치환 필드</Label>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setMappings((current) => [...current, { ...EMPTY_MAPPING }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                필드 추가
              </Button>
            </div>

            {mappings.map((mapping, index) => (
              <div
                key={`${index}-${mapping.key}`}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1.3fr_0.8fr_1fr_auto_auto]"
              >
                <Input
                  value={mapping.sourceText}
                  placeholder="문서의 기존 문구"
                  aria-label="치환할 기존 문구"
                  onChange={(event) =>
                    updateMapping(index, { sourceText: event.target.value })
                  }
                />
                <Input
                  value={mapping.key}
                  placeholder="field_key"
                  aria-label="필드 키"
                  onChange={(event) => updateMapping(index, { key: event.target.value })}
                />
                <Input
                  value={mapping.label}
                  placeholder="표시 이름"
                  aria-label="필드 표시 이름"
                  onChange={(event) => updateMapping(index, { label: event.target.value })}
                />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                  <Checkbox
                    checked={mapping.required}
                    onCheckedChange={(checked) =>
                      updateMapping(index, { required: checked === true })
                    }
                  />
                  필수
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setMappings((current) =>
                      current.filter((_, mappingIndex) => mappingIndex !== index)
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>문서 텍스트 미리보기</Label>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
              {inspection.previewText || '추출된 텍스트가 없습니다.'}
            </pre>
          </div>
        </>
      )}

      <Button
        type="button"
        disabled={!file || !inspection || isSaving}
        onClick={() => void handleSubmit()}
      >
        {isSaving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {previousTemplate ? '새 버전 저장' : '템플릿 저장'}
      </Button>
    </div>
  );
}

export function HwpxTemplateActionRunner({
  action,
  taskTitle,
  workflowId,
}: HwpxTemplateActionRunnerProps) {
  const { data: templates = [], isLoading } = useDocumentTemplates();
  const archiveTemplate = useArchiveDocumentTemplate();
  const startRun = useStartTaskActionRun();
  const finalizeRun = useFinalizeTaskActionRun(action.id);
  const [registrationMode, setRegistrationMode] = useState<
    'new' | 'version' | null
  >(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [visualEditingTemplate, setVisualEditingTemplate] =
    useState<TaskActionDocumentTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<string | null>(
    null
  );

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ??
    templates[0] ??
    null;
  const { data: templateVersions = [], isLoading: isLoadingVersions } =
    useDocumentTemplateVersions(selectedTemplate?.family_id ?? null);
  const isExecuting = isGenerating || startRun.isPending || finalizeRun.isPending;

  const selectTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    setSelectedTemplateId(templateId);
    setValues({});
    setFileName(template ? `${taskTitle}_${template.name}` : '');
  };

  const handleArchive = async () => {
    if (!selectedTemplate) return;
    try {
      await archiveTemplate.mutateAsync(selectedTemplate);
      setSelectedTemplateId('');
      setValues({});
      toast.success('템플릿을 보관했습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '템플릿을 보관하지 못했습니다.');
    }
  };

  const handleTemplateDownload = async (template: TaskActionDocumentTemplate) => {
    setDownloadingTemplateId(template.id);
    try {
      await downloadDocumentTemplateSource(template);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '템플릿 파일을 내려받지 못했습니다.'
      );
    } finally {
      setDownloadingTemplateId(null);
    }
  };

  const handleExecute = async () => {
    if (!selectedTemplate) {
      toast.error('사용할 템플릿을 선택해주세요.');
      return;
    }
    if (isGenerating) return;

    let runId: string | null = null;
    let generatedPath: string | null = null;
    let finalized = false;
    setIsGenerating(true);

    try {
      const run = await startRun.mutateAsync({
        actionId: action.id,
        workflowId,
        inputSnapshot: {
          templateId: selectedTemplate.id,
          templateVersion: selectedTemplate.version,
          templateHash: selectedTemplate.content_sha256,
          fieldKeys: selectedTemplate.fields.map((field) => field.key),
        },
      });
      runId = run.id;

      const generated = await generateHwpxDocument({
        template: selectedTemplate,
        runId,
        values,
        fileName: fileName || `${taskTitle}_${selectedTemplate.name}`,
      });
      generatedPath = generated.path;

      const checks: TaskActionCheckInput[] = [
        {
          key: 'hwpx_structure',
          label: 'HWPX 구조',
          status: generated.sectionCount > 0 ? 'pass' : 'fail',
          message: `${generated.sectionCount}개 본문 섹션 확인`,
          evidence: { sectionCount: generated.sectionCount },
        },
        {
          key: 'field_replacement',
          label: '필드 치환',
          status:
            generated.replacedFields === selectedTemplate.fields.length
              ? 'pass'
              : 'warn',
          message: `${generated.replacedFields}/${selectedTemplate.fields.length}개 필드, ${generated.replacementCount}곳 치환`,
          evidence: {
            fieldCount: selectedTemplate.fields.length,
            replacedFields: generated.replacedFields,
            replacementCount: generated.replacementCount,
          },
        },
        {
          key: 'remaining_placeholders',
          label: '남은 입력 필드',
          status: generated.remainingPlaceholders.length === 0 ? 'pass' : 'fail',
          message:
            generated.remainingPlaceholders.length === 0
              ? '모든 플레이스홀더를 처리했습니다.'
              : `${generated.remainingPlaceholders.join(', ')} 필드가 남아 있습니다.`,
          evidence: { fields: generated.remainingPlaceholders },
        },
      ];

      await finalizeRun.mutateAsync({
        runId,
        status: 'needs_review',
        outputSummary: {
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          fileName: generated.fileName,
          sizeBytes: generated.sizeBytes,
          replacedFields: generated.replacedFields,
          remainingPlaceholderCount: generated.remainingPlaceholders.length,
        },
        checks,
        artifacts: [
          {
            key: 'generated-hwpx',
            type: 'file',
            label: generated.fileName,
            locator: {
              bucket: generated.bucket,
              path: generated.path,
              fileName: generated.fileName,
              templateId: selectedTemplate.id,
            },
            mimeType: generated.mimeType,
            sizeBytes: generated.sizeBytes,
            contentSha256: generated.contentSha256,
            metadata: {
              templateName: selectedTemplate.name,
              templateVersion: selectedTemplate.version,
              replacedFields: generated.replacedFields,
              replacementCount: generated.replacementCount,
              remainingPlaceholders: generated.remainingPlaceholders,
            },
          },
        ],
      });
      finalized = true;
      toast.success('HWPX를 생성했습니다. 결과 파일을 확인한 뒤 검수해주세요.');
    } catch (error) {
      if (generatedPath && !finalized) {
        try {
          await removeGeneratedHwpx(generatedPath);
        } catch {
          // The private orphan can be cleaned up by the retention job.
        }
      }
      if (runId && !finalized) {
        try {
          await finalizeRun.mutateAsync({
            runId,
            status: 'failed',
            errorSummary:
              error instanceof Error ? error.message : 'HWPX 생성에 실패했습니다.',
          });
        } catch {
          // Preserve the original generation error for the user.
        }
      }
      toast.error(error instanceof Error ? error.message : 'HWPX를 생성하지 못했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (registrationMode) {
    return (
      <TemplateRegistration
        previousTemplate={
          registrationMode === 'version' ? selectedTemplate ?? undefined : undefined
        }
        onCreated={(template) => {
          setRegistrationMode(null);
          setSelectedTemplateId(template.id);
          setValues({});
          setFileName(`${taskTitle}_${template.name}`);
        }}
        onCancel={() => setRegistrationMode(null)}
      />
    );
  }

  if (visualEditingTemplate) {
    return (
      <DocumentTemplateVisualEditor
        template={visualEditingTemplate}
        onSaved={(template) => {
          setSelectedTemplateId(template.id);
          setVisualEditingTemplate(template);
          setValues({});
          setFileName(`${taskTitle}_${template.name}`);
        }}
        onClose={() => setVisualEditingTemplate(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label>HWPX 템플릿</Label>
            <Select
              value={selectedTemplate?.id ?? ''}
              onValueChange={selectTemplate}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="템플릿을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} · v{template.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedTemplate && (
            <Button
              variant="outline"
              onClick={() => setVisualEditingTemplate(selectedTemplate)}
            >
              <FilePenLine className="mr-2 h-4 w-4" />
              시각 편집
            </Button>
          )}
          {selectedTemplate && (
            <Button
              variant="outline"
              onClick={() => setRegistrationMode('version')}
            >
              <FileUp className="mr-2 h-4 w-4" />
              새 버전
            </Button>
          )}
          <Button variant="outline" onClick={() => setRegistrationMode('new')}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            새 템플릿
          </Button>
          {selectedTemplate && (
            <Button
              size="icon"
              variant="ghost"
              title="템플릿 보관"
              disabled={archiveTemplate.isPending}
              onClick={() => void handleArchive()}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="mt-4 flex items-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            템플릿 불러오는 중
          </div>
        )}

        {!isLoading && templates.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <FilePlus2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">
              등록된 HWPX 템플릿이 없습니다.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              기존 문서를 올리고 치환할 문구를 지정해 양식으로 만드세요.
            </p>
          </div>
        )}
      </div>

      {selectedTemplate && (
        <>
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">{selectedTemplate.name}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {selectedTemplate.description ||
                `${selectedTemplate.fields.length}개 필드를 입력해 문서를 생성합니다.`}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {selectedTemplate.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`hwpx-field-${field.key}`}>
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </Label>
                <Input
                  id={`hwpx-field-${field.key}`}
                  value={values[field.key] ?? field.defaultValue ?? ''}
                  placeholder={`{{${field.key}}} · ${field.occurrences}곳`}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hwpx-output-file-name">결과 파일 이름</Label>
            <Input
              id="hwpx-output-file-name"
              value={fileName}
              placeholder={`${taskTitle}_${selectedTemplate.name}.hwpx`}
              onChange={(event) => setFileName(event.target.value)}
            />
          </div>

          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isExecuting}
            onClick={() => void handleExecute()}
          >
            {isExecuting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck2 className="mr-2 h-4 w-4" />
            )}
            HWPX 생성 및 검수 요청
          </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-800">템플릿 버전 이력</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              이전 버전은 기존 RUN 재현을 위해 변경 없이 보존됩니다.
            </p>

            {isLoadingVersions ? (
              <div className="mt-3 flex items-center text-xs text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                버전 이력 불러오는 중
              </div>
            ) : (
              <ol className="mt-3 space-y-2">
                {templateVersions.map((template) => {
                  const isCurrent = template.archived_at === null;
                  return (
                    <li
                      key={template.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">
                            v{template.version}
                          </span>
                          <span
                            className={
                              isCurrent
                                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'
                                : 'rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500'
                            }
                          >
                            {isCurrent ? '현재' : '보관'}
                          </span>
                          <span className="truncate text-[11px] text-slate-500">
                            {template.source_file_name}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(template.created_at).toLocaleString('ko-KR')} ·{' '}
                          {template.content_sha256.slice(0, 12)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        title={`v${template.version} 템플릿 다운로드`}
                        disabled={downloadingTemplateId === template.id}
                        onClick={() => void handleTemplateDownload(template)}
                      >
                        {downloadingTemplateId === template.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
