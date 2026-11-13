// ========================================
// 일정 설문 집계 — 순수 로직 단일 출처 (React 비의존)
//
// 화면 3곳(결과 표·응답 모달·목록 칩)이 같은 수를 말해야 하므로
// "몇 명이 가능한가 / 누가 아직 응답하지 않았는가 / 어느 날짜가 후보인가"의
// 판정을 여기 하나로 모은다. 회귀 = scripts/schedule-survey-test/run.mts
// ========================================

import type {
  ScheduleSurvey,
  ScheduleSurveyResponse,
  SurveyResponseItem,
} from '../types';

/** YYYY-MM-DD 형식인가 (그리고 실제로 존재하는 날짜인가) */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  );
}

/**
 * 응답 items 정규화.
 *
 * 저장은 JSONB라 무엇이든 들어올 수 있다(구 버전 클라이언트·수작업 SQL).
 * - 날짜 형식이 아닌 항목은 버린다
 * - 같은 날짜가 여러 번이면 **마지막 것이 이긴다**(사용자가 마지막에 고친 값)
 * - available 은 엄격히 boolean true 일 때만 참
 */
export function normalizeItems(items: unknown): SurveyResponseItem[] {
  if (!Array.isArray(items)) return [];
  const byDate = new Map<string, SurveyResponseItem>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (!isDateKey(item.date)) continue;
    const activity = typeof item.activity === 'string' ? item.activity.trim() : '';
    byDate.set(item.date, {
      date: item.date,
      available: item.available === true,
      ...(activity ? { activity } : {}),
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 한 날짜에 대한 집계 */
export interface SurveyDateTally {
  date: string;
  /** 주최자가 제시한 후보인가 (false = 응답자가 제안한 날짜) */
  isCandidate: boolean;
  /** 가능하다고 한 사람 이름 */
  availableNames: string[];
  /** 불가능하다고 한 사람 이름 */
  unavailableNames: string[];
  /** 그날 할 일 제안 (빈 문자열 제외) */
  activities: { name: string; activity: string }[];
  availableCount: number;
  /** 이 날짜에 대해 어떤 형태로든 답한 사람 수 */
  answeredCount: number;
}

export interface SurveyAggregate {
  dates: SurveyDateTally[];
  /** 응답을 제출한 대상자 수 */
  respondedCount: number;
  /** 대상자 수 */
  targetCount: number;
  /** 아직 응답하지 않은 대상자 resource.id */
  pendingTargetIds: string[];
}

export type SurveyDateOrder = 'availability' | 'date';

const RESPONDENT_FALLBACK = '(이름 없음)';

/**
 * 설문 + 응답들 → 날짜별 집계.
 *
 * ⚠ 정렬 기본값은 '가능 인원 많은 순'이다(날짜순이 아니다).
 *   일정을 고르는 것이 이 화면의 목적이라 그 순서가 쓸모 있지만,
 *   보는 사람은 달력처럼 시간순을 기대하므로 **화면이 정렬 기준을 말해야 한다**.
 */
export function aggregateSurvey(
  survey: Pick<ScheduleSurvey, 'candidate_dates' | 'target_resource_ids'>,
  responses: ScheduleSurveyResponse[],
  order: SurveyDateOrder = 'availability'
): SurveyAggregate {
  const candidates = new Set(
    (survey.candidate_dates ?? []).filter(isDateKey)
  );

  const tallies = new Map<string, SurveyDateTally>();
  const ensure = (date: string): SurveyDateTally => {
    let tally = tallies.get(date);
    if (!tally) {
      tally = {
        date,
        isCandidate: candidates.has(date),
        availableNames: [],
        unavailableNames: [],
        activities: [],
        availableCount: 0,
        answeredCount: 0,
      };
      tallies.set(date, tally);
    }
    return tally;
  };

  // 후보 날짜는 응답이 하나도 없어도 표에 남는다 (아무도 안 된다는 것 자체가 결과다)
  for (const date of candidates) ensure(date);

  const respondedIds = new Set<string>();

  for (const response of responses) {
    respondedIds.add(response.respondent_resource_id);
    const name = response.respondent_name?.trim() || RESPONDENT_FALLBACK;

    for (const item of normalizeItems(response.items)) {
      const tally = ensure(item.date);
      tally.answeredCount += 1;
      if (item.available) {
        tally.availableCount += 1;
        tally.availableNames.push(name);
      } else {
        tally.unavailableNames.push(name);
      }
      if (item.activity) {
        tally.activities.push({ name, activity: item.activity });
      }
    }
  }

  const targets = survey.target_resource_ids ?? [];
  const dates = [...tallies.values()].sort((a, b) => {
    if (order === 'availability' && b.availableCount !== a.availableCount) {
      return b.availableCount - a.availableCount;
    }
    return a.date.localeCompare(b.date);
  });

  return {
    dates,
    respondedCount: targets.filter((id) => respondedIds.has(id)).length,
    targetCount: targets.length,
    pendingTargetIds: targets.filter((id) => !respondedIds.has(id)),
  };
}

/**
 * 그 날짜에 대해 만들 일정의 기본 제목 후보.
 * 가장 많이 제안된 할 일 문구를 고른다(동점이면 먼저 나온 것).
 */
export function suggestTitleForDate(tally: SurveyDateTally): string {
  const counts = new Map<string, number>();
  for (const { activity } of tally.activities) {
    const key = activity.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [activity, count] of counts) {
    if (count > bestCount) {
      best = activity;
      bestCount = count;
    }
  }
  return best;
}

/** 이 사람이 설문 대상자인가 */
export function isSurveyTarget(
  survey: Pick<ScheduleSurvey, 'target_resource_ids'>,
  resourceId: string | null | undefined
): boolean {
  if (!resourceId) return false;
  return (survey.target_resource_ids ?? []).includes(resourceId);
}

/** 이 사람이 설문을 관리할 수 있는가 (주최자 또는 admin) */
export function canManageSurvey(
  survey: Pick<ScheduleSurvey, 'created_by'>,
  userId: string | null | undefined,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  return !!userId && survey.created_by === userId;
}

/**
 * 응답할 수 있는가.
 * 설문이 닫혔으면 누구도 응답할 수 없다(마감일은 안내일 뿐 차단하지 않는다 —
 * 서버가 강제하지 않는 값으로 화면만 막으면 "왜 안 되는지" 알 수 없는 상태가 된다).
 */
export function canRespondToSurvey(
  survey: Pick<ScheduleSurvey, 'status' | 'target_resource_ids'>,
  resourceId: string | null | undefined
): boolean {
  return survey.status === 'open' && isSurveyTarget(survey, resourceId);
}

/** 마감일까지 남은 일수. 마감일이 없으면 null, 지났으면 음수 */
export function daysUntilDue(
  dueDate: string | null | undefined,
  today = new Date()
): number | null {
  if (!isDateKey(dueDate)) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - base.getTime()) / 86_400_000);
}
