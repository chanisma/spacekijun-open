import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Student } from '../types';

export interface StudentEvaluation {
    homeroom: {
        autonomy: string;
        career: string;
        behavior: string;
    };
    subject: {
        content: string;
        grade?: string;
    };
    club: {
        content: string;
    };
}

export type EvaluationMode = 'homeroom' | 'subject' | 'club';

interface EvaluationStore {
    data: Record<string, StudentEvaluation>; // Keyed by Student ID
    students: Student[];
    selectedStudentId: string | null;
    sourceFilename: string | null; // 불러온 파일명 (확장자 제외)

    updateEvaluation: (
        studentId: string,
        mode: EvaluationMode,
        field: string,
        value: string
    ) => void;
    getEvaluation: (studentId: string) => StudentEvaluation;
    importData: (newData: Record<string, StudentEvaluation>) => void;
    resetData: () => void;

    // New actions for student list persistence
    setStudents: (students: Student[] | ((prev: Student[]) => Student[])) => void;
    setSelectedStudentId: (id: string | null) => void;
    updateStudentStatus: (studentId: string, status: Student['status']) => void;
    setSourceFilename: (filename: string | null) => void;
}

const defaultEvaluation: StudentEvaluation = {
    homeroom: { autonomy: '', career: '', behavior: '' },
    subject: { content: '', grade: '' },
    club: { content: '' },
};

export const useEvaluationStore = create<EvaluationStore>()(
    persist(
        (set, get) => ({
            data: {},
            students: [],
            selectedStudentId: null,
            sourceFilename: null,

            updateEvaluation: (studentId, mode, field, value) => {
                set((state) => {
                    const currentData = state.data[studentId] || defaultEvaluation;
                    return {
                        data: {
                            ...state.data,
                            [studentId]: {
                                ...currentData,
                                [mode]: {
                                    ...currentData[mode],
                                    [field]: value,
                                },
                            },
                        },
                    };
                });
            },

            getEvaluation: (studentId) => {
                return get().data[studentId] || defaultEvaluation;
            },

            importData: (newData) => {
                set((state) => ({
                    data: { ...state.data, ...newData }
                }));
            },

            resetData: () => set({ data: {}, students: [], selectedStudentId: null, sourceFilename: null }),

            setStudents: (studentsOrUpdater) => {
                set((state) => {
                    const newStudents = typeof studentsOrUpdater === 'function'
                        ? studentsOrUpdater(state.students)
                        : studentsOrUpdater;
                    return { students: newStudents };
                });
            },

            setSelectedStudentId: (id) => set({ selectedStudentId: id }),

            updateStudentStatus: (studentId, status) => {
                set((state) => ({
                    students: state.students.map((s) =>
                        s.id === studentId ? { ...s, status } : s
                    ),
                }));
            },

            setSourceFilename: (filename) => set({ sourceFilename: filename }),
        }),
        {
            name: 'evalog-evaluation-storage', // unique name
            storage: createJSONStorage(() => localStorage),
        }
    )
);
