import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Printer, FileSpreadsheet, Save, Table2, RotateCcw,
  BookOpen, GraduationCap, Users, History, CalendarDays, StickyNote, Info, Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import {
  FIT_COLORS, FIT_LABELS, MAX_APPLY_SLOTS, TRACK_SHORT_LABELS,
  type WishlistItem,
} from '../types';
import { CSAT_COLORS, CSAT_LABELS } from '../utils/csat';
import { computeItemInsight, type StudentContext } from '../utils/itemInsight';
import {
  autoFallbackText, buildComparisonRows, changesFor, changeSummaryFor,
  cellHasControl, computeLabelSpans, draftFromItem, multiApplyLevel, planValue,
  schedulesFor, toCsatCheck,
  SECTION_HINTS, SECTION_LABELS,
  type CellDetail, type ComparisonColumn, type ComparisonRow,
  type PlanDraft, type RowSection,
} from '../utils/comparisonRows';
import {
  changeTypeColor, groupByComparison, type AdmissionChange,
} from '../utils/admissionChange';
import {
  formatSchedule, isMySchedule, matchesAdmissionName, resolveAnnounceDate,
} from '../utils/admissionSchedule';
import { printOnly } from '../utils/printScope';
import { CellDetailDialog } from './CellDetailDialog';
import {
  resolveUnivInfo, urlHost, type AdmissionUnivInfo,
} from '../utils/admissionUnivInfo';
import {
  useAdmissionChanges, useAdmissionSchedules, useAdmissionUnivInfo, useSaveWishlistPlans,
} from '../hooks/useWishlist';

interface Props {
  studentCode: string;
  /** 지원 항목 — 지망 순서대로 */
  items: WishlistItem[];
  /** 학생 성적 컨텍스트 (판정값 계산 입력) */
  ctx: StudentContext;
  /** 편집 가능 여부 (학생 본인 또는 쓰기 권한 교사) */
  canEdit: boolean;
  /** 표에 표시할 학생 이름 (인쇄물 머리글) */
  studentLabel?: string | null;
}

function sameDraft(a: PlanDraft | undefined, b: PlanDraft | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.convertedScore === b.convertedScore &&
    a.interviewDate === b.interviewDate &&
    a.firstAnnounceDate === b.firstAnnounceDate &&
    a.finalAnnounceDate === b.finalAnnounceDate &&
    a.memo === b.memo &&
    a.csatCheck6 === b.csatCheck6 &&
    a.csatCheck9 === b.csatCheck9
  );
}

/** 오류 메시지 추출 — `catch (e: any)` 대신 (any 는 이 저장소 lint 에서 error) */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 빈 문자열은 저장하지 않고 null 로 — DB 에 ''(빈 문자열)과 NULL 이 섞이지 않게 */
const orNull = (v: string) => {
  const t = v.trim();
  return t === '' ? null : t;
};

/**
 * 지망 비교표.
 *
 * 상담의 실제 장면은 "이 학교 하나가 어떤가"가 아니라 **"6개를 늘어놓고 무엇을 뺄까"**다.
 * 카드 목록은 세로로 길어 두 학교를 동시에 볼 수 없으므로, 같은 항목을 가로로 맞춰
 * 세운 표를 둔다. 행 정의는 `utils/comparisonRows.ts` 단일 출처이며 인쇄·엑셀도 같은
 * 정의를 읽는다.
 */
