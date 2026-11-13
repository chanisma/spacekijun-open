/**
 * 학년·학급 단위 시험 결과 분석.
 *
 * 개인 분석과 **같은 판정**(mockGrading / referenceGrade)을 쓰는 `useCohortData` 위에 그린다.
 *
 * 차트 원칙(dataviz):
 *  · 전부 단일 계열이라 범례가 없다 — 제목이 계열을 지목한다.
 *  · 축은 하나뿐. 산점도의 두 축은 같은 척도(정답률 %)라 대각선이 기준선이 된다.
 *  · 반별 비교는 **막대가 아니라 점 + 오차막대**다. 24명 표본에서 막대는 없는 차이를 있어 보이게 한다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ErrorBar, ComposedChart, Cell,
  LineChart, Line, Legend,
} from 'recharts';
// 선 그리기 애니메이션 공용 규약 — 빠뜨리면 선이 다 그려질 때까지 점이 안 보인다
import { drawLineProps } from '@/lib/chartAnimation';
import { AlertTriangle, Info, BarChart3, Calendar } from 'lucide-react';
import {
  PanelTabBar, PanelTab, ListPanel, ListGroupLabel, ListItem, ChipBar, ChipGroupLabel, Chip,
} from '../common/panelChrome';
import { cn } from '@/lib/utils';
import { useCohortData, type CohortExam } from '../../hooks/useCohortData';
import { useCohortOverview, type SubjectSummary } from '../../hooks/useCohortOverview';
import { sortSubjects, groupSubjectsByArea } from '../../utils/subjectOrder';
import { compareGroups } from '../../utils/cohortStats';
import { ABILITY_GROUPS, classifyDiscrimination, classifyItemDifficulty, isDiscriminationConclusive } from '../../utils/itemAnalysis';
// 학년 단위 성적 분석 5종은 student-dashboard 에서 이리로 **옮겨온 탭**이다.
// 컴포넌트 파일 자체는 그대로 두고 import 로 가져온다 — `analysisUtils`·`useGradePrediction`
// 을 대시보드에 남는 분석들과 공유하고 있어, 파일을 옮기면 유틸 계층이 둘로 갈라진다.
import { useAnalysisData } from '@/features/student-dashboard/hooks/useAnalysisData';
import { GradeTrendAnalysis } from '@/features/student-dashboard/components/analysis/GradeTrendAnalysis';
import { MockVsSchoolAnalysis } from '@/features/student-dashboard/components/analysis/MockVsSchoolAnalysis';
import { GradePredictionAnalysis } from '@/features/student-dashboard/components/analysis/GradePredictionAnalysis';
import { PyeonggawonShiftAnalysis } from '@/features/student-dashboard/components/analysis/PyeonggawonShiftAnalysis';
import { useClassRoster } from '../../hooks/useClassRoster';
import ClassRosterTable from './ClassRosterTable';
import type { EvalearnStudent } from '../../types';

type CohortTab =
  | 'overview' | 'roster' | 'items' | 'groups'
  | 'trend' | 'mock-vs-school' | 'pyeonggawon' | 'prediction';

/**
 * 앞 넷은 이 화면이 계산하는 것, 뒤 넷은 학생 대시보드에서 옮겨온 학년 단위 분석.
 * `gradeOnly` = 학년 전체에서만 보인다.
 */
const COHORT_TABS: { id: CohortTab; label: string; gradeOnly?: boolean }[] = [
  { id: 'overview', label: '개요·분포' },
  /*
   * 학생별 요약 — 반·학년 **둘 다** 연다(2026-09-22). 처음엔 "학년 전체(200여 명)는 표로 훑을
   * 크기가 아니다"라며 반에서만 열었다(`classOnly`). 막은 이유는 표가 그 규모를 못 견뎌서였으므로
   * 표를 고쳤다 — 좌석에 반 표기·고정 머리글·범위 문구(`ClassRosterTable` 머리 주석).
   * 학년 목록의 쓸모는 **반을 넘는 순위**다(평균 등급 정렬 = 학년 석차 순).
   */
  { id: 'roster', label: '학생 목록' },
  { id: 'items', label: '문항 분석' },
  { id: 'groups', label: '등급 그룹' },
  { id: 'trend', label: '성취도 추이', gradeOnly: true },
  { id: 'mock-vs-school', label: '내신-모의', gradeOnly: true },
  { id: 'pyeonggawon', label: '6·9월 모평', gradeOnly: true },
  { id: 'prediction', label: 'AI 성적예측', gradeOnly: true },
];

/**
 * 과목 목록의 '전체' 항목. 실제 과목명과 겹치지 않도록 센티넬을 쓴다
 * (`'전체'` 라는 이름의 과목이 생겨도 충돌하지 않는다).
 */
const ALL_SUBJECTS = '__all__';

/** 과목 하나를 골라야 의미가 있는 탭 — '전체'에서는 과목 비교 화면으로 대체된다 */
const SUBJECT_TABS: CohortTab[] = ['items', 'groups'];

interface Props {
  grade: number;
  /** null 이면 학년 전체 */
  classNum: number | null;
  /** 학생 목록에서 이름을 누르면 그 학생의 개인 분석으로 간다 */
  onOpenStudent?: (student: EvalearnStudent) => void;
}

