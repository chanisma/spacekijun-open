import { useCallback, useMemo, useState, useEffect } from 'react';
import { useStudentStore } from './useStudentStore';
import { EvalearnStudent } from '../types';
import { fetchStudentsWithMocking, searchStudentsByName } from '../services/evalearnService';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/lib/toast';

export function useStudentState() {
  const {
    students,
    selectedStudentId,
    filterGrade,
    filterClass,
    setStudents,
    setSelectedStudentId,
    setFilterGrade,
    setFilterClass,
  } = useStudentStore();

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<EvalearnStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  // 검색 결과에서 선택했을 수도 있으므로 두 목록 모두에서 찾는다.
  const selectedStudent = useMemo(
    () =>
      students.find((s) => s.id === selectedStudentId) ??
      searchResults.find((s) => s.id === selectedStudentId) ??
      null,
    [students, searchResults, selectedStudentId]
  );

  // 트리/검색 결과 어디서 선택하든 filterGrade/filterClass를 함께 맞춰,
  // 현재 활성 학급(=students 목록)과 selectedStudentId가 항상 일치하게 한다.
  // (student-dashboard의 handleStudentSelect와 동일한 패턴)
  const handleSelectStudent = useCallback(
    (student: EvalearnStudent) => {
      if (filterGrade !== student.grade) setFilterGrade(student.grade);
      if (filterClass !== student.classNum) setFilterClass(student.classNum);
      setSelectedStudentId(student.id);
    },
    [filterGrade, filterClass, setFilterGrade, setFilterClass, setSelectedStudentId]
  );

  // Load students when grade/class changes
  const loadStudents = useCallback(async () => {
    if (!filterGrade || !filterClass) {
      setStudents([]);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchStudentsWithMocking(filterGrade, filterClass);
      setStudents(result);
    } catch (err) {
      console.error('Failed to load students:', err);
      toast.error('학생 목록을 불러오는 데 실패했습니다.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [filterGrade, filterClass, setStudents]);

  // Auto-load when grade/class filter changes
  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // 이름 검색 (학년/반 무관, 학교 전체 대상)
  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);
    searchStudentsByName(trimmed)
      .then((result) => {
        if (!cancelled) setSearchResults(result);
      })
      .catch((err) => {
        console.error('Failed to search students:', err);
        if (!cancelled) {
          toast.error('학생 검색에 실패했습니다.');
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  return {
    students,
    selectedStudent,
    loading,
    filterGrade,
    filterClass,
    setFilterGrade,
    setFilterClass,
    handleSelectStudent,
    loadStudents,
    searchTerm,
    setSearchTerm,
    searchResults,
    searching,
  };
}
