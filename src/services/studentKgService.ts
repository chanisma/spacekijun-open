import { supabase } from '@/integrations/supabase/client';

// =============================================
// Types for Knowledge Graph storage and retrieval
// =============================================

/** Entity source reference (어떤 교과/활동에서 추출되었는지) */
export interface KgEntitySource {
  category: string;      // e.g. "regular", "career", "자율활동"
  subject: string;       // e.g. "수학I", "동아리활동"
  grade: number;
  semester: number | null;
}

/** Single entity node in a KG (스킬 출력 포맷) */
export interface KgEntity {
  id: string;                  // e.g. "e1", "e2"
  type: string;                // e.g. "Competency", "Activity", "Interest", "Book"
  name: string;                // Display name (e.g. "비판적 사고력")
  confidence: number;          // 0.0 ~ 1.0
  sources: KgEntitySource[];   // 추출 출처 목록
  evidence: string[];          // 원문 인용 발췌
}

/** Single relation triple in a KG (스킬 출력 포맷) */
export interface KgTriple {
  subject: string;        // Source entity ID or "Student"
  predicate: string;      // e.g. "DEMONSTRATED", "PERFORMED", "RELATED_TO"
  object: string;         // Target entity ID
  confidence: number;     // 0.0 ~ 1.0
  evidence?: string;      // 원문 인용
  source?: KgEntitySource; // 추출 출처
}

/** Low-confidence triple (별도 분리) */
export interface KgLowConfidenceTriple extends KgTriple {
  reason?: string;        // 낮은 confidence 사유
}

/** Source statistics */
export interface KgSourceStats {
  total_texts: number;
  categories: Record<string, number>;
}

/** Full KG JSON structure as stored in kg_json column (스킬 출력 포맷) */
export interface KgJson {
  student_code: string;
  file_slug?: string;
  extracted_at: string;
  source_stats: KgSourceStats;
  entities: KgEntity[];
  triples: KgTriple[];
  low_confidence?: KgLowConfidenceTriple[];
  confidence_guide?: Record<string, unknown>;
  entity_summary?: Record<string, unknown>;
}

/** Row shape from student_kg_versions table */
export interface StudentKgVersion {
  id: string;
  student_id: string;
  version: number;
  kg_json: KgJson;
  source_categories: string[];
  created_by: string | null;
  created_at: string;
}

/** Input parameters for saving a new KG version */
export interface SaveKgParams {
  studentId: string;
  kgJson: KgJson;
  sourceCategories?: string[];
}

/** Result returned after successful KG save */
export interface SaveKgResult {
  id: string;
  version: number;
  student_id: string;
  created_at: string;
}

// =============================================
// Constants
// =============================================

/** Maximum retry attempts for version conflict (unique constraint violation) */
const MAX_VERSION_RETRIES = 3;

/** PostgreSQL unique_violation error code */
const PG_UNIQUE_VIOLATION = '23505';

// =============================================
// Internal helpers
// =============================================

/**
 * Determines the next version number for a student by querying max(version) + 1.
 * Used as fallback when the RPC function is unavailable.
 */
async function resolveNextVersion(studentId: string): Promise<number> {
  const { data: maxRow, error } = await supabase
    .from('student_kg_versions')
    .select('version')
    .eq('student_id', studentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[KG Service] 버전 번호 조회 실패:', error);
    throw error;
  }

  return (maxRow?.version ?? 0) + 1;
}

/**
 * Checks whether a Supabase/Postgres error is a unique constraint violation.
 */
function isUniqueViolation(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code: string }).code === PG_UNIQUE_VIOLATION;
  }
  return false;
}

/** Result shape from save_kg_version_secure RPC */
interface RpcSaveResult {
  id: string;
  version: number;
  student_id: string;
  created_at: string;
}