export function ComparisonTable({
  studentCode, items, ctx, canEdit, studentLabel,
}: Props) {
  const saveMut = useSaveWishlistPlans(studentCode);
  // 셀 근거 모달 — 어느 칸을 눌렀는지가 아니라 **무엇을 보여줄지**를 담는다
  const [cellDetail, setCellDetail] = useState<CellDetail | null>(null);
  // 인쇄 대상. 조상 사슬을 훑어야 하므로 클래스가 아니라 **실제 노드**가 필요하다.
  const printRootRef = useRef<HTMLElement | null>(null);

  // 인쇄물 머리글의 출력일. 마운트 시 한 번만 잡는다 — 렌더마다 새 문자열을 만들면
  // 표가 자주 다시 그려지는 화면에서 의미 없는 변경이 계속 생긴다.
  const printedOn = useMemo(
    () => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    [],
  );

  // 참고 자료 2종 — 대학 목록으로 한 번에 조회(항목마다 부르면 N+1).
  const universities = useMemo(() => items.map((i) => i.university), [items]);
  const changesQ = useAdmissionChanges(universities);
  const changesByUniv = changesQ.data;
  const schedulesQ = useAdmissionSchedules(universities);
  const schedulesByUniv = schedulesQ.data?.byUniversity;
  const scheduleYear = schedulesQ.data?.year;
  const univInfoQ = useAdmissionUnivInfo(universities);
  const univInfoPool: AdmissionUnivInfo[] | undefined = univInfoQ.data;

  /**
   * **이 학생의** 지망 목록에 같은 대학이 몇 곳인지.
   *
   * 복수지원은 한 사람의 6칸 안의 문제라 이 표(= 한 학생의 지망)를 세면 그대로 맞는다.
   * 대학명은 표기가 흔들리므로 **자료와 붙인 결과**(matched)로 묶는다 —
   * `전북대` 와 `전북대학교` 를 따로 세면 2곳을 1곳씩으로 읽는다.
   */
  const sameUniversityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const matched = resolveUnivInfo(it.university, univInfoPool).info?.university ?? it.university;
      m.set(matched, (m.get(matched) ?? 0) + 1);
    }
    return m;
  }, [items, univInfoPool]);

  /**
   * 표에 그릴 연도쌍 = **실제 자료에 있는 것만**, 최신순.
   * 코드에 박아 두면 해가 바뀔 때 조용히 빈 행이 남는다.
   */
  const changeComparisons = useMemo(() => {
    if (!changesByUniv) return [];
    const all: AdmissionChange[] = [];
    for (const it of items) all.push(...(changesByUniv.get(it.university) ?? []));
    return groupByComparison(all).map((g) => g.comparison);
  }, [changesByUniv, items]);

  const rows = useMemo(() => buildComparisonRows(changeComparisons), [changeComparisons]);

  // 열 = 지망 1~6. **빈 자리도 열로 유지**해 "수시 6회" 중 몇 칸이 남았는지 보이게 한다.
  // 6개를 넘겨 담아 뒀으면 그만큼 열을 늘린다(보드와 같은 정책 — 접수 전 정리 대상).
  const slots = useMemo(() => {
    const out: Array<{ header: string; item: WishlistItem | null }> = [];
    const count = Math.max(MAX_APPLY_SLOTS, items.length);
    for (let i = 0; i < count; i++) {
      out.push({ header: `${i + 1}지망`, item: items[i] ?? null });
    }
    return out;
  }, [items]);

  const allItems = items;

  // ---- 편집 초안 ----
  // 서버 값이 바뀌면 반영하되, **사용자가 고치는 중인 칸은 덮어쓰지 않는다**.
  // (저장 직후 refetch 로 목록이 새로 오는데 그때 입력이 날아가면 안 된다.)
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const serverRef = useRef<Record<string, PlanDraft>>({});
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, PlanDraft> = {};
      for (const it of allItems) {
        const server = draftFromItem(it);
        // **발표일 자동 입력**: 저장된 값이 없고 자료가 하나의 날짜를 말하면 채워 넣는다.
        // 모집단위별로 다르거나 값이 갈리면 `resolveAnnounceDate` 가 null 을 주므로
        // 자동으로 채워지지 않는다 — 틀린 날짜를 넣으면 학생이 그걸 믿는다.
        // (1차 발표일은 수집한 자료에 없어 자동 입력 대상이 아니다.)
        // **내 전형 일정만** 본다 — 대학 전체를 보면 남의 전형 발표일이 들어온다.
        const scheds = (schedulesByUniv?.get(it.university) ?? [])
          .filter((sc) => matchesAdmissionName(sc.admissionName, it.admissionName));
        if (!server.finalAnnounceDate && scheds.length > 0 && scheduleYear) {
          const auto = resolveAnnounceDate(scheds, scheduleYear);
          if (auto) server.finalAnnounceDate = auto;
        }
        const cur = prev[it.id];
        const prevServer = serverRef.current[it.id];
        const userEdited = !!cur && !!prevServer && !sameDraft(cur, prevServer);
        next[it.id] = userEdited ? cur! : server;
        serverRef.current[it.id] = server;
      }
      for (const id of Object.keys(serverRef.current)) {
        if (!allItems.some((i) => i.id === id)) delete serverRef.current[id];
      }
      return next;
    });
  }, [allItems, schedulesByUniv, scheduleYear]);

  const dirtyIds = useMemo(
    () => allItems.filter((it) => !sameDraft(drafts[it.id], draftFromItem(it))).map((it) => it.id),
    [allItems, drafts],
  );

  const insights = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeItemInsight>>();
    for (const it of allItems) m.set(it.id, computeItemInsight(it, ctx));
    return m;
  }, [allItems, ctx]);

  const columnOf = (item: WishlistItem | null): ComparisonColumn | null => {
    if (!item) return null;
    const insight = insights.get(item.id);
    if (!insight) return null;
    const univInfo = univInfoPool ? resolveUnivInfo(item.university, univInfoPool) : undefined;
    return {
      item,
      insight,
      draft: drafts[item.id],
      // undefined(로딩 중)와 []( 자료 없음)를 구분해 넘긴다
      changes: changesByUniv ? changesByUniv.get(item.university) ?? [] : undefined,
      schedules: schedulesByUniv ? schedulesByUniv.get(item.university) ?? [] : undefined,
      scheduleYear,
      univInfo,
      // 개수도 **붙인 결과**를 키로 센다(위 sameUniversityCounts 와 같은 규칙)
      sameUniversityCount: univInfo
        ? sameUniversityCounts.get(univInfo.info?.university ?? item.university)
        : undefined,
    };
  };

  const setField = (id: string, field: keyof PlanDraft, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? ({} as PlanDraft)), [field]: value } }));
  };

  const handleSave = async () => {
    if (dirtyIds.length === 0) return;
    const patches = dirtyIds.map((id) => {
      const d = drafts[id];
      return {
        id,
        patch: {
          convertedScore: orNull(d.convertedScore),
          interviewDate: orNull(d.interviewDate),
          firstAnnounceDate: orNull(d.firstAnnounceDate),
          finalAnnounceDate: orNull(d.finalAnnounceDate),
          memo: orNull(d.memo),
          // 빈 문자열 = "자동 판정을 따름" → NULL 로 저장
          csatCheck6: toCsatCheck(d.csatCheck6),
          csatCheck9: toCsatCheck(d.csatCheck9),
        },
      };
    });
    try {
      await saveMut.mutateAsync(patches);
      toast.success(`${patches.length}개 항목을 저장했습니다`);
    } catch (e) {
      toast.error(`저장 실패: ${errText(e)}`);
    }
  };

  const handleReset = () => {
    setDrafts(Object.fromEntries(allItems.map((it) => [it.id, draftFromItem(it)])));
  };

  /**
   * **비교표만**(`.comparison-print-area`) A4 가로로 출력한다 (2026-09-09 사용자 지시).
   * 지원 목록은 표의 `대학`·`전형` 행이 이미 담고 있어 같은 이름을 두 번 싣게 되고,
   * 표만으로도 44줄이라 목록이 앞에 오면 표가 그만큼 뒤로 밀린다.
   *
   * 범위를 좁히는 방법(왜 CSS 만으로는 안 되는지)은 `utils/printScope.ts` 에 있다 —
   * 인쇄 하니스가 **같은 모듈**을 써야 화면에서만 깨지는 버그를 잡을 수 있다.
   */
  const handlePrint = () => printOnly(printRootRef.current);

  const handleExcel = async () => {
    if (allItems.length === 0) {
      toast.error('내보낼 지원 항목이 없습니다');
      return;
    }
    // 빈 지망도 열을 유지해야 지망 번호와 열이 어긋나지 않는다.
    const matrix = toExportMatrixFromSlots(slots, columnOf, changeComparisons);
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws['!cols'] = [{ wch: 14 }, { wch: 8 }, ...slots.map(() => ({ wch: 26 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '지망비교표');
      const name = `수시_지망비교표_${(studentLabel ?? studentCode).replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
      XLSX.writeFile(wb, name);
    } catch (e) {
      toast.error(`엑셀 내보내기 실패: ${errText(e)}`);
    }
  };

  // 좌측 '항목' 열 rowSpan 계산 — 같은 group 이 연속되면 하나로 묶는다
  const labelSpans = useMemo(() => computeLabelSpans(rows), [rows]);
  // 영역이 바뀌는 지점 = 머리글 띠를 끼워 넣을 자리
  const sectionStarts = useMemo(() => {
    const set = new Set<number>();
    let prev: RowSection | null = null;
    rows.forEach((r, i) => {
      if (r.section !== prev) { set.add(i); prev = r.section; }
    });
    return set;
  }, [rows]);

  if (items.length === 0) return null;

  return (
    <section ref={printRootRef} className="space-y-2.5 comparison-print-area">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Table2 className="h-4 w-4 text-brand-500 shrink-0" />
          <h2 className="text-sm font-bold text-slate-800">지망 비교표</h2>
          {/* 화면 안내문 — 종이에서는 자리만 먹는다(읽는 사람은 이미 표를 들고 있다) */}
          <span className="text-[11px] text-slate-400 hidden sm:inline print:hidden">
            같은 항목을 나란히 놓고 비교합니다
          </span>
          {/* 인쇄물에만 나오는 머리글 — 화면에서는 위 제목과 중복이라 숨긴다.
              **출력일을 함께 적는다**: 이 표는 경쟁률·컷·일정처럼 시간이 지나면 달라지는
              값을 담아, 언제 뽑은 종이인지 없으면 몇 달 뒤 낡은 자료를 최신으로 읽는다. */}
          <span className="hidden print:inline text-[11px] text-slate-500">
            {studentLabel ? `· ${studentLabel} ` : ''}· {printedOn} 출력
          </span>
        </div>

        <div className="flex items-center gap-1.5 print:hidden">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" /> 인쇄
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> 엑셀
          </Button>
          {canEdit && (
            <>
              {dirtyIds.length > 0 && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> 되돌리기
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={handleSave}
                disabled={dirtyIds.length === 0 || saveMut.isPending}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {saveMut.isPending ? '저장 중...' : dirtyIds.length > 0 ? `저장 (${dirtyIds.length})` : '저장'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 표는 자기 컨테이너에서만 가로 스크롤 — 본문이 옆으로 밀리면 안 된다 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
        {/* sticky 셀은 border-collapse 와 깨지므로 border-separate 로 그린다 */}
        <table className="border-separate border-spacing-0 text-[11.5px] w-full">
          {/* 인쇄에서 좌측 두 열의 폭을 정하는 유일한 수단.
              `table-layout: fixed` 는 첫 행에서 폭을 잡는데 그 행의 첫 칸이 `colspan=2`
              라 항목/세부를 가를 수 없다. 화면에서는 폭을 주지 않아 무영향. */}
          <colgroup>
            <col className="print-col-label" />
            <col className="print-col-sub" />
            {slots.map((_, i) => <col key={`col-${i}`} />)}
          </colgroup>
          <thead>
            <tr>
              <th
                colSpan={2}
                className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-500 w-[11rem] min-w-[11rem]"
              >
                항목
              </th>
              {slots.map((s, i) => (
                <th
                  key={`${s.header}-${i}`}
                  className={`border-b border-r border-slate-200 px-2 py-2 text-left font-semibold min-w-[13rem] ${
                    i >= MAX_APPLY_SLOTS ? 'bg-amber-50/70 text-amber-700' : 'bg-slate-50 text-slate-600'
                  }`}
                  title={i >= MAX_APPLY_SLOTS ? '수시 6회 제한 초과' : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{s.header}</span>
                    {s.item && (
                      <span className="text-[9.5px] font-medium text-slate-400 border border-slate-200 rounded px-1 py-px bg-white">
                        {TRACK_SHORT_LABELS[s.item.track]}
                      </span>
                    )}
                    {/* 초과 열은 화면에서 앰버 배경으로 구분되는데 **브라우저는 배경을
                        기본으로 인쇄하지 않는다** — 종이에서는 글자로 말해야 한다.
                        (`title` 툴팁도 인쇄되지 않는다.) */}
                    {i >= MAX_APPLY_SLOTS && (
                      <span className="hidden print:inline font-bold">· 6회 초과</span>
                    )}
                  </div>
                  {/* **인쇄 전용: 어느 대학인지.** 머리글은 페이지마다 반복되는데
                      `1지망`만으로는 2페이지에서 어느 열이 어느 대학인지 알 수 없어
                      1페이지로 되돌아가야 한다. 화면에서는 아래 `대학` 행과 중복이라 숨긴다. */}
                  <div className="hidden print:block font-normal leading-tight">
                    {s.item
                      ? [s.item.university, s.item.department].filter(Boolean).join(' · ')
                      : '(비어 있음)'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const span = labelSpans[rowIdx];
              return (
                <Fragment key={row.key}>
                {sectionStarts.has(rowIdx) && (
                  <SectionBand section={row.section} colSpan={slots.length} />
                )}
                <tr className="even:bg-slate-50/40">
                  {span > 0 && (
                    <td
                      rowSpan={span}
                      colSpan={row.sub ? 1 : 2}
                      className={`sticky left-0 z-20 bg-white border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600 align-top ${
                        row.sub ? 'w-[7.5rem] min-w-[7.5rem]' : 'w-[11rem] min-w-[11rem]'
                      }`}
                    >
                      {row.label}
                    </td>
                  )}
                  {row.sub && (
                    <td className="sticky left-[7.5rem] z-20 bg-white border-b border-r border-slate-200 px-2 py-1.5 text-slate-400 tabular-nums w-[3.5rem] min-w-[3.5rem]">
                      {row.sub}
                    </td>
                  )}
                  {slots.map((s, i) => (
                    <td
                      key={`${row.key}-${i}`}
                      className="border-b border-r border-slate-200 px-2 py-1.5 align-top text-slate-700"
                    >
                      <Cell
                        row={row}
                        col={columnOf(s.item)}
                        canEdit={canEdit}
                        onChange={(field, value) => s.item && setField(s.item.id, field, value)}
                        onOpenDetail={setCellDetail}
                      />
                    </td>
                  ))}
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <CellDetailDialog detail={cellDetail} onOpenChange={(o) => { if (!o) setCellDetail(null); }} />

      <p className="text-[10.5px] text-slate-400 leading-relaxed">
        경쟁률·컷·추합은 어디가(adiga) 공개 자료 기준이며 전형·모집단위 매칭이 근사일 수 있습니다.
        환산점수·일정·메모는 직접 입력하는 항목이고, 최저 충족여부는 저장된 모의고사 성적으로 자동 판정합니다.
        전형 변경사항은 <b>전국 주요 대학 64곳</b>만 수록돼 있어 <b>자료 없음</b>이 곧 변경 없음을 뜻하지 않습니다.
        최종 확인은 대학 모집요강을 따르세요.
      </p>
    </section>
  );
}

/* ─────────────────────────── 셀 ─────────────────────────── */

/**
 * 내용에 맞춰 높이가 자라는 입력칸 (메모).
 *
 * 표 안이라 폭이 고정이므로 **길이는 세로로만 흡수할 수 있다**. 높이를 고정해 두면
 * 적은 메모가 스크롤 안에 숨고, 인쇄하면 첫 줄만 남는다.
 *
 * 늘리는 방법은 `height:auto` 로 되돌린 뒤 `scrollHeight` 를 넣는 것 — **되돌리는 단계가
 * 필수**다. 이전 높이가 남아 있으면 `scrollHeight` 가 그 높이 이상으로만 나와 내용을
 * 지워도 줄어들지 않는다. 그리기 전에 맞춰야 한 프레임 깜빡이지 않으므로
 * `useLayoutEffect` 를 쓴다.
 */
function AutoGrowTextarea({
  value, placeholder, onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      // resize-none: 손잡이로 늘린 높이가 남으면 자동 조절과 싸운다.
      // break-words: 붙여넣은 URL 처럼 띄어쓰기 없는 긴 문자열이 칸을 밀어내지 않게.
      className="w-full min-w-0 resize-none overflow-hidden break-words rounded border border-slate-200 bg-white px-1.5 py-1 text-[11.5px] leading-[1.45] text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 print:border-none print:px-0"
    />
  );
}

function Cell({
  row, col, canEdit, onChange, onOpenDetail,
}: {
  row: ComparisonRow;
  col: ComparisonColumn | null;
  canEdit: boolean;
  onChange: (field: keyof PlanDraft, value: string) => void;
  onOpenDetail: (detail: CellDetail) => void;
}) {
  if (!col) return <span className="text-slate-300">-</span>;

  // 근거가 **있을 때만** 클릭 가능하게 만든다. 눌러도 아무 일 없는 칸이 섞이면
  // 어디를 눌러야 하는지 알 수 없게 되므로, 없으면 평범한 칸으로 둔다.
  const detail = row.detail?.(col) ?? null;
  const body = <CellBody row={row} col={col} canEdit={canEdit} onChange={onChange} />;
  if (!detail) return body;

  // **입력 컨트롤이 있는 칸은 통째로 감싸면 안 된다.**
  // `<button>` 안에 `<select>`/`<input>` 을 넣으면 드롭다운을 고르는 클릭이 부모
  // 버튼까지 올라가 근거 모달이 함께 열린다(실제로 최저 충족여부에서 그랬다).
  // HTML 상으로도 상호작용 요소를 중첩하는 것이라 잘못이다.
  // 그래서 이런 칸은 본문을 그대로 두고 **옆에 작은 근거 버튼**만 붙인다.
  if (cellHasControl(row, canEdit)) {
    return (
      <span className="flex items-start gap-1 min-w-0">
        <span className="min-w-0 flex-1">{body}</span>
        <button
          type="button"
          onClick={() => onOpenDetail(detail)}
          title="근거 보기"
          aria-label="근거 보기"
          className="shrink-0 mt-0.5 rounded p-0.5 text-slate-300 hover:bg-blue-50 hover:text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300 transition-colors print:hidden"
        >
          <Info className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(detail)}
      title="근거 보기"
      className="group/cell w-full min-w-0 text-left rounded px-0.5 -mx-0.5 hover:bg-blue-50/60 focus:outline-none focus:ring-1 focus:ring-blue-300 transition-colors print:hover:bg-transparent"
    >
      <span className="block border-b border-dashed border-slate-300 group-hover/cell:border-blue-400 print:border-none">
        {body}
      </span>
    </button>
  );
}

function CellBody({
  row, col, canEdit, onChange,
}: {
  row: ComparisonRow;
  col: ComparisonColumn;
  canEdit: boolean;
  onChange: (field: keyof PlanDraft, value: string) => void;
}) {

  if (row.kind === 'edit' && row.field) {
    const value = planValue(col, row.field);
    // 열람 전용일 때도 줄바꿈을 살린다 — 여러 줄로 적은 메모가 한 줄로 뭉치면
    // 적은 사람과 읽는 사람이 다른 것을 보게 된다.
    if (!canEdit) {
      return (
        <span
          className={[
            value ? '' : 'text-slate-300',
            row.inputType === 'textarea' ? 'whitespace-pre-line break-words' : '',
          ].filter(Boolean).join(' ')}
        >
          {row.text(col)}
        </span>
      );
    }
    const auto = value ? null : row.autoValue?.(col) ?? null;
    return (
      <span className="flex flex-col gap-1">
        {row.inputType === 'textarea' ? (
          <AutoGrowTextarea
            value={value}
            placeholder={row.placeholder}
            onChange={(v) => onChange(row.field!, v)}
          />
        ) : (
          <input
            type={row.inputType === 'date' ? 'date' : 'text'}
            value={value}
            placeholder={row.placeholder}
            onChange={(e) => onChange(row.field!, e.target.value)}
            className="w-full min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11.5px] text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 print:border-none print:px-0"
          />
        )}
        {/* 자료가 제안하는 값 — 자동으로 덮어쓰지 않고 한 번 누르면 채운다.
            (대학이 일정을 바꾸거나 매칭이 어긋났을 때 사람이 적은 값이 사라지면 안 된다) */}
        {auto && (
          <button
            type="button"
            onClick={() => onChange(row.field!, auto)}
            title="자료 값으로 채우기"
            className="flex items-center gap-0.5 self-start rounded border border-dashed border-slate-300 px-1 py-px text-[9.5px] text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors print:hidden"
          >
            <Wand2 className="h-2.5 w-2.5" /> 자료 {auto}
          </button>
        )}
      </span>
    );
  }

  if (row.kind === 'schedule') {
    if (col.schedules === undefined) return <span className="text-slate-300">불러오는 중…</span>;
    const list = schedulesFor(col);
    if (list.length === 0) {
      // 매칭 0건은 대개 "이 전형에 고사가 없다"는 뜻이다 — 자료 결손과 구분해 적는다
      return (
        <span className="text-slate-400" title="교과 전형처럼 면접·논술·실기를 치르지 않는 전형일 수 있습니다">
          {row.text(col)}
        </span>
      );
    }
    if (row.key === 'applyPeriod') {
      return <span className="text-[11px] text-slate-600">{row.text(col)}</span>;
    }
    // 고사 일정 — **내 전형 것만**. 모집단위가 겹치는 것은 한 번 더 강조한다.
    // 색으로 구분하지 않는 이유: 색은 이미 상태(적합도·최저 충족)를 뜻하고 있어
    // 여기서 재사용하면 표 전체의 색 읽기가 무너진다(앱 전역 규약).
    return (
      <span className="flex flex-col gap-0.5">
        {list.map((sc) => {
          const exact = isMySchedule(sc, col.item.admissionName, col.item.department);
          return (
            <span
              key={sc.id}
              className={`text-[11px] leading-snug ${
                exact ? 'font-semibold text-slate-800' : 'text-slate-600'
              }`}
            >
              {formatSchedule(sc)}
              <span className="font-normal text-slate-400"> · {sc.admissionName}</span>
            </span>
          );
        })}
      </span>
    );
  }

  if (row.kind === 'changes') {
    const comparison = row.sub ?? '';
    if (col.changes === undefined) return <span className="text-slate-300">불러오는 중…</span>;
    const hit = changesFor(col, comparison);
    if (hit.length === 0) {
      // "변경 없음"이 아니라 "자료 없음" — 출처가 주요 대학 64곳뿐이다.
      return <span className="text-slate-300" title="이 대학은 변경사항 자료에 없습니다(전국 주요 대학 한정)">자료 없음</span>;
    }
    const kinds = Array.from(new Set(hit.map((h) => h.changeType)));
    return (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap gap-0.5">
          {kinds.map((k) => (
            <span key={k} className={`text-[9.5px] font-bold px-1 py-px rounded border ${changeTypeColor(k)}`}>
              {k}
            </span>
          ))}
        </span>
        <span className="text-[10.5px] text-slate-500 leading-snug">{changeSummaryFor(col, comparison)}</span>
        <span className="text-[9.5px] text-slate-400">상세는 카드 열기</span>
      </span>
    );
  }

  if (row.kind === 'link') {
    if (col.univInfo === undefined) return <span className="text-slate-300">불러오는 중…</span>;
    const url = col.univInfo.ambiguous ? null : col.univInfo.info?.homeUrl ?? null;
    // 주소가 아닌 값(`'입학처(해오름관 2층)'`)을 href 에 넣으면 **상대경로**가 되어
    // 우리 앱 안에서 이동한다. 링크는 파싱에 성공했을 때만 만든다.
    if (!url) return <span className="text-slate-400">{row.text(col)}</span>;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        // 셀 전체가 근거 모달을 여는 버튼이라 링크 클릭이 위로 올라가면 모달이 함께 열린다
        onClick={(e) => e.stopPropagation()}
        className="text-blue-600 hover:text-blue-700 hover:underline break-all print:text-slate-700"
        title={url}
      >
        {urlHost(url)}
      </a>
    );
  }

  if (row.kind === 'multiApply') {
    if (col.univInfo === undefined) return <span className="text-slate-300">불러오는 중…</span>;
    const level = multiApplyLevel(col);
    // 상한을 넘겼거나 애초에 불가인 대학에 여러 곳을 담은 경우만 색으로 말한다 —
    // 나머지는 평범한 글이어야 이 색이 눈에 띈다.
    const tone =
      level === 'over' || level === 'blocked'
        ? 'text-rose-600 font-semibold'
        : col.univInfo.ambiguous || !col.univInfo.info
          ? 'text-slate-400'
          : 'text-slate-700';
    return <span className={tone}>{row.text(col)}</span>;
  }

  if (row.kind === 'fit') {
    return (
      <span className={`inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded border ${FIT_COLORS[col.insight.fit]}`}>
        {FIT_LABELS[col.insight.fit]}
      </span>
    );
  }

  if (row.kind === 'grade') {
    const mine = col.insight.comparableGrade;
    const cut = col.item.adiga?.grade70 ?? null;
    if (mine == null && cut == null) return <span className="text-slate-300">-</span>;
    // 등급은 낮을수록 우수 — 컷보다 낮으면 유리(emerald), 높으면 불리(rose)
    const better = mine != null && cut != null ? mine <= cut : null;
    return (
      <span className="tabular-nums">
        <b className={better == null ? 'text-slate-700' : better ? 'text-emerald-600' : 'text-rose-600'}>
          {mine != null ? mine.toFixed(2) : '-'}
        </b>
        <span className="text-slate-400"> vs {cut != null ? cut : '-'}</span>
      </span>
    );
  }

  if (row.kind === 'csatRound' && row.field) {
    const round = col.insight.csatRounds.find((x) => x.field === row.field);
    const manual = toCsatCheck(planValue(col, row.field));
    const effective = manual ?? round?.autoVerdict ?? null;
    const autoLabel = round?.autoVerdict
      ? CSAT_LABELS[round.autoVerdict]
      : autoFallbackText(col, round?.examMonth ?? null);

    if (!canEdit) {
      return effective ? (
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded border ${CSAT_COLORS[effective]}`}>
          {CSAT_LABELS[effective]}
          {manual && <span className="font-normal opacity-70">직접</span>}
        </span>
      ) : (
        <span className="text-slate-400">{autoLabel}</span>
      );
    }

    // 편집 가능: select 자체에 판정 색을 입혀 배지 역할을 겸한다(좁은 칸에 두 요소를
    // 넣으면 다른 열과 높이가 어긋난다). '자동' 선택지에 자동 판정 결과를 함께 적어
    // 무엇을 덮어쓰는지 보이게 한다.
    const tone = effective
      ? CSAT_COLORS[effective]
      : 'bg-white text-slate-500 border-slate-200';
    // 어떤 범위 기준이 적용됐는지 — 학과 분기가 있는 전형에서 "왜 이 기준인가"의 답
    const scope = round?.ruleScope;
    const scopeText = scope
      ? scope.kind === 'department'
        ? `${scope.matchedTerm ?? scope.labels.join(',')} 기준`
        : scope.kind === 'series'
          ? `${scope.labels.join(',')} 계열 기준`
          : '공통 기준'
      : null;
    return (
      <span className="flex flex-col gap-0.5">
        <select
          value={manual ?? ''}
          onChange={(e) => onChange(row.field!, e.target.value)}
          title={`자동 판정: ${autoLabel}${manual ? ' · 직접 입력이 적용 중' : ''}${scope ? ` · ${scopeText}` : ''}`}
          className={`w-full min-w-0 rounded border px-1 py-1 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-blue-200 ${tone}`}
        >
          <option value="">자동 ({autoLabel})</option>
          <option value="meet">충족 (직접)</option>
          <option value="fail">미충족 (직접)</option>
        </select>
        {scopeText && !manual && (
          <span className="text-[9px] text-slate-400 truncate" title={scopeText}>{scopeText}</span>
        )}
      </span>
    );
  }

  const text = row.text(col);
  return (
    <span className={text === '-' ? 'text-slate-300' : 'whitespace-pre-wrap break-words'} title={text.length > 40 ? text : undefined}>
      {text}
    </span>
  );
}

