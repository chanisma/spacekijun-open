import { Fragment, useMemo, useState } from 'react';
import { Search, FileText, ChevronRight, ChevronsDownUp, ChevronsUpDown, FileDown, Ban, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { isChosungMatch, cn } from '@/lib/utils';
import { isClubFormData, type DocType, type DocumentIssue, type ParticipantSnapshot } from '../types';
import { useIssues } from '../hooks/useIssues';
import { useIssueAccess } from '../hooks/useIssueAccess';
import { IssueRowActions } from './IssueRowActions';
import { IssueClassRows } from './IssueClassRows';
import { IssueClubRows } from './IssueClubRows';
import { IssuePersonalRows } from './IssuePersonalRows';

/**
 * 대장 학년·반 컬럼 라벨. 참여자 스냅샷(students)에서 학년/반 분포를 요약한다.
 *  - 한 반:            "2학년 3반"
 *  - 한 학년·여러 반:  "2학년" (학년 전체/복수 반 선택)
 *  - 여러 학년:        "1학년·3학년" (학년별 나열)
 *  - 스냅샷 없음:      record.grade로 폴백, 없으면 remarks 그룹 라벨, 그것도 없으면 빈 문자열
 */
function summarizeGradeClass(issue: DocumentIssue): string {
  // 동아리 봉사는 학년·반 대신 동아리명(들)을 표시 (회원이 여러 학년에 걸침)
  if (issue.doc_type === 'volunteer_club' && isClubFormData(issue.form_data)) {
    const names = issue.form_data.clubs.map(c => c.club_name);
    if (names.length === 0) return '동아리';
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}개`;
  }
  const students = issue.students ?? [];
  const withGrade = students.filter(s => s.grade != null);

  if (withGrade.length === 0) {
    // 명단 스냅샷이 없는 기록(예: import batch)
    //  → 대표 grade가 있으면 "N학년[ M반]", 없으면 remarks의 그룹 라벨("1학년/3학년"·"동아리")
    if (issue.grade) return `${issue.grade}학년${issue.class_number ? ` ${issue.class_number}반` : ''}`;
    return issue.remarks?.trim() ?? '';
  }

  const grades = [...new Set(withGrade.map(s => s.grade as number))].sort((a, b) => a - b);
  if (grades.length > 1) {
    return grades.map(g => `${g}학년`).join('·');
  }

  // 단일 학년 — 반 분포 확인
  const grade = grades[0];
  const classes = [...new Set(withGrade.filter(s => s.class != null).map(s => s.class as number))];
  if (classes.length === 1) return `${grade}학년 ${classes[0]}반`;
  return `${grade}학년`; // 여러 반(학년 전체 포함)
}

export interface ClassGroup {
  grade: number;
  cls: number;
  students: ParticipantSnapshot[];
}

/**
 * 참여자 명단을 (학년, 반) 단위로 묶어 정렬 반환. 학년/반이 없는 학생은 제외.
 * 반별 아코디언 전개·반별 출력의 데이터 소스.
 */
export function groupByClass(students: ParticipantSnapshot[]): ClassGroup[] {
  const map = new Map<string, ClassGroup>();
  for (const s of students) {
    if (s.grade == null || s.class == null) continue;
    const key = `${s.grade}_${s.class}`;
    if (!map.has(key)) map.set(key, { grade: s.grade, cls: s.class, students: [] });
    map.get(key)!.students.push(s);
  }
  return [...map.values()].sort((a, b) => a.grade - b.grade || a.cls - b.cls);
}

/** 반별 전개가 의미 있는 record인가 (반이 2개 이상). */
export function isClassExpandable(issue: DocumentIssue): boolean {
  return issue.doc_type === 'volunteer_class' && groupByClass(issue.students).length >= 2;
}

/** 동아리 전개가 의미 있는 record인가 (동아리가 1개 이상 — 활동 내용을 행에서 작성). */
export function isClubExpandable(issue: DocumentIssue): boolean {
  return issue.doc_type === 'volunteer_club'
    && isClubFormData(issue.form_data)
    && issue.form_data.clubs.length >= 1;
}

/**
 * 개인봉사 행을 같은 제출 묶음(meta.batch_id)끼리 묶는다. batch_id가 없는 레거시 행은
 * 각자 단독 배치로 취급(안전한 폴백). 배치 내 정렬은 issue_no 오름차순.
 */
export interface PersonalBatch {
  key: string;                 // batch_id 또는 단독 행이면 자기 id
  issues: DocumentIssue[];     // issue_no 오름차순
}
export function groupByBatch(issues: DocumentIssue[]): PersonalBatch[] {
  const personal = issues.filter(i => i.doc_type === 'volunteer_personal');
  const map = new Map<string, DocumentIssue[]>();
  for (const i of personal) {
    const key = i.meta?.batch_id || i.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(i);
  }
  return [...map.entries()]
    .map(([key, group]) => ({ key, issues: [...group].sort((a, b) => a.issue_no.localeCompare(b.issue_no)) }))
    .sort((a, b) => a.issues[0].issue_no.localeCompare(b.issues[0].issue_no));
}

/** 배치 전개가 의미 있는가 (배치 안에 행이 2개 이상). */
export function isPersonalExpandable(batch: PersonalBatch): boolean {
  return batch.issues.length >= 2;
}

/**
 * 대장 대표 행으로 쓸 issue 선택 — 취소된 행의 제목/명단으로 대표 행 내용을 채우면
 * 안 되므로, 배치 안에 살아있는(active) 행이 하나라도 있으면 그 행을 대표로 쓴다.
 * 전부 취소된 배치는 첫 행(취소됨)을 그대로 대표로 쓴다.
 */
function pickRepresentative(batch: PersonalBatch): DocumentIssue {
  return batch.issues.find(i => i.status === 'active') ?? batch.issues[0];
}

interface Props {
  docTypes: DocType[];
  variant: 'gajeong' | 'volunteer';
  onEdit: (issue: DocumentIssue) => void;
  /** 반별 행에서 특정 반 명단만 수정 (반별 봉사 전용). 없으면 반별 전개를 끈다. */
  onEditClass?: (issue: DocumentIssue, filter: { grade: number; cls: number }) => void;
  /** 다운로드 버튼 → 미리보기 확인 모달 (filter 없으면 통합, 있으면 반별) */
  onExport?: (issue: DocumentIssue, filter?: { grade: number; cls: number }) => void;
  /** 동아리 행에서 그 동아리의 활동 내용 작성 (동아리 봉사 전용). 없으면 동아리 전개를 끈다. */
  onEditClub?: (issue: DocumentIssue, clubId: string) => void;
  /** 동아리 행에서 그 동아리 확인서 다운로드 */
  onExportClub?: (issue: DocumentIssue, clubId: string) => void;
  /** 개인봉사 하위 행에서 그 학생 확인서 개별 다운로드 (개인봉사 전용). 없으면 개인 전개를 끈다. */
  onExportPersonal?: (issue: DocumentIssue) => void;
  /** 개인봉사 대표 행에서 배치 전체 통합 다운로드 */
  onExportPersonalBatch?: (batch: PersonalBatch) => void;
  /** 헤더 좌측에 끼울 추가 컨트롤 (예: 봉사 개인/반 세그먼트 탭) */
  segment?: React.ReactNode;
}

export function IssueLedger({
  docTypes, variant, onEdit, onEditClass, onExport, onEditClub, onExportClub,
  onExportPersonal, onExportPersonalBatch, segment,
}: Props) {
  const { issues, isLoading, cancel, cancelBatch } = useIssues(docTypes);
  const { canEdit } = useIssueAccess();
  const [search, setSearch] = useState('');
  // 전체 내용 보기 토글: 기본 OFF(모두 접힘). overrides = expandAll 반대로 토글된 행 id.
  const [expandAll, setExpandAll] = useState(false);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number | 'all'>(currentYear);

  const isRowOpen = (id: string) => (expandAll ? !overrides.has(id) : overrides.has(id));
  const toggleRow = (id: string) => setOverrides(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleExpandAll = () => { setExpandAll(v => !v); setOverrides(new Set()); };

  const years = useMemo(() => {
    const s = new Set(issues.map(i => i.issue_year));
    s.add(currentYear);
    return [...s].sort((a, b) => b - a);
  }, [issues, currentYear]);

  const searchFiltered = useMemo(() => {
    return issues.filter(i => {
      if (year !== 'all' && i.issue_year !== year) return false;
      if (!search.trim()) return true;
      const hay = [i.issue_no, i.title, i.department ?? '', ...i.students.map(s => s.name)].join(' ');
      return hay.toLowerCase().includes(search.toLowerCase()) ||
             i.students.some(s => isChosungMatch(s.name, search));
    });
  }, [issues, search, year]);

  // 개인봉사 행은 배치(meta.batch_id)로 묶어 대장에 대표 행 1개만 노출하고,
  // 배치 안에 검색·연도 필터를 통과한 형제가 하나라도 있으면 그 배치를 표시한다.
  // 대표 행 = 배치 안의 살아있는(active) 행 중 issue_no가 가장 빠른 것(전부 취소면 첫 행).
  const personalBatches = useMemo(() => groupByBatch(searchFiltered), [searchFiltered]);
  const batchByRepId = useMemo(
    () => new Map(personalBatches.map(b => [pickRepresentative(b).id, b])),
    [personalBatches],
  );

  // 렌더 대상: 비-개인 행은 그대로, 개인 행은 배치당 대표 행 1개로 축약(issue_no 순 정렬 유지).
  const filtered = useMemo(() => {
    const nonPersonal = searchFiltered.filter(i => i.doc_type !== 'volunteer_personal');
    const personalReps = personalBatches.map(pickRepresentative);
    return [...nonPersonal, ...personalReps].sort((a, b) => a.issue_no.localeCompare(b.issue_no));
  }, [searchFiltered, personalBatches]);

  // 전개 가능한 행(반 2개+, 동아리 1개+, 배치 2행+)이 하나라도 있으면 '전체 내용' 토글을 노출
  const anyExpandable = useMemo(
    () => filtered.some(i =>
      (!!onEditClass && isClassExpandable(i)) ||
      (!!onEditClub && isClubExpandable(i)) ||
      (!!onExportPersonal && batchByRepId.has(i.id) && isPersonalExpandable(batchByRepId.get(i.id)!))),
    [filtered, onEditClass, onEditClub, onExportPersonal, batchByRepId],
  );

  // 삭제 = 소프트 삭제. 행은 대장에 남고 발급번호만 "취소됨" 상태로 표시된다(결번 방지).
  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast.success('삭제(취소)되었습니다. 발급번호는 대장에 남습니다.');
    } catch (e) {
      console.error(e);
      toast.error('삭제하지 못했습니다. 권한을 확인해 주세요.');
    }
  };

  // 개인봉사 배치 일괄 삭제 — 배치 안의 살아있는 발급을 한 번에 취소.
  const handleCancelBatch = async (batch: PersonalBatch) => {
    const activeIds = batch.issues.filter(i => i.status === 'active').map(i => i.id);
    if (activeIds.length === 0) return;
    try {
      await cancelBatch.mutateAsync(activeIds);
      toast.success(`${activeIds.length}건 삭제(취소)되었습니다. 발급번호는 대장에 남습니다.`);
    } catch (e) {
      console.error(e);
      toast.error('삭제하지 못했습니다. 권한을 확인해 주세요.');
    }
  };

  const colCount = 7;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm">
      {/* 필터 바 — 둥근 칩 클러스터 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
        {segment}

        <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-slate-50/80 py-1 pl-3 pr-1 focus-within:border-brand-300 focus-within:bg-white transition-colors">
          <Search className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="발급번호·이름·내용·부서"
            className="w-40 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none sm:w-56"
            aria-label="발급 내역 검색"
          />
        </div>

        {/* 전체 내용 토글 — 모든 동아리/반 하위 내용 펼치기 (기본 ON) */}
        {anyExpandable && (
          <button
            type="button"
            onClick={toggleExpandAll}
            title={expandAll ? '하위 내용을 모두 접습니다' : '모든 동아리·반의 하위 내용을 펼칩니다'}
            aria-pressed={expandAll}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all',
              expandAll
                ? 'border-brand-200 bg-brand-50 text-brand-600'
                : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600',
            )}
          >
            {expandAll
              ? <ChevronsDownUp className="h-3.5 w-3.5" strokeWidth={2} />
              : <ChevronsUpDown className="h-3.5 w-3.5" strokeWidth={2} />}
            전체 내용
          </button>
        )}

        {/* 연도 세그먼트 */}
        <div className={cn('flex items-center gap-0.5 rounded-full border border-slate-200/60 bg-slate-100/80 p-0.5', !anyExpandable && 'ml-auto')}>
          <YearChip label="전체" active={year === 'all'} onClick={() => setYear('all')} />
          {years.map(y => (
            <YearChip key={y} label={`${y}`} active={year === y} onClick={() => setYear(y)} />
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="w-12 px-3 py-2.5 sm:px-4 font-medium">순</th>
              <th className="px-3 py-2.5 font-medium">발급번호</th>
              <th className="px-3 py-2.5 font-medium">{variant === 'volunteer' ? '학년·반' : '대상'}</th>
              <th className="px-3 py-2.5 font-medium">이름</th>
              <th className="px-3 py-2.5 font-medium">{variant === 'volunteer' ? '봉사활동 내용' : '제목'}</th>
              <th className="px-3 py-2.5 font-medium">{variant === 'volunteer' ? '봉사일자' : '발급일'}</th>
              <th className="px-3 py-2.5 pr-3 sm:pr-4 text-right font-medium">담당부서 · 관리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows cols={colCount} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-16">
                  <EmptyState searching={!!search.trim()} variant={variant} />
                </td>
              </tr>
            ) : (
              filtered.map((issue, idx) => {
                const batch = batchByRepId.get(issue.id);
                // 배치는 안의 모든 행이 취소돼야 "완전 취소", 단독 행은 자기 status로 판정.
                const fullyCancelled = batch
                  ? batch.issues.every(i => i.status === 'cancelled')
                  : issue.status === 'cancelled';

                // 완전 취소된 행 — 발급번호(범위)와 "취소됨" 배지만 남기고 나머지 정보는 숨긴다.
                if (fullyCancelled) {
                  const numberLabel = batch && batch.issues.length > 1
                    ? `${batch.issues[0].issue_no} ~ ${batch.issues[batch.issues.length - 1].issue_no}`
                    : issue.issue_no;
                  return (
                    <tr key={issue.id} className="border-b border-slate-50 last:border-0 opacity-60">
                      <td className="px-3 py-2.5 sm:px-4 text-slate-400 tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-slate-500 ring-1 ring-inset ring-slate-200 line-through decoration-slate-400">
                          {numberLabel}
                        </span>
                      </td>
                      <td colSpan={4} className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
                          삭제된 발급 — 번호만 보존됩니다
                        </span>
                      </td>
                      <td className="px-3 py-2.5 pr-3 sm:pr-4" />
                    </tr>
                  );
                }

                const classExpandable = !!onEditClass && isClassExpandable(issue);
                const clubExpandable = !!onEditClub && isClubExpandable(issue);
                const personalExpandable = !!onExportPersonal && !!batch && isPersonalExpandable(batch);
                const expandable = classExpandable || clubExpandable || personalExpandable;
                const expanded = expandable && isRowOpen(issue.id);
                // 개인봉사 배치 대표 행: 발급번호는 배치 내 최소~최대 issue_no 범위, 이름은 전원 요약
                // (취소된 학생도 번호 범위에는 포함하되, 이름 요약·명단은 살아있는 학생만 센다)
                const batchIssueNoLabel = batch && batch.issues.length > 1
                  ? `${batch.issues[0].issue_no} ~ ${batch.issues[batch.issues.length - 1].issue_no}`
                  : issue.issue_no;
                const batchStudents = batch
                  ? batch.issues.filter(i => i.status === 'active').flatMap(i => i.students)
                  : issue.students;
                return (
                  <Fragment key={issue.id}>
                    <tr
                      className={cn(
                        'group border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/40',
                        expandable && 'cursor-pointer',
                        expanded && 'bg-brand-50/30',
                      )}
                      onClick={expandable ? () => toggleRow(issue.id) : undefined}
                    >
                      <td className="px-3 py-2.5 sm:px-4 text-slate-400 tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-brand-700 ring-1 ring-inset ring-brand-100">
                          {batchIssueNoLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          {expandable && (
                            <ChevronRight
                              className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-90')}
                              strokeWidth={2}
                            />
                          )}
                          {(() => {
                            const label = summarizeGradeClass(issue);
                            return label ? label : <span className="text-slate-300">—</span>;
                          })()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {batchStudents.length === 0 ? <span className="text-slate-300">—</span>
                          : batchStudents.length === 1 ? batchStudents[0].name
                          : <span>{batchStudents[0].name}<span className="ml-1 text-xs text-slate-400">외 {batchStudents.length - 1}명</span></span>}
                      </td>
                      <td className="max-w-[22rem] truncate px-3 py-2.5 text-slate-700" title={issue.title}>
                        {issue.title}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 tabular-nums">{issue.issued_on}</td>
                      <td className="px-3 py-2.5 pr-3 sm:pr-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <span className="hidden text-xs text-slate-400 sm:inline">{issue.department ?? ''}</span>
                          {batch ? (
                            <div className="flex items-center gap-0.5 opacity-80 transition-opacity group-hover:opacity-100">
                              {onExportPersonalBatch && (
                                <button
                                  type="button"
                                  onClick={() => onExportPersonalBatch(batch)}
                                  title="배치 전체 확인서 통합 다운로드"
                                  aria-label="배치 전체 확인서 통합 다운로드"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-white hover:text-brand-600 hover:shadow-sm active:scale-95"
                                >
                                  <FileDown className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                              )}
                              {personalExpandable ? (
                                canEdit(issue) && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelBatch(batch)}
                                    title="배치 전체 삭제 (학생 전원)"
                                    aria-label="배치 전체 삭제"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                                  >
                                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                                  </button>
                                )
                              ) : (
                                <IssueRowActions issue={issue} onEdit={onEdit} onDelete={handleCancel} onExport={onExportPersonal} />
                              )}
                            </div>
                          ) : (
                            <IssueRowActions issue={issue} onEdit={onEdit} onDelete={handleCancel} onExport={onExport} />
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && classExpandable && onEditClass && onExport && (
                      <IssueClassRows issue={issue} colCount={colCount} onEditClass={onEditClass} onExport={onExport} />
                    )}
                    {expanded && clubExpandable && onEditClub && onExportClub && (
                      <IssueClubRows issue={issue} colCount={colCount} onEditClub={onEditClub} onExportClub={onExportClub} />
                    )}
                    {expanded && personalExpandable && batch && onExportPersonal && (
                      <IssuePersonalRows
                        batch={batch} colCount={colCount}
                        onEdit={onEdit} onExport={onExportPersonal} onCancel={handleCancel}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          총 <span className="font-medium tabular-nums text-slate-600">{filtered.length}</span>건
          {search.trim() && ` · "${search}" 검색 결과`}
        </div>
      )}
    </section>
  );
}

function YearChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-all',
        active
          ? 'bg-white text-brand-600 shadow-sm'
          : 'text-slate-400 hover:text-slate-600',
      )}
    >
      {label}
    </button>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, r) => (
        <tr key={r} className="border-b border-slate-50">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-3 sm:px-4">
              <div
                className={cn('h-4 animate-pulse rounded bg-slate-100', c === 4 ? 'w-48' : c === 1 ? 'w-16' : 'w-12')}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ searching, variant }: { searching: boolean; variant: 'gajeong' | 'volunteer' }) {
  const label = variant === 'volunteer' ? '봉사활동' : '가정통신문';
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300 ring-1 ring-slate-100">
        <FileText className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-slate-600">
        {searching ? '검색 결과가 없습니다' : `아직 발급한 ${label} 문서가 없습니다`}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {searching ? '다른 검색어를 입력해 보세요' : '우측 상단 발급 버튼으로 첫 문서를 등록하세요'}
      </p>
    </div>
  );
}