/**
 * Saves a KG version using the server-side RPC function (save_kg_version_secure).
 * The RPC atomically:
 *   1. Acquires an advisory lock per student_id (prevents concurrent version conflicts)
 *   2. Queries MAX(version) + 1 for the student
 *   3. Inserts the new row with the computed version
 *   4. Returns the inserted row metadata
 *
 * This is the preferred path — no client-side retry needed because the
 * advisory lock serializes concurrent writes for the same student.
 *
 * @returns SaveKgResult on success, or null if the RPC is unavailable (caller should fallback)
 */
async function saveViaRpc(
  studentId: string,
  kgJson: KgJson,
  sourceCategories: string[]
): Promise<SaveKgResult | null> {
  const { data, error } = await supabase.rpc('save_kg_version_secure', {
    p_student_id: studentId,
    p_kg_json: kgJson as unknown as import('@/integrations/supabase/types').Json,
    p_source_categories: sourceCategories,
  });

  if (error) {
    // If the RPC function doesn't exist yet (not migrated), return null to trigger fallback
    const errMsg = typeof error.message === 'string' ? error.message : '';
    if (
      errMsg.includes('function') &&
      (errMsg.includes('does not exist') || errMsg.includes('not found'))
    ) {
      console.warn('[KG Service] save_kg_version_secure RPC를 찾을 수 없습니다. 클라이언트 폴백을 사용합니다.');
      return null;
    }
    throw error;
  }

  // RPC returns an array of rows (TABLE return type) — take the first
  const row: RpcSaveResult | undefined = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('[KG Service] RPC가 결과를 반환하지 않았습니다.');
  }

  return {
    id: row.id,
    version: row.version,
    student_id: row.student_id,
    created_at: row.created_at,
  };
}

// =============================================
// NOTE: Entity and relation normalization is handled by DB triggers:
//   - trg_populate_kg_entities  (migration 20260328000004)
//   - trg_populate_kg_relations (migration 20260328000005)
// These triggers fire AFTER INSERT OR UPDATE OF kg_json on student_kg_versions,
// guaranteeing denormalized tables stay in sync regardless of insert path
// (RPC, direct insert, or client-side fallback).
// =============================================

// =============================================
// Persistence Functions
// =============================================

/**
 * 학생의 KG JSON을 Supabase에 저장합니다 (버전 자동 증가).
 * Persists a Knowledge Graph JSON for a student with auto-incrementing version.
 *
 * Dual storage strategy:
 * 1. Inserts full KG JSON into student_kg_versions (jsonb column)
 * 2. Normalizes entities → student_kg_entities rows
 * 3. Normalizes relations → student_kg_relations rows
 *
 * Version number calculation:
 * - Queries max(version) for the student and increments by 1
 * - Protected by DB unique constraint (student_id, version)
 * - On concurrent conflict (unique_violation / 23505), retries up to MAX_VERSION_RETRIES
 *   times with a freshly recalculated version number
 *
 * Append-only guarantee:
 * - This function ONLY inserts new rows; it never updates or deletes existing versions
 * - Each call produces exactly one new student_kg_versions row
 *
 * @param params - SaveKgParams with studentId, kgJson, and optional sourceCategories
 * @returns SaveKgResult with the new version's id, version number, student_id, and created_at
 * @throws Error if insert fails after retries (e.g. RLS denial, FK violation, network error)
 */
