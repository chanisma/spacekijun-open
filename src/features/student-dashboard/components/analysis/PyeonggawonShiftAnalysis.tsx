import React, { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Legend,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import { useCurrentGradePrediction } from '../../hooks/useGradePrediction';
import type { MockExamResult } from '../../utils/analysisUtils';
import { MOCK_SUBJECT_FAMILY, normalizeMockSubjectName } from '../../utils/analysisUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useCohortReferenceGrades } from '@/features/evalearn/hooks/useCohortReferenceGrades';
import { isValidExamGrade } from '@/features/evalearn/utils/mockResult';
import type { ReferenceGrade } from '@/features/evalearn/utils/referenceGrade';
import { buildStudentShiftRows } from '../../utils/pyeonggawonTable';
import PyeonggawonStudentTable from './PyeonggawonStudentTable';

/**
 * 6·9월 모평 분석 — 3학년 전용. 3·5월 학평(재학생만)과 6·9월 평가원(졸업생 포함) 사이의
 * 성적 변동을 본다.
 *
 * ⚠️ 이 변동을 **"재수생 효과"라고 단정해 적지 말 것** (2026-09-05 적대적 검증). 두 회차 사이에는
 * 응시 집단만이 아니라 **출제 범위·난이도·주관 기관**이 함께 바뀌고 학생 자신의 학습도 진행된다.
 * 우리가 재는 것은 그 **합**이고, 재수생 유입은 그중 널리 알려진 한 요인일 뿐 우리 데이터로는
 * 분리되지 않는다(졸업생 응시자 정보가 없다). 화면 문구는 "무엇을 쟀는가"까지만 말한다.
 * 국어/수학/탐구는 상대평가라 백분위(높을수록 좋음), 영어/한국사는 절대평가라 등급(낮을수록 좋음).
 * 탐구 과목은 데이터에 존재하는 과목이 자동으로 선택지에 추가되고,
 * 9월 데이터가 DB에 들어오면 "6월 → 9월" 비교 축이 자동으로 추가된다.
 */

interface Props {
  data: AnalysisStudentData[];
  grade?: number;
}

// 색상은 dataviz validate_palette.js로 검증된 쌍만 사용:
// 향상/하락(폴라리티) = emerald/rose, 올해/졸업생(카테고리 2계열) = indigo/amber.
const IMPROVE_COLOR = '#10b981';
const DECLINE_COLOR = '#f43f5e';
const SERIES_THIS_YEAR = '#6366f1';
const SERIES_GRADUATES = '#f59e0b';

type Metric = 'percentile' | 'grade';

// 시작값 밴드 — 라벨은 ml/train_grade_predictor.py의 JUNE_SHIFT_BANDS/GRADE_SHIFT_BANDS와
// 일치해야 졸업생 코호트 오버레이의 밴드가 맞아떨어진다.
const PCT_BANDS = [
  { label: '90+', lo: 90, hi: 101 },
  { label: '70-90', lo: 70, hi: 90 },
  { label: '50-70', lo: 50, hi: 70 },
  { label: '<50', lo: 0, hi: 50 },
] as const;
const GRADE_BANDS = [
  { label: '1-2', lo: 1, hi: 3 },
  { label: '3-4', lo: 3, hi: 5 },
  { label: '5-6', lo: 5, hi: 7 },
  { label: '7-9', lo: 7, hi: 10 },
] as const;

interface SubjectDescriptor {
  id: string;        // 'korean' | 'math' | 'english' | 과목명(한국사·탐구)
  label: string;
  metric: Metric;
  /** june_cohort_stats.subjects의 키 (korean/math/english_grade/과목명) */
  cohortKey: string;
}

const BASE_SUBJECTS: SubjectDescriptor[] = [
  { id: 'korean', label: '국어', metric: 'percentile', cohortKey: 'korean' },
  { id: 'math', label: '수학', metric: 'percentile', cohortKey: 'math' },
  { id: 'english', label: '영어', metric: 'grade', cohortKey: 'english_grade' },
  { id: '한국사', label: '한국사', metric: 'grade', cohortKey: '한국사' },
];

interface ShiftPair {
  id: string;
  name: string;
  from: number;
  to: number;
  delta: number;
}

interface Comparison {
  id: string;
  fromLabel: string;
  toLabel: string;
  fromMonths: readonly number[];
  toMonths: readonly number[];
  /** 졸업생 코호트 오버레이는 학평->6월 비교에만 존재 (ML JSON의 june_cohort_stats) */
  graduateOverlay: boolean;
  /**
   * 이 비교에서만 지표를 강제한다.
   *
   * 6→9월은 **9월 백분위가 아직 없다** — 공식 성적 발표 전이라 우리가 가진 건 마킹으로
   * 유도한 참고 등급뿐이다. 그래서 이 축만 국어·수학·탐구까지 전부 등급으로 본다.
   * 백분위가 적재되면 이 필드를 지우면 원래대로 돌아간다.
   */
  forceMetric?: Metric;
  /** to 쪽 값이 공식 성적에 없으면 참고 등급으로 채운다 */
  useReferenceForTo?: boolean;
  /** 화면에 밝혀야 하는 단서 */
  note?: string;
}

/**
 * 성적표의 과목명이 이 선택지에 해당하는가.
 *
 * 국어·수학·영어는 3학년이면 선택과목명(화법과작문·미적분…)으로 저장되므로 계열로 병합하고,
 * 한국사·탐구는 정규화한 이름으로 맞춘다.
 */
function matchesDescriptor(name: string, d: SubjectDescriptor): boolean {
  if (d.id === 'korean' || d.id === 'math' || d.id === 'english') {
    return MOCK_SUBJECT_FAMILY[name] === d.id;
  }
  return !MOCK_SUBJECT_FAMILY[name] && normalizeMockSubjectName(name) === d.id;
}

const mean = (vals: number[]) => (vals.length === 0 ? undefined : vals.reduce((a, b) => a + b, 0) / vals.length);

/**
 * 3학년의 특정 월(들) 회차에서 해당 과목 값을 평균해 추출.
 *
 * 지표는 **비교 축이 정한다**(`metric` 인자) — 같은 국어라도 3·5월→6월 축에서는 백분위,
 * 6월→9월 축에서는 등급으로 본다(9월 백분위가 아직 없다).
 * 등급 0 은 미응시라 값으로 세면 안 된다.
 */
function extractSubjectValue(
  mockResult: MockExamResult[] | null,
  months: readonly number[],
  d: SubjectDescriptor,
  metric: Metric,
): number | undefined {
  const vals: number[] = [];
  (Array.isArray(mockResult) ? mockResult : []).forEach(exam => {
    if (exam.exam_grade !== 3 || !months.includes(exam.exam_month)) return;
    Object.entries(exam.subjects ?? {}).forEach(([name, score]) => {
      if (!score || !matchesDescriptor(name, d)) return;
      if (metric === 'percentile') {
        if (score.percentile != null) vals.push(score.percentile);
      } else if (isValidExamGrade(score.grade)) {
        vals.push(score.grade as number);
      }
    });
  });
  return mean(vals);
}

/** 공식 성적이 없을 때의 대체 — 마킹으로 유도한 참고 등급(EBS 등급컷). */
function extractReferenceGrade(
  refs: Map<string, ReferenceGrade> | undefined,
  d: SubjectDescriptor,
): number | undefined {
  if (!refs) return undefined;
  const vals: number[] = [];
  for (const [name, ref] of refs) {
    if (!matchesDescriptor(name, d)) continue;
    if (isValidExamGrade(ref.grade)) vals.push(ref.grade);
  }
  return mean(vals);
}

export const PyeonggawonShiftAnalysis: React.FC<Props> = ({ data, grade }) => {
  const { data: predictionData } = useCurrentGradePrediction();
  /** 과목 목록의 '전체' — 과목 하나가 아니라 학생별 표를 본다 */
  const ALL_SUBJECTS = '__all__';
  const [subjectKey, setSubjectKey] = useState<string>('korean');
  const isAllSubjects = subjectKey === ALL_SUBJECTS;
  const [modalOpen, setModalOpen] = useState(false);

  // 존재하는 3학년 회차 월에 따라 비교 축을 동적으로 구성
  const comparisons = useMemo<Comparison[]>(() => {
    const months = new Set<number>();
    data.forEach(s => {
      (Array.isArray(s.mock_result) ? s.mock_result : []).forEach(e => {
        if (e.exam_grade === 3) months.add(e.exam_month);
      });
    });
    const list: Comparison[] = [];
    if (months.has(6)) {
      list.push({
        id: 'pre-june', fromLabel: '3·5월 학평', toLabel: '6월 평가원',
        fromMonths: [3, 5], toMonths: [6], graduateOverlay: true,
      });
    }
    /*
      9월은 **공식 성적이 없어도** 축을 만든다 — 마킹으로 유도한 참고 등급이 있기 때문이다.
      대신 이 축은 국어·수학·탐구까지 전부 **등급**으로 본다(9월 백분위가 아직 없다).
      백분위가 적재되면 `forceMetric`/`useReferenceForTo` 를 지우면 원래 동작으로 돌아간다.
    */
    if (months.has(6)) {
      list.push({
        id: 'june-sept', fromLabel: '6월 평가원', toLabel: '9월 평가원',
        fromMonths: [6], toMonths: [9], graduateOverlay: false,
        forceMetric: 'grade',
        useReferenceForTo: true,
        note: '9월은 공식 성적 발표 전이라 마킹으로 유도한 참고 등급(EBS 등급컷)입니다. 백분위가 없어 6월도 등급으로 맞춰 비교합니다.',
      });
    }
    return list;
  }, [data]);

  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const comparison = comparisons.find(c => c.id === comparisonId) ?? comparisons[0] ?? null;

  // 참고 등급이 필요한 축을 볼 때만 받는다(마킹 payload 가 크다).
  // 회차 연도는 3학년 성적이 있는 가장 최근 학년도 = 지금 이 코호트의 학년도.
  const latestYear = useMemo(() => {
    let y: number | undefined;
    data.forEach(s => {
      (Array.isArray(s.mock_result) ? s.mock_result : []).forEach(e => {
        if (e.exam_grade === 3) y = Math.max(y ?? 0, e.academic_year);
      });
    });
    return y;
  }, [data]);

  const { referenceGrades, isLoading: refLoading } = useCohortReferenceGrades(
    grade, latestYear, comparison?.toMonths[0], 3, !!comparison?.useReferenceForTo
  );

  /**
   * 과목 선택지: 국/수/영/한국사 고정 + 데이터에 존재하는 **모든** 탐구 과목.
   *
   * 종전엔 "백분위가 있고 기록 10건 이상"만 담아 실제로 응시한 과목이 **목록에서 사라졌다**
   * (라이브 3학년 6월: 윤리와사상 7 · 동아시아사 6 · 세계사 5 · 경제 2 · 물리학Ⅰ/화학Ⅰ 각 1~3명).
   * 소수 응시라도 그 학생들에게는 자기 과목이라 목록에 없으면 볼 방법이 없다.
   * 표본이 작다는 사실은 감추는 대신 버튼에 인원수로 밝힌다.
   */
  const subjectDescriptors = useMemo<SubjectDescriptor[]>(() => {
    const counts = new Map<string, number>();
    data.forEach(s => {
      (Array.isArray(s.mock_result) ? s.mock_result : []).forEach(e => {
        if (e.exam_grade !== 3) return;
        Object.entries(e.subjects ?? {}).forEach(([name, score]) => {
          if (!score || MOCK_SUBJECT_FAMILY[name]) return;
          const norm = normalizeMockSubjectName(name);
          if (norm === '한국사') return;
          // 등급만 있고 백분위가 없는 회차도 있다(6→9월 축은 등급으로 본다)
          if (score.percentile != null || isValidExamGrade(score.grade)) {
            counts.set(norm, (counts.get(norm) ?? 0) + 1);
          }
        });
      });
    });
    const tamgu: SubjectDescriptor[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => ({ id: name, label: name, metric: 'percentile', cohortKey: name }));
    const all = [...BASE_SUBJECTS, ...tamgu];
    // 축이 지표를 강제하면 선택지 자체를 그 지표로 바꾼다 — 아래 계산·차트·표가 모두
    // `d.metric` 을 읽으므로, 여기 한 곳만 맞추면 화면 전체가 따라온다.
    const force = comparison?.forceMetric;
    return force ? all.map(d => ({ ...d, metric: force })) : all;
  }, [data, comparison]);

  // 전 과목의 (from, to) 페어 — 과목 선택 버튼/개요 테이블/상세 차트가 공유
  const analysis = useMemo(() => {
    if (!comparison) return null;
    const bySubject = new Map<string, ShiftPair[]>();
    subjectDescriptors.forEach(d => {
      const pairs: ShiftPair[] = [];
      data.forEach(s => {
        const from = extractSubjectValue(s.mock_result, comparison.fromMonths, d, d.metric);
        // 공식 성적이 있으면 그것이 정본 — 없을 때만 참고 등급으로 채운다.
        // 9월 공식 성적이 적재되는 순간 이 줄이 자동으로 공식 값으로 넘어간다.
        const to = extractSubjectValue(s.mock_result, comparison.toMonths, d, d.metric)
          ?? (comparison.useReferenceForTo ? extractReferenceGrade(referenceGrades.get(s.id), d) : undefined);
        if (from != null && to != null) {
          pairs.push({
            id: s.id, name: s.name,
            from: parseFloat(from.toFixed(1)),
            to: parseFloat(to.toFixed(1)),
            delta: parseFloat((to - from).toFixed(1)),
          });
        }
      });
      bySubject.set(d.id, pairs);
    });
    return { bySubject };
  }, [data, comparison, subjectDescriptors, referenceGrades]);

  const cohortStats = predictionData?.june_cohort_stats ?? null;

  // 표본 3명 미만 과목은 평균이 의미 없어 선택지·테이블에서 제외
  /**
   * 짝(6월·9월 모두 있는 학생)이 하나라도 있으면 목록에 남긴다.
   *
   * 종전 기준은 3명이었는데, 그러면 5명이 본 세계사는 나오고 2명이 본 경제는 사라지는
   * 자의적인 선이 된다. 표본이 작다는 것은 **버튼의 인원수**로 알린다(밴드 평균은
   * 원래 표본이 작으면 빈칸으로 나오므로 잘못된 값이 그려지지는 않는다).
   */
  /**
   * 학생별 표 — '전체'를 골랐을 때만 만든다.
   * 명단에서 학생을 빼지 않는다(9월 미응시 자체가 정보다).
   */
  const studentRows = useMemo(() => {
    if (!comparison || !isAllSubjects) return [];
    return buildStudentShiftRows(
      data.map(s => ({
        id: s.id, name: s.name, class_num: s.class_num, number: s.number, mock_result: s.mock_result,
      })),
      comparison.fromMonths,
      comparison.toMonths,
      referenceGrades,
      !!comparison.useReferenceForTo
    );
  }, [data, comparison, referenceGrades, isAllSubjects]);

  const availableDescriptors = useMemo(() => {
    if (!analysis) return [];
    return subjectDescriptors.filter(d => (analysis.bySubject.get(d.id)?.length ?? 0) >= 1);
  }, [analysis, subjectDescriptors]);

  const selected = availableDescriptors.find(d => d.id === subjectKey) ?? availableDescriptors[0] ?? null;

  // 밴드별 평균 변화 (올해 3학년 vs 작년 졸업생 코호트) — 선택 과목의 지표에 맞는 밴드 사용
  const bandRows = useMemo(() => {
    if (!analysis || !comparison || !selected) return [];
    const list = analysis.bySubject.get(selected.id) ?? [];
    const bands = selected.metric === 'percentile' ? PCT_BANDS : GRADE_BANDS;
    const gradBands = comparison.graduateOverlay
      ? cohortStats?.subjects?.[selected.cohortKey]?.bands ?? []
      : [];
    return bands.map(band => {
      const inBand = list.filter(p => p.from >= band.lo && p.from < band.hi);
      const thisYear = inBand.length > 0
        ? parseFloat((inBand.reduce((sum, p) => sum + p.delta, 0) / inBand.length).toFixed(2))
        : null;
      const grad = gradBands.find(b => b.label === band.label);
      return {
        band: band.label,
        thisYear,
        thisYearN: inBand.length,
        graduates: grad?.mean_delta ?? null,
        graduatesN: grad?.n ?? null,
      };
    }).filter(r => r.thisYear != null || r.graduates != null);
  }, [analysis, comparison, selected, cohortStats]);

  // ── 게이트: 재수생 효과는 평가원 모평이 있는 3학년에만 존재 ──
  if (!grade || grade !== 3) {
    return (
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">3학년을 선택해주세요.</p>
        <p className="text-xs text-muted-foreground mt-1">
          6·9월 평가원 모평은 응시 집단·출제 범위가 학평과 달라 성적 변동이 큽니다. 이 비교는
          평가원 모평을 치르는 3학년에만 성립하므로, 왼쪽 사이드바에서 3학년을 선택하면 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  if (!comparison || !analysis || !selected) {
    return (
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">3학년 6월 평가원 모의고사 데이터가 없습니다.</p>
      </div>
    );
  }

  const points = analysis.bySubject.get(selected.id) ?? [];
  const isPct = selected.metric === 'percentile';
  const unitLabel = isPct ? '백분위' : '등급';
  // 개선 크기 (클수록 향상): 백분위는 +가, 등급은 −가 향상
  const improvementOf = (p: ShiftPair) => (isPct ? p.delta : -p.delta);
  const stayOrImproved = (p: ShiftPair) => improvementOf(p) >= 0;
  const drops = points.filter(p => improvementOf(p) < 0)
    .sort((a, b) => improvementOf(a) - improvementOf(b)).slice(0, 10);
  const gains = points.filter(p => improvementOf(p) > 0)
    .sort((a, b) => improvementOf(b) - improvementOf(a)).slice(0, 10);
  // 상위권 20명: 선택 과목의 시작(from) 성적 기준 — 백분위는 높을수록, 등급은 낮을수록 상위
  const topRanked = [...points]
    .sort((a, b) => (isPct ? b.from - a.from : a.from - b.from))
    .slice(0, 20);
  const gradSubjectStat = comparison.graduateOverlay ? cohortStats?.subjects?.[selected.cohortKey] : null;

  const fmtDelta = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
  const deltaColorFor = (metric: Metric, d: number) =>
    (metric === 'percentile' ? d >= 0 : d <= 0) ? 'text-emerald-600' : 'text-rose-600';

  return (
    <div className="space-y-4">
      {/* 비교 축 + 과목 선택 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">비교:</span>
          {comparisons.map(c => (
            <button
              key={c.id}
              onClick={() => setComparisonId(c.id)}
              className={`px-3 py-1 text-xs rounded-full transition-all ${
                comparison.id === c.id
                  ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80'
              }`}
            >
              {c.fromLabel} → {c.toLabel}
              {/* 참고 등급으로 채우는 축임을 선택 전에 알린다 */}
              {c.useReferenceForTo && (
                <span className={cn('ml-1 text-[10px] align-top', comparison.id === c.id ? 'text-white/80' : 'text-amber-600')}>
                  참고
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 이 축이 무엇으로 계산됐는지 — 공식 등급과 섞어 읽지 않도록 */}
        {comparison.note && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <span className="font-semibold shrink-0">참고 등급</span>
            <span>{comparison.note}</span>
          </p>
        )}
        {refLoading && (
          <p className="text-[11px] text-slate-400">참고 등급을 계산하는 중…</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">과목:</span>
          {/* '전체' — 과목 하나가 아니라 학생 명단을 본다. 모달이 아니라 본문이 바뀐다 */}
          <button
            onClick={() => { setSubjectKey(ALL_SUBJECTS); setModalOpen(false); }}
            className={`px-3 py-1 text-xs rounded-full transition-all font-medium ${
              isAllSubjects
                ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm'
                : 'bg-white/50 text-slate-600 hover:bg-white/80'
            }`}
          >
            전체
          </button>
          {availableDescriptors.map(d => {
            const n = analysis?.bySubject.get(d.id)?.length ?? 0;
            return (
              <button
                key={d.id}
                onClick={() => { setSubjectKey(d.id); setModalOpen(true); }}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  !isAllSubjects && selected?.id === d.id
                    ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm'
                    : 'bg-white/50 text-slate-600 hover:bg-white/80'
                }`}
              >
                {d.label}
                {/* 표본이 작다는 사실을 감추지 않고 함께 보여준다 */}
                <span className={cn(
                  'ml-1 text-[10px]',
                  !isAllSubjects && selected?.id === d.id ? 'text-white/70' : 'text-slate-400'
                )}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          3·5월 학평은 재학생만, 6·9월 평가원 모평은 졸업생도 함께 응시하고 출제 범위·주관 기관도 다릅니다.
          여기 보이는 변화는 그 차이와 학생 자신의 학습이 **함께 만든 결과**입니다.
          {comparison.forceMetric === 'grade'
            ? ' 이 축은 전 과목을 등급(낮을수록 좋음)으로 비교합니다.'
            : ' 국어·수학·탐구는 백분위(높을수록 좋음), 영어·한국사는 절대평가라 등급(낮을수록 좋음)으로 비교합니다.'}
          과목 옆 숫자는 두 회차 모두 성적이 있는 인원입니다. 과목을 클릭하면 상세가 모달로,
          <strong className="font-medium"> 전체</strong>를 누르면 학생별 표가 아래에 표시됩니다.
        </p>
      </div>

      {/* '전체' = 학생별 표. 과목 하나를 볼 때의 과목별 요약과 자리를 바꿔 쓴다 */}
      {isAllSubjects && (
        <PyeonggawonStudentTable
          rows={studentRows}
          fromLabel={comparison.fromLabel}
          toLabel={comparison.toLabel}
          toIsReference={!!comparison.useReferenceForTo}
        />
      )}

      {/* 과목별 개요 테이블 (행 클릭 = 과목 선택 + 상세 모달 열기) */}
      {!isAllSubjects && (
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">
          과목별 평균 변화 — {comparison.fromLabel} → {comparison.toLabel}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="text-left py-2 px-2 font-medium">과목</th>
                <th className="text-center py-2 px-2 font-medium">지표</th>
                <th className="text-center py-2 px-2 font-medium">비교 인원</th>
                <th className="text-center py-2 px-2 font-medium">올해 평균 변화</th>
                <th className="text-center py-2 px-2 font-medium">작년 졸업생</th>
              </tr>
            </thead>
            <tbody>
              {availableDescriptors.map(d => {
                const pairs = analysis.bySubject.get(d.id) ?? [];
                const meanDelta = pairs.length > 0
                  ? pairs.reduce((sum, p) => sum + p.delta, 0) / pairs.length
                  : null;
                const grad = comparison.graduateOverlay ? cohortStats?.subjects?.[d.cohortKey] : null;
                return (
                  <tr
                    key={d.id}
                    onClick={() => { setSubjectKey(d.id); setModalOpen(true); }}
                    className={cn(
                      'border-b border-muted/30 cursor-pointer hover:bg-white/40 transition-colors',
                      selected.id === d.id && 'bg-indigo-50/60',
                    )}
                  >
                    <td className="py-1.5 px-2 font-medium">{d.label}</td>
                    <td className="text-center py-1.5 px-2 text-muted-foreground">
                      {d.metric === 'percentile' ? '백분위' : '등급'}
                    </td>
                    <td className="text-center py-1.5 px-2">{pairs.length}</td>
                    <td className={cn(
                      'text-center py-1.5 px-2 font-semibold',
                      meanDelta == null ? 'text-muted-foreground' : deltaColorFor(d.metric, meanDelta),
                    )}>
                      {meanDelta == null ? '-' : fmtDelta(parseFloat(meanDelta.toFixed(2)))}
                    </td>
                    <td className="text-center py-1.5 px-2 text-muted-foreground">
                      {grad ? `${fmtDelta(grad.mean_delta)} (n=${grad.n})` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 선택 과목 상세 — 모달 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {selected.label} 상세 — {comparison.fromLabel} → {comparison.toLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 산점도: from vs to */}
            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-1">
                {selected.label} — {comparison.fromLabel} vs {comparison.toLabel} {unitLabel}
              </h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                {isPct
                  ? '대각선(변화 없음) 아래 = 하락. 상대평가라 응시 집단이 넓어지는 6월엔 대각선 아래가 많은 것이 일반적입니다.'
                  : '절대평가 과목입니다 — 응시 집단이 넓어져도 기준점이 그대로라, 대각선에서 벗어난 변화는 학습 결과에 더 가깝습니다.'}
              </p>
              {points.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">비교 가능한 학생이 없습니다.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 14, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="from" type="number" tick={{ fontSize: 11 }}
                      domain={isPct ? [0, 100] : [1, 9]}
                      reversed={!isPct}
                      label={{ value: `${comparison.fromLabel} ${unitLabel}`, position: 'bottom', fontSize: 11, offset: -2 }}
                    />
                    <YAxis
                      dataKey="to" type="number" tick={{ fontSize: 11 }}
                      domain={isPct ? [0, 100] : [1, 9]}
                      reversed={!isPct}
                      label={{ value: `${comparison.toLabel} ${unitLabel}`, angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <ReferenceLine
                      segment={isPct
                        ? [{ x: 0, y: 0 }, { x: 100, y: 100 }]
                        : [{ x: 1, y: 1 }, { x: 9, y: 9 }]}
                      stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={1}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]?.payload as ShiftPair | undefined;
                        if (!p) return null;
                        return (
                          <div className="bg-white/95 backdrop-blur-sm border border-white/40 rounded-lg shadow-lg p-2.5 text-xs">
                            <p className="font-semibold mb-1">{p.name}</p>
                            <p className="text-muted-foreground">
                              {p.from.toFixed(1)} → {p.to.toFixed(1)}
                              <span className={cn('ml-1 font-semibold', deltaColorFor(selected.metric, p.delta))}>
                                ({fmtDelta(p.delta)})
                              </span>
                            </p>
                          </div>
                        );
                      }}
                    />
                    {/* 향상/하락을 별도 시리즈로 나눠 폴라리티 색과 범례를 함께 제공 */}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Scatter name="향상·유지" data={points.filter(stayOrImproved)} fill={IMPROVE_COLOR} />
                    <Scatter name="하락" data={points.filter(p => !stayOrImproved(p))} fill={DECLINE_COLOR} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 밴드별 평균 변화 (올해 vs 작년 졸업생) */}
            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-1">
                {selected.label} — 시작 {unitLabel} 밴드별 평균 변화
              </h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                어느 성적대가 크게 변하는지 보여줍니다 (밴드 = {comparison.fromLabel} {unitLabel} 기준,
                {isPct ? ' +가 향상' : ' −가 향상'}).
              </p>
              {bandRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={bandRows} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="band" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                    <Tooltip
                      formatter={(v: number, name: string) => [fmtDelta(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="thisYear" name="올해 3학년" fill={SERIES_THIS_YEAR} radius={[3, 3, 0, 0]} />
                    {comparison.graduateOverlay && gradSubjectStat?.bands && gradSubjectStat.bands.length > 0 && (
                      <Bar dataKey="graduates" name="작년 졸업생" fill={SERIES_GRADUATES} radius={[3, 3, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 변동 TOP 10 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3 text-rose-700">
                  {selected.label} {unitLabel} 하락 TOP 10
                </h3>
                {drops.length === 0 ? (
                  <p className="text-xs text-muted-foreground">해당 학생 없음</p>
                ) : (
                  <div className="space-y-2">
                    {drops.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-rose-50/50 rounded-lg">
                        <span className="font-medium">{i + 1}. {p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{p.from.toFixed(1)} → {p.to.toFixed(1)}</span>
                          <span className="text-rose-600 font-semibold">{fmtDelta(p.delta)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3 text-emerald-700">
                  {selected.label} {unitLabel} 향상 TOP 10
                </h3>
                {gains.length === 0 ? (
                  <p className="text-xs text-muted-foreground">해당 학생 없음</p>
                ) : (
                  <div className="space-y-2">
                    {gains.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-emerald-50/50 rounded-lg">
                        <span className="font-medium">{i + 1}. {p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{p.from.toFixed(1)} → {p.to.toFixed(1)}</span>
                          <span className="text-emerald-600 font-semibold">{fmtDelta(p.delta)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 상위권 20명 변동 (선택 과목의 시작 성적 기준) */}
            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-1">
                {selected.label} 상위권 20명 — {comparison.fromLabel} → {comparison.toLabel}
              </h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                {comparison.fromLabel} {unitLabel} 기준 상위 20명의 변동입니다{isPct ? ' (백분위 높은 순)' : ' (등급 낮은 순)'}.
              </p>
              {topRanked.length === 0 ? (
                <p className="text-xs text-muted-foreground">해당 학생 없음</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {topRanked.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-indigo-50/40 rounded-lg">
                      <span className="font-medium">{i + 1}. {p.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{p.from.toFixed(1)} → {p.to.toFixed(1)}</span>
                        <span className={cn('font-semibold', deltaColorFor(selected.metric, p.delta))}>
                          {fmtDelta(p.delta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
