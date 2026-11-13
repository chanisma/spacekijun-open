/**
 * 등급컷 조회 (`mock_grade_cut`).
 *
 * 컷은 회차·과목당 한 줄뿐인 작은 참조 데이터라 회차 단위로 통째로 받아 캐시한다.
 * 공식(`official`)이 있으면 그것이, 없으면 EBS 추정치가 쓰인다 — 화면은 `source` 로
 * '참고' 여부를 판단한다.
 */
import { supabase } from '@/integrations/supabase/client';
import type { GradeCut } from '../utils/referenceGrade';

interface GradeCutRow {
  subject: string;
  source: 'EBS' | 'official';
  max_score: number;
  cuts: Record<string, number>;
  is_absolute: boolean;
  national_mean: number | null;
  national_sd: number | null;
  cut_percentiles: Record<string, number> | null;
}

const cache = new Map<string, Map<string, GradeCut>>();

function toGradeCut(row: GradeCutRow): GradeCut {
  return {
    subject: row.subject,
    source: row.source,
    maxScore: row.max_score,
    cuts: row.cuts ?? {},
    isAbsolute: row.is_absolute,
    nationalMean: row.national_mean == null ? null : Number(row.national_mean),
    nationalSd: row.national_sd == null ? null : Number(row.national_sd),
    cutPercentiles: row.cut_percentiles ?? null,
  };
}

/**
 * 한 회차의 과목별 등급컷. 같은 과목에 공식과 EBS 가 모두 있으면 **공식이 이긴다**.
 */
export async function fetchGradeCuts(
  academicYear: number,
  examMonth: number,
  examGrade: number
): Promise<Map<string, GradeCut>> {
  const key = `${academicYear}-${examMonth}-${examGrade}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { data, error } = await supabase
    // mock_grade_cut 은 2026-09-03 신설이라 아직 생성 타입(types.ts)에 없다.
    // 타입을 재생성하면 이 캐스팅을 지울 것.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('mock_grade_cut' as any)
    .select('subject, source, max_score, cuts, is_absolute, national_mean, national_sd, cut_percentiles')
    .eq('academic_year', academicYear)
    .eq('exam_month', examMonth)
    .eq('exam_grade', examGrade);

  if (error) throw error;

  const map = new Map<string, GradeCut>();
  for (const row of ((data as unknown as GradeCutRow[]) ?? [])) {
    const existing = map.get(row.subject);
    // 공식이 EBS 추정치를 덮는다
    if (existing && existing.source === 'official') continue;
    map.set(row.subject, toGradeCut(row));
  }

  cache.set(key, map);
  return map;
}

/** 회차 캐시 무효화(등급컷을 새로 적재했을 때). */
export function clearGradeCutCache(): void {
  cache.clear();
}