export async function saveKgVersion(params: SaveKgParams): Promise<SaveKgResult> {
  const { studentId, kgJson, sourceCategories = [] } = params;

  // ── Validate input ──
  if (!studentId) {
    throw new Error('[KG Service] student_id는 필수입니다.');
  }
  if (!kgJson || !Array.isArray(kgJson.entities) || !Array.isArray(kgJson.relations)) {
    throw new Error('[KG Service] kgJson은 entities와 relations 배열을 포함해야 합니다.');
  }

  // ── 1. Attempt save via server-side RPC (preferred — atomic advisory lock) ──
  let result: SaveKgResult | null = null;
  try {
    result = await saveViaRpc(studentId, kgJson, sourceCategories);
  } catch (rpcError) {
    // RPC threw a real error (not "function not found") — propagate immediately
    console.error('[KG Service] RPC 저장 실패:', rpcError);
    throw rpcError;
  }

  // ── 2. If RPC unavailable (null return), fall back to client-side insert with retry ──
  if (!result) {
    result = await saveViaClientInsert(studentId, kgJson, sourceCategories);
  }

  // ── 3. Denormalized tables are auto-populated by DB triggers ──
  // NOTE: Entities are auto-populated by DB trigger (trg_populate_kg_entities)
  //       Relations are auto-populated by DB trigger (trg_populate_kg_relations)
  //       on student_kg_versions INSERT/UPDATE — no app-level insert needed.

  console.log(
    `[KG Service] KG 저장 완료: student=${studentId}, version=${result.version}, ` +
    `entities=${kgJson.entities.length}, relations=${kgJson.relations.length}`
  );

  return result;
}

/**
 * Client-side fallback insert with version conflict retry loop.
 * Used when the save_kg_version_secure RPC is not available (e.g. migration pending).
 *
 * The DB enforces UNIQUE(student_id, version). If two concurrent saves
 * calculate the same next version, one will fail with 23505. We retry
 * with a freshly-queried version number up to MAX_VERSION_RETRIES times.
 */
async function saveViaClientInsert(
  studentId: string,
  kgJson: KgJson,
  sourceCategories: string[]
): Promise<SaveKgResult> {
  const { data: { user } } = await supabase.auth.getUser();
  const createdBy = user?.id ?? null;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
    const nextVersion = await resolveNextVersion(studentId);

    const { data: versionRow, error: insertError } = await supabase
      .from('student_kg_versions')
      .insert({
        student_id: studentId,
        version: nextVersion,
        kg_json: kgJson as unknown as import('@/integrations/supabase/types').Json,
        source_categories: sourceCategories,
        created_by: createdBy,
      })
      .select('id, version, student_id, created_at')
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError) && attempt < MAX_VERSION_RETRIES - 1) {
        console.warn(
          `[KG Service] 버전 충돌 (attempt ${attempt + 1}/${MAX_VERSION_RETRIES}): ` +
          `student=${studentId}, version=${nextVersion}. 재시도합니다.`
        );
        lastError = insertError;
        continue;
      }
      console.error('[KG Service] KG 버전 저장 실패:', insertError);
      throw insertError;
    }

    return {
      id: versionRow.id,
      version: versionRow.version,
      student_id: versionRow.student_id,
      created_at: versionRow.created_at,
    };
  }

  console.error('[KG Service] 모든 재시도 실패:', lastError);
  throw lastError ?? new Error('[KG Service] KG 버전 저장에 실패했습니다.');
}

// =============================================
// Query Functions
// =============================================

/** Result shape from verify_kg_version_integrity RPC */
export interface KgVersionIntegrity {
  total_versions: number;
  max_version: number;
  min_version: number;
  versions_contiguous: boolean;
  min_created_at: string | null;
  max_created_at: string | null;
}

/**
 * 학생의 최신 KG 버전을 RPC를 통해 조회합니다.
 * Retrieves the most recent KG version via the get_latest_kg_version RPC,
 * which enforces role-based access control server-side.
 *
 * Falls back to a direct client-side query if the RPC is not yet available.
 *
 * @param studentId - The student_basic_info.id value
 * @returns The latest StudentKgVersion or null if none exists
 */
export async function fetchLatestKgVersion(
  studentId: string
): Promise<StudentKgVersion | null> {
  // ── Try RPC first (preferred — enforces access control server-side) ──
  try {
    const rpcResult = await fetchLatestKgVersionViaRpc(studentId);
    if (rpcResult !== undefined) {
      return rpcResult;
    }
  } catch {
    // RPC unavailable, fall through to direct query
  }

  // ── Fallback: direct table query ──
  return fetchLatestKgVersionDirect(studentId);
}

