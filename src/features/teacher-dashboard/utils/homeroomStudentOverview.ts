import type {
  HomeroomScope,
  HomeroomSeatReservationReadRow,
  HomeroomStudentOverview,
  HomeroomStudentOverviewRow,
  HomeroomStudentReadRow,
  HomeroomStudentSignalReadResult,
} from '../types';
import { toLocalDateKey } from './seatReservationOverview';

const HOMEROOM_TAG_PATTERN = /^(\d+)학년\s*(\d+)반$/;

export function getHomeroomScopes(tagNames: string[]): HomeroomScope[] {
  const scopes = new Map<string, HomeroomScope>();

  tagNames.forEach((tagName) => {
    const match = tagName.trim().match(HOMEROOM_TAG_PATTERN);
    if (!match) return;

    const grade = Number(match[1]);
    const classNum = Number(match[2]);
    const key = `${grade}-${classNum}`;
    scopes.set(key, { grade, classNum, label: `${grade}학년 ${classNum}반` });
  });

  return Array.from(scopes.values()).sort(
    (a, b) => a.grade - b.grade || a.classNum - b.classNum,
  );
}

export function getLocalMonthRange(date = new Date()) {
  const monthStartDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextMonthDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return {
    monthStart: toLocalDateKey(monthStartDate),
    nextMonth: toLocalDateKey(nextMonthDate),
    today: toLocalDateKey(date),
    monthLabel: date.toLocaleDateString('ko-KR', { month: 'long' }),
  };
}

function summarizeStudent(
  student: HomeroomStudentReadRow,
  rows: HomeroomSeatReservationReadRow[],
  today: string,
  signals: HomeroomStudentSignalReadResult | undefined,
): HomeroomStudentOverviewRow {
  let attended = 0;
  let excused = 0;
  let supplement = 0;
  let pending = 0;
  let upcoming = 0;

  rows.forEach((row) => {
    if (row.attendance_status === 'supplement') {
      supplement += 1;
    } else if (row.attendance_status === 'excused') {
      excused += 1;
    } else if (row.attendance_status === 'attended' || row.is_attended) {
      attended += 1;
    } else if (row.reservation_date < today) {
      pending += 1;
    } else {
      upcoming += 1;
    }
  });

  const completed = attended + excused + supplement;
  const elapsed = completed + pending;
  const birthdayByStudentCode = new Map(
    (signals?.birthdays ?? []).map((row) => [row.student_code, row.birthday]),
  );
  const careByStudentCode = new Map(
    (signals?.careStatuses ?? []).map((row) => [row.student_code, row.status]),
  );
  const submissionByRoundAndStudent = new Map(
    (signals?.courseSubmissions ?? []).map((row) => [
      `${row.round_id}:${row.student_code}`,
      row.status,
    ]),
  );
  const wishlistStudentCodes = new Set(signals?.wishlistStudentCodes ?? []);
  const courseSelections = (signals?.activeCourseRounds ?? [])
    .filter((round) => round.target_grade == null || round.target_grade === student.grade)
    .map((round) => {
      const status = submissionByRoundAndStudent.get(`${round.id}:${student.studentCode}`) ?? null;
      return {
        roundId: round.id,
        title: round.title ?? '선택과목 신청',
        status,
        completed: status === 'submitted' || status === 'finalized',
      };
    });
  const admissionWishlistApplicable = student.grade === 3;
  const hasAdmissionWishlist = admissionWishlistApplicable && signals?.admissionDataAvailable
    ? wishlistStudentCodes.has(student.studentCode)
    : null;
  const birthdayDaysUntil = signals?.birthdayDataAvailable
    ? getBirthdayDaysUntil(birthdayByStudentCode.get(student.studentCode) ?? null, today)
    : null;
  const careStatus = signals?.careDataAvailable
    ? careByStudentCode.get(student.studentCode) ?? null
    : null;
  const hasProcedure = courseSelections.length > 0 || admissionWishlistApplicable;
  const courseSelectionNeedsAttention = courseSelections.some((selection) => !selection.completed);
  const procedureNeedsAttention = courseSelectionNeedsAttention
    || hasAdmissionWishlist === false;

  return {
    ...student,
    reservations: rows.length,
    attended,
    excused,
    supplement,
    completed,
    pending,
    upcoming,
    elapsed,
    completionRate: elapsed > 0 ? Math.round((completed / elapsed) * 100) : 0,
    birthdayDaysUntil,
    careStatus,
    courseSelections,
    admissionWishlistApplicable,
    hasAdmissionWishlist,
    hasProcedure,
    procedureNeedsAttention,
    needsAttention: pending > 0 || careStatus != null || courseSelectionNeedsAttention,
  };
}

