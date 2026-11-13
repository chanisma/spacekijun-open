/**
 * SRS Display Formatting Utilities
 */

/**
 * Format interval in days to human-readable Korean string.
 */
export function formatInterval(days: number): string {
  if (days === 0) return '지금';
  if (days === 1) return '1일';
  if (days < 7) return `${days}일`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks}주`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months}개월`;
  }
  const years = (days / 365).toFixed(1);
  return `${years}년`;
}

/**
 * Format due date relative to today.
 * e.g., "NOW", "T + 4D", "T + 12D"
 */
export function formatDueDate(nextReviewAt: string | null): string {
  if (!nextReviewAt) return 'NOW';

  const now = new Date();
  const due = new Date(nextReviewAt);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'NOW';
  if (diffDays === 1) return 'T + 1D';
  return `T + ${diffDays}D`;
}

/**
 * Format seconds to mm:ss display.
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format total time in seconds to hours display.
 */
export function formatTotalHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  return `${hours}`;
}

/**
 * Format average time per day in seconds to minutes display.
 */
export function formatAvgMinutesPerDay(totalSeconds: number, activeDays: number): string {
  if (activeDays === 0) return '0';
  const avgMinutes = Math.round(totalSeconds / activeDays / 60);
  return `${avgMinutes}`;
}

/**
 * Format large numbers with K suffix.
 * e.g., 12400 -> "12.4k"
 */
export function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  const k = count / 1000;
  return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
}

/**
 * Format recall time in milliseconds to seconds display.
 * e.g., 1400 -> "1.4s"
 */
export function formatRecallTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format percentage with optional sign.
 * e.g., 4.2 -> "+4.2%", -1.5 -> "-1.5%"
 */
export function formatPercentageChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Get day-of-week labels (Korean abbreviation).
 */
export function getWeekdayLabels(): string[] {
  return ['월', '화', '수', '목', '금'];
}

/**
 * Get month labels (English abbreviation).
 */
export function getMonthLabels(): string[] {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

/**
 * Format a date for display in "MMM DD" format.
 */
export function formatSessionDate(date: Date): { month: string; day: number; time: string } {
  const months = getMonthLabels();
  return {
    month: months[date.getMonth()].toUpperCase(),
    day: date.getDate(),
    time: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${date.getHours() < 12 ? 'AM' : 'PM'}`,
  };
}
