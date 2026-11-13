import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { toLocalDateKey } from '@/features/teacher-dashboard/utils/seatReservationOverview';
import { assignmentCourseLabel } from '@/features/school-life-schedule/types';

const STUDENT_HIDDEN_KINDS = new Set(['event', 'duty', 'training', 'personal']);

export function useStudentWeeklySchedule() {
  const { user, profile, isStudentView } = useAuth();
  const now = useCurrentTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const preview = isStudentView && profile?.role !== 'student';
  return useQuery({
    queryKey: ['student-weekly-schedule', user?.id, preview, toLocalDateKey(start)],
    enabled: !!user,
    queryFn: async () => {
      const [school, scoped] = await Promise.all([
        supabase.from('meeting').select('id, kind, starts_at, ends_at, meta')
          .lt('starts_at', end.toISOString()).gte('ends_at', start.toISOString()).order('starts_at'),
        preview ? Promise.resolve({ data: [], error: null }) : supabase.from('school_life_events')
          .select('id, title, visibility, starts_at, ends_at, course_offering(id, academic_year, semester, grade, subject_name, class_label, classroom, teacher_name)')
          .lt('starts_at', end.toISOString()).gte('ends_at', start.toISOString()).order('starts_at'),
      ]);
      if (school.error) throw school.error;
      if (scoped.error) throw scoped.error;
      const schoolEvents = (school.data ?? []).filter((event) => !STUDENT_HIDDEN_KINDS.has(event.kind)).map((event) => {
        const meta = event.meta;
        const title = meta && typeof meta === 'object' && !Array.isArray(meta) && typeof meta.title === 'string' ? meta.title : event.kind;
        return { id: event.id, kind: String(event.kind), starts_at: event.starts_at, ends_at: event.ends_at, meta: { title } };
      });
      const scopedEvents = (scoped.data ?? []).map((event) => ({
        id: event.id, kind: event.visibility,
        starts_at: event.starts_at, ends_at: event.ends_at,
        meta: { title: event.course_offering ? `[${assignmentCourseLabel(event.course_offering)}] ${event.title}` : event.title },
      }));
      return [...schoolEvents, ...scopedEvents].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    },
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}
