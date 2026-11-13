import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * `?student=<student_code>` 딥링크를 1회성으로 소비하는 훅.
 *
 * 헤더 통합 검색에서 학생을 선택하면 `/evalog?student=30101` 형태로 이동하는데,
 * 각 페이지는 이 훅으로 코드를 받아 자기 방식대로 학생을 선택/추가한다.
 * 콜백 호출 직후 URL에서 param을 제거(replace)하므로 새로고침·뒤로가기 시
 * 사용자가 이후에 바꾼 선택 상태를 덮어쓰지 않는다.
 */
export function useStudentDeepLink(onStudent: (studentCode: string) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  // 핸들러는 ref로 보관해 콜백 identity 변화가 effect를 재실행시키지 않도록 한다.
  const handlerRef = useRef(onStudent);
  handlerRef.current = onStudent;
  const consumedRef = useRef<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('student');
    if (!code || consumedRef.current === code) return;
    consumedRef.current = code;

    const next = new URLSearchParams(searchParams);
    next.delete('student');
    setSearchParams(next, { replace: true });

    handlerRef.current(code);
  }, [searchParams, setSearchParams]);
}