const INK = '#334155';
const MUTED = '#94a3b8';
const GRID = '#e2e8f0';
/** 단일 계열 색 — 의미 있는 상태색(에메랄드=완료 등)과 겹치지 않게 인디고를 쓴다 */
const SERIES = '#6366f1';
const SERIES_SOFT = '#a5b4fc';
/**
 * 9등급제 표준 비율(%) — 등급은 상대평가라 전국이 이 비율에 맞춰 끊긴다.
 * 우리 집단 비율을 이것과 겹쳐 봐야 "1등급이 5명"이 많은 건지 적은 건지 알 수 있다.
 */
const NATIONAL_GRADE_RATIO = [4, 7, 12, 17, 20, 17, 12, 7, 4];

/** 색만으로는 상→하 순서가 안 읽히므로 범례에 등급 범위를 함께 적는다 */
const GROUP_LABELS: Record<string, string> = {
  '상': '상 (1-2등급)',
  '중상': '중상 (3-4등급)',
  '중하': '중하 (5-6등급)',
  '하': '하 (7-9등급)',
};

/**
 * 능력 그룹 색.
 *
 * 처음엔 "순서가 있는 값"이라 한 색상의 명도 램프(인디고 800→400)를 썼는데, 문항순 정답률처럼
 * **네 선이 서로 교차하며 겹치는** 그림에서는 명도만으로 갈라지지 않아 실제로 구분이 안 됐다.
 * 그래서 색상(hue)으로 가른다 — 순서 정보는 범례 라벨이 대신 담는다.
 *
 * 값은 dataviz 검증기(`scripts/validate_palette.js`) 통과본이다:
 * 인접쌍 최악 ΔE 10.3(deutan)·30.8(normal), 흰 바탕 대비 전부 3:1 이상.
 * **색을 바꾸려면 검증기를 다시 돌릴 것** — 초록·주황 조합은 deutan ΔE 1.7 로 떨어진다(실측).
 */
const GROUP_COLORS: Record<string, string> = {
  '상': '#4f46e5',
  '중상': '#ea580c',
  '중하': '#0891b2',
  '하': '#db2777',
};

