import { useMemo, type ReactNode } from 'react';
import { Check, ChevronDown, GitBranch, Loader2, MessageSquare, Save, Sparkles, Sun, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PanelColumns } from './PanelColumns';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PANEL_WIDTH_CLASS, type PanelWidthMode } from './panelWidth';
import { AiProviderToggle } from './AiProviderToggle';
import {
  CurriculumSubjectCombobox,
  synthesizeTargetFromCurriculum,
} from './CurriculumSubjectCombobox';
import { AchievementLinkCard } from './AchievementLinkCard';
import { InquiryConversationBox } from './InquiryConversationBox';
import { LlmQuotaBadge } from './LlmQuotaBadge';
import { INQUIRY_CONTEXT_BUDGET } from '../services/inquiryDesignService';
import type { InquiryConversationMessage } from '../services/inquiryDesignService';
import {
  AUTO_LABEL,
  AUTO_RELATION_HINT,
  optionsForType,
  relationLabel,
} from '../utils/relationHints';
import type { AchievementLinkRecord } from '../utils/achievementStandards';
import { planStepTitle } from '../utils/planSteps';
import type {
  InquiryAiProvider,
  InquiryAnalysisResponse,
  InquiryAnalysisResult,
  InquiryQuota,
  InquiryTarget,
  InquiryWorkspace,
  KgEntityRow,
} from '../types';

