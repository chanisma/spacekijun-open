/**
 * Admin Context - 관리자 대시보드 상태 관리
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type {
  AdminStep,
  FileType,
  FileKey,
  UploadedFile,
  ParsedFileData,
  SubjectConfiguration,
  SubjectCategory,
  DEFAULT_SUBJECT_CATEGORIES,
  SystemStatistics,
  ExportOptions,
  ExportedFile,
} from '../types/admin.types';
import { DEFAULT_SUBJECT_CATEGORIES as CATEGORIES } from '../types/admin.types';
import { normalizeSubjectName } from '../utils/subjectUtils';

// ============================================================================
// State Types
// ============================================================================

interface AdminState {
  isOpen: boolean;
  currentStep: AdminStep;
  fileType: FileType;
  files: Map<FileKey, UploadedFile>;
  subjectConfig: SubjectConfiguration;
  isProcessing: boolean;
}

type AdminAction =
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'CLOSE_DASHBOARD' }
  | { type: 'SET_STEP'; payload: AdminStep }
  | { type: 'SET_FILE_TYPE'; payload: FileType }
  | { type: 'ADD_FILE'; payload: { key: FileKey; file: UploadedFile } }
  | { type: 'UPDATE_FILE'; payload: { key: FileKey; updates: Partial<UploadedFile> } }
  | { type: 'REMOVE_FILE'; payload: FileKey }
  | { type: 'CLEAR_ALL_FILES' }
  | { type: 'SET_SUBJECT_CONFIG'; payload: SubjectConfiguration }
  | { type: 'UPDATE_CATEGORY'; payload: { name: string; category: SubjectCategory } }
  | { type: 'ADD_SUBJECT_TO_CATEGORY'; payload: { categoryName: string; subject: string } }
  | { type: 'REMOVE_SUBJECT_FROM_CATEGORY'; payload: { categoryName: string; subject: string } }
  | { type: 'MOVE_SUBJECT'; payload: { subject: string; fromCategory: string; toCategory: string } }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'RESET_CONFIG' };

// ============================================================================
// Initial State
// ============================================================================

const STORAGE_KEY = 'course_analyze_admin_config';

function loadConfigFromStorage(): SubjectConfiguration {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load admin config from storage:', error);
  }
  return {
    categories: { ...CATEGORIES },
    uncategorized: [],
    lastModified: new Date().toISOString(),
    version: '1.0'
  };
}

function saveConfigToStorage(config: SubjectConfiguration) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...config,
      lastModified: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Failed to save admin config to storage:', error);
  }
}

const initialState: AdminState = {
  isOpen: false,
  currentStep: 1,
  fileType: 'riroschool',
  files: new Map(),
  subjectConfig: loadConfigFromStorage(),
  isProcessing: false,
};

// ============================================================================
// Reducer
// ============================================================================

function adminReducer(state: AdminState, action: AdminAction): AdminState {
  switch (action.type) {
    case 'OPEN_DASHBOARD':
      return { ...state, isOpen: true };

    case 'CLOSE_DASHBOARD':
      return { ...state, isOpen: false };

    case 'SET_STEP':
      return { ...state, currentStep: action.payload };

    case 'SET_FILE_TYPE':
      return { ...state, fileType: action.payload };

    case 'ADD_FILE': {
      const newFiles = new Map(state.files);
      newFiles.set(action.payload.key, action.payload.file);
      return { ...state, files: newFiles };
    }

    case 'UPDATE_FILE': {
      const newFiles = new Map(state.files);
      const existingFile = newFiles.get(action.payload.key);
      if (existingFile) {
        newFiles.set(action.payload.key, { ...existingFile, ...action.payload.updates });
      }
      return { ...state, files: newFiles };
    }

    case 'REMOVE_FILE': {
      const newFiles = new Map(state.files);
      newFiles.delete(action.payload);
      return { ...state, files: newFiles };
    }

    case 'CLEAR_ALL_FILES':
      return { ...state, files: new Map() };

    case 'SET_SUBJECT_CONFIG': {
      saveConfigToStorage(action.payload);
      return { ...state, subjectConfig: action.payload };
    }

    case 'UPDATE_CATEGORY': {
      const newConfig = {
        ...state.subjectConfig,
        categories: {
          ...state.subjectConfig.categories,
          [action.payload.name]: action.payload.category
        }
      };
      saveConfigToStorage(newConfig);
      return { ...state, subjectConfig: newConfig };
    }

    case 'ADD_SUBJECT_TO_CATEGORY': {
      const { categoryName, subject } = action.payload;
      const category = state.subjectConfig.categories[categoryName];
      if (!category) return state;

      const newConfig = {
        ...state.subjectConfig,
        categories: {
          ...state.subjectConfig.categories,
          [categoryName]: {
            ...category,
            subjects: [...category.subjects, subject],
            modified: new Date().toISOString()
          }
        },
        uncategorized: state.subjectConfig.uncategorized.filter(s => s !== subject)
      };
      saveConfigToStorage(newConfig);
      return { ...state, subjectConfig: newConfig };
    }

    case 'REMOVE_SUBJECT_FROM_CATEGORY': {
      const { categoryName, subject } = action.payload;
      const category = state.subjectConfig.categories[categoryName];
      if (!category) return state;

      const newConfig = {
        ...state.subjectConfig,
        categories: {
          ...state.subjectConfig.categories,
          [categoryName]: {
            ...category,
            subjects: category.subjects.filter(s => s !== subject),
            modified: new Date().toISOString()
          }
        },
        uncategorized: [...state.subjectConfig.uncategorized, subject]
      };
      saveConfigToStorage(newConfig);
      return { ...state, subjectConfig: newConfig };
    }

    case 'MOVE_SUBJECT': {
      const { subject, fromCategory, toCategory } = action.payload;
      const fromCat = state.subjectConfig.categories[fromCategory];
      const toCat = state.subjectConfig.categories[toCategory];

      if (fromCategory === '미분류') {
        // Moving from uncategorized to a category
        if (!toCat) return state;
        const newConfig = {
          ...state.subjectConfig,
          categories: {
            ...state.subjectConfig.categories,
            [toCategory]: {
              ...toCat,
              subjects: [...toCat.subjects, subject],
              modified: new Date().toISOString()
            }
          },
          uncategorized: state.subjectConfig.uncategorized.filter(s => s !== subject)
        };
        saveConfigToStorage(newConfig);
        return { ...state, subjectConfig: newConfig };
      }

      if (toCategory === '미분류') {
        // Moving from a category to uncategorized
        if (!fromCat) return state;
        const newConfig = {
          ...state.subjectConfig,
          categories: {
            ...state.subjectConfig.categories,
            [fromCategory]: {
              ...fromCat,
              subjects: fromCat.subjects.filter(s => s !== subject),
              modified: new Date().toISOString()
            }
          },
          uncategorized: [...state.subjectConfig.uncategorized, subject]
        };
        saveConfigToStorage(newConfig);
        return { ...state, subjectConfig: newConfig };
      }

      // Moving between categories
      if (!fromCat || !toCat) return state;
      const newConfig = {
        ...state.subjectConfig,
        categories: {
          ...state.subjectConfig.categories,
          [fromCategory]: {
            ...fromCat,
            subjects: fromCat.subjects.filter(s => s !== subject),
            modified: new Date().toISOString()
          },
          [toCategory]: {
            ...toCat,
            subjects: [...toCat.subjects, subject],
            modified: new Date().toISOString()
          }
        }
      };
      saveConfigToStorage(newConfig);
      return { ...state, subjectConfig: newConfig };
    }

    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };

    case 'RESET_CONFIG': {
      const newConfig = {
        categories: { ...CATEGORIES },
        uncategorized: [],
        lastModified: new Date().toISOString(),
        version: '1.0'
      };
      saveConfigToStorage(newConfig);
      return { ...state, subjectConfig: newConfig };
    }

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface AdminContextValue {
  // State
  state: AdminState;

  // Dashboard actions
  openDashboard: () => void;
  closeDashboard: () => void;
  setStep: (step: AdminStep) => void;

  // File actions
  setFileType: (type: FileType) => void;
  addFile: (key: FileKey, file: UploadedFile) => void;
  updateFile: (key: FileKey, updates: Partial<UploadedFile>) => void;
  removeFile: (key: FileKey) => void;
  clearAllFiles: () => void;

  // Subject config actions
  setSubjectConfig: (config: SubjectConfiguration) => void;
  updateCategory: (name: string, category: SubjectCategory) => void;
  addSubjectToCategory: (categoryName: string, subject: string) => void;
  removeSubjectFromCategory: (categoryName: string, subject: string) => void;
  moveSubject: (subject: string, fromCategory: string, toCategory: string) => void;
  resetConfig: () => void;

  // Processing
  setProcessing: (processing: boolean) => void;

  // Computed values
  statistics: SystemStatistics;
  allSubjectsFromFiles: string[];
  getSubjectCategory: (subject: string) => string;
}

const AdminContext = createContext<AdminContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(adminReducer, initialState);

  // Dashboard actions
  const openDashboard = useCallback(() => dispatch({ type: 'OPEN_DASHBOARD' }), []);
  const closeDashboard = useCallback(() => dispatch({ type: 'CLOSE_DASHBOARD' }), []);
  const setStep = useCallback((step: AdminStep) => dispatch({ type: 'SET_STEP', payload: step }), []);

  // File actions
  const setFileType = useCallback((type: FileType) => dispatch({ type: 'SET_FILE_TYPE', payload: type }), []);
  const addFile = useCallback((key: FileKey, file: UploadedFile) => dispatch({ type: 'ADD_FILE', payload: { key, file } }), []);
  const updateFile = useCallback((key: FileKey, updates: Partial<UploadedFile>) => dispatch({ type: 'UPDATE_FILE', payload: { key, updates } }), []);
  const removeFile = useCallback((key: FileKey) => dispatch({ type: 'REMOVE_FILE', payload: key }), []);
  const clearAllFiles = useCallback(() => dispatch({ type: 'CLEAR_ALL_FILES' }), []);

  // Subject config actions
  const setSubjectConfig = useCallback((config: SubjectConfiguration) => dispatch({ type: 'SET_SUBJECT_CONFIG', payload: config }), []);
  const updateCategory = useCallback((name: string, category: SubjectCategory) => dispatch({ type: 'UPDATE_CATEGORY', payload: { name, category } }), []);
  const addSubjectToCategory = useCallback((categoryName: string, subject: string) => dispatch({ type: 'ADD_SUBJECT_TO_CATEGORY', payload: { categoryName, subject } }), []);
  const removeSubjectFromCategory = useCallback((categoryName: string, subject: string) => dispatch({ type: 'REMOVE_SUBJECT_FROM_CATEGORY', payload: { categoryName, subject } }), []);
  const moveSubject = useCallback((subject: string, fromCategory: string, toCategory: string) => dispatch({ type: 'MOVE_SUBJECT', payload: { subject, fromCategory, toCategory } }), []);
  const resetConfig = useCallback(() => dispatch({ type: 'RESET_CONFIG' }), []);

  // Processing
  const setProcessing = useCallback((processing: boolean) => dispatch({ type: 'SET_PROCESSING', payload: processing }), []);

  // Get all unique subjects from uploaded files
  const allSubjectsFromFiles = useMemo(() => {
    const subjects = new Set<string>();
    state.files.forEach(file => {
      if (file.parsedData) {
        file.parsedData.subjects.semester1.forEach(s => subjects.add(s));
        file.parsedData.subjects.semester2.forEach(s => subjects.add(s));
      }
    });
    return Array.from(subjects).sort();
  }, [state.files]);

  // Get subject category
  // 정규화 매칭: 공백·중점·슬래시 표기 차이를 무시 ('경제 수학'≡'경제수학')
  const getSubjectCategory = useCallback((subject: string): string => {
    const target = normalizeSubjectName(subject);
    for (const [categoryName, category] of Object.entries(state.subjectConfig.categories)) {
      if (category.subjects.some(s => normalizeSubjectName(s) === target)) {
        return categoryName;
      }
    }
    return '미분류';
  }, [state.subjectConfig.categories]);

  // Calculate statistics
  const statistics = useMemo((): SystemStatistics => {
    let totalStudents = 0;
    let totalSubjectSelections = 0;
    const allSubjects = new Set<string>();

    state.files.forEach(file => {
      if (file.parsedData) {
        totalStudents += file.parsedData.students.length;
        file.parsedData.students.forEach(student => {
          totalSubjectSelections += student.semester1.length + student.semester2.length;
        });
        file.parsedData.subjects.semester1.forEach(s => allSubjects.add(s));
        file.parsedData.subjects.semester2.forEach(s => allSubjects.add(s));
      }
    });

    const categorizedSubjects = Object.values(state.subjectConfig.categories)
      .reduce((sum, category) => sum + category.subjects.length, 0);

    return {
      totalFiles: state.files.size,
      totalStudents,
      totalUniqueSubjects: allSubjects.size,
      categorizedSubjects,
      uncategorizedSubjects: state.subjectConfig.uncategorized.length,
      avgSubjectsPerStudent: totalStudents > 0 ? Math.round((totalSubjectSelections / totalStudents) * 10) / 10 : 0
    };
  }, [state.files, state.subjectConfig]);

  const value: AdminContextValue = {
    state,
    openDashboard,
    closeDashboard,
    setStep,
    setFileType,
    addFile,
    updateFile,
    removeFile,
    clearAllFiles,
    setSubjectConfig,
    updateCategory,
    addSubjectToCategory,
    removeSubjectFromCategory,
    moveSubject,
    resetConfig,
    setProcessing,
    statistics,
    allSubjectsFromFiles,
    getSubjectCategory,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider');
  }
  return context;
}
