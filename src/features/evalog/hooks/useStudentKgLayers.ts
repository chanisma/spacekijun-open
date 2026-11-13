import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  assembleKgLayers, entityRowsFromKgJson, relationRowsFromKgJson,
  type KgEntityRowLite, type KgRelationRowLite,
} from '../utils/kgLayers';
import type { StudentKgLayers } from '../types/kgLayers';

/**
 * 학생 지식그래프(탐구 설계가 읽는 것과 **같은 데이터**)를 evalog 화면용으로 조회.
 *
 * ── 어느 버전을 보여주는가 ──────────────────────────────────────────────────
 * `student_kg_versions`는 append-only 라 학생마다 여러 세대가 쌓여 있고 **세대마다
 * 층 구성이 다르다**(`types/kgLayers.ts`의 표). 그냥 최신을 쓰면 3학년 119명이
 * 역량 0개로 보인다 — `research-v7`은 사람 층을 만들지 않는 세대다.
 *
 * 그래서 **역량 층이 있는 가장 최신 버전**을 고른다. 실측(2026-09-12): 이 규칙으로
 * 커버리지가 498명 → **619명**(v8 496 + pro3 123)이 되고, 층이 아예 없는 학생은 2명이다.
 * 고른 결과가 최신이 아닐 수 있으므로 **엔진·버전·생성일을 화면이 반드시 표시**한다.
 *
 * ── 왜 두 왕복인가 ──────────────────────────────────────────────────────────
 * `kg_json`은 학생당 수십만 자라 목록 조회에 실을 수 없다(엔진만 JSON 경로로 뽑는다).
 * 그리고 "역량 층이 있는가"는 `student_kg_entities`를 봐야 알 수 있다. 두 질의 모두
 * 학생 하나 범위라 작다(역량 엔티티는 버전당 12~50건).
 */

const KG_QUERY_STALE_MS = 5 * 60 * 1000;

/**
 * 생성 타입에 `kg_json` JSON 경로 select 가 없어 느슨한 클라이언트를 쓴다.
 * `any` 로 열지 않고 **실제로 쓰는 체인만** 선언한다(오타·잘못된 체인을 타입이 잡는다).
 */
interface PgError { message?: string }
interface KgFilter<T> {
  eq: (column: string, value: string) => KgFilter<T>;
  order: (column: string, options: { ascending: boolean }) => KgFilter<T>;
  maybeSingle: () => Promise<{ data: T | null; error: PgError | null }>;
  then: <R>(
    onfulfilled: (result: { data: T[] | null; error: PgError | null }) => R,
  ) => Promise<R>;
}
const db = supabase as unknown as {
  from: (table: string) => { select: <T>(columns: string) => KgFilter<T> };
};

interface VersionRow {
  id: string;
  version: number;
  created_at: string | null;
  engine: string | null;
}

export interface StudentKgLayersResult {
  layers: StudentKgLayers | null;
  /** 이 학생이 가진 전체 버전 수. "다른 세대도 있다"를 화면이 말할 수 있게. */
  versionCount: number;
  /** 최신 버전이 아닌 것을 고른 경우 그 최신 버전의 엔진. 화면이 이유를 설명한다. */
  newerEngine: string | null;
}

export function useStudentKgLayers(studentCode: string | null | undefined) {
  return useQuery<StudentKgLayersResult>({
    queryKey: ['evalog', 'kg-layers', studentCode],
    enabled: !!studentCode,
    staleTime: KG_QUERY_STALE_MS,
    queryFn: async () => {
      const empty: StudentKgLayersResult = { layers: null, versionCount: 0, newerEngine: null };

      const [{ data: versionRows, error: versionError }, { data: compRows, error: compError }] =
        await Promise.all([
          db.from('student_kg_versions')
            .select<VersionRow>('id, version, created_at, engine:kg_json->source_stats->>extraction_engine')
            .eq('student_id', studentCode)
            .order('version', { ascending: false }),
          db.from('student_kg_entities')
            .select<{ kg_version_id: string }>('kg_version_id')
            .eq('student_id', studentCode)
            .eq('type', 'Competency'),
        ]);
      if (versionError) throw versionError;
      if (compError) throw compError;

      const versions = versionRows ?? [];
      if (versions.length === 0) return empty;

      const withCompetency = new Set((compRows ?? []).map((r) => r.kg_version_id));
      // 이미 version 내림차순이므로 먼저 걸리는 것이 "역량 층이 있는 최신"이다.
      const chosen = versions.find((v) => withCompetency.has(v.id)) ?? versions[0];
      const newest = versions[0];

      const [{ data: entityRows, error: entityError }, { data: relationRows, error: relationError }] =
        await Promise.all([
          db.from('student_kg_entities')
            .select<KgEntityRowLite>('entity_id, label, type, properties')
            .eq('kg_version_id', chosen.id),
          db.from('student_kg_relations')
            .select<KgRelationRowLite>('source_entity_id, target_entity_id, relation_type, properties')
            .eq('kg_version_id', chosen.id),
        ]);
      if (entityError) throw entityError;
      if (relationError) throw relationError;

      let entities: KgEntityRowLite[] = entityRows ?? [];
      let relations: KgRelationRowLite[] = relationRows ?? [];

      // 비정규화 트리거가 돌지 않은 오래된 행을 위한 폴백. inquiry-design 과 같은 이유로
      // 둔다 — 여기서 빈 배열을 그대로 쓰면 화면은 "그래프 없음"이라고 잘못 말한다.
      if (entities.length === 0 || relations.length === 0) {
        const { data: full, error: fullError } = await db
          .from('student_kg_versions')
          .select<{ kg_json: unknown }>('kg_json')
          .eq('id', chosen.id)
          .maybeSingle();
        if (fullError) throw fullError;
        const kgJson = full?.kg_json ?? null;
        if (entities.length === 0) entities = entityRowsFromKgJson(kgJson);
        if (relations.length === 0) relations = relationRowsFromKgJson(kgJson);
      }

      const layers = assembleKgLayers({
        versionId: chosen.id,
        version: chosen.version,
        engine: chosen.engine ?? null,
        createdAt: chosen.created_at ?? null,
        entities,
        relations,
      });

      return {
        layers,
        versionCount: versions.length,
        newerEngine: chosen.id === newest.id ? null : newest.engine ?? null,
      };
    },
  });
}
