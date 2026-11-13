import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PanelColumns } from './PanelColumns';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { logAiError } from '@/services/aiErrorLog';
import { cn } from '@/lib/utils';
import { PANEL_WIDTH_CLASS, type PanelWidthMode } from './panelWidth';
import { AiProviderToggle } from './AiProviderToggle';
import {
  generateComprehensiveAnalysis,
  prepareComprehensiveAnalysis,
} from '../services/comprehensiveAnalysisService';
import { buildActivityDesignPrompt } from '../utils/activityDesignPrompt';
import type {
  ComprehensiveGenerateResponse,
  ComprehensivePrepareResponse,
  ComprehensiveRecommendation,
  InquiryAiProvider,
  InquiryWorkspace,
} from '../types';

type Phase = 'idle' | 'preparing' | 'curate' | 'generating' | 'results';

// Stored recommendations sometimes carry entity_ids in label slots (from an
// earlier prompt bug). Resolve id-looking strings back to their human label.
const ENTITY_ID_RE = /^[a-z]+_[a-z0-9]{6,}$/i;
function resolveLabelOrId(value: string, labelById: Map<string, string>): string {
  if (ENTITY_ID_RE.test(value)) {
    return labelById.get(value) ?? value;
  }
  return value;
}

interface ComprehensiveAnalysisPanelProps {
  workspace: InquiryWorkspace;
  isOpen: boolean;
  // Student-facing mode: first-person copy, model/token metadata hidden, and
  // the external-LLM prompt-copy action replaced by the in-app design bridge.
  studentMode?: boolean;
  // AI provider is lifted to the page so the design tab and this tab share one
  // setting instead of drifting apart.
  aiProvider: InquiryAiProvider;
  onAiProviderChange: (provider: InquiryAiProvider) => void;
  highlightedEntityIds: Set<string>;
  onHighlightEntities: (ids: string[]) => void;
  // Bridge: carry a recommendation into the design tab (target/anchor subject,
  // referenced entities as selected nodes, description as LLM context).
  onSeedDesign: (rec: ComprehensiveRecommendation) => void;
  /**
   * 이력에서 고른 **준비 단계 행**을 이어서 진행한다 (2026-09-12 사용자 요청).
   * 값이 바뀌면 그 행으로 `curate` 단계를 복원하고, 소비한 뒤 `onResumed()` 로 비운다 —
   * 안 비우면 사용자가 패널 안에서 되돌아가도 같은 행으로 계속 튕긴다.
   */
  /** 패널 폭 단계. 1단(기본) / 2단(넓게) — 페이지가 손잡이에서 정한다. */
  widthMode?: PanelWidthMode;
  resumeRecommendationId?: string | null;
  onResumed?: () => void;
}

