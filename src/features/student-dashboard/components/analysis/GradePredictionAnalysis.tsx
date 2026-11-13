import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
  LineChart, Line, ReferenceLine, ReferenceArea, ScatterChart, Scatter, ZAxis,
  ComposedChart, Area,
} from 'recharts';
import {
  useGradePrediction, usePredictionSnapshots, PredictionLoadError,
  type StudentPrediction, type KeyExamValues,
} from '../../hooks/useGradePrediction';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import {
  SUBJECT_GROUP_LABELS, SUBJECT_GROUP_ORDER, subjectGroupRank,
} from '../../utils/gradeNormalization';
import {
  CHART_COLORS, gradeColor, isPyeonggawonExam, buildMockExamTable, buildMockCohortChart,
  mockTrendPointFromCores, coreGradesFromExam, coreGradesFromReference, corePercentilesFromReference, withOfficialGrades,
  semesterNaesinFromRecords, type MockCore,
  buildSubjectPercentiles, NAESIN_PCT_MIN_GROUP, gradeFromTopPctExact,
  buildCompetitivenessScatter, buildCohortMockPercentile, COMPETITIVENESS_BIN,
} from '../../utils/analysisUtils';
import {
  buildSuneungForecast, SUNEUNG_W_SEPT, SUNEUNG_W_JUNE,
  buildSuneungCohortContext, SUNEUNG_MODE_LABEL, type SuneungMode, type SuneungForecast,
} from '@/features/evalearn/utils/suneungForecast';
import { useCohortReferenceGrades } from '@/features/evalearn/hooks/useCohortReferenceGrades';
import type { ReferenceGrade } from '@/features/evalearn/utils/referenceGrade';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { drawLineProps, fadeLineProps } from '@/lib/chartAnimation';
import { Loader2, Search, ChevronLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

// 국어 · 수학 · 영어 · **과학 · 사회** (2026-09-05 사용자 지시) — 순서 단일 출처는
// `gradeNormalization.ts` 의 `SUBJECT_GROUP_ORDER`. 모의고사 쪽 정렬과 같은 순서라야
// 한 화면에서 두 영역을 오갈 때 같은 자리를 다른 교과로 읽지 않는다.
const FEATURE_KEYS = [...SUBJECT_GROUP_ORDER, 'overall'] as const;
// 모의고사는 국·수·영만 별도 모델로 예측한다 (ml/train_grade_predictor.py의 MOCK_SUBJECT_MAP과 동일)
const MOCK_SUBJECT_KEYS = ['korean', 'math', 'english'] as const;
const MOCK_CHART_KEYS = [...MOCK_SUBJECT_KEYS, 'overall'] as const;
const PAGE_SIZE = 30;

/**
 * 학기별 추이 맨 오른쪽에 붙는 9월 모평 칸의 x 라벨.
 *
 * 3학년 2학기에는 내신이 아직 없고 모의고사만 있다 — 즉 이 칸은 **모의고사 계열만 값을 갖는다**
 * (내신 라인은 null 이라 3-1 에서 끊긴다). 그래도 학기 축에 붙여야 "3-1 예측 다음에 실제로
 * 어떻게 됐는가"가 한 줄에서 읽힌다.
 */
const SEPT_TREND_LABEL = '3-2 (9월)';

/** 학기별 추이 맨 오른쪽, 9월 다음에 붙는 수능 예상 칸. 유일하게 남은 '미래' 칸이다. */
const SUNEUNG_TREND_LABEL = '수능 (예상)';

const MOCK_SUBJECT_LABELS: Record<string, string> = { korean: '국어', math: '수학', english: '영어' };
const mockSubjectLabel = (key: string) => MOCK_SUBJECT_LABELS[key] ?? key;

// 국어/수학(상대평가)만 원점수·표준점수·백분위가 존재한다. 영어(절대평가)는 등급만 있어
// "새 방식"(백분위) 토글 대상에서 자연히 빠진다 (ml/train_grade_predictor.py의
// PERCENTILE_SUBJECT_KEYS와 동일).
const PERCENTILE_SUBJECT_KEYS = ['korean', 'math'];

// 주요 모의고사 흐름 스텝퍼의 행 정의. 백분위는 클수록, 등급은 작을수록 좋음 — Δ 색상 판정용.
const KEY_EXAM_FIELDS = [
  { key: 'korean_pct', label: '국어', higherIsBetter: true },
  { key: 'math_pct', label: '수학', higherIsBetter: true },
  { key: 'english_grade', label: '영어', higherIsBetter: false },
] as const;

// evalog MockExamGrades.tsx의 성적 데이터 테이블과 동일한 5단계 등급 배지 색상
const getGradeBadgeColor = (grade: number | null | undefined): string => {
  if (grade == null) return '';
  if (grade <= 2) return 'bg-emerald-50 text-emerald-700';
  if (grade <= 4) return 'bg-blue-50 text-blue-700';
  if (grade <= 6) return 'bg-amber-50 text-amber-700';
  if (grade <= 8) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
};

// 학생 상세 추이 차트의 표시 과목 목록: 내신 5교과 + 전체 + 모의고사(전체) + 모의고사 국/수/영
const TREND_TOGGLE_KEYS = [...FEATURE_KEYS, 'mock', ...MOCK_SUBJECT_KEYS.map(k => `mock_${k}`)];

// 추이 차트/툴팁/범례/토글 버튼이 공유하는 계열별 라벨·색상. 모의고사 과목별 라인은 같은 과목의
// 내신 라인과 같은 색을 쓰되 점선으로 구분해, "국어(실선)-모의 국어(점선)"이 한눈에 짝지어 보이게 한다.
function trendSeriesMeta(key: string): { label: string; color: string } {
  const featureKeys = FEATURE_KEYS as readonly string[];
  if (key === 'mock') return { label: '모의고사', color: '#8b5cf6' };
  if (key.startsWith('mock_')) {
    const base = key.slice('mock_'.length);
    const idx = featureKeys.indexOf(base);
    return { label: `모의 ${mockSubjectLabel(base)}`, color: CHART_COLORS[idx >= 0 ? idx : 0] };
  }
  if (key === 'overall') return { label: SUBJECT_GROUP_LABELS.overall, color: '#1e293b' };
  const idx = featureKeys.indexOf(key);
  return { label: SUBJECT_GROUP_LABELS[key] ?? key, color: CHART_COLORS[idx >= 0 ? idx : 0] };
}

/** 그 학생의 가장 최근 실측 모의고사(전체 + 국·수·영). 학기를 하나 골라 그 학기 값만 쓴다. */
/**
 * 정렬 키 → 그 행에서 **표가 실제로 그리는 값**.
 *
 * 예측 표와 실측 표는 같은 열 이름에 다른 값을 담으므로 `kind` 로 갈라야 한다.
 * 갈라 두지 않으면 실측 표를 보면서 예측값으로 정렬하게 되는데, 예측이 없는 학년
 * (3학년 206/217)에서는 전부 동점이 되어 **정렬이 아무 일도 하지 않는다**.
 *
 * 등급·상위% 모두 **작을수록 우수**라 기본 오름차순이 곧 "잘한 순"이다.
 */
type SortSpec = { key: string; dir: 'asc' | 'desc'; kind: 'prediction' | 'actual' };

/** 정렬 가능한 표 머리글. 활성 열은 캐럿으로 방향까지 밝힌다(누른 열을 눈으로 찾을 수 있어야 한다). */
const SortableTh: React.FC<{
  label: React.ReactNode;
  sortKey: string;
  kind: 'prediction' | 'actual';
  sort: SortSpec;
  onSort: (key: string, kind: 'prediction' | 'actual') => void;
  className?: string;
}> = ({ label, sortKey, kind, sort, onSort, className }) => {
  const active = sort.key === sortKey && sort.kind === kind;
  return (
    <th className={cn('text-center py-2 px-1', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey, kind)}
        className={cn('inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 transition-colors',
          active ? 'text-indigo-700 font-semibold bg-indigo-50' : 'hover:bg-slate-100')}
        title="눌러서 이 열로 정렬 · 다시 누르면 반대 방향"
      >
        {label}
        <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform',
          active ? (sort.dir === 'asc' ? 'rotate-0' : 'rotate-180') : 'opacity-25')} />
      </button>
    </th>
  );
};

/**
 * 등급 예상에서 과목이 빠지는 이유 — 화면이 "왜 없는지"를 말할 수 있어야 한다.
 * 특히 `no_rank` 는 결손이 아니라 **제도**다(진로·융합 선택은 성취도만 부여).
 */
const EXCLUDE_REASON: Record<string, string> = {
  no_rank: '석차등급을 받지 않는 과목입니다(진로·융합 선택은 성취도만 부여). 결손이 아니라 제도입니다.',
  no_group: '국어·수학·영어·사회·과학 어느 교과군에도 속하지 않아 교과군 평균에 넣을 수 없습니다(교양·제2외국어 등).',
  no_history: '그 교과의 과거 성적이 없어 위치를 낼 수 없습니다.',
  unknown: '학교 편제표에서 이 과목을 찾지 못했습니다.',
};
const EXCLUDE_REASON_SHORT: Record<string, string> = {
  no_rank: '성취도만', no_group: '교과군 밖', no_history: '이력 없음', unknown: '편제 미상',
};

/**
 * 과목 목록 정렬 — **국어 · 수학 · 영어 · 과학 · 사회**, 같은 교과군 안에서는 이수단위 큰 것부터.
 *
 * 실측·예측 두 표가 같은 규칙을 써야 나란히 놓고 읽을 수 있다. 파이프라인은 이수단위
 * 순으로만 정렬해 주므로(교과군 개념이 없다) 화면에서 다시 묶는다 — 옛 스냅샷도 함께 고쳐진다.
 */
/**
 * 숫자의 **출처·상태** 배지 (2026-09-06 적대적 검증).
 *
 * 한 화면에 공식 실측 · EBS 추정 · 모델 예측 · 계획 가정이 함께 놓이는데, 색만으로는
 * 권위가 비슷해 보인다("색뿐 아니라 각 숫자 옆에 출처·상태 라벨을 붙입니다"). 배지는
 * **색과 글자 둘 다** 로 구분해, 색을 구별하지 못해도 읽힌다(WCAG: 색만으로 정보를
 * 전달하지 않는다).
 *
 * 정의를 한 곳에 모아 두는 이유 — 화면마다 다른 말로 부르면 같은 값이 다른 것으로 읽힌다.
 */
const SOURCE_BADGE: Record<string, { label: string; cls: string; title: string }> = {
  actual: {
    label: '공식', cls: 'bg-slate-100 text-slate-700',
    title: '학교·평가원이 산출한 확정 값입니다.',
  },
  reference: {
    label: 'EBS 참고', cls: 'bg-amber-100 text-amber-800',
    title: '마킹을 EBS 예상 등급컷에 대조한 추정입니다. 공식 성적이 나오면 바뀝니다.',
  },
  predicted: {
    label: '예측', cls: 'bg-indigo-100 text-indigo-700',
    title: '졸업생·상급생의 학기 전이로 배운 모델이 낸 값입니다. 명목 80% 구간이 함께 있습니다.',
  },
  scenario: {
    label: '가정', cls: 'bg-violet-100 text-violet-700',
    title: '지금 실력을 유지한다고 볼 때 들을 과목 집단에서 나올 값입니다 — 미래 능력 예측이 아닙니다.',
  },
  rule: {
    label: '규칙', cls: 'bg-cyan-100 text-cyan-800',
    title: '학습된 모델이 아니라 정해 둔 규칙으로 계산한 값입니다(예: 수능 예상의 회차 혼합).',
  },
};

function SourceBadge({ kind, className }: { kind: keyof typeof SOURCE_BADGE; className?: string }) {
  const b = SOURCE_BADGE[kind];
  return (
    <span className={cn('px-1 py-0.5 rounded text-[10px] font-semibold align-middle', b.cls, className)}
      title={b.title}>
      {b.label}
    </span>
  );
}

function orderSubjectRows<T extends { group?: string | null; units?: number | null; subject: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) =>
    subjectGroupRank(a.group) - subjectGroupRank(b.group)
    || (b.units ?? 0) - (a.units ?? 0)
    || a.subject.localeCompare(b.subject, 'ko'));
}

function sortValueOf(row: {
  predNaesin: Record<string, number | null>;
  actualNaesin: Record<string, number | null>;
  predMock: Record<string, number | null>;
  actualMock: Record<string, number | null>;
  /** 예측 위치 = 능력 백분위(+구간) · 실측 위치 = 그 과목 안 상위%(+전교 보정) */
  predPct: { pct: number } | null;
  actualPct: { pct: number; pct_adj?: number | null } | null;
}, sort: SortSpec): number | null {
  const pred = sort.kind === 'prediction';
  if (sort.key === 'position') {
    // 표가 보여 주는 것과 같은 값으로 정렬한다 — 실측은 보정 후 전교 기준이 주값이다
    if (pred) return row.predPct?.pct ?? null;
    return row.actualPct ? (row.actualPct.pct_adj ?? row.actualPct.pct) : null;
  }
  if (sort.key.startsWith('mock:')) {
    const k = sort.key.slice(5);
    return (pred ? row.predMock : row.actualMock)[k] ?? null;
  }
  return (pred ? row.predNaesin : row.actualNaesin)[sort.key] ?? null;
}

function latestActualMockOf(s: StudentPrediction): { overall: number | null; subjects: Record<string, number> } {
  const sems = Object.keys(s.current_grades).sort();
  for (let i = sems.length - 1; i >= 0; i--) {
    const cg = s.current_grades[sems[i]];
    if (cg?.mock != null) return { overall: cg.mock, subjects: cg.mock_subjects ?? {} };
  }
  return { overall: null, subjects: {} };
}

interface Props {
  grade?: number;
  data: AnalysisStudentData[];
}

/**
 * 3학년 주요 모의고사 흐름 스텝퍼 — 3·5월 학평 → 6·9월 평가원 → 수능.
 *
 * ## 왜 컴포넌트로 뺐나 (2026-09-05 사용자 지시)
 * **3-2 예상(수능) 카드 안**으로 들어가야 하는데, 그 카드는 `forecast` 가 있을 때만
 * 그려진다(라이브 217명 중 197명). 카드 안에만 두면 나머지 20명은 흐름을 통째로 잃으므로,
 * 카드가 없을 때는 **바깥에 단독으로** 그린다 — 두 자리에 쓰려니 IIFE 로는 안 된다.
 *
 * ## 척도가 도중에 바뀐다
 * 3·5·6월은 국·수 **백분위**, 9월·수능은 **등급**이다(9월은 공식 백분위가 없고 EBS 참고
 * 등급뿐이라 백분위로 맞추면 추정 위에 추정을 얹게 된다). 그래서 Δ는 **같은 척도끼리만**
 * 비교한다 — 백분위 Δ와 등급 Δ는 좋아지는 방향이 반대라 섞으면 색이 거꾸로 칠해진다.
 * 등급 칸에는 백분위를 **함께** 적는다(등급 한 칸이 백분위 10~20 폭을 덮는다).
 */
