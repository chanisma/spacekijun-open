// ========================================
// 창체 시수 집계 — 순수 로직 (React 비의존)
//
// 시수는 두 곳에 있다: 활동의 기본 시수(activity.hours)와 참여자 개별
// 시수(participation.hours). 개별 값이 있으면 그것이 이기고, 없으면 활동 값을
// 따른다 — 부분 참여만 개별 지정하면 되도록 설계했기 때문이다.
//
// 이 규칙을 화면마다 다시 쓰면 "카드에 34시간, 상세에 30시간"이 된다.
// 반드시 이 모듈을 거칠 것.
// ========================================

import type { ActivityArea, ParticipationStatus } from '../types';
import { COUNTED_PARTICIPATION_STATUSES } from './activityLabels';

/** 시수 계산에 필요한 최소 형태 */
export interface HoursActivityLike {
  id: string;
  area: ActivityArea;
  academic_year: number;
  hours: number | null;
}

export interface HoursParticipationLike {
  activity_id: string;
  student_code: string;
  status: ParticipationStatus;
  hours: number | null;
}

/**
 * 이 참여자의 인정 시수. 개별 값 → 활동 값 → 0 순으로 해석한다.
 *
 * 신청(applied)·중도 이탈(withdrawn)은 **0**이다. 아직 하지 않았거나
 * 끝내지 않은 시간을 실적으로 세면 생기부 시수가 부풀려진다.
 */
export function resolveParticipantHours(
  activity: Pick<HoursActivityLike, 'hours'> | null | undefined,
  participation: Pick<HoursParticipationLike, 'hours' | 'status'>
): number {
  if (!isCountedStatus(participation.status)) return 0;
  const own = participation.hours;
  if (own !== null && own !== undefined) return Number(own) || 0;
  const base = activity?.hours;
  if (base !== null && base !== undefined) return Number(base) || 0;
  return 0;
}

/** 시수·이수 집계에 포함되는 참여 상태인가 */
export function isCountedStatus(status: ParticipationStatus | null | undefined): boolean {
  return !!status && COUNTED_PARTICIPATION_STATUSES.includes(status);
}

export interface AreaHours {
  autonomy: number;
  club: number;
  career: number;
  service: number;
  total: number;
}

const EMPTY_AREA_HOURS = (): AreaHours => ({
  autonomy: 0, club: 0, career: 0, service: 0, total: 0,
});

/**
 * 한 학생의 영역별 시수 합. 생기부 창체 시수와 대조하는 값이다.
 *
 * 활동 목록에 없는 참여 행은 조용히 건너뛴다 — 필터된 화면에서
 * 부분 데이터만 들고 있을 수 있고, 그때 0으로 세는 것이 맞다.
 */
export function sumAreaHours(
  participations: HoursParticipationLike[],
  activities: HoursActivityLike[]
): AreaHours {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const out = EMPTY_AREA_HOURS();

  for (const p of participations) {
    const activity = byId.get(p.activity_id);
    if (!activity) continue;
    const h = resolveParticipantHours(activity, p);
    if (!h) continue;
    out[activity.area] += h;
    out.total += h;
  }

  return roundAreaHours(out);
}

/** 학년도별 영역 시수. 학생 대시보드 타임라인이 쓴다. */
export function sumAreaHoursByYear(
  participations: HoursParticipationLike[],
  activities: HoursActivityLike[]
): Map<number, AreaHours> {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const out = new Map<number, AreaHours>();

  for (const p of participations) {
    const activity = byId.get(p.activity_id);
    if (!activity) continue;
    const h = resolveParticipantHours(activity, p);
    if (!h) continue;
    const bucket = out.get(activity.academic_year) ?? EMPTY_AREA_HOURS();
    bucket[activity.area] += h;
    bucket.total += h;
    out.set(activity.academic_year, bucket);
  }

  for (const [year, bucket] of out) out.set(year, roundAreaHours(bucket));
  return out;
}

/**
 * 활동 한 건의 총 인정 시수(참여자 전원 합).
 *
 * "이 활동에 투입된 학생 시간"이며, 예산 효율 지표(1인당·1시간당 예산)의 분모다.
 */
export function sumActivityHours(
  activity: Pick<HoursActivityLike, 'hours'>,
  participations: Pick<HoursParticipationLike, 'hours' | 'status'>[]
): number {
  let total = 0;
  for (const p of participations) total += resolveParticipantHours(activity, p);
  return round1(total);
}

/** 집계에 포함되는 참여자 수 (신청·이탈 제외) */
export function countedParticipants(
  participations: Pick<HoursParticipationLike, 'status'>[]
): number {
  return participations.filter((p) => isCountedStatus(p.status)).length;
}

/**
 * 1인당 예산. 참여자가 0명이면 null — 0으로 나누지 않고,
 * 화면은 "—"를 찍어야 한다(0원으로 표시하면 "무료 활동"으로 오독된다).
 */
export function budgetPerParticipant(
  budget: number | null | undefined,
  participantCount: number
): number | null {
  if (budget === null || budget === undefined) return null;
  if (participantCount <= 0) return null;
  return Math.round(Number(budget) / participantCount);
}

// ----------------------------------------

/** 시수는 0.5 단위까지 쓰므로 소수 1자리에서 끊는다(부동소수 누적 오차 제거) */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function roundAreaHours(h: AreaHours): AreaHours {
  return {
    autonomy: round1(h.autonomy),
    club: round1(h.club),
    career: round1(h.career),
    service: round1(h.service),
    total: round1(h.total),
  };
}
