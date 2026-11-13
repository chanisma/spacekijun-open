// 탐구 탐색 — 상위 갈래 → 리프 주제군 → 활동 3단.
//
// 설계 = docs/features/creative-activities-graphrag.md §6, 방법론 = 스킬 `/inquiry-graphrag`
//
// ── 이 화면이 지켜야 하는 것 하나 ──────────────────────────────────────────
// **심화 비율만 보여 주면 안 된다.** 탐구 인정률이 1문장 26% → 4문장 이상 78% 로 갈리므로,
// 짧게 적힌 주제군의 낮은 심화는 "이 주제로는 깊이 못 간다"가 아니라 "기록이 짧아 알 수 없다"이다.
// 앞은 하지 말라는 정보이고 뒤는 아무 정보도 아닌데, 둘을 같은 0% 로 보여 주면 구분이 사라진다(§8-10).
// 그래서 카드마다 **활동당 문장 수**를 함께 내고, 재료가 부족하면 비율 대신 그 사실을 적는다.
// 기본 정렬도 심화 비율이 아니다 — 길게 적히는 과학 실험이 위로 몰린다.
import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, FilePlus2, List, Loader2, Network, Repeat, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KnowledgeGraphViewer } from '@/features/kg-viewer/components';
import {
  useInquiryLeafThemes,
  useInquiryThemeActivities,
  useInquiryThemeGraph,
  useInquiryTopThemes,
  useRecurringPrograms,
} from '../hooks/useInquiryExplore';
import { THEME_GRAPH_LEGEND, themeNodeColor, toKgJson } from '../utils/inquiryGraphView';
import { programToSeed, themeToSeed, type RecurringProgram } from '../utils/inquiryToActivity';
import type { ActivityDraftSeed } from './ActivityDraftWidget';
import {
  AREA_LABEL,
  LEVEL_LABEL,
  LEVEL_TONE,
  THEME_SORT_LABEL,
  asLines,
  depthLabel,
  stripCitations,
  type ThemeSort,
} from '../utils/inquiryLabels';
import type { InquiryActivity, InquiryLeafTheme, InquiryTopTheme } from '../types';

interface Props {
  onOpenActivity: (id: string) => void;
  /**
   * 활동 기록으로 옮기기 — **저장하지 않고 폼을 채워 연다**.
   * `activity` 는 교사가 쓰는 운영 기록이라 목적·기간·장소가 있어야 뜻이 있는데
   * 파이프라인은 그것을 모른다. 확인 없이 밀어 넣으면 반쯤 빈 행이 진짜 기록에 섞인다.
   * 교사가 열람 권한이 없으면(학생) 이 콜백이 없고 버튼도 그리지 않는다.
   */
  onSeedActivity?: (seed: ActivityDraftSeed) => void;
}