/**
 * RPC-based latest KG retrieval using get_latest_kg_version.
 * Returns undefined (not null) when the RPC function is unavailable,
 * so the caller can distinguish "no data" (null) from "RPC missing" (undefined).
 */
async function fetchLatestKgVersionViaRpc(
  studentId: string
): Promise<StudentKgVersion | null | undefined> {
  const { data, error } = await supabase.rpc('get_latest_kg_version', {
    p_student_id: studentId,
  });

  if (error) {
    const errMsg = typeof error.message === 'string' ? error.message : '';
    if (
      errMsg.includes('function') &&
      (errMsg.includes('does not exist') || errMsg.includes('not found'))
    ) {
      console.warn('[KG Service] get_latest_kg_version RPC를 찾을 수 없습니다. 직접 쿼리 폴백을 사용합니다.');
      return undefined; // signals "RPC unavailable"
    }
    console.error('[KG Service] RPC 최신 KG 버전 조회 실패:', error);
    throw error;
  }

  // RPC returns TABLE → array. Empty array means no data.
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    student_id: row.student_id,
    version: row.version,
    kg_json: row.kg_json as unknown as KgJson,
    source_categories: row.source_categories ?? [],
    created_by: row.created_by ?? null,
    created_at: row.created_at,
  };
}

/**
 * Direct client-side query fallback for latest KG version.
 * Uses ORDER BY version DESC LIMIT 1 with the composite index.
 */
async function fetchLatestKgVersionDirect(
  studentId: string
): Promise<StudentKgVersion | null> {
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('id, student_id, version, kg_json, source_categories, created_by, created_at')
    .eq('student_id', studentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[KG Service] 최신 KG 버전 조회 실패:', error);
    throw error;
  }

  if (!data) return null;

  return data as unknown as StudentKgVersion;
}

/**
 * 학생의 KG 버전 무결성을 검증합니다.
 * Verifies that all KG versions for a student remain intact by calling
 * the verify_kg_version_integrity RPC. Checks:
 * - versions form a contiguous 1..N sequence (no gaps, no deletions)
 * - total count matches max version number
 *
 * Only callable by teachers/admins (enforced server-side).
 *
 * @param studentId - The student_basic_info.id value
 * @returns KgVersionIntegrity summary, or null if RPC unavailable
 */
export async function verifyKgVersionIntegrity(
  studentId: string
): Promise<KgVersionIntegrity | null> {
  if (!studentId) {
    throw new Error('[KG Service] student_id는 필수입니다.');
  }

  // ── Try RPC first ──
  const { data, error } = await supabase.rpc('verify_kg_version_integrity', {
    p_student_id: studentId,
  });

  if (error) {
    const errMsg = typeof error.message === 'string' ? error.message : '';
    if (
      errMsg.includes('function') &&
      (errMsg.includes('does not exist') || errMsg.includes('not found'))
    ) {
      console.warn('[KG Service] verify_kg_version_integrity RPC를 찾을 수 없습니다. 클라이언트 폴백을 사용합니다.');
      return verifyIntegrityViaQuery(studentId);
    }
    console.error('[KG Service] KG 버전 무결성 검증 실패:', error);
    throw error;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) return null;

  return rows[0] as KgVersionIntegrity;
}

/**
 * Client-side fallback for version integrity verification.
 * Fetches all version numbers and validates contiguous sequence.
 */
