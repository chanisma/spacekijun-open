import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type {
  AlgorithmWeights,
  ExamScheduleInput,
  ExamScheduleOptions,
  ExamSubject,
  GradeInput,
  Grade,
  PinnedAssignment,
  ScheduleCandidate,
  ScheduleRunResult,
  SlotAssignment,
  SupervisionConfig,
} from '../types';
import { ALL_GRADES, DEFAULT_OPTIONS, DEFAULT_SUPERVISION, DEFAULT_WEIGHTS } from '../constants';
import { emptyGradeInput } from '../utils/multiGrade';

export type WizardStep =
  | 'basic'
  | 'insights'
  | 'scope'
  | 'periods'
  | 'pinned'
  | 'generate'
  | 'compare'
  | 'edit'
  | 'saved';

interface State {
  step: WizardStep;
  title: string;
  /** 포함 학년 (오름차순 유지) */
  grades: Grade[];
  /** 위저드에서 현재 편집 중인 학년 탭 */
  activeGrade: Grade;
  /** 전 학년 공유 시험 일수 */
  examDays: number;
  gradeInputs: Record<Grade, GradeInput>;
  supervision: SupervisionConfig;
  options: ExamScheduleOptions;
  weights: AlgorithmWeights;
  result: ScheduleRunResult | null;
  selectedCandidateId: string | null;
  finalizedAssignments: SlotAssignment[] | null;
  daysCustomized: Record<Grade, boolean>;
}

const DEFAULT_EXAM_DAYS = 3;

function initialGradeInputs(): Record<Grade, GradeInput> {
  return {
    1: emptyGradeInput(DEFAULT_EXAM_DAYS),
    2: emptyGradeInput(DEFAULT_EXAM_DAYS),
    3: emptyGradeInput(DEFAULT_EXAM_DAYS),
  };
}

const initialState: State = {
  step: 'basic',
  title: '',
  grades: [...ALL_GRADES],
  activeGrade: 1,
  examDays: DEFAULT_EXAM_DAYS,
  gradeInputs: initialGradeInputs(),
  supervision: { ...DEFAULT_SUPERVISION },
  options: { ...DEFAULT_OPTIONS },
  weights: { ...DEFAULT_WEIGHTS },
  result: null,
  selectedCandidateId: null,
  finalizedAssignments: null,
  daysCustomized: { 1: false, 2: false, 3: false },
};

/**
 * Distribute N subjects across D days. Base is floor(N/D); the remainder is
 * stacked entirely on the last day, per user requirement
 * ("나눠지지 않는 경우 마지막 날의 과목이 가장 크도록").
 */
function distributeExamCounts(subjectCount: number, dayCount: number): number[] {
  if (dayCount <= 0) return [];
  if (subjectCount <= 0) return new Array(dayCount).fill(0);
  const base = Math.floor(subjectCount / dayCount);
  const remainder = subjectCount - base * dayCount;
  const arr = new Array(dayCount).fill(base);
  arr[dayCount - 1] += remainder;
  return arr;
}

type Action =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'TOGGLE_GRADE'; grade: Grade }
  | { type: 'SET_ACTIVE_GRADE'; grade: Grade }
  | { type: 'SET_EXAM_DAYS'; days: number }
  | {
      type: 'SET_DAY_CONFIG';
      grade: Grade;
      dayIndex: number;
      patch: Partial<{ examCount: number; availablePeriods: number[] }>;
      markCustomized?: boolean;
    }
  | { type: 'AUTO_DISTRIBUTE_EXAM_COUNTS'; grade: Grade }
  | { type: 'SET_SUBJECTS'; grade: Grade; subjects: ExamSubject[] }
  | { type: 'UPDATE_SUBJECT'; grade: Grade; subjectId: string; patch: Partial<ExamSubject> }
  | { type: 'SET_PINNED'; grade: Grade; pinned: PinnedAssignment[] }
  | { type: 'ADD_PINNED'; grade: Grade; entry: PinnedAssignment }
  | { type: 'REMOVE_PINNED'; grade: Grade; subjectId: string }
  | { type: 'TOGGLE_PERIOD_ACTIVE'; grade: Grade; dayIndex: number; period: number }
  | { type: 'SET_SUPERVISION'; patch: Partial<SupervisionConfig> }
  | {
      type: 'LOAD_SETUP';
      payload: {
        title: string;
        grades: Grade[];
        examDays: number;
        gradeInputs: Partial<Record<Grade, GradeInput>>;
        supervision: SupervisionConfig;
        options: ExamScheduleOptions;
        weights: AlgorithmWeights;
      };
    }
  | { type: 'SET_OPTIONS'; patch: Partial<ExamScheduleOptions> }
  | { type: 'SET_WEIGHTS'; weights: AlgorithmWeights }
  | { type: 'SET_RESULT'; result: ScheduleRunResult | null }
  | { type: 'SELECT_CANDIDATE'; candidateId: string | null }
  | { type: 'SET_FINALIZED'; assignments: SlotAssignment[] | null }
  | { type: 'RESET' };

