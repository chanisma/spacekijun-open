import React from 'react';
import {
  Award, BookMarked, ChevronDown, ChevronRight, FileText, Info, Loader2, Quote,
  ScrollText, Sparkles, Tags, UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import KeywordAnalysis from './KeywordAnalysis';
import ActivitySegmentationDialog from './ActivitySegmentationDialog';
import { useActivityLedger } from '../../hooks/useActivityLedger';
import { useStudentKgLayers } from '../../hooks/useStudentKgLayers';
import {
  TRAIT_KIND_LABELS, TRAIT_KIND_ORDER, areaLabel, areaTone,
  buildActivityLedger, buildCompetencyView,
  type CompetencyEntry,
} from '../../utils/activityLedger';
import type { SegmentationRecord } from '../../hooks/useActivitySegmentation';
import type { KgTraitKind } from '../../types/kgLayers';
import type { Student } from '../../types';

/**
 * 역량분석 탭 (구 '키워드분석', 2026-09-12 개편).
 *
 * ── 두 가지를 나란히 둔다 ───────────────────────────────────────────────────
 * ① **기록된 역량** — 탐구 설계(`/inquiry-design`)가 읽는 지식그래프에서 온다. 생기부
 *    원문을 LLM 이 읽고 "이 활동이 이 역량을 보였다"고 판정한 것이고, **판정 근거 인용**이
 *    함께 저장되어 있다. 교사가 검증할 수 있는 형태라 이것이 이 탭의 본체다.
 * ② **핵심역량 키워드** — 사전(`data/keywords.ts`) 단어가 원문에 있는지 훑는 종전 기능.
 *    빠르고 결정적이라 "이 표현이 실제로 쓰였는가"에 답한다. 그대로 남긴다.
 *
 * ── 왜 ①을 6대 핵심역량으로 분류하지 않는가 (측정값, 2026-09-12) ────────────
 * v8 의 Competency 라벨은 이름이 아니라 **진술문**이다(6,221건 중 6,132건이 유일, 평균
 * 30자). 사전 135개로 매칭해 보니 **13.9%만** 걸린다 — 분류를 붙이면 86%가 '미분류'가
 * 되고, 그건 화면이 거짓말을 하는 것이다. 그래서 ①은 **학년·영역·과목** 축으로만
 * 묶고, 6대 역량으로 읽고 싶으면 ②를 본다. 두 기능이 한 탭에 있는 이유가 이것이다.
 */

interface Props {
  student: Student;
}

type ViewMode = 'kg' | 'keywords';

const TRAIT_ICONS: Record<KgTraitKind, LucideIcon> = {
  competency: Sparkles,
  achievement: Award,
  attitude: UserCog,
  role: UserCog,
  book: BookMarked,
  person: UserCog,
};

/**
 * 엔진별 표시 라벨.
 *
 * 화면이 "무엇을 보고 있는지" 말해야 한다 — 세대마다 층 구성과 활동 단위가 달라서
 * (`types/kgLayers.ts`의 표) 같은 학생도 세대에 따라 역량 개수가 크게 다르다.
 */
const ENGINE_LABELS: Record<string, string> = {
  'solar-pro4-seg-v8': '활동 분절 기반 (v8)',
  'solar-pro3': '기록 단위 (구 세대)',
  'research-v7': '분절 시험판 (v7 · 역량 층 없음)',
  openai: '초기 시험판',
};

const engineLabel = (engine: string | null | undefined) =>
  (engine && ENGINE_LABELS[engine]) || engine || '세대 미상';

const CompetencyAnalysis: React.FC<Props> = ({ student }) => {
  const studentCode = student.studentId || student.id;
  const [mode, setMode] = React.useState<ViewMode>('kg');
  const [kind, setKind] = React.useState<KgTraitKind>('competency');
  const [collapsedGrades, setCollapsedGrades] = React.useState<Set<string>>(new Set());
  const [detail, setDetail] = React.useState<{ record: SegmentationRecord; heading: string } | null>(null);

  const ledgerQuery = useActivityLedger(studentCode);
  const kgQuery = useStudentKgLayers(studentCode);

  const kg = kgQuery.data?.layers ?? null;
  const ledger = React.useMemo(
    () => buildActivityLedger(ledgerQuery.data?.rows ?? [], kg),
    [ledgerQuery.data?.rows, kg],
  );
  const view = React.useMemo(() => buildCompetencyView(ledger, kg, kind), [ledger, kg, kind]);

  const loading = ledgerQuery.isLoading || kgQuery.isLoading;
  const totalTraits = TRAIT_KIND_ORDER.reduce((sum, k) => sum + view.counts[k], 0);

  /**
   * 선택된 층이 비었는데 다른 층에 항목이 있으면 그쪽으로 옮긴다.
   *
   * 기본값이 '역량'인데 `research-v7` 세대는 역량·성취·태도를 만들지 않고 도서·역할만
   * 갖는다 — 그대로 두면 **항목이 있는데도 빈 화면**이 뜨고, 선택된 버튼이 동시에
   * 비활성이라 무엇을 눌러야 할지도 알 수 없다.
   */
  React.useEffect(() => {
    if (totalTraits === 0 || view.counts[kind] > 0) return;
    const next = TRAIT_KIND_ORDER.find((k) => view.counts[k] > 0);
    if (next) setKind(next);
  }, [totalTraits, view.counts, kind]);

  const toggleGrade = (label: string) => {
    setCollapsedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const openRecord = (entry: CompetencyEntry) => {
    const recordId = entry.activity?.recordId;
    const row = recordId ? ledger.records.get(recordId) : undefined;
    if (!row?.segmentation) return;
    setDetail({
      record: {
        id: row.id,
        grade: row.grade ?? null,
        category: row.category ?? null,
        subjectName: row.subject_name ?? null,
        segmentation: row.segmentation,
      },
      heading: entry.kgActivity?.label ?? entry.activity?.title ?? entry.trait.label,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 보기 전환 — 두 기능이 답하는 질문이 다르므로 라벨에 그 질문을 적는다 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/60 p-1">
          <ModeButton active={mode === 'kg'} onClick={() => setMode('kg')} icon={Sparkles}>
            기록된 역량
            {totalTraits > 0 && <span className="ml-1.5 text-[10px] opacity-70">{totalTraits}</span>}
          </ModeButton>
          <ModeButton active={mode === 'keywords'} onClick={() => setMode('keywords')} icon={Tags}>
            핵심역량 키워드
          </ModeButton>
        </div>
        <p className="text-[11px] text-slate-400">
          {mode === 'kg'
            ? '생기부 원문에서 판정된 역량과 그 판정 근거입니다.'
            : '핵심역량 사전의 표현이 원문에 실제로 쓰였는지 찾습니다.'}
        </p>
      </div>

      {/*
        키워드 보기는 종전 컴포넌트를 **그대로** 렌더한다. 감싸지 않는 이유는 그쪽 루트가
        `h-full` + `flex-1`로 자기 높이를 계산하기 때문이다 — 중간에 flex 컨테이너를 하나
        끼우면 문맥 패널의 `min-h-[300px]`이 예전과 다르게 늘어난다.
      */}
      {mode === 'keywords' ? (
        <KeywordAnalysis student={student} />
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">역량 데이터 로딩 중...</p>
        </div>
      ) : !kg ? (
        <EmptyKg studentName={student.name} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* 출처 머리글 — 어느 세대를 보고 있는지 감추지 않는다 */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Sparkles size={15} />
              </span>
              <span className="text-sm font-semibold text-slate-800">지식그래프 역량 층</span>
              <Badge variant="outline" className="border-slate-200 bg-white text-[11px] font-normal text-slate-600">
                {engineLabel(kg.engine)}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-[11px] font-normal text-slate-500">
                v{kg.version}
                {kg.createdAt ? ` · ${kg.createdAt.slice(0, 10)}` : ''}
              </Badge>
              <span className="ml-auto text-[11px] text-slate-400">
                활동 {kg.activities.size}개 · 분절 활동 {ledger.activities.length}개
              </span>
            </div>
            {kgQuery.data?.newerEngine && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700">
                <Info size={13} className="mt-px flex-shrink-0" />
                더 최신 세대({engineLabel(kgQuery.data.newerEngine)})가 있지만 역량 층을 만들지 않아,
                역량이 기록된 가장 최신 세대를 보여줍니다.
              </p>
            )}
          </div>

          {/* 층 전환 */}
          <div className="flex flex-wrap gap-1.5">
            {TRAIT_KIND_ORDER.map((k) => {
              const Icon = TRAIT_ICONS[k];
              const count = view.counts[k];
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={count === 0}
                  onClick={() => setKind(k)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : count === 0
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Icon size={13} />
                  {TRAIT_KIND_LABELS[k]}
                  <span className={cn('text-[10px]', active ? 'text-violet-500' : 'text-slate-400')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/*
            되풀이된 라벨. v8 은 라벨이 진술문이라 대개 비어 있는 것이 정상이므로,
            비면 이 구획을 아예 그리지 않는다(빈 카드가 "데이터가 없다"로 읽힌다).
          */}
          {view.repeated.length > 0 && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3.5">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-800">
                <Sparkles size={13} /> 되풀이된 {TRAIT_KIND_LABELS[kind]}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {view.repeated.slice(0, 12).map((r) => (
                  <span
                    key={r.label}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] text-violet-700"
                  >
                    {r.label}
                    <span className="text-violet-400">×{r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {view.groups.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-500">
                {totalTraits === 0
                  ? `이 세대(${engineLabel(kg.engine)})는 역량·성취·태도 층을 만들지 않습니다.`
                  : `이 세대의 지식그래프에는 ${TRAIT_KIND_LABELS[kind]} 항목이 없습니다.`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {totalTraits === 0
                  ? '「핵심역량 키워드」 보기를 쓰거나, 새 세대가 만들어진 뒤 다시 확인하세요.'
                  : '다른 층을 선택해 보세요.'}
              </p>
            </div>
          ) : (
            view.groups.map((group) => {
              const collapsed = collapsedGrades.has(group.label);
              return (
                <div key={group.label} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => toggleGrade(group.label)}
                    className="flex w-full items-center gap-2 bg-slate-50 px-4 py-2.5 text-left transition-colors hover:bg-slate-100"
                  >
                    {collapsed
                      ? <ChevronRight className="h-4 w-4 text-slate-500" />
                      : <ChevronDown className="h-4 w-4 text-slate-500" />}
                    <span className="text-sm font-semibold text-slate-700">{group.label}</span>
                    <span className="text-[11px] text-slate-400">{group.entries.length}건</span>
                  </button>
                  {!collapsed && (
                    <div className="divide-y divide-slate-100">
                      {group.entries.map((entry, i) => (
                        <TraitRow
                          key={`${entry.trait.entityId}-${entry.trait.activityId ?? i}`}
                          entry={entry}
                          onOpenRecord={openRecord}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
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

/**
 * 한 항목 = 진술 + **근거** + 출처.
 *
 * 근거 인용이 이 행의 핵심이다. "역량이 있다"만 보여주면 교사는 확인할 방법이 없고,
 * 생기부 평가에 쓸 수도 없다. 그래서 인용을 접지 않고 항상 펴 둔다.
 */
const TraitRow: React.FC<{
  entry: CompetencyEntry;
  onOpenRecord: (entry: CompetencyEntry) => void;
}> = ({ entry, onOpenRecord }) => {
  const tone = areaTone(entry.area);
  const activity = entry.activity;
  /**
   * 활동 이름은 **KG 노드**에서 가져온다(`entry.activity.title` 이 아니다).
   * `solar-pro3` 은 노드 하나가 기록 전체를 가리켜 분절이 여럿 걸리므로, 분절 제목을
   * 쓰면 임의로 고른 조각의 이름이 붙는다.
   */
  const kgNode = entry.kgActivity;
  const activityName = kgNode?.label ?? activity?.title ?? null;
  return (
    <div className="px-4 py-3 transition-colors hover:bg-slate-50/70">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', tone.dot)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-slate-800">{entry.trait.label}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px]', tone.chip)}>
              {areaLabel(entry.area)}
            </span>
            {entry.subject && entry.subject !== areaLabel(entry.area) && (
              <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                {entry.subject}
              </span>
            )}
            {/* 학기는 기록된 경우에만 붙는다 — 전체의 5%뿐이라 축으로는 쓸 수 없다 */}
            {activity?.semester != null && (
              <span className="text-[10px] text-slate-400">{activity.semester}학기</span>
            )}
            {kgNode?.level != null && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500" title="탐구 심화 수준(0~4)">
                수준 {kgNode.level}
              </span>
            )}
            {entry.trait.confidence != null && (
              <span className="text-[10px] text-slate-300" title="판정 신뢰도">
                {entry.trait.confidence.toFixed(2)}
              </span>
            )}
          </div>

          {entry.trait.evidence && (
            <div className="mt-2 flex gap-2">
              <Quote size={13} className="mt-0.5 flex-shrink-0 text-slate-300" />
              <p className="text-xs leading-relaxed text-slate-600">{entry.trait.evidence}</p>
            </div>
          )}

          {activityName && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ScrollText size={12} className="flex-shrink-0 text-slate-400" />
              <span className="min-w-0 truncate text-[11px] text-slate-500" title={activityName}>
                {activityName}
              </span>
              {kgNode?.researchQuestion && (
                <span
                  className="min-w-0 truncate rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700"
                  title={kgNode.researchQuestion}
                >
                  {kgNode.researchQuestion}
                </span>
              )}
              {activity && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-[11px] text-slate-500 hover:text-slate-800"
                  onClick={() => onOpenRecord(entry)}
                >
                  <FileText size={11} /> 원문
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyKg: React.FC<{ studentName?: string }> = ({ studentName }) => (
  <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-violet-50/40 px-6 py-16 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
      <Sparkles size={26} className="text-violet-500" />
    </div>
    <p className="text-sm font-medium text-slate-600">
      {studentName ? `${studentName} 학생의 ` : ''}지식그래프가 아직 없습니다
    </p>
    <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
      역량 층은 생기부 원문에서 배치로 추출됩니다. 아직 만들어지지 않았거나,
      추출 문턱을 넘는 탐구 활동이 없는 경우입니다. 그동안은
      <span className="font-medium text-slate-500"> 핵심역량 키워드</span>를 쓰세요.
    </p>
  </div>
);

export default CompetencyAnalysis;
