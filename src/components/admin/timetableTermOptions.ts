import type { AcademicTerm } from '@/hooks/useAcademicTerm';

/**
 * 시간표 관리 화면(학생/교사)이 공유하는 학기 선택 로직.
 *
 * 시간표는 학기 단위로 운영되고 기준 학기는 학사력(시스템 설정 → 학사력 설정)이 정한다.
 * 관리 화면은 과거 학기 열람을 위해 드롭다운을 유지하지만 기본값은 학사력이다.
 */

export interface TermOption {
  academicYear: number;
  semester: number;
}

/**
 * 데이터에 존재하는 학기 목록에 학사력 학기를 합친다.
 *
 * 학사력 학기에 아직 시간표 데이터가 없더라도(=새 학기 시작 직후) 선택할 수 있어야
 * 그 학기로 업로드할 수 있다. 최신 학기가 위로 오도록 내림차순 정렬한다.
 */
export function mergeTermOptions(
  terms: TermOption[],
  academicTerm: AcademicTerm | null | undefined
): TermOption[] {
  const merged = [...terms];

  if (
    academicTerm &&
    !merged.some(
      (t) => t.academicYear === academicTerm.year && t.semester === academicTerm.semester
    )
  ) {
    merged.push({ academicYear: academicTerm.year, semester: academicTerm.semester });
  }

  return merged.sort((a, b) => b.academicYear - a.academicYear || b.semester - a.semester);
}
