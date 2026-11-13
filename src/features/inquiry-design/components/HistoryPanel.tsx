import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clipboard,
  Clock,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelColumns } from './PanelColumns';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PANEL_WIDTH_CLASS, type PanelWidthMode } from './panelWidth';
import type {
  ComprehensiveRecommendation,
  ComprehensiveRecommendationRow,
  InquiryActivityRecord,
  InquiryWorkspace,
  SavedInquiryDesign,
} from '../types';
import { buildActivityDesignPrompt } from '../utils/activityDesignPrompt';
import { AchievementLinkCard } from './AchievementLinkCard';
import { normalizeSubjectKey } from '../services/achievementContextService';
import type { AchievementLinkRecord } from '../utils/achievementStandards';
import { planStepTitle } from '../utils/planSteps';

interface HistoryPanelProps {
  workspace: InquiryWorkspace;
  isOpen?: boolean;
  // Student-facing mode: hides external-LLM prompt copy and token metadata.
  studentMode?: boolean;
  deletingId: string | null;
  onDelete: (designId: string) => void;
  // Bridge into the design tab, same semantics as ComprehensiveAnalysisPanel.
  onSeedDesign?: (rec: ComprehensiveRecommendation) => void;
  /** 준비 단계(방향 선택 대기)에서 그대로 이어서 진행 — 종합 분석 탭을 그 행으로 연다. */
  onResumeComprehensive?: (recommendationId: string) => void;
  /** 종합 분석 이력 삭제. 진행 중인 id 는 `deletingRecId` 로 알린다. */
  onDeleteComprehensive?: (recommendationId: string) => void;
  deletingRecId?: string | null;
  /** 패널 폭 단계. 1단(기본) / 2단(넓게) — 페이지가 손잡이에서 정한다. */
  widthMode?: PanelWidthMode;
  /**
   * 성취기준 맥락 **목차**(과목 정규화 키 → 문서). 페이지가 한 번 받아 두는 것을 그대로 받는다.
   * 이력의 설계도 「어느 성취기준에 닿는가」를 짚을 수 있어야 하는데, 그 판정에 필요한 것은
   * 이 목차뿐이다(본문은 실제로 짚을 때만 받는다).
   */
  achievementIndex?: Map<string, { id: string; title: string }>;
  /** 짚은 결과를 그 설계 행에 남긴다. */
  onPersistAchievementLinks?: (
    design: SavedInquiryDesign,
    record: AchievementLinkRecord,
  ) => void | Promise<void>;

  // ── 생명주기 액션 (Phase C) — all resolve to true on success ──
  onResume: (design: SavedInquiryDesign) => void;
  onAcceptProposal: (designId: string, rationale: string) => Promise<boolean>;
  onSaveReflection: (designId: string, reflection: string) => Promise<boolean>;
  onSetObservation: (designId: string, activityId: string | null) => Promise<boolean>;
}

// 상태 배지 스타일. draft/proposed는 카드 테두리도 함께 구분한다.
const STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: '임시', badge: 'border-amber-300 bg-amber-50 text-amber-800' },
  proposed: { label: '선생님 제안', badge: 'border-violet-300 bg-violet-50 text-violet-800' },
  analyzed: { label: '분석됨', badge: 'border-slate-300 bg-slate-50 text-slate-700' },
  saved: { label: '저장', badge: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  observed: { label: '실행됨', badge: 'border-sky-300 bg-sky-50 text-sky-800' },
  archived: { label: '보관', badge: 'border-slate-300 bg-slate-100 text-slate-600' },
};

const STEP_INDEX: Record<string, number> = {
  draft: 0,
  proposed: 0,
  analyzed: 0,
  saved: 1,
  observed: 2,
  archived: 2,
};

function StatusSteps({ status }: { status: string }) {
  const activeIndex = STEP_INDEX[status] ?? 0;
  const steps = ['설계', '저장', '실행'];
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {/* Fragment 대신 span 래퍼 — dev 태거(lovable)가 Fragment에 data-* 속성을
          주입해 React 경고를 유발하므로 실제 엘리먼트로 감싼다. */}
      {steps.map((step, index) => (
        <span key={step} className="flex items-center gap-1.5">
          {index > 0 && (
            <span className={cn('h-px w-4', index <= activeIndex ? 'bg-brand-400' : 'bg-slate-200')} />
          )}
          <span
            className={cn(
              'rounded-full border px-1.5 py-0.5',
              index <= activeIndex
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-400',
              index === activeIndex && 'font-semibold'
            )}
          >
            {step}
          </span>
        </span>
      ))}
      {status === 'archived' && <span className="ml-1 text-slate-400">· 보관됨</span>}
    </div>
  );
}

