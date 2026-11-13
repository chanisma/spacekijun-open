import { QueryClient, type InvalidateQueryFilters, type InvalidateOptions } from '@tanstack/react-query';

// The same records appear under different query keys in lists, dashboards and pickers.
// Keep this explicit: unrelated screens must not refetch for every modal save/close.
const families = [
  ['schedule-events', 'meetings', 'meeting', 'today-meetings', 'student-weekly-schedule'],
  ['work-detail-jsonb', 'work-detail', 'work-jsonb', 'works-jsonb', 'works', 'work',
    'task', 'my-tasks-jsonb', 'enhanced-my-tasks', 'task-stats-jsonb', 'task-due-dates-schedule'],
  ['teacher_timetable', 'student_timetable', 'timetable-data', 'student-timetable', 'today-timetable', 'timetable-latest-term'],
  ['course_offering', 'student_enrollment', 'resource-select', 'school-life-assignment-courses', 'school-life-events'],
  ['resources', 'resource-tags', 'resource-tag-assignments', 'resources-by-tag',
    'resource-select', 'resource-names', 'timetable-resources', 'school-life-context'],
] as const;

const downstream: Record<string, readonly string[]> = {
  'academic-term': ['teacher_timetable', 'student_timetable', 'timetable-data', 'student-timetable', 'today-timetable',
    'timetable-latest-term', 'course_offering', 'student_enrollment', 'resource-select', 'school-life-assignment-courses'],
  'school-life-events': ['student-weekly-schedule'],
  'task-files': ['task', 'work-detail-jsonb'],
  'task-submissions': ['my-tasks-jsonb', 'works-jsonb', 'task-stats-jsonb'],
};

export function relatedQueryRoots(root: string): Set<string> {
  // One hop only: course updates should not recursively invalidate every resource query.
  return new Set([
    ...families.filter((family) => (family as readonly string[]).includes(root)).flat(),
    ...(downstream[root] ?? []),
  ].filter((related) => related !== root));
}

export class AppQueryClient extends QueryClient {
  override invalidateQueries(filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void> {
    const root = filters?.queryKey?.[0];
    if (typeof root !== 'string') return super.invalidateQueries(filters, options);
    const related = relatedQueryRoots(root);
    if (!related.size) return super.invalidateQueries(filters, options);
    const original = new Set(this.getQueryCache().findAll(filters).map((query) => query.queryHash));
    return super.invalidateQueries({
      ...filters,
      queryKey: undefined,
      exact: false,
      predicate: (query) => original.has(query.queryHash)
        || (related.has(String(query.queryKey[0])) && (!filters?.predicate || filters.predicate(query))),
    }, options);
  }
}
