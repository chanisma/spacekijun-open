/**
 * Timetable time conversion utilities
 * Standardizes period-to-time conversion across the application
 */

export const TIME_CONFIG = {
  /** Total number of periods per day */
  MAX_PERIODS: 7,
  /** Period time mappings (period -> {start, end}) */
  PERIOD_TIMES: {
    1: { start: '09:00', end: '09:50' },
    2: { start: '10:00', end: '10:50' },
    3: { start: '11:00', end: '11:50' },
    4: { start: '12:50', end: '13:40' },
    5: { start: '13:50', end: '14:40' },
    6: { start: '14:50', end: '15:40' },
    7: { start: '15:50', end: '16:40' },
  },
} as const;

/**
 * Converts period number to start hour
 * @param period Period number (1-7)
 * @returns Hour in 24-hour format or null if invalid period
 */
export const periodToHour = (period: number): number | null => {
  if (period < 1 || period > TIME_CONFIG.MAX_PERIODS) {
    return null;
  }
  const periodTime = TIME_CONFIG.PERIOD_TIMES[period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
  return parseInt(periodTime.start.split(':')[0]);
};

/**
 * Converts hour to period number
 * @param hour Hour in 24-hour format
 * @returns Period number (1-7) or null if outside school hours
 */
export const hourToPeriod = (hour: number): number | null => {
  // Check each period's start time
  for (let period = 1; period <= TIME_CONFIG.MAX_PERIODS; period++) {
    const periodTime = TIME_CONFIG.PERIOD_TIMES[period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
    const startHour = parseInt(periodTime.start.split(':')[0]);
    const endHour = parseInt(periodTime.end.split(':')[0]);
    const endMinute = parseInt(periodTime.end.split(':')[1]);
    
    // If hour is within the period's time range
    if (hour >= startHour && (hour < endHour || (hour === endHour && endMinute > 0))) {
      return period;
    }
  }
  return null;
};

/**
 * Formats period as time range string
 * @param period Period number (1-7)
 * @returns Formatted time string (e.g., "09:00-09:50")
 */
export const formatPeriodTime = (period: number): string => {
  if (period < 1 || period > TIME_CONFIG.MAX_PERIODS) {
    return `${period}교시`;
  }
  
  const periodTime = TIME_CONFIG.PERIOD_TIMES[period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
  return `${periodTime.start}-${periodTime.end}`;
};

/**
 * Gets period start time
 * @param period Period number (1-7)
 * @returns Start time string (e.g., "09:00") or null if invalid
 */
export const getPeriodStartTime = (period: number): string | null => {
  if (period < 1 || period > TIME_CONFIG.MAX_PERIODS) {
    return null;
  }
  
  const periodTime = TIME_CONFIG.PERIOD_TIMES[period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
  return periodTime.start;
};

/**
 * Gets period end time
 * @param period Period number (1-7)
 * @returns End time string (e.g., "09:50") or null if invalid
 */
export const getPeriodEndTime = (period: number): string | null => {
  if (period < 1 || period > TIME_CONFIG.MAX_PERIODS) {
    return null;
  }
  
  const periodTime = TIME_CONFIG.PERIOD_TIMES[period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
  return periodTime.end;
};

export interface PeriodTimeStatus {
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

/**
 * 현재 시각을 기준으로 교시의 진행 상태를 계산한다.
 *
 * 조회 시점에 캐시된 상태를 사용하지 않고 화면이 다시 렌더링될 때마다 계산할 수
 * 있도록 순수 함수로 제공한다. 쉬는 시간에는 이전 교시는 past, 다음 교시는 future다.
 */
export const getPeriodTimeStatus = (period: number, date: Date): PeriodTimeStatus => {
  const startTime = getPeriodStartTime(period);
  const endTime = getPeriodEndTime(period);

  if (!startTime || !endTime || !date || isNaN(date.getTime())) {
    return {
      isCurrent: false,
      isPast: false,
      isFuture: false,
    };
  }

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  return {
    isCurrent: currentMinutes >= startMinutes && currentMinutes <= endMinutes,
    isPast: currentMinutes > endMinutes,
    isFuture: currentMinutes < startMinutes,
  };
};

/**
 * Gets period from Date object
 * @param date Date object
 * @returns Period number or null if outside school hours
 */
export const getPeriodFromDate = (date: Date): number | null => {
  if (!date || isNaN(date.getTime())) {
    return null;
  }
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTime = hours * 60 + minutes; // Convert to minutes for easier comparison
  
  // Check each period's time range
  for (let period = 1; period <= TIME_CONFIG.MAX_PERIODS; period++) {
    const periodTime = TIME_CONFIG.PERIOD_TIMES[period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
    const [startHour, startMin] = periodTime.start.split(':').map(Number);
    const [endHour, endMin] = periodTime.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (currentTime >= startTime && currentTime <= endTime) {
      return period;
    }
  }
  
  return null;
};

/**
 * Checks if a date string is valid
 * @param dateString Date string to validate
 * @returns boolean indicating if date is valid
 */
export const isValidDate = (dateString: string | null | undefined): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Safely parses date string and returns Date object or null
 * @param dateString Date string to parse
 * @returns Date object or null if invalid
 */
export const safeParseDate = (dateString: string | null | undefined): Date | null => {
  if (!isValidDate(dateString)) return null;
  return new Date(dateString!);
};

/**
 * Weekday names in Korean
 */
export const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const;

/**
 * Gets Korean weekday name
 * @param weekday Weekday number (1-7, where 1 = Monday)
 * @returns Korean weekday name
 */
export const getWeekdayName = (weekday: number): string => {
  if (weekday < 1 || weekday > 7) {
    throw new Error(`Invalid weekday: ${weekday}. Must be between 1 and 7`);
  }
  return WEEKDAY_NAMES[weekday - 1];
};

// ----------------------------------------
// Relative Time Utilities
// ----------------------------------------

/**
 * Converts a date to a Korean relative time string (e.g., "방금 전", "5분 전", "3시간 전", "2일 전")
 * @param date Date object or date string
 * @returns Korean relative time string
 */
export const getTimeAgo = (date: Date | string): string => {
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(targetDate.getTime())) {
    return '알 수 없음';
  }

  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60));

  if (diffInMinutes < 1) {
    return '방금 전';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}분 전`;
  } else if (diffInMinutes < 1440) { // 24 hours
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours}시간 전`;
  } else {
    const days = Math.floor(diffInMinutes / 1440);
    return `${days}일 전`;
  }
};
