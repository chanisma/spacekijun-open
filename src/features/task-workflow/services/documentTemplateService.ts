import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { requireUser } from '@/lib/authGuard';
import type {
  TaskActionArtifact,
  TaskActionDocumentTemplate,
  TaskActionDocumentTemplateField,
} from '../types';
import {
  fillHwpxTemplate,
  HWPX_MIME_TYPE,
  prepareHwpxTemplate,
  sha256Hex,
  type HwpxTemplateFieldMapping,
} from '../document/hwpxTemplateEngine';

const TEMPLATE_BUCKET = 'task-work-documents';
const templateTable = () => supabase.from('task_action_document_template');
const templateSelect =
  'id, created_by, family_id, previous_version_id, name, description, format, version, source_file_name, storage_bucket, storage_path, mime_type, size_bytes, content_sha256, fields, archived_at, created_at, updated_at';

interface DocumentTemplateFileInput {
  name: string;
  description?: string;
  file: File;
  mappings: HwpxTemplateFieldMapping[];
}

export interface GeneratedHwpxDocument {
  bucket: typeof TEMPLATE_BUCKET;
  path: string;
  fileName: string;
  mimeType: typeof HWPX_MIME_TYPE;
  sizeBytes: number;
  contentSha256: string;
  replacedFields: number;
  replacementCount: number;
  remainingPlaceholders: string[];
  sectionCount: number;
}

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  requireUser(user);
  return user;
}

function parseTemplateFields(value: Json): TaskActionDocumentTemplateField[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const key = typeof item.key === 'string' ? item.key : '';
    const label = typeof item.label === 'string' ? item.label : key;
    const occurrences =
      typeof item.occurrences === 'number' && Number.isFinite(item.occurrences)
        ? item.occurrences
        : 0;
    if (!key) return [];

    return [
      {
        key,
        label,
        required: item.required !== false,
        defaultValue:
          typeof item.defaultValue === 'string' ? item.defaultValue : undefined,
        occurrences,
      },
    ];
  });
}

function toTemplate(
  row: Omit<TaskActionDocumentTemplate, 'fields' | 'format' | 'storage_bucket'> & {
    fields: Json;
    format: string;
    storage_bucket: string;
  }
): TaskActionDocumentTemplate {
  return {
    ...row,
    format: 'hwpx',
    storage_bucket: TEMPLATE_BUCKET,
    fields: parseTemplateFields(row.fields),
  };
}

function safeFileName(value: string): string {
  const withoutControlCharacters = Array.from(value)
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const base = withoutControlCharacters
    .replace(/\.hwpx$/i, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 120);
  return `${base || '생성문서'}.hwpx`;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function listDocumentTemplates(): Promise<TaskActionDocumentTemplate[]> {
  const { data, error } = await templateTable()
    .select(templateSelect)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) =>
    toTemplate(
      row as unknown as Parameters<typeof toTemplate>[0]
    )
  );
}

export async function listDocumentTemplateVersions(
  familyId: string
): Promise<TaskActionDocumentTemplate[]> {
  const { data, error } = await templateTable()
    .select(templateSelect)
    .eq('family_id', familyId)
    .order('version', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) =>
    toTemplate(row as unknown as Parameters<typeof toTemplate>[0])
  );
}

