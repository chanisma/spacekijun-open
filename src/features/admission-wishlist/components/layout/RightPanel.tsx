import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, ChevronLeft, ChevronRight, Sigma, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useStudentNaesin, useStudentSubjects } from '../../hooks/useStudentNaesin';
import { useMockRoundsWithReference } from '../../hooks/useMockRoundsWithReference';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import CollapsibleCard from './CollapsibleCard';
import { cn } from '@/lib/utils';
import { mockByArea, type CsatArea } from '../../utils/csat';
import { pickMockSummaryRounds } from '../../utils/mockSummary';
import { resolveIsFiveTier } from '../../utils/naesinScale';
import { toGrade9 } from '../../utils/gradeScaleConvert';
import {
  summarizeNaesin, NAESIN_COMBOS, NAESIN_SINGLE_GROUPS, type NaesinGroupStat,
} from '../../utils/naesinSummary';

/** 직전 회차 대비 추세 (등급 숫자 ↓ = 성적 ↑ = 상승) */
type Trend = 'up' | 'down' | 'same';
const TREND_META: Record<Trend, { Icon: typeof TrendingUp; cls: string; label: string }> = {
  up:   { Icon: TrendingUp,   cls: 'text-emerald-600', label: '상승' },
  same: { Icon: Minus,        cls: 'text-slate-400',   label: '유지' },
  down: { Icon: TrendingDown, cls: 'text-red-500',     label: '하락' },
};

interface Props {
  /** 표시 대상 학생 코드 (학생 본인 뷰면 본인, 교사 뷰면 선택 학생) */
  studentCode: string | null;
}

/** 과목별 내신 한 행 (훅 반환 타입에서 유도 — 컴포넌트 안에서 `typeof subjectsQ.data`
 *  를 쓰면 useMemo 가 훅 객체를 타입으로 참조해 exhaustive-deps 경고가 난다) */
type SubjectRow = NonNullable<ReturnType<typeof useStudentSubjects>['data']>[number];

/** 과목 묶는 기준 */
type SubjectGroupMode = 'term' | 'subject';
const SUBJECT_GROUP_KEY = 'admission-wishlist-subject-group-v1';

/** 교과군 표시 순서 — 데이터 등장 순서로 두면 학생마다 순서가 달라진다 */
const GROUP_ORDER = ['국어', '영어', '수학', '사회', '과학', '한국사', '기타'];

const GROUP_SHORT: Record<string, string> = {
  '국어': '국어', '수학': '수학', '영어': '영어',
  '사회(역사/도덕포함)': '사회', '과학': '과학', '한국사': '한국사',
  '기술・가정/제2외국어/한문/교양': '기타', '기술·가정/정보': '기타', '제2외국어/한문': '기타',
};

/**
 * 학생 성적 데이터 패널 (우측 서랍식). 수능최저·반영내신 계산의 원천 데이터를 열람:
 * 모의 영역별 등급 + 과목별 내신(석차·성취도·단위). LeftPanel 과 대칭.
 */
