import type { UseQueryResult } from '@tanstack/react-query';
import { useActivityLedger, contentKeyOf, type ActivityLedgerRows } from './useActivityLedger';
import type { ActivitySegmentation } from '../types/segmentation';

/**
 * 학생의 기록별 활동 분절(`student_detailed_activities.segmentation`) 조회.
 *
 * ── 왜 내용으로 찾는가 ──────────────────────────────────────────────────────
 * 비교과 화면은 `student.section5_creative_activities` 등 **가공된 배열**에서 렌더된다.
 * 그 배열은 `convertBasicInfoToStudent`가 `student_detailed_activities`에서 만들면서
 * **행 id를 버린다**. 세특은 아예 다른 경로(`basic_info.academic_development`)로 온다.
 *
 * 두 경로 모두 `content`는 원본 그대로다(실측: 전 섹션 일치). 그래서 내용을 키로 쓴다.
 * 공유 매핑 코드(`adminService`)를 건드리지 않아도 되고, 섹션마다 다른 처리가 필요 없다.
 *
 * ── 조회는 `useActivityLedger`가 한다 (2026-09-12) ───────────────────────────
 * 같은 행을 역량분석·활동 타임라인도 읽으므로 질의를 한 곳으로 모았다. 이 훅은 그
 * 결과에서 내용 색인만 꺼내 **종전과 똑같은 모양**(`Map<접두, SegmentationRecord>`)을
 * 돌려준다 — 호출부(`ExtracurricularActivities`)는 바뀌지 않는다.
 */

export interface SegmentationRecord {
  id: string;
  grade: number | null;
  category: string | null;
  subjectName: string | null;
  segmentation: ActivitySegmentation;
}

export type SegmentationMap = Map<string, SegmentationRecord>;

function toSegmentationMap(ledger: ActivityLedgerRows): SegmentationMap {
  const map: SegmentationMap = new Map();
  for (const [key, row] of ledger.byContentKey) {
    if (!row.segmentation) continue;
    map.set(key, {
      id: row.id,
      grade: row.grade ?? null,
      category: row.category ?? null,
      subjectName: row.subject_name ?? null,
      segmentation: row.segmentation,
    });
  }
  return map;
}

export function useActivitySegmentation(
  studentCode: string | null | undefined,
): UseQueryResult<SegmentationMap, Error> {
  // `select`로 변환하므로 캐시는 원장 하나만 쓴다(같은 행을 두 번 받지 않는다).
  return useActivityLedger<SegmentationMap>(studentCode, toSegmentationMap);
}

/** 화면의 기록 내용으로 분절을 찾는다. 없으면 undefined — 그 기록은 배지도 뜨지 않는다. */
export function findSegmentation(
  map: SegmentationMap | undefined,
  content: string | null | undefined,
): SegmentationRecord | undefined {
  if (!map) return undefined;
  const key = contentKeyOf(content);
  return key ? map.get(key) : undefined;
}
