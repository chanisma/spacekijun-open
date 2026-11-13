import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { getHomeroomScopes } from '@/features/teacher-dashboard/utils/homeroomStudentOverview';
import { buildBirthdayEvents, type BirthdayStudent } from '@/lib/homeroomBirthdays';
import type { ScheduleEvent } from '@/hooks/useSchedule';

/**
 * 담임 반 학생 생일을 스케줄 달력의 가상 일정으로 (2026-10-11).
 *
 * 담임 판정 = 태그 `N학년 N반`(공식 — `resource.meta.grade/class_number` 는 라이브 0건).
 * 교사 시점 미리보기에서는 미리보기 태그를 쓴다(`useHomeroomStudentOverview` 와 같은 규칙).
 * 학생 명단은 `resource`(재학생) — `student_basic_info` 는 졸업생도 남아 있다.
 */
export function useHomeroomBirthdays(
  currentResourceId: string | undefined | null,
  rangeStart: Date,
  rangeEnd: Date,
): { events: ScheduleEvent[]; scopeLabels: string[] } {
  const { isStudentView, isTeacherView, teacherPreviewTags } = useAuth();
  const resourceIds = currentResourceId && !isTeacherView && !isStudentView ? [currentResourceId] : [];
  const { data: assignments } = useResourceTagAssignments(resourceIds);
  const actualTags = currentResourceId
    ? (assignments?.get(currentResourceId) ?? []).map((tag) => tag.name)
    : [];
  const visibleTags = isStudentView ? [] : isTeacherView ? teacherPreviewTags : actualTags;
  // 태그 배열은 렌더마다 새로 만들어지므로 문자열 열쇠로 기억한다
  const tagKey = visibleTags.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scopes = useMemo(() => getHomeroomScopes(visibleTags), [tagKey]);
  const scopeKey = scopes.map((scope) => `${scope.grade}-${scope.classNum}`).join(',');

  const roster = useQuery({
    queryKey: ['schedule', 'homeroom-birthdays', scopeKey],
    queryFn: async (): Promise<BirthdayStudent[]> => {
      const results = await Promise.all(scopes.map((scope) => (
        supabase
          .from('resource')
          .select('id, name, meta')
          .eq('type', 'student')
          .eq('status', 'active')
          .filter('meta->>grade', 'eq', String(scope.grade))
          .filter('meta->>class', 'eq', String(scope.classNum))
      )));
      const failed = results.find((result) => result.error)?.error;
      if (failed) throw failed;
      return results.flatMap((result) => (result.data ?? []).flatMap((row) => {
        const meta = (row.meta ?? {}) as Record<string, unknown>;
        const birthday = typeof meta.birthday === 'string' ? meta.birthday : '';
        if (!birthday) return [];
        const number = Number(meta.number);
        return [{
          resourceId: row.id,
          name: row.name,
          grade: Number(meta.grade),
          classNum: Number(meta.class),
          number: Number.isFinite(number) ? number : null,
          birthday,
        }];
      }));
    },
    enabled: scopes.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const events = useMemo(
    () => buildBirthdayEvents(roster.data ?? [], new Date(startMs), new Date(endMs)),
    [roster.data, startMs, endMs],
  );

  return { events, scopeLabels: scopes.map((scope) => scope.label) };
}