export function InquiryExploreBoard({ onOpenActivity, onSeedActivity }: Props) {
  const [topId, setTopId] = useState<string | null>(null);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [sort, setSort] = useState<ThemeSort>('size');
  const [showPrograms, setShowPrograms] = useState(false);
  /** 리프를 목록으로 볼지 그래프로 볼지. 그래프는 무거우므로 열 때만 받는다. */
  const [leafView, setLeafView] = useState<'list' | 'graph'>('list');

  const { data: tops = [], isLoading } = useInquiryTopThemes();
  const { data: leaves = [], isLoading: leavesLoading } = useInquiryLeafThemes(topId);
  const { data: acts, isLoading: actsLoading } = useInquiryThemeActivities(leafId);
  const { data: programs = [] } = useRecurringPrograms(showPrograms);

  const top = tops.find((t) => t.id === topId) ?? null;
  const leaf = leaves.find((l) => l.id === leafId) ?? null;

  const sortedLeaves = useMemo(() => {
    const xs = [...leaves];
    if (sort === 'name') return xs.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (sort === 'deep') {
      return xs.sort((a, b) => {
        const da = depthLabel(a.levelDist, a.graded, a.meanSentences);
        const db = depthLabel(b.levelDist, b.graded, b.meanSentences);
        // 재료가 부족한 주제군은 비율로 줄 세우지 않는다 — 아래로 보낸다
        if (da.readable !== db.readable) return da.readable ? -1 : 1;
        return (db.ratio ?? -1) - (da.ratio ?? -1);
      });
    }
    return xs.sort((a, b) => b.size - a.size);
  }, [leaves, sort]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!tops.length) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
          <Sparkles className="h-7 w-7 text-blue-600" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-700">탐구 데이터가 아직 없습니다</p>
        <p className="mt-1 text-xs text-slate-500">생기부 분절·판정 파이프라인이 실행된 뒤에 보입니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb
        top={top}
        leaf={leaf}
        onHome={() => { setTopId(null); setLeafId(null); setShowPrograms(false); }}
        onTop={() => setLeafId(null)}
      />

      {!topId && !showPrograms && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              창의적 체험활동 {tops.reduce((s, t) => s + t.size, 0).toLocaleString()}건을 뜻이 가까운 것끼리 묶은 {tops.length}개 갈래입니다.
            </p>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowPrograms(true)}>
              <Repeat className="h-3.5 w-3.5" />
              해마다 하는 프로그램
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tops.map((t) => <TopCard key={t.id} theme={t} onClick={() => setTopId(t.id)} />)}
          </div>
        </>
      )}

      {showPrograms && !topId && (
        <ProgramList programs={programs} onBack={() => setShowPrograms(false)} onSeed={onSeedActivity} />
      )}

      {topId && !leafId && (
        <>
          {top?.report && <TopReportPanel theme={top} />}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">주제군 {leaves.length}개</p>
            <div className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1">
              {(Object.keys(THEME_SORT_LABEL) as ThemeSort[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSort(k)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] transition-colors',
                    sort === k ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {THEME_SORT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          {leavesLoading ? (
            <div className="flex h-32 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortedLeaves.map((l) => <LeafCard key={l.id} theme={l} onClick={() => setLeafId(l.id)} />)}
            </div>
          )}
        </>
      )}

      {leafId && (
        <>
          {leaf?.report && <LeafReportPanel theme={leaf} />}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              {leafView === 'graph'
                ? '개념 노드가 활동을 잇는 다리입니다 — 여러 활동이 같은 개념에 붙어 있는 것이 이 묶음의 근거입니다.'
                : ''}
            </p>
            <div className="flex items-center gap-2">
              {onSeedActivity && leaf && acts?.rows.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => onSeedActivity(themeToSeed(leaf, acts.rows))}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  활동 기록으로
                </Button>
              ) : null}
              <div className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1">
                <ViewButton active={leafView === 'list'} onClick={() => setLeafView('list')} icon={<List className="h-3.5 w-3.5" />}>목록</ViewButton>
                <ViewButton active={leafView === 'graph'} onClick={() => setLeafView('graph')} icon={<Network className="h-3.5 w-3.5" />}>그래프</ViewButton>
              </div>
            </div>
          </div>
          {leafView === 'graph' ? (
            <ThemeGraph themeId={leafId} themeName={leaf?.name ?? ''} onOpenActivity={onOpenActivity} />
          ) : actsLoading ? (
            <div className="flex h-32 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <ActivityList data={acts} onOpen={onOpenActivity} />
          )}
        </>
      )}
    </div>
  );
}

// ── 부품 ────────────────────────────────────────────────────────────────────

function Breadcrumb({ top, leaf, onHome, onTop }: {
  top: InquiryTopTheme | null; leaf: InquiryLeafTheme | null; onHome: () => void; onTop: () => void;
}) {
  if (!top) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <button type="button" onClick={onHome} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        전체 갈래
      </button>
      <ChevronRight className="h-3 w-3 text-slate-300" />
      <button
        type="button"
        onClick={onTop}
        className={cn('rounded-md px-1.5 py-1', leaf ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-700' : 'font-medium text-slate-800')}
      >
        {top.name}
      </button>
      {leaf && (
        <>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="px-1.5 py-1 font-medium text-slate-800">{leaf.name}</span>
        </>
      )}
    </div>
  );
}

/** 심화 비율 + **활동당 문장 수**. 둘을 함께 내는 것이 이 화면의 규약이다(§8-10). */
function DepthChip({ levelDist, graded, meanSentences }: { levelDist: Record<string, number>; graded: number; meanSentences: number | null }) {
  const d = depthLabel(levelDist, graded, meanSentences);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
          d.readable ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-slate-50 text-slate-500 ring-slate-200',
        )}
      >
        {d.text}
      </span>
      {meanSentences != null && (
        <span className="text-[10px] text-slate-400" title="활동 하나에 적힌 문장 수. 짧으면 깊이 판정 자체가 어렵습니다.">
          기록 {meanSentences.toFixed(1)}문장
        </span>
      )}
    </div>
  );
}