function targetKindLabel(kind: string) {
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

interface InquirySidePanelProps {
  workspace: InquiryWorkspace;
  target: InquiryTarget | null;
  isOpen?: boolean;
  // Student-facing mode (useAuth().isStudentView): softens jargon, promotes
  // the conversational path as the primary CTA, and uses first-person copy.
  // The tool's core premise is that the STUDENT designs their own activity.
  studentMode?: boolean;
  // Upfront quota (fetched on page load) shown before the first analyze call;
  // superseded by the fresher analysisMeta.quota once an analysis returns.
  fallbackQuota?: InquiryQuota | null;
  /** 선택한 교과의 성취기준 맥락(없으면 null). 목차 조회는 페이지가 맡는다. */
  /** 패널 폭 단계. 1단(기본) / 2단(넓게) — 페이지가 손잡이에서 정한다. */
  widthMode?: PanelWidthMode;
  achievementContext: { id: string; title: string } | null;
  /**
   * 성취기준 **목차 조회**의 상태. `achievementContext`가 null인 이유를 가르기 위해 필요하다 —
   * 아직 불러오는 중인지, 조회가 실패했는지, 이 과목에 정말 등록된 게 없는지는 서로 다른
   * 사정인데 종전엔 셋 다 "이 과목은 등록된 성취기준이 없습니다" 한 줄로 보였다.
   */
  achievementIndexStatus: 'loading' | 'error' | 'ready';
  onRetryAchievementIndex: () => void;
  /**
   * 짚어 낸 성취기준 연결을 설계 행에 남긴다 (2026-09-18). 주지 않으면 이번 화면에서만
   * 보인다 — 아직 저장되지 않은 설계(막 나온 결과)가 그 경우다.
   */
  onPersistAchievementLinks?: (record: AchievementLinkRecord) => void | Promise<void>;
  useAchievementContext: boolean;
  onUseAchievementContextChange: (next: boolean) => void;
  aiProvider: InquiryAiProvider;
  onTargetChange: (target: InquiryTarget) => void;
  onAiProviderChange: (provider: InquiryAiProvider) => void;
  selectedNodeIds: Set<string>;
  selectedActivityIds: Set<string>;
  relationHints: Map<string, string>;
  onSetRelationHint: (entityId: string, verb: string | null) => void;
  onToggleNode: (entityId: string) => void;
  onToggleActivity: (activityId: string) => void;
  analysis: InquiryAnalysisResult | null;
  analysisMeta: InquiryAnalysisResponse | null;
  userRequirements: string;
  onUserRequirementsChange: (value: string) => void;
  rationale: string;
  onRationaleChange: (value: string) => void;
  analyzing: boolean;
  /**
   * 서버 작업 큐에 아직 끝나지 않은 설계 의뢰가 있는가 (2026-09-18).
   * 설계는 이제 접수만 하고 끝나므로 `analyzing`(=접수 중)만으로는 버튼을 잠글 수 없다 —
   * 접수가 끝난 **뒤**에도 진행 중이고, 그때 또 누르면 서버가 같은 작업을 돌려줘
   * "눌렀는데 아무 일도 안 일어남"이 된다.
   */
  generationActive: boolean;
  /** 의뢰 현황 카드. 데이터는 페이지가 갖고 패널은 자리만 내준다. */
  generationSlot?: ReactNode;
  saving: boolean;
  onAnalyze: () => void;
  onSave: () => void;
  // 저장(또는 제안) 전에 이 분석 결과를 쓰지 않기로 하는 폐기 액션.
  // 화면만 비우며 자동 저장된 임시 분석은 이력에 보존된다(삭제는 이력에서).
  onDiscardAnalysis: () => void;
  // Conversation flow (대화로 설계하기). All state lives in the parent so the
  // page-level hook can persist messages across panel collapses and merge
  // results back into userRequirements.
  conversationActive: boolean;
  conversationMessages: InquiryConversationMessage[];
  conversationAssistantTurns: number;
  conversationSuggestEnd: boolean;
  conversationSending: boolean;
  onStartConversation: () => void;
  onSendConversationMessage: (userMessage: string) => void;
  onCancelConversation: () => void;
  onFinishConversation: () => void;
}

export function InquirySidePanel({
  workspace,
  target,
  isOpen = true,
  studentMode = false,
  fallbackQuota = null,
  widthMode = 'compact',
  achievementContext,
  onPersistAchievementLinks,
  achievementIndexStatus,
  onRetryAchievementIndex,
  useAchievementContext,
  onUseAchievementContextChange,
  aiProvider,
  onTargetChange,
  onAiProviderChange,
  selectedNodeIds,
  selectedActivityIds,
  relationHints,
  onSetRelationHint,
  onToggleNode,
  onToggleActivity,
  analysis,
  analysisMeta,
  userRequirements,
  onUserRequirementsChange,
  rationale,
  onRationaleChange,
  analyzing,
  generationActive,
  generationSlot,
  saving,
  onAnalyze,
  onSave,
  onDiscardAnalysis,
  conversationActive,
  conversationMessages,
  conversationAssistantTurns,
  conversationSuggestEnd,
  conversationSending,
  onStartConversation,
  onSendConversationMessage,
  onCancelConversation,
  onFinishConversation,
}: InquirySidePanelProps) {
  const selectedCount = selectedNodeIds.size + selectedActivityIds.size;
  const rationaleReady = rationale.trim().length >= 30;

  const entityById = useMemo(
    () => new Map(workspace.kgEntities.map((e) => [e.entity_id, e])),
    [workspace.kgEntities]
  );

  return (
    <aside
      aria-label="탐구 설계"
      className={`inquiry-panel absolute right-4 top-4 z-40 flex h-[calc(100%-2rem)] ${PANEL_WIDTH_CLASS[widthMode]} max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
        isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-[calc(100%+1rem)]'
      }`}
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">탐구 설계</h1>
            <p className="mt-1 text-xs text-slate-500">
              {workspace.student?.name ?? workspace.student?.id ?? '학생'} ·{' '}
              {studentMode
                ? `내 활동 지도 v${workspace.kgVersion?.version ?? '-'}`
                : `최신 KG v${workspace.kgVersion?.version ?? '-'}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <AiProviderToggle value={aiProvider} onChange={onAiProviderChange} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">기록에서 시작하는 새로운 탐구</span>
          <LlmQuotaBadge
            quota={analysisMeta?.quota ?? fallbackQuota}
            tokenUsage={studentMode ? undefined : analysisMeta?.tokenUsage}
          />
        </div>
        <ol aria-label="설계 진행 단계" className="mt-4 flex gap-2">
          {['활동 선택', '탐구 설계', '이유 · 저장'].map((label, index) => {
            const currentStep = analysis ? 2 : target ? 1 : 0;
            return (
              <li
                key={label}
                aria-current={index === currentStep ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-[11px] font-medium',
                  index === currentStep ? 'bg-brand-50 text-brand-700' : 'bg-slate-50 text-slate-500'
                )}
              >
                {index < currentStep ? <Check className="h-3.5 w-3.5 text-brand-600" /> : <span className="tabular-nums">0{index + 1}</span>}
                {label}
              </li>
            );
          })}
        </ol>
      </div>

      <PanelColumns
        widthMode={widthMode}
        primaryLabel="설계 조건 · 탐구 방향"
        secondaryLabel="설계 결과 · 나의 이유"
        primary={<>
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs text-brand-700">01</span>
              <h2>대상 활동</h2>
            </div>
            <p className="text-xs leading-5 text-slate-500">탐구를 진행할 과목을 선택하세요.</p>
            <CurriculumSubjectCombobox
              studentId={workspace.student?.id ?? null}
              value={target?.name ?? null}
              onSelect={(option) =>
                onTargetChange(synthesizeTargetFromCurriculum(option, workspace.student?.grade ?? null))
              }
            />
            {target && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge variant="outline">{targetKindLabel(target.kind)}</Badge>
                <span>
                  {target.academic_year} · {target.grade}학년
                  {target.semester ? ` ${target.semester}학기` : ''}
                </span>
                {Boolean((target.ref as { enrolled?: boolean } | undefined)?.enrolled) && (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">이수 이력 있음</Badge>
                )}
              </div>
            )}
            {/* 성취기준 맥락 (2026-09-12, **시험 단계**).
                맥락이 있는지 / 쓸지 / 안 쓸지를 한 줄로 말한다. 기본은 **끔** —
                켜고 끄며 결과를 견주어 보려는 것이 이 UI 의 목적이라,
                묻지 않고 동작을 바꾸면 비교할 기준선이 사라진다. */}
            {target?.kind === 'subject' && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-700">성취기준 맥락</div>
                  {/* 네 상태를 **각각 다르게** 말한다. 종전엔 조회 실패·로딩·진짜 없음이
                      모두 "등록된 성취기준이 없습니다" 하나로 보여서, 학생 시점에서 RLS에
                      막혀 0행이 오던 2026-09-14 장애를 화면이 전혀 드러내지 못했다. */}
                  <div className="truncate text-[10px] leading-tight text-slate-500">
                    {achievementIndexStatus === 'loading'
                      ? '성취기준 목록을 불러오는 중…'
                      : achievementIndexStatus === 'error'
                        ? '성취기준 목록을 불러오지 못했어요'
                        : achievementContext
                          ? '교육과정 이해를 돕는 참고로만 씁니다 (탐구를 이 안에 가두지 않아요)'
                          : '이 과목은 등록된 성취기준이 없습니다'}
                  </div>
                </div>
                {achievementIndexStatus === 'error' ? (
                  <button
                    type="button"
                    onClick={onRetryAchievementIndex}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    다시 시도
                  </button>
                ) : (
                  <select
                    aria-label="과목의 성취기준 맥락"
                    disabled={!achievementContext || analyzing || !!analysis || conversationActive}
                    value={useAchievementContext && achievementContext ? 'on' : 'off'}
                    onChange={e => onUseAchievementContextChange(e.target.value === 'on')}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 disabled:opacity-50"
                  >
                    <option value="off">사용 안 함</option>
                    <option value="on">사용 · 성취기준 참고</option>
                  </select>
                )}
              </div>
            )}
          </section>


          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <GitBranch className="h-4 w-4 text-brand-600" />
                <h2>탐구 연결</h2>
                <span className="text-xs font-normal text-slate-400">선택</span>
              </div>
              <Badge variant={selectedCount > 0 ? 'default' : 'outline'}>{selectedCount}개 선택</Badge>
            </div>
            <div className="text-xs leading-5 text-slate-500">
              {studentMode ? (
                <>
                  지도에서 내 기록 조각을 눌러 탐구의 출발점을 골라보세요. 선을 누르면 연결 관계를 확인할 수 있어요.
                </>
              ) : (
                <>
                  그래프의 노드를 눌러 탐구 근거로 추가하세요. 연결선은 상세 정보 확인용이며 분석에 포함되지 않습니다.
                </>
              )}
            </div>

            {selectedCount === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center">
                <p className="text-xs font-medium text-slate-600">새로운 주제로 시작해도 좋아요</p>
                <p className="mt-1 text-xs text-slate-500">선택 항목 없이도 분석할 수 있습니다.</p>
              </div>
            )}

            {selectedNodeIds.size > 0 && (
              <div>
                <div className="mb-2 space-y-1 text-xs font-medium text-slate-500">
                  <span>노드 ({selectedNodeIds.size})</span>
                  <span className="block text-[11px] font-normal text-slate-500">
                    관계 메뉴에서 새 활동과의 연결 방식을 정할 수 있어요.
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {Array.from(selectedNodeIds).map((nodeId) => (
                    <NodeChipWithRelation
                      key={nodeId}
                      entity={entityById.get(nodeId) ?? null}
                      entityId={nodeId}
                      hint={relationHints.get(nodeId) ?? null}
                      onToggle={onToggleNode}
                      onSetHint={onSetRelationHint}
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedActivityIds.size > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  활동 ({selectedActivityIds.size})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedActivityIds).map((activityId) => (
                    <button
                      key={activityId}
                      type="button"
                      onClick={() => onToggleActivity(activityId)}
                      className="group flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <span className="max-w-[160px] truncate">활동 {activityId.slice(0, 6)}</span>
                      <X className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs text-brand-700">02</span>
                <label htmlFor="inquiry-direction">탐구 방향</label>
                <span className="text-xs font-normal text-slate-400">선택</span>
              </div>
              <div className={cn(
                'font-mono text-[11px] tabular-nums',
                userRequirements.length > INQUIRY_CONTEXT_BUDGET * 0.9 ? 'text-amber-600' : 'text-slate-400'
              )}>
                {userRequirements.length}/{INQUIRY_CONTEXT_BUDGET}
              </div>
            </div>
            <Textarea
              id="inquiry-direction"
              aria-describedby="inquiry-direction-help"
              value={userRequirements}
              onChange={(event) => onUserRequirementsChange(event.target.value.slice(0, INQUIRY_CONTEXT_BUDGET))}
              // 예시에 **지금 진행 중인 수행평가**를 넣는다 (2026-09-12 사용자 요청).
              // 이 칸에 가장 쓸모 있는 정보가 그것인데, 예시가 "활동 성격"만 보여 주면
              // 사람들은 그 범주 안에서만 쓴다 — 예시가 곧 그 칸의 범위를 정한다.
              placeholder="예: 이번 학기 수행평가가 «탐구 보고서 작성»이라 그 주제로 이어지면 좋겠음, «실험 설계·결과 해석» 수행평가 준비 중, 실험 위주로 구성, 의료 AI 응용 사례 포함, 데이터 수집·시각화 단계 명확히…"
              className="min-h-28 resize-y rounded-lg border-slate-200 bg-slate-50/60 text-sm leading-6 placeholder:text-slate-400 focus-visible:bg-white"
            />
            <p id="inquiry-direction-help" className="text-xs leading-5 text-slate-500">
              관심 주제나 해보고 싶은 방법을 적어주세요. 대화로 정한 방향도 여기에 자동으로 채워집니다.
            </p>
            {/* Students design for themselves — the conversational coach comes
                first so articulating direction in their own words is the
                default path. Teachers keep direct-analyze as the primary CTA. */}
            <div className={cn('flex flex-col gap-2 pt-1 min-[400px]:flex-row', studentMode && 'flex-col-reverse min-[400px]:flex-row-reverse')}>
              <Button
                type="button"
                variant={studentMode ? 'outline' : 'default'}
                className="h-10 flex-1 rounded-lg px-3 text-xs"
                disabled={!target || analyzing || generationActive || conversationActive}
                onClick={onAnalyze}
              >
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {generationActive ? '설계 진행 중' : studentMode ? '바로 설계하기' : '설계하기'}
              </Button>
              <Button
                type="button"
                variant={studentMode ? 'default' : 'outline'}
                className="h-10 flex-1 rounded-lg px-3 text-xs"
                disabled={!target || analyzing || generationActive || conversationActive}
                onClick={onStartConversation}
                title="짧은 대화를 통해 추가 컨텍스트와 방향성을 결정한 뒤 설계를 시작합니다"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                대화로 설계하기
              </Button>
            </div>
            {!target && <p className="text-center text-xs text-slate-500">대상 활동을 선택하면 설계를 시작할 수 있어요.</p>}
            {analyzing && (
              <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-700">
                설계 의뢰를 접수하고 있어요.
              </p>
            )}
            {generationSlot}
            {conversationActive && (
              <InquiryConversationBox
                messages={conversationMessages}
                assistantTurnCount={conversationAssistantTurns}
                suggestEnd={conversationSuggestEnd}
                sending={conversationSending}
                onSend={onSendConversationMessage}
                onCancel={onCancelConversation}
                onFinish={onFinishConversation}
              />
            )}
          </section>
        </>}
        secondary={<>
          {!analysis && (
            <div className="inquiry-wide-only rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <Sparkles className="mx-auto mb-3 h-7 w-7 text-brand-500" />
              <h3 className="text-base font-semibold text-slate-900">탐구 설계가 이곳에 나타나요</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">왼쪽에서 과목과 방향을 정하고 설계를 시작하세요.<br />완성된 계획을 확인하면서 나의 이유를 적을 수 있어요.</p>
            </div>
          )}
          {analysis && (
            <section aria-label="탐구 설계 결과" className="space-y-5 overflow-hidden rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
              <div>
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-brand-700"><Sparkles className="h-3.5 w-3.5" />탐구 설계 결과</div>
                <h2 className="break-words text-base font-semibold leading-6 tracking-tight text-slate-950">{analysis.title}</h2>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{analysis.summary}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700">탐구 질문</div>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {analysis.inquiry_questions.map((question, index) => (
                    <li key={question} className="flex gap-2 rounded-lg bg-brand-50/60 p-3 leading-6">
                      <span className="shrink-0 text-xs font-semibold leading-6 text-brand-600">Q{index + 1}</span>
                      <span className="min-w-0 break-words">{question}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700">실행 단계</div>
                <ol className="mt-3 space-y-4">
                  {analysis.plan_steps.map((step, index) => (
                    <li key={step.title} className="flex gap-3 text-xs leading-5 text-slate-600">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">{index + 1}</span>
                      <div className="min-w-0 flex-1 break-words">
                        {/* 동그라미 번호를 이미 그렸으므로 제목의 `1.` 은 지운다 — 규칙은 planSteps.ts. */}
                        <div className="text-sm font-medium text-slate-900">{planStepTitle(step.title, index)}</div>
                        <p className="mt-1">{step.method}</p>
                        <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2"><span className="mr-1.5 font-medium text-slate-700">기대 결과</span>{step.expected_evidence}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              {analysis.risk_flags.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-700">주의점</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {analysis.risk_flags.map((flag) => (
                      <Badge key={flag} variant="outline" className="border-amber-200 bg-amber-50 font-normal leading-5 text-amber-800">
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {/* 이 설계가 어느 성취기준에 닿는가 (2026-09-18). 본문 **뒤**에 둔다 —
                  설계를 읽고 난 다음에 보는 부가 정보이지, 탐구 질문보다 앞설 것이 아니다.
                  과목에 맞는 성취기준이 없으면 카드 자체가 그려지지 않는다
                  (그 이유는 위 «대상 활동»의 성취기준 맥락 줄이 이미 말하고 있다). */}
              <AchievementLinkCard
                design={analysis}
                context={achievementContext}
                onPersist={onPersistAchievementLinks}
              />
              <div className="flex justify-end border-t border-slate-200/70 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving || analyzing}
                  onClick={onDiscardAnalysis}
                  className="h-7 gap-1 text-[11px] text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                  title="이 분석 결과를 사용하지 않습니다. 자동 저장된 임시 분석은 분석 이력에 남습니다."
                >
                  <Trash2 className="h-3 w-3" />
                  이 설계 사용 안 함
                </Button>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs text-brand-700">03</span>
              <label htmlFor="inquiry-rationale">{studentMode ? '나의 탐구 이유' : '학생 자기 근거'}</label>
            </div>
            <Textarea
              id="inquiry-rationale"
              aria-describedby="inquiry-rationale-help"
              value={rationale}
              onChange={(event) => onRationaleChange(event.target.value)}
              placeholder={
                studentMode
                  ? '이 탐구가 내 기존 활동과 어떻게 이어지는지, 왜 직접 해보고 싶은지 내 말로 적어보세요'
                  : '왜 이 탐구가 나의 기존 활동과 연결되고, 실제로 수행할 가치가 있는지 직접 작성'
              }
              className="min-h-28 resize-y rounded-lg border-slate-200 bg-slate-50/60 text-sm leading-6 placeholder:text-slate-400 focus-visible:bg-white"
            />
            {/* 서버(라이브 RPC·테이블)는 rationale을 의도적으로 optional로 완화한
                상태다("Rationale is now optional" — 라이브 함수 주석). 30자는 순수
                권장이고, 학생 모드에서만 자기주도성 확보를 위해 "한 줄이라도"를
                소프트 게이트로 요구한다. 교사는 자유롭게 저장할 수 있다. */}
            <div id="inquiry-rationale-help" className={`text-xs ${rationaleReady ? 'text-emerald-700' : 'text-slate-500'}`}>
              {rationale.trim().length}자 <span className="text-slate-400">(권장 30자 이상)</span>
            </div>
            {studentMode && analysis && rationale.trim().length === 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                왜 이 탐구를 하고 싶은지 한 줄이라도 적으면 저장할 수 있어요. 스스로 쓴 이유가 나중에 생기부의 근거가 됩니다.
              </p>
            )}
          </section>

          {/* 저장된 설계 목록은 "분석 이력" 탭(HistoryPanel)에서 확인합니다. */}
        </>}
      />
      <div className="inquiry-panel-footer shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-center text-xs leading-5 text-slate-500">
          {!analysis ? '설계 결과를 확인한 뒤 저장할 수 있어요.' : studentMode ? '내가 쓴 이유와 함께 탐구 설계를 저장해요.' : '저장한 제안은 학생이 확인하고 수락할 수 있어요.'}
        </p>
        <Button
          type="button"
          className="h-11 w-full rounded-lg font-semibold shadow-sm"
          disabled={
            !analysis ||
            !target ||
            saving ||
            (studentMode && rationale.trim().length === 0)
          }
          onClick={onSave}
          title={
            studentMode
              ? undefined
              : "교사 저장은 '선생님 제안'으로 기록되며, 학생이 자기 근거를 쓰고 수락하면 정식 설계가 됩니다"
          }
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {studentMode ? '설계 저장' : '학생에게 제안 저장'}
        </Button>
      </div>
    </aside>
  );
}

interface NodeChipWithRelationProps {
  entity: KgEntityRow | null;
  entityId: string;
  hint: string | null;
  onToggle: (entityId: string) => void;
  onSetHint: (entityId: string, verb: string | null) => void;
}

// One chip per selected entity, split into two interactive surfaces:
//   [ TYPE · label · × ]   [ 관계: 자동 ▾ ]
// The left half removes the chip; the right half opens a DropdownMenu with
// relation verb options filtered by the entity's type. AUTO = no hint, LLM
// decides. The dropdown labels mirror the verb's natural Korean phrasing so
// users don't have to learn the schema enum names.
function NodeChipWithRelation({ entity, entityId, hint, onToggle, onSetHint }: NodeChipWithRelationProps) {
  const label = entity?.label ?? entityId;
  const type = entity?.type ?? '?';
  const options = optionsForType(type);
  const currentValue = hint ?? AUTO_RELATION_HINT;
  const currentLabel = relationLabel(currentValue as Parameters<typeof relationLabel>[0], type);
  const hasHint = hint !== null && hint !== undefined;

  return (
    <div
      className={cn(
        'flex w-full items-stretch overflow-hidden rounded-md border text-[11px] transition-colors duration-200',
        'border-brand-200 bg-brand-50 text-brand-900'
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(entityId)}
        className="group flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 hover:bg-rose-50 hover:text-rose-700"
        title={`${type} · ${label} (클릭하여 제거)`}
      >
        <span className="font-mono text-[9px] uppercase opacity-60 group-hover:opacity-80">
          {type}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <X className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex shrink-0 items-center gap-1 border-l border-brand-200 px-2 py-1 transition-colors duration-200',
              hasHint
                ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                : 'bg-white/50 text-slate-600 hover:bg-white'
            )}
            title={hasHint ? `현재 관계: ${currentLabel}` : '관계 설정 (기본: 자동)'}
          >
            <span className="text-[10px] uppercase tracking-wide opacity-70">관계</span>
            <span className="font-medium">{currentLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[11px] font-normal text-slate-500">
            새 활동 ↔ {label}
            <div className="mt-0.5 font-medium text-slate-700">관계 verb 선택</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={currentValue}
            onValueChange={(value) => {
              if (value === AUTO_RELATION_HINT) onSetHint(entityId, null);
              else onSetHint(entityId, value);
            }}
          >
            <DropdownMenuRadioItem value={AUTO_RELATION_HINT} className="flex-col items-start gap-0.5">
              <div className="text-sm font-medium">{AUTO_LABEL}</div>
              <div className="text-[11px] text-slate-500">LLM이 가장 적합한 관계를 선택</div>
            </DropdownMenuRadioItem>
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.verb}
                value={option.verb}
                className="flex-col items-start gap-0.5"
              >
                <div className="text-sm font-medium">
                  {option.label}
                  <span className="ml-1.5 font-mono text-[10px] text-slate-400">{option.verb}</span>
                </div>
                <div className="text-[11px] text-slate-500">{option.description}</div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
