import { useMemo } from 'react';
import { useResourceSelect } from '@/hooks/useResourceSelect';

export interface CoStudentInfo {
  code: string;
  name: string;
  grade?: number;
  classNum?: number;
  number?: number;
  /** "3학년 2반 2번 가별" 형태의 표시 라벨 (없는 필드는 생략) */
  label: string;
}

function formatLabel(name: string, grade?: number, classNum?: number, number?: number): string {
  const parts: string[] = [];
  if (grade != null) parts.push(`${grade}학년`);
  if (classNum != null) parts.push(`${classNum}반`);
  if (number != null) parts.push(`${number}번`);
  parts.push(name);
  return parts.join(' ');
}

/**
 * 동석 학생 표시용 학적 코드 → "학년 반 번호 이름" 리졸버.
 *
 * rescue_notes.co_student_codes 에는 학적 코드(resource.meta->>'id', 예: "00-00305")가
 * 저장된다. 화면에는 "3학년 2반 2번 가별" 처럼 보여주기 위해, 선택기와 동일한 student 쿼리
 * (queryKey ["resource-select","student"])를 재사용해 코드→정보 맵을 만든다. React Query
 * 캐시를 공유하므로 추가 네트워크 요청이 없다.
 *
 * - resolve(code): 코드를 "학년 반 번호 이름"으로. 미해석 코드는 코드 자체를 폴백으로 반환
 *   (로딩 중이거나 명부에서 사라진 학생 대비).
 * - resolveAll(codes): 여러 코드를 라벨 배열로.
 * - byCode: 코드 → 상세 정보 맵(개별 필드 접근용).
 */
export function useCoStudentNames() {
  const { studentResources } = useResourceSelect({ resourceType: 'student' });

  const byCode = useMemo(() => {
    const m = new Map<string, CoStudentInfo>();
    studentResources.forEach((s) => {
      if (!s.studentCode) return;
      m.set(s.studentCode, {
        code: s.studentCode,
        name: s.label,
        grade: s.studentGrade,
        classNum: s.studentClass,
        number: s.studentNumber,
        label: formatLabel(s.label, s.studentGrade, s.studentClass, s.studentNumber),
      });
    });
    return m;
  }, [studentResources]);

  const resolve = useMemo(() => (code: string) => byCode.get(code)?.label ?? code, [byCode]);
  const resolveAll = useMemo(
    () => (codes: string[]) => codes.map((c) => byCode.get(c)?.label ?? c),
    [byCode]
  );

  return { resolve, resolveAll, byCode };
}
