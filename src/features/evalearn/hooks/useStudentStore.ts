import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { EvalearnStudent } from '../types';

/** 집단 분석 대상 — 학년 전체(`classNum: null`) 또는 한 학급. */
export interface EvalearnCohort {
  grade: number;
  classNum: number | null;
}

interface StudentStore {
  students: EvalearnStudent[];
  selectedStudentId: string | null;
  /**
   * 집단(학년/학급) 분석 대상. **`null` 이면 개인 분석 화면**이다.
   *
   * 종전에는 `EvalearnApp` 의 `useState` 라 새로고침하면 사라졌고, 그러면 저장된
   * `selectedStudentId` 만 남아 **항상 개인 화면으로 돌아왔다**(2026-09-05 사용자 지적:
   * "3학년 전체나 학급도 로드될 수 있도록"). 학생 선택과 함께 저장해야 마지막으로 보던
   * 화면이 그대로 복원된다.
   */
  selectedCohort: EvalearnCohort | null;
  // Grade/class filter state
  filterGrade: number | null;
  filterClass: number | null;

  setStudents: (students: EvalearnStudent[]) => void;
  setSelectedStudentId: (id: string | null) => void;
  setSelectedCohort: (cohort: EvalearnCohort | null) => void;
  setFilterGrade: (grade: number | null) => void;
  setFilterClass: (classNum: number | null) => void;
}

export const useStudentStore = create<StudentStore>()(
  persist(
    (set) => ({
      students: [],
      selectedStudentId: null,
      selectedCohort: null,
      filterGrade: null,
      filterClass: null,

      setStudents: (students) => set({ students }),
      /* 학생을 고르면 개인 화면으로 — 집단 선택은 해제한다(둘은 배타적이다) */
      setSelectedStudentId: (id) => set(id ? { selectedStudentId: id, selectedCohort: null }
                                           : { selectedStudentId: id }),
      setSelectedCohort: (cohort) => set({ selectedCohort: cohort }),
      /*
        필터를 바꾸면 목록·선택을 비운다. **집단 선택도 함께 비운다** — 안 그러면
        3학년을 보다 1학년으로 필터를 바꿔도 화면엔 3학년 집단 분석이 그대로 남는다.
      */
      setFilterGrade: (grade) => set({ filterGrade: grade, filterClass: null, students: [],
                                       selectedStudentId: null, selectedCohort: null }),
      setFilterClass: (classNum) => set({ filterClass: classNum, students: [],
                                          selectedStudentId: null, selectedCohort: null }),
    }),
    {
      name: 'evalearn-student-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedStudentId: state.selectedStudentId,
        selectedCohort: state.selectedCohort,
        filterGrade: state.filterGrade,
        filterClass: state.filterClass,
      }),
    }
  )
);
