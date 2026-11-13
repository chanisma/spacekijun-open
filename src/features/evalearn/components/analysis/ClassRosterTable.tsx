/**
 * 학급·학년 학생 목록 — 한 회차의 학생별 요약 표.
 *
 * 다른 집단 분석 탭이 "이 반은 어떤가"에 답한다면, 이 표는 "**누가 어디에 있나**"에 답한다.
 * 그래서 학생이 행이고 과목 영역이 열이며, 모든 열이 정렬 키다. 계산은 전부
 * `utils/classRoster.ts` 에 있고 여기는 그리기만 한다.
 *
 * **학년 목록(200여 명)도 같은 표다** (2026-09-22). 처음엔 "학년 전체는 표로 훑을 크기가
 * 아니다"라며 반에서만 열었는데, 그건 표가 그 규모를 감당하게 만들지 않았다는 뜻이었다.
 * 200행에서 깨지는 세 곳을 함께 고쳤다:
 *  ① 번호만으로는 반이 섞여 누군지 모른다 → 학년 목록은 `3-07` 처럼 반을 붙인다
 *  ② 스크롤하면 머리글이 사라져 어느 열이 무슨 과목인지 모른다 → 표 자체 세로 스크롤 + 고정 머리글
 *  ③ "반 평균" 문구 → 범위에 맞춰 "학년 평균"
 *
 * 등급 칸 색은 집단 분석의 **능력 그룹과 같은 네 구간**(1-2 / 3-4 / 5-6 / 7-9)이다.
 * 한 색상의 명도 램프라 순서가 색으로 읽히고, 글자 대비는 전부 4.5:1 이상이다.
 */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Info, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ROSTER_SLOTS,
  defaultSortDirection,
  formatRosterSeat,
  resolveSlotHeaders,
  sortRosterRows,
  summarizeRoster,
  type RosterCell,
  type RosterRow,
  type RosterScope,
  type RosterSortKey,
  type SortDirection,
} from '../../utils/classRoster';

interface Props {
  rows: RosterRow[];
  /** 예: "2026년 9월 · 1학년" */
  examLabel: string;
  /** 반 하나 / 학년 전체. 표기(좌석·요약 문구)만 달라지고 판정은 같다 */
  scope?: RosterScope;
  loadingReference?: boolean;
  /** 이름을 누르면 그 학생의 개인 분석으로 간다 */
  onOpenStudent?: (studentId: string) => void;
}

/**
 * 고정 머리글.
 *
 * ① **`top: -1px` 이지 `top: 0` 이 아니다.** 스크롤 컨테이너의 윗변이 반 픽셀(예: 78.5px)에
 *    걸리면, 머리글과 스크롤된 행이 **같은 경계에서 함께 잘려** 그 픽셀 줄에서 머리글이 절반만
 *    덮는다 → 합성 결과가 `0.75 흰색 + 0.25 아래 행`이 되어 등급 칩 색이 머리글 윗선에 점점이
 *    비친다(2026-09-22 실측: 경계 줄 색 섞인 픽셀 73개 → `-1px` 로 0개). 1px 올리면 경계 픽셀을
 *    **전부 덮은 뒤에** 잘리므로 흰색만 남는다. 배율 1배 모니터(학교 PC 대부분)에서만 보이고
 *    레티나에서는 반 픽셀이 정수 기기 픽셀이라 안 보인다 — 개발 화면에서 놓치기 쉽다.
 * ② 아래 선은 그림자로 그린다 — `border-collapse` 표에서는 고정 칸의 테두리가 스크롤과 함께
 *    밀려 사라진다.
 */
const STICKY_HEAD = 'sticky -top-px bg-white shadow-[inset_0_-1px_0_#e2e8f0]';

const GRADE_BANDS: { upTo: number; className: string; label: string }[] = [
  { upTo: 2, className: 'bg-brand-600 text-white border-brand-600', label: '1-2' },
  { upTo: 4, className: 'bg-brand-100 text-brand-800 border-brand-100', label: '3-4' },
  { upTo: 6, className: 'bg-slate-100 text-slate-700 border-slate-100', label: '5-6' },
  { upTo: 9, className: 'bg-white text-slate-500 border-slate-200', label: '7-9' },
];

const bandClass = (grade: number) => GRADE_BANDS.find((b) => grade <= b.upTo)!.className;

