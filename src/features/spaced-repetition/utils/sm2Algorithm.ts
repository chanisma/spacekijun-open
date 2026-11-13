/**
 * SM-2 Spaced Repetition Algorithm (Modified)
 *
 * Based on the SuperMemo SM-2 algorithm by Piotr Wozniak.
 * Modified to use 4 quality levels instead of the original 6:
 *
 *   1 = Again  (complete failure, reset)
 *   2 = Hard   (recalled with difficulty)
 *   3 = Good   (recalled with some effort)
 *   4 = Easy   (recalled effortlessly)
 *
 * Core concept: Each card maintains an "ease factor" (EF) that determines
 * how fast intervals grow. Higher EF = longer intervals = less review needed.
 * The minimum EF is 1.3 to prevent intervals from collapsing to nothing.
 *
 * Forgetting curve: Intervals follow an exponential growth pattern
 * (1 → 4 → 10 → 25 → 63 days...) which mirrors the Ebbinghaus forgetting
 * curve — reviews happen just before predicted memory decay.
 */

import type { SM2Input, SM2Result, StudyQuality } from '../types/srs.types';

const MIN_EASE_FACTOR = 1.3;

/**
 * Calculate the next review schedule based on user response quality.
 *
 * @param input - Current card state + user's quality response
 * @returns New interval, repetition count, ease factor, and next review date
 */
export function calculateSM2(input: SM2Input): SM2Result {
  const { quality, repetitions, interval, easeFactor } = input;

  // Again (1): Complete reset — card goes back to "learning" state
  if (quality === 1) {
    return {
      interval: 0,
      repetitions: 0,
      easeFactor: Math.max(MIN_EASE_FACTOR, easeFactor - 0.20),
      nextReviewAt: addMinutes(new Date(), 1),
    };
  }

  let newEF = easeFactor;
  let newInterval: number;
  const newReps = repetitions + 1;

  if (quality === 2) {
    // Hard: Slower progression, penalize ease factor
    newEF = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15);
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 3;
    else newInterval = Math.round(interval * 1.2);
  } else if (quality === 3) {
    // Good: Standard SM-2 progression
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 4;
    else newInterval = Math.round(interval * easeFactor);
  } else {
    // Easy (4): Accelerated progression, boost ease factor
    newEF = easeFactor + 0.15;
    if (repetitions === 0) newInterval = 2;
    else if (repetitions === 1) newInterval = 7;
    else newInterval = Math.round(interval * easeFactor * 1.3);
  }

  return {
    interval: newInterval,
    repetitions: newReps,
    easeFactor: newEF,
    nextReviewAt: addDays(new Date(), newInterval),
  };
}

/**
 * Get the interval label shown on each response button.
 * These are approximate intervals to help the user decide.
 */
export function getIntervalLabel(
  quality: StudyQuality,
  repetitions: number,
  interval: number,
  easeFactor: number
): string {
  const result = calculateSM2({ quality, repetitions, interval, easeFactor });

  if (result.interval === 0) return '< 1분';
  if (result.interval === 1) return '1일';
  if (result.interval < 30) return `${result.interval}일`;
  if (result.interval < 365) {
    const months = Math.round(result.interval / 30);
    return `${months}개월`;
  }
  const years = (result.interval / 365).toFixed(1);
  return `${years}년`;
}

/**
 * Calculate the predicted retention rate at a given time point.
 * Uses the Ebbinghaus forgetting curve formula:
 *   R = e^(-t/S)
 * where t = elapsed time, S = memory stability (proportional to interval)
 */
export function predictRetention(
  intervalDays: number,
  daysSinceReview: number
): number {
  if (intervalDays <= 0) return 0;
  // Memory stability is approximately proportional to the learned interval
  const stability = intervalDays;
  const retention = Math.exp(-daysSinceReview / stability);
  return Math.round(retention * 100);
}

/**
 * Calculate overall retention rate from review history.
 */
export function calculateRetentionRate(
  totalReviews: number,
  correctReviews: number
): number {
  if (totalReviews === 0) return 0;
  return Math.round((correctReviews / totalReviews) * 100);
}

/**
 * Determine user level based on total reviews (gamification).
 * Level formula: sqrt(totalReviews / 50), minimum level 1.
 */
export function calculateLevel(totalReviews: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalReviews / 50)) + 1);
}

/**
 * Calculate how many cards are due for review on each day of the upcoming week.
 * Used for the "Upcoming Load" bar chart.
 */
export function calculateUpcomingLoad(
  cards: Array<{ next_review_at: string | null }>,
  startDate: Date = new Date()
): number[] {
  const load = [0, 0, 0, 0, 0]; // Mon-Fri

  for (const card of cards) {
    if (!card.next_review_at) {
      load[0]++; // Due now = counts as today
      continue;
    }

    const dueDate = new Date(card.next_review_at);
    const diffDays = Math.floor(
      (dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays >= 0 && diffDays < 5) {
      load[diffDays]++;
    }
  }

  return load;
}

// --- Date Helpers ---

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