const KeyExamFlowStepper: React.FC<{
  student: StudentPrediction;
  septCores: Partial<Record<MockCore, number>>;
  septPcts: Partial<Record<MockCore, number>>;
  juneCores: Partial<Record<MockCore, number>>;
  /** 9월 칸이 공식 성적인가(아니면 마킹 기반 참고 등급) */
  septOfficial?: boolean;
  forecast: SuneungForecast | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 3-2 예상 카드 안에 들어갈 때 — 제목을 줄이고 색을 카드에 맞춘다 */
  embedded?: boolean;
}> = ({ student, septCores, septPcts, juneCores, septOfficial, forecast, scrollRef, embedded }) => {
  if (student.grade !== 3 || !student.key_exam_flow) return null;

  const flow = student.key_exam_flow!.months;
  
  const hasSept = Object.keys(septCores).length > 0;

  type Step = {
    month: number; kind: string;
    /** 국·수의 척도. 영어는 절대평가라 언제나 등급이다. */
    coreScale: 'percentile' | 'grade';
    values: Partial<Record<MockCore, number>> | null;
    /**
     * 등급 칸(9월·수능)에 **함께 적는 백분위**. 등급 한 칸이 백분위 10~20 폭을
     * 덮으므로 등급만 내면 앞선 백분위 칸들과 견줄 해상도가 사라진다.
     * 절대평가(영어)는 백분위가 존재하지 않아 여기 담기지 않는다.
     */
    pcts?: Partial<Record<MockCore, number>> | null;
    /** Δ 비교 대상 — **반드시 같은 척도**여야 한다(백분위 Δ와 등급 Δ는 뜻이 반대다) */
    prev: Partial<Record<MockCore, number>> | null;
    status: 'actual' | 'reference' | 'estimate';
  };

  const fromFlow = (v: KeyExamValues | null | undefined): Partial<Record<MockCore, number>> | null => {
    if (!v) return null;
    const out: Partial<Record<MockCore, number>> = {};
    if (v.korean_pct != null) out.korean = v.korean_pct;
    if (v.math_pct != null) out.math = v.math_pct;
    if (v.english_grade != null) out.english = v.english_grade;
    return Object.keys(out).length ? out : null;
  };

  const steps: Step[] = [];
  for (const m of flow) {
    if (m.month === 9) {
      // 이제 실측이 있다 — 예전의 '6월 이월 예측'을 대체한다
      steps.push({
        month: 9, kind: m.kind, coreScale: 'grade',
        values: hasSept ? septCores : null,
        pcts: hasSept ? septPcts : null,
        prev: Object.keys(juneCores).length ? juneCores : null,
        status: septOfficial ? 'actual' : 'reference',
      });
    } else if (m.month === 11) {
      steps.push({
        month: 11, kind: m.kind, coreScale: 'grade',
        values: (() => {
          if (!forecast?.subjects.length) return null;
          const c: Partial<Record<MockCore, number>> = {};
          for (const sub of forecast.subjects) {
            if (sub.grade == null) continue;
            if (sub.area === '국어' && c.korean == null) c.korean = sub.grade;
            if (sub.area === '수학' && c.math == null) c.math = sub.grade;
            if (sub.area === '영어' && c.english == null) c.english = sub.grade;
          }
          return Object.keys(c).length ? c : null;
        })(),
        pcts: (() => {
          if (!forecast?.subjects.length) return null;
          const c: Partial<Record<MockCore, number>> = {};
          for (const sub of forecast.subjects) {
            if (sub.percentile == null) continue;
            if (sub.area === '국어' && c.korean == null) c.korean = sub.percentile;
            if (sub.area === '수학' && c.math == null) c.math = sub.percentile;
          }
          return Object.keys(c).length ? c : null;
        })(),
        prev: hasSept ? septCores : (Object.keys(juneCores).length ? juneCores : null),
        status: 'estimate',
      });
    } else {
      const values = fromFlow(m.actual ?? m.predicted);
      // 직전 "값이 있는" 백분위 스텝 (미응시 달은 건너뛴다)
      const prev = [...steps].reverse().find(p => p.coreScale === 'percentile' && p.values)?.values ?? null;
      steps.push({
        month: m.month, kind: m.kind, coreScale: 'percentile',
        values, prev, status: m.actual ? 'actual' : 'estimate',
      });
    }
  }

  const CORES: { key: MockCore; label: string }[] = [
    { key: 'korean', label: '국어' }, { key: 'math', label: '수학' }, { key: 'english', label: '영어' },
  ];

  return (
    <div className={embedded ? 'mt-3' : 'mt-4'}>
      <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
        <p className={cn('text-xs font-semibold', embedded ? 'text-violet-700' : 'text-indigo-700')}>
                    주요 모의고사 흐름{embedded ? '' : ' (3학년)'}
                  </p>
        <span className="text-[10px] text-muted-foreground">
          3·5·6월은 국어·수학=백분위(높을수록 좋음) · 9월·수능은 전 과목 등급(낮을수록 좋음)
        </span>
      </div>
      {/*
        ## 처음 보이는 자리는 **오른쪽 끝**이다 (2026-09-05 사용자 지시)
        왼쪽부터 보이면 3월 학평이 먼저 오는데, 이 스텝퍼를 여는 이유는
        "지금 어디까지 왔고 수능은 어떻게 되는가"라 **9월·수능이 먼저** 보여야 한다.
        가로로 밀어야 최근 칸이 나오면 그 칸이 있는 줄도 모른다.
      */}
      <div ref={scrollRef} className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {steps.map((st, i) => {
          const isPyeonggawon = isPyeonggawonExam(3, st.month);
          return (
            <React.Fragment key={st.month}>
              {i > 0 && <span className="self-center text-slate-300 text-xs shrink-0">→</span>}
              <div className={cn(
                'min-w-[132px] rounded-lg border p-2 text-xs bg-white/70 shrink-0',
                st.status === 'reference' ? 'border-amber-300'
                  : isPyeonggawon ? 'border-indigo-300' : 'border-slate-200',
                st.status === 'estimate' && 'border-dashed',
              )}>
                <div className="flex flex-wrap items-center gap-1 mb-1">
                  <span className="font-bold text-slate-700">{st.month}월</span>
                  <span className={cn(
                    'px-1 py-0.5 rounded text-[9px] font-semibold',
                    st.kind === '수능' ? 'bg-violet-100 text-violet-700'
                      : isPyeonggawon ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-500',
                  )}>
                    {st.kind}
                  </span>
                  {st.status === 'reference' && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800">EBS 참고</span>
                  )}
                  {st.status === 'estimate' && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">예측</span>
                  )}
                </div>
                {st.values ? (
                  <div className="space-y-0.5">
                    {CORES.map(({ key, label }) => {
                      const v = st.values?.[key];
                      const p = st.prev?.[key];
                      // 영어는 어느 회차든 등급이다
                      const isGrade = key === 'english' || st.coreScale === 'grade';
                      const delta = v != null && p != null ? v - p : null;
                      const improved = delta != null && (isGrade ? delta < 0 : delta > 0);
                      return (
                        <div key={key} className="flex items-baseline justify-between gap-2">
                          <span className="text-muted-foreground">{label}</span>
                          <span>
                            <span className="font-semibold text-slate-700">
                              {v != null ? v.toFixed(1) : '-'}
                            </span>
                            {v != null && isGrade && (
                              <span className="text-[9px] text-muted-foreground ml-0.5">등급</span>
                            )}
                            {/* 등급 칸에는 백분위를 함께 — 등급 한 칸이 백분위 10~20 폭을 덮는다 */}
                            {v != null && isGrade && st.pcts?.[key] != null && (
                              <span className="text-[9px] text-violet-600 ml-1"
                                title="원점수를 등급컷의 백분위 앵커에 보간한 값">
                                {st.pcts[key]!.toFixed(1)}%ile
                              </span>
                            )}
                            {delta != null && Math.abs(delta) >= 0.05 && (
                              <span className={cn(
                                'ml-1 text-[9px] font-semibold',
                                improved ? 'text-emerald-600' : 'text-rose-600',
                              )}>
                                {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-300 text-center py-2">
                    {st.month === 9 ? '기록 없음' : st.month === 11 ? '추정 불가' : '미응시'}
                  </p>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
        * 9월 칸은 {septOfficial
          ? <span className="font-medium">공식 성적</span>
          : <>마킹을 EBS 예상 등급컷에 대조한 <span className="font-medium">참고 등급(실측)</span></>}입니다.
        수능 칸은 <span className="font-medium">9월 {SUNEUNG_W_SEPT.toFixed(1)} + 6월 {SUNEUNG_W_JUNE.toFixed(1)}</span> 가중 평균이며,
        졸업생 수능 기록이 없어 <span className="font-medium">검증된 적 없는 규칙</span>입니다. 6월 미응시자는 3·5월 기반 전이 모델 예측입니다.
        Δ는 같은 척도끼리만 비교합니다(9월은 6월 등급 대비, 수능은 9월 대비).
      </p>
    </div>
  );
};

export const GradePredictionAnalysis: React.FC<Props> = ({ grade, data: analysisData }) => {
  /* 스냅샷 선택 — 목록(2KB)만 먼저 받고, 본체(3~5MB)는 고른 것 하나만 받는다.
     매니페스트가 오기 전에는 `path` 가 undefined 라 본체 요청 자체가 나가지 않는다. */
  const { data: manifest } = usePredictionSnapshots();
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const snapshots = manifest?.snapshots ?? [];
  const activeSnapshot =
    snapshots.find(s => s.id === snapshotId) ??
    snapshots.find(s => s.id === manifest?.current) ??
    snapshots[0];
  const { data: predictionData, isLoading, error: loadError, refetch } =
    useGradePrediction(activeSnapshot?.path);
  const isArchived = !!activeSnapshot && !!manifest && activeSnapshot.id !== manifest.current;
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [expandedMockExams, setExpandedMockExams] = useState<Set<string>>(new Set());
  /* 실측 내신에서 펼친 학기 — 교과군 평균만으로는 "어느 과목이 끌어내렸나"를 알 수 없다 */
  const [expandedNaesinSems, setExpandedNaesinSems] = useState<Set<string>>(new Set());
  /* 예측 내신 표도 실측과 같은 서랍이다 — 학기를 누르면 그 학기에 들을 과목이 펼쳐진다 */
  const [expandedPredSems, setExpandedPredSems] = useState<Set<string>>(new Set());
  /*
    주요 모의고사 흐름은 가로 스크롤인데 **오른쪽 끝(최근 회차·수능)에서 시작**해야 한다.
    `scrollLeft` 는 요소가 실제로 배치된 뒤에야 의미가 있으므로 레이아웃 후에 준다.
  */
  const flowScrollRef = useRef<HTMLDivElement | null>(null);

  /* 예측 근거 상자는 서랍이다 — 평소엔 한 줄이고 누르면 각 값의 뜻이 펼쳐진다 */
  const [rationaleOpen, setRationaleOpen] = useState(false);
  /* 추이 차트 척도 — 등급은 칸이 9개뿐이라 같은 등급 안의 움직임이 사라진다(2026-09-05 사용자 지시) */
  const [trendScale, setTrendScale] = useState<'grade' | 'percentile'>('grade');
  /*
    모달 전체를 **내신 / 모의고사·수능** 으로 가른다(2026-09-05 사용자 지시).
    둘은 축의 뜻이 다르고(교내 상대평가 vs 전국 기준) 산출 경로도 다르다 —
    한 화면에 섞어 두면 어느 숫자가 무엇의 것인지 매번 다시 확인해야 한다.
  */
  const [modalDomain, setModalDomain] = useState<'naesin' | 'mock'>('naesin');
  // 국어/수학 모의고사 예측 표시 방식: 'grade'(현재, 1~9등급) vs 'percentile'(새 방식, 백분위)
  /* 모의 예상의 척도는 별도 상태를 두지 않는다 — 헤더 토글 하나가 모달 전체를 지배한다 */
  /*
    ## 정렬은 **표 머리글 클릭**으로 한다 (2026-09-05 사용자 지시)

    종전엔 표 위에 별도 정렬 칩 줄이 있었는데, 정렬 대상은 결국 표의 열이라
    **칩과 열을 눈으로 맞춰야** 했고 모의 3과목·위치 열은 아예 고를 수 없었다.

    `kind` 를 함께 담는 이유 — 예측 표와 실측 표는 **같은 열 이름에 다른 값**을 담는다.
    어느 표의 머리글을 눌렀는지 기억하지 않으면, 실측 표에서 '수학'을 눌렀는데 예측값으로
    정렬되는 일이 생긴다(종전 '모의고사' 정렬이 정확히 그랬다 — 표에는 실측을 그리면서
    `mock_prediction` 으로 정렬해, 예측이 없는 3학년 206명이 전부 동점이라 **정렬이 아무
    일도 하지 않았다**).
  */
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc'; kind: 'prediction' | 'actual' }>(
    { key: 'overall', dir: 'asc', kind: 'prediction' });
  const [searchName, setSearchName] = useState('');
  const [filterClass, setFilterClass] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleSubjects, setVisibleSubjects] = useState<Set<string>>(
    /* 모의고사 과목별 선까지 기본으로 켠다 — 종전엔 꺼져 있어 '모의고사' 한 선만 보였다 */
    () => new Set([...FEATURE_KEYS, 'mock', ...MOCK_SUBJECT_KEYS.map(k => `mock_${k}`)])
  );

  /*
    ## 과목별 백분위 — 코호트 전체를 한 번만 훑는다 (2026-09-05 사용자 요청)

    스냅샷에는 **교과군 단위** 백분위만 있어서, 펼친 과목 목록은 등급밖에 말하지 못했다.
    5등급제 3등급이 상위 32~68% 를 뭉개므로 "같은 3등급인데 어느 쪽이 나은가"에 답이 없다.
    규칙은 파이프라인(`annotate_naesin_percentile`)과 같고, 계산은 학생 단위가 아니라
    **코호트 단위**라 학생이 바뀔 때만 다시 돈다.
  */
  const subjectPercentiles = useMemo(
    () => (selectedStudent ? buildSubjectPercentiles(analysisData, selectedStudent) : {}),
    [analysisData, selectedStudent],
  );


  // 9월 모평 회차의 학년도 = 3학년 성적이 있는 가장 최근 학년도(= 지금 이 코호트의 학년도).
  // 연도를 상수로 박으면 내년에 조용히 지난 회차를 그린다.
  const septYear = useMemo(() => {
    let y: number | undefined;
    analysisData.forEach(s => {
      (Array.isArray(s.mock_result) ? s.mock_result : []).forEach(e => {
        if (e.exam_grade === 3) y = Math.max(y ?? 0, e.academic_year);
      });
    });
    return y;
  }, [analysisData]);

  /*
    9월 모평은 공식 성적 발표 전이라 백분위·등급이 `mock_result` 에 없다. 대신 마킹을 EBS 예상
    등급컷에 대조해 유도한 **참고 등급**이 있고, 그것이 지금 시점의 "9월 성적"이다.
    계산은 `computeReferenceGradesForCohort` 단일 출처를 쓴다 — 여기서 따로 채점하면 같은 학생의
    9월 등급이 이 차트와 6·9월 모평 비교 화면에서 다르게 나온다.
    마킹 payload 가 커서 **상세 모달을 실제로 연 3학년에서만** 받는다.
  */
  /* 3학년이면 **모달을 열기 전에도** 받는다 — 학생 표의 모의고사 칸이 9월 실측이라,
     선택한 학생만 채우면 표가 대부분 빈 채로 보인다(예측 보유 11명 문제와 같은 뿌리).
     같은 쿼리 키를 6·9월 모평 탭과 공유하므로 그 탭을 먼저 본 뒤라면 추가 요청이 없다. */
  const { referenceGrades: septReference, isLoading: septLoading } = useCohortReferenceGrades(
    grade, septYear, 9, 3, grade === 3
  );

  /*
    ## 9월 = **공식 성적 우선, 없는 과목만 참고 등급** (2026-09-30)
    참고 등급 서비스는 공식 등급이 있는 과목을 계산도 반환도 하지 않는다. 그래서 `septReference`
    만 읽으면 공식 성적이 적재되는 순간 9월 칸·학생 표 모의 칸이 비고 수능 예상이 6월만으로
    계산된다(오류 없이). 아래 소비처는 전부 이 Map 을 읽는다 — 원본 성적표를 직접 읽는
    `buildMockExamTable` 만 예외로 `septReference` 를 그대로 받는다(거기에 공식을 또 얹으면 두 번 그린다).
  */
  const septGrades = useMemo(() => {
    const byStudent = new Map<string, Map<string, ReferenceGrade>>();
    const officialIds = new Set<string>();
    for (const d of analysisData) {
      const official = septYear == null ? undefined
        : (Array.isArray(d.mock_result) ? d.mock_result : []).find(
            e => e.exam_grade === 3 && e.exam_month === 9 && e.academic_year === septYear);
      const { grades, officialCount } = withOfficialGrades(septReference.get(d.id), official?.subjects);
      if (grades.size) byStudent.set(d.id, grades);
      if (officialCount) officialIds.add(d.id);
    }
    return { byStudent, officialIds };
  }, [analysisData, septReference, septYear]);

  /*
    ## 수능 예상 모드 (2026-09-05 사용자 결정 — 두 가지를 모두 제공)
    `pyeonggawon` = 6·9월만(모집단이 수능과 가장 닮았다) · `all-rounds` = 3·5·7월 학평까지.
    9월을 대리 과제로 잰 실측에서는 회차를 더 섞을수록 좋았다(6월만 0.773 -> 3·5·6·7월 0.624).
    다만 **수능이 아니라 9월로 잰 결과의 유추 이전**이라 어느 쪽을 볼지는 사용자가 고른다.
  */
  const [suneungMode, setSuneungMode] = useState<SuneungMode>('pyeonggawon');

  useEffect(() => {
    const el = flowScrollRef.current;
    if (!el) return;
    // 카드가 그려지기 전에 주면 scrollWidth 가 아직 작아 왼쪽에 머문다 — 한 프레임 미룬다
    const id = requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
    return () => cancelAnimationFrame(id);
  }, [selectedStudent, suneungMode, modalDomain]);
  /*
    전 회차 모드는 **코호트 전체**가 있어야 계산된다 — 학평과 평가원은 응시 집단이 달라
    회차 안에서 표준화해야 섞을 수 있기 때문이다. 모드를 켤 때만 만든다(전 학생 순회라 비싸다).
  */
  const suneungCohort = useMemo(() => {
    if (suneungMode !== 'all-rounds' || !analysisData.length) return null;
    return buildSuneungCohortContext(analysisData.map(d => ({
      studentId: d.id,
      rounds: (Array.isArray(d.mock_result) ? d.mock_result : [])
        .filter(e => e.exam_grade === 3 && (septYear == null || e.academic_year === septYear))
        .map(e => ({ month: e.exam_month, subjects: e.subjects ?? {} })),
      september: septGrades.byStudent.get(d.id) ?? null,
    })));
  }, [suneungMode, analysisData, septGrades, septYear]);

  const analysis = useMemo(() => {
    if (!predictionData) return null;

    let students = predictionData.students;
    if (grade) {
      students = students.filter(s => s.grade === grade);
    }

    // 사용 가능한 반 목록
    const availableClasses = [...new Set(students.map(s => s.class_num).filter((c): c is number => c != null))].sort();

    // 재료 판정·집계는 analysisUtils 단일 출처 (편향된 부분집합을 그리던 버그가 여기 있었다)
    const cohortChart = buildMockCohortChart(students);
    const { predictionCount } = cohortChart;
    const isPredictionView = cohortChart.basis === 'prediction';

    const subjectAvgChart = MOCK_CHART_KEYS.map((k, i) => ({
      subject: SUBJECT_GROUP_LABELS[k],
      key: k,
      avgGrade: cohortChart.averages[k]?.avg ?? 0,
      count: cohortChart.averages[k]?.count ?? 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    /*
      학생 테이블. **예측이 없는 학생도 담는다** — 3학년은 3-1 내신이 산출되는 순간
      예측할 학기가 없어지는데(정상 상태), 걸러 버리면 학년 전체가 목록에서 사라져
      모의고사 흐름·9월 참고 등급·수능 추정 화면까지 열 수 없게 된다.
      그 경우 '예측' 자리에는 **마지막 실측 학기**를 넣고 행에 배지로 구분한다.
    */
    const tableData = students
      .map(s => {
        const pred = s.predictions[0];
        const currentSemesters = Object.keys(s.current_grades).sort();
        const lastSem = currentSemesters[currentSemesters.length - 1];
        const currentGrades = lastSem ? s.current_grades[lastSem] : {};
        const hasPrediction = pred != null;
        const targetSem = pred?.semester ?? lastSem ?? '';

        // 예측이 없으면 '이전 학기' 기준이 없으므로 변화량도 만들지 않는다
        const prevGrades = hasPrediction
          ? currentGrades
          : (currentSemesters.length > 1 ? s.current_grades[currentSemesters[currentSemesters.length - 2]] : {});

        /*
          ## ⚠️ 변화량은 **같은 정의끼리만** 뺀다 (2026-09-06 적대적 검증으로 발견)

          종전에는 `예측 정수등급 − 직전 성적표 평균등급` 이었는데, 표가 보여 주는 예측값은
          `grade_exact`(등급 구간 안 위치)라 **화면의 두 숫자를 빼도 표시된 변화량과 달랐다**.
          라이브 실측: 직전 1.42 · 표시 예측 1.99 인데 변화량이 **−0.42(향상)** 로 찍혔다 —
          실제로는 +0.57(하락)이라 **부호가 반대**다. 상담에서 향상/하락을 거꾸로 읽는다.

          그리고 두 값은 애초에 같은 자가 아니다:
            · 성적표 평균등급 = 과목 등급들의 이수단위 가중평균(과목 간 편차가 소수부)
            · `grade_exact`   = 백분위를 등급컷으로 되돌린 **구간 안 위치**
          5등급제에서 `5.87` 같은 값이 나오는 것이 그 증거다(평균으로는 불가능한 값).

          그래서 변화는 **백분위(전교 능력 위치)** 로 잰다 — 예측 `pct` 와 실측 `pct_adj` 는
          정의·단위가 같고, 모델이 예측하는 것이 정확히 그 계열의 다음 값이다.
          한쪽이라도 없으면 **변화량을 만들지 않는다**(정의가 다른 뺄셈보다 빈칸이 낫다).
        */
        const pctSemsForChange = Object.keys(s.current_percentile ?? {}).sort();
        const lastPctCell = pctSemsForChange.length
          ? s.current_percentile?.[pctSemsForChange[pctSemsForChange.length - 1]]
          : null;
        const predPctCells = (s.percentile_predictions ?? [])
          .find(x => x.semester === targetSem)?.percentiles ?? null;
        const changes: Record<string, number | null> = {};
        FEATURE_KEYS.forEach(k => {
          const cur = lastPctCell?.[k];
          const curPct = cur ? (cur.pct_adj ?? cur.pct) : null;
          const nextPct = hasPrediction ? (pred.grades[k]?.pct ?? predPctCells?.[k]?.pct ?? null) : null;
          changes[k] = (curPct != null && nextPct != null)
            ? parseFloat((nextPct - curPct).toFixed(1))
            : null;
        });

        // 현재 모의고사 등급 (가장 최근 학기 기준)
        let currentMock: number | null = null;
        for (let i = currentSemesters.length - 1; i >= 0; i--) {
          const mock = s.current_grades[currentSemesters[i]]?.mock;
          if (mock != null) {
            currentMock = mock;
            break;
          }
        }

        /*
          한 행에 **예측과 실측을 둘 다** 담는다. 화면이 두 표(예측 결과 / 실측 결과)를
          같은 틀로 그리기 때문이다 — 표를 따로 만들면 정렬·페이징·선택이 두 벌이 된다.
        */
        const actualNaesin = Object.fromEntries(
          FEATURE_KEYS.map(k => [k, currentGrades[k] ?? null])
        ) as Record<string, number | null>;
        /*
          ## 예측 내신은 **소수점 등급**으로 낸다 (2026-09-05 사용자 요청)
          계산의 정본이 백분위인데 표가 정수 등급만 보여 주면 그 해상도를 마지막에 버린다 —
          5등급제 3등급 하나에 상위 34% 와 65% 가 함께 들어간다. 파이프라인이 담아 준
          `grade_exact` 를 쓰고, 옛 스냅샷은 `pct` 에서 화면이 직접 환산한다(같은 등급컷).
          실측 열은 그대로 둔다 — 그쪽 소수점은 "과목 등급들의 평균"이라 뜻이 다르다.
        */
        const predNaesin = Object.fromEntries(
          FEATURE_KEYS.map(k => {
            const cell = hasPrediction ? pred.grades[k] : null;
            if (!cell) return [k, null];
            const exact = cell.grade_exact
              ?? (cell.pct == null ? null
                  : gradeFromTopPctExact(cell.pct, s.grade_system === 5 ? 5 : 9));
            return [k, exact ?? cell.grade ?? null];
          })
        ) as Record<string, number | null>;

        // 모의고사 예측(국·수·영 + 전체)
        const mp = pred?.mock_prediction;
        const predMock: Record<string, number | null> = {
          overall: mp?.grade ?? null,
          ...Object.fromEntries(MOCK_SUBJECT_KEYS.map(k => [k, mp?.subjects?.[k]?.grade ?? null])),
        };

        /* 모의고사 실측. **3학년은 9월(참고 등급)이 가장 최근**이고 그 값은 스냅샷이 아니라
           마킹에서 계산된다 — `current_grades` 에는 3·5·6월 평균만 들어 있어 9월이 없다. */
        const septCore = coreGradesFromReference(septGrades.byStudent.get(s.id));
        const latest = latestActualMockOf(s);
        const actualMock: Record<string, number | null> = Object.fromEntries(
          MOCK_SUBJECT_KEYS.map(k => [k, septCore[k] ?? latest.subjects[k] ?? null])
        ) as Record<string, number | null>;
        const actualMockValues = MOCK_SUBJECT_KEYS.map(k => actualMock[k]).filter((v): v is number => v != null);
        actualMock.overall = actualMockValues.length
          ? parseFloat((actualMockValues.reduce((a, b) => a + b, 0) / actualMockValues.length).toFixed(2))
          : latest.overall;

        /*
          ## 위치(백분위) — 표에 한 열로 압축한다
          교과군별 백분위를 다 넣으면 표가 13열에서 19열이 되어 어느 것도 안 읽힌다.
          가장 많은 것을 말하는 **전체 위치 하나**만 낸다:
            실측 = 그 과목 안 상위 % (+ 수강 집단 보정 후 전교 기준)
            예측 = 능력 위치 백분위 (+ 80% 구간)
        */
        const pctSemKeys = Object.keys(s.current_percentile ?? {}).sort();
        const pctCell = pctSemKeys.length
          ? s.current_percentile?.[pctSemKeys[pctSemKeys.length - 1]]?.overall ?? null
          : null;
        const predPctCell = (s.percentile_predictions ?? [])
          .find(x => x.semester === targetSem)?.percentiles?.overall ?? null;
        /* 미래 수강 과목 기반 예상(있으면) — 같은 학기의 전체평균 */
        const subjectAware = (s.subject_aware_predictions ?? [])
          .find(x => x.semester === targetSem)?.grades?.overall ?? null;

        return {
          ...s,
          actualPct: pctCell,
          predPct: predPctCell,
          subjectAware,
          targetSem,
          hasPrediction,
          lastSem,
          currentGrades,
          predNaesin,
          actualNaesin,
          predMock,
          actualMock,
          /** 모의 실측이 9월 참고 등급에서 왔는가(추정 표시용) — 공식 성적이 있으면 추정이 아니다 */
          mockIsReference: Object.keys(septCore).length > 0 && !septGrades.officialIds.has(s.id),
          // 예측이 없으면 마지막 실측을 그 자리에 넣는다(행 배지가 실측임을 밝힌다)
          predictedGrades: Object.fromEntries(
            FEATURE_KEYS.map(k => [k, (hasPrediction ? pred.grades[k]?.grade : currentGrades[k]) ?? null])
          ),
          mockPrediction: pred?.mock_prediction ?? null,
          currentMock,
          changes,
        };
      })
      .sort((a, b) => {
        /* 값이 없는 행은 방향과 무관하게 **항상 아래**로 — 오름차순에서 위로 올라오면
           "성적이 없는 학생이 1등"이 된다. */
        const av = sortValueOf(a, sort);
        const bv = sortValueOf(b, sort);
        if (av == null && bv == null) return a.name.localeCompare(b.name);
        if (av == null) return 1;
        if (bv == null) return -1;
        return sort.dir === 'asc' ? av - bv : bv - av;
      });

    // 예측 등급 분포 — 모의고사 전체 예측 기준. 모의고사는 학년과 무관하게 항상 9등급제이므로
    // 1~2학년 5등급제/3학년 9등급제 혼재와 상관없이 1~9로 고정한다.
    // maxGrade(내신 스케일)는 아래 학생별 학기별 추이 차트(내신 라인)의 Y축에 그대로 사용된다.
    const maxGrade = students[0]?.grade_system === 5 ? 5 : 9;
    const distributionChart = Object.entries(cohortChart.distribution).map(([g, count]) => ({
      // 정수부로 담은 **구간**이라 '1등급'이 아니라 '1등급대'다 = [N.00, N+1.00)
      grade: `${g}등급대`,
      gradeNum: Number(g),
      count,
    }));

    /* 이 학년을 '예측'이라고 부를 수 있는가 — **과반 기준**이다.
       `some()` 으로 판정하면 3학년처럼 11/217 만 예측을 가진 경우에도 '예측'이 되어,
       표 제목과 차트가 실제 내용(대부분 실측)과 어긋난다. */
    const hasAnyPrediction = isPredictionView;

    /*
      ## 내신 해상도 재료 (2026-09-05)
      이 화면은 지금까지 **등급만** 보여 줬는데, 등급은 구간 안의 위치를 버린다
      (5등급제 3등급 = 상위 32~68%). 그 사실을 글이 아니라 **그림으로** 말하려면
      (등급, 백분위) 쌍이 필요하다. 그리고 수강 집단 보정이 학생을 얼마나 움직이는지도
      원본↔보정 차이로 보여 준다 — 둘 다 이번 산출물에 새로 들어온 값이다.
    */
    const naesinPoints: { grade: number; pct: number; pctAdj: number | null; shift: number | null;
                          id: string; name: string }[] = [];
    /*
      ## 내신 × 모의 산점의 재료 (2026-09-05, 사용자 지적으로 전면 수정)

      모의 백분위는 스냅샷이 아니라 **원본 성적표**(`mock_result`)에서 온다 — 스냅샷의
      `current_grades` 는 등급이라 백분위가 없다. 다만 종전 구현은 학생마다 "자기 최근
      회차"를 썼고 `percentile === 0` 을 유효값으로 받아, **내신 상위 9% 학생이 모의
      최하위(0)로 찍히는** 점이 실제로 나왔다. 회차 고정·결측 처리·축 정의를 모두
      `buildCohortMockPercentile` 이 갖는다(그쪽 주석에 근거를 적었다).
    */
    const mockAxis = buildCohortMockPercentile(analysisData ?? []);
    const mockPctById = mockAxis.byId;

    const scatterRows: { name: string; mockPct: number; naesinTopPct: number }[] = [];
    for (const st of tableData) {
      const semKeys = Object.keys(st.current_percentile ?? {}).sort();
      const lastKey = semKeys[semKeys.length - 1];
      const cell = lastKey ? st.current_percentile?.[lastKey]?.overall : null;
      const g = lastKey ? st.currentGrades.overall ?? null : null;
      if (!cell || g == null) continue;
      naesinPoints.push({
        grade: g,
        pct: cell.pct,
        pctAdj: cell.pct_adj ?? null,
        shift: cell.pct_adj == null ? null : Math.round((cell.pct_adj - cell.pct) * 10) / 10,
        id: st.id,
        name: st.name,
      });
      /* 내신 축은 **수강 집단 보정본**을 쓴다 — 과목 구성이 달라도 한 자로 비교된다 */
      const mp = mockPctById.get(st.id);
      const np = cell.pct_adj ?? cell.pct;
      if (mp != null && np != null) scatterRows.push({ name: st.name, mockPct: mp, naesinTopPct: np });
    }
    const competitiveness = {
      ...buildCompetitivenessScatter(scatterRows),
      round: mockAxis.round,     // 어느 회차로 그렸는지 화면이 밝힌다
    };

    return {
      students: tableData,
      naesinPoints,
      competitiveness,
      hasAnyPrediction,
      /** 차트가 무엇으로 그려졌는가 — 제목이 거짓말하지 않도록 화면에 그대로 쓴다 */
      chartBasis: (isPredictionView ? 'prediction' : 'actual') as 'prediction' | 'actual',
      /** 차트에 실제로 들어간 학생 수(전체 인원과 다를 수 있다) */
      chartCount: cohortChart.count,
      predictionCount,
      subjectAvgChart,
      distributionChart,
      maxGrade,
      modelInfo: predictionData.model_info,
      /* 어느 공간에서 예측했는가 — 요약 타일이 그 모델의 지표를 고르는 데 쓴다 */
      predictionSpace: predictionData.prediction_space ?? null,
      mockCorrelation: predictionData.mock_correlation,
      generatedAt: predictionData.generated_at,
      availableClasses,
    };
  }, [predictionData, grade, sort, septGrades, analysisData]);

  // 필터링된 학생 목록
  /* 같은 열을 다시 누르면 방향이 뒤집히고, 다른 열이면 오름차순(=잘한 순)에서 시작한다 */
  const handleSort = React.useCallback((key: string, kind: 'prediction' | 'actual') => {
    setSort(prev => (prev.key === key && prev.kind === kind)
      ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc', kind });
  }, []);

  const filteredStudents = useMemo(() => {
    if (!analysis) return [];
    let list = analysis.students;

    if (searchName.trim()) {
      const q = searchName.trim().toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }

    if (filterClass !== null) {
      list = list.filter(s => s.class_num === filterClass);
    }

    return list;
  }, [analysis, searchName, filterClass]);

  // 페이지네이션
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 필터 변경 시 첫 페이지로
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchName, filterClass, sort]);

  // 선택된 학생의 상세 추이
  const studentDetail = useMemo(() => {
    if (!selectedStudent || !analysis) return null;
    const student = analysis.students.find(s => s.id === selectedStudent);
    if (!student) return null;

    const original = predictionData?.students.find(s => s.id === selectedStudent);
    if (!original) return null;

    // 학기별 추이 데이터 (현재 + 예측)
    const trendData: Record<string, any>[] = [];

    Object.entries(original.current_grades)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([sem, grades]) => {
        const entry: Record<string, any> = { semester: sem, type: '현재' };
        /*
          ## 등급과 백분위를 **같은 행에** 싣는다 (2026-09-05)
          차트가 척도를 토글할 때 데이터를 다시 만들지 않고 `dataKey` 만 바꾸면 되므로
          선이 다시 그려지는 깜빡임이 없다. 내신 백분위는 **수강 집단 보정본**(전교 능력 위치)을
          쓴다 — 그게 학기·과목 구성을 가로질러 비교되는 유일한 값이다.
          모의고사 백분위는 **국어·수학만** 있다(영어는 절대평가) — 없는 값은 null 이라 선이 끊긴다.
        */
        const pcell = original.current_percentile?.[sem];
        FEATURE_KEYS.forEach(k => {
          entry[k] = grades[k] ?? null;
          const pv = pcell?.[k];
          entry[`pct_${k}`] = pv ? (pv.pct_adj ?? pv.pct) : null;
        });
        if (grades.mock != null) entry.mock = grades.mock;
        MOCK_SUBJECT_KEYS.forEach(k => {
          entry[`mock_${k}`] = grades.mock_subjects?.[k] ?? null;
          entry[`mockpct_${k}`] = grades.mock_percentile?.[k] ?? null;
        });
        trendData.push(entry);
      });

    // 예측 성적
    original.predictions.forEach(pred => {
      const entry: Record<string, any> = { semester: pred.semester, type: '예측' };
      FEATURE_KEYS.forEach(k => {
        entry[k] = pred.grades[k]?.grade ?? null;
      });
      /*
        전체평균의 80% 예측구간을 차트가 **띠로** 그릴 수 있게 싣는다. recharts 의 Area 는
        위/아래 두 값을 배열 하나로 받으므로 `[lo, hi]` 형태여야 한다. 점만 찍으면
        "1.42등급"이 확정처럼 읽히는데 실제 오차는 0.6등급대다 — 띠가 그걸 말한다.
      */
      const band = pred.grades.overall;
      entry.overallBand = band?.lo != null && band?.hi != null ? [band.lo, band.hi] : null;
      const ppred = (original.percentile_predictions ?? [])
        .find(x => x.semester === pred.semester)?.percentiles ?? null;
      FEATURE_KEYS.forEach(k => {
        entry[`pct_${k}`] = ppred?.[k]?.pct ?? null;
      });
      const pband = ppred?.overall;
      entry.overallPctBand = pband?.lo != null && pband?.hi != null ? [pband.lo, pband.hi] : null;
      if (pred.mock_prediction) entry.mock = pred.mock_prediction.grade;
      MOCK_SUBJECT_KEYS.forEach(k => {
        entry[`mock_${k}`] = pred.mock_prediction?.subjects?.[k]?.grade ?? null;
        entry[`mockpct_${k}`] = pred.mock_percentile_prediction?.subjects?.[k] ?? null;
      });
      trendData.push(entry);
    });

    /*
      9월 모평 (3학년 전용). 이 칸은 **AI 예측이 아니라 실제 응시 결과**다 — 마킹을 EBS 예상
      등급컷에 대조해 산정한 참고 등급. 3-1 예측 바로 오른쪽에 놓아야 "예측한 대로 갔는가"를
      선 하나로 볼 수 있다. 내신 계열은 값이 없어 null 로 두고, 그래서 내신 라인은 3-1 에서 끝난다.
    */
    const septCores = coreGradesFromReference(septGrades.byStudent.get(selectedStudent));
    /* 9월은 등급뿐 아니라 백분위도 낸다 — 등급 한 칸이 백분위 10~20 폭을 덮어
       6월(백분위) 칸과 견줄 해상도가 사라진다. 영어는 절대평가라 자연히 빠진다. */
    const septPcts = corePercentilesFromReference(septGrades.byStudent.get(selectedStudent));
    const septPoint = mockTrendPointFromCores(septCores);
    const hasSeptReference = septPoint != null;
    /* 공식 성적이 적재된 학생은 9월 칸이 참고 등급이 아니라 공식 성적이다 — 표기가 달라야 한다 */
    const septOfficial = septGrades.officialIds.has(selectedStudent);
    if (septPoint) {
      /*
        ## 9월 칸에도 **백분위**를 싣는다 (2026-09-05 사용자 지시)
        백분위 척도로 토글하면 9월·수능 칸이 통째로 비어 있었다 — 앞선 3·5·6월은
        백분위인데 마지막 두 칸만 값이 없어 **선이 끊긴 채 끝났다**. 등급 한 칸이
        백분위 10~20 폭을 덮으므로, 상위권일수록 등급만으로는 움직임이 보이지 않는다.
        영어는 절대평가라 백분위가 없어 자연히 null 이다.
      */
      trendData.push({
        semester: SEPT_TREND_LABEL, type: septOfficial ? '9월 공식' : '9월 참고', ...septPoint,
        mockpct_korean: septPcts.korean ?? null,
        mockpct_math: septPcts.math ?? null,
        mockpct_english: null,
      });
    }

    /*
      수능(11월) 예상 — 3-2 에 남은 유일한 미래 회차다. 9월은 이미 실측(참고 등급)이므로
      "3-2 모의고사 예측" = 사실상 수능 예측이다. 근거는 평가원 두 회차(9월 0.6 / 6월 0.4)뿐이고
      **학습된 모델이 아니라 규칙**이다 — 졸업생에게 수능 기록이 0건이라 학습할 수가 없다.
    */
    const juneExam = (analysisData.find(d => d.id === selectedStudent)?.mock_result ?? []).find(
      e => e.exam_grade === 3 && e.exam_month === 6 && (septYear == null || e.academic_year === septYear)
    );
    const juneCores = coreGradesFromExam(juneExam?.subjects);
    /* 수능 예상은 **백분위 기준**이다(등급은 9칸뿐이라 같은 등급 안의 차이가 사라진다).
       탐구까지 담고, 절대평가(영어·한국사)만 등급으로 남는다 — `suneungForecast` 단일 출처. */
    const forecast = original.grade === 3
      ? buildSuneungForecast(septGrades.byStudent.get(selectedStudent), juneExam?.subjects,
          { mode: suneungMode, cohort: suneungCohort, studentId: selectedStudent })
      : null;
    if (forecast?.subjects.length) {
      // 추이 차트는 국·수·영 등급 라인이라 그 세 과목만 뽑아 얹는다
      const core: Partial<Record<MockCore, number>> = {};
      for (const sub of forecast.subjects) {
        if (sub.grade == null) continue;
        if (sub.area === '국어' && core.korean == null) core.korean = sub.grade;
        if (sub.area === '수학' && core.math == null) core.math = sub.grade;
        if (sub.area === '영어' && core.english == null) core.english = sub.grade;
      }
      /* 수능 예상은 **백분위가 본체**라(등급은 거기서 유도) 그대로 실으면 된다 */
      const corePct: Partial<Record<MockCore, number>> = {};
      for (const sub of forecast.subjects) {
        if (sub.percentile == null) continue;
        if (sub.area === '국어' && corePct.korean == null) corePct.korean = sub.percentile;
        if (sub.area === '수학' && corePct.math == null) corePct.math = sub.percentile;
      }
      const point = mockTrendPointFromCores(core);
      if (point) {
        trendData.push({
          semester: SUNEUNG_TREND_LABEL, type: '수능 예상', ...point,
          mockpct_korean: corePct.korean ?? null,
          mockpct_math: corePct.math ?? null,
          mockpct_english: null,
        });
      }
    }

    // 현재→예측 경계선 인덱스
    const currentSemesters = Object.keys(original.current_grades).sort();
    const lastCurrentSem = currentSemesters[currentSemesters.length - 1];

    return { student: original, trendData, lastCurrentSem, hasSeptReference, septOfficial,
             septCores, septPcts, juneCores, forecast };
  }, [selectedStudent, analysis, predictionData, septGrades, analysisData, septYear,
      suneungMode, suneungCohort]);

  {/* 스냅샷 선택 — 예측은 재생성마다 통째로 바뀌므로 "언제 한 예측인지"를 고를 수 있어야 한다.
      큰 파일은 고른 것 하나만 받으므로, 여기서 바꾸면 그때 네트워크가 발생한다. */}
  /* 선택기는 **early return 보다 먼저** 정의해 로딩·빈 화면에도 함께 그린다. 안 그러면
     1학년에서 7월 스냅샷을 고르는 순간(그때는 1학년이 아예 없었다) "데이터 없음"만 남아
     되돌아올 수단이 사라진다 — 화면에 갇힌다. */
  const snapshotPicker = snapshots.length > 1 ? (

    <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-muted-foreground mr-1">예측 시점:</span>
        {snapshots.map(s => {
      const isActive = s.id === activeSnapshot?.id;
      const date = s.generated_at ? s.generated_at.slice(0, 10) : '';
      return (
        <button
          key={s.id}
          onClick={() => {
        // 다른 스냅샷에는 그 학생이 없을 수 있다(1학년은 7월 자료에 아예 없다)
        setSelectedStudent(null);
        setSnapshotId(s.id);
          }}
          title={s.note}
          className={cn(
        'px-2.5 py-1 text-[11px] rounded-full border transition-all',
        isActive
          ? 'bg-indigo-600 text-white border-transparent'
          : 'bg-white/50 text-slate-500 border-slate-200 hover:border-indigo-300',
          )}
        >
          {s.label}
          {date && <span className={cn('ml-1', isActive ? 'text-indigo-100' : 'text-slate-400')}>{date}</span>}
        </button>
      );
        })}
        {isArchived && (
      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
        과거 예측 보는 중
      </span>
        )}
      </div>
      {activeSnapshot?.note && (
        <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
      {activeSnapshot.note}
      {isArchived && ' · 그 뒤에 산출된 실측(3-1 내신·9월 모의고사)과 나란히 보면 예측이 맞았는지 확인할 수 있습니다.'}
        </p>
      )}
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {snapshotPicker}
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!predictionData || !analysis) {
    /*
      ## 실패는 **셋을 갈라 말한다** (2026-09-06 적대적 검증)

      종전엔 권한·통신·파싱·미생성이 전부 "예측 모델이 아직 생성되지 않았습니다"로 보였다.
      셋은 사용자가 할 수 있는 일이 다르다 — 권한은 관리자에게, 통신은 재시도, 미생성은
      파이프라인 실행. 엉뚱한 안내는 없는 문제를 쫓게 만든다.
    */
    const kind = loadError instanceof PredictionLoadError ? loadError.kind : null;
    const view = kind === 'forbidden'
      ? {
          title: '예측 자료를 볼 권한이 없습니다',
          body: '이 자료는 교사·관리자만 열 수 있습니다. 로그인 세션이 끊겼을 수도 있으니 '
              + '다시 로그인해 보시고, 계속 같으면 관리자에게 권한을 확인해 주세요.',
          retry: true,
        }
      : kind === 'network'
      ? {
          title: '자료를 불러오지 못했습니다',
          body: '네트워크나 서버 응답 문제입니다. 잠시 후 다시 시도해 주세요.',
          retry: true,
        }
      : kind === 'parse'
      ? {
          title: '자료가 손상되었습니다',
          body: '파일은 받았지만 내용을 읽지 못했습니다. 파이프라인을 다시 실행해 산출물을 '
              + '새로 만들어야 합니다.',
          retry: true,
        }
      : {
          title: '예측 모델이 아직 생성되지 않았습니다',
          body: null,
          retry: false,
        };
    return (
      <div className="space-y-4">
        {snapshotPicker}
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">{view.title}</p>
          {view.body && (
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">{view.body}</p>
          )}
          {view.retry && (
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center justify-center min-h-[2.25rem] px-4 rounded-lg
                         bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              다시 시도
            </button>
          )}
          {!view.retry && (
            <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto text-left bg-slate-50 rounded-lg p-4">
              <p className="font-medium mb-2">실행 방법:</p>
              <p>1. <code className="bg-slate-200 px-1 rounded">cd ml</code></p>
              <p>2. <code className="bg-slate-200 px-1 rounded">pip install -r requirements.txt</code></p>
              <p>3. <code className="bg-slate-200 px-1 rounded">python train_grade_predictor.py</code></p>
              <p className="mt-2 text-muted-foreground">산출물은 ml/out/ 에 만들어져 비공개 버킷으로 올라갑니다.</p>
            </div>
          )}
          {/* 원인을 감추지 않는다 — 관리자가 로그 없이도 무슨 일인지 알 수 있어야 한다 */}
          {loadError instanceof PredictionLoadError && (
            <p className="text-[11px] text-muted-foreground/70">({kind}: {loadError.message})</p>
          )}
        </div>
      </div>
    );
  }

  if (analysis.students.length === 0) {
    return (
      <div className="space-y-4">
        {snapshotPicker}
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            {grade ? `${grade}학년의 예측 데이터가 없습니다.` : '예측 데이터가 없습니다.'}
          </p>
          {isArchived && (
            <p className="text-xs text-muted-foreground">
              이 시점의 예측에는 {grade ? `${grade}학년이 ` : ''}포함되지 않았습니다. 위에서 다른 시점을 고르세요.
            </p>
          )}
        </div>
      </div>
    );
  }

  const targetSemLabel = analysis.students[0]?.targetSem ?? '';
  // 3학년처럼 마지막 학기까지 산출이 끝나면 이 표는 예측이 아니라 실측을 보여준다
  const targetKindLabel = analysis.hasAnyPrediction ? '예측' : '실측';
  // 차트 재료가 예측인지 실측인지 — 제목과 분모로 밝힌다(편향된 부분집합을 사실로 읽지 않도록)
  const chartKindLabel = analysis.chartBasis === 'prediction' ? '예측' : '실측';

  /* 실측 표의 모의고사 칸이 무엇인지 — 3학년은 9월 참고 등급(추정)이고 공식 성적이 아니다 */
  const hasReferenceMock = analysis.students.some(x => x.mockIsReference);
  const tableViews: { kind: 'prediction' | 'actual'; title: string; note: string }[] = [
    ...(analysis.hasAnyPrediction
      ? [{
          kind: 'prediction' as const,
          title: `학생별 예측 결과 (${targetSemLabel})`,
          /*
            전체평균이 어떻게 나오는지는 **말해 줘야 한다** — 교과별은 모델이 내지만
            전체평균은 직전 학기 값을 그대로 쓴다(홀드아웃에서 그게 가장 정확했다).
            안 밝히면 "AI 가 예측했다는데 평균이 지난 학기와 똑같다"가 오류로 보인다.
          */
          note: '등급 칸은 **예측한 전교 능력 위치를 등급컷으로 되돌린 값**입니다 — 실측 표의 '
            + '평균등급(과목 등급의 가중평균)과는 다른 자라 두 표의 숫자를 직접 빼지 마십시오. '
            + '옆의 %p 는 같은 자로 잰 위치 변화(직전 실측 대비, 작아지면 향상)입니다. '
            + '교과별은 모델이 낸 값이고, 전체평균은 직전 학기 값을 그대로 씁니다(검증에서 가장 정확했던 방식).',
        }]
      : []),
    {
      kind: 'actual' as const,
      /*
        ## 제목의 학기는 **코호트 최댓값**이다 (2026-09-05 사용자 지적)
        `students[0]` 은 정렬 결과 맨 앞에 온 **한 명**일 뿐이다. 3학년 217명 중 11명은
        3-1 성적이 아직 없어 그 학생의 `lastSem` 은 `2-2` 인데, 정렬에 따라 그 사람이
        맨 앞에 오면 **표 제목이 통째로 (2-2)** 가 된다(오류가 아니라 조용히 틀린다).
      */
      title: `학생별 실측 결과 (${
        analysis.students.reduce<string>((m, x) => (x.lastSem && x.lastSem > m ? x.lastSem : m), '')
      })`,
      note: (hasReferenceMock
        ? '실제 산출·응시 결과입니다. 모의고사는 9월 마킹을 EBS 예상 등급컷에 대조한 추정 등급입니다.'
        : '실제 산출·응시 결과입니다.')
        + ' 등급 칸은 **성적표 평균등급**(과목 등급의 이수단위 가중평균)입니다.'
        + ' 위치 열은 그 과목 집단 안 상위%이고, 화살표 뒤는 수강 집단 차이를 뺀 전교 기준입니다.',
    },
  ];
  /*
    요약 타일은 **그 학년이 실제로 쓴 모델**의 지표를 보여야 한다. 척도마다 모델이 하나씩이라
    3학년(9등급제)에 5등급제 모델의 RMSE·α 를 띄우면 다른 모델 얘기를 하는 셈이다
    (2026-09-05 적대적 검증 지적). 과거 스냅샷에는 `scales` 가 없어 요약값으로 폴백한다.
  */
  const scaleStats = (() => {
    /*
      ## ⚠️ 지표는 **실제로 예측을 낸 모델**의 것이어야 한다 (2026-09-06 적대적 검증)

      내신 예측은 `prediction_space === 'pct_adj'` 부터 **척도 무관 단일 백분위 모델**이
      낸다. 그런데 이 타일은 여전히 등급 모델(`scales[5]`/`scales[9]`)의 RMSE·α 를 띄웠다 —
      0.108/0.120 을 백분위 예측의 정확도로 읽으면 **다른 모델 얘기를 하는 것**이다.
      등급 모델은 모의고사 상관용으로 계속 학습하므로 사라지지 않았고, 그래서 눈에 안 띄었다.

      옛 스냅샷에는 `percentile` 이 없으므로 그때는 종전대로 척도별 지표로 떨어진다.
    */
    const usesPct = analysis.predictionSpace === 'pct_adj';
    const pct = analysis.modelInfo.percentile ?? null;
    if (usesPct && pct) {
      return {
        scale: null as number | null,
        modelLabel: '백분위 단일 모델',
        trainingSamples: pct.training_samples,
        /* 정규화 RMSE 를 백분위 포인트로 되돌린다 — "0.11" 보다 "11%p" 가 읽힌다 */
        errorText: pct.val_rmse_pp != null ? `${pct.val_rmse_pp.toFixed(1)}%p` : pct.val_rmse.toFixed(3),
        errorNote: '전교 능력 위치 · 검증 RMSE',
        blendAlpha: pct.blend_alpha ?? null,
        interval: pct.interval ?? null,
      };
    }
    const system = analysis.students[0]?.grade_system;
    const per = system != null ? analysis.modelInfo.scales?.[String(system)] : undefined;
    return {
      scale: per ? system : null,
      modelLabel: per ? `${system}등급제 모델` : null,
      trainingSamples: per?.training_samples ?? analysis.modelInfo.training_samples,
      errorText: (per?.val_rmse ?? analysis.modelInfo.val_rmse).toFixed(3),
      errorNote: '낮을수록 좋음 · 정규화 RMSE',
      blendAlpha: per?.blend_alpha ?? analysis.modelInfo.blend_alpha ?? null,
      interval: per?.interval ?? null,
    };
  })();
  const chartBasisNote =
    analysis.chartBasis === 'prediction'
      ? `${targetSemLabel} 예측 · 국어·수학·영어 평균 등급 · ${analysis.chartCount}명`
      : `가장 최근 실제 응시 회차 · 국어·수학·영어 평균 등급 · ${analysis.chartCount}명`;

  return (
    <div className="space-y-4">
      {snapshotPicker}

      {/* 모델 정보 & 요약 */}
      {/*
        ## 첫 화면은 **상담 질문 순서**로 (2026-09-06 적대적 검증)

        종전엔 `학습 표본 · 검증 오차 · α` 가 맨 앞에 있었다. 그건 "이 모델을 믿어도 되나"에
        답하는 값이라 **한 번 확인하면 되는 것**인데, 교사가 이 화면을 열 때마다 먼저 읽어야
        했다. 상담에서 먼저 필요한 것은 "지금 어떤 상태인가 · 무엇을 예상하는가 · 무엇을
        확인해야 하는가" 셋이다.

        그래서 위에는 **그 셋**만 두고, 기술 지표는 아래 [검증 정보] 서랍으로 내렸다.
        기능을 줄인 것이 아니라 **기본 화면에서 답할 질문을 줄인** 것이다.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">분석 대상</p>
          <p className="text-2xl font-bold text-foreground">{analysis.students.length}명</p>
          <p className="text-xs text-muted-foreground">
            {grade ? `${grade}학년` : '전체'} · {analysis.generatedAt
              ? `${new Date(analysis.generatedAt).toLocaleDateString('ko-KR')} 기준` : ''}
          </p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">다음 예측</p>
          <p className="text-2xl font-bold text-indigo-600">{targetSemLabel}</p>
          <p className="text-xs text-muted-foreground">
            {analysis.hasAnyPrediction
              ? `${analysis.predictionCount}명 예측 · ${targetKindLabel}`
              : '예측할 학기 없음 · 실측을 봅니다'}
          </p>
        </div>
        {/*
          "자료 상태" — 무엇이 부족한지를 **먼저** 말한다. 종전엔 표를 다 훑어야 알 수 있었다.
        */}
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">자료 상태</p>
          {(() => {
            const noPred = analysis.students.length - analysis.predictionCount;
            const noPct = analysis.students.length - analysis.naesinPoints.length;
            const worst = Math.max(noPred, noPct);
            return (
              <>
                <p className={cn('text-2xl font-bold', worst === 0 ? 'text-emerald-600' : 'text-amber-600')}>
                  {worst === 0 ? '충분' : `${worst}명`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {worst === 0 ? '전원 예측·위치 산출'
                    : [noPred > 0 ? `예측 없음 ${noPred}` : null,
                       noPct > 0 ? `위치 없음 ${noPct}` : null].filter(Boolean).join(' · ')}
                </p>
              </>
            );
          })()}
        </div>
      </div>

      {/*
        ## 검증 정보 — 서랍 (2026-09-06)
        "이 모델을 믿어도 되나"는 한 번 확인하면 되는 질문이라 접어 둔다.
        `<details>` 를 쓰는 이유 — 키보드·스크린리더가 기본으로 동작하고
        `aria-expanded` 를 손으로 관리하지 않아도 된다(WAI-ARIA disclosure 패턴).
      */}
      <details className="bg-white/50 backdrop-blur-md border border-white/20 rounded-xl">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-700
                            marker:text-slate-400 hover:bg-white/40 rounded-xl">
          검증 정보
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            어떤 모델로 어떻게 검증했는가
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">학습 표본</p>
            <p className="text-lg font-bold text-indigo-600">{scaleStats.trainingSamples.toLocaleString()}건</p>
            <p className="text-xs text-muted-foreground">
              학기 전이{scaleStats.modelLabel ? ` · ${scaleStats.modelLabel}` : ''}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">검증 오차</p>
            <p className="text-lg font-bold text-foreground">{scaleStats.errorText}</p>
            <p className="text-xs text-muted-foreground">{scaleStats.errorNote}</p>
          </div>
          <div className="text-center">
            {scaleStats.blendAlpha != null && scaleStats.blendAlpha < 1 ? (
              <>
                <p className="text-xs text-muted-foreground">직전 성적 혼합</p>
                <p className="text-lg font-bold text-foreground">α={scaleStats.blendAlpha}</p>
                <p className="text-xs text-muted-foreground">
                  모델 {Math.round(scaleStats.blendAlpha * 100)}% + 직전 {Math.round((1 - scaleStats.blendAlpha) * 100)}%
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">직전 성적 혼합</p>
                <p className="text-lg font-bold text-foreground">없음</p>
                <p className="text-xs text-muted-foreground">모델 예측 그대로</p>
              </>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">예측구간</p>
            <p className="text-lg font-bold text-foreground">
              {scaleStats.interval ? `명목 ${Math.round(scaleStats.interval.level * 100)}%` : '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              {scaleStats.interval
                ? `${scaleStats.interval.cohort}학번 ${scaleStats.interval.samples.toLocaleString()}건으로 보정`
                : '이 스냅샷에는 없음'}
            </p>
          </div>
          <p className="col-span-2 md:col-span-4 text-xs text-muted-foreground leading-relaxed">
            검증 오차는 <span className="font-medium text-slate-600">그 코호트를 보지 않고 배운 모델</span>을
            처음 보는 학년에 적용해 잰 값입니다. 예측구간은 <span className="font-medium text-slate-600">명목</span>
            값이며 — 집단 평균 포함률을 맞춘 폭이지 개인이 그 안에 들 확률이 아닙니다. 홀드아웃 실측
            포함률은 74~79%였고 수학은 그보다 낮았습니다.
          </p>
        </div>
      </details>

      {/* 예측이 소수인 학년(3학년)에서는 재료가 실측으로 바뀐다. 제목과 분모가 그 사실을
          그대로 말해야 한다 — 무엇을 그렸는지 감추면 편향된 표본을 사실로 읽게 된다. */}
      {!analysis.hasAnyPrediction && (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed">
          이 학년은 <span className="font-medium text-slate-600">{targetSemLabel}까지 내신이 모두 산출</span>되어
          더 예측할 학기가 없습니다(예측이 남은 학생 {analysis.predictionCount}명은 아직 성적이 없는 경우입니다).
          아래 표와 차트는 예측이 아니라 <span className="font-medium text-slate-600">실측</span>이며,
          앞으로 남은 회차(수능)의 추정은 학생을 눌러 상세에서 볼 수 있습니다.
        </div>
      )}
      {/*
        ## 그래프는 **분석 탐색** 서랍으로 (2026-09-06 적대적 검증)

        네 그림은 "이 집단이 어떻게 생겼나 · 등급이라는 자가 무엇을 놓치나"에 답한다 —
        가치 있는 질문이지만 **상담에서 매번 먼저 볼 것은 아니다**. 종전엔 학생별 결과 표보다
        위에서 화면 절반을 차지해, 교사가 학생을 찾으려면 매번 지나쳐야 했다.

        접어 두되 **없애지는 않는다**(기능을 줄이는 것이 아니라 기본 화면에서 답할 질문을
        줄이는 것이다). `<details>` 라 키보드·스크린리더가 기본으로 동작한다.
      */}
      <details className="bg-white/50 backdrop-blur-md border border-white/20 rounded-xl">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-700
                            marker:text-slate-400 hover:bg-white/40 rounded-xl">
          집단 분석 그래프
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            등급 분포 · 수강 집단 보정 · 등급이 감추는 것 · 내신×모의
          </span>
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-4">
      {/*
          ## 그래프 4종의 순서 = 등급 분포 → 수강 집단 보정 → 등급이 감추는 것 → 내신×모의
          (2026-09-05 사용자 지시). 앞 둘은 **이 집단이 어떻게 생겼나**, 뒤 둘은 **등급이라는
          자가 무엇을 놓치나**를 말한다. 종전 첫 칸에 있던 `교과군별 평균등급` 막대는 뺐다 —
          다섯 개의 높이가 아래 표의 열 평균과 같은 말이라 새로 알려 주는 것이 없었다.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold">모의고사 {chartKindLabel} 등급 분포</h3>
            <p className="text-[11px] text-muted-foreground mb-3">{chartBasisNote}</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analysis.distributionChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}명`, '학생 수']}
                  labelFormatter={(l: string) => {
                    // 칸의 경계를 숫자로 밝힌다 — '1등급대'가 1.0 하나인지 1점대인지 묻지 않게
                    const n = parseInt(l, 10);
                    return n >= 9 ? `${l} (9.00)` : `${l} (${n}.00~${n}.99)`;
                  }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {analysis.distributionChart.map((d, i) => {
                    // 모의고사는 항상 9등급제이므로 컷 라인도 9등급제 기준(상위 3 / 중위 6)으로 고정
                    const g = d.gradeNum;
                    const color = g <= 3 ? '#10b981' : g <= 6 ? '#f59e0b' : '#f43f5e';
                    return <Cell key={i} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold">수강 집단 보정 — 과목이 다르면 같은 %가 다른 뜻</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                가로 = 보정 폭(전교 기준 − 그 과목 안 위치, %p) · 세로 = 학생 수.
                <span className="ml-1 font-medium text-slate-600">왼쪽으로 갈수록 강한 집단에서 배운 학생</span>
                (같은 성적이 전교 기준으로는 더 앞).
              </p>
              {(() => {
                const shifts = analysis.naesinPoints
                  .map(p => p.shift).filter((v): v is number => v != null);
                if (shifts.length < 10) {
                  return <p className="text-xs text-muted-foreground py-8 text-center">
                    이 스냅샷에는 보정값이 없습니다(옛 산출물).
                  </p>;
                }
                // 2%p 폭 구간으로 묶는다 — 실측 이동이 평균 1.3%p·최대 10%p 라 이 정도가 읽힌다
                const bins = new Map<number, number>();
                for (const v of shifts) {
                  const b = Math.round(v / 2) * 2;
                  bins.set(b, (bins.get(b) ?? 0) + 1);
                }
                const data = [...bins.entries()].sort((a, b) => a[0] - b[0])
                  .map(([bin, count]) => ({ bin, count, label: `${bin > 0 ? '+' : ''}${bin}` }));
                const moved = shifts.filter(v => Math.abs(v) >= 2).length;
                return (
                  <>
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`${v}명`, '학생 수']}
                          labelFormatter={(l: string) => `보정 ${l}%p`} />
                        <ReferenceLine x="0" stroke="#94a3b8" strokeDasharray="4 2" />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {data.map((d, i) => (
                            <Cell key={i} fill={d.bin < 0 ? '#0891b2' : d.bin > 0 ? '#ea580c' : '#94a3b8'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      2%p 이상 움직인 학생 <span className="font-medium text-slate-600">{moved}명</span>
                      {' '}/ {shifts.length}명 · 최대 {Math.max(...shifts.map(Math.abs)).toFixed(1)}%p
                    </p>
                  </>
                );
              })()}
            </div>

            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold">등급이 감추는 것 — 같은 등급, 다른 위치</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                가로 = 내신 평균 등급 · 세로 = 교내 상위 % · 점 하나가 학생 {analysis.naesinPoints.length}명.
                <span className="ml-1 font-medium text-slate-600">한 등급 열의 세로 길이가 곧 등급이 버린 정보</span>다.
              </p>
              {analysis.naesinPoints.length < 10 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  이 스냅샷에는 내신 백분위가 없습니다(옛 산출물).
                </p>
              ) : (
              <ResponsiveContainer width="100%" height={250}>
                <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" dataKey="grade" name="내신 등급" domain={[1, analysis.maxGrade]}
                    tick={{ fontSize: 11 }} tickCount={analysis.maxGrade} />
                  {/* 세로축은 **상위 %** 라 작을수록 좋다 — 등급축과 방향을 맞춰 뒤집는다 */}
                  <YAxis type="number" dataKey="pct" name="상위 %" domain={[0, 100]} reversed
                    tick={{ fontSize: 11 }} />
                  <ZAxis range={[18, 18]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(v: number, n: string) => [n === '상위 %' ? `상위 ${v.toFixed(1)}%` : `${v.toFixed(2)}등급`, n]}
                    labelFormatter={() => ''} />
                  <Scatter data={analysis.naesinPoints} fill="#6366f1" fillOpacity={0.45} />
                </ScatterChart>
              </ResponsiveContainer>
              )}
            </div>

          {/*
            ## 내신 × 모의 — 이 집단이 어떤 집단인가 (2026-09-05 사용자 요청)

            앞의 세 그림은 한 축씩만 본다. 두 축을 함께 놓으면 **한 축으로는 볼 수 없는 것**이
            보인다 — 구름이 어느 사분면에 뭉쳤는지가 그 집단의 성격이고, 대각선에서 벗어난
            자리가 "내신에 비해 모의가 강한/약한" 학생이다.

            **두 축 모두 클수록 우수**로 맞춘다(내신은 상위 % 라 뒤집는다). 방향이 서로 반대면
            좌상향·우하향이 무엇을 뜻하는지 매번 다시 생각해야 하고 대각선 읽기가 성립하지 않는다.
            겹친 학생 수는 **원 크기**로 옮긴다 — 630명을 그대로 찍으면 밀집한 곳이 오히려 옅어진다.
          */}
          <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold">내신 × 모의 — 이 집단은 어느 쪽이 강한가</h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              {/*
                축이 무엇인지 정확히 적는다 — 종전에 "국·수·영 평균"이라 썼지만 영어·한국사는
                절대평가라 성적표에 백분위가 **아예 없다**(전 회차 null). 그리고 회차를 밝히지
                않으면 학생마다 다른 시험을 한 축에 놓아도 화면이 말해 주지 못한다.
              */}
              가로 = 모의고사 백분위(국어·수학 평균
              {analysis.competitiveness.round && (
                <span className="font-medium text-slate-600">
                  , {analysis.competitiveness.round.year}년 {analysis.competitiveness.round.month}월
                </span>
              )}) · 세로 = 내신 백분위(전교 능력 위치) ·
              <span className="font-medium text-slate-600"> 원이 클수록 그 자리에 학생이 많다</span>
              ({COMPETITIVENESS_BIN}%p 격자). 둘 다 <span className="font-medium text-slate-600">클수록 우수</span>이므로
              대각선 위쪽 = 내신이 더 강한 학생, 아래쪽 = 모의가 더 강한 학생입니다.
            </p>
            {analysis.competitiveness.count < 10 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                두 값을 모두 가진 학생이 적어 그리지 않습니다({analysis.competitiveness.count}명).
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" dataKey="mockPct" name="모의 백분위" domain={[0, 100]}
                      tick={{ fontSize: 11 }} />
                    <YAxis type="number" dataKey="naesinPct" name="내신 백분위" domain={[0, 100]}
                      tick={{ fontSize: 11 }} />
                    {/* 원 넓이가 인원에 비례하도록 — 지름에 비례시키면 큰 칸이 과장된다 */}
                    <ZAxis type="number" dataKey="n" name="학생 수"
                      range={[24, Math.max(60, Math.min(420, analysis.competitiveness.maxN * 34))]} />
                    {/* 대각선 = 두 축이 같은 자리. 벗어난 방향이 곧 그 학생의 강점이다 */}
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                      stroke="#94a3b8" strokeDasharray="4 2" ifOverflow="extendDomain" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      labelFormatter={() => ''}
                      formatter={(v: number, n: string) =>
                        [n === '학생 수' ? `${v}명` : `${v.toFixed(0)}`, n]} />
                    <Scatter data={analysis.competitiveness.points} fill="#0891b2" fillOpacity={0.42} />
                  </ScatterChart>
                </ResponsiveContainer>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  학생 <span className="font-medium text-slate-600">{analysis.competitiveness.count}명</span>
                  {/* 전원이 그 회차 백분위를 갖는 것은 아니다 — 분모를 밝혀야 표본을 오해하지 않는다 */}
                  <span className="text-muted-foreground/70"> / {analysis.students.length}명</span>
                  {analysis.competitiveness.correlation != null && (
                    <> · 두 축의 상관 <span className="font-medium text-slate-600">
                      {analysis.competitiveness.correlation.toFixed(2)}</span>
                      <span className="ml-1">
                        (1 에 가까울수록 내신이 좋은 학생이 모의도 좋다는 뜻입니다)
                      </span></>
                  )}
                </p>
              </>
            )}
          </div>
        </div>


        </div>
      </details>

      {/* 학생별 예측 테이블 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        {/* 필터 & 검색 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold mr-auto">학생별 결과</h3>

          {/* 반 필터 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterClass(null)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${
                filterClass === null
                  ? 'bg-slate-700 text-white'
                  : 'bg-white/50 text-slate-500 hover:bg-white/80'
              }`}
            >
              전체
            </button>
            {analysis.availableClasses.map(c => (
              <button
                key={c}
                onClick={() => setFilterClass(c)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${
                  filterClass === c
                    ? 'bg-slate-700 text-white'
                    : 'bg-white/50 text-slate-500 hover:bg-white/80'
                }`}
              >
                {c}반
              </button>
            ))}
          </div>

          {/* 이름 검색 */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="이름 검색"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              className="pl-6 pr-2 py-1 text-xs rounded-full bg-white/60 border border-white/30 focus:outline-none focus:ring-1 focus:ring-primary w-28"
            />
          </div>
        </div>


        {/*
          표를 **예측 결과 / 실측 결과 두 벌**로 그린다(사용자 요청). 값의 성격이 달라 한 표에
          섞으면 "예측←현재" 처럼 화살표로만 구분해야 하는데, 그러면 무엇이 예측이고 무엇이
          실측인지 헤더가 말해 주지 못한다. 틀은 같게 두어 눈이 자리를 다시 배우지 않게 한다.
        */}
        {tableViews.map(({ kind, title, note }) => {
          const isPred = kind === 'prediction';
          return (
            <div key={kind} className="mb-5 last:mb-0">
              <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
                {/*
                  표 제목 옆에 **출처 배지**를 둔다 — 한 화면에 공식·추정·예측이 섞여 있는데
                  색만으로는 권위가 비슷해 보인다(2026-09-06 적대적 검증).
                */}
                <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  {title}
                  <SourceBadge kind={kind === 'prediction' ? 'predicted' : 'actual'} />
                  {kind === 'actual' && hasReferenceMock && <SourceBadge kind="reference" />}
                </h4>
                <span className="text-[11px] text-muted-foreground">{note}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-[10px] text-muted-foreground">
                      <th className="py-1 px-2" colSpan={2}></th>
                      <th className="py-1 px-1 text-center border-l" colSpan={FEATURE_KEYS.length + 1}>내신</th>
                      <th className="py-1 px-1 text-center border-l" colSpan={MOCK_SUBJECT_KEYS.length + 1}>
                        모의고사{!isPred && hasReferenceMock ? ' (9월 추정)' : ''}
                      </th>
                      <th className="py-1 px-1 border-l"></th>
                    </tr>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">학생</th>
                      <th className="text-center py-2 px-2">반</th>
                      {/* 머리글이 곧 정렬 손잡이다 — 열과 정렬 대상이 같은 자리에 있어야 한다 */}
                      {FEATURE_KEYS.map((k, i) => (
                        <SortableTh key={k} label={k === 'overall' ? '내신평균' : SUBJECT_GROUP_LABELS[k]}
                          sortKey={k} kind={kind} sort={sort} onSort={handleSort}
                          className={cn(i === 0 && 'border-l')} />
                      ))}
                      {/* 등급이 버린 해상도를 표에도 한 열로 — 위 산점도와 같은 값이다 */}
                      <SortableTh
                        label={<>위치<span className="ml-0.5 font-normal text-[9px] text-muted-foreground">
                          {isPred ? '(예상 상위%)' : '(상위%)'}</span></>}
                        sortKey="position" kind={kind} sort={sort} onSort={handleSort} />
                      {MOCK_SUBJECT_KEYS.map((k, i) => (
                        <SortableTh key={`m-${k}`} label={mockSubjectLabel(k)}
                          sortKey={`mock:${k}`} kind={kind} sort={sort} onSort={handleSort}
                          className={cn(i === 0 && 'border-l')} />
                      ))}
                      <SortableTh label="모의평균" sortKey="mock:overall" kind={kind}
                        sort={sort} onSort={handleSort} />
                      <th className="text-center py-2 px-1 border-l">추세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map(row => {
                      const rationale = (predictionData?.students.find(ps => ps.id === row.id))?.rationale;
                      const naesin = isPred ? row.predNaesin : row.actualNaesin;
                      const mock = isPred ? row.predMock : row.actualMock;
                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            'border-b border-muted/30 hover:bg-white/30 cursor-pointer',
                            selectedStudent === row.id && 'bg-indigo-50/50',
                          )}
                          onClick={() => setSelectedStudent(selectedStudent === row.id ? null : row.id)}
                        >
                          <td className="py-1.5 px-2 font-medium whitespace-nowrap">
                            {row.name}
                            {isPred && !row.hasPrediction && (
                              <span className="ml-1 text-[9px] text-muted-foreground">(예측 없음)</span>
                            )}
                          </td>
                          <td className="text-center py-1.5 px-2 text-muted-foreground">{row.class_num}</td>
                          {FEATURE_KEYS.map((k, i) => {
                            const v = naesin[k];
                            const change = isPred ? row.changes[k] : null;
                            return (
                              <td key={k} className={cn('text-center py-1.5 px-1', i === 0 && 'border-l')}>
                                {/*
                                  ## 소수 2자리로 적는다 — 1자리면 정수 등급과 어긋난다
                                  예측값은 등급컷 안 위치라 상한이 `x.99` 다. `toFixed(1)` 이면
                                  `1.99 → 2.0` 이 되어 **제도 등급 1등급인 학생이 2등급으로 보인다**.
                                  실측은 진짜 평균이라 1자리로 충분하다.
                                */}
                                <span className={cn('font-semibold', v != null ? gradeColor(v) : '')}
                                  title={isPred
                                    ? '백분위를 등급컷으로 되돌린 값(구간 안 위치까지). 성적표 평균등급과는 다른 자다.'
                                    : '성적표 평균등급(과목 등급의 이수단위 가중평균)'}>
                                  {v != null ? v.toFixed(isPred ? 2 : 1) : '-'}
                                </span>
                                {/*
                                  직전 성적표 평균등급을 괄호로 나란히 두던 것을 뺐다 —
                                  예측값과 **정의가 달라 뺄 수 없는 두 수**를 붙여 놓은 것이
                                  변화량 오해의 뿌리였다. 직전 값은 실측 표를 켜면 그대로 보인다.
                                  대신 같은 자로 잰 **위치 변화(%p)** 를 붙인다.
                                */}
                                {change != null && Math.abs(change) >= 1 && (
                                  <span className={cn('ml-0.5 text-[9px]', change < 0 ? 'text-emerald-600' : 'text-rose-600')}
                                    title="전교 능력 위치(상위 %)의 변화 — 직전 실측 대비. 작아지면 향상">
                                    {change < 0 ? change.toFixed(0) : `+${change.toFixed(0)}`}%p
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-center py-1.5 px-1 whitespace-nowrap">
                            {(() => {
                              if (isPred) {
                                const p = row.predPct;
                                if (!p) return <span className="text-muted-foreground">-</span>;
                                return (
                                  <span title="전교 능력 위치 기준 · 괄호는 80% 예측구간">
                                    <span className="font-semibold text-indigo-700">{p.pct.toFixed(0)}%</span>
                                    {p.lo != null && p.hi != null && (
                                      <span className="ml-0.5 text-[9px] text-muted-foreground">
                                        {p.lo.toFixed(0)}~{p.hi.toFixed(0)}
                                      </span>
                                    )}
                                  </span>
                                );
                              }
                              const a = row.actualPct;
                              if (!a) return <span className="text-muted-foreground">-</span>;
                              const shift = a.pct_adj == null ? null : a.pct_adj - a.pct;
                              return (
                                <span title="그 과목 집단 안 위치 → 수강 집단 보정 후 전교 기준">
                                  <span className="font-semibold text-slate-700">{a.pct.toFixed(0)}%</span>
                                  {a.pct_adj != null && (
                                    <span className={cn('ml-0.5 text-[9px]',
                                      shift != null && shift <= -2 ? 'text-cyan-600'
                                        : shift != null && shift >= 2 ? 'text-orange-600'
                                        : 'text-muted-foreground')}>
                                      →{a.pct_adj.toFixed(0)}
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                          {MOCK_SUBJECT_KEYS.map((k, i) => {
                            const v = mock[k];
                            return (
                              <td key={`m-${k}`} className={cn('text-center py-1.5 px-1', i === 0 && 'border-l')}>
                                <span className={cn('font-semibold', v != null ? gradeColor(v) : '')}>
                                  {v != null ? v.toFixed(1) : '-'}
                                </span>
                              </td>
                            );
                          })}
                          <td className="text-center py-1.5 px-1">
                            <span className={cn('font-semibold', mock.overall != null ? gradeColor(mock.overall) : '')}>
                              {mock.overall != null ? mock.overall.toFixed(1) : '-'}
                            </span>
                          </td>
                          <td className="text-center py-1.5 px-1 border-l">
                            {rationale?.direction === 'improving' && (
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 inline" />
                            )}
                            {rationale?.direction === 'declining' && (
                              <TrendingDown className="w-3.5 h-3.5 text-rose-500 inline" />
                            )}
                            {rationale?.direction === 'stable' && (
                              <Minus className="w-3.5 h-3.5 text-slate-400 inline" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {filteredStudents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            검색 결과가 없습니다.
          </p>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-muted/20">
            <p className="text-[10px] text-muted-foreground">
              총 {filteredStudents.length}명 중 {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredStudents.length)}명
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1 rounded hover:bg-white/60 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-6 h-6 text-[10px] rounded ${
                    p === safePage
                      ? 'bg-primary text-white'
                      : 'hover:bg-white/60 text-muted-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1 rounded hover:bg-white/60 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 선택 학생 상세 추이 — 모달 */}
      <Dialog open={!!studentDetail} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          {studentDetail && (
            <>
            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold">
                    {studentDetail.student.name} ({studentDetail.student.grade}-{studentDetail.student.class_num}) 학기별 추이
                  </DialogTitle>
                </div>
                {/*
                  ## 모달 상단 툴바 — 무엇을·어떤 자로 볼지 한 곳에서 정한다 (2026-09-05 사용자 지시)
                  종전에는 척도 토글이 차트·표마다 따로 있어 어느 것이 무엇에 적용되는지 알 수
                  없었다. 두 축(영역·척도)을 여기 하나로 모으고 아래 모든 구획이 이를 따른다.
                */}
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-0.5">영역</span>
                    {([['naesin', '내신'], ['mock', '모의고사 · 수능']] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setModalDomain(v)}
                        className={cn('px-2.5 py-1 text-[11px] rounded-md border transition-colors',
                          modalDomain === v
                            ? 'bg-indigo-600 text-white border-transparent font-semibold'
                            : 'bg-white/70 text-slate-500 border-slate-200 hover:bg-white')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-0.5">척도</span>
                    {([['grade', '등급'], ['percentile', '백분위']] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTrendScale(v)}
                        className={cn('px-2.5 py-1 text-[11px] rounded-md border transition-colors',
                          trendScale === v
                            ? 'bg-slate-700 text-white border-transparent font-semibold'
                            : 'bg-white/70 text-slate-500 border-slate-200 hover:bg-white')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </DialogHeader>

              {/*
                ## 좌우 2패널 — 왼쪽 분석 · 오른쪽 실측 (2026-09-05 사용자 지시)
                예측을 읽으려면 **그 예측이 무엇에서 나왔는지**가 같은 화면에 있어야 한다.
                종전에는 분석과 실측이 세로로 길게 섞여 있어, 예측 카드를 보다가 실제 성적을
                확인하려면 한참 스크롤해야 했다. 좁은 화면(xl 미만)에서는 한 줄로 쌓인다.
              */}
              {/*
                ## 2열 전환은 **본문 폭** 기준이다 (2026-09-06 적대적 검증)

                `xl:` 은 **뷰포트** 폭이라, 화면이 넓어도 왼쪽 학생 목록·오른쪽 메모가 열려
                있으면 본문은 좁은데 2열이 된다(evalearn 3-패널이 정확히 그 상황이다).
                `@container` 는 이 요소가 실제로 받은 폭을 본다 — Tailwind 의 `@container`
                유틸(`@3xl:`)이 그것이고, 미지원 브라우저에서는 1열로 남아 안전하게 깨진다.
              */}
              <div className="pred-detail-container">
              <div className="pred-detail-cols grid grid-cols-1 gap-4 items-start">
                <div className="space-y-4 min-w-0">

          {/*
            ## 예측 근거 — 한 줄 요약 + 서랍 (2026-09-05 사용자 지시)

            값이 아니라 **뜻**을 내야 하는데, 뜻을 다 적으면 상자가 커져 정작 그 아래
            예측 표가 밀린다. 그래서 **평소에는 한 줄**(추세 · 근거 학기 · 표본 등급)이고
            누르면 각 값이 무엇인지가 아래로 펼쳐진다.

            **"신뢰도"를 "표본 등급"으로 바꾼 이유**: `rationale.confidence` 는
            `n_semesters >= 4 ? high : n >= 2 ? medium : low` 가 전부다. "신뢰도 높음"은
            "이 예측은 정확하다"로 읽히는데 실제 정확도는 요약 타일의 검증 오차와
            80% 구간이 낸다.

            그리고 이 값은 **학생별이긴 하나 학년으로 거의 정해진다**(라이브 실측 —
            1학년 1학기=낮음 223명 전원 · 2학년 3학기=보통 196명 전원 · 3학년 5학기=높음
            217명 전원). 즉 **같은 학년 안에서는 변별하지 않는다.** 이 사실을 적어 두지
            않으면 "왜 3학년은 높음이고 2학년은 보통인가"가 반복해서 되물어진다.

            **전체평균 추이 칸은 없앴다**(사용자: 없어도 무관) — 추세 기울기와 같은 말을
            두 번 했고, 학기별 값은 오른쪽 실측 표가 전부 낸다.
          */}
          {studentDetail.student.rationale && (() => {
            const r = studentDetail.student.rationale;
            const dir = r.direction;
            const dirLabel = dir === 'improving' ? '향상' : dir === 'declining' ? '하락'
              : dir === 'stable' ? '안정' : '판단 불가';
            const dirTone = dir === 'improving' ? 'text-emerald-600'
              : dir === 'declining' ? 'text-rose-600' : 'text-slate-600';
            /* 등급은 작을수록 좋으므로 **기울기 부호와 좋고 나쁨이 반대**다. 부호를 그대로
               적으면 '향상 +0.21' 처럼 읽혀 정반대로 이해된다 — 크기와 방향을 말로 가른다. */
            const perSem = r.slope == null ? null : Math.abs(r.slope);
            const alphaPct = r.blend_alpha == null ? null : Math.round(r.blend_alpha * 100);
            const tierLabel = r.confidence === 'high' ? '높음'
              : r.confidence === 'medium' ? '보통' : '낮음';
            const tierTone = r.confidence === 'high' ? 'text-emerald-600'
              : r.confidence === 'medium' ? 'text-amber-600' : 'text-rose-600';
            return (
              <div className="bg-indigo-50/60 rounded-lg border border-indigo-100 mb-4">
                {/* ── 접힌 상태: 한 줄 ── */}
                <button
                  type="button"
                  onClick={() => setRationaleOpen(v => !v)}
                  className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-indigo-50/80 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-1.5 shrink-0">
                    <Info className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-xs font-semibold text-indigo-700">예측 근거</span>
                  </span>
                  <span className="text-[11px]">
                    <span className="text-muted-foreground">추세 </span>
                    <span className={cn('font-semibold', dirTone)}>{dirLabel}</span>
                    {perSem != null && (
                      <span className="text-muted-foreground ml-0.5">{perSem.toFixed(2)}/학기</span>
                    )}
                  </span>
                  <span className="text-[11px]">
                    <span className="text-muted-foreground">근거 학기 </span>
                    <span className="font-semibold text-slate-700">{r.data_semesters}학기</span>
                  </span>
                  <span className="text-[11px]">
                    <span className="text-muted-foreground">표본 등급 </span>
                    <span className={cn('font-semibold', tierTone)}>{tierLabel}</span>
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 ml-auto text-indigo-500 transition-transform shrink-0',
                    rationaleOpen ? 'rotate-0' : '-rotate-90')} />
                </button>

                {/* ── 펼친 상태: 각 값이 무엇인지 ── */}
                {rationaleOpen && (
                  <div className="px-3 pb-3 pt-0.5 border-t border-indigo-100/70">
                    <p className="text-[11px] leading-relaxed text-slate-700 mt-2 mb-2">
                      {dir === 'insufficient' ? (
                        <>학기가 <span className="font-semibold">1개뿐</span>이라 추세를 낼 수 없습니다.
                          모델은 그 한 학기를 그대로 이어 갑니다.</>
                      ) : (
                        <>
                          실측 <span className="font-semibold">{r.data_semesters}학기</span>의 전체평균이
                          학기마다 <span className={cn('font-semibold', dirTone)}>
                            {perSem != null ? `${perSem.toFixed(2)}등급씩 ${dirLabel}` : dirLabel}
                          </span>
                          {dir === 'stable' ? '했습니다(움직임이 0.15등급 안).' : '했습니다.'}
                          {' '}이 추세와 교과군별 값이 모델의 입력입니다.
                        </>
                      )}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {[
                        {
                          k: '추세',
                          v: <span className={cn('font-semibold', dirTone)}>{dirLabel}</span>,
                          sub: perSem != null
                            ? `전체평균 등급에 직선을 맞춘 기울기 ${r.slope! > 0 ? '+' : ''}${r.slope!.toFixed(2)}/학기 · 움직임이 0.15등급 안이면 안정`
                            : '학기가 2개 미만이라 직선을 맞출 수 없습니다',
                        },
                        {
                          k: '근거 학기',
                          v: <span className="font-semibold text-slate-700">{r.data_semesters}학기</span>,
                          sub: '이 학생에게서 실제로 쓴 학기 수 — 예측은 이 궤적을 이어 갑니다',
                        },
                        {
                          k: '표본 등급',
                          v: <span className={cn('font-semibold', tierTone)}>{tierLabel}</span>,
                          sub: '왼쪽 학기 수를 4↑/2↑/그 미만으로 나눈 것뿐입니다. 예측의 정확도가 아니라 재료의 양이며, 정확도는 아래 80% 구간이 냅니다',
                        },
                      ].map(c => (
                        <div key={c.k} className="rounded-md bg-white/70 border border-indigo-100/70 px-2 py-1.5">
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground">{c.k}</span>
                            <span className="text-xs">{c.v}</span>
                          </div>
                          <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{c.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/*
                      "왜 3학년은 높음이고 2학년은 보통인가"에 대한 답을 화면이 직접 해야 한다.
                      학생별 값이 맞지만 학기 수는 학년이 정하므로 학년 안에서는 변별하지 않는다.
                    */}
                    <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
                      표본 등급은 학생별 값이지만 <span className="font-medium text-slate-600">학년으로 거의 정해집니다</span> —
                      1학년은 실측이 1학기뿐이라 낮음, 2학년은 3학기라 보통, 3학년은 5학기라 높음입니다.
                      즉 <span className="font-medium text-slate-600">같은 학년 안에서는 학생을 가르지 않고</span>,
                      &ldquo;1학년 예측은 한 학기만 보고 낸 것&rdquo;이라는 뜻으로 읽으십시오.
                    </p>

                    {/* α 는 학생별 값이 아니라 모델 설정이지만, "이 숫자가 어떻게 섞여 나왔나"의
                        일부라 근거 서랍에 함께 둔다. 1.00 이면 혼합이 꺼진 것이라 말할 것이 없다. */}
                    {alphaPct != null && alphaPct < 100 && (
                      <p className="mt-1 text-[9px] text-muted-foreground">
                        최종값은 <span className="font-medium text-slate-600">모델 {alphaPct}% + 직전 학기 {100 - alphaPct}%</span>로
                        섞습니다 — 코호트 시간외 검증에서 이 배합이 가장 나았을 때만 켜집니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}


          {/*
            ## 영역 토글이 **분석과 실측을 함께** 가른다 (2026-09-05 사용자 지시)

            내신과 모의고사는 축의 뜻이 다르다 — 내신은 교내 상대평가, 모의고사는 전국 기준이다.
            한 화면에 둘을 세로로 이어 두면 "3등급"이 같은 것을 뜻하는 것처럼 읽히고, 무엇보다
            **스크롤이 길어 지금 보는 것이 어느 쪽인지 잃는다**. 토글이 왼쪽(분석)과
            오른쪽(실측)을 **동시에** 바꾸므로, 두 패널은 언제나 같은 영역을 말한다.
          */}
          {modalDomain === 'mock' && (<>
          {/* 칸마다 성격이 다르다는 것을 글로 못박는다 — 한 선 위에 실측·예측·참고가 함께 있다. */}
          {studentDetail.student.grade === 3 && (septLoading || studentDetail.hasSeptReference || studentDetail.forecast) && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {septLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 9월 모평 참고 등급을 계산하는 중…
                </span>
              ) : (
                <>
                  {studentDetail.hasSeptReference && studentDetail.septOfficial && (
                    <>
                      <span className="font-medium text-slate-600">{SEPT_TREND_LABEL}</span> 칸은 9월 모평{' '}
                      <span className="font-medium text-slate-600">공식 성적</span>입니다.{' '}
                    </>
                  )}
                  {studentDetail.hasSeptReference && !studentDetail.septOfficial && (
                    <>
                      <span className="font-medium text-slate-600">{SEPT_TREND_LABEL}</span> 칸은 9월 모평 마킹을{' '}
                      <span className="font-medium text-slate-600">EBS 예상 등급컷</span>에 대조해 산정한 참고 등급입니다 —
                      AI 예측이 아니라 <span className="font-medium text-slate-600">실제 응시 결과</span>이고, 공식 성적도 아닙니다.{' '}
                    </>
                  )}
                  {studentDetail.forecast && (
                    <>
                      <span className="font-medium text-slate-600">{SUNEUNG_TREND_LABEL}</span> 칸은 평가원 두 회차를 섞은
                      추정치입니다(9월 {SUNEUNG_W_SEPT.toFixed(1)} + 6월 {SUNEUNG_W_JUNE.toFixed(1)}).{' '}
                    </>
                  )}
                  2학기 내신은 아직 없어 모의고사 계열만 표시됩니다.
                </>
              )}
            </p>
          )}

          </>)}

          {modalDomain === 'naesin' && (<>
          {/*
            예측 ↔ 실측 대조. 이 모달은 예측 표와 실측 표 **양쪽에서** 열리므로, 어느 쪽으로
            들어왔든 "그때 뭐라고 했고 실제로 어땠는가"를 같은 자리에서 볼 수 있어야 한다.
            과거 스냅샷(7월 예측)을 고르면 이 표가 곧 사후 검증이 된다.
          */}
          {(() => {
            const orig = studentDetail.student;
            /* 실측은 **스냅샷이 아니라 DB 원본**에서 읽는다. 스냅샷의 `current_grades` 는 그
               스냅샷을 만든 시점의 실측이라, 7월 예측을 골라 사후 검증하려 해도 그때 없던
               3-1 성적이 거기 있을 리 없다(그러면 대조표가 늘 비어 사후 검증이 불가능하다). */
            const records = analysisData.find(d => d.id === orig.id)?.academic_development ?? null;
            const settled = orig.predictions
              .map(pred => {
                const [g, sem] = pred.semester.split('-');
                const actual = semesterNaesinFromRecords(records as never, g, sem);
                return { pred, actual, hasActual: actual.overall != null };
              })
              .filter(x => x.hasActual);
            if (settled.length === 0) return null;

            return (
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
                  <p className="text-xs font-semibold text-emerald-700">예측 ↔ 실측 대조</p>
                  <span className="text-[10px] text-muted-foreground">
                    이 스냅샷이 예측했던 학기 중 이미 성적이 나온 것만 — 오차 = 예측 − 실측(양수면 실제보다 나쁘게 봤다)
                  </span>
                </div>
                {settled.map(({ pred, actual }) => (
                  <div key={pred.semester} className="mb-2 last:mb-0 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2">
                    <p className="text-[11px] font-semibold text-emerald-800 mb-1">{pred.semester}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-[10px] text-muted-foreground border-b border-emerald-200/60">
                            <th className="text-left py-1 pr-2">교과</th>
                            <th className="text-center py-1 px-1">예측</th>
                            <th className="text-center py-1 px-1">80% 구간</th>
                            <th className="text-center py-1 px-1">실측</th>
                            <th className="text-center py-1 px-1">오차</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FEATURE_KEYS.map(k => {
                            const p = pred.grades[k]?.grade ?? null;
                            const lo = pred.grades[k]?.lo ?? null;
                            const hi = pred.grades[k]?.hi ?? null;
                            const a = actual[k] ?? null;
                            if (p == null && a == null) return null;
                            const diff = p != null && a != null ? p - a : null;
                            return (
                              <tr key={k} className="border-b border-emerald-100/60 last:border-0">
                                <td className="py-1 pr-2">{k === 'overall' ? '내신평균' : SUBJECT_GROUP_LABELS[k]}</td>
                                <td className="text-center py-1 px-1">{p != null ? p.toFixed(2) : '-'}</td>
                                {/*
                                  사후 검증 화면이므로 **구간이 실제를 담았는지**까지 보여 준다 —
                                  점추정 오차만으로는 "빗나갔지만 예상 범위 안이었다"를 구분할 수 없다.
                                */}
                                <td className={cn('text-center py-1 px-1 text-[10px]',
                                  lo != null && hi != null && a != null
                                    ? (a >= lo && a <= hi ? 'text-emerald-700' : 'text-rose-600')
                                    : 'text-muted-foreground')}>
                                  {lo != null && hi != null ? `${lo.toFixed(1)}~${hi.toFixed(1)}` : '-'}
                                </td>
                                <td className="text-center py-1 px-1 font-semibold">{a != null ? a.toFixed(2) : '-'}</td>
                                <td className={cn('text-center py-1 px-1 font-semibold',
                                  diff == null ? '' : Math.abs(diff) < 0.5 ? 'text-emerald-600'
                                    : Math.abs(diff) < 1 ? 'text-amber-600' : 'text-rose-600')}>
                                  {diff == null ? '-' : (diff > 0 ? '+' : '') + diff.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                          {/* 모의고사도 같은 자리에서 — 내신만 보면 근거의 절반이 빠진다 */}
                          {(() => {
                            const pm = pred.mock_prediction?.grade ?? null;
                            const am = orig.current_grades[pred.semester]?.mock ?? null;
                            if (pm == null && am == null) return null;
                            const diff = pm != null && am != null ? pm - am : null;
                            return (
                              <tr className="border-t border-emerald-200/60">
                                <td className="py-1 pr-2 text-muted-foreground">모의평균</td>
                                <td className="text-center py-1 px-1">{pm != null ? pm.toFixed(2) : '-'}</td>
                                <td className="text-center py-1 px-1 font-semibold">{am != null ? am.toFixed(2) : '-'}</td>
                                <td className={cn('text-center py-1 px-1 font-semibold',
                                  diff == null ? '' : Math.abs(diff) < 0.5 ? 'text-emerald-600'
                                    : Math.abs(diff) < 1 ? 'text-amber-600' : 'text-rose-600')}>
                                  {diff == null ? '-' : (diff > 0 ? '+' : '') + diff.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 학기별 내신 예측 — 모의고사 예상은 아래 별도 섹션이다(경로가 다르다) */}
          <p className="text-xs font-semibold text-slate-700 mt-4 mb-2">학기별 내신 예측</p>
          <div className="space-y-2">
            {studentDetail.student.predictions.map(pred => (
              <div key={pred.semester} className="bg-indigo-50/50 rounded-lg p-3">
                {/*
                  ## 내신 칸에 모의고사를 섞지 않는다 (2026-09-05 사용자 지적)
                  한 카드가 "내신 예측"이라 이름 붙어 있는데 헤더에 모의고사 평균이 함께 있어
                  **무엇의 예측인지 흐려졌다**. 내신은 이 표, 모의고사는 아래 별도 구획으로 가른다.
                */}
                <p className="text-xs font-semibold text-indigo-700 mb-1">
                  {pred.semester} <span className="font-normal">학기</span> 내신 예측
                  {/* 몇 단계 앞을 보는지가 신뢰도를 좌우한다 — 단계가 늘수록 오차가 쌓인다 */}
                  <span className="ml-1 text-[10px] font-normal text-indigo-400">
                    {(pred.step ?? 1) > 1
                      ? `${pred.step}단계 앞 (앞선 예측을 다시 입력으로 씀)`
                      : '한 단계 앞'}
                  </span>
                </p>
                {/*
                  ## 한 표로 — 숫자마다 **머리글이 자기를 설명**해야 한다 (2026-09-05 개편)

                  종전에는 `1.42(1.0~2.1)← 1.0(보정 전 1.1)` 처럼 네 값을 괄호와 화살표로만
                  구분해 늘어놓았다. **무엇을 예측하는지도 무엇으로 예측했는지도 읽을 수 없었다**
                  (사용자 지적). 게다가 "보정 전"은 정확하지도 않았다 — 등급대 보정은 검증에서
                  이득이 없어 꺼져 있고, 실제 차이는 α 혼합과 **전체평균의 이월 대체**다.

                  표로 바꾸면 열 머리글이 각 숫자를 설명하고, 세 관점(등급·능력 위치·과목 기반)이
                  같은 행에 놓여 **교과별로 가로로 읽힌다**. 값이 없는 열은 아예 만들지 않는다.
                */}
                {(() => {
                  const orig = predictionData?.students.find(ps => ps.id === selectedStudent);
                  const curSems = orig ? Object.keys(orig.current_grades).sort() : [];
                  const curOf = (k: string) => {
                    for (let i = curSems.length - 1; i >= 0; i -= 1) {
                      const v = orig?.current_grades[curSems[i]]?.[k];
                      if (v != null) return v as number;
                    }
                    return null;
                  };
                  const pctCell = (orig?.percentile_predictions ?? [])
                    .find(x => x.semester === pred.semester)?.percentiles ?? null;
                  const sa = (orig?.subject_aware_predictions ?? [])
                    .find(x => x.semester === pred.semester) ?? null;
                  const gradeSystem = studentDetail.student.grade_system === 5 ? 5 : 9;
                  const hasBand = FEATURE_KEYS.some(k => pred.grades[k]?.lo != null);
                  const blendedDiffers = FEATURE_KEYS.some(k => {
                    const g = pred.grades[k]?.grade;
                    const r = pred.raw_prediction?.[k]?.grade;
                    return g != null && r != null && Math.abs(g - r) > 0.05;
                  });

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] text-indigo-500 border-b border-indigo-200/60">
                            <th className="text-left py-1 pr-2 font-medium">교과</th>
                            <th className="text-center py-1 px-1 font-medium">
                              예측 등급<span className="font-normal"> · 백분위</span>
                            </th>
                            {hasBand && <th className="text-center py-1 px-1 font-medium">80% 구간</th>}
                            <th className="text-center py-1 px-1 font-medium">직전 학기</th>
                            {pctCell && (
                              <th className="text-center py-1 px-1 font-medium border-l border-indigo-200/60">
                                능력 위치<span className="font-normal"> (상위%)</span>
                              </th>
                            )}
                            {sa && (
                              <th className="text-center py-1 px-1 font-medium border-l border-indigo-200/60"
                                title="지금 실력을 그대로 유지한다고 볼 때, 실제로 들을 과목 집단에서 나올 값. 미래 능력 예측이 아니다.">
                                수강 과목 기반<span className="font-normal"> (현 실력 유지)</span>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {FEATURE_KEYS.map(k => {
                            const cell = pred.grades[k];
                            /*
                              ## 등급은 표시값이고 백분위가 계산값이다 (2026-09-05)
                              `grade` 는 제도가 매기는 정수, `grade_exact` 는 등급 구간 안의
                              위치까지 담은 소수점 등급이다. 정수만 적으면 백분위로 계산한
                              해상도를 여기서 버린다 — 이 칸이 그 해상도를 보여 주는 자리다.
                              옛 스냅샷은 `pct` 에서 화면이 같은 등급컷으로 환산한다.
                            */
                            const g = cell?.grade_exact
                              ?? (cell?.pct != null
                                  ? gradeFromTopPctExact(cell.pct, gradeSystem)
                                  : cell?.grade);
                            const lo = cell?.lo_exact ?? cell?.lo;
                            const hi = cell?.hi_exact ?? cell?.hi;
                            const cur = curOf(k);
                            const pv = pctCell?.[k];
                            const sv = sa?.grades?.[k];
                            const isOverall = k === 'overall';
                            if (g == null && cur == null) return null;
                            return (
                              <tr key={`row-${k}`} className="border-b border-indigo-100/50 last:border-0">
                                <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">
                                  {isOverall ? '전체평균' : SUBJECT_GROUP_LABELS[k]}
                                </td>
                                <td className="text-center py-1 px-1">
                                  <span className={cn('font-semibold', g != null ? gradeColor(g) : '')}>
                                    {g != null ? g.toFixed(2) : '-'}
                                  </span>
                                  {/* 등급은 백분위에서 나온 값이므로 그 원값을 바로 아래 붙인다 */}
                                  {cell?.pct != null && (
                                    <span className="block text-[9px] leading-tight text-violet-600">
                                      상위 {cell.pct.toFixed(1)}%
                                    </span>
                                  )}
                                </td>
                                {hasBand && (
                                  <td className="text-center py-1 px-1 text-[10px] text-muted-foreground whitespace-nowrap">
                                    {lo != null && hi != null ? `${lo.toFixed(1)} ~ ${hi.toFixed(1)}` : '-'}
                                  </td>
                                )}
                                <td className="text-center py-1 px-1 text-muted-foreground">
                                  {cur != null ? cur.toFixed(2) : '-'}
                                </td>
                                {pctCell && (
                                  <td className="text-center py-1 px-1 border-l border-indigo-100/50 whitespace-nowrap">
                                    {pv ? (
                                      <>
                                        <span className="font-semibold text-slate-700">{pv.pct.toFixed(0)}%</span>
                                        {pv.lo != null && pv.hi != null && (
                                          <span className="ml-0.5 text-[10px] text-muted-foreground">
                                            {pv.lo.toFixed(0)}~{pv.hi.toFixed(0)}
                                          </span>
                                        )}
                                      </>
                                    ) : <span className="text-muted-foreground">-</span>}
                                  </td>
                                )}
                                {sa && (
                                  <td className="text-center py-1 px-1 border-l border-indigo-100/50 whitespace-nowrap">
                                    {sv ? (
                                      <>
                                        {/* 과목 등급의 이수단위 가중 평균(성적표 평균등급 셈법) */}
                                        <span className={cn('font-semibold', gradeColor(sv.grade))}>
                                          {sv.grade.toFixed(2)}
                                        </span>
                                        {/*
                                          ## 차이는 **백분위로** 잰다 (2026-09-05)
                                          왼쪽 `예측 등급` 은 백분위를 등급컷으로 되돌린 *구간 안
                                          위치*이고 이 칸은 *과목 등급들의 평균*이라, 두 등급을
                                          그대로 빼면 서로 다른 자로 잰 값을 빼는 것이 된다.
                                          두 경로 모두 `pct` 를 갖고 있으므로 그쪽에서 비교한다 —
                                          벌어진 %p 가 곧 "과목 선택이 만든 차이"다.
                                        */}
                                        {cell?.pct != null && sv.pct != null
                                          && Math.abs(sv.pct - cell.pct) >= 3 && (
                                          <span className={cn('ml-0.5 text-[9px]',
                                            sv.pct < cell.pct ? 'text-emerald-600' : 'text-rose-600')}
                                            title="모델이 본 능력 위치와, 실제로 들을 과목 집단에 대입한 위치의 차이">
                                            {sv.pct < cell.pct ? '' : '+'}{(sv.pct - cell.pct).toFixed(0)}%p
                                          </span>
                                        )}
                                      </>
                                    ) : <span className="text-muted-foreground">-</span>}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/*
                        ## 무엇으로 예측했는지 — 표 아래 한 문단으로 못박는다
                        열 머리글만으로는 "전체평균이 왜 직전 학기와 같은가"가 설명되지 않는다.
                        그 값은 **일부러 이월한 것**이고(검증에서 그게 가장 정확했다) 우연이 아니다.
                      */}
                      {/* 핵심 설명은 9px 로 두지 않는다 — 읽으라고 쓴 글이다(2026-09-06) */}
                      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                        <p>
                          {/*
                            ⚠️ 종전 문구 "이수단위 가중 평균 석차등급"은 **틀렸다** — 그건 실측
                            평균등급의 정의이고, 이 예측값은 백분위를 등급컷으로 되돌린 **구간 안
                            위치**다(2026-09-06 적대적 검증). 같은 이름을 붙이면 두 표의 숫자를
                            빼게 되고, 그 뺄셈이 부호까지 틀린다.
                          */}
                          <span className="font-medium text-slate-600">예측 등급</span> = 예측한{' '}
                          <span className="font-medium text-slate-600">전교 능력 위치(백분위)</span>를{' '}
                          {studentDetail.student.grade_system}등급제 등급컷으로 되돌린 값입니다 — 소수부는
                          그 등급 구간 안의 위치이지 과목 간 편차가 아닙니다(성적표 평균등급과 다른 자라,
                          오른쪽 실측 표의 숫자와 직접 빼지 마십시오). 교과별은 졸업생·상급생의 학기
                          전이로 배운 모델이 내고,{' '}
                          <span className="font-medium text-slate-600">전체평균은 직전 학기 값을 그대로</span>{' '}
                          씁니다 — 검증에서 그 방식이 가장 정확했습니다(그래서 두 값이 같습니다).
                        </p>
                        {hasBand && (
                          <p>
                            {/*
                              ## ⚠️ "가능성 80%" 라고 단정하지 않는다 (2026-09-06 적대적 검증)

                              컨포멀 보장은 **교환가능성 가정 아래의 평균 포함률**이지 개인별
                              확률이 아니다. 게다가 우리 구현은 α 를 고른 코호트를 **구간 보정에도
                              재사용**하고 최종 모델을 다시 학습한다 — 그 재학습이 구간을 반드시
                              보수적으로 만든다는 보장도 없다. 실제로 24학번 홀드아웃에서 명목
                              0.80 의 실측 포함률이 74.4% 였고 수학만 65.5% 였다(이미 문서화된 값).
                              그래서 **명목값**이라 부르고 실측 포함률은 별도 검증 대상으로 남긴다.
                            */}
                            <span className="font-medium text-slate-600">80% 구간</span> = 이 코호트를 보지
                            않고 배운 모델의 잔차로 만든 <span className="font-medium text-slate-600">명목 80%
                            예측구간</span>입니다. 집단 전체에서 평균적으로 그 정도가 들어오도록 맞춘 폭이며,
                            개별 학생이 이 범위에 들 확률이 80%라는 뜻은 아닙니다. 홀드아웃 실측 포함률은
                            74~79%였고 수학은 그보다 낮았습니다.
                          </p>
                        )}
                        {pctCell && (
                          <p>
                            <span className="font-medium text-slate-600">능력 위치</span> = 수강 집단 차이를
                            뺀 전교 기준 상위 %. 등급은 칸이 9개(또는 5개)뿐이라 같은 등급 안의 차이가
                            사라지는데, 이 값은 그 위치를 그대로 말합니다.
                          </p>
                        )}
                        {sa && (
                          <p>
                            {/*
                              ## ⚠️ 이것은 **현재 실력 고정 시나리오**다 (2026-09-06 적대적 검증)

                              구현은 미래에 예측한 능력이 아니라 **지금 능력(θ)** 을 미래 수강 집단에
                              대입한다. 그래서 학기 전이 모델의 값과 이 값의 차이에는 "과목 선택 효과"와
                              "능력 변화 가정"이 **함께** 섞여 있다 — 그 차이를 곧 과목 선택이 만든
                              것이라 말하면 안 된다. 과목끼리 비교할 때만(같은 능력 가정) 그 뜻이 성립한다.
                            */}
                            <span className="font-medium text-slate-600">수강 과목 기반</span> = 이 학생이{' '}
                            {sa.academic_year}학년도에{' '}
                            <span className="font-medium text-slate-600">실제로 들을 과목 {sa.subjects}개</span>
                            (확정 편성·수요조사)의 집단 강도에 <span className="font-medium text-slate-600">
                            지금 실력을 그대로 대입</span>한 값입니다 — <span className="font-medium
                            text-slate-600">&ldquo;지금 실력을 유지하면&rdquo;의 시나리오</span>이지 미래
                            능력 예측이 아닙니다. 왼쪽 예측 등급과의 차이에는 과목 선택 효과와 능력 변화
                            가정이 함께 섞여 있으므로, 그 차이를 과목 선택의 효과로만 읽지 마십시오.
                            <span className="font-normal"> 과목끼리 비교할 때는 능력 가정이 같아 유효합니다.</span>
                          </p>
                        )}
                        {blendedDiffers && (
                          <p>
                            모델이 직접 낸 값과 위 표가 다른 교과가 있습니다 — 전체평균은 이월로 대체되고,
                            교과별은 직전 성적을 α만큼 섞기 때문입니다(현재 α는 요약 타일에 있습니다).
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
          </>)}

          {modalDomain === 'mock' && (<>
          {/*
            ## 모의고사 예상 — 내신 예측 **밖에** 둔다 (2026-09-05 사용자 지시)

            종전에는 학기별 내신 예측 상자 **안에** 모의 구획이 들어 있었다. 그런데 둘은
            산출 경로가 다르다 — 내신은 학기 전이 모델, 모의고사는 **내신↔모의 상관 모델**이다.
            상자 안에 있으면 "내신 예측의 일부"로 읽히고, 학기가 여럿인 1·2학년에서는 같은
            설명이 카드마다 반복된다. 별도 섹션으로 빼서 **한 번만** 설명하고 학기를 나열한다.
          */}
          {studentDetail.student.predictions.some(p => p.mock_prediction) && (
            <div className="bg-slate-100/70 rounded-lg border border-slate-200/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <p className="text-xs font-semibold text-slate-700">모의고사 예상</p>
                {/* 백분위는 국어·수학만 존재한다(영어는 절대평가) — 척도는 헤더 토글을 따른다 */}
                <span className="text-[10px] text-muted-foreground">
                  백분위 척도에서는 국어·수학만 백분위로 바뀝니다
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground mb-2 leading-relaxed">
                내신 예측과 <span className="font-medium text-slate-600">다른 경로</span>로 나온 값입니다 —
                졸업생·상급생에게서 배운 <span className="font-medium text-slate-600">내신↔모의고사 상관</span>에
                이 학생의 <span className="font-medium text-slate-600">내신 예측</span>을 대입한 값을
                <span className="font-medium text-slate-600">본인 모의 이력</span>과 섞습니다 — 가중치는 과목마다
                다르고 표의 각 행이 밝힙니다.
                모의고사는 <span className="font-medium text-slate-600">전국 기준</span>이라 교내 상대평가인
                내신 등급과 뜻이 다릅니다.
                {/*
                  어느 모집단으로 맞춘 모델인지는 글로 밝혀야 한다(2026-09-05 사용자 지적).
                  3학년 6·9월은 재수생이 함께 응시해 같은 내신에도 등급이 나쁘게 나오는데,
                  종전엔 그 쌍이 1·2학년 회귀에 섞여 상위권 예측이 +0.24등급 밀렸다.
                */}
                {' '}상관은 <span className="font-medium text-slate-600">모집단별로 따로</span> 맞춥니다 —
                1·2학년은 <span className="font-medium text-slate-600">재학생만 응시한 회차</span>로,
                3학년은 <span className="font-medium text-slate-600">6·9월 평가원(재수생 포함)</span> 회차로.
                그래서 1·2학년 예상에는 재수생 유입 효과가 들어가지 않습니다.
              </p>

              <div className="space-y-1.5">
                {studentDetail.student.predictions
                  .filter(pred => pred.mock_prediction)
                  .map(pred => {
                    const mp = pred.mock_prediction!;
                    const orig = predictionData?.students.find(ps => ps.id === selectedStudent);
                    const sems = orig ? Object.keys(orig.current_grades).sort() : [];
                    const curOf = (pick: (g: Record<string, unknown>) => unknown) => {
                      for (let i = sems.length - 1; i >= 0; i -= 1) {
                        const v = pick((orig?.current_grades[sems[i]] ?? {}) as Record<string, unknown>);
                        if (v != null) return v as number;
                      }
                      return null;
                    };
                    const keys = Object.keys(mp.subjects ?? {});
                    const anyPct = keys.some(k => pred.mock_percentile_prediction?.subjects?.[k] != null);
                    return (
                      <div key={`mk-${pred.semester}`}
                        className="rounded-md bg-white/70 border border-slate-200/60 px-2 py-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-1">
                          <p className="text-[11px] font-semibold text-slate-600">{pred.semester} 시기</p>
                          <p className="text-[11px]">
                            <span className="text-muted-foreground">국·수·영 평균 </span>
                            <span className={cn('font-semibold', gradeColor(mp.grade))}>
                              {mp.grade.toFixed(2)}등급
                            </span>
                            {(() => {
                              const cur = curOf(g => g.mock);
                              return cur != null ? (
                                <span className="text-muted-foreground ml-1 text-[10px]">
                                  (직전 {cur.toFixed(1)})
                                </span>
                              ) : null;
                            })()}
                          </p>
                        </div>
                        {keys.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-[9px] text-muted-foreground border-b border-slate-200">
                                  <th className="text-left py-0.5 pr-2 font-medium">과목</th>
                                  {/*
                                    ## 척도 토글이 이 표에도 적용된다 (2026-09-05 사용자 요청)
                                    계산은 백분위(국·수)·원점수(영어)로 하고 등급은 표시값이므로,
                                    **백분위를 고르면 계산에 실제로 쓴 값**을 그대로 보여 준다.
                                    영어는 절대평가라 백분위가 없어 그 자리에 원점수가 온다.
                                  */}
                                  <th className="text-center py-0.5 px-1 font-medium">
                                    {trendScale === 'percentile' ? '예상 위치' : '예상 등급'}
                                  </th>
                                  {/*
                                    ## 근거를 같은 행에, **규칙대로** 둔다 (2026-09-05)
                                    예상값은 두 재료의 가중 합이고 가중치는 과목·이력에 따라 다르다
                                    (`basis`). 이력이 두 학기면 0.8/0.2, 한 학기뿐이면 0.7/0.3.
                                    열 라벨이 고정 수치를 말하면 표가 쓰지도 않는 공식을 설명하게
                                    되므로 행마다 밝힌다.

                                    **회귀 가중치는 백분위 전환과 함께 되살아났다** — 등급 공간에서
                                    국·수가 ×0 이었던 것은 등급이 상위권을 뭉개 회귀가 그들을 또래
                                    평균으로 끌어내렸기 때문이다. 입력·출력을 모두 백분위로 바꾸자
                                    세 과목 모두 w=0.2~0.3 이 확정 개선으로 뒤집혔다.
                                  */}
                                  {/*
                                    ## 단위를 머리글이 말한다 (2026-09-05 사용자 혼동)
                                    `내신 회귀 2.47`(등급) 바로 옆에 `예상 백분위 99.2`(백분위)가 붙어
                                    있어 "둘이 모순 아니냐"로 읽혔다. 척도가 다른 열이 인접하면
                                    단위를 적어야 한다.
                                  */}
                                  <th className="text-center py-0.5 px-1 font-medium border-l border-slate-200"
                                    title="이 학생의 모의 이력 — 국·수는 직전 두 학기 평균, 영어는 그 평균에 0.8">
                                    본인 이력 <span className="font-normal">
                                      ({trendScale === 'percentile' ? '계산값' : '등급'})</span>
                                  </th>
                                  <th className="text-center py-0.5 px-1 font-medium"
                                    title="그 학기 내신 예측(수강 집단 보정 후 전교 백분위)을 내신↔모의 직선에 넣은 값. 그 위치의 학생들이 평균적으로 받은 모의 성적이라, 같은 내신이라도 모의를 훨씬 잘 보는 학생에게는 낮게 나온다">
                                    내신 회귀 <span className="font-normal">
                                      ({trendScale === 'percentile' ? '계산값' : '등급'})</span>
                                  </th>
                                  {anyPct && (
                                    <th className="text-center py-0.5 px-1 font-medium border-l border-slate-200">
                                      예상 백분위 <span className="font-normal">(0~100)</span>
                                    </th>
                                  )}
                                  {anyPct && (
                                    <th className="text-center py-0.5 px-1 font-medium">직전 백분위</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {keys.map(key => {
                                  const val = mp.subjects![key];
                                  const pctPred = pred.mock_percentile_prediction?.subjects?.[key] ?? null;
                                  const curG = curOf(g =>
                                    (g.mock_subjects as Record<string, number> | undefined)?.[key]);
                                  const curP = curOf(g =>
                                    (g.mock_percentile as Record<string, number> | undefined)?.[key]);
                                  return (
                                    <tr key={`mk-${pred.semester}-${key}`}
                                      className="border-b border-slate-100 last:border-0">
                                      <td className="py-0.5 pr-2 text-muted-foreground whitespace-nowrap">
                                        {mockSubjectLabel(key)}
                                      </td>
                                      {(() => {
                                        /*
                                          백분위 척도에서는 **계산에 실제로 쓴 값**을 낸다 —
                                          국·수는 모의 백분위(클수록 우수), 영어는 원점수.
                                          옛 스냅샷에는 `space` 가 없으므로 등급으로 떨어진다.
                                        */
                                        const unitKey = val.space === 'raw' ? 'raw_score'
                                          : val.space === 'pct' ? 'percentile' : null;
                                        const showUnit = trendScale === 'percentile' && unitKey;
                                        const uv = showUnit
                                          ? (val as unknown as Record<string, number | null>)[unitKey!]
                                          : null;
                                        return (
                                          <td className="text-center py-0.5 px-1">
                                            {showUnit && uv != null ? (
                                              <>
                                                <span className="font-semibold text-violet-700">{uv.toFixed(1)}</span>
                                                <span className="block text-[8px] leading-tight text-muted-foreground">
                                                  {val.space === 'raw' ? '점' : '백분위'}
                                                </span>
                                              </>
                                            ) : (
                                              <span className={cn('font-semibold', gradeColor(val.grade))}>
                                                {val.grade.toFixed(2)}
                                              </span>
                                            )}
                                          </td>
                                        );
                                      })()}
                                      {(() => {
                                        /*
                                          가중치는 산출물이 준 `w_reg` 를 그대로 적는다 — 국·수/영어·이력 1학기/2학기·
                                          3-1 목표마다 값이 달라(스윕으로 정한 표) 이름에서 추측하면 틀린다.
                                          `w_reg` 가 없는 옛 스냅샷만 종전 규칙(0.6/0.4)으로 표기한다.
                                        */
                                        const basis = val.basis ?? (curG != null ? 'last+reg' : 'reg');
                                        const histLabel = basis.startsWith('hist2') ? '2학기 평균'
                                          : basis === 'reg' ? '없음' : '직전 학기';
                                        const wr = val.w_reg ?? (basis === 'reg' ? 1 : basis.endsWith('+reg') ? 0.4 : 0);
                                        const wh = Math.round((1 - wr) * 100) / 100;
                                        /* 척도가 백분위면 계산 공간의 재료를 그대로 쓴다 */
                                        const unitKey = val.space === 'raw' ? 'raw_score'
                                          : val.space === 'pct' ? 'percentile' : null;
                                        const useUnit = trendScale === 'percentile' && !!unitKey;
                                        const raw = val as unknown as Record<string, number | null | undefined>;
                                        const pick = (base: string) => useUnit
                                          ? raw[`${base}_${unitKey}`] ?? null
                                          : (raw[base] as number | null | undefined) ?? null;
                                        const histVal = val.basis
                                          ? (pick('hist') ?? pick('last')) : (useUnit ? null : curG);
                                        const regVal = pick('reg')
                                          ?? (useUnit ? null : pred.grades?.[key]?.grade ?? null);
                                        const fmt = (v: number) => useUnit ? v.toFixed(1) : v.toFixed(2);
                                        const sub = (t: string) => (
                                          <span className="block text-[8px] leading-tight text-muted-foreground">{t}</span>
                                        );
                                        return (
                                          <>
                                            <td className="text-center py-0.5 px-1 border-l border-slate-100">
                                              {histVal != null ? (
                                                <>
                                                  <span className="font-medium text-slate-700">{fmt(histVal)}</span>
                                                  {sub(`${histLabel} ×${wh}`)}
                                                </>
                                              ) : (
                                                <span className="text-[9px] text-muted-foreground"
                                                  title="모의 이력이 없어 내신 회귀값만 씁니다">없음</span>
                                              )}
                                            </td>
                                            <td className={cn('text-center py-0.5 px-1', wr === 0 && 'text-muted-foreground')}>
                                              {regVal != null ? (
                                                <>
                                                  <span className={cn(wr === 0 ? 'line-through opacity-60' : 'font-medium')}
                                                    title={wr === 0
                                                      ? '이 재료는 이번 예상에 쓰이지 않았습니다'
                                                      : `${pred.semester} 내신 예측을 회귀에 넣은 값`}>
                                                    {fmt(regVal)}
                                                  </span>
                                                  {sub(wr === 0 ? '쓰지 않음' : `×${wr}`)}
                                                </>
                                              ) : (
                                                <span className="text-muted-foreground">-</span>
                                              )}
                                            </td>
                                          </>
                                        );
                                      })()}
                                      {anyPct && (
                                        <td className="text-center py-0.5 px-1 border-l border-slate-100">
                                          {pctPred != null ? (
                                            <span className="font-semibold text-violet-600">
                                              {pctPred.toFixed(1)}
                                            </span>
                                          ) : (
                                            /* 영어는 절대평가라 백분위가 존재하지 않는다 */
                                            <span className="text-[9px] text-muted-foreground">절대평가</span>
                                          )}
                                        </td>
                                      )}
                                      {anyPct && (
                                        <td className="text-center py-0.5 px-1 text-muted-foreground">
                                          {curP != null ? curP.toFixed(1) : '-'}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              {/*
                ## 무엇으로 예상했는지 — 내신 표와 같은 수준으로 적는다 (2026-09-05 사용자 지적)
                내신 예측 아래에는 각 열이 무엇인지 한 문단씩 있는데 모의고사 쪽에는 없었다.
                같은 화면에서 한쪽만 설명이 있으면 나머지는 근거 없는 숫자로 읽힌다.
              */}
              <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground leading-relaxed">
                <p>
                  <span className="font-medium text-slate-600">예상 등급</span> = 졸업생·상급생에게서 배운{' '}
                  <span className="font-medium text-slate-600">내신 → 모의고사 회귀</span>에 이 학생의 그 학기
                  내신 예측을 대입한 값입니다. 내신 예측과는 <span className="font-medium text-slate-600">다른
                  모델</span>이라 두 값이 어긋날 수 있고, 그 어긋남 자체가 정보입니다(내신에 비해 모의가
                  약한 학생 / 그 반대).
                </p>
                {/*
                  ## 규칙이 과목마다 다른 이유 — 그리고 왜 되살아났는가 (2026-09-05)

                  ① 등급 공간에서는 "직전 0.6 + 회귀 0.4"가 상위권을 계통적으로 나쁘게 예측했다
                     (25학번 홀드아웃, 직전 모의 ≤1.5등급: 편향 국어 +0.56 · 수학 +0.50) → w=0 이 이겼다.
                  ② **백분위로 옮기자 뒤집혔다.** 등급이 상위권을 뭉개는 것이 원인이었기 때문이다 —
                     1등급 한 칸에 백분위 96~100 이 다 들어가니 회귀가 그 안의 위치를 못 보고
                     또래 평균으로 끌어내렸다. 입력을 `pct_adj`(수강 집단 보정 후 전교 위치)로,
                     출력을 과목 공간(국·수 백분위 · 영어 원점수)으로 바꾸자 세 과목 모두
                     w=0.2~0.3 이 **확정 개선**이 됐다(new_space_sweep).
                  ③ R² 도 함께 올랐다: 국어 0.576→0.638 · 수학 0.726→0.779 · 영어 0.691→0.730.
                */}
                <p>
                  <span className="font-medium text-slate-600">예상값 = (1−w) × 본인 이력 + w × 내신 회귀</span>이고
                  w 는 표의 각 칸에 적혀 있습니다. 이력이 <span className="font-medium text-slate-600">두 학기면
                  w=0.2</span>, <span className="font-medium text-slate-600">한 학기뿐이면 w=0.3</span>(재료가
                  적을수록 회귀에 더 기댑니다), 3학년 6·9월 목표는 과목 무관 w=0.2 입니다.
                </p>
                {/*
                  ## "비슷한 백분위 학생들의 평균"인가? — 정확히는 아니다 (2026-09-05 사용자 질문)

                  구현은 **단변량 최소제곱 직선**이다: `모의 = coef × 내신백분위 + intercept`.
                  이웃을 묶어 평균 내는 절차가 없으므로 **"비슷한"의 기준(구간 폭·이웃 수) 자체가
                  존재하지 않는다**. 어떤 학생의 값은 그 직선 위의 한 점이다.

                  다만 최소제곱 직선은 **조건부 평균의 선형 추정**이라 뜻으로는 "그 위치 학생들의
                  평균"이 맞다. 그래서 실제로 이웃을 묶는 쪽이 더 나은지 재 봤다
                  (`scripts/mock-corr-probe/reg_linearity.py`, 코호트 시간외 · 학생 단위 쌍 부트스트랩):

                    국어  직선 10.26%p · 5%p구간평균 −0.01 [−0.25,+0.23] · knn50 +0.05 · 등위 +0.01
                    수학  직선 10.26%p · 5%p구간평균 −0.01 · knn50 +0.05 · knn200 +0.08 · 등위 +0.01
                    영어  직선 7.49점 · 5%p구간평균 +0.08 · knn50 −0.08 · knn200 −0.04 · 등위 −0.17

                  **넷 다 신뢰구간이 0 을 걸쳐 차이가 확인되지 않는다.** 구간별 실제 평균과 직선의
                  차이도 −3.5~+4.0%p 안에 머물고 한쪽으로 굽지 않는다 — 관계가 실제로 곧아서
                  직선이 이미 그 평균을 잘 요약한다는 뜻이다. 그래서 직선을 유지한다(재료가 적은
                  구간에서도 흔들리지 않고, 미래 백분위처럼 학습 표본 밖 값에도 답을 낸다).
                */}
                <p>
                  <span className="font-medium text-slate-600">내신 회귀</span>는 이 학생의 그 학기 내신
                  예측(<span className="font-medium text-slate-600">수강 집단 보정 후 전교 백분위</span>)을
                  졸업생·상급생에게서 배운 <span className="font-medium text-slate-600">내신↔모의 직선</span>에
                  대입한 값입니다. 등급이 아니라 백분위가 입력이므로 1등급 안에서도 위치에 따라 값이 달라집니다.
                </p>
                <p>
                  이 직선은 <span className="font-medium text-slate-600">그 위치 학생들이 평균적으로 받은 모의
                  성적</span>이지 개인의 실력이 아닙니다 — 같은 내신이라도 모의를 훨씬 잘 보는 학생에게는
                  낮게 나옵니다(실측: 내신 국어 1등급인 학생들의 모의가 1~5등급으로 퍼져 있습니다).
                  그래서 본인 이력이 있으면 이력이 8할을 갖고, 회귀는 나머지를 채우는 보조 재료입니다.
                  <span className="font-normal text-muted-foreground"> (이웃을 실제로 묶어 평균 내는 방식과도
                  비교했지만 세 과목 모두 차이가 확인되지 않았습니다 — 관계가 곧아 직선으로 충분합니다.)</span>
                </p>
                <p>
                  <span className="font-medium text-slate-600">예상 백분위</span>는 <span className="font-medium
                  text-slate-600">국어·수학만</span> 냅니다. 등급은 9칸뿐이라 같은 등급 안의 차이가 사라지는데
                  백분위는 그 위치를 그대로 말합니다. 영어·한국사는 절대평가라 백분위가 존재하지 않습니다.
                </p>
                <p>
                  ⚠️ 모의고사는 <span className="font-medium text-slate-600">전국 기준</span>이라 교내 상대평가인
                  내신 등급과 뜻이 다릅니다. 그리고 3학년 6·9월은 졸업생이 함께 응시해 응시 집단 자체가
                  바뀝니다 — 학년 안에서 회차를 비교할 때 이 차이를 함께 보십시오.
                </p>
              </div>
            </div>
          )}

            {/*
              수능 예상이 없는 학생(6·9월 기록이 모두 없는 경우, 라이브 217명 중 20명)에게는
              카드 자체가 그려지지 않으므로 흐름을 **바깥에 단독으로** 낸다. 카드 안에만 두면
              그 학생들은 3년 궤적을 통째로 잃는다.
            */}
            {!(studentDetail.forecast && studentDetail.forecast.subjects.length > 0) && (
              <KeyExamFlowStepper
                student={studentDetail.student}
                septCores={studentDetail.septCores}
                septPcts={studentDetail.septPcts}
                juneCores={studentDetail.juneCores}
                septOfficial={studentDetail.septOfficial}
                forecast={studentDetail.forecast}
                scrollRef={flowScrollRef}
              />
            )}

            {/* 3-2(수능) 예상 — 위의 학기 예측(내신 MLP 산출물)과 **다른 출처**라 카드를 따로 둔다.
                3학년 2학기에는 내신이 없고 9월은 이미 실측이라, 이 카드가 답하는 것은
                "수능에 이 성적으로 가는가" 하나다. 값은 **백분위**가 본체이고 등급은 거기서 유도한다. */}
            {studentDetail.forecast && studentDetail.forecast.subjects.length > 0 && (() => {
              const fc = studentDetail.forecast;
              const bases = new Set(fc.subjects.map(x => x.basis));
              /*
                근거 문구는 **실제로 쓴 것**을 말해야 한다. 전 회차 모드에서도 그 과목이 코호트
                문맥에 없으면 조용히 평가원 2회로 떨어지므로, 모드 이름만 적으면 거짓이 된다.
              */
              const basisLabel =
                suneungMode === 'all-rounds'
                  ? '3·5·6·7·9월을 회차별로 표준화해 섞고 9월 분포로 되돌림'
                : bases.size > 1 ? '과목마다 근거가 다름'
                : bases.has('blend') ? `9월 ${SUNEUNG_W_SEPT.toFixed(1)} + 6월 ${SUNEUNG_W_JUNE.toFixed(1)} 가중 평균`
                : bases.has('september') ? '9월 단독 (6월 기록 없음)'
                : '6월 단독 (9월 기록 없음)';
              return (
                <div className="bg-violet-50/50 rounded-lg p-3 border border-violet-100">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    {/*
                      ## 근거 문구를 제목 줄에서 뺐다 (2026-09-05 사용자 지적)
                      전 회차 모드의 문구가 길어(3·5·6·7·9월을 …) 제목 줄을 밀어내는 바람에
                      오른쪽 [백분위 평균 · 국수영 평균]이 **한 줄 아래로 떨어졌다**. 모드를
                      바꿨다고 숫자 자리가 움직이면 두 모드를 비교할 수가 없다. 제목 줄은
                      짧게 고정하고 문구는 아래 자기 줄에 둔다(길이가 자라도 안전하다).
                    */}
                    <div className="min-w-0">
                      {/* 수능 예상은 학습된 모델이 아니라 회차 혼합 **규칙**이다 — 배지가 그걸 말한다 */}
                      <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                        3-2 예상 (수능)
                        <SourceBadge kind="rule" />
                      </p>
                      {/*
                        두 방식을 **모두** 제공한다(2026-09-05 사용자 결정). 9월을 대리 과제로 잰
                        실측에서는 회차를 더 섞을수록 좋았지만(6월만 0.773 -> 3·5·6·7월 0.624),
                        수능이 아니라 9월로 잰 결과의 유추 이전이라 어느 쪽을 볼지는 사용자가 고른다.
                      */}
                      <div className="mt-1 flex gap-1">
                        {(['pyeonggawon', 'all-rounds'] as SuneungMode[]).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSuneungMode(m)}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] border transition-colors',
                              suneungMode === m
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white text-violet-600 border-violet-200 hover:bg-violet-50'
                            )}
                          >
                            {SUNEUNG_MODE_LABEL[m]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {fc.averagePercentile != null && (
                        <span>
                          <span className="text-muted-foreground">백분위 평균: </span>
                          <span className="font-semibold text-violet-700">{fc.averagePercentile.toFixed(1)}</span>
                        </span>
                      )}
                      {fc.coreAverageGrade != null && (
                        <span>
                          <span className="text-muted-foreground">국수영 평균: </span>
                          <span className={`font-semibold ${gradeColor(fc.coreAverageGrade)}`}>
                            {fc.coreAverageGrade.toFixed(2)}등급
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 무엇을 섞어 낸 값인지 — 길어도 제목 줄을 밀지 않도록 자기 줄에 둔다 */}
                  <p className="mb-2 text-[10px] leading-snug text-violet-500">{basisLabel}</p>

                  {/* 과목별 — 백분위가 본체, 괄호가 유도 등급. 6·9월 실측을 함께 두어 근거를 보인다 */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground border-b border-violet-200/60">
                          <th className="text-left py-1 pr-2">과목</th>
                          <th className="text-center py-1 px-1">6월</th>
                          <th className="text-center py-1 px-1">9월</th>
                          <th className="text-center py-1 px-1 font-semibold text-violet-700">수능 예상</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fc.subjects.map(sub => {
                          /*
                            ## 절대평가는 백분위 척도에서 **원점수**를 보여 준다 (2026-09-05 사용자 지시)

                            영어·한국사는 백분위가 원리적으로 없다(성적표에도 전 회차 null).
                            그래서 척도를 백분위로 두면 그 자리가 빈 채 등급만 남았는데,
                            **만점이 전 회차 고정**(영어 100 · 한국사 50)이라 원점수가 회차를
                            가로질러 그대로 비교되므로 그 자리에 원점수를 놓는 것이 맞다.
                            예상값 자체도 이제 원점수를 섞어 만든다(`suneungForecast`).
                          */
                          const showRaw = trendScale === 'percentile' && sub.scale === 'grade';
                          const cell = (pt: { percentile: number | null; grade: number | null;
                                              rawScore?: number | null } | null) => {
                            if (!pt) return <span className="text-slate-300">-</span>;
                            if (sub.scale === 'percentile' && pt.percentile != null) {
                              return (
                                <>
                                  <span className="font-medium">{pt.percentile.toFixed(1)}</span>
                                  {pt.grade != null && (
                                    <span className="text-[9px] text-muted-foreground ml-0.5">({pt.grade}등급)</span>
                                  )}
                                </>
                              );
                            }
                            if (showRaw && pt.rawScore != null) {
                              return (
                                <>
                                  <span className="font-medium">{pt.rawScore}점</span>
                                  {pt.grade != null && (
                                    <span className="text-[9px] text-muted-foreground ml-0.5">({pt.grade}등급)</span>
                                  )}
                                </>
                              );
                            }
                            return pt.grade != null
                              ? <span className="font-medium">{pt.grade.toFixed(1)}등급</span>
                              : <span className="text-slate-300">-</span>;
                          };
                          return (
                            <tr key={sub.subject} className="border-b border-violet-100/60 last:border-0">
                              <td className="py-1 pr-2 whitespace-nowrap">
                                {sub.subject}
                                <span className="text-[9px] text-muted-foreground ml-1">{sub.area}</span>
                              </td>
                              <td className="text-center py-1 px-1 text-slate-600">{cell(sub.june)}</td>
                              <td className="text-center py-1 px-1 text-slate-600">{cell(sub.september)}</td>
                              <td className="text-center py-1 px-1">
                                {sub.scale === 'percentile' && sub.percentile != null ? (
                                  <>
                                    <span className="font-bold text-violet-700">{sub.percentile.toFixed(1)}</span>
                                    {sub.grade != null && (
                                      <span className={`text-[9px] ml-0.5 ${gradeColor(sub.grade)}`}>({sub.grade}등급)</span>
                                    )}
                                  </>
                                ) : showRaw && sub.rawScore != null ? (
                                  <>
                                    <span className="font-bold text-violet-700">{sub.rawScore}점</span>
                                    {sub.rawMax != null && (
                                      <span className="text-[9px] text-muted-foreground">/{sub.rawMax}</span>
                                    )}
                                    {sub.grade != null && (
                                      <span className={`text-[9px] ml-0.5 ${gradeColor(sub.grade)}`}>({sub.grade}등급)</span>
                                    )}
                                  </>
                                ) : sub.grade != null ? (
                                  <>
                                    <span className={`font-bold ${gradeColor(sub.grade)}`}>{sub.grade.toFixed(1)}등급</span>
                                    {/* 원점수로 계산했으면 그 사실을 밝힌다 — 등급만 섞은 것과 근거가 다르다 */}
                                    {sub.rawScore != null && (
                                      <span className="text-[9px] text-muted-foreground ml-0.5">
                                        ({sub.rawScore}점)
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/*
                    ## 흐름 스텝퍼를 이 카드 **안**에 둔다 (2026-09-05 사용자 지시)
                    수능 예상은 "6·9월을 섞은 값"인데, 그 6·9월이 어떻게 흘러왔는지가
                    바로 위 표와 떨어져 있으면 근거를 눈으로 잇지 못한다. 같은 카드에 두면
                    [흐름 → 예상]이 한 덩어리로 읽힌다.
                  */}
                  <KeyExamFlowStepper
                    student={studentDetail.student}
                    septCores={studentDetail.septCores}
                    septPcts={studentDetail.septPcts}
                    juneCores={studentDetail.juneCores}
                    septOfficial={studentDetail.septOfficial}
                    forecast={studentDetail.forecast}
                    scrollRef={flowScrollRef}
                    embedded
                  />

                  <p className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
                    국어·수학·탐구는 <span className="font-medium">백분위</span>(괄호는 거기서 유도한 등급),
                    영어·한국사는 절대평가라 <span className="font-medium">등급만</span> 냅니다.
                    {studentDetail.septOfficial ? (
                      <>9월 백분위는 <span className="font-medium">공식 성적</span>입니다.</>
                    ) : (
                      <>9월 백분위는 원점수를 <span className="font-medium">EBS 예상 등급컷</span>에 대조해 근사한 값이라
                      공식 백분위가 아닙니다(6월 공식 데이터로 잰 보간 오차 평균 0.9백분위, 다만 컷 자체의 오차가 더해집니다).</>
                    )}
                    탐구는 6·9월 과목이 같을 때만 두 회차를 섞고 <span className="font-medium">바꿨으면 9월만</span> 씁니다.
                    이 값은 <span className="font-medium">학습된 모델이 아니라 규칙</span>입니다 — 졸업생에게 수능 기록이
                    0건이라 어떤 배합이 수능을 잘 맞히는지 확인할 방법이 아직 없습니다.
                  </p>
                </div>
              );
            })()}
          </>)}

          {/*
            ## 추이 차트는 **왼쪽 패널 맨 아래** (2026-09-05 사용자 지시)
            차트는 결론이 아니라 **확인**이다 — 예측 근거·학기별 표를 읽고 나서
            "그래서 흐름이 어떤가"를 보는 자리다. 맨 위에 두면 세로로 큰 그림이
            먼저 나와 정작 숫자를 보려면 매번 지나쳐야 한다.
          */}
          {/*
            ## 내신 차트와 모의고사·수능 차트를 나눈다 (2026-09-05 사용자 지시)

            종전에는 한 차트에 교과군 5 + 전체 + 모의 + 수능이 함께 있어 **선 7~9개가 겹쳤다**.
            게다가 둘은 **축의 뜻이 다르다** — 내신은 교내 상대평가, 모의고사는 전국 기준이다.
            같은 y축에 그리면 "3등급"이 같은 것을 뜻하는 것처럼 보이는데 그렇지 않다.

            **척도 토글(등급/백분위)** 은 두 차트에 함께 적용된다. 등급은 칸이 9개(또는 5개)뿐이라
            같은 등급 안의 움직임이 사라지는데, 백분위로 보면 그 움직임이 드러난다.
              · 내신 백분위 = **수강 집단 보정본**(전교 능력 위치) — 학기·과목 구성을 가로질러 비교된다
              · 모의 백분위 = **국어·수학만**(영어는 절대평가라 백분위가 없다)
            축 방향도 다르다 — 등급은 작을수록 좋아 뒤집고, 백분위는 클수록 좋아 뒤집지 않는다.
          */}
          {(() => {
            const isPct = trendScale === 'percentile';
            /*
              ## 축 방향 — **위 = 잘함**을 두 차트에서 지킨다 (2026-09-05 사용자 지적)

              두 백분위는 **뜻이 반대**다. 내신은 우리가 만든 **상위 %**(작을수록 좋음)이고,
              모의고사는 성적표에 적히는 **전국 백분위**(클수록 좋음)다. 한 규칙으로 그리면
              한쪽이 반드시 거꾸로 선다 — 그래서 축을 차트마다 정한다.
              등급도 작을수록 좋아 뒤집으므로, 결과적으로 **어느 척도에서나 위가 잘한 쪽**이다.
            */
            const naesinY = isPct
              ? { domain: [0, 100] as [number, number], reversed: true }    // 상위 % — 작을수록 위
              : { domain: [1, analysis.maxGrade] as [number, number], reversed: true };
            const mockY = isPct
              ? { domain: [0, 100] as [number, number], reversed: false }   // 전국 백분위 — 클수록 위
              : { domain: [1, analysis.maxGrade] as [number, number], reversed: true };
            const unit = isPct ? '%' : '등급';
            const fmt = (v: number) => (v == null ? '-' : `${v.toFixed(isPct ? 0 : 2)}${unit}`);
            const rows = studentDetail.trendData;
            const lastSem = studentDetail.lastCurrentSem;
            /* 내신은 3-1 에서 끝나고 모의는 수능까지 간다 — 각자 값이 있는 행만 그린다 */
            const naesinRows = rows.filter(r =>
              FEATURE_KEYS.some(k => r[isPct ? `pct_${k}` : k] != null));
            const mockRows = rows.filter(r =>
              r.mock != null || MOCK_SUBJECT_KEYS.some(k => r[isPct ? `mockpct_${k}` : `mock_${k}`] != null));

            const bandKey = isPct ? 'overallPctBand' : 'overallBand';
            const gradeBandsFor = (kind: 'naesin' | 'mock'): readonly (readonly [number, number, string])[] => {
              if (!isPct) {
                return [[1, Math.min(3, analysis.maxGrade), '#10b981'],
                        [Math.min(3, analysis.maxGrade), Math.min(6, analysis.maxGrade), '#f59e0b'],
                        [Math.min(6, analysis.maxGrade), analysis.maxGrade, '#f43f5e']];
              }
              // 상위 % 는 작을수록 좋고 전국 백분위는 클수록 좋다 — 밴드도 반대로 깔린다
              return kind === 'naesin'
                ? [[0, 23, '#10b981'], [23, 60, '#f59e0b'], [60, 100, '#f43f5e']]
                : [[77, 100, '#10b981'], [40, 77, '#f59e0b'], [0, 40, '#f43f5e']];
            };

            /*
              ## 과목 선택기는 **그 차트 머리에** 둔다 (2026-09-05 사용자 지적)
              종전엔 통합 선택기 하나가 위에 있어 어느 차트를 바꾸는지 알 수 없었고, 내신 교과군과
              모의 과목이 한 줄에 섞여 있었다. 차트마다 자기 계열만 켜고 끈다.
            */
            const SeriesToggle = ({ keys }: { keys: string[] }) => (
              <div className="flex flex-wrap items-center gap-1">
                {keys.map(k => {
                  const { label, color } = trendSeriesMeta(k);
                  const on = visibleSubjects.has(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        const next = new Set(visibleSubjects);
                        if (next.has(k)) next.delete(k); else next.add(k);
                        setVisibleSubjects(next);
                      }}
                      className={cn('px-1.5 py-0.5 text-[10px] rounded-full border transition-colors',
                        on ? 'text-white border-transparent' : 'bg-white/50 text-slate-400 border-slate-200')}
                      style={on ? { backgroundColor: color } : undefined}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );

            const predictionShade = (data: Record<string, any>[]) =>
              lastSem && data.length > 1 && data.some(r => r.semester === lastSem) ? (
                <ReferenceArea
                  x1={lastSem}
                  x2={data[data.length - 1].semester as string}
                  fill="#6366f1"
                  fillOpacity={0.06}
                />
              ) : null;

            return (
              <div className="space-y-3">
                {/*
                  척도 토글은 **모달 헤더 오른쪽 위 하나**뿐이다(2026-09-05 사용자 지시).
                  구획마다 두면 조작 지점이 넷이 되어 "지금 무엇에 걸린 토글인가"를 잃는다.
                */}

                {/* ── 내신 ── (영역 토글이 고른 쪽만 그린다) */}
                {modalDomain === 'naesin' && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-0.5">
                    <p className="text-[11px] font-semibold text-slate-600">
                      내신 <span className="font-normal text-muted-foreground">
                        (교내 상대평가{isPct ? ' · 상위 % — 작을수록 위' : ''})
                      </span>
                    </p>
                    <SeriesToggle keys={FEATURE_KEYS.filter(k => k !== 'overall')} />
                  </div>
                  {naesinRows.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-6 text-center">
                      {isPct ? '이 스냅샷에는 내신 백분위가 없습니다(옛 산출물).' : '내신 기록이 없습니다.'}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={naesinRows} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
                        <YAxis {...naesinY} tick={{ fontSize: 11 }} />
                        {gradeBandsFor('naesin').map(([y1, y2, fill], i) => (
                          <ReferenceArea key={`nb-${i}`} y1={y1 as number} y2={y2 as number}
                            fill={fill as string} fillOpacity={0.045} />
                        ))}
                        {predictionShade(naesinRows)}
                        {/* 전체평균 80% 예측구간 — 점만 찍으면 소수점 두 자리가 그대로 믿긴다 */}
                        <Area type="monotone" dataKey={bandKey} stroke="none" fill="#1e293b"
                          fillOpacity={0.12} connectNulls isAnimationActive={false}
                          legendType="none" tooltipType="none" />
                        {lastSem && (
                          <ReferenceLine x={lastSem} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5}
                            label={{ value: '예측→', position: 'top', fill: '#6366f1', fontSize: 10 }} />
                        )}
                        <Tooltip formatter={(v: number, name: string) =>
                          [fmt(v), trendSeriesMeta(name.replace(/^pct_/, '')).label]} />
                        <Legend formatter={(v: string) => trendSeriesMeta(v.replace(/^pct_/, '')).label} />
                        {FEATURE_KEYS.filter(k => k !== 'overall' && visibleSubjects.has(k)).map(k => (
                          <Line key={k} {...drawLineProps} type="monotone"
                            dataKey={isPct ? `pct_${k}` : k}
                            stroke={trendSeriesMeta(k).color} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
                        ))}
                        {/*
                          전체평균 선은 빼 두었다(2026-09-05 사용자 결정) — 교과군 5개와 겹쳐
                          가장 굵은 선이 화면을 지배하는데, 정작 그 값은 **직전 학기 이월**이라
                          움직이지 않는다. 값 자체는 아래 표와 80% 구간 띠가 계속 낸다.
                        */}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                )}

                {/* ── 모의고사 · 수능 ── */}
                {modalDomain === 'mock' && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-0.5">
                    <p className="text-[11px] font-semibold text-slate-600">
                      모의고사 · 수능 <span className="font-normal text-muted-foreground">
                        (전국 기준{isPct ? ' · 전국 백분위 — 클수록 위 · 국어·수학만' : ''})
                      </span>
                    </p>
                    {/* 백분위 모드에서는 '전체(국·수·영 평균)' 선이 없으므로 토글도 감춘다 */}
                    <SeriesToggle keys={isPct
                      ? MOCK_SUBJECT_KEYS.map(k => `mock_${k}`)
                      : ['mock', ...MOCK_SUBJECT_KEYS.map(k => `mock_${k}`)]} />
                  </div>
                  {mockRows.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-6 text-center">모의고사 기록이 없습니다.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={mockRows} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
                        <YAxis {...mockY} tick={{ fontSize: 11 }} />
                        {gradeBandsFor('mock').map(([y1, y2, fill], i) => (
                          <ReferenceArea key={`mb-${i}`} y1={y1 as number} y2={y2 as number}
                            fill={fill as string} fillOpacity={0.045} />
                        ))}
                        {predictionShade(mockRows)}
                        {lastSem && mockRows.some(r => r.semester === lastSem) && (
                          <ReferenceLine x={lastSem} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5}
                            label={{ value: '예측→', position: 'top', fill: '#6366f1', fontSize: 10 }} />
                        )}
                        <Tooltip formatter={(v: number, name: string) =>
                          [fmt(v), trendSeriesMeta(name.replace(/^mockpct_/, 'mock_')).label]} />
                        <Legend formatter={(v: string) => trendSeriesMeta(v.replace(/^mockpct_/, 'mock_')).label} />
                        {/* 전체(국·수·영 평균)는 등급으로만 있다 — 백분위 평균은 영어가 빠져 뜻이 달라진다 */}
                        {!isPct && visibleSubjects.has('mock') && (
                          <Line {...fadeLineProps} type="monotone" dataKey="mock" stroke="#8b5cf6"
                            strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#8b5cf6' }} connectNulls />
                        )}
                        {MOCK_SUBJECT_KEYS.filter(k => visibleSubjects.has(`mock_${k}`)).map(k => (
                          <Line key={`mock_${k}`} {...fadeLineProps} type="monotone"
                            dataKey={isPct ? `mockpct_${k}` : `mock_${k}`}
                            stroke={trendSeriesMeta(`mock_${k}`).color} strokeWidth={1.5}
                            strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                  {isPct && (
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      영어는 절대평가라 백분위가 존재하지 않아 이 척도에서는 선이 그려지지 않습니다.
                      국·수·영 평균도 영어가 빠지면 뜻이 달라져 등급 척도에서만 냅니다.
                    </p>
                  )}
                </div>
                )}
              </div>
            );
          })()}
                </div>

                <div className="space-y-4 min-w-0">
          {modalDomain === 'naesin' && (<>
          {/*
            ## 실측 내신 — 오른쪽 패널의 첫 칸

            모달에 **모의고사 실측은 있는데 내신 실측이 없었다**(사용자 지적). 예측을 읽으려면
            그 예측이 무엇에서 나왔는지가 옆에 있어야 하는데, 정작 재료인 내신 이력이 없었다.

            **왼쪽의 "현재 위치" 패널은 없앴다** — 같은 값(교과군별 백분위·보정)을 두 곳에서
            말하고 있었다(2026-09-05 사용자 지적). 위치는 실측의 일부이므로 이 표가 함께 낸다.

            학기를 누르면 **그 학기에 들은 과목**이 펼쳐진다 — 교과군 평균만으로는 "어느 과목이
            평균을 끌어내렸나"를 알 수 없고, 그게 상담에서 가장 먼저 나오는 질문이다.
          */}
          {(() => {
            const orig = studentDetail.student;
            const sems = Object.keys(orig.current_grades ?? {}).sort();
            if (sems.length === 0) return null;
            const cp = orig.current_percentile ?? {};
            const records = analysisData.find(d => d.id === orig.id)?.academic_development ?? [];
            const toggleSem = (sem: string) => {
              setExpandedNaesinSems(prev => {
                const next = new Set(prev);
                if (next.has(sem)) next.delete(sem); else next.add(sem);
                return next;
              });
            };
            return (
              <div className="bg-white/70 rounded-lg border border-slate-200/70 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
                  <p className="text-xs font-semibold text-slate-700">실측 내신 (학기별)</p>
                  <span className="text-[10px] text-muted-foreground">
                    이수단위 가중 평균 석차등급 · 아래 첨자는 그 과목 집단 안 상위 % → 전교 기준 ·
                    <span className="font-medium text-slate-600"> 행을 누르면 과목이 펼쳐집니다</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground border-b">
                        <th className="text-left py-1 pr-2 font-medium">학기</th>
                        {FEATURE_KEYS.map(k => (
                          <th key={`nh-${k}`} className="text-center py-1 px-1 font-medium whitespace-nowrap">
                            {k === 'overall' ? '전체평균' : SUBJECT_GROUP_LABELS[k]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sems.map(sem => {
                        const row = orig.current_grades[sem];
                        const pcts = cp[sem];
                        const open = expandedNaesinSems.has(sem);
                        const [sg, ss] = sem.split('-');
                        const subs = records
                          .filter(r => String(r.grade) === sg && String(r.semester) === ss)
                          .sort((a, b) => (b.units ?? 0) - (a.units ?? 0));
                        return (
                          <React.Fragment key={`n-${sem}`}>
                            {/*
                              ## 펼침은 **버튼**이어야 한다 (2026-09-06 적대적 검증)
                              `<tr onClick>` 은 키보드로 도달할 수 없고 스크린리더가 접힘
                              상태를 읽지 못한다. 행 전체를 클릭 대상으로 남기되(넓은 과녁),
                              첫 칸에 진짜 `<button aria-expanded>` 를 둬 키보드·보조기기 경로를
                              만든다. 버튼은 24px 이상 과녁을 갖는다(WCAG 2.2 target size).
                            */}
                            <tr
                              className={cn('border-b border-muted/30 cursor-pointer hover:bg-slate-50',
                                open && 'bg-slate-50')}
                              onClick={() => toggleSem(sem)}
                            >
                              <td className="py-1 pr-2 font-medium text-slate-600 whitespace-nowrap">
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  onClick={(e) => { e.stopPropagation(); toggleSem(sem); }}
                                  className="inline-flex items-center gap-0.5 min-h-[24px] px-0.5 -mx-0.5
                                             rounded hover:bg-slate-200/60 focus-visible:outline-none
                                             focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                  <ChevronDown className={cn('w-3 h-3 transition-transform',
                                    open ? 'rotate-0' : '-rotate-90')} />
                                  {sem}
                                  <span className="sr-only">{open ? ' 과목 접기' : ' 과목 펼치기'}</span>
                                </button>
                              </td>
                              {FEATURE_KEYS.map(k => {
                                const g = row?.[k] as number | undefined;
                                const p = pcts?.[k];
                                const shift = p?.pct_adj == null ? null : p.pct_adj - p.pct;
                                return (
                                  <td key={`n-${sem}-${k}`} className="text-center py-1 px-1 whitespace-nowrap">
                                    {/*
                                      척도 토글에 따라 **주 값과 부 값을 맞바꾼다**(차트와 같은 상태).
                                      둘 다 늘 보이므로 정보가 사라지지는 않고, 지금 무엇을 기준으로
                                      보고 있는지가 크기로 드러난다.
                                    */}
                                    {g == null && !p ? (
                                      <span className="text-muted-foreground">-</span>
                                    ) : trendScale === 'percentile' && p ? (
                                      <>
                                        <span className="font-semibold text-slate-700">
                                          {(p.pct_adj ?? p.pct).toFixed(0)}%
                                          {p.pct_adj != null && (
                                            <span className={cn('ml-0.5 text-[9px] font-normal',
                                              shift != null && shift <= -2 ? 'text-cyan-600'
                                                : shift != null && shift >= 2 ? 'text-orange-600'
                                                : 'text-muted-foreground')}>
                                              (원 {p.pct.toFixed(0)})
                                            </span>
                                          )}
                                        </span>
                                        {g != null && (
                                          <span className={cn('block text-[9px] leading-tight', gradeColor(g))}>
                                            {g.toFixed(2)}등급
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <span className={cn('font-semibold', g != null ? gradeColor(g) : '')}>
                                          {g != null ? g.toFixed(2) : '-'}
                                        </span>
                                        {p && (
                                          <span className="block text-[9px] leading-tight text-muted-foreground">
                                            {p.pct.toFixed(0)}%
                                            {p.pct_adj != null && (
                                              <span className={cn(
                                                shift != null && shift <= -2 ? 'text-cyan-600'
                                                  : shift != null && shift >= 2 ? 'text-orange-600'
                                                  : '')}>
                                                {'→'}{p.pct_adj.toFixed(0)}
                                              </span>
                                            )}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                            {open && (
                              <tr className="bg-slate-50/70">
                                <td colSpan={FEATURE_KEYS.length + 1} className="px-2 py-2">
                                  {subs.length === 0 ? (
                                    <p className="text-[10px] text-muted-foreground">이 학기의 과목 기록이 없습니다.</p>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="text-[9px] text-muted-foreground border-b border-slate-200">
                                          <th className="text-left py-0.5 pr-2 font-medium">과목</th>
                                          <th className="text-center py-0.5 px-1 font-medium">교과군</th>
                                          <th className="text-center py-0.5 px-1 font-medium">단위</th>
                                          <th className="text-center py-0.5 px-1 font-medium">원점수</th>
                                          <th className="text-center py-0.5 px-1 font-medium">과목평균</th>
                                          <th className="text-center py-0.5 px-1 font-medium">석차등급</th>
                                          {/* 등급이 뭉개는 구간 안 위치 — 같은 등급 두 과목의 우열이 여기서 갈린다 */}
                                          <th className="text-center py-0.5 px-1 font-medium border-l border-slate-200">
                                            상위 %
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {/*
                                          국어·수학·영어·과학·사회 순 (2026-09-05 사용자 지시).
                                          같은 교과군 안에서는 이수단위 큰 것부터 — 평균을 많이
                                          움직인 과목이 위에 온다. 단위도 같으면 이름순으로 못박아
                                          렌더마다 순서가 흔들리지 않게 한다.
                                        */}
                                        {orderSubjectRows(subs).map((r, i) => (
                                          <tr key={`s-${sem}-${i}`} className="border-b border-slate-100 last:border-0">
                                            <td className="py-0.5 pr-2 text-slate-700 min-w-0">
                                              <span className="block truncate max-w-[150px]" title={r.subject}>
                                                {r.subject}
                                              </span>
                                            </td>
                                            <td className="text-center py-0.5 px-1 text-muted-foreground whitespace-nowrap">
                                              {r.subject_group || '-'}
                                            </td>
                                            <td className="text-center py-0.5 px-1 text-muted-foreground">{r.units ?? '-'}</td>
                                            <td className="text-center py-0.5 px-1">{r.score ?? '-'}</td>
                                            <td className="text-center py-0.5 px-1 text-muted-foreground">
                                              {r.average ?? '-'}
                                              {/* 표준편차는 2025 개정으로 미제공이라 있을 때만 */}
                                              {r.stdDev != null && (
                                                <span className="text-[9px] ml-0.5">±{r.stdDev}</span>
                                              )}
                                            </td>
                                            <td className="text-center py-0.5 px-1">
                                              {r.rank != null ? (
                                                <span className={cn('font-semibold', gradeColor(r.rank))}>{r.rank}</span>
                                              ) : (
                                                /* 진로선택은 석차등급이 없고 성취도만 있다 */
                                                <span className="text-[9px] text-muted-foreground">
                                                  {r.achievement ?? '성취도만'}
                                                </span>
                                              )}
                                            </td>
                                            <td className="text-center py-0.5 px-1 border-l border-slate-100">
                                              {(() => {
                                                const sp = subjectPercentiles[`${r.grade}-${r.semester}-${r.subject}`];
                                                if (!sp) {
                                                  /*
                                                    없을 수 있는 이유가 둘이라 구분해 말한다 — 원점수가 없으면
                                                    셀 수 없고, 수강자가 적으면 한 명 차이로 백분위가 크게 튄다.
                                                  */
                                                  return (
                                                    <span className="text-[9px] text-muted-foreground"
                                                      title={r.score == null
                                                        ? '원점수가 없어 백분위를 낼 수 없습니다'
                                                        : `수강자가 ${NAESIN_PCT_MIN_GROUP}명 미만이라 내지 않습니다`}>
                                                      {r.score == null ? '-' : '표본 적음'}
                                                    </span>
                                                  );
                                                }
                                                return (
                                                  <span title={`수강 ${sp.n}명 중 위치`}>
                                                    <span className="font-semibold text-slate-700">
                                                      {sp.pct.toFixed(1)}
                                                    </span>
                                                    <span className="text-[9px] text-muted-foreground">%</span>
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  펼친 목록의 <span className="font-medium">상위 %</span>는 <span className="font-medium">그 과목을
                  같이 들은 우리 학교 학생</span> 안에서의 위치입니다(원점수 기준·동점은 중간순위).
                  교과군 칸의 백분위와는 뜻이 다릅니다 — 그쪽은 수강 집단을 보정한 <span
                  className="font-medium">전교 기준</span>입니다.
                </p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  위 등급·백분위는 <span className="font-medium">석차등급이 나오는 과목</span>(공통·일반선택)만
                  담습니다 — 진로·융합선택은 성취도만 있어 평균에서 빠지지만, 펼친 목록에는 함께 보입니다.
                </p>
              </div>
            );
          })()}

          {/*
            ## 예측 내신 — 실측 표와 **같은 모양의 서랍** (2026-09-05 사용자 지시)

            처음엔 모델 예측 행과 수강 과목 기반 행을 **둘 다** 쌓았는데, 같은 학기가 두 줄이
            되어 표가 두 배로 길어지고 "어느 쪽을 봐야 하나"가 생겼다. 이 표가 답해야 할 질문은
            **"앞으로 들을 과목에서 어떻게 나올까"** 하나이므로 수강 과목 기반만 남긴다
            (모델 예측·80% 구간은 왼쪽 학기 카드가 이미 낸다 — 두 곳에서 같은 말을 하지 않는다).

            학기를 누르면 **그 학기에 들을 과목**이 펼쳐진다. 실측 표에서 "어느 과목이 평균을
            끌어내렸나"를 묻는 것과 같은 질문을 미래에 대해 하는 자리다 — 다만 여기서는
            **집단 강도**(그 과목을 고른 학생들의 실력)가 함께 보여야 한다. 같은 실력이라도
            강한 집단 과목을 고르면 등급이 나쁘게 나오는 것이 이 값에서 나오기 때문이다.

            옛 스냅샷에는 `subject_detail` 이 없다 — 그때는 펼쳐도 안내만 나온다(빈 칸을 두지 않는다).
          */}
          {(() => {
            const orig = studentDetail.student;
            const sa = (orig.subject_aware_predictions ?? []).filter(x => x.grades);
            if (sa.length === 0) return null;
            const toggleSem = (sem: string) => {
              setExpandedPredSems(prev => {
                const next = new Set(prev);
                if (next.has(sem)) next.delete(sem); else next.add(sem);
                return next;
              });
            };
            return (
              <div className="bg-violet-50/40 rounded-lg border border-violet-100 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
                  <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                    예측 내신 (학기별)
                    <SourceBadge kind="scenario" />
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {/* 미래 능력 예측이 아니라 현재 능력 고정 시나리오다(2026-09-06 적대적 검증) */}
                    <span className="font-medium text-slate-600">지금 실력을 유지하면</span> 들을 과목
                    집단에서 이렇게 나온다는 시나리오 · 아래 첨자는 예상 상위 % ·
                    <span className="font-medium text-slate-600"> 행을 누르면 과목이 펼쳐집니다</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground border-b border-violet-100">
                        <th className="text-left py-1 pr-2 font-medium">학기</th>
                        {FEATURE_KEYS.map(k => (
                          <th key={`ph-${k}`} className="text-center py-1 px-1 font-medium whitespace-nowrap">
                            {k === 'overall' ? '전체평균' : SUBJECT_GROUP_LABELS[k]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sa.map(row => {
                        const open = expandedPredSems.has(row.semester);
                        const subs = row.subject_detail ?? null;
                        return (
                          <React.Fragment key={`pa-${row.semester}`}>
                            <tr
                              className={cn('border-b border-violet-100/60 cursor-pointer hover:bg-violet-50/70',
                                open && 'bg-violet-50/70')}
                              onClick={() => toggleSem(row.semester)}
                            >
                              <td className="py-1 pr-2 font-medium text-slate-600 whitespace-nowrap">
                                {/* 위 실측 표와 같은 규약 — 진짜 버튼 + aria-expanded */}
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  onClick={(e) => { e.stopPropagation(); toggleSem(row.semester); }}
                                  className="inline-flex items-center gap-0.5 min-h-[24px] px-0.5 -mx-0.5
                                             rounded hover:bg-violet-200/60 focus-visible:outline-none
                                             focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                  <ChevronDown className={cn('w-3 h-3 transition-transform',
                                    open ? 'rotate-0' : '-rotate-90')} />
                                  {row.semester}
                                  <span className="sr-only">{open ? ' 과목 접기' : ' 과목 펼치기'}</span>
                                </button>
                                <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
                                  {row.academic_year}
                                </span>
                                {/*
                                  확정 편성(사실)과 수요조사(신청)는 신뢰도가 다르다. 미래
                                  학년도는 편제가 아직 확정되지 않아 과목이 적을 수 있는데,
                                  그걸 밝히지 않으면 "데이터가 없다"로 읽힌다.
                                */}
                                {row.source === 'survey' && (
                                  <span className="ml-1 px-1 py-px rounded bg-amber-100 text-amber-700 text-[8px] font-normal align-middle"
                                    title="수요조사(신청) 기준입니다. 편제가 확정되지 않아 반영된 과목이 적을 수 있습니다.">
                                    수요조사
                                  </span>
                                )}
                              </td>
                              {FEATURE_KEYS.map(k => {
                                const v = row.grades[k];
                                return (
                                  <td key={`pa-${row.semester}-${k}`} className="text-center py-1 px-1 whitespace-nowrap">
                                    {v?.grade == null ? (
                                      <span className="text-muted-foreground">-</span>
                                    ) : (
                                      <>
                                        {/*
                                          교과군 값은 **과목 등급의 이수단위 가중 평균**이라
                                          이미 소수다(성적표 평균등급과 같은 셈법). 그 소수부는
                                          구간 안 위치가 아니라 과목 간 편차다.
                                        */}
                                        <span className={cn('font-semibold', gradeColor(v.grade))}>
                                          {v.grade.toFixed(2)}
                                        </span>
                                        {v.pct != null && (
                                          <span className="block text-[9px] leading-tight text-violet-500">
                                            {v.pct.toFixed(1)}%
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                            {open && (
                              <tr className="bg-white/60">
                                <td colSpan={FEATURE_KEYS.length + 1} className="px-2 py-2">
                                  {!subs || subs.length === 0 ? (
                                    <p className="text-[10px] text-muted-foreground">
                                      이 스냅샷에는 과목 단위 예상이 없습니다(옛 산출물).
                                    </p>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="text-[9px] text-muted-foreground border-b border-violet-100">
                                          <th className="text-left py-0.5 pr-2 font-medium">과목</th>
                                          <th className="text-center py-0.5 px-1 font-medium">교과군</th>
                                          <th className="text-center py-0.5 px-1 font-medium">단위</th>
                                          <th className="text-center py-0.5 px-1 font-medium">예상 등급</th>
                                          <th className="text-center py-0.5 px-1 font-medium">예상 상위 %</th>
                                          <th className="text-center py-0.5 px-1 font-medium border-l border-violet-100">
                                            수강 집단
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {/* 같은 순서 규칙(국·수·영·과·사) — 위 실측 표와 짝이다 */}
                                        {orderSubjectRows(subs).map((r, i) => (
                                          <tr key={`ps-${row.semester}-${i}`} className="border-b border-violet-50 last:border-0">
                                            <td className="py-0.5 pr-2 text-slate-700 min-w-0">
                                              <span className="block truncate max-w-[150px]" title={r.subject}>
                                                {r.subject}
                                              </span>
                                            </td>
                                            <td className="text-center py-0.5 px-1 text-muted-foreground whitespace-nowrap">
                                              {SUBJECT_GROUP_LABELS[r.group] ?? r.group}
                                            </td>
                                            <td className="text-center py-0.5 px-1 text-muted-foreground">{r.units}</td>
                                            <td className="text-center py-0.5 px-1">
                                              {/*
                                                ## 과목 하나에는 정수 등급만 있다 (2026-09-05 사용자 지시)
                                                예상 상위 %를 등급컷으로 환산한 값이고, 제도가
                                                매기는 것은 한 칸이라 "3.69등급"이 존재하지 않는다.
                                                같은 등급 안의 위치는 바로 옆 `예상 상위 %` 열이 낸다.
                                              */}
                                              <span className={cn('font-semibold', gradeColor(r.grade))}>
                                                {Math.round(r.grade)}
                                              </span>
                                            </td>
                                            <td className="text-center py-0.5 px-1 text-violet-600">
                                              {r.pct.toFixed(1)}
                                            </td>
                                            {/*
                                              집단 강도 m — 양수면 잘하는 학생이 몰린 과목이라
                                              같은 실력이라도 등급이 나쁘게 나온다. 0 은 평균
                                              집단이거나 신청자가 적어 추정을 믿지 않은 경우다.
                                            */}
                                            <td className="text-center py-0.5 px-1 border-l border-violet-50 whitespace-nowrap">
                                              {/*
                                                ## 값을 함께 적는다 (2026-09-05 사용자 지적)
                                                라벨만 두니 전부 '보통'으로 보였는데, 그건 실제로
                                                평균이어서가 아니라 **모든 학생에게 같은 과목을
                                                채워 넣던 버그** 때문이었다(집단이 다 같으면 m 도
                                                다 같다). 숫자를 함께 적으면 그런 붕괴가 화면에서
                                                바로 드러난다 — 라벨만으로는 구분되지 않는다.
                                              */}
                                              <span className={cn('text-[10px] font-medium',
                                                Math.abs(r.m) < 0.15 ? 'text-muted-foreground'
                                                  : r.m > 0 ? 'text-rose-600' : 'text-emerald-600')}
                                                title="그 과목을 함께 듣는 학생들의 평균 실력. 양수면 잘하는 학생이 몰려 같은 실력이라도 등급이 나쁘게 나온다">
                                                {Math.abs(r.m) < 0.15 ? '보통' : r.m > 0 ? '강함' : '약함'}
                                                <span className="ml-0.5 font-normal text-[9px] text-muted-foreground">
                                                  {r.m > 0 ? '+' : ''}{r.m.toFixed(2)}
                                                </span>
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                  {/*
                                    ## 빠진 과목을 밝힌다 (2026-09-05 사용자 지적 "3-1 에 과목이 너무 없음")

                                    3학년 편제는 대부분 **진로·융합 선택**이고 그 과목들은
                                    석차등급을 받지 않는다(성취도만). 그래서 등급 예상에 들어갈
                                    과목이 원래 적다 — 계획이 비어서가 아니다. 조용히 버리면
                                    화면에서 그 둘을 구분할 수 없어 "데이터가 없다"로 읽힌다.
                                  */}
                                  {(row.excluded?.length ?? 0) > 0 && (
                                    <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                                      <span className="font-medium text-slate-600">
                                        등급 예상에서 빠진 과목 {row.excluded!.length}개
                                      </span>
                                      {' — '}
                                      {row.excluded!.map((x, i) => (
                                        <span key={`ex-${row.semester}-${i}`}>
                                          {i > 0 && ' · '}
                                          <span title={EXCLUDE_REASON[x.reason] ?? x.reason}>
                                            {x.subject}
                                            <span className="text-[9px] text-muted-foreground/70">
                                              ({EXCLUDE_REASON_SHORT[x.reason] ?? '제외'})
                                            </span>
                                          </span>
                                        </span>
                                      ))}
                                    </p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  수강 예정 과목은 <span className="font-medium">확정 편성</span>(있으면)과{' '}
                  <span className="font-medium">수요조사·교육과정</span>에서 유도합니다 — 신청이 바뀌면 값도 바뀝니다.
                  <span className="font-medium text-rose-600"> 수강 집단 &lsquo;강함&rsquo;</span>은 그 과목을 고른 학생들의
                  실력이 높다는 뜻이라, 같은 실력이라도 등급이 나쁘게 나옵니다(실측: 같은 &ldquo;그 과목 상위 50%&rdquo;가
                  강한 과목이면 전교 25.5%, 약한 과목이면 66.4%).
                  석차등급이 나오는 과목만 담기므로 진로·융합선택은 빠집니다.
                </p>
              </div>
            );
          })()}
          </>)}

          {modalDomain === 'mock' && (<>
          {/*
            ## 실측 모의고사 — **전 학년** (2026-09-05 개편)

            종전에는 `exam_grade === orig.grade` 로 걸러 **그 학년 회차만** 보여 줬다. 그런데
            예측을 읽는 사람이 알고 싶은 것은 "이 학생이 3년간 어떻게 움직였나"이고, 1·2학년
            기록이 없으면 그 궤적을 볼 수 없다(사용자 지적). 학년별로 나눠 전부 낸다 —
            한 표에 몰면 3학년 선택과목과 1학년 공통과목이 섞여 열이 뒤엉킨다.

            원본은 `student_basic_info.mock_result`(원점수·표준점수·백분위 포함)이고,
            9월은 공식 성적이 없어 마킹→EBS 컷 참고 등급을 한 행으로 붙인다(배경·배지로 구분).
          */}
          {(() => {
            const orig = predictionData?.students.find(ps => ps.id === selectedStudent);
            if (!orig) return null;
            const studentRecord = analysisData.find(d => d.id === selectedStudent);
            const all = (studentRecord?.mock_result ?? []).slice().sort((a, b) => {
              if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
              if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
              return a.exam_month - b.exam_month;
            });
            const grades = [...new Set(all.map(e => e.exam_grade))].sort((a, b) => b - a);
            if (grades.length === 0) return null;
            const toggleMockExam = (key: string) => {
              setExpandedMockExams(prev => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              });
            };
            return (
              <div className="bg-white/70 rounded-lg border border-slate-200/70 p-3 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-xs font-semibold text-slate-700">실측 모의고사 (전 학년)</p>
                  <span className="text-[10px] text-muted-foreground">
                    {trendScale === 'percentile'
                      ? '전국 백분위 · 절대평가(영어·한국사)는 등급으로 표시 · 행을 누르면 원점수까지'
                      : '등급 · 행을 누르면 원점수·표준점수·백분위가 펼쳐집니다'}
                  </span>
                </div>
                {grades.map(g => {
                  const gradeExams = all.filter(e => e.exam_grade === g);
                  /* 9월 참고 등급은 **3학년 것만** 있다(마킹 기반) — 다른 학년에 붙이면 없는 행이 생긴다 */
                  const { columns, rows: examRows, hasReference: hasSept } = buildMockExamTable(
                    gradeExams,
                    g === 3 ? septReference.get(selectedStudent) : undefined,
                    g === 3 && septYear != null
                      ? { academic_year: septYear, exam_grade: 3, exam_month: 9 } : null,
                  );
                  if (examRows.length === 0) return null;
                  return (
                    <div key={`mg-${g}`}>
                      <p className="text-[11px] font-semibold text-slate-600 mb-1">{g}학년</p>
                    <div className="mt-2 pt-2 border-t border-indigo-200/50">
                      <p className="text-[10px] text-indigo-500 mb-1">{orig.grade}학년 실제 모의고사 성적</p>
                      <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                              <th className="py-2 px-3 text-left font-medium sticky left-0 bg-slate-50/80 z-10">시험</th>
                              {columns.map(subject => (
                                <th key={subject} className="py-2 px-3 text-center font-medium whitespace-nowrap">
                                  {subject}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {examRows.map(exam => {
                              const key = `${exam.academic_year}-${exam.exam_grade}-${exam.exam_month}`;
                              const isExpanded = expandedMockExams.has(key);
                              // 평가원 회차(6·9월, 재수생 포함)는 배경·배지로 강조 — sticky 첫 셀도 같은 배경으로 맞춘다
                              const isPyeonggawon = isPyeonggawonExam(exam.exam_grade, exam.exam_month);
                              // 참고 등급 행은 공식 성적과 **다른 색**으로 갈라 놓는다(앰버). 같은 표에
                              // 나란히 있으면서 색까지 같으면 확정 등급으로 읽힌다.
                              const rowBg = exam.isReference ? 'bg-amber-50/60' : isPyeonggawon ? 'bg-indigo-50/40' : null;
                              return (
                                <React.Fragment key={key}>
                                  <tr
                                    className={cn('cursor-pointer hover:bg-slate-50 transition-colors', rowBg)}
                                    onClick={() => toggleMockExam(key)}
                                  >
                                    <td className={cn(
                                      'py-2 px-3 font-semibold text-slate-700 sticky left-0 z-10 whitespace-nowrap',
                                      rowBg ?? 'bg-white',
                                    )}>
                                      {/* 위 두 표와 같은 규약 — 진짜 버튼 + aria-expanded */}
                                      <button
                                        type="button"
                                        aria-expanded={isExpanded}
                                        onClick={(e) => { e.stopPropagation(); toggleMockExam(key); }}
                                        className="inline-flex items-center gap-1 min-h-[24px] px-0.5 -mx-0.5
                                                   rounded hover:bg-slate-200/60 focus-visible:outline-none
                                                   focus-visible:ring-2 focus-visible:ring-blue-500"
                                      >
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-400 text-[10px]">
                                          {isExpanded ? '▼' : '▶'}
                                        </span>
                                        {exam.academic_year}년 {exam.exam_grade}학년 {exam.exam_month}월
                                        <span className="sr-only">{isExpanded ? ' 과목 접기' : ' 과목 펼치기'}</span>
                                      </button>
                                      {isPyeonggawon && (
                                        <span className="ml-1.5 px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9px] font-semibold">
                                          평가원
                                        </span>
                                      )}
                                      {exam.isReference && (
                                        <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-semibold">
                                          EBS 참고
                                        </span>
                                      )}
                                    </td>
                                    {columns.map(subject => {
                                      const score = exam.subjects[subject];
                                      return (
                                        <td key={subject} className="py-2 px-3 text-center">
                                          {/*
                                            척도 토글을 따른다(차트·실측 내신과 같은 상태).
                                            백분위 모드에서 영어·한국사는 **절대평가라 값이 없다** —
                                            그때는 등급 배지로 떨어뜨린다(빈칸으로 두면 "안 봤나"가 된다).
                                          */}
                                          {trendScale === 'percentile' && score?.percentile != null ? (
                                            <span className="text-xs font-semibold text-violet-700">
                                              {score.percentile.toFixed(0)}
                                              {exam.isReference && (
                                                <span className="ml-0.5 text-[9px] font-normal text-amber-700">추정</span>
                                              )}
                                            </span>
                                          ) : score?.grade != null ? (
                                            <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-bold', getGradeBadgeColor(score.grade))}>
                                              {score.grade}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                  {isExpanded && (
                                    <>
                                      <tr className="bg-slate-50/50">
                                        <td className="py-1.5 px-3 pl-9 text-slate-500 sticky left-0 bg-slate-50/50 z-10">원점수</td>
                                        {columns.map(subject => (
                                          <td key={subject} className="py-1.5 px-3 text-center text-slate-600">
                                            {exam.subjects[subject]?.raw_score ?? '-'}
                                          </td>
                                        ))}
                                      </tr>
                                      <tr className="bg-slate-50/50">
                                        <td className="py-1.5 px-3 pl-9 text-slate-500 sticky left-0 bg-slate-50/50 z-10">표준점수</td>
                                        {columns.map(subject => (
                                          <td key={subject} className="py-1.5 px-3 text-center text-slate-600">
                                            {exam.subjects[subject]?.standard_score ?? '-'}
                                          </td>
                                        ))}
                                      </tr>
                                      <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <td className="py-1.5 px-3 pl-9 text-slate-500 sticky left-0 bg-slate-50/50 z-10">백분위</td>
                                        {columns.map(subject => (
                                          <td key={subject} className="py-1.5 px-3 text-center text-slate-600">
                                            {exam.subjects[subject]?.percentile ?? '-'}
                                          </td>
                                        ))}
                                      </tr>
                                    </>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {hasSept && (
                        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700/90">
                          <span className="font-semibold">EBS 참고</span> 행은 9월 모평 마킹을 EBS 예상 등급컷에
                          대조해 산정한 값입니다 — 공식 등급이 아니고, EBS 가 예상컷을 고치면 함께 바뀝니다.
                          표준점수·백분위는 만들 수 없어 비워 둡니다(펼치면 원점수는 보입니다).
                          공식 성적이 적재되면 이 행은 자동으로 공식 행으로 대체됩니다.
                        </p>
                      )}
                      {g === 3 && !hasSept && septLoading && (
                        <p className="mt-1.5 text-[10px] text-muted-foreground inline-flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> 9월 모평 참고 등급을 계산하는 중…
                        </p>
                      )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </>)}
                </div>
              </div>
            </div>

              {/*
                ## 지금 무엇을 보고 있는지는 **바닥 오른쪽**에 (2026-09-05 사용자 지시)
                헤더에 두면 토글 버튼과 같은 자리를 다투고 제목 줄이 두 층이 된다.
                이 문구는 조작이 아니라 상태 설명이라, 읽고 나서 눈이 머무는 자리가 낫다.
              */}
              <p className="mt-3 pt-2 border-t border-slate-200/60 text-right text-[10px] text-muted-foreground">
                {modalDomain === 'naesin'
                  ? '교내 상대평가 · 학기 전이 모델'
                  : '전국 기준 · 내신↔모의 상관 모델'}
                {trendScale === 'percentile' && (modalDomain === 'naesin'
                  ? ' · 상위 %(작을수록 좋음)'
                  : ' · 전국 백분위(클수록 좋음)')}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