const SortButton: React.FC<{
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, direction, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-0.5 whitespace-nowrap transition-colors',
      active ? 'text-brand-600 font-semibold' : 'text-slate-500 hover:text-slate-700'
    )}
  >
    {children}
    {active
      ? (direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
      : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
  </button>
);

const ScoreCell: React.FC<{ cell: RosterCell | undefined; showSubject: boolean }> = ({ cell, showSubject }) => {
  if (!cell) return <span className="text-slate-300">—</span>;
  if (cell.unscored) {
    // 응시는 했는데 문항·배점·등급컷이 없어 점수를 만들 수 없다 — "안 봤다"와 구분한다
    return <span className="text-[10px] text-slate-400" title="응시 기록은 있으나 공식 성적·참고 등급을 계산할 수 없습니다">미채점</span>;
  }
  const detail = [
    cell.rawScore != null ? `${cell.rawScore}` : null,
    cell.percentile != null ? `${cell.isReference ? '≈' : ''}${cell.percentile}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col items-center leading-tight">
      {/* 3학년 국·수 선택과목, 탐구처럼 칸마다 과목이 다를 때만 이름을 적는다 */}
      {showSubject && (
        <span className="max-w-[72px] truncate text-[10px] text-slate-400" title={cell.subject}>{cell.subject}</span>
      )}
      {cell.grade != null ? (
        <span
          className={cn(
            'inline-flex h-5 min-w-[22px] items-center justify-center rounded border px-1 text-[11px] font-bold tabular-nums',
            bandClass(cell.grade),
            // 참고 등급은 점선 테두리 — 공식 등급과 섞여 있어도 한눈에 가려진다
            cell.isReference && 'border-dashed border-amber-500'
          )}
          title={cell.isReference ? '참고 등급 (EBS 예상 등급컷)' : undefined}
        >
          {cell.grade}
        </span>
      ) : (
        <span className="text-[11px] text-slate-400">—</span>
      )}
      {detail && <span className="mt-0.5 text-[10px] tabular-nums text-slate-400">{detail}</span>}
    </div>
  );
};

export const ClassRosterTable: React.FC<Props> = ({ rows, examLabel, scope = 'class', loadingReference, onOpenStudent }) => {
  const isGrade = scope === 'grade';
  const scopeWord = isGrade ? '학년' : '반';
  // 처음엔 번호순 — 표를 열었을 때 명단으로 읽히는 편이 자연스럽다
  const [sortKey, setSortKey] = useState<RosterSortKey>('student');
  const [direction, setDirection] = useState<SortDirection>('asc');

  const toggle = (key: RosterSortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // 첫 클릭은 항상 "잘한 순" — 등급은 오름차순, 백분위는 내림차순이 그 방향이다
    setDirection(defaultSortDirection(key));
  };

  const sorted = useMemo(() => sortRosterRows(rows, sortKey, direction), [rows, sortKey, direction]);
  const headers = useMemo(() => resolveSlotHeaders(rows), [rows]);
  const summary = useMemo(() => summarizeRoster(rows), [rows]);
  const hasPercentile = rows.some((r) => r.overallPercentile != null);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 text-center">
        <Users size={40} className="text-slate-300" />
        <p className="text-sm">이 {scopeWord}의 재학생 명단이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-700">학생 목록 — {examLabel}</h3>
        <p className="text-[11px] text-slate-500">
          {isGrade && <><strong className="text-slate-700">{summary.classCount}</strong>개 반 · </>}
          재적 <strong className="text-slate-700">{summary.enrolled}</strong>명 · 응시{' '}
          <strong className="text-slate-700">{summary.taken}</strong>명
          {summary.meanGrade != null && (
            <> · {scopeWord} 평균 등급 <strong className="text-slate-700">{summary.meanGrade.toFixed(2)}</strong></>
          )}
        </p>
      </div>

      {/* 읽는 법 — 칸의 숫자 두 줄과 평균의 정의를 한 번만 적는다 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>칸 = 등급 / 원점수 · 백분위</span>
        <span className="inline-flex items-center gap-1">
          {GRADE_BANDS.map((b) => (
            <span key={b.label} className={cn('rounded border px-1 text-[10px] font-semibold', b.className)}>{b.label}</span>
          ))}
          <span className="ml-0.5">등급</span>
        </span>
        <span>평균 등급 = 국·수·영·탐(2과목 평균), 절대평가인 한국사 제외</span>
        {summary.hasReference && (
          <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 text-amber-700">
            점선 = 참고 등급(EBS 예상컷), ≈ 백분위는 근사치
          </span>
        )}
        {loadingReference && <span>참고 등급 계산 중…</span>}
      </div>

      {summary.hasUnscored && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
          <span>
            <strong>미채점</strong>은 응시 기록은 있지만 공식 성적이 아직 없고 문항·배점·등급컷도 적재되지 않아
            점수를 만들 수 없는 칸입니다.
          </span>
        </div>
      )}

      {/*
        표 자체가 두 방향으로 스크롤한다. 가로 = 열이 9개라 좁은 화면에서 본문이 밀리지 않게,
        세로 = 학년 목록은 200행이 넘어 **머리글이 화면 밖으로 사라진다** → 높이를 묶고 머리글을 고정한다.
        (바깥 패널 스크롤에 맡기면 sticky 가 걸릴 조상이 이 div 라 머리글이 고정되지 않는다 —
         overflow-x 가 있는 요소는 세로로도 스크롤 컨테이너가 된다.)
      */}
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {/* 왼쪽 위 모서리 칸은 가로·세로 고정이 겹치므로 가장 위에 둔다 */}
              <th className={cn(STICKY_HEAD, 'left-0 z-30 py-2 px-2 text-left')}>
                <SortButton active={sortKey === 'student'} direction={direction} onClick={() => toggle('student')}>
                  {isGrade ? '반 · 번호 · 이름' : '번호 · 이름'}
                </SortButton>
              </th>
              {ROSTER_SLOTS.map(({ slot }) => (
                <th key={slot} className={cn(STICKY_HEAD, 'z-20 py-2 px-1.5 text-center')}>
                  <SortButton active={sortKey === slot} direction={direction} onClick={() => toggle(slot)}>
                    {headers[slot].label}
                  </SortButton>
                </th>
              ))}
              <th className={cn(STICKY_HEAD, 'z-20 border-l border-slate-200 py-2 px-2 text-center')}>
                <SortButton active={sortKey === 'overallGrade'} direction={direction} onClick={() => toggle('overallGrade')}>
                  평균 등급
                </SortButton>
              </th>
              {hasPercentile && (
                <th className={cn(STICKY_HEAD, 'z-20 py-2 px-2 text-center')}>
                  <SortButton
                    active={sortKey === 'overallPercentile'}
                    direction={direction}
                    onClick={() => toggle('overallPercentile')}
                  >
                    국수탐 백분위
                  </SortButton>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className={cn('border-b border-slate-100 hover:bg-slate-50/60', row.absent && 'bg-slate-50/40')}>
                <td className="sticky left-0 z-10 bg-white py-1.5 px-2 whitespace-nowrap">
                  <span className="mr-1.5 text-slate-400 tabular-nums">{formatRosterSeat(row, scope)}</span>
                  {onOpenStudent ? (
                    <button
                      type="button"
                      onClick={() => onOpenStudent(row.id)}
                      className="font-medium text-slate-700 hover:text-brand-600 hover:underline underline-offset-2"
                      title="개인 분석 열기"
                    >
                      {row.name}
                    </button>
                  ) : (
                    <span className="font-medium text-slate-700">{row.name}</span>
                  )}
                  {row.absent && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">미응시</span>
                  )}
                </td>
                {ROSTER_SLOTS.map(({ slot }) => (
                  <td key={slot} className="py-1.5 px-1.5 text-center align-middle">
                    <ScoreCell cell={row.cells[slot]} showSubject={!headers[slot].uniform} />
                  </td>
                ))}
                <td className="border-l border-slate-200 py-1.5 px-2 text-center tabular-nums">
                  {row.overallGrade != null ? (
                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-bold text-slate-800">{row.overallGrade.toFixed(2)}</span>
                      {/* 영역이 4개가 아니면 다른 학생과 같은 조건이 아니다 — 정렬 전에 알아야 한다 */}
                      {row.gradeAreas < 4 && (
                        <span className="text-[9px] text-amber-600" title="응시한 영역만 평균에 넣었습니다">
                          {row.gradeAreas}영역
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                {hasPercentile && (
                  <td className="py-1.5 px-2 text-center tabular-nums">
                    {row.overallPercentile != null ? (
                      <span className="inline-flex items-baseline gap-1">
                        <span className="font-semibold text-slate-700">{row.overallPercentile.toFixed(1)}</span>
                        {row.percentileAreas < 3 && (
                          <span className="text-[9px] text-amber-600" title="백분위가 있는 영역만 평균에 넣었습니다">
                            {row.percentileAreas}영역
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.absentNames.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          미응시 {summary.absentNames.length}명은 정렬과 무관하게 맨 아래에 둡니다.
        </p>
      )}
    </div>
  );
};

export default ClassRosterTable;
