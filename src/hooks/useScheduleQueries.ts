
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScheduleEvent, MealInfo } from './useSchedule';
import NeisApiService from '@/services/neisApiService';
import { NotificationService } from '@/services/notificationService';
import { documentSubmissionService } from '@/services/documentSubmissionService';
import { UploadedFile, fileUploadService } from '@/services/fileUploadService';
import { useCallback, useMemo, useState } from 'react';
import { useScheduleEvents } from './useScheduleEvents';
import { useTaskDueDatesForSchedule } from './useTasksJsonb';

// Moved getCalendarDateRange here or keep it as utility? 
// It uses no state, so it can be a pure utility function.
export const getCalendarDateRange = (centerDate: Date, mode: 'month' | 'week' | 'day') => {
    const center = new Date(centerDate);

    switch (mode) {
        case 'day':
            // 하루 뷰: 해당 일만
            const dayStart = new Date(center.getFullYear(), center.getMonth(), center.getDate());
            const dayEnd = new Date(center.getFullYear(), center.getMonth(), center.getDate() + 1);
            return { start: dayStart, end: dayEnd };

        case 'week':
            // 주 뷰: 해당 주 (일요일 시작)
            const dayOfWeek = center.getDay();
            const weekStart = new Date(center.getFullYear(), center.getMonth(), center.getDate() - dayOfWeek);
            const weekEnd = new Date(center.getFullYear(), center.getMonth(), center.getDate() - dayOfWeek + 7);
            return { start: weekStart, end: weekEnd };

        case 'month':
        default:
            // 월 뷰: 해당 월 + 달력에 표시되는 이전/다음 월 일부
            const monthStart = new Date(center.getFullYear(), center.getMonth(), 1);
            const monthEnd = new Date(center.getFullYear(), center.getMonth() + 1, 1);

            // 달력 첫 주의 일요일부터
            const firstDayOfWeek = monthStart.getDay();
            const calendarStart = new Date(monthStart.getTime() - firstDayOfWeek * 24 * 60 * 60 * 1000);

            // 달력 마지막 주의 토요일까지
            const lastDayOfWeek = monthEnd.getDay();
            const daysToAdd = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
            const calendarEnd = new Date(monthEnd.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

            return { start: calendarStart, end: calendarEnd };
    }
};

export const useScheduleData = (selectedDate: Date, viewMode: 'month' | 'week' | 'day') => {
    // 최적화된 TanStack Query 훅 사용 - useMemo로 날짜 범위 캐싱
    const { start: dateRangeStart, end: dateRangeEnd } = useMemo(() => {
        return getCalendarDateRange(selectedDate, viewMode);
    }, [selectedDate, viewMode]);

    const { data: scheduleEvents = [], isLoading: scheduleLoading, refetch: refetchEvents } = useScheduleEvents(dateRangeStart, dateRangeEnd);
    const { data: taskEvents = [], isLoading: taskLoading, refetch: refetchTaskEvents } = useTaskDueDatesForSchedule(dateRangeStart, dateRangeEnd);

    // Combine schedule events and task events
    const events = useMemo(() => {
        const combined = [...scheduleEvents, ...taskEvents];
        // Sort by start time
        return combined.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    }, [scheduleEvents, taskEvents]);

    // Combined loading state
    const loading = scheduleLoading || taskLoading;

    // NEIS Data Fetching for out of range
    const fetchNeisForOutOfRange = useCallback(async (year: number, month: number): Promise<ScheduleEvent[]> => {
        try {
            console.log(`📅 ${year}년 ${month}월 NEIS 데이터 브라우저 메모리에 fetch 시작...`);

            // API에서 해당 월 데이터 가져오기
            const monthEvents = await NeisApiService.getSchoolScheduleForMonth(year, month);

            if (monthEvents.length === 0) {
                console.log(`📭 ${year}년 ${month}월 NEIS 학사일정이 없습니다.`);
                return [];
            }

            // ScheduleEvent 형식으로 변환 (리소스 ID 없이)
            const scheduleEvents: ScheduleEvent[] = monthEvents.map((neisEvent, index) => {
                const dateStr = neisEvent.AA_YMD;
                const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

                return {
                    id: `neis-memory-${neisEvent.AA_YMD}-${index}`,
                    kind: 'schedule' as const,
                    title: neisEvent.EVENT_NM,
                    starts_at: `${formattedDate}T00:00:00`,
                    ends_at: `${formattedDate}T23:59:59`,
                    status: 'scheduled',
                    created_by: '',
                    scope: 'global',
                    holiday: false,
                } as ScheduleEvent;
            });

            console.log(`✅ ${year}년 ${month}월 NEIS 데이터 ${scheduleEvents.length}개 브라우저 메모리에 저장`);
            return scheduleEvents;

        } catch (error) {
            console.error(`❌ ${year}년 ${month}월 NEIS 브라우저 메모리 fetch 실패:`, error);
            return [];
        }
    }, []);

    return {
        events,
        loading,
        refetchEvents,
        refetchTaskEvents,
        fetchNeisForOutOfRange,
        dateRangeStart,
        dateRangeEnd
    };
};

export const useMeals = () => {
    const [meals, setMeals] = useState<MealInfo[]>([]);

    const fetchMeals = async (_startDate?: Date, _endDate?: Date) => {
        try {
            // Mock Implementation
            const mealsData: MealInfo[] = [
                {
                    id: '1',
                    date: new Date().toISOString().split('T')[0],
                    meal_type: 'lunch',
                    menu: ['김치찌개', '쌀밥', '계란말이', '배추김치'],
                    calories: 650
                }
            ];
            setMeals(mealsData);
        } catch (error) {
            console.error('급식 조회 오류:', error);
        }
    };

    return { meals, fetchMeals };
};
