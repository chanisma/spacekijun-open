/**
 * Course Data Hook - 과목 선택 데이터 관리
 * 파일 업로드, 파싱, 캐싱 처리
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  Student,
  SubjectConfiguration,
  CacheInfo,
  GradeSource,
  DatabaseGradeData,
  GradeSourceStats
} from '../types/course.types';
import { fetchGradesByStudentCodes, fetchRealIdMappings } from '../services/databaseGradeService';
import {
  loadFromDatabase as loadFromDatabaseAdapter,
  fetchAvailableAcademicYears,
  type LoadFromDatabaseOptions,
} from '../services/databaseAdapter';
import {
  parseFile,
  loadFileFromUrl,
  loadFromRawData,
  validateFile,
  downloadAsJson,
  exportToUnifiedFormat
} from '../utils/fileUtils';
import {
  getLastRoundStudentsForGrade,
  getAvailableRoundsForGrade
} from '../utils/dataProcessor';

export interface CourseDataState {
  students: Student[];
  gradeRoundGroups: Record<string, Student[]>;
  subjectConfiguration: SubjectConfiguration | null;
  isLoading: boolean;
  error: string | null;
  fileName: string | null;
  // Database Grade State
  gradeSource: GradeSource;
  databaseGrades: Map<string, DatabaseGradeData>;
  isFetchingDbGrades: boolean;
  /** 현재 화면이 들고 있는 데이터를 마지막으로 서버에서 받아온 시각 (새로고침 표시용) */
  lastLoadedAt: number | null;
}

/** processData 호출자가 로드 후 화면 상태를 어떻게 다룰지 지정 (내부 전용) */
interface ProcessDataOptions {
  /** 새로고침처럼 "보던 화면"을 유지해야 할 때 유지할 학년/차수 */
  preserveSelection?: { grade: number; round: number };
  /** 로드 완료 토스트 생략 (호출자가 자기 토스트를 띄우는 경우) */
  silent?: boolean;
}

export interface UseCourseDataReturn extends CourseDataState {
  // File Operations
  uploadFile: (file: File) => Promise<boolean>;
  loadFromUrl: (url: string) => Promise<boolean>;
  loadFromData: (data: unknown, sourceName?: string) => Promise<boolean>;
  loadFromDatabase: (options?: LoadFromDatabaseOptions) => Promise<boolean>;
  /**
   * 현재 보고 있는 데이터(학년도 · 학년 · 차수)를 그대로 유지한 채 DB에서 다시 받아온다.
   * 신청 데이터와 DB 성적을 함께 갱신한다.
   */
  refreshData: () => Promise<boolean>;
  /** 신청 데이터 재적재 또는 성적 재조회가 진행 중 */
  isRefreshing: boolean;
  clearData: () => void;
  exportData: (fileName?: string) => void;

  // Student Operations
  updateStudent: (studentId: string, updates: Partial<Student>) => void;
  deleteStudent: (studentId: string) => void;

  // Grade & Round Management
  currentGrade: number;
  currentRound: number;
  setCurrentGrade: (grade: number) => void;
  setCurrentRound: (round: number) => void;
  availableGrades: number[];
  availableRounds: number[];

  // Academic Year Management — DB 모드에서 학년도 단위 데이터 전환
  currentAcademicYear: number | null;
  availableAcademicYears: number[];
  setCurrentAcademicYear: (year: number) => Promise<boolean>;

  // Computed Data
  currentStudents: Student[];
  cacheInfo: CacheInfo | null;

  // Database Grade Methods
  fetchDatabaseGrades: (silent?: boolean) => Promise<void>;
  setGradeSource: (source: GradeSource) => void;
  getEffectiveGrade: (studentId: string | number) => number;
  getStudentDatabaseGrade: (studentId: string | number) => DatabaseGradeData | undefined;
  getDatabaseGradeStats: () => GradeSourceStats;
}