export function ComprehensiveAnalysisPanel({
  workspace,
  isOpen,
  studentMode = false,
  aiProvider,
  onAiProviderChange,
  highlightedEntityIds,
  onHighlightEntities,
  onSeedDesign,
  widthMode = 'compact',
  resumeRecommendationId = null,
  onResumed,
}: ComprehensiveAnalysisPanelProps) {
  const { toast } = useToast();
  const studentId = workspace.student?.id;

  const [phase, setPhase] = useState<Phase>('idle');
  const [prepared, setPrepared] = useState<ComprehensivePrepareResponse | null>(null);
  const [generated, setGenerated] = useState<ComprehensiveGenerateResponse | null>(null);

  const [selectedDirectionIds, setSelectedDirectionIds] = useState<Set<string>>(new Set());
  const [selectedAnchorSubjects, setSelectedAnchorSubjects] = useState<Set<string>>(new Set());
  const [expandedDirectionId, setExpandedDirectionId] = useState<string | null>(null);
  const [analysisGuidance, setAnalysisGuidance] = useState('');
  const [userNotes, setUserNotes] = useState('');

  // Sync main-canvas highlight with the current selection set during curation.
  // When a direction is unchecked, its entities should drop out — highlights
  // become the union of selected directions' related entities.
  const onHighlightRef = useRef(onHighlightEntities);
  onHighlightRef.current = onHighlightEntities;
  useEffect(() => {
    if (phase !== 'curate' || !prepared) return;
    const set = new Set<string>();
    for (const d of prepared.directions) {
      if (selectedDirectionIds.has(d.id)) {
        for (const id of d.related_entity_ids) set.add(id);
      }
    }
    onHighlightRef.current(Array.from(set));
  }, [phase, prepared, selectedDirectionIds]);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of workspace.kgEntities) m.set(e.entity_id, e.label);
    return m;
  }, [workspace.kgEntities]);

  /**
   * 저장된 준비 단계 행 → `curate` 단계 복원.
   *
   * **서버를 다시 부르지 않는다.** 그 행은 이미 워크스페이스에 실려 있고, 다시 준비하면
   * LLM 을 또 쓰면서 방향 목록이 달라진다(그러면 "이어서"가 아니라 "다시"다).
   * 복원할 수 없는 필드(위생 후보·검증 리포트)는 표시 전용이라 비워 둔다 —
   * 없는 값을 지어내는 것보다 그 구획이 안 보이는 편이 낫다.
   */
  const onResumedRef = useRef(onResumed);
  onResumedRef.current = onResumed;
  useEffect(() => {
    if (!resumeRecommendationId) return;
    const row = workspace.comprehensiveRecommendations.find((r) => r.id === resumeRecommendationId);
    onResumedRef.current?.();
    if (!row) {
      toast({ title: '이력을 찾을 수 없습니다', description: '목록을 새로 고친 뒤 다시 시도해 주세요.', variant: 'destructive' });
      return;
    }

    const directions = row.weaknesses ?? [];
    setPrepared({
      recommendationId: row.id,
      studentId: row.student_id,
      kgVersionId: row.kg_version_id,
      currentGrade: row.current_grade,
      metrics: row.metrics as unknown as ComprehensivePrepareResponse['metrics'],
      directions,
      directionTokenUsage: null,
      directionModel: row.ai_model ?? null,
      hygieneFindings: (row.hygiene_findings ?? {}) as unknown as ComprehensivePrepareResponse['hygieneFindings'],
      hygieneCandidates: {} as unknown as ComprehensivePrepareResponse['hygieneCandidates'],
      verifierReport: null,
      enrolledSubjects: row.enrolled_subjects ?? [],
      formulaVersion: row.formula_version,
      embeddingsGenerated: 0,
    } as ComprehensivePrepareResponse);
    setGenerated(null);

    // 그때 골라 둔 것이 있으면 그대로 되살린다. 없으면 처음 준비했을 때와 같은 기본값(상위 3개).
    const savedIds = row.selected_weakness_ids ?? [];
    const picked = savedIds.length > 0 ? savedIds : directions.slice(0, 3).map((d) => d.id);
    setSelectedDirectionIds(new Set(picked));
    const savedAnchors = row.selected_anchor_subjects ?? [];
    if (savedAnchors.length > 0) {
      setSelectedAnchorSubjects(new Set(savedAnchors));
    } else {
      const defaults = new Set<string>();
      for (const d of directions) {
        if (!picked.includes(d.id)) continue;
        for (const a of d.suggested_anchor_subjects) defaults.add(a);
      }
      setSelectedAnchorSubjects(defaults);
    }
    setUserNotes(row.user_notes ?? '');
    setPhase('curate');
  }, [resumeRecommendationId, workspace.comprehensiveRecommendations, toast]);

  // Anchor subject candidates collected from selected directions' suggested anchors.
  const anchorPool = useMemo(() => {
    if (!prepared) return [] as string[];
    const set = new Set<string>();
    for (const d of prepared.directions) {
      if (!selectedDirectionIds.has(d.id)) continue;
      for (const a of d.suggested_anchor_subjects) set.add(a);
    }
    // Always include all enrolled subjects so the teacher can pick beyond the
    // suggested anchors if they want.
    for (const e of prepared.enrolledSubjects) set.add(e.subject_name);
    return Array.from(set).sort();
  }, [prepared, selectedDirectionIds]);

  const runPrepare = async () => {
    if (!studentId) {
      toast({ title: '학생 정보 없음', variant: 'destructive' });
      return;
    }
    setPhase('preparing');
    try {
      const result = await prepareComprehensiveAnalysis({
        studentId,
        userGuidance: analysisGuidance.trim() || undefined,
        aiProvider,
      });
      setPrepared(result);
      setGenerated(null);
      // Default selection: top 3 by priority, with their suggested anchor subjects checked.
      const top3 = result.directions.slice(0, 3).map((d) => d.id);
      setSelectedDirectionIds(new Set(top3));
      const defaultAnchors = new Set<string>();
      for (const d of result.directions.slice(0, 3)) {
        for (const a of d.suggested_anchor_subjects) defaultAnchors.add(a);
      }
      setSelectedAnchorSubjects(defaultAnchors);
      setExpandedDirectionId(null);
      setPhase('curate');
      toast({
        title: 'AI 분석 완료',
        description: `보완 방향 ${result.directions.length}개 · 그래프 보정 ${result.hygieneFindings.missing_edges.length}건 적용`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 실패를 표에 남긴다 — 이 경로는 오늘 두 번(uuid 캐스트·Solar 예산 소진)
      // 화면에서 원인을 볼 수 없는 채로 죽었다. 프롬프트는 담지 않는다.
      void logAiError({
        feature: 'inquiry-design',
        action: 'comprehensive.prepare',
        provider: aiProvider,
        studentId: studentId ?? null,
        error: err,
        // 상태 코드를 함께 남긴다 — 500(서버가 이유를 담아 반환)과 504(게이트웨이가
        // 시간 초과로 끊음)는 다음 행동이 다른데, 메시지만으로는 갈리지 않는다.
        detail: { httpStatus: (err as { context?: { status?: number } })?.context?.status ?? null },
      });
      toast({ title: '준비 실패', description: msg, variant: 'destructive' });
      setPhase('idle');
    }
  };

  const runGenerate = async () => {
    if (!prepared) return;
    if (selectedDirectionIds.size === 0) {
      toast({ title: '보완 방향 1개 이상 선택', variant: 'destructive' });
      return;
    }
    if (selectedAnchorSubjects.size === 0) {
      toast({ title: 'anchor 과목 1개 이상 선택', variant: 'destructive' });
      return;
    }
    setPhase('generating');
    try {
      const result = await generateComprehensiveAnalysis({
        recommendationId: prepared.recommendationId,
        // Wire param name preserved; carries direction IDs in v2.
        selectedWeaknessIds: Array.from(selectedDirectionIds),
        selectedAnchorSubjects: Array.from(selectedAnchorSubjects),
        userNotes,
        aiProvider,
      });
      setGenerated(result);
      setPhase('results');
      toast({
        title: '추천 완료',
        description: `활동 ${result.recommendations.length}개 · ${result.aiModel} · ${result.tokenUsage?.total_tokens ?? 0}토큰`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 실패를 표에 남긴다 — 이 경로는 오늘 두 번(uuid 캐스트·Solar 예산 소진)
      // 화면에서 원인을 볼 수 없는 채로 죽었다. 프롬프트는 담지 않는다.
      void logAiError({
        feature: 'inquiry-design',
        action: 'comprehensive.generate',
        provider: aiProvider,
        studentId: studentId ?? null,
        error: err,
        // 상태 코드를 함께 남긴다 — 500(서버가 이유를 담아 반환)과 504(게이트웨이가
        // 시간 초과로 끊음)는 다음 행동이 다른데, 메시지만으로는 갈리지 않는다.
        detail: { httpStatus: (err as { context?: { status?: number } })?.context?.status ?? null },
      });
      toast({ title: 'LLM 생성 실패', description: msg, variant: 'destructive' });
      setPhase('curate');
    }
  };

  const toggleDirection = (id: string) => {
    setSelectedDirectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedDirectionId((cur) => (cur === id ? null : id));
  };

  const toggleAnchor = (subject: string) => {
    setSelectedAnchorSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const handleRecommendationClick = (rec: ComprehensiveRecommendation) => {
    onHighlightEntities(rec.referenced_entity_ids);
  };

  const handleCopyDesignPrompt = async (rec: ComprehensiveRecommendation) => {
    const prompt = buildActivityDesignPrompt(rec, labelById);
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

  const currentStep = phase === 'results' ? 2 : phase === 'curate' || phase === 'generating' ? 1 : 0;

  return (
    <aside
      aria-label="AI 종합 보완 분석"
      className={cn(
        'inquiry-panel absolute right-4 top-4 z-40 flex h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl transition-transform duration-300 ease-in-out motion-reduce:transition-none',
        PANEL_WIDTH_CLASS[widthMode],
        isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-[calc(100%+1rem)]'
      )}
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">
              AI 종합 보완 분석
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {workspace.student?.name ?? workspace.student?.id ?? '학생'} ·{' '}
              {studentMode
                ? `내 활동 지도 v${workspace.kgVersion?.version ?? '-'}`
                : `최신 KG v${workspace.kgVersion?.version ?? '-'}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* 탐구 설계와 **같은 자리·같은 부품**(2026-09-12 사용자 지시).
                종전엔 본문 중간의 드롭다운이라 두 화면에서 같은 선택을 다른 곳에서 했다. */}
            <AiProviderToggle
              value={aiProvider}
              onChange={onAiProviderChange}
              disabled={phase === 'preparing' || phase === 'generating'}
            />
            {prepared && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={runPrepare}
                disabled={phase === 'preparing' || phase === 'generating'}
                title="보완 방향을 처음부터 다시 분석"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', phase === 'preparing' && 'animate-spin')} />
                재분석
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">활동을 돌아보고 다음 탐구의 방향을 찾아요</p>
          {prepared?.quota && (
            <Badge variant={prepared.quota.remaining > 0 ? 'outline' : 'destructive'}>
              오늘 {prepared.quota.used}/{prepared.quota.limit}
            </Badge>
          )}
        </div>
        <ol aria-label="종합 분석 진행 단계" className="mt-4 flex gap-2">
          {['활동 분석', '방향 선택', '추천 확인'].map((label, index) => (
            <li
              key={label}
              aria-current={index === currentStep ? 'step' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-[11px] font-medium',
                index === currentStep ? 'bg-brand-50 text-brand-700' : 'bg-slate-50 text-slate-500'
              )}
            >
              {index < currentStep ? <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" /> : <span className="tabular-nums">0{index + 1}</span>}
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
          {phase === 'idle' && (
            <IdlePhase
              widthMode={widthMode}
              studentMode={studentMode}
              guidance={analysisGuidance}
              onGuidanceChange={setAnalysisGuidance}
              aiProvider={aiProvider}
              onProviderChange={onAiProviderChange}
            />
          )}

          {phase === 'preparing' && (
            <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-brand-200 bg-white px-5 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></span>
              <p className="text-sm font-semibold text-slate-900">활동 기록을 살펴보고 있어요</p>
              <p className="text-xs leading-5 text-slate-500">기록 사이의 연결을 확인하고 보완할 방향을 찾고 있습니다.</p>
            </div>
          )}

          {prepared && (phase === 'curate' || phase === 'generating') && (
            <CuratePhase
              widthMode={widthMode}
              studentMode={studentMode}
              prepared={prepared}
              selectedDirectionIds={selectedDirectionIds}
              selectedAnchorSubjects={selectedAnchorSubjects}
              expandedDirectionId={expandedDirectionId}
              anchorPool={anchorPool}
              userNotes={userNotes}
              aiProvider={aiProvider}
              generating={phase === 'generating'}
              onToggleDirection={toggleDirection}
              onToggleExpand={toggleExpand}
              onToggleAnchor={toggleAnchor}
              onNotesChange={setUserNotes}
              onProviderChange={onAiProviderChange}
              onHighlightEntities={onHighlightEntities}
              highlightedEntityIds={highlightedEntityIds}
            />
          )}

          {prepared && phase === 'results' && generated && (
            <ResultsPhase
              widthMode={widthMode}
              studentMode={studentMode}
              prepared={prepared}
              generated={generated}
              highlightedEntityIds={highlightedEntityIds}
              labelById={labelById}
              onHighlightEntities={onHighlightEntities}
              onRecommendationClick={handleRecommendationClick}
              onCopyDesignPrompt={handleCopyDesignPrompt}
              onSeedDesign={onSeedDesign}
            />
          )}
      </div>
      <div className="inquiry-panel-footer shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-center text-xs leading-5 text-slate-500" role="status">
          {phase === 'idle' || phase === 'preparing'
            ? '활동 기록을 바탕으로 보완 방향을 제안해요.'
            : phase === 'results'
              ? '마음에 드는 추천에서 탐구 설계를 시작하세요.'
              : `보완 방향 ${selectedDirectionIds.size}개 · 연결 과목 ${selectedAnchorSubjects.size}개 선택`}
        </p>
        {phase === 'idle' || phase === 'preparing' ? (
          <Button onClick={runPrepare} disabled={phase === 'preparing'} className="h-11 w-full gap-2 rounded-lg font-semibold shadow-sm">
            {phase === 'preparing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {phase === 'preparing' ? '활동 분석 중…' : '분석 시작'}
          </Button>
        ) : phase === 'results' ? (
          <Button variant="outline" onClick={() => setPhase('curate')} className="h-11 w-full gap-2 rounded-lg font-semibold">
            <ChevronRight className="h-4 w-4 rotate-180" />방향 다시 선택
          </Button>
        ) : (
          <Button onClick={runGenerate} disabled={phase === 'generating' || selectedDirectionIds.size === 0 || selectedAnchorSubjects.size === 0} className="h-11 w-full gap-2 rounded-lg font-semibold shadow-sm">
            {phase === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {phase === 'generating' ? '추천 생성 중…' : '선택한 방향으로 추천 받기'}
          </Button>
        )}
      </div>
    </aside>
  );
}

// 준비(보완 방향 분석)와 생성(추천) 두 단계 모두 같은 선택을 쓴다 — 설계 탭과도
// 공유하는 페이지 단일 상태라 탭을 옮겨도 고른 AI가 유지된다.
interface IdlePhaseProps {
  widthMode: PanelWidthMode;
  studentMode: boolean;
  guidance: string;
  onGuidanceChange: (value: string) => void;
  aiProvider: InquiryAiProvider;
  onProviderChange: (p: InquiryAiProvider) => void;
}

function IdlePhase({
  widthMode,
  studentMode,
  guidance,
  onGuidanceChange,
  aiProvider,
  onProviderChange,
}: IdlePhaseProps) {
  return (
    <PanelColumns widthMode={widthMode} primaryLabel="활동 돌아보기" secondaryLabel="분석 방향 설정" primary={<>
      <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Sparkles className="h-6 w-6 text-brand-500" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">다음 탐구의 가능성을 찾아보세요</h2>
        <p className="text-sm leading-6 text-slate-600">
          {studentMode
            ? '내 활동 지도를 분석해서 앞으로 보완하면 좋은 방향을 찾아드려요.'
            : '학생의 KG를 분석해서 보완 방향을 도출합니다.'}
        </p>
      </div>

      </>} secondary={<>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="comprehensive-guidance" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs text-brand-700">01</span>
          분석 방향 <span className="text-xs font-normal text-slate-400">선택</span>
        </label>
        <Textarea
          id="comprehensive-guidance"
          aria-describedby="comprehensive-guidance-help"
          value={guidance}
          onChange={(e) => onGuidanceChange(e.target.value)}
          placeholder={
            studentMode
              ? `예: 의대 진학이 목표예요 — 생명윤리·의료데이터 쪽을 강조하고 싶어요\n예: 지금까지의 AI 방향에서 약학·신약개발 쪽으로 바꿔보고 싶어요\n예: 활동 개수보다 지금 하는 활동의 깊이를 살리고 싶어요`
              : `예: 의대 진학 목표 — 생명윤리·의료데이터 관점 강조\n예: 기존의 AI 방향에서 약학·신약개발 쪽으로 피벗하고 싶음\n예: 비교과 분량은 줄이고 1·2학년 활동의 깊이를 살리는 방향`
          }
          className="min-h-32 resize-y rounded-lg border-slate-200 bg-slate-50/60 text-sm leading-6 placeholder:text-slate-400 focus-visible:bg-white"
        />
        <p id="comprehensive-guidance-help" className="text-xs leading-5 text-slate-500">
          {studentMode
            ? '적어준 내용은 분석 AI에게 그대로 전달돼요. 진로 목표나 원하는 방향을 자유롭게 쓰세요.'
            : '이 메모는 분석 LLM에 직접 전달됩니다. 진로·전형·심화 방향·금지사항 등 자유롭게 작성.'}
        </p>
      </div>


    </>} />
  );
}

interface CuratePhaseProps {
  widthMode: PanelWidthMode;
  studentMode: boolean;
  prepared: ComprehensivePrepareResponse;
  selectedDirectionIds: Set<string>;
  selectedAnchorSubjects: Set<string>;
  expandedDirectionId: string | null;
  anchorPool: string[];
  userNotes: string;
  aiProvider: InquiryAiProvider;
  generating: boolean;
  onToggleDirection: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleAnchor: (subject: string) => void;
  onNotesChange: (value: string) => void;
  onProviderChange: (p: InquiryAiProvider) => void;
  onHighlightEntities: (ids: string[]) => void;
  highlightedEntityIds: Set<string>;
}

function CuratePhase(props: CuratePhaseProps) {
  const { prepared } = props;
  const hygieneApplied = prepared.hygieneFindings.missing_edges.length + prepared.hygieneFindings.duplicate_clusters.length;

  return (
    <PanelColumns widthMode={props.widthMode} variant="review" primaryLabel="보완 방향 검토" secondaryLabel="추천 조건 설정" primary={<>
      {hygieneApplied > 0 && (
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          AI 보정 {hygieneApplied}건 적용 (누락 엣지 {prepared.hygieneFindings.missing_edges.length} · 중복 {prepared.hygieneFindings.duplicate_clusters.length})
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            보완 방향 선택 ({props.selectedDirectionIds.size}/{prepared.directions.length})
          </h3>
          {!props.studentMode && prepared.directionModel && (
            <span className="text-[10px] font-mono text-slate-400">{prepared.directionModel}</span>
          )}
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          보완하고 싶은 방향을 선택하세요. 제목을 누르면 자세한 분석을 볼 수 있어요.
        </p>
        <ul className="space-y-1.5">
          {prepared.directions.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs leading-5 text-slate-500">
              제안된 보완 방향이 없습니다. 재분석으로 다시 확인해 주세요.
            </li>
          )}
          {prepared.directions.map((d) => {
            const checked = props.selectedDirectionIds.has(d.id);
            const expanded = props.expandedDirectionId === d.id;
            return (
              <li
                key={d.id}
                className={cn(
                  'overflow-hidden rounded-lg border transition-colors duration-200',
                  checked ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <div className="flex gap-3 p-3">
                  <Checkbox
                    checked={checked}
                    aria-label={`${d.summary} 선택`}
                    disabled={props.generating}
                    className="mt-0.5"
                    onCheckedChange={() => props.onToggleDirection(d.id)}
                  />
                  <button
                    type="button"
                    onClick={() => props.onToggleExpand(d.id)}
                    className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
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
                        <span className="min-w-0 break-words leading-5">{d.summary}</span>
                      </div>
                      {d.suggested_anchor_subjects.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.suggested_anchor_subjects.slice(0, 4).map((s) => (
                            <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="mt-0.5 shrink-0 text-slate-400">
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                </div>
                {expanded && (
                  <div className="border-t border-slate-200 px-3 py-2.5 text-xs leading-6 text-slate-700">
                    <p className="whitespace-pre-wrap">{d.detail}</p>
                    {d.related_entity_ids.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onHighlightEntities(d.related_entity_ids);
                        }}
                        className="mt-2 text-[10px] text-brand-600 hover:underline"
                      >
                        관련 기록 {d.related_entity_ids.length}개 그래프에서 보기
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      </>} secondary={<>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">
          연결 과목 선택 ({props.selectedAnchorSubjects.size}/{props.anchorPool.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {props.anchorPool.length === 0 && (
            <p className="text-xs leading-5 text-slate-500">보완 방향을 선택하면 연결할 과목을 확인할 수 있어요.</p>
          )}
          {props.anchorPool.map((s) => {
            const checked = props.selectedAnchorSubjects.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => props.onToggleAnchor(s)}
                aria-pressed={checked}
                disabled={props.generating}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs disabled:opacity-60 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1',
                  checked
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="comprehensive-notes" className="text-sm font-semibold text-slate-900">
          {props.studentMode ? '내 메모 (선택)' : '교사 메모 (선택)'}
        </label>
        <Textarea
          id="comprehensive-notes"
          disabled={props.generating}
          value={props.userNotes}
          onChange={(e) => props.onNotesChange(e.target.value)}
          placeholder={
            props.studentMode
              ? '예: 면역 단원이 재미있었어요, 부담은 적었으면 좋겠어요'
              : '예: 면역 단원 강조, 분량 부담 없게 등'
          }
          className="min-h-24 resize-y rounded-lg border-slate-200 bg-slate-50/60 text-sm leading-6 placeholder:text-slate-400 focus-visible:bg-white"
        />
      </section>


    </>} />
  );
}

interface ResultsPhaseProps {
  widthMode: PanelWidthMode;
  studentMode: boolean;
  prepared: ComprehensivePrepareResponse;
  generated: ComprehensiveGenerateResponse;
  highlightedEntityIds: Set<string>;
  labelById: Map<string, string>;
  onHighlightEntities: (ids: string[]) => void;
  onRecommendationClick: (rec: ComprehensiveRecommendation) => void;
  onCopyDesignPrompt: (rec: ComprehensiveRecommendation) => void;
  onSeedDesign: (rec: ComprehensiveRecommendation) => void;
}

function ResultsPhase({
  widthMode,
  studentMode,
  prepared,
  generated,
  highlightedEntityIds,
  labelById,
  onHighlightEntities,
  onRecommendationClick,
  onCopyDesignPrompt,
  onSeedDesign,
}: ResultsPhaseProps) {
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const selected = generated.recommendations.find((rec) => rec.rank === selectedRank) ?? generated.recommendations[0];
  return (
    <PanelColumns widthMode={widthMode} primaryLabel="추천 활동 목록" secondaryLabel="선택한 추천 상세" primary={<>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            AI 추천 활동 ({generated.recommendations.length}개)
          </h3>
        </div>
        <p className="text-xs leading-5 text-slate-500">추천 제목을 누르면 관련 기록이 지도에 표시돼요.</p>
        {!studentMode && (
          <p className="text-[10px] text-slate-400">
            {generated.aiModel} · 토큰 {generated.tokenUsage?.total_tokens ?? 0}
            {generated.invalidEntityRefs?.length ? ` · ⚠ 무효 ref ${generated.invalidEntityRefs.length}` : ''}
          </p>
        )}
        <div className="inquiry-wide-only space-y-2">
          {generated.recommendations.map((rec) => (
            <button
              key={rec.rank}
              type="button"
              aria-pressed={selected?.rank === rec.rank}
              onClick={() => { setSelectedRank(rec.rank); onRecommendationClick(rec); }}
              className={cn('w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400', selected?.rank === rec.rank ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50')}
            >
              <span className="text-xs font-medium text-brand-700">추천 {rec.rank} · {rec.anchor_subject}</span>
              <span className="mt-2 block text-sm font-semibold leading-6 text-slate-900">{rec.title}</span>
              <span className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{rec.description}</span>
            </button>
          ))}
        </div>
      </section>
    </>} secondary={<>
        <ul className="space-y-2">
          {generated.recommendations.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm leading-6 text-slate-500">
              추천 활동이 없습니다. 방향을 다시 선택해 추천을 받아보세요.
            </li>
          )}
          {generated.recommendations.map((rec) => {
            const anchored = rec.referenced_entity_ids.some((id) => highlightedEntityIds.has(id));
            return (
              <li
                key={`${rec.rank}-${rec.title}`}
                data-active={selected?.rank === rec.rank}
                className={cn(
                  'inquiry-recommendation overflow-hidden rounded-xl border p-4 transition-colors duration-200',
                  anchored ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <div className="flex flex-wrap items-start gap-2">
                  <Badge className="h-5 px-1.5 text-[10px]">#{rec.rank}</Badge>
                  <button
                    type="button"
                    onClick={() => onRecommendationClick(rec)}
                    aria-label={`${rec.title} 관련 기록을 그래프에서 보기`}
                    className="min-w-0 flex-1 basis-3/4 break-words rounded text-left text-sm font-semibold leading-6 text-slate-900 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    {rec.title}
                  </button>
                  {!studentMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 gap-1 px-1.5 text-[10px] text-slate-500 hover:text-slate-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyDesignPrompt(rec);
                      }}
                      title="이 활동의 구체적 설계를 요청하는 LLM 프롬프트 복사 (외부 LLM용)"
                    >
                      <Clipboard className="h-3 w-3" />
                      설계 프롬프트
                    </Button>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{rec.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                  <span className="rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">{rec.anchor_subject}</span>
                  {rec.connected_thread_labels.map((t) => (
                    <span key={t} className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">
                      탐구 흐름: {resolveLabelOrId(t, labelById)}
                    </span>
                  ))}
                  {rec.connected_interest_labels.map((i) => (
                    <span key={i} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                      관심사: {resolveLabelOrId(i, labelById)}
                    </span>
                  ))}
                  {rec.strengthens_competencies.map((c) => (
                    <span key={c} className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                      ↑ {resolveLabelOrId(c, labelById)}
                    </span>
                  ))}
                </div>
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">{rec.rationale}</p>
                {/* 종합 분석(무엇이 부족한가) → 탐구 설계(그래서 무엇을 할까)를 잇는
                    브리지. 대상 과목·근거 노드·추천 내용이 설계 탭에 시드된다. */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4 h-auto min-h-10 w-full gap-2 whitespace-normal rounded-lg border-brand-300 py-2 text-xs text-brand-700 hover:bg-brand-50 hover:text-brand-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeedDesign(rec);
                  }}
                >
                  <ArrowRight className="h-3 w-3" />
                  이 추천으로 탐구 설계 시작
                </Button>
              </li>
            );
          })}
        </ul>
        {generated.invalidAnchors?.length ? (
          <div className="flex gap-1 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>
              이수 과목에 포함되지 않은 추천 과목: {generated.invalidAnchors.join(', ')}
            </span>
          </div>
        ) : null}
    </>} />
  );
}