async function verifyIntegrityViaQuery(
  studentId: string
): Promise<KgVersionIntegrity | null> {
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('version, created_at')
    .eq('student_id', studentId)
    .order('version', { ascending: true });

  if (error) {
    console.error('[KG Service] KG 버전 무결성 클라이언트 검증 실패:', error);
    throw error;
  }

  if (!data || data.length === 0) return null;

  const versions = data.map((row) => row.version);
  const totalVersions = versions.length;
  const maxVersion = versions[versions.length - 1];
  const minVersion = versions[0];

  // Contiguous if versions form 1, 2, 3, ..., N with no gaps
  const versionsContiguous =
    minVersion === 1 &&
    maxVersion === totalVersions &&
    versions.every((v, i) => v === i + 1);

  return {
    total_versions: totalVersions,
    max_version: maxVersion,
    min_version: minVersion,
    versions_contiguous: versionsContiguous,
    min_created_at: data[0].created_at,
    max_created_at: data[data.length - 1].created_at,
  };
}

/**
 * 학생의 모든 KG 버전 목록을 조회합니다 (메타데이터만, kg_json 제외).
 * Useful for future version list/selection UI.
 *
 * @param studentId - The student_basic_info.id value
 * @returns Array of version metadata (without full kg_json)
 */
export async function fetchKgVersionList(
  studentId: string
): Promise<Omit<StudentKgVersion, 'kg_json'>[]> {
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('id, student_id, version, source_categories, created_by, created_at')
    .eq('student_id', studentId)
    .order('version', { ascending: false });

  if (error) {
    console.error('[KG Service] KG 버전 목록 조회 실패:', error);
    throw error;
  }

  return (data ?? []) as unknown as Omit<StudentKgVersion, 'kg_json'>[];
}

/** Result shape for denormalized sync check */
export interface KgDenormSyncStatus {
  versionId: string;
  version: number;
  jsonEntityCount: number;
  jsonRelationCount: number;
  tableEntityCount: number;
  tableRelationCount: number;
  entitiesInSync: boolean;
  relationsInSync: boolean;
}

/**
 * 특정 KG 버전의 정규화 테이블 동기화 상태를 확인합니다.
 * Verifies that the denormalized entity/relation tables are in sync
 * with the jsonb column for a given KG version. Useful for diagnostics.
 *
 * Compares the count of entities/relations in kg_json vs the normalized tables.
 * If counts don't match, the DB trigger may have failed or been bypassed.
 *
 * @param versionId - The student_kg_versions.id UUID
 * @returns KgDenormSyncStatus or null if the version doesn't exist
 */
export async function checkKgDenormSync(
  versionId: string
): Promise<KgDenormSyncStatus | null> {
  // Fetch the version row to get jsonb counts
  const { data: versionRow, error: vErr } = await supabase
    .from('student_kg_versions')
    .select('id, version, kg_json')
    .eq('id', versionId)
    .maybeSingle();

  if (vErr) {
    console.error('[KG Service] 동기화 검증 - 버전 조회 실패:', vErr);
    throw vErr;
  }
  if (!versionRow) return null;

  const kgJson = versionRow.kg_json as unknown as KgJson;
  const jsonEntityCount = Array.isArray(kgJson?.entities) ? kgJson.entities.length : 0;
  const jsonRelationCount = Array.isArray(kgJson?.relations) ? kgJson.relations.length : 0;

  // Count normalized entity rows
  const { count: tableEntityCount, error: eErr } = await supabase
    .from('student_kg_entities')
    .select('id', { count: 'exact', head: true })
    .eq('kg_version_id', versionId);

  if (eErr) {
    console.error('[KG Service] 동기화 검증 - 엔터티 카운트 실패:', eErr);
    throw eErr;
  }

  // Count normalized relation rows
  const { count: tableRelationCount, error: rErr } = await supabase
    .from('student_kg_relations')
    .select('id', { count: 'exact', head: true })
    .eq('kg_version_id', versionId);

  if (rErr) {
    console.error('[KG Service] 동기화 검증 - 관계 카운트 실패:', rErr);
    throw rErr;
  }

  const entityCount = tableEntityCount ?? 0;
  const relationCount = tableRelationCount ?? 0;

  return {
    versionId,
    version: versionRow.version,
    jsonEntityCount,
    jsonRelationCount,
    tableEntityCount: entityCount,
    tableRelationCount: relationCount,
    entitiesInSync: jsonEntityCount === entityCount,
    relationsInSync: jsonRelationCount === relationCount,
  };
}

