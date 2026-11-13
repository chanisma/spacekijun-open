// document.spec_fill@1 러너: 양식 → 스펙 검수(시각+목록 통합) → 계획 검토 → 최종 수정·결과.
// 양식을 불러온 뒤에는 모든 단계가 좌=rhwp 문서 / 우=단계 기능의 통일 레이아웃(리사이즈
// 스플리터)을 쓴다. 계획 검토의 값은 좌측 문서에 라이브 반영(LLM 없는 결정적 fill)되고,
// 최종 수정 단계에서는 rhwp 에디터로 값·서식을 직접 고쳐 다운로드할 수 있다(원본 양식
// 파일은 대체하지 않음). 모든 실행은 RUN/CHECK/ARTIFACT로 기록되고 needs_review로 끝난다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BookText, CheckCircle2, ChevronDown, ClipboardCheck, Download, Eraser, FileText, FileUp, Loader2, Lock, Pencil, Pin, Play, RotateCcw, Maximize2, Save, ShieldCheck, Sparkles, Trash2, Users, Wand2, XCircle } from 'lucide-react';
import JSZip from 'jszip';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { NamePreview } from '@/components/ui/name-list-overlay';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { useAuth } from '@/components/auth/AuthProvider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SpecOverlayView } from '@/components/rhwp/SpecOverlayView';
import { RhwpVisualEditor, type RhwpVisualEditorHandle } from '@/components/rhwp/RhwpVisualEditor';
import type { TaskAction, TaskActionCheckInput, TaskActionRunWithDetails } from '../types';
import { useFinalizeTaskActionRun, useStartTaskActionRun, useTaskActionRuns } from '../hooks/useTaskActions';
import { useSubmitTaskSpecSubmission } from '@/hooks/useTaskSpecSubmissions';
import { getDefaultTemplate, setTaskActionDefaultTemplate } from '../services/taskActionService';
import { ContextLibraryDialog } from '@/features/document-generation/components/ContextLibraryDialog';
import { composeContextText, type DocGenContext } from '@/features/document-generation/services/contextService';
import { useDocGenContexts, useSpecContextIds } from '@/features/document-generation/hooks/useDocGenContexts';
import { isUpstreamContextId, useUpstreamContexts } from '../context/UpstreamContexts';
import { SpecEditColumn, suggestSpecMeta } from './SpecEditColumn';
import { ActionRunHistory } from './ActionRunHistory';
import { designateFromHit, reassignTargetLocator } from './specDesignate';
import {
  blankPlanRow, buildSpecBundle, derivePlanSchema, describeMissingInput, detectSpecDraft,
  fillDocument, joinPersonNames, missingPlanInputs,
  logSpecFillIssue, normalizeSpecPlanKeys, parseHwpxSection, rowAddCapacity, splitPersonNames,
  DEFAULT_USE_REGION_EXAMPLES,
  type CheckResult, type Plan, type PlanFieldSchema, type SpecFillMode, type WorkSpec,
} from '../document/spec';
import type { HitResult } from '../document/spec/overlayMap';
import {
  emptyPlanFromSchema, generateSpecFillPlan, isEmptyPlanValue, proseValuesFromPlan,
  runSpecFillPipeline, specChatForWorkConfig, type SpecFillPlanResult,
} from '../services/specFillService';
import {
  archiveSpecTemplate, createSpecTemplate, downloadSpecTemplateSource, exportHwpxSections,
  getSpecTemplateById, type HwpxSectionSource, listSpecTemplates, loadHwpxSections,
  type SpecTemplateRow, updateTemplateSpec, uploadGeneratedSpecHwpx,
} from '../services/specTemplateService';
import {
  createSpecDocument, createSpecDocumentVersion, deleteSpecDocumentLineage,
  listSpecDocuments, type SpecDocumentRow,
} from '../services/specDocumentService';

type Step = 'template' | 'spec' | 'plan' | 'final';

/**
 * AI 초안 작성 1회분 기록 — 사용자가 **직접 작성한 것만** 담는다.
 * 조립된 LLM 프롬프트가 아니다(knowledge에 학생 데이터가 실릴 수 있어 기록에 복사하지 않는다).
 */
export interface AuthoringDraft {
  at: string;
  mode: SpecFillMode;
  /** 설명 입력란에 쓴 글 */
  note: string;
  /**
   * 그때 선택한 맥락(이번 실행 한정 수정본이 반영된 상태).
   *
   * **`id`와 `edited`가 반드시 있어야 한다** — 제목·본문만 담으면 이력을 불러올 때
   * 어떤 맥락을 골랐었는지 되살릴 수 없고(선택이 풀린 채로 열린다), 본문이 라이브러리와
   * 같은지 달랐는지도 몰라 "수정됨" 표시가 엉뚱해진다.
   */
  contexts: { id: string; title: string; body: string; edited: boolean }[];
}

/** 기록 상한 — 시도를 반복해도 스냅샷이 무한정 커지지 않게 최근 것만 남긴다 */
const AUTHORING_LOG_MAX = 10;

/** 최종 단계 이력 서랍 펼침 상태(사용자별 브라우저에만 남는 편의 값) */
const RUN_HISTORY_OPEN_KEY = 'spec-runner-history-open';

/**
 * 설명 입력 도움말. **예시를 여러 줄로 준다** — 한 줄짜리 예시는 "짧게 한마디"로 읽혀서
 * 실제로 한 줄만 적게 되는데, 이 입력의 분량이 곧 결과 품질이다.
 */
const PLAN_CONTEXT_PLACEHOLDER = [
  '예) 1학년 정보 수업에서 쓸 계획서입니다.',
  '예산은 150만 원이고 피지컬 컴퓨팅 중심으로 구성해 주세요.',
  '2학기 중간고사 이후 4주간 진행합니다.',
].join('\n');