async function prepareAndUploadTemplate(
  input: DocumentTemplateFileInput,
  userId: string,
  id: string
) {
  if (!/\.hwpx$/i.test(input.file.name)) {
    throw new Error('HWPX 파일만 템플릿으로 등록할 수 있습니다.');
  }

  const prepared = await prepareHwpxTemplate(input.file, input.mappings);
  const storagePath = `${userId}/templates/${id}/template.hwpx`;
  const contentSha256 = await sha256Hex(prepared.blob);

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(storagePath, prepared.blob, {
      cacheControl: '3600',
      contentType: HWPX_MIME_TYPE,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  return { prepared, storagePath, contentSha256 };
}

export async function createDocumentTemplate(
  input: DocumentTemplateFileInput
): Promise<TaskActionDocumentTemplate> {
  const user = await getCurrentUser();
  const id = crypto.randomUUID();
  const { prepared, storagePath, contentSha256 } =
    await prepareAndUploadTemplate(input, user.id, id);

  const { data, error } = await templateTable()
    .insert({
      id,
      created_by: user.id,
      family_id: id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      source_file_name: input.file.name.slice(0, 255),
      storage_path: storagePath,
      mime_type: HWPX_MIME_TYPE,
      size_bytes: prepared.blob.size,
      content_sha256: contentSha256,
      fields: prepared.fields as unknown as Json,
    })
    .select(templateSelect)
    .single();

  if (error) {
    await supabase.storage.from(TEMPLATE_BUCKET).remove([storagePath]);
    throw error;
  }

  return toTemplate(data as unknown as Parameters<typeof toTemplate>[0]);
}

export async function createDocumentTemplateVersion(
  input: DocumentTemplateFileInput & {
    previousTemplate: TaskActionDocumentTemplate;
  }
): Promise<TaskActionDocumentTemplate> {
  const user = await getCurrentUser();
  if (input.previousTemplate.created_by !== user.id) {
    throw new Error('소유한 템플릿만 새 버전으로 등록할 수 있습니다.');
  }
  if (input.previousTemplate.archived_at) {
    throw new Error('현재 버전을 기준으로 새 버전을 등록해주세요.');
  }

  const id = crypto.randomUUID();
  const { prepared, storagePath, contentSha256 } =
    await prepareAndUploadTemplate(input, user.id, id);

  const { data, error } = await supabase.rpc(
    'create_task_action_document_template_version',
    {
      p_previous_template_id: input.previousTemplate.id,
      p_id: id,
      p_name: input.name.trim(),
      p_description: input.description?.trim() || '',
      p_source_file_name: input.file.name.slice(0, 255),
      p_storage_path: storagePath,
      p_mime_type: HWPX_MIME_TYPE,
      p_size_bytes: prepared.blob.size,
      p_content_sha256: contentSha256,
      p_fields: prepared.fields as unknown as Json,
    }
  );

  if (error) {
    await supabase.storage.from(TEMPLATE_BUCKET).remove([storagePath]);
    throw error;
  }

  return toTemplate(data as unknown as Parameters<typeof toTemplate>[0]);
}

export async function archiveDocumentTemplate(template: TaskActionDocumentTemplate): Promise<void> {
  const { error } = await templateTable()
    .update({ archived_at: new Date().toISOString() })
    .eq('id', template.id);
  if (error) throw error;
}

export async function downloadDocumentTemplateSource(
  template: TaskActionDocumentTemplate
): Promise<void> {
  const data = await fetchDocumentTemplateSource(template);
  triggerBlobDownload(data, `${template.name}_v${template.version}.hwpx`);
}

export async function fetchDocumentTemplateSource(
  template: TaskActionDocumentTemplate
): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(template.storage_bucket)
    .download(template.storage_path);
  if (error) throw error;
  return data;
}

export async function generateHwpxDocument(input: {
  template: TaskActionDocumentTemplate;
  runId: string;
  values: Record<string, string>;
  fileName: string;
}): Promise<GeneratedHwpxDocument> {
  const user = await getCurrentUser();
  const { data: source, error: downloadError } = await supabase.storage
    .from(input.template.storage_bucket)
    .download(input.template.storage_path);
  if (downloadError) throw downloadError;

  const generated = await fillHwpxTemplate(
    source,
    input.template.fields,
    input.values
  );
  const fileName = safeFileName(input.fileName);
  const path = `${user.id}/runs/${input.runId}/${crypto.randomUUID()}.hwpx`;
  const contentSha256 = await sha256Hex(generated.blob);

  const { error: uploadError } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, generated.blob, {
      cacheControl: '3600',
      contentType: HWPX_MIME_TYPE,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  return {
    bucket: TEMPLATE_BUCKET,
    path,
    fileName,
    mimeType: HWPX_MIME_TYPE,
    sizeBytes: generated.blob.size,
    contentSha256,
    replacedFields: generated.replacedFields,
    replacementCount: generated.replacementCount,
    remainingPlaceholders: generated.remainingPlaceholders,
    sectionCount: generated.sectionCount,
  };
}

export async function removeGeneratedHwpx(path: string): Promise<void> {
  const { error } = await supabase.storage.from(TEMPLATE_BUCKET).remove([path]);
  if (error) throw error;
}

/** 파일 ARTIFACT의 실제 바이트 — 미리보기·다운로드 공용 */
export async function fetchTaskActionFileArtifact(
  artifact: TaskActionArtifact
): Promise<{ blob: Blob; fileName: string }> {
  if (artifact.artifact_type !== 'file') {
    throw new Error('파일 결과물이 아닙니다.');
  }

  const bucket =
    typeof artifact.locator.bucket === 'string' ? artifact.locator.bucket : '';
  const path =
    typeof artifact.locator.path === 'string' ? artifact.locator.path : '';
  const fileName =
    typeof artifact.locator.fileName === 'string'
      ? artifact.locator.fileName
      : artifact.label;
  if (bucket !== TEMPLATE_BUCKET || !path) {
    throw new Error('파일 결과물 위치 정보가 올바르지 않습니다.');
  }

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return { blob: data, fileName };
}

export async function downloadTaskActionFileArtifact(
  artifact: TaskActionArtifact
): Promise<void> {
  const { blob, fileName } = await fetchTaskActionFileArtifact(artifact);
  triggerBlobDownload(blob, fileName);
}
