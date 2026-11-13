import { supabase } from '@/integrations/supabase/client';
import type {
  HomeroomBirthdayReadRow,
  HomeroomCareStatus,
  HomeroomCareStatusReadRow,
  HomeroomCourseRoundReadRow,
  HomeroomCourseSubmissionReadRow,
  HomeroomScope,
  HomeroomSeatReservationReadRow,
  HomeroomStudentSignalReadResult,
  HomeroomStudentReadRow,
  SeatAttendanceStatus,
} from '../types';

function normalizeAttendanceStatus(value: unknown): SeatAttendanceStatus {
  return value === 'attended' || value === 'excused' || value === 'supplement'
    ? value
    : null;
}

/**
 * 담임 홈 카드에 필요한 현재 학급 명부와 월간 자습 상태만 읽습니다.
 * 공유 좌석 테이블에는 어떤 쓰기 작업도 수행하지 않습니다.
 */
export async function readHomeroomStudentRows({
  scopes,
  monthStart,
  nextMonth,
}: {
  scopes: HomeroomScope[];
  monthStart: string;
  nextMonth: string;
}): Promise<{
  students: HomeroomStudentReadRow[];
  reservations: HomeroomSeatReservationReadRow[];
  identityDataAvailable: boolean;
  seatDataAvailable: boolean;
}> {
  const rosterResults = await Promise.all(scopes.map((scope) => (
    supabase
      .from('student_basic_info')
      .select('id, name, grade, class_num, number')
      .eq('grade', scope.grade)
      .eq('class_num', scope.classNum)
      .order('number', { ascending: true })
  )));

  const rosterError = rosterResults.find((result) => result.error)?.error;
  if (rosterError) throw rosterError;

  const roster = rosterResults.flatMap((result) => result.data ?? []);
  const studentCodes = roster.map((student) => String(student.id));
  let profileByStudentCode = new Map<string, string>();
  let identityDataAvailable = true;
  let seatDataAvailable = true;

  if (studentCodes.length > 0) {
    const identityResult = await supabase
      .from('student_identity_map')
      .select('student_code, profile_id')
      .in('student_code', studentCodes);

    if (identityResult.error) {
      identityDataAvailable = false;
      seatDataAvailable = false;
    } else {
      profileByStudentCode = new Map(
        (identityResult.data ?? [])
          .filter((row) => row.student_code && row.profile_id)
          .map((row) => [String(row.student_code), String(row.profile_id)]),
      );
    }
  }

  const students = roster.map((student) => {
    const studentCode = String(student.id);
    return {
      studentCode,
      profileId: profileByStudentCode.get(studentCode) ?? null,
      name: student.name?.trim() || '이름 미등록',
      grade: Number(student.grade),
      classNum: Number(student.class_num),
      number: student.number == null ? null : Number(student.number),
    };
  });
  const profileIds = Array.from(new Set(
    students.flatMap((student) => student.profileId ? [student.profileId] : []),
  ));

  if (!seatDataAvailable || profileIds.length === 0) {
    return { students, reservations: [], identityDataAvailable, seatDataAvailable };
  }

  const reservationResult = await supabase
    .from('seat_reservations')
    .select('student_id, reservation_date, is_attended, attendance_status')
    .gte('reservation_date', monthStart)
    .lt('reservation_date', nextMonth)
    .in('student_id', profileIds);

  if (reservationResult.error) {
    return {
      students,
      reservations: [],
      identityDataAvailable,
      seatDataAvailable: false,
    };
  }

  const reservations = (reservationResult.data ?? []).map((row) => ({
    student_id: String(row.student_id),
    reservation_date: String(row.reservation_date),
    is_attended: Boolean(row.is_attended),
    attendance_status: normalizeAttendanceStatus(row.attendance_status),
  }));

  return { students, reservations, identityDataAvailable, seatDataAvailable: true };
}

function isCareStatus(value: unknown): value is HomeroomCareStatus {
  return value === 'open' || value === 'monitoring';
}

