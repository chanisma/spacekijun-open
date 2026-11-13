import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduleEvent } from '@/hooks/useSchedule';
import type { SchoolLifeContext, SchoolLifeDraft, SchoolLifeEvent } from './types';
import { assignmentCourseLabel } from './types';

export function useSchoolLifeSchedule(start: Date, end: Date) {
  const { user, profile, isStudentView, isTeacherView } = useAuth();
  const qc = useQueryClient();
  const isPreview = (isStudentView && profile?.role !== 'student') || isTeacherView;
  const enabled = !!user && !isPreview;
  const context = useQuery({
    queryKey: ['school-life-context', user?.id, isPreview],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_school_life_schedule_context');
      if (error) throw error;
      return data as unknown as SchoolLifeContext;
    },
    staleTime: 30_000,
  });
  const events = useQuery({
    queryKey: ['school-life-events', user?.id, isPreview, start.toISOString(), end.toISOString()],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('school_life_events').select('*, course_offering(id, academic_year, semester, grade, subject_name, class_label, classroom, teacher_name)')
        .lte('starts_at', end.toISOString()).gte('ends_at', start.toISOString()).order('starts_at');
      if (error) throw error;
      return (data ?? []) as SchoolLifeEvent[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const invalidate = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['school-life-events'] }),
    qc.invalidateQueries({ queryKey: ['student-weekly-schedule'] }),
  ]);
  const save = useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: SchoolLifeDraft }) => {
      if (!enabled || !user) throw new Error('미리보기에서는 일정을 변경할 수 없습니다.');
      const query = id
        ? supabase.from('school_life_events').update({ title: draft.title.trim(), description: draft.description, starts_at: draft.starts_at, ends_at: draft.ends_at, date_only: draft.date_only, course_offering_id: draft.course_offering_id ?? null }).eq('id', id)
        : supabase.from('school_life_events').insert({ ...draft, title: draft.title.trim(), created_by: user.id });
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!enabled) throw new Error('미리보기에서는 일정을 변경할 수 없습니다.');
      const { error } = await supabase.from('school_life_events').delete().eq('id', id).select('id').single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const calendarEvents: ScheduleEvent[] = (events.data ?? []).map((event) => ({
    id: `school-life:${event.id}`,
    kind: event.visibility,
    title: event.course_offering ? `[${assignmentCourseLabel(event.course_offering)}] ${event.title}` : event.title,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    status: 'scheduled',
    created_by: event.created_by as ScheduleEvent['created_by'],
    date_only: event.date_only,
    section_name: event.course_offering ? assignmentCourseLabel(event.course_offering) : event.visibility === 'homeroom' ? `${event.grade}학년 ${event.class_num}반` : undefined,
    meta: { school_life_event_id: event.id, date_only: event.date_only },
  }));
  return { context, events, calendarEvents, save, remove, isPreview };
}