/** Result shape for backfill operation */
export interface KgBackfillResult {
  versionsProcessed: number;
  studentIdFilter: string | null;
}

/**
 * 정규화 테이블을 kg_json에서 다시 채웁니다 (백필).
 * Re-populates student_kg_entities and student_kg_relations from kg_json
 * by calling the backfill_kg_denormalized RPC (triggers a no-op UPDATE
 * which fires the AFTER UPDATE triggers).
 *
 * Teacher/admin only. Pass studentId to target one student, or omit for all.
 *
 * @param studentId - Optional student_basic_info.id to limit backfill scope
 * @returns KgBackfillResult with count of versions processed
 */
export async function backfillKgDenormalized(
  studentId?: string
): Promise<KgBackfillResult | null> {
  const { data, error } = await supabase.rpc('backfill_kg_denormalized', {
    p_student_id: studentId ?? null,
  });

  if (error) {
    const errMsg = typeof error.message === 'string' ? error.message : '';
    if (
      errMsg.includes('function') &&
      (errMsg.includes('does not exist') || errMsg.includes('not found'))
    ) {
      console.warn('[KG Service] backfill_kg_denormalized RPC를 찾을 수 없습니다.');
      return null;
    }
    console.error('[KG Service] 백필 실행 실패:', error);
    throw error;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) return null;

  const row = rows[0] as { versions_processed: number; student_id_filter: string | null };
  return {
    versionsProcessed: row.versions_processed,
    studentIdFilter: row.student_id_filter,
  };
}

/**
 * RPC를 통해 정규화 테이블 동기화 상태를 일괄 확인합니다.
 * Bulk sync verification via verify_kg_denorm_sync RPC.
 * Returns rows showing entity/relation count comparisons between kg_json and normalized tables.
 *
 * @param studentId - Optional student_basic_info.id to filter
 * @returns Array of sync status rows, or null if RPC unavailable
 */