function TopCard({ theme, onClick }: { theme: InquiryTopTheme; onClick: () => void }) {
  const summary = theme.report?.summary ? stripCitations(theme.report.summary) : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400" />
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-slate-800">{theme.name}</h3>
        <span className="shrink-0 text-[11px] text-slate-400">{theme.size.toLocaleString()}건</span>
      </div>
      {summary && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600">{summary}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <DepthChip levelDist={theme.levelDist} graded={theme.graded} meanSentences={theme.meanSentences} />
      </div>
      {!!theme.report?.fields?.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {theme.report.fields.slice(0, 3).map((f) => (
            <Badge key={f} variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-normal">{f}</Badge>
          ))}
        </div>
      )}
    </button>
  );
}

/** 상위 갈래 보고서 — `landscape`(어떤 축으로 갈리는가)와 `entry`(어디서 시작할까)는 이 층에만 있다. */
function TopReportPanel({ theme }: { theme: InquiryTopTheme }) {
  const r = theme.report!;
  const landscape = asLines(r.landscape).map(stripCitations);
  const entry = asLines(r.entry).map(stripCitations);
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-sm leading-relaxed text-slate-700">{stripCitations(r.summary)}</p>
      {!!landscape.length && (
        <div className="mt-3 border-t pt-3">
          <p className="text-[11px] font-semibold text-slate-500">이 갈래 안의 지형</p>
          {landscape.map((l, i) => <p key={i} className="mt-1 text-xs leading-relaxed text-slate-600">{l}</p>)}
        </div>
      )}
      {!!entry.length && (
        <div className="mt-3 rounded-xl bg-blue-50/60 p-3">
          <p className="text-[11px] font-semibold text-blue-700">처음 시작한다면</p>
          {entry.map((l, i) => <p key={i} className="mt-1 text-xs leading-relaxed text-slate-700">{l}</p>)}
        </div>
      )}
    </div>
  );
}

function LeafCard({ theme, onClick }: { theme: InquiryLeafTheme; onClick: () => void }) {
  const summary = theme.report?.summary ? stripCitations(theme.report.summary) : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-slate-800">{theme.name}</h3>
        <span className="shrink-0 text-[11px] text-slate-400">{theme.size}건</span>
      </div>
      {summary && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{summary}</p>}
      <div className="mt-2.5">
        <DepthChip levelDist={theme.levelDist} graded={theme.graded} meanSentences={theme.meanSentences} />
      </div>
    </button>
  );
}