export function SpecFillActionRunner({
  action, taskTitle, workflowId, onHistoryVisibleChange, resumeRun, onResumeConsumed, submission,
  initialFile, onInitialFileConsumed, initialDocumentId, onInitialDocumentConsumed, docGenHost,
}: {
  action: TaskAction;
  taskTitle: string;
  /** 워크플로 캔버스에서 실행할 때의 소속 흐름. **제출 모드에는 없다**(RUN 자체를 안 남긴다) */
  workflowId?: string | null;
  /** 실행·검수 이력 패널 표시 요청(양식·최종 단계에서만 true) — 호스트 다이얼로그가 제어 */
  onHistoryVisibleChange?: (visible: boolean) => void;
  /** 이력 서랍에서 "불러와서 진행"을 누른 RUN — 양식·계획을 복원해 계획 검토로 진입 */
  resumeRun?: TaskActionRunWithDetails | null;
  /**
   * **할 일 제출 모드**(2026-09-03). 담당자가 할 일 카드에서 열었을 때 주어진다.
   *
   * 있으면 러너가 "문서를 만드는 도구"가 아니라 "제출하는 창구"가 된다 —
   * 양식 잠금·계획 검토부터 시작·RUN 미기록·최종 주행동이 제출.
   */
  submission?: {
    taskId: string;
    /** 과제 단위 할 일면 어느 단위의 제출인지(파일 제출과 같은 자리) */
    unitKey: string | null;
    unitLabel?: string | null;
    /** 매니저가 적은 제출 안내 — 계획 검토 상단에 그대로 보여준다 */
    guide?: string;
    onSubmitted?: () => void;
    /**
     * 제출 확정을 호스트가 맡는다(2026-10-01 — 제출 받기 작업 `submit.document`).
     * 없으면 종전 할 일 제출 RPC(`submit_task_spec_submission`)를 쓴다.
     */
    submit?: (documentId: string) => Promise<void>;
  } | null;
  onResumeConsumed?: () => void;
  /**
   * 방금 만든 생성 방식에 첨부된 한글 양식(문서 생성 메뉴 전용).
   *
   * 있으면 마운트 직후 이 파일로 **스펙 검수부터** 시작한다 — "새 생성 방식을 만들면
   * 바로 이어서 문서를 만든다"는 흐름(2026-09-04)의 첫 걸음이다. 양식 단계를 거치게 하면
   * 방금 고른 파일을 한 번 더 고르게 된다.
   */
  initialFile?: File | null;
  onInitialFileConsumed?: () => void;
  /**
   * 페이지의 '완성 문서' 모달에서 고른 문서(문서 생성 메뉴 전용) — 그 값으로 복원해 이어 만든다.
   * **id 만 받는다** — 러너가 이미 자기 실행 의 문서 목록을 갖고 있어 행을 다시 넘길 이유가 없다.
   */
  initialDocumentId?: string | null;
  onInitialDocumentConsumed?: () => void;
  /**
   * **문서 생성 메뉴에서 열렸다**(2026-09-08). 흐름만 바꾼다 — 양식 단계를 건너뛰고
   * 계획 검토부터. 그 메뉴 목록에는 업무 관리에서 만들어진 실행 도 함께 서므로,
   * 판단 근거가 행의 `config.origin` 이면 같은 목록의 카드 절반만 다르게 열린다.
   */
  docGenHost?: boolean;
}) {
  const queryClient = useQueryClient();
  // isAdminUI가 아니라 isAdmin — 미리보기 모드와 무관하게 서버 쓰기 권한과 같은 판정
  const { user, isAdmin } = useAuth();
  const startRun = useStartTaskActionRun();
  const finalizeRun = useFinalizeTaskActionRun(action.id);
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['spec-templates'],
    queryFn: listSpecTemplates,
  });

  /**
   * 제출 모드(2026-09-03) — 담당자가 **할 일 제출**로 이 러너를 열었을 때.
   *
   * 달라지는 것: ①양식이 잠긴다(매니저가 정한 것) ②계획 검토부터 시작(스펙 검수는
   * 매니저 몫) ③**RUN 을 기록하지 않는다** ④최종 단계 주행동이 "제출".
   */
  const submissionMode = !!submission;
  const [step, setStep] = useState<Step>('template');
  const [selected, setSelected] = useState<SpecTemplateRow | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [source, setSource] = useState<HwpxSectionSource | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const loadSourceBlob = useCallback(
    () => (sourceBlob ? Promise.resolve(sourceBlob) : Promise.reject(new Error('원본이 없습니다.'))),
    [sourceBlob],
  );
  const [spec, setSpec] = useState<WorkSpec | null>(null);
  const [detectNotes, setDetectNotes] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * 계획 생성 진행(청크 i/n). 큰 양식은 한 호출이 엣지 함수 벽시간을 넘겨 504가 나므로
   * 여러 호출로 나눠 생성한다(수 분 소요) — 표시가 없으면 멈춘 것으로 보인다.
   */
  const [planProgress, setPlanProgress] = useState<{ done: number; total: number } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  /**
   * 이 실행가 쓸 LLM. **화면에 따라 갈리지 않는다**(2026-09-03부터 luna 단독) —
   * 종전의 `config.origin === 'docgen'` 분기가 실사용과 어긋나 워크플로 실행이 조용히
   * Solar 로 가서 504 를 냈다. 함수를 남겨 둔 이유는 specFillService 주석 참조.
   */
  const chat = useMemo(() => specChatForWorkConfig(action.config), [action.config]);
  // 좌측 문서와 우측 목록이 공유하는 선택 타깃(시각·스펙·계획 단계 공통)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [userContext, setUserContext] = useState('');
  /**
   * 작성 모드(2026-09-02) — 기본 `'strict'`. 학교 공문서라 지어낸 사실이 그대로 발송될 수
   * 있어 "자료에 있는 것만"이 기본이고, 사용자가 명시적으로 고를 때만 생성이 열린다.
   */
  const [fillMode, setFillMode] = useState<SpecFillMode>('strict');
  /**
   * 원본 문서의 그 자리 내용을 **표기 형식 참고용**으로 AI에 넘길지(기본 끔).
   *
   * 한때 항상 넘겼는데 그 **내용**이 결과에 새어 나오는 일이 반복돼 껐다. 다만 그 관찰의
   * 대부분이 **모델 라우팅이 어긋나 Solar로 가던 시기**의 것이라, 지금(luna 단독)은
   * 결과가 다를 수 있다 — 켜고 끄며 비교할 수 있게 화면에 둔다. 기본값·의미의 단일 출처는
   * `document/spec/specFillOptions.ts`.
   */
  const [useRegionExamples, setUseRegionExamples] = useState(DEFAULT_USE_REGION_EXAMPLES);
  /** 맥락 라이브러리 다이얼로그 — 스펙 검수·계획 검토 양쪽에서 연다(중첩 Dialog) */
  const [contextOpen, setContextOpen] = useState(false);
  /**
   * 이번 생성에 쓸 맥락 선택(복수) — **저장하지 않는다**. 실행마다 달라지는 값이라
   * 스펙·실행에 남기면 다음 사람이 남의 선택을 물려받는다. 양식에 연결된 맥락은
   * 아래에서 기본 선택으로 들어오고, 사용자가 여기서 빼거나 더할 수 있다.
   */
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  /** 맥락 본문 즉석 수정 — 이번 생성에만 반영하고 라이브러리 원본은 건드리지 않는다 */
  const [contextOverrides, setContextOverrides] = useState<Record<string, string>>({});
  /**
   * 앞 단계에서 넘어온 맥락(업무 진행 화면에서 열었을 때만, 2026-09-27) — **기본 포함**, 뺀 것만 기억한다.
   * 라이브러리 선택(`selectedContextIds`)과 섞지 않는다: 라이브러리 다이얼로그가 선택을 다시 만들 때
   * 라이브러리에 없는 id 가 조용히 빠질 수 있다(`UpstreamContexts.tsx` 주석).
   */
  const upstreamContexts = useUpstreamContexts();
  const [excludedUpstreamIds, setExcludedUpstreamIds] = useState<string[]>([]);
  /** 선택한 맥락 중 펼쳐서 고치는 중인 것(하나만) — 여러 개를 동시에 펴면 카드가 길어진다 */
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  /**
   * 이력에서 불러온 맥락(id·제목) — 그 중 라이브러리에서 **사라진 것**을 알리는 데만 쓴다.
   * 삭제된 맥락은 선택 목록에서 조용히 빠지는데, 그러면 그때와 다른 문서가 나온다.
   */
  const [resumedContexts, setResumedContexts] = useState<{ id: string; title: string }[]>([]);
  /**
   * AI 초안 작성 시도 기록 — **사용자가 쓴 것만**(설명 + 그때 고른 맥락).
   * 실행 시 RUN 스냅샷에 함께 저장돼 "어떤 설명으로 만든 문서인지"를 이력에서 볼 수 있다.
   */
  const [authoringLog, setAuthoringLog] = useState<AuthoringDraft[]>([]);
  /**
   * 설명 입력 예시 — 스펙이 가진 양식별 예시가 우선, 없으면 범용 기본.
   * 스펙이 비어 있다고 입력칸이 맨 얼굴이 되면 "무엇을 적어야 하는지"를 알 길이 없다.
   */
  const contextPlaceholder = spec?.contextExample?.trim() || PLAN_CONTEXT_PLACEHOLDER;
  const [planResult, setPlanResult] = useState<SpecFillPlanResult | null>(null);
  const [planJsonMode, setPlanJsonMode] = useState(false);
  const [planJsonText, setPlanJsonText] = useState('');

  const [runChecks, setRunChecks] = useState<CheckResult[] | null>(null);
  /**
   * 최종 단계의 실행·검수 이력 접힘(2026-09-02) — **기본 접힘**.
   *
   * 문서를 만들러 온 사람에게 검수 대기·RUN 이력은 지금 필요한 정보가 아니다. 다만 이력은
   * "이어서 진행"(`resumeFromRun`)의 유일한 진입점이라 지우면 안 되고, 자주 보는 사람이
   * 매번 펼치지 않도록 상태를 localStorage에 남긴다(계획 검토 접기와 같은 방식).
   */
  const [historyOpen, setHistoryOpen] = useState(
    () => localStorage.getItem(RUN_HISTORY_OPEN_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(RUN_HISTORY_OPEN_KEY, historyOpen ? '1' : '0');
  }, [historyOpen]);
  /**
   * 이력 건수 배지 — 같은 쿼리 키라 `ActionRunHistory`와 캐시를 공유한다(요청 추가 없음).
   * **최종 단계에서만 켠다** — 양식/스펙/계획 단계에서는 이 숫자를 쓰는 곳이 없다.
   */
  const { data: runRows = [] } = useTaskActionRuns(action.id, step === 'final');
  const runCount = runRows.length;
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState('');
  /**
   * 지금 보고 있는 최종 화면이 **방금 실행한 결과**(true)인지 **불러온 이력을 재구성한
   * 것**(false)인지. 이력 불러오기는 RUN을 새로 만들지 않으므로 "검수 대기로 기록되었습니다"
   * 같은 안내가 사실이 아니게 된다 — 문구를 갈라 주기 위한 플래그다.
   */
  const [runRecorded, setRunRecorded] = useState(false);
  /** 제출 RPC — 저장(값) 직후 이어서 부른다 */
  const submitSpec = useSubmitTaskSpecSubmission(submission?.taskId);
  const loadResultBlob = useCallback(
    () => (resultBlob ? Promise.resolve(resultBlob) : Promise.reject(new Error('결과가 없습니다.'))),
    [resultBlob],
  );
  const editorRef = useRef<RhwpVisualEditorHandle | null>(null);

  // 계획 라이브 미리보기: plan 변경 → 결정적 fill(LLM 없음) → 좌측 문서 재렌더
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewSeq = useRef(0);
  const loadPlanPreview = useCallback(
    () => ((previewBlob ?? sourceBlob)
      ? Promise.resolve((previewBlob ?? sourceBlob)!)
      : Promise.reject(new Error('원본이 없습니다.'))),
    [previewBlob, sourceBlob],
  );

  // 값-기반 완성본(R3): 불러온 문서·실행 확정 값·저장 제목·prose 값 재사용 토글
  // 완성 문서는 **이 노드 것만** 본다 — 쿼리 키에도 actionId를 넣어야 노드를 옮길 때
  // 앞 노드의 목록이 캐시에서 그대로 보이지 않는다.
  const { data: documents = [], isFetched: documentsFetched } = useQuery({
    queryKey: ['spec-documents', action.id],
    queryFn: () => listSpecDocuments(action.id),
  });
  const [loadedDoc, setLoadedDoc] = useState<SpecDocumentRow | null>(null);
  const [presetValues, setPresetValues] = useState<Record<string, unknown> | null>(null);
  const [reuseProse, setReuseProse] = useState(true);
  const [docTitle, setDocTitle] = useState('');
  const [lastFill, setLastFill] = useState<{
    plan: Plan;
    knowledge: Record<string, unknown>;
    values: Record<string, unknown>;
    rows: Record<string, Record<string, unknown>[]>;
  } | null>(null);

  const unconfirmed = useMemo(() => spec?.targets.filter((t) => t.confirmRequired).length ?? 0, [spec]);
  /**
   * 스펙 저장 권한 = 이 양식을 만든 사람 ∨ admin(신규 등록은 곧 내가 만드는 것이므로 허용).
   * 그 외 사용자도 양식을 골라 스펙을 고칠 수 있지만 그 수정은 **이번 실행에만** 적용되고
   * DB에는 반영되지 않는다(서버 RLS가 정본, 여기는 그 사실을 화면에 드러내는 층).
   */
  const canSaveSpec = !selected || selected.created_by === user?.id || isAdmin;

  // ── 맥락 정보(2026-09-02) ────────────────────────────────────────────────
  // 목록은 계획 검토·스펙 검수에서만 필요하다(양식 선택 단계에서 읽을 이유가 없다).
  const { data: allContexts = [] } = useDocGenContexts(step === 'plan' || step === 'spec');
  const { data: specContextIds = [] } = useSpecContextIds(selected?.id ?? null);
  /**
   * 계획 검토 진입 시 **양식에 연결된 맥락을 기본 선택**으로 채운다.
   *
   * `selectedContextIds.length === 0`일 때만 채우는 이유: 사용자가 전부 해제한 상태를
   * "아직 안 골랐다"로 오해해 되살리면, 뺀 맥락이 계속 돌아온다. 대신 양식이 바뀌면
   * 다시 채운다(아래 의존성의 `selected?.id`).
   */
  const seededSpecId = useRef<string | null>(null);
  useEffect(() => {
    if (step !== 'plan' || !selected) return;
    if (seededSpecId.current === selected.id) return;
    seededSpecId.current = selected.id;
    if (specContextIds.length) setSelectedContextIds(specContextIds);
  }, [step, selected, specContextIds]);

  /** 선택된 맥락 = (앞 단계 맥락 − 뺀 것) + 라이브러리 원본 + 이번 실행 한정 수정본 */
  const selectedContexts = useMemo<DocGenContext[]>(
    () => [
      // 앞 단계가 먼저 — 이번 문서의 재료이고, 라이브러리 맥락은 배경이다
      ...upstreamContexts
        .filter((c) => !excludedUpstreamIds.includes(c.id))
        .map((c): DocGenContext => ({
          id: c.id, user_id: '', title: c.title, body: c.body, hidden: false,
          category: '앞 단계', created_at: '', updated_at: '',
        })),
      ...selectedContextIds
        .map((id) => allContexts.find((c) => c.id === id))
        .filter((c): c is DocGenContext => !!c),
    ].map((c) => (contextOverrides[c.id] != null ? { ...c, body: contextOverrides[c.id] } : c)),
    [upstreamContexts, excludedUpstreamIds, selectedContextIds, allContexts, contextOverrides],
  );
  /**
   * 프롬프트에 실릴 최종 설명 = 선택한 맥락들 + 사용자가 직접 쓴 설명.
   * **맥락을 앞에** 둔다 — 배경이 먼저 오고 이번 문서의 요구가 뒤에 와야 뒤엣것이
   * 앞엣것을 덮어쓰는 순서로 읽힌다.
   */
  /**
   * 이력에서 불러왔는데 **라이브러리에서 사라진** 맥락 — 그때와 다른 문서가 나오므로 알린다.
   * 목록이 로드된 뒤에만 판단할 수 있어(로드 전에는 전부 "없음"으로 보인다) 길이를 함께 본다.
   */
  const missingResumed = useMemo(
    () => (allContexts.length === 0
      ? []
      : resumedContexts.filter((r) => !allContexts.some((c) => c.id === r.id))),
    [resumedContexts, allContexts],
  );
  const composedUserContext = useMemo(() => {
    const ctx = composeContextText(selectedContexts);
    return [ctx, userContext.trim()].filter(Boolean).join('\n\n---\n\n');
  }, [selectedContexts, userContext]);
  const indexes = useMemo(() => (source ? source.sections.map(parseHwpxSection) : []), [source]);

  // 이력 서랍은 양식 단계에서만 기본 펼침 — 최종 단계는 우측 패널에 이력을 통합 표시한다
  useEffect(() => {
    onHistoryVisibleChange?.(step === 'template');
  }, [step, onHistoryVisibleChange]);

  // 계획 검토 진입 시 스펙 기반 빈칸 폼을 기본 표시(버튼 없이) — AI 생성·직접 입력은 그 위에 덮어쓴다
  useEffect(() => {
    if (step !== 'plan' || planResult || !spec) return;
    const schema = derivePlanSchema(normalizeSpecPlanKeys(spec));
    setPlanResult({ planSchema: schema, plan: emptyPlanFromSchema(schema), planErrors: [], knowledge: {}, knowledgeMissing: [] });
  }, [step, planResult, spec]);

  /**
   * 사람 필드 목록 — **폼에서 뽑아내지 않는다**(2026-09-02 사용자 요청).
   *
   * 종전에는 사람 필드를 맨 위 전용 블록으로 올렸는데(2026-08-22), 그러면 계획 검토의
   * 입력 순서가 **스펙 검수에서 본 타깃 순서와 어긋난다** — 같은 문서를 두 화면이 다른
   * 순서로 보여 주면 어느 칸이 문서 어디인지 대조가 안 된다. 이제 `PlanForm`이 스키마
   * 순서(= `derivePlanSchema`가 `spec.targets` 순서로 만든다) 그대로 렌더하고, 사람 필드는
   * 그 자리에서 초록 강조로 구분한다.
   *
   * 이 목록은 이제 **"AI에 무엇이 함께 전달되는지" 요약에만** 쓴다.
   */
  const personSchema = useMemo(
    () => planResult?.planSchema.filter((f) => f.person) ?? [],
    [planResult],
  );
  /** 생성 버튼 옆에 "무엇이 전달되는지" 보여줄 요약 — 연결이 보이지 않으면 안 쓰게 된다 */
  const chosenPeople = useMemo(
    () => personSchema
      .map((f) => ({ label: f.label ?? f.key, names: splitPersonNames(planResult?.plan[f.key]) }))
      .filter((x) => x.names.length > 0),
    [personSchema, planResult],
  );
  /**
   * 실행 게이트(2026-09-02 사용자 요청): 필수 + 사람 필드가 다 차야 문서 생성이 눌린다.
   * 판정은 `missingPlanInputs` 단일 출처 — 버튼 비활성·툴팁·안내 목록이 같은 값을 본다.
   *
   * JSON 직접 편집 모드는 검사하지 않는다(자유 편집이 목적이고, 파싱 실패는 실행 시점에
   * 별도로 잡힌다). 폼으로 돌아오면 게이트가 다시 걸린다.
   */
  const missingInputs = useMemo(
    () => (planResult && !planJsonMode ? missingPlanInputs(planResult.planSchema, planResult.plan) : []),
    [planResult, planJsonMode],
  );
  const canExecute = !!planResult && missingInputs.length === 0;

  // 계획 검토: 폼 값 변경을 800ms 디바운스로 문서에 반영(prose는 저장 값 재사용 시에만 표시)
  useEffect(() => {
    if (step !== 'plan' || planJsonMode || !spec || !source || !planResult) return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(() => {
      void (async () => {
        setPreviewBusy(true);
        try {
          // 실행 경로(runSpecFillPipeline)와 동일한 자가치유 — 구형 하이픈 id의
          // plan 참조('plan.field-1')는 정규화 없이는 수식 파서가 오파싱한다
          const normSpec = normalizeSpecPlanKeys(spec);
          const filled = await fillDocument(source.sections, {
            spec: normSpec,
            plan: planResult.plan,
            knowledge: planResult.knowledge,
            // 계획에 실린 서술 본문도 미리보기에 반영 — 문서 생성 결과와 같은 화면을 본다
            // (prose 생성기를 주지 않으므로 계획에 없는 서술만 비어 보인다)
            presetValues: {
              ...proseValuesFromPlan(normSpec, planResult.plan),
              ...(reuseProse && presetValues ? presetValues : {}),
            },
          });
          if (seq !== previewSeq.current) return;
          const blob = await exportHwpxSections(source, filled.sections);
          if (seq !== previewSeq.current) return;
          setPreviewBlob(blob);
        } catch {
          /* 미리보기 실패는 치명적이지 않음 — 원본이 계속 보인다 */
        } finally {
          if (seq === previewSeq.current) setPreviewBusy(false);
        }
      })();
    }, 800);
    return () => clearTimeout(timer);
  }, [step, planJsonMode, spec, source, planResult, reuseProse, presetValues]);

  /**
   * 이 노드의 기본 양식(워크플로 생성자가 지정) — 있으면 양식 선택을 건너뛴다.
   * 생성자 본인은 다른 양식으로 바꿀 수 있고(← 양식 선택), 그 외 사용자는 바로 스펙 검수로 간다.
   */
  const defaultTemplate = getDefaultTemplate(action);
  const isWorkOwner = action.created_by === user?.id;
  /**
   * 문서 생성 메뉴에서 **만든** 실행 인가(`config.origin`) — 소유·관리 규칙에만 쓴다.
   * 지금은 스펙 저장 후 기본 양식 자동 고정 하나뿐이다(할 일에 매인 실행 에 그걸 하면
   * 업무 관리 쪽 노드의 양식이 조용히 바뀐다 — 거기서는 핀이 명시적 행동이다).
   */
  const isDocGenAction = (action.config as { origin?: unknown }).origin === 'docgen';
  /**
   * 문서 생성 메뉴의 **흐름**인가 — **양식 단계를 건너뛰고 계획 검토부터** 시작한다.
   * 워크플로 캔버스에서는 노드가 "어떤 양식을 쓰는 자리"인지 보여 주는 것이 의미가 있지만,
   * 문서 생성 메뉴에서는 생성 방식 = 양식이 이미 정해진 것이라 그 화면이 한 단계 낭비다.
   * 실행 이력·저장된 완성 문서는 페이지 쪽(서랍·모달)이 맡는다.
   *
   * **연 화면이 정한다**(`docGenHost`). 행의 출신으로 정하면, 두 출신이 한 목록에 서는
   * 지금은 같은 화면의 카드 절반만 다르게 열린다. `isDocGenAction` 를 함께 보는 것은
   * 공지 딥링크 등 다른 진입점의 종전 동작을 유지하기 위해서다.
   */
  const docGenFlow = docGenHost === true || isDocGenAction;
  /**
   * 기본 양식이 **무엇에** 붙는지를 부르는 말. 문서 생성 메뉴에는 '노드'가 없다 —
   * 거기서 사용자가 다루는 단위는 '생성 방식'이다. 같은 버튼이 화면에 따라 없는 개념을
   * 가리키면, 읽는 사람은 자기가 다른 것을 건드리는 줄 안다.
   */
  const DEFAULT_TEMPLATE_OWNER_LABEL = docGenFlow ? '이 생성 방식' : '이 노드';
  const autoOpened = useRef(false);
  /**
   * 양식 선택 잠금(2026-08-14 사용자 결정).
   *
   * 워크플로 생성자가 기본 양식을 지정했다면 **다른 사람은 그 양식만 쓴다** — 남의 노드에서
   * 임의의 양식을 골라 실행하면 그 노드가 무엇을 하는 자리인지가 흐려진다.
   * 잠겨도 **저장된 완성 문서 패널은 그대로** 쓴다(자기가 만든 문서를 다시 열어야 하므로).
   *
   * 기본 양식이 보관·삭제돼 목록에 없으면 잠그지 않는다 — 잠그면 그 사람은 아무것도
   * 실행할 수 없게 된다(안전 폴백은 자동 열기 로직과 같은 판단).
   */
  /**
   * 양식을 찾는다 — id 로 못 찾으면 **`familyId` 로 현재 버전을 되찾는다**(2026-09-03).
   *
   * 양식 새 버전이 등록되면 핀한 id 가 보관본이 되어 목록(`archived_at is null`)에서
   * 사라진다. 워크플로에서는 그때 잠금이 풀리는 것이 안전 폴백이지만, **제출 모드에서
   * 잠금이 풀리면 담당자가 아무 양식이나 골라 내는 사고**가 된다.
   */
  const findPinned = (t: typeof defaultTemplate) => {
    if (!t) return null;
    const byId = templates.find((x) => x.id === t.id);
    if (byId) return byId;
    const family = (t as { familyId?: string | null }).familyId;
    return family ? templates.find((x) => x.family_id === family) ?? null : null;
  };
  /**
   * 제출 모드에서는 **소유자여도 잠근다** — 매니저가 자기 할 일의 담당자이기도 한 경우
   * `isWorkOwner` 때문에 잠금이 풀려 남들과 다른 양식으로 내는 구멍이 생긴다.
   */
  const lockedTemplate = (submissionMode || !isWorkOwner) && defaultTemplate
    ? findPinned(defaultTemplate)
    : null;

  useEffect(() => {
    if (autoOpened.current || !defaultTemplate || selected || resumeRun) return;
    // 제출 모드에서 **이미 낸 문서가 있으면 그것을 연다**(재제출이 기본 동작이다).
    // 목록이 도착하기 전에 빈 양식을 열어 버리면, 담당자가 자기가 낸 내용을 다시
    // 타이핑하게 된다 — 그래서 조회가 끝날 때까지 기다린다.
    if (submissionMode && !documentsFetched) return;
    if (submissionMode && documents.length > 0) {
      autoOpened.current = true;
      void openDocument(documents[0]);
      return;
    }
    const row = findPinned(defaultTemplate);
    if (!row) {
      // 기본 양식이 보관됐거나 사라진 경우 — 양식 선택 화면에 그대로 머문다
      if (templates.length) autoOpened.current = true;
      return;
    }
    autoOpened.current = true;
    // 양식만 준비하고 단계는 옮기지 않는다 — 사용자가 양식 단계에서 시작해야 한다.
    // **제출 모드는 계획 검토부터** — 스펙 검수는 매니저가 이미 확정했고, 담당자가
    // 그 자리를 손대면 사람마다 다른 문서가 나온다.
    void openTemplate(row, { advance: false }).then(() => {
      // 제출 모드·문서 생성 메뉴는 계획 검토부터. 워크플로는 종전대로 양식 단계에 머문다
      if (submissionMode || docGenFlow) setStep('plan');
    });
    // openTemplate은 마운트 이후 안정적으로 참조된다(의존성에서 제외해 재실행 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, defaultTemplate?.id, selected, resumeRun, documentsFetched, documents.length]);

  /** 제출 모드에서 "처음부터 다시" — 불러온 제출본을 버리고 빈 양식으로 돌아간다 */
  const restartSubmission = async () => {
    const row = defaultTemplate ? findPinned(defaultTemplate) : null;
    if (!row) { toast.error('지정 양식을 찾지 못했습니다.'); return; }
    await openTemplate(row, { advance: false });
    setStep('plan');
  };

  // ── 템플릿 선택/등록 ──
  /**
   * 양식을 연다. `advance=false`면 **양식 단계에 그대로 머문다**.
   *
   * 지정 양식 자동 열기가 그 경우다(2026-08-14 사용자 결정) — 예전엔 바로 스펙 검수로
   * 넘어가 버려서, 비생성자가 '이 양식으로 내 문서 만들기'로 들어오면 양식 단계를
   * 아예 보지 못했다. 그 화면에 **내가 저장한 완성 문서**가 있으므로 건너뛰면
   * 이어서 작업할 문서를 찾을 길이 사라진다.
   */
  const openTemplate = async (row: SpecTemplateRow, opts?: { advance?: boolean }) => {
    setBusy(true);
    try {
      const blob = await downloadSpecTemplateSource(row);
      setSource(await loadHwpxSections(blob));
      setSourceBlob(blob);
      setSelected(row);
      setDraftFile(null);
      setSpec(row.spec);
      setTemplateName(row.name);
      setDetectNotes([]);
      setLoadedDoc(null);
      setPresetValues(null);
      setDocTitle('');
      setPreviewBlob(null);
      setSelectedId(null);
      // 파이프라인: 양식 → 스펙 검수(문서 위 확인·지정 + 목록 확정 통합 화면)
      if (opts?.advance !== false) setStep('spec');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '템플릿을 열지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // 저장된 완성 문서 불러오기: 고정 참조된 템플릿 "버전"의 원본·스펙 + 저장 값으로 복원
  const openDocument = async (doc: SpecDocumentRow) => {
    setBusy(true);
    try {
      const tpl = await getSpecTemplateById(doc.template_version_id);
      const blob = await downloadSpecTemplateSource(tpl);
      setSource(await loadHwpxSections(blob));
      setSourceBlob(blob);
      setSelected(tpl);
      setDraftFile(null);
      setSpec(tpl.spec);
      setTemplateName(tpl.name);
      setDetectNotes([]);
      setLoadedDoc(doc);
      setPresetValues(doc.field_values);
      setReuseProse(true);
      setDocTitle(doc.title);
      setUserContext(doc.user_context ?? '');
      setPlanResult({
        planSchema: derivePlanSchema(normalizeSpecPlanKeys(tpl.spec)),
        plan: doc.plan as Plan,
        planErrors: [],
        knowledge: doc.knowledge,
        knowledgeMissing: [],
      });
      setPlanJsonMode(false);
      setPreviewBlob(null);
      setSelectedId(null);
      setStep('plan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '완성 문서를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // 실행 이력에서 이어서 진행: RUN 입력 스냅샷의 양식(고정 버전)·계획 값을 복원해 계획 검토로
  const resumeFromRun = async (run: TaskActionRunWithDetails) => {
    const snap = run.input_snapshot as {
      templateId?: string | null;
      plan?: Plan;
      /** 사용자가 작성한 맥락(2026-09-02~). 그 이전 이력에는 없다 — 없으면 빈 값으로 연다 */
      authoring?: {
        note?: string;
        mode?: SpecFillMode;
        contexts?: { id?: string; title: string; body: string; edited?: boolean }[];
        drafts?: AuthoringDraft[];
      };
    } | null;
    if (!snap?.templateId) {
      toast.error('이 이력에는 불러올 양식 정보가 없습니다(양식 저장 전 실행).');
      return;
    }
    setBusy(true);
    try {
      const tpl = await getSpecTemplateById(snap.templateId);
      const blob = await downloadSpecTemplateSource(tpl);
      const src = await loadHwpxSections(blob);
      setSource(src);
      setSourceBlob(blob);
      setSelected(tpl);
      setDraftFile(null);
      setSpec(tpl.spec);
      setTemplateName(tpl.name);
      setDetectNotes([]);
      setLoadedDoc(null);
      setPresetValues(null);
      setDocTitle('');
      const schema = derivePlanSchema(normalizeSpecPlanKeys(tpl.spec));
      setPlanResult({
        planSchema: schema,
        plan: (snap.plan ?? emptyPlanFromSchema(schema)) as Plan,
        planErrors: [],
        knowledge: {},
        knowledgeMissing: [],
      });
      setPlanJsonMode(false);
      setPreviewBlob(null);
      setSelectedId(null);

      /*
       * **작성 맥락도 함께 복원한다**(2026-09-02 결함 수정). 종전에는 양식·계획만 되살려서
       * 이력을 불러오면 설명란이 비고 맥락 선택이 풀린 채로 열렸다 — 그대로 다시 실행하면
       * **그때와 다른 문서가 나온다**(서술 재생성의 근거가 사라지기 때문).
       *
       * 라이브러리 목록이 아직 로드되지 않았을 수 있으므로 **스냅샷만 보고** 복원한다.
       * `edited`가 참인 것만 덮어쓰기로 되살려야 "수정됨" 배지가 엉뚱하게 붙지 않는다.
       */
      const authoring = snap.authoring;
      setUserContext(authoring?.note ?? '');
      setFillMode(authoring?.mode ?? 'strict');
      setAuthoringLog(authoring?.drafts ?? []);
      // 앞 단계 맥락은 복원하지 않는다 — 지금 화면이 지금 값으로 다시 넣어 준다(옛 사본을 되살리면
      // 앞 단계가 바뀐 뒤에도 옛 값이 섞인다). 라이브러리 맥락만 스냅샷에서 되살린다.
      const snapContexts = (authoring?.contexts ?? []).filter((c) => !!c.id && !isUpstreamContextId(c.id));
      setSelectedContextIds(snapContexts.map((c) => c.id!));
      setContextOverrides(Object.fromEntries(
        snapContexts.filter((c) => c.edited).map((c) => [c.id!, c.body]),
      ));
      // 라이브러리에서 사라진 맥락은 조용히 빠진다 — 결과가 달라지므로 알려 준다.
      setResumedContexts(snapContexts.map((c) => ({ id: c.id!, title: c.title })));
      // 이력에서 되살린 선택이 "양식 연결 기본값" 시드에 덮이지 않게 막는다
      seededSpecId.current = tpl.id;

      /*
       * 불러오면 **최종 결과 단계로 바로 간다**(2026-09-02 사용자 요청). 이력을 여는 사람은
       * 대개 "그때 그 문서"를 다시 받으려는 것이지 계획부터 다시 보려는 것이 아니다.
       *
       * 그래서 문서를 여기서 재구성한다 — 계획에 **서술 본문까지 이미 실려 있으므로**
       * (`fillProseTargets`가 계획 단계에서 확정한다) 같은 파이프라인을 태워도 LLM을 새로
       * 부르지 않고, knowledge는 정상 해석돼 그때와 같은 문서가 나온다.
       *
       * **RUN은 새로 만들지 않는다** — 이건 실행이 아니라 열람이다. 고쳐서 다시 실행하려면
       * 최종 화면의 "← 계획 수정 후 재실행"이나 단계 헤더로 계획 검토에 돌아가면 된다.
       */
      const restoredPlan = (snap.plan ?? emptyPlanFromSchema(schema)) as Plan;
      const result = await runSpecFillPipeline({
        spec: tpl.spec, sections: src.sections, plan: restoredPlan, chat,
        options: { mode: fillMode, useRegionExamples },
      });
      const rebuilt = await exportHwpxSections(src, result.filled.sections);
      setRunChecks(result.checks);
      setResultBlob(rebuilt);
      setResultName(`${taskTitle}_${tpl.spec.documentType}.hwpx`);
      setLastFill({
        plan: restoredPlan, knowledge: result.knowledge,
        values: result.filled.values, rows: result.filled.rows,
      });
      setDocTitle(`${taskTitle}_${tpl.spec.documentType}`);
      setRunRecorded(false);
      setStep('final');
      toast.success('이력의 문서를 다시 만들었습니다 — 내려받거나, 계획을 고쳐 다시 실행할 수 있습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '이력 내용을 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // 이력 서랍(호스트 다이얼로그)에서 온 불러오기 요청 소비
  useEffect(() => {
    if (!resumeRun) return;
    onResumeConsumed?.();
    void resumeFromRun(resumeRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeRun]);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const src = await loadHwpxSections(file);
      const detected = detectSpecDraft(src.sections, file.name.replace(/\.hwpx$/i, ''));
      setSource(src);
      setSourceBlob(file);
      setDraftFile(file);
      setSelected(null);
      setSpec(detected.draft);
      setDetectNotes(detected.instructions);
      setTemplateName(file.name.replace(/\.hwpx$/i, ''));
      setLoadedDoc(null);
      setPresetValues(null);
      setDocTitle('');
      setPreviewBlob(null);
      setSelectedId(null);
      setStep('spec');
      toast.success(`작성 지점 ${detected.draft.targets.length}건을 제안했습니다. 문서 위에서 검수 후 확정하세요.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'HWPX를 읽지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 새 생성 방식에 첨부된 양식으로 바로 시작(문서 생성 메뉴).
   * `handleFile` 이 스펙 검수로 옮겨 주므로 단계 지정은 따로 하지 않는다.
   */
  useEffect(() => {
    if (!initialFile) return;
    onInitialFileConsumed?.();
    void handleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  /** 페이지 '완성 문서' 모달에서 고른 문서로 복원 — 목록이 도착한 뒤에 찾는다 */
  useEffect(() => {
    if (!initialDocumentId || !documentsFetched) return;
    const doc = documents.find((d) => d.id === initialDocumentId);
    onInitialDocumentConsumed?.();
    if (doc) void openDocument(doc);
    else toast.error('완성 문서를 찾지 못했습니다.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocumentId, documentsFetched]);

  const saveSpec = async () => {
    if (!spec || !source) return;
    if (unconfirmed > 0) {
      toast.error(`확정되지 않은 제안 ${unconfirmed}건이 있습니다. 각 항목을 확인 또는 삭제하세요.`);
      return;
    }
    // 비소유자는 저장하지 않고 그대로 진행 — 고친 스펙은 이번 실행에만 쓰인다
    if (!canSaveSpec) {
      setStep('plan');
      return;
    }
    setBusy(true);
    try {
      if (selected) {
        await updateTemplateSpec(selected.id, spec);
        /*
          이미 등록된 양식을 **처음** 고른 경우도 고정한다(2026-09-08). 종전에는 새로
          만든 양식(아래 else)만 고정해서, '새 생성 방식'을 양식 없이 만든 뒤 목록에서
          고른 사람만 기본 양식이 비었다 — 그 방식만 매번 양식 단계로 떨어진다.
          **이미 지정된 것이 있으면 건드리지 않는다**: 다른 양식을 잠깐 열어 본 것일 수
          있고, 그때 조용히 바꾸면 이 생성 방식이 무엇을 만드는 자리인지가 달라진다.
          바꾸는 것은 핀 버튼(명시적 행동)이 맡는다.
        */
        if (isDocGenAction && isWorkOwner && !defaultTemplate) {
          try {
            await setTaskActionDefaultTemplate(action.id, { id: selected.id, name: selected.name });
            queryClient.invalidateQueries({ queryKey: ['docgen-actions'] });
          } catch {
            // 고정에 실패해도 문서는 계속 만들 수 있다 — 다음에 양식 단계가 한 번 더 보일 뿐
          }
        }
      } else {
        if (!draftFile) throw new Error('원본 파일이 없습니다.');
        const row = await createSpecTemplate({ name: templateName || spec.documentType, file: draftFile, spec });
        setSelected(row);
        /*
          문서 생성 메뉴에서는 방금 만든 양식을 **이 생성 방식의 기본 양식으로 고정**한다.
          안 하면 다음에 카드에서 '문서 만들기'를 눌렀을 때 양식 단계로 떨어져,
          방금 등록한 양식을 목록에서 한 번 더 고르게 된다.
          업무 흐름에서는 기본 양식 지정이 명시적 행동(핀 버튼)이라 손대지 않는다.
        */
        if (isDocGenAction && isWorkOwner) {
          try {
            await setTaskActionDefaultTemplate(action.id, { id: row.id, name: row.name });
            queryClient.invalidateQueries({ queryKey: ['docgen-actions'] });
          } catch {
            // 고정에 실패해도 문서는 계속 만들 수 있다 — 다음에 양식 단계가 한 번 더 보일 뿐
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['spec-templates'] });
      setStep('plan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '스펙 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // 영역 재지정 모드: 설정되면 다음 지정이 새 타깃 생성 대신 해당 타깃의 위치 교체가 된다
  const [reassignId, setReassignId] = useState<string | null>(null);
  const reassignTarget = reassignId && spec ? spec.targets.find((t) => t.id === reassignId) ?? null : null;

  // 문서 위 원터치 지정(스펙 검수) — 번호는 현재 스펙에서 유도(재마운트 안전)
  const handleDesignate = (hit: NonNullable<HitResult>) => {
    if (!spec) return;
    if (reassignId) {
      const target = spec.targets.find((t) => t.id === reassignId);
      if (target) {
        const r = reassignTargetLocator(target, hit, indexes);
        if (r.error) { toast.error(r.error); return; }
        setSpec({ ...spec, targets: spec.targets.map((t) => (t.id === reassignId ? r.target! : t)) });
        setSelectedId(reassignId);
        toast.success(`"${target.label || target.id}" 영역을 재지정했습니다(라벨·지침 유지).`);
      }
      setReassignId(null);
      return;
    }
    const r = designateFromHit(hit, spec, indexes);
    setSpec({ ...spec, targets: [...spec.targets, ...r.targets] });
    setSelectedId(r.selectId);
  };

  // AI 라벨 보완 — 하단(스펙 저장 왼쪽) 버튼, 로직은 SpecEditColumn과 공유
  const handleSuggest = async () => {
    if (!spec) return;
    setSuggesting(true);
    try {
      const r = await suggestSpecMeta(spec, indexes, chat);
      if (r.count === 0) toast.info('보완할 제안이 없습니다.');
      else {
        setSpec(r.spec);
        toast.success(`라벨·지시·열별 지침·설명 예시 제안 ${r.count}건을 채웠습니다(빈 칸만). 검토 후 수정하세요.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 보완에 실패했습니다.');
    } finally {
      setSuggesting(false);
    }
  };

  // ── plan ──
  const makePlan = async (withAi: boolean) => {
    if (!spec) return;
    setBusy(true);
    try {
      if (withAi) {
        // 재생성: 사용자가 이미 채운 칸은 유지하고(맥락으로 LLM에 전달) 빈 칸만 새로 생성.
        // sections 전달 = 각 타깃 구역의 기존 내용을 "양식 예시"(표기 형식 참고)로 제공
        const existingPlan = !planJsonMode && planResult ? planResult.plan : undefined;
        const r = await generateSpecFillPlan({
          spec, userContext: composedUserContext, existingPlan,
          sections: source?.sections, chat,
          options: { mode: fillMode, useRegionExamples },
          onProgress: (done, total) => setPlanProgress(total > 1 ? { done, total } : null),
        });
        // 실행 기록용 — **사용자가 직접 쓴 것만** 남긴다(조립된 프롬프트·knowledge 아님).
        // 여러 번 시도하면 그때마다 쌓되, 기록이 무한정 커지지 않게 최근 것만 유지한다.
        setAuthoringLog((prev) => [
          ...prev,
          {
            at: new Date().toISOString(),
            mode: fillMode,
            note: userContext.trim(),
            contexts: selectedContexts.map((c) => ({
              id: c.id, title: c.title, body: c.body, edited: contextOverrides[c.id] != null,
            })),
          },
        ].slice(-AUTHORING_LOG_MAX));
        setPlanResult(r);
        if (r.planErrors.length) toast.warning(`계획 스키마 미충족 ${r.planErrors.length}건 — 직접 보완하세요.`);
        else if (existingPlan && Object.values(existingPlan).some((v) => !isEmptyPlanValue(v))) {
          toast.success('빈 칸만 새로 생성했습니다 — 이미 입력한 값은 유지됩니다.');
        }
      } else {
        // 스키마 키는 실행이 사용하는 정규화된 참조와 일치해야 한다(하이픈 id 자가치유)
        const schema = derivePlanSchema(normalizeSpecPlanKeys(spec));
        setPlanResult({ planSchema: schema, plan: emptyPlanFromSchema(schema), planErrors: [], knowledge: {}, knowledgeMissing: [] });
      }
      setPlanJsonMode(false);
    } catch (e) {
      // 화면 토스트는 한 줄이라 원인이 남지 않는다 — 콘솔에 원문을 남겨 추적 가능하게
      logSpecFillIssue('AI 초안 작성 실패', e);
      toast.error(e instanceof Error ? e.message : '계획 생성에 실패했습니다.');
    } finally {
      setBusy(false);
      setPlanProgress(null);
    }
  };

  const currentPlan = (): Plan | null => {
    if (!planResult) return null;
    if (!planJsonMode) return planResult.plan;
    try {
      return JSON.parse(planJsonText) as Plan;
    } catch {
      toast.error('plan JSON 파싱 실패 — 문법을 확인하세요.');
      return null;
    }
  };

  // ── 실행 ──
  const execute = async () => {
    if (!spec || !source) return;
    const plan = currentPlan();
    if (!plan) return;
    setBusy(true);
    setRunChecks(null);
    let runId: string | null = null;
    try {
      /*
       * **제출 모드에서는 RUN 을 기록하지 않는다**(2026-09-03).
       *
       * `task_action_run.input_snapshot` 에 계획 전체가 실리는데 `task_action_run` SELECT 는
       * 아직 **교직원 전체 읽기**다. 제출 내용이 그 경로로 새면 "담당자는 본인 것만" 이라는
       * 열람 규칙이 무의미해진다. 감사 기록은 `task_submission`(누가·언제·어느 버전)이 맡는다.
       *
       * Storage 에 산출물 HWPX 를 쌓지 않는 것도 "파일 없이 값만"이라는 이 기능의 취지와 맞다.
       */
      if (submissionMode) {
        const result = await runSpecFillPipeline({
          spec, sections: source.sections, plan, chat,
          options: { mode: fillMode, useRegionExamples },
          userContext: composedUserContext,
          presetValues: reuseProse && presetValues ? presetValues : undefined,
        });
        const blob = await exportHwpxSections(source, result.filled.sections);
        setRunChecks(result.checks);
        setResultBlob(blob);
        setResultName(`${taskTitle}_${spec.documentType}.hwpx`);
        setRunRecorded(false);
        setLastFill({
          plan, knowledge: result.knowledge,
          values: result.filled.values, rows: result.filled.rows,
        });
        if (!docTitle) {
          setDocTitle(`${taskTitle}${submission?.unitLabel ? `_${submission.unitLabel}` : ''}_${spec.documentType}`);
        }
        const failCount = result.checks.filter((c) => c.status === 'fail').length;
        toast.success(failCount === 0 ? '문서를 만들었습니다 — 확인 후 제출하세요.' : `문서 생성(검증 실패 ${failCount}건) — 확인 후 제출하세요.`);
        setStep('final');
        return;
      }

      const run = await startRun.mutateAsync({
        actionId: action.id,
        workflowId: workflowId ?? null,
        inputSnapshot: {
          templateId: selected?.id ?? null,
          documentType: spec.documentType,
          targetCount: spec.targets.length,
          plan,
          /**
           * 사용자가 맥락으로 **직접 작성한 기록**(2026-09-02).
           * 조립된 LLM 프롬프트가 아니다 — knowledge(학생 데이터가 실릴 수 있다)·양식
           * 예시·스키마는 담지 않는다. 실행 기록이 RLS로 보호되던 데이터의 사본이 되면 안 된다.
           */
          authoring: {
            note: userContext.trim(),
            contexts: selectedContexts.map((c) => ({
              id: c.id, title: c.title, body: c.body, edited: contextOverrides[c.id] != null,
            })),
            mode: fillMode,
            drafts: authoringLog,
          },
        },
      });
      runId = run.id;

      const result = await runSpecFillPipeline({
        spec, sections: source.sections, plan, chat,
        options: { mode: fillMode, useRegionExamples },
        userContext: composedUserContext,
        presetValues: reuseProse && presetValues ? presetValues : undefined,
      });
      const blob = await exportHwpxSections(source, result.filled.sections);
      const fileName = `${taskTitle}_${spec.documentType}`;
      const uploaded = await uploadGeneratedSpecHwpx({ runId, blob, fileName });
      setRunChecks(result.checks);
      setResultBlob(blob);
      setResultName(uploaded.fileName);
      setRunRecorded(true);
      setLastFill({
        plan, knowledge: result.knowledge,
        values: result.filled.values, rows: result.filled.rows,
      });
      if (!docTitle) setDocTitle(`${taskTitle}_${spec.documentType}`);

      const failCount = result.checks.filter((c) => c.status === 'fail').length;
      // 키 100자 절단이 유일성을 깨지 않도록 절단 후 한 번 더 유일화(unique(run_id, check_key) 보호)
      const keyCount = new Map<string, number>();
      const checks: TaskActionCheckInput[] = result.checks.slice(0, 40).map((c) => {
        const base = c.key.slice(0, 90);
        const n = (keyCount.get(base) ?? 0) + 1;
        keyCount.set(base, n);
        return {
          key: n === 1 ? base : `${base}#${n}`,
          label: c.key.split(':')[0],
          status: c.status,
          message: c.message.slice(0, 500),
        };
      });
      await finalizeRun.mutateAsync({
        runId,
        status: 'needs_review',
        outputSummary: {
          documentType: spec.documentType,
          fileName: uploaded.fileName,
          sizeBytes: uploaded.sizeBytes,
          failedChecks: failCount,
          targetCount: spec.targets.length,
        },
        checks,
        artifacts: [{
          key: 'generated-hwpx',
          type: 'file',
          label: uploaded.fileName,
          locator: { bucket: uploaded.bucket, path: uploaded.path, fileName: uploaded.fileName, templateId: selected?.id ?? null },
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          contentSha256: uploaded.contentSha256,
          metadata: { failedChecks: failCount },
        }],
      });
      toast.success(failCount === 0 ? '생성 완료 — 검수 대기로 기록했습니다.' : `생성 완료(검증 실패 ${failCount}건) — 검수에서 확인하세요.`);
      setStep('final');
    } catch (e) {
      const message = e instanceof Error ? e.message : '실행에 실패했습니다.';
      if (runId) {
        try {
          await finalizeRun.mutateAsync({ runId, status: 'failed', errorSummary: message.slice(0, 500) });
        } catch { /* 이중 실패는 이력에 남김 */ }
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  // ── 완성본 저장(값): 불러온 문서면 새 버전, 아니면 v1 ──
  const saveDocument = async () => {
    if (!selected || !lastFill) return;
    if (!docTitle.trim()) { toast.error('완성 문서 제목을 입력하세요.'); return; }
    setBusy(true);
    try {
      const content = {
        actionId: action.id,
        templateVersionId: selected.id,
        title: docTitle,
        plan: lastFill.plan as Record<string, unknown>,
        knowledge: lastFill.knowledge,
        fieldValues: lastFill.values,
        rowValues: lastFill.rows,
        userContext: userContext || undefined,
      };
      const saved = loadedDoc
        ? await createSpecDocumentVersion(loadedDoc.id, content)
        : await createSpecDocument(content);
      setLoadedDoc(saved);
      setPresetValues(saved.field_values);
      queryClient.invalidateQueries({ queryKey: ['spec-documents', action.id] });
      /*
       * 제출 모드에서는 **저장이 곧 제출**이다 — 값을 저장한 뒤 바로 RPC 로 확정한다.
       * 두 단계로 나누면 "저장했는데 제출은 안 된" 상태가 생기고, 담당자는 그 차이를
       * 알 방법이 없다(카드는 여전히 미완료).
       */
      if (submissionMode && submission) {
        if (submission.submit) await submission.submit(saved.id);
        else await submitSpec.mutateAsync({ documentId: saved.id, unitKey: submission.unitKey });
        toast.success(`제출했습니다 (v${saved.version}). 값으로 저장되어 언제든 다시 열어볼 수 있습니다.`);
        submission.onSubmitted?.();
        return;
      }
      toast.success(`완성 문서 v${saved.version} 저장 — 파일 없이 값만으로 언제든 재구성됩니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (submissionMode ? '제출에 실패했습니다.' : '완성 문서 저장에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  // 최종 수정본 다운로드: 에디터의 현재 상태(서식·값 수정 포함)를 내보낸다.
  // 원본 양식 파일과 DB의 실행 산출물에는 영향이 없다(다운로드 전용).
  const downloadEdited = async () => {
    try {
      const bytes = editorRef.current
        ? await editorRef.current.exportHwpx()
        : null;
      const blob = bytes ? new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }) : resultBlob;
      if (!blob) { toast.error('다운로드할 결과가 없습니다.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = resultName || 'result.hwpx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '내보내기에 실패했습니다.');
    }
  };

  /**
   * 스펙 번들 내보내기 — 외부 AI 에이전트(Claude Code 등)가 읽을 한 파일.
   * 스펙만으론 locator가 엔진 상대 주소라 쓸모가 없으므로, 타깃마다 "지금 그 자리의 원문"과
   * 계획 스키마·빈 계획 골격을 함께 담는다. 에이전트의 산출물은 HWPX가 아니라 plan JSON이고,
   * 계획 검토의 JSON 모드에 붙여넣으면 검증된 채움 엔진이 문서를 만든다(bundle.ts 주석 참조).
   */
  const downloadSpecBundle = async () => {
    if (!spec || !source || !sourceBlob) { toast.error('내보낼 스펙이 없습니다.'); return; }
    setBusy(true);
    try {
      const bundle = buildSpecBundle(normalizeSpecPlanKeys(spec), source.sections, {
        name: selected?.name ?? templateName,
        sourceFileName: selected?.source_file_name ?? draftFile?.name,
        templateVersion: selected?.version,
        contentSha256: selected?.content_sha256,
      });
      const safe = (bundle.template.name || spec.documentType || 'action-spec').replace(/[\\/:*?"<>|]/g, '_');
      // 원본 양식을 함께 넣어야 "계획을 만든 뒤 한글 문서까지 생성" 지시가 실제로 수행 가능하다
      const zip = new JSZip();
      zip.file('spec-bundle.json', JSON.stringify(bundle, null, 2));
      zip.file('template.hwpx', await sourceBlob.arrayBuffer());
      zip.file('plan.skeleton.json', JSON.stringify(bundle.planSkeleton, null, 2));
      zip.file('README.md', bundle.readme.join('\n'));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${safe}.spec-bundle.zip`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`스펙 번들을 내려받았습니다(타깃 ${bundle.targets.length}건 + 원본 양식).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '스펙 내보내기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /** 기본 양식 지정/해제 — 같은 양식을 다시 누르면 해제 */
  const handleSetDefaultTemplate = async (row: SpecTemplateRow) => {
    const clearing = defaultTemplate?.id === row.id;
    setBusy(true);
    try {
      await setTaskActionDefaultTemplate(action.id, clearing ? null : { id: row.id, name: row.name });
      // 러너가 받은 action은 프롭이므로 패널 쪽 목록을 갱신해야 배지가 반영된다
      queryClient.invalidateQueries({ queryKey: ['task-actions'] });
      toast.success(clearing
        ? '기본 양식을 해제했습니다.'
        : `"${row.name}"을(를) ${DEFAULT_TEMPLATE_OWNER_LABEL}의 기본 양식으로 지정했습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '기본 양식 지정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // ── 양식 삭제(=보관): 목록에서 제거, 참조 중인 완성 문서 재구성은 계속 동작 ──
  const handleArchiveTemplate = async (row: SpecTemplateRow) => {
    if (!window.confirm(`"${row.name}" 양식을 삭제할까요? 목록에서 사라지며, 이 양식으로 저장된 완성 문서의 재구성에는 영향이 없습니다.`)) return;
    setBusy(true);
    try {
      await archiveSpecTemplate(row.id);
      if (selected?.id === row.id) setSelected(null);
      queryClient.invalidateQueries({ queryKey: ['spec-templates'] });
      toast.success('양식을 삭제(보관)했습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '양식 삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // ── 완성 문서 삭제(계보 전체, final은 서비스가 보호) ──
  const handleDeleteDocument = async (doc: SpecDocumentRow) => {
    if (!window.confirm(`"${doc.title}" 완성 문서(전체 버전)를 삭제할까요? 값 기록이 모두 사라집니다.`)) return;
    setBusy(true);
    try {
      const n = await deleteSpecDocumentLineage(doc.family_id);
      if (loadedDoc?.family_id === doc.family_id) {
        setLoadedDoc(null);
        setPresetValues(null);
      }
      queryClient.invalidateQueries({ queryKey: ['spec-documents', action.id] });
      toast.success(`완성 문서 ${n}개 버전을 삭제했습니다.`);
    } catch (e) {
      queryClient.invalidateQueries({ queryKey: ['spec-documents', action.id] });
      toast.error(e instanceof Error ? e.message : '완성 문서 삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // ── 단계 내비게이션(파이프라인 버튼 클릭 이동) ──
  const canGo = (s: Step): boolean => {
    if (s === 'template') return true;
    if (s === 'spec') return !!spec && !!source;
    if (s === 'plan') return !!spec && !!source && unconfirmed === 0;
    return !!resultBlob; // final
  };
  const goStep = (s: Step) => {
    if (!canGo(s)) {
      if (s === 'plan' && unconfirmed > 0) toast.info(`확정 필요 ${unconfirmed}건을 먼저 처리하세요.`);
      return;
    }
    setStep(s);
  };

  // ── 렌더 ──
  if (step === 'template') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-5">
        <StepHeader step={step} canGo={canGo} onGo={goStep} compact={submissionMode} />
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          {/* 좌: 양식 스펙 */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <FileUp className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-700">{lockedTemplate ? '지정 양식' : '양식 스펙'}</h3>
              <span className="text-xs text-slate-400">{lockedTemplate ? '이 노드 전용' : `${templates.length}건`}</span>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {lockedTemplate && (
                <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-500">
                  이 노드는 업무 흐름을 만든 사람이 지정한 양식으로만 실행합니다. 스펙은 이번 실행에 맞게 고칠 수 있고(저장은 생성자만),
                  오른쪽에서 내가 저장한 완성 문서를 불러올 수 있습니다.
                </p>
              )}
              {/* 새 양식 등록 — 대형 점선 카드. 잠긴 노드에서는 감춘다(등록해도 쓸 수 없다) */}
              {!lockedTemplate && (
              <>
              <label
                htmlFor="spec-template-upload"
                className={`flex items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3 ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50'}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <FileUp className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-blue-700">새 양식 등록</span>
                  <span className="block truncate text-xs text-slate-400">HWPX 업로드 → 작성 지점 자동 제안 → 스펙 검수</span>
                </span>
              </label>
              <Input
                id="spec-template-upload" type="file" accept=".hwpx" disabled={busy} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
              />
              </>
              )}
              {templatesLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : templates.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">등록된 양식이 아직 없습니다. 위에서 HWPX 양식을 업로드하세요.</p>
              ) : (
                (lockedTemplate ? [lockedTemplate] : templates).map((t) => (
                  <div
                    key={t.id}
                    className="group flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {t.name}
                        <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-normal text-slate-500">v{t.version}</span>
                        {/* 양식은 전 교사 공유 — 내 것이 아니면 스펙 저장·보관이 불가하다 */}
                        {t.created_by !== user?.id && (
                          <span className="ml-1 rounded bg-violet-50 px-1 py-0.5 text-[10px] font-normal text-violet-600">공유</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-400" title={t.source_file_name}>
                        {t.spec.documentType} · 타깃 {t.spec.targets.length}개 · {new Date(t.created_at).toLocaleDateString('ko-KR')} 등록
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* 기본 양식 지정 = 워크플로 생성자만. 지정하면 다른 교사가 이 노드를
                          열 때 양식 선택을 건너뛰고 스펙 검수로 바로 들어간다 */}
                      {isWorkOwner && (
                        <Button
                          size="icon" variant="ghost"
                          className={cn(
                            'h-8 w-8 rounded-full',
                            defaultTemplate?.id === t.id
                              ? 'text-blue-600 hover:bg-blue-50'
                              : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500',
                          )}
                          title={defaultTemplate?.id === t.id
                            ? `${DEFAULT_TEMPLATE_OWNER_LABEL}의 기본 양식 — 해제하려면 클릭`
                            : `${DEFAULT_TEMPLATE_OWNER_LABEL}의 기본 양식으로 지정(다른 교사는 양식 선택을 건너뜁니다)`}
                          disabled={busy}
                          onClick={() => void handleSetDefaultTemplate(t)}
                        >
                          <Pin className={cn('h-4 w-4', defaultTemplate?.id === t.id && 'fill-current')} />
                        </Button>
                      )}
                      {lockedTemplate
                        ? <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600">사용 중</span>
                        : <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={busy} onClick={() => openTemplate(t)}>열기</Button>}
                      {!lockedTemplate && (t.created_by === user?.id || isAdmin) && (
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:text-red-500"
                          title="양식 삭제(목록에서 제거 — 기존 완성 문서 재구성에는 영향 없음)" disabled={busy}
                          onClick={() => void handleArchiveTemplate(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          {/* 우: 저장된 완성 문서 */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <Save className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-700">저장된 완성 문서</h3>
              <span className="text-xs text-slate-400">{documents.length}건 · 값 기반</span>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {documents.length === 0 ? (
                <p className="py-6 text-center text-xs leading-relaxed text-slate-400">
                  아직 저장된 완성 문서가 없습니다.<br />
                  문서 생성 후 최종 단계에서 "완성본 저장(값)"을 누르면<br />
                  파일 없이 값만으로 언제든 같은 문서를 재구성할 수 있습니다.
                </p>
              ) : (
                documents.map((d) => (
                  <div
                    key={d.id}
                    className="group flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {d.title}
                        <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-normal text-slate-500">v{d.version}</span>
                        {d.status === 'final' && (
                          <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-normal text-emerald-700">확정</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {new Date(d.updated_at).toLocaleDateString('ko-KR')} 저장 · 값만으로 재구성
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={busy} onClick={() => void openDocument(d)}>불러오기</Button>
                      <Button
                        size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:text-red-500"
                        title="완성 문서 삭제(모든 버전)" disabled={busy}
                        onClick={() => void handleDeleteDocument(d)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
        {/* 양식이 이미 열려 있으면 다시 고르지 않고 바로 다음 단계로 — 특히 지정 양식이
            자동으로 열리는 노드에서는 이 단계에서 할 일이 "완성 문서 확인"뿐이다.
            상단 단계 칩으로도 갈 수 있지만 그건 눈에 잘 띄지 않아 길이 없어 보인다. */}
        {spec && source && (
          <div className="flex shrink-0 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="min-w-0 truncate text-[11px] text-slate-500">
              선택된 양식: <span className="font-medium text-slate-700">{templateName}</span>
            </span>
            <Button size="sm" onClick={() => goStep('spec')}>스펙 검수로 →</Button>
          </div>
        )}
      </div>
    );
  }

  if (!spec || !source) return null;

  // ── 양식 로드 이후: 좌=문서 / 우=단계 기능 통일 레이아웃 ──
  const docPane =
    step === 'final' && resultBlob ? (
      <RhwpVisualEditor
        ref={editorRef}
        className="h-full min-h-0"
        fileName={resultName || 'result.hwpx'}
        loadSource={loadResultBlob}
      />
    ) : (
      <SpecOverlayView
        className="h-full min-h-0"
        loadSource={step === 'plan' ? loadPlanPreview : loadSourceBlob}
        spec={spec}
        selectedTargetId={selectedId}
        onSelectTarget={setSelectedId}
        onDesignate={step === 'plan' ? undefined : handleDesignate}
      />
    );

  const stepPane =
    step === 'spec' ? (
      // 스펙 검수(통합): 문서 위 확인·지정(칩·AI 보완·타깃 목록) + 이름·유형·잔여물·저장
      <div className="flex h-full min-h-0 flex-col gap-2">
        {/* 이 단계가 무엇을 하는 곳인지 한 줄로 — 계획 검토와 같은 자리·같은 서식.
            "여기 순서가 다음 단계 순서"라는 사실을 여기서 말해야 한다(그래야 지금 정리한다) */}
        <div className="min-w-0 shrink-0">
          <p className="text-xs font-bold text-slate-700">스펙 검수 · 채울 자리 지정</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            왼쪽 문서에서 <b className="font-semibold text-slate-600">채울 자리</b>를 클릭·드래그해 지정하고,
            자리마다 이름과 유형을 정합니다. <b className="font-semibold text-slate-600">여기서 정한 순서 그대로</b> 다음 단계의 입력 칸이 됩니다.
            <br />
            <b className="font-semibold text-blue-600">AI 라벨 보완</b>을 누르면 비어 있는 이름·작성 지시·반복 행의 열별 공통 지침과 설명 예시를 채워 줍니다(빈 칸만).
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] text-slate-500">양식 이름</Label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} disabled={!!selected} />
          </div>
          <div>
            <Label className="text-[11px] text-slate-500">문서 유형</Label>
            <Input value={spec.documentType} onChange={(e) => setSpec({ ...spec, documentType: e.target.value })} />
          </div>
        </div>
        <SpecEditColumn
          className="flex min-h-0 flex-1 flex-col gap-2"
          sections={source.sections}
          indexes={indexes}
          spec={spec}
          onChange={setSpec}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showSuggestButton={false}
          onReassignTarget={setReassignId}
          infoSlot={
            <>
              {!canSaveSpec && (
                <p className="rounded bg-slate-100 p-2 text-[11px] text-slate-600">
                  다른 사용자가 만든 양식입니다. 스펙을 고쳐 이번 실행에 쓸 수 있지만, 양식 자체에는 저장되지 않습니다.
                </p>
              )}
              {reassignTarget && (
                <p className="flex items-center justify-between gap-2 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
                  <span>"{reassignTarget.label || reassignTarget.id}" 영역 재지정 — 왼쪽 문서에서 새 위치를 클릭/드래그하세요.</span>
                  <button type="button" className="shrink-0 underline" onClick={() => setReassignId(null)}>취소</button>
                </p>
              )}
              {detectNotes.length > 0 && (
                <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">문서 내 지침(MEMO): {detectNotes.join(' / ').slice(0, 200)}</p>
              )}
            </>
          }
        />
        {/* 계획 검토의 설명 입력에 뜰 예시 — 양식마다 달라야 하는 값이라 스펙이 소유한다.
            비워 두면 러너의 범용 기본 예시가 뜬다(입력칸이 비어 보이지 않게). */}
        <div className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-slate-500">
              설명 입력 예시 <span className="text-slate-400">— 계획 검토의 "어떤 문서를 만들지 설명해 주세요"에 표시(줄바꿈으로 여러 줄, 비우면 기본 예시)</span>
            </Label>
            {/* 이 양식에 맥락을 연결해 두면 계획 검토에서 기본 선택으로 들어온다.
                연결은 그 양식을 고칠 수 있는 사람만(서버 RLS가 정본) */}
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 text-[11px] text-blue-600 hover:underline"
              onClick={() => setContextOpen(true)}
            >
              <BookText className="h-3 w-3" />
              맥락 연결{specContextIds.length > 0 ? ` (${specContextIds.length})` : ''}
            </button>
          </div>
          <Textarea
            rows={3}
            className="resize-y text-[11px] leading-snug"
            value={spec.contextExample ?? ''}
            placeholder={PLAN_CONTEXT_PLACEHOLDER}
            onChange={(e) => setSpec({ ...spec, contextExample: e.target.value })}
          />
        </div>
        {/* 잔여물 검사는 **기능째 폐지했다**(입력칸 2026-09-02 → 검사 2026-09-03).
            바로 위 주석이 예고한 함정이 실제로 터졌다: 패턴이 자동 시드된 추측인데 지울
            화면이 없어, 라이브 양식의 정상 내용(`시스코`·`08:00~22:00`)이 패턴으로 남아
            맞는 문서를 최종 검증에서 fail 로 보고했다. 이제 `verifyDocument`가 읽지 않고
            `detectSpecDraft`가 채우지도 않는다(저장된 스펙의 값은 그대로 두되 무시). */}
        <div className="flex shrink-0 items-center justify-between">
          {/* 기본 양식이 지정된 노드에서 비생성자는 양식 선택 단계를 건너뛴다 — 되돌아갈 곳이 없다 */}
          {defaultTemplate && !isWorkOwner ? (
            <span className="text-[11px] text-slate-400">기본 양식: {defaultTemplate.name ?? templateName}</span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setStep('template')}>← 양식 선택</Button>
          )}
          <div className="flex items-center gap-2">
            {unconfirmed > 0 && <span className="text-[11px] text-amber-600">확정 필요 {unconfirmed}건</span>}
            <Button
              size="sm" variant="outline" disabled={busy}
              title="스펙 + 각 자리의 현재 내용 + 계획 스키마를 JSON 한 파일로 내려받습니다(외부 AI 에이전트용)"
              onClick={() => void downloadSpecBundle()}
            >
              <Download className="mr-1 h-3.5 w-3.5" />스펙 내보내기
            </Button>
            <Button size="sm" variant="outline" disabled={suggesting || busy} onClick={() => void handleSuggest()}>
              {suggesting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              AI 라벨 보완
            </Button>
            <Button size="sm" disabled={busy || unconfirmed > 0} onClick={() => void saveSpec()}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {canSaveSpec ? '스펙 저장 → 계획' : '계획 검토로 →'}
            </Button>
          </div>
        </div>
      </div>
    ) : step === 'plan' ? (
      // 계획 검토(2026-09-02 개편): ①AI 작성 카드(부각) → ②입력 폼(스펙 순서) → ③실행.
      // 종전에는 설명 입력이 폼 **아래** 회색 상자에 묻혀 "AI에게 무엇을 말할 수 있는지"가
      // 보이지 않았고, 사람 필드만 맨 위로 뽑혀 스펙 검수와 순서가 어긋났다.
      <div className="h-full min-h-0 space-y-3 overflow-y-auto pr-1">
        {planResult && planResult.knowledgeMissing.length > 0 && (
          <p className="rounded bg-red-50 p-2 text-[11px] text-red-600">필수 지식 소스 미해석: {planResult.knowledgeMissing.join(', ')}</p>
        )}
        {planResult && planResult.planErrors.length > 0 && (
          <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">{planResult.planErrors.join(' · ')}</p>
        )}

        {/* ── 헤더: 이 단계에서 실제로 할 수 있는 일을 그대로 적는다 ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">
              {submissionMode ? '제출할 내용 작성' : '계획 검토 · 수정'}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              각 칸을 <b className="font-semibold text-slate-600">직접 입력</b>하거나{' '}
              <b className="font-semibold text-blue-600">AI로 초안 작성</b>을 눌러 채울 수 있습니다.
              입력한 값은 왼쪽 문서에 바로 반영됩니다.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {previewBusy && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />반영 중
              </span>
            )}
            <button
              type="button"
              className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-red-500"
              title="모든 입력 칸을 비웁니다"
              onClick={() => void makePlan(false)}
            >
              <RotateCcw className="h-3 w-3" />입력 초기화
            </button>
            {/*
              문서 생성 메뉴는 양식 단계를 건너뛰고 여기서 시작하므로, **되돌아갈 길**이
              필요하다. 자동으로 잡은 자리가 틀렸거나 칸 이름을 고치고 싶을 때 쓴다.
              업무 흐름에서는 이미 양식 단계를 지나왔으므로 붙이지 않는다(중복 진입점).
            */}
            {docGenFlow && !submissionMode && spec && source && (
              <button
                type="button"
                className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-blue-600"
                title="문서에서 채울 자리와 칸 이름을 다시 확인합니다"
                onClick={() => setStep('spec')}
              >
                <ClipboardCheck className="h-3 w-3" />채울 자리 고치기
              </button>
            )}
            {submissionMode && loadedDoc && (
              <button
                type="button"
                className="text-[11px] text-slate-400 underline hover:text-slate-600"
                title="이전 제출본을 버리고 빈 양식에서 새로 씁니다"
                onClick={() => void restartSubmission()}
              >
                처음부터
              </button>
            )}
            {planResult && (
              <button
                type="button"
                className="text-[11px] text-blue-500 underline"
                onClick={() => {
                  if (!planJsonMode) setPlanJsonText(JSON.stringify(planResult.plan, null, 2));
                  else {
                    try { setPlanResult({ ...planResult, plan: JSON.parse(planJsonText) as Plan }); } catch { toast.error('JSON 파싱 실패'); return; }
                  }
                  setPlanJsonMode(!planJsonMode);
                }}
              >
                {planJsonMode ? '폼으로 보기' : 'JSON 직접 편집'}
              </button>
            )}
          </div>
        </div>

        {/* 매니저가 적은 제출 안내 — 담당자가 가장 먼저 읽어야 할 문장이라 맨 위에 둔다 */}
        {submissionMode && submission?.guide?.trim() && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <p className="text-[11px] font-bold text-amber-800">담당자 안내</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-amber-900">
              {submission.guide.trim()}
            </p>
          </div>
        )}

        {/* ── ① AI로 초안 작성 ── 이 단계의 주된 도구라 테두리·배경으로 가장 앞에 세운다 */}
        <section className="space-y-2.5 rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Wand2 className="h-3.5 w-3.5" />
            </span>
            <h4 className="text-xs font-bold text-slate-700">AI로 초안 작성</h4>
            <span className="text-[10px] text-slate-500">— 건너뛰고 직접 입력해도 됩니다</span>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-700">어떤 문서를 만들지 설명해 주세요</Label>
            <Textarea
              rows={4}
              className="resize-y bg-white text-xs leading-relaxed"
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              placeholder={contextPlaceholder}
            />
            <p className="text-[10px] leading-snug text-slate-500">
              대상·기간·예산·중점 내용처럼 <b>문서에 꼭 들어가야 할 것</b>을 편하게 적으면 됩니다.
              자세히 적을수록 결과가 정확해집니다.
            </p>
          </div>

          {/* 맥락 정보 — 스펙 검수와 **같은 방식**으로 버튼을 눌러 다이얼로그에서 고른다
              (2026-09-02 사용자 요청). 종전에는 여기 체크박스 목록을 통째로 폈는데, 맥락이
              100개를 넘으면(성취기준 118개) 이 카드가 목록에 잠식된다.
              선택은 **저장하지 않는다** — 실행마다 다른 값이라 스펙·실행에 남기면 다음
              사람이 남의 선택을 물려받는다. 양식에 연결된 맥락만 기본 선택으로 들어온다. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px] font-semibold text-slate-700">맥락 정보</Label>
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                onClick={() => setContextOpen(true)}
              >
                <BookText className="h-3 w-3" />
                맥락 연결{selectedContextIds.length > 0 ? ` (${selectedContextIds.length})` : ''}
              </button>
            </div>
            {missingResumed.length > 0 && (
              <p className="flex items-start gap-1 rounded bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-700">
                <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                <span>
                  불러온 실행에 쓰였던 맥락 {missingResumed.length}개가 삭제되어 빠졌습니다
                  ({missingResumed.map((r) => r.title).slice(0, 3).join(', ')}
                  {missingResumed.length > 3 ? ` 외 ${missingResumed.length - 3}개` : ''}).
                  <b>그때와 다른 결과가 나올 수 있습니다.</b>
                </span>
              </p>
            )}
            {/* 지금 있는 앞 단계 맥락 중 뺀 것만 센다 — 할 일을 옮기면 옛 id 가 남는다 */}
            {upstreamContexts.some((c) => excludedUpstreamIds.includes(c.id)) && (
              <button
                type="button"
                className="text-[10px] text-blue-600 hover:underline"
                onClick={() => setExcludedUpstreamIds([])}
              >
                뺀 앞 단계 맥락 {upstreamContexts.filter((c) => excludedUpstreamIds.includes(c.id)).length}개 되돌리기
              </button>
            )}
            {selectedContexts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 p-2 text-[10px] leading-snug text-slate-500">
                <b>맥락 연결</b>을 눌러 이번 생성에 함께 넘길 배경 설명을 고르세요.
                학교·교과 배경처럼 매번 반복해서 설명하게 되는 내용을 저장해 두면 다음부터 고르기만 하면 됩니다.
              </p>
            ) : (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-1.5">
                {selectedContexts.map((c) => {
                  const edited = contextOverrides[c.id] != null;
                  const expanded = expandedContextId === c.id;
                  return (
                    <div key={c.id} className="rounded border border-transparent px-1 py-0.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1 text-left"
                          onClick={() => setExpandedContextId(expanded ? null : c.id)}
                        >
                          <ChevronDown className={cn(
                            'h-3 w-3 shrink-0 text-slate-400 transition-transform',
                            expanded && 'rotate-180',
                          )} />
                          <span className="truncate text-[11px] font-medium text-slate-700" title={c.title}>
                            {c.title}
                          </span>
                          {c.category && (
                            <span className="shrink-0 rounded bg-indigo-50 px-1 text-[9px] text-indigo-600">
                              {c.category}
                            </span>
                          )}
                          {edited && (
                            <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] text-amber-700">수정됨</span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 text-[10px] text-slate-400 hover:text-rose-600"
                          title="이번 생성에서 빼기"
                          onClick={() => (isUpstreamContextId(c.id)
                            ? setExcludedUpstreamIds((prev) => [...prev, c.id])
                            : setSelectedContextIds((prev) => prev.filter((x) => x !== c.id)))}
                        >
                          빼기
                        </button>
                      </div>
                      {/* 펼쳤을 때만 **이번 생성에만** 고칠 수 있게 한다 —
                          라이브러리 원본은 그대로 두고 실행 한정으로 덮어쓴다 */}
                      {expanded && (
                        <div className="mt-1 pl-4">
                          <Textarea
                            rows={4}
                            className="resize-y bg-slate-50/70 text-[10px] leading-snug"
                            value={contextOverrides[c.id] ?? c.body}
                            onChange={(e) => setContextOverrides((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          />
                          <div className="mt-0.5 flex items-center justify-between">
                            <span className="text-[9px] text-slate-400">
                              여기서 고친 내용은 <b>이번 생성에만</b> 쓰이고 저장되지 않습니다.
                            </span>
                            {edited && (
                              <button
                                type="button"
                                className="text-[9px] text-slate-400 hover:text-slate-700"
                                onClick={() => setContextOverrides((prev) => {
                                  const next = { ...prev };
                                  delete next[c.id];
                                  return next;
                                })}
                              >
                                원래대로
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 작성 방식 2택 — 기본은 '알려준 내용만'(학교 공문서라 지어낸 사실이 그대로 나간다) */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-700">AI 작성 방식</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setFillMode('strict')}
                aria-pressed={fillMode === 'strict'}
                className={cn(
                  'rounded-lg border p-2 text-left transition-colors',
                  fillMode === 'strict'
                    ? 'border-blue-400 bg-white ring-1 ring-blue-300'
                    : 'border-slate-200 bg-white/50 hover:bg-white',
                )}
              >
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />알려준 내용만
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                  위 설명과 자료에 없는 사실은 만들지 않습니다. 빈 칸이 남을 수 있습니다.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFillMode('generate')}
                aria-pressed={fillMode === 'generate'}
                className={cn(
                  'rounded-lg border p-2 text-left transition-colors',
                  fillMode === 'generate'
                    ? 'border-blue-400 bg-white ring-1 ring-blue-300'
                    : 'border-slate-200 bg-white/50 hover:bg-white',
                )}
              >
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />설명 기반 생성
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                  위 설명을 바탕으로 빈 곳을 채웁니다. 설명에 없는 부분도 문서에 맞게 만듭니다.
                </span>
              </button>
            </div>
            {/* 재검증용 토글 — 기본 끔. 원본 내용이 결과로 새는지 luna 에서 다시 확인하기 위한 것 */}
            <label className="mt-1 flex cursor-pointer items-start gap-1.5 text-[10px] leading-snug text-slate-600">
              <input
                type="checkbox" className="mt-0.5"
                checked={useRegionExamples}
                onChange={(e) => setUseRegionExamples(e.target.checked)}
              />
              <span>
                <b>원본 문서의 표기 형식 참고</b> — 그 자리에 원래 적혀 있던 글을 AI에게 함께 보여
                날짜·단위·분량 표기를 맞춥니다. 내용이 섞여 나올 수 있어 기본은 꺼져 있습니다.
              </span>
            </label>
            {fillMode === 'generate' && (
              <p className="flex items-start gap-1 rounded bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-700">
                <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                <span>AI가 지어낸 내용이 섞입니다. <b>내보내기 전에 내용을 반드시 확인하세요.</b></span>
              </p>
            )}
          </div>

          {/* 아래에서 고른 사람이 생성에 함께 전달된다는 사실을 버튼 옆에서 드러낸다.
              이름을 그대로 늘어놓으면 태그로 30명을 고른 순간 문단이 되므로, 목록 쪽과 같은
              규칙(10명 이하 인라인 / 초과 요약+hover 오버레이)을 쓰는 공용 NamePreview에 맡긴다 */}
          {chosenPeople.length > 0 && (
            <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-[11px] text-emerald-700">
              <p className="flex items-center gap-1 font-medium">
                <Users className="h-3 w-3" />
                아래에서 고른 사람이 함께 전달됩니다
              </p>
              {chosenPeople.map((p) => (
                <div key={p.label} className="flex min-w-0 items-baseline gap-1.5 pl-4">
                  <span className="shrink-0 text-emerald-600/70">{p.label}</span>
                  <NamePreview
                    names={p.names}
                    side="top"
                    title={p.label}
                    className="min-w-0 text-emerald-800"
                  />
                </div>
              ))}
            </div>
          )}

          <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" disabled={busy} onClick={() => void makePlan(true)}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
            {busy && planProgress
              ? `초안 작성 중 · AI 호출 ${planProgress.done}/${planProgress.total}`
              : 'AI로 초안 작성'}
          </Button>
          <p className="text-[10px] leading-snug text-slate-500">
            이미 입력해 둔 칸은 그대로 두고 <b>빈 칸만</b> 채웁니다. 결과는 아래에서 고칠 수 있습니다.
          </p>
          {busy && planProgress && (
            /* 분자·분모의 의미를 적어 둔다 — 표가 크면 한 번에 못 보내 여러 번 나눠 부르고,
               나누는 개수는 진행하면서 정해지므로 분모가 늘 수 있다. 설명이 없으면
               "숫자가 거꾸로 간다"로 보인다. */
            <p className="text-[10px] leading-snug text-slate-400">
              큰 표는 한 번에 보낼 수 없어 <b>여러 번 나눠</b> 요청합니다.
              {' '}{planProgress.done}번째까지 끝났고 지금까지 파악된 전체는 약 {planProgress.total}번입니다
              (진행하면서 늘어날 수 있습니다).
            </p>
          )}
        </section>

        {/* ── ② 입력 폼 ── 스펙 검수에서 본 타깃 순서 그대로(사람 필드도 제자리에) */}
        {planResult && (
          <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-600 text-white">
                  <Pencil className="h-3.5 w-3.5" />
                </span>
                <h4 className="truncate text-xs font-bold text-slate-700">문서에 들어갈 내용</h4>
              </div>
              {!planJsonMode && (
                missingInputs.length > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    {missingInputs.length}칸 남음
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />모두 입력됨
                  </span>
                )
              )}
            </div>
            {planJsonMode ? (
              <Textarea rows={12} className="font-mono text-xs" value={planJsonText} onChange={(e) => setPlanJsonText(e.target.value)} />
            ) : (
              <PlanForm
                schema={planResult.planSchema}
                plan={planResult.plan}
                onChange={(plan) => setPlanResult({ ...planResult, plan })}
              />
            )}
            <AutoDerivedNote spec={spec} />
          </section>
        )}

        {presetValues && (
          <label className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-700">
            <input type="checkbox" checked={reuseProse} onChange={(e) => setReuseProse(e.target.checked)} />
            저장된 서술(prose) 값 재사용 — AI 재생성 없이 저장 시점과 동일한 문서로 재구성
          </label>
        )}

        {/* ── ③ 실행 ── 못 누르는 이유를 버튼 옆에 그대로 적는다(비활성만 두면 원인을 못 찾는다) */}
        <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          {missingInputs.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                아직 채우지 않은 칸 {missingInputs.length}개 — 모두 채우면 문서를 만들 수 있습니다
              </p>
              <ul className="mt-1 space-y-0.5 pl-5">
                {missingInputs.slice(0, 8).map((m) => (
                  <li key={m.key} className="list-disc text-[10px] leading-snug text-amber-700">
                    {describeMissingInput(m)}
                  </li>
                ))}
                {missingInputs.length > 8 && (
                  <li className="list-disc text-[10px] text-amber-600">외 {missingInputs.length - 8}개</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('spec')}>← 스펙 검수</Button>
            <Button
              size="sm"
              className={cn(canExecute && 'bg-blue-600 hover:bg-blue-700')}
              disabled={busy || !canExecute}
              title={canExecute ? undefined : '필요한 칸을 모두 채우면 실행할 수 있습니다'}
              onClick={() => void execute()}
            >
              {busy
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : canExecute ? <Play className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
              문서 생성·검증 실행
            </Button>
          </div>
        </section>
      </div>
    ) : (
      // final(2026-09-02): 헤더(제목+되돌아가기) → 검증 요약 → ①내려받기(주행동)
      // → ②보관(부차) → ③이력(접힘). 종전에는 다섯 덩어리가 **같은 무게로 평평하게** 놓여
      // 있었고, 이름이 비슷한 두 저장(다운로드 / 완성본 저장)의 차이를 회색 11px 문단
      // 하나가 설명하고 있었다 — 아무도 읽지 않는 자리다. 설명은 각 행동 바로 밑으로.
      <div className="h-full min-h-0 space-y-2.5 overflow-y-auto pr-1">
        {/* 되돌아가기를 제목 줄 오른쪽에 붙인다 — 카드 사이에 홀로 떠 있으면 위계가 흐려진다 */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700">
              {submissionMode ? '제출할 문서가 준비되었습니다'
                : runRecorded ? '문서가 완성되었습니다' : '불러온 문서를 다시 만들었습니다'}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {submissionMode ? (
                <>
                  왼쪽에서 내용을 확인하고 아래 <b className="font-semibold text-blue-600">제출하기</b>를 누르세요.
                  {' '}제출되는 것은 <b className="font-semibold text-slate-600">입력한 값</b>이며,
                  {' '}편집기에서 직접 고친 서식은 포함되지 않습니다.
                </>
              ) : (
                <>
                  왼쪽 편집기에서 값·서식을 직접 고칠 수 있습니다. 고친 내용은
                  {' '}<b className="font-semibold text-slate-600">내려받는 파일에만</b> 반영됩니다.
                </>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 text-slate-500" onClick={() => setStep('plan')}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />계획 수정
          </Button>
        </div>

        <CheckSummary checks={runChecks} />

        {/* ── ① 주행동 ── 제출 모드에서는 "제출"이 이 단계의 목적이다 */}
        {submissionMode ? (
          <section className="space-y-1.5 rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3 shadow-sm">
            <Input
              className="h-8 text-xs" placeholder="문서 제목"
              value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
            />
            <Button
              size="sm" className="h-9 w-full bg-blue-600 text-sm hover:bg-blue-700"
              disabled={busy || !lastFill}
              onClick={() => void saveDocument()}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              {loadedDoc ? `수정해서 다시 제출 (v${loadedDoc.version + 1})` : '이 문서 제출하기'}
            </Button>
            <p className="text-[10px] leading-snug text-slate-500">
              파일이 아니라 <b>값</b>으로 제출됩니다 — 나중에 언제든 같은 문서로 다시 열어보거나
              내려받을 수 있고, 책임자는 제출 내용을 표로 모아 볼 수 있습니다.
            </p>
          </section>
        ) : (
          <section className="space-y-1.5 rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3 shadow-sm">
            <Button size="sm" className="h-9 w-full bg-blue-600 text-sm hover:bg-blue-700" onClick={() => void downloadEdited()}>
              <Download className="mr-1.5 h-4 w-4" />문서 내려받기
            </Button>
            <p className="text-[10px] leading-snug text-slate-500">
              지금 왼쪽에 보이는 그대로 내 컴퓨터에 저장합니다(직접 고친 서식 포함).
            </p>
          </section>
        )}
        {submissionMode && (
          <Button size="sm" variant="outline" className="w-full" onClick={() => void downloadEdited()}>
            <Download className="mr-1 h-3.5 w-3.5" />내려받기(제출과 별개)
          </Button>
        )}

        {/* ── ② 부차: 보관 ── 내려받기와 **다른 일**이라는 것이 이름·설명에서 드러나야 한다.
            아이콘 칩 같은 장식은 두지 않는다 — 주행동과 무게를 겨루면 위계가 사라진다 */}
        {!submissionMode && lastFill && selected && (
          <section className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <Save className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {loadedDoc ? `새 버전으로 보관 (v${loadedDoc.version + 1})` : '이 문서 보관하기'}
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              다음에 같은 문서를 만들 때 불러 쓸 수 있게 <b>입력한 값</b>을 저장합니다.
              직접 고친 서식은 저장되지 않습니다.
            </p>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 min-w-0 flex-1 text-xs" placeholder="문서 제목"
                value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
              />
              <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={busy} onClick={() => void saveDocument()}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}보관
              </Button>
            </div>
          </section>
        )}

        {/* ── ③ 이력 ── 접힘이 기본. 지우지 않는 이유는 "이어서 진행" 진입점이기 때문이다.
            **제출 모드에는 없다** — RUN 을 기록하지 않으므로 보여줄 이력 자체가 없다 */}
        {!submissionMode && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <ClipboardCheck className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-700">지난 실행 기록</span>
            {runCount > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{runCount}</span>
            )}
            <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform', historyOpen && 'rotate-180')} />
          </button>
          {historyOpen && (
            <div className="space-y-2 border-t border-slate-200 p-3">
              <p className="text-[10px] leading-snug text-slate-400">
                {runRecorded
                  ? '이번 실행은 검수 대기로 기록되었습니다. 아래에서 승인·보완을 결정하거나, 지난 실행을 불러올 수 있습니다.'
                  : '불러오기는 기록을 남기지 않습니다. 아래에서 다른 실행을 불러오거나 검수를 결정할 수 있습니다.'}
              </p>
              <ActionRunHistory action={action} onResume={(run) => void resumeFromRun(run)} />
            </div>
          )}
        </section>
        )}
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <StepHeader step={step} canGo={canGo} onGo={goStep} compact={submissionMode} />
      <SplitPane left={docPane} right={stepPane} />
      {/* 맥락 라이브러리 — 러너가 이미 다이얼로그 안이라 **2중 Dialog**다.
          편집까지 또 열지 않도록 그 안에서 목록↔편집을 모드로 전환한다(그쪽 주석 참조) */}
      <ContextLibraryDialog
        open={contextOpen}
        onOpenChange={setContextOpen}
        templateId={selected?.id ?? null}
        canEditTemplate={canSaveSpec}
        // 계획 검토에서 열면 **이번 생성 선택** 모드가 된다(스펙 검수에서는 양식 연결).
        // 두 축을 한 다이얼로그가 겸하되 체크박스는 따로다 — 합치면 "다음에도 쓰려고
        // 연결한 것"과 "이번만 고른 것"을 구분할 수 없다.
        {...(step === 'plan'
          ? { selectedIds: selectedContextIds, onSelectedIdsChange: setSelectedContextIds }
          : {})}
      />
    </div>
  );
}

// ── 좌우 리사이즈 스플리터(우측 패널 폭 px, localStorage 유지) ──
const SPLIT_KEY = 'spec-runner-right-width';
function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const [rightW, setRightW] = useState(() => {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return Number.isFinite(v) && v >= 340 && v <= 900 ? v : 480;
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const w = Math.min(900, Math.max(340, box.right - e.clientX));
      setRightW(w);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setRightW((w) => {
        localStorage.setItem(SPLIT_KEY, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-300 shadow-sm">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        className="mx-1 w-1.5 shrink-0 cursor-col-resize rounded bg-slate-200 transition-colors hover:bg-blue-300"
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
      />
      <div style={{ width: rightW }} className="min-h-0 shrink-0">{right}</div>
    </div>
  );
}

// 계획 입력이 필요 없는 타깃 안내 — "스펙 검수의 필수 항목이 계획에 안 보인다"는 혼동 방지.
// 값이 수식·원문·지식에서 나오는 타깃은 실행 시 자동으로 채워진다.
/**
 * 검증 결과 요약 — **전부 통과면 한 줄, 문제가 있을 때만 목록**(2026-09-02).
 *
 * 종전에는 결과가 항상 전개돼, 이상이 없는 흔한 경우에도 8~10줄이 주행동(내려받기) 위를
 * 차지했다. 통과 항목은 "확인했다"는 사실만 전하면 되고 개별 문구는 읽히지 않는다.
 *
 * **실패·경고가 하나라도 있으면 접지 않는다** — 접어 두면 사용자가 못 보고 내려받는다.
 * 통과만 있을 때도 펼쳐 볼 수는 있게 남긴다(무엇을 검사했는지 확인하려는 사람용).
 */
function CheckSummary({ checks }: { checks: CheckResult[] | null }) {
  const bad = useMemo(
    () => (checks ?? []).filter((c) => c.status !== 'pass'),
    [checks],
  );
  const [open, setOpen] = useState(false);
  if (!checks || checks.length === 0) return null;

  // 문제가 있으면 항상 전개 — 사용자의 접힘 선택보다 우선한다
  const expanded = bad.length > 0 || open;
  const shown = bad.length > 0 && !open ? bad : checks;
  const hasFail = bad.some((c) => c.status === 'fail');

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border',
        hasFail ? 'border-red-200 bg-red-50/50'
          : bad.length > 0 ? 'border-amber-200 bg-amber-50/50'
            : 'border-emerald-200 bg-emerald-50/50',
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        {bad.length === 0
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          : <XCircle className={cn('h-4 w-4 shrink-0', hasFail ? 'text-red-500' : 'text-amber-500')} />}
        <span className="text-xs font-semibold text-slate-700">
          {bad.length === 0
            ? `검증 ${checks.length}건 모두 통과`
            : `검증 ${checks.length}건 중 확인 필요 ${bad.length}건`}
        </span>
        <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <ul className="space-y-1 border-t border-inherit px-3 py-2">
          {shown.map((c) => (
            <li key={c.key} className="flex items-start gap-1.5 text-xs">
              {c.status === 'fail' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                : <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${c.status === 'warn' ? 'text-amber-500' : 'text-emerald-500'}`} />}
              <span className="min-w-0 text-slate-600"><strong className="font-medium">{c.key}</strong> — {c.message}</span>
            </li>
          ))}
          {bad.length > 0 && !open && bad.length < checks.length && (
            <li className="text-[10px] text-slate-400">통과한 {checks.length - bad.length}건은 접혀 있습니다 — 위를 눌러 전체를 봅니다.</li>
          )}
        </ul>
      )}
    </section>
  );
}

function AutoDerivedNote({ spec }: { spec: WorkSpec | null }) {
  if (!spec) return null;
  const auto = spec.targets.flatMap((t) => {
    const name = t.label || t.id;
    if (t.kind === 'computed') return [`${name}(자동 계산)`];
    if (t.kind === 'keep') return [`${name}(원문 유지)`];
    if (t.kind === 'scalar' && (t as { source?: string }).source && !/(^|[^A-Za-z0-9_])plan\./.test((t as { source?: string }).source!)) {
      return [`${name}(지식 파생)`];
    }
    return [];
  });
  if (!auto.length) return null;
  return (
    <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-500">
      계획 입력 없이 실행 시 자동으로 채워지는 타깃: {auto.join(' · ')}
    </p>
  );
}

function StepHeader({ step, canGo, onGo, compact }: {
  step: Step; canGo: (s: Step) => boolean; onGo: (s: Step) => void;
  /** 제출 모드 — 양식·스펙은 매니저가 이미 확정했으므로 담당자에게 보이지 않는다 */
  compact?: boolean;
}) {
  const steps: { key: Step; label: string }[] = compact ? [
    { key: 'plan', label: '① 내용 작성' },
    { key: 'final', label: '② 확인 후 제출' },
  ] : [
    { key: 'template', label: '① 양식' },
    { key: 'spec', label: '② 스펙 검수' },
    { key: 'plan', label: '③ 계획 검토' },
    { key: 'final', label: '④ 최종 수정·결과' },
  ];
  return (
    <div className="flex shrink-0 gap-1 text-[11px]">
      {steps.map((s) => {
        const enabled = canGo(s.key);
        return (
          <button
            key={s.key}
            type="button"
            disabled={!enabled}
            onClick={() => onGo(s.key)}
            className={`rounded px-2 py-0.5 transition-colors ${
              s.key === step
                ? 'bg-blue-600 text-white'
                : enabled
                  ? 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                  : 'bg-slate-100 text-slate-300'
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ── plan: 스키마 기반 폼 ──
// 표시 안전망: 정규화·검증을 뚫고 온 객체 값은 "[object Object]" 대신 JSON으로 보여 수동 교정 가능하게
function displayValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** 한 번 클릭으로 추가할 수 있는 행 수 상한 — 스펙에 maxItems가 없을 때의 오입력 안전망 */
const ADD_ROWS_AT_ONCE_MAX = 100;

/**
 * 이름 필드 — 학교 명단(교직원/학생)에서 골라 **이름 문자열**로 저장한다(2026-08-22 사용자 요청).
 *
 * plan에는 이름이 들어가고 선택기는 **리소스 id**를 다루므로 양방향 변환이 필요하다.
 * id가 아니라 이름을 저장하는 이유: ①문서에 실제로 찍히는 값이 이름이고 ②완성 문서를
 * 나중에 값으로 재구성할 때 리소스가 삭제·변경돼도 같은 문서가 나와야 하며 ③AI 계획·서술이
 * 그 이름을 맥락으로 읽는다(형제 값은 문자열만 실린다).
 *
 * 목록에서 못 찾은 이름(퇴직·전출·과거 값)은 값 그대로 흘려보낸다 — 선택기가 앰버 배지로
 * 보여주고 제거도 되므로 조용히 사라지지 않는다.
 */
function PersonPlanField({ field, value, onChange }: {
  field: PlanFieldSchema;
  value: unknown;
  onChange: (joined: string) => void;
}) {
  const role = field.person === 'student' ? 'student' : 'teacher';
  // SearchableMultiSelect 내부와 같은 쿼리 키라 요청이 늘지 않는다(TanStack 캐시 공유)
  const { items } = useResourceSelect({
    resourceType: role === 'teacher' ? ['teacher', 'staff'] : ['student'],
    enabled: true,
  });
  const names = useMemo(() => splitPersonNames(value), [value]);
  const { nameToValue, valueToName } = useMemo(() => {
    const n2v = new Map<string, string>();
    const v2n = new Map<string, string>();
    for (const it of items) {
      v2n.set(it.value, it.label);
      // 동명이인은 첫 항목으로 해석 — 문서에 찍히는 이름이 같아 표시상 차이가 없다
      if (!n2v.has(it.label)) n2v.set(it.label, it.value);
    }
    return { nameToValue: n2v, valueToName: v2n };
  }, [items]);
  const selectedValues = useMemo(
    () => names.map((n) => nameToValue.get(n) ?? n),
    [names, nameToValue],
  );

  return (
    <div className="min-w-0">
      <SearchableMultiSelect
        selectedValues={selectedValues}
        onSelectionChange={(vals) =>
          onChange(joinPersonNames(vals.map((v) => valueToName.get(v) ?? v)))
        }
        filterByTeacher={role === 'teacher'}
        filterByStudent={role === 'student'}
        // 태그(부장·담임 등)·학년/반 단위로도 고를 수 있게 한다(2026-08-22 사용자 요청).
        // 태그는 교직원 전용 데이터라 교사 모드에서만 켠다 — 학생의 대응물이 학년·반이다.
        includeTagOptions={role === 'teacher'}
        enableTagSearch={role === 'teacher'}
        enableClassSearch={role === 'student'}
        placeholder={role === 'teacher' ? '교직원 이름 선택...' : '학생 이름 선택...'}
        searchPlaceholder={role === 'teacher' ? '이름·태그 검색 (쉼표·셀 붙여넣기)' : '이름·학번·반 검색'}
      />
    </div>
  );
}

/**
 * 반복 행 표 — 우측 패널 인라인과 **전체화면 모달이 같은 컴포넌트를 쓴다**.
 *
 * 두 벌로 적으면 한쪽만 고치는 사고가 난다(열 지우개·서술 열 처리·숫자 파싱이 전부
 * 어긋날 수 있다). 바깥 가로 스크롤 컨테이너는 호출부가 씌운다 — 전체화면에서는
 * 넉넉해서 스크롤이 거의 필요 없고, 인라인에서는 필수다.
 */
function RowTable({ rows, cols, onRows }: {
  rows: Record<string, unknown>[];
  cols: { key: string; type?: string; note?: string; prose?: boolean }[];
  onRows: (next: Record<string, unknown>[]) => void;
}) {
  return (
    <table className="min-w-full text-[11px]">
      <thead><tr>{cols.map((c) => (
        <th key={c.key} className="whitespace-nowrap px-1 text-left align-bottom font-medium text-slate-400" title={c.key}>
          <span className="inline-flex items-center gap-1">
            {c.note ?? c.key}
            {rows.length > 0 && (
              <button
                type="button"
                title={`${c.note ?? c.key} 열 전체 비우기`}
                className="text-slate-300 transition-colors hover:text-red-500"
                onClick={() => onRows(rows.map((r) => ({ ...r, [c.key]: c.type === 'number' ? 0 : '' })))}
              >
                <Eraser className="h-3 w-3" />
              </button>
            )}
          </span>
        </th>
      ))}<th /></tr></thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {cols.map((c) => (
              <td key={c.key} className="px-1 py-0.5 align-top">
                {/* 서술 열은 2~3문장이라 한 줄 입력으론 검토가 불가능하다 */}
                {c.prose ? (
                  <Textarea
                    rows={3}
                    className="min-w-[240px] resize-y text-[11px] leading-snug"
                    value={displayValue(row[c.key])}
                    onChange={(e) => onRows(rows.map((r, k) => (k === ri ? { ...r, [c.key]: e.target.value } : r)))}
                  />
                ) : (
                  // 최소 폭 보장 — 서술 열 옆에서 폭 0으로 눌려 값이 안 보이던 문제
                  <Input
                    className={`h-7 text-[11px] ${c.type === 'number' ? 'min-w-[64px]' : 'min-w-[110px]'}`}
                    value={displayValue(row[c.key])}
                    onChange={(e) => {
                      const nv = c.type === 'number' ? Number(e.target.value.replace(/[,\s]/g, '')) || 0 : e.target.value;
                      onRows(rows.map((r, k) => (k === ri ? { ...r, [c.key]: nv } : r)));
                    }}
                  />
                )}
              </td>
            ))}
            <td>
              <Button
                size="icon" variant="ghost" className="h-6 w-6 text-slate-400"
                title="이 행 삭제"
                onClick={() => onRows(rows.filter((_, k) => k !== ri))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlanForm({ schema, plan, onChange }: { schema: PlanFieldSchema[]; plan: Plan; onChange: (p: Plan) => void }) {
  const set = (key: string, value: unknown) => onChange({ ...plan, [key]: value });
  // 배열 필드별 "한 번에 추가할 행 수". 문자열로 들고 있어야 입력 중 빈 칸이 0으로 튀지 않는다.
  const [addCounts, setAddCounts] = useState<Record<string, string>>({});
  /** 전체화면으로 편집 중인 배열 필드 키 — 넓은 표를 우측 패널 폭에서 해방시킨다 */
  const [bigEditKey, setBigEditKey] = useState<string | null>(null);
  const bigField = bigEditKey ? schema.find((f) => f.key === bigEditKey) : null;
  const bigCols = bigField?.itemFields?.length ? bigField.itemFields : [{ key: 'value', type: 'unknown' as const }];
  const bigRows = Array.isArray(plan[bigEditKey ?? '']) ? (plan[bigEditKey!] as Record<string, unknown>[]) : [];
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2">
      {schema.map((f) => {
        const v = plan[f.key];
        if (f.type === 'array') {
          const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
          const cols = f.itemFields?.length ? f.itemFields : [{ key: 'value', type: 'unknown' as const }];
          const typed = Number.parseInt(addCounts[f.key] ?? '', 10);
          const want = Number.isFinite(typed) && typed > 0 ? typed : 1;
          // 상한 초과분은 채움에서 조용히 잘리므로 여기서 막는다
          const { room, count: addCount } = rowAddCapacity(f, rows.length, want, ADD_ROWS_AT_ONCE_MAX);
          const addRows = () => {
            if (addCount < 1) return;
            set(f.key, [...rows, ...Array.from({ length: addCount }, () => blankPlanRow(cols))]);
          };
          return (
            <div key={f.key}>
              <Label className="text-[11px] text-slate-600">
                {f.label ?? f.key}
                {f.optional ? <span className="text-slate-400"> (선택)</span> : null}
                <span className="ml-1 font-mono text-[10px] text-slate-400">{f.key}</span>
                {f.note ? <span className="text-slate-400"> — {f.note}</span> : ''}
              </Label>
              {/* 넓은 표는 **전체화면 모달**에서 고친다(2026-09-02 사용자 요청).
                  우측 패널 기본 폭이 480px 인데 실제 양식에 29열짜리 표(수행평가 세부기준)와
                  8열짜리가 있어 가로 스크롤이 필연이다. 세로로 길어지는 것은 괜찮지만 가로로
                  오가는 것은 입력을 방해한다.
                  **새 창(window.open)이 아닌 이유**: 이 폼의 값은 React state 이고 800ms
                  디바운스로 좌측 문서에 라이브 반영된다. 새 창으로 빼면 그 연결이 끊겨
                  postMessage 브리지를 만들어야 하는데, 얻는 것(가로 폭)은 전체화면 모달로도
                  같다. 팝업 차단도 없다. */}
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">{rows.length}행 · {cols.length}열</span>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                  onClick={() => setBigEditKey(f.key)}
                >
                  <Maximize2 className="h-3 w-3" />크게 편집
                </button>
              </div>
              {/* min-w-full(w-full 아님): 서술 열의 최소 폭 때문에 다른 열이 0에 가깝게
                  눌리는 대신 표가 컨테이너를 넘어 가로 스크롤된다 */}
              <div className="overflow-x-auto">
                <RowTable rows={rows} cols={cols} onRows={(next) => set(f.key, next)} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, room)}
                  disabled={room === 0}
                  className="h-6 w-14 px-1 text-center text-[11px]"
                  title="한 번에 추가할 행 수"
                  value={addCounts[f.key] ?? '1'}
                  onChange={(e) => setAddCounts((s) => ({ ...s, [f.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    addRows();
                  }}
                />
                {/* 버튼 라벨이 실제로 추가될 개수를 그대로 말한다 — 입력칸과 따로 놀지 않도록 */}
                <Button
                  size="sm" variant="outline" className="h-6 text-[10px]"
                  disabled={room === 0}
                  onClick={addRows}
                >
                  {addCount > 1 ? `${addCount}행 추가` : '행 추가'}
                </Button>
                <span className="text-[10px] text-slate-400">
                  현재 {rows.length}행
                  {f.minItems != null ? ` · 최소 ${f.minItems}` : ''}
                  {f.maxItems != null ? ` · 최대 ${f.maxItems}` : ''}
                </span>
                {room === 0 && (
                  <span className="text-[10px] text-amber-600">상한에 도달해 더 추가할 수 없습니다.</span>
                )}
                {room > 0 && want > addCount && (
                  <span className="text-[10px] text-amber-600">{addCount}행까지만 추가할 수 있습니다.</span>
                )}
                {f.minItems != null && rows.length < f.minItems && (
                  <span className="text-[10px] text-amber-600">{f.minItems - rows.length}행 더 필요합니다.</span>
                )}
              </div>
            </div>
          );
        }
        // 이름은 자유 입력이 아니라 학교 명단에서 고른다(오타·없는 사람 방지)
        if (f.person) {
          return (
            <div key={f.key} className="grid grid-cols-[200px_1fr] items-start gap-2">
              <Label className="truncate pt-1.5 text-[11px] text-slate-600" title={`${f.key}${f.note ? ` — ${f.note}` : ''}`}>
                {f.label ?? f.key}
                <span className="ml-1 font-mono text-[10px] text-slate-400">{f.key}</span>
              </Label>
              <PersonPlanField field={f} value={v} onChange={(joined) => set(f.key, joined)} />
            </div>
          );
        }
        // 서술 본문은 여러 문단이 들어오므로 폭 전체를 쓰는 textarea로(2026-07-27)
        if (f.prose) {
          return (
            <div key={f.key}>
              <Label className="text-[11px] text-slate-600" title={f.key}>
                {f.label ?? f.key}
                <span className="ml-1 font-mono text-[10px] text-slate-400">{f.key}</span>
                {f.note ? <span className="text-slate-400"> — {f.note}</span> : null}
              </Label>
              <Textarea
                rows={Math.min(12, Math.max(4, displayValue(v).split('\n').length + 1))}
                className="resize-y text-[11px] leading-snug"
                value={displayValue(v)}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          );
        }
        return (
          <div key={f.key} className="grid grid-cols-[200px_1fr] items-center gap-2">
            <Label className="truncate text-[11px] text-slate-600" title={`${f.key}${f.note ? ` — ${f.note}` : ''}`}>
              {f.label ?? f.key}
              {f.optional ? <span className="text-slate-400"> (선택)</span> : null}
              {f.label ? <span className="ml-1 font-mono text-[10px] text-slate-400">{f.key}</span> : null}
            </Label>
            <Input
              className="h-7 text-[11px]"
              value={displayValue(v)}
              onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value.replace(/[,\s]/g, '')) || 0 : e.target.value)}
            />
          </div>
        );
      })}
      {schema.length === 0 && <p className="text-[11px] text-slate-400">이 스펙은 plan 입력이 필요 없습니다(모든 타깃이 지식/계산 기반).</p>}

      {/* 전체화면 표 편집 — 우측 패널(기본 480px)로는 29열짜리 표를 다룰 수 없다.
          같은 `RowTable`을 넓은 자리에 그릴 뿐이라 값은 그대로 공유된다(별도 상태 없음).
          러너가 이미 다이얼로그 안이라 **2중 Dialog**다 — 맥락 라이브러리와 같은 수준이고,
          여기서는 편집 중 미저장 개념이 없다(입력이 곧 반영). 그래서 ESC·바깥 클릭을
          막지 않는다 — 닫아도 잃는 것이 없다. */}
      <Dialog open={!!bigEditKey} onOpenChange={(o) => !o && setBigEditKey(null)}>
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <DialogTitle className="min-w-0 truncate text-sm font-bold text-slate-700">
              {bigField?.label ?? bigEditKey}
            </DialogTitle>
            <span className="shrink-0 text-[11px] text-slate-400">
              {bigRows.length}행 · {bigCols.length}열
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-400">
              여기서 고친 값은 바로 반영됩니다(따로 저장할 필요 없음).
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {bigEditKey && (
              <RowTable
                rows={bigRows}
                cols={bigCols}
                onRows={(next) => set(bigEditKey, next)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
