import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchoolExamSubjectOverview } from '../../../services/schoolExamService';

interface Props {
  rows: SchoolExamSubjectOverview[];
  onSelectSubject: (subjectSection: string) => void;
  /**
   * 학년 내 위치(석차·상위%·분포)를 감춘다 — **학생 본인 화면**에서 켠다.
   * (2026-09-04 사용자 결정: 학생에게 상대적 석차 분석을 제공하지 않는다)
   *
   * 이 화면은 과목을 고르는 진입점이기도 해서 통째로 없앨 수 없다. 상자그림 대신
   * "과목 · 내 점수"만 있는 목록을 그려 **길은 남기고 순위만 걷어낸다**.
   */
  hideRanking?: boolean;
}

// ── 색 (dataviz: emphasis 패턴 — 분포는 맥락(회색), 학생은 요점(강조색 1개)) ──
//
// 성적 분포에 색으로 우열을 칠하지 않는다. 상자 안에서의 **위치**가 이미 그 정보이고,
// 색까지 얹으면 같은 사실을 두 번 말하면서 "빨간 과목 = 못하는 과목"이라는 낙인만 남는다.
//
// 데이터를 지닌 마크는 전부 표면(#f8fafc) 대비 3:1 이상으로 검증했다:
//   상자 윤곽선 slate-600 7.24:1 · 중앙값 slate-800 9.85:1(상자 위) · 강조점 indigo-600 4.23:1(상자 위)
// 상자 채움(slate-300, 1.42:1)은 의도적으로 뒤로 물러난 면이고, 사분위 경계는 윤곽선이 진다.
const MARK = {
  whisker: '#475569',   // slate-600
  boxFill: '#cbd5e1',   // slate-300
  boxStroke: '#475569', // slate-600
  median: '#1e293b',    // slate-800
  student: '#4f46e5',   // indigo-600 (앱 brand-600)
  grid: '#e2e8f0',      // slate-200 — hairline, solid
};

const TICKS = [0, 25, 50, 75, 100];

/**
 * 마크 반지름만큼 트랙 안쪽으로 물린 폭.
 * 0점·100점 마크를 `left:0%`/`left:100%` + `translateX(-50%)`로 두면 절반이 트랙 밖으로
 * 나가 잘린다(라이브에 최저 0점·최고 100점이 실제로 있다). 양끝을 이만큼 들여 그린다.
 */
const INSET = 6;

/** 점수(0~100) → 트랙 좌표. 양끝 INSET을 뺀 구간에 선형 배치한다. */
function at(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  return `calc(${INSET}px + ${clamped / 100} * (100% - ${INSET * 2}px))`;
}

/** 두 점수 사이의 폭 (상자·수염 길이) */
function span(from: number, to: number): string {
  const a = Math.max(0, Math.min(100, from));
  const b = Math.max(0, Math.min(100, to));
  return `calc(${Math.max(0, b - a) / 100} * (100% - ${INSET * 2}px))`;
}

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : Number(v).toFixed(1);
}

type SortKey = 'weakest' | 'name';