// Session Storage Keys
// 원칙: 원본 데이터(students)와 UI 상태만 저장. 파생 데이터(gradeRoundGroups,
// databaseGrades, subjectConfiguration)는 마운트 시 재계산/재페치 (Phase1-E 최적화).
const SESSION_STORAGE_KEYS = {
  GRADE_SOURCE: 'course-analyze-grade-source',
  STUDENTS: 'course-analyze-students',
  FILE_NAME: 'course-analyze-file-name',
  CURRENT_GRADE: 'course-analyze-current-grade',
  CURRENT_ROUND: 'course-analyze-current-round',
  CURRENT_ACADEMIC_YEAR: 'course-analyze-current-academic-year',
  // 레거시 키 (clearAllSessionStorage가 cleanup) — 새 데이터는 더 이상 쓰지 않음
  LEGACY_DATABASE_GRADES: 'course-analyze-db-grades',
  LEGACY_GRADE_ROUND_GROUPS: 'course-analyze-grade-round-groups',
  LEGACY_SUBJECT_CONFIG: 'course-analyze-subject-config',
};

// Phase1-E: databaseGrades는 더 이상 sessionStorage에 저장하지 않음.
// 마운트 시 자동 fetch로 채워지므로 stale 캐시 위험만 있고 절약 효과 없음.

function saveGradeSourceToSession(source: GradeSource) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.GRADE_SOURCE, source);
  } catch (e) {
    console.warn('Failed to save grade source to session storage:', e);
  }
}

function loadGradeSourceFromSession(): GradeSource {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.GRADE_SOURCE);
    if (stored && ['json', 'database', 'both'].includes(stored)) {
      return stored as GradeSource;
    }
  } catch (e) {
    console.warn('Failed to load grade source from session storage:', e);
  }
  return 'json';
}

// Core Data Session Storage Helpers
function saveStudentsToSession(students: Student[]) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  } catch (e) {
    console.warn('Failed to save students to session storage:', e);
  }
}

function loadStudentsFromSession(): Student[] {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.STUDENTS);
    if (stored) {
      return JSON.parse(stored) as Student[];
    }
  } catch (e) {
    console.warn('Failed to load students from session storage:', e);
  }
  return [];
}

// Phase1-E: gradeRoundGroups는 students에서 재구축, subjectConfig는 loadFromDatabase가
// 다시 빌드하므로 sessionStorage 저장/복원 불필요 (수십~수백 KB 절감).

/** students 배열에서 gradeRoundGroups를 재구축 (마운트 복원용) */
function buildGradeRoundGroupsFromStudents(students: Student[]): Record<string, Student[]> {
  const groups: Record<string, Student[]> = {};
  for (const s of students) {
    const key = `${s.year}-${s.round}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return groups;
}

function saveFileNameToSession(fileName: string | null) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.FILE_NAME, fileName || '');
  } catch (e) {
    console.warn('Failed to save file name to session storage:', e);
  }
}

function loadFileNameFromSession(): string | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.FILE_NAME);
    return stored || null;
  } catch (e) {
    console.warn('Failed to load file name from session storage:', e);
  }
  return null;
}

function saveCurrentGradeToSession(grade: number) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.CURRENT_GRADE, String(grade));
  } catch (e) {
    console.warn('Failed to save current grade to session storage:', e);
  }
}

function loadCurrentGradeFromSession(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.CURRENT_GRADE);
    if (stored) {
      return parseInt(stored, 10) || 2;
    }
  } catch (e) {
    console.warn('Failed to load current grade from session storage:', e);
  }
  return 2;
}

function saveCurrentRoundToSession(round: number) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEYS.CURRENT_ROUND, String(round));
  } catch (e) {
    console.warn('Failed to save current round to session storage:', e);
  }
}

function loadCurrentRoundFromSession(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.CURRENT_ROUND);
    if (stored) {
      return parseInt(stored, 10) || 1;
    }
  } catch (e) {
    console.warn('Failed to load current round from session storage:', e);
  }
  return 1;
}

function saveCurrentAcademicYearToSession(year: number | null) {
  try {
    if (year == null) {
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.CURRENT_ACADEMIC_YEAR);
    } else {
      sessionStorage.setItem(SESSION_STORAGE_KEYS.CURRENT_ACADEMIC_YEAR, String(year));
    }
  } catch (e) {
    console.warn('Failed to save current academic year to session storage:', e);
  }
}

function loadCurrentAcademicYearFromSession(): number | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.CURRENT_ACADEMIC_YEAR);
    if (stored) {
      const parsed = parseInt(stored, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  } catch (e) {
    console.warn('Failed to load current academic year from session storage:', e);
  }
  return null;
}

function clearAllSessionStorage() {
  Object.values(SESSION_STORAGE_KEYS).forEach(key => {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove ${key} from session storage:`, e);
    }
  });
}

