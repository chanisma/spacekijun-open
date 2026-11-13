import React from 'react';
import {
  ArrowRight, Bot, ChevronDown, ChevronRight, CircleDot, FileText, Info, Layers,
  Link2, Loader2, Quote, Route, Sparkles, Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AIAnalysisView from './AIAnalysisView';
import ActivitySegmentationDialog from './ActivitySegmentationDialog';
import { useActivityLedger } from '../../hooks/useActivityLedger';
import { useStudentKgLayers } from '../../hooks/useStudentKgLayers';
import {
  LEDGER_AREA_ORDER, TRAIT_KIND_LABELS, TRAIT_KIND_ORDER,
  areaLabel, areaTone, buildActivityLedger, groupByGrade,
  type LedgerActivity, type LedgerArea,
} from '../../utils/activityLedger';
import type { SegmentationRecord } from '../../hooks/useActivitySegmentation';
import type { KgThread } from '../../types/kgLayers';
import type { Student } from '../../types';

/**
 * 활동 타임라인 — 구 'AI 분석' 탭 (2026-09-12 전면 개편).
 *
 * ── 무엇을 합쳤는가 ─────────────────────────────────────────────────────────
 * ① **분절 활동**(비교과 탭이 원문에 색으로 칠해 보여주는 그것) —
 *    `student_detailed_activities.segmentation`. 기록 한 행 안의 서로 다른 탐구를
 *    문장 단위로 갈라 놓은 결과라, 여기서 처음으로 **활동이 목록의 단위**가 된다.
 * ② **지식그래프 층** — 탐구 설계(`/inquiry-design`)가 읽는 것과 같은 데이터.
 *    활동마다 역량·성취·태도·개념·주제 사슬과 **판정 근거 인용**이 붙는다.
 *
 * 둘은 `entity_id`로 붙는다. **`act:<기록id>#<배열위치>`로 계산하면 안 된다** —
 * 실측 60,245건 중 위치와 일치하는 것이 22,293건(37%)뿐이다. 저장된 `entity_id`를
 * 그대로 쓰면 KG 활동 9,212건 중 9,211건(99.99%)이 분절 활동에 붙는다.
 *
 * ── 축은 학년이다 (학기가 아니다) ───────────────────────────────────────────
 * `semester`가 있는 기록은 전체의 5.4%이고 창체는 0건이다(실측). 학년-학기로 버킷을
 * 나누면 대부분이 '학기 없음'에 쌓여 축이 고장난 것처럼 보인다 → 학기는 **있을 때만
 * 붙는 꼬리표**다. 판정과 집계 규칙은 전부 `utils/activityLedger.ts`에 있다.
 *
 * ── 종전 기능은 지우지 않았다 ───────────────────────────────────────────────
 * 기록 단위 AI 요약(What/Why/How)은 분절이 없던 시절의 산출물이지만 **분절보다 넓게
 * 깔려 있다**(24,560행). 두 번째 보기로 그대로 남긴다(`AIAnalysisView`).
 */

interface Props {
  student: Student;
}

type Mode = 'timeline' | 'records';

const ActivityTimelineView: React.FC<Props> = ({ student }) => {
  const studentCode = student.studentId || student.id;
  const [mode, setMode] = React.useState<Mode>('timeline');
  const [areaFilter, setAreaFilter] = React.useState<LedgerArea | 'all'>('all');
  const [kgOnly, setKgOnly] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [collapsedGrades, setCollapsedGrades] = React.useState<Set<string>>(new Set());
  const [detail, setDetail] = React.useState<{ record: SegmentationRecord; heading: string } | null>(null);

  const ledgerQuery = useActivityLedger(studentCode);
  const kgQuery = useStudentKgLayers(studentCode);
  const kg = kgQuery.data?.layers ?? null;

  const ledger = React.useMemo(
    () => buildActivityLedger(ledgerQuery.data?.rows ?? [], kg),
    [ledgerQuery.data?.rows, kg],
  );

  const filtered = React.useMemo(() => ledger.activities.filter((a) => {
    if (areaFilter !== 'all' && a.area !== areaFilter) return false;
    if (kgOnly && !a.kg) return false;
    return true;
  }), [ledger.activities, areaFilter, kgOnly]);

  // 개요·주제 사슬은 **필터와 무관하게** 전체를 센다 — 개요가 필터를 따라가면
  // "이 학생이 무엇을 했는가"라는 질문에 답하지 못하고, 필터 상태에 따라 같은 화면이
  // 다른 사실을 말하는 것처럼 보인다.
  const allBands = React.useMemo(() => groupByGrade(ledger.activities, kg), [ledger.activities, kg]);
  const bands = React.useMemo(() => groupByGrade(filtered, kg), [filtered, kg]);

  const areaCounts = React.useMemo(() => {
    const counts = new Map<LedgerArea, number>();
    for (const a of ledger.activities) counts.set(a.area, (counts.get(a.area) ?? 0) + 1);
    return counts;
  }, [ledger.activities]);

  /** 여러 학년을 관통하는 주제 사슬만 위로 올린다 — 한 학년 안의 사슬은 그 학년 안에서 읽힌다. */
  const crossGradeThreads = React.useMemo(
    () => (kg?.threads ?? []).filter((t) => t.grades.length >= 2),
    [kg],
  );

  const loading = ledgerQuery.isLoading || kgQuery.isLoading;

  /**
   * KG 엔티티 id → 활동 이름. 주제 사슬 구성원과 시간 서사 엣지가 **모두 엔티티 id** 라
   * 분절 키 색인(`ledger.byKey`)으로는 찾을 수 없다(찾으면 raw id 가 화면에 나온다).
   */
  const resolveKgLabel = React.useCallback(
    (kgEntityId: string) => kg?.activities.get(kgEntityId)?.label ?? null,
    [kg],
  );

  const toggleCard = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const toggleGrade = (label: string) => setCollapsedGrades((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  const openRecord = (activity: LedgerActivity) => {
    const row = ledger.records.get(activity.recordId);
    if (!row?.segmentation) return;
    setDetail({
      record: {
        id: row.id,
        grade: row.grade ?? null,
        category: row.category ?? null,
        subjectName: row.subject_name ?? null,
        segmentation: row.segmentation,
      },
      heading: activity.title,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 보기 전환 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/60 p-1">
          <ModeButton active={mode === 'timeline'} onClick={() => setMode('timeline')} icon={Route}>
            활동 타임라인
          </ModeButton>
          <ModeButton active={mode === 'records'} onClick={() => setMode('records')} icon={Bot}>
            기록별 AI 요약
          </ModeButton>
        </div>
        <p className="text-[11px] text-slate-400">
          {mode === 'timeline'
            ? '기록을 활동 단위로 갈라 학년 순으로 놓고, 지식그래프의 역량·개념을 붙였습니다.'
            : '기록 한 행 단위의 What/Why/How 요약입니다.'}
        </p>
      </div>

      {mode === 'records' ? (
        <AIAnalysisView student={student} />
      ) : loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">활동 데이터 로딩 중...</p>
        </div>
      ) : ledger.activities.length === 0 ? (
        <EmptyLedger studentName={student.name} />
      ) : (
        <>
          <OverviewStrip bands={allBands} kgEngine={kg?.engine ?? null} />

          {crossGradeThreads.length > 0 && (
            <ThreadBand
              threads={crossGradeThreads}
              resolveLabel={resolveKgLabel}
              grades={allBands.map((b) => b.grade).filter((g): g is number => g != null)}
            />
          )}

          {/* 필터 — 개요 아래에 둔다. 위에 두면 개요가 필터에 반응하는 것처럼 보인다. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={areaFilter === 'all'} onClick={() => setAreaFilter('all')}>
              전체 <span className="text-[10px] opacity-70">{ledger.activities.length}</span>
            </FilterChip>
            {LEDGER_AREA_ORDER.filter((a) => areaCounts.get(a)).map((area) => (
              <FilterChip key={area} active={areaFilter === area} onClick={() => setAreaFilter(area)} tone={area}>
                {areaLabel(area)} <span className="text-[10px] opacity-70">{areaCounts.get(area)}</span>
              </FilterChip>
            ))}
            <button
              type="button"
              onClick={() => setKgOnly((v) => !v)}
              className={cn(
                'ml-1 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                kgOnly
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
              title="역량·개념 층이 붙은 활동만 — 추출 문턱(탐구 ∧ (유용성 ≥ 5 ∨ 수준 ≥ 3))을 넘은 것들"
            >
              <Sparkles size={13} /> 역량 층 있는 활동만
            </button>
          </div>

          {bands.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-500">조건에 맞는 활동이 없습니다.</p>
            </div>
          ) : (
            bands.map((band) => {
              const collapsed = collapsedGrades.has(band.label);
              return (
                <section key={band.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleGrade(band.label)}
                    className="flex w-full flex-wrap items-center gap-2 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                  >
                    {collapsed
                      ? <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                      : <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" />}
                    <span className="text-sm font-bold text-slate-800">{band.label}</span>
                    <span className="text-[11px] text-slate-400">활동 {band.stats.activities}개</span>
                    {band.stats.withKg > 0 && (
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] font-normal text-violet-700">
                        역량 층 {band.stats.withKg}
                      </Badge>
                    )}
                    {band.stats.subjects > 0 && (
                      <span className="text-[11px] text-slate-400">과목 {band.stats.subjects}</span>
                    )}
                    {band.stats.interests.length > 0 && (
                      <span className="ml-auto hidden max-w-[45%] truncate text-[11px] text-slate-400 sm:block">
                        {band.stats.interests.slice(0, 3).map((i) => i.label).join(' · ')}
                      </span>
                    )}
                  </button>

                  {!collapsed && (
                    <div className="space-y-4 p-3.5">
                      {band.areas.map((group) => {
                        const tone = areaTone(group.area);
                        return (
                          <div key={group.area}>
                            <div className="mb-2 flex items-center gap-2">
                              <span className={cn('h-3 w-1 rounded-full', tone.bar)} />
                              <h4 className={cn('text-xs font-semibold', tone.text)}>{group.label}</h4>
                              <span className="text-[10px] text-slate-400">{group.activities.length}</span>
                              {/* 카드가 둘 이상일 때만 — 한 장뿐인 영역에 "순" 이라 적으면 군더더기다 */}
                              {group.activities.length > 1 && (
                                <span className="text-[10px] text-slate-300" title="유용성 = 핵심개념·자료·표지·문장 수의 합">
                                  유용성 높은 순
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {group.activities.map((activity) => (
                                <ActivityCard
                                  key={activity.key}
                                  activity={activity}
                                  expanded={expanded.has(activity.key)}
                                  onToggle={() => toggleCard(activity.key)}
                                  onOpenRecord={() => openRecord(activity)}
                                  resolveTitle={resolveKgLabel}
                                  resolveThread={(id) =>
                                    kg?.threads.find((t) => t.entityId === id)?.label ?? null}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {/* 분절에서 짝을 못 찾은 KG 활동. 0이 정상이므로 있을 때만 말한다. */}
          {ledger.orphanKgActivityIds.length > 0 && (
            <p className="flex items-start gap-1.5 px-1 text-[11px] text-amber-700">
              <Info size={13} className="mt-px flex-shrink-0" />
              지식그래프 활동 {ledger.orphanKgActivityIds.length}개가 현재 기록의 분절과 짝이 없습니다
              (기록이 다시 적재되었거나 그래프가 옛 분절로 만들어진 경우).
            </p>
          )}
        </>
      )}

      <ActivitySegmentationDialog
        record={detail?.record ?? null}
        heading={detail?.heading}
        open={!!detail}
        onOpenChange={(open) => { if (!open) setDetail(null); }}
      />
    </div>
  );
};

/* ── 개요 ─────────────────────────────────────────────────────────────────── */

/**
 * 학년을 **나란히** 놓는다 — 이 화면에서 "한 눈에"가 실제로 성립하는 구획이다.
 * 아래 타임라인은 세로로 길어서 두 학년을 동시에 볼 수 없다.
 */
const OverviewStrip: React.FC<{
  bands: ReturnType<typeof groupByGrade>;
  kgEngine: string | null;
}> = ({ bands, kgEngine }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Layers size={15} />
        </span>
        <span className="text-sm font-semibold text-slate-800">시기별 개요</span>
        <span className="text-[10px] text-slate-400">
          기록을 활동 단위로 가른 수 · 학년 축
        </span>
        {!kgEngine && (
          <Badge variant="outline" className="ml-auto border-slate-200 bg-white text-[10px] font-normal text-slate-500">
            지식그래프 없음 — 분절만 표시
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bands.map((band) => (
          <div key={band.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-slate-800">{band.label}</span>
              <span className="text-lg font-bold tabular-nums text-slate-700">{band.stats.activities}</span>
              <span className="text-[10px] text-slate-400">활동</span>
              {band.stats.withKg > 0 && (
                <span className="ml-auto text-[10px] text-violet-600">
                  역량 {band.stats.traits.competency} · 성취 {band.stats.traits.achievement}
                </span>
              )}
            </div>

            {/*
              영역 **비율**만 말하는 바다. 활동량 비교는 위의 큰 숫자가 하고, 여기에
              양을 겹쳐 넣지 않는다 — 종전엔 아래에 얇은 비교 바를 하나 더 뒀는데
              표면 대비 1.2:1 로 읽히지 않는 장식이었다. 색이 곧 영역이다(타임라인과 동일).
            */}
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-200">
              {band.areas.map((group) => (
                <div
                  key={group.area}
                  className={areaTone(group.area).bar}
                  style={{ width: `${(group.activities.length / band.stats.activities) * 100}%` }}
                  title={`${group.label} ${group.activities.length}`}
                />
              ))}
            </div>

            {/*
              주제군이 먼저다 — 개념은 대부분 1회라 나열하면 임의의 절단면이 되는데
              주제군(Leiden 군집)은 무게가 실제로 갈린다. 근거는 activityLedger 주석.
            */}
            {band.stats.interests.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {band.stats.interests.slice(0, 5).map((i) => (
                  <span
                    key={i.label}
                    className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600"
                    title={`주제군 · 이 학년 활동 ${i.count}건`}
                  >
                    {i.label}
                    <span className="ml-0.5 text-slate-400">{i.count}</span>
                  </span>
                ))}
              </div>
            )}

            {band.stats.repeatedConcepts.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {band.stats.repeatedConcepts.slice(0, 6).map((c) => (
                  <span
                    key={c.label}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px]',
                      band.stats.newConcepts.includes(c.label)
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-slate-100 text-slate-500',
                    )}
                    title={band.stats.newConcepts.includes(c.label)
                      ? `되풀이된 개념 · 이 학년에서 처음 등장 · 활동 ${c.count}건`
                      : `되풀이된 개념 · 활동 ${c.count}건`}
                  >
                    {c.label}
                    <span className="ml-0.5 opacity-60">{c.count}</span>
                  </span>
                ))}
              </div>
            )}

            {band.stats.interests.length === 0 && band.stats.repeatedConcepts.length === 0 && (
              <p className="mt-2.5 text-[10px] text-slate-400">
                {band.stats.withKg === 0
                  ? '이 학년에는 역량 층이 붙은 활동이 없습니다.'
                  : '되풀이된 주제가 아직 없습니다.'}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-400">
        {/*
          순서가 시간순이 아니라는 것을 말해 줘야 한다 — 학년 축 안에서 시간순을 기대한
          사람은 "왜 뒤죽박죽인가"로 읽는다. 카드에 유용성 숫자가 있어도 그 숫자가
          **순서를 정한다**는 것은 따로 알려야 안다.
        */}
        활동 카드는 <span className="font-medium text-slate-500">유용성이 높은 순</span>으로 놓입니다
        (핵심개념·자료·표지·문장 수의 합 — 같은 점수는 과목순).{' '}
        위 칩은 <span className="font-medium text-slate-500">주제군</span>(여러 활동을 묶은 군집),
        아래 칩은 <span className="font-medium text-slate-500">2회 이상 등장한 개념</span>입니다 —
        1회짜리 개념은 대부분 유일해서 순위를 매기면 임의의 목록이 됩니다.
        파란색은 그 학년에서 <span className="font-medium text-blue-600">처음 등장</span>한 것입니다.
        학기는 기록에 남아 있는 경우가 전체의 5% 남짓이라 축으로 쓰지 않고, 활동 카드에 꼬리표로만 붙습니다.
      </p>
    </div>
  );
};

/* ── 주제 사슬 ────────────────────────────────────────────────────────────── */

/**
 * 여러 학년을 관통하는 주제. 생기부 평가에서 가장 값이 나가는 것이 이 종단 서사인데,
 * 활동을 학년별로만 늘어놓으면 **구조적으로 보이지 않는다** — 그래서 따로 올린다.
 */
const ThreadBand: React.FC<{
  threads: KgThread[];
  /**
   * KG 엔티티 id → 활동 이름.
   *
   * **`memberActivityIds` 는 KG 엔티티 id(`acti_…`)다** — 분절 키(`act:<기록id>#<n>`)로
   * 찾으면 전부 미스가 되고 이름 줄이 조용히 빈다(또는 raw id 가 그대로 보인다).
   * 이 도메인 id 두 종류의 구분은 `utils/activityLedger.ts` 의 주석 참고.
   */
  resolveLabel: (kgEntityId: string) => string | null;
  grades: number[];
}> = ({ threads, resolveLabel, grades }) => {
  const span = grades.length > 0 ? grades : [1, 2, 3];
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <Route size={15} />
        </span>
        <span className="text-sm font-semibold text-emerald-900">여러 학년을 관통한 주제</span>
        <span className="text-[10px] text-emerald-700/70">{threads.length}개</span>
      </div>
      <div className="space-y-1.5">
        {threads.map((thread) => (
          <div
            key={thread.entityId}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800" title={thread.label}>
              {thread.label}
            </span>
            <span className="flex items-center gap-0.5">
              {span.map((g) => (
                <span
                  key={g}
                  className={cn(
                    'inline-flex h-5 w-6 items-center justify-center rounded text-[10px] font-medium',
                    thread.grades.includes(g)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-300',
                  )}
                  title={thread.grades.includes(g) ? `${g}학년에 활동 있음` : `${g}학년에 활동 없음`}
                >
                  {g}
                </span>
              ))}
            </span>
            <span className="text-[10px] text-slate-400">
              활동 {thread.memberActivityIds.length}개
            </span>
            <span className="hidden min-w-0 max-w-[38%] truncate text-[10px] text-slate-400 lg:block">
              {thread.memberActivityIds
                .map(resolveLabel)
                .filter(Boolean)
                .slice(0, 3)
                .join(' → ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── 활동 카드 ────────────────────────────────────────────────────────────── */

const ActivityCard: React.FC<{
  activity: LedgerActivity;
  expanded: boolean;
  onToggle: () => void;
  onOpenRecord: () => void;
  /** KG 엔티티 id → 활동 이름(시간 서사 엣지가 엔티티 id 를 담는다). */
  resolveTitle: (kgEntityId: string) => string | null;
  resolveThread: (threadEntityId: string) => string | null;
}> = ({ activity, expanded, onToggle, onOpenRecord, resolveTitle, resolveThread }) => {
  const tone = areaTone(activity.area);
  const kg = activity.kg;
  const traitCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const trait of kg?.traits ?? []) {
      counts.set(trait.kind, (counts.get(trait.kind) ?? 0) + 1);
    }
    return counts;
  }, [kg]);
  const concepts = React.useMemo(
    () => [...new Set([...activity.concepts, ...(kg?.concepts ?? [])])],
    [activity.concepts, kg],
  );

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-white transition-shadow',
        expanded ? 'border-slate-300 shadow-md' : 'border-slate-200 hover:shadow-sm',
      )}
    >
      {/* 좌측 영역 띠 — 색이 영역을 말한다 */}
      <span className={cn('absolute inset-y-0 left-0 w-0.5', tone.bar)} />

      <button type="button" onClick={onToggle} className="w-full px-3 py-2.5 pl-4 text-left">
        <div className="flex items-start gap-1.5">
          {expanded
            ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            : <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />}
          <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-800">
            {activity.title}
          </span>
          {kg && (
            <span
              className="flex-shrink-0 rounded bg-violet-50 px-1 py-0.5 text-[9px] font-medium text-violet-700"
              title="지식그래프에 선정된 활동 — 역량·개념 층이 붙어 있습니다"
            >
              KG
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-5">
          {activity.subject && activity.subject !== areaLabel(activity.area) && (
            <span className={cn('rounded border px-1 py-0.5 text-[9px]', tone.chip)}>
              {activity.subject}
            </span>
          )}
          {activity.semester != null && (
            <span className="text-[9px] text-slate-400">{activity.semester}학기</span>
          )}
          {kg?.level != null && (
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-600" title="탐구 심화 수준(0~4)">
              수준 {kg.level}
            </span>
          )}
          {activity.usefulness != null && (
            <span className="text-[9px] text-slate-400" title="분절 유용성 점수(핵심개념·자료·표지·문장 수의 합)">
              유용성 {activity.usefulness}
            </span>
          )}
          {[...traitCounts.entries()].map(([k, n]) => (
            <span key={k} className="rounded bg-violet-50 px-1 py-0.5 text-[9px] text-violet-700">
              {TRAIT_KIND_LABELS[k as keyof typeof TRAIT_KIND_LABELS]} {n}
            </span>
          ))}
          {activity.fieldMismatch && (
            <span
              className="rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700"
              title="제목·개념이 이 문장들의 것이 아닐 수 있습니다 — 원문으로 확인하세요"
            >
              ⚠ 확인 필요
            </span>
          )}
        </div>

        {concepts.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
            {concepts.slice(0, expanded ? concepts.length : 3).map((c) => (
              <span key={c} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-600">
                {c}
              </span>
            ))}
            {!expanded && concepts.length > 3 && (
              <span className="text-[9px] text-slate-400">+{concepts.length - 3}</span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <div className="space-y-2.5 border-t border-slate-100 px-4 py-2.5">
          {kg?.researchQuestion && (
            <div className="flex gap-1.5 rounded-lg bg-sky-50/70 px-2 py-1.5">
              <Target size={12} className="mt-0.5 flex-shrink-0 text-sky-600" />
              <p className="text-[11px] leading-relaxed text-sky-900">{kg.researchQuestion}</p>
            </div>
          )}

          {activity.did && (
            <p className="text-[11px] leading-relaxed text-slate-600">{activity.did}</p>
          )}

          {activity.detailMarkers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activity.detailMarkers.map((m) => (
                <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                  {m}
                </span>
              ))}
            </div>
          )}

          {activity.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-teal-800">
              <CircleDot size={10} className="flex-shrink-0" />
              {activity.sources.map((s) => (
                <span key={s} className="rounded border border-teal-100 bg-teal-50 px-1.5 py-0.5">{s}</span>
              ))}
            </div>
          )}

          {/* 역량·성취·태도 — 판정 근거를 함께 그린다. 근거 없는 역량 목록은 검증할 수 없다. */}
          {(kg?.traits.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              {TRAIT_KIND_ORDER.flatMap((kind) =>
                (kg?.traits ?? []).filter((t) => t.kind === kind).map((trait, i) => (
                  <div key={`${trait.entityId}-${i}`} className="rounded-lg border border-violet-100 bg-violet-50/40 px-2 py-1.5">
                    <div className="flex items-start gap-1.5">
                      <Sparkles size={11} className="mt-0.5 flex-shrink-0 text-violet-500" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium leading-snug text-slate-800">
                          <span className="mr-1 text-[9px] text-violet-600">{TRAIT_KIND_LABELS[kind]}</span>
                          {trait.label}
                        </p>
                        {trait.evidence && trait.evidence !== trait.label && (
                          <p className="mt-0.5 flex gap-1 text-[10px] leading-relaxed text-slate-500">
                            <Quote size={9} className="mt-0.5 flex-shrink-0 text-slate-300" />
                            {trait.evidence}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )),
              )}
            </div>
          )}

          {/* 시간 서사 — 방향은 코드가 학년·학기로 정한 값이다(모델 판단 아님) */}
          {((kg?.deepenedFrom.length ?? 0) > 0 || (kg?.developsInto.length ?? 0) > 0) && (
            <div className="space-y-1">
              {(kg?.deepenedFrom ?? []).map((id) => (
                <p key={`from-${id}`} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <ArrowRight size={10} className="flex-shrink-0 rotate-180 text-slate-400" />
                  <span className="min-w-0 truncate">이전: {resolveTitle(id) ?? '(이름 없음)'}</span>
                </p>
              ))}
              {(kg?.developsInto ?? []).map((id) => (
                <p key={`into-${id}`} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <ArrowRight size={10} className="flex-shrink-0 text-emerald-500" />
                  <span className="min-w-0 truncate">이어짐: {resolveTitle(id) ?? '(이름 없음)'}</span>
                </p>
              ))}
            </div>
          )}

          {(kg?.threadIds.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-emerald-800">
              <Link2 size={10} className="flex-shrink-0" />
              {(kg?.threadIds ?? []).map((id) => (
                <span key={id} className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5">
                  {resolveThread(id) ?? '(주제 없음)'}
                </span>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-slate-500 hover:text-slate-800"
            onClick={onOpenRecord}
          >
            <FileText size={11} /> 원문에서 이 활동 보기
          </Button>
        </div>
      )}
    </div>
  );
};

/* ── 부품 ─────────────────────────────────────────────────────────────────── */

const ModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
}> = ({ active, onClick, icon: Icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
      active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
    )}
  >
    <Icon size={13} />
    {children}
  </button>
);

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  tone?: LedgerArea;
  children: React.ReactNode;
}> = ({ active, onClick, tone, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
      active
        ? tone
          ? areaTone(tone).chip
          : 'border-slate-400 bg-slate-800 text-white'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
    )}
  >
    {children}
  </button>
);

const EmptyLedger: React.FC<{ studentName?: string }> = ({ studentName }) => (
  <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/40 px-6 py-16 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
      <Route size={26} className="text-blue-500" />
    </div>
    <p className="text-sm font-medium text-slate-600">
      {studentName ? `${studentName} 학생의 ` : ''}활동 분절이 아직 없습니다
    </p>
    <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
      타임라인은 기록을 활동 단위로 가른 결과에서 만들어집니다. 분절은 배치로 생성되므로,
      기록이 방금 적재되었다면 아직 없을 수 있습니다.
      <span className="font-medium text-slate-500"> 기록별 AI 요약</span>은 그와 별개로 볼 수 있습니다.
    </p>
  </div>
);

export default ActivityTimelineView;