const CohortAnalysisPanel: React.FC<Props> = ({ grade, classNum, onOpenStudent }) => {
  const [exam, setExam] = useState<CohortExam | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [tab, setTab] = useState<CohortTab>('overview');

  // 옮겨온 학년 단위 분석 4종이 쓰는 데이터. 그 탭을 실제로 열었을 때만 받는다.
  const MOVED_TABS: CohortTab[] = ['trend', 'mock-vs-school', 'pyeonggawon', 'prediction'];
  const isMovedTab = MOVED_TABS.includes(tab);
  const analysisQ = useAnalysisData(isMovedTab ? grade : undefined);

  /**
   * 옮겨온 4개 탭은 **학년 단위 성적 데이터만** 쓴다 — 회차도 과목도 고를 것이 없다.
   * 선택기를 남겨 두면 눌러도 아무 일이 없고, 게다가 아래 `result` 가드에 걸려
   * "문항 데이터가 없는 회차"를 고른 상태에서는 본문까지 빈다.
   */
  const usesExamSubject = !isMovedTab;

  /**
   * 학생 목록은 **회차는 고르되 과목은 고르지 않는다** — 한 행에 전 과목이 들어간다.
   * 과목 칩을 남겨 두면 눌러도 표가 바뀌지 않아 고장처럼 보인다.
   */
  const isRoster = tab === 'roster';

  const isAllSubjects = subject === ALL_SUBJECTS;

  const { students, availableExams, availableSubjects, result, loading } = useCohortData(
    // 목록은 과목 하나의 문항 분석이 필요 없다 — 과목을 넘기지 않아 문항 조회를 건너뛴다
    grade, classNum, exam, isAllSubjects || isRoster ? null : subject
  );

  // '전체'는 과목 수만큼 왕복이 생기므로 실제로 그 화면을 볼 때만 받는다
  const overview = useCohortOverview(
    students, exam, availableSubjects, isAllSubjects && usesExamSubject && !isRoster
  );

  const roster = useClassRoster(students, exam, isRoster);

  // 회차·과목 기본 선택 — 목록이 바뀌면 유효한 값으로 되돌린다
  useEffect(() => {
    if (availableExams.length === 0) { setExam(null); return; }
    const stillValid = exam && availableExams.some(
      (e) => e.academic_year === exam.academic_year && e.exam_month === exam.exam_month && e.exam_grade === exam.exam_grade
    );
    if (!stillValid) setExam(availableExams[0]);
  }, [availableExams, exam]);

  useEffect(() => {
    if (availableSubjects.length === 0) { setSubject(null); return; }
    if (subject === ALL_SUBJECTS) return;
    if (!subject || !availableSubjects.includes(subject)) setSubject(sortSubjects(availableSubjects)[0]);
  }, [availableSubjects, subject]);

  const classComparison = useMemo(() => {
    if (!result || result.byClass.length < 2 || !result.stats) return [];
    return result.byClass.map((c) => {
      const cmp = compareGroups(c.stats, result.stats!);
      return {
        name: `${c.classNum}반`,
        mean: c.stats.mean,
        n: c.stats.n,
        // ±2 표준오차 = 이 범위가 겹치면 차이를 주장하지 않는다
        err: c.stats.standardError != null ? c.stats.standardError * 2 : 0,
        verdict: cmp.verdict,
      };
    });
  }, [result]);

  /**
   * 등급 분포 — 공식 등급이 있으면 그것, 없으면 참고 등급(useCohortData 가 이미 합쳐 둔다).
   * 등급이 아예 없는 학생은 분모에서도 뺀다(0 으로 세면 전 등급 비율이 함께 내려간다).
   */
  const gradeDist = useMemo(() => {
    if (!result) return null;
    const graded = result.scores.filter((s) => s.grade != null);
    if (graded.length === 0) return null;

    const counts = new Array(9).fill(0) as number[];
    for (const s of graded) counts[s.grade! - 1] += 1;

    const bars = counts.map((count, i) => ({
      grade: i + 1,
      count,
      ratio: Math.round((count / graded.length) * 1000) / 10,
      national: NATIONAL_GRADE_RATIO[i],
    }));

    const cum = (upTo: number) =>
      Math.round((counts.slice(0, upTo).reduce((a, b) => a + b, 0) / graded.length) * 1000) / 10;

    return {
      bars,
      n: graded.length,
      /** 등급이 없어 분포에서 빠진 인원 */
      ungraded: result.scores.length - graded.length,
      /** 참고 등급이 섞였는가 — 화면에 밝혀야 한다 */
      hasReference: graded.some((s) => s.gradeIsReference),
      top2: cum(2),
      top3: cum(3),
      top4: cum(4),
    };
  }, [result]);

  // '전체'는 문항 분석·등급 그룹을 계산할 수 없다(문항이 과목마다 다르다) — 탭 강조가 거짓말하지 않게 되돌린다
  useEffect(() => {
    if (isAllSubjects && SUBJECT_TABS.includes(tab)) setTab('overview');
  }, [isAllSubjects, tab]);

  // 반으로 좁히면 학년 전용 탭이 목록에서 빠진다 — 그 탭에 머물러 있으면 본문이 비므로 되돌린다
  useEffect(() => {
    const spec = COHORT_TABS.find((x) => x.id === tab);
    if (spec?.gradeOnly && classNum != null) setTab('overview');
  }, [classNum, tab]);

  return (
    <div className="flex flex-col h-full bg-slate-50/40">
      {/*
        분석 메뉴 — 개인 분석(AnalysisPanel)처럼 패널 최상단에 두고 **항상** 렌더한다.
        데이터 유무로 감싸면 응시 기록이 없는 회차(예: 2026년 8월)를 고르는 순간 메뉴가
        통째로 사라져 다른 탭으로 빠져나갈 방법이 없어진다. 내용이 없다는 것은 본문에서 말한다.
      */}
      <PanelTabBar>
        {COHORT_TABS
          .filter((x) => !x.gradeOnly || classNum == null)
          // '전체'는 문항 단위 계산을 할 수 없다(과목마다 문항이 다르다)
          .filter((x) => !isAllSubjects || !SUBJECT_TABS.includes(x.id))
          .map((t) => (
            <PanelTab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </PanelTab>
          ))}
      </PanelTabBar>

      {/* 개인 분석(MockDataViewer)과 같은 구성 — 왼쪽 시험 목록 + 오른쪽 본문.
          분석 대상(3학년 1반 등)은 헤더가 이미 보여주므로 여기서 제목을 또 달지 않는다. */}
      <div className="flex flex-1 min-h-0">
        {/* ── 왼쪽: 시험 목록 ── */}
        {usesExamSubject && (
        <ListPanel icon={Calendar} title="시험 목록">
          {/*
            최신 회차가 맨 위. 3학년 코호트는 1학년 때 회차까지 이어져 한 덩어리로 흐르면
            어디서 해가 바뀌는지 안 보인다 — 연도가 바뀌는 줄에만 헤더를 끼운다.
          */}
          {availableExams.map((e, idx) => (
            <React.Fragment key={`${e.academic_year}-${e.exam_month}-${e.exam_grade}`}>
              {(idx === 0 || availableExams[idx - 1].academic_year !== e.academic_year) && (
                <ListGroupLabel>{e.academic_year}년</ListGroupLabel>
              )}
              <ListItem
                active={
                  exam?.academic_year === e.academic_year &&
                  exam?.exam_month === e.exam_month &&
                  exam?.exam_grade === e.exam_grade
                }
                onClick={() => setExam(e)}
                label={`${e.exam_month}월`}
                /* 응시 인원 — 회차의 무게를 보여준다. 유독 적은 줄은 데이터 이상 신호다 */
                meta={`${e.studentCount}명`}
                sub={`${e.exam_grade}학년`}
              />
            </React.Fragment>
          ))}
        </ListPanel>
        )}

        {/* ── 오른쪽: 과목 선택 + 분석 본문 ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar">
      {usesExamSubject && !isRoster && (
      /*
        과목 칩 — 분야(국어/수학/영어/과탐/사탐/한국사) 순서는 유지하되 **분야마다 줄을
        바꾸지 않는다**. 분야당 한 줄씩 주면 과목이 한둘뿐인 국어·영어 줄이 거의 비어
        세로로만 길어진다. 한 흐름으로 흘리고 분야는 앞의 작은 라벨로만 구분한다.
      */
      <ChipBar
        right={result?.stats ? <>응시 <strong className="text-slate-700">{result.stats.n}</strong>명</> : undefined}
      >
        {/* '전체' — 과목 하나가 아니라 과목끼리 비교하는 화면. 맨 앞에 둔다 */}
        {availableSubjects.length > 1 && (
          <Chip active={isAllSubjects} onClick={() => setSubject(ALL_SUBJECTS)} className="font-medium">
            전체
          </Chip>
        )}
        {groupSubjectsByArea(availableSubjects).map(({ area, subjects }) => (
          <React.Fragment key={area}>
            <ChipGroupLabel>{area}</ChipGroupLabel>
            {subjects.map((s) => (
              <Chip key={s} active={subject === s} onClick={() => setSubject(s)}>{s}</Chip>
            ))}
          </React.Fragment>
        ))}
      </ChipBar>
      )}

      {/* 로딩·빈 상태는 **본문에서만** 표시한다 — 패널을 통째로 갈아 끼우면 메뉴와 회차 선택이
          함께 사라져 빠져나갈 방법이 없어진다 */}
      {isMovedTab ? (
        /* 학년 단위 분석 — 회차·과목과 무관하므로 `result` 가드 밖에 둔다.
           안에 두면 문항 데이터가 없는 회차를 고른 채로 이 탭에 오면 본문이 통째로 빈다. */
        <div className="p-4">
          {analysisQ.isLoading ? (
            <p className="text-xs text-slate-400 py-8 text-center">불러오는 중…</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white p-3">
              {tab === 'trend' && <GradeTrendAnalysis data={analysisQ.data ?? []} grade={grade} />}
              {tab === 'mock-vs-school' && <MockVsSchoolAnalysis data={analysisQ.data ?? []} />}
              {tab === 'pyeonggawon' && <PyeonggawonShiftAnalysis data={analysisQ.data ?? []} grade={grade} />}
              {tab === 'prediction' && <GradePredictionAnalysis data={analysisQ.data ?? []} grade={grade} />}
            </div>
          )}
        </div>
      ) : isRoster ? (
        /* 학생 목록 — 과목 하나의 문항 데이터(`result`)가 필요 없어 그 가드 밖에 둔다 */
        <div className="p-4">
          {loading && students.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-400">불러오는 중…</div>
          ) : !exam ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 text-center">
              <BarChart3 size={40} className="text-slate-300" />
              <p className="text-sm">이 {classNum == null ? '학년' : '반'}이 응시한 회차가 없습니다</p>
            </div>
          ) : (
            <ClassRosterTable
              rows={roster.rows}
              examLabel={`${exam.academic_year}년 ${exam.exam_month}월 · ${exam.exam_grade}학년`}
              /* 제목에 반 번호를 붙이지 않는다 — 명단은 **현재** 반이라 과거 회차를 고르면
                 당시 반과 다를 수 있다. 범위는 요약 줄("N개 반 · 학년 평균")이 말한다. */
              scope={classNum == null ? 'grade' : 'class'}
              loadingReference={roster.loadingReference}
              onOpenStudent={
                onOpenStudent
                  ? (id) => {
                      const s = students.find((x) => x.id === id);
                      if (s) onOpenStudent(s);
                    }
                  : undefined
              }
            />
          )}
        </div>
      ) : isAllSubjects ? (
        /* 과목 비교 — 과목 하나의 문항 데이터가 아니라 회차 전체를 본다 */
        <div className="p-4">
          {overview.loading && overview.summaries.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-400">불러오는 중…</div>
          ) : overview.summaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 text-center">
              <BarChart3 size={40} className="text-slate-300" />
              <p className="text-sm">이 회차의 과목별 데이터가 없습니다</p>
            </div>
          ) : (
            <SubjectComparison summaries={overview.summaries} />
          )}
        </div>
      ) : loading && !result ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">불러오는 중…</div>
      ) : !result || !result.stats ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 px-6 text-center">
          <BarChart3 size={40} className="text-slate-300" />
          {/*
            "응시 기록이 없다"와 "문항 데이터가 없다"는 다른 상황이다.
            2026-08 이 후자다 — 156명이 마킹했는데 `mock_problems` 에 문항이 0건이라
            정답률·분포를 계산할 근거가 없다. 뭉뚱그리면 데이터를 적재하면 되는 상황을
            학생이 안 본 것으로 오해하게 된다.
          */}
          {availableSubjects.length > 0 ? (
            <>
              <p className="text-sm">이 회차의 <strong className="text-slate-500">문항 데이터가 아직 없습니다</strong></p>
              <p className="text-xs">
                학생 마킹은 있지만 문항 정보(정답·배점·단원)가 적재되지 않아 분석을 계산할 수 없습니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">이 회차·과목의 응시 기록이 없습니다</p>
              <p className="text-xs">위에서 다른 회차나 과목을 골라 보세요.</p>
            </>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {result.pointsIncomplete && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                이 회차는 <strong>문항 배점이 적재되지 않아</strong> 원점수가 실제와 다릅니다.
                분포·등급은 참고만 하세요.
              </span>
            </div>
          )}

          {tab === 'overview' && (<>
          {/* 요약 — 숫자 6개 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatTile label="응시" value={`${result.stats.n}명`} />
            <StatTile label="평균" value={result.stats.mean} sub={`/ ${result.maxScore}`} />
            <StatTile label="중앙값" value={result.stats.median} sub={`/ ${result.maxScore}`} />
            <StatTile label="IQR" value={result.stats.iqr} sub="중간 50% 폭" />
            <StatTile label="최저~최고" value={`${result.stats.min}~${result.stats.max}`} />
            <StatTile
              label="Bowley 왜도"
              value={result.stats.bowleySkew ?? '—'}
              sub={result.stats.bowleySkew != null && Math.abs(result.stats.bowleySkew) > 0.2 ? '비대칭' : '대칭'}
            />
          </div>

          {/* 자동 진단 */}
          {result.diagnostics.length > 0 && (
            <div className="space-y-1.5">
              {result.diagnostics.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                    d.severity === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  )}
                >
                  {d.severity === 'warn'
                    ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    : <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />}
                  <span>{d.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* 원점수 분포 — 여섯 숫자로는 못 보는 봉우리를 여기서 본다 */}
          <Panel title="원점수 분포" hint="5점 구간. 봉우리가 둘이면 중위권이 빈 구조일 수 있습니다.">
            {/* top 여백은 중앙값 레이블이 들어갈 자리다. 8px 로 두면 레이블이 잘린다. */}
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={result.bins} margin={{ top: 24, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="from"
                  tickFormatter={(v) => String(v)}
                  tick={{ fontSize: 10, fill: MUTED }}
                  axisLine={{ stroke: GRID }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                  formatter={(v: number) => [`${v}명`, '인원']}
                  labelFormatter={(v) => `${v}~${Number(v) + 5}점`}
                />
                <ReferenceLine
                  x={Math.floor(result.stats.median / 5) * 5}
                  stroke={INK}
                  strokeDasharray="4 3"
                  label={{ value: `중앙값 ${result.stats.median}`, position: 'top', fontSize: 10, fill: INK }}
                />
                <Bar dataKey="count" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/*
            등급 분포 — 원점수 분포만으로는 "우리가 전국에서 어디쯤인가"를 알 수 없다.
            등급은 상대평가라 **전국 표준 비율과 겹쳐 봐야** 1등급 5명이 많은지 적은지 읽힌다.
            같은 축(%)에 두 계열이라 이중축 문제가 없다.
          */}
          {gradeDist && (
            <Panel
              title="등급 분포"
              hint="막대는 우리 집단 비율, 점선은 전국 표준 비율입니다. 막대가 점선보다 높으면 그 등급이 상대적으로 많습니다."
            >
              <ResponsiveContainer width="100%" height={208}>
                <ComposedChart data={gradeDist.bars} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="grade"
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={{ stroke: GRID }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}등급`}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                    labelFormatter={(v) => `${v}등급`}
                    formatter={(value: number, name: string, entry) => {
                      if (name === '전국 표준') return [`${value}%`, name];
                      return [`${value}% (${entry?.payload?.count ?? 0}명)`, '우리 집단'];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ratio" name="우리 집단" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Line
                    dataKey="national"
                    name="전국 표준"
                    stroke={INK}
                    strokeDasharray="4 3"
                    {...drawLineProps}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              {/* 누적 비율 — 교사가 실제로 먼저 보는 숫자라 차트에서 읽게 하지 않고 따로 낸다 */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>1~2등급 <strong className="text-slate-700">{gradeDist.top2}%</strong></span>
                <span>1~3등급 <strong className="text-slate-700">{gradeDist.top3}%</strong></span>
                <span>1~4등급 <strong className="text-slate-700">{gradeDist.top4}%</strong></span>
                <span className="text-slate-400">등급 보유 {gradeDist.n}명</span>
                {gradeDist.ungraded > 0 && (
                  <span className="text-slate-400">등급 없음 {gradeDist.ungraded}명 제외</span>
                )}
                {gradeDist.hasReference && (
                  <span className="rounded border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                    참고 등급 포함
                  </span>
                )}
              </div>
            </Panel>
          )}

          {/* 반별 비교 — 점 + 오차막대. 순위표는 만들지 않는다 */}
          {classComparison.length >= 2 && (
            <Panel
              title="반별 평균"
              hint="세로선은 ±2 표준오차입니다. 학년 평균선과 겹치면 그 반은 '차이 있음'이 아니라 '판단 보류'입니다."
            >
              {/* 학년 평균 레이블을 오른쪽 바깥에 두면 잘린다 -> 안쪽 상단에 붙인다 */}
              <ResponsiveContainer width="100%" height={208}>
                <ComposedChart data={classComparison} margin={{ top: 20, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRID }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                    formatter={(v: number, _n, p) => [`${v}점 (${p?.payload?.n ?? 0}명)`, '반 평균']}
                  />
                  <ReferenceLine
                    y={result.stats.mean}
                    stroke={INK}
                    strokeDasharray="4 3"
                    label={{ value: `학년 평균 ${result.stats.mean}`, position: 'insideTopRight', fontSize: 10, fill: INK }}
                  />
                  <Scatter dataKey="mean" fill={SERIES}>
                    {classComparison.map((c, i) => (
                      // 판단 보류인 반은 옅게 — 차이가 있다고 읽히지 않게
                      <Cell key={i} fill={c.verdict === 'inconclusive' ? SERIES_SOFT : SERIES} />
                    ))}
                    <ErrorBar dataKey="err" width={6} strokeWidth={2} stroke={MUTED} direction="y" />
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
          )}

          </>)}

          {tab === 'items' && (<>
          {/* 문항 분석 — 교내 vs 전국. 두 축이 같은 척도라 대각선이 기준이다 */}
          {result.items.some((i) => i.nationalRate != null) && (
            <Panel
              title="문항별 정답률 — 교내 vs 전국"
              hint="대각선 아래는 전국보다 못 푼 문항입니다. 아래로 멀수록 우리 학교의 약점입니다."
            >
              <ResponsiveContainer width="100%" height={230}>
                <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis
                    type="number" dataKey="nationalRate" name="전국" domain={[0, 100]}
                    tick={{ fontSize: 10, fill: MUTED }} axisLine={{ stroke: GRID }} tickLine={false}
                    label={{ value: '전국 정답률(%)', position: 'insideBottom', offset: -2, fontSize: 10, fill: MUTED }}
                  />
                  <YAxis
                    type="number" dataKey="schoolRate" name="교내" domain={[0, 100]}
                    tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false}
                    label={{ value: '교내(%)', angle: -90, position: 'insideLeft', fontSize: 10, fill: MUTED }}
                  />
                  <ZAxis range={[40, 40]} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke={MUTED} strokeDasharray="4 3" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof result.items)[number];
                      return (
                        <div className="rounded-lg bg-white/95 px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-slate-800">{d.problemNumber}번</div>
                          <div className="text-slate-500">{d.majorCategory ?? '-'} · {d.subCategory ?? '-'}</div>
                          <div className="mt-1 text-slate-700">교내 {d.schoolRate}% / 전국 {d.nationalRate}%</div>
                          {d.topWrongChoice && (
                            <div className="text-rose-600">오답 쏠림 {d.topWrongChoice.choice}번 {d.topWrongChoice.rate}%</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Scatter data={result.items.filter((i) => i.nationalRate != null)} fill={SERIES} fillOpacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* 오답 쏠림 — 우리만 낼 수 있는 산출물 */}
          <Panel
            title="오답 쏠림"
            hint="한 오답에 30% 이상 몰렸다면 찍은 것이 아니라 공통 오개념입니다. 수업에서 바로 다룰 수 있습니다."
          >
            <WrongChoiceTable items={result.items} />
          </Panel>
          </>)}

          {tab === 'groups' && (
            <GroupAnalysis result={result} />
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

/**
 * 과목 비교 — 과목 리스트에서 '전체'를 골랐을 때의 본문.
 *
 * 과목 하나를 깊이 보는 다른 탭과 목적이 다르다. 여기서 답하는 질문은
 * "**어느 과목이 문제인가**"이고, 그래서 세 그림 전부 y축이 과목이다(가로 막대).
 * 과목명이 길어 세로축에 두는 편이 잘리지 않는다.
 */
const SubjectComparison: React.FC<{ summaries: SubjectSummary[] }> = ({ summaries }) => {
  // 과목 수만큼 높이를 준다 — 고정 높이면 과목이 많은 회차에서 막대가 실처럼 얇아진다
  const chartHeight = Math.max(180, summaries.length * 30 + 40);

  const rateRows = summaries.filter((s) => s.scoreRate != null);
  const gradeRows = summaries.filter((s) => s.meanGrade != null);
  const groupRows = summaries.filter((s) => s.gradedCount > 0);
  const hasReference = summaries.some((s) => s.hasReference);

  return (
    <div className="space-y-4">
      {hasReference && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>공식 등급이 없는 과목은 <strong>참고 등급</strong>(EBS 등급컷)으로 계산했습니다.</span>
        </div>
      )}

      {/* ① 득점률 — 만점이 과목마다 달라(100/50) 원점수 평균으로는 비교가 안 된다 */}
      <Panel
        title="과목별 득점률"
        hint="만점이 과목마다 달라(100점·50점) 원점수 대신 득점률로 비교합니다."
      >
        {rateRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            이 회차는 문항 배점이 적재되지 않아 득점률을 계산할 수 없습니다.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={rateRows} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: MUTED }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="subject"
                width={84}
                tick={{ fontSize: 11, fill: INK }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                formatter={(v: number, _n: string, entry: { payload?: SubjectSummary }) => [
                  `${v}% (평균 ${entry?.payload?.meanScore}/${entry?.payload?.maxScore}점 · ${entry?.payload?.n}명)`,
                  '득점률',
                ]}
              />
              {/* 단일 계열이라 범례가 없다 — 제목이 계열을 지목한다. 값은 막대 끝에 직접 적는다 */}
              <Bar
                dataKey="scoreRate"
                fill={SERIES}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                label={{ position: 'right', fontSize: 10, fill: MUTED, formatter: (v: number) => `${v}%` }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* ② 평균 등급 — 막대가 아니라 점이다. 등급은 0에서 자란 양이 아니라 1~9 위의 위치다 */}
      <Panel
        title="과목별 평균 등급"
        hint="1~9 척도 위의 위치입니다. 왼쪽(1등급)일수록 좋습니다. 등급이 있는 학생만 평균에 넣습니다."
      >
        {gradeRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">등급이 산출된 과목이 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={gradeRows} layout="vertical" margin={{ top: 16, right: 44, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                dataKey="meanGrade"
                domain={[1, 9]}
                ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
                tick={{ fontSize: 10, fill: MUTED }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="subject"
                width={84}
                tick={{ fontSize: 11, fill: INK }}
                axisLine={false}
                tickLine={false}
              />
              <ZAxis range={[90, 90]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                formatter={(v: number, _n: string, entry: { payload?: SubjectSummary }) => [
                  `${v}등급 (${entry?.payload?.gradedCount}명)`,
                  '평균 등급',
                ]}
              />
              {/* 5등급 = 전국 중앙. 이 선보다 왼쪽이면 전국 평균보다 앞선다 */}
              <ReferenceLine
                x={5}
                stroke={MUTED}
                strokeDasharray="4 3"
                label={{ value: '전국 중앙', position: 'top', fontSize: 9, fill: MUTED }}
              />
              <Scatter dataKey="meanGrade" fill={SERIES} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* ③ 등급 그룹 비율 — 평균 하나로는 "상위권이 두꺼운 과목"과 "고루 중간인 과목"이 같아 보인다 */}
      <Panel
        title="과목별 등급 그룹 비율"
        hint="평균만으로는 상위권이 두꺼운 과목과 고르게 중간인 과목이 구분되지 않습니다."
      >
        {groupRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">등급이 산출된 과목이 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight + 24}>
            <BarChart
              data={groupRows.map((s) => ({ subject: s.subject, ...s.groupRatio }))}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: MUTED }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="subject"
                width={84}
                tick={{ fontSize: 11, fill: INK }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                formatter={(v: number, name: string) => [`${v}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* 흰 테두리 2px = 세그먼트 사이 표면 간격. 붙여 두면 인접 색이 서로를 물들인다 */}
              {ABILITY_GROUPS.map((g) => (
                <Bar
                  key={g}
                  dataKey={g}
                  name={GROUP_LABELS[g]}
                  stackId="ratio"
                  fill={GROUP_COLORS[g]}
                  stroke="#fff"
                  strokeWidth={2}
                  maxBarSize={22}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
};

/**
 * 등급 그룹 분석 — 학교가 쓰던 업로드 리포트의 `# | 학교% | 난이도 | 상% | 중상% | 중하% | 하% | D | rpb` 표.
 *
 * 이 표가 답하는 질문은 "이 문항이 잘 작동했는가"다. 정답률만으로는 알 수 없고,
 * **상위권과 하위권이 갈리는지**(D·rpb)를 봐야 한다. 역변별(rpb<0)은 문항이 거꾸로 작동한
 * 것이라 출제 검토 대상이다.
 */
const GroupAnalysis: React.FC<{ result: NonNullable<ReturnType<typeof useCohortData>['result']> }> = ({ result }) => {
  const rows = result.itemStats.filter((i) => i.answered > 0);
  const byNumber = new Map(result.items.map((i) => [i.problemNumber, i]));

  // 5라인 차트용 — 문항 번호 순서 그대로
  const groupSeries = rows.map((it) => ({
    problemNumber: it.problemNumber,
    학교전체: it.correctRate,
    ...Object.fromEntries(ABILITY_GROUPS.map((g) => [g, it.byGroup[g]])),
  }));

  return (
    <div className="space-y-4">
      {/*
        5라인 문항순 정답률 — 업로드 리포트의 핵심 그림.
        선이 서로 붙어 있으면 그 문항은 변별을 못 한 것이고, 상위 선이 아래로 꺼지면
        상위권이 함께 틀린 문항(출제 검토 대상)이다. 숫자표보다 이게 먼저 읽힌다.

        색: 네 그룹은 **순서가 있는 값**이라 categorical 팔레트가 아니라 한 색상의
        명도 램프(진함=상 … 옅음=하)를 쓴다. 학교전체는 비교 기준이라 회색 점선으로 뺀다.
      */}
      <Panel
        title="문항순 정답률 — 등급 그룹별"
        hint="선이 겹치면 변별이 없는 문항, 상위 선이 꺼지면 상위권도 틀린 문항입니다."
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={groupSeries} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="problemNumber"
              tick={{ fontSize: 10, fill: MUTED }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              interval={groupSeries.length > 30 ? 4 : 1}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: MUTED }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
              labelFormatter={(v) => `${v}번 문항`}
              formatter={(value: number | null, name: string) => [value == null ? '—' : `${value}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
            <Line dataKey="학교전체" stroke={INK} strokeDasharray="4 3" {...drawLineProps} />
            {ABILITY_GROUPS.map((g) => (
              <Line key={g} dataKey={g} name={GROUP_LABELS[g]} stroke={GROUP_COLORS[g]} {...drawLineProps} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="rounded-md bg-slate-100 px-2 py-0.5">
          그룹 기준: <strong className="text-slate-700">{result.groupBasis}</strong>
        </span>
        {result.groupBasis === '등급' && <span>상 1~2 · 중상 3~4 · 중하 5~6 · 하 7~9</span>}
        {result.groupBasis === '원점수 사분위' && <span>공식 등급이 없어 원점수 상위 25%씩 나눴습니다</span>}
        {result.smallSample && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800">
            소표본 N&lt;30 — 지표 해석에 주의
          </span>
        )}
      </div>

      {/*
        rpb 를 **단정하지 않는다** — 2026-09-05 실측(`scripts/irt-probe`)에서 같은 회차의
        응시자를 반씩 갈라 다시 계산하면 문항별 rpb 순위 상관이 0.23~0.73 이었다(과목당
        126~190명). 즉 개별 문항의 "고변별/저변별"은 상당수가 표본 요동이다. IRT 2PL 의
        변별도 a 로 바꿔도 재현성은 0.45~0.72 로 비슷해, **지표 선택이 아니라 표본 크기**가
        원인이다. 그래서 값은 그대로 보여 주되 **신뢰구간을 함께** 적고, 구간이 경계를 걸치면
        색으로 단정하지 않는다.
      */}
      <Panel title="문항별 그룹 정답률 · 변별도" hint="D = 상 − 하 (백분율 포인트). rpb = 문항-총점 상관(괄호는 95% 신뢰구간) — 학년 한 개 표본이라 구간이 넓다. 구간이 0.3 을 걸치는 문항은 '우수/미흡'을 단정할 수 없어 회색으로 둔다">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-slate-500">
                <th className="py-1.5 px-2 text-left font-medium">#</th>
                <th className="py-1.5 px-2 text-center font-medium">학교%</th>
                <th className="py-1.5 px-2 text-center font-medium">난이도</th>
                {ABILITY_GROUPS.map((g) => (
                  <th key={g} className="py-1.5 px-2 text-center font-medium">{g}%</th>
                ))}
                <th className="py-1.5 px-2 text-center font-medium">D</th>
                <th className="py-1.5 px-2 text-center font-medium">rpb</th>
                <th className="py-1.5 px-2 text-left font-medium">단원</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const band = classifyDiscrimination(it.rpb);
                // 구간이 경계를 걸치면 판정을 색으로 단정하지 않는다(값은 그대로 보여 준다)
                const solid = isDiscriminationConclusive(it);
                const diff = classifyItemDifficulty(it.correctRate);
                const meta = byNumber.get(it.problemNumber);
                return (
                  <tr key={it.problemNumber} className={cn('border-b border-gray-50', band === '역변별' && solid && 'bg-rose-50/60')}>
                    <td className="py-1.5 px-2 font-medium text-slate-700">{it.problemNumber}</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{it.correctRate}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px]',
                        diff === '쉬움' ? 'bg-emerald-50 text-emerald-700'
                          : diff === '어려움' ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                      )}>{diff}</span>
                    </td>
                    {ABILITY_GROUPS.map((g) => (
                      <td key={g} className="py-1.5 px-2 text-center text-slate-500">
                        {it.byGroup[g] ?? '—'}
                      </td>
                    ))}
                    <td className={cn('py-1.5 px-2 text-center font-medium',
                      it.discrimination != null && it.discrimination < 0 ? 'text-rose-600' : 'text-slate-700')}>
                      {it.discrimination ?? '—'}
                    </td>
                    <td className={cn('py-1.5 px-2 text-center whitespace-nowrap',
                      !solid ? 'text-slate-400'
                        : band === '역변별' ? 'text-rose-600 font-semibold'
                        : band === '고변별' ? 'text-emerald-700' : 'text-slate-500')}>
                      {it.rpb ?? '—'}
                      {it.rpbCI && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({it.rpbCI[0].toFixed(2)}~{it.rpbCI[1].toFixed(2)})
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-slate-400 min-w-0">
                      <span className="block truncate max-w-[160px]" title={`${meta?.majorCategory ?? ''} · ${meta?.subCategory ?? ''}`}>
                        {meta?.subCategory ?? meta?.majorCategory ?? '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-gray-100 bg-white px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-base font-bold text-slate-800 leading-tight">{value}</div>
    {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
  </div>
);

const Panel: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-3">
    <div className="mb-2">
      <h3 className="text-xs font-bold text-slate-700">{title}</h3>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
    {children}
  </div>
);

const WrongChoiceTable: React.FC<{ items: { problemNumber: number; majorCategory: string | null; subCategory: string | null; topWrongChoice: { choice: number; rate: number } | null; schoolRate: number }[] }> = ({ items }) => {
  const rows = items
    .filter((i) => i.topWrongChoice && i.topWrongChoice.rate >= 30)
    .sort((a, b) => (b.topWrongChoice!.rate) - (a.topWrongChoice!.rate))
    .slice(0, 12);

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 py-2">한 오답에 30% 이상 몰린 문항이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-slate-500">
            <th className="py-1.5 px-2 text-left font-medium">문항</th>
            <th className="py-1.5 px-2 text-left font-medium">단원</th>
            <th className="py-1.5 px-2 text-center font-medium">교내 정답률</th>
            <th className="py-1.5 px-2 text-center font-medium">몰린 오답</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.problemNumber} className="border-b border-gray-50">
              <td className="py-1.5 px-2 font-medium text-slate-700">{r.problemNumber}번</td>
              <td className="py-1.5 px-2 text-slate-500 min-w-0">
                <span className="block truncate" title={`${r.majorCategory ?? ''} · ${r.subCategory ?? ''}`}>
                  {r.majorCategory ?? '-'} · {r.subCategory ?? '-'}
                </span>
              </td>
              <td className="py-1.5 px-2 text-center text-slate-600">{r.schoolRate}%</td>
              <td className="py-1.5 px-2 text-center">
                <span className="font-semibold text-rose-600">{r.topWrongChoice!.choice}번</span>
                <span className="text-slate-500"> {r.topWrongChoice!.rate}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CohortAnalysisPanel;
