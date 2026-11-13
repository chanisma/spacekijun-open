import { supabase } from '@/integrations/supabase/client';

export interface GradeAnalysisRecord {
  id: string;
  grade: number;
  exam_year: number;
  exam_month: number;
  title: string | null;
  storage_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

const BUCKET = 'evalearn-grade-analysis';

const buildStoragePath = (grade: number, year: number, month: number) =>
  `grade-${grade}/${year}-${String(month).padStart(2, '0')}.html`;

/**
 * List all grade analysis records, newest first.
 */
export async function listGradeAnalyses(): Promise<GradeAnalysisRecord[]> {
  const { data, error } = await supabase
    .from('evalearn_grade_analysis' as any)
    .select('*')
    .order('exam_year', { ascending: false })
    .order('exam_month', { ascending: false })
    .order('grade', { ascending: true });

  if (error) throw error;
  return (data as unknown as GradeAnalysisRecord[]) || [];
}

/**
 * List analyses for a specific grade, newest first.
 */
export async function listGradeAnalysesForGrade(grade: number): Promise<GradeAnalysisRecord[]> {
  const { data, error } = await supabase
    .from('evalearn_grade_analysis' as any)
    .select('*')
    .eq('grade', grade)
    .order('exam_year', { ascending: false })
    .order('exam_month', { ascending: false });

  if (error) throw error;
  return (data as unknown as GradeAnalysisRecord[]) || [];
}

/**
 * List analyses for a cohort identified by its entry year.
 *
 * A cohort follows students through grades 1→2→3 across three consecutive
 * academic years. entry_year = exam_year - grade + 1.
 *
 * Example: entry_year=2024 returns (1학년, 2024), (2학년, 2025), (3학년, 2026).
 *
 * Ordered so most recent exam (highest grade/year + latest month) comes first.
 */
export async function listGradeAnalysesForCohort(entryYear: number): Promise<GradeAnalysisRecord[]> {
  // Need rows where exam_year - grade + 1 = entryYear
  // i.e. (grade=1 AND exam_year=entryYear) OR (grade=2 AND exam_year=entryYear+1) OR (grade=3 AND exam_year=entryYear+2)
  const { data, error } = await supabase
    .from('evalearn_grade_analysis' as any)
    .select('*')
    .or(
      `and(grade.eq.1,exam_year.eq.${entryYear}),and(grade.eq.2,exam_year.eq.${entryYear + 1}),and(grade.eq.3,exam_year.eq.${entryYear + 2})`
    )
    .order('grade', { ascending: false })
    .order('exam_year', { ascending: false })
    .order('exam_month', { ascending: false });

  if (error) throw error;
  return (data as unknown as GradeAnalysisRecord[]) || [];
}

/**
 * Get a time-limited signed URL for an HTML report so it can be opened in a new tab.
 * The storage bucket is private; signed URLs let us expose the file without making the bucket public.
 */
export async function getGradeAnalysisSignedUrl(storagePath: string, expiresInSec = 600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('서명된 URL을 생성하지 못했습니다.');
  return data.signedUrl;
}

/**
 * Download the stored HTML bytes, re-wrap in a Blob with an explicit
 * `text/html; charset=utf-8` content type, and return a `blob:` URL.
 *
 * This bypasses any Content-Type / charset header issues from Supabase
 * Storage / Cloudflare — the browser sees an authoritative MIME type
 * from the blob itself and honors the document's own meta charset tag.
 *
 * The returned URL is alive only while the page holds a reference; caller
 * should `URL.revokeObjectURL(url)` when done.
 */
export async function getGradeAnalysisBlobUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error('파일을 찾을 수 없습니다.');

  // Re-wrap with explicit UTF-8 content type. The raw bytes are UTF-8
  // (ensureUtf8MetaCharset guarantees that at upload time); we just need
  // the browser to be told so unambiguously when opening the new tab.
  const utf8Blob = new Blob([await data.arrayBuffer()], {
    type: 'text/html; charset=utf-8',
  });
  return URL.createObjectURL(utf8Blob);
}

/**
 * Detect the source file's actual encoding. If the HTML contains a non-UTF-8
 * charset declaration (e.g. euc-kr, cp949, ks_c_5601-1987), the file's bytes
 * were likely saved in that encoding, so we must re-decode from the raw bytes
 * using that charset — not use `file.text()` which always assumes UTF-8.
 */
