/**
 * 펫 알림 재료 모으기 — 홈 카드들과 같은 쿼리 키를 써서 요청을 늘리지 않는다.
 *  · 급식: MealCard 와 같은 ['meal', 날짜]
 *  · 플래너: 오늘 할 일 (읽기 RPC 는 ±3일을 주므로 오늘만 거른다)
 *  · 시간표·학교 일정: usePetSchedule 이 이미 읽은 것
 * 판정은 전부 model/messages.ts 의 순수 함수가 한다.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NeisMealService } from '@/services/neisMealService';
import { fetchPlanner } from '@/features/planner/plannerService';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import type { PetLessonSlot } from './useTeacherWeeklyTimetable';
import { kstParts } from '../model/clock';
import { pickPetMessages, type PetMessage } from '../model/messages';
import type { PetView } from '../model/petModel';
import { PERIOD_WINDOWS } from './usePetSchedule';

interface WeeklyEvent { id: string; starts_at: string; ends_at: string; meta: { title?: unknown } | null }

export function usePetMessages(opts: {
  /** 플래너 알림을 만들지 — 서버 플래너는 학생·교사·관리자 본인에게 열려 있다 */
  plannerEnabled: boolean;
  userId: string | null;
  timetable: PetLessonSlot[];
  weekly: WeeklyEvent[];
  pet: { name: string; view: PetView | null } | null;
}): PetMessage[] {
  const now = useCurrentTime();
  const today = kstParts(now.getTime()).date;

  const { data: meal } = useQuery({
    // 한국 날짜(today) — toISOString 은 UTC 라 자정~오전 9시에 어제 급식을 불렀다(2026-10-23 제보)
    queryKey: ['meal', today],
    queryFn: () => NeisMealService.getMealData(today),
    staleTime: 30 * 60 * 1000,
  });

  const { data: planner } = useQuery({
    queryKey: ['academy-dormitory', opts.userId, 'tamagotchi', today],
    queryFn: () => fetchPlanner(today, null),
    enabled: opts.plannerEnabled && !!opts.userId,
    staleTime: 60_000,
  });

  const { weekday } = kstParts(now.getTime());
  const petView = opts.pet?.view;
  return useMemo(() => pickPetMessages({
    nowMs: now.getTime(),
    todayLessons: opts.timetable
      .filter((e) => e.day_of_week === weekday && e.subject)
      .map((e) => ({ period: e.period, subject: e.subject, teacher: e.teacher_name || undefined }))
      .sort((a, b) => a.period - b.period),
    periods: PERIOD_WINDOWS,
    meal: meal ? { lunch: meal.lunch?.menu, dinner: meal.dinner?.menu, lunchCalories: meal.lunch?.calories, dinnerCalories: meal.dinner?.calories } : null,
    planner: opts.plannerEnabled && planner
      ? { tasks: (planner.tasks ?? []).filter((t) => t.task_date === today).map((t) => ({ title: t.title, done: t.completed, time: t.start_time })) }
      : null,
    events: opts.weekly.map((e) => ({
      id: e.id,
      title: typeof e.meta?.title === 'string' ? e.meta.title : '',
      startsAt: Date.parse(e.starts_at),
      endsAt: Date.parse(e.ends_at),
    })).filter((e) => e.title),
    pet: opts.pet && petView
      ? { name: opts.pet.name, attention: petView.attention, poop: petView.poop, asleep: petView.asleep, stage: petView.stage, critical: petView.critical, hoursLeft: petView.hoursLeft, dead: petView.dead, deathCause: petView.deathCause, mode: petView.mode }
      : null,
  }), [now, today, weekday, meal, planner, opts.plannerEnabled, opts.timetable, opts.weekly, opts.pet, petView]);
}
