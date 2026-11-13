import { useState, useCallback, useMemo } from 'react';
import { Student } from '../types';
import { useEvaluationStore } from './useEvaluationStore';

function findStudentMatch(students: Student[], student: Student): number {
    return students.findIndex(s => {
        // 새 학생에게 학번이 있으면 학번으로만 매칭 (동명이인 구분)
        if (student.studentNo) {
            return s.studentNo === student.studentNo;
        }
        // 학번이 없으면 이름으로 매칭 (fallback)
        return s.name === student.name;
    });
}

interface EvaluationStateResult {
    students: Student[];
    selectedStudent: Student | null;
    selectedEvaluation: unknown;
    setStudents: (students: Student[] | ((prev: Student[]) => Student[])) => void;
    setSelectedStudent: (student: Student | null) => void;
    setSelectedEvaluation: (evaluation: unknown) => void;
    handleSelectStudent: (student: Student) => void;
    handlePdfJsonLoaded: (student: Student) => void;
    handleBatchAddStudents: (newStudents: Student[]) => void;
    handleUpdateStudentStatus: (id: string, status: Student['status']) => void;
    evaluationProgress: { completed: number; total: number };
}

export function useEvaluationState(): EvaluationStateResult {
    const {
        students,
        selectedStudentId,
        setStudents,
        setSelectedStudentId,
        updateStudentStatus
    } = useEvaluationStore();

    const selectedStudent = useMemo(
        () => students.find(s => s.id === selectedStudentId) ?? null,
        [students, selectedStudentId]
    );

    const [selectedEvaluation, setSelectedEvaluation] = useState<unknown>(null);

    const handleSelectStudent = useCallback((student: Student) => {
        setSelectedStudentId(student.id);
        setSelectedEvaluation(null);
    }, [setSelectedStudentId]);

    const handlePdfJsonLoaded = useCallback((student: Student) => {
        setStudents((prev) => {
            const existingIndex = findStudentMatch(prev, student);
            if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = student;
                return updated;
            }
            return [...prev, student];
        });

        setSelectedStudentId(student.id);
        setSelectedEvaluation(null);
    }, [setStudents, setSelectedStudentId]);

    const handleBatchAddStudents = useCallback((newStudents: Student[]) => {
        setStudents((prev) => {
            const updated = [...prev];
            for (const newStudent of newStudents) {
                const existingIndex = findStudentMatch(updated, newStudent);
                if (existingIndex >= 0) {
                    updated[existingIndex] = newStudent;
                } else {
                    updated.push(newStudent);
                }
            }
            return updated;
        });
    }, [setStudents]);

    const handleUpdateStudentStatus = useCallback((id: string, status: Student['status']) => {
        updateStudentStatus(id, status);
    }, [updateStudentStatus]);

    const evaluationProgress = useMemo(() => ({
        completed: students.filter(s => s.status === '평가완료').length,
        total: students.length
    }), [students]);

    const setSelectedStudent = useCallback((student: Student | null) => {
        setSelectedStudentId(student?.id ?? null);
    }, [setSelectedStudentId]);

    return {
        students,
        selectedStudent,
        selectedEvaluation,
        setStudents,
        setSelectedStudent,
        setSelectedEvaluation,
        handleSelectStudent,
        handlePdfJsonLoaded,
        handleBatchAddStudents,
        handleUpdateStudentStatus,
        evaluationProgress
    };
}