async function readFileAsString(file: File): Promise<{ text: string; detectedCharset: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Peek the first 4 KB as Latin-1 so charset meta tags remain readable even if
  // the real encoding is something else. `windows-1252` is a safe superset of ASCII.
  const peekDecoder = new TextDecoder('windows-1252');
  const peek = peekDecoder.decode(bytes.slice(0, 4096)).toLowerCase();

  // Look for: <meta charset="X"> or <meta http-equiv="content-type" content="...charset=X">
  let detected: string | null = null;
  const m1 = peek.match(/<meta\s+charset\s*=\s*["']?([a-z0-9_\-]+)/i);
  if (m1) detected = m1[1];
  if (!detected) {
    const m2 = peek.match(/<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]+charset\s*=\s*["']?([a-z0-9_\-]+)/i);
    if (m2) detected = m2[1];
  }

  const normalized = (detected || 'utf-8').toLowerCase().replace(/[_\-]/g, '');
  // Map Korean legacy aliases → TextDecoder labels
  const charsetLabel =
    normalized === 'euckr' || normalized === 'ksc56011987' || normalized === 'cp949' || normalized === 'ksx1001' || normalized === 'windows949'
      ? 'euc-kr'
      : detected || 'utf-8';

  try {
    const decoder = new TextDecoder(charsetLabel, { fatal: false });
    return { text: decoder.decode(bytes), detectedCharset: charsetLabel };
  } catch {
    // Unknown label → fall back to UTF-8
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return { text: decoder.decode(bytes), detectedCharset: 'utf-8' };
  }
}

/**
 * Ensure the HTML document self-declares UTF-8.
 *
 * Strategy:
 * 1. Detect the source file's real encoding from its <meta> tag (defaults UTF-8).
 * 2. Decode the bytes accordingly → a proper Unicode string.
 * 3. Strip any existing <meta charset> / <meta http-equiv="content-type"> tags.
 * 4. Re-insert a single canonical `<meta charset="utf-8">` right after <head>.
 * 5. Re-encode as UTF-8 bytes for storage.
 *
 * This fixes the common case where Korean Windows tools save the HTML as
 * EUC-KR/CP-949 and include a matching meta tag — which makes Chrome/Edge
 * decode the (later UTF-8-transcoded) bytes as EUC-KR, producing mojibake.
 */
async function ensureUtf8MetaCharset(file: File): Promise<Blob> {
  const { text: decoded, detectedCharset } = await readFileAsString(file);

  // Strip BOM if present.
  let content = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;

  // Remove existing meta charset declarations (case-insensitive, spans whitespace).
  content = content.replace(/<meta\s+charset\s*=\s*["']?[^"'>\s]+["']?\s*\/?\s*>/gi, '');
  content = content.replace(
    /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*>/gi,
    ''
  );

  const metaTag = '<meta charset="utf-8">';
  const headMatch = content.match(/<head[^>]*>/i);
  let patched: string;
  if (headMatch) {
    const idx = headMatch.index! + headMatch[0].length;
    patched = content.slice(0, idx) + metaTag + content.slice(idx);
  } else {
    patched = metaTag + content;
  }

  // Encode as UTF-8 bytes explicitly so the stored file byte-matches the meta declaration.
  const utf8Bytes = new TextEncoder().encode(patched);

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info('[GradeAnalysis] upload: detected source charset =', detectedCharset,
      '| input bytes =', file.size,
      '| output bytes =', utf8Bytes.byteLength);
  }

  return new Blob([utf8Bytes], { type: 'text/html; charset=utf-8' });
}

/**
 * Upload an HTML file to storage, upserting (overwriting if same path exists),
 * then upsert the metadata row.
 */
export async function uploadGradeAnalysis(args: {
  grade: number;
  year: number;
  month: number;
  title?: string;
  file: File;
}): Promise<GradeAnalysisRecord> {
  const { grade, year, month, title, file } = args;

  if (!/\.html?$/i.test(file.name)) {
    throw new Error('HTML 파일만 업로드 가능합니다.');
  }

  const path = buildStoragePath(grade, year, month);
  const payload = await ensureUtf8MetaCharset(file);

  // Upload (upsert so re-upload overwrites)
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, payload, {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
    });
  if (upErr) throw upErr;

  // Get current user for uploaded_by
  const { data: userData } = await supabase.auth.getUser();
  const uploadedBy = userData.user?.id ?? null;

  // Upsert metadata row
  const { data, error } = await supabase
    .from('evalearn_grade_analysis' as any)
    .upsert(
      {
        grade,
        exam_year: year,
        exam_month: month,
        title: title?.trim() || null,
        storage_path: path,
        file_size: payload.size,
        uploaded_by: uploadedBy,
      },
      { onConflict: 'grade,exam_year,exam_month' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as unknown as GradeAnalysisRecord;
}

/**
 * Delete a grade analysis record (and its storage file).
 */
export async function deleteGradeAnalysis(record: GradeAnalysisRecord): Promise<void> {
  // Delete the DB row first — RLS enforces admin-only
  const { error: delErr } = await supabase
    .from('evalearn_grade_analysis' as any)
    .delete()
    .eq('id', record.id);
  if (delErr) throw delErr;

  // Best-effort: delete the storage file (ignore errors; file may already be gone)
  await supabase.storage.from(BUCKET).remove([record.storage_path]);
}

/**
 * Download the HTML content as text for rendering in an iframe srcDoc.
 */
export async function downloadGradeAnalysisHtml(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error('파일을 찾을 수 없습니다.');
  return await data.text();
}

/**
 * Re-run the charset normalization on an already-uploaded file.
 *
 * Downloads the raw bytes, detects its real encoding via <meta>, transcodes to
 * UTF-8, strips/replaces charset declarations, re-uploads. Use this to fix
 * legacy uploads that were stored as EUC-KR/CP-949.
 */
export async function repairGradeAnalysisEncoding(record: GradeAnalysisRecord): Promise<{
  detectedCharset: string;
  originalBytes: number;
  newBytes: number;
}> {
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(record.storage_path);
  if (dlErr) throw dlErr;
  if (!blob) throw new Error('파일을 찾을 수 없습니다.');

  // Wrap the blob as a File for the existing pipeline
  const pseudoFile = new File([blob], record.storage_path.split('/').pop() || 'report.html', {
    type: 'text/html',
  });

  const originalBytes = blob.size;
  const { text: _text, detectedCharset } = await readFileAsString(pseudoFile);
  const patched = await ensureUtf8MetaCharset(pseudoFile);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(record.storage_path, patched, {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
    });
  if (upErr) throw upErr;

  // Update file_size in DB
  await supabase
    .from('evalearn_grade_analysis' as any)
    .update({ file_size: patched.size })
    .eq('id', record.id);

  return { detectedCharset, originalBytes, newBytes: patched.size };
}