export function RightPanel({ studentCode }: Props) {
  // 공식 회차 + 참고 등급 회차(성적 발표 전 9월 등). 참고 등급은 evalearn 과 같은 서비스로 계산한다.
  const { rounds, isLoading: roundsLoading, hasReference } = useMockRoundsWithReference(studentCode);
  const subjectsQ = useStudentSubjects(studentCode);
  const naesinQ = useStudentNaesin(studentCode);
  // 요약에 놓을 6·9월이 "몇 학년의 6·9월"인지 정하는 기준 (학년도). 회차 목록에 학년이 없다.
  const academicTermQ = useAcademicTerm();

  // 교과군 요약 — 대학마다 반영 교과가 달라 "전교과 평균" 하나로는 상담이 안 된다.
  const summary = useMemo(() => summarizeNaesin(subjectsQ.data ?? null), [subjectsQ.data]);

  // 등급 척도: 학번 접두사 1차 판정 → 과목 기록으로 확정 보정 (전입생 오판 방지)
  const isFiveTier = useMemo(
    () => (studentCode ? resolveIsFiveTier(studentCode, subjectsQ.data ?? null) : false),
    [studentCode, subjectsQ.data],
  );
  // 5등급제 학생의 전교과 평균을 컷과 같은 9등급 척도로 환산한 값 (병기용)
  const overallG9 = useMemo(() => {
    const avg = summary.combos['전교과']?.avg;
    if (!isFiveTier || avg == null) return null;
    return toGrade9(avg, true, naesinQ.data?.subjectCount ?? null);
  }, [isFiveTier, summary, naesinQ.data?.subjectCount]);

  // 회차 탐색 (rounds[0] = 최신). 학생 바뀌면 최신으로 리셋, 길이 변화 대비 클램프.
  const [roundIdx, setRoundIdx] = useState(0);
  useEffect(() => { setRoundIdx(0); }, [studentCode]);
  const safeIdx = Math.min(roundIdx, Math.max(0, rounds.length - 1));
  const current = rounds[safeIdx] ?? null;
  const prev = rounds[safeIdx + 1] ?? null; // 더 과거(직전) 회차 — 추세 비교 기준

  /**
   * 모의고사 요약 — **3학년 6월·9월 평가원 모의평가**를 나란히.
   *
   * 학평(3·5·7·10월)이 아니라 평가원 두 회차를 쓰는 이유: 수시 지원 판단의 기준이 되는 것이
   * 이 둘이고, 수능최저 가늠도 여기서 한다. 상담에서 "6월에서 9월로 어떻게 됐나"가 첫 질문이라
   * 회차를 하나씩 넘겨 보던 것을 한눈에 놓는다.
   *
   * 회차 선택 규칙은 `pickMockSummaryRounds`(순수) — 없는 회차를 **다른 학년의 같은 달로
   * 메우지 않고** 가장 최근 회차로 채운다. 기준 학년도는 학사력.
   */
  const recentSummary = useMemo(() => {
    // 수능최저는 국·수·영·탐·한 다섯 영역으로 따지므로 요약도 다섯 영역을 전부 보여준다.
    // 탐구는 두 과목이라 한 칸에 둘을 함께 적는다(예 "3·4").
    const AREAS: Array<{ key: CsatArea; label: string }> = [
      { key: '국', label: '국' },
      { key: '수', label: '수' },
      { key: '영', label: '영' },
      { key: '탐', label: '탐' },
      { key: '한', label: '한' },
    ];

    return pickMockSummaryRounds(rounds, academicTermQ.data?.year ?? null).map((p) => {
      const areas = mockByArea(p.round.subjects);
      return {
        key: p.key,
        label: p.label,
        yearNote: p.yearNote,
        isReference: p.round.isReference === true,
        grades: AREAS.map(({ key, label }) => {
          // 탐구는 두 과목 — 좋은 등급(숫자가 작은 쪽)부터
          const found = areas.filter((a) => a.area === key).map((a) => a.grade).sort((x, y) => x - y);
          return { label, grades: found };
        }),
      };
    });
  }, [rounds, academicTermQ.data?.year]);

  const mockAreas = useMemo(
    () => (current ? mockByArea(current.subjects) : []),
    [current]
  );
  // 직전 회차의 과목별·영역best 등급 (추세 비교용)
  const prevBySubject = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of prev?.subjects ?? []) {
      if (!m.has(s.subject) || s.grade < m.get(s.subject)!) m.set(s.subject, s.grade);
    }
    return m;
  }, [prev]);
  const prevByArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of prev ? mockByArea(prev.subjects) : []) {
      if (!m.has(a.area) || a.grade < m.get(a.area)!) m.set(a.area, a.grade);
    }
    return m;
  }, [prev]);
  // 추세: 같은 과목 우선, 없으면 같은 영역 best 와 비교
  const trendOf = (area: string, subject: string, grade: number): Trend | null => {
    if (!prev) return null;
    const pg = prevBySubject.get(subject) ?? prevByArea.get(area);
    if (pg == null) return null;
    return grade < pg ? 'up' : grade > pg ? 'down' : 'same';
  };

  /**
   * 과목별 내신 묶는 기준 — 학기순 / 교과군순.
   *
   * 두 기준이 서로 다른 질문에 답한다: 학기순은 "이번 학기에 뭘 들었나",
   * 교과군순은 "수학은 쭉 어땠나"(반영 교과가 대학마다 달라 상담에서 자주 묻는다).
   * 습관이 사람마다 달라 선택을 `localStorage` 에 남긴다.
   */
  const [groupMode, setGroupMode] = useState<SubjectGroupMode>('term');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUBJECT_GROUP_KEY);
      if (saved === 'term' || saved === 'subject') setGroupMode(saved);
    } catch {
      /* 시크릿 모드 등 저장소 접근 불가 — 기본값(학기순) */
    }
  }, []);
  const setMode = (m: SubjectGroupMode) => {
    setGroupMode(m);
    try { localStorage.setItem(SUBJECT_GROUP_KEY, m); } catch { /* 무시 */ }
  };

  // 학년-학기로 묶기
  const termGroups = useMemo(() => {
    const byTerm = new Map<string, SubjectRow[]>();
    for (const s of subjectsQ.data ?? []) {
      const key = `${s.grade}-${s.semester}`;
      if (!byTerm.has(key)) byTerm.set(key, []);
      byTerm.get(key)!.push(s);
    }
    return Array.from(byTerm.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [subjectsQ.data]);

  /**
   * 교과군으로 묶기. 그룹 안은 **학년-학기 순**으로 정렬해 같은 교과의 흐름이 보이게 한다
   * (교과군으로 묶는 목적이 곧 그 흐름을 읽는 것이다).
   * 그룹 순서는 `GROUP_ORDER` 고정 — 데이터 등장 순서로 두면 학생마다 순서가 달라진다.
   */
  const subjectGroups = useMemo(() => {
    const byGroup = new Map<string, SubjectRow[]>();
    for (const s of subjectsQ.data ?? []) {
      const key = GROUP_SHORT[s.subjectGroup] ?? '기타';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(s);
    }
    for (const list of byGroup.values()) {
      list.sort((a, b) => a.grade - b.grade || a.semester - b.semester);
    }
    return Array.from(byGroup.entries()).sort(
      ([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
    );
  }, [subjectsQ.data]);

  if (!studentCode) {
    return (
      <aside className="w-72 h-full border-l border-slate-200/60 bg-gray-50 p-4 shrink-0">
        <p className="text-xs text-slate-400">학생을 선택하면 성적 데이터가 표시됩니다.</p>
      </aside>
    );
  }

  return (
    <aside className="w-72 h-full border-l border-slate-200/60 bg-gray-50 overflow-y-auto custom-scrollbar shrink-0 min-w-[18rem] p-3 space-y-3">
      {/* 내신 요약 (교과군 조합별 평균) — 반영 교과가 대학마다 달라 조합별로 본다 */}
      <CollapsibleCard
        id="naesin-summary"
        title={
          <>
            <Sigma className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <h2 className="font-bold text-slate-800 text-sm">내신 요약</h2>
            <span className="text-[9.5px] font-medium text-slate-400 border border-slate-200 rounded px-1 py-px">
              {isFiveTier ? '5등급제' : '9등급제'}
            </span>
          </>
        }
        summary={<span className="text-[10px] text-slate-400">{fmtGrade(summary.combos['전교과'])}</span>}
      >

        {subjectsQ.isLoading ? (
          <p className="text-[11px] text-slate-400">불러오는 중...</p>
        ) : !summary.hasData ? (
          <p className="text-[11px] text-slate-400">석차등급이 있는 과목이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {/* 전교과 — 대표값이라 크게 */}
            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
              <div className="text-[10px] text-slate-400">평균등급 · 전교과</div>
              <div className="text-lg font-bold text-slate-800 leading-tight tabular-nums">
                {fmtGrade(summary.combos['전교과'])}
                {overallG9 != null && (
                  <span
                    className="text-brand-700 text-sm"
                    title="5등급제 내신을 대학 커트라인과 같은 9등급 척도로 환산한 값"
                  >
                    {' → '}{overallG9.toFixed(2)}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-medium ml-1">
                  {summary.combos['전교과'].count}과목
                </span>
              </div>
            </div>

            {/* 반영 교과 조합 — 대학마다 반영 교과가 달라 이건 항상 보인다 */}
            <div className="grid grid-cols-3 gap-1">
              {NAESIN_COMBOS.filter((c) => c.key !== '전교과').map((c) => (
                <StatBox key={c.key} label={c.key} stat={summary.combos[c.key]} />
              ))}
            </div>

            {/*
              교과군별(국·수·영·사·과·한국사) 여섯 칸은 첫 화면에 다 펴 두면 카드가 길어져
              아래 카드들이 밀린다. 필요할 때만 편다 — 상담에서 먼저 보는 건 위의 조합값이다.
            */}
            <details className="group">
              <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-600 list-none flex items-center gap-1">
                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                교과군별 보기
              </summary>
              <div className="grid grid-cols-3 gap-1 mt-1">
                {NAESIN_SINGLE_GROUPS.map((g) => (
                  <StatBox key={g} label={g} stat={summary.groups[g]} />
                ))}
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed mt-1">
                이수단위 가중평균 · 석차등급이 나오는 과목만. 한국사는 사회와 분리해 계산합니다.
              </p>
            </details>
          </div>
        )}
      </CollapsibleCard>

      {/* 과목별 내신 (반영내신 계산 원천) */}
      <CollapsibleCard
        id="naesin-subjects"
        title={
          <>
            <BookOpen className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <h2 className="font-bold text-slate-800 text-sm">과목별 내신</h2>
          </>
        }
        defaultOpen={false}
      >
        <div className="flex items-center justify-end gap-2 mb-2">
          {/* 묶는 기준 토글 — 학기순 / 교과순 */}
          <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
            {(['term', 'subject'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  groupMode === m
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
                title={m === 'term' ? '학년·학기 순으로 묶기' : '교과군으로 묶기'}
              >
                {m === 'term' ? '학기순' : '교과순'}
              </button>
            ))}
          </div>
        </div>
        {subjectsQ.isLoading ? (
          <p className="text-[11px] text-slate-400">불러오는 중...</p>
        ) : termGroups.length === 0 ? (
          <p className="text-[11px] text-slate-400">성적 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {(groupMode === 'term' ? termGroups : subjectGroups).map(([key, subs]) => {
              const [g, sem] = key.split('-');
              return (
                <div key={key}>
                  <div className="text-[10px] font-semibold text-slate-400 mb-0.5">
                    {groupMode === 'term' ? `${g}학년 ${sem}학기` : key}
                  </div>
                  <ul className="space-y-0.5">
                    {subs.map((s, i) => {
                      const isCareer = s.rank == null && s.category === 'career';
                      const isPF = s.achievement === 'P';
                      return (
                        <li key={i} className="flex items-center justify-between text-[11px] gap-1">
                          <span className="text-slate-600 truncate flex items-center gap-1">
                            {/* 묶은 기준은 머리글이 이미 말해 준다 — 행에는 **나머지 축**을 적는다.
                                학기로 묶었으면 교과군을, 교과로 묶었으면 학년·학기를 보여야
                                같은 정보를 두 번 읽지 않는다. */}
                            <span className="text-[9px] text-slate-400 w-7 shrink-0">
                              {groupMode === 'term'
                                ? (GROUP_SHORT[s.subjectGroup] ?? '기타')
                                : `${s.grade}-${s.semester}`}
                            </span>
                            <span className="truncate">{s.subject}</span>
                          </span>
                          <span className="shrink-0 flex items-center gap-1">
                            {s.achievement && <span className="text-[9px] text-slate-400">{s.achievement}</span>}
                            {s.rank != null ? (
                              <span className="font-bold text-slate-800">{s.rank}등급</span>
                            ) : isPF ? (
                              <span className="text-slate-400">P/F</span>
                            ) : isCareer ? (
                              <span className="text-violet-600">진로</span>
                            ) : (
                              <span className="text-slate-300">–</span>
                            )}
                            <span className="text-[9px] text-slate-400">{s.units}단위</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleCard>
      {/* 모의고사 요약 — 3학년 6월·9월 평가원을 국·수·영·탐·한 다섯 영역으로 나란히.
          종전엔 회차를 하나씩 넘겨야 비교가 됐다. 없는 회차 자리는 최근 회차로 채우고
          그 회차가 다른 학년도면 연도를 함께 적는다(어느 학년 9월인지 구분). */}
      {recentSummary.length > 0 && (
        <CollapsibleCard
          id="mock-summary"
          title={
            <>
              <BarChart3 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <h2 className="font-bold text-slate-800 text-sm">모의고사 요약</h2>
            </>
          }
          summary={
            <span className="text-[10px] text-slate-400 tabular-nums">
              {recentSummary.map((r) => (r.yearNote ? `${r.yearNote} ${r.label}` : r.label)).join(' · ')}
            </span>
          }
        >
          <div className="space-y-1.5">
            <div className="grid grid-cols-[2.6rem_repeat(5,1fr)] gap-x-1 text-[10px] text-slate-400">
              <span />
              {recentSummary[0].grades.map((g) => (
                <span key={g.label} className="text-center">{g.label}</span>
              ))}
            </div>
            {recentSummary.map((r) => (
              <div key={r.key} className="grid grid-cols-[2.6rem_repeat(5,1fr)] gap-x-1 items-center">
                <span className="text-[11px] text-slate-500 tabular-nums flex flex-col leading-none">
                  <span className="flex items-center gap-0.5">
                    {r.label}
                    {r.isReference && (
                      <span className="text-[8px] text-amber-600" title="참고 등급 — 공식 성적 발표 전 추정치">*</span>
                    )}
                  </span>
                  {r.yearNote && (
                    <span className="text-[8px] text-slate-400 pt-0.5" title={`${r.yearNote}학년도 회차`}>
                      {r.yearNote}
                    </span>
                  )}
                </span>
                {r.grades.map((g) => (
                  <span key={g.label} className="text-center text-xs font-bold tabular-nums leading-tight">
                    {g.grades.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      g.grades.map((grade, i) => (
                        <span key={i} className={cn(
                          grade <= 2 ? 'text-emerald-600'
                            : grade <= 4 ? 'text-blue-600'
                            : grade <= 6 ? 'text-amber-600'
                            : 'text-red-500'
                        )}>
                          {i > 0 && <span className="text-slate-300 font-normal">·</span>}
                          {grade}
                        </span>
                      ))
                    )}
                  </span>
                ))}
              </div>
            ))}
            {hasReference && (
              <p className="text-[9px] text-amber-700/80 pt-0.5">
                &apos;참고&apos;는 EBS 예상 등급컷으로 추정한 값이며 공식 등급이 아닙니다.
              </p>
            )}
          </div>
        </CollapsibleCard>
      )}

      {/* 모의고사 영역별 등급 (수능최저 계산 원천) — 회차 < > 탐색 + 직전 회차 대비 추세 */}
      <CollapsibleCard
        id="mock-areas"
        defaultOpen={false}
        title={
          <>
            <BarChart3 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <h2 className="font-bold text-slate-800 text-sm">모의고사 영역별</h2>
          </>
        }
        summary={<span className="text-[10px] text-slate-400 tabular-nums">{current ? `${current.academicYear}.${current.examMonth}` : ''}</span>}
      >
        <div className="flex items-center justify-end gap-2 mb-2">
          {rounds.length > 0 && current && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setRoundIdx(safeIdx + 1)}
                disabled={safeIdx >= rounds.length - 1}
                className="p-0.5 text-slate-400 enabled:hover:text-brand-600 disabled:opacity-30 transition-colors"
                title="이전(과거) 회차"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-medium text-slate-500 tabular-nums min-w-[3.4rem] text-center">
                {current.academicYear}.{current.examMonth}
                <span className="text-slate-300"> ({safeIdx + 1}/{rounds.length})</span>
              </span>
              <button
                onClick={() => setRoundIdx(safeIdx - 1)}
                disabled={safeIdx <= 0}
                className="p-0.5 text-slate-400 enabled:hover:text-brand-600 disabled:opacity-30 transition-colors"
                title="다음(최신) 회차"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {roundsLoading ? (
          <p className="text-[11px] text-slate-400">불러오는 중...</p>
        ) : mockAreas.length === 0 ? (
          <p className="text-[11px] text-slate-400">모의고사 성적이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {mockAreas.map((a) => {
              const trend = trendOf(a.area, a.subject, a.grade);
              const meta = trend ? TREND_META[trend] : null;
              return (
                <div key={`${a.area}-${a.subject}`} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{a.area} <span className="text-[10px] text-slate-400">{a.subject}</span></span>
                  <span className="flex items-center gap-1">
                    <span className="font-bold text-slate-800">{a.grade}등급</span>
                    {meta && (
                      <span title={`직전 회차 대비 ${meta.label}`} className="flex items-center">
                        <meta.Icon className={`w-3 h-3 ${meta.cls}`} aria-label={meta.label} />
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            {prev && (
              <p className="text-[9px] text-slate-400 pt-1">
                추세 = 직전 회차({prev.academicYear}.{prev.examMonth}) 대비 · <span className="text-emerald-600">상승</span>/<span className="text-slate-400">유지</span>/<span className="text-red-500">하락</span>
              </p>
            )}
          </div>
        )}
      </CollapsibleCard>

    </aside>
  );
}

/** 등급 표기 — 값이 없으면 '–' (0 이하는 성적 없음이라 숫자로 찍지 않는다) */
function fmtGrade(stat: NaesinGroupStat | undefined): string {
  if (!stat || stat.avg == null || !(stat.avg > 0)) return '–';
  return stat.avg.toFixed(2);
}

/** 조합·교과군 한 칸 (라벨 + 평균등급 + 과목 수 툴팁) */
function StatBox({ label, stat }: { label: string; stat: NaesinGroupStat | undefined }) {
  const empty = !stat || stat.avg == null;
  return (
    <div
      className={`rounded-md border px-1.5 py-1 text-center ${
        empty ? 'border-slate-100 bg-slate-50/50' : 'border-slate-200/70 bg-white'
      }`}
      title={stat && stat.count > 0 ? `${label} · ${stat.count}과목 / ${stat.units}단위` : `${label} · 기록 없음`}
    >
      <div className="text-[9px] text-slate-400 truncate">{label}</div>
      <div className={`text-[12px] font-bold tabular-nums ${empty ? 'text-slate-300' : 'text-slate-800'}`}>
        {fmtGrade(stat)}
      </div>
    </div>
  );
}