function patchGradeInput(
  state: State,
  grade: Grade,
  patch: (gi: GradeInput) => GradeInput,
): State {
  return {
    ...state,
    gradeInputs: { ...state.gradeInputs, [grade]: patch(state.gradeInputs[grade]) },
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_TITLE':
      return { ...state, title: action.title };
    case 'TOGGLE_GRADE': {
      const included = state.grades.includes(action.grade);
      // 최소 1개 학년은 유지
      if (included && state.grades.length === 1) return state;
      const grades = included
        ? state.grades.filter((g) => g !== action.grade)
        : [...state.grades, action.grade].sort((a, b) => a - b);
      const activeGrade = grades.includes(state.activeGrade) ? state.activeGrade : grades[0];
      return { ...state, grades, activeGrade };
    }
    case 'SET_ACTIVE_GRADE':
      return { ...state, activeGrade: action.grade };
    case 'SET_EXAM_DAYS': {
      // 시험 일수는 전 학년 공유 — 모든 학년의 day 배열 길이를 동기화
      const gradeInputs = { ...state.gradeInputs };
      for (const g of ALL_GRADES) {
        const gi = gradeInputs[g];
        const days = Array.from({ length: action.days }, (_, i) => {
          const existing = gi.days[i];
          return (
            existing ?? {
              dayIndex: i,
              examCount: 2,
              availablePeriods: [1, 2, 3],
            }
          );
        });
        const pinned = gi.pinned.filter((p) => p.dayIndex < action.days);
        gradeInputs[g] = { ...gi, examDays: action.days, days, pinned };
      }
      return { ...state, examDays: action.days, gradeInputs };
    }
    case 'SET_DAY_CONFIG': {
      const customized =
        action.markCustomized === false
          ? state.daysCustomized
          : { ...state.daysCustomized, [action.grade]: true };
      const next = patchGradeInput(state, action.grade, (gi) => ({
        ...gi,
        days: gi.days.map((d) =>
          d.dayIndex === action.dayIndex ? { ...d, ...action.patch } : d,
        ),
      }));
      return { ...next, daysCustomized: customized };
    }
    case 'AUTO_DISTRIBUTE_EXAM_COUNTS': {
      const gi = state.gradeInputs[action.grade];
      const dist = distributeExamCounts(gi.subjects.length, gi.days.length);
      const next = patchGradeInput(state, action.grade, (cur) => ({
        ...cur,
        days: cur.days.map((d, i) => {
          const desired = dist[i] ?? 0;
          const cap = d.availablePeriods.length;
          return { ...d, examCount: Math.min(desired, cap) };
        }),
      }));
      return {
        ...next,
        daysCustomized: { ...state.daysCustomized, [action.grade]: false },
      };
    }
    case 'TOGGLE_PERIOD_ACTIVE': {
      const gi = state.gradeInputs[action.grade];
      const target = gi.days.find((d) => d.dayIndex === action.dayIndex);
      const willDeactivate = target ? target.availablePeriods.includes(action.period) : false;
      const next = patchGradeInput(state, action.grade, (cur) => {
        const days = cur.days.map((d) => {
          if (d.dayIndex !== action.dayIndex) return d;
          const has = d.availablePeriods.includes(action.period);
          const nextPeriods = has
            ? d.availablePeriods.filter((p) => p !== action.period)
            : [...d.availablePeriods, action.period].sort((a, b) => a - b);
          // Cap examCount so it never exceeds new availablePeriods length
          const examCount = Math.min(d.examCount, nextPeriods.length);
          return { ...d, availablePeriods: nextPeriods, examCount };
        });
        const pinned = willDeactivate
          ? cur.pinned.filter(
              (p) => !(p.dayIndex === action.dayIndex && p.period === action.period),
            )
          : cur.pinned;
        return { ...cur, days, pinned };
      });
      return {
        ...next,
        daysCustomized: { ...state.daysCustomized, [action.grade]: true },
      };
    }
    case 'SET_SUBJECTS': {
      const validIds = new Set(action.subjects.map((s) => s.id));
      return patchGradeInput(state, action.grade, (gi) => ({
        ...gi,
        subjects: action.subjects,
        pinned: gi.pinned.filter((p) => validIds.has(p.subjectId)),
      }));
    }
    case 'UPDATE_SUBJECT':
      return patchGradeInput(state, action.grade, (gi) => ({
        ...gi,
        subjects: gi.subjects.map((s) =>
          s.id === action.subjectId ? { ...s, ...action.patch } : s,
        ),
      }));
    case 'SET_PINNED':
      return patchGradeInput(state, action.grade, (gi) => ({
        ...gi,
        pinned: action.pinned,
      }));
    case 'ADD_PINNED':
      return patchGradeInput(state, action.grade, (gi) => ({
        ...gi,
        pinned: [
          ...gi.pinned.filter((p) => p.subjectId !== action.entry.subjectId),
          action.entry,
        ],
      }));
    case 'REMOVE_PINNED':
      return patchGradeInput(state, action.grade, (gi) => ({
        ...gi,
        pinned: gi.pinned.filter((p) => p.subjectId !== action.subjectId),
      }));
    case 'SET_SUPERVISION':
      return { ...state, supervision: { ...state.supervision, ...action.patch } };
    case 'LOAD_SETUP': {
      // 저장된 생성 결과의 설정으로 위저드를 처음부터 다시 시작한다.
      // 미포함 학년은 초기값으로 두되 일수는 동기화하고, 자동 분배가 로드된
      // 일차 설정을 덮어쓰지 않도록 daysCustomized를 모두 true로 둔다.
      const p = action.payload;
      const grades = [...p.grades].sort((a, b) => a - b);
      const gradeInputs = initialGradeInputs();
      for (const g of ALL_GRADES) {
        gradeInputs[g] = p.grades.includes(g)
          ? (p.gradeInputs[g] ?? emptyGradeInput(p.examDays))
          : emptyGradeInput(p.examDays);
      }
      const options = {
        ...p.options,
        hardConstraints: { ...p.options.hardConstraints, maxExamsPerStudentPerDay: false },
      };
      return {
        ...initialState,
        step: 'basic',
        title: p.title,
        grades,
        activeGrade: grades[0] ?? 1,
        examDays: p.examDays,
        gradeInputs,
        supervision: { ...p.supervision },
        options,
        weights: { ...p.weights },
        daysCustomized: { 1: true, 2: true, 3: true },
      };
    }
    case 'SET_OPTIONS': {
      const merged = { ...state.options, ...action.patch };
      // Force-disable maxExamsPerStudentPerDay hard constraint — disabled at UI
      // level after brute-force analysis showed this is a footgun (mathematically
      // infeasible for many real subject combinations, leaves CSP searching forever).
      merged.hardConstraints = {
        ...merged.hardConstraints,
        maxExamsPerStudentPerDay: false,
      };
      return { ...state, options: merged };
    }
    case 'SET_WEIGHTS':
      return { ...state, weights: action.weights };
    case 'SET_RESULT':
      return { ...state, result: action.result };
    case 'SELECT_CANDIDATE': {
      const cand = state.result?.candidates.find((c) => c.id === action.candidateId) ?? null;
      return {
        ...state,
        selectedCandidateId: action.candidateId,
        finalizedAssignments: cand ? cand.assignments.map((a) => ({ ...a })) : null,
      };
    }
    case 'SET_FINALIZED':
      return { ...state, finalizedAssignments: action.assignments };
    case 'RESET':
      return {
        ...initialState,
        gradeInputs: initialGradeInputs(),
        supervision: { ...DEFAULT_SUPERVISION },
      };
    default:
      return state;
  }
}