export async function verifyKgDenormSync(
  studentId?: string
): Promise<KgDenormSyncStatus[] | null> {
  const { data, error } = await supabase.rpc('verify_kg_denorm_sync', {
    p_student_id: studentId ?? null,
  });

  if (error) {
    const errMsg = typeof error.message === 'string' ? error.message : '';
    if (
      errMsg.includes('function') &&
      (errMsg.includes('does not exist') || errMsg.includes('not found'))
    ) {
      console.warn('[KG Service] verify_kg_denorm_sync RPC를 찾을 수 없습니다.');
      return null;
    }
    console.error('[KG Service] 동기화 검증 RPC 실패:', error);
    throw error;
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((row: Record<string, unknown>) => ({
    versionId: row.kg_version_id as string,
    version: row.version as number,
    jsonEntityCount: row.json_entity_count as number,
    jsonRelationCount: row.json_relation_count as number,
    tableEntityCount: row.table_entity_count as number,
    tableRelationCount: row.table_relation_count as number,
    entitiesInSync: row.entities_in_sync as boolean,
    relationsInSync: row.relations_in_sync as boolean,
  }));
}

/**
 * 특정 KG 버전을 ID로 조회합니다.
 * Retrieves a specific KG version by its UUID.
 *
 * @param versionId - The student_kg_versions.id UUID
 * @returns The StudentKgVersion or null
 */
export async function fetchKgVersionById(
  versionId: string
): Promise<StudentKgVersion | null> {
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('id, student_id, version, kg_json, source_categories, created_by, created_at')
    .eq('id', versionId)
    .maybeSingle();

  if (error) {
    console.error('[KG Service] KG 버전 조회 실패:', error);
    throw error;
  }

  if (!data) return null;

  return data as unknown as StudentKgVersion;
}

// =============================================
// Version Content Integrity Verification
// =============================================

/** Checksum record for a single KG version */
export interface KgVersionChecksum {
  id: string;
  version: number;
  kg_json_checksum: string;
  entity_count: number;
  relation_count: number;
  created_at: string;
}

/** Result of a before/after checksum comparison */
export interface KgVersionIntegrityCheck {
  studentId: string;
  priorVersionCount: number;
  allPriorVersionsIntact: boolean;
  /** List of versions whose checksums changed (should always be empty) */
  mutatedVersions: number[];
  /** The new version number added (if any) */
  newVersionAdded: number | null;
}

/**
 * 학생의 모든 KG 버전 체크섬을 조회합니다.
 * Fetches MD5 checksums for all KG versions of a student via the
 * fetch_kg_version_checksums RPC. Falls back to client-side computation
 * if the RPC is not yet available.
 *
 * Used for content-level immutability verification: snapshot checksums
 * before a save and compare after to confirm no prior version was mutated.
 *
 * @param studentId - The student_basic_info.id value
 * @returns Array of KgVersionChecksum sorted by version ASC
 */
export async function fetchKgVersionChecksums(
  studentId: string
): Promise<KgVersionChecksum[]> {
  if (!studentId) {
    throw new Error('[KG Service] student_id는 필수입니다.');
  }

  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('fetch_kg_version_checksums', {
      p_student_id: studentId,
    });

    if (error) {
      const errMsg = typeof error.message === 'string' ? error.message : '';
      if (
        errMsg.includes('function') &&
        (errMsg.includes('does not exist') || errMsg.includes('not found'))
      ) {
        console.warn('[KG Service] fetch_kg_version_checksums RPC를 찾을 수 없습니다. 직접 쿼리 폴백을 사용합니다.');
        return fetchKgVersionChecksumsDirect(studentId);
      }
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      version: row.version as number,
      kg_json_checksum: row.kg_json_checksum as string,
      entity_count: row.entity_count as number,
      relation_count: row.relation_count as number,
      created_at: row.created_at as string,
    }));
  } catch (err) {
    console.warn('[KG Service] RPC 체크섬 조회 실패, 직접 쿼리 폴백:', err);
    return fetchKgVersionChecksumsDirect(studentId);
  }
}

/**
 * Client-side fallback: fetches all versions and computes checksums locally.
 * Uses a lightweight hash based on JSON stringification length + entity/relation counts.
 * Less precise than server-side MD5 but sufficient for detecting major mutations.
 */
async function fetchKgVersionChecksumsDirect(
  studentId: string
): Promise<KgVersionChecksum[]> {
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('id, version, kg_json, created_at')
    .eq('student_id', studentId)
    .order('version', { ascending: true });

  if (error) {
    console.error('[KG Service] 체크섬 직접 조회 실패:', error);
    throw error;
  }

  return (data ?? []).map((row) => {
    const kgJson = row.kg_json as unknown as KgJson;
    const jsonStr = JSON.stringify(row.kg_json);
    // Simple client-side hash: use string length + content sample for fingerprinting
    const checksum = `client:${jsonStr.length}:${simpleHash(jsonStr)}`;
    return {
      id: row.id,
      version: row.version,
      kg_json_checksum: checksum,
      entity_count: Array.isArray(kgJson?.entities) ? kgJson.entities.length : 0,
      relation_count: Array.isArray(kgJson?.relations) ? kgJson.relations.length : 0,
      created_at: row.created_at,
    };
  });
}