export function useCourseData(): UseCourseDataReturn {
  const { toast } = useToast();

  // Core Data State - students만 sessionStorage에서 복원, gradeRoundGroups는 그로부터 재구축.
  // subjectConfiguration은 loadFromDatabase가 다시 빌드 (Phase1-E).
  const [students, setStudentsState] = useState<Student[]>(() => loadStudentsFromSession());
  const [gradeRoundGroups, setGradeRoundGroupsState] = useState<Record<string, Student[]>>(
    () => buildGradeRoundGroupsFromStudents(loadStudentsFromSession())
  );
  const [subjectConfiguration, setSubjectConfigurationState] = useState<SubjectConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileNameState] = useState<string | null>(() => loadFileNameFromSession());

  // Selection State - Initialize from sessionStorage
  const [currentGrade, setCurrentGradeState] = useState<number>(() => loadCurrentGradeFromSession());
  const [currentRound, setCurrentRoundState] = useState<number>(() => loadCurrentRoundFromSession());

  // Academic Year State — null = "최신년도 자동" (loadFromDatabase 결과로 보정됨)
  const [currentAcademicYear, setCurrentAcademicYearState] = useState<number | null>(
    () => loadCurrentAcademicYearFromSession()
  );
  const [availableAcademicYears, setAvailableAcademicYears] = useState<number[]>([]);

  // Database Grade State — databaseGrades는 마운트 시 자동 fetch로 채워짐 (Phase1-E)
  const [gradeSource, setGradeSourceState] = useState<GradeSource>(() => loadGradeSourceFromSession());
  const [databaseGrades, setDatabaseGradesState] = useState<Map<string, DatabaseGradeData>>(new Map());
  const [isFetchingDbGrades, setIsFetchingDbGrades] = useState(false);
  // 마지막으로 서버 응답을 반영한 시각. 새로고침 버튼이 "언제 기준 데이터인지" 보여준다.
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  // Stale request guard: every time we kick off a grades fetch, bump this ref.
  // The response handler discards itself if the ref moved on (newer fetch took over).
  const gradesFetchTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (students.length === 0 || availableAcademicYears.length > 0) return;

    (async () => {
      try {
        const years = await fetchAvailableAcademicYears();
        if (!cancelled) setAvailableAcademicYears(years);
      } catch (e) {
        console.warn('Failed to load course selection academic years:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [students.length, availableAcademicYears.length]);

  // Wrapped setters to persist to sessionStorage
  const setStudents = useCallback((studentsOrUpdater: Student[] | ((prev: Student[]) => Student[])) => {
    setStudentsState(prev => {
      const newStudents = typeof studentsOrUpdater === 'function' ? studentsOrUpdater(prev) : studentsOrUpdater;
      saveStudentsToSession(newStudents);
      return newStudents;
    });
  }, []);

  // Phase1-E: gradeRoundGroups/subjectConfiguration은 sessionStorage 저장 안함 (파생 데이터)
  const setGradeRoundGroups = useCallback((groupsOrUpdater: Record<string, Student[]> | ((prev: Record<string, Student[]>) => Record<string, Student[]>)) => {
    setGradeRoundGroupsState(prev => {
      return typeof groupsOrUpdater === 'function' ? groupsOrUpdater(prev) : groupsOrUpdater;
    });
  }, []);

  const setSubjectConfiguration = useCallback((config: SubjectConfiguration | null) => {
    setSubjectConfigurationState(config);
  }, []);

  const setFileName = useCallback((name: string | null) => {
    setFileNameState(name);
    saveFileNameToSession(name);
  }, []);

  const setCurrentGrade = useCallback((grade: number) => {
    setCurrentGradeState(grade);
    saveCurrentGradeToSession(grade);

    const rounds = getAvailableRoundsForGrade(gradeRoundGroups, grade);
    const latestRound = rounds[rounds.length - 1];
    if (latestRound !== undefined) {
      setCurrentRoundState(latestRound);
      saveCurrentRoundToSession(latestRound);
    }
  }, [gradeRoundGroups]);

  const setCurrentRound = useCallback((round: number) => {
    setCurrentRoundState(round);
    saveCurrentRoundToSession(round);
  }, []);

  const setGradeSource = useCallback((source: GradeSource) => {
    setGradeSourceState(source);
    saveGradeSourceToSession(source);
  }, []);

  // Phase1-E: databaseGrades sessionStorage 저장 안함 (마운트 시 자동 재페치)
  const setDatabaseGrades = useCallback((grades: Map<string, DatabaseGradeData>) => {
    setDatabaseGradesState(grades);
  }, []);

  // 마운트 시: 구버전 sessionStorage에서 복원된 학생들이 realID를 갖고 있지 않으면
  // 한 번만 enrich. realID 없는 채로 fetchDatabaseGrades가 돌면 fetchStudentIdMappings가
  // 다른 cohort의 학생으로 잘못 매핑할 수 있음 (#cohort-snum-collision).
  useEffect(() => {
    let cancelled = false;
    if (students.length === 0) return;
    const missingRealId = students.some(s => !s.realID);
    if (!missingRealId) return;

    (async () => {
      try {
        const mappings = await fetchRealIdMappings(
          students.map(s => ({ id: s.id, name: s.name }))
        );
        if (cancelled || mappings.size === 0) return;
        setStudentsState(prev => prev.map(s => {
          const real = mappings.get(String(s.id));
          return real ? { ...s, id: real, realID: real } : s;
        }));
        setGradeRoundGroupsState(prev => {
          const out: Record<string, Student[]> = {};
          for (const [k, arr] of Object.entries(prev)) {
            out[k] = arr.map(s => {
              const real = mappings.get(String(s.id));
              return real ? { ...s, realID: real } : s;
            });
          }
          return out;
        });
        // 갱신된 students 도 sessionStorage 에 다시 저장
        saveStudentsToSession(students.map(s => {
          const real = mappings.get(String(s.id));
          return real ? { ...s, id: real, realID: real } : s;
        }));
      } catch (e) {
        console.warn('Mount-time realID enrichment failed:', e);
      }
    })();

    return () => { cancelled = true; };
    // 의도적으로 한 번만: students.length가 0→N으로 바뀌는 첫 시점에만 보강
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enrich students with realID from resource table
  const enrichStudentsWithRealIds = useCallback(async (
    parsedStudents: Student[],
    parsedGroups: Record<string, Student[]>
  ): Promise<{ students: Student[]; gradeRoundGroups: Record<string, Student[]> }> => {
    // Phase 3: snapshot RPC가 realID를 이미 채운 경우 클라이언트 enrichment skip.
    // 모든 학생이 realID를 가지면 fetchRealIdMappings 호출 자체가 불필요.
    const allHaveRealId = parsedStudents.length > 0 && parsedStudents.every((s) => s.realID);
    if (allHaveRealId) {
      return { students: parsedStudents, gradeRoundGroups: parsedGroups };
    }

    try {
      const mappings = await fetchRealIdMappings(parsedStudents);

      if (mappings.size === 0) {
        return { students: parsedStudents, gradeRoundGroups: parsedGroups };
      }

      // realID를 채울 때 id도 realID로 교체 — 모든 다운스트림 lookup이 cohort-safe로 통일
      const enrich = (s: Student): Student => {
        const realID = mappings.get(String(s.id));
        return realID ? { ...s, id: realID, realID } : s;
      };

      const enrichedStudents = parsedStudents.map(enrich);
      const enrichedGroups: Record<string, Student[]> = {};
      for (const [key, group] of Object.entries(parsedGroups)) {
        enrichedGroups[key] = group.map(enrich);
      }

      return { students: enrichedStudents, gradeRoundGroups: enrichedGroups };
    } catch (err) {
      console.warn('Failed to enrich students with realIDs:', err);
      return { students: parsedStudents, gradeRoundGroups: parsedGroups };
    }
  }, []);

  // Process parsed data
  const processData = useCallback((
    parsedStudents: Student[],
    parsedGroups: Record<string, Student[]>,
    parsedConfig: SubjectConfiguration | null,
    sourceName: string,
    options: ProcessDataOptions = {}
  ) => {
    setStudents(parsedStudents);
    setGradeRoundGroups(parsedGroups);
    setSubjectConfiguration(parsedConfig);
    setFileName(sourceName);
    setError(null);
    setLastLoadedAt(Date.now());

    // 새로고침(preserveSelection)은 "보고 있던 화면을 그대로" 두는 것이 목적이므로
    // 새 데이터에 그 학년/차수가 남아 있으면 유지하고, 사라졌을 때만 기본값으로 떨어진다.
    // 최초 로드는 종전대로 첫 학년 · 최신 차수를 자동 선택한다.
    const grades = [...new Set(parsedStudents.map(s => s.year))].sort((a, b) => a - b);
    if (grades.length > 0) {
      const preferred = options.preserveSelection;
      const nextGrade = preferred && grades.includes(preferred.grade) ? preferred.grade : grades[0];
      // 주의: setCurrentGrade는 (stale한) gradeRoundGroups로 차수를 최신값으로 덮어쓴다.
      // 아래에서 parsedGroups 기준으로 다시 확정하므로 순서를 바꾸지 말 것.
      setCurrentGrade(nextGrade);

      const rounds = getAvailableRoundsForGrade(parsedGroups, nextGrade);
      if (rounds.length > 0) {
        const keepRound =
          preferred && preferred.grade === nextGrade && rounds.includes(preferred.round)
            ? preferred.round
            : rounds[rounds.length - 1]; // Select latest round
        setCurrentRound(keepRound);
      }
    }

    if (!options.silent) {
      toast({
        title: '데이터 로드 완료',
        description: `${parsedStudents.length}명의 학생 데이터를 불러왔습니다.`,
      });
    }
  }, [toast, setStudents, setGradeRoundGroups, setSubjectConfiguration, setFileName, setCurrentGrade, setCurrentRound]);

  // File Upload Handler
  const uploadFile = useCallback(async (file: File): Promise<boolean> => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || '유효하지 않은 파일입니다.');
      toast({
        title: '오류',
        description: validation.error,
        variant: 'destructive',
      });
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await parseFile(file);
      const enriched = await enrichStudentsWithRealIds(result.students, result.gradeRoundGroups);
      processData(
        enriched.students,
        enriched.gradeRoundGroups,
        result.subjectConfiguration,
        file.name
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '파일 처리 중 오류가 발생했습니다.';
      setError(errorMessage);
      toast({
        title: '파일 처리 오류',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [processData, enrichStudentsWithRealIds, toast]);

  // URL Load Handler
  const loadFromUrl = useCallback(async (url: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await loadFileFromUrl(url);
      const urlFileName = url.split('/').pop() || 'url-data';
      const enriched = await enrichStudentsWithRealIds(result.students, result.gradeRoundGroups);
      processData(
        enriched.students,
        enriched.gradeRoundGroups,
        result.subjectConfiguration,
        urlFileName
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'URL에서 데이터를 불러오는데 실패했습니다.';
      setError(errorMessage);
      toast({
        title: '데이터 로드 오류',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [processData, enrichStudentsWithRealIds, toast]);

  // Raw Data Load Handler (for imported JSON)
  const loadFromData = useCallback(async (data: unknown, sourceName: string = 'imported-data'): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = loadFromRawData(data);
      const enriched = await enrichStudentsWithRealIds(result.students, result.gradeRoundGroups);
      processData(
        enriched.students,
        enriched.gradeRoundGroups,
        result.subjectConfiguration,
        sourceName
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '데이터를 처리하는데 실패했습니다.';
      setError(errorMessage);
      toast({
        title: '데이터 로드 오류',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [processData, enrichStudentsWithRealIds, toast]);

  // 내부 헬퍼 — students를 인자로 받아 DB 성적 가져오기.
  // loadFromDatabase 내부에서 students state 업데이트와 병렬 발사하기 위해 분리.
  // notify=false 면 toast 생략(자동 로드 시 silent).
  const fetchGradesForStudents = useCallback(async (
    targetStudents: Student[],
    notify: boolean = true,
  ): Promise<void> => {
    if (targetStudents.length === 0) {
      if (notify) {
        toast({
          title: '데이터 없음',
          description: '먼저 과목선택 데이터를 업로드해주세요.',
          variant: 'destructive',
        });
      }
      return;
    }

    // Stale-response guard. Every fetch bumps the token; only the latest one
    // is allowed to mutate state when it returns. Prevents an earlier (slower)
    // fetch from overwriting a newer (faster) fetch's data on cohort switches.
    const fetchToken = ++gradesFetchTokenRef.current;
    // Build a Set of expected studentCodes for this fetch — used to filter out
    // any rows the RPC returns that don't actually correspond to this cohort.
    const expectedCodes = new Set<string>(
      targetStudents
        .map(s => (s.realID ? String(s.realID) : String(s.id)))
        .filter(c => c.includes('-'))
    );

    setIsFetchingDbGrades(true);
    try {
      const studentRefs = targetStudents.map(s => ({ id: String(s.id), name: s.name }));
      const realIdMap = new Map<string, string>();
      targetStudents.forEach(s => {
        if (s.realID) realIdMap.set(String(s.id), s.realID);
      });

      const dbGrades = await fetchGradesByStudentCodes(
        studentRefs,
        realIdMap.size > 0 ? realIdMap : undefined
      );

      // Stale fetch — newer fetch already started, discard this result entirely.
      if (fetchToken !== gradesFetchTokenRef.current) return;

      const gradesMap = new Map<string, DatabaseGradeData>();
      dbGrades.forEach(grade => {
        // Defense: only accept grades for students in this fetch's cohort.
        if (expectedCodes.size === 0 || expectedCodes.has(grade.studentCode)) {
          gradesMap.set(grade.studentCode, grade);
        }
      });
      setDatabaseGrades(gradesMap);
      setLastLoadedAt(Date.now());

      const loadedCount = dbGrades.filter(g => g.overallGrade > 0).length;
      if (notify) {
        toast({
          title: 'DB 성적 로드 완료',
          description: `${loadedCount}/${targetStudents.length}명의 학생 성적을 불러왔습니다.`,
        });
      }
      if (loadedCount > 0 && gradeSource === 'json') {
        setGradeSource('both');
      }
    } catch (err) {
      if (fetchToken !== gradesFetchTokenRef.current) return;
      const errorMessage = err instanceof Error ? err.message : '데이터베이스 성적 로드 실패';
      if (notify) {
        toast({ title: '오류', description: errorMessage, variant: 'destructive' });
      } else {
        console.warn('Auto-fetch DB grades failed:', errorMessage);
      }
    } finally {
      if (fetchToken === gradesFetchTokenRef.current) {
        setIsFetchingDbGrades(false);
      }
    }
  }, [toast, gradeSource, setDatabaseGrades, setGradeSource]);

  // Database Load Handler — DB의 course_selection_* 테이블에서 적재.
  // options.academicYear가 없으면 어댑터가 분석 가능한 최신 학년도를 선택한다.
  const loadFromDatabase = useCallback(async (
    options: LoadFromDatabaseOptions = {},
    processOptions: ProcessDataOptions = {},
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadFromDatabaseAdapter(options);
      if (!result) {
        return false;
      }
      const parsed = loadFromRawData(result.data);
      const enriched = await enrichStudentsWithRealIds(parsed.students, parsed.gradeRoundGroups);

      // ★ 학년도/학년 전환 시 race condition 방지: 이전 grades Map을 즉시 비운다.
      // 새 학생 state가 적용되고 새 grades fetch가 도착하기 전 사이에,
      // UI가 새 학생 ID로 이전 Map을 lookup하지 못하도록 차단.
      setDatabaseGradesState(new Map());

      // ★ 병렬화: enriched students가 확보된 직후 DB grades fetch를 fire-and-forget으로 시작.
      // processData()의 setState 일괄 처리와 grades 네트워크가 wall-clock 상 겹친다.
      // notify=false: 자동 로드 시 toast 중복 방지 (processData가 이미 토스트를 띄움).
      void fetchGradesForStudents(enriched.students, false);

      processData(
        enriched.students,
        enriched.gradeRoundGroups,
        parsed.subjectConfiguration,
        `database (학년도 ${result.meta.academicYear})`,
        processOptions
      );
      // 실제 로드된 학년도로 상태 동기화
      if (result.meta.academicYear != null) {
        setCurrentAcademicYearState(result.meta.academicYear);
        saveCurrentAcademicYearToSession(result.meta.academicYear);
      }
      // years 풀다운도 같은 응답의 부산물에서 채움 (별도 RTT 제거)
      // RPC가 null/string 등 잡것을 섞어 보낼 수 있어 (jsonb 직렬화 가정) 클라이언트에서 정규화한다.
      if (result.meta.availableAcademicYears && result.meta.availableAcademicYears.length > 0) {
        const sanitized = [...new Set(
          result.meta.availableAcademicYears
            .map((y) => Number(y))
            .filter((n) => Number.isFinite(n))
        )].sort((a, b) => b - a);
        if (sanitized.length > 0) setAvailableAcademicYears(sanitized);
      }
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'DB 데이터를 처리하는데 실패했습니다.';
      setError(errorMessage);
      toast({ title: 'DB 로드 오류', description: errorMessage, variant: 'destructive' });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [processData, enrichStudentsWithRealIds, toast, fetchGradesForStudents]);

  // 학년도 선택 → 즉시 재로드 (학생 리스트 통째로 갈리므로 재로드가 자연스러움)
  const setCurrentAcademicYear = useCallback(async (year: number): Promise<boolean> => {
    return loadFromDatabase({ academicYear: year });
  }, [loadFromDatabase]);

  // 새로고침 — 지금 보고 있는 학년도를 그대로 다시 받아온다.
  // loadFromDatabase가 내부에서 DB 성적 재조회까지 발사하므로 신청 데이터와 성적이 함께 갱신된다.
  // 어댑터에 캐시가 없어 항상 서버를 새로 친다.
  const refreshData = useCallback(async (): Promise<boolean> => {
    const ok = await loadFromDatabase(
      currentAcademicYear != null ? { academicYear: currentAcademicYear } : {},
      { preserveSelection: { grade: currentGrade, round: currentRound }, silent: true },
    );
    if (ok) {
      toast({
        title: '새로고침 완료',
        description: '현재 화면의 신청 데이터와 성적을 다시 불러왔습니다.',
      });
    }
    return ok;
  }, [loadFromDatabase, currentAcademicYear, currentGrade, currentRound, toast]);

  // availableAcademicYears는 loadFromDatabase 응답에서 부산물로 받음 — 별도 RTT 불필요

  // Clear Data
  const clearData = useCallback(() => {
    // Clear all session storage first
    clearAllSessionStorage();
    // Then reset all state
    setStudentsState([]);
    setGradeRoundGroupsState({});
    setSubjectConfigurationState(null);
    setFileNameState(null);
    setError(null);
    setCurrentGradeState(2);
    setCurrentRoundState(1);
    setCurrentAcademicYearState(null);
    setAvailableAcademicYears([]);
    setGradeSourceState('json');
    setDatabaseGradesState(new Map());
    setLastLoadedAt(null);
  }, []);

  // Export Data
  const exportData = useCallback((exportFileName?: string) => {
    if (students.length === 0) {
      toast({
        title: '내보내기 오류',
        description: '내보낼 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const unifiedData = exportToUnifiedFormat(students, subjectConfiguration);
    const name = exportFileName || `과목선택_${new Date().toISOString().split('T')[0]}.json`;
    downloadAsJson(unifiedData, name);

    toast({
      title: '내보내기 완료',
      description: `${name} 파일이 다운로드되었습니다.`,
    });
  }, [students, subjectConfiguration, toast]);

  // Update Student
  const updateStudent = useCallback((studentId: string, updates: Partial<Student>) => {
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, ...updates } : s
    ));

    // Also update gradeRoundGroups
    setGradeRoundGroups(prev => {
      const newGroups = { ...prev };
      for (const key in newGroups) {
        newGroups[key] = newGroups[key].map(s =>
          s.id === studentId ? { ...s, ...updates } : s
        );
      }
      return newGroups;
    });

    toast({
      title: '학생 정보 수정됨',
      description: '학생 정보가 성공적으로 수정되었습니다.',
    });
  }, [toast, setStudents, setGradeRoundGroups]);

  // Delete Student
  const deleteStudent = useCallback((studentId: string) => {
    setStudents(prev => prev.filter(s => s.id !== studentId));

    // Also update gradeRoundGroups
    setGradeRoundGroups(prev => {
      const newGroups = { ...prev };
      for (const key in newGroups) {
        newGroups[key] = newGroups[key].filter(s => s.id !== studentId);
      }
      return newGroups;
    });

    toast({
      title: '학생 삭제됨',
      description: '학생이 성공적으로 삭제되었습니다.',
    });
  }, [toast, setStudents, setGradeRoundGroups]);

  // Computed Values — Number()로 강제 캐스팅하여 string/number 혼재 시 React key 충돌 방지
  const availableGrades = useMemo(() => {
    const set = new Set<number>();
    for (const s of students) {
      const n = Number(s.year);
      if (Number.isFinite(n)) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  }, [students]);

  const availableRounds = useMemo(() => {
    return getAvailableRoundsForGrade(gradeRoundGroups, currentGrade);
  }, [gradeRoundGroups, currentGrade]);

  const currentStudents = useMemo(() => {
    return getLastRoundStudentsForGrade(gradeRoundGroups, currentGrade, currentRound);
  }, [gradeRoundGroups, currentGrade, currentRound]);

  const cacheInfo = useMemo((): CacheInfo | null => {
    if (students.length === 0) return null;

    return {
      size: students.length,
      grades: availableGrades,
      totalStudents: students.length
    };
  }, [students, availableGrades]);

  // Database Grade Methods
  // (fetchGradesForStudents는 loadFromDatabase 직전으로 이동 — TDZ 회피)

  // 외부 노출 API — 현재 students state로 호출.
  // silent=true: 자동 로드 시 토스트 생략 (수동 새로고침 등은 기본 false).
  const fetchDatabaseGrades = useCallback(async (silent: boolean = false) => {
    await fetchGradesForStudents(students, !silent);
  }, [students, fetchGradesForStudents]);

  // ★ databaseGrades는 studentCode(=realID, "00-00535") 키로만 저장됨 (cohort-safe).
  // Student.id 자체가 이제 realID로 통일되므로(dataProcessor + enrichStudentsWithRealIds에서 보장),
  // student.id를 그대로 키로 쓰면 충돌 없이 lookup 가능. 레거시 호환을 위해 학번 형식 fallback 유지.
  const resolveStudentCode = useCallback((studentId: string | number): string | undefined => {
    const idStr = String(studentId);
    // 1순위: 이미 student_code 형식이면 그대로 사용 (정상 경로)
    if (idStr.includes('-')) return idStr;
    // 2순위: 학번 형식인 레거시 호출 — students 배열에서 realID 찾기 (best-effort)
    const student = students.find(s => String(s.id) === idStr);
    return student?.realID;
  }, [students]);

  // 학생의 DB 성적 데이터 조회
  const getStudentDatabaseGrade = useCallback((studentId: string | number): DatabaseGradeData | undefined => {
    const code = resolveStudentCode(studentId);
    if (!code) return undefined;
    return databaseGrades.get(code);
  }, [databaseGrades, resolveStudentCode]);

  // 유효 등급 조회 (gradeSource에 따라 JSON 또는 DB 등급 반환)
  const getEffectiveGrade = useCallback((studentId: string | number): number => {
    const idStr = String(studentId);
    const code = resolveStudentCode(studentId);

    if (gradeSource === 'database') {
      const dbGrade = code ? databaseGrades.get(code) : undefined;
      return dbGrade?.overallGrade || 0;
    }

    if (gradeSource === 'json') {
      const student = students.find(s => String(s.id) === idStr);
      return student?.grade || 0;
    }

    // 'both' mode: DB 우선, 없으면 JSON
    const dbGrade = code ? databaseGrades.get(code) : undefined;
    if (dbGrade && dbGrade.overallGrade > 0) {
      return dbGrade.overallGrade;
    }

    const student = students.find(s => String(s.id) === idStr);
    return student?.grade || 0;
  }, [gradeSource, databaseGrades, students, resolveStudentCode]);

  // DB 성적 통계
  const getDatabaseGradeStats = useCallback((): GradeSourceStats => {
    const total = students.length;
    const withDb = students.filter(s => {
      const code = s.realID;
      if (!code) return false;
      const dbGrade = databaseGrades.get(code);
      return dbGrade && dbGrade.overallGrade > 0;
    }).length;

    return {
      total,
      withDb,
      withoutDb: total - withDb,
      dbPercentage: total > 0 ? Math.round((withDb / total) * 100) : 0
    };
  }, [students, databaseGrades]);

  return {
    // State
    students,
    gradeRoundGroups,
    subjectConfiguration,
    isLoading,
    error,
    fileName,

    // Database Grade State
    gradeSource,
    databaseGrades,
    isFetchingDbGrades,
    lastLoadedAt,

    // File Operations
    uploadFile,
    loadFromUrl,
    loadFromData,
    loadFromDatabase,
    refreshData,
    isRefreshing: isLoading || isFetchingDbGrades,
    clearData,
    exportData,

    // Student Operations
    updateStudent,
    deleteStudent,

    // Grade & Round Management
    currentGrade,
    currentRound,
    setCurrentGrade,
    setCurrentRound,
    availableGrades,
    availableRounds,

    // Academic Year Management
    currentAcademicYear,
    availableAcademicYears,
    setCurrentAcademicYear,

    // Computed Data
    currentStudents,
    cacheInfo,

    // Database Grade Methods
    fetchDatabaseGrades,
    setGradeSource,
    getEffectiveGrade,
    getStudentDatabaseGrade,
    getDatabaseGradeStats
  };
}