interface ContextValue {
  state: State;
  buildInput: () => ExamScheduleInput;
  selectedCandidate: ScheduleCandidate | null;
  dispatch: React.Dispatch<Action>;
  setStep: (s: WizardStep) => void;
  setActiveGrade: (g: Grade) => void;
  /** 현재 활성 학년 탭의 GradeInput */
  activeGradeInput: GradeInput;
}

const Context = createContext<ContextValue | null>(null);

export function ExamScheduleProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setStep = useCallback((s: WizardStep) => dispatch({ type: 'SET_STEP', step: s }), []);
  const setActiveGrade = useCallback(
    (g: Grade) => dispatch({ type: 'SET_ACTIVE_GRADE', grade: g }),
    [],
  );

  const buildInput = useCallback((): ExamScheduleInput => {
    const gradeInputs: ExamScheduleInput['gradeInputs'] = {};
    for (const g of state.grades) gradeInputs[g] = state.gradeInputs[g];
    return {
      grades: [...state.grades].sort((a, b) => a - b),
      gradeInputs,
      supervision: state.supervision,
      options: state.options,
      weights: state.weights,
    };
  }, [state.grades, state.gradeInputs, state.supervision, state.options, state.weights]);

  const selectedCandidate = useMemo<ScheduleCandidate | null>(() => {
    if (!state.result || !state.selectedCandidateId) return null;
    return state.result.candidates.find((c) => c.id === state.selectedCandidateId) ?? null;
  }, [state.result, state.selectedCandidateId]);

  const value = useMemo<ContextValue>(
    () => ({
      state,
      buildInput,
      selectedCandidate,
      dispatch,
      setStep,
      setActiveGrade,
      activeGradeInput: state.gradeInputs[state.activeGrade],
    }),
    [state, buildInput, selectedCandidate, setStep, setActiveGrade],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useExamScheduleStore(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useExamScheduleStore must be inside ExamScheduleProvider');
  return ctx;
}
