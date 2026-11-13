import { useMemo } from 'react';
import { TimetableEntry } from '@/hooks/useTimetable';

/**
 * 시간표 격자(요일×교시) 조회 헬퍼.
 *
 * 주의: 여기서는 일정(meeting) 데이터를 다루지 않는다.
 * 예전에는 useSchedule()의 events를 받아 셀 위에 업무/연수 일정을 겹쳐 그렸는데,
 * 담당자 이름이 비동기로 늦게 도착하는 동안 필터가 통과되어 남의 업무 일정이
 * 잠깐 떴다가 사라지는 문제가 있었다. 시간표는 수업 데이터만 그린다.
 */
export const useTimetableEvents = (meetings: TimetableEntry[]) => {
    // 패턴(주간 반복) 수업은 '요일-교시'로 조회한다
    const meetingsMap = useMemo(() => {
        const map = new Map<string, TimetableEntry>();

        meetings.forEach(entry => {
            if (entry.type === 'pattern') {
                const key = `${entry.weekday}-${entry.period}`;
                map.set(key, entry);
            }
        });

        return map;
    }, [meetings]);

    const getTimetableEntryForSlot = (date: Date, period: number) => {
        const weekday = date.getDay() === 0 ? 7 : date.getDay();
        const key = `${weekday}-${period}`;
        return meetingsMap.get(key); // undefined if not found
    };

    return {
        getTimetableEntryForSlot
    };
};