function LeafReportPanel({ theme }: { theme: InquiryLeafTheme }) {
  const r = theme.report!;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-sm leading-relaxed text-slate-700">{stripCitations(r.summary)}</p>
      <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
        {!!r.gaps?.length && (
          <div>
            <p className="text-[11px] font-semibold text-slate-500">이 주제군에서 약한 곳</p>
            <ul className="mt-1 space-y-1">
              {r.gaps.slice(0, 3).map((g, i) => (
                <li key={i} className="text-xs leading-relaxed text-slate-600">· {stripCitations(g)}</li>
              ))}
            </ul>
          </div>
        )}
        {!!r.extensions?.length && (
          <div>
            <p className="text-[11px] font-semibold text-slate-500">여기서 더 나갈 수 있는 것</p>
            <ul className="mt-1 space-y-1">
              {r.extensions.slice(0, 3).map((g, i) => (
                <li key={i} className="text-xs leading-relaxed text-slate-600">· {stripCitations(g)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityList({ data, onOpen }: { data?: { rows: InquiryActivity[]; memberCount: number }; onOpen: (id: string) => void }) {
  if (!data?.rows.length) {
    return <p className="py-8 text-center text-xs text-slate-400">표시할 활동이 없습니다.</p>;
  }
  const hidden = data.memberCount - data.rows.length;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        활동 {data.rows.length}건
        {hidden > 0 && <span className="text-slate-400"> · 비탐구 판정 등으로 {hidden}건은 목록에 없습니다</span>}
      </p>
      {data.rows.map((a) => <ActivityRow key={a.id} activity={a} onClick={() => onOpen(a.id)} />)}
    </div>
  );
}

export function ActivityRow({ activity: a, onClick }: { activity: InquiryActivity; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      {a.level != null && (
        <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset', LEVEL_TONE[a.level])}>
          L{a.level} {LEVEL_LABEL[a.level]}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-sm font-medium text-slate-800" title={a.title}>{a.title}</p>
          {a.is_mine && <Badge className="h-4 shrink-0 rounded px-1 text-[9px]">내 활동</Badge>}
        </div>
        {a.research_question && (
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500" title={a.research_question}>{a.research_question}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-400">{AREA_LABEL[a.area] ?? a.area}</span>
          {/* 동아리명은 활동이 어디서 나왔는지를 말한다 — 같은 주제라도 동아리가 다르면 맥락이 다르다 */}
          {a.club_name && (
            <span className="rounded bg-fuchsia-50 px-1.5 py-0.5 text-[10px] text-fuchsia-700">{a.club_name}</span>
          )}
          {a.grade != null && <span className="text-[10px] text-slate-400">· {a.grade}학년</span>}
          {a.method_types.slice(0, 3).map((m) => (
            <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{m}</span>
          ))}
          {a.n_sentences != null && <span className="text-[10px] text-slate-300">· {a.n_sentences}문장</span>}
        </div>
      </div>
    </button>
  );
}

function ProgramList({ programs, onBack, onSeed }: {
  programs: RecurringProgram[];
  onBack: () => void;
  onSeed?: (seed: ActivityDraftSeed) => void;
}) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100">
        <ArrowLeft className="h-3.5 w-3.5" /> 전체 갈래
      </button>
      <p className="text-[11px] text-slate-500">
        여러 해에 걸쳐 반복된 프로그램입니다. <span className="text-slate-400">끊긴 해가 있으면 그것도 보입니다.</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {programs.map((p) => (
          <div key={p.programId} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium text-slate-800" title={p.title}>{p.title}</p>
              <span className="shrink-0 text-[11px] text-slate-400">{p.students}명</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-slate-400">{AREA_LABEL[p.area] ?? p.area}{p.grade != null && ` · ${p.grade}학년`}</span>
              {p.years.map((y) => (
                <span key={y} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{y}</span>
              ))}
            </div>
            {onSeed && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 w-full gap-1.5 text-[11px]"
                onClick={() => onSeed(programToSeed(p))}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                활동 기록으로 옮기기
              </Button>
            )}
          </div>
        ))}
        {!programs.length && <p className="py-8 text-center text-xs text-slate-400">반복 프로그램이 없습니다.</p>}
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition-colors',
        active ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * 주제군 그래프 — 프로젝트의 기존 `KnowledgeGraphViewer`(Cytoscape)를 그대로 쓴다.
 *
 * 색은 **탐구 수준**으로 칠한다(`nodeColor`). 뷰어의 기본은 엔티티 타입별 색인데
 * 여기서는 노드가 활동·개념 둘뿐이라 타입으로는 아무것도 구분되지 않는다.
 * 색을 바꿨으므로 **범례도 함께 넘긴다** — 안 그러면 색과 설명이 어긋난다.
 */
function ThemeGraph({ themeId, themeName, onOpenActivity }: {
  themeId: string; themeName: string; onOpenActivity: (id: string) => void;
}) {
  const { data, isLoading } = useInquiryThemeGraph(themeId, true);
  const kg = useMemo(() => (data ? toKgJson(themeName, data) : null), [data, themeName]);

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!kg || !kg.entities.length) {
    return <p className="py-8 text-center text-xs text-slate-400">그래프로 그릴 활동이 없습니다.</p>;
  }
  const conceptCount = kg.entities.filter((e) => e.type === 'Concept').length;
  return (
    <div className="space-y-2">
      <KnowledgeGraphViewer
        data={kg}
        height={520}
        layout="cose"
        nodeColor={themeNodeColor}
        legend={THEME_GRAPH_LEGEND}
        onNodeClick={(id) => { if (!id.startsWith('c:')) onOpenActivity(id); }}
      />
      <p className="text-[10px] text-slate-400">
        활동 {kg.entities.length - conceptCount}개 · 개념 {conceptCount}개
        {' · '}두 건 이상에 붙은 개념만 그립니다(한 건에만 붙은 개념은 다리 노릇을 못 합니다).
        {' '}활동 노드를 누르면 상세가 열립니다.
      </p>
    </div>
  );
}
