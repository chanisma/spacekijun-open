import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LedgerRecordRow } from '../utils/activityLedger';

/**
 * 학생의 생기부 기록 행(`student_detailed_activities`)을 **한 번** 읽어 두는 훅.
 *
 * ── 왜 한 곳에 모았는가 ─────────────────────────────────────────────────────
 * 세 화면이 같은 행을 필요로 한다 — 비교과 탭의 활동 분절 하이라이트, 역량분석 탭의
 * 근거 원문, 활동 타임라인. 각자 조회하면 `content`(학생당 수만 자)를 세 번 받는다.
 * 그래서 여기서 한 번 읽고 **필요한 색인을 함께** 만든다.
 *
 * `segmentation`·`analysis`는 생성 타입에 없어 느슨한 클라이언트로 읽는다.
 */

const LEDGER_STALE_MS = 5 * 60 * 1000;

/**
 * 생성 타입에 `segmentation`·`analysis` 컬럼이 없다. `any` 로 열어 두지 않고
 * **실제로 쓰는 체인만** 선언한다 — 이렇게 해 두면 오타나 잘못된 체인이 타입에서 걸린다.
 */
interface LedgerSelect {
  eq: (column: string, value: string) => Promise<{
    data: LedgerRecordRow[] | null;
    error: { message?: string } | null;
  }>;
}
const db = supabase as unknown as {
  from: (table: string) => { select: (columns: string) => LedgerSelect };
};

/** 공백만 접어서 비교한다. 원문을 바꾸지 않으므로 접두 일치가 안전하다. */
const norm = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** 접두 키 — 전문을 키로 쓰면 말미 공백·줄바꿈 차이에 깨진다. */
const KEY_LEN = 60;
export const contentKeyOf = (content: string | null | undefined) => norm(content).slice(0, KEY_LEN);

export interface ActivityLedgerRows {
  rows: LedgerRecordRow[];
  /** 행 id → 행. KG 활동 id 에서 원문으로 거슬러 올 때 쓴다. */
  byId: Map<string, LedgerRecordRow>;
  /**
   * 내용 접두 → 행.
   *
   * 비교과 화면은 가공된 배열(`section5_creative_activities` 등)에서 렌더되는데 그
   * 배열은 **행 id 를 버린다**(`convertBasicInfoToStudent`). 세특은 아예 다른 경로로 온다.
   * 두 경로 모두 `content`는 원본 그대로라(실측: 전 섹션 일치) 내용을 키로 쓴다.
   *
   * **분절이 있는 행만** 담는다 — 이 색인의 유일한 소비자가 분절 하이라이트이고,
   * 분절 없는 행은 `{"영역":"자율활동","시간":0}` 같은 메타데이터 뼈대다(실측 2,382행 전부).
   */
  byContentKey: Map<string, LedgerRecordRow>;
}

/**
 * @param select 캐시된 원장을 화면이 쓰는 모양으로 바꾸는 변환. **같은 queryKey 를
 *   공유하므로 변환을 넘기더라도 행은 한 번만 받는다** — `useActivitySegmentation`이
 *   이 인자로 내용 색인만 꺼낸다.
 */
export function useActivityLedger<TData = ActivityLedgerRows>(
  studentCode: string | null | undefined,
  select?: (rows: ActivityLedgerRows) => TData,
) {
  return useQuery<ActivityLedgerRows, Error, TData>({
    queryKey: ['evalog', 'activity-ledger', studentCode],
    enabled: !!studentCode,
    // 분절·AI 분석은 배치로 만들어지는 정적 산출물이라 자주 바뀌지 않는다.
    staleTime: LEDGER_STALE_MS,
    select,
    queryFn: async () => {
      const { data, error } = await db
        .from('student_detailed_activities')
        .select('id, grade, semester, category, subject_name, content, segmentation, analysis')
        .eq('student_id', studentCode);
      if (error) throw error;

      const rows = (data ?? []) as LedgerRecordRow[];
      const byId = new Map<string, LedgerRecordRow>();
      const byContentKey = new Map<string, LedgerRecordRow>();

      for (const row of rows) {
        byId.set(row.id, row);
        if (!row.segmentation) continue;
        const key = contentKeyOf(row.content);
        if (!key) continue;
        // 같은 기록이 DB 에 두 번 저장된 사례가 실재한다(00-00239 종교학 — 전문까지 동일).
        // 어느 쪽이 이기든 화면은 같지만, 실행마다 달라지지 않도록 규칙을 고정한다:
        // 활동이 많은 쪽 → 동수면 id 사전순.
        const prev = byContentKey.get(key);
        if (prev) {
          const a = prev.segmentation?.activities?.length ?? 0;
          const b = row.segmentation?.activities?.length ?? 0;
          if (b < a || (b === a && row.id >= prev.id)) continue;
        }
        byContentKey.set(key, row);
      }

      return { rows, byId, byContentKey };
    },
  });
}
