/**
 * SRS Calculation Utilities
 * Retention rates, forgetting curves, and statistical helpers.
 */

import type { SrsCard, SrsDailyActivity } from '../types/srs.types';

/**
 * Calculate forgetting curve data points for visualization.
 * Returns an array of { day, retention } for plotting.
 */
export function getForgettingCurveData(
  intervalDays: number,
  points: number = 30
): Array<{ day: number; retention: number }> {
  const data: Array<{ day: number; retention: number }> = [];
  const stability = Math.max(1, intervalDays);

  for (let day = 0; day <= points; day++) {
    const retention = Math.round(Math.exp(-day / stability) * 100);
    data.push({ day, retention });
  }

  return data;
}

/**
 * Calculate subject-level progress as a percentage.
 * Progress = (mastered cards / total cards) * 100
 * A card is "mastered" if it has interval >= 21 days (3+ weeks)
 */
export function calculateSubjectProgress(cards: SrsCard[]): number {
  if (cards.length === 0) return 0;
  const mastered = cards.filter((c) => c.interval_days >= 21).length;
  return Math.round((mastered / cards.length) * 100);
}

/**
 * Count cards due for review (next_review_at <= now OR status = 'new')
 */
export function countDueCards(cards: SrsCard[]): number {
  const now = new Date();
  return cards.filter((card) => {
    if (card.status === 'suspended') return false;
    if (card.status === 'new') return true;
    if (!card.next_review_at) return true;
    return new Date(card.next_review_at) <= now;
  }).length;
}

/**
 * Sort cards for study session: new cards first, then by due date.
 */
export function sortCardsForStudy(cards: SrsCard[]): SrsCard[] {
  return [...cards].sort((a, b) => {
    // New cards first
    if (a.status === 'new' && b.status !== 'new') return -1;
    if (a.status !== 'new' && b.status === 'new') return 1;

    // Then by due date (earliest first)
    const aDate = a.next_review_at ? new Date(a.next_review_at).getTime() : 0;
    const bDate = b.next_review_at ? new Date(b.next_review_at).getTime() : 0;
    return aDate - bDate;
  });
}

/**
 * Calculate average ease factor for a set of cards (indicator of difficulty).
 */
export function calculateAvgEaseFactor(cards: SrsCard[]): number {
  if (cards.length === 0) return 2.5;
  const sum = cards.reduce((acc, c) => acc + c.ease_factor, 0);
  return Math.round((sum / cards.length) * 100) / 100;
}

/**
 * Calculate average interval for a set of cards.
 */
export function calculateAvgInterval(cards: SrsCard[]): number {
  const reviewCards = cards.filter((c) => c.interval_days > 0);
  if (reviewCards.length === 0) return 0;
  const sum = reviewCards.reduce((acc, c) => acc + c.interval_days, 0);
  return Math.round((sum / reviewCards.length) * 10) / 10;
}

/**
 * Generate heatmap data from daily activity records.
 * Returns a map of date string -> intensity level (0-4).
 */
export function generateHeatmapData(
  activities: SrsDailyActivity[],
  maxCardsPerDay: number = 50
): Map<string, number> {
  const heatmap = new Map<string, number>();

  for (const activity of activities) {
    const ratio = activity.cards_reviewed / maxCardsPerDay;
    let intensity: number;
    if (ratio === 0) intensity = 0;
    else if (ratio < 0.25) intensity = 1;
    else if (ratio < 0.5) intensity = 2;
    else if (ratio < 0.75) intensity = 3;
    else intensity = 4;

    heatmap.set(activity.activity_date, intensity);
  }

  return heatmap;
}

/**
 * Estimate next optimal session time based on due card distribution.
 */
export function estimateNextSessionTime(cards: SrsCard[]): Date | null {
  const futureDueCards = cards
    .filter((c) => c.next_review_at && new Date(c.next_review_at) > new Date())
    .map((c) => new Date(c.next_review_at!))
    .sort((a, b) => a.getTime() - b.getTime());

  if (futureDueCards.length === 0) return null;

  // Return the earliest due date, set to 08:00 AM
  const nextDate = new Date(futureDueCards[0]);
  nextDate.setHours(8, 0, 0, 0);
  return nextDate;
}