function getBirthdayDaysUntil(birthday: string | null, todayKey: string): number | null {
  const match = birthday?.match(/(\d{2})-(\d{2})$/);
  if (!match) return null;

  const today = new Date(`${todayKey}T00:00:00`);
  const month = Number(match[1]);
  const day = Number(match[2]);
  let nextBirthday = new Date(today.getFullYear(), month - 1, day);
  if (nextBirthday < today) {
    nextBirthday = new Date(today.getFullYear() + 1, month - 1, day);
  }

  const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / 86_400_000);
  return daysUntil >= 0 && daysUntil <= 7 ? daysUntil : null;
}

export function buildHomeroomStudentOverview({
  students,
  reservations,
  monthStart,
  today,
  identityDataAvailable,
  seatDataAvailable,
  signals,
}: {
  students: HomeroomStudentReadRow[];
  reservations: HomeroomSeatReservationReadRow[];
  monthStart: string;
  today: string;
  identityDataAvailable: boolean;
  seatDataAvailable: boolean;
  signals?: HomeroomStudentSignalReadResult;
}): HomeroomStudentOverview {
  const reservationsByProfile = new Map<string, HomeroomSeatReservationReadRow[]>();

  reservations.forEach((reservation) => {
    const profileRows = reservationsByProfile.get(reservation.student_id) ?? [];
    profileRows.push(reservation);
    reservationsByProfile.set(reservation.student_id, profileRows);
  });

  const studentRows = students
    .map((student) => summarizeStudent(
      student,
      student.profileId ? reservationsByProfile.get(student.profileId) ?? [] : [],
      today,
      signals,
    ))
    .sort((a, b) => (
      a.grade - b.grade
      || a.classNum - b.classNum
      || (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name, 'ko')
    ));

  const totals = studentRows.reduce(
    (result, student) => ({
      reservations: result.reservations + student.reservations,
      attended: result.attended + student.attended,
      excused: result.excused + student.excused,
      supplement: result.supplement + student.supplement,
      completed: result.completed + student.completed,
      pending: result.pending + student.pending,
      upcoming: result.upcoming + student.upcoming,
    }),
    {
      reservations: 0,
      attended: 0,
      excused: 0,
      supplement: 0,
      completed: 0,
      pending: 0,
      upcoming: 0,
    },
  );

  return {
    monthStart,
    today,
    identityDataAvailable,
    seatDataAvailable,
    birthdayDataAvailable: signals?.birthdayDataAvailable ?? false,
    careDataAvailable: signals?.careDataAvailable ?? false,
    courseSelectionDataAvailable: signals?.courseSelectionDataAvailable ?? false,
    admissionDataAvailable: signals?.admissionDataAvailable ?? false,
    students: studentRows,
    studentCount: studentRows.length,
    participatingStudents: studentRows.filter((student) => student.reservations > 0).length,
    unlinkedStudents: studentRows.filter((student) => student.profileId == null).length,
    birthdayStudentsThisWeek: studentRows.filter((student) => student.birthdayDaysUntil != null).length,
    careStudents: studentRows.filter((student) => student.careStatus != null).length,
    procedureStudents: studentRows.filter((student) => student.procedureNeedsAttention).length,
    procedureCompletedStudents: studentRows.filter((student) => (
      student.hasProcedure && !student.procedureNeedsAttention
    )).length,
    attentionStudents: studentRows.filter((student) => student.needsAttention).length,
    activeCourseRoundCount: signals?.activeCourseRounds.length ?? 0,
    ...totals,
  };
}
