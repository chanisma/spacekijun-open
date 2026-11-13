import { useMemo } from 'react';
import { useStudentTags } from './useRescueTags';
import { useStudentStatus } from './useRescueStatus';
import { useRescueNotes } from './useRescueNotes';

export function useRescueStudent(studentCode: string | null) {
  const tagsQ = useStudentTags(studentCode);
  const statusQ = useStudentStatus(studentCode);
  const notesQ = useRescueNotes(studentCode);

  return useMemo(() => ({
    tags: tagsQ.data ?? [],
    status: statusQ.data ?? null,
    notes: notesQ.data ?? [],
    isLoading: tagsQ.isLoading || statusQ.isLoading || notesQ.isLoading,
    isError: tagsQ.isError || statusQ.isError || notesQ.isError,
  }), [tagsQ, statusQ, notesQ]);
}