/**
 * 담임 체크포인트용 보조 신호입니다. 생일의 전체 메타, 케어 사유,
 * 선택 과목명, 지원 대학 정보는 조회하지 않습니다.
 */
export async function readHomeroomStudentSignals(
  students: HomeroomStudentReadRow[],
): Promise<HomeroomStudentSignalReadResult> {
  const studentCodes = students.map((student) => student.studentCode);
  const targetGrades = new Set(students.map((student) => student.grade));
  const gradeThreeCodes = students
    .filter((student) => student.grade === 3)
    .map((student) => student.studentCode);

  if (studentCodes.length === 0) {
    return {
      birthdays: [],
      careStatuses: [],
      activeCourseRounds: [],
      courseSubmissions: [],
      wishlistStudentCodes: [],
      birthdayDataAvailable: true,
      careDataAvailable: true,
      courseSelectionDataAvailable: true,
      admissionDataAvailable: true,
    };
  }

  const [birthdayResult, careResult, roundResult] = await Promise.all([
    supabase
      .from('resource')
      .select('student_code:meta->>id, birthday:meta->>birthday')
      .eq('type', 'student')
      .in('meta->>id', studentCodes),
    supabase
      .from('rescue_student_status')
      .select('student_code, status')
      .in('student_code', studentCodes)
      .in('status', ['open', 'monitoring']),
    supabase
      .from('course_selection_round')
      .select('id, title, target_grade, status'),
  ]);

  const activeCourseRounds = roundResult.error
    ? []
    : (roundResult.data ?? [])
      .filter((round) => (
        round.status !== 'closed'
        && round.status !== 'finalized'
        && (round.target_grade == null || targetGrades.has(round.target_grade))
      ))
      .map((round) => ({
        id: String(round.id),
        title: round.title?.trim() || null,
        target_grade: round.target_grade == null ? null : Number(round.target_grade),
      }));

  let courseSubmissions: HomeroomCourseSubmissionReadRow[] = [];
  let courseSelectionDataAvailable = !roundResult.error;
  if (courseSelectionDataAvailable && activeCourseRounds.length > 0) {
    const submissionResult = await supabase
      .from('course_selection_submission')
      .select('round_id, student_code, status')
      .in('round_id', activeCourseRounds.map((round) => round.id))
      .in('student_code', studentCodes);

    if (submissionResult.error) {
      courseSelectionDataAvailable = false;
    } else {
      courseSubmissions = (submissionResult.data ?? [])
        .filter((row) => row.student_code)
        .map((row) => ({
          round_id: String(row.round_id),
          student_code: String(row.student_code),
          status: String(row.status),
        }));
    }
  }

  let wishlistStudentCodes: string[] = [];
  let admissionDataAvailable = true;
  if (gradeThreeCodes.length > 0) {
    const wishlistResult = await supabase
      .from('admission_wishlist')
      .select('student_code')
      .in('student_code', gradeThreeCodes);

    if (wishlistResult.error) {
      admissionDataAvailable = false;
    } else {
      wishlistStudentCodes = Array.from(new Set(
        (wishlistResult.data ?? []).map((row) => String(row.student_code)),
      ));
    }
  }

  const birthdays = birthdayResult.error
    ? []
    : ((birthdayResult.data ?? []) as unknown as HomeroomBirthdayReadRow[])
      .filter((row) => row.student_code);
  const careStatuses = careResult.error
    ? []
    : (careResult.data ?? [])
      .filter((row) => row.student_code && isCareStatus(row.status))
      .map((row) => ({
        student_code: String(row.student_code),
        status: row.status as HomeroomCareStatus,
      } satisfies HomeroomCareStatusReadRow));

  return {
    birthdays,
    careStatuses,
    activeCourseRounds: activeCourseRounds as HomeroomCourseRoundReadRow[],
    courseSubmissions,
    wishlistStudentCodes,
    birthdayDataAvailable: !birthdayResult.error,
    careDataAvailable: !careResult.error,
    courseSelectionDataAvailable,
    admissionDataAvailable,
  };
}