/**
 * Simple string hash for client-side checksum fallback.
 * DJB2 algorithm — fast, deterministic, sufficient for change detection.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(16);
}

/**
 * 새 KG 저장 전후의 버전 체크섬을 비교하여 이전 버전이 변경되지 않았는지 검증합니다.
 * Compares before/after checksum snapshots to verify that no prior version
 * was mutated during a save operation.
 *
 * Usage pattern:
 *   1. const before = await fetchKgVersionChecksums(studentId);
 *   2. await saveKgVersion({ studentId, kgJson, ... });
 *   3. const after = await fetchKgVersionChecksums(studentId);
 *   4. const result = compareVersionChecksums(studentId, before, after);
 *   5. assert(result.allPriorVersionsIntact === true);
 *
 * @param studentId - The student ID
 * @param before - Checksum snapshot taken before the save
 * @param after - Checksum snapshot taken after the save
 * @returns KgVersionIntegrityCheck with comparison results
 */
export function compareVersionChecksums(
  studentId: string,
  before: KgVersionChecksum[],
  after: KgVersionChecksum[]
): KgVersionIntegrityCheck {
  const beforeMap = new Map(before.map((v) => [v.version, v]));
  const afterMap = new Map(after.map((v) => [v.version, v]));

  const mutatedVersions: number[] = [];

  // Check every version that existed before still has the same checksum
  for (const [version, beforeChecksum] of beforeMap) {
    const afterChecksum = afterMap.get(version);
    if (!afterChecksum) {
      // Version was deleted — definitely a mutation
      mutatedVersions.push(version);
    } else if (afterChecksum.kg_json_checksum !== beforeChecksum.kg_json_checksum) {
      // Content changed — mutation detected
      mutatedVersions.push(version);
    }
  }

  // Detect which new version was added (if any)
  const newVersions = [...afterMap.keys()].filter((v) => !beforeMap.has(v));
  const newVersionAdded = newVersions.length === 1 ? newVersions[0] : null;

  return {
    studentId,
    priorVersionCount: before.length,
    allPriorVersionsIntact: mutatedVersions.length === 0,
    mutatedVersions,
    newVersionAdded,
  };
}

// =============================================
// Version listing / selection (inquiry-design)
// =============================================

/** 화면의 버전 선택기에 필요한 최소 정보. `kg_json` 전문은 싣지 않는다(목록이 무거워진다). */
export interface KgVersionSummary {
  id: string;
  version: number;
  created_at: string;
  /**
   * 추출 엔진. **구·신 파이프라인을 가르는 단일 근거**다
   * (신 파이프라인 = `research-v7`, 그 이전 = `solar-pro3` 등).
   * 이 값이 흩어지면 화면 분기가 어긋나므로 판정은 `isNewPipelineEngine()`으로만 한다.
   */
  engine: string | null;
  entityCount: number;
  relationCount: number;
}

/** 신 파이프라인(§15) 여부. 엔진 문자열 비교를 한 곳에 모은다. */
export const NEW_PIPELINE_ENGINE = 'research-v7';
export function isNewPipelineEngine(engine: string | null | undefined): boolean {
  return engine === NEW_PIPELINE_ENGINE;
}

/** 학생의 KG 버전 목록(최신순). 선택기용이라 요약만 반환한다. */
export async function listKgVersions(studentId: string): Promise<KgVersionSummary[]> {
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('id, version, created_at, kg_json')
    .eq('student_id', studentId)
    .order('version', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: { id: string; version: number; created_at: string; kg_json: KgJson }) => ({
    id: row.id,
    version: row.version,
    created_at: row.created_at,
    engine: (row.kg_json?.source_stats as { extraction_engine?: string } | undefined)?.extraction_engine ?? null,
    entityCount: row.kg_json?.entities?.length ?? 0,
    relationCount: row.kg_json?.triples?.length ?? 0,
  }));
}

// 버전 한 건 조회는 위쪽의 기존 `fetchKgVersionById`(712행)를 그대로 쓴다.
// 같은 이름으로 하나 더 만들었다가 SWC가 중복 정의로 거부했다 —
// 새 함수를 파일 끝에 덧붙이기 전에 같은 이름이 이미 있는지 확인해야 한다.