const SchoolExamBoxPlot: React.FC<Props> = ({ rows, onSelectSubject, hideRanking = false }) => {
  const [sortKey, setSortKey] = useState<SortKey>('weakest');
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sortKey === 'name') {
      list.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'));
    } else if (hideRanking) {
      // 순위를 감출 땐 백분위로 정렬하지 않는다 — **정렬 순서 자체가 석차를 드러낸다**.
      // 내 점수만으로 낮은 과목이 위로. 채점 전(null)은 맨 아래.
      list.sort((a, b) => (a.totalScore ?? Infinity) - (b.totalScore ?? Infinity));
    } else {
      // 취약한 과목이 위로. 백분위가 없는 과목(채점 전)은 맨 아래.
      list.sort((a, b) => (b.percentile ?? -1) - (a.percentile ?? -1));
    }
    return list;
  }, [rows, sortKey, hideRanking]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-8 text-center">
        <p className="text-xs text-slate-400">이 고사의 응시 기록이 없습니다.</p>
      </div>
    );
  }

  // 학생 화면: 순위·분포 없이 "무엇을 봤고 몇 점인가"만
  if (hideRanking) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-3">
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-600">과목별 내 점수</p>
            <p className="text-[10px] text-slate-400 mt-0.5">과목을 누르면 문항별 분석을 볼 수 있습니다</p>
          </div>
          <button
            type="button"
            onClick={() => setSortKey((k) => (k === 'weakest' ? 'name' : 'weakest'))}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors flex items-center gap-1 shrink-0"
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortKey === 'weakest' ? '점수순' : '과목명순'}
          </button>
        </div>
        <ul className="space-y-0.5">
          {sorted.map((row) => (
            <li key={row.subjectSection}>
              <button
                type="button"
                onClick={() => onSelectSubject(row.subjectSection)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700" title={row.subjectName}>
                  {row.subjectName}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] font-semibold text-slate-700 tabular-nums">
                    {row.totalScore != null ? row.totalScore.toFixed(1) : '—'}
                  </span>
                  {row.totalScore == null && (
                    <span className="block text-[9px] text-slate-400">채점 전</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-3">
      {/* 제목이 무엇을 그린 것인지 말하므로 시리즈가 하나뿐인 이 차트에는 범례 상자를 두지 않는다.
          대신 상자그림 자체를 읽는 법을 한 줄로 둔다 — 범례가 아니라 해독기다. */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-600">과목별 성적 분포</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            상자 = 학년 25~75%<span className="mx-1 text-slate-300">·</span>
            <span className="inline-block align-middle w-[2px] h-[9px] mr-0.5" style={{ background: MARK.median }} />
            중앙값<span className="mx-1 text-slate-300">·</span>
            수염 = 최저~최고<span className="mx-1 text-slate-300">·</span>
            <span
              className="inline-block align-middle w-2 h-2 rounded-full mr-0.5 ring-2 ring-white"
              style={{ background: MARK.student }}
            />
            이 학생
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSortKey((k) => (k === 'weakest' ? 'name' : 'weakest'))}
            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors flex items-center gap-1"
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortKey === 'weakest' ? '취약순' : '과목명순'}
          </button>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className={cn(
              'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1',
              showTable ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            <Table2 className="h-3 w-3" />
            표
          </button>
        </div>
      </div>

      {showTable ? (
        <SummaryTable rows={sorted} />
      ) : (
        <>
          {/* 눈금 — 과목마다 같은 0~100 축을 쓰기 때문에 과목 간 비교가 성립한다 */}
          <div className="flex items-center gap-2">
            <div className="w-[92px] shrink-0" />
            <div className="relative flex-1 h-4">
              {TICKS.map((t) => (
                <span
                  key={t}
                  className="absolute top-0 text-[9px] text-slate-400 tabular-nums -translate-x-1/2"
                  style={{ left: at(t) }}
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="w-[76px] shrink-0" />
          </div>

          <ul className="space-y-0.5">
            {sorted.map((row, index) => (
              <BoxRow
                key={row.subjectSection}
                row={row}
                // 첫 행의 판독 상자를 위로 띄우면 카드 밖으로 나가고, 이 카드는 스크롤
                // 컨테이너 안에 있어 그대로 잘린다. 첫 행만 아래로 편다.
                tooltipBelow={index === 0}
                hovered={hovered === row.subjectSection}
                onHover={setHovered}
                onSelect={onSelectSubject}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

function BoxRow({
  row, hovered, tooltipBelow, onHover, onSelect,
}: {
  row: SchoolExamSubjectOverview;
  hovered: boolean;
  tooltipBelow: boolean;
  onHover: (key: string | null) => void;
  onSelect: (subjectSection: string) => void;
}) {
  const hasBox = row.q1 != null && row.q3 != null && row.median != null;
  const score = row.totalScore;
  // 채점이 진행 중인 과목은 분포가 **채점된 학생만**으로 계산돼 표본이 편향돼 있다
  // (라이브 2026-1 2차 화학: 99명 응시 중 24명 채점). 같은 굵기의 상자로 나란히 두면
  // 191명짜리 과목과 같은 신뢰도로 읽히므로, 상자를 점선으로 낮추고 비율을 명시한다.
  const partial = hasBox && row.takenCount > row.cohortCount;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.subjectSection)}
        onMouseEnter={() => onHover(row.subjectSection)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(row.subjectSection)}
        onBlur={() => onHover(null)}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg px-0.5 py-1 transition-colors text-left',
          hovered ? 'bg-slate-50' : 'hover:bg-slate-50/60'
        )}
        title={`${row.subjectName} — 문항별 분석 보기`}
      >
        {/* 과목명은 텍스트 토큰을 쓴다. 마크만 색을 입고 글자는 색으로 정보를 나르지 않는다. */}
        <span className="w-[92px] shrink-0 text-[11px] text-slate-700 truncate" title={row.subjectName}>
          {row.subjectName}
        </span>

        <span className="relative flex-1 h-6">
          {/* 격자 — 표면에서 한 단계만 떨어진 회색, 1px 실선, 뒤로 물러난다 */}
          {TICKS.map((t) => (
            <span
              key={t}
              className="absolute inset-y-0 w-px"
              style={{ left: at(t), background: MARK.grid }}
            />
          ))}

          {hasBox ? (
            <>
              {/* 수염: 최저~최고 */}
              <span
                className="absolute top-1/2 h-[1.5px] -translate-y-1/2"
                style={{
                  left: at(row.lo!),
                  width: span(row.lo!, row.hi!),
                  background: MARK.whisker,
                }}
              />
              {[row.lo!, row.hi!].map((v, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 w-px h-2 -translate-y-1/2"
                  style={{ left: at(v), background: MARK.whisker }}
                />
              ))}

              {/* 사분위 상자 — 경계가 곧 데이터라 윤곽선이 값을 진다.
                  채점 중이면 점선 윤곽 + 옅은 채움으로 "아직 굳지 않은 분포"임을 드러낸다. */}
              <span
                className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[2px]"
                style={{
                  left: at(row.q1!),
                  width: `max(2px, ${span(row.q1!, row.q3!)})`,
                  background: partial ? 'transparent' : MARK.boxFill,
                  border: `1px ${partial ? 'dashed' : 'solid'} ${MARK.boxStroke}`,
                }}
              />

              {/* 중앙값 — 학생 점수와 겹칠 때 점(10px)+흰링(4px)에 통째로 덮이지 않도록
                  상자보다 높게 뽑아 위아래 끝이 항상 삐져나오게 한다. "딱 중간이다"가
                  가장 흔한 판독인데 하필 그때 선이 사라지면 안 된다. */}
              <span
                className="absolute top-1/2 w-[2px] h-5 -translate-y-1/2 -translate-x-1/2 rounded-[1px]"
                style={{ left: at(row.median!), background: MARK.median }}
              />
            </>
          ) : (
            <span className="absolute inset-y-0 left-0 flex items-center text-[10px] text-slate-300">
              채점 전
            </span>
          )}

          {/* 이 학생 — 표면색 2px 링을 둘러 상자·중앙값선 위에서도 또렷하게 남는다 */}
          {score != null && (
            <span
              className="absolute top-1/2 w-2.5 h-2.5 rounded-full -translate-y-1/2 -translate-x-1/2 ring-2 ring-white"
              style={{ left: at(score), background: MARK.student }}
            />
          )}

          {/* 마크마다 붙는 hover 판독 — 다섯 수치 요약을 표로 가지 않고도 읽을 수 있게 */}
          {hovered && hasBox && (
            <span
              className={cn(
                'absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 text-white text-[10px] px-2 py-1 shadow-lg pointer-events-none tabular-nums',
                tooltipBelow ? 'top-full mt-1' : 'bottom-full mb-1'
              )}
              // 판독 상자는 넓어서 트랙 끝에 붙으면 카드 밖으로 넘친다 — 18~82%로 묶는다.
              style={{ left: `${Math.min(82, Math.max(18, score ?? row.median!))}%` }}
            >
              최저 {fmt(row.lo)} · 25% {fmt(row.q1)} · 중앙 {fmt(row.median)} · 75% {fmt(row.q3)} · 최고 {fmt(row.hi)}
              <span className="text-slate-300">
                {' '}(평균 {fmt(row.avg)} · {partial
                  ? `${row.takenCount}명 중 ${row.cohortCount}명 채점`
                  : `${row.cohortCount}명`})
              </span>
            </span>
          )}
        </span>

        <span className="w-[76px] shrink-0 text-right">
          <span className="block text-[11px] font-semibold text-slate-700 tabular-nums">
            {score != null ? score.toFixed(1) : '—'}
          </span>
          <span className="block text-[9px] tabular-nums">
            {partial ? (
              <span className="text-amber-600">채점 {row.cohortCount}/{row.takenCount}</span>
            ) : row.percentile != null ? (
              <span className="text-slate-400">상위 {row.percentile.toFixed(0)}% · {row.cohortCount}명</span>
            ) : (
              <span className="text-slate-400">{row.takenCount}명</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** 같은 수치를 그대로 읽을 수 있는 표 — 차트를 못 읽는 경우의 동등한 경로 */
function SummaryTable({ rows }: { rows: SchoolExamSubjectOverview[] }) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-[11px] border-separate border-spacing-0 min-w-[560px]">
        <thead>
          <tr className="bg-slate-50/80">
            {['과목', '내 점수', '상위', '석차', '최저', '25%', '중앙값', '75%', '최고', '평균', '채점/응시'].map((h, i) => (
              <th
                key={h}
                className={cn(
                  'px-2 py-1.5 text-[10px] font-semibold text-slate-500 border-b border-slate-100 whitespace-nowrap',
                  i === 0 ? 'text-left' : 'text-right'
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subjectSection} className="hover:bg-slate-50/60">
              <td className="px-2 py-1.5 border-b border-slate-50 text-slate-700 max-w-[140px] truncate" title={row.subjectName}>
                {row.subjectName}
              </td>
              <td className="px-2 py-1.5 border-b border-slate-50 text-right font-semibold text-slate-700 tabular-nums">
                {row.totalScore != null ? row.totalScore.toFixed(1) : '—'}
              </td>
              <td className="px-2 py-1.5 border-b border-slate-50 text-right text-slate-600 tabular-nums">
                {row.percentile != null ? `${row.percentile.toFixed(0)}%` : '—'}
              </td>
              <td className="px-2 py-1.5 border-b border-slate-50 text-right text-slate-500 tabular-nums">
                {row.rank ?? '—'}
              </td>
              {[row.lo, row.q1, row.median, row.q3, row.hi, row.avg].map((v, i) => (
                <td key={i} className="px-2 py-1.5 border-b border-slate-50 text-right text-slate-500 tabular-nums">
                  {fmt(v)}
                </td>
              ))}
              <td
                className={cn(
                  'px-2 py-1.5 border-b border-slate-50 text-right tabular-nums',
                  row.takenCount > row.cohortCount ? 'text-amber-600' : 'text-slate-400'
                )}
              >
                {row.cohortCount}/{row.takenCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SchoolExamBoxPlot;
