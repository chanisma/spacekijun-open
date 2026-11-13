import React, { createContext, useContext, useEffect, useState } from 'react';

interface StudentDashboardState {
    grade: number | undefined;
    classNum: number | undefined;
    searchTerm: string;
    selectedStudentCode: string | null;
}

interface StudentDashboardContextType extends StudentDashboardState {
    setGrade: (grade: number | undefined) => void;
    setClassNum: (classNum: number | undefined) => void;
    setSearchTerm: (term: string) => void;
    setSelectedStudentCode: (code: string | null) => void;
    clearFilters: () => void;
}

const StudentDashboardContext = createContext<StudentDashboardContextType | undefined>(undefined);

const STORAGE_KEY = 'student-dashboard-state-v1';

export const StudentDashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Initialize state from sessionStorage
    const [state, setState] = useState<StudentDashboardState>(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load dashboard state', e);
        }
        return {
            grade: undefined,
            classNum: undefined,
            searchTerm: '',
            selectedStudentCode: null,
        };
    });

    // Sync state to sessionStorage whenever it changes
    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save dashboard state', e);
        }
    }, [state]);

    const setGrade = (grade: number | undefined) =>
        setState(prev => ({ ...prev, grade, selectedStudentCode: null })); // Option: Clear selection on filter change? Maybe keep it. Let's clear to avoid confusing state.

    const setClassNum = (classNum: number | undefined) =>
        setState(prev => ({ ...prev, classNum, selectedStudentCode: null }));

    const setSearchTerm = (searchTerm: string) =>
        setState(prev => ({ ...prev, searchTerm }));

    const setSelectedStudentCode = (selectedStudentCode: string | null) =>
        setState(prev => ({ ...prev, selectedStudentCode }));

    const clearFilters = () =>
        setState({
            grade: undefined,
            classNum: undefined,
            searchTerm: '',
            selectedStudentCode: null,
        });

    const value = {
        ...state,
        setGrade,
        setClassNum,
        setSearchTerm,
        setSelectedStudentCode,
        clearFilters,
    };

    return (
        <StudentDashboardContext.Provider value={value}>
            {children}
        </StudentDashboardContext.Provider>
    );
};

export const useStudentDashboardContext = () => {
    const context = useContext(StudentDashboardContext);
    if (!context) {
        throw new Error('useStudentDashboardContext must be used within a StudentDashboardProvider');
    }
    return context;
};