function activityOptionLabel(activity: InquiryActivityRecord): string {
  const period = [
    activity.grade ? `${activity.grade}학년` : '',
    activity.semester ? `${activity.semester}학기` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const subject = [activity.category, activity.subject_name].filter(Boolean).join(' · ');
  const snippet = (activity.content ?? '').slice(0, 24);
  return [period, subject, snippet ? `${snippet}…` : '']
    .filter(Boolean)
    .join(' · ');
}

// Expanded-card lifecycle actions: 이어서 작업 / 제안 수락 / 실행 연결 / 성찰.
// Keyed by design.id at the call site so local drafts reset per card.
function DesignLifecycleSection({
  design,
  activityRecords,
  studentMode,
  onResume,
  onAcceptProposal,
  onSaveReflection,
  onSetObservation,
}: {
  design: SavedInquiryDesign;
  activityRecords: InquiryActivityRecord[];
  studentMode: boolean;
  onResume: (design: SavedInquiryDesign) => void;
  onAcceptProposal: (designId: string, rationale: string) => Promise<boolean>;
  onSaveReflection: (designId: string, reflection: string) => Promise<boolean>;
  onSetObservation: (designId: string, activityId: string | null) => Promise<boolean>;
}) {
  const [acceptRationale, setAcceptRationale] = useState(design.student_rationale ?? '');
  const [reflectionDraft, setReflectionDraft] = useState(design.reflection ?? '');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [busy, setBusy] = useState<null | 'accept' | 'reflect' | 'observe'>(null);

  const linkedActivity = design.observed_activity_id
    ? activityRecords.find((activity) => activity.id === design.observed_activity_id) ?? null
    : null;
  const reflectionDirty = reflectionDraft.trim() !== (design.reflection ?? '').trim();

  const run = async (kind: 'accept' | 'reflect' | 'observe', fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <StatusSteps status={design.status} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto min-h-10 w-full gap-2 whitespace-normal rounded-lg py-2 text-xs"
        onClick={() => onResume(design)}
        title="대상·선택 근거·분석 결과를 설계 패널로 복원합니다"
      >
        <ArrowRight className="h-3 w-3" />
        설계 패널로 불러와 이어서 작업
      </Button>

      {design.status === 'proposed' &&
        (studentMode ? (
          <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
            <div className="text-[11px] font-semibold text-violet-900">선생님 제안 수락</div>
            <p className="text-xs leading-5 text-violet-700">
              이 탐구를 왜 하고 싶은지 내 말로 적고 수락하면 나의 정식 설계가 됩니다.
            </p>
            <Textarea
              aria-label="제안 수락을 위한 나의 탐구 이유"
              value={acceptRationale}
              onChange={(event) => setAcceptRationale(event.target.value)}
              placeholder="이 탐구를 하고 싶은 나만의 이유"
              className="min-h-24 resize-y rounded-lg border-slate-200 bg-white text-sm leading-6 placeholder:text-slate-400"
            />
            <Button
              type="button"
              size="sm"
              className="h-auto min-h-10 w-full gap-2 whitespace-normal rounded-lg py-2 text-xs"
              disabled={!acceptRationale.trim() || busy !== null}
              onClick={() =>
                run('accept', () => onAcceptProposal(design.id, acceptRationale.trim()))
              }
            >
              {busy === 'accept' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              내 설계로 수락
            </Button>
          </div>
        ) : (
          <p className="rounded-md border border-violet-200 bg-violet-50/50 px-2.5 py-2 text-xs leading-6 text-violet-800">
            학생 수락 대기 중 — 학생이 자신의 근거를 작성하고 수락하면 정식 설계가 됩니다.
          </p>
        ))}

      {(design.status === 'saved' || design.status === 'observed') && (
        <>
          {design.status === 'saved' ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                <Link2 className="h-3 w-3" />
                실행 활동 연결
              </div>
              <p className="text-xs leading-5 text-slate-500">
                이 설계가 실제로 수행되어 기록으로 남았다면 해당 활동을 연결하세요.
              </p>
              <select
                aria-label="연결할 실행 활동"
                value={selectedActivityId}
                onChange={(event) => setSelectedActivityId(event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-brand-400 focus:outline-none"
              >
                <option value="">활동 기록 선택…</option>
                {activityRecords.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activityOptionLabel(activity)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto min-h-10 w-full gap-2 whitespace-normal rounded-lg py-2 text-xs"
                disabled={!selectedActivityId || busy !== null}
                onClick={() =>
                  run('observe', async () => {
                    const ok = await onSetObservation(design.id, selectedActivityId);
                    if (ok) setSelectedActivityId('');
                  })
                }
              >
                {busy === 'observe' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                실행 완료로 연결
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-sky-800">
                <Link2 className="h-3 w-3" />
                연결된 실행 활동
              </div>
              <p className="text-xs leading-6 text-sky-900">
                {linkedActivity
                  ? activityOptionLabel(linkedActivity)
                  : '연결된 활동 기록을 찾을 수 없습니다 (삭제되었을 수 있음).'}
              </p>
              {design.observed_at && (
                <p className="text-[10px] text-sky-700">연결 시점: {formatDate(design.observed_at)}</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[10px] text-sky-700 hover:bg-sky-100 hover:text-sky-900"
                disabled={busy !== null}
                onClick={() => run('observe', () => onSetObservation(design.id, null))}
              >
                {busy === 'observe' && <Loader2 className="h-3 w-3 animate-spin" />}
                연결 해제 (저장 상태로 되돌리기)
              </Button>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-[11px] font-semibold text-slate-700">
              {studentMode ? '나의 성찰' : '성찰 기록'}
            </div>
            <Textarea
              aria-label={studentMode ? '나의 성찰' : '성찰 기록'}
              value={reflectionDraft}
              onChange={(event) => setReflectionDraft(event.target.value)}
              placeholder={
                studentMode
                  ? '계획과 실제가 어떻게 달랐는지, 다음 탐구로 무엇이 이어질지 적어보세요'
                  : '계획 대비 변화, 후속 탐구 연결점 기록'
              }
              className="min-h-24 resize-y rounded-lg border-slate-200 bg-white text-sm leading-6 placeholder:text-slate-400"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-auto min-h-10 w-full gap-2 whitespace-normal rounded-lg py-2 text-xs"
              disabled={!reflectionDirty || busy !== null}
              onClick={() => run('reflect', () => onSaveReflection(design.id, reflectionDraft))}
            >
              {busy === 'reflect' && <Loader2 className="h-3 w-3 animate-spin" />}
              성찰 저장
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function targetKindLabel(kind: string): string {
  switch (kind) {
    case 'subject':
      return '교과';
    case 'club':
      return '동아리';
    case 'autonomous':
      return '자율';
    case 'career':
      return '진로';
    default:
      return kind;
  }
}

/**
 * 이 이력 항목이 **밟고 선 그래프**를 알리는 배지 (2026-09-12 사용자 요청).
 *
 * KG 는 append-only 라 추출이 바뀔 때마다 버전이 쌓이고, 버전이 다르면 엔티티 id·라벨이 달라진다.
 * 목록을 버전으로 **거르지는 않는다**(사용자 결정: 전부 보이되 어느 그래프인지만 밝힌다) —
 * 대신 지금 보는 그래프와 다르면 그 사실을 눈에 띄게 말한다.
 */
function KgBaseVersionTag({
  versionId,
  workspace,
}: {
  versionId: string | null | undefined;
  workspace: InquiryWorkspace;
}) {
  if (!versionId) {
    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">
        기반 그래프 미기록
      </Badge>
    );
  }
  const summary = workspace.kgVersions.find((v) => v.id === versionId);
  const isCurrent = versionId === (workspace.kgVersion?.id ?? null);
  // 버전 행이 지워졌을 수도 있다(설계는 `on delete set null` 로 살아남지만 목록에선 사라진다).
  const label = summary ? `v${summary.version}` : '삭제된 버전';
  return (
    <Badge
      variant="outline"
      title={
        isCurrent
          ? '지금 보고 있는 그래프를 기반으로 만들어졌습니다.'
          : '지금 보고 있는 그래프와 다른 버전을 기반으로 만들어졌습니다. 아래 설명은 그때 그 그래프의 내용입니다.'
      }
      className={cn(
        'text-[10px]',
        isCurrent
          ? 'border-slate-200 bg-slate-50 text-slate-600'
          : 'border-amber-300 bg-amber-50 text-amber-800'
      )}
    >
      기반 {label}
      {summary ? ` · ${formatDate(summary.created_at)}` : ''}
      {!isCurrent && ' · 다른 그래프'}
    </Badge>
  );
}

/**
 * 이 항목의 **기반 버전**으로 엔티티 라벨을 읽는다.
 *
 * ⚠️ **지금 보고 있는 그래프에서 찾지 않는다.** 종전엔 `workspace.kgEntities` 하나로 모든 이력을
 * 풀었는데, 그건 "그때 그 분석이 가리킨 것"이 아니라 "지금 그래프에서 같은 id 를 가진 것"이라
 * 다른 질문에 답하는 것이다. 버전이 다르면 그 id 가 없거나(원시 id 노출) 다른 것을 가리킨다.
 * 그래서 기반 버전이 없거나 그 버전의 사전을 못 받았으면 **원시 id 를 그대로 보여 준다** —
 * 엉뚱한 라벨보다 정직하다.
 */
function labelMapForVersion(
  workspace: InquiryWorkspace,
  versionId: string | null | undefined,
): Map<string, string> {
  if (!versionId) return EMPTY_LABELS;
  if (versionId === (workspace.kgVersion?.id ?? null)) {
    const m = new Map<string, string>();
    for (const e of workspace.kgEntities) m.set(e.entity_id, e.label);
    return m;
  }
  return workspace.historyEntityLabels.get(versionId) ?? EMPTY_LABELS;
}

const EMPTY_LABELS: Map<string, string> = new Map();

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '날짜 없음';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

// Pre-sort newest-first. The workspace doesn't guarantee an order so we sort
// once at render time rather than mutating the source array.
function sortNewestFirst(designs: SavedInquiryDesign[]): SavedInquiryDesign[] {
  return [...designs].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return tb - ta;
  });
}

function sortRecsNewestFirst(recs: ComprehensiveRecommendationRow[]): ComprehensiveRecommendationRow[] {
  return [...recs].sort((a, b) => {
    const ta = new Date(a.updated_at).getTime();
    const tb = new Date(b.updated_at).getTime();
    return tb - ta;
  });
}

// Some stored recommendations have entity_ids in label slots due to an earlier
// prompt bug. This helper resolves an entity-id-looking string to its label via
// the KG; non-id strings (real labels) pass through unchanged.
const ENTITY_ID_RE = /^[a-z]+_[a-z0-9]{6,}$/i;
function resolveLabelOrId(value: string, labelById: Map<string, string>): string {
  if (ENTITY_ID_RE.test(value)) {
    return labelById.get(value) ?? value;
  }
  return value;
}

export function HistoryPanel({
  workspace,
  isOpen = true,
  studentMode = false,
  deletingId,
  onDelete,
  onSeedDesign,
  onResumeComprehensive,
  onDeleteComprehensive,
  deletingRecId = null,
  widthMode = 'compact',
  achievementIndex,
  onPersistAchievementLinks,
  onResume,
  onAcceptProposal,
  onSaveReflection,
  onSetObservation,
}: HistoryPanelProps) {
  const sortedDesigns = useMemo(() => sortNewestFirst(workspace.savedDesigns), [workspace.savedDesigns]);
  const sortedRecs = useMemo(
    () => sortRecsNewestFirst(workspace.comprehensiveRecommendations ?? []),
    [workspace.comprehensiveRecommendations]
  );
  // 항목마다 **자기 기반 버전**으로 라벨을 푼다. 한 화면에 여러 버전의 이력이 섞이므로
  // 사전이 하나일 수 없다. 같은 버전을 여러 항목이 공유하니 버전 단위로 기억해 둔다.
  const labelMapCache = useMemo(() => new Map<string, Map<string, string>>(), [workspace]);
  const labelsFor = (versionId: string | null | undefined) => {
    const key = versionId ?? '(none)';
    const hit = labelMapCache.get(key);
    if (hit) return hit;
    const built = labelMapForVersion(workspace, versionId);
    labelMapCache.set(key, built);
    return built;
  };

  const { toast } = useToast();
  // 기반 버전을 함께 받는다 — 프롬프트에 실리는 라벨도 "그때 그 그래프"의 것이어야 한다.
  const handleCopyDesignPrompt = async (
    rec: ComprehensiveRecommendation,
    baseVersionId: string | null,
  ) => {
    const prompt = buildActivityDesignPrompt(rec, labelsFor(baseVersionId));
    try {
      await navigator.clipboard.writeText(prompt);
      toast({
        title: '프롬프트 복사됨',
        description: 'LLM(ChatGPT/Claude 등)에 붙여넣어 구체적인 활동 설계를 받아보세요.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: '복사 실패', description: msg, variant: 'destructive' });
    }
  };
  // One expand at a time across both sections. Prefix design IDs with "d:" and
  // recommendation IDs with "r:" so the namespaces never collide.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const heading = detailHeadingRef.current;
    if (!heading) return;
    const pane = heading.closest('.inquiry-workspace-pane');
    const columns = heading.closest('.inquiry-workspace-columns');
    if (pane) pane.scrollTop = 0;
    if (columns) columns.scrollTop = 0;
    heading.focus({ preventScroll: true });
  }, [expandedId]);

  const selectedDesign = sortedDesigns.find((design) => `d:${design.id}` === expandedId);
  const selectedRec = sortedRecs.find((rec) => `r:${rec.id}` === expandedId);
  const hasSelection = Boolean(selectedDesign || selectedRec);

  const renderDesignDetail = (design: SavedInquiryDesign) => {
    const questionCount = design.llm_result?.inquiry_questions?.length ?? 0;
    const planCount = design.llm_result?.plan_steps?.length ?? 0;
    return (
      <div className="border-t border-slate-200 bg-white p-4 text-sm">
        {design.llm_result?.summary && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">요약</div>
            <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-slate-700">{design.llm_result.summary}</p>
          </div>
        )}

        {questionCount > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              탐구 질문 ({questionCount})
            </div>
            <ul className="mt-2 space-y-2 text-slate-700">
              {design.llm_result!.inquiry_questions.map((q, index) => (
                <li key={q} className="flex gap-2 rounded-lg bg-brand-50/60 p-3 text-sm leading-6"><span className="shrink-0 text-xs font-semibold leading-6 text-brand-600">Q{index + 1}</span><span className="min-w-0 break-words">{q}</span></li>
              ))}
            </ul>
          </div>
        )}

        {planCount > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              실행 단계 ({planCount})
            </div>
            <div className="mt-1 space-y-1.5">
              {design.llm_result!.plan_steps.map((step, index) => (
                <div key={step.title} className="rounded-lg bg-slate-50 p-3 text-xs leading-6">
                  {/* 동그라미 번호를 이미 그렸으므로 제목의 `1.` 은 지운다 — 규칙은 planSteps.ts. */}
                  <div className="flex items-start gap-2 text-sm font-medium text-slate-900"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs text-brand-700">{index + 1}</span>{planStepTitle(step.title, index)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-600">{step.method}</div>
                  {step.expected_evidence && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      기대 결과: {step.expected_evidence}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {design.student_rationale && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              학생 자기 근거
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-slate-700">{design.student_rationale}</p>
          </div>
        )}

        {design.llm_result?.risk_flags && design.llm_result.risk_flags.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">주의점</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {design.llm_result.risk_flags.map((flag) => (
                <Badge key={flag} variant="outline" className="text-[10px]">
                  {flag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {design.llm_result && (
          /* 이력에서도 「어느 성취기준에 닿는가」를 짚을 수 있다 (2026-09-18).
             설계 단계와 분리된 호출이라 **성취기준 맥락을 끄고 만든 옛 설계에도** 붙는다.
             `key` 로 설계마다 상태를 갈라 둔다 — 안 그러면 다른 설계를 펼쳤을 때
             앞 설계의 결과가 잠깐 남아 보인다. */
          <div className="mb-3">
            <AchievementLinkCard
              key={design.id}
              design={design.llm_result}
              context={
                design.target_kind === 'subject'
                  ? achievementIndex?.get(normalizeSubjectKey(design.target_name)) ?? null
                  : null
              }
              onPersist={
                onPersistAchievementLinks
                  ? (record) => onPersistAchievementLinks(design, record)
                  : undefined
              }
            />
          </div>
        )}

        <DesignLifecycleSection
          key={design.id}
          design={design}
          activityRecords={workspace.activityRecords}
          studentMode={studentMode}
          onResume={onResume}
          onAcceptProposal={onAcceptProposal}
          onSaveReflection={onSaveReflection}
          onSetObservation={onSetObservation}
        />

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-[10px] text-slate-400">
            ID {design.id.slice(0, 8)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deletingId === design.id}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(design.id);
            }}
            className="h-7 gap-1 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            {deletingId === design.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            삭제
          </Button>
        </div>
      </div>
    );
  };

  const renderRecDetail = (rec: ComprehensiveRecommendationRow) => {
    const isGenerated = !!rec.generated_at && Array.isArray(rec.recommendations) && rec.recommendations.length > 0;
    const recCount = rec.recommendations?.length ?? 0;
    const directionCount = rec.weaknesses?.length ?? 0;
    const anchors = rec.selected_anchor_subjects ?? [];
    const promptTokens = Number((rec.token_usage as Record<string, unknown>)?.prompt_tokens ?? 0);
    const completionTokens = Number((rec.token_usage as Record<string, unknown>)?.completion_tokens ?? 0);
    const labelById = labelsFor(rec.kg_version_id);
    return (
      <div className="border-t border-slate-200 bg-white p-4 text-sm">
        {rec.user_notes && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">사용자 메모</div>
            <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-slate-700">{rec.user_notes}</p>
          </div>
        )}

        {anchors.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              연결 과목 ({anchors.length})
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {anchors.map((subject) => (
                <Badge key={subject} variant="outline" className="text-[10px]">
                  {subject}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {directionCount > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              보완 방향 ({directionCount})
            </div>
            <div className="mt-1 space-y-2">
              {rec.weaknesses.map((d) => (
                <div key={d.id} className="rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline gap-2">
{/* v1 규칙 산출물에는 `priority` 가 없다. 그때는 `score` 를 **다른 이름으로** 보여 준다 —
                        둘은 방향이 반대라(점수는 클수록 시급, P는 작을수록 먼저) 같은 칸에 넣으면 순서가 뒤집힌 채 그럴듯해 보인다. */}
                    {d.priority != null ? (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
                        P{d.priority}
                      </Badge>
                    ) : d.legacy_score != null ? (
                      <Badge
                        variant="outline"
                        title={`규칙 기반 산출(${d.legacy_kind ?? '종류 미상'}) · 점수는 클수록 시급`}
                        className="h-4 border-slate-300 px-1 text-[10px] font-mono text-slate-500"
                      >
                        점수 {d.legacy_score}
                      </Badge>
                    ) : null}
                    <span className="text-[12px] font-medium text-slate-900">{d.summary}</span>
                  </div>
                  {d.detail && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-6 text-slate-700">
                      {d.detail}
                    </p>
                  )}
                  {(d.suggested_anchor_subjects?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.suggested_anchor_subjects.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {(d.related_entity_ids?.length ?? 0) > 0 && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      관련:{' '}
                      {d.related_entity_ids
                        .map((id) => labelById.get(id) ?? id)
                        .join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isGenerated && rec.recommendations && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              추천 활동 ({recCount})
            </div>
            <div className="mt-1 space-y-2">
              {rec.recommendations.map((item) => (
                <div
                  key={`${item.rank}-${item.title}`}
                  className="rounded-xl border border-brand-200 bg-brand-50/40 p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
                      #{item.rank}
                    </Badge>
                    <span className="min-w-0 flex-1 basis-3/4 break-words text-sm font-semibold leading-6 text-slate-900">{item.title}</span>
                    {onSeedDesign && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 gap-1.5 rounded-lg px-2 text-xs text-brand-600 hover:text-brand-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeedDesign(item);
                        }}
                        title="이 추천을 탐구 설계 탭으로 가져가 바로 설계 시작"
                      >
                        <ArrowRight className="h-3 w-3" />
                        설계 시작
                      </Button>
                    )}
                    {!studentMode && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 gap-1.5 rounded-lg px-2 text-xs text-slate-500 hover:text-slate-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyDesignPrompt(item, rec.kg_version_id);
                        }}
                        title="이 활동의 구체적 설계를 요청하는 LLM 프롬프트 복사 (외부 LLM용)"
                      >
                        <Clipboard className="h-3 w-3" />
                        설계 프롬프트
                      </Button>
                    )}
                  </div>
                  {item.anchor_subject && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      연결 과목: <span className="font-medium text-slate-700">{item.anchor_subject}</span>
                    </div>
                  )}
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                    {item.description}
                  </p>
                  {item.rationale && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-6 text-slate-600">
                      <span className="font-medium text-slate-700">근거: </span>
                      {item.rationale}
                    </p>
                  )}
                  {((item.connected_thread_labels?.length ?? 0) +
                    (item.connected_interest_labels?.length ?? 0) +
                    (item.strengthens_competencies?.length ?? 0)) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.connected_thread_labels?.map((label) => (
                        <span
                          key={`t-${label}`}
                          className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800"
                        >
                          탐구 흐름: {resolveLabelOrId(label, labelById)}
                        </span>
                      ))}
                      {item.connected_interest_labels?.map((label) => (
                        <span
                          key={`i-${label}`}
                          className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800"
                        >
                          관심사: {resolveLabelOrId(label, labelById)}
                        </span>
                      ))}
                      {item.strengthens_competencies?.map((label) => (
                        <span
                          key={`c-${label}`}
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800"
                        >
                          ↑ {resolveLabelOrId(label, labelById)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 행동 줄 (2026-09-12 사용자 요청).
            준비 단계는 **막다른 길이 아니다** — 방향만 고르면 추천이 나온다.
            종전엔 "방향 선택 대기"라고 적고 이어갈 길을 두지 않아,
            사용자가 같은 분석을 처음부터 다시 돌리게 만들었다(하루 5회 제한과 정면으로 부딪힌다). */}
        {(onResumeComprehensive || onDeleteComprehensive) && (
          <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
            {!isGenerated && onResumeComprehensive && (
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 bg-brand-600 text-[11px] text-white hover:bg-brand-700"
                onClick={(event) => {
                  event.stopPropagation();
                  onResumeComprehensive(rec.id);
                }}
                title="이 분석의 보완 방향을 골라 추천을 만듭니다 (다시 분석하지 않습니다)"
              >
                <Sparkles className="h-3.5 w-3.5" />
                이어서 진행
              </Button>
            )}
            {onDeleteComprehensive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deletingRecId === rec.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteComprehensive(rec.id);
                }}
                className="h-7 gap-1 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                {deletingRecId === rec.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                삭제
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400">
          <span>
            ID {rec.id.slice(0, 8)}
            {!studentMode && rec.ai_model && (
              <>
                <span className="mx-1">·</span>
                <span className="font-mono">{rec.ai_model}</span>
              </>
            )}
          </span>
          {!studentMode && isGenerated && (promptTokens > 0 || completionTokens > 0) && (
            <span className="font-mono">
              {promptTokens.toLocaleString()} in / {completionTokens.toLocaleString()} out
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside
      aria-label="분석 이력"
      className={`inquiry-panel absolute right-4 top-4 z-40 flex h-[calc(100%-2rem)] ${PANEL_WIDTH_CLASS[widthMode]} max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
        isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-[calc(100%+1rem)]'
      }`}
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">
              분석 이력
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {workspace.student?.name ?? workspace.student?.id ?? '학생'}
              <span className="mx-1.5 text-slate-300">·</span>
              탐구의 시작부터 실행까지
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-brand-700"><BookOpen className="h-3.5 w-3.5" />탐구 설계</span>
            <span className="text-lg font-semibold tabular-nums text-brand-900">{sortedDesigns.length}<span className="ml-1 text-xs font-normal">건</span></span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><Sparkles className="h-3.5 w-3.5" />종합 분석</span>
            <span className="text-lg font-semibold tabular-nums text-slate-900">{sortedRecs.length}<span className="ml-1 text-xs font-normal">건</span></span>
          </div>
        </div>
      </div>

      <PanelColumns
        widthMode={widthMode}
        className={cn('inquiry-history', hasSelection && 'inquiry-history-selected')}
        primaryLabel="분석 이력 목록"
        secondaryLabel="선택한 이력 상세"
        primary={<div className="space-y-6">
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />최근 이력부터 표시돼요. 항목을 눌러 이어서 작업하세요.</p>
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BookOpen className="h-3.5 w-3.5" />
              탐구 설계 ({sortedDesigns.length})
            </div>
            <div className="space-y-3">

          {sortedDesigns.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-medium text-slate-600">
              아직 저장된 탐구 설계가 없습니다.
              <div className="mt-2 text-xs font-normal leading-5 text-slate-500">
                탐구 설계 패널에서 분석을 저장하면 여기에서 모두 확인할 수 있습니다.
              </div>
            </div>
          )}

          {sortedDesigns.map((design) => {
            const designKey = `d:${design.id}`;
            const expanded = expandedId === designKey;
            const isDraft = design.status === 'draft';
            const isProposed = design.status === 'proposed';
            const statusMeta = STATUS_META[design.status] ?? STATUS_META.saved;
            return (
              <div
                key={design.id}
                className={cn(
                  'overflow-hidden rounded-xl border shadow-sm transition-colors duration-200',
                  expanded
                    ? isDraft
                      ? 'border-amber-300 bg-amber-50/40'
                      : isProposed
                        ? 'border-violet-300 bg-violet-50/40'
                        : 'border-brand-300 bg-brand-50/40'
                    : isDraft
                      ? 'border-dashed border-slate-300 bg-slate-50/60'
                      : isProposed
                        ? 'border-violet-200 bg-violet-50/30'
                        : 'border-slate-200 bg-white'
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(designKey)}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                  aria-pressed={expanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <Badge variant="outline" className={cn('text-[10px]', statusMeta.badge)}>
                        {statusMeta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {targetKindLabel(design.target_kind)}
                      </Badge>
                      <span className="font-mono">{formatDate(design.created_at)}</span>
                      <KgBaseVersionTag versionId={design.kg_version_id} workspace={workspace} />
                      <span>·</span>
                      <span>
                        {design.academic_year} · {design.grade}학년
                        {design.semester ? ` ${design.semester}학기` : ''}
                      </span>
                    </div>
                    <div className="mt-2 break-words text-sm font-semibold leading-6 text-slate-950">{design.title}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">대상: {design.target_name}</div>
                    {design.llm_result?.summary && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">
                        {design.llm_result.summary}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-slate-400">
                    <ArrowRight className={cn('h-4 w-4', expanded && 'text-brand-600')} />
                  </div>
                </button>


              </div>
            );
          })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-3.5 w-3.5" />
              AI 종합 분석 ({sortedRecs.length})
            </div>
            <div className="space-y-2">
              {sortedRecs.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-medium text-slate-600">
                  아직 AI 종합 분석 이력이 없습니다.
                  <div className="mt-2 text-xs font-normal leading-5 text-slate-500">
                    AI 종합 분석 패널에서 보완 방향을 분석하면 이력이 남아요.
                  </div>
                </div>
              )}

              {sortedRecs.map((rec) => {
                const recKey = `r:${rec.id}`;
                const expanded = expandedId === recKey;
                const isGenerated = !!rec.generated_at && Array.isArray(rec.recommendations) && rec.recommendations.length > 0;
                const recCount = rec.recommendations?.length ?? 0;
                const directionCount = rec.weaknesses?.length ?? 0;
                const anchors = rec.selected_anchor_subjects ?? [];
                return (
                  <div
                    key={rec.id}
                    className={cn(
                      'overflow-hidden rounded-xl border shadow-sm transition-colors duration-200',
                      expanded ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(recKey)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                      aria-pressed={expanded}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              isGenerated
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-amber-300 bg-amber-50 text-amber-800'
                            )}
                          >
                            {isGenerated ? '생성 완료' : '준비 단계'}
                          </Badge>
                          <span className="font-mono">
                            {formatDate(rec.generated_at ?? rec.prepared_at)}
                          </span>
                          <KgBaseVersionTag versionId={rec.kg_version_id} workspace={workspace} />
                          <span>·</span>
                          <span>{rec.current_grade}학년</span>
                          {!studentMode && rec.ai_provider && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[10px]">{rec.ai_provider}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-2 break-words text-sm font-semibold leading-6 text-slate-950">
                          {isGenerated
                            ? `추천 ${recCount}건`
                            : `보완 방향 ${directionCount}건 · 이어서 방향을 고르면 추천이 만들어져요`}
                        </div>
                        {anchors.length > 0 && (
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            연결 과목: {anchors.join(', ')}
                          </div>
                        )}
                        {rec.user_notes && (
                          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">
                            {rec.user_notes}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-slate-400">
                        <ArrowRight className={cn('h-4 w-4', expanded && 'text-brand-600')} />
                      </div>
                    </button>


                  </div>
                );
              })}
            </div>
          </section>
        </div>}
        secondary={hasSelection ? (
          <article key={expandedId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="space-y-3 p-4">
              <Button type="button" variant="ghost" size="sm" className="inquiry-compact-only h-8 px-2 text-xs" onClick={() => setExpandedId(null)}>
                <ArrowRight className="mr-1.5 h-3.5 w-3.5 rotate-180" />이력 목록으로
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="outline">{selectedDesign ? (STATUS_META[selectedDesign.status] ?? STATUS_META.saved).label : 'AI 종합 분석'}</Badge>
                {formatDate(selectedDesign?.created_at ?? selectedRec?.generated_at ?? selectedRec?.prepared_at)}
              </div>
              <h2 ref={detailHeadingRef} tabIndex={-1} className="text-lg font-semibold leading-7 text-slate-900 focus:outline-none">{selectedDesign?.title ?? `AI 종합 분석 · 추천 ${selectedRec?.recommendations?.length ?? 0}건`}</h2>
              {selectedDesign && <p className="text-sm text-slate-500">{selectedDesign.target_name} · {selectedDesign.grade}학년</p>}
            </div>
            {selectedDesign ? renderDesignDetail(selectedDesign) : selectedRec ? renderRecDetail(selectedRec) : null}
          </article>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <Clock className="mx-auto mb-3 h-7 w-7 text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900">확인할 이력을 선택하세요</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">목록의 위치를 유지하면서 상세 내용을 읽고,<br />설계 이어가기와 실행·성찰을 진행할 수 있어요.</p>
          </div>
        )}
      />
    </aside>
  );
}