/** 영역 머리글 띠 — 표가 30줄이 넘어 "지금 보는 게 무슨 축인지"를 잃지 않게 한다 */
function SectionBand({ section, colSpan }: { section: RowSection; colSpan: number }) {
  const Icon = SECTION_ICONS[section];
  const hint = SECTION_HINTS[section];
  return (
    // `section-band` = 인쇄용 표시(페이지 끝 고아 방지 + 배경 대신 선으로 구분).
    // 화면 스타일은 아래 클래스가 그대로 갖는다.
    <tr className="section-band">
      {/* 라벨은 좌측 고정 열에 붙여 가로 스크롤 중에도 보이게 한다 */}
      <td
        colSpan={2}
        className="sticky left-0 z-20 bg-slate-100 border-y border-slate-300/70 px-2 py-1.5 w-[11rem] min-w-[11rem]"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
          <Icon className="h-3.5 w-3.5 text-slate-400" />
          {SECTION_LABELS[section]}
        </span>
      </td>
      <td colSpan={colSpan} className="bg-slate-100 border-y border-slate-300/70 px-2 py-1.5">
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </td>
    </tr>
  );
}

/** 영역 아이콘 — 색이 아니라 모양으로 구분한다(색은 상태 표시에 이미 쓰고 있다) */
const SECTION_ICONS: Record<RowSection, typeof BookOpen> = {
  basic: Info,
  naesin: BookOpen,
  csat: GraduationCap,
  competition: Users,
  change: History,
  schedule: CalendarDays,
  note: StickyNote,
};

/* ───────────────────────── 헬퍼 ───────────────────────── */

/** 빈 지망 자리를 유지한 채 내보내기 행렬 생성 */
function toExportMatrixFromSlots(
  slots: Array<{ header: string; item: WishlistItem | null }>,
  columnOf: (item: WishlistItem | null) => ComparisonColumn | null,
  changeComparisons: string[],
): string[][] {
  const rows = buildComparisonRows(changeComparisons);
  const header = ['항목', '세부', ...slots.map((s) => s.header)];
  const body = rows.map((r) => [
    r.label,
    r.sub ?? '',
    ...slots.map((s) => {
      const col = columnOf(s.item);
      return col ? r.text(col) : '-';
    }),
  ]);
  return [header, ...body];
}
