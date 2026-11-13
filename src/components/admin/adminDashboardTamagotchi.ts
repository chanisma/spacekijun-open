/**
 * 관리자 대시보드 ▸ 다마고찌 블록 (2026-10-08).
 *
 * 서버 = `get_admin_dashboard_stats()` 의 `tamagotchi` 블록(마이그레이션
 * `20261008140000_admin_dashboard_snapshot_tamagotchi.sql`), 화면 = `TamagotchiSection`.
 * 판정·집계는 여기 순수 함수에 둔다(JSX 안에 두면 회귀로 못 잡는다).
 *
 * 자세한 측정(펫 전후 플래너 습관 비교)은 Admin «다마고찌» 탭의 [측정]이 맡는다 —
 * 대시보드는 «지금 쓰이고 있는가 · 관리자가 할 일이 있는가» 두 가지만 답한다.
 */

export interface TamaStats {
  owners: { total: number; student: number; teacher: number; admin: number; other: number };
  pets: {
    total: number;
    /** 펫 집에서 쉬는 펫(`is_primary` false) — 시간이 멈춰 있다 */
    resting: number;
    /** 함께하는 펫 중 아픈 펫 */
    sick: number;
    /** `state.stage` 별 펫 수. 모르는 값은 키 그대로 온다 */
    by_stage: Record<string, number>;
  };
  /** «돌본 날» = 펫을 저장한 한국 날짜(`tama_care_day`) */
  care: { today: number; active_7d: number; students_3days: number };
  daily: Array<{ date: string; count: number }>;
  activity_30d: {
    gacha: number;
    trades: number;
    diary: number;
    focus_started: number;
    focus_completed: number;
    visits: number;
    coins: number;
  };
  /** 관리자가 손으로 만들어 배송하는 의뢰 — 접수·제작 중 */
  orders: { character_open: number; decor_open: number; oldest_open_at: string | null };
  event: { title: string; ends_at: string } | null;
  /** Web Push 구독(앱 전체 알림이 쓴다 — 다마고찌 Phase 4 로 들어왔다) */
  push: { subscriptions: number; users: number; failing: number };
}

/**
 * 단계 이름. 정본은 `features/tamagotchi/model/petModel.ts` 의 `STAGE_LABEL` 이고
 * 회귀가 대조한다 — import 하지 않는 이유는 아카데미와 같다(관리자 번들이 게임 모델을
 * 끌어오지 않게).
 */
export const TAMA_STAGE_CATALOG: Array<{ key: string; label: string }> = [
  { key: 'egg', label: '알' },
  { key: 'baby', label: '아기' },
  { key: 'child', label: '어린이' },
  { key: 'teen', label: '청소년' },
  { key: 'adult', label: '어른' },
];

export interface TamaStageRow {
  key: string;
  label: string;
  count: number;
  /** 전체 펫 대비 비율(0~1) */
  ratio: number;
}

/**
 * 단계 분포 행. **0마리 단계도 행으로 남긴다** — 빠지면 «아직 아무도 어른이 안 됐다»가
 * 아니라 «어른 단계가 없다»로 읽힌다. 모르는 단계 키는 뒤에 키 이름 그대로 붙인다
 * (새 단계를 만든 사람이 자기 단계가 왜 없는지 알 수 있게 — 아카데미 장과 같은 원칙).
 */
export function buildTamaStageRows(byStage: Record<string, number>): TamaStageRow[] {
  const total = Object.values(byStage).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
  const ratio = (n: number) => (total > 0 ? n / total : 0);
  const known = new Set(TAMA_STAGE_CATALOG.map((s) => s.key));
  const rows = TAMA_STAGE_CATALOG.map((s) => ({
    key: s.key,
    label: s.label,
    count: byStage[s.key] ?? 0,
    ratio: ratio(byStage[s.key] ?? 0),
  }));
  for (const [key, count] of Object.entries(byStage)) {
    if (known.has(key)) continue;
    rows.push({ key, label: key === '?' ? '단계 모름' : key, count, ratio: ratio(count) });
  }
  return rows;
}

/** 열린 의뢰 합계 — 운영 점검의 «할 일» */
export function tamaOpenOrders(stats: TamaStats): number {
  return (stats.orders?.character_open ?? 0) + (stats.orders?.decor_open ?? 0);
}

/**
 * 가장 오래 기다린 의뢰가 며칠째인가(한국 날짜 기준 아님 — 경과 일수). 열린 의뢰가 없으면 null.
 * «2건 대기»보다 «5일째 기다림»이 손을 움직이게 한다.
 */
export function tamaOldestWaitDays(stats: TamaStats, now: Date = new Date()): number | null {
  const at = stats.orders?.oldest_open_at;
  if (!at || tamaOpenOrders(stats) === 0) return null;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** 키우는 사람 줄 — 학생이 본문, 교직원은 시험 플레이일 수 있어 따로 적는다 */
export function tamaOwnersLine(owners: TamaStats['owners']): string {
  const parts: string[] = [];
  if (owners.teacher > 0) parts.push(`교사 ${owners.teacher}`);
  if (owners.admin > 0) parts.push(`관리자 ${owners.admin}`);
  if (owners.other > 0) parts.push(`기타 ${owners.other}`);
  return parts.join(' · ');
}

/**
 * 함께 집중 완주율. 시작이 0이면 null(0% 로 그리면 «다 포기했다»로 읽힌다).
 * 끝난 뒤 15분 안에 끝내야 완주라, 진행 중인 집중은 아직 완주가 아니다 — 하한이다.
 */
export function tamaFocusRate(activity: TamaStats['activity_30d']): number | null {
  if (!activity.focus_started) return null;
  return Math.min(1, activity.focus_completed / activity.focus_started);
}
