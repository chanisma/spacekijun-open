/** Staff experiences own their results; admin student previews remain read-only. */
export function gameStudentScope(role: string | null | undefined, email: string | null | undefined, viewAsStudentId?: string | null, userId?: string) {
  if (role === 'student') return { studentId: email?.split('@')[0] || null, readOnly: false };
  if (role === 'admin' && viewAsStudentId) return { studentId: viewAsStudentId, readOnly: true };
  if ((role === 'teacher' || role === 'admin') && userId) return { studentId: `experience:${userId}`, readOnly: false };
  return { studentId: null, readOnly: true };
}
